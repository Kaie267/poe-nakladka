'use strict';
const h = document.getElementById('h');
const t = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]));
const c = n => n >= 100 ? Math.round(n).toLocaleString('pl-PL') : n.toFixed(1);

api.on('hud', d => {
  const parts = [];
  const m = d.maps;
  if (m && m.count) {
    parts.push(`Mapy <b>${m.count}</b>`);
    parts.push(`śr. <b>${t(m.avgMs)}</b>`);
    if (m.perHour) parts.push(`<b>${m.perHour.toFixed(1)}</b>/h`);
    if (m.loot) parts.push(`zysk <b>${c(m.loot)} c</b>${m.lootPerHour ? ` · <b>${c(m.lootPerHour)}</b> c/h` : ''}`);
    if (m.current) parts.push(`${m.current.inMap ? '<span class="dot"></span>' : ''}${esc(m.current.area)} <b>${t(m.current.ms)}</b>`);
  }
  if (d.counting && (d.counting.on || d.counting.n)) {
    parts.push(`<span class="cnt">${d.counting.on ? 'Liczenie' : 'Policzono'}: <b>${d.counting.n}</b> szt. · <b>${c(d.counting.total)} c</b></span>`);
  }
  h.innerHTML = parts.join('<span style="color:var(--faint)">·</span>');
});
