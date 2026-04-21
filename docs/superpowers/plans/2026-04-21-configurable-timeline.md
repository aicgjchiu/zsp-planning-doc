# Configurable Timeline + Editable Quarter Plan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Roadmap timeline length configurable through a new `Timeline` sheet tab (`TotalYears`), and make the Quarter-by-quarter shipping plan editable through a new `QuarterPlan` sheet tab. All Gantt grid widths, header loops, bar/milestone clamps, and the quarter-plan row count derive from `totalQuarters = TotalYears * 4`.

**Architecture:** Pure client-side plumbing + two new sheet tabs. `timelineState` (singleton object) and `quarterPlanState` (array) join the existing per-tab state. A single `totalQuarters` value (computed from `timelineState.TotalYears` at render time) replaces every hard-coded `12`. Gantt grid column count is driven by a CSS custom property `--total-quarters` set on the container. Bootstrap seeds both tabs from a new `window.QUARTER_PLAN` in `data.js` (migrated verbatim from the current static HTML table) and a default `TotalYears=3`.

**Tech Stack:** Plain HTML/CSS/JS. No bundler, no automated tests. Verification is **manual browser testing** after each commit — open `index.html` via `file://` (Apps Script fetch works from `file://` per CLAUDE.md) or wait ~60s for GitHub Pages redeploy after push.

**Spec:** `docs/superpowers/specs/2026-04-21-configurable-timeline-design.md`

**Testing note:** Feature branch `configurable-timeline`, same per-task verification workflow as the previous two branches. Merge to `main` when all tasks green.

---

## Task 1: Apps Script backend — two new tabs + `doGet` extension

**Files:**
- Modify: `apps-script.gs`
- Manual: paste into Apps Script editor → Deploy new version
- Manual: create `Timeline` and `QuarterPlan` sheet tabs with headers

**Context:** `handleUpsert` auto-detects primary keys from the header row, so no upsert changes. `handleBootstrap` already accepts the generic `Tabs` envelope. Only `doGet` needs to return the two new tabs.

- [ ] **Step 1: Add two constants + two `doGet` reads in `apps-script.gs`**

Locate the constants at the top of `apps-script.gs`. Add:

```js
const TIMELINE_SHEET     = 'Timeline';
const QUARTER_PLAN_SHEET = 'QuarterPlan';
```

Then inside `doGet`'s return object, append two fields (after the existing `milestones` line):

```js
    timeline:     (readTab(ss.getSheetByName(TIMELINE_SHEET))[0] || null),
    quarterPlan:   readTab(ss.getSheetByName(QUARTER_PLAN_SHEET)),
```

Note: `timeline` is `[0] || null` — it's a singleton, we return the first row or null if the tab is empty.

- [ ] **Step 2: Commit the `apps-script.gs` mirror**

```bash
git checkout -b configurable-timeline
git add apps-script.gs
git commit -m "Apps Script: return Timeline + QuarterPlan tabs from doGet"
```

- [ ] **Step 3: Manual — create the two new sheet tabs with headers**

Open the backing sheet. Create two new sheet tabs. Paste headers into row 1:

- **`Timeline`**: `Key | TotalYears | UpdatedAt | UpdatedBy`
- **`QuarterPlan`**: `QuarterId | Quarter | ProgrammerPlan | CharPlan | EnvPlan | VfxPlan | Gate | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`

- [ ] **Step 4: Manual — deploy new Apps Script version**

Extensions → Apps Script → paste updated `apps-script.gs` contents → Save → Deploy → Manage deployments → pencil icon → New version → Deploy.

- [ ] **Step 5: Verify backend**

Hit the `/exec` URL in a browser (GET). Response should now include `"timeline": null` and `"quarterPlan": []` alongside existing fields.

---

## Task 2: Client state + normalizers + optimistic-patch branches

**Files:**
- Modify: `app.js`

**Context:** Add two new module-level state variables, normalizers for both, wire up `fetchAll` to populate them, and extend `applyOptimisticPatch` / `clearPendingFlag` for writes.

- [ ] **Step 1: Add state declarations**

Grep for `let ganttTracksState`. Below those three Roadmap state lines, add:

```js
  let timelineState    = { TotalYears: 3 }; // singleton; sheet row merged over this default
  let quarterPlanState = [];
```

- [ ] **Step 2: Add normalizers**

Grep for `function normalizeMilestoneRow`. Add two siblings right after it:

```js
  function normalizeTimelineRow(r){
    if(!r) return { TotalYears: 3 };
    const n = Number(r.TotalYears);
    return {
      Key:        String(r.Key || 'config'),
      TotalYears: (Number.isFinite(n) && n >= 1) ? Math.floor(n) : 3,
      UpdatedAt:  String(r.UpdatedAt || ''),
      UpdatedBy:  String(r.UpdatedBy || ''),
    };
  }
  function normalizeQuarterPlanRow(r){
    return {
      QuarterId:      String(r.QuarterId || ''),
      Quarter:        String(r.Quarter || ''),
      ProgrammerPlan: String(r.ProgrammerPlan || ''),
      CharPlan:       String(r.CharPlan || ''),
      EnvPlan:        String(r.EnvPlan || ''),
      VfxPlan:        String(r.VfxPlan || ''),
      Gate:           String(r.Gate || ''),
      Hidden:         r.Hidden === true || r.Hidden === 'TRUE' || r.Hidden === 'true',
      SortOrder:      Number(r.SortOrder) || 0,
      CreatedAt:      String(r.CreatedAt || ''),
      UpdatedAt:      String(r.UpdatedAt || ''),
      UpdatedBy:      String(r.UpdatedBy || ''),
    };
  }
```

