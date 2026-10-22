/* =========================================================================
   RIFTBOUND: CLASH PROTOCOL — 06 STAGES
   Two arenas sharing one tested combat footprint: same bounds, same camera
   rails, different palette, silhouette, lighting and background motion.
   ========================================================================= */
(function (root) {
  'use strict';
  var RB = root.RB;
  var T = root.THREE;

  function mat(color, emissive) {
    var m = new T.MeshLambertMaterial({ color: color });
    if (emissive) m.emissive = new T.Color(emissive);
    return m;
  }
  function glow(color) { return new T.MeshBasicMaterial({ color: color }); }

  function box(w, h, d, color, x, y, z, group, emissive) {
    var m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(color, emissive));
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }
  function cyl(rt, rb, h, seg, color, x, y, z, group, emissive) {
    var m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg), mat(color, emissive));
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }

  function emberSystem(count, color, size, area, yRange) {
    var geo = new T.BufferGeometry();
    var pos = new Float32Array(count * 3);
    var vel = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * area[0];
      pos[i * 3 + 1] = yRange[0] + Math.random() * (yRange[1] - yRange[0]);
      pos[i * 3 + 2] = area[1] * (Math.random() - 0.5) - 2;
      vel[i] = 0.25 + Math.random() * 0.8;
    }
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    var m = new T.PointsMaterial({
      color: color, size: size, transparent: true, opacity: 0.85,
      depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true
    });
    var pts = new T.Points(geo, m);
    pts.userData.vel = vel;
    pts.userData.range = yRange;
    return pts;
  }

  function skyTexture(top, mid, bottom) {
    var c = document.createElement('canvas');
    c.width = 8; c.height = 256;
    var g = c.getContext('2d');
    var grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, top);
    grd.addColorStop(0.55, mid);
    grd.addColorStop(1, bottom);
    g.fillStyle = grd;
    g.fillRect(0, 0, 8, 256);
    var t = new T.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }

  /* ==================================================================== */
  function buildFoundry(scene) {
    var def = RB.STAGES[0];
    var g = new T.Group();
    scene.add(g);

    /* Sky/backdrop */
    var backdrop = new T.Mesh(new T.PlaneGeometry(150, 80),
      new T.MeshBasicMaterial({ map: skyTexture('#081018', '#16283a', '#31465c') }));
    backdrop.position.set(0, 12, -46);
    g.add(backdrop);

    /* Floor */
    var floor = box(22, 0.5, 7.4, 0x3d4550, 0, -0.25, -0.6, g);
    box(22.6, 0.16, 7.8, 0x232a33, 0, -0.55, -0.6, g);
    /* Front skirt so the platform never reads as a floating slab */
    box(22.6, 2.0, 0.5, 0x1b222b, 0, -1.2, 3.1, g);
    box(22.6, 0.12, 0.62, 0x2c343f, 0, -0.12, 3.1, g);
    /* Plate seams */
    for (var i = -5; i <= 5; i++) {
      box(0.06, 0.02, 7.2, 0x3b424b, i * 2, 0.005, -0.6, g);
    }
    for (var j = 0; j < 3; j++) {
      box(21, 0.02, 0.05, 0x3b424b, 0, 0.005, -3 + j * 2.4, g);
    }
    /* Hazard edge strips */
    box(1.4, 0.03, 7.2, 0xd8a13a, -9.4, 0.01, -0.6, g, 0x3a2a08);
    box(1.4, 0.03, 7.2, 0xd8a13a, 9.4, 0.01, -0.6, g, 0x3a2a08);

    /* Molten channel below the platform */
    var lava = new T.Mesh(new T.PlaneGeometry(30, 5), glow(0xff5a1e));
    lava.rotation.x = -Math.PI / 2;
    lava.position.set(0, -1.6, -3.2);
    g.add(lava);
    var lavaGlow = new T.PointLight(0xff5a1e, 1.1, 18);
    lavaGlow.position.set(0, -0.6, -3.4);
    g.add(lavaGlow);

    /* Furnace light spilling from the arch */
    var furnaceLight = new T.PointLight(0xff7a30, 2.6, 30);
    furnaceLight.position.set(-6.2, 3.2, -11.2);
    g.add(furnaceLight);

    /* Distant furnace stacks */
    for (var s = 0; s < 5; s++) {
      var h = 6 + (s % 3) * 3;
      cyl(0.9, 1.2, h, 8, 0x171c22, -16 + s * 8, h / 2 + 1, -22 - (s % 2) * 4, g);
      var emberTip = new T.Mesh(new T.CircleGeometry(0.5, 8), glow(0xff6a20));
      emberTip.position.set(-16 + s * 8, h + 1.2, -21.6 - (s % 2) * 4);
      g.add(emberTip);
    }

    /* Furnace wall — mid-ground landmark that gives the stage depth */
    box(14, 8.4, 1.2, 0x333c47, -6.2, 4.2, -12.6, g);
    var arch = new T.Mesh(new T.CircleGeometry(1.75, 18), glow(0xff6a20));
    arch.position.set(-6.2, 2.9, -11.95);
    g.add(arch);
    var archCore = new T.Mesh(new T.CircleGeometry(1.05, 18), glow(0xffc26a));
    archCore.position.set(-6.2, 2.9, -11.9);
    g.add(archCore);
    box(4.4, 0.35, 0.5, 0x46525f, -6.2, 4.9, -11.9, g);
    box(15.6, 0.45, 1.5, 0x3f4a58, -6.2, 8.5, -12.6, g);

    /* Vertical pipe columns break the horizontals */
    [-11.6, -3.4, 3.4, 11.6].forEach(function (x, i) {
      var h = 8.8;
      var pipe = new T.Mesh(new T.CylinderGeometry(0.34, 0.42, h, 10), mat(0x3a444f));
      pipe.position.set(x, h / 2, -7.6 - (i % 2) * 0.9);
      g.add(pipe);
      var band = new T.Mesh(new T.CylinderGeometry(0.46, 0.46, 0.14, 10), glow(0x39d7ff));
      band.position.set(x, 3.2 + (i % 3) * 1.5, -7.6 - (i % 2) * 0.9);
      g.add(band);
    });

    /* One high truss, not a stack of horizontal bars */
    box(30, 0.30, 0.30, 0x39434f, 0, 9.6, -9.6, g);
    for (var k = -4; k <= 4; k++) box(0.12, 0.65, 0.12, 0x39434f, k * 3.2, 9.25, -9.6, g);

    /* Background terrace — gives the props something to stand on */
    box(30, 0.6, 9, 0x2b333d, 0, -0.42, -8.6, g);
    box(30, 0.12, 0.4, 0x3d4752, 0, -0.05, -4.2, g);

    /* Vertical steam risers (kept vertical: horizontals cut across fighters) */
    for (var p = 0; p < 4; p++) {
      var riser = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 8.4, 8), mat(0x46505b));
      riser.position.set(-13.5 + p * 0.9, 4.2, -10.4 - p * 0.35);
      g.add(riser);
    }

    /* Cyan work lights — small sources, never UI-shaped bars */
    for (var l = 0; l < 4; l++) {
      var lamp = new T.Mesh(new T.SphereGeometry(0.16, 8, 6), glow(0x39d7ff));
      lamp.position.set(-9 + l * 6, 7.4, -8.2);
      g.add(lamp);
    }

    /* Cargo of varying sizes — silhouette variety without noise */
    var cargo = [
      [-8.6, 1.1, -6.6], [-6.9, 0.8, -7.2], [-2.4, 1.3, -6.9],
      [1.2, 0.9, -7.1], [4.4, 1.2, -6.5], [7.2, 1.0, -7.3], [9.4, 1.35, -6.7]
    ];
    cargo.forEach(function (c, i) {
      var s = c[1];
      box(s * 1.25, s * 1.25, s * 1.25, 0x333d48, c[0], s * 0.62, c[2], g);
      box(s * 1.35, 0.08, s * 1.35, 0x47525f, c[0], s * 1.26, c[2], g);
      if (i % 3 === 0) {
        box(0.06, s * 0.9, 0.06, 0xd8a13a, c[0] + s * 0.6, s * 0.62, c[2] + s * 0.6, g);
      }
    });

    var embers = emberSystem(90, 0xff8a3a, 0.09, [40, 18], [-1, 9]);
    g.add(embers);

    /* Fog / background */
    scene.fog = new T.Fog(def.fog, 38, 96);
    scene.background = new T.Color(def.sky);

    var key = new T.DirectionalLight(def.key, 2.1);
    key.position.set(-8, 12, 9);
    var rim = new T.DirectionalLight(def.rim, 1.5);
    rim.position.set(9, 6, -10);
    var fill = new T.DirectionalLight(0xbfd8ef, 0.55);
    fill.position.set(2, 5, 12);
    var hemi = new T.HemisphereLight(0xbfd8ef, 0x3a2a18, 0.95);

    var t0 = 0;
    return {
      def: def, group: g, lights: [key, rim, fill, hemi, furnaceLight],
      update: function (dt, time) {
        t0 = time;
        furnaceLight.intensity = 2.0 + Math.sin(time * 5.1) * 0.25 + Math.sin(time * 11.3) * 0.12;
        lavaGlow.intensity = 1.0 + Math.sin(time * 3.3) * 0.18;
        lava.material.color.setHSL(0.045, 1, 0.42 + Math.sin(time * 4) * 0.04);
        var pos = embers.geometry.attributes.position;
        var vel = embers.userData.vel;
        for (var i = 0; i < pos.count; i++) {
          var y = pos.getY(i) + vel[i] * dt;
          if (y > 9) { y = -1; pos.setX(i, (Math.random() - 0.5) * 40); }
          pos.setY(i, y);
        }
        pos.needsUpdate = true;
      }
    };
  }

  /* ==================================================================== */
  function buildTemple(scene) {
    var def = RB.STAGES[1];
    var g = new T.Group();
    scene.add(g);

    var backdrop = new T.Mesh(new T.PlaneGeometry(180, 90),
      new T.MeshBasicMaterial({ map: skyTexture('#0e1a30', '#3f5f86', '#d8b98f') }));
    backdrop.position.set(0, 16, -52);
    g.add(backdrop);

    /* Sun disc */
    var sun = new T.Mesh(new T.CircleGeometry(5, 24), new T.MeshBasicMaterial({ color: 0xffe6bd, transparent: true, opacity: 0.85 }));
    sun.position.set(-16, 15, -52);
    g.add(sun);

    /* Platform */
    box(22, 0.6, 7.6, 0xa6a296, 0, -0.3, -0.6, g);
    box(23, 0.3, 8.2, 0x7c7a71, 0, -0.72, -0.6, g);
    box(23, 2.2, 0.5, 0x605f58, 0, -1.5, 3.2, g);
    box(23, 0.12, 0.62, 0x8f8d83, 0, -0.1, 3.2, g);
    /* Stone tiles */
    for (var i = -5; i <= 5; i++) box(0.05, 0.02, 7.4, 0x8b8b84, i * 2, 0.005, -0.6, g);
    for (var j = 0; j < 3; j++) box(21.6, 0.02, 0.04, 0x8b8b84, 0, 0.005, -3 + j * 2.4, g);

    /* Steps down at both ends */
    for (var s = 0; s < 3; s++) {
      box(2.6, 0.22, 7.6 - s * 0.5, 0x84847e, -11.4 - s * 1.2, -0.1 - s * 0.22, -0.6, g);
      box(2.6, 0.22, 7.6 - s * 0.5, 0x84847e, 11.4 + s * 1.2, -0.1 - s * 0.22, -0.6, g);
    }

    /* Columns along the edges (strong vertical rhythm) */
    [-9.8, -6.6, 6.6, 9.8].forEach(function (x, idx) {
      var h = idx < 2 ? 7.5 : 7.5;
      cyl(0.55, 0.7, h, 10, 0xbfb9a8, x, h / 2, -4.6, g);
      box(1.7, 0.4, 1.7, 0xa9a294, x, h + 0.2, -4.6, g);
      box(1.5, 0.35, 1.5, 0x8d8779, x, 0.1, -4.6, g);
    });

    /* Signal array: rotating rings behind the arena */
    var array = new T.Group();
    array.position.set(0, 4.4, -24);
    [3.4, 2.5, 1.7].forEach(function (r, k) {
      var ring = new T.Mesh(new T.TorusGeometry(r, 0.09, 6, 40),
        new T.MeshBasicMaterial({ color: 0x9fe3ff, transparent: true, opacity: 0.75 - k * 0.12 }));
      ring.rotation.x = Math.PI / 2 + k * 0.4;
      ring.rotation.y = k * 0.5;
      array.add(ring);
    });
    var core = new T.Mesh(new T.IcosahedronGeometry(0.7, 0), glow(0xd8f4ff));
    array.add(core);
    g.add(array);

    /* Distant floating structures */
    for (var f = 0; f < 4; f++) {
      var px = -20 + f * 13, py = 9 + (f % 3) * 4.5;
      box(3.2, 0.8, 2.2, 0x6d7684, px, py, -30 - f * 3, g);
      cyl(0.2, 0.35, 4.4, 6, 0x59616e, px - 1, py - 2.4, -30 - f * 3, g);
      cyl(0.2, 0.35, 4.4, 6, 0x59616e, px + 1, py - 2.4, -30 - f * 3, g);
    }

    /* Mountain silhouettes */
    for (var m = 0; m < 7; m++) {
      var mm = new T.Mesh(new T.ConeGeometry(4 + (m % 3) * 2, 7 + (m % 4) * 3, 4), mat(0x54687f));
      mm.position.set(-40 + m * 13, 1, -58 - (m % 3) * 7);
      mm.rotation.y = Math.PI / 4;
      g.add(mm);
    }

    /* Clouds */
    var clouds = [];
    for (var c = 0; c < 7; c++) {
      var cl = new T.Mesh(new T.PlaneGeometry(26, 8),
        new T.MeshBasicMaterial({ map: cloudTex(), transparent: true, opacity: 0.5, depthWrite: false }));
      cl.position.set(-34 + c * 12, 1.5 + (c % 3) * 2.4, -26 - (c % 4) * 4);
      g.add(cl);
      clouds.push(cl);
    }

    /* Lanterns on the columns */
    [-9.8, 9.8].forEach(function (x) {
      var lamp = new T.Mesh(new T.SphereGeometry(0.32, 8, 6), glow(0xffcf8a));
      lamp.position.set(x, 5.6, -3.6);
      g.add(lamp);
      var pl = new T.PointLight(0xffc07a, 0.9, 12);
      pl.position.copy(lamp.position);
      g.add(pl);
    });

    var motes = emberSystem(70, 0xd8f0ff, 0.07, [46, 20], [0, 10]);
    g.add(motes);

    scene.fog = new T.Fog(def.fog, 42, 110);
    scene.background = new T.Color(def.sky);

    var key = new T.DirectionalLight(def.key, 2.2);
    key.position.set(12, 14, 8);
    var rim = new T.DirectionalLight(def.rim, 1.1);
    rim.position.set(-10, 8, -12);
    var fill = new T.DirectionalLight(0xdff0ff, 0.5);
    fill.position.set(-2, 6, 12);
    var hemi = new T.HemisphereLight(0xdff0ff, 0x8a7c5f, 1.15);

    function cloudTex() {
      var cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      var g2 = cv.getContext('2d');
      var grd = g2.createRadialGradient(64, 64, 4, 64, 64, 64);
      grd.addColorStop(0, 'rgba(255,255,255,0.9)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.35)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g2.fillStyle = grd;
      g2.fillRect(0, 0, 128, 128);
      return new T.CanvasTexture(cv);
    }

    return {
      def: def, group: g, lights: [key, rim, fill, hemi],
      update: function (dt, time) {
        array.rotation.y += dt * 0.25;
        array.children[0].rotation.z += dt * 0.3;
        array.children[1].rotation.z -= dt * 0.45;
        core.scale.setScalar(1 + Math.sin(time * 2.2) * 0.08);
        for (var i = 0; i < clouds.length; i++) {
          clouds[i].position.x += dt * (0.25 + i * 0.05);
          if (clouds[i].position.x > 44) clouds[i].position.x = -44;
        }
        var pos = motes.geometry.attributes.position;
        var vel = motes.userData.vel;
        for (var k = 0; k < pos.count; k++) {
          var y = pos.getY(k) + vel[k] * dt * 0.4;
          if (y > 10) y = 0;
          pos.setY(k, y);
          pos.setX(k, pos.getX(k) + Math.sin(time + k) * dt * 0.08);
        }
        pos.needsUpdate = true;
      }
    };
  }

  RB.Stage = {
    build: function (index, scene) {
      return index === 1 ? buildTemple(scene) : buildFoundry(scene);
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
