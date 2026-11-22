'use strict';
// Śledzi Client.txt gry: szepty od kupujących, wejścia do lokacji, dołączanie graczy.
const fs = require('fs');
const { EventEmitter } = require('events');

const RE = {
  from: /\] @From (?:<[^>]*> )?([^:]+): (.+)$/,
  to: /\] @To (?:<[^>]*> )?([^:]+): (.+)$/,
  joined: /\] : (\S+) has joined the area\.$/,
  left: /\] : (\S+) has left the area\.$/,
  entered: /\] : You have entered (.+)\.$/,
  accepted: /\] : Trade accepted\.$/,
  cancelled: /\] : Trade cancelled\.$/,
};
const BUY = /^Hi, I(?:'d| would) like to buy your (.+?) listed for ([\d.,]+) (.+?) in (.+)$/;
const STASH = /^(.+?) \(stash tab "(.*?)"; position: left (\d+), top (\d+)\)\.?\s*(.*)$/;
const BULK = /^Hi, I'd like to buy your ([\d.,]+) (.+?) for my ([\d.,]+) (.+?) in (.+?)\.(?:\s(.*))?$/;

function parseTrade(msg) {
  let m = msg.match(BUY);
  if (m) {
    const rest = m[4];
    const st = rest.match(STASH);
    if (st) return { item: m[1], amount: m[2], currency: m[3], league: st[1], tab: st[2], left: +st[3], top: +st[4], note: st[5] || '' };
    return { item: m[1], amount: m[2], currency: m[3], league: rest.replace(/\.$/, ''), tab: null, left: null, top: null, note: '' };
  }
  m = msg.match(BULK);
  if (m) return { item: `${m[1]} ${m[2]}`, amount: m[3], currency: m[4], league: m[5], tab: null, left: null, top: null, note: m[6] || '' };
  return null;
}

function parseLine(line) {
  let m;
  if ((m = line.match(RE.from))) return { kind: 'from', name: m[1].trim(), text: m[2], trade: parseTrade(m[2]) };
  if ((m = line.match(RE.to))) return { kind: 'to', name: m[1].trim(), text: m[2], trade: parseTrade(m[2]) };
  if ((m = line.match(RE.joined))) return { kind: 'joined', name: m[1] };
  if ((m = line.match(RE.left))) return { kind: 'left', name: m[1] };
  if ((m = line.match(RE.entered))) return { kind: 'entered', area: m[1] };
  if (RE.accepted.test(line)) return { kind: 'accepted' };
  if (RE.cancelled.test(line)) return { kind: 'cancelled' };
  return null;
}

class LogWatch extends EventEmitter {
  start(file) {
    this.stop();
    this.file = file;
    if (!file) return;
    try { this.pos = fs.statSync(file).size; } catch { this.pos = 0; this.emit('error', new Error('Nie znaleziono Client.txt')); }
    this.timer = setInterval(() => this.tick(), 500);
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  tick() {
    let size;
    try { size = fs.statSync(this.file).size; } catch { return; }
    if (size < this.pos) this.pos = 0; // plik wyczyszczony
    if (size === this.pos) return;
    const len = Math.min(size - this.pos, 1024 * 1024);
    const buf = Buffer.alloc(len);
    const fd = fs.openSync(this.file, 'r');
    try { fs.readSync(fd, buf, 0, len, this.pos); } finally { fs.closeSync(fd); }
    this.pos += len;
    for (const line of buf.toString('utf8').split(/\r?\n/)) {
      const ev = line && parseLine(line);
      if (ev) this.emit('event', ev);
    }
  }
}

module.exports = { LogWatch, parseLine, parseTrade };