- [ ] **Step 3: Populate both in `fetchAll`**

Grep for `milestonesState  = (json.milestones`. Add two lines immediately after:

```js
      timelineState    = normalizeTimelineRow(json.timeline);
      quarterPlanState = (json.quarterPlan || []).map(normalizeQuarterPlanRow);
```

- [ ] **Step 4: Add optimistic-patch branches**

Locate `applyOptimisticPatch` in `app.js` (search for `function applyOptimisticPatch`). Inside the else-if chain, **before the closing `}`**, add:

```js
    } else if(tab === 'Timeline'){
      // Singleton — merge into the object, not an array.
      timelineState = Object.assign({}, timelineState, fields, stamp);
    } else if(tab === 'QuarterPlan'){
      const i = quarterPlanState.findIndex(x => x.QuarterId === key);
      const patch = Object.assign({}, fields, stamp);
      if(i >= 0) quarterPlanState[i] = Object.assign({}, quarterPlanState[i], patch);
      else       quarterPlanState.push(Object.assign({ QuarterId: key, CreatedAt: nowIso }, patch));
    }
```

- [ ] **Step 5: Add clear-pending branches**

Locate `function clearPendingFlag`. Replace the whole function with this version — it short-circuits the singleton `Timeline` case up front, then extends the existing ternary chain with the `QuarterPlan` branch:

