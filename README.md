# RIFTBOUND: CLASH PROTOCOL

An original 3D fighting-game MVP built with **TypeScript-free vanilla JS + Three.js**, shipped as a
**single offline HTML file**. No install, no network, no build server required to play.

> This is a **complete local indie-scale MVP**, not a AAA-equivalent fighter. Four fighters, two
> arenas, one deterministic 60 Hz combat engine, and an honest list of what is still placeholder.

---

## Play it

```
dist/riftbound.html      <- double-click this. That is the whole game.
```

Or from a terminal:

```bash
node build.mjs                       # rebuild dist/riftbound.html from src/
start dist/riftbound.html            # Windows
```

If your browser blocks `file://` for any reason, serve the folder instead:

```bash
python -m http.server 8080
# then open http://localhost:8080/dist/riftbound.html
```

## Test it

```bash
node test/sim.test.mjs        # 44 headless combat assertions, no browser needed
node test/browser.test.mjs    # 23 end-to-end checks + screenshots (needs playwright-core)
```

`test/sim.test.mjs` loads the real simulation modules in a Node `vm` context, so it tests the exact
code the game runs. `test/browser.test.mjs` drives the real UI in headless Chromium: title → select →
match → KO → result → practice → tag, and fails on any console error.

---

## Controls

**Guard is holding away from your opponent** (standard fighting-game convention).

| Action | Player 1 | Player 2 |
|---|---|---|
| Walk / guard | `A` `D` (hold back) | `←` `→` (hold back) |
| Jump / crouch | `W` / `S` | `↑` / `↓` |
| Light / Heavy / Kick | `J` / `K` / `L` | `1` / `2` / `3` (or numpad) |
| Launcher | `U` | `4` |
| Special | `I` (Sable: `S`+`I` for trap) | `5` |
| Super | `O` | `6` |
| Fury Burst / Fury Art | `H` / `G` | `7` / `8` |
| Throw / Tag | `Y` / `T` | `0` / `9` |

**System keys** — `Esc` pause · `F1` hitbox + state overlay · `F2` reset positions · `F3` fill meters ·
`F4` slow motion · `M` mute.

Gamepads are supported when present (first pad = P1, second pad = P2).

---

## What is actually implemented

### Combat core
- Fixed **60 Hz simulation**, decoupled from render rate. Same inputs + same seed = same outcome
  (asserted in tests).
- Startup / active / recovery frame data on every move, authored as data, never inferred from meshes.
- Explicit hitboxes and hurtboxes; vertical and horizontal reach are separate checks.
- Hit / block / counter-hit / punish states, hitstop, hitstun, blockstun, guard meter and guard crush.
- Lows beat standing guard; throws beat passive guard; throws can be broken inside a 10-frame window.
- Knockdown → wake-up with invulnerability, wall splat once per combo, arena bounds enforced.
- Best-of-three rounds, 60-second timer, time-over judged on remaining health ratio.

### FreeStyle (the combo grammar)
Routes are validated, not free-form animation cancels:

```
starter → link → launcher → extender → ender
```

- Every move declares `roles` and `cancelTo`; a cancel is only legal after a **confirmed hit** and
  only into an allowed role.
- Per-combo repeat limit (2 per move, 1 per launcher/super) blocks loops.
- Damage scaling from 100% down to a 25% floor, juggle budget, hitstun decay.
- Route drops are reported in the debug overlay with a reason (`repeatLimit`, etc.).

### Fury (separate from Super meter)
- Builds from taking damage, blocking, and landing hits.
- **Fury Burst** (60): defensive shock that pushes the opponent away. Usable *out of hitstun*, with
  invulnerability and a real 26-frame recovery. Refused when you don't have the resource.
- **Fury Art** (40): 8-second explicit buff — +15% damage, stronger guard damage on enders. No hidden
  speed or priority changes.

### Supers
- One Super per fighter, one shared implementation, four data-driven variations.
- Costs the full meter exactly once; validated range at activation, so it can genuinely whiff.
- Multi-hit cinematic with a real opponent hit state, real damage, and a real knockdown at the end.
- Camera pulls in during the cinematic; the opponent stays on screen.

### Tag Duo
- Two fighters per side, shared match, partner has their own health bar and tag cooldown.
- `T` swaps and the incoming partner performs a **tag-in strike** (the assist action) with its own
  hitbox, which can extend a combo and adds scaling.
