'use strict';
const frame = document.getElementById('frame');
const bar = document.getElementById('bar');
const msg = document.getElementById('msg');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => n >= 100 ? Math.round(n).toLocaleString('pl-PL') : n >= 10 ? n.toFixed(0) : n.toFixed(1);

let icons = {};
let hl = null;
let data = null, divine = null, rect = null, tab = null, cal = false, threshold = 5, status = '';

// Domyślna pozycja siatki stasha (skaluje się z wysokością ekranu, jak w grze).
function defaultRect() {
  const H = window.innerHeight || window.screen.height || 1080;
  return { x: Math.round(H * 0.0148), y: Math.round(H * 0.1185), w: Math.round(H * 0.585), h: Math.round(H * 0.585) };
}

api.getSettings().then(s => { threshold = s.vendorThreshold; rect = s.stashRect && s.stashRect.w > 50 ? s.stashRect : defaultRect(); layout(); });
api.on('highlight', h => { hl = h; if (h && h.rect) rect = h.rect; if (!rect || !(rect.w > 50)) rect = defaultRect(); layout(); });
api.on('stash', d => {
  if (d.rect !== undefined) rect = d.rect || rect || defaultRect();
  if (d.divine) divine = d.divine;
  if (d.icons) icons = d.icons;
  if (d.wait) { status = `limit GGG — czekam ${d.wait} s`; renderBar(); return; }
  if (d.loading) { status = d.loading.total ? `pobieram ${d.loading.done}/${d.loading.total}` : 'szukam ofert…'; renderBar(); return; }
  if (d.error) { status = ''; showMsg(d.error); renderBar(); return; }
  if (d.data !== undefined) { data = d.data; status = ''; if (data && (!tab || !data.tabs.find(t => t.name === tab))) tab = data.tabs[0] && data.tabs[0].name; hideMsg(); }
  layout();
});

const ico = k => icons[k] ? `<img src="${icons[k]}" alt="">` : (k === 'divine' ? ' div' : ' c');
function money(c) { return divine && c >= divine ? `${(c / divine).toFixed(1)}${ico('divine')}` : `${fmt(c)}${ico('chaos')}`; }
function showMsg(t) { msg.hidden = false; msg.textContent = t; msg.style.left = rect.x + 'px'; msg.style.top = (rect.y + 40) + 'px'; }
function hideMsg() { msg.hidden = true; }

function layout() {
  if (!rect) return;
  Object.assign(frame.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' });
  frame.classList.toggle('cal', cal);
  renderCells();
  renderBar();
}

function renderHighlight() {
  frame.querySelectorAll('.hl').forEach(e => e.remove());
  if (!hl || cal) return;
  const n = hl.quad ? 24 : 12;
  const cw = rect.w / n, ch = rect.h / n;
  const el = document.createElement('div');
  el.className = 'hl';
  Object.assign(el.style, { left: (hl.left - 1) * cw + 'px', top: (hl.top - 1) * ch + 'px', width: cw + 'px', height: ch + 'px' });
  const lab = document.createElement('div');
  lab.className = 'hll';
  lab.textContent = `${hl.item || ''} · zakładka „${hl.tab || ''}”`;
  el.appendChild(lab);
  frame.appendChild(el);
}

function renderCells() {
  renderHighlight();
  frame.querySelectorAll('.cell').forEach(e => e.remove());
  if (cal || !data || !tab) return;
  const t = data.tabs.find(x => x.name === tab);
  if (!t) return;
  const n = t.quad ? 24 : 12;
  const cw = rect.w / n, ch = rect.h / n;
  for (const it of data.items.filter(i => i.tab === tab)) {
    const el = document.createElement('div');
    el.className = 'cell' + (it.cheap ? ' cheap' : it.value >= threshold ? ' sell' : ' low');
    Object.assign(el.style, { left: it.x * cw + 'px', top: it.y * ch + 'px', width: it.w * cw + 'px', height: it.h * ch + 'px', fontSize: (t.quad ? 9 : 11) + 'px' });
    if (it.value) {
      const isDiv = divine && it.value >= divine;
      el.append(isDiv ? (it.value / divine).toFixed(1) : fmt(it.value));
      const src = icons[isDiv ? 'divine' : 'chaos'];
      if (src) { const im = document.createElement('img'); im.src = src; im.alt = ''; el.append(im); }
      else el.append(isDiv ? 'd' : 'c');
    }
    el.title = it.name;
    frame.appendChild(el);
  }
}

function renderBar() {
  if (!rect) return;
  bar.style.display = hl && !data && !cal ? 'none' : '';
  bar.style.left = rect.x + 'px';
  bar.style.top = Math.max(0, rect.y - 36) + 'px';
  if (cal) {
    bar.innerHTML = `<span class="m">Przeciągnij ramkę na siatkę stasha, róg — rozmiar.</span><button class="primary" id="save">Zapisz</button><button id="reset">Domyślna</button>`;
    document.getElementById('save').onclick = () => { cal = false; api.stashRect(rect); api.stashCapture(false); layout(); };
    document.getElementById('reset').onclick = () => { rect = defaultRect(); layout(); };
    return;
  }
  const tabs = data ? data.tabs : [];
  const t = tabs.find(x => x.name === tab);
  bar.innerHTML = `
    ${tabs.length ? `<select id="tab">${tabs.map(x => `<option ${x.name === tab ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}
    ${t ? `<span class="m">zakładka</span> <span class="v">${money(t.value)}</span>` : ''}
    ${data ? `<span class="m">razem</span> <span class="v">${money(data.value)}</span> <span class="m">(${data.scanned} szt.)</span>` : '<span class="m">Brak danych — kliknij Odśwież</span>'}
    ${status ? `<span class="m">${esc(status)}</span>` : ''}
    <button id="ref">Odśwież</button><button id="cal">Ramka</button><button id="x">×</button>`;
  const sel = document.getElementById('tab'); if (sel) sel.onchange = () => { tab = sel.value; layout(); };
  document.getElementById('ref').onclick = () => api.stashRefresh();
  document.getElementById('cal').onclick = () => { cal = true; api.stashCapture(true); layout(); };
  document.getElementById('x').onclick = () => api.stashHide();
}

bar.addEventListener('mouseenter', () => { if (!cal) api.mouse(true); });
bar.addEventListener('mouseleave', () => { if (!cal) api.mouse(false); });

// Kalibracja: przesuwanie i zmiana rozmiaru ramki.
let drag = null;
frame.addEventListener('mousedown', e => {
  if (!cal) return;
  drag = { mode: e.target.id === 'grip' ? 'size' : 'move', sx: e.clientX, sy: e.clientY, r: { ...rect } };
});
window.addEventListener('mousemove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
  if (drag.mode === 'move') rect = { ...drag.r, x: drag.r.x + dx, y: drag.r.y + dy };
  else { const s = Math.max(120, drag.r.w + Math.max(dx, dy)); rect = { ...drag.r, w: s, h: s }; }
  layout();
});
window.addEventListener('mouseup', () => { drag = null; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (cal) { cal = false; api.stashCapture(false); layout(); } else api.stashHide(); } });
