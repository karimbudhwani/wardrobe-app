const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const { createSupabaseDb, newStoragePath } = require('./db');
const { createSessions } = require('./session');
const { seedUser } = require('./seed');
const { EVENTS, findEvent } = require('./events');
const { getWeather } = require('./weather');
const { suggestOutfits } = require('./recommend');
const ai = require('./ai');

const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const shapeItem = i => ({ ...i, svg: undefined, seasons: parse(i.seasons, []), bbox: parse(i.bbox, null), image: `/api/items/${i.id}/image`, modest: !!i.modest, waterproof: !!i.waterproof });

// opts.db: inject a data layer (tests use an in-memory one); defaults to Supabase from env.
async function createApp(opts = {}) {
  const db = opts.db || createSupabaseDb();
  const sessions = createSessions({ secret: opts.sessionSecret });
  const fetchImpl = opts.fetchImpl || globalThis.fetch;

  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'data:', 'blob:'], 'script-src': ["'self'"] } } }));
  app.use(express.json({ limit: '1mb' }));
  app.use(sessions.read);
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: opts.authLimit || 50 });
  const upload = multer({
    storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 20 },
    fileFilter: (_req, f, cb) => cb(null, /^image\/(jpeg|png|webp|heic|heif)$/.test(f.mimetype)),
  });
  const auth = (req, res, next) => (req.uid ? next() : res.status(401).json({ error: 'Not signed in' }));
  const savePhoto = async (uid, kind, file) => {
    const storage_path = newStoragePath(uid);
    await db.putObject(storage_path, file.buffer, file.mime);
    return db.insertPhoto({ user_id: uid, kind, storage_path, mime: file.mime });
  };
  const readPhoto = async (uid, id) => {
    if (id == null) return null;
    const p = await db.getPhoto(uid, id);
    if (!p) return null;
    const buffer = await db.getObject(p.storage_path);
    return buffer ? { ...p, buffer } : null;
  };

  // ---- auth
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const { email, password, name, seed = true } = req.body || {};
    if (!/^\S+@\S+\.\S+$/.test(email || '') || (password || '').length < 8) return res.status(400).json({ error: 'Valid email and 8+ character password required' });
    const em = email.toLowerCase();
    if (await db.getUserByEmail(em)) return res.status(409).json({ error: 'Email already registered' });
    let id;
    try { id = await db.createUser({ email: em, password_hash: bcrypt.hashSync(password, 10), name: name || email.split('@')[0] }); }
    catch (e) { if (e.code === 'EMAIL_TAKEN') return res.status(409).json({ error: 'Email already registered' }); throw e; }
    if (seed) await seedUser(db, id);
    sessions.login(res, id);
    res.json({ id, email: em });
  });
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const { email, password } = req.body || {};
    const u = await db.getUserByEmail((email || '').toLowerCase());
    if (!u || !bcrypt.compareSync(password || '', u.password_hash)) return res.status(401).json({ error: 'Invalid email or password' });
    sessions.login(res, u.id);
    res.json({ id: u.id, email: u.email });
  });
  app.post('/api/auth/logout', (_req, res) => { sessions.logout(res); res.json({ ok: true }); });
  app.get('/api/me', auth, async (req, res) => {
    const [u, selfie] = await Promise.all([db.getUserById(req.uid), db.getLatestPhoto(req.uid, 'selfie')]);
    if (!u) { sessions.logout(res); return res.status(401).json({ error: 'Not signed in' }); }
    res.json({ ...u, aiEnabled: ai.aiEnabled(), selfie: selfie ? `/api/photos/${selfie.id}` : null });
  });

  // ---- items
  app.get('/api/items', auth, async (req, res) => {
    const { category, color, season, formality, style, q } = req.query;
    let items = (await db.listItems(req.uid, { category, cultural_style: style })).map(shapeItem);
    if (category) items = items.filter(i => i.category === category);
    if (color) items = items.filter(i => (i.color || '').toLowerCase().includes(color.toLowerCase()));
    if (season) items = items.filter(i => i.seasons.includes(season));
    if (formality) items = items.filter(i => i.formality === +formality);
    if (style) items = items.filter(i => i.cultural_style === style);
    if (q) {
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      items = items.filter(i => {
        const words = [i.name, i.type, i.fabric, i.pattern, i.color].join(' ').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        return terms.every(t => words.some(w => w.startsWith(t)));
      });
    }
    res.json(items);
  });
  app.post('/api/items/seed', auth, async (req, res) => res.json({ added: await seedUser(db, req.uid) }));
  app.post('/api/items/import', auth, upload.array('photos', 20), async (req, res) => {
    if (!req.files?.length) return res.status(400).json({ error: 'Upload at least one JPEG/PNG/WebP photo' });
    const created = []; let mode = 'demo'; const errors = [];
    for (const f of req.files) {
      const photoId = await savePhoto(req.uid, 'closet', { buffer: f.buffer, mime: f.mimetype });
      const det = await ai.detectItems(f.buffer, f.mimetype, `${req.body.hint || ''} ${f.originalname}`, fetchImpl);
      mode = det.mode; if (det.error) errors.push(det.error);
      for (const it of det.items) {
        const row = await db.insertItem({
          user_id: req.uid, photo_id: photoId, bbox: it.bbox ? JSON.stringify(it.bbox) : null, name: it.name, type: it.type, category: it.category,
          color: it.color, color_hex: it.color_hex, pattern: it.pattern, fabric: it.fabric, seasons: JSON.stringify(it.seasons || []),
          formality: Math.max(1, Math.min(5, Math.round(+it.formality) || 2)), cultural_style: it.cultural_style, modest: it.modest ? 1 : 0, waterproof: it.waterproof ? 1 : 0,
        });
        created.push(shapeItem(row));
      }
    }
    res.json({ mode, items: created, errors });
  });
  const EDITABLE = ['name', 'type', 'category', 'color', 'color_hex', 'pattern', 'fabric', 'seasons', 'formality', 'cultural_style', 'modest', 'waterproof'];
  app.patch('/api/items/:id', auth, async (req, res) => {
    const it = await db.getItem(req.uid, +req.params.id);
    if (!it) return res.status(404).json({ error: 'Not found' });
    const patch = {};
    for (const k of EDITABLE) if (k in (req.body || {})) {
      let v = req.body[k]; if (k === 'seasons') v = JSON.stringify(v); if (k === 'modest' || k === 'waterproof') v = v ? 1 : 0;
      if (k === 'formality') v = Math.round(+v) || 2;
      patch[k] = v;
    }
    const row = Object.keys(patch).length ? await db.updateItem(req.uid, it.id, patch) : it;
    res.json(shapeItem(row || it));
  });
  app.delete('/api/items/:id', auth, async (req, res) => { await db.deleteItem(req.uid, +req.params.id); res.json({ ok: true }); });
  app.get('/api/items/:id/image', auth, async (req, res) => {
    const it = await db.getItem(req.uid, +req.params.id);
    if (!it) return res.status(404).end();
    res.set('Cache-Control', 'private, max-age=3600');
    if (it.svg) return res.type('image/svg+xml').send(it.svg);
    const p = await readPhoto(req.uid, it.photo_id); if (!p) return res.status(404).end();
    res.type(p.mime).send(p.buffer);
  });
  app.get('/api/photos/:id', auth, async (req, res) => {
    const p = await readPhoto(req.uid, +req.params.id); if (!p) return res.status(404).end();
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
    const items = (await db.listItems(req.uid)).map(shapeItem);
    const { outfits, shopping } = suggestOutfits(items, { event: ev, weather });
    res.json({ event: ev, weather, outfits, shopping });
  });
  app.post('/api/outfits', auth, async (req, res) => {
    const { itemIds = [], context = {}, reason = '' } = req.body || {};
    const id = await db.insertOutfit({ user_id: req.uid, item_ids: JSON.stringify(itemIds), context: JSON.stringify(context), reason });
    res.json({ id });
  });
  app.get('/api/outfits', auth, async (req, res) => res.json((await db.listOutfits(req.uid))
    .map(o => ({ ...o, item_ids: parse(o.item_ids, []), context: parse(o.context, {}), render: o.render_photo_id ? `/api/photos/${o.render_photo_id}` : null }))));
  app.delete('/api/outfits/:id', auth, async (req, res) => { await db.deleteOutfit(req.uid, +req.params.id); res.json({ ok: true }); });

  // ---- try-on
  app.post('/api/selfie', auth, upload.single('photo'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Upload a JPEG/PNG/WebP photo' });
    const id = await savePhoto(req.uid, 'selfie', { buffer: req.file.buffer, mime: req.file.mimetype });
    res.json({ id, url: `/api/photos/${id}` });
  });
  app.post('/api/tryon', auth, async (req, res) => {
    const uid = req.uid;
    const sp = await db.getLatestPhoto(uid, 'selfie');
    if (!sp) return res.status(400).json({ error: 'Upload a photo of yourself first' });
    const items = await db.getItemsByIds(uid, req.body?.itemIds || []);
    if (!items.length) return res.status(400).json({ error: 'Pick at least one item' });
    const selfie = await readPhoto(uid, sp.id);
    if (!selfie) return res.status(400).json({ error: 'Upload a photo of yourself first' });
    const text = items.map(i => `${i.color} ${i.pattern !== 'solid' ? i.pattern + ' ' : ''}${i.fabric} ${i.type}`).join(', ');
    // Load each referenced garment photo once.
    const photos = new Map();
    await Promise.all([...new Set(items.filter(i => i.photo_id).map(i => i.photo_id))].map(async pid => photos.set(pid, await readPhoto(uid, pid))));
    const garments = items.filter(i => i.photo_id).map(i => { const p = photos.get(i.photo_id); return p && { buffer: p.buffer, mime: p.mime, name: i.name }; }).filter(Boolean);
    const out = await ai.tryOn({ selfie, garments, outfitText: text }, fetchImpl);
    let buffer = out.buffer, mime = out.mime;
    if (out.mode === 'demo') { buffer = Buffer.from(demoComposite(selfie, items, pid => photos.get(pid))); mime = 'image/svg+xml'; }
    const pid = await savePhoto(uid, 'render', { buffer, mime });
    if (req.body.outfitId) await db.updateOutfitRender(uid, +req.body.outfitId, pid);
    res.json({ mode: out.mode, url: `/api/photos/${pid}`, error: out.error });
  });

  app.get('/healthz', (_req, res) => res.json({ ok: true, ai: ai.aiEnabled() }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('[wardrobe]', err);
    if (res.headersSent) return;
    if (err.name === 'MulterError') return res.status(400).json({ error: err.message });
    res.status(err.status || 500).json({ error: err.expose ? err.message : 'Something went wrong. Please try again.' });
  });
  return app;
}

