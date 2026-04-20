// ZSP Planning Doc — data layer
// All the "content" lives here so the HTML files stay small.
// Chinese only kept on proper nouns: map / character / enemy / ability names.

// --- Characters (4) ---
window.CHARACTERS = [
  {
    id: 'daoshi',
    name: 'Daoshi · 道士',
    culture: 'Chinese Taoist',
    role: 'Ranged Caster / Area Control',
    weapon: 'Talisman & peach-wood sword',
    status: 'High-poly model exists — needs rig + textures',
    statusChip: 'asset: HP ready',
    summary: 'Throws talismans, bends the five elements, seals wards. Medium HP, strong zone control.',
    abilities: [
      { key: 'Q', name: 'Fire Talisman · 火符', type: 'Skill', desc: 'Throws a talisman — detonates on hit into a 4m fire zone (DoT). Great vs. clusters. Implemented in code.', impl: 'Implemented' },
      { key: 'R', name: 'Thunder Talisman · 雷符', type: 'Skill', desc: 'Primary bolt stuns the first target; 3 homing chain bolts seek the nearest enemies within 8m. Group control. Implemented in code.', impl: 'Implemented' },
      { key: 'T', name: 'Bagua Ward · 八卦結界', type: 'Ultimate', desc: 'Lays a 6m octagonal ward on the ground for 8s. Allies inside take −40% damage; enemies entering get −30% move speed. Designed as the Activate-defense anchor.', impl: 'Design only' },
    ],
  },
  {
    id: 'missionary',
    name: 'Missionary · 傳教士',
    culture: 'Western Priest',
    role: 'Support / Healer',
    weapon: 'Cross, holy water, breviary',
    status: 'Concept only',
    statusChip: 'not started',
    summary: 'Western exorcist. Heals, buffs, dispels undead. Lowest damage but highest party sustain.',
    abilities: [
      { key: 'Q', name: 'Holy Water Flask · 聖水瓶', type: 'Skill', desc: 'Thrown flask — on impact splashes 3m, heals allies 40 HP, deals holy damage to undead-type enemies. 6s CD.', impl: 'Design only' },
      { key: 'R', name: 'Sanctified Ground · 聖域', type: 'Skill', desc: 'Inscribes a 5m holy zone for 10s. Allies regen HP + mana per second; undead inside burn for 10/s. 16s CD.', impl: 'Design only' },
      { key: 'T', name: 'Exorcism Rite · 驅魔儀式', type: 'Ultimate', desc: '2s channel, then a cone of holy light — instantly dispels low-HP trash (<30%) and interrupts the Enemy Portal soul-drain for 6s.', impl: 'Design only' },
    ],
  },
  {
    id: 'shaman',
    name: 'Shaman · 薩滿',
    culture: 'Siberian / Mongol',
    role: 'Melee Bruiser / Totems',
    weapon: 'Shaman drum + bone dagger',
    status: 'Concept only',
    statusChip: 'not started',
    summary: 'Totem-based melee. Plants totems that buff allies or shock enemies. High HP.',
    abilities: [
      { key: 'Q', name: 'Spirit Drumbeat · 靈鼓震', type: 'Skill', desc: 'Drum pulse — 8m shockwave, enemies staggered, allies gain +15% attack speed for 6s. 8s CD.', impl: 'Design only' },
      { key: 'R', name: 'Totem of Wrath · 忿怒圖騰', type: 'Skill', desc: 'Plants a totem (300 HP) that fires a bone spike at the nearest enemy every 1.5s. Lasts 20s or until destroyed. Max 2 up at once.', impl: 'Design only' },
      { key: 'T', name: "Ancestor's Frenzy · 先祖狂暴", type: 'Ultimate', desc: 'Frenzy for 8s: +30% move speed, +50% damage, stun immunity. Next melee hit spawns a temporary bonus totem.', impl: 'Design only' },
    ],
  },
  {
    id: 'witchdoctor',
    name: 'Witch Doctor · 巫醫',
    culture: 'Voodoo / African',
    role: 'DoT / Curse Caster',
    weapon: 'Fetish wand, bone mask',
    status: 'Concept only',
    statusChip: 'not started',
    summary: 'Curses, plague, poison pools. Lowest burst, highest sustained DPS. Especially strong vs. bosses.',
    abilities: [
      { key: 'Q', name: 'Poison Dart · 毒鏢', type: 'Skill', desc: 'Fast dart — applies 8/s poison DoT for 5s, stacks up to 5. Low CD, usable as primary attack.', impl: 'Design only' },
      { key: 'R', name: 'Voodoo Doll · 巫毒娃娃', type: 'Skill', desc: 'Marks an enemy and binds a doll — 40% of damage dealt to the marked target echoes to all enemies within 10m. Lasts 14s.', impl: 'Design only' },
      { key: 'T', name: 'Plague Swarm · 瘟疫蟲群', type: 'Ultimate', desc: 'Releases a pursuing swarm for 10s, 15/s damage, and inflicts "−50% healing" on affected enemies.', impl: 'Design only' },
    ],
  },
];

