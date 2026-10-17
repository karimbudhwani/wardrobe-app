// AI layer: uses OpenAI when OPENAI_API_KEY is set, otherwise a deterministic demo mode.
const KEY = () => process.env.OPENAI_API_KEY;
const VISION_MODEL = () => process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
const IMAGE_MODEL = () => process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
const aiEnabled = () => !!KEY();

const TYPES = [
  ['sherwani', 'onepiece', 5, 'south-asian'], ['saree', 'onepiece', 5, 'south-asian'], ['sari', 'onepiece', 5, 'south-asian'], ['lehenga', 'onepiece', 5, 'south-asian'],
  ['kurta', 'top', 3, 'south-asian'], ['churidar', 'bottom', 3, 'south-asian'], ['dupatta', 'accessory', 3, 'south-asian'], ['mojari', 'shoes', 4, 'south-asian'], ['jutti', 'shoes', 4, 'south-asian'],
  ['dirndl', 'onepiece', 2, 'european'], ['lederhosen', 'bottom', 2, 'european'], ['kimono', 'onepiece', 4, 'east-asian'], ['qipao', 'onepiece', 4, 'east-asian'],
  ['tuxedo', 'onepiece', 5, 'western'], ['suit', 'onepiece', 4, 'western'], ['dress', 'onepiece', 3, 'western'], ['gown', 'onepiece', 5, 'western'],
  ['blazer', 'outerwear', 4, 'western'], ['coat', 'outerwear', 4, 'western'], ['jacket', 'outerwear', 2, 'western'], ['hoodie', 'top', 1, 'western'],
  ['sweater', 'top', 3, 'western'], ['shirt', 'top', 3, 'western'], ['blouse', 'top', 3, 'western'], ['tee', 'top', 1, 'western'], ['t-shirt', 'top', 1, 'western'], ['top', 'top', 2, 'western'],
  ['jeans', 'bottom', 1, 'western'], ['chinos', 'bottom', 3, 'western'], ['trousers', 'bottom', 4, 'western'], ['pants', 'bottom', 2, 'western'], ['shorts', 'bottom', 1, 'western'], ['skirt', 'bottom', 3, 'western'],
  ['boots', 'shoes', 3, 'western'], ['sneakers', 'shoes', 1, 'western'], ['loafers', 'shoes', 3, 'western'], ['heels', 'shoes', 4, 'western'], ['sandals', 'shoes', 1, 'western'], ['shoes', 'shoes', 3, 'western'],
  ['scarf', 'accessory', 2, 'western'], ['bag', 'accessory', 2, 'western'], ['hat', 'accessory', 1, 'western'], ['tie', 'accessory', 4, 'western'],
];
const COLORS = { black: '#111827', white: '#f8fafc', cream: '#fef3c7', grey: '#9ca3af', gray: '#9ca3af', navy: '#1e3a8a', blue: '#3b82f6', red: '#dc2626', maroon: '#7f1d1d', pink: '#ec4899', orange: '#f97316', yellow: '#facc15', gold: '#ca8a04', green: '#16a34a', olive: '#4d5b2a', brown: '#78350f', beige: '#d6c4a0', purple: '#7c3aed', denim: '#1e40af' };
const FABRICS = ['linen', 'cotton', 'wool', 'silk', 'denim', 'leather', 'suede', 'velvet', 'polyester', 'nylon', 'cashmere', 'flannel'];
const PATTERNS = ['striped', 'checked', 'plaid', 'floral', 'paisley', 'embroidered', 'polka'];

