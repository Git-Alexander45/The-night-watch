'use strict';
/*
 * Procedural PBR material library (no image files: every texture is generated here, in code).
 *
 * API
 *   R3.Tex.mat(name, opts)      -> shared, cached R3.std material for a named surface (same opts -> same object).
 *   R3.Tex.BASE[name]           -> [mean sRGB colour hex, mean roughness] for every name (read-only reference).
 *   R3.Tex.metreUV(geo, scale)  -> box-projects UVs so 1 UV unit = 1 metre (u along X/Z, v up / along Z on floors).
 *   R3.Tex.applyQuality(q)      -> called by core: regenerates every texture at q.tex (512 Low, 1024 otherwise)
 *                                  and swaps the maps into the existing materials in place.
 *   R3.Tex.canvas(name, opts)   -> a canvas with the generated colour map (rows flipped so a CanvasTexture with the
 *                                  default flipY matches our orientation). Handy for small props.
 *   R3.Tex.maps(name, opts)     -> { map, normalMap, size, mean } shared textures (normal map alpha = roughness).
 *   R3.Tex.preload(names?)      -> generate now (default: all names); returns { name: ms }.
 *   R3.Tex.names()              -> every generated name.  R3.Tex.stats -> generation ms per texture set.
 *   R3.Tex.noise2(x, y), R3.Tex.noise3(x, y, z) -> classic Perlin noise in [-1, 1] (non-periodic, JS side).
 *
 * opts (all optional)
 *   color      target mean albedo (hex). The texture keeps its detail and is recoloured so it averages to this colour.
 *   tint       plain multiplier on the texture colour (hex, 0xffffff = unchanged).
 *   roughness  target mean roughness (the map's variation is kept).   metalness: override metalness factor.
 *   repeat     pattern scale multiplier (2 = pattern twice as small), number or [u, v].   offset: [u, v] in metres.
 *   normalScale  multiplier on the material's default bump strength.
 *   wind, snowTop, weather, wet       -> forwarded to R3.std (see mat.js).
 *   side, transparent, opacity, emissive, emissiveIntensity, alphaTest, depthWrite -> material params.
 *   spacing    log_wall only: log pitch in metres (default 0.30). Chinking lines sit at v = k * spacing (+ offset[1]).
 *
 * Texture conventions
 *   - Every pattern tiles seamlessly. 1 UV unit = 1 metre: each name declares the real size its tile covers
 *     and texture.repeat is set from it, so geometry only needs metre UVs (metreUV or real-size UVs).
 *   - Grain / fibres / boards / rows run along U (horizontal: logs, planks, floors, shingle rows, siding).
 *     Bark, fur, rain streaks and grass run along V (up).
 *   - wood_log_end does NOT tile: UV 0..1 is one sawn log face (CylinderGeometry cap UVs), rings centred at 0.5.
 *   - Cut-out sheets (alpha in the colour map, use with opts.alphaTest ~0.5): needles, foliage_birch, grass_card.
 *     Without alphaTest they read as dense foliage with dark gaps. grass_card is rooted at v = 0, tips toward v = 1.
 *   - Maps: colour (sRGB, alpha = cut-out or metalness), normal (linear, tangent space from a Sobel'd height field,
 *     alpha = roughness). Roughness/metalness are read from those alphas by a small shader patch (2 textures per set).
 *
 * Names: the BASE list below. Additions over the original stub: wood_plank_floor, wood_painted, boards_weathered,
 *   log_wall, bark_dead, rock_lichen, snow_trail, forest_floor, fabric_red, plaster, wallpaper, brick, grass_card.
 */