// --- Items (10) ---
window.ITEMS = [
  { id: 'mana_potion',       name: 'Mana Potion',       kind: 'Consumable', effect: 'Restores 50 mana instantly.',                                               stack: 5,  existing: true,  notes: 'Already implemented (GA_UseManaPotion).' },
  { id: 'health_potion',     name: 'Health Potion',     kind: 'Consumable', effect: 'Regens 80 HP over 3s.',                                                     stack: 5,  existing: false, notes: 'Clone the Mana Potion pattern; add GE_HealthPotion_Grant.' },
  { id: 'throwing_dagger',   name: 'Throwing Dagger',   kind: 'Thrown',     effect: 'Projectile weapon — 45 damage, short range.',                               stack: 10, existing: true,  notes: 'Already implemented (GA_UseThrowingDagger).' },
  { id: 'firebomb',          name: 'Firebomb',          kind: 'Thrown',     effect: 'Arcing throw; 4m explosion + 8s burn zone (20/s damage).',                  stack: 5,  existing: false, notes: 'Reuse the existing FireTalismanZone actor.' },
  { id: 'smoke_bomb',        name: 'Smoke Bomb',        kind: 'Utility',    effect: 'Releases 5m smoke — enemies lose aggro for 4s.',                            stack: 3,  existing: false, notes: 'Needs AI-perception blindness hook.' },
  { id: 'ward_scroll',       name: 'Ward Scroll',       kind: 'Utility',    effect: 'Places a temporary ward (200 HP, 10s) that blocks enemy pathing.',          stack: 3,  existing: false, notes: 'Huge during Portal Activate defense.' },
  { id: 'spirit_ember',      name: 'Spirit Ember',      kind: 'Buff',       effect: '+25% damage for 20s. Single use.',                                          stack: 3,  existing: false, notes: 'Applied via GE_SpiritEmber (Duration type).' },
  { id: 'soul_lantern',      name: 'Soul Lantern',      kind: 'Revive',     effect: 'Instantly revives one downed ally in place. Rare.',                         stack: 1,  existing: false, notes: 'Hooks into the new revive flow.' },
  { id: 'portal_shard',      name: 'Portal Shard',      kind: 'Key Item',   effect: '+30% Portal Activate channel speed on next use. Consumed on use.',          stack: 3,  existing: false, notes: 'Couples to the Portal system (M3+).' },
  { id: 'miasma_vial',       name: 'Miasma Vial',       kind: 'Thrown',     effect: 'Thrown vial — 3m pool for 6s that drains soul energy from the Enemy Portal. Strategic.', stack: 2, existing: false, notes: 'Ties into the Enemy Portal absorption mechanic.' },
];

