'use strict';
const card = document.getElementById('card');
let S = {};

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => n == null || isNaN(n) ? '—' : (n >= 100 ? Math.round(n).toLocaleString('pl-PL') : n >= 10 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(3)).replace(/\.0+$|(\.\d*[1-9])0+$/, '$1');
const CUR = { chaos: 'c', divine: 'div', exalted: 'ex', alch: 'alch', mirror: 'mirror' };
const safeImg = u => u && /^https:\/\/(web\.poecdn\.com|poe\.ninja)\//.test(u) ? u : null;
const icon = (cur, cls = 'ci') => {
  const src = S.icons && (cur === 'chaos' || cur === 'divine' ? S.icons[cur] : S.icons.trade && S.icons.trade[cur]);
  return src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(cur)}">` : `<span class="cu">${esc(CUR[cur] || cur || '')}</span>`;
};
const ago = iso => {
  if (!iso) return '';
  const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.round(m)} min`;
  if (m < 1440) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} d`;
};

api.on('item', d => {
  S = { ...d, icons: S.icons || {}, ninja: null, ninjaLoading: !d.error, filters: null, trade: null, exchange: null, useBase: true, ilvl: false,
    excluded: new Set(), opts: { status: d.tradeStatus || 'online', priceCur: '', indexed: '', broad: false } };
  render();
});
api.on('ninja', d => { S.ninjaLoading = false; S.ninja = d.result; S.divine = d.divine; S.ninjaError = d.error; if (d.icons) S.icons = d.icons; render(); });
api.on('filters', d => { S.filters = d.filters; render(); });
api.on('trade', d => {
  if (d.wait) { S.wait = d.wait; render(); return; }
  S.wait = null;
  if (d.loading) S.trade = { loading: true };
  else { S.trade = d; if (d.icons) S.icons = d.icons; S.excluded = new Set(); }
  render();
});
api.on('exchange', d => {
  if (d.loading) S.exchange = { loading: true };
  else { S.exchange = d; if (d.icons) S.icons = d.icons; }
  render();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') api.hide(); });

// ---------- szacunki ----------
function tradeEstimate() {
  const r = S.trade && S.trade.result;
  if (!r || !r.listings.length) return null;
  const vals = r.listings.filter(l => !S.excluded.has(l.id)).map(l => l.chaos).filter(v => v != null).sort((a, b) => a - b).slice(0, 10);
  if (!vals.length) return null;
  const est = vals[Math.floor((vals.length - 1) / 2)];
  const lo = vals[0], hi = vals[vals.length - 1];
  const spread = lo > 0 ? hi / lo : 99;
  return { est, lo, hi, n: vals.length, rel: vals.length >= 8 && spread < 2.5 ? 'wysoka' : vals.length >= 4 && spread < 5 ? 'średnia' : 'niska' };
}
function exchangeUnit() {
  const r = S.exchange && S.exchange.result;
  if (!r || !r.rows.length) return null;
  const vals = r.rows.slice(0, 6).map(x => x.unit).filter(v => v != null).sort((a, b) => a - b);
  return vals.length ? { unit: vals[Math.floor((vals.length - 1) / 2)], have: r.have } : null;
}

function spark(data, change) {
  const v = (data || []).filter(x => x != null);
  if (v.length < 2) return '';
  const min = Math.min(...v), max = Math.max(...v), W = 64, H = 20;
  const pts = v.map((y, i) => `${(i / (v.length - 1) * W).toFixed(1)},${(H - 2 - (max === min ? 0.5 : (y - min) / (max - min)) * (H - 4)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><polyline points="${pts}" fill="none" stroke="${change >= 0 ? '#8fbf6a' : '#d9694f'}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}

function unitPrice() {
  const p = S.ninja && S.ninja.price;
  if (p && p.baseOnly && S.item && S.item.rarity === 'Rare') { const e = tradeEstimate(); if (e) return e.est; }
  if (p && p.chaos != null) return p.chaos;
  const ex = exchangeUnit(); if (ex && ex.have === 'chaos') return ex.unit;
  const e = tradeEstimate(); return e ? e.est : null;
}
const tierBadge = t => t ? `<span class="tier t${Math.min(t, 4)}">T${t}</span>` : '';

// ---------- bloki ----------
function priceBlock() {
  const it = S.item;
  const p = S.ninja && S.ninja.price;
  let unit = p ? p.chaos : null, source = p ? p.source : '';
  // Dla rare cena samej bazy to tylko dolna granica — oferty z trade są ważniejsze.
  if (p && p.baseOnly && it.rarity === 'Rare') { const e0 = tradeEstimate(); if (e0) { unit = e0.est; source = 'szacunek z ofert na trade'; } }
  const ex = exchangeUnit();
  if (unit == null && ex && ex.have === 'chaos') { unit = ex.unit; source = 'wymiana na trade'; }
  if (unit == null) { const e = tradeEstimate(); if (e) { unit = e.est; source = 'szacunek z ofert na trade'; } }
  const total = unit != null ? unit * (it.stack || 1) : null;
  const div = S.divine;
  const loading = S.ninjaLoading || (S.trade && S.trade.loading) || (S.exchange && S.exchange.loading);

  let big;
  if (total == null) big = loading ? '<span class="status">liczę…</span>' : '<span class="nop">—</span>';
  else if (div && total >= div) big = `${fmt(total / div)} ${icon('divine', 'bi')}`;
  else big = `${fmt(total)} ${icon('chaos', 'bi')}`;

  // Kurs jak na wymianie: "10.5 ⇄ 1 c" dla tanich, "1 ⇄ 25 c" dla droższych
  let ratio = '';
  if (unit != null && (it.stack > 1 || it.rarity === 'Currency' || it.rarity === 'Divination Card')) {
    const img = safeImg(p && p.icon);
    const me = img ? `<img class="ci" src="${esc(img)}" alt="">` : '<span class="cu">szt.</span>';
    ratio = unit < 1 ? `<div class="ratio num">${fmt(1 / unit)} ${me} ⇄ 1 ${icon('chaos')}</div>`
      : div && unit >= div ? `<div class="ratio num">1 ${me} ⇄ ${fmt(unit / div)} ${icon('divine')}</div>`
        : `<div class="ratio num">1 ${me} ⇄ ${fmt(unit)} ${icon('chaos')}</div>`;
  }
  let verdict = '';
  if (total != null) verdict = total >= S.threshold ? '<span class="verdict v-sell">SPRZEDAJ</span>' : '<span class="verdict v-vendor">WENDOR</span>';
  else if (!loading) {
    const t = S.trade;
    const why = t && t.error ? 'trade nie odpowiada — spróbuj za chwilę'
      : t && t.result && !t.result.total ? 'brak ofert nawet po poluzowaniu — odznacz mody niżej'
      : ['Rare', 'Magic', 'Normal'].includes(it.rarity) && !t ? 'kliknij „Szukaj” w sekcji Trade'
      : 'poe.ninja nie wycenia tego typu przedmiotów';
    verdict = `<span class="verdict v-unknown">BRAK CENY</span><div class="status">${esc(why)}</div>`;
  }

  const trend = p && p.change != null ? `<div class="trend">${spark(p.spark, p.change)}<span class="num ${p.change >= 0 ? 'up' : 'down'}">${p.change >= 0 ? '+' : ''}${Math.round(p.change)}%</span><span class="lbl">7 dni</span></div>` : '';
  const meta = [];
  if (it.stack > 1 && unit != null) meta.push(`<span class="num">${fmt(unit)} c</span> / szt. × ${it.stack}`);
  if (div && total != null && total >= div) meta.push(`<span class="num">≈ ${fmt(total)} c</span>`);
  if (p && p.listings) meta.push(`<span class="num">${p.listings}</span> ofert`);
  if (source) meta.push(esc(source));
  if (p && p.variant) meta.push('wariant: ' + esc(p.variant));
  if (S.ninjaError) meta.push(`<span class="err">${esc(S.ninjaError)}</span>`);
  return `<div class="price">
    <div class="pl"><div class="big num">${big}</div>${ratio}</div>
    <div class="pr">${verdict}${trend}</div>
    ${meta.length ? `<div class="meta">${meta.map(m => `<span>${m}</span>`).join('')}</div>` : ''}
  </div>`;
}

function mapBlock() {
  const it = S.item;
  const pats = (S.mapDanger || []).map(p => p.toLowerCase());
  const bad = m => pats.some(p => m.text.toLowerCase().includes(p));
  const stat = re => (it.mapStats.find(s => re.test(s.label)) || {}).value || 0;
  const pack = stat(/Pack Size/), quant = Math.max(stat(/Item Quantity/), stat(/Atlas Drops/)), rar = stat(/Item Rarity/);
  const nBad = it.mods.filter(bad).length;
  const goal = S.mapGoal || { pack: 20, quant: 60 };
  const score = Math.max(0, Math.min(100, Math.round(pack / Math.max(1, goal.pack) * 45 + quant / Math.max(1, goal.quant) * 40 + rar / 100 * 15) - nBad * 40));
  let v, cls;
  if (nBad) { v = 'Groźna dla buildu — przerolluj albo odpuść'; cls = 'bad'; }
  else if (it.rarity !== 'Rare' && it.rarity !== 'Unique') { v = 'Nie jest rare — dorób alch i sprawdź ponownie'; cls = 'mid'; }
  else if (pack >= goal.pack && quant >= goal.quant) { v = 'Odpalaj'; cls = 'good'; }
  else { v = `Słaba — rolluj dalej (cel: pack ${goal.pack}%+, quant ${goal.quant}%+)`; cls = 'mid'; }
  const stats = [['Pack', pack], ['Quant', quant], ['Rarity', rar]].map(([k, x]) => `<div><span>${k}</span><b class="num">${x > 0 ? '+' : ''}${x}%</b></div>`).join('');
  return `<section>
    <div class="mapv ${cls}"><b>${esc(v)}</b><span class="num">${score}/100</span></div>
    <div class="mapstats">${stats}</div>
    <div class="mods">${it.mods.map(m => `<div class="${bad(m) ? 'danger' : 'safe'}">${esc(m.text)}</div>`).join('')}</div></section>`;
}

function explainBlock() {
  const ex = S.explained;
  if (!ex || !ex.length) return '';
  const p = S.profile || {};
  const TYPE = { attack: 'ataki', spell: 'czary', minion: 'miniony', dot: 'DoT' };
  const DEF = { life: 'życie', es: 'ES', hybrid: 'życie + ES' };
  const prof = p.type || p.defense ? `pod build: ${[TYPE[p.type], DEF[p.defense]].filter(Boolean).join(', ')}` : 'wczytaj PoB w ustawieniach, żeby oceniać pod build';
  const mark = { good: '<i class="vk good">✓</i>', mid: '<i class="vk mid">·</i>', bad: '<i class="vk bad">✕</i>' };
  return `<section><h3>Co dają mody <span>${esc(prof)}</span></h3>
    ${ex.map((m, i) => `<div class="ex">${mark[m.verdict]}<div><div class="mt">${tierBadge((S.item.mods[i] || {}).tier)}${esc(m.text)}${m.type !== 'explicit' ? ` <span class="ty">${esc(m.type)}</span>` : ''}</div>${m.pl ? `<div class="pl2">${esc(m.pl)}</div>` : ''}</div></div>`).join('')}
  </section>`;
}

function baseBlock() {
  if (!S.goodBase) return '';
  return `<div class="note good"><b>Dobra baza do craftu</b> · ${esc(S.goodBase.join(' · '))}<br><span>Nie sprzedawaj jej za grosze — <a id="baseOnly">sprawdź samą bazę na trade</a>.</span></div>`;
}

function compareBlock() {
  const c = S.compare;
  const gaps = S.gaps || [];
  if (!c && !gaps.length) return '';
  let html = '';
  if (c) {
    const V = { better: ['LEPSZY', 'good'], worse: ['GORSZY', 'bad'], similar: ['PODOBNY', 'mid'] }[c.verdict];
    const chips = c.diffs.map(d => `<span class="chip ${d.v > 0 ? 'up' : 'down'}">${d.v > 0 ? '+' : ''}${fmt(d.v)}${d.unit || ''} ${esc(d.label)}</span>`).join('');
    const res = (c.resAfter || []).map(r => {
      const ok = r.cap == null ? r.after >= 0 : r.after >= r.cap;
      const ch = r.after !== r.before;
      return `<span class="rs ${ch ? (r.after > r.before ? 'up' : 'down') : ''}">${esc(r.label)} <b class="num">${r.before}${ch ? `→${r.after}` : ''}%</b>${r.cap != null ? (ok ? ' ✓' : ` <i>−${r.cap - r.after}</i>`) : ''}</span>`;
    }).join('');
    html += `<div class="cmp-h"><span>Zamiast: <b>${esc(c.old || 'pusty slot')}</b> <span class="muted">(${esc(c.slot)})</span></span><span class="verdict v-${V[1]}">${V[0]}</span></div>
      ${chips ? `<div class="chips">${chips}</div>` : '<div class="status">Brak różnic w głównych statystykach.</div>'}
      ${res ? `<div class="resrow">${res}</div>` : ''}`;
  } else if (gaps.length) {
    html += `<div class="status">Brakuje ci resów: ${gaps.map(g => `<b class="down">${esc(g.label)} ${g.missing}%</b>`).join(', ')}</div>`;
  }
  return `<section><h3>Twój build <span>${esc(S.buildName || '')}</span></h3>${html}</section>`;
}

function listBlock() {
  const it = S.item;
  const u = unitPrice();
  if (u == null || it.isMap && it.rarity !== 'Unique') return '';
  const total = u * (it.stack || 1) * (1 - (S.undercut ?? 5) / 100);
  const div = S.divine;
  let amount, cur;
  if (div && total >= div) { amount = Math.round(total / div * 10) / 10; cur = 'divine'; }
  else if (total >= 10) { amount = Math.round(total); cur = 'chaos'; }
  else if (total >= 1) { amount = Math.round(total * 10) / 10; cur = 'chaos'; }
  else { amount = Math.max(0.01, Math.round(total * 100) / 100); cur = 'chaos'; }
  const note = `~price ${amount} ${cur}`;
  // Notka od razu w schowku (raz na przedmiot) — w grze wystarczy prawy klik i Ctrl+V.
  if (S.autoCopy && S.copiedFor !== S.item.raw && !S.ninjaLoading) { S.copiedFor = S.item.raw; S.autoCopied = true; setTimeout(() => api.copy(note), 300); }
  return `<section class="list"><h3>Wystaw <span>${S.undercut ?? 5}% poniżej rynku${it.stack > 1 ? ', za cały stack' : ''}</span></h3>
    <div class="lrow"><b class="num">${fmt(amount)} ${icon(cur)}</b><code>${esc(note)}</code><button id="copyNote" data-note="${esc(note)}">${S.autoCopied ? 'W schowku ✓' : 'Kopiuj'}</button></div></section>`;
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

function controls() {
  const o = S.opts;
  const sel = (id, val, opts) => `<select id="${id}">${opts.map(([v, t]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  return `<div class="ctrl">
    ${sel('oCur', o.priceCur, [['', 'Ekwiwalent chaos'], ['chaos', 'Tylko chaos'], ['divine', 'Tylko divine'], ['chaos_divine', 'Chaos lub divine']])}
    ${sel('oStatus', o.status, [['securable', 'Instant buyout'], ['online', 'Online'], ['any', 'Wszyscy']])}
    ${sel('oIdx', o.indexed, [['', 'Dowolny czas'], ['1day', 'Do 1 dnia'], ['3days', 'Do 3 dni'], ['1week', 'Do tygodnia'], ['2weeks', 'Do 2 tygodni']])}
  </div>`;
}

function exchangeBlock() {
  const x = S.exchange;
  if (!x) return '';
  if (x.loading) return `<section><h3>Wymiana</h3><div class="status">szukam ofert…</div></section>`;
  if (x.error) return `<section><h3>Wymiana</h3><div class="err">${esc(x.error)}</div></section>`;
  const r = x.result;
  const img = safeImg(S.ninja && S.ninja.price && S.ninja.price.icon);
  const me = img ? `<img class="ci" src="${esc(img)}" alt="">` : 'szt.';
  const rows = r.rows.map(o => `<tr>
      <td class="p num">${o.unit != null && o.unit < 1 ? `${fmt(o.get / o.pay)} ${me} ⇄ 1 ${icon(o.payCur)}` : `${fmt(o.unit)} ${icon(o.payCur)}`}</td>
      <td class="c num">${o.stock ?? ''}</td><td class="acc">${esc(o.account || '')}</td><td class="c">${ago(o.indexed)}</td></tr>`).join('');
  return `<section>
    <h3>Wymiana <span><span class="num">${r.rows.length}/${r.total}</span> · <a data-url="${esc(r.url)}">pathofexile.com/trade</a> · <a id="exgo" title="Szukaj ponownie">↻</a></span></h3>
    <div class="ctrl two"><select id="exHave"><option value="chaos" ${r.have === 'chaos' ? 'selected' : ''}>Płacę: Chaos Orb</option><option value="divine" ${r.have === 'divine' ? 'selected' : ''}>Płacę: Divine Orb</option></select>
      <select id="exStatus"><option value="online">Online</option><option value="any">Wszyscy</option></select></div>
    ${r.rows.length ? `<div class="tbl"><table><tr class="th"><th class="p">Cena</th><th class="c">Stan</th><th>Konto</th><th class="c">Wystawione</th></tr>${rows}</table></div>` : '<div class="status">Brak ofert w tej walucie.</div>'}
  </section>`;
}

function tradeBlock() {
  const t = S.trade;
  const it = S.item;
  const simple = !S.filters && (it.rarity === 'Unique' || it.rarity === 'Gem' || it.isMap || ((it.rarity === 'Currency' || it.rarity === 'Divination Card') && !S.exchange));
  if (S.wait) return `<section><h3>Trade</h3><div class="status">Pilnuję limitu GGG — czekam <span class="num">${S.wait}</span> s…</div></section>`;
  if (!t) return simple ? `<section><h3>Trade <span><a id="go">sprawdź oferty</a></span></h3>${controls()}</section>` : '';
  if (t.loading) return `<section><h3>Trade</h3><div class="status">szukam…</div></section>`;
  if (t.error) return `<section><h3>Trade</h3><div class="err">${esc(t.error)}</div></section>`;
  const r = t.result;
  const e = tradeEstimate();
  const showLvl = it.rarity === 'Gem';
  const est = e ? `<div class="est">
      <div class="k">Szacowana wartość</div>
      <div class="ev num">≈ ${fmt(S.divine && e.est >= S.divine ? e.est / S.divine : e.est)} ${icon(S.divine && e.est >= S.divine ? 'divine' : 'chaos')}</div>
      <div class="er">zakres <span class="num">${fmt(e.lo)}–${fmt(e.hi)} c</span> · wiarygodność <span class="rel-${e.rel === 'wysoka' ? 'hi' : e.rel === 'średnia' ? 'mid' : 'lo'}">${e.rel}</span></div>
    </div>` : '';
  const rows = r.listings.map(l => {
    const off = S.excluded.has(l.id);
    return `<tr class="${off ? 'off' : ''}">
      <td><button class="eye" data-ex="${esc(l.id)}" title="${off ? 'Wlicz do szacunku' : 'Pomiń w szacunku'}">${off ? '◌' : '●'}</button></td>
      <td class="p num">${fmt(l.amount)} × ${icon(l.currency)}</td>
      ${showLvl ? `<td class="c num">${l.level ?? ''}</td><td class="c num">${l.quality ?? 0}%</td>` : ''}
      <td class="acc">${esc(l.account || '')}${l.instant ? '<span class="tag">instant</span>' : ''}</td>
      <td class="c">${ago(l.indexed)}</td></tr>`;
  }).join('');
  return `<section>${est}
    <h3>Trade <span><span class="num">${r.listings.length}/${r.total}</span> · <a data-url="${esc(r.url)}">pathofexile.com/trade</a> · <a id="go" title="Szukaj ponownie">↻</a></span></h3>
    ${r.note ? `<div class="status">${esc(r.note)}</div>` : ''}
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
  if (!it.isMap && (it.rarity === 'Rare' || it.rarity === 'Magic' || it.rarity === 'Normal')) l.push(['Craft of Exile', 'https://www.craftofexile.com/']);
  return l.map(([t, u]) => `<a data-url="${esc(u)}">${t}</a>`).join(' · ');
}

function render() {
  if (S.error) {
    card.innerHTML = `<header><div class="hd"><div class="name">Nakładka PoE</div><div class="sub">${esc(S.error)}</div></div><div class="hb"><button class="x" id="x">×</button></div></header>`;
  } else if (S.item && S.compact) {
    // Kompaktowe okienko: nazwa, cena, werdykt — do szybkiego sortowania lootu.
    const it = S.item;
    const p = S.ninja && S.ninja.price;
    let unit = p ? p.chaos : null;
    if (unit == null) { const ex = exchangeUnit(); if (ex && ex.have === 'chaos') unit = ex.unit; }
    if (unit == null) { const e = tradeEstimate(); if (e) unit = e.est; }
    const total = unit != null ? unit * (it.stack || 1) : null;
    const loading = S.ninjaLoading || (S.trade && S.trade.loading) || (S.exchange && S.exchange.loading);
    const big = total == null ? (loading ? '<span class="status">liczę…</span>' : '<span class="nop">—</span>') : S.divine && total >= S.divine ? `${fmt(total / S.divine)} ${icon('divine', 'bi')}` : `${fmt(total)} ${icon('chaos', 'bi')}`;
    const verdict = total != null ? (total >= S.threshold ? '<span class="verdict v-sell">SPRZEDAJ</span>' : '<span class="verdict v-vendor">WENDOR</span>') : (loading ? '' : '<span class="verdict v-unknown">BRAK CENY</span>');
    const rcls = 'r-' + String(it.rarity).split(' ')[0];
    card.innerHTML = `<div class="compact ${rcls}"><div class="cn"><div class="name">${esc(it.name)}</div>${it.stack > 1 ? `<div class="sub">× ${it.stack}</div>` : ''}</div><div class="big num">${big}</div>${verdict}</div>`;
  } else if (S.item) {
    const it = S.item;
    const rcls = 'r-' + String(it.rarity).split(' ')[0];
    const sub = [it.rarity === 'Unique' || it.rarity === 'Rare' ? it.baseType : null, it.itemClass, it.ilvl ? `ilvl ${it.ilvl}` : null,
      it.gemLevel ? `poziom ${it.gemLevel}` : null, it.quality ? `jakość ${it.quality}%` : null, it.links >= 5 ? `${it.links}L` : null,
      it.mapTier ? `tier ${it.mapTier}` : null, it.stack > 1 ? `stack ${it.stack}` : null, it.corrupted ? 'skorumpowany' : null].filter(Boolean).join(' · ');
    const img = safeImg(S.ninja && S.ninja.price && S.ninja.price.icon);
    const showMode = !it.isMap && it.rarity !== 'Currency' && it.rarity !== 'Divination Card';
    card.innerHTML = `
      <header class="${rcls}">${img ? `<img class="ii" src="${esc(img)}" alt="">` : ''}
        <div class="hd"><div class="name">${esc(it.name)}</div><div class="sub">${esc(sub)}</div></div>
        <div class="hb"><button class="star ${S.watched ? 'on' : ''}" id="star" title="${S.watched ? 'Usuń z obserwowanych' : 'Obserwuj cenę'}">★</button><button class="x" id="x">×</button></div></header>
      ${priceBlock()}
      ${it.dps ? `<div class="dps"><span>DPS <b class="num">${Math.round(it.dps.total)}</b></span><span>fiz. <b class="num">${Math.round(it.dps.pdps)}</b>${it.dps.pdps20 > it.dps.pdps + 1 ? ` <i>(${Math.round(it.dps.pdps20)} z 20% q)</i>` : ''}</span>${it.dps.edps ? `<span>żyw. <b class="num">${Math.round(it.dps.edps)}</b></span>` : ''}${it.dps.cdps ? `<span>chaos <b class="num">${Math.round(it.dps.cdps)}</b></span>` : ''}<span>APS <b class="num">${it.dps.aps}</b></span>${it.dps.crit ? `<span>kryt <b class="num">${it.dps.crit}%</b></span>` : ''}</div>` : ''}
      ${baseBlock()}
      ${showMode ? `<div class="mode"><label><input type="radio" name="mode" value="q" ${S.opts.broad ? '' : 'checked'}> Szybka cena</label><label><input type="radio" name="mode" value="b" ${S.opts.broad ? 'checked' : ''}> Szeroko (−10%)</label></div>` : ''}
      ${it.isMap ? mapBlock() : ''}
      ${compareBlock()}
      ${explainBlock()}
      ${filtersBlock()}
      ${exchangeBlock()}
      ${tradeBlock()}
      ${listBlock()}
      <div class="foot"><span>${links(it)}</span><span>${S.counting ? '<span style="color:var(--gold)">liczenie włączone</span>' : 'Esc — zamknij'}</span></div>`;
  }
  bind();
  requestAnimationFrame(() => api.resize(card.getBoundingClientRect().height + 2));
}

function bind() {
  const x = document.getElementById('x'); if (x) x.onclick = () => api.hide();
  const star = document.getElementById('star'); if (star) star.onclick = async () => { S.watched = await api.watchToggle(); render(); };
  card.querySelectorAll('[data-i]').forEach(cb => cb.onchange = () => { S.filters[+cb.dataset.i].enabled = cb.checked; render(); });
  card.querySelectorAll('[data-min]').forEach(inp => inp.onchange = () => { S.filters[+inp.dataset.min].min = inp.value === '' ? null : Number(inp.value); });
  const ub = document.getElementById('useBase'); if (ub) ub.onchange = () => { S.useBase = ub.checked; };
  const il = document.getElementById('ilvl'); if (il) il.onchange = () => { S.ilvl = il.checked; };
  const run = () => api.search({ filters: S.filters || [], useBase: S.useBase, ilvl: S.ilvl, ...S.opts });
  card.querySelectorAll('#go').forEach(g => g.onclick = run);
  const bindSel = (id, key) => { const el = document.getElementById(id); if (el) el.onchange = () => { S.opts[key] = el.value; if (S.trade && S.trade.result) run(); }; };
  bindSel('oCur', 'priceCur'); bindSel('oStatus', 'status'); bindSel('oIdx', 'indexed');
  card.querySelectorAll('input[name=mode]').forEach(r => r.onchange = () => { S.opts.broad = r.value === 'b'; if ((S.trade && S.trade.result) || S.filters) run(); });
  card.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => { const id = b.dataset.ex; if (S.excluded.has(id)) S.excluded.delete(id); else S.excluded.add(id); render(); });
  const exHave = document.getElementById('exHave'), exSt = document.getElementById('exStatus');
  const runEx = () => api.exchange({ have: exHave.value, status: exSt.value });
  const exgo = document.getElementById('exgo'); if (exgo) exgo.onclick = runEx;
  if (exHave) exHave.onchange = runEx;
  if (exSt) exSt.onchange = runEx;
  card.querySelectorAll('[data-url]').forEach(a => a.onclick = () => api.open(a.dataset.url));
  const cn = document.getElementById('copyNote');
  if (cn) cn.onclick = async () => { await api.copy(cn.dataset.note); cn.textContent = 'Skopiowano'; setTimeout(() => { cn.textContent = 'Kopiuj'; }, 1500); };
  const bo = document.getElementById('baseOnly'); if (bo) bo.onclick = () => api.search({ baseOnly: true, ...S.opts });
}
