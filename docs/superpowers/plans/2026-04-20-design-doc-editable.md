# Design Doc Editable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Design Doc tab (Characters, Items, Maps, Systems) fully editable from the UI, with the Google Sheet as source of truth. Seed from existing `window.*` globals. Reuse the Task Board's modal infrastructure and `pushRow` envelope.

**Architecture:** Four new sheet tabs (`Characters`, `Items`, `Maps`, `Systems`) managed by the existing `{Tab, Key, Fields}` POST envelope after a small Apps Script generalization. Client stores per-type state arrays (`charactersState` / `itemsState` / `mapsState` / `systemsState`), renders from those arrays, and routes edits through the shared `openModal` infrastructure built during the Task Board migration. Abilities are nested as `JSON.stringify` in a single cell on the Characters row — no separate Abilities tab. Staged delivery: Items+Systems → Maps → Characters+Abilities.

**Tech Stack:** Vanilla HTML/CSS/JS (no build, no framework, no test framework). Google Apps Script backend. Verification is **manual browser testing** + **curl for backend** (tasks state expected outputs explicitly).

---

## Reference spec

`docs/superpowers/specs/2026-04-20-design-doc-editable-design.md`

## File structure summary

| File | Responsibility after this plan |
|---|---|
| `apps-script.gs` | Mirror of deployed script. `doGet` returns 6 tabs (tasks, team, characters, items, maps, systems). `handleUpsert` detects key column from `headers[0]` (generalizes beyond Tasks/Team). `handleBootstrap` per-tab independent seeding. `Config` / `Unlock` paths unchanged. |
| `data.js` | Unchanged during rollout. `window.CHARACTERS / ITEMS / MAPS / SYSTEMS` stay as seed-only fallback. Post-migration PR removes them. |
| `app.js` | New state arrays + 4 normalizers. `fetchAll` parses new shape. `bootstrapIfEmpty` extended to seed four new tabs per-type. Four new modal functions (`openItemModal`, `openSystemModal`, `openMapModal`, `openCharacterModal`). Existing `renderCharacters` / `renderItems` / `renderMaps` / `renderSystems` rewritten to read from state. |
| `index.html` | Section headers in Design Doc tab get `<span class="section-add"></span>` placeholders for ＋ buttons. No structural changes. |
| `styles.css` | Small additions: `.section-add` button positioning, `.row-menu-btn` for table rows, `.abilities-subtable` for the character modal. |
| `CLAUDE.md` | Updated to note the four new tabs and that `data.js` globals are seed-only. |

## Execution order rationale

Stage A lands all the shared infrastructure (normalizers, state, bootstrap) plus the two simplest types (Items, Systems). At the end of Stage A the page works end-to-end for those two types; the other two still read from `window.*` globals via the old code paths. Stage B wires Maps. Stage C wires Characters with the unique abilities sub-table, then removes the last `window.*` reads. This ordering lets you stop after any stage if needed.

A single branch — `design-doc-editable` — carries all three stages; each task commits separately so diffs are readable.

---

## Preflight: create branch

**Files:** none

- [ ] **Step 1: Create and check out the feature branch**

```bash
cd 'D:/AiCG Docs/ZSP Project'
git checkout -b design-doc-editable
```

Expected: `Switched to a new branch 'design-doc-editable'`.

---

# Stage A — Infrastructure + Items + Systems

## Task 1: Rewrite `apps-script.gs`

**Files:**
- Modify: `apps-script.gs` (full rewrite)

- [ ] **Step 1: Replace entire file with the new version**

Write `apps-script.gs` at the repo root with exactly these contents:

```javascript
// Reference copy of the Google Apps Script backing the Task Board + Design Doc.
// Deployed from the Google Sheet:
//   https://docs.google.com/spreadsheets/d/1Od7n8hbOO24SIJiyGR7ctfYTkkLdUXLVf06KiUCY0hQ/edit
// This file is NOT loaded by the site — it's a mirror so the script is version-controlled.
// To change behavior: edit in Apps Script editor (Extensions → Apps Script on the sheet),
// then Deploy → Manage deployments → New version → Deploy. Update this file to match.

const TASKS_SHEET      = 'Tasks';
const TEAM_SHEET       = 'Team';
const CHARACTERS_SHEET = 'Characters';
const ITEMS_SHEET      = 'Items';
const MAPS_SHEET       = 'Maps';
const SYSTEMS_SHEET    = 'Systems';
const CONFIG_SHEET     = 'Config'; // private — NEVER returned in GET

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return jsonOut({
    ok: true,
    tasks:      readTab(ss.getSheetByName(TASKS_SHEET)),
    team:       readTab(ss.getSheetByName(TEAM_SHEET)),
    characters: readTab(ss.getSheetByName(CHARACTERS_SHEET)),
    items:      readTab(ss.getSheetByName(ITEMS_SHEET)),
    maps:       readTab(ss.getSheetByName(MAPS_SHEET)),
    systems:    readTab(ss.getSheetByName(SYSTEMS_SHEET)),
  });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.Action === 'bootstrap') return handleBootstrap(body);
    if (body.Action === 'unlock')    return handleUnlock(body);
    return handleUpsert(body);
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function handleUnlock(body) {
  const submitted = (body && body.Password != null) ? String(body.Password) : '';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG_SHEET);
  if (!sheet) return jsonOut({ ok: false, error: 'Config tab missing' });
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return jsonOut({ ok: false, error: 'Config empty' });
  const headers = data[0];
  const keyCol = headers.indexOf('Key');
  const valCol = headers.indexOf('Value');
  if (keyCol < 0 || valCol < 0) return jsonOut({ ok: false, error: 'Config headers must be Key|Value' });
  let expected = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][keyCol]) === 'password') { expected = String(data[i][valCol]); break; }
  }
  if (expected == null) return jsonOut({ ok: false, error: 'password row missing in Config' });
  return jsonOut({ ok: true, unlocked: submitted === expected });
}

function handleUpsert(body) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(body.Tab);
  if (!sheet) return jsonOut({ ok: false, error: 'Unknown tab: ' + body.Tab });
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  // First column is always the primary key by convention.
  const keyColName = headers[0];
  const keyCol = 0;

  const now = new Date().toISOString();
  const updatedBy = body.UpdatedBy || '';
  const fields = body.Fields || {};

  // find existing row
  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][keyCol] === body.Key) { rowIdx = i + 1; break; }
  }

  if (rowIdx === -1) {
    const row = headers.map(h => {
      if (h === keyColName) return body.Key;
      if (h === 'CreatedAt') return now;
      if (h === 'UpdatedAt') return now;
      if (h === 'UpdatedBy') return updatedBy;
      if (h === 'Status' && fields[h] == null) return 'todo';
      if (h === 'Hidden' && fields[h] == null) return false;
      if (h === 'Active' && fields[h] == null) return true;
      if (fields[h] != null) return fields[h];
      return '';
    });
    sheet.appendRow(row);
  } else {
    headers.forEach((h, i) => {
      if (h === 'UpdatedAt') { sheet.getRange(rowIdx, i + 1).setValue(now); return; }
      if (h === 'UpdatedBy') { sheet.getRange(rowIdx, i + 1).setValue(updatedBy); return; }
      if (fields[h] !== undefined) sheet.getRange(rowIdx, i + 1).setValue(fields[h]);
    });
  }

  return jsonOut({ ok: true });
}

function handleBootstrap(body) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10 * 1000)) {
    return jsonOut({ ok: false, error: 'Could not acquire lock' });
  }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const seedMap = {
      Tasks:      body.Tasks,
      Team:       body.Team,
      Characters: body.Characters,
      Items:      body.Items,
      Maps:       body.Maps,
      Systems:    body.Systems,
    };
    const seeded = {};
    Object.keys(seedMap).forEach(name => {
      const rows = seedMap[name];
      if (!rows || !rows.length) return;
      const sheet = ss.getSheetByName(name);
      if (!sheet) return;
      if (sheet.getLastRow() > 1) { seeded[name] = false; return; }
      writeRows(sheet, rows);
      seeded[name] = true;
    });
    return jsonOut({ ok: true, seeded });
  } finally {
    lock.releaseLock();
  }
}

function writeRows(sheet, rows) {
  if (!rows.length) return;
  const headers = sheet.getDataRange().getValues()[0];
  const matrix = rows.map(r => headers.map(h => (r[h] != null ? r[h] : '')));
  sheet.getRange(sheet.getLastRow() + 1, 1, matrix.length, headers.length).setValues(matrix);
}

function readTab(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = r[i]);
    return obj;
  });
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps-script.gs
git commit -m "Apps Script: generalize key-col, expand doGet to 6 tabs, per-tab bootstrap"
```