// --- Maps (4) ---
window.MAPS = [
  {
    id: 'hamlet',
    name: 'NightMarket · 夜市',
    theme: 'Chinese countryside at dusk — Jiangshi 殭屍 themed',
    size: '250m × 250m',
    enemies: 'Jiangshi 殭屍, Yao 狐妖 (fox spirits), Black Dog 黑狗',
    boss: 'Corpse General 屍將軍 — commands minion Jiangshi in battle',
    difficulty: 'Tutorial map / Run 1',
    biomeNotes: 'A small village of timber huts, rice paddies and red lanterns. Narrow alleys favor melee; open paddies favor ranged.',
  },
  {
    id: 'monastery',
    name: 'map2',
    theme: 'Medieval Alpine monastery on a snowy night — werewolves and plague revenants',
    size: '300m × 300m',
    enemies: 'Werewolves 狼人, Cultists 邪教徒, Plague Revenants 瘟疫亡魂',
    boss: 'Alpha Werewolf 狼王 — phase 1 bipedal, phase 2 quadrupedal',
    difficulty: 'Run 2',
    biomeNotes: 'Stone monastery in a snowed-in valley. Snowy courtyards, chapel interior, bell tower. Cloisters and tower offer vertical play.',
  },
  {
    id: 'bayou',
    name: 'map3',
    theme: 'Louisiana voodoo swamp at night — voodoo zombies and Loa idols',
    size: '320m × 320m',
    enemies: 'Bayou Zombies 巫毒殭屍, Loa Marionettes 羅阿神偶 (voodoo idols hung on invisible strings), Gator Fiend 鱷魚惡魔',
    boss: 'Baron Saturday 星期六男爵 — Loa of death; curses players who finish him too quickly',
    difficulty: 'Run 3',
    biomeNotes: 'Black water, raised islands, rope bridges, heavy fog. Water slows movement and forces island-hopping; fog cuts sightlines.',
  },
  {
    id: 'steppe',
    name: 'map4',
    theme: 'Mongolian steppe with an abandoned shaman shrine — shaman spirits gone feral',
    size: '400m × 400m',
    enemies: 'Spirit Wolves 靈狼, Ancestor Warriors 先祖戰士 (spectral), Stone Giants 石巨人',
    boss: 'The Last Khan 末代可汗 — mounted, sweeps across the battlefield on charge',
    difficulty: 'Final map / Run 4+',
    biomeNotes: 'Treeless plains (typical steppe geography). Wide open — favors ranged. Day/night cycle swaps enemy rosters.',
  },
];

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

