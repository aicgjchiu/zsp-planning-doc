# Roadmap Editable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Roadmap tab's Gantt (tracks, bars) and Milestones strip editable via UI, live-synced through the existing Google Sheet backend.

**Architecture:** Three new sheet tabs (`GanttTracks`, `GanttBars`, `Milestones`), rendered into the existing CSS-grid Gantt. Milestones auto-derive a read-only bottom row on the Gantt. All writes go through the existing `handleUpsert` (key-column auto-detect). Bootstrap envelope becomes generic — `{ Action: "bootstrap", Tabs: { <TabName>: rows } }` — with one-release legacy-shape compatibility.

**Tech Stack:** Plain HTML/CSS/JS (no bundler, no framework), Google Apps Script backend, GitHub Pages hosting. No automated test framework exists; verification is **manual browser testing** against an acceptance checklist per task.

**Spec:** `docs/superpowers/specs/2026-04-21-roadmap-editable-design.md`

**Testing note:** Each task ends with a browser-based verification step. Run against the live deployed GitHub Pages site (not the Claude preview sandbox — cross-origin fetches to Apps Script are blocked there; see CLAUDE.md "Known Gotchas"). Workflow for each task: edit → commit → push → wait ~60s for Pages redeploy → hard-refresh (Ctrl+Shift+R) → verify → move on.

---

## Task 1: Apps Script backend — extend `doGet` + refactor `handleBootstrap`

**Files:**
- Modify: `apps-script.gs` (repo mirror)
- Manual: paste into Apps Script editor → Deploy → new version
- Manual: in the backing sheet, create three new tabs with headers (see spec schema)

**Context:** `handleUpsert` already auto-detects the primary-key column from the header row, so adding three tabs needs no upsert logic changes. Only `doGet` (to read them) and `handleBootstrap` (to seed them) need edits.

- [ ] **Step 1: Read current `apps-script.gs` to confirm structure**

Use the Read tool on `apps-script.gs`. Note the existing shape of `doGet` (which tabs it reads, response field names) and `handleBootstrap` (how it uses `LockService`).

- [ ] **Step 2: Extend `doGet` to include three new tab reads**

Locate the response object inside `doGet`. Add three reads in the same style as the existing tabs. Example shape (adapt keys to match existing camelCase convention in your file):

```js
// Inside doGet, add these to the response:
ganttTracks: readTab("GanttTracks"),
ganttBars:   readTab("GanttBars"),
milestones:  readTab("Milestones"),
```

If the file uses inline `getSheetByName(...).getDataRange()...` instead of a `readTab` helper, follow the existing pattern for Tasks/Team verbatim.

- [ ] **Step 3: Refactor `handleBootstrap` to generic `Tabs` envelope + legacy compat**

Replace the body of `handleBootstrap` with:

```js
function handleBootstrap(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // Legacy-shape compat (one release): if body has top-level Tasks/Team,
    // remap to the generic Tabs envelope.
    var tabs = body.Tabs;
    if (!tabs && (body.Tasks || body.Team)) {
      tabs = {};
      if (body.Tasks) tabs.Tasks = body.Tasks;
      if (body.Team)  tabs.Team  = body.Team;
    }
    if (!tabs) return jsonOut({ ok: false, error: "missing Tabs" });

    var now = new Date().toISOString();
    var updatedBy = body.UpdatedBy || "bootstrap";

    Object.keys(tabs).forEach(function (tabName) {
      var sheet = SpreadsheetApp.getActive().getSheetByName(tabName);
      if (!sheet) return;
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) return; // already has data below header — skip

      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var rows = tabs[tabName] || [];
      if (!rows.length) return;

      var values = rows.map(function (row) {
        return headers.map(function (h) {
          if (h === "CreatedAt" || h === "UpdatedAt") return now;
          if (h === "UpdatedBy") return updatedBy;
          return row[h] != null ? row[h] : "";
        });
      });
      sheet.getRange(2, 1, values.length, headers.length).setValues(values);
    });

    return jsonOut({ ok: true, bootstrapped: true });
  } finally {
    lock.releaseLock();
  }
}
```

(Use whatever JSON-response helper already exists — `jsonOut` here is a placeholder for the existing pattern in your file.)

- [ ] **Step 4: Commit the `apps-script.gs` mirror change**

```bash
git add apps-script.gs
git commit -m "Apps Script: add Roadmap tabs to doGet + generic bootstrap envelope"
```

- [ ] **Step 5: Manual — create the three sheet tabs with headers**

Open the backing sheet (URL in CLAUDE.md). For each of the three new tabs, create a new sheet tab and paste the headers into row 1 (in this exact order, left to right):

- `GanttTracks`: `TrackId | Name | Role | Order | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`
- `GanttBars`: `BarId | TrackId | Name | Start | End | Color | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`
- `Milestones`: `MilestoneId | Quarter | Name | Goal | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`

- [ ] **Step 6: Manual — deploy new Apps Script version**

Open the backing sheet → Extensions → Apps Script. Paste the updated `apps-script.gs` contents over the existing script. Save. Deploy → Manage deployments → pencil icon → New version → Deploy. The web-app URL stays the same.

- [ ] **Step 7: Verify backend**

