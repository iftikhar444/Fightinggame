/* =========================================================================
   RIFTBOUND: CLASH PROTOCOL — 09 UI
   DOM screens, HUD, popups, debug readout. Pure presentation.
   ========================================================================= */
(function (root) {
  'use strict';
  var RB = root.RB;
  var T = root.THREE;

  var $ = function (id) { return document.getElementById(id); };

  var UI = {
    game: null,
    ghost: [1, 1],
    comboShow: [0, 0],
    lastCombo: [0, 0],
    screen: 'title',
    els: {}
  };

  UI.init = function (game) {
    UI.game = game;
    ['title', 'select', 'hud', 'pause', 'result', 'announce', 'pops', 'debug', 'toast'].forEach(function (id) {
      UI.els[id] = $(id);
    });

    document.querySelectorAll('#title .btn').forEach(function (b) {
      b.addEventListener('click', function () {
        RB.Audio.unlock();
        RB.Audio.play('ui');
        game.startMode(b.dataset.mode);
      });
      b.addEventListener('mouseenter', function () { RB.Audio.play('uiMove'); });
    });

    $('btnResume').onclick = function () { game.togglePause(false); };
    $('btnRestart').onclick = function () { game.restartRound(); };
    $('btnSelect').onclick = function () { game.toSelect(); };
    $('btnQuit').onclick = function () { game.toTitle(); };
    $('btnRematch').onclick = function () { game.rematch(); };
    $('btnResSelect').onclick = function () { game.toSelect(); };
    $('btnResTitle').onclick = function () { game.toTitle(); };

    UI.buildGrid();
    UI.buildStages();
  };

  UI.showScreen = function (name) {
    UI.screen = name;
    ['title', 'select', 'pause', 'result'].forEach(function (id) {
      UI.els[id].classList.toggle('on', id === name);
    });
    UI.els.hud.classList.toggle('on', name === 'fight' || name === 'pause');
  };

  /* ------------------------------------------------------------------ grid */
  UI.buildGrid = function () {
    var g = $('grid');
    g.innerHTML = '';
    RB.FIGHTERS.forEach(function (f, i) {
      var c = document.createElement('div');
      c.className = 'card';
      c.dataset.i = i;
      var col = '#' + f.colors.primary.toString(16).padStart(6, '0');
      var acc = '#' + f.colors.accent.toString(16).padStart(6, '0');
      c.innerHTML =
        '<div class="swatch" style="background:radial-gradient(circle at 50% 20%,' + acc + '33,transparent 60%),linear-gradient(160deg,' + col + ',' + col + '22 70%,#06090f)"></div>' +
        '<div class="glyph" style="color:' + acc + '">' + f.name.split(' ')[0].slice(0, 2) + '</div>' +
        '<div class="meta"><b>' + f.name + '</b><span>' + f.arch + '</span></div>' +
        '<div class="badge" style="display:none"></div>';
      c.addEventListener('click', function () { UI.game.pickCard(i); });
      g.appendChild(c);
    });
  };

  UI.buildStages = function () {
    var l = $('stageList');
    l.innerHTML = '';
    RB.STAGES.forEach(function (s, i) {
      var d = document.createElement('div');
      d.className = 'stage-chip';
      d.dataset.i = i;
      d.innerHTML = '<b>' + s.name + '</b><span>' + s.sub + '</span>';
      d.onclick = function () { UI.game.pickStage(i); };
      l.appendChild(d);
    });
  };

  UI.refreshSelect = function (game) {
    var cards = document.querySelectorAll('#grid .card');
    var p1 = game.sel.cursor[0], p2 = game.sel.cursor[1];
    var mode = game.mode;
    cards.forEach(function (c) {
      var i = +c.dataset.i;
      var isP1 = (i === p1) || (game.sel.lock[0] && game.sel.lockedPick[0] === i);
      var isP2 = (mode !== 'practice') && (i === p2 || (game.sel.lock[1] && game.sel.lockedPick[1] === i));
      c.classList.toggle('p1', isP1);
      c.classList.toggle('p2', isP2);
      var badge = c.querySelector('.badge');
      if (isP1 && isP2) { badge.style.display = 'block'; badge.textContent = 'P1 / P2'; }
      else if (isP1) { badge.style.display = 'block'; badge.textContent = 'P1'; }
      else if (isP2) { badge.style.display = 'block'; badge.textContent = 'P2'; }
      else badge.style.display = 'none';
    });

    var f1 = RB.FIGHTERS[p1];
    $('p1name').textContent = f1.name;
    $('p1arch').textContent = f1.arch;
    $('p1blurb').textContent = f1.blurb;
    $('p1stats').innerHTML = statsHtml(f1, false);
    $('p1tag').textContent = 'PLAYER 1';

    var showP2 = mode !== 'practice';
    $('p2tag').textContent = mode === 'cpu' ? 'CPU' : 'PLAYER 2';
    $('p2name').textContent = showP2 ? RB.FIGHTERS[p2].name : '—';
    $('p2arch').textContent = showP2 ? RB.FIGHTERS[p2].arch : '';
    $('p2blurb').textContent = showP2 ? RB.FIGHTERS[p2].blurb : 'Solo training session.';
    $('p2stats').innerHTML = showP2 ? statsHtml(RB.FIGHTERS[p2], true) : '';

    $('selMode').textContent = ({ cpu: 'VERSUS CPU', local: 'LOCAL 1V1', tag: 'TAG DUO', practice: 'PRACTICE' })[mode] || '';
    $('selHint').textContent = game.sel.lock[0]
      ? (mode === 'practice' ? 'ENTER / J to start' : (mode === 'cpu' ? 'ENTER / J to start' : 'P2: ← → then ENTER'))
      : 'P1: A / D then ENTER';

    document.querySelectorAll('.stage-chip').forEach(function (c) {
      c.classList.toggle('on', +c.dataset.i === game.sel.stage);
    });
  };

  function statsHtml(f, right) {
    var rows = [
      ['HEALTH', f.hp],
      ['SPEED', Math.round(f.speed * 100)],
      ['WEIGHT', Math.round(f.weight * 100)],
      ['SUPER', f.superName]
    ];
    return rows.map(function (r) {
      return right
        ? '<dt>' + r[1] + '</dt><dd>' + r[0] + '</dd>'
        : '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>';
    }).join('');
  }

  /* ------------------------------------------------------------------- HUD */
  UI.setRound = function (match) {
    $('roundtag').textContent = 'ROUND ' + match.round;
    $('nameA').textContent = match.fighters[0].def.name;
    $('nameB').textContent = match.fighters[1].def.name;
    $('archA').textContent = match.fighters[0].def.arch;
    $('archB').textContent = match.fighters[1].def.arch;
    UI.ghost = [1, 1];
    UI.lastCombo = [0, 0];
    $('tagA').classList.toggle('hidden', match.mode !== 'tag');
    $('tagB').classList.toggle('hidden', match.mode !== 'tag');
  };

  UI.updateHUD = function (match, dt) {
    var sides = [match.fighters[0], match.fighters[1]];
    var ids = [['hpA', 'ghostA', 'gdA', 'meterA', 'furyA', 'pipsA', 'comboA', 'tagA'],
    ['hpB', 'ghostB', 'gdB', 'meterB', 'furyB', 'pipsB', 'comboB', 'tagB']];

    for (var s = 0; s < 2; s++) {
      var f = sides[s];
      var p = Math.max(0, f.hp / f.maxHp);
      UI.ghost[s] += (p - UI.ghost[s]) * Math.min(1, dt * 4);
      if (UI.ghost[s] < p) UI.ghost[s] = p;
      $(ids[s][0]).style.width = (p * 100).toFixed(2) + '%';
      $(ids[s][1]).style.width = (UI.ghost[s] * 100).toFixed(2) + '%';
      var hpBar = $(ids[s][0]).parentElement;
      hpBar.classList.toggle('low', p < 0.25);
      $(ids[s][2]).style.width = Math.max(0, f.guard / RB.TUNING.guardMax * 100).toFixed(1) + '%';

      var segs = $(ids[s][3]).querySelectorAll('u');
      var filled = f.meter / 100 * 3;
      for (var k = 0; k < 3; k++) {
        segs[k].classList.toggle('on', filled > k + 0.02);
        segs[k].classList.toggle('full', f.meter >= 99.5);
      }
      var fury = $(ids[s][4]);
      fury.querySelector('i').style.width = (f.fury / RB.TUNING.furyMax * 100).toFixed(1) + '%';
      fury.classList.toggle('ready', f.fury >= RB.TUNING.furyBurstCost);

      var pips = $(ids[s][5]).querySelectorAll('u');
      for (var w = 0; w < pips.length; w++) pips[w].classList.toggle('w', match.wins[s] > w);

      /* combo counter */
      var comboEl = $(ids[s][6]);
      if (f.comboHits > UI.lastCombo[s]) UI.comboShow[s] = 1.35;
      UI.lastCombo[s] = f.comboHits;
      UI.comboShow[s] = Math.max(0, UI.comboShow[s] - dt);
      var on = f.comboHits >= 2 && UI.comboShow[s] > 0;
      comboEl.classList.toggle('on', on);
      if (on) {
        comboEl.querySelector('b').textContent = f.comboHits;
        comboEl.querySelector('em').textContent = Math.round(f.comboDamage) + ' DMG';
      }

      if (match.mode === 'tag') {
        var tb = $(ids[s][7]);
        var partner = match.sides[s].team[1 - match.sides[s].active];
        var bar = tb.querySelector('i');
        if (partner) {
          bar.innerHTML = '<b style="width:' + (partner.hp / partner.maxHp * 100) + '%"></b>';
          tb.querySelector('span').textContent = partner.def.name + (f.tagCooldown > 0 ? ' · ' + Math.ceil(f.tagCooldown / 60) + 's' : ' · READY');
        }
      }
    }

    var secs = Math.ceil(match.timer / 60);
    var tm = $('timer');
    tm.textContent = match.noTimer ? '∞' : secs;
    tm.classList.toggle('low', !match.noTimer && secs <= 10);
  };

  /* ---------------------------------------------------------------- popups */
  function project(x, y) {
    var cam = RB.View.camera;
    if (!cam) return null;
    var v = new T.Vector3(x, y, 0).project(cam);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight
    };
  }

  UI.popDamage = function (x, y, dmg, counter, punish, combo, isSuper) {
    var p = project(x, y + 0.35);
    if (!p) return;
    var d = document.createElement('div');
    d.className = 'pop';
    d.style.left = p.x + 'px';
    d.style.top = p.y + 'px';
    d.style.color = isSuper ? '#ffe98a' : (counter ? '#ffd24a' : '#ffffff');
    var label = Math.round(dmg);
    var tag = counter ? 'COUNTER' : punish ? 'PUNISH' : (combo >= 3 ? combo + ' HIT' : '');
    d.innerHTML = label + (tag ? '<small>' + tag + '</small>' : '');
    $('pops').appendChild(d);
    setTimeout(function () { d.remove(); }, 760);
  };

  UI.popText = function (x, y, text, color) {
    var p = project(x, y);
    if (!p) return;
    var d = document.createElement('div');
    d.className = 'pop tag';
    d.style.left = p.x + 'px';
    d.style.top = p.y + 'px';
    d.style.color = color || '#fff';
    d.textContent = text;
    $('pops').appendChild(d);
    setTimeout(function () { d.remove(); }, 760);
  };

  UI.bigAnnounce = function (text, style) {
    var a = $('announce');
    a.textContent = text;
    a.className = style === 'super' ? 'small' : '';
    a.classList.remove('go');
    void a.offsetWidth;
    a.classList.add('go');
  };

  UI.toast = function (msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(UI._toastT);
    UI._toastT = setTimeout(function () { t.classList.remove('on'); }, 1900);
  };

  /* ---------------------------------------------------------------- result */
  UI.showResult = function (match, stats) {
    var w = match.winner;
    var name = w >= 0 ? match.sides[w].team[0].def.name : 'DRAW';
    $('resWinner').textContent = name + (w >= 0 ? ' WINS' : '');
    $('resWinner').style.color = w === 0 ? '#dff6ff' : w === 1 ? '#ffe4e0' : '#fff';
    $('resSub').textContent = match.wins[0] + ' — ' + match.wins[1];
    $('resStats').innerHTML =
      '<div>MAX COMBO<b>' + (stats.maxCombo[0] || 0) + ' / ' + (stats.maxCombo[1] || 0) + '</b></div>' +
      '<div>DAMAGE<b>' + Math.round(stats.damage[0]) + ' / ' + Math.round(stats.damage[1]) + '</b></div>' +
      '<div>ROUNDS<b>' + match.wins[0] + ' / ' + match.wins[1] + '</b></div>';
    UI.showScreen('result');
  };

  /* ----------------------------------------------------------------- debug */
  UI.debugPanel = function (match, on, inputs) {
    var d = $('debug');
    d.classList.toggle('on', on);
    if (!on || !match) return;
    var lines = [];
    lines.push('TICK ' + match.tick + '   PHASE ' + match.phase + '   R' + match.round);
    [0, 1].forEach(function (i) {
      var f = match.fighters[i];
      lines.push(
        'P' + (i + 1) + ' ' + f.charId.padEnd(6) + ' ' + f.state.padEnd(9) +
        ' x' + f.x.toFixed(2).padStart(6) + ' y' + f.y.toFixed(2) +
        ' hp' + f.hp.toFixed(0).padStart(4) +
        ' mv:' + (f.move ? f.move.id.split('.')[1] + '@' + f.moveFrame : '—')
      );
      lines.push('   combo ' + f.comboHits + ' juggle ' + Math.max(0, f.juggle).toFixed(0) +
        ' meter ' + f.meter.toFixed(0) + ' fury ' + f.fury.toFixed(0) +
        ' guard ' + f.guard.toFixed(0) + (f.furyArtT > 0 ? ' ART' : ''));
    });
    if (inputs) {
      lines.push('IN  P1:' + bitNames(inputs[0]) + '  P2:' + bitNames(inputs[1]));
    }
    d.textContent = lines.join('\n');
  };

  function bitNames(mask) {
    var names = [];
    var map = [['←', 1], ['→', 2], ['↑', 4], ['↓', 8], ['L', 16], ['H', 32], ['K', 64], ['LA', 128], ['SP', 256], ['SU', 512], ['FB', 1024], ['FA', 2048], ['TG', 4096], ['TH', 8192]];
    map.forEach(function (m) { if (mask & m[1]) names.push(m[0]); });
    return names.length ? names.join(' ') : '—';
  }

  RB.UI = UI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
