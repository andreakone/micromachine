/* input — tastiera, touch e gamepad confluisci in un'unica istruzione */
(function () {
  'use strict';
  var MM = (window.MM = window.MM || {});

  var keys = Object.create(null);
  var touchBtns = { left: 0, right: 0, gas: 0, brake: 0, item: 0 };
  var cmds = [];
  var itemEdge = false;
  var padIndex = -1;

  var I = {
    axis: { steer: 0, throttle: 0, brake: 0 },
    touchMode: false,
    onPause: null
  };

  var HANDLED = {
    ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1,
    KeyA: 1, KeyD: 1, KeyW: 1, KeyS: 1,
    Space: 1, ShiftLeft: 1, ShiftRight: 1, KeyZ: 1,
    KeyP: 1, Escape: 1, KeyM: 1, Enter: 1
  };

  function onDown(e) {
    if (e.repeat) { if (HANDLED[e.code]) e.preventDefault(); return; }
    keys[e.code] = 1;
    if (HANDLED[e.code]) e.preventDefault();
    if (e.code === 'Escape' || e.code === 'KeyP') cmds.push('pause');
    else if (e.code === 'KeyM') cmds.push('mute');
    else if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyZ') itemEdge = true;
  }
  function onUp(e) { keys[e.code] = 0; }

  I.init = function () {
    window.addEventListener('keydown', onDown, { passive: false });
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', function () { keys = Object.create(null); clearTouch(); });

    var tmq = location.search.match(/[?&]touch=(\d)/);
    if (tmq) I.touchMode = tmq[1] === '1';
    else {
      var st = MM.storage.get('touch', -1);
      I.touchMode = st >= 0 ? !!st
        : (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
    }

    var buttons = document.querySelectorAll('#touch .tbtn');
    Array.prototype.forEach.call(buttons, function (b) {
      var name = b.getAttribute('data-btn');
      b.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (name === 'pause') { cmds.push('pause'); return; }
        b.setPointerCapture && b.setPointerCapture(e.pointerId);
        touchBtns[name] = 1;
        if (name === 'item') itemEdge = true;
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
        b.addEventListener(ev, function (e) { e.preventDefault(); touchBtns[name] = 0; });
      });
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });

    window.addEventListener('gamepadconnected', function (e) {
      padIndex = e.gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', function () { padIndex = -1; });
  };

  function clearTouch() { for (var k in touchBtns) touchBtns[k] = 0; }

  I.drain = function () {
    var out = cmds;
    cmds = [];
    return out;
  };

  I.consumeItem = function () {
    var v = itemEdge;
    itemEdge = false;
    return v;
  };

  function readPad() {
    if (!navigator.getGamepads) return null;
    var pads = navigator.getGamepads();
    var pad = null;
    if (padIndex >= 0 && pads[padIndex]) pad = pads[padIndex];
    if (!pad) {
      for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { pad = pads[i]; padIndex = i; break; }
    }
    if (!pad) return null;
    return pad;
  }

  /* ricava l'asse composito: chiave > touch > gamepad */
  I.poll = function () {
    var a = I.axis;
    var steer = (keys.ArrowRight || keys.KeyD || touchBtns.right ? 1 : 0) -
                (keys.ArrowLeft || keys.KeyA || touchBtns.left ? 1 : 0);
    var thr = (keys.ArrowUp || keys.KeyW || touchBtns.gas) ? 1 : 0;
    var brk = (keys.ArrowDown || keys.KeyS || touchBtns.brake) ? 1 : 0;

    var pad = readPad();
    if (pad) {
      var ax = pad.axes[0] || 0;
      if (Math.abs(ax) > 0.16) steer = ax;
      if (pad.buttons[0] && pad.buttons[0].pressed) thr = 1;
      if (pad.buttons[1] && pad.buttons[1].pressed) brk = 1;
      if (pad.buttons[2] && pad.buttons[2].pressed && !pad._itemHeld) {
        itemEdge = true; pad._itemHeld = true;
      } else if (pad.buttons[2] && !pad.buttons[2].pressed) pad._itemHeld = false;
      if (pad.buttons[9] && pad.buttons[9].pressed && !pad._pauseHeld) {
        cmds.push('pause'); pad._pauseHeld = true;
      } else if (pad.buttons[9] && !pad.buttons[9].pressed) pad._pauseHeld = false;
      if ((pad.buttons[14] && pad.buttons[14].pressed)) steer = -1;
      if ((pad.buttons[15] && pad.buttons[15].pressed)) steer = 1;
    }

    a.steer = Math.max(-1, Math.min(1, steer));
    a.throttle = thr;
    a.brake = brk;
    return a;
  };

  MM.Input = I;
})();
