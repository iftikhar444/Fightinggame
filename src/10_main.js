/* =========================================================================
   RIFTBOUND: CLASH PROTOCOL — 10 MAIN
   Fixed-step loop, input routing, match flow and screen state.
   ========================================================================= */
(function (root) {
  'use strict';
  var RB = root.RB;
  var T = root.THREE;
  var IN = RB.IN;

  var Game = {
    mode: 'cpu',
    aiLevel: 'normal',
    sel: { cursor: [0, 1], lock: [false, false], lockedPick: [0, 1], stage: 0 },
    match: null,
    demo: null,
    ai: [null, null],
    paused: false,
    debug: false,
    speed: 1,
    stats: { maxCombo: [0, 0], damage: [0, 0] },
    keys: {},
    latch: [0, 0],
    acc: 0,
    last: 0,
    ended: 0,
    resultShown: false,
    inputs: [0, 0],
    lowSpec: false, forceHQ: false, slowT: 0, fastT: 0, fps: 60
  };

  /* -------------------------------------------------------------- keymaps */
  var P1 = {
    KeyA: IN.LEFT, KeyD: IN.RIGHT, KeyW: IN.UP, KeyS: IN.DOWN,
    KeyJ: IN.LIGHT, KeyK: IN.HEAVY, KeyL: IN.KICK,
    KeyU: IN.LAUNCH, KeyI: IN.SPECIAL, KeyO: IN.SUPER,
    KeyH: IN.FB, KeyG: IN.FA, KeyY: IN.THROW, KeyT: IN.TAG
  };
  var P2 = {
    ArrowLeft: IN.LEFT, ArrowRight: IN.RIGHT, ArrowUp: IN.UP, ArrowDown: IN.DOWN,
    Digit1: IN.LIGHT, Digit2: IN.HEAVY, Digit3: IN.KICK,
    Digit4: IN.LAUNCH, Digit5: IN.SPECIAL, Digit6: IN.SUPER,
    Digit7: IN.FB, Digit8: IN.FA, Digit9: IN.TAG, Digit0: IN.THROW,
    Numpad1: IN.LIGHT, Numpad2: IN.HEAVY, Numpad3: IN.KICK,
    Numpad4: IN.LAUNCH, Numpad5: IN.SPECIAL, Numpad6: IN.SUPER,
    Numpad7: IN.FB, Numpad8: IN.FA, Numpad9: IN.TAG, Numpad0: IN.THROW
  };

  function maskFor(map, keys) {
    var m = 0;
    for (var k in map) if (keys[k]) m |= map[k];
    return m;
  }

  /* --------------------------------------------------------------- screens */
  Game.startMode = function (mode) {
    Game.mode = mode;
    Game.sel = { cursor: [0, 1], lock: [false, false], lockedPick: [0, 1], stage: Game.sel.stage || 0 };
    if (mode === 'practice') { Game.sel.cursor[1] = 3; Game.sel.lock[1] = true; Game.sel.lockedPick[1] = 3; }
    RB.UI.refreshSelect(Game);
    RB.UI.showScreen('select');
    RB.Audio.ambience(null);
  };

  Game.toTitle = function () {
    Game.paused = false;
    RB.UI.showScreen('title');
    Game.bindDemo();
    RB.Audio.ambience(null);
  };

  Game.toSelect = function () {
    Game.paused = false;
    RB.UI.showScreen('select');
    RB.UI.refreshSelect(Game);
  };

  Game.pickCard = function (i) {
    RB.Audio.play('uiMove');
    if (!Game.sel.lock[0]) Game.sel.cursor[0] = i;
    else if (!Game.sel.lock[1] && Game.mode !== 'practice' && Game.mode !== 'cpu') Game.sel.cursor[1] = i;
    RB.UI.refreshSelect(Game);
  };

  Game.pickStage = function (i) {
    Game.sel.stage = i;
    RB.Audio.play('uiMove');
    RB.UI.refreshSelect(Game);
  };

  Game.confirmPick = function () {
    if (!Game.sel.lock[0]) {
      Game.sel.lock[0] = true;
      Game.sel.lockedPick[0] = Game.sel.cursor[0];
      RB.Audio.play('ui');
      if (Game.mode === 'practice') { Game.startMatch(); return; }
      if (Game.mode === 'cpu') {
        var pool = RB.FIGHTERS.map(function (f, i) { return i; }).filter(function (i) { return i !== Game.sel.lockedPick[0]; });
        Game.sel.lockedPick[1] = pool[Math.floor(Math.random() * pool.length)];
        Game.sel.cursor[1] = Game.sel.lockedPick[1];
        Game.sel.lock[1] = true;
        Game.startMatch();
        return;
      }
      RB.UI.refreshSelect(Game);
      return;
    }
    if (!Game.sel.lock[1]) {
      Game.sel.lock[1] = true;
      Game.sel.lockedPick[1] = Game.sel.cursor[1];
      RB.Audio.play('ui');
      Game.startMatch();
    }
  };

  Game.moveCursor = function (who, dir) {
    if (Game.sel.lock[who]) return;
    var c = Game.sel.cursor[who];
    Game.sel.cursor[who] = (c + dir + RB.FIGHTERS.length) % RB.FIGHTERS.length;
    RB.Audio.play('uiMove');
    RB.UI.refreshSelect(Game);
  };

  /* ------------------------------------------------------------- match flow */
  function partnerFor(idx) {
    for (var i = 1; i <= RB.FIGHTERS.length; i++) {
      var k = (idx + i) % RB.FIGHTERS.length;
      if (k !== idx) return RB.FIGHTERS[k].id;
    }
    return RB.FIGHTERS[0].id;
  }

  Game.startMatch = function () {
    var p1 = RB.FIGHTERS[Game.sel.lockedPick[0]].id;
    var p2 = RB.FIGHTERS[Game.sel.lockedPick[1]].id;
    var tag = Game.mode === 'tag';
    var teams = [
      tag ? [p1, partnerFor(Game.sel.lockedPick[0])] : [p1],
      tag ? [p2, partnerFor(Game.sel.lockedPick[1])] : [p2]
    ];
    var m = new RB.Match({
      mode: tag ? 'tag' : (Game.mode === 'practice' ? 'practice' : '1v1'),
      teams: teams,
      stage: Game.sel.stage,
      seed: (Date.now() & 0xffff) ^ 0x5f3a,
      noTimer: Game.mode === 'practice',
      roundsToWin: Game.mode === 'practice' ? 99 : RB.TUNING.roundsToWin
    });
    m.phase = 'intro';
    Game.match = m;
    Game.ai = [null, null];
    if (Game.mode === 'cpu') Game.ai[1] = new RB.AI(1, Game.aiLevel, m);
    if (Game.mode === 'practice') Game.ai[1] = new RB.AI(1, 'dummy', m);
    Game.stats = { maxCombo: [0, 0], damage: [0, 0] };
    Game.resultShown = false;
    Game.matchEndAt = 0;
    Game.ended = 0;
    Game.paused = false;
    Game.acc = 0;
    RB.View.bindMatch(m);
    RB.UI.setRound(m);
    RB.UI.showScreen('fight');
    RB.Audio.ambience(RB.STAGES[m.stage].ambience);
    RB.UI.toast(tag ? 'TAG DUO — press T to swap' : Game.mode === 'practice' ? 'PRACTICE — F1 hitboxes · F2 reset · F3 meter' : 'FIRST TO 2 ROUNDS');
  };

  Game.bindDemo = function () {
    var m = new RB.Match({ teams: [['kaia'], ['rook']], stage: Game.sel.stage || 0, seed: 7 });
    m.phase = 'matchend';
    m.fighters[0].x = -1.8; m.fighters[1].x = 1.9;
    m.fighters[0].face = 1; m.fighters[1].face = -1;
    Game.demo = m;
    Game.match = m;
    RB.View.bindMatch(m);
  };

  Game.rematch = function () {
    Game.sel.lock = [false, false];
    if (Game.mode === 'practice') Game.sel.lock[1] = true;
    Game.sel.lockedPick[0] = Game.sel.lockedPick[0] == null ? 0 : Game.sel.lockedPick[0];
    Game.startMatch();
  };

  Game.restartRound = function () {
    if (!Game.match) return;
    Game.paused = false;
    RB.UI.showScreen('fight');
    Game.match.startRound();
    RB.UI.setRound(Game.match);
    RB.UI.toast('ROUND RESET');
  };

  Game.togglePause = function (force) {
    if (!Game.match || Game.match.phase === 'matchend') return;
    Game.paused = force == null ? !Game.paused : force;
    if (Game.paused) RB.UI.showScreen('pause');
    else RB.UI.showScreen('fight');
    RB.Audio.play('ui');
  };

  Game.toggleDebug = function () {
    Game.debug = !Game.debug;
    RB.View.debug = Game.debug;
    RB.UI.toast('HITBOXES ' + (Game.debug ? 'ON' : 'OFF'));
  };

  Game.fillMeters = function () {
    if (!Game.match) return;
    Game.match.fighters.forEach(function (f) { f.meter = 100; f.fury = 100; });
    RB.UI.toast('METERS FILLED');
  };

  Game.resetPositions = function () {
    if (!Game.match) return;
    var a = Game.match.fighters[0], b = Game.match.fighters[1];
    a.x = -2.6; b.x = 2.6; a.y = 0; b.y = 0; a.vx = b.vx = 0; a.vy = b.vy = 0;
    a.state = b.state = RB.ST.IDLE; a.stunT = b.stunT = 0;
    a.move = b.move = null;
    Game.match.projectiles.length = 0;
    Game.match.traps.length = 0;
    RB.UI.toast('POSITIONS RESET');
  };

  /* --------------------------------------------------------------- input */
  function onKey(e) {
    var c = e.code;
    if (e.repeat) {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].indexOf(c) >= 0) e.preventDefault();
      return;
    }
    RB.Audio.unlock();
    Game.keys[c] = true;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Tab', 'F5'].indexOf(c) >= 0) e.preventDefault();

    var screen = RB.UI.screen;

    if (c === 'Escape' || c === 'KeyP') {
      if (screen === 'fight' || screen === 'pause') Game.togglePause();
      return;
    }
    if (c === 'KeyM') {
      RB.Audio.setMuted(!RB.Audio.muted);
      RB.UI.toast(RB.Audio.muted ? 'AUDIO MUTED' : 'AUDIO ON');
      return;
    }
    if (c === 'F1') { Game.toggleDebug(); return; }
    if (c === 'F2') { Game.resetPositions(); return; }
    if (c === 'F3') { Game.fillMeters(); return; }
    if (c === 'F4') { Game.speed = Game.speed === 1 ? 0.35 : 1; RB.UI.toast('SPEED ' + Game.speed + 'x'); return; }
    if (c === 'F5') {
      Game.forceHQ = !Game.forceHQ;
      if (Game.forceHQ) {
        Game.lowSpec = false;
        RB.View.setQuality(1);
        RB.VFX.setQuality(1);
      }
      RB.UI.toast('QUALITY ' + (Game.forceHQ ? 'FORCED FULL' : 'AUTO'));
      return;
    }

    if (screen === 'title') {
      if (c === 'Digit1') Game.startMode('cpu');
      else if (c === 'Digit2') Game.startMode('local');
      else if (c === 'Digit3') Game.startMode('tag');
      else if (c === 'Digit4') Game.startMode('practice');
      return;
    }

    if (screen === 'select') {
      if (c === 'KeyA') Game.moveCursor(0, -1);
      else if (c === 'KeyD') Game.moveCursor(0, 1);
      else if (c === 'ArrowLeft') Game.moveCursor(Game.sel.lock[0] ? 1 : 0, -1);
      else if (c === 'ArrowRight') Game.moveCursor(Game.sel.lock[0] ? 1 : 0, 1);
      else if (c === 'KeyJ' || c === 'Enter') Game.confirmPick();
      else if (c === 'Numpad1' || c === 'Slash') { if (Game.sel.lock[0] && !Game.sel.lock[1]) Game.confirmPick(); }
      else if (c === 'KeyQ') Game.pickStage((Game.sel.stage + RB.STAGES.length - 1) % RB.STAGES.length);
      else if (c === 'KeyE') Game.pickStage((Game.sel.stage + 1) % RB.STAGES.length);
      return;
    }

    if (screen === 'pause') {
      if (c === 'Enter' || c === 'KeyJ') Game.togglePause(false);
      return;
    }

    if (screen === 'result') {
      if (c === 'Enter' || c === 'KeyJ') Game.rematch();
      return;
    }

    /* fight: latch presses so a one-frame tap is never lost */
    if (screen === 'fight') {
      if (P1[c]) Game.latch[0] |= P1[c];
      if (P2[c]) Game.latch[1] |= P2[c];
    }
  }

  function onKeyUp(e) { Game.keys[e.code] = false; }

  /* ------------------------------------------------------------- gamepad */
  var padPrev = [{}, {}];
  function padMask(idx) {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    var p = pads[idx];
    if (!p) return 0;
    var m = 0, b = p.buttons;
    var ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    if (ax < -0.35 || (b[14] && b[14].pressed)) m |= IN.LEFT;
    if (ax > 0.35 || (b[15] && b[15].pressed)) m |= IN.RIGHT;
    if (ay < -0.5 || (b[12] && b[12].pressed)) m |= IN.UP;
    if (ay > 0.5 || (b[13] && b[13].pressed)) m |= IN.DOWN;
    var map = [IN.LIGHT, IN.HEAVY, IN.KICK, IN.LAUNCH, IN.SPECIAL, IN.SUPER, IN.FB, IN.FA, IN.THROW, IN.TAG];
    for (var i = 0; i < map.length; i++) if (b[i] && b[i].pressed) m |= map[i];
    return m;
  }

  /* ---------------------------------------------------------------- loop */
  function stepSim() {
    var m = Game.match;
    if (!m) return;
    var m1 = maskFor(P1, Game.keys) | Game.latch[0];
    var m2 = maskFor(P2, Game.keys) | Game.latch[1];
    Game.latch[0] = 0; Game.latch[1] = 0;

    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (pads && pads[0]) m1 |= padMask(0);
    if (pads && pads[1] && Game.mode !== 'cpu' && Game.mode !== 'practice') m2 |= padMask(1);

    if (Game.ai[0]) m1 |= Game.ai[0].step();
    if (Game.ai[1]) m2 |= Game.ai[1].step();

    Game.inputs = [m1, m2];
    m.step([m1, m2]);

    for (var s = 0; s < 2; s++) {
      var f = m.fighters[s];
      if (f.comboHits > Game.stats.maxCombo[s]) Game.stats.maxCombo[s] = f.comboHits;
    }
    var opp0 = m.sides[1].team, opp1 = m.sides[0].team;
    var lost0 = 0, lost1 = 0;
    opp0.forEach(function (f) { lost0 += f.maxHp - Math.max(0, f.hp); });
    opp1.forEach(function (f) { lost1 += f.maxHp - Math.max(0, f.hp); });
    Game.stats.damage = [lost0, lost1];
  }

  /* Advance the simulation without waiting on render frames. Used by the
     practice/debug tooling and by the automated smoke test. */
  Game.advance = function (ticks) {
    var m = Game.match;
    if (!m) return 0;
    var n = 0;
    for (var i = 0; i < ticks; i++) {
      if (m.phase === 'matchend') break;
      stepSim();
      n++;
    }
    return n;
  };

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.1, (now - Game.last) / 1000 || 0);
    Game.last = now;

    /* Adaptive resolution with hysteresis. The old version flipped to low spec
       on a single slow frame and never came back, so a screenshot taken while
       the tab was still loading would be permanently soft. Now it needs two
       seconds of sustained slowness to drop, and five seconds above 55 fps to
       recover. ?hq=1 (or F5) pins full quality. */
    Game.fps = Game.fps ? Game.fps * 0.94 + (1 / Math.max(dt, 0.001)) * 0.06 : 60;
    Game.slowT = Game.fps < 34 ? Game.slowT + dt : 0;
    Game.fastT = Game.fps > 55 ? Game.fastT + dt : 0;
    if (!Game.forceHQ) {
      if (!Game.lowSpec && Game.slowT > 2) {
        Game.lowSpec = true;
        Game.slowT = 0;
        RB.View.setQuality(0.72);
        RB.VFX.setQuality(0.55);
      } else if (Game.lowSpec && Game.fastT > 5) {
        Game.lowSpec = false;
        Game.fastT = 0;
        RB.View.setQuality(1);
        RB.VFX.setQuality(1);
      }
    }

    var m = Game.match;
    var inFight = RB.UI.screen === 'fight' || RB.UI.screen === 'pause';

    if (m && !Game.paused && inFight && m.phase !== 'matchend') {
      /* KO slow motion: the sim owns the timer, the view just spends it. */
      var rate = m.slowmo > 0 ? 0.3 : 1;
      Game.acc += dt * Game.speed * rate;
      var guard = 0;
      while (Game.acc >= RB.TICK && guard < 8) {
        stepSim();
        Game.acc -= RB.TICK;
        guard++;
      }
      if (Game.acc > RB.TICK * 10) Game.acc = 0;
    }

    if (m && m.phase === 'matchend' && !Game.resultShown) {
      if (!Game.matchEndAt) Game.matchEndAt = now;
      if (now - Game.matchEndAt > 1200) {
        Game.resultShown = true;
        RB.UI.showResult(m, Game.stats);
      }
    }

    if (m) {
      RB.View.render(dt, m);
      if (inFight) RB.UI.updateHUD(m, dt);
      RB.UI.debugPanel(m, Game.debug && inFight, Game.inputs, qualityLine());
    }
  }

  function qualityLine() {
    var q = Game.forceHQ ? 'FORCED-HQ' : (Game.lowSpec ? 'LOW-SPEC' : 'FULL');
    return 'QUALITY ' + q +
      '  FPS ' + Math.round(Game.fps || 0) +
      '  SCALE ' + (RB.View.pixelScale || 1).toFixed(2) +
      '  VFX ' + Math.round((RB.VFX.quality || 1) * 100) + '%';
  }

  /* ----------------------------------------------------------------- boot */
  function boot() {
    var canvas = document.getElementById('cv');
    RB.View.init(canvas);
    RB.UI.init(Game);
    /* ?hq=1 pins full quality — used when capturing comparison screenshots so a
       slow first second cannot permanently downgrade the render scale. */
    if (/[?&]hq=1\b/.test(location.search)) {
      Game.forceHQ = true;
      Game.lowSpec = false;
      RB.View.setQuality(1);
      RB.VFX.setQuality(1);
    }
    Game.bindDemo();
    Game.last = performance.now();
    requestAnimationFrame(frame);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', function () {
      /* Release held keys, but never auto-pause on focus loss: clicking a
         second monitor should not freeze the match. */
      Game.keys = {};
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && RB.UI.screen === 'fight') Game.togglePause(true);
    });
    /* difficulty chips */
    document.querySelectorAll('#diffbar .chip').forEach(function (b) {
      b.addEventListener('click', function () {
        Game.aiLevel = b.dataset.diff;
        document.querySelectorAll('#diffbar .chip').forEach(function (x) { x.classList.toggle('on', x === b); });
        RB.Audio.play('uiMove');
      });
    });
    root.RIFTBOUND = { Game: Game, RB: RB };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