In a browser, hit the `/exec` URL (the `SHEET_ENDPOINT` from `app.js`) directly (GET). Response should be JSON and include `ganttTracks: []`, `ganttBars: []`, `milestones: []` fields alongside existing `tasks`, `team`, etc. All three are empty arrays (tabs exist but have only headers).

---

## Task 2: Client — extend `fetchAll` to store the three new state arrays

**Files:**
- Modify: `app.js` (wherever `fetchAll` and module-level state variables live)

- [ ] **Step 1: Find existing state declarations in `app.js`**

Grep for `tasksState`, `teamState`, `charactersState` to locate where module-level state arrays are declared. Add three siblings:

```js
let ganttTracksState = [];
let ganttBarsState = [];
let milestonesState = [];
```

- [ ] **Step 2: Update `fetchAll` to populate the new state from the response**

Find `fetchAll` (or whichever function reads the `/exec` GET response). After the existing `tasksState = data.tasks || []` assignments, add:

```js
ganttTracksState = data.ganttTracks || [];
ganttBarsState   = data.ganttBars   || [];
milestonesState  = data.milestones  || [];
```

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "Client: store Roadmap sheet data in module state"
```

- [ ] **Step 4: Verify**

Push → wait for Pages → hard-refresh → open DevTools console. Type `ganttTracksState` → should log `[]`. Type `milestonesState` → `[]`. Nothing should have broken in the UI (no new rendering yet).

---

## Task 3: Client — re-add `bootstrapIfEmpty` with generic envelope + seed builder

**Files:**
- Modify: `app.js`
- Reference: `data.js` (still contains `window.GANTT` and `window.MILESTONES`)

**Context:** `window.GANTT` is an array of lanes, each with `name`, `role`, and `bars: [{ name, start, end, color }]`. `window.MILESTONES` is an array of `{ quarter, name, goal }`. We split `GANTT` into one `GanttTracks` row per lane + one `GanttBars` row per bar (minting `TrackId` once per lane so bars can reference it).

- [ ] **Step 1: Add `bootstrapIfEmpty` function in `app.js`**

Place near `fetchAll`. It runs once after the initial fetch if all three new tabs are empty.

```js
async function bootstrapIfEmpty() {
  if (ganttTracksState.length || ganttBarsState.length || milestonesState.length) return;
  if (!window.GANTT || !window.MILESTONES) return;

  const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tracks = [];
  const bars = [];

  window.GANTT.forEach((lane, laneIdx) => {
    // Skip the legacy "Milestones" lane — that data now lives in the Milestones tab.
    if ((lane.role || "").toLowerCase() === "milestone") return;
    const trackId = `track-${stamp()}`;
    tracks.push({
      TrackId: trackId,
      Name: lane.name,
      Role: lane.role,
      Order: laneIdx,
      Hidden: "",
      SortOrder: laneIdx,
    });
    (lane.bars || []).forEach((b, bi) => {
      bars.push({
        BarId: `bar-${stamp()}`,
        TrackId: trackId,
        Name: b.name,
        Start: b.start,
        End: b.end,
        Color: b.color || lane.role,
        Hidden: "",
        SortOrder: bi,
      });
    });
  });

  const milestones = window.MILESTONES.map((m, i) => ({
    MilestoneId: `ms-${stamp()}`,
    Quarter: m.quarter,
    Name: m.name,
    Goal: m.goal || "",
    Hidden: "",
    SortOrder: i,
  }));

  await fetch(SHEET_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      Action: "bootstrap",
      UpdatedBy: userName || "bootstrap",
      Tabs: { GanttTracks: tracks, GanttBars: bars, Milestones: milestones },
    }),
  });
  await fetchAll();
}
```

- [ ] **Step 2: Call `bootstrapIfEmpty` from `fetchAll` after state assignment**

At the bottom of `fetchAll` (after state populated and UI rendered), add:

```js
await bootstrapIfEmpty();
```

Guard against re-entry: `bootstrapIfEmpty` is already idempotent (early-returns when any state non-empty), so calling it every fetch is fine but only does work once.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "Client: bootstrap Roadmap tabs from window.GANTT + window.MILESTONES"
```

- [ ] **Step 4: Verify**

Push → Pages → hard-refresh. In the backing sheet, confirm `GanttTracks` has ~5 rows (one per non-milestone lane in `window.GANTT`), `GanttBars` has one row per bar, `Milestones` has one row per entry in `window.MILESTONES`. `CreatedAt` / `UpdatedAt` / `UpdatedBy` populated. Reload the page — no duplicate rows appear (idempotence).

---

## Task 4: Client — render Gantt from state (tracks + bars + auto-derived milestone row)

**Files:**
- Modify: `app.js` (the `renderRoadmap` or equivalent function)

**Context:** Replace the existing loop over `window.GANTT` with loops over `ganttTracksState` + `ganttBarsState`. Append a synthesized milestone row at the bottom.

- [ ] **Step 1: Find current Gantt render logic + capture the grid-column offset**

