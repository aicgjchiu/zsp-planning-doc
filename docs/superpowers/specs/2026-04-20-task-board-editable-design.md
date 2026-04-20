# Task Board — Editable Tasks & Configurable Team

**Date:** 2026-04-20
**Status:** Design approved; implementation plan pending.
**Scope:** Task Board tab only. Roadmap/Gantt and Design Doc editing are deferred to follow-up specs.

## Summary

Make the Task Board fully editable from the UI: add/edit/delete tasks, edit title/body/phase/priority/column/assignee, and manage the team roster (names, roles, order, active). Google Sheets remains the backend, promoted from "state store for in-code tasks" to full source of truth. Existing `window.TASKS` in `data.js` seeds the sheet on first run and is then retired.

Also fixes the ambiguous `P1 · P0` chip that reads as "phase or priority?" by relabeling to `Phase 1 · Pri 0`, adding a legend row, and using full labels in the edit modal.

## Goals

- Team members can add, edit, and soft-delete tasks without editing `data.js` or bothering the programmer.
- Team roster (names, roles, column order, active state) is editable from the UI.
- Ambiguous phase/priority labels are clarified on cards and legended at the top of the board.
- Identity (the "UpdatedBy" name) is captured on page load, not lazily on first write.
- Existing curated task list (~dozens of tasks across 4 columns and 6 phases) is preserved via one-time auto-seed.

## Non-Goals

- Gantt / Roadmap editing (separate spec).
- Design Doc editing — characters, abilities, items, maps, systems (separate spec).
- Real-time collaboration / WebSocket sync. Current 30s polling + last-write-wins stays.
- Auth / per-user permission gating. Fully open edits; identity is audit trail only.
- Migrating off Google Sheets to a real database. Sheets remains fine at this team size.

## Architectural Decisions

### Sheets remains the backend
Considered: migrating to Supabase / Firebase. Rejected — at 4-person internal team size, Apps Script quotas are not a concern, Sheets has the side benefit that the team can bulk-edit / rescue data via spreadsheet UI directly, and a real DB would violate CLAUDE.md's "no framework, no build step" principle. Revisit only if team grows past ~10, or writes per minute become a problem, or per-user auth becomes necessary.

### Source-of-truth shift: `data.js` → sheet
Today `window.TASKS` lists tasks; the sheet only stores per-task state keyed by a deterministic TaskId. To support add/delete/edit, the sheet must own task existence and content. One-time seed preserves the current curated list.

### Soft delete, not hard delete
`Hidden` flag on tasks, `Active` flag on team members. Rows are never removed from the sheet by the UI. Recovery is flipping the flag in the sheet. Accidental deletes are a real risk at 4 friendly users; auditability cheap, recovery cheap.

### Fully open permissions
Identity is captured (name prompt on load) and stamped (`UpdatedBy` / `UpdatedAt`) but not gated. Anyone can edit anything. Appropriate for a 4-person trusted team; revisit if scope or team changes.

## Data Model

### `Tasks` tab

One row per task. Headers (order matters — header row is column 1 of the sheet):

| Column | Type | Notes |
|---|---|---|
| `TaskId` | string | Primary key. New tasks: `uuid-<timestamp>` (client-generated). Seeded tasks: existing deterministic ID `${colKey}-p${phase}-${p}-${slug}-${idx}` preserved so any pre-existing sheet rows survive |
| `MemberId` | string | Foreign key → `Team.MemberId`. Drives which column the task appears in |
| `Title` | string | Editable |
| `Body` | string | Editable, multi-line |
| `Phase` | number | 1–6 |
| `Priority` | string | `P0` / `P1` / `P2` |
| `Status` | string | `todo` / `progress` / `blocked` / `done` |
| `Notes` | string | Free-form notes (existing behavior) |
| `Assignee` | string | Optional free-text override. Used when someone outside the column owner is helping. Blank by default |
| `Hidden` | boolean | Soft-delete flag. `TRUE` = filtered out of UI, row retained |
| `SortOrder` | number | Numeric order within a column. New tasks get `max(SortOrder in column) + 1000` |
| `CreatedAt` | ISO string | Stamped on insert; never modified |
| `UpdatedAt` | ISO string | Stamped on every write |
| `UpdatedBy` | string | Name from identity prompt |

### `Team` tab

One row per team member. Headers:

| Column | Type | Notes |
|---|---|---|
| `MemberId` | string | Primary key. Seeded: `jeff`, `christie`, `tachi`, `jason`. New: `uuid-<timestamp>` |
| `Name` | string | Display name |
| `RoleKey` | string | One of `programmer` / `char` / `env` / `vfx`. Drives chip color and CSS class. Free-form entries not supported in v1 |
| `RoleLabel` | string | Human-readable role, e.g. "Character Artist" |
| `Order` | number | Column order on the board (ascending, left→right) |
| `Active` | boolean | `FALSE` = member hidden from UI, tasks referencing them still stored |

### Seeded defaults (written on first run if `Team` tab is empty)

