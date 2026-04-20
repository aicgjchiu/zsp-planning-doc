# Task Board Editable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Task Board tab fully editable from the UI (add/edit/soft-delete tasks; manage team roster) with Google Sheets as source of truth. Clarify ambiguous `P1 · P0` chip with full-text legend and relabel.

**Architecture:** Promote Google Sheets from state store to full source of truth via two tabs (`Tasks` + `Team`). Google Apps Script gets a generalized envelope (`{Tab, Key, Fields}`) + `bootstrap` action for idempotent first-run seeding from `window.TASKS`. Client (`app.js`) refactors from "render from `window.TASKS` + overlay sheet state" to "render from sheet-backed state arrays." Hybrid edit UX: inline status/notes (unchanged) + modal for everything else.

**Tech Stack:** Vanilla HTML/CSS/JS (no build, no framework, no test framework — per CLAUDE.md). Google Apps Script backend. "Testing" per task means **manual browser verification** and **curl against the Apps Script endpoint**; expected UI / JSON states are documented explicitly in each task.

---

## Reference spec

`docs/superpowers/specs/2026-04-20-task-board-editable-design.md`

## File structure summary

| File | Responsibility after this plan |
|---|---|
| `apps-script.gs` | Mirror of deployed script. Handles `GET` returning `{tasks, team}` and `POST` with `{Tab, Key, Fields}` envelope or `{Action:"bootstrap", ...}` |
| `data.js` | Unchanged during rollout. `window.TASKS` stays as fallback/seed source but `app.js` stops reading it after Task 6. Follow-up PR (post-this-plan) removes `window.TASKS` |
| `app.js` | Rewritten Task Board section: module state (`teamState`, `taskState`, `userName`), `fetchAll`, `pushRow`, `bootstrapIfEmpty`, `renderBoard` reading from state, `openEditModal`, `openTeamModal`, `deleteTask`, modal helpers. Other renders (`renderGantt`, etc.) unchanged |
| `styles.css` | Modal overlay/panel styles, `.t-menu-btn`, `.col-add-btn`, `.legend-row` |
| `index.html` | Adds legend row above phase filter, `Team` button in toolbar, `<div id="modal-root"></div>` before `<script>` tags |
| `CLAUDE.md` | Docs update after everything works: schema, envelope, `TASKS` deprecation |

## Execution order rationale

Tasks proceed in the order: backend → sheet schema → client data layer → render → modal infra → edit modal → team modal → UI wiring → identity gating → docs. This lets you verify each layer end-to-end before moving up the stack, and the page remains usable at every commit (degraded modes are called out where applicable).

---

## Task 1: Rewrite `apps-script.gs` with new envelope

**Files:**
- Modify: `apps-script.gs` (full rewrite)

- [ ] **Step 1: Replace entire file contents**

Open `apps-script.gs` and replace everything with:

```javascript
// Reference copy of the Google Apps Script backing the Task Board.
// Deployed from the Google Sheet:
//   https://docs.google.com/spreadsheets/d/1Od7n8hbOO24SIJiyGR7ctfYTkkLdUXLVf06KiUCY0hQ/edit
// This file is NOT loaded by the site — it's a mirror so the script is version-controlled.
// To change behavior: edit in Apps Script editor (Extensions → Apps Script on the sheet),
// then Deploy → Manage deployments → New version → Deploy. Update this file to match.

const TASKS_SHEET = 'Tasks';
const TEAM_SHEET  = 'Team';

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return jsonOut({
    ok: true,
    tasks: readTab(ss.getSheetByName(TASKS_SHEET)),
    team:  readTab(ss.getSheetByName(TEAM_SHEET)),
  });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.Action === 'bootstrap') return handleBootstrap(body);
    return handleUpsert(body);
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function handleUpsert(body) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(body.Tab);
  if (!sheet) return jsonOut({ ok: false, error: 'Unknown tab: ' + body.Tab });
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const keyColName = body.Tab === TEAM_SHEET ? 'MemberId' : 'TaskId';
  const keyCol = headers.indexOf(keyColName);
  if (keyCol < 0) return jsonOut({ ok: false, error: 'Missing key column: ' + keyColName });

  const now = new Date().toISOString();
  const updatedBy = body.UpdatedBy || '';
  const fields = body.Fields || {};

  // find existing row
  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][keyCol] === body.Key) { rowIdx = i + 1; break; }
  }

  if (rowIdx === -1) {
    // append new row
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
    // update only provided fields, always stamp UpdatedAt/UpdatedBy
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
    const tasks = ss.getSheetByName(TASKS_SHEET);
    const team  = ss.getSheetByName(TEAM_SHEET);
    if (!tasks || !team) return jsonOut({ ok: false, error: 'Tabs Tasks/Team must exist' });

    const tasksHasData = tasks.getLastRow() > 1;
    const teamHasData  = team.getLastRow()  > 1;
    if (tasksHasData || teamHasData) {
      return jsonOut({ ok: true, seeded: false });
    }

    writeRows(tasks, body.Tasks || []);
    writeRows(team,  body.Team  || []);
    return jsonOut({ ok: true, seeded: true });
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

- [ ] **Step 2: Commit the mirror file**

```bash
git add apps-script.gs
git commit -m "Rewrite Apps Script with envelope + bootstrap"
```

---

## Task 2: Deploy new Apps Script + verify via curl

**Files:** none (this is Google-side)

- [ ] **Step 1: Open the backing sheet**

Navigate: https://docs.google.com/spreadsheets/d/1Od7n8hbOO24SIJiyGR7ctfYTkkLdUXLVf06KiUCY0hQ/edit

- [ ] **Step 2: Ensure both tabs exist with correct headers**

The script assumes both tabs exist. If the sheet currently only has `Tasks`:

1. Create a new tab named exactly `Team`.
2. In `Team` row 1, type these headers (one per cell, in order): `MemberId`, `Name`, `RoleKey`, `RoleLabel`, `Order`, `Active`.
3. Rewrite the `Tasks` tab row 1 headers (in order): `TaskId`, `MemberId`, `Title`, `Body`, `Phase`, `Priority`, `Status`, `Notes`, `Assignee`, `Hidden`, `SortOrder`, `CreatedAt`, `UpdatedAt`, `UpdatedBy`.
4. Delete all data rows in `Tasks` (bootstrap will re-seed). Note: this wipes any existing per-task Notes; if valuable notes exist, copy them somewhere first.

- [ ] **Step 3: Open the attached Apps Script editor**

In the sheet: Extensions → Apps Script.

- [ ] **Step 4: Paste the new script**

Open `apps-script.gs` from the repo and paste its contents into `Code.gs` in the Apps Script editor, replacing everything there.

- [ ] **Step 5: Deploy a new version**

Deploy → Manage deployments → pencil icon on the existing deployment → Version: **New version** → Deploy. Confirm the web app URL didn't change (it shouldn't).

- [ ] **Step 6: Verify GET returns new shape**

In a terminal:

```bash
curl -sL 'https://script.google.com/macros/s/AKfycbypjQj-_CrxjEovmHt5vzc0Iaysbwt3n0MglkG7MAsDMJII8B8YCqFOBM6eE4GKAFuc/exec'
```

Expected: `{"ok":true,"tasks":[],"team":[]}` (both empty at this point).

- [ ] **Step 7: Verify POST upsert works**

```bash
curl -sL -X POST \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"Tab":"Team","Key":"_test","Fields":{"Name":"Test","RoleKey":"programmer","RoleLabel":"Test","Order":99,"Active":true},"UpdatedBy":"curl"}' \
  'https://script.google.com/macros/s/AKfycbypjQj-_CrxjEovmHt5vzc0Iaysbwt3n0MglkG7MAsDMJII8B8YCqFOBM6eE4GKAFuc/exec'
