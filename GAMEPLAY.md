# RIFTBOUND — Gameplay, Systems & Balance

Design notes for the combat layer. Every number in this document exists in
`src/01_data.js` under `TUNING` or in a fighter's move table, so the doc and the
build cannot drift apart.

---

## 1. Design pillars

Three reference clips set the target: a painted 2D fighter with huge elemental
impacts, a neon night stage with green energy rings and super portrait cut-ins,
and an industrial junkyard fighter with loud combo counters and 2D cut-ins.

They all agree on four things, and those became the pillars:

| Pillar | What it means in play |
|---|---|
| **Reads in one frame** | Every important state — counter, parry, overdrive, super — is legible from silhouette and colour alone, without reading text. |
| **Commitment is punished** | Every strong option has a real recovery window. There is no safe pressure that also deals damage. |
| **Defence is a skill, not a wall** | Blocking is free but loses to lows, throws and chip. Parry is the *earned* defence: it costs timing, not resources. |
| **Comeback is earned, not given** | Overdrive pays you more for the same risks. It never hands you a free escape. |

---

## 2. The core loop

```
neutral  →  poke / dash / special  →  confirm  →  FreeStyle route  →  knockdown
   ↑                                                                     ↓
   └────────────────  wake-up / okizeme / reset  ←───────────────────────┘
```

Three resources run underneath it:

- **Guard** (100) — drains on block, regenerates when not blocking. At 0 you get
  guard-crushed and eat a full combo.
- **Super meter** (100) — builds from dealing and taking damage. Spends on the
  character super.
- **Fury** (100) — builds mostly from *taking* damage. Spends on Fury Burst
  (a reversal) or Fury Art (a buff). This is the "I'm losing, give me a tool"
  resource.

---

## 3. New systems

### 3.1 Just Guard (parry)

Hold guard **within 4 ticks** of the hit connecting.

| | |
|---|---|
| Input | hold away, timed |
| Window | `parryWindow: 4` ticks (67 ms) |
| On success | no chip, guard refunded +14, +16 meter, +6 fury |
| Attacker | stunned `parryStun: 22` ticks — fully punishable |
| Excluded | supers and throws |

**Why it exists.** Blocking is currently a pure numbers game: hold back, absorb
chip, wait. Parry turns the same input into a read. It costs nothing but timing,
so it is available from round one and does not compete with meter.

**Counterplay.** The window is short enough that mashing guard does not parry —
you have to be holding guard *freshly* when the hit lands. Guard held for more
than 4 ticks is an ordinary block. Deliberately excluded from supers and throws
so a single defensive option cannot invalidate a grappler's whole kit.

**Risk/reward.** Whiff the timing and you block normally, so the downside is
small. The upside is a full punish. That asymmetry is intentional — it makes
parry a low-risk read rather than a gamble, which suits a 60-second round.

### 3.2 Element Burst (counter / punish)

