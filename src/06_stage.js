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

  /* Vertical gradient with explicit stops — used where the camera only ever
     sees a slice of the texture, so the gradient has to be authored for that
     slice instead of spread over the whole plane. */
  function skyGradient(stops) {
    var c = document.createElement('canvas');
    c.width = 8; c.height = 256;
    var g = c.getContext('2d');
    var grd = g.createLinearGradient(0, 0, 0, 256);
    stops.forEach(function (s) { grd.addColorStop(s[0], s[1]); });
    g.fillStyle = grd;
    g.fillRect(0, 0, 8, 256);
    var t = new T.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }

  /* Radial falloff as a texture. Replaces low-segment CircleGeometry, whose
     polygon edges were visible at 18 segments with no actual glow. */
  function radialGlow(stops, size) {
    size = size || 128;
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    var h = size / 2;
    var grd = g.createRadialGradient(h, h, 0, h, h, h);
    stops.forEach(function (s) { grd.addColorStop(s[0], s[1]); });
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    var t = new T.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }

  /* ==================================================================== */
  function buildFoundry(scene) {
    var def = RB.STAGES[0];
    var g = new T.Group();
    scene.add(g);

    /* Sky/backdrop. The camera only sees roughly the 0.50-0.88 band of this
       texture, so the gradient is authored there — otherwise it reads as a
       flat slab of one colour. */
    var backdrop = new T.Mesh(new T.PlaneGeometry(150, 80),
      new T.MeshBasicMaterial({
        map: skyGradient([
          [0.00, '#070d14'],
          [0.50, '#101a26'],
          [0.70, '#1b2b3c'],
          [0.85, '#2f455a'],
          [1.00, '#4b4a48']
        ]),
        fog: false
      }));
    backdrop.position.set(0, 12, -46);
    g.add(backdrop);

    /* Floor */
    var floor = box(22, 0.5, 7.4, 0x4a5563, 0, -0.25, -0.6, g);
    box(22.6, 0.16, 7.8, 0x232a33, 0, -0.55, -0.6, g);
    /* Front skirt so the platform never reads as a floating slab */
    box(22.6, 2.0, 0.5, 0x1b222b, 0, -1.2, 3.1, g);
    box(22.6, 0.12, 0.62, 0x2c343f, 0, -0.12, 3.1, g);
    /* Plate seams — darker than the deck so they actually read as seams */
    for (var i = -5; i <= 5; i++) {
      box(0.06, 0.02, 7.2, 0x2b333d, i * 2, 0.005, -0.6, g);
    }
    for (var j = 0; j < 3; j++) {
      box(21, 0.02, 0.05, 0x2b333d, 0, 0.005, -3 + j * 2.4, g);
    }
    /* Warm pool of furnace light on the deck: the foreground was a dead zone of
       flat grey, and this also ties the floor colour to the stage's key light. */
    var pool = new T.Mesh(new T.PlaneGeometry(16, 11),
      new T.MeshBasicMaterial({
        map: radialGlow([
          [0, 'rgba(255,150,70,0.30)'],
          [0.35, 'rgba(255,124,52,0.17)'],
          [0.70, 'rgba(255,96,36,0.06)'],
          [1, 'rgba(255,80,20,0)']
        ], 128),
        transparent: true, depthWrite: false, blending: T.AdditiveBlending
      }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(-3.2, 0.02, -1.4);
    g.add(pool);

    /* Hazard edge strips — one pair in frame, one at the stage limits */
    box(1.4, 0.03, 7.2, 0xd8a13a, -9.4, 0.01, -0.6, g, 0x3a2a08);
    box(1.4, 0.03, 7.2, 0xd8a13a, 9.4, 0.01, -0.6, g, 0x3a2a08);
    box(0.34, 0.03, 7.2, 0xc9962f, -4.9, 0.012, -0.6, g, 0x3a2a08);
    box(0.34, 0.03, 7.2, 0xc9962f, 4.9, 0.012, -0.6, g, 0x3a2a08);

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
    var emberTex = radialGlow([
      [0, 'rgba(255,246,214,1)'],
      [0.3, 'rgba(255,168,74,0.62)'],
      [0.65, 'rgba(255,106,32,0.20)'],
      [1, 'rgba(255,80,20,0)']
    ], 64);
    var emberTips = [];
    for (var s = 0; s < 5; s++) {
      var h = 6 + (s % 3) * 3;
      cyl(0.9, 1.2, h, 8, 0x171c22, -16 + s * 8, h / 2 + 1, -22 - (s % 2) * 4, g);
      var emberTip = new T.Mesh(new T.PlaneGeometry(1.25, 1.25),
        new T.MeshBasicMaterial({
          map: emberTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending
        }));
      emberTip.position.set(-16 + s * 8, h + 1.2, -21.6 - (s % 2) * 4);
      g.add(emberTip);
      emberTips.push(emberTip);
    }

    /* Furnace wall — mid-ground landmark that gives the stage depth */
    box(14, 8.4, 1.2, 0x333c47, -6.2, 4.2, -12.6, g);
    /* One radial falloff instead of two 18-gon discs: no visible polygon edge,
       and with bloom this becomes the stage's focal glow. */
    var archTex = radialGlow([
      [0, 'rgba(255,252,232,1)'],
      [0.16, 'rgba(255,226,150,0.96)'],
      [0.34, 'rgba(255,154,58,0.72)'],
      [0.60, 'rgba(255,92,26,0.28)'],
      [1, 'rgba(255,70,16,0)']
    ], 256);
    var arch = new T.Mesh(new T.PlaneGeometry(4.6, 4.6),
      new T.MeshBasicMaterial({
        map: archTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending
      }));
    arch.position.set(-6.2, 2.9, -11.95);
    g.add(arch);
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
      box(s * 1.25, s * 1.25, s * 1.25, 0x41505f, c[0], s * 0.62, c[2], g);
      box(s * 1.35, 0.08, s * 1.35, 0x5a6a7b, c[0], s * 1.26, c[2], g);
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
        /* Furnace mouth breathes instead of sitting there as a static disc. */
        arch.material.opacity = 0.86 + Math.sin(time * 5.1) * 0.08 + Math.sin(time * 11.3) * 0.05;
        arch.scale.setScalar(1 + Math.sin(time * 3.7) * 0.025);
        for (var e2 = 0; e2 < emberTips.length; e2++) {
          emberTips[e2].material.opacity = 0.72 + Math.sin(time * 6 + e2) * 0.24;
        }
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

    /* The camera only ever sees roughly the 0.51-0.98 band of this texture, so
       the gradient is authored INSIDE that band. The old blue->peach ramp
       averaged to neutral grey (#908f8b) exactly where it was visible.
       Sits behind the mountains (z -58..-79) so they are not occluded. */
    var backdrop = new T.Mesh(new T.PlaneGeometry(190, 90),
      new T.MeshBasicMaterial({
        map: skyGradient([
          [0.00, '#050d18'],
          [0.34, '#0f3568'],
          [0.52, '#1f5aa8'],
          [0.70, '#3f86cc'],
          [0.86, '#7fb6e2'],
          [0.93, '#b6d6ee'],
          [0.97, '#e2d9c6'],
          [1.00, '#f2dcbe']
        ]),
        fog: false
      }));
    backdrop.position.set(0, 10, -110);
    g.add(backdrop);

    /* Warmth is baked into the bottom of the sky texture rather than added as a
       second additive plane — a separate plane showed a hard top edge. */

    /* Sun: radial falloff instead of a visible 24-gon disc, sized to read as a
       disc with a halo rather than a full-frame wash. */
    var sun = new T.Mesh(new T.PlaneGeometry(20, 20),
      new T.MeshBasicMaterial({
        map: radialGlow([
          [0, 'rgba(255,250,236,0.92)'],
          [0.16, 'rgba(255,236,198,0.55)'],
          [0.36, 'rgba(255,214,160,0.20)'],
          [0.66, 'rgba(255,200,150,0.06)'],
          [1, 'rgba(255,190,130,0)']
        ], 256),
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false
      }));
    sun.position.set(-34, 11.5, -104);
    g.add(sun);

    /* Platform — deliberately darker than the sky so the fighters are the
       highest-contrast thing on screen. */
    box(22, 0.6, 7.6, 0x7d7a72, 0, -0.3, -0.6, g);
    box(23, 0.3, 8.2, 0x5c5a53, 0, -0.72, -0.6, g);
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

    /* Signal array: off-centre so it stops colliding with the timer and the
       ROUND label, and dimmer so it reads as background. */
    var array = new T.Group();
    array.position.set(10.5, 4.2, -24);
    [3.4, 2.5, 1.7].forEach(function (r, k) {
      var ring = new T.Mesh(new T.TorusGeometry(r, 0.09, 6, 40),
        new T.MeshBasicMaterial({ color: 0x9fe3ff, transparent: true, opacity: 0.55 - k * 0.1 }));
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

    /* Mountain silhouettes. Two things matter here: nothing sits at x = 0
       (that is exactly where the timer and ROUND label live), and the peaks are
       painted with the sky colour rather than lit — a lit dark cone at 70 units
       reads as a black wedge, not distance. */
    var peaks = [-46, -34, -23, -12, 12, 23, 34, 46];
    for (var m = 0; m < peaks.length; m++) {
      var far = (m % 2) === 0;
      var col = far ? 0x7b9dbd : 0x5b7c9c;
      var hgt = 9 + (m % 4) * 3.2;
      var mm = new T.Mesh(new T.ConeGeometry(6 + (m % 3) * 2.5, hgt, 4),
        new T.MeshBasicMaterial({ color: col, fog: false }));
      /* Base sits below the horizon line so the peaks read as grounded ridges
         rather than floating triangles. */
      mm.position.set(peaks[m], hgt / 2 - 7, far ? -84 : -72);
      mm.rotation.y = Math.PI / 4 + (m % 3) * 0.18;
      g.add(mm);
    }

    /* Clouds — lifted into the sky and kept faint; a low, dense band sat right
       on the horizon and read as a white stripe across the frame. */
    var clouds = [];
    for (var c = 0; c < 7; c++) {
      var cl = new T.Mesh(new T.PlaneGeometry(26, 8),
        new T.MeshBasicMaterial({ map: cloudTex(), transparent: true, opacity: 0.22, depthWrite: false }));
      cl.position.set(-34 + c * 12, 6.5 + (c % 3) * 3.4, -26 - (c % 4) * 4);
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

    /* Fog matches the horizon so distant geometry dissolves into the sky
       instead of adding a second, greyer layer on top of it. Pushed far out so
       the platform and columns stay crisp. */
    scene.fog = new T.Fog(0x8fbde0, 58, 155);
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
