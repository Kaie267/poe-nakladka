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

const ARMOUR_CLASSES = '"Body Armours" "Helmets" "Gloves" "Boots" "Shields"';
const DEF_COND = { es: ['BaseEnergyShield > 0', 'BaseArmour = 0', 'BaseEvasion = 0'], armour: ['BaseArmour > 0', 'BaseEvasion = 0', 'BaseEnergyShield = 0'],
  evasion: ['BaseEvasion > 0', 'BaseArmour = 0', 'BaseEnergyShield = 0'], hybrid: ['BaseArmour > 0', 'BaseEvasion > 0'] };

// Reguły pod build z PoB: twoje unikaty, bazy rare, które nosisz, pancerze pod twój typ obrony i gemy.
function buildBlocks(bf, o) {
  if (!bf) return [];
  const snd = Math.max(1, Math.min(16, Number(o.sound) || 2));
  // Minimalny item level reguł buildu: 0 = kampania (bez limitu, liczą się też magiczne pancerze).
  const lv = Number.isFinite(Number(o.ilvl)) ? Number(o.ilvl) : 68;
  const ilv = lv > 0 ? [`ItemLevel >= ${lv}`] : [];
  const out = ['# ----- Pod twój build (PoB) -----', ''];
  const uq = (bf.uniques || []).map(u => u.base).filter(Boolean);
  if (o.uniques !== false && uq.length) out.push(block(`Build: unikaty (${(bf.uniques || []).map(u => u.name).join(', ')})`, ['Rarity Unique', `BaseType == ${[...new Set(uq)].map(q).join(' ')}`],
    ['SetFontSize 45', 'SetTextColor 255 255 255 255', 'SetBorderColor 255 255 255 255', 'SetBackgroundColor 30 140 50 255', `PlayAlertSound ${snd} 300`, 'PlayEffect Green', 'MinimapIcon 0 Green Star']));
  if (o.bases !== false && (bf.rareBases || []).length) out.push(block('Build: rare na bazach, które nosisz', ['Rarity Rare', ...ilv, `BaseType == ${bf.rareBases.map(q).join(' ')}`],
    ['SetFontSize 42', 'SetTextColor 255 255 255 255', 'SetBorderColor 255 255 255 255', 'SetBackgroundColor 30 140 50 255', `PlayAlertSound ${snd} 200`, 'PlayEffect Green Temp', 'MinimapIcon 1 Green Diamond']));
  if (o.defense !== false && DEF_COND[bf.defBase]) out.push(block(`Build: ${lv > 0 ? 'rare' : 'magiczne i rare'} pancerze pod obronę (${bf.defBase})`, [lv > 0 ? 'Rarity Rare' : 'Rarity >= Magic', `Class == ${ARMOUR_CLASSES}`, ...ilv, ...DEF_COND[bf.defBase]],
    ['SetFontSize 38', 'SetTextColor 255 255 255 255', 'SetBorderColor 255 255 255 255', 'SetBackgroundColor 30 140 50 255', 'MinimapIcon 2 Green Circle']));
  if (o.gems !== false && (bf.gems || []).length) out.push(block('Build: twoje gemy', ['Class == "Skill Gems" "Support Gems"', `BaseType == ${bf.gems.map(q).join(' ')}`],
    ['SetFontSize 40', 'SetTextColor 255 255 255 255', 'SetBorderColor 255 255 255 255', 'SetBackgroundColor 30 140 50 255', `PlayAlertSound ${snd} 150`, 'MinimapIcon 2 Green Triangle']));
  return out;
}

// Rare, których bazowy filtr (np. strict FilterBlade) może chować — ten blok stoi przed nim, więc wygrywa.
const RARE_MODES = {
  all: { title: 'wszystkie rare', cond: [] },
  ilvl75: { title: 'rare od item level 75', cond: ['ItemLevel >= 75'] },
  ilvl82: { title: 'rare od item level 82', cond: ['ItemLevel >= 82'] },
  jewelry: { title: 'rare biżuteria i jewele', cond: ['Class == "Rings" "Amulets" "Belts" "Jewels" "Abyss Jewels"'] },
};
function rareBlock(mode) {
  const m = RARE_MODES[mode];
  if (!m) return [];
  return [block(`Zawsze pokazuj: ${m.title}`, ['Rarity Rare', ...m.cond],
    ['SetFontSize 36', 'SetTextColor 255 255 119 255', 'SetBorderColor 255 255 119 160', 'SetBackgroundColor 0 0 0 200'])];
}

