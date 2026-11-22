'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => n >= 100 ? Math.round(n).toLocaleString('pl-PL') : (+n).toFixed(1);
const t = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const FIELDS = ['vendorThreshold', 'tradeStatus', 'modMinPercent', 'poesessid', 'clientLog', 'thanksMessage', 'busyMessage', 'account', 'guideClass'];
const CHECKS = ['autoTradeRares', 'restoreClipboard', 'hudVisible', 'buyerSound', 'guideLeagueStart'];

function show(sec) {
  document.querySelectorAll('section').forEach(s => s.classList.toggle('on', s.id === sec));
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.dataset.s === sec));
  if (sec === 'handel') loadHistory();
  if (sec === 'aktualizacje') loadUpdate();
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
  await stashInit();
}

$('save').onclick = async () => {
  const hotkeys = {}; document.querySelectorAll('[data-hk]').forEach(i => { hotkeys[i.dataset.hk] = i.value.trim(); });
  const commands = $('commands').value.split('\n').map(l => l.split('=')).filter(p => p.length >= 2 && p[0].trim())
    .map(([k, ...x]) => ({ key: k.trim(), text: x.join('=').trim() }));
  const patch = { league: $('league').value, hotkeys, commands, mapDanger: $('mapDanger').value.split('\n').map(s => s.trim()).filter(Boolean) };
  for (const k of FIELDS) patch[k] = $(k).value.trim();
  for (const k of ['vendorThreshold', 'modMinPercent']) patch[k] = Number(patch[k]) || 0;
  for (const k of CHECKS) patch[k] = $(k).checked;
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
};

// --- stash ---
const ST = { data: null, history: [], divine: null, hidden: new Set(), view: 'list' };
const money = c => {
  if (c == null) return '—';
  if (ST.divine && Math.abs(c) >= ST.divine) return `${(c / ST.divine).toFixed(1)}<small>div</small>`;
  return `${fmt(c)}<small>c</small>`;
};
const moneyTxt = c => ST.divine && Math.abs(c) >= ST.divine ? `${(c / ST.divine).toFixed(2)} div` : `${fmt(c)} c`;

async function stashInit() {
  const s = await api.getSettings();
  ST.hidden = new Set(s.stashHidden || []);
  $('stashAuto').value = String(s.stashAuto ?? 30);
  ST.history = await api.stashHistory() || [];
  ST.data = await api.stashGet();
  const mi = await api.marketInfo(); ST.divine = mi.divine;
  topbar(mi);
  stashRender();
}
function topbar(mi) {
  $('topbar').innerHTML = `${mi.divine ? `<span>1 div = <b>${Math.round(mi.divine)} c</b></span>` : ''}<span>${esc(mi.league || '')}</span>`;
}

function visibleItems() {
  if (!ST.data) return [];
  const q = $('q').value.trim().toLowerCase();
  const tab = $('tabF').value;
  const min = Number($('minV').value) || 0;
  return ST.data.items.filter(i => (!q || i.name.toLowerCase().includes(q) || String(i.baseType).toLowerCase().includes(q))
    && (!tab || i.tab === tab) && i.value >= min).sort((a, b) => b.value - a.value);
}

function stashRender() {
  const d = ST.data;
  if (!d) {
    $('stashHero').innerHTML = '<div class="muted">Brak danych. Wpisz nazwę konta, kliknij Zapisz, a potem Odśwież.</div>';
    $('chart').innerHTML = '<div class="empty">Wykres pojawi się po pierwszym odświeżeniu.</div>'; $('cats').innerHTML = ''; $('itemsView').innerHTML = '';
    return;
  }
  const items = d.items.filter(i => !ST.hidden.has(i.name));
  const value = items.reduce((a, i) => a + i.value, 0);
  const listed = items.reduce((a, i) => a + (i.listedChaos || 0), 0);
  const h = ST.history;
  const prev = h.length > 1 ? h[h.length - 2].value : null;
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
  const pts = ST.history.filter(p => p && p.value != null);
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
    $('itemsView').innerHTML = `<div class="tabs-grid">${d.tabs.map(t => {
      const its = d.items.filter(i => i.tab === t.name && !ST.hidden.has(i.name));
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
    <div><span>map na godzinę</span><b class="big">${m.perHour ? m.perHour.toFixed(1) : '—'}</b></div><div><span>sesja</span><b class="big">${t(m.sessionMs)}</b></div>`;
});
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
}
$('updCheck').onclick = async () => { $('upd').textContent = 'Sprawdzam…'; await api.updateCheck(); loadUpdate(); };
$('updRestart').onclick = () => api.updateRestart();
api.on('update', loadUpdate);

load().then(() => show((location.hash || '#ogolne').slice(1)));
