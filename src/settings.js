'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  league: '',                 // pusta = pierwsza liga ligowa z listy GGG (aktualna challenge liga)
  vendorThreshold: 5,         // chaos: poniżej = wendor
  tradeStatus: 'online',      // online | securable (tylko instant buyout) | any
  modMinPercent: 90,          // minimalna wartość modu w wyszukiwaniu = 90% wartości z przedmiotu
  autoTradeRares: true,
  restoreClipboard: true,
  clientLog: '',
  poesessid: '',
  hotkeys: {
    priceCheck: 'Ctrl+D',
    priceCheckAdvanced: 'Ctrl+Alt+D',
    market: 'Ctrl+Shift+F',
    wiki: 'Ctrl+Alt+W',
    settings: 'Ctrl+Shift+O',
    guide: 'Ctrl+Shift+L',
    guideNext: 'Ctrl+Alt+Right',
    guidePrev: 'Ctrl+Alt+Left',
    leveling: '',
    stash: 'Ctrl+Shift+S',
    counting: 'Ctrl+Shift+K',
    sheets: 'Ctrl+Shift+N',
    app: 'F9',
    lab: 'Ctrl+Shift+J',
  },
  account: '',
  guideStep: 0,
  guideClass: 'Witch',
  guideLeagueStart: true,
  guideVisible: false,
  buildName: '',
  buildGems: [],
  buildProfile: { type: '', defense: '', element: '' },
  buildItems: {},            // noszone przedmioty z PoB (slot -> {name, base, mods})
  buildRes: null,            // odporności postaci z PoB
  listUndercut: 5,
  liveSearches: [],          // [{id, name, url, on}]
  labAuto: true,
  uiScale: 1,
  uiOpacity: 1,
  regexAvoid: [],
  profiles: [],              // profile postaci: [{name, data}]
  activeProfile: '',           // o ile % taniej niż rynek podpowiadać cenę wystawienia
  explainMods: true,
  autoExchange: true,
  watch: [],                 // obserwowane: [{name, rarity, baseType, itemClass}]
  mapGoal: { pack: 20, quant: 60 },
  stashRect: null,
  stashHidden: [],
  stashProfiles: [],         // [{id, name, tabs: [], cats: []}] — puste listy = wszystko
  stashProfile: '',           // nazwy przedmiotów pomijanych w sumach
  stashAuto: 30,             // co ile minut odświeżać wartość stasha (0 = ręcznie)            // {x, y, w, h} — ramka siatki stasha na ekranie
  hudVisible: true,
  buyerSound: true,
  commands: [
    { key: 'F5', text: '/hideout' },
    { key: 'F6', text: '/kingsmarch' },
  ],
  thanksMessage: 'ty, gl!',
  busyMessage: 'sec, w mapie',
  mapDanger: [
    'reflect',
    'cannot Regenerate',
    'less Recovery Rate',
    'maximum Player Resistances',
    'Players are Cursed',
    'cannot Leech',
    'chance to Avoid Elemental Ailments',
    'reduced Effect of Curses',
  ],
};

class Settings {
  constructor(dir) {
    this.file = path.join(dir, 'ustawienia.json');
    this.cacheDir = path.join(dir, 'cache');
    fs.mkdirSync(this.cacheDir, { recursive: true });
    this.data = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = { ...this.data, ...saved, hotkeys: { ...DEFAULTS.hotkeys, ...(saved.hotkeys || {}) } };
    } catch { /* pierwszy start */ }
    // Migracja 2.4: Ctrl+Shift+L otwiera teraz interaktywny poradnik (wcześniej stronę poe-leveling).
    // Migracja 2.4.1: Ctrl+Shift+L zawsze otwiera interaktywny poradnik; strona poe-leveling tylko z linku w poradniku.
    if (!this.data.migr241) {
      const h = this.data.hotkeys;
      for (const k of Object.keys(h)) if (k !== 'guide' && h[k] === 'Ctrl+Shift+L') h[k] = '';
      h.guide = 'Ctrl+Shift+L';
      if (h.leveling === 'Ctrl+Shift+G') h.leveling = '';
      this.data.migr24 = true; this.data.migr241 = true;
      try { fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2)); } catch { /* */ }
    }
    if (!this.data.migr24) {
      const h = this.data.hotkeys;
      if (h.leveling === 'Ctrl+Shift+L' && h.guide === 'Ctrl+Shift+G') { h.guide = 'Ctrl+Shift+L'; h.leveling = 'Ctrl+Shift+G'; }
      this.data.migr24 = true;
      try { fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2)); } catch { /* */ }
    }
  }
  get() { return this.data; }
  // Zapis bez przeładowania skrótów (np. postęp poradnika).
  quiet(patch) { this.data = { ...this.data, ...patch }; try { fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2)); } catch { /* */ } return this.data; }
  set(patch) {
    this.data = { ...this.data, ...patch, hotkeys: { ...this.data.hotkeys, ...(patch.hotkeys || {}) } };
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    return this.data;
  }
  loadCache(name, maxAgeMs) {
    try {
      const f = path.join(this.cacheDir, name + '.json');
      if (Date.now() - fs.statSync(f).mtimeMs > maxAgeMs) return null;
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch { return null; }
  }
  saveCache(name, json) {
    try { fs.writeFileSync(path.join(this.cacheDir, name + '.json'), JSON.stringify(json)); } catch { /* nieistotne */ }
  }
}

module.exports = { Settings, DEFAULTS };
