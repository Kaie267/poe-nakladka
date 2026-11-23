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
  // Odporności postaci (z wyliczeń PoB) i noszone przedmioty — do porównań przy wycenie.
  const res = { fire: stat('FireResist'), cold: stat('ColdResist'), lightning: stat('LightningResist'), chaos: stat('ChaosResist') };
  const items = parsePobItems(xml);
  // Dane do loot filtra pod build: bazy noszonych rare, unikaty (po bazie), gemy i typ obrony.
  const armour = stat('Armour') || 0, evasion = stat('Evasion') || 0;
  let defBase = 'hybrid';
  if (es > life * 0.5 && es > armour / 5 && es > evasion / 5) defBase = 'es';
  else if (armour > evasion * 1.3) defBase = 'armour';
  else if (evasion > armour * 1.3) defBase = 'evasion';
  const filter = {
    rareBases: [...new Set(Object.values(items).filter(i => i.rarity === 'Rare' && i.base).map(i => i.base))],
    uniques: [...new Set(Object.values(items).filter(i => i.rarity === 'Unique').map(i => ({ name: i.name, base: i.base })).filter(u => u.base).map(u => JSON.stringify(u)))].map(x => JSON.parse(x)),
    gems: [...gems].filter(g => !/ Support$/.test(g) || true),
    defBase,
  };
  return { className: cls, ascendancy: asc, gems: [...gems], mainGem, profile: { type, defense, element: el }, res, items, filter };
}

const unxml = t => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#10;/g, '\n').replace(/&amp;/g, '&');

// Format przedmiotu w PoB: "Rarity: RARE", nazwa, baza, potem pola "Klucz: wartość", "Implicits: N", N implicitów i reszta modów.
function parsePobItem(text) {
  const lines = unxml(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out = { rarity: null, name: null, base: null, mods: [] };
  // Nowsze PoB mogą mieć przed "Rarity:" inne linie (np. "Item Class:") — szukamy jej w pierwszych liniach.
  let i = 0;
  const ri = lines.slice(0, 4).findIndex(l => /^Rarity:/i.test(l));
  if (ri >= 0) i = ri;
  const r = lines[i] && lines[i].match(/^Rarity: (\w+)/i);
  if (r) { out.rarity = r[1][0].toUpperCase() + r[1].slice(1).toLowerCase(); i++; }
  out.name = lines[i++] || '';
  if (out.rarity === 'Rare' || out.rarity === 'Unique') out.base = lines[i++] || '';
  else out.base = out.name;
  let implicits = 0;
  for (; i < lines.length; i++) {
    const l = lines[i];
    const im = l.match(/^Implicits: (\d+)/);
    if (im) { implicits = +im[1]; i++; break; }
  }
  const strip = l => l.replace(/\{[^}]*\}/g, '').trim();
  for (let k = 0; k < implicits && i < lines.length; k++, i++) out.mods.push({ text: strip(lines[i]), type: 'implicit' });
  for (; i < lines.length; i++) {
    const t = strip(lines[i]);
    if (!t || /^(Corrupted|Mirrored|Unidentified|Shaper Item|Elder Item|.* Item)$/.test(t)) continue;
    out.mods.push({ text: t, type: /\{crafted\}/.test(lines[i]) ? 'crafted' : 'explicit' });
  }
  for (const m of out.mods) m.nums = (m.text.match(/[+-]?\d+(?:\.\d+)?/g) || []).map(Number);
  return out;
}

function parsePobItems(xml) {
  const byId = {};
  const attr = (tag, n) => (tag.match(new RegExp(`\\b${n}="([^"]*)"`)) || [])[1];
  for (const m of xml.matchAll(/<Item\b([^>]*)>([\s\S]*?)<\/Item>/g)) {
    const id = attr(m[1], 'id');
    if (!id) continue;
    try { byId[id] = parsePobItem(m[2].replace(/<[^>]+\/>/g, '')); } catch { /* */ }
  }
  const activeSet = (xml.match(/<Items\b[^>]*\bactiveItemSet="(\d+)"/) || [])[1];
  const sets = [...xml.matchAll(/<ItemSet\b([^>]*)>([\s\S]*?)<\/ItemSet>/g)];
  const set = sets.find(s => attr(s[1], 'id') === activeSet) || sets[0];
  const slots = {};
  // Kolejność atrybutów w <Slot> bywa różna (PoB zapisuje je w dowolnej kolejności).
  const read = src => { for (const m of src.matchAll(/<Slot\b([^>]*)\/?>/g)) {
    const name = attr(m[1], 'name'), id = attr(m[1], 'itemId');
    if (name && id && id !== '0' && byId[id] && !/Swap|Abyssal|Flask|Jewel/.test(name)) slots[name] = byId[id];
  } };
  if (set) read(set[2]);
  if (!Object.keys(slots).length) read(xml);
  // Ostatecznie: build bez przypisanych slotów — bierzemy wszystkie rare/unikaty z listy przedmiotów.
  if (!Object.keys(slots).length) Object.entries(byId).forEach(([id, it]) => { if (it.rarity === 'Rare' || it.rarity === 'Unique') slots['item' + id] = it; });
  return slots;
}

module.exports = { decodePob, parsePobItem };
