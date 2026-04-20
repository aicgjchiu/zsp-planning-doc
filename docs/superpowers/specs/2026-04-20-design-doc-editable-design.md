# Design Doc Editable — Characters, Items, Maps, Systems

**Date:** 2026-04-20
**Status:** Design approved; implementation plan pending.
**Scope:** Design Doc tab only — Characters (with nested Abilities), Items, Maps, Systems. Roadmap/Gantt editing remains deferred to its own spec.

## Summary

Make the Design Doc tab fully editable from the UI: add/edit/soft-delete records across the four data types that populate it. Google Sheets remains the single source of truth (consistent with the Task Board migration). Abilities are stored nested inside the Character row as a JSON blob because (a) they are a one-to-three relationship that conceptually belongs to the character, (b) abilities are always edited through the character modal, (c) a separate Abilities tab would add a whole CRUD path for zero ergonomic gain at 12 total rows.

## Goals

- Team members can add, edit, and soft-delete Characters / Items / Maps / Systems without editing `data.js` or asking the programmer to push code.
- Existing curated content in `data.js` globals (`window.CHARACTERS / ITEMS / MAPS / SYSTEMS`) is preserved via one-time per-tab auto-seed.
- UI patterns match the Task Board exactly — ⋯ button opens an edit modal, ＋ button adds, soft delete via `Hidden=TRUE`, immediate refetch after writes so teammate changes propagate without waiting on the 30s poll.
- Apps Script backend remains the same minimal shape; small generalizations (key-column detection, per-tab bootstrap) unblock new tabs without bespoke handlers.
- `data.js` globals retired to pure-seed status; a follow-up PR removes them entirely once migration is verified.

## Non-Goals

- Roadmap / Gantt editing (`window.GANTT`, `window.PHASES`, `window.MILESTONES`) — deferred to a separate spec.
- Real-time collaboration. 30s polling + immediate refetch after writes remain the sync model.
- Auth / per-user permission gating. Fully open edits; `UpdatedBy` is audit trail only.
- Schema validation beyond what the client enforces in modal forms. The sheet is permissive; the UI is the gate.
- Character abilities as a first-class tab with foreign keys. Explicitly rejected in favor of JSON-in-a-cell.
- Migrating off Google Sheets. Same reasoning as prior spec.

## Architectural Decisions

### Sheets remains the backend; one new tab per type
Consistent with the Task Board migration. Each type gets its own tab (`Characters`, `Items`, `Maps`, `Systems`), all sharing the same `{Tab, Key, Fields}` POST envelope the Apps Script already supports. No new backend patterns.

### Abilities as JSON blob in the Characters row
Considered: separate `Abilities` tab with `CharacterId` foreign key. Rejected — 4 characters × 3 abilities = 12 rows total is too small for the relational overhead. Abilities always travel with their character, edited through the character modal, and never bulk-edited in the sheet by anyone sensible. JSON-in-a-cell is ugly when viewing the sheet raw; that's an acceptable cost. The modal's abilities sub-table is the real editing surface.

### Staged delivery, single design
Execution split into three stages within the same spec: infrastructure + simple types (Items, Systems) first, then Maps, then Characters + nested Abilities. Each stage is independently shippable and verifiable. See "Staged Delivery" section below.

### Fully open permissions
Same reasoning as the Task Board spec — small trusted team; audit trail via `UpdatedBy`.

### Soft delete only
Same as Task Board. `Hidden=TRUE` on any row filters it from UI; recovery by flipping the flag in the sheet. No hard delete path from the UI.

## Data Model

### `Characters` tab

