'use strict';
// Sprawdza GitHub Releases i pobiera nowy app.asar do folderu danych.
// Nowa wersja włącza się po ponownym uruchomieniu nakładki.
const path = require('path');
let ofs; try { ofs = require('original-fs'); } catch { ofs = require('fs'); } // poza Electronem (testy)

function cmp(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
  return 0;
}

class Updater {
  constructor({ repo, current, base, dir, fetch, onReady }) {
    this.base = base;
    this.repo = repo; this.current = current; this.dir = dir; this.fetch = fetch; this.onReady = onReady;
    this.status = { state: 'idle', version: current };
    ofs.mkdirSync(dir, { recursive: true });
  }

  // Wydania leżą w repozytorium jako pliki: release/version.json i release/app.asar.
  raw(file) { return `https://raw.githubusercontent.com/${this.repo}/main/release/${file}?t=${Date.now()}`; }

  async check() {
    if (!this.repo) { this.status = { state: 'off', version: this.current }; return this.status; }
    try {
      this.status = { state: 'checking', version: this.current };
      const res = await this.fetch(this.raw('version.json'), { headers: { 'User-Agent': 'PoE-Nakladka', 'Cache-Control': 'no-cache' } });
      if (res.status === 404) { this.status = { state: 'latest', version: this.current }; return this.status; }
      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      const rel = await res.json();
      const latest = String(rel.version || '').replace(/^v/, '');
      if (!latest || cmp(latest, this.current) <= 0) { this.status = { state: 'latest', version: this.current }; return this.status; }
      if (rel.minBase && cmp(rel.minBase, this.base || '0.0.0') > 0) {
        this.status = { state: 'manual', version: this.current, latest, notes: rel.notes || '' };
        return this.status;
      }
      const target = path.join(this.dir, `app-${latest}.asar`);
      if (!ofs.existsSync(target)) {
        this.status = { state: 'downloading', version: this.current, latest };
        const bin = await this.fetch(this.raw('app.asar'), { headers: { 'User-Agent': 'PoE-Nakladka' } });
        if (!bin.ok) throw new Error(`pobieranie ${bin.status}`);
        const buf = Buffer.from(await bin.arrayBuffer());
        if (buf.length < 10000 || (rel.size && buf.length !== rel.size)) throw new Error('plik aktualizacji jest niepełny, spróbuję później');
        ofs.writeFileSync(target + '.tmp', buf);
        ofs.renameSync(target + '.tmp', target);
      }
      this.cleanup(latest);
      this.status = { state: 'ready', version: this.current, latest, notes: rel.notes || '' };
      this.onReady && this.onReady(this.status);
    } catch (e) {
      this.status = { state: 'error', version: this.current, error: e.message };
    }
    return this.status;
  }

  cleanup(keep) {
    try {
      for (const f of ofs.readdirSync(this.dir)) {
        const m = f.match(/^app-(\d+\.\d+\.\d+)\.asar(\.tmp)?$/);
        if (m && (m[2] || (m[1] !== keep && m[1] !== this.current))) ofs.rmSync(path.join(this.dir, f), { force: true });
      }
    } catch { /* */ }
  }
}

module.exports = { Updater, cmp };
