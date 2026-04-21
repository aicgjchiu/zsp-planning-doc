# Optimistic UI Everywhere — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `pushRow`'s existing optimistic state patches from *after* the network await to *before* it, add a `_pending` indicator that's cleared when the POST resolves, and convert the hot call sites across Task Board / Design Doc / Roadmap to fire-and-forget so writes feel instant.

**Architecture:** Pure client-side plumbing. `pushRow` becomes the single source of truth for optimistic state mutation: every caller (including the hand-rolled Roadmap paths from the last branch) relies on it. Renderers stamp a `.pending` CSS class on rows whose state has `_pending: true`; the class is dropped automatically when `pushRow` resolves (success) or rejects (failure). No backend changes.

**Tech Stack:** Plain HTML/CSS/JS. No bundler, no tests. Verification is **manual browser testing** after each commit — open `index.html` via `file://` (Apps Script fetch works from `file://` per CLAUDE.md) or wait ~60s for GitHub Pages redeploy after a push.

**Spec:** `docs/superpowers/specs/2026-04-21-optimistic-ui-everywhere-design.md`

**Testing note:** Same workflow as the Roadmap branch — edit → commit → push → hard-refresh → verify against per-task checks. Work on a feature branch `optimistic-ui`, merge to `main` when all tasks green.

---

## Task 1: Refactor `pushRow` — patch-before-fetch + `_pending` + missing tab branches

**Files:**
- Modify: `app.js` (the `pushRow` function, currently around lines 351–417)

**Context:** Today `pushRow` does `await fetch`, then applies optimistic patches. This task flips that order: patch first (synchronously), then fire the POST. Also introduces a `_pending` flag on patched rows, and adds optimistic branches for `GanttTracks`, `GanttBars`, `Milestones` which were skipped during the Roadmap branch.

- [ ] **Step 1: Read the current `pushRow` and identify every per-tab branch**

Use Grep / Read to locate `pushRow` in `app.js`. Record:
- Which tab names currently have a branch (`Tasks`, `Team`, `Characters`, `Items`, `Maps`, `Systems`).
- The primary-key field name per tab (`TaskId`, `MemberId`, `Id`, `Id`, `Id`, `Id`).
- The state-array variable names (`taskState`, `teamState`, `charactersState`, `itemsState`, `mapsState`, `systemsState`).

- [ ] **Step 2: Extract two helpers — `applyOptimisticPatch` and `clearPendingFlag`**

Add these just above `pushRow`. They consolidate the per-tab dispatch so both the pre-POST patch and post-POST clear share the same logic.