| Column | Type | Notes |
|---|---|---|
| `Id` | string | Primary key. Seeded characters keep existing slugs (`daoshi`, `missionary`, `shaman`, `witch_doctor`). New characters get `char-<timestamp>-<random>` |
| `Name` | string | e.g. `Daoshi · 道士` |
| `Culture` | string | e.g. `Chinese Taoist` |
| `RoleText` | string | `Ranged Caster / Area Control`. Renamed from source field `role` to avoid mental clash with `Team.RoleKey` |
| `Weapon` | string | `Talisman & peach-wood sword` |
| `Status` | string | Longer descriptor: `High-poly model exists — needs rig + textures` |
| `StatusChip` | string | Short chip label: `asset: HP ready`, `not started` |
| `Summary` | string | 1–2 sentence blurb |
| `AbilitiesJson` | string | `JSON.stringify(array of { key, name, type, desc, impl })`. Exactly 3 abilities per character, keys fixed as `Q`, `R`, `T`. Modal enforces. Client tolerates malformed JSON with `[]` fallback |
| `Hidden` | boolean | Soft-delete |
| `SortOrder` | number | Display order in Characters grid |
| `CreatedAt` / `UpdatedAt` / `UpdatedBy` | ISO strings | Standard audit |

### `Items` tab

| Column | Type | Notes |
|---|---|---|
| `Id` | string | Primary key. New items: `item-<timestamp>-<random>`. Seeded items get the same format (source data has no `id`) |
| `Name` | string | `Firebomb`, `Smoke Bomb` |
| `Kind` | string | `Consumable`, `Equipment`, etc. |
| `Effect` | string | Free-text description |
| `Stack` | number | Max stack size |
| `Existing` | boolean | Renamed from source field `existing` — "already implemented in code" |
| `Notes` | string | Free-text |
| `Hidden`, `SortOrder`, `CreatedAt`, `UpdatedAt`, `UpdatedBy` | — | Standard |

### `Maps` tab

| Column | Type | Notes |
|---|---|---|
| `Id` | string | Primary key. Seeded maps keep slugs (`hamlet`, `monastery`, `bayou`, `steppe`). New maps get `map-<timestamp>-<random>` |
| `Name` | string | `NightMarket · 夜市`, `map2`, etc. |
| `Theme` | string | Longer text |
| `Size` | string | e.g. `250m × 250m` |
| `Enemies` | string | Free-text list |
| `Boss` | string | Free-text boss description |
| `Difficulty` | string | Dropdown: `Tutorial map / Run 1`, `Run 2`, `Run 3`, `Final map / Run 4+` |
| `BiomeNotes` | string | Longer paragraph |
| `Hidden`, `SortOrder`, audit cols | — | Standard |

### `Systems` tab

| Column | Type | Notes |
|---|---|---|
| `Id` | string | Primary key. New systems get `sys-<timestamp>-<random>`. Seeded systems get same format (source has no id) |
| `System` | string | e.g. `GAS`, `Inventory System`, `Quest Tracker` |
| `SysStatus` | string | Dropdown: `In code`, `Partial`, `Not started`. Renamed from `status` to avoid clash with `Tasks.Status` |
| `Dep` | string | Free-text dependencies |
| `Owner` | string | Free-text. Intentionally not a Team MemberId dropdown — systems routinely have joint ownership ("Jeff + Shared") that a dropdown forbids |
| `Notes` | string | Free-text |
| `Hidden`, `SortOrder`, audit cols | — | Standard |

### Tabs not affected
`Tasks`, `Team`, `Config` remain unchanged.

## Seeding & Migration

### Extended bootstrap action

The existing Apps Script `Action: "bootstrap"` accepts optional per-tab row arrays:

```json
{
  "Action": "bootstrap",
  "Tasks": [...], "Team": [...],
  "Characters": [...], "Items": [...], "Maps": [...], "Systems": [...]
}
```

Any subset is valid. The server iterates provided arrays, and for each, seeds the sheet only if that specific tab currently has no data rows. Prior behavior (Tasks + Team) is preserved; the new tabs follow the same per-tab rule.