```

Expected: `{"ok":true}`. Then open the sheet and confirm a new row appeared in `Team` with `MemberId=_test`. Delete that test row manually in the sheet after verifying.

- [ ] **Step 8: Verify bootstrap returns seeded:false when sheet not empty**

Add a single throwaway row to `Team` manually in the sheet (`MemberId: _x`, any other values). Then:

```bash
curl -sL -X POST \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"Action":"bootstrap","Tasks":[],"Team":[{"MemberId":"should_not_appear","Name":"nope","RoleKey":"programmer","RoleLabel":"nope","Order":1,"Active":true}]}' \
  'https://script.google.com/macros/s/AKfycbypjQj-_CrxjEovmHt5vzc0Iaysbwt3n0MglkG7MAsDMJII8B8YCqFOBM6eE4GKAFuc/exec'
```

Expected: `{"ok":true,"seeded":false}`. Sheet should be unchanged (no "should_not_appear" row). Delete the `_x` row manually. The sheet should now have both tabs with only headers.

---

## Task 3: Add module-level state + `fetchAll` in `app.js`

**Files:**
- Modify: `app.js` (Task Board section starting ~line 186)

- [ ] **Step 1: Replace the Task Board section module state block**

In `app.js`, find the block starting at `// --- Task Board · Google Sheets backed ---` (around line 186). Replace from that line down through the `function taskId(colKey, t, idx){...}` function (line 210) with:

```javascript
  // --- Task Board · Google Sheets backed ---
  const SHEET_ENDPOINT = 'https://script.google.com/macros/s/AKfycbypjQj-_CrxjEovmHt5vzc0Iaysbwt3n0MglkG7MAsDMJII8B8YCqFOBM6eE4GKAFuc/exec';
  const POLL_MS = 30000;
  const STATUSES = [
    { v:'todo',     label:'To Do' },
    { v:'progress', label:'In Progress' },
    { v:'blocked',  label:'Blocked' },
    { v:'done',     label:'Done' },
  ];
  const PRIORITIES = [
    { v:'P0', label:'P0 — Must have' },
    { v:'P1', label:'P1 — Should have' },
    { v:'P2', label:'P2 — Nice to have' },
  ];
  const ROLE_KEYS = [
    { v:'programmer', label:'Programmer' },
    { v:'char',       label:'Character Artist' },
    { v:'env',        label:'Environment & Concept' },
    { v:'vfx',        label:'VFX & Rigging' },
  ];
  const SEED_TEAM = [
    { MemberId:'jeff',     Name:'Jeff',     RoleKey:'programmer', RoleLabel:'Programmer',            Order:1, Active:true },
    { MemberId:'christie', Name:'Christie', RoleKey:'char',       RoleLabel:'Character Artist',      Order:2, Active:true },
    { MemberId:'tachi',    Name:'Tachi',    RoleKey:'env',        RoleLabel:'Environment & Concept', Order:3, Active:true },
    { MemberId:'jason',    Name:'Jason',    RoleKey:'vfx',        RoleLabel:'VFX & Rigging',         Order:4, Active:true },
  ];
  const LEGACY_COL_TO_MEMBER = { programmer:'jeff', char:'christie', env:'tachi', vfx:'jason' };
  const USER_KEY = 'zsp_user_name';
  const TAB_FILTER_KEY_CURRENT = 'zsp_phase_filter';

  let currentPhaseFilter = 'all';
  try{ currentPhaseFilter = localStorage.getItem(TAB_FILTER_KEY_CURRENT) || 'all'; }catch(e){}

  // Module state
  let teamState = [];        // array of { MemberId, Name, RoleKey, RoleLabel, Order, Active, ... }
  let taskState = [];        // array of task objects from sheet
  let userName = '';         // cached identity
  let syncStatus = 'idle';
  let lastSyncAt = null;
  let pendingWrites = 0;

  function genId(prefix){
    return `${prefix}-${Date.now()}-${Math.floor(Math.random()*1e6).toString(36)}`;
  }
  function legacyTaskId(colKey, t, idx){
    const slug = (t.title||'').replace(/[^a-z0-9]+/gi,'-').toLowerCase().slice(0,40);
    return `${colKey}-p${t.phase}-${t.p}-${slug}-${idx}`;
  }
  function getUserName(){
    let n = '';
    try{ n = localStorage.getItem(USER_KEY) || ''; }catch(e){}
    if(!n){
      n = (prompt('Your name (shown as "last updated by" on tasks):') || '').trim();
      if(n){ try{ localStorage.setItem(USER_KEY, n); }catch(e){} }
    }
    userName = n || '';
    return userName;
  }
```

Note: `userName` is now persistent module state; old lazy `getUserName()` behavior is preserved here but we'll wire it to load-time prompt in Task 18.

- [ ] **Step 2: Verify page still loads (data layer intact)**

Open `index.html` in a browser. Switch to the Task Board tab.

