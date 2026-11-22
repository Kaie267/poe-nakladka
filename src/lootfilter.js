'use strict';
// Generator loot filtra: reguły z aktualnych cen poe.ninja doklejane NA GÓRĘ wybranego filtra gracza.
// Plik .filter w folderze gry to w pełni dozwolony mechanizm (tak działa FilterBlade/NeverSink).
const fs = require('fs');
const path = require('path');

const EX_TYPES = ['Currency', 'Fragment', 'Thread', 'DivinationCard', 'Essence', 'Fossil', 'Resonator', 'Oil', 'DeliriumOrb', 'Omen', 'Tattoo', 'Runegraft', 'AllflameEmber', 'Artifact', 'Astrolabe', 'DjinnCoin'];
const UNIQUE_TYPES = ['UniqueWeapon', 'UniqueArmour', 'UniqueAccessory', 'UniqueFlask', 'UniqueJewel'];

const q = s => `"${String(s).replace(/"/g, '')}"`;

function block(title, cond, style) {
  return [`# ${title}`, 'Show', ...cond.map(c => '  ' + c), ...style.map(c => '  ' + c), ''].join('\n');
}

const STYLES = {
  t1: ['SetFontSize 45', 'SetTextColor 255 255 255 255', 'SetBorderColor 255 40 40 255', 'SetBackgroundColor 200 20 20 255', 'PlayAlertSound 6 300', 'PlayEffect Red', 'MinimapIcon 0 Red Star'],
  t2: ['SetFontSize 42', 'SetTextColor 20 20 20 255', 'SetBorderColor 20 20 20 255', 'SetBackgroundColor 240 140 40 255', 'PlayAlertSound 1 250', 'PlayEffect Orange', 'MinimapIcon 1 Orange Diamond'],
  t3: ['SetFontSize 38', 'SetTextColor 255 230 160 255', 'SetBorderColor 230 190 90 255', 'SetBackgroundColor 40 32 20 230', 'MinimapIcon 2 Yellow Circle'],
};

async function collect(ninja) {
  const items = new Map(); // nazwa -> chaos
  const add = (name, chaos) => { if (name && chaos != null && (!items.has(name) || items.get(name) < chaos)) items.set(name, chaos); };
  for (const t of ['Currency', 'Fragment']) { try { for (const l of await ninja.load('currency', t)) add(l.name, l.chaos); } catch { /* */ } }
  for (const t of EX_TYPES) { try { for (const l of await ninja.load('exchange', t)) add(l.name, l.chaos); } catch { /* */ } }
  const cards = new Map();
  try { for (const l of await ninja.load('exchange', 'DivinationCard')) cards.set(l.name, l.chaos); } catch { /* */ }
  for (const k of cards.keys()) items.delete(k);
  // Unikaty: liczy się baza; bierzemy najwyższą cenę unikatu na tej bazie (lepiej podświetlić za dużo niż przegapić).
  const uniq = new Map();
  for (const t of UNIQUE_TYPES) {
    try { for (const l of await ninja.load('item', t)) { if (l.links >= 5 || !l.baseType) continue; if (!uniq.has(l.baseType) || uniq.get(l.baseType) < l.chaos) uniq.set(l.baseType, l.chaos); } } catch { /* */ }
  }
  return { items, cards, uniq };
}

async function buildRules(ninja, { divine, t2 = 20, t3 = 5 }) {
  const t1 = divine || 150;
  const { items, cards, uniq } = await collect(ninja);
  const tier = map => {
    const r = { t1: [], t2: [], t3: [] };
    for (const [n, c] of map) { if (c >= t1) r.t1.push(n); else if (c >= t2) r.t2.push(n); else if (c >= t3) r.t3.push(n); }
    return r;
  };
  const ti = tier(items), tc = tier(cards), tu = tier(uniq);
  const out = [`# ===== Nakładka PoE — reguły z cen poe.ninja (${new Date().toLocaleString('pl-PL')}) =====`,
    `# T1 >= ${Math.round(t1)}c (dźwięk, czerwona wiązka) · T2 >= ${t2}c (dźwięk, pomarańczowa) · T3 >= ${t3}c`, ''];
  for (const t of ['t1', 't2', 't3']) {
    if (ti[t].length) out.push(block(`Waluta i fragmenty ${t.toUpperCase()}`, [`BaseType == ${ti[t].map(q).join(' ')}`], STYLES[t]));
    if (tc[t].length) out.push(block(`Karty ${t.toUpperCase()}`, ['Class == "Divination Cards"', `BaseType == ${tc[t].map(q).join(' ')}`], STYLES[t]));
    if (tu[t].length && t !== 't3') out.push(block(`Unikaty ${t.toUpperCase()} (baza z drogim unikatem)`, ['Rarity Unique', `BaseType == ${tu[t].map(q).join(' ')}`], STYLES[t]));
  }
  out.push('# ===== koniec reguł nakładki — dalej twój filtr =====', '');
  const counts = { t1: ti.t1.length + tc.t1.length + tu.t1.length, t2: ti.t2.length + tc.t2.length + tu.t2.length, t3: ti.t3.length + tc.t3.length };
  return { text: out.join('\n'), counts, top: [...items, ...cards].sort((a, b) => b[1] - a[1]).slice(0, 8) };
}

function filterDir(documents) {
  return path.join(documents, 'My Games', 'Path of Exile');
}

function listFilters(dir) {
  try { return fs.readdirSync(dir).filter(f => /\.filter$/i.test(f) && f !== 'NakladkaPoE.filter'); } catch { return []; }
}

async function generate({ ninja, documents, base, divine, t2, t3 }) {
  const dir = filterDir(documents);
  fs.mkdirSync(dir, { recursive: true });
  const rules = await buildRules(ninja, { divine, t2, t3 });
  let baseText = '';
  if (base) { try { baseText = fs.readFileSync(path.join(dir, base), 'utf8'); } catch { /* bez bazy */ } }
  if (!baseText) baseText = '# Brak bazowego filtra — reszta przedmiotów wygląda domyślnie.\nShow\n';
  const file = path.join(dir, 'NakladkaPoE.filter');
  fs.writeFileSync(file, rules.text + '\n' + baseText, 'utf8');
  return { file, counts: rules.counts, top: rules.top, at: Date.now() };
}

module.exports = { generate, listFilters, filterDir, buildRules };
