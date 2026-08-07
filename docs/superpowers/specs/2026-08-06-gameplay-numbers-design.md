# Gameplay & Numbers section (Map 1 focus) — Design

**Date:** 2026-08-06
**Status:** Approved
**Related:** Systems rows "Core Loop" / "Player Portal" / "Enemy Portal" (the pacing skeleton this formalizes); the Maps row `hamlet` (NightMarket 夜市, the scope of this pass). As-built numbers are being requested from the game-repo session「遊戲設計文檔更新」(ZSP 5.7) and reconciled after landing.

## Problem

The Design Doc describes *what* the systems are but carries no numbers: no enemy stats, no TTK targets, no pacing parameters, and no answer to "how long is one run?". The run-length skeleton is already implied by existing content (Portal 5-minute CD, 5s Activate channel, leave-or-farm-5-minutes choice, maps ordered Run 1→4+), but it lives scattered in Systems notes and is never computed into an actual prediction.

Scope decisions made during brainstorming:

- The steppe (`map4`) endless mode is the *temporary* run-end rule; this pass focuses **only on Map 1 (NightMarket 夜市)** — its enemies, pacing parameters, and segment-length model. Later maps add rows, not schema.
- Content gets a **new dedicated Design Doc section** backed by new sheet tabs (approach B), not stuffed into existing columns.

## Decision

Add a **"Gameplay & Numbers"** section to the Design Doc tab, backed by two new sheet tabs — `Enemies` (one row per enemy) and `Gameplay` (one row per named parameter) — plus a read-only **run-segment-length banner** computed live from `Gameplay` parameter rows. Every number carries a `Basis` of `target` (designer-proposed) or `as-built` (verified against the UE 5.7 project), rendered as differently colored chips so unverified numbers are visible at a glance.

## Changes

### Sheet — two new tabs

**`Enemies`** headers (row 1, in order):
`Id | Name | Map | Tier | HP | Damage | MoveSpeed | SpawnWeight | Behavior | Basis | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`

- `Map` is a map id from the Maps tab (`hamlet` for this pass). `Tier` is `trash / elite / boss`. `Damage` is free text (`10/hit`, `8/s aura`) — attack shapes vary too much for one number. `SpawnWeight` is the relative weight among the map's trash roster (blank for bosses). `Basis` works exactly as on `Gameplay` (`target` / `as-built`).
- Row ids: `en-<slug>` (e.g. `en-jiangshi`).

**`Gameplay`** headers (row 1, in order):
`Id | Section | Name | Value | Unit | Basis | Notes | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`

- `Section` groups rows in the UI: `Pacing / Combat / Economy`. `Basis` is `target` or `as-built`. `Value` is numeric wherever the model consumes it.
- Row ids: `gp-<slug>`. The model consumes fixed well-known ids (below).

Both tabs follow the first-column-primary-key convention, so `handleUpsert` works with no backend branching.

### Backend — `apps-script.gs`

- Two new sheet-name consts (`ENEMIES_SHEET`, `GAMEPLAY_SHEET`) and two new lines in `doGet` (`enemies:`, `gameplay:`).
- Requires a new Apps Script deployment version (user action in the editor — code cannot self-deploy).
- CLAUDE.md gains the two tab-header bullets.

### Frontend — `index.html` + `app.js` + `styles.css`

New section on the Design Doc tab, placed **after Maps, before Systems**, titled "Gameplay & Numbers · NightMarket 夜市". Three blocks:

1. **Run-segment banner** (read-only, derived). Computes from `Gameplay` rows:
   - `expected = max(find, cd) + activate + farmRate×farmLen + bossRate×bossLen`
   - `min = max(find, cd) + activate` (leave at first opportunity, no boss)
   - `max = max(find, cd) + activate + farmLen + bossLen` (farm + boss both happen)
   - Well-known ids: `gp-find-portal`, `gp-portal-cd`, `gp-activate`, `gp-farm-rate`, `gp-farm-len`, `gp-boss-rate`, `gp-boss-len`. If any is missing/non-numeric, the banner renders "model missing: <ids>" instead of computing.
   - Shows min–max range, the expected value, and a horizontal breakdown bar (portal floor / farm share / boss share).
2. **Gameplay parameter table**, grouped by `Section`, with the existing editing idiom: `⋯` per row opens an edit modal (Section select, Name, Value, Unit, Basis select, Notes, Delete), `＋` in the block header adds a row. `Basis` renders as a chip: `target` amber, `as-built` green.
3. **Enemies table**, filtered to rows whose `Map` exists in the Maps tab, grouped per map (only `hamlet` has rows for now). Same `⋯` / `＋` editing idiom (Name, Map select, Tier select, HP, Damage, MoveSpeed, SpawnWeight, Behavior, Basis select, Delete), with the same Basis chip in the table. Boss rows get the same visual set-apart treatment as `ult-row` (top separator + neutral tint).

All writes go through the existing `pushRow` path: optimistic, `_pending` dashed outline, refetch after settle.

### Content — initial rows (all `Basis=target` until reconciled)

**Enemies (NightMarket 夜市):**

| Id | Name | Tier | HP | Damage | MoveSpeed | SpawnWeight | Behavior |
|---|---|---|---|---|---|---|---|
| en-jiangshi | Jiangshi 殭屍 | trash | 100 | 10/hit | 250 (hop bursts) | 60 | Hops toward nearest player in straight lines; short lunge attacks; blocks alleys in groups |
| en-yao | Yao 狐妖 | trash | 70 | 8/bolt (ranged) | 400 | 25 | Keeps 8–12m distance, fires spirit bolts, repositions after 2 shots |
| en-blackdog | Black Dog 黑狗 | trash | 40 | 6/bite | 550 | 15 | Pack rusher; sprints and leaps; punishes players who stand still channeling |
| en-corpse-general | Corpse General 屍將軍 | boss | 4000 | 25/slam | 300 | — | Summons Jiangshi waves at 75%/50%/25% HP; slam telegraphed 1s; enrages +20% at final wave |

**Gameplay parameters:**

| Id | Section | Name | Value | Unit | Notes |
|---|---|---|---|---|---|
| gp-find-portal | Pacing | Find Portal time | 75 | s | 250m map, random Portal spawn; tutorial-friendly sightlines |
| gp-portal-cd | Pacing | Portal hop cooldown | 300 | s | From Systems "Player Portal" note (5-minute CD) |
| gp-activate | Pacing | Activate channel | 5 | s | From Systems "Core Loop" note |
| gp-farm-rate | Pacing | Teams choosing to farm | 0.5 | ratio | Assumption for the expected-value model; revisit with playtests |
| gp-farm-len | Pacing | Farm extension length | 300 | s | "farm 5 more minutes" from Core Loop |
| gp-boss-rate | Pacing | Boss-triggered rate | 0.4 | ratio | 屍將軍 summoned when Enemy Portal crosses its boss threshold; mostly hit by farming teams |
| gp-boss-len | Pacing | Boss fight length | 120 | s | Target TTK for 屍將軍 with 1–2 players at map-1 power |
| gp-ttk-jiangshi | Combat | TTK: Jiangshi | 2 | s | Tutorial pacing; ~2 Daoshi hits + a talisman tick |
| gp-ttk-yao | Combat | TTK: Yao 狐妖 | 2.5 | s | Mobile target, dies to one committed rotation |
| gp-ttk-blackdog | Combat | TTK: Black Dog | 1 | s | Fragile; threat is speed, not HP |
| gp-revive-cd | Combat | Revive CD ladder | 8/16/30/60 | s | From Systems "Revive (stacking CD)" note (text value; not consumed by the model) |

Banner output with these values: min `305s ≈ 5.1min`, expected `305 + 150 + 48 = 503s ≈ 8.4min`, max `725s ≈ 12.1min` — **NightMarket segment: ~5–12 minutes, typically ~8.5**.

`Economy` ships as an empty group (the `＋` button makes it reachable); XP/vote-upgrade cadence rows get added during reconciliation, sourced from the game repo rather than invented here.

### Reconciliation with the game repo (follow-up, not this implementation)

A data request is already queued to the「遊戲設計文檔更新」session (player stats, ability numbers, enemy stats, Enemy Portal thresholds, wave cadence, upgrade cards, XP curve, item numbers, with source files). When it replies:
- Values that exist in code → update the row, flip `Basis` to `as-built`.
- Conflicts between as-built and target → listed for the user to arbitrate, not silently overwritten.
- Player/ability numbers land in the existing Characters ability descs (per the "both places" convention already in use), not in `Gameplay`.

## Rollout order (no data loss)

1. Create the two sheet tabs with header rows (manual or via one-off Apps Script run).
2. Update `apps-script.gs` (consts + `doGet`), user deploys a new version, verify `GET` returns `enemies`/`gameplay` keys.
3. Land + push frontend (section renders empty-state gracefully before rows exist).
4. Seed the content rows via the documented curl recipe, verify against a fresh `GET`.
5. Update CLAUDE.md tab documentation.

## Out of scope

- Enemies/parameters for maps 2–4 (schema supports them; rows come later).
- The endless-steppe run-end rule and full-run (4-map) length modeling — revisit when the focus widens past Map 1.
- Any change to the game repo; reconciliation edits sheet rows only.
- Renaming `map22/map3/map4` placeholder map names (separate content pass).
