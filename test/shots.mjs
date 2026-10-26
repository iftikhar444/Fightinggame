/* =========================================================================
   RIFTBOUND — comparison screenshot harness
   Captures one named state per process invocation (the sandbox allows a single
   screenshot write per run) and prints numeric framing checks either way.
   Run: node test/shots.mjs <name> [outDir] [prefix]
   ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

const NAME = process.argv[2];
const outDir = path.resolve(process.argv[3] || path.join(root, 'screenshots'));
if (!NAME) {
  console.error('usage: node test/shots.mjs <shot-name|probe> [outDir] [prefix]');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const gameUrl = pathToFileURL(path.join(root, 'dist', 'riftbound.html')).href + '?hq=1';

const PW = process.env.PW_PATH ||
  'C:/Users/DELL 5570/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.js';
let chromium;
async function loadPW(spec) {
  const mod = await import(spec);
  return mod.chromium || (mod.default && mod.default.chromium) || mod.default;
}
try { chromium = await loadPW('playwright-core'); }
catch { chromium = await loadPW(pathToFileURL(PW).href); }

const EXE = process.env.CHROME_PATH ||
  'C:/Users/DELL 5570/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(gameUrl, { waitUntil: 'load' });
await page.waitForTimeout(1200);

async function setup(stage, ax, bx) {
  await page.evaluate(({ stage, ax, bx }) => {
    const g = window.RIFTBOUND.Game;
    g.mode = 'local';
    g.sel.lockedPick = [0, 1];
    g.sel.stage = stage;
    g.startMatch();
    const m = g.match;
    m.phase = 'fight';
    m.phaseT = 0;
    m.fighters[0].x = ax; m.fighters[0].face = 1;
    m.fighters[1].x = bx; m.fighters[1].face = -1;
    m.fighters[0].y = 0; m.fighters[1].y = 0;
    g.advance(6);
  }, { stage, ax, bx });
  await settle();
}

/* Headless software rendering runs at ~2.5 fps and the camera eases with a
   clamped dt, so a fixed wait is not enough — wait for the easing to converge. */
async function settle() {
  await page.waitForFunction(() => {
    const V = window.RIFTBOUND.RB.View;
    if (!V._dbg) return false;
    return Math.abs(V.camDist - V._dbg.dist) < 0.12 &&
      Math.abs(V.camY - V._dbg.y) < 0.12 &&
      Math.abs(V.lookY - V._dbg.lookY) < 0.12;
  }, null, { timeout: 30000 }).catch(() => {});
}

async function landHit(extra) {
  await page.evaluate((n) => {
    const RB = window.RIFTBOUND.RB;
    const g = window.RIFTBOUND.Game;
    const m = g.match;
    const hp = m.fighters[1].hp;
    for (let i = 0; i < 60; i++) {
      g.latch[0] = i === 0 ? RB.IN.HEAVY : 0;
      g.advance(1);
      if (m.fighters[1].hp < hp) break;
    }
    if (n > 0) g.advance(n);
    g.paused = true;
    /* Freeze particles and the hit flash: headless runs at ~2.5 fps, so a
       0.2 s effect would otherwise expire before the frame is captured. */
    RB.freeze = true;
  }, extra || 0);
  await page.waitForTimeout(110);
}

const SHOTS = {
  '01_foundry_neutral': async () => setup(0, -1.2, 1.2),
  '02_foundry_hit': async () => { await setup(0, -0.85, 0.55); await landHit(0); },
  '03_foundry_jump': async () => {
    await setup(0, -1.4, 1.2);
    await page.evaluate(() => {
      const m = window.RIFTBOUND.Game.match;
      m.fighters[0].y = 2.9;
      m.fighters[0].state = 'air';
      window.RIFTBOUND.Game.paused = true;
    });
    await settle();
    await page.waitForTimeout(120);
  },
  '04_temple_neutral': async () => setup(1, -1.2, 1.2),
  '05_temple_hit': async () => { await setup(1, -0.85, 0.55); await landHit(0); },
  '06_temple_super': async () => {
    await setup(1, -1.0, 1.0);
    await page.evaluate(() => {
      const RB = window.RIFTBOUND.RB;
      const g = window.RIFTBOUND.Game;
      const m = g.match;
      m.fighters[0].meter = 100;
      m.fighters[0].fury = 100;
      for (let i = 0; i < 40; i++) {
        g.latch[0] = i === 0 ? RB.IN.SUPER : 0;
        g.advance(1);
        if (m.fighters[0].state === 'super') break;
      }
      g.advance(10);
      g.paused = true;
      RB.freeze = true;
    });
    await page.waitForTimeout(140);
  },
  '07_foundry_wide': async () => setup(0, -7.9, 7.9),
  '08_temple_wide': async () => setup(1, -7.9, 7.9)
};

if (NAME === 'probe') {
  const sample = async (tag) => {
    const s = await page.evaluate(() => {
      const V = window.RIFTBOUND.RB.View;
      return {
        camDist: +V.camDist.toFixed(2),
        dbg: V._dbg ? +V._dbg.dist.toFixed(2) : null,
        y: +V.camY.toFixed(2)
      };
    });
    console.log('  ' + tag.padEnd(12) + JSON.stringify(s));
  };
  await sample('load');
  await setup(0, -1.2, 1.2);
  await sample('settled');
  await browser.close();
  process.exit(0);
}

const step = SHOTS[NAME];
if (!step) {
  console.error('unknown shot: ' + NAME + '\navailable: ' + Object.keys(SHOTS).join(', '));
  await browser.close();
  process.exit(1);
}

await step();

/* Numeric framing check: project the top of each fighter's head into NDC.
   |x|,|y| <= 1 means the head is inside the frame. */
const info = await page.evaluate(() => {
  const RB = window.RIFTBOUND.RB;
  const T = window.THREE;
  const m = window.RIFTBOUND.Game.match;
  const V = RB.View;
  const rig = V.rigs.get(m.fighters[0].id);
  let rigH = 0;
  if (rig && T) {
    const b = new T.Box3().setFromObject(rig.root);
    rigH = +(b.max.y - b.min.y).toFixed(2);
  }
  const visH = 2 * Math.tan(V.camera.fov * Math.PI / 360) * V.camDist;
  const heads = m.fighters.map((f) => {
    const p = new T.Vector3(f.x, f.y + rigH, 0).project(V.camera);
    return { x: +p.x.toFixed(2), y: +p.y.toFixed(2) };
  });
  return {
    rigH: rigH,
    pctH: rigH ? +((rigH / visH) * 100).toFixed(1) : 0,
    dist: +V.camDist.toFixed(2),
    lookY: +V.lookY.toFixed(2),
    camY: +V.camY.toFixed(2),
    sep: +Math.abs(m.fighters[0].x - m.fighters[1].x).toFixed(2),
    heads: heads,
    inFrame: heads.every((h) => Math.abs(h.x) <= 1 && Math.abs(h.y) <= 1),
    calls: V.renderer.info.render.calls,
    fx: RB.VFX.fx.length,
    scale: V.pixelScale || 1
  };
});

console.log('  ' + NAME + '  ' + JSON.stringify(info) +
  (errors.length ? '\n    ERRORS: ' + errors.slice(0, 3).join(' | ') : ''));

if (!process.env.NO_SHOT) {
  await page.screenshot({ path: path.join(outDir, (process.argv[4] || '') + NAME + '.png') });
}

await browser.close();
