# CLAUDE.md

Guidance for Claude Code when working in this repo.

## Project Overview

**ZSP Planning Doc** — a single-page HTML planning document for the ZSP (ZSP · Portal Pivot) game project. It's a 3-year shipping roadmap + design doc + live task board for a team of 4 (1 programmer + 3 artists: character, environment/concept, VFX/rigging).

This doc is **separate from the ZSP game codebase itself** (that lives in a Perforce depot in Unreal Engine 5.7). This repo is a static website only — no build step, no framework, no npm.

- **Live site:** https://aicgjchiu.github.io/zsp-planning-doc/
- **GitHub repo:** https://github.com/aicgjchiu/zsp-planning-doc
- **Reference design doc (original Google Sheet we're mirroring):** https://docs.google.com/spreadsheets/d/1DqMmmGn5lszMnoQbp_TZN-OLxJlLvcYRmvuiYoAJH8k/

## Stack

- **Plain HTML / CSS / JS.** No bundler, no React, no TypeScript. Open `index.html` in a browser and it works.
- **Hosted on GitHub Pages** — any push to `main` redeploys in ~1 minute.
- **Google Apps Script backend** for the task board (live sync across the team via a Google Sheet).

## Files

| File | Purpose |
|---|---|
| `index.html` | Shell. 4 tabs: Overview, Roadmap, Design Doc, Task Board. All tab content lives inline. |
| `styles.css` | All styles. Uses CSS custom props in `:root` for the color system (oklch). |
| `data.js` | **Single source of truth for all content.** Characters, abilities, items, maps, systems, Gantt bars, milestones, phases, tasks — all live here as `window.*` globals. |
| `app.js` | Rendering + tab switching + task-board sync logic. No frameworks; hand-rolled template strings. |
| `CLAUDE.md` | This file. |

When content needs to change (add a map, reword a task, shift a Gantt bar), edit `data.js` only. `app.js` just reads globals and renders.

## Architecture

### Tabs

Single-page; each top-level `<main class="page" data-tab="...">` is one tab. `app.js::activateTab(name)` toggles a `hidden` class on all but the selected one. Current tab is persisted to `localStorage` under `zsp_tab`.

### Task Board · Google Sheets sync

Live-synced per-person task board backed by a Google Sheet via an Apps Script web app.

- **Endpoint:** configured in `app.js` as `SHEET_ENDPOINT` (a Google Apps Script `/exec` URL).
- **Sheet schema** — tab must be named `Tasks`, row 1 is headers, exactly:
  `TaskId | Status | Assignee | Notes | UpdatedAt | UpdatedBy`
- **Read:** `GET` to the endpoint returns `{ ok: true, rows: [...] }` — one object per sheet row, keyed by header.
- **Write:** `POST` with `Content-Type: text/plain;charset=utf-8` (to avoid CORS preflight — Apps Script doesn't allow custom CORS headers) and a JSON body `{ TaskId, Status?, Notes?, UpdatedBy }`. Script appends if new, updates in place if TaskId exists.
- **Polling:** `fetchRemote()` runs on page load and every 30s thereafter. Status dropdown writes push immediately; notes textareas push 1.2s after the user stops typing (debounced) or on blur.
- **Identity:** the user's name is prompted once on first interaction and stored in `localStorage` under `zsp_user_name`; sent with every write as `UpdatedBy`.

### Task IDs (stable across refreshes)

Task IDs are derived from the in-code task data so sheet rows survive refreshes:

```js
taskId(colKey, t, idx) = `${colKey}-p${t.phase}-${t.p}-${slug(t.title)}-${idx}`
```

`colKey` is the role column (`programmer` / `char` / `env` / `vfx`). **If you reorder or rewrite `window.TASKS` in `data.js`, old rows in the sheet will be orphaned** — the page won't find them and their state effectively resets. Rename task bodies freely, but rename task *titles* carefully.

### Gantt

The Gantt is a CSS grid: a fixed 240px label column + 12 quarter columns of 120px each (Y1Q1 → Y3Q4). Total min-width ~1680px, rendered inside `.gantt-scroll` which provides horizontal overflow. Bars are positioned with `grid-column: ${b.start+1} / span ${b.end-b.start}`. Bar data lives in `window.GANTT` in `data.js`.

## Content Conventions

- **Keep Chinese only in proper nouns** — map names (e.g. `Hamlet 靜村`), character names (`Daoshi 道士`), enemy names (`Jiangshi 殭屍`), boss names, ability names. Everything else (system descriptions, task bodies, tooltips, headers) is in English. This mirrors the reference Google Sheet.
- **Target game content:** 4 maps · 4 characters · 3 abilities each · 10 items. These numbers are baked into the design doc; changing them means updating `window.CHARACTERS` / `window.ITEMS` / `window.MAPS` in lockstep with the Gantt + task board.
- **6-phase structure** (P1 Vertical Slice → P6 Ship) over 12 quarters / 3 years. Phase colors in CSS are `.phase-1` through `.phase-6` with matching `--c-*` variables.
- **Team composition is hard-coded at 4:** 1 programmer (you) + 3 artists (character / environment / VFX-rigging). If team changes, multiple files need updating — search for role column keys (`programmer`, `char`, `env`, `vfx`).

## Google Apps Script Backend

The script that powers the task-board backend is deployed from the linked Google Sheet. Reference implementation lives in the Apps Script editor attached to the sheet.

**Backing sheet (task board data):** https://docs.google.com/spreadsheets/d/1Od7n8hbOO24SIJiyGR7ctfYTkkLdUXLVf06KiUCY0hQ/edit?gid=0#gid=0 — open this to inspect live row state, debug TaskId orphans, or edit the Apps Script (Extensions → Apps Script from this sheet).

**Current script source:** mirrored in `apps-script.gs` at the repo root for reference. That file is not loaded by the site; when the deployed script changes, update `apps-script.gs` to match so the mirror stays accurate.

Core logic:

```javascript
const SHEET_NAME = 'Tasks';

function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = r[i]);
    return obj;
  });
  return ContentService.createTextOutput(JSON.stringify({ ok: true, rows }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  // find-or-append by TaskId; update Status / Notes / Assignee if present in body;
  // always stamp UpdatedAt + UpdatedBy.
  // See app.js::pushUpdate for the client side.
}
```

**Deployment:** Apps Script editor → Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone → copy `/exec` URL into `SHEET_ENDPOINT` in `app.js`. **Any code change requires Deploy → Manage deployments → pencil icon → New version → Deploy** to take effect — otherwise the old code keeps serving.

## Local Development

```bash
# Just open the file. No build step.
open index.html          # macOS
start index.html         # Windows
xdg-open index.html      # Linux
```

From `file://` the Apps Script sync will still work (no CORS restriction on simple `text/plain` POSTs).

To iterate faster, any static server works:
```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Deployment

GitHub Pages from `main` branch, root. Every push auto-redeploys.

```bash
git add .
git commit -m "describe the change"
git push
```

Live URL: https://aicgjchiu.github.io/zsp-planning-doc/

## Known Gotchas

- **CORS preflight:** do NOT change the task-board `fetch` call to use `Content-Type: application/json`. Apps Script rejects the preflight OPTIONS request. Keep it as `text/plain;charset=utf-8` — the backend parses the body as JSON regardless.
- **Apps Script URL is public.** Anyone with the `/exec` URL can read + write the sheet. The script has no auth. This is fine for internal team use; don't post the URL publicly (it's embedded in `app.js`, so the repo should stay internal-use-only or we need to add a secret / auth layer).
- **GitHub Pages cache:** Pages sets fairly aggressive cache headers. If a teammate reports they don't see a UI update you just pushed, have them hard-refresh (Cmd/Ctrl+Shift+R).
- **Main HTML filename:** the entry file is `index.html` (renamed from the original `ZSP Planning Doc.html`) so the root URL works on GitHub Pages. Don't rename it back.
- **Claude preview sandbox blocks the fetch.** If you're previewing the page inside the Claude artifact sandbox (`claudeusercontent.com`), the Task Board will be stuck on "Connecting…" — cross-origin fetches to `script.google.com` are blocked in that sandbox. Test the sync on the deployed GitHub Pages URL or from `file://`, not inside the Claude preview.
- **Don't add a framework.** The whole appeal of this repo is that anyone on the team can open the files and hand-edit content in `data.js`. Keep it buildless.

## When Editing

- **Change task content:** edit `window.TASKS` in `data.js`. Renaming a task title changes its TaskID and orphans its sheet row — prefer editing the `body` text and leaving `title` stable.
- **Add a character / map / item:** append to `window.CHARACTERS` / `window.MAPS` / `window.ITEMS`. Each has a shape defined by how `app.js::renderCharacters` etc. consume them — check the render functions to confirm required fields.
- **Shift a Gantt bar:** edit `window.GANTT` — `start` and `end` are quarter indices (0 = Y1Q1, 11 = Y3Q4). Keep `color` in sync with the `role` so the bar matches the row.
- **Add a phase / lane color:** add a CSS variable in `:root`, then a matching `.chip.X` / `.dot.X` / `.gbar.X` rule. Phases use `.phase-1` through `.phase-6` with left-border color on task cards.
- **New tab:** add a `<main class="page hidden" data-tab="newtab">` block in `index.html`, add a nav button with `data-target="newtab"`, write a `render*()` function in `app.js`, and call it from `renderAll()`.

## Version Control

Plain Git on GitHub (unlike the ZSP game codebase which uses Perforce). Normal workflow: branch if you want, but `main` → push → deploy is fine for small content edits. No CI/CD beyond GitHub Pages itself.