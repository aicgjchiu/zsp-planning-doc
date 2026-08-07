# Gameplay & Numbers section (Map 1 focus) — Design

**Date:** 2026-08-06
**Status:** Approved
**Related:** Systems rows "Core Loop" / "Player Portal" / "Enemy Portal" (the pacing skeleton this formalizes); the Maps row `hamlet` (NightMarket 夜市, the scope of this pass). As-built numbers were supplied by the game-repo session「遊戲設計文檔更新」on 2026-08-06 (full digest with source files: `E:\P4WorkSpaces\ZSP\ZSP 5.7\Saved\design-doc-sync\gameplay-data-digest.md`).

## Problem

The Design Doc describes *what* the systems are but carries no numbers: no enemy stats, no TTK targets, no pacing parameters, and no answer to "how long is one run?". The run-length skeleton is already implied by existing content (Portal 5-minute CD, 5s Activate channel, leave-or-farm-5-minutes choice, maps ordered Run 1→4+), but it lives scattered in Systems notes and is never computed into an actual prediction.

Scope decisions made during brainstorming:

- The steppe (`map4`) endless mode is the *temporary* run-end rule; this pass focuses **only on Map 1 (NightMarket 夜市)** — its enemies, pacing parameters, and segment-length model. Later maps add rows, not schema.
- Content gets a **new dedicated Design Doc section** backed by new sheet tabs (approach B), not stuffed into existing columns.

User-arbitrated reconciliation decisions (2026-08-06):

- **Enemy naming:** themed design names carry as-built stats — Jiangshi 殭屍 = as-built `Zombie`, a new Giant Jiangshi 巨殭 row = `Brute`, Black Dog 黑狗 = `Runner`. Yao 狐妖 and the boss 屍將軍 stay `target` (no as-built counterpart; boss framework is game-side Q3).
- **Items:** the Items tab updates to as-built values (Throwing Dagger 45→15 dmg; Spiria Potion +50→+25).

## Decision

Add a **"Gameplay & Numbers"** section to the Design Doc tab, backed by two new sheet tabs — `Enemies` (one row per enemy) and `Gameplay` (one row per named parameter) — plus a read-only **run-segment-length banner** computed live from `Gameplay` parameter rows. Every number carries a `Basis` of `target` (designer-proposed) or `as-built` (verified against the UE 5.7 project), rendered as differently colored chips so unverified numbers are visible at a glance.

## Changes

### Sheet — two new tabs

**`Enemies`** headers (row 1, in order):
`Id | Name | Map | Tier | HP | Damage | MoveSpeed | SpawnWeight | Behavior | Basis | Hidden | SortOrder | CreatedAt | UpdatedAt | UpdatedBy`

- `Map` is a map id from the Maps tab (`hamlet` for this pass). `Tier` is `trash / elite / boss`. `Damage` is free text (`25/hit`, `8/s aura`) — attack shapes vary too much for one number. `SpawnWeight` is the relative weight among the map's roster (blank for bosses). `Basis` is `target` / `as-built`.
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
   - Static caption under the bar: the model describes the **target portal-hop loop**; the as-built build has no victory condition yet (failure only: player Portal destroyed or team wipe — as-built anchors: enemy Portal tops out ≈ 35 min, card tiers final at 9 min).
2. **Gameplay parameter table**, grouped by `Section`, with the existing editing idiom: `⋯` per row opens an edit modal (Section select, Name, Value, Unit, Basis select, Notes, Delete), `＋` in the block header adds a row. `Basis` renders as a chip: `target` amber, `as-built` green.
3. **Enemies table**, filtered to rows whose `Map` exists in the Maps tab, grouped per map (only `hamlet` has rows for now). Same `⋯` / `＋` editing idiom (Name, Map select, Tier select, HP, Damage, MoveSpeed, SpawnWeight, Behavior, Basis select, Delete), with the same Basis chip in the table. Boss rows get the same visual set-apart treatment as `ult-row` (top separator + neutral tint).

