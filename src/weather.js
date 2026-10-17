// Open-Meteo (no API key). fetchImpl injectable for tests.
function classify(w) {
  const c = [];
  const avg = (w.tmax + w.tmin) / 2;
  if (avg <= 8) c.push('cold'); else if (avg <= 16) c.push('cool'); else if (w.tmax >= 30) c.push('hot'); else c.push('mild');
  if (w.precipProb >= 50 || w.precip >= 2) c.push('rainy');
  if (w.wind >= 30) c.push('windy');
  if (w.humidity >= 75 && w.tmax >= 24) c.push('humid');
  if (w.tmin <= 0) c.push('freezing');
  return c;
}

function seasonFor(date, lat = 45) {
  const m = new Date(date).getUTCMonth();
  let s = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'][m];
  if (lat < 0) s = { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' }[s];
  return s;
}

function estimate(date, label = 'your area', lat = 45) {
  const s = seasonFor(date, lat);
  const t = { winter: [6, -1], spring: [17, 8], summer: [29, 19], autumn: [16, 8] }[s];
  const w = { location: label, date, tmax: t[0], tmin: t[1], precipProb: 30, precip: 0.5, wind: 12, humidity: 60, source: 'seasonal-estimate' };
  return { ...w, season: s, conditions: classify(w) };
}

async function getWeather({ q, lat, lon, date }, fetchImpl = globalThis.fetch) {
  date = date || new Date().toISOString().slice(0, 10);
  let label = q || (lat != null ? `${(+lat).toFixed(2)}, ${(+lon).toFixed(2)}` : 'your area');
  try {
    if (q && (lat == null || lon == null)) {
      const g = await (await fetchImpl(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1`)).json();
      if (!g.results || !g.results.length) throw new Error('Location not found');
      ({ latitude: lat, longitude: lon } = g.results[0]);
      label = [g.results[0].name, g.results[0].admin1, g.results[0].country].filter(Boolean).join(', ');
    }
    if (lat == null) return estimate(date, label);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_mean&timezone=auto&start_date=${date}&end_date=${date}`;
    const r = await (await fetchImpl(url)).json();
    if (!r.daily || r.daily.temperature_2m_max?.[0] == null) return { ...estimate(date, label, lat), note: r.reason || 'Date outside 16-day forecast window; using seasonal estimate.' };
    const d = r.daily;
    const w = { location: label, date, lat, lon, tmax: d.temperature_2m_max[0], tmin: d.temperature_2m_min[0], precipProb: d.precipitation_probability_max?.[0] ?? 0, precip: d.precipitation_sum?.[0] ?? 0, wind: d.wind_speed_10m_max?.[0] ?? 0, humidity: d.relative_humidity_2m_mean?.[0] ?? 50, source: 'open-meteo' };
    return { ...w, season: seasonFor(date, lat), conditions: classify(w) };
  } catch (e) {
    if (e.message === 'Location not found') throw e;
    return { ...estimate(date, label, lat ?? 45), note: 'Weather service unreachable; using seasonal estimate.' };
  }
}
module.exports = { getWeather, classify, estimate, seasonFor };
