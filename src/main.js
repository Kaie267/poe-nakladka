'use strict';
const { app, BrowserWindow, globalShortcut, clipboard, ipcMain, screen, Tray, Menu, nativeImage, session, shell, dialog, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { Settings } = require('./settings');
const { Keys } = require('./keys');
const { parseItem } = require('./parser');
const { Ninja } = require('./ninja');
const { Trade } = require('./trade');
const { LogWatch } = require('./logwatch');
const { Updater } = require('./updater');
const { Session } = require('./session');
const { scanListed, snapshotOf } = require('./stash');
const { decodePob } = require('./pob');
const { explainMods } = require('./modexplain');
const { compareItem, resGaps } = require('./compare');
const PL = require('./plinject');
const { advise } = require('./craftadvice');
const LF = require('./lootfilter');
const { adviseMap } = require('./mapadvice');

const PKG = require('../package.json');
const VERSION = (global.__nakladka && global.__nakladka.version) || PKG.version;
const UA = `PoE-Nakladka/${VERSION} (prywatne narzedzie gracza)`;
const UI = f => path.join(__dirname, 'ui', f);
const PRELOAD = path.join(__dirname, 'preload.js');

if (!app.requestSingleInstanceLock()) app.quit();

// Dziennik błędów — widoczny w zakładce Aktualizacje (łatwiej zgłosić problem).
const errLog = [];
function logErr(where, e) {
  const line = `${new Date().toLocaleString('pl-PL')} [${where}] ${(e && (e.stack || e.message)) || e}`;
  errLog.unshift(line.slice(0, 1200)); errLog.length = Math.min(errLog.length, 50);
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'bledy.log'), line + '\n'); } catch { /* */ }
}
process.on('uncaughtException', e => logErr('main', e));
process.on('unhandledRejection', e => logErr('promise', e));

let settings, keys, ninja, trade, logw, tray, updater, sess, guideData;
const W = {}; // okna
let hotkeysOn = false;
let currentItem = null;
let tradeSession;
let counting = { on: false, items: [], total: 0 };
let stashData = null;
let stashHistory = [];
let quitting = false;
const histFile = () => path.join(app.getPath('userData'), 'stash-historia.json');

const send = (win, ch, data) => { const w = W[win]; if (w && !w.isDestroyed()) w.webContents.send(ch, data); };

async function fetchJson(url) {
  const res = await tradeSession.fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function tradeRequest(method, url, body) {
  const headers = { 'User-Agent': UA, Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  const s = settings.get().poesessid;
  if (s) headers.Cookie = `POESESSID=${s}`;
  const res = await tradeSession.fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* np. strona Cloudflare */ }
  return { status: res.status, headers: res.headers, json };
}

// ---------- okna ----------
const base = { frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, show: false, resizable: false, hasShadow: false,
  webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false } };

function onTop(w) { w.setAlwaysOnTop(true, 'screen-saver'); return w; }

function createWindows() {
  const wa = screen.getPrimaryDisplay().workArea;
  const b = screen.getPrimaryDisplay().bounds;

  W.overlay = onTop(new BrowserWindow({ ...base, width: 420, height: 600 }));
  W.overlay.loadFile(UI('overlay.html'));
  W.overlay.on('blur', () => { if (!W.overlay.webContents.isDevToolsOpened()) W.overlay.hide(); });

  W.notify = onTop(new BrowserWindow({ ...base, width: 360, height: 420, x: wa.x + wa.width - 380, y: wa.y + 80 }));
  W.notify.setIgnoreMouseEvents(true, { forward: true });
  W.notify.loadFile(UI('notify.html'));
  W.notify.once('ready-to-show', () => W.notify.showInactive());

  W.guide = onTop(new BrowserWindow({ ...base, width: 430, height: 300, x: wa.x + 20, y: wa.y + 120 }));
  W.guide.setIgnoreMouseEvents(true, { forward: true });
  W.guide.loadFile(UI('guide.html'));
  W.guide.once('ready-to-show', () => { if (settings.get().guideVisible && !guideIsPL()) W.guide.showInactive(); });

  W.hud = onTop(new BrowserWindow({ ...base, width: 760, height: 34, x: Math.round(wa.x + wa.width / 2 - 380), y: wa.y + 4 }));
  W.hud.setIgnoreMouseEvents(true);
  W.hud.loadFile(UI('hud.html'));
  W.hud.once('ready-to-show', () => { if (settings.get().hudVisible) W.hud.showInactive(); });

  W.stash = onTop(new BrowserWindow({ ...base, x: b.x, y: b.y, width: b.width, height: b.height }));
  W.stash.setIgnoreMouseEvents(true, { forward: true });
  W.stash.loadFile(UI('stash.html'));
}

function openSettings(section) {
  if (W.settings && !W.settings.isDestroyed()) {
    W.settings.show(); W.settings.focus();
    if (section) send('settings', 'goto', section);
    return;
  }
  const wa = screen.getPrimaryDisplay().workArea;
  W.settings = new BrowserWindow({ width: Math.min(1040, wa.width - 40), height: Math.min(860, wa.height - 40), title: 'Nakładka PoE', autoHideMenuBar: true,
    backgroundColor: '#15140f', show: false, webPreferences: { preload: PRELOAD, contextIsolation: true } });
  W.settings.setAlwaysOnTop(true, 'floating');
  W.settings.loadFile(UI('settings.html'), section ? { hash: section } : undefined);
  W.settings.once('ready-to-show', () => { W.settings.show(); W.settings.focus(); });
  // Zamknięcie okna tylko je chowa — skrót otwiera je natychmiast i bez utraty stanu.
  W.settings.on('close', e => { if (!quitting) { e.preventDefault(); W.settings.hide(); } });
}

function toggleApp() {
  if (W.settings && !W.settings.isDestroyed() && W.settings.isVisible() && W.settings.isFocused()) W.settings.hide();
  else openSettings();
}

