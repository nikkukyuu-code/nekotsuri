/* tiny WebAudio synth */
(function () {
  'use strict';
  var ctx = null, muted = false;
  function ac() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { ctx = null; } } if (ctx && ctx.state === 'suspended') ctx.resume(); return ctx; }
  function tone(f, d, type, vol, slide, delay) {
    if (muted) return; var c = ac(); if (!c) return;
    var t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t + d);
    g.gain.setValueAtTime(vol || 0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + 0.02);
  }
  var S = {
    tap: function () { tone(660, 0.05, 'square', 0.04); },
    cast: function () { tone(900, 0.25, 'triangle', 0.07, 300); },
    land: function () { tone(220, 0.12, 'sine', 0.1, 120); },
    nibble: function () { tone(1200, 0.04, 'square', 0.04); },
    bite: function () { tone(1568, 0.08, 'square', 0.09); tone(1976, 0.12, 'square', 0.09, null, 0.08); },
    hook: function () { tone(500, 0.1, 'sawtooth', 0.08, 1000); },
    reel: function () { tone(1800 + Math.random() * 300, 0.02, 'square', 0.02); },
    pull: function () { tone(160, 0.18, 'sawtooth', 0.06, 90); },
    snap: function () { tone(1400, 0.05, 'square', 0.1, 200); tone(120, 0.3, 'sawtooth', 0.08, 50, 0.05); },
    fail: function () { tone(400, 0.2, 'triangle', 0.08, 200); tone(300, 0.3, 'triangle', 0.08, 150, 0.18); },
    catch: function () { [784, 988, 1175, 1568].forEach(function (f, i) { tone(f, 0.14, 'square', 0.06, null, i * 0.09); }); },
    meow: function () { tone(700, 0.35, 'triangle', 0.07, 450); },
    coin: function () { tone(1319, 0.06, 'square', 0.05); tone(1760, 0.1, 'square', 0.05, null, 0.06); },
    clear: function () { [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) { tone(f, 0.16, 'square', 0.06, null, i * 0.12); }); },
  };
  window.NKSound = { play: function (k) { try { S[k] && S[k](); } catch (_) {} }, unlock: ac, setMuted: function (m) { muted = !!m; }, isMuted: function () { return muted; } };
})();
