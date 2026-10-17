// Sample closet rendered as SVG cut-outs, so the app demos without real photos.
const SHAPES = {
  top: 'M60 30 L90 20 Q100 35 110 20 L140 30 L170 60 L150 80 L140 70 L140 175 L60 175 L60 70 L50 80 L30 60 Z',
  kurta: 'M65 20 L90 15 Q100 30 110 15 L135 20 L165 55 L148 72 L138 62 L145 190 L55 190 L62 62 L52 72 L35 55 Z',
  bottom: 'M60 20 L140 20 L150 190 L112 190 L100 70 L88 190 L50 190 Z',
  skirt: 'M70 30 L130 30 L160 180 L40 180 Z',
  dress: 'M80 15 L120 15 L125 60 L165 185 L35 185 L75 60 Z',
  saree: 'M75 15 L125 15 L130 70 L160 190 L40 190 L70 70 Z M125 15 L165 120 L150 125 L120 50 Z',
  outer: 'M60 25 L85 15 L100 60 L115 15 L140 25 L175 70 L160 185 L140 185 L140 90 L130 185 L70 185 L60 90 L60 185 L40 185 L25 70 Z',
  shoes: 'M25 130 L25 100 L60 95 L90 120 L160 135 Q175 140 175 155 L175 165 L25 165 Z',
  accessory: 'M50 80 Q100 40 150 80 L150 170 L50 170 Z M75 80 Q100 30 125 80',
};
const PAT = {
  striped: '<pattern id="p" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="7" fill="#fff" opacity=".35"/></pattern>',
  checked: '<pattern id="p" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="10" height="20" fill="#000" opacity=".15"/><rect width="20" height="10" fill="#fff" opacity=".25"/></pattern>',
  floral: '<pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="4" fill="#fff" opacity=".6"/><circle cx="0" cy="0" r="3" fill="#fde047" opacity=".7"/></pattern>',
  embroidered: '<pattern id="p" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M9 2 L12 9 L9 16 L6 9 Z" fill="#facc15" opacity=".75"/></pattern>',
  paisley: '<pattern id="p" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M8 18 Q4 6 14 6 Q22 8 16 16 Q12 20 8 18" fill="#fde68a" opacity=".6"/></pattern>',
};
function svgFor(shape, hex, pattern) {
  const p = PAT[pattern];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs>${p || ''}</defs><path d="${SHAPES[shape]}" fill="${hex}" stroke="#0002" stroke-width="2"/>${p ? `<path d="${SHAPES[shape]}" fill="url(#p)"/>` : ''}</svg>`;
}
const I = (name, type, category, shape, color, hex, pattern, fabric, seasons, formality, cultural_style = 'western', modest = 1, waterproof = 0) =>
  ({ name, type, category, shape, color, color_hex: hex, pattern, fabric, seasons, formality, cultural_style, modest, waterproof });
const SAMPLE = [
  I('White oxford shirt', 'shirt', 'top', 'top', 'white', '#f8fafc', 'solid', 'cotton', ['spring', 'summer', 'autumn', 'winter'], 3),
  I('Light blue linen shirt', 'shirt', 'top', 'top', 'light blue', '#93c5fd', 'solid', 'linen', ['summer', 'spring'], 2),
  I('Navy merino sweater', 'sweater', 'top', 'top', 'navy', '#1e3a8a', 'solid', 'wool', ['autumn', 'winter'], 3),
  I('Grey graphic tee', 't-shirt', 'top', 'top', 'grey', '#9ca3af', 'solid', 'cotton', ['spring', 'summer'], 1, 'western', 0),
  I('Red-green flannel shirt', 'shirt', 'top', 'top', 'red', '#b91c1c', 'checked', 'flannel', ['autumn', 'winter'], 2),
  I('Saffron silk kurta', 'kurta', 'top', 'kurta', 'orange', '#f59e0b', 'embroidered', 'silk', ['autumn', 'winter', 'spring'], 4, 'south-asian'),
  I('Cream cotton kurta', 'kurta', 'top', 'kurta', 'cream', '#fef3c7', 'solid', 'cotton', ['spring', 'summer', 'autumn'], 3, 'south-asian'),
  I('Mint chikankari kurta', 'kurta', 'top', 'kurta', 'mint green', '#86efac', 'embroidered', 'cotton', ['summer', 'spring'], 3, 'south-asian'),
  I('Dark wash jeans', 'jeans', 'bottom', 'bottom', 'denim blue', '#1e40af', 'solid', 'denim', ['spring', 'autumn', 'winter'], 1),
  I('Beige chinos', 'chinos', 'bottom', 'bottom', 'beige', '#d6c4a0', 'solid', 'cotton', ['spring', 'summer', 'autumn'], 3),
  I('Charcoal wool trousers', 'trousers', 'bottom', 'bottom', 'grey', '#374151', 'solid', 'wool', ['autumn', 'winter'], 4),
  I('White churidar', 'churidar', 'bottom', 'bottom', 'white', '#ffffff', 'solid', 'cotton', ['spring', 'summer', 'autumn', 'winter'], 3, 'south-asian'),
  I('Maroon velvet sherwani', 'sherwani', 'onepiece', 'kurta', 'maroon', '#7f1d1d', 'embroidered', 'velvet', ['winter', 'autumn'], 5, 'south-asian'),
  I('Pink banarasi saree', 'saree', 'onepiece', 'saree', 'pink', '#ec4899', 'embroidered', 'silk', ['autumn', 'winter', 'spring'], 5, 'south-asian'),
  I('Emerald lehenga set', 'lehenga', 'onepiece', 'skirt', 'green', '#047857', 'embroidered', 'silk', ['autumn', 'winter'], 5, 'south-asian'),
  I('Navy two-piece suit', 'suit', 'onepiece', 'outer', 'navy', '#172554', 'solid', 'wool', ['autumn', 'winter', 'spring'], 4),
  I('Black tuxedo', 'tuxedo', 'onepiece', 'outer', 'black', '#0a0a0a', 'solid', 'wool', ['autumn', 'winter', 'spring', 'summer'], 5),
  I('Floral midi dress', 'dress', 'onepiece', 'dress', 'pastel blue', '#bfdbfe', 'floral', 'cotton', ['spring', 'summer'], 3),
  I('Blue-white dirndl', 'dirndl', 'onepiece', 'dress', 'blue', '#2563eb', 'checked', 'cotton', ['autumn', 'summer'], 2, 'european'),
  I('Camel wool coat', 'coat', 'outerwear', 'outer', 'camel', '#c08a4a', 'solid', 'wool', ['autumn', 'winter'], 4),
  I('Olive rain jacket', 'rain jacket', 'outerwear', 'outer', 'olive', '#4d5b2a', 'solid', 'nylon', ['spring', 'autumn'], 2, 'western', 1, 1),
  I('Gold nehru jacket', 'nehru jacket', 'outerwear', 'outer', 'gold', '#ca8a04', 'paisley', 'silk', ['autumn', 'winter'], 4, 'south-asian'),
  I('White leather sneakers', 'sneakers', 'shoes', 'shoes', 'white', '#f1f5f9', 'solid', 'leather', ['spring', 'summer', 'autumn'], 1),
  I('Brown leather chelsea boots', 'boots', 'shoes', 'shoes', 'brown', '#78350f', 'solid', 'leather', ['autumn', 'winter'], 3, 'western', 1, 1),
  I('Black oxford shoes', 'oxfords', 'shoes', 'shoes', 'black', '#111827', 'solid', 'leather', ['autumn', 'winter', 'spring', 'summer'], 5),
  I('Gold embroidered mojari', 'mojari', 'shoes', 'shoes', 'gold', '#eab308', 'embroidered', 'leather', ['autumn', 'winter', 'spring'], 4, 'south-asian'),
  I('Tan suede loafers', 'loafers', 'shoes', 'shoes', 'tan', '#b45309', 'solid', 'suede', ['spring', 'summer'], 3),
  I('Red silk dupatta', 'dupatta', 'accessory', 'accessory', 'red', '#dc2626', 'embroidered', 'silk', ['autumn', 'winter', 'spring'], 4, 'south-asian'),
  I('Grey wool scarf', 'scarf', 'accessory', 'accessory', 'grey', '#6b7280', 'solid', 'wool', ['winter', 'autumn'], 2),
];
const sampleRow = (userId, it) => ({
  user_id: userId, svg: svgFor(it.shape, it.color_hex, it.pattern), name: it.name, type: it.type, category: it.category,
  color: it.color, color_hex: it.color_hex, pattern: it.pattern, fabric: it.fabric, seasons: JSON.stringify(it.seasons),
  formality: it.formality, cultural_style: it.cultural_style, modest: it.modest, waterproof: it.waterproof,
});
// Inserts the sample closet for a user via the data layer (one bulk insert).
// opts.onlyMissing: skip sample items the user already has (idempotent re-seed).
async function seedUser(db, userId, opts = {}) {
  let list = SAMPLE;
  if (opts.onlyMissing) {
    const have = new Set(await db.listSeedItemNames(userId));
    list = SAMPLE.filter(it => !have.has(it.name));
  }
  return db.insertItems(list.map(it => sampleRow(userId, it)));
}
module.exports = { seedUser, sampleRow, SAMPLE, svgFor };
