# Nakładka PoE

Darmowa nakładka do Path of Exile 1 (Windows, Electron). Automatyczne aktualizacje z tego repozytorium.

**Funkcje:** wycena (poe.ninja + trade z pilnowaniem limitów GGG, wymiana hurtowa), ocena modów pod build i porównanie z noszonym sprzętem (PoB), wystawianie z notką ~price, tiery modów, ocena i doradca map, doradca craftu, stash (wystawione zakładki, wykres, profile, siatka w grze), obserwowane z alertami, live search, generator regexów, loot filtr z cen poe.ninja, poradnik kampanii na trasie poe-leveling.com, labirynt dnia, ściągi i poradniki, statystyki map i zysku, historia handlu, profile postaci.

Zgodna z zasadami GGG: nie czyta pamięci gry, jeden klawisz = jedna akcja.

- `src/` — kod aplikacji · `release/` — automatyczna aktualizacja (`version.json` + `app.asar`)
- `tools/build-guide.js` — trasa wbudowanego poradnika z [exile-leveling](https://github.com/HeartofPhos/exile-leveling) (MIT)

Budowanie: `npm i`, `npm test`, `npm run build`.