---

## Task 2: User deploys new script + creates four new tabs

**Files:** none (Google-side)

- [ ] **Step 1: Open the backing sheet**

Navigate: https://docs.google.com/spreadsheets/d/1Od7n8hbOO24SIJiyGR7ctfYTkkLdUXLVf06KiUCY0hQ/edit

- [ ] **Step 2: Create four new tabs with exact headers**

For each tab, right-click any existing tab → Insert sheet → set name exactly:

**`Characters`** — row 1 headers, one per cell, in order:
`Id | Name | Culture | RoleText | Weapon | Status | StatusChip | Summary | AbilitiesJson | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`

**`Items`** — row 1 headers:
`Id | Name | Kind | Effect | Stack | Existing | Notes | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`

**`Maps`** — row 1 headers:
`Id | Name | Theme | Size | Enemies | Boss | Difficulty | BiomeNotes | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`

**`Systems`** — row 1 headers:
`Id | System | SysStatus | Dep | Owner | Notes | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`

All four tabs have only the header row — no data rows. Client will seed them on first load.

- [ ] **Step 3: Paste updated script + deploy**

1. Extensions → Apps Script.
2. In `Code.gs`: select all, delete, paste the contents of `apps-script.gs` from the repo.
3. Deploy → Manage deployments → pencil icon → Version: **New version** → Deploy. `/exec` URL stays unchanged.

- [ ] **Step 4: Verify GET returns 6 tabs via curl**

```bash
curl -sL 'https://script.google.com/macros/s/AKfycbypjQj-_CrxjEovmHt5vzc0Iaysbwt3n0MglkG7MAsDMJII8B8YCqFOBM6eE4GKAFuc/exec' | python -c "import sys,json; d=json.load(sys.stdin); print('keys:', list(d.keys())); [print(k+':', len(d.get(k,[]))) for k in ['tasks','team','characters','items','maps','systems']]; print('config leaked?', 'config' in d)"
```

Expected:
```
keys: ['ok', 'tasks', 'team', 'characters', 'items', 'maps', 'systems']
tasks: 58
team: 4
characters: 0
items: 0
maps: 0
systems: 0
config leaked? False
```

If any of the four new counts is not 0, the client-side bootstrap in Task 4 will detect that tab has data and skip seeding. If any key is missing from the GET, the script redeploy didn't take effect — re-do Step 3.

---

## Task 3: Add module state, constants, and normalizers to `app.js`

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Locate insertion point**

Open `app.js`. Find the block that starts with `// Module state` inside the Task Board section (introduced during the prior migration). It currently reads roughly:

```javascript
  // Module state
  let teamState = [];        // array of { MemberId, Name, RoleKey, RoleLabel, Order, Active, ... }
  let taskState = [];        // array of task objects from sheet
  let userName = '';         // cached identity
  let syncStatus = 'idle';
  let lastSyncAt = null;
  let pendingWrites = 0;
```

- [ ] **Step 2: Extend module state with four new arrays**

Replace the `// Module state` block above with:

```javascript
  // Module state
  let teamState       = [];        // array of Team objects
  let taskState       = [];        // array of Task objects
  let charactersState = [];        // array of Character objects (AbilitiesJson parsed to .abilities)
  let itemsState      = [];        // array of Item objects
  let mapsState       = [];        // array of Map objects
  let systemsState    = [];        // array of System object
  let userName        = '';        // cached identity
  let syncStatus      = 'idle';
  let lastSyncAt      = null;
  let pendingWrites   = 0;
```

- [ ] **Step 3: Add constants used by the Design Doc modals**

Find the existing `const PRIORITIES = [...]` block earlier in the Task Board section. Insert these new constant blocks directly AFTER that `PRIORITIES` block:

```javascript
  const ABILITY_KEYS = ['Q', 'R', 'T']; // fixed slot count per design
  const ABILITY_TYPES = [
    { v:'Skill',    label:'Skill' },
    { v:'Ultimate', label:'Ultimate' },
  ];
  const ABILITY_IMPLS = [
    { v:'Implemented', label:'Implemented' },
    { v:'Partial',     label:'Partial' },
    { v:'Design only', label:'Design only' },
  ];
  const MAP_DIFFICULTIES = [
    { v:'Tutorial map / Run 1', label:'Tutorial map / Run 1' },
    { v:'Run 2',                label:'Run 2' },
    { v:'Run 3',                label:'Run 3' },
    { v:'Final map / Run 4+',   label:'Final map / Run 4+' },
  ];
  const SYS_STATUSES = [
    { v:'In code',     label:'In code' },
    { v:'Partial',     label:'Partial' },
    { v:'Not started', label:'Not started' },
    { v:'Design',      label:'Design' },
  ];
```

Note: `SYS_STATUSES` includes `Design` because the existing `window.SYSTEMS` uses that value for rows not yet coded.

- [ ] **Step 4: Add four normalizers after the existing `normalizeTeamRow`**

Find `function normalizeTeamRow(r){` (introduced earlier). Insert the four new normalizers immediately AFTER its closing `}`:

```javascript
  function normalizeCharacterRow(r){
    let abilities = [];
    try {
      const parsed = JSON.parse(r.AbilitiesJson || '[]');
      if (Array.isArray(parsed)) abilities = parsed;
    } catch(e) {}
    return {
      Id:         String(r.Id || ''),
      Name:       String(r.Name || ''),
      Culture:    String(r.Culture || ''),
      RoleText:   String(r.RoleText || ''),
      Weapon:     String(r.Weapon || ''),
      Status:     String(r.Status || ''),
      StatusChip: String(r.StatusChip || ''),
      Summary:    String(r.Summary || ''),
      abilities:  abilities,
      Hidden:     r.Hidden === true || r.Hidden === 'TRUE' || r.Hidden === 'true',
      SortOrder:  Number(r.SortOrder) || 0,
      CreatedAt:  String(r.CreatedAt || ''),
      UpdatedAt:  String(r.UpdatedAt || ''),
      UpdatedBy:  String(r.UpdatedBy || ''),
    };
  }
  function normalizeItemRow(r){
    return {
      Id:         String(r.Id || ''),
      Name:       String(r.Name || ''),
      Kind:       String(r.Kind || ''),
      Effect:     String(r.Effect || ''),
      Stack:      Number(r.Stack) || 0,
      Existing:   r.Existing === true || r.Existing === 'TRUE' || r.Existing === 'true',
      Notes:      String(r.Notes || ''),
      Hidden:     r.Hidden === true || r.Hidden === 'TRUE' || r.Hidden === 'true',
      SortOrder:  Number(r.SortOrder) || 0,
      CreatedAt:  String(r.CreatedAt || ''),
      UpdatedAt:  String(r.UpdatedAt || ''),
      UpdatedBy:  String(r.UpdatedBy || ''),
    };
  }
  function normalizeMapRow(r){
    return {
      Id:         String(r.Id || ''),
      Name:       String(r.Name || ''),
      Theme:      String(r.Theme || ''),
      Size:       String(r.Size || ''),
      Enemies:    String(r.Enemies || ''),
      Boss:       String(r.Boss || ''),
      Difficulty: String(r.Difficulty || 'Run 2'),
      BiomeNotes: String(r.BiomeNotes || ''),
      Hidden:     r.Hidden === true || r.Hidden === 'TRUE' || r.Hidden === 'true',
      SortOrder:  Number(r.SortOrder) || 0,
      CreatedAt:  String(r.CreatedAt || ''),
      UpdatedAt:  String(r.UpdatedAt || ''),
      UpdatedBy:  String(r.UpdatedBy || ''),
    };
  }
  function normalizeSystemRow(r){
    return {
      Id:         String(r.Id || ''),
      System:     String(r.System || ''),
      SysStatus:  String(r.SysStatus || 'Design'),
      Dep:        String(r.Dep || ''),
      Owner:      String(r.Owner || ''),
      Notes:      String(r.Notes || ''),
      Hidden:     r.Hidden === true || r.Hidden === 'TRUE' || r.Hidden === 'true',
      SortOrder:  Number(r.SortOrder) || 0,
      CreatedAt:  String(r.CreatedAt || ''),
      UpdatedAt:  String(r.UpdatedAt || ''),
      UpdatedBy:  String(r.UpdatedBy || ''),
    };
  }
```

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "Design Doc: state arrays + constants + normalizers for 4 new types"
```

Page still functions — nothing yet reads from the new state arrays.

---

## Task 4: Extend `fetchAll` + `bootstrapIfEmpty` to cover the four new tabs

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Update `fetchAll` to populate new state**

Find `async function fetchAll(){` in `app.js`. Inside its `try` block, there's currently:

```javascript
      taskState = (json.tasks || []).map(normalizeTaskRow);
      teamState = (json.team  || []).map(normalizeTeamRow);
```

Replace those two lines with:

```javascript
      taskState       = (json.tasks      || []).map(normalizeTaskRow);
      teamState       = (json.team       || []).map(normalizeTeamRow);
      charactersState = (json.characters || []).map(normalizeCharacterRow);
      itemsState      = (json.items      || []).map(normalizeItemRow);
      mapsState       = (json.maps       || []).map(normalizeMapRow);
      systemsState    = (json.systems    || []).map(normalizeSystemRow);
```

Next, directly below those lines find:

```javascript
      if(teamState.length === 0 && taskState.length === 0){
        await bootstrapIfEmpty();
      }
```

Replace that condition with:

```javascript
      const anyEmpty =
        teamState.length === 0 || taskState.length === 0 ||
        charactersState.length === 0 || itemsState.length === 0 ||
        mapsState.length === 0 || systemsState.length === 0;
      if(anyEmpty){
        await bootstrapIfEmpty();
      }
```

Rationale: previously bootstrap ran only when both team and tasks were empty. Now we also want it to run when any of the 4 new tabs is empty (e.g. Tasks + Team already seeded but Characters empty — still need to seed Characters).

- [ ] **Step 2: Rewrite `bootstrapIfEmpty` to handle all six types per-tab**

Find `async function bootstrapIfEmpty(){` in `app.js`. Replace the entire function (through its closing `}`) with:

```javascript
  async function bootstrapIfEmpty(){
    const body = { Action: 'bootstrap' };

    if (taskState.length === 0 || teamState.length === 0) {
      const seedTasks = [];
      const src = window.TASKS || {};
      Object.keys(src).forEach(colKey => {
        const memberId = LEGACY_COL_TO_MEMBER[colKey];
        if(!memberId) return;
        (src[colKey] || []).forEach((t, idx) => {
          seedTasks.push({
            TaskId:    legacyTaskId(colKey, t, idx),
            MemberId:  memberId,
            Title:     t.title || '',
            Body:      t.body  || '',
            Phase:     t.phase || 1,
            Priority:  t.p     || 'P1',
            Status:    'todo',
            Notes:     '',
            Assignee:  '',
            Hidden:    false,
            SortOrder: (idx + 1) * 1000,
            CreatedAt: '',
            UpdatedAt: '',
            UpdatedBy: '',
          });
        });
      });
      if (taskState.length === 0) body.Tasks = seedTasks;
      if (teamState.length === 0) body.Team  = SEED_TEAM;
    }

    if (charactersState.length === 0 && Array.isArray(window.CHARACTERS)) {
      body.Characters = window.CHARACTERS.map((c, idx) => ({
        Id:            c.id || `char-seed-${idx}`,
        Name:          c.name || '',
        Culture:       c.culture || '',
        RoleText:      c.role || '',
        Weapon:        c.weapon || '',
        Status:        c.status || '',
        StatusChip:    c.statusChip || '',
        Summary:       c.summary || '',
        AbilitiesJson: JSON.stringify(Array.isArray(c.abilities) ? c.abilities : []),
        Hidden:        false,
        SortOrder:     (idx + 1) * 1000,
        CreatedAt:     '',
        UpdatedAt:     '',
        UpdatedBy:     '',
      }));
    }

    if (itemsState.length === 0 && Array.isArray(window.ITEMS)) {
      body.Items = window.ITEMS.map((it, idx) => ({
        Id:        it.id || `item-seed-${idx}`,
        Name:      it.name || '',
        Kind:      it.kind || '',
        Effect:    it.effect || '',
        Stack:     Number(it.stack) || 0,
        Existing:  !!it.existing,
        Notes:     it.notes || '',
        Hidden:    false,
        SortOrder: (idx + 1) * 1000,
        CreatedAt: '',
        UpdatedAt: '',
        UpdatedBy: '',
      }));
    }

    if (mapsState.length === 0 && Array.isArray(window.MAPS)) {
      body.Maps = window.MAPS.map((m, idx) => ({
        Id:         m.id || `map-seed-${idx}`,
        Name:       m.name || '',
        Theme:      m.theme || '',
        Size:       m.size || '',
        Enemies:    m.enemies || '',
        Boss:       m.boss || '',
        Difficulty: m.difficulty || 'Run 2',
        BiomeNotes: m.biomeNotes || '',
        Hidden:     false,
        SortOrder:  (idx + 1) * 1000,
        CreatedAt:  '',
        UpdatedAt:  '',
        UpdatedBy:  '',
      }));
    }

    if (systemsState.length === 0 && Array.isArray(window.SYSTEMS)) {
      body.Systems = window.SYSTEMS.map((s, idx) => ({
        Id:        s.id || `sys-seed-${idx}`,
        System:    s.sys || '',
        SysStatus: s.status || 'Design',
        Dep:       s.dep || '',
        Owner:     s.owner || '',
        Notes:     s.notes || '',
        Hidden:    false,
        SortOrder: (idx + 1) * 1000,
        CreatedAt: '',
        UpdatedAt: '',
        UpdatedBy: '',
      }));
    }

    // If nothing to seed, nothing to do.
    if (!body.Tasks && !body.Team && !body.Characters && !body.Items && !body.Maps && !body.Systems) return;

    try{
      const res = await fetch(SHEET_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if(!json.ok) throw new Error(json.error || 'bootstrap failed');
      // Re-fetch so state reflects seeded rows.
      const r2 = await fetch(SHEET_ENDPOINT, { method:'GET' });
      const j2 = await r2.json();
      taskState       = (j2.tasks      || []).map(normalizeTaskRow);
      teamState       = (j2.team       || []).map(normalizeTeamRow);
      charactersState = (j2.characters || []).map(normalizeCharacterRow);
      itemsState      = (j2.items      || []).map(normalizeItemRow);
      mapsState       = (j2.maps       || []).map(normalizeMapRow);
      systemsState    = (j2.systems    || []).map(normalizeSystemRow);
    }catch(err){
      console.warn('[bootstrap] error:', err);
    }
  }
```

- [ ] **Step 3: Manual verification (browser)**

1. Open `D:/AiCG Docs/ZSP Project/index.html` in a browser with DevTools open.
2. Enter password `AICGZSP` if the gate shows.
3. In DevTools Console, paste and run:
   ```js
   setTimeout(() => console.log('characters:', charactersState.length, 'items:', itemsState.length, 'maps:', mapsState.length, 'systems:', systemsState.length), 3000);
   ```
   Wait 3s, check output.
4. Expected: `characters: 4 items: 10 maps: 4 systems: 13`.
5. Open the backing sheet in another tab and refresh. The four new tabs should now have the seed rows.

If any count is 0 after 3 seconds: check DevTools Network tab for a POST response that failed. A missing tab on the server is the most common cause — re-verify Task 2 Step 2 for exact spelling of tab names.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "Design Doc: fetchAll + bootstrapIfEmpty cover 4 new types"
```

---

## Task 5: Section header ＋ button placeholders in `index.html`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the `<span class="section-add">` placeholder to each editable section header**

Find the Characters section header in `index.html`:

```html
<div class="section-title"><span class="num">02</span><h2>Characters × Abilities</h2><div class="aside">4 characters · 3 abilities each · 12 total</div></div>
```

Replace with:

```html
<div class="section-title"><span class="num">02</span><h2>Characters × Abilities</h2><div class="aside">4 characters · 3 abilities each · 12 total</div><span class="section-add" id="add-character-btn"></span></div>
```

Find Items section header:

```html
<div class="section-title"><span class="num">03</span><h2>Items</h2><div class="aside">10 pickups · 2 already in code</div></div>
```

Replace with:

```html
<div class="section-title"><span class="num">03</span><h2>Items</h2><div class="aside">10 pickups · 2 already in code</div><span class="section-add" id="add-item-btn"></span></div>
```

Find Maps section header:

```html
<div class="section-title"><span class="num">04</span><h2>Maps</h2><div class="aside">4 maps · each with one boss</div></div>
```

Replace with:

```html
<div class="section-title"><span class="num">04</span><h2>Maps</h2><div class="aside">4 maps · each with one boss</div><span class="section-add" id="add-map-btn"></span></div>
```

Find Systems section header:

```html
<div class="section-title"><span class="num">05</span><h2>Systems Matrix</h2><div class="aside">status · dependencies · owner</div></div>
```

Replace with:

```html
<div class="section-title"><span class="num">05</span><h2>Systems Matrix</h2><div class="aside">status · dependencies · owner</div><span class="section-add" id="add-system-btn"></span></div>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "Design Doc: section-add placeholders in headers"
```

---

## Task 6: CSS for section-add button + row menu button

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Append new CSS rules to the end of `styles.css`**

```css

/* ---- Design Doc edit affordances ---- */
.section-add { margin-left: 12px; display: inline-flex; }
.section-add button {
  background: transparent; border: 1px solid #ddd; border-radius: 4px;
  width: 24px; height: 24px; padding: 0; cursor: pointer;
  font-size: 14px; line-height: 1; color: var(--ink-2);
}
.section-add button:disabled { opacity: 0.4; cursor: not-allowed; }

/* ⋯ button inside a design-doc card (.card) */
.card .card-menu-btn {
  position: absolute; top: 10px; right: 10px;
  background: transparent; border: 1px solid #ddd; border-radius: 4px;
  width: 24px; height: 24px; padding: 0; cursor: pointer;
  font-size: 14px; line-height: 1; color: var(--ink-2);
}
.card { position: relative; }
.card .card-menu-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ⋯ button inside a design-doc table row */
.row-menu-btn {
  background: transparent; border: 1px solid #ddd; border-radius: 4px;
  width: 22px; height: 22px; padding: 0; cursor: pointer;
  font-size: 12px; line-height: 1; color: var(--ink-2);
}
.row-menu-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Abilities sub-table inside the Character modal */
.abilities-subtable { width: 100%; border-collapse: collapse; font-size: 12px; }
.abilities-subtable th, .abilities-subtable td { padding: 4px 6px; vertical-align: top; border-bottom: 1px solid #eee; }
.abilities-subtable th { text-align: left; font-weight: 600; color: #666; }
.abilities-subtable td.key-cell { font-family: var(--mono); font-weight: 600; text-align: center; width: 28px; }
.abilities-subtable input[type=text], .abilities-subtable select, .abilities-subtable textarea {
  width: 100%; box-sizing: border-box; font: inherit;
  padding: 3px 5px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #111;
}
.abilities-subtable textarea { min-height: 44px; resize: vertical; }
```

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "Design Doc: CSS for section-add, card-menu, row-menu, abilities subtable"
```

---

## Task 7: Add `mountSectionAddButtons()` helper + wire into `renderAll`

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Add the helper function**

Near the bottom of `app.js`, just before the closing `})();` of the IIFE, add this function:

```javascript
  function mountSectionAddButtons(){
    const canEdit = !!userName;
    const mounts = [
      { id:'add-character-btn', label:'＋ Character', onClick:() => openCharacterModal(null) },
      { id:'add-item-btn',      label:'＋ Item',      onClick:() => openItemModal(null) },
      { id:'add-map-btn',       label:'＋ Map',       onClick:() => openMapModal(null) },
      { id:'add-system-btn',    label:'＋ System',    onClick:() => openSystemModal(null) },
    ];
    mounts.forEach(m => {
      const host = qs('#' + m.id);
      if(!host) return;
      host.innerHTML = `<button ${canEdit?'':'disabled title="Set your name first"'}>${m.label}</button>`;
      const btn = qs('button', host);
      if(btn && canEdit) btn.addEventListener('click', m.onClick);
    });
  }
