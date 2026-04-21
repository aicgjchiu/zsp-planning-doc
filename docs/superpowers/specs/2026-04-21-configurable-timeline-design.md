# Configurable Timeline + Editable Quarter Plan — Design Spec

**Date:** 2026-04-21
**Status:** Approved, ready for implementation planning
**Author:** Jeff (via brainstorm with Claude)
**Depends on:** Roadmap editable (merged), optimistic UI (merged)

## Summary

Two coupled changes to the Roadmap tab:

1. **Timeline length becomes configurable** via a new `Timeline` sheet tab. `TotalYears` drives every piece of UI that currently hard-codes 12 quarters — Gantt grid, quarter headers, bar Start/End clamps, milestone quarter dropdown, quarter-plan row count.
2. **The Quarter-by-quarter shipping plan table** (currently a static 12-row `<table>` in `index.html`) becomes a sheet-sourced editable section, with a new `QuarterPlan` tab + ⋯-per-row modal following the same pattern as the rest of the Design Doc.

## Scope

**In scope**
- New `Timeline` sheet tab (singleton config row) + `doGet` extension to return it.
- New `QuarterPlan` sheet tab with fixed 4-role-column schema.
- Client-side `timelineState` + `quarterPlanState`; `totalQuarters = TotalYears * 4` derived everywhere.
- Dynamic Gantt grid-column count (current `repeat(12, 120px)` becomes `repeat(totalQuarters, 120px)`).
- Dynamic quarter-header loop.
- Dynamic Start/End clamps on bar drag, bar modal, milestone quarter dropdown.
- Out-of-range filter with `console.warn` (bars / milestones beyond the current `TotalYears`).
- New `renderQuarterPlan()` + row-edit modal.
- Small "Timeline" chip + modal in the Roadmap header.
- `bootstrapIfEmpty` seeds both new tabs from `window.QUARTER_PLAN` (migrated from the static HTML) and a default `{ Key: "config", TotalYears: 3 }`.

