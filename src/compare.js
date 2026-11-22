'use strict';
// Porównanie przedmiotu z tym, co postać nosi (z kodu PoB), i odporności po zamianie.

const SLOT_BY_CLASS = {
  Helmets: ['Helmet'], 'Body Armours': ['Body Armour'], Gloves: ['Gloves'], Boots: ['Boots'], Belts: ['Belt'],
  Amulets: ['Amulet'], Rings: ['Ring 1', 'Ring 2'], Shields: ['Weapon 2'], Quivers: ['Weapon 2'],
  'One Hand Swords': ['Weapon 1'], 'Thrusting One Hand Swords': ['Weapon 1'], 'Two Hand Swords': ['Weapon 1'], 'One Hand Axes': ['Weapon 1'],
  'Two Hand Axes': ['Weapon 1'], 'One Hand Maces': ['Weapon 1'], 'Two Hand Maces': ['Weapon 1'], Sceptres: ['Weapon 1'], Daggers: ['Weapon 1'],
  'Rune Daggers': ['Weapon 1'], Claws: ['Weapon 1'], Bows: ['Weapon 1'], Staves: ['Weapon 1'], Warstaves: ['Weapon 1'], Wands: ['Weapon 1'],
};

const STATS = [
  ['life', 'życie', /^\+(\d+) to maximum Life$/, 1],
  ['lifePct', '% życia', /^(\d+)% increased maximum Life$/, 1],
  ['es', 'ES', /^\+(\d+) to maximum Energy Shield$/, 1],
  ['esPct', '% ES', /^(\d+)% increased (?:maximum )?Energy Shield$/, 1],
  ['mana', 'mana', /^\+(\d+) to maximum Mana$/, 1],
  ['move', '% ruchu', /^(\d+)% increased Movement Speed$/, 1],
  ['suppress', '% suppress', /^\+?(\d+)% chance to Suppress Spell Damage$/, 1],
  ['str', 'siła', /^\+(\d+) to (?:Strength|all Attributes)$/, 1],
  ['dex', 'zręczność', /^\+(\d+) to (?:Dexterity|all Attributes)$/, 1],
  ['int', 'inteligencja', /^\+(\d+) to (?:Intelligence|all Attributes)$/, 1],
  ['atkSpd', '% szybkości ataku', /^(\d+)% increased Attack Speed$/, 1],
  ['castSpd', '% szybkości czarów', /^(\d+)% increased Cast Speed$/, 1],
  ['spellDmg', '% obrażeń czarów', /^(\d+)% increased Spell Damage$/, 1],
  ['critMulti', '% mnożnika kryta', /^\+(\d+)% to (?:Global )?Critical Strike Multiplier$/, 1],
  ['gemLvl', 'poziom gemów', /^\+(\d+) to Level of all .*Gems$/, 1],
];

function statsOf(mods) {
  const s = { fire: 0, cold: 0, lightning: 0, chaos: 0 };
  for (const m of mods || []) {
    const t = m.text;
    let mm;
    if ((mm = t.match(/^\+(\d+)% to all Elemental Resistances$/))) { s.fire += +mm[1]; s.cold += +mm[1]; s.lightning += +mm[1]; }
    else if ((mm = t.match(/^\+(\d+)% to (Fire|Cold|Lightning) and (Fire|Cold|Lightning) Resistances$/))) { s[mm[2].toLowerCase()] += +mm[1]; s[mm[3].toLowerCase()] += +mm[1]; }
    else if ((mm = t.match(/^\+(\d+)% to (Fire|Cold|Lightning) and Chaos Resistances$/))) { s[mm[2].toLowerCase()] += +mm[1]; s.chaos += +mm[1]; }
    else if ((mm = t.match(/^\+(\d+)% to (Fire|Cold|Lightning|Chaos) Resistance$/))) s[mm[2].toLowerCase()] += +mm[1];
    for (const [k, , re] of STATS) { const x = t.match(re); if (x) s[k] = (s[k] || 0) + Number(x[1]); }
    if ((mm = t.match(/^\+(\d+) to Strength and (Dexterity|Intelligence)$/))) { s.str = (s.str || 0) + +mm[1]; s[mm[2] === 'Dexterity' ? 'dex' : 'int'] = (s[mm[2] === 'Dexterity' ? 'dex' : 'int'] || 0) + +mm[1]; }
    if ((mm = t.match(/^\+(\d+) to Dexterity and Intelligence$/))) { s.dex = (s.dex || 0) + +mm[1]; s.int = (s.int || 0) + +mm[1]; }
  }
  return s;
}