All writes go through the existing `pushRow` path: optimistic, `_pending` dashed outline, refetch after settle.

### Content — initial rows

**Enemies (NightMarket 夜市).** As-built stat sources: swing base 25 dmg / CD 2s, scaled per-variant by damage multiplier; soul-orb SP yield per variant. `SpawnWeight` values are `target` proposals even on as-built rows — no spawn weights exist in code (portals top up to 5 alive, uniform).

| Id | Name | Tier | HP | Damage | MoveSpeed | SpawnWeight | Basis | Behavior |
|---|---|---|---|---|---|---|---|---|
| en-jiangshi | Jiangshi 殭屍 | trash | 100 | 25/hit | 300 | 55 | as-built | Standard chaser (as-built `Zombie`, ×1.0 dmg); soul orb +75 SP; 2s spawn protection |
| en-jujiang | Giant Jiangshi 巨殭 | elite | 300 | 50/hit | 180 | 10 | as-built | Heavy bruiser (as-built `Brute`, 2× scale, ×2.0 dmg); soul orb +100 SP |
| en-blackdog | Black Dog 黑狗 | trash | 50 | 18.75/hit | 420 | 20 | as-built | Fast flanker (as-built `Runner`, 0.6× scale, ×0.75 dmg); soul orb +65 SP; punishes players standing still channeling |
| en-yao | Yao 狐妖 | trash | 70 | 8/bolt (ranged) | 400 | 15 | target | Not implemented. Keeps 8–12m distance, fires spirit bolts, repositions after 2 shots |
| en-corpse-general | Corpse General 屍將軍 | boss | 4000 | 25/slam | 300 | — | target | Not implemented (boss framework is game-side Q3; current elite = PlagueBearer vote-card modifier). Summons Jiangshi waves at 75%/50%/25% HP; slam telegraphed 1s |

**Gameplay parameters:**

| Id | Section | Name | Value | Unit | Basis | Notes |
|---|---|---|---|---|---|---|
| gp-find-portal | Pacing | Find Portal time | 75 | s | target | 250m map, random Portal spawn (portal-hop loop not yet built) |
| gp-portal-cd | Pacing | Portal hop cooldown | 300 | s | target | From Systems "Player Portal" note (5-minute CD); hop loop not yet built |
| gp-activate | Pacing | Activate channel | 5 | s | as-built | E-channel on player Portal |
| gp-defense | Pacing | Post-activate defense countdown | 60 | s | as-built | Run-start beat; player Portal HP 1000 |
| gp-farm-rate | Pacing | Teams choosing to farm | 0.5 | ratio | target | Model assumption; revisit with playtests |
| gp-farm-len | Pacing | Farm extension length | 300 | s | target | "farm 5 more minutes" from Core Loop |
| gp-boss-rate | Pacing | Boss-triggered rate | 0.4 | ratio | target | 屍將軍 not implemented; mostly hit by farming teams |
| gp-boss-len | Pacing | Boss fight length | 120 | s | target | Target kill time for 屍將軍 at map-1 power |
| gp-eportal-tier | Pacing | Enemy Portal tier-up interval | 300 | s | as-built | Tiers 0–7 (top ≈ 35 min); lagging portals catch up at ×3 |
| gp-eportal-spawn | Pacing | Enemy Portal spawn top-up | 2 | s | as-built | Refills to 5 alive per portal |
| gp-eportal-add | Pacing | New enemy Portal cadence | 20 | s | as-built | Manager opens another portal (min spacing 5000 uu; destroyed → 60s respawn) |
| gp-card-tier | Pacing | Card tiers reach final | 540 | s | as-built | T0 for 240s → T1 for 300s → T2 (effective final) from 9:00 |
| gp-ttk-jiangshi | Combat | TTK: Jiangshi | 2 | s | target | As-built anchor: 9 basic shots (12 dmg) or 2 empowered bullets (60 dmg) |
| gp-ttk-yao | Combat | TTK: Yao 狐妖 | 2.5 | s | target | Mobile target; not implemented |
| gp-ttk-blackdog | Combat | TTK: Black Dog | 1 | s | target | Fragile; threat is speed, not HP |
| gp-enemy-swing | Combat | Enemy swing attack | 25 | dmg | as-built | Base 25, CD 2s, scaled by variant multiplier |
| gp-enemy-pounce | Combat | Enemy pounce | 50 | dmg | as-built | AoE radius 200 uu |
| gp-enemy-sense | Combat | Enemy perception range | 1500 | uu | as-built | Chase memory 5s; ignores downed players |
| gp-revive-cd | Combat | Revive CD ladder | 8/16/30/60 | s | as-built | DefaultGame.ini; bleed-out 30s, crawl 80 uu/s, ally revive channel 4s (text value; not consumed by the model) |
| gp-vote-sp | Economy | Vote trigger SP bar | 500 | SP | as-built | +250 per round; first vote ≈ 7 Jiangshi; per-portal soul-threshold voting disabled (full soul bar only tiers up) |
| gp-soul-orb | Economy | Soul orb attract radius | 700 | uu | as-built | +250 with SoulGather card; orb expires in 15s; each orb +5 Spiria |
| gp-spiria-regen | Economy | Spiria natural regen | 0 | /s | as-built | Starts at 0; recovery only via soul orbs (+5) and Mana Potion (+25) |

