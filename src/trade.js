'use strict';
// Wyszukiwanie na oficjalnej stronie trade z kolejką, która pilnuje limitów GGG
// (nagłówki X-Rate-Limit-*). Zamiast blokady użytkownik widzi "czekam N s".

const SITE = 'https://www.pathofexile.com';

const CATEGORY = {
  Helmets: 'armour.helmet', Gloves: 'armour.gloves', Boots: 'armour.boots', 'Body Armours': 'armour.chest',
  Shields: 'armour.shield', Quivers: 'armour.quiver', Belts: 'accessory.belt', Rings: 'accessory.ring',
  Amulets: 'accessory.amulet', Jewels: 'jewel.base', 'Abyss Jewels': 'jewel.abyss',
  'One Hand Swords': 'weapon.onesword', 'Thrusting One Hand Swords': 'weapon.onesword', 'Two Hand Swords': 'weapon.twosword',
  'One Hand Axes': 'weapon.oneaxe', 'Two Hand Axes': 'weapon.twoaxe', 'One Hand Maces': 'weapon.onemace',
  'Two Hand Maces': 'weapon.twomace', Sceptres: 'weapon.sceptre', Daggers: 'weapon.dagger', 'Rune Daggers': 'weapon.runedagger',
  Claws: 'weapon.claw', Bows: 'weapon.bow', Staves: 'weapon.staff', Warstaves: 'weapon.warstaff', Wands: 'weapon.wand',
  'Fishing Rods': 'weapon.rod', Flasks: 'flask', 'Life Flasks': 'flask', 'Mana Flasks': 'flask', 'Utility Flasks': 'flask',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

class RateLimiter {
  constructor(onWait) {
    this.groups = {};
    this.onWait = onWait || (() => {});
  }
  g(name) {
    if (!this.groups[name]) this.groups[name] = { rules: [{ max: 4, period: 10 }], times: [], blockedUntil: 0 };
    return this.groups[name];
  }
  async acquire(name) {
    const g = this.g(name);
    for (;;) {
      const now = Date.now();
      let wait = Math.max(0, g.blockedUntil - now);
      for (const r of g.rules) {
        const inWin = g.times.filter(t => now - t < r.period * 1000);
        const allowed = Math.max(1, r.max - 1); // jeden zapas na inne narzędzia/przeglądarkę
        if (inWin.length >= allowed) {
          const oldest = inWin[inWin.length - allowed];
          wait = Math.max(wait, oldest + r.period * 1000 - now + 50);
        }
      }
      if (wait <= 0) break;
      this.onWait(Math.ceil(wait / 1000));
      await sleep(Math.min(wait, 1000));
    }
    g.times.push(Date.now());
    if (g.times.length > 200) g.times = g.times.slice(-100);
  }
  update(name, headers, status) {
    const g = this.g(name);
    const h = k => headers.get(k);
    const rulesNames = (h('x-rate-limit-rules') || '').split(',').map(s => s.trim()).filter(Boolean);
    const rules = [];
    for (const rn of rulesNames) {
      const def = h(`x-rate-limit-${rn.toLowerCase()}`);
      const state = h(`x-rate-limit-${rn.toLowerCase()}-state`);
      if (!def) continue;
      const defs = def.split(',').map(x => x.split(':').map(Number));
      const states = (state || '').split(',').map(x => x.split(':').map(Number));
      defs.forEach(([max, period], i) => {
        rules.push({ max, period });
        const st = states[i];
        if (st) {
          const [hits, , restricted] = st;
          if (restricted > 0) g.blockedUntil = Math.max(g.blockedUntil, Date.now() + restricted * 1000);
          else if (hits >= max - 1) g.blockedUntil = Math.max(g.blockedUntil, Date.now() + Math.min(period, 15) * 1000);
        }
      });
    }
    if (rules.length) g.rules = rules;
    if (status === 429) {
      const ra = parseInt(h('retry-after') || '60', 10);
      g.blockedUntil = Math.max(g.blockedUntil, Date.now() + ra * 1000);
    }
  }
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

class StatIndex {
  constructor(json) {
    this.entries = [];
    for (const group of (json && json.result) || []) {
      for (const e of group.entries || []) {
        if (!e.text || e.text.includes('\n')) continue;
        const type = e.type || String(e.id).split('.')[0];
        const re = new RegExp('^' + escapeRe(e.text).replace(/#/g, '([+-]?\\d+(?:\\.\\d+)?)') + '$', 'i');
        this.entries.push({ id: e.id, text: e.text, type, re, hashes: (e.text.match(/#/g) || []).length });
      }
    }
  }
  match(mod) {
    const types = [mod.type, 'explicit'];
    const tryLine = (line, negate) => {
      for (const t of types) {
        const cands = this.entries.filter(e => e.type === t);
        for (const e of cands) {
          const m = line.match(e.re);
          if (!m) continue;
          const nums = m.slice(1).map(Number);
          let value = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
          if (value !== null && negate) value = -value;
          return { id: e.id, text: e.text, value };
        }
      }
      return null;
    };
    let r = tryLine(mod.text, false);
    if (!r && /\breduced\b/.test(mod.text)) r = tryLine(mod.text.replace(/\breduced\b/, 'increased'), true);
    if (!r && /\bless\b/.test(mod.text)) r = tryLine(mod.text.replace(/\bless\b/, 'more'), true);
    return r;
  }
}

// Sumy "pseudo" jak na stronie trade.
function pseudoTotals(mods) {
  let ele = 0, chaos = 0, life = 0, str = 0, eleCount = 0;
  for (const m of mods) {
    const t = m.text; const n = m.nums[0] || 0;
    let mm;
    if (/to all Elemental Resistances$/.test(t)) { ele += n * 3; eleCount++; }
    else if ((mm = t.match(/to (Fire|Cold|Lightning) and (Fire|Cold|Lightning) Resistances$/))) { ele += n * 2; eleCount++; }
    else if (/to (Fire|Cold|Lightning) Resistance$/.test(t)) { ele += n; eleCount++; }
    else if (/to (Cold|Fire|Lightning) and Chaos Resistances$/.test(t)) { ele += n; chaos += n; eleCount++; }
    if (/to Chaos Resistance$/.test(t)) chaos += n;
    if (/^\+\d+ to maximum Life$/.test(t)) life += n;
    if (/to Strength$/.test(t) || /to Strength and (Dexterity|Intelligence)$/.test(t) || /to all Attributes$/.test(t)) str += n;
  }
  life += Math.floor(str / 2);
  return { ele, chaos, life, eleCount };
}

class Trade {
  constructor({ request, onWait, getSettings, loadCache, saveCache }) {
    this.request = request;           // (method, url, body) => {status, headers, json}
    this.limiter = new RateLimiter(onWait);
    this.getSettings = getSettings;
    this.loadCache = loadCache; this.saveCache = saveCache;
    this.stats = null;
  }

  async call(group, method, path, body) {
    await this.limiter.acquire(group);
    const res = await this.request(method, SITE + path, body);
    this.limiter.update(group, res.headers, res.status);
    if (res.status === 429) {
      const err = new Error('Strona trade chwilowo blokuje zapytania. Odczekaj chwilę.');
      err.code = 429; throw err;
    }
    if (res.status === 403) throw new Error('Strona trade odrzuciła zapytanie (403). Spróbuj wpisać POESESSID w ustawieniach.');
    if (res.status >= 400) throw new Error(`Błąd strony trade: ${res.status}${res.json && res.json.error ? ' — ' + res.json.error.message : ''}`);
    return res.json;
  }

  async leagues() {
    const j = await this.call('data', 'GET', '/api/trade/data/leagues');
    return (j.result || []).filter(l => !l.realm || l.realm === 'pc').map(l => l.id);
  }

  async statIndex() {
    if (this.stats) return this.stats;
    let json = this.loadCache('stats', 24 * 3600 * 1000);
    if (!json) { json = await this.call('data', 'GET', '/api/trade/data/stats'); this.saveCache('stats', json); }
    this.stats = new StatIndex(json);
    return this.stats;
  }

  // Przygotowuje listę filtrów (do włączania/wyłączania w okienku) dla rare'a.
  async prepareFilters(item) {
    const idx = await this.statIndex();
    const s = this.getSettings();
    const pct = (s.modMinPercent ?? 90) / 100;
    const filters = [];
    const tot = pseudoTotals(item.mods);
    const usePseudoRes = tot.eleCount >= 2;
    for (const mod of item.mods) {
      const isRes = /Resistances?$/.test(mod.text) && !/Chaos Resistance$/.test(mod.text) && /Fire|Cold|Lightning|Elemental/.test(mod.text);
      const isLife = /^\+\d+ to maximum Life$/.test(mod.text);
      const hit = idx.match(mod);
      filters.push({
        label: mod.text + (mod.type !== 'explicit' ? ` (${mod.type})` : ''),
        id: hit ? hit.id : null,
        min: hit && hit.value !== null && hit.value > 0 ? Math.floor(hit.value * pct) : null,
        enabled: !!hit && !(usePseudoRes && isRes) && !isLife,
        matched: !!hit,
      });
    }
    if (usePseudoRes) filters.unshift({ label: `Suma resów żywiołów: ${tot.ele}%`, id: 'pseudo.pseudo_total_elemental_resistance', min: Math.floor(tot.ele * pct), enabled: true, matched: true });
    if (tot.life > 0) filters.unshift({ label: `Suma życia: +${tot.life}`, id: 'pseudo.pseudo_total_life', min: Math.floor(tot.life * pct), enabled: true, matched: true });
    if (tot.chaos > 0 && usePseudoRes) filters.push({ label: `Suma chaos resa: ${tot.chaos}%`, id: 'pseudo.pseudo_total_chaos_resistance', min: Math.floor(tot.chaos * pct), enabled: false, matched: true });
    return filters;
  }

  buildQuery(item, opts) {
    const s = this.getSettings();
    const q = { status: { option: opts.status || s.tradeStatus || 'online' }, stats: [{ type: 'and', filters: [] }], filters: {} };
    const tf = {};
    if (opts.indexed) tf.indexed = { option: opts.indexed };
    if (opts.priceCur) tf.price = { option: opts.priceCur };
    if (Object.keys(tf).length) q.filters.trade_filters = { filters: tf };
    const typeFilters = {};
    const misc = {};
    if (item.rarity === 'Unique') {
      q.name = item.name; q.type = item.baseType;
      typeFilters.rarity = { option: 'unique' };
      if (item.links >= 5) q.filters.socket_filters = { filters: { links: { min: item.links } } };
    } else if (item.rarity === 'Gem') {
      q.type = item.name;
      if (item.gemLevel) misc.gem_level = { min: item.gemLevel };
      if (item.quality && !opts.broad) misc.quality = { min: item.quality };
      misc.corrupted = { option: item.corrupted ? 'true' : 'false' };
    } else if (['Currency', 'Divination Card'].includes(item.rarity) || item.isMap) {
      q.type = item.isMap ? item.baseType : item.name;
      if (item.isMap && item.mapTier) q.filters.map_filters = { filters: { map_tier: { min: item.mapTier, max: item.mapTier } } };
    } else {
      if (opts.useBase && item.baseType) q.type = item.baseType;
      const cat = CATEGORY[item.itemClass];
      if (cat) typeFilters.category = { option: cat };
      typeFilters.rarity = { option: 'nonunique' };
      for (const f of opts.filters || []) {
        if (!f.enabled || !f.id) continue;
        const flt = { id: f.id, disabled: false };
        if (f.min !== null && f.min !== undefined && f.min !== '') flt.value = { min: opts.broad ? Math.floor(Number(f.min) * 0.9) : Number(f.min) };
        q.stats[0].filters.push(flt);
      }
      if (opts.ilvl && item.ilvl) misc.ilvl = { min: item.ilvl };
      if (item.corrupted) misc.corrupted = { option: 'true' };
    }
    if (Object.keys(typeFilters).length) q.filters.type_filters = { filters: typeFilters };
    if (Object.keys(misc).length) q.filters.misc_filters = { filters: misc };
    return { query: q, sort: { price: 'asc' } };
  }

  async search(item, opts, rates) {
    const s = this.getSettings();
    const league = encodeURIComponent(s.league);
    const body = this.buildQuery(item, opts);
    const res = await this.call('search', 'POST', `/api/trade/search/${league}`, body);
    const ids = (res.result || []).slice(0, opts.count || 20);
    const url = `${SITE}/trade/search/${league}/${res.id}`;
    if (!ids.length) return { total: res.total || 0, listings: [], url };
    const listings = [];
    for (let i = 0; i < ids.length; i += 10) {
      const f = await this.call('fetch', 'GET', `/api/trade/fetch/${ids.slice(i, i + 10).join(',')}?query=${res.id}`);
      for (const r of (f.result || []).filter(Boolean)) {
        const p = (r.listing && r.listing.price) || {};
        const rate = rates[p.currency];
        const prop = name => {
          const pr = ((r.item && r.item.properties) || []).find(x => x.name === name);
          return pr && pr.values && pr.values[0] ? parseInt(String(pr.values[0][0]).replace(/[^\d]/g, ''), 10) : null;
        };
        listings.push({
          id: r.id, amount: p.amount, currency: p.currency, chaos: rate && p.amount ? p.amount * rate : null,
          account: r.listing && r.listing.account && r.listing.account.name,
          indexed: r.listing && r.listing.indexed, instant: !(r.listing && r.listing.whisper),
          level: prop('Level'), quality: prop('Quality'), ilvl: r.item && r.item.ilvl,
        });
      }
    }
    return { total: res.total || 0, listings, url };
  }
}

module.exports = { Trade, RateLimiter, StatIndex, pseudoTotals, CATEGORY };
