'use strict';
// Wbudowane ściągi. Treść z publicznych tabel społeczności (poewiki, poedb, poe-vault) — skrócona i przetłumaczona.
window.BUILTIN_SHEETS = [
  {
    name: 'Betrayal',
    html: `
<h2>Betrayal — nagrody w safehouse</h2>
<p class="warn">Tabela z wcześniejszych lig. W 3.30 usunięto scaraby, więc nagrody za <b>Intervention</b> na pewno się zmieniły, a reszta mogła — sprawdzaj w grze.</p>
<table class="sh">
<tr><th>Członek</th><th>Transportation</th><th>Fortification</th><th>Research</th></tr>
<tr><td>Aisling</td><td>bronie z 2 veiled modami</td><td>pancerze z 2 veiled modami</td><td class="g">bench: veiled mod</td></tr>
<tr><td>Cameria</td><td>uniki ligowe</td><td>Harbinger Orbs</td><td>sekstanty</td></tr>
<tr><td>Elreon</td><td>unikatowe bronie</td><td>unikatowe pancerze</td><td>unikatowa biżuteria i flaski</td></tr>
<tr><td>Gravicius</td><td class="g">pełny zestaw kart</td><td>losowe karty</td><td>skrzynia wymiany kart</td></tr>
<tr><td>Guff</td><td colspan="3">Tiny's Trial — skrzynie z walutą na czas (8/14/20 s)</td></tr>
<tr><td>Haku</td><td>losowe rare</td><td>strongbox</td><td>pancerze/bronie z quality</td></tr>
<tr><td>Hillock</td><td>bench: quality broni 24/26/28%</td><td>bench: quality pancerza</td><td>bench: quality flaski</td></tr>
<tr><td>It That Fled</td><td>splintery Breach</td><td>Abyss Jewels</td><td class="g">bench: Breachstone</td></tr>
<tr><td>Janus</td><td>waluta quality</td><td>shardy walut</td><td>Perandus Coins</td></tr>
<tr><td>Jorgin</td><td>rare talizmany</td><td>rare Aspect</td><td>bench: talizman</td></tr>
<tr><td>Korell</td><td>esencje</td><td>fragmenty Sacrifice/Shaper/Mortal</td><td>fossile</td></tr>
<tr><td>Leo</td><td>Silver Coins</td><td>losowa waluta</td><td>bench: Blessed/Divine/Exalt</td></tr>
<tr><td>Riker</td><td>skrzynia waluty na czas</td><td>skrzynia unikatów na czas</td><td>skrzynia rare lvl 100 na czas</td></tr>
<tr><td>Rin</td><td>normal mapy</td><td>rare mapy</td><td>unikatowa mapa</td></tr>
<tr><td>Tora</td><td>skrzynia na czas (waluta, karty, uniki, veiled rare)</td><td>enchanty z labu</td><td class="g">bench: XP gemu</td></tr>
<tr><td>Vagan</td><td class="g">splintery Legion</td><td>skrzynie Legion</td><td class="g">inkubatory</td></tr>
<tr><td>Vorici</td><td>gemy z quality</td><td>Jeweller/Chromatic/Fusing</td><td class="g">bench: białe gniazda</td></tr>
</table>
<p class="src">Zielone pola oznaczano w tabeli społeczności jako najlepsze nagrody.</p>`,
  },
  {
    name: 'Heist',
    html: `
<h2>Heist — łotrzykowie</h2>
<p class="warn">Od 3.27 łotrzyków nie trzeba już levelować w ich zawodach.</p>
<table class="sh">
<tr><th>Łotrzyk</th><th>Zawody</th><th>Bonus</th><th>Odblokowuje</th></tr>
<tr><td>Karst</td><td>Lockpicking</td><td>—</td><td>Huck</td></tr>
<tr><td>Huck</td><td>walka</td><td>+20% doświadczenia, wzmocnienia walki</td><td>Niles</td></tr>
<tr><td>Niles</td><td>Counter-Thaumaturgy, Deception</td><td>otwiera 1 magiczną skrzynię po lockdownie, dodatkowy blueprint reveal</td><td>Vinderi</td></tr>
<tr><td>Vinderi</td><td>Demolition, Trap Disarmament</td><td>szansa na podwojenie zawartości skrzyń, ale szybszy alert</td><td>Gianna</td></tr>
<tr><td>Gianna</td><td>Deception</td><td>tańsze blueprint reveale, dodatkowy reveal</td><td>—</td></tr>
<tr><td>Tibbs</td><td>Brute Force</td><td>otwiera 1–2 mechaniczne skrzynie po lockdownie</td><td>Tullina</td></tr>
<tr><td>Tullina</td><td>Agility</td><td>dodatkowe cele w ukrytych pokojach, wolniejszy alert</td><td>Nenet</td></tr>
<tr><td>Nenet</td><td>Perception</td><td>widzi patrole, wolniejszy alert</td><td>—</td></tr>
<tr><td>Isla</td><td>Engineering</td><td>więcej czasu do lockdownu</td><td>—</td></tr>
</table>
<p class="src">Na start dostępni są Karst, Tibbs i Isla.</p>`,
  },
  {
    name: 'Incursion 3.30',
    html: `
<h2>Incursion — co nowego w 3.30</h2>
<ul>
<li><b>Atziri</b> jest teraz bossem Temple of Atzoatl zamiast Vaal Omnitecta.</li>
<li>Pokój <b>Cradle of Creation</b> w świątyni odblokowuje walkę z <b>Uber Atziri</b>.</li>
<li>Jest też <b>Uber Temple of Atzoatl</b> — trudniejsze pokoje i lepsze nagrody.</li>
<li>Modyfikatorów Architekta (Incursion Architect) nie zdobędziesz już ze zwykłych magicznych i rare przedmiotów.</li>
</ul>
<p class="warn">Świątynię mocno przebudowano, więc stare ściągi z pokojami mogą być nieaktualne.</p>`,
  },
];
