/* =========================================================================
   RIFTBOUND: CLASH PROTOCOL — 05 VFX
   Pooled, additive, short-lived. Effects react to confirmed combat events and
   never decide a hit. Nothing here allocates during a match.
   ========================================================================= */
(function (root) {
  'use strict';
  var RB = root.RB;
  var T = root.THREE;

  var V = {
    scene: null,
    cam: null,
    fx: [],          // active pooled effects
    pool: [],        // recycled meshes
    flashEl: null,
    flashT: 0,
    flashMax: 0,
    flashColor: '#fff',
    quality: 1
  };

  function tex(size, draw) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    draw(g, size);
    var t = new T.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }

  var TEX = {};
  function buildTextures() {
    TEX.spark = tex(128, function (g, s) {
      var c = s / 2;
      var grd = g.createRadialGradient(c, c, 0, c, c, c);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.25, 'rgba(255,255,255,0.85)');
      grd.addColorStop(0.6, 'rgba(255,255,255,0.18)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
      g.translate(c, c);
      g.fillStyle = '#fff';
      for (var i = 0; i < 6; i++) {
        g.rotate(Math.PI / 3);
        g.beginPath();
        g.moveTo(0, -4);
        g.lineTo(c * 0.14, -c * 0.96);
        g.lineTo(-c * 0.14, -c * 0.96);
        g.closePath();
        g.fill();
      }
    });
    TEX.ring = tex(128, function (g, s) {
      var c = s / 2;
      g.strokeStyle = '#fff';
      g.lineWidth = s * 0.07;
      g.beginPath();
      g.arc(c, c, c * 0.72, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 0.4;
      g.lineWidth = s * 0.03;
      g.beginPath();
      g.arc(c, c, c * 0.9, 0, Math.PI * 2);
      g.stroke();
    });
    TEX.soft = tex(64, function (g, s) {
      var c = s / 2;
      var grd = g.createRadialGradient(c, c, 0, c, c, c);
      grd.addColorStop(0, 'rgba(255,255,255,0.9)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
    });
    TEX.streak = tex(128, function (g, s) {
      var grd = g.createLinearGradient(0, 0, s, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(0.45, 'rgba(255,255,255,0.95)');
      grd.addColorStop(0.55, 'rgba(255,255,255,0.95)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, s * 0.36, s, s * 0.28);
    });
    TEX.slash = tex(128, function (g, s) {
      g.translate(s / 2, s / 2);
      g.rotate(-0.5);
      var grd = g.createLinearGradient(-s / 2, 0, s / 2, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(0.5, 'rgba(255,255,255,1)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(0, 0, s * 0.46, s * 0.06, 0, 0, Math.PI * 2);
      g.fill();
    });
    /* Comic starburst with a dark keyline. Drawn with normal blending UNDER the
       additive glow, so the attacker's accent colour survives a 3-hit burst
       instead of every sprite summing to white. */
    TEX.burst = tex(128, function (g, s) {
      var c = s / 2;
      g.translate(c, c);
      function star(rad, inner, spikes) {
        g.beginPath();
        for (var i = 0; i < spikes * 2; i++) {
          var a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
          var r = i % 2 === 0 ? rad : inner;
          var x = Math.cos(a) * r, y = Math.sin(a) * r;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.closePath();
      }
      star(c * 0.96, c * 0.46, 9);
      g.fillStyle = '#141018';
      g.fill();
      star(c * 0.80, c * 0.34, 9);
      g.fillStyle = '#ffffff';
      g.fill();
      var grd = g.createRadialGradient(0, 0, 0, 0, 0, c * 0.36);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(0, 0, c * 0.36, 0, Math.PI * 2); g.fill();
    });
    /* Dust/smoke: opaque-ish so it reads on a bright floor, where additive
       grey is invisible. */
    TEX.smoke = tex(96, function (g, s) {
      var c = s / 2;
      var grd = g.createRadialGradient(c, c, 0, c, c, c);
      grd.addColorStop(0, 'rgba(255,255,255,0.60)');
      grd.addColorStop(0.45, 'rgba(255,255,255,0.28)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
    });
  }

  V.init = function (scene, camera) {
    V.scene = scene;
    V.cam = camera;
    buildTextures();
    V.TEX = TEX;                       /* exposed so other modules can reuse the textures */
    V.flashEl = document.getElementById('flash');
  };

  /* Per-kind material recipe. Additive kinds sit on top; the normal-blended
     ones render underneath so they can carry an outline and a real colour. */
  var KIND = {
    sprite: { tex: 'spark', blend: T.AdditiveBlending, order: 5 },
    ring: { tex: 'ring', blend: T.AdditiveBlending, order: 5 },
    soft: { tex: 'soft', blend: T.AdditiveBlending, order: 5 },
    streak: { tex: 'streak', blend: T.AdditiveBlending, order: 5 },
    slash: { tex: 'slash', blend: T.AdditiveBlending, order: 5 },
    burst: { tex: 'burst', blend: T.NormalBlending, order: 4 },
    smoke: { tex: 'smoke', blend: T.NormalBlending, order: 3 }
  };

  function take(kind) {
    for (var i = 0; i < V.pool.length; i++) {
      if (V.pool[i].userData.kind === kind && !V.pool[i].userData.busy) {
        var m = V.pool[i];
        m.userData.busy = true;
        m.visible = true;
        return m;
      }
    }
    var spec = KIND[kind] || KIND.slash;
    var mesh = new T.Mesh(new T.PlaneGeometry(1, 1),
      new T.MeshBasicMaterial({
        map: TEX[spec.tex], transparent: true, depthWrite: false, blending: spec.blend
      }));
    mesh.userData.kind = kind;
    mesh.userData.busy = true;
    mesh.renderOrder = spec.order;
    V.scene.add(mesh);
    V.pool.push(mesh);
    return mesh;
  }

  function spawn(kind, opts) {
    if (V.fx.length > 160 * V.quality) return null;
    var m = take(kind);
    m.material.color.setHex(opts.color == null ? 0xffffff : opts.color);
    m.material.opacity = opts.opacity == null ? 1 : opts.opacity;
    m.position.set(opts.x || 0, opts.y || 0, opts.z == null ? 0.55 : opts.z);
    m.scale.setScalar(opts.size || 1);
    m.rotation.z = opts.rot || 0;
    if (opts.sx != null || opts.sy != null) m.scale.set(opts.sx || 1, opts.sy || 1, 1);
    m.rotation.x = 0;
    var e = {
      mesh: m, life: opts.life || 0.22, maxLife: opts.life || 0.22,
      vx: opts.vx || 0, vy: opts.vy || 0,
      gravity: opts.gravity || 0,
      grow: opts.grow == null ? 1.8 : opts.grow,
      fade: opts.fade == null ? 1 : opts.fade,
      spin: opts.spin || 0,
      rot: opts.rot || 0,
      sx: opts.sx || 1, sy: opts.sy || 1,
      baseSize: opts.size || 1
    };
    V.fx.push(e);
    return e;
  }

  V.update = function (dt) {
    /* Debug freeze: screenshot harnesses set RB.freeze so a 0.2 s effect is
       still on screen when the (software-rendered) frame is captured. */
    if (RB.freeze) {
      for (var q = 0; q < V.fx.length; q++) {
        var eq = V.fx[q];
        if (V.cam) { eq.mesh.quaternion.copy(V.cam.quaternion); eq.mesh.rotateZ(eq.rot); }
      }
      return;
    }
    for (var i = V.fx.length - 1; i >= 0; i--) {
      var e = V.fx[i];
      e.life -= dt;
      if (e.life <= 0) {
        e.mesh.userData.busy = false;
        e.mesh.visible = false;
        V.fx.splice(i, 1);
        continue;
      }
      var t = 1 - e.life / e.maxLife;
      if (e.gravity) e.vy -= e.gravity * dt;
      e.mesh.position.x += e.vx * dt;
      e.mesh.position.y += e.vy * dt;
      if (e.spin) e.rot += e.spin * dt;
      var s = e.baseSize * (1 + (e.grow - 1) * t);
      e.mesh.scale.set(s * e.sx, s * e.sy, 1);
      e.mesh.material.opacity = Math.pow(1 - t, 1.4) * e.fade;
      if (V.cam) {
        e.mesh.quaternion.copy(V.cam.quaternion);
        e.mesh.rotateZ(e.rot);
      }
    }

    if (V.flashT > 0) {
      V.flashT -= dt;
      var k = Math.max(0, V.flashT / V.flashMax);
      if (V.flashEl) {
        V.flashEl.style.opacity = (k * k * 0.55).toFixed(3);
        V.flashEl.style.background = V.flashColor;
      }
    } else if (V.flashEl && V.flashEl.style.opacity !== '0') {
      V.flashEl.style.opacity = '0';
    }
  };

  V.flash = function (color, strength, dur) {
    V.flashColor = color || '#ffffff';
    V.flashT = dur || 0.16;
    V.flashMax = V.flashT;
    if (V.flashEl) V.flashEl.style.background = V.flashColor;
    V._flashStrength = strength || 1;
  };

  /* ---------------------------------------------------------------- events */
  /* Layering order matters: comic burst (normal) -> core flash -> accent
     sparks + ring (additive). Keeping the count low is what stops three hits in
     0.3 s from summing to pure white. */
  V.hit = function (x, y, color, heavy, dir, counter) {
    dir = dir || 1;
    color = color == null ? 0xffffff : color;

    spawn('burst', {
      x: x, y: y, color: heavy ? 0xffd08a : 0xfff2c8,
      size: heavy ? 0.78 : 0.52,
      life: heavy ? 0.17 : 0.13, grow: 1.45, fade: 1,
      rot: Math.random() * 0.5 - 0.25
    });

    spawn('soft', {
      x: x, y: y, color: 0xffffff,
      size: heavy ? 0.34 : 0.24,
      life: 0.09, grow: 1.1, fade: 1
    });

    var n = heavy ? 5 : 3;
    for (var i = 0; i < n; i++) {
      spawn('streak', {
        x: x, y: y + (Math.random() - 0.5) * 0.25,
        color: color, size: heavy ? 0.55 : 0.4,
        sx: 1.7 + Math.random() * 0.8, sy: 0.15,
        rot: (Math.random() - 0.5) * 0.7,
        vx: dir * (2.2 + Math.random() * 2.6),
        vy: (Math.random() - 0.5) * 1.6,
        life: 0.13 + Math.random() * 0.07, grow: 1.5, fade: 0.95
      });
    }

    spawn('ring', {
      x: x, y: y, color: color, size: heavy ? 0.5 : 0.36,
      life: heavy ? 0.24 : 0.17, grow: heavy ? 3.2 : 2.4, fade: 0.85
    });
    /* Counter / punish gets a second, gold ring so the state reads instantly. */
    if (counter) {
      spawn('ring', {
        x: x, y: y, color: 0xffd24a, size: 0.3,
        life: 0.3, grow: 5.2, fade: 0.9
      });
    }

    if (heavy) {
      /* Debris with gravity — the thing that sells weight over a flat flash. */
      for (var d = 0; d < 6; d++) {
        spawn('sprite', {
          x: x, y: y, color: 0xffb066, size: 0.26 + Math.random() * 0.2,
          vx: dir * (1.8 + Math.random() * 2.4),
          vy: 2.0 + Math.random() * 2.4,
          gravity: 9,
          life: 0.4 + Math.random() * 0.25, grow: 0.6, fade: 0.9
        });
      }
      spawn('slash', {
        x: x, y: y, color: 0xffffff, size: 0.95,
        rot: Math.random() * 0.6 - 0.3, life: 0.11, grow: 1.4, fade: 0.7
      });
    }
    /* No full-screen flash on normal hits: the defender rig flash covers that.
       Full-screen is reserved for supers and KO. */
  };

  V.block = function (x, y, color) {
    for (var i = 0; i < 3; i++) {
      spawn('sprite', {
        x: x, y: y + (Math.random() - 0.5) * 0.4, color: color || 0x9fe6ff,
        size: 0.55, vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2,
        life: 0.14, grow: 1.4
      });
    }
    spawn('ring', { x: x, y: y, color: color || 0x9fe6ff, size: 0.5, life: 0.16, grow: 2.2, fade: 0.7 });
  };

  V.launch = function (x, y, color) {
    for (var i = 0; i < 8; i++) {
      spawn('streak', {
        x: x + (Math.random() - 0.5) * 0.5, y: y - 0.4 - i * 0.12,
        color: color, size: 1.6 + Math.random(), rot: Math.PI / 2 + (Math.random() - 0.5) * 0.4,
        vy: 2.2 + Math.random() * 2, life: 0.22, grow: 1.2, fade: 0.85, spin: 0
      });
    }
    spawn('ring', { x: x, y: y, color: color, size: 0.9, life: 0.28, grow: 4.0, fade: 0.8 });
  };

  V.dustColor = 0x9a938a;
  V.dust = function (x, y, dir, amount) {
    amount = amount || 4;
    for (var i = 0; i < amount; i++) {
      spawn('smoke', {
        x: x + (Math.random() - 0.5) * 0.5, y: 0.08 + Math.random() * 0.12,
        color: V.dustColor, size: 0.5 + Math.random() * 0.5,
        vx: (dir || 0) * (0.6 + Math.random()) + (Math.random() - 0.5) * 0.5,
        vy: 0.3 + Math.random() * 0.5,
        life: 0.35 + Math.random() * 0.2, grow: 2.2, fade: 0.5
      });
    }
  };

  V.aura = function (x, y, color) {
    for (var i = 0; i < 3; i++) {
      spawn('ring', {
        x: x + (Math.random() - 0.5) * 0.6, y: y + Math.random() * 1.6,
        color: color, size: 0.6 + Math.random() * 0.4,
        life: 0.4, grow: 2.4, fade: 0.55, vy: 0.8
      });
    }
  };

  V.burst = function (x, y, color, power, doFlash) {
    power = power || 1;
    var n = Math.round(14 * power);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = (1.5 + Math.random() * 4) * power;
      spawn('sprite', {
        x: x, y: y, color: color, size: 1.0 + Math.random() * 1.2,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        gravity: 2.5,
        life: 0.3 + Math.random() * 0.2, grow: 2.6, fade: 0.9
      });
    }
    spawn('ring', { x: x, y: y, color: color, size: 1.4, life: 0.4, grow: 6.5, fade: 1 });
    spawn('ring', { x: x, y: y, color: 0xffffff, size: 0.8, life: 0.28, grow: 4.5, fade: 0.9 });
    /* Full-screen flash is opt-in: only supers and KO should strobe the frame. */
    if (doFlash) V.flash('#ffffff', 1, 0.14);
  };

  V.trail = function (x, y, color) {
    spawn('soft', { x: x, y: y, color: color, size: 0.55, life: 0.2, grow: 0.4, fade: 0.6 });
  };

  V.superLine = function (x, y, color, dir) {
    spawn('streak', {
      x: x, y: y, color: color, size: 5 + Math.random() * 4,
      sx: 5, sy: 0.06, rot: 0, life: 0.22, grow: 1, fade: 0.7,
      vx: dir * 6
    });
  };

  V.quality = 1;
  V.setQuality = function (q) { V.quality = q; };

  RB.VFX = V;
})(typeof globalThis !== 'undefined' ? globalThis : this);
