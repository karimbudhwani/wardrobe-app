// In-memory implementation of the src/db.js data-layer interface, for tests only.
// Mirrors Supabase semantics: identity ids, per-user scoping, unique email, bucket objects.
const { ITEM_LIST_COLS } = require('../src/db');

const LIST_COLS = ITEM_LIST_COLS.split(',');
const pick = (row, cols) => Object.fromEntries(cols.map(c => [c, row[c] ?? null]));
const clone = r => (r ? { ...r } : null);

function createMemoryDb() {
  const t = { users: [], photos: [], items: [], outfits: [] };
  const seq = { users: 0, photos: 0, items: 0, outfits: 0 };
  const objects = new Map();
  const now = () => new Date().toISOString();
  const ins = (tbl, row) => { const r = { ...row, id: ++seq[tbl], created_at: now() }; t[tbl].push(r); return r; };
  const ITEM_DEFAULTS = { photo_id: null, svg: null, bbox: null, formality: 2, modest: 1, waterproof: 0 };
  const own = (tbl, uid, id) => t[tbl].find(r => r.id === +id && r.user_id === uid);

  return {
    tables: t, objects,
    async getUserByEmail(email) { return clone(t.users.find(u => u.email === email)); },
    async getUserById(id) { const u = t.users.find(x => x.id === +id); return u ? pick(u, ['id', 'email', 'name']) : null; },
    async createUser({ email, password_hash, name }) {
      if (t.users.some(u => u.email === email)) { const e = new Error('Email already registered'); e.code = 'EMAIL_TAKEN'; throw e; }
      return ins('users', { email, password_hash, name }).id;
    },
    async updateUserPassword(id, password_hash) { const u = t.users.find(x => x.id === +id); if (u) u.password_hash = password_hash; },
    async insertPhoto(row) { return ins('photos', row).id; },
    async getPhoto(uid, id) { return clone(own('photos', uid, id)); },
    async getLatestPhoto(uid, kind) { return clone(t.photos.filter(p => p.user_id === uid && p.kind === kind).sort((a, b) => b.id - a.id)[0]); },
    async putObject(path, buffer, mime) { if (objects.has(path)) throw new Error('exists'); objects.set(path, { buffer: Buffer.from(buffer), mime }); },
    async getObject(path) { const o = objects.get(path); return o ? Buffer.from(o.buffer) : null; },
    async listItems(uid, f = {}) {
      return t.items.filter(i => i.user_id === uid && (!f.category || i.category === f.category) && (!f.cultural_style || i.cultural_style === f.cultural_style))
        .sort((a, b) => b.id - a.id).map(i => pick(i, LIST_COLS));
    },
    async getItem(uid, id) { return clone(own('items', uid, id)); },
    async getItemsByIds(uid, ids) { return ids.map(id => own('items', uid, id)).filter(Boolean).map(clone); },
    async insertItem(row) { return clone(ins('items', { ...ITEM_DEFAULTS, ...row })); },
    async insertItems(rows) { rows.forEach(r => ins('items', { ...ITEM_DEFAULTS, ...r })); return rows.length; },
    async updateItem(uid, id, patch) { const i = own('items', uid, id); if (!i) return null; Object.assign(i, patch); return clone(i); },
    async deleteItem(uid, id) { t.items = t.items.filter(i => !(i.id === +id && i.user_id === uid)); },
    async listSeedItemNames(uid) { return t.items.filter(i => i.user_id === uid && i.svg != null).map(i => i.name); },
    async insertOutfit(row) { return ins('outfits', { render_photo_id: null, ...row }).id; },
    async listOutfits(uid) { return t.outfits.filter(o => o.user_id === uid).sort((a, b) => b.id - a.id).map(clone); },
    async deleteOutfit(uid, id) { t.outfits = t.outfits.filter(o => !(o.id === +id && o.user_id === uid)); },
    async updateOutfitRender(uid, outfitId, photoId) { const o = own('outfits', uid, outfitId); if (o) o.render_photo_id = photoId; },
  };
}

module.exports = { createMemoryDb };