```js
  function clearPendingFlag(tab, key){
    if(tab === 'Timeline'){
      if(timelineState && timelineState._pending){
        const copy = Object.assign({}, timelineState);
        delete copy._pending;
        timelineState = copy;
      }
      return;
    }
    const target =
      tab === 'Tasks'       ? { arr: taskState,        idField: 'TaskId'      } :
      tab === 'Team'        ? { arr: teamState,        idField: 'MemberId'    } :
      tab === 'Characters'  ? { arr: charactersState,  idField: 'Id'          } :
      tab === 'Items'       ? { arr: itemsState,       idField: 'Id'          } :
      tab === 'Maps'        ? { arr: mapsState,        idField: 'Id'          } :
      tab === 'Systems'     ? { arr: systemsState,     idField: 'Id'          } :
      tab === 'GanttTracks' ? { arr: ganttTracksState, idField: 'TrackId'     } :
      tab === 'GanttBars'   ? { arr: ganttBarsState,   idField: 'BarId'       } :
      tab === 'Milestones'  ? { arr: milestonesState,  idField: 'MilestoneId' } :
      tab === 'QuarterPlan' ? { arr: quarterPlanState, idField: 'QuarterId'   } : null;
    if(!target) return;
    const i = target.arr.findIndex(x => x[target.idField] === key);
    if(i >= 0 && target.arr[i]._pending){
      const copy = Object.assign({}, target.arr[i]);
      delete copy._pending;
      target.arr[i] = copy;
    }
  }
```

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "Client: timelineState + quarterPlanState + optimistic patch branches"
```

- [ ] **Step 7: Verify (no-regression)**

Push → open site locally → hard-refresh. DevTools console: `timelineState` should log `{ TotalYears: 3, Key: 'config', ... }` (defaults); `quarterPlanState` → `[]`. No errors. Nothing visible changes yet.

---

## Task 3: `data.js` seed + `bootstrapIfEmpty` extension

**Files:**
- Modify: `data.js` (add `window.QUARTER_PLAN`)
- Modify: `app.js` (extend `bootstrapIfEmpty`)

**Context:** On first load, seed the two new tabs. `Timeline` gets one row (`{ Key: 'config', TotalYears: 3 }`); `QuarterPlan` gets 12 rows migrated verbatim from the current static HTML table in `index.html`. Bold markdown (`**M1 · ...**`) is preserved as plain text — users will edit the text and add their own formatting later.

- [ ] **Step 1: Add `window.QUARTER_PLAN` to `data.js`**

Append to the bottom of `data.js`:

```js
// --- Quarter-by-quarter plan (seed — retired from data.js after first deploy) ---
window.QUARTER_PLAN = [
  { QuarterId: 'qp-y1q1', Quarter: 'Y1 Q1',
    programmer: 'Portal actor + Activate channel; random spawn manager; AI target-switch.',
    char:       'Daoshi 道士 retopo + UV + bakes.',
    env:        'NightMarket 夜市 concept art (6 keyframes).',
    vfx:        'Daoshi rig + retarget; talisman VFX first pass.',
    gate:       'Internal demo: find Portal in NightMarket 夜市 block-out.' },
  { QuarterId: 'qp-y1q2', Quarter: 'Y1 Q2',
    programmer: 'Activate defense wave logic; spawn from Portal while channeling.',
    char:       'Daoshi final textures; Jiangshi 殭屍 base enemy.',
    env:        'NightMarket 夜市 greybox playable.',
    vfx:        'Talisman VFX polish; Portal VFX prototype.',
    gate:       'M1 · First Portal Activate — loop smokes out.' },
  { QuarterId: 'qp-y1q3', Quarter: 'Y1 Q3',
    programmer: 'Enemy Portal + soul energy; vote-upgrade backend.',
    char:       'Missionary 傳教士 sculpt start.',
    env:        'NightMarket 夜市 final; map2 concept.',
    vfx:        'Portal VFX final; miasma atmos shader.',
    gate:       'Dual Portal demoable.' },
  { QuarterId: 'qp-y1q4', Quarter: 'Y1 Q4',
    programmer: 'Revive CD stacking; 5s I-frame on level-up; weapon↔skill binding.',
    char:       'Missionary retopo + rig handoff.',
    env:        'map2 greybox.',
    vfx:        'Missionary rig + cloth.',
    gate:       'M2 · Two-map loop + vote — Steam 4p.' },
  { QuarterId: 'qp-y2q1', Quarter: 'Y2 Q1',
    programmer: 'Missionary ability kit; Shaman ability kit.',
    char:       'Shaman 薩滿 sculpt start.',
    env:        'map2 final dress.',
    vfx:        'Missionary VFX; Shaman rig.',
    gate:       '3 characters playable.' },
  { QuarterId: 'qp-y2q2', Quarter: 'Y2 Q2',
    programmer: 'Boss AI framework; items 4–10.',
    char:       'Shaman retopo; Werewolf 狼人 set.',
    env:        'map3 concept + greybox.',
    vfx:        'Shaman VFX; boss rigs (Corpse General 屍將軍, Alpha Wolf 狼王).',
    gate:       'M3 · Closed Alpha — external playtest.' },
  { QuarterId: 'qp-y2q3', Quarter: 'Y2 Q3',
    programmer: 'Witch Doctor ability kit; matchmaking polish.',
    char:       'Witch Doctor 巫醫 sculpt; Bayou Zombies 巫毒殭屍.',
    env:        'map3 final dress; map4 concept.',
    vfx:        'Witch Doctor rig; voodoo VFX set.',
    gate:       '4 characters playable.' },
  { QuarterId: 'qp-y2q4', Quarter: 'Y2 Q4',
    programmer: 'Enemy ultimate upgrades (vote to summon boss).',
    char:       'Boss: Baron Saturday 星期六男爵; Khan 末代可汗 sculpt.',
    env:        'map4 greybox.',
    vfx:        'Baron VFX; mounted Khan rig.',
    gate:       'M4 · Open Beta — Steam beta branch.' },
  { QuarterId: 'qp-y3q1', Quarter: 'Y3 Q1',
    programmer: 'Meta progression; save system; cosmetics unlocks.',
    char:       'Khan textures + final.',
    env:        'map4 final dress.',
    vfx:        'Khan VFX; boss ultimate FX.',
    gate:       'Content-complete.' },
  { QuarterId: 'qp-y3q2', Quarter: 'Y3 Q2',
    programmer: 'Localization (EN / zh-TW / zh-CN); accessibility.',
    char:       'Cosmetic skins (3 per character).',
    env:        'Lighting pass on all maps.',
    vfx:        'VFX LODs, budget pass.',
    gate:       'M5 · Content Lock — balancing only.' },
  { QuarterId: 'qp-y3q3', Quarter: 'Y3 Q3',
    programmer: 'Optimization + stability; Steam cert prep.',
    char:       'Character polish pass.',
    env:        'Storefront key art + screenshots.',
    vfx:        'Trailer VFX flourishes.',
    gate:       'Release candidate.' },
  { QuarterId: 'qp-y3q4', Quarter: 'Y3 Q4',
    programmer: 'Launch + week-one patch.',
    char:       'Standby / live-ops art.',
    env:        'Live-ops environment tweaks.',
    vfx:        'Launch VFX hotfixes.',
    gate:       'M6 · Ship 🚀' },
];
```

- [ ] **Step 2: Extend `bootstrapIfEmpty`**

Grep for `async function bootstrapIfEmpty`. The existing body returns early if any Roadmap state is populated. Split the guard so the two new tabs can seed independently.

Replace the current function body with:

```js
  async function bootstrapIfEmpty(){
    const needsRoadmap = !ganttTracksState.length && !ganttBarsState.length && !milestonesState.length
                          && window.GANTT && window.MILESTONES;
    // Treat default-fallback timelineState (no UpdatedAt) as "sheet empty" — a real row would have UpdatedAt.
    const needsTimeline    = !timelineState || !timelineState.UpdatedAt;
    const needsQuarterPlan = !quarterPlanState.length && !!window.QUARTER_PLAN;
    if(!needsRoadmap && !needsTimeline && !needsQuarterPlan) return;

    const tabs = {};

    if(needsRoadmap){
      const tracks = [];
      const bars = [];
      window.GANTT.forEach((lane, laneIdx) => {
        if((lane.role || '').toLowerCase() === 'milestone') return;
        const trackId = genId('track');
        tracks.push({
          TrackId: trackId, Name: lane.who || lane.name || 'Track',
          Role: lane.role || 'code', Order: laneIdx,
          Hidden: false, SortOrder: laneIdx,
        });
        (lane.bars || []).forEach((b, bi) => {
          bars.push({
            BarId: genId('bar'), TrackId: trackId, Name: b.name,
            Start: b.start, End: b.end, Color: b.color || lane.role || 'code',
            Hidden: false, SortOrder: bi,
          });
        });
      });
      const milestones = window.MILESTONES.map((m, i) => ({
        MilestoneId: genId('ms'),
        Quarter: m.q || m.quarter || '',
        Name: m.name || '', Goal: m.goal || '',
        Hidden: false, SortOrder: i,
      }));
      tabs.GanttTracks = tracks;
      tabs.GanttBars   = bars;
      tabs.Milestones  = milestones;
    }

    if(needsTimeline){
      tabs.Timeline = [{ Key: 'config', TotalYears: 3 }];
    }

    if(needsQuarterPlan){
      tabs.QuarterPlan = window.QUARTER_PLAN.map((r, i) => ({
        QuarterId:      r.QuarterId,
        Quarter:        r.Quarter,
        ProgrammerPlan: r.programmer || '',
        CharPlan:       r.char       || '',
        EnvPlan:        r.env        || '',
        VfxPlan:        r.vfx        || '',
        Gate:           r.gate       || '',
        Hidden: false, SortOrder: i,
      }));
    }

    if(!Object.keys(tabs).length) return;

    try{
      await fetch(SHEET_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          Action: 'bootstrap',
          UpdatedBy: userName || 'bootstrap',
          Tabs: tabs,
        }),
      });
      await fetchAll();
    }catch(err){
      console.warn('[bootstrap] failed:', err);
    }
  }
