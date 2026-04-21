// ZSP Planning Doc — data layer
// All Roadmap / Design Doc / Task Board content is sourced from the Google Sheet.
// `window.PHASES` is the last remaining hard-coded structure — it drives the
// static Phases table and the Task Board / Quarter Plan phase labels.

// --- Phases ---
window.PHASES = [
  { num: 1, name: 'Portal Vertical Slice',      quarters: 'Y1 Q1–Q2', color: 'portal',    goal: 'Vertical slice: 1 map, 1 character (Daoshi), full Portal Activate loop running end-to-end. Internal playtests only.' },
  { num: 2, name: 'Core Systems Hardening',     quarters: 'Y1 Q3–Q4', color: 'env',       goal: 'Dual Portal system, enemy vote-upgrades, stacking revive CD, 2nd map, 2nd character.' },
  { num: 3, name: 'Content Expansion 1',        quarters: 'Y2 Q1–Q2', color: 'code',      goal: '3rd map, 3rd character, all 10 items implemented, a boss per map. Closed Alpha.' },
  { num: 4, name: 'Content Expansion 2',        quarters: 'Y2 Q3–Q4', color: 'char',      goal: '4th map, 4th character, enemy ultimate upgrades, matchmaking. Open Beta.' },
  { num: 5, name: 'Polish & Meta',              quarters: 'Y3 Q1–Q2', color: 'vfx',       goal: 'Balancing, meta progression, cosmetics, localization, accessibility, Steam storefront.' },
  { num: 6, name: 'Ship & Support',             quarters: 'Y3 Q3–Q4', color: 'milestone', goal: 'Release candidate, marketing push, launch, week-one patch.' },
];
