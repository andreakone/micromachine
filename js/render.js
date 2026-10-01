/* render — motore pseudo-3D: terreno per-pixel in prospettiva (stile Mode-7),
   ombre quadrate, billboard e box a facce piene con ordinamento painter's.
   Tutto nel buffer interno 640×360. */
(function () {
  'use strict';
  var MM = (window.MM = window.MM || {});
  var clamp = MM.clamp;

  var LIGHT = (function () {
    var l = [-0.42, 0.80, -0.43];
    var m = Math.hypot(l[0], l[1], l[2]);
    return [l[0] / m, l[1] / m, l[2] / m];
  })();

  /* ---------------- sprite procedurali ---------------- */
  var spriteCache = {};
  function cv(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  var Sprites = {
    ball: function (color) {
      var key = 'ball|' + color;
      if (spriteCache[key]) return spriteCache[key];
      var S = 48, c = cv(S, S), g = c.getContext('2d');
      var r = S / 2;
      g.fillStyle = color;
      g.beginPath(); g.arc(r, r, r - 2, 0, MM.TAU); g.fill();
      var lg = g.createRadialGradient(r * 0.65, r * 0.6, r * 0.1, r, r, r);
      lg.addColorStop(0, 'rgba(255,255,255,.75)');
      lg.addColorStop(0.35, 'rgba(255,255,255,.12)');
      lg.addColorStop(1, 'rgba(0,0,0,.42)');
      g.fillStyle = lg;
      g.beginPath(); g.arc(r, r, r - 2, 0, MM.TAU); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2;
      g.beginPath(); g.arc(r, r, r - 2, 0, MM.TAU); g.stroke();
      spriteCache[key] = c;
      return c;
    },

    mug: function () {
      if (spriteCache.mug) return spriteCache.mug;
      var w = 52, h = 58, c = cv(w, h), g = c.getContext('2d');
      // manico
      g.strokeStyle = '#dcd4c4'; g.lineWidth = 7;
      g.beginPath(); g.arc(w - 12, 30, 11, -1.2, 1.2); g.stroke();
      // corpo
      g.fillStyle = '#f4efe4';
      g.beginPath();
      g.moveTo(8, 12); g.lineTo(w - 16, 12);
      g.lineTo(w - 20, h - 5); g.lineTo(12, h - 5);
      g.closePath(); g.fill();
      // fascia
      g.fillStyle = '#e8452f';
      g.fillRect(9, 26, w - 26, 9);
      // tazza
      g.fillStyle = '#e6ddcb';
      g.beginPath(); g.ellipse(w / 2 - 4, 13, 17, 5.5, 0, 0, MM.TAU); g.fill();
      g.fillStyle = '#6b4a2f';
      g.beginPath(); g.ellipse(w / 2 - 4, 13, 13, 3.8, 0, 0, MM.TAU); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(8, 12); g.lineTo(12, h - 5); g.lineTo(w - 20, h - 5); g.lineTo(w - 16, 12);
      g.stroke();
      spriteCache.mug = c;
      return c;
    },

    item: function () {
      if (spriteCache.item) return spriteCache.item;
      var S = 44, c = cv(S, S), g = c.getContext('2d');
      var grd = g.createLinearGradient(0, 0, 0, S);
      grd.addColorStop(0, '#ffe27a'); grd.addColorStop(1, '#f2a516');
      g.fillStyle = grd;
      g.fillRect(4, 4, S - 8, S - 8);
      g.strokeStyle = '#16131c'; g.lineWidth = 3;
      g.strokeRect(4, 4, S - 8, S - 8);
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.fillRect(7, 7, S - 14, 7);
      g.fillStyle = '#16131c';
      g.font = 'bold 26px "Arial Black", Impact, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', S / 2, S / 2 + 2);
      spriteCache.item = c;
      return c;
    },

    shadow: function () {
      if (spriteCache.shadow) return spriteCache.shadow;
      var S = 64, c = cv(S, S), g = c.getContext('2d');
      var grd = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
      grd.addColorStop(0, 'rgba(0,0,0,.55)');
      grd.addColorStop(0.6, 'rgba(0,0,0,.32)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
      spriteCache.shadow = c;
      return c;
    },

    oil: function () {
      if (spriteCache.oil) return spriteCache.oil;
      var S = 64, c = cv(S, S), g = c.getContext('2d');
      var r = MM.rng(4242);
      g.beginPath();
      for (var a = 0; a <= 40; a++) {
        var ang = a / 40 * MM.TAU;
        var rad = S * 0.36 * (0.82 + 0.2 * Math.sin(ang * 3) + r() * 0.1);
        var x = S / 2 + Math.cos(ang) * rad, y = S / 2 + Math.sin(ang) * rad;
        if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
      g.fillStyle = 'rgba(22,18,28,.94)';
      g.fill();
      g.fillStyle = 'rgba(140,190,255,.3)';
      g.beginPath(); g.ellipse(S * 0.4, S * 0.38, S * 0.14, S * 0.08, -0.5, 0, MM.TAU); g.fill();
      spriteCache.oil = c;
      return c;
    },

    puddle: function () {
      if (spriteCache.puddle) return spriteCache.puddle;
      var S = 64, c = cv(S, S), g = c.getContext('2d');
      var r = MM.rng(919);
      g.beginPath();
      for (var a = 0; a <= 40; a++) {
        var ang = a / 40 * MM.TAU;
        var rad = S * 0.36 * (0.86 + 0.14 * Math.sin(ang * 4 + 1) + r() * 0.08);
        var x = S / 2 + Math.cos(ang) * rad, y = S / 2 + Math.sin(ang) * rad;
        if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
      g.fillStyle = 'rgba(90,160,225,.78)';
      g.fill();
      g.strokeStyle = 'rgba(30,60,110,.75)'; g.lineWidth = 2.5; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.beginPath(); g.ellipse(S * 0.38, S * 0.36, S * 0.13, S * 0.07, -0.4, 0, MM.TAU); g.fill();
      spriteCache.puddle = c;
      return c;
    },

    banner: function () {
      if (spriteCache.banner) return spriteCache.banner;
      var w = 192, h = 44, c = cv(w, h), g = c.getContext('2d');
      g.fillStyle = '#e8452f'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#16131c'; g.lineWidth = 5; g.strokeRect(2, 2, w - 4, h - 4);
      var cell = 11;
      for (var y = 0; y < 2; y++) {
        for (var x = 0; x * cell < w; x++) {
          if ((x + y) % 2) { g.fillStyle = '#16131c'; g.fillRect(x * cell, h - 14 + y * 7, cell, 7); }
        }
      }
      g.fillStyle = '#f7efe1';
      g.font = 'bold 24px "Arial Black", Impact, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('PARTENZA', w / 2, h / 2 - 5);
      spriteCache.banner = c;
      return c;
    }
  };
  MM.Sprites = Sprites;

  /* ---------------- renderer ---------------- */
  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.items = [];
    this.setResolution(640, 360);
    this._p = [0, 0, 0];
    this._q = [0, 0, 0];
  }

  Renderer.prototype.setResolution = function (w, h) {
    this.w = w; this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.img = this.ctx.createImageData(w, h);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.ctx.imageSmoothingEnabled = false;
  };

  Renderer.prototype.begin = function (cam, track) {
    var W = this.w, H = this.h;
    var shake = cam.shake || 0;
    // ampiezza ridotta (era ±7% del buffer = quadro che "sfarfallisce"):
    // ora al massimo ±5px, arrotondati a interi per non introdurre sfocatura
    var shx = shake ? Math.round((Math.random() * 2 - 1) * shake * W * 0.12) : 0;
    var shy = shake ? Math.round((Math.random() * 2 - 1) * shake * H * 0.12) : 0;

    var yaw = cam.yaw, pitch = cam.pitch;
    var sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
    this.fx = cp * sy; this.fy = sp; this.fz = cp * cy;
    this.rx = cy; this.ry = 0; this.rz = -sy;
    this.ux = -sp * sy; this.uy = cp; this.uz = -sp * cy;
    this.camX = cam.x; this.camY = Math.max(0.32, cam.y); this.camZ = cam.z;
    this.f = (H * 0.5) / Math.tan(cam.fov * 0.5);
    this.cx = W * 0.5 + shx;
    this.cy = H * 0.5 + shy;
    this.horizonY = this.cy + this.f * (sp / cp);
    this.items.length = 0;

    var buf = this.buf;
    var ground = track.ground, sky = track.sky;
    var b = track.def.bounds;
    var ppw = ground.w / (b.x1 - b.x0), pph = ground.h / (b.z1 - b.z0);
    var fog = this._fog || (this._fog = [0, 0, 0]);
    if (this._fogId !== track.def.id) {
      var fc = MM.hexToRgb(track.def.fog);
      fog[0] = fc[0]; fog[1] = fc[1]; fog[2] = fc[2];
      this._fogId = track.def.id;
    }

    var gp = ground.px, gw = ground.w, gh = ground.h;
    var skp = sky.px, sw = sky.w, sh = sky.h;
    var swMask = sw - 1;
    var x0 = b.x0, z0 = b.z0;
    var invF = 1 / this.f;
    var cxL = this.cx;
    var skyVs = sh / (H * 0.62);
    var skyBase = sh - 1;
    var yawU = (yaw / MM.TAU) * sw;
    var panK = sw / (MM.TAU * this.f);
    var hy = this.horizonY;
    var fogR = fog[0], fogG = fog[1], fogB = fog[2];

    var y, x, u, v, idx;
    for (y = 0; y < H; y++) {
      var dy = (this.cy - y) * invF;
      var dirY = sp + cp * dy;
      idx = y * W;

      if (dirY >= -1e-5) {
        /* --- cielo / parete --- */
        var sv = skyBase - (hy - y) * skyVs;
        if (sv < 0) sv = 0; else if (sv > skyBase) sv = skyBase;
        var ivs = sv | 0;
        var haze = sv / skyBase;
        haze = haze * haze * haze * 0.8;
        var uS = yawU + (0 - cxL) * panK;
        var duS = panK;
        var fa = 1 - haze, fr = fogR * haze, fg = fogG * haze, fb = fogB * haze;
        for (x = 0; x < W; x++, uS += duS) {
          var iuS = uS & swMask;
          var cS = skp[ivs * sw + iuS];
          var rS, gS, bS;
          if (haze > 0.01) {
            rS = ((cS & 255) * fa + fr) | 0;
            gS = (((cS >> 8) & 255) * fa + fg) | 0;
            bS = (((cS >> 16) & 255) * fa + fb) | 0;
          } else {
            rS = cS & 255; gS = (cS >> 8) & 255; bS = (cS >> 16) & 255;
          }
          buf[idx + x] = 0xFF000000 | (bS << 16) | (gS << 8) | rS;
        }
      } else {
        /* --- terreno --- */
        var t = -this.camY / dirY;
        var X0 = this.fx + this.ux * dy;
        var Z0 = this.fz + this.uz * dy;
        var baseX = this.camX + t * X0;
        var baseZ = this.camZ + t * Z0;
        var slopeX = t * this.rx;
        var slopeZ = t * this.rz;
        var dx0 = -cxL * invF;
        u = (baseX + slopeX * dx0 - x0) * ppw;
        v = (baseZ + slopeZ * dx0 - z0) * pph;
        var du = slopeX * ppw * invF;
        var dv = slopeZ * pph * invF;

        var k = 1 - Math.exp(-t * 0.030);
        if (k > 0.985) k = 0.985;
        var fAlpha = 1 - k;
        var fr2 = fogR * k, fg2 = fogG * k, fb2 = fogB * k;

        if (k <= 0.012) {
          for (x = 0; x < W; x++, u += du, v += dv) {
            var iu = u < 0 ? 0 : (u >= gw ? gw - 1 : u | 0);
            var iv = v < 0 ? 0 : (v >= gh ? gh - 1 : v | 0);
            buf[idx + x] = gp[iv * gw + iu] | 0xFF000000;
          }
        } else {
          for (x = 0; x < W; x++, u += du, v += dv) {
            var iu2 = u < 0 ? 0 : (u >= gw ? gw - 1 : u | 0);
            var iv2 = v < 0 ? 0 : (v >= gh ? gh - 1 : v | 0);
            var c2 = gp[iv2 * gw + iu2];
            var r2 = ((c2 & 255) * fAlpha + fr2) | 0;
            var g2 = (((c2 >> 8) & 255) * fAlpha + fg2) | 0;
            var b2 = (((c2 >> 16) & 255) * fAlpha + fb2) | 0;
            buf[idx + x] = 0xFF000000 | (b2 << 16) | (g2 << 8) | r2;
          }
        }
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  };

  /* proiezione senza allocazioni */
  Renderer.prototype.proj = function (x, y, z, out) {
    var dx = x - this.camX, dy = y - this.camY, dz = z - this.camZ;
    var zc = dx * this.fx + dy * this.fy + dz * this.fz;
    out[0] = 0; out[1] = 0; out[2] = zc;
    if (zc < 0.07) return -1;
    var xc = dx * this.rx + dy * this.ry + dz * this.rz;
    var yc = dx * this.ux + dy * this.uy + dz * this.uz;
    var inv = this.f / zc;
    out[0] = this.cx + xc * inv;
    out[1] = this.cy - yc * inv;
    return zc;
  };

  Renderer.prototype.depth = function (x, y, z) {
    return (x - this.camX) * this.fx + (y - this.camY) * this.fy + (z - this.camZ) * this.fz;
  };

  Renderer.prototype.push = function (it) {
    var d = this.depth(it.x, it.y || 0, it.z);
    if (it.t === 'poly') {
      var pts = it.pts, a = 0;
      for (var i = 0; i < pts.length; i++) a += this.depth(pts[i][0], pts[i][1], pts[i][2]);
      d = a / pts.length;
    }
    if (d < -4) return;
    it._d = d;
    this.items.push(it);
  };

  Renderer.prototype.end = function () {
    var items = this.items;
    items.sort(function (a, b) { return b._d - a._d; });
    var ctx = this.ctx;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.t === 'box') drawBox(ctx, this, it);
      else if (it.t === 'spr') drawSprite(ctx, this, it);
      else if (it.t === 'flat') drawFlat(ctx, this, it);
      else if (it.t === 'poly') drawPoly(ctx, this, it);
      else if (it.t === 'dot') drawDot(ctx, this, it);
      else if (it.t === 'sq') drawSq(ctx, this, it);
    }
  };

  /* ---------------- disegno ---------------- */
  var LV = [0, 0, 0];
  var lv = [0, 0, 0];
  var lp = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];

  function drawBox(ctx, R, it) {
    var hw = it.w / 2, hd = it.d / 2;
    var y0 = it.y || 0, y1 = y0 + it.h;
    var yaw = it.yaw || 0;
    var ca = Math.cos(yaw), sa = Math.sin(yaw);
    var cxw = it.x, czw = it.z;
    // profondità del centro: culling rapido
    if (R.depth(cxw, y0 + it.h * 0.5, czw) < 0.12) return;

    var i;
    var L = [
      [-hw, y0, -hd], [hw, y0, -hd], [hw, y0, hd], [-hw, y0, hd],
      [-hw, y1, -hd], [hw, y1, -hd], [hw, y1, hd], [-hw, y1, hd]
    ];
    for (i = 0; i < 8; i++) {
      var lx = L[i][0], lz = L[i][2];
      var wx = cxw + lx * ca + lz * sa;
      var wz = czw - lx * sa + lz * ca;
      if (R.proj(wx, L[i][1], wz, lp[i]) < 0) return; // vertice dietro la camera
    }

    var col = it.c;
    if (typeof col === 'string') col = MM.hexToRgb(col);
    var faces = [
      { n: [0, 1, 0], v: [4, 5, 6, 7] },
      { n: [0, -1, 0], v: [3, 2, 1, 0] },
      { n: [0, 0, 1], v: [3, 2, 6, 7] },
      { n: [0, 0, -1], v: [1, 0, 4, 5] },
      { n: [1, 0, 0], v: [2, 1, 5, 6] },
      { n: [-1, 0, 0], v: [0, 3, 7, 4] }
    ];
    var fcx = cxw, fcy = y0 + it.h * 0.5, fcz = czw;
    for (i = 0; i < 6; i++) {
      var fc = faces[i];
      var nx = fc.n[0] * ca + fc.n[2] * sa;
      var ny = fc.n[1];
      var nz = -fc.n[0] * sa + fc.n[2] * ca;
      // normale verso la camera?
      var vx = fcx - R.camX, vy = fcy - R.camY, vz = fcz - R.camZ;
      if (nx * vx + ny * vy + nz * vz >= 0) continue;

      var lum = 0.40 + 0.62 * Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
      if (it.lum) lum *= it.lum;
      ctx.fillStyle = MM.shade(col, lum);
      var v = fc.v;
      ctx.beginPath();
      ctx.moveTo(lp[v[0]][0], lp[v[0]][1]);
      ctx.lineTo(lp[v[1]][0], lp[v[1]][1]);
      ctx.lineTo(lp[v[2]][0], lp[v[2]][1]);
      ctx.lineTo(lp[v[3]][0], lp[v[3]][1]);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = MM.shade(col, lum * 0.55);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawSprite(ctx, R, it) {
    var p = LV;
    var zb = R.proj(it.x, it.y || 0, it.z, p);
    if (zb < 0) return;
    var bx = p[0], by = p[1];
    var zt = R.proj(it.x, (it.y || 0) + it.h, it.z, p);
    if (zt < 0) return;
    var ty = p[1];
    var sh = by - ty;
    if (sh < 0.7) return;
    var img = it.img;
    var sw = sh * (img.width / img.height);
    var sx = bx - sw / 2;
    if (sx > R.w || sx + sw < 0 || ty > R.h) return;
    if (it.a !== undefined) { ctx.globalAlpha = it.a; }
    ctx.drawImage(img, sx, ty, sw, sh);
    if (it.a !== undefined) ctx.globalAlpha = 1;
  }

  function drawFlat(ctx, R, it) {
    var yaw = it.yaw || 0;
    var ca = Math.cos(yaw), sa = Math.sin(yaw);
    var hw = it.w / 2, hd = it.d / 2;
    var y = it.y || 0;
    var corners = [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]];
    var pts = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    var i;
    var ok = true;
    var scr = [];
    for (i = 0; i < 4; i++) {
      var lx = corners[i][0], lz = corners[i][1];
      var wx = it.x + lx * ca + lz * sa;
      var wz = it.z - lx * sa + lz * ca;
      var out = [0, 0, 0];
      var zc = R.proj(wx, y, wz, out);
      if (zc < 0) { ok = false; break; }
      scr.push(out);
    }
    if (!ok || scr.length < 4) return;
    var p0 = scr[0], p1 = scr[1], p2 = scr[2];
    var a = p1[0] - p0[0], b = p1[1] - p0[1];
    var c = p2[0] - p0[0], d = p2[1] - p0[1];
    if (Math.abs(a * d - b * c) < 0.001) return;
    ctx.save();
    if (it.a !== undefined) ctx.globalAlpha = it.a;
    ctx.setTransform(a, b, c, d, p0[0], p0[1]);
    ctx.drawImage(it.img, 0, 0, 1, 1);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawPoly(ctx, R, it) {
    var pts = it.pts, i, out = [0, 0, 0];
    ctx.beginPath();
    for (i = 0; i < pts.length; i++) {
      if (R.proj(pts[i][0], pts[i][1], pts[i][2], out) < 0) return;
      if (i === 0) ctx.moveTo(out[0], out[1]); else ctx.lineTo(out[0], out[1]);
    }
    ctx.closePath();
    if (it.a !== undefined) ctx.globalAlpha = it.a;
    ctx.fillStyle = it.c;
    ctx.fill();
    if (it.a !== undefined) ctx.globalAlpha = 1;
  }

  function drawDot(ctx, R, it) {
    var out = [0, 0, 0];
    if (R.proj(it.x, it.y || 0, it.z, out) < 0) return;
    var r = it.r * R.f / out[2];
    if (r < 0.4) return;
    if (r > R.h * 3) r = R.h * 3;
    ctx.globalAlpha = it.a === undefined ? 1 : it.a;
    ctx.fillStyle = it.c;
    ctx.beginPath();
    ctx.arc(out[0], out[1], r, 0, MM.TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawSq(ctx, R, it) {
    var out = [0, 0, 0];
    if (R.proj(it.x, it.y || 0, it.z, out) < 0) return;
    var s = it.s * R.f / out[2];
    if (s < 0.6) return;
    ctx.globalAlpha = it.a === undefined ? 1 : it.a;
    ctx.fillStyle = it.c;
    ctx.fillRect(out[0] - s / 2, out[1] - s / 2, s, s);
    ctx.globalAlpha = 1;
  }

  MM.Renderer = Renderer;
})();