async function buildRules(ninja, { divine, t2 = 20, t3 = 5, build = null, buildOpts = {}, rares = 'base' }) {
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
  // T1 (bardzo drogie) zawsze pierwsze; reguły buildu przed T2/T3, żeby twoje rzeczy nie zginęły.
  const buildPart = buildOpts.enabled ? buildBlocks(build, buildOpts) : [];
  for (const t of ['t1', 't2', 't3']) {
    if (t === 't2' && buildPart.length) out.push(...buildPart);
    if (ti[t].length) out.push(block(`Waluta i fragmenty ${t.toUpperCase()}`, [`BaseType == ${ti[t].map(q).join(' ')}`], STYLES[t]));
    if (tc[t].length) out.push(block(`Karty ${t.toUpperCase()}`, ['Class == "Divination Cards"', `BaseType == ${tc[t].map(q).join(' ')}`], STYLES[t]));
    if (tu[t].length && t !== 't3') out.push(block(`Unikaty ${t.toUpperCase()} (baza z drogim unikatem)`, ['Rarity Unique', `BaseType == ${tu[t].map(q).join(' ')}`], STYLES[t]));
  }
  out.push(...rareBlock(rares));
  out.push('# ===== koniec reguł nakładki — dalej twój filtr =====', '');
  const buildRulesN = buildPart.filter(x => x.startsWith('# Build:')).length;
  const counts = { build: buildRulesN, buildOn: !!buildOpts.enabled, hasBuild: !!build, t1: ti.t1.length + tc.t1.length + tu.t1.length, t2: ti.t2.length + tc.t2.length + tu.t2.length, t3: ti.t3.length + tc.t3.length };
  return { text: out.join('\n'), counts, top: [...items, ...cards].sort((a, b) => b[1] - a[1]).slice(0, 8) };
}

function filterDir(documents) {
  return path.join(documents, 'My Games', 'Path of Exile');
}

// Czy plik to filtr zrobiony przez nakładkę (żeby nie proponować go jako bazowego).
function isOurs(dir, f) {
  if (f === 'NakladkaPoE.filter') return true;
  try { const fd = fs.openSync(path.join(dir, f), 'r'); const b = Buffer.alloc(120); fs.readSync(fd, b, 0, 120, 0); fs.closeSync(fd); return b.toString('utf8').startsWith('# ===== Nakładka PoE'); } catch { return false; }
}
function listFilters(dir) {
  try { return fs.readdirSync(dir).filter(f => /\.filter$/i.test(f) && !isOurs(dir, f)); } catch { return []; }
}
function listOurs(dir) {
  try { return fs.readdirSync(dir).filter(f => /\.filter$/i.test(f) && isOurs(dir, f)).map(f => f.replace(/\.filter$/i, '')); } catch { return []; }
}
function safeName(n) {
  const s = String(n || '').replace(/\.filter$/i, '').replace(/[^\p{L}\p{N} _\-]/gu, '').trim().slice(0, 60);
  return s || 'NakladkaPoE';
}

async function generate({ ninja, documents, base, divine, t2, t3, build, buildOpts, name, rares }) {
  const dir = filterDir(documents);
  fs.mkdirSync(dir, { recursive: true });
  const rules = await buildRules(ninja, { divine, t2, t3, build, buildOpts, rares });
  let baseText = '';
  if (base) { try { baseText = fs.readFileSync(path.join(dir, base), 'utf8'); } catch { /* bez bazy */ } }
  if (!baseText) baseText = '# Brak bazowego filtra — reszta przedmiotów wygląda domyślnie.\nShow\n';
  const file = path.join(dir, safeName(name) + '.filter');
  fs.writeFileSync(file, rules.text + '\n' + baseText, 'utf8');
  return { file, name: safeName(name), counts: rules.counts, top: rules.top, at: Date.now() };
}

module.exports = { generate, listFilters, listOurs, safeName, filterDir, buildRules, buildBlocks };
