'use strict';
// Zamienia trasę z projektu exile-leveling (MIT, HeartofPhos) na src/data/guide.json.
// Użycie: node tools/build-guide.js /ścieżka/do/exile-leveling
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
const D = f => JSON.parse(fs.readFileSync(path.join(src, 'common/data/json', f), 'utf8'));
const areas = D('areas.json');
const quests = D('quests.json');
const gems = D('gems.json');
const gemName = id => (gems[id] && gems[id].name) || id.split('/').pop().replace(/^(SkillGem|SupportGem)/, '');

// Polskie odpowiedniki najczęstszych początków kroków. Nazwy z gry zostają po angielsku.
const VERBS = [
  [/^Find and kill /, 'Znajdź i zabij '], [/^Hand in /, 'Oddaj '], [/^Talk to /, 'Porozmawiaj z '],
  [/^Find /, 'Znajdź '], [/^Kill /, 'Zabij '], [/^Get /, 'Weź '], [/^Take the /, 'Weź '], [/^Take /, 'Weź '],
  [/^Activate /, 'Aktywuj '], [/^Select /, 'Wybierz '], [/^Place /, 'Umieść '], [/^Open /, 'Otwórz '],
  [/^Light the /, 'Zapal '], [/^Help and /, 'Pomóż i '], [/^Free /, 'Uwolnij '], [/^Complete /, 'Ukończ '],
  [/^Burn the /, 'Spal '], [/^Break /, 'Zniszcz '], [/^Use /, 'Użyj '], [/^Enter /, 'Wejdź do '],
];

function rewardsFor(questId, offerIds) {
  const q = quests[questId];
  const out = { name: q.name, npc: null, quest: {}, vendor: {} };
  for (const oid of offerIds) {
    const off = q.reward_offers[oid];
    if (!off) continue;
    out.npc = out.npc || off.quest_npc || null;
    for (const [gid, v] of Object.entries(off.quest || {})) for (const c of v.classes || []) (out.quest[c] = out.quest[c] || []).push(gemName(gid));
    for (const [gid, v] of Object.entries(off.vendor || {})) for (const c of v.classes || []) (out.vendor[c] = out.vendor[c] || []).push(gemName(gid));
  }
  for (const k of ['quest', 'vendor']) for (const c in out[k]) out[k][c] = [...new Set(out[k][c])];
  return out;
}

const sections = [];
const state = { lastTown: '1_1_town', current: '1_1_1', portal: null };

for (let act = 1; act <= 10; act++) {
  const text = fs.readFileSync(path.join(src, 'common/data/routes', `act-${act}.txt`), 'utf8').replace(/\r/g, '');
  const cond = []; // stos warunków: 'ls' = tylko start ligi, 'nls' = poza startem ligi
  let section = null;
  let last = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#section')) { section = { title: line.replace('#section', '').trim().replace(/^Act/, 'Akt'), steps: [] }; sections.push(section); continue; }
    if (line.startsWith('#ifdef LEAGUE_START')) { cond.push('ls'); continue; }
    if (line.startsWith('#ifndef LEAGUE_START')) { cond.push('nls'); continue; }
    if (line.startsWith('#endif')) { cond.pop(); continue; }
    if (line.startsWith('#sub')) { if (last) last.subs.push(line.replace('#sub', '').trim()); continue; }
    if (line.startsWith('#')) continue;

    const body = line.replace(/\s+#.*$/, '');
    const parts = [];
    let enter = null;
    const re = /\{(.+?)\}|([^{]+)/g;
    let m;
    while ((m = re.exec(body))) {
      if (m[2]) { parts.push({ k: 'text', v: m[2] }); continue; }
      const [type, ...args] = m[1].split('|');
      switch (type) {
        case 'enter': case 'area': {
          const a = areas[args[0]];
          parts.push({ k: 'area', v: a ? (a.map_name || a.name) : args[0], town: !!(a && a.is_town_area), lvl: a ? a.level : null });
          if (type === 'enter' && a) { enter = a.name; state.current = a.id; if (a.is_town_area) state.lastTown = a.id; }
          break;
        }
        case 'kill': parts.push({ k: 'kill', v: args[0] }); break;
        case 'arena': parts.push({ k: 'area', v: args[0] }); break;
        case 'quest': {
          const q = quests[args[0]];
          if (!q) { parts.push({ k: 'text', v: args[0] }); break; }
          const offers = args.length > 1 ? args.slice(1) : Object.keys(q.reward_offers);
          parts.push({ k: 'quest', v: q.name, r: rewardsFor(args[0], offers) });
          break;
        }
        case 'quest_text': parts.push({ k: 'qtext', v: args[0] }); break;
        case 'generic': parts.push({ k: 'generic', v: args[0] }); break;
        case 'waypoint_get': parts.push({ k: 'wpget' }); break;
        case 'waypoint': {
          if (args[0]) {
            const a = areas[args[0]];
            parts.push({ k: 'wp', v: a ? a.name : args[0] });
            if (a) { enter = a.name; state.current = a.id; if (a.is_town_area) state.lastTown = a.id; }
          } else parts.push({ k: 'wpget' });
          break;
        }
        case 'logout': {
          const t = areas[state.lastTown];
          parts.push({ k: 'logout', v: t ? t.name : '' });
          if (t) { enter = t.name; state.current = t.id; }
          break;
        }
        case 'portal': {
          if (args[0] === 'set') { state.portal = state.current; parts.push({ k: 'portalset' }); }
          else {
            const cur = areas[state.current];
            let dst;
            if (cur && cur.is_town_area && state.portal) dst = areas[state.portal];
            else dst = cur && areas[cur.parent_town_area_id];
            parts.push({ k: 'portal', v: dst ? dst.name : '' });
            if (dst) { enter = dst.name; state.current = dst.id; }
          }
          break;
        }
        case 'trial': parts.push({ k: 'trial' }); break;
        case 'ascend': parts.push({ k: 'ascend', v: args[0] || '' }); break;
        case 'crafting': {
          const a = areas[state.current];
          parts.push({ k: 'craft', v: (a && a.crafting_recipes) || [] });
          break;
        }
        case 'dir': parts.push({ k: 'dir', v: Math.floor((((parseFloat(args[0]) % 360) + 360) % 360) / 45) }); break;
        case 'copy': break;
        default: parts.push({ k: 'text', v: args.join(' ') });
      }
    }
    if (parts[0] && parts[0].k === 'text') for (const [r, pl] of VERBS) { if (r.test(parts[0].v)) { parts[0].v = parts[0].v.replace(r, pl); break; } }
    const step = { parts, subs: [], enter, act };
    const c = cond[cond.length - 1];
    if (c) step.cond = c;
    if (!section) { section = { title: `Akt ${act}`, steps: [] }; sections.push(section); }
    section.steps.push(step);
    last = step;
  }
}

const out = path.join(__dirname, '..', 'src', 'data', 'guide.json');
fs.writeFileSync(out, JSON.stringify({ source: 'exile-leveling (MIT) — github.com/HeartofPhos/exile-leveling', sections }));
const n = sections.reduce((a, s) => a + s.steps.length, 0);
console.log(`guide.json: ${sections.length} sekcji, ${n} kroków, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