function heuristicTags(text = '') {
  const t = text.toLowerCase().replace(/[_\-.]/g, ' ');
  const ty = TYPES.find(([k]) => t.includes(k)) || ['top', 'top', 2, 'western'];
  const color = Object.keys(COLORS).find(c => t.includes(c)) || 'grey';
  const fabric = FABRICS.find(f => t.includes(f)) || (ty[0] === 'jeans' ? 'denim' : 'cotton');
  const pattern = PATTERNS.find(p => t.includes(p)) || 'solid';
  const seasons = /wool|velvet|coat|sweater|flannel|boots/.test(t + fabric) ? ['autumn', 'winter'] : /linen|shorts|sandals/.test(t + fabric) ? ['spring', 'summer'] : ['spring', 'summer', 'autumn', 'winter'];
  return { name: `${color[0].toUpperCase() + color.slice(1)} ${ty[0]}`, type: ty[0], category: ty[1], color, color_hex: COLORS[color], pattern, fabric, seasons, formality: ty[2], cultural_style: ty[3], modest: /shorts|tee|t-shirt|tank|mini/.test(t) ? 0 : 1, waterproof: /rain|waterproof|gore/.test(t) ? 1 : 0, bbox: null };
}

const DETECT_PROMPT = `You are a fashion cataloguer. Find EVERY distinct clothing item, shoe, or accessory visible in the photo. Return JSON {"items":[{"name":string,"type":string,"category":"top|bottom|onepiece|outerwear|shoes|accessory","color":string,"color_hex":"#rrggbb","pattern":string,"fabric":string,"seasons":["spring"|"summer"|"autumn"|"winter"],"formality":1-5,"cultural_style":"western|south-asian|east-asian|european|african|middle-eastern","modest":true|false,"waterproof":true|false,"bbox":[x,y,w,h] normalized 0-1}]}. Sarees, lehengas, sherwanis, suits and dresses are "onepiece".`;

async function detectItems(buffer, mime, hint = '', fetchImpl = globalThis.fetch) {
  if (!aiEnabled()) return { mode: 'demo', items: [heuristicTags(hint)] };
  const r = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: VISION_MODEL(), response_format: { type: 'json_object' }, messages: [{ role: 'system', content: DETECT_PROMPT }, { role: 'user', content: [{ type: 'text', text: `Catalogue the clothing. User hint: ${hint || 'none'}` }, { type: 'image_url', image_url: { url: `data:${mime};base64,${buffer.toString('base64')}` } }] }] }),
  });
  if (!r.ok) { const h = heuristicTags(hint); return { mode: 'demo', error: `OpenAI ${r.status}`, items: [h] }; }
  const j = await r.json();
  let items = [];
  try { items = JSON.parse(j.choices[0].message.content).items || []; } catch { /* fallthrough */ }
  if (!items.length) items = [heuristicTags(hint)];
  return { mode: 'ai', items: items.map(i => ({ ...heuristicTags(i.type || ''), ...i, modest: i.modest === false ? 0 : 1, waterproof: i.waterproof ? 1 : 0 })) };
}

async function tryOn({ selfie, garments, outfitText }, fetchImpl = globalThis.fetch) {
  // selfie: {buffer,mime}; garments: [{buffer,mime,name}] (photo items only)
  if (!aiEnabled()) return { mode: 'demo' };
  const fd = new FormData();
  fd.append('model', IMAGE_MODEL());
  fd.append('prompt', `Photorealistic image of the person in the first image wearing this outfit: ${outfitText}. Use the garment reference images exactly (color, pattern, cut). Keep the person's face, body and pose; full-body, natural lighting.`);
  fd.append('image[]', new Blob([selfie.buffer], { type: selfie.mime }), 'person.png');
  for (const [i, g] of garments.slice(0, 9).entries()) fd.append('image[]', new Blob([g.buffer], { type: g.mime }), `garment${i}.png`);
  const r = await fetchImpl('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${KEY()}` }, body: fd });
  if (!r.ok) return { mode: 'demo', error: `OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}` };
  const j = await r.json();
  return { mode: 'ai', buffer: Buffer.from(j.data[0].b64_json, 'base64'), mime: 'image/png' };
}

module.exports = { aiEnabled, detectItems, tryOn, heuristicTags };
