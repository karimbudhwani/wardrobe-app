// Open-Meteo (no API key; CC-BY 4.0, non-commercial free tier). fetchImpl injectable for tests.
const FORECAST_DAYS = 16;
const HISTORY_DAYS = 92; // the forecast API serves ~3 months back
const NORMAL_YEARS = 5; // "typical" = mean of the last 5 complete years (not a WMO 30-year normal)
const CACHE_TTL = 7 * 24 * 3600 * 1000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Heat bands from feels-like temperature (NWS heat index: caution 27, extreme caution 32, danger 39 °C).
function heatOf(w) {
  const feels = w.feelsMax ?? w.tmax;
  const level = feels >= 39 ? 3 : feels >= 32 ? 2 : feels >= 27 ? 1 : 0;
  return { level, feelsMax: feels == null ? null : Math.round(feels), label: ['none', 'hot', 'very-hot', 'extreme-heat'][level] };
}

function classify(w) {
  const c = [];
  const avg = (w.tmax + w.tmin) / 2;
  if (avg <= 8) c.push('cold'); else if (avg <= 16) c.push('cool'); else if (w.tmax >= 30) c.push('hot'); else c.push('mild');
  const h = heatOf(w);
  if (h.level >= 1 && !c.includes('hot')) { const m = c.indexOf('mild'); if (m >= 0) c.splice(m, 1); c.push('hot'); }
  if (h.level === 2) c.push('very-hot');
  if (h.level === 3) c.push('extreme-heat');
  if (w.precipProb >= 50 || w.precip >= 2) c.push('rainy');
  if (w.wind >= 30) c.push('windy');
  if (w.humidity >= 75 && w.tmax >= 24) c.push('humid');
  if (w.tmin <= 0) c.push('freezing');
  return c;
}