function demoComposite(selfie, items, photoFor) {
  const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const uri = (buf, mime) => `data:${mime};base64,${buf.toString('base64')}`;
  const thumbs = items.slice(0, 6).map((it, k) => {
    let src; if (it.svg) src = uri(Buffer.from(it.svg), 'image/svg+xml'); else { const p = photoFor(it.photo_id); src = p ? uri(p.buffer, p.mime) : ''; }
    const y = 40 + k * 125;
    return `<rect x="430" y="${y}" width="150" height="115" rx="12" fill="#fff"/><image href="${src}" x="440" y="${y + 5}" width="130" height="85" preserveAspectRatio="xMidYMid meet"/><text x="505" y="${y + 106}" font-size="11" text-anchor="middle" fill="#334155" font-family="sans-serif">${esc(it.name).slice(0, 26)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800"><rect width="600" height="800" fill="#f1f5f9"/><clipPath id="c"><rect x="20" y="40" width="390" height="700" rx="18"/></clipPath><image href="${uri(selfie.buffer, selfie.mime)}" x="20" y="40" width="390" height="700" preserveAspectRatio="xMidYMid slice" clip-path="url(#c)"/><text x="20" y="26" font-size="16" font-weight="700" fill="#0f172a" font-family="sans-serif">Try-on preview (demo mode)</text><text x="20" y="775" font-size="12" fill="#475569" font-family="sans-serif">Set OPENAI_API_KEY to render a photoreal image of you wearing this outfit.</text>${thumbs}</svg>`;
}

module.exports = { createApp };
