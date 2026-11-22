'use strict';
// Odczyt kodu Path of Building: klasa postaci i lista gemów (do poradnika kampanii).
const zlib = require('zlib');

function decodePob(code) {
  const clean = String(code || '').trim().replace(/^https?:\/\/\S+\//, '').replace(/-/g, '+').replace(/_/g, '/');
  const buf = Buffer.from(clean, 'base64');
  const xml = zlib.inflateSync(buf).toString('utf8');
  const cls = (xml.match(/<Build[^>]*\bclassName="([^"]+)"/) || [])[1] || null;
  const asc = (xml.match(/<Build[^>]*\bascendClassName="([^"]+)"/) || [])[1] || null;
  const gems = new Set();
  const re = /<Gem\b[^>]*>/g;
  let m;
  while ((m = re.exec(xml))) {
    const tag = m[0];
    const name = (tag.match(/\bnameSpec="([^"]+)"/) || tag.match(/\bname="([^"]+)"/) || [])[1];
    if (!name) continue;
    // Wsparcia mają w PoB nazwę bez słowa "Support", a w nagrodach questów z nim — zapisujemy obie formy.
    gems.add(name);
    if (/skillId="Support/.test(tag) && !/ Support$/.test(name)) gems.add(name + ' Support');
  }
  // Profil buildu do "tłumacza modów" — zgadujemy z danych PoB, gracz może poprawić w ustawieniach.
  const stat = name => { const mm = xml.match(new RegExp(`<PlayerStat stat="${name}" value="([\\d.\\-e]+)"`)); return mm ? parseFloat(mm[1]) : null; };
  const life = stat('Life') || 0, es = stat('EnergyShield') || 0;
  const defense = es > life * 1.5 ? 'es' : es > life * 0.4 ? 'hybrid' : 'life';
  const mainIdx = parseInt((xml.match(/<Build[^>]*\bmainSocketGroup="(\d+)"/) || [])[1] || '1', 10);
  const skills = [...xml.matchAll(/<Skill\b[^>]*>([\s\S]*?)<\/Skill>/g)].map(x => x[1]);
  const mainSkill = skills[mainIdx - 1] || skills[0] || '';
  const mainGem = (mainSkill.match(/<Gem\b[^>]*nameSpec="([^"]+)"[^>]*skillId="(?!Support)[^"]*"/) || mainSkill.match(/nameSpec="([^"]+)"/) || [])[1] || null;
  const allText = mainSkill + ' ' + (mainGem || '');
  let type = '';
  if (/Raise|Summon|Animate|Skeleton|Zombie|Spectre|Golem|Dominating Blow|Absolution|Minion/i.test(allText)) type = 'minion';
  else if (/Righteous Fire|Essence Drain|Contagion|Bane|Caustic|Toxic Rain|Death's Oath|Blight|Scorching Ray|Wither|Bleed|Poison|Ignite/i.test(allText)) type = 'dot';
  else if (stat('AccuracyHitChance') !== null || stat('HitChance') !== null) type = 'attack';
  else if (stat('CastRate') !== null || /Spell/.test(mainSkill)) type = 'spell';
  const el = /Fire|Flame|Burn|Ignite|Infernal|Magma|Fireball|Righteous/i.test(allText) ? 'fire' : /Cold|Ice|Frost|Freez|Glacial|Winter|Vortex|Arctic/i.test(allText) ? 'cold'
    : /Lightning|Spark|Arc|Storm|Shock|Thunder|Volt/i.test(allText) ? 'lightning' : /Chaos|Poison|Caustic|Essence Drain|Bane|Blight/i.test(allText) ? 'chaos' : '';
  return { className: cls, ascendancy: asc, gems: [...gems], mainGem, profile: { type, defense, element: el } };
}

module.exports = { decodePob };
