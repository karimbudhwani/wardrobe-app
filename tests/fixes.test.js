import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
const { createApp } = require('../src/app');
const { createMemoryDb } = require('./memory-db');
const { suggestOutfits, warmthOf, colorInfo, relation, colorMatch } = require('../src/recommend');
const { findEvent, matchEvent } = require('../src/events');
const { SAMPLE } = require('../src/seed');
const { getWeather } = require('../src/weather');

const CITIES = {
  dubai: { name: 'Dubai', country: 'United Arab Emirates', latitude: 25.08, longitude: 55.31, tmax: 24.5, tmin: 14.2, feels: 23 },
  singapore: { name: 'Singapore', country: 'Singapore', latitude: 1.29, longitude: 103.85, tmax: 31.0, tmin: 25.9, feels: 36 },
  sydney: { name: 'Sydney', country: 'Australia', latitude: -33.87, longitude: 151.21, tmax: 17.5, tmin: 8.5, feels: 16 },
  oslo: { name: 'Oslo', country: 'Norway', latitude: 59.91, longitude: 10.75, tmax: 22, tmin: 12, feels: 21 },
};
const cityFor = url => { const m = /latitude=([-\d.]+)/.exec(url); return Object.values(CITIES).find(c => m && Math.abs(c.latitude - +m[1]) < 0.01); };
const days = (n, v) => Array.from({ length: n }, () => v);
// Router mock: geocoding by name, forecast rejects out-of-range dates (like the real API), archive returns canned normals.
function router({ archive = 'ok', climate = 'ok', forecast } = {}) {
  const calls = [];
  const f = async url => {
    calls.push(url);
    if (url.includes('geocoding')) { const q = decodeURIComponent(/name=([^&]+)/.exec(url)[1]).toLowerCase(); const c = CITIES[q]; return { ok: true, json: async () => ({ results: c ? [c] : [] }) }; }
    if (url.includes('archive-api')) {
      if (archive === 'reject') throw new Error('network down');
      const c = cityFor(url);
      return { ok: true, json: async () => ({ daily: { temperature_2m_max: days(15, c.tmax), temperature_2m_min: days(15, c.tmin), apparent_temperature_max: days(15, c.feels), precipitation_sum: days(15, 0), wind_speed_10m_max: days(15, 14), relative_humidity_2m_mean: days(15, 65) } }) };
    }
    if (url.includes('climate-api')) {
      if (climate === 'reject') throw new Error('network down');
      const c = cityFor(url);
      return { ok: true, json: async () => ({ daily: { temperature_2m_max: days(15, c.tmax), temperature_2m_min: days(15, c.tmin), precipitation_sum: days(15, 0), wind_speed_10m_max: days(15, 14), relative_humidity_2m_mean: days(15, 65) } }) };
    }
    if (url.includes('api.open-meteo.com/v1/forecast')) {
      if (forecast) return { ok: true, json: async () => ({ daily: forecast }) };
      return { ok: false, status: 400, json: async () => ({ error: true, reason: "Parameter 'start_date' is out of allowed range from 2026-07-16 to 2026-11-01" }) };
    }
    throw new Error('unexpected ' + url);
  };
  f.calls = calls;
  return f;
}
const ahead = (n, md) => { if (md) { const y = new Date().getUTCFullYear() + 1; return `${y}-${md}`; } const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const items = SAMPLE.map((x, i) => ({ ...x, id: i + 1, seasons: JSON.stringify(x.seasons) }));
const opts = { sessionSecret: 'test-secret', authLimit: 1000 };
const signup = async a => { const ag = request.agent(a); await ag.post('/api/auth/register').send({ email: `u${Math.random()}@x.com`, password: 'password123' }).expect(200); return ag; };
const HOT_DUBAI = { temperature_2m_max: [37], temperature_2m_min: [26], apparent_temperature_max: [41], precipitation_probability_max: [0], precipitation_sum: [0], wind_speed_10m_max: [12], relative_humidity_2m_mean: [40] };
const RAIN_COLD = { temperature_2m_max: [6], temperature_2m_min: [1], apparent_temperature_max: [3], precipitation_probability_max: [90], precipitation_sum: [12], wind_speed_10m_max: [35], relative_humidity_2m_mean: [90] };

describe('B4 event matching', () => {
  it('maps aliases to the most specific event', () => {
    expect(matchEvent('Nigerian wedding')).toMatchObject({ status: 'alias', event: { id: 'african-wedding' } });
    expect(matchEvent('Muslim wedding').event.id).toBe('nikah');
    expect(matchEvent('Tet').event.id).toBe('lunar-new-year');
    expect(matchEvent('tet festival').event.id).toBe('lunar-new-year');
    expect(matchEvent('Wedding reception').event.id).toBe('western-wedding');
    expect(matchEvent('Indian wedding').event.id).toBe('indian-wedding');
    expect(matchEvent('Black-Tie!').event.id).toBe('black-tie');
    expect(matchEvent('Diwālī').event.id).toBe('diwali');
    expect(matchEvent('Diwali and Eid party').status).toBe('ambiguous');
    expect(matchEvent('').status).toBe('default');
  });
  it('never matches inside words', () => {
    for (const s of ['music festival', 'first birthday', 'quartet concert', "Heidi's birthday"]) {
      const m = matchEvent(s);
      expect(['none', 'ambiguous']).toContain(m.status);
      expect(findEvent(s).id).toBe('custom');
    }
  });
  it('/api/suggest asks the user when the occasion is unmatched, and honours confirmCustom', async () => {
    const app = await createApp({ ...opts, db: createMemoryDb(), fetchImpl: router() });
    const ag = await signup(app);
    for (const s of ['music festival', 'first birthday', 'quartet concert', "Heidi's birthday"]) {
      const r = (await ag.post('/api/suggest').send({ event: s, useWeather: false }).expect(200)).body;
      expect(r.needsEvent).toBe(true); expect(r.outfits).toEqual([]);
      expect(['none', 'ambiguous']).toContain(r.eventMatch.status);
      for (const c of r.eventMatch.candidates) expect(['st-patricks', 'lunar-new-year', 'eid']).not.toContain(c.id);
    }
    const r = (await ag.post('/api/suggest').send({ event: 'Something unusual', confirmCustom: true, useWeather: false }).expect(200)).body;
    expect(r.event.id).toBe('custom'); expect(r.event.formality).toEqual([2, 3]); expect(r.outfits.length).toBeGreaterThan(0);
    expect((await ag.post('/api/suggest').send({ event: 'Diwali', useWeather: false })).body.eventMatch.status).toBe('exact');
  });
});

describe('B3 dates past the forecast', () => {
  it('Dubai months out gives a labelled climate normal, not a raw API error', async () => {
    const app = await createApp({ ...opts, db: createMemoryDb(), fetchImpl: router() });
    const ag = await signup(app);
    const r = (await ag.post('/api/suggest').send({ event: 'casual', q: 'Dubai', date: ahead(0, '01-15') }).expect(200)).body;
    const w = r.weather;
    expect(w.source).toBe('climate-normal'); expect(w.estimate).toBe(true);
    expect(w.tmin).toBeGreaterThanOrEqual(10); expect(w.tmax).toBeGreaterThanOrEqual(20); expect(w.tmax).toBeLessThanOrEqual(30);
    expect(w.conditions).not.toContain('cold'); expect(w.conditions).not.toContain('freezing');
    expect(w.note.startsWith('Estimate:')).toBe(true); expect(w.note).not.toContain("Parameter 'start_date'");
  });
  it('tropics and hemispheres get the right season / heat', async () => {
    const f = router(); const c = new Map();
    const sg = await getWeather({ q: 'Singapore', date: ahead(0, '07-15') }, f, { cache: c });
    expect(sg.conditions).toContain('hot');
    expect((await getWeather({ q: 'Sydney', date: ahead(0, '07-15') }, f, { cache: c })).season).toBe('winter');
    expect((await getWeather({ q: 'Oslo', date: ahead(0, '07-15') }, f, { cache: c })).season).toBe('summer');
  });
  it('falls back archive → climate model → band estimate without throwing', async () => {
    const f1 = router({ archive: 'reject' });
    const w1 = await getWeather({ q: 'Dubai', date: ahead(40) }, f1, { cache: new Map() });
    expect(f1.calls.some(u => u.includes('models='))).toBe(true); expect(w1.source).toBe('climate-model'); expect(w1.estimate).toBe(true);
    const f2 = router({ archive: 'reject', climate: 'reject' });
    const w2 = await getWeather({ q: 'Dubai', date: ahead(40) }, f2, { cache: new Map() });
    expect(w2).toMatchObject({ source: 'seasonal-estimate', estimate: true }); expect(w2.note.startsWith('Estimate:')).toBe(true);
  });
  it('caches normals: the second identical request makes 0 archive fetches', async () => {
    const f = router(); const cache = new Map();
    await getWeather({ q: 'Dubai', date: ahead(60) }, f, { cache });
    const n = f.calls.filter(u => u.includes('archive-api')).length; expect(n).toBe(5);
    await getWeather({ q: 'Dubai', date: ahead(60) }, f, { cache });
    expect(f.calls.filter(u => u.includes('archive-api')).length).toBe(n);
  });
  it('rejects an invalid date with 400', async () => {
    const app = await createApp({ ...opts, db: createMemoryDb(), fetchImpl: router() });
    const ag = await signup(app);
    expect((await ag.post('/api/suggest').send({ event: 'casual', q: 'Dubai', date: 'foo' }).expect(400)).body).toEqual({ error: 'Invalid date' });
    await ag.get('/api/weather?q=Dubai&date=foo').expect(400);
  });
});

describe('B2 weather fit', () => {
  const hot = { tmin: 26, tmax: 37, feelsMax: 41 };
  it('black-tie in extreme heat: tuxedo is not the default, and is flagged when offered', () => {
    const { outfits, shopping } = suggestOutfits(items, { event: findEvent('Black-tie'), weather: hot, weatherApplies: true, setting: 'outdoor' });
    expect(outfits[0].items[0].name).not.toBe('Black tuxedo');
    const tux = outfits.find(o => o.items[0].name === 'Black tuxedo');
    if (tux) { expect(tux.warnings).toContain('heat'); expect(tux.reason).toContain('Very hot'); }
    expect(shopping.some(s => s.item.startsWith('Lightweight linen or cotton'))).toBe(true);
  });
  it('casual in extreme heat: no heavy pieces, breathable ones explained', () => {
    const { outfits } = suggestOutfits(items, { event: findEvent('Casual day out'), weather: hot, weatherApplies: true });
    for (const o of outfits) for (const i of o.items) expect(warmthOf(i)).not.toBe('heavy');
    expect(outfits.some(o => o.reason.includes('breathable'))).toBe(true);
  });
  it('level-1 heat: heavy items rank below lighter items of equal formality', () => {
    const closet = [
      { id: 1, name: 'Wool blazer set', type: 'suit', category: 'onepiece', color: 'grey', fabric: 'wool', formality: 4, seasons: '[]' },
      { id: 2, name: 'Linen suit', type: 'suit', category: 'onepiece', color: 'beige', fabric: 'linen', formality: 4, seasons: '[]' },
    ];
    const { outfits } = suggestOutfits(closet, { event: findEvent('business'), weather: { tmin: 22, tmax: 30, feelsMax: 30 }, weatherApplies: true });
    expect(outfits[0].items[0].name).toBe('Linen suit');
  });
  it('cold: no shorts/sandals when alternatives exist, outerwear included', () => {
    const closet = [...items, { id: 900, name: 'Khaki shorts', type: 'shorts', category: 'bottom', color: 'khaki', fabric: 'cotton', formality: 1, seasons: '["summer"]' },
      { id: 901, name: 'Leather sandals', type: 'sandals', category: 'shoes', color: 'brown', fabric: 'leather', formality: 1, seasons: '["summer"]' }];
    const { outfits } = suggestOutfits(closet, { event: findEvent('casual'), weather: { tmin: -2, tmax: 5 }, weatherApplies: true });
    for (const o of outfits) { expect(o.items.some(i => /shorts|sandals/.test(i.type))).toBe(false); expect(o.items.some(i => i.category === 'outerwear')).toBe(true); }
  });
});

describe('indoor/outdoor toggle', () => {
  let app;
  beforeAll(async () => { app = await createApp({ ...opts, db: createMemoryDb(), fetchImpl: router({ forecast: HOT_DUBAI }) }); });
  it('indoor ignores Dubai heat; outdoor applies it; indoor+opt-in equals outdoor', async () => {
    const ag = await signup(app);
    const base = { event: 'Black-tie', q: 'Dubai' };
    const ind = (await ag.post('/api/suggest').send({ ...base, setting: 'indoor', useWeather: false }).expect(200)).body;
    expect(ind.weatherApplies).toBe(false); expect(ind.outfits[0].items[0].name).toBe('Black tuxedo');
    expect(ind.outfits.every(o => !o.warnings.length)).toBe(true); expect(ind.outfits[0].reason).not.toMatch(/Forecast|Typical weather/);
    const out = (await ag.post('/api/suggest').send({ ...base, setting: 'outdoor' }).expect(200)).body;
    expect(out.weatherApplies).toBe(true); expect(out.weather.heat.level).toBe(3);
    expect(out.outfits[0].items[0].name).not.toBe('Black tuxedo');
    expect(out.outfits.find(o => o.items[0].name === 'Black tuxedo').warnings).toContain('heat');
    const opt = (await ag.post('/api/suggest').send({ ...base, setting: 'indoor', useWeather: true }).expect(200)).body;
    expect(opt.outfits).toEqual(out.outfits);
  });
  it('indoor in rain/cold gives a commute layer hint without changing the outfits', async () => {
    const rapp = await createApp({ ...opts, db: createMemoryDb(), fetchImpl: router({ forecast: RAIN_COLD }) });
    const ag = await signup(rapp);
    const ind = (await ag.post('/api/suggest').send({ event: 'business', q: 'Oslo', setting: 'indoor', useWeather: false }).expect(200)).body;
    const none = (await ag.post('/api/suggest').send({ event: 'business', useWeather: false }).expect(200)).body;
    expect(ind.transitLayer).not.toBeNull(); expect(ind.transitLayer.why).toContain('way there');
    expect(ind.outfits.map(o => [o.itemIds, o.score])).toEqual(none.outfits.map(o => [o.itemIds, o.score]));
  });
  it('indoor without a location makes no weather call; bad setting is rejected', async () => {
    const f = router(); const a = await createApp({ ...opts, db: createMemoryDb(), fetchImpl: f });
    const ag = await signup(a);
    const r = (await ag.post('/api/suggest').send({ event: 'casual', setting: 'indoor', useWeather: false }).expect(200)).body;
    expect(f.calls.length).toBe(0); expect(r.transitLayer).toBeNull(); expect(r.weather).toBeNull();
    await ag.post('/api/suggest').send({ event: 'casual', setting: 'garden' }).expect(400);
  });
});

describe('B1 colour reasoning', () => {
  const it2 = (color, hex) => ({ id: Math.random(), name: color + ' piece', color, color_hex: hex });
  const rel = (a, b) => relation(colorInfo(it2(...a)), colorInfo(it2(...b))).type;
  it('classifies pairs on the RYB wheel', () => {
    expect(rel(['red', '#dc2626'], ['green', '#16a34a'])).toBe('complementary');
    expect(rel(['blue', '#2563eb'], ['orange', '#f97316'])).toBe('complementary');
    expect(rel(['yellow', '#facc15'], ['purple', '#9333ea'])).toBe('complementary');
    expect(rel(['blue', '#2563eb'], ['teal', '#0d9488'])).toBe('analogous');
    expect(rel(['navy', '#1e3a8a'], ['pink', '#ec4899'])).toBe('neutral');
    expect(rel(['yellow', '#facc15'], ['blue', '#2563eb'])).not.toBe('complementary');
    expect(colorMatch('tangerine', ['tan'])).toBe(false);
    expect(colorMatch('tan', ['tan'])).toBe(true);
  });
  it('explains complementary and neutral pairings in the reason', () => {
    const closet = [{ id: 1, name: 'Red tee', type: 't-shirt', category: 'top', color: 'red', color_hex: '#dc2626', formality: 2, seasons: '[]' },
      { id: 2, name: 'Green trousers', type: 'trousers', category: 'bottom', color: 'green', color_hex: '#16a34a', formality: 2, seasons: '[]' }];
    const o = suggestOutfits(closet, { event: findEvent('casual'), weather: null }).outfits[0];
    expect(o.reason).toContain('complementary'); expect(o.colorHarmony[0].type).toBe('complementary');
    const closet2 = [{ id: 1, name: 'Navy shirt', type: 'shirt', category: 'top', color: 'navy', color_hex: '#1e3a8a', formality: 2, seasons: '[]' },
      { id: 2, name: 'Pink skirt', type: 'skirt', category: 'bottom', color: 'pink', color_hex: '#ec4899', formality: 2, seasons: '[]' }];
    expect(suggestOutfits(closet2, { event: findEvent('casual'), weather: null }).outfits[0].reason).toContain('navy is a neutral');
  });
  it('B1 repro: the saree is not credited with the shoes\' black', () => {
    const saree = items.find(i => i.name === 'Pink banarasi saree'), shoes = items.find(i => i.name === 'Black oxford shoes');
    const { outfits } = suggestOutfits([saree, shoes], { event: findEvent('Black-tie'), weather: null });
    const r = outfits[0].reason;
    const main = r.slice(r.indexOf('Pink banarasi saree works for Black-tie'), r.indexOf('.'));
    expect(main).not.toContain('black suits Black-tie');
    for (const m of r.matchAll(/black suits Black-tie/g)) expect(r.slice(Math.max(0, m.index - 'Black oxford shoes: '.length), m.index)).toBe('Black oxford shoes: ');
  });
  it('property: every colour word in a clause belongs to the item named in it', () => {
    const COLORS = ['black', 'white', 'red', 'green', 'blue', 'pink', 'gold', 'orange', 'yellow', 'purple', 'maroon', 'navy', 'grey', 'cream', 'beige', 'brown', 'tan', 'camel', 'olive', 'mint', 'denim'];
    const evs = ['Diwali', 'Black-tie', 'Eid', 'Indian wedding', 'casual', 'business', 'Christmas', 'Lunar New Year', 'Funeral (Western)', 'Mehndi'];
    const ws = [null, { tmin: 26, tmax: 37, feelsMax: 41 }, { tmin: -2, tmax: 5 }, { tmin: 15, tmax: 22, precipProb: 90, precip: 10 }];
    const byName = Object.fromEntries(items.map(i => [i.name, i]));
    let checked = 0;
    evs.forEach((e, k) => {
      const ev = findEvent(e);
      for (const o of suggestOutfits(items, { event: ev, weather: ws[k % ws.length] }).outfits) {
        const strip = t => t.replace(new RegExp(ev.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
        // main clause
        const main = o.items[0];
        const mc = o.reason.match(new RegExp(`${main.name} works for [^:.]*(?:: ([^.]*))?\\.`));
        const words = t => COLORS.filter(c => new RegExp(`\\b${c}\\b`, 'i').test(strip(t || '')));
        for (const c of words(mc[1])) { expect(main.color).toContain(c); checked++; }
        // "Item: note." clauses
        for (const m of o.reason.matchAll(/ ([A-Z][^.:()]+): ([^.]*)\./g)) {
          const it = byName[m[1].trim()]; if (!it) continue;
          if (/is a neutral|neutral palette|colour wheel|same hue/.test(m[2])) continue;
          for (const c of words(m[2])) { expect(it.color).toContain(c); checked++; }
        }
        // "A (colour) and B (colour)" pairs
        for (const m of o.reason.matchAll(/([A-Z][^.():]+?) \(([^)]+)\)/g)) { const it = byName[m[1].trim()]; if (it) { expect(it.color).toBe(m[2]); checked++; } }
      }
    });
    expect(checked).toBeGreaterThan(10);
  });
});
