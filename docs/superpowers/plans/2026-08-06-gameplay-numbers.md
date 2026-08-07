# Gameplay & Numbers Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Gameplay & Numbers" section to the Design Doc tab — enemy stat table + gameplay parameter table backed by two new sheet tabs, with a live-computed NightMarket run-segment-length banner — then seed Map-1 content and sync as-built numbers into Characters/Items/Systems.

**Architecture:** Two new Google Sheet tabs (`Enemies`, `Gameplay`) served by the existing Apps Script `doGet`/`handleUpsert` (first-column-primary-key convention — zero backend branching for writes). Frontend follows the established pattern exactly: `normalize*Row` → module state → `render*()` → `open*Modal` → `pushRow` (optimistic, `_pending`). The banner is derived at render time from well-known `Gameplay` row ids.

**Tech Stack:** Plain HTML/CSS/JS (no build step), Google Apps Script, curl + python for sheet seeding.

**Spec:** `docs/superpowers/specs/2026-08-06-gameplay-numbers-design.md`

**No test framework exists in this repo (buildless static site).** Verification is: `node --check` for JS syntax, curl against the live endpoint, and browser checks against a local `python -m http.server`. This matches every prior plan in this repo.

**Key references:**
- Renderer pattern: `app.js:326-351` (`renderItems`)
- Modal pattern: `app.js:1793-1862` (`openSystemModal`)
- Normalizer pattern: `app.js:721-736` (`normalizeItemRow`)
- Curl write recipe: CLAUDE.md § "Writing to the sheet from the command line"

---

### Task 1: Backend — `apps-script.gs` (new tabs in doGet + ensuretabs action)

**Files:**
- Modify: `apps-script.gs`

- [ ] **Step 1: Add sheet-name consts**

In `apps-script.gs`, after line 18 (`const QUARTER_PLAN_SHEET = 'QuarterPlan';`), insert:

```js
const ENEMIES_SHEET      = 'Enemies';
const GAMEPLAY_SHEET     = 'Gameplay';
```

- [ ] **Step 2: Add the two tabs to doGet**

In `doGet`, after the `quarterPlan:` line, insert:

```js
    enemies:      readTab(ss.getSheetByName(ENEMIES_SHEET)),
    gameplay:     readTab(ss.getSheetByName(GAMEPLAY_SHEET)),
```

(`readTab` already returns `[]` for a missing sheet, so this is deploy-order-safe.)

- [ ] **Step 3: Route the ensuretabs action in doPost**

In `doPost`, after the `if (body.Action === 'unlock') ...` line, insert:

```js
    if (body.Action === 'ensuretabs') return handleEnsureTabs();
```

- [ ] **Step 4: Add handleEnsureTabs**

After the `handleUnlock` function, insert:

```js
// Creates the fixed set of newer tabs (with header rows) if they don't exist.
// Idempotent — safe to call repeatedly. Only known tabs can be created.
function handleEnsureTabs() {
  const specs = {
    'Enemies':  ['Id','Name','Map','Tier','HP','Damage','MoveSpeed','SpawnWeight','Behavior','Basis','Hidden','SortOrder','CreatedAt','UpdatedAt','UpdatedBy'],
    'Gameplay': ['Id','Section','Name','Value','Unit','Basis','Notes','Hidden','SortOrder','CreatedAt','UpdatedAt','UpdatedBy'],
  };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const created = {};
  Object.keys(specs).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, specs[name].length).setValues([specs[name]]);
      created[name] = true;
    } else {
      created[name] = false;
    }
  });
  return jsonOut({ ok: true, created: created });
}
```

- [ ] **Step 5: Commit**

```bash
git add apps-script.gs
git commit -m "Backend: Enemies + Gameplay tabs in doGet, ensuretabs action"
```

- [ ] **Step 6: STOP — user deploys**

Ask the user to: open the Google Sheet → Extensions → Apps Script → replace the script body with the new `apps-script.gs` content → Deploy → Manage deployments → pencil → New version → Deploy. **Do not continue until the user confirms.**

- [ ] **Step 7: Create the tabs via curl**

```bash
ENDPOINT='https://script.google.com/macros/s/AKfycbypjQj-_CrxjEovmHt5vzc0Iaysbwt3n0MglkG7MAsDMJII8B8YCqFOBM6eE4GKAFuc/exec'
cat > /tmp/ensure.json <<'EOF'
{"Action":"ensuretabs"}
EOF
curl -sL -H 'Content-Type: text/plain;charset=utf-8' --data-binary @/tmp/ensure.json "$ENDPOINT"
```

Expected: `{"ok":true,"created":{"Enemies":true,"Gameplay":true}}` (or `false` values on re-run).

- [ ] **Step 8: Verify GET returns the new keys**

```bash
curl -sL "$ENDPOINT" | python -c "import json,sys; d=json.load(sys.stdin); print('enemies' in d, 'gameplay' in d, d.get('enemies'), d.get('gameplay'))"
```

Expected: `True True [] []`

---

### Task 2: Frontend state plumbing — `app.js`

**Files:**
- Modify: `app.js` (consts ~line 445, state ~line 469, `fetchAll` ~line 494, `applyOptimisticPatch` ~line 597, `clearPendingFlag` ~line 614, normalizers ~line 835)

- [ ] **Step 1: Add consts**

After the `SYS_STATUSES` const (`app.js:440-445`), insert:

```js
  const GP_SECTIONS = [
    { v:'Pacing',  label:'Pacing' },
    { v:'Combat',  label:'Combat' },
    { v:'Economy', label:'Economy' },
  ];
  const BASIS_VALUES = [
    { v:'target',   label:'target — designer-proposed' },
    { v:'as-built', label:'as-built — verified in UE 5.7' },
  ];
  const ENEMY_TIERS = [
    { v:'trash', label:'Trash' },
    { v:'elite', label:'Elite' },
    { v:'boss',  label:'Boss' },
  ];
```

- [ ] **Step 2: Add module state**

After `let quarterPlanState = [];` (line ~469), insert:

```js
  let enemiesState     = [];       // array of Enemy objects
  let gameplayState    = [];       // array of Gameplay parameter objects
```

- [ ] **Step 3: Parse the tabs in fetchAll**

In `fetchAll`, after `quarterPlanState = (json.quarterPlan || []).map(normalizeQuarterPlanRow);`, insert:

```js
      enemiesState     = (json.enemies    || []).map(normalizeEnemyRow);
      gameplayState    = (json.gameplay   || []).map(normalizeGameplayRow);
```

And in the same function's render block, after `renderSystems();`, insert:

```js
      renderGameplay();
      renderEnemies();
```

