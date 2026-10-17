// Occasion catalog. formality: 1 casual … 5 black-tie. style: 'traditional' | 'fusion' | 'any' | 'western'
const E = (id, name, tradition, o) => ({ id, name, tradition, formality: [2, 4], favor: [], avoid: [], modest: false, style: 'any', culture: null, keywords: [], notes: '', ...o });
const EVENTS = [
  // Indian / South Asian
  E('diwali', 'Diwali', 'Indian', { formality: [3, 4], favor: ['gold', 'red', 'yellow', 'orange', 'pink', 'green', 'maroon'], avoid: ['black'], style: 'traditional', culture: 'south-asian', notes: 'Bright, festive colors; black is traditionally avoided. Kurta, saree or lehenga; avoid flammable synthetics near diyas.' }),
  E('eid', 'Eid', 'Islamic', { formality: [3, 4], favor: ['white', 'green', 'cream', 'gold', 'pastel'], modest: true, style: 'traditional', culture: 'south-asian', keywords: ['eid', 'ramadan', 'iftar'], notes: 'New or best clothes; modest cut covering shoulders and knees. White and pastels are common.' }),
  E('puja', 'Puja / temple visit', 'Indian', { formality: [2, 3], favor: ['yellow', 'red', 'orange', 'white', 'cream'], avoid: ['black'], modest: true, style: 'traditional', culture: 'south-asian', keywords: ['puja', 'pooja', 'temple', 'mandir'], notes: 'Modest, comfortable traditional wear; avoid black and leather.' }),
  E('indian-wedding', 'Indian wedding', 'Indian', { formality: [4, 5], favor: ['red', 'maroon', 'gold', 'pink', 'green', 'blue'], avoid: ['white', 'black'], style: 'traditional', culture: 'south-asian', keywords: ['shaadi', 'baraat', 'indian wedding'], notes: 'Rich, festive colors. Avoid white (mourning) and all-black; avoid out-shining the bride in heavy red.' }),
  E('mehndi', 'Mehndi', 'Indian', { formality: [3, 4], favor: ['green', 'yellow', 'orange', 'pink'], avoid: ['black', 'white'], style: 'fusion', culture: 'south-asian', notes: 'Playful, bright colors (greens and yellows); fusion welcome.' }),
  E('sangeet', 'Sangeet', 'Indian', { formality: [3, 4], favor: ['pink', 'blue', 'purple', 'gold', 'silver'], style: 'fusion', culture: 'south-asian', notes: 'Danceable, glam fusion wear; comfortable shoes.' }),
  E('navratri', 'Navratri / Garba', 'Indian', { formality: [3, 3], favor: ['red', 'orange', 'yellow', 'green', 'blue', 'pink'], style: 'traditional', culture: 'south-asian', keywords: ['garba', 'dandiya', 'navratri'], notes: 'Colorful chaniya choli/kediyu; each night has a color; flat shoes for dancing.' }),
  E('holi', 'Holi', 'Indian', { formality: [1, 2], favor: ['white'], style: 'any', notes: 'Old white clothes you don\'t mind staining.' }),
  // Western
  E('church', 'Church service', 'Christian', { formality: [3, 4], favor: ['navy', 'grey', 'white', 'pastel', 'blue'], modest: true, style: 'western', keywords: ['church', 'mass', 'sunday service'], notes: 'Modest, smart: covered shoulders, knee-length or longer.' }),
  E('christmas', 'Christmas', 'Christian', { formality: [2, 4], favor: ['red', 'green', 'gold', 'white', 'burgundy'], style: 'any', keywords: ['xmas', 'christmas'], notes: 'Festive reds, greens and metallics; layers for cold.' }),
  E('easter', 'Easter', 'Christian', { formality: [3, 3], favor: ['pastel', 'white', 'yellow', 'pink', 'light blue'], avoid: ['black'], modest: true, style: 'western', notes: 'Spring pastels, light fabrics.' }),
  E('western-wedding', 'Western wedding (guest)', 'Western', { formality: [4, 4], favor: ['blue', 'green', 'pastel', 'navy', 'burgundy'], avoid: ['white', 'cream', 'ivory'], style: 'western', keywords: ['wedding', 'reception'], notes: 'Never wear white/ivory; cocktail or semi-formal.' }),
  E('black-tie', 'Black-tie', 'Western', { formality: [5, 5], favor: ['black', 'navy', 'midnight', 'gold', 'silver'], style: 'western', keywords: ['gala', 'black tie', 'black-tie', 'tuxedo'], notes: 'Tuxedo or floor-length gown; polished shoes.' }),
  E('business', 'Business / office', 'Western', { formality: [4, 4], favor: ['navy', 'grey', 'white', 'black', 'light blue'], style: 'western', keywords: ['office', 'meeting', 'interview', 'work', 'business'], notes: 'Tailored, neutral, minimal pattern.' }),
  E('business-casual', 'Business casual', 'Western', { formality: [3, 3], favor: ['navy', 'beige', 'white', 'grey', 'olive'], style: 'any', notes: 'Chinos, shirts, knits; no athleisure.' }),
  E('casual', 'Casual day out', 'Any', { formality: [1, 2], style: 'any', keywords: ['casual', 'weekend', 'brunch', 'errands'], notes: 'Comfort first.' }),
  E('date-night', 'Date night', 'Any', { formality: [3, 3], favor: ['black', 'red', 'burgundy'], style: 'any', keywords: ['date', 'dinner'], notes: 'Elevated but relaxed.' }),
  E('funeral', 'Funeral (Western)', 'Western', { formality: [4, 4], favor: ['black', 'navy', 'grey'], avoid: ['red', 'pink', 'yellow', 'orange'], modest: true, style: 'western', keywords: ['funeral', 'memorial'], notes: 'Dark, muted, modest.' }),
  E('hindu-funeral', 'Hindu funeral / prayer meet', 'Indian', { formality: [3, 3], favor: ['white', 'cream'], avoid: ['red', 'black', 'gold'], modest: true, style: 'traditional', culture: 'south-asian', keywords: ['chautha', 'tehravi', 'prayer meet'], notes: 'White is the color of mourning.' }),
  // European
  E('oktoberfest', 'Oktoberfest', 'European (German)', { formality: [2, 2], favor: ['blue', 'white', 'green', 'brown'], style: 'traditional', culture: 'european', keywords: ['oktoberfest', 'wiesn', 'dirndl', 'lederhosen'], notes: 'Dirndl/Lederhosen or checked shirt; sturdy shoes.' }),
  E('carnival', 'Carnival / Fasching', 'European', { formality: [1, 2], favor: ['red', 'gold', 'purple', 'green'], style: 'any', keywords: ['carnival', 'fasching', 'karneval', 'venice'], notes: 'Costumes, bold color; layers for February.' }),
  E('midsummer', 'Midsummer (Midsommar)', 'European (Nordic)', { formality: [2, 3], favor: ['white', 'pastel', 'floral', 'light blue', 'yellow'], style: 'any', keywords: ['midsommar', 'midsummer'], notes: 'Light whites and florals; flower crown optional.' }),
  E('kings-day', "King's Day (Koningsdag)", 'European (Dutch)', { formality: [1, 2], favor: ['orange'], style: 'any', keywords: ['koningsdag', 'kings day'], notes: 'Wear orange.' }),
  E('st-patricks', "St Patrick's Day", 'European (Irish)', { formality: [1, 2], favor: ['green'], style: 'any', keywords: ['paddy', 'patrick'], notes: 'Green, casual.' }),
  E('orthodox-ceremony', 'Orthodox church ceremony', 'European (Orthodox)', { formality: [3, 4], favor: ['white', 'pastel', 'navy'], avoid: ['red'], modest: true, style: 'western', keywords: ['orthodox', 'baptism', 'christening'], notes: 'Covered shoulders/knees; headscarf for women in many churches.' }),
  E('first-communion', 'First Communion / Confirmation', 'European (Catholic)', { formality: [3, 4], favor: ['white', 'pastel', 'navy', 'grey'], modest: true, style: 'western', keywords: ['communion', 'confirmation'], notes: 'Modest, smart, light colors.' }),
  E('christmas-market', 'Christmas market', 'European', { formality: [2, 2], favor: ['red', 'green', 'camel', 'burgundy'], style: 'any', keywords: ['weihnachtsmarkt', 'christmas market'], notes: 'Warm layers, waterproof boots.' }),
  // Others
  E('lunar-new-year', 'Lunar New Year', 'East Asian', { formality: [3, 3], favor: ['red', 'gold'], avoid: ['white', 'black'], style: 'any', culture: 'east-asian', keywords: ['chinese new year', 'lunar', 'tet', 'seollal'], notes: 'Red and gold for luck; avoid white/black (mourning).' }),
  E('hanukkah', 'Hanukkah', 'Jewish', { formality: [2, 3], favor: ['blue', 'white', 'silver'], style: 'any', notes: 'Festive blue/white.' }),
  E('synagogue', 'Synagogue / Shabbat', 'Jewish', { formality: [3, 4], favor: ['white', 'navy', 'grey'], modest: true, style: 'any', keywords: ['shabbat', 'synagogue', 'bar mitzvah', 'bat mitzvah'], notes: 'Modest, smart.' }),
  E('mosque', 'Mosque visit / Jummah', 'Islamic', { formality: [2, 3], favor: ['white', 'neutral'], modest: true, style: 'any', keywords: ['mosque', 'jummah', 'masjid'], notes: 'Loose, long, covered arms & legs.' }),
  E('nikah', 'Nikah / Muslim wedding', 'Islamic', { formality: [4, 5], favor: ['gold', 'pastel', 'green', 'maroon', 'cream'], modest: true, style: 'traditional', culture: 'south-asian', keywords: ['nikah', 'walima'], notes: 'Elegant and modest.' }),
  E('gurpurab', 'Gurpurab / Gurdwara', 'Sikh', { formality: [2, 3], favor: ['orange', 'yellow', 'white', 'blue'], modest: true, style: 'traditional', culture: 'south-asian', keywords: ['gurdwara', 'gurpurab', 'vaisakhi', 'baisakhi'], notes: 'Head covering required; modest.' }),
  E('onam', 'Onam', 'Indian', { formality: [3, 3], favor: ['cream', 'white', 'gold'], style: 'traditional', culture: 'south-asian', notes: 'Kasavu cream-and-gold.' }),
  E('pongal', 'Pongal / Sankranti', 'Indian', { formality: [2, 3], favor: ['yellow', 'green', 'orange'], style: 'traditional', culture: 'south-asian', keywords: ['pongal', 'sankranti', 'lohri'], notes: 'Bright harvest colors.' }),
  E('african-wedding', 'West African wedding', 'African', { formality: [4, 5], favor: ['gold', 'purple', 'green', 'orange'], style: 'traditional', culture: 'african', keywords: ['aso ebi', 'nigerian wedding'], notes: 'Aso-ebi coordinated colors, bold prints.' }),
];