| MemberId | Name | RoleKey | RoleLabel | Order | Active |
|---|---|---|---|---|---|
| `jeff` | Jeff | programmer | Programmer | 1 | TRUE |
| `christie` | Christie | char | Character Artist | 2 | TRUE |
| `tachi` | Tachi | env | Environment & Concept | 3 | TRUE |
| `jason` | Jason | vfx | VFX & Rigging | 4 | TRUE |

## Seeding & Migration

### Bootstrap flow on page load

1. Call Apps Script `GET` to fetch both tabs.
2. If `Team` tab has no rows, POST a `bootstrap` action containing the 4 default team rows + all tasks derived from `window.TASKS`.
3. The bootstrap action is atomic at the server side: it checks both tabs are empty before writing; if either is non-empty, returns `{ok: true, seeded: false}` without writing.
4. On success, re-fetch and render.

### Task ID preservation during seed

The existing `taskId(colKey, t, idx)` function derives a deterministic ID. Seeded tasks use the same function to keep any already-existing sheet rows aligned. The mapping from legacy column key (`programmer`/`char`/`env`/`vfx`) to `MemberId`:

- `programmer` → `jeff`
- `char` → `christie`
- `env` → `tachi`
- `vfx` → `jason`

### Race protection on concurrent first-load

If two team members open the page simultaneously against an empty sheet, both could attempt seed. Mitigation: the bootstrap handler wraps its entire check-and-write in `LockService.getScriptLock()` with a short wait (~10s). The second caller acquires the lock after the first finishes, re-checks whether the tabs are now populated, finds they are, and exits with `{ ok: true, seeded: false }`.

### `window.TASKS` retirement

`window.TASKS` stays in `data.js` during rollout as a fallback. `app.js` stops reading it once bootstrap completes. A separate follow-up PR (after migration is verified in production) removes `window.TASKS` and the `taskId()` derivation function entirely.

## UI Design

### Column header additions

Each column keeps its existing chip + role + name + counts, and gains:

- A small **"＋"** icon button → opens the Edit Task modal in Add mode with `MemberId` pre-filled.

### Board toolbar additions

Next to the existing "Refresh now" and "Change name" buttons, add:

- A **"Team"** button → opens the Team management modal.

### Task card changes

Unchanged: status dropdown, notes textarea, "last updated by / X ago" footer.

Added:
- A **"⋯"** icon button top-right → opens the Edit Task modal for that task.
- Chip relabel: the existing `P${t.phase} · ${t.p}` pattern becomes `Phase ${t.phase} · Pri ${digit}` (e.g. `Phase 1 · Pri 0`).

### Phase/Priority legend

A new one-line row immediately above the phase filter buttons:

> **Phase** 1 Vertical Slice · 2 Playable Alpha · 3 Content Pass · 4 Polish · 5 Beta · 6 Ship · · · **Priority** P0 Must · P1 Should · P2 Nice

Rendered from `window.PHASES` for phase labels; priority legend is a static string.

### Edit Task modal

One modal, two modes (Add / Edit). Fields:

| Field | Control | Notes |
|---|---|---|
| Title | single-line input | required |
| Description (body) | multi-line textarea | optional |
| Phase | dropdown | Options: `Phase 1 — Vertical Slice` … `Phase 6 — Ship` (full labels from `window.PHASES`) |
| Priority | dropdown | Options: `P0 — Must have`, `P1 — Should have`, `P2 — Nice to have` |
| Column / Member | dropdown | Lists active team members by name |
| Assignee (optional) | free-text input | Helper text: "Override helper name. Leave blank for default." |

Buttons:
- **Cancel** (top-right X + bottom button)
- **Save** (primary, bottom right)
- **Delete** (edit mode only; red, bottom-left). Opens inline confirm: "Hide this task? Recoverable from the sheet." Confirming writes `Hidden: true`.

Behavior:
- Save validates Title is non-empty, then pushes to sheet, closes the modal, re-renders the board.
- New tasks get `SortOrder = max(SortOrder within column) + 1000`, `CreatedAt = now`, generated TaskId.

### Team management modal

Lists all team members (active + inactive) as editable rows:

| Column | Control |
|---|---|
| Name | input |
| Role | dropdown of the 4 `RoleKey` values |
| Role label | input |
| Order | ↑ / ↓ buttons (swap order with neighbor) |
| Active | toggle |

Actions:
- **Add member** button at bottom: generates new `MemberId`, appends row, defaults to Active + next Order.
- **Save** writes through to the `Team` tab.

### Identity on load

`getUserName()` is called on `DOMContentLoaded` after the initial fetch. If the user dismisses without entering a name:

