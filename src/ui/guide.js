'use strict';
const root = document.getElementById('g');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
let data = null, steps = [], idx = 0, cfg = {}, area = null, charLevel = null;

async function init() {
  data = await api.guideData();
  cfg = await api.getSettings();
  charLevel = cfg.charLevel || null; area = cfg.lastArea || null;
  build();
  idx = Math.min(cfg.guideStep || 0, steps.length);
  render();
}

function build() {
  steps = [];
  for (const s of data.sections) for (const st of s.steps) {
    if (st.cond === 'ls' && !cfg.guideLeagueStart) continue;
    if (st.cond === 'nls' && cfg.guideLeagueStart) continue;
    steps.push({ ...st, section: s.title });
  }
}

function move(d) {
  idx = Math.max(0, Math.min(steps.length, idx + d));
  api.quiet({ guideStep: idx });
  render();
}

api.on('guide:move', move);
api.on('settings', s => { const lsChanged = s.guideLeagueStart !== cfg.guideLeagueStart; cfg = s; if (lsChanged) { build(); idx = Math.min(s.guideStep || 0, steps.length); } render(); });
api.on('log', ev => {
  if (ev.kind === 'level') { charLevel = ev.level; api.quiet({ charLevel }); render(); return; }
  if (ev.kind !== 'entered' || !steps.length) return;
  area = ev.area; api.quiet({ lastArea: area });
  if (!cfg.guideAuto) { render(); return; }
  // Szukamy najbliższego kroku, który prowadzi do tej strefy, i przechodzimy za niego.
  for (let i = idx; i < Math.min(steps.length, idx + 14); i++) {
    if (steps[i].enter === ev.area) { idx = i + 1; api.quiet({ guideStep: idx }); render(); return; }
  }
  render();
});

function areaLevel(name) {
  const lv = data && data.areaLevels && data.areaLevels[name];
  if (!lv || !lv.length) return null;
  if (!charLevel) return lv[0];
  return lv.slice().sort((a, b) => Math.abs(a - charLevel) - Math.abs(b - charLevel))[0];
}

function part(p) {
  switch (p.k) {
    case 'text': return esc(p.v);
    case 'area': return `<span class="area ${p.town ? 'town' : ''}">${esc(p.v)}</span>`;
    case 'kill': return `<span class="kill">${esc(p.v)}</span>`;
    case 'quest': return `<span class="quest">${esc(p.v)}</span>${p.r && p.r.npc ? ` <span class="lvl">(${esc(p.r.npc)})</span>` : ''}`;
    case 'qtext': return `<span class="qtext">${esc(p.v)}</span>`;
    case 'generic': return `<b>${esc(p.v)}</b>`;
    case 'wpget': return '<span class="tag">WP</span>';
    case 'wp': return `<span class="tag">WP</span> ➞ <span class="area">${esc(p.v)}</span>`;
    case 'logout': return `<span class="tag">wyloguj</span> ➞ <span class="area town">${esc(p.v)}</span>`;
    case 'portalset': return '<span class="tag">postaw portal</span>';
    case 'portal': return `<span class="tag">portal</span> ➞ <span class="area">${esc(p.v)}</span>`;
    case 'trial': return '<span class="tag">Trial of Ascendancy</span>';
    case 'ascend': return `<span class="tag">Labirynt ${esc(p.v)}</span>`;
    case 'craft': return `<span class="tag">przepis</span>${p.v.length ? ' <span class="lvl">' + esc(p.v.join(', ')) + '</span>' : ''}`;
    case 'dir': return `<span class="dir">${ARROWS[p.v] || ''}</span>`;
    default: return '';
  }
}

function rewards(st) {
  const out = [];
  const build = new Set((cfg.buildGems || []).map(g => g.toLowerCase()));
  for (const p of st.parts) {
    if (p.k !== 'quest' || !p.r) continue;
    const q = p.r.quest[cfg.guideClass] || [];
    const v = p.r.vendor[cfg.guideClass] || [];
    if (build.size) {
      const qb = q.filter(g => build.has(g.toLowerCase()));
      const vb = v.filter(g => build.has(g.toLowerCase()) && !qb.includes(g));
      if (qb.length) out.push(`Nagroda: <span class="pick">${qb.map(esc).join(' / ')}</span>`);
      if (vb.length) out.push(`Kup${p.r.npc ? ' u ' + esc(p.r.npc) : ''}: <span class="buy">${vb.map(esc).join(', ')}</span>`);
    } else if (q.length) {
      out.push(`Nagroda (${esc(cfg.guideClass)}): <span class="pick">${q.map(esc).join(', ')}</span>`);
    }
  }
  return out.length ? `<div class="rew">${out.join('<br>')}</div>` : '';
}

function stepHtml(st, cls) {
  const body = st.parts.map(part).join('');
  const subs = cls === 'now' && st.subs.length ? `<div class="subs">${st.subs.map(s => `<div>${esc(s)}</div>`).join('')}</div>` : '';
  return `<div class="step ${cls}">${body}${subs}${cls === 'now' ? rewards(st) : ''}</div>`;
}

function render() {
  if (!steps.length) { root.innerHTML = ''; return; }
  const cur = steps[Math.min(idx, steps.length - 1)];
  const inSection = steps.filter(s => s.section === cur.section);
  const posInSection = inSection.indexOf(cur) + 1;
  const al = area ? areaLevel(area) : null;
  const diff = al && charLevel ? charLevel - al : null;
  const badge = diff == null ? '' : `<span class="lv ${diff < -2 ? 'low' : diff > 3 ? 'high' : 'ok'}" title="Twój poziom ${charLevel}, strefa ${al}">${diff > 0 ? '+' : ''}${diff}</span>`;
  const head = `<div class="top"><span class="zone">${esc(area || cur.section)}</span>${badge}<span class="grow"></span>
      <button id="prev" title="Poprzedni krok (Ctrl+Alt+←)">‹</button><button id="next" title="Następny krok (Ctrl+Alt+→)">›</button><button id="x" title="Ukryj">×</button></div>
    <div class="bar"><span>${esc(cur.section)} · krok <span class="num">${posInSection}/${inSection.length}</span></span><span class="grow"></span><a id="lev" title="Otwórz poe-leveling.com">poe-leveling.com</a></div>`;
  let body;
  if (idx >= steps.length) body = '<div class="done">Kampania ukończona. Powodzenia na mapach.</div>';
  else {
    const next = steps.slice(idx + 1, idx + 3);
    body = stepHtml(cur, 'now') + (next.length ? `<div class="after">potem</div>` + next.map(s => stepHtml(s, 'next')).join('') : '');
  }
  root.innerHTML = head + body;
  document.getElementById('prev').onclick = () => move(-1);
  document.getElementById('next').onclick = () => move(1);
  document.getElementById('x').onclick = () => api.guideHide();
  document.getElementById('lev').onclick = () => api.levelingToggle();
  requestAnimationFrame(() => api.guideResize(root.getBoundingClientRect().height + 2));
}

root.addEventListener('mouseenter', () => api.mouse(true));
root.addEventListener('mouseleave', () => api.mouse(false));
init();
