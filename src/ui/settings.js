'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => n >= 100 ? Math.round(n).toLocaleString('pl-PL') : n >= 1 ? (+n).toFixed(1) : String(+(+n).toFixed(3));
const t = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const FIELDS = ['watchAlertPct', 'listUndercut', 'uiScale', 'uiOpacity', 'vendorThreshold', 'tradeStatus', 'modMinPercent', 'poesessid', 'clientLog', 'thanksMessage', 'busyMessage', 'account', 'guideClass'];
const CHECKS = ['filterAuto', 'autoCopyNote', 'autoTradeRares', 'restoreClipboard', 'hudVisible', 'buyerSound', 'guideLeagueStart', 'explainMods', 'labAuto'];

function show(sec) {
  document.querySelectorAll('section').forEach(s => s.classList.toggle('on', s.id === sec));
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.dataset.s === sec));
  if (sec === 'handel') loadHistory();
  if (sec === 'aktualizacje') loadUpdate();
  if (sec === 'obserwowane') loadWatch();
}
document.querySelectorAll('nav a').forEach(a => a.onclick = () => show(a.dataset.s));
api.on('goto', show);

async function load() {
  const s = await api.getSettings();
  $('ver').textContent = 'wersja ' + await api.version();
  const ls = await api.leagues();
  const leagues = Array.isArray(ls) ? ls : [];
  if (s.league && !leagues.includes(s.league)) leagues.unshift(s.league);
  $('league').innerHTML = leagues.map(l => `<option>${esc(l)}</option>`).join('') || '<option value="">(nie udało się pobrać lig)</option>';
  $('league').value = s.league;
  for (const k of FIELDS) $(k).value = s[k] ?? '';
  for (const k of CHECKS) $(k).checked = !!s[k];
  document.querySelectorAll('[data-hk]').forEach(i => { i.value = s.hotkeys[i.dataset.hk] || ''; });
  document.querySelectorAll('[class^="k-"]').forEach(k => { k.textContent = s.hotkeys[k.className.slice(2)] || ''; });
  $('commands').value = (s.commands || []).map(c => `${c.key} = ${c.text}`).join('\n');
  $('mapDanger').value = (s.mapDanger || []).join('\n');
  $('pobInfo').textContent = s.buildName ? 'Wczytany: ' + s.buildName : '';
  const bp = s.buildProfile || {}; $('bpType').value = bp.type || ''; $('bpDef').value = bp.defense || ''; $('bpEl').value = bp.element || '';
  const g = s.mapGoal || { pack: 20, quant: 60 }; $('goalPack').value = g.pack; $('goalQuant').value = g.quant;
  await stashInit();
  showLook(); renderProfileBox(s); lsRender(s); rxInit(s); fInit(s);
  $('guideSourceSel').value = s.guideSource || 'poe-leveling';
}

$('save').onclick = async () => {
  const hotkeys = {}; document.querySelectorAll('[data-hk]').forEach(i => { hotkeys[i.dataset.hk] = i.value.trim(); });
  const commands = $('commands').value.split('\n').map(l => l.split('=')).filter(p => p.length >= 2 && p[0].trim())
    .map(([k, ...x]) => ({ key: k.trim(), text: x.join('=').trim() }));
  const patch = { league: $('league').value, hotkeys, commands, mapDanger: $('mapDanger').value.split('\n').map(s => s.trim()).filter(Boolean) };
  for (const k of FIELDS) patch[k] = $(k).value.trim();
  for (const k of ['vendorThreshold', 'modMinPercent', 'listUndercut', 'watchAlertPct']) patch[k] = Number(patch[k]) || 0;
  patch.uiScale = Number(patch.uiScale) || 1; patch.uiOpacity = Number(patch.uiOpacity) || 1;
  for (const k of CHECKS) patch[k] = $(k).checked;
  patch.buildProfile = { type: $('bpType').value, defense: $('bpDef').value, element: $('bpEl').value };
  patch.mapGoal = { pack: Number($('goalPack').value) || 0, quant: Number($('goalQuant').value) || 0 };
  await api.setSettings(patch);
  document.querySelectorAll('[class^="k-"]').forEach(k => { k.textContent = hotkeys[k.className.slice(2)] || ''; });
  $('saved').textContent = 'Zapisano';
  setTimeout(() => { $('saved').textContent = ''; }, 2000);
};

$('detect').onclick = async () => { const f = await api.detectLog(); if (f) $('clientLog').value = f; else $('clientLog').placeholder = 'Nie znaleziono — uruchom grę i spróbuj ponownie albo wskaż ręcznie'; };
$('pick').onclick = async () => { const f = await api.pickLog(); if (f) $('clientLog').value = f; };
$('login').onclick = () => api.marketLogin();
$('guideReset').onclick = async () => { await api.quiet({ guideStep: 0 }); await api.setSettings({}); $('guideReset').textContent = 'Gotowe — od kroku 1'; };
$('pobImport').onclick = async () => {
  const r = await api.pobImport($('pob').value);
  if (r.error) { $('pobInfo').innerHTML = `<span class="err">${esc(r.error)}</span>`; return; }
  $('pobInfo').innerHTML = `<span class="ok">Wczytany: ${esc(r.ascendancy || r.className || '')} · ${r.gems.length} gemów</span>`;
  if (r.className) $('guideClass').value = r.className;
  if (r.profile) { $('bpType').value = r.profile.type || ''; $('bpDef').value = r.profile.defense || ''; $('bpEl').value = r.profile.element || ''; }
};