Expected (degraded): board is empty (no tasks rendered — rendering still references the old code we haven't replaced yet; it will break). Console may show `Uncaught ReferenceError: taskId is not defined` from `renderBoard`. **This is OK for this commit** — we fix it in Task 5. Do not stop here; the refactor is in-progress.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "Task board: introduce module state + seed constants"
```

---

## Task 4: Replace `fetchRemote` / `pushUpdate` with `fetchAll` / `pushRow`

**Files:**
- Modify: `app.js` (Task Board section, `fetchRemote`, `pushUpdate`)

- [ ] **Step 1: Replace both functions**

In `app.js`, find `async function fetchRemote()` and `async function pushUpdate(...)`. Replace both with:

```javascript
  async function fetchAll(){
    setSyncStatus('syncing');
    try{
      const res = await fetch(SHEET_ENDPOINT, { method:'GET' });
      const json = await res.json();
      if(!json.ok) throw new Error(json.error || 'fetch failed');
      taskState = (json.tasks || []).map(normalizeTaskRow);
      teamState = (json.team  || []).map(normalizeTeamRow);
      lastSyncAt = new Date();
      setSyncStatus('ok');
      if(teamState.length === 0 && taskState.length === 0){
        await bootstrapIfEmpty();
      }
      renderBoard();
    }catch(err){
      console.warn('[sync] fetch error:', err);
      setSyncStatus('error');
    }
  }

  async function pushRow(tab, key, fields){
    pendingWrites++;
    updateSyncPill();
    try{
      const body = { Tab: tab, Key: key, Fields: fields, UpdatedBy: userName || 'anonymous' };
      const res = await fetch(SHEET_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if(!json.ok) throw new Error(json.error || 'push failed');
      lastSyncAt = new Date();
      setSyncStatus('ok');
      // Optimistic local update so UI doesn't wait on next poll
      const nowIso = new Date().toISOString();
      if(tab === 'Tasks'){
        const i = taskState.findIndex(t => t.TaskId === key);
        const patch = Object.assign({}, fields, { UpdatedAt: nowIso, UpdatedBy: userName || 'anonymous' });
        if(i >= 0) taskState[i] = Object.assign({}, taskState[i], patch);
        else taskState.push(Object.assign({ TaskId: key, CreatedAt: nowIso }, patch));
      } else if(tab === 'Team'){
        const i = teamState.findIndex(m => m.MemberId === key);
        const patch = Object.assign({}, fields, { UpdatedAt: nowIso, UpdatedBy: userName || 'anonymous' });
        if(i >= 0) teamState[i] = Object.assign({}, teamState[i], patch);
        else teamState.push(Object.assign({ MemberId: key }, patch));
      }
    }catch(err){
      console.warn('[sync] push error:', err);
      setSyncStatus('error');
      alert('Could not save to Google Sheet. Check your connection and try again.\n\n' + err.message);
    }finally{
      pendingWrites--;
      updateSyncPill();
    }
  }

  function normalizeTaskRow(r){
    return {
      TaskId:    String(r.TaskId || ''),
      MemberId:  String(r.MemberId || ''),
      Title:     String(r.Title || ''),
      Body:      String(r.Body || ''),
      Phase:     Number(r.Phase) || 1,
      Priority:  String(r.Priority || 'P1'),
      Status:    String(r.Status || 'todo'),
      Notes:     String(r.Notes || ''),
      Assignee:  String(r.Assignee || ''),
      Hidden:    r.Hidden === true || r.Hidden === 'TRUE' || r.Hidden === 'true',
      SortOrder: Number(r.SortOrder) || 0,
      CreatedAt: String(r.CreatedAt || ''),
      UpdatedAt: String(r.UpdatedAt || ''),
      UpdatedBy: String(r.UpdatedBy || ''),
    };
  }
  function normalizeTeamRow(r){
    return {
      MemberId:  String(r.MemberId || ''),
      Name:      String(r.Name || ''),
      RoleKey:   String(r.RoleKey || 'programmer'),
      RoleLabel: String(r.RoleLabel || ''),
      Order:     Number(r.Order) || 0,
      Active:    r.Active !== false && r.Active !== 'FALSE' && r.Active !== 'false',
    };
  }
```

- [ ] **Step 2: Also update `renderAll()` callsite**

In `app.js`, find the lines near the bottom of `renderAll()` that say:

```javascript
    fetchRemote();
    setInterval(fetchRemote, POLL_MS);
```

Replace with:

```javascript
    fetchAll();
    setInterval(fetchAll, POLL_MS);
```

- [ ] **Step 3: Commit (build still broken — fixed in Task 5)**

```bash
git add app.js
git commit -m "Task board: new fetchAll + pushRow; row normalizers"
```

---

## Task 5: Add `bootstrapIfEmpty` + rewrite `renderBoard`

**Files:**
- Modify: `app.js` (Task Board section, `renderBoard`, `renderBoardSummaryOnly`)

- [ ] **Step 1: Add `bootstrapIfEmpty` above `renderBoard`**

Insert this function just before `function renderBoard()` in `app.js`:

```javascript
  async function bootstrapIfEmpty(){
    // Build seed tasks from window.TASKS
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

    try{
      const res = await fetch(SHEET_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ Action:'bootstrap', Tasks: seedTasks, Team: SEED_TEAM }),
      });
      const json = await res.json();
      if(!json.ok) throw new Error(json.error || 'bootstrap failed');
      if(json.seeded){
        // Re-fetch so state reflects the seeded rows
        const r2 = await fetch(SHEET_ENDPOINT, { method:'GET' });
        const j2 = await r2.json();
        taskState = (j2.tasks || []).map(normalizeTaskRow);
        teamState = (j2.team  || []).map(normalizeTeamRow);
      }
    }catch(err){
      console.warn('[bootstrap] error:', err);
    }
  }
```

- [ ] **Step 2: Replace `renderBoard`**

Find `function renderBoard(){` in `app.js`. Replace the entire function (through its closing `}` — stop at `function renderBoardSummaryOnly()`) with:

```javascript
  function renderBoard(){
    const host = qs('#board');
    if(!host) return;
    const activeTeam = teamState.filter(m => m.Active).slice().sort((a,b) => a.Order - b.Order);
    const visibleTasks = taskState.filter(t => !t.Hidden);
    const canEdit = !!userName;

    host.innerHTML = activeTeam.map(m => {
      const roleClass = (ROLE_KEYS.find(r => r.v === m.RoleKey) || {}).v === 'programmer' ? 'code' : (m.RoleKey || 'code');
      const mine = visibleTasks
        .filter(t => t.MemberId === m.MemberId)
        .sort((a,b) => a.SortOrder - b.SortOrder);
      const filtered = mine.filter(t => currentPhaseFilter === 'all' || String(t.Phase) === currentPhaseFilter);
      const counts = { todo:0, progress:0, blocked:0, done:0 };
      mine.forEach(t => { counts[t.Status] = (counts[t.Status] || 0) + 1; });

      return `
        <div class="col" data-member-id="${escapeAttr(m.MemberId)}">
          <div class="col-head">
            <span class="chip ${roleClass}">${escapeHtml(m.RoleKey)}</span>
            <span class="role">${escapeHtml(m.RoleLabel)}</span>
            <span class="who">${escapeHtml(m.Name)}</span>
            <button class="col-add-btn" data-member-id="${escapeAttr(m.MemberId)}" ${canEdit?'':'disabled title="Set your name first"'}>＋</button>
          </div>
          <div class="col-count small mono-cell" style="margin-bottom:4px">${filtered.length} showing · ${mine.length} total</div>
          <div class="status-summary">
            <span><b>${counts.done}</b> done</span>
            <span><b>${counts.progress}</b> wip</span>
            <span><b>${counts.blocked}</b> blocked</span>
            <span><b>${counts.todo}</b> todo</span>
          </div>
          <div style="height:10px"></div>
          ${filtered.map(t => renderTaskCard(t, canEdit)).join('') || '<div class="small" style="padding:8px">No tasks in this phase.</div>'}
        </div>
      `;
    }).join('');

    wireBoardEvents(host);
  }

  function renderTaskCard(t, canEdit){
    const upBy = t.UpdatedBy || '';
    const upAt = t.UpdatedAt ? formatTimeAgo(t.UpdatedAt) : '';
    const metaLine = (upBy || upAt) ? `<div class="t-lastupdate">↻ ${escapeHtml(upBy || 'someone')}${upAt ? ' · '+upAt : ''}</div>` : '';
    return `
      <div class="task phase-${t.Phase} st-${t.Status}" data-task-id="${escapeAttr(t.TaskId)}">
        <div class="t-head">
          <div class="t-title">${escapeHtml(t.Title)}</div>
          <div class="t-meta">Phase ${t.Phase} · Pri ${t.Priority.replace(/^P/,'')}</div>
          <button class="t-menu-btn" data-task-id="${escapeAttr(t.TaskId)}" ${canEdit?'':'disabled title="Set your name first"'}>⋯</button>
        </div>
        <div class="t-body">${escapeHtml(t.Body)}</div>
        <textarea class="t-notes" data-task-id="${escapeAttr(t.TaskId)}" placeholder="Notes (blockers, context, handoff)…" rows="2">${escapeHtml(t.Notes)}</textarea>
        <div class="t-footer">
          <select class="status-select" data-task-id="${escapeAttr(t.TaskId)}">
            ${STATUSES.map(s=>`<option value="${s.v}" ${t.Status===s.v?'selected':''}>${s.label}</option>`).join('')}
          </select>
          ${metaLine}
        </div>
      </div>
    `;
  }

  function wireBoardEvents(host){
    qsa('.status-select', host).forEach(sel => {
      sel.addEventListener('change', () => {
        const id = sel.getAttribute('data-task-id');
        const v = sel.value;
        const card = sel.closest('.task');
        if(card){
          card.classList.remove('st-todo','st-progress','st-blocked','st-done');
          card.classList.add('st-'+v);
        }
        pushRow('Tasks', id, { Status: v }).then(() => renderBoardSummaryOnly());
      });
    });
    qsa('.t-notes', host).forEach(ta => {
      let timer = null;
      let lastSaved = ta.value;
      const flush = () => {
        if(ta.value === lastSaved) return;
        lastSaved = ta.value;
        const id = ta.getAttribute('data-task-id');
        pushRow('Tasks', id, { Notes: ta.value });
      };
      ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 1200); });
      ta.addEventListener('blur',  () => { clearTimeout(timer); flush(); });
    });
    qsa('.col-add-btn', host).forEach(btn => {
      btn.addEventListener('click', () => {
        if(btn.disabled) return;
        openEditModal(null, btn.getAttribute('data-member-id'));
      });
    });
    qsa('.t-menu-btn', host).forEach(btn => {
      btn.addEventListener('click', () => {
        if(btn.disabled) return;
        openEditModal(btn.getAttribute('data-task-id'), null);
      });
    });
  }

  function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
