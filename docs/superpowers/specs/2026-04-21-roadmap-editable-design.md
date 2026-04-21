# Roadmap Editable — Design Spec

**Date:** 2026-04-21
**Status:** Approved, ready for implementation planning
**Author:** Jeff (via brainstorm with Claude)

## Summary

Make the Roadmap tab's Gantt (tracks + bars) and Milestones strip editable through the same live-synced pattern already used by the Task Board and Design Doc. The Phases table and the Quarter-by-quarter table remain static (HTML + `window.PHASES` in `data.js`) and are out of scope.

This closes the last major "edit in UI" gap — after this ships, the only hard-coded roadmap content left is Phases.

## Scope

**In scope**
- Gantt tracks: editable list (rename, reorder, role, soft-delete, add).
- Gantt bars: drag-to-resize/move, modal edit (name/color/quarters/delete), add per track.
- Milestones: editable cards (quarter/name/goal/delete, add).
- Auto-derived milestone row at the bottom of the Gantt, driven by the Milestones sheet tab.
- Apps Script backend: three new tabs + generic `handleBootstrap` refactor.

**Out of scope**
- Phases table (stays static).
- Quarter-by-quarter table (stays static).
- Any new CSS color classes (reuse existing six `.gbar.*` classes).
- Non-Roadmap tabs.

## Sheet schema — three new tabs

Headers must be created in this exact order in the backing sheet (primary key column is always first, matching the existing convention detected by `handleUpsert`).

### `GanttTracks`
| Column | Notes |
|---|---|
| `TrackId` | Primary key. Client-minted: `track-<timestamp>-<random>`. |
| `Name` | Free text. Shown in Gantt label column. |
| `Role` | One of `portal / code / char / env / vfx`. Drives default bar color suggestion (cosmetic). |
| `Order` | Integer. Ascending = top-to-bottom render order. |
| `Hidden` | `TRUE` to soft-delete. |
| `SortOrder` | Reserved for future drag-reorder; not used by v1 UI (the Tracks modal uses ↑↓ on `Order`). |
| `CreatedAt` / `UpdatedAt` / `UpdatedBy` | Stamped by Apps Script on write. |

### `GanttBars`
| Column | Notes |
|---|---|
| `BarId` | Primary key. Client-minted: `bar-<timestamp>-<random>`. |
| `TrackId` | Foreign key to `GanttTracks`. Orphaned bars (track deleted or missing) are filtered from UI but remain in the sheet. |
| `Name` | Free text. Rendered inside the bar. |
| `Start` | 0-based quarter index. Range `[0, 11]`. Must be `< End`. |
| `End` | 0-based quarter index. Range `[1, 12]`. `End` is exclusive (matches current `grid-column: ${start+1} / span ${end-start}`). |
| `Color` | One of `portal / code / char / env / vfx`. Reserved value `milestone` is NOT selectable by users — only the auto-derived row uses it. |
| `Hidden` | `TRUE` to soft-delete. |
| `SortOrder` | Reserved; unused in v1. |
| `CreatedAt` / `UpdatedAt` / `UpdatedBy` | Stamped by Apps Script. |

### `Milestones`
| Column | Notes |
|---|---|
| `MilestoneId` | Primary key. Client-minted: `ms-<timestamp>-<random>`. |
| `Quarter` | String, `"Y1 Q2"` format (matches existing `window.MILESTONES` shape). Client parses to an index for Gantt placement. |
| `Name` | Free text. Headline on the card and on the Gantt bar. |
| `Goal` | Free text, multiline. Body of the card; not shown on the Gantt bar. |
| `Hidden` | `TRUE` to soft-delete. |
| `SortOrder` | Reserved; unused in v1 (render order is derived from `Quarter`). |
| `CreatedAt` / `UpdatedAt` / `UpdatedBy` | Stamped by Apps Script. |

## Rendering

### Gantt
- Read `ganttTracks` from the sync response, filter `Hidden != TRUE`, sort by `Order` ascending.
- For each track, read `ganttBars` filtered by `TrackId` (and `Hidden != TRUE`). Position each bar with `grid-column: ${Start+1} / span ${End-Start}`.
- After the user tracks, render a **read-only milestone row** at the bottom of the Gantt:
  - Label column: "Milestones".
  - One single-quarter bar per active milestone, placed at `grid-column: ${qIndex+1} / span 1`, styled `.gbar.milestone`, label = milestone `Name`.
  - `qIndex` is derived from `Quarter` — `"Y<a> Q<b>"` → `(a-1)*4 + (b-1)`. Invalid strings log a console warning and skip the bar.
  - No drag handlers, no `⋯` button.
