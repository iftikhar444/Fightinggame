/* =========================================================================
   RIFTBOUND: CLASH PROTOCOL — 03 AI
   Emits input bitmasks only. It cannot touch combat state directly, so an
   AI opponent and a human use exactly the same rules.
   ========================================================================= */
(function (root) {
  'use strict';
  var RB = root.RB;
  var T = RB.TUNING, IN = RB.IN, ST = RB.ST;

  function AI(side, level, match) {
    this.side = side;
    this.level = level;
    this.p = RB.AI_LEVELS[level] || RB.AI_LEVELS.normal;
    this.match = match;
    this.think = 0;
    this.hold = 0;
    this.plan = [];
    this.planT = 0;
    this.blockT = 0;
    this.lastAction = 0;
    this.dummy = level === 'dummy';
  }

  AI.prototype.fighter = function () { return this.match.fighters[this.side]; };
  AI.prototype.foe = function () { return this.match.fighters[1 - this.side]; };

  AI.prototype.step = function () {
    var m = this.match, f = this.fighter(), o = this.foe(), mask = 0;
    if (m.phase !== 'fight' || f.state === ST.KO || this.dummy) {
      /* Dummy still blocks occasionally so practice has a target. */
      if (this.dummy && o.state === ST.ATTACK && Math.random() < 0.15) {
        var bd = -f.face;
        mask |= bd < 0 ? IN.LEFT : IN.RIGHT;
      }
      return mask;
    }

    var dx = o.x - f.x, dist = Math.abs(dx), toward = dx > 0 ? IN.RIGHT : IN.LEFT;
    var away = toward === IN.RIGHT ? IN.LEFT : IN.RIGHT;
    var rng = m.rng;

    /* --- Reversal options first: these are state-gated, not reactions. */
    if (f.state === ST.HIT || f.state === ST.BLOCKSTUN || f.state === ST.GUARDCRUSH) {
      if (f.fury >= T.furyBurstCost && rng() < this.p.fury * 0.08) return IN.FB;
      return 0;
    }

    /* --- Defensive reaction to an incoming attack. */
    var threat = o.state === ST.ATTACK && o.move && o.moveFrame <= o.move.startup + 2;
    if (threat && dist < o.move.range + 0.6) {
      if (this.blockT <= 0 && rng() < this.p.block) this.blockT = 14 + Math.floor(rng() * 8);
      if (this.blockT > 0) {
        this.blockT--;
        mask |= away;
        if (o.move.low) mask |= IN.DOWN;
        return mask;
      }
    }

    /* --- Keep blocking for a few ticks after the threat ends. */
    if (this.blockT > 0) {
      this.blockT--;
      return away | (rng() < 0.3 ? IN.DOWN : 0);
    }

    /* --- Super when it is affordable and likely to connect. */
    if (f.meter >= T.superCost && dist < f.moves[f.charId + '.SUP'].range && rng() < 0.05 + this.p.punish * 0.05) {
      return IN.SUPER;
    }
    if (f.fury >= T.furyArtCost && f.furyArtT <= 0 && dist > 2.2 && rng() < 0.012) return IN.FA;
    if (m.mode === 'tag' && f.tagCooldown <= 0 && f.hp < f.maxHp * 0.35 && rng() < this.p.tag * 0.03) return IN.TAG;

    /* --- Combo plan execution (queued as real inputs, one per tick). */
    if (this.plan.length) {
      this.planT--;
      var next = this.plan[0];
      if (f.state === ST.ATTACK && f.move && f.hitConfirmed && f.cancelOpen) {
        this.plan.shift();
        return this.pressFor(next);
      }
      if (this.planT <= 0) this.plan.length = 0;
      return 0;
    }

    /* --- Neutral decision every few ticks. */
    this.think--;
    if (this.think > 0) {
      if (dist > 2.4 && rng() < 0.5) return toward;
      return 0;
    }
    this.think = Math.max(3, Math.round(this.p.react * (0.6 + rng() * 0.8)));

    if (dist > 3.2) {
      /* Zoner keeps the lane; others close the gap. */
      if (f.charId === 'sable' && rng() < 0.45) return this.special();
      if (rng() < this.p.aggro) return toward;
      return 0;
    }

    if (dist > 2.0) {
      if (rng() < 0.30) return this.special();
      if (rng() < this.p.aggro) return toward;
      if (rng() < 0.15) return IN.UP;
      return 0;
    }

    /* Close range: strike / throw / defensive call. */
    var roll = rng();
    if (o.state === ST.BLOCK || o.state === ST.BLOCKSTUN) {
      if (roll < this.p.throw) return this.throwInput();
    }
    if (o.state === ST.ATTACK && o.move && o.moveFrame >= o.move.startup + o.move.active) {
      /* Punish window: use the best available starter. */
      if (roll < this.p.punish) { this.queueRoute(); return this.pressFor('light'); }
    }
    if (roll < 0.42 * this.p.aggro + 0.12) { this.queueRoute(); return this.pressFor('light'); }
    if (roll < 0.62) return this.pressFor('heavy');
    if (roll < 0.72) return this.pressFor('kick');
    if (roll < 0.80) return toward;
    if (roll < 0.86) return away;
    return 0;
  };

  AI.prototype.queueRoute = function () {
    if (this.match.rng() > this.p.combo) return;
    this.plan = ['launcher', 'heavy'];
    this.planT = 40;
  };

  AI.prototype.pressFor = function (key) {
    var f = this.fighter();
    var base = f.charId;
    switch (key) {
      case 'light': return IN.LIGHT;
      case 'heavy': return IN.HEAVY;
      case 'kick': return IN.KICK;
      case 'launcher': return IN.LAUNCH;
      case 'special': return IN.SPECIAL;
      case 'super': return IN.SUPER;
      default: return 0;
    }
  };

  AI.prototype.special = function () { return IN.SPECIAL; };
  AI.prototype.throwInput = function () { return IN.THROW; };

  RB.AI = AI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
