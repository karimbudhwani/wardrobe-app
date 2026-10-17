import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
const { createApp } = require('../src/app');
const { suggestOutfits } = require('../src/recommend');
const { findEvent } = require('../src/events');
const { SAMPLE } = require('../src/seed');
const { classify } = require('../src/weather');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const mockFetch = rain => async url => ({
  ok: true,
  json: async () => url.includes('geocoding') ? { results: [{ name: 'Mumbai', country: 'India', latitude: 19, longitude: 72.8 }] }
    : { daily: { temperature_2m_max: [rain ? 27 : 33], temperature_2m_min: [rain ? 24 : 26], precipitation_probability_max: [rain ? 90 : 5], precipitation_sum: [rain ? 20 : 0], wind_speed_10m_max: [10], relative_humidity_2m_mean: [85] } },
});

let app, rainApp;
beforeAll(async () => {
  delete process.env.OPENAI_API_KEY;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-'));
  app = await createApp({ dbFile: null, dataDir: dir, fetchImpl: mockFetch(false), authLimit: 1000 });
  rainApp = await createApp({ dbFile: null, dataDir: dir + 'r', fetchImpl: mockFetch(true), authLimit: 1000 });
});
const signup = async (a = app, email = `u${Math.random()}@x.com`) => { const ag = request.agent(a); await ag.post('/api/auth/register').send({ email, password: 'password123' }).expect(200); return ag; };

describe('auth & privacy', () => {
  it('rejects unauthenticated access', async () => { await request(app).get('/api/items').expect(401); });
  it('registers, seeds sample closet, logs in/out', async () => {
    const ag = await signup(app, 'a@x.com');
    const items = (await ag.get('/api/items').expect(200)).body;
    expect(items.length).toBe(SAMPLE.length);
    await ag.post('/api/auth/logout').expect(200);
    await ag.get('/api/items').expect(401);
    await request(app).post('/api/auth/login').send({ email: 'a@x.com', password: 'wrong-pass' }).expect(401);
    await request.agent(app).post('/api/auth/login').send({ email: 'a@x.com', password: 'password123' }).expect(200);
  });
  it('rejects duplicate emails and weak passwords', async () => {
    await request(app).post('/api/auth/register').send({ email: 'a@x.com', password: 'password123' }).expect(409);
    await request(app).post('/api/auth/register').send({ email: 'b@x.com', password: 'short' }).expect(400);
  });
  it("users cannot see each other's photos or items", async () => {
    const a = await signup(); const b = await signup();
    const r = await a.post('/api/items/import').attach('photos', PNG, { filename: 'navy-wool-coat.png', contentType: 'image/png' }).expect(200);
    const it0 = r.body.items[0];
    await a.get(it0.image).expect(200);
    await b.get(it0.image).expect(404);
    await b.get(`/api/photos/${it0.photo_id}`).expect(404);
    await b.patch(`/api/items/${it0.id}`).send({ name: 'hacked' }).expect(404);
  });
});

describe('closet import & wardrobe', () => {
  it('imports a photo in demo mode with heuristic tags', async () => {
    const ag = await signup();
    const r = await ag.post('/api/items/import').field('hint', 'rain jacket').attach('photos', PNG, { filename: 'olive-nylon.png', contentType: 'image/png' }).expect(200);
    expect(r.body.mode).toBe('demo');
    expect(r.body.items[0]).toMatchObject({ category: 'outerwear', color: 'olive', fabric: 'nylon', waterproof: true });
  });
  it('rejects non-images', async () => {
    const ag = await signup();
    await ag.post('/api/items/import').attach('photos', Buffer.from('hi'), { filename: 'a.txt', contentType: 'text/plain' }).expect(400);
  });
  it('filters by category, season, style and text', async () => {
    const ag = await signup();
    const shoes = (await ag.get('/api/items?category=shoes')).body; expect(shoes.length).toBeGreaterThan(2); expect(shoes.every(i => i.category === 'shoes')).toBe(true);
    const sa = (await ag.get('/api/items?style=south-asian')).body; expect(sa.every(i => i.cultural_style === 'south-asian')).toBe(true);
    const w = (await ag.get('/api/items?season=winter&q=wool')).body; expect(w.length).toBeGreaterThan(0);
  });
  it('edits and deletes items', async () => {
    const ag = await signup(); const [it0] = (await ag.get('/api/items')).body;
    const r = await ag.patch(`/api/items/${it0.id}`).send({ color: 'teal', seasons: ['summer'], formality: 5 }).expect(200);
    expect(r.body).toMatchObject({ color: 'teal', seasons: ['summer'], formality: 5 });
    await ag.delete(`/api/items/${it0.id}`).expect(200);
    expect((await ag.get('/api/items')).body.find(i => i.id === it0.id)).toBeUndefined();
  });
});

