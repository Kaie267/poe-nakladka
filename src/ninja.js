'use strict';
// Ceny z poe.ninja (oficjalnie wspierane endpointy /poe1/api/economy/...).
// Każda kategoria jest pobierana dopiero przy pierwszej potrzebie i trzymana 15 minut,
// bo poe.ninja i tak odświeża dane PoE1 mniej więcej co 15 minut.

const BASE = 'https://poe.ninja/poe1/api/economy';
const TTL = 15 * 60 * 1000;

const EXCHANGE_TYPES = ['Currency', 'Fragment', 'Scarab', 'DivinationCard', 'Essence', 'Fossil', 'Resonator', 'Oil',
  'DeliriumOrb', 'Omen', 'Tattoo', 'Runegraft', 'AllflameEmber', 'Artifact', 'Astrolabe', 'DjinnCoin'];

const UNIQUE_BY_CLASS = {
  Rings: 'UniqueAccessory', Amulets: 'UniqueAccessory', Belts: 'UniqueAccessory',
  Jewels: 'UniqueJewel', 'Abyss Jewels': 'UniqueJewel', Flasks: 'UniqueFlask', 'Life Flasks': 'UniqueFlask',
  'Mana Flasks': 'UniqueFlask', 'Hybrid Flasks': 'UniqueFlask', 'Utility Flasks': 'UniqueFlask',
  Maps: 'UniqueMap', Tinctures: 'UniqueTincture', Relics: 'UniqueRelic',
  'Body Armours': 'UniqueArmour', Helmets: 'UniqueArmour', Gloves: 'UniqueArmour', Boots: 'UniqueArmour',
  Shields: 'UniqueArmour', Quivers: 'UniqueArmour',
};
const ALL_UNIQUE = ['UniqueWeapon', 'UniqueArmour', 'UniqueAccessory', 'UniqueFlask', 'UniqueJewel', 'UniqueMap', 'UniqueTincture', 'UniqueRelic', 'ForbiddenJewel', 'ShrineBelt'];

function totalChange(spark) {
  if (!spark) return null;
  if (typeof spark.totalChange === 'number') return spark.totalChange;
  return null;
}