```

Note: all four `open*Modal` functions are referenced but only two (`openItemModal`, `openSystemModal`) will be implemented in Stage A. `openCharacterModal` and `openMapModal` come in later stages. We add stub declarations in the next step so the click handlers don't fail with `ReferenceError` during Stage A.

- [ ] **Step 2: Add stubs for unimplemented modal functions**

Still near the bottom of `app.js`, BEFORE the closing `})();` (and before `mountSectionAddButtons` if convenient, or after — both work):

```javascript
  function openCharacterModal(id){ alert('Character editor coming in Stage C.'); }
  function openMapModal(id){ alert('Map editor coming in Stage B.'); }
  // openItemModal and openSystemModal are implemented in this stage (below).
```

These stubs will be replaced in later tasks. Keep them as one-liners to make the replacement obvious.

- [ ] **Step 3: Call `mountSectionAddButtons` from `renderAll`**

In `app.js`, find `renderAll()`. After the line that calls `renderSystems();`, add:

```javascript
    mountSectionAddButtons();
```

Also call it from inside `renderBoard()` so the buttons update when identity is set — `renderBoard` already runs whenever the board re-renders and userName might have just been set. At the very top of `renderBoard()` you'll find:

```javascript
  function renderBoard(){
    renderLegend();
    const host = qs('#board');
```

Add `mountSectionAddButtons();` after `renderLegend();`:

```javascript
  function renderBoard(){
    renderLegend();
    mountSectionAddButtons();
    const host = qs('#board');
```

- [ ] **Step 4: Manual verification**

1. Reload `index.html`.
2. Navigate to the Design Doc tab.
3. Each section header should show its ＋ button (`＋ Character`, `＋ Item`, `＋ Map`, `＋ System`) to the right of the "aside" text.
4. If you've entered your name, buttons are enabled. If not, they're disabled with the tooltip.
5. Click `＋ Character` → alert "Character editor coming in Stage C." (expected — stub)
6. Click `＋ Map` → alert "Map editor coming in Stage B." (expected)
7. Click `＋ Item` / `＋ System` → throws a `ReferenceError` in console. The functions aren't defined until Task 8 (Items) / Task 9 (Systems). Expected intermediate state — do not treat as a bug.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "Design Doc: mount ＋ buttons in section headers with stubs"
```

---

## Task 8: Implement `openItemModal` + rewrite `renderItems`

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Implement `openItemModal`**

Near the bottom of `app.js` (where `openCharacterModal` stub lives), add a new function (do NOT remove the character/map stubs yet):

```javascript
  function openItemModal(id){
    const isNew = !id;
    const it = isNew
      ? { Id:'', Name:'', Kind:'', Effect:'', Stack:1, Existing:false, Notes:'', Hidden:false, SortOrder:0 }
      : itemsState.find(x => x.Id === id);
    if(!it){ alert('Item not found.'); return; }

    const html = `
      <div class="modal-panel" data-panel>
        <h3>${isNew?'Add Item':'Edit Item'}</h3>
        <label>Name<input type="text" data-f="Name" value="${escapeAttr(it.Name)}"></label>
        <label>Kind<input type="text" data-f="Kind" value="${escapeAttr(it.Kind)}" placeholder="Consumable / Thrown / Utility / Buff / Revive / Key Item"></label>
        <label>Effect<textarea data-f="Effect">${escapeHtml(it.Effect)}</textarea></label>
        <div class="modal-row">
          <label>Stack<input type="number" data-f="Stack" min="1" value="${it.Stack}"></label>
          <label style="flex-direction:row;align-items:center;gap:6px;margin-top:20px"><input type="checkbox" data-f="Existing" ${it.Existing?'checked':''}> Already implemented in code</label>
        </div>
        <label>Notes<textarea data-f="Notes">${escapeHtml(it.Notes)}</textarea></label>
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
        qsa('[data-f]', panel).forEach(el => {
          const k = el.getAttribute('data-f');
          let v;
          if (el.type === 'checkbox')      v = el.checked;
          else if (el.type === 'number')   v = Number(el.value) || 0;
          else                             v = el.value;
          fields[k] = v;
        });
        if(!fields.Name || !String(fields.Name).trim()){
          alert('Name is required.');
          return;
        }
        const key = isNew ? genId('item') : it.Id;
        if(isNew){
          const maxSo = itemsState.reduce((m,x) => Math.max(m, x.SortOrder), 0);
          fields.SortOrder = maxSo + 1000;
          fields.Hidden = false;
        }
        closeModal();
        await pushRow('Items', key, fields);
        fetchAll();
      });
      if(!isNew){
        qs('[data-action="delete"]', panel).addEventListener('click', () => {
          const footer = qs('.modal-footer', panel);
          footer.innerHTML = `
            <div class="modal-confirm-inline">
              Hide this item? Recoverable from the sheet.
              <button class="modal-btn danger" data-action="confirm-delete">Yes, hide</button>
              <button class="modal-btn" data-action="cancel-delete">No</button>
            </div>
          `;
          qs('[data-action="cancel-delete"]', footer).addEventListener('click', closeModal);
          qs('[data-action="confirm-delete"]', footer).addEventListener('click', async () => {
            closeModal();
            await pushRow('Items', it.Id, { Hidden: true });
            fetchAll();
          });
        });
      }
    });
  }
