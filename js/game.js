/* game — macchina a stati: menu, selezione, gara, pausa, risultati,
   telecamere, HUD, minimappa, oggetti, missili e particelle. */
(function () {
  'use strict';
  var MM = (window.MM = window.MM || {});
  var T = MM.TUNE;

  var ROSTER = [
    { name: 'Tu', color: '#e8452f', dark: '#8d2718', accent: '#ffd166' },
    { name: 'Baffo', color: '#2f6fed', dark: '#1a3d92', accent: '#bcd4ff' },
    { name: 'Greta', color: '#ffc93c', dark: '#b0790a', accent: '#5a4200' },
    { name: 'Dino', color: '#1f9d6b', dark: '#0e6344', accent: '#a8f0d0' }
  ];
  var ICONS = {
    nitro: 'M17 3 L7 17 h6 l-2 12 11-16 h-6 z',
    oil: 'M16 4 C21 11 24 14 24 18 A8 8 0 0 1 8 18 C8 14 11 11 16 4 Z',
    missile: 'M16 3 L24 25 L16 20 L8 25 Z'
  };
  var ZERO = { steer: 0, throttle: 0, brake: 0, use: 0 };
  var SCREENS = ['title', 'select', 'help', 'pause', 'results'];

  var R = null;
  var els = {};
  var mmCtx = null;
  var pInput = { steer: 0, throttle: 0, brake: 0, use: 0 };

  function $(id) { return document.getElementById(id); }

  var G = MM.game = {
    mode: 'attract',
    screen: null,
    tracks: [],
    trackIdx: 0,
    track: null,
    cars: [],
    player: null,
    world: null,
    hazards: [],
    missiles: [],
    particles: [],
    laps: 3,
    time: 0,
    countdown: 0,
    lastBeep: 99,
    resultsT: -1,
    best: null,
    t: 0,
    attractT: 0,
    focusT: 7,
    focusIdx: 0,
    focusCar: null,
    shakeAmt: 0,
    order: [],
    cam: { x: 0, y: 2.4, z: -6, yaw: 0, pitch: -0.2, fov: 62 * Math.PI / 180, shake: 0 }
  };

  /* ---------------- init / DOM ---------------- */
  G.init = function (renderer) {
    R = renderer;
    els = {
      hud: $('hud'), pos: $('hud-pos'), lap: $('hud-lap'), time: $('hud-time'),
      best: $('hud-best'), item: $('hud-item'), icon: $('item-icon'),
      speed: $('hud-speed'), bar: $('speed-bar'), msg: $('center-msg'),
      flash: $('flash'), minimap: $('minimap'), touch: $('touch'),
      resList: $('results-list'), resTitle: $('results-title'),
      title: $('scr-title'), select: $('scr-select'), help: $('scr-help'),
      pause: $('scr-pause'), results: $('scr-results')
    };
    mmCtx = els.minimap.getContext('2d');
  };

  function applyDOM() {
    var map = { title: els.title, select: els.select, help: els.help, pause: els.pause, results: els.results };
    for (var k in map) map[k].classList.toggle('on', k === G.screen);
    var hudOn = (G.mode === 'countdown' || G.mode === 'race');
    els.hud.classList.toggle('hidden', !hudOn);
    var touchOn = MM.Input.touchMode && hudOn && G.screen === null;
    els.touch.classList.toggle('hidden', !touchOn);
  }

  G.showScreen = function (s) { G.screen = s; applyDOM(); };

  function setMsg(big, small) {
    var el = els.msg;
    if (!el) return;
    el.innerHTML = big + (small ? '<small>' + small + '</small>' : '');
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }
  G.setMsg = setMsg;

  function flash() {
    els.flash.classList.add('on');
    clearTimeout(G._flashTo);
    G._flashTo = setTimeout(function () { els.flash.classList.remove('on'); }, 140);
  }
  G.flash = flash;
  G.shake = function (v) { if (v > G.shakeAmt) G.shakeAmt = v; };

  /* ---------------- creazione gara ---------------- */
  function makeCar(i) {
    var r = ROSTER[i];
    return {
      id: i, name: r.name, color: r.color, dark: r.dark, accent: r.accent,
      isPlayer: false, ai: null,
      x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, vy: 0, vf: 0, speed: 0,
      steer: 0, drift: 0, wet: 0, onRoad: true,
      state: 'ok', hint: -1, s: 0, lat: 0, progress: 0, lap: 0,
      item: null, nitroT: 0, spinT: 0, spinDir: 0, hitT: 0, bumpCd: 0,
      fallT: 0, respawnT: 0, finishTime: 0, rank: 1,
      prevUse: 0, _smoke: 0, _spray: 0
    };
  }

  G.startRace = function (idx, attract) {
    G.trackIdx = idx;
    var def = MM.trackDefs[idx];
    G.track = G.tracks[idx];
    var track = G.track;
    G.laps = 3;
    G.time = 0;
    G.resultsT = -1;
    G.attractT = 0;
    G.hazards.length = 0;
    G.missiles.length = 0;
    G.particles.length = 0;
    G.cars = [];

    for (var i = 0; i < 4; i++) {
      var c = makeCar(i);
      c.isPlayer = !attract && i === 0;
      if (!c.isPlayer) c.ai = MM.makeAI(i === 0 ? 0.99 : 0.89 + (i % 3) * 0.04);
      var row = i >> 1;
      var s0 = -3.6 - row * 2.8;
      var p = track.posAt(s0);
      var lat = ((i % 2) ? 1 : -1) * p.halfW * 0.5;
      MM.placeOnTrack(c, track, s0);
      c.x = p.x + p.nx * lat;
      c.z = p.z + p.nz * lat;
      var nn = track.nearest(c.x, c.z, -1);
      c.s = nn.s; c.hint = nn.i; c.lat = nn.lat;
      c.progress = s0;
      c.lap = 0;
      G.cars.push(c);
    }

    G.player = attract ? null : G.cars[0];
    G.focusCar = G.cars[0];
    G.focusIdx = 0;
    G.focusT = 7;
    G.world = {
      track: track, cars: G.cars, hazards: G.hazards, time: 0,
      onLap: onLap, onFall: onFall
    };
    G.best = MM.storage.get('best.' + def.id, null);
    G.mode = attract ? 'attract' : 'countdown';
    G.countdown = 3;
    G.lastBeep = 99;
    computeRanks();
    snapCamera(G.player || G.cars[0]);
    buildMinimap();
    refreshItemHUD();
    applyDOM();
    MM.Audio.music(true, def.music);
    if (!attract) setMsg('3', def.name);
  };

  /* ---------------- giri / arrivo ---------------- */
  function onLap(car, lap) {
    if (lap >= G.laps) { finishCar(car); return; }
    if (car.isPlayer) {
      MM.Audio.sfx('lap');
      if (lap === G.laps - 1) setMsg('GIRO FINALE', 'ultimo giro!');
      else setMsg('GIRO ' + (lap + 1) + '/' + G.laps);
    }
  }

  function onFall(car) {
    if (car.isPlayer) { G.shake(0.05); }
  }

  function finishCar(car) {
    if (car.state === 'finish') return;
    car.state = 'finish';
    car.finishTime = G.time;
    car.vx = 0; car.vz = 0; car.vf = 0; car.speed = 0; car.drift = 0;
    if (car.isPlayer) {
      MM.Audio.sfx('finish');
      flash();
      setMsg('ARRIVO!');
      var def = G.track.def;
      if (G.best == null || G.time < G.best) {
        G.best = G.time;
        MM.storage.set('best.' + def.id, G.time);
      }
      G.resultsT = 2.3;
    }
  }

  function computeRanks() {
    var arr = G.cars.slice().sort(function (a, b) {
      var fa = a.state === 'finish', fb = b.state === 'finish';
      if (fa && fb) return a.finishTime - b.finishTime;
      if (fa) return -1;
      if (fb) return 1;
      return b.progress - a.progress;
    });
    for (var i = 0; i < arr.length; i++) arr[i].rank = i + 1;
    G.order = arr;
  }

  /* ---------------- oggetti ---------------- */
  function pickItem(car) {
    var rank = car.rank, r = Math.random();
    if (rank >= 3) return r < 0.58 ? 'nitro' : (r < 0.84 ? 'missile' : 'oil');
    if (rank === 1) return r < 0.42 ? 'oil' : (r < 0.78 ? 'missile' : 'nitro');
    return r < 0.4 ? 'nitro' : (r < 0.72 ? 'missile' : 'oil');
  }

  G.useItem = function (car) {
    var it = car.item;
    if (!it) return;
    car.item = null;
    if (it === 'nitro') {
      car.nitroT = 1.7;
      MM.Audio.sfx('nitro');
      burst(car.x - Math.sin(car.yaw), 0.3, car.z - Math.cos(car.yaw), 7, '#7ad1ff', 3.5);
    } else if (it === 'oil') {
      var hx = car.x - Math.sin(car.yaw) * 1.35;
      var hz = car.z - Math.cos(car.yaw) * 1.35;
      G.hazards.push({ x: hx, z: hz, k: 'oil', r: 1.0, life: 18, rot: Math.random() * MM.TAU });
      MM.Audio.sfx('oil');
    } else if (it === 'missile') {
      var target = null, best = 1e9, i, c, d;
      for (i = 0; i < G.cars.length; i++) {
        c = G.cars[i];
        if (c === car || c.state !== 'ok') continue;
        d = c.progress - car.progress;
        if (d > 0.5 && d < best) { best = d; target = c; }
      }
      if (!target) {
        var worst = -1e9;
        for (i = 0; i < G.cars.length; i++) {
          c = G.cars[i];
          if (c === car || c.state !== 'ok') continue;
          d = c.progress - car.progress;
          if (d > worst) { worst = d; target = c; }
        }
      }
      if (!target) { car.item = it; return; }
      var dir = Math.atan2(target.x - car.x, target.z - car.z);
      G.missiles.push({
        x: car.x + Math.sin(dir) * 0.8, z: car.z + Math.cos(dir) * 0.8,
        y: 0.32, dir: dir, speed: 15.5, life: 5,
        owner: car.id, age: 0, target: target.id
      });
      MM.Audio.sfx('missile');
    }
    if (car.isPlayer) refreshItemHUD();
  };

  function refreshItemHUD() {
    var car = G.player;
    var it = car ? car.item : null;
    els.item.setAttribute('data-empty', it ? '0' : '1');
    if (it) els.icon.setAttribute('d', ICONS[it]);
    G._lastItem = it || '';
  }

  /* ---------------- particelle ---------------- */
  function addP(x, y, z, vx, vy, vz, life, c, size, kind, g) {
    if (G.particles.length > 220) G.particles.shift();
    G.particles.push({
      x: x, y: y, z: z, vx: vx, vy: vy, vz: vz,
      life: life, max: life, c: c, size: size, kind: kind || 'dot', g: g || 0
    });
  }

  function burst(x, y, z, n, c, spd) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * MM.TAU;
      var v = (0.35 + Math.random() * 0.65) * (spd || 4);
      addP(x, y, z, Math.sin(a) * v, Math.random() * 3.5, Math.cos(a) * v,
        0.4 + Math.random() * 0.35, c, 0.07 + Math.random() * 0.06, 'sq', 12);
    }
  }

  G.spawnHit = function (x, z, imp) {
    var n = Math.min(9, 3 + (imp | 0));
    for (var i = 0; i < n; i++) {
      var a = Math.random() * MM.TAU;
      var v = 1.5 + Math.random() * 3.5;
      addP(x, 0.35, z, Math.sin(a) * v, 2 + Math.random() * 4, Math.cos(a) * v,
        0.3 + Math.random() * 0.25, Math.random() < 0.5 ? '#ffd166' : '#fff3c4',
        0.055, 'sq', 16);
    }
  };

  function explode(x, z, strong) {
    MM.Audio.sfx('boom');
    burst(x, 0.3, z, strong ? 16 : 9, '#ffb020', strong ? 6 : 4);
    burst(x, 0.25, z, 6, '#6b6560', 2.5);
    var pc = G.player;
    if (pc) {
      var d2 = MM.dist2(pc.x, pc.z, x, z);
      if (d2 < 36) { G.shake(Math.min(0.07, 0.07 - d2 * 0.0009)); flash(); }
    }
  }

  function updateParticles(dt) {
    var ps = G.particles;
    for (var i = ps.length - 1; i >= 0; i--) {
      var p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vy -= p.g * dt;
      if (p.y < 0.02 && p.g) { p.y = 0.02; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
    }
  }

  /* ---------------- missili ---------------- */
  function updateMissiles(dt) {
    var cars = G.cars, i, j;
    for (i = G.missiles.length - 1; i >= 0; i--) {
      var m = G.missiles[i];
      m.age += dt; m.life -= dt;
      var tgt = cars[m.target];
      if (tgt && tgt.state === 'ok') {
        var des = Math.atan2(tgt.x - m.x, tgt.z - m.z);
        var diff = MM.wrapAngle(des - m.dir);
        m.dir += MM.clamp(diff, -4.4 * dt, 4.4 * dt);
      }
      m.x += Math.sin(m.dir) * m.speed * dt;
      m.z += Math.cos(m.dir) * m.speed * dt;
      if (Math.random() < 0.75) {
        addP(m.x - Math.sin(m.dir) * 0.3, 0.3, m.z - Math.cos(m.dir) * 0.3,
          0, 0.4, 0, 0.3, 'rgba(220,220,220,.5)', 0.09, 'dot', 0);
      }
      var dead = false;
      if (!G.track.solid(m.x, m.z)) dead = true;
      if (m.life <= 0) dead = true;
      if (!dead) {
        for (j = 0; j < cars.length; j++) {
          var c = cars[j];
          if (c.state !== 'ok') continue;
          if (c.id === m.owner && m.age < 0.45) continue;
          if (MM.dist2(c.x, c.z, m.x, m.z) < 0.62) {
            c.spinT = T.SPIN_T;
            c.spinDir = Math.random() < 0.5 ? -1 : 1;
            c.vx *= 0.35; c.vz *= 0.35;
            c.hitT = 0.4;
            MM.Audio.sfx('hit');
            if (c.isPlayer) { flash(); G.shake(0.07); }
            dead = true;
            break;
          }
        }
      }
      if (dead) {
        if (m.life <= 0) {
          burst(m.x, 0.3, m.z, 5, 'rgba(220,220,220,.8)', 2);
        } else {
          explode(m.x, m.z, true);
        }
        G.missiles.splice(i, 1);
      }
    }
  }

  /* ---------------- raccogliitori ---------------- */
  function updatePickups(dt) {
    var track = G.track, i, j;
    for (i = 0; i < track.pickups.length; i++) {
      var pk = track.pickups[i];
      pk.t += dt;
      if (!pk.active) {
        pk.respawnT -= dt;
        if (pk.respawnT <= 0) pk.active = true;
        continue;
      }
      for (j = 0; j < G.cars.length; j++) {
        var c = G.cars[j];
        if (c.item || c.state !== 'ok') continue;
        if (MM.dist2(c.x, c.z, pk.x, pk.z) < 1.0) {
          c.item = pickItem(c);
          pk.active = false;
          pk.respawnT = 9 + Math.random() * 4;
          MM.Audio.sfx('pickup');
          burst(pk.x, 0.6, pk.z, 6, '#ffc93c', 2.5);
          if (c.isPlayer) refreshItemHUD();
          break;
        }
      }
    }
  }

  function updateHazards(dt) {
    for (var i = G.hazards.length - 1; i >= 0; i--) {
      G.hazards[i].life -= dt;
      if (G.hazards[i].life <= 0) G.hazards.splice(i, 1);
    }
  }

  /* ---------------- simulazione ---------------- */
  function simulate(dt, withPlayer) {
    var world = G.world;
    world.time = G.time;
    var pi = ZERO;
    if (withPlayer && G.player) {
      var a = MM.Input.poll();
      pInput.steer = a.steer;
      pInput.throttle = a.throttle;
      pInput.brake = a.brake;
      pInput.use = MM.Input.consumeItem() ? 1 : 0;
      pi = pInput;
    } else {
      MM.Input.consumeItem();
    }

    var i, car, inp;
    var frozen = G.mode === 'countdown';
    for (i = 0; i < G.cars.length; i++) {
      car = G.cars[i];
      inp = frozen ? ZERO
        : ((car.isPlayer && withPlayer && !G.ffAI) ? pi : MM.thinkAI(car, world, dt));
      var use = inp.use ? 1 : 0;
      if (use && !car.prevUse && car.item) G.useItem(car);
      car.prevUse = use;
      MM.stepCar(car, world, inp, dt);
      MM.collideProps(car, world, dt);

      // scie di fumo in derapata
      if (car.drift > 0.5 && car.onRoad && car.speed > 5) {
        car._smoke -= dt;
        if (car._smoke <= 0) {
          car._smoke = 0.05;
          var sx = car.x - Math.sin(car.yaw) * 0.55;
          var sz = car.z - Math.cos(car.yaw) * 0.55;
          addP(sx, 0.12, sz, (Math.random() - 0.5), 0.7, (Math.random() - 0.5),
            0.55, 'rgba(235,230,220,.55)', 0.14 + Math.random() * 0.1, 'dot', -0.4);
        }
      }
      // spruzzo sull'acqua
      if (car.wet > 0 && car.speed > 3) {
        car._spray -= dt;
        if (car._spray <= 0) {
          car._spray = 0.06;
          addP(car.x, 0.15, car.z, (Math.random() - 0.5) * 2, 2.2, (Math.random() - 0.5) * 2,
            0.4, 'rgba(170,215,255,.8)', 0.07, 'dot', 12);
        }
      }
      // fiamma nitro
      if (car.nitroT > 0) {
        var fx = car.x - Math.sin(car.yaw) * 0.68;
        var fz = car.z - Math.cos(car.yaw) * 0.68;
        addP(fx + (Math.random() - 0.5) * 0.2, 0.22 + Math.random() * 0.1, fz + (Math.random() - 0.5) * 0.2,
          -Math.sin(car.yaw) * 3, 0.3, -Math.cos(car.yaw) * 3,
          0.24, Math.random() < 0.5 ? '#7ad1ff' : '#ffb020', 0.12, 'dot', 0);
      }
    }
    MM.collideCars(G.cars);
    computeRanks();
  }

  /* ---------------- telecamera ---------------- */
  function snapCamera(car) {
    var c = G.cam;
    c.x = car.x - Math.sin(car.yaw) * 5.6;
    c.z = car.z - Math.cos(car.yaw) * 5.6;
    c.y = car.y + 2.5;
    c.yaw = car.yaw;
    c.pitch = -0.2;
    c.fov = 62 * MM.DEG;
    c.shake = 0;
  }

  function camChase(dt, orbit) {
    var car = G.player || G.focusCar;
    if (!car) return;
    var c = G.cam;
    var spd = car.speed;
    var back = 5.3 + spd * 0.16;
    var ang = car.yaw + orbit;
    var tx = car.x - Math.sin(ang) * back;
    var tz = car.z - Math.cos(ang) * back;
    var ty = car.y + 2.42 + spd * 0.014;
    c.x = MM.damp(c.x, tx, 9, dt);
    c.z = MM.damp(c.z, tz, 9, dt);
    c.y = MM.damp(c.y, ty, 8, dt);
    var lookX = car.x + Math.sin(car.yaw) * (2.2 + spd * 0.17);
    var lookZ = car.z + Math.cos(car.yaw) * (2.2 + spd * 0.17);
    var wantYaw = Math.atan2(lookX - c.x, lookZ - c.z);
    c.yaw = MM.dampAngle(c.yaw, wantYaw, 8.5, dt);
    var wantPitch = -0.19 - spd * 0.0018;
    if (car.state === 'fall') wantPitch -= Math.min(0.3, -car.y * 0.05);
    c.pitch = MM.damp(c.pitch, MM.clamp(wantPitch, -0.62, -0.12), 6, dt);
    var wantFov = (62 + Math.min(12, spd * 0.8) + (car.nitroT > 0 ? 5 : 0)) * MM.DEG;
    c.fov = MM.damp(c.fov, wantFov, 4, dt);
    if (c.y < 0.42) c.y = 0.42;
  }

  function camAttract(dt) {
    var car = G.focusCar;
    if (!car) return;
    var c = G.cam, tt = G.t;
    var ang = car.yaw + 2.3 + Math.sin(tt * 0.17) * 0.7;
    var dist = 6.4 + Math.sin(tt * 0.26) * 1.4;
    var tx = car.x - Math.sin(ang) * dist;
    var tz = car.z - Math.cos(ang) * dist;
    var ty = 1.55 + Math.sin(tt * 0.2) * 0.65 + car.y * 0.55;
    c.x = MM.damp(c.x, tx, 3.2, dt);
    c.z = MM.damp(c.z, tz, 3.2, dt);
    c.y = MM.damp(c.y, ty, 3.2, dt);
    var wantYaw = Math.atan2(car.x - c.x, car.z - c.z);
    c.yaw = MM.dampAngle(c.yaw, wantYaw, 4, dt);
    var hor = Math.hypot(car.x - c.x, car.z - c.z);
    var wantPitch = MM.clamp(Math.atan2(car.y + 0.35 - c.y, hor), -0.5, 0.02);
    c.pitch = MM.damp(c.pitch, wantPitch, 4, dt);
    c.fov = MM.damp(c.fov, 60 * MM.DEG, 3, dt);
    if (c.y < 0.5) c.y = 0.5;
  }

  function camOrbit(dt) {
    var car = G.player || G.focusCar;
    if (!car) return;
    var c = G.cam, a = G.t * 0.45;
    var dist = 6.6, tx = car.x - Math.sin(a) * dist, tz = car.z - Math.cos(a) * dist;
    var ty = 3.2 + Math.sin(G.t * 0.3) * 0.7;
    c.x = MM.damp(c.x, tx, 3, dt);
    c.z = MM.damp(c.z, tz, 3, dt);
    c.y = MM.damp(c.y, ty, 3, dt);
    c.yaw = MM.dampAngle(c.yaw, Math.atan2(car.x - c.x, car.z - c.z), 4, dt);
    var hor = Math.hypot(car.x - c.x, car.z - c.z);
    c.pitch = MM.damp(c.pitch, MM.clamp(Math.atan2(car.y + 0.4 - c.y, hor), -0.6, 0.05), 4, dt);
    c.fov = MM.damp(c.fov, 58 * MM.DEG, 3, dt);
  }

  function updateCamera(dt) {
    var orbit = 0;
    if (G.mode === 'attract') camAttract(dt);
    else if (G.screen === 'results') camOrbit(dt);
    else {
      if (G.mode === 'countdown') orbit = G.countdown * 0.38;
      camChase(dt, orbit);
    }
    G.shakeAmt *= Math.exp(-5 * dt);
    G.cam.shake = G.shakeAmt;
  }

  /* ---------------- aggiornamento per stato ---------------- */
  G.update = function (dt) {
    G.t += dt;
    if (G.screen === 'pause') return;

    if (G.mode === 'attract') {
      G.attractT += dt;
      G.focusT -= dt;
      if (G.focusT <= 0) {
        G.focusT = 7;
        G.focusIdx = (G.focusIdx + 1) % G.cars.length;
        G.focusCar = G.cars[G.focusIdx];
      }
      if (G.attractT > 26) {
        G.startRace((G.trackIdx + 1) % MM.trackDefs.length, true);
        if (G.screen !== 'select' && G.screen !== 'help') G.showScreen('title');
      }
      G.time += dt;
      simulate(dt, false);
      updatePickups(dt); updateMissiles(dt); updateHazards(dt); updateParticles(dt);
      updateCamera(dt);
      MM.Audio.engine(0, 0, 0, false);
      return;
    }

    if (G.mode === 'countdown') {
      G.countdown -= dt;
      var cur = Math.ceil(G.countdown - 0.001);
      if (cur > 0 && cur < G.lastBeep) {
        G.lastBeep = cur;
        setMsg(String(cur));
        MM.Audio.sfx('beep');
      }
      simulate(dt, false);
      updateParticles(dt);
      updateCamera(dt);
      if (G.countdown <= 0) {
        G.mode = 'race';
        G.time = 0;
        setMsg('VIA!', null);
        MM.Audio.sfx('go');
        applyDOM();
      }
      return;
    }

    /* race / results */
    G.time += dt;
    if (G.mode === 'race') simulate(dt, true);
    updatePickups(dt);
    updateMissiles(dt);
    updateHazards(dt);
    updateParticles(dt);
    updateCamera(dt);

    var pc = G.player;
    if (pc) {
      MM.Audio.engine(pc.speed / T.MAX, pInput.throttle, pc.drift,
        (G.mode === 'race' || G.mode === 'countdown') && pc.state === 'ok');
    }

    if (G.resultsT > 0) {
      G.resultsT -= dt;
      if (G.resultsT <= 0) showResults();
    }
  };

  function showResults() {
    G.mode = 'results';
    computeRanks();
    var list = els.resList;
    list.innerHTML = '';
    var player = G.player;
    var record = player && player.state === 'finish' && G.best != null && player.finishTime <= G.best;
    for (var i = 0; i < G.order.length; i++) {
      var c = G.order[i];
      var li = document.createElement('li');
      if (c.isPlayer) li.className = 'me';
      var dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = c.color;
      var nm = document.createElement('span');
      nm.textContent = c.name + (c.isPlayer ? ' (tu)' : '') +
        (c.isPlayer && record ? '  record!' : '');
      var tm = document.createElement('span');
      tm.className = 't';
      tm.textContent = c.state === 'finish' ? MM.formatTime(c.finishTime) : '—';
      li.appendChild(dot); li.appendChild(nm); li.appendChild(tm);
      list.appendChild(li);
    }
    els.resTitle.textContent = (player && player.rank === 1) ? 'HAI VINTO!' : 'RISULTATI';
    G.showScreen('results');
    MM.Audio.engine(0, 0, 0, false);
  }

  G.pause = function () {
    if (G.mode === 'race' || G.mode === 'countdown') {
      G._pausedMode = G.mode;
      G.showScreen('pause');
      MM.Audio.engine(0, 0, 0, false);
    }
  };
  G.resume = function () {
    if (G.screen === 'pause') {
      G.mode = G._pausedMode || 'race';
      G.showScreen(null);
    }
  };
  G.togglePause = function () {
    if (G.screen === 'pause') G.resume();
    else G.pause();
  };

  /* ---------------- scena 3D ---------------- */
  var SHADOW = null;
  function pushScene(t) {
    if (!SHADOW) SHADOW = MM.Sprites.shadow();
    var track = G.track, items = [], i, p;
    var cam = G.cam;

    /* bordi del tavolo */
    var surf = track.def.surfaces;
    for (i = 0; i < surf.length; i++) {
      var s = surf[i];
      if (s.t !== 'rect') continue;
      var hw = s.w / 2, hd = s.h / 2;
      var cx = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
      for (var e = 0; e < 4; e++) {
        var a = cx[e], b = cx[(e + 1) & 3];
        var ax = s.x + a[0], az = s.z + a[1];
        var bx = s.x + b[0], bz = s.z + b[1];
        var mx = (ax + bx) / 2, mz = (az + bz) / 2;
        var nx = mx - s.x, nz = mz - s.z;
        if ((cam.x - mx) * nx + (cam.z - mz) * nz <= 0) continue;
        items.push({ t: 'poly', x: mx, y: -0.8, z: mz, c: '#4a3626', a: 1, pts: [[ax, 0, az], [bx, 0, bz], [bx, -1.7, bz], [ax, -1.7, az]] });
      }
    }

    /* bandiera del traguardo */
    p = track.posAt(0);
    items.push({ t: 'box', x: p.x + p.nx * (p.halfW + 0.18), y: 0, z: p.z + p.nz * (p.halfW + 0.18), w: 0.13, h: 2.0, d: 0.13, yaw: Math.atan2(p.tx, p.tz), c: '#8b5e3c' });
    items.push({ t: 'box', x: p.x - p.nx * (p.halfW + 0.18), y: 0, z: p.z - p.nz * (p.halfW + 0.18), w: 0.13, h: 2.0, d: 0.13, yaw: Math.atan2(p.tx, p.tz), c: '#8b5e3c' });
    items.push({ t: 'spr', x: p.x, y: 1.42, z: p.z, h: 0.78, img: MM.Sprites.banner() });

    /* ostacoli e decorazioni */
    var props = track.props;
    for (i = 0; i < props.length; i++) {
      var pr = props[i];
      if (pr.cr > 0.16) {
        items.push({ t: 'flat', x: pr.x, y: 0.012, z: pr.z, w: pr.cr * 2.6, d: pr.cr * 2.6, yaw: pr.yaw || 0, img: SHADOW, a: 0.72 });
      }
      if (pr.kind === 'ball') {
        items.push({ t: 'spr', x: pr.x, y: 0.03, z: pr.z, h: pr.r * 2, img: MM.Sprites.ball(pr.c) });
      } else if (pr.kind === 'mug') {
        items.push({ t: 'spr', x: pr.x, y: 0, z: pr.z, h: 1.2 * pr.s, img: MM.Sprites.mug() });
      } else {
        items.push({ t: 'box', x: pr.x, y: pr.y || 0, z: pr.z, w: pr.w, h: pr.h, d: pr.d, yaw: pr.yaw || 0, c: pr.c });
      }
    }

    /* raccoglibili */
    var pickups = track.pickups;
    for (i = 0; i < pickups.length; i++) {
      var pk = pickups[i];
      if (!pk.active) continue;
      var bob = 0.46 + Math.sin(t * 3 + pk.spin) * 0.12;
      items.push({ t: 'flat', x: pk.x, y: 0.013, z: pk.z, w: 0.95, d: 0.95, yaw: 0, img: SHADOW, a: 0.5 });
      items.push({ t: 'spr', x: pk.x, y: bob, z: pk.z, h: 0.6, img: MM.Sprites.item() });
    }

    /* pericoli mobili */
    var OIL = MM.Sprites.oil(), PUD = MM.Sprites.puddle();
    function pushHaz(h) {
      if (h.rot === undefined) h.rot = (h.x * 1.7 + h.z * 2.3) % MM.TAU;
      items.push({ t: 'flat', x: h.x, y: 0.02, z: h.z, w: h.r * 2.3, d: h.r * 2.3, yaw: h.rot, img: h.k === 'oil' ? OIL : PUD, a: 0.95 });
    }
    for (i = 0; i < track.hazardsDyn.length; i++) pushHaz(track.hazardsDyn[i]);
    for (i = 0; i < G.hazards.length; i++) pushHaz(G.hazards[i]);

    /* missili */
    for (i = 0; i < G.missiles.length; i++) {
      var m = G.missiles[i];
      items.push({ t: 'box', x: m.x, y: m.y, z: m.z, w: 0.16, h: 0.15, d: 0.5, yaw: m.dir, c: '#e8452f' });
      items.push({ t: 'dot', x: m.x - Math.sin(m.dir) * 0.32, y: m.y + 0.02, z: m.z - Math.cos(m.dir) * 0.32, r: 0.11, c: '#ffb020', a: 0.9 });
    }

    /* macchine */
    for (i = 0; i < G.cars.length; i++) pushCar(items, G.cars[i], t);

    /* particelle */
    for (i = 0; i < G.particles.length; i++) {
      var pt = G.particles[i];
      var a = Math.max(0, Math.min(1, pt.life / pt.max));
      var it = { t: pt.kind === 'sq' ? 'sq' : 'dot', x: pt.x, y: pt.y, z: pt.z, c: pt.c, a: a };
      if (pt.kind === 'sq') it.s = pt.size * (1 + (1 - a) * 1.5);
      else it.r = pt.size * (0.6 + a * 0.6);
      items.push(it);
    }

    for (i = 0; i < items.length; i++) R.push(items[i]);
  }

  function pushCar(items, car, t) {
    if (car.y < -9) return;
    var ca = Math.cos(car.yaw), sa = Math.sin(car.yaw);
    function W(lx, lz) {
      return [car.x + lx * ca + lz * sa, car.z - lx * sa + lz * ca];
    }
    var y = car.y;
    var shadowA = Math.max(0, Math.min(0.8, 0.8 - Math.abs(car.y) * 0.18));
    items.push({ t: 'flat', x: car.x, y: 0.016, z: car.z, w: 1.4, d: 2.0, yaw: car.yaw, img: SHADOW, a: shadowA });
    if (shadowA <= 0.02) return;

    var bob = Math.sin(t * 9 + car.id * 1.7) * 0.008 * Math.min(1, car.speed / 6);
    var p = W(0, 0);
    items.push({ t: 'box', x: p[0], y: y + 0.10 + bob, z: p[1], w: 0.62, h: 0.26, d: 1.15, yaw: car.yaw, c: car.color });
    p = W(0, -0.1);
    items.push({ t: 'box', x: p[0], y: y + 0.36 + bob, z: p[1], w: 0.44, h: 0.2, d: 0.5, yaw: car.yaw, c: car.dark });
    var wl = [[-0.36, 0.34], [0.36, 0.34], [-0.36, -0.36], [0.36, -0.36]];
    for (var i = 0; i < 4; i++) {
      p = W(wl[i][0], wl[i][1]);
      items.push({ t: 'box', x: p[0], y: y + 0.02, z: p[1], w: 0.12, h: 0.2, d: 0.3, yaw: car.yaw, c: '#15131b' });
    }
    p = W(0, -0.54);
    items.push({ t: 'box', x: p[0], y: y + 0.42, z: p[1], w: 0.64, h: 0.07, d: 0.13, yaw: car.yaw, c: car.accent });
    if (car.spinT > 0) {
      items.push({ t: 'dot', x: car.x, y: y + 0.75, z: car.z, r: 0.14, c: '#ffd166', a: 0.7 + Math.sin(t * 30) * 0.3 });
    }
  }

  /* ---------------- minimappa ---------------- */
  function buildMinimap() {
    var track = G.track, sp = track.spline;
    var pts = [];
    for (var i = 0; i < sp.count; i += 3) pts.push([sp.x[i], sp.z[i]]);
    pts.push([sp.x[0], sp.z[0]]);
    var b = track.def.bounds;
    var W = els.minimap.width, H = els.minimap.height, pad = 9;
    var sc = Math.min((W - pad * 2) / (b.x1 - b.x0), (H - pad * 2) / (b.z1 - b.z0));
    G.mm = {
      pts: pts, sc: sc,
      ox: pad - b.x0 * sc + ((W - pad * 2) - (b.x1 - b.x0) * sc) * 0.5,
      oz: pad - b.z0 * sc + ((H - pad * 2) - (b.z1 - b.z0) * sc) * 0.5
    };
    var p0 = track.posAt(0);
    G.mm.p0 = [p0.x + p0.nx * p0.halfW, p0.z + p0.nz * p0.halfW,
               p0.x - p0.nx * p0.halfW, p0.z - p0.nz * p0.halfW];
  }

  function drawMinimap() {
    var g = mmCtx, mm = G.mm;
    if (!mm) return;
    var W = els.minimap.width, H = els.minimap.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(12,10,16,.68)';
    g.fillRect(0, 0, W, H);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    var i, p;
    function trace() {
      g.beginPath();
      for (i = 0; i < mm.pts.length; i++) {
        p = mm.pts[i];
        var x = p[0] * mm.sc + mm.ox, y = p[1] * mm.sc + mm.oz;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.strokeStyle = 'rgba(0,0,0,.9)'; g.lineWidth = 7; trace();
    g.strokeStyle = 'rgba(247,239,225,.85)'; g.lineWidth = 3.5; trace();
    g.strokeStyle = '#ffc93c'; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(mm.p0[0] * mm.sc + mm.ox, mm.p0[1] * mm.sc + mm.oz);
    g.lineTo(mm.p0[2] * mm.sc + mm.ox, mm.p0[3] * mm.sc + mm.oz);
    g.stroke();
    for (i = 0; i < G.cars.length; i++) {
      var c = G.cars[i];
      var x2 = c.x * mm.sc + mm.ox, y2 = c.z * mm.sc + mm.oz;
      g.beginPath();
      g.arc(x2, y2, c.isPlayer ? 4 : 3, 0, MM.TAU);
      g.fillStyle = c.color;
      g.fill();
      if (c.isPlayer) {
        g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
      }
    }
  }

  /* ---------------- HUD ---------------- */
  function setTxt(el, v) {
    if (el._v !== v) { el._v = v; el.textContent = v; }
  }

  function updateHUD() {
    var pc = G.player;
    if (!pc) return;
    setTxt(els.pos, pc.rank + '°');
    setTxt(els.lap, 'GIRO ' + Math.min(G.laps, pc.lap + 1) + '/' + G.laps);
    setTxt(els.time, MM.formatTime(G.time));
    setTxt(els.best, G.best != null ? 'record ' + MM.formatTime(G.best) : 'record —');
    setTxt(els.speed, String(Math.round(pc.speed * 8)));
    var pct = Math.min(100, (pc.speed / T.MAX) * 100);
    var bv = Math.round(pct);
    if (els.bar._v !== bv) { els.bar._v = bv; els.bar.style.width = bv + '%'; }
    var it = pc.item || '';
    if (it !== G._lastItem) refreshItemHUD();
    drawMinimap();
  }

  /* ---------------- render ---------------- */
  G.render = function () {
    if (!G.track) return;
    R.begin(G.cam, G.track);
    pushScene(G.t);
    R.end();
    if (G.mode === 'race' || G.mode === 'countdown' || G.mode === 'results') updateHUD();
  };

  /* ---------------- selezione pista ---------------- */
  var MAT_COLOR = {
    wood: '#a9713f', felt: '#1c7a52', carpet: '#c9553f',
    plank: '#c08a4e', paper: '#e6dcc4', tile: '#d8d3c8'
  };

  function drawCardThumb(cv, def) {
    var g = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    g.fillStyle = MAT_COLOR[def.surfaces[0].mat] || '#a9713f';
    g.fillRect(0, 0, W, H);
    var pts = def.points, i;
    var x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (i = 0; i < pts.length; i++) {
      if (pts[i].x < x0) x0 = pts[i].x;
      if (pts[i].x > x1) x1 = pts[i].x;
      if (pts[i].z < z0) z0 = pts[i].z;
      if (pts[i].z > z1) z1 = pts[i].z;
    }
    var pad = 16;
    var sc = Math.min((W - pad * 2) / Math.max(1, x1 - x0), (H - pad * 2) / Math.max(1, z1 - z0));
    var ox = pad - x0 * sc + ((W - pad * 2) - (x1 - x0) * sc) * 0.5;
    var oz = pad - z0 * sc + ((H - pad * 2) - (z1 - z0) * sc) * 0.5;
    function trace() {
      g.beginPath();
      for (i = 0; i < pts.length; i++) {
        var x = pts[i].x * sc + ox, y = pts[i].z * sc + oz;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
    }
    g.lineJoin = 'round'; g.lineCap = 'round';
    trace();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 14; g.stroke();
    trace();
    g.strokeStyle = '#efe7d4'; g.lineWidth = 9; g.stroke();
    trace();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.stroke();
    var sx = pts[0].x * sc + ox, sz = pts[0].z * sc + oz;
    g.fillStyle = '#ffc93c';
    g.fillRect(sx - 3, sz - 3, 6, 6);
    g.strokeStyle = '#0e0c12'; g.lineWidth = 1; g.strokeRect(sx - 3, sz - 3, 6, 6);
  }

  G.buildCards = function () {
    var wrap = $('cards');
    wrap.innerHTML = '';
    MM.trackDefs.forEach(function (def, i) {
      var card = document.createElement('button');
      card.className = 'card';
      var best = MM.storage.get('best.' + def.id, null);
      var cv = document.createElement('canvas');
      cv.width = 240; cv.height = 118;
      card.appendChild(cv);
      if (best != null) {
        var rec = document.createElement('span');
        rec.className = 'rec';
        rec.textContent = MM.formatTime(best);
        card.appendChild(rec);
      }
      var body = document.createElement('div');
      body.className = 'card-body';
      var h = document.createElement('h3');
      h.textContent = def.name;
      var sub = document.createElement('div');
      sub.className = 'sub';
      sub.textContent = def.sub;
      var diff = document.createElement('div');
      diff.className = 'diff';
      for (var d = 0; d < 3; d++) {
        var b = document.createElement('i');
        if (d < def.diff) b.className = 'on';
        diff.appendChild(b);
      }
      var lab = document.createElement('span');
      lab.textContent = 'difficoltà ' + def.diff + '/3';
      diff.appendChild(lab);
      body.appendChild(h); body.appendChild(sub); body.appendChild(diff);
      card.appendChild(body);
      drawCardThumb(cv, def);
      card.addEventListener('click', function () {
        MM.Audio.sfx('select');
        G.startRace(i, false);
        G.showScreen(null);
      });
      wrap.appendChild(card);
    });
  };
})();
