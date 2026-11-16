/*!
 * audio.js —— 程序化音效（不读任何音频文件）
 * 浏览器用 AudioContext，微信小游戏用 wx.createWebAudioContext()（基础库 2.19.0+）。
 * 所有声音都是现场合成的振荡器 / 噪声，所以包体里没有 mp3，也不用处理加载与解码。
 */
(function () {
  var root = (typeof GameGlobal !== 'undefined') ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis);
  var G = root.G = root.G || {};
  var A = G.A = {};

  var ctx = null;
  var master = null;
  var noiseBuf = null;
  var muted = false;
  var dead = false;          // 音频不可用时彻底静音，不再尝试
  var lastAt = {};           // 每种音效的最小间隔，防止连锁一次炸出上百个振荡器

  var MASTER_GAIN = 0.5;
  var NOISE_SEC = 0.4;

  function nowSec() {
    return ctx && ctx.currentTime ? ctx.currentTime : 0;
  }

  A.init = function () {
    if (dead) return null;
    if (ctx) {
      // 浏览器要求用户手势后才能出声，恢复一下
      try {
        if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      } catch (e) { /* 忽略 */ }
      return ctx;
    }
    try {
      var AC = null;
      if (typeof wx !== 'undefined' && wx && typeof wx.createWebAudioContext === 'function') {
        AC = wx.createWebAudioContext();
      } else if (typeof AudioContext !== 'undefined') {
        AC = new AudioContext();
      } else if (typeof webkitAudioContext !== 'undefined') {
        AC = new webkitAudioContext();
      }
      if (!AC) { dead = true; return null; }
      ctx = AC;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_GAIN;
      master.connect(ctx.destination);

      // 预生成一段白噪声，挖掘声直接复用
      var n = Math.floor(ctx.sampleRate * NOISE_SEC);
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      var data = noiseBuf.getChannelData(0);
      for (var i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
      return ctx;
    } catch (e) {
      dead = true;
      return null;
    }
  };

  A.setMuted = function (v) {
    muted = !!v;
    if (master) {
      try { master.gain.value = muted ? 0 : MASTER_GAIN; } catch (e) { /* 忽略 */ }
    }
    return muted;
  };
  A.isMuted = function () { return muted; };
  A.toggleMute = function () { return A.setMuted(!muted); };

  function ready(name, minGap) {
    if (dead || muted) return false;
    if (!A.init()) return false;
    var t = nowSec();
    if (minGap && lastAt[name] && t - lastAt[name] < minGap / 1000) return false;
    lastAt[name] = t;
    return true;
  }

  // 一个短音：类型 / 起始频率 / 时长 / 音量 / 起始时间 / 滑到的频率
  function tone(type, f0, dur, gain, when, f1) {
    try {
      var t0 = nowSec() + (when || 0);
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t0);
      if (f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.012, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (e) { /* 单个音效失败不影响游戏 */ }
  }

  // 一段噪声：带通滤波，用来做"挖开石头"的质感
  function noise(dur, gain, freq, q, when) {
    try {
      var t0 = nowSec() + (when || 0);
      var src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.playbackRate.value = 0.8 + Math.random() * 0.5;
      var bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = q || 1.2;
      var g = ctx.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(bp); bp.connect(g); g.connect(master);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    } catch (e) { /* 忽略 */ }
  }

  /**
   * 播放一个音效。
   * name: dig | ore | chain | buy | pick | win | fail
   * opt.tier: 0..1，矿物越贵音越高（ore 用）
   */
  A.play = function (name, opt) {
    opt = opt || {};
    if (name === 'dig') {
      if (!ready('dig', 45)) return;
      var f = 700 + Math.random() * 500;
      noise(0.055, 0.10, f, 1.4);
      tone('square', 150 + Math.random() * 60, 0.04, 0.05, 0, 90);
      return;
    }
    if (name === 'ore') {
      if (!ready('ore', 60)) return;
      var tier = Math.max(0, Math.min(1, opt.tier || 0));
      var base = 520 + tier * 900;
      tone('triangle', base, 0.10, 0.075, 0);
      tone('sine', base * 2, 0.07, 0.03, 0.005);
      return;
    }
    if (name === 'chain') {
      if (!ready('chain', 70)) return;
      for (var i = 0; i < 4; i++) {
        tone('triangle', 440 * Math.pow(1.26, i), 0.09, 0.055 - i * 0.008, i * 0.035);
      }
      return;
    }
    if (name === 'buy') {
      if (!ready('buy', 60)) return;
      tone('square', 520, 0.06, 0.05, 0, 780);
      tone('sine', 1040, 0.09, 0.04, 0.04);
      return;
    }
    if (name === 'pick') {
      if (!ready('pick', 120)) return;
      noise(0.12, 0.09, 1600, 2.2);
      tone('triangle', 300, 0.20, 0.06, 0.02, 900);
      tone('sine', 1200, 0.14, 0.04, 0.16, 1800);
      return;
    }
    if (name === 'win') {
      if (!ready('win', 400)) return;
      var notes = [523, 659, 784, 1047, 1319];
      for (var k = 0; k < notes.length; k++) {
        tone('triangle', notes[k], 0.55, 0.075, k * 0.11);
        tone('sine', notes[k] * 2, 0.4, 0.025, k * 0.11);
      }
      return;
    }
    if (name === 'fail') {
      if (!ready('fail', 150)) return;
      tone('square', 220, 0.10, 0.05, 0, 150);
      return;
    }
  };
})();
