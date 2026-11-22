'use strict';
// Start aplikacji. Jeśli w folderze danych leży nowsza wersja kodu (pobrana automatycznie
// z GitHub Releases jako app-X.Y.Z.asar), uruchamiamy ją zamiast wersji z instalacji.
// Dzięki temu aktualizacja to ok. 300 KB, a nie cały program.
const { app } = require('electron');
const path = require('path');
const ofs = require('original-fs');

const baseVersion = require('./package.json').version;
const cmp = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
  return 0;
};

let root = __dirname;
let version = baseVersion;
try {
  const dir = path.join(app.getPath('userData'), 'aktualizacje');
  const found = ofs.readdirSync(dir)
    .map(f => (f.match(/^app-(\d+\.\d+\.\d+)\.asar$/) || [])[1])
    .filter(Boolean)
    .sort(cmp);
  const best = found[found.length - 1];
  const failed = (() => { try { return ofs.readFileSync(path.join(dir, 'nieudana.txt'), 'utf8').trim(); } catch { return ''; } })();
  if (best && cmp(best, baseVersion) > 0 && best !== failed) {
    root = path.join(dir, `app-${best}.asar`);
    version = best;
  }
} catch { /* brak aktualizacji */ }

global.__nakladka = { root, version, baseVersion };
try {
  require(path.join(root, 'src', 'main.js'));
} catch (e) {
  if (root !== __dirname) {
    try { ofs.writeFileSync(path.join(app.getPath('userData'), 'aktualizacje', 'nieudana.txt'), version); } catch { /* */ }
    global.__nakladka = { root: __dirname, version: baseVersion, baseVersion };
    require(path.join(__dirname, 'src', 'main.js'));
  } else throw e;
}