```js
function applyOptimisticPatch(tab, key, fields){
  const nowIso = new Date().toISOString();
  const stamp = { UpdatedAt: nowIso, UpdatedBy: userName || 'anonymous', _pending: true };

  if(tab === 'Tasks'){
    const i = taskState.findIndex(t => t.TaskId === key);
    const patch = Object.assign({}, fields, stamp);
    if(i >= 0) taskState[i] = Object.assign({}, taskState[i], patch);
    else       taskState.push(Object.assign({ TaskId: key, CreatedAt: nowIso }, patch));
  } else if(tab === 'Team'){
    const i = teamState.findIndex(m => m.MemberId === key);
    const patch = Object.assign({}, fields, stamp);
    if(i >= 0) teamState[i] = Object.assign({}, teamState[i], patch);
    else       teamState.push(Object.assign({ MemberId: key }, patch));
  } else if(tab === 'Characters'){
    const i = charactersState.findIndex(c => c.Id === key);
    let abilities;
    if(fields.AbilitiesJson !== undefined){
      try { const p = JSON.parse(fields.AbilitiesJson); abilities = Array.isArray(p) ? p : []; }
      catch(e){ abilities = []; }
    } else if(i >= 0){ abilities = charactersState[i].abilities; }
    else { abilities = []; }
    const patch = Object.assign({}, fields, { abilities }, stamp);
    if(i >= 0) charactersState[i] = Object.assign({}, charactersState[i], patch);
    else       charactersState.push(Object.assign({ Id: key, CreatedAt: nowIso }, patch));
  } else if(tab === 'Items'){
    const i = itemsState.findIndex(x => x.Id === key);
    const patch = Object.assign({}, fields, stamp);
    if(i >= 0) itemsState[i] = Object.assign({}, itemsState[i], patch);
    else       itemsState.push(Object.assign({ Id: key, CreatedAt: nowIso }, patch));
  } else if(tab === 'Maps'){
    const i = mapsState.findIndex(x => x.Id === key);
    const patch = Object.assign({}, fields, stamp);
    if(i >= 0) mapsState[i] = Object.assign({}, mapsState[i], patch);
    else       mapsState.push(Object.assign({ Id: key, CreatedAt: nowIso }, patch));
  } else if(tab === 'Systems'){
    const i = systemsState.findIndex(x => x.Id === key);
    const patch = Object.assign({}, fields, stamp);
    if(i >= 0) systemsState[i] = Object.assign({}, systemsState[i], patch);
    else       systemsState.push(Object.assign({ Id: key, CreatedAt: nowIso }, patch));
  } else if(tab === 'GanttTracks'){
    const i = ganttTracksState.findIndex(x => x.TrackId === key);
    const patch = Object.assign({}, fields, stamp);
    if(i >= 0) ganttTracksState[i] = Object.assign({}, ganttTracksState[i], patch);
    else       ganttTracksState.push(Object.assign({ TrackId: key, CreatedAt: nowIso }, patch));
  } else if(tab === 'GanttBars'){
    const i = ganttBarsState.findIndex(x => x.BarId === key);
    const patch = Object.assign({}, fields, stamp);
    if(i >= 0) ganttBarsState[i] = Object.assign({}, ganttBarsState[i], patch);
    else       ganttBarsState.push(Object.assign({ BarId: key, CreatedAt: nowIso }, patch));
  } else if(tab === 'Milestones'){
    const i = milestonesState.findIndex(x => x.MilestoneId === key);
    const patch = Object.assign({}, fields, stamp);
    if(i >= 0) milestonesState[i] = Object.assign({}, milestonesState[i], patch);
    else       milestonesState.push(Object.assign({ MilestoneId: key, CreatedAt: nowIso }, patch));
  }
}

function clearPendingFlag(tab, key){
  const target =
    tab === 'Tasks'       ? { arr: taskState,        idField: 'TaskId'      } :
    tab === 'Team'        ? { arr: teamState,        idField: 'MemberId'    } :
    tab === 'Characters'  ? { arr: charactersState,  idField: 'Id'          } :
    tab === 'Items'       ? { arr: itemsState,       idField: 'Id'          } :
    tab === 'Maps'        ? { arr: mapsState,        idField: 'Id'          } :
    tab === 'Systems'     ? { arr: systemsState,     idField: 'Id'          } :
    tab === 'GanttTracks' ? { arr: ganttTracksState, idField: 'TrackId'     } :
    tab === 'GanttBars'   ? { arr: ganttBarsState,   idField: 'BarId'       } :
    tab === 'Milestones'  ? { arr: milestonesState,  idField: 'MilestoneId' } : null;
  if(!target) return;
  const i = target.arr.findIndex(x => x[target.idField] === key);
  if(i >= 0 && target.arr[i]._pending){
    const copy = Object.assign({}, target.arr[i]);
    delete copy._pending;
    target.arr[i] = copy;
  }
}
```

- [ ] **Step 3: Rewrite `pushRow` to patch first, then POST**

Replace the existing `pushRow` body with this. Note: the optimistic patch now runs **synchronously before** `pendingWrites++` and the fetch. No functionality change on the wire — same POST body, same Apps Script endpoint.

```js
async function pushRow(tab, key, fields){
  applyOptimisticPatch(tab, key, fields);
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
    clearPendingFlag(tab, key);
  }catch(err){
    console.warn('[sync] push error:', err);
    setSyncStatus('error');
    clearPendingFlag(tab, key);
    alert('Could not save to Google Sheet. Check your connection and try again.\n\n' + err.message);
  }finally{
    pendingWrites--;
    updateSyncPill();
  }
}
```

- [ ] **Step 4: Remove the old per-tab branches from `pushRow`**

Double-check that the big `if(tab === 'Tasks'){ ... } else if(tab === 'Team'){ ... } ...` block that used to live inside `pushRow` is gone — it's now in `applyOptimisticPatch`. If your Step 3 replacement accidentally left any of it, delete.

- [ ] **Step 5: Commit**

```bash
git checkout -b optimistic-ui
git add app.js
git commit -m "pushRow: optimistic patch before POST + _pending flag + three new tab branches"
```

- [ ] **Step 6: Verify (no-regression)**

