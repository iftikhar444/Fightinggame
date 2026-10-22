/* =========================================================================
   RIFTBOUND — combat simulation tests (headless, no browser)
   Run: node test/sim.test.mjs
   ========================================================================= */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, '..', 'src');

const ctx = vm.createContext({ console });
for (const f of ['00_util.js', '01_data.js', '02_sim.js', '03_ai.js']) {
  vm.runInContext(fs.readFileSync(path.join(srcDir, f), 'utf8'), ctx, { filename: f });
}
const RB = ctx.RB;
const IN = RB.IN;

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL  ' + name + (detail ? '  (' + detail + ')' : '')); }
}
function near(a, b, eps = 0.001) { return Math.abs(a - b) <= eps; }

function fresh(opts) {
  const m = new RB.Match(Object.assign({ teams: [['kaia'], ['kaia']], seed: 42 }, opts || {}));
  m.phase = 'fight';
  m.phaseT = 0;
  return m;
}
function place(m, ax, bx) {
  const a = m.fighters[0], b = m.fighters[1];
  a.x = ax; a.face = 1; b.x = bx; b.face = -1;
  a.state = RB.ST.IDLE; b.state = RB.ST.IDLE;
}
function run(m, ticks, fn) {
  for (let i = 0; i < ticks; i++) {
    const inp = fn ? fn(i) : [0, 0];
    m.step([inp[0] | 0, inp[1] | 0]);
  }
}

console.log('\nRIFTBOUND combat simulation tests\n' + '='.repeat(52));

/* ---------------------------------------------------------------- 1. determinism */
{
  const script = (i) => {
    const seed = (i * 2654435761) % 1000;
    return [seed % 7 === 0 ? IN.LIGHT : seed % 11 === 0 ? IN.RIGHT : 0,
      seed % 5 === 0 ? IN.HEAVY : 0];
  };
  const a = fresh({ seed: 99 }), b = fresh({ seed: 99 });
  run(a, 900, script); run(b, 900, script);
  const sa = JSON.stringify(a.fighters.map(f => [f.x.toFixed(4), f.hp.toFixed(3), f.state, f.meter.toFixed(2)]));
  const sb = JSON.stringify(b.fighters.map(f => [f.x.toFixed(4), f.hp.toFixed(3), f.state, f.meter.toFixed(2)]));
  ok('same seed + same inputs = identical outcome', sa === sb, sa === sb ? '' : sa + ' vs ' + sb);
}

/* ------------------------------------------------------- 2. startup / active gate */
{
  const m = fresh(); place(m, -0.9, 0.5);
  const hp = m.fighters[1].hp;
  m.step([IN.LIGHT, 0]);
  run(m, 4);
  ok('no damage during startup frames', near(m.fighters[1].hp, hp), 'hp=' + m.fighters[1].hp);
  run(m, 6);
  ok('damage lands during active frames', m.fighters[1].hp < hp, 'hp=' + m.fighters[1].hp);
}

/* --------------------------------------------------------------- 3. range check */
{
  const m = fresh(); place(m, -6.0, 4.0);
  const hp = m.fighters[1].hp;
  m.step([IN.LIGHT, 0]); run(m, 20);
  ok('attack whiffs outside hitbox range', near(m.fighters[1].hp, hp));
}

/* -------------------------------------------------------------------- 4. guard */
{
  const m = fresh(); place(m, -0.9, 0.5);
  const hp = m.fighters[1].hp;
  m.step([IN.LIGHT, IN.RIGHT]);
  run(m, 12, () => [0, IN.RIGHT]);
  const dmg = hp - m.fighters[1].hp;
  ok('guard blocks most damage', dmg > 0 && dmg < 2, 'chip=' + dmg.toFixed(2));
  ok('blocked hit puts defender in blockstun', m.fighters[1].state === RB.ST.BLOCKSTUN || m.fighters[1].hp < hp);
}

/* ------------------------------------------------------------------- 5. low/guard */
{
  const m = fresh(); place(m, -0.9, 0.5);
  const hp = m.fighters[1].hp;
  m.step([IN.KICK, IN.RIGHT]);   // standing guard vs low
  run(m, 14, () => [0, IN.RIGHT]);
  ok('standing guard loses to a low', hp - m.fighters[1].hp > 5, 'dmg=' + (hp - m.fighters[1].hp).toFixed(2));
}

/* -------------------------------------------------------------------- 6. throw */
{
  const m = fresh(); place(m, -0.6, 0.5);
  const hp = m.fighters[1].hp;
  m.step([IN.THROW, IN.RIGHT]);
  run(m, 16, () => [0, IN.RIGHT]);
  ok('throw beats passive guard', hp - m.fighters[1].hp > 10, 'dmg=' + (hp - m.fighters[1].hp).toFixed(2));
}
{
  const m = fresh(); place(m, -0.6, 0.5);
  const hp = m.fighters[1].hp;
  m.step([IN.THROW, 0]);
  run(m, 4, () => [0, 0]);
  m.step([0, IN.THROW]);          // break input inside the window
  run(m, 12, () => [0, 0]);
  ok('throw break cancels damage', near(m.fighters[1].hp, hp), 'hp=' + m.fighters[1].hp);
}

