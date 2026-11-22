'use strict';
const bar = document.getElementById('bar');
const view = document.getElementById('view');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let files = [], cur = 0, dir = '';

async function load() {
  const r = await api.sheetsList();
  files = r.files; dir = r.dir;
  
  render();
}

function render() {
  const B = window.BUILTIN_SHEETS || [];
  const all = [...B.map(b => ({ name: b.name, html: b.html })), ...files];
  files._all = all;
  bar.innerHTML = all.map((f, i) => `${i === B.length && files.length ? '<span class="sep"></span>' : ''}<button data-i="${i}" class="${i === cur ? 'on' : ''}">${esc(f.name.replace(/\.[^.]+$/, ''))}</button>`).join('')
    + '<span class="grow"></span><button id="re" title="Wczytaj ponownie">↻</button><button id="folder">Folder</button><button id="x">×</button>';
  bar.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { cur = +b.dataset.i; render(); });
  document.getElementById('re').onclick = load;
  document.getElementById('folder').onclick = () => api.sheetsFolder();
  document.getElementById('x').onclick = () => api.sheetsHide();
  const f = all[cur];
  if (f && f.html) {
    view.innerHTML = `<div class="bi">${f.html}</div>`;
  } else if (!f) {
    view.innerHTML = `<div class="empty">Nie masz jeszcze ściąg. Kliknij <b>Folder</b> i wrzuć tam obrazki (PNG, JPG) albo pliki tekstowe (TXT, MD), np. ściągę do Betrayal, Incursion albo notatki do buildu. Potem kliknij ↻.<br><br><span style="color:var(--faint)">${esc(dir)}</span></div>`;
  } else if (f.text !== null) {
    view.innerHTML = `<pre>${esc(f.text)}</pre>`;
  } else {
    view.innerHTML = `<img src="${'file:///' + f.path.replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:')}" alt="">`;
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') api.sheetsHide();
  const n = (files._all || []).length;
  if (e.key === 'ArrowRight' && n) { cur = (cur + 1) % n; render(); }
  if (e.key === 'ArrowLeft' && n) { cur = (cur - 1 + n) % n; render(); }
});
load();
