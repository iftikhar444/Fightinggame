/* =========================================================================
   RIFTBOUND: CLASH PROTOCOL — 00 UTIL
   Pure helpers. No DOM, no THREE. Safe to load in Node for tests.
   ========================================================================= */
(function (root) {
  'use strict';
  var RB = root.RB || (root.RB = {});

  RB.TICK = 1 / 60;          // fixed simulation step
  RB.VERSION = '1.0.0-mvp';

  RB.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  RB.lerp = function (a, b, t) { return a + (b - a) * t; };
  RB.sign = function (v) { return v < 0 ? -1 : v > 0 ? 1 : 0; };
  RB.approach = function (cur, target, delta) {
    if (cur < target) return Math.min(cur + delta, target);
    if (cur > target) return Math.max(cur - delta, target);
    return target;
  };
  RB.damp = function (cur, target, rate, dt) {
    return RB.lerp(cur, target, 1 - Math.pow(1 - rate, dt * 60));
  };

  /* Deterministic PRNG (mulberry32). Every sim-side random draw must use one
     of these so a replayed input sequence produces an identical match. */
  RB.makeRng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  RB.ease = {
    outQuad: function (t) { return 1 - (1 - t) * (1 - t); },
    inQuad: function (t) { return t * t; },
    outCubic: function (t) { var u = 1 - t; return 1 - u * u * u; },
    inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outBack: function (t) { var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  };

  RB.pad2 = function (n) { return n < 10 ? '0' + n : '' + n; };

  /* Shallow deep-freeze so move data cannot be mutated by gameplay code. */
  RB.freezeDeep = function (obj) {
    if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
      Object.freeze(obj);
      Object.keys(obj).forEach(function (k) { RB.freezeDeep(obj[k]); });
    }
    return obj;
  };

  RB.fmtPct = function (v) { return Math.round(v * 100) + '%'; };
})(typeof globalThis !== 'undefined' ? globalThis : this);
