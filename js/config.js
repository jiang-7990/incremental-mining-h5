// 配置层：数值、关卡、方块、颜色。所有可调参数集中在这里。
(function () {
  var root = (typeof GameGlobal !== 'undefined') ? GameGlobal
    : (typeof window !== 'undefined' ? window : globalThis);
  var G = root.G = root.G || {};

  G.DESIGN_W = 1334;
  G.DESIGN_H = 750;
  G.WORLD_W = 50;
  G.WORLD_H = 30;
  G.TILE = 20;              // 设计像素/格 → 世界 1000×600（长宽各半，格子大了一倍）
  G.BAKE_SCALE = 2;         // 烘焙倍率，保证高清屏清晰

  // ---------- 方块 ----------
  // id 0..3 = 填充方块；4.. = 矿物（bg 为所在岩层底色）
  var STONE = '#7F7F7F', DEEP = '#4B4B50', NETHER = '#6E2A2A';
  G.BLOCKS = [
    { key: 'dirt',            name: '泥土',       v: 1,     base: '#8B6B4A', dark: '#75583C', ore: false },
    { key: 'stone',           name: '石头',       v: 1,     base: STONE,     dark: '#6A6A6A', ore: false },
    { key: 'deepslate',       name: '深板岩',     v: 1,     base: DEEP,      dark: '#3A3A3E', ore: false },
    { key: 'netherrack',      name: '下界岩',     v: 1,     base: NETHER,    dark: '#5A2020', ore: false },

    { key: 'coal',            name: '煤炭',       v: 5,     base: '#2B2B2B', dark: '#161616', ore: true, bg: STONE },
    { key: 'copper',          name: '铜矿',       v: 10,    base: '#C8743E', dark: '#9E5624', ore: true, bg: STONE },
    { key: 'iron',            name: '铁矿',       v: 25,    base: '#D8AF93', dark: '#B0855F', ore: true, bg: STONE },
    { key: 'gold',            name: '金矿',       v: 20,    base: '#FAD64A', dark: '#C9A21C', ore: true, bg: STONE },
    { key: 'redstone',        name: '红石',       v: 20,    base: '#D42424', dark: '#8E0E0E', ore: true, bg: STONE },
    { key: 'lapis',           name: '青金石',     v: 20,    base: '#2F55D8', dark: '#17318F', ore: true, bg: STONE },
    { key: 'diamond',         name: '钻石',       v: 100,   base: '#5AF0DC', dark: '#23BFAE', ore: true, bg: STONE },
    { key: 'emerald',         name: '绿宝石',     v: 1000,  base: '#22E070', dark: '#0DA84C', ore: true, bg: STONE },

    { key: 'quartz',          name: '下界石英',   v: 40,    base: '#EFE6DA', dark: '#C2B6A4', ore: true, bg: NETHER },
    { key: 'nether_gold',     name: '下界金',     v: 150,   base: '#FFCE55', dark: '#C99A24', ore: true, bg: NETHER },
    { key: 'debris',          name: '远古残骸',   v: 5000,  base: '#7A5540', dark: '#4B3125', ore: true, bg: NETHER },

    { key: 'ds_coal',         name: '深板岩煤炭', v: 5,     base: '#2B2B2B', dark: '#111111', ore: true, bg: DEEP },
    { key: 'ds_copper',       name: '深板岩铜矿', v: 10,    base: '#C8743E', dark: '#8E4A1C', ore: true, bg: DEEP },
    { key: 'ds_iron',         name: '深板岩铁矿', v: 25,    base: '#D8AF93', dark: '#A87C58', ore: true, bg: DEEP },
    { key: 'ds_gold',         name: '深板岩金矿', v: 20,    base: '#FAD64A', dark: '#BC9614', ore: true, bg: DEEP },
    { key: 'ds_redstone',     name: '深板岩红石', v: 20,    base: '#D42424', dark: '#7E0A0A', ore: true, bg: DEEP },
    { key: 'ds_lapis',        name: '深板岩青金', v: 20,    base: '#2F55D8', dark: '#122A80', ore: true, bg: DEEP },
    { key: 'ds_diamond',      name: '深板岩钻石', v: 100,   base: '#5AF0DC', dark: '#1DA898', ore: true, bg: DEEP },
    { key: 'ds_emerald',      name: '深层绿宝石', v: 1000,  base: '#22E070', dark: '#0A9142', ore: true, bg: DEEP },
  ];

  G.ID = {};
  G.BLOCKS.forEach(function (b, i) { G.ID[b.key] = i; });

  // 稀有矿（受「稀有度」升级影响）
  G.RARE = ['diamond', 'emerald', 'ds_diamond', 'ds_emerald', 'debris'];

  // 全局经济缩放：只调这一个数就能整体调快/调慢赚钱速度（当前为 1，值全部按基础值表）
  G.VALUE_SCALE = 4;
  G.BLOCKS.forEach(function (b) { b.v = Math.round(b.v * G.VALUE_SCALE); });

  // ---------- 关卡 ----------
  // topRatio: 上层填充占比；smooth: 边界起伏幅度（0 = 无分界）
  // oreTop / oreBot: 该层矿石权重（上/下岩层各一套；没有对应岩层就留空）
  G.LEVELS = [
    {
      key: 'surface', name: '表层', sub: '泥土与浅矿',
      top: 'dirt', bottom: 'stone', topRatio: 0.20, smooth: 9, density: 0.280,
      oreTop: null,
      oreBot: { coal: 55, copper: 28, iron: 17 },
      fog: 'rgba(120,170,255,0.10)', sky: '#3C5A7A',
    },
    {
      key: 'shallow', name: '浅层', sub: '石头与常见矿',
      top: 'stone', bottom: 'stone', topRatio: 0.00, smooth: 0, density: 0.320,
      oreTop: null,
      oreBot: { coal: 40, copper: 18, iron: 18, gold: 8, redstone: 8, lapis: 8, diamond: 2 },
      fog: 'rgba(90,110,150,0.10)', sky: '#2A3446',
    },
    {
      key: 'middle', name: '中层', sub: '石头过渡到深板岩',
      top: 'stone', bottom: 'deepslate', topRatio: 0.333, smooth: 14, density: 0.360,
      oreTop: { iron: 30, diamond: 20, copper: 12, gold: 8, redstone: 8, lapis: 8, coal: 8 },
      oreBot: { ds_iron: 30, ds_diamond: 20, ds_copper: 12, ds_gold: 8, ds_redstone: 8, ds_lapis: 8, ds_coal: 8 },
      fog: 'rgba(60,60,90,0.14)', sky: '#1E2230',
    },
    {
      key: 'deep', name: '深层', sub: '全深板岩，稀有矿脉',
      top: 'deepslate', bottom: 'deepslate', topRatio: 0.00, smooth: 0, density: 0.400,
      oreTop: null,
      oreBot: { ds_iron: 30, ds_diamond: 20, ds_copper: 12, ds_gold: 8, ds_redstone: 8, ds_lapis: 8, ds_coal: 8, ds_emerald: 2 },
      fog: 'rgba(30,30,60,0.20)', sky: '#12141E',
    },
    {
      key: 'nether', name: '下界', sub: '下界岩与远古残骸',
      top: 'netherrack', bottom: 'netherrack', topRatio: 0.00, smooth: 0, density: 0.400,
      oreTop: null,
      oreBot: { quartz: 50, nether_gold: 30, debris: 3 },
      fog: 'rgba(200,60,40,0.16)', sky: '#2A0E0E',
    },
  ];

  // ---------- 镐子 ----------
  G.PICKS = [
    { name: '木镐',       cost: 0,          mult: 1.0 },
    { name: '石镐',       cost: 150000,          mult: 1.3 },
    { name: '铜镐',       cost: 4500000,         mult: 1.7 },
    { name: '铁镐',       cost: 500000000,       mult: 2.2 },
    { name: '钻石镐',     cost: 75000000000,     mult: 3.0 },
    { name: '下界合金镐', cost: 1300000000000,   mult: 4.0 },
  ];

  // ---------- 镐子贴图 ----------
  // 与 G.PICKS 一一对应；material/pickaxe 里的 golden 暂不用（数值上只有 6 级）
  G.PICK_TEX = ['wooden', 'stone', 'copper', 'iron', 'diamond', 'netherite'];
  G.PICK_TEX_DIR = 'assets/pickaxe/';
  G.PICK_TEX_PX = 16;              // 原图 16×16
  G.PICK_CURSOR_PX = 64;           // 矿区光标画成 64 设计像素（4 倍，最近邻）
  G.PICK_HEAD = { x: 8.5, y: 3 };  // 贴图里镐头中心的像素坐标，绘制时对准判定点
  G.PICK_OFFSET = { x: 20, y: -12 };  // 镐子相对判定点的整体偏移（设计像素，正数往右下）→ 摆在右上

  // 方块贴图（MC 原版 16×16）：stones/ 是岩层，ore/ 是矿。缺图就退回程序化纹理。
  G.BLOCK_TEX_DIR = 'assets/';
  G.BLOCK_TEX = {
    dirt: 'stones/dirt', stone: 'stones/stone',
    deepslate: 'stones/deepslate', netherrack: 'stones/netherrack',

    coal: 'ore/coal_ore', copper: 'ore/copper_ore', iron: 'ore/iron_ore',
    gold: 'ore/gold_ore', redstone: 'ore/redstone_ore', lapis: 'ore/lapis_ore',
    diamond: 'ore/diamond_ore', emerald: 'ore/emerald_ore',

    quartz: 'ore/nether_quartz_ore', nether_gold: 'ore/nether_gold_ore',
    debris: 'ore/ancient_debris_side',

    ds_coal: 'ore/deepslate_coal_ore', ds_copper: 'ore/deepslate_copper_ore',
    ds_iron: 'ore/deepslate_iron_ore', ds_gold: 'ore/deepslate_gold_ore',
    ds_redstone: 'ore/deepslate_redstone_ore', ds_lapis: 'ore/deepslate_lapis_ore',
    ds_diamond: 'ore/deepslate_diamond_ore', ds_emerald: 'ore/deepslate_emerald_ore',
  };

  // ---------- 升级线 ----------
  // unlock: 需要已解锁到第几层（0 起）
  G.TRACKS = [
    { key: 'eff',    name: '附魔 · 效率', desc: '挖掘范围变大',   max: 30, cost: 90,  g: 1.50, w: 1.15, unlock: 0 },
    { key: 'luck',   name: '附魔 · 时运', desc: '矿物 EMC 更高',  max: 30, cost: 120, g: 1.80, w: 1.25, unlock: 0 },
    { key: 'dens',   name: '矿物密度',   desc: '矿脉更密',       max: 20, cost: 160, g: 1.50, w: 1.45, unlock: 0 },
    { key: 'food',   name: '食物储备',   desc: '每局多挖几次',   max: 10, cost: 260, g: 1.90, w: 0.85, unlock: 0 },
    { key: 'cprob',  name: '连锁 · 概率', desc: '触发更勤，弹道 2→4→8 发', max: 40, cost: 140, g: 1.24, w: 0.95, unlock: 0 },
    { key: 'crange', name: '连锁 · 范围', desc: '每发子弹射得更远',   max: 40, cost: 160, g: 1.24, w: 1.05, unlock: 0 },
    { key: 'rarity', name: '稀有度',     desc: '稀有矿更常出现', max: 20, cost: 220, g: 1.34, w: 1.30, unlock: 2 },
  ];

  G.COST_SCALE = 3.0;     // 每条升级线价格 ×3^关卡
  G.TRACK_SCALE = 80.0;  // 全部升级线的整体价格倍率（数值框架总闸）

  // ---------- 效果公式 ----------
  G.fx = {
    radius:   function (L) { return 4 + 0.0641 * (L - 1); },                   // 4 → 6.5（初始面积再 ×2）
    luckMult: function (L) { return Math.pow(10, (5 + L) / 7); },            // 时运：每级 ×1.39（原 /5 每级 ×1.585，满级 1e7 会把镐价顶到 1e15）
    density:  function (base, L) { return base + 0.007 * (L - 1); },          // ×2.9
    food:     function (L) { return 10 + (L - 1) + (L >= 10 ? 1 : 0); },      // 10 → 20（每级 +1，满级再送一次）
    chainP:   function (L) { return Math.min(1, 0.08 + 0.024 * (L - 1)); },   // 触发率 8% → 100%
    chainDirs:function (L) { return L >= 28 ? 8 : (L >= 14 ? 4 : 2); },       // 子弹方向数 2 → 4 → 8
    chainR:   function (L) { return 2 + 0.35 * (L - 1); },                    // 子弹射程（格）2 → 15.6
    rareW:    function (L) { return 1 + 0.20 * (L - 1); },                    // ×1 → ×4.8
  };

  // 连锁的硬上限：递归连锁会指数增长，没有预算一帧能挖穿整个世界
  G.CHAIN_DEPTH = 2;      // 矿炸矿最多接几层
  G.CHAIN_BUDGET = 40;    // 单次点击总共最多打多少发子弹
  G.CHAIN_FIRST = 24;     // 其中首轮最多占多少发，剩下的留给二段

  // 子弹方向表：2 = 左右，4 = 上下左右，8 = 全向（四个对角各算一路）
  G.CHAIN_DIRS = [
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    { x: 0.7071, y: 0.7071 }, { x: 0.7071, y: -0.7071 },
    { x: -0.7071, y: 0.7071 }, { x: -0.7071, y: -0.7071 },
  ];
  G.chainDirSet = function (n) {
    var all = G.CHAIN_DIRS;
    if (n >= 8) return all;
    if (n >= 4) return all.slice(0, 4);
    return all.slice(0, 2);
  };

  // 矿脉恢复：挖过的地方短时间内贫化，防止原地连点
  G.RICH_DROP = 0.55;
  G.RICH_MIN = 0.30;     // 原地连点最多衰减到 30%，换个地方挖就回满
  G.RICH_REGEN = 1.10;   // 每秒恢复量：挖过的格子约 0.8 秒回满
})();