// --- stash ---
const ST = { data: null, history: [], divine: null, hidden: new Set(), view: 'list', profiles: [], profile: '', editing: null };
const CATS = ['Waluta', 'Scaraby', 'Threads', 'Esencje', 'Fossile', 'Oleje', 'Fragmenty', 'Delirium', 'Karty', 'Unikaty', 'Gemy', 'Mapy', 'Ekwipunek'];
const cico = k => ST.icons && ST.icons[k] ? ` <img src="${esc(ST.icons[k])}" alt="${k === 'divine' ? 'div' : 'c'}">` : `<small>${k === 'divine' ? 'div' : 'c'}</small>`;
const money = c => {
  if (c == null) return '—';
  if (ST.divine && Math.abs(c) >= ST.divine) return `${(c / ST.divine).toFixed(1)}${cico('divine')}`;
  return `${fmt(c)}${cico('chaos')}`;
};
const moneyTxt = c => ST.divine && Math.abs(c) >= ST.divine ? `${(c / ST.divine).toFixed(2)} div` : `${fmt(c)} c`;

async function stashInit() {
  const s = await api.getSettings();
  ST.hidden = new Set(s.stashHidden || []);
  ST.profiles = s.stashProfiles || []; ST.profile = s.stashProfile || '';
  renderProfiles();
  $('stashAuto').value = String(s.stashAuto ?? 30);
  ST.history = await api.stashHistory() || [];
  ST.data = await api.stashGet();
  const mi = await api.marketInfo(); ST.divine = mi.divine; ST.icons = mi.icons || {};
  topbar(mi);
  stashRender();
}
function topbar(mi) {
  const ic = k => mi.icons && mi.icons[k] ? `<img src="${esc(mi.icons[k])}" alt="" style="width:16px;height:16px;vertical-align:-3px">` : '';
  $('topbar').innerHTML = `${mi.divine ? `<span>1${ic('divine') || ' div'} = <b>${Math.round(mi.divine)}</b>${ic('chaos') || ' c'}</span>` : ''}<span>${esc(mi.league || '')}</span>`;
}

