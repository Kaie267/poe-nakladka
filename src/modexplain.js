'use strict';
// "Tłumacz modów": krótkie wyjaśnienie po polsku, co mod daje, i ocena pod build gracza.
// Profil buildu: { type: 'attack'|'spell'|'minion'|'dot'|'', defense: 'life'|'es'|'hybrid'|'', element: 'physical'|'fire'|'cold'|'lightning'|'chaos'|'' }

const EL = { Physical: 'physical', Fire: 'fire', Cold: 'cold', Lightning: 'lightning', Chaos: 'chaos' };
const ELPL = { physical: 'fizycznych', fire: 'od ognia', cold: 'od zimna', lightning: 'od błyskawic', chaos: 'od chaosu' };

// Każda reguła: wzorzec, opis (n = liczby z modu, m = dopasowanie) i tagi do oceny.
const RULES = [
  [/^\+(\d+) to maximum Life$/, n => `+${n[0]} życia. Więcej HP = trudniej cię zabić.`, ['life']],
  [/^(\d+)% increased maximum Life$/, n => `+${n[0]}% życia (mnoży całe HP).`, ['life']],
  [/^\+(\d+) to maximum Energy Shield$/, n => `+${n[0]} tarczy energii (ES).`, ['es']],
  [/^(\d+)% increased maximum Energy Shield$/, n => `+${n[0]}% tarczy energii.`, ['es']],
  [/^(\d+)% increased Energy Shield$/, n => `+${n[0]}% ES tego przedmiotu.`, ['es']],
  [/^\+(\d+) to maximum Mana$/, n => `+${n[0]} many: więcej na rzucanie skilli i aury.`, ['mana']],
  [/^\+(\d+)% to (Fire|Cold|Lightning) Resistance$/, (n, m) => `+${n[0]}% odporności ${{ Fire: 'na ogień', Cold: 'na zimno', Lightning: 'na błyskawice' }[m[2]]}. Na mapach potrzebujesz 75%.`, ['res']],
  [/^\+(\d+)% to (Fire|Cold|Lightning) and (Fire|Cold|Lightning) Resistances$/, n => `+${n[0]}% do dwóch odporności naraz (liczy się podwójnie).`, ['res']],
  [/^\+(\d+)% to all Elemental Resistances$/, n => `+${n[0]}% do wszystkich trzech odporności (ogień, zimno, błyskawice).`, ['res']],
  [/^\+(\d+)% to Chaos Resistance$/, n => `+${n[0]}% odporności na chaos (na mapach startujesz z −60%).`, ['res']],
  [/^\+(\d+) to Strength$/, n => `+${n[0]} siły: wymagania sprzętu i gemów, co 10 siły = +5 życia.`, ['attr']],
  [/^\+(\d+) to Dexterity$/, n => `+${n[0]} zręczności: wymagania, co 10 = +20 celności.`, ['attr']],
  [/^\+(\d+) to Intelligence$/, n => `+${n[0]} inteligencji: wymagania, co 10 = +5 many.`, ['attr']],
  [/^\+(\d+) to all Attributes$/, n => `+${n[0]} do siły, zręczności i inteligencji.`, ['attr']],
  [/^\+(\d+) to (Strength|Dexterity|Intelligence) and (Strength|Dexterity|Intelligence)$/, n => `+${n[0]} do dwóch atrybutów.`, ['attr']],
  [/^(\d+)% increased Movement Speed$/, n => `+${n[0]}% szybkości biegania. Na butach praktycznie obowiązkowe.`, ['move']],
  [/^(\d+)% increased Attack Speed$/, n => `+${n[0]}% szybkości ataku. Więcej DPS dla ataków; czarom nic nie daje.`, ['attack']],
  [/^(\d+)% increased Cast Speed$/, n => `+${n[0]}% szybkości rzucania czarów. Atakom nic nie daje.`, ['spell']],
  [/^Adds (\d+) to (\d+) (Physical|Fire|Cold|Lightning|Chaos) Damage to Attacks$/, (n, m) => `Dodaje ${n[0]}–${n[1]} obrażeń ${ELPL[EL[m[3]]]} do ataków. Tylko dla ataków.`, ['attack', 'el']],
  [/^Adds (\d+) to (\d+) (Physical|Fire|Cold|Lightning|Chaos) Damage to Spells$/, (n, m) => `Dodaje ${n[0]}–${n[1]} obrażeń ${ELPL[EL[m[3]]]} do czarów. Tylko dla czarów.`, ['spell', 'el']],
  [/^Adds (\d+) to (\d+) (Physical|Fire|Cold|Lightning|Chaos) Damage$/, (n, m) => `Broń zadaje dodatkowo ${n[0]}–${n[1]} obrażeń ${ELPL[EL[m[3]]]}. Liczy się dla ataków tą bronią.`, ['attack', 'el']],
  [/^(\d+)% increased Physical Damage$/, n => `+${n[0]}% obrażeń fizycznych broni. Główny mod broni do ataków.`, ['attack', 'phys']],
  [/^(\d+)% increased Spell Damage$/, n => `+${n[0]}% obrażeń czarów.`, ['spell']],
  [/^(\d+)% increased Elemental Damage with Attack Skills$/, n => `+${n[0]}% obrażeń żywiołów ataków.`, ['attack', 'ele']],
  [/^(\d+)% increased (Fire|Cold|Lightning|Chaos|Elemental) Damage$/, (n, m) => `+${n[0]}% obrażeń ${m[2] === 'Elemental' ? 'od żywiołów' : ELPL[EL[m[2]]]}.`, ['elx']],
  [/^(\d+)% increased (Global )?Critical Strike Chance( for Spells)?$/, (n, m) => `+${n[0]}% szansy na kryt${m[3] ? ' czarami' : ''}. Ważne tylko w buildzie na krytach.`, ['crit']],
  [/^\+(\d+)% to (Global )?Critical Strike Multiplier( for Spells)?$/, n => `+${n[0]}% siły krytów. Przydatne, gdy często krytujesz.`, ['crit']],
  [/^\+(\d+) to Level of all (\w+)? ?(Spell |Minion |Physical |Fire |Cold |Lightning |Chaos |Skill )?Skill Gems$/, (n, m) => `+${n[0]} do poziomu gemów${m[0].includes('Minion') ? ' minionów' : m[0].includes('Spell') ? ' czarów' : ''}. Bardzo mocny mod.`, ['gemlvl']],
  [/^(\d+)% increased Damage over Time$/, n => `+${n[0]}% obrażeń z czasem (DoT).`, ['dot']],
  [/^\+(\d+)% to (\w+ )?Damage over Time Multiplier$/, n => `+${n[0]}% mnożnika DoT. Najmocniejszy mod dla buildów DoT.`, ['dot']],
  [/^Minions deal (\d+)% increased Damage$/, n => `Miniony zadają +${n[0]}% obrażeń.`, ['minion']],
  [/^Minions have (\d+)% increased maximum Life$/, n => `Miniony mają +${n[0]}% życia.`, ['minion']],
  [/^(\d+)% increased Armour$/, n => `+${n[0]}% pancerza: mniej obrażeń fizycznych z trafień.`, ['def']],
  [/^\+(\d+) to Armour$/, n => `+${n[0]} pancerza.`, ['def']],
  [/^(\d+)% increased Evasion Rating$/, n => `+${n[0]}% uniku: większa szansa, że atak cię nie trafi.`, ['def']],
  [/^\+(\d+) to Evasion Rating$/, n => `+${n[0]} uniku.`, ['def']],
  [/^\+?(\d+)% chance to Suppress Spell Damage$/, n => `+${n[0]}% szansy na stłumienie czarów (połowa obrażeń z czaru). Buildy zręcznościowe celują w 100%.`, ['def']],
  [/^\+?(\d+)% (to )?(Chance to Block|chance to Block)/, n => `+${n[0]}% szansy na blok.`, ['def']],
  [/^Regenerate ([\d.]+) Life per second$/, n => `Regeneracja ${n[0]} życia na sekundę.`, ['life']],
  [/^([\d.]+)% of (Physical )?Attack Damage Leeched as Life$/, n => `${n[0]}% obrażeń z ataków wraca jako życie (leech).`, ['attack']],
  [/^Gain (\d+) Life per Enemy Hit with Attacks$/, n => `+${n[0]} życia za każde trafienie atakiem.`, ['attack']],
  [/^(\d+)% increased Mana Regeneration Rate$/, n => `+${n[0]}% regeneracji many.`, ['mana']],
  [/^Regenerate ([\d.]+) Mana per second$/, n => `Regeneracja ${n[0]} many na sekundę.`, ['mana']],
  [/^\+(\d+) to Accuracy Rating$/, n => `+${n[0]} celności: mniej pudeł atakami.`, ['attack']],
  [/^(\d+)% increased Rarity of Items found$/, n => `+${n[0]}% rarity: lepszy loot. Nie zwiększa siły postaci.`, ['util']],
  [/^(\d+)% increased Projectile Speed$/, n => `Pociski lecą o ${n[0]}% szybciej.`, ['util']],
  [/^(\d+)% increased Area of Effect$/, n => `+${n[0]}% obszaru działania skilli.`, ['util']],
  [/^(\d+)% increased Stun and Block Recovery$/, n => `Szybsze otrząsanie się ze stuna. Mało ważne.`, ['weak']],
  [/^(\d+)% increased Light Radius$/, n => `Większy promień światła. Bez znaczenia.`, ['weak']],
  [/^(\d+)% reduced Attribute Requirements$/, n => `Mniejsze wymagania atrybutów. Mało ważne.`, ['weak']],
  [/^Reflects (\d+) Physical Damage to Melee Attackers$/, n => `Odbija ${n[0]} obrażeń. Bez znaczenia.`, ['weak']],
  [/^(\d+)% increased Flask/, n => `Wzmocnienie flasek.`, ['util']],
  [/^(\d+)% increased (Fire|Cold|Lightning) Damage with Attack Skills$/, (n, m) => `+${n[0]}% obrażeń ${ELPL[EL[m[2]]]} ataków.`, ['attack', 'elx']],
];