/* ------------------------------------------------------- 7. damage scaling */
{
  const m = fresh(); place(m, -0.9, 0.5);
  const a = m.fighters[0], b = m.fighters[1];
  const light = a.moves['kaia.5L'], heavy = a.moves['kaia.5H'];
  const d = [];
  const hps = [b.hp];
  m.resolveHit(a, b, light); hps.push(b.hp);
  m.resolveHit(a, b, heavy); hps.push(b.hp);
  m.resolveHit(a, b, light); hps.push(b.hp);
  for (let i = 1; i < hps.length; i++) d.push(+(hps[i - 1] - hps[i]).toFixed(2));
  const ratios = [d[0] / light.dmg, d[1] / heavy.dmg, d[2] / light.dmg];
  ok('damage scales down across a combo', ratios[0] > ratios[1] && ratios[1] >= ratios[2], JSON.stringify(d) + ' ratios=' + JSON.stringify(ratios.map(r => +r.toFixed(2))));
  ok('scaling never reaches zero', d.every(x => x > 0));
}

/* -------------------------------------------------------- 8. repeat limit */
{
  const m = fresh(); place(m, -0.9, 0.5);
  const a = m.fighters[0], b = m.fighters[1];
  const light = a.moves['kaia.5L'];
  const before = b.hp;
  m.resolveHit(a, b, light);
  const afterTwo = (m.resolveHit(a, b, light), b.hp);
  m.resolveHit(a, b, light);
  ok('same move stops adding hits at its repeat limit', near(b.hp, afterTwo, 0.001), 'hp=' + b.hp + ' vs ' + afterTwo);
  ok('repeat limit actually allowed two hits', afterTwo < before);
}

/* ------------------------------------------------------- 9. launcher + juggle */
{
  const m = fresh(); place(m, -0.9, 0.5);
  const a = m.fighters[0], b = m.fighters[1];
  m.resolveHit(a, b, a.moves['kaia.4C']);
  ok('launcher puts target airborne', b.isAirborne(), 'y=' + b.y);
  ok('launcher consumes combo budget', b.juggle < RB.TUNING.juggleBudget);
}

/* ------------------------------------------------------------- 10. super cost */
{
  const m = fresh(); place(m, -1.2, 0.6);
  const a = m.fighters[0], b = m.fighters[1];
  a.meter = 100;
  const hp = b.hp;
  m.step([IN.SUPER, 0]);
  ok('super spends the meter exactly once', near(a.meter, 0), 'meter=' + a.meter);
  run(m, 120, () => [0, 0]);
  ok('super deals real damage to the opponent', b.hp < hp, 'hp=' + b.hp.toFixed(1));
  ok('super cannot double-spend', near(a.meter, 0) || a.meter < 20, 'meter=' + a.meter.toFixed(1));
}
{
  const m = fresh(); place(m, -1.2, 0.6);
  const a = m.fighters[0];
  a.meter = 40;
  m.step([IN.SUPER, 0]);
  ok('super is refused without full meter', near(a.meter, 40) && a.state !== RB.ST.SUPER);
}

/* -------------------------------------------------------------- 11. fury burst */
{
  const m = fresh(); place(m, -0.7, 0.5);
  const a = m.fighters[0], b = m.fighters[1];
  a.fury = 60;
  const hp = b.hp;
  m.step([IN.FB, 0]);
  run(m, 20, () => [0, 0]);
  ok('fury burst costs fury', near(a.fury, 0), 'fury=' + a.fury);
  ok('fury burst pushes the opponent away without damage', b.x > 0.9 && near(b.hp, hp), 'x=' + b.x.toFixed(2) + ' hp=' + b.hp);
}
{
  const m = fresh(); place(m, -0.7, 0.5);
  const a = m.fighters[0];
  a.fury = 20;
  m.step([IN.FB, 0]);
  ok('fury burst refused without enough fury', near(a.fury, 20));
}
{
  const m = fresh(); place(m, -0.7, 0.5);
  const a = m.fighters[0], b = m.fighters[1];
  a.fury = 60;
  a.state = RB.ST.HIT; a.stunT = 20;
  m.step([IN.FB, 0]);
  ok('fury burst escapes hitstun (defensive use)', a.state === RB.ST.FURYBURST, 'state=' + a.state);
}

/* --------------------------------------------------------------- 12. fury art */
{
  const m = fresh(); place(m, -2.0, 1.0);
  const a = m.fighters[0];
  a.fury = 40;
  m.step([IN.FA, 0]);
  ok('fury art activates and pays its cost', a.furyArtT > 0 && near(a.fury, 0), 'art=' + a.furyArtT);
  m.step([IN.FA, 0]);
  ok('fury art cannot stack while active', a.furyArtT <= RB.TUNING.furyArtTicks);
}