Grep for `GANTT` in `app.js` to locate the existing render. Note how lanes and bars translate into DOM (likely `.gantt-row` / `.gbar` nodes with `grid-column` inline styles). **Record the exact grid-column formula used** (e.g. `${start+1}` vs `${start+2}`) — this depends on whether the label cell is inside the CSS grid or outside. The rewrite below uses `${start + OFFSET}` as a placeholder — replace `OFFSET` with whatever the existing render uses (and in the auto-derived milestone row section too).

- [ ] **Step 2: Rewrite Gantt render to pull from state**

Replace the render with something like:

```js
function renderGantt() {
  const container = document.querySelector(".gantt-grid"); // use existing selector
  container.innerHTML = "";

  const tracks = ganttTracksState
    .filter(t => t.Hidden !== true && String(t.Hidden).toUpperCase() !== "TRUE")
    .slice()
    .sort((a, b) => (a.Order || 0) - (b.Order || 0));

  tracks.forEach(track => {
    const row = document.createElement("div");
    row.className = "gantt-row";
    row.dataset.trackId = track.TrackId;

    const label = document.createElement("div");
    label.className = "gantt-label";
    label.textContent = track.Name;
    row.appendChild(label);

    const bars = ganttBarsState.filter(b =>
      b.TrackId === track.TrackId &&
      b.Hidden !== true && String(b.Hidden).toUpperCase() !== "TRUE"
    );
    bars.forEach(bar => {
      const el = document.createElement("div");
      el.className = `gbar ${bar.Color || "code"}`;
      el.dataset.barId = bar.BarId;
      el.style.gridColumn = `${Number(bar.Start) + OFFSET} / span ${Number(bar.End) - Number(bar.Start)}`;
      // Replace OFFSET with the +1 or +2 you captured in Step 1 from the existing render.
      el.textContent = bar.Name;
      row.appendChild(el);
    });

    container.appendChild(row);
  });

  // Auto-derived milestone row
  const msRow = document.createElement("div");
  msRow.className = "gantt-row gantt-milestone-row";
  const msLabel = document.createElement("div");
  msLabel.className = "gantt-label";
  msLabel.textContent = "Milestones";
  msRow.appendChild(msLabel);

  milestonesState
    .filter(m => m.Hidden !== true && String(m.Hidden).toUpperCase() !== "TRUE")
    .forEach(m => {
      const qIdx = parseQuarter(m.Quarter);
      if (qIdx < 0 || qIdx > 11) {
        console.warn(`Invalid milestone quarter: ${m.Quarter}`);
        return;
      }
      const el = document.createElement("div");
      el.className = "gbar milestone";
      el.style.gridColumn = `${qIdx + OFFSET} / span 1`;
      el.textContent = m.Name;
      msRow.appendChild(el);
    });
  container.appendChild(msRow);
}

function parseQuarter(s) {
  // "Y1 Q2" -> 1
  const m = /^Y(\d)\s*Q(\d)$/.exec(String(s || "").trim());
  if (!m) return -1;
  return (Number(m[1]) - 1) * 4 + (Number(m[2]) - 1);
}
```

Confirm the container selector (`.gantt-grid`) matches what's already in `index.html`. If the existing markup uses a different class, update both the selector and the render to match.

- [ ] **Step 3: Call `renderGantt()` from `renderAll()` (or equivalent)**

Make sure it's invoked after every `fetchAll`.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "Client: render Gantt from ganttTracksState + ganttBarsState"
```

- [ ] **Step 5: Verify**

Push → Pages → hard-refresh. Roadmap tab should render **identically** to before the change — same lanes, same bars in the same positions, same colors. Bottom row now shows "Milestones" with one bar per active milestone at the correct quarter. Compare side-by-side with the previous deployed version if unsure.

---

## Task 5: Client — render Milestones strip from state

**Files:**
- Modify: `index.html` (replace static Milestones markup with a container element)
- Modify: `app.js` (add `renderMilestones` function)

- [ ] **Step 1: Replace static Milestones HTML with a container**

Find the Milestones strip in `index.html` (below the Gantt in the Roadmap tab). Replace the hard-coded cards with:

```html
<div class="milestones-strip" id="milestones-strip"></div>
```

- [ ] **Step 2: Add `renderMilestones` in `app.js`**

```js
function renderMilestones() {
  const strip = document.getElementById("milestones-strip");
  if (!strip) return;
  strip.innerHTML = "";

  const active = milestonesState
    .filter(m => m.Hidden !== true && String(m.Hidden).toUpperCase() !== "TRUE")
    .slice()
    .sort((a, b) => parseQuarter(a.Quarter) - parseQuarter(b.Quarter));

  active.forEach(m => {
    const card = document.createElement("div");
    card.className = "milestone-card";
    card.dataset.milestoneId = m.MilestoneId;
    card.innerHTML = `
      <div class="milestone-quarter">${escapeHtml(m.Quarter)}</div>
      <div class="milestone-name">${escapeHtml(m.Name)}</div>
      <div class="milestone-goal">${escapeHtml(m.Goal || "")}</div>
      <button class="milestone-more" data-milestone-id="${m.MilestoneId}">⋯</button>
    `;
    strip.appendChild(card);
  });

  // "+" button at end of strip
  const add = document.createElement("button");
  add.className = "milestone-add";
  add.textContent = "＋";
  add.id = "milestone-add-btn";
  strip.appendChild(add);
}
```

Confirm `escapeHtml` already exists in `app.js`; if it goes by another name, use that.

- [ ] **Step 3: Call `renderMilestones()` from `renderAll()`**

- [ ] **Step 4: Commit**

```bash
git add app.js index.html
git commit -m "Client: render Milestones strip from milestonesState"
```

- [ ] **Step 5: Verify**

Push → Pages → hard-refresh. Milestones strip displays all milestones sorted by quarter. `⋯` and `＋` buttons appear but are non-functional (wired in Task 10/11). Visual matches pre-change (or close — minor markup differences OK).

---

## Task 6: Client — Tracks modal ("Tracks" header button)

**Files:**
- Modify: `index.html` (add header button in Roadmap tab)
- Modify: `app.js` (modal open/close, CRUD handlers)
- Modify: `styles.css` (if new modal styling needed — likely can reuse existing modal class)

- [ ] **Step 1: Add "Tracks" button to Roadmap tab header**

In `index.html`, find the Roadmap tab's header region. Add:

```html
<button class="header-btn" id="tracks-btn" disabled>Tracks</button>
```

The `disabled` attribute is toggled elsewhere when `userName` is set (see existing pattern for the Team button).

- [ ] **Step 2: Build Tracks modal**

Add a new modal markup in `index.html` (following the existing modal pattern — Team modal is the closest analog):

```html
<div class="modal-backdrop hidden" id="tracks-modal">
  <div class="modal">
    <div class="modal-header">
      <h2>Roadmap Tracks</h2>
      <button class="modal-close" data-close="tracks-modal">×</button>
    </div>
    <div class="modal-body">
      <table class="tracks-table" id="tracks-table"></table>
      <button class="row-add-btn" id="track-add-btn">+ Add track</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Wire open/close + render**

