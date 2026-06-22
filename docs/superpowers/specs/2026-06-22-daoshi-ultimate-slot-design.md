# Daoshi roster fix + dedicated Ultimate slot — Design

**Date:** 2026-06-22
**Status:** Approved
**Related:** the stacking-質變 doc update earlier today (Systems row "Player Upgrade Cards · 質變" + Daoshi Fire ability). This restructures the character ability model so the three 質變 families map cleanly to Q/R/T and the ultimate gets its own slot.

## Problem

The planning doc modeled the Daoshi as **Q=Fire, R=Thunder, T=Bagua Ward (Ultimate)**. Two issues:

1. **Soul Power Bullet was missing.** Per the game repo (`UZSPGA_SoulPowerBullet`, input `Ability3`=Q; overhaul spec §"Class (Daoshi) — enhance Soul Power Bullet, Fire Talisman, Thunder Talisman"), the Daoshi's three card / 質變 families are **Soul Power Bullet · Fire · Thunder**. The doc had no Soul Power Bullet.
2. **The ultimate was crammed into a skill slot.** Bagua Ward sat in the T slot, blurring the line between "ability family that gets stacking cards + 質變s" and "ultimate" (which has no card family).

The character ability table + edit modal are hard-locked to **exactly 3 slots keyed Q/R/T** (`ABILITY_KEYS` in `app.js`). The display table renders any number of rows, but the modal both builds and saves exactly Q/R/T — so a 4th ability written only to the sheet is silently dropped on the next modal save (CLAUDE.md's documented footgun).

## Decision

Move to a uniform **4-slot model for all 4 characters**: three skill slots **Q / R / T** plus one dedicated **Ultimate slot keyed `Ult`**. The Ult slot is visually set apart and is *not* a 質變 family.

## Changes

### Code — `app.js`
- `ABILITY_KEYS = ['Q','R','T','Ult']` (was `['Q','R','T']`).
- Modal draft default type: the `Ult` slot defaults to type `Ultimate` when empty (`existing.type || (k === 'Ult' ? 'Ultimate' : 'Skill')`); other slots still default `Skill`.
- Modal sub-table label: "Abilities (Q / R / T — exactly 3 slots)" → "Abilities (Q / R / T skills + Ultimate)".
- `renderCharacters`: tag the ultimate row with `class="ult-row"` when `a.key === 'Ult'` so it can be styled as a distinct slot.

### Code — `styles.css`
- New rule: `table.sheet tr.ult-row td` gets a top separator + a faint neutral (hue-240, low-chroma) background tint so the ultimate reads as a slot apart from the three skills. Placed after the `tr:nth-child(even)` striping rule so it wins at equal specificity.
- Widen the modal key-cell from 28px → 36px so "Ult" fits.

### Data — Characters sheet (4 rows, migrated via curl)
**Daoshi** (`daoshi`):

| Key | Ability | Type | Impl | Notes |
|---|---|---|---|---|
| Q | Soul Power Bullet | Skill | Implemented | NEW — see desc below |
| R | Fire Talisman · 火符 | Skill | Implemented | keeps the full stacking-cards + 5-質變-pool detail (moved from Q) |
| T | Thunder Talisman · 雷符 | Skill | Implemented | moved from R; + "質變 family — cards/pool TBD" pointer |
| Ult | Bagua Ward · 八卦結界 | Ultimate | Design only | moved from T |

**Soul Power Bullet desc** (sourced from the game repo, not invented): "Toggle (Q) — while active, spends soul power (Mana) to empower the Daoshi's talisman attacks (e.g. Fire projectiles hit ~5×); turns off on toggle or when out of Mana. Implemented in code. 質變 family — its own stacking cards + 質變 pool are TBD (Fire is the first family built)."

**Missionary / Shaman / Witch Doctor**: Q and R keep their two existing skills; **T becomes a "TBD" placeholder** (3rd skill, not yet designed — all three are concept-only); their existing ultimate (Exorcism Rite / Ancestor's Frenzy / Plague Swarm) **moves from T into the Ult slot** (type stays Ultimate).

### Doc text
- `index.html`: "Each character has 3 abilities (Q / R / T)" → "Each character has 3 skills (Q/R/T) + an ultimate"; "4 characters · 3 abilities each · 12 total" → "4 characters · 3 skills + 1 ultimate each".
- `CLAUDE.md`: update the three places that assert the 3-slot Q/R/T model (Characters header bullet, Target-game-content line, Character-abilities editing note — including removing the now-resolved "only the modal UI enforces count-of-3" caveat).

## Rollout order (no data loss)
1. Land + push all code/CSS/doc-text changes. The new 4-slot modal is backward-safe against the old 3-row data (it just shows an empty Ult slot), so deploying code first cannot lose data.
2. Then migrate the 4 character rows on the sheet so display and data are consistent with the 4-slot model.
3. Verify against a fresh `GET`.

## Out of scope
- Defining the other 3 characters' 3rd skills (left as TBD).
- Soul Power Bullet's and Thunder's specific stacking cards + 質變 pools (TBD; Fire is the only family built — tracked in the game-repo P4 spec).
- Any change to the game repo.
