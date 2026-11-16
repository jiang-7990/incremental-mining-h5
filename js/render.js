// 渲染层：像素图集、世界烘焙、特效、HUD 绘制原语
(function () {
  var root = (typeof GameGlobal !== 'undefined') ? GameGlobal
    : (typeof window !== 'undefined' ? window : globalThis);
  var G = root.G = root.G || {};

  var T = G.TILE * G.BAKE_SCALE;   // 烘焙像素/格（TILE 7.5 × 2 = 15）
  var VAR = 4;               // 每方块纹理变体数

  var R = G.R = {};
  R.T = T;
  R.VAR = VAR;

  // ---------- canvas 工厂 ----------
  function makeCanvas(w, h) {
    var c;
    if (G.env.isWX) c = wx.createCanvas();
    else c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  R.makeCanvas = makeCanvas;

  R.init = function (canvas) {
    R.canvas = canvas;
    R.ctx = canvas.getContext('2d');

    R.bake = makeCanvas(G.WORLD_W * T, G.WORLD_H * T);
    R.bctx = R.bake.getContext('2d');

    R.atlas = makeCanvas(1, 1);
    R.actx = R.atlas.getContext('2d');

    R.parts = [];
    R.rings = [];
    R.texts = [];
    R.tracers = [];
    R.breaks = [];
    R.spawns = [];
  };

  // ---------- 纹理图集（按关卡底岩配色的矿石纹理）----------
  R.buildAtlas = function (levelIdx) {
    var lv = G.LEVELS[levelIdx];
    var stoneCol = G.BLOCKS[G.ID[lv.bottom]].base;
    var n = G.BLOCKS.length;
    var aw = n * VAR * T, ah = T;
    R.atlas.width = aw; R.atlas.height = ah;
    var actx = R.actx;
    actx.clearRect(0, 0, aw, ah);

    for (var i = 0; i < n; i++) {
      var b = G.BLOCKS[i];
      var img = G.ASSETS && G.ASSETS.block(b.key);
      for (var v = 0; v < VAR; v++) {
        var ox = (i * VAR + v) * T;
        if (img) drawImg(actx, ox, 0, img, v);
        else drawTex(actx, ox, 0, b, v, stoneCol);
      }
    }
  };

  // 原版 16×16 贴图 → 图集格（最近邻）。4 个变体用镜像错开，破掉一模一样重复的格子。
  function drawImg(ctx, ox, oy, img, v) {
    ctx.imageSmoothingEnabled = false;
    var fx = (v === 1 || v === 3) ? -1 : 1;
    var fy = (v === 2 || v === 3) ? -1 : 1;
    if (fx > 0 && fy > 0) {
      ctx.drawImage(img, 0, 0, img.width, img.height, ox, oy, T, T);
      return;
    }
    ctx.save();
    ctx.translate(ox + (fx < 0 ? T : 0), oy + (fy < 0 ? T : 0));
    ctx.scale(fx, fy);
    ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, T, T);
    ctx.restore();
  }

  function drawTex(ctx, ox, oy, b, v, stoneCol) {
    var seed = (b.key.length * 31 + v * 17 + 7) | 0;
    var rnd = G.mulberry32(seed);

    if (!b.ore) {
      // 填充方块：大块色斑 + 单向高光，缩小到 4px 后仍然稳定不噪
      ctx.fillStyle = b.base;
      ctx.fillRect(ox, oy, T, T);
      for (var i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 ? b.dark : 'rgba(255,255,255,0.07)';
        var px = ((rnd() * (T / 2)) | 0) * 2, py = ((rnd() * (T / 2)) | 0) * 2;
        ctx.fillRect(ox + px, oy + py, 2, 2);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(ox, oy, T, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(ox, oy + T - 1, T, 1);
      return;
    }

    // 矿物：岩石底 + 实心矿块，缩小后是一个明确的彩色方块
    ctx.fillStyle = b.bg || stoneCol;
    ctx.fillRect(ox, oy, T, T);
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(ox, oy, T, 1);
    ctx.fillRect(ox, oy + T - 1, T, 1);
    ctx.fillRect(ox, oy, 1, T);
    ctx.fillRect(ox + T - 1, oy, 1, T);

    ctx.fillStyle = b.base;
    ctx.fillRect(ox + 1, oy + 1, T - 2, T - 2);

    ctx.fillStyle = b.dark;
    var sx = 1 + ((rnd() * (T - 5)) | 0), sy = 1 + ((rnd() * (T - 5)) | 0);
    ctx.fillRect(ox + sx, oy + sy, 2, 2);

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(ox + 2, oy + 2, 2, 1);
    ctx.fillRect(ox + 2, oy + 3, 1, 1);
  }

  function texPos(id, x, y) {
    var v = (x * 73856093 ^ y * 19349663) >>> 0;
    return ((id * VAR + (v % VAR)) * T);
  }

  // ---------- 世界烘焙 ----------
  R.bakeAll = function (world) {
    var ctx = R.bctx, grid = world.grid, at = R.atlas;
    var w = G.WORLD_W, h = G.WORLD_H;
    ctx.clearRect(0, 0, w * T, h * T);
    for (var y = 0; y < h; y++) {
      var ty = y * T;
      for (var x = 0; x < w; x++) {
        var id = grid[y * w + x];
        ctx.drawImage(at, texPos(id, x, y), 0, T, T, x * T, ty, T, T);
      }
    }
  };

  // 只重绘脏格
  R.paintTiles = function (world, idxList) {
    var ctx = R.bctx, grid = world.grid, at = R.atlas, w = G.WORLD_W;
    for (var i = 0; i < idxList.length; i++) {
      var idx = idxList[i];
      var x = idx % w, y = (idx - x) / w;
      var id = grid[idx];
      ctx.drawImage(at, texPos(id, x, y), 0, T, T, x * T, y * T, T, T);
    }
  };

  // 稀有矿微光：钻石/绿宝石/残骸在 10px 一格里只是几像素，给它们一点呼吸感
  var RARE_TINT = {
    diamond: '#7FF3E4', emerald: '#5CFF9B', ds_diamond: '#7FF3E4',
    ds_emerald: '#5CFF9B', debris: '#C48A63',
  };
  var RARE_CELLS = null;
  R.twinkle = function (ctx, world, now, ox, oy) {
    if (!RARE_CELLS) {
      RARE_CELLS = [];
      for (var key in RARE_TINT) {
        if (G.ID[key] !== undefined) RARE_CELLS.push({ id: G.ID[key], c: RARE_TINT[key] });
      }
    }
    var grid = world.grid, w = G.WORLD_W, h = G.WORLD_H, tile = G.TILE;
    ctx.save();
    for (var y = 0; y < h; y++) {
      var row = y * w;
      for (var x = 0; x < w; x++) {
        var id = grid[row + x];
        var tint = null;
        for (var j = 0; j < RARE_CELLS.length; j++) {
          if (RARE_CELLS[j].id === id) { tint = RARE_CELLS[j].c; break; }
        }
        if (!tint) continue;
        var ph = (x * 73856093 ^ y * 19349663) >>> 0;
        var k = Math.sin(now / 340 + (ph % 628) / 100);   // 每格相位不同，闪得错开
        if (k <= 0.45) continue;                          // 大部分时间不亮
        var a = (k - 0.45) / 0.55;
        var sx = ox + x * tile + tile / 2, sy = oy + y * tile + tile / 2;
        ctx.globalAlpha = 0.70 * a;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
        ctx.globalAlpha = 0.55 * a;
        ctx.fillStyle = tint;
        ctx.fillRect(sx - 4, sy - 0.5, 8, 1);
        ctx.fillRect(sx - 0.5, sy - 4, 1, 8);
      }
    }
    ctx.restore();
  };

  // ---------- 特效 ----------
  R.burst = function (wx, wy, count, colors) {
    for (var i = 0; i < count; i++) {
      if (R.parts.length > 320) break;
      var a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 90;
      R.parts.push({
        x: wx, y: wy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
        life: 1, max: 0.45 + Math.random() * 0.35,
        sz: 2 + Math.random() * 3,
        c: colors[(Math.random() * colors.length) | 0],
      });
    }
  };

  R.ring = function (wx, wy, r0, r1, color) {
    R.rings.push({ x: wx, y: wy, r0: r0, r1: r1, t: 0, dur: 0.28, c: color });
  };

  // 矿物被砸掉：碎片 + 一下收缩的色块（格子立刻就变回石头，靠这层回执让玩家看见"矿碎了"）
  R.oreBreak = function (wx, wy, id) {
    var b = G.BLOCKS[id];
    if (!b) return;
    R.burst(wx, wy, 2, ['#FFFFFF', b.base]);
    R.breaks.push({ x: wx, y: wy, t: 0, dur: 0.20, c: b.base });
  };

  // 新矿长出来：一圈很淡的柔光，别太抢眼
  R.oreSpawn = function (wx, wy, id) {
    var b = G.BLOCKS[id];
    if (!b) return;
    R.spawns.push({ x: wx, y: wy, t: 0, dur: 0.42, c: b.base });
  };

  // 子弹轨迹：只在弹头后面拖一小截尾巴（整条拉满会像一堵光墙）
  R.tracer = function (wx, wy, dx, dy, color) {
    R.tracers.push({ x: wx, y: wy, dx: dx, dy: dy, t: 0, dur: 0.20, c: color });
  };

  // 飘字：连点时把 0.3 秒内的收入合并成一个数字，避免一串数字叠在一起糊成一片
  R.floatText = function (wx, wy, val, color, size) {
    var last = R.texts[R.texts.length - 1];
    if (last && last.t < 0.30 && Math.abs(last.x - wx) < 40 && Math.abs(last.y - wy) < 40) {
      last.v += val;
      last.x = (last.x * 2 + wx) / 3;
      last.y = Math.min(last.y, wy) - 2;
      last.s = '+' + R.fmt(last.v);
      last.t = 0;
      return;
    }
    R.texts.push({ x: wx, y: wy, t: 0, dur: 0.9, v: val, s: '+' + R.fmt(val), c: color, sz: size || 18 });
  };

  R.updateFx = function (dt) {
    var i;
    for (i = R.parts.length - 1; i >= 0; i--) {
      var p = R.parts[i];
      p.life -= dt / p.max;
      if (p.life <= 0) { R.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 260 * dt;
    }
    for (i = R.rings.length - 1; i >= 0; i--) {
      var r = R.rings[i];
      r.t += dt;
      if (r.t >= r.dur) R.rings.splice(i, 1);
    }
    for (i = R.tracers.length - 1; i >= 0; i--) {
      var tr = R.tracers[i];
      tr.t += dt;
      if (tr.t >= tr.dur) R.tracers.splice(i, 1);
    }
    for (i = R.breaks.length - 1; i >= 0; i--) {
      var bk = R.breaks[i];
      bk.t += dt;
      if (bk.t >= bk.dur) R.breaks.splice(i, 1);
    }
    for (i = R.spawns.length - 1; i >= 0; i--) {
      var sp = R.spawns[i];
      sp.t += dt;
      if (sp.t >= sp.dur) R.spawns.splice(i, 1);
    }
    for (i = R.texts.length - 1; i >= 0; i--) {
      var t = R.texts[i];
      t.t += dt;
      t.y -= 34 * dt;
      if (t.t >= t.dur) R.texts.splice(i, 1);
    }
  };

  // ---------- 画布工具 ----------
  R.roundRect = function (ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  R.panel = function (ctx, x, y, w, h, r, fill, stroke, lw) {
    R.roundRect(ctx, x, y, w, h, r || 10);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw || 2;
      ctx.stroke();
    }
  };

  R.text = function (ctx, s, x, y, size, color, align, weight) {
    ctx.fillStyle = color || '#fff';
    ctx.font = (weight || 'bold') + ' ' + size + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  };

  // 数字格式化：万 / 亿 / 万亿 / 1e16 之后用科学计数
  R.fmt = function (n) {
    n = Math.floor(n);
    if (!isFinite(n)) return '∞';
    if (n < 10000) return '' + n;
    if (n < 1e8) return trim(n / 1e4, 1) + '万';
    if (n < 1e12) return trim(n / 1e8, 2) + '亿';
    if (n < 1e16) return trim(n / 1e12, 2) + '万亿';
    var e = Math.floor(Math.log10(n));
    return trim(n / Math.pow(10, e), 2) + 'e' + e;
  };

  // 小数值压缩：100 以下保留小数，以上取整
  function trim(v, digits) {
    if (v < 100) {
      var s = v.toFixed(digits);
      return s.replace(/\.?0+$/, '');
    }
    return '' + Math.floor(v);
  }
  R.fmtSmall = trim;
})();
