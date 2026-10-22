/* =========================================================================
   RIFTBOUND: CLASH PROTOCOL — 01 DATA
   All tuning lives here. Frame counts are 60 Hz simulation ticks.
   Nothing in this file touches the DOM or THREE.
   ========================================================================= */
(function (root) {
  'use strict';
  var RB = root.RB;

  /* ---------------------------------------------------------------- tuning */
  var TUNING = {
    stageHalfWidth: 9.0,
    stageHalfDepth: 1.6,
    gravity: 0.62,            // units / tick^2
    jumpVelocity: 11.2,
    walkSpeed: 0.055,         // units / tick
    dashSpeed: 0.135,
    dashTicks: 12,
    dashCooldown: 26,
    backDashSpeed: 0.11,
    crouchSpeed: 0.018,
    airDrift: 0.028,
    pushRadius: 0.60,         // body separation
    roundTime: 60,
    roundsToWin: 2,
    maxComboHits: 24,
    juggleBudget: 100,
    guardMax: 100,
    guardRegen: 0.35,         // per tick when not blocking
    guardChipMul: 1.0,
    furyMax: 100,
    superMax: 100,
    furyBurstCost: 60,
    furyArtCost: 40,
    superCost: 100,
    furyArtTicks: 480,
    tagCooldown: 420,
    throwRange: 1.25,
    throwBreakWindow: 10,
    wallSplatX: 8.45,
    hitstopScale: 1.0
  };

  /* Damage scaling by hit index (0-based). Never drops below the floor. */
  var SCALING = [1.00, 0.90, 0.82, 0.74, 0.68, 0.62, 0.57, 0.52, 0.48, 0.44, 0.41, 0.38, 0.35, 0.33, 0.31, 0.29, 0.28, 0.27, 0.26, 0.25];
  var SCALING_FLOOR = 0.25;

  /* ------------------------------------------------------------- archetypes */
  /* Palette, silhouette and stat identity. `rig` selects the mesh builder. */
  var FIGHTERS = [
    {
      id: 'kaia', name: 'KAIA VENN', title: 'The Adaptive Vanguard', arch: 'ALL-ROUNDER',
      hp: 100, speed: 1.00, weight: 1.00, jump: 1.00, dash: 1.00,
      colors: { primary: 0x1f6d6a, secondary: 0xe9e2d0, accent: 0xf2a63b, skin: 0xd8a07a, hair: 0x231a1a, metal: 0xbfc7cc },
      rig: 'kaia',
      blurb: 'Reliable buttons, clean conversions. Best first pick.',
      special: 'Crosswind Arc', specialDesc: 'Forward carry strike',
      superName: 'Horizon Split', superDesc: 'Converging baton planes',
      furyArt: 'Vector Overload', furyArtDesc: 'Ender gains wall carry + guard crush',
      quote: 'Hold the line. Then break it.'
    },
    {
      id: 'rook', name: 'ROOK CALDER', title: 'The Faultline Grappler', arch: 'GRAPPLER',
      hp: 118, speed: 0.78, weight: 1.35, jump: 0.92, dash: 0.86,
      colors: { primary: 0x3a2b28, secondary: 0xb4552f, accent: 0xd8c9a3, skin: 0x8d5f42, hair: 0x2a1c14, metal: 0x8e8a80 },
      rig: 'rook',
      blurb: 'Command grab punishes passive guard. Slow to close distance.',
      special: 'Anchor Clinch', specialDesc: 'Command grab, side switch',
      superName: 'Ground Zero Driver', superDesc: 'Cinematic throw confirm',
      furyArt: 'Faultline Press', furyArtDesc: 'Enders guard-crush and carry',
      quote: 'Everything breaks. I just pick when.'
    },
    {
      id: 'mira', name: 'MIRA SOL', title: 'The Flash Runner', arch: 'RUSHDOWN',
      hp: 90, speed: 1.20, weight: 0.85, jump: 1.10, dash: 1.25,
      colors: { primary: 0xff6f5e, secondary: 0xf6f2ea, accent: 0x2ec6ff, skin: 0xc98b62, hair: 0x1b2a3a, metal: 0xdfe6ea },
      rig: 'mira',
      blurb: 'Fast entry and tight pressure. Low health, real recovery.',
      special: 'Flashline', specialDesc: 'Dash strike, low reward on block',
      superName: 'Sunbreak Relay', superDesc: 'Multi-beat rush finish',
      furyArt: 'Afterburn', furyArtDesc: 'Special gains extra carry and a second hit',
      quote: 'Blink and you already lost.'
    },
    {
      id: 'sable', name: 'SABLE QUILL', title: 'The Glass Cartographer', arch: 'ZONER / TRAPPER',
      hp: 92, speed: 0.94, weight: 0.9, jump: 1.05, dash: 0.95,
      colors: { primary: 0x3b3470, secondary: 0xb8894a, accent: 0x8ff0cf, skin: 0x7a5a48, hair: 0x2b2b3a, metal: 0xc9b27a },
      rig: 'sable',
      blurb: 'Controls the lane with shots and armed traps. Frail up close.',
      special: 'Prism Shot', specialDesc: 'Fast low-damage lane projectile',
      special2: 'Delayed Meridian', special2Desc: 'Armed floor trap',
      superName: 'Constellation Fall', superDesc: 'Staged projectile pattern',
      furyArt: 'Parallax Surge', furyArtDesc: 'Shots pierce and trap arms instantly',
      quote: 'The map is already written.'
    }
  ];

  /* ------------------------------------------------------------- move tables
     Roles drive FreeStyle legality:
       starter  opens a route from neutral / punish
       link     continues grounded pressure
       launcher puts the target airborne
       extender keeps an airborne target in the route
       ender    closes the route
     `cancelTo` lists roles this move may cancel into after a confirmed hit.
     `cancelFrom` is derived by the engine, not authored twice.
  */
  function m(o) {
    return {
      id: o.id, name: o.name, cmd: o.cmd || '', roles: o.roles || [],
      startup: o.startup, active: o.active, recovery: o.recovery,
      dmg: o.dmg || 0, chip: o.chip == null ? 0.12 : o.chip,
      hitstun: o.hitstun || 14, blockstun: o.blockstun || 9,
      hitstop: o.hitstop || 5, kb: o.kb || 2.0, launch: o.launch || 0,
      range: o.range || 1.6, hitY: o.hitY == null ? 1.15 : o.hitY,
      height: o.height || 1.1,
      low: !!o.low, overhead: !!o.overhead, throwMove: !!o.throwMove,
      antiAir: !!o.antiAir, moveF: o.moveF || 0, moveFrames: o.moveFrames || 0,
      cancelTo: o.cancelTo || [], meterGain: o.meterGain || 6, furyGain: o.furyGain || 3,
      guardDmg: o.guardDmg || 6, juggleCost: o.juggleCost || 18,
      invuln: o.invuln || null, armor: o.armor || 0, cost: o.cost || 0,
      sfx: o.sfx || 'hitLight', vfx: o.vfx || 'light', projectile: o.projectile || null,
      trap: o.trap || null, hits: o.hits || 1, superMove: !!o.superMove,
      desc: o.desc || ''
    };
  }

  var BASE = {
    kaia: [
      m({ id: 'kaia.5L', name: 'Vector Check', cmd: 'J', roles: ['starter', 'link'], startup: 5, active: 3, recovery: 9, dmg: 5, hitstun: 15, blockstun: 10, hitstop: 4, kb: 1.6, range: 1.55, cancelTo: ['link', 'launcher', 'special'], meterGain: 5, furyGain: 2, vfx: 'light', sfx: 'hitLight', desc: 'Fast mid check that starts low-risk routes.' }),
      m({ id: 'kaia.5H', name: 'Meridian Cut', cmd: 'K', roles: ['link', 'extender', 'ender'], startup: 11, active: 4, recovery: 18, dmg: 11, hitstun: 20, blockstun: 13, hitstop: 6, kb: 3.0, range: 1.95, cancelTo: ['launcher', 'super'], meterGain: 8, furyGain: 4, guardDmg: 10, juggleCost: 22, vfx: 'heavy', sfx: 'hitHeavy', desc: 'Committed mid. Punishable on block, real reward on hit.' }),
      m({ id: 'kaia.2K', name: 'Low Sweep', cmd: 'L', roles: ['starter', 'ender'], startup: 8, active: 3, recovery: 15, dmg: 8, low: true, hitstun: 16, blockstun: 10, hitstop: 5, kb: 2.4, range: 1.7, hitY: 0.55, height: 0.7, cancelTo: ['link', 'launcher'], meterGain: 6, furyGain: 3, guardDmg: 8, vfx: 'light', sfx: 'hitLow', desc: 'Low with a clear tell. Challenges standing guard.' }),
      m({ id: 'kaia.4C', name: 'Meridian Break', cmd: 'U', roles: ['launcher'], startup: 13, active: 4, recovery: 24, dmg: 12, hitstun: 26, blockstun: 14, hitstop: 7, kb: 2.2, launch: 9.4, range: 1.85, cancelTo: ['extender', 'super'], meterGain: 9, furyGain: 4, guardDmg: 12, juggleCost: 0, vfx: 'launch', sfx: 'hitLaunch', antiAir: true, desc: 'Rising baton strike. Big reward, punishable whiff.' }),
      m({ id: 'kaia.6S', name: 'Crosswind Arc', cmd: 'I', roles: ['starter', 'extender'], startup: 12, active: 5, recovery: 20, dmg: 10, hitstun: 20, blockstun: 12, hitstop: 6, kb: 3.4, range: 1.9, moveF: 2.4, moveFrames: 10, cancelTo: ['launcher', 'ender'], meterGain: 8, furyGain: 4, guardDmg: 10, juggleCost: 26, vfx: 'heavy', sfx: 'whooshHeavy', desc: 'Forward carry strike. Carries the opponent toward the wall.' }),
      m({ id: 'kaia.SUP', name: 'Horizon Split', cmd: 'O', roles: ['ender', 'super'], startup: 10, active: 4, recovery: 30, dmg: 34, hitstun: 34, blockstun: 16, hitstop: 10, kb: 5.0, range: 2.7, cost: 100, superMove: true, hits: 4, meterGain: 0, furyGain: 0, guardDmg: 0, invuln: [0, 14], vfx: 'super', sfx: 'super', desc: 'Two baton arcs converge into a force plane.' })
    ],
    rook: [
      m({ id: 'rook.5L', name: 'Iron Palm', cmd: 'J', roles: ['starter', 'link'], startup: 6, active: 3, recovery: 11, dmg: 6, hitstun: 16, blockstun: 11, hitstop: 5, kb: 1.8, range: 1.6, cancelTo: ['link', 'launcher', 'special'], meterGain: 6, furyGain: 2, guardDmg: 8, vfx: 'light', sfx: 'hitHeavy', desc: 'Heavy-handed check with short reach for a big man.' }),
      m({ id: 'rook.5H', name: 'Breakwater Lariat', cmd: 'K', roles: ['link', 'extender', 'ender'], startup: 15, active: 5, recovery: 23, dmg: 15, hitstun: 22, blockstun: 15, hitstop: 8, kb: 3.6, range: 2.05, cancelTo: ['launcher', 'super'], meterGain: 10, furyGain: 5, guardDmg: 16, juggleCost: 26, vfx: 'heavy', sfx: 'hitHeavy', desc: 'Strong mid. Heavily unsafe if guarded.' }),
      m({ id: 'rook.2K', name: 'Foundation Sweep', cmd: 'L', roles: ['starter', 'ender'], startup: 10, active: 3, recovery: 17, dmg: 9, low: true, hitstun: 17, blockstun: 11, hitstop: 5, kb: 2.6, range: 1.75, hitY: 0.55, height: 0.7, cancelTo: ['link', 'launcher'], meterGain: 6, furyGain: 3, guardDmg: 10, vfx: 'light', sfx: 'hitLow', desc: 'Slow low that sets up the strike/throw decision.' }),
      m({ id: 'rook.4C', name: 'Crater Lift', cmd: 'U', roles: ['launcher'], startup: 17, active: 4, recovery: 26, dmg: 14, hitstun: 27, blockstun: 15, hitstop: 8, kb: 2.0, launch: 10.0, range: 1.9, cancelTo: ['extender', 'super'], meterGain: 10, furyGain: 5, guardDmg: 14, vfx: 'launch', sfx: 'hitLaunch', antiAir: true, desc: 'Massive vertical launcher. Whiff-punish bait.' }),
      m({ id: 'rook.6S', name: 'Anchor Clinch', cmd: 'I', roles: ['special', 'grab'], startup: 9, active: 3, recovery: 26, dmg: 18, hitstun: 30, blockstun: 0, hitstop: 9, kb: 1.2, range: 1.3, throwMove: true, cancelTo: [], meterGain: 12, furyGain: 6, guardDmg: 0, vfx: 'grab', sfx: 'grab', desc: 'Command grab. Beats guard, loses to jump and backdash.' }),
      m({ id: 'rook.SUP', name: 'Ground Zero Driver', cmd: 'O', roles: ['ender', 'super'], startup: 11, active: 4, recovery: 32, dmg: 42, hitstun: 36, blockstun: 18, hitstop: 12, kb: 5.4, range: 2.4, cost: 100, superMove: true, hits: 3, meterGain: 0, furyGain: 0, guardDmg: 0, invuln: [0, 16], vfx: 'super', sfx: 'super', desc: 'Cinematic throw confirm. Does not catch airborne targets.' })
    ],
    mira: [
      m({ id: 'mira.5L', name: 'Spark Jab', cmd: 'J', roles: ['starter', 'link'], startup: 3, active: 3, recovery: 7, dmg: 4, hitstun: 14, blockstun: 9, hitstop: 3, kb: 1.3, range: 1.4, cancelTo: ['link', 'launcher', 'special'], meterGain: 4, furyGain: 2, guardDmg: 5, vfx: 'light', sfx: 'hitLight', desc: 'Fastest jab in the roster. Low reward, high pressure.' }),
      m({ id: 'mira.5H', name: 'Ribbon Kick', cmd: 'K', roles: ['link', 'extender', 'ender'], startup: 8, active: 3, recovery: 15, dmg: 9, hitstun: 18, blockstun: 12, hitstop: 5, kb: 2.6, range: 1.8, cancelTo: ['launcher', 'super'], meterGain: 7, furyGain: 3, guardDmg: 8, juggleCost: 20, vfx: 'heavy', sfx: 'hitLight', desc: 'Fast mid kick. Tight but real recovery.' }),
      m({ id: 'mira.2K', name: 'Slip Sweep', cmd: 'L', roles: ['starter', 'ender'], startup: 6, active: 3, recovery: 12, dmg: 7, low: true, hitstun: 15, blockstun: 9, hitstop: 4, kb: 2.2, range: 1.6, hitY: 0.5, height: 0.65, cancelTo: ['link', 'launcher'], meterGain: 5, furyGain: 3, guardDmg: 7, vfx: 'light', sfx: 'hitLow', desc: 'Quick low. Great starter, weak on block.' }),
      m({ id: 'mira.4C', name: 'Rising Pulse', cmd: 'U', roles: ['launcher'], startup: 10, active: 3, recovery: 21, dmg: 10, hitstun: 24, blockstun: 13, hitstop: 6, kb: 2.0, launch: 9.0, range: 1.6, cancelTo: ['extender', 'super'], meterGain: 8, furyGain: 4, guardDmg: 9, vfx: 'launch', sfx: 'hitLaunch', antiAir: true, desc: 'Fast, short launcher. Modest damage, strong routes.' }),
      m({ id: 'mira.6S', name: 'Flashline', cmd: 'I', roles: ['starter', 'extender'], startup: 8, active: 4, recovery: 17, dmg: 8, hitstun: 18, blockstun: 9, hitstop: 5, kb: 2.8, range: 1.7, moveF: 3.2, moveFrames: 8, cancelTo: ['launcher', 'ender'], meterGain: 7, furyGain: 4, guardDmg: 8, juggleCost: 22, vfx: 'dash', sfx: 'whoosh', desc: 'Dash strike. Nearly free on hit, punishable on block.' }),
      m({ id: 'mira.SUP', name: 'Sunbreak Relay', cmd: 'O', roles: ['ender', 'super'], startup: 8, active: 4, recovery: 28, dmg: 30, hitstun: 32, blockstun: 15, hitstop: 9, kb: 5.2, range: 2.5, cost: 100, superMove: true, hits: 5, meterGain: 0, furyGain: 0, guardDmg: 0, invuln: [0, 12], vfx: 'super', sfx: 'super', desc: 'Multi-beat rush with a readable opening and finish.' })
    ],
    sable: [
      m({ id: 'sable.5L', name: 'Lens Tap', cmd: 'J', roles: ['starter', 'link'], startup: 5, active: 3, recovery: 10, dmg: 4, hitstun: 15, blockstun: 10, hitstop: 4, kb: 1.5, range: 1.35, cancelTo: ['link', 'launcher', 'special'], meterGain: 5, furyGain: 2, guardDmg: 5, vfx: 'light', sfx: 'hitLight', desc: 'Short poke. Keeps space honest, not a pressure tool.' }),
      m({ id: 'sable.5H', name: 'Quill Arc', cmd: 'K', roles: ['link', 'extender', 'ender'], startup: 10, active: 4, recovery: 18, dmg: 10, hitstun: 19, blockstun: 12, hitstop: 6, kb: 2.8, range: 1.8, cancelTo: ['launcher', 'super'], meterGain: 8, furyGain: 4, guardDmg: 9, juggleCost: 22, vfx: 'heavy', sfx: 'hitHeavy', desc: 'Wide bow arc. Good reach for a zoner.' }),
      m({ id: 'sable.2K', name: 'Survey Sweep', cmd: 'L', roles: ['starter', 'ender'], startup: 8, active: 3, recovery: 14, dmg: 7, low: true, hitstun: 16, blockstun: 10, hitstop: 5, kb: 2.2, range: 1.6, hitY: 0.5, height: 0.65, cancelTo: ['link', 'launcher'], meterGain: 6, furyGain: 3, guardDmg: 8, vfx: 'light', sfx: 'hitLow', desc: 'Low that buys space for a setup.' }),
      m({ id: 'sable.4C', name: 'Meridian Hook', cmd: 'U', roles: ['launcher'], startup: 12, active: 3, recovery: 23, dmg: 9, hitstun: 25, blockstun: 14, hitstop: 6, kb: 2.0, launch: 9.2, range: 1.7, cancelTo: ['extender', 'super'], meterGain: 9, furyGain: 4, guardDmg: 9, vfx: 'launch', sfx: 'hitLaunch', antiAir: true, desc: 'Launcher that also buys time to arm a trap.' }),
      m({ id: 'sable.6S', name: 'Prism Shot', cmd: 'I', roles: ['starter', 'special'], startup: 12, active: 1, recovery: 22, dmg: 7, hitstun: 17, blockstun: 10, hitstop: 4, kb: 2.0, range: 0, cancelTo: [], meterGain: 7, furyGain: 3, guardDmg: 6, vfx: 'shot', sfx: 'shot', projectile: { speed: 0.30, y: 1.15, radius: 0.38, life: 90, dmg: 7, hitstun: 17, kb: 2.0 }, desc: 'Fast lane projectile. Low damage, strong control.' }),
      m({ id: 'sable.2S', name: 'Delayed Meridian', cmd: 'I + S', roles: ['special'], startup: 16, active: 1, recovery: 24, dmg: 0, range: 0, cancelTo: [], meterGain: 4, furyGain: 2, guardDmg: 0, vfx: 'trap', sfx: 'trap', trap: { arm: 40, radius: 0.95, dmg: 12, hitstun: 24, kb: 2.6, life: 300 }, desc: 'Arms a floor trap. Visible cue, punishable placement.' }),
      m({ id: 'sable.SUP', name: 'Constellation Fall', cmd: 'O', roles: ['ender', 'super'], startup: 12, active: 4, recovery: 30, dmg: 32, hitstun: 34, blockstun: 16, hitstop: 9, kb: 4.8, range: 3.2, cost: 100, superMove: true, hits: 4, meterGain: 0, furyGain: 0, guardDmg: 0, invuln: [0, 15], vfx: 'super', sfx: 'super', desc: 'Staged projectile pattern with safe visual lanes.' })
    ]
  };

  var THROW = m({
    id: 'shared.throw', name: 'Rift Throw', cmd: 'J+K', roles: ['throw'], startup: 5, active: 3, recovery: 24,
    dmg: 13, hitstun: 30, blockstun: 0, hitstop: 8, kb: 2.0, range: 1.25, throwMove: true,
    cancelTo: [], meterGain: 9, furyGain: 5, guardDmg: 0, vfx: 'grab', sfx: 'grab',
    desc: 'Unblockable at point blank. Breaks with the throw input.'
  });

  /* Index moves per fighter and derive reverse cancel lookup. */
  var MOVES = {};
  FIGHTERS.forEach(function (f) {
    var list = BASE[f.id].slice();
    list.push(THROW);
    MOVES[f.id] = {};
    list.forEach(function (mv) { MOVES[f.id][mv.id] = mv; });
  });

  /* ---------------------------------------------------------------- stages */
  var STAGES = [
    {
      id: 'foundry', name: 'NEON FOUNDRY', sub: 'INDUSTRIAL FORGE · SECTOR 04',
      sky: 0x0a1119, fog: 0x0d1720, fogNear: 22, fogFar: 74,
      floor: 0x2a2f36, floorLine: 0x5b6a78, wall: 0x1a2029,
      key: 0xffc07a, keyInt: 1.25, rim: 0x39d7ff, rimInt: 0.9,
      accent: 0xff6a2a, emissive: 0xff7a2e, ambient: 0x33465a,
      ambience: 'foundry'
    },
    {
      id: 'temple', name: 'SKY TEMPLE RELAY', sub: 'SIGNAL ARRAY · ELEVATION 2,840M',
      sky: 0x2b3d5c, fog: 0x8fa6bd, fogNear: 30, fogFar: 96,
      floor: 0x8e9298, floorLine: 0xc3c9cf, wall: 0x5d6a78,
      key: 0xfff0d0, keyInt: 1.5, rim: 0x7fb6ff, rimInt: 0.7,
      accent: 0xffd9a0, emissive: 0x9fd8ff, ambient: 0x6f8aa8,
      ambience: 'temple'
    }
  ];

  /* ------------------------------------------------------------- AI presets */
  var AI_LEVELS = {
    rookie: { react: 22, block: 0.34, punish: 0.30, aggro: 0.42, combo: 0.25, throw: 0.10, fury: 0.20, tag: 0.05 },
    normal: { react: 14, block: 0.56, punish: 0.55, aggro: 0.55, combo: 0.55, throw: 0.22, fury: 0.45, tag: 0.15 },
    veteran: { react: 8, block: 0.74, punish: 0.78, aggro: 0.62, combo: 0.80, throw: 0.34, fury: 0.65, tag: 0.28 },
    rift: { react: 5, block: 0.86, punish: 0.92, aggro: 0.70, combo: 0.94, throw: 0.42, fury: 0.80, tag: 0.38 }
  };

  RB.TUNING = TUNING;
  RB.SCALING = SCALING;
  RB.SCALING_FLOOR = SCALING_FLOOR;
  RB.FIGHTERS = FIGHTERS;
  RB.MOVES = MOVES;
  RB.THROW = THROW;
  RB.STAGES = STAGES;
  RB.AI_LEVELS = AI_LEVELS;
  RB.FIGHTER_BY_ID = FIGHTERS.reduce(function (a, f) { a[f.id] = f; return a; }, {});
})(typeof globalThis !== 'undefined' ? globalThis : this);