```

- [ ] **Step 2: Rewrite `renderItems` to read from state**

Find `function renderItems(){` in `app.js`. Replace the entire function (through its closing `}`) with:

```javascript
  function renderItems(){
    const host = qs('#items-table tbody');
    if(!host) return;
    const canEdit = !!userName;
    const rows = itemsState
      .filter(it => !it.Hidden)
      .slice()
      .sort((a,b) => a.SortOrder - b.SortOrder);
    host.innerHTML = rows.map((it, i) => `
      <tr>
        <td class="mono dim">${String(i+1).padStart(2,'0')}</td>
        <td><b>${escapeHtml(it.Name)}</b></td>
        <td>${escapeHtml(it.Kind)}</td>
        <td>${escapeHtml(it.Effect)}</td>
        <td class="num">${it.Stack}</td>
        <td>${it.Existing ? '<span class="chip done">Implemented</span>' : '<span class="chip">To build</span>'}</td>
        <td class="dim">${escapeHtml(it.Notes)} <button class="row-menu-btn" data-item-id="${escapeAttr(it.Id)}" ${canEdit?'':'disabled title="Set your name first"'}>⋯</button></td>
      </tr>
    `).join('');
    qsa('.row-menu-btn', host).forEach(btn => {
      btn.addEventListener('click', () => {
        if(btn.disabled) return;
        openItemModal(btn.getAttribute('data-item-id'));
      });
    });
  }
```

- [ ] **Step 3: Ensure `renderItems` is called when state updates**

In `app.js`, find `renderBoard()` — inside its body, after `mountSectionAddButtons();` (or at the end of the function, inside the current closing brace), add a call to refresh Design Doc renders whenever `fetchAll` triggers a board re-render. Actually, `fetchAll` already calls `renderBoard` only; Design Doc renders happen from `renderAll`. For the live-sync behavior (change made → sheet updated → fetchAll called → UI refreshes), we need `renderItems` to run after each `fetchAll`.

Find the end of `fetchAll()` — inside the try block, after `renderBoard();`:

```javascript
      if(teamState.length === 0 && taskState.length === 0){
        await bootstrapIfEmpty();
      }
      renderBoard();
```

Wait — that condition was updated in Task 4. The current state of that block looks like:

```javascript
      const anyEmpty =
        teamState.length === 0 || taskState.length === 0 ||
        charactersState.length === 0 || itemsState.length === 0 ||
        mapsState.length === 0 || systemsState.length === 0;
      if(anyEmpty){
        await bootstrapIfEmpty();
      }
      renderBoard();
```

Replace that `renderBoard();` line with:

```javascript
      renderBoard();
      renderCharacters();
      renderItems();
      renderMaps();
      renderSystems();
```

This makes every fetchAll refresh all renderers, so live edits propagate immediately. (`renderCharacters`, `renderMaps`, `renderSystems` still read from `window.*` globals at this point — they'll be rewritten in later tasks — so this call is a no-op regression risk check only.)

- [ ] **Step 4: Manual verification**

1. Reload `index.html`, navigate to Design Doc tab.
2. Items table should render exactly as before (data is identical — sheet seeded from `window.ITEMS`), plus a ⋯ button in the Notes column of each row.
3. Set your name if not set.
4. Click ⋯ on an item → modal opens with all fields pre-filled. Change Name (e.g., add " — edited"), Save.
5. Modal closes, row re-renders with new name. Open the sheet's `Items` tab — the row's `Name` cell updated, `UpdatedBy` shows your name.
6. Click `＋ Item` in the Items section header → modal opens in Add mode, all fields blank.
7. Fill Name and Kind, Create. New row appears at the bottom of the Items table; sheet row added with `item-<ts>-<rand>` Id.
8. Click ⋯ on the new item → Delete → Yes, hide. Row disappears; sheet row has `Hidden=TRUE`.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "Design Doc: implement Items — modal + render from state"
```

---

## Task 9: Implement `openSystemModal` + rewrite `renderSystems`

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Implement `openSystemModal`**

Add this function near the bottom of `app.js` (alongside `openItemModal`):

```javascript
  function openSystemModal(id){
    const isNew = !id;
    const s = isNew
      ? { Id:'', System:'', SysStatus:'Design', Dep:'', Owner:'', Notes:'', Hidden:false, SortOrder:0 }
      : systemsState.find(x => x.Id === id);
    if(!s){ alert('System not found.'); return; }

    const statusOpts = SYS_STATUSES.map(o => `<option value="${o.v}" ${s.SysStatus===o.v?'selected':''}>${escapeHtml(o.label)}</option>`).join('');

    const html = `
      <div class="modal-panel" data-panel>
        <h3>${isNew?'Add System':'Edit System'}</h3>
        <label>System<input type="text" data-f="System" value="${escapeAttr(s.System)}" placeholder="e.g. GAS, Inventory, Quest System"></label>
        <div class="modal-row">
          <label>Status<select data-f="SysStatus">${statusOpts}</select></label>
          <label>Owner<input type="text" data-f="Owner" value="${escapeAttr(s.Owner)}" placeholder="e.g. Jeff, Jeff + Shared"></label>
        </div>
        <label>Depends on<textarea data-f="Dep" placeholder="e.g. Core Loop, GAS">${escapeHtml(s.Dep)}</textarea></label>
        <label>Notes<textarea data-f="Notes">${escapeHtml(s.Notes)}</textarea></label>
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
        if(!fields.System || !String(fields.System).trim()){
          alert('System name is required.');
          return;
        }
        const key = isNew ? genId('sys') : s.Id;
        if(isNew){
          const maxSo = systemsState.reduce((m,x) => Math.max(m, x.SortOrder), 0);
          fields.SortOrder = maxSo + 1000;
          fields.Hidden = false;
        }
        closeModal();
        await pushRow('Systems', key, fields);
        fetchAll();
      });
      if(!isNew){
        qs('[data-action="delete"]', panel).addEventListener('click', () => {
          const footer = qs('.modal-footer', panel);
          footer.innerHTML = `
            <div class="modal-confirm-inline">
              Hide this system? Recoverable from the sheet.
              <button class="modal-btn danger" data-action="confirm-delete">Yes, hide</button>
              <button class="modal-btn" data-action="cancel-delete">No</button>
            </div>
          `;
          qs('[data-action="cancel-delete"]', footer).addEventListener('click', closeModal);
          qs('[data-action="confirm-delete"]', footer).addEventListener('click', async () => {
            closeModal();
            await pushRow('Systems', s.Id, { Hidden: true });
            fetchAll();
          });
        });
      }
    });
  }
```

- [ ] **Step 2: Rewrite `renderSystems` to read from state**

Find `function renderSystems(){`. Replace the entire function with:

```javascript
  function renderSystems(){
    const host = qs('#systems-table tbody');
    if(!host) return;
    const canEdit = !!userName;
    const rows = systemsState
      .filter(s => !s.Hidden)
      .slice()
      .sort((a,b) => a.SortOrder - b.SortOrder);
    host.innerHTML = rows.map(s => `
      <tr>
        <td><b>${escapeHtml(s.System)}</b></td>
        <td>${s.SysStatus==='In code' ? '<span class="chip done">In code</span>' : '<span class="chip">'+escapeHtml(s.SysStatus)+'</span>'}</td>
        <td class="dim">${escapeHtml(s.Dep)}</td>
        <td>${escapeHtml(s.Owner)}</td>
        <td>${escapeHtml(s.Notes)} <button class="row-menu-btn" data-sys-id="${escapeAttr(s.Id)}" ${canEdit?'':'disabled title="Set your name first"'}>⋯</button></td>
      </tr>
    `).join('');
    qsa('.row-menu-btn', host).forEach(btn => {
      btn.addEventListener('click', () => {
        if(btn.disabled) return;
        openSystemModal(btn.getAttribute('data-sys-id'));
      });
    });
  }
```

- [ ] **Step 3: Manual verification**

1. Reload, Design Doc tab.
2. Systems Matrix table renders from state (identical to before). ⋯ button at end of Notes cell.
3. Click ⋯ on a system → modal opens. Change Status dropdown from `Design` to `Partial`, Save.
4. Row updates; chip shows `Partial`. Sheet row `SysStatus` flipped.
5. Click `＋ System` → fill System name and Owner, Create. New row appended.
6. Delete a system via ⋯ → Delete → Yes, hide.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "Design Doc: implement Systems — modal + render from state"
```

---

## Task 10: Stage A push + live-site verify (user)

**Files:** none

- [ ] **Step 1: Push branch**

```bash
cd 'D:/AiCG Docs/ZSP Project'
git push -u origin design-doc-editable
```

- [ ] **Step 2: User quickly verifies from a second browser / tab**

Open `file:///D:/AiCG Docs/ZSP Project/index.html` again (incognito or clear storage) and verify:

1. Password gate → enter `AICGZSP`.
2. Design Doc tab loads.
3. Items: add / edit / delete works; changes reflected in the sheet.
4. Systems: add / edit / delete works.
5. Characters and Maps tabs still render (from state now — seeded earlier) but ⋯ buttons on Characters cards don't exist yet (Stage C) — that's expected.
6. Open DevTools Console — no errors during normal use.

If any failure, stop here and report. Otherwise proceed to Stage B.

---

# Stage B — Maps

## Task 11: Implement `openMapModal` + rewrite `renderMaps`

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Replace the `openMapModal` stub with the real implementation**

Find `function openMapModal(id){ alert('Map editor coming in Stage B.'); }` and replace it with:

```javascript
  function openMapModal(id){
    const isNew = !id;
    const m = isNew
      ? { Id:'', Name:'', Theme:'', Size:'', Enemies:'', Boss:'', Difficulty:'Run 2', BiomeNotes:'', Hidden:false, SortOrder:0 }
      : mapsState.find(x => x.Id === id);
    if(!m){ alert('Map not found.'); return; }

    const difOpts = MAP_DIFFICULTIES.map(o => `<option value="${o.v}" ${m.Difficulty===o.v?'selected':''}>${escapeHtml(o.label)}</option>`).join('');

    const html = `
      <div class="modal-panel" data-panel style="max-width:640px">
        <h3>${isNew?'Add Map':'Edit Map'}</h3>
        <label>Name<input type="text" data-f="Name" value="${escapeAttr(m.Name)}" placeholder="e.g. NightMarket · 夜市"></label>
        <div class="modal-row">
          <label>Size<input type="text" data-f="Size" value="${escapeAttr(m.Size)}" placeholder="e.g. 250m × 250m"></label>
          <label>Difficulty<select data-f="Difficulty">${difOpts}</select></label>
        </div>
        <label>Theme<textarea data-f="Theme">${escapeHtml(m.Theme)}</textarea></label>
        <label>Enemies<textarea data-f="Enemies">${escapeHtml(m.Enemies)}</textarea></label>
        <label>Boss<input type="text" data-f="Boss" value="${escapeAttr(m.Boss)}"></label>
        <label>Biome / Layout notes<textarea data-f="BiomeNotes">${escapeHtml(m.BiomeNotes)}</textarea></label>
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
          alert('Name is required.');
          return;
        }
        const key = isNew ? genId('map') : m.Id;
        if(isNew){
          const maxSo = mapsState.reduce((acc,x) => Math.max(acc, x.SortOrder), 0);
          fields.SortOrder = maxSo + 1000;
          fields.Hidden = false;
        }
        closeModal();
        await pushRow('Maps', key, fields);
        fetchAll();
      });
      if(!isNew){
        qs('[data-action="delete"]', panel).addEventListener('click', () => {
          const footer = qs('.modal-footer', panel);
          footer.innerHTML = `
            <div class="modal-confirm-inline">
              Hide this map? Recoverable from the sheet.
              <button class="modal-btn danger" data-action="confirm-delete">Yes, hide</button>
              <button class="modal-btn" data-action="cancel-delete">No</button>
            </div>
          `;
          qs('[data-action="cancel-delete"]', footer).addEventListener('click', closeModal);
          qs('[data-action="confirm-delete"]', footer).addEventListener('click', async () => {
            closeModal();
            await pushRow('Maps', m.Id, { Hidden: true });
            fetchAll();
          });
        });
      }
    });
  }
```

- [ ] **Step 2: Rewrite `renderMaps` to read from state**

Find `function renderMaps(){`. Replace the entire function with:

```javascript
  function renderMaps(){
    const host = qs('#maps');
    if(!host) return;
    const canEdit = !!userName;
    const rows = mapsState
      .filter(m => !m.Hidden)
      .slice()
      .sort((a,b) => a.SortOrder - b.SortOrder);
    host.innerHTML = rows.map((m, i) => `
      <div class="card" data-map-id="${escapeAttr(m.Id)}">
        <button class="card-menu-btn" data-map-id="${escapeAttr(m.Id)}" ${canEdit?'':'disabled title="Set your name first"'}>⋯</button>
        <div class="label">Map ${String(i+1).padStart(2,'0')} · ${escapeHtml(m.Difficulty)}</div>
        <h3>${escapeHtml(m.Name)}</h3>
        <p style="margin:6px 0 12px 0">${escapeHtml(m.Theme)}</p>
        <dl class="kv">
          <dt>Size</dt><dd class="mono-cell">${escapeHtml(m.Size)}</dd>
          <dt>Enemies</dt><dd>${escapeHtml(m.Enemies)}</dd>
          <dt>Boss</dt><dd>${escapeHtml(m.Boss)}</dd>
          <dt>Layout</dt><dd style="font-size:12.5px;color:var(--ink-2)">${escapeHtml(m.BiomeNotes)}</dd>
        </dl>
      </div>
    `).join('');
    qsa('.card-menu-btn', host).forEach(btn => {
      btn.addEventListener('click', () => {
        if(btn.disabled) return;
        openMapModal(btn.getAttribute('data-map-id'));
      });
    });
  }
```

- [ ] **Step 3: Manual verification**

1. Reload, Design Doc tab.
2. Maps cards render with ⋯ button top-right.
3. Click ⋯ on NightMarket · 夜市 → modal opens with all fields populated.
4. Change Difficulty to `Run 2`, edit BiomeNotes, Save. Card re-renders. Sheet row `Difficulty` and `BiomeNotes` updated.
5. Click `＋ Map` → fill Name + Theme + Difficulty, Create. New card at the bottom.
6. Delete a test map via ⋯ → Delete.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "Design Doc: implement Maps — modal + render from state"
```

---

# Stage C — Characters + nested Abilities

## Task 12: Implement `openCharacterModal` + rewrite `renderCharacters`

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Replace the `openCharacterModal` stub with the real implementation**

Find `function openCharacterModal(id){ alert('Character editor coming in Stage C.'); }`. Replace with:

```javascript
  function openCharacterModal(id){
    const isNew = !id;
    const c = isNew
      ? { Id:'', Name:'', Culture:'', RoleText:'', Weapon:'', Status:'', StatusChip:'', Summary:'', abilities:[], Hidden:false, SortOrder:0 }
      : charactersState.find(x => x.Id === id);
    if(!c){ alert('Character not found.'); return; }

    // Ensure exactly 3 ability slots in draft, pre-filled by key
    const abDraft = ABILITY_KEYS.map((k, i) => {
      const existing = (c.abilities || []).find(a => a && a.key === k)
        || (c.abilities || [])[i]
        || {};
      return {
        key:  k,
        name: existing.name || '',
        type: existing.type || 'Skill',
        desc: existing.desc || '',
        impl: existing.impl || 'Design only',
      };
    });

    function abilityRowHtml(row, i){
      const typeOpts = ABILITY_TYPES.map(o => `<option value="${o.v}" ${row.type===o.v?'selected':''}>${escapeHtml(o.label)}</option>`).join('');
      const implOpts = ABILITY_IMPLS.map(o => `<option value="${o.v}" ${row.impl===o.v?'selected':''}>${escapeHtml(o.label)}</option>`).join('');
      return `
        <tr data-ability-idx="${i}">
          <td class="key-cell">${escapeHtml(row.key)}</td>
          <td><input type="text" data-ab="name" value="${escapeAttr(row.name)}"></td>
          <td><select data-ab="type">${typeOpts}</select></td>
          <td><textarea data-ab="desc">${escapeHtml(row.desc)}</textarea></td>
          <td><select data-ab="impl">${implOpts}</select></td>
        </tr>
      `;
    }

    const html = `
      <div class="modal-panel" data-panel style="max-width:760px">
        <h3>${isNew?'Add Character':'Edit Character'}</h3>
        <div class="modal-row">
          <label>Name<input type="text" data-f="Name" value="${escapeAttr(c.Name)}" placeholder="e.g. Daoshi · 道士"></label>
          <label>Culture<input type="text" data-f="Culture" value="${escapeAttr(c.Culture)}" placeholder="e.g. Chinese Taoist"></label>
        </div>
        <div class="modal-row">
          <label>Role<input type="text" data-f="RoleText" value="${escapeAttr(c.RoleText)}" placeholder="e.g. Ranged Caster / Area Control"></label>
          <label>Weapon<input type="text" data-f="Weapon" value="${escapeAttr(c.Weapon)}"></label>
        </div>
        <div class="modal-row">
          <label>Status (long)<input type="text" data-f="Status" value="${escapeAttr(c.Status)}"></label>
          <label>Status chip (short)<input type="text" data-f="StatusChip" value="${escapeAttr(c.StatusChip)}" placeholder="e.g. asset: HP ready"></label>
        </div>
        <label>Summary<textarea data-f="Summary">${escapeHtml(c.Summary)}</textarea></label>
        <div>
          <div class="label" style="margin-top:6px">Abilities (Q / R / T — exactly 3 slots)</div>
          <table class="abilities-subtable" data-abilities>
            <thead><tr><th>Key</th><th>Name</th><th style="width:90px">Type</th><th>Description</th><th style="width:110px">Impl</th></tr></thead>
            <tbody>${abDraft.map(abilityRowHtml).join('')}</tbody>
          </table>
        </div>
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
          alert('Name is required.');
          return;
        }
        // Collect abilities from sub-table
        const abs = [];
        qsa('tr[data-ability-idx]', panel).forEach(tr => {
          const i = Number(tr.getAttribute('data-ability-idx'));
          abs.push({
            key:  ABILITY_KEYS[i],
            name: qs('[data-ab="name"]', tr).value,
            type: qs('[data-ab="type"]', tr).value,
            desc: qs('[data-ab="desc"]', tr).value,
            impl: qs('[data-ab="impl"]', tr).value,
          });
        });
        fields.AbilitiesJson = JSON.stringify(abs);
        const key = isNew ? genId('char') : c.Id;
        if(isNew){
          const maxSo = charactersState.reduce((acc,x) => Math.max(acc, x.SortOrder), 0);
          fields.SortOrder = maxSo + 1000;
          fields.Hidden = false;
        }
        closeModal();
        await pushRow('Characters', key, fields);
        fetchAll();
      });
      if(!isNew){
        qs('[data-action="delete"]', panel).addEventListener('click', () => {
          const footer = qs('.modal-footer', panel);
          footer.innerHTML = `
            <div class="modal-confirm-inline">
              Hide this character? Recoverable from the sheet.
              <button class="modal-btn danger" data-action="confirm-delete">Yes, hide</button>
              <button class="modal-btn" data-action="cancel-delete">No</button>
            </div>
          `;
          qs('[data-action="cancel-delete"]', footer).addEventListener('click', closeModal);
          qs('[data-action="confirm-delete"]', footer).addEventListener('click', async () => {
            closeModal();
            await pushRow('Characters', c.Id, { Hidden: true });
            fetchAll();
          });
        });
      }
    });
  }
