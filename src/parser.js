'use strict';
// Parsuje tekst przedmiotu skopiowany z PoE1 (Ctrl+C lub Ctrl+Alt+C).

const SEP = /^-{8,}$/;

function splitSections(text) {
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trimEnd());
  const sections = [[]];
  for (const l of lines) {
    if (SEP.test(l.trim())) sections.push([]);
    else if (l.trim() !== '') sections[sections.length - 1].push(l.trim());
  }
  return sections.filter(s => s.length);
}

// Linie z Ctrl+Alt+C: "{ Prefix Modifier "Hale" (Tier: 3) — Life }" oraz zakresy "+52(50-59)"
function cleanAdvanced(line) {
  if (/^\{.*\}$/.test(line)) return null;
  return line.replace(/(\d+(?:\.\d+)?)\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\)/g, '$1');
}

const MOD_TAGS = ['implicit', 'crafted', 'fractured', 'enchant', 'scourge', 'crucible'];

function parseModLine(raw) {
  let line = raw;
  let type = 'explicit';
  const m = line.match(/\s\((implicit|crafted|fractured|enchant|scourge|crucible)\)$/);
  if (m) { type = m[1]; line = line.slice(0, m.index); }
  const nums = (line.match(/[+-]?\d+(?:\.\d+)?/g) || []).map(Number);
  return { text: line, type, nums };
}

function parseItem(text) {
  if (!text || typeof text !== 'string') return null;
  const sections = splitSections(text);
  if (!sections.length) return null;
  const head = sections[0];
  const item = {
    raw: text, itemClass: null, rarity: null, name: null, baseType: null,
    stack: 1, stackMax: null, ilvl: null, gemLevel: null, quality: 0,
    corrupted: false, mirrored: false, unidentified: false, links: 0, sockets: '',
    mapTier: null, mapStats: [], influences: [], mods: [], properties: {},
  };

  let i = 0;
  if (/^Item Class:/.test(head[0])) { item.itemClass = head[0].replace('Item Class:', '').trim(); i++; }
  if (!/^Rarity:/.test(head[i] || '')) return null; // to nie jest przedmiot z PoE
  item.rarity = head[i].replace('Rarity:', '').trim();
  i++;
  const nameLines = head.slice(i);
  if (nameLines.length >= 2) { item.name = nameLines[0]; item.baseType = nameLines[1]; }
  else { item.name = nameLines[0] || ''; item.baseType = nameLines[0] || ''; }
  item.baseType = (item.baseType || '').replace(/^Superior /, '').replace(/^Synthesised /, '');
  if (item.rarity === 'Normal' || item.rarity === 'Currency' || item.rarity === 'Gem' || item.rarity === 'Divination Card') {
    item.name = (item.name || '').replace(/^Superior /, '');
  }

  const modLines = [];
  for (let s = 1; s < sections.length; s++) {
    const sec = sections[s];
    let consumed = false;
    for (const rawLine of sec) {
      const line = rawLine;
      let mm;
      if ((mm = line.match(/^Stack Size:\s*([\d,.\s]+)\/([\d,.\s]+)/))) {
        item.stack = parseInt(mm[1].replace(/[^\d]/g, ''), 10) || 1;
        item.stackMax = parseInt(mm[2].replace(/[^\d]/g, ''), 10) || null; consumed = true;
      } else if ((mm = line.match(/^Item Level:\s*(\d+)/))) { item.ilvl = +mm[1]; consumed = true; }
      else if ((mm = line.match(/^Map Tier:\s*(\d+)/))) { item.mapTier = +mm[1]; consumed = true; }
      else if ((mm = line.match(/^Quality(?: \([^)]+\))?:\s*\+?(\d+)%/))) { item.quality = +mm[1]; consumed = true; }
      else if ((mm = line.match(/^Level:\s*(\d+)/)) && item.rarity === 'Gem' && item.gemLevel === null) { item.gemLevel = +mm[1]; consumed = true; }
      else if ((mm = line.match(/^Sockets:\s*(.+)$/))) {
        item.sockets = mm[1].trim();
        item.links = Math.max(...item.sockets.split(' ').map(g => g.split('-').length));
        consumed = true;
      }
      else if (line === 'Corrupted') { item.corrupted = true; consumed = true; }
      else if (line === 'Mirrored') { item.mirrored = true; consumed = true; }
      else if (line === 'Unidentified') { item.unidentified = true; consumed = true; }
      else if ((mm = line.match(/^(Shaper|Elder|Crusader|Hunter|Redeemer|Warlord|Searing Exarch|Eater of Worlds) Item$/))) { item.influences.push(mm[1]); consumed = true; }
      else if ((mm = line.match(/^(Item Quantity|Item Rarity|Monster Pack Size|More Scarabs|More Currency|More Maps|More Divination Cards|Atlas Drops|Quality \([^)]+\)):\s*\+?(-?\d+)%/))) {
        item.mapStats.push({ label: mm[1], value: +mm[2] }); consumed = true;
      }
      else if ((mm = line.match(/^([A-Z][A-Za-z ']+):\s*(.+)$/)) && !/\d+% (increased|reduced|more|less)/.test(line)) {
        item.properties[mm[1]] = mm[2];
      }
    }
    if (!consumed) modLines.push(sec);
  }

  // Sekcje z modami: odrzucamy wymagania, opisy i teksty fabularne.
  const skipStart = /^(Requirements:|Requires |Level:|Str:|Dex:|Int:|Right click|Place into|Travel to|Can be used|Shift click|This is a Support Gem|Note:|Stack Size)/;
  const modSections = modLines.filter(sec => {
    const first = sec[0];
    if (skipStart.test(first)) return false;
    if (/^".*"$/.test(first) || /^[A-Z][a-z]+(?: [A-Za-z']+)*:/.test(first) && !/\(implicit\)|\(enchant\)/.test(sec.join(' '))) {
      // sekcje właściwości ("Armour: 300", "Physical Damage: ...") pomijamy
      if (sec.every(l => /^[A-Z][A-Za-z ']+:/.test(l) || /^\(/.test(l))) return false;
    }
    return true;
  });

  if (!['Currency', 'Divination Card', 'Gem'].includes(item.rarity)) {
    for (const sec of modSections) {
      for (const raw of sec) {
        const l = cleanAdvanced(raw);
        if (!l || /^\(.*\)$/.test(l)) continue;
        if (/^".*"$/.test(l)) continue;
        if (/^[A-Z][A-Za-z ']+:\s/.test(l) && !/\((implicit|enchant|crafted)\)$/.test(l)) continue;
        item.mods.push(parseModLine(l));
      }
    }
    // Opis uniku (flavour text) zwykle nie ma cyfr i jest na końcu — odfiltruj linie bez liczb kończące się kropką
    item.mods = item.mods.filter(m => !(m.nums.length === 0 && /[.!?,]$/.test(m.text)));
  }

  item.isMap = item.itemClass === 'Maps' || / Map$/.test(item.baseType || '');
  // Magiczne przedmioty mają jedną linię nazwy z afiksami ("Fecund Dunes Map of Exposure");
  // dokładną bazę dopasowujemy później po liście nazw z poe.ninja.
  item.fullName = item.rarity === 'Magic' ? item.name : null;
  return item;
}

module.exports = { parseItem, splitSections, parseModLine, MOD_TAGS };
