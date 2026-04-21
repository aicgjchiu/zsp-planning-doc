# Next Session — Pickup List

Two work items queued up. Either can be done first; they're independent.

---

## 1. Roadmap / Gantt editing

**Goal:** Make the Roadmap tab (Gantt + Quarter-by-Quarter table + Milestones) editable from the UI, same pattern as Task Board + Design Doc.

**Status:** Deferred during the original Task Board brainstorm. No spec yet — start from brainstorming skill.

### Current state

- Gantt data lives in `window.GANTT` in `data.js`. Each entry is `{ who, role, bars: [{ name, start, end, color }] }` where `start`/`end` are quarter indices 0–11 (Y1Q1 → Y3Q4).
- Phases in `window.PHASES` (1–6 with name, quarters, goal, color).
- Milestones in `window.MILESTONES` (quarter + name + goal).
- Quarter-by-quarter shipping plan is **hardcoded HTML in `index.html`** (12 `<tr>` rows, lines ~139–203) — not data-driven. This was a deliberate design-doc-style table.

### Open questions for brainstorm

1. **Scope** — all three Roadmap artifacts (Gantt bars, Phases, Milestones, Quarter table) or just the Gantt?
2. **Gantt bar editing UX** — drag-and-drop to move bars across quarters, or modal with start/end/color dropdowns? Drag is fancier but 3× the code.
3. **Track (row) management** — add/rename/remove tracks (rows in the Gantt)? Today they're tied to the 4-role team composition (`code` / `char` / `env` / `vfx`). Should Gantt tracks map to team members (pull from `Team` tab), or stay separate?
4. **Quarter table** — either convert to data-driven rendering (new sheet tab, or derive from Gantt + per-quarter deliverables), or leave it as static HTML (drops editability for that one table; simpler).
5. **Schema design** — probably one `Gantt` tab (rows of bars), one `Milestones` tab, and `Phases` stays static (it's a 6-row reference, not something you'd edit often).

### Recommended approach when picking up

- Start fresh: invoke `superpowers:brainstorming` skill.
- The Task Board + Design Doc specs establish strong precedent for schema conventions, modal UX, seed-then-retire migration. Reuse those patterns heavily — don't re-brainstorm things we already decided (sheet-as-backend, soft delete, fully open permissions, immediate refetch, identity gating).
- The Quarter table question is the real design decision worth spending time on.

### Reference

- Task Board spec: `docs/superpowers/specs/2026-04-20-task-board-editable-design.md`
- Design Doc spec: `docs/superpowers/specs/2026-04-20-design-doc-editable-design.md`
- Both patterns live in `app.js` now — render-from-state, modal with `openModal`/`closeModal`, `pushRow(tab, key, fields)` envelope, optimistic update in `pushRow`.

---

## 2. Cleanup PR — retire `data.js` globals

**Goal:** Remove dead weight from `data.js` now that the sheet is source of truth for tasks + characters + items + maps + systems.

**Status:** Fully specced; just needs execution. Single small PR.

### What to delete

From `data.js`:
- `window.TASKS` (replaced by Tasks tab; consumed once during original migration)
- `window.CHARACTERS` (replaced by Characters tab)
- `window.ITEMS` (replaced by Items tab)
- `window.MAPS` (replaced by Maps tab)
- `window.SYSTEMS` (replaced by Systems tab)

From `app.js`:
- `legacyTaskId()` function (only used during seeding; no longer referenced anywhere)
- The seed blocks inside `bootstrapIfEmpty()` that build from `window.*` globals — if those globals are gone, bootstrap has nothing to seed from, so the whole function body can be reduced to a warning message telling the user their sheet is empty and needs manual seeding (or we just remove bootstrap entirely; it's never going to run again on a populated sheet).
- `LEGACY_COL_TO_MEMBER` constant (only used by `legacyTaskId` and seed logic).

From `CLAUDE.md`:
- Update the `data.js` description in the Files table — it now only holds `window.GANTT`, `window.PHASES`, `window.MILESTONES`.
- Remove the "When Editing" bullet that says to edit `window.TASKS` or `window.CHARACTERS` etc. as seed-only — those globals are gone.
- The Task IDs subsection's "seeded tasks use legacy ID" wording stays accurate for historical rows but can be noted as "one-time legacy format preserved from migration."

### Keep

- `window.GANTT`, `window.PHASES`, `window.MILESTONES` — still read by the Roadmap tab until item #1 above migrates them.

### Verification checklist

After deletion, load the site and confirm:
1. Password gate still works.
2. Task Board renders all tasks from the sheet.
3. Design Doc tab renders all 4 sections from the sheet.
4. Roadmap tab still renders correctly (Gantt + Phases + Milestones + quarter table all unchanged).
5. Console has no `ReferenceError` or undefined warnings.
6. Open an existing task / character / item / map / system and save an edit — still writes to the sheet.
7. Add a brand-new record via ＋ — still works.
8. Delete a record via ⋯ → Delete — still works.

### Suggested commit sequence

1. Remove `window.TASKS` + `legacyTaskId` + `LEGACY_COL_TO_MEMBER` — one commit.
2. Remove `window.CHARACTERS` / `ITEMS` / `MAPS` / `SYSTEMS` — one commit (they're unrelated chunks of `data.js`).
3. Simplify `bootstrapIfEmpty()` or remove it — one commit.
4. Update `CLAUDE.md` — one commit.
5. Push + verify on live site.

Can probably be a single subagent dispatch; the edits are all localized.

---

## Memory pointers

- User: Jeff, solo programmer on ZSP (team of 4: Jeff/Christie/Tachi/Jason).
- ZSP game itself lives in a separate Perforce depot in Unreal 5.7, NOT in this repo.
- This repo is `zsp-planning-doc` — GitHub Pages + Google Apps Script backend. Password: stored in the Config tab of the Google Sheet.
- Conventions: small trusted team, fully open edits with `UpdatedBy` audit trail, soft delete only, monospace + `--line` / `--ink-*` CSS tokens throughout.