// ---- Matching: whole words/phrases only (Unicode-aware), most specific alias wins, ties are ambiguous.
const norm = s => String(s).normalize('NFKD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/['’]s(?![\p{L}\p{N}])/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = a => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(a)}(?![\\p{L}\\p{N}])`, 'u');
const EXTRA_ALIASES = {
  nikah: ['muslim wedding', 'islamic wedding'], 'african-wedding': ['west african wedding', 'yoruba wedding', 'igbo wedding'],
  'black-tie': ['black tie'], 'st-patricks': ['st patrick', 'saint patrick', 'st patricks day'], 'lunar-new-year': ['tet holiday', 'tet festival'],
};
const STOP = new Set(['the', 'my', 'a', 'an', 'day', 'party', 'service', 'festival', 'night', 'visit', 'ceremony', 'and', 'of', 'to', 'for', 'in', 'at']);
const ALIASES = EVENTS.map(e => {
  const names = new Set([e.id.replace(/-/g, ' '), e.name, ...e.name.split(/[/(),]/)].map(norm).filter(a => a.length >= 3));
  const set = new Set([...names, ...[...e.keywords, ...(EXTRA_ALIASES[e.id] || [])].map(norm).filter(a => a.length >= 3)]);
  return { e, aliases: [...set].map(a => ({ a, re: wordRe(a), tokens: a.split(' ').length, isName: names.has(a) })) };
});
const CASUAL = EVENTS.find(e => e.id === 'casual');
const custom = input => ({ ...CASUAL, id: 'custom', name: String(input), notes: 'Custom occasion, treated as smart-casual.', formality: [2, 3] });
const brief = e => ({ id: e.id, name: e.name });

function matchEvent(input) {
  if (input == null || !String(input).trim()) return { event: CASUAL, status: 'default', matched: null, candidates: [] };
  const q = norm(input);
  if (!q) return { event: null, status: 'none', matched: null, candidates: [] };
  const exact = EVENTS.find(e => norm(e.id) === q || norm(e.name) === q);
  if (exact) return { event: exact, status: 'exact', matched: q, candidates: [] };
  const hits = [];
  for (const { e, aliases } of ALIASES) for (const al of aliases) if (al.a === q || al.re.test(q)) hits.push({ e, ...al });
  if (hits.length) {
    hits.sort((x, y) => (y.tokens - x.tokens) || (y.a.length - x.a.length));
    const top = hits[0];
    const rival = hits.find(h => h.e.id !== top.e.id && h.tokens === top.tokens && h.a.length === top.a.length);
    // Several different events named in one input ("Diwali and Eid party") → ask.
    const others = [...new Map(hits.filter(h => h.e.id !== top.e.id && h.isName && !wordRe(h.a).test(top.a)).map(h => [h.e.id, h.e])).values()];
    if (rival || others.length) return { event: null, status: 'ambiguous', matched: null, candidates: [top.e, ...others].slice(0, 5).map(brief) };
    return { event: top.e, status: 'alias', matched: top.a, candidates: [] };
  }
  const toks = new Set(q.split(' ').filter(t => !STOP.has(t)));
  const candidates = ALIASES.filter(({ aliases }) => aliases.some(al => al.a.split(' ').some(t => toks.has(t)))).slice(0, 5).map(x => brief(x.e));
  return { event: null, status: 'none', matched: null, candidates };
}

// Backward-compatible: unmatched/ambiguous input becomes a custom smart-casual occasion.
function findEvent(input) {
  const m = matchEvent(input);
  return (m.status === 'none' || m.status === 'ambiguous') ? custom(input) : m.event;
}
module.exports = { EVENTS, findEvent, matchEvent, custom, norm };
