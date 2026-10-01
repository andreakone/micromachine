/* tracks — definizioni piste, spline Catmull-Rom, baking texture del tavolo,
   maschera di solidità e generazione di ostacoli/oggetti.
   La texture e la fisica condividono le stesse forme: modifica insieme. */
(function () {
  'use strict';
  var MM = (window.MM = window.MM || {});
  var rng = MM.rng;

  var PPU = 24;          // pixel per unità nella texture del tavolo
  var SAMPLE_STEP = 0.34; // passo campionamento spline (unità)

  /* ---------------- forme ---------------- */
  function shapeHit(sh, x, z) {
    if (sh.t === 'rect') {
      return Math.abs(x - sh.x) <= sh.w / 2 && Math.abs(z - sh.z) <= sh.h / 2;
    }
    var dx = (x - sh.x) / (sh.w / 2), dz = (z - sh.z) / (sh.h / 2);
    return dx * dx + dz * dz <= 1;
  }

  function shapePath(ctx, sh, wx, wz) {
    if (sh.t === 'rect') {
      ctx.rect(wx(sh.x - sh.w / 2), wz(sh.z - sh.h / 2), sh.w * PPU, sh.h * PPU);
    } else {
      ctx.ellipse(wx(sh.x), wz(sh.z), (sh.w * PPU) / 2, (sh.h * PPU) / 2, 0, 0, MM.TAU);
    }
  }

  /* ---------------- materiali ---------------- */
  var matCache = {};
  function materialTile(mat) {
    if (matCache[mat]) return matCache[mat];
    var c = document.createElement('canvas');
    c.width = c.height = 96;
    var g = c.getContext('2d');
    var r = rng(mat.length * 7717 + 13);
    var i, n;
    if (mat === 'wood') {
      g.fillStyle = '#a9713f'; g.fillRect(0, 0, 96, 96);
      for (i = 0; i < 34; i++) {
        g.strokeStyle = 'rgba(' + (90 + r() * 60 | 0) + ',' + (55 + r() * 35 | 0) + ',30,' + (0.12 + r() * 0.3) + ')';
        g.lineWidth = 0.6 + r() * 2.2;
        var y = r() * 96;
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(32, y + (r() * 7 - 3.5), 64, y + (r() * 7 - 3.5), 96, y + (r() * 5 - 2.5));
        g.stroke();
      }
      g.fillStyle = 'rgba(255,220,170,.06)';
      for (i = 0; i < 60; i++) g.fillRect(r() * 96, r() * 96, 2, 1);
    } else if (mat === 'felt') {
      g.fillStyle = '#1c7a52'; g.fillRect(0, 0, 96, 96);
      for (i = 0; i < 900; i++) {
        g.fillStyle = 'rgba(' + (10 + r() * 40 | 0) + ',' + (90 + r() * 70 | 0) + ',' + (60 + r() * 50 | 0) + ',' + (0.25 + r() * 0.4) + ')';
        g.fillRect(r() * 96, r() * 96, 1.4, 1.4);
      }
    } else if (mat === 'carpet') {
      g.fillStyle = '#c9553f'; g.fillRect(0, 0, 96, 96);
      var cols = ['#e07a5f', '#a63d2f', '#f0a05a', '#8e3b34'];
      for (i = 0; i < 420; i++) {
        g.fillStyle = cols[(r() * cols.length) | 0];
        g.globalAlpha = 0.5 + r() * 0.5;
        g.fillRect(r() * 96, r() * 96, 1 + r() * 4, 1 + r() * 2);
      }
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(255,255,255,.07)';
      for (i = 0; i < 10; i++) {
        g.beginPath(); g.moveTo(0, i * 10); g.lineTo(96, i * 10 + 3); g.stroke();
      }
    } else if (mat === 'plank') {
      g.fillStyle = '#c08a4e'; g.fillRect(0, 0, 96, 96);
      for (i = 0; i < 32; i++) {
        g.strokeStyle = 'rgba(110,70,30,' + (0.1 + r() * 0.28) + ')';
        g.lineWidth = 0.5 + r() * 1.8;
        var x = r() * 96;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() * 6 - 3), 96); g.stroke();
      }
      g.fillStyle = 'rgba(70,40,15,.35)';
      g.fillRect(0, 0, 3, 96); g.fillRect(46, 0, 2, 96); g.fillRect(93, 0, 3, 96);
    } else if (mat === 'paper') {
      g.fillStyle = '#e6dcc4'; g.fillRect(0, 0, 96, 96);
      for (i = 0; i < 260; i++) {
        g.fillStyle = 'rgba(' + (180 + r() * 60 | 0) + ',' + (170 + r() * 60 | 0) + ',' + (150 + r() * 60 | 0) + ',.5)';
        g.fillRect(r() * 96, r() * 96, 3, 1);
      }
    } else { // 'tile'
      g.fillStyle = '#d8d3c8'; g.fillRect(0, 0, 96, 96);
      g.strokeStyle = 'rgba(120,115,105,.6)'; g.lineWidth = 3;
      g.strokeRect(0, 0, 96, 96);
      g.fillStyle = 'rgba(255,255,255,.25)';
      g.fillRect(4, 4, 88, 30);
      for (i = 0; i < 100; i++) {
        g.fillStyle = 'rgba(150,145,135,.25)';
        g.fillRect(r() * 96, r() * 96, 2, 2);
      }
    }
    matCache[mat] = c;
    return c;
  }

  /* ---------------- spline Catmull-Rom chiusa ---------------- */
  function cr(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

  function buildSpline(points) {
    var n = points.length;
    var xs = [], zs = [], ws = [], br = [];
    var i, j;
    for (i = 0; i < n; i++) {
      var p0 = points[(i - 1 + n) % n], p1 = points[i],
          p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
      // lunghezza approssimata del segmento
      var len = 0, lx = p1.x, lz = p1.z;
      for (j = 1; j <= 8; j++) {
        var t = j / 8;
        var px = cr(p0.x, p1.x, p2.x, p3.x, t);
        var pz = cr(p0.z, p1.z, p2.z, p3.z, t);
        len += Math.hypot(px - lx, pz - lz);
        lx = px; lz = pz;
      }
      var steps = Math.max(2, Math.ceil(len / SAMPLE_STEP));
      for (j = 0; j < steps; j++) {
        var u = j / steps;
        xs.push(cr(p0.x, p1.x, p2.x, p3.x, u));
        zs.push(cr(p0.z, p1.z, p2.z, p3.z, u));
        ws.push(cr(p0.w, p1.w, p2.w, p3.w, u));
        br.push(!!p1.br || !!p2.br);
      }
    }
    var m = xs.length;
    var tx = new Float32Array(m), tz = new Float32Array(m);
    var nx = new Float32Array(m), nz = new Float32Array(m);
    var s = new Float32Array(m), curv = new Float32Array(m);
    var X = new Float32Array(m), Z = new Float32Array(m), W = new Float32Array(m);
    for (i = 0; i < m; i++) { X[i] = xs[i]; Z[i] = zs[i]; W[i] = ws[i]; }
    var total = 0;
    for (i = 0; i < m; i++) {
      var a = (i - 1 + m) % m, b = (i + 1) % m;
      var dx = X[b] - X[a], dz = Z[b] - Z[a];
      var dl = Math.hypot(dx, dz) || 1;
      tx[i] = dx / dl; tz[i] = dz / dl;
      nx[i] = -tz[i]; nz[i] = tx[i];
      if (i > 0) total += Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]);
      s[i] = total;
    }
    var closeLen = Math.hypot(X[0] - X[m - 1], Z[0] - Z[m - 1]);
    total += closeLen;
    // curvatura: variazione d'angolo per unità di arco
    for (i = 0; i < m; i++) {
      var b2 = (i + 1) % m;
      var ang = Math.abs(MM.wrapAngle(Math.atan2(tz[b2], tx[b2]) - Math.atan2(tz[i], tx[i])));
      var seg = Math.hypot(X[b2] - X[i], Z[b2] - Z[i]) || 0.01;
      curv[i] = ang / seg;
    }
    // smussa la curvatura
    var sm = new Float32Array(m), win = 5;
    for (i = 0; i < m; i++) {
      var acc = 0, cnt = 0;
      for (j = -win; j <= win; j++) { var k = (i + j + m) % m; acc += curv[k]; cnt++; }
      sm[i] = acc / cnt;
    }
    return {
      x: X, z: Z, w: W, br: br, tx: tx, tz: tz, nx: nx, nz: nz,
      s: s, curv: sm, length: total, count: m
    };
  }

  function posAt(sp, s) {
    var L = sp.length;
    s = ((s % L) + L) % L;
    var arr = sp.s, lo = 0, hi = sp.count - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (arr[mid] <= s) lo = mid; else hi = mid - 1;
    }
    var i = lo, b = (i + 1) % sp.count;
    var segLen = (i === sp.count - 1 ? L : arr[b]) - arr[i];
    var t = segLen > 0 ? (s - arr[i]) / segLen : 0;
    return {
      x: MM.lerp(sp.x[i], sp.x[b], t),
      z: MM.lerp(sp.z[i], sp.z[b], t),
      nx: MM.lerp(sp.nx[i], sp.nx[b], t),
      nz: MM.lerp(sp.nz[i], sp.nz[b], t),
      tx: MM.lerp(sp.tx[i], sp.tx[b], t),
      tz: MM.lerp(sp.tz[i], sp.tz[b], t),
      halfW: MM.lerp(sp.w[i], sp.w[b], t) / 2,
      i: i, br: sp.br[i] || sp.br[b]
    };
  }

  function nearest(sp, x, z, hint) {
    var m = sp.count, best = -1, bestD = Infinity;
    var start = 0, end = m;
    if (hint >= 0) {
      start = hint - 36; end = hint + 36;
      var found = false, fd = Infinity, fi = -1;
      for (var k = start; k < end; k++) {
        var kk = ((k % m) + m) % m;
        var d = MM.dist2(x, z, sp.x[kk], sp.z[kk]);
        if (d < fd) { fd = d; fi = kk; }
      }
      // se il campione vicino al hint è plausibile usalo (continuità)
      if (fi >= 0 && fd < 100) { best = fi; bestD = fd; found = true; }
      if (!found) { start = 0; end = m; }
    }
    if (best < 0) {
      for (var i = 0; i < m; i++) {
        var dd = MM.dist2(x, z, sp.x[i], sp.z[i]);
        if (dd < bestD) { bestD = dd; best = i; }
      }
    }
    var dx = x - sp.x[best], dz = z - sp.z[best];
    var lat = dx * sp.nx[best] + dz * sp.nz[best];
    return { i: best, s: sp.s[best], lat: lat, d: Math.sqrt(bestD) };
  }

  /* ---------------- maschera di solidità ---------------- */
  function buildMask(def, bounds) {
    var cell = 0.5;
    var gw = Math.ceil((bounds.x1 - bounds.x0) / cell) + 1;
    var gh = Math.ceil((bounds.z1 - bounds.z0) / cell) + 1;
    var grid = new Uint8Array(gw * gh);
    var i, j;
    for (j = 0; j < gh; j++) {
      var z = bounds.z0 + j * cell;
      for (i = 0; i < gw; i++) {
        var x = bounds.x0 + i * cell;
        var v = 0;
        for (var k = 0; k < def.surfaces.length; k++) {
          if (shapeHit(def.surfaces[k], x, z)) { v = 1; break; }
        }
        if (v) {
          for (var h = 0; h < def.holes.length; h++) {
            if (shapeHit(def.holes[h], x, z)) { v = 0; break; }
          }
        }
        grid[j * gw + i] = v;
      }
    }
    return {
      grid: grid, gw: gw, gh: gh, x0: bounds.x0, z0: bounds.z0, cell: cell,
      solid: function (x, z) {
        var i = ((x - this.x0) / this.cell) | 0;
        var j = ((z - this.z0) / this.cell) | 0;
        if (i < 0 || j < 0 || i >= this.gw || j >= this.gh) return false;
        return this.grid[j * this.gw + i] === 1;
      }
    };
  }

  /* ---------------- sfondo (panorama della stanza) ---------------- */
  function bakeSky(def) {
    var W = 1024, H = 256;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');
    var r = rng(def.seed + 99);
    var i;
    if (def.sky === 'cucina') {
      var gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#efe6d4'); gr.addColorStop(1, '#d9cdb4');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      // piastrelle
      g.strokeStyle = 'rgba(150,140,120,.5)'; g.lineWidth = 2;
      for (i = 0; i <= W; i += 64) { g.beginPath(); g.moveTo(i, 40); g.lineTo(i, H); g.stroke(); }
      for (i = 40; i <= H; i += 44) { g.beginPath(); g.moveTo(0, i); g.lineTo(W, i); g.stroke(); }
      // finestra
      g.fillStyle = '#9fd4e8'; g.fillRect(300, 34, 240, 130);
      g.fillStyle = '#cdeaf4'; g.fillRect(300, 34, 240, 60);
      g.fillStyle = '#7ab55f'; g.fillRect(300, 132, 240, 32);
      g.strokeStyle = '#f3ead8'; g.lineWidth = 10;
      g.strokeRect(300, 34, 240, 130);
      g.beginPath(); g.moveTo(420, 34); g.lineTo(420, 164); g.moveTo(300, 100); g.lineTo(540, 100); g.stroke();
      // pensilera
      g.fillStyle = '#8c5a33'; g.fillRect(640, 20, 300, 92);
      g.fillStyle = '#a5714a'; g.fillRect(640, 20, 300, 16);
      g.fillStyle = '#d9c9a8'; g.fillRect(700, 44, 40, 50); g.fillRect(790, 44, 40, 50);
      g.strokeStyle = '#6d4324'; g.lineWidth = 4;
      g.strokeRect(640, 20, 300, 92);
      // mazzetta di cucchiai appesi
      g.fillStyle = '#c0c6cc';
      for (i = 0; i < 6; i++) { g.fillRect(960 + i * 8, 40, 5, 70); g.beginPath(); g.ellipse(962 + i * 8, 116, 7, 11, 0, 0, MM.TAU); g.fill(); }
    } else if (def.sky === 'biliardo') {
      var g2 = g.createLinearGradient(0, 0, 0, H);
      g2.addColorStop(0, '#243026'); g2.addColorStop(1, '#3c4a3a');
      g.fillStyle = g2; g.fillRect(0, 0, W, H);
      g.fillStyle = '#1a221b'; g.fillRect(0, H - 54, W, 54);
      g.fillStyle = '#57412c'; g.fillRect(0, H - 58, W, 6);
      // quadri
      for (i = 0; i < 5; i++) {
        var qx = 90 + i * 190;
        g.fillStyle = '#7a5a2e'; g.fillRect(qx, 46, 96, 76);
        g.fillStyle = i % 2 ? '#2c3f56' : '#56322c'; g.fillRect(qx + 8, 54, 80, 60);
        g.fillStyle = 'rgba(255,240,200,.18)'; g.fillRect(qx + 8, 54, 80, 22);
      }
      // lampada
      g.fillStyle = '#1f1b16'; g.fillRect(490, 0, 8, 26);
      g.beginPath(); g.moveTo(440, 26); g.lineTo(548, 26); g.lineTo(524, 58); g.lineTo(464, 58); g.closePath();
      g.fillStyle = '#2e6b4f'; g.fill();
      var lg = g.createRadialGradient(494, 66, 6, 494, 66, 210);
      lg.addColorStop(0, 'rgba(255,236,170,.55)'); lg.addColorStop(1, 'rgba(255,236,170,0)');
      g.fillStyle = lg; g.fillRect(280, 40, 430, 216);
    } else { // stanzino
      var g3 = g.createLinearGradient(0, 0, 0, H);
      g3.addColorStop(0, '#f6e7a6'); g3.addColorStop(1, '#e9d383');
      g.fillStyle = g3; g.fillRect(0, 0, W, H);
      g.fillStyle = '#c9a15c'; g.fillRect(0, H - 46, W, 46);
      g.fillStyle = '#a97f42'; g.fillRect(0, H - 50, W, 6);
      // poster
      function poster(x, y, w, h, col) {
        g.fillStyle = '#fffaf0'; g.fillRect(x, y, w, h);
        g.fillStyle = col; g.fillRect(x + 6, y + 6, w - 12, h - 24);
        g.strokeStyle = '#333'; g.lineWidth = 3; g.strokeRect(x, y, w, h);
      }
      poster(120, 40, 120, 96, '#e8452f');
      poster(700, 52, 96, 120, '#2f6fed');
      poster(840, 44, 130, 84, '#1f9d6b');
      // stelline
      g.fillStyle = '#ffc93c';
      for (i = 0; i < 26; i++) {
        var sx = r() * W, sy = 8 + r() * 90, sz = 4 + r() * 5;
        g.beginPath();
        for (var q = 0; q < 5; q++) {
          var ang = -Math.PI / 2 + q * (MM.TAU / 5);
          g[q ? 'lineTo' : 'moveTo'](sx + Math.cos(ang) * sz, sy + Math.sin(ang) * sz);
          g.lineTo(sx + Math.cos(ang + MM.TAU / 10) * sz * 0.45, sy + Math.sin(ang + MM.TAU / 10) * sz * 0.45);
        }
        g.closePath(); g.fill();
      }
      // menicolo con cubetti
      g.fillStyle = '#b98a52'; g.fillRect(430, 150, 210, 14);
      var cols = ['#e8452f', '#2f6fed', '#ffc93c', '#1f9d6b'];
      for (i = 0; i < 5; i++) {
        g.fillStyle = cols[i % 4];
        g.fillRect(444 + i * 40, 150 - 26, 30, 26);
      }
    }
    return c;
  }

  /* ---------------- arte della texture del tavolo ---------------- */
  function bakeGround(def, bounds, sp) {
    var W = Math.round((bounds.x1 - bounds.x0) * PPU);
    var H = Math.round((bounds.z1 - bounds.z0) * PPU);
    function wx(x) { return (x - bounds.x0) * PPU; }
    function wz(z) { return (z - bounds.z0) * PPU; }

    // ---- piano base: pavimento della stanza (fuori dal tavolo) ----
    var voidC = document.createElement('canvas'); voidC.width = W; voidC.height = H;
    var v = voidC.getContext('2d');
    var vg = v.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, H * 0.85);
    vg.addColorStop(0, '#241c26'); vg.addColorStop(1, '#0e0a13');
    v.fillStyle = vg; v.fillRect(0, 0, W, H);
    v.strokeStyle = 'rgba(255,255,255,.045)'; v.lineWidth = 2;
    var tilePx = 4 * PPU;
    for (var gx = 0; gx < W; gx += tilePx) { v.beginPath(); v.moveTo(gx, 0); v.lineTo(gx, H); v.stroke(); }
    for (var gz = 0; gz < H; gz += tilePx) { v.beginPath(); v.moveTo(0, gz); v.lineTo(W, gz); v.stroke(); }

    // ---- maschera alfa: superfici meno i fori ----
    var maskC = document.createElement('canvas'); maskC.width = W; maskC.height = H;
    var mk = maskC.getContext('2d');
    mk.fillStyle = '#fff';
    var i;
    for (i = 0; i < def.surfaces.length; i++) {
      mk.save(); mk.beginPath(); shapePath(mk, def.surfaces[i], wx, wz); mk.fill(); mk.restore();
    }
    mk.globalCompositeOperation = 'destination-out';
    for (i = 0; i < def.holes.length; i++) {
      mk.save(); mk.beginPath(); shapePath(mk, def.holes[i], wx, wz); mk.fill(); mk.restore();
    }
    mk.globalCompositeOperation = 'source-over';

    // ---- contenuto: materiali, strada, pericoli ----
    var con = document.createElement('canvas'); con.width = W; con.height = H;
    var c = con.getContext('2d');

    // ombra del tavolo sul pavimento (prima, sul vuoto)
    v.save();
    v.shadowColor = 'rgba(0,0,0,.85)'; v.shadowBlur = 26 * (PPU / 24); v.shadowOffsetX = 8; v.shadowOffsetY = 14;
    v.fillStyle = '#000';
    for (i = 0; i < def.surfaces.length; i++) { v.beginPath(); shapePath(v, def.surfaces[i], wx, wz); v.fill(); }
    v.restore();

    for (i = 0; i < def.surfaces.length; i++) {
      var sh = def.surfaces[i];
      c.save();
      c.beginPath(); shapePath(c, sh, wx, wz);
      c.clip();
      var tile = materialTile(sh.mat);
      var pat = c.createPattern(tile, 'repeat');
      c.fillStyle = pat;
      c.save();
      c.translate(wx(sh.x) - (sh.w * PPU) / 2, wz(sh.z) - (sh.h * PPU) / 2);
      var ms = PPU / 96 * (sh.t === 'rect' ? 1.6 : 1.2);
      c.scale(ms, ms);
      c.fillRect(0, 0, (sh.w * PPU) / ms, (sh.h * PPU) / ms);
      c.restore();
      // bordo interno
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 5;
      c.beginPath(); shapePath(c, sh, wx, wz); c.stroke();
      c.restore();
    }

    // ---- strada: nastro adesivo (tratto continuo; la maschera ritaglia il vuoto) ----
    var idxs = [];
    for (i = 0; i < sp.count; i++) idxs.push(i);
    idxs.push(0); // chiude il giro

    var avgW = 0;
    for (i = 0; i < sp.count; i++) avgW += sp.w[i];
    avgW /= sp.count;

    function centerlinePath() {
      c.beginPath();
      c.moveTo(wx(sp.x[idxs[0]]), wz(sp.z[idxs[0]]));
      for (var k = 1; k < idxs.length; k++) c.lineTo(wx(sp.x[idxs[k]]), wz(sp.z[idxs[k]]));
    }

    function paintRoad() {
      var k;
      // ombra sottile sotto il nastro
      c.save();
      c.translate(2, 5);
      c.lineJoin = 'round'; c.lineCap = 'round';
      c.strokeStyle = 'rgba(0,0,0,.32)';
      c.lineWidth = avgW * PPU;
      centerlinePath();
      c.stroke();
      c.restore();

      // nastro a larghezza variabile: prima il bordo scuro a piena larghezza,
      // poi il riquadro chiaro rientrato di insetPx — così le sovrapposizioni
      // del nastro (hairpin stretti) restano uniformi, senza linee che
      // tagliano la strada come succedeva con lo stroke del contorno.
      function ribbonPath(insetPx) {
        var ins = insetPx / PPU;
        c.beginPath();
        for (k = 0; k < idxs.length; k++) {
          var ii = idxs[k];
          var hw = sp.w[ii] / 2 - ins;
          if (hw < 0.03) hw = 0.03;
          c[k ? 'lineTo' : 'moveTo'](
            wx(sp.x[ii] + sp.nx[ii] * hw),
            wz(sp.z[ii] + sp.nz[ii] * hw));
        }
        for (k = idxs.length - 1; k >= 0; k--) {
          var jj = idxs[k];
          var hw2 = sp.w[jj] / 2 - ins;
          if (hw2 < 0.03) hw2 = 0.03;
          c.lineTo(wx(sp.x[jj] - sp.nx[jj] * hw2), wz(sp.z[jj] - sp.nz[jj] * hw2));
        }
        c.closePath();
      }
      c.save();
      c.fillStyle = '#413728';
      ribbonPath(0);
      c.fill();
      c.fillStyle = '#efe7d4';
      ribbonPath(2.5);
      c.fill();
      c.restore();

      // striscia centrale tratteggiata
      c.save();
      c.setLineDash([17, 15]);
      c.lineCap = 'butt';
      c.strokeStyle = 'rgba(240,180,40,.9)';
      c.lineWidth = 4.5;
      centerlinePath();
      c.stroke();
      c.restore();

      // segni d'uso sul nastro
      var r = rng(def.seed + 5);
      c.save();
      c.globalAlpha = 0.1;
      c.strokeStyle = '#4a3f30';
      for (k = 0; k < 26; k++) {
        var si = idxs[(r() * (idxs.length - 1)) | 0];
        var ox = wx(sp.x[si]) + (r() * 2 - 1) * sp.w[si] * PPU * 0.4;
        var oz = wz(sp.z[si]) + (r() * 2 - 1) * sp.w[si] * PPU * 0.4;
        c.lineWidth = 1 + r() * 3;
        c.beginPath();
        c.moveTo(ox, oz);
        c.lineTo(ox + (r() * 2 - 1) * 14, oz + (r() * 2 - 1) * 14);
        c.stroke();
      }
      c.restore();
    }

    paintRoad();

    // ---- linea di partenza ----
    var p0 = posAt(sp, 0);
    c.save();
    c.translate(wx(p0.x), wz(p0.z));
    c.rotate(Math.atan2(p0.tz, p0.tx));
    var rw = p0.halfW * 2 * PPU, rh = 1.1 * PPU, cellP = 0.275 * PPU;
    for (var bz = 0; bz < 4; bz++) {
      for (var bx = 0; bx * cellP < rw; bx++) {
        c.fillStyle = (bx + bz) % 2 ? '#1b1720' : '#f7efe1';
        c.fillRect(-rh / 2 + bz * (rh / 4), -rw / 2 + bx * cellP, rh / 4 + 0.6, cellP + 0.6);
      }
    }
    c.restore();

    // ---- pericoli dipinti (pozzanghere, olio) ----
    for (i = 0; i < def.hazards.length; i++) {
      var hz = def.hazards[i];
      paintHazard(c, wx, wz, hz);
    }

    // ---- ritaglia sul solido ----
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(maskC, 0, 0);
    c.globalCompositeOperation = 'source-over';

    // ---- composita ----
    var out = document.createElement('canvas'); out.width = W; out.height = H;
    var o = out.getContext('2d');
    o.drawImage(voidC, 0, 0);
    o.drawImage(con, 0, 0);
    // riquadro dell'area utile (solo per riferimento nel preview)
    return out;
  }

  function paintHazard(c, wx, wz, hz) {
    var x = wx(hz.x), y = wz(hz.z), r = hz.r * PPU;
    var g = c.createRadialGradient(x, y, r * 0.15, x, y, r);
    if (hz.k === 'oil') {
      g.addColorStop(0, 'rgba(20,16,24,.92)');
      g.addColorStop(0.7, 'rgba(30,24,38,.75)');
      g.addColorStop(1, 'rgba(40,32,54,0)');
      c.fillStyle = g;
      c.beginPath();
      var rr = rng((hz.x * 31 + hz.z * 17) | 0);
      for (var a = 0; a <= 22; a++) {
        var ang = a / 22 * MM.TAU;
        var rad = r * (0.75 + 0.35 * Math.sin(ang * 3 + hz.x) + rr() * 0.12);
        var px = x + Math.cos(ang) * rad, py = y + Math.sin(ang) * rad;
        if (a === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath(); c.fill();
      c.fillStyle = 'rgba(120,180,255,.22)';
      c.beginPath(); c.ellipse(x - r * 0.25, y - r * 0.2, r * 0.3, r * 0.16, -0.5, 0, MM.TAU); c.fill();
    } else { // acqua
      g.addColorStop(0, 'rgba(140,190,235,.55)');
      g.addColorStop(0.75, 'rgba(120,175,225,.42)');
      g.addColorStop(1, 'rgba(120,175,225,0)');
      c.fillStyle = g;
      c.beginPath();
      var rr2 = rng((hz.z * 41 + hz.x * 7) | 0);
      for (var a2 = 0; a2 <= 22; a2++) {
        var an = a2 / 22 * MM.TAU;
        var rd = r * (0.8 + 0.3 * Math.sin(an * 2.5 + hz.z) + rr2() * 0.1);
        var pxx = x + Math.cos(an) * rd, pyy = y + Math.sin(an) * rd;
        if (a2 === 0) c.moveTo(pxx, pyy); else c.lineTo(pxx, pyy);
      }
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, r * 0.55, 3.4, 5.2); c.stroke();
    }
  }

  /* ---------------- definizioni ---------------- */
  var DEFS = [
    {
      id: 'cucina',
      name: 'Tavolo della cucina',
      sub: 'noce lucido, olio e un bicchiere sul percorso',
      diff: 2,
      seed: 20030411,
      sky: 'cucina',
      music: 45,
      fog: '#2b2430',
      bounds: { x0: -24, z0: -18, x1: 24, z1: 18 },
      surfaces: [
        { t: 'rect', x: -4.5, z: 0, w: 35, h: 30, mat: 'wood' },    // tavolo
        { t: 'rect', x: 18, z: 0, w: 6, h: 22, mat: 'wood' },        // tagliere
        { t: 'rect', x: 14, z: -5.5, w: 4.4, h: 3.4, mat: 'plank' }, // ponte 1 (mattarello)
        { t: 'rect', x: 14, z: 5.5, w: 4.4, h: 3.4, mat: 'plank' }   // ponte 2
      ],
      holes: [
        { t: 'rect', x: -16.5, z: 10.5, w: 11, h: 9 }                // angolo mancante
      ],
      points: [
        { x: -15, z: -10.5, w: 2.8 },
        { x: -5, z: -11.5, w: 2.8 },
        { x: 5, z: -11, w: 2.6 },
        { x: 11, z: -8.5, w: 2.4 },
        { x: 13.8, z: -5.5, w: 2.0, br: 1 },
        { x: 17.5, z: -7, w: 2.4 },
        { x: 18.5, z: -1, w: 2.4 },
        { x: 18, z: 5, w: 2.4 },
        { x: 17, z: 8.5, w: 2.2 },
        { x: 16.2, z: 5.6, w: 2.0, br: 1 },
        { x: 14, z: 5.5, w: 2.0, br: 1 },
        { x: 11, z: 5.5, w: 2.4 },
        { x: 4, z: 4.6, w: 2.6 },
        { x: -4, z: 4.6, w: 2.6 },
        { x: -10, z: 4.6, w: 2.6 },
        { x: -16, z: 4.6, w: 2.6 },
        { x: -19.5, z: 1, w: 2.6 },
        { x: -19, z: -6, w: 2.6 }
      ],
      hazards: [
        { x: 0, z: -11.2, k: 'oil', r: 1.5 },
        { x: -19.2, z: -2.5, k: 'water', r: 1.4 },
        { x: 11, z: 5.5, k: 'oil', r: 1.1 },
        { x: 18.4, z: 2, k: 'water', r: 1.3 }
      ],
      decor: [
        { k: 'mug', x: -7.5, z: -4.5, s: 1.15 },
        { k: 'ball', x: 0.5, z: -6, s: 1.1, c: '#ff8c42' },     // arancia
        { k: 'box', x: 6, z: -3, s: 1, w: 1.1, h: 1.5, d: 1.1, c: '#efe7d4' },  // sale
        { k: 'bar', x: 2.5, z: 0.6, yaw: 0.35, s: 1, w: 0.22, h: 0.16, d: 4.6, c: '#c8ccd4' },
        { k: 'box', x: -13, z: -1, s: 1, w: 1.4, h: 0.5, d: 1.9, c: '#e0d3b4' },
        { k: 'ball', x: -11, z: 7.5, s: 0.9, c: '#ffd166' },    // limone
        { k: 'box', x: 4.5, z: 9.5, s: 1, w: 2.2, h: 0.6, d: 3, c: '#d8c79b' },  // tovagliolo
        { k: 'crumb', x: -3, z: -7.6, s: 1 },
        { k: 'crumb', x: -5, z: -6.4, s: 0.8 },
        { k: 'crumb', x: 1.5, z: 8, s: 1.1 },
        { k: 'box', x: 20.3, z: -4, s: 1, w: 1.2, h: 1.2, d: 1.2, c: '#f2b134' },
        { k: 'ball', x: 19.4, z: 8.4, s: 0.85, c: '#7ac74f' }
      ],
      gen: { obstacles: 9, pickups: 12, hazards: 3, kinds: ['crumb', 'box', 'ball', 'mug'] }
    },

    {
      id: 'biliardo',
      name: 'Tavolo da biliardo',
      sub: 'panna, sei buche e le cue lasciate lì',
      diff: 3,
      seed: 77123,
      sky: 'biliardo',
      music: 42,
      fog: '#1d2a22',
      bounds: { x0: -25, z0: -19, x1: 25, z1: 19 },
      surfaces: [
        { t: 'rect', x: 0, z: 0, w: 40, h: 28, mat: 'felt' }
      ],
      holes: [
        { t: 'circle', x: -17.5, z: -11.5, w: 4.6, h: 4.6 },
        { t: 'circle', x: 17.5, z: -11.5, w: 4.6, h: 4.6 },
        { t: 'circle', x: -17.5, z: 11.5, w: 4.6, h: 4.6 },
        { t: 'circle', x: 17.5, z: 11.5, w: 4.6, h: 4.6 },
        { t: 'circle', x: 0, z: -13, w: 4.2, h: 4.2 },
        { t: 'circle', x: 0, z: 13, w: 4.2, h: 4.2 }
      ],
      points: [
        { x: -13, z: -10, w: 2.8 },
        { x: -4, z: -11, w: 2.8 },
        { x: 3, z: -8.5, w: 2.6 },
        { x: 9, z: -10.5, w: 2.6 },
        { x: 15, z: -6, w: 2.4 },
        { x: 16.5, z: 0, w: 2.4 },
        { x: 15, z: 6, w: 2.4 },
        { x: 8, z: 10.5, w: 2.6 },
        { x: 1, z: 8.5, w: 2.6 },
        { x: -6, z: 10.5, w: 2.6 },
        { x: -13, z: 7, w: 2.4 },
        { x: -17, z: 1, w: 2.4 },
        { x: -17.5, z: -5.5, w: 2.4 },
        { x: -15, z: -9, w: 2.4 }
      ],
      hazards: [
        { x: 3, z: -8.5, k: 'oil', r: 1.4 },
        { x: -6, z: 10.5, k: 'water', r: 1.3 },
        { x: 16.4, z: 0, k: 'oil', r: 1.3 }
      ],
      decor: [
        // triangolo di biglie al centro
        { k: 'ball', x: -1.6, z: -0.9, s: 1, c: '#f4d03f' },
        { k: 'ball', x: -1.6, z: 0.9, s: 1, c: '#3498db' },
        { k: 'ball', x: 0, z: -1.8, s: 1, c: '#e74c3c' },
        { k: 'ball', x: 0, z: 0, s: 1, c: '#8e44ad' },
        { k: 'ball', x: 0, z: 1.8, s: 1, c: '#e67e22' },
        { k: 'ball', x: 1.6, z: -2.7, s: 1, c: '#1abc9c' },
        { k: 'ball', x: 1.6, z: -0.9, s: 1, c: '#2c3e50' },
        { k: 'ball', x: 1.6, z: 0.9, s: 1, c: '#27ae60' },
        { k: 'ball', x: 1.6, z: 2.7, s: 1, c: '#c0392b' },
        { k: 'ball', x: 3.2, z: -1.8, s: 1, c: '#f39c12' },
        { k: 'ball', x: 3.2, z: 0, s: 1, c: '#9b59b6' },
        { k: 'ball', x: 3.2, z: 1.8, s: 1, c: '#ecf0f1' },
        { k: 'bar', x: -6, z: -3.5, yaw: 1.15, s: 1, w: 0.16, h: 0.16, d: 9.5, c: '#c9a26b' },
        { k: 'bar', x: -5.4, z: -2.6, yaw: 1.0, s: 1, w: 0.16, h: 0.16, d: 9.5, c: '#b98f5e' },
        { k: 'box', x: 7.5, z: 4, s: 1, w: 0.7, h: 0.7, d: 0.7, c: '#5dade2' },
        { k: 'ball', x: -10, z: -4.5, s: 1, c: '#f1c40f' },
        { k: 'ball', x: -9, z: 5.5, s: 1, c: '#e84393' }
      ],
      gen: { obstacles: 10, pickups: 12, hazards: 3, kinds: ['ball', 'box', 'crumb'] }
    },

    {
      id: 'stanzino',
      name: 'Stanzino dei bambini',
      sub: 'tappeto, mattoncini e un ponte di libro',
      diff: 1,
      seed: 5150,
      sky: 'stanzino',
      music: 48,
      fog: '#2a2028',
      bounds: { x0: -25, z0: -18, x1: 26, z1: 18 },
      surfaces: [
        { t: 'rect', x: -6.5, z: 0, w: 29, h: 28, mat: 'carpet' },   // tappeto
        { t: 'rect', x: 16.5, z: 0, w: 9, h: 20, mat: 'paper' },      // scatola dei giocattoli
        { t: 'rect', x: 10, z: -1.2, w: 6.5, h: 6.8, mat: 'paper' },     // ponte libro
        { t: 'rect', x: 10, z: 7, w: 6.5, h: 4.4, mat: 'paper' }      // ponte libro 2
      ],
      holes: [
        { t: 'rect', x: -18, z: -11, w: 6, h: 5.5 }
      ],
      points: [
        { x: -14, z: -4, w: 2.6 },
        { x: -11, z: -9.5, w: 2.6 },
        { x: -3, z: -11, w: 2.8 },
        { x: 5, z: -9, w: 2.6 },
        { x: 8.6, z: -3.5, w: 2.2 },
        { x: 10, z: 0, w: 2.2, br: 1 },
        { x: 14, z: 0, w: 2.4 },
        { x: 17, z: -5, w: 2.4 },
        { x: 17.5, z: 3, w: 2.4 },
        { x: 15.5, z: 8, w: 2.4 },
        { x: 11.5, z: 7, w: 2.2, br: 1 },
        { x: 8, z: 7, w: 2.4 },
        { x: 2, z: 9, w: 2.6 },
        { x: -5, z: 10, w: 2.6 },
        { x: -12, z: 8, w: 2.6 },
        { x: -17, z: 5, w: 2.6 },
        { x: -19, z: -1, w: 2.6 },
        { x: -18, z: -5, w: 2.6 },
        { x: -14, z: -6.5, w: 2.6 }
      ],
      hazards: [
        { x: -3, z: -11, k: 'oil', r: 1.5 },
        { x: -12, z: 8, k: 'water', r: 1.4 },
        { x: 17.4, z: -2, k: 'oil', r: 1.2 }
      ],
      decor: [
        { k: 'box', x: -7, z: -1.5, s: 1, w: 2.4, h: 1.4, d: 1.4, c: '#e8452f' },
        { k: 'box', x: -7, z: -1.5, y: 1.4, s: 1, w: 1.5, h: 1.4, d: 1.5, c: '#2f6fed' },
        { k: 'box', x: -4, z: 1.5, s: 1, w: 1.4, h: 2.6, d: 1.4, c: '#ffc93c' },
        { k: 'box', x: -10.5, z: 3, s: 1, w: 1.6, h: 1.6, d: 1.6, c: '#1f9d6b' },
        { k: 'bar', x: -2, z: 4.5, yaw: 0.5, s: 1, w: 0.28, h: 0.28, d: 3.4, c: '#e8452f' },
        { k: 'bar', x: -1.2, z: 5.2, yaw: 0.8, s: 1, w: 0.28, h: 0.28, d: 3.4, c: '#2f6fed' },
        { k: 'bar', x: -2.8, z: 5.6, yaw: 1.4, s: 1, w: 0.28, h: 0.28, d: 3.4, c: '#ffc93c' },
        { k: 'ball', x: -15, z: 0.5, s: 1.3, c: '#ff6b9d' },
        { k: 'box', x: 3, z: -4, s: 1, w: 1.8, h: 1.8, d: 1.8, c: '#f2b134' },
        { k: 'box', x: 19.5, z: -1, s: 1, w: 1.4, h: 1.2, d: 1.8, c: '#7ac74f' },
        { k: 'ball', x: 17.6, z: -7.5, s: 1.1, c: '#4ecdc4' },
        { k: 'crumb', x: -9, z: -6, s: 1.4 },
        { k: 'crumb', x: 6, z: 5.5, s: 1.2 }
      ],
      gen: { obstacles: 9, pickups: 12, hazards: 3, kinds: ['box', 'ball', 'crumb'] }
    }
  ];

  /* ---------------- ostacoli/oggetti generati dalla pista ---------------- */
  function generateEntities(track) {
    var sp = track.spline, def = track.def;
    var r = rng(def.seed);
    var gen = def.gen;
    var i;

    // ostacoli sulla strada
    var used = [];
    var tries = 0;
    var made = 0;
    while (made < gen.obstacles && tries < 400) {
      tries++;
      var ss = 16 + r() * (sp.length - 26);
      var p = posAt(sp, ss);
      if (p.br) continue;
      if (p.halfW < 1.15) continue;
      var ok = true;
      for (i = 0; i < used.length; i++) if (Math.abs(used[i] - ss) < 4.5) { ok = false; break; }
      if (!ok) continue;
      used.push(ss);
      var lat = (r() * 2 - 1) * p.halfW * 0.66;
      var kind = gen.kinds[(r() * gen.kinds.length) | 0];
      var props = makeProp(kind, {
        x: p.x + p.nx * lat,
        z: p.z + p.nz * lat,
        yaw: r() * MM.TAU,
        s: 0.75 + r() * 0.5,
        c: pickColor(r, kind)
      }, track);
      props.obstacle = true;
      props.s = ss;
      track.props.push(props);
      made++;
    }

    // oggetti da raccogliere
    for (i = 0; i < gen.pickups; i++) {
      var ps = (i + 0.5) * (sp.length / gen.pickups);
      var pp = posAt(sp, ps);
      if (pp.br) continue;
      var lat2 = ((i % 2) ? 1 : -1) * pp.halfW * 0.5;
      track.pickups.push({
        x: pp.x + pp.nx * lat2,
        z: pp.z + pp.nz * lat2,
        active: true, t: 0, s: ps, spin: r() * MM.TAU
      });
    }

    // pericoli generati (oltre a quelli fissi)
    for (i = 0; i < gen.hazards; i++) {
      var hs = r() * sp.length;
      var hp = posAt(sp, hs);
      if (hp.br) continue;
      var hl = (r() * 2 - 1) * hp.halfW * 0.5;
      track.hazardsDyn.push({
        x: hp.x + hp.nx * hl, z: hp.z + hp.nz * hl,
        k: r() < 0.55 ? 'oil' : 'water',
        r: 1.1 + r() * 0.6
      });
    }
  }

  function pickColor(r, kind) {
    if (kind === 'ball') return ['#f4d03f', '#3498db', '#e74c3c', '#8e44ad', '#e67e22', '#1abc9c'][(r() * 6) | 0];
    if (kind === 'mug') return '#f7efe1';
    if (kind === 'crumb') return '#d8b883';
    if (kind === 'bar') return ['#e8452f', '#2f6fed', '#ffc93c'][(r() * 3) | 0];
    return ['#e8452f', '#2f6fed', '#ffc93c', '#1f9d6b', '#f7efe1'][(r() * 5) | 0];
  }

  function makeProp(kind, o, track) {
    var p = { k: kind, x: o.x, z: o.z, y: o.y || 0, yaw: o.yaw || 0, c: o.c || '#e8452f', s: o.s || 1 };
    var r = 0.5;
    if (kind === 'box') {
      p.w = (o.w || 1.2) * p.s; p.h = (o.h || 1.2) * p.s; p.d = (o.d || 1.2) * p.s;
      r = Math.max(p.w, p.d) * 0.5;
    } else if (kind === 'bar') {
      p.w = (o.w || 0.3) * p.s; p.h = (o.h || 0.3) * p.s; p.d = (o.d || 3) * p.s;
      r = Math.max(p.w, p.d) * 0.42;
    } else if (kind === 'ball') {
      p.r = (o.rad || 0.55) * p.s; r = p.r;
    } else if (kind === 'mug') {
      p.r = 0.62 * p.s; r = p.r;
    } else if (kind === 'crumb') {
      p.w = 0.5 * p.s; p.h = 0.32 * p.s; p.d = 0.44 * p.s;
      r = 0.3 * p.s;
    } else if (kind === 'lego') {
      p.w = 1.6 * p.s; p.h = 0.7 * p.s; p.d = 1.0 * p.s;
      r = 0.85 * p.s;
    }
    p.cr = r;
    p.kind = kind;
    return p;
  }

  /* ---------------- costruzione ---------------- */
  MM.buildTrack = function (def) {
    var sp = buildSpline(def.points);
    var track = {
      def: def,
      spline: sp,
      length: sp.length,
      props: [],
      pickups: [],
      hazards: def.hazards.slice(),
      hazardsDyn: []
    };
    track.posAt = function (s) { return posAt(sp, s); };
    track.nearest = function (x, z, hint) { return nearest(sp, x, z, hint); };
    track.curvAt = function (i) { return sp.curv[i]; };

    track.mask = buildMask(def, def.bounds);
    track.solid = function (x, z) { return track.mask.solid(x, z); };

    var groundCanvas = bakeGround(def, def.bounds, sp);
    track.groundCanvas = groundCanvas;
    track.ground = MM.pixelView(groundCanvas);

    var skyCanvas = bakeSky(def);
    track.skyCanvas = skyCanvas;
    track.sky = MM.pixelView(skyCanvas);
    return track;
  };

  MM.finalizeTrack = function (track) {
    generateEntities(track);
    // validazione: il centro della strada deve essere sempre solido
    var sp = track.spline, bad = 0, badPos = [];
    for (var i = 0; i < sp.count; i += 4) {
      if (!track.solid(sp.x[i], sp.z[i])) {
        bad++;
        if (badPos.length < 6) badPos.push(sp.x[i].toFixed(1) + ',' + sp.z[i].toFixed(1));
      }
    }
    track.valid = bad === 0;
    if (!track.valid) {
      console.warn('Pista "' + track.def.id + '": ' + bad + ' campioni non solidi → ' + badPos.join(' | '));
    }
    return track;
  };

  MM.trackDefs = DEFS;
})();