**Why per-tab rule matters here:** by the time this PR lands, the user's `Tasks` and `Team` tabs are already populated. If bootstrap bailed on "any tab has data," the new four tabs would never seed. Per-tab independent check avoids this.

Wrapped in `LockService.getScriptLock()` like before.

### Client flow on page load

1. Call `fetchAll()` → receives `{ok, tasks, team, characters, items, maps, systems}`.
2. For each of the four new state arrays that came back empty, build the seed rows from the corresponding `window.*` global.
3. POST one bootstrap call with whichever subset of `{Characters, Items, Maps, Systems}` needs seeding.
4. If anything was seeded, re-fetch and re-render.

### Seed mapping

| Sheet tab | Source global | Transform |
|---|---|---|
| `Characters` | `window.CHARACTERS` | `id → Id`, `name → Name`, `culture → Culture`, `role → RoleText`, `weapon → Weapon`, `status → Status`, `statusChip → StatusChip`, `summary → Summary`, `abilities → AbilitiesJson` (via `JSON.stringify`). Defaults: `Hidden=false`, `SortOrder=(idx+1)*1000`, empty audit |
| `Items` | `window.ITEMS` | `name → Name`, `kind → Kind`, `effect → Effect`, `stack → Stack`, `existing → Existing`, `notes → Notes`. `Id` generated `item-seed-<idx>` |
| `Maps` | `window.MAPS` | `id → Id`, `name → Name`, `theme → Theme`, `size → Size`, `enemies → Enemies`, `boss → Boss`, `difficulty → Difficulty`, `biomeNotes → BiomeNotes` |
| `Systems` | `window.SYSTEMS` | `sys → System`, `status → SysStatus`, `dep → Dep`, `owner → Owner`, `notes → Notes`. `Id` generated `sys-seed-<idx>` |

### `data.js` retirement

After migration lands, `window.CHARACTERS / ITEMS / MAPS / SYSTEMS` are no longer read by the render path. They remain in `data.js` during rollout as a safety net. A follow-up PR (after the team verifies end-to-end) removes them along with `window.TASKS` (left over from the prior migration). `data.js` will then hold only `GANTT`, `PHASES`, `MILESTONES`.

## UI Design

### Section structure

The Design Doc tab keeps its current layout — Core Loop cards, Characters grid, Items table, Maps grid, Systems table, Open Questions cards. The first and last sections are static copy and not in scope. Each of the four editable sections gains:

- **＋ button** placed in the section header (beside the existing `.aside` count label). Click opens the Add modal for that type.
- **⋯ button** on every card (Characters, Maps) or every table row (Items, Systems). Click opens the Edit modal for that record.

Both gated on `userName` being set. Disabled state shows tooltip "Set your name first" — same UX as Task Board.

### Characters modal

Sections within the modal panel:

**Character fields (top):**
- Name (text)
- Culture (text)
- Role text (text, single line)
- Weapon (text)
- Status (text, longer)
- Status chip (text, short)
- Summary (textarea)

**Abilities sub-table (middle):**
Fixed 3 rows with keys `Q`, `R`, `T` (pre-labeled, not editable). Each row has inline fields:
- Name (text)
- Type (dropdown: `Skill`, `Ultimate`)
- Description (textarea)
- Impl status (dropdown: `Implemented`, `Partial`, `Design only`)

No add-row / delete-row on the sub-table — game design fixes ability count at 3. If that ever changes, a follow-up spec adjusts.

**Footer:**
- Delete button (red, bottom-left, edit mode only) with inline confirm
- Cancel / Save (bottom-right)

**Save flow:** client collects ability-row values into an array of objects, `JSON.stringify(abilities)` → `AbilitiesJson` field. Rest of the save path is identical to task save.

### Items modal

Fields (flat form):
- Name (text, required)
- Kind (text)
- Effect (text / textarea)
- Stack (number)
- Existing (checkbox)
- Notes (textarea)

Standard Cancel / Save / Delete footer.

### Maps modal

