'use strict';
// Nakładka na stronę poe-leveling.com. Strona ładuje się z serwera autora; my tylko chowamy jej układ
// i pokazujemy jej kroki w kompaktowym panelu (bieżący krok + kolejne), z podświetleniem strefy z gry.

const CSS = `
html, body { background: transparent !important; margin: 0 !important; overflow-x: hidden; }
body.pl-on { background: rgba(19,18,14,0.93) !important; border: 1px solid #3a352a; box-sizing: border-box; min-height: 100vh; }
body.pl-on #__nuxt { display: none !important; }
#pl-bar { position: sticky; top: 0; z-index: 99999; display: flex; align-items: center; gap: 6px; padding: 5px 6px 5px 10px; background: rgba(36,33,25,0.96); border-bottom: 1px solid #3a352a;
  font: 600 13px 'Segoe UI', sans-serif; color: #e9e4d6; -webkit-app-region: drag; user-select: none; }
#pl-bar .z { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
#pl-bar .lv { font: 600 11px Consolas, monospace; padding: 0 5px; border-radius: 2px; color: #13120e; flex: none; }
#pl-bar .lv.low { background: #d9694f; } #pl-bar .lv.ok { background: #8fbf6a; } #pl-bar .lv.high { background: #c9a24a; }
#pl-bar .g { flex: 1; }
#pl-bar button { -webkit-app-region: no-drag; background: none; color: #9b9482; border: none; font: 14px 'Segoe UI', sans-serif; padding: 0 5px; cursor: pointer; flex: none; line-height: 1; }
#pl-bar button:hover { color: #e9e4d6; }
#pl-bar .n { color: #6c6656; font: 400 11px 'Segoe UI', sans-serif; white-space: nowrap; }
#pl-bar button.on { color: #c9a24a; }
#pl-sub { display: none !important; justify-content: space-between; padding: 3px 10px; font: 11px 'Segoe UI', sans-serif; color: #9b9482; border-bottom: 1px solid #2c2921; }
#pl-view { font: 13px/1.45 'Segoe UI', sans-serif; color: #d8d2c2; }
#pl-view .st { padding: 6px 10px 6px 12px; border-left: 2px solid transparent; cursor: pointer; }
#pl-view .st.cur { font-weight: 600; font-size: 13.5px; color: #f0ead9; padding: 8px 10px 7px; border-bottom: 1px solid #2c2921; }
#pl-view .st.nx { padding: 3px 10px 3px 24px; position: relative; color: #b9b3a2; font-size: 12.5px; }
#pl-view .st.nx::before { content: ''; position: absolute; left: 11px; top: 11px; width: 5px; height: 5px; border-radius: 50%; background: #6c6656; }
#pl-view .st.nx:last-child { padding-bottom: 8px; }
#pl-view .st.done { opacity: 0.38; }
#pl-view .st img { height: 16px; vertical-align: -3px; display: inline !important; }
#pl-view .st div:not(.act), #pl-view .st p, #pl-view .st span, #pl-view .st label { display: inline !important; margin: 0 !important; padding: 0 !important; }
#pl-view .st .custom-checkbox > div:first-child, #pl-view .st svg, #pl-view .st input { display: none !important; }
#pl-view .after { text-align: center; color: #6c6656; font-size: 11px; font-style: italic; margin: 2px 10px; border-top: 1px solid #2c2921; padding-top: 2px; }
#pl-view .tips { margin: 0; padding: 6px 10px 6px 26px; font-size: 12px; color: #9b9482; border-bottom: 1px solid #2c2921; background: #17150f; }
#pl-view .tips li { margin: 2px 0; }
#pl-view .act { padding: 0 0 2px; color: #c9a24a; font: 600 11px 'Segoe UI', sans-serif; text-transform: uppercase; letter-spacing: 0.08em; }
::-webkit-scrollbar { width: 8px; } ::-webkit-scrollbar-thumb { background: #3a352a; }
`;