```

- [ ] **Step 3: Commit**

```bash
git add app.js data.js
git commit -m "Client: seed Timeline + QuarterPlan from data.js on first load"
```

- [ ] **Step 4: Verify**

Open `index.html` locally. In the sheet, `Timeline` should now have one row (`Key=config, TotalYears=3`), `QuarterPlan` should have 12 rows. Reload page — no duplicate rows (idempotent).

---

## Task 4: `totalQuarters` everywhere — refactor `renderGantt`

**Files:**
- Modify: `app.js` (`renderGantt`)
- Modify: `styles.css` (`.gantt-header`, `.gantt-row` `grid-template-columns`)

**Context:** Replace hardcoded `12` with `totalQuarters` derived from `timelineState`. Gantt grid column count becomes dynamic via a CSS custom property on the container. Out-of-range bars and milestones are filtered with a `console.warn` each.

- [ ] **Step 1: Update CSS to use the custom property**

In `styles.css`, find `.gantt-header` and `.gantt-row`. Replace the hardcoded column definitions:

```css
.gantt-header{
  display:grid;grid-template-columns:240px repeat(var(--total-quarters, 12), 120px);
  border-bottom:1px solid var(--line);background:var(--bg-3);
  position:sticky;top:0;z-index:2;
}
```

```css
.gantt-row{
  display:grid;grid-template-columns:240px repeat(var(--total-quarters, 12), 120px);
  border-bottom:1px solid var(--line);
  --lane-count:1;
  min-height:calc(var(--lane-count) * 42px + 16px);
}
```

Everything else in those two rules stays as-is. Don't touch the `.track` rule — its column count also uses `12` but inherits from the parent; set it to match:

```css
.gantt-row .track{
  position:relative;grid-column:2 / span var(--total-quarters, 12);
  display:grid;grid-template-columns:repeat(var(--total-quarters, 12), 120px);
  grid-auto-rows:42px;
  padding:8px 0;
}
```

- [ ] **Step 2: Update `.gantt-row .track::before` background grid**

The pseudo-element currently uses a fixed 120px background-size (which is already column-width-based, so no change needed). Verify it still looks right after the column-count change — it should, since it's 120px-wide lines and the grid is N × 120px.

- [ ] **Step 3: Rewrite `renderGantt` to use `totalQuarters`**

Grep for `function renderGantt`. Replace the function with:

```js
  function renderGantt(){
    const host = qs('#gantt');
    if(!host) return;
    const canEdit = !!userName;
    const gateAttr = canEdit ? '' : 'disabled title="Set your name first"';
    const totalYears    = Math.max(1, Number(timelineState.TotalYears) || 3);
    const totalQuarters = totalYears * 4;
    host.style.setProperty('--total-quarters', totalQuarters);

    let html = '';
    // header — 240px label + totalQuarters × 120px
    html += '<div class="gantt-header">';
    html += '<div class="lane-label">Track / Owner</div>';
    for(let y=1;y<=totalYears;y++){
      for(let q=1;q<=4;q++){
        const yStart = q===1 ? 'year-start' : '';
        html += `<div class="qh ${yStart}">Y${y} · Q${q}</div>`;
      }
    }
    html += '</div>';

    const tracks = ganttTracksState
      .filter(t => !t.Hidden)
      .slice()
      .sort((a,b) => (a.Order||0) - (b.Order||0));

    tracks.forEach(track => {
      const bars = ganttBarsState
        .filter(b => {
          if(b.TrackId !== track.TrackId || b.Hidden) return false;
          if(Number(b.Start) >= totalQuarters || Number(b.End) > totalQuarters){
            console.warn(`[timeline] skipped Bar ${b.BarId}: extends past Y${totalYears} Q4`);
            return false;
          }
          return true;
        })
        .slice()
        .sort((a,b) => String(a.BarId).localeCompare(String(b.BarId)));

      const laneRanges = [];
      const laneByBar = {};
      bars.forEach(b => {
        const s = Number(b.Start), en = Number(b.End);
        let lane = laneRanges.findIndex(ranges =>
          ranges.every(r => en <= r.s || s >= r.e)
        );
        if(lane < 0){ lane = laneRanges.length; laneRanges.push([{s, e: en}]); }
        else { laneRanges[lane].push({s, e: en}); }
        laneByBar[b.BarId] = lane;
      });
      const laneCount = Math.max(1, laneRanges.length);

      html += `<div class="gantt-row" data-track-id="${escapeHtml(track.TrackId)}" style="--lane-count:${laneCount}">`;
      html += `<div class="who"><span class="dot ${escapeHtml(track.Role)}"></span>${escapeHtml(track.Name)}</div>`;
      html += `<div class="track">`;
      bars.forEach(b => {
        const col = Number(b.Start) + 1;
        const span = Math.max(1, Number(b.End) - Number(b.Start));
        const lane = (laneByBar[b.BarId] || 0) + 1;
        html += `<div class="gbar ${escapeHtml(b.Color || 'code')}${b._pending ? ' pending' : ''}" data-bar-id="${escapeHtml(b.BarId)}" style="grid-column:${col} / span ${span};grid-row:${lane}" title="${escapeHtml(b.Name)}">`
              + `<span class="gbar-name">${escapeHtml(b.Name)}</span>`
              + `<button class="gbar-more" data-bar-id="${escapeHtml(b.BarId)}" ${gateAttr || 'title="Edit bar"'}>⋯</button>`
              + `</div>`;
      });
      html += `<button class="gbar-add" data-track-id="${escapeHtml(track.TrackId)}" ${gateAttr || 'title="Add bar to this track"'}>＋</button>`;
      html += `</div></div>`;
    });

    // Auto-derived read-only milestone row
    html += `<div class="gantt-row gantt-milestone-row">`;
    html += `<div class="who"><span class="dot" style="background:var(--c-milestone)"></span>Milestones</div>`;
    html += `<div class="track">`;
    milestonesState
      .filter(m => !m.Hidden)
      .forEach(m => {
        const qIdx = parseQuarter(m.Quarter);
        if(qIdx < 0){
          console.warn(`[gantt] invalid milestone quarter: ${m.Quarter}`);
          return;
        }
        if(qIdx >= totalQuarters){
          console.warn(`[timeline] skipped Milestone ${m.MilestoneId}: ${m.Quarter} is past Y${totalYears} Q4`);
          return;
        }
        const title = (m.Goal ? `${m.Name} — ${m.Goal}` : m.Name);
        html += `<div class="gbar milestone${m._pending ? ' pending' : ''}" style="grid-column:${qIdx + 1} / span 1" title="${escapeHtml(title)}">`
              + `<span class="gbar-name">${escapeHtml(m.Name)}</span>`
              + `<button class="gbar-more ms-row-more" data-milestone-id="${escapeHtml(m.MilestoneId)}" ${gateAttr || 'title="Edit milestone"'}>⋯</button>`
              + `</div>`;
      });
    html += `</div></div>`;

    host.innerHTML = html;
  }
