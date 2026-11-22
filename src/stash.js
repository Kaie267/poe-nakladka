'use strict';
// Wartość przedmiotów wystawionych na sprzedaż (zakładki Merchant i publiczne).
// Korzysta wyłącznie z wyszukiwarki trade (filtr po nazwie konta), tak jak strona pathofexile.com/trade.

const FRAME = { 0: 'Normal', 1: 'Magic', 2: 'Rare', 3: 'Unique', 4: 'Gem', 5: 'Currency', 6: 'Divination Card' };

function category(rarity, typeLine) {
  const t = String(typeLine || '');
  if (/ Map$/.test(t) || /^Map /.test(t)) return 'Mapy';
  if (rarity === 'Divination Card') return 'Karty';
  if (rarity === 'Unique') return 'Unikaty';
  if (rarity === 'Gem') return 'Gemy';
  if (rarity === 'Currency') {
    if (/Scarab/.test(t)) return 'Scaraby';
    if (/Thread/.test(t)) return 'Threads';
    if (/Essence/.test(t)) return 'Esencje';
    if (/Fossil|Resonator/.test(t)) return 'Fossile';
    if (/ Oil$/.test(t)) return 'Oleje';
    if (/Splinter|Fragment|Emblem|Breachstone|Invitation|Key|Crest|Sacrifice|Mortal/.test(t)) return 'Fragmenty';
    if (/Delirium Orb|Simulacrum/.test(t)) return 'Delirium';
    return 'Waluta';
  }
  return 'Ekwipunek';
}

async function scanListed({ trade, ninja, account, league, onProgress }) {
  const body = {
    query: { status: { option: 'any' }, filters: { trade_filters: { filters: { account: { input: account } } } } },
    sort: { price: 'desc' },
  };
  const res = await trade.call('search', 'POST', `/api/trade/search/${encodeURIComponent(league)}`, body);
  const ids = (res.result || []).slice(0, 100);
  const rates = await ninja.getTradeRates();
  const items = [];
  for (let i = 0; i < ids.length; i += 10) {
    onProgress && onProgress({ done: i, total: ids.length });
    const f = await trade.call('fetch', 'GET', `/api/trade/fetch/${ids.slice(i, i + 10).join(',')}?query=${res.id}`);
    for (const r of f.result || []) {
      if (!r || !r.item || !r.listing) continue;
      const it = r.item, st = r.listing.stash || {};
      const p = r.listing.price || {};
      const rarity = FRAME[it.frameType] || 'Rare';
      const listedChaos = p.amount && rates[p.currency] ? p.amount * rates[p.currency] : null;
      const entry = {
        tab: st.name || '(bez nazwy)', x: st.x ?? it.x ?? 0, y: st.y ?? it.y ?? 0, w: it.w || 1, h: it.h || 1,
        name: it.name || it.typeLine, baseType: it.baseType || it.typeLine, rarity, category: category(rarity, it.typeLine),
        links: Math.max(0, ...((it.sockets || []).reduce((a, sk) => { a[sk.group] = (a[sk.group] || 0) + 1; return a; }, []).filter(Boolean))), stack: it.stackSize || 1, icon: it.icon,
        price: p.amount ? { amount: p.amount, currency: p.currency } : null, listedChaos,
        marketChaos: null,
      };
      // Cena rynkowa z poe.ninja dla walut, kart i unikatów.
      if (['Currency', 'Divination Card', 'Unique'].includes(rarity)) {
        try {
          const pr = await ninja.priceItem({ rarity, name: rarity === 'Unique' ? it.name : it.typeLine, baseType: it.baseType, itemClass: '', links: 0, isMap: false });
          if (pr && pr.price && pr.price.chaos != null) entry.marketChaos = pr.price.chaos * entry.stack;
        } catch { /* bez ceny rynkowej */ }
      }
      entry.value = entry.marketChaos ?? entry.listedChaos ?? 0;
      // Ostrzeżenie: wystawione wyraźnie taniej niż rynek.
      entry.cheap = entry.marketChaos != null && entry.listedChaos != null && entry.listedChaos < entry.marketChaos * 0.75;
      items.push(entry);
    }
  }
  onProgress && onProgress({ done: ids.length, total: ids.length });
  const tabs = {};
  for (const it of items) {
    const t = tabs[it.tab] || (tabs[it.tab] = { name: it.tab, value: 0, listed: 0, count: 0, quad: false });
    t.value += it.value; t.listed += it.listedChaos || 0; t.count++;
    if (it.x + it.w > 12 || it.y + it.h > 12) t.quad = true;
  }
  return {
    at: Date.now(), total: res.total || items.length, scanned: items.length, items,
    tabs: Object.values(tabs).sort((a, b) => b.value - a.value),
    value: items.reduce((a, i) => a + i.value, 0), listed: items.reduce((a, i) => a + (i.listedChaos || 0), 0),
  };
}

function snapshotOf(data, hidden) {
  const hide = new Set(hidden || []);
  const items = data.items.filter(i => !hide.has(i.name));
  const cats = {};
  for (const i of items) cats[i.category || 'Ekwipunek'] = (cats[i.category || 'Ekwipunek'] || 0) + i.value;
  return { at: data.at, value: items.reduce((a, i) => a + i.value, 0), listed: items.reduce((a, i) => a + (i.listedChaos || 0), 0), count: items.length, cats };
}

module.exports = { scanListed, snapshotOf, category };
