'use strict';
const card = document.getElementById('card');
let S = {};

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => n == null || isNaN(n) ? '—' : (n >= 100 ? Math.round(n).toLocaleString('pl-PL') : n >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/\.0+$|(\.\d*[1-9])0+$/, '$1');
const CUR = { chaos: 'c', divine: 'div', exalted: 'ex', alch: 'alch', 'mirror': 'mirror' };

api.on('item', d => {
  S = { counting: d.counting, item: d.item, error: d.error, threshold: d.threshold, mapDanger: d.mapDanger || [], ninja: null, ninjaLoading: !d.error, filters: null, trade: null, useBase: true, ilvl: false };
  render();
});
api.on('ninja', d => { S.ninjaLoading = false; S.ninja = d.result; S.divine = d.divine; S.ninjaError = d.error; render(); });
api.on('filters', d => { S.filters = d.filters; render(); });
api.on('trade', d => {
  if (d.wait) { S.wait = d.wait; render(); return; }
  S.wait = null;
  if (d.loading) S.trade = { loading: true };
  else S.trade = d;
  render();
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') api.hide(); });

function estimateFromTrade() {
  const r = S.trade && S.trade.result;
  if (!r || !r.listings.length) return null;
  const vals = r.listings.map(l => l.chaos).filter(v => v != null).slice(0, 5).sort((a, b) => a - b);
  if (!vals.length) return null;
  return vals[Math.floor((vals.length - 1) / 2)];
}

function priceBlock() {
  const it = S.item;
  let unit = null, source = '', change = null, listings = null;
  if (S.ninja && S.ninja.price) {
    unit = S.ninja.price.chaos; source = S.ninja.price.source; change = S.ninja.price.change; listings = S.ninja.price.listings;
  } else {
    const est = estimateFromTrade();
    if (est != null) { unit = est; source = 'mediana 5 najtańszych ofert z trade'; }
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

function tradeBlock() {
  const t = S.trade;
  const it = S.item;
  const canSearchSimple = !S.filters && (it.rarity === 'Unique' || it.rarity === 'Gem' || it.isMap || it.rarity === 'Currency' || it.rarity === 'Divination Card');
  if (S.wait) return `<section><h3>Trade</h3><div class="status">Pilnuję limitu GGG — czekam <span class="num">${S.wait}</span> s…</div></section>`;
  if (!t) return canSearchSimple ? `<section><h3>Trade <span><a id="go">sprawdź oferty na trade</a></span></h3></section>` : '';
  if (t.loading) return `<section><h3>Trade</h3><div class="status">szukam…</div></section>`;
  if (t.error) return `<section><h3>Trade</h3><div class="err">${esc(t.error)}</div></section>`;
  const r = t.result;
  const rows = r.listings.map(l => `<tr>
      <td class="p num">${fmt(l.amount)} ${esc(CUR[l.currency] || l.currency || '')}</td>
      <td class="acc">${esc(l.account || '')}${l.instant ? '<span class="tag">instant</span>' : ''}</td>
      <td class="c num">${l.chaos != null && l.currency !== 'chaos' ? fmt(l.chaos) + ' c' : ''}</td></tr>`).join('');
  return `<section><h3>Trade <span><span class="num">${r.total}</span> wyników · <a data-url="${esc(r.url)}">otwórz</a></span></h3>
    ${r.listings.length ? `<table>${rows}</table>` : '<div class="status">Brak ofert. Odznacz część modów albo obniż wartości.</div>'}</section>`;
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
  const go = document.getElementById('go');
  if (go) go.onclick = () => api.search({ filters: S.filters || [], useBase: S.useBase, ilvl: S.ilvl });
  card.querySelectorAll('[data-url]').forEach(a => a.onclick = () => api.open(a.dataset.url));
}
