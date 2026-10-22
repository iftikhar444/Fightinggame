/* =========================================================================
   RIFTBOUND: CLASH PROTOCOL — 04 AUDIO
   Procedural WebAudio. No external files, so the build stays offline-safe.
   Every cue is short and transient: effects must never hide the hit.
   ========================================================================= */
(function (root) {
  'use strict';
  var RB = root.RB;

  var A = {
    ctx: null,
    master: null,
    sfxBus: null,
    ambBus: null,
    noise: null,
    muted: false,
    ready: false,
    ambNodes: [],
    ambName: null
  };

  function ensure() {
    if (A.ctx) {
      if (A.ctx.state === 'suspended') A.ctx.resume();
      return A.ctx;
    }
    var C = root.AudioContext || root.webkitAudioContext;
    if (!C) return null;
    A.ctx = new C();
    A.master = A.ctx.createGain();
    A.master.gain.value = A.muted ? 0 : 0.85;
    A.master.connect(A.ctx.destination);
    A.sfxBus = A.ctx.createGain();
    A.sfxBus.gain.value = 0.9;
    A.sfxBus.connect(A.master);
    A.ambBus = A.ctx.createGain();
    A.ambBus.gain.value = 0.0;
    A.ambBus.connect(A.master);

    var len = Math.floor(A.ctx.sampleRate * 1.2);
    var buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    A.noise = buf;
    A.ready = true;
    return A.ctx;
  }

  function now() { return A.ctx.currentTime; }

  function noiseSrc() {
    var s = A.ctx.createBufferSource();
    s.buffer = A.noise;
    return s;
  }

  function env(g, t0, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  function tone(freq, dur, type, vol, t0, slideTo) {
    var o = A.ctx.createOscillator();
    var g = A.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    env(g, t0, vol, 0.005, dur);
    o.connect(g); g.connect(A.sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noiseHit(dur, vol, type, freq, q) {
    var s = noiseSrc(), f = A.ctx.createBiquadFilter(), g = A.ctx.createGain();
    f.type = type || 'bandpass';
    f.frequency.value = freq || 1200;
    f.Q.value = q == null ? 1.2 : q;
    env(g, now(), vol, 0.004, dur);
    s.connect(f); f.connect(g); g.connect(A.sfxBus);
    s.start(now()); s.stop(now() + dur + 0.05);
  }

  var SFX = {
    hitLight: function (counter) {
      var t = now();
      noiseHit(0.10, 0.35, 'bandpass', counter ? 2200 : 1500, 0.9);
      tone(counter ? 200 : 150, 0.09, 'triangle', 0.22, t, 70);
      if (counter) tone(900, 0.06, 'square', 0.10, t + 0.01, 1400);
    },
    hitHeavy: function (counter) {
      var t = now();
      noiseHit(0.18, 0.42, 'lowpass', 900, 0.7);
      tone(95, 0.20, 'sine', 0.38, t, 45);
      tone(counter ? 320 : 220, 0.12, 'square', 0.10, t, 80);
    },
    hitLow: function () {
      var t = now();
      noiseHit(0.11, 0.30, 'lowpass', 700, 0.8);
      tone(110, 0.12, 'triangle', 0.22, t, 55);
    },
    hitLaunch: function () {
      var t = now();
      noiseHit(0.16, 0.30, 'bandpass', 900, 1.4);
      tone(180, 0.28, 'sawtooth', 0.20, t, 720);
    },
    block: function () {
      var t = now();
      noiseHit(0.07, 0.26, 'highpass', 2600, 1.0);
      tone(760, 0.05, 'square', 0.09, t, 620);
    },
    guardCrush: function () {
      var t = now();
      noiseHit(0.30, 0.34, 'bandpass', 500, 0.8);
      tone(240, 0.35, 'sawtooth', 0.20, t, 60);
    },
    whiffLight: function () { noiseHit(0.09, 0.10, 'bandpass', 2400, 2.0); },
    whiffHeavy: function () { noiseHit(0.16, 0.14, 'bandpass', 1100, 1.4); },
    whoosh: function () { noiseHit(0.14, 0.16, 'bandpass', 800, 1.6); },
    whooshHeavy: function () { noiseHit(0.20, 0.18, 'bandpass', 600, 1.2); },
    jump: function () { tone(300, 0.09, 'sine', 0.10, now(), 520); },
    dash: function () { noiseHit(0.13, 0.14, 'bandpass', 1800, 0.9); },
    grab: function () {
      var t = now();
      noiseHit(0.12, 0.28, 'lowpass', 500, 0.8);
      tone(120, 0.22, 'sine', 0.30, t, 60);
    },
    throwBreak: function () {
      var t = now();
      noiseHit(0.10, 0.22, 'bandpass', 1800, 1.0);
      tone(520, 0.08, 'square', 0.12, t, 780);
    },
    shot: function () { tone(700, 0.12, 'triangle', 0.16, now(), 260); },
    trap: function () { tone(420, 0.18, 'sine', 0.14, now(), 620); },
    trapArm: function () { tone(880, 0.10, 'square', 0.08, now(), 1200); },
    trapBoom: function () {
      var t = now();
      noiseHit(0.35, 0.40, 'lowpass', 600, 0.7);
      tone(70, 0.40, 'sine', 0.40, t, 35);
    },
    furyBurst: function () {
      var t = now();
      tone(70, 0.45, 'sine', 0.42, t, 40);
      noiseHit(0.35, 0.30, 'bandpass', 700, 0.7);
      tone(300, 0.30, 'sawtooth', 0.14, t, 120);
    },
    furyArt: function () {
      var t = now();
      [180, 270, 360].forEach(function (f, i) {
        var o = A.ctx.createOscillator(), g = A.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * 2, t + 0.5);
        env(g, t, 0.10, 0.05, 0.6);
        o.connect(g); g.connect(A.sfxBus);
        o.start(t); o.stop(t + 0.8);
      });
    },
    superStart: function () {
      var t = now();
      noiseHit(0.55, 0.26, 'highpass', 1200, 0.6);
      [110, 165, 220].forEach(function (f) {
        var o = A.ctx.createOscillator(), g = A.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.45);
        env(g, t, 0.13, 0.06, 0.55);
        o.connect(g); g.connect(A.sfxBus);
        o.start(t); o.stop(t + 0.7);
      });
    },
    superHit: function (last) {
      var t = now();
      noiseHit(last ? 0.30 : 0.09, last ? 0.42 : 0.22, 'bandpass', last ? 700 : 1800, 0.9);
      tone(last ? 80 : 300, last ? 0.35 : 0.08, 'sine', last ? 0.40 : 0.16, t, last ? 40 : 200);
    },
    ko: function () {
      var t = now();
      tone(320, 0.9, 'sawtooth', 0.22, t, 50);
      noiseHit(0.6, 0.24, 'lowpass', 500, 0.6);
    },
    round: function () { tone(440, 0.14, 'square', 0.14, now(), 660); },
    fight: function () {
      var t = now();
      tone(660, 0.18, 'square', 0.16, t, 880);
      tone(990, 0.22, 'square', 0.10, t + 0.05, 1320);
    },
    ui: function () { tone(660, 0.05, 'square', 0.09, now(), 880); },
    uiMove: function () { tone(440, 0.04, 'square', 0.06, now(), 520); },
    win: function () {
      var t = now();
      [523, 659, 784, 1046].forEach(function (f, i) {
        tone(f, 0.35, 'triangle', 0.14, t + i * 0.12, f);
      });
    }
  };

  A.play = function (name, arg) {
    if (A.muted) return;
    if (!ensure()) return;
    var fn = SFX[name];
    if (fn) { try { fn(arg); } catch (e) { /* audio must never break the game */ } }
  };

  /* ------------------------------------------------------------- ambience */
  A.ambience = function (name) {
    if (!ensure()) return;
    if (A.ambName === name) return;
    A.ambName = name;
    A.ambNodes.forEach(function (n) { try { n.stop(); } catch (e) { } });
    A.ambNodes = [];
    if (!name) { A.ambBus.gain.value = 0; return; }

    var t = now();
    var base = name === 'temple' ? 82 : 55;
    [base, base * 1.5].forEach(function (f, i) {
      var o = A.ctx.createOscillator(), g = A.ctx.createGain(), lp = A.ctx.createBiquadFilter();
      o.type = 'sine';
      o.frequency.value = f;
      lp.type = 'lowpass'; lp.frequency.value = 400;
      g.gain.value = i === 0 ? 0.5 : 0.22;
      o.connect(lp); lp.connect(g); g.connect(A.ambBus);
      o.start(t);
      A.ambNodes.push(o);
    });
    var s = noiseSrc(), f2 = A.ctx.createBiquadFilter(), g2 = A.ctx.createGain();
    f2.type = 'bandpass';
    f2.frequency.value = name === 'temple' ? 900 : 320;
    f2.Q.value = 0.6;
    g2.gain.value = name === 'temple' ? 0.10 : 0.16;
    s.loop = true;
    s.connect(f2); f2.connect(g2); g2.connect(A.ambBus);
    s.start(t);
    A.ambNodes.push(s);
    A.ambBus.gain.setTargetAtTime(0.16, t, 0.8);
  };

  A.setMuted = function (m) {
    A.muted = m;
    if (A.master) A.master.gain.setTargetAtTime(m ? 0 : 0.85, now(), 0.05);
  };

  A.unlock = function () { ensure(); };

  RB.Audio = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
