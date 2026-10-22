/* =========================================================================
   RIFTBOUND: CLASH PROTOCOL — 08 VIEW
   Three.js presentation. Reads simulation state, never writes it.
   ========================================================================= */
(function (root) {
  'use strict';
  var RB = root.RB;
  var T = root.THREE;

  var V = {
    renderer: null, scene: null, camera: null,
    stage: null, stageIndex: -1,
    match: null, rigs: new Map(), shadows: new Map(),
    camX: 0, camDist: 11, camY: 3.0, shake: 0, kick: 0,
    time: 0, debug: false,
    projMeshes: new Map(), trapMeshes: new Map(),
    boxHelpers: [], hud: null,
    flashRig: 0,
    lastPhase: ''
  };

  V.init = function (canvas) {
    V.renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    V.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    V.renderer.shadowMap.enabled = false;
    V.scene = new T.Scene();
    V.camera = new T.PerspectiveCamera(34, 16 / 9, 0.4, 200);
    V.camera.position.set(0, 3, 11);
    V.camera.lookAt(0, 1.3, 0);
    RB.VFX.init(V.scene, V.camera);
    /* Dedicated character rim: separates the fighters from any background. */
    V.charRim = new T.DirectionalLight(0xbfe6ff, 1.15);
    V.charRim.position.set(-2, 5, -12);
    V.scene.add(V.charRim);
    V.resize();
    window.addEventListener('resize', V.resize);

    /* debug wireframe boxes */
    var geo = new T.BoxGeometry(1, 1, 1);
    for (var i = 0; i < 6; i++) {
      var e = new T.LineSegments(new T.EdgesGeometry(geo),
        new T.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.85 }));
      e.visible = false;
      V.scene.add(e);
      V.boxHelpers.push(e);
    }
  };

  V.resize = function () {
    var w = window.innerWidth, h = window.innerHeight;
    V.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75) * (V.pixelScale || 1));
    V.renderer.setSize(w, h, false);
    V.camera.aspect = w / h;
    /* Keep the arena readable on tall/narrow windows. */
    V.camera.fov = w / h < 1.3 ? 38 : 31;
    V.camera.updateProjectionMatrix();
  };

  V.setQuality = function (q) {
    V.pixelScale = q;
    V.resize();
  };

  V.setStage = function (index) {
    if (V.stageIndex === index && V.stage) return;
    V.stageIndex = index;
    if (V.stage) {
      V.scene.remove(V.stage.group);
      V.stage.group.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
      V.stage.lights.forEach(function (l) { V.scene.remove(l); });
    }
    V.stage = RB.Stage.build(index, V.scene);
    V.stage.lights.forEach(function (l) { V.scene.add(l); });
    RB.Audio.ambience(V.stage.def.ambience);
  };

  V.clearRigs = function () {
    V.rigs.forEach(function (rig) {
      V.scene.remove(rig.root);
      V.scene.remove(rig.shadow);
    });
    V.rigs.clear();
  };

  V.bindMatch = function (match) {
    V.clearRigs();
    V.match = match;
    V.setStage(match.stage);
    match.sides.forEach(function (side) {
      side.team.forEach(function (f) {
        var rig = new RB.Rig(f.charId);
        rig.root.visible = false;
        rig.shadow.visible = false;
        V.scene.add(rig.root);
        V.scene.add(rig.shadow);
        V.rigs.set(f.id, rig);
      });
    });
    V.projMeshes.forEach(function (m) { V.scene.remove(m); });
    V.trapMeshes.forEach(function (m) { V.scene.remove(m); });
    V.projMeshes.clear();
    V.trapMeshes.clear();
    V.camX = 0;
  };

  function rigFor(f) { return V.rigs.get(f.id); }

  /* ------------------------------------------------------------- projectile */
  function projMesh(p) {
    var m = V.projMeshes.get(p.id);
    if (!m) {
      m = new T.Group();
      var core = new T.Mesh(new T.OctahedronGeometry(0.16, 0),
        new T.MeshBasicMaterial({ color: 0x8ff0cf }));
      var halo = new T.Mesh(new T.PlaneGeometry(1.0, 1.0),
        new T.MeshBasicMaterial({
          map: RB.VFX && null, color: 0x8ff0cf, transparent: true, opacity: 0.5,
          blending: T.AdditiveBlending, depthWrite: false
        }));
      m.add(core);
      m.add(halo);
      m.userData.core = core;
      V.scene.add(m);
      V.projMeshes.set(p.id, m);
    }
    return m;
  }

  function trapMesh(t) {
    var m = V.trapMeshes.get(t.id);
    if (!m) {
      m = new T.Group();
      var ring = new T.Mesh(new T.RingGeometry(0.55, 0.72, 20),
        new T.MeshBasicMaterial({ color: 0x8ff0cf, transparent: true, opacity: 0.7, side: T.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      var core = new T.Mesh(new T.CircleGeometry(0.34, 16),
        new T.MeshBasicMaterial({ color: 0x2ec6ff, transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false }));
      core.rotation.x = -Math.PI / 2;
      core.position.y = 0.02;
      m.add(ring, core);
      m.userData.ring = ring;
      m.userData.core = core;
      V.scene.add(m);
      V.trapMeshes.set(t.id, m);
    }
    return m;
  }

  /* ----------------------------------------------------------------- events */
  V.consumeEvents = function (match) {
    var ev = match.events;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      var side = e.side == null ? 0 : e.side;
      var accent = match.sides[side].team[0].def.colors.accent;
      switch (e.type) {
        case 'hit':
          RB.VFX.hit(e.x, e.y, e.superHit ? 0xfff2b0 : accent, e.launch || e.dmg > 9, e.side === 0 ? 1 : -1);
          RB.Audio.play(e.dmg > 9 ? 'hitHeavy' : 'hitLight', e.counter);
          if (e.counter) RB.Audio.play('guardCrush');
          V.shake = Math.min(0.5, V.shake + (e.dmg > 9 ? 0.30 : 0.14));
          V.kick = e.dmg > 9 ? 0.06 : 0.02;
          RB.UI.popDamage(e.x, e.y, e.dmg, e.counter, e.punish, e.combo, e.superHit);
          break;
        case 'block':
          RB.VFX.block(e.x, e.y, 0x9fe6ff);
          RB.Audio.play('block');
          RB.UI.popText(e.x, e.y + 0.2, 'GUARD', '#9fe6ff');
          break;
        case 'guardCrush':
          RB.VFX.burst(e.x, 1.2, 0x9fe6ff, 0.8);
          RB.Audio.play('guardCrush');
          RB.UI.popText(e.x, 1.9, 'GUARD CRUSH', '#9fe6ff');
          break;
        case 'knockdown':
          RB.VFX.dust(e.x, 0, 0, 5);
          RB.Audio.play('hitHeavy');
          break;
        case 'ko':
          RB.VFX.burst(e.x, 1.2, 0xffffff, 1.2);
          RB.Audio.play('ko');
          V.shake = 0.55;
          RB.UI.bigAnnounce('K.O.', 'ko');
          break;
        case 'wallSplat':
          RB.VFX.burst(e.x, 1.1, 0xffd24a, 0.7);
          V.shake = 0.35;
          RB.UI.popText(e.x, 1.8, 'WALL', '#ffd24a');
          break;
        case 'superStart':
          RB.Audio.play('superStart');
          RB.VFX.flash('#ffffff', 1, 0.2);
          RB.UI.bigAnnounce(match.sides[side].team[0].def.superName.toUpperCase(), 'super');
          break;
        case 'cinematicStart':
          V.camX = e.x;
          break;
        case 'superHit':
          break;
        case 'furyBurst':
          RB.VFX.burst(e.x, 1.1, 0xff7a3a, 1.4);
          RB.Audio.play('furyBurst');
          V.shake = 0.4;
          RB.UI.popText(e.x, 1.9, 'FURY BURST', '#ff9a5a');
          break;
        case 'furyBurstHit':
          RB.VFX.block(e.x, 1.1, 0xff9a5a);
          break;
        case 'furyArt':
          RB.Audio.play('furyArt');
          RB.VFX.aura(e.x, 0.4, 0xffb347);
          RB.UI.popText(e.x, 2.0, match.sides[side].team[0].def.furyArt.toUpperCase(), '#ffb347');
          break;
        case 'shotSpawn':
          RB.Audio.play('shot');
          break;
        case 'trapPlaced':
          RB.Audio.play('trap');
          break;
        case 'trapArmed':
          RB.Audio.play('trapArm');
          break;
        case 'trapDetonate':
          RB.VFX.burst(e.x, 0.6, 0x8ff0cf, 1.0);
          RB.Audio.play('trapBoom');
          V.shake = 0.3;
          break;
        case 'throwHit':
          RB.Audio.play('grab');
          RB.VFX.dust(e.x, 0, 0, 4);
          V.shake = 0.3;
          break;
        case 'throwBreak':
          RB.Audio.play('throwBreak');
          RB.UI.popText(e.x, 1.7, 'BREAK', '#ffffff');
          break;
        case 'tagIn':
          RB.Audio.play('ui');
          RB.VFX.burst(e.x, 1.0, 0x9fe6ff, 0.7);
          break;
        case 'tagAssistHit':
          RB.VFX.hit(e.x, e.y, 0x9fe6ff, false, 1);
          break;
        case 'moveStart':
          if (e.moveId.indexOf('5H') > -1) RB.Audio.play('whiffHeavy');
          else if (e.moveId.indexOf('5L') > -1) RB.Audio.play('whiffLight');
          else if (e.moveId.indexOf('6S') > -1) RB.Audio.play('whoosh');
          break;
        case 'dash':
          RB.Audio.play('dash');
          RB.VFX.dust(e.x, 0, -e.dir, 3);
          break;
        case 'jump':
          RB.Audio.play('jump');
          RB.VFX.dust(e.x, 0, 0, 2);
          break;
        case 'announce':
          RB.UI.bigAnnounce(e.text, e.style);
          if (e.style === 'fight') RB.Audio.play('fight');
          else RB.Audio.play('round');
          break;
        case 'invalid':
          RB.UI.popText(match.fighters[side].x, 2.0, e.reason === 'meter' ? 'NO METER' : 'NOT READY', '#ff6b6b');
          break;
        case 'roundStart':
          RB.UI.setRound(match);
          break;
        case 'matchEnd':
          RB.Audio.play('win');
          break;
        default: break;
      }
    }
    ev.length = 0;
  };

  /* ----------------------------------------------------------------- camera */
  V.updateCamera = function (dt, match) {
    var a = match.fighters[0], b = match.fighters[1];
    var mid = (a.x + b.x) / 2;
    var sep = Math.abs(a.x - b.x);
    var dist = 9.4 + sep * 0.42;
    var y = 2.62;
    var lookY = 1.3;

    var cine = (a.state === RB.ST.SUPER && a.cinematic) || (b.state === RB.ST.SUPER && b.cinematic);
    if (cine) {
      var att = (a.state === RB.ST.SUPER) ? a : b;
      mid = (att.x + (att === a ? b.x : a.x)) / 2;
      dist = 7.0;
      y = 2.0;
      lookY = 1.4;
    }
    if (match.phase === 'ko') {
      dist += 1.6;
      y += 0.3;
    }

    var ease = 1 - Math.pow(0.001, dt);
    V.camX += (mid - V.camX) * ease;
    V.camDist += (dist - V.camDist) * ease * 0.8;
    V.camY += (y - V.camY) * ease * 0.8;

    V.shake = Math.max(0, V.shake - dt * 2.2);
    V.kick = Math.max(0, V.kick - dt * 0.8);

    var sx = (Math.random() - 0.5) * V.shake * 0.55;
    var sy = (Math.random() - 0.5) * V.shake * 0.45;
    V.camera.position.set(
      RB.clamp(V.camX + sx, -7.2, 7.2),
      V.camY + sy,
      V.camDist - V.kick * 6
    );
    V.camera.lookAt(RB.clamp(V.camX, -7.2, 7.2), lookY, 0);
  };

  /* ------------------------------------------------------------------ frame */
  V.render = function (dt, match) {
    V.time += dt;
    if (V.stage) V.stage.update(dt, V.time);

    match.sides.forEach(function (side) {
      side.team.forEach(function (f) {
        var rig = rigFor(f);
        if (!rig) return;
        var active = f === match.fighters[f.side];
        rig.root.visible = active;
        rig.shadow.visible = active;
        if (!active) return;
        rig.root.position.set(f.x, f.y, 0);
        rig.root.rotation.y = f.face > 0 ? 0 : Math.PI;
        rig.applyPose(f, dt, V.time);
        rig.shadow.position.set(f.x, 0.02, 0);
        var sh = Math.max(0.35, 1 - f.y * 0.22);
        rig.shadow.scale.set(sh, sh, 1);
        rig.shadow.material.opacity = 0.30 * sh;

        /* fury art aura */
        if (f.furyArtT > 0 && Math.random() < 0.35) {
          RB.VFX.aura(f.x + (Math.random() - 0.5) * 0.6, 0.2 + Math.random() * 1.4, 0xffb347);
        }
        /* hit flash decay */
        if (rig.flash > 0) rig.setFlash(Math.max(0, rig.flash - dt * 8));
      });
    });

    /* projectiles */
    var seen = new Set();
    match.projectiles.forEach(function (p) {
      var m = projMesh(p);
      seen.add(p.id);
      m.position.set(p.x, p.y, 0);
      m.rotation.y += dt * 8;
      m.rotation.x += dt * 5;
      if (Math.random() < 0.5) RB.VFX.trail(p.x, p.y, 0x8ff0cf);
    });
    V.projMeshes.forEach(function (m, id) {
      if (!seen.has(id)) { V.scene.remove(m); V.projMeshes.delete(id); }
    });

    /* traps */
    var seenT = new Set();
    match.traps.forEach(function (t) {
      var m = trapMesh(t);
      seenT.add(t.id);
      m.position.set(t.x, 0, 0);
      var pulse = t.armed ? 1 + Math.sin(V.time * 9) * 0.12 : 0.7;
      m.userData.ring.scale.setScalar(pulse);
      m.userData.ring.material.color.setHex(t.armed ? 0xff8a5a : 0x5a7a8a);
      m.userData.core.material.opacity = t.armed ? 0.45 + Math.sin(V.time * 9) * 0.2 : 0.18;
    });
    V.trapMeshes.forEach(function (m, id) {
      if (!seenT.has(id)) { V.scene.remove(m); V.trapMeshes.delete(id); }
    });

    V.consumeEvents(match);
    V.updateCamera(dt, match);
    V.updateDebug(match);
    RB.VFX.update(dt);
    V.renderer.render(V.scene, V.camera);
  };

  /* ------------------------------------------------------------- debug view */
  V.updateDebug = function (match) {
    var idx = 0;
    function show(x, y, w, h, color) {
      if (idx >= V.boxHelpers.length) return;
      var e = V.boxHelpers[idx++];
      e.visible = true;
      e.position.set(x, y, 0.1);
      e.scale.set(w, h, 0.6);
      e.material.color.setHex(color);
    }
    if (!V.debug) {
      V.boxHelpers.forEach(function (b) { b.visible = false; });
      return;
    }
    match.fighters.forEach(function (f) {
      show(f.x, f.hurtCenter(), 0.75, f.crouching ? 1.0 : 1.55, 0x00ff88);
      if (f.state === RB.ST.ATTACK && f.move && !f.move.projectile && !f.move.trap) {
        var mv = f.move;
        if (f.moveFrame >= mv.startup && f.moveFrame < mv.startup + mv.active) {
          var cx = f.x + f.face * (mv.range / 2 + 0.15);
          show(cx, f.y + mv.hitY, mv.range, mv.height, 0xff3355);
        }
      }
    });
    for (; idx < V.boxHelpers.length; idx++) V.boxHelpers[idx].visible = false;
  };

  RB.View = V;
})(typeof globalThis !== 'undefined' ? globalThis : this);
