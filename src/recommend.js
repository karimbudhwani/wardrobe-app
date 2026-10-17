const { classify, heatOf } = require('./weather');

const BREATHABLE = ['cotton', 'linen', 'chambray', 'seersucker', 'khadi', 'mul'];
const WARM = ['wool', 'cashmere', 'fleece', 'tweed', 'down', 'velvet', 'corduroy', 'flannel'];
const RAIN_BAD = ['suede', 'silk', 'canvas', 'velvet'];
const PASTELS = ['pastel', 'pink', 'light blue', 'lavender', 'mint', 'peach', 'cream', 'baby blue'];
const HEAVY_TYPES = /\b(tuxedo|suit|blazer|coat|overcoat|parka|puffer|sherwani|sweater|jumper|hoodie|cardigan|boots?)\b/;
const LIGHT_TYPES = /\b(tee|t-shirt|tank|shorts|sandals?|polo|camisole|sundress)\b/;

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text, w) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(w)}(?![\\p{L}\\p{N}])`, 'u').test(text);
const colorMatch = (color, list) => {
  const c = (color || '').toLowerCase();
  return list.some(x => hasWord(c, x) || (x === 'pastel' && PASTELS.some(p => hasWord(c, p)))
    || (x === 'neutral' && /\b(beige|grey|gray|white|cream|navy|black|camel)\b/.test(c)));
};
const parse = (s, d) => { try { return typeof s === 'string' ? JSON.parse(s) : (s ?? d); } catch { return d; } };

// ---- warmth class (light / mid / heavy)
function warmthOf(item) {
  const fab = (item.fabric || '').toLowerCase(), type = (item.type || '').toLowerCase();
  if (WARM.some(w => hasWord(fab, w))) return 'heavy';
  if (item.waterproof) return 'mid'; // uninsulated rain shells / rain boots
  const breathable = BREATHABLE.some(b => hasWord(fab, b));
  if (HEAVY_TYPES.test(type) || item.category === 'outerwear') return breathable ? 'mid' : 'heavy'; // a linen suit is not a wool one
  if (item.pattern === 'embroidered' && item.category === 'onepiece' && hasWord(fab, 'silk')) return 'heavy'; // heavy-work saree/lehenga
  if (breathable || LIGHT_TYPES.test(type)) return 'light';
  return 'mid';
}
const heatLevel = cond => cond.includes('extreme-heat') ? 3 : cond.includes('very-hot') ? 2 : (cond.includes('hot') || cond.includes('humid')) ? 1 : 0;

// ---- colour theory (W3C rgb→hsl, remapped to the RYB artist's wheel)
const NEUTRAL_NAMES = /\b(black|white|grey|gray|charcoal|beige|cream|ivory|camel|tan|taupe|khaki|navy|denim|brown|olive)\b/;
function hsl(hex) {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex || ''); if (!m) return null;
  let h6 = m[1]; if (h6.length === 3) h6 = h6.split('').map(c => c + c).join('');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h6.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = l === 0 || l === 1 ? 0 : (max - l) / Math.min(l, 1 - l);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}
const RYB = [[0, 0], [30, 60], [60, 120], [120, 180], [240, 240], [280, 300], [360, 360]];
function toRyb(h) {
  for (let k = 1; k < RYB.length; k++) if (h <= RYB[k][0]) { const [a0, b0] = RYB[k - 1], [a1, b1] = RYB[k]; return b0 + (h - a0) * (b1 - b0) / (a1 - a0); }
  return h;
}
function colorInfo(item) {
  const c = (item.color || '').toLowerCase(), x = hsl(item.color_hex);
  const neutral = NEUTRAL_NAMES.test(c) || !!(x && (x.s < 0.15 || x.l < 0.12 || x.l > 0.94));
  const multi = /\band\b|\//.test(c);
  const name = item.color ? (multi ? `${item.color.split(/\s+and\s+|\//)[0].trim()} multicolour` : item.color) : 'unknown';
  return { item: item.name, id: item.id, color: name, neutral, ryb: x && !neutral ? toRyb(x.h) : null };
}
function relation(a, b) {
  if (a.neutral || b.neutral) return { type: 'neutral', score: 1 };
  if (a.ryb == null || b.ryb == null) return { type: 'unknown', score: 0 };
  const d = Math.min(Math.abs(a.ryb - b.ryb), 360 - Math.abs(a.ryb - b.ryb));
  if (d <= 15) return { type: 'monochrome', score: 0.5 };
  if (d <= 60) return { type: 'analogous', score: 1 };
  if (d >= 150) return { type: 'complementary', score: 1 };
  return { type: 'unrelated', score: -0.5 };
}
const EXPLAIN = {
  neutral: (a, b) => {
    if (a.neutral && b.neutral) return `${a.item} (${a.color}) and ${b.item} (${b.color}) keep a neutral palette`;
    const [n, o] = a.neutral ? [a, b] : [b, a];
    return `${a.item} (${a.color}) and ${b.item} (${b.color}): ${n.color} is a neutral, so it pairs with the ${o.color}`;
  },
  monochrome: (a, b) => `${a.item} (${a.color}) and ${b.item} (${b.color}) are tones of the same hue, a tonal look`,
  analogous: (a, b) => `${a.item} (${a.color}) and ${b.item} (${b.color}) are neighbours on the colour wheel (analogous), a calm, cohesive pairing`,
  complementary: (a, b) => `${a.item} (${a.color}) and ${b.item} (${b.color}) are opposite on the colour wheel (complementary), a high-contrast pairing`,
};
function harmony(a, b) {
  let s = relation(colorInfo(a), colorInfo(b)).score;
  if ((a.pattern || 'solid') !== 'solid' && (b.pattern || 'solid') !== 'solid') s -= 2;
  return s;
}

// ---- context helpers
const weatherOn = ctx => (ctx.weatherApplies ?? !!ctx.weather) && !!ctx.weather;
function condOf(ctx) {
  if (!weatherOn(ctx)) return [];
  const w = ctx.weather;
  return w.conditions || classify({ precipProb: 0, precip: 0, wind: 0, humidity: 50, ...w });
}

function scoreItem(item, ctx) {
  const { event, weather } = ctx;
  let s = 0; const why = []; const flags = [];
  const say = text => why.push({ itemId: item.id, text });
  const fab = (item.fabric || '').toLowerCase();
  const seasons = parse(item.seasons, []);
  // formality
  const [fmin, fmax] = event.formality;
  const f = item.formality || 2;
  if (f >= fmin && f <= fmax) s += 3; else s -= Math.min(Math.abs(f - fmin), Math.abs(f - fmax)) * 2;
  // colors
  if (event.avoid.length && colorMatch(item.color, event.avoid)) { s -= 6; say(`${item.color} is usually avoided for ${event.name}`); }
  if (event.favor.length && colorMatch(item.color, event.favor)) { s += 2.5; say(`${item.color} suits ${event.name}`); }
  // modesty
  if (event.modest && !item.modest) s -= 5;
  // style
  const trad = item.cultural_style && item.cultural_style !== 'western';
  if (event.style === 'traditional') s += (event.culture && item.cultural_style === event.culture) ? 4 : trad ? 1 : -1;
  if (event.style === 'fusion') s += trad ? 2.5 : 1;
  if (event.style === 'western' && trad) s -= 1.5;
  if (!event.culture && event.style === 'any' && trad && item.category !== 'accessory') s -= 0.5;
  // weather (only when it applies: outdoor, or indoor with explicit opt-in)
  if (weatherOn(ctx)) {
    const cond = condOf(ctx);
    if (seasons.includes(weather.season)) s += 1;
    const heat = heatLevel(cond), wc = warmthOf(item);
    if (heat >= 2 && wc === 'heavy' && item.category !== 'accessory') { s -= 100; flags.push('too-warm'); }
    else if (heat >= 1 && wc === 'heavy') { s -= 6; flags.push('warm-for-heat'); }
    if (heat >= 1 && wc === 'light') { s += 2; say(`light, breathable ${item.fabric || item.type}`); }
    if (cond.includes('cold') || cond.includes('cool') || cond.includes('freezing')) {
      if (WARM.some(b => hasWord(fab, b))) { s += 2; say(`warm ${fab}`); }
      if ((cond.includes('cold') || cond.includes('freezing')) && wc === 'light' && ['top', 'bottom', 'onepiece', 'shoes'].includes(item.category)) s -= LIGHT_TYPES.test((item.type || '').toLowerCase()) ? 8 : 3;
      else if (/linen|shorts|sandal/.test(fab + ' ' + (item.type || ''))) s -= 3;
    }
    if (cond.includes('rainy')) {
      if (item.category === 'shoes') { if (item.waterproof) { s += 5; say('rain-safe shoes'); } else { s -= 2; if (RAIN_BAD.some(b => fab.includes(b)) || /sandal|suede/.test(item.type)) s -= 4; } }
      if (item.category === 'outerwear' && item.waterproof) { s += 3; say('waterproof layer'); }
      if (RAIN_BAD.some(b => fab.includes(b)) && item.category !== 'accessory') s -= 1;
    }
  }
  return { s, why, flags };
}

const meetsFormality = (pieces, ev) => pieces.every(p => (p.i.formality || 2) >= ev.formality[0]);

function suggestOutfits(items, ctx, n = 3) {
  const by = c => items.filter(i => i.category === c).map(i => ({ i, ...scoreItem(i, ctx) })).sort((a, b) => b.s - a.s);
  const all = { tops: by('top'), bottoms: by('bottom'), one: by('onepiece'), shoes: by('shoes'), outer: by('outerwear'), acc: by('accessory') };
  const ok = p => !p.flags.includes('too-warm');
  // Exclude too-warm pieces; if that empties a pool, keep its best piece (flagged) so we never return nothing.
  const keep = pool => (pool.some(ok) ? pool.filter(ok) : pool.slice(0, 1));
  const tops = keep(all.tops), bottoms = keep(all.bottoms), one = keep(all.one), shoes = keep(all.shoes), acc = all.acc;
  const cond = condOf(ctx); const heat = heatLevel(cond);
  const needLayer = cond.some(c => ['cold', 'cool', 'rainy', 'windy', 'freezing'].includes(c));
  let outer = keep(all.outer);
  if (heat >= 1) outer = outer.filter(p => p.i.waterproof && cond.includes('rainy') && warmthOf(p.i) !== 'heavy');
  const mkBases = (T, B, O) => {
    const out = [];
    for (const t of T.slice(0, 6)) for (const b of B.slice(0, 6)) out.push({ pieces: [t, b], s: t.s + b.s + harmony(t.i, b.i) });
    for (const o of O.slice(0, 6)) out.push({ pieces: [o], s: o.s * 2 + 0.5 });
    return out.sort((a, b) => b.s - a.s);
  };
  const bases = mkBases(tops, bottoms, one);
  // Heat fallback: if no breathable base meets the dress code, offer the best excluded formal base with a heat warning.
  let flagged = null;
  if (heat >= 2 && !bases.some(b => meetsFormality(b.pieces, ctx.event))) {
    const ex = mkBases(all.tops, all.bottoms, all.one).filter(b => b.pieces.some(p => !ok(p)) && meetsFormality(b.pieces, ctx.event));
    if (ex.length) flagged = ex[0];
  }
  const chosen = []; const used = new Set();
  for (const base of bases) {
    if (chosen.length >= (flagged ? n - 1 : n)) break;
    const key = base.pieces[0].i.id;
    if (used.has(key) || (flagged && key === flagged.pieces[0].i.id)) continue;
    used.add(key); chosen.push(base);
  }
  if (flagged) chosen.push(flagged);
  const outfits = chosen.map((base, k) => {
    const pieces = [...base.pieces];
    const sh = shoes[k % Math.max(1, Math.min(2, shoes.length))] || shoes[0]; if (sh) pieces.push(sh);
    if (needLayer && outer[0]) pieces.push(outer[k % Math.min(2, outer.length)] || outer[0]);
    const a = acc.find(x => x.s > 1); if (a) pieces.push(a);
    return buildOutfit(pieces, base.s, ctx, { tops: all.tops, bottoms: all.bottoms, one: all.one, shoes: all.shoes, outer: all.outer });
  });
  return { outfits, shopping: shoppingList(ctx, { tops: all.tops, bottoms: all.bottoms, one: all.one, shoes: all.shoes, outer: all.outer }) };
}

const RANK = { complementary: 4, analogous: 3, neutral: 2, monochrome: 1 };
function colourSummary(pieces) {
  const main = pieces[0].i, mi = colorInfo(main);
  const others = pieces.slice(1).filter(p => p.i.category !== 'accessory');
  const rels = others.map(p => { const oi = colorInfo(p.i); return { a: mi, b: oi, ...relation(mi, oi) }; });
  const best = rels.filter(r => RANK[r.type]).sort((x, y) => RANK[y.type] - RANK[x.type])[0];
  const sentence = best ? EXPLAIN[best.type](best.a, best.b) : '';
  const notes = [];
  const hues = pieces.filter(p => p.i.category !== 'accessory').map(p => colorInfo(p.i)).filter(c => !c.neutral && c.ryb != null);
  const distinct = [...new Map(hues.map(h => [h.color, h])).values()];
  if (distinct.length >= 3) {
    let linked = false;
    for (let x = 0; x < distinct.length; x++) for (let y = x + 1; y < distinct.length; y++) if (['analogous', 'complementary'].includes(relation(distinct[x], distinct[y]).type)) linked = true;
    if (!linked) notes.push(`bold mix of ${distinct.map(d => d.color).join(', ')}`);
  }
  return { sentence, notes, harmony: rels.map(r => ({ a: r.a.id, b: r.b.id, type: r.type })) };
}

function buildOutfit(pieces, score, ctx, pools) {
  const { event, weather } = ctx;
  const main = pieces[0];
  const nameOf = id => pieces.find(p => p.i.id === id)?.i.name;
  const mainWhy = [...new Set(main.why.map(w => w.text))].slice(0, 3);
  const otherWhy = []; const seen = new Set();
  for (const p of pieces.slice(1)) for (const w of p.why) { const k = w.itemId + w.text; if (!seen.has(k)) { seen.add(k); otherWhy.push(w); } }
  const col = colourSummary(pieces);
  const warnings = [];
  let reason = '';
  if (pieces.some(p => p.flags.includes('too-warm'))) {
    warnings.push('heat');
    const heavy = pieces.find(p => p.flags.includes('too-warm')).i.name;
    const feels = weather?.heat?.feelsMax ?? Math.round(weather?.feelsMax ?? weather?.tmax);
    reason += `⚠ Very hot (feels like ${feels}°C): ${heavy} is heavy; keep it for indoors or choose a lighter alternative. `;
  }
  reason += `${main.i.name} works for ${event.name}${mainWhy.length ? ': ' + mainWhy.join(', ') : ''}.`;
  if (col.sentence) reason += ` ${col.sentence}.`;
  reason += otherWhy.slice(0, 2).map(w => ` ${nameOf(w.itemId)}: ${w.text}.`).join('');
  if (weatherOn(ctx)) { const c = condOf(ctx); reason += ` ${weather.estimate ? 'Typical weather' : 'Forecast'} ${Math.round(weather.tmin)}–${Math.round(weather.tmax)}°C${c.length ? ' (' + c.join(', ') + ')' : ''}.`; }
  const pool = { top: pools.tops, bottom: pools.bottoms, onepiece: pools.one, shoes: pools.shoes, outerwear: pools.outer }[main.i.category] || [];
  const alt = pool.find(p => p.i.id !== main.i.id && !pieces.some(x => x.i.id === p.i.id) && !p.flags.includes('too-warm'));
  const fallback = alt ? `If ${main.i.name} isn't available, swap in your ${alt.i.name}.`
    : `If ${main.i.name} isn't available, consider buying ${buyHint(main.i.category, ctx)}.`;
  return { items: pieces.map(p => p.i), itemIds: pieces.map(p => p.i.id), score: Math.round(score * 10) / 10, reason, fallback, notes: event.notes,
    warnings, colorHarmony: col.harmony, colorNotes: col.notes };
}

function buyHint(cat, ctx) {
  const { event } = ctx;
  const col = event.favor[0] || 'neutral';
  const cond = condOf(ctx);
  const map = {
    top: event.style === 'traditional' ? `a ${col} kurta or blouse` : `a ${col} ${event.formality[0] >= 4 ? 'dress shirt' : 'top'}`,
    bottom: event.formality[0] >= 4 ? 'tailored trousers' : 'chinos or dark jeans',
    onepiece: event.style === 'traditional' ? `a ${col} saree, lehenga or sherwani` : `a ${col} dress or suit`,
    shoes: cond.includes('rainy') ? 'waterproof boots' : event.formality[0] >= 4 ? 'polished dress shoes' : 'versatile sneakers',
    outerwear: cond.includes('rainy') ? 'a packable rain jacket' : 'a light wool coat',
  };
  return map[cat] || 'a versatile staple';
}

function shoppingList(ctx, pools) {
  const list = []; const cond = condOf(ctx);
  if (cond.includes('rainy') && !pools.shoes.some(p => p.i.waterproof)) list.push({ item: 'Waterproof boots or loafers', why: 'Rain in the forecast and no rain-safe shoes in your closet' });
  if (cond.includes('rainy') && !pools.outer.some(p => p.i.waterproof)) list.push({ item: 'Packable rain jacket', why: 'Keeps you dry over any outfit' });
  if ((cond.includes('cold') || cond.includes('freezing')) && !pools.outer.length) list.push({ item: 'Warm wool coat', why: 'Cold forecast and no outerwear' });
  const fmin = ctx.event.formality[0];
  if (heatLevel(cond) >= 2 && ![...pools.tops, ...pools.one].some(p => warmthOf(p.i) === 'light' && (p.i.formality || 2) >= fmin))
    list.push({ item: 'Lightweight linen or cotton ' + (fmin >= 4 ? 'suit/dress' : 'top'), why: 'Very hot forecast and your closet lacks breathable options at this formality' });
  const best = Math.max(-99, ...[...pools.tops, ...pools.one].map(p => p.s));
  if (best < 3) list.push({ item: buyHint(ctx.event.style === 'traditional' ? 'onepiece' : 'top', ctx).replace(/^a /, ''), why: `Your closet lacks a strong match for ${ctx.event.name}` });
  return list;
}

module.exports = { suggestOutfits, scoreItem, colorMatch, warmthOf, colorInfo, relation, harmony, hsl, toRyb, EXPLAIN };
