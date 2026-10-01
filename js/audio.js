/* audio — tutto sintetizzato con WebAudio: motore, SFX e musica chiptune */
(function () {
  'use strict';
  var MM = (window.MM = window.MM || {});
  var clamp = MM.clamp;

  var A = {
    ctx: null,
    master: null,
    muted: false,
    started: false,
    _musicOn: false,
    _musicTimer: null,
    _step: 0,
    _nextTime: 0,
    _root: 45,
    _engine: null,
    _skid: null
  };

  function now() { return A.ctx.currentTime; }

  A.init = function () {
    if (A.started) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    A.ctx = new AC();
    A.master = A.ctx.createGain();
    A.master.gain.value = A.muted ? 0 : 0.9;
    var comp = A.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    A.master.connect(comp);
    comp.connect(A.ctx.destination);
    A.started = true;
    buildEngine();
    A.muted = MM.storage.get('muted', false);
    A.master.gain.value = A.muted ? 0 : 0.9;
  };

  A.setMuted = function (b) {
    A.muted = !!b;
    MM.storage.set('muted', A.muted);
    if (A.master) {
      A.master.gain.setTargetAtTime(A.muted ? 0 : 0.9, now(), 0.05);
    }
    return A.muted;
  };
  A.toggleMute = function () { return A.setMuted(!A.muted); };

  /* ---------- motore ---------- */
  function buildEngine() {
    var ctx = A.ctx;
    var g = ctx.createGain(); g.gain.value = 0;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 6;
    var o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 60;
    var o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 61;
    var g2 = ctx.createGain(); g2.gain.value = 0.5;
    o1.connect(lp); o2.connect(g2); g2.connect(lp);
    lp.connect(g); g.connect(A.master);
    o1.start(); o2.start();

    // rumore per lo sterro
    var len = ctx.sampleRate * 2;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 1400; bp.Q.value = 1.4;
    var sg = ctx.createGain(); sg.gain.value = 0;
    src.connect(bp); bp.connect(sg); sg.connect(A.master);
    src.start();

    A._engine = { g: g, lp: lp, o1: o1, o2: o2 };
    A._skid = { g: sg, bp: bp };
  }

  /* ratio 0..1, throttle 0..1, drift 0..1; state=false sfuma */
  A.engine = function (ratio, throttle, drift, active) {
    if (!A.started || !A._engine) return;
    var e = A._engine, t = now();
    var r = clamp(ratio, 0, 1.3);
    var f = 46 + r * 168 + throttle * 14;
    e.o1.frequency.setTargetAtTime(f, t, 0.05);
    e.o2.frequency.setTargetAtTime(f * 1.006, t, 0.05);
    e.lp.frequency.setTargetAtTime(560 + r * 2400 + throttle * 700, t, 0.08);
    e.g.gain.setTargetAtTime(active ? 0.045 + throttle * 0.075 + r * 0.035 : 0, t, 0.09);
    A._skid.g.gain.setTargetAtTime(active ? clamp(drift, 0, 1) * 0.14 : 0, t, 0.06);
    if (drift > 0.05) A._skid.bp.frequency.setTargetAtTime(900 + drift * 900, t, 0.1);
  };

  /* ---------- primitive sonore ---------- */
  function tone(freq, dur, type, gain, freq2, delay) {
    if (!A.started) return;
    var t = now() + (delay || 0);
    var o = A.ctx.createOscillator();
    var g = A.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.2, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(A.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noiseHit(dur, gain, freq, freq2, delay) {
    if (!A.started) return;
    var ctx = A.ctx, t = now() + (delay || 0);
    var len = Math.max(1, (ctx.sampleRate * dur) | 0);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.setValueAtTime(freq || 1200, t);
    if (freq2) f.frequency.exponentialRampToValueAtTime(freq2, t + dur);
    f.Q.value = 1.1;
    var g = ctx.createGain(); g.gain.value = gain || 0.25;
    src.connect(f); f.connect(g); g.connect(A.master);
    src.start(t);
  }

  /* ---------- SFX ---------- */
  A.sfx = function (name) {
    if (!A.started || A.muted) return;
    switch (name) {
      case 'pickup':
        tone(660, .07, 'square', .16);
        tone(990, .09, 'square', .15, null, .06);
        break;
      case 'select':
        tone(520, .05, 'square', .12);
        tone(780, .06, 'square', .12, null, .04);
        break;
      case 'back':
        tone(420, .07, 'square', .12, 260);
        break;
      case 'nitro':
        noiseHit(.5, .3, 300, 2400);
        tone(180, .45, 'sawtooth', .14, 700);
        break;
      case 'oil':
        tone(300, .18, 'sine', .16, 90);
        break;
      case 'missile':
        noiseHit(.7, .28, 2200, 260);
        tone(900, .6, 'sawtooth', .12, 140);
        break;
      case 'boom':
        noiseHit(.45, .42, 900, 90);
        tone(120, .35, 'triangle', .3, 45);
        break;
      case 'hit':
        noiseHit(.18, .3, 1800, 300);
        tone(200, .12, 'square', .16, 90);
        break;
      case 'bump':
        noiseHit(.1, .2, 2600, 700);
        break;
      case 'fall':
        tone(700, .8, 'sawtooth', .2, 70);
        noiseHit(.8, .18, 1600, 120);
        break;
      case 'respawn':
        tone(330, .08, 'square', .14);
        tone(495, .1, 'square', .14, null, .07);
        tone(660, .12, 'square', .14, null, .14);
        break;
      case 'beep':
        tone(560, .12, 'square', .2);
        break;
      case 'go':
        tone(880, .16, 'square', .22);
        tone(1320, .4, 'square', .18, null, .05);
        break;
      case 'lap':
        tone(740, .07, 'square', .15);
        tone(988, .09, 'square', .15, null, .07);
        tone(1318, .14, 'square', .15, null, .15);
        break;
      case 'finish':
        [523, 659, 784, 1046, 1318].forEach(function (f, i) {
          tone(f, .22, 'square', .18, null, i * .11);
        });
        break;
      case 'fanfare':
        [659, 659, 659, 880, 784, 698, 659, 880, 1046].forEach(function (f, i) {
          tone(f, .2, 'square', .17, null, i * .13);
        });
        break;
      case 'warn':
        tone(220, .1, 'square', .14);
        tone(220, .1, 'square', .14, null, .16);
        break;
    }
  };

  /* ---------- musica ---------- */
  var BASS = [0, 0, 12, 0, 7, 0, 12, 3, 0, 0, 12, 0, 7, 10, 12, 7];
  var LEAD = [12, null, 15, 19, null, 15, 12, null, 10, null, 14, 17, null, 14, 10, null];
  var ACC = [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1];

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function scheduleStep(step, t) {
    var ctx = A.ctx;
    var b = BASS[step], l = LEAD[step];
    if (b !== null && b !== undefined) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = mtof(A._root + b - 12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + .01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + .16);
      o.connect(g); g.connect(A.master); o.start(t); o.stop(t + .2);
    }
    if (l !== null && l !== undefined) {
      var o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'triangle';
      o2.frequency.value = mtof(A._root + l);
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(0.075, t + .01);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + .19);
      o2.connect(g2); g2.connect(A.master); o2.start(t); o2.stop(t + .24);
    }
    if (ACC[step]) noiseHit(.045, .05, 5200, 3200, t - now());
    if (step % 4 === 0) {
      var o3 = ctx.createOscillator(), g3 = ctx.createGain();
      o3.type = 'sine';
      o3.frequency.setValueAtTime(140, t);
      o3.frequency.exponentialRampToValueAtTime(45, t + .1);
      g3.gain.setValueAtTime(0.3, t);
      g3.gain.exponentialRampToValueAtTime(0.0001, t + .16);
      o3.connect(g3); g3.connect(A.master); o3.start(t); o3.stop(t + .2);
    }
  }

  function musicTick() {
    if (!A.started || !A._musicOn || A.muted) { A._nextTime = now() + .06; return; }
    var stepDur = 60 / 142 / 4;
    while (A._nextTime < now() + .18) {
      scheduleStep(A._step % 16, Math.max(A._nextTime, now() + .01));
      A._step++;
      A._nextTime += stepDur;
    }
  }

  A.music = function (on, root) {
    if (root !== undefined) A._root = root;
    if (on === A._musicOn) return;
    A._musicOn = !!on;
    if (A._musicOn && A.started) {
      A._step = 0;
      A._nextTime = now() + .08;
      if (!A._musicTimer) A._musicTimer = setInterval(musicTick, 60);
    } else if (A._musicTimer) {
      clearInterval(A._musicTimer);
      A._musicTimer = null;
    }
  };

  A.update = function () { if (A._musicOn && !A._musicTimer && A.started) A._musicTimer = setInterval(musicTick, 60); };

  MM.Audio = A;
})();
