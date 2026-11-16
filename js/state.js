// 状态层：玩家存档、升级购买、派生数值
(function () {
  var root = (typeof GameGlobal !== 'undefined') ? GameGlobal
    : (typeof window !== 'undefined' ? window : globalThis);
  var G = root.G = root.G || {};

  var SAVE_KEY = 'kuangjin_v1';
  var SCHEMA = 1;

  function blank() {
    return {
      schemaVersion: SCHEMA,
      emc: 0,
      totalEmc: 0,
      level: 0,
      pick: 0,
      tracks: { eff: 1, luck: 1, dens: 1, food: 1, cprob: 1, crange: 1, rarity: 1 },
      maxLevel: 0,
      runs: 0,
      maxEmcPerDig: 0,
      chainCount: 0,
      win: false,
      muted: false,
    };
  }

  var S = G.S = {
    data: blank(),
    world: new G.World(),
    trackMap: {},
  };

  G.TRACKS.forEach(function (t) { S.trackMap[t.key] = t; });

  // ---------- 派生 ----------
  S.radius = function () { return G.fx.radius(S.data.tracks.eff); };
  S.luckMult = function () { return G.fx.luckMult(S.data.tracks.luck); };
  S.density = function () {
    return G.fx.density(G.LEVELS[S.data.level].density, S.data.tracks.dens);
  };
  S.foodMax = function () { return G.fx.food(S.data.tracks.food); };
  S.chainP = function () { return G.fx.chainP(S.data.tracks.cprob); };
  S.chainDirs = function () { return G.fx.chainDirs(S.data.tracks.cprob); };
  S.chainR = function () { return G.fx.chainR(S.data.tracks.crange); };
  S.pickMult = function () { return G.PICKS[S.data.pick].mult; };

  S.trackUnlocked = function (key) {
    var t = S.trackMap[key];
    return S.data.pick >= t.unlock;
  };

  S.trackCost = function (key) {
    var t = S.trackMap[key];
    var L = S.data.tracks[key];
    return Math.floor(t.cost * G.TRACK_SCALE * Math.pow(t.g, L - 1));
  };
  S.nextPickCost = function () {
    var n = S.data.pick + 1;
    if (n >= G.PICKS.length) return -1;
    return G.PICKS[n].cost;
  };
  S.levelUnlocked = function (i) { return i <= S.data.pick; };

  // 全部升级卡是否已点满（通关条件之一）
  S.trackLevelsLeft = function () {
    var left = 0;
    for (var i = 0; i < G.TRACKS.length; i++) {
      var t = G.TRACKS[i];
      left += Math.max(0, t.max - S.data.tracks[t.key]);
    }
    return left;
  };
  S.allMaxed = function () { return S.trackLevelsLeft() === 0; };
  S.canFinish = function () {
    return S.data.pick >= G.PICKS.length - 1 && S.allMaxed();
  };

  // ---------- 购买 ----------
  S.canBuy = function (key) {
    var t = S.trackMap[key];
    if (!S.trackUnlocked(key)) return false;
    if (S.data.tracks[key] >= t.max) return false;
    return S.data.emc >= S.trackCost(key);
  };
  S.buy = function (key) {
    if (!S.canBuy(key)) return false;
    S.data.emc -= S.trackCost(key);
    S.data.tracks[key] += 1;
    if (key === 'dens' || key === 'food' || key === 'rarity') S.regenWorld();
    return true;
  };
  // 一次点到能买的最高级（200 级线不可能手点）
  S.buyMax = function (key) {
    var t = S.trackMap[key];
    if (!S.trackUnlocked(key)) return 0;
    var n = 0;
    while (S.data.tracks[key] < t.max && S.data.emc >= S.trackCost(key)) {
      S.data.emc -= S.trackCost(key);
      S.data.tracks[key] += 1;
      n++;
    }
    if (n > 0 && (key === 'dens' || key === 'food' || key === 'rarity')) S.regenWorld();
    return n;
  };

  S.buyPick = function () {
    var c = S.nextPickCost();
    if (c < 0 || S.data.emc < c) return false;
    S.data.emc -= c;
    S.data.pick += 1;
    if (S.data.pick > S.data.maxLevel) S.data.maxLevel = S.data.pick;
    return true;
  };

  S.regenWorld = function () {
    if (!S.world) return;
    S.world.gen(S.data.level, S.data.tracks.rarity);
    if (G.R && G.R.bakeAll) G.R.bakeAll(S.world);
  };

  // ---------- 存读档 ----------
  function storageGet(k) {
    try {
      if (G.env.isWX) return wx.getStorageSync(k) || null;
      var v = window.localStorage.getItem(k);
      return v ? JSON.parse(v) : null;
    } catch (e) { return null; }
  }
  function storageSet(k, v) {
    try {
      if (G.env.isWX) wx.setStorageSync(k, v);
      else window.localStorage.setItem(k, JSON.stringify(v));
    } catch (e) { /* 存储不可用时静默降级 */ }
  }

  S.load = function () {
    var raw = storageGet(SAVE_KEY);
    if (!raw) return false;
    try {
      var d = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!d || typeof d !== 'object') return false;
      d = migrate(d);
      var base = blank();
      for (var k in base) if (d[k] === undefined) d[k] = base[k];
      if (!d.tracks) d.tracks = base.tracks;
      for (var t = 0; t < G.TRACKS.length; t++) {
        var key = G.TRACKS[t].key;
        if (typeof d.tracks[key] !== 'number' || d.tracks[key] < 1) d.tracks[key] = 1;
        if (d.tracks[key] > G.TRACKS[t].max) d.tracks[key] = G.TRACKS[t].max;
      }
      if (!isFinite(d.emc) || d.emc < 0) d.emc = 0;
      if (!isFinite(d.totalEmc) || d.totalEmc < 0) d.totalEmc = 0;
      if (d.level < 0 || d.level >= G.LEVELS.length) d.level = 0;
      if (d.pick < 0 || d.pick >= G.PICKS.length) d.pick = 0;
      S.data = d;
      return true;
    } catch (e) {
      S.data = blank();
      return false;
    }
  };

  function migrate(d) {
    if (!d.schemaVersion) d.schemaVersion = 1;
    return d;
  }

  var saveTimer = 0;
  S.markDirty = function (now) {
    if (!saveTimer) saveTimer = now;
  };
  S.tickSave = function (now, force) {
    if (force) { S.saveNow(); saveTimer = 0; return; }
    if (saveTimer && now - saveTimer > 5000) { S.saveNow(); saveTimer = 0; }
  };
  S.saveNow = function () {
    S.data.schemaVersion = SCHEMA;
    storageSet(SAVE_KEY, S.data);
  };
  S.reset = function () {
    S.data = blank();
    S.saveNow();
  };
})();
