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

Live-synced task board backed by a Google Sheet via an Apps Script web app. **The sheet is the source of truth for tasks themselves**, not just per-task state.

- **Endpoint:** configured in `app.js` as `SHEET_ENDPOINT` (a Google Apps Script `/exec` URL).
- **Backing sheet (inspect rows, debug, recover soft-deletes):** https://docs.google.com/spreadsheets/d/1Od7n8hbOO24SIJiyGR7ctfYTkkLdUXLVf06KiUCY0hQ/edit
- **Tabs:**
  - **`Tasks`** headers (row 1, in order): `TaskId | MemberId | Title | Body | Phase | Priority | Status | Notes | Assignee | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`
  - **`Team`** headers: `MemberId | Name | RoleKey | RoleLabel | Order | Active`
  - **`Characters`** headers: `Id | Name | Culture | RoleText | Weapon | Status | StatusChip | Summary | AbilitiesJson | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`  — `AbilitiesJson` is a JSON-serialized array of `{key, name, type, desc, impl}`, exactly 3 slots keyed `Q`/`R`/`T`
  - **`Items`** headers: `Id | Name | Kind | Effect | Stack | Existing | Notes | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`
  - **`Maps`** headers: `Id | Name | Theme | Size | Enemies | Boss | Difficulty | BiomeNotes | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`
  - **`Systems`** headers: `Id | System | SysStatus | Dep | Owner | Notes | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`
  - **`Config`** headers: `Key | Value`. Private — never returned in `GET`. Holds the unlock password at row `Key=password`.
- **Read:** `GET` returns `{ ok: true, tasks: [...], team: [...] }` — one object per row, keyed by header.
- **Write:** `POST` with `Content-Type: text/plain;charset=utf-8` and JSON body `{ Tab: "Tasks"|"Team", Key: <TaskId|MemberId>, Fields: { ... }, UpdatedBy: <name> }`. Script appends if key doesn't exist, otherwise updates only the named fields. `UpdatedAt` + `UpdatedBy` stamped automatically.
- **Key column convention:** each tab's first column is its primary key. The Apps Script `handleUpsert` detects this from the header row — no per-tab branching. New tabs just need a unique-ID first column to work with the envelope.
- **Bootstrap:** on page load, if both tabs are empty, the client POSTs `{ Action: "bootstrap", Tasks: [...], Team: [...] }`. Script seeds rows atomically inside `LockService.getScriptLock()` and re-checks emptiness inside the critical section, so two simultaneous loads don't double-seed.
- **Polling + immediate refetch:** `fetchAll()` runs on page load and every 30s thereafter. Every structural write (add/edit/soft-delete, team save, status change) refetches right after the push succeeds so teammate changes show up immediately. Notes textarea stays optimistic-only (debounced; 30s poll reconciles) to avoid clobbering active typing.
- **Identity:** user's name is prompted on page load (via `DOMContentLoaded` → post-fetch prompt in `fetchAll`) and stored in `localStorage` under `zsp_user_name`. Stamped on every write as `UpdatedBy`. Add/Edit/Delete/Team buttons are disabled until identity is set; status/notes inline edits still work without it.
- **Soft delete only:** setting `Hidden=TRUE` filters a task from the UI. Row stays in the sheet and can be recovered by flipping the flag manually.

### Task IDs

- **Seeded tasks** (from the one-time `window.TASKS` migration) use a deterministic legacy ID: `${legacyColKey}-p${phase}-${priority}-${slug}-${idx}`. This keeps any pre-existing sheet rows aligned during the migration.
- **New tasks** (created via the UI) get a client-generated ID: `task-<timestamp>-<random>`. Stable for the lifetime of the row.
- `MemberId` links a task to a team member; `RoleKey` on the team member drives chip color.

`window.TASKS` in `data.js` is the seed source, used only on first-ever load into an empty sheet. A follow-up PR removes `window.TASKS` entirely once migration is verified; the sheet is the sole source of truth after that.

### Gantt

