/* ai — avversari automatici: mirano avanti sulla pista, tagliano le curve,
   evitano ostacoli e pericoli, usano gli oggetti. */
(function () {
  'use strict';
  var MM = (window.MM = window.MM || {});

  MM.makeAI = function (skill) {
    return {
      skill: skill || 0.95,
      itemCd: 1 + Math.random() * 2,
      aggro: 0.5 + Math.random() * 0.5,
      _still: 0,
      _side: 0,
      _sideT: 0
    };
  };

  MM.thinkAI = function (car, world, dt) {
    var inp = { steer: 0, throttle: 0, brake: 0, use: 0 };
    var ai = car.ai;
    if (!ai) return inp;
    if (car.state !== 'ok' || car.respawnT > 0) return inp;
    if (ai._still == null) { ai._still = 0; ai._side = 0; ai._sideT = 0; }

    var track = world.track, t = MM.TUNE;
    var spd = car.vf || 0;
    var count = track.spline.count;

    /* --- bersaglio: punto della pista più avanti --- */
    var ahead = 3.0 + Math.max(0, spd) * 0.62;
    var baseS = car.s + ahead;
    var p = track.posAt(baseS);

    /* --- curvatura massima davanti: limita la velocità --- */
    var maxK = 0, j;
    for (j = 2; j <= 28; j += 4) {
      var k = track.curvAt((car.hint + j) % count);
      if (k > maxK) maxK = k;
    }
    var vmax = maxK > 1e-4 ? Math.sqrt(13.5 / maxK) : 99;
    vmax *= ai.skill;
    if (p.br) vmax *= 1.06;

    /* --- offset: taglio curva --- */
    var off = 0;
    var fut = track.posAt(baseS + 5 + spd * 0.35);
    var offAmt = p.halfW * 0.42;
    var c1x = p.x + p.nx * offAmt, c1z = p.z + p.nz * offAmt;
    var c2x = p.x - p.nx * offAmt, c2z = p.z - p.nz * offAmt;
    var d1 = (c1x - fut.x) * (c1x - fut.x) + (c1z - fut.z) * (c1z - fut.z);
    var d2 = (c2x - fut.x) * (c2x - fut.x) + (c2z - fut.z) * (c2z - fut.z);
    off = d1 < d2 ? offAmt : -offAmt;

    var sy = Math.sin(car.yaw), cy = Math.cos(car.yaw);
    var i;

    /* minaccia ravvicinata: ostacoli e avversari nel cono davanti.
       La minaccia più vicina detta il lato dell'evitamento. */
    var threatFz = 1e9;

    var props = track.props;
    for (i = 0; i < props.length; i++) {
      var pr = props[i];
      if (pr.y && pr.y > 1.4) continue;
      var dx = pr.x - car.x, dz = pr.z - car.z;
      var fz = dx * sy + dz * cy;
      if (fz < -0.8 || fz > 7.5) continue;
      var lx = dx * cy - dz * sy;
      var reach = 0.6 + pr.cr + 0.75;
      if (Math.abs(lx) < reach) {
        var push = (reach - Math.abs(lx)) * (1.6 - fz * 0.12);
        off += (lx > 0 ? -push : push);
        if (fz < 4.5) vmax = Math.min(vmax, 4.0 + fz * 1.1);
        if (fz < 4 && fz < threatFz) {
          threatFz = fz;
          if (Math.abs(lx) > 0.4) ai._side = lx > 0 ? -1 : 1;
          else if (ai._side === 0) ai._side = car.lat > 0 ? -1 : 1;
        }
      }
    }

    var hz = track.hazards, h;
    for (i = 0; i < hz.length; i++) {
      h = hz[i];
      var hx = h.x - car.x, hz2 = h.z - car.z;
      var hf = hx * sy + hz2 * cy;
      if (hf < 0.3 || hf > 6.5) continue;
      var hl = hx * cy - hz2 * sy;
      if (Math.abs(hl) < h.r + 0.75) {
        var push2 = (h.r + 0.75 - Math.abs(hl)) * (1.3 - hf * 0.12);
        off += (hl > 0 ? -push2 : push2);
      }
    }

    /* avversari troppo vicini davanti */
    var cars = world.cars;
    for (i = 0; i < cars.length; i++) {
      var o = cars[i];
      if (o === car || o.state !== 'ok') continue;
      var ox = o.x - car.x, oz = o.z - car.z;
      var ofz = ox * sy + oz * cy;
      if (ofz < 0.5 || ofz > 5.5) continue;
      var olx = ox * cy - oz * sy;
      if (Math.abs(olx) < 1.25) {
        var push3 = (1.25 - Math.abs(olx)) * (1.2 - ofz * 0.13);
        off += (olx > 0 ? -push3 : push3);
        if (ofz < 2.6) vmax = Math.min(vmax, 7.5);
        if (ofz < 4 && ofz < threatFz) {
          threatFz = ofz;
          if (Math.abs(olx) > 0.4) ai._side = olx > 0 ? -1 : 1;
          else if (ai._side === 0) ai._side = car.lat > 0 ? -1 : 1;
        }
      }
    }

    /* evitamento deciso: punta già di lato all'altezza della minaccia,
       così si passa accanto senza tagliare l'angolo */
    var dodge = threatFz < 4 && ai._side !== 0;
    if (dodge) {
      ai._sideT = 1.5;
      p = track.posAt(car.s + Math.max(1.2, threatFz));
      off = ai._side * p.halfW * 0.85;
    } else if (ai._sideT > 0) {
      /* per un attacco dopo l'evitamento si tiene il largo */
      ai._sideT -= dt;
      p = track.posAt(car.s + 2.5 + Math.max(0, spd) * 0.5);
      off = ai._side * p.halfW * 0.85;
      if (ai._sideT <= 0 || ai._side === 0) { ai._sideT = 0; ai._side = 0; }
    } else {
      var maxOff = p.halfW * 0.8;
      off = Math.max(-maxOff, Math.min(maxOff, off));
    }

    var tx = p.x + p.nx * off;
    var tz = p.z + p.nz * off;

    /* se fuori dalla pista torna al centro */
    if (Math.abs(car.lat) > p.halfW * 0.9) {
      var pc = track.posAt(car.s + 3.5);
      tx = pc.x; tz = pc.z;
    }

    var ang = Math.atan2(tx - car.x, tz - car.z);
    var diff = MM.wrapAngle(ang - car.yaw);
    inp.steer = Math.max(-1, Math.min(1, diff * 2.6));

    /* --- velocità --- */
    if (spd > vmax + 0.4) {
      inp.brake = 1;
      inp.throttle = 0;
    } else {
      inp.throttle = ai.skill;
      if (spd > vmax - 1.2) inp.throttle *= 0.55;
      if (spd < 1.2) inp.throttle = 1;
    }
    /* dopo uno spintone vf può diventare negativo: il freno sarebbe la
       retromarcia, quindi acceleriamo per rimetterlo in avanti */
    if (spd < -0.2) {
      inp.throttle = ai.skill;
      inp.brake = 0;
    }

    /* --- oggetti --- */
    ai.itemCd -= dt;
    if (car.item && ai.itemCd <= 0 && Math.abs(diff) < 0.35) {
      var use = false;
      if (car.item === 'nitro') {
        use = spd > 3 && spd < t.MAX * 0.92;
      } else if (car.item === 'oil') {
        for (i = 0; i < cars.length; i++) {
          var c2 = cars[i];
          if (c2 === car || c2.state !== 'ok') continue;
          var bx = c2.x - car.x, bz = c2.z - car.z;
          var bf = bx * sy + bz * cy;
          if (bf < -0.5 && bf > -7 && Math.abs(bx * cy - bz * sy) < 1.6) { use = true; break; }
        }
      } else if (car.item === 'missile') {
        var best = null, bestD = 1e9;
        for (i = 0; i < cars.length; i++) {
          var c3 = cars[i];
          if (c3 === car || c3.state !== 'ok') continue;
          var dd = c3.progress - car.progress;
          if (dd > 0 && dd < bestD) { bestD = dd; best = c3; }
        }
        use = best !== null && bestD < 26;
      }
      if (use) {
        inp.use = 1;
        ai.itemCd = 1.4 + Math.random() * 1.6;
      }
    }
    if (!car.item) ai.itemCd = Math.max(ai.itemCd, 0.4);

    /* blocco contro un ostacolo: dopo ~0.9s fermi, retromarcia di lato
       per sganciarsi, poi si riparte tenendo il largo per un tratto */
    if (ai._still >= 0.7 || Math.abs(spd) < 0.6) ai._still += dt;
    else ai._still = 0;
    if (ai._still >= 0.7) {
      if (ai._still < 2.0) {
        inp.throttle = 0;
        inp.brake = 1;
        inp.steer = ai._side || (off >= 0 ? 1 : -1);
        inp.use = 0;
      } else {
        ai._still = 0;
        if (ai._side === 0) ai._side = off >= 0 ? 1 : -1;
        ai._sideT = 1.8;
      }
    }

    return inp;
  };
})();