```

- [ ] **Step 2: Rewrite `renderCharacters` to read from state**

Find `function renderCharacters(){`. Replace the entire function with:

```javascript
  function renderCharacters(){
    const host = qs('#characters');
    if(!host) return;
    const canEdit = !!userName;
    const rows = charactersState
      .filter(c => !c.Hidden)
      .slice()
      .sort((a,b) => a.SortOrder - b.SortOrder);
    host.innerHTML = rows.map(c => {
      const isReady = (c.StatusChip || '').includes('HP');
      const chip = isReady
        ? `<span class="chip char dot">${escapeHtml(c.StatusChip)}</span>`
        : `<span class="chip">${escapeHtml(c.StatusChip)}</span>`;
      const abilitiesRows = (c.abilities || []).map(a => `
        <tr>
          <td class="mono" style="font-weight:600">${escapeHtml(a.key || '')}</td>
          <td><b>${escapeHtml(a.name || '')}</b></td>
          <td class="dim">${escapeHtml(a.type || '')}</td>
          <td>${escapeHtml(a.desc || '')}</td>
          <td><span class="chip ${a.impl==='Implemented'?'done':''}">${escapeHtml(a.impl || '')}</span></td>
        </tr>
      `).join('');
      return `
        <div class="card" data-char-id="${escapeAttr(c.Id)}" style="padding:22px">
          <button class="card-menu-btn" data-char-id="${escapeAttr(c.Id)}" ${canEdit?'':'disabled title="Set your name first"'}>⋯</button>
          <div class="row" style="justify-content:space-between;margin-bottom:8px">
            <div>
              <div class="label">${escapeHtml(c.RoleText)}</div>
              <h3 style="font-size:18px">${escapeHtml(c.Name)}</h3>
              <div class="small" style="margin-top:2px">${escapeHtml(c.Culture)} · ${escapeHtml(c.Weapon)}</div>
            </div>
            ${chip}
          </div>
          <p style="margin:10px 0 14px 0;color:var(--ink-2);font-size:13px">${escapeHtml(c.Summary)}</p>
          <div class="table-wrap" style="border-radius:6px">
            <table class="sheet">
              <thead><tr>
                <th style="width:42px">Key</th>
                <th>Ability</th>
                <th style="width:90px">Type</th>
                <th>Description</th>
                <th style="width:110px">Status</th>
              </tr></thead>
              <tbody>${abilitiesRows}</tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');
    qsa('.card-menu-btn', host).forEach(btn => {
      btn.addEventListener('click', () => {
        if(btn.disabled) return;
        openCharacterModal(btn.getAttribute('data-char-id'));
      });
    });
  }
```

- [ ] **Step 3: Manual verification**

1. Reload, Design Doc tab.
2. Characters grid renders with ⋯ top-right of each card.
3. Click ⋯ on Daoshi · 道士 → modal opens. Top section has name/culture/role/weapon/status/statuschip/summary. Abilities sub-table has 3 rows with keys Q/R/T, each with Name, Type dropdown, Description textarea, Impl dropdown.
4. Change Daoshi's Q ability description, change R impl from `Implemented` to `Partial`, Save.
5. Card re-renders with new description and the R row's chip reads `Partial`.
6. Sheet: Characters tab, Daoshi row — `AbilitiesJson` cell now contains an updated JSON array.
7. Click `＋ Character` → fill Name, Culture, Role, each of the 3 abilities, Save. New card appears.
8. Delete a test character via ⋯ → Delete.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "Design Doc: implement Characters — modal + abilities subtable"
```

---

## Task 13: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Task Board sync subsection to reference the new tabs**

In `CLAUDE.md`, find the `### Task Board · Google Sheets sync` subsection. Find the `**Two tabs:**` bullet block. Replace it (the `**Two tabs:**` line plus the two nested bullets that follow) with:

```markdown
- **Tabs:**
  - **`Tasks`** headers (row 1, in order): `TaskId | MemberId | Title | Body | Phase | Priority | Status | Notes | Assignee | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`
  - **`Team`** headers: `MemberId | Name | RoleKey | RoleLabel | Order | Active`
  - **`Characters`** headers: `Id | Name | Culture | RoleText | Weapon | Status | StatusChip | Summary | AbilitiesJson | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`  — `AbilitiesJson` is a JSON-serialized array of `{key, name, type, desc, impl}`, exactly 3 slots keyed `Q`/`R`/`T`
  - **`Items`** headers: `Id | Name | Kind | Effect | Stack | Existing | Notes | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`
  - **`Maps`** headers: `Id | Name | Theme | Size | Enemies | Boss | Difficulty | BiomeNotes | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`
  - **`Systems`** headers: `Id | System | SysStatus | Dep | Owner | Notes | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`
  - **`Config`** headers: `Key | Value`. Private — never returned in `GET`. Holds the unlock password at row `Key=password`.
```

- [ ] **Step 2: Generalize the key-column convention note**

Still in the Task Board sync subsection, the Write bullet currently describes the `Tab`/`Key`/`Fields` envelope. Immediately below that bullet, insert a new bullet:

```markdown
- **Key column convention:** each tab's first column is its primary key. The Apps Script `handleUpsert` detects this from the header row — no per-tab branching. New tabs just need a unique-ID first column to work with the envelope.
```

- [ ] **Step 3: Update the "When Editing" section**

Find the `## When Editing` section. The first two bullets (about task content and team composition) should be followed by bullets covering the Design Doc tab. Add these bullets directly after the "Team composition" bullet:

```markdown
- **Change Design Doc content:** edit characters/items/maps/systems via the Design Doc tab UI (click `⋯` on any card or row, `＋` in a section header to add). The sheet is the source of truth. `window.CHARACTERS / ITEMS / MAPS / SYSTEMS` in `data.js` are seed-only, consumed once on first load; edits there have no effect on the live page after migration.
- **Character abilities:** exactly 3 slots per character, keyed `Q`/`R`/`T`, edited through the Character modal's sub-table. Stored as `JSON.stringify(abilities)` in the `AbilitiesJson` column of the Characters row. If a character ever needs a 4th ability, the schema tolerates it — only the modal UI enforces count-of-3 today.
```

Leave all subsequent bullets (Gantt, phase/lane color, new tab) untouched.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Docs: update CLAUDE.md for 4 new Design Doc tabs"
```

---

## Task 14: Merge to `main` + final live-site verify (user)

**Files:** none

- [ ] **Step 1: Push branch**

```bash
git push origin design-doc-editable
```

- [ ] **Step 2: Merge to main**

```bash
git checkout main
git merge --no-ff design-doc-editable -m "Merge branch 'design-doc-editable': editable Design Doc tab

Characters, Items, Maps, Systems are now managed from the UI with the
Google Sheet as source of truth. Apps Script generalized: first-column
key detection, per-tab bootstrap. Abilities stored as JSON blob inside
the Characters row. Seeded from window.* globals on first load.

See docs/superpowers/specs/2026-04-20-design-doc-editable-design.md."
git push origin main
git branch -d design-doc-editable
git push origin --delete design-doc-editable
```

- [ ] **Step 3: Wait ~1 minute for GitHub Pages deploy, verify on live site**

In an incognito window, open https://aicgjchiu.github.io/zsp-planning-doc/. Enter password. Go to Design Doc tab. Smoke test:
- Characters: click ⋯ on any character, change a small field, Save, confirm the card updates and the sheet row reflects it.
- Items: add a throwaway test item via ＋, then delete it via ⋯ → Delete.
- Maps: edit any map's BiomeNotes, Save.
- Systems: change any system's Owner, Save.

If all four succeed end-to-end on the live URL, migration is complete.

---

## Post-plan followups (separate PRs)

- **Cleanup PR.** Remove `window.CHARACTERS / ITEMS / MAPS / SYSTEMS / TASKS` from `data.js`. Update CLAUDE.md to note `data.js` holds only `GANTT / PHASES / MILESTONES` now. Strip the `legacyTaskId()` helper if it's no longer referenced.
- **Deferred scope.** Gantt / Roadmap editing (`window.GANTT`) — separate spec + plan.