- A KO'd active fighter forces the partner in before the round can be lost.

### Presentation
- Two arenas sharing one tested combat footprint: **Neon Foundry** (industrial, warm key / cyan rim,
  molten channel, furnace arch, embers) and **Sky Temple Relay** (dawn, columns, rotating signal
  array, drifting clouds).
- Procedural rig with a shared skeleton and four silhouettes (batons, gauntlets + coat, energy fins,
  mantle + bow), 30+ pose states, and pose blending that follows simulation state.
- Pooled additive VFX for light/heavy/launcher/guard/counter/fury/super, screen flash, camera shake,
  camera kick, damage popups.
- Fully procedural WebAudio SFX and per-stage ambience — no external audio files.
- Adaptive resolution: if the frame rate drops, pixel ratio and effect budget step down automatically.

---

## Roster

| Fighter | Archetype | Identity | Special | Super |
|---|---|---|---|---|
| **Kaia Venn** | All-rounder | Clean conversions, honest buttons | Crosswind Arc (forward carry) | Horizon Split |
| **Rook Calder** | Grappler | Command grab punishes guard, slow approach | Anchor Clinch (grab) | Ground Zero Driver |
| **Mira Sol** | Rushdown | Fastest jab, real recovery, low health | Flashline (dash strike) | Sunbreak Relay |
| **Sable Quill** | Zoner / trapper | Lane control, armed floor trap, frail up close | Prism Shot / Delayed Meridian | Constellation Fall |

Each has distinct health, speed, weight, jump, dash, reach and frame data — not just a palette swap.

---

## Architecture

```
src/
  00_util.js    math, seeded RNG, easing            (no DOM, no THREE)
  01_data.js    fighters, move tables, tuning       (pure data)
  02_sim.js     fixed-step combat, hits, resources  (no DOM, no THREE)
  03_ai.js      input-mask AI                       (no DOM, no THREE)
  04_audio.js   procedural WebAudio
  05_vfx.js     pooled effects
  06_stage.js   two arenas
  07_rig.js     shared skeleton + procedural poses
  08_view.js    renderer, camera, event consumption
  09_ui.js      DOM screens, HUD, popups
  10_main.js    loop, input routing, match flow
build.mjs       inlines vendor + css + modules -> dist/riftbound.html
```

Rules the code actually follows:

- `00`–`03` have **zero** rendering imports, so the simulation is testable in Node and deterministic.
- Rendering only *reads* simulation state; it can never decide a hit.
- Randomness in the simulation uses a seeded PRNG, not `Math.random`.
- Input is sampled per simulation tick with a press latch, so a one-frame tap is not lost.

---

## Known issues and honest limitations

- **Art is stylized primitives**, not production character art. Silhouettes and colour blocking are
  deliberate; anatomy, faces and cloth are not.
- **Animation is procedural**, not hand-keyed or motion-captured. Attacks read correctly but lack
  bespoke anticipation/follow-through per fighter.
- **No sidestep/depth movement** — the MVP ships dash and backdash instead (the design doc allows
  either). Depth rails are reserved but unused.
- **Tag partner is auto-assigned** to the next fighter in the roster rather than picked separately.
- **No online play, no rollback, no ranked, no story mode.** Deliberately out of MVP scope.
- **No throw-tech animation variety**, no clash system, no armour moves yet.
- Balance is tuned by hand and unit tests, **not by playtest telemetry**. Frame data will need a pass
  with real players.
- The `test/browser.test.mjs` run needs `playwright-core`; if it is not installed it falls back to a
  path in the local managed Node workspace.
- Audio requires one click/keypress before the WebAudio context unlocks (browser policy).

## Credits and licensing

- **Three.js** (r150 UMD build) — MIT License, © three.js authors. Vendored in `vendor/`.
- **All game content** — fighters, move names, stages, VFX, audio, UI — is original and procedurally
  generated in this project. No third-party characters, choreography, logos, music, stages or ripped
  assets are used. Fighting-game references were used only for high-level principles.
- The design pack (`RIFTBOUND_14_Day_MVP_Design_Pack`) is the source brief for scope and systems.

## Scope note

The 14-day target is a complete local MVP. The full 12-fighter / 8-stage / online vision remains
post-MVP and is not claimed here.
