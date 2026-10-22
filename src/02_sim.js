/* =========================================================================
   RIFTBOUND: CLASH PROTOCOL — 02 SIMULATION
   Fixed 60 Hz, deterministic, no rendering knowledge. This module is the
   single source of truth for combat: timing, hits, resources, rounds.
   ========================================================================= */
(function (root) {
  'use strict';
  var RB = root.RB;
  var T = RB.TUNING;

  /* ------------------------------------------------------------- input bits */
  var IN = {
    LEFT: 1, RIGHT: 2, UP: 4, DOWN: 8,
    LIGHT: 16, HEAVY: 32, KICK: 64, LAUNCH: 128, SPECIAL: 256, SUPER: 512,
    FB: 1024, FA: 2048, TAG: 4096, THROW: 8192
  };
  var ATTACK_BITS = IN.LIGHT | IN.HEAVY | IN.KICK | IN.LAUNCH | IN.SPECIAL | IN.SUPER;

  /* Move data authors impulses in readable "fighting game" units. The world is
     in metres, so convert once here instead of polluting every move entry. */
  var VS = 0.032;   // velocity scale
  var KS = 0.18;    // knockback displacement scale

  var ST = {
    IDLE: 'idle', WALK: 'walk', CROUCH: 'crouch', JUMP: 'jump', DASH: 'dash',
    ATTACK: 'attack', HIT: 'hit', AIRHIT: 'airhit', BLOCK: 'block',
    BLOCKSTUN: 'blockstun', GUARDCRUSH: 'guardcrush',
    KNOCKDOWN: 'knockdown', WAKEUP: 'wakeup', THROWN: 'thrown',
    SUPER: 'super', FURYBURST: 'furyburst', TAGIN: 'tagin', TAGOUT: 'tagout',
    KO: 'ko', VICTORY: 'victory'
  };

  var nextId = 1;

  /* ======================================================================
     Fighter
     ====================================================================== */
  function Fighter(side, charId, slot) {
    this.id = nextId++;
    this.side = side;
    this.charId = charId;
    this.def = RB.FIGHTER_BY_ID[charId];
    this.moves = RB.MOVES[charId];
    this.slot = slot || 0;
    this.maxHp = this.def.hp;
    this.hp = this.maxHp;
    this.meter = 0;
    this.fury = 0;
    this.guard = T.guardMax;
    this.x = side === 0 ? -2.6 : 2.6;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.face = side === 0 ? 1 : -1;
    this.state = ST.IDLE;
    this.stateT = 0;
    this.move = null;
    this.moveFrame = 0;
    this.hitSet = {};
    this.hitConfirmed = false;
    this.cancelOpen = false;
    this.comboHits = 0;
    this.comboDamage = 0;
    this.comboMoves = {};
    this.juggle = T.juggleBudget;
    this.stunT = 0;
    this.hitstopT = 0;
    this.invulnT = 0;
    this.armor = 0;
    this.furyArtT = 0;
    this.tagCooldown = 0;
    this.dashCd = 0;
    this.prevMask = 0;
    this.buf = [];
    this.blockHeld = false;
    this.crouching = false;
    this.airT = 0;
    this.wallUsed = false;
    this.throwBreakT = 0;
    this.koT = 0;
    this.lastDirTap = 0;
    this.lastDirT = 0;
    this.facingLock = false;
    this.tagStrikeDone = false;
    this.dizzyT = 0;
    this.landLag = 0;
  }

  Fighter.prototype.resetRound = function (x, face) {
    this.x = x;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.face = face;
    this.state = ST.IDLE;
    this.stateT = 0;
    this.move = null;
    this.moveFrame = 0;
    this.hitSet = {};
    this.hitConfirmed = false;
    this.cancelOpen = false;
    this.comboHits = 0;
    this.comboDamage = 0;
    this.comboMoves = {};
    this.juggle = T.juggleBudget;
    this.stunT = 0;
    this.hitstopT = 0;
    this.invulnT = 0;
    this.armor = 0;
    this.furyArtT = 0;
    this.dashCd = 0;
    this.buf.length = 0;
    this.prevMask = 0;
    this.wallUsed = false;
    this.throwBreakT = 0;
    this.koT = 0;
    this.landLag = 0;
    this.guard = T.guardMax;
    this.blockHeld = false;
    this.crouching = false;
  };

  Fighter.prototype.resetMatch = function () {
    this.hp = this.maxHp;
    this.meter = 0;
    this.fury = 0;
    this.resetRound(this.side === 0 ? -2.6 : 2.6, this.side === 0 ? 1 : -1);
  };

  Fighter.prototype.isAirborne = function () { return this.y > 0.02 || this.vy > 0; };
  Fighter.prototype.isActionable = function () {
    return this.state === ST.IDLE || this.state === ST.WALK || this.state === ST.CROUCH ||
      this.state === ST.BLOCK || this.state === ST.DASH || this.state === ST.JUMP;
  };
  Fighter.prototype.hurtCenter = function () {
    return this.y + (this.crouching ? 0.72 : 1.05);
  };

  /* ======================================================================
     Match / World
     ====================================================================== */
  function Match(opts) {
    opts = opts || {};
    this.mode = opts.mode || '1v1';           // '1v1' | 'tag' | 'practice'
    this.stage = opts.stage || 0;
    this.seed = opts.seed == null ? 1337 : opts.seed;
    this.rng = RB.makeRng(this.seed);
    this.tick = 0;
    this.phase = 'intro';                     // intro | fight | ko | roundend | matchend
    this.phaseT = 0;
    this.round = 1;
    this.wins = [0, 0];
    this.timer = Math.round(T.roundTime * 60);
    this.roundsToWin = opts.roundsToWin || T.roundsToWin;
    this.freeze = 0;                          // hitstop ticks
    this.slowmo = 0;
    this.projectiles = [];
    this.traps = [];
    this.events = [];
    this.sides = [];
    this.fighters = [];
    this.winner = -1;
    this.lastRoundWinner = -1;
    this.infiniteMeter = !!opts.infiniteMeter;
    this.noTimer = !!opts.noTimer;

    var teams = opts.teams || [['kaia'], ['rook']];
    for (var s = 0; s < 2; s++) {
      var members = [];
      var ids = teams[s] && teams[s].length ? teams[s] : ['kaia'];
      for (var i = 0; i < ids.length; i++) members.push(new Fighter(s, ids[i], i));
      this.sides.push({ team: members, active: 0, wins: 0 });
      this.fighters.push(members[0]);
    }
    this.fighters[0].x = -2.6; this.fighters[0].face = 1;
    this.fighters[1].x = 2.6; this.fighters[1].face = -1;
    this.emit({ type: 'roundStart', round: 1 });
  }

  Match.prototype.active = function (side) { return this.sides[side].team[this.sides[side].active]; };
  Match.prototype.opponent = function (f) { return this.fighters[1 - f.side]; };
  Match.prototype.emit = function (e) { e.tick = this.tick; this.events.push(e); };

  /* ------------------------------------------------------------ round flow */
  Match.prototype.startRound = function () {
    this.phase = 'intro';
    this.phaseT = 0;
    this.timer = Math.round(T.roundTime * 60);
    this.freeze = 0;
    this.projectiles.length = 0;
    this.traps.length = 0;
    for (var s = 0; s < 2; s++) {
      var side = this.sides[s];
      side.active = 0;
      side.team.forEach(function (f, i) {
        f.hp = f.maxHp;
        f.tagCooldown = 0;
        f.resetRound(s === 0 ? -2.6 : 2.6, s === 0 ? 1 : -1);
      });
      this.fighters[s] = side.team[0];
    }
    this.emit({ type: 'roundStart', round: this.round });
  };

  Match.prototype.nextRound = function (winnerSide) {
    if (winnerSide >= 0) {
      this.wins[winnerSide]++;
      this.sides[winnerSide].wins = this.wins[winnerSide];
    }
    this.lastRoundWinner = winnerSide;
    if (this.wins[0] >= this.roundsToWin || this.wins[1] >= this.roundsToWin) {
      this.phase = 'matchend';
      this.phaseT = 0;
      this.winner = this.wins[0] >= this.roundsToWin ? 0 : 1;
      this.emit({ type: 'matchEnd', winner: this.winner });
      return;
    }
    this.round++;
    this.startRound();
    this.phase = 'intro';
  };

  /* ---------------------------------------------------------------- inputs */
  Match.prototype.bufferInput = function (f, mask) {
    var pressed = mask & ~f.prevMask;
    f.buf.push({ mask: mask, pressed: pressed, t: this.tick });
    if (f.buf.length > 10) f.buf.shift();
    f.prevMask = mask;
    return pressed;
  };

  Match.prototype.recentPress = function (f, bit, window) {
    window = window || 6;
    for (var i = f.buf.length - 1; i >= 0; i--) {
      var b = f.buf[i];
      if (this.tick - b.t > window) break;
      if (b.pressed & bit) return true;
    }
    return false;
  };

  /* ----------------------------------------------------------- main update */
  Match.prototype.step = function (inputs) {
    this.tick++;
    if (this.phase === 'matchend') { this.phaseT++; this.emitTick(); return; }

    var ia = inputs[0] | 0, ib = inputs[1] | 0;
    var fa = this.fighters[0], fb = this.fighters[1];

    var pa = this.bufferInput(fa, ia);
    var pb = this.bufferInput(fb, ib);

    if (this.freeze > 0) {
      this.freeze--;
      this.emitTick();
      return;
    }

    if (this.phase === 'intro') {
      this.phaseT++;
      if (this.phaseT === 1) this.emit({ type: 'announce', text: 'ROUND ' + this.round, style: 'round' });
      if (this.phaseT === 70) this.emit({ type: 'announce', text: 'FIGHT', style: 'fight' });
      if (this.phaseT >= 96) { this.phase = 'fight'; this.phaseT = 0; }
      this.updateFacing(fa, fb);
      return;
    }

    if (this.phase === 'fight') {
      if (!this.noTimer) {
        this.timer--;
        if (this.timer <= 0) {
          this.timer = 0;
          this.endRoundByTime();
          return;
        }
      }
    }

    if (this.phase === 'fight' || this.phase === 'ko') {
      this.updateFighter(fa, ia, pa, fb);
      this.updateFighter(fb, ib, pb, fa);
      this.separate(fa, fb);
      this.updateProjectiles(fa, fb);
      this.updateTraps(fa, fb);
      this.updateFacing(fa, fb);
      this.updateTagCooldowns(fa, fa);
      this.updateTagCooldowns(fb, fb);
      if (this.phase === 'fight') this.checkKO(fa, fb);
    }

    if (this.phase === 'ko') {
      this.phaseT++;
      if (this.phaseT > 130) {
        var w = -1;
        var aDead = this.sideDead(0), bDead = this.sideDead(1);
        if (aDead && !bDead) w = 1;
        else if (bDead && !aDead) w = 0;
        else if (aDead && bDead) w = -1;
        else if (this.timer <= 0) {
          var ra = this.ratio(0), rb = this.ratio(1);
          w = Math.abs(ra - rb) < 0.001 ? -1 : (ra > rb ? 0 : 1);
        }
        this.nextRound(w);
      }
    }
    this.emitTick();
  };

  Match.prototype.emitTick = function () {
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  };

  Match.prototype.ratio = function (side) {
    var s = this.sides[side], total = 0, cur = 0;
    s.team.forEach(function (f) { total += f.maxHp; cur += Math.max(0, f.hp); });
    return total ? cur / total : 0;
  };

  Match.prototype.sideDead = function (side) {
    return this.sides[side].team.every(function (f) { return f.hp <= 0; });
  };

  Match.prototype.updateTagCooldowns = function (f) {
    if (f.tagCooldown > 0) f.tagCooldown--;
    if (f.furyArtT > 0) f.furyArtT--;
  };

  Match.prototype.updateFacing = function (a, b) {
    if (a.state === ST.KO || b.state === ST.KO) return;
    var lock = [ST.ATTACK, ST.HIT, ST.AIRHIT, ST.SUPER, ST.THROWN, ST.KNOCKDOWN, ST.TAGIN];
    if (lock.indexOf(a.state) < 0 && !a.isAirborne()) a.face = b.x >= a.x ? 1 : -1;
    if (lock.indexOf(b.state) < 0 && !b.isAirborne()) b.face = a.x >= b.x ? 1 : -1;
  };

  Match.prototype.separate = function (a, b) {
    var dx = b.x - a.x;
    var min = T.pushRadius * 2;
    if (Math.abs(dx) < min) {
      var push = (min - Math.abs(dx)) / 2 * (dx >= 0 ? 1 : -1);
      if (a.state !== ST.KO) a.x -= push;
      if (b.state !== ST.KO) b.x += push;
    }
    a.x = RB.clamp(a.x, -T.stageHalfWidth, T.stageHalfWidth);
    b.x = RB.clamp(b.x, -T.stageHalfWidth, T.stageHalfWidth);
  };

  /* -------------------------------------------------------- fighter update */
  Match.prototype.updateFighter = function (f, mask, pressed, opp) {
    f.stateT++;
    if (f.invulnT > 0) f.invulnT--;
    if (f.dashCd > 0) f.dashCd--;
    if (f.throwBreakT > 0) f.throwBreakT--;
    if (f.dizzyT > 0) f.dizzyT--;
    if (f.landLag > 0) f.landLag--;

    /* Guard meter regeneration: only when not absorbing a hit. */
    if (f.state !== ST.BLOCK && f.state !== ST.BLOCKSTUN) {
      f.guard = Math.min(T.guardMax, f.guard + T.guardRegen);
    }

    /* Block intent: hold away from the opponent. */
    var backDir = -f.face;
    var holdingBack = backDir < 0 ? !!(mask & IN.LEFT) : !!(mask & IN.RIGHT);
    var holdingDown = !!(mask & IN.DOWN);
    f.crouching = holdingDown && !f.isAirborne();
    f.blockHeld = holdingBack && !f.isAirborne();

    /* Global physics */
    this.physics(f);

    if (f.state === ST.KO) { f.koT++; return; }

    /* Hitstop: freeze the fighter but keep state timing (standard). */
    if (f.hitstopT > 0) { f.hitstopT--; return; }

    switch (f.state) {
      case ST.HIT:
        if (pressed & IN.FB && this.tryFuryBurst(f)) break;
        f.stunT--;
        if (f.stunT <= 0 && !f.isAirborne()) {
          f.state = ST.IDLE; f.stateT = 0; this.clearCombo(opp, f);
        }
        break;

      case ST.AIRHIT:
        if (f.y <= 0.02 && f.vy <= 0) this.knockdown(f, opp);
        break;

      case ST.BLOCKSTUN:
        if (pressed & IN.FB && this.tryFuryBurst(f)) break;
        f.stunT--;
        if (f.stunT <= 0) f.state = ST.IDLE;
        break;

      case ST.GUARDCRUSH:
        if (pressed & IN.FB && this.tryFuryBurst(f)) break;
        f.stunT--;
        if (f.stunT <= 0) { f.state = ST.IDLE; f.guard = T.guardMax * 0.5; }
        break;

      case ST.KNOCKDOWN:
        f.stunT--;
        if (f.stunT <= 0) { f.state = ST.WAKEUP; f.stateT = 0; f.invulnT = 6; }
        break;

      case ST.WAKEUP:
        if (f.stateT > 14) { f.state = ST.IDLE; f.stateT = 0; }
        break;

      case ST.TAGIN:
        this.tagInUpdate(f, opp);
        break;

      case ST.FURYBURST:
        this.furyBurstUpdate(f, opp);
        break;

      case ST.SUPER:
        this.superUpdate(f, opp);
        break;

      case ST.ATTACK:
        this.attackUpdate(f, opp, mask, pressed);
        break;

      default:
        this.neutralUpdate(f, opp, mask, pressed);
    }
  };

  Match.prototype.physics = function (f) {
    if (f.y > 0 || f.vy > 0) {
      f.vy -= T.gravity * VS;
      f.y += f.vy;
      f.airT++;
      if (f.y <= 0) {
        f.y = 0; f.vy = 0;
        if (f.state === ST.JUMP) { f.state = ST.IDLE; f.landLag = 4; }
        else if (f.state === ST.AIRHIT) { this.knockdown(f, this.opponent(f)); }
        else if (f.state === ST.HIT) { /* grounded hitstun continues */ }
        f.airT = 0;
      }
    }
    f.x += f.vx * KS;
    f.vx *= 0.86;
    if (Math.abs(f.vx) < 0.01) f.vx = 0;
    if (f.x < -T.stageHalfWidth) { f.x = -T.stageHalfWidth; f.vx = 0; }
    if (f.x > T.stageHalfWidth) { f.x = T.stageHalfWidth; f.vx = 0; }
  };

  Match.prototype.neutralUpdate = function (f, opp, mask, pressed) {
    var spd = T.walkSpeed * f.def.speed;

    /* Fury Burst / Art / Super are valid from neutral. */
    if (pressed & IN.FB && this.tryFuryBurst(f)) return;
    if (pressed & IN.FA && this.tryFuryArt(f)) return;
    if (pressed & IN.SUPER && this.trySuper(f)) return;
    if (pressed & IN.TAG && this.tryTag(f)) return;

    if (f.y <= 0) {
      /* Crouch state */
      if (f.crouching && !f.blockHeld) { f.state = ST.CROUCH; }
      else if (f.blockHeld) { f.state = ST.BLOCK; }
      else f.state = ST.IDLE;

      /* Dash: double-tap toward the opponent. */
      var fwdBit = f.face > 0 ? IN.RIGHT : IN.LEFT;
      if (pressed & fwdBit && f.dashCd <= 0) {
        if (this.tick - f.lastDirTap <= 14) {
          f.state = ST.DASH; f.stateT = 0;
          f.vx = f.face * T.dashSpeed * f.def.dash;
          f.dashCd = T.dashCooldown;
          this.emit({ type: 'dash', side: f.side, x: f.x, dir: f.face });
        }
        f.lastDirTap = this.tick;
      }

      /* Jump */
      if (pressed & IN.UP && (f.state === ST.IDLE || f.state === ST.WALK || f.state === ST.CROUCH)) {
        f.state = ST.JUMP;
        f.vy = T.jumpVelocity * VS * f.def.jump;
        f.y = 0.001;
        this.emit({ type: 'jump', side: f.side, x: f.x });
      }
    }

    /* Movement */
    if (f.state === ST.WALK || f.state === ST.IDLE || f.state === ST.CROUCH) {
      var dir = 0;
      if (mask & IN.LEFT) dir -= 1;
      if (mask & IN.RIGHT) dir += 1;
      if (dir !== 0) {
        var moveSpd = f.crouching ? T.crouchSpeed : spd;
        f.x += dir * moveSpd;
        f.state = f.crouching ? ST.CROUCH : ST.WALK;
        f.walkDir = dir;
      } else if (!f.crouching && !f.blockHeld) {
        f.state = ST.IDLE;
      }
    } else if (f.state === ST.DASH) {
      if (f.stateT > T.dashTicks) { f.state = ST.IDLE; f.stateT = 0; }
    } else if (f.state === ST.JUMP) {
      var adir = 0;
      if (mask & IN.LEFT) adir -= 1;
      if (mask & IN.RIGHT) adir += 1;
      f.x += adir * T.airDrift;
    }

    /* Attack input */
    this.tryAttack(f, opp, pressed);
  };

  Match.prototype.tryAttack = function (f, opp, pressed) {
    if (f.dizzyT > 0) return false;
    /* Throw: dedicated input, with light+heavy on the same tick as an alias. */
    if (pressed & IN.THROW) return this.startMove(f, RB.THROW, opp);
    if ((pressed & IN.LIGHT) && (pressed & IN.HEAVY)) return this.startMove(f, RB.THROW, opp);
    if (pressed & IN.LIGHT) return this.startMove(f, f.moves[f.charId + '.5L'], opp);
    if (pressed & IN.HEAVY) return this.startMove(f, f.moves[f.charId + '.5H'], opp);
    if (pressed & IN.KICK) return this.startMove(f, f.moves[f.charId + '.2K'], opp);
    if (pressed & IN.LAUNCH) return this.startMove(f, f.moves[f.charId + '.4C'], opp);
    if (pressed & IN.SPECIAL) {
      /* Sable: down+special arms a trap instead of firing a shot. */
      if (f.charId === 'sable' && (f.crouching || (f.prevMask & IN.DOWN))) {
        return this.startMove(f, f.moves['sable.2S'], opp);
      }
      return this.startMove(f, f.moves[f.charId + '.6S'], opp);
    }
    if (pressed & IN.SUPER) return this.trySuper(f);
    return false;
  };

  Match.prototype.startMove = function (f, mv, opp, isCancel) {
    if (!mv) return false;
    if (mv.cost && f.meter < mv.cost) return false;
    if (mv.superMove) return this.trySuper(f);
    if (f.state === ST.ATTACK && !isCancel) return false;
    f.state = ST.ATTACK;
    f.stateT = 0;
    f.move = mv;
    f.moveFrame = 0;
    f.hitSet = {};
    f.hitConfirmed = false;
    f.cancelOpen = false;
    f.armor = mv.armor || 0;
    if (mv.invuln) f.invulnT = Math.max(f.invulnT, mv.invuln[1]);
    f.moveDir = f.face;
    this.emit({ type: 'moveStart', side: f.side, moveId: mv.id, name: mv.name, x: f.x, y: f.y });
    return true;
  };

  Match.prototype.attackUpdate = function (f, opp, mask, pressed) {
    var mv = f.move;
    if (!mv) { f.state = ST.IDLE; return; }
    var fr = f.moveFrame;

    /* Forward displacement on defined frames. */
    if (mv.moveF && fr >= mv.startup - 2 && fr < mv.startup - 2 + mv.moveFrames) {
      f.x += f.face * (mv.moveF / mv.moveFrames);
    }

    /* Cancel window: only after a confirmed hit, only into allowed roles. */
    if (f.hitConfirmed && f.cancelOpen) {
      var want = this.pendingAttack(f, pressed);
      if (want && mv.cancelTo.length) {
        var role = want.roles || [];
        for (var i = 0; i < role.length; i++) {
          if (mv.cancelTo.indexOf(role[i]) >= 0) {
            this.emit({ type: 'cancel', side: f.side, from: mv.id, to: want.id });
            this.startMove(f, want, opp, true);
            return;
          }
        }
      }
    }

    /* Active frames: validate hits. */
    if (fr >= mv.startup && fr < mv.startup + mv.active) {
      if (mv.projectile) {
        if (!f.hitSet.__shot) {
          f.hitSet.__shot = 1;
          this.spawnProjectile(f, mv);
        }
      } else if (mv.trap) {
        if (!f.hitSet.__trap) {
          f.hitSet.__trap = 1;
          this.spawnTrap(f, mv);
        }
      } else if (mv.throwMove) {
        if (!f.hitSet.__thrown) {
          f.hitSet.__thrown = 1;
          this.tryThrow(f, opp, mv);
        }
      } else if (mv.superMove) {
        /* handled by superUpdate */
      } else {
        this.tryStrike(f, opp, mv);
      }
    }

    f.moveFrame++;
    var total = mv.startup + mv.active + mv.recovery;
    if (f.moveFrame >= total) {
      f.state = ST.IDLE;
      f.stateT = 0;
      f.move = null;
      f.cancelOpen = false;
    }
  };

  Match.prototype.pendingAttack = function (f, pressed) {
    if (pressed & IN.LAUNCH) return f.moves[f.charId + '.4C'];
    if (pressed & IN.SPECIAL) {
      if (f.charId === 'sable' && (f.prevMask & IN.DOWN)) return f.moves['sable.2S'];
      return f.moves[f.charId + '.6S'];
    }
    if (pressed & IN.HEAVY) return f.moves[f.charId + '.5H'];
    if (pressed & IN.KICK) return f.moves[f.charId + '.2K'];
    if (pressed & IN.LIGHT) return f.moves[f.charId + '.5L'];
    if (pressed & IN.SUPER) return f.moves[f.charId + '.SUP'];
    return null;
  };

  /* ------------------------------------------------------------- hit checks */
  Match.prototype.hitboxOverlap = function (att, def, mv) {
    var dx = (def.x - att.x) * att.face;
    var reach = mv.range + 0.34;
    if (dx < -0.30 || dx > reach) return false;
    /* Airborne targets use a widened vertical window so juggles are reachable
       with authored ground moves instead of requiring bespoke air normals. */
    if (def.isAirborne()) return def.y < 2.9;
    var top = att.y + mv.hitY + mv.height * 0.5;
    var bot = att.y + mv.hitY - mv.height * 0.5;
    var dTop = def.hurtCenter() + 0.55;
    var dBot = def.hurtCenter() - 0.65;
    if (def.crouching && !def.isAirborne()) { dTop -= 0.30; dBot -= 0.05; }
    return !(dTop < bot || dBot > top);
  };

  Match.prototype.canBlock = function (f, mv) {
    if (f.isAirborne()) return false;
    if (mv.throwMove) return false;
    if (f.state === ST.ATTACK || f.state === ST.SUPER || f.state === ST.FURYBURST ||
      f.state === ST.HIT || f.state === ST.AIRHIT || f.state === ST.KNOCKDOWN ||
      f.state === ST.WAKEUP || f.state === ST.GUARDCRUSH || f.state === ST.TAGIN) return false;
    if (!f.blockHeld) return false;
    if (mv.low && !f.crouching) return false;
    if (mv.overhead && f.crouching) return false;
    return true;
  };

  Match.prototype.tryStrike = function (att, def, mv) {
    var key = def.side + ':' + (att.side) + ':' + mv.id;
    if (att.hitSet[key]) return false;
    if (def.state === ST.KO) return false;
    if (def.invulnT > 0) return false;
    if (!this.hitboxOverlap(att, def, mv)) return false;
    att.hitSet[key] = 1;
    this.resolveHit(att, def, mv);
    return true;
  };

  Match.prototype.resolveHit = function (att, def, mv, opts) {
    opts = opts || {};
    if (def.state === ST.KO) return;

    var blocked = this.canBlock(def, mv);
    var counter = !blocked && def.state === ST.ATTACK && def.move && def.moveFrame < def.move.startup;
    var punish = !blocked && def.state === ST.ATTACK && def.move && def.moveFrame >= def.move.startup + def.move.active;

    /* FreeStyle legality: repeat limit per combo. */
    if (!blocked) {
      var used = att.comboMoves[mv.id] || 0;
      var limit = (mv.roles.indexOf('launcher') >= 0) ? 1 : (mv.superMove ? 1 : 2);
      if (used >= limit) { this.emit({ type: 'routeDrop', reason: 'repeatLimit', moveId: mv.id, side: att.side }); return; }
    }

    var scale = blocked ? 1 : this.scaleFor(att.comboHits);
    var artMul = att.furyArtT > 0 ? 1.15 : 1;
    var counterMul = counter ? 1.25 : 1;
    var dmg = mv.dmg * scale * artMul * counterMul;
    var launch = mv.launch;

    if (blocked) {
      var chip = dmg * mv.chip;
      def.hp = Math.max(1, def.hp - chip);
      def.state = ST.BLOCKSTUN;
      def.stunT = mv.blockstun;
      def.vx = -def.face * mv.kb * 0.55;
      def.guard -= mv.guardDmg * (att.furyArtT > 0 ? 1.5 : 1);
      att.meter = Math.min(T.superMax, att.meter + mv.meterGain * 0.35);
      def.meter = Math.min(T.superMax, def.meter + mv.meterGain * 0.25);
      def.fury = Math.min(T.furyMax, def.fury + 1.5);
      this.freeze = Math.round(mv.hitstop * 0.5);
      this.emit({ type: 'block', side: att.side, x: def.x, y: def.hurtCenter(), moveId: mv.id, chip: chip });
      if (def.guard <= 0) {
        def.guard = 0;
        def.state = ST.GUARDCRUSH;
        def.stunT = 48;
        def.dizzyT = 48;
        this.emit({ type: 'guardCrush', side: def.side, x: def.x });
      }
      return;
    }

    /* Clean hit. */
    att.comboMoves[mv.id] = (att.comboMoves[mv.id] || 0) + 1;
    att.comboHits++;
    att.comboDamage += dmg;
    att.hitConfirmed = true;
    att.cancelOpen = true;
    att.meter = Math.min(T.superMax, att.meter + mv.meterGain);
    att.fury = Math.min(T.furyMax, att.fury + mv.furyGain);
    def.meter = Math.min(T.superMax, def.meter + mv.meterGain * 0.4);
    def.fury = Math.min(T.furyMax, def.fury + dmg * 0.7);

    def.hp = Math.max(0, def.hp - dmg);

    if (launch > 0 || def.isAirborne()) {
      def.state = ST.AIRHIT;
      def.vy = launch > 0 ? launch * VS : Math.max(def.vy, 4.2 * VS);
      def.y = Math.max(def.y, 0.02);
      def.vx = att.face * mv.kb * 0.8;
      def.juggle -= mv.juggleCost;
      def.stunT = mv.hitstun;
      if (def.juggle <= 0) { def.vy = -6 * VS; def.stunT = 99; }
    } else {
      def.state = ST.HIT;
      def.stunT = mv.hitstun * (counter ? 1.4 : 1) * (att.furyArtT > 0 && mv.roles.indexOf('ender') >= 0 ? 1.2 : 1);
      def.vx = att.face * mv.kb;
      def.stunT = Math.round(def.stunT);
    }
    def.facingLock = true;
    def.face = att.face > 0 ? -1 : 1;
    def.move = null;

    /* Wall interaction: one splat per combo, deterministic. */
    if (!att.wallUsed && def.isAirborne() && Math.abs(def.x) > T.wallSplatX) {
      att.wallUsed = true;
      def.vx = -def.face * 3.4;
      def.stunT += 10;
      def.juggle -= 10;
      this.emit({ type: 'wallSplat', x: def.x, side: def.side });
    }

    this.freeze = Math.round(mv.hitstop * T.hitstopScale);
    this.emit({
      type: 'hit', side: att.side, x: def.x, y: def.hurtCenter(), moveId: mv.id,
      dmg: dmg, counter: counter, punish: punish, blocked: false,
      combo: att.comboHits, launch: launch > 0, art: att.furyArtT > 0
    });

    if (def.hp <= 0) this.koDefender(def, att);
  };

  Match.prototype.scaleFor = function (hits) {
    var i = Math.max(0, Math.min(RB.SCALING.length - 1, hits));
    return Math.max(RB.SCALING_FLOOR, RB.SCALING[i]);
  };

  Match.prototype.clearCombo = function (att, def) {
    if (!att) return;
    att.comboHits = 0;
    att.comboDamage = 0;
    att.comboMoves = {};
    att.wallUsed = false;
    def.juggle = T.juggleBudget;
  };

  Match.prototype.knockdown = function (f, opp) {
    if (f.state === ST.KO) return;
    f.state = ST.KNOCKDOWN;
    f.stunT = 34;
    f.y = 0; f.vy = 0; f.vx *= 0.4;
    this.emit({ type: 'knockdown', side: f.side, x: f.x });
    if (opp) this.clearCombo(opp, f);
  };

  Match.prototype.koDefender = function (def, att) {
    def.state = ST.KO;
    def.stunT = 999;
    def.vy = 5.5;
    def.y = Math.max(def.y, 0.05);
    def.vx = att.face * 4.2;
    def.koT = 0;
    def.move = null;
    this.freeze = 14;
    this.emit({ type: 'ko', side: def.side, winner: att.side, x: def.x });
    if (this.phase === 'fight') { this.phase = 'ko'; this.phaseT = 0; }
    if (att) this.clearCombo(att, def);
  };

  Match.prototype.checkKO = function (a, b) {
    if (this.phase !== 'fight') return;
    var ad = this.sideDead(0), bd = this.sideDead(1);
    if (ad || bd) {
      this.phase = 'ko';
      this.phaseT = 0;
      this.emit({ type: 'announce', text: ad && bd ? 'DOUBLE K.O.' : 'K.O.', style: 'ko' });
    }
  };

  Match.prototype.endRoundByTime = function () {
    var ra = this.ratio(0), rb = this.ratio(1);
    this.phase = 'ko';
    this.phaseT = 0;
    this.emit({ type: 'announce', text: 'TIME', style: 'ko' });
    this.emit({ type: 'timeOver', winner: Math.abs(ra - rb) < 0.001 ? -1 : (ra > rb ? 0 : 1) });
  };

  /* ------------------------------------------------------------- resources */
  Match.prototype.trySuper = function (f) {
    if (f.meter < T.superCost) { this.emit({ type: 'invalid', reason: 'meter', side: f.side }); return false; }
    if (!f.isActionable() || f.isAirborne()) { this.emit({ type: 'invalid', reason: 'state', side: f.side }); return false; }
    f.meter -= T.superCost;
    if (this.infiniteMeter) f.meter = T.superMax;
    f.state = ST.SUPER;
    f.stateT = 0;
    f.move = f.moves[f.charId + '.SUP'];
    f.moveFrame = 0;
    f.hitSet = {};
    f.superPhase = 0;
    f.superT = 0;
    f.superHits = 0;
    f.invulnT = 20;
    f.cinematic = true;
    this.emit({ type: 'superStart', side: f.side, charId: f.charId, x: f.x, name: f.def.superName });
    return true;
  };

  Match.prototype.superUpdate = function (f, opp) {
    var mv = f.move;
    f.superT++;
    var t = f.superT;

    /* Cinematic lock: opponent cannot act while the super connects. */
    if (t === 6) {
      var dist = Math.abs(opp.x - f.x);
      f.superWillConnect = dist <= mv.range + 0.6 && opp.state !== ST.KO;
      if (f.superWillConnect) {
        opp.state = ST.HIT;
        opp.stunT = 60;
        opp.vx = 0;
        this.emit({ type: 'cinematicStart', side: f.side, x: f.x, y: 1.1, name: f.def.superName });
      } else {
        this.emit({ type: 'superWhiff', side: f.side });
      }
    }

    if (f.superWillConnect && t >= 10) {
      var hitTimes = [10, 20, 30, 40, 50, 62];
      var totalHits = Math.min(mv.hits, hitTimes.length);
      for (var i = 0; i < totalHits; i++) {
        if (t === hitTimes[i] && !f.hitSet['sup' + i]) {
          f.hitSet['sup' + i] = 1;
          var isLast = i === totalHits - 1;
          var sub = Object.create(mv);
          sub.dmg = mv.dmg / totalHits;
          sub.hitstun = isLast ? mv.hitstun : 12;
          sub.kb = isLast ? mv.kb : 0.4;
          sub.launch = 0;
          sub.hitstop = isLast ? mv.hitstop : 2;
          sub.meterGain = 0; sub.furyGain = 0;
          sub.roles = isLast ? ['ender', 'super'] : ['super'];
          sub.cancelTo = [];
          sub.chip = 0.2;
          if (opp.state !== ST.KO) {
            var scale = 1;
            var dmg = sub.dmg * scale;
            opp.hp = Math.max(0, opp.hp - dmg);
            f.comboDamage += dmg;
            this.emit({
              type: 'hit', side: f.side, x: opp.x, y: opp.hurtCenter(), moveId: mv.id,
              dmg: dmg, counter: false, punish: false, blocked: false,
              combo: i + 1, launch: false, art: false, superHit: true, last: isLast
            });
            this.freeze = isLast ? 8 : 2;
            if (isLast) {
              opp.state = ST.KNOCKDOWN;
              opp.stunT = 40;
              opp.vx = f.face * mv.kb;
              opp.vy = 0;
              f.cinematic = false;
            }
            if (opp.hp <= 0) {
              this.koDefender(opp, f);
              f.cinematic = false;
            }
          }
        }
      }
    }

    var total = mv.startup + 70 + mv.recovery;
    if (t >= total) {
      f.state = ST.IDLE;
      f.stateT = 0;
      f.move = null;
      f.cinematic = false;
      f.superWillConnect = false;
      this.emit({ type: 'superEnd', side: f.side });
    }
  };

  Match.prototype.tryFuryBurst = function (f) {
    if (f.fury < T.furyBurstCost) { this.emit({ type: 'invalid', reason: 'fury', side: f.side }); return false; }
    var ok = f.state === ST.HIT || f.state === ST.BLOCKSTUN || f.state === ST.GUARDCRUSH ||
      f.state === ST.IDLE || f.state === ST.BLOCK || f.state === ST.CROUCH || f.state === ST.WALK;
    if (!ok || f.isAirborne()) { this.emit({ type: 'invalid', reason: 'state', side: f.side }); return false; }
    f.fury -= T.furyBurstCost;
    f.state = ST.FURYBURST;
    f.stateT = 0;
    f.move = null;
    f.stunT = 0;
    f.invulnT = 16;
    f.burstDone = false;
    this.emit({ type: 'furyBurstStart', side: f.side, x: f.x });
    return true;
  };

  Match.prototype.furyBurstUpdate = function (f, opp) {
    if (f.stateT === 8 && !f.burstDone) {
      f.burstDone = true;
      var dx = opp.x - f.x;
      if (Math.abs(dx) < 2.5 && opp.state !== ST.KO) {
        opp.state = ST.HIT;
        opp.stunT = 14;
        opp.vx = RB.sign(dx) * 7.5;
        opp.move = null;
        this.emit({ type: 'furyBurstHit', x: opp.x, side: f.side });
      }
      this.emit({ type: 'furyBurst', side: f.side, x: f.x });
      this.freeze = 6;
    }
    if (f.stateT > 26) { f.state = ST.IDLE; f.stateT = 0; }
  };

  Match.prototype.tryFuryArt = function (f) {
    if (f.fury < T.furyArtCost) { this.emit({ type: 'invalid', reason: 'fury', side: f.side }); return false; }
    if (!f.isActionable() || f.isAirborne()) { this.emit({ type: 'invalid', reason: 'state', side: f.side }); return false; }
    if (f.furyArtT > 0) { this.emit({ type: 'invalid', reason: 'active', side: f.side }); return false; }
    f.fury -= T.furyArtCost;
    f.furyArtT = T.furyArtTicks;
    this.emit({ type: 'furyArt', side: f.side, x: f.x, charId: f.charId, name: f.def.furyArt });
    return true;
  };

  /* ---------------------------------------------------------------- throws */
  Match.prototype.tryThrow = function (att, def, mv) {
    if (def.state === ST.KO || def.invulnT > 0) return false;
    if (def.isAirborne()) return false;
    var dx = (def.x - att.x) * att.face;
    if (dx < -0.2 || dx > mv.range + 0.3) return false;
    if (def.state === ST.HIT || def.state === ST.AIRHIT || def.state === ST.KNOCKDOWN) return false;

    /* Throw break: defender pressed the throw input inside the window. */
    var breakable = mv.id === RB.THROW.id;
    var wantBreak = this.recentPress(def, IN.THROW, T.throwBreakWindow);
    if (breakable && wantBreak) {
      att.vx = -att.face * 2.2;
      def.vx = def.face * 2.2;
      att.state = ST.IDLE; def.state = ST.IDLE;
      att.move = null;
      this.emit({ type: 'throwBreak', x: (att.x + def.x) / 2 });
      this.freeze = 5;
      return true;
    }

    var dmg = mv.dmg * (att.furyArtT > 0 ? 1.15 : 1);
    def.hp = Math.max(0, def.hp - dmg);
    def.state = ST.KNOCKDOWN;
    def.stunT = 40;
    def.vx = att.face * 3.0;
    def.move = null;
    att.meter = Math.min(T.superMax, att.meter + mv.meterGain);
    att.fury = Math.min(T.furyMax, att.fury + mv.furyGain);
    def.fury = Math.min(T.furyMax, def.fury + dmg * 0.6);
    this.freeze = 8;
    this.emit({ type: 'throwHit', side: att.side, x: def.x, dmg: dmg, charId: att.charId });
    if (def.hp <= 0) this.koDefender(def, att);
    return true;
  };

  /* ----------------------------------------------------------- projectiles */
  Match.prototype.spawnProjectile = function (f, mv) {
    var p = mv.projectile;
    this.projectiles.push({
      id: 'p' + (nextId++),
      owner: f.side, x: f.x + f.face * 0.75, y: f.y + p.y,
      vx: f.face * p.speed, radius: p.radius, life: p.life,
      dmg: p.dmg * (f.furyArtT > 0 ? 1.15 : 1), hitstun: p.hitstun, kb: p.kb,
      art: f.furyArtT > 0, hit: false, moveId: mv.id
    });
    this.emit({ type: 'shotSpawn', side: f.side, x: f.x, y: f.y + p.y });
  };

  Match.prototype.updateProjectiles = function (fa, fb) {
    var self = this;
    this.projectiles.forEach(function (p) {
      if (p.hit) return;
      p.x += p.vx;
      p.life--;
      var target = self.fighters[1 - p.owner];
      if (target.state === ST.KO) return;
      if (target.invulnT > 0) return;
      if (Math.abs(p.x - target.x) < 0.55 + p.radius &&
        Math.abs(p.y - target.hurtCenter()) < 0.85) {
        var owner = self.fighters[p.owner];
        var mv = { dmg: p.dmg, chip: 0.12, hitstun: p.hitstun, blockstun: 10, hitstop: 4,
          kb: p.kb, launch: 0, range: 9, hitY: p.y, height: 1.2, guardDmg: 8,
          meterGain: 5, furyGain: 3, roles: ['starter'], cancelTo: [], id: p.moveId, low: false };
        if (self.canBlock(target, mv)) {
          target.hp = Math.max(1, target.hp - p.dmg * 0.12);
          target.state = ST.BLOCKSTUN; target.stunT = 10; target.vx = -target.face * 1.4;
          self.emit({ type: 'block', side: p.owner, x: target.x, y: target.hurtCenter(), chip: p.dmg * 0.12 });
        } else {
          target.hp = Math.max(0, target.hp - p.dmg);
          target.state = ST.HIT; target.stunT = p.hitstun; target.vx = RB.sign(p.vx) * p.kb;
          owner.comboHits = 1; owner.comboMoves[p.moveId] = 1;
          owner.meter = Math.min(T.superMax, owner.meter + 5);
          owner.fury = Math.min(T.furyMax, owner.fury + 3);
          target.fury = Math.min(T.furyMax, target.fury + p.dmg * 0.6);
          self.emit({ type: 'hit', side: p.owner, x: target.x, y: target.hurtCenter(), moveId: p.moveId,
            dmg: p.dmg, counter: false, punish: false, combo: 1, art: p.art });
          if (target.hp <= 0) self.koDefender(target, owner);
        }
        p.hit = true;
      }
    });
    this.projectiles = this.projectiles.filter(function (p) { return !p.hit && p.life > 0 && Math.abs(p.x) < 12; });
  };

  Match.prototype.spawnTrap = function (f, mv) {
    this.traps.push({
      id: 't' + (nextId++),
      owner: f.side, x: f.x + f.face * 1.6, y: 0,
      armT: mv.trap.arm, life: mv.trap.life, radius: mv.trap.radius,
      dmg: mv.trap.dmg, hitstun: mv.trap.hitstun, kb: mv.trap.kb,
      armed: false, dead: false, art: f.furyArtT > 0
    });
    this.emit({ type: 'trapPlaced', side: f.side, x: f.x + f.face * 1.6 });
  };

  Match.prototype.updateTraps = function (fa, fb) {
    var self = this;
    this.traps.forEach(function (t) {
      if (t.dead) return;
      t.life--;
      if (!t.armed) {
        t.armT--;
        if (t.armT <= 0) { t.armed = true; self.emit({ type: 'trapArmed', x: t.x }); }
      }
      if (t.life <= 0) { t.dead = true; self.emit({ type: 'trapExpire', x: t.x }); return; }
      if (!t.armed) return;
      var target = self.fighters[1 - t.owner];
      if (target.state === ST.KO || target.invulnT > 0) return;
      if (Math.abs(target.x - t.x) < t.radius && target.y < 0.4) {
        var owner = self.fighters[t.owner];
        target.hp = Math.max(0, target.hp - t.dmg);
        target.state = ST.HIT;
        target.stunT = t.hitstun;
        target.vx = RB.sign(target.x - t.x || 1) * t.kb;
        target.vy = 3.4;
        target.y = 0.02;
        target.state = ST.AIRHIT;
        owner.comboHits = 1;
        self.emit({ type: 'trapDetonate', x: t.x, side: t.owner });
        self.emit({ type: 'hit', side: t.owner, x: target.x, y: target.hurtCenter(), moveId: 'sable.2S',
          dmg: t.dmg, counter: false, punish: false, combo: 1, launch: true });
        t.dead = true;
        if (target.hp <= 0) self.koDefender(target, owner);
      }
    });
    this.traps = this.traps.filter(function (t) { return !t.dead; });
  };

  /* ------------------------------------------------------------------- tag */
  Match.prototype.tryTag = function (f) {
    if (this.mode !== 'tag') return false;
    var side = this.sides[f.side];
    if (side.team.length < 2) return false;
    if (f.tagCooldown > 0) { this.emit({ type: 'invalid', reason: 'tagCooldown', side: f.side }); return false; }
    var partner = side.team[1 - side.active];
    if (!partner || partner.hp <= 0) { this.emit({ type: 'invalid', reason: 'tagDead', side: f.side }); return false; }
    if (!f.isActionable() || f.isAirborne()) { this.emit({ type: 'invalid', reason: 'state', side: f.side }); return false; }

    side.active = 1 - side.active;
    this.fighters[f.side] = partner;
    partner.resetRound(f.x - f.face * 1.1, f.face);
    partner.state = ST.TAGIN;
    partner.stateT = 0;
    partner.tagStrikeDone = false;
    partner.invulnT = 10;
    partner.tagCooldown = T.tagCooldown;
    partner.meter = Math.max(partner.meter, f.meter * 0.5);
    partner.fury = Math.max(partner.fury, f.fury * 0.5);
    f.tagCooldown = T.tagCooldown;
    this.emit({ type: 'tagIn', side: f.side, x: partner.x, charId: partner.charId });
    return true;
  };

  Match.prototype.tagInUpdate = function (f, opp) {
    if (f.stateT === 10 && !f.tagStrikeDone) {
      f.tagStrikeDone = true;
      var mv = {
        id: f.charId + '.tag', dmg: 7, chip: 0.12, hitstun: 18, blockstun: 10, hitstop: 5,
        kb: 2.6, launch: 0, range: 1.9, hitY: 1.1, height: 1.2, guardDmg: 8,
        meterGain: 4, furyGain: 2, roles: ['extender'], cancelTo: [], low: false
      };
      if (this.hitboxOverlap(f, opp, mv)) {
        this.emit({ type: 'tagAssistHit', side: f.side, x: opp.x, y: opp.hurtCenter() });
        this.resolveHit(f, opp, mv);
      } else {
        this.emit({ type: 'tagAssistMiss', side: f.side });
      }
    }
    if (f.stateT > 24) { f.state = ST.IDLE; f.stateT = 0; }
  };

  /* ---------------------------------------------------------------- export */
  RB.Match = Match;
  RB.Fighter = Fighter;
  RB.IN = IN;
  RB.ST = ST;
  RB.ATTACK_BITS = ATTACK_BITS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