In `app.js`:

```js
document.getElementById("tracks-btn").addEventListener("click", () => {
  renderTracksTable();
  document.getElementById("tracks-modal").classList.remove("hidden");
});
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener("click", () => {
    document.getElementById(btn.dataset.close).classList.add("hidden");
  });
});

function renderTracksTable() {
  const table = document.getElementById("tracks-table");
  const tracks = ganttTracksState
    .filter(t => String(t.Hidden).toUpperCase() !== "TRUE")
    .slice().sort((a, b) => (a.Order || 0) - (b.Order || 0));
  table.innerHTML = `
    <thead><tr><th>Name</th><th>Role</th><th>Order</th><th></th></tr></thead>
    <tbody>
      ${tracks.map(t => `
        <tr data-track-id="${t.TrackId}">
          <td><input class="track-name" value="${escapeHtml(t.Name)}"></td>
          <td>
            <select class="track-role">
              ${["portal","code","char","env","vfx"].map(r =>
                `<option value="${r}" ${t.Role === r ? "selected" : ""}>${r}</option>`
              ).join("")}
            </select>
          </td>
          <td>
            <button class="track-up">↑</button>
            <button class="track-down">↓</button>
          </td>
          <td><button class="track-delete">Delete</button></td>
        </tr>
      `).join("")}
    </tbody>
  `;
}
```

- [ ] **Step 4: Wire CRUD handlers (event delegation on the table)**