(Those two functions arrive in Task 4 — add these calls in Task 4 if executing tasks strictly independently; if executing sequentially in one session, add them now and accept the page is broken until Task 4 lands. **Recommended: add these two calls in Task 4 instead.** This step's normalizers + state are inert on their own.)

- [ ] **Step 4: Add normalizers**

After `normalizeQuarterPlanRow` (line ~835), insert:

```js
  function normalizeEnemyRow(r){
    return {
      Id:          String(r.Id || ''),
      Name:        String(r.Name || ''),
      Map:         String(r.Map || ''),
      Tier:        String(r.Tier || 'trash'),
      HP:          r.HP != null ? String(r.HP) : '',
      Damage:      String(r.Damage || ''),
      MoveSpeed:   r.MoveSpeed != null ? String(r.MoveSpeed) : '',
      SpawnWeight: r.SpawnWeight != null ? String(r.SpawnWeight) : '',
      Behavior:    String(r.Behavior || ''),
      Basis:       String(r.Basis || 'target'),
      Hidden:      r.Hidden === true || r.Hidden === 'TRUE' || r.Hidden === 'true',
      SortOrder:   Number(r.SortOrder) || 0,
      CreatedAt:   String(r.CreatedAt || ''),
      UpdatedAt:   String(r.UpdatedAt || ''),
      UpdatedBy:   String(r.UpdatedBy || ''),
    };
  }
  function normalizeGameplayRow(r){
    return {
      Id:        String(r.Id || ''),
      Section:   String(r.Section || 'Pacing'),
      Name:      String(r.Name || ''),
      // r.Value can legitimately be 0 (e.g. Spiria natural regen) — don't use `|| ''`.
      Value:     r.Value != null ? String(r.Value) : '',
      Unit:      String(r.Unit || ''),
      Basis:     String(r.Basis || 'target'),
      Notes:     String(r.Notes || ''),
      Hidden:    r.Hidden === true || r.Hidden === 'TRUE' || r.Hidden === 'true',
      SortOrder: Number(r.SortOrder) || 0,
      CreatedAt: String(r.CreatedAt || ''),
      UpdatedAt: String(r.UpdatedAt || ''),
      UpdatedBy: String(r.UpdatedBy || ''),
    };
  }
```

- [ ] **Step 5: Extend applyOptimisticPatch**

In `applyOptimisticPatch`, before the `} else if(tab === 'GanttTracks'){` branch, insert:

```js
    } else if(tab === 'Enemies'){
      const i = enemiesState.findIndex(x => x.Id === key);
      const patch = Object.assign({}, fields, stamp);
      if(i >= 0) enemiesState[i] = Object.assign({}, enemiesState[i], patch);
      else       enemiesState.push(Object.assign({ Id: key, CreatedAt: nowIso }, patch));
    } else if(tab === 'Gameplay'){
      const i = gameplayState.findIndex(x => x.Id === key);
      const patch = Object.assign({}, fields, stamp);
      if(i >= 0) gameplayState[i] = Object.assign({}, gameplayState[i], patch);
      else       gameplayState.push(Object.assign({ Id: key, CreatedAt: nowIso }, patch));
```

- [ ] **Step 6: Extend clearPendingFlag**

In the `clearPendingFlag` ternary table, after the `'Systems'` line, insert:

```js
      tab === 'Enemies'     ? { arr: enemiesState,     idField: 'Id'          } :
      tab === 'Gameplay'    ? { arr: gameplayState,    idField: 'Id'          } :
```

- [ ] **Step 7: Syntax check**

Run: `node --check app.js`
Expected: no output (exit 0).

- [ ] **Step 8: Commit**

```bash
git add app.js
git commit -m "Gameplay & Numbers: state, normalizers, optimistic-patch plumbing"
```

---

### Task 3: Markup + CSS — `index.html`, `styles.css`

**Files:**
- Modify: `index.html:203-248` (insert section, renumber 06→07, 07→08)
- Modify: `styles.css` (append rules at end of file)

- [ ] **Step 1: Insert the section markup**

In `index.html`, between the Maps section (ends line ~206 `</div>`) and the Systems Matrix section (starts line ~208), insert:

```html
  <div class="section">
    <div class="section-title"><span class="num">06</span><h2>Gameplay &amp; Numbers</h2><div class="aside">NightMarket 夜市 · target vs as-built</div><span class="section-add" id="add-gameplay-btn"></span></div>
    <div id="gnb-banner"></div>
    <div class="table-wrap">
      <table class="sheet" id="gameplay-table">
        <thead><tr>
          <th>Parameter</th>
          <th style="width:100px" class="num">Value</th>
          <th style="width:70px">Unit</th>
          <th style="width:110px">Basis</th>
          <th>Notes</th>
        </tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="section-title" style="margin-top:22px"><span class="num">06b</span><h2>Enemies</h2><div class="aside">themed names · as-built variant stats</div><span class="section-add" id="add-enemy-btn"></span></div>
    <div class="table-wrap">
      <table class="sheet" id="enemies-table">
        <thead><tr>
          <th>Name</th>
          <th style="width:70px">Tier</th>
          <th style="width:70px" class="num">HP</th>
          <th style="width:120px">Damage</th>
          <th style="width:80px" class="num">Move</th>
          <th style="width:70px" class="num">Weight</th>
          <th style="width:110px">Basis</th>
          <th>Behavior</th>
        </tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>
```

- [ ] **Step 2: Renumber the following sections**

Still in `index.html`:
- Systems Matrix: `<span class="num">06</span>` → `<span class="num">07</span>`
- Open Questions: `<span class="num">07</span>` → `<span class="num">08</span>`

(Careful: do this AFTER inserting the new section, and edit the Systems one first by matching the full line containing `Systems Matrix`, since two sections briefly share `06`.)

- [ ] **Step 3: Append CSS**

At the end of `styles.css`, append:

```css
/* ---------- Gameplay & Numbers ---------- */
.chip.target{background:oklch(0.95 0.06 80);color:oklch(0.48 0.12 80);border-color:transparent}
.chip.asbuilt{background:oklch(0.94 0.04 140);color:oklch(0.42 0.14 140);border-color:transparent}
table.sheet tr.group-row td{background:var(--bg-3);font-family:var(--mono);font-size:10.5px;text-transform:uppercase;letter-spacing:0.1em;color:var(--ink-2);font-weight:600}
table.sheet tr.boss-row td{border-top:2px solid var(--line-2);background:oklch(0.96 0.015 240)}
.gnb{border:1px solid var(--line);border-radius:10px;background:var(--bg-2);padding:14px 16px;margin-bottom:14px}
.gnb-headline{font-size:14px;margin-bottom:10px}
.gnb-bar{display:flex;height:14px;border-radius:7px;overflow:hidden;border:1px solid var(--line-2);margin-bottom:8px}
.gnb-seg{display:block;height:100%}
.gnb-seg.floor,.gnb-dot.floor{background:oklch(0.75 0.05 260)}
.gnb-seg.farm,.gnb-dot.farm{background:oklch(0.8 0.09 140)}
.gnb-seg.boss,.gnb-dot.boss{background:oklch(0.78 0.1 25)}
.gnb-legend{font-family:var(--mono);font-size:11px;color:var(--ink-2);display:flex;gap:14px;align-items:center;margin-bottom:8px}
.gnb-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:4px}
.gnb-note{font-size:12px;color:var(--ink-3)}
```

(Placed at end of file so `tr.group-row`/`tr.boss-row` — specificity (0,2,3) — beat the `table.sheet tr:nth-child(even) td` striping rule, same trick as `tr.ult-row` at `styles.css:112`.)

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css
git commit -m "Gameplay & Numbers: section markup + chips, group/boss rows, banner CSS"
```

---

### Task 4: Renderers — `app.js`

**Files:**
- Modify: `app.js` (new functions after `renderSystems` ~line 408; wire into `fetchAll` ~line 518, `renderAll` ~line 1020, `mountSectionAddButtons` ~line 1777)

- [ ] **Step 1: Add basisChip helper + renderers**

After `renderSystems` (ends ~line 408), insert:

```js
  // --- Render: Gameplay & Numbers ---
  function basisChip(basis){
    return basis === 'as-built'
      ? '<span class="chip asbuilt">as-built</span>'
      : '<span class="chip target">target</span>';
  }

  function renderGameplayBanner(){
    const host = qs('#gnb-banner');
    if(!host) return;
    const MODEL_IDS = ['gp-find-portal','gp-portal-cd','gp-activate','gp-farm-rate','gp-farm-len','gp-boss-rate','gp-boss-len'];
    const val = id => {
      const row = gameplayState.find(g => g.Id === id && !g.Hidden);
      if(!row) return NaN;
      const s = String(row.Value).trim();
      return s === '' ? NaN : Number(s);
    };
    const v = {};
    const missing = [];
    MODEL_IDS.forEach(id => {
      const n = val(id);
      if(Number.isFinite(n)) v[id] = n; else missing.push(id);
    });
    if(missing.length){
      host.innerHTML = `<div class="gnb"><div class="gnb-note">Run-length model missing: <code>${missing.map(escapeHtml).join(', ')}</code></div></div>`;
      return;
    }
    const floor    = Math.max(v['gp-find-portal'], v['gp-portal-cd']) + v['gp-activate'];
    const farmShare = v['gp-farm-rate'] * v['gp-farm-len'];
    const bossShare = v['gp-boss-rate'] * v['gp-boss-len'];
    const min      = floor;
    const expected = floor + farmShare + bossShare;
    const max      = floor + v['gp-farm-len'] + v['gp-boss-len'];
    const mins = s => (s/60).toFixed(1);
    const pct  = x => (x/expected*100).toFixed(1) + '%';
    host.innerHTML = `
      <div class="gnb">
        <div class="gnb-headline">NightMarket segment: <b>${mins(min)}–${mins(max)} min</b> · expected <b>${mins(expected)} min</b></div>
        <div class="gnb-bar">
          <span class="gnb-seg floor" style="width:${pct(floor)}" title="Portal floor ${floor}s"></span>
          <span class="gnb-seg farm" style="width:${pct(farmShare)}" title="Farm share ${farmShare}s"></span>
          <span class="gnb-seg boss" style="width:${pct(bossShare)}" title="Boss share ${bossShare}s"></span>
        </div>
        <div class="gnb-legend">
          <span><span class="gnb-dot floor"></span>Portal floor ${floor}s</span>
          <span><span class="gnb-dot farm"></span>Farm ${farmShare}s</span>
          <span><span class="gnb-dot boss"></span>Boss ${bossShare}s</span>
        </div>
        <div class="gnb-note">Model reflects the target portal-hop loop. As-built has no victory condition yet (loss only: player Portal destroyed / team wipe). As-built anchors: enemy Portal tops out ≈35 min; card tiers final at 9:00.</div>
      </div>`;
  }

  function renderGameplay(){
    renderGameplayBanner();
    const host = qs('#gameplay-table tbody');
    if(!host) return;
    const canEdit = !!userName;
    const rows = gameplayState
      .filter(g => !g.Hidden)
      .slice()
      .sort((a,b) => a.SortOrder - b.SortOrder);
    const html = [];
    const emit = g => html.push(`
      <tr class="${g._pending ? 'pending' : ''}">
        <td><b>${escapeHtml(g.Name)}</b></td>
        <td class="num mono-cell">${escapeHtml(g.Value)}</td>
        <td class="dim">${escapeHtml(g.Unit)}</td>
        <td>${basisChip(g.Basis)}</td>
        <td class="dim">${escapeHtml(g.Notes)} <button class="row-menu-btn" data-gp-id="${escapeAttr(g.Id)}" ${canEdit?'':'disabled title="Set your name first"'}>⋯</button></td>
      </tr>`);
    GP_SECTIONS.forEach(sec => {
      const group = rows.filter(g => g.Section === sec.v);
      if(!group.length) return;
      html.push(`<tr class="group-row"><td colspan="5">${escapeHtml(sec.label)}</td></tr>`);
      group.forEach(emit);
    });
    const known = new Set(GP_SECTIONS.map(s => s.v));
    const other = rows.filter(g => !known.has(g.Section));
    if(other.length){
      html.push('<tr class="group-row"><td colspan="5">Other</td></tr>');
      other.forEach(emit);
    }
    host.innerHTML = html.join('');
    qsa('.row-menu-btn', host).forEach(btn => {
      btn.addEventListener('click', () => {
        if(btn.disabled) return;
        openGameplayModal(btn.getAttribute('data-gp-id'));
      });
    });
  }

  function renderEnemies(){
    const host = qs('#enemies-table tbody');
    if(!host) return;
    const canEdit = !!userName;
    const rows = enemiesState
      .filter(x => !x.Hidden)
      .slice()
      .sort((a,b) => a.SortOrder - b.SortOrder);
    const maps = mapsState
      .filter(m => !m.Hidden)
      .slice()
      .sort((a,b) => a.SortOrder - b.SortOrder);
    const html = [];
    const emit = en => html.push(`
      <tr class="${en.Tier === 'boss' ? 'boss-row ' : ''}${en._pending ? 'pending' : ''}">
        <td><b>${escapeHtml(en.Name)}</b></td>
        <td class="dim">${escapeHtml(labelOf(ENEMY_TIERS, en.Tier))}</td>
        <td class="num">${escapeHtml(en.HP)}</td>
        <td>${escapeHtml(en.Damage)}</td>
        <td class="num">${escapeHtml(en.MoveSpeed)}</td>
        <td class="num">${escapeHtml(en.SpawnWeight) || '—'}</td>
        <td>${basisChip(en.Basis)}</td>
        <td class="dim">${escapeHtml(en.Behavior)} <button class="row-menu-btn" data-enemy-id="${escapeAttr(en.Id)}" ${canEdit?'':'disabled title="Set your name first"'}>⋯</button></td>
      </tr>`);
    maps.forEach(m => {
      const group = rows.filter(en => en.Map === m.Id);
      if(!group.length) return;
      html.push(`<tr class="group-row"><td colspan="8">${escapeHtml(m.Name)}</td></tr>`);
      group.forEach(emit);
    });
    const mapIds = new Set(maps.map(m => m.Id));
    const orphans = rows.filter(en => !mapIds.has(en.Map));
    if(orphans.length){
      html.push('<tr class="group-row"><td colspan="8">Unassigned map</td></tr>');
      orphans.forEach(emit);
    }
    host.innerHTML = html.join('');
    qsa('.row-menu-btn', host).forEach(btn => {
      btn.addEventListener('click', () => {
        if(btn.disabled) return;
        openEnemyModal(btn.getAttribute('data-enemy-id'));
      });
    });
  }
```

(Orphan rows render under "Unassigned map" rather than disappearing — a row with a typo'd Map id must stay visible and editable.)

- [ ] **Step 2: Wire into fetchAll**

In `fetchAll`'s render block, after `renderSystems();`, insert (if not already added in Task 2):

```js
      renderGameplay();
      renderEnemies();
```

- [ ] **Step 3: Wire into renderAll**

In `renderAll`, after `renderSystems();`, insert:

```js
    renderGameplay();
    renderEnemies();
```

- [ ] **Step 4: Wire the ＋ buttons**

In `mountSectionAddButtons`, after the `add-system-btn` entry, insert:

```js
      { id:'add-gameplay-btn', tip:'Add parameter', onClick:() => openGameplayModal(null) },
      { id:'add-enemy-btn',    tip:'Add enemy',     onClick:() => openEnemyModal(null) },
```

- [ ] **Step 5: Temporary modal stubs**

The `⋯`/`＋` wiring references modals that arrive in Task 5. If executing task-by-task, add stubs right after `renderEnemies` so `node --check` and the browser stay clean, and REPLACE them in Task 5:

```js
  // Replaced with real implementations in the modals task
  function openGameplayModal(id){ alert('Gameplay modal not built yet.'); }
  function openEnemyModal(id){ alert('Enemy modal not built yet.'); }
```

- [ ] **Step 6: Syntax check + browser check**

Run: `node --check app.js` — expected: exit 0.
Then: `python -m http.server 8000` in the repo root, open `http://localhost:8000/`, Design Doc tab. Expected: section 06 "Gameplay & Numbers" shows banner text "Run-length model missing: gp-find-portal, …" (tabs are empty), both tables render empty with headers, no console errors.

- [ ] **Step 7: Commit**

```bash
git add app.js
git commit -m "Gameplay & Numbers: banner model + param/enemy renderers"
```

---

### Task 5: Edit modals — `app.js`

> **As-built note:** the code below was superseded by commit `e18195f` (orphan Map/Section preservation: `visMaps` hoisting, `orphanOpt`/`secOrphan` synthesized options). Do not re-paste this block verbatim — `app.js` is the source of truth.

**Files:**
- Modify: `app.js` (replace the two stubs from Task 4 Step 5; place after `openSystemModal` ~line 1862)

- [ ] **Step 1: Replace stubs with real modals**

Delete the two stub functions, then after `openSystemModal`, insert:

```js
  function openGameplayModal(id){
    const isNew = !id;
    const g = isNew
      ? { Id:'', Section:'Pacing', Name:'', Value:'', Unit:'', Basis:'target', Notes:'', Hidden:false, SortOrder:0 }
      : gameplayState.find(x => x.Id === id);
    if(!g){ alert('Parameter not found.'); return; }

    const secOpts   = GP_SECTIONS.map(o => `<option value="${o.v}" ${g.Section===o.v?'selected':''}>${escapeHtml(o.label)}</option>`).join('');
    const basisOpts = BASIS_VALUES.map(o => `<option value="${o.v}" ${g.Basis===o.v?'selected':''}>${escapeHtml(o.label)}</option>`).join('');

    const html = `
      <div class="modal-panel" data-panel>
        <h3>${isNew?'Add Parameter':'Edit Parameter'}</h3>
        <label>Name<input type="text" data-f="Name" value="${escapeAttr(g.Name)}" placeholder="e.g. Portal hop cooldown"></label>
        <div class="modal-row">
          <label>Section<select data-f="Section">${secOpts}</select></label>
          <label>Basis<select data-f="Basis">${basisOpts}</select></label>
        </div>
        <div class="modal-row">
          <label>Value<input type="text" data-f="Value" value="${escapeAttr(g.Value)}" placeholder="e.g. 300 or 8/16/30/60"></label>
          <label>Unit<input type="text" data-f="Unit" value="${escapeAttr(g.Unit)}" placeholder="e.g. s, ratio, dmg"></label>
        </div>
        <label>Notes<textarea data-f="Notes">${escapeHtml(g.Notes)}</textarea></label>
        <div class="modal-footer">
          ${isNew ? '' : '<button class="modal-btn danger" data-action="delete">Delete</button>'}
          <div class="right">
            <button class="modal-btn" data-action="cancel">Cancel</button>
            <button class="modal-btn primary" data-action="save">${isNew?'Create':'Save'}</button>
          </div>
        </div>
      </div>
    `;
    openModal(html, (root) => {
      const panel = qs('[data-panel]', root);
      qs('[data-action="cancel"]', panel).addEventListener('click', closeModal);
      qs('[data-action="save"]', panel).addEventListener('click', async () => {
        const fields = {};
        qsa('[data-f]', panel).forEach(el => { fields[el.getAttribute('data-f')] = el.value; });
        if(!fields.Name || !String(fields.Name).trim()){
          alert('Parameter name is required.');
          return;
        }
        const key = isNew ? genId('gp') : g.Id;
        if(isNew){
          const maxSo = gameplayState.reduce((m,x) => Math.max(m, x.SortOrder), 0);
          fields.SortOrder = maxSo + 1000;
          fields.Hidden = false;
        }
        closeModal();
        const p = pushRow('Gameplay', key, fields);
        renderGameplay();
        p.then(fetchIfIdle);
      });
      if(!isNew){
        qs('[data-action="delete"]', panel).addEventListener('click', () => {
          const footer = qs('.modal-footer', panel);
          footer.innerHTML = `
            <div class="modal-confirm-inline">
              Hide this parameter? Recoverable from the sheet.
              <button class="modal-btn danger" data-action="confirm-delete">Yes, hide</button>
              <button class="modal-btn" data-action="cancel-delete">No</button>
            </div>
          `;
          qs('[data-action="cancel-delete"]', footer).addEventListener('click', closeModal);
          qs('[data-action="confirm-delete"]', footer).addEventListener('click', () => {
            closeModal();
            const p = pushRow('Gameplay', g.Id, { Hidden: true });
            renderGameplay();
            p.then(fetchIfIdle);
          });
        });
      }
    });
  }

  function openEnemyModal(id){
    const isNew = !id;
    const en = isNew
      ? { Id:'', Name:'', Map:(mapsState[0] && mapsState[0].Id) || '', Tier:'trash', HP:'', Damage:'', MoveSpeed:'', SpawnWeight:'', Behavior:'', Basis:'target', Hidden:false, SortOrder:0 }
      : enemiesState.find(x => x.Id === id);
    if(!en){ alert('Enemy not found.'); return; }

    const mapOpts = mapsState
      .filter(m => !m.Hidden)
      .slice()
      .sort((a,b) => a.SortOrder - b.SortOrder)
      .map(m => `<option value="${escapeAttr(m.Id)}" ${en.Map===m.Id?'selected':''}>${escapeHtml(m.Name)}</option>`).join('');
    const tierOpts  = ENEMY_TIERS.map(o => `<option value="${o.v}" ${en.Tier===o.v?'selected':''}>${escapeHtml(o.label)}</option>`).join('');
    const basisOpts = BASIS_VALUES.map(o => `<option value="${o.v}" ${en.Basis===o.v?'selected':''}>${escapeHtml(o.label)}</option>`).join('');

    const html = `
      <div class="modal-panel" data-panel>
        <h3>${isNew?'Add Enemy':'Edit Enemy'}</h3>
        <label>Name<input type="text" data-f="Name" value="${escapeAttr(en.Name)}" placeholder="e.g. Jiangshi 殭屍"></label>
        <div class="modal-row">
          <label>Map<select data-f="Map">${mapOpts}</select></label>
          <label>Tier<select data-f="Tier">${tierOpts}</select></label>
        </div>
        <div class="modal-row">
          <label>HP<input type="text" data-f="HP" value="${escapeAttr(en.HP)}"></label>
          <label>Damage<input type="text" data-f="Damage" value="${escapeAttr(en.Damage)}" placeholder="e.g. 25/hit"></label>
        </div>
        <div class="modal-row">
          <label>Move speed<input type="text" data-f="MoveSpeed" value="${escapeAttr(en.MoveSpeed)}"></label>
          <label>Spawn weight<input type="text" data-f="SpawnWeight" value="${escapeAttr(en.SpawnWeight)}" placeholder="blank for bosses"></label>
        </div>
        <label>Basis<select data-f="Basis">${basisOpts}</select></label>
        <label>Behavior<textarea data-f="Behavior">${escapeHtml(en.Behavior)}</textarea></label>
        <div class="modal-footer">
          ${isNew ? '' : '<button class="modal-btn danger" data-action="delete">Delete</button>'}
          <div class="right">
            <button class="modal-btn" data-action="cancel">Cancel</button>
            <button class="modal-btn primary" data-action="save">${isNew?'Create':'Save'}</button>
          </div>
        </div>
      </div>
    `;
    openModal(html, (root) => {
      const panel = qs('[data-panel]', root);
      qs('[data-action="cancel"]', panel).addEventListener('click', closeModal);
      qs('[data-action="save"]', panel).addEventListener('click', async () => {
        const fields = {};
        qsa('[data-f]', panel).forEach(el => { fields[el.getAttribute('data-f')] = el.value; });
        if(!fields.Name || !String(fields.Name).trim()){
          alert('Enemy name is required.');
          return;
        }
        const key = isNew ? genId('en') : en.Id;
        if(isNew){
          const maxSo = enemiesState.reduce((m,x) => Math.max(m, x.SortOrder), 0);
          fields.SortOrder = maxSo + 1000;
          fields.Hidden = false;
        }
        closeModal();
        const p = pushRow('Enemies', key, fields);
        renderEnemies();
        p.then(fetchIfIdle);
      });
      if(!isNew){
        qs('[data-action="delete"]', panel).addEventListener('click', () => {
          const footer = qs('.modal-footer', panel);
          footer.innerHTML = `
            <div class="modal-confirm-inline">
              Hide this enemy? Recoverable from the sheet.
              <button class="modal-btn danger" data-action="confirm-delete">Yes, hide</button>
              <button class="modal-btn" data-action="cancel-delete">No</button>
            </div>
          `;
          qs('[data-action="cancel-delete"]', footer).addEventListener('click', closeModal);
          qs('[data-action="confirm-delete"]', footer).addEventListener('click', () => {
            closeModal();
            const p = pushRow('Enemies', en.Id, { Hidden: true });
            renderEnemies();
            p.then(fetchIfIdle);
          });
        });
      }
    });
  }
```

- [ ] **Step 2: Syntax + browser check**

Run: `node --check app.js` — expected exit 0.
Also run: `grep -n "not built yet" app.js` — must return nothing (both Task 4 stubs removed; duplicate function declarations resolve silently, so a forgotten stub produces no error anywhere).
Browser (`http://localhost:8000/`, Design Doc tab): click ＋ on Gameplay & Numbers → modal opens with Section/Basis selects → Cancel closes. Same for Enemies ＋. No console errors. (Don't save — writes go to the production sheet; the write path is exercised during seeding.)

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "Gameplay & Numbers: parameter + enemy edit modals"
```

---

### Task 6: Deploy frontend to GitHub Pages

- [ ] **Step 1: Push**

```bash
git push
```

- [ ] **Step 2: Verify live**

After ~1 minute, open https://aicgjchiu.github.io/zsp-planning-doc/ (hard-refresh). Expected: Design Doc tab shows the new section with the "model missing" banner and empty tables.

---

### Task 7: Seed Enemies + Gameplay rows via curl

**Files:**
- Create: `<scratchpad>/seed_gameplay.py` (throwaway; not committed)

- [ ] **Step 1: Write the seeding script**

The data below is the spec's content tables, verbatim. JSON-in-shell is error-prone with Chinese text — generate payload files with python and post them sequentially with curl (per CLAUDE.md, file-based bodies only, no `-X POST`).

```python
# seed_gameplay.py — run with: python seed_gameplay.py
import json, subprocess, tempfile, os, sys

ENDPOINT = 'https://script.google.com/macros/s/AKfycbypjQj-_CrxjEovmHt5vzc0Iaysbwt3n0MglkG7MAsDMJII8B8YCqFOBM6eE4GKAFuc/exec'

ENEMIES = [
    # (Id, Name, Tier, HP, Damage, MoveSpeed, SpawnWeight, Basis, Behavior)
    ('en-jiangshi', 'Jiangshi 殭屍', 'trash', '100', '25/hit', '300', '55', 'as-built',
     'Standard chaser (as-built `Zombie`, ×1.0 dmg); soul orb +75 SP; 2s spawn protection'),
    ('en-jujiang', 'Giant Jiangshi 巨殭', 'elite', '300', '50/hit', '180', '10', 'as-built',
     'Heavy bruiser (as-built `Brute`, 2× scale, ×2.0 dmg); soul orb +100 SP'),
    ('en-blackdog', 'Black Dog 黑狗', 'trash', '50', '18.75/hit', '420', '20', 'as-built',
     'Fast flanker (as-built `Runner`, 0.6× scale, ×0.75 dmg); soul orb +65 SP; punishes players standing still channeling'),
    ('en-yao', 'Yao 狐妖', 'trash', '70', '8/bolt (ranged)', '400', '15', 'target',
     'Not implemented. Keeps 8–12m distance, fires spirit bolts, repositions after 2 shots'),
    ('en-corpse-general', 'Corpse General 屍將軍', 'boss', '4000', '25/slam', '300', '', 'target',
     'Not implemented (boss framework is game-side Q3; current elite = PlagueBearer vote-card modifier). Summons Jiangshi waves at 75%/50%/25% HP; slam telegraphed 1s'),
]

GAMEPLAY = [
    # (Id, Section, Name, Value, Unit, Basis, Notes)
    ('gp-find-portal', 'Pacing', 'Find Portal time', '75', 's', 'target', '250m map, random Portal spawn (portal-hop loop not yet built)'),
    ('gp-portal-cd', 'Pacing', 'Portal hop cooldown', '300', 's', 'target', 'From Systems "Player Portal" note (5-minute CD); hop loop not yet built'),
    ('gp-activate', 'Pacing', 'Activate channel', '5', 's', 'as-built', 'E-channel on player Portal'),
    ('gp-defense', 'Pacing', 'Post-activate defense countdown', '60', 's', 'as-built', 'Run-start beat; player Portal HP 1000'),
    ('gp-farm-rate', 'Pacing', 'Teams choosing to farm', '0.5', 'ratio', 'target', 'Model assumption; revisit with playtests'),
    ('gp-farm-len', 'Pacing', 'Farm extension length', '300', 's', 'target', '"farm 5 more minutes" from Core Loop'),
    ('gp-boss-rate', 'Pacing', 'Boss-triggered rate', '0.4', 'ratio', 'target', '屍將軍 not implemented; mostly hit by farming teams'),
    ('gp-boss-len', 'Pacing', 'Boss fight length', '120', 's', 'target', 'Target kill time for 屍將軍 at map-1 power'),
    ('gp-eportal-tier', 'Pacing', 'Enemy Portal tier-up interval', '300', 's', 'as-built', 'Tiers 0–7 (top ≈ 35 min); lagging portals catch up at ×3'),
    ('gp-eportal-spawn', 'Pacing', 'Enemy Portal spawn top-up', '2', 's', 'as-built', 'Refills to 5 alive per portal'),
    ('gp-eportal-add', 'Pacing', 'New enemy Portal cadence', '20', 's', 'as-built', 'Manager opens another portal (min spacing 5000 uu; destroyed → 60s respawn)'),
    ('gp-card-tier', 'Pacing', 'Card tiers reach final', '540', 's', 'as-built', 'T0 for 240s → T1 for 300s → T2 (effective final) from 9:00'),
    ('gp-ttk-jiangshi', 'Combat', 'TTK: Jiangshi', '2', 's', 'target', 'As-built anchor: 9 basic shots (12 dmg) or 2 empowered bullets (60 dmg)'),
    ('gp-ttk-yao', 'Combat', 'TTK: Yao 狐妖', '2.5', 's', 'target', 'Mobile target; not implemented'),
    ('gp-ttk-blackdog', 'Combat', 'TTK: Black Dog', '1', 's', 'target', 'Fragile; threat is speed, not HP'),
    ('gp-enemy-swing', 'Combat', 'Enemy swing attack', '25', 'dmg', 'as-built', 'Base 25, CD 2s, scaled by variant multiplier'),
    ('gp-enemy-pounce', 'Combat', 'Enemy pounce', '50', 'dmg', 'as-built', 'AoE radius 200 uu'),
    ('gp-enemy-sense', 'Combat', 'Enemy perception range', '1500', 'uu', 'as-built', 'Chase memory 5s; ignores downed players'),
    ('gp-revive-cd', 'Combat', 'Revive CD ladder', '8/16/30/60', 's', 'as-built', 'DefaultGame.ini; bleed-out 30s, crawl 80 uu/s, ally revive channel 4s (text value; not consumed by the model)'),
    ('gp-vote-sp', 'Economy', 'Vote trigger SP bar', '500', 'SP', 'as-built', '+250 per round; first vote ≈ 7 Jiangshi; per-portal soul-threshold voting disabled (full soul bar only tiers up)'),
    ('gp-soul-orb', 'Economy', 'Soul orb attract radius', '700', 'uu', 'as-built', '+250 with SoulGather card; orb expires in 15s; each orb +5 Spiria'),
    ('gp-spiria-regen', 'Economy', 'Spiria natural regen', '0', '/s', 'as-built', 'Starts at 0; recovery only via soul orbs (+5) and Mana Potion (+25)'),
]

def push(tab, key, fields):
    body = {'Tab': tab, 'Key': key, 'Fields': fields, 'UpdatedBy': 'Claude (design-doc sync)'}
    fd, path = tempfile.mkstemp(suffix='.json'); os.close(fd)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(body, f, ensure_ascii=False)
    out = subprocess.run(['curl', '-sL', '-H', 'Content-Type: text/plain;charset=utf-8',
                          '--data-binary', '@' + path, ENDPOINT],
                         capture_output=True, text=True, encoding='utf-8')
    os.unlink(path)
    print(tab, key, '->', out.stdout.strip())
    if '"ok":true' not in out.stdout.replace(' ', ''):
        sys.exit('FAILED on %s/%s' % (tab, key))

for i, (id_, name, tier, hp, dmg, spd, wt, basis, beh) in enumerate(ENEMIES):
    push('Enemies', id_, {'Name': name, 'Map': 'hamlet', 'Tier': tier, 'HP': hp, 'Damage': dmg,
                          'MoveSpeed': spd, 'SpawnWeight': wt, 'Basis': basis,
                          'Behavior': beh, 'Hidden': False, 'SortOrder': (i+1)*1000})

for i, (id_, sec, name, val, unit, basis, notes) in enumerate(GAMEPLAY):
    push('Gameplay', id_, {'Section': sec, 'Name': name, 'Value': val, 'Unit': unit,
                           'Basis': basis, 'Notes': notes, 'Hidden': False, 'SortOrder': (i+1)*1000})

print('done: %d enemies, %d gameplay params' % (len(ENEMIES), len(GAMEPLAY)))
```

- [ ] **Step 2: Run it**

Run: `python <scratchpad>/seed_gameplay.py`
Expected: one `-> {"ok":true}` line per row, ending `done: 5 enemies, 22 gameplay params`.

- [ ] **Step 3: Verify via GET**

```bash
curl -sL "$ENDPOINT" | python -c "import json,sys; d=json.load(sys.stdin); print(len(d['enemies']), len(d['gameplay']))"
```

Expected: `5 22`

- [ ] **Step 4: Verify the banner math in the browser**

Open the live site (hard-refresh), Design Doc tab. Expected banner: **"NightMarket segment: 5.1–12.1 min · expected 8.4 min"** (min 305s, expected 503s, max 725s), three-segment bar, params grouped Pacing/Combat/Economy with amber `target` / green `as-built` chips, Enemies table grouped under "NightMarket · 夜市" with 屍將軍 as a set-apart boss row.

---

### Task 8: Sync as-built numbers into Characters / Items / Systems

**Files:**
- Create: `<scratchpad>/sync_asbuilt.py` (throwaway; not committed)

- [ ] **Step 1: Write the sync script**

```python
# sync_asbuilt.py — run with: python sync_asbuilt.py
import json, subprocess, tempfile, os, sys

ENDPOINT = 'https://script.google.com/macros/s/AKfycbypjQj-_CrxjEovmHt5vzc0Iaysbwt3n0MglkG7MAsDMJII8B8YCqFOBM6eE4GKAFuc/exec'

def push(tab, key, fields):
    body = {'Tab': tab, 'Key': key, 'Fields': fields, 'UpdatedBy': 'Claude (design-doc sync)'}
    fd, path = tempfile.mkstemp(suffix='.json'); os.close(fd)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(body, f, ensure_ascii=False)
    out = subprocess.run(['curl', '-sL', '-H', 'Content-Type: text/plain;charset=utf-8',
                          '--data-binary', '@' + path, ENDPOINT],
                         capture_output=True, text=True, encoding='utf-8')
    os.unlink(path)
    print(tab, key, '->', out.stdout.strip())
    if '"ok":true' not in out.stdout.replace(' ', ''):
        sys.exit('FAILED on %s/%s' % (tab, key))

# --- Characters: Daoshi summary + ability descs with as-built numbers ---
abilities = [
    {'key': 'Q', 'name': 'Spiria Bullet · 靈能彈', 'type': 'Skill',
     'desc': ("Toggle (Q) — while active, each shot spends 5 Spiria and hits ×5 (12 → 60 damage); "
              "turns off on toggle or when out of Spiria. Implemented in code. "
              "質變 family — its own stacking cards + 質變 pool TBD (Fire & Thunder built first)."),
     'impl': 'Implemented'},
    {'key': 'R', 'name': 'Fire Talisman · 火符', 'type': 'Skill',
     'desc': ("Throws a talisman — 18 damage on detonation into a fire zone (radius 300, 5s, ticks every 0.5s). "
              "20 Spiria, CD 2s. Great vs. clusters. Base implemented in code. "
              "Stacking cards (repeatable per pick): 烈焰 Searing (+burn dmg) · 分火 Split Flame (+1 talisman) · 速燃 Quick Burn (−cooldown). "
              "Every 3 Fire invests → one 質變 pick from Fire's pool: 燎原 Wildfire (burn spreads) · 焚滅 Cremate (burning deaths detonate) · "
              "不滅業火 Eternal Pyre (player fire aura) · 業火印 Backdraft (zones linger; recast detonates all) · 隕炎 Meteor (delayed meteor on impact). "
              "質變s stack and compose."),
     'impl': 'Implemented'},
    {'key': 'T', 'name': 'Thunder Talisman · 雷符', 'type': 'Skill',
     'desc': ("Talisman flies as before; on hit it starts an electric DoT (6 per 0.5s × 3s = 36/target) that chains "
              "enemy-to-enemy along lightning arcs — 5 hops (0.1s/hop, whole-chain cap 40, +1 hop per Arc Extension). "
              "15 Spiria, CD 5s. Implemented in code (CL 206). "
              "Stacking cards (repeatable per pick): 電壓 Voltage (+shock dmg) · 速放 Quick Discharge (−cooldown) · 延弧 Arc Extension (+1 chain hop) · "
              "蓄電 Sustained Charge (+DoT duration, also lengthens stun). "
              "Every 3 Thunder invests → one 質變 pick from Thunder's pool: 感電 Stun (chained enemies briefly stunned) · 分叉 Forked (chain branches to 2 per hop) · "
              "導體 Conductor (each hop hits harder) · 無盡連鎖 Unlimited Chain (HIDDEN — auto-unlocks at Arc Extension ×5; uncaps the hop limit, distance-limited only). "
              "質變s stack and compose."),
     'impl': 'Implemented'},
    {'key': 'Ult', 'name': 'Bagua Ward · 八卦結界', 'type': 'Ultimate',
     'desc': ("Lays a 6m octagonal ward on the ground for 8s. Allies inside take −40% damage; "
              "enemies entering get −30% move speed. Designed as the Activate-defense anchor."),
     'impl': 'Design only'},
]
push('Characters', 'daoshi', {
    'Summary': 'Throws talismans, bends the five elements, seals wards. HP 1000 · move 600 uu/s · Spiria 100 (starts 0, no natural regen) · basic shot 12. Strong zone control',
    'AbilitiesJson': json.dumps(abilities, ensure_ascii=False),
})

# --- Items: as-built values (user-arbitrated 2026-08-06) ---
push('Items', 'throwing_dagger', {
    'Effect': 'Projectile weapon — 15 damage, range 5000.',
    'Stack': 10,
    'Existing': True,
})
push('Items', 'mana_potion', {
    'Effect': 'Restores 25 Spiria instantly.',
    'Stack': 5,
    'Existing': True,
})

# --- Systems: notes refreshed to as-built flow (both are implemented → In code) ---
push('Systems', 'sys-seed-3', {
    'SysStatus': 'In code',
    'Notes': ('As-built flow: enemy 4-card vote (5s vote + 3s reveal) → player draft 3-pick (15s) → 質變 pick (15s). '
              'Triggered by the team SP bar (500, +250 per round) — per-portal soul thresholds no longer trigger votes. '
              '(Supersedes the 3-option 10%-floor design.)'),
})
push('Systems', 'sys-seed-2', {
    'SysStatus': 'In code',
    'Notes': ('Absorbs Corrupia from time + player damage taken (1 HP = 1 soul to the active portal). '
              'Tier ladder: +1 tier per 300s (tiers 0–7, top ≈ 35 min; laggards catch up ×3). '
              'Spawns top up to 5 alive every 2s; manager opens another portal every 20s '
              '(min spacing 5000 uu; destroyed → 60s respawn).'),
})

print('done: daoshi + 2 items + 2 systems')
```

(`sys-seed-2` = "Enemy Portal", `sys-seed-3` = "Vote-upgrade" — verified against the live sheet ids. Both subsystems are done per the task board, so `SysStatus` flips to `In code` alongside the note refresh.)

- [ ] **Step 2: Run it**

Run: `python <scratchpad>/sync_asbuilt.py`
Expected: five `-> {"ok":true}` lines, ending `done: daoshi + 2 items + 2 systems`.

- [ ] **Step 3: Verify via GET + browser**

```bash
curl -sL "$ENDPOINT" | python -c "
import json,sys; d=json.load(sys.stdin)
c=[x for x in d['characters'] if x['Id']=='daoshi'][0]
print('60 damage' in c['AbilitiesJson'], 'HP 1000' in c['Summary'])
print([x['Effect'] for x in d['items'] if x['Id'] in ('throwing_dagger','mana_potion')])
print([x['SysStatus'] for x in d['systems'] if x['Id'] in ('sys-seed-2','sys-seed-3')])
"
```

Expected: `True True`, the two as-built Effect strings, `['In code', 'In code']`.

Browser (live site, hard-refresh): Daoshi card shows the numeric ability descs; Items rows show 15 dmg / +25 Spiria with "Implemented" chips; Systems rows show the new notes with "In code" chips.

---

### Task 9: Documentation — CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (tab list in § Task Board sync; § When Editing)

- [ ] **Step 1: Add the tab-header bullets**

In the `**Tabs:**` list (after the `QuarterPlan` bullet), insert:

```markdown
  - **`Enemies`** headers: `Id | Name | Map | Tier | HP | Damage | MoveSpeed | SpawnWeight | Behavior | Basis | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`  — `Map` is a Maps-tab id; `Tier` is `trash / elite / boss`; `Basis` is `target` (designer-proposed) or `as-built` (verified in the UE 5.7 project). Themed display names carry as-built variant stats (e.g. Jiangshi 殭屍 = as-built `Zombie`).
  - **`Gameplay`** headers: `Id | Section | Name | Value | Unit | Basis | Notes | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`  — `Section` is `Pacing / Combat / Economy`. The Design Doc's run-segment banner computes from the well-known ids `gp-find-portal / gp-portal-cd / gp-activate / gp-farm-rate / gp-farm-len / gp-boss-rate / gp-boss-len` — renaming those ids breaks the model (it degrades to a "model missing" notice).
```

- [ ] **Step 2: Add the editing bullet**

In § "When Editing", after the "Add a character / map / item" bullet, insert:

```markdown
- **Gameplay & Numbers (Design Doc tab):** enemy stats and pacing/combat/economy parameters live in the `Enemies` / `Gameplay` sheet tabs, edited via `⋯` / `＋` like every other section. Every row carries `Basis` — `target` (amber chip) vs `as-built` (green chip, verified against the game repo). The run-segment banner is derived, not stored — edit the `gp-*` parameter rows to change it.
```

- [ ] **Step 3: Commit + push**

```bash
git add CLAUDE.md
git commit -m "Docs: Enemies + Gameplay tabs, Gameplay & Numbers editing notes"
git push
```

---

### Task 10: Final verification sweep

- [ ] **Step 1: Full-page check on the live site**

Hard-refresh https://aicgjchiu.github.io/zsp-planning-doc/ → Design Doc tab:
1. Banner reads "NightMarket segment: 5.1–12.1 min · expected 8.4 min".
2. Param table: 12 Pacing / 7 Combat / 3 Economy rows, chips colored by Basis.
3. Enemies: 5 rows under "NightMarket · 夜市", 屍將軍 visually set apart.
4. Edit a param (e.g. `gp-farm-rate` → 0.6), save → banner expected value changes to 8.9 min after the optimistic re-render; revert to 0.5.
5. Systems section renumbered 07, Open Questions 08.
6. No console errors; sync pill green.

- [ ] **Step 2: Report**

Summarize to the user: live URL, what changed, the banner numbers, and that the game-session digest is the source for all `as-built` values.

---

## Plan Self-Review (completed)

- **Spec coverage:** schema (T1/T7), backend + deploy (T1), frontend renderers/banner/modals (T2–T5), placement + renumbering (T3), content seed (T7), Characters/Items/Systems sync (T8), CLAUDE.md (T9). Banner caption + as-built anchors in T4 Step 1. ✓
- **Deviation from spec, intentional:** enemies with an unknown `Map` id render under "Unassigned map" instead of being hidden (visible + editable beats silent filtering). `SysStatus` flips to `In code` for the two synced Systems rows (their subsystems are done per the task board; leaving "Design" next to an as-built note would contradict itself).
- **Type consistency:** `renderGameplay`/`renderEnemies`/`openGameplayModal`/`openEnemyModal`/`basisChip` names match across T2 stubs, T4 renderers, T5 modals, and `mountSectionAddButtons` wiring. State names `enemiesState`/`gameplayState` consistent. Tab strings `'Enemies'`/`'Gameplay'` consistent across pushRow calls, patch branches, and Apps Script.
- **Placeholder scan:** none. All code blocks complete.
