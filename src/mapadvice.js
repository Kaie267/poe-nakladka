'use strict';
// Doradca map: z tekstu mapy (Ctrl+C) ocenia ją i podpowiada, czym ją przygotować przed odpaleniem.
const { parseItem } = require('./parser');

function adviseMap(text, { danger = [], goal = { pack: 20, quant: 60 }, profile = {} } = {}) {
  const it = parseItem(text);
  if (!it) return { error: 'To nie wygląda na przedmiot z PoE. Najedź na mapę w grze, wciśnij Ctrl+C i wklej tutaj.' };
  if (!it.isMap) return { error: 'To nie jest mapa. Do ekwipunku użyj zakładki Doradca craftu.' };

  const pats = danger.map(p => p.toLowerCase());
  const mods = it.mods.map(m => ({ ...m, bad: pats.some(p => m.text.toLowerCase().includes(p)) }));
  const stat = re => (it.mapStats.find(s => re.test(s.label)) || {}).value || 0;
  const pack = stat(/Pack Size/), quant = Math.max(stat(/Item Quantity/), stat(/Atlas Drops/)), rar = stat(/Item Rarity/);
  const nBad = mods.filter(m => m.bad).length;
  const score = Math.max(0, Math.min(100, Math.round(pack / Math.max(1, goal.pack) * 45 + quant / Math.max(1, goal.quant) * 40 + rar / 100 * 15) - nBad * 40));
  const steps = [];
  const t = it.mapTier || 0;

  if (it.corrupted) {
    steps.push({ t: 'Mapa skorumpowana', d: nBad ? 'Ma groźne mody i nie da się jej zmienić. Odpal tylko, jeśli build je przejdzie, albo sprzedaj/odłóż.' : 'Nie da się jej już zmienić — odpalaj.' });
  } else if (it.unidentified) {
    steps.push({ t: 'Niezidentyfikowana — zostaw tak', d: 'W 3.30 niezidentyfikowane mapy dają +30% Atlas Drops. Odpal ją bez identyfikacji, jeśli twój build zwykle radzi sobie z losowymi modami.' });
  } else if (it.rarity === 'Normal') {
    steps.push({ t: '1. Orb of Alchemy', d: 'Najprostsze i najtańsze: alch robi rare z kilkoma modami (więcej potworów i lootu).' });
    steps.push({ t: '2. Sprawdź mody', d: 'Po alchu wciśnij Ctrl+D na mapie — nakładka pokaże groźne mody. Jeśli są: Chaos Orb (losuje od nowa) albo Scouring + Alchemy.' });
  } else if (it.rarity === 'Magic') {
    steps.push({ t: '1. Regal Orb albo Scouring + Alchemy', d: 'Magiczna mapa ma mało modów. Regal zrobi z niej rare i doda mod; taniej bywa Scouring i Alchemy.' });
  } else if (it.rarity === 'Rare') {
    if (nBad) steps.push({ t: '1. Przerolluj groźne mody', d: `Groźne mody (${nBad}): ${mods.filter(m => m.bad).map(m => m.text).join('; ')}. Użyj Chaos Orb, aż znikną (albo Scouring + Alchemy, gdy chaos jest drogi).` });
    else if (pack >= goal.pack && quant >= goal.quant) steps.push({ t: 'Dobra mapa — odpalaj', d: `Pack size ${pack}% i quant/Atlas Drops ${quant}% spełniają twoje progi. Teraz tylko dodaj Thready.` });
    else steps.push({ t: '1. Słabe statystyki — rolluj dalej', d: `Pack ${pack}% (cel ${goal.pack}%), quant/Atlas Drops ${quant}% (cel ${goal.quant}%). Chaos Orb losuje mody od nowa; przy tanim farmieniu można też odpalić jak jest.` });
    if (!nBad && score >= 60) steps.push({ t: 'Vaal Orb? Tylko z głową', d: 'Korupcja w 3.30 daje implicit Item Rarity +10–20% i może dodać mody, ale jest losowa i nieodwracalna. Opłaca się na dobrej mapie, gdy twój build przejdzie dodatkowe mody.' });
  } else if (it.rarity === 'Unique') {
    steps.push({ t: 'Unikatowa mapa', d: 'Ma stałe mody — można ją skorumpować Vaal Orbem dla dodatkowych modów, ale to losowe.' });
  }

  steps.push({ t: 'Thready (Map Device)', d: 'Mechaniki lig dodajesz Threadami — do 8 na mapę, więcej Threadów to też szansa na mocniejsze mody. Wybieraj te pod swoją strategię (np. Ritual, Breach, Legion) i porównaj ceny w okienku wyceny (Ctrl+D na Threadzie).' });
  if (t && t < 16) steps.push({ t: 'Tier mapy', d: `Tier ${t}. Wyższe tiery dają więcej lootu i zysku — jeśli build daje radę, kończ Atlas i farm T16.` });
  if (profile.type === 'minion' && mods.some(m => /Monsters (have|deal).*(Area|Damage)/i.test(m.text))) steps.push({ t: 'Uwaga dla minionów', d: 'Mody wzmacniające obrażenia potworów mocniej bolą buildy na minionach — sprawdź, czy miniony przeżyją.' });
  return { item: it, mods, stats: { pack, quant, rar }, score, nBad, steps };
}

module.exports = { adviseMap };