Banner output with these values: min `305s ≈ 5.1min`, expected `305 + 150 + 48 = 503s ≈ 8.4min`, max `725s ≈ 12.1min` — **NightMarket segment: ~5–12 minutes, typically ~8.5**.

### Content — sync of existing tabs (same content pass)

As-built numbers land in the tabs that already own them:

- **Characters (Daoshi ability descs):** 靈能彈 Q — basic 12 dmg/shot, empowered ×5 = 60 at −5 Spiria/shot; 火符 R — 18 on detonation, fire zone radius 300 / 5s / 0.5s tick, 20 Spiria, CD 2s; 雷符 T — chain DoT 6 per 0.5s × 3s = 36/target, 5 hops (0.1s/hop, chain cap 40), 15 Spiria, CD 5s. 八卦結界 Ult stays "Design only" (zero source references — confirmed unimplemented). Player baseline goes into the Daoshi summary: HP 1000, move 600 uu/s, Spiria max 100 (starts at 0, no natural regen).
- **Items:** Throwing Dagger → 15 dmg, range 5000, stack 10, `Existing=TRUE`; Spiria Potion → +25 Spiria, stack 5, `Existing=TRUE`. Other items keep design values with `Existing=FALSE`.
- **Systems notes refresh (as-built drift):** "Vote-upgrade" — actual flow is enemy 4-card vote (5s vote + 3s reveal) → player draft 3-pick (15s) → 質變 pick (15s), triggered by the team SP bar, not per-portal soul thresholds; "Enemy Portal" — add tier ladder (300s/tier, 0–7) and 1 damage taken = 1 soul fed to the active portal.

## Rollout order (no data loss)

1. Create the two sheet tabs with header rows (manual or via one-off Apps Script run).
2. Update `apps-script.gs` (consts + `doGet`), user deploys a new version, verify `GET` returns `enemies`/`gameplay` keys.
3. Land + push frontend (section renders empty-state gracefully before rows exist).
4. Seed the Enemies/Gameplay rows and apply the Characters/Items/Systems sync via the documented curl recipe; verify against a fresh `GET`.
5. Update CLAUDE.md tab documentation.

## Out of scope

- Enemies/parameters for maps 2–4 (schema supports them; rows come later).
- The endless-steppe run-end rule and full-run (4-map) length modeling — revisit when the focus widens past Map 1.
- Any change to the game repo; reconciliation edits sheet rows only.
- Renaming `map22/map3/map4` placeholder map names (separate content pass).
- Per-card roll magnitudes for the 18 enemy vote cards and Meteor/fire-tick component details (available from the game session on request; not needed for this section).
- The as-built novelty item Huge Sphere (not part of the 10-item design lineup).