function profileVerdict(tags, m, p) {
  const type = p.type || '', def = p.defense || '', el = p.element || '';
  const t = new Set(tags);
  if (t.has('weak')) return 'bad';
  if (t.has('res') || t.has('move') || t.has('gemlvl') || t.has('def')) return 'good';
  if (t.has('life')) return !def || def === 'life' || def === 'hybrid' ? 'good' : 'bad';
  if (t.has('es')) return !def ? 'mid' : def === 'es' || def === 'hybrid' ? 'good' : 'bad';
  if (t.has('attack')) {
    if (!type) return 'mid';
    if (type !== 'attack') return 'bad';
    if (t.has('el') && el) { const mm = m && /(Physical|Fire|Cold|Lightning|Chaos)/.exec(m[0]); if (mm && EL[mm[1]] !== el) return 'mid'; }
    return 'good';
  }
  if (t.has('spell')) return !type ? 'mid' : type === 'spell' ? 'good' : 'bad';
  if (t.has('minion')) return !type ? 'mid' : type === 'minion' ? 'good' : 'bad';
  if (t.has('dot')) return !type ? 'mid' : type === 'dot' ? 'good' : 'bad';
  if (t.has('crit')) return type === 'dot' || type === 'minion' ? 'bad' : 'mid';
  if (t.has('elx')) { const mm = m && /(Fire|Cold|Lightning|Chaos)/.exec(m[0]); if (el && mm) return EL[mm[1]] === el ? 'good' : 'bad'; return 'mid'; }
  return 'mid';
}

function explainMods(mods, profile = {}) {
  return mods.map(mod => {
    for (const [re, fn, tags] of RULES) {
      const m = mod.text.match(re);
      if (!m) continue;
      const nums = m.slice(1).filter(x => x !== undefined && /^[\d.]+$/.test(x)).map(Number);
      return { text: mod.text, type: mod.type, pl: fn(nums, m), verdict: profileVerdict(tags, m, profile) };
    }
    return { text: mod.text, type: mod.type, pl: null, verdict: 'mid' };
  });
}

module.exports = { explainMods, RULES };
