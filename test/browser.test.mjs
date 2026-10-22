/* =========================================================================
   RIFTBOUND — browser smoke test
   Launches the built single-file game in headless Chromium, drives the real
   UI, plays a match, and captures screenshots. Fails on any console error.
   Run: node test/browser.test.mjs
   ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const gameUrl = pathToFileURL(path.join(root, 'dist', 'riftbound.html')).href;
const shots = path.join(root, 'screenshots');
fs.mkdirSync(shots, { recursive: true });

/* playwright-core is a dev-only dependency; resolve it from the managed node
   workspace if it is not installed next to the project. */
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

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '  (' + d + ')' : '')); }
};

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

const advance = (n) => page.evaluate((k) => window.RIFTBOUND.Game.advance(k), n);
const shot = async (name) => { await page.waitForTimeout(300); await page.screenshot({ path: path.join(shots, name) }); };

console.log('\nRIFTBOUND browser smoke test\n' + '='.repeat(52));
await page.goto(gameUrl, { waitUntil: 'load' });
await page.waitForTimeout(900);

ok('page loads without runtime errors', errors.length === 0, errors[0]);
ok('three.js is present', await page.evaluate(() => typeof window.THREE === 'object'));
ok('game namespace is exposed', await page.evaluate(() => !!(window.RIFTBOUND && window.RIFTBOUND.Game)));
ok('renderer produced draw calls', await page.evaluate(() => {
  const v = window.RIFTBOUND.RB.View;
  return v && v.renderer && v.renderer.info.render.calls > 5;
}));
await shot('01_title.png');

/* ------------------------------------------------------- enter versus CPU */
await page.$eval('#title .btn[data-mode="cpu"]', (el) => el.click());
await page.waitForTimeout(350);
ok('select screen is visible', await page.evaluate(() => document.getElementById('select').classList.contains('on')));
await shot('02_select.png');

await page.keyboard.press('KeyD');
await page.keyboard.press('Enter');
await page.waitForTimeout(250);
ok('match started', await page.evaluate(() => {
  const g = window.RIFTBOUND.Game;
  return !!g.match && document.getElementById('hud').classList.contains('on');
}));
ok('HUD shows both fighters', await page.evaluate(() => {
  const a = document.getElementById('nameA').textContent;
  const b = document.getElementById('nameB').textContent;
  return a.length > 2 && b.length > 2;
}));

/* ---------------------------------------------------------- round + combat */
await advance(105);
ok('round intro advances to FIGHT', await page.evaluate(() => window.RIFTBOUND.Game.match.phase === 'fight'));
await shot('03_fight.png');

const hpBefore = await page.evaluate(() => window.RIFTBOUND.Game.match.fighters.map((f) => f.hp));
await advance(420);
const hpAfter = await page.evaluate(() => window.RIFTBOUND.Game.match.fighters.map((f) => f.hp));
ok('combat produces damage over time', hpAfter[0] < hpBefore[0] || hpAfter[1] < hpBefore[1],
  JSON.stringify(hpBefore) + ' -> ' + JSON.stringify(hpAfter));
ok('meter builds during combat', await page.evaluate(() => {
  const m = window.RIFTBOUND.Game.match;
  return m.fighters[0].meter > 0 || m.fighters[1].meter > 0;
}));
await shot('04_combat.png');

/* ------------------------------------------------------------- super flow */
await page.evaluate(() => {
  const m = window.RIFTBOUND.Game.match;
  m.fighters[0].meter = 100;
  m.fighters[0].state = 'idle';
  m.fighters[0].x = m.fighters[1].x - 1.6;
});
await page.keyboard.press('KeyO');
await advance(2);
ok('super activates from input', await page.evaluate(() =>
  window.RIFTBOUND.Game.match.fighters[0].state === 'super'));
await advance(14);
await shot('05_super.png');
await advance(120);
ok('super spends its meter', await page.evaluate(() =>
  window.RIFTBOUND.Game.match.fighters[0].meter < 100));

