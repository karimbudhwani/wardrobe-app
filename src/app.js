const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { openDb } = require('./db');
const { seedUser } = require('./seed');
const { EVENTS, findEvent } = require('./events');
const { getWeather } = require('./weather');
const { suggestOutfits } = require('./recommend');
const ai = require('./ai');

const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const shapeItem = i => ({ ...i, svg: undefined, seasons: parse(i.seasons, []), bbox: parse(i.bbox, null), image: `/api/items/${i.id}/image`, modest: !!i.modest, waterproof: !!i.waterproof });

async function createApp(opts = {}) {
  const dataDir = opts.dataDir || process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const uploads = path.join(dataDir, 'uploads');
  fs.mkdirSync(uploads, { recursive: true });
  const db = await openDb(opts.dbFile === undefined ? path.join(dataDir, 'wardrobe.db') : opts.dbFile);
  const fetchImpl = opts.fetchImpl || globalThis.fetch;

  // demo account
  if (!db.get('SELECT id FROM users WHERE email=?', ['demo@wardrobe.app'])) {
    const id = db.run('INSERT INTO users(email,password_hash,name) VALUES(?,?,?)', ['demo@wardrobe.app', bcrypt.hashSync('demo1234', 10), 'Demo']);
    seedUser(db, id); db.save();
  }

  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'data:', 'blob:'], 'script-src': ["'self'"] } } }));
  app.use(express.json({ limit: '1mb' }));
  app.use(session({
    name: 'wsid', secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'), resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === '1', maxAge: 1000 * 60 * 60 * 24 * 14 },
  }));
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: opts.authLimit || 50 });
  const upload = multer({
    storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 20 },
    fileFilter: (_req, f, cb) => cb(null, /^image\/(jpeg|png|webp|heic|heif)$/.test(f.mimetype)),
  });
  const auth = (req, res, next) => (req.session.uid ? next() : res.status(401).json({ error: 'Not signed in' }));
  const savePhoto = (uid, kind, file) => {
    const dir = path.join(uploads, String(uid)); fs.mkdirSync(dir, { recursive: true });
    const name = crypto.randomBytes(16).toString('hex') + (file.mime === 'image/svg+xml' ? '.svg' : '');
    fs.writeFileSync(path.join(dir, name), file.buffer);
    return db.run('INSERT INTO photos(user_id,kind,file,mime) VALUES(?,?,?,?)', [uid, kind, name, file.mime]);
  };
  const readPhoto = (uid, id) => {
    const p = db.get('SELECT * FROM photos WHERE id=? AND user_id=?', [id, uid]);
    if (!p) return null;
    return { ...p, buffer: fs.readFileSync(path.join(uploads, String(uid), p.file)) };
  };

  // ---- auth
  app.post('/api/auth/register', authLimiter, (req, res) => {
    const { email, password, name, seed = true } = req.body || {};
    if (!/^\S+@\S+\.\S+$/.test(email || '') || (password || '').length < 8) return res.status(400).json({ error: 'Valid email and 8+ character password required' });
    if (db.get('SELECT id FROM users WHERE email=?', [email.toLowerCase()])) return res.status(409).json({ error: 'Email already registered' });
    const id = db.run('INSERT INTO users(email,password_hash,name) VALUES(?,?,?)', [email.toLowerCase(), bcrypt.hashSync(password, 10), name || email.split('@')[0]]);
    if (seed) { seedUser(db, id); db.save(); }
    req.session.regenerate(() => { req.session.uid = id; res.json({ id, email: email.toLowerCase() }); });
  });
  app.post('/api/auth/login', authLimiter, (req, res) => {
    const { email, password } = req.body || {};
    const u = db.get('SELECT * FROM users WHERE email=?', [(email || '').toLowerCase()]);
    if (!u || !bcrypt.compareSync(password || '', u.password_hash)) return res.status(401).json({ error: 'Invalid email or password' });
    req.session.regenerate(() => { req.session.uid = u.id; res.json({ id: u.id, email: u.email }); });
  });
  app.post('/api/auth/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
  app.get('/api/me', auth, (req, res) => {
    const u = db.get('SELECT id,email,name FROM users WHERE id=?', [req.session.uid]);
    const selfie = db.get("SELECT id FROM photos WHERE user_id=? AND kind='selfie' ORDER BY id DESC LIMIT 1", [req.session.uid]);
    res.json({ ...u, aiEnabled: ai.aiEnabled(), selfie: selfie ? `/api/photos/${selfie.id}` : null });
  });

  // ---- items
  app.get('/api/items', auth, (req, res) => {
    let items = db.all('SELECT * FROM items WHERE user_id=? ORDER BY id DESC', [req.session.uid]).map(shapeItem);
    const { category, color, season, formality, style, q } = req.query;
    if (category) items = items.filter(i => i.category === category);
    if (color) items = items.filter(i => (i.color || '').toLowerCase().includes(color.toLowerCase()));
    if (season) items = items.filter(i => i.seasons.includes(season));
    if (formality) items = items.filter(i => i.formality === +formality);
    if (style) items = items.filter(i => i.cultural_style === style);
    if (q) { const s = q.toLowerCase(); items = items.filter(i => [i.name, i.type, i.fabric, i.pattern, i.color].join(' ').toLowerCase().includes(s)); }
    res.json(items);
  });
  app.post('/api/items/seed', auth, (req, res) => res.json({ added: seedUser(db, req.session.uid) }));
  app.post('/api/items/import', auth, upload.array('photos', 20), async (req, res) => {
    if (!req.files?.length) return res.status(400).json({ error: 'Upload at least one JPEG/PNG/WebP photo' });
    const created = []; let mode = 'demo'; const errors = [];
    for (const f of req.files) {
      const photoId = savePhoto(req.session.uid, 'closet', { buffer: f.buffer, mime: f.mimetype });
      const det = await ai.detectItems(f.buffer, f.mimetype, `${req.body.hint || ''} ${f.originalname}`, fetchImpl);
      mode = det.mode; if (det.error) errors.push(det.error);
      for (const it of det.items) {
        const id = db.run(`INSERT INTO items(user_id,photo_id,bbox,name,type,category,color,color_hex,pattern,fabric,seasons,formality,cultural_style,modest,waterproof) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [req.session.uid, photoId, it.bbox ? JSON.stringify(it.bbox) : null, it.name, it.type, it.category, it.color, it.color_hex, it.pattern, it.fabric, JSON.stringify(it.seasons || []), Math.max(1, Math.min(5, +it.formality || 2)), it.cultural_style, it.modest ? 1 : 0, it.waterproof ? 1 : 0]);
        created.push(shapeItem(db.get('SELECT * FROM items WHERE id=?', [id])));
      }
    }
    res.json({ mode, items: created, errors });
  });
  const EDITABLE = ['name', 'type', 'category', 'color', 'color_hex', 'pattern', 'fabric', 'seasons', 'formality', 'cultural_style', 'modest', 'waterproof'];
  app.patch('/api/items/:id', auth, (req, res) => {
    const it = db.get('SELECT id FROM items WHERE id=? AND user_id=?', [+req.params.id, req.session.uid]);
    if (!it) return res.status(404).json({ error: 'Not found' });
    for (const k of EDITABLE) if (k in req.body) {
      let v = req.body[k]; if (k === 'seasons') v = JSON.stringify(v); if (k === 'modest' || k === 'waterproof') v = v ? 1 : 0;
      db.run(`UPDATE items SET ${k}=? WHERE id=?`, [v, it.id]);
    }
    res.json(shapeItem(db.get('SELECT * FROM items WHERE id=?', [it.id])));
  });
  app.delete('/api/items/:id', auth, (req, res) => { db.run('DELETE FROM items WHERE id=? AND user_id=?', [+req.params.id, req.session.uid]); res.json({ ok: true }); });
  app.get('/api/items/:id/image', auth, (req, res) => {
    const it = db.get('SELECT * FROM items WHERE id=? AND user_id=?', [+req.params.id, req.session.uid]);
    if (!it) return res.status(404).end();
    res.set('Cache-Control', 'private, max-age=3600');
    if (it.svg) return res.type('image/svg+xml').send(it.svg);
    const p = readPhoto(req.session.uid, it.photo_id); if (!p) return res.status(404).end();
    res.type(p.mime).send(p.buffer);
  });
  app.get('/api/photos/:id', auth, (req, res) => {
    const p = readPhoto(req.session.uid, +req.params.id); if (!p) return res.status(404).end();
    res.set('Cache-Control', 'private, max-age=3600').type(p.mime).send(p.buffer);
  });

  // ---- context
  app.get('/api/events', (_req, res) => res.json(EVENTS));
  app.get('/api/weather', auth, async (req, res) => {
    try { res.json(await getWeather(req.query, fetchImpl)); } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.post('/api/suggest', auth, async (req, res) => {
    const { event, q, lat, lon, date, useWeather = true } = req.body || {};
    let weather = null;
    if (useWeather) { try { weather = await getWeather({ q, lat, lon, date }, fetchImpl); } catch (e) { return res.status(400).json({ error: e.message }); } }
    const ev = findEvent(event);
    const items = db.all('SELECT * FROM items WHERE user_id=?', [req.session.uid]).map(shapeItem);
    const { outfits, shopping } = suggestOutfits(items, { event: ev, weather });
    res.json({ event: ev, weather, outfits, shopping });
  });
  app.post('/api/outfits', auth, (req, res) => {
    const { itemIds = [], context = {}, reason = '' } = req.body || {};
    const id = db.run('INSERT INTO outfits(user_id,item_ids,context,reason) VALUES(?,?,?,?)', [req.session.uid, JSON.stringify(itemIds), JSON.stringify(context), reason]);
    res.json({ id });
  });
  app.get('/api/outfits', auth, (req, res) => res.json(db.all('SELECT * FROM outfits WHERE user_id=? ORDER BY id DESC', [req.session.uid])
    .map(o => ({ ...o, item_ids: parse(o.item_ids, []), context: parse(o.context, {}), render: o.render_photo_id ? `/api/photos/${o.render_photo_id}` : null }))));
  app.delete('/api/outfits/:id', auth, (req, res) => { db.run('DELETE FROM outfits WHERE id=? AND user_id=?', [+req.params.id, req.session.uid]); res.json({ ok: true }); });

  // ---- try-on
  app.post('/api/selfie', auth, upload.single('photo'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Upload a JPEG/PNG/WebP photo' });
    const id = savePhoto(req.session.uid, 'selfie', { buffer: req.file.buffer, mime: req.file.mimetype });
    res.json({ id, url: `/api/photos/${id}` });
  });
  app.post('/api/tryon', auth, async (req, res) => {
    const uid = req.session.uid;
    const sp = db.get("SELECT id FROM photos WHERE user_id=? AND kind='selfie' ORDER BY id DESC LIMIT 1", [uid]);
    if (!sp) return res.status(400).json({ error: 'Upload a photo of yourself first' });
    const ids = (req.body?.itemIds || []).map(Number);
    const items = ids.map(id => db.get('SELECT * FROM items WHERE id=? AND user_id=?', [id, uid])).filter(Boolean);
    if (!items.length) return res.status(400).json({ error: 'Pick at least one item' });
    const selfie = readPhoto(uid, sp.id);
    const text = items.map(i => `${i.color} ${i.pattern !== 'solid' ? i.pattern + ' ' : ''}${i.fabric} ${i.type}`).join(', ');
    const garments = items.filter(i => i.photo_id).map(i => { const p = readPhoto(uid, i.photo_id); return p && { buffer: p.buffer, mime: p.mime, name: i.name }; }).filter(Boolean);
    const out = await ai.tryOn({ selfie, garments, outfitText: text }, fetchImpl);
    let buffer = out.buffer, mime = out.mime;
    if (out.mode === 'demo') { buffer = Buffer.from(demoComposite(selfie, items, uid, readPhoto)); mime = 'image/svg+xml'; }
    const pid = savePhoto(uid, 'render', { buffer, mime });
    if (req.body.outfitId) db.run('UPDATE outfits SET render_photo_id=? WHERE id=? AND user_id=?', [pid, +req.body.outfitId, uid]);
    res.json({ mode: out.mode, url: `/api/photos/${pid}`, error: out.error });
  });

  app.get('/healthz', (_req, res) => res.json({ ok: true, ai: ai.aiEnabled() }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  return app;
}

function demoComposite(selfie, items, uid, readPhoto) {
  const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const uri = (buf, mime) => `data:${mime};base64,${buf.toString('base64')}`;
  const thumbs = items.slice(0, 6).map((it, k) => {
    let src; if (it.svg) src = uri(Buffer.from(it.svg), 'image/svg+xml'); else { const p = readPhoto(uid, it.photo_id); src = p ? uri(p.buffer, p.mime) : ''; }
    const y = 40 + k * 125;
    return `<rect x="430" y="${y}" width="150" height="115" rx="12" fill="#fff"/><image href="${src}" x="440" y="${y + 5}" width="130" height="85" preserveAspectRatio="xMidYMid meet"/><text x="505" y="${y + 106}" font-size="11" text-anchor="middle" fill="#334155" font-family="sans-serif">${esc(it.name).slice(0, 26)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800"><rect width="600" height="800" fill="#f1f5f9"/><clipPath id="c"><rect x="20" y="40" width="390" height="700" rx="18"/></clipPath><image href="${uri(selfie.buffer, selfie.mime)}" x="20" y="40" width="390" height="700" preserveAspectRatio="xMidYMid slice" clip-path="url(#c)"/><text x="20" y="26" font-size="16" font-weight="700" fill="#0f172a" font-family="sans-serif">Try-on preview (demo mode)</text><text x="20" y="775" font-size="12" fill="#475569" font-family="sans-serif">Set OPENAI_API_KEY to render a photoreal image of you wearing this outfit.</text>${thumbs}</svg>`;
}

module.exports = { createApp };
