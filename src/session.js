'use strict';
// Statystyki sesji z Client.txt: mapy (liczba, średni czas, mapy/h) i historia handlu.
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const TOWNS = /Hideout|Kingsmarch|Karui Shores|Lioneye's Watch|Forest Encampment|Sarn Encampment|Highgate|Overseer's Tower|Bridge Encampment|Oriath|Rogue Harbour|Monastery of the Keepers|Menagerie|Aspirants' Plaza|Azurite Mine|Mine Encampment|Templar Laboratory|The Sanctum/i;

class Session extends EventEmitter {
  constructor(dir, campaignAreas) {
    super();
    this.historyFile = path.join(dir, 'historia-handlu.json');
    this.campaign = new Set(campaignAreas || []);
    this.reset();
    try { this.history = JSON.parse(fs.readFileSync(this.historyFile, 'utf8')); } catch { this.history = []; }
    this.pending = new Map(); // kupujący -> oferta z szeptu
    this.lastJoined = null;
  }

  reset() {
    this.start = Date.now();
    this.maps = [];          // zakończone mapy: {area, ms}
    this.current = null;     // {area, enteredAt, inMapMs, lastEnter}
    this.where = 'town';
  }

  isTown(area) { return TOWNS.test(area); }

  onLog(ev) {
    if (ev.kind === 'entered') this.onEnter(ev.area);
    else if (ev.kind === 'from' && ev.trade) this.pending.set(ev.name, { ...ev.trade, name: ev.name, at: Date.now() });
    else if (ev.kind === 'joined') this.lastJoined = ev.name;
    else if (ev.kind === 'accepted') this.onTradeAccepted();
  }

  onEnter(area) {
    const now = Date.now();
    if (this.current && this.where === 'map') this.current.inMapMs += now - this.current.lastEnter;
    if (this.isTown(area) || this.campaign.has(area)) {
      this.where = 'town';
    } else {
      if (!this.current || this.current.area !== area) {
        if (this.current) this.maps.push({ area: this.current.area, ms: this.current.inMapMs });
        this.current = { area, enteredAt: now, inMapMs: 0, lastEnter: now };
      } else this.current.lastEnter = now;
      this.where = 'map';
    }
    this.emit('change', this.stats());
  }

  onTradeAccepted() {
    const name = this.lastJoined;
    const t = name && this.pending.get(name);
    if (!t) return;
    this.pending.delete(name);
    this.history.unshift({ at: Date.now(), name, item: t.item, amount: t.amount, currency: t.currency });
    this.history = this.history.slice(0, 500);
    try { fs.writeFileSync(this.historyFile, JSON.stringify(this.history)); } catch { /* */ }
    this.emit('trade', this.history[0]);
  }

  stats() {
    const now = Date.now();
    const done = this.maps.slice();
    const curMs = this.current ? this.current.inMapMs + (this.where === 'map' ? now - this.current.lastEnter : 0) : 0;
    const count = done.length + (this.current ? 1 : 0);
    const avg = done.length ? done.reduce((a, m) => a + m.ms, 0) / done.length : curMs;
    const hours = (now - this.start) / 3600000;
    return {
      count, avgMs: avg, perHour: hours > 0.05 ? count / hours : null,
      current: this.current ? { area: this.current.area, ms: curMs, inMap: this.where === 'map' } : null,
      sessionMs: now - this.start,
    };
  }
}

module.exports = { Session, TOWNS };
