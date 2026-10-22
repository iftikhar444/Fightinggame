/* =========================================================================
   RIFTBOUND: CLASH PROTOCOL — 07 RIGS
   One shared skeleton, four silhouettes. Poses are procedural and driven by
   simulation state, so animation can never disagree with the hit that landed.
   ========================================================================= */
(function (root) {
  'use strict';
  var RB = root.RB;
  var T = root.THREE;

  function lam(color) { return new T.MeshLambertMaterial({ color: color }); }
  function flat(color) { return new T.MeshBasicMaterial({ color: color }); }

  var PROP = {
    kaia: { w: 1.00, limb: 1.00, h: 1.00, shoulder: 1.00 },
    rook: { w: 1.24, limb: 1.26, h: 1.06, shoulder: 1.22 },
    mira: { w: 0.88, limb: 0.88, h: 0.99, shoulder: 0.92 },
    sable: { w: 0.95, limb: 0.93, h: 1.03, shoulder: 0.96 }
  };

  function Rig(charId) {
    this.charId = charId;
    this.def = RB.FIGHTER_BY_ID[charId];
    this.p = PROP[charId] || PROP.kaia;
    this.meshes = [];
    this.mats = [];
    this.pose = {};
    this.flash = 0;
    this.build();
    this.root.scale.setScalar(1.04 * this.p.h);
    this.resetPose();
  }

  Rig.prototype.box = function (parent, w, h, d, mat, x, y, z, rz) {
    var m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (rz) m.rotation.z = rz;
    parent.add(m);
    this.meshes.push(m);
    return m;
  };
  Rig.prototype.cyl = function (parent, rt, rb, h, seg, mat, x, y, z) {
    var m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    parent.add(m);
    this.meshes.push(m);
    return m;
  };

  Rig.prototype.build = function () {
    var c = this.def.colors, p = this.p;
    var mSkin = lam(c.skin), mCloth = lam(c.primary), mDark = lam(c.secondary),
      mAccent = lam(c.accent), mMetal = lam(c.metal);
    this.mats = [mSkin, mCloth, mDark, mAccent, mMetal];
    this.m = { skin: mSkin, cloth: mCloth, dark: mDark, accent: mAccent, metal: mMetal };

    var root = new T.Group();
    this.root = root;

    var body = new T.Group();
    body.position.y = 0.82;
    root.add(body);
    this.body = body;

    /* ---- hips + belt ---- */
    this.box(body, 0.24, 0.18, 0.34 * p.w, mDark, 0, 0.02, 0);
    this.box(body, 0.26, 0.06, 0.38 * p.w, mMetal, 0, 0.11, 0);

    /* ---- torso: narrow waist, wide chest (reads as a body, not a crate) ---- */
    var torso = new T.Group();
    torso.position.y = 0.12;
    body.add(torso);
    this.torso = torso;
    this.box(torso, 0.22, 0.16, 0.32 * p.w, mCloth, 0, 0.05, 0);            // waist
    this.box(torso, 0.27, 0.30, 0.44 * p.w, mCloth, 0, 0.28, 0);            // chest
    this.box(torso, 0.05, 0.20, 0.20 * p.w, mAccent, 0.14, 0.30, 0);        // chest plate
    this.box(torso, 0.29, 0.08, 0.46 * p.w, mDark, 0, 0.44, 0);             // collar

    /* ---- neck + head ---- */
    var neck = new T.Group();
    neck.position.y = 0.50;
    torso.add(neck);
    this.neck = neck;
    this.box(neck, 0.10, 0.08, 0.11, mSkin, 0, 0.02, 0);

    var head = new T.Group();
    head.position.y = 0.20;
    neck.add(head);
    this.head = head;
    this.box(head, 0.20, 0.23, 0.19, mSkin, 0, 0, 0);                       // skull
    this.box(head, 0.16, 0.06, 0.15, mSkin, 0.01, -0.10, 0);                // jaw
    this.box(head, 0.03, 0.07, 0.15, mDark, 0.10, 0.02, 0);                 // brow / visor
    this.box(head, 0.21, 0.07, 0.20, mDark, -0.01, 0.12, 0);                // hair cap

    /* ---- arms ---- */
    var mkArm = (z, side) => {
      var sh = new T.Group();
      sh.position.set(0, 0.42, z);
      torso.add(sh);
      this.box(sh, 0.20, 0.13, 0.17 * p.shoulder, mCloth, 0, 0.02, 0);      // shoulder
      this.box(sh, 0.115 * p.limb, 0.30, 0.115 * p.limb, mCloth, 0, -0.16, 0);
      var el = new T.Group();
      el.position.y = -0.31;
      sh.add(el);
      this.box(el, 0.10 * p.limb, 0.27, 0.10 * p.limb, mSkin, 0, -0.14, 0);
      var hand = new T.Group();
      hand.position.y = -0.29;
      el.add(hand);
      this.box(hand, 0.105, 0.10, 0.10, mDark, 0, 0, 0);
      return { sh: sh, el: el, hand: hand, side: side };
    };
    this.armL = mkArm(-0.24 * p.w, -1);
    this.armR = mkArm(0.24 * p.w, 1);

    /* ---- legs ---- */
    var mkLeg = (z, side) => {
      var hip = new T.Group();
      hip.position.set(0, -0.02, z);
      body.add(hip);
      this.box(hip, 0.15 * p.limb, 0.40, 0.15 * p.limb, mCloth, 0, -0.20, 0);
      var knee = new T.Group();
      knee.position.y = -0.40;
      hip.add(knee);
      this.box(knee, 0.13 * p.limb, 0.36, 0.13 * p.limb, mDark, 0, -0.18, 0);
      var foot = new T.Group();
      foot.position.y = -0.36;
      knee.add(foot);
      this.box(foot, 0.22, 0.09, 0.14, mAccent, 0.04, -0.01, 0);
      return { hip: hip, knee: knee, foot: foot, side: side };
    };
    this.legL = mkLeg(-0.105 * p.w, -1);
    this.legR = mkLeg(0.105 * p.w, 1);

    /* ---- shadow ---- */
    var shadow = new T.Mesh(new T.CircleGeometry(0.46, 16),
      new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.shadow = shadow;

    this.accessories();
  };

  /* ------------------------------------------------------- silhouette work */
  Rig.prototype.accessories = function () {
    var m = this.m, p = this.p, a = this.armL, b = this.armR, torso = this.torso, head = this.head;

    if (this.charId === 'kaia') {
      /* Twin kinetic batons, asymmetric shoulder guard, jacket tail */
      var baton = (hand) => {
        var g = new T.Group();
        g.position.y = -0.05;
        hand.add(g);
        var shaft = new T.Mesh(new T.CylinderGeometry(0.032, 0.032, 0.46, 6), m.metal);
        shaft.position.y = -0.24;
        g.add(shaft); this.meshes.push(shaft);
        var tip = new T.Mesh(new T.CylinderGeometry(0.042, 0.042, 0.09, 6), flat(0xf2a63b));
        tip.position.y = -0.45;
        g.add(tip); this.meshes.push(tip);
      };
      baton(a.hand); baton(b.hand);
      this.box(b.sh, 0.26, 0.10, 0.22, m.accent, 0.02, 0.09, 0);            // shoulder guard
      this.box(this.body, 0.20, 0.30, 0.30 * p.w, m.cloth, -0.11, -0.14, 0); // jacket tail
      this.box(torso, 0.24, 0.05, 0.46 * p.w, m.accent, 0, 0.10, 0);         // sash
      this.box(head, 0.20, 0.05, 0.21, m.accent, 0, 0.13, 0);                // headband
    }

    if (this.charId === 'rook') {
      /* Reinforced forearms, split coat, heavy shoulders */
      this.box(a.el, 0.17, 0.22, 0.17, m.metal, 0, -0.12, 0);
      this.box(b.el, 0.17, 0.22, 0.17, m.metal, 0, -0.12, 0);
      this.box(a.sh, 0.24, 0.14, 0.22, m.dark, 0, 0.04, 0);
      this.box(b.sh, 0.24, 0.14, 0.22, m.dark, 0, 0.04, 0);
      this.box(this.body, 0.26, 0.44, 0.30, m.dark, -0.08, -0.20, 0);
      this.box(head, 0.22, 0.08, 0.21, m.metal, 0, 0.10, 0);
      this.box(torso, 0.05, 0.14, 0.14, m.accent, 0.15, 0.34, 0);
    }

    if (this.charId === 'mira') {
      /* Energy fins that trail during motion, light suit */
      this.fins = [];
      for (var i = 0; i < 3; i++) {
        var fin = new T.Mesh(new T.PlaneGeometry(0.26 + i * 0.09, 0.075),
          new T.MeshBasicMaterial({ color: 0x2ec6ff, transparent: true, opacity: 0.7, side: T.DoubleSide }));
        fin.position.set(-0.19, 0.34 - i * 0.13, -0.02 + i * 0.04);
        fin.rotation.y = Math.PI / 2;
        torso.add(fin);
        this.meshes.push(fin);
        this.fins.push(fin);
      }
      this.box(torso, 0.24, 0.26, 0.30 * p.w, m.dark, 0, 0.28, 0);
      this.box(head, 0.21, 0.08, 0.20, m.accent, 0.01, 0.07, 0);
      this.box(a.el, 0.12, 0.14, 0.12, m.accent, 0, -0.05, 0);
      this.box(b.el, 0.12, 0.14, 0.12, m.accent, 0, -0.05, 0);
    }

    if (this.charId === 'sable') {
      /* Long mantle, floating survey lenses, energy bow */
      var mantle = new T.Mesh(new T.CylinderGeometry(0.18, 0.42, 0.66, 8, 1, true), m.cloth);
      mantle.position.set(-0.05, 0.02, 0);
      mantle.material.side = T.DoubleSide;
      this.body.add(mantle);
      this.meshes.push(mantle);

      this.lenses = [];
      for (var k = 0; k < 2; k++) {
        var lens = new T.Mesh(new T.TorusGeometry(0.075, 0.018, 4, 12), flat(0x8ff0cf));
        lens.position.set(0.15, 0.52 + k * 0.20, -0.26 - k * 0.08);
        torso.add(lens);
        this.meshes.push(lens);
        this.lenses.push(lens);
      }
      var bow = new T.Mesh(new T.TorusGeometry(0.30, 0.02, 4, 18, Math.PI * 1.2), m.metal);
      bow.rotation.z = -0.5;
      bow.position.set(0.03, -0.26, 0);
      this.armL.hand.add(bow);
      this.meshes.push(bow);
      this.box(head, 0.22, 0.10, 0.21, m.dark, -0.01, 0.09, 0);
      this.box(torso, 0.04, 0.12, 0.12, m.accent, 0.15, 0.30, 0);
    }
  };

  Rig.prototype.resetPose = function () {
    this.pose = {
      hipY: 0, lean: 0, twist: 0, bodyX: 0, headZ: 0, headY: 0,
      shLz: 0.34, shLx: 0, elLz: -0.95, shRz: 0.55, shRx: 0, elRz: -1.15,
      hipLz: -0.18, hipLx: 0, kneeLz: -0.26, hipRz: 0.22, hipRx: 0, kneeRz: -0.22
    };
    this.apply(0);
  };

  /* Fighting stance baseline: staggered feet, hands up, weight forward. */
  function basePose() {
    return {
      hipY: 0, lean: 0.03, twist: 0, bodyX: 0, headZ: 0, headY: 0,
      shLz: 0.34, shLx: 0, elLz: -0.95, shRz: 0.55, shRx: 0, elRz: -1.15,
      hipLz: -0.18, hipLx: 0, kneeLz: -0.26, hipRz: 0.22, hipRx: 0, kneeRz: -0.22
    };
  }

  /* Pose target for a state. Returns a partial pose object. */
  Rig.prototype.targetPose = function (f, time) {
    var p = basePose();
    var s = f.state;
    var breathe = Math.sin(time * 2.4 + f.side * 1.7) * 0.028;

    if (s === RB.ST.IDLE) {
      p.hipY = breathe * 0.6;
      p.shRz = 0.55 + breathe; p.elRz = -1.15 - breathe * 0.4;
      p.shLz = 0.34 - breathe * 0.5; p.elLz = -0.95;
      p.headZ = 0.03;
    } else if (s === RB.ST.WALK) {
      var w = Math.sin(time * 8.5 + f.side);
      p.hipLz = -0.18 + w * 0.42;
      p.hipRz = 0.22 - w * 0.42;
      p.kneeLz = -0.26 - Math.max(0, -w) * 0.42;
      p.kneeRz = -0.22 - Math.max(0, w) * 0.42;
      p.shLz = 0.34 - w * 0.18;
      p.shRz = 0.55 + w * 0.18;
      p.hipY = Math.abs(w) * 0.035;
      p.lean = 0.07;
    } else if (s === RB.ST.CROUCH) {
      p.hipY = -0.26; p.lean = 0.15;
      p.hipLz = 0.42; p.kneeLz = -0.95;
      p.hipRz = -0.30; p.kneeRz = -0.92;
      p.shLz = 0.75; p.shRz = 0.85; p.elLz = -1.5; p.elRz = -1.55;
      p.headZ = -0.10;
    } else if (s === RB.ST.BLOCK) {
      p.hipY = -0.10; p.lean = -0.05;
      p.hipLz = 0.28; p.kneeLz = -0.48;
      p.hipRz = -0.24; p.kneeRz = -0.46;
      p.shLz = 1.20; p.shRz = 1.10;
      p.elLz = -1.85; p.elRz = -1.80;
      p.headZ = 0.10;
    } else if (s === RB.ST.BLOCKSTUN) {
      p.hipY = -0.13; p.lean = -0.15;
      p.hipLz = 0.30; p.kneeLz = -0.52;
      p.hipRz = -0.26; p.kneeRz = -0.50;
      p.shLz = 1.32; p.shRz = 1.22; p.elLz = -2.0; p.elRz = -1.95;
      p.headZ = 0.18;
    } else if (s === RB.ST.JUMP) {
      p.hipLz = 0.48; p.kneeLz = -0.85;
      p.hipRz = -0.30; p.kneeRz = -0.45;
      p.shLz = 0.7; p.shRz = 0.8; p.elLz = -1.0; p.elRz = -1.1;
      p.lean = 0.08;
    } else if (s === RB.ST.DASH) {
      p.lean = 0.32;
      p.hipLz = 0.55; p.kneeLz = -0.6;
      p.hipRz = -0.5; p.kneeRz = -0.2;
      p.shLz = -0.3; p.shRz = 0.9; p.elRz = -0.7; p.elLz = -1.2;
    } else if (s === RB.ST.HIT) {
      var sev = Math.min(1, f.stunT / 12);
      p.lean = -0.20 - sev * 0.18;
      p.headZ = -0.30;
      p.shLz = -0.35; p.shRz = -0.15; p.elLz = -0.7; p.elRz = -0.7;
      p.hipLz = -0.26; p.hipRz = 0.34;
      p.hipY = -0.04;
    } else if (s === RB.ST.AIRHIT) {
      p.lean = -0.5;
      p.bodyX = Math.sin(time * 11) * 0.85;
      p.shLz = -1.2; p.shRz = -1.0; p.elLz = -0.6; p.elRz = -0.5;
      p.hipLz = 0.55; p.hipRz = -0.55; p.kneeLz = -0.75; p.kneeRz = -0.65;
      p.headZ = -0.35;
    } else if (s === RB.ST.KNOCKDOWN) {
      p.lean = -1.42; p.hipY = -0.58;
      p.shLz = -0.6; p.shRz = -0.4;
      p.hipLz = 0.4; p.hipRz = -0.25; p.kneeLz = -0.6; p.kneeRz = -0.35;
      p.headZ = -0.4;
    } else if (s === RB.ST.WAKEUP) {
      p.lean = -0.85; p.hipY = -0.40;
      p.hipLz = 0.7; p.kneeLz = -1.0;
      p.hipRz = -0.2; p.kneeRz = -0.6;
      p.shLz = 0.4; p.shRz = 0.5; p.elLz = -1.2; p.elRz = -1.2;
    } else if (s === RB.ST.GUARDCRUSH) {
      p.lean = -0.32; p.headZ = -0.45;
      p.shLz = 1.7; p.shRz = -0.15; p.elLz = -0.35; p.elRz = -0.25;
      p.hipY = -0.16;
    } else if (s === RB.ST.FURYBURST) {
      var k = Math.min(1, f.stateT / 8);
      p.lean = -0.22 * (1 - k);
      p.shLz = 1.3 + k * 0.8; p.shRz = 1.3 + k * 0.8;
      p.elLz = -0.5; p.elRz = -0.5;
      p.hipY = -0.06;
    } else if (s === RB.ST.TAGIN) {
      var q = Math.min(1, f.stateT / 10);
      p.lean = 0.2; p.shLz = 0.4 + q * 1.1; p.shRz = 0.4 + q * 1.1;
      p.elLz = -0.3; p.elRz = -0.3;
      p.hipLz = 0.5; p.hipRz = -0.4;
    } else if (s === RB.ST.KO) {
      p.lean = -1.48; p.hipY = -0.66;
      p.shLz = -0.8; p.shRz = -0.6;
      p.hipLz = 0.45; p.hipRz = -0.4; p.kneeLz = -0.3; p.kneeRz = -0.45;
      p.headZ = -0.5;
    } else if (s === RB.ST.SUPER) {
      var t = f.superT || 0;
      if (t < 12) {
        p.lean = -0.14; p.hipY = -0.10;
        p.shLz = -0.85; p.shRz = -0.95; p.elLz = -1.5; p.elRz = -1.5;
        p.headZ = -0.18;
      } else {
        var ph = Math.sin(t * 0.55);
        p.lean = 0.22;
        p.shLz = 1.5 + ph * 0.35; p.shRz = 1.3 - ph * 0.35;
        p.elLz = -0.35; p.elRz = -0.55;
        p.hipLz = 0.42; p.hipRz = -0.42; p.kneeLz = -0.32; p.kneeRz = -0.32;
        p.twist = ph * 0.28;
      }
    } else if (s === RB.ST.ATTACK) {
      this.attackPose(p, f, time);
    }
    return p;
  };

  Rig.prototype.attackPose = function (p, f, time) {
    var mv = f.move;
    if (!mv) return;
    var id = mv.id;
    var t = f.moveFrame;
    var s0 = mv.startup, a1 = mv.startup + mv.active;
    var wind = t < s0 ? t / Math.max(1, s0) : 1;
    var hold = t >= s0 && t < a1 ? 1 : t >= a1 ? Math.max(0, 1 - (t - a1) / Math.max(1, mv.recovery)) : 0;
    var ext = t < s0 ? RB.ease.outQuad(wind) * 0.22 : hold;

    if (id.indexOf('5L') > -1) {
      p.shRz = 0.55 + ext * 1.35;
      p.elRz = -1.15 + ext * 1.15;
      p.shLz = 0.30 - ext * 0.35;
      p.elLz = -0.95;
      p.lean = 0.04 + ext * 0.12;
      p.twist = -0.35 * ext;
      p.hipRz = 0.22 - ext * 0.2;
    } else if (id.indexOf('5H') > -1) {
      p.shRz = -0.5 + ext * 2.0;
      p.elRz = -1.6 + ext * 1.4;
      p.shLz = 0.55 - ext * 0.7;
      p.lean = -0.14 + ext * 0.30;
      p.twist = -0.75 + ext * 1.05;
      p.hipLz = 0.30; p.kneeLz = -0.35;
      p.hipRz = -0.35 - ext * 0.15;
    } else if (id.indexOf('2K') > -1) {
      p.hipY = -0.24 + ext * 0.04;
      p.lean = 0.22;
      p.hipRz = 0.15 + ext * 1.30;
      p.kneeRz = -1.05 + ext * 1.0;
      p.hipLz = 0.45; p.kneeLz = -0.85;
      p.shLz = 0.6; p.shRz = 0.5; p.elLz = -1.3; p.elRz = -1.2;
      p.twist = -0.28 * ext;
    } else if (id.indexOf('4C') > -1) {
      p.shRz = 0.45 + ext * 2.3;
      p.elRz = -1.7 + ext * 1.55;
      p.shLz = 0.30 + ext * 1.1;
      p.elLz = -1.0;
      p.lean = 0.14 - ext * 0.42;
      p.hipY = -0.22 + ext * 0.46;
      p.hipLz = 0.55 - ext * 0.35;
      p.kneeLz = -0.95 + ext * 0.75;
      p.hipRz = -0.45 + ext * 0.2;
      p.headZ = 0.14;
    } else if (id.indexOf('6S') > -1 || id.indexOf('2S') > -1) {
      p.lean = 0.30;
      p.shRz = 0.35 + ext * 1.35;
      p.shLz = 0.35 + ext * 0.85;
      p.elLz = -0.5; p.elRz = -0.55;
      p.hipLz = 0.65; p.kneeLz = -0.55;
      p.hipRz = -0.55; p.kneeRz = -0.22;
      p.twist = -0.3 * ext;
    } else if (id.indexOf('tag') > -1) {
      p.shRz = 0.5 + ext * 1.3;
      p.shLz = 0.5 + ext * 1.3;
      p.elRz = -0.4; p.elLz = -0.4;
      p.lean = 0.2;
    } else if (id.indexOf('throw') > -1) {
      p.shRz = 0.55 + ext * 1.05;
      p.shLz = 0.55 + ext * 1.05;
      p.elRz = -0.75 + ext * 0.4;
      p.elLz = -0.75 + ext * 0.4;
      p.lean = 0.1 + ext * 0.2;
      p.hipY = -0.07;
      p.hipLz = 0.3; p.hipRz = -0.3;
    }
  };

  /* Blend the current pose toward the target and write it onto the rig. */
  Rig.prototype.applyPose = function (f, dt, time) {
    var target = this.targetPose(f, time);
    var k = 1 - Math.pow(0.0008, dt);
    for (var key in target) {
      if (this.pose[key] == null) this.pose[key] = target[key];
      this.pose[key] += (target[key] - this.pose[key]) * k;
    }
    this.apply(time);
  };

  Rig.prototype.apply = function (time) {
    var p = this.pose;
    this.body.position.y = 0.82 + p.hipY;
    this.body.rotation.z = p.lean;
    this.body.rotation.y = p.twist;
    this.body.rotation.x = p.bodyX;
    this.head.rotation.z = p.headZ;
    this.head.rotation.y = p.headY;

    this.armL.sh.rotation.z = p.shLz;
    this.armL.sh.rotation.x = p.shLx;
    this.armL.el.rotation.z = p.elLz;
    this.armR.sh.rotation.z = p.shRz;
    this.armR.sh.rotation.x = p.shRx;
    this.armR.el.rotation.z = p.elRz;

    this.legL.hip.rotation.z = p.hipLz;
    this.legL.hip.rotation.x = p.hipLx;
    this.legL.knee.rotation.z = p.kneeLz;
    this.legR.hip.rotation.z = p.hipRz;
    this.legR.hip.rotation.x = p.hipRx;
    this.legR.knee.rotation.z = p.kneeRz;

    /* Fins and lenses react to motion without touching combat state. */
    if (this.fins) {
      var speed = Math.abs(p.lean) * 3;
      for (var i = 0; i < this.fins.length; i++) {
        this.fins[i].scale.x = 1 + speed * 0.5 + Math.sin(time * 9 + i) * 0.08;
        this.fins[i].material.opacity = 0.5 + speed * 0.2;
      }
    }
    if (this.lenses) {
      for (var k = 0; k < this.lenses.length; k++) {
        this.lenses[k].rotation.y = time * 1.6 + k;
        this.lenses[k].position.y = 0.52 + k * 0.20 + Math.sin(time * 2 + k) * 0.02;
      }
    }
  };

  Rig.prototype.setFlash = function (v) {
    this.flash = v;
    for (var i = 0; i < this.mats.length; i++) {
      var m = this.mats[i];
      if (!m.emissive) continue;
      if (v > 0.01) m.emissive.setRGB(v, v, v);
      else m.emissive.setHex(0x000000);
    }
  };

  Rig.prototype.dispose = function () {
    if (this.root.parent) this.root.parent.remove(this.root);
    if (this.shadow.parent) this.shadow.parent.remove(this.shadow);
    this.meshes.forEach(function (m) { m.geometry.dispose(); });
  };

  RB.Rig = Rig;
})(typeof globalThis !== 'undefined' ? globalThis : this);