```

- [ ] **Step 4: Update `parseQuarter` to remove the hardcoded 12-quarter ceiling**

Grep for `function parseQuarter`. The existing body returns `-1` for anything outside 0..11. That's now too strict — we want it to return the raw index, and the *caller* filters by `totalQuarters`. Replace with:

```js
  function parseQuarter(s){
    const m = /^Y(\d)\s*Q(\d)$/.exec(String(s || '').trim());
    if(!m) return -1;
    const idx = (Number(m[1]) - 1) * 4 + (Number(m[2]) - 1);
    return idx >= 0 ? idx : -1;
  }
```

- [ ] **Step 5: Commit**

```bash
git add app.js styles.css
git commit -m "Gantt: render from totalQuarters derived from Timeline state"
```

- [ ] **Step 6: Verify**

Open locally. Gantt renders identically to before (12 columns, TotalYears=3 default). DevTools console — no errors. Manually set `timelineState.TotalYears = 4; renderGantt();` → grid expands to 16 columns, headers go through Y4 Q4.

---

## Task 5: Dynamic ranges in bar modal, milestone modal, and bar drag

**Files:**
- Modify: `app.js` (`openBarModal`, `openMilestoneModal`, `onBarPointerMove`)

**Context:** Bar Start/End dropdowns, milestone Quarter dropdown, and drag clamps all use hardcoded `12`. Replace with `totalQuarters`.

- [ ] **Step 1: Update `openBarModal` Start/End dropdowns**

Grep for `function openBarModal`. Replace the `startOpts` / `endOpts` building blocks:

```js
    const totalYears    = Math.max(1, Number(timelineState.TotalYears) || 3);
    const totalQuarters = totalYears * 4;

    const startOpts = [];
    for(let i = 0; i < totalQuarters; i++){
      const y = Math.floor(i/4) + 1, q = (i % 4) + 1;
      startOpts.push(`<option value="${i}" ${Number(bar.Start)===i?'selected':''}>Y${y} Q${q}</option>`);
    }
    const endOpts = [];
    for(let i = 1; i <= totalQuarters; i++){
      const y = Math.floor((i-1)/4) + 1, q = ((i-1) % 4) + 1;
      const label = (i === totalQuarters) ? `end of Y${totalYears} Q4` : `Y${y} Q${q} (end)`;
      endOpts.push(`<option value="${i}" ${Number(bar.End)===i?'selected':''}>${label}</option>`);
    }
```

- [ ] **Step 2: Update `openMilestoneModal` Quarter dropdown**

Grep for `function openMilestoneModal`. Replace the quarter-options-building loop:

```js
    const totalYears = Math.max(1, Number(timelineState.TotalYears) || 3);
    const quarterOpts = [];
    for(let y = 1; y <= totalYears; y++) for(let q = 1; q <= 4; q++){
      const s = `Y${y} Q${q}`;
      quarterOpts.push(`<option value="${s}" ${m.Quarter===s?'selected':''}>${s}</option>`);
    }