function norm(s) { return String(s || '').toLowerCase().replace(/[’']/g, "'").trim(); }

class Ninja {
  constructor(fetchJson) {
    this.fetchJson = fetchJson; // (url) => Promise<json>
    this.cache = new Map();     // key -> {at, lines}
    this.league = null;
    this.ninjaLeague = null;
  }

  setLeague(league) {
    if (league !== this.league) { this.league = league; this.ninjaLeague = null; this.cache.clear(); }
  }

  async resolveLeague() {
    if (this.ninjaLeague) return this.ninjaLeague;
    try {
      const list = await this.fetchJson(`${BASE}/leagues`);
      const arr = Array.isArray(list) ? list : (list && list.leagues) || [];
      const hit = arr.find(l => norm(l.name) === norm(this.league) || norm(l.id) === norm(this.league));
      this.ninjaLeague = hit ? hit.id : (this.league || (arr[0] && arr[0].id));
    } catch { this.ninjaLeague = this.league; }
    return this.ninjaLeague;
  }

  async load(kind, type) {
    const key = `${kind}:${type}`;
    const c = this.cache.get(key);
    if (c && Date.now() - c.at < TTL) return c.lines;
    const league = encodeURIComponent(await this.resolveLeague());
    let lines = [];
    try {
      if (kind === 'currency') {
        const j = await this.fetchJson(`${BASE}/stash/current/currency/overview?league=${league}&type=${type}`);
        if (type === 'Currency') {
          // Mapa identyfikatorów ze strony trade ("divine", "exalted"...) na wartość w chaos.
          const byDetails = new Map((j.lines || []).map(l => [l.detailsId, l.chaosEquivalent]));
          const rates = { chaos: 1 };
          for (const d of j.currencyDetails || []) {
            const slug = String(d.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            const v = (j.lines || []).find(l => l.currencyTypeName === d.name);
            if (d.tradeId && v) rates[d.tradeId] = v.chaosEquivalent;
            else if (d.tradeId && byDetails.has(slug)) rates[d.tradeId] = byDetails.get(slug);
          }
          this.tradeRates = rates;
          this.icons = {};
          this.tradeIcons = {};
          for (const d of j.currencyDetails || []) {
            if (!d.icon || !/^https:\/\/web\.poecdn\.com\//.test(d.icon)) continue;
            this.icons[d.name] = d.icon;
            if (d.tradeId) this.tradeIcons[d.tradeId] = d.icon;
          }
        }
        const det = new Map((j.currencyDetails || []).map(d => [d.name, d]));
        lines = (j.lines || []).map(l => ({
          name: l.currencyTypeName, chaos: l.chaosEquivalent, change: totalChange(l.receiveSparkLine) ?? totalChange(l.paySparkLine),
          spark: (l.receiveSparkLine && l.receiveSparkLine.data && l.receiveSparkLine.data.some(v => v != null) ? l.receiveSparkLine : l.lowConfidenceReceiveSparkLine || {}).data || null,
          icon: (det.get(l.currencyTypeName) || {}).icon || null, tradeId: (det.get(l.currencyTypeName) || {}).tradeId || null,
          listings: (l.receive && l.receive.listing_count) || null, source: 'poe.ninja', category: type,
        }));
      } else if (kind === 'exchange') {
        const j = await this.fetchJson(`${BASE}/exchange/current/overview?league=${league}&type=${type}`);
        lines = this.parseExchange(j, type);
      } else {
        const j = await this.fetchJson(`${BASE}/stash/current/item/overview?league=${league}&type=${type}`);
        lines = (j.lines || []).map(l => ({
          name: l.name, baseType: l.baseType, chaos: l.chaosValue, divine: l.divineValue, variant: l.variant || null,
          links: l.links || 0, corrupted: !!l.corrupted, gemLevel: l.gemLevel ?? null, gemQuality: l.gemQuality ?? null,
          mapTier: l.mapTier ?? null, listings: l.listingCount ?? l.count ?? null, change: totalChange(l.sparkLine || l.lowConfidenceSparkLine),
          spark: ((l.sparkLine && l.sparkLine.data && l.sparkLine.data.length ? l.sparkLine : l.lowConfidenceSparkLine) || {}).data || null, icon: l.icon || null,
          source: 'poe.ninja', category: type,
        }));
      }
    } catch (e) {
      // Zapisz pusty wynik na krótko, żeby nie zasypywać poe.ninja przy błędach.
      this.cache.set(key, { at: Date.now() - TTL + 60 * 1000, lines: [] });
      throw e;
    }
    this.cache.set(key, { at: Date.now(), lines });
    return lines;
  }

  parseExchange(j, type) {
    const core = j.core || {};
    const list = it => (Array.isArray(it) ? it : Object.entries(it || {}).map(([id, v]) => ({ id, ...v })));
    // Nazwy linii są w j.items (core.items zawiera tylko waluty odniesienia).
    const meta = new Map([...list(core.items), ...list(j.items)].map(it => [it.id, it]));
    const rates = core.rates || {};
    let chaosPerPrimary = 1;
    if (core.primary && core.primary !== 'chaos') {
      const r = rates.chaos;
      if (typeof r === 'number' && r > 0) chaosPerPrimary = r >= 1 ? r : 1 / r;
    }
    return (j.lines || []).map(l => {
      const m = meta.get(l.id) || {};
      const img = m.image || m.icon || null;
      return {
        name: m.name || m.text || l.name || l.id,
        chaos: typeof l.primaryValue === 'number' ? l.primaryValue * chaosPerPrimary : null,
        change: totalChange(l.sparkline || l.sparkLine), spark: ((l.sparkline || l.sparkLine || {}).data) || null,
        icon: img ? (/^https?:/.test(img) ? img : 'https://poe.ninja' + img) : null,
        tradeId: l.id, listings: null, source: 'poe.ninja', category: type,
      };
    });
  }

  async divinePrice() {
    try {
      const lines = await this.load('currency', 'Currency');
      const d = lines.find(l => l.name === 'Divine Orb');
      return d ? d.chaos : null;
    } catch { return null; }
  }

  // Kursy walut według identyfikatorów strony trade (do przeliczania ofert na chaos).
  async getTradeRates() {
    try { await this.load('currency', 'Currency'); } catch { /* bez kursów pokażemy surowe ceny */ }
    return this.tradeRates || { chaos: 1 };
  }

  async getIcons() {
    try { await this.load('currency', 'Currency'); } catch { /* */ }
    const i = this.icons || {};
    return { chaos: i['Chaos Orb'] || null, divine: i['Divine Orb'] || null, trade: this.tradeIcons || {} };
  }

  async findIn(list, pred) {
    for (const [kind, type] of list) {
      let lines;
      try { lines = await this.load(kind, type); } catch { continue; }
      const hits = lines.filter(pred);
      if (hits.length) return hits;
    }
    return [];
  }

  // Zwraca {price, matches, note} albo null, gdy poe.ninja nie wycenia tego typu przedmiotu.
  async priceItem(item) {
    const r = item.rarity;
    const cls = item.itemClass || '';
    const byName = name => l => norm(l.name) === norm(name);

    if (r === 'Currency' || /Currency|Fragment|Scarab|Essence|Fossil|Resonator|Oil|Omen|Tattoo|Incubator|Delirium|Map Fragments|Misc Map Items|Atlas Upgrade/.test(cls)) {
      const list = [['currency', 'Currency'], ['currency', 'Fragment'], ...EXCHANGE_TYPES.map(t => ['exchange', t]), ['item', 'Incubator'], ['item', 'Vial'], ['item', 'Wombgift']];
      const hits = await this.findIn(list, byName(item.name));
      return hits.length ? { price: hits[0], matches: hits } : null;
    }
    if (r === 'Divination Card') {
      const hits = await this.findIn([['exchange', 'DivinationCard']], byName(item.name));
      return hits.length ? { price: hits[0], matches: hits } : null;
    }
    if (r === 'Gem') {
      const hits = await this.findIn([['item', 'SkillGem'], ['item', 'ImbuedGem']], byName(item.name));
      if (!hits.length) return null;
      return { price: pickGem(hits, item), matches: hits };
    }
    if (r === 'Unique') {
      const first = UNIQUE_BY_CLASS[cls];
      const types = first ? [first, ...ALL_UNIQUE.filter(t => t !== first)] : ALL_UNIQUE;
      const hits = await this.findIn(types.map(t => ['item', t]), byName(item.name));
      if (!hits.length) return null;
      return { price: pickUnique(hits, item), matches: hits };
    }
    if (item.isMap) {
      const lists = [['item', 'Map'], ['item', 'BlightedMap'], ['item', 'BlightRavagedMap']];
      const target = item.rarity === 'Magic' ? item.name : item.baseType;
      let hits = await this.findIn(lists, byName(target));
      if (!hits.length) hits = await this.findIn(lists, l => norm(target).includes(norm(l.name)));
      if (!hits.length) return null;
      const tierHit = hits.find(h => h.mapTier === item.mapTier) || hits[0];
      return { price: tierHit, matches: hits };
    }
    return null;
  }
}

function pickGem(hits, item) {
  const scored = hits.map(h => {
    let lvl = h.gemLevel, q = h.gemQuality, corr = h.corrupted;
    if ((lvl == null || q == null) && h.variant) {
      const m = String(h.variant).match(/^(\d+)(?:\/(\d+))?(c)?/);
      if (m) { lvl = +m[1]; q = m[2] ? +m[2] : 0; corr = !!m[3] || corr; }
    }
    let score = 0;
    score += Math.abs((lvl ?? 1) - (item.gemLevel ?? 1)) * 10;
    score += Math.abs((q ?? 0) - (item.quality ?? 0)) / 2;
    if (!!corr !== !!item.corrupted) score += 5;
    return { h, score };
  }).sort((a, b) => a.score - b.score);
  return scored[0].h;
}

function pickUnique(hits, item) {
  const links = item.links >= 5 ? item.links : 0;
  const same = hits.filter(h => (h.links || 0) === links);
  const pool = same.length ? same : hits;
  // Bez informacji o wariancie bierzemy najtańszy — bezpieczniej przy decyzji sprzedaj/wendor.
  return pool.slice().sort((a, b) => (a.chaos ?? 0) - (b.chaos ?? 0))[0];
}

module.exports = { Ninja, pickGem, pickUnique };
