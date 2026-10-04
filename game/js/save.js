/* 猫ハウスつり — progress storage. Keys are STABLE (never rename):
 *   nekotsuri-save-v1      main save (JSON)
 *   nekotsuri-save-v1-bak  backup copy (same content, written every save)
 *   nekotsuri-pref-v1      settings (mute)
 * All counters are monotonic (earned / spent / baitBought / baitUsed ...), so coins = earned - spent
 * and merging two copies by max() can never lose progress. Only intentional spends raise `spent`.
 */
(function () {
  'use strict';
  var KEY = 'nekotsuri-save-v1', BAK = 'nekotsuri-save-v1-bak', PREF = 'nekotsuri-pref-v1';
  function n(v) { v = Number(v); return Number.isFinite(v) && v > 0 ? v : 0; }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function parse(s) { try { var o = JSON.parse(s); return o && typeof o === 'object' ? o : null; } catch (_) { return null; } }
  function blank() {
    return { v: 1, earned: 0, spent: 0, baitBought: {}, baitUsed: {}, rod: 1, dex: {}, stageMax: 1, stageBest: {}, medals: {}, stats: {}, updated: 0 };
  }
  function maxMap(a, b) { var o = {}; [obj(a), obj(b)].forEach(function (m) { Object.keys(m).forEach(function (k) { o[k] = Math.max(o[k] || 0, n(m[k])); }); }); return o; }
  // field-wise max merge (same device: main vs backup, or another tab)
  function merge(a, b) {
    a = obj(a); b = obj(b);
    var out = blank();
    out.earned = Math.max(n(a.earned), n(b.earned));
    out.spent = Math.max(n(a.spent), n(b.spent));
    if (out.spent > out.earned) out.spent = out.earned;
    out.baitBought = maxMap(a.baitBought, b.baitBought);
    out.baitUsed = maxMap(a.baitUsed, b.baitUsed);
    out.rod = Math.max(1, n(a.rod), n(b.rod));
    out.stageMax = Math.max(1, n(a.stageMax), n(b.stageMax));
    out.stageBest = maxMap(a.stageBest, b.stageBest);
    out.medals = maxMap(a.medals, b.medals);
    out.stats = maxMap(a.stats, b.stats);
    var dex = {};
    [obj(a.dex), obj(b.dex)].forEach(function (m) {
      Object.keys(m).forEach(function (k) {
        var e = obj(m[k]), c = dex[k] || { n: 0, best: 0, first: 0 };
        dex[k] = { n: Math.max(c.n, n(e.n)), best: Math.max(c.best, n(e.best)), first: c.first && n(e.first) ? Math.min(c.first, n(e.first)) : (c.first || n(e.first)) };
      });
    });
    out.dex = dex;
    out.updated = Math.max(n(a.updated), n(b.updated));
    return out;
  }
  var state = null;
  // main is authoritative for the coin pair (earned, spent) and bait pairs; the backup fills in
  // anything missing (e.g. main lost/corrupted) and can only raise dex / medals / stage etc.
  function readStored() {
    var a = null, b = null;
    try { a = parse(localStorage.getItem(KEY)); b = parse(localStorage.getItem(BAK)); } catch (_) {}
    var m = merge(a || {}, b || {});
    if (a && (n(a.earned) > 0 || !b)) {
      m.earned = n(a.earned); m.spent = Math.min(n(a.spent), m.earned);
      var ab = obj(a.baitBought), au = obj(a.baitUsed);
      Object.keys(ab).forEach(function (k) { m.baitBought[k] = n(ab[k]); m.baitUsed[k] = n(au[k]); });
    }
    return m;
  }
  function load() { state = readStored(); return state; }
  function save() {
    if (!state) return;
    try {
      var stored = readStored();
      var m = merge(stored, state); // never let a write lower anything
      Object.keys(m).forEach(function (k) { state[k] = m[k]; });
      state.updated = Date.now();
      var s = JSON.stringify(state);
      localStorage.setItem(KEY, s);
      localStorage.setItem(BAK, s);
    } catch (_) {}
  }
  function coins() { return Math.max(0, n(state.earned) - n(state.spent)); }
  function earn(c) { c = Math.floor(n(c)); if (c > 0) { state.earned += c; save(); } }
  function spend(c) { c = Math.floor(n(c)); if (c <= 0 || coins() < c) return false; state.spent += c; save(); return true; }
  function baitCount(id) { if (id === 'niboshi') return Infinity; return Math.max(0, n(state.baitBought[id]) - n(state.baitUsed[id])); }
  function useBait(id) { if (id === 'niboshi') return true; if (baitCount(id) <= 0) return false; state.baitUsed[id] = n(state.baitUsed[id]) + 1; save(); return true; }
  function addBait(id, k) { state.baitBought[id] = n(state.baitBought[id]) + k; save(); }
  function stat(k, d) { state.stats[k] = n(state.stats[k]) + (d == null ? 1 : d); }
  function loadPref() { try { return obj(parse(localStorage.getItem(PREF))); } catch (_) { return {}; } }
  function savePref(p) { try { localStorage.setItem(PREF, JSON.stringify(p)); } catch (_) {} }
  window.NKSave = { load: load, save: save, get: function () { return state; }, coins: coins, earn: earn, spend: spend, baitCount: baitCount, useBait: useBait, addBait: addBait, stat: stat, merge: merge, loadPref: loadPref, savePref: savePref, KEY: KEY, BAK: BAK };
})();