```js
document.getElementById("tracks-table").addEventListener("change", async (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  const trackId = tr.dataset.trackId;
  if (e.target.classList.contains("track-name")) {
    await pushRow("GanttTracks", trackId, { Name: e.target.value });
    await fetchAll();
  } else if (e.target.classList.contains("track-role")) {
    await pushRow("GanttTracks", trackId, { Role: e.target.value });
    await fetchAll();
  }
});

document.getElementById("tracks-table").addEventListener("click", async (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  const trackId = tr.dataset.trackId;
  const track = ganttTracksState.find(t => t.TrackId === trackId);
  if (!track) return;

  if (e.target.classList.contains("track-delete")) {
    if (!confirm(`Delete track "${track.Name}"? Its bars will be hidden.`)) return;
    await pushRow("GanttTracks", trackId, { Hidden: true });
    await fetchAll();
    renderTracksTable();
  } else if (e.target.classList.contains("track-up") || e.target.classList.contains("track-down")) {
    const dir = e.target.classList.contains("track-up") ? -1 : 1;
    const sorted = ganttTracksState
      .filter(t => String(t.Hidden).toUpperCase() !== "TRUE")
      .slice().sort((a, b) => (a.Order || 0) - (b.Order || 0));
    const idx = sorted.findIndex(t => t.TrackId === trackId);
    const swap = sorted[idx + dir];
    if (!swap) return;
    await Promise.all([
      pushRow("GanttTracks", trackId, { Order: swap.Order }),
      pushRow("GanttTracks", swap.TrackId, { Order: track.Order }),
    ]);
    await fetchAll();
    renderTracksTable();
  }
});

document.getElementById("track-add-btn").addEventListener("click", async () => {
  const maxOrder = ganttTracksState.reduce((m, t) => Math.max(m, t.Order || 0), -1);
  const newId = `track-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await pushRow("GanttTracks", newId, {
    TrackId: newId, Name: "New track", Role: "code", Order: maxOrder + 1,
  });
  await fetchAll();
  renderTracksTable();
});
```

Confirm `pushRow(tabName, key, fields)` exists in `app.js`; it's the helper already used by Tasks/Design Doc. If it has a different signature, adapt calls.

- [ ] **Step 5: Commit**

```bash
git add app.js index.html
git commit -m "Client: Tracks modal (rename/role/reorder/delete/add)"
```

- [ ] **Step 6: Verify**

Push → Pages → hard-refresh → enter identity. Click Tracks button → modal opens. Rename a track → blur field → reload modal → new name persists. Swap two tracks with ↑/↓ → Gantt rows reorder on close. Add a track → new empty row appears and renders in Gantt (empty, since no bars yet). Delete a track → confirm → track disappears from Gantt; its bars also filtered. Reopen modal and confirm state matches sheet.

---

## Task 7: Client — Bar edit modal (`⋯` button per bar)

**Files:**
- Modify: `app.js` (add `⋯` button in `renderGantt`, modal markup/handlers)
- Modify: `index.html` (modal markup)

- [ ] **Step 1: Add `⋯` button to each user bar in `renderGantt`**

Inside the bars loop from Task 4, after setting `el.textContent = bar.Name;` add:

```js
const more = document.createElement("button");
more.className = "bar-more";
more.dataset.barId = bar.BarId;
more.textContent = "⋯";
el.appendChild(more);
```

Do NOT add this to bars in the milestone row (Task 4's milestone-row loop stays as-is).

- [ ] **Step 2: Add Bar modal markup in `index.html`**

```html
<div class="modal-backdrop hidden" id="bar-modal">
  <div class="modal">
    <div class="modal-header">
      <h2>Edit bar</h2>
      <button class="modal-close" data-close="bar-modal">×</button>
    </div>
    <div class="modal-body">
      <label>Name <input id="bar-name"></label>
      <label>Color
        <select id="bar-color">
          <option value="portal">portal</option>
          <option value="code">code</option>
          <option value="char">char</option>
          <option value="env">env</option>
          <option value="vfx">vfx</option>
        </select>
      </label>
      <label>Start <select id="bar-start"></select></label>
      <label>End <select id="bar-end"></select></label>
      <div class="modal-actions">
        <button id="bar-delete" class="danger">Delete</button>
        <button id="bar-save" class="primary">Save</button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Wire modal open + populate**

```js
function populateQuarterSelect(sel, from, to) {
  sel.innerHTML = "";
  for (let i = from; i <= to; i++) {
    const y = Math.floor(i / 4) + 1;
    const q = (i % 4) + 1;
    const label = `Y${y}Q${q}`;
    sel.innerHTML += `<option value="${i}">${label}</option>`;
  }
}

document.querySelector(".gantt-grid").addEventListener("click", (e) => {
  if (!e.target.classList.contains("bar-more")) return;
  if (!userName) return;
  const barId = e.target.dataset.barId;
  const bar = ganttBarsState.find(b => b.BarId === barId);
  if (!bar) return;

  document.getElementById("bar-name").value = bar.Name;
  document.getElementById("bar-color").value = bar.Color;
  populateQuarterSelect(document.getElementById("bar-start"), 0, 11);
  populateQuarterSelect(document.getElementById("bar-end"), 1, 12);
  document.getElementById("bar-start").value = bar.Start;
  document.getElementById("bar-end").value = bar.End;
  document.getElementById("bar-modal").dataset.barId = barId;
  document.getElementById("bar-modal").classList.remove("hidden");
});
```

- [ ] **Step 4: Wire Save / Delete**

```js
document.getElementById("bar-save").addEventListener("click", async () => {
  const modal = document.getElementById("bar-modal");
  const barId = modal.dataset.barId;
  const start = Number(document.getElementById("bar-start").value);
  const end = Number(document.getElementById("bar-end").value);
  if (end <= start) { alert("End must be after Start"); return; }
  await pushRow("GanttBars", barId, {
    Name: document.getElementById("bar-name").value,
    Color: document.getElementById("bar-color").value,
    Start: start,
    End: end,
  });
  modal.classList.add("hidden");
  await fetchAll();
});

document.getElementById("bar-delete").addEventListener("click", async () => {
  const modal = document.getElementById("bar-modal");
  const barId = modal.dataset.barId;
  if (!confirm("Delete this bar?")) return;
  await pushRow("GanttBars", barId, { Hidden: true });
  modal.classList.add("hidden");
  await fetchAll();
});
```

- [ ] **Step 5: Commit**

```bash
git add app.js index.html
git commit -m "Client: bar edit modal (name/color/quarters/delete)"
```

- [ ] **Step 6: Verify**

Push → Pages → hard-refresh → set identity. Click `⋯` on any user-track bar → modal opens populated. Change name → Save → bar name updates in Gantt. Change color → Save → bar class updates. Change Start to a higher value than End → alert. Delete a bar → confirm → bar disappears. Click `⋯` on milestone-row bars → no response (no button rendered there).

---

## Task 8: Client — bar drag (move + resize)

**Files:**
- Modify: `app.js` (attach pointer handlers in `renderGantt`)
- Modify: `styles.css` (cursor styles)

