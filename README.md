# Nakładka PoE

Darmowa nakładka do Path of Exile 1: wycena przedmiotów (poe.ninja + trade z pilnowaniem limitów GGG), pomoc przy handlu, mody map, wartość wystawionych przedmiotów z siatką na stashu, poradnik kampanii, statystyki map, ściągi.

- `src/` — kod aplikacji (Electron)
- `release/` — aktualizacja pobierana automatycznie przez nakładkę (`version.json` + `app.asar`)
- `tools/build-guide.js` — generuje `src/data/guide.json` z trasy [exile-leveling](https://github.com/HeartofPhos/exile-leveling) (MIT)

Budowanie: `npm i`, `npm test`, `npm run build`.
