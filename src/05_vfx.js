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
  }

  V.init = function (scene, camera) {
    V.scene = scene;
    V.cam = camera;
    buildTextures();
    V.flashEl = document.getElementById('flash');
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
    var mesh;
    if (kind === 'sprite') {
      mesh = new T.Mesh(new T.PlaneGeometry(1, 1),
        new T.MeshBasicMaterial({ map: TEX.spark, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    } else if (kind === 'ring') {
      mesh = new T.Mesh(new T.PlaneGeometry(1, 1),
        new T.MeshBasicMaterial({ map: TEX.ring, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    } else if (kind === 'soft') {
      mesh = new T.Mesh(new T.PlaneGeometry(1, 1),
        new T.MeshBasicMaterial({ map: TEX.soft, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    } else if (kind === 'streak') {
      mesh = new T.Mesh(new T.PlaneGeometry(1, 1),
        new T.MeshBasicMaterial({ map: TEX.streak, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    } else {
      mesh = new T.Mesh(new T.PlaneGeometry(1, 1),
        new T.MeshBasicMaterial({ map: TEX.slash, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    }
    mesh.userData.kind = kind;
    mesh.userData.busy = true;
    mesh.renderOrder = 5;
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
  V.hit = function (x, y, color, heavy, dir) {
    var n = heavy ? 7 : 4;
    for (var i = 0; i < n; i++) {
      var a = (Math.random() - 0.5) * 2.2;
      spawn('sprite', {
        x: x + (Math.random() - 0.5) * 0.25, y: y + (Math.random() - 0.5) * 0.3,
        color: color, size: (heavy ? 1.5 : 0.95) * (0.7 + Math.random() * 0.6),
        vx: dir * (1.4 + Math.random() * 2.2), vy: a * 1.6,
        life: 0.16 + Math.random() * 0.12, grow: heavy ? 2.4 : 1.9, spin: (Math.random() - 0.5) * 8
      });
    }
    spawn('ring', {
      x: x, y: y, color: color, size: heavy ? 1.1 : 0.75,
      life: heavy ? 0.26 : 0.18, grow: heavy ? 3.6 : 2.6, fade: 0.9
    });
    if (heavy) {
      spawn('slash', { x: x, y: y, color: 0xffffff, size: 2.4, rot: Math.random() * 0.6 - 0.3, life: 0.13, grow: 1.5, fade: 0.8 });
      V.flash('#ffffff', 1, 0.06);
    }
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

  V.dust = function (x, y, dir, amount) {
    amount = amount || 4;
    for (var i = 0; i < amount; i++) {
      spawn('soft', {
        x: x + (Math.random() - 0.5) * 0.5, y: 0.08 + Math.random() * 0.12,
        color: 0xb8b0a0, size: 0.5 + Math.random() * 0.5,
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

  V.burst = function (x, y, color, power) {
    power = power || 1;
    for (var i = 0; i < 14 * power; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = (1.5 + Math.random() * 4) * power;
      spawn('sprite', {
        x: x, y: y, color: color, size: 1.0 + Math.random() * 1.2,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.3 + Math.random() * 0.2, grow: 2.6, fade: 0.9
      });
    }
    spawn('ring', { x: x, y: y, color: color, size: 1.4, life: 0.4, grow: 6.5, fade: 1 });
    spawn('ring', { x: x, y: y, color: 0xffffff, size: 0.8, life: 0.28, grow: 4.5, fade: 0.9 });
    V.flash('#ffffff', 1, 0.14);
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
