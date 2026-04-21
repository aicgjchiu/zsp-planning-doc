# Optimistic UI Everywhere — Design Spec

**Date:** 2026-04-21
**Status:** Approved, ready for implementation planning
**Author:** Jeff (via brainstorm with Claude)
**Depends on:** `2026-04-21-roadmap-editable-design.md` (merged)

## Summary

Make every user-initiated write (Task Board, Design Doc, Team, Tracks, Bars, Milestones) feel instant — UI updates in one frame, the Apps Script POST happens in the background. Applies a "pending" visual to optimistic rows until the POST resolves so users can see when a change is still in flight or has failed. Zero new backend work — this is pure client-side plumbing.

## Motivation

Today every write goes `await pushRow(...); await fetchAll();` which is **two sequential Apps Script round trips** (~1–2 seconds total) before the user sees their change. The Roadmap tab's `roadmap-editable` branch proved the optimistic pattern works well there. This spec generalizes that pattern so the rest of the app feels the same.

## Scope

**In scope**
- Refactor `pushRow` so its existing optimistic patches run **before** the network `await`, not after.
- Add `_pending: true` to optimistically-patched rows; clear it when the POST resolves (success or failure). Renderers honor it with a CSS `.pending` class.
- Convert the ~15–20 hot call sites across Task Board and Design Doc from `await pushRow(...); await fetchAll();` to fire-and-forget `pushRow(...).then(fetchAll)` (no `await`).
- Retrofit the Roadmap branch's hand-rolled optimistic paths (add-bar, modal save/delete, add-milestone) to use the new `pushRow` flow instead of mutating state twice.
- Add three missing `pushRow` optimistic branches for `GanttTracks`, `GanttBars`, `Milestones` (they were skipped during Roadmap work because the handlers did their own mutation).

**Out of scope**
- Rollback on POST failure. Current behavior stays: `alert()` on error, 30-second poll reconciles, ghost change disappears. The new pending visual makes this failure mode more visible, which is sufficient for a 4-person internal tool.
- Parallelizing bulk-save modal loops (Team, Tracks) via `Promise.all`. Separate concern.
- Any UI/layout changes beyond the pending indicator.
- Backend changes. `apps-script.gs` untouched.

## Design

### `pushRow` refactor

Current flow:
```
pushRow(tab, key, fields)
  → pendingWrites++
  → await fetch(...)        ← ~500–1000ms
  → apply optimistic patch to *State
  → pendingWrites--
```

New flow:
```
pushRow(tab, key, fields)
  → apply optimistic patch to *State, stamp _pending: true
  → pendingWrites++
  → fire POST (not awaited)
  → on resolve: clear _pending on that row
  → on reject: clear _pending + alert (existing behavior)
  → pendingWrites--
```

