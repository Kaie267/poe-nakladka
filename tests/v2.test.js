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
