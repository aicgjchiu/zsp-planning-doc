// ZSP Planning Doc — data layer
// Content that still drives the Roadmap tab (Gantt, Phases, Milestones).
// Tasks / Characters / Items / Maps / Systems are sourced from the Google Sheet;
// the previous seed arrays were retired after the one-time migration.
// Chinese only kept on proper nouns: map / character / enemy / ability names.

// --- Phases ---
window.PHASES = [
  { num: 1, name: 'Portal Vertical Slice',      quarters: 'Y1 Q1–Q2', color: 'portal',    goal: 'Vertical slice: 1 map, 1 character (Daoshi), full Portal Activate loop running end-to-end. Internal playtests only.' },
  { num: 2, name: 'Core Systems Hardening',     quarters: 'Y1 Q3–Q4', color: 'env',       goal: 'Dual Portal system, enemy vote-upgrades, stacking revive CD, 2nd map, 2nd character.' },
  { num: 3, name: 'Content Expansion 1',        quarters: 'Y2 Q1–Q2', color: 'code',      goal: '3rd map, 3rd character, all 10 items implemented, a boss per map. Closed Alpha.' },
  { num: 4, name: 'Content Expansion 2',        quarters: 'Y2 Q3–Q4', color: 'char',      goal: '4th map, 4th character, enemy ultimate upgrades, matchmaking. Open Beta.' },
  { num: 5, name: 'Polish & Meta',              quarters: 'Y3 Q1–Q2', color: 'vfx',       goal: 'Balancing, meta progression, cosmetics, localization, accessibility, Steam storefront.' },
  { num: 6, name: 'Ship & Support',             quarters: 'Y3 Q3–Q4', color: 'milestone', goal: 'Release candidate, marketing push, launch, week-one patch.' },
];

// --- Milestones ---
window.MILESTONES = [
  { q: 'Y1 Q2', name: 'M1 · First Portal Activate',    goal: 'Player can spawn, find the Portal, defend it for 60s, and reload into the same map for another round. Loop smokes out.' },
  { q: 'Y1 Q4', name: 'M2 · Two-map Loop + Vote',      goal: 'Two playable maps, dual Portal system online, enemy vote-upgrades integrated. 4-player Steam co-op.' },
  { q: 'Y2 Q2', name: 'M3 · Closed Alpha',             goal: '3 maps, 3 characters (all abilities), 10 items, 3 boss fights. First external testers.' },
  { q: 'Y2 Q4', name: 'M4 · Open Beta',                goal: '4 maps, 4 characters, matchmaking, enemy ultimate upgrades, Steam Beta branch live.' },
  { q: 'Y3 Q2', name: 'M5 · Content Lock',             goal: 'No new systems. Balance tuning, meta progression, polish, localization, achievements.' },
  { q: 'Y3 Q4', name: 'M6 · Ship',                     goal: 'Release candidate passes Steam cert. Launch day + week-one patch plan ready.' },
];

// --- Gantt tracks ---
window.GANTT = [
  { who: 'Programmer (you)', role: 'code', bars: [
    { name: 'Portal actor + Activate',      start: 0,  end: 1,  color: 'portal' },
    { name: 'Vote-upgrade UI + backend',    start: 2,  end: 3,  color: 'portal' },
    { name: 'Dual Portal + soul energy',    start: 3,  end: 4,  color: 'portal' },
    { name: 'Character 3+4 ability hookup', start: 4,  end: 6,  color: 'code' },
    { name: 'Boss AI framework',            start: 5,  end: 7,  color: 'code' },
    { name: 'Matchmaking + lobby',          start: 7,  end: 8,  color: 'code' },
    { name: 'Meta progression + save',      start: 8,  end: 9,  color: 'code' },
    { name: 'Optimization + cert',          start: 9,  end: 11, color: 'milestone' },
  ]},
  { who: 'Artist · Characters', role: 'char', bars: [
    { name: 'Daoshi 道士 rig + textures',   start: 0,  end: 1,  color: 'char' },
    { name: 'Jiangshi 殭屍 base enemy rig', start: 1,  end: 2,  color: 'char' },
    { name: 'Missionary sculpt → rig',      start: 2,  end: 4,  color: 'char' },
    { name: 'Werewolf + Cultist set',       start: 3,  end: 5,  color: 'char' },
    { name: 'Shaman sculpt → rig',          start: 5,  end: 7,  color: 'char' },
    { name: 'Bayou Zombies + Loa idols',    start: 6,  end: 8,  color: 'char' },
    { name: 'Witch Doctor sculpt → rig',    start: 7,  end: 9,  color: 'char' },
    { name: 'Cosmetic skins + polish',      start: 9,  end: 11, color: 'char' },
  ]},
  { who: 'Artist · Environment', role: 'env', bars: [
    { name: 'NightMarket 夜市 concept + greybox',      start: 0,  end: 1,  color: 'env' },
    { name: 'NightMarket 夜市 final dress',            start: 1,  end: 3,  color: 'env' },
    { name: 'map2 concept → build',     start: 2,  end: 5,  color: 'env' },
    { name: 'map3 concept → build',     start: 4,  end: 7,  color: 'env' },
    { name: 'map4 concept → build',    start: 6,  end: 9,  color: 'env' },
    { name: 'Lighting + atmosphere polish',       start: 9,  end: 11, color: 'env' },
  ]},
  { who: 'Artist · VFX & Rigging', role: 'vfx', bars: [
    { name: 'Daoshi rig + anim retarget',   start: 0,  end: 1,  color: 'vfx' },
    { name: 'Talisman VFX',                 start: 1,  end: 2,  color: 'vfx' },
    { name: 'Portal VFX + miasma',          start: 2,  end: 4,  color: 'vfx' },
    { name: 'Per-character ability VFX',    start: 3,  end: 9,  color: 'vfx' },
    { name: 'Boss VFX + ultimates',         start: 6,  end: 9,  color: 'vfx' },
    { name: 'VFX polish + LODs',            start: 9,  end: 11, color: 'vfx' },
  ]},
  { who: 'Milestones', role: 'milestone', bars: [
    { name: 'M1',                      start: 1,  end: 2,  color: 'milestone' },
    { name: 'M2',                      start: 3,  end: 4,  color: 'milestone' },
    { name: 'M3 · Closed Alpha',       start: 5,  end: 6,  color: 'milestone' },
    { name: 'M4 · Open Beta',          start: 7,  end: 8,  color: 'milestone' },
    { name: 'M5 · Content Lock',       start: 9,  end: 10, color: 'milestone' },
    { name: 'M6 · Ship',               start: 11, end: 12, color: 'milestone' },
  ]},
];