```

- [ ] **Step 3: Update `onBarPointerMove` clamp**

Grep for `function onBarPointerMove`. Replace the clamp section. Find the line `if(en > 12)` and replace the whole surrounding clamp block:

```js
    const totalQuarters = Math.max(1, Number(timelineState.TotalYears) || 3) * 4;
    // Clamps
    if(s < 0){
      if(dragState.zone === 'move') en += (0 - s);
      s = 0;
    }
    if(en > totalQuarters){
      if(dragState.zone === 'move') s -= (en - totalQuarters);
      en = totalQuarters;
    }
    if(en - s < 1){
      if(dragState.zone === 'start') s = en - 1;
      else if(dragState.zone === 'end') en = s + 1;
      else { en = s + 1; }
    }
```

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "Modals + drag: dynamic quarter range from timelineState"
```

- [ ] **Step 5: Verify**

Open locally. Bar modal opens with Y1Q1–Y3Q4 dropdown options (default TotalYears=3). Milestone modal same range. Drag a bar — still clamps at 12 (right edge). No regressions.

---

## Task 6: `renderQuarterPlan` + row edit modal

**Files:**
- Modify: `index.html` (replace static table with container div)
- Modify: `app.js` (add `renderQuarterPlan`, `openQuarterPlanModal`, wire into `renderAll`)

**Context:** Replace the static Quarter-by-quarter table with a dynamically-generated one driven by `totalYears` + `quarterPlanState`. Each row has a `⋯` button that opens a modal with five textareas (Programmer, Char, Env, VFX, Gate) for editing.

- [ ] **Step 1: Replace the static HTML table with a container**

In `index.html`, find the Quarter-by-quarter section (around line 129). Replace the entire `<div class="table-wrap">...</div>` block (including the `<table>` and all 12 rows) with:

```html
    <div class="table-wrap">
      <div id="quarter-plan"></div>
    </div>
```

Leave the `<div class="section-title">` above it unchanged.

- [ ] **Step 2: Add `renderQuarterPlan` in `app.js`**

Add right after `renderMilestones`:

```js
  // --- Render: Quarter-by-quarter plan ---
  function renderQuarterPlan(){
    const host = qs('#quarter-plan');
    if(!host) return;
    const canEdit = !!userName;
    const gateAttr = canEdit ? '' : 'disabled title="Set your name first"';
    const totalYears = Math.max(1, Number(timelineState.TotalYears) || 3);

    const byId = new Map(
      quarterPlanState.filter(r => !r.Hidden).map(r => [r.QuarterId, r])
    );

    let html = `<table class="sheet">
      <thead><tr>
        <th style="width:70px">Quarter</th>
        <th>Programmer — Code</th>
        <th>Character Artist</th>
        <th>Environment / Concept</th>
        <th>VFX &amp; Rigging</th>
        <th style="width:140px">End-of-quarter gate</th>
        <th style="width:40px"></th>
      </tr></thead><tbody>`;

    for(let y = 1; y <= totalYears; y++) for(let q = 1; q <= 4; q++){
      const quarterLabel = `Y${y} Q${q}`;
      const qid = `qp-y${y}q${q}`;
      const row = byId.get(qid);
      const pendingClass = (row && row._pending) ? ' class="pending"' : '';
      const placeholder = canEdit
        ? `<span class="dim small">—</span>`
        : `<span class="dim small">—</span>`;
      html += `<tr${pendingClass}>
        <td class="mono">${quarterLabel}</td>
        <td>${row && row.ProgrammerPlan ? escapeHtml(row.ProgrammerPlan) : placeholder}</td>
        <td>${row && row.CharPlan       ? escapeHtml(row.CharPlan)       : placeholder}</td>
        <td>${row && row.EnvPlan        ? escapeHtml(row.EnvPlan)        : placeholder}</td>
        <td>${row && row.VfxPlan        ? escapeHtml(row.VfxPlan)        : placeholder}</td>
        <td>${row && row.Gate           ? escapeHtml(row.Gate)           : placeholder}</td>
        <td><button class="row-menu-btn" data-qp-id="${qid}" data-qp-label="${quarterLabel}" ${gateAttr || 'title="Edit this quarter"'}>⋯</button></td>
      </tr>`;
    }
    html += `</tbody></table>`;
    host.innerHTML = html;

    qsa('.row-menu-btn', host).forEach(btn => {
      btn.addEventListener('click', () => {
        if(btn.disabled) return;
        openQuarterPlanModal(btn.getAttribute('data-qp-id'), btn.getAttribute('data-qp-label'));
      });
    });
  }
```

- [ ] **Step 3: Add `openQuarterPlanModal` in `app.js`**

Add right after `renderQuarterPlan`:

```js
  function openQuarterPlanModal(qid, quarterLabel){
    const existing = quarterPlanState.find(r => r.QuarterId === qid);
    const row = existing || {
      QuarterId: qid, Quarter: quarterLabel,
      ProgrammerPlan: '', CharPlan: '', EnvPlan: '', VfxPlan: '', Gate: '',
    };

    const html = `
      <div class="modal-panel" data-panel style="max-width:680px">
        <h3>${escapeHtml(quarterLabel)} — plan</h3>
        <label>Programmer — Code <textarea id="qp-prog" rows="3">${escapeHtml(row.ProgrammerPlan || '')}</textarea></label>
        <label>Character Artist <textarea id="qp-char" rows="3">${escapeHtml(row.CharPlan || '')}</textarea></label>
        <label>Environment / Concept <textarea id="qp-env" rows="3">${escapeHtml(row.EnvPlan || '')}</textarea></label>
        <label>VFX &amp; Rigging <textarea id="qp-vfx" rows="3">${escapeHtml(row.VfxPlan || '')}</textarea></label>
        <label>End-of-quarter gate <textarea id="qp-gate" rows="2">${escapeHtml(row.Gate || '')}</textarea></label>
        <div class="modal-footer">
          <div class="right">
            <button class="modal-btn" data-action="cancel">Cancel</button>
            <button class="modal-btn primary" data-action="save">Save</button>
          </div>
        </div>
      </div>
    `;
    openModal(html, (root) => {
      const panel = qs('[data-panel]', root);
      qs('[data-action="cancel"]', panel).addEventListener('click', closeModal);
      qs('[data-action="save"]', panel).addEventListener('click', () => {
        const patch = {
          Quarter:        quarterLabel,
          ProgrammerPlan: qs('#qp-prog', panel).value,
          CharPlan:       qs('#qp-char', panel).value,
          EnvPlan:        qs('#qp-env',  panel).value,
          VfxPlan:        qs('#qp-vfx',  panel).value,
          Gate:           qs('#qp-gate', panel).value,
        };
        closeModal();
        const p = pushRow('QuarterPlan', qid, patch);
        renderQuarterPlan();
        p.then(fetchIfIdle);
      });
    });
  }
```

- [ ] **Step 4: Wire `renderQuarterPlan` into `renderAll`**

Grep for `function renderAll`. Add a call after `renderMilestones()`:

```js
  function renderAll(){
    renderGantt();
    renderMilestones();
    renderQuarterPlan();
    renderPhases();
    // ... rest unchanged
```

Also call it in `fetchAll`'s render block (grep for `renderGantt();` inside `fetchAll`). Add `renderQuarterPlan();` after `renderMilestones();`.

- [ ] **Step 5: Commit**

```bash
git add app.js index.html
git commit -m "QuarterPlan: editable table + row-edit modal"
```

- [ ] **Step 6: Verify**

Open locally. Set identity. The Quarter-by-quarter section now renders from `quarterPlanState` — should match the old HTML content. Click `⋯` on any row → modal opens with the 5 textareas prefilled. Edit a field → Save → row updates with pending outline → clears when POST resolves. Sheet has the row.

---

## Task 7: Timeline chip + modal in Roadmap header

**Files:**
- Modify: `index.html` (add Timeline chip to Roadmap header)
- Modify: `app.js` (chip click handler, `openTimelineModal`)

**Context:** A small button that shows the current `TotalYears` and opens a tiny modal to change it. Identity-gated. On save, re-renders everything that depends on `totalQuarters`.

- [ ] **Step 1: Add Timeline button to Roadmap header**

In `index.html`, find the `#tracks-btn` in the Roadmap tab's `.roadmap-controls` div. Add a sibling button right after it:

```html
    <div class="roadmap-controls">
      <button class="reset-btn" id="tracks-btn" title="Manage Gantt tracks">Tracks</button>
      <button class="reset-btn" id="timeline-btn" title="Configure timeline length">Timeline · <span id="timeline-years">3</span>y</button>
    </div>
```

- [ ] **Step 2: Wire the Timeline button**

In `app.js`, find where `#tracks-btn` is wired (grep for `tracks-btn` inside the button-wiring section near the team-btn handler). Add right after:

```js
    // timeline button (Roadmap tab)
    const timelineBtn = qs('#timeline-btn');
    if(timelineBtn){
      timelineBtn.addEventListener('click', () => {
        if(!userName){ alert('Set your name first (click "Change name").'); return; }
        openTimelineModal();
      });
    }
```

- [ ] **Step 3: Add `openTimelineModal` in `app.js`**

Add next to `openTracksModal` (grep for `function openTracksModal` and place `openTimelineModal` immediately before or after):

```js
  function openTimelineModal(){
    const currentYears = Math.max(1, Number(timelineState.TotalYears) || 3);
    const html = `
      <div class="modal-panel" data-panel style="max-width:420px">
        <h3>Timeline length</h3>
        <p class="small" style="color:var(--ink-3);margin-top:-8px">How many years the Gantt + Quarter plan span. Bars or milestones that fall past the new end are hidden (not deleted) until you expand back.</p>
        <label>Total years <input type="number" id="tl-years" min="1" max="10" value="${currentYears}"></label>
        <div class="modal-footer">
          <div class="right">
            <button class="modal-btn" data-action="cancel">Cancel</button>
            <button class="modal-btn primary" data-action="save">Save</button>
          </div>
        </div>
      </div>
    `;
    openModal(html, (root) => {
      const panel = qs('[data-panel]', root);
      qs('[data-action="cancel"]', panel).addEventListener('click', closeModal);
      qs('[data-action="save"]', panel).addEventListener('click', () => {
        const n = Math.max(1, Math.floor(Number(qs('#tl-years', panel).value) || 3));
        closeModal();
        const p = pushRow('Timeline', 'config', { Key: 'config', TotalYears: n });
        renderGantt();
        renderMilestones();
        renderQuarterPlan();
        updateTimelineChip();
        p.then(fetchIfIdle);
      });
    });
  }

  function updateTimelineChip(){
    const el = qs('#timeline-years');
    if(el) el.textContent = String(Math.max(1, Number(timelineState.TotalYears) || 3));
  }
```