- [ ] **Step 1: Attach pointerdown in renderGantt for user bars**

Inside the user-track bars loop (not milestone row), add after creating `el`:

```js
el.addEventListener("pointerdown", onBarPointerDown);
```

- [ ] **Step 2: Implement drag handlers**

```js
const COLUMN_PX = 120;
let dragState = null;

function onBarPointerDown(e) {
  if (!userName) return;
  if (e.target.classList.contains("bar-more")) return; // let ⋯ click through
  const el = e.currentTarget;
  const barId = el.dataset.barId;
  const bar = ganttBarsState.find(b => b.BarId === barId);
  if (!bar) return;

  const rect = el.getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  let zone;
  if (offsetX < 8) zone = "start";
  else if (offsetX > rect.width - 8) zone = "end";
  else zone = "move";

  dragState = {
    barId, zone, el,
    origStart: Number(bar.Start),
    origEnd: Number(bar.End),
    startX: e.clientX,
  };
  el.setPointerCapture(e.pointerId);
  el.addEventListener("pointermove", onBarPointerMove);
  el.addEventListener("pointerup", onBarPointerUp);
  el.addEventListener("pointercancel", onBarPointerCancel);
  e.preventDefault();
}

function onBarPointerMove(e) {
  if (!dragState) return;
  const delta = Math.round((e.clientX - dragState.startX) / COLUMN_PX);
  let s = dragState.origStart, en = dragState.origEnd;
  if (dragState.zone === "move") { s += delta; en += delta; }
  else if (dragState.zone === "start") { s += delta; }
  else if (dragState.zone === "end") { en += delta; }
  // Clamps
  if (s < 0) { if (dragState.zone === "move") en += -s; s = 0; }
  if (en > 12) { if (dragState.zone === "move") s -= en - 12; en = 12; }
  if (en - s < 1) {
    if (dragState.zone === "start") s = en - 1;
    else if (dragState.zone === "end") en = s + 1;
  }
  dragState.el.style.gridColumn = `${s + OFFSET} / span ${en - s}`;
  dragState.newStart = s;
  dragState.newEnd = en;
}

async function onBarPointerUp(e) {
  if (!dragState) return;
  const { barId, el, origStart, origEnd, newStart, newEnd } = dragState;
  cleanupDrag(e);
  if (newStart == null || (newStart === origStart && newEnd === origEnd)) return;
  try {
    await pushRow("GanttBars", barId, { Start: newStart, End: newEnd });
    await fetchAll();
  } catch (err) {
    console.error(err);
    el.style.gridColumn = `${origStart + OFFSET} / span ${origEnd - origStart}`;
  }
}

function onBarPointerCancel(e) {
  if (!dragState) return;
  const { el, origStart, origEnd } = dragState;
  el.style.gridColumn = `${origStart + OFFSET} / span ${origEnd - origStart}`;
  cleanupDrag(e);
}

function cleanupDrag(e) {
  if (!dragState) return;
  const { el } = dragState;
  el.removeEventListener("pointermove", onBarPointerMove);
  el.removeEventListener("pointerup", onBarPointerUp);
  el.removeEventListener("pointercancel", onBarPointerCancel);
  try { el.releasePointerCapture(e.pointerId); } catch {}
  dragState = null;
}
```

- [ ] **Step 3: Add cursor styles in `styles.css`**

```css
.gbar { cursor: grab; }
.gbar:active { cursor: grabbing; }
.gantt-milestone-row .gbar { cursor: default; }
```

(Fine-grained resize cursors for the 8px edge zones are optional; browsers handle hover hints when hitting the edge with `user-select: none` during drag; if desired, compute cursor in a `pointermove` handler that's always attached, but v1 can skip.)

- [ ] **Step 4: Commit**

```bash
git add app.js styles.css
git commit -m "Client: drag Gantt bars to move/resize (optimistic, identity-gated)"
```

- [ ] **Step 5: Verify**

Push → Pages → hard-refresh → set identity. Grab the middle of a user-track bar and drag right 2 columns → bar moves, then persists on release. Grab the left 8px edge and drag right → left side shrinks (Start increases); right stays put. Grab the right 8px edge and drag left → End decreases. Try to drag a bar past column 0 → clamps. Try to drag past column 12 → clamps. Try to shrink a bar to zero width → clamps at 1. Reload page → dragged positions persist. Milestone-row bars → no drag response.

---

## Task 9: Client — Bar add (`＋` at end of each user track row)

**Files:**
- Modify: `app.js` (add `＋` button in `renderGantt`; click handler)

- [ ] **Step 1: Append `＋` button at end of each user track row in `renderGantt`**

Inside the track loop (after appending all bars for the track), before `container.appendChild(row)`:

```js
const addBtn = document.createElement("button");
addBtn.className = "bar-add";
addBtn.dataset.trackId = track.TrackId;
addBtn.textContent = "＋";
row.appendChild(addBtn);
```

Do NOT add this to the milestone row.

- [ ] **Step 2: Wire click handler**

Add after existing delegated click on `.gantt-grid`:

```js
document.querySelector(".gantt-grid").addEventListener("click", async (e) => {
  if (!e.target.classList.contains("bar-add")) return;
  if (!userName) return;
  const trackId = e.target.dataset.trackId;
  const track = ganttTracksState.find(t => t.TrackId === trackId);
  if (!track) return;
  const newId = `bar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await pushRow("GanttBars", newId, {
    BarId: newId,
    TrackId: trackId,
    Name: "New bar",
    Start: 0,
    End: 1,
    Color: track.Role || "code",
  });
  await fetchAll();
});
```

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "Client: add-bar (+) button per Gantt track row"
```