Each fighter carries an element. Landing a **counter hit** (hitting during the
opponent's startup) or a **punish** (hitting during their recovery) pops it.

| | |
|---|---|
| Trigger | `counter` or `punish` on a clean hit |
| Damage | ×1.25 counter, plus `burstDamage: 1.06` |
| Meter | `+burstMeter: 10` on top of normal gain |
| Hitstop | `+burstHitstop: 4` ticks |
| Visual | element-coloured ring, radial spokes, screen flash |

| Fighter | Element | Colour |
|---|---|---|
| Kaia Venn | EMBER | `#ff8a3a` |
| Rook Calder | QUAKE | `#ffc247` |
| Mira Sol | VOLT | `#2ec6ff` |
| Sable Quill | VOID | `#b47cff` |

**Why it exists.** It gives the counter-hit system a *feel*, not just a damage
multiplier. The reference clips sell every big hit with a coloured ring; this
ties that colour to the attacker's identity instead of using one generic spark.

**Counterplay.** The burst is a reward for reading, and the read is always
available: every move has visible startup. It also means blind pressure is
expensive — throwing out a heavy on a guess can be punished for ~30% more.

### 3.3 Overdrive (comeback)

Below **30% health** a fighter is permanently in Overdrive for the rest of the
round.

| | |
|---|---|
| Trigger | `hp <= maxHp * overdriveAt (0.30)` |
| Damage | `overdriveDmg: 1.12` |
| Meter gain | `overdriveMeter: 1.25` |
| Fury Burst cost | 60 → `overdriveBurstCost: 50` |
| Visual | element-coloured ground pulse, HUD chip, name tint |

**Why it exists.** With 90–112 health and 30–42 damage supers, a losing player
can be two touches from death with no way back. Overdrive gives the losing side
a *reason to keep taking risks* instead of turtling.

**Why it is a damage buff, not a defence buff.** A defence buff (armour, damage
reduction) rewards passivity and drags rounds out. A damage buff keeps the
losing player attacking, which is both better to watch and better to play.

**Balance side-effect.** Frail characters reach Overdrive sooner in absolute
health (Mira at 27 HP, Rook at 34), which partially compensates for their lower
health pools. That is deliberate: it makes low-HP characters feel *dangerous*
at low health rather than simply doomed.

---

## 4. Balance pass

### 4.1 Roster

| Fighter | HP | Speed | Archetype | Reaches Overdrive at |
|---|---|---|---|---|
| Kaia Venn | 100 | 1.00 | All-rounder | 30 HP |
| Rook Calder | **112** (was 118) | 0.78 | Grappler | 34 HP |
| Mira Sol | 90 | 1.20 | Rushdown | 27 HP |
| Sable Quill | 92 | 0.94 | Zoner / trapper | 28 HP |

**Why Rook came down from 118.** He already had the highest health, the highest
damage (5H 15, 4C 14, super 42) and the only unblockable. 118 made him the
correct pick in almost every matchup. 112 keeps him clearly the tankiest
(24% above Mira) without also being the highest-damage character *and* the
tankiest. Health spread is now 24%, down from 28%.

### 4.2 Why the spread is only 24%

Fighting games with wider health spreads need longer rounds to let the
difference express itself. At a 60-second round and 3 rounds, a 40% health gap
turns matchups into foregone conclusions. 24% is enough to feel the difference
in a two-touch exchange without deciding the round at the character select.

### 4.3 Damage budget

| | Light | Heavy | Launcher | Super |
|---|---|---|---|---|
| Kaia | 5 | 11 | 12 | 34 |
| Rook | 6 | 15 | 14 | 42 |
| Mira | 4 | 9 | 10 | 30 |
| Sable | 4 | 10 | 9 | 32 |

Supers are ~30–40% of a health bar: enough to close a round, not enough to win
one from full. A full FreeStyle route with scaling lands ~45–55% on most of the
cast, so a round is roughly **two clean routes**. That is the intended pace —
long enough to have a neutral game, short enough that a 60-second timer rarely
matters.

### 4.4 Scaling

`SCALING` runs 1.00 → 0.25 across 20 hits with a hard floor at 25%. Long combos
still look impressive but cannot kill from full, which is what keeps the
FreeStyle grammar from becoming a one-touch game.

---

## 5. What we took from the references — and what we did not

**Taken:**

- **Element-coloured impact rings** on big hits (all three clips).
- **Super cut-in** with speed lines, big name, element tag (all three clips).
- **Prominent counter / punish callouts** — the references shout "COUNTER HIT",
  "PUNISH", "ELEMENT BURST" at the player.
- **Combo counters** that stay on screen and grow with the count.
- **Motion trails** on fast movement.
- **Layered stages** with depth and a hero prop.

**Deliberately not taken:**

- **Full-screen portrait art.** The clips use painted 2D illustrations. This rig
  is procedural boxes, and a full-bleed crop of it reads as abstract slabs, not
  a character — it was tried and reverted. The cut-in carries the beat with
  typography, colour and motion instead, with the rendered portrait as a
  medallion. That is honest to what the geometry can support.
- **Realistic materials and lighting.** Those need authored assets. A stylised
  flat-shaded look suits box geometry better than a failed attempt at realism.
- **Free-form 3D movement.** The sim is a 2D-plane fighter by design: it is what
  makes hitboxes, juggles and frame data testable.

---

## 6. Tuning knobs

Everything below lives in `TUNING` and is safe to experiment with.

| Knob | Default | Effect |
|---|---|---|
| `parryWindow` | 4 | Bigger = more forgiving parry. Above ~8 it stops being a read. |
| `parryStun` | 22 | How hard a parry punishes. 22 ≈ a free heavy. |
| `overdriveAt` | 0.30 | Health fraction that arms Overdrive. |
| `overdriveDmg` | 1.12 | Comeback damage. Above ~1.25 it dominates. |
| `overdriveBurstCost` | 50 | Cheaper reversal while losing. |
| `burstDamage` | 1.06 | Extra on top of the ×1.25 counter multiplier. |
| `burstHitstop` | 4 | Extra freeze on a burst — pure feel, no balance effect. |
| `hitstopScale` | 1.5 | Global impact weight. |
| `SCALING_FLOOR` | 0.25 | Longest combos cannot drop below this fraction. |

---

## 7. Verification

The mechanics above are covered by headless assertions in `test/sim.test.mjs`
(56 total). The ones that matter for this document:

- guard raised inside the window parries / takes no damage / refunds guard
- a parry leaves the attacker punishable
- holding guard early is a normal block, not a parry
- low health arms overdrive / overdrive increases damage
- a counter hit pops an element burst and carries the attacker's colour
- roster health spread stays under 30%

If you retune anything, run `node test/sim.test.mjs` — the spread test and the
parry tests are the two that will catch a bad pass first.