Open `index.html` locally. Edit a task (any existing edit-modal Save on the Task Board). Expected: still works, still updates after ~1s (we haven't touched call sites yet). Check DevTools console — no errors. Grep-verify `pushRow` is ~25 lines, not ~70.

---

## Task 2: Add `.pending` CSS + renderer class hooks

**Files:**
- Modify: `styles.css` (append one block near the bottom)
- Modify: `app.js` (each render function that produces edit-eligible DOM)

**Context:** Adds a visual "in-flight" indicator — a dashed outline + reduced opacity — to any row whose state has `_pending: true`. Applied to task cards, character/map cards, item/system rows, Gantt bars (user + milestone), and milestone cards. Skipped for Gantt track rows and Team member rows (they have no per-row UI surface outside modals; the sync pill handles it).

- [ ] **Step 1: Append the `.pending` rule to `styles.css`**

```css
/* ---- Optimistic UI: pending indicator ---- */
.pending{
  outline:1.5px dashed var(--ink-3);
  outline-offset:-2px;
  opacity:0.8;
}
/* Gantt bars: keep the outline inside the bar so it doesn't bleed past grid cells. */
.gbar.pending{outline-offset:-3px}
/* Table rows look better with a left-side indicator than an outline. */
tr.pending{outline:none;box-shadow:inset 4px 0 0 var(--ink-3)}
```

- [ ] **Step 2: Add `.pending` to each task card in `renderTaskCard`**

Grep for `function renderTaskCard` in `app.js`. Find the card's opening tag (something like `<div class="task-card ...">`). Add `${t._pending ? ' pending' : ''}` to the class attribute.

Concrete example — if the current line looks like:
```js
return `<div class="task-card phase-${t.Phase}">...`;
```
Change to:
```js
return `<div class="task-card phase-${t.Phase}${t._pending ? ' pending' : ''}">...`;
```

(Actual class string will differ — preserve everything else, just append the conditional.)

- [ ] **Step 3: Add `.pending` to character cards in `renderCharacters`**

Grep for `renderCharacters`. Find the per-character card template literal. Append `${c._pending ? ' pending' : ''}` to the outer card's class attribute the same way.

- [ ] **Step 4: Add `.pending` to item rows in `renderItems`**

Grep for `renderItems`. Find the `<tr ...>` template per item. Since tables use `box-shadow` per the CSS above, still use the `pending` class:
```js
`<tr class="${it._pending ? 'pending' : ''}" data-item-id="${escapeAttr(it.Id)}">...`
```

- [ ] **Step 5: Add `.pending` to map cards in `renderMaps`**

Same treatment as characters — append `${m._pending ? ' pending' : ''}` to the map card's class.

- [ ] **Step 6: Add `.pending` to system rows in `renderSystems`**

Same treatment as items — conditional class on the `<tr>`.

- [ ] **Step 7: Add `.pending` to Gantt bars + milestone cards in `renderGantt` and `renderMilestones`**

In `renderGantt`, find the user-track bar template and append `${b._pending ? ' pending' : ''}` to the `.gbar` class. Do the same for milestone-row bars (the auto-derived bottom row) — `${m._pending ? ' pending' : ''}` on their `.gbar milestone` class.

In `renderMilestones`, find the card template and append `${m._pending ? ' pending' : ''}` to the `.ms` class.

- [ ] **Step 8: Commit**

```bash
git add app.js styles.css
git commit -m "Render: apply .pending class to in-flight rows + bars"
```

- [ ] **Step 9: Verify**

Open `index.html`. You won't see any pending outline yet because no call site stamps `_pending` (that happens once call sites are converted in later tasks, or if `pushRow` fires — but current call sites still `await pushRow; await fetchAll` which clears `_pending` before the UI re-renders). To test the CSS, open DevTools console and type:
```js
taskState[0]._pending = true; renderBoard();
```
The first task card should show a dashed outline + dimmed. Revert:
```js
delete taskState[0]._pending; renderBoard();
```

---

## Task 3: Retrofit Roadmap handlers to rely on `pushRow` alone

**Files:**
- Modify: `app.js` (the bar add/edit/delete handlers, milestone add/edit/delete handlers)

**Context:** The `roadmap-editable` branch added hand-rolled optimistic mutations directly in handlers — they push into state, render, then call `pushRow(...).then(fetchAll)`. With Task 1's refactor, `pushRow` now does the mutation itself. Remove the hand-rolled paths so there's one source of truth.

- [ ] **Step 1: Retrofit add-bar click delegation**

Grep for `gbar-add` click handler (inside the `#gantt` click delegation in `app.js`). The current shape looks like:

```js
// Optimistic: mutate state, render, open modal immediately. Server sync in background.
ganttBarsState.push(normalizeGanttBarRow(fields));
renderGantt();
openBarModal(newId);
pushRow('GanttBars', newId, fields).then(() => fetchAll());
```

Replace with (note: `pushRow` now does the state mutation itself; call it **once**, keep its Promise for the follow-up `fetchAll`):

```js
const p = pushRow('GanttBars', newId, fields);
renderGantt();
openBarModal(newId);
p.then(() => fetchAll());
```

- [ ] **Step 2: Retrofit bar modal Save**

Find `qs('[data-action="save"]', panel).addEventListener('click', () => {` inside `openBarModal`. Replace its body with:

```js
const name = qs('#bar-name', panel).value.trim();
const color = qs('#bar-color', panel).value;
const start = Number(qs('#bar-start', panel).value);
const end = Number(qs('#bar-end', panel).value);
if(end <= start){ alert('End must be after Start.'); return; }
closeModal();
const patch = { Name: name, Color: color, Start: start, End: end };
const p = pushRow('GanttBars', bar.BarId, patch);
renderGantt();
p.then(() => fetchAll());
```

(Notice: no more manual `ganttBarsState.findIndex` + `Object.assign` — pushRow does the patch.)

- [ ] **Step 3: Retrofit bar modal Delete**

Find `qs('[data-action="delete"]', panel).addEventListener('click', () => {` inside `openBarModal`. Replace with:

```js
if(!confirm('Delete this bar?')) return;
closeModal();
const p = pushRow('GanttBars', bar.BarId, { Hidden: true });
renderGantt();
p.then(() => fetchAll());
```

- [ ] **Step 4: Retrofit milestone modal Save**

Find the `save` handler in `openMilestoneModal`. Replace with:

```js
const quarter = qs('#ms-quarter', panel).value;
const name = qs('#ms-name', panel).value.trim();
const goal = qs('#ms-goal', panel).value;
closeModal();
const patch = { Quarter: quarter, Name: name, Goal: goal };
const p = pushRow('Milestones', m.MilestoneId, patch);
renderGantt();
renderMilestones();
p.then(() => fetchAll());
```

- [ ] **Step 5: Retrofit milestone modal Delete**

Find the `delete` handler in `openMilestoneModal`. Replace with:

```js
if(!confirm('Delete this milestone?')) return;
closeModal();
const p = pushRow('Milestones', m.MilestoneId, { Hidden: true });
renderGantt();
renderMilestones();
p.then(() => fetchAll());
```

- [ ] **Step 6: Retrofit `addMilestone`**

Replace its body with:

```js
const taken = new Set(
  milestonesState.filter(m => !m.Hidden).map(m => m.Quarter)
);
let quarter = 'Y1 Q1';
outer: for(let y = 1; y <= 3; y++) for(let q = 1; q <= 4; q++){
  const s = `Y${y} Q${q}`;
  if(!taken.has(s)){ quarter = s; break outer; }
}
const newId = genId('ms');
const fields = {
  MilestoneId: newId,
  Quarter: quarter,
  Name: 'New milestone',
  Goal: '',
  Hidden: false,
  SortOrder: 0,
};
const p = pushRow('Milestones', newId, fields);
renderGantt();
renderMilestones();
openMilestoneModal(newId);
p.then(() => fetchAll());
```

- [ ] **Step 7: Retrofit bar drag commit**

Grep for `onBarPointerUp`. Find the `await pushRow('GanttBars', barId, { Start: newStart, End: newEnd }); await fetchAll();` pair. Replace with:

```js
pushRow('GanttBars', barId, { Start: newStart, End: newEnd }).then(() => fetchAll());
```

(Note: the drag's DOM already shows the new position — the bar doesn't visually snap. No need for an immediate `renderGantt()`.)

- [ ] **Step 8: Commit**

```bash
git add app.js
git commit -m "Roadmap: retrofit handlers onto pushRow's own optimistic path"
```

- [ ] **Step 9: Verify**

Hard-refresh. Add a bar, edit a bar, delete a bar, drag a bar, add/edit/delete a milestone. All should feel **instant** (one frame) AND show the dashed pending outline briefly until the POST completes. No double-apply (only one copy of each new row). Reload: rows persist. No console errors.

---

## Task 4: Convert Task Board call sites

**Files:**
- Modify: `app.js` (task status dropdown, edit-task modal save/delete, column ＋ add-task, Team modal bulk-save)

**Context:** Strip `await` from the remaining Task Board handlers so they return control to the UI immediately.

- [ ] **Step 1: Convert status dropdown**

Grep for `pushRow('Tasks', id, { Status`. Existing shape is something like:
```js
pushRow('Tasks', id, { Status: v }).then(() => fetchAll());
```
**Already fire-and-forget.** If it uses `.then(fetchAll)`, replace with form B (no fetchAll at all — poll reconciles):
```js
pushRow('Tasks', id, { Status: v });
```
Rationale: status is a high-frequency interaction and doesn't need a full server round trip.

- [ ] **Step 2: Convert edit-task modal Save**

Grep for the Save handler inside `openEditModal` (task board edit modal). Its current tail looks like:
```js
closeModal();
await pushRow('Tasks', id, patch);
fetchAll();
```
Replace with:
```js
closeModal();
pushRow('Tasks', id, patch).then(() => fetchAll());
```

- [ ] **Step 3: Convert edit-task modal Delete**

Grep for the soft-delete call in `openEditModal` (likely `pushRow('Tasks', id, { Hidden: true })`). Currently:
```js
await pushRow('Tasks', id, { Hidden: true });
fetchAll();
```
Replace with:
```js
pushRow('Tasks', id, { Hidden: true }).then(() => fetchAll());
```

- [ ] **Step 4: Convert column ＋ add-task**

Grep for `col-add-btn` or the per-member "＋" handler that opens a new-task modal. Find where `pushRow('Tasks', ...)` is awaited and replace with `.then(fetchAll)`:
```js
pushRow('Tasks', id, fields).then(() => fetchAll());
```

- [ ] **Step 5: Convert Team modal bulk-save (sequential, no-fetchAll-per-row)**

Grep for `openTeamModal` → find the `save` handler. The current shape is a serial loop:

```js
for(const m of draft){
  ...
  if(changed){
    await pushRow('Team', m.MemberId, { Name, RoleKey, RoleLabel, Order, Active });
  }
}
fetchAll();
```

Replace with: fire all (non-awaited) `pushRow` calls sequentially and call `fetchAll` **once** at the end:

```js
for(const m of draft){
  const orig = teamState.find(x => x.MemberId === m.MemberId);
  const changed = !orig
    || orig.Name !== m.Name
    || orig.RoleKey !== m.RoleKey
    || orig.RoleLabel !== m.RoleLabel
    || orig.Order !== m.Order
    || orig.Active !== m.Active;
  if(changed){
    pushRow('Team', m.MemberId, {
      Name: m.Name, RoleKey: m.RoleKey, RoleLabel: m.RoleLabel, Order: m.Order, Active: m.Active,
    });
  }
}
setTimeout(() => fetchAll(), 100);
```

(The `setTimeout` gives the POSTs a moment to register on the server before the GET fires. Without it, `fetchAll` might race the writes and return stale data.)

- [ ] **Step 6: Convert Tracks modal bulk-save (same pattern)**

Grep for `openTracksModal` save handler. Apply the same transformation:

```js
for(const t of draft){
  if(t._delete){
    if(!t._isNew){
      pushRow('GanttTracks', t.TrackId, { Hidden: true });
    }
    continue;
  }
  const orig = ganttTracksState.find(x => x.TrackId === t.TrackId);
  const changed = !orig
    || orig.Name !== t.Name
    || orig.Role !== t.Role
    || orig.Order !== t.Order;
  if(changed){
    pushRow('GanttTracks', t.TrackId, {
      TrackId: t.TrackId, Name: t.Name, Role: t.Role, Order: t.Order,
    });
  }
}
setTimeout(() => fetchAll(), 100);
```

- [ ] **Step 7: Commit**

```bash
git add app.js
git commit -m "Task Board + Team/Tracks modals: fire-and-forget writes"
```

- [ ] **Step 8: Verify**

Hard-refresh. Confirm:
- Status dropdown change: color flips instantly, pending outline ~500ms, then clear.
- Task edit Save: modal closes, card updates instantly with pending outline.
- Task Delete: card disappears instantly.
- Column ＋: new card appears instantly.
- Team modal: close multiple rows' edits at once; modal closes instantly; multiple rows flicker pending outline on any Task Board cards that render team chips — that's fine, sync pill shows the queue.
- Tracks modal: same.

---

## Task 5: Convert Design Doc call sites

**Files:**
- Modify: `app.js` (character / item / map / system modals — Save, Delete, Add handlers)

**Context:** Same transformation as Task 4, applied to four entity types. Each has three handlers: Save from ⋯ modal, Delete from ⋯ modal, Add from section ＋ button.

- [ ] **Step 1: Convert character Save**

Grep for `pushRow('Characters'`. Find every `await pushRow('Characters', ..., patch)` inside the character edit modal's Save handler. Convert:
```js
closeModal();
await pushRow('Characters', id, { ...patch, AbilitiesJson: JSON.stringify(abilities) });
fetchAll();
```
to:
```js
closeModal();
pushRow('Characters', id, { ...patch, AbilitiesJson: JSON.stringify(abilities) }).then(() => fetchAll());
```

- [ ] **Step 2: Convert character Delete**

Find the character modal's Delete handler (sets `Hidden: true` on a character row). Convert:
```js
await pushRow('Characters', id, { Hidden: true });
fetchAll();
```
to:
```js
pushRow('Characters', id, { Hidden: true }).then(() => fetchAll());
```

- [ ] **Step 3: Convert character Add**

Find the `＋` button handler for the Characters section (grep for `mountSectionAddButtons` and inside look for the `characters` branch; or grep for `pushRow('Characters'` with a new ID). Convert `await pushRow; fetchAll` to `.then(fetchAll)`.

- [ ] **Step 4: Convert item Save / Delete / Add**

Grep for `pushRow('Items'`. Apply the same transformation to all three handlers (Save, Delete, Add). Each currently `await pushRow; fetchAll` → `.then(fetchAll)`.

- [ ] **Step 5: Convert map Save / Delete / Add**

Grep for `pushRow('Maps'`. Same transformation for all three handlers.

- [ ] **Step 6: Convert system Save / Delete / Add**

Grep for `pushRow('Systems'`. Same transformation for all three handlers.

- [ ] **Step 7: Commit**

```bash
git add app.js
git commit -m "Design Doc: fire-and-forget writes for characters / items / maps / systems"
```

- [ ] **Step 8: Verify**

Hard-refresh. For each of the four Design Doc sections:
- Click `⋯` on an existing row → edit something → Save → row updates instantly with pending outline.
- Click `⋯` on a row → Delete → row disappears instantly.
- Click `＋` on the section header → new row appears instantly with pending outline.

Total: 4 entities × 3 ops = 12 interactions. All should feel instant; sync pill briefly shows "Saving… (N)" then clears.

---

## Task 6: Update `CLAUDE.md` + merge to main

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a note to "Known Gotchas"**

Find the Known Gotchas section in `CLAUDE.md`. Append:

```markdown
- **Writes are fully optimistic.** Every `pushRow(...)` mutates local state synchronously and stamps `_pending: true` on the row; the POST fires in the background. Rows with `_pending` render with a dashed outline / reduced opacity (and tables use a left-side inset shadow). If the POST fails, `pushRow`'s existing `alert()` fires and the sync pill turns red; the row keeps showing "pending" until the POST settles, then the next 30-second poll reconciles the ghost change back to the server's truth. No rollback on error — the poll is the rollback.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Docs: CLAUDE.md notes optimistic write semantics"
```

- [ ] **Step 3: Push the branch and merge to main**

```bash
git push -u origin optimistic-ui
git checkout main
git pull
git merge optimistic-ui --no-ff -m "Merge branch 'optimistic-ui'

Writes are now optimistic across the entire app: pushRow patches state
before POSTing, stamps _pending, and clears the flag on resolve. Hot
call sites on Task Board / Design Doc / Roadmap converted from
await-await to fire-and-forget. Dashed outline + opacity indicate
in-flight rows."
git branch -d optimistic-ui
git push
```

- [ ] **Step 4: Post-merge smoke test on live site**

Wait ~60 seconds for GitHub Pages redeploy. Open https://aicgjchiu.github.io/zsp-planning-doc/. Hard-refresh. Run through one interaction per surface:
- Task Board: change a status dropdown.
- Design Doc: `⋯` on a character → save a small edit.
- Roadmap: drag a bar.
- Roadmap: add a milestone.

Each should feel instant; sync pill shows brief "Saving…" then "Synced Xs ago". Sheet has the updates stamped.

---

## Post-merge acceptance checklist (summary)

- [ ] Every user action on Task Board / Design Doc / Roadmap paints the UI in one frame.
- [ ] `.pending` outline appears during flight, disappears when POST resolves.
- [ ] Simulating offline: action paints + pending outline + alert + red sync pill; within 30s, ghost change reverts.
- [ ] Sheet rows are still stamped correctly (`UpdatedBy`, `UpdatedAt`).
- [ ] No duplicate rows on Roadmap add-bar / add-milestone (no double-apply).
- [ ] No console errors.