const monthSeason = (m, lat) => {
  let s = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'][m];
  if (lat < 0) s = { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' }[s];
  return s;
};
// Outside the tropics: month + hemisphere. In the tropics (|lat| < 23.5) the calendar season says little,
// so derive it from the temperature when we have one.
function seasonFor(date, lat = 45, w) {
  const m = new Date(date).getUTCMonth();
  if (Math.abs(lat) < 23.5 && w && w.tmax != null && w.tmin != null) {
    const mean = (w.tmax + w.tmin) / 2;
    if (mean >= 24) return 'summer';
    if (mean >= 16) { const s = monthSeason(m, lat); return s === 'autumn' || s === 'winter' ? 'autumn' : 'spring'; }
    return 'winter';
  }
  return monthSeason(m, lat);
}

const finish = (w, lat) => { const out = { ...w, season: seasonFor(w.date, lat ?? 45, w) }; out.conditions = classify(out); out.heat = heatOf(out); return out; };

// Last-resort offline estimate by latitude band. Low confidence; always labelled.
function bandEstimate(date, label = 'your area', lat = 45) {
  const tropical = Math.abs(lat) < 23.5;
  const t = tropical ? [31, 23] : { winter: [6, -1], spring: [17, 8], summer: [29, 19], autumn: [16, 8] }[monthSeason(new Date(date).getUTCMonth(), lat)];
  const w = { location: label, date, tmax: t[0], tmin: t[1], precipProb: 30, precip: 0.5, wind: 12, humidity: 60, source: 'seasonal-estimate', estimate: true,
    note: `Estimate: rough seasonal guess for ${label} in ${MONTHS[new Date(date).getUTCMonth()]} (weather data unavailable). Not a forecast.` };
  return finish(w, lat);
}
const estimate = bandEstimate; // backward-compatible name

const isoDay = d => d.toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const nums = a => (a || []).filter(v => typeof v === 'number' && !Number.isNaN(v));
async function getJson(fetchImpl, url) {
  const r = await fetchImpl(url);
  const j = await r.json();
  if ((r.ok === false) || !j || j.error) throw new Error(`open-meteo: ${(j && j.reason) || r.status || 'bad response'}`);
  return j;
}
function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(date + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && isoDay(d) === date;
}
const invalidDate = () => Object.assign(new Error('Invalid date'), { status: 400, expose: true });

function poolDaily(dailies) {
  const g = k => nums(dailies.flatMap(d => d[k] || []));
  const tmax = g('temperature_2m_max'), tmin = g('temperature_2m_min');
  if (!tmax.length || !tmin.length) return null;
  const precip = g('precipitation_sum'), feels = g('apparent_temperature_max'), wind = g('wind_speed_10m_max'), rh = g('relative_humidity_2m_mean');
  const r1 = x => Math.round(x * 10) / 10;
  return { tmax: r1(mean(tmax)), tmin: r1(mean(tmin)), feelsMax: feels.length ? r1(mean(feels)) : undefined,
    precipProb: precip.length ? Math.round(100 * precip.filter(p => p >= 1).length / precip.length) : 0,
    precip: precip.length ? r1(mean(precip)) : 0, wind: wind.length ? r1(mean(wind)) : 0, humidity: rh.length ? Math.round(mean(rh)) : 50 };
}

// Typical weather for a date: average of the same ±7-day window over the last 5 complete years (Historical API),
// then the CMIP6 Climate API, then the latitude-band guess. Never throws.
async function climateNormal({ lat, lon, date, label }, fetchImpl, cache) {
  const key = `${(+lat).toFixed(1)},${(+lon).toFixed(1)},${date.slice(5)}`;
  const hit = cache && cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return finish({ ...hit.w, location: label, date, lat, lon }, lat);
  const md = date.slice(5) === '02-29' ? '02-28' : date.slice(5);
  const month = MONTHS[+date.slice(5, 7) - 1];
  const y0 = new Date().getUTCFullYear() - 1;
  const vars = 'temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_mean';
  const years = Array.from({ length: NORMAL_YEARS }, (_, k) => y0 - k);
  const settled = await Promise.allSettled(years.map(y => {
    const c = `${y}-${md}`;
    return getJson(fetchImpl, `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${addDays(c, -7)}&end_date=${addDays(c, 7)}&daily=${vars}&timezone=auto`);
  }));
  const ok = settled.filter(s => s.status === 'fulfilled' && s.value.daily && nums(s.value.daily.temperature_2m_max).length).map(s => s.value.daily);
  let w = null;
  if (ok.length >= 2) {
    const p = poolDaily(ok);
    if (p) w = { ...p, source: 'climate-normal', estimate: true,
      note: `Estimate: typical ${month} weather for ${label} (average of ${ok.length} years, ${years[ok.length - 1]}–${y0}). Not a forecast.` };
  } else {
    settled.filter(s => s.status === 'rejected').forEach(s => console.warn('[weather] archive', s.reason?.message));
  }
  if (!w && +date.slice(0, 4) <= 2050) {
    try {
      const j = await getJson(fetchImpl, `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lon}&start_date=${addDays(date.slice(0, 5) + md, -7)}&end_date=${addDays(date.slice(0, 5) + md, 7)}&models=EC_Earth3P_HR&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_mean`);
      const p = j.daily && poolDaily([j.daily]);
      if (p) w = { ...p, source: 'climate-model', estimate: true, note: `Estimate: typical ${month} weather for ${label} from a climate model (CMIP6). Not a forecast.` };
    } catch (e) { console.warn('[weather] climate', e.message); }
  }
  if (!w) return bandEstimate(date, label, lat);
  if (cache) cache.set(key, { at: Date.now(), w });
  return finish({ ...w, location: label, date, lat, lon }, lat);
}

const defaultCache = new Map();
async function getWeather({ q, lat, lon, date }, fetchImpl = globalThis.fetch, opts = {}) {
  const cache = opts.cache || defaultCache;
  date = date || isoDay(new Date());
  if (!validDate(date)) throw invalidDate();
  if (lat != null) { lat = +lat; lon = +lon; }
  let label = q || (lat != null ? `${lat.toFixed(2)}, ${lon.toFixed(2)}` : 'your area');
  try {
    if (q && (lat == null || lon == null)) {
      const g = await (await fetchImpl(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1`)).json();
      if (!g.results || !g.results.length) throw new Error('Location not found');
      ({ latitude: lat, longitude: lon } = g.results[0]);
      label = [g.results[0].name, g.results[0].admin1, g.results[0].country].filter(Boolean).join(', ');
    }
  } catch (e) {
    if (e.message === 'Location not found') throw Object.assign(e, { status: 400, expose: true });
    console.warn('[weather] geocoding', e.message);
    return bandEstimate(date, label, 45);
  }
  if (lat == null) return bandEstimate(date, label);
  const daysAhead = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(isoDay(new Date()) + 'T00:00:00Z')) / 86400000);
  if (daysAhead > FORECAST_DAYS - 1) return climateNormal({ lat, lon, date, label }, fetchImpl, cache);
  try {
    let d;
    if (daysAhead < -HISTORY_DAYS) {
      const j = await getJson(fetchImpl, `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_mean&timezone=auto`);
      d = j.daily;
      if (d && d.temperature_2m_max?.[0] != null) {
        const p = poolDaily([d]);
        return finish({ location: label, date, lat, lon, ...p, source: 'historical', note: `Recorded weather for ${label} on ${date} (Open-Meteo historical data).` }, lat);
      }
    } else {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_mean&timezone=auto&start_date=${date}&end_date=${date}`;
      const r = await (await fetchImpl(url)).json();
      d = r.daily;
      if (d && d.temperature_2m_max?.[0] != null) {
        const w = { location: label, date, lat, lon, tmax: d.temperature_2m_max[0], tmin: d.temperature_2m_min[0], feelsMax: d.apparent_temperature_max?.[0] ?? undefined,
          precipProb: d.precipitation_probability_max?.[0] ?? 0, precip: d.precipitation_sum?.[0] ?? 0, wind: d.wind_speed_10m_max?.[0] ?? 0, humidity: d.relative_humidity_2m_mean?.[0] ?? 50, source: 'open-meteo' };
        return finish(w, lat);
      }
      if (r.reason) console.warn('[weather] forecast', r.reason); // never shown to the user
    }
  } catch (e) { console.warn('[weather] forecast', e.message); }
  return climateNormal({ lat, lon, date, label }, fetchImpl, cache);
}
module.exports = { getWeather, classify, estimate, bandEstimate, seasonFor, heatOf, climateNormal, validDate, FORECAST_DAYS };
