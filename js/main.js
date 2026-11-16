// 主循环：启动、输入、状态机
(function () {
  var root = (typeof GameGlobal !== 'undefined') ? GameGlobal
    : (typeof window !== 'undefined' ? window : globalThis);
  var G = root.G = root.G || {};
  var R = G.R, UI = G.UI, S = G.S, A = G.A;

  G.env = G.env || {};
  G.env.isWX = (typeof wx !== 'undefined' && typeof wx.createCanvas === 'function');

  var M = G.M = {};
  M.screen = 'shop';
  M.digsLeft = 0;
  M.pointer = { x: G.DESIGN_W / 2, y: G.DESIGN_H / 2, down: false, hover: false, show: false };
  M.nextDigAt = 0;
  M.pickSwingAt = 0;
  M.now = 0;
  M.lastRun = null;
  M.toastMsg = null;
  M.resetArmed = 0;
  M.winShown = false;
  M.hold = null;            // 长按升级卡的连击状态
  M.hitBoxes = [];          // 每次点击的"这一下挖了什么"提示框
  M.runStats = { digs: 0, emc: 0, chain: 0 };

  var TOUCH_LIFT = 56;      // 触摸时挖掘点上移到手指上方
  var TOP_TOAST_Y = 96;

  // ---------- 视图 ----------
  function fit() {
    var canvas = M.canvas;
    var cssW, cssH, dpr;
    if (G.env.isWX) {
      var info = wx.getSystemInfoSync();
      cssW = info.windowWidth; cssH = info.windowHeight;
      dpr = Math.min(info.pixelRatio || 2, 2);
    } else {
      cssW = window.innerWidth; cssH = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
    }
    var cw = Math.round(cssW * dpr), ch = Math.round(cssH * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw; canvas.height = ch;
    }
    var scale = Math.min(cw / G.DESIGN_W, ch / G.DESIGN_H);
    G.view = {
      cssW: cssW, cssH: cssH, dpr: dpr, cw: cw, ch: ch,
      scale: scale,
      ox: (cw - G.DESIGN_W * scale) / 2,
      oy: (ch - G.DESIGN_H * scale) / 2,
    };
  }
  M.fit = fit;

  function toDesign(cx, cy) {
    var v = G.view;
    return { x: (cx * v.dpr - v.ox) / v.scale, y: (cy * v.dpr - v.oy) / v.scale };
  }

  function worldPos(p) {
    var lift = G.env.isWX ? TOUCH_LIFT : 0;
    return {
      x: (p.x - UI.WORLD_X) / G.TILE,
      y: (p.y - lift - UI.WORLD_Y) / G.TILE,
    };
  }
  function insideWorld(gx, gy) {
    return gx >= 0 && gy >= 0 && gx < G.WORLD_W && gy < G.WORLD_H;
  }

  // 指针是否落在可挖的方块区（"镐子当光标"只管这一块，顶栏和页脚不归它）
  function cursorInField(p) {
    var w = worldPos(p);
    return insideWorld(w.x, w.y);
  }

  // 光标形态：方块区自绘镐子并藏掉系统光标，其余地方交还系统光标
  function syncCursor() {
    if (G.env.isWX) return;
    var p = M.pointer, want = 'default';
    if (M.screen === 'play' && p.hover && cursorInField(p)) want = 'none';
    else if (p.hover && UI.pickHit(p.x, p.y)) want = 'pointer';
    if (M.canvas.style.cursor !== want) M.canvas.style.cursor = want;
  }

  // ---------- 流程 ----------
  M.startRun = function (level) {
    S.data.level = level;
    S.data.runs += 1;
    S.world.gen(level, S.data.tracks.rarity);
    R.buildAtlas(level);
    R.bakeAll(S.world);
    M.digsLeft = S.foodMax();
    M.runStats = { digs: 0, emc: 0, chain: 0 };
    M.screen = 'play';
    M.nextDigAt = 0;
    S.markDirty(M.now);
  };

  M.endRun = function () {
    M.lastRun = M.runStats;
    M.screen = 'shop';
    S.saveNow();
  };

  function toast(s, ms) { M.toastMsg = { s: s, until: M.now + (ms || 1400) }; }
  M.toast = toast;

  // 买到最终镐：全矿脉回应，一波清场演出后进结算
  function startFinale() {
    M.winShown = true;
    S.data.win = true;
    S.saveNow();
    var cx = G.WORLD_W * G.TILE / 2, cy = G.WORLD_H * G.TILE / 2;
    for (var i = 0; i < 5; i++) {
      R.ring(cx, cy, i * 30, 500 + i * 220, 'rgba(255,233,168,0.85)');
    }
    M.finale = { t: M.now, next: M.now, waves: 0 };
    A.play('win');
    toast('下界合金镐 · 整片矿区都在回应', 1600);
  }

  // ---------- 挖掘 ----------
  function digAt(gx, gy, allowChain) {
    var radius = S.radius();
    var res = S.world.dig(gx, gy, radius, S.luckMult());
    var gain = Math.round(res.emc * S.pickMult());

    S.data.emc += gain;
    S.data.totalEmc += gain;
    if (gain > S.data.maxEmcPerDig) S.data.maxEmcPerDig = gain;
    M.runStats.emc += gain;
    M.runStats.digs += 1;

    R.paintTiles(S.world, res.idx);

    var sx = gx * G.TILE, sy = gy * G.TILE;
    if (res.ores > 0) {
      R.burst(sx, sy, Math.min(14, 4 + res.ores), ['#FFD97A', '#FFFFFF', '#9FE8FF']);
      R.ring(sx, sy, radius * G.TILE * 0.6, radius * G.TILE * 1.15, 'rgba(255,230,150,0.85)');
      if (gain > 0) R.floatText(sx, sy - 8, gain, '#FFE9A8', 16);
    } else {
      R.burst(sx, sy, 4, ['#8A8A8A', '#B0B0B0']);
      R.ring(sx, sy, radius * G.TILE * 0.5, radius * G.TILE * 0.95, 'rgba(220,220,220,0.30)');
    }
    // 每颗被砸掉的矿各自碎一下（格子立刻变回石头，靠这层回执让玩家看见）
    oreBreaks(res.oreAt);
    A.play('dig');
    M.pickSwingAt = M.now;
    if (res.ores > 0) {
      A.play('ore', { tier: Math.min(1, Math.log10(Math.max(1, gain)) / 5) });
    }

    // 连锁从「每一颗被挖掉的矿」各自掷一次骰子
    var burst = null;
    if (allowChain && res.oreAt.length) {
      var cp = S.chainP();
      var origins = [];
      for (var i = 0; i < res.oreAt.length; i++) {
        if (Math.random() < cp) origins.push(res.oreAt[i]);
      }
      if (origins.length) burst = fireBullets(origins);
    }
    if (S.world.touched.length) {
      R.paintTiles(S.world, S.world.touched);
      S.world.touched.length = 0;
    }
    flushSpawns();

    // 「这一下挖了什么」：本次判定圆 + 连锁总共打掉多少格、多少矿
    pushHitBox(sx, sy, res.ores + (burst ? burst.ores : 0), res.n + (burst ? burst.cells : 0));
    S.markDirty(M.now);
    return gain;
  }

  // 新长出来的矿：补画之后给它们一点"冒出来"的回执（一次炸太多就抽着画，别糊满屏）
  function flushSpawns() {
    var list = S.world.spawned, n = list.length;
    var step = Math.max(1, Math.ceil(n / 16));
    for (var i = 0; i < n; i += step) {
      var sp = list[i];
      R.oreSpawn(sp.x * G.TILE, sp.y * G.TILE, sp.id);
    }
    S.world.spawned.length = 0;
  }

  // 「这一下挖了什么」：跟手的小结框，1.2 秒淡出，连点时往上叠，最多留 3 个
  var HITBOX_LIFE = 1200;
  function pushHitBox(sx, sy, ores, cells) {
    if (M.hitBoxes.length >= 3) M.hitBoxes.shift();
    var lift = 0;
    for (var i = 0; i < M.hitBoxes.length; i++) lift += 24;
    M.hitBoxes.push({ x: sx, y: sy, ore: ores, cells: cells, t: M.now, lift: lift });
  }

  // 一次连锁能砸掉上百颗矿，碎裂回执同样抽样，避免满屏圆圈
  function oreBreaks(list) {
    var step = Math.max(1, Math.ceil(list.length / 24));
    for (var i = 0; i < list.length; i += step) {
      R.oreBreak(list[i].x * G.TILE, list[i].y * G.TILE, list[i].id);
    }
  }

  // 连锁：起点各打一轮子弹，被打到的矿继续按概率接着打（递归，有预算封顶）
  function fireBullets(origins) {
    var burst = S.world.chainBurst(origins, {
      dirs: G.chainDirSet(S.chainDirs()),
      range: S.chainR(),
      p: S.chainP(),
      maxDepth: G.CHAIN_DEPTH,
      budget: G.CHAIN_BUDGET,
      firstBudget: G.CHAIN_FIRST,
    });
    if (!burst.cells) return null;

    R.paintTiles(S.world, burst.idx);
    if (S.world.touched.length) {
      R.paintTiles(S.world, S.world.touched);
      S.world.touched.length = 0;
    }
    flushSpawns();
    oreBreaks(burst.oreAt);

    // 弹道太多就只画前 24 根；每根都是一小截尾巴，不再拉满整条线
    var draw = Math.min(burst.shots.length, 24);
    for (var i = 0; i < draw; i++) {
      var s = burst.shots[i];
      var ox = s.x * G.TILE, oy = s.y * G.TILE;
      R.tracer(ox, oy, s.dx * s.range * G.TILE, s.dy * s.range * G.TILE, '#FFE9A8');
      if (i % 2 === 0) {
        R.burst(ox + s.dx * s.range * G.TILE * 0.5, oy + s.dy * s.range * G.TILE * 0.5, 1,
          ['#FFD97A', '#FFF3C4']);
      }
    }

    var gain = Math.round(burst.emc * S.luckMult()) * S.pickMult();
    S.data.emc += gain;
    S.data.totalEmc += gain;
    if (gain > S.data.maxEmcPerDig) S.data.maxEmcPerDig = gain;
    M.runStats.emc += gain;
    M.runStats.chain += 1;
    var f = burst.shots[0];
    if (gain > 0) R.floatText(f.x * G.TILE, f.y * G.TILE + 18, gain, '#FFF1C0', 14);
    A.play('chain');
    return { gain: gain, cells: burst.cells, ores: burst.ores };
  }

  function inField(p) {
    return p.y > UI.WORLD_Y - 10 && p.y < UI.WORLD_Y + G.WORLD_H * G.TILE + 10;
  }

  function tryDig(p) {
    var w = worldPos(p);
    if (!insideWorld(w.x, w.y)) return false;
    digAt(w.x, w.y, true);
    M.digsLeft -= 1;
    if (M.digsLeft <= 0) {
      M.digsLeft = 0;
      M.screen = 'ending';
      M.endingAt = M.now + 420;
    }
    return true;
  }

  // ---------- 输入 ----------
  function onDown(x, y) {
    var p = toDesign(x, y);
    M.pointer.x = p.x; M.pointer.y = p.y;
    M.pointer.hover = true;
    M.pointer.down = true;
    A.init();   // 浏览器要求用户手势后才允许出声，就借这一次点击

    if (M.screen === 'play') {
      if (inField(p)) tryDig(p);
      return;
    }
    if (M.screen === 'ending') return;

    var hit = UI.pickHit(p.x, p.y);
    if (hit) handleHit(hit.id);
  }

  function onMove(x, y) {
    var p = toDesign(x, y);
    M.pointer.x = p.x; M.pointer.y = p.y;
    M.pointer.hover = true;
  }

  function onUp() { M.pointer.down = false; }

  function handleHit(id) {
    if (id === 'reset') {
      if (M.resetArmed && M.now < M.resetArmed) {
        S.reset();
        S.world.gen(0, S.data.tracks.rarity);
        R.buildAtlas(0); R.bakeAll(S.world);
        M.screen = 'shop';
        M.resetArmed = 0;
        M.lastRun = null;
        toast('存档已重置');
      } else {
        M.resetArmed = M.now + 2500;
        toast('再点一次「重置」确认清档', 2200);
      }
      return;
    }
    if (M.screen === 'shop') {
      if (id.indexOf('buy:') === 0) {
        var key = id.slice(4);
        if (S.buy(key)) {
          A.play('buy');
          toast(S.trackMap[key].name + ' → Lv.' + S.data.tracks[key], 700);
          M.hold = { key: key, next: M.now + 380, speed: 140 };
        } else {
          A.play('fail');
        }
        return;
      }
      if (id === 'pick') {
        if (S.buyPick()) {
          A.play('pick');
          if (S.data.pick >= G.PICKS.length - 1) toast('下界合金镐到手 · 把卡片点满就通关', 1800);
          else toast('获得 ' + G.PICKS[S.data.pick].name);
        } else {
          A.play('fail');
        }
        return;
      }
      if (id === 'again') { M.startRun(S.data.level); return; }
      if (id === 'next') {
        if (S.levelUnlocked(S.data.level + 1)) M.startRun(S.data.level + 1);
        return;
      }
      if (id === 'finish') {
        if (S.canFinish()) startFinale();
        else toast('还差 ' + S.trackLevelsLeft() + ' 级升级', 1400);
        return;
      }
      if (id === 'mute') {
        S.data.muted = A.toggleMute();
        S.markDirty(M.now);
        toast(S.data.muted ? '已静音' : '音效已开启', 900);
        return;
      }
    }
    if (M.screen === 'win') {
      if (id === 'restart') { M.startRun(0); return; }
      if (id === 'toshop') { M.screen = 'shop'; return; }
    }
  }

  // ---------- 循环 ----------
  function update(dt) {
    R.updateFx(dt);
    if (M.screen === 'ending' && M.now >= M.endingAt) M.endRun();

    // 长按升级卡：按住不放就连续升级，越按越快；松手或离开采购页即停
    if (M.hold) {
      if (!M.pointer.down || M.screen !== 'shop') {
        M.hold = null;
      } else if (M.now >= M.hold.next) {
        if (S.buy(M.hold.key)) {
          M.hold.speed = Math.max(45, M.hold.speed - 12);
          M.hold.next = M.now + M.hold.speed;
          toast(S.trackMap[M.hold.key].name + ' → Lv.' + S.data.tracks[M.hold.key], 600);
        } else {
          M.hold = null;
          A.play('fail');
        }
      }
    }

    if (M.finale) {
      while (M.finale.waves < 16 && M.now >= M.finale.next) {
        var wv = M.finale.waves++;
        for (var i = 0; i < 3; i++) {
          var bx = Math.random() * G.WORLD_W * G.TILE;
          var by = Math.random() * G.WORLD_H * G.TILE;
          R.burst(bx, by, 10, ['#FFE9A8', '#FFD97A', '#FFFFFF']);
          R.ring(bx, by, 8, 80 + wv * 14, 'rgba(255,220,150,0.75)');
        }
        M.finale.next = M.now + 85;
      }
      if (M.now > M.finale.t + 1600) {
        M.finale = null;
        M.screen = 'win';
      }
    }

    // 镐子只在矿区出没：桌面端悬停即出（当光标用），触摸端按下时出（手指抬起就收）
    M.pointer.show = (M.screen === 'play') && (G.env.isWX ? M.pointer.down : M.pointer.hover)
      && cursorInField(M.pointer);
    if (M.screen === 'play') S.world.regen(dt);
    S.tickSave(M.now);
  }

  function draw() {
    var ctx = R.ctx, v = G.view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0D1017';
    ctx.fillRect(0, 0, v.cw, v.ch);
    ctx.setTransform(v.scale, 0, 0, v.scale, v.ox, v.oy);

    UI.begin();
    if (M.screen === 'shop') {
      UI.drawShop(ctx, M.lastRun);
    } else if (M.screen === 'play' || M.screen === 'ending') {
      drawPlay(ctx);
      UI.drawPlayHUD(ctx, M.digsLeft, S.foodMax());
    } else if (M.screen === 'win') {
      UI.drawWin(ctx);
    }

    if (M.toastMsg && M.now < M.toastMsg.until) {
      R.panel(ctx, G.DESIGN_W / 2 - 150, TOP_TOAST_Y, 300, 40, 20, 'rgba(20,24,32,0.92)', '#5E7BB0', 2);
      R.text(ctx, M.toastMsg.s, G.DESIGN_W / 2, TOP_TOAST_Y + 21, 15, '#E8EDF5', 'center');
    }
    if (M.resetArmed && M.now < M.resetArmed) {
      R.text(ctx, '再次点击「重置」将清空存档', G.DESIGN_W - 40, 74, 12, '#E2534B', 'right');
    }
    syncCursor();
  }

  function drawPlay(ctx) {
    var lv = G.LEVELS[S.data.level];
    ctx.fillStyle = lv.sky;
    ctx.fillRect(0, 0, G.DESIGN_W, G.DESIGN_H);

    var w = G.WORLD_W * G.TILE, h = G.WORLD_H * G.TILE;
    ctx.fillStyle = '#0B0E14';
    ctx.fillRect(UI.WORLD_X - 3, UI.WORLD_Y - 3, w + 6, h + 6);
    ctx.drawImage(R.bake, UI.WORLD_X, UI.WORLD_Y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(UI.WORLD_X - 2, UI.WORLD_Y - 2, w + 4, h + 4);

    ctx.fillStyle = lv.fog;
    ctx.fillRect(UI.WORLD_X, UI.WORLD_Y, w, h);

    R.twinkle(ctx, S.world, M.now, UI.WORLD_X, UI.WORLD_Y);   // 稀有矿微光（画在雾之上）

    if (M.finale) {
      var fk = Math.min(1, (M.now - M.finale.t) / 1600);
      ctx.fillStyle = 'rgba(255,232,166,' + (0.32 * (1 - fk)) + ')';
      ctx.fillRect(UI.WORLD_X, UI.WORLD_Y, w, h);
    }

    ctx.save();
    ctx.translate(UI.WORLD_X, UI.WORLD_Y);
    var i;
    for (i = 0; i < R.rings.length; i++) {
      var r = R.rings[i], k = r.t / r.dur;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * k, 0, Math.PI * 2);
      ctx.strokeStyle = r.c;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (i = 0; i < R.spawns.length; i++) {
      var sp = R.spawns[i], sk = sp.t / sp.dur;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, G.TILE * (0.32 + 0.52 * sk), 0, Math.PI * 2);
      ctx.strokeStyle = sp.c;
      ctx.globalAlpha = 0.30 * (1 - sk);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (i = 0; i < R.breaks.length; i++) {
      var bk = R.breaks[i], bkk = bk.t / bk.dur;
      var bs = G.TILE * (0.85 - 0.45 * bkk);
      ctx.globalAlpha = 0.42 * (1 - bkk);
      ctx.fillStyle = bk.c;
      ctx.fillRect(bk.x - bs / 2, bk.y - bs / 2, bs, bs);
      ctx.globalAlpha = 1;
    }
    for (i = 0; i < R.tracers.length; i++) {
      var tr = R.tracers[i], tk = tr.t / tr.dur;
      var tl = Math.sqrt(tr.dx * tr.dx + tr.dy * tr.dy) || 1;
      var ux = tr.dx / tl, uy = tr.dy / tl;
      var head = tl * Math.min(1, tk * 1.35);
      var tail = Math.max(0, head - Math.min(96, tl * 0.55));
      var ta = 0.55 * (1 - tk);
      ctx.strokeStyle = tr.c;
      ctx.globalAlpha = ta;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tr.x + ux * tail, tr.y + uy * tail);
      ctx.lineTo(tr.x + ux * head, tr.y + uy * head);
      ctx.stroke();
      ctx.globalAlpha = Math.min(1, ta * 1.8);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(tr.x + ux * head - 1.5, tr.y + uy * head - 1.5, 3, 3);
      ctx.globalAlpha = 1;
    }
    for (i = 0; i < R.parts.length; i++) {
      var p = R.parts[i];
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
      ctx.globalAlpha = 1;
    }
    for (i = 0; i < R.texts.length; i++) {
      var t = R.texts[i];
      ctx.globalAlpha = 1 - t.t / t.dur;
      R.text(ctx, t.s, t.x, t.y, t.sz, t.c, 'center');
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // 点击小结框（画在世界层之上，用设计坐标，边缘也不裁）
    var keep = [];
    for (i = 0; i < M.hitBoxes.length; i++) {
      var hb = M.hitBoxes[i];
      var hk = (M.now - hb.t) / HITBOX_LIFE;
      if (hk < 0) { keep.push(hb); continue; }
      if (hk >= 1) continue;
      keep.push(hb);
      var ha = hk < 0.7 ? 1 : 1 - (hk - 0.7) / 0.3;
      var htxt = '本次 ' + hb.ore + ' 矿 · ' + hb.cells + ' 格';
      ctx.globalAlpha = ha;
      ctx.font = 'bold 14px "PingFang SC","Microsoft YaHei",sans-serif';
      var hw = ctx.measureText(htxt).width;
      var hbx = UI.WORLD_X + hb.x + 26;
      var hby = UI.WORLD_Y + hb.y - 84 - hb.lift;
      if (hbx + hw + 22 > G.DESIGN_W - 8) hbx = UI.WORLD_X + hb.x - hw - 52;
      ctx.fillStyle = 'rgba(8,11,16,0.94)';
      ctx.fillRect(hbx, hby, hw + 22, 28);
      ctx.strokeStyle = hb.ore > 0 ? 'rgba(255,233,168,0.85)' : 'rgba(170,180,195,0.45)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(hbx + 0.75, hby + 0.75, hw + 20.5, 26.5);
      R.text(ctx, htxt, hbx + 11, hby + 15, 14, hb.ore > 0 ? '#FFF3C4' : '#C3CBD8', 'left');
      ctx.globalAlpha = 1;
    }
    M.hitBoxes = keep;

    if (M.pointer.show) {
      var wp = worldPos(M.pointer);
      if (insideWorld(wp.x, wp.y)) {
        var swing = 0;
        if (M.pickSwingAt) {
          var sk = (M.now - M.pickSwingAt) / 110;
          if (sk >= 0 && sk < 1) swing = Math.sin(Math.PI * sk);
        }
        UI.drawPickCursor(ctx, wp.x, wp.y, S.radius(), Math.sin(M.now / 140) * 0.5 + 0.5, swing);
      }
    }
  }

  // ---------- 启动 ----------
  M.boot = function () {
    var canvas = G.env.isWX ? wx.createCanvas() : document.getElementById('cv');
    M.canvas = canvas;
    fit();
    R.init(canvas);
    // 贴图异步到货后重建图集，让矿区换成原版纹理（没到就继续用程序化贴图）
    if (G.ASSETS) {
      G.ASSETS.onReady = function () {
        R.buildAtlas(S.data.level);
        if (S.world && S.world.grid) R.bakeAll(S.world);
      };
      G.ASSETS.load();
    }
    A.setMuted(!!S.data.muted);   // 先按存档静音，等第一次点击再真正建音频上下文

    if (!G.env.isWX) {
      window.addEventListener('resize', fit);
      canvas.addEventListener('mousedown', function (e) { onDown(e.clientX, e.clientY); });
      canvas.addEventListener('mousemove', function (e) { onMove(e.clientX, e.clientY); });
      canvas.addEventListener('mouseleave', function () {
        M.pointer.hover = false; M.pointer.down = false; M.pointer.show = false;
      });
      window.addEventListener('mouseup', onUp);
      canvas.addEventListener('touchstart', function (e) {
        e.preventDefault();
        var t = e.changedTouches[0]; onDown(t.clientX, t.clientY);
      }, { passive: false });
      canvas.addEventListener('touchmove', function (e) {
        e.preventDefault();
        var t = e.changedTouches[0]; onMove(t.clientX, t.clientY);
      }, { passive: false });
      canvas.addEventListener('touchend', function (e) { e.preventDefault(); onUp(); }, { passive: false });
      window.addEventListener('blur', function () { S.saveNow(); });
    } else {
      wx.onTouchStart(function (e) {
        var t = e.changedTouches[0]; onDown(t.clientX, t.clientY);
      });
      wx.onTouchMove(function (e) {
        var t = e.changedTouches[0]; onMove(t.clientX, t.clientY);
      });
      wx.onTouchEnd(function () { onUp(); });
      wx.onHide(function () { S.saveNow(); });
      wx.onShow(function () { fit(); });
      wx.onWindowResize(function () { fit(); });
    }

    S.load();
    S.regenWorld();
    M.screen = 'shop';

    var last = 0;
    function frame(ts) {
      M.now = ts;
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
      last = ts;
      update(dt);
      draw();
      if (G.env.isWX) requestAnimationFrame(frame);
      else window.requestAnimationFrame(frame);
    }
    if (G.env.isWX) requestAnimationFrame(frame);
    else window.requestAnimationFrame(frame);
  };

  M.toDesign = toDesign;
  M.draw = draw;      // 暴露给测试页：手动重画一帧，让 UI.hits 与画面同步
  M.update = update;  // 暴露给测试页：手动推进一帧逻辑
})();
