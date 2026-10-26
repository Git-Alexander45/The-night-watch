'use strict';
// Shared helpers: math, seeded randomness, hashing and formatting.
window.NW = window.NW || {};
(function (NW) {
  const U = NW.U = {};

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  U.rand = (a, b) => a + Math.random() * (b - a);
  U.randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.chance = (p) => Math.random() < p;
  U.sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
  U.approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

  // Integer hash of any number of integers -> [0, 2^32)
  U.hash = function () {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < arguments.length; i++) {
      let v = arguments[i] | 0;
      h ^= v & 0xff; h = Math.imul(h, 16777619);
      h ^= (v >>> 8) & 0xff; h = Math.imul(h, 16777619);
      h ^= (v >>> 16) & 0xff; h = Math.imul(h, 16777619);
      h ^= (v >>> 24) & 0xff; h = Math.imul(h, 16777619);
    }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return h >>> 0;
  };
  U.hashf = function () { return U.hash.apply(null, arguments) / 4294967296; };
  U.strHash = (str) => { let h = 0; for (let i = 0; i < str.length; i++) h = U.hash(h, str.charCodeAt(i), i); return h; };

  // Seeded RNG (mulberry32)
  U.rng = function (seed) {
    let a = seed >>> 0;
    const f = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.chance = (p) => f() < p;
    return f;
  };

  U.shuffle = function (arr, rnd) {
    rnd = rnd || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };

  // FNV-1a over a string, hex output. Used for save checksums.
  U.fnv = function (str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  };

  U.pad2 = (n) => (n < 10 ? '0' : '') + n;
  U.fmtClock = function (min) {
    min = ((Math.floor(min) % 1440) + 1440) % 1440;
    return U.pad2(Math.floor(min / 60)) + ':' + U.pad2(min % 60);
  };
  U.fmtDur = function (min) {
    min = Math.max(0, Math.floor(min));
    const h = Math.floor(min / 60), m = min % 60;
    return h > 0 ? h + 'h ' + U.pad2(m) + 'm' : m + 'm';
  };

  U.clone = (o) => JSON.parse(JSON.stringify(o));
  const NUMW = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  U.numWord = (n, cap) => { const w = NUMW[n] || String(n); return cap ? w.charAt(0).toUpperCase() + w.slice(1) : w; };
  let uidc = 0;
  U.uid = (p) => (p || 'id') + '_' + Date.now().toString(36) + '_' + (uidc++).toString(36) + Math.floor(Math.random() * 1e6).toString(36);

  U.escape = function (s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };

  // Axis aligned rect overlap
  U.overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  U.pointIn = (px, py, r) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h;
  U.distToRect = function (px, py, r) {
    const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
    const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
    return Math.hypot(dx, dy);
  };
})(window.NW);