// --- Task board ---
window.TASKS = {
  programmer: [
    { phase:1, p:'P0', title:'APortalActor base class',            body:'Static-mesh actor with EPortalState { Dormant, Activating, Active, Destroyed }. Replicated state + OnRep callbacks.' },
    { phase:1, p:'P0', title:'Portal Activate ability',            body:'UZSPGA_ActivatePortal — 5s channel, breaks on damage taken, fires OnActivated multicast on completion.' },
    { phase:1, p:'P0', title:'Portal random spawn',                body:'APortalSpawnManager picks from tagged ATargetPoint with min-distance constraint from player start.' },
    { phase:1, p:'P1', title:'AI target switch to Portal',         body:'Behavior Tree: when Portal.IsActivating, override TargetActor to Portal until Activate completes.' },
    { phase:2, p:'P0', title:'Enemy Portal actor',                 body:'AEnemyPortalActor — replicated SoulEnergy float; drains from time + player damage taken.' },
    { phase:2, p:'P0', title:'Vote-upgrade subsystem',             body:'UUpgradeVoteSubsystem — triggers every N soul energy; client UI shows 5s vote; server tallies and applies GameplayEffects to AI spawners.' },
    { phase:2, p:'P0', title:'Stacking revive CD',                 body:'Per-player death counter; CD curve {8s, 16s, 30s, 60s+}. Extend UZSPAttributeSetBase or PlayerState.' },
    { phase:2, p:'P1', title:'Level-up 5s I-frame popup',          body:'Apply GE_Invincible_5s on level-up; UpgradePicker widget opens; world keeps ticking (no pause).' },
    { phase:2, p:'P1', title:'Weapon ↔ skill binding',             body:'Equipping a weapon class grants a fixed ability set; remove the free-combo UI.' },
    { phase:3, p:'P0', title:'Ability kit: Missionary · 傳教士',   body:'Holy Water Flask, Sanctified Ground, Exorcism Rite — 3 GAs + GEs + projectile.' },
    { phase:3, p:'P0', title:'Ability kit: Shaman · 薩滿',         body:"Spirit Drumbeat, Totem of Wrath totem actor, Ancestor's Frenzy — 3 GAs." },
    { phase:3, p:'P0', title:'Boss AI framework',                  body:'ABossCharacter with a phase state machine; shared across all 4 bosses.' },
    { phase:3, p:'P1', title:'Items 4–10 implementation',          body:'Firebomb, Smoke Bomb, Ward Scroll, Spirit Ember, Soul Lantern, Portal Shard, Miasma Vial — use the existing ItemDefinition pattern.' },
    { phase:4, p:'P0', title:'Ability kit: Witch Doctor · 巫醫',   body:'Poison Dart, Voodoo Doll, Plague Swarm. Voodoo Doll marking = echo-damage wiring.' },
    { phase:4, p:'P0', title:'Matchmaking polish',                 body:'Built on AdvancedSessions; quick-match filters by map + party size.' },
    { phase:4, p:'P1', title:'Enemy ultimate upgrade',             body:'When soul energy hits threshold → summon Boss. Add "Summon Boss" branch to the vote system.' },
    { phase:5, p:'P0', title:'Meta progression + save',            body:'Account XP, cosmetic unlocks, per-character mastery level.' },
    { phase:5, p:'P1', title:'Localization (EN / zh-TW / zh-CN)',  body:'Migrate to StringTable; UI font fallback chain for CJK.' },
    { phase:5, p:'P1', title:'Accessibility',                      body:'Colorblind-safe palette, SFX captions, hold-to-interact option, key rebinding.' },
    { phase:6, p:'P0', title:'Optimization pass',                  body:'Per-map GPU/CPU budget: 16ms @ 4 players + 40 AI. LODs, Nanite, HLOD.' },
    { phase:6, p:'P0', title:'Steam storefront + cert',            body:'Capsule art, trailer, achievements, Workshop (optional), age rating, EULA.' },
    { phase:6, p:'P1', title:'Post-launch patch plan',             body:'Hotfix branch on standby; telemetry dashboard; bug triage rotation.' },
  ],
  char: [
    { phase:1, p:'P0', title:'Daoshi 道士 — retopo + UV',          body:'High-poly → game mesh (~35k tris), bake normals, 2K PBR textures.' },
    { phase:1, p:'P0', title:'Daoshi 道士 rig handoff',            body:'Weighted onto Epic skeleton for retarget support; deliver FBX.' },
    { phase:1, p:'P1', title:'Jiangshi 殭屍 base enemy',           body:'Same pipeline. A/B texture variants for visual variety.' },
    { phase:2, p:'P0', title:'Missionary sculpt',                  body:'Robes, cross, breviary. Target 30k tris.' },
    { phase:2, p:'P1', title:'Werewolf 狼人 biped + quadruped',    body:'Shared skeleton + blend shapes for transformation anim.' },
    { phase:3, p:'P0', title:'Shaman 薩滿 sculpt + textures',      body:'Bone ornaments, hair details; drum as weapon attachment.' },
    { phase:3, p:'P1', title:'Bayou Zombies 巫毒殭屍 variants',    body:'3 variants sharing one skeleton; head + torso swaps.' },
    { phase:4, p:'P0', title:'Witch Doctor 巫醫 sculpt',           body:'Mask + fetish details; feather groom (optional).' },
    { phase:4, p:'P1', title:'Boss: Baron Saturday 星期六男爵',    body:'Unique silhouette, tailcoat + top hat; 45k tri budget.' },
    { phase:4, p:'P1', title:'Boss: The Last Khan 末代可汗',       body:'Mount + rider split rigs; composite rig setup.' },
    { phase:5, p:'P1', title:'Cosmetic skins (3 per character)',   body:'Recolor variants + one alt silhouette per character.' },
    { phase:5, p:'P2', title:'Character polish pass',              body:'Fix clipping, re-bake mips, finalize LODs.' },
  ],
  env: [
    { phase:1, p:'P0', title:'NightMarket 夜市 concept art',            body:'6 keyframes: dusk paddies, shrine gate, inner alley, central altar, bell tower, boss arena.' },
    { phase:1, p:'P0', title:'NightMarket 夜市 greybox',                body:'Playable block-out; Portal can spawn at 8+ valid points with clean line of sight.' },
    { phase:2, p:'P0', title:'NightMarket 夜市 final dress',            body:'Modular kit: huts, fences, lanterns, paddy plane. 1.2M tri budget.' },
    { phase:2, p:'P0', title:'map2 concept + greybox',   body:'Indoor/outdoor split; chapel as the boss arena.' },
    { phase:3, p:'P0', title:'map2 final dress',         body:'Stone modular kit + snow shader; chapel interior set dressing.' },
    { phase:3, p:'P0', title:'map3 concept + greybox',   body:'Water plane + walkable islands; rope-bridge rig.' },
    { phase:4, p:'P0', title:'map3 final dress',         body:'Swamp foliage, skiffs, bone totems, hanging vines.' },
    { phase:4, p:'P0', title:'map4 concept + greybox',  body:'Open terrain + ruined shrine; day/night lighting presets.' },
    { phase:5, p:'P0', title:'map4 final dress',        body:'Grass groom, ruined shrine, Khan statue.' },
    { phase:5, p:'P1', title:'Lighting pass — all maps',           body:'Volumetrics tuning, exposure curves, miasma fog shader.' },
    { phase:6, p:'P2', title:'Storefront key art',                 body:'Steam capsule, header, library art, 6 screenshots per map.' },
  ],
  vfx: [
    { phase:1, p:'P0', title:'Daoshi 道士 rig + retarget setup',   body:'Engine retarget chain; Control Rig for procedural poses (aim, lean).' },
    { phase:1, p:'P0', title:'Talisman projectile VFX',            body:'Fire/Thunder talisman trails, impact bursts, DoT burn zone — Niagara.' },
    { phase:2, p:'P0', title:'Portal VFX (player / enemy)',        body:'Two visual languages: player Portal blue-gold; enemy Portal purple-black.' },
    { phase:2, p:'P1', title:'Miasma atmosphere shader',           body:'Global volumetric fog — density driven by Enemy Portal soul energy value.' },
    { phase:3, p:'P0', title:'Missionary VFX set',                 body:'Holy water splash, sanctified ground aura, exorcism cone of light.' },
    { phase:3, p:'P0', title:'Rig: Missionary + Shaman',           body:'Skeletons + base facial (20 bones), robe cloth sim.' },
    { phase:4, p:'P0', title:'Shaman VFX set',                     body:'Drumbeat shockwave, totem bone-spike burst, frenzy aura.' },
    { phase:4, p:'P0', title:'Rig: Witch Doctor + bosses',         body:'Feather groom, mask rig; dedicated rigs for all 4 bosses.' },
    { phase:4, p:'P0', title:'Witch Doctor VFX set',               body:'Poison pools, Voodoo Doll echo FX, plague swarm.' },
    { phase:5, p:'P0', title:'Boss ultimate FX',                   body:'One signature moment per boss (screen shake + VFX + SFX cue).' },
    { phase:5, p:'P1', title:'VFX LOD + budget pass',              body:'Culling rules, particle counts, GPU profiling.' },
    { phase:6, p:'P2', title:'Trailer VFX flourishes',             body:'Extra polish for marketing captures.' },
  ],
};

