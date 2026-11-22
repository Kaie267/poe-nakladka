'use strict';
// Poradniki w oknie nakładki. Rdzeń mechanik PoE1 (stabilny od lat) + zmiany z 3.30.
window.GUIDES = [
  { id: 'craft', name: 'Crafting', html: `
<h2>Crafting — od czego zacząć</h2>
<p>Crafting to robienie przedmiotu walutą zamiast szukania go na trade. Na start opłaca się głównie przy prostych przedmiotach (buty z ruchem i resami, pas z życiem). Drogie przedmioty zwykle taniej kupić gotowe.</p>
<h3>Co robi która waluta</h3>
<table class="gt">
<tr><td>Orb of Transmutation</td><td>zwykły (biały) → magiczny (niebieski)</td></tr>
<tr><td>Orb of Alteration</td><td>losuje mody magicznego od nowa — główne narzędzie „alt-spamu”</td></tr>
<tr><td>Orb of Augmentation</td><td>dodaje mod do magicznego, który ma tylko jeden</td></tr>
<tr><td>Regal Orb</td><td>magiczny → rare, zostawia mody i dodaje jeden</td></tr>
<tr><td>Orb of Alchemy</td><td>zwykły → rare z losowymi modami</td></tr>
<tr><td>Chaos Orb</td><td>losuje wszystkie mody rare od nowa</td></tr>
<tr><td>Exalted Orb</td><td>dodaje losowy mod do rare (jeśli jest wolne miejsce)</td></tr>
<tr><td>Orb of Annulment</td><td>usuwa losowy mod</td></tr>
<tr><td>Divine Orb</td><td>losuje <b>wartości</b> modów (np. 80 życia → 95), nie same mody</td></tr>
<tr><td>Orb of Scouring</td><td>czyści przedmiot do zwykłego</td></tr>
<tr><td>Blessed Orb</td><td>losuje wartości implicitów</td></tr>
<tr><td>Vaal Orb</td><td>korumpuje — losowy efekt, potem przedmiotu nie da się zmienić</td></tr>
<tr><td>Chromatic / Jeweller's / Fusing</td><td>kolory gniazd / liczba gniazd / linki</td></tr>
</table>
<h3>Prosty przepis na dobry przedmiot</h3>
<ol>
<li><b>Baza</b>: właściwy typ (np. buty pod twoją obronę) i wysoki <b>item level</b> — od niego zależą najwyższe tiery modów.</li>
<li><b>Alt-spam</b>: Transmutation, potem Alteration, aż wypadną 1–2 mody, na których ci zależy (Augmentation dodaje drugi).</li>
<li><b>Regal</b>: robi z tego rare i dodaje trzeci mod.</li>
<li><b>Crafting bench</b> w hideoucie: dopisujesz mod, którego brakuje (np. res albo życie) w wolne miejsce prefixu lub suffixu.</li>
<li>Jeśli wyjdzie słabo: Annulment albo Scouring i od nowa. Zanim zaczniesz, sprawdź na trade, czy gotowy przedmiot nie jest tańszy niż waluta, którą wydasz.</li>
</ol>
<h3>Prefixy i suffixy</h3>
<p>Rare ma najwyżej 3 prefixy i 3 suffixy. Prefixy to zwykle życie, ES, obrażenia płaskie, pancerz/unik. Suffixy to resy, atrybuty, szybkość ataku i czarów, kryt. Gdy wszystkie miejsca danego typu są zajęte, bench nie dopisze moda tego typu. Typ modu i jego tier pokażą ci <b>Ctrl+Alt+D</b> w nakładce.</p>
<h3>Esencje i inne narzędzia</h3>
<ul>
<li><b>Esencja</b> robi rare z gwarantowanym jednym modem (np. życie) — świetne pod konkretny mod.</li>
<li><b>Metacrafty</b> na benchu („Prefixes/Suffixes Cannot Be Changed”) chronią połowę modów przy Chaos/Annulment — technika na droższe przedmioty.</li>
<li>Zanim wydasz dużo waluty, zasymuluj crafting w <b>Craft of Exile</b> (link w okienku wyceny).</li>
</ul>
<p class="warn">3.30 przebudowało generowanie przedmiotów. Opisane tu podstawy działają, ale ceny i opłacalność niektórych metod mogły się zmienić.</p>` },

  { id: 'obrona', name: 'Obrona', html: `
<h2>Obrona — lista kontrolna</h2>
<p>Większość śmierci to brak obrony, a nie za mało DPS. Sprawdzaj w tej kolejności:</p>
<ol>
<li><b>Odporności 75%</b> na ogień, zimno i błyskawice. Po Akcie 5 i 10 tracisz po 30% (razem −60%), więc na mapach musisz je nadrobić sprzętem. Trochę nadmiaru (overcap) chroni przed klątwami i modami map.</li>
<li><b>Chaos res</b>: na mapach startujesz od −60%. Na początek wystarczy cokolwiek na plusie, później 30%+.</li>
<li><b>Życie (albo ES)</b>: orientacyjnie ok. 3000 na wejście na mapy, 4500–6000+ na trudniejszych.</li>
<li><b>Freeze</b>: musisz być odporny (flaska z immunity albo pantheon), inaczej giniesz zamrożony.</li>
<li><b>Bleed i inne ailmenty</b>: flaski z modami usuwającymi bleed/ignite/shock.</li>
<li><b>Druga warstwa</b>: pancerz (na fizyczne trafienia), unik (na ataki), spell suppression (na czary), blok.</li>
<li><b>Odzyskiwanie życia</b>: regeneracja, leech albo life on hit. Obrona bez odzyskiwania tylko odkłada śmierć.</li>
<li><b>Pantheon</b>: wybierz i ulepszaj — darmowe zabezpieczenia.</li>
</ol>
<table class="gt">
<tr><th>Objaw</th><th>Prawdopodobnie</th><th>Co poprawić</th></tr>
<tr><td>nagły one-shot od żywiołów</td><td>brak 75% resów</td><td>resy, Purity, flaski res</td></tr>
<tr><td>śmierć od fizycznego slamu</td><td>mało życia / pancerza</td><td>życie, pancerz, Granite/Basalt</td></tr>
<tr><td>zamrożony i martwy</td><td>brak freeze immunity</td><td>flaska z immunity, pantheon</td></tr>
<tr><td>topnienie bez trafień</td><td>DoT, bleed, ziemia</td><td>regeneracja, immunity, ruch</td></tr>
<tr><td>śmierć od dużego czaru</td><td>brak suppressa / mało eHP</td><td>suppress, ES, spell block</td></tr>
</table>` },

  { id: 'mapy', name: 'Mapy w 3.30', html: `
<h2>Mapowanie w 3.30</h2>
<ul>
<li><b>Scarabów już nie ma.</b> Główne mechaniki lig (Breach, Legion, Ritual itd.) nie pojawiają się same — dodajesz je <b>Threadami</b> w Map Device, do 8 na mapę. Stare scaraby zamieniły się w Thready.</li>
<li><b>Item Quantity zastąpiło Atlas Drops</b>: zwiększa drop map, Threadów, splinterów i zasobów lig.</li>
<li><b>Niezidentyfikowane mapy</b> dają +30% Atlas Drops.</li>
<li><b>Korupcja mapy</b> daje teraz implicit Item Rarity zamiast quantity.</li>
<li><b>Mirage</b> jest stałą mechaniką i może pojawić się w mapach.</li>
<li>Gold zależy od liczby zabitych potworów: duży pack size i rarity = więcej goldu.</li>
</ul>
<h3>Przed odpaleniem</h3>
<ol>
<li><b>Ctrl+D</b> na mapie: nakładka pokaże groźne mody i werdykt „Odpalaj / rolluj”.</li>
<li>Regex z zakładki <b>Regexy</b> wklej w stash, żeby od razu zobaczyć mapy bez groźnych modów.</li>
<li>Włącz <b>tryb liczenia</b> (Ctrl+Shift+K), żeby widzieć zysk na godzinę.</li>
</ol>` },

  { id: 'handel', name: 'Handel', html: `
<h2>Handel bez strat</h2>
<ul>
<li><b>Wystawiaj trochę poniżej rynku</b> — nakładka podpowiada cenę i kopiuje notkę ~price (sekcja „Wystaw” w okienku wyceny).</li>
<li><b>Merchant's Tab</b>: przedmioty sprzedają się same, nawet gdy jesteś offline (odbiór u Faustusa).</li>
<li><b>Waluta i karty</b>: handluj przez wymianę hurtową (Currency Exchange u Faustusa) — okienko wyceny pokazuje kursy i stany magazynów.</li>
<li><b>Przed akceptacją okna handlu</b> najedź na każdy przedmiot i sprawdź nazwę i liczbę (podmiany typu Chaos/Alchemy, za mały stack).</li>
<li><b>Ceny w divine vs chaos</b>: sprawdzaj kurs na górze okna nakładki, zanim się zgodzisz.</li>
<li><b>Za tanie oferty</b> to często pułapka (cena w innej walucie, gracz offline). Sortuj po cenie i patrz na czas wystawienia.</li>
</ul>` },

  { id: 'level', name: 'Levelowanie', html: `
<h2>Levelowanie — najważniejsze</h2>
<ul>
<li><b>Ruch</b>: buty z movement speed i skill ruchu (Flame Dash, Frostblink, Leap Slam…). Na vendorze szukaj frazą z zakładki Regexy.</li>
<li><b>Bandyci (Akt 2)</b>: najczęściej „Kill all” — 2 dodatkowe punkty pasywne.</li>
<li><b>Resy</b> sprawdzaj po Akcie 5 i 10 — wtedy spadają o 30%.</li>
<li><b>Labirynt</b>: Normal ok. 33 lvl, Cruel ok. 55, Merciless ok. 68 — po 2 punkty ascendancy.</li>
<li><b>Flaski</b>: przed mapami miej immunity na bleed i freeze.</li>
<li>Rób questy dające punkty pasywne. Poradnik kampanii pod <b>Ctrl+Shift+L</b> prowadzi krok po kroku.</li>
</ul>` },
];
