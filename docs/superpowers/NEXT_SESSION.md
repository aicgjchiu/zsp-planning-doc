# Next Session — Pickup List

## Status snapshot (2026-04-21)

- **Task 2 (cleanup PR): DONE.** Commit `29b31bd` on `main`, pushed. `window.TASKS / CHARACTERS / ITEMS / MAPS / SYSTEMS` retired from `data.js`; `legacyTaskId`, `LEGACY_COL_TO_MEMBER`, `SEED_TEAM`, `bootstrapIfEmpty` removed from `app.js`; CLAUDE.md updated. Jeff still needs to run the verification checklist (password gate, all 4 tabs render, edit/add/delete a record) on the live site.
- **Task 1 (Roadmap editing): IN PROGRESS — brainstorm mid-flight.** Decisions locked in below. Still need to cover track-management UX, milestone edit UX, seeding/migration, apps-script change, then write the spec file.

---

## Roadmap editing — decisions locked in

### Scope (Q1)
**B — Gantt + Milestones editable.** Phases table and Quarter-by-quarter table stay static (HTML + `window.PHASES` in `data.js`).

### Gantt bar edit UX (Q2)
**C — Hybrid.** Drag for position/span, modal for name/color/delete, `＋` button per track to add a new bar. Identity-gated like everything else.

### Track management (Q3)
**B — Tracks editable, separate from Team tab.** Not pulled from team roster. Gantt track is its own concept (could be "Audio", "Narrative" later).

### Schema (Q4)
**A — Flat rows.** Three new sheet tabs:

| Tab | Headers (in order) |
|---|---|
| `GanttTracks` | `TrackId \| Name \| Role \| Order \| Hidden \| SortOrder \| CreatedAt \| UpdatedAt \| UpdatedBy` |
| `GanttBars` | `BarId \| TrackId \| Name \| Start \| End \| Color \| Hidden \| SortOrder \| CreatedAt \| UpdatedAt \| UpdatedBy` |
| `Milestones` | `MilestoneId \| Quarter \| Name \| Goal \| Hidden \| SortOrder \| CreatedAt \| UpdatedAt \| UpdatedBy` |

`Start`/`End` are 0-based quarter indices (0 = Y1Q1, 12 = end of Y3Q4). `Quarter` on Milestones is the "Y1 Q2" string — client parses to an index to place the auto-derived milestone bar on the Gantt.

### Milestones-in-Gantt (proposed in design, user approved "so far so good")
**Auto-derived.** The old "Milestones" row in `window.GANTT` goes away. The Gantt renders a read-only bottom row, one single-quarter bar per row in `milestonesState`. No drag, no ⋯ on those bars — edit via the Milestones strip below the Gantt.

### Gantt bar edit UX — detail (approved "looks good")

**Drag mechanics** on user tracks only:
- Hit zones: first 8px from left = resize-start, last 8px from right = resize-end, middle = move. Cursor updates to signal zone.
- Snap: each column is 120px. `deltaX / 120` rounded → quarter delta. DOM updates live during drag.
- Clamps: `Start >= 0`, `End <= 12`, minimum span 1 quarter.
- Commit on `pointerup`: optimistic POST `{Tab:"GanttBars", Key:BarId, Fields:{Start,End}}`. On server failure, revert.
- Identity gate: pointer handlers no-op when `userName` is empty.

**Modal (`⋯` on a bar):** Name, Color dropdown (`portal / code / char / env / vfx / milestone`), Start/End quarter dropdowns (keyboard/precise fallback for drag), Delete button (soft-delete).

**Add (`＋` at end of each track row):** creates a `Start=0, End=1` "New bar", user drags to final position.

---

## Still to cover in the brainstorm

Ask these one at a time next session, then write the spec:

1. **Track management UX.** Recommend a "Tracks" button in the Roadmap header opens a modal listing all tracks with inline rename / Role dropdown / Order arrows / Delete — same pattern as the Team button. Add-track button at the bottom. Need Jeff's confirm.
2. **Milestone edit UX.** Recommend `⋯` on each milestone card opens a modal with Quarter dropdown (Y1Q1 … Y3Q4), Name, Goal, Delete. `＋` button at the end of the strip to add.
3. **Seeding / migration.** We just deleted `bootstrapIfEmpty` in commit `29b31bd`. Options:
   - **(a)** Re-add a minimal bootstrap that only handles the three new tabs, seeded from `window.GANTT` + `window.MILESTONES`. Retire those globals in a follow-up cleanup PR.
   - **(b)** Jeff manually pastes rows into the three new sheet tabs on first deploy. No client-side seed path.
   - Recommend **(a)** for symmetry with how the other tabs migrated.
4. **Apps Script change.** Add three constants + three lines in `doGet`'s return object. `handleUpsert` already auto-detects the key column from the header row, so no per-tab branching. One-line change to `apps-script.gs` + redeploy from the Apps Script editor.
5. **Color consistency.** Existing Gantt uses six color keys (`portal / code / char / env / vfx / milestone`) that map to CSS classes `.gbar.portal` etc. — unchanged. Modal's Color dropdown offers all six.

After those five land, write the spec to `docs/superpowers/specs/2026-04-21-roadmap-editable-design.md`, user reviews, then transition to writing-plans skill.

---

## Memory pointers

- User: Jeff, solo programmer on ZSP (team of 4: Jeff/Christie/Tachi/Jason).
- ZSP game itself lives in a separate Perforce depot in Unreal 5.7, NOT in this repo.
- Conventions: small trusted team, fully open edits with `UpdatedBy` audit trail, soft delete only, monospace + `--line` / `--ink-*` CSS tokens, identity-gated affordances.
- Precedents to reuse: Task Board spec `docs/superpowers/specs/2026-04-20-task-board-editable-design.md` and Design Doc spec `docs/superpowers/specs/2026-04-20-design-doc-editable-design.md`. Modal pattern, `pushRow`, optimistic write then refetch, section-add `＋` button styling.