**Out of scope**
- Absolute calendar years (`StartYear`, `StartQuarter`, etc.). Relative `Y1 Q1`-style labels stay.
- Clipping partial-overflow bars (filtered entirely instead).
- Validation on `TotalYears` reduction (unlikely — it'll only grow in practice).
- Retiring `window.QUARTER_PLAN` from `data.js`. Follow-up cleanup PR, same pattern as the `GANTT` / `MILESTONES` retirement.
- Per-role dynamic columns in the Quarter plan. Schema is fixed at 4 roles (Programmer / Char / Env / VFX); a 5th role would require a schema migration.

## Sheet schema — two new tabs

### `Timeline`

Singleton config row. Primary key is `Key` (first column, per repo convention).

| Column | Notes |
|---|---|
| `Key` | Always `"config"` for v1. Allows future singleton keys if needed. |
| `TotalYears` | Integer ≥ 1. Default 3 if sheet empty. |
| `UpdatedAt` / `UpdatedBy` | Stamped by Apps Script. |

### `QuarterPlan`

One row per quarter. Rows are derived from `TotalYears` — `renderQuarterPlan` generates display slots for all quarters and matches them against sheet rows by `QuarterId`.

| Column | Notes |
|---|---|
| `QuarterId` | Primary key. **Deterministic**: `qp-y1q1`, `qp-y2q3`, etc. Upserts always hit the right row regardless of row order in the sheet. |
| `Quarter` | `"Y1 Q1"`-style string. Redundant with `QuarterId` but human-readable for inspecting the sheet. |
| `ProgrammerPlan` | Multiline text. What the programmer ships that quarter. |
| `CharPlan` | Multiline text. Character art. |
| `EnvPlan` | Multiline text. Environment / concept. |
| `VfxPlan` | Multiline text. VFX / rigging. |
| `Gate` | Multiline text. End-of-quarter gate / milestone marker. Bold milestone markers (e.g., `**M1 · First Portal Activate**`) are preserved as plain text — no markdown rendering. |
| `Hidden` | Reserved; unused in v1. |
| `SortOrder` | Reserved; unused in v1 (rendering order is derived from `QuarterId`). |
| `CreatedAt` / `UpdatedAt` / `UpdatedBy` | Standard. |

Rows with no matching sheet entry render as empty placeholders. Saving a partially-filled row upserts it.

## Rendering

### Module state additions

```js
let timelineState    = { TotalYears: 3 }; // default fallback
let quarterPlanState = [];
```

`fetchAll` populates both from the `doGet` response. `TotalYears` is coerced to a positive integer; invalid / missing values fall back to 3 with a `console.warn`.

### `totalQuarters` derived constant

Computed at the top of any function that needs it:
```js
const totalYears    = Math.max(1, Number(timelineState.TotalYears) || 3);
const totalQuarters = totalYears * 4;
```

Replaces hardcoded `12` in:
- Gantt header loop (`for (let y=1; y<=totalYears; y++)`).
- `.gantt-header` and `.gantt-row` `grid-template-columns` (via a CSS custom property set on each container).
- Bar drag clamps (`End <= totalQuarters`).
- Bar modal Start/End dropdowns (Y1 Q1 … Y{totalYears} Q4).
- Milestone modal Quarter dropdown (same range).
- Milestone auto-derived Gantt row bar placement (`parseQuarter` returns a value < `totalQuarters`, else skip).
- Quarter-plan row count.

### Gantt grid column count — dynamic

Two ways to wire the grid to `totalQuarters`:

**Preferred:** CSS custom property.
```css
.gantt-header,
.gantt-row {
  grid-template-columns: 240px repeat(var(--total-quarters, 12), 120px);
}
```
In `renderGantt`, before the first `innerHTML`, set:
```js
host.style.setProperty('--total-quarters', totalQuarters);
```
This is browser-supported (Chrome, Firefox, Safari, Edge all allow `var()` inside `repeat()`).

**Fallback if a browser regression surfaces:** set `grid-template-columns` inline on each row element during render. More verbose but universally supported.

Minimum Gantt scroll width scales automatically: `240 + totalQuarters * 120`.

### Out-of-range behavior (Q3-B)

When rendering Gantt / Milestones:
- **User-track bars:** filter out any bar with `Number(b.Start) >= totalQuarters`. For bars that partially overflow (`b.End > totalQuarters`), skip entirely (simpler than clipping; bars going past the end indicate stale data anyway).
- **Milestones:** filter out any milestone where `parseQuarter(m.Quarter) >= totalQuarters`.
- For each skipped row, emit exactly one `console.warn` per render cycle: `[timeline] skipped Bar <BarId>: extends past Y<TotalYears> Q4` / similar for milestones.

This is defensive — per Jeff, `TotalYears` realistically only grows.

### Quarter plan rendering

- `index.html`: replace the static `<table class="sheet">...</table>` inside the Quarter-by-quarter section with `<div id="quarter-plan"></div>`.
- `renderQuarterPlan()` generates one row per quarter (Y1 Q1 → Y{totalYears} Q4) regardless of sheet population:

```js
function renderQuarterPlan() {
  const host = qs('#quarter-plan');
  if (!host) return;
  const canEdit = !!userName;
  const gateAttr = canEdit ? '' : 'disabled title="Set your name first"';
  const totalYears = Math.max(1, Number(timelineState.TotalYears) || 3);

  const byId = new Map(quarterPlanState.map(r => [r.QuarterId, r]));

  let html = `<table class="sheet">
    <thead><tr>
      <th style="width:70px">Quarter</th>
      <th>Programmer — Code</th>
      <th>Character Artist</th>
      <th>Environment / Concept</th>
      <th>VFX &amp; Rigging</th>
      <th style="width:140px">End-of-quarter gate</th>
      <th style="width:40px"></th>
    </tr></thead><tbody>`;

  for (let y = 1; y <= totalYears; y++) for (let q = 1; q <= 4; q++) {
    const quarterLabel = `Y${y} Q${q}`;
    const qid = `qp-y${y}q${q}`;
    const row = byId.get(qid);
    const placeholder = `<span class="dim small">Click ⋯ to plan</span>`;
    html += `<tr${row && row._pending ? ' class="pending"' : ''}>
      <td class="mono">${quarterLabel}</td>
      <td>${row ? escapeHtml(row.ProgrammerPlan || '') : placeholder}</td>
      <td>${row ? escapeHtml(row.CharPlan       || '') : ''}</td>
      <td>${row ? escapeHtml(row.EnvPlan        || '') : ''}</td>
      <td>${row ? escapeHtml(row.VfxPlan        || '') : ''}</td>
      <td>${row ? escapeHtml(row.Gate           || '') : ''}</td>
      <td><button class="row-menu-btn" data-qp-id="${qid}" ${gateAttr || 'title="Edit quarter"'}>⋯</button></td>
    </tr>`;
  }
  html += `</tbody></table>`;
  host.innerHTML = html;

  qsa('.row-menu-btn', host).forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      openQuarterPlanModal(btn.getAttribute('data-qp-id'));
    });
  });
}
```

### Quarter plan edit modal

- `openQuarterPlanModal(qid)` opens a modal with the quarter label as heading + five multi-line textareas (Programmer, Char, Env, VFX, Gate). No Delete button — rows are derived from timeline, not user-deletable.
- On Save: optimistic `pushRow('QuarterPlan', qid, { Quarter, ProgrammerPlan, CharPlan, EnvPlan, VfxPlan, Gate })` → `renderQuarterPlan()` → `p.then(fetchIfIdle)`.
- `Quarter` label (e.g., `"Y1 Q1"`) is included in the patch so the sheet is human-readable; client never edits it.

### Timeline chip + modal

Small "Timeline · 3y" chip in the Roadmap tab header, next to the existing Tracks button:

```html
<button class="reset-btn" id="timeline-btn" title="Configure timeline length">Timeline · <span id="timeline-years">3</span>y</button>
```

Clicking opens a tiny modal with one `<input type="number" min="1" max="10">` field + Save/Cancel. Identity-gated.

On Save: `pushRow('Timeline', 'config', { TotalYears: N })` → optimistic patch updates `timelineState` → re-render Gantt + Milestones + QuarterPlan + chip label → `p.then(fetchIfIdle)`.

The chip label (`#timeline-years`) updates on every `renderGantt` / `renderQuarterPlan` invocation so it always reflects current state.

## Identity gating

- Timeline chip: disabled when `userName` empty (click-time gate: `alert('Set your name first')`).
- QuarterPlan row ⋯: disabled attr on button when `!userName`, matching the existing Design Doc pattern.

## Backend — Apps Script

### Constants + `doGet`

Add two constants + two reads:
```js
const TIMELINE_SHEET     = 'Timeline';
const QUARTER_PLAN_SHEET = 'QuarterPlan';

// Inside doGet's return:
timeline:     readTab(ss.getSheetByName(TIMELINE_SHEET))[0] || null,
quarterPlan:  readTab(ss.getSheetByName(QUARTER_PLAN_SHEET)),
```

`timeline` is singular — take first row or null. Client defaults to `{ TotalYears: 3 }` on null.

### `handleUpsert` — no change

Auto-detects primary key from header row. `Timeline`'s `Key` column and `QuarterPlan`'s `QuarterId` column both work without per-tab branching.

### `handleBootstrap` — no change

Already accepts the generic `Tabs` envelope. Client adds `Timeline` and `QuarterPlan` to the seed payload on first load.

## Client — bootstrap seed

In `bootstrapIfEmpty`, add seed-building for the two new tabs when both are empty:

```js
// Seed Timeline (singleton)
const timeline = [{ Key: 'config', TotalYears: 3 }];

// Seed QuarterPlan from window.QUARTER_PLAN (12 rows migrated from old HTML)
const quarterPlan = (window.QUARTER_PLAN || []).map(r => ({
  QuarterId: r.QuarterId,   // e.g., 'qp-y1q1'
  Quarter:   r.Quarter,     // e.g., 'Y1 Q1'
  ProgrammerPlan: r.programmer || '',
  CharPlan:       r.char       || '',
  EnvPlan:        r.env        || '',
  VfxPlan:        r.vfx        || '',
  Gate:           r.gate       || '',
  Hidden: false,
  SortOrder: 0,
}));
```

New `data.js` export:
```js
window.QUARTER_PLAN = [
  { QuarterId: 'qp-y1q1', Quarter: 'Y1 Q1',
    programmer: 'Portal actor + Activate channel; random spawn manager; AI target-switch.',
    char: 'Daoshi 道士 retopo + UV + bakes.',
    env:  'NightMarket 夜市 concept art (6 keyframes).',
    vfx:  'Daoshi rig + retarget; talisman VFX first pass.',
    gate: 'Internal demo: find Portal in NightMarket 夜市 block-out.' },
  // ... one entry per existing static HTML row, verbatim
];
```

Guard: `bootstrapIfEmpty` only seeds these two tabs when `timelineState` is null/default AND `quarterPlanState` is empty. Already-bootstrapped tabs aren't re-seeded (idempotent).

## Optimistic patch branches

Add to `applyOptimisticPatch` and `clearPendingFlag`:

- `Timeline`: state is an object, not an array — special-case. Merge patch into `timelineState`; no `_pending` flag strictly necessary (singleton change isn't rendered inline like a row), but set it so the chip can show a pending visual if desired. Clear on resolve.
- `QuarterPlan`: array state, primary key `QuarterId`. Same branch shape as Tasks / Characters / etc.

## Follow-up cleanup (not in this spec's PR)

After Jeff confirms live sheet populates correctly and the Quarter plan renders identically to pre-change:
1. Remove `window.QUARTER_PLAN` from `data.js`.
2. Remove the QuarterPlan seed-build path from `bootstrapIfEmpty`.
3. Update CLAUDE.md pending-cleanup note.

Same cadence as the prior `window.GANTT` / `window.MILESTONES` retirement PR (which is itself still pending — can be bundled together).

## Files touched

| File | Change |
|---|---|
| `app.js` | `timelineState` + `quarterPlanState` + normalizers; `totalQuarters` derived; `fetchAll` populates both; `bootstrapIfEmpty` seeds them; `renderGantt` header/clamps use dynamic count + sets `--total-quarters` CSS var; `renderQuarterPlan` added; `openQuarterPlanModal` added; Timeline chip + modal wired; `applyOptimisticPatch` + `clearPendingFlag` gain Timeline + QuarterPlan branches; milestone + bar dropdowns regenerated for dynamic range. |
| `index.html` | Replace static Quarter-plan `<table>` with `<div id="quarter-plan">`; add `#timeline-btn` chip to Roadmap header. |
| `styles.css` | `.gantt-header` / `.gantt-row` `grid-template-columns` uses `var(--total-quarters, 12)`. No other changes — `.pending` + existing table styles already cover the new UI. |
| `data.js` | Add `window.QUARTER_PLAN` with 12 rows migrated verbatim from the static HTML table. |
| `apps-script.gs` | Two new constants + two new reads in `doGet`. |
| `CLAUDE.md` | Add `Timeline` and `QuarterPlan` to the tabs list; note Timeline chip + QuarterPlan ⋯-modal in "When Editing"; add Timeline/QuarterPlan to the pending-cleanup note. |

## Acceptance checklist (for Jeff, post-deploy)

- [ ] Open live site; `Timeline` and `QuarterPlan` tabs bootstrap if empty. Gantt renders 12 quarters (TotalYears=3 default). Quarter-plan table renders with all 12 rows matching the old static content.
- [ ] Click Timeline chip → shows `3` → change to `4` → Save. Gantt grid expands to 16 columns; milestone dropdown offers Y1…Y4; quarter-plan table adds 4 empty rows. Chip label updates to "Timeline · 4y".
- [ ] Click ⋯ on any quarter plan row. Modal opens with five textareas. Edit Programmer cell → Save. Row updates instantly with pending outline; outline clears when POST resolves. Sheet has the row.
- [ ] Click ⋯ on an empty row (e.g., a newly-added Y4 Q1 after the timeline expansion). Save with a single field filled. Row appears in sheet with the correct `QuarterId = qp-y4q1`.
- [ ] Bar drag clamps extend to the new far edge (e.g., Y4 Q4 with TotalYears=4).
- [ ] Milestone modal offers all Y4 quarters after timeline expansion. Add a milestone at Y4 Q2 → appears on Gantt and strip.
- [ ] Shrink TotalYears from 4 → 3: any bar with Start ≥ 12 disappears from Gantt; `console.warn` printed; row still present in sheet. Expand back to 4: bar reappears.
- [ ] Identity gate: without user name set, Timeline chip and all quarter-plan ⋯ buttons are disabled.
- [ ] Sheet rows have `UpdatedBy` / `UpdatedAt` stamped on every write.

## Open decisions

None. All resolved in 2026-04-21 brainstorm.
