// 世界层：矿区生成、挖掘、矿物贫化恢复
(function () {
  var root = (typeof GameGlobal !== 'undefined') ? GameGlobal
    : (typeof window !== 'undefined' ? window : globalThis);
  var G = root.G = root.G || {};

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  G.mulberry32 = mulberry32;

  var W = G.WORLD_W, H = G.WORLD_H, N = W * H;

  // 按权重表建累积表；稀有矿权重乘以 rareW
  function buildTable(weights, rareW) {
    if (!weights) return null;
    var list = [], cum = [], total = 0;
    for (var k in weights) {
      if (!weights.hasOwnProperty(k)) continue;
      var id = G.ID[k];
      if (id === undefined) continue;
      var w = weights[k];
      if (rareW && G.RARE.indexOf(k) >= 0) w *= rareW;
      total += w;
      list.push(id);
      cum.push(total);
    }
    if (!list.length) return null;
    return { list: list, cum: cum, total: total };
  }

  function World() {
    this.grid = new Uint8Array(N);
    this.rich = new Float32Array(N);
    this.boundary = new Int16Array(W);
    this.weak = [];
    this.level = 0;
    this.tabTop = null;
    this.tabBot = null;
    this.density = 0.08;
    this.oreCount = 0;      // 当前场上矿物格数
    this.oreTarget = 0;     // 本关的矿物总量（生成时定下，之后恒定）
    this.touched = [];      // 被「挪位置」的矿物格，供渲染层补画
    this.spawned = [];      // 新长出来的矿物格（给生成动画用）
  }

  World.prototype.gen = function (levelIdx, rareLvl) {
    var lv = G.LEVELS[levelIdx];
    var rnd = mulberry32(levelIdx * 7919 + 12345);
    this.level = levelIdx;

    var topId = G.ID[lv.top], botId = G.ID[lv.bottom];
    var baseY = Math.floor(H * lv.topRatio);

    for (var x = 0; x < W; x++) {
      var n = Math.sin(x * 0.041 + levelIdx * 1.7) * 0.55
            + Math.sin(x * 0.113 + levelIdx * 3.1) * 0.30
            + Math.sin(x * 0.271 + 1.3) * 0.15;
      this.boundary[x] = Math.max(0, Math.min(H, Math.round(baseY + n * lv.smooth)));
    }

    var rareW = rareLvl ? G.fx.rareW(rareLvl) : 1;
    this.tabTop = buildTable(lv.oreTop, rareW);
    this.tabBot = buildTable(lv.oreBot, rareW);
    this.density = lv.density;

    for (var y = 0; y < H; y++) {
      var row = y * W;
      for (var x2 = 0; x2 < W; x2++) {
        var idx = row + x2;
        var isTop = y < this.boundary[x2];
        this.grid[idx] = isTop ? topId : botId;
        this.rich[idx] = 1;
        var tab = isTop ? this.tabTop : this.tabBot;
        if (tab && rnd() < this.density) {
          this.grid[idx] = pickFrom(tab, rnd);
        }
      }
    }
    this.weak.length = 0;
    this.touched.length = 0;
    this.spawned.length = 0;
    // 矿物总量守恒：把生成时的矿物数记成目标值，之后挖掉多少就补回多少
    this.oreCount = this.countOres();
    this.oreTarget = this.oreCount;
    return this;
  };

  function pickFrom(tab, rnd) {
    var r = rnd() * tab.total;
    for (var i = 0; i < tab.cum.length; i++) {
      if (r < tab.cum[i]) return tab.list[i];
    }
    return tab.list[tab.list.length - 1];
  }

  // 圆形范围扫描
  World.prototype.scan = function (cx, cy, r) {
    var out = { idx: [], ids: [], oreCount: 0 };
    var x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
    var y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
    var r2 = r * r;
    for (var y = y0; y <= y1; y++) {
      var dy = y + 0.5 - cy, row = y * W;
      for (var x = x0; x <= x1; x++) {
        var dx = x + 0.5 - cx;
        if (dx * dx + dy * dy > r2) continue;
        var idx = row + x;
        var id = this.grid[idx];
        out.idx.push(idx);
        out.ids.push(id);
        if (G.BLOCKS[id].ore) out.oreCount++;
      }
    }
    return out;
  };

  // 就地重生一格（含贫化与「矿物总量守恒」）
  World.prototype._regen = function (idx) {
    var x = idx % W, y = (idx - x) / W;
    var isTop = y < this.boundary[x];
    var baseId = isTop ? G.ID[G.LEVELS[this.level].top] : G.ID[G.LEVELS[this.level].bottom];
    var tab = isTop ? this.tabTop : this.tabBot;
    if (G.BLOCKS[this.grid[idx]].ore) this.oreCount--;
    this.rich[idx] = Math.max(G.RICH_MIN, this.rich[idx] - G.RICH_DROP);
    this.weak.push(idx);
    var nid = baseId;
    // 只有总数没满时才允许长出新矿，否则整个世界的矿会越挖越多
    if (tab && this.oreCount < this.oreTarget && Math.random() < this.density * this.rich[idx]) {
      nid = pickFrom(tab, Math.random);
      this.oreCount++;
      if (G.BLOCKS[nid].ore) this.spawned.push({ x: x, y: y, id: nid });
    }
    this.grid[idx] = nid;
    // 挖掉的矿要在别处补回来，总量才对得上
    if (this.oreCount < this.oreTarget) this._relocateOre(idx);
  };

  // 把一颗矿挪到别的空格子上（避免"同一格永远有矿"的刷分点）
  World.prototype._relocateOre = function (avoid) {
    for (var t = 0; t < 16; t++) {
      var i = (Math.random() * N) | 0;
      if (i === avoid) continue;
      if (G.BLOCKS[this.grid[i]].ore) continue;
      var x = i % W, y = (i - x) / W;
      var tab = y < this.boundary[x] ? this.tabTop : this.tabBot;
      if (!tab) continue;
      this.grid[i] = pickFrom(tab, Math.random);
      this.oreCount++;
      this.touched.push(i);
      if (G.BLOCKS[this.grid[i]].ore) this.spawned.push({ x: x, y: y, id: this.grid[i] });
      return;
    }
  };

  // 执行一次挖掘：结算 + 就地重生（贫化）
  World.prototype.dig = function (cx, cy, r, luckMult) {
    var scan = this.scan(cx, cy, r);
    var emc = 0, oreAt = [];
    for (var i = 0; i < scan.ids.length; i++) {
      var b = G.BLOCKS[scan.ids[i]];
      // 填充方块也值基础值 1（用户定的公式：基础值 * 10^((5+时运)/5)）
      emc += b.v;
      if (b.ore) {
        var oi = scan.idx[i], ox = oi % W;
        oreAt.push({ x: ox, y: (oi - ox) / W, id: scan.ids[i] });
      }
    }
    emc = Math.round(emc * luckMult);

    for (var j = 0; j < scan.idx.length; j++) this._regen(scan.idx[j]);
    return { emc: emc, ores: scan.oreCount, n: scan.idx.length, idx: scan.idx, oreAt: oreAt };
  };

  // 挖掉一格并就地重生（贫化），返回这一格的基础值与是否矿物
  World.prototype.digCell = function (idx) {
    var gid = this.grid[idx];
    var b = G.BLOCKS[gid];
    this._regen(idx);
    return { emc: b.v, ore: !!b.ore, id: gid };
  };

  // 子弹：从 (x0,y0) 沿单位方向 (dx,dy) 打出去，把射程线上经过的格子逐格打穿
  // 用 Bresenham 走格子，斜向不会因为四舍五入漏格或重复
  World.prototype.bullet = function (x0, y0, dx, dy, range) {
    var out = { emc: 0, cells: 0, ores: 0, idx: [], oreAt: [] };
    var sx = Math.round(x0), sy = Math.round(y0);
    var ex = Math.round(x0 + dx * range), ey = Math.round(y0 + dy * range);
    var adx = Math.abs(ex - sx), ady = Math.abs(ey - sy);
    var stx = ex > sx ? 1 : -1, sty = ey > sy ? 1 : -1;
    var err = adx - ady;
    var cx = sx, cy = sy;
    while (true) {
      if (cx !== sx || cy !== sy) {
        if (cx < 0 || cy < 0 || cx >= W || cy >= H) break;
        var idx = cy * W + cx;
        var r = this.digCell(idx);
        out.emc += r.emc;
        out.cells++;
        out.idx.push(idx);
        if (r.ore) { out.ores++; out.oreAt.push({ x: cx, y: cy, id: r.id }); }
      }
      if (cx === ex && cy === ey) break;
      var e2 = 2 * err;
      if (e2 > -ady) { err -= ady; cx += stx; }
      if (e2 < adx) { err += adx; cy += sty; }
    }
    return out;
  };

  // 连锁总执行器：从一组起点各打一轮子弹，被打到的矿再按概率接着打。
  // 递归天然会爆炸式增长，所以用「每次点击的子弹预算」硬性封顶。
  // opt: { dirs:[{x,y}], range, p, maxDepth, budget }
  World.prototype.chainBurst = function (origins, opt) {
    var out = { emc: 0, cells: 0, ores: 0, shots: [], idx: [], oreAt: [], oresHit: 0 };
    var queue = [];
    for (var i = 0; i < origins.length; i++) queue.push({ x: origins[i].x, y: origins[i].y, d: 0 });
    var fired = 0;
    var firstCap = opt.firstBudget === undefined ? opt.budget : opt.firstBudget;
    while (queue.length && fired < opt.budget) {
      var from = queue.shift();
      // 首轮（玩家亲手砸到的矿）最多吃 firstCap 发，剩下的预算一定留给二段，
      // 否则满级 3 个起点 × 8 方向就把 24 发吃干了，递归永远看不到。
      var cap = from.d === 0 ? Math.min(opt.budget, firstCap) : opt.budget;
      for (var k = 0; k < opt.dirs.length && fired < cap; k++) {
        var d = opt.dirs[k];
        var r = this.bullet(from.x, from.y, d.x, d.y, opt.range);
        fired++;
        if (!r.cells) continue;
        out.emc += r.emc;
        out.cells += r.cells;
        out.ores += r.ores;
        out.oresHit += r.ores;
        for (var m = 0; m < r.idx.length; m++) out.idx.push(r.idx[m]);
        for (var q = 0; q < r.oreAt.length; q++) out.oreAt.push(r.oreAt[q]);
        out.shots.push({ x: from.x, y: from.y, dx: d.x, dy: d.y, range: opt.range });
        // 连锁打到的矿，同样按概率继续炸（这就是"连锁里的矿也算数"）
        if (from.d + 1 <= opt.maxDepth) {
          for (var n = 0; n < r.oreAt.length; n++) {
            if (Math.random() < opt.p) queue.push({ x: r.oreAt[n].x, y: r.oreAt[n].y, d: from.d + 1 });
          }
        }
      }
    }
    out.fired = fired;
    return out;
  };

  // 贫化恢复（按秒计，dt 省略时按一帧算）
  World.prototype.regen = function (dt) {
    if (this.weak.length === 0) return;
    var step = G.RICH_REGEN * (dt === undefined ? 1 / 60 : dt);
    var keep = [];
    for (var i = 0; i < this.weak.length; i++) {
      var idx = this.weak[i];
      if (this.rich[idx] >= 1) { this.rich[idx] = 1; continue; }
      this.rich[idx] = Math.min(1, this.rich[idx] + step);
      keep.push(idx);
    }
    this.weak = keep;
  };

  World.prototype.countOres = function () {
    var c = 0;
    for (var i = 0; i < N; i++) if (G.BLOCKS[this.grid[i]].ore) c++;
    return c;
  };

  G.World = World;
  G.W = W; G.H = H; G.N = N;
})();
