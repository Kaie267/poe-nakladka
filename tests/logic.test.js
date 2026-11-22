const assert = require('assert');
const { parseItem } = require('../src/parser');
const { Ninja } = require('../src/ninja');
const { Trade, StatIndex, RateLimiter, pseudoTotals } = require('../src/trade');
const { parseLine } = require('../src/logwatch');
const S = require('./samples');

(async () => {
  // ---- poe.ninja (atrapa odpowiedzi w formacie z dokumentacji) ----
  const urls = [];
  const fake = async url => {
    urls.push(url);
    if (url.endsWith('/leagues')) return [{ id: 'Umbra', name: 'Covens of Umbra' }, { id: 'Standard', name: 'Standard' }];
    if (url.includes('currency/overview') && url.includes('type=Currency')) return {
      lines: [{ currencyTypeName: 'Divine Orb', chaosEquivalent: 150, detailsId: 'divine-orb', receiveSparkLine: { totalChange: 4.2 } },
              { currencyTypeName: 'Orb of Alchemy', chaosEquivalent: 0.25, detailsId: 'orb-of-alchemy' }],
      currencyDetails: [{ id: 1, name: 'Divine Orb', tradeId: 'divine' }, { id: 2, name: 'Orb of Alchemy', tradeId: 'alch' }],
    };
    if (url.includes('currency/overview')) return { lines: [] };
    if (url.includes('exchange') && url.includes('type=DivinationCard')) return {
      core: { primary: 'divine', rates: { chaos: 150 }, items: [{ id: 'the-doctor', name: 'The Doctor' }] },
      lines: [{ id: 'the-doctor', primaryValue: 2.5, sparkline: { totalChange: -3 } }],
    };
    if (url.includes('exchange')) return { core: {}, lines: [] };
    if (url.includes('type=SkillGem')) return { lines: [
      { name: 'Arc', chaosValue: 1, variant: '20/20', corrupted: false },
      { name: 'Arc', chaosValue: 9, variant: '21/20c', corrupted: true },
    ] };
    if (url.includes('type=UniqueArmour')) return { lines: [
      { name: 'Tabula Rasa', baseType: 'Simple Robe', chaosValue: 12, links: 6, variant: null },
    ] };
    return { lines: [] };
  };
  const n = new Ninja(fake);
  n.setLeague('Covens of Umbra');
  const doc = await n.priceItem(parseItem(S.divcard));
  assert.equal(doc.price.chaos, 375);
  assert.ok(urls.some(u => u.includes('league=Umbra')), 'używa id ligi z poe.ninja');
  const gem = await n.priceItem(parseItem(S.gem));
  assert.equal(gem.price.chaos, 9);
  const tab = await n.priceItem(parseItem(S.unique));
  assert.equal(tab.price.chaos, 12);
  assert.equal(await n.divinePrice(), 150);
  const rates = await n.getTradeRates();
  assert.equal(rates.divine, 150); assert.equal(rates.alch, 0.25);
  assert.equal(await n.priceItem(parseItem(S.ring)), null);

  // ---- dopasowanie modów do statystyk trade ----
  const stats = { result: [
    { label: 'Explicit', entries: [
      { id: 'explicit.stat_life', text: '+# to maximum Life', type: 'explicit' },
      { id: 'explicit.stat_fire', text: '+#% to Fire Resistance', type: 'explicit' },
      { id: 'explicit.stat_cold', text: '+#% to Cold Resistance', type: 'explicit' },
      { id: 'explicit.stat_addphys', text: 'Adds # to # Physical Damage to Attacks', type: 'explicit' },
      { id: 'explicit.stat_ms', text: '#% increased Movement Speed', type: 'explicit' },
    ] },
    { label: 'Implicit', entries: [{ id: 'implicit.stat_chaos', text: '+#% to Chaos Resistance', type: 'implicit' }] },
  ] };
  const idx = new StatIndex(stats);
  const ring = parseItem(S.ring);
  assert.equal(idx.match(ring.mods[0]).id, 'implicit.stat_chaos');
  assert.equal(idx.match(ring.mods[4]).value, 5);
  assert.equal(idx.match({ text: '10% reduced Movement Speed', type: 'explicit', nums: [10] }).value, -10);
  const tot = pseudoTotals(ring.mods);
  assert.equal(tot.ele, 59); assert.equal(tot.life, 52);

  const settings = { league: 'Covens of Umbra', tradeStatus: 'online', modMinPercent: 90 };
  const t = new Trade({ request: null, getSettings: () => settings, loadCache: () => stats, saveCache: () => {} });
  const filters = await t.prepareFilters(ring);
  const life = filters.find(f => f.id === 'pseudo.pseudo_total_life');
  assert.equal(life.min, 46);
  assert.ok(filters.find(f => f.id === 'pseudo.pseudo_total_elemental_resistance').enabled);
  assert.ok(!filters.find(f => f.id === 'explicit.stat_fire').enabled, 'pojedyncze resy wyłączone, gdy jest suma');
  const q = t.buildQuery(ring, { filters, useBase: true });
  assert.equal(q.query.type, 'Amethyst Ring');
  assert.equal(q.query.filters.type_filters.filters.category.option, 'accessory.ring');
  assert.ok(q.query.stats[0].filters.length >= 3);
  const qu = t.buildQuery(parseItem(S.unique), {});
  assert.equal(qu.query.name, 'Tabula Rasa'); assert.equal(qu.query.filters.socket_filters.filters.links.min, 6);

  // ---- wyszukiwanie z atrapą strony trade ----
  const hdr = obj => ({ get: k => obj[k.toLowerCase()] ?? null });
  const t2 = new Trade({
    getSettings: () => settings, loadCache: () => stats, saveCache: () => {},
    request: async (method, url) => {
      const h = hdr({ 'x-rate-limit-rules': 'Ip', 'x-rate-limit-ip': '8:10:60,15:60:120', 'x-rate-limit-ip-state': '1:10:0,1:60:0' });
      if (method === 'POST') return { status: 200, headers: h, json: { id: 'abc', total: 2, result: ['h1', 'h2'] } };
      assert.ok(url.includes('/api/trade/fetch/h1,h2?query=abc'));
      return { status: 200, headers: h, json: { result: [
        { listing: { price: { amount: 1, currency: 'divine' }, account: { name: 'A' } } },
        { listing: { price: { amount: 40, currency: 'chaos' }, account: { name: 'B' }, whisper: '@B hi' } },
      ] } };
    },
  });
  const sr = await t2.search(ring, { filters, useBase: true }, { chaos: 1, divine: 150 });
  assert.equal(sr.listings[0].chaos, 150); assert.equal(sr.listings[0].instant, true); assert.equal(sr.listings[1].instant, false);
  assert.ok(sr.url.endsWith('/trade/search/Covens%20of%20Umbra/abc'));

  // ---- limiter ----
  const rl = new RateLimiter();
  rl.update('search', hdr({ 'x-rate-limit-rules': 'Ip', 'x-rate-limit-ip': '5:10:60', 'x-rate-limit-ip-state': '1:10:30' }), 200);
  assert.ok(rl.g('search').blockedUntil > Date.now() + 25000, 'respektuje karę z nagłówka');
  rl.update('fetch', hdr({ 'retry-after': '20' }), 429);
  assert.ok(rl.g('fetch').blockedUntil > Date.now() + 15000);

  // ---- Client.txt ----
  const e = parseLine('2026/11/22 14:00:00 12345 cff945b9 [INFO Client 1234] @From <GLD> Buyer_One: Hi, I would like to buy your Tabula Rasa listed for 12 chaos in Covens of Umbra (stash tab "sprzedaz"; position: left 3, top 5)');
  assert.equal(e.kind, 'from'); assert.equal(e.name, 'Buyer_One');
  assert.equal(e.trade.item, 'Tabula Rasa'); assert.equal(e.trade.amount, '12'); assert.equal(e.trade.currency, 'chaos'); assert.equal(e.trade.left, 3);
  const b = parseLine("2026/11/22 14:00:00 1 2 [INFO Client 1] @From Bulk: Hi, I'd like to buy your 10 Divine Orb for my 1500 Chaos Orb in Covens of Umbra.");
  assert.equal(b.trade.amount, '1500');
  assert.equal(parseLine('2026/11/22 14:00:00 1 2 [INFO Client 1] : Buyer_One has joined the area.').kind, 'joined');
  console.log('logic: OK');
})().catch(e => { console.error(e); process.exit(1); });
