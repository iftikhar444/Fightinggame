# RIFTBOUND — what "much better" actually costs

This is an honest effort estimate for moving from the current build to a visibly better game.
Hours are **focused agent-hours** (one agent working without waiting on you). Human wall-clock is
usually 1.3–1.8× that once review, taste calls and iteration are included.

Current state: playable MVP, 4 fighters, 2 arenas, deterministic 60 Hz combat, full HUD/menus,
FreeStyle + Fury + Super + Tag, 44 sim tests + 23 browser tests passing.

---

## Tier 1 — "it looks like a real game" (≈ 10–14 agent-hours)

The gap between "functional prototype" and "screenshot I would post" is almost entirely art and feel.
Nothing here changes rules.

| Work | Hours | What changes |
|---|---|---|
| Character art pass: better proportions, 2-bone limbs with volume, hands/feet, hair/armour shapes, per-fighter silhouette detail | 3–4 | Fighters stop reading as blocks |
| Hand-tuned key poses + timing curves per attack (anticipation → contact → follow-through), 2–3 frame smear/impact holds | 3–4 | Attacks feel like they hit |
| Lighting/material pass: per-stage colour script, character rim light, contact shadows, subtle AO decals under feet | 2 | Characters pop off the background |
| Stage detail: real composition, depth layers, prop variety, per-stage parallax | 2–3 | Stages stop looking like grayboxes |
| Camera work: hit-framing, dash-in, KO push-in, super angle | 1–2 | Moment-to-moment drama |
| UI/UX polish: transitions between screens, hit-confirm flash on HUD, readable meter feedback | 1 | Feels finished |

**Result:** a vertical slice that reads as a deliberate stylised fighter rather than a prototype.
This is the highest return per hour by a wide margin.

---

## Tier 2 — "it plays like a real fighting game" (≈ 14–20 agent-hours)

| Work | Hours | What changes |
|---|---|---|
| Frame-data tuning pass with a real training mode (frame advantage display, punish counter, recording/playback dummy) | 4–6 | Neutral actually works |
| Per-fighter move-kit expansion: 2–3 more normals, an anti-air, a command normal, 2 specials each | 5–6 | Matchups become real |
| Animation variety: hit reactions by direction, alternate knockdowns, intro/outro/victory poses | 3–4 | Fights stop looking repetitive |
| Audio pass: layered impacts, per-material hits, dynamic music, announcer | 2–3 | Weight and feedback |
| Balance + regression suite expansion (per-matchup smoke tests, combo route tests) | 2 | Fewer "why did that whiff" moments |

**Result:** something two experienced players can play for 30 minutes without running out of game.

---

## Tier 3 — "a shippable indie fighter" (≈ 40–60 agent-hours)

- **4 more fighters** with genuinely different systems (stance, charge, puppet, parry) — 16–20 h
- **4 more stages** with unique geometry and camera rails — 8–10 h
- **Training mode depth**: hitbox display, frame data, dummy recording, punish trainer — 6–8 h
- **Replays + local tournament flow** — 5–7 h
- **Accessibility**: colour-blind palettes, reduced flash/shake, remappable keys, subtitle/announcer
  options — 3–4 h
- **Onboarding**: tutorial that teaches guard, throw break, FreeStyle route, Fury — 4–5 h
- **Performance budget pass** across GPU tiers — 3–4 h

**Result:** a complete local product you could put on itch.io.

---

## Tier 4 — the full design-pack vision (≈ 120–200 agent-hours)

12 fighters, 8 bespoke stages, story/arcade, Duo Super, tag routes, and — the big one —
**online play with rollback netcode** (30–60 h on its own, and it forces a simulation refactor and a
real test harness for desyncs). This is a multi-month project, not a sprint.

---

## If you only have one afternoon

Spend **4 hours** on: character proportions (1.5 h), attack anticipation/impact poses (1.5 h), and a
lighting + contact-shadow pass (1 h). That single afternoon buys most of the perceived quality jump,
because silhouette and light are what people read before they read detail.

## What not to spend time on yet

- More fighters before the existing four feel good.
- Online code before the local game is stable.
- Post-processing (bloom, DOF) before lighting and silhouettes are right — it hides problems instead
  of fixing them.
- More VFX. Fewer, sharper, shorter effects beat more particles.