Fields:
- Name (text, required)
- Theme (textarea)
- Size (text)
- Enemies (textarea)
- Boss (text)
- Difficulty (dropdown — options fixed: `Tutorial map / Run 1`, `Run 2`, `Run 3`, `Final map / Run 4+`)
- BiomeNotes (textarea)

Standard footer.

### Systems modal

Fields:
- System (text, required)
- SysStatus (dropdown: `In code`, `Partial`, `Not started`)
- Dep (textarea)
- Owner (text, free-form)
- Notes (textarea)

Standard footer.

### Immediate refetch

Save / Delete / Add in any of the four modals calls `fetchAll()` at the end — same pattern the Task Board uses. No 30s lag for teammate changes to appear.

## Client Data Layer

### Module state additions in `app.js`

```js
let charactersState = [];
let itemsState      = [];
let mapsState       = [];
let systemsState    = [];
```

### Updated `fetchAll()`

Parses the new shape `{ok, tasks, team, characters, items, maps, systems}`. Each array normalized through a per-type normalizer modeled on `normalizeTaskRow`:

- `normalizeCharacterRow` — parses `AbilitiesJson` into a live array with `[]` fallback on parse error
- `normalizeItemRow` — coerces `Stack` to number, `Existing` to boolean
- `normalizeMapRow` — strings all the way down
- `normalizeSystemRow` — strings all the way down

Each normalizer handles the `Hidden` boolean coercion (same pattern as tasks — accepts `true`, `'TRUE'`, `'true'`).

### `pushRow(tab, key, fields)` — no signature change

Already tab-agnostic. New modals call it with `'Characters'` / `'Items'` / `'Maps'` / `'Systems'` and the appropriate `Id` as `key`.

### Character save — JSON serialization

Character save path wraps the generic flow:

```js
fields.AbilitiesJson = JSON.stringify(abilitiesDraft);
await pushRow('Characters', key, fields);
```

The rest is identical to any other save.

### New render functions read from state

`renderCharacters`, `renderItems`, `renderMaps`, `renderSystems` in `app.js` are rewritten to read from `charactersState` / etc., filter `Hidden=false`, sort by `SortOrder`, and inject ⋯ + ＋ buttons. The DOM shape remains the same as today so no CSS changes needed for the cards/tables themselves.

## Apps Script Backend

Minimal changes. The existing `{Tab, Key, Fields}` envelope already handles arbitrary tab names.

### Change 1: Generalize key column detection

`handleUpsert` currently hardcodes:

```js
const keyColName = body.Tab === TEAM_SHEET ? 'MemberId' : 'TaskId';
```

Replace with:

```js
const keyColName = headers[0]; // first column is always the primary key by convention
```

The four new tabs all use `Id` as the first column; this lets the existing upsert work without per-tab branching.

### Change 2: Expand `doGet`

Return all four new tabs alongside tasks and team:

```js
return jsonOut({
  ok: true,
  tasks:      readTab(ss.getSheetByName(TASKS_SHEET)),
  team:       readTab(ss.getSheetByName(TEAM_SHEET)),
  characters: readTab(ss.getSheetByName(CHARACTERS_SHEET)),
  items:      readTab(ss.getSheetByName(ITEMS_SHEET)),
  maps:       readTab(ss.getSheetByName(MAPS_SHEET)),
  systems:    readTab(ss.getSheetByName(SYSTEMS_SHEET)),
});
```

New tab-name constants at the top of the script. `Config` remains excluded.

### Change 3: Per-tab bootstrap

`handleBootstrap` is generalized so each provided-and-empty tab seeds independently:

```js
function handleBootstrap(body) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10 * 1000)) return jsonOut({ ok: false, error: 'Could not acquire lock' });
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const seedMap = {
      Tasks: body.Tasks, Team: body.Team,
      Characters: body.Characters, Items: body.Items,
      Maps: body.Maps, Systems: body.Systems,
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
```

