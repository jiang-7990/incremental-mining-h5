// 素材层：镐子与方块贴图预加载。没加载完先画程序化贴图，不阻塞首帧。
(function () {
  var root = (typeof GameGlobal !== 'undefined') ? GameGlobal
    : (typeof window !== 'undefined' ? window : globalThis);
  var G = root.G = root.G || {};

  var ASSETS = G.ASSETS = { picks: {}, blocks: {} };

  function newImage() {
    if (typeof wx !== 'undefined' && typeof wx.createImage === 'function') return wx.createImage();
    if (typeof Image !== 'undefined') return new Image();
    return null;
  }

  // 全部加载完（成功或失败）后回调一次：让渲染层用真贴图重建图集
  ASSETS.load = function () {
    var pending = 0;
    function done() {
      if (--pending > 0 || !ASSETS.onReady) return;
      var cb = ASSETS.onReady;
      ASSETS.onReady = null;
      cb();
    }
    function grab(dir, store, key, file) {
      var im = newImage();
      if (!im) return;
      pending++;
      im.onload = function () { store[key] = im; done(); };
      im.onerror = function () { done(); };   // 缺图就退回程序化贴图，不报错
      im.src = dir + file + '.png';
    }

    (G.PICK_TEX || []).forEach(function (key) {
      grab(G.PICK_TEX_DIR, ASSETS.picks, key, key + '_pickaxe');
    });
    Object.keys(G.BLOCK_TEX || {}).forEach(function (key) {
      grab(G.BLOCK_TEX_DIR, ASSETS.blocks, key, G.BLOCK_TEX[key]);
    });
  };

  // 第 i 把镐的贴图；还没加载完返回 null
  ASSETS.pick = function (i) {
    var key = (G.PICK_TEX || [])[i];
    return key ? (ASSETS.picks[key] || null) : null;
  };

  // 某个方块的贴图；还没加载完返回 null
  ASSETS.block = function (key) {
    return ASSETS.blocks[key] || null;
  };
})();