/* ----------------------------------------------------------- complete match */
const matchResult = await page.evaluate(() => {
  const G = window.RIFTBOUND.Game, m = G.match;
  let guard = 0;
  while (m.phase !== 'matchend' && guard < 40) {
    if (m.phase === 'fight') m.fighters[1].hp = Math.min(m.fighters[1].hp, 1);
    G.advance(120);
    guard++;
  }
  return { phase: m.phase, wins: m.wins, round: m.round };
});
ok('a match can reach match end', matchResult.phase === 'matchend', JSON.stringify(matchResult));
await page.waitForFunction(() => document.getElementById('result').classList.contains('on'), null, { timeout: 10000 }).catch(() => { });
ok('result screen appears', await page.evaluate(() => document.getElementById('result').classList.contains('on')));
await shot('06_result.png');

/* ------------------------------------------------- practice + debug overlay */
await page.evaluate(() => window.RIFTBOUND.Game.toTitle());
await page.waitForTimeout(300);
await page.$eval('#title .btn[data-mode="practice"]', (el) => el.click());
await page.waitForTimeout(250);
await page.keyboard.press('Enter');
await advance(105);
await page.keyboard.press('F1');
await page.waitForTimeout(200);
ok('practice mode runs', await page.evaluate(() => window.RIFTBOUND.Game.mode === 'practice'));
ok('debug overlay renders', await page.evaluate(() => document.getElementById('debug').classList.contains('on')));
await shot('07_practice_debug.png');

/* --------------------------------------------------- live keyboard input */
const beforeX = await page.evaluate(() => window.RIFTBOUND.Game.match.fighters[0].x);
await page.keyboard.down('KeyD');
await advance(24);
await page.keyboard.up('KeyD');
const afterX = await page.evaluate(() => window.RIFTBOUND.Game.match.fighters[0].x);
ok('movement input moves the fighter', afterX > beforeX + 0.05, beforeX.toFixed(2) + ' -> ' + afterX.toFixed(2));

const beforeHit = await page.evaluate(() => window.RIFTBOUND.Game.match.fighters[1].hp);
await page.evaluate(() => {
  const m = window.RIFTBOUND.Game.match;
  m.fighters[0].x = m.fighters[1].x - 1.2;
  m.fighters[0].face = 1;
});
await page.keyboard.press('KeyJ');
await advance(10);
ok('attack input lands a hit', await page.evaluate((hp) =>
  window.RIFTBOUND.Game.match.fighters[1].hp < hp, beforeHit));

/* ----------------------------------------------------------------- pause */
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
ok('pause screen opens', await page.evaluate(() => document.getElementById('pause').classList.contains('on')));
await shot('08_pause.png');
await page.keyboard.press('Escape');
await page.waitForTimeout(150);

/* ------------------------------------------------------- second arena */
await page.evaluate(() => {
  const G = window.RIFTBOUND.Game;
  G.sel.stage = 1;
  G.sel.lockedPick = [2, 3];
  G.sel.lock = [true, true];
  G.startMatch();
});
await page.evaluate(() => window.RIFTBOUND.Game.advance(105));
await page.waitForTimeout(600);
ok('second arena renders', await page.evaluate(() => window.RIFTBOUND.RB.View.stageIndex === 1));
await shot('09_sky_temple.png');

/* ---------------------------------------------------------------- tag duo */
await page.evaluate(() => {
  const G = window.RIFTBOUND.Game;
  G.mode = 'tag';
  G.sel.lockedPick = [0, 1];
  G.sel.stage = 0;
  G.startMatch();
  G.advance(105);
});
ok('tag mode has two fighters per side', await page.evaluate(() =>
  window.RIFTBOUND.Game.match.sides.every((s) => s.team.length === 2)));
await page.keyboard.press('KeyT');
await advance(20);
ok('tag swap works in the live build', await page.evaluate(() =>
  window.RIFTBOUND.Game.match.sides[0].active === 1));
await shot('10_tag_mode.png');

ok('no console errors during the whole run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log('='.repeat(52));
console.log(`RESULT  ${pass} passed, ${fail} failed`);
console.log('screenshots -> ' + shots);
if (fail) process.exit(1);