Key properties:
- **Synchronous state mutation.** Every caller sees the patched state on the next `renderX()` call, even if the caller doesn't `await` the return value.
- **`_pending` flag.** Lives on the row in state. Cleared when the per-row POST resolves (success) or rejects (failure — in that case the row will be reverted by the next poll anyway, but we clear immediately so the pending indicator doesn't linger misleadingly).
- **Return value.** `pushRow` still returns a Promise so callers can `.then(fetchAll)` if they want a server-authoritative refresh.
- **Per-tab branches.** Add the three missing ones (`GanttTracks`, `GanttBars`, `Milestones`) with the same shape as existing ones.

Rough implementation shape (conceptual — actual code in plan):
```js
async function pushRow(tab, key, fields){
  applyOptimisticPatch(tab, key, fields, { pending: true });
  pendingWrites++; updateSyncPill();
  try {
    const res = await fetch(SHEET_ENDPOINT, { ...POST body... });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'push failed');
    clearPendingFlag(tab, key);
    lastSyncAt = new Date();
    setSyncStatus('ok');
  } catch(err){
    clearPendingFlag(tab, key);
    setSyncStatus('error');
    alert('Could not save to Google Sheet. Check your connection and try again.\n\n' + err.message);
  } finally {
    pendingWrites--; updateSyncPill();
  }
}
```

`applyOptimisticPatch` and `clearPendingFlag` are small helpers that dispatch on `tab` name — effectively what today's per-tab branches already do, but extracted so both the pre-POST and post-POST paths share them.

### Pending visual

**CSS class:** `.pending` applied to a row/card/bar when its state has `_pending: true`.

**Style** (tentative — tuned in implementation):
```css
.pending {
  outline: 1.5px dashed var(--ink-3);
  outline-offset: -2px;
  opacity: 0.8;
}
```

The dashed outline reads as "in transit, not yet confirmed" without being alarming. It auto-disappears when the POST resolves (state patch clears `_pending`, next render drops the class).

**Where the class is applied** — each render function that produces edit-eligible DOM nodes checks the row's `_pending` and tacks on the class:
- Task Board: task cards (`.task-card.pending`)
- Design Doc: character cards, item rows, map cards, system rows
- Roadmap: Gantt bars (`.gbar.pending`), milestone cards (`.ms.pending`), milestone-row bars on the Gantt, track rows (for when a track was renamed/added and hasn't confirmed)

The `_pending` flag is excluded from normalizer output (i.e., when `fetchAll` re-populates state from the server, the flag gets wiped naturally — no lingering pending marker after a reconcile).

### Call-site conversions

For each hot path, change `await pushRow(x); await fetchAll();` to either:

- **Form A** (fire-and-forget, preferred for single-row writes): `pushRow(x).then(() => fetchAll());` — no `await`. Caller immediately continues (modal closes, focus returns, etc.), state already patched.
- **Form B** (no fetchAll at all, when caller is a background poll or inline dropdown): just `pushRow(x);` — next 30-second poll reconciles. Used for notes debounce (already the case), status dropdowns, and inline edits where a full refetch is wasteful.

Plan will enumerate each call site and pick A or B. High-level inventory:

| Tab | Handler | Current | New |
|---|---|---|---|
| Task Board | status dropdown change | `pushRow().then(fetchAll)` already | B (no fetchAll) |
| Task Board | notes textarea debounce | already optimistic-only | no change |
| Task Board | edit-task modal Save | `await pushRow; fetchAll;` | A |
| Task Board | edit-task modal Delete | `await pushRow; fetchAll;` | A |
| Task Board | column ＋ (add task from member col) | `await pushRow; fetchAll;` | A + auto-open edit modal |
| Task Board | Team modal bulk save | `for await pushRow` loop | A (per row) — see caveat below |
| Design Doc | character ⋯ Save/Delete | `await pushRow; fetchAll;` | A |
| Design Doc | character ＋ | `await pushRow; fetchAll;` | A |
| Design Doc | item ⋯ Save/Delete, item ＋ | same | A |
| Design Doc | map ⋯ Save/Delete, map ＋ | same | A |
| Design Doc | system ⋯ Save/Delete, system ＋ | same | A |
| Roadmap | tracks modal bulk save | `for await pushRow` loop | A (per row) |
| Roadmap | bar add/edit/delete | hand-rolled optimistic | **retrofit** to use new `pushRow` path |
| Roadmap | milestone add/edit/delete | hand-rolled optimistic | **retrofit** to use new `pushRow` path |
| Roadmap | bar drag commit | `await pushRow; await fetchAll;` | A |

### Bulk-save caveat (Team modal, Tracks modal)

These currently do a serial `for (const x of draft) await pushRow(...)`. After the refactor, each `pushRow` patches state immediately, so re-rendering between iterations is free. We can:

1. Keep the sequential loop (simple, handles alerts one-at-a-time) — this spec's choice.
2. Drop the `await` so all N POSTs fire in parallel — faster but floods the Apps Script with concurrent writes and makes error reporting messy.

**Go with 1.** The optimistic patches already make the modal feel instant because the modal closes before any POSTs await. This is a minor speedup that's not worth the extra failure-mode complexity.

### Roadmap retrofit

The `roadmap-editable` branch added hand-rolled optimistic logic directly in the handlers (`ganttBarsState.push(...)`, then `pushRow(...).then(fetchAll)`). Once `pushRow` itself does the patch, this is redundant.

Retrofit pass:
- Add-bar handler: remove the `ganttBarsState.push(...)` + `renderGantt()` lines; rely on `pushRow` to patch state, then just `renderGantt()` after (to pick up the patch) and open the modal. The POST fires in the background.
- Bar edit Save/Delete: same treatment.
- Milestone add/edit/delete: same treatment.

Net result: same behavior, ~20 lines removed, single source of truth for optimistic patches.

## Acceptance criteria

Manual browser checks (same pattern as Roadmap branch):

- [ ] Change a Task Board status dropdown → color/label updates instantly; no visible lag. Card shows dashed pending outline for ~500ms then clears.
- [ ] Edit a task, click Save → modal closes, card updates instantly, brief pending outline.
- [ ] Add a character from the Design Doc ＋ → card appears instantly in the list with pending outline; outline clears when POST resolves.
- [ ] Delete an item → row disappears instantly; if POST fails, alert fires and row reappears within 30s.
- [ ] Drag a Gantt bar → position commits in-memory on release, no snap-back; pending outline during flight.
- [ ] Team modal save with 4 edited members → modal closes instantly; 4 rows show pending outline; outlines clear one at a time as POSTs complete.
- [ ] DevTools → Network tab: simulate offline → make any edit → UI updates + pending outline + alert + red sync pill. Go back online → next 30s poll reconciles and ghost change disappears.
- [ ] No double-apply on roadmap after retrofit: adding a bar doesn't create two rows or any flicker.

## Files touched

| File | Change |
|---|---|
| `app.js` | Refactor `pushRow` (move patch before fetch, add `_pending` stamp + clear, add three missing tab branches). Convert ~15–20 call-site handlers from `await pushRow; fetchAll` to fire-and-forget. Strip the hand-rolled optimistic mutations from the Roadmap handlers. Add `.pending` class toggle in every render function that produces edit-eligible DOM. |
| `styles.css` | One new rule: `.pending { outline + opacity }`. Maybe a second rule to tune how the dashed outline renders on inline table rows (Items, Systems) vs cards. |
| `CLAUDE.md` | One line in "Known Gotchas" or a new "Conventions" note: "Writes are fully optimistic. If a POST fails, the `alert()` + sync pill are the only signals; UI reconciles on the next 30-second poll." |
| `apps-script.gs` | No change. |
| `data.js` | No change. |

## Out-of-spec follow-ups

- If the pending indicator feels noisy in practice, consider delaying its appearance by 200–300ms so quick POSTs don't flash it at all.
- If a lot of writes land in rapid succession, consider coalescing pending fetchAlls (debounce fetchAll to once per 500ms) so the server isn't hit N times in parallel.
- Parallelized bulk-save via `Promise.all` with per-row error aggregation — only worth doing if Team/Tracks modal saves feel slow after this ships.

## Open decisions

None. All resolved in 2026-04-21 brainstorm.