- The Gantt remains a CSS grid (240px label + 12 × 120px columns, min-width ~1680px inside `.gantt-scroll`). No layout changes.

### Milestones strip (below the Gantt)
- Read the same `milestones` array, sort by parsed `qIndex` ascending.
- Each card: quarter badge + name + goal + `⋯` button.
- A `＋` button at the end of the strip to add a new milestone.

## Edit UX

### Bar drag (user tracks only, identity-gated)
Attach `pointerdown` on each bar element.
- **Hit zones** (computed from pointer offset within the bar's bounding rect):
  - First 8px → resize-start (`cursor: ew-resize`).
  - Last 8px → resize-end (`cursor: ew-resize`).
  - Middle → move (`cursor: grab` idle, `grabbing` while dragging).
- **During drag:** on `pointermove`, compute `delta = Math.round((e.clientX - startX) / 120)`. Apply delta to `Start` / `End` / both (depending on zone). Update DOM `grid-column` live.
- **Clamps:** `Start >= 0`, `End <= 12`, `End - Start >= 1`. If clamping would reduce delta to zero, no DOM change this frame.
- **Commit on `pointerup`:** optimistic POST `{Tab:"GanttBars", Key:BarId, Fields:{Start, End}}`. On failure, revert DOM to pre-drag values and re-render from server state.
- **Identity gate:** `pointerdown` handler `return`s early when `userName` is empty.
- **Milestone row bars:** no pointer handlers attached at all.

### Bar modal (`⋯` on any user bar)
Fields:
- **Name** (text input).
- **Color** (dropdown): `portal / code / char / env / vfx`. No `milestone` option.
- **Start** (dropdown): Y1Q1 … Y3Q4 (values 0–11).
- **End** (dropdown): Y1Q2 … end-of-Y3Q4 (values 1–12). Must be `> Start`; enforce on save.
- **Delete** button (soft-delete, confirm dialog).
- **Save** / **Cancel**.

### Bar add (`＋` at the end of each user track row)
Creates a row with `Start=0, End=1, Name="New bar", Color=<track.Role or 'code'>`. Client POSTs, then focuses the new bar so the user can drag it into place or open its modal.

### Tracks modal ("Tracks" button in the Roadmap tab header)
Matches the Team-button pattern in the Task Board tab.
- One row per active track: Name (inline text input), Role (dropdown), ↑/↓ arrows, Delete (soft, confirm).
- ↑/↓ swaps `Order` values with the neighboring row; both rows POST.
- "Add track" button at the bottom: appends a row with `Order = max(Order) + 1`, `Name="New track"`, `Role="code"`.
- Save on per-field blur (debounced 300ms) — same pattern as existing inline edits.

### Milestone modal (`⋯` on a milestone card)
- **Quarter** (dropdown): Y1Q1 … Y3Q4 (12 options, stored as the "Y<a> Q<b>" string).
- **Name** (text input).
- **Goal** (textarea, multiline).
- **Delete** button (soft, confirm).
- **Save** / **Cancel**.

### Milestone add (`＋` at end of Milestones strip)
Creates a row with `Quarter` = first quarter (Y1Q1…Y3Q4) that has no active milestone; if all quarters are occupied, defaults to Y1Q1. `Name="New milestone"`, `Goal=""`.

## Identity gating

Consistent with Tasks/Design Doc:
- All add/edit/delete affordances (Tracks button, `⋯` buttons, `＋` buttons, bar drag) `disabled` when `userName` is empty.
- Every write stamps `UpdatedBy: userName`.

## Backend — Apps Script

### `doGet`
Extend the response object:
```js
return ContentService.createTextOutput(JSON.stringify({
  ok: true,
  tasks: readTab("Tasks"),
  team: readTab("Team"),
  characters: readTab("Characters"),
  items: readTab("Items"),
  maps: readTab("Maps"),
  systems: readTab("Systems"),
  ganttTracks: readTab("GanttTracks"),
  ganttBars: readTab("GanttBars"),
  milestones: readTab("Milestones"),
})).setMimeType(ContentService.MimeType.JSON);
```
(Exact field naming to match camelCase conventions already in the response.)

### `handleUpsert` — no change
Already auto-detects the primary-key column from the header row. POSTs to `GanttTracks` / `GanttBars` / `Milestones` Just Work.

### `handleBootstrap` — refactor to generic shape
New envelope (preferred):
```json
{
  "Action": "bootstrap",
  "Tabs": {
    "GanttTracks": [ { ...row... }, ... ],
    "GanttBars":   [ ... ],
    "Milestones":  [ ... ]
  }
}
```

Behavior:
1. Acquire `LockService.getScriptLock()`.
2. For each `<TabName, rows>` entry in `Tabs`:
   - Read the sheet; if its data range (below the header row) is empty, append all `rows` (stamping `CreatedAt` / `UpdatedAt` / `UpdatedBy` per row).
   - If not empty, skip (idempotent — re-running bootstrap is safe).
3. Release lock.

**Legacy-shape compatibility (one release only):** if the body has top-level `Tasks` / `Team` keys (the old shape) instead of `Tabs`, internally remap to `{ Tabs: { Tasks: body.Tasks, Team: body.Team } }` and proceed. This keeps a stale client from hard-failing against a new script during rollout. Remove in the cleanup PR that retires `window.GANTT` + `window.MILESTONES`.

### `apps-script.gs` mirror
Update the in-repo mirror to match exactly. One new deployment version from the Apps Script editor.

## Client — bootstrap & seed

- `data.js` keeps `window.GANTT` and `window.MILESTONES` **for this PR only** — they're the seed source.
- Re-add `bootstrapIfEmpty(response)` in `app.js`:
  - Trigger: post-initial-fetch, if `response.ganttTracks`, `response.ganttBars`, AND `response.milestones` are all empty arrays.
  - Build seed rows from `window.GANTT` (split into one `GanttTracks` row per lane + one `GanttBars` row per bar — assign `TrackId` at seed time) and `window.MILESTONES`.
  - POST `{ Action: "bootstrap", Tabs: { GanttTracks: [...], GanttBars: [...], Milestones: [...] } }`.
  - Refetch on success.
- Seeding is only re-added for the three new tabs; Tasks/Team/Characters/Items/Maps/Systems seeding stays retired (already shipped in `29b31bd`).

## Follow-up cleanup PR (not part of this spec's implementation)

After Jeff confirms the live sheet is populated and the Roadmap tab fully renders from the sheet:
1. Remove `window.GANTT` and `window.MILESTONES` from `data.js`.
2. Remove the bootstrap seed-building path from `app.js` (keep the generic bootstrap envelope — it may be useful for future tabs).
3. Remove the Apps Script legacy-shape compatibility branch in `handleBootstrap`.
4. Update `CLAUDE.md` to state the Roadmap is sheet-sourced.

## Files touched

| File | Change |
|---|---|
| `app.js` | New render paths for tracks/bars/milestones; drag logic; three new modals; re-added generic `bootstrapIfEmpty`; wiring for "Tracks" header button. |
| `styles.css` | Minor — cursor styles for bar hit zones; `.milestone-card` tweaks if needed for `⋯`/`＋` buttons. No new color classes. |
| `index.html` | Add "Tracks" button to the Roadmap tab header. Replace the static Milestones HTML with a container the client fills. |
| `data.js` | No change in this PR (globals retired in the follow-up). |
| `apps-script.gs` | Add three tab reads to `doGet`; refactor `handleBootstrap` to accept generic `Tabs` envelope + legacy compatibility. |
| `CLAUDE.md` | Add the three new sheet tabs to the "Tabs" list. Note the follow-up cleanup under "Known Gotchas" or similar. |

## Acceptance checklist (for Jeff, post-deploy)

- [ ] Open live site with empty three tabs; page bootstraps them from `window.GANTT` + `window.MILESTONES`.
- [ ] Reload: Gantt and Milestones render identically to pre-change.
- [ ] Tracks button → rename a track; reload confirms persistence.
- [ ] Drag a bar: move, resize left, resize right. Clamps at edges. Reload confirms persistence.
- [ ] `⋯` on a bar: change name/color/quarters/delete. All persist.
- [ ] `＋` on a track row: new bar appears at Y1Q1, one quarter wide.
- [ ] Tracks modal add/delete/reorder work.
- [ ] Milestone `⋯`: change quarter/name/goal/delete. Strip and auto-derived Gantt row update together.
- [ ] Milestone `＋`: new milestone defaults to first empty quarter.
- [ ] Identity gate: open the site fresh, do NOT enter a name — all add/edit/delete disabled, drag no-ops.
- [ ] Stamp a write, check sheet directly: `UpdatedBy` and `UpdatedAt` populated.

## Open decisions

None. All five brainstorm items resolved and locked in 2026-04-21.
