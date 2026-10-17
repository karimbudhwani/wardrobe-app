const BREATHABLE = ['cotton', 'linen', 'chambray', 'seersucker', 'khadi', 'mul'];
const WARM = ['wool', 'cashmere', 'fleece', 'tweed', 'down', 'velvet', 'corduroy', 'flannel'];
const RAIN_BAD = ['suede', 'silk', 'canvas', 'velvet'];
const PASTELS = ['pastel', 'pink', 'light blue', 'lavender', 'mint', 'peach', 'cream', 'baby blue'];

const colorMatch = (color, list) => {
  const c = (color || '').toLowerCase();
  return list.some(x => c.includes(x) || (x === 'pastel' && PASTELS.some(p => c.includes(p))) || (x === 'neutral' && /beige|grey|gray|white|cream|navy|black|camel/.test(c)));
};
const parse = (s, d) => { try { return typeof s === 'string' ? JSON.parse(s) : (s ?? d); } catch { return d; } };

function scoreItem(item, ctx) {
  const { event, weather } = ctx;
  let s = 0; const why = [];
  const fab = (item.fabric || '').toLowerCase();
  const seasons = parse(item.seasons, []);
  // formality
  const [fmin, fmax] = event.formality;
  const f = item.formality || 2;
  if (f >= fmin && f <= fmax) s += 3; else s -= Math.min(Math.abs(f - fmin), Math.abs(f - fmax)) * 2;
  // colors
  if (event.avoid.length && colorMatch(item.color, event.avoid)) { s -= 6; why.push(`avoids ${item.color}`); }
  if (event.favor.length && colorMatch(item.color, event.favor)) { s += 2.5; why.push(`${item.color} suits ${event.name}`); }
  // modesty
  if (event.modest && !item.modest) s -= 5;
  // style
  const trad = item.cultural_style && item.cultural_style !== 'western';
  if (event.style === 'traditional') s += (event.culture && item.cultural_style === event.culture) ? 4 : trad ? 1 : -1;
  if (event.style === 'fusion') s += trad ? 2.5 : 1;
  if (event.style === 'western' && trad) s -= 1.5;
  if (!event.culture && event.style === 'any' && trad && item.category !== 'accessory') s -= 0.5;
  // weather
  if (weather) {
    const cond = weather.conditions || [];
    if (seasons.includes(weather.season)) s += 1;
    if (cond.includes('hot') || cond.includes('humid')) { if (BREATHABLE.some(b => fab.includes(b))) { s += 2; why.push(`breathable ${fab}`); } if (WARM.some(b => fab.includes(b))) s -= 4; }
    if (cond.includes('cold') || cond.includes('cool')) { if (WARM.some(b => fab.includes(b))) { s += 2; why.push(`warm ${fab}`); } if (/linen|shorts|sandal/.test(fab + item.type)) s -= 3; }
    if (cond.includes('rainy')) {
      if (item.category === 'shoes') { if (item.waterproof) { s += 5; why.push('rain-safe shoes'); } else { s -= 2; if (RAIN_BAD.some(b => fab.includes(b)) || /sandal|suede/.test(item.type)) s -= 4; } }
      if (item.category === 'outerwear' && item.waterproof) { s += 3; why.push('waterproof layer'); }
      if (RAIN_BAD.some(b => fab.includes(b)) && item.category !== 'accessory') s -= 1;
    }
  }
  return { s, why };
}

