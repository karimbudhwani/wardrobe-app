// Data-access layer backed by Supabase (Postgres via the PostgREST HTTPS API + Storage).
// Server-side only: uses the SERVICE ROLE key, which bypasses RLS. Never expose it to the browser.
// Talks to Supabase exclusively over HTTPS (no direct Postgres connection on 5432/6543).
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
// supabase-js always constructs a Realtime client, which needs a WebSocket implementation on Node < 22.
// We never open a realtime connection; `ws` just satisfies the constructor on Node 20.
const WebSocket = require('ws');

// Columns returned for list views (omits the inline seed SVG, which can be large).
const ITEM_LIST_COLS = 'id,user_id,photo_id,bbox,name,type,category,color,color_hex,pattern,fabric,seasons,formality,cultural_style,modest,waterproof,created_at';

function fail(error, what) {
  const e = new Error(`Supabase ${what} failed: ${error.message || error}`);
  e.code = error.code; e.cause = error;
  throw e;
}

function supabaseConfig(env = process.env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase configuration: set SUPABASE_URL and SUPABASE_SERVICE_KEY (service role key). See README.md.');
  }
  return { url, key, bucket: env.SUPABASE_BUCKET || 'wardrobe' };
}

function createSupabaseDb(opts = {}) {
  const cfg = opts.client ? { bucket: opts.bucket || process.env.SUPABASE_BUCKET || 'wardrobe' } : supabaseConfig(opts.env);
  const sb = opts.client || createClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { transport: WebSocket },
  });
  const bucket = cfg.bucket;
  const one = async (q, what) => { const { data, error } = await q; if (error) fail(error, what); return data; };

  return {
    client: sb,
    bucket,

    // ---- users
    async getUserByEmail(email) {
      return one(sb.from('users').select('*').eq('email', email).maybeSingle(), 'getUserByEmail');
    },
    async getUserById(id) {
      return one(sb.from('users').select('id,email,name').eq('id', id).maybeSingle(), 'getUserById');
    },
    // Returns the new id. Throws an error with code 'EMAIL_TAKEN' on duplicate email.
    async createUser({ email, password_hash, name }) {
      const { data, error } = await sb.from('users').insert({ email, password_hash, name }).select('id').single();
      if (error) {
        if (error.code === '23505') { const e = new Error('Email already registered'); e.code = 'EMAIL_TAKEN'; throw e; }
        fail(error, 'createUser');
      }
      return data.id;
    },
    async updateUserPassword(id, password_hash) {
      await one(sb.from('users').update({ password_hash }).eq('id', id), 'updateUserPassword');
    },

    // ---- photos (metadata in Postgres, bytes in Storage)
    async insertPhoto({ user_id, kind, storage_path, mime }) {
      const row = await one(sb.from('photos').insert({ user_id, kind, storage_path, mime }).select('id').single(), 'insertPhoto');
      return row.id;
    },
    async getPhoto(userId, id) {
      if (!Number.isFinite(+id)) return null;
      return one(sb.from('photos').select('*').eq('id', +id).eq('user_id', userId).maybeSingle(), 'getPhoto');
    },
    async getLatestPhoto(userId, kind) {
      return one(sb.from('photos').select('*').eq('user_id', userId).eq('kind', kind).order('id', { ascending: false }).limit(1).maybeSingle(), 'getLatestPhoto');
    },

    // ---- storage objects
    async putObject(path, buffer, mime) {
      const { error } = await sb.storage.from(bucket).upload(path, buffer, { contentType: mime || 'application/octet-stream', upsert: false });
      if (error) fail(error, 'storage upload');
    },
    async getObject(path) {
      const { data, error } = await sb.storage.from(bucket).download(path);
      if (error) {
        const st = String(error.statusCode || error.status || error.originalError?.status || '');
        if (st === '404' || st === '400' || /not.?found/i.test(error.message || '')) return null;
        fail(error, 'storage download');
      }
      return Buffer.from(await data.arrayBuffer());
    },

    // ---- items
    // filters: equality filters pushed to Postgres ({ category, cultural_style }); the rest is done by the caller.
    async listItems(userId, filters = {}) {
      let q = sb.from('items').select(ITEM_LIST_COLS).eq('user_id', userId);
      if (filters.category) q = q.eq('category', String(filters.category));
      if (filters.cultural_style) q = q.eq('cultural_style', String(filters.cultural_style));
      return one(q.order('id', { ascending: false }), 'listItems');
    },
    async getItem(userId, id) {
      if (!Number.isFinite(+id)) return null;
      return one(sb.from('items').select('*').eq('id', +id).eq('user_id', userId).maybeSingle(), 'getItem');
    },
    async getItemsByIds(userId, ids) {
      const clean = ids.map(Number).filter(Number.isFinite);
      if (!clean.length) return [];
      const rows = await one(sb.from('items').select('*').eq('user_id', userId).in('id', clean), 'getItemsByIds');
      const byId = new Map(rows.map(r => [r.id, r]));
      return clean.map(id => byId.get(id)).filter(Boolean);
    },
    async insertItem(row) {
      return one(sb.from('items').insert(row).select('*').single(), 'insertItem');
    },
    async insertItems(rows) {
      if (!rows.length) return 0;
      await one(sb.from('items').insert(rows), 'insertItems');
      return rows.length;
    },
    async updateItem(userId, id, patch) {
      return one(sb.from('items').update(patch).eq('id', +id).eq('user_id', userId).select('*').maybeSingle(), 'updateItem');
    },
    async deleteItem(userId, id) {
      if (!Number.isFinite(+id)) return;
      await one(sb.from('items').delete().eq('id', +id).eq('user_id', userId), 'deleteItem');
    },
    async listSeedItemNames(userId) {
      const rows = await one(sb.from('items').select('name').eq('user_id', userId).not('svg', 'is', null), 'listSeedItemNames');
      return rows.map(r => r.name);
    },

    // ---- outfits
    async insertOutfit({ user_id, item_ids, context, reason }) {
      const row = await one(sb.from('outfits').insert({ user_id, item_ids, context, reason }).select('id').single(), 'insertOutfit');
      return row.id;
    },
    async listOutfits(userId) {
      return one(sb.from('outfits').select('*').eq('user_id', userId).order('id', { ascending: false }), 'listOutfits');
    },
    async deleteOutfit(userId, id) {
      if (!Number.isFinite(+id)) return;
      await one(sb.from('outfits').delete().eq('id', +id).eq('user_id', userId), 'deleteOutfit');
    },
    async updateOutfitRender(userId, outfitId, photoId) {
      if (!Number.isFinite(+outfitId)) return;
      await one(sb.from('outfits').update({ render_photo_id: photoId }).eq('id', +outfitId).eq('user_id', userId), 'updateOutfitRender');
    },
  };
}

const newStoragePath = userId => `${userId}/${crypto.randomBytes(16).toString('hex')}`;

module.exports = { createSupabaseDb, supabaseConfig, newStoragePath, ITEM_LIST_COLS };