const CAP = 75;
const RES = [['fire', 'ogień'], ['cold', 'zimno'], ['lightning', 'błyskawice'], ['chaos', 'chaos']];

function resGaps(buildRes) {
  if (!buildRes) return [];
  return RES.filter(([k]) => k !== 'chaos' && buildRes[k] != null && buildRes[k] < CAP).map(([k, pl]) => ({ key: k, label: pl, missing: CAP - buildRes[k] }));
}

function scoreDiff(d, resBefore, resAfter, profile = {}) {
  let sc = 0;
  sc += (d.life || 0) * 1 + (d.lifePct || 0) * 8;
  const esW = profile.defense === 'es' ? 1 : profile.defense === 'hybrid' ? 0.6 : 0.15;
  sc += ((d.es || 0) + (d.esPct || 0) * 6) * esW;
  for (const [k] of RES) {
    if (resBefore[k] == null) { sc += (d[k] || 0) * (k === 'chaos' ? 0.4 : 0.8); continue; }
    // Res poniżej capu jest bardzo cenny, ponad cap — prawie nic.
    const capB = Math.min(resBefore[k], CAP), capA = Math.min(resAfter[k], CAP);
    sc += (capA - capB) * (k === 'chaos' ? 1 : 2.5) + ((resAfter[k] - capA) - (resBefore[k] - capB)) * 0.1;
  }
  sc += (d.move || 0) * 3 + (d.suppress || 0) * 1.5 + ((d.str || 0) + (d.dex || 0) + (d.int || 0)) * 0.2 + (d.gemLvl || 0) * 25;
  if (profile.type === 'attack') sc += (d.atkSpd || 0) * 2;
  if (profile.type === 'spell') sc += (d.castSpd || 0) * 2 + (d.spellDmg || 0) * 0.8;
  sc += (d.critMulti || 0) * (profile.type === 'dot' || profile.type === 'minion' ? 0 : 0.6);
  return sc;
}

function compareItem(item, build) {
  const slots = SLOT_BY_CLASS[item.itemClass];
  if (!slots || !build || !build.items) return null;
  const mine = statsOf(item.mods);
  const res = build.res || {};
  const options = slots.map(slot => {
    const old = build.items[slot];
    const os = statsOf(old ? old.mods : []);
    const keys = new Set([...Object.keys(mine), ...Object.keys(os)]);
    const d = {};
    for (const k of keys) { const v = (mine[k] || 0) - (os[k] || 0); if (v) d[k] = v; }
    const after = {};
    for (const [k] of RES) after[k] = res[k] != null ? res[k] + (d[k] || 0) : null;
    const score = scoreDiff(d, res, after, build.profile);
    return { slot, old: old ? (old.name || old.base) : null, d, after, score };
  });
  // Dla pierścieni porównujemy z gorszym z dwóch (ten byś wymienił).
  const best = options.sort((a, b) => b.score - a.score)[0];
  const diffs = [];
  for (const [k, pl] of RES) if (best.d[k]) diffs.push({ label: `res ${pl}`, v: best.d[k], unit: '%' });
  for (const [k, pl] of STATS) if (best.d[k]) diffs.push(pl.startsWith('% ') ? { label: pl.slice(2), v: best.d[k], unit: '%' } : { label: pl, v: best.d[k], unit: '' });
  const verdict = best.score > 6 ? 'better' : best.score < -6 ? 'worse' : 'similar';
  const resAfter = RES.filter(([k]) => res[k] != null).map(([k, pl]) => ({ key: k, label: pl, before: res[k], after: best.after[k], cap: k === 'chaos' ? null : CAP }));
  return { slot: best.slot, old: best.old, diffs, verdict, score: Math.round(best.score), resAfter };
}

module.exports = { compareItem, statsOf, resGaps, SLOT_BY_CLASS };
