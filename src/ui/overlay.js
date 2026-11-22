'use strict';
const card = document.getElementById('card');
let S = {};

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => n == null || isNaN(n) ? '—' : (n >= 100 ? Math.round(n).toLocaleString('pl-PL') : n >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/\.0+$|(\.\d*[1-9])0+$/, '$1');
const CUR = { chaos: 'c', divine: 'div', exalted: 'ex', alch: 'alch', 'mirror': 'mirror' };

api.on('item', d => {
  S = { counting: d.counting, item: d.item, error: d.error, threshold: d.threshold, mapDanger: d.mapDanger || [], ninja: null, ninjaLoading: !d.error, filters: null, trade: null, useBase: true, ilvl: false,
    league: d.league, icons: S.icons || {}, excluded: new Set(), opts: { status: d.tradeStatus || 'online', priceCur: '', indexed: '', broad: false } };
  render();
});
api.on('ninja', d => { S.ninjaLoading = false; S.ninja = d.result; S.divine = d.divine; S.ninjaError = d.error; render(); });
api.on('filters', d => { S.filters = d.filters; render(); });
api.on('trade', d => {
  if (d.wait) { S.wait = d.wait; render(); return; }
  S.wait = null;
  if (d.loading) S.trade = { loading: true };
  else { S.trade = d; if (d.icons) S.icons = d.icons; S.excluded = new Set(); }
  render();
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') api.hide(); });

// Szacunek z ofert: mediana 10 najtańszych (bez ofert wyłączonych okiem), zakres i wiarygodność.
function tradeEstimate() {
  const r = S.trade && S.trade.result;
  if (!r || !r.listings.length) return null;
  const vals = r.listings.filter(l => !S.excluded.has(l.id)).map(l => l.chaos).filter(v => v != null).sort((a, b) => a - b).slice(0, 10);
  if (!vals.length) return null;
  const est = vals[Math.floor((vals.length - 1) / 2)];
  const lo = vals[0], hi = vals[vals.length - 1];
  const spread = lo > 0 ? hi / lo : 99;
  const rel = vals.length >= 8 && spread < 2.5 ? 'wysoka' : vals.length >= 4 && spread < 5 ? 'średnia' : 'niska';
  return { est, lo, hi, rel, n: vals.length };
}
function estimateFromTrade() { const e = tradeEstimate(); return e ? e.est : null; }

function priceBlock() {
  const it = S.item;
  let unit = null, source = '', change = null, listings = null;
  if (S.ninja && S.ninja.price) {
    unit = S.ninja.price.chaos; source = S.ninja.price.source; change = S.ninja.price.change; listings = S.ninja.price.listings;
  } else {
    const est = estimateFromTrade();
    if (est != null) { unit = est; source = 'szacunek z ofert na trade'; }
  }
  const total = unit != null ? unit * (it.stack || 1) : null;
  const div = S.divine;
  let big;
  if (total == null) big = S.ninjaLoading || (S.trade && S.trade.loading) ? '<span class="status">liczę…</span>' : '—';
  else if (div && total >= div) big = `${fmt(total / div)}<small>div</small>`;
  else big = `${fmt(total)}<small>c</small>`;

  let verdict = '<span class="verdict v-unknown">BRAK CENY</span>';
  if (total != null) verdict = total >= S.threshold ? '<span class="verdict v-sell">SPRZEDAJ</span>' : '<span class="verdict v-vendor">WENDOR</span>';
  if (total == null && (S.ninjaLoading || (S.trade && S.trade.loading))) verdict = '';

  const meta = [];
  if (it.stack > 1 && unit != null) meta.push(`<span class="num">${fmt(unit)} c</span> / szt. × ${it.stack}`);
  if (div && total != null && total >= div) meta.push(`<span class="num">≈ ${fmt(total)} c</span>`);
  else if (div && total != null && total > 0) meta.push(`<span class="num">${fmt(total / div)} div</span>`);
  if (change != null) meta.push(`7 dni: <span class="num ${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '+' : ''}${Math.round(change)}%</span>`);
  if (listings) meta.push(`<span class="num">${listings}</span> ofert`);
  if (source) meta.push(esc(source));
  if (S.ninja && S.ninja.price && S.ninja.price.variant) meta.push('wariant: ' + esc(S.ninja.price.variant));
  if (S.ninjaError) meta.push(`<span class="err">${esc(S.ninjaError)}</span>`);
  return `<div class="price"><div class="big">${big}</div>${verdict}<div class="meta">${meta.map(m => `<span>${m}</span>`).join('')}</div></div>`;
}

function mapBlock() {
  const it = S.item;
  const pats = S.mapDanger.map(p => p.toLowerCase());
  const bad = m => pats.some(p => m.text.toLowerCase().includes(p));
  const stats = it.mapStats.map(s => `<span>${esc(s.label)} <span class="num">${s.value > 0 ? '+' : ''}${s.value}%</span></span>`).join('');
  const nBad = it.mods.filter(bad).length;
  return `<section><h3>Mody mapy <span>${nBad ? `<span class="danger" style="font-weight:600">groźne: ${nBad}</span>` : 'brak groźnych'}</span></h3>
    ${stats ? `<div class="mapstats sub">${stats}</div>` : ''}
    <div class="mods">${it.mods.map(m => `<div class="${bad(m) ? 'danger' : 'safe'}">${esc(m.text)}</div>`).join('')}</div></section>`;
}

function filtersBlock() {
  if (!S.filters) return '';
  const rows = S.filters.map((f, i) => `
    <label class="flt ${!f.matched ? 'nomatch' : f.enabled ? '' : 'off'}">
      <input type="checkbox" data-i="${i}" ${f.enabled ? 'checked' : ''} ${f.matched ? '' : 'disabled'}>
      <span>${esc(f.label)}</span>
      ${f.matched && f.min != null ? `<input type="number" class="num" data-min="${i}" value="${f.min}">` : '<span></span>'}
    </label>`).join('');
  return `<section><h3>Wyszukiwanie <span>min. wartości</span></h3>${rows}
    <div class="opts">
      <label><input type="checkbox" id="useBase" ${S.useBase ? 'checked' : ''}> baza: ${esc(S.item.baseType)}</label>
      <label><input type="checkbox" id="ilvl" ${S.ilvl ? 'checked' : ''}> ilvl ${S.item.ilvl ?? ''}+</label>
      <span class="grow"></span><button class="primary" id="go">Szukaj</button>
    </div></section>`;
}

const CUR_ICON = c => S.icons && S.icons.trade && S.icons.trade[c] ? `<img class="ci" src="${esc(S.icons.trade[c])}" alt="${esc(c)}">` : `<span class="muted">${esc(CUR[c] || c || '')}</span>`;
const ago = iso => {
  if (!iso) return '';
  const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.round(m)} min`;
  if (m < 1440) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} d`;
};

function controls() {
  const o = S.opts;
  const sel = (id, val, opts) => `<select id="${id}">${opts.map(([v, t]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  return `<div class="ctrl">
    ${sel('oCur', o.priceCur, [['', 'Ekwiwalent chaos'], ['chaos', 'Tylko chaos'], ['divine', 'Tylko divine'], ['chaos_divine', 'Chaos lub divine']])}
    ${sel('oStatus', o.status, [['securable', 'Instant buyout'], ['online', 'Online'], ['any', 'Wszyscy']])}
    ${sel('oIdx', o.indexed, [['', 'Dowolny czas'], ['1day', 'Do 1 dnia'], ['3days', 'Do 3 dni'], ['1week', 'Do tygodnia'], ['2weeks', 'Do 2 tygodni']])}
  </div>`;
}

function tradeBlock() {
  const t = S.trade;
  const it = S.item;
  const simple = !S.filters && (it.rarity === 'Unique' || it.rarity === 'Gem' || it.isMap || it.rarity === 'Currency' || it.rarity === 'Divination Card');
  if (S.wait) return `<section><h3>Trade</h3><div class="status">Pilnuję limitu GGG — czekam <span class="num">${S.wait}</span> s…</div></section>`;
  if (!t) return simple ? `<section><h3>Trade <span><a id="go">sprawdź oferty na trade</a></span></h3>${controls()}</section>` : '';
  if (t.loading) return `<section><h3>Trade</h3><div class="status">szukam…</div></section>`;
  if (t.error) return `<section><h3>Trade</h3><div class="err">${esc(t.error)}</div></section>`;
  const r = t.result;
  const e = tradeEstimate();
  const showLvl = it.rarity === 'Gem';
  const est = e ? `<div class="est">
      <div class="k">Szacowana wartość</div>
      <div class="ev num">≈ ${fmt(S.divine && e.est >= S.divine ? e.est / S.divine : e.est)} ${CUR_ICON(S.divine && e.est >= S.divine ? 'divine' : 'chaos')}</div>
      <div class="er">zakres <span class="num">${fmt(e.lo)}–${fmt(e.hi)} c</span> · wiarygodność <span class="rel-${e.rel === 'wysoka' ? 'hi' : e.rel === 'średnia' ? 'mid' : 'lo'}">${e.rel}</span></div>
    </div>` : '';
  const rows = r.listings.map(l => {
    const off = S.excluded.has(l.id);
    return `<tr class="${off ? 'off' : ''}">
      <td><button class="eye" data-ex="${esc(l.id)}" title="${off ? 'Wlicz do szacunku' : 'Pomiń w szacunku'}">${off ? '◌' : '●'}</button></td>
      <td class="p num">${fmt(l.amount)} × ${CUR_ICON(l.currency)}</td>
      ${showLvl ? `<td class="c num">${l.level ?? ''}</td><td class="c num">${l.quality ?? 0}%</td>` : ''}
      <td class="acc">${esc(l.account || '')}${l.instant ? '<span class="tag">instant</span>' : ''}</td>
      <td class="c">${ago(l.indexed)}</td></tr>`;
  }).join('');
  return `<section>${est}
    <h3>Trade <span><span class="num">${r.listings.length}/${r.total}</span> · <a data-url="${esc(r.url)}">pathofexile.com/trade</a> · <a id="go" title="Szukaj ponownie">↻</a></span></h3>
    ${controls()}
    ${r.listings.length ? `<div class="tbl"><table><tr class="th"><th></th><th class="p">Cena</th>${showLvl ? '<th class="c">Poz.</th><th class="c">Q</th>' : ''}<th>Konto</th><th class="c">Wystawione</th></tr>${rows}</table></div>`
      : '<div class="status">Brak ofert. Odznacz część modów, przełącz na „Szeroko” albo zmień filtry wyżej.</div>'}</section>`;
}

function links(it) {
  const name = ['Unique', 'Gem', 'Currency', 'Divination Card'].includes(it.rarity) ? it.name : it.baseType;
  const l = [
    ['wiki', 'https://www.poewiki.net/wiki/' + encodeURIComponent(String(name).replace(/ /g, '_'))],
    ['poedb', 'https://poedb.tw/us/search?q=' + encodeURIComponent(name)],
  ];
  if (it.rarity === 'Rare' || it.rarity === 'Magic' || it.rarity === 'Normal') l.push(['Craft of Exile', 'https://www.craftofexile.com/']);
  return l.map(([t, u]) => `<a data-url="${esc(u)}">${t}</a>`).join(' · ');
}

function render() {
  if (S.error) {
    card.innerHTML = `<header><div class="name">Nakładka PoE</div><button class="x" id="x">×</button><div class="sub">${esc(S.error)}</div></header>`;
  } else if (S.item) {
    const it = S.item;
    const rcls = 'r-' + String(it.rarity).split(' ')[0];
    const sub = [it.rarity === 'Unique' || it.rarity === 'Rare' ? it.baseType : null, it.itemClass, it.ilvl ? `ilvl ${it.ilvl}` : null,
      it.gemLevel ? `poziom ${it.gemLevel}` : null, it.quality ? `jakość ${it.quality}%` : null, it.links >= 5 ? `${it.links}L` : null,
      it.mapTier ? `tier ${it.mapTier}` : null, it.corrupted ? 'skorumpowany' : null].filter(Boolean).join(' · ');
    card.innerHTML = `
      <header class="${rcls}"><div class="name">${esc(it.name)}</div><button class="x" id="x">×</button><div class="sub">${esc(sub)}</div></header>
      ${priceBlock()}
      ${!it.isMap && it.rarity !== 'Currency' && it.rarity !== 'Divination Card' ? `<div class="mode"><label><input type="radio" name="mode" value="q" ${S.opts.broad ? '' : 'checked'}> Szybka cena</label><label><input type="radio" name="mode" value="b" ${S.opts.broad ? 'checked' : ''}> Szeroko (−10%)</label></div>` : ''}
      ${it.isMap ? mapBlock() : ''}
      ${filtersBlock()}
      ${tradeBlock()}
      <div class="foot"><span>${links(it)}</span><span>${S.counting ? '<span style="color:var(--gold)">liczenie włączone</span>' : 'Esc — zamknij'}</span></div>`;
  }
  bind();
  requestAnimationFrame(() => api.resize(card.getBoundingClientRect().height + 2));
}

function bind() {
  const x = document.getElementById('x'); if (x) x.onclick = () => api.hide();
  card.querySelectorAll('[data-i]').forEach(cb => cb.onchange = () => { S.filters[+cb.dataset.i].enabled = cb.checked; render(); });
  card.querySelectorAll('[data-min]').forEach(inp => inp.onchange = () => { S.filters[+inp.dataset.min].min = inp.value === '' ? null : Number(inp.value); });
  const ub = document.getElementById('useBase'); if (ub) ub.onchange = () => { S.useBase = ub.checked; };
  const il = document.getElementById('ilvl'); if (il) il.onchange = () => { S.ilvl = il.checked; };
  const run = () => api.search({ filters: S.filters || [], useBase: S.useBase, ilvl: S.ilvl, ...S.opts });
  card.querySelectorAll('#go').forEach(g => g.onclick = run);
  const bindSel = (id, key) => { const el = document.getElementById(id); if (el) el.onchange = () => { S.opts[key] = el.value; if (S.trade && S.trade.result) run(); }; };
  bindSel('oCur', 'priceCur'); bindSel('oStatus', 'status'); bindSel('oIdx', 'indexed');
  card.querySelectorAll('input[name=mode]').forEach(r => r.onchange = () => { S.opts.broad = r.value === 'b'; if (S.trade && S.trade.result || S.filters) run(); });
  card.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => { const id = b.dataset.ex; if (S.excluded.has(id)) S.excluded.delete(id); else S.excluded.add(id); render(); });
  card.querySelectorAll('[data-url]').forEach(a => a.onclick = () => api.open(a.dataset.url));
}
