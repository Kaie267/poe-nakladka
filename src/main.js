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

const PKG = require('../package.json');
const VERSION = (global.__nakladka && global.__nakladka.version) || PKG.version;
const UA = `PoE-Nakladka/${VERSION} (prywatne narzedzie gracza)`;
const UI = f => path.join(__dirname, 'ui', f);
const PRELOAD = path.join(__dirname, 'preload.js');

if (!app.requestSingleInstanceLock()) app.quit();

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

  W.overlay = onTop(new BrowserWindow({ ...base, width: 400, height: 560 }));
  W.overlay.loadFile(UI('overlay.html'));
  W.overlay.on('blur', () => { if (!W.overlay.webContents.isDevToolsOpened()) W.overlay.hide(); });

  W.notify = onTop(new BrowserWindow({ ...base, width: 360, height: 420, x: wa.x + wa.width - 380, y: wa.y + 80 }));
  W.notify.setIgnoreMouseEvents(true, { forward: true });
  W.notify.loadFile(UI('notify.html'));
  W.notify.once('ready-to-show', () => W.notify.showInactive());

  W.guide = onTop(new BrowserWindow({ ...base, width: 430, height: 300, x: wa.x + 20, y: wa.y + 120 }));
  W.guide.setIgnoreMouseEvents(true, { forward: true });
  W.guide.loadFile(UI('guide.html'));
  W.guide.once('ready-to-show', () => { if (settings.get().guideVisible) W.guide.showInactive(); });

  W.hud = onTop(new BrowserWindow({ ...base, width: 560, height: 34, x: Math.round(wa.x + wa.width / 2 - 280), y: wa.y + 4 }));
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
function toggleLeveling() {
  const wa = screen.getPrimaryDisplay().workArea;
  toggleWebWindow('leveling', 'https://poe-leveling.com/', { title: 'poe-leveling.com', width: 520, height: Math.min(900, wa.height - 100), x: wa.x + wa.width - 540, y: wa.y + 60 });
}

function toggleSheets() {
  if (W.sheets && !W.sheets.isDestroyed()) { if (W.sheets.isVisible()) W.sheets.hide(); else { W.sheets.show(); W.sheets.focus(); } return; }
  W.sheets = onTop(new BrowserWindow({ ...base, frame: false, resizable: true, width: 720, height: 560, minWidth: 300, minHeight: 200 }));
  W.sheets.loadFile(UI('sheets.html'));
  W.sheets.once('ready-to-show', () => W.sheets.show());
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

async function priceCheck(advanced) {
  const text = await readItemFromGame(advanced);
  const item = parseItem(text);
  placeOverlay();
  W.overlay.showInactive();
  W.overlay.focus();
  if (!item) { send('overlay', 'item', { error: 'Nie rozpoznano przedmiotu. Najedź kursorem na przedmiot w grze i wciśnij skrót jeszcze raz.' }); return; }
  currentItem = item;
  const s = settings.get();
  send('overlay', 'item', { item, threshold: s.vendorThreshold, mapDanger: s.mapDanger, counting: counting.on });
  runPricing(item).catch(e => send('overlay', 'ninja', { error: e.message }));
}

async function runPricing(item) {
  const s = settings.get();
  ninja.setLeague(s.league);
  let res = null;
  try { res = await ninja.priceItem(item); } catch (e) { send('overlay', 'ninja', { error: 'poe.ninja: ' + e.message }); }
  const divine = await ninja.divinePrice();
  send('overlay', 'ninja', { result: res, divine });
  if (counting.on && res && res.price && res.price.chaos != null) addCount(item, res.price.chaos * (item.stack || 1));

  const isGear = !['Currency', 'Divination Card', 'Gem', 'Unique'].includes(item.rarity) && !item.isMap;
  if (isGear) {
    try {
      const filters = await trade.prepareFilters(item);
      send('overlay', 'filters', { filters });
      if (s.autoTradeRares && item.rarity === 'Rare') await doTradeSearch({ filters, useBase: true, ilvl: false });
    } catch (e) { send('overlay', 'trade', { error: e.message }); }
  }
}

async function doTradeSearch(opts) {
  if (!currentItem) return;
  send('overlay', 'trade', { loading: true });
  try {
    const rates = await ninja.getTradeRates();
    const r = await trade.search(currentItem, opts, rates);
    send('overlay', 'trade', { result: r, divine: rates.divine || null });
  } catch (e) { send('overlay', 'trade', { error: e.message }); }
}

// ---------- tryb liczenia ----------
function addCount(item, chaos) {
  counting.items.push({ name: item.name, chaos });
  counting.total += chaos;
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
  clipboard.writeText(text);
  const r = await keys.chat();
  return r !== 'nopoe';
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
    send('stash', 'stash', { data: stashData, divine });
    send('settings', 'stash', { data: stashData, history: stashHistory, divine });
  } catch (e) { send('stash', 'stash', { error: e.message }); send('settings', 'stash', { error: e.message }); }
}

let stashTimer = null;
function scheduleStash() {
  clearInterval(stashTimer);
  const m = Number(settings.get().stashAuto) || 0;
  if (m > 0) stashTimer = setInterval(() => { if (settings.get().account) refreshStash(); }, Math.max(10, m) * 60000);
}
function toggleStash() {
  if (W.stash.isVisible()) { W.stash.hide(); return; }
  W.stash.showInactive();
  if (!stashData) stashData = settings.loadCache('stash', 7 * 24 * 3600 * 1000);
  ninja.divinePrice().then(divine => send('stash', 'stash', { data: stashData, rect: settings.get().stashRect, divine }));
}

// ---------- poradnik ----------
function toggleGuide() {
  const vis = !W.guide.isVisible();
  if (vis) W.guide.showInactive(); else W.guide.hide();
  settings.quiet({ guideVisible: vis });
}

// ---------- skróty ----------
function registerHotkeys() {
  globalShortcut.unregisterAll();
  const s = settings.get();
  const h = s.hotkeys;
  const reg = (acc, fn) => { if (!acc) return; try { globalShortcut.register(acc, fn); } catch { /* zły skrót */ } };
  reg(h.priceCheck, () => priceCheck(false));
  reg(h.priceCheckAdvanced, () => priceCheck(true));
  reg(h.market, () => toggleMarket());
  reg(h.settings, () => openSettings());
  reg(h.guide, toggleGuide);
  reg(h.guideNext, () => send('guide', 'guide:move', 1));
  reg(h.guidePrev, () => send('guide', 'guide:move', -1));
  reg(h.leveling, toggleLeveling);
  reg(h.stash, toggleStash);
  reg(h.counting, toggleCounting);
  reg(h.sheets, toggleSheets);
  reg(h.app, toggleApp);
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
    { label: 'Poradnik kampanii', click: toggleGuide },
    { label: 'poe-leveling.com', click: toggleLeveling },
    { label: 'Stash — wartość', click: toggleStash },
    { label: 'Ściągi', click: toggleSheets },
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
ipcMain.handle('open', (_e, url) => {
  if (/^https:\/\/www\.pathofexile\.com\/trade/.test(url)) toggleMarket(url);
  else if (/^https:\/\//.test(url)) shell.openExternal(url);
});
ipcMain.handle('overlay:hide', () => W.overlay.hide());
ipcMain.handle('overlay:resize', (_e, h) => { const [w] = W.overlay.getSize(); W.overlay.setSize(w, Math.max(160, Math.min(900, Math.round(h)))); });
ipcMain.handle('chat', (_e, text) => sendChat(text));
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
ipcMain.handle('pob:import', (_e, code) => {
  try {
    const r = decodePob(code);
    const patch = { buildGems: r.gems, buildName: [r.ascendancy || r.className, `${r.gems.length} gemów`].filter(Boolean).join(' · ') };
    if (r.className) patch.guideClass = r.className;
    settings.quiet(patch);
    send('guide', 'settings', settings.get());
    return { ok: true, ...r };
  } catch (e) { return { error: 'Nie udało się odczytać kodu PoB: ' + e.message }; }
});
ipcMain.handle('stash:refresh', () => refreshStash());
ipcMain.handle('stash:history', () => stashHistory);
ipcMain.handle('stash:ingame', () => { if (!W.stash.isVisible()) toggleStash(); });
ipcMain.handle('stash:hide-item', (_e, name, hide) => {
  const set = new Set(settings.get().stashHidden || []);
  if (hide) set.add(name); else set.delete(name);
  settings.quiet({ stashHidden: [...set] });
  return [...set];
});
ipcMain.handle('market:info', async () => ({ divine: await ninja.divinePrice(), league: settings.get().league }));
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
ipcMain.handle('sheets:list', () => {
  const dir = path.join(app.getPath('userData'), 'sciagi');
  fs.mkdirSync(dir, { recursive: true });
  return { dir, files: fs.readdirSync(dir).filter(f => /\.(png|jpe?g|gif|webp|txt|md)$/i.test(f)).map(f => ({ name: f, path: path.join(dir, f), text: /\.(txt|md)$/i.test(f) ? fs.readFileSync(path.join(dir, f), 'utf8') : null })) };
});
ipcMain.handle('sheets:open-folder', () => { const dir = path.join(app.getPath('userData'), 'sciagi'); fs.mkdirSync(dir, { recursive: true }); shell.openPath(dir); });
ipcMain.handle('sheets:hide', () => W.sheets && W.sheets.hide());
