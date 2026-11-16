// UI 层：顶栏、关卡页、按钮命中区、通关页
(function () {
  var root = (typeof GameGlobal !== 'undefined') ? GameGlobal
    : (typeof window !== 'undefined' ? window : globalThis);
  var G = root.G = root.G || {};
  var R = G.R;

  var UI = G.UI = {};
  UI.hits = [];

  var M = 40;                 // 左右边距
  var TOPBAR = 76;
  UI.WORLD_X = (G.DESIGN_W - G.WORLD_W * G.TILE) / 2;   // 167
  UI.WORLD_Y = 92;

  var C_BG = '#171B24';
  var C_PANEL = '#262C39';
  var C_PANEL2 = '#2F3646';
  var C_LINE = '#414B60';
  var C_TXT = '#E8EDF5';
  var C_DIM = '#93A0B5';
  var C_GOLD = '#F5C84B';
  var C_GREEN = '#5AD07A';
  var C_RED = '#E2534B';

  UI.C = { bg: C_BG, panel: C_PANEL, line: C_LINE, txt: C_TXT, dim: C_DIM, gold: C_GOLD, green: C_GREEN, red: C_RED };

  UI.begin = function () { UI.hits.length = 0; };

  UI.hit = function (id, x, y, w, h, enabled, data) {
    UI.hits.push({ id: id, x: x, y: y, w: w, h: h, on: enabled !== false, d: data });
  };

  UI.pickHit = function (px, py) {
    for (var i = UI.hits.length - 1; i >= 0; i--) {
      var h = UI.hits[i];
      if (!h.on) continue;
      if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) return h;
    }
    return null;
  };

  function btn(ctx, x, y, w, h, label, opt) {
    opt = opt || {};
    var on = opt.on !== false;
    var fill = on ? (opt.primary ? C_GOLD : C_PANEL2) : '#242A35';
    var txt = on ? (opt.primary ? '#2A1F00' : C_TXT) : '#5E6A7E';
    R.panel(ctx, x, y, w, h, 8, fill, on ? (opt.primary ? '#FFE08A' : C_LINE) : '#2E3644', 2);
    R.text(ctx, label, x + w / 2, y + h / 2 + 1, opt.size || 17, txt, 'center');
  }
  UI.btn = btn;

  // ---------- 顶栏 ----------
  UI.drawTop = function (ctx) {
    var S = G.S.data;
    var lv = G.LEVELS[S.level];
    ctx.fillStyle = C_BG;
    ctx.fillRect(0, 0, G.DESIGN_W, TOPBAR);
    ctx.fillStyle = C_LINE;
    ctx.fillRect(0, TOPBAR - 1, G.DESIGN_W, 1);

    R.text(ctx, lv.name, M, 27, 24, C_TXT);
    R.text(ctx, lv.sub, M + 4, 55, 13, C_DIM);

    // 关卡进度点
    var dotX = M + 120, dotY = 56;
    for (var i = 0; i < G.LEVELS.length; i++) {
      var cx = dotX + i * 26;
      var unlocked = i <= S.pick;
      ctx.beginPath();
      ctx.arc(cx, dotY, i === S.level ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = i === S.level ? C_GOLD : (unlocked ? '#6E86AE' : '#39414F');
      ctx.fill();
      if (i === S.level) {
        ctx.strokeStyle = '#FFE9A8'; ctx.lineWidth = 2; ctx.stroke();
      }
    }

    // 货币
    var resetX = G.DESIGN_W - M - 76;
    var muteW = 44, muteX = resetX - 12 - muteW;
    var cw = 250, cx0 = muteX - 16 - cw;
    R.panel(ctx, cx0, 18, cw, 42, 8, '#1F2531', C_LINE, 2);
    ctx.beginPath();
    ctx.arc(cx0 + 24, 39, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#4AEDD9'; ctx.fill();
    ctx.beginPath();
    ctx.arc(cx0 + 24, 39, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#1B6E66'; ctx.fill();
    R.text(ctx, R.fmt(S.emc) + ' EMC', cx0 + 44, 40, 22, C_TXT);

    // 静音开关
    R.panel(ctx, muteX, 19, muteW, 40, 8, '#1F2531', C_LINE, 2);
    drawSpeaker(ctx, muteX, 19, muteW, 40, !!S.muted);
    UI.hit('mute', muteX, 19, muteW, 40);

    btn(ctx, resetX, 18, 76, 42, '重置', { size: 15 });
    UI.hit('reset', resetX, 18, 76, 42);
  };

  // 喇叭图标：一个方块 + 一个三角 + 两道弧；静音时划一道斜杠
  function drawSpeaker(ctx, x, y, w, h, muted) {
    var cx = x + w * 0.34, cy = y + h / 2;
    var col = muted ? '#6E7A8E' : C_TXT;
    ctx.fillStyle = col;
    ctx.fillRect(cx - 9, cy - 5, 5, 10);
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 5);
    ctx.lineTo(cx + 4, cy - 11);
    ctx.lineTo(cx + 4, cy + 11);
    ctx.lineTo(cx - 4, cy + 5);
    ctx.closePath();
    ctx.fill();

    if (!muted) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx + 4, cy, 7, -0.9, 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + 4, cy, 12, -0.9, 0.9);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#8C5A5A';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx + 9, cy - 9);
      ctx.lineTo(cx + 20, cy + 9);
      ctx.stroke();
    }
  }

  // ---------- 游戏页 HUD ----------
  UI.drawPlayHUD = function (ctx, digsLeft, digMax) {
    var S = G.S.data;
    UI.drawTop(ctx);

    var y = G.DESIGN_H - 46;
    ctx.fillStyle = '#101420';
    ctx.fillRect(0, y, G.DESIGN_W, 46);

    var pct = digMax > 0 ? Math.max(0, digsLeft / digMax) : 0;
    var bw = 420;
    R.panel(ctx, M, y + 12, bw, 22, 6, '#1E2431', '#333C4C', 1);
    var fillW = Math.max(0, (bw - 4) * pct);
    if (fillW > 1) R.panel(ctx, M + 2, y + 14, fillW, 18, 4, pct > 0.3 ? '#3E7BD6' : '#D6743E', null, 0);
    R.text(ctx, '剩余挖掘 ' + digsLeft + ' / ' + digMax, M, y + 23, 15, C_TXT);

    R.text(ctx, '半径 ' + G.S.radius().toFixed(1) + ' 格', G.DESIGN_W - M, y + 23, 15, C_DIM, 'right');
  };

  // ---------- 关卡页 ----------
  var CARD_ORDER = ['eff', 'luck', 'dens', 'food', 'cprob', 'crange', 'rarity'];

  UI.drawShop = function (ctx, lastRun) {
    var S = G.S.data;
    ctx.fillStyle = C_BG;
    ctx.fillRect(0, 0, G.DESIGN_W, G.DESIGN_H);
    UI.drawTop(ctx);

    var cols = 4, gap = 12;
    var cw = (G.DESIGN_W - M * 2 - gap * (cols - 1)) / cols;
    var ch = 156, y0 = 88;

    for (var i = 0; i < CARD_ORDER.length; i++) {
      var col = i % cols, row = (i / cols) | 0;
      drawTrackCard(ctx, CARD_ORDER[i], M + col * (cw + gap), y0 + row * (ch + gap), cw, ch);
    }
    // 第 8 格 = 镐子
    drawPickCard(ctx, M + 3 * (cw + gap), y0 + ch + gap, cw, ch);

    var py = y0 + ch * 2 + gap + 16;
    var ph = G.DESIGN_H - py - 20;
    R.panel(ctx, M, py, G.DESIGN_W - M * 2, ph, 12, C_PANEL, C_LINE, 2);

    var lv = G.LEVELS[S.level];
    R.text(ctx, lv.name, M + 24, py + 34, 26, C_TXT);
    R.text(ctx, lv.sub, M + 24, py + 66, 14, C_DIM);

    var info = lastRun
      ? '上一局：挖掘 ' + lastRun.digs + ' 次 · 收入 ' + R.fmt(lastRun.emc) + ' EMC' + (lastRun.chain ? ' · 连锁 ' + lastRun.chain + ' 次' : '')
      : '准备开始本层挖掘';
    R.text(ctx, info, M + 24, py + 98, 14, lastRun ? C_GOLD : C_DIM);
    R.text(ctx, '累计 ' + R.fmt(S.totalEmc) + ' EMC · 第 ' + (S.runs + 1) + ' 局 · 单次最高 ' + R.fmt(S.maxEmcPerDig),
      M + 24, py + 126, 13, '#6B7A90');

    var bw = 220, bh = 62, by = py + ph - bh - 22;
    var bx2 = G.DESIGN_W - M - 24 - bw;
    var bx1 = bx2 - bw - 16;
    var isLast = S.level >= G.LEVELS.length - 1;
    var canNext = !isLast && G.S.levelUnlocked(S.level + 1);
    var left = G.S.trackLevelsLeft();

    btn(ctx, bx1, by, bw, bh, '继续本层', { primary: true, size: 20 });
    UI.hit('again', bx1, by, bw, bh);

    if (isLast) {
      // 下界：把 7 条升级线全点满才通关
      btn(ctx, bx2, by, bw, bh, left === 0 ? '完成 · 通关' : '还差 ' + left + ' 级',
        { on: left === 0, primary: left === 0, size: left === 0 ? 20 : 18 });
      if (left === 0) UI.hit('finish', bx2, by, bw, bh);
      else R.text(ctx, '把 7 张卡全部点满即可通关', bx2 + bw / 2, by + bh + 16, 12, '#6B7A90', 'center');
    } else {
      btn(ctx, bx2, by, bw, bh, canNext ? '进入 ' + G.LEVELS[S.level + 1].name : '下一层未解锁',
        { on: canNext, size: 18 });
      if (canNext) UI.hit('next', bx2, by, bw, bh);
      else {
        var need = G.PICKS[S.level + 1] ? G.PICKS[S.level + 1].name : '';
        R.text(ctx, '升级到 ' + need + ' 解锁', bx2 + bw / 2, by + bh + 16, 12, '#6B7A90', 'center');
      }
    }
  };

  function drawTrackCard(ctx, key, x, y, w, h) {
    var S = G.S.data;
    var t = G.S.trackMap[key];
    var L = S.tracks[key];
    var maxed = L >= t.max;
    var unlocked = S.pick >= t.unlock;
    var cost = maxed ? 0 : G.S.trackCost(key);
    var afford = unlocked && !maxed && S.emc >= cost;

    var border = !unlocked ? '#333B4A' : (maxed ? '#5C6B4A' : C_LINE);
    R.panel(ctx, x, y, w, h, 10, unlocked ? C_PANEL : '#20252F', border, 2);

    if (!unlocked) {
      R.text(ctx, '未解锁', x + w / 2, y + h / 2 - 14, 17, '#5E6A7E', 'center');
      R.text(ctx, '抵达 ' + G.LEVELS[t.unlock].name + ' 后开放', x + w / 2, y + h / 2 + 12, 12, '#4C5666', 'center');
      return;
    }

    R.text(ctx, t.name, x + 14, y + 26, 17, maxed ? C_GREEN : C_TXT);
    R.text(ctx, L + '/' + t.max, x + w - 14, y + 26, 15, maxed ? C_GREEN : C_GOLD, 'right');
    R.text(ctx, t.desc, x + 14, y + 50, 12, C_DIM);

    var bx = x + 14, by = y + 66, bw = w - 28, bh = 6;
    R.panel(ctx, bx, by, bw, bh, 3, '#1B202B', null, 0);
    if (L > 0) R.panel(ctx, bx, by, Math.max(2, bw * (L / t.max)), bh, 3, maxed ? C_GREEN : '#4C7FD4', null, 0);

    R.text(ctx, previewText(key, L, maxed), x + 14, y + 86, 12, '#7F8DA3');

    var bh2 = 36, by2 = y + h - bh2 - 12;
    if (maxed) {
      R.panel(ctx, x + 12, by2, w - 24, bh2, 7, '#1F2A22', '#3C5A44', 1);
      R.text(ctx, '已满级', x + w / 2, by2 + bh2 / 2, 15, C_GREEN, 'center');
      return;
    }
    R.panel(ctx, x + 12, by2, w - 24, bh2, 7, afford ? '#3A4560' : '#232936', afford ? '#5E7BB0' : '#2E3644', 2);
    R.text(ctx, '升级  ' + R.fmt(cost), x + w / 2, by2 + bh2 / 2, 15, afford ? C_TXT : '#5E6A7E', 'center');
    UI.hit('buy:' + key, x + 12, by2, w - 24, bh2, afford);
  }

  function previewText(key, L, maxed) {
    var S = G.S.data;
    var now = '', nxt = '';
    if (key === 'eff') { now = '半径 ' + G.fx.radius(L).toFixed(1); if (!maxed) nxt = '→ ' + G.fx.radius(L + 1).toFixed(1); }
    else if (key === 'luck') { now = '×' + G.R.fmt(G.fx.luckMult(L)); if (!maxed) nxt = '→ ×' + G.R.fmt(G.fx.luckMult(L + 1)); }
    else if (key === 'food') { now = G.fx.food(L) + ' 次/局'; if (!maxed) nxt = '→ ' + G.fx.food(L + 1); }
    else if (key === 'cprob') { now = Math.round(G.fx.chainP(L) * 100) + '%'; if (!maxed) nxt = '→ ' + Math.round(G.fx.chainP(L + 1) * 100) + '%'; }
    else if (key === 'crange') { now = G.fx.chainR(L).toFixed(0) + ' 格'; if (!maxed) nxt = '→ ' + G.fx.chainR(L + 1).toFixed(0); }
    else if (key === 'dens') {
      var base = G.LEVELS[S.level].density;
      now = '+' + Math.round((G.fx.density(base, L) / base - 1) * 100) + '%';
    } else if (key === 'rarity') { now = '稀有 ×' + G.fx.rareW(L).toFixed(1); if (!maxed) nxt = '→ ×' + G.fx.rareW(L + 1).toFixed(1); }
    return now + ' ' + nxt;
  }

  var PICK_COLORS = ['#A0793F', '#8C8C8C', '#C8743E', '#D8AF93', '#4AEDD9', '#8CE6D8'];

  function drawPickCard(ctx, x, y, w, h) {
    var S = G.S.data;
    var cur = G.PICKS[S.pick];
    var nxt = G.PICKS[S.pick + 1];
    R.panel(ctx, x, y, w, h, 10, C_PANEL, '#6B5A32', 2);

    R.text(ctx, '镐子', x + 14, y + 26, 17, C_GOLD);
    R.text(ctx, cur.name, x + 60, y + 26, 17, C_TXT);
    R.text(ctx, '×' + cur.mult.toFixed(1), x + w - 14, y + 26, 14, C_DIM, 'right');
    R.text(ctx, '每把镐解锁下一层', x + 14, y + 50, 12, C_DIM);

    drawPickIcon(ctx, x + 14, y + 66, 34);

    var bh2 = 36, by2 = y + h - bh2 - 12;
    if (!nxt) {
      R.panel(ctx, x + 12, by2, w - 24, bh2, 7, '#2A2418', '#6B5A32', 1);
      R.text(ctx, '已是最强镐', x + w / 2, by2 + bh2 / 2, 15, C_GOLD, 'center');
      return;
    }
    var afford = S.emc >= nxt.cost;
    R.panel(ctx, x + 12, by2, w - 24, bh2, 7, afford ? '#4A3C1C' : '#232936', afford ? '#B79440' : '#2E3644', 2);
    R.text(ctx, nxt.name + '  ' + R.fmt(nxt.cost), x + w / 2, by2 + bh2 / 2, 14, afford ? '#FFE9A8' : '#5E6A7E', 'center');
    UI.hit('pick', x + 12, by2, w - 24, bh2, afford);
  }

  function drawPickIcon(ctx, x, y, s) {
    var tex = G.ASSETS && G.ASSETS.pick(G.S.data.pick);
    if (tex) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(x + s, y);        // 镜像翻转：柄朝右下
      ctx.scale(-1, 1);
      ctx.drawImage(tex, 0, 0, s, s);
      ctx.restore();
      return;
    }
    var c = PICK_COLORS[G.S.data.pick] || PICK_COLORS[0];
    ctx.save();
    ctx.translate(x + s / 2, y + s / 2);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#7A5A32';
    ctx.fillRect(-3, -2, 6, s * 0.8);
    ctx.fillStyle = c;
    ctx.fillRect(-s / 2, -s / 2, s, 6);
    ctx.restore();
  }

  // ---------- 游戏页光标 ----------
  // swing: 0 = 静止，1 = 落镐砸到最低点
  UI.drawPickCursor = function (ctx, wx, wy, radius, pulse, swing) {
    var sx = UI.WORLD_X + wx * G.TILE;
    var sy = UI.WORLD_Y + wy * G.TILE;
    var sr = radius * G.TILE;

    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 + pulse * 0.25) + ')';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    swing = swing || 0;
    ctx.save();
    ctx.translate(sx + G.PICK_OFFSET.x, sy + 6 * swing + G.PICK_OFFSET.y);   // 落镐：往下砸 6px
    ctx.rotate(-0.35 * swing);           // 顺手拧一下，约 -20°
    ctx.scale(-1, 1);                    // 镜像翻转：柄朝右下，镐头仍在判定点

    var tex = G.ASSETS && G.ASSETS.pick(G.S.data.pick);
    if (tex) {
      var k = G.PICK_CURSOR_PX / G.PICK_TEX_PX;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tex, -G.PICK_HEAD.x * k, -G.PICK_HEAD.y * k, G.PICK_CURSOR_PX, G.PICK_CURSOR_PX);
    } else {
      // 贴图还没加载完：先用程序化镐顶着，形状对得上就行
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-3, -1, 6, 30);
      ctx.fillStyle = '#C08A46';
      ctx.fillRect(-3, -1, 6, 28);
      ctx.fillStyle = '#9AA3AF';
      ctx.fillRect(-13, -6, 26, 7);
    }
    ctx.restore();
  };

  // ---------- 通关页 ----------
  UI.drawWin = function (ctx) {
    var S = G.S.data;
    ctx.fillStyle = 'rgba(10,12,18,0.94)';
    ctx.fillRect(0, 0, G.DESIGN_W, G.DESIGN_H);
    R.text(ctx, '全部矿层清空', G.DESIGN_W / 2, 178, 46, C_GOLD, 'center');
    R.text(ctx, '你从地表一路挖到了下界', G.DESIGN_W / 2, 236, 18, C_DIM, 'center');

    var stats = [
      ['总 EMC', R.fmt(S.totalEmc)],
      ['挖掘局数', S.runs + ' 局'],
      ['单次最高', R.fmt(S.maxEmcPerDig)],
    ];
    for (var i = 0; i < stats.length; i++) {
      var x = G.DESIGN_W / 2 - 330 + i * 220;
      R.panel(ctx, x, 300, 200, 96, 10, C_PANEL, C_LINE, 2);
      R.text(ctx, stats[i][1], x + 100, 336, 26, C_TXT, 'center');
      R.text(ctx, stats[i][0], x + 100, 368, 13, C_DIM, 'center');
    }

    var bw = 240, bh = 64;
    var bx = G.DESIGN_W / 2 - bw - 12, by = 470;
    btn(ctx, bx, by, bw, bh, '再来一局', { primary: true, size: 20 });
    UI.hit('restart', bx, by, bw, bh);
    btn(ctx, bx + bw + 24, by, bw, bh, '回到关卡页', { size: 18 });
    UI.hit('toshop', bx + bw + 24, by, bw, bh);
  };
})();