- Status and notes edits still work (backwards-compat — read-only view shouldn't require identity).
- "＋", "⋯", "Team" buttons are disabled with tooltip "Set your name first".
- "Change name" button lets them set it later.

## Apps Script Backend

### GET

Returns both tabs in one call:

```json
{ "ok": true, "tasks": [...], "team": [...] }
```

Each array is header-row-to-object mapping as today, one object per sheet row (excluding sentinel rows like `__seed_lock`).

### POST — standard envelope

```json
{
  "Tab": "Tasks",
  "Key": "<TaskId or MemberId>",
  "Fields": { "Title": "...", "Phase": 2, "Hidden": true },
  "UpdatedBy": "Jeff"
}
```

Handler:
1. Open the sheet named `Tab`.
2. Find the row whose first column equals `Key`.
3. **If found:** update only the columns present in `Fields`. Stamp `UpdatedAt = now`, `UpdatedBy`.
4. **If not found:** append a new row. Fill provided `Fields` + auto-fill `CreatedAt`, `UpdatedAt`, `UpdatedBy`, and defaults for missing columns (`Status="todo"`, `Hidden=FALSE`, `Active=TRUE`, `SortOrder = max+1000`).

Returns `{ ok: true }` or `{ ok: false, error: "..." }`.

### POST — bootstrap action

```json
{
  "Action": "bootstrap",
  "Tasks": [ { ... }, ... ],
  "Team": [ { ... }, ... ]
}
```

Handler (wrapped in `LockService.getScriptLock()` with ~10s wait):
1. Check both tabs are empty.
2. If either is non-empty → return `{ ok: true, seeded: false }`.
3. Otherwise append all provided rows via batched `setValues()`.
4. Return `{ ok: true, seeded: true }`.

### Content-Type

Remains `text/plain;charset=utf-8` on client — Apps Script rejects CORS preflight for `application/json`. Body parsed as JSON on the server regardless.

## File-Level Changes

### `apps-script.gs` (and redeploy)
Rewrite per the backend section. Old single-tab `doPost` is replaced with the envelope handler + bootstrap action. `SHEET_NAME` constant becomes unused; `TASKS_SHEET = 'Tasks'` and `TEAM_SHEET = 'Team'` added.

### `data.js`
No semantic changes during rollout. `window.TASKS` stays as fallback. Follow-up PR (post-verify) removes it.

### `app.js`

New module-level state:
- `teamState` — array of team member objects.
- `taskState` — array of task objects.
- `userName` — cached identity from localStorage.

Replaced / new functions:
- `fetchRemote()` → `fetchAll()`. Returns `{tasks, team}`. Triggers bootstrap if both empty.
- `pushUpdate(taskId, patch)` → `pushRow(tab, key, fields)`.
- `bootstrapIfEmpty()` — new.
- `renderBoard()` — rewritten to read from `teamState` (filter `Active=true`, sort by `Order`) and `taskState` (filter `Hidden=false`, group by `MemberId`, sort by `SortOrder`).
- `openEditModal(taskId | null)` — new. `null` = add mode.
- `openTeamModal()` — new.
- `closeModal()` — new.
- `deleteTask(taskId)` — new. Writes `Hidden: true`.

Existing status-dropdown and notes-textarea inline editing behavior is preserved; they just call `pushRow('Tasks', id, { Status })` / `pushRow('Tasks', id, { Notes })` instead of the old `pushUpdate`.

Identity: `getUserName()` is called on `DOMContentLoaded` post-fetch. Add/Edit/Delete/Team buttons gated on `userName` being set.

### `styles.css`

- Modal + overlay styles (one reusable pattern for both Edit Task and Team modals).
- `.t-menu-btn` style for the "⋯" button on cards.
- `.col-add-btn` style for the "＋" button on column headers.
- `.legend-row` style for the phase/priority legend.
- No changes to chips or existing card layout.

### `index.html`

- Phase filter row gets a `<div class="legend-row">` above it with the legend string.
- Board toolbar gets a `<button id="team-btn">Team</button>` next to "Refresh now" and "Change name".
- End of `<body>`: `<div id="modal-root"></div>` — empty until a modal opens.

### `CLAUDE.md`

After implementation, update these sections:
- **Task Board · Google Sheets sync:** document the two-tab schema (`Tasks`, `Team`), the expanded column list, and the new POST envelope with `Tab` / `Key` / `Fields` / `Action`.
- **Task IDs:** note that new tasks get UUID-style IDs; only seeded legacy tasks keep the deterministic format.
- Add a note that `window.TASKS` is deprecated / removed (after the follow-up cleanup PR).
- **Google Apps Script Backend:** the inline JS block is replaced / expanded to reflect the new handlers; `apps-script.gs` mirror updated.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Bootstrap runs twice against an empty sheet (two users loading simultaneously) | `LockService.getScriptLock()` with re-check inside the critical section |
| User accidentally deletes a task | Soft delete only; recovery via flipping `Hidden` in the sheet |
| User accidentally nukes the whole team (sets everyone inactive) | Team modal requires at least one Active member before Save |
| Someone edits `data.js` `TASKS` after rollout expecting it to update the board | `window.TASKS` retired in follow-up PR; CLAUDE.md updated; clear deprecation comment in the interim |
| Concurrent edits to the same task race (last-write-wins) | Accepted at this team size. `UpdatedAt` / `UpdatedBy` gives audit trail |
| Apps Script deploy not updated after script edit | CLAUDE.md already calls this out; checklist in implementation plan reinforces |

## Open Questions

None at design time. Any ambiguity will surface during implementation and be resolved in the plan.

## Approval

Design approved by user on 2026-04-20 via conversational brainstorm. Next step: implementation plan via `superpowers:writing-plans`.