```

- [ ] **Step 3: Replace `renderBoardSummaryOnly`**

Find `function renderBoardSummaryOnly()` and replace with:

```javascript
  function renderBoardSummaryOnly(){
    const host = qs('#board');
    if(!host) return;
    const activeTeam = teamState.filter(m => m.Active).slice().sort((a,b) => a.Order - b.Order);
    const visibleTasks = taskState.filter(t => !t.Hidden);
    qsa('.col', host).forEach(colEl => {
      const memberId = colEl.getAttribute('data-member-id');
      const mine = visibleTasks.filter(t => t.MemberId === memberId);
      const counts = { todo:0, progress:0, blocked:0, done:0 };
      mine.forEach(t => { counts[t.Status] = (counts[t.Status] || 0) + 1; });
      const sum = qs('.status-summary', colEl);
      if(sum){
        sum.innerHTML = `
          <span><b>${counts.done}</b> done</span>
          <span><b>${counts.progress}</b> wip</span>
          <span><b>${counts.blocked}</b> blocked</span>
          <span><b>${counts.todo}</b> todo</span>
        `;
      }
    });
  }
```

- [ ] **Step 4: Add empty-function stubs for modal + team functions (wired later)**

Add these stubs just above the closing `})();` at the very end of `app.js`:

```javascript
  function openEditModal(taskId, preMemberId){ console.log('openEditModal stub', taskId, preMemberId); }
  function openTeamModal(){ console.log('openTeamModal stub'); }
```

These let the code compile while modals are implemented in Tasks 9–13.

- [ ] **Step 5: Manual verification**

1. Open `index.html` in a browser.
2. Open DevTools console first so you see any errors.
3. Navigate to Task Board tab.
4. Expected: sync pill goes "Syncing…" → "Synced just now". After ~2s the 4 columns appear (Jeff/Christie/Tachi/Jason) with all the seed tasks.
5. Open the backing sheet in another tab and refresh — confirm ~40+ rows now exist in `Tasks` and 4 in `Team`.
6. Click the status dropdown on any task → change to "In Progress" → verify the `Tasks` row in the sheet updates within a second.
7. Type in a note textarea on any task → wait 2s → verify the sheet row updates.
8. Clicking "⋯" or "＋" should log the stub message in console (no modal yet — that's Task 9+).

If the board doesn't populate: check the console. Most likely cause is a typo in one of the constant blocks. If the sheet still shows empty, the bootstrap may have hit an error — check the Network tab for the `POST` response.

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "Task board: render from sheet state; bootstrap on empty"
```

---

## Task 6: Deploy seeded build + verify on GitHub Pages

**Files:** none (push to main)

- [ ] **Step 1: Push current work**

```bash
git push
```

- [ ] **Step 2: Wait ~1 minute, then verify on the deployed site**

Open https://aicgjchiu.github.io/zsp-planning-doc/ in an incognito window (to bypass cache). Navigate to Task Board. Expected: same behavior as local — columns populate, tasks render, sheet reflects any inline edits.

If the deployed build acts differently from local, hard-refresh (Cmd/Ctrl+Shift+R). If still broken, check the deployed URL's console; it may be a cache of an old `app.js`.

- [ ] **Step 3: Reset any dirty sheet state for bootstrap retest if desired**

Not strictly required. Only do this if you want to verify bootstrap works for a teammate loading the site fresh — in which case you'd need to clear both tabs in the sheet and have a teammate load the site. Not needed for this plan's correctness; skip and proceed.

---

