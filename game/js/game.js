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
    if (id === 'scr-title') refreshTitle();
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

  /* ---------- canvas ---------- */
  var cv, cx, LW = 450, LH = 700, K = 1, DPR = 1;
  function resize() {
    var wrap = $('stage-wrap'); if (!wrap || !cv) return;
    var w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
    K = w / LW; LH = h / K;
    if (LH < 340) { LH = 340; K = h / LH; }
    if (LH > 1100) LH = 1100;
    DPR = Math.min(2.5, window.devicePixelRatio || 1);
    cv.style.width = Math.round(LW * K) + 'px'; cv.style.height = Math.round(LH * K) + 'px';
    cv.width = Math.round(LW * K * DPR); cv.height = Math.round(LH * K * DPR);
    cx.imageSmoothingEnabled = false;
  }
  function bgS() { return LH / 768; }
  function imgW() { return 1408 * bgS(); }

  /* ---------- game state ---------- */
  var G = null;
  function unlockedSpots(n) { return SPOTS.filter(function (s) { return s.stage <= n; }); }
  function startStage(n) {
    var info = NK.stageInfo(n);
    G = {
      info: info, stage: n, casts: info.casts, caught: 0, earned: 0, breaks: 0, got: [],
      state: 'idle', t: 0, spotIdx: 0, bait: 'niboshi', camX: 0, camT: 0,
      power: 0, powerDir: 1, acc: 0, cat: null, bob: null, holding: false, texts: [],
      ambient: makeAmbient(n), sleepers: makeSleepers(), goalShown: false, ended: false,
    };
    var sp = unlockedSpots(n); G.spotIdx = sp.length > 2 ? Math.floor(Math.random() * 2) : 0;
    if (SV.baitCount(lastBait) > 0) G.bait = lastBait;
    show('scr-play');
    resize(); G.camX = camTarget(); renderBaits(); updateHud(); setHint();
    NKMeta.hitBattle();
    SV.stat('stagesPlayed'); SV.save();
    toast('ステージ ' + n + '<br><small>' + info.casts + '回のキャストで ' + info.target + '匹 つろう！</small>', 2200);
  }
  var lastBait = 'niboshi';
  function curSpot() { var sp = unlockedSpots(G.stage); return sp[clamp(G.spotIdx, 0, sp.length - 1)]; }
  function camTarget() { return clamp(curSpot().x * bgS() - LW / 2, 0, Math.max(0, imgW() - LW)); }
  function makeAmbient(n) {
    var pool = B.filter(function (b) { return b.r <= 2; }), out = [];
    for (var i = 0; i < 3; i++) {
      var b = pool[Math.floor(Math.random() * pool.length)];
      out.push({ id: b.id, x: rnd(380, 1250), y: rnd(600, 700), tx: rnd(380, 1250), wait: rnd(0, 3), f: 0 });
    }
    return out;
  }
  function makeSleepers() {
    return [{ k: 'sleep_a', x: 240, y: 330 }, { k: 'sleep_c', x: 1168, y: 452 }, { k: 'sleep_b', x: 440, y: 584 }];
  }

  /* ---------- HUD / controls ---------- */
  function updateHud() {
    if (!G) return;
    $('hud-stage').textContent = 'ST ' + G.stage;
    $('hud-casts').textContent = G.casts;
    $('hud-caught').textContent = G.caught + '/' + G.info.target;
    $('hud-coins').textContent = fmt(SV.coins());
    var sp = curSpot(), list = unlockedSpots(G.stage);
    $('spot-name').innerHTML = '📍 ' + esc(sp.name) + ' <small>(' + (G.spotIdx + 1) + '/' + list.length + ')</small>';
    var lockedNext = SPOTS.filter(function (s) { return s.stage > G.stage; })[0];
    $('spot-sub').textContent = lockedNext ? '🔒 次の場所はステージ' + lockedNext.stage + 'で解放' : '全エリア解放！';
    var busy = G.state !== 'idle';
    $('spot-prev').disabled = busy; $('spot-next').disabled = busy;
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
      idle: '◀▶で場所、下でエサを選んで「キャスト」（スペースキーでもOK）',
      power: 'ゲージが真ん中（グレート）で止めると、レアな猫が来やすい！',
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
  function moveSpot(d) {
    if (!G || G.state !== 'idle') return;
    var n = unlockedSpots(G.stage).length;
    G.spotIdx = (G.spotIdx + d + n) % n; SND.play('tap'); updateHud();
  }
  function cycleBait(d) {
    if (!G || G.state !== 'idle') return;
    var ids = BAITS.map(function (b) { return b.id; }).filter(function (id) { return SV.baitCount(id) > 0; });
    var i = ids.indexOf(G.bait); G.bait = ids[(i + d + ids.length) % ids.length]; lastBait = G.bait; SND.play('tap'); updateHud();
  }
  function setState(s) { G.state = s; G.t = 0; updateHud(); setHint(); }

  /* ---------- fishing logic ---------- */
  function pickCat() {
    var sp = curSpot(), bait = BAITBY[G.bait];
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
      var sp = curSpot(), off = (1 - G.acc) * 70 * (Math.random() < 0.5 ? -1 : 1);
      G.bob = { x: sp.x + off, y: sp.y, fx: 0, fy: 0, dip: 0, twitch: 0 };
      var lab = G.acc > 0.9 ? 'グレート！' : G.acc > 0.65 ? 'ナイス！' : 'ふつう';
      addText(lab, LW / 2, LH * 0.45, G.acc > 0.9 ? '#ffd24a' : '#fff', 26);
      SND.play('cast'); setState('fly');
    } else if (st === 'wait') {
      addText('回収した', LW / 2, LH * 0.5, '#fff', 20);
      G.cat = null; G.bob = null; setState('idle'); afterCast();
    } else if (st === 'nibble') {
      addText('はやすぎ！ 猫がにげた…', LW / 2, LH * 0.45, '#ff8a8a', 22);
      SND.play('fail'); catFlee(); SV.stat('early');
    } else if (st === 'bite') {
      var perfect = G.t <= G.cat.b.win * 0.4;
      SND.play('hook'); SND.play('meow');
      if (perfect) { SV.stat('perfect'); addText('パーフェクト合わせ！', LW / 2, LH * 0.4, '#ffd24a', 26); }
      else addText('かかった！', LW / 2, LH * 0.4, '#fff', 26);
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
    if (kind === 'break') { SND.play('snap'); G.breaks++; SV.stat('breaks'); addText('ブチッ！ 糸が切れた…', LW / 2, LH * 0.42, '#ff6b6b', 24); }
    else { SND.play('fail'); SV.stat('escapes'); addText('糸がゆるんで にげられた…', LW / 2, LH * 0.42, '#8ad0ff', 22); }
    SV.save();
    if (G.cat) { G.cat.flee = true; G.cat.fleeDir = G.cat.sx > LW / 2 ? 1 : -1; G.cat.mode = 'flee'; }
    G.bob = null; G.holding = false; setState('done'); G.doneT = 1.3;
  }
  function endStage() {
    if (!G || G.ended) return;
    G.ended = true; setState('done'); G.doneT = 9999;
    var s = SV.get(), clear = G.caught >= G.info.target, bonus = 0;
    s.stageBest[G.stage] = Math.max(s.stageBest[G.stage] || 0, G.caught);
    if (clear) {
      bonus = G.info.bonus + Math.max(0, G.caught - G.info.target) * 30;
      SV.earn(bonus); SV.stat('stagesCleared');
      if (G.stage + 1 > s.stageMax) { s.stageMax = G.stage + 1; selStage = s.stageMax; }
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
  function addText(t, x, y, col, size) { G.texts.push({ t: t, x: x, y: y, c: col || '#fff', s: size || 20, life: 1.6 }); }
  function update(dt) {
    if (!G) return;
    G.t += dt;
    var s = bgS();
    if (G.state === 'idle') G.camX = lerp(G.camX, camTarget(), Math.min(1, dt * 6));
    // ambient cats
    G.ambient.forEach(function (a) {
      if (a.wait > 0) { a.wait -= dt; return; }
      var d = a.tx - a.x; a.f += dt;
      if (Math.abs(d) < 4) { a.wait = rnd(1.5, 5); a.tx = rnd(380, 1250); return; }
      a.x += Math.sign(d) * 45 * dt;
    });
    G.texts.forEach(function (t) { t.life -= dt; t.y -= 18 * dt; });
    G.texts = G.texts.filter(function (t) { return t.life > 0; });
    var st = G.state;
    if (st === 'power') {
      G.power += G.powerDir * dt * 1.35;
      if (G.power >= 1) { G.power = 1; G.powerDir = -1; } else if (G.power <= 0) { G.power = 0; G.powerDir = 1; }
    } else if (st === 'fly') {
      if (G.t >= 0.6) {
        SND.play('land');
        var b = pickCat(), side = Math.random() < 0.5 ? -1 : 1, range = curSpot().id === 'attic' ? 110 : curSpot().id === 'tower' ? 170 : 230;
        var ap = rnd(2.2, 4.8) * (G.acc > 0.9 ? 0.6 : G.acc > 0.65 ? 0.8 : 1);
        G.cat = { b: b, side: side, x: G.bob.x + side * range, y: G.bob.y, tx: G.bob.x + side * 30, delay: rnd(0.6, 1.6) * (G.acc > 0.9 ? 0.6 : 1), speed: range / ap, f: 0, mode: 'walk', fakes: Math.floor(rnd(0, 3.99)), nt: 0 };
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
        if (c2.fakes > 0) { c2.fakes--; c2.nt = rnd(0.6, 1.5); G.bob.twitch = 1; SND.play('nibble'); addText('ピクッ', G.bob.x * s - G.camX + 20, G.bob.y * s - 40, '#fff', 16); }
        else { SND.play('bite'); setState('bite'); }
      }
    } else if (st === 'bite') {
      G.bob.dip = Math.min(1, G.bob.dip + dt * 8);
      if (G.t > G.cat.b.win) { addText('エサだけ取られた…', LW / 2, LH * 0.45, '#ffb0b0', 22); SND.play('fail'); SV.stat('missed'); catFlee(); }
    } else if (st === 'hooked') {
      if (G.t >= 0.55) {
        var c3 = G.cat;
        c3.sx = c3.x * s - G.camX; c3.sy = c3.y * s; c3.mode = 'reel';
        G.reel.sx0 = c3.sx; G.reel.sy0 = c3.sy;
        setState('reel');
      }
    } else if (st === 'reel') {
      updateReel(dt);
    } else if (st === 'done') {
      G.doneT -= dt;
      if (G.cat && G.cat.flee) { G.cat.f += dt; if (G.cat.sx != null) G.cat.sx += G.cat.fleeDir * 260 * dt; else G.cat.x += G.cat.fleeDir * 300 * dt; }
      if (G.doneT <= 0) { G.cat = null; setState('idle'); afterCast(); }
    }
  }
  function updateReel(dt) {
    var R = G.reel, c = G.cat, b = c.b, mul = G.info.mul;
    R.burstT -= dt;
    if (R.burstT <= 0) {
      R.burst = !R.burst;
      R.burstT = R.burst ? rnd(0.5, 1.2) * (0.6 + 0.4 * R.stam) : rnd(0.9, 2.6) / (0.7 + 0.3 * b.power);
      if (R.burst) { SND.play('pull'); addText('グイッ！', c.sx, c.sy - 60, '#ffcf6b', 20); }
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
    // cat screen position
    var p = 1 - R.dist / 100, ax = LW * 0.2 + 70, ay = LH - 50;
    var shake = R.burst ? 6 : 2;
    c.sx = lerp(R.sx0, ax, p) + Math.sin(G.t * 23) * shake;
    c.sy = lerp(R.sy0, ay, p) + Math.cos(G.t * 17) * shake * 0.5 - Math.abs(Math.sin(G.t * (R.burst ? 9 : 4))) * (R.burst ? 14 : 4);
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
  function draw() {
    if (!G || !cx) return;
    cx.setTransform(K * DPR, 0, 0, K * DPR, 0, 0);
    var s = bgS(), cam = G.camX;
    cx.fillStyle = '#6b4a2c'; cx.fillRect(0, 0, LW, LH);
    if (IMG.house) cx.drawImage(IMG.house, -cam, 0, imgW(), LH);
    var cs = s * 1.0;
    G.sleepers.forEach(function (z) { drawSprite(z.k, z.x * s - cam, z.y * s, cs * 0.9, false); });
    G.ambient.forEach(function (a) {
      var walking = a.wait <= 0, pose = walking ? (Math.floor(a.f * 6) % 2 ? 'walk2' : 'walk') : 'sit';
      drawSprite(catKey(a.id, pose), a.x * s - cam, a.y * s, cs * 0.95, walking && a.tx > a.x, 0.95);
    });
    var st = G.state, sp = curSpot();
    // spot marker
    if (st === 'idle' || st === 'power') {
      var mx = sp.x * s - cam, my = sp.y * s, pulse = 0.5 + 0.5 * Math.sin(performance.now() / 250);
      cx.save(); cx.strokeStyle = 'rgba(255,240,120,' + (0.5 + pulse * 0.5) + ')'; cx.lineWidth = 3; cx.setLineDash([6, 5]);
      cx.beginPath(); cx.ellipse(mx, my, 34 + pulse * 6, 12 + pulse * 2, 0, 0, Math.PI * 2); cx.stroke(); cx.restore();
      label('ここに投げる', mx, my - 22, 13);
    }
    // angler & rod
    var tip = drawAngler(st);
    // bait / bobber
    var bob = G.bob, bx = 0, by = 0;
    if (bob && st !== 'fly') {
      bx = bob.x * s - cam; by = bob.y * s;
      drawSprite('bait_' + G.bait, bx, by + 4, s * 0.85, false);
      var fy = by - 14 - bob.twitch * 6 + bob.dip * 10, fx = bx - 14 + (st === 'bite' ? Math.sin(G.t * 40) * 3 : 0);
      if (st === 'wait') fy += Math.sin(performance.now() / 300) * 1.5;
      line(tip.x, tip.y, fx, fy - 6, 0.25);
      drawFloat(fx, fy, bob.dip);
      if (st === 'bite') bubble(fx - 22, fy - 46, '！');
    }
    if (st === 'fly') {
      var t = clamp(G.t / 0.6, 0, 1), ex = G.bob.x * s - cam, ey = G.bob.y * s;
      var px = lerp(tip.x, ex, t), py = lerp(tip.y, ey, t) - Math.sin(t * Math.PI) * 120;
      line(tip.x, tip.y, px, py, 0.1);
      drawSprite('bait_' + G.bait, px, py + 8, s * 0.85, false);
    }
    // active cat
    var c = G.cat;
    if (c && (st === 'wait' || st === 'nibble' || st === 'bite' || st === 'hooked' || st === 'done') && c.sx == null) {
      if (!(st === 'wait' && c.delay > 0)) {
        var walking = c.mode === 'walk' || c.flee, pose = walking ? (Math.floor(c.f * 7) % 2 ? 'walk2' : 'walk') : 'sit';
        var flip = c.flee ? c.fleeDir > 0 : c.side < 0;
        var y = c.y * s, x = c.x * s - cam;
        if (st === 'hooked') { pose = 'leap'; y -= Math.sin(clamp(G.t / 0.55, 0, 1) * Math.PI) * 50; }
        if (st === 'nibble' && G.bob && G.bob.twitch > 0) y -= G.bob.twitch * 4;
        if (c.b.gold) glow(x, y - 25, 40);
        drawSprite(catKey(c.b.id, pose), x, y, cs, flip);
      }
    }
    if (c && c.sx != null) {
      var reeling = st === 'reel', R = G.reel;
      var pose2 = reeling ? (R.burst ? 'leap' : (Math.floor(G.t * 8) % 2 ? 'walk2' : 'walk')) : (Math.floor(c.f * 7) % 2 ? 'walk2' : 'walk');
      var flip2 = reeling ? c.sx > LW * 0.2 + 60 : c.fleeDir > 0;
      if (reeling) line(tip.x, tip.y, c.sx, c.sy - 20, clamp(1 - R.tension / 50, 0, 1) * 0.35);
      if (c.b.gold) glow(c.sx, c.sy - 25, 40);
      drawSprite(catKey(c.b.id, pose2), c.sx, c.sy, cs * (1 + (reeling ? 0.25 * (1 - R.dist / 100) : 0)), flip2);
    }
    if (st === 'power') drawPower();
    if (st === 'reel') drawReelHud();
    G.texts.forEach(function (t) {
      cx.save(); cx.globalAlpha = clamp(t.life / 0.5, 0, 1); label(t.t, t.x, t.y, t.s, t.c); cx.restore();
    });
  }
  function glow(x, y, r) {
    var g = cx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, 'rgba(255,230,120,0.8)'); g.addColorStop(1, 'rgba(255,230,120,0)');
    cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
  }
  function label(t, x, y, size, col) {
    cx.save(); cx.font = '900 ' + (size || 16) + 'px "Hiragino Sans","Noto Sans JP",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.lineWidth = Math.max(3, size / 4); cx.strokeStyle = 'rgba(40,20,10,0.9)'; cx.strokeText(t, x, y);
    cx.fillStyle = col || '#fff'; cx.fillText(t, x, y); cx.restore();
  }
  function bubble(x, y, t) {
    var sc = 1 + Math.sin(performance.now() / 60) * 0.08;
    cx.save(); cx.translate(x, y); cx.scale(sc, sc);
    cx.fillStyle = '#fff'; cx.strokeStyle = '#d0302a'; cx.lineWidth = 3;
    cx.beginPath(); cx.arc(0, 0, 16, 0, Math.PI * 2); cx.fill(); cx.stroke();
    cx.restore(); label(t, x, y + 1, 24, '#e02a2a');
  }
  function line(x1, y1, x2, y2, sag, skip) {
    if (skip) return;
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + Math.abs(x2 - x1) * sag + 30 * sag;
    cx.save(); cx.strokeStyle = 'rgba(255,255,255,0.9)'; cx.lineWidth = 1.4;
    cx.beginPath(); cx.moveTo(x1, y1); cx.quadraticCurveTo(mx, my, x2, y2); cx.stroke(); cx.restore();
  }
  function drawFloat(x, y, dip) {
    cx.save(); cx.translate(x, y);
    cx.scale(1, 1 - dip * 0.45);
    cx.fillStyle = '#ffffff'; cx.strokeStyle = '#3a1f10'; cx.lineWidth = 1.5;
    cx.beginPath(); cx.arc(0, 0, 7, 0, Math.PI); cx.fill(); cx.stroke();
    cx.fillStyle = '#ff3b30'; cx.beginPath(); cx.arc(0, 0, 7, Math.PI, Math.PI * 2); cx.fill(); cx.stroke();
    cx.fillStyle = '#ffd24a'; cx.fillRect(-1, -12, 2, 6);
    cx.restore();
  }
  function rr(x, y, w, h, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
  function drawAngler(st) {
    // back view of a person holding a rod, bottom-centre (pixel-ish blocks)
    var u = Math.max(2.6, Math.min(4, LH / 220)), AX = LW * 0.2, ox = AX - 14 * u, oy = LH - 30 * u;
    var R = G.reel, tens = st === 'reel' ? clamp(R.tension / 100, 0, 1) : 0;
    var lean = st === 'reel' ? (G.holding ? -1 : 0) : 0;
    function px(x, y, w, h, c) { cx.fillStyle = c; cx.fillRect(ox + x * u, oy + y * u, w * u, h * u); }
    cx.save(); cx.translate(lean * u, 0);
    // shadow
    cx.fillStyle = 'rgba(0,0,0,0.25)'; cx.beginPath(); cx.ellipse(AX, LH - 2, 16 * u, 4 * u, 0, 0, Math.PI * 2); cx.fill();
    // legs
    px(7, 20, 6, 11, '#2c3e66'); px(15, 20, 6, 11, '#2c3e66'); px(7, 20, 14, 2, '#24345a');
    // torso
    px(5, 9, 18, 12, '#3f8f7a'); px(5, 9, 18, 2, '#4fa98f'); px(13, 10, 2, 11, '#2f6f5f');
    // arms (right arm forward/up)
    px(2, 10, 4, 9, '#3f8f7a'); px(22, 8, 4, 7, '#3f8f7a'); px(24, 4, 4, 5, '#f0c39b');
    px(2, 18, 4, 3, '#f0c39b');
    // head + hair (back)
    px(8, 0, 12, 10, '#5a3420'); px(7, 2, 14, 7, '#5a3420'); px(9, 0, 10, 2, '#6e4128'); px(7, 6, 1, 3, '#f0c39b'); px(20, 6, 1, 3, '#f0c39b');
    // cap
    px(7, -1, 14, 3, '#d9473b'); px(8, -2, 12, 2, '#e85a4e');
    cx.restore();
    if (G.caught > 0) drawSprite('bucket', AX - 22 * u, LH - 2, u * 0.32, false);
    if (G.caught > 0) label('×' + G.caught, AX - 22 * u, LH - 24 * u, 14, '#ffe39a');
    var hx = ox + 26 * u + lean * u, hy = oy + 5 * u;
    var tx = hx + 30 * u - tens * 18 * u, ty = hy - 34 * u + tens * 26 * u;
    if (st === 'power') { var k = G.power; tx = hx + (10 + 30 * k) * u; ty = hy - (40 - 10 * k) * u; }
    if (st === 'fly') { tx = hx + 22 * u; ty = hy - 38 * u; }
    // rod
    cx.save(); cx.lineCap = 'round';
    cx.strokeStyle = '#3a210f'; cx.lineWidth = u * 1.6;
    cx.beginPath(); cx.moveTo(hx - 6 * u, hy + 8 * u); cx.quadraticCurveTo(hx + 10 * u, hy - 14 * u - tens * 4 * u, tx, ty); cx.stroke();
    cx.strokeStyle = '#a0662f'; cx.lineWidth = u * 0.8;
    cx.beginPath(); cx.moveTo(hx - 6 * u, hy + 8 * u); cx.quadraticCurveTo(hx + 10 * u, hy - 14 * u - tens * 4 * u, tx, ty); cx.stroke();
    cx.fillStyle = '#c9c9c9'; cx.beginPath(); cx.arc(hx - 2 * u, hy + 4 * u, 2.2 * u, 0, Math.PI * 2); cx.fill();
    cx.restore();
    return { x: tx, y: ty };
  }
  function drawPower() {
    var w = LW * 0.78, h = 22, x = (LW - w) / 2, y = 60;
    cx.save(); cx.fillStyle = 'rgba(30,15,5,0.75)'; rr(x - 8, y - 26, w + 16, h + 40, 12); cx.fill();
    label('キャストの強さ', LW / 2, y - 12, 14, '#ffe9b0');
    var g = cx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#5a8dee'); g.addColorStop(0.32, '#7ddea0'); g.addColorStop(0.45, '#ffd24a'); g.addColorStop(0.5, '#ff9f1a'); g.addColorStop(0.55, '#ffd24a'); g.addColorStop(0.68, '#7ddea0'); g.addColorStop(1, '#5a8dee');
    cx.fillStyle = g; rr(x, y, w, h, 8); cx.fill();
    cx.strokeStyle = '#fff'; cx.lineWidth = 2; cx.strokeRect(x + w * 0.45, y - 2, w * 0.1, h + 4);
    var nx = x + w * G.power;
    cx.fillStyle = '#fff'; cx.beginPath(); cx.moveTo(nx, y + h + 2); cx.lineTo(nx - 7, y + h + 12); cx.lineTo(nx + 7, y + h + 12); cx.fill();
    cx.fillRect(nx - 1.5, y - 3, 3, h + 6);
    cx.restore();
  }
  function drawReelHud() {
    var R = G.reel, x = 18, w = LW - 36, y = 14;
    cx.save(); cx.fillStyle = 'rgba(30,15,5,0.78)'; rr(x - 6, y - 6, w + 12, 74, 12); cx.fill();
    // tension
    cx.font = '900 13px sans-serif'; cx.textBaseline = 'middle'; cx.fillStyle = '#ffe9b0'; cx.textAlign = 'left';
    cx.fillText('テンション', x + 4, y + 9);
    var bx = x + 80, bw = w - 86, bh = 16, by = y + 1;
    cx.fillStyle = '#2b5fa8'; cx.fillRect(bx, by, bw * 0.12, bh);
    cx.fillStyle = '#3a9a5c'; cx.fillRect(bx + bw * 0.12, by, bw * 0.68, bh);
    cx.fillStyle = '#c0392b'; cx.fillRect(bx + bw * 0.8, by, bw * 0.2, bh);
    var tv = clamp(R.tension / 100, 0, 1);
    cx.fillStyle = 'rgba(255,255,255,0.85)'; cx.fillRect(bx, by + 4, bw * tv, bh - 8);
    cx.fillStyle = '#fff'; cx.fillRect(bx + bw * tv - 2, by - 3, 4, bh + 6);
    // distance
    cx.fillStyle = '#ffe9b0'; cx.fillText('きょり', x + 4, y + 36);
    var dy = y + 28;
    cx.fillStyle = 'rgba(255,255,255,0.18)'; cx.fillRect(bx, dy, bw, 14);
    cx.fillStyle = '#ffcf6b'; cx.fillRect(bx, dy, bw * (1 - R.dist / 100), 14);
    cx.textAlign = 'right'; cx.fillStyle = '#fff'; cx.fillText(Math.ceil(R.dist / 10) + 'm', bx + bw - 4, dy + 7);
    // stamina
    cx.textAlign = 'left'; cx.fillStyle = '#ffe9b0'; cx.fillText('猫の元気', x + 4, y + 58);
    cx.fillStyle = 'rgba(255,255,255,0.18)'; cx.fillRect(bx, y + 52, bw, 10);
    cx.fillStyle = '#ff8fb1'; cx.fillRect(bx, y + 52, bw * R.stam, 10);
    cx.restore();
    if (R.tension > 80 && Math.floor(performance.now() / 150) % 2) label('⚠ 切れそう！ はなして！', LW / 2, 108, 18, '#ff6b6b');
    else if (R.slack > 0.5) label('ゆるんでる！ 巻いて！ ' + Math.max(0, 2.2 - R.slack).toFixed(1), LW / 2, 108, 17, '#8ad0ff');
    else if (R.burst) label('猫があばれてる！', LW / 2, 108, 16, '#ffcf6b');
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
    cv.addEventListener('pointerdown', function (e) { e.preventDefault(); press(); });
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
    $('spot-prev').addEventListener('click', function () { moveSpot(-1); });
    $('spot-next').addEventListener('click', function () { moveSpot(1); });
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