- [ ] **Step 4: Verify**

Push → Pages → hard-refresh → set identity. Click `＋` at end of any user track → new "New bar" appears at Y1Q1, one quarter wide, colored by track role. Drag it into position. Open its `⋯` → rename.

---

## Task 10: Client — Milestone edit modal (`⋯` on each card)

**Files:**
- Modify: `index.html` (modal markup)
- Modify: `app.js` (modal handlers)

- [ ] **Step 1: Add Milestone modal markup in `index.html`**

```html
<div class="modal-backdrop hidden" id="milestone-modal">
  <div class="modal">
    <div class="modal-header">
      <h2>Edit milestone</h2>
      <button class="modal-close" data-close="milestone-modal">×</button>
    </div>
    <div class="modal-body">
      <label>Quarter <select id="ms-quarter"></select></label>
      <label>Name <input id="ms-name"></label>
      <label>Goal <textarea id="ms-goal" rows="4"></textarea></label>
      <div class="modal-actions">
        <button id="ms-delete" class="danger">Delete</button>
        <button id="ms-save" class="primary">Save</button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Populate quarter select + wire open**

```js
function populateMsQuarterSelect(sel) {
  sel.innerHTML = "";
  for (let y = 1; y <= 3; y++) for (let q = 1; q <= 4; q++) {
    sel.innerHTML += `<option value="Y${y} Q${q}">Y${y} Q${q}</option>`;
  }
}

document.getElementById("milestones-strip").addEventListener("click", (e) => {
  if (!e.target.classList.contains("milestone-more")) return;
  if (!userName) return;
  const id = e.target.dataset.milestoneId;
  const m = milestonesState.find(x => x.MilestoneId === id);
  if (!m) return;
  populateMsQuarterSelect(document.getElementById("ms-quarter"));
  document.getElementById("ms-quarter").value = m.Quarter;
  document.getElementById("ms-name").value = m.Name;
  document.getElementById("ms-goal").value = m.Goal || "";
  const modal = document.getElementById("milestone-modal");
  modal.dataset.milestoneId = id;
  modal.classList.remove("hidden");
});
```

- [ ] **Step 3: Wire Save / Delete**

```js
document.getElementById("ms-save").addEventListener("click", async () => {
  const modal = document.getElementById("milestone-modal");
  const id = modal.dataset.milestoneId;
  await pushRow("Milestones", id, {
    Quarter: document.getElementById("ms-quarter").value,
    Name: document.getElementById("ms-name").value,
    Goal: document.getElementById("ms-goal").value,
  });
  modal.classList.add("hidden");
  await fetchAll();
});

document.getElementById("ms-delete").addEventListener("click", async () => {
  const modal = document.getElementById("milestone-modal");
  const id = modal.dataset.milestoneId;
  if (!confirm("Delete this milestone?")) return;
  await pushRow("Milestones", id, { Hidden: true });
  modal.classList.add("hidden");
  await fetchAll();
});
```

- [ ] **Step 4: Commit**

```bash
git add app.js index.html
git commit -m "Client: milestone edit modal (quarter/name/goal/delete)"
```

- [ ] **Step 5: Verify**

Push → Pages → hard-refresh → set identity. Click `⋯` on a milestone card → modal opens. Change quarter → Save → card reorders in strip; auto-derived Gantt bar moves to new column. Change name → both card and Gantt bar update. Delete → confirm → removed from strip and Gantt row.

---

## Task 11: Client — Milestone add (`＋` at end of strip)

**Files:**
- Modify: `app.js` (add handler for the `#milestone-add-btn` already rendered in Task 5)

- [ ] **Step 1: Wire click handler**

```js
document.getElementById("milestones-strip").addEventListener("click", async (e) => {
  if (e.target.id !== "milestone-add-btn") return;
  if (!userName) return;

  const taken = new Set(
    milestonesState
      .filter(m => String(m.Hidden).toUpperCase() !== "TRUE")
      .map(m => m.Quarter)
  );
  let quarter = "Y1 Q1";
  outer: for (let y = 1; y <= 3; y++) for (let q = 1; q <= 4; q++) {
    const s = `Y${y} Q${q}`;
    if (!taken.has(s)) { quarter = s; break outer; }
  }

  const newId = `ms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await pushRow("Milestones", newId, {
    MilestoneId: newId, Quarter: quarter, Name: "New milestone", Goal: "",
  });
  await fetchAll();
});
```

(The `#milestones-strip` already has a click listener from Task 10; extend it or add a second listener — either works.)

- [ ] **Step 2: Commit**

```bash
git add app.js
git commit -m "Client: add-milestone (+) button at end of strip"
```

- [ ] **Step 3: Verify**