Return shape changes from `{ok, seeded: <bool>}` to `{ok, seeded: {Tasks: true, Characters: true, ...}}`. Client ignores the detail and re-fetches regardless, so this is backward-compat-safe at the current call sites.

### Content-Type, Config exclusion, unlock handler, lock behavior

All unchanged from the prior spec. The `Action: "unlock"` handler added in the password-gate work continues to function independently.

### Deployment

After the script edit, user redeploys via Deploy → Manage deployments → pencil → New version → Deploy. `apps-script.gs` mirror updated to match.

## User-Side Sheet Prep (before deploy)

Four new tabs with exact headers, no data rows:

- **`Characters`**: `Id | Name | Culture | RoleText | Weapon | Status | StatusChip | Summary | AbilitiesJson | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`
- **`Items`**: `Id | Name | Kind | Effect | Stack | Existing | Notes | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`
- **`Maps`**: `Id | Name | Theme | Size | Enemies | Boss | Difficulty | BiomeNotes | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`
- **`Systems`**: `Id | System | SysStatus | Dep | Owner | Notes | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`

Client bootstraps rows on first page load.

## Staged Delivery

Execution within this one spec splits into three stages, each independently shippable and verifiable.

### Stage A — Infrastructure + Items + Systems

- Apps Script changes (key-column detection, doGet expansion, per-tab bootstrap).
- User creates all four new tabs in the sheet + redeploys script.
- Client: add all four state arrays and all four normalizers.
- Wire render + modal + seed + CRUD for **Items** and **Systems** only. Characters and Maps continue to read from `window.*` globals during this stage.

**Gate to Stage B:** user verifies Items and Systems are editable end-to-end (add, edit, delete, refetch) in the browser.

**Why first:** flat data, simple modals, proves the shared infrastructure pattern before extending to the gnarlier types.

### Stage B — Maps

- Wire render + modal + seed for Maps.

**Gate to Stage C:** Maps editable end-to-end.

**Why second:** Maps are also flat but the longer text fields (`BiomeNotes`, `Theme`, `Enemies`) exercise textarea UX in the modal pattern before Characters adds the abilities sub-table on top.

### Stage C — Characters + nested Abilities

- Wire Characters render + modal. Modal includes the abilities sub-table with JSON serialization on save.
- Remove last reads from `window.CHARACTERS`.

**Why last:** unique UI code (sub-table, JSON roundtrip). Isolating it means a bug here doesn't block the other three types.

### Post-migration cleanup (separate PR)

Not part of this spec:
- Delete `window.CHARACTERS / ITEMS / MAPS / SYSTEMS` and `window.TASKS` from `data.js`.
- Update `CLAUDE.md` to note `data.js` now only holds `GANTT / PHASES / MILESTONES`.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Malformed `AbilitiesJson` in a character row crashes render | `normalizeCharacterRow` wraps `JSON.parse` in try/catch and falls back to `[]`; modal opens with an empty abilities table so the user can fix it |
| Bootstrap double-seeds concurrent loads | Existing `LockService.getScriptLock()` protects, per-tab emptiness check still happens inside the critical section |
| Apps Script deploy not updated after script edit | Plan includes explicit deploy step as its own task; CLAUDE.md already calls this out |
| `Difficulty` dropdown locks out future content | Options are in JS, easy to extend by editing `app.js`. No sheet-side schema change needed |
| Team wants a 4th ability slot later | Data stored as JSON array — schema tolerates any count. Modal UI currently fixes at 3; a small follow-up adds/removes rows. No data migration needed |
| `data.js` globals stay stale and diverge from the sheet | Follow-up cleanup PR removes them after migration verified; during rollout they're a safety net only, not read by the render path |

## Open Questions

None at design time.

## Approval

Design approved by user on 2026-04-20 via conversational brainstorm. Next step: implementation plan via `superpowers:writing-plans`.