function toggleWebWindow(key, url, opts = {}) {
  const w = W[key];
  if (w && !w.isDestroyed()) {
    if (opts.forceUrl) { w.loadURL(opts.forceUrl); w.show(); w.focus(); return; }
    if (w.isVisible()) w.hide(); else { w.show(); w.focus(); }
    return;
  }
  W[key] = new BrowserWindow({ width: opts.width || 1200, height: opts.height || 860, x: opts.x, y: opts.y, title: opts.title, autoHideMenuBar: true,
    alwaysOnTop: true, webPreferences: { session: tradeSession } });
  W[key].setAlwaysOnTop(true, 'floating');
  W[key].loadURL(opts.forceUrl || url);
  W[key].webContents.setWindowOpenHandler(({ url: u }) => { shell.openExternal(u); return { action: 'deny' }; });
}

const marketUrl = () => `https://www.pathofexile.com/trade/search/${encodeURIComponent(settings.get().league)}`;
function toggleMarket(url) { toggleWebWindow('market', marketUrl(), { title: 'Market — pathofexile.com/trade', forceUrl: url }); }
function toggleLeveling() { togglePL(); }

function toggleSheets() {
  if (W.sheets && !W.sheets.isDestroyed()) { if (W.sheets.isVisible()) W.sheets.hide(); else { W.sheets.show(); W.sheets.focus(); } return; }
  W.sheets = onTop(new BrowserWindow({ ...base, frame: false, resizable: true, width: 720, height: 560, minWidth: 300, minHeight: 200 }));
  W.sheets.loadFile(UI('sheets.html'));
  W.sheets.once('ready-to-show', () => { applyLook(); W.sheets.show(); });
}

function placeOverlay() {
  const pt = screen.getCursorScreenPoint();
  const d = screen.getDisplayNearestPoint(pt).workArea;
  const [w, h] = W.overlay.getSize();
  let x = pt.x + 24; if (x + w > d.x + d.width) x = pt.x - w - 24;
  let y = pt.y - 60; y = Math.max(d.y, Math.min(y, d.y + d.height - h));
  W.overlay.setPosition(Math.round(x), Math.round(y));
}

// ---------- wycena ----------
async function readItemFromGame(advanced) {
  const prev = clipboard.readText();
  clipboard.writeText('');
  await keys.copyItem(advanced);
  let text = '';
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 25));
    text = clipboard.readText();
    if (text) break;
  }
  if (settings.get().restoreClipboard) setTimeout(() => clipboard.writeText(prev), 150);
  return text;
}

async function priceCheck(advanced, compact) {
  const text = await readItemFromGame(advanced);
  const item = parseItem(text);
  placeOverlay();
  W.overlay.showInactive();
  W.overlay.focus();
  watchClickOutside();
  if (!item) { send('overlay', 'item', { error: 'Nie rozpoznano przedmiotu. Najedź kursorem na przedmiot w grze i wciśnij skrót jeszcze raz.' }); return; }
  currentItem = item;
  currentExchange = null;
  const s = settings.get();
  const watched = (s.watch || []).some(w => w.name === item.name && w.baseType === item.baseType);
  const explained = s.explainMods && item.mods.length && !item.isMap ? explainMods(item.mods, s.buildProfile || {}) : null;
  const build = { items: s.buildItems, res: s.buildRes, profile: s.buildProfile };
  const isGearItem = !['Currency', 'Divination Card', 'Gem'].includes(item.rarity) && !item.isMap;
  const compare = isGearItem ? compareItem(item, build) : null;
  const gaps = resGaps(s.buildRes);
  const goodBase = isGearItem && item.rarity !== 'Unique' && item.ilvl >= 84 && (item.influences.length || item.fractured || item.synthesised || item.ilvl >= 86)
    ? [item.ilvl ? `ilvl ${item.ilvl}` : null, ...item.influences, item.fractured ? 'fractured' : null, item.synthesised ? 'synthesised' : null].filter(Boolean) : null;
  send('overlay', 'item', { item, threshold: s.vendorThreshold, mapDanger: s.mapDanger, mapGoal: s.mapGoal, counting: counting.on, tradeStatus: s.tradeStatus,
    league: s.league, compact: !!compact || !!s.priceCompact, watched, explained, profile: s.buildProfile, buildName: s.buildName, compare, gaps, goodBase, undercut: s.listUndercut ?? 5, autoCopy: s.autoCopyNote !== false });
  runPricing(item).catch(e => send('overlay', 'ninja', { error: e.message }));
}

async function runPricing(item) {
  const s = settings.get();
  ninja.setLeague(s.league);
  let res = null;
  try { res = await ninja.priceItem(item); } catch (e) { send('overlay', 'ninja', { error: 'poe.ninja: ' + e.message }); }
  const divine = await ninja.divinePrice();
  send('overlay', 'ninja', { result: res, divine, icons: await ninja.getIcons() });
  if (counting.on && res && res.price && res.price.chaos != null) addCount(item, res.price.chaos * (item.stack || 1));

  // Waluta, karty, fragmenty itp.: od razu oferty z wymiany hurtowej (jak w PoE Overlay).
  const tradeId = res && res.price && res.price.tradeId;
  if (tradeId && (item.rarity === 'Currency' || item.rarity === 'Divination Card') && s.autoExchange !== false) {
    currentExchange = { want: tradeId, have: tradeId === 'chaos' ? 'divine' : 'chaos' };
    doExchange({}).catch(() => {});
  }
  const isGear = !['Currency', 'Divination Card', 'Gem', 'Unique'].includes(item.rarity) && !item.isMap;
  if (isGear) {
    try {
      const filters = await trade.prepareFilters(item);
      send('overlay', 'filters', { filters });
      const baseOnlyPrice = res && res.price && res.price.baseOnly;
      if (s.autoTradeRares && (item.rarity === 'Rare' || (item.rarity === 'Magic' && !res))) await autoRareSearch(filters, s);
      else if (item.rarity === 'Normal' && !baseOnlyPrice && !res) await doTradeSearch({ filters: [], baseOnly: true, status: s.tradeStatus });
    } catch (e) { send('overlay', 'trade', { error: e.message }); }
  }
}

let currentExchange = null;
async function doExchange(opts) {
  if (!currentExchange) return;
  if (opts.have) currentExchange.have = opts.have;
  send('overlay', 'exchange', { loading: true });
  try {
    const r = await trade.exchange(currentExchange.want, currentExchange.have, { status: opts.status || settings.get().tradeStatus });
    send('overlay', 'exchange', { result: r, icons: await ninja.getIcons() });
  } catch (e) { send('overlay', 'exchange', { error: e.message }); }
}

async function doTradeSearch(opts, note) {
  if (!currentItem) return null;
  send('overlay', 'trade', { loading: true });
  try {
    const rates = await ninja.getTradeRates();
    const r = await trade.search(currentItem, opts, rates);
    if (note) r.note = note;
    send('overlay', 'trade', { result: r, divine: rates.divine || null, icons: await ninja.getIcons() });
    return r;
  } catch (e) { send('overlay', 'trade', { error: e.message }); return null; }
}

// Rare: najpierw dokładnie, a gdy brak ofert — luzujemy krok po kroku (jak robi to Awakened PoE Trade).
async function autoRareSearch(filters, s) {
  const item = currentItem;
  const base = { filters, useBase: true, ilvl: false, status: s.tradeStatus };
  let r = await doTradeSearch(base);
  const n = filters.filter(f => f.enabled && f.id).length;
  const steps = [
    { ...base, broad: true, countMin: Math.max(1, n - 1), note: `poluzowane: ${Math.max(1, n - 1)} z ${n} modów, wartości −10%` },
    { ...base, broad: true, useBase: false, countMin: Math.max(1, n - 2), note: `poluzowane: ${Math.max(1, n - 2)} z ${n} modów, dowolna baza` },
  ];
  for (const st of steps) {
    if (!r || r.total > 0 || currentItem !== item || n < 2) break;
    r = await doTradeSearch(st, st.note);
  }
}

// Zamykanie okienka wyceny kliknięciem gdziekolwiek poza nim (w grze, ekwipunku itd.).
// Gra zwykle nie oddaje fokusu, więc sprawdzamy stan przycisków myszy przez pomocnika Windows.
let clickWatch = null;
function watchClickOutside() {
  clearTimeout(clickWatch);
  const started = Date.now();
  const tick = async () => {
    if (!W.overlay || W.overlay.isDestroyed() || !W.overlay.isVisible()) return;
    if (Date.now() - started > 250 && await keys.mouseDown()) {
      const p = screen.getCursorScreenPoint();
      const b = W.overlay.getBounds();
      const inside = p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
      if (!inside) { W.overlay.hide(); return; }
    }
    clickWatch = setTimeout(tick, 60);
  };
  clickWatch = setTimeout(tick, 60);
}

// ---------- tryb liczenia ----------
function addCount(item, chaos) {
  counting.items.push({ name: item.name, chaos });
  counting.total += chaos;
  if (sess) sess.addLoot(chaos);
  pushHud();
}
function toggleCounting() {
  counting = counting.on ? { on: false, items: counting.items, total: counting.total } : { on: true, items: [], total: 0 };
  pushHud();
}

function pushHud() {
  const d = { maps: sess ? sess.stats() : null, counting: { on: counting.on, n: counting.items.length, total: counting.total } };
  send('settings', 'hud', d);
  send('hud', 'hud', { maps: sess ? sess.stats() : null, counting: { on: counting.on, n: counting.items.length, total: counting.total } });
}

// ---------- czat ----------
async function sendChat(text) {
  const prev = clipboard.readText();
  clipboard.writeText(text);
  const r = await keys.chat();
  setTimeout(() => clipboard.writeText(prev), 400); // przywróć schowek gracza
  return r !== 'nopoe';
}

// Podświetlenie w stashu przedmiotu, o który pyta kupujący (jak w Awakened PoE Trade).
let hlTimer = null, hlShownByUs = false;
function stashHighlight(t) {
  if (!t || t.left == null || t.top == null) return;
  const known = stashData && stashData.tabs && stashData.tabs.find(x => x.name === t.tab);
  const quad = known ? known.quad : (t.left > 12 || t.top > 12);
  if (!W.stash.isVisible()) { hlShownByUs = true; W.stash.showInactive(); }
  send('stash', 'highlight', { tab: t.tab, left: t.left, top: t.top, quad, item: t.item, rect: settings.get().stashRect });
  clearTimeout(hlTimer);
  hlTimer = setTimeout(() => { send('stash', 'highlight', null); if (hlShownByUs) { W.stash.hide(); hlShownByUs = false; } }, 90 * 1000);
}

// ---------- stash ----------
async function refreshStash() {
  const s = settings.get();
  if (!s.account) { send('stash', 'stash', { error: 'Wpisz nazwę konta w ustawieniach (zakładka Stash).' }); return; }
  send('stash', 'stash', { loading: { done: 0, total: 0 } });
  try {
    ninja.setLeague(s.league);
    stashData = await scanListed({ trade, ninja, account: s.account, league: s.league, onProgress: p => { send('stash', 'stash', { loading: p }); send('settings', 'stash', { loading: p }); } });
    settings.saveCache('stash', stashData);
    stashHistory.push(snapshotOf(stashData, settings.get().stashHidden));
    stashHistory = stashHistory.slice(-1000);
    try { fs.writeFileSync(histFile(), JSON.stringify(stashHistory)); } catch { /* */ }
    const divine = await ninja.divinePrice();
    const icons = await ninja.getIcons();
    send('stash', 'stash', { data: stashData, divine, icons });
    send('settings', 'stash', { data: stashData, history: stashHistory, divine });
  } catch (e) { send('stash', 'stash', { error: e.message }); send('settings', 'stash', { error: e.message }); }
}

// Alerty cen obserwowanych przedmiotów.
async function checkWatchAlerts() {
  const s = settings.get();
  const list = s.watch || [];
  if (!list.length) return;
  ninja.setLeague(s.league);
  const pct = Number(s.watchAlertPct) || 20;
  let changed = false;
  for (const w of list) {
    let r = null;
    try { r = await ninja.priceItem({ ...w, mods: [], stack: 1 }); } catch { continue; }
    const now = r && r.price && r.price.chaos;
    if (now == null) continue;
    if (w.alertBase == null) { w.alertBase = now; changed = true; continue; }
    const diff = (now - w.alertBase) / w.alertBase * 100;
    if (Math.abs(diff) >= pct) {
      send('notify', 'alert', { name: w.name, before: w.alertBase, now, diff: Math.round(diff) });
      w.alertBase = now; changed = true;
    }
  }
  if (changed) settings.quiet({ watch: list });
}

// Loot filtr z cen poe.ninja.
let lastFilter = null;
async function makeFilter() {
  const s = settings.get();
  ninja.setLeague(s.league);
  settings.quiet({ filterMade: true });
  lastFilter = await LF.generate({ ninja, documents: app.getPath('documents'), base: s.filterBase, divine: await ninja.divinePrice(), t2: Number(s.filterT2) || 20, t3: Number(s.filterT3) || 5,
    build: s.buildFilter, buildOpts: { enabled: !!s.filterBuild, ...(s.filterBuildOpts || {}) }, name: s.filterName || 'NakladkaPoE' });
  return lastFilter;
}

let stashTimer = null;
function scheduleStash() {
  clearInterval(stashTimer);
  const m = Number(settings.get().stashAuto) || 0;
  if (m > 0) stashTimer = setInterval(() => { if (settings.get().account) refreshStash(); }, Math.max(10, m) * 60000);
}
function toggleStash() {
  hlShownByUs = false;
  if (W.stash.isVisible()) { W.stash.hide(); return; }
  W.stash.showInactive();
  if (!stashData) stashData = settings.loadCache('stash', 7 * 24 * 3600 * 1000);
  Promise.all([ninja.divinePrice(), ninja.getIcons()]).then(([divine, icons]) => send('stash', 'stash', { data: stashData, rect: settings.get().stashRect, divine, icons }));
}

// ---------- poradnik ----------
function toggleGuide() {
  const vis = !W.guide.isVisible();
  if (vis) W.guide.showInactive(); else W.guide.hide();
  settings.quiet({ guideVisible: vis });
}

// ---------- nakładka poe-leveling.com ----------
let charLevel = null, lastArea = null;
function areaLevelFor(name) {
  const lv = guideData && guideData.areaLevels && guideData.areaLevels[name];
  if (!lv || !lv.length) return null;
  return charLevel ? lv.slice().sort((a, b) => Math.abs(a - charLevel) - Math.abs(b - charLevel))[0] : lv[0];
}
function plZone() {
  if (!W.pl || W.pl.isDestroyed() || !lastArea) return;
  const al = areaLevelFor(lastArea);
  const lv = al && charLevel ? { diff: charLevel - al, char: charLevel, area: al } : null;
  W.pl.webContents.executeJavaScript(`window.__pl && window.__pl.zone(${JSON.stringify(lastArea)}, ${JSON.stringify(lv)}, ${settings.get().guideAuto ? 'true' : 'false'})`).catch(() => {});
}
function createPL() {
  const wa = screen.getPrimaryDisplay().workArea;
  const b = settings.get().plBounds || { width: 380, height: 160, x: wa.x + wa.width - 400, y: wa.y + 40 };
  W.pl = onTop(new BrowserWindow({ ...b, frame: false, transparent: true, hasShadow: false, skipTaskbar: true, show: false, resizable: true, minWidth: 260, minHeight: 80, backgroundColor: '#00000000', alwaysOnTop: true,
    webPreferences: { partition: 'persist:leveling', contextIsolation: true } }));
  W.pl.webContents.on('did-fail-load', (_e, code, desc) => logErr('poe-leveling', `${code} ${desc}`));
  W.pl.webContents.on('render-process-gone', (_e, d) => logErr('poe-leveling', d.reason));
  W.pl.webContents.on('did-finish-load', () => {
    W.pl.webContents.insertCSS(PL.CSS).catch(() => {});
    W.pl.webContents.executeJavaScript(PL.JS).then(() => setTimeout(plZone, 800)).catch(() => {});
    applyLook();
  });
  W.pl.webContents.on('console-message', (...args) => {
    const msg = typeof args[0] === 'object' && args[0].message ? args[0].message : args[2];
    if (typeof msg !== 'string' || !msg.startsWith('PL|')) return;
    const [, kind, a, compact] = msg.split('|');
    if (kind === 'hide') { W.pl.hide(); settings.quiet({ guideVisible: false }); }
    if (kind === 'size' && compact === '1') { const [w] = W.pl.getSize(); W.pl.setSize(w, Math.max(70, Math.min(560, (+a || 160) + 4))); }
  });
  W.pl.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  const save = () => { if (W.pl && !W.pl.isDestroyed()) settings.quiet({ plBounds: W.pl.getBounds() }); };
  W.pl.on('moved', save); W.pl.on('resized', save);
  W.pl.loadURL('https://poe-leveling.com/');
}
function togglePL(force) {
  if (!W.pl || W.pl.isDestroyed()) { createPL(); W.pl.once('ready-to-show', () => { W.pl.showInactive(); settings.quiet({ guideVisible: true }); }); return; }
  const vis = force != null ? force : !W.pl.isVisible();
  if (vis) { W.pl.showInactive(); plZone(); } else W.pl.hide();
  settings.quiet({ guideVisible: vis });
}
const guideIsPL = () => (settings.get().guideSource || 'poe-leveling') !== 'builtin';
function toggleActiveGuide() { if (guideIsPL()) togglePL(); else toggleGuide(); }
function moveGuide(d) {
  if (guideIsPL()) { if (W.pl && !W.pl.isDestroyed()) W.pl.webContents.executeJavaScript(`window.__pl && window.__pl.move(${d})`).catch(() => {}); }
  else send('guide', 'guide:move', d);
}

// ---------- labirynt ----------
function toggleLab(forceShow) {
  const wa = screen.getPrimaryDisplay().workArea;
  if (forceShow && W.lab && !W.lab.isDestroyed()) { W.lab.showInactive(); return; }
  toggleWebWindow('lab', 'https://www.poelab.com/', { title: 'Labirynt dnia — poelab.com', width: 900, height: Math.min(900, wa.height - 80), x: wa.x + wa.width - 920, y: wa.y + 40 });
}

// ---------- live search ----------
// Połączenia websocket ze strony trade otwieramy w ukrytym oknie na domenie pathofexile.com,
// więc działają dokładnie jak w przeglądarce (te same ciasteczka po zalogowaniu w oknie Market).
let liveReady = false;
const liveState = {};
function parseTradeUrl(u) {
  const m = String(u || '').match(/pathofexile\.com\/trade\/search\/([^/?#]+)\/([A-Za-z0-9]+)/);
  return m ? { league: decodeURIComponent(m[1]), id: m[2] } : null;
}
function ensureLiveWin() {
  if (W.live && !W.live.isDestroyed()) return;
  liveReady = false;
  W.live = new BrowserWindow({ show: false, webPreferences: { session: tradeSession } });
  W.live.webContents.on('console-message', (...args) => {
    const msg = typeof args[0] === 'object' && args[0].message ? args[0].message : args[2];
    if (typeof msg !== 'string' || !msg.startsWith('LIVE')) return;
    const [kind, id, ...rest] = msg.split('|');
    const data = rest.join('|');
    if (kind === 'LIVEOPEN') liveState[id] = 'połączono';
    else if (kind === 'LIVECLOSE') { liveState[id] = 'rozłączono (' + data + ')'; setTimeout(() => connectLive(), 30000); }
    else if (kind === 'LIVEERR') liveState[id] = 'błąd połączenia — zaloguj się w oknie Market';
    else if (kind === 'LIVE') onLiveMessage(id, data);
    send('settings', 'live', liveState);
  });
  W.live.webContents.on('did-finish-load', () => { liveReady = true; connectLive(); });
  W.live.loadURL('https://www.pathofexile.com/trade/about');
}
function connectLive() {
  const list = (settings.get().liveSearches || []).filter(x => x.on);
  if (!list.length) { if (W.live && !W.live.isDestroyed()) W.live.destroy(); return; }
  ensureLiveWin();
  if (!liveReady) return;
  for (const ls of list) {
    const t = parseTradeUrl(ls.url);
    if (!t) { liveState[ls.id] = 'zły link'; continue; }
    const url = `wss://www.pathofexile.com/api/trade/live/${encodeURIComponent(t.league)}/${t.id}`;
    W.live.webContents.executeJavaScript(`(function(){window.__live=window.__live||{};const id=${JSON.stringify(ls.id)};const o=window.__live[id];
      if(o&&o.readyState<2)return;try{const ws=new WebSocket(${JSON.stringify(url)});window.__live[id]=ws;
      ws.onopen=()=>console.log('LIVEOPEN|'+id);ws.onmessage=e=>console.log('LIVE|'+id+'|'+e.data);
      ws.onerror=()=>console.log('LIVEERR|'+id);ws.onclose=e=>console.log('LIVECLOSE|'+id+'|'+e.code);}catch(e){console.log('LIVEERR|'+id);}})()`).catch(() => {});
  }
  // Zamknij połączenia wyłączonych wyszukiwań.
  const on = JSON.stringify(list.map(x => x.id));
  W.live.webContents.executeJavaScript(`(function(){const on=${on};for(const k in (window.__live||{}))if(!on.includes(k)){try{window.__live[k].close()}catch(e){};delete window.__live[k];}})()`).catch(() => {});
}
async function onLiveMessage(id, data) {
  let j; try { j = JSON.parse(data); } catch { return; }
  if (!j.new || !j.new.length) return;
  const ls = (settings.get().liveSearches || []).find(x => x.id === id);
  if (!ls) return;
  const t = parseTradeUrl(ls.url);
  try {
    const rates = await ninja.getTradeRates();
    const f = await trade.call('fetch', 'GET', `/api/trade/fetch/${j.new.slice(0, 10).join(',')}?query=${t.id}`);
    for (const r of (f.result || []).filter(Boolean)) {
      const p = (r.listing && r.listing.price) || {};
      send('notify', 'live', {
        search: ls.name, url: `https://www.pathofexile.com/trade/search/${encodeURIComponent(t.league)}/${t.id}`,
        name: [r.item && r.item.name, r.item && r.item.typeLine].filter(Boolean).join(' '), icon: r.item && r.item.icon,
        amount: p.amount, currency: p.currency, chaos: p.amount && rates[p.currency] ? p.amount * rates[p.currency] : null,
        account: r.listing && r.listing.account && r.listing.account.name, whisper: r.listing && r.listing.whisper || null,
      });
    }
  } catch { /* limit albo błąd — następna oferta przyjdzie normalnie */ }
}

// ---------- profile postaci ----------
const PROFILE_KEYS = ['buildGems', 'buildName', 'buildProfile', 'buildItems', 'buildRes', 'vendorThreshold', 'guideStep', 'guideClass', 'guideLeagueStart', 'watch', 'stashProfiles', 'stashProfile'];
function snapshotProfile() { const s = settings.get(); const d = {}; for (const k of PROFILE_KEYS) d[k] = s[k]; return d; }
function switchProfile(name) {
  const s = settings.get();
  const profiles = (s.profiles || []).map(p => p.name === s.activeProfile ? { ...p, data: snapshotProfile() } : p);
  const target = profiles.find(p => p.name === name);
  settings.quiet({ profiles, activeProfile: name, ...(target ? target.data : {}) });
  send('guide', 'settings', settings.get());
  return settings.get();
}

// ---------- wygląd ----------
function applyLook() {
  const s = settings.get();
  const z = Math.max(0.7, Math.min(1.6, Number(s.uiScale) || 1));
  const o = Math.max(0.5, Math.min(1, Number(s.uiOpacity) || 1));
  for (const k of ['overlay', 'notify', 'guide', 'hud', 'sheets', 'pl']) {
    const w = W[k]; if (!w || w.isDestroyed()) continue;
    w.webContents.setZoomFactor(z);
    w.setOpacity(o);
  }
  if (W.overlay) W.overlay.setSize(Math.round(420 * z), W.overlay.getSize()[1]);
  if (W.guide) W.guide.setSize(Math.round(430 * z), W.guide.getSize()[1]);
  if (W.notify) W.notify.setSize(Math.round(360 * z), Math.round(420 * z));
  if (W.hud) W.hud.setSize(Math.round(760 * z), Math.round(34 * z));
}

// ---------- skróty ----------
function registerHotkeys() {
  globalShortcut.unregisterAll();
  const s = settings.get();
  const h = s.hotkeys;
  const reg = (acc, fn) => { if (!acc) return; try { globalShortcut.register(acc, fn); } catch { /* zły skrót */ } };
  reg(h.priceCheck, () => priceCheck(false));
  reg(h.priceCheckAdvanced, () => priceCheck(true));
  reg(h.priceCheckCompact, () => priceCheck(false, true));
  reg(h.market, () => toggleMarket());
  reg(h.settings, () => openSettings());
  reg(h.guide, toggleActiveGuide);
  reg(h.guideNext, () => moveGuide(1));
  reg(h.guidePrev, () => moveGuide(-1));
  reg(h.leveling, toggleLeveling);
  reg(h.stash, toggleStash);
  reg(h.counting, toggleCounting);
  reg(h.sheets, toggleSheets);
  reg(h.app, toggleApp);
  reg(h.lab, () => toggleLab());
  reg(h.wiki, async () => {
    const it = parseItem(await readItemFromGame(false));
    if (!it) return;
    const name = ['Unique', 'Gem', 'Currency', 'Divination Card'].includes(it.rarity) ? it.name : it.baseType;
    shell.openExternal('https://www.poewiki.net/wiki/' + encodeURIComponent(name.replace(/ /g, '_')));
  });
  for (const c of s.commands || []) reg(c.key, () => sendChat(c.text));
  hotkeysOn = true;
}

// Skróty działają tylko w oknie gry albo nakładki — w innych programach Ctrl+D itd. zostają nietknięte.
async function focusLoop() {
  const fg = await keys.foreground();
  const isPoe = fg.cls === 'POEWindowClass' || fg.title === 'Path of Exile';
  const focused = BrowserWindow.getFocusedWindow();
  const ours = focused && [W.overlay, W.sheets, W.market, W.leveling, W.settings].includes(focused);
  const want = isPoe || ours || process.platform !== 'win32';
  if (want && !hotkeysOn) registerHotkeys();
  if (!want && hotkeysOn) { globalShortcut.unregisterAll(); hotkeysOn = false; }
  setTimeout(focusLoop, 400);
}

async function detectClientLog() {
  const candidates = [];
  const exe = await keys.procPath();
  if (exe) candidates.push(path.join(path.dirname(exe), 'logs', 'Client.txt'), path.join(path.dirname(exe), 'logs', 'LatestClient.txt'));
  candidates.push(
    'C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt',
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile\\logs\\Client.txt',
    'C:\\Program Files\\Steam\\steamapps\\common\\Path of Exile\\logs\\Client.txt',
  );
  for (const letter of 'DEFGHIJ') candidates.push(`${letter}:\\SteamLibrary\\steamapps\\common\\Path of Exile\\logs\\Client.txt`, `${letter}:\\Steam\\steamapps\\common\\Path of Exile\\logs\\Client.txt`);
  return candidates.find(f => { try { return fs.statSync(f).isFile(); } catch { return false; } }) || '';
}

function makeTray() {
  tray = new Tray(nativeImage.createFromPath(UI('ikona.png')));
  tray.setToolTip(`Nakładka PoE ${VERSION}`);
  const menu = () => Menu.buildFromTemplate([
    { label: 'Ustawienia', click: () => openSettings() },
    { label: 'Market (strona trade)', click: () => toggleMarket() },
    { label: 'Poradnik kampanii', click: toggleActiveGuide },
    { label: 'Stash — wartość', click: toggleStash },
    { label: 'Ściągi', click: toggleSheets },
    { label: 'Labirynt dnia', click: () => toggleLab() },
    { type: 'separator' },
    ...(updater && updater.status.state === 'ready' ? [{ label: `Uruchom ponownie (wersja ${updater.status.latest})`, click: restart }] : []),
    { label: `Wersja ${VERSION}`, enabled: false },
    { label: 'Zamknij', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu());
  tray.on('right-click', () => tray.setContextMenu(menu()));
  tray.on('click', () => openSettings());
}

function restart() { app.relaunch(); app.exit(0); }

// ---------- start ----------
app.whenReady().then(async () => {
  const dataDir = app.getPath('userData');
  settings = new Settings(dataDir);
  keys = new Keys(dataDir);
  tradeSession = session.fromPartition('persist:trade');
  tradeSession.setUserAgent(UA);
  ninja = new Ninja(fetchJson);
  trade = new Trade({
    request: tradeRequest,
    onWait: sec => { send('overlay', 'trade', { wait: sec }); send('stash', 'stash', { wait: sec }); },
    getSettings: () => settings.get(),
    loadCache: (n, a) => settings.loadCache(n, a),
    saveCache: (n, j) => settings.saveCache(n, j),
  });
  guideData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'guide.json'), 'utf8'));
  const campaignAreas = [];
  for (const sct of guideData.sections) for (const st of sct.steps) for (const p of st.parts) if (p.k === 'area' || p.k === 'wp') campaignAreas.push(p.v);
  sess = new Session(dataDir, campaignAreas);
  sess.on('change', pushHud);
  sess.on('trade', t => send('settings', 'trade', t));
  setInterval(pushHud, 1000);

  logw = new LogWatch();
  logw.on('event', ev => {
    if (ev.kind === 'entered' && /Aspirants' Plaza/i.test(ev.area) && settings.get().labAuto) toggleLab(true);
    if (ev.kind === 'level') { charLevel = ev.level; settings.quiet({ charLevel }); plZone(); }
    if (ev.kind === 'entered') { lastArea = ev.area; plZone(); }
    if (ev.kind === 'from' && ev.trade && ev.trade.left != null && settings.get().stashHighlight !== false) stashHighlight(ev.trade);
    send('notify', 'log', ev);
    send('guide', 'log', ev);
    sess.onLog(ev);
  });

  createWindows();
  updater = new Updater({ repo: PKG.updateRepo, current: VERSION, base: (global.__nakladka && global.__nakladka.baseVersion) || PKG.version, dir: path.join(dataDir, 'aktualizacje'), fetch: (u, o) => net.fetch(u, o),
    onReady: st => { tray && tray.displayBalloon && tray.displayBalloon({ title: 'Nakładka PoE', content: `Pobrano wersję ${st.latest}. Uruchom ponownie z menu przy zegarze.` }); send('settings', 'update', st); } });
  makeTray();
  setTimeout(() => updater.check(), 5000);
  setInterval(() => updater.check(), 6 * 3600 * 1000);

  if (!settings.get().league) {
    try {
      const ls = await trade.leagues();
      const lg = ls.find(l => !/Standard|Hardcore|SSF|Ruthless|HC/i.test(l)) || ls[0];
      if (lg) settings.set({ league: lg });
    } catch { /* ustawi użytkownik */ }
  }
  if (!settings.get().clientLog) {
    const f = await detectClientLog();
    if (f) settings.set({ clientLog: f });
  }
  if (settings.get().clientLog) logw.start(settings.get().clientLog);
  try { stashHistory = JSON.parse(fs.readFileSync(histFile(), 'utf8')); } catch { stashHistory = []; }
  scheduleStash();
  setInterval(() => checkWatchAlerts().catch(e => logErr('alerty', e)), 15 * 60 * 1000);
  setTimeout(() => checkWatchAlerts().catch(() => {}), 60 * 1000);
  const filterTick = () => { if (settings.get().filterAuto && settings.get().filterMade) makeFilter().catch(e => logErr('filtr', e)); };
  setTimeout(filterTick, 2 * 60 * 1000);
  setInterval(filterTick, 60 * 60 * 1000);
  connectLive();
  charLevel = settings.get().charLevel || null; lastArea = settings.get().lastArea || null;
  if (settings.get().guideVisible && guideIsPL()) togglePL(true);
  for (const k of ['overlay', 'notify', 'guide', 'hud']) W[k].webContents.once('did-finish-load', applyLook);
  focusLoop();
  if (!settings.get().league || !settings.get().clientLog) openSettings();
});

app.on('window-all-closed', e => e.preventDefault());
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { globalShortcut.unregisterAll(); keys && keys.stop(); });

// ---------- IPC ----------
ipcMain.handle('settings:get', () => settings.get());
ipcMain.handle('settings:set', (_e, patch) => {
  const before = settings.get().clientLog;
  const s = settings.set(patch);
  ninja.setLeague(s.league);
  registerHotkeys();
  if (s.clientLog !== before) logw.start(s.clientLog);
  if (W.hud) { if (s.hudVisible) W.hud.showInactive(); else W.hud.hide(); }
  send('guide', 'settings', s);
  scheduleStash();
  connectLive();
  applyLook();
  return s;
});
ipcMain.handle('settings:quiet', (_e, patch) => settings.quiet(patch));
ipcMain.handle('leagues', async () => { try { return await trade.leagues(); } catch (e) { return { error: e.message }; } });
ipcMain.handle('detect-log', () => detectClientLog());
ipcMain.handle('pick-log', async () => {
  const r = await dialog.showOpenDialog(W.settings, { title: 'Wskaż Client.txt', filters: [{ name: 'Client.txt', extensions: ['txt'] }], properties: ['openFile'] });
  return r.canceled ? '' : r.filePaths[0];
});
ipcMain.handle('trade:search', (_e, opts) => doTradeSearch(opts));
ipcMain.handle('trade:exchange', (_e, opts) => doExchange(opts || {}));
ipcMain.handle('open', (_e, url) => {
  if (/^https:\/\/www\.pathofexile\.com\/trade/.test(url)) toggleMarket(url);
  else if (/^https:\/\//.test(url)) shell.openExternal(url);
});
ipcMain.handle('overlay:hide', () => W.overlay.hide());
ipcMain.handle('overlay:resize', (_e, h) => { const [w] = W.overlay.getSize(); W.overlay.setSize(w, Math.max(160, Math.min(900, Math.round(h)))); });
ipcMain.handle('chat', (_e, text) => sendChat(text));
ipcMain.handle('copy', (_e, text) => { clipboard.writeText(String(text)); return true; });
ipcMain.handle('mouse', (e, inside) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) w.setIgnoreMouseEvents(!inside, { forward: true });
});
ipcMain.handle('notify:mouse', (_e, inside) => W.notify.setIgnoreMouseEvents(!inside, { forward: true }));
ipcMain.handle('market:login', () => toggleMarket('https://www.pathofexile.com/login'));
ipcMain.handle('guide:data', () => guideData);
ipcMain.handle('guide:hide', () => { W.guide.hide(); settings.quiet({ guideVisible: false }); });
ipcMain.handle('guide:resize', (_e, h) => { const [w] = W.guide.getSize(); W.guide.setSize(w, Math.max(80, Math.min(700, Math.round(h)))); });
ipcMain.handle('leveling:toggle', () => toggleLeveling());
ipcMain.handle('guide:source', (_e, src) => {
  const wasVisible = (W.pl && !W.pl.isDestroyed() && W.pl.isVisible()) || (W.guide && W.guide.isVisible());
  settings.quiet({ guideSource: src });
  if (W.pl && !W.pl.isDestroyed()) W.pl.hide();
  W.guide.hide();
  if (wasVisible) { if (src === 'builtin') W.guide.showInactive(); else togglePL(true); }
});
ipcMain.handle('pob:import', (_e, code) => {
  try {
    const r = decodePob(code);
    const patch = { buildSuggestName: LF.safeName('NakladkaPoE ' + (r.ascendancy || r.className || 'build')), buildGems: r.gems, buildName: [r.ascendancy || r.className, `${r.gems.length} gemów`].filter(Boolean).join(' · ') };
    if (r.className) patch.guideClass = r.className;
    if (r.profile) patch.buildProfile = r.profile;
    if (r.items) patch.buildItems = r.items;
    if (r.filter) patch.buildFilter = r.filter;
    if (r.res && r.res.fire != null) patch.buildRes = r.res;
    settings.quiet(patch);
    send('guide', 'settings', settings.get());
    return { ok: true, ...r };
  } catch (e) { return { error: 'Nie udało się odczytać kodu PoB: ' + e.message }; }
});
ipcMain.handle('stash:refresh', () => refreshStash());
ipcMain.handle('live:state', () => liveState);
ipcMain.handle('live:open', (_e, url) => toggleMarket(url));
ipcMain.handle('profile:switch', (_e, name) => switchProfile(name));
ipcMain.handle('profile:save', (_e, name) => {
  const s = settings.get();
  const profiles = (s.profiles || []).filter(p => p.name !== name);
  profiles.push({ name, data: snapshotProfile() });
  settings.quiet({ profiles, activeProfile: name });
  return settings.get();
});
ipcMain.handle('profile:delete', (_e, name) => {
  const s = settings.get();
  settings.quiet({ profiles: (s.profiles || []).filter(p => p.name !== name), activeProfile: s.activeProfile === name ? '' : s.activeProfile });
  return settings.get();
});
ipcMain.handle('watch:toggle', () => {
  if (!currentItem) return false;
  const it = currentItem;
  const list = settings.get().watch || [];
  const i = list.findIndex(w => w.name === it.name && w.baseType === it.baseType);
  const next = i >= 0 ? list.filter((_, k) => k !== i) : [...list, { name: it.name, rarity: it.rarity, baseType: it.baseType, itemClass: it.itemClass, links: it.links || 0, gemLevel: it.gemLevel, quality: it.quality, isMap: it.isMap, mapTier: it.mapTier, corrupted: it.corrupted }];
  settings.quiet({ watch: next });
  send('settings', 'watch', null);
  return i < 0;
});
ipcMain.handle('watch:remove', (_e, idx) => { const l = (settings.get().watch || []).filter((_, k) => k !== idx); settings.quiet({ watch: l }); return l; });
ipcMain.handle('watch:prices', async () => {
  ninja.setLeague(settings.get().league);
  const out = [];
  for (const w of settings.get().watch || []) {
    let r = null;
    try { r = await ninja.priceItem({ ...w, mods: [], stack: 1 }); } catch { /* */ }
    out.push({ ...w, price: r && r.price ? r.price : null });
  }
  return { list: out, divine: await ninja.divinePrice(), icons: await ninja.getIcons() };
});
ipcMain.handle('stash:history', () => stashHistory);
ipcMain.handle('stash:highlight', (_e, t) => stashHighlight(t));
ipcMain.handle('stash:ingame', () => { if (!W.stash.isVisible()) toggleStash(); });
ipcMain.handle('stash:hide-item', (_e, name, hide) => {
  const set = new Set(settings.get().stashHidden || []);
  if (hide) set.add(name); else set.delete(name);
  settings.quiet({ stashHidden: [...set] });
  return [...set];
});
ipcMain.handle('market:info', async () => ({ divine: await ninja.divinePrice(), league: settings.get().league, icons: await ninja.getIcons() }));
ipcMain.handle('stash:rect', (_e, rect) => settings.quiet({ stashRect: rect }));
ipcMain.handle('stash:hide', () => W.stash.hide());
ipcMain.handle('stash:get', () => stashData || settings.loadCache('stash', 7 * 24 * 3600 * 1000));
ipcMain.handle('stash:capture', (_e, on) => { W.stash.setIgnoreMouseEvents(!on, { forward: true }); if (on) W.stash.focus(); });
ipcMain.handle('counting:toggle', () => toggleCounting());
ipcMain.handle('session:reset', () => { sess.reset(); pushHud(); });
ipcMain.handle('history:get', () => sess.history);
ipcMain.handle('update:status', () => updater.status);
ipcMain.handle('update:check', () => updater.check());
ipcMain.handle('update:restart', () => restart());
ipcMain.handle('version', () => VERSION);
ipcMain.handle('errors', () => errLog);
ipcMain.handle('backup:export', async () => {
  const r = await dialog.showSaveDialog(W.settings, { title: 'Zapisz kopię ustawień', defaultPath: 'nakladka-poe-ustawienia.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled) return false;
  const { poesessid, ...safe } = settings.get(); // bez danych logowania
  fs.writeFileSync(r.filePath, JSON.stringify(safe, null, 2));
  return r.filePath;
});
ipcMain.handle('backup:import', async () => {
  const r = await dialog.showOpenDialog(W.settings, { title: 'Wczytaj kopię ustawień', filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] });
  if (r.canceled) return false;
  try { const d = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')); settings.set(d); registerHotkeys(); return true; } catch (e) { return { error: e.message }; }
});
ipcMain.handle('filter:list', () => ({ dir: LF.filterDir(app.getPath('documents')), files: LF.listFilters(LF.filterDir(app.getPath('documents'))), ours: LF.listOurs(LF.filterDir(app.getPath('documents'))), last: lastFilter }));
ipcMain.handle('filter:make', async () => { try { return await makeFilter(); } catch (e) { logErr('filtr', e); return { error: e.message }; } });
ipcMain.handle('filter:folder', () => shell.openPath(LF.filterDir(app.getPath('documents'))));
ipcMain.handle('map:advise', async (_e, text) => {
  try {
    const s = settings.get();
    const r = adviseMap(text, { danger: s.mapDanger, goal: s.mapGoal, profile: s.buildProfile });
    if (r.item) { try { ninja.setLeague(s.league); r.threads = (await ninja.load('exchange', 'Thread')).filter(t => t.chaos != null).sort((a, b) => b.chaos - a.chaos).map(t => ({ name: t.name, chaos: t.chaos, change: t.change, icon: t.icon })); } catch { /* */ } }
    if (r.item) { ninja.setLeague(s.league); try { const p = await ninja.priceItem(r.item); r.price = p && p.price ? p.price.chaos : null; } catch { /* */ } }
    return r;
  } catch (e) { logErr('mapa', e); return { error: e.message }; }
});
ipcMain.handle('craft:advise', (_e, text) => { try { return advise(text, settings.get().buildProfile || {}); } catch (e) { logErr('craft', e); return { error: e.message }; } });
ipcMain.handle('sheets:list', () => {
  const dir = path.join(app.getPath('userData'), 'sciagi');
  fs.mkdirSync(dir, { recursive: true });
  return { dir, files: fs.readdirSync(dir).filter(f => /\.(png|jpe?g|gif|webp|txt|md)$/i.test(f)).map(f => ({ name: f, path: path.join(dir, f), text: /\.(txt|md)$/i.test(f) ? fs.readFileSync(path.join(dir, f), 'utf8') : null })) };
});
ipcMain.handle('sheets:open-folder', () => { const dir = path.join(app.getPath('userData'), 'sciagi'); fs.mkdirSync(dir, { recursive: true }); shell.openPath(dir); });
ipcMain.handle('sheets:hide', () => W.sheets && W.sheets.hide());
