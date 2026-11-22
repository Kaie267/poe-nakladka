'use strict';
// Doradca craftu: na podstawie tekstu przedmiotu (Ctrl+C / Ctrl+Alt+C) podpowiada, co i jak najlepiej craftować.
const { parseItem } = require('./parser');
const { explainMods } = require('./modexplain');

// Przybliżony podział modów na prefixy i suffixy (gdy tekst nie ma informacji z Ctrl+Alt+C).
const PREFIX = [/to maximum Life$/, /increased maximum Life$/, /to maximum Energy Shield$/, /increased (maximum )?Energy Shield$/, /to maximum Mana$/,
  /increased Armour/, /to Armour$/, /increased Evasion/, /to Evasion Rating$/, /^Adds \d+ to \d+/, /increased Physical Damage$/, /increased Spell Damage$/,
  /increased Movement Speed$/, /increased (Fire|Cold|Lightning|Elemental) Damage/, /Damage over Time Multiplier/, /Level of all/, /Leeched as Life/];
const SUFFIX = [/Resistances?$/, /to (Strength|Dexterity|Intelligence|all Attributes)/, /increased Attack Speed$/, /increased Cast Speed$/, /Critical Strike/,
  /Suppress Spell Damage$/, /Accuracy Rating$/, /Stun and Block Recovery$/, /Light Radius$/, /Life per Enemy Hit/, /Mana Regeneration Rate$/, /Regenerate [\d.]+ Life/,
  /Rarity of Items/, /Projectile Speed$/, /reduced Attribute Requirements/];

const ARMOUR = ['Helmets', 'Body Armours', 'Gloves', 'Boots', 'Shields'];
const JEWEL = ['Rings', 'Amulets', 'Belts'];

function affixOf(mod) {
  if (mod.type !== 'explicit' && mod.type !== 'crafted' && mod.type !== 'fractured') return null;
  if (mod.affix === 'prefix' || mod.affix === 'suffix') return mod.affix;
  if (PREFIX.some(r => r.test(mod.text))) return 'prefix';
  if (SUFFIX.some(r => r.test(mod.text))) return 'suffix';
  return null;
}