function curProfile() { return ST.profiles.find(p => p.id === ST.profile) || null; }
function inProfile(i) {
  const p = curProfile();
  if (!p) return true;
  return (!p.tabs.length || p.tabs.includes(i.tab)) && (!p.cats.length || p.cats.includes(i.category || 'Ekwipunek'));
}
// Wartość z historycznego pomiaru dla wybranego profilu (z rozbicia zakładka|kategoria).
function snapValue(snap) {
  const p = curProfile();
  if (!p) return snap.value;
  if (!snap.tc) return null;
  let v = 0;
  for (const [k, val] of Object.entries(snap.tc)) {
    const [tab, cat] = k.split('|');
    if ((!p.tabs.length || p.tabs.includes(tab)) && (!p.cats.length || p.cats.includes(cat))) v += val;
  }
  return v;
}
function renderProfiles() {
  $('prof').innerHTML = '<option value="">Wszystko</option>' + ST.profiles.map(p => `<option value="${esc(p.id)}" ${p.id === ST.profile ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  $('profEdit').hidden = !curProfile();
}
function openEditor(p) {
  ST.editing = p ? { ...p } : { id: 'p' + Date.now(), name: '', tabs: [], cats: [], isNew: true };
  const e = ST.editing;
  $('profName').value = e.name;
  const tabs = ST.data ? ST.data.tabs.map(t => t.name) : [];
  for (const t of e.tabs) if (!tabs.includes(t)) tabs.push(t);
  $('profTabs').innerHTML = tabs.length ? tabs.map(t => `<label><input type="checkbox" value="${esc(t)}" ${e.tabs.includes(t) ? 'checked' : ''}> ${esc(t)}</label>`).join('') : '<span class="hint2">Najpierw odśwież stash.</span>';
  $('profCats').innerHTML = CATS.map(c => `<label><input type="checkbox" value="${esc(c)}" ${e.cats.includes(c) ? 'checked' : ''}> ${esc(c)}</label>`).join('');
  $('profDel').hidden = !!e.isNew;
  $('profEditor').hidden = false;
  $('profName').focus();
}
async function saveProfiles() {
  await api.quiet({ stashProfiles: ST.profiles, stashProfile: ST.profile });
  renderProfiles(); stashRender();
}
$('prof').onchange = () => { ST.profile = $('prof').value; saveProfiles(); };
$('profNew').onclick = () => openEditor(null);
$('profEdit').onclick = () => openEditor(curProfile());
$('profCancel').onclick = () => { $('profEditor').hidden = true; };
$('profSave').onclick = () => {
  const e = ST.editing;
  e.name = $('profName').value.trim() || 'Profil';
  e.tabs = [...$('profTabs').querySelectorAll('input:checked')].map(i => i.value);
  e.cats = [...$('profCats').querySelectorAll('input:checked')].map(i => i.value);
  const { isNew, ...p } = e;
  ST.profiles = isNew ? [...ST.profiles, p] : ST.profiles.map(x => x.id === p.id ? p : x);
  ST.profile = p.id;
  $('profEditor').hidden = true;
  saveProfiles();
};
$('profDel').onclick = () => {
  ST.profiles = ST.profiles.filter(x => x.id !== ST.editing.id);
  if (ST.profile === ST.editing.id) ST.profile = '';
  $('profEditor').hidden = true;
  saveProfiles();
};

function visibleItems() {
  if (!ST.data) return [];
  const q = $('q').value.trim().toLowerCase();
  const tab = $('tabF').value;
  const min = Number($('minV').value) || 0;
  return ST.data.items.filter(i => inProfile(i) && (!q || i.name.toLowerCase().includes(q) || String(i.baseType).toLowerCase().includes(q))
    && (!tab || i.tab === tab) && i.value >= min).sort((a, b) => b.value - a.value);
}

function stashRender() {
  const d = ST.data;
  if (!d) {
    $('stashHero').innerHTML = '<div class="muted">Brak danych. Wpisz nazwę konta, kliknij Zapisz, a potem Odśwież.</div>';
    $('chart').innerHTML = '<div class="empty">Wykres pojawi się po pierwszym odświeżeniu.</div>'; $('cats').innerHTML = ''; $('itemsView').innerHTML = '';
    return;
  }
  const items = d.items.filter(i => !ST.hidden.has(i.name) && inProfile(i));
  const value = items.reduce((a, i) => a + i.value, 0);
  const listed = items.reduce((a, i) => a + (i.listedChaos || 0), 0);
  const h = ST.history;
  const prev = h.length > 1 ? snapValue(h[h.length - 2]) : null;
  const delta = prev != null ? value - prev : null;
  $('stashHero').innerHTML = `
    <div><span class="k">wartość rynkowa</span><span class="v">${money(value)}</span></div>
    <div><span class="k">od poprzedniego</span><span class="s ${delta == null ? '' : delta >= 0 ? 'up' : 'down'}">${delta == null ? '—' : (delta >= 0 ? '+' : '−') + moneyTxt(Math.abs(delta))}</span></div>
    <div><span class="k">według twoich cen</span><span class="s">${moneyTxt(listed)}</span></div>
    <div><span class="k">przedmiotów</span><span class="s">${items.length}${d.total > d.scanned ? ` <span class="muted">z ${d.total}</span>` : ''}</span></div>`;
  $('stashStatus').textContent = `stan z ${new Date(d.at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
  drawChart();
  drawCats(items);
  const tabs = d.tabs.map(t => t.name);
  const cur = $('tabF').value;
  $('tabF').innerHTML = '<option value="">Wszystkie zakładki</option>' + tabs.map(t => `<option ${t === cur ? 'selected' : ''}>${esc(t)}</option>`).join('');
  drawItems();
}

function drawChart() {
  const pts = ST.history.map(p => p && ({ at: p.at, value: snapValue(p) })).filter(p => p && p.value != null);
  const el = $('chart');
  if (pts.length < 2) { el.innerHTML = '<div class="empty">Za mało pomiarów — wykres zbuduje się z kolejnych odświeżeń.</div>'; $('chartRange').textContent = ''; return; }
  const W = 560, H = 190, L = 46, R = 8, T = 8, B = 22;
  const t0 = pts[0].at, t1 = pts[pts.length - 1].at;
  const vmax = Math.max(...pts.map(p => p.value)) * 1.08 || 1;
  const x = t => L + (t1 === t0 ? 0 : (t - t0) / (t1 - t0)) * (W - L - R);
  const y = v => T + (1 - v / vmax) * (H - T - B);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const area = `${line}L${x(t1).toFixed(1)},${y(0)}L${x(t0).toFixed(1)},${y(0)}Z`;
  const ticks = [0, 0.5, 1].map(f => vmax / 1.08 * f);
  const multiDay = new Date(t0).toDateString() !== new Date(t1).toDateString();
  const lbl = t => new Date(t).toLocaleString('pl-PL', multiDay ? { day: '2-digit', month: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
  const xt = [t0, t0 + (t1 - t0) / 2, t1];
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#2c2921" stroke-width="1"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" fill="#6c6656" font-size="10" font-family="PlexMono">${ST.divine && v >= ST.divine ? (v / ST.divine).toFixed(1) + ' div' : Math.round(v) + ' c'}</text>`).join('')}
    ${xt.map((t, i) => `<text x="${x(t)}" y="${H - 6}" text-anchor="${['start', 'middle', 'end'][i]}" fill="#6c6656" font-size="10" font-family="PlexMono">${lbl(t)}</text>`).join('')}
    <path d="${area}" fill="#c9a24a" opacity="0.10"/>
    <path d="${line}" fill="none" stroke="#c9a24a" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <line id="cx" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="#6c6656" stroke-width="1" visibility="hidden" vector-effect="non-scaling-stroke"/>
    <circle id="cd" r="4" fill="#c9a24a" stroke="#1a1813" stroke-width="2" visibility="hidden"/>
    <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" id="hit"/>
  </svg><div class="tip" id="tip" hidden></div>`;
  $('chartRange').textContent = `${pts.length} pomiarów`;
  const svg = el.querySelector('svg'), tip = $('tip'), cx = el.querySelector('#cx'), cd = el.querySelector('#cd');
  el.querySelector('#hit').onmousemove = e => {
    const r = svg.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width * W;
    let best = pts[0];
    for (const p of pts) if (Math.abs(x(p.at) - mx) < Math.abs(x(best.at) - mx)) best = p;
    const px = x(best.at), py = y(best.value);
    cx.setAttribute('x1', px); cx.setAttribute('x2', px); cx.setAttribute('visibility', 'visible');
    cd.setAttribute('cx', px); cd.setAttribute('cy', py); cd.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.style.left = (px / W * r.width) + 'px'; tip.style.top = (py / H * r.height) + 'px';
    tip.innerHTML = `<b>${moneyTxt(best.value)}</b> <span class="muted">${new Date(best.at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>`;
  };
  el.querySelector('#hit').onmouseleave = () => { tip.hidden = true; cx.setAttribute('visibility', 'hidden'); cd.setAttribute('visibility', 'hidden'); };
}

function drawCats(items) {
  const cats = {};
  for (const i of items) cats[i.category || 'Ekwipunek'] = (cats[i.category || 'Ekwipunek'] || 0) + i.value;
  const total = Object.values(cats).reduce((a, b) => a + b, 0) || 1;
  const rows = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const max = rows.length ? rows[0][1] : 1;
  $('cats').innerHTML = rows.length ? rows.map(([k, v]) => `<div class="cat"><span>${esc(k)}</span><span class="bar"><i style="width:${Math.max(1, v / max * 100)}%"></i></span><span class="n">${esc(moneyTxt(v))}</span><span class="p">${Math.round(v / total * 100)}%</span></div>`).join('')
    : '<div class="empty">Brak przedmiotów</div>';
}

function drawItems() {
  const list = visibleItems();
  if (ST.view === 'tabs') {
    const d = ST.data;
    $('itemsView').innerHTML = `<div class="tabs-grid">${d.tabs.filter(t => { const p = curProfile(); return !p || !p.tabs.length || p.tabs.includes(t.name); }).map(t => {
      const its = d.items.filter(i => i.tab === t.name && !ST.hidden.has(i.name) && inProfile(i));
      const v = its.reduce((a, i) => a + i.value, 0);
      return `<div class="tabcard" data-tab="${esc(t.name)}"><span class="muted">${esc(t.name)} · ${its.length} szt.</span><b>${esc(moneyTxt(v))}</b></div>`;
    }).join('')}</div>`;
    $('itemsView').querySelectorAll('[data-tab]').forEach(c => c.onclick = () => { $('tabF').value = c.dataset.tab; setView('list'); });
    return;
  }
  $('itemsView').innerHTML = list.length ? `<table>
    <tr><th></th><th>Przedmiot</th><th>Zakładka</th><th style="text-align:right">szt.</th><th style="text-align:right">za sztukę</th><th style="text-align:right">razem</th><th style="text-align:right">twoja cena</th><th></th></tr>
    ${list.slice(0, 300).map(i => {
      const hid = ST.hidden.has(i.name);
      const unit = i.value / (i.stack || 1);
      return `<tr class="it ${hid ? 'hidden' : ''}">
        <td>${i.icon && /^https:\/\/web\.poecdn\.com\//.test(i.icon) ? `<img src="${esc(i.icon)}" alt="">` : ''}</td>
        <td><span class="nm rar-${esc(String(i.rarity).split(' ')[0])}">${esc(i.name)}</span>${i.links >= 5 ? `<small>${i.links}L</small>` : ''}${i.cheap ? '<span class="cheapmark">za tanio</span>' : ''}</td>
        <td class="muted">${esc(i.tab)}</td><td class="n">${i.stack}</td><td class="n">${esc(moneyTxt(unit))}</td><td class="n">${esc(moneyTxt(i.value))}</td>
        <td class="n muted">${i.price ? `${esc(i.price.amount)} ${esc(i.price.currency)}` : ''}</td>
        <td><button class="eye" data-hide="${esc(i.name)}" title="${hid ? 'Wlicz do sumy' : 'Pomiń w sumie'}">${hid ? '◌' : '●'}</button></td></tr>`;
    }).join('')}</table>` : '<div class="empty">Nic nie pasuje do filtrów.</div>';
  $('itemsView').querySelectorAll('[data-hide]').forEach(b => b.onclick = async () => {
    const n = b.dataset.hide; const hide = !ST.hidden.has(n);
    ST.hidden = new Set(await api.stashHideItem(n, hide));
    stashRender();
  });
}
function setView(v) { ST.view = v; document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); drawItems(); }
document.querySelectorAll('.seg button').forEach(b => b.onclick = () => setView(b.dataset.v));
['q', 'tabF', 'minV'].forEach(id => $(id).addEventListener('input', drawItems));
$('stashRefresh').onclick = async () => {
  const acc = $('account').value.trim();
  if (acc) await api.quiet({ account: acc, stashAuto: Number($('stashAuto').value) });
  $('stashRefresh').textContent = 'Liczę…'; $('stashRefresh').disabled = true;
  await api.stashRefresh();
  $('stashRefresh').textContent = 'Odśwież'; $('stashRefresh').disabled = false;
};
$('stashIngame').onclick = () => api.stashIngame();
$('stashAuto').onchange = () => api.setSettings({ stashAuto: Number($('stashAuto').value) });
api.on('stash', d => {
  if (d.loading) { $('stashStatus').textContent = d.loading.total ? `pobieram ${d.loading.done}/${d.loading.total}…` : 'szukam ofert…'; return; }
  if (d.error) { $('stashStatus').innerHTML = `<span class="err">${esc(d.error)}</span>`; return; }
  if (d.data) { ST.data = d.data; if (d.history) ST.history = d.history; if (d.divine) ST.divine = d.divine; stashRender(); }
});

// --- historia ---
async function loadHistory() {
  const h = await api.history();
  if (!h.length) { $('history').innerHTML = '<p class="hint" style="margin:0">Jeszcze nic. Handle zapisują się po „Trade accepted” w grze.</p>'; return; }
  const today = new Date().toDateString();
  const sums = {};
  for (const x of h.filter(x => new Date(x.at).toDateString() === today)) sums[x.currency] = (sums[x.currency] || 0) + parseFloat(String(x.amount).replace(',', '.'));
  $('history').innerHTML = `${Object.keys(sums).length ? `<p>Dziś: ${Object.entries(sums).map(([c, v]) => `<b>${fmt(v)} ${esc(c)}</b>`).join(', ')}</p>` : ''}
    <table><tr><th>Kiedy</th><th>Przedmiot</th><th>Kupujący</th><th style="text-align:right">Cena</th></tr>
    ${h.slice(0, 100).map(x => `<tr><td>${new Date(x.at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td>${esc(x.item)}</td><td>${esc(x.name)}</td><td class="n">${esc(x.amount)} ${esc(x.currency)}</td></tr>`).join('')}</table>`;
}
api.on('trade', () => loadHistory());

// --- mapy ---
api.on('hud', d => {
  const m = d.maps; if (!m) return;
  $('mapStats').innerHTML = `<div><span>mapy</span><b class="big">${m.count}</b></div><div><span>średni czas</span><b class="big">${t(m.avgMs)}</b></div>
    <div><span>map na godzinę</span><b class="big">${m.perHour ? m.perHour.toFixed(1) : '—'}</b></div>
    <div><span>zysk</span><b class="big">${fmt(m.loot || 0)} c</b></div><div><span>na godzinę</span><b class="big">${m.lootPerHour ? fmt(m.lootPerHour) + ' c' : '—'}</b></div>`;
  const rec = m.recent || [];
  $('mapRecent').innerHTML = rec.length ? `<table><tr><th>Mapa</th><th style="text-align:right">czas</th><th style="text-align:right">zysk</th><th style="text-align:right">c/h</th></tr>${rec.map(r => `<tr><td>${esc(r.area)}</td><td class="n">${t(r.ms)}</td><td class="n">${fmt(r.loot || 0)} c</td><td class="n">${r.ms > 30000 && r.loot ? fmt(r.loot / (r.ms / 3600000)) : '—'}</td></tr>`).join('')}</table>` : '';
});

// --- obserwowane ---
async function loadWatch() {
  $('watchList').innerHTML = '<div class="empty">Wczytuję ceny…</div>';
  const r = await api.watchPrices();
  const ic = k => r.icons && r.icons[k] ? `<img class="ci" src="${esc(r.icons[k])}" alt="" style="width:16px;height:16px;vertical-align:-3px">` : (k === 'divine' ? ' div' : ' c');
  const m = c => c == null ? '—' : r.divine && c >= r.divine ? `${(c / r.divine).toFixed(2)}${ic('divine')}` : `${fmt(c)}${ic('chaos')}`;
  const sp = (data, ch) => { const v = (data || []).filter(x => x != null); if (v.length < 2) return ''; const mn = Math.min(...v), mx = Math.max(...v);
    return `<svg width="70" height="20" viewBox="0 0 70 20"><polyline points="${v.map((y, i) => `${(i / (v.length - 1) * 70).toFixed(1)},${(18 - (mx === mn ? 0.5 : (y - mn) / (mx - mn)) * 16).toFixed(1)}`).join(' ')}" fill="none" stroke="${ch >= 0 ? '#8fbf6a' : '#d9694f'}" stroke-width="1.6"/></svg>`; };
  $('watchList').innerHTML = r.list.length ? `<table><tr><th></th><th>Przedmiot</th><th style="text-align:right">cena</th><th style="text-align:right">7 dni</th><th></th><th></th></tr>
    ${r.list.map((w, i) => { const p = w.price || {}; return `<tr class="it"><td>${p.icon && /^https:\/\/(web\.poecdn\.com|poe\.ninja)\//.test(p.icon) ? `<img src="${esc(p.icon)}" alt="">` : ''}</td>
      <td><span class="nm rar-${esc(String(w.rarity).split(' ')[0])}">${esc(w.name)}</span>${w.gemLevel ? `<small>poz. ${w.gemLevel}</small>` : ''}${w.links >= 5 ? `<small>${w.links}L</small>` : ''}</td>
      <td class="n">${m(p.chaos)}</td><td class="n ${p.change >= 0 ? 'up' : 'down'}">${p.change != null ? (p.change >= 0 ? '+' : '') + Math.round(p.change) + '%' : ''}</td>
      <td>${sp(p.spark, p.change)}</td><td><button class="eye" data-rm="${i}" title="Usuń">×</button></td></tr>`; }).join('')}</table>`
    : '<div class="empty">Pusto. Wciśnij Ctrl+D na przedmiocie w grze i kliknij ★ w okienku wyceny.</div>';
  $('watchList').querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { await api.watchRemove(+b.dataset.rm); loadWatch(); });
}
$('watchRefresh').onclick = loadWatch;
api.on('watch', () => { if (document.getElementById('obserwowane').classList.contains('on')) loadWatch(); });
$('sessReset').onclick = () => api.sessionReset();

// --- aktualizacje ---
async function loadUpdate() {
  const s = await api.updateStatus();
  const txt = {
    off: 'Automatyczne aktualizacje nie są skonfigurowane w tej wersji.',
    idle: 'Sprawdzę za chwilę.', checking: 'Sprawdzam…', latest: 'Masz najnowszą wersję.',
    downloading: `Pobieram wersję ${s.latest}…`, ready: `Pobrano wersję ${s.latest}. Uruchom ponownie, żeby ją włączyć.`,
    manual: `Wersja ${s.latest} wymaga pobrania pełnej paczki z github.com/Kaie267/poe-nakladka (zmienił się silnik programu).`,
    error: `Nie udało się sprawdzić: ${s.error || ''}`,
  }[s.state] || '';
  $('upd').innerHTML = `<p>Wersja <b class="num">${esc(s.version)}</b>. ${esc(txt)}</p>${s.notes ? `<pre style="white-space:pre-wrap;color:var(--muted)">${esc(s.notes)}</pre>` : ''}`;
  $('updRestart').hidden = s.state !== 'ready';
  const errs = await api.errors();
  $('errs').innerHTML = errs.length ? `<pre style="white-space:pre-wrap;font-size:11px;max-height:200px;overflow:auto">${esc(errs.join('\n'))}</pre><p class="muted">Jeśli coś nie działa, zrób zrzut tej listy i wyślij.</p>` : 'Brak błędów.';
}
$('updCheck').onclick = async () => { $('upd').textContent = 'Sprawdzam…'; await api.updateCheck(); loadUpdate(); };
$('updRestart').onclick = () => api.updateRestart();
api.on('update', loadUpdate);

// --- wygląd ---
function showLook() { $('uiScaleV').textContent = Math.round($('uiScale').value * 100) + '%'; $('uiOpacityV').textContent = Math.round($('uiOpacity').value * 100) + '%'; }
['uiScale', 'uiOpacity'].forEach(id => $(id).addEventListener('input', showLook));
['uiScale', 'uiOpacity'].forEach(id => $(id).addEventListener('change', () => api.setSettings({ [id]: Number($(id).value) })));

// --- profile postaci ---
function renderProfileBox(s) {
  const ps = s.profiles || [];
  $('profBox').innerHTML = `Postać: <select id="profSel"><option value="">${ps.length ? '— wybierz —' : 'domyślna'}</option>${ps.map(p => `<option ${p.name === s.activeProfile ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
    <button id="profAdd" title="Zapisz obecne ustawienia buildu jako nową postać">+ postać</button>${s.activeProfile ? '<button id="profRm" title="Usuń tę postać">usuń</button>' : ''}
    <span id="profNewBox" hidden><input id="profNewName" placeholder="nazwa postaci" style="width:130px;font-size:12px;padding:2px 5px"><button id="profNewOk">OK</button></span>`;
  $('profSel').onchange = async () => { if (!$('profSel').value) return; await api.profileSwitch($('profSel').value); location.reload(); };
  $('profAdd').onclick = () => { $('profNewBox').hidden = false; $('profNewName').focus(); };
  $('profNewOk').onclick = async () => { const n = $('profNewName').value.trim(); if (!n) return; const ns = await api.profileSave(n); renderProfileBox(ns); };
  const rm = $('profRm'); if (rm) rm.onclick = async () => { const ns = await api.profileDelete(s.activeProfile); renderProfileBox(ns); };
}

// --- live search ---
let LS = [];
function lsRender(s) {
  if (s) LS = s.liveSearches || [];
  api.liveState().then(st => {
    $('lsList').innerHTML = LS.length ? `<table><tr><th>Nazwa</th><th>Link</th><th>Stan</th><th></th><th></th></tr>${LS.map((l, i) => `<tr>
      <td>${esc(l.name)}</td><td class="muted" style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.url)}</td>
      <td class="muted">${l.on ? esc(st[l.id] || 'łączę…') : 'wyłączone'}</td>
      <td><button data-ls-t="${i}">${l.on ? 'Wyłącz' : 'Włącz'}</button></td><td><button class="eye" data-ls-r="${i}">×</button></td></tr>`).join('')}</table>`
      : '<div class="empty">Brak zapisanych wyszukiwań.</div>';
    $('lsList').querySelectorAll('[data-ls-t]').forEach(b => b.onclick = () => { LS[+b.dataset.lsT].on = !LS[+b.dataset.lsT].on; lsSave(); });
    $('lsList').querySelectorAll('[data-ls-r]').forEach(b => b.onclick = () => { LS.splice(+b.dataset.lsR, 1); lsSave(); });
  });
}
async function lsSave() { await api.setSettings({ liveSearches: LS }); lsRender(); }
$('lsAdd').onclick = () => {
  const url = $('lsUrl').value.trim();
  if (!/pathofexile\.com\/trade\/search\/[^/]+\/[A-Za-z0-9]+/.test(url)) { $('lsUrl').style.borderColor = 'var(--bad)'; return; }
  $('lsUrl').style.borderColor = '';
  LS.push({ id: 'l' + Date.now(), name: $('lsName').value.trim() || 'Wyszukiwanie', url, on: true });
  $('lsName').value = ''; $('lsUrl').value = '';
  lsSave();
};
$('login2').onclick = () => api.marketLogin();
$('guideSourceSel').onchange = () => api.guideSource($('guideSourceSel').value);
api.on('live', () => lsRender());

// --- regexy ---
const RX_MAP_DEFAULT = [
  ['Odbicie obrażeń żywiołów', 'f elem'], ['Odbicie obrażeń fizycznych', 'f phys'], ['Brak regeneracji', 'regen'],
  ['Mniej odzyskiwania (less recovery)', 's rec'], ['Mniej max resów', 'um res'], ['Klątwa Elemental Weakness', 'l weak'],
  ['Klątwa Temporal Chains', 'temp'], ['Klątwa Vulnerability', 'vuln'], ['Klątwa Enfeeble', 'enfe'],
  ['Brak leecha', 'nnot le'], ['Potwory unikają ailmentów', 'avoid'], ['Płonąca ziemia', 'burning g'],
];
const RX_PRESETS = [
  ['Buty z ruchem', 'nt sp'], ['3-link', '\\w-\\w-\\w'], ['4-link', '\\w-\\w-\\w-\\w'], ['Kolory R-G-B (chromatic)', 'r-g-b|r-b-g|g-r-b|g-b-r|b-r-g|b-g-r'],
  ['+1 do poziomu gemów', '\\+1 to level'], ['Życie (life)', 'um life'], ['Odporności', 'resista'], ['Ruch + życie', 'nt sp.*um life|um life.*nt sp'],
];
let RXM = [];
function rxInit(s) {
  const saved = (s.regexAvoid || []);
  const edit = s.regexMapList || RX_MAP_DEFAULT.map(([a, b]) => `${a} = ${b}`).join('\n');
  $('rxMapEdit').value = edit;
  rxBuildList(saved);
  $('rxPresets').innerHTML = RX_PRESETS.map(([n, r], i) => `<div class="preset"><span>${esc(n)}</span><code>${esc(r)}</code><button data-px="${i}">Kopiuj</button></div>`).join('');
  $('rxPresets').querySelectorAll('[data-px]').forEach(b => b.onclick = () => copyBtn(b, RX_PRESETS[+b.dataset.px][1]));
}
function rxBuildList(selected) {
  RXM = $('rxMapEdit').value.split('\n').map(l => l.split('=')).filter(p => p.length >= 2).map(([a, ...b]) => [a.trim(), b.join('=').trim()]);
  $('rxMap').innerHTML = RXM.map(([n, r], i) => `<label><input type="checkbox" data-rx="${i}" ${selected.includes(r) ? 'checked' : ''}> ${esc(n)}</label>`).join('');
  $('rxMap').querySelectorAll('[data-rx]').forEach(c => c.onchange = rxMapOut);
  rxMapOut();
}
function rxMapOut() {
  const sel = [...$('rxMap').querySelectorAll('[data-rx]:checked')].map(c => RXM[+c.dataset.rx][1]);
  const out = sel.length ? `"!${sel.join('|')}"` : '';
  $('rxMapOut').textContent = out;
  $('rxMapLen').textContent = out ? `${out.length}/50` : '';
  $('rxMapLen').style.color = out.length > 50 ? 'var(--bad)' : '';
  api.quiet({ regexAvoid: sel });
}
$('rxMapEdit').addEventListener('change', () => { api.quiet({ regexMapList: $('rxMapEdit').value }); rxBuildList([...$('rxMap').querySelectorAll('[data-rx]:checked')].map(c => RXM[+c.dataset.rx][1])); });
function rxOwn() {
  const w = $('rxWords').value.split(',').map(x => x.trim()).filter(Boolean).map(x => x.replace(/[.*+?^${}()[\]\\]/g, '\\$&'));
  const out = w.length ? `"${$('rxNot').checked ? '!' : ''}${w.join('|')}"` : '';
  $('rxOwnOut').textContent = out; $('rxOwnLen').textContent = out ? `${out.length}/50` : '';
}
$('rxWords').addEventListener('input', rxOwn); $('rxNot').addEventListener('change', rxOwn);
function copyBtn(b, text) { navigator.clipboard.writeText(text).catch(() => api.copy(text)); const t = b.textContent; b.textContent = 'Skopiowano'; setTimeout(() => { b.textContent = t; }, 1300); }
$('rxMapCopy').onclick = () => copyBtn($('rxMapCopy'), $('rxMapOut').textContent);
$('rxOwnCopy').onclick = () => copyBtn($('rxOwnCopy'), $('rxOwnOut').textContent);

// --- loot filtr ---
async function fInit(s) {
  const r = await api.filterList();
  $('fBase').innerHTML = '<option value="">(bez bazowego filtra)</option>' + r.files.map(f => `<option ${f === s.filterBase ? 'selected' : ''}>${esc(f)}</option>`).join('');
  $('fT2').value = s.filterT2 ?? 20; $('fT3').value = s.filterT3 ?? 5;
  if (r.last) fShow(r.last);
  else if (!r.files.length) $('fStatus').textContent = 'Nie znalazłem filtrów w ' + r.dir;
}
function fShow(r) {
  if (r.error) { $('fStatus').innerHTML = `<span class="err">${esc(r.error)}</span>`; return; }
  $('fStatus').innerHTML = `Gotowe (${new Date(r.at).toLocaleTimeString('pl-PL')}): T1 <b>${r.counts.t1}</b> · T2 <b>${r.counts.t2}</b> · T3 <b>${r.counts.t3}</b> przedmiotów. Najdroższe: ${r.top.slice(0, 5).map(([n, c]) => `${esc(n)} (${Math.round(c)} c)`).join(', ')}`;
}
$('fMake').onclick = async () => {
  await api.setSettings({ filterBase: $('fBase').value, filterT2: Number($('fT2').value) || 20, filterT3: Number($('fT3').value) || 5, filterAuto: $('filterAuto').checked });
  $('fStatus').textContent = 'Pobieram ceny i składam filtr…';
  fShow(await api.filterMake());
};
$('fFolder').onclick = () => api.filterFolder();
$('fRefresh').onclick = async () => { const s = await api.getSettings(); const cur = $('fBase').value; await fInit({ ...s, filterBase: cur || s.filterBase }); $('fStatus').textContent = 'Lista filtrów odświeżona.'; };

// --- doradca map ---
async function mpRun() {
  const r = await api.mapAdvise($('mpIn').value);
  if (r.error) { $('mpOut').innerHTML = `<p class="err">${esc(r.error)}</p>`; return; }
  const it = r.item, st = r.stats;
  const cls = r.nBad ? 'vb' : r.score >= 60 ? 'vg' : '';
  $('mpOut').innerHTML = `<div class="card" style="margin-top:8px">
    <div class="ct">${esc(it.name)} <span>${esc([it.baseType !== it.name ? it.baseType : '', it.mapTier ? 'tier ' + it.mapTier : '', it.rarity, it.corrupted ? 'skorumpowana' : ''].filter(Boolean).join(' · '))}</span></div>
    <div class="hero" style="margin-bottom:8px"><div><span class="k">ocena</span><span class="v ${cls}">${r.score}<small>/100</small></span></div>
      <div><span class="k">pack size</span><span class="s">${st.pack}%</span></div><div><span class="k">quant / Atlas Drops</span><span class="s">${st.quant}%</span></div>
      <div><span class="k">rarity</span><span class="s">${st.rar}%</span></div>${r.price != null ? `<div><span class="k">cena mapy</span><span class="s">${fmt(r.price)} c</span></div>` : ''}</div>
    ${r.mods.length ? `<table class="cr-mods">${r.mods.map(m => `<tr><td class="${m.bad ? 'vb' : 'vm'}">${m.bad ? '✕' : '·'}</td><td class="${m.bad ? 'vb' : ''}">${esc(m.text)}</td></tr>`).join('')}</table>` : ''}</div>
    <h2>Co zrobić</h2>${r.steps.map(x => `<div class="cr-step"><b>${esc(x.t)}</b><span>${esc(x.d)}</span></div>`).join('')}`;
}
$('mpGo').onclick = mpRun;
$('mpPaste').onclick = async () => { try { $('mpIn').value = await navigator.clipboard.readText(); mpRun(); } catch { $('mpIn').focus(); } };

// --- doradca craftu ---
async function crRun() {
  const r = await api.craftAdvise($('crIn').value);
  if (r.error) { $('crOut').innerHTML = `<p class="err">${esc(r.error)}</p>`; return; }
  const it = r.item, sm = r.summary || {};
  const V = { good: ['✓', 'vg'], mid: ['·', 'vm'], bad: ['✕', 'vb'] };
  const mods = (r.mods || []).map(m => `<tr><td class="${V[m.verdict][1]}">${V[m.verdict][0]}</td><td class="side">${m.side ? (m.side === 'prefix' ? 'prefix' : 'suffix') + (m.tier ? ' T' + m.tier : '') : m.type}</td><td>${esc(m.text)}${m.pl ? `<div class="muted">${esc(m.pl)}</div>` : ''}</td></tr>`).join('');
  $('crOut').innerHTML = `<div class="card" style="margin-top:8px">
    <div class="ct">${esc(it.name)} <span>${esc([it.baseType !== it.name ? it.baseType : '', it.itemClass, it.rarity, it.ilvl ? 'ilvl ' + it.ilvl : ''].filter(Boolean).join(' · '))}</span></div>
    ${sm.max ? `<p class="muted">Prefixy: <b>${sm.pre}/${sm.max}</b> · suffixy: <b>${sm.suf}/${sm.max}</b>${sm.exact ? '' : ' (szacunek)'}</p>` : ''}
    ${mods ? `<table class="cr-mods">${mods}</table>` : ''}</div>
    <h2>Co zrobić</h2>${(r.steps || []).map(st => `<div class="cr-step"><b>${esc(st.t)}</b><span>${esc(st.d)}</span></div>`).join('')}`;
}
$('crGo').onclick = crRun;
$('crPaste').onclick = async () => { try { $('crIn').value = await navigator.clipboard.readText(); crRun(); } catch { $('crIn').focus(); } };

// --- poradniki ---
function guideShow(id) {
  const G = window.GUIDES || [];
  const g = G.find(x => x.id === id) || G[0];
  if (!g) return;
  $('gNav').innerHTML = G.map(x => `<button data-g="${x.id}" class="${x.id === g.id ? 'on' : ''}">${esc(x.name)}</button>`).join('');
  $('gNav').querySelectorAll('[data-g]').forEach(b => b.onclick = () => guideShow(b.dataset.g));
  $('gView').innerHTML = g.html;
}
guideShow('craft');

load().then(() => show((location.hash || '#ogolne').slice(1)));