const JS = `(() => {
  if (window.__pl) return;
  const S = window.__pl = { cur: +(localStorage.getItem('pl-cur') || 0), compact: localStorage.getItem('pl-compact') !== '0', tips: localStorage.getItem('pl-tips') === '1', steps: [], acts: [] };
  const norm = t => String(t || '').toLowerCase().replace(/\\s+/g, ' ').replace(/^\\s*(on )?the /, '').trim();

  function collect() {
    const blocks = [...document.querySelectorAll('div.bg-poe-y')].filter(b => b.querySelector('h2') && b.querySelector('ul.ml-6 > li'));
    S.acts = blocks.map(b => ({
      title: b.querySelector('h2').textContent.replace(/[-=]/g, '').trim(),
      tips: [...b.querySelectorAll('ul.tips > li')].map(li => li.innerHTML),
    }));
    S.steps = [];
    blocks.forEach((b, a) => [...b.querySelectorAll('ul.ml-6 > li')].forEach(li => S.steps.push({ act: a, html: li.innerHTML, text: norm(li.textContent) })));
    return S.steps.length > 0;
  }

  function ui() {
    const bar = document.createElement('div');
    bar.id = 'pl-bar';
    bar.innerHTML = '<span class="z" id="pl-z">Poradnik</span><span class="lv" id="pl-lv" hidden></span><span class="n" id="pl-n"></span><span class="g"></span>' +
      '<button id="pl-prev" title="Poprzedni krok (Ctrl+Alt+←)">‹</button><button id="pl-next" title="Następny krok (Ctrl+Alt+→)">›</button>' +
      '<button id="pl-mode" title="Cały akt">☰</button><button id="pl-tips" title="Porady do aktu">i</button><button id="pl-x" title="Ukryj (Ctrl+Shift+L)">×</button>';
    const sub = document.createElement('div'); sub.id = 'pl-sub';
    const view = document.createElement('div'); view.id = 'pl-view';
    document.body.prepend(view); document.body.prepend(sub); document.body.prepend(bar);
    document.body.classList.add('pl-on');
    document.getElementById('pl-prev').onclick = () => S.move(-1);
    document.getElementById('pl-next').onclick = () => S.move(1);
    document.getElementById('pl-mode').onclick = () => { S.compact = !S.compact; localStorage.setItem('pl-compact', S.compact ? '1' : '0'); render(); };
    document.getElementById('pl-tips').onclick = () => { S.tips = !S.tips; localStorage.setItem('pl-tips', S.tips ? '1' : '0'); render(); };
    document.getElementById('pl-x').onclick = () => console.log('PL|hide');
    view.addEventListener('click', e => { const st = e.target.closest('.st'); if (st) { S.cur = +st.dataset.i; render(); } });
  }

  function render() {
    const L = S.steps;
    if (!L.length) return;
    S.cur = Math.max(0, Math.min(L.length - 1, S.cur));
    localStorage.setItem('pl-cur', S.cur);
    const cur = L[S.cur], act = S.acts[cur.act];
    const inAct = L.map((s, i) => [s, i]).filter(([s]) => s.act === cur.act);
    const pos = inAct.findIndex(([, i]) => i === S.cur) + 1;
    document.getElementById('pl-sub').innerHTML = '';
    document.getElementById('pl-n').textContent = act.title + ' · ' + pos + '/' + inAct.length;
    let html = '';
    if (S.tips && act.tips.length) html += '<ul class="tips">' + act.tips.map(t => '<li>' + t + '</li>').join('') + '</ul>';
    if (S.compact) {
      html += '<div class="st cur" data-i="' + S.cur + '">' + cur.html + '</div>';
      const next = L.slice(S.cur + 1, S.cur + 3).map((s, k) => '<div class="st nx" data-i="' + (S.cur + 1 + k) + '">' + (s.act !== cur.act ? '<div class="act">' + S.acts[s.act].title + '</div>' : '') + s.html + '</div>');
      html += next.join('');
    } else {
      html += inAct.map(([s, i]) => '<div class="st ' + (i === S.cur ? 'cur' : i < S.cur ? 'done' : '') + '" data-i="' + i + '">' + s.html + '</div>').join('');
    }
    const view = document.getElementById('pl-view');
    view.innerHTML = html;
    document.getElementById('pl-mode').classList.toggle('on', !S.compact);
    document.getElementById('pl-tips').classList.toggle('on', S.tips);
    if (!S.compact) { const c = view.querySelector('.st.cur'); if (c) c.scrollIntoView({ block: 'center' }); } else window.scrollTo(0, 0);
    const h = document.getElementById('pl-bar').offsetHeight + document.getElementById('pl-sub').offsetHeight + view.offsetHeight;
    console.log('PL|size|' + h + '|' + (S.compact ? 1 : 0));
  }

  S.move = d => { S.cur += d; render(); };
  S.zone = (area, lv) => {
    const zEl = document.getElementById('pl-z'); if (!zEl) return;
    zEl.textContent = area;
    const b = document.getElementById('pl-lv');
    if (lv && lv.diff != null) { b.hidden = false; b.textContent = (lv.diff > 0 ? '+' : '') + lv.diff; b.className = 'lv ' + (lv.diff < -2 ? 'low' : lv.diff > 3 ? 'high' : 'ok'); b.title = 'Twój poziom ' + lv.char + ', strefa ' + lv.area; } else b.hidden = true;
    const z = norm(area), L = S.steps;
    // najpierw krok zaczynający się od tej strefy, potem krok, który do niej prowadzi
    for (const pass of [0, 1]) for (let i = S.cur; i < Math.min(L.length, S.cur + 15); i++) {
      const t = L[i].text;
      if (pass === 0 ? t.startsWith(z) : t.includes(z)) { if (i !== S.cur || pass === 0) { S.cur = i; render(); } return; }
    }
  };

  const wait = setInterval(() => { if (collect()) { clearInterval(wait); ui(); render(); } }, 200);
})();`;

module.exports = { CSS, JS };