Push → Pages → hard-refresh → set identity. Click `＋` at end of strip → new "New milestone" card appears in first unused quarter; also appears as a bar in the Gantt's milestone row. Open `⋯` → rename → persists. Fill all 12 quarters → click `＋` → new milestone defaults to Y1 Q1 (overlapping).

---

## Task 12: Client — Identity gating for all new affordances

**Files:**
- Modify: `app.js` (extend the existing identity-gate helper or toggle `disabled` on new buttons)

**Context:** The existing code has a pattern for toggling add/edit buttons' `disabled` state based on `userName`. Find it (grep for `disabled` near places that mention `userName`) and extend.

- [ ] **Step 1: Find the identity-gate function**

Grep `app.js` for `userName` and `disabled`. Likely a function like `updateIdentityGatedUI()` or inline code in the identity-set handler.

- [ ] **Step 2: Extend to cover new affordances**

Add to the disabled-state toggle list:

```js
// Buttons that require identity:
document.getElementById("tracks-btn").disabled = !userName;
document.querySelectorAll(".bar-add, .bar-more, .milestone-more, #milestone-add-btn")
  .forEach(b => b.disabled = !userName);
```

Because these buttons are re-rendered on every `fetchAll`, call this function at the end of `renderAll()` (or wherever the existing identity-gate runs post-render).

Note: the drag handler already short-circuits on `!userName`, so no extra work there.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "Client: identity-gate Roadmap editing affordances"
```

- [ ] **Step 4: Verify**

Open DevTools → `localStorage.removeItem('zsp_user_name')` → reload. Dismiss the identity prompt (cancel / Esc). Tracks button, all `⋯`, all `＋`, Milestones `⋯`/`＋` should all appear disabled (greyed out, no click). Try to drag a bar → no movement. Set identity via the UI → all affordances re-enable without reload.

---

## Task 13: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Extend the "Tabs" list in the Task Board section**

Find the sheet tabs bullet list in CLAUDE.md ("**Tabs:**"). Add three entries:

```markdown
  - **`GanttTracks`** headers: `TrackId | Name | Role | Order | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`
  - **`GanttBars`** headers: `BarId | TrackId | Name | Start | End | Color | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`  — `Start`/`End` are 0-based quarter indices (0 = Y1Q1, 12 = end of Y3Q4), `End` exclusive
  - **`Milestones`** headers: `MilestoneId | Quarter | Name | Goal | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`  — `Quarter` is the "Y1 Q2"-style string, client parses to an index
```

- [ ] **Step 2: Update "When Editing" section**

Find the "**Shift a Gantt bar:**" bullet. Replace with:

```markdown
- **Change a Gantt track or bar:** edit from the Roadmap tab UI. "Tracks" button (Roadmap header) opens a modal for rename/reorder/delete/add. `⋯` on a bar opens its edit modal; drag bars to move or resize; `＋` at end of each track row adds a new bar. The sheet is the source of truth.
- **Change a milestone:** edit from the Roadmap tab UI. `⋯` on a milestone card opens its modal; `＋` at end of the Milestones strip adds one.
```

- [ ] **Step 3: Note the follow-up cleanup under "Known Gotchas" or add a new "Pending cleanup" note**

```markdown
- **`window.GANTT` / `window.MILESTONES` retirement is pending.** These globals in `data.js` were kept to bootstrap the new sheet tabs on first deploy (`bootstrapIfEmpty`). Once the live sheet is confirmed populated, a follow-up PR should remove them, remove the bootstrap seed-building path from `app.js`, and remove the legacy-shape compatibility branch from `handleBootstrap` in `apps-script.gs`.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Docs: CLAUDE.md updated for editable Roadmap"
```

---

## Post-merge acceptance checklist (for Jeff)

Run against the live deployed site after all tasks merged:

- [ ] Open live site; three sheet tabs bootstrap if empty. Gantt + milestone strip render from sheet.
- [ ] Reload: Gantt and Milestones render identically to pre-change.
- [ ] Tracks modal: rename, reorder, delete, add — all persist.
- [ ] Bar drag: move / resize-left / resize-right, all clamp correctly, all persist.
- [ ] Bar `⋯`: name/color/quarters/delete work.
- [ ] Bar `＋`: new bar appears at Y1Q1, one quarter.
- [ ] Milestone `⋯`: quarter/name/goal/delete work; Gantt row updates.
- [ ] Milestone `＋`: new milestone defaults to first empty quarter.
- [ ] Identity gate: without name, all new affordances disabled, drag no-op.
- [ ] `UpdatedBy` / `UpdatedAt` populated on every sheet row after edits.

## Follow-up PR (tracked separately, not in this plan)

After Jeff confirms the acceptance checklist passes:
1. Remove `window.GANTT` and `window.MILESTONES` from `data.js`.
2. Remove `bootstrapIfEmpty`'s seed-building path from `app.js` (keep the generic bootstrap POST for future tabs, or remove entirely — decide at PR time).
3. Remove the legacy-shape compatibility branch in `apps-script.gs::handleBootstrap`. Deploy a new Apps Script version.
4. Update `CLAUDE.md` "Pending cleanup" note (remove it).
