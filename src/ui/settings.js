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
  const st = await api.stashGet(); if (st) stashSummary(st);
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
function stashSummary(d) {
  const tabs = d.tabs.slice(0, 12).map(x => `<tr><td>${esc(x.name)}</td><td class="n">${x.count}</td><td class="n">${fmt(x.value)} c</td><td class="n">${fmt(x.listed)} c</td></tr>`).join('');
  const cheap = d.items.filter(i => i.cheap);
  $('stashSummary').innerHTML = `<div class="stat"><div><span>wartość rynkowa</span><b class="big">${fmt(d.value)} c</b></div><div><span>według twoich cen</span><b class="big">${fmt(d.listed)} c</b></div><div><span>przedmiotów</span><b class="big">${d.scanned}</b></div></div>
    ${d.total > d.scanned ? `<p class="hint" style="margin:0 0 8px">Policzono ${d.scanned} najdroższych z ${d.total} wystawionych.</p>` : ''}
    ${cheap.length ? `<p class="err">Wystawione dużo taniej niż rynek: ${cheap.slice(0, 6).map(i => esc(i.name)).join(', ')}${cheap.length > 6 ? '…' : ''}</p>` : ''}
    <table><tr><th>Zakładka</th><th style="text-align:right">szt.</th><th style="text-align:right">rynek</th><th style="text-align:right">twoje ceny</th></tr>${tabs}</table>
    <p class="hint" style="margin:6px 0 0">Stan z ${new Date(d.at).toLocaleString('pl-PL')}</p>`;
}
$('stashRefresh').onclick = async () => { $('stashRefresh').textContent = 'Liczę…'; await api.stashRefresh(); $('stashRefresh').textContent = 'Odśwież wartość'; };
api.on('stash', d => { if (d.data) stashSummary(d.data); });

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