The Gantt is a CSS grid: a fixed 240px label column + 12 quarter columns of 120px each (Y1Q1 → Y3Q4). Total min-width ~1680px, rendered inside `.gantt-scroll` which provides horizontal overflow. Bars are positioned with `grid-column: ${b.start+1} / span ${b.end-b.start}`. Bar data lives in `window.GANTT` in `data.js`.

## Content Conventions

- **Keep Chinese only in proper nouns** — map names (e.g. `NightMarket 夜市`), character names (`Daoshi 道士`), enemy names (`Jiangshi 殭屍`), boss names, ability names. Everything else (system descriptions, task bodies, tooltips, headers) is in English. This mirrors the reference Google Sheet.
- **Target game content:** 4 maps · 4 characters · 3 abilities each · 10 items. These numbers are baked into the design doc; changing them means updating `window.CHARACTERS` / `window.ITEMS` / `window.MAPS` in lockstep with the Gantt + task board.
- **6-phase structure** (P1 Vertical Slice → P6 Ship) over 12 quarters / 3 years. Phase colors in CSS are `.phase-1` through `.phase-6` with matching `--c-*` variables.
- **Team composition is hard-coded at 4:** 1 programmer (you) + 3 artists (character / environment / VFX-rigging). If team changes, multiple files need updating — search for role column keys (`programmer`, `char`, `env`, `vfx`).

## Google Apps Script Backend

The script that powers the task-board backend is deployed from the Google Sheet (Extensions → Apps Script). A mirror of the current deployed script lives in **`apps-script.gs`** at the repo root — always keep it in sync with the editor after any deploy.

**High-level shape:** `doGet` returns both tabs; `doPost` routes to `handleUpsert` or `handleBootstrap` based on the request body. `handleBootstrap` wraps its check-and-write in `LockService.getScriptLock()` to prevent double-seeding on concurrent first loads.

**Deployment:** Apps Script editor → Deploy → Manage deployments → pencil icon → New version → Deploy. Any code change requires a new version — otherwise the old code keeps serving.

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

- **Change task content:** edit tasks from the Task Board tab UI (click `⋯` on a card) — this is the new source of truth. `window.TASKS` in `data.js` is seed-only and no longer read after first load; edits there have no effect on the live board.
- **Team composition:** use the Task Board's "Team" button to add / rename / reorder / deactivate members. No code change needed when the team composition shifts.
- **Change Design Doc content:** edit characters/items/maps/systems via the Design Doc tab UI (click `⋯` on any card or row, `＋` in a section header to add). The sheet is the source of truth. `window.CHARACTERS / ITEMS / MAPS / SYSTEMS` in `data.js` are seed-only, consumed once on first load; edits there have no effect on the live page after migration.
- **Character abilities:** exactly 3 slots per character, keyed `Q`/`R`/`T`, edited through the Character modal's sub-table. Stored as `JSON.stringify(abilities)` in the `AbilitiesJson` column of the Characters row. If a character ever needs a 4th ability, the schema tolerates it — only the modal UI enforces count-of-3 today.
- **Add a character / map / item:** append to `window.CHARACTERS` / `window.MAPS` / `window.ITEMS`. Each has a shape defined by how `app.js::renderCharacters` etc. consume them — check the render functions to confirm required fields.
- **Shift a Gantt bar:** edit `window.GANTT` — `start` and `end` are quarter indices (0 = Y1Q1, 11 = Y3Q4). Keep `color` in sync with the `role` so the bar matches the row.
- **Add a phase / lane color:** add a CSS variable in `:root`, then a matching `.chip.X` / `.dot.X` / `.gbar.X` rule. Phases use `.phase-1` through `.phase-6` with left-border color on task cards.
- **New tab:** add a `<main class="page hidden" data-tab="newtab">` block in `index.html`, add a nav button with `data-target="newtab"`, write a `render*()` function in `app.js`, and call it from `renderAll()`.

## Version Control

Plain Git on GitHub (unlike the ZSP game codebase which uses Perforce). Normal workflow: branch if you want, but `main` → push → deploy is fine for small content edits. No CI/CD beyond GitHub Pages itself.