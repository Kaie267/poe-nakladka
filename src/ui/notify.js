'use strict';
const list = document.getElementById('list');
let cards = [];
let cfg = { thanksMessage: 'ty, gl!', busyMessage: 'sec' };
let seq = 0;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

api.getSettings().then(s => { cfg = s; });

api.on('log', ev => {
  if (ev.kind === 'joined') {
    const hit = cards.filter(c => c.name === ev.name && c.kind === 'sell');
    hit.forEach(c => { c.here = true; });
    if (hit.length && cfg.buyerSound !== false) beep();
    render(); return;
  }
  if (ev.kind === 'left') { cards.filter(c => c.name === ev.name).forEach(c => { c.here = false; }); render(); return; }
  if (ev.kind !== 'from' && ev.kind !== 'to') return;
  if (ev.kind === 'to' && !ev.trade) return; // własne zwykłe wiadomości pomijamy
  api.getSettings().then(s => { cfg = s; });
  cards.unshift({ id: ++seq, kind: ev.trade ? (ev.kind === 'from' ? 'sell' : 'buy') : 'plain', name: ev.name, text: ev.text, trade: ev.trade, at: Date.now(), here: false });
  cards = cards.slice(0, 6);
  render();
});

api.on('live', l => {
  cards.unshift({ id: ++seq, kind: 'live', name: l.account || '', live: l, at: Date.now() });
  cards = cards.slice(0, 8);
  beep();
  render();
});

setInterval(() => {
  const before = cards.length;
  cards = cards.filter(c => Date.now() - c.at < 15 * 60 * 1000);
  if (cards.length !== before) render();
}, 30000);

const ACTIONS = {
  sell: [['Zaproś', c => `/invite ${c.name}`], ['Handel', c => `/tradewith ${c.name}`], ['Chwila', c => `@${c.name} ${cfg.busyMessage}`],
    ['Dzięki', c => `@${c.name} ${cfg.thanksMessage}`], ['Wyrzuć', c => `/kick ${c.name}`]],
  buy: [['Do niego', c => `/hideout ${c.name}`], ['Handel', c => `/tradewith ${c.name}`], ['Dzięki', c => `@${c.name} ${cfg.thanksMessage}`], ['Wróć', () => '/hideout']],
  plain: [['Zaproś', c => `/invite ${c.name}`], ['Odpisz: chwila', c => `@${c.name} ${cfg.busyMessage}`]],
  live: [],
};

function render() {
  list.innerHTML = cards.map(c => {
    if (c.kind === 'live') {
      const l = c.live;
      const price = l.amount ? `${esc(l.amount)} ${esc(l.currency)}` : '';
      return `<div class="c live" data-card="${c.id}"><div class="top"><span class="what">${esc(l.name)}</span><span class="price">${price}</span></div>
        <div class="who">Live: ${esc(l.search)} · ${esc(l.account || '')}</div>
        <div class="btns">${l.whisper ? `<button data-w="${c.id}">Napisz do sprzedającego</button>` : `<button data-u="${c.id}">Otwórz na trade (instant)</button>`}<button class="x" data-x="${c.id}">×</button></div></div>`;
    }
    const t = c.trade;
    const head = t
      ? `<div class="top"><span class="what">${c.kind === 'buy' ? 'Kupujesz: ' : ''}${esc(t.item)}</span><span class="price">${esc(t.amount)} ${esc(t.currency)}</span></div>
         <div class="who">${esc(c.name)}${c.here ? ' · <b>jest u ciebie</b>' : ''}${t.tab ? ` · zakładka „${esc(t.tab)}” (${t.left}, ${t.top})` : ''}</div>`
      : `<div class="top"><span class="what">${esc(c.name)}</span></div><div class="msg">${esc(c.text)}</div>`;
    const btns = ACTIONS[c.kind].map(([label], i) => `<button data-c="${c.id}" data-a="${i}">${label}</button>`).join('');
    return `<div class="c ${c.kind}" data-card="${c.id}">${head}<div class="btns">${btns}<button class="x" data-x="${c.id}">×</button></div></div>`;
  }).join('');
  list.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
    const c = cards.find(k => k.id === +b.dataset.c);
    if (c) api.chat(ACTIONS[c.kind][+b.dataset.a][1](c));
  });
  list.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { const c = cards.find(k => k.id === +b.dataset.w); if (c) api.chat(c.live.whisper); });
  list.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { const c = cards.find(k => k.id === +b.dataset.u); if (c) api.liveOpen(c.live.url); });
  list.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { cards = cards.filter(k => k.id !== +b.dataset.x); render(); api.notifyMouse(false); });
  list.querySelectorAll('.c').forEach(el => {
    el.onmouseenter = () => api.notifyMouse(true);
    el.onmouseleave = () => api.notifyMouse(false);
  });
}

// Krótki dźwięk, gdy kupujący wchodzi do hideoutu.
function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.16].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = i ? 990 : 660;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.14);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.15);
    });
    setTimeout(() => ctx.close(), 600);
  } catch { /* brak dźwięku */ }
}