(function (NW) {
  const THREE = window.THREE, R3 = NW.R3;
  if (!THREE || !R3) return;
  const T = R3.Tex = {};
  T.BASE = {
    bark_pine: [0x3b2a20, 0.95], bark_birch: [0xd8d2c4, 0.85], needles: [0x1d3326, 0.9], wood_log: [0x5a3a24, 0.85], wood_log_end: [0x8a6a48, 0.9],
    wood_plank: [0x6b4a32, 0.7], wood_plank_dark: [0x3e2a1c, 0.75], wood_weathered: [0x6e6a62, 0.9], roof_shingle: [0x3a3632, 0.9], chinking: [0x9c8e78, 1],
    snow: [0xdfe6ee, 0.75], dirt: [0x4a3a2c, 1], mud: [0x2e281d, 0.6], ash: [0x2e2c2b, 1], rock: [0x5b616d, 0.9], stone_wall: [0x55585e, 0.9], gravel: [0x6a6660, 1],
    ice: [0xa9c8da, 0.15], metal_dark: [0x2a2d33, 0.45], metal_rust: [0x5a3624, 0.8], metal_painted: [0x2e4a3a, 0.6], cast_iron: [0x1e1f22, 0.55], brass: [0xa88a40, 0.35],
    glass: [0xbcd0e0, 0.05], fabric_wool: [0x6f1a1f, 1], fabric_canvas: [0x7d7458, 0.95], fabric_blue: [0x2a3f66, 1], leather: [0x4a2f1c, 0.7], fur: [0x6e5a46, 1], paper: [0xd8ccae, 0.9],
    grass_dry: [0x646d40, 1], moss: [0x3d6b43, 1], foliage_birch: [0x828a4c, 0.9],
    // additions
    wood_plank_floor: [0x6a4a30, 0.6], wood_painted: [0xb8b4a8, 0.6], boards_weathered: [0x6a665e, 0.9], log_wall: [0x5a3e28, 0.85], bark_dead: [0x6a645c, 0.9],
    rock_lichen: [0x6a6e64, 0.9], snow_trail: [0xc8ccd2, 0.6], forest_floor: [0x4a3828, 0.95], fabric_red: [0x6a1a1c, 0.85], plaster: [0xb0a898, 0.92],
    wallpaper: [0x8a8668, 0.85], brick: [0x6e3a2c, 0.9], grass_card: [0x6a6a40, 0.9],
  };

  // The generator library is a self-contained function so the same code runs in Web Workers
  // (full-size textures off the main thread) and on the main thread (instant small previews, fallback).
  function LIB() {
    'use strict';
    // ================================================================ small math
    const TAU = Math.PI * 2;
    const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
    const sm = (a, b, x) => { x = (x - a) / (b - a); x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
    const lerp = (a, b, t) => a + (b - a) * t;
    const hx = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
    function rng(seed) {
      let s = seed >>> 0;
      return function () { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    function ihash(a, b) { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
    function strSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  
    // ================================================================ periodic noise fields (N x N, N power of two)
    // Perlin gradient noise with `P` lattice cells across the tile, accumulated into `out` with amplitude `amp`.
    function perlinAdd(N, P, seed, out, amp) {
      const r = rng(seed), PP = P * P, gx = new Float32Array(PP), gy = new Float32Array(PP);
      for (let i = 0; i < PP; i++) { const a = r() * TAU; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
      const shx = (r() * N) | 0, shy = (r() * N) | 0, cs = P / N, M = N - 1;
      const X0 = new Int32Array(N), X1 = new Int32Array(N), TX = new Float32Array(N), SX = new Float32Array(N);
      for (let x = 0; x < N; x++) { const f = ((x + shx) & M) * cs, i = Math.floor(f), t = f - i; X0[x] = i % P; X1[x] = (i + 1) % P; TX[x] = t; SX[x] = t * t * t * (t * (t * 6 - 15) + 10); }
      for (let y = 0; y < N; y++) {
        const fy = ((y + shy) & M) * cs, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
        const r0 = (iy % P) * P, r1 = ((iy + 1) % P) * P, o = y * N, ty1 = ty - 1;
        for (let x = 0; x < N; x++) {
          const tx = TX[x], tx1 = tx - 1, a0 = r0 + X0[x], a1 = r0 + X1[x], b0 = r1 + X0[x], b1 = r1 + X1[x];
          const va = gx[a0] * tx + gy[a0] * ty, vb = gx[a1] * tx1 + gy[a1] * ty;
          const vc = gx[b0] * tx + gy[b0] * ty1, vd = gx[b1] * tx1 + gy[b1] * ty1;
          const sx = SX[x], ab = va + (vb - va) * sx, cd = vc + (vd - vc) * sx;
          out[o + x] += amp * (ab + (cd - ab) * sy);
        }
      }
    }
    function normalize(a) {
      let s = 0, s2 = 0; const n = a.length;
      for (let i = 0; i < n; i++) { s += a[i]; s2 += a[i] * a[i]; }
      const m = s / n, sd = Math.sqrt(Math.max(1e-12, s2 / n - m * m));
      for (let i = 0; i < n; i++) a[i] = (a[i] - m) / sd;
      return a;
    }
    function fbm(N, P0, oct, seed, gain) {
      const out = new Float32Array(N * N);
      let amp = 1, P = P0;
      for (let o = 0; o < oct && P <= N / 2; o++, P *= 2) { perlinAdd(N, P, seed + o * 7919, out, amp); amp *= gain; }
      return normalize(out);
    }
    // Shared base fields (z-scored fbm) per size; materials sample them with integer scales/offsets (stays periodic).
    const baseCache = {};
    const BASE_DEF = [[2, 10, 0.5, 101], [4, 9, 0.55, 202], [8, 8, 0.62, 303]];
    function baseField(N, b) {
      const k = N + ':' + b;
      if (!baseCache[k]) { const d = BASE_DEF[b]; baseCache[k] = fbm(N, d[0], d[1], d[3], d[2]); }
      return baseCache[k];
    }
    let flushTimer = 0;
    function scheduleFlush() {
      clearTimeout(flushTimer);
      flushTimer = setTimeout(() => { for (const k in baseCache) delete baseCache[k]; }, 4000);
    }
  
    // ================================================================ generation context
    function Ctx(N, seed, spec) {
      this.N = N; this.n = N * N; this.M = N - 1; this.sh = Math.log2(N) | 0;
      this.r = rng(seed); this.seed = seed;
      this.su = spec.s[0]; this.sv = spec.s[1];
      this.pu = N / this.su; this.pv = N / this.sv;          // pixels per metre along u / v
      const n = this.n;
      this.R = new Float32Array(n); this.G = new Float32Array(n); this.B = new Float32Array(n);
      this.H = new Float32Array(n);                          // height in millimetres
      this.Ro = new Float32Array(n).fill(0.8);               // roughness
      this.A = null;                                         // alpha (cut-outs)
      this.Me = null;                                        // metalness
      this.wrapY = true;
    }
    const CP = Ctx.prototype;
    CP.rand = function (a, b) { return a + (b - a) * this.r(); };
    // sample a shared base field: kx/ky integer frequency multipliers (anisotropic = streaks), random offset
    CP.base = function (b, kx, ky) {
      const N = this.N, M = this.M, src = baseField(N, b), out = new Float32Array(this.n);
      const ox = (this.r() * N) | 0, oy = (this.r() * N) | 0;
      for (let y = 0; y < N; y++) {
        const row = ((y * ky + oy) & M) * N, o = y * N;
        if (kx === 1) { out.set(src.subarray(row + ox, row + N), o); out.set(src.subarray(row, row + ox), o + N - ox); }
        else for (let x = 0; x < N; x++) out[o + x] = src[row + ((x * kx + ox) & M)];
      }
      return out;
    };
    CP.white = function () { const a = new Float32Array(this.n), r = this.r; for (let i = 0; i < this.n; i++) a[i] = r(); return a; };
    // periodic cellular noise: cx x cy cells across the tile, optional warp fields (z-scored) * wa pixels
    CP.worley = function (cx, cy, jit, wx, wy, wa) {
      const N = this.N, n = this.n, r = this.r, sh = this.sh, M = this.M;
      const cw = N / cx, ch = N / cy, PW = cx + 2, PH = cy + 2;
      // padded point grid: ring of wrapped neighbours with their offsets baked in (no modulo in the inner loop)
      const bx = new Float32Array(cx * cy), by = new Float32Array(cx * cy);
      for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) { bx[j * cx + i] = (i + 0.5 + (r() - 0.5) * jit) * cw; by[j * cx + i] = (j + 0.5 + (r() - 0.5) * jit) * ch; }
      const px = new Float32Array(PW * PH), py = new Float32Array(PW * PH), pid = new Int32Array(PW * PH);
      for (let j = -1; j <= cy; j++) for (let i = -1; i <= cx; i++) {
        const iw = (i + cx) % cx, jw = (j + cy) % cy, k = jw * cx + iw, q = (j + 1) * PW + i + 1;
        px[q] = bx[k] + (i - iw) * cw; py[q] = by[k] + (j - jw) * ch; pid[q] = k;
      }
      const f1 = new Float32Array(n), f2 = new Float32Array(n), id = new Int32Array(n), icw = 1 / cw, ich = 1 / ch;
      for (let i = 0; i < n; i++) {
        let sx = i & M, sy = i >> sh;
        if (wx) { sx += wx[i] * wa; sy += wy[i] * wa; sx -= Math.floor(sx / N) * N; sy -= Math.floor(sy / N) * N; }
        let ci = (sx * icw) | 0, cj = (sy * ich) | 0; if (ci >= cx) ci = cx - 1; if (cj >= cy) cj = cy - 1;
        let d1 = 1e20, d2 = 1e20, best = 0;
        for (let dj = 0; dj < 3; dj++) {
          let q = (cj + dj) * PW + ci;
          for (let di = 0; di < 3; di++, q++) {
            const dx = px[q] - sx, dy = py[q] - sy, d = dx * dx + dy * dy;
            if (d < d1) { d2 = d1; d1 = d; best = q; } else if (d < d2) d2 = d;
          }
        }
        f1[i] = Math.sqrt(d1); f2[i] = Math.sqrt(d2); id[i] = pid[best];
      }
      return { f1, f2, id, cw, ch };
    };
    // bilinear wrapped sample
    CP.samp = function (a, x, y) {
      const N = this.N, M = this.M, x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
      const i00 = (y0 & M) * N, i10 = ((y0 + 1) & M) * N, xa = x0 & M, xb = (x0 + 1) & M;
      const a0 = a[i00 + xa] + (a[i00 + xb] - a[i00 + xa]) * tx, a1 = a[i10 + xa] + (a[i10 + xb] - a[i10 + xa]) * tx;
      return a0 + (a1 - a0) * ty;
    };
    CP.warp = function (a, wx, wy, amt) {
      const out = new Float32Array(this.n), M = this.M, sh = this.sh;
      for (let i = 0; i < this.n; i++) out[i] = this.samp(a, (i & M) + wx[i] * amt, (i >> sh) + wy[i] * amt);
      return out;
    };
    // separable wrapped box blur (passes x2 ~ gaussian)
    CP.blur = function (a, rad, passes) {
      const N = this.N, M = this.M, tmp = new Float32Array(this.n), w = 1 / (2 * rad + 1);
      for (let p = 0; p < (passes || 2); p++) {
        for (let y = 0; y < N; y++) {
          const o = y * N; let s = 0;
          for (let k = -rad; k <= rad; k++) s += a[o + (k & M)];
          for (let x = 0; x < N; x++) { tmp[o + x] = s * w; s += a[o + ((x + rad + 1) & M)] - a[o + ((x - rad) & M)]; }
        }
        for (let x = 0; x < N; x++) {
          let s = 0;
          for (let k = -rad; k <= rad; k++) s += tmp[(k & M) * N + x];
          for (let y = 0; y < N; y++) { a[y * N + x] = s * w; s += tmp[((y + rad + 1) & M) * N + x] - tmp[((y - rad) & M) * N + x]; }
        }
      }
      return a;
    };
    // ---- colour helpers (sRGB 0..1)
    CP.fill = function (col) { this.R.fill(col[0]); this.G.fill(col[1]); this.B.fill(col[2]); };
    CP.set = function (i, col) { this.R[i] = col[0]; this.G[i] = col[1]; this.B[i] = col[2]; };
    CP.mix = function (i, col, t) { if (t <= 0) return; if (t > 1) t = 1; this.R[i] += (col[0] - this.R[i]) * t; this.G[i] += (col[1] - this.G[i]) * t; this.B[i] += (col[2] - this.B[i]) * t; };
    CP.mul = function (i, f) { this.R[i] *= f; this.G[i] *= f; this.B[i] *= f; };
    CP.mulc = function (i, col, t) { this.R[i] *= lerp(1, col[0], t); this.G[i] *= lerp(1, col[1], t); this.B[i] *= lerp(1, col[2], t); };
    // ---- stamps (wrapping): ellipse with rotation; fn(i, u, v) with u, v in [-1, 1] inside the ellipse
    CP.ell = function (cx, cy, rx, ry, ang, fn) {
      const M = this.M, N = this.N, ca = Math.cos(ang), sa = Math.sin(ang), R = Math.max(rx, ry) + 1;
      const y0 = Math.floor(cy - R), y1 = Math.ceil(cy + R), x0 = Math.floor(cx - R), x1 = Math.ceil(cx + R);
      for (let y = y0; y <= y1; y++) {
        if (!this.wrapY && (y < 0 || y >= N)) continue;
        const dy = y - cy, row = (y & M) * N;
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx, u = (dx * ca + dy * sa) / rx, v = (-dx * sa + dy * ca) / ry;
          if (u * u + v * v <= 1) fn(row + (x & M), u, v);
        }
      }
    };
    // thick segment from (x0,y0) radius r0 to (x1,y1) radius r1: fn(i, t along 0..1, d across 0..1 (signed), )
    CP.seg = function (x0, y0, x1, y1, r0, r1, fn) {
      const M = this.M, N = this.N, R = Math.max(r0, r1) + 1;
      const bx0 = Math.floor(Math.min(x0, x1) - R), bx1 = Math.ceil(Math.max(x0, x1) + R), by0 = Math.floor(Math.min(y0, y1) - R), by1 = Math.ceil(Math.max(y0, y1) + R);
      const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-6, L = Math.sqrt(L2);
      for (let y = by0; y <= by1; y++) {
        if (!this.wrapY && (y < 0 || y >= N)) continue;
        const row = (y & M) * N;
        for (let x = bx0; x <= bx1; x++) {
          let t = ((x - x0) * dx + (y - y0) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const r = r0 + (r1 - r0) * t; if (r <= 0) continue;
          const ex = x - (x0 + dx * t), ey = y - (y0 + dy * t), d2 = ex * ex + ey * ey;
          if (d2 <= r * r) fn(row + (x & M), t, ((ex * -dy + ey * dx) / L) / r);
        }
      }
    };
    // polyline stroke along a smooth curve: pts [[x,y],...], radius fn(t)
    CP.stroke = function (pts, rad, fn) {
      let acc = 0; const L = [];
      for (let k = 1; k < pts.length; k++) { const l = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); L.push(l); acc += l; }
      let s = 0;
      for (let k = 1; k < pts.length; k++) {
        const t0 = s / acc, t1 = (s + L[k - 1]) / acc;
        this.seg(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], rad(t0), rad(t1), (i, t, d) => fn(i, t0 + (t1 - t0) * t, d));
        s += L[k - 1];
      }
    };
    CP.transpose = function () {
      const N = this.N;
      const tr = (a) => { if (!a) return a; const b = new Float32Array(this.n); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) b[x * N + y] = a[y * N + x]; return b; };
      this.R = tr(this.R); this.G = tr(this.G); this.B = tr(this.B); this.H = tr(this.H); this.Ro = tr(this.Ro); this.A = tr(this.A); this.Me = tr(this.Me);
    };
  
    // ================================================================ shared pattern builders
    // Wood grain along u. o: { rings (lines across the tile in v), warp (rings), knots, knotR (m), knotAmp, fibre }
    function lateOf(p) { const f = p - Math.floor(p); return sm(0.55, 0.86, f) * (1 - sm(0.88, 0.99, f)); }
    function woodGrain(c, o) {
      const N = c.N, n = c.n, sh = c.sh;
      const w1 = c.base(0, 1, o.ky1 || 3), w2 = c.base(1, 1, o.ky2 || 8), fib = c.base(2, 1, o.fibK || 40), fib2 = c.base(2, 2, 96);
      const phase = new Float32Array(n), knot = new Float32Array(n);
      const rings = o.rings, warp = o.warp;
      for (let i = 0; i < n; i++) phase[i] = (i >> sh) / N * rings + w1[i] * warp + w2[i] * warp * 0.08;
      const nk = o.knots || 0;
      for (let k = 0; k < nk; k++) {
        const kx = c.r() * N, ky = c.r() * N, rk = (o.knotR || 0.018) * c.pv * c.rand(0.6, 1.4), amp = o.knotAmp || 1.4;
        c.ell(kx, ky, rk * 6, rk * 2.6, 0, (i, u, v) => { phase[i] += amp * Math.exp(-(u * u * 2.5 + v * v * 2.2) * 1.6); });
        c.ell(kx, ky, rk * 1.1, rk, c.rand(-0.2, 0.2), (i, u, v) => { const d = Math.sqrt(u * u + v * v), t = 1 - sm(0.8, 1, d); knot[i] = Math.max(knot[i], t * (0.65 + 0.35 * Math.abs(Math.sin(d * 9)))); });
      }
      const late = new Float32Array(n);
      for (let i = 0; i < n; i++) late[i] = lateOf(phase[i]);
      return { late, fib, fib2, knot, w1, w2, phase };
    }
    // thin cracks along u (drying checks): returns crack depth field 0..1
    // long thin drying cracks along u: count, length range (m), max width (m) -> depth field 0..1
    function checks(c, count, l0, l1, w0) {
      const out = new Float32Array(c.n);
      for (let k = 0; k < count; k++) {
        const x = c.r() * c.N, y = c.r() * c.N, len = c.rand(l0, l1) * c.pu, w = w0 * c.pv * c.rand(0.6, 1.3), pts = [];
        let yy = y, dy = 0;
        for (let s = 0; s <= 10; s++) { pts.push([x + len * s / 10, yy]); dy += c.rand(-0.6, 0.6); dy *= 0.7; yy += dy; }
        c.stroke(pts, (t) => Math.max(0.4, w * Math.sin(Math.PI * t)), (i, t, d) => { const v = (1 - d * d) * Math.min(1, Math.sin(Math.PI * t) * 2.5); if (v > out[i]) out[i] = v; });
      }
      return out;
    }
    function woodPaint(c, g, light, dark, o) {
      const n = c.n, L = hx(light), D = hx(dark), K = hx(o.knotCol || 0x2a1a10);
      for (let i = 0; i < n; i++) {
        const t = clamp01(g.late[i] * (o.lateK || 0.8) + g.w1[i] * 0.08 + g.w2[i] * 0.05 + g.fib[i] * (o.fibC || 0.06) + 0.15);
        c.R[i] = lerp(L[0], D[0], t); c.G[i] = lerp(L[1], D[1], t); c.B[i] = lerp(L[2], D[2], t);
        c.mix(i, K, g.knot[i] * 0.9);
        c.H[i] += -g.late[i] * (o.lateH || 0.3) + g.fib[i] * (o.fibH || 0.15) - g.knot[i] * 0.2;
      }
    }
  
    // ================================================================ generators
    // s: tile size in metres [u, v]; bump: normal strength; metal: has metalness map; norm: normalScale default
    const GEN = {};
    // -------------------------------------------------------------- bark
    GEN.bark_pine = { s: [1, 1], bump: 1.4, gen(c) {
      const n = c.n, N = c.N;
      const wx = c.base(0, 2, 1), wy = c.base(1, 1, 2);
      const w = c.worley(8, 3, 0.9, wx, wy, N * 0.03);
      const fl = c.base(2, 3, 2), fine = c.base(2, 6, 3), lich = c.base(1, 3, 3), str = c.base(2, 8, 1), wt = c.base(0, 1, 1);
      const plateA = hx(0x5c4232), plateB = hx(0x57524c), orange = hx(0x8a5638), crev = hx(0x15100d), lc = hx(0x7f8a76), grey = hx(0x6e6a66);
      const cw = N * 0.014;
      for (let i = 0; i < n; i++) {
        const e = w.f2[i] - w.f1[i], cid = ihash(w.id[i], 7);
        const crack = 1 - sm(0, cw, e), edge = sm(0, cw * 3.5, e);
        const terr = Math.floor((fl[i] * 0.5 + 1.2) * 2.2) / 2.2;            // flaky layered scales
        c.H[i] = edge * (9 + cid * 6) + terr * 1.6 + fine[i] * 0.45 + str[i] * 0.35 - crack * 6;
        c.set(i, plateA); c.mix(i, plateB, clamp01(cid * 0.7 + wt[i] * 0.25));
        c.mix(i, orange, sm(0.8, 1.6, fl[i] - terr * 0.2) * 0.45 * edge);
        c.mix(i, grey, sm(0.2, 1.2, fine[i]) * 0.25);
        c.mix(i, crev, 1 - sm(0, cw * 2.2, e));
        c.mul(i, 0.85 + 0.15 * clamp01(terr * 0.5 + 0.5));
        if (lich[i] > 1.1 && edge > 0.5) c.mix(i, lc, sm(1.1, 1.6, lich[i]) * sm(0.2, 0.8, fine[i] + 0.5) * 0.85);
        c.Ro[i] = 0.82 + crack * 0.15 + fine[i] * 0.03;
      }
    } };
    GEN.bark_birch = { s: [1, 1], bump: 0.9, gen(c) {
      const n = c.n, N = c.N, M = c.M;
      const lo = c.base(0, 1, 1), mid = c.base(1, 1, 3), fine = c.base(2, 4, 8), pat = c.base(0, 2, 4), pat2 = c.base(2, 3, 6), peel = c.base(1, 1, 10);
      const white = hx(0xe4dfd3), grey = hx(0xbab4aa), pink = hx(0xd8c6b8), black = hx(0x1d1a19), orange = hx(0xb07a4c);
      for (let i = 0; i < n; i++) {
        c.set(i, white); c.mix(i, grey, sm(-0.5, 1.8, lo[i] + fine[i] * 0.25) * 0.55); c.mix(i, pink, sm(0.5, 1.8, mid[i]) * 0.35);
        c.H[i] = fine[i] * 0.15 + mid[i] * 0.2; c.Ro[i] = 0.55 + fine[i] * 0.04;
        const p = pat[i] + pat2[i] * 0.45;
        if (p > 1.25) { const t = sm(1.25, 1.5, p); c.mix(i, black, t * 0.95); c.H[i] += t * (1.4 + fine[i] * 0.8); c.Ro[i] = lerp(c.Ro[i], 0.92, t); }
        const pl = peel[i];
        if (pl > 1.55) { const t = sm(1.55, 1.75, pl); c.mix(i, hx(0xf3efe7), t); c.H[i] += t * 0.6; }
        else if (pl > 1.35) { const t = sm(1.35, 1.55, pl) * (1 - sm(1.5, 1.55, pl)); c.mix(i, orange, t * 0.75); c.H[i] -= t * 0.5; }
      }
      // lenticels: short horizontal dark dashes
      const cnt = 420;
      for (let k = 0; k < cnt; k++) {
        const x = c.r() * N, y = c.r() * N, len = c.rand(0.015, 0.11) * c.pu, th = c.rand(0.0015, 0.004) * c.pv, a = c.rand(-0.05, 0.05);
        c.ell(x, y, len / 2, Math.max(0.8, th), a, (i, u, v) => { const t = (1 - u * u) * (1 - Math.abs(v)); c.mix(i, black, 0.85 * Math.min(1, t * 3)); c.H[i] -= 0.8 * t; c.Ro[i] = 0.9; });
      }
      void M;
    } };
    GEN.bark_dead = { s: [1, 1], bump: 1.6, gen(c) {
      const g = woodGrain(c, { rings: 50, warp: 1.2, knots: 3, knotR: 0.025, fibK: 24 });
      woodPaint(c, g, 0x8a857c, 0x4e4a45, { knotCol: 0x2a2420, lateK: 0.5, fibC: 0.1, lateH: 1.0, fibH: 0.6 });
      const ck = checks(c, 14, 0.1, 0.5, 0.003), lo = c.base(0, 1, 1), bk = c.base(1, 2, 2), fine = c.base(2, 4, 4);
      const brown = hx(0x5a4636), dark = hx(0x1c1814), bark = hx(0x3a2c24);
      for (let i = 0; i < c.n; i++) {
        c.mix(i, brown, sm(0.3, 1.8, lo[i]) * 0.5);
        c.mix(i, dark, ck[i] * 0.9); c.H[i] -= ck[i] * 5;
        if (bk[i] > 1.9) { const t = sm(1.9, 2.05, bk[i]); c.mix(i, bark, t); c.H[i] += t * (3 + fine[i]); }
        c.Ro[i] = 0.88 + ck[i] * 0.1;
      }
      c.transpose();
    } };
    // -------------------------------------------------------------- needles / foliage (alpha sheets)
    GEN.needles = { s: [0.5, 0.5], bump: 0.9, alpha: true, gen(c) {
      const N = c.N, n = c.n;
      c.A = new Float32Array(n); c.fill(hx(0x0c1610)); c.Ro.fill(0.85);
      const cols = [0x1d3a28, 0x24442c, 0x2c4a2f, 0x183224, 0x355236].map(hx), tip = hx(0x52683e), shade = new Float32Array(n);
      const twigs = 60;
      for (let k = 0; k < twigs; k++) {
        let x = c.r() * N, y = c.r() * N; const ang = c.rand(0, TAU), len = c.rand(0.12, 0.25) * c.pu, steps = Math.round(len / 3);
        const dx = Math.cos(ang) * 3, dy = Math.sin(ang) * 3, depth = c.r();
        for (let s = 0; s < steps; s++) {
          x += dx + c.rand(-0.5, 0.5); y += dy + c.rand(-0.5, 0.5);
          for (let side = -1; side <= 1; side += 2) {
            if (c.r() < 0.15) continue;
            const na = ang + side * c.rand(0.5, 1.1) + c.rand(-0.15, 0.15), nl = c.rand(0.018, 0.035) * c.pu * (1 - s / steps * 0.3);
            const ex = x + Math.cos(na) * nl, ey = y + Math.sin(na) * nl, col = cols[(c.r() * cols.length) | 0], lift = c.rand(0.6, 1.2);
            c.seg(x, y, ex, ey, 1.1, 0.5, (i, t, d) => {
              const z = depth * 4 + t * 2 + lift;
              if (z < shade[i] && c.A[i] > 0) return;
              shade[i] = z; c.A[i] = 1;
              c.set(i, col); c.mix(i, tip, t * t * 0.5); c.mul(i, 0.75 + 0.35 * (1 - Math.abs(d)));
              c.H[i] = z * 1.5 + (1 - d * d) * 0.6; c.Ro[i] = 0.7 + 0.2 * Math.abs(d);
            });
          }
        }
        c.seg(x - dx * steps, y - dy * steps, x, y, 1.6, 1.2, (i) => { c.set(i, hx(0x3a2a1c)); c.A[i] = 1; c.H[i] = depth * 4; });
      }
      // fill remaining gaps with shadowed needle mass so solid cones do not look empty
      const fill = c.base(2, 4, 4);
      for (let i = 0; i < n; i++) if (!c.A[i]) { c.mix(i, hx(0x15261a), sm(-0.5, 1.5, fill[i]) * 0.8); c.H[i] = -1; c.Ro[i] = 0.95; }
    } };
    GEN.foliage_birch = { s: [0.6, 0.6], bump: 0.7, alpha: true, gen(c) {
      const N = c.N, n = c.n;
      c.A = new Float32Array(n); c.fill(hx(0x1a2012)); c.Ro.fill(0.75);
      const cols = [0x7f8a48, 0x8c9450, 0x6f7c40, 0x96984e, 0xa8a050, 0x7a8444, 0xb09a42, 0x8a7a3a].map(hx);
      const vein = hx(0xb8b878), cnt = 520, depth = new Float32Array(n).fill(-1);
      // twigs first
      for (let k = 0; k < 18; k++) { const x = c.r() * N, y = c.r() * N, a = c.rand(0, TAU), l = c.rand(0.1, 0.3) * c.pu; c.seg(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 1.4, 0.8, (i) => { c.set(i, hx(0x3a2e24)); c.A[i] = 1; c.H[i] = 0; depth[i] = 0; }); }
      for (let k = 0; k < cnt; k++) {
        const x = c.r() * N, y = c.r() * N, L = c.rand(0.028, 0.05) * c.pu, W = L * c.rand(0.55, 0.7), a = c.rand(0, TAU), col = cols[(c.r() * cols.length) | 0], z = c.r(), cf = c.rand(0.8, 1.1);
        c.ell(x, y, L, W, a, (i, u, v) => {
          // ovate, pointed tip at u = +1, slightly serrated edge
          const halfw = Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.35 * Math.max(0, u)) * (0.93 + 0.07 * Math.sin(u * 40));
          if (Math.abs(v) > halfw || z < depth[i]) return;
          depth[i] = z; c.A[i] = 1; c.set(i, col);
          const rib = 1 - sm(0, 0.07, Math.abs(v)), side = Math.abs(Math.sin((u * 4 + Math.abs(v) * 3) * 3.0)) < 0.08 ? 1 : 0;
          c.mix(i, vein, rib * 0.45 + side * 0.15); c.mul(i, cf * (0.8 + 0.25 * (v / (halfw + 1e-3) * 0.5 + 0.5)));
          c.H[i] = 2 + z * 3 - v * v * 1.5 + rib * 0.3; c.Ro[i] = 0.6 + Math.abs(v) * 0.2;
        });
      }
    } };
    // -------------------------------------------------------------- wood
    GEN.wood_log = { s: [1.5, 1.5], bump: 1.2, gen(c) {
      const g = woodGrain(c, { rings: 60, warp: 1.0, knots: 4, knotR: 0.022, fibK: 28 });
      woodPaint(c, g, 0x84603e, 0x553a24, { lateK: 0.55, fibC: 0.08, lateH: 0.5, fibH: 0.3 });
      const ck = checks(c, 10, 0.15, 0.7, 0.0035), lo = c.base(0, 1, 1), fac = c.base(1, 3, 1), bk = c.base(1, 2, 3), fine = c.base(2, 4, 4);
      const grey = hx(0x6a6258), dark = hx(0x140e0a), bark = hx(0x33241a);
      for (let i = 0; i < c.n; i++) {
        c.mix(i, grey, sm(-0.3, 1.8, lo[i]) * 0.45);
        c.H[i] += fac[i] * 1.2;                                     // draw-knife facets
        c.mix(i, dark, ck[i] * 0.85); c.H[i] -= ck[i] * 4;
        if (bk[i] > 2.15) { const t = sm(2.15, 2.3, bk[i]); c.mix(i, bark, t); c.H[i] += t * (2 + fine[i]); }
        c.Ro[i] = 0.78 + ck[i] * 0.15 + lo[i] * 0.04;
      }
    } };
    GEN.wood_log_end = { s: [1, 1], bump: 1.0, tile: false, gen(c) {
      const N = c.N, n = c.n, M = c.M, sh = c.sh;
      const w = c.base(1, 1, 1), f = c.base(2, 3, 3), fine = c.base(2, 8, 8), lo = c.base(0, 1, 1);
      const pale = hx(0xa88660), ring = hx(0x6e4a2c), bark = hx(0x2e2018), dark = hx(0x1a120c), grey = hx(0x7a7468);
      const cracks = []; for (let k = 0; k < 3; k++) cracks.push([c.rand(0, TAU), c.rand(0.25, 0.42)]);
      const p1 = c.rand(0, TAU), p2 = c.rand(0, TAU), ox = c.rand(-0.03, 0.03), oy = c.rand(-0.03, 0.03);
      for (let i = 0; i < n; i++) {
        const x = (i & M) / N - 0.5, y = (i >> sh) / N - 0.5, r0 = Math.hypot(x, y), ang = Math.atan2(y, x);
        const xc = x - ox * (1 - r0 * 2), yc = y - oy * (1 - r0 * 2);            // off-centre pith
        const r = Math.hypot(xc, yc) * (1 + 0.025 * Math.sin(3 * ang + p1) + 0.012 * Math.sin(5 * ang + p2) + w[i] * 0.008) + f[i] * 0.0006;
        const ph = r * 2 * 26, late = lateOf(ph);
        c.set(i, pale); c.mix(i, ring, late * 0.7 + fine[i] * 0.04); c.mix(i, hx(0x8a5a32), (1 - sm(0.05, 0.3, r)) * 0.45);   // heartwood
        c.mix(i, grey, sm(0.15, 0.47, r0) * sm(-0.5, 1.5, lo[i]) * 0.5);
        c.H[i] = -late * 0.4 + fine[i] * 0.1 + Math.sin(x * 220 + y * 30 + w[i] * 0.5) * 0.12;   // saw marks
        c.Ro[i] = 0.86 + late * 0.06;
        let ck = 0;
        for (const cr of cracks) { const da = Math.abs(((ang - cr[0] + Math.PI * 3) % TAU) - Math.PI), wid = 0.035 * (1 - r0 / cr[1]); if (r0 < cr[1] && da < wid + 0.002 / Math.max(r0, 0.01)) ck = Math.max(ck, 1 - da / (wid + 0.002 / Math.max(r0, 0.01))); }
        if (ck > 0) { c.mix(i, dark, ck); c.H[i] -= ck * 3; }
        if (r < 0.01) c.mix(i, hx(0x5a3a22), 0.7);
        const be = 0.452 + f[i] * 0.006;
        if (r0 > be - 0.012) { const t = sm(be - 0.012, be, r0); c.mix(i, hx(0x6a4a30), t * 0.6); if (r0 > be) { const tb = sm(be, be + 0.006, r0); c.mix(i, bark, tb); c.H[i] += tb * (1.5 + f[i] * 1.5); c.Ro[i] = 0.95; } }
      }
    } };
    GEN.wood_plank = { s: [1, 1], bump: 0.8, gen(c) {
      const g = woodGrain(c, { rings: 34, warp: 1.4, knots: 2, knotR: 0.016, fibK: 40 });
      woodPaint(c, g, 0x84603f, 0x4e3220, { lateK: 0.6, fibC: 0.06, lateH: 0.25, fibH: 0.12 });
      const lo = c.base(0, 1, 1), sc = c.base(2, 1, 3);
      for (let i = 0; i < c.n; i++) { c.mul(i, 0.92 + 0.12 * clamp01(lo[i] * 0.5 + 0.5)); c.Ro[i] = 0.6 + g.late[i] * 0.08 + sm(0.5, 2, sc[i]) * 0.15 + lo[i] * 0.04; }
    } };
    GEN.wood_plank_dark = { s: [1, 1], bump: 0.8, gen(c) {
      const g = woodGrain(c, { rings: 36, warp: 1.3, knots: 2, knotR: 0.016, fibK: 40 });
      woodPaint(c, g, 0x5a3c26, 0x2a1a10, { lateK: 0.6, fibC: 0.07, lateH: 0.3, fibH: 0.15, knotCol: 0x140c08 });
      const lo = c.base(0, 1, 1), dirt = c.base(1, 2, 2), grime = hx(0x1e1812);
      for (let i = 0; i < c.n; i++) { c.mix(i, grime, sm(0.4, 2.0, dirt[i]) * 0.5); c.Ro[i] = 0.62 + sm(0.4, 2, dirt[i]) * 0.2 + lo[i] * 0.04; }
    } };
    GEN.wood_weathered = { s: [1, 1], bump: 1.8, gen(c) {
      const g = woodGrain(c, { rings: 40, warp: 1.2, knots: 3, knotR: 0.018, fibK: 24 });
      woodPaint(c, g, 0x8e897f, 0x56514a, { lateK: 0.45, fibC: 0.12, lateH: -0.9, fibH: 0.45, knotCol: 0x2a2622 });
      weatherWood(c, g);
    } };
    function weatherWood(c, g) {
      const ck = checks(c, 16, 0.08, 0.4, 0.0025), lo = c.base(0, 1, 1), lich = c.base(2, 3, 3), br = c.base(1, 1, 2);
      const brown = hx(0x5e4e3c), dark = hx(0x1a1714), lc = hx(0x8a9478), green = hx(0x4a5a3a);
      for (let i = 0; i < c.n; i++) {
        c.mix(i, brown, sm(0.4, 2, br[i]) * 0.45 * (1 - g.late[i] * 0.5));
        c.mix(i, dark, ck[i] * 0.85); c.H[i] -= ck[i] * 3;
        c.mix(i, green, sm(1.0, 2.2, lo[i]) * 0.3);
        if (lich[i] > 1.9) c.mix(i, lc, sm(1.9, 2.2, lich[i]) * 0.8);
        c.Ro[i] = 0.86 + ck[i] * 0.1 + g.late[i] * 0.04;
      }
    }
    GEN.boards_weathered = { s: [2, 2], bump: 1.8, gen(c) {
      const N = c.N, sh = c.sh, bw = Math.round(0.2 * c.pv);
      const nb = Math.max(1, Math.round(N / bw)), bpx = N / nb;
      const g = woodGrain(c, { rings: 80, warp: 1.2, knots: 6, knotR: 0.018, fibK: 24 });
      // per-board grain shift: offset phase by board index
      for (let i = 0; i < c.n; i++) { const b = Math.floor((i >> sh) / bpx); g.late[i] = lateOf(g.phase[i] + b * 3.37 + ihash(b, 3) * 0.5); }
      woodPaint(c, g, 0x8e897f, 0x56514a, { lateK: 0.45, fibC: 0.12, lateH: -0.9, fibH: 0.45, knotCol: 0x2a2622 });
      weatherWood(c, g);
      const dark = hx(0x0e0c0a);
      for (let i = 0; i < c.n; i++) {
        const y = i >> sh, b = Math.floor(y / bpx), ly = y - b * bpx, tint = 0.88 + ihash(b, 9) * 0.22;
        c.mul(i, tint);
        const gap = 1 - sm(0, 2.2, ly), lip = sm(bpx - 6, bpx, ly);      // gap at the bottom, overlap shadow at top
        c.mix(i, dark, gap); c.H[i] -= gap * 6 + lip * 1.5; c.mul(i, 1 - lip * 0.3);
      }
    } };
    GEN.wood_plank_floor = { s: [2, 2], bump: 1.0, gen(c) {
      const N = c.N, sh = c.sh, M = c.M, nb = 14, bpx = N / nb;
      const g = woodGrain(c, { rings: 110, warp: 1.6, knots: 8, knotR: 0.012, fibK: 40 });
      // board segments with end joints
      const joints = []; for (let b = 0; b < nb; b++) { const j = []; let x = c.r() * N * 0.5; while (x < N) { j.push(x); x += c.rand(0.8, 1.6) * c.pu; } joints.push(j); }
      const seg = new Float32Array(c.n), jd = new Float32Array(c.n);
      for (let i = 0; i < c.n; i++) {
        const x = i & M, y = i >> sh, b = Math.floor(y / bpx), J = joints[b];
        let s = 0, d = 1e9; for (let k = 0; k < J.length; k++) { if (x >= J[k]) s = k + 1; d = Math.min(d, Math.abs(x - J[k]), Math.abs(x - J[k] + N), Math.abs(x - J[k] - N)); }
        if (s === J.length) s = 0;
        seg[i] = ihash(b * 31 + s, 5); jd[i] = d;
        g.late[i] = lateOf(g.phase[i] + seg[i] * 17.3);
      }
      woodPaint(c, g, 0x8a6240, 0x4a301c, { lateK: 0.55, fibC: 0.06, lateH: 0.25, fibH: 0.1 });
      const wear = c.base(0, 1, 1), dirt = c.base(1, 2, 2), scr = c.base(2, 4, 1), gapc = hx(0x0c0806), worn = hx(0x9a7a58), grime = hx(0x2a2016);
      for (let i = 0; i < c.n; i++) {
        const y = i >> sh, b = Math.floor(y / bpx), ly = y - b * bpx;
        c.mul(i, 0.8 + seg[i] * 0.3);
        const edge = Math.min(ly, bpx - ly), gap = 1 - sm(0.3, 1.8, Math.min(edge, jd[i]));
        const bevel = 1 - sm(1.5, 5, Math.min(edge, jd[i]));
        c.mix(i, worn, sm(0.3, 1.8, wear[i]) * 0.3);
        c.mix(i, grime, sm(0.0, 1.8, dirt[i]) * 0.35 + bevel * 0.4);
        c.mix(i, gapc, gap);
        c.H[i] -= gap * 4 + bevel * 0.8 - scr[i] * 0.05;
        c.Ro[i] = 0.5 + sm(0.3, 1.8, wear[i]) * 0.2 + gap * 0.4 + sm(1, 2.5, scr[i]) * 0.08;
      }
      // nails: pairs at joints and every ~0.6 m
      for (let b = 0; b < nb; b++) {
        const yc = (b + 0.5) * bpx, xs = joints[b].slice();
        for (let x = c.r() * 0.3 * c.pu; x < N; x += 0.6 * c.pu) xs.push(x);
        xs.forEach((x0) => { for (const s of [-1, 1]) { const x = x0 + s * 0.02 * c.pu, y = yc + s * bpx * 0.25; c.ell(x, y, 0.004 * c.pu + 0.8, 0.004 * c.pv + 0.8, 0, (i, u, v) => { const d = u * u + v * v; c.set(i, hx(0x1e1a18)); c.mix(i, hx(0x4a4440), 1 - d); c.H[i] += 0.3 * (1 - d); c.Ro[i] = 0.45; }); } });
      }
    } };
    GEN.wood_painted = { s: [1, 1], bump: 1.2, gen(c) {
      const g = woodGrain(c, { rings: 40, warp: 1.2, knots: 1, fibK: 30 });
      woodPaint(c, g, 0x8a857c, 0x56514a, { lateK: 0.5, fibC: 0.1, lateH: -0.7, fibH: 0.4 });
      const chip = c.base(1, 2, 4), chip2 = c.base(2, 4, 12), w = c.worley(40, 40, 1, null, null, 0), lo = c.base(0, 1, 1);
      const paint = hx(0xcfcabd), paintD = hx(0xa8a294), dirt = hx(0x5a5044);
      for (let i = 0; i < c.n; i++) {
        const p = chip[i] + chip2[i] * 0.35, cover = 1 - sm(1.6, 1.68, p);
        const crack = (1 - sm(0, 1.2, w.f2[i] - w.f1[i])) * sm(0.6, 1.3, p);
        if (cover > 0) {
          c.mix(i, paint, cover); c.mix(i, paintD, clamp01(g.late[i] * 0.2 + lo[i] * 0.1 + 0.2) * cover * 0.6); c.mix(i, dirt, sm(0.5, 2, lo[i]) * 0.3 * cover);
          c.H[i] = c.H[i] * 0.25 + cover * 0.8 + (p > 1.3 ? 0.4 : 0) - crack * 0.6;
          c.mix(i, hx(0x6a645a), crack * 0.5);
          c.Ro[i] = lerp(0.88, 0.55 + lo[i] * 0.05, cover);
        } else c.Ro[i] = 0.88;
      }
    } };
    GEN.log_wall = { s: [2, 1.2], bump: 1.0, param: 'spacing', gen(c, p) {
      const N = c.N, sh = c.sh, nL = Math.round(c.sv / p.spacing), Lpx = N / nL, chW = 0.045 * c.pv;
      const g = woodGrain(c, { rings: 90, warp: 1.0, knots: 6, knotR: 0.02, fibK: 28 });
      for (let i = 0; i < c.n; i++) { const b = Math.floor((i >> sh) / Lpx); g.late[i] = lateOf(g.phase[i] + b * 5.71); }
      woodPaint(c, g, 0x7e5a3a, 0x50361f, { lateK: 0.5, fibC: 0.08, lateH: 0.5, fibH: 0.3 });
      const ck = checks(c, 12, 0.15, 0.8, 0.003), lo = c.base(0, 1, 1), chf = c.base(2, 4, 4), chl = c.base(1, 2, 6);
      const grey = hx(0x6a6258), dark = hx(0x140e0a), chink = hx(0x9c8e78), chinkD = hx(0x6e6252);
      for (let i = 0; i < c.n; i++) {
        const y = i >> sh, b = Math.floor(y / Lpx), ly = y - b * Lpx, dEdge = Math.min(ly, Lpx - ly);
        const isCh = 1 - sm(chW * 0.5 - 1, chW * 0.5 + 1, dEdge + chl[i] * 1.5);
        const t = clamp01((ly - chW * 0.35) / (Lpx - chW * 0.7)), prof = Math.sqrt(Math.max(0, 1 - (2 * t - 1) * (2 * t - 1)));
        c.mul(i, 0.85 + ihash(b, 4) * 0.25);
        c.mix(i, grey, sm(-0.3, 1.8, lo[i]) * 0.4);
        c.mix(i, dark, ck[i] * 0.85);
        c.mul(i, 0.55 + 0.45 * Math.pow(prof, 0.6));
        c.H[i] = prof * 40 + c.H[i] - ck[i] * 4;
        c.Ro[i] = 0.8 + ck[i] * 0.15;
        if (isCh > 0) { c.mix(i, chink, isCh); c.mix(i, chinkD, isCh * sm(-0.5, 1.5, chf[i]) * 0.5); c.H[i] = lerp(c.H[i], 4 + chf[i] * 0.8, isCh); c.Ro[i] = lerp(c.Ro[i], 0.97, isCh); }
      }
    } };
    // -------------------------------------------------------------- roof / walls
    GEN.roof_shingle = { s: [1, 1], bump: 1.4, gen(c) {
      const N = c.N, sh = c.sh, M = c.M, nRows = 5, rh = N / nRows;
      const fibre = c.base(2, 24, 1), fib2 = c.base(2, 8, 1), lo = c.base(0, 1, 1), moss = c.base(1, 2, 2), fine = c.base(2, 4, 4);
      const rows = [];
      for (let r = 0; r < nRows; r++) { const xs = []; let x = c.r() * N * 0.2; const x0 = x; while (x < x0 + N) { xs.push(x); x += c.rand(0.08, 0.22) * c.pu; } rows.push({ xs, x0 }); }
      const A = hx(0x524a42), B = hx(0x34302c), C2 = hx(0x463c34), gapc = hx(0x0a0908), mc = hx(0x2e3a22), lc = hx(0x7e8670);
      for (let i = 0; i < c.n; i++) {
        const x = i & M, y = i >> sh, r = Math.floor(y / rh), ly = (y - r * rh) / rh, R = rows[r];
        let xx = x; if (xx < R.x0) xx += N;
        let k = 0; while (k + 1 < R.xs.length && xx >= R.xs[k + 1]) k++;
        const left = R.xs[k], right = k + 1 < R.xs.length ? R.xs[k + 1] : R.x0 + N, de = Math.min(xx - left, right - xx);
        const sid = ihash(r * 97 + k, 11), gap = 1 - sm(0.6, 2.4 + sid * 2, de);
        c.set(i, A); c.mix(i, B, clamp01(sid * 0.8 + fib2[i] * 0.15)); c.mix(i, C2, sm(0, 2, lo[i]) * 0.4);
        c.mul(i, 0.85 + 0.2 * clamp01(fibre[i] * 0.3 + 0.5));
        const shadow = sm(0.78, 1, ly);                                      // under the butt of the row above
        c.mul(i, 1 - shadow * 0.45);
        const mz = moss[i] + fine[i] * 0.4 + (1 - ly) * 0.6 - 0.9;
        c.mix(i, mc, sm(0.6, 1.6, mz) * 0.85);
        c.mix(i, lc, sm(1.8, 2.3, fine[i] + lo[i] * 0.5) * 0.35);
        c.mix(i, gapc, gap);
        c.H[i] = (1 - ly) * 9 + fibre[i] * 0.7 + fib2[i] * 0.4 + sid * 2 - gap * 6 - (ly < 0.015 ? 0 : 0);
        c.Ro[i] = 0.86 + fibre[i] * 0.03 + gap * 0.1;
      }
    } };
    GEN.chinking = { s: [0.6, 0.6], bump: 1.0, gen(c) {
      const lo = c.base(0, 1, 1), mid = c.base(1, 2, 2), fine = c.base(2, 8, 8), sw = c.base(1, 3, 1), w = c.worley(9, 9, 1, mid, lo, c.N * 0.03);
      const A = hx(0xa3957e), D = hx(0x7a6c58), dark = hx(0x2a241e), speck = c.white();
      for (let i = 0; i < c.n; i++) {
        c.set(i, A); c.mix(i, D, sm(-1, 2, lo[i] + fine[i] * 0.3) * 0.7);
        const crack = (1 - sm(0, 1.4, w.f2[i] - w.f1[i])) * sm(0.6, 1.4, mid[i]);
        c.mix(i, dark, crack * 0.8);
        c.H[i] = sw[i] * 1.2 + mid[i] * 0.6 + fine[i] * 0.25 - crack * 1.5;
        if (speck[i] > 0.993) { c.mix(i, dark, 0.6); c.H[i] += 0.4; }
        else if (speck[i] < 0.004) { c.mix(i, hx(0xc8b888), 0.6); }
        c.Ro[i] = 0.95;
      }
    } };
    GEN.plaster = { s: [1, 1], bump: 0.8, gen(c) {
      const lo = c.base(0, 1, 1), mid = c.base(1, 2, 2), fine = c.base(2, 8, 8), st = c.base(1, 1, 1), w = c.worley(6, 6, 1, mid, lo, c.N * 0.05);
      const A = hx(0xbab2a2), D = hx(0x958c7c), stain = hx(0x8a7458), dark = hx(0x403a32);
      for (let i = 0; i < c.n; i++) {
        c.set(i, A); c.mix(i, D, sm(-1, 2.2, lo[i] + fine[i] * 0.2) * 0.6);
        const s = st[i]; c.mix(i, stain, sm(1.1, 1.6, s) * 0.45); c.mix(i, hx(0x6a5a44), (sm(1.45, 1.55, s) - sm(1.55, 1.7, s)) * 0.35);
        const crack = (1 - sm(0, 1.0, w.f2[i] - w.f1[i])) * sm(0.9, 1.6, mid[i]);
        c.mix(i, dark, crack * 0.7);
        c.H[i] = lo[i] * 2 + mid[i] * 0.6 + fine[i] * 0.2 - crack * 0.8;
        c.Ro[i] = 0.9 + fine[i] * 0.02;
      }
    } };
    GEN.wallpaper = { s: [0.53, 0.53], bump: 0.4, gen(c) {
      const N = c.N, M = c.M, sh = c.sh, lo = c.base(0, 1, 1), fine = c.base(2, 8, 8), st = c.base(1, 1, 1), fib = c.base(2, 16, 16);
      const bg = hx(0x8e8b6c), stripe = hx(0xa8a282), motif = hx(0x5e5d46), motif2 = hx(0x7a5a48), yellow = hx(0x9a8a58), stain = hx(0x7a6444);
      for (let i = 0; i < c.n; i++) {
        const x = (i & M) / N, y = (i >> sh) / N;
        c.set(i, bg);
        const sx = (x * 6) % 1; if (sx > 0.42 && sx < 0.58) c.mix(i, stripe, 0.35);
        if (Math.abs(sx - 0.42) < 0.008 || Math.abs(sx - 0.58) < 0.008) c.mix(i, motif, 0.5);
        // floral medallion lattice (diamond)
        for (const o of [[0, 0], [0.5, 0.5]]) {
          let u = ((x * 3 + o[0]) % 1) - 0.5, v = ((y * 3 + o[1]) % 1) - 0.5;
          const r = Math.hypot(u, v), a = Math.atan2(v, u), petal = 0.13 + 0.06 * Math.cos(a * 5);
          if (r < petal) c.mix(i, motif, 0.45 * sm(petal, petal - 0.02, r));
          if (r < 0.04) c.mix(i, motif2, 0.4);
          const lv = Math.abs(v) < 0.012 && Math.abs(u) > 0.2 && Math.abs(u) < 0.32; if (lv) c.mix(i, motif, 0.3);
        }
        c.mix(i, yellow, sm(-1, 2, lo[i]) * 0.45);
        const s = st[i]; c.mix(i, stain, sm(1.2, 1.7, s) * 0.55); c.mix(i, hx(0x5a4630), (sm(1.6, 1.68, s) - sm(1.68, 1.8, s)) * 0.5);
        c.mul(i, 0.95 + fib[i] * 0.02);
        const seam = Math.min(i & M, N - (i & M)); const sd = 1 - sm(0, 3, seam);
        c.mix(i, hx(0x3a3424), sd * 0.6);
        c.H[i] = fine[i] * 0.08 + fib[i] * 0.05 + (seam < 8 && seam > 2 ? 0.4 : 0);
        c.Ro[i] = 0.82 + fine[i] * 0.03;
      }
    } };
    GEN.brick = { s: [1.05, 0.975], bump: 1.6, gen(c) {
      const N = c.N, M = c.M, sh = c.sh, rows = 13, cols = 5, rh = N / rows, cw = N / cols, mort = 0.01 * c.pv;
      const lo = c.base(0, 1, 1), fine = c.base(2, 8, 8), mid = c.base(1, 4, 4), soot = c.base(0, 1, 2);
      const cols3 = [0x7a3a2a, 0x6a3024, 0x84442e, 0x5e2c22, 0x8a4a34].map(hx), mortar = hx(0x8a8478), black = hx(0x1a1614);
      for (let i = 0; i < c.n; i++) {
        const x = i & M, y = i >> sh, r = Math.floor(y / rh), off = (r & 1) * cw * 0.5;
        const xx = (x + off) % N, k = Math.floor(xx / cw), lx = xx - k * cw, ly = y - r * rh;
        const e = Math.min(lx, cw - lx, ly, rh - ly) + mid[i] * 1.2, id = ihash(r * 17 + k, 2);
        const inB = sm(mort * 0.5, mort * 0.5 + 1.5, e);
        c.set(i, cols3[(id * cols3.length) | 0]); c.mul(i, 0.85 + 0.25 * clamp01(fine[i] * 0.3 + 0.5) + lo[i] * 0.04);
        c.mix(i, black, sm(0.6, 2.2, soot[i]) * 0.5);
        c.mix(i, mortar, 1 - inB);
        c.H[i] = inB * (6 + sm(0, 6, e) * 2) + fine[i] * 0.3 + mid[i] * 0.4;
        c.Ro[i] = 0.85 + (1 - inB) * 0.1;
      }
    } };
    GEN.stone_wall = { s: [1.5, 1.5], bump: 1.3, gen(c) {
      const N = c.N, wx = c.base(0, 2, 2), wy = c.base(1, 2, 2), w = c.worley(7, 6, 0.75, wx, wy, N * 0.025);
      const lo = c.base(0, 1, 1), fine = c.base(2, 6, 6), mid = c.base(1, 4, 4), sp = c.white(), moss = c.base(1, 2, 2);
      const pal = [0x676a6e, 0x5c5e62, 0x6e6a64, 0x585b60, 0x74716b, 0x625d56].map(hx), mortar = hx(0x5e5a52), gap = hx(0x1a1816), mc = hx(0x3a4a2c);
      const mw = N * 0.016, cell = N / 7;
      for (let i = 0; i < c.n; i++) {
        const e = w.f2[i] - w.f1[i] + fine[i] * 1.5 + mid[i] * 2, id = ihash(w.id[i], 13);
        const inS = sm(mw, mw + 2.5, e), dome = Math.sqrt(sm(mw, cell * 0.45, e));
        c.set(i, pal[(id * pal.length) | 0]); c.mul(i, 0.88 + 0.2 * clamp01(mid[i] * 0.3 + 0.5) + fine[i] * 0.03);
        if (sp[i] > 0.985) c.mul(i, 1.2); else if (sp[i] < 0.012) c.mul(i, 0.7);
        c.mul(i, 0.72 + 0.28 * dome);
        const m = 1 - inS; c.mix(i, mortar, m); c.mix(i, gap, m * sm(mw * 0.7, 0, e) * 0.8);
        c.mix(i, mc, sm(1.1, 2.0, moss[i] + fine[i] * 0.4) * (0.35 + m * 0.5));
        c.H[i] = inS * (dome * (14 + id * 8) + mid[i] * 1.5 + fine[i] * 0.5) + m * (fine[i] * 0.3 - 3);
        c.Ro[i] = 0.84 + m * 0.12;
      }
    } };
    // -------------------------------------------------------------- ground
    GEN.snow = { s: [3, 3], bump: 1.0, gen(c) {
      const dune = c.base(0, 1, 1), rip = c.base(1, 1, 4), rip2 = c.base(1, 2, 7), grain = c.base(2, 8, 8), g2 = c.base(2, 16, 16), sp = c.white();
      const ripW = c.warp(rip, dune, rip2, c.N * 0.02);
      const A = hx(0xe9eef4), blue = hx(0xc2d0e2), grey = hx(0xd4d8dc);
      for (let i = 0; i < c.n; i++) {
        const h = dune[i] * 18 + ripW[i] * 1.2 + grain[i] * 0.2 + g2[i] * 0.08;
        c.H[i] = h; c.set(i, A);
        c.mix(i, blue, sm(5, -30, h) * 0.4); c.mix(i, grey, sm(0.5, 2.5, grain[i]) * 0.2);
        let r = 0.7 + g2[i] * 0.04 + grain[i] * 0.03;
        if (sp[i] > 0.9965) { r = 0.08; c.H[i] += 0.4; c.mul(i, 1.06); }
        c.Ro[i] = r;
      }
      // occasional debris (needles, bits of bark)
      for (let k = 0; k < 7; k++) { const x = c.r() * c.N, y = c.r() * c.N, a = c.rand(0, TAU), l = c.rand(0.01, 0.025) * c.pu; c.seg(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 0.7, 0.5, (i) => { c.mix(i, hx(0x5a4a3a), 0.35); c.Ro[i] = 0.9; }); }
    } };
    GEN.snow_trail = { s: [2, 2], bump: 1.0, gen(c) {
      const N = c.N, lo = c.base(0, 1, 1), st = c.base(1, 1, 3), grain = c.base(2, 8, 8), ice = c.base(1, 2, 2), sp = c.white();
      const A = hx(0xd6dade), dirt = hx(0x7a6a5a), dark = hx(0x5a4e44), iceC = hx(0xb4c0cc);
      for (let i = 0; i < c.n; i++) {
        c.H[i] = lo[i] * 8 + grain[i] * 0.4; c.set(i, A);
        c.mix(i, dirt, sm(0.6, 2.2, st[i] + lo[i] * 0.3) * 0.22); c.mix(i, dark, sm(1.8, 2.6, st[i]) * 0.2);
        const ic = sm(1.0, 1.4, ice[i]); c.mix(i, iceC, ic * 0.6);
        c.Ro[i] = lerp(0.62 + grain[i] * 0.04, 0.18, ic);
        if (sp[i] > 0.997 && ic < 0.5) c.Ro[i] = 0.12;
      }
      // compacted boot prints along u
      for (let k = 0; k < 34; k++) {
        const x = c.r() * N, y = c.r() * N, a = c.rand(-0.3, 0.3) + (c.r() < 0.5 ? 0 : Math.PI), L = 0.15 * c.pu, W = 0.055 * c.pv;
        c.ell(x, y, L, W * (1 + 0.15 * c.r()), a, (i, u, v) => { const d = u * u + v * v * (u < -0.3 ? 1.3 : 1), depth = sm(1, 0.2, d); c.H[i] -= depth * 6; c.mul(i, 1 - depth * 0.1); c.Ro[i] = lerp(c.Ro[i], 0.45, depth); });
      }
    } };
    GEN.dirt = { s: [2, 2], bump: 1.3, gen(c) {
      const N = c.N, lo = c.base(0, 1, 1), mid = c.base(1, 2, 2), fine = c.base(2, 8, 8), w = c.worley(90, 90, 1, null, null, 0), peb = c.worley(30, 30, 1, null, null, 0);
      const A = hx(0x4e3d2e), D = hx(0x2e241a), L = hx(0x6a5642), grey = hx(0x6e6a64);
      for (let i = 0; i < c.n; i++) {
        const clod = sm(0, w.cw * 0.5, w.f2[i] - w.f1[i]);
        c.set(i, A); c.mix(i, D, sm(-0.5, 1.8, lo[i] + mid[i] * 0.4) * 0.6); c.mix(i, L, sm(0.5, 2, fine[i]) * 0.3 * clod);
        c.H[i] = lo[i] * 6 + mid[i] * 2 + clod * 1.5 + fine[i] * 0.3;
        c.Ro[i] = 0.92 - sm(0.5, 2, -lo[i]) * 0.12;
        c.mul(i, 0.85 + ihash(w.id[i], 1) * 0.3);
        const pid = ihash(peb.id[i], 3), ps = ihash(peb.id[i], 9), pr = peb.cw * (0.08 + ps * 0.3);
        if (pid > 0.86 && peb.f1[i] < pr) { const t = 1 - peb.f1[i] / pr; c.set(i, grey); c.mul(i, (0.45 + ps * 0.5 + fine[i] * 0.05) * (0.6 + 0.4 * Math.sqrt(t))); c.H[i] += Math.sqrt(t) * (2 + ps * 4); c.Ro[i] = 0.7; }
      }
      litter(c, 260, 0.02, 0.05, [0x6a4a2a, 0x5a3e24, 0x7a5a36], 0.8);
      litter(c, 14, 0.08, 0.2, [0x3a2a1e, 0x2e2218], 1.6);
    } };
    function litter(c, count, l0, l1, cols, rad) {
      const N = c.N, C = cols.map(hx);
      for (let k = 0; k < count; k++) {
        const x = c.r() * N, y = c.r() * N, a = c.rand(0, TAU), l = c.rand(l0, l1) * c.pu, col = C[(c.r() * C.length) | 0], z = c.rand(0.5, 1.5);
        c.seg(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, rad, rad * 0.8, (i, t, d) => { c.set(i, col); c.mul(i, 0.8 + 0.3 * (1 - Math.abs(d))); c.H[i] += (1 - d * d) * rad * z * 0.8; c.Ro[i] = 0.8; });
      }
    }
    GEN.forest_floor = { s: [2, 2], bump: 1.2, gen(c) {
      const lo = c.base(0, 1, 1), mid = c.base(1, 2, 2), fine = c.base(2, 8, 8), moss = c.base(1, 2, 2), snow = c.base(0, 2, 2), f2 = c.base(2, 16, 16);
      const A = hx(0x3e2e20), D = hx(0x22180f), mc = hx(0x3e5230), mt = hx(0x6a7a40), sc = hx(0xc8d0da);
      for (let i = 0; i < c.n; i++) { c.set(i, A); c.mix(i, D, sm(-0.5, 1.8, lo[i] + mid[i] * 0.5) * 0.6); c.H[i] = lo[i] * 8 + mid[i] * 2 + fine[i] * 0.3; c.Ro[i] = 0.9; }
      litter(c, 7000, 0.025, 0.045, [0x5e4028, 0x52381f, 0x6a4a2c, 0x46301c, 0x3e2c1c], 0.55);
      litter(c, 24, 0.1, 0.3, [0x2e2218, 0x3a2a1e], 2.2);
      for (let i = 0; i < c.n; i++) {
        const m = moss[i] + fine[i] * 0.5 + f2[i] * 0.25;
        if (m > 1.1) { const t = sm(1.1, 1.6, m); c.mix(i, mc, t * 0.75); c.mix(i, mt, t * sm(0.5, 2, f2[i]) * 0.5); c.H[i] = lerp(c.H[i], lo[i] * 8 + 3 + fine[i] + f2[i] * 0.4, t); c.Ro[i] = 0.95; }
        const s = snow[i] + fine[i] * 0.5 + f2[i] * 0.2;
        if (s > 2.0) { const t = sm(2.0, 2.4, s); c.mix(i, sc, t * 0.7); c.H[i] += t * 2.5; c.Ro[i] = lerp(c.Ro[i], 0.7, t); }
      }
    } };
    GEN.mud = { s: [2, 2], bump: 1.2, gen(c) {
      const N = c.N, lo = c.base(0, 1, 1), mid = c.base(1, 2, 3), fine = c.base(2, 8, 8), rut = c.base(1, 1, 6);
      const A = hx(0x3a3024), D = hx(0x1e1a14), water = hx(0x22252a), L = hx(0x54483a);
      for (let i = 0; i < c.n; i++) {
        let h = lo[i] * 14 + mid[i] * 4 + Math.abs(rut[i]) * 5 + fine[i] * 0.5;
        c.set(i, A); c.mix(i, D, sm(-0.5, 1.5, -lo[i]) * 0.6); c.mix(i, L, sm(0.8, 2, mid[i] + fine[i] * 0.3) * 0.35);
        let r = 0.55 - sm(-0.5, -1.5, lo[i]) * 0.25 + fine[i] * 0.04;
        const lvl = -17;
        if (h < lvl) { const t = sm(lvl, lvl - 2, h); h = lerp(h, lvl, t); c.mix(i, water, t * 0.6); r = lerp(r, 0.06, t); }
        c.H[i] = h; c.Ro[i] = r;
      }
      for (let k = 0; k < 10; k++) { const x = c.r() * N, y = c.r() * N, a = c.rand(0, TAU); c.ell(x, y, 0.14 * c.pu, 0.05 * c.pv, a, (i, u, v) => { const d = u * u + v * v; c.H[i] -= sm(1, 0.5, d) * 8; c.Ro[i] = Math.min(c.Ro[i], 0.3); }); }
    } };
    GEN.ash = { s: [1, 1], bump: 1.2, gen(c) {
      const lo = c.base(0, 1, 1), mid = c.base(1, 2, 2), fine = c.base(2, 8, 8), w = c.worley(20, 20, 1, mid, lo, c.N * 0.01), cr = c.worley(40, 26, 0.5, null, null, 0), sp = c.white();
      const A = hx(0x5a5754), D = hx(0x2e2c2a), W = hx(0x9a9894), char = hx(0x1c1a18);
      for (let i = 0; i < c.n; i++) {
        c.set(i, A); c.mix(i, D, sm(-0.8, 1.6, lo[i] + fine[i] * 0.3) * 0.7); c.mix(i, W, sm(1.0, 2.2, mid[i] + fine[i] * 0.5) * 0.5);
        c.H[i] = lo[i] * 4 + mid[i] * 1.5 + fine[i] * 0.3; c.Ro[i] = 0.97;
        const id = ihash(w.id[i], 21);
        if (id > 0.8) {
          const e = w.f2[i] - w.f1[i], inC = sm(1, 5, e);
          if (inC > 0) { const ck = 1 - sm(0, 1.2, cr.f2[i] - cr.f1[i]); c.mix(i, char, inC * (0.85 + fine[i] * 0.05)); c.mul(i, 1 + ck * -0.4 + (id - 0.8) * 0.8); c.mix(i, A, inC * sm(0.5, 2.2, fine[i]) * 0.5); c.H[i] += inC * (6 + ck * -2.5); c.Ro[i] = lerp(c.Ro[i], 0.55 + ck * 0.3, inC); }
        }
        if (sp[i] > 0.995) c.mix(i, hx(0xc8c6c0), 0.7);
      }
    } };
    GEN.rock = { s: [2, 2], bump: 1.5, gen(c) { rockBase(c); } };
    function rockBase(c) {
      const N = c.N, lo = c.base(0, 1, 1), mid = c.base(1, 2, 2), fine = c.base(2, 6, 6), f2 = c.base(2, 16, 16), streak = c.base(1, 6, 1), sp = c.white();
      const w = c.worley(5, 5, 1, mid, lo, N * 0.06), wf = c.worley(14, 14, 1, mid, fine, N * 0.02);
      const A = hx(0x646a74), D = hx(0x3e434a), warm = hx(0x6e665c), L = hx(0x9a9ea4), dk = hx(0x22252a), lc = hx(0x8c9a84);
      for (let i = 0; i < c.n; i++) {
        const ridge = 1 - Math.abs(mid[i]) * 0.6;
        const crack = (1 - sm(0, 2.5, w.f2[i] - w.f1[i])) * sm(-0.3, 0.6, lo[i] + 0.3), crack2 = (1 - sm(0, 1.2, wf.f2[i] - wf.f1[i])) * sm(0.4, 1.2, fine[i]);
        c.set(i, A); c.mix(i, D, sm(-1.5, 1.5, -lo[i] + fine[i] * 0.3) * 0.6); c.mix(i, warm, sm(0.6, 2, mid[i]) * 0.4);
        if (sp[i] > 0.975) c.mix(i, L, 0.55); else if (sp[i] < 0.03) c.mix(i, dk, 0.5);
        c.mul(i, 0.95 + f2[i] * 0.04);
        c.mix(i, dk, sm(0.8, 2.2, streak[i]) * 0.25);                   // rain staining
        c.mix(i, dk, crack * 0.85 + crack2 * 0.4);
        if (fine[i] + lo[i] * 0.5 > 2.1) c.mix(i, lc, 0.6);
        c.H[i] = lo[i] * 30 + ridge * 8 + fine[i] * 2 + f2[i] * 0.4 - crack * 10 - crack2 * 2;
        c.Ro[i] = 0.82 + crack * 0.1 + f2[i] * 0.03;
      }
    }
    GEN.rock_lichen = { s: [2, 2], bump: 1.5, gen(c) {
      rockBase(c);
      const lm = c.base(1, 3, 3), lf = c.base(2, 12, 12), lt = c.base(0, 2, 2), fine = c.base(2, 6, 6), moss = c.base(1, 2, 2);
      const pale = hx(0x8e9882), yel = hx(0x9c9c6a), org = hx(0x9a6a3a), mc = hx(0x3e5a30);
      for (let i = 0; i < c.n; i++) {
        const v = lm[i] + lf[i] * 0.55;
        if (v > 0.8) {
          const t = sm(0.8, 1.0, v), col = lt[i] > 0.9 ? yel : pale;
          c.mix(i, col, t * (0.6 + 0.25 * clamp01(lf[i] * 0.5 + 0.5))); c.mul(i, 1 - sm(1.3, 1.6, v) * 0.15);
          if (lt[i] < -1.6) c.mix(i, org, t * 0.6);
          c.H[i] += t * 0.6; c.Ro[i] = 0.95;
        }
        const m = moss[i] + fine[i] * 0.4;
        if (m > 1.3) { const t = sm(1.3, 1.7, m); c.mix(i, mc, t * 0.9); c.H[i] += t * (3 + fine[i] * 1.5); c.Ro[i] = lerp(c.Ro[i], 0.97, t); }
      }
    } };
    GEN.gravel = { s: [1, 1], bump: 1.4, gen(c) {
      const lo = c.base(0, 1, 1), fine = c.base(2, 8, 8), mid = c.base(1, 3, 3);
      const big = c.worley(22, 22, 1, mid, lo, c.N * 0.004), small = c.worley(56, 56, 1, null, null, 0);
      const pal = [0x7a766e, 0x6a6660, 0x8a847a, 0x5a5650, 0x9a948a, 0x6e6254, 0x4e4a46].map(hx), soil = hx(0x2a241e);
      for (let i = 0; i < c.n; i++) {
        c.set(i, soil); c.mul(i, 0.8 + fine[i] * 0.06); c.H[i] = fine[i] * 0.3 - 2; c.Ro[i] = 0.95;
        const id1 = ihash(big.id[i], 5), r1 = big.cw * (0.42 + 0.22 * ihash(big.id[i], 8));
        if (id1 > 0.1 && big.f1[i] < r1) {
          const t = 1 - big.f1[i] / r1, dome = Math.sqrt(t), sep = sm(0, 1.6, big.f2[i] - big.f1[i]);
          c.set(i, pal[(id1 * 7) | 0]); c.mul(i, (0.55 + 0.45 * dome + fine[i] * 0.04) * (0.5 + 0.5 * sep));
          c.H[i] = dome * (5 + id1 * 5) * sep + fine[i] * 0.25; c.Ro[i] = 0.62 + id1 * 0.25;
          continue;
        }
        const id2 = ihash(small.id[i], 6), r2 = small.cw * (0.3 + 0.25 * ihash(small.id[i], 3));
        if (id2 > 0.2 && small.f1[i] < r2) { const t = 1 - small.f1[i] / r2; c.set(i, pal[(id2 * 7) | 0]); c.mul(i, 0.45 + 0.4 * Math.sqrt(t)); c.H[i] = Math.sqrt(t) * 2 - 1.5; c.Ro[i] = 0.8; }
      }
    } };
    GEN.ice = { s: [3, 3], bump: 0.6, gen(c) {
      const N = c.N, lo = c.base(0, 1, 1), mid = c.base(1, 2, 2), fine = c.base(2, 6, 6), frost = c.base(1, 2, 2), sp = c.white();
      const w = c.worley(6, 6, 1, mid, lo, N * 0.04), w2 = c.worley(18, 18, 1, fine, mid, N * 0.01);
      const A = hx(0xa9c8da), deep = hx(0x4e6c84), white = hx(0xe2ecf2), fr = hx(0xd0dce6);
      for (let i = 0; i < c.n; i++) {
        c.set(i, A); c.mix(i, deep, sm(-0.5, 1.8, lo[i]) * 0.55);
        const cr = 1 - sm(0, 1.2, w.f2[i] - w.f1[i]), cr2 = (1 - sm(0, 0.8, w2.f2[i] - w2.f1[i])) * sm(0, 1, mid[i]);
        c.mix(i, white, cr * 0.75 + cr2 * 0.4);
        const f = sm(0.8, 1.8, frost[i] + fine[i] * 0.4); c.mix(i, fr, f * 0.8);
        if (sp[i] > 0.998) c.mix(i, white, 0.7);
        c.H[i] = mid[i] * 0.8 + f * 1.2 + fine[i] * 0.1 * f - cr * 0.6;
        c.Ro[i] = lerp(0.06 + Math.abs(fine[i]) * 0.02, 0.65, f) + cr * 0.2;
      }
    } };
    GEN.moss = { s: [0.5, 0.5], bump: 1.4, gen(c) {
      const lo = c.base(0, 1, 1), fine = c.base(2, 8, 8), fib = c.base(2, 32, 32), cush = c.worley(16, 16, 1, lo, fine, c.N * 0.01), sub = c.worley(70, 70, 1, null, null, 0), sp = c.white();
      const A = hx(0x3e6c3e), tip = hx(0x86a24a), dark = hx(0x172414), brown = hx(0x5a5432);
      for (let i = 0; i < c.n; i++) {
        const d = Math.sqrt(sm(0, cush.cw * 0.5, cush.f2[i] - cush.f1[i])), s = sm(0, sub.cw * 0.5, sub.f2[i] - sub.f1[i]);
        c.set(i, A); c.mix(i, brown, sm(0.6, 2, lo[i]) * 0.5); c.mix(i, tip, (d * 0.5 + s * 0.3 + fib[i] * 0.12) * 0.7); c.mix(i, dark, (1 - d) * 0.7 + (1 - s) * 0.25);
        c.H[i] = d * 8 + s * 1.5 + fib[i] * 0.4;
        if (sp[i] > 0.9985) { c.set(i, hx(0x8a3a22)); c.H[i] += 1.5; }
        c.Ro[i] = 0.95;
      }
    } };
    GEN.grass_dry = { s: [0.6, 0.6], bump: 1.0, alpha: true, gen(c) { grass(c, true); } };
    GEN.grass_card = { s: [0.6, 0.6], bump: 0.8, alpha: true, gen(c) { c.wrapY = false; grass(c, false); } };
    function grass(c, ground) {
      const N = c.N, n = c.n;
      c.A = new Float32Array(n); c.fill(hx(ground ? 0x2a2418 : 0x1e1c12)); c.Ro.fill(0.95);
      const cols = [0x8a8452, 0x76764a, 0x646d40, 0x9a8a58, 0x7a6a42, 0x5e6438, 0xa89a64].map(hx), depth = new Float32Array(n).fill(-1);
      const cnt = ground ? 900 : 520;
      for (let k = 0; k < cnt; k++) {
        const x0 = c.r() * N, y0 = ground ? c.r() * N : c.rand(-0.02, 0.06) * N, len = (ground ? c.rand(0.08, 0.22) : c.rand(0.25, 0.85)) * c.pv;
        const lean = c.rand(-0.35, 0.35) + (ground ? c.rand(-1, 1) : 0), bend = c.rand(-0.25, 0.25), w = c.rand(0.0015, 0.003) * c.pu, col = cols[(c.r() * cols.length) | 0], z = c.r();
        const pts = []; for (let s = 0; s <= 6; s++) { const t = s / 6, a = lean + bend * t * t * 3; pts.push([x0 + Math.sin(a) * len * t, y0 + Math.cos(a) * len * t]); }
        c.stroke(pts, (t) => w * (1 - t * 0.85) + 0.5, (i, t, d) => {
          if (z < depth[i]) return;
          depth[i] = z; c.A[i] = 1; c.set(i, col); c.mul(i, (0.6 + 0.5 * t) * (0.8 + 0.25 * (1 - Math.abs(d))) * (0.8 + z * 0.3));
          c.mix(i, hx(0xb8a878), t * t * 0.35);
          c.H[i] = z * 3 + (1 - d * d) * 0.8; c.Ro[i] = 0.75 + Math.abs(d) * 0.2;
        });
      }
    }
    // -------------------------------------------------------------- metals
    GEN.metal_dark = { s: [1, 1], bump: 0.6, metal: true, gen(c) {
      const N = c.N, brush = c.base(2, 1, 64), lo = c.base(0, 1, 1), mid = c.base(1, 2, 2), fine = c.base(2, 8, 8), sp = c.white();
      c.Me = new Float32Array(c.n);
      const A = hx(0x3a3d44), D = hx(0x24262b), rust = hx(0x4a2a1a);
      for (let i = 0; i < c.n; i++) {
        c.set(i, A); c.mix(i, D, sm(-1, 1.5, lo[i]) * 0.6); c.mul(i, 0.96 + brush[i] * 0.03);
        c.H[i] = brush[i] * 0.06 + fine[i] * 0.03; c.Me[i] = 0.85;
        c.Ro[i] = 0.42 + brush[i] * 0.05 + sm(0.5, 2, mid[i]) * 0.18;
        if (fine[i] + lo[i] * 0.4 > 2.4 || sp[i] > 0.9993) { c.mix(i, rust, 0.8); c.Me[i] = 0.2; c.Ro[i] = 0.85; c.H[i] += 0.2; }
      }
      for (let k = 0; k < 70; k++) { const x = c.r() * N, y = c.r() * N, a = c.rand(0, TAU), l = c.rand(0.02, 0.15) * c.pu; c.seg(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 0.7, 0.5, (i) => { c.mul(i, 1.35); c.Ro[i] = 0.3; c.H[i] -= 0.15; }); }
    } };
    GEN.metal_rust = { s: [1, 1], bump: 1.2, metal: true, gen(c) {
      const lo = c.base(0, 1, 1), mid = c.base(1, 2, 2), fine = c.base(2, 8, 8), f2 = c.base(2, 16, 16), pit = c.worley(80, 80, 1, null, null, 0), streak = c.base(1, 6, 1);
      c.Me = new Float32Array(c.n);
      const ramp = [0x22140e, 0x3e2418, 0x52301e, 0x6a4028, 0x46291a].map(hx), metal = hx(0x404246);
      for (let i = 0; i < c.n; i++) {
        const cov = lo[i] * 0.6 + mid[i] * 0.5 + fine[i] * 0.2 + 0.9;
        const t = clamp01(fine[i] * 0.25 + mid[i] * 0.2 + 0.5) * 3.99, k = t | 0, f = t - k;
        const r0 = ramp[k], r1 = ramp[Math.min(4, k + 1)];
        c.R[i] = lerp(r0[0], r1[0], f); c.G[i] = lerp(r0[1], r1[1], f); c.B[i] = lerp(r0[2], r1[2], f);
        c.mul(i, 0.78 + f2[i] * 0.06); c.mulc(i, [0.75, 0.7, 0.7], sm(0.8, 2, streak[i]) * 0.6);
        const p = 1 - sm(0, pit.cw * 0.25, pit.f1[i]);
        c.H[i] = mid[i] * 1.5 + fine[i] * 0.6 + f2[i] * 0.25 - p * 1.2 * (ihash(pit.id[i], 2) > 0.5 ? 1 : 0);
        c.Me[i] = 0.12; c.Ro[i] = 0.88 + f2[i] * 0.03;
        if (cov < 0) { const b = sm(0, -0.4, cov); c.mix(i, metal, b); c.mul(i, 1 + fine[i] * 0.05 * b); c.Me[i] = lerp(0.12, 0.8, b); c.Ro[i] = lerp(c.Ro[i], 0.5, b); c.H[i] -= b * 1.5; }
      }
    } };
    GEN.metal_painted = { s: [1, 1], bump: 1.0, metal: true, gen(c) {
      const lo = c.base(0, 1, 1), chip = c.base(1, 3, 3), chip2 = c.base(2, 6, 6), fine = c.base(2, 8, 8), streak = c.base(2, 10, 1), streakM = c.base(0, 2, 1);
      c.Me = new Float32Array(c.n);
      const paint = hx(0x34523f), paintL = hx(0x4a6650), rust = hx(0x6a3a20), rustD = hx(0x3a2014), steel = hx(0x5a5c62);
      for (let i = 0; i < c.n; i++) {
        c.set(i, paint); c.mix(i, paintL, sm(0, 2, lo[i]) * 0.5); c.mul(i, 0.95 + fine[i] * 0.03);
        c.Me[i] = 0; c.Ro[i] = 0.5 + sm(0, 2, lo[i]) * 0.15 + fine[i] * 0.02; c.H[i] = fine[i] * 0.05;
        const p = chip[i] + chip2[i] * 0.4 + lo[i] * 0.45;
        if (p > 1.5) {
          const t = sm(1.5, 1.56, p), deep = sm(1.65, 1.9, p);
          c.mix(i, rust, t); c.mix(i, steel, deep * 0.7); c.mix(i, rustD, sm(1.5, 1.6, p) * (1 - deep) * 0.5);
          c.Me[i] = deep * 0.8 + t * 0.1; c.Ro[i] = lerp(0.85, 0.45, deep); c.H[i] -= t * 0.8;
        } else if (p > 1.38) c.H[i] += sm(1.38, 1.5, p) * 0.4;          // raised paint edge
        const s = sm(1.0, 2.2, streak[i]) * sm(0.6, 1.5, streakM[i]);
        c.mix(i, rust, s * 0.45);
      }
    } };
    GEN.cast_iron = { s: [1, 1], bump: 0.9, metal: true, gen(c) {
      const lo = c.base(0, 1, 1), mid = c.base(1, 2, 2), fine = c.base(2, 8, 8), f2 = c.base(2, 16, 16), pit = c.worley(70, 70, 1, null, null, 0);
      c.Me = new Float32Array(c.n);
      const A = hx(0x2a2a2d), D = hx(0x161618), rust = hx(0x4a2a1c), ash = hx(0x6a6662);
      for (let i = 0; i < c.n; i++) {
        c.set(i, A); c.mix(i, D, sm(-1, 1.5, lo[i]) * 0.6); c.mul(i, 0.9 + f2[i] * 0.05);
        const pd = ihash(pit.id[i], 4) > 0.55 ? 1 - sm(0, pit.cw * 0.22, pit.f1[i]) : 0;
        c.H[i] = mid[i] * 0.6 + fine[i] * 0.3 + f2[i] * 0.2 - pd * 1.2;
        c.Me[i] = 0.75; c.Ro[i] = 0.58 + f2[i] * 0.05 + pd * 0.2;
        c.mix(i, ash, pd * 0.5);
        const r = sm(1.2, 2.2, mid[i] + fine[i] * 0.4); c.mix(i, rust, r * 0.7); c.Me[i] -= r * 0.5; c.Ro[i] += r * 0.25;
      }
    } };
    GEN.brass = { s: [1, 1], bump: 0.5, metal: true, gen(c) {
      const N = c.N, lo = c.base(0, 1, 1), mid = c.base(1, 2, 2), fine = c.base(2, 8, 8), sp = c.white();
      c.Me = new Float32Array(c.n);
      const A = hx(0xb8954a), tarn = hx(0x5e4822), ver = hx(0x4a7a62);
      for (let i = 0; i < c.n; i++) {
        c.set(i, A); const t = sm(-0.5, 1.8, lo[i] + mid[i] * 0.4); c.mix(i, tarn, t * 0.4);
        c.H[i] = mid[i] * 0.15 + fine[i] * 0.05; c.Me[i] = 1; c.Ro[i] = 0.28 + t * 0.25 + fine[i] * 0.02;
        if (fine[i] + mid[i] > 2.9 || sp[i] > 0.9997) { c.mix(i, ver, 0.8); c.Me[i] = 0.1; c.Ro[i] = 0.9; }
      }
      for (let k = 0; k < 60; k++) { const x = c.r() * N, y = c.r() * N, a = c.rand(0, TAU), l = c.rand(0.02, 0.1) * c.pu; c.seg(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 0.6, 0.4, (i) => { c.mul(i, 1.15); c.Ro[i] = 0.2; }); }
    } };
    GEN.glass = { s: [1, 1], bump: 0.25, gen(c) {
      const lo = c.base(0, 1, 1), mid = c.base(1, 2, 2), streak = c.base(2, 12, 1), fine = c.base(2, 8, 8);
      const A = hx(0xc4d4e2), dust = hx(0xa8aaa4);
      for (let i = 0; i < c.n; i++) {
        const d = sm(0.2, 2, lo[i] + fine[i] * 0.2), s = sm(1.2, 2.2, streak[i]) * sm(0, 1.5, mid[i]);
        c.set(i, A); c.mix(i, dust, d * 0.5 + s * 0.3);
        c.H[i] = lo[i] * 0.4 + mid[i] * 0.2;
        c.Ro[i] = 0.04 + d * 0.25 + s * 0.15;
      }
    } };
    // -------------------------------------------------------------- fabrics & organics
    // weave height: warp threads along v, weft along u; twill shifts the over/under pattern each row
    function weave(c, period, twill, o) {
      const N = c.N, M = c.M, sh = c.sh, n = c.n, slub = c.base(2, 1, 32), slubV = c.base(2, 32, 1), fuzz = c.base(2, 16, 16);
      const warpUp = new Float32Array(n), fz = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i & M) / period, y = (i >> sh) / period, ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
        const up = twill ? ((((ix + iy) % twill) + twill) % twill) < twill / 2 : ((ix + iy) & 1) === 0;
        const hw = Math.sin(Math.PI * fx) * (0.5 + 0.5 * Math.sin(Math.PI * fy)), hf = Math.sin(Math.PI * fy) * (0.5 + 0.5 * Math.sin(Math.PI * fx));
        const h = up ? hw : hf;
        warpUp[i] = up ? 1 : 0;
        c.H[i] = h * o.h + (up ? slubV[i] : slub[i]) * o.slub + fuzz[i] * o.fuzz;
        fz[i] = h;
      }
      return { warpUp, h: fz, fuzz, slub, slubV };
    }
    GEN.fabric_wool = { s: [0.5, 0.5], bump: 0.7, gen(c) {
      const w = weave(c, Math.max(2, Math.round(0.004 * c.pu)), 4, { h: 0.5, slub: 0.15, fuzz: 0.35 }), lo = c.base(0, 1, 1), pill = c.white(), mid = c.base(1, 3, 3);
      const A = hx(0x7e1d24), D = hx(0x4a0f14), L = hx(0x9a3038), blk = hx(0x2a1214);
      c.blur(c.H, 1, 1);
      for (let i = 0; i < c.n; i++) {
        c.set(i, A); c.mix(i, D, (1 - w.h[i]) * 0.55 + sm(0, 2, lo[i]) * 0.25); c.mix(i, L, sm(0.8, 2, w.fuzz[i]) * 0.35);
        c.mix(i, w.warpUp[i] ? blk : L, sm(1.6, 2.4, w.warpUp[i] ? w.slubV[i] : w.slub[i]) * 0.4);
        c.mix(i, hx(0x8a4a48), sm(1, 2.4, mid[i]) * 0.25);
        if (pill[i] > 0.9992) { c.mix(i, L, 0.5); c.H[i] += 0.5; }
        c.Ro[i] = 0.97;
      }
    } };
    GEN.fabric_canvas = { s: [0.5, 0.5], bump: 0.6, gen(c) {
      const w = weave(c, Math.max(2, Math.round(0.0025 * c.pu)), 0, { h: 0.35, slub: 0.12, fuzz: 0.1 }), lo = c.base(0, 1, 1), st = c.base(1, 1, 1), mid = c.base(1, 2, 2), fine = c.base(2, 8, 8);
      const A = hx(0x8e8464), D = hx(0x5e5640), stain = hx(0x5a4e36), mild = hx(0x3a3a2c);
      for (let i = 0; i < c.n; i++) {
        c.set(i, A); c.mix(i, D, (1 - w.h[i]) * 0.4 + sm(-0.5, 2, lo[i]) * 0.35);
        c.mul(i, 0.95 + (w.warpUp[i] ? w.slubV[i] : w.slub[i]) * 0.04);
        const s = st[i]; c.mix(i, stain, sm(1.0, 1.4, s) * 0.4); c.mix(i, D, (sm(1.35, 1.42, s) - sm(1.42, 1.55, s)) * 0.5);
        if (mid[i] + fine[i] * 0.6 > 2.5) c.mix(i, mild, 0.6);
        c.Ro[i] = 0.92;
      }
    } };
    GEN.fabric_blue = { s: [0.5, 0.5], bump: 0.6, gen(c) {
      const w = weave(c, Math.max(2, Math.round(0.003 * c.pu)), 4, { h: 0.4, slub: 0.15, fuzz: 0.12 }), lo = c.base(0, 1, 1), mid = c.base(1, 2, 2);
      const warp = hx(0x2a3f6a), weft = hx(0x8a92a4), fade = hx(0x5a7098), D = hx(0x162238);
      for (let i = 0; i < c.n; i++) {
        c.set(i, w.warpUp[i] ? warp : weft); c.mix(i, warp, 0.45);
        c.mul(i, 0.9 + w.slubV[i] * 0.06); c.mix(i, D, (1 - w.h[i]) * 0.4);
        c.mix(i, fade, sm(0.6, 2.2, lo[i] + mid[i] * 0.3) * 0.4);
        c.Ro[i] = 0.95;
      }
    } };
    GEN.fabric_red = { s: [1, 1], bump: 0.5, gen(c) {
      const w = weave(c, Math.max(2, Math.round(0.0015 * c.pu)), 0, { h: 0.2, slub: 0.25, fuzz: 0.1 }), lo = c.base(0, 1, 1), band = c.base(0, 4, 1), sl = c.base(2, 24, 1), dust = c.base(1, 2, 2);
      const A = hx(0x761c1e), D = hx(0x420c10), fade = hx(0x9a4a44), grey = hx(0x6a5a58);
      for (let i = 0; i < c.n; i++) {
        c.set(i, A); c.mix(i, D, (1 - w.h[i]) * 0.3 + sm(0.5, 2, -sl[i]) * 0.3); c.mix(i, fade, sm(0.4, 2, band[i]) * 0.4 + sm(0.8, 2, sl[i]) * 0.15);
        c.mix(i, grey, sm(1.0, 2.5, dust[i] + lo[i] * 0.3) * 0.3);
        c.H[i] += sl[i] * 0.3;
        c.Ro[i] = 0.78 + (1 - w.h[i]) * 0.1;
      }
    } };
    GEN.leather = { s: [0.5, 0.5], bump: 0.9, gen(c) {
      const N = c.N, lo = c.base(0, 1, 1), mid = c.base(1, 2, 2), fine = c.base(2, 8, 8), peb = c.worley(70, 70, 1, fine, mid, c.N * 0.003), cr = c.base(1, 3, 3);
      const A = hx(0x553620), D = hx(0x2e1c10), L = hx(0x7a5638), oil = hx(0x24160c);
      for (let i = 0; i < c.n; i++) {
        const p = sm(0, peb.cw * 0.45, peb.f2[i] - peb.f1[i]);
        c.set(i, A); c.mix(i, D, (1 - p) * 0.35 + sm(-0.5, 2, -lo[i]) * 0.35); c.mix(i, L, sm(0.8, 2.2, lo[i] + mid[i] * 0.4) * 0.5);
        c.mix(i, oil, sm(1.2, 2.2, mid[i]) * 0.4);
        const crease = 1 - sm(0, 0.06, Math.abs(cr[i])); c.mix(i, D, crease * 0.5);
        c.H[i] = Math.sqrt(p) * 0.8 + fine[i] * 0.1 - crease * 1.0 + lo[i] * 0.4;
        c.Ro[i] = 0.62 + (1 - p) * 0.12 - sm(1.2, 2.2, mid[i]) * 0.15 + sm(0.8, 2.2, lo[i]) * 0.12;
      }
      void N;
    } };
    GEN.fur = { s: [0.4, 0.4], bump: 1.2, gen(c) {
      const flowX = c.base(0, 2, 2), flowY = c.base(1, 2, 2), strands = c.base(2, 40, 2), str2 = c.base(2, 80, 4), clump = c.base(1, 4, 3), lo = c.base(0, 1, 1);
      const s1 = c.warp(strands, flowX, flowY, c.N * 0.04), s2 = c.warp(str2, flowX, flowY, c.N * 0.04);
      const A = hx(0x6e5a46), tip = hx(0xa89478), under = hx(0x241a12), D = hx(0x4a3a2c);
      for (let i = 0; i < c.n; i++) {
        const s = s1[i] * 0.7 + s2[i] * 0.5 + clump[i] * 0.4;
        c.set(i, A); c.mix(i, D, sm(-0.5, 2, lo[i]) * 0.5); c.mix(i, tip, sm(0.6, 2.0, s) * 0.6); c.mix(i, under, sm(-0.4, -2.0, s) * 0.85);
        c.H[i] = s * 2 + clump[i] * 1.5; c.Ro[i] = 0.9 + sm(0.6, 2, s) * 0.05;
      }
    } };
    GEN.paper = { s: [0.3, 0.3], bump: 0.4, gen(c) {
      const N = c.N, lo = c.base(0, 1, 1), mid = c.base(1, 2, 2), fine = c.base(2, 16, 16), st = c.base(1, 1, 1);
      const A = hx(0xdcd0b2), D = hx(0xb8a888), fox = hx(0x9a7448);
      for (let i = 0; i < c.n; i++) {
        c.set(i, A); c.mix(i, D, sm(-0.5, 2, lo[i] + mid[i] * 0.3) * 0.45); c.mul(i, 0.98 + fine[i] * 0.015);
        const s = st[i]; c.mix(i, D, sm(1.1, 1.5, s) * 0.4); c.mix(i, fox, (sm(1.45, 1.5, s) - sm(1.5, 1.6, s)) * 0.4);
        c.H[i] = fine[i] * 0.04 + mid[i] * 0.05; c.Ro[i] = 0.88;
      }
      for (let k = 0; k < 900; k++) { const x = c.r() * N, y = c.r() * N, a = c.rand(0, TAU), l = c.rand(0.002, 0.008) * c.pu; c.seg(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 0.5, 0.5, (i) => { c.mul(i, 0.96); c.H[i] += 0.05; }); }
      for (let k = 0; k < 14; k++) { const x = c.r() * N, y = c.r() * N, r = c.rand(0.001, 0.004) * c.pu + 1; c.ell(x, y, r, r, 0, (i, u, v) => c.mix(i, fox, (1 - (u * u + v * v)) * 0.6)); }
    } };
  
    const S2L = new Float32Array(256); for (let i = 0; i < 256; i++) { const v = i / 255; S2L[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    function encode(c, spec) {
      const N = c.N, n = c.n, M = c.M, col = new Uint8ClampedArray(n * 4), nrm = new Uint8ClampedArray(n * 4);
      const R = c.R, G = c.G, B = c.B, A = c.A || c.Me, Ro = c.Ro, H = c.H;
      for (let i = 0, j = 0; i < n; i++, j += 4) { col[j] = R[i] * 255 + 0.5; col[j + 1] = G[i] * 255 + 0.5; col[j + 2] = B[i] * 255 + 0.5; }
      if (A) for (let i = 0, j = 3; i < n; i++, j += 4) col[j] = A[i] * 255 + 0.5; else for (let j = 3; j < n * 4; j += 4) col[j] = 255;
      let mr = 0, mg = 0, mb = 0, mw = 0, mro = 0, mme = 0, cnt = 0;
      for (let i = 0; i < n; i += 13) {
        const j = i * 4, w = c.A ? c.A[i] : 1;
        mr += S2L[col[j]] * w; mg += S2L[col[j + 1]] * w; mb += S2L[col[j + 2]] * w; mw += w; mro += Ro[i]; if (c.Me) mme += c.Me[i]; cnt++;
      }
      // normal from height (Sobel, wrapped), height in mm, slope in real units
      const kx = 0.125 / 1000 * c.pu * spec.bump, ky = 0.125 / 1000 * c.pv * spec.bump;
      const wrapY = spec.tile !== false && c.wrapY;
      for (let y = 0; y < N; y++) {
        let ym = (y - 1) & M, yp = (y + 1) & M;
        if (!wrapY) { ym = Math.max(0, y - 1); yp = Math.min(N - 1, y + 1); }
        const rm = ym * N, r0 = y * N, rp = yp * N;
        for (let x = 0; x < N; x++) {
          const xm = (x - 1) & M, xp = (x + 1) & M;
          const a = H[rm + xm], b = H[rm + x], cc = H[rm + xp], d = H[r0 + xm], f = H[r0 + xp], g = H[rp + xm], h = H[rp + x], k = H[rp + xp];
          const nx = -((cc + 2 * f + k) - (a + 2 * d + g)) * kx, ny = -((g + 2 * h + k) - (a + 2 * b + cc)) * ky;
          const il = 127.5 / Math.sqrt(nx * nx + ny * ny + 1), j = (r0 + x) * 4;
          nrm[j] = nx * il + 128; nrm[j + 1] = ny * il + 128; nrm[j + 2] = il + 128; nrm[j + 3] = Ro[r0 + x] * 255 + 0.5;
        }
      }
      return { col: new Uint8Array(col.buffer), nrm: new Uint8Array(nrm.buffer), mean: [mr / mw, mg / mw, mb / mw], meanRough: mro / cnt, meanMetal: c.Me ? mme / cnt : 0 };
    }
  
    function generateRaw(name, params, N) {
      const spec = GEN[name], t0 = performance.now();
      let s = spec.s;
      if (spec.param === 'spacing') { const sp = params.spacing; s = [s[0], sp * Math.max(2, Math.round(s[1] / sp))]; }
      const c = new Ctx(N, strSeed(name), { s });
      spec.gen(c, params);
      const e = encode(c, spec);
      scheduleFlush();
      return { col: e.col, nrm: e.nrm, mean: e.mean, meanRough: e.meanRough, meanMetal: e.meanMetal, s, N, ms: performance.now() - t0 };
    }
    const info = {}; for (const k in GEN) info[k] = { s: GEN[k].s, metal: !!GEN[k].metal, alpha: !!GEN[k].alpha, tile: GEN[k].tile !== false, param: GEN[k].param || null, norm: GEN[k].norm || 1 };
    return { generateRaw, info, rng, lerp, flush: () => { for (const k in baseCache) delete baseCache[k]; } };
  }
  const L = LIB();
  // ================================================================ encode -> GPU textures
  function aniso() {
    const cap = curN <= 512 ? 4 : 8;
    try { return R3.renderer ? Math.min(cap, R3.renderer.capabilities.getMaxAnisotropy()) : cap; } catch (e) { return cap; }
  }
  function dataTex(data, N, srgb) {
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.anisotropy = aniso();
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  }
  // ================================================================ texture sets & materials
  // A set = the two textures of one name (+ params). First use creates it synchronously at PREVIEW size
  // (a few ms), then a worker builds the full-size version and the maps are swapped into every material
  // using the set (same material objects, no needsUpdate: a map existed before and after).
  const GEN = L.info, PREVIEW = 64;
  let curN = 0;
  const sets = {}, recs = [], cache = {};
  T.stats = {};
  function setKey(name, opts) { const s = GEN[name]; return s && s.param === 'spacing' ? name + '@' + (+(opts && opts.spacing) || 0.3).toFixed(3) : name; }
  function targetN() { if (!curN) curN = (R3.q && R3.q().tex) || 1024; return curN; }
  function install(set, raw) {
    const old = [set.map, set.nrm];
    set.N = raw.N; set.s = raw.s; set.col = raw.col; set.mean = raw.mean; set.meanRough = raw.meanRough; set.meanMetal = raw.meanMetal;
    set.map = dataTex(raw.col, raw.N, true); set.nrm = dataTex(raw.nrm, raw.N, false);
    if (raw.N >= 512) T.stats[set.key] = Math.round(raw.ms * 10) / 10;
    delete canvases[set.key];
    recs.forEach((r) => { if (r.set === set) bind(r).forEach((t) => t && t.dispose()); });
    old.forEach((t) => t && t.dispose());
  }

  // ---- worker pool
  const pool = [], queue = [];
  let workerOK = typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined', jobSeq = 0, busy = 0;
  const waiters = [];
  function spawnPool() {
    if (pool.length || !workerOK) return;
    try {
      const src = 'const L = (' + LIB.toString() + ')();\nonmessage = (e) => { const d = e.data; try { const r = L.generateRaw(d.name, d.params, d.N); postMessage({ id: d.id, r }, [r.col.buffer, r.nrm.buffer]); } catch (err) { postMessage({ id: d.id, err: String(err && err.stack || err) }); } };';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const n = Math.max(1, Math.min(3, ((navigator.hardwareConcurrency || 2) - 1)));
      for (let i = 0; i < n; i++) {
        const w = new Worker(url);
        w.job = null;
        w.onmessage = (e) => onDone(w, e.data);
        w.onerror = (e) => { e.preventDefault && e.preventDefault(); workerOK = false; const j = w.job; w.job = null; busy--; if (j) queue.unshift(j); pump(); };
        pool.push(w);
      }
    } catch (e) { workerOK = false; }
  }
  function onDone(w, d) {
    const j = w.job; w.job = null; busy--;
    if (j && d.r && j.set.want === j.N && j.id === j.set.job) install(j.set, d.r);
    else if (j && d.err) { console.error('[r3 tex worker ' + j.set.name + ']', d.err); queue.push(j); workerOK = false; }
    pump();
  }
  function pump() {
    while (queue.length) {
      if (workerOK) {
        spawnPool();
        const w = pool.find((x) => !x.job);
        if (!w) return;
        const j = queue.shift(); if (j.id !== j.set.job) continue;
        w.job = j; busy++;
        w.postMessage({ id: j.id, name: j.set.name, params: j.set.params, N: j.N });
      } else {
        // no workers: generate on the main thread, one set per task
        const j = queue.shift(); if (j.id !== j.set.job) continue;
        busy++;
        setTimeout(() => { busy--; if (j.id === j.set.job) install(j.set, L.generateRaw(j.set.name, j.set.params, j.N)); pump(); }, 0);
        return;
      }
    }
    if (!busy && !queue.length) waiters.splice(0).forEach((f) => f());
  }
  function request(set, N) {
    set.want = N; set.job = ++jobSeq;
    queue.push({ id: set.job, set, N });
    pump();
  }
  function getSet(name, opts) {
    const k = setKey(name, opts);
    if (!sets[k]) {
      const params = GEN[name].param === 'spacing' ? { spacing: +(opts && opts.spacing) || 0.3 } : {};
      const set = sets[k] = { key: k, name, params, spec: GEN[name], N: 0, want: 0, map: null, nrm: null };
      install(set, L.generateRaw(name, params, PREVIEW));
      request(set, targetN());
    }
    return sets[k];
  }
  // share the GPU texture (same Source) but give each material its own repeat/offset
  function view(tex, rx, ry, ox, oy) {
    const v = tex.source.version, t = tex.clone();
    t.source.version = v;
    t.repeat.set(rx, ry); t.offset.set(ox, oy);
    return t;
  }
  function bind(rec) {
    const s = rec.set, o = rec.opts, m = rec.m;
    const rp = o.repeat == null ? [1, 1] : Array.isArray(o.repeat) ? o.repeat : [o.repeat, o.repeat];
    const tiles = s.spec.tile;
    const rx = tiles ? rp[0] / s.s[0] : rp[0], ry = tiles ? rp[1] / s.s[1] : rp[1];
    const off = o.offset || [0, 0], ox = tiles ? -off[0] * rx : off[0], oy = tiles ? -off[1] * ry : off[1];
    const old = [m.map, m.normalMap];
    m.map = view(s.map, rx, ry, ox, oy);
    m.normalMap = view(s.nrm, rx, ry, ox, oy);
    if (o.color != null) {
      const tc = new THREE.Color(o.color);
      m.color.setRGB(Math.min(6, tc.r / Math.max(1e-3, s.mean[0])), Math.min(6, tc.g / Math.max(1e-3, s.mean[1])), Math.min(6, tc.b / Math.max(1e-3, s.mean[2])));
    } else m.color.setRGB(1, 1, 1);
    if (o.tint != null) m.color.multiply(new THREE.Color(o.tint));
    m.roughness = o.roughness != null ? Math.min(4, o.roughness / Math.max(0.02, s.meanRough)) : 1;
    if (s.spec.metal) m.metalness = o.metalness != null ? Math.min(2, o.metalness / Math.max(0.05, s.meanMetal)) : 1;
    else m.metalness = o.metalness != null ? o.metalness : 0;
    return old;
  }
  function patchFor(metal) {
    return function (sh) {
      let fs = sh.fragmentShader;
      fs = fs.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n#ifdef USE_NORMALMAP\n  roughnessFactor *= texture2D( normalMap, vNormalMapUv ).a;\n#endif');
      if (metal) fs = fs.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n#ifdef USE_MAP\n  metalnessFactor *= texture2D( map, vMapUv ).a;\n#endif');
      sh.fragmentShader = fs;
    };
  }
  const PATCH = patchFor(false), PATCH_M = patchFor(true);

  T.mat = function (name, opts) {
    opts = opts || {};
    const key = name + '|' + JSON.stringify(opts);
    if (cache[key]) return cache[key];
    const b = T.BASE[name] || [0x888888, 0.9];
    const spec = GEN[name];
    const pass = (p) => { ['side', 'transparent', 'opacity', 'emissive', 'emissiveIntensity', 'alphaTest', 'depthWrite'].forEach((k) => { if (opts[k] != null) p[k] = opts[k]; }); return p; };
    const fwd = { wind: opts.wind, snowTop: opts.snowTop, weather: opts.weather, wet: opts.wet };
    if (!spec) {
      const p = pass({ color: opts.color != null ? opts.color : b[0], roughness: opts.roughness != null ? opts.roughness : b[1], metalness: /metal|iron|brass/.test(name) ? 0.6 : 0 });
      return (cache[key] = R3.std(p, fwd));
    }
    let set;
    try { set = getSet(name, opts); } catch (e) {
      console.error('[r3 tex ' + name + ']', e);
      return (cache[key] = R3.std(pass({ color: opts.color != null ? opts.color : b[0], roughness: b[1] }), fwd));
    }
    const ns = spec.norm * (opts.normalScale != null ? opts.normalScale : 1);
    const p = { color: 0xffffff, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(ns, ns) };
    if (name === 'glass') { p.transparent = true; p.opacity = 0.25; p.depthWrite = false; }
    if (name === 'snow' || name === 'snow_trail') { p.emissive = 0x0b1018; p.emissiveIntensity = 1; }
    if (name === 'ice') { p.emissive = 0x060c12; p.emissiveIntensity = 1; }
    pass(p);
    fwd.patch = spec.metal ? PATCH_M : PATCH; fwd.patchKey = spec.metal ? '|texM' : '|tex';
    const m = R3.std(p, fwd);
    const rec = { m, set, opts };
    bind(rec);
    recs.push(rec);
    m.userData.tex = name;
    return (cache[key] = m);
  };

  // New size: every set is rebuilt in the background and swapped in when ready (old maps stay until then).
  T.applyQuality = function (q) {
    const N = (q && q.tex) || 1024;
    if (!curN) { curN = N; return; }
    const a = aniso(), changed = N !== curN;
    curN = N;
    for (const k in sets) {
      const s = sets[k];
      if (changed) request(s, N);
      else for (const t of [s.map, s.nrm]) if (t.anisotropy !== aniso()) { t.anisotropy = a; t.needsUpdate = true; recs.forEach((r) => { [r.m.map, r.m.normalMap].forEach((v) => { if (v && v.source === t.source) v.anisotropy = a; }); }); }
    }
  };

  // ================================================================ extras
  const canvases = {};
  T.canvas = function (name, opts) {
    if (!GEN[name]) return null;
    const s = getSet(name, opts), k = s.key;
    if (canvases[k]) return canvases[k];
    const N = s.N, cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(N, N) : Object.assign(document.createElement('canvas'), { width: N, height: N });
    const ctx = cv.getContext('2d'), img = ctx.createImageData(N, N), row = N * 4;
    for (let y = 0; y < N; y++) img.data.set(s.col.subarray((N - 1 - y) * row, (N - y) * row), y * row);
    if (!GEN[name].alpha) for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;   // metalness lives in alpha
    ctx.putImageData(img, 0, 0);
    return (canvases[k] = cv);
  };
  T.maps = function (name, opts) { const s = GEN[name] && getSet(name, opts); return s ? { map: s.map, normalMap: s.nrm, size: s.s.slice(), mean: s.mean.slice(), roughness: s.meanRough } : null; };
  T.names = () => Object.keys(GEN);
  // Generate full-size sets now on the calling thread (timing / loading screens). Returns { name: ms }.
  T.preload = function (names, N) {
    const out = {}; N = N || targetN();
    (names || T.names()).forEach((nm) => {
      const s = getSet(nm);
      if (s.N === N) { out[nm] = 0; return; }
      const raw = L.generateRaw(nm, s.params, N); s.job = ++jobSeq; s.want = N; install(s, raw); out[nm] = Math.round(raw.ms * 10) / 10;
    });
    return out;
  };
  // Promise resolved when every requested full-size set is installed.
  T.whenReady = () => new Promise((res) => { if (!busy && !queue.length) res(); else waiters.push(res); });
  T.pending = () => queue.length + busy;
  T._sets = sets;
  T._flush = L.flush;
  const rng = L.rng, lerp = L.lerp;

  // ---- classic Perlin noise for JS-side use (non-periodic), result roughly in [-1, 1]
  const perm = new Uint8Array(512);
  (function () { const r = rng(1337), p = []; for (let i = 0; i < 256; i++) p.push(i); for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; } for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; })();
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function grad3(h, x, y, z) { const u = h < 8 ? x : y, v = h < 4 ? y : (h === 12 || h === 14 ? x : z); return ((h & 1) ? -u : u) + ((h & 2) ? -v : v); }
  T.noise3 = function (x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z, B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    return lerp(lerp(lerp(grad3(perm[AA] & 15, x, y, z), grad3(perm[BA] & 15, x - 1, y, z), u), lerp(grad3(perm[AB] & 15, x, y - 1, z), grad3(perm[BB] & 15, x - 1, y - 1, z), u), v),
      lerp(lerp(grad3(perm[AA + 1] & 15, x, y, z - 1), grad3(perm[BA + 1] & 15, x - 1, y, z - 1), u), lerp(grad3(perm[AB + 1] & 15, x, y - 1, z - 1), grad3(perm[BB + 1] & 15, x - 1, y - 1, z - 1), u), v), w);
  };
  T.noise2 = (x, y) => T.noise3(x, y, 0.5);

  // Remap a geometry's UVs so that 1 UV unit = 1 metre (box-projected from each face normal).
  T.metreUV = function (geo, scale) {
    scale = scale || 1;
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    if (!nor) geo.computeVertexNormals();
    const n = geo.attributes.normal, uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
      let u, v;
      if (ny >= nx && ny >= nz) { u = pos.getX(i); v = pos.getZ(i); } else if (nx >= nz) { u = pos.getZ(i); v = pos.getY(i); } else { u = pos.getX(i); v = pos.getY(i); }
      uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  };
})(window.NW);
