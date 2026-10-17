// Live integration test against a real Supabase project. Skipped unless SUPABASE_URL is set.
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npx vitest run tests/supabase.live.test.js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
const { createApp } = require('../src/app');
const { SAMPLE } = require('../src/seed');

const live = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describe.skipIf(!live)('live Supabase', () => {
  it('register → seeded closet → import → outfit → try-on, with per-user isolation', async () => {
    delete process.env.OPENAI_API_KEY;
    const app = await createApp({ sessionSecret: process.env.SESSION_SECRET || 'live-test', authLimit: 1000 });
    const a = request.agent(app); const b = request.agent(app);
    const tag = Date.now();
    await a.post('/api/auth/register').send({ email: `live-a-${tag}@test.invalid`, password: 'password123' }).expect(200);
    await b.post('/api/auth/register').send({ email: `live-b-${tag}@test.invalid`, password: 'password123', seed: false }).expect(200);
    const items = (await a.get('/api/items').expect(200)).body;
    expect(items.length).toBe(SAMPLE.length);
    const imp = await a.post('/api/items/import').attach('photos', PNG, { filename: 'navy-wool-coat.png', contentType: 'image/png' }).expect(200);
    const it0 = imp.body.items[0];
    await a.get(it0.image).expect(200);
    await b.get(it0.image).expect(404);
    await a.post('/api/selfie').attach('photo', PNG, { filename: 'me.png', contentType: 'image/png' }).expect(200);
    const sv = await a.post('/api/outfits').send({ itemIds: [items[0].id, it0.id], reason: 'live' }).expect(200);
    const r = await a.post('/api/tryon').send({ itemIds: [items[0].id, it0.id], outfitId: sv.body.id }).expect(200);
    await a.get(r.body.url).expect(200);
    await b.get(r.body.url).expect(404);
    expect((await a.get('/api/outfits')).body[0].render).toBe(r.body.url);
    const demo = await request(app).post('/api/auth/login').send({ email: 'demo@wardrobe.app', password: 'demo1234' });
    expect(demo.status).toBe(200); // run `npm run seed` first
  }, 60000);
});
