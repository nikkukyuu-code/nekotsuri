/* 猫ハウスつり — main game */
(function () {
  'use strict';
  var B = NK.BREEDS, BAITS = NK.BAITS, SPOTS = NK.SPOTS, RODS = NK.RODS, MEDALS = NK.MEDALS;
  var BY = {}; B.forEach(function (b) { BY[b.id] = b; });
  var BAITBY = {}; BAITS.forEach(function (b) { BAITBY[b.id] = b; });
  var SND = NKSound, SV = NKSave;
  var V = (document.querySelector('meta[name="nk-v"]') || {}).content || '';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function stars(r) { return '★'.repeat(r) + '☆'.repeat(5 - r); }
  function fmt(n) { return Math.floor(n).toLocaleString('ja-JP'); }

  /* ---------- assets ---------- */
  var IMG = {};
  function loadImg(key, src) {
    return new Promise(function (res) {
      var im = new Image(); im.onload = function () { IMG[key] = im; res(); }; im.onerror = function () { res(); };
      im.src = src + (V ? '?v=' + V : '');
    });
  }
  function assetList() {
    var L = [['house', 'assets/cathouse.jpg']];
    B.forEach(function (b) { ['walk', 'walk2', 'sit', 'leap'].forEach(function (p) { L.push([b.id + '_' + p, 'assets/cats/' + b.id + '_' + p + '.png']); }); });
    ['sleep_a', 'sleep_b', 'sleep_c'].forEach(function (k) { L.push([k, 'assets/cats/' + k + '.png']); });
    BAITS.forEach(function (b) { L.push(['bait_' + b.id, 'assets/items/bait_' + b.id + '.png']); });
    ['rod', 'net', 'bucket', 'bucket_empty', 'coins', 'medal'].forEach(function (k) { L.push([k, 'assets/items/' + k + '.png']); });
    return L;
  }
  function catSrc(id, pose) { return 'assets/cats/' + id + '_' + pose + '.png' + (V ? '?v=' + V : ''); }
  function itemSrc(k) { return 'assets/items/' + k + '.png' + (V ? '?v=' + V : ''); }

  /* ---------- screens ---------- */
  function show(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('active', s.id === id); });
    if (id === 'scr-title') { refreshTitle(); if (window.__nkCheckUpdate) setTimeout(window.__nkCheckUpdate, 800); }
    if (id === 'scr-play') setTimeout(resize, 0);
  }
  function overlay(id, on) { $(id).classList.toggle('show', !!on); }

  /* ---------- title ---------- */
  var selStage = 1;
  function refreshTitle() {
    var s = SV.get();
    selStage = clamp(selStage || s.stageMax, 1, s.stageMax);
    $('title-coins').textContent = fmt(SV.coins());
    $('title-stage').textContent = 'ステージ ' + selStage;
    $('stage-prev').disabled = selStage <= 1;
    $('stage-next').disabled = selStage >= s.stageMax;
    var got = B.filter(function (b) { return s.dex[b.id] && s.dex[b.id].n > 0; }).length;
    $('title-dex').textContent = got + '/' + B.length;
    $('title-medal').textContent = Object.keys(s.medals).length + '/' + MEDALS.length;
    $('btn-mute').textContent = SND.isMuted() ? '🔇 音OFF' : '🔊 音ON';
    NKMeta.initTitleMeta();
  }

  /* ---------- toast ---------- */
  var toastT = null;
  function toast(msg, ms) {
    var el = $('toast'); el.innerHTML = msg; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove('show'); }, ms || 1800);
  }

  /* ---------- medals ---------- */
  function award(id) {
    var s = SV.get(); if (s.medals[id]) return;
    var m = MEDALS.filter(function (x) { return x.id === id; })[0]; if (!m) return;
    s.medals[id] = Date.now(); SV.earn(m.reward); SV.save();
    medalQueue.push(m);
  }
  var medalQueue = [];
  function flushMedals() {
    if (!medalQueue.length) return;
    var m = medalQueue.shift();
    var el = $('medal-pop');
    el.innerHTML = '<img src="' + itemSrc('medal') + '" alt=""><div><b>メダル獲得！</b><span>' + esc(m.name) + '</span><small>+' + fmt(m.reward) + 'コイン</small></div>';
    el.classList.add('show'); SND.play('clear');
    setTimeout(function () { el.classList.remove('show'); setTimeout(flushMedals, 400); }, 2600);
  }
  function checkMedals() {
    var s = SV.get(), st = s.stats;
    if ((st.catches || 0) >= 1) award('first');
    if ((st.perfect || 0) >= 10) award('bait');
    if ((st.catches || 0) >= 50) award('n50');
    if (B.some(function (b) { return b.r >= 4 && s.dex[b.id] && s.dex[b.id].n > 0; })) award('big');
    if (s.dex.kin && s.dex.kin.n > 0) award('gold');
    if (B.every(function (b) { return s.dex[b.id] && s.dex[b.id].n > 0; })) award('dex');
    if (s.stageMax > 6) award('stage6');
    flushMedals();
  }

  /* ---------- canvas & layout (fixed: the whole cat house is always visible, no camera) ---------- */
  var cv, cx, LW = 450, LH = 700, K = 1, DPR = 1;
  var IW = 1376, IHH = 768;
  var VIEW = { x: 0, y: 0, s: 1, w: 450, h: 245 }, ZOOM = null; // ZOOM = fixed close-up window (null if no room)
  function resize() {
    var wrap = $('stage-wrap'); if (!wrap || !cv) return;
    var w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
    K = w / LW; LH = h / K;
    var mainH = LW * IHH / IW;
    if (LH < mainH) { LH = mainH; K = h / LH; }
    DPR = Math.min(2.5, window.devicePixelRatio || 1);
    cv.style.width = Math.round(LW * K) + 'px'; cv.style.height = Math.round(LH * K) + 'px';
    cv.width = Math.round(LW * K * DPR); cv.height = Math.round(LH * K * DPR);
    cx.imageSmoothingEnabled = false;
    var rest = LH - mainH;
    if (rest >= 150) {
      VIEW = { x: 0, y: 0, s: LW / IW, w: LW, h: mainH };
      ZOOM = { x: 8, y: mainH + 8, w: LW - 16, h: rest - 14 };
      ZOOM.s = clamp(ZOOM.w / 360, 1.0, 1.35);
    } else {
      VIEW = { x: 0, y: (LH - mainH) / 2, s: LW / IW, w: LW, h: mainH };
      ZOOM = null;
    }
  }
  function toScreen(x, y) { return { x: VIEW.x + x * VIEW.s, y: VIEW.y + y * VIEW.s }; }

  /* ---------- game state ---------- */
  var G = null;
  var ANG = { x: 1322, y: 742 }; // angler feet (garden, right edge of the picture)
  var FALLBACK = { id: 'floor', name: 'ふつうの床', cats: ['chatora', 'kijitora', 'kuro'] };
  function unlockedSpots(n) { return SPOTS.filter(function (s) { return s.stage <= n; }); }
  function nearestSpot(x, y, onlyUnlocked) {
    var best = null, bd = 1e9;
    SPOTS.forEach(function (s) {
      if (onlyUnlocked && s.stage > G.stage) return;
      var d = Math.hypot(s.x - x, (s.y - y) * 1.3);
      if (d < bd) { bd = d; best = s; }
    });
    return { spot: best, d: bd };
  }
  function areaAt(x, y) { var n = nearestSpot(x, y, false); return n.d <= 170 ? n.spot : null; }
  function startStage(n) {
    var info = NK.stageInfo(n);
    var sp = unlockedSpots(n);
    var first = sp[sp.length - 1];
    G = {
      info: info, stage: n, casts: info.casts, caught: 0, earned: 0, breaks: 0, got: [],
      state: 'idle', t: 0, bait: 'niboshi', aim: { x: first.x, y: first.y }, zc: { x: first.x, y: first.y },
      power: 0, powerDir: 1, acc: 0, cat: null, bob: null, holding: false, texts: [], area: null,
      ambient: makeAmbient(n), sleepers: makeSleepers(), goalShown: false, ended: false,
    };
    if (SV.baitCount(lastBait) > 0) G.bait = lastBait;
    show('scr-play');
    resize(); renderBaits(); updateHud(); setHint();
    NKMeta.hitBattle();
    SV.stat('stagesPlayed'); SV.save();
    toast('ステージ ' + n + '<br><small>' + info.casts + '回のキャストで ' + info.target + '匹 つろう！<br>家の中をタップして、ねらう場所を決めよう</small>', 2600);
  }
  var lastBait = 'niboshi';
  function makeAmbient(n) {
    var pool = B.filter(function (b) { return b.r <= 2; }), out = [];
    for (var i = 0; i < 3; i++) {
      var b = pool[Math.floor(Math.random() * pool.length)];
      out.push({ id: b.id, x: rnd(380, 1080), y: rnd(600, 700), tx: rnd(380, 1080), wait: rnd(0, 3), f: 0 });
    }
    return out;
  }
  function makeSleepers() {
    return [{ k: 'sleep_a', x: 236, y: 352 }, { k: 'sleep_c', x: 1140, y: 386 }, { k: 'sleep_b', x: 430, y: 590 }];
  }

  /* ---------- HUD / controls ---------- */
  function aimInfo() {
    var a = areaAt(G.aim.x, G.aim.y);
    if (!a) return { name: '家の床（ふつうの猫）', sub: '場所の近くをねらうと、その場所の猫が来ます', locked: false, spot: null };
    if (a.stage > G.stage) return { name: a.name + ' 🔒', sub: 'ステージ' + a.stage + 'で解放（今は、ふつうの猫だけ）', locked: true, spot: null };
    var cats = a.cats.map(function (id) { var d = SV.get().dex[id]; return d && d.n > 0 ? BY[id].name : '？'; });
    return { name: a.name, sub: '出る猫：' + cats.join('・'), locked: false, spot: a };
  }
  function updateHud() {
    if (!G) return;
    $('hud-stage').textContent = 'ST ' + G.stage;
    $('hud-casts').textContent = G.casts;
    $('hud-caught').textContent = G.caught + '/' + G.info.target;
    $('hud-coins').textContent = fmt(SV.coins());
    var ai = aimInfo();
    $('aim-name').textContent = '🎯 ' + ai.name;
    $('aim-sub').textContent = ai.sub;
    var busy = G.state !== 'idle';
    document.querySelectorAll('.bait-chip').forEach(function (c) {
      var id = c.getAttribute('data-bait'), n = SV.baitCount(id);
      c.classList.toggle('sel', id === G.bait);
      c.disabled = busy || n <= 0;
      c.querySelector('.bc').textContent = n === Infinity ? '∞' : n;
    });
    var mb = $('main-btn'), lab = { idle: '🎣 キャスト', power: '⏹ 止める！', fly: '…', wait: '↩ 回収する', nibble: '…じっと待つ', bite: '❗ 合わせる！', hooked: '…', reel: '🌀 長押しで巻く', done: '…' }[G.state] || '…';
    mb.textContent = lab;
    mb.className = 'main-btn st-' + G.state + (G.holding ? ' holding' : '');
  }
  function setHint() {
    if (!G) return;
    var h = {
      idle: '家の中をタップしてねらう場所を決め、エサを選んで「キャスト」（←→でも選べます）',
      power: 'ゲージが真ん中（グレート）で止めると、ねらいどおりに飛んでレアな猫も来やすい！',
      fly: '', wait: '猫が来るのを待とう…（押すとエサを回収）',
      nibble: 'まだ！ ウキがピクピク…大きく沈むまで待つ',
      bite: '今だ！ 合わせる！',
      hooked: 'かかった！',
      reel: '押している間リールを巻く。テンションが赤になる前に離す・青のままだと逃げる',
      done: '',
    }[G.state];
    $('hint').textContent = h || '';
  }
  function renderBaits() {
    $('baits').innerHTML = BAITS.map(function (b) {
      return '<button type="button" class="bait-chip" data-bait="' + b.id + '" title="' + esc(b.name + '：' + b.desc) + '"><img src="' + itemSrc('bait_' + b.id) + '" alt=""><span class="bn">' + esc(b.name) + '</span><span class="bc"></span></button>';
    }).join('');
    document.querySelectorAll('.bait-chip').forEach(function (c) {
      c.addEventListener('click', function () { if (!G || G.state !== 'idle') return; G.bait = c.getAttribute('data-bait'); lastBait = G.bait; SND.play('tap'); updateHud(); });
    });
  }
  function setAim(x, y) {
    G.aim.x = clamp(x, 60, 1230); G.aim.y = clamp(y, 40, 735);
    var a = areaAt(G.aim.x, G.aim.y);
    if (a && a.stage <= G.stage) { G.aim.x = lerp(G.aim.x, a.x, 0.6); G.aim.y = lerp(G.aim.y, a.y, 0.6); }
    SND.play('tap'); updateHud();
  }
  function moveSpot(d) { // keyboard: jump the aim between unlocked areas (the view never moves)
    if (!G || G.state !== 'idle') return;
    var list = unlockedSpots(G.stage).slice().sort(function (a, b) { return a.x - b.x; });
    var cur = nearestSpot(G.aim.x, G.aim.y, true).spot, i = list.indexOf(cur);
    var nx = list[(i + d + list.length) % list.length];
    G.aim.x = nx.x; G.aim.y = nx.y; SND.play('tap'); updateHud();
  }
  function cycleBait(d) {
    if (!G || G.state !== 'idle') return;
    var ids = BAITS.map(function (b) { return b.id; }).filter(function (id) { return SV.baitCount(id) > 0; });
    var i = ids.indexOf(G.bait); G.bait = ids[(i + d + ids.length) % ids.length]; lastBait = G.bait; SND.play('tap'); updateHud();
  }
  function setState(s) { G.state = s; G.t = 0; updateHud(); setHint(); }

  /* ---------- fishing logic ---------- */
  function pickCat() {
    var sp = G.area || FALLBACK, bait = BAITBY[G.bait];
    var boost = bait.boost + (G.acc > 0.9 ? 0.45 : G.acc > 0.65 ? 0.15 : 0);
    var pool = sp.cats.map(function (id) {
      var b = BY[id], w = NK.RARITY_W[b.r] * (1 + boost * (b.r - 1));
      if (b.like.indexOf(bait.id) >= 0) w *= 3.2;
      if (b.id === 'kin' && bait.id !== 'yaki') w = 0;
      return [b, w];
    });
    var tot = pool.reduce(function (a, p) { return a + p[1]; }, 0), r = Math.random() * tot;
    for (var i = 0; i < pool.length; i++) { r -= pool[i][1]; if (r <= 0) return pool[i][0]; }
    return pool[0][0];
  }
  function press() {
    if (!G) return;
    SND.unlock();
    var st = G.state;
    if (st === 'idle') {
      if (G.casts <= 0) return;
      if (SV.baitCount(G.bait) <= 0) { toast('エサがありません'); return; }
      G.power = 0; G.powerDir = 1; setState('power'); SND.play('tap');
    } else if (st === 'power') {
      G.acc = 1 - Math.abs(G.power - 0.5) * 2;
      G.casts--; SV.stat('casts');
      // short (left half of gauge) = lands nearer the angler (right), long = farther left
      var miss = (1 - G.acc) * 150, dir = G.power < 0.5 ? 1 : -1;
      var lx = clamp(G.aim.x + dir * miss + rnd(-12, 12), 60, 1230), ly = clamp(G.aim.y + rnd(-10, 10) * (1 - G.acc), 40, 735);
      G.bob = { x: lx, y: ly, dip: 0, twitch: 0, fx: ANG.x, fy: ANG.y };
      var a = nearestSpot(lx, ly, true);
      G.area = a.d <= 170 ? a.spot : null;
      var lab = G.acc > 0.9 ? 'グレート！' : G.acc > 0.65 ? 'ナイス！' : (G.power < 0.5 ? '手前に落ちた…' : '飛びすぎ…');
      addText(lab, null, G.acc > 0.9 ? '#ffd24a' : '#fff', 26);
      SND.play('cast'); setState('fly');
    } else if (st === 'wait') {
      addText('回収した', null, '#fff', 20);
      G.cat = null; G.bob = null; setState('idle'); afterCast();
    } else if (st === 'nibble') {
      addText('はやすぎ！ 猫がにげた…', null, '#ff8a8a', 22);
      SND.play('fail'); catFlee(); SV.stat('early');
    } else if (st === 'bite') {
      var perfect = G.t <= G.cat.b.win * 0.4;
      SND.play('hook'); SND.play('meow');
      if (perfect) { SV.stat('perfect'); addText('パーフェクト合わせ！', null, '#ffd24a', 26); }
      else addText('かかった！', null, '#fff', 26);
      G.cat.perfect = perfect;
      var rod = RODS[clamp(SV.get().rod, 1, RODS.length) - 1];
      G.reel = { dist: perfect ? 82 : 100, tension: perfect ? 30 : 40, slack: 0, burst: false, burstT: rnd(0.8, 1.6), stam: 1, rod: rod, clk: 0 };
      SV.save(); setState('hooked');
    } else if (st === 'reel') {
      G.holding = true; updateHud();
    }
  }
  function release() { if (G && G.holding) { G.holding = false; updateHud(); } }
  function catFlee() {
    if (G.cat) { G.cat.flee = true; G.cat.fleeDir = G.cat.side; }
    G.bob = null; setState('done'); G.doneT = 1.1;
  }
  function afterCast() {
    updateHud();
    if (G.casts <= 0 && G.state === 'idle') setTimeout(function () { if (G && G.state === 'idle' && G.casts <= 0) endStage(); }, 700);
  }
  function landCat() {
    var c = G.cat, b = c.b, kg = Math.round(rnd(b.kg[0], b.kg[1]) * 10) / 10;
    var mid = (b.kg[0] + b.kg[1]) / 2;
    var coin = Math.round(b.coin * (0.75 + 0.5 * (kg - b.kg[0]) / (b.kg[1] - b.kg[0])) * (c.perfect ? 1.2 : 1) * G.info.mul);
    var s = SV.get(), d = s.dex[b.id] || { n: 0, best: 0, first: 0 }, isNew = !d.n;
    d.n++; d.best = Math.max(d.best, kg); if (!d.first) d.first = Date.now(); s.dex[b.id] = d;
    SV.stat('catches'); SV.earn(coin); SV.save();
    G.caught++; G.earned += coin; G.got.push(b.id);
    SND.play('catch'); SND.play('coin');
    $('catch-img').src = catSrc(b.id, 'sit');
    $('catch-img').classList.toggle('gold', !!b.gold);
    $('catch-name').textContent = b.name;
    $('catch-new').hidden = !isNew;
    $('catch-stars').textContent = stars(b.r);
    $('catch-kg').textContent = kg.toFixed(1) + 'kg' + (kg >= d.best && d.n > 1 ? '（自己ベスト！）' : '') + (kg > mid * 1.12 ? ' 大物！' : '');
    $('catch-coin').textContent = '+' + fmt(coin);
    $('catch-desc').textContent = b.desc;
    $('catch-perfect').hidden = !c.perfect;
    G.cat = null; G.bob = null; setState('done'); G.doneT = 9999;
    overlay('ov-catch', true);
    if (G.caught === G.info.target && !G.goalShown) { G.goalShown = true; setTimeout(function () { toast('🎉 目標達成！ のこりのキャストでボーナスをねらおう', 2400); }, 600); }
    checkMedals(); updateHud();
  }
  function closeCatch() {
    overlay('ov-catch', false);
    if (!G) return;
    setState('idle'); afterCast();
  }
  function failReel(kind) {
    if (kind === 'break') { SND.play('snap'); G.breaks++; SV.stat('breaks'); addText('ブチッ！ 糸が切れた…', null, '#ff6b6b', 24); }
    else { SND.play('fail'); SV.stat('escapes'); addText('糸がゆるんで にげられた…', null, '#8ad0ff', 22); }
    SV.save();
    if (G.cat) { G.cat.flee = true; G.cat.fleeDir = -1; G.cat.mode = 'flee'; }
    G.bob = null; G.holding = false; setState('done'); G.doneT = 1.3;
  }
  function endStage() {
    if (!G || G.ended) return;
    G.ended = true; setState('done'); G.doneT = 9999;
    var s = SV.get(), clear = G.caught >= G.info.target, bonus = 0;
    s.stageBest[G.stage] = Math.max(s.stageBest[G.stage] || 0, G.caught);
    if (clear) {
      bonus = G.info.bonus + Math.max(0, G.caught - G.info.target) * 30;
      if (G.stage + 1 > s.stageMax) { s.stageMax = G.stage + 1; selStage = s.stageMax; }
      SV.earn(bonus); SV.stat('stagesCleared');
      if (G.breaks === 0) award('nobreak');
      SND.play('clear');
    } else SND.play('fail');
    SV.save(); checkMedals();
    $('res-title').textContent = clear ? 'ステージクリア！' : 'ざんねん…';
    $('res-title').className = clear ? 'ok' : 'ng';
    $('res-sub').textContent = 'ステージ ' + G.stage + '：' + G.caught + '匹 / 目標 ' + G.info.target + '匹';
    $('res-bar').style.width = Math.min(100, G.caught / G.info.target * 100) + '%';
    $('res-coin').textContent = fmt(G.earned + bonus);
    $('res-bonus').textContent = clear ? '（クリアボーナス +' + fmt(bonus) + '）' : '';
    $('res-cats').innerHTML = G.got.length ? G.got.map(function (id) { return '<img src="' + catSrc(id, 'sit') + '" alt="' + esc(BY[id].name) + '" class="' + (BY[id].gold ? 'gold' : '') + '">'; }).join('') : '<span class="muted">今回は釣れませんでした</span>';
    var nextSpot = SPOTS.filter(function (x) { return x.stage === G.stage + 1; })[0];
    $('res-unlock').textContent = clear && nextSpot ? '🔓 新しい場所「' + nextSpot.name + '」が解放！' : '';
    $('res-next').hidden = !clear;
    $('res-next').textContent = 'ステージ ' + (G.stage + 1) + ' へ ▶';
    overlay('ov-result', true);
  }

  /* ---------- update ---------- */
  // pt = image coords (text floats there in both views) or null (centre of the close-up / view)
  function addText(t, pt, col, size) { G.texts.push({ t: t, pt: pt, c: col || '#fff', s: size || 20, life: 1.6, dy: 0 }); }
  function update(dt) {
    if (!G) return;
    G.t += dt;
    G.ambient.forEach(function (a) {
      // ambient cats keep away from the bait so it is clear which cat is biting
      if (G.bob && Math.abs(a.x - G.bob.x) < 230 && Math.abs(a.y - G.bob.y) < 130) {
        var away = a.x >= G.bob.x ? 1 : -1, nx = G.bob.x + away * 320;
        if (nx < 380 || nx > 1080) nx = G.bob.x - away * 320;
        a.tx = clamp(nx, 380, 1080); a.wait = 0;
      }
      if (a.wait > 0) { a.wait -= dt; return; }
      var d = a.tx - a.x; a.f += dt;
      if (Math.abs(d) < 4) { a.wait = rnd(1.5, 5); a.tx = rnd(380, 1080); return; }
      a.x += Math.sign(d) * 45 * dt;
    });
    G.texts.forEach(function (t) { t.life -= dt; t.dy -= 18 * dt; });
    G.texts = G.texts.filter(function (t) { return t.life > 0; });
    // close-up window: fixed on the aim / landing point (only changes when you re-aim or cast; no panning)
    if (G.state === 'idle' || G.state === 'power') { G.zc.x = G.aim.x; G.zc.y = G.aim.y; }
    else if (G.state === 'fly' && G.bob) { G.zc.x = G.bob.x; G.zc.y = G.bob.y; }
    var st = G.state;
    if (st === 'power') {
      G.power += G.powerDir * dt * 1.35;
      if (G.power >= 1) { G.power = 1; G.powerDir = -1; } else if (G.power <= 0) { G.power = 0; G.powerDir = 1; }
    } else if (st === 'fly') {
      if (G.t >= 0.75) {
        SND.play('land');
        var b = pickCat(), side = Math.random() < 0.5 ? -1 : 1;
        var aid = G.area ? G.area.id : 'floor';
        var range = aid === 'attic' ? 70 : aid === 'loft' || aid === 'bridge' ? 110 : aid === 'tower' ? 150 : 220;
        var ap = rnd(2.2, 4.8) * (G.acc > 0.9 ? 0.6 : G.acc > 0.65 ? 0.8 : 1) * (G.area ? 1 : 1.3);
        G.cat = { b: b, side: side, x: G.bob.x + side * range, y: G.bob.y, tx: G.bob.x + side * 30, delay: rnd(0.6, 1.6) * (G.acc > 0.9 ? 0.6 : 1), speed: range / ap, f: 0, mode: 'walk', fakes: Math.floor(rnd(0, 3.99)), nt: 0 };
        if (!G.area) addText('ふつうの床…', { x: G.bob.x, y: G.bob.y - 60 }, '#e8d6bb', 15);
        setState('wait');
      }
    } else if (st === 'wait') {
      var c = G.cat;
      if (c.delay > 0) c.delay -= dt;
      else {
        c.f += dt; var d = c.tx - c.x;
        if (Math.abs(d) < 3) { c.mode = 'sit'; c.nt = rnd(0.8, 1.6); SV.useBait(G.bait); updateHud(); setState('nibble'); }
        else c.x += Math.sign(d) * Math.min(Math.abs(d), c.speed * dt);
      }
    } else if (st === 'nibble') {
      var c2 = G.cat; c2.nt -= dt;
      if (G.bob) G.bob.twitch = Math.max(0, G.bob.twitch - dt * 5);
      if (c2.nt <= 0) {
        if (c2.fakes > 0) { c2.fakes--; c2.nt = rnd(0.6, 1.5); G.bob.twitch = 1; SND.play('nibble'); addText('ピクッ', { x: G.bob.x + 30, y: G.bob.y - 50 }, '#fff', 16); }
        else { SND.play('bite'); setState('bite'); }
      }
    } else if (st === 'bite') {
      G.bob.dip = Math.min(1, G.bob.dip + dt * 8);
      if (G.t > G.cat.b.win) { addText('エサだけ取られた…', null, '#ffb0b0', 22); SND.play('fail'); SV.stat('missed'); catFlee(); }
    } else if (st === 'hooked') {
      if (G.t >= 0.55) {
        G.reel.x0 = G.cat.x; G.reel.y0 = G.cat.y;
        G.cat.mode = 'reel'; setState('reel');
      }
    } else if (st === 'reel') {
      updateReel(dt);
    } else if (st === 'done') {
      G.doneT -= dt;
      if (G.cat && G.cat.flee) { G.cat.f += dt; G.cat.x += G.cat.fleeDir * 300 * dt; }
      if (G.doneT <= 0) { G.cat = null; setState('idle'); afterCast(); }
    }
  }
  function updateReel(dt) {
    var R = G.reel, c = G.cat, b = c.b, mul = G.info.mul;
    R.burstT -= dt;
    if (R.burstT <= 0) {
      R.burst = !R.burst;
      R.burstT = R.burst ? rnd(0.5, 1.2) * (0.6 + 0.4 * R.stam) : rnd(0.9, 2.6) / (0.7 + 0.3 * b.power);
      if (R.burst) { SND.play('pull'); addText('グイッ！', { x: c.x, y: c.y - 90 }, '#ffcf6b', 20); }
    }
    var pull = b.power * mul * (R.burst ? 2.3 : 0.6) * (0.45 + 0.55 * R.stam);
    if (G.holding) {
      R.tension += (20 + pull * 30) / R.rod.strength * dt;
      R.dist -= (14 * R.rod.reel - (R.burst ? pull * 5 : 0)) * dt;
      R.clk += dt; if (R.clk > 0.09) { R.clk = 0; SND.play('reel'); }
    } else {
      R.tension -= 48 * dt;
      R.tension += pull * 9 * dt;
      R.dist += pull * (R.burst ? 6 : 2.5) * dt;
    }
    R.tension = clamp(R.tension, 0, 120); R.dist = clamp(R.dist, 0, 100);
    R.stam = Math.max(0, R.stam - dt * (0.035 + (R.tension > 55 ? 0.05 : 0)) / b.stam);
    if (R.tension < 12) R.slack += dt; else R.slack = Math.max(0, R.slack - dt * 1.5);
    // the cat is pulled across the house toward the angler on the right
    var p = 1 - R.dist / 100, shake = R.burst ? 10 : 3;
    c.x = lerp(R.x0, ANG.x - 90, p) + Math.sin(G.t * 23) * shake;
    c.y = lerp(R.y0, ANG.y - 5, p) - Math.sin(p * Math.PI) * 40 + Math.cos(G.t * 17) * shake * 0.5 - Math.abs(Math.sin(G.t * (R.burst ? 9 : 4))) * (R.burst ? 22 : 6);
    if (R.tension >= 100) return failReel('break');
    if (R.slack >= 2.2) return failReel('slack');
    if (R.dist <= 0) { G.holding = false; landCat(); }
  }

  /* ---------- draw ---------- */
  function drawSprite(key, x, y, sc, flip, alpha) {
    var im = IMG[key]; if (!im) return;
    var w = im.width * sc, h = im.height * sc;
    cx.save(); if (alpha != null) cx.globalAlpha = alpha;
    cx.translate(x, y); if (flip) cx.scale(-1, 1);
    cx.drawImage(im, -w / 2, -h, w, h); cx.restore();
  }
  function catKey(id, pose) { return id + '_' + pose; }
  function rodTip(st) {
    var R = G.reel, tens = st === 'reel' ? clamp(R.tension / 100, 0, 1) : 0;
    if (st === 'power') return { x: ANG.x - 40 - 150 * G.power, y: ANG.y - 230 + 60 * G.power };
    return { x: ANG.x - 175 + tens * 50, y: ANG.y - 210 + tens * 70 };
  }
  // draw the whole world in IMAGE coordinates (transform set by caller)
  function drawWorld(scale) {
    var st = G.state, inv = 1 / scale;
    if (IMG.house) cx.drawImage(IMG.house, 0, 0, IW, IHH);
    G.sleepers.forEach(function (z) { drawSprite(z.k, z.x, z.y, 0.9, false); });
    G.ambient.forEach(function (a) {
      var walking = a.wait <= 0, pose = walking ? (Math.floor(a.f * 6) % 2 ? 'walk2' : 'walk') : 'sit';
      drawSprite(catKey(a.id, pose), a.x, a.y, 0.95, walking && a.tx > a.x, 0.95);
    });
    // aim marker
    if (st === 'idle' || st === 'power') {
      var pulse = 0.5 + 0.5 * Math.sin(performance.now() / 250), ar = areaAt(G.aim.x, G.aim.y), locked = ar && ar.stage > G.stage;
      cx.save(); cx.strokeStyle = locked ? 'rgba(180,180,180,0.9)' : 'rgba(255,240,120,' + (0.6 + pulse * 0.4) + ')'; cx.lineWidth = 4 * Math.max(1, inv * 0.5); cx.setLineDash([12, 9]);
      cx.beginPath(); cx.ellipse(G.aim.x, G.aim.y, 46 + pulse * 8, 17 + pulse * 3, 0, 0, Math.PI * 2); cx.stroke();
      cx.setLineDash([]); cx.beginPath(); cx.moveTo(G.aim.x - 14, G.aim.y); cx.lineTo(G.aim.x + 14, G.aim.y); cx.moveTo(G.aim.x, G.aim.y - 10); cx.lineTo(G.aim.x, G.aim.y + 10); cx.stroke();
      cx.restore();
    }
    var tip = drawAngler(st);
    var bob = G.bob;
    if (bob && st !== 'fly' && st !== 'reel' && st !== 'hooked') {
      drawSprite('bait_' + G.bait, bob.x, bob.y + 4, 1.0, false);
      var fy = bob.y - 18 - bob.twitch * 8 + bob.dip * 12, fx = bob.x - 18 + (st === 'bite' ? Math.sin(G.t * 40) * 4 : 0);
      if (st === 'wait') fy += Math.sin(performance.now() / 300) * 2;
      line(tip.x, tip.y, fx, fy - 8, 0.12, inv);
      drawFloat(fx, fy, bob.dip, 1.4);
      if (st === 'bite') bubble(fx - 30, fy - 60, '！', Math.max(1.3, inv * 0.45));
    }
    if (st === 'fly') {
      var t = clamp(G.t / 0.75, 0, 1), ex = bob.x, ey = bob.y;
      var px = lerp(tip.x, ex, t), py = lerp(tip.y, ey, t) - Math.sin(t * Math.PI) * 260;
      line(tip.x, tip.y, px, py, 0.05, inv);
      drawSprite('bait_' + G.bait, px, py + 10, 1.0, false);
    }
    var c = G.cat;
    if (c && !(st === 'wait' && c.delay > 0)) {
      var pose, flip, y = c.y, sc = 1.0;
      if (st === 'reel') {
        var R = G.reel;
        pose = R.burst ? 'leap' : (Math.floor(G.t * 8) % 2 ? 'walk2' : 'walk');
        flip = false; // faces left = pulling away from the angler
        line(tip.x, tip.y, c.x + 10, c.y - 30, clamp(1 - R.tension / 50, 0, 1) * 0.2, inv);
      } else {
        var walking = c.mode === 'walk' || c.flee;
        pose = walking ? (Math.floor(c.f * 7) % 2 ? 'walk2' : 'walk') : 'sit';
        flip = c.flee ? c.fleeDir > 0 : c.side < 0;
        if (st === 'hooked') { pose = 'leap'; y -= Math.sin(clamp(G.t / 0.55, 0, 1) * Math.PI) * 70; line(tip.x, tip.y, c.x, y - 30, 0.05, inv); }
        if (st === 'nibble' && G.bob && G.bob.twitch > 0) y -= G.bob.twitch * 5;
      }
      if (c.b.gold) glow(c.x, y - 35, 60);
      drawSprite(catKey(c.b.id, pose), c.x, y, sc, flip);
    }
  }
  function draw() {
    if (!G || !cx) return;
    var base = K * DPR;
    cx.setTransform(base, 0, 0, base, 0, 0);
    cx.fillStyle = '#2a190c'; cx.fillRect(0, 0, LW, LH);
    // main view: the entire cat house, fixed
    cx.save(); cx.beginPath(); cx.rect(VIEW.x, VIEW.y, VIEW.w, VIEW.h); cx.clip();
    cx.translate(VIEW.x, VIEW.y); cx.scale(VIEW.s, VIEW.s);
    drawWorld(VIEW.s);
    cx.restore();
    drawAreaLabels();
    // fixed close-up window
    if (ZOOM) {
      var z = ZOOM, s = z.s, cw = z.w / s, ch = z.h / s;
      var ox = clamp(G.zc.x - cw / 2, 0, Math.max(0, IW - cw)), oy = clamp(G.zc.y - ch * 0.6, 0, Math.max(0, IHH - ch));
      if (ch > IHH) oy = (IHH - ch) / 2;
      cx.save(); rr(z.x, z.y, z.w, z.h, 14); cx.fillStyle = '#5b3a1f'; cx.fill(); cx.clip();
      cx.translate(z.x - ox * s, z.y - oy * s); cx.scale(s, s);
      drawWorld(s);
      cx.restore();
      cx.save(); rr(z.x, z.y, z.w, z.h, 14); cx.strokeStyle = '#f2a93b'; cx.lineWidth = 3; cx.stroke(); cx.restore();
      label('🔍 アップ', z.x + 44, z.y + z.h - 14, 12, '#ffe9b0');
      // where the close-up is, on the main view
      var a = toScreen(ox, Math.max(0, oy)), bpt = toScreen(Math.min(IW, ox + cw), Math.min(IHH, oy + ch));
      cx.save(); cx.strokeStyle = 'rgba(255,233,176,0.75)'; cx.lineWidth = 1.5; cx.strokeRect(a.x, a.y, bpt.x - a.x, bpt.y - a.y); cx.restore();
    }
    var panel = ZOOM || { x: VIEW.x, y: VIEW.y, w: VIEW.w, h: VIEW.h };
    if (G.state === 'power') drawPower(panel);
    if (G.state === 'reel') drawReelHud(panel);
    var stack = 0;
    G.texts.forEach(function (t) {
      cx.save(); cx.globalAlpha = clamp(t.life / 0.5, 0, 1);
      if (t.pt) { var p = toScreen(t.pt.x, t.pt.y); label(t.t, p.x, p.y + t.dy, Math.max(12, t.s * 0.7), t.c); }
      else { label(t.t, panel.x + panel.w / 2, panel.y + panel.h * 0.42 + t.dy + stack * 30, t.s, t.c); stack++; }
      cx.restore();
    });
  }
  function drawAreaLabels() {
    if (!G || (G.state !== 'idle' && G.state !== 'power')) return;
    SPOTS.forEach(function (s) {
      var p = toScreen(s.x, s.y), locked = s.stage > G.stage;
      var short = s.name.replace(/^1F |^2F /, '');
      cx.save(); cx.globalAlpha = locked ? 0.7 : 0.95;
      label((locked ? '🔒' : '') + short, p.x, p.y + 12, 9, locked ? '#cfcfcf' : '#fff2b0');
      cx.restore();
    });
  }
  function glow(x, y, r) {
    var g = cx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, 'rgba(255,230,120,0.8)'); g.addColorStop(1, 'rgba(255,230,120,0)');
    cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
  }
  function label(t, x, y, size, col) {
    cx.save(); cx.font = '900 ' + (size || 16) + 'px "Hiragino Sans","Noto Sans JP",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.lineWidth = Math.max(3, size / 4); cx.strokeStyle = 'rgba(40,20,10,0.9)'; cx.lineJoin = 'round'; cx.strokeText(t, x, y);
    cx.fillStyle = col || '#fff'; cx.fillText(t, x, y); cx.restore();
  }
  function bubble(x, y, t, k) {
    var sc = (k || 1) * (1 + Math.sin(performance.now() / 60) * 0.08);
    cx.save(); cx.translate(x, y); cx.scale(sc, sc);
    cx.fillStyle = '#fff'; cx.strokeStyle = '#d0302a'; cx.lineWidth = 3;
    cx.beginPath(); cx.arc(0, 0, 16, 0, Math.PI * 2); cx.fill(); cx.stroke();
    label(t, 0, 1, 24, '#e02a2a'); cx.restore();
  }
  function line(x1, y1, x2, y2, sag, inv) {
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + Math.abs(x2 - x1) * sag + 40 * sag;
    cx.save(); cx.strokeStyle = 'rgba(255,255,255,0.95)'; cx.lineWidth = Math.max(1.6, (inv || 1) * 1.2);
    cx.beginPath(); cx.moveTo(x1, y1); cx.quadraticCurveTo(mx, my, x2, y2); cx.stroke(); cx.restore();
  }
  function drawFloat(x, y, dip, k) {
    cx.save(); cx.translate(x, y); cx.scale(k || 1, (k || 1) * (1 - dip * 0.45));
    cx.fillStyle = '#ffffff'; cx.strokeStyle = '#3a1f10'; cx.lineWidth = 1.5;
    cx.beginPath(); cx.arc(0, 0, 7, 0, Math.PI); cx.fill(); cx.stroke();
    cx.fillStyle = '#ff3b30'; cx.beginPath(); cx.arc(0, 0, 7, Math.PI, Math.PI * 2); cx.fill(); cx.stroke();
    cx.fillStyle = '#ffd24a'; cx.fillRect(-1, -12, 2, 6);
    cx.restore();
  }
  function rr(x, y, w, h, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
  function drawAngler(st) {
    // angler standing in the garden at the right edge, facing left into the house (image coords)
    var u = 6, ox = ANG.x - 14 * u, oy = ANG.y - 31 * u;
    var R = G.reel, tens = st === 'reel' ? clamp(R.tension / 100, 0, 1) : 0;
    var lean = st === 'reel' && G.holding ? 2 : 0;
    function px(x, y, w, h, c) { cx.fillStyle = c; cx.fillRect(ox + x * u, oy + y * u, w * u, h * u); }
    cx.save(); cx.translate(lean * u, 0);
    cx.fillStyle = 'rgba(0,0,0,0.28)'; cx.beginPath(); cx.ellipse(ANG.x, ANG.y + 2, 17 * u, 4 * u, 0, 0, Math.PI * 2); cx.fill();
    px(8, 20, 5, 11, '#2c3e66'); px(14, 20, 5, 11, '#24345a'); px(6, 30, 7, 2, '#3a2a1a'); px(13, 30, 7, 2, '#3a2a1a');
    px(6, 9, 15, 12, '#3f8f7a'); px(6, 9, 15, 2, '#4fa98f'); px(16, 10, 5, 11, '#2f6f5f');
    px(7, 0, 12, 10, '#f0c39b'); px(10, 0, 9, 4, '#5a3420'); px(15, 0, 4, 9, '#5a3420'); px(8, 5, 2, 2, '#2a1a10');
    px(6, -1, 14, 3, '#d9473b'); px(3, 1, 6, 2, '#e85a4e');
    px(2, 11, 6, 3, '#3f8f7a'); px(-1, 11, 3, 3, '#f0c39b');
    cx.restore();
    var hx = ox - 1 * u + lean * u, hy = oy + 12 * u;
    var tip = rodTip(st);
    if (st === 'fly') tip = { x: ANG.x - 200, y: ANG.y - 250 };
    cx.save(); cx.lineCap = 'round';
    var ctlx = hx - 50, ctly = hy - 80 - tens * 10;
    cx.strokeStyle = '#3a210f'; cx.lineWidth = 9;
    cx.beginPath(); cx.moveTo(hx + 40, hy + 30); cx.quadraticCurveTo(ctlx, ctly, tip.x, tip.y); cx.stroke();
    cx.strokeStyle = '#b0743a'; cx.lineWidth = 4;
    cx.beginPath(); cx.moveTo(hx + 40, hy + 30); cx.quadraticCurveTo(ctlx, ctly, tip.x, tip.y); cx.stroke();
    cx.fillStyle = '#c9c9c9'; cx.beginPath(); cx.arc(hx + 22, hy + 18, 10, 0, Math.PI * 2); cx.fill();
    cx.restore();
    if (G.caught > 0) { drawSprite('bucket', ANG.x - 10, ANG.y + 22, 1.0, false); }
    return tip;
  }
  function drawPower(P) {
    var w = P.w * 0.84, h = 22, x = P.x + (P.w - w) / 2, y = P.y + 34;
    cx.save(); cx.fillStyle = 'rgba(30,15,5,0.8)'; rr(x - 8, y - 28, w + 16, h + 54, 12); cx.fill();
    label('キャストの強さ（真ん中でグレート）', P.x + P.w / 2, y - 13, 13, '#ffe9b0');
    var g = cx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#5a8dee'); g.addColorStop(0.32, '#7ddea0'); g.addColorStop(0.45, '#ffd24a'); g.addColorStop(0.5, '#ff9f1a'); g.addColorStop(0.55, '#ffd24a'); g.addColorStop(0.68, '#7ddea0'); g.addColorStop(1, '#5a8dee');
    cx.fillStyle = g; rr(x, y, w, h, 8); cx.fill();
    cx.strokeStyle = '#fff'; cx.lineWidth = 2; cx.strokeRect(x + w * 0.45, y - 2, w * 0.1, h + 4);
    var nx = x + w * G.power;
    cx.fillStyle = '#fff'; cx.beginPath(); cx.moveTo(nx, y + h + 2); cx.lineTo(nx - 7, y + h + 12); cx.lineTo(nx + 7, y + h + 12); cx.fill();
    cx.fillRect(nx - 1.5, y - 3, 3, h + 6);
    cx.font = '800 11px sans-serif'; cx.fillStyle = '#e8d6bb'; cx.textBaseline = 'middle';
    cx.textAlign = 'left'; cx.fillText('よわい（手前）', x, y + h + 18);
    cx.textAlign = 'right'; cx.fillText('つよい（奥）', x + w, y + h + 18);
    cx.restore();
  }
  function drawReelHud(P) {
    var R = G.reel, x = P.x + 10, w = P.w - 20, y = P.y + 10;
    cx.save(); cx.fillStyle = 'rgba(30,15,5,0.8)'; rr(x - 4, y - 4, w + 8, 72, 12); cx.fill();
    cx.font = '900 13px sans-serif'; cx.textBaseline = 'middle'; cx.fillStyle = '#ffe9b0'; cx.textAlign = 'left';
    cx.fillText('テンション', x + 4, y + 9);
    var bx = x + 80, bw = w - 86, bh = 16, by = y + 1;
    cx.fillStyle = '#2b5fa8'; cx.fillRect(bx, by, bw * 0.12, bh);
    cx.fillStyle = '#3a9a5c'; cx.fillRect(bx + bw * 0.12, by, bw * 0.68, bh);
    cx.fillStyle = '#c0392b'; cx.fillRect(bx + bw * 0.8, by, bw * 0.2, bh);
    var tv = clamp(R.tension / 100, 0, 1);
    cx.fillStyle = 'rgba(255,255,255,0.85)'; cx.fillRect(bx, by + 4, bw * tv, bh - 8);
    cx.fillStyle = '#fff'; cx.fillRect(bx + bw * tv - 2, by - 3, 4, bh + 6);
    cx.fillStyle = '#ffe9b0'; cx.fillText('きょり', x + 4, y + 36);
    var dy = y + 28;
    cx.fillStyle = 'rgba(255,255,255,0.18)'; cx.fillRect(bx, dy, bw, 14);
    cx.fillStyle = '#ffcf6b'; cx.fillRect(bx, dy, bw * (1 - R.dist / 100), 14);
    cx.textAlign = 'right'; cx.fillStyle = '#fff'; cx.fillText(Math.ceil(R.dist / 10) + 'm', bx + bw - 4, dy + 7);
    cx.textAlign = 'left'; cx.fillStyle = '#ffe9b0'; cx.fillText('猫の元気', x + 4, y + 57);
    cx.fillStyle = 'rgba(255,255,255,0.18)'; cx.fillRect(bx, y + 52, bw, 10);
    cx.fillStyle = '#ff8fb1'; cx.fillRect(bx, y + 52, bw * R.stam, 10);
    cx.restore();
    var ly = y + 88;
    if (R.tension > 80 && Math.floor(performance.now() / 150) % 2) label('⚠ 切れそう！ はなして！', P.x + P.w / 2, ly, 18, '#ff6b6b');
    else if (R.slack > 0.5) label('ゆるんでる！ 巻いて！ ' + Math.max(0, 2.2 - R.slack).toFixed(1), P.x + P.w / 2, ly, 17, '#8ad0ff');
    else if (R.burst) label('猫があばれてる！', P.x + P.w / 2, ly, 16, '#ffcf6b');
  }

  /* ---------- loop ---------- */
  var last = 0;
  function loop(ts) {
    var dt = Math.min(0.05, (ts - (last || ts)) / 1000); last = ts;
    if ($('scr-play').classList.contains('active')) { update(dt); draw(); }
    requestAnimationFrame(loop);
  }

  /* ---------- dex / shop ---------- */
  function renderDex() {
    var s = SV.get();
    var got = B.filter(function (b) { return s.dex[b.id] && s.dex[b.id].n > 0; }).length;
    $('dex-count').textContent = got + ' / ' + B.length + ' 種類・合計 ' + fmt(s.stats.catches || 0) + '匹';
    $('dex-list').innerHTML = B.map(function (b) {
      var d = s.dex[b.id], ok = d && d.n > 0;
      return '<div class="dex-card ' + (ok ? 'got' : 'no') + '"><img src="' + catSrc(b.id, 'sit') + '" alt="" class="' + (b.gold ? 'gold' : '') + '"><b>' + (ok ? esc(b.name) : '？？？') + '</b><span class="st">' + stars(b.r) + '</span>' +
        (ok ? '<small>' + d.n + '匹・最大 ' + Number(d.best).toFixed(1) + 'kg</small><small class="lk">好物：' + b.like.map(function (k) { return BAITBY[k].name; }).join('・') + '</small>'
          : '<small>' + esc(spotHint(b)) + '</small>') + '</div>';
    }).join('');
    $('medal-list').innerHTML = MEDALS.map(function (m) {
      var ok = !!s.medals[m.id];
      return '<div class="medal-card ' + (ok ? 'got' : 'no') + '"><img src="' + itemSrc('medal') + '" alt=""><div><b>' + esc(m.name) + '</b><small>' + esc(m.desc) + '</small><small>' + (ok ? '✅ 獲得ずみ' : '報酬 ' + fmt(m.reward) + 'コイン') + '</small></div></div>';
    }).join('');
    var st = s.stats;
    $('dex-stats').textContent = 'キャスト ' + fmt(st.casts || 0) + '回・パーフェクト合わせ ' + fmt(st.perfect || 0) + '回・糸切れ ' + fmt(st.breaks || 0) + '回・ステージクリア ' + fmt(st.stagesCleared || 0) + '回';
  }
  function spotHint(b) {
    var sp = SPOTS.filter(function (x) { return x.cats.indexOf(b.id) >= 0; })[0];
    return sp ? '出没：' + sp.name : '';
  }
  function renderShop() {
    var s = SV.get();
    $('shop-coins').textContent = fmt(SV.coins());
    $('shop-baits').innerHTML = BAITS.filter(function (b) { return b.price > 0; }).map(function (b) {
      return '<div class="shop-item"><img src="' + itemSrc('bait_' + b.id) + '" alt=""><div class="si-t"><b>' + esc(b.name) + ' ×' + b.pack + '</b><small>' + esc(b.desc) + '</small><small>持っている数：' + SV.baitCount(b.id) + '</small></div><button type="button" class="buy" data-buy="' + b.id + '" ' + (SV.coins() < b.price ? 'disabled' : '') + '>🪙' + fmt(b.price) + '</button></div>';
    }).join('');
    $('shop-rods').innerHTML = RODS.slice(1).map(function (r) {
      var owned = s.rod >= r.lv, canBuy = s.rod === r.lv - 1;
      return '<div class="shop-item"><img src="' + itemSrc('rod') + '" alt=""><div class="si-t"><b>' + esc(r.name) + '</b><small>糸の強さ ×' + r.strength + '・巻く速さ ×' + r.reel + '</small></div><button type="button" class="buy" data-rod="' + r.lv + '" ' + (owned || !canBuy || SV.coins() < r.price ? 'disabled' : '') + '>' + (owned ? '✅ 持ってる' : canBuy ? '🪙' + fmt(r.price) : '🔒') + '</button></div>';
    }).join('');
    $('shop-rodnow').textContent = '今の竿：' + RODS[clamp(s.rod, 1, RODS.length) - 1].name;
    document.querySelectorAll('[data-buy]').forEach(function (bt) {
      bt.addEventListener('click', function () {
        var b = BAITBY[bt.getAttribute('data-buy')];
        if (SV.spend(b.price)) { SV.addBait(b.id, b.pack); SND.play('coin'); renderShop(); } else SND.play('fail');
      });
    });
    document.querySelectorAll('[data-rod]').forEach(function (bt) {
      bt.addEventListener('click', function () {
        var r = RODS[Number(bt.getAttribute('data-rod')) - 1], s2 = SV.get();
        if (s2.rod !== r.lv - 1) return;
        if (SV.spend(r.price)) { s2.rod = r.lv; SV.save(); SND.play('clear'); renderShop(); } else SND.play('fail');
      });
    });
  }

  /* ---------- input ---------- */
  function bind() {
    var mb = $('main-btn');
    mb.addEventListener('pointerdown', function (e) { e.preventDefault(); try { mb.setPointerCapture(e.pointerId); } catch (_) {} press(); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { mb.addEventListener(ev, release); });
    mb.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (G && G.state === 'idle') {
        var r = cv.getBoundingClientRect(), lx = (e.clientX - r.left) / K, ly = (e.clientY - r.top) / K;
        if (lx >= VIEW.x && lx <= VIEW.x + VIEW.w && ly >= VIEW.y && ly <= VIEW.y + VIEW.h) { setAim((lx - VIEW.x) / VIEW.s, (ly - VIEW.y) / VIEW.s); return; }
        if (ZOOM && lx >= ZOOM.x && lx <= ZOOM.x + ZOOM.w && ly >= ZOOM.y && ly <= ZOOM.y + ZOOM.h) {
          var s = ZOOM.s, cw = ZOOM.w / s, ch = ZOOM.h / s;
          var ox = clamp(G.zc.x - cw / 2, 0, Math.max(0, IW - cw)), oy = clamp(G.zc.y - ch * 0.6, 0, Math.max(0, IHH - ch));
          if (ch > IHH) oy = (IHH - ch) / 2;
          setAim(ox + (lx - ZOOM.x) / s, oy + (ly - ZOOM.y) / s); return;
        }
      }
      press();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { cv.addEventListener(ev, release); });
    window.addEventListener('blur', release);
    document.addEventListener('keydown', function (e) {
      if (!$('scr-play').classList.contains('active')) return;
      if ($('ov-catch').classList.contains('show')) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); closeCatch(); } return; }
      if ($('ov-result').classList.contains('show') || $('ov-quit').classList.contains('show')) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) press(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); moveSpot(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); moveSpot(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cycleBait(-1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); cycleBait(1); }
      else if (e.key === 'Escape') overlay('ov-quit', true);
    });
    document.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') release(); });
    $('catch-ok').addEventListener('click', closeCatch);
    $('btn-quit').addEventListener('click', function () { overlay('ov-quit', true); });
    $('quit-no').addEventListener('click', function () { overlay('ov-quit', false); });
    $('quit-yes').addEventListener('click', function () { overlay('ov-quit', false); G = null; show('scr-title'); });
    $('res-next').addEventListener('click', function () { overlay('ov-result', false); selStage = G.stage + 1; startStage(selStage); });
    $('res-retry').addEventListener('click', function () { overlay('ov-result', false); startStage(G.stage); });
    $('res-title-btn').addEventListener('click', function () { overlay('ov-result', false); G = null; show('scr-title'); });
    $('btn-play').addEventListener('click', function () { SND.unlock(); startStage(selStage); });
    $('stage-prev').addEventListener('click', function () { selStage = Math.max(1, selStage - 1); refreshTitle(); });
    $('stage-next').addEventListener('click', function () { selStage = Math.min(SV.get().stageMax, selStage + 1); refreshTitle(); });
    $('btn-dex').addEventListener('click', function () { renderDex(); show('scr-dex'); });
    $('btn-shop').addEventListener('click', function () { renderShop(); show('scr-shop'); });
    $('btn-howto').addEventListener('click', function () { overlay('ov-howto', true); });
    $('howto-close').addEventListener('click', function () { overlay('ov-howto', false); });
    document.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', function () { show('scr-title'); }); });
    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        document.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('on', x === t); });
        $('dex-list').hidden = t.getAttribute('data-tab') !== 'dex'; $('medal-list').hidden = t.getAttribute('data-tab') !== 'medal';
      });
    });
    $('btn-mute').addEventListener('click', function () {
      SND.setMuted(!SND.isMuted()); var p = SV.loadPref(); p.mute = SND.isMuted(); SV.savePref(p); refreshTitle();
    });
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe($('stage-wrap'));
    window.addEventListener('storage', function (e) { if (e.key === SV.KEY) { SV.load(); if ($('scr-title').classList.contains('active')) refreshTitle(); } });
  }

  function init() {
    SV.load(); SV.save();
    var p = SV.loadPref(); SND.setMuted(!!p.mute);
    cv = $('cv'); cx = cv.getContext('2d');
    selStage = SV.get().stageMax;
    bind();
    show('scr-title');
    Promise.all(assetList().map(function (a) { return loadImg(a[0], a[1]); })).then(function () {
      $('btn-play').disabled = false; $('btn-play').classList.remove('loading');
    });
    requestAnimationFrame(loop);
    window.__nk = { get G() { return G; }, press: press, release: release, startStage: startStage, endStage: endStage };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
