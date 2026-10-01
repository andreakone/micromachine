/* physics — simulazione delle macchinine: motore, derapata, aderenza,
   caduta dal tavolo, collisioni e giri di pista. */
(function () {
  'use strict';
  var MM = (window.MM = window.MM || {});

  MM.TUNE = {
    ACC: 17,
    BRAKE: 26,
    REV: 6,
    MAX: 14.5,
    NITRO_MUL: 1.42,
    NITRO_ACC: 1.8,
    STEER: 2.65,
    GRIP_ON: 8.5,
    GRIP_OFF: 4.2,
    DRAG: 0.55,
    DRAG_OFF: 1.6,
    CAR_R: 0.6,
    REST: 0.35,
    FALL_G: 34,
    SPIN_T: 1.05
  };
  var T = MM.TUNE;

  function surfaceAt(car, track, near) {
    var p = track.posAt(near.s);
    var half = p.halfW;
    return { onRoad: Math.abs(near.lat) <= half * 0.98, half: half, br: p.br };
  }

  function hazardGrip(world, car) {
    var g = Infinity;
    var i, h, list, li;
    var lists = [world.track.hazards, world.track.hazardsDyn, world.hazards];
    for (li = 0; li < lists.length; li++) {
      list = lists[li];
      for (i = 0; i < list.length; i++) {
        h = list[i];
        var dx = car.x - h.x, dz = car.z - h.z;
        if (dx * dx + dz * dz < h.r * h.r) {
          g = Math.min(g, h.k === 'oil' ? 1.7 : 3.4);
          if (h.k === 'water') car.wet = 0.7;
        }
      }
    }
    return g;
  }

  /* ---- passo singola macchina (input: steer -1..1, throttle/brake 0..1) ---- */
  MM.stepCar = function (car, world, inp, dt) {
    var track = world.track;

    if (car.state === 'fall') {
      car.vy -= T.FALL_G * dt;
      car.y += car.vy * dt;
      car.x += car.vx * dt;
      car.z += car.vz * dt;
      car.fallT += dt;
      car.yaw += car.steer * 1.4 * dt;
      if (car.fallT > 1.05 || car.y < -7) MM.respawn(car, track);
      return;
    }

    if (car.respawnT > 0) car.respawnT = Math.max(0, car.respawnT - dt);
    var frozen = car.respawnT > 0 || car.state === 'finish';
    var steerT = frozen ? 0 : (inp.steer || 0);
    car.steer = MM.damp(car.steer, steerT, 13, dt);

    var near = track.nearest(car.x, car.z, car.hint);
    car.hint = near.i;
    var sOld = car.s;
    car.s = near.s;
    car.lat = near.lat;

    // progresso / giri
    var L = track.length;
    if (sOld >= 0) {
      var d = car.s - sOld;
      if (d < -L * 0.5) d += L;
      else if (d > L * 0.5) d -= L;
      car.progress += d;
    }
    var lapNow = Math.floor(Math.max(0, car.progress) / L);
    if (lapNow > car.lap && car.state === 'ok') {
      car.lap = lapNow;
      if (world.onLap) world.onLap(car, car.lap);
    }

    var surf = surfaceAt(car, track, near);
    car.onRoad = surf.onRoad;

    // caduta dal tavolo
    if (!track.solid(car.x, car.z)) {
      car.state = 'fall';
      car.fallT = 0;
      car.vy = Math.max(1.2, Math.abs(car.speed) * 0.2);
      MM.Audio.sfx('fall');
      if (world.onFall) world.onFall(car);
      return;
    }

    // derapata /.controllo
    var fdirx = Math.sin(car.yaw), fdirz = Math.cos(car.yaw);
    var rdirx = Math.cos(car.yaw), rdirz = -Math.sin(car.yaw);
    var vf = car.vx * fdirx + car.vz * fdirz;
    var vr = car.vx * rdirx + car.vz * rdirz;

    var grip = surf.onRoad ? T.GRIP_ON : T.GRIP_OFF;
    var hg = hazardGrip(world, car);
    if (hg < grip) grip = hg;
    if (car.spinT > 0) grip = Math.min(grip, 1.5);
    if (car.wet > 0) grip *= 0.75;

    var braking = 0;
    if (!frozen) {
      if (inp.throttle > 0) {
        var maxS = T.MAX * (car.nitroT > 0 ? T.NITRO_MUL : 1);
        vf += T.ACC * (car.nitroT > 0 ? T.NITRO_ACC : 1) * inp.throttle * dt;
        if (vf > maxS) vf = Math.max(maxS, vf - 6 * dt);
      }
      if (inp.brake > 0) {
        braking = 1;
        if (vf > 0.15) vf -= T.BRAKE * dt;
        else vf -= T.ACC * 0.55 * dt;
        if (vf < -T.REV) vf = -T.REV;
      }
    }
    if (frozen) braking = 1;

    var drag = surf.onRoad ? T.DRAG : T.DRAG_OFF;
    vf -= vf * drag * dt;
    vr -= vr * (grip) * dt;

    // sterzo
    var spd = Math.abs(vf);
    var sf = Math.min(1, Math.max(0.3, spd / 2.4)) * (1 - 0.3 * Math.max(0, spd - 7) / 7.5);
    var yawRate;
    if (car.spinT > 0) {
      yawRate = car.spinDir * 9.5;
      car.spinT -= dt;
      vf *= Math.exp(-1.6 * dt);
      if (car.spinT <= 0) { car.spinT = 0; car.spinDir = 0; }
    } else {
      yawRate = car.steer * T.STEER * sf;
    }
    car.yaw = MM.wrapAngle(car.yaw + yawRate * dt);

    // ricomposizione nel frame "vecchio": la velocità inerziale resta nel mondo
    car.vx = vf * fdirx + vr * rdirx;
    car.vz = vf * fdirz + vr * rdirz;
    car.x += car.vx * dt;
    car.z += car.vz * dt;
    car.vf = vf;
    car.speed = Math.hypot(car.vx, car.vz);

    // effetti temporanei
    if (car.nitroT > 0) car.nitroT -= dt;
    if (car.wet > 0) car.wet -= dt;
    car.drift = Math.min(1, Math.abs(vr) / 2.6);
    if (car.hitT > 0) car.hitT -= dt;
    if (car.bumpCd > 0) car.bumpCd -= dt;

    if (car.state === 'finish') {
      // raffreddamento dopo il traguardo
      if (world.onFinishedCoast) world.onFinishedCoast(car, dt);
    }
  };

  MM.respawn = function (car, track) {
    var near = track.nearest(car.x, car.z, car.hint);
    var p = track.posAt(near.s - 4);
    car.x = p.x; car.z = p.z;
    car.y = 0; car.vy = 0;
    car.yaw = Math.atan2(p.tx, p.tz);
    car.vx = 0; car.vz = 0; car.vf = 0; car.speed = 0;
    car.state = 'ok';
    var nn = track.nearest(car.x, car.z, -1);
    car.s = nn.s;
    car.hint = nn.i;
    car.respawnT = 0.35;
    MM.Audio.sfx('respawn');
    if (car.isPlayer && window.MM && MM.game && MM.game.shake) MM.game.shake(0.06);
  };

  /* ---- box ruotati (ostacoli quadrati) vs cerchio ---- */
  function circleVsBox(car, p) {
    var dx = car.x - p.x, dz = car.z - p.z;
    var ca = Math.cos(p.yaw || 0), sa = Math.sin(p.yaw || 0);
    var lx = dx * ca - dz * sa;
    var lz = dx * sa + dz * ca;
    var hw = p.w / 2, hd = p.d / 2;
    var qx = Math.max(-hw, Math.min(hw, lx));
    var qz = Math.max(-hd, Math.min(hd, lz));
    var ex = lx - qx, ez = lz - qz;
    var d2 = ex * ex + ez * ez;
    var R = T.CAR_R + (p.y ? 0.05 : 0);
    if (d2 >= R * R) return null;
    var d = Math.sqrt(d2);
    var nlx, nlz;
    if (d < 1e-4) {
      // centro dentro: spingi fuori sull'asse più corto
      var ox = hw - Math.abs(lx), oz = hd - Math.abs(lz);
      if (ox < oz) { nlx = lx < 0 ? -1 : 1; nlz = 0; d = -ox; }
      else { nlx = 0; nlz = lz < 0 ? -1 : 1; d = -oz; }
      R = 0;
    } else { nlx = ex / d; nlz = ez / d; }
    // normale nel mondo
    var nx = nlx * ca + nlz * sa;
    var nz = -nlx * sa + nlz * ca;
    return { nx: nx, nz: nz, push: (R - d) };
  }

  MM.collideProps = function (car, world, dt) {
    if (car.state !== 'ok') return;
    var props = world.track.props;
    var i;
    for (i = 0; i < props.length; i++) {
      var p = props[i];
      if (p.y && p.y > 1.4) continue;
      var hit;
      if (p.kind === 'ball' || p.kind === 'mug') {
        var dx = car.x - p.x, dz = car.z - p.z;
        var rr = T.CAR_R + p.cr;
        var d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          var d = Math.sqrt(d2);
          hit = { nx: dx / d, nz: dz / d, push: rr - d };
        } else hit = null;
      } else {
        hit = circleVsBox(car, p);
      }
      if (hit) {
        car.x += hit.nx * hit.push;
        car.z += hit.nz * hit.push;
        var vn = car.vx * hit.nx + car.vz * hit.nz;
        if (vn < 0) {
          var imp = -vn;
          car.vx += hit.nx * imp * 1.45;
          car.vz += hit.nz * imp * 1.45;
          car.speed = Math.hypot(car.vx, car.vz);
          if (imp > 2.2 && car.bumpCd <= 0) {
            car.bumpCd = 0.25;
            MM.Audio.sfx('bump');
            if (car.isPlayer && MM.game) MM.game.shake(Math.min(0.05, imp * 0.008));
            if (MM.game) MM.game.spawnHit(car.x, car.z, imp);
          }
        }
      }
    }
  };

  MM.collideCars = function (cars) {
    var i, j;
    for (i = 0; i < cars.length; i++) {
      var a = cars[i];
      if (a.state !== 'ok') continue;
      for (j = i + 1; j < cars.length; j++) {
        var b = cars[j];
        if (b.state !== 'ok') continue;
        var dx = b.x - a.x, dz = b.z - a.z;
        var d2 = dx * dx + dz * dz;
        var R = T.CAR_R * 2;
        if (d2 >= R * R || d2 < 1e-6) continue;
        var d = Math.sqrt(d2);
        var nx = dx / d, nz = dz / d;
        var push = (R - d) * 0.5;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
        var rvx = b.vx - a.vx, rvz = b.vz - a.vz;
        var vn = rvx * nx + rvz * nz;
        if (vn < 0) {
          var jimp = -(1 + T.REST) * vn * 0.5;
          a.vx -= nx * jimp; a.vz -= nz * jimp;
          b.vx += nx * jimp; b.vz += nz * jimp;
          a.speed = Math.hypot(a.vx, a.vz);
          b.speed = Math.hypot(b.vx, b.vz);
          var mag = -vn;
          if (mag > 2.6) {
            MM.Audio.sfx('hit');
            if (MM.game) {
              MM.game.shake(Math.min(0.07, mag * 0.01));
              MM.game.spawnHit((a.x + b.x) / 2, (a.z + b.z) / 2, mag);
            }
            if (mag > 6) {
              if (a.spinT <= 0 && mag > 9) { a.spinT = 0.55; a.spinDir = (Math.random() < 0.5 ? -1 : 1); }
              if (b.spinT <= 0 && mag > 9) { b.spinT = 0.55; b.spinDir = (Math.random() < 0.5 ? -1 : 1); }
            }
          }
        }
      }
    }
  };

  /* ---- ritrova la posizione sull'asse dopo una caduta ---- */
  MM.placeOnTrack = function (car, track, s) {
    var p = track.posAt(s);
    car.x = p.x; car.z = p.z; car.y = 0;
    car.yaw = Math.atan2(p.tx, p.tz);
    car.vx = car.vz = 0;
    car.hint = p.i;
    car.s = ((s % track.length) + track.length) % track.length;
    car.prevS = car.s;
  };
})();
