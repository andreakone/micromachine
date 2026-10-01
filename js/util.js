/* util — matematica e piccoli ausili, namespace globale MM */
(function () {
  'use strict';
  var MM = (window.MM = window.MM || {});

  MM.TAU = Math.PI * 2;
  MM.DEG = Math.PI / 180;

  MM.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  MM.lerp = function (a, b, t) { return a + (b - a) * t; };
  MM.mix = MM.lerp;

  MM.smoothstep = function (t) { t = MM.clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  /* damping esponenziale indipendente dal frame-rate */
  MM.damp = function (cur, target, rate, dt) {
    return MM.lerp(target, cur, Math.exp(-rate * dt));
  };
  MM.dampAngle = function (cur, target, rate, dt) {
    var d = MM.wrapAngle(target - cur);
    return cur + d * (1 - Math.exp(-rate * dt));
  };

  MM.wrapAngle = function (a) {
    a = (a + Math.PI) % MM.TAU;
    if (a < 0) a += MM.TAU;
    return a - Math.PI;
  };

  MM.dist2 = function (ax, az, bx, bz) {
    var dx = ax - bx, dz = az - bz;
    return dx * dx + dz * dz;
  };

  /* RNG deterministico (mulberry32) — le piste devono essere identiche a ogni partita */
  MM.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  MM.rrange = function (rnd, a, b) { return a + (b - a) * rnd(); };
  MM.pick = function (rnd, arr) { return arr[(rnd() * arr.length) | 0]; };

  /* colori: [r,g,b] -> stringhe, ombratura per facce dei box */
  MM.rgb = function (r, g, b) {
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  };
  MM.hexToRgb = function (hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  MM.shade = function (rgb, k) {
    return MM.rgb(rgb[0] * k, rgb[1] * k, rgb[2] * k);
  };

  MM.formatTime = function (t) {
    if (!isFinite(t) || t < 0) t = 0;
    var m = Math.floor(t / 60);
    var s = Math.floor(t % 60);
    var c = Math.floor((t * 100) % 100);
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (c < 10 ? '0' : '') + c;
  };

  MM.storage = {
    get: function (key, fallback) {
      try {
        var v = localStorage.getItem('mm.' + key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem('mm.' + key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    }
  };

  MM.clampCanvas = function (cv, w, h) {
    cv.width = w; cv.height = h;
    return cv.getContext('2d');
  };

  /* legge i pixel di un canvas come Uint32 (ABGR su LE) per il campionamento veloce */
  MM.pixelView = function (canvas) {
    var ctx = canvas.getContext('2d');
    var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return {
      w: canvas.width,
      h: canvas.height,
      px: new Uint32Array(img.data.buffer.slice(0))
    };
  };
})();