function advise(text, profile = {}) {
  const it = parseItem(text);
  if (!it) return { error: 'To nie wygląda na przedmiot z PoE. Najedź na przedmiot w grze, wciśnij Ctrl+C (albo Ctrl+Alt+C — wtedy rada jest dokładniejsza) i wklej tutaj.' };
  if (['Currency', 'Divination Card', 'Gem'].includes(it.rarity) || it.isMap) return { item: it, steps: [{ t: 'Tego nie craftuje się w ten sposób', d: 'Doradca obsługuje ekwipunek (broń, pancerze, biżuterię, jewele). Dla map użyj Ctrl+D w grze — nakładka oceni mody.' }], mods: [] };

  const ex = explainMods(it.mods, profile);
  const mods = it.mods.map((m, i) => ({ ...m, side: affixOf(m), verdict: ex[i].verdict, pl: ex[i].pl }));
  const explicit = mods.filter(m => m.side);
  const pre = explicit.filter(m => m.side === 'prefix').length;
  const suf = explicit.filter(m => m.side === 'suffix').length;
  const crafted = mods.some(m => m.type === 'crafted');
  const good = explicit.filter(m => m.verdict === 'good').length;
  const bad = explicit.filter(m => m.verdict === 'bad').length;
  const has = re => mods.some(m => re.test(m.text));
  const cls = it.itemClass || '';
  const max = it.rarity === 'Magic' ? 1 : it.rarity === 'Rare' ? 3 : 0;
  const openPre = Math.max(0, max - pre), openSuf = Math.max(0, max - suf);
  const steps = [];
  const exact = it.mods.some(m => m.affix);

  if (it.corrupted) {
    steps.push({ t: 'Przedmiot jest skorumpowany', d: 'Nie da się go już zmienić walutą ani benchem. Używaj albo sprzedaj (sprawdź cenę Ctrl+D w grze).' });
    return { item: it, mods, steps, summary: { pre, suf, openPre, openSuf, exact } };
  }
  if (it.mirrored) {
    steps.push({ t: 'Kopia lustrzana', d: 'Mirrored przedmiotów nie można modyfikować.' });
    return { item: it, mods, steps, summary: { pre, suf, openPre, openSuf, exact } };
  }
  if (it.rarity === 'Unique') {
    steps.push({ t: 'Unikat', d: 'Unikatów nie craftuje się zwykłą walutą. Możesz poprawić wartości Divine Orbem (jeśli roll jest słaby), dodać quality albo zaryzykować Vaal Orb (korupcja — losowo, nieodwracalnie).' });
    return { item: it, mods, steps, summary: {} };
  }

  const baseNote = it.ilvl ? (it.ilvl >= 84 ? `ilvl ${it.ilvl} — odblokowuje najwyższe tiery większości modów.` : it.ilvl >= 75 ? `ilvl ${it.ilvl} — dobra baza na mapy, ale najwyższe tiery części modów wymagają wyższego ilvl.` : `ilvl ${it.ilvl} — niski; na endgame lepiej szukać bazy z wyższym ilvl.`) : '';

  if (it.rarity === 'Normal') {
    steps.push({ t: '1. Biała baza — wybierz metodę', d: `${baseNote} Najtańsza droga: Orb of Transmutation, potem Orb of Alteration aż wypadną mody, których szukasz (alt-spam). Jeśli chcesz mieć gwarantowany konkretny mod (np. życie), użyj esencji — da od razu rare z tym modem.` });
    if (ARMOUR.includes(cls) || JEWEL.includes(cls)) steps.push({ t: '2. Potem', d: 'Gdy magiczny ma 1–2 dobre mody: Regal Orb (zrobi rare), a w wolne miejsce dopisz brakujący mod na benchu (res albo życie).' });
    if (it.influences.length) steps.push({ t: 'Influence', d: `Baza ${it.influences.join(', ')} — może dostać specjalne mody influence. Nie sprzedawaj jej za grosze, sprawdź samą bazę na trade.` });
  } else if (it.rarity === 'Magic') {
    if (good >= 2) steps.push({ t: '1. Regal Orb', d: 'Masz dwa przydatne mody — Regal zrobi rare i doda trzeci mod. Potem uzupełnij benchem.' });
    else if (good === 1 && explicit.length === 1) steps.push({ t: '1. Orb of Augmentation', d: 'Jeden dobry mod i wolne miejsce — Augmentation doda drugi. Jeśli wypadnie dobry, Regal.' });
    else steps.push({ t: '1. Orb of Alteration', d: 'Mody nie pasują do twojego buildu — losuj dalej Alteration (tanio), aż trafisz przydatne.' });
  } else if (it.rarity === 'Rare') {
    if (bad >= 2 && good <= 1) steps.push({ t: '1. Zacznij od nowa', d: 'Większość modów nie pasuje do buildu. Orb of Scouring + alt-spam albo Chaos Orb. Przy droższej bazie najpierw sprawdź, czy taniej nie kupić gotowego.' });
    if (openSuf > 0 && !has(/Resistance/) ) steps.push({ t: 'Bench: odporność', d: `Masz wolny suffix (${openSuf}). Dopisz res na benchu w hideoucie — najtańszy sposób na załatanie resów.` });
    if (openPre > 0 && !has(/maximum Life$/) && (profile.defense !== 'es')) steps.push({ t: 'Bench: życie', d: `Masz wolny prefix (${openPre}). Dopisz „+# to maximum Life” na benchu.` });
    if (openPre > 0 && cls === 'Boots' && !has(/Movement Speed/)) steps.push({ t: 'Bench: ruch na butach', d: 'Buty bez movement speed — to pierwsze, co warto dopisać w wolny prefix.' });
    if (openPre === 0 && openSuf === 0) steps.push({ t: 'Przedmiot pełny', d: crafted ? 'Wszystkie miejsca zajęte, w tym crafted mod. Możesz go podmienić na benchu na lepszy, albo zostawić.' : 'Brak wolnych miejsc. Słaby mod usuniesz Orb of Annulment (losowo!) — opłaca się tylko, gdy reszta modów jest bardzo dobra.' });
    if (good >= 3 && (openPre > 0 || openSuf > 0)) steps.push({ t: 'Dobry przedmiot', d: 'Masz już 3+ przydatne mody. Zanim zaryzykujesz Exalted Orb, dopisz mod benchem — to pewne. Exalt dodaje losowy mod.' });
    if (good >= 4) steps.push({ t: 'Divine Orb', d: 'Gdy mody są dobre, ale wartości niskie, Divine Orb losuje ich wartości (nie zmienia samych modów).' });
  }
  if (!exact && explicit.length) steps.push({ t: 'Dokładniej z Ctrl+Alt+C', d: 'Podział prefix/suffix jest szacowany. Skopiuj przedmiot w grze przez Ctrl+Alt+C — wtedy widać tiery i dokładny typ każdego modu.' });
  if (baseNote && it.rarity !== 'Normal') steps.push({ t: 'Baza', d: baseNote });
  return { item: it, mods, steps, summary: { pre, suf, openPre, openSuf, max, exact } };
}

module.exports = { advise, affixOf };