// --- Systems Matrix ---
window.SYSTEMS = [
  { sys:'Core Loop',                   status:'Design',  dep:'—',                     owner:'Programmer', notes:'Enter → find Portal → Activate (5s channel) → choose to leave or farm 5 more minutes.' },
  { sys:'Player Portal',               status:'Design',  dep:'Core Loop',             owner:'Programmer', notes:'Random spawn, Activate channel; 5-minute CD before it can hop again.' },
  { sys:'Enemy Portal',                status:'Design',  dep:'Player Portal',         owner:'Programmer', notes:'Absorbs soul energy from time + player damage taken; thresholds trigger upgrades and boss summons.' },
  { sys:'Vote-upgrade',                status:'Design',  dep:'Enemy Portal',          owner:'Programmer', notes:'3 options: Stats / Skill / Spawn. 10% floor per option, remaining 70% distributed by vote.' },
  { sys:'Revive (stacking CD)',        status:'Design',  dep:'—',                     owner:'Programmer', notes:'Die in place. Revive at body or Portal. CD: 8 → 16 → 30 → 60s escalating.' },
  { sys:'Level-up 5s I-frame',         status:'Design',  dep:'GAS',                   owner:'Programmer', notes:'World keeps ticking; 5s invulnerability window to pick an upgrade.' },
  { sys:'Weapon ↔ Skill bind',         status:'Design',  dep:'GAS',                   owner:'Programmer', notes:'Formerly free-combo; now equipping a weapon = fixed ability set.' },
  { sys:'Ability System (GAS)',        status:'In code', dep:'—',                     owner:'Programmer', notes:"Epic's Gameplay Ability System. Daoshi 2/3 abilities done (Fire, Thunder)." },
  { sys:'Inventory (4 slots)',         status:'In code', dep:'—',                     owner:'Programmer', notes:'FastArray replication, scroll cycle. 8 of 10 items remain to implement.' },
  { sys:'Quest System',                status:'In code', dep:'—',                     owner:'Programmer', notes:'Repurposed for optional side objectives on Portal maps.' },
  { sys:'Steam sessions',              status:'In code', dep:'AdvancedSessions',      owner:'Programmer', notes:'Phase 4: extend with quick-match + filters.' },
  { sys:'Boss Framework',              status:'Design',  dep:'GAS',                   owner:'Programmer', notes:'Phase state machine; one boss per map.' },
  { sys:'Meta Progression',            status:'Design',  dep:'Save',                  owner:'Programmer', notes:'Account XP, per-character mastery, cosmetic unlocks.' },
];
