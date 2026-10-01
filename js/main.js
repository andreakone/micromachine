/* main — avvio del gioco: caricamento delle piste, wiring dei pulsanti
   e ciclo di aggiornamento/renderrizzazione a richiesta. */
(function () {
  'use strict';
  var MM = (window.MM = window.MM || {});

  var $ = function (id) { return document.getElementById(id); };
  var quals = [[480, 270], [640, 360], [800, 450]];
  var qualIdx = 1;
  var renderer = null;
  var last = 0;
  var frames = 0;

  /* ---------------- audio (richiede un gesto dell'utente) ---------------- */
  function unlockAudio() {
    MM.Audio.init();
    MM.Audio.update();
    setAudioLabel();
  }
  function setAudioLabel() {
    $('audio-val').textContent = MM.Audio.muted ? 'OFF' : 'ON';
  }

  /* ---------------- qualità di render ---------------- */
  function setQuality(i) {
    qualIdx = ((i % quals.length) + quals.length) % quals.length;
    var q = quals[qualIdx];
    renderer.setResolution(q[0], q[1]);
    $('quality-val').textContent = q[0] + '×' + q[1];
    MM.storage.set('qual', qualIdx);
    fitScale();
  }

  /* ---------------- navigazione schermate ---------------- */
  function goTitle() {
    MM.Audio.sfx('back');
    if (MM.game.mode !== 'attract') MM.game.startRace(MM.game.trackIdx, true);
    MM.game.showScreen('title');
  }

  function startSelected(i) {
    MM.game.startRace(i, false);
    MM.game.showScreen(null);
  }

  /* ---------------- pulsanti ---------------- */
  function wire() {
    var G = MM.game;

    function applyTouchUI() {
      var t = MM.Input.touchMode;
      document.documentElement.classList.toggle('touch', t);
      $('title-hint').textContent = t
        ? 'tocca GIOCA · in gara ◀ ▶ sterzano, GAS accelera, ◎ oggetto, II pausa'
        : 'frecce o A/D per sterzare · SPAZIO usa oggetto · P pausa';
      var tv = $('touch-val');
      if (tv) tv.textContent = t ? 'TOUCH' : 'TASTIERA';
      if (MM.game.tracks && MM.game.tracks.length) MM.game.showScreen(MM.game.screen);
    }
    function setTouch(on) {
      MM.Input.touchMode = !!on;
      MM.storage.set('touch', on ? 1 : 0);
      applyTouchUI();
    }
    applyTouchUI();

    /* ---------- PWA: install + service worker ---------- */
    var deferredPrompt = null;
    var btnInstall = $('btn-install');
    function showInstall(label) {
      btnInstall.textContent = label;
      btnInstall.classList.remove('hidden');
    }
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      showInstall('INSTALLA SULLO SCHERMO');
    });
    window.addEventListener('appinstalled', function () {
      btnInstall.classList.add('hidden');
      deferredPrompt = null;
    });
    btnInstall.onclick = function () {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function () {
          deferredPrompt = null;
          btnInstall.classList.add('hidden');
        });
      } else if (/iP(hone|ad|od)/.test(navigator.userAgent)) {
        alert('Su iPhone/iPad: tocca Condividi ↗ e scegli\n"Aggiungi a schermata Home".');
      }
    };
    if (!deferredPrompt && /iP(hone|ad|od)/.test(navigator.userAgent) &&
        !window.navigator.standalone) {
      showInstall('COME INSTALLARE');
    }

    $('btn-play').onclick = function () {
      MM.Audio.sfx('select');
      if (coarse && fsApi() && oMQ && oMQ.matches && !isFS()) goFS();
      G.buildCards();
      G.showScreen('select');
    };
    $('btn-help').onclick = function () {
      MM.Audio.sfx('select');
      G.showScreen('help');
    };
    $('btn-quality').onclick = function () {
      MM.Audio.sfx('select');
      setQuality(qualIdx + 1);
    };
    $('btn-audio').onclick = function () {
      unlockAudio();
      MM.Audio.toggleMute();
      setAudioLabel();
      if (!MM.Audio.muted) MM.Audio.sfx('select');
    };
    $('btn-touch').onclick = function () {
      MM.Audio.sfx('select');
      setTouch(!MM.Input.touchMode);
    };

    /* ---------- schermo intero (fullscreen alla rotazione, solo touch) ---------- */
    var coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    var pendingFS = false;
    function fsApi() {
      var el = document.documentElement;
      return el.requestFullscreen || el.webkitRequestFullscreen || null;
    }
    function isFS() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
    function setFsLabels() {
      var b = $('btn-fs');
      if (b) b.textContent = isFS() ? 'SCHERMO NORMALE' : 'SCHERMO INTERO';
    }
    function goFS() {
      var api = fsApi();
      if (!api) return;
      try {
        var p = api.call(document.documentElement);
        if (p && p.then) {
          p.then(function () {
            pendingFS = false;
            try {
              if (screen.orientation && screen.orientation.lock) {
                var lp = screen.orientation.lock('landscape');
                if (lp && lp.catch) lp.catch(function () {});
              }
            } catch (e) {}
          }).catch(function () { pendingFS = true; });
        }
      } catch (e) { pendingFS = true; }
    }
    function exitFS() {
      try {
        var x = document.exitFullscreen || document.webkitExitFullscreen;
        if (x) x.call(document);
      } catch (e) {}
    }
    function toggleFS() { if (isFS()) exitFS(); else goFS(); }
    document.addEventListener('fullscreenchange', setFsLabels);
    document.addEventListener('webkitfullscreenchange', setFsLabels);

    var oMQ = window.matchMedia && matchMedia('(orientation: landscape)');
    function onOrient(e) {
      if (!coarse) return;
      pendingFS = false;
      if (e.matches) { if (!isFS()) goFS(); }
      else if (isFS()) exitFS();
    }
    if (oMQ) {
      if (oMQ.addEventListener) oMQ.addEventListener('change', onOrient);
      else if (oMQ.addListener) oMQ.addListener(onOrient);
      if (coarse && oMQ.matches && fsApi()) goFS();
    }
    document.addEventListener('pointerdown', function () {
      if (pendingFS && coarse && !isFS()) { pendingFS = false; goFS(); }
    }, true);

    var btnFs = $('btn-fs');
    if (btnFs) {
      if (!fsApi()) btnFs.classList.add('hidden');
      btnFs.onclick = function () { MM.Audio.sfx('select'); toggleFS(); };
    }
    var touchFs = $('touch-fs');
    if (touchFs) {
      if (!fsApi()) touchFs.classList.add('hidden');
      touchFs.addEventListener('click', function () { toggleFS(); });
      touchFs.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }
    setFsLabels();

    $('btn-back-title').onclick = goTitle;
    $('btn-back-help').onclick = goTitle;

    $('btn-resume').onclick = function () {
      MM.Audio.sfx('back');
      G.resume();
    };
    $('btn-restart').onclick = function () {
      MM.Audio.sfx('select');
      startSelected(G.trackIdx);
    };
    $('btn-quit').onclick = function () {
      MM.Audio.engine(0, 0, 0, false);
      MM.Audio.sfx('back');
      G.startRace(G.trackIdx, true);
      G.showScreen('title');
    };

    $('btn-again').onclick = function () {
      MM.Audio.sfx('select');
      startSelected(G.trackIdx);
    };
    $('btn-change').onclick = function () {
      MM.Audio.sfx('select');
      G.startRace(G.trackIdx, true);
      G.buildCards();
      G.showScreen('select');
    };

    document.addEventListener('pointerdown', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) MM.game.pause();
    });
  }

  /* ---------------- comandi da tastiera (pausa/audio) ---------------- */
  function handleCmds() {
    var cmds = MM.Input.drain();
    if (!cmds.length) return;
    var G = MM.game;
    for (var i = 0; i < cmds.length; i++) {
      if (cmds[i] === 'pause') {
        if (G.screen === 'pause') G.resume();
        else if (G.mode === 'race' || G.mode === 'countdown') G.pause();
      } else if (cmds[i] === 'mute') {
        unlockAudio();
        MM.Audio.toggleMute();
        setAudioLabel();
      }
    }
  }

  /* ---------------- ciclo ---------------- */
  function loop(ts) {
    frames++;
    var dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60;
    last = ts;
    handleCmds();
    MM.game.update(dt);
    MM.game.render();
    requestAnimationFrame(loop);
  }

  /* ---------------- caricamento piste ---------------- */
  function boot() {
    window.__dbgGround = location.search.indexOf('dbg') >= 0;
    renderer = new MM.Renderer($('view'));
    MM.game.init(renderer);
    MM.Input.init();
    wire();
    setQuality(MM.storage.get('qual', 1));
    setAudioLabel();

    var defs = MM.trackDefs;
    var out = [];
    var i = 0;
    function step() {
      if (i < defs.length) {
        var def = defs[i];
        $('loadtext').textContent = 'preparazione: ' + def.name.toLowerCase() + '…';
        var t = MM.buildTrack(def);
        MM.finalizeTrack(t);
        out.push(t);
        i++;
        $('loadbar').style.width = Math.round((i / defs.length) * 100) + '%';
        setTimeout(step, 24);
      } else {
        MM.game.tracks = out;
        var q = location.search;
        if (q.indexOf('gara') >= 0) {
          MM.game.startRace(q.indexOf('pista=') >= 0 ? (parseInt(q.split('pista=')[1], 10) || 0) : 0, false);
          MM.game.showScreen(null);
          var ffm = q.match(/ff=([0-9.]+)/);
          if (q.indexOf('gdbg') >= 0) {
            var gi = q.indexOf('pista=') >= 0 ? (parseInt(q.split('pista=')[1], 10) || 0) : 0;
            var trk = MM.game.tracks[gi];
            var pg = trk.posAt(-3.6), pg2 = trk.posAt(-6.4), p0 = trk.posAt(0);
            var g0 = MM.game.cars[0];
            console.log('GRID len=' + trk.length.toFixed(1) +
              ' A(-3.6)=' + pg.x.toFixed(1) + ',' + pg.z.toFixed(1) + ' hw=' + pg.halfW.toFixed(2) +
              ' B(-6.4)=' + pg2.x.toFixed(1) + ',' + pg2.z.toFixed(1) + ' hw=' + pg2.halfW.toFixed(2) +
              ' L(0)=' + p0.x.toFixed(1) + ',' + p0.z.toFixed(1));
            console.log('GRID c0=' + g0.x.toFixed(1) + ',' + g0.z.toFixed(1) +
              ' lat=' + g0.lat.toFixed(2) + ' s=' + g0.s.toFixed(1) +
              ' solid=' + trk.solid(g0.x, g0.z) +
              ' | c2=' + MM.game.cars[2].x.toFixed(1) + ',' + MM.game.cars[2].z.toFixed(1) +
              ' lat=' + MM.game.cars[2].lat.toFixed(2) +
              ' solid=' + trk.solid(MM.game.cars[2].x, MM.game.cars[2].z));
          }
          if (ffm) {
            MM.game.ffAI = true;
            if (MM.game.player && !MM.game.player.ai) {
              MM.game.player.ai = MM.makeAI(0.99);
            }
            for (var f = 0, n = Math.round(parseFloat(ffm[1]) * 60); f < n; f++) {
              MM.game.update(1 / 60);
            }
            MM.game.ffAI = false;
            MM.game.render();
          }
        } else if (q.indexOf('sel') >= 0) {
          MM.game.startRace(0, true);
          MM.game.buildCards();
          MM.game.showScreen('select');
        } else {
          MM.game.startRace(0, true);
          MM.game.buildCards();
          MM.game.showScreen('title');
        }
        $('load').classList.add('off');
        requestAnimationFrame(loop);
      }
    }
    if (location.search.indexOf('gdbg') >= 0) {
      setTimeout(function () {
        var ps = MM.game.player;
        var s = 'GDBG frames=' + frames + ' mode=' + MM.game.mode +
          ' screen=' + MM.game.screen +
          ' cd=' + MM.game.countdown.toFixed(2) + ' now=' + performance.now().toFixed(0);
        if (ps) {
          s += ' | p=' + ps.x.toFixed(1) + ',' + ps.z.toFixed(1) +
            ' spd=' + ps.speed.toFixed(2) + ' st=' + ps.state +
            ' road=' + ps.onRoad + ' resp=' + ps.respawnT.toFixed(2) +
            ' spin=' + ps.spinT.toFixed(2) + ' lat=' + ps.lat.toFixed(2) +
            ' s=' + ps.s.toFixed(1) + ' lap=' + ps.lap + ' vf=' + ps.vf.toFixed(2);
        }
        var cars = MM.game.cars;
        for (var ci = 0; ci < cars.length; ci++) {
          var c = cars[ci];
          s += ' || c' + ci + '=' + c.x.toFixed(1) + ',' + c.z.toFixed(1) +
            ' spd=' + c.speed.toFixed(1) + ' st=' + c.state + ' s=' + c.s.toFixed(1) +
            ' lat=' + c.lat.toFixed(2) + ' spin=' + c.spinT.toFixed(2) +
            ' hit=' + c.hitT.toFixed(2) + ' vf=' + c.vf.toFixed(2) +
            ' lap=' + c.lap + ' resp=' + c.respawnT.toFixed(2) +
            ' yaw=' + c.yaw.toFixed(2) + ' st=' + c.steer.toFixed(2) +
            (c.state === 'finish' ? ' ft=' + c.finishTime.toFixed(1) : '');
        }
        try {
          if (cars[2] && MM.game.world) {
            var wIn = MM.thinkAI(cars[2], MM.game.world, 1 / 60);
            var wIn2 = MM.thinkAI(cars[1], MM.game.world, 1 / 60);
            var wIn3 = MM.thinkAI(cars[3], MM.game.world, 1 / 60);
            s += ' || AI2=' + wIn.steer.toFixed(2) + '/' + wIn.throttle.toFixed(2) +
              '/' + wIn.brake.toFixed(2) + ' AI1=' + wIn2.steer.toFixed(2) +
              '/' + wIn2.throttle.toFixed(2) + '/' + wIn2.brake.toFixed(2) +
              ' AI3=' + wIn3.steer.toFixed(2) + '/' + wIn3.throttle.toFixed(2) +
              '/' + wIn3.brake.toFixed(2);
            var props = MM.game.track.props;
            for (var pi = 0; pi < props.length; pi++) {
              var pr = props[pi];
              for (var cj = 1; cj < 4; cj++) {
                var cc = cars[cj];
                var pd = Math.hypot(pr.x - cc.x, pr.z - cc.z);
                if (pd < 1.6) {
                  s += ' || hit c' + cj + '<-' + pr.kind +
                    ' d=' + pd.toFixed(2) + ' at ' + pr.x.toFixed(1) + ',' + pr.z.toFixed(1);
                }
              }
            }
          }
        } catch (e) { s += ' || AIERR ' + e.message; }
        console.log(s);
      }, 8000);
    }
    setTimeout(step, 60);
  }

  /* ---------------- PWA: service worker (autonomo dal wiring) ---------------- */
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    var hadCtrl = !!navigator.serviceWorker.controller;
    var wantReload = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadCtrl) { hadCtrl = true; return; }
      if (wantReload && !location.search) {
        wantReload = false;
        location.reload();
      }
    });
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        reg.addEventListener('updatefound', function () {
          var sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', function () {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              wantReload = true;
              try { sw.postMessage('skipWaiting'); } catch (e) {}
            }
          });
        });
      }).catch(function () {});
    });
  }

  /* resa: pixelated solo a scala intera, altrimenti sfarfallio sui bordi */
  function fitScale() {
    var v = document.getElementById('view');
    if (!v) return;
    var r = v.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var s = Math.min(r.width / v.width, r.height / v.height);
    v.classList.toggle('smooth', s < 1 || Math.abs(s - Math.round(s)) > 0.06);
  }
  window.addEventListener('resize', fitScale);
  window.addEventListener('orientationchange', fitScale);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { boot(); fitScale(); });
  } else {
    boot();
    fitScale();
  }
})();