describe('context-aware suggestions', () => {
  it('weather classification', () => {
    expect(classify({ tmax: 34, tmin: 27, precipProb: 0, precip: 0, wind: 5, humidity: 80 })).toEqual(expect.arrayContaining(['hot', 'humid']));
    expect(classify({ tmax: 5, tmin: -2, precipProb: 80, precip: 5, wind: 40, humidity: 60 })).toEqual(expect.arrayContaining(['cold', 'rainy', 'windy', 'freezing']));
  });
  it('event lookup by name and keyword', () => {
    expect(findEvent('Diwali').id).toBe('diwali');
    expect(findEvent('going to garba tonight').id).toBe('navratri');
    expect(findEvent('my cousin\'s nikah').id).toBe('nikah');
    expect(findEvent('Something unusual').id).toBe('custom');
  });
  it('returns top 3 outfits with reasons and fallbacks for Diwali, honoring no-black', async () => {
    const ag = await signup();
    const r = (await ag.post('/api/suggest').send({ event: 'Diwali', q: 'Mumbai', date: '2026-11-08' }).expect(200)).body;
    expect(r.weather.location).toContain('Mumbai'); expect(r.outfits).toHaveLength(3);
    for (const o of r.outfits) { expect(o.reason.length).toBeGreaterThan(10); expect(o.fallback).toMatch(/If .* isn't available/); expect(o.items.some(i => i.color === 'black')).toBe(false); }
    expect(r.outfits[0].items[0].cultural_style).toBe('south-asian');
  });
  it('black-tie picks the tuxedo and formal shoes', async () => {
    const ag = await signup();
    const r = (await ag.post('/api/suggest').send({ event: 'black-tie', useWeather: false })).body;
    expect(r.outfits[0].items[0].name).toBe('Black tuxedo');
    expect(r.outfits[0].items.find(i => i.category === 'shoes').formality).toBeGreaterThanOrEqual(4);
  });
  it('western wedding never suggests white/ivory main pieces', async () => {
    const ag = await signup();
    const r = (await ag.post('/api/suggest').send({ event: 'Western wedding (guest)', useWeather: false })).body;
    for (const o of r.outfits) expect(['white', 'cream', 'ivory']).not.toContain(o.items[0].color);
  });
  it('rain → waterproof shoes and rain layer', async () => {
    const ag = await signup(rainApp);
    const r = (await ag.post('/api/suggest').send({ event: 'casual', q: 'Mumbai' })).body;
    expect(r.weather.conditions).toContain('rainy');
    expect(r.outfits[0].items.find(i => i.category === 'shoes').waterproof).toBe(true);
    expect(r.outfits[0].items.some(i => i.category === 'outerwear' && i.waterproof)).toBe(true);
  });
  it('empty closet suggests things to buy', () => {
    const r = suggestOutfits([], { event: findEvent('business'), weather: { conditions: ['rainy', 'cold'], season: 'winter', tmin: 2, tmax: 6 } });
    expect(r.outfits).toHaveLength(0); expect(r.shopping.length).toBeGreaterThan(1);
  });
});

describe('outfits & try-on', () => {
  it('saves outfits and renders a demo try-on composite', async () => {
    const ag = await signup(); const items = (await ag.get('/api/items')).body;
    await ag.post('/api/tryon').send({ itemIds: [items[0].id] }).expect(400);
    await ag.post('/api/selfie').attach('photo', PNG, { filename: 'me.png', contentType: 'image/png' }).expect(200);
    const sv = await ag.post('/api/outfits').send({ itemIds: [items[0].id, items[1].id], reason: 'test' }).expect(200);
    const r = await ag.post('/api/tryon').send({ itemIds: [items[0].id, items[1].id], outfitId: sv.body.id }).expect(200);
    expect(r.body.mode).toBe('demo');
    const img = await ag.get(r.body.url).expect(200);
    expect(img.headers['content-type']).toContain('svg');
    expect((await ag.get('/api/outfits')).body[0].render).toBe(r.body.url);
  });
});
