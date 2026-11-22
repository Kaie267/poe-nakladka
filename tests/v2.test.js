const assert = require('assert');
const zlib = require('zlib');
const os = require('os'); const fs = require('fs'); const path = require('path');
const { decodePob } = require('../src/pob');
const { Session } = require('../src/session');
const { Updater } = require('../src/updater');
const guide = require('../src/data/guide.json');

(async () => {
  // PoB
  const xml = '<PathOfBuilding><Build className="Witch" ascendClassName="Elementalist"/><Skills><Skill><Gem nameSpec="Arc" skillId="Arc"/><Gem nameSpec="Added Lightning Damage" skillId="SupportAddedLightningDamage"/></Skill></Skills></PathOfBuilding>';
  const code = zlib.deflateSync(Buffer.from(xml)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  const p = decodePob(code);
  assert.equal(p.className, 'Witch'); assert.equal(p.ascendancy, 'Elementalist');
  assert.ok(p.gems.includes('Arc') && p.gems.includes('Added Lightning Damage Support'));

  // Poradnik: każdy krok z wejściem do strefy ma nazwę, nagrody dla klas istnieją
  const steps = guide.sections.flatMap(s => s.steps);
  assert.ok(steps.length > 400);
  assert.ok(steps.filter(s => s.enter).length > 150);
  const q = steps.flatMap(s => s.parts).find(x => x.k === 'quest' && x.r && x.r.quest.Witch);
  assert.ok(q.r.quest.Witch.length > 0);

  // Sesja: mapy i handel
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nk'));
  const s = new Session(dir, ['The Coast']);
  s.onLog({ kind: 'entered', area: 'Kingsmarch' });
  s.onLog({ kind: 'entered', area: 'Dunes' });
  s.onLog({ kind: 'entered', area: 'Your Hideout' });
  s.onLog({ kind: 'entered', area: 'Dunes' });
  s.onLog({ kind: 'entered', area: 'Mesa' });
  s.onLog({ kind: 'entered', area: 'The Coast' });
  assert.equal(s.stats().count, 2);
  s.onLog({ kind: 'from', name: 'B', trade: { item: 'Tabula Rasa', amount: '12', currency: 'chaos' } });
  s.onLog({ kind: 'joined', name: 'B' });
  s.onLog({ kind: 'accepted' });
  assert.equal(s.history[0].item, 'Tabula Rasa');
  assert.ok(fs.existsSync(path.join(dir, 'historia-handlu.json')));

  // Aktualizacje (atrapa GitHuba)
  const asar = Buffer.alloc(20000, 1);
  const fake = async url => url.includes('version.json')
    ? { ok: true, status: 200, json: async () => ({ version: '2.1.0', size: asar.length, notes: 'test' }) }
    : { ok: true, status: 200, arrayBuffer: async () => asar };
  const u = new Updater({ repo: 'x/y', current: '2.0.0', base: '2.0.0', dir: path.join(dir, 'akt'), fetch: fake });
  const st = await u.check();
  assert.equal(st.state, 'ready'); assert.ok(fs.existsSync(path.join(dir, 'akt', 'app-2.1.0.asar')));
  const u2 = new Updater({ repo: 'x/y', current: '2.1.0', base: '2.0.0', dir: path.join(dir, 'akt'), fetch: fake });
  assert.equal((await u2.check()).state, 'latest');
  console.log('v2: OK');
})().catch(e => { console.error(e); process.exit(1); });

// Stash: stronicowanie powyżej 100 przedmiotów
(async () => {
  const { scanListed, snapshotOf } = require('../src/stash');
  const all = Array.from({ length: 230 }, (_, i) => ({ id: 'i' + i, price: 300 - i }));
  let searches = 0;
  const trade = { call: async (g, m, p, body) => {
    if (m === 'POST') {
      searches++;
      const max = body.query.filters.trade_filters.filters.price && body.query.filters.trade_filters.filters.price.max;
      const res = all.filter(x => max == null || x.price <= max).slice(0, 100);
      return { id: 'q', total: 230, result: res.map(x => x.id) };
    }
    const ids = p.split('/fetch/')[1].split('?')[0].split(',');
    return { result: ids.map(id => { const x = all.find(a => a.id === id); return { id, item: { frameType: 2, typeLine: 'Ring', w: 1, h: 1, x: 0, y: 0 }, listing: { price: { amount: x.price, currency: 'chaos' }, stash: { name: x.price > 150 ? 'A' : 'B', x: 0, y: 0 } } }; }) };
  } };
  const ninja = { getTradeRates: async () => ({ chaos: 1 }), priceItem: async () => null };
  const d = await scanListed({ trade, ninja, account: 'x', league: 'L' });
  require('assert').equal(d.scanned, 230);
  require('assert').ok(searches >= 3);
  const snap = snapshotOf(d, []);
  require('assert').ok(snap.tc['A|Ekwipunek'] > 0 && snap.tc['B|Ekwipunek'] > 0);
  console.log('stash pages: OK');
})().catch(e => { console.error(e); process.exit(1); });

// Porównanie z noszonym przedmiotem
(() => {
  const assert = require('assert');
  const { compareItem, resGaps } = require('../src/compare');
  const { parseItem } = require('../src/parser');
  const S = require('./samples');
  const boots = parseItem(S.advanced);
  const build = { items: { Boots: { name: 'Old', mods: [{ text: '+60 to maximum Life' }, { text: '20% increased Movement Speed' }] } }, res: { fire: 60, cold: 60, lightning: 60, chaos: 0 }, profile: {} };
  const c = compareItem(boots, build);
  assert.equal(c.slot, 'Boots'); assert.equal(c.verdict, 'better');
  assert.equal(c.resAfter.find(r => r.key === 'fire').after, 72);
  assert.equal(resGaps(build.res).length, 3);
  const { explainMods } = require('../src/modexplain');
  const ex = explainMods(boots.mods, { type: 'attack', defense: 'es' });
  assert.equal(ex[1].verdict, 'bad'); // życie przy buildzie ES
  console.log('compare: OK');
})();

(() => {
  const assert = require('assert');
  const { advise } = require('../src/craftadvice');
  const S = require('./samples');
  const r = advise(S.advanced, { type: 'spell', defense: 'life' });
  assert.equal(r.summary.exact, true);
  assert.ok(r.steps.length >= 1);
  assert.equal(advise(S.ring, {}).steps[0].t, 'Przedmiot jest skorumpowany');
  const white = advise('Item Class: Boots\nRarity: Normal\nTwo-Toned Boots\n--------\nItem Level: 86', {});
  assert.ok(white.steps[0].t.startsWith('1.'));
  console.log('craft advice: OK');
})();