## Task 7: Add modal infrastructure (HTML + CSS + helpers)

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`

- [ ] **Step 1: Add `modal-root` to `index.html`**

In `index.html`, find the two `<script>` tags at the bottom:

```html
<script src="data.js"></script>
<script src="app.js"></script>
</body>
```

Insert before the scripts:

```html
<div id="modal-root"></div>
<script src="data.js"></script>
<script src="app.js"></script>
</body>
```

- [ ] **Step 2: Add modal styles to `styles.css`**

Append to the end of `styles.css`:

```css
/* ---- Modal ---- */
#modal-root { position: fixed; inset: 0; pointer-events: none; z-index: 1000; }
#modal-root.open { pointer-events: auto; }
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 48px 16px; overflow-y: auto;
}
.modal-panel {
  background: var(--bg, #fff); color: var(--ink, #111);
  border-radius: 10px; box-shadow: 0 20px 60px rgba(0,0,0,0.35);
  width: 100%; max-width: 560px; padding: 24px;
  display: flex; flex-direction: column; gap: 14px;
}
.modal-panel h3 { margin: 0; font-size: 18px; }
.modal-panel label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--ink-2, #666); }
.modal-panel label input, .modal-panel label textarea, .modal-panel label select {
  font: inherit; padding: 8px 10px; border: 1px solid var(--line, #ddd); border-radius: 6px; background: var(--bg, #fff); color: var(--ink, #111);
}
.modal-panel label textarea { min-height: 80px; resize: vertical; }
.modal-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.modal-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; gap: 8px; }
.modal-footer .right { display: flex; gap: 8px; margin-left: auto; }
.modal-btn { padding: 8px 14px; border-radius: 6px; border: 1px solid var(--line, #ddd); background: var(--bg, #fff); color: var(--ink, #111); cursor: pointer; font: inherit; }
.modal-btn.primary { background: var(--accent, #2b6cb0); color: #fff; border-color: transparent; }
.modal-btn.danger { color: #c0392b; border-color: #c0392b; }
.modal-confirm-inline { background: #fdecea; padding: 8px 10px; border-radius: 6px; display: flex; align-items: center; gap: 10px; }

/* ---- Task card / column-head additions ---- */
.t-menu-btn, .col-add-btn {
  background: transparent; border: 1px solid var(--line, #ddd); border-radius: 4px;
  width: 24px; height: 24px; padding: 0; cursor: pointer; font-size: 14px; line-height: 1;
}
.t-menu-btn:disabled, .col-add-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.t-head { display: flex; align-items: flex-start; gap: 6px; }
.t-head .t-title { flex: 1; }
.t-head .t-menu-btn { margin-top: 2px; }
.col-head { display: flex; align-items: center; gap: 8px; }
.col-head .col-add-btn { margin-left: auto; }

/* ---- Legend row ---- */
.legend-row { font-size: 11.5px; color: var(--ink-3, #888); padding: 6px 0 4px; }
.legend-row b { color: var(--ink-2, #444); }
```

Note: the CSS variable names (`--bg`, `--ink`, etc.) assume the existing custom props; if the repo uses different names, inspect `styles.css` and adapt. Check that existing props in `:root` cover the names referenced here — adjust if needed.

- [ ] **Step 3: Add modal helpers to `app.js`**

Replace the two stub functions added in Task 5 (`openEditModal` and `openTeamModal`) with a modal core plus the real stubs. Insert this block just above the closing `})();` at the bottom of `app.js`:

```javascript
  function closeModal(){
    const root = qs('#modal-root');
    if(!root) return;
    root.innerHTML = '';
    root.classList.remove('open');
    document.removeEventListener('keydown', modalKeyHandler);
  }
  function modalKeyHandler(e){ if(e.key === 'Escape') closeModal(); }
  function openModal(panelHtml, onMount){
    const root = qs('#modal-root');
    if(!root) return;
    root.innerHTML = `<div class="modal-overlay" data-overlay>${panelHtml}</div>`;
    root.classList.add('open');
    document.addEventListener('keydown', modalKeyHandler);
    // Click on overlay (not panel) closes
    const overlay = qs('[data-overlay]', root);
    overlay.addEventListener('click', (e) => { if(e.target === overlay) closeModal(); });
    if(typeof onMount === 'function') onMount(root);
  }

  // Real implementations come in later tasks — keep stubs functional so wiring works
  function openEditModal(taskId, preMemberId){
    openModal(`<div class="modal-panel"><h3>Edit Task</h3><p>Not yet implemented (task ${taskId || 'new'}, member ${preMemberId || '-'}).</p><div class="modal-footer"><div class="right"><button class="modal-btn" data-close>Close</button></div></div></div>`, (root) => {
      qs('[data-close]', root).addEventListener('click', closeModal);
    });
  }
  function openTeamModal(){
    openModal(`<div class="modal-panel"><h3>Manage Team</h3><p>Not yet implemented.</p><div class="modal-footer"><div class="right"><button class="modal-btn" data-close>Close</button></div></div></div>`, (root) => {
      qs('[data-close]', root).addEventListener('click', closeModal);
    });
  }
```

- [ ] **Step 4: Manual verification**

Reload the page. On the Task Board:
1. Click any "⋯" on a task → a modal opens with "Edit Task · Not yet implemented". Click "Close" or press Escape or click the dim overlay → modal closes.
2. Click any "＋" on a column header → modal opens with "Edit Task · Not yet implemented (task new, member ...)".
3. No regression on status dropdowns or notes.

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css app.js
git commit -m "Task board: modal infrastructure (overlay, open/close)"
```

---

## Task 8: Implement real Edit Task modal (view + save for existing)

**Files:**
- Modify: `app.js` (replace `openEditModal`)

- [ ] **Step 1: Replace `openEditModal` with the real implementation**

In `app.js`, find the stub `function openEditModal(taskId, preMemberId){ ... }` inserted in Task 7 and replace with:

```javascript
  function openEditModal(taskId, preMemberId){
    const isNew = !taskId;
    const t = isNew
      ? { TaskId:'', MemberId: preMemberId || (teamState[0] && teamState[0].MemberId) || '', Title:'', Body:'', Phase:1, Priority:'P1', Status:'todo', Notes:'', Assignee:'', Hidden:false, SortOrder:0 }
      : taskState.find(x => x.TaskId === taskId);
    if(!t){ alert('Task not found.'); return; }

    const phaseOpts = (window.PHASES || []).map(p => `<option value="${p.num}" ${t.Phase===p.num?'selected':''}>Phase ${p.num} — ${escapeHtml(p.name)}</option>`).join('')
      || [1,2,3,4,5,6].map(n => `<option value="${n}" ${t.Phase===n?'selected':''}>Phase ${n}</option>`).join('');
    const prioOpts = PRIORITIES.map(p => `<option value="${p.v}" ${t.Priority===p.v?'selected':''}>${escapeHtml(p.label)}</option>`).join('');
    const memberOpts = teamState.filter(m => m.Active).slice().sort((a,b)=>a.Order-b.Order)
      .map(m => `<option value="${escapeAttr(m.MemberId)}" ${t.MemberId===m.MemberId?'selected':''}>${escapeHtml(m.Name)} (${escapeHtml(m.RoleLabel)})</option>`).join('');

    const html = `
      <div class="modal-panel" data-panel>
        <h3>${isNew?'Add Task':'Edit Task'}</h3>
        <label>Title<input type="text" data-f="Title" value="${escapeAttr(t.Title)}"></label>
        <label>Description<textarea data-f="Body">${escapeHtml(t.Body)}</textarea></label>
        <div class="modal-row">
          <label>Phase<select data-f="Phase">${phaseOpts}</select></label>
          <label>Priority<select data-f="Priority">${prioOpts}</select></label>
        </div>
        <div class="modal-row">
          <label>Column / Member<select data-f="MemberId">${memberOpts}</select></label>
          <label>Assignee (optional override)<input type="text" data-f="Assignee" value="${escapeAttr(t.Assignee)}" placeholder="Leave blank for default"></label>
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
        qsa('[data-f]', panel).forEach(el => {
          const k = el.getAttribute('data-f');
          let v = el.value;
          if(k === 'Phase') v = Number(v);
          fields[k] = v;
        });
        if(!fields.Title || !String(fields.Title).trim()){
          alert('Title is required.');
          return;
        }
        const key = isNew ? genId('task') : t.TaskId;
        if(isNew){
          // Compute SortOrder as max within new member column + 1000
          const maxSo = taskState
            .filter(x => x.MemberId === fields.MemberId)
            .reduce((m,x) => Math.max(m, x.SortOrder), 0);
          fields.SortOrder = maxSo + 1000;
          fields.Status = 'todo';
          fields.Hidden = false;
          fields.Notes = '';
        }
        closeModal();
        await pushRow('Tasks', key, fields);
        renderBoard();
      });
      if(!isNew){
        qs('[data-action="delete"]', panel).addEventListener('click', () => {
          // Inline confirm
          const footer = qs('.modal-footer', panel);
          footer.innerHTML = `
            <div class="modal-confirm-inline">
              Hide this task? Recoverable from the sheet.
              <button class="modal-btn danger" data-action="confirm-delete">Yes, hide</button>
              <button class="modal-btn" data-action="cancel-delete">No</button>
            </div>
          `;
          qs('[data-action="cancel-delete"]', footer).addEventListener('click', closeModal);
          qs('[data-action="confirm-delete"]', footer).addEventListener('click', async () => {
            closeModal();
            await pushRow('Tasks', t.TaskId, { Hidden: true });
            renderBoard();
          });
        });
      }
    });
  }
```

- [ ] **Step 2: Manual verification**

1. Reload page. On Task Board, click "⋯" on an existing task.
2. Modal opens with all fields pre-filled. Change the Title (e.g. append " — edited"), click Save.
3. Expected: modal closes, card re-renders with new title, sheet row updates `Title`, `UpdatedAt`, `UpdatedBy` within ~1s.
4. Click "⋯" on a different task. Change Column/Member to someone else, click Save.
5. Expected: task disappears from original column, appears at the bottom of the new column.
6. Click "＋" on a column header.
7. Expected: modal opens in Add mode with MemberId pre-selected, no Delete button. Enter Title and Description, click Create.
8. Expected: new card appears at the bottom of that column. Sheet gets a new row with a `task-...` TaskId.
9. Click "⋯" on any card, click Delete, click "Yes, hide".
10. Expected: card disappears. Sheet row has `Hidden=TRUE`. Refresh the page → card stays hidden.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "Task board: implement edit modal (add/edit/soft-delete)"
```

---

## Task 9: Implement real Team management modal

**Files:**
- Modify: `app.js` (replace `openTeamModal`)

- [ ] **Step 1: Replace the `openTeamModal` stub**

In `app.js`, find the `openTeamModal` stub and replace with:

```javascript
  function openTeamModal(){
    // Local editable copy — saved on Save click
    const draft = teamState.map(m => Object.assign({}, m));

    function panelHtml(){
      const roleOpts = (sel) => ROLE_KEYS.map(r => `<option value="${r.v}" ${sel===r.v?'selected':''}>${escapeHtml(r.label)}</option>`).join('');
      const rows = draft.slice().sort((a,b)=>a.Order-b.Order).map((m, i) => `
        <tr data-member-id="${escapeAttr(m.MemberId)}">
          <td><input type="text" data-f="Name" value="${escapeAttr(m.Name)}"></td>
          <td><select data-f="RoleKey">${roleOpts(m.RoleKey)}</select></td>
          <td><input type="text" data-f="RoleLabel" value="${escapeAttr(m.RoleLabel)}"></td>
          <td class="mono-cell">${m.Order}</td>
          <td>
            <button class="modal-btn" data-action="up" ${i===0?'disabled':''}>↑</button>
            <button class="modal-btn" data-action="down" ${i===draft.length-1?'disabled':''}>↓</button>
          </td>
          <td><label style="flex-direction:row;align-items:center;gap:4px"><input type="checkbox" data-f="Active" ${m.Active?'checked':''}> active</label></td>
        </tr>
      `).join('');
      return `
        <div class="modal-panel" data-panel style="max-width:720px">
          <h3>Manage Team</h3>
          <table class="sheet">
            <thead><tr><th>Name</th><th>Role</th><th>Role label</th><th>Order</th><th style="width:90px">Reorder</th><th style="width:80px">Active</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div><button class="modal-btn" data-action="add-member">+ Add member</button></div>
          <div class="modal-footer">
            <div class="right">
              <button class="modal-btn" data-action="cancel">Cancel</button>
              <button class="modal-btn primary" data-action="save">Save</button>
            </div>
          </div>
        </div>
      `;
    }

    function rerender(root){
      root.innerHTML = `<div class="modal-overlay" data-overlay>${panelHtml()}</div>`;
      wire(root);
    }

    function wire(root){
      const overlay = qs('[data-overlay]', root);
      overlay.addEventListener('click', (e) => { if(e.target === overlay) closeModal(); });
      const panel = qs('[data-panel]', root);
      // Input sync → draft
      qsa('tr[data-member-id]', panel).forEach(tr => {
        const id = tr.getAttribute('data-member-id');
        const m = draft.find(x => x.MemberId === id);
        qsa('[data-f]', tr).forEach(el => {
          el.addEventListener('change', () => {
            const k = el.getAttribute('data-f');
            m[k] = (el.type === 'checkbox') ? el.checked : el.value;
          });
        });
        qs('[data-action="up"]', tr).addEventListener('click', () => {
          const sorted = draft.slice().sort((a,b)=>a.Order-b.Order);
          const idx = sorted.findIndex(x => x.MemberId === id);
          if(idx > 0){
            const a = sorted[idx-1], b = sorted[idx];
            const t = a.Order; a.Order = b.Order; b.Order = t;
            rerender(root);
          }
        });
        qs('[data-action="down"]', tr).addEventListener('click', () => {
          const sorted = draft.slice().sort((a,b)=>a.Order-b.Order);
          const idx = sorted.findIndex(x => x.MemberId === id);
          if(idx < sorted.length - 1){
            const a = sorted[idx], b = sorted[idx+1];
            const t = a.Order; a.Order = b.Order; b.Order = t;
            rerender(root);
          }
        });
      });
      qs('[data-action="add-member"]', panel).addEventListener('click', () => {
        const maxOrder = draft.reduce((m,x) => Math.max(m, x.Order||0), 0);
        draft.push({
          MemberId: genId('mbr'),
          Name: 'New member',
          RoleKey: 'programmer',
          RoleLabel: 'Role',
          Order: maxOrder + 1,
          Active: true,
          _isNew: true,
        });
        rerender(root);
      });
      qs('[data-action="cancel"]', panel).addEventListener('click', closeModal);
      qs('[data-action="save"]', panel).addEventListener('click', async () => {
        const anyActive = draft.some(m => m.Active);
        if(!anyActive){
          alert('At least one member must be Active.');
          return;
        }
        closeModal();
        // Diff draft vs teamState; push changed or new rows
        for(const m of draft){
          const orig = teamState.find(x => x.MemberId === m.MemberId);
          const changed = !orig
            || orig.Name !== m.Name
            || orig.RoleKey !== m.RoleKey
            || orig.RoleLabel !== m.RoleLabel
            || orig.Order !== m.Order
            || orig.Active !== m.Active;
          if(changed){
            await pushRow('Team', m.MemberId, {
              Name: m.Name, RoleKey: m.RoleKey, RoleLabel: m.RoleLabel, Order: m.Order, Active: m.Active,
            });
          }
        }
        renderBoard();
      });
    }

    const root = qs('#modal-root');
    rerender(root);
    root.classList.add('open');
    document.addEventListener('keydown', modalKeyHandler);
  }
```

- [ ] **Step 2: Manual verification**

1. Reload. On the Task Board, the "Team" button isn't wired yet (that's Task 10). Temporarily wire it by running in the browser console:
   ```js
   openTeamModal();
   ```
   Hmm — it's inside an IIFE, so this won't work. Instead, test by temporarily binding the "Change name" button: in DevTools Elements panel, find `#change-name-btn`, and in Console run:
   ```js
   document.getElementById('change-name-btn').click();  // existing behavior
   ```
   Skip this test and proceed to Task 10 which wires a real "Team" button. We'll verify both together.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "Task board: implement team management modal"
```

---

## Task 10: Wire "Team" button + "Change name" on the board toolbar

**Files:**
- Modify: `index.html` (board toolbar)
- Modify: `app.js` (button binding)

- [ ] **Step 1: Add the Team button to the toolbar**

In `index.html`, find the `sync-controls` div:

```html
<div class="sync-controls">
  <span id="sync-pill" class="sync-pill sync-syncing">Connecting…</span>
  <span id="sync-user" class="small mono-cell" style="color:var(--ink-3)"></span>
  <button class="reset-btn" id="refresh-now-btn">↻ Refresh</button>
  <button class="reset-btn" id="change-name-btn">Change name</button>
</div>
```

Add one more button before the closing `</div>`:

```html
  <button class="reset-btn" id="team-btn">Team</button>
</div>
```

- [ ] **Step 2: Wire the button in `app.js`**

In `app.js`, inside `renderAll()`, find the existing `nameBtn` block and add after it:

```javascript
    const teamBtn = qs('#team-btn');
    if(teamBtn){
      teamBtn.addEventListener('click', () => {
        if(!userName){ alert('Set your name first (click "Change name").'); return; }
        openTeamModal();
      });
    }
```

- [ ] **Step 3: Manual verification**

1. Reload the page. Make sure "Change name" has stored a name (prompt on first write still works; or click "Change name" and enter one).
2. Click "Team" button. Team modal opens with all 4 members.
3. Click "↓" on Jeff to move him below Christie.
4. Edit Christie's name to "Christine", click Save.
5. Expected: modal closes, board re-renders. Columns reorder (Christie first now, renamed to Christine). Sheet `Team` rows reflect the changes.
6. Click "Team" again, click "+ Add member". A new row appears with "New member"/"programmer"/"Role". Save.
7. Expected: a new 5th column appears on the board with 0 tasks. Sheet has a new `Team` row.
8. Click "Team" again, uncheck "active" on the new row, Save.
9. Expected: the new 5th column disappears from the board. Sheet row shows `Active=FALSE`.
10. Fix Christie's name back to "Christie" and click Jeff's "↑" to restore original order. Save.

- [ ] **Step 4: Commit**

```bash
git add index.html app.js
git commit -m "Task board: wire Team toolbar button"
```

---

## Task 11: Phase + Priority legend row above the filter

**Files:**
- Modify: `index.html` (task board section)
- Modify: `app.js` (renderLegend function)

- [ ] **Step 1: Add legend element to `index.html`**

In `index.html`, find the task board controls div:

```html
<div class="board-controls">
  <div class="phase-filter">
    <button class="active" data-phase="all">All phases</button>
    ...
```

Insert a legend row immediately above `<div class="board-controls">`:

```html
<div class="legend-row" id="phase-priority-legend"></div>
<div class="board-controls">
```

- [ ] **Step 2: Remove the old priority legend at the bottom**

Still in `index.html`, find this block near the end of the tasks `<main>`:

```html
<div class="note mt-8">
  <b>Priority legend.</b> <code>P0</code> = blocker / on critical path. <code>P1</code> = important, schedule-able within phase. <code>P2</code> = nice-to-have; first to cut if the phase slips. Rebalance priorities at the end of each phase gate.
</div>
```

Delete that entire `<div class="note mt-8">…</div>` block. The new legend above the filter replaces it.

- [ ] **Step 3: Render legend in `app.js`**

Add a `renderLegend()` function. Insert just before `function renderBoard()`:

```javascript
  function renderLegend(){
    const host = qs('#phase-priority-legend');
    if(!host) return;
    const phases = (window.PHASES || [])
      .map(p => `${p.num} ${escapeHtml(p.name)}`)
      .join(' · ');
    host.innerHTML = `<b>Phase</b> ${phases || '1–6'} &nbsp;·&nbsp;·&nbsp;·&nbsp; <b>Priority</b> P0 Must · P1 Should · P2 Nice`;
  }
```

Then in `renderAll()`, after `renderBoard();`, add:

```javascript
    renderLegend();
```

Also call `renderLegend()` inside `renderBoard()` at the top, so it refreshes with the board:

```javascript
  function renderBoard(){
    renderLegend();
    const host = qs('#board');
    ...
```

- [ ] **Step 4: Manual verification**

1. Reload. Task Board tab.
2. Legend line appears above the phase filter: "Phase 1 Vertical Slice · 2 Playable Alpha · ... · · · Priority P0 Must · P1 Should · P2 Nice".
3. The old footer priority legend is gone.
4. Each task card's `.t-meta` reads `Phase N · Pri M` (this was already changed in Task 5).

- [ ] **Step 5: Commit**

```bash
git add index.html app.js
git commit -m "Task board: phase + priority legend above filter"
```

---

## Task 12: Identity prompt on page load; gate edit buttons

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Add an on-load identity step**

In `app.js`, find `renderAll()`. Near the bottom, just before the first `fetchAll()` call, insert a preamble that prompts for name on load if not set:

```javascript
    // Identity: read from localStorage on load. If not present, prompt after first fetch.
    try{ userName = localStorage.getItem(USER_KEY) || ''; }catch(e){}
```

Then, at the very end of `fetchAll()` (inside the `try` block, after `renderBoard();`), insert a one-time prompt if `userName` is still empty:

```javascript
      if(!userName){
        const n = (prompt('Enter your name — shown on tasks you create or update. You can change it later.') || '').trim();
        if(n){
          userName = n;
          try{ localStorage.setItem(USER_KEY, n); }catch(e){}
          updateSyncPill();
          renderBoard(); // re-render to enable edit buttons
        }
      }
```

- [ ] **Step 2: Update `getUserName` to use `userName` state**

Replace the existing `getUserName()` function with:

```javascript
  function getUserName(){
    if(userName) return userName;
    try{ userName = localStorage.getItem(USER_KEY) || ''; }catch(e){}
    if(!userName){
      userName = (prompt('Your name (shown as "last updated by" on tasks):') || '').trim();
      if(userName){ try{ localStorage.setItem(USER_KEY, userName); }catch(e){} }
    }
    return userName;
  }
```

- [ ] **Step 3: Also gate the "Change name" button to update state + re-render**

Find the `nameBtn` click handler in `renderAll()`. Replace with:

```javascript
    const nameBtn = qs('#change-name-btn');
    if(nameBtn){
      nameBtn.addEventListener('click', ()=>{
        const cur = (localStorage.getItem(USER_KEY) || '');
        const n = (prompt('Your name:', cur) || '').trim();
        if(n){
          userName = n;
          try{ localStorage.setItem(USER_KEY, n); }catch(e){}
          updateSyncPill();
          renderBoard();
        }
      });
    }
```

- [ ] **Step 4: Manual verification**

1. Clear localStorage for the site (DevTools → Application → Local Storage → right-click → Clear).
2. Reload. On Task Board tab, after sync completes, a prompt appears asking for your name.
3. Cancel the prompt. The board renders but "＋" and "⋯" buttons are visually disabled (greyed out, cursor:not-allowed).
4. Try clicking a "＋" — nothing happens (disabled).
5. Click "Change name", enter a name.
6. Board re-renders. "＋" and "⋯" are now enabled. Click "⋯" on a task — modal opens.
7. Close, click "Team" button. If you cancelled and never set a name, alert asks you to set it first.
8. Reload. This time the prompt should NOT appear (name is cached).

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "Task board: prompt identity on load; gate edit buttons"
```

---

## Task 13: Update `CLAUDE.md` + `apps-script.gs` mirror

**Files:**
- Modify: `CLAUDE.md`
- Modify: `apps-script.gs` (already updated in Task 1; verify it matches deployed)

- [ ] **Step 1: Verify `apps-script.gs` matches what's deployed**

Open the Apps Script editor on the sheet, copy the script, diff against `apps-script.gs` in the repo. They should match byte-for-byte. If not, sync them.

- [ ] **Step 2: Update `CLAUDE.md` Task Board section**

Open `CLAUDE.md`. Find the section starting `### Task Board · Google Sheets sync`. Replace the entire subsection (from that heading down to the next `###` heading — currently `### Task IDs (stable across refreshes)`) with:

```markdown
### Task Board · Google Sheets sync

Live-synced task board backed by a Google Sheet via an Apps Script web app. **The sheet is the source of truth for tasks themselves**, not just per-task state.

- **Endpoint:** configured in `app.js` as `SHEET_ENDPOINT` (a Google Apps Script `/exec` URL).
- **Backing sheet (inspect rows, debug, recover soft-deletes):** https://docs.google.com/spreadsheets/d/1Od7n8hbOO24SIJiyGR7ctfYTkkLdUXLVf06KiUCY0hQ/edit
- **Two tabs:**
  - **`Tasks`** headers (row 1, in order): `TaskId | MemberId | Title | Body | Phase | Priority | Status | Notes | Assignee | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`
  - **`Team`** headers: `MemberId | Name | RoleKey | RoleLabel | Order | Active`
- **Read:** `GET` returns `{ ok: true, tasks: [...], team: [...] }` — one object per row, keyed by header.
- **Write:** `POST` with `Content-Type: text/plain;charset=utf-8` and JSON body `{ Tab: "Tasks"|"Team", Key: <TaskId|MemberId>, Fields: { ... }, UpdatedBy: <name> }`. Script appends if key doesn't exist, otherwise updates only the named fields. `UpdatedAt` + `UpdatedBy` stamped automatically.
- **Bootstrap:** on page load, if both tabs are empty, the client POSTs `{ Action: "bootstrap", Tasks: [...], Team: [...] }`. Script seeds rows atomically inside `LockService.getScriptLock()` and re-checks emptiness inside the critical section, so two simultaneous loads don't double-seed.
- **Polling:** `fetchAll()` runs on page load and every 30s thereafter. Status dropdown / notes writes push immediately (notes debounced 1.2s). Structural edits (title/body/phase/priority/column/assignee/delete) happen in a modal and push on Save.
- **Identity:** user's name is prompted on page load (via `DOMContentLoaded` → post-fetch prompt in `fetchAll`) and stored in `localStorage` under `zsp_user_name`. Stamped on every write as `UpdatedBy`. Add/Edit/Delete/Team buttons are disabled until identity is set; status/notes inline edits still work without it.
- **Soft delete only:** setting `Hidden=TRUE` filters a task from the UI. Row stays in the sheet and can be recovered by flipping the flag manually.
```

- [ ] **Step 3: Delete the now-obsolete "Task IDs (stable across refreshes)" section**

The next subsection in `CLAUDE.md` is `### Task IDs (stable across refreshes)` with its code block. Replace that entire subsection with:

```markdown
### Task IDs

- **Seeded tasks** (from the one-time `window.TASKS` migration) use a deterministic legacy ID: `${legacyColKey}-p${phase}-${priority}-${slug}-${idx}`. This keeps any pre-existing sheet rows aligned during the migration.
- **New tasks** (created via the UI) get a client-generated ID: `task-<timestamp>-<random>`. Stable for the lifetime of the row.
- `MemberId` links a task to a team member; `RoleKey` on the team member drives chip color.

`window.TASKS` in `data.js` is the seed source, used only on first-ever load into an empty sheet. A follow-up PR removes `window.TASKS` entirely once migration is verified; the sheet is the sole source of truth after that.
```

- [ ] **Step 4: Update the Apps Script backend section**

Find the `## Google Apps Script Backend` section. Replace the code block (the old `const SHEET_NAME = 'Tasks'; function doGet() {...}` block) with the pointer to the mirror:

```markdown
## Google Apps Script Backend

The script that powers the task-board backend is deployed from the Google Sheet (Extensions → Apps Script). A mirror of the current deployed script lives in **`apps-script.gs`** at the repo root — always keep it in sync with the editor after any deploy.

**High-level shape:** `doGet` returns both tabs; `doPost` routes to `handleUpsert` or `handleBootstrap` based on the request body. `handleBootstrap` wraps its check-and-write in `LockService.getScriptLock()` to prevent double-seeding on concurrent first loads.

**Deployment:** Apps Script editor → Deploy → Manage deployments → pencil icon → New version → Deploy. Any code change requires a new version — otherwise the old code keeps serving.
```

- [ ] **Step 5: Update the "When Editing" section**

Find the `## When Editing` section. The first bullet says:

```markdown
- **Change task content:** edit `window.TASKS` in `data.js`. Renaming a task title changes its TaskID and orphans its sheet row — prefer editing the `body` text and leaving `title` stable.
```

Replace with:

```markdown
- **Change task content:** edit tasks from the Task Board tab UI (click `⋯` on a card) — this is the new source of truth. `window.TASKS` in `data.js` is seed-only and no longer read after first load; edits there have no effect on the live board.
- **Team composition:** use the Task Board's "Team" button to add / rename / reorder / deactivate members. No code change needed when the team composition shifts.
```

- [ ] **Step 6: Manual verification**

1. Re-read the updated `CLAUDE.md` top-to-bottom. Confirm no mention of `window.TASKS` as live source remains; no mention of the old `{TaskId, Status?, Notes?}` POST envelope remains.
2. Confirm `apps-script.gs` contents match what's in the Apps Script editor.

- [ ] **Step 7: Commit + push**

```bash
git add CLAUDE.md apps-script.gs
git commit -m "Docs: update CLAUDE.md for editable task board + new sheet schema"
git push
```

- [ ] **Step 8: Verify deployed site**

Wait ~1 minute, open https://aicgjchiu.github.io/zsp-planning-doc/ in incognito, navigate to Task Board. Expected: everything works end-to-end — legend, edit modal, team modal, identity prompt, soft delete.

---

## Post-plan followups (separate PRs)

- **Cleanup PR:** once the team has verified the new board works for a few days, remove `window.TASKS` and `legacyTaskId()` from the codebase. Update `CLAUDE.md` accordingly to drop the "seeded tasks use legacy ID" note.
- **Deferred scope:** Roadmap / Gantt editing (separate spec + plan). Design Doc editing (separate spec + plan). Both can reuse the modal infrastructure and `pushRow` pattern introduced here.