- [ ] **Step 4: Call `updateTimelineChip` in `renderAll` and after fetch**

In `renderAll`, add `updateTimelineChip();` at the end (near `renderLegend();`). Also add it in `fetchAll`'s render block after `renderQuarterPlan();`.

- [ ] **Step 5: Commit**

```bash
git add app.js index.html
git commit -m "Roadmap: Timeline chip + modal to edit TotalYears"
```

- [ ] **Step 6: Verify**

Open locally. Roadmap header shows "Timeline · 3y". Click it (with identity set) → modal → change to 4 → Save. Gantt expands to 16 columns. Milestone dropdown now offers Y1…Y4. Quarter plan table adds 4 new empty rows (Y4 Q1–Q4). Chip shows "Timeline · 4y". Click ⋯ on the new Y4 Q1 row → modal opens → save with some text → persists. Reload — still 4 years.

---

## Task 8: `CLAUDE.md` update + merge to main

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the two new tabs to the tabs list**

Find the sheet tabs bullet list. Add two entries right after the `Milestones` entry:

```markdown
  - **`Timeline`** headers: `Key | TotalYears | UpdatedAt | UpdatedBy`  — singleton config row (`Key="config"`); `TotalYears` drives the Gantt grid column count + quarter-plan row count + all bar/milestone quarter clamps
  - **`QuarterPlan`** headers: `QuarterId | Quarter | ProgrammerPlan | CharPlan | EnvPlan | VfxPlan | Gate | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`  — `QuarterId` is deterministic (`qp-y<n>q<m>`); one row per quarter, generated on demand
```

- [ ] **Step 2: Add an entry to "When Editing"**

Find the "When Editing" section. Add two new bullets near the "Change a milestone" bullet:

```markdown
- **Change the timeline length:** click the "Timeline · Ny" chip in the Roadmap tab header. The Gantt, Milestones, and Quarter plan all scale to `TotalYears × 4` quarters. Bars or milestones that fall past the new end are hidden (console-warned) — flip the number back and they reappear.
- **Change a quarter plan entry:** click `⋯` on any row in the Quarter-by-quarter shipping plan table. Modal exposes five textareas (one per role + end-of-quarter gate). Rows are 1:1 with quarters — no `＋` or Delete; expanding the timeline auto-adds empty rows.
```

- [ ] **Step 3: Update the Pending cleanup note**

Find the existing `Pending cleanup — window.GANTT / window.MILESTONES` note. Update it to include the third global:

```markdown
- **Pending cleanup — `window.GANTT` / `window.MILESTONES` / `window.QUARTER_PLAN`.** These globals in `data.js` are kept to seed the Roadmap + QuarterPlan sheet tabs on first deploy (via `bootstrapIfEmpty`). Once the live sheet is confirmed populated, a follow-up PR should retire them, remove the bootstrap seed-building path from `app.js`, and drop the legacy-shape compatibility branch from `handleBootstrap` in `apps-script.gs`.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Docs: CLAUDE.md covers Timeline + QuarterPlan tabs"
```

- [ ] **Step 5: Push the branch and merge to main**

```bash
git push -u origin configurable-timeline
git checkout main
git pull
git merge configurable-timeline --no-ff -m "Merge branch 'configurable-timeline'

Timeline length is now configurable via a new Timeline sheet tab
(TotalYears). Gantt grid, quarter headers, bar/milestone clamps, and
the newly-editable Quarter plan table all derive from totalQuarters =
TotalYears * 4. Out-of-range bars/milestones filter with a console
warning. QuarterPlan tab holds one row per quarter with per-role
fields; editable via ⋯ modal on each row."
git branch -d configurable-timeline
git push
```

- [ ] **Step 6: Post-merge smoke test on live site**

Wait ~60s for GitHub Pages redeploy. Open live URL. Hard-refresh.
- Roadmap header shows Timeline chip.
- Gantt renders the full 12 columns at default TotalYears=3.
- Quarter plan table renders all 12 rows matching the old static content.
- Click ⋯ on a quarter row → save a small edit → persists.
- Click Timeline chip → change to 4 → Gantt expands, new empty quarter rows appear.
- Shrink back to 3 → no data lost, rows hide.

---

## Post-merge acceptance checklist (summary)

- [ ] Timeline + QuarterPlan tabs bootstrap on first load with expected rows.
- [ ] Gantt renders 12 columns at default; quarter header reads Y1 Q1 → Y3 Q4.
- [ ] Quarter plan table renders all 12 rows matching the pre-change HTML content.
- [ ] `⋯` on any quarter row opens the 5-textarea modal; Save persists + shows pending outline briefly.
- [ ] Timeline chip shows current TotalYears; clicking it opens the modal.
- [ ] Expanding TotalYears 3 → 4: Gantt grid expands, milestone dropdown offers Y4, quarter plan table adds 4 empty rows.
- [ ] Shrinking TotalYears 4 → 3: out-of-range bars/milestones hide silently; `console.warn` in DevTools; rows still in sheet; expand back restores them.
- [ ] Identity gate: without user name set, Timeline chip and all quarter-plan ⋯ buttons are disabled.
- [ ] Writes stamp `UpdatedBy` / `UpdatedAt` on both new tabs.
- [ ] No regressions on Gantt / Milestones / Tasks / Design Doc.