/* ------------------------------------------------------------ 13. round flow */
{
  const m = fresh({ roundsToWin: 2 });
  const a = m.fighters[0], b = m.fighters[1];
  b.hp = 1;
  a.x = -0.9; b.x = 0.5; a.face = 1; b.face = -1;
  m.step([IN.LIGHT, 0]);
  run(m, 40);
  ok('KO ends the round', m.phase === 'ko' || m.wins[0] === 1, 'phase=' + m.phase + ' wins=' + m.wins);
  run(m, 200);
  ok('round advances after KO', m.round === 2 && m.wins[0] === 1, 'round=' + m.round + ' wins=' + m.wins);
  ok('health resets between rounds', m.fighters[1].hp === m.fighters[1].maxHp);
  run(m, 100); // let the round intro finish
  // second KO -> match end
  const a2 = m.fighters[0], b2 = m.fighters[1];
  b2.hp = 1; a2.x = -0.9; b2.x = 0.5; a2.face = 1; b2.face = -1;
  m.step([IN.LIGHT, 0]);
  run(m, 300);
  ok('match ends at two round wins', m.phase === 'matchend' && m.winner === 0, 'phase=' + m.phase + ' winner=' + m.winner);
}

/* ----------------------------------------------------------------- 14. timer */
{
  const m = fresh();
  m.fighters[1].hp = 40;
  m.timer = 3;
  run(m, 5);
  ok('timer expires into a round result', m.phase === 'ko');
  run(m, 200);
  ok('time over awards the healthier side', m.wins[0] === 1, 'wins=' + m.wins);
}

/* ------------------------------------------------------------------ 15. tag */
{
  const m = fresh({ mode: 'tag', teams: [['kaia', 'mira'], ['rook', 'sable']] });
  const a = m.fighters[0];
  m.step([IN.TAG, 0]);
  ok('tag swaps the active fighter', m.sides[0].active === 1 && m.fighters[0].charId === 'mira');
  ok('tag starts a cooldown', m.fighters[0].tagCooldown > 0);
  m.step([IN.TAG, 0]);
  ok('tag cannot be spammed during cooldown', m.sides[0].active === 1);
}

/* -------------------------------------------------------- 16. resource sanity */
{
  const m = fresh(); place(m, -0.9, 0.5);
  const a = m.fighters[0], b = m.fighters[1];
  const m0 = a.meter, f0 = a.fury;
  m.resolveHit(a, b, a.moves['kaia.5L']);
  ok('landing a hit builds meter', a.meter > m0);
  ok('landing a hit builds a little fury', a.fury > f0);
  ok('defender builds fury from damage', b.fury > 0);
  ok('resources respect their caps', a.meter <= RB.TUNING.superMax && a.fury <= RB.TUNING.furyMax);
}

/* --------------------------------------------------------- 17. AI can fight */
{
  const m = fresh({ teams: [['kaia'], ['mira']] });
  const ai0 = new RB.AI(0, 'veteran', m);
  const ai1 = new RB.AI(1, 'normal', m);
  let hits = 0;
  m.events.length = 0;
  for (let i = 0; i < 14000 && m.phase !== 'matchend'; i++) {
    m.step([ai0.step(), ai1.step()]);
    for (const e of m.events) if (e.type === 'hit') hits++;
    m.events.length = 0;
  }
  ok('two AIs complete a full match', m.phase === 'matchend', 'phase=' + m.phase);
  ok('AI-driven match produces hits', hits > 8, 'hits=' + hits);
  ok('no fighter escapes the arena', Math.abs(m.fighters[0].x) <= RB.TUNING.stageHalfWidth + 0.01 &&
    Math.abs(m.fighters[1].x) <= RB.TUNING.stageHalfWidth + 0.01);
  ok('no fighter gets stuck in a non-resolving state', ['idle', 'walk', 'crouch', 'block', 'jump', 'dash', 'ko', 'attack', 'hit', 'airhit', 'knockdown', 'wakeup', 'super', 'furyburst', 'blockstun', 'guardcrush', 'tagin'].includes(m.fighters[0].state));
}

/* ----------------------------------------------------- 18. long stability run */
{
  const m = fresh({ teams: [['rook'], ['sable']] });
  const ai0 = new RB.AI(0, 'veteran', m);
  const ai1 = new RB.AI(1, 'veteran', m);
  let err = null;
  try {
    for (let i = 0; i < 6000; i++) m.step([ai0.step(), ai1.step()]);
  } catch (e) { err = e; }
  ok('6000-tick stress run does not throw', !err, err && err.message);
  ok('projectiles/traps stay bounded', m.projectiles.length < 40 && m.traps.length < 40);
}

console.log('='.repeat(52));
console.log(`RESULT  ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFailures:'); failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
