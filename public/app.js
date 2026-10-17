const $ = s => document.querySelector(s);
const api = async (url, opts = {}) => {
  const o = { credentials: 'same-origin', ...opts };
  if (o.body && !(o.body instanceof FormData)) { o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(o.body); }
  const r = await fetch(url, o); const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText); return j;
};
const esc = s => String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
let me = null, events = [], selected = new Set(), lastSuggest = null, itemsCache = [];

function thumbStyle(it) {
  const b = it.bbox;
  if (b && b[2] > 0 && b[3] > 0 && b[2] < 1) {
    const [x, y, w, h] = b;
    return `background-image:url('${it.image}');background-size:${100 / w}% ${100 / h}%;background-position:${w < 1 ? (x / (1 - w)) * 100 : 0}% ${h < 1 ? (y / (1 - h)) * 100 : 0}%`;
  }
  return `background-image:url('${it.image}');background-size:${it.photo_id ? 'cover' : 'contain'}`;
}
const thumb = it => `<div class="thumb" style="${thumbStyle(it)}"></div>`;

async function boot() {
  try { me = await api('/api/me'); } catch { me = null; }
  $('#auth').classList.toggle('hidden', !!me); $('#main').classList.toggle('hidden', !me);
  if (!me) return;
  $('#aiBadge').textContent = me.aiEnabled ? 'AI on' : 'Demo mode'; $('#aiBadge').classList.toggle('on', me.aiEnabled);
  $('#importMode').textContent = me.aiEnabled ? 'AI detection is on.' : 'Demo mode: each photo becomes one item, tagged from your hint (set OPENAI_API_KEY for full AI detection).';
  if (me.selfie) $('#selfie').src = me.selfie;
  events = await api('/api/events');
  $('#eventList').innerHTML = events.map(e => `<option value="${esc(e.name)}">${esc(e.tradition)}</option>`).join('');
  $('#eventChips').innerHTML = ['Diwali', 'Eid', 'Indian wedding', 'Sangeet', 'Church service', 'Business / office', 'Black-tie', 'Oktoberfest', 'Lunar New Year'].map(n => `<button type="button" class="chip">${n}</button>`).join('');
  $('#date').value = new Date().toISOString().slice(0, 10);
  loadItems();
}

// auth
let authMode = 'login';
document.querySelectorAll('#authForm button[type=submit]').forEach(b => b.onclick = () => authMode = b.dataset.mode);
$('#authForm').onsubmit = async e => {
  e.preventDefault(); const f = new FormData(e.target);
  try { await api(`/api/auth/${authMode}`, { method: 'POST', body: Object.fromEntries(f) }); boot(); } catch (err) { $('#authErr').textContent = err.message; }
};
$('#demoBtn').onclick = async () => { try { await api('/api/auth/login', { method: 'POST', body: { email: 'demo@wardrobe.app', password: 'demo1234' } }); boot(); } catch (err) { $('#authErr').textContent = err.message; } };
$('#logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); location.reload(); };

// tabs
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
function showTab(t) {
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('active', x.dataset.tab === t));
  document.querySelectorAll('main > section').forEach(s => s.classList.toggle('hidden', s.id !== 'tab-' + t));
  if (t === 'tryon') renderTry(); if (t === 'saved') loadSaved();
}

