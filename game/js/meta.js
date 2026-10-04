/* version + access counter + battle counter (bc). Counters never appear to decrease:
 * shown value = max(server, last shown) persisted in localStorage. */
(function () {
  'use strict';
  var BASE = 'https://abacus.jasoncameron.dev';
  var VISIT = 'nikkukyuu/nekotsuri', BATTLE = 'nikkukyuu/nekotsuri-battles';
  var VLAST = 'nekotsuri_visitLast', BLAST = 'nekotsuri_battleLast';
  function fmtTime(ms) {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(ms)).replace('T', ' ');
  }
  function readLast(k) { try { var v = Number(localStorage.getItem(k)); return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0; } catch (_) { return 0; } }
  function writeLast(k, v) { try { if (v > readLast(k)) localStorage.setItem(k, String(Math.floor(v))); } catch (_) {} }
  function val(d) { var v = d && Number(d.value); return Number.isFinite(v) && v >= 0 ? Math.floor(v) : null; }
  function get(url, timeout) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = setTimeout(function () { try { ctrl && ctrl.abort(); } catch (_) {} }, timeout || 4000);
    return fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + '_=' + Date.now(), { cache: 'no-store', mode: 'cors', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { clearTimeout(t); if (r.status === 404) return { value: 0 }; return r.ok ? r.json() : null; })
      .catch(function () { clearTimeout(t); return null; });
  }
  function show(el, label, key, v) {
    var best = Math.max(v || 0, readLast(key));
    if (best > 0 || v === 0) { writeLast(key, best); el.textContent = label + best.toLocaleString('ja-JP'); el.hidden = false; }
  }
  var visited = false;
  function initTitleMeta() {
    var vEl = document.getElementById('meta-version');
    if (vEl) vEl.textContent = 'ver ' + fmtTime(NK.BUILD_TIME);
    var aEl = document.getElementById('meta-visits'), bEl = document.getElementById('meta-battles');
    if (aEl) { show(aEl, 'アクセス ', VLAST, 0); if (!readLast(VLAST)) aEl.textContent = 'アクセス —'; }
    if (bEl) show(bEl, 'bc ', BLAST, 0);
    if (!visited && aEl) {
      visited = true;
      get(BASE + '/hit/' + VISIT).then(function (d) { var v = val(d); if (v != null) show(aEl, 'アクセス ', VLAST, v); });
    }
    if (bEl) get(BASE + '/get/' + BATTLE).then(function (d) { var v = val(d); if (v != null) show(bEl, 'bc ', BLAST, v); });
  }
  function hitBattle() {
    get(BASE + '/hit/' + BATTLE).then(function (d) { var v = val(d); if (v != null) writeLast(BLAST, v); });
  }
  window.NKMeta = { initTitleMeta: initTitleMeta, hitBattle: hitBattle, fmtTime: fmtTime };
})();
