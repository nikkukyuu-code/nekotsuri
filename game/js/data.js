/* 猫ハウスつり — game data (breeds, baits, spots, rods, medals) */
(function () {
  'use strict';
  // Publish datetime (epoch ms). Stamped by tools/stamp.py at publish time.
  var BUILD_TIME = 1791131090700;

  var RARITY_W = { 1: 100, 2: 42, 3: 16, 4: 5, 5: 1.2 };
  // like: bait ids this cat loves (x3.2). power: pull strength. win: bite window (s). kg: [min,max]
  var BREEDS = [
    { id: 'chatora', name: '茶トラ', r: 1, coin: 30, power: 0.9, stam: 0.9, win: 0.95, kg: [3.0, 5.5], like: ['niboshi', 'aji'], desc: 'のんびり屋の茶トラ。煮干しが大好き。' },
    { id: 'kijitora', name: 'キジトラ', r: 1, coin: 32, power: 1.0, stam: 1.0, win: 0.9, kg: [3.2, 5.8], like: ['niboshi', 'mouse'], desc: '野性味あふれるしま模様。ねずみに目がない。' },
    { id: 'kuro', name: '黒猫', r: 1, coin: 36, power: 1.05, stam: 1.0, win: 0.85, kg: [3.0, 5.2], like: ['mouse', 'feather'], desc: '暗いトンネルが好きな黒猫。動くものに反応する。' },
    { id: 'sabatora', name: 'サバトラ', r: 2, coin: 55, power: 1.15, stam: 1.1, win: 0.8, kg: [3.5, 6.0], like: ['aji', 'niboshi'], desc: '銀色のしま模様。青魚のにおいに弱い。' },
    { id: 'shiro', name: '白猫', r: 2, coin: 65, power: 1.0, stam: 1.0, win: 0.75, kg: [2.8, 4.8], like: ['ebi', 'feather'], desc: 'ふわふわの白猫。エビをねらってそっと近づく。' },
    { id: 'hachiware', name: 'ハチワレ', r: 2, coin: 60, power: 1.2, stam: 1.15, win: 0.8, kg: [3.4, 6.2], like: ['feather', 'mouse'], desc: 'おでこがハの字。じゃれるのが大好き。' },
    { id: 'cream', name: 'クリーム', r: 2, coin: 70, power: 1.05, stam: 1.0, win: 0.75, kg: [3.0, 5.0], like: ['ebi', 'yaki'], desc: 'やさしい色のクリーム猫。グルメ志向。' },
    { id: 'mike', name: '三毛猫', r: 3, coin: 130, power: 1.3, stam: 1.25, win: 0.65, kg: [3.0, 5.4], like: ['feather', 'ebi'], desc: '三色の毛なみ。気まぐれで引きが強い。' },
    { id: 'sabi', name: 'サビ猫', r: 3, coin: 140, power: 1.4, stam: 1.3, win: 0.62, kg: [3.2, 5.6], like: ['mouse', 'aji'], desc: '黒と茶のまだら模様。すばしっこい。' },
    { id: 'siamese', name: 'シャム', r: 3, coin: 160, power: 1.35, stam: 1.3, win: 0.6, kg: [2.8, 4.6], like: ['aji', 'yaki'], desc: '青い目の高貴なシャム。エサにうるさい。' },
    { id: 'oshare', name: 'おしゃれシャム', r: 4, coin: 320, power: 1.6, stam: 1.5, win: 0.52, kg: [3.0, 4.8], like: ['yaki', 'ebi'], desc: 'スカーフを巻いたおしゃれさん。焼き魚しか認めない。' },
    { id: 'maneki', name: 'まねき三毛', r: 4, coin: 420, power: 1.7, stam: 1.6, win: 0.5, kg: [3.6, 6.4], like: ['yaki', 'feather'], desc: '赤いスカーフの三毛。釣ると福がくるらしい。' },
    { id: 'kin', name: '金のねこ', r: 5, coin: 1200, power: 2.0, stam: 1.9, win: 0.42, kg: [4.0, 7.5], like: ['yaki'], desc: '猫ハウスの伝説。屋根裏に焼き魚を置くと…？', gold: true },
  ];

  var BAITS = [
    { id: 'niboshi', name: '煮干し', price: 0, pack: 0, boost: 0, desc: '無料・何回でも使える' },
    { id: 'mouse', name: 'ねずみのおもちゃ', price: 20, pack: 5, boost: 0.25, desc: '黒猫・キジトラ・サビ猫が好き' },
    { id: 'feather', name: 'はねじゃらし', price: 30, pack: 5, boost: 0.35, desc: 'ハチワレ・三毛猫が好き' },
    { id: 'ebi', name: 'エビ', price: 50, pack: 5, boost: 0.5, desc: '白猫・クリーム・三毛猫が好き' },
    { id: 'aji', name: 'アジ', price: 60, pack: 5, boost: 0.5, desc: 'サバトラ・シャムが好き' },
    { id: 'yaki', name: '焼き魚', price: 150, pack: 5, boost: 1.2, desc: 'レアな猫が集まる高級エサ' },
  ];

  // x, y = bait position on the cat-house image (1408x768). floor: 1 = cats walk on this level.
  var SPOTS = [
    { id: 'cushion', name: '1F ひだまりクッション', x: 470, y: 630, stage: 1, cats: ['chatora', 'kijitora', 'kuro', 'shiro', 'cream'] },
    { id: 'tunnel', name: '1F トンネル前', x: 800, y: 655, stage: 1, cats: ['kuro', 'kijitora', 'sabatora', 'hachiware', 'sabi'] },
    { id: 'tower', name: '1F キャットタワー下', x: 690, y: 470, stage: 2, cats: ['chatora', 'hachiware', 'mike', 'siamese', 'sabatora'] },
    { id: 'step', name: '1F 右のステップ', x: 1120, y: 620, stage: 3, cats: ['sabatora', 'shiro', 'cream', 'mike', 'sabi'] },
    { id: 'loft', name: '2F ロフト', x: 390, y: 318, stage: 4, cats: ['siamese', 'mike', 'oshare', 'cream', 'shiro'] },
    { id: 'bridge', name: '2F つり橋', x: 880, y: 262, stage: 5, cats: ['hachiware', 'sabi', 'oshare', 'maneki', 'mike'] },
    { id: 'attic', name: '屋根裏ベッド', x: 780, y: 60, stage: 6, cats: ['maneki', 'oshare', 'siamese', 'kin'] },
  ];

  var RODS = [
    { lv: 1, name: 'ふつうの竿', price: 0, strength: 1.0, reel: 1.0 },
    { lv: 2, name: 'じょうぶな竿', price: 400, strength: 1.2, reel: 1.12 },
    { lv: 3, name: 'プロの竿', price: 1500, strength: 1.45, reel: 1.25 },
    { lv: 4, name: '伝説の竿', price: 5000, strength: 1.75, reel: 1.4 },
  ];

  var MEDALS = [
    { id: 'first', name: 'はじめての一匹', desc: '猫を1匹釣る', reward: 50 },
    { id: 'bait', name: 'ベイトキャッチャー', desc: 'パーフェクト合わせを10回', reward: 300 },
    { id: 'big', name: '大物つり師', desc: '★4以上の猫を釣る', reward: 300 },
    { id: 'gold', name: '金のねこ', desc: '金のねこを釣る', reward: 1000 },
    { id: 'n50', name: 'ねこ名人', desc: '合計50匹釣る', reward: 500 },
    { id: 'nobreak', name: '糸切れ知らず', desc: '糸を切らずにステージクリア', reward: 150 },
    { id: 'stage6', name: '屋根裏の住人', desc: 'ステージ6をクリア', reward: 500 },
    { id: 'dex', name: '図鑑コンプリート', desc: '全13種類を釣る', reward: 2000 },
  ];

  function stageInfo(n) {
    n = Math.max(1, Math.floor(n));
    return {
      n: n,
      casts: 10,
      target: Math.min(3 + Math.floor((n - 1) / 2), 7),
      bonus: 80 + n * 40,
      mul: 1 + Math.min(0.6, (n - 1) * 0.05),
    };
  }

  window.NK = { BUILD_TIME: BUILD_TIME, BREEDS: BREEDS, BAITS: BAITS, SPOTS: SPOTS, RODS: RODS, MEDALS: MEDALS, RARITY_W: RARITY_W, stageInfo: stageInfo };
})();