// closet
async function loadItems() {
  const p = new URLSearchParams({ q: $('#fq').value, category: $('#fcat').value, season: $('#fseason').value, formality: $('#fform').value, style: $('#fstyle').value, color: $('#fcolor').value });
  itemsCache = await api('/api/items?' + p);
  $('#count').textContent = `${itemsCache.length} item${itemsCache.length === 1 ? '' : 's'} · tap to edit · ⭐ to select for try-on`;
  $('#grid').innerHTML = itemsCache.map(card).join('') || '<p class="muted">No items yet. Import photos or load the sample closet.</p>';
}
const card = it => `<div class="item ${selected.has(it.id) ? 'selected' : ''}" data-id="${it.id}">${thumb(it)}<h4>${esc(it.name)}</h4><div class="tags"><span class="tag">${esc(it.category)}</span><span class="tag">${esc(it.color)}</span><span class="tag">${esc(it.fabric)}</span><span class="tag">F${it.formality}</span>${it.cultural_style !== 'western' ? `<span class="tag">${esc(it.cultural_style)}</span>` : ''}<span class="tag sel" data-sel="${it.id}">${selected.has(it.id) ? '✓' : '⭐'}</span></div></div>`;
['#fq', '#fcolor'].forEach(s => $(s).oninput = debounce(loadItems, 250));
['#fcat', '#fseason', '#fform', '#fstyle'].forEach(s => $(s).onchange = loadItems);
function debounce(f, ms) { let t; return () => { clearTimeout(t); t = setTimeout(f, ms); }; }
$('#grid').onclick = e => {
  const sel = e.target.closest('[data-sel]');
  if (sel) { const id = +sel.dataset.sel; selected.has(id) ? selected.delete(id) : selected.add(id); return loadItems(); }
  const c = e.target.closest('.item'); if (c) editItem(itemsCache.find(i => i.id === +c.dataset.id));
};
function editItem(it) {
  const f = (k, label, v = it[k]) => `<label>${label}<input name="${k}" value="${esc(v)}"></label>`;
  $('#itemForm').innerHTML = `${thumb(it)}${f('name', 'Name')}${f('type', 'Type')}
    <label>Category<select name="category">${['top', 'bottom', 'onepiece', 'outerwear', 'shoes', 'accessory'].map(c => `<option ${c === it.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    ${f('color', 'Color')}${f('pattern', 'Pattern')}${f('fabric', 'Fabric')}${f('seasons', 'Seasons (comma-separated)', it.seasons.join(', '))}
    ${f('formality', 'Formality 1-5')}${f('cultural_style', 'Cultural style')}
    <label class="inline"><input type="checkbox" name="modest" ${it.modest ? 'checked' : ''}> Modest coverage</label>
    <label class="inline"><input type="checkbox" name="waterproof" ${it.waterproof ? 'checked' : ''}> Waterproof</label>
    <div class="row"><button value="save">Save</button><button value="delete" class="ghost">Delete</button><button value="cancel" class="ghost">Close</button></div>`;
  const dlg = $('#itemDlg'); dlg.showModal();
  dlg.onclose = async () => {
    if (dlg.returnValue === 'delete' && confirm('Delete this item?')) await api(`/api/items/${it.id}`, { method: 'DELETE' });
    if (dlg.returnValue === 'save') {
      const d = Object.fromEntries(new FormData($('#itemForm')));
      d.seasons = d.seasons.split(',').map(s => s.trim()).filter(Boolean); d.formality = +d.formality; d.modest = !!d.modest; d.waterproof = !!d.waterproof;
      await api(`/api/items/${it.id}`, { method: 'PATCH', body: d });
    }
    loadItems();
  };
}

// suggestions
$('#eventChips').onclick = e => { if (e.target.classList.contains('chip')) { $('#event').value = e.target.textContent; } };
$('#geo').onclick = () => navigator.geolocation?.getCurrentPosition(p => { $('#loc').value = ''; $('#loc').dataset.lat = p.coords.latitude; $('#loc').dataset.lon = p.coords.longitude; $('#loc').placeholder = '📍 Current location'; }, () => alert('Location unavailable; type a city instead.'));
$('#loc').oninput = () => { delete $('#loc').dataset.lat; delete $('#loc').dataset.lon; };
const settingVal = () => document.querySelector('input[name=setting]:checked')?.value || 'outdoor';
document.querySelectorAll('input[name=setting]').forEach(r => r.onchange = () => { const indoor = settingVal() === 'indoor'; $('#useWeather').disabled = !indoor; if (!indoor) $('#useWeather').checked = false; });
async function runSuggest(extra = {}) {
  $('#outfits').innerHTML = '<p class="muted">Thinking…</p>';
  const body = { event: $('#event').value, date: $('#date').value, setting: settingVal(), useWeather: $('#useWeather').checked, q: $('#loc').value || undefined, lat: $('#loc').dataset.lat, lon: $('#loc').dataset.lon, ...extra };
  if (!body.q && !body.lat) body.q = undefined;
  try { lastSuggest = await api('/api/suggest', { method: 'POST', body }); renderSuggest(lastSuggest); } catch (err) { $('#outfits').innerHTML = `<p class="err">${esc(err.message)}</p>`; }
}
$('#ctxForm').onsubmit = e => { e.preventDefault(); runSuggest(); };
function weatherCard(r) {
  const w = r.weather;
  if (!r.weatherApplies) return r.setting === 'indoor' ? '<span class="muted">Indoor: weather not used</span>' : 'Weather off';
  if (!w) return 'Weather off';
  const src = w.estimate ? `<span class="tag est">Estimate</span><span class="muted">${esc(w.note || '')}</span>` : w.source === 'open-meteo' ? '<span class="muted">Open-Meteo forecast</span>' : `<span class="muted">${esc(w.note || '')}</span>`;
  const heat = w.heat && w.heat.level >= 1 ? `<span class="tag heat">🔥 feels ${esc(w.heat.feelsMax)}°C</span>` : '';
  return `<b>${Math.round(w.tmin)}–${Math.round(w.tmax)}°C</b><span>${esc(w.location)} · ${esc(w.date)}</span>${heat}${w.conditions.map(c => `<span class="tag">${esc(c)}</span>`).join('')}<span class="tag">💧${esc(w.precipProb)}%</span><span class="tag">💨${Math.round(w.wind)} km/h</span>${src}<span class="muted attrib">Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a></span>`;
}
function renderSuggest(r) {
  if (r.needsEvent) {
    const m = r.eventMatch || {}; const x = m.input || $('#event').value;
    $('#ctxSummary').innerHTML = '';
    $('#outfits').innerHTML = `<div class="card"><p>We couldn't match “${esc(x)}”.${m.candidates?.length ? ' Did you mean:' : ''}</p>
      <div class="chips">${(m.candidates || []).map(c => `<button type="button" class="chip" data-pick="${esc(c.name)}">${esc(c.name)}</button>`).join('')}</div>
      <div class="row"><button type="button" class="ghost" data-custom="1">Use “${esc(x)}” as a custom smart-casual occasion</button></div></div>`;
    $('#shopping').innerHTML = '';
    return;
  }
  const ev = r.event;
  $('#ctxSummary').innerHTML = `<div class="card"><div class="wx">${weatherCard(r)}</div>
    <p><b>${esc(ev.name)}</b> <span class="muted">(${esc(ev.tradition)})</span>: ${esc(ev.notes)}</p>
    <div class="tags">${ev.favor.map(c => `<span class="tag">✓ ${esc(c)}</span>`).join('')}${ev.avoid.map(c => `<span class="tag" style="background:#fee2e2">✗ ${esc(c)}</span>`).join('')}${ev.modest ? '<span class="tag">modest</span>' : ''}<span class="tag">${esc(ev.style)}</span></div></div>`;
  $('#outfits').innerHTML = (r.outfits.map((o, k) => `<div class="outfit"><h3><span class="rank">${k + 1}</span>${esc(o.items[0].name)} look${o.warnings?.includes('heat') ? ' <span class="tag heat">⚠ heat</span>' : ''}</h3>
    <div class="pieces">${o.items.map(i => `<div class="piece">${thumb(i)}${esc(i.name)}</div>`).join('')}</div>
    <p${o.warnings?.length ? ' class="warn-reason"' : ''}>${esc(o.reason)}</p>${o.colorNotes?.length ? `<p class="muted">🎨 ${esc(o.colorNotes.join('; '))}</p>` : ''}<p class="fallback">↪ ${esc(o.fallback)}</p>
    <div class="row"><button class="ghost" data-save="${k}">Save outfit</button><button data-try="${k}">Try it on</button></div></div>`).join('') || '<p class="muted">Add tops/bottoms or one-pieces to get suggestions.</p>')
    + (r.transitLayer ? `<div class="card"><p>🧥 ${esc(r.transitLayer.why)}: bring your <b>${esc(r.transitLayer.item)}</b>.</p></div>` : '');
  $('#shopping').innerHTML = r.shopping.length ? `<div class="card"><h3>🛍️ Optional items to buy</h3>${r.shopping.map(s => `<p><b>${esc(s.item)}</b>: <span class="muted">${esc(s.why)}</span></p>`).join('')}</div>` : '';
}
$('#outfits').onclick = async e => {
  if (e.target.dataset.pick) { $('#event').value = e.target.dataset.pick; return runSuggest(); }
  if (e.target.dataset.custom) return runSuggest({ confirmCustom: true });
  const s = e.target.dataset.save, t = e.target.dataset.try;
  if (s != null) { const o = lastSuggest.outfits[s]; await api('/api/outfits', { method: 'POST', body: { itemIds: o.itemIds, reason: o.reason, context: { event: lastSuggest.event.name, setting: lastSuggest.setting, weather: lastSuggest.weather && { location: lastSuggest.weather.location, date: lastSuggest.weather.date, conditions: lastSuggest.weather.conditions } } } }); e.target.textContent = 'Saved ✓'; }
  if (t != null) { selected = new Set(lastSuggest.outfits[t].itemIds); showTab('tryon'); }
};

// import
$('#importBtn').onclick = async () => {
  const files = $('#photos').files; if (!files.length) return $('#importMsg').textContent = 'Choose photos first.';
  const fd = new FormData(); [...files].forEach(f => fd.append('photos', f)); fd.append('hint', $('#hint').value);
  $('#importMsg').textContent = 'Detecting clothing…';
  try { const r = await api('/api/items/import', { method: 'POST', body: fd }); $('#importMsg').textContent = `Added ${r.items.length} item(s) (${r.mode} mode). Tap an item in Closet to refine tags.`; $('#imported').innerHTML = r.items.map(card).join(''); loadItems(); } catch (err) { $('#importMsg').textContent = err.message; }
};
$('#photos').onchange = () => $('#drop span').textContent = `${$('#photos').files.length} photo(s) selected`;
$('#seedBtn').onclick = async () => { const r = await api('/api/items/seed', { method: 'POST' }); $('#importMsg').textContent = `Added ${r.added} sample items.`; loadItems(); };

// try-on
async function renderTry() {
  const all = itemsCache.length ? itemsCache : await api('/api/items');
  const all2 = all.length < selected.size ? await api('/api/items') : all;
  const its = [...selected].map(id => all2.find(i => i.id === id)).filter(Boolean);
  $('#tryItems').innerHTML = its.map(i => `<div title="${esc(i.name)}">${thumb(i)}</div>`).join('') || '<p class="muted">No items selected. Tap ⭐ on closet items or "Try it on" on an outfit.</p>';
}
$('#selfieFile').onchange = async () => { const fd = new FormData(); fd.append('photo', $('#selfieFile').files[0]); try { const r = await api('/api/selfie', { method: 'POST', body: fd }); $('#selfie').src = r.url; } catch (err) { $('#tryMsg').textContent = err.message; } };
$('#renderBtn').onclick = async () => {
  $('#tryMsg').textContent = 'Rendering…';
  try { const r = await api('/api/tryon', { method: 'POST', body: { itemIds: [...selected] } }); $('#render').src = r.url; $('#render').classList.remove('hidden'); $('#tryMsg').textContent = r.mode === 'ai' ? 'Rendered with AI.' : `Demo preview${r.error ? ' (' + r.error + ')' : ''}.`; } catch (err) { $('#tryMsg').textContent = err.message; }
};

// saved
async function loadSaved() {
  const [outs, items] = await Promise.all([api('/api/outfits'), api('/api/items')]);
  const byId = Object.fromEntries(items.map(i => [i.id, i]));
  $('#saved').innerHTML = outs.map(o => `<div class="outfit"><h3>${esc(o.context.event || 'Outfit')}</h3><div class="pieces">${o.item_ids.map(id => byId[id]).filter(Boolean).map(i => `<div class="piece">${thumb(i)}${esc(i.name)}</div>`).join('')}</div><p class="muted">${esc(o.reason)}</p><button class="ghost" data-del="${o.id}">Remove</button></div>`).join('') || '<p class="muted">No saved outfits yet.</p>';
}
$('#saved').onclick = async e => { if (e.target.dataset.del) { await api(`/api/outfits/${e.target.dataset.del}`, { method: 'DELETE' }); loadSaved(); } };

boot();