function suggestOutfits(items, ctx, n = 3) {
  const by = c => items.filter(i => i.category === c).map(i => ({ i, ...scoreItem(i, ctx) })).sort((a, b) => b.s - a.s);
  const tops = by('top'), bottoms = by('bottom'), one = by('onepiece'), shoes = by('shoes'), outer = by('outerwear'), acc = by('accessory');
  const cond = ctx.weather?.conditions || [];
  const needLayer = cond.some(c => ['cold', 'cool', 'rainy', 'windy', 'freezing'].includes(c));
  const bases = [];
  for (const t of tops.slice(0, 6)) for (const b of bottoms.slice(0, 6)) bases.push({ pieces: [t, b], s: t.s + b.s + harmony(t.i, b.i) });
  for (const o of one.slice(0, 6)) bases.push({ pieces: [o], s: o.s * 2 + 0.5 });
  bases.sort((a, b) => b.s - a.s);
  const used = new Set(); const outfits = [];
  for (const base of bases) {
    if (outfits.length >= n) break;
    const key = base.pieces[0].i.id;
    if (used.has(key)) continue;
    used.add(key);
    const k = outfits.length;
    const pieces = [...base.pieces];
    const sh = shoes[k % Math.max(1, Math.min(2, shoes.length))] || shoes[0]; if (sh) pieces.push(sh);
    if (needLayer && outer[0]) pieces.push(outer[k % Math.min(2, outer.length)] || outer[0]);
    const a = acc.find(x => x.s > 1); if (a) pieces.push(a);
    outfits.push(buildOutfit(pieces, base.s, ctx, { tops, bottoms, one, shoes, outer }));
  }
  return { outfits, shopping: shoppingList(ctx, { tops, bottoms, one, shoes, outer }) };
}

function harmony(a, b) {
  const neutral = /black|white|grey|gray|navy|beige|cream|denim|camel|khaki|blue jean/;
  if (neutral.test((a.color || '').toLowerCase()) || neutral.test((b.color || '').toLowerCase())) return 1;
  if ((a.pattern || 'solid') !== 'solid' && (b.pattern || 'solid') !== 'solid') return -2;
  return 0;
}

function buildOutfit(pieces, score, ctx, pools) {
  const { event, weather } = ctx;
  const main = pieces[0];
  const why = [...new Set(pieces.flatMap(p => p.why))].slice(0, 3);
  let reason = `${main.i.name} works for ${event.name}`;
  if (why.length) reason += `: ${why.join(', ')}`;
  if (weather) reason += `. Forecast ${Math.round(weather.tmin)}–${Math.round(weather.tmax)}°C${weather.conditions?.length ? ' (' + weather.conditions.join(', ') + ')' : ''}.`;
  const pool = { top: pools.tops, bottom: pools.bottoms, onepiece: pools.one, shoes: pools.shoes, outerwear: pools.outer }[main.i.category] || [];
  const alt = pool.find(p => p.i.id !== main.i.id && !pieces.some(x => x.i.id === p.i.id));
  const fallback = alt ? `If ${main.i.name} isn't available, swap in your ${alt.i.name}.`
    : `If ${main.i.name} isn't available, consider buying ${buyHint(main.i.category, ctx)}.`;
  return { items: pieces.map(p => p.i), itemIds: pieces.map(p => p.i.id), score: Math.round(score * 10) / 10, reason, fallback, notes: event.notes };
}

function buyHint(cat, { event, weather }) {
  const col = event.favor[0] || 'neutral';
  const cond = weather?.conditions || [];
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
  const list = []; const cond = ctx.weather?.conditions || [];
  if (cond.includes('rainy') && !pools.shoes.some(p => p.i.waterproof)) list.push({ item: 'Waterproof boots or loafers', why: 'Rain in the forecast and no rain-safe shoes in your closet' });
  if (cond.includes('rainy') && !pools.outer.some(p => p.i.waterproof)) list.push({ item: 'Packable rain jacket', why: 'Keeps you dry over any outfit' });
  if ((cond.includes('cold') || cond.includes('freezing')) && !pools.outer.length) list.push({ item: 'Warm wool coat', why: 'Cold forecast and no outerwear' });
  const best = Math.max(-99, ...[...pools.tops, ...pools.one].map(p => p.s));
  if (best < 3) list.push({ item: buyHint(ctx.event.style === 'traditional' ? 'onepiece' : 'top', ctx).replace(/^a /, ''), why: `Your closet lacks a strong match for ${ctx.event.name}` });
  return list;
}

module.exports = { suggestOutfits, scoreItem, colorMatch };
