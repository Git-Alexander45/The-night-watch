'use strict';
// Procedural pixel art: palette, sprite caches, characters, creatures, furniture, icons.
(function (NW) {
  const U = NW.U;
  const S = NW.S = {};

  const P = S.P = {
    ink: '#08090e', night: '#10141f', night2: '#191f30', slate: '#283045',
    wood0: '#22140d', wood1: '#382014', wood2: '#54311d', wood3: '#714326', wood4: '#8f5731', wood5: '#b17544', wood6: '#cf9a62',
    log0: '#2b1a10', log1: '#472a18', log2: '#663d24', log3: '#865432', log4: '#a06a40', chink: '#a8957a', chink2: '#7d6c56',
    g0: '#0c1914', g1: '#13281f', g2: '#1c3a2b', g3: '#285036', g4: '#3d6b43', g5: '#5d8a52',
    gr0: '#26301f', gr1: '#344128', gr2: '#4a5533', gr3: '#646d40', gr4: '#827f4c',
    d0: '#33251a', d1: '#4a3524', d2: '#634830', d3: '#806043',
    sn0: '#6f819b', sn1: '#9fb0c6', sn2: '#c6d3e2', sn3: '#e6eef6', sn4: '#ffffff',
    st0: '#25282f', st1: '#3d424d', st2: '#5b616d', st3: '#828a97', st4: '#adb4bf',
    w0: '#0f1c2e', w1: '#18304a', w2: '#27506f', w3: '#4c7fa3', ice0: '#7da4bd', ice1: '#a9c8da', ice2: '#d4e6f0',
    f0: '#6e1a0d', f1: '#bd3c17', f2: '#ea7420', f3: '#ffb746', f4: '#ffeaa0',
    r0: '#3e0e12', r1: '#6f1a1f', r2: '#a5352e', r3: '#cf6047',
    rg0: '#2a3320', rg1: '#3b4729', rg2: '#556538', rg3: '#73844a',
    sk0: '#7d5038', sk1: '#ad7552', sk2: '#d49c76', sk3: '#ecc19c',
    b0: '#1a253c', b1: '#2a3f66', b2: '#46639a', b3: '#7795c6',
    y0: '#8c6a1f', y1: '#d2a838', y2: '#f2d77a',
    i0: '#17191d', i1: '#2a2d33', i2: '#43474f', i3: '#666b75', i4: '#9298a3',
    bone: '#d6cfbb', pale: '#c4c1b6', pale0: '#8a877e', pale2: '#e8e5da',
    glow: '#fff4c4', eye: '#ffe27a', white: '#f2f5f8', black: '#000000',
    pur0: '#2d2238', pur1: '#4a3a5c', pur2: '#6d5a85',
    ash0: '#1d1c1c', ash1: '#2e2c2b', ash2: '#4a4644',
    mud0: '#1e1a14', mud1: '#2e281d', mud2: '#433a2a',
  };

  const rgbCache = {};
  S.rgb = function (hex) {
    let c = rgbCache[hex];
    if (!c) {
      const n = parseInt(hex.slice(1), 16);
      c = rgbCache[hex] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return c;
  };
  S.rgba = (hex, a) => { const c = S.rgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
  S.mix = function (h1, h2, t) {
    const a = S.rgb(h1), b = S.rgb(h2);
    const r = Math.round(a[0] + (b[0] - a[0]) * t), g = Math.round(a[1] + (b[1] - a[1]) * t), bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  };

  S.mk = function (w, h, fn) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    if (fn) fn(g, c);
    return c;
  };
  S.pix = function (w, h, fn) {
    const c = S.mk(w, h); const g = c.getContext('2d');
    const id = g.createImageData(w, h); const d = id.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const col = fn(x, y);
      if (col) { const c3 = S.rgb(col); const i = (y * w + x) * 4; d[i] = c3[0]; d[i + 1] = c3[1]; d[i + 2] = c3[2]; d[i + 3] = 255; }
    }
    g.putImageData(id, 0, 0); return c;
  };
  S.vnoise = function (x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = U.hashf(xi, yi, seed), b = U.hashf(xi + 1, yi, seed), c = U.hashf(xi, yi + 1, seed), d = U.hashf(xi + 1, yi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  S.fbm = (x, y, seed) => S.vnoise(x, y, seed) * 0.55 + S.vnoise(x * 2.1, y * 2.1, seed + 7) * 0.3 + S.vnoise(x * 4.3, y * 4.3, seed + 13) * 0.15;

  function R(g, c, x, y, w, h) { g.fillStyle = c; g.fillRect(x | 0, y | 0, w, h); }
  S.R = R;
  function ellipse(g, c, cx, cy, rx, ry) { g.fillStyle = c; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
  S.ellipse = ellipse;

  // ------------------------------------------------------------------ Trees
  const cache = {};
  S.cached = function (key, fn) { return cache[key] || (cache[key] = fn()); };

  S.pine = function (size, snow, variant) {
    return S.cached('pine' + size + '_' + snow + '_' + variant, () => {
      const W = [24, 30, 36][size], H = [36, 46, 56][size];
      const seed = 991 + variant * 31 + size * 7;
      const tiers = [3, 4, 5][size];
      const trunkH = 6 + size;
      const cx = W / 2;
      const top = 1, bottom = H - trunkH + 2;
      return S.pix(W, H, (x, y) => {
        // trunk
        if (y >= H - trunkH && Math.abs(x - cx + 0.5) < 2) return x < cx - 0.5 ? P.wood2 : x < cx + 0.5 ? P.wood1 : P.wood0;
        if (y < top || y > bottom) return null;
        // tiers: each tier is a triangle; compute local tier
        const span = (bottom - top);
        let best = null;
        for (let t = 0; t < tiers; t++) {
          const ty0 = top + (span * t) / (tiers + 0.4);
          const ty1 = top + (span * (t + 1.4)) / (tiers + 0.4);
          if (y < ty0 || y > ty1) continue;
          const f = (y - ty0) / (ty1 - ty0);
          const hw = (1.5 + f * (W / 2 - 1.5) * (0.55 + 0.45 * (t + 1) / tiers));
          const jag = (U.hashf(x, y, seed) < 0.3 ? 1 : 0) + (f > 0.85 && (x + t) % 3 === 0 ? 1.5 : 0);
          const dx = x + 0.5 - cx;
          if (Math.abs(dx) <= hw - jag) {
            const edge = hw - Math.abs(dx);
            const n = U.hashf(x, y, seed + 3);
            let col;
            if (dx > hw * 0.35) col = n < 0.7 ? P.g1 : P.g0;
            else if (dx < -hw * 0.45) col = n < 0.6 ? P.g3 : P.g2;
            else col = n < 0.12 ? P.g3 : n < 0.85 ? P.g2 : P.g1;
            if (f > 0.82) col = dx > 0 ? P.g0 : P.g1;
            // snow on upper slope of each tier
            if (snow > 0) {
              const sl = (f < 0.55 && edge < 1.5 + snow * 0.9) || (f < 0.18 + snow * 0.08);
              if (sl && U.hashf(x, y, seed + 9) < 0.45 + snow * 0.18) col = dx > hw * 0.3 ? P.sn1 : (n < 0.5 ? P.sn3 : P.sn2);
            }
            best = col;
          }
        }
        return best;
      });
    });
  };
  S.birch = function (snow, variant) {
    return S.cached('birch' + snow + '_' + variant, () => S.mk(26, 44, (g) => {
      const seed = 400 + variant;
      // canopy of yellow leaves (autumn), sparse
      for (let i = 0; i < 130; i++) {
        const a = U.hashf(i, 1, seed) * Math.PI * 2, r = Math.sqrt(U.hashf(i, 2, seed)) * 10;
        const x = 13 + Math.cos(a) * r * 1.1, y = 14 + Math.sin(a) * r * 0.95;
        const c = U.hashf(i, 3, seed);
        R(g, c < 0.3 ? P.y0 : c < 0.75 ? P.y1 : P.y2, x, y, 2, 2);
      }
      R(g, P.white, 12, 14, 2, 30); R(g, P.st3, 13, 14, 1, 30);
      for (let y = 16; y < 44; y += 4) R(g, P.ink, 12 + (y % 8 === 0 ? 1 : 0), y, 1 + (y % 3 === 0 ? 1 : 0), 1);
      R(g, P.white, 8, 18, 5, 1); R(g, P.white, 14, 22, 5, 1);
      if (snow > 1) for (let i = 0; i < 12 * snow; i++) R(g, P.sn3, 5 + U.hashf(i, 5, seed) * 16, 6 + U.hashf(i, 6, seed) * 12, 1, 1);
    }));
  };
  S.deadTree = function (snow, variant, chopped) {
    return S.cached('dead' + snow + '_' + variant + (chopped ? 'c' : ''), () => S.mk(24, 40, (g) => {
      if (chopped) {
        R(g, P.wood1, 9, 33, 7, 5); R(g, P.wood3, 9, 32, 7, 2); R(g, P.wood5, 10, 32, 5, 1);
        if (snow) R(g, P.sn2, 9, 31, 7, 1);
        return;
      }
      R(g, 'rgba(0,0,0,0.3)', 6, 37, 13, 3);
      R(g, P.ash2, 9, 6, 6, 34); R(g, P.st2, 9, 6, 2, 34); R(g, P.ash1, 13, 6, 2, 34); R(g, P.ash2, 7, 34, 10, 5); R(g, P.ash1, 15, 35, 3, 4);
      const br = variant % 2 ? [[9, 13, -1, 8], [15, 18, 1, 7], [9, 24, -1, 6], [15, 9, 1, 6]] : [[15, 12, 1, 8], [9, 16, -1, 7], [15, 25, 1, 6], [9, 8, -1, 6]];
      br.forEach(([x, y, d, len]) => {
        for (let i = 0; i < len; i++) { R(g, P.ash2, x + d * i, y - Math.floor(i * 0.7), 2, 2); }
        R(g, P.ash1, x + d * (len - 2), y - len, 1, 3);
        if (snow) R(g, P.sn3, x + d * Math.floor(len / 2), y - Math.floor(len * 0.35) - 1, 3, 1);
      });
      R(g, P.ash2, 10, 2, 2, 5); R(g, P.ash2, 13, 0, 1, 7); R(g, P.ash1, 8, 1, 1, 3);
      for (let y = 10; y < 36; y += 6) R(g, P.ash1, 11, y, 1, 3);
      R(g, P.wood1, 11, 20, 2, 2);
    }));
  };
  S.rock = function (variant, snow) {
    return S.cached('rock' + variant + '_' + snow, () => {
      const W = variant === 2 ? 26 : 16, H = variant === 2 ? 18 : 12;
      const seed = 77 + variant;
      return S.pix(W, H, (x, y) => {
        const cx = W / 2, cy = H / 2 + 1;
        const nx = (x + 0.5 - cx) / (W / 2), ny = (y + 0.5 - cy) / (H / 2);
        const d = nx * nx + ny * ny * 1.2 + (U.hashf(x, y, seed) - 0.5) * 0.15;
        if (d > 0.92) return null;
        if (snow && ny < -0.25 && d < 0.85 && U.hashf(x, y, seed + 1) < 0.5 + snow * 0.15) return ny < -0.55 ? P.sn3 : P.sn2;
        if (d > 0.75) return P.st0;
        if (nx - ny < -0.6) return P.st3;
        if (nx + ny > 0.5) return P.st1;
        const n = U.hashf(x >> 1, y >> 1, seed + 2);
        return n < 0.15 ? P.g3 : n < 0.55 ? P.st2 : P.st2;
      });
    });
  };
  S.bush = function (berries, snow) {
    return S.cached('bush' + berries + '_' + snow, () => S.pix(16, 13, (x, y) => {
      const nx = (x + 0.5 - 8) / 8, ny = (y + 0.5 - 7) / 6;
      const d = nx * nx + ny * ny + (U.hashf(x, y, 5) - 0.5) * 0.35;
      if (d > 1) return null;
      if (snow && ny < -0.3 && U.hashf(x, y, 6) < 0.5 + snow * 0.15) return P.sn2;
      if (berries && U.hashf(x, y, 8) < 0.13 && d < 0.8) return U.hashf(x, y, 9) < 0.5 ? P.r2 : P.r3;
      if (nx + ny > 0.4) return P.g1;
      if (nx + ny < -0.6) return P.g4;
      return U.hashf(x, y, 7) < 0.3 ? P.g3 : P.g2;
    }));
  };
  S.herb = function (type) {
    return S.cached('herb' + type, () => S.mk(12, 12, (g) => {
      const stem = type === 'smokeweed' ? P.pur1 : P.g3;
      for (let i = 0; i < 5; i++) { R(g, stem, 2 + i * 2, 4 + (i % 2) * 2, 1, 8 - (i % 2) * 2); }
      if (type === 'yarrow') { [[1, 3], [5, 2], [9, 3], [3, 5], [7, 4]].forEach(([x, y]) => { R(g, P.white, x, y, 2, 2); R(g, P.y2, x, y, 1, 1); }); }
      else if (type === 'wintergreen') { [[1, 6], [4, 4], [7, 5], [9, 7], [5, 8]].forEach(([x, y]) => { R(g, P.g4, x, y, 3, 2); R(g, P.g5, x, y, 1, 1); }); R(g, P.r2, 5, 6, 1, 1); R(g, P.r2, 8, 8, 1, 1); }
      else { [[2, 2], [6, 1], [9, 3], [4, 5]].forEach(([x, y]) => { R(g, P.pur2, x, y, 2, 3); R(g, P.st3, x, y, 1, 1); }); }
    }));
  };
  S.mushrooms = function () {
    return S.cached('mush', () => S.mk(12, 10, (g) => {
      [[1, 4], [6, 2], [8, 5]].forEach(([x, y]) => { R(g, P.bone, x + 1, y + 2, 2, 3); R(g, P.y0, x, y, 4, 2); R(g, P.y1, x, y, 2, 1); });
    }));
  };
  S.branches = function (variant, snow) {
    return S.cached('br' + variant + '_' + snow, () => S.mk(16, 10, (g) => {
      const seed = 50 + variant;
      for (let b = 0; b < 3; b++) {
        const y0 = 2 + b * 2.5 + U.hashf(b, 1, seed) * 2, x0 = 1 + U.hashf(b, 2, seed) * 3, len = 9 + U.hashf(b, 3, seed) * 4;
        const sl = (U.hashf(b, 4, seed) - 0.5) * 0.4;
        for (let i = 0; i < len; i++) { R(g, i % 4 === 0 ? P.wood2 : P.wood3, x0 + i, y0 + i * sl, 1, 2); R(g, P.wood1, x0 + i, y0 + i * sl + 2, 1, 1); }
        R(g, P.wood5, x0 + len, y0 + len * sl, 1, 1);
      }
      if (snow > 1) { R(g, P.sn3, 4, 3, 3, 1); R(g, P.sn2, 9, 6, 2, 1); }
    }));
  };
  S.stump = function (snow) {
    return S.cached('stump' + snow, () => S.mk(14, 10, (g) => {
      R(g, P.wood1, 2, 3, 10, 7); R(g, P.wood2, 2, 3, 3, 7); R(g, P.wood4, 2, 1, 10, 3); R(g, P.wood5, 4, 2, 6, 1); R(g, P.wood3, 6, 2, 2, 1);
      if (snow) { R(g, P.sn2, 3, 1, 8, 1); }
    }));
  };
  S.reeds = function () {
    return S.cached('reeds', () => S.mk(12, 14, (g) => {
      for (let i = 0; i < 6; i++) { const x = 1 + i * 2; R(g, i % 2 ? P.gr3 : P.gr2, x, 3 + (i % 3), 1, 11 - (i % 3)); if (i % 2 === 0) R(g, P.wood2, x, 2 + (i % 3), 1, 3); }
    }));
  };

  // ---------------------------------------------------------------- Humanoids
  // x,y = feet centre. o: {dir, frame, moving, coat, coat2, pants, skin, hair, hat, hatColor, pale, breath, scarf}
  S.human = function (g, x, y, o) {
    x = Math.round(x); y = Math.round(y);
    const dir = o.dir || 'down', f = o.moving ? (o.frame | 0) % 4 : 0;
    const coat = o.coat || P.rg2, coat2 = o.coat2 || S.mix(coat, P.ink, 0.35), pants = o.pants || P.b0;
    const skin = o.skin || P.sk2, hair = o.hair || P.wood1;
    const bob = o.moving && (f === 1 || f === 3) ? -1 : 0;
    if (o.shadow !== false) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(x, y, 6, 2.2, 0, 0, 6.3); g.fill(); }
    // legs
    const legA = o.moving ? [0, -1, 0, 1][f] : 0;
    if (dir === 'left' || dir === 'right') {
      const s = dir === 'left' ? -1 : 1;
      R(g, pants, x - 2 + legA * s, y - 6, 2, 5); R(g, P.i1, x - 2 + legA * s, y - 2, 3, 2);
      R(g, S.mix(pants, P.ink, 0.3), x - legA * s, y - 6, 2, 5); R(g, P.i0, x - legA * s, y - 2, 3, 2);
    } else {
      R(g, pants, x - 3, y - 6 + (legA > 0 ? -1 : 0), 2, 5); R(g, pants, x + 1, y - 6 + (legA < 0 ? -1 : 0), 2, 5);
      R(g, P.i1, x - 3, y - 2 + (legA > 0 ? -1 : 0), 2, 2); R(g, P.i1, x + 1, y - 2 + (legA < 0 ? -1 : 0), 2, 2);
    }
    const by = y + bob;
    // torso
    R(g, coat, x - 4, by - 14, 8, 9);
    R(g, coat2, x + 2, by - 14, 2, 9);
    R(g, S.mix(coat, P.white, 0.15), x - 4, by - 14, 1, 8);
    R(g, coat2, x - 4, by - 7, 8, 1);
    if (dir === 'down') { R(g, coat2, x - 0.5, by - 13, 1, 7); R(g, P.y1, x - 1, by - 7, 1, 1); }
    if (o.scarf) { R(g, o.scarf, x - 4, by - 14, 8, 2); if (dir !== 'up') R(g, o.scarf, x + 1, by - 13, 2, 3); }
    // arms
    const sw = o.moving ? [0, 1, 0, -1][f] : 0;
    if (dir === 'left' || dir === 'right') {
      const s = dir === 'left' ? -1 : 1;
      R(g, coat2, x - 1 + sw * s, by - 13, 2, 6); R(g, skin, x - 1 + sw * s, by - 8, 2, 1);
      if (o.rifle) { R(g, P.wood2, x + s * 2, by - 10, s * 7, 1); R(g, P.i2, x + s * 8, by - 10, s * 3, 1); }
    } else {
      R(g, coat2, x - 6, by - 13 + sw, 2, 6); R(g, coat2, x + 4, by - 13 - sw, 2, 6);
      R(g, skin, x - 6, by - 8 + sw, 2, 1); R(g, skin, x + 4, by - 8 - sw, 2, 1);
      if (dir === 'up' && o.rifle) { R(g, P.wood2, x + 2, by - 15, 1, 8); R(g, P.i2, x + 2, by - 18, 1, 3); }
    }
    if (o.lantern) {
      const lx = dir === 'left' ? x - 6 : x + 5, ly = by - 8;
      R(g, P.i1, lx, ly - 1, 2, 1); R(g, P.f3, lx, ly, 2, 3); R(g, P.f4, lx, ly + 1, 1, 1);
    }
    // head
    const hy = by - 21;
    R(g, skin, x - 3, hy, 6, 7);
    R(g, S.mix(skin, P.ink, 0.25), x + 2, hy, 1, 7);
    if (dir === 'up') { R(g, hair, x - 3, hy, 6, 6); }
    else if (dir === 'down') {
      R(g, hair, x - 3, hy, 6, 2); R(g, hair, x - 3, hy, 1, 4); R(g, hair, x + 2, hy, 1, 4);
      const eyeC = o.pale ? P.ink : P.i0;
      if (!o.blink) { R(g, eyeC, x - 2, hy + 3, 1, 1); R(g, eyeC, x + 1, hy + 3, 1, 1); }
      if (o.eyeGlow) { R(g, P.eye, x - 2, hy + 3, 1, 1); R(g, P.eye, x + 1, hy + 3, 1, 1); }
      R(g, S.mix(skin, P.r1, 0.35), x - 1, hy + 5, 2, 1);
      if (o.beard) R(g, hair, x - 2, hy + 5, 4, 2);
    } else {
      const s = dir === 'left' ? -1 : 1;
      R(g, hair, x - 3, hy, 6, 2);
      R(g, hair, s > 0 ? x - 3 : x + 2, hy, 1, 5);
      if (!o.blink) R(g, P.i0, x + s * 1 + (s > 0 ? 0 : -1), hy + 3, 1, 1);
      R(g, skin, s > 0 ? x + 3 : x - 4, hy + 3, 1, 2);
      if (o.beard) R(g, hair, s > 0 ? x : x - 3, hy + 5, 3, 2);
    }
    // hat
    const hc = o.hatColor || P.wood3;
    if (o.hat === 'ranger') {
      R(g, S.mix(hc, P.ink, 0.3), x - 5, hy + 1, 10, 2); R(g, hc, x - 3, hy - 3, 6, 4); R(g, S.mix(hc, P.white, 0.15), x - 3, hy - 3, 6, 1);
      R(g, P.wood1, x - 3, hy, 6, 1);
    } else if (o.hat === 'beanie') {
      R(g, hc, x - 3, hy - 2, 6, 4); R(g, S.mix(hc, P.ink, 0.3), x - 3, hy + 1, 6, 1); R(g, S.mix(hc, P.white, 0.3), x - 1, hy - 3, 2, 1);
    } else if (o.hat === 'hood') {
      R(g, hc, x - 4, hy - 2, 8, 3); R(g, hc, x - 4, hy, 1, 7); R(g, hc, x + 3, hy, 1, 7);
      if (dir === 'up') R(g, hc, x - 4, hy, 8, 7);
    } else if (o.hat === 'cap') {
      R(g, hc, x - 3, hy - 2, 6, 3); if (dir === 'down') R(g, S.mix(hc, P.ink, 0.3), x - 3, hy + 1, 6, 1);
      else if (dir !== 'up') R(g, S.mix(hc, P.ink, 0.3), dir === 'left' ? x - 5 : x + 2, hy, 3, 1);
    }
    if (o.snowy) { R(g, P.sn3, x - 3, hy - 2, 2, 1); R(g, P.sn3, x + 2, by - 14, 2, 1); R(g, P.sn2, x - 4, by - 14, 1, 1); }
  };

  S.PLAYER = { coat: P.rg2, coat2: P.rg0, pants: P.wood1, skin: P.sk2, hair: P.wood1, hat: 'ranger', hatColor: P.wood4, scarf: P.r1 };

  // --------------------------------------------------------------- Animals
  S.animal = function (g, a, t) {
    const x = Math.round(a.x), y = Math.round(a.y);
    const left = a.face < 0;
    const fl = (px, w) => (left ? x - px - w : x + px);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    if (a.type === 'rabbit') {
      if (a.dead) { R(g, P.d2, x - 4, y - 3, 8, 3); R(g, P.d3, x - 4, y - 3, 8, 1); R(g, P.r1, x - 1, y - 2, 2, 1); return; }
      g.beginPath(); g.ellipse(x, y, 4, 1.5, 0, 0, 6.3); g.fill();
      const hop = a.moving ? Math.abs(Math.sin(t * 14)) * 3 : 0;
      const yy = y - hop;
      R(g, P.d2, fl(-4, 7), yy - 5, 7, 4); R(g, P.d3, fl(-3, 5), yy - 6, 5, 2); R(g, P.d1, fl(-4, 7), yy - 2, 7, 1);
      R(g, P.d2, fl(2, 3), yy - 7, 3, 3); R(g, P.d3, fl(2, 1), yy - 10, 1, 4); R(g, P.d2, fl(3, 1), yy - 10, 1, 4); R(g, P.r3, fl(2, 1), yy - 9, 1, 2);
      R(g, P.i0, fl(4, 1), yy - 6, 1, 1); R(g, P.white, fl(-5, 2), yy - 5, 2, 2);
    } else if (a.type === 'deer') {
      if (a.dead) { R(g, P.wood3, x - 9, y - 5, 18, 5); R(g, P.wood4, x - 9, y - 5, 18, 1); R(g, P.r1, x - 2, y - 3, 3, 2); return; }
      g.beginPath(); g.ellipse(x, y, 9, 2.5, 0, 0, 6.3); g.fill();
      const lf = a.moving ? Math.floor(t * 10) % 2 : 0;
      R(g, P.wood2, fl(-7, 2), y - 7 + lf, 2, 7 - lf); R(g, P.wood2, fl(5, 2), y - 7 + (1 - lf), 2, 7 - (1 - lf));
      R(g, P.wood1, fl(-5, 2), y - 7, 2, 7); R(g, P.wood1, fl(3, 2), y - 7, 2, 7);
      R(g, P.wood4, fl(-8, 15), y - 13, 15, 7); R(g, P.wood5, fl(-8, 15), y - 13, 15, 2); R(g, P.bone, fl(-7, 12), y - 7, 12, 1);
      const hu = a.grazing ? 4 : 0;
      R(g, P.wood4, fl(6, 3), y - 18 + hu, 3, 7); R(g, P.wood4, fl(7, 5), y - 20 + hu, 5, 4); R(g, P.wood2, fl(11, 1), y - 19 + hu, 1, 1);
      R(g, P.wood3, fl(6, 2), y - 22 + hu, 2, 2); R(g, P.i0, fl(9, 1), y - 19 + hu, 1, 1);
      R(g, P.white, fl(-9, 2), y - 13, 2, 3);
    } else if (a.type === 'crow') {
      g.beginPath(); g.ellipse(x, y + (a.flying ? 8 : 0), 3, 1, 0, 0, 6.3); g.fill();
      if (a.flying) {
        const fl2 = Math.floor(t * 16) % 2;
        R(g, P.i0, x - 2, y - 3, 4, 2); R(g, P.i1, x - 5, y - 4 - fl2 * 2, 3, 1 + fl2); R(g, P.i1, x + 2, y - 4 - fl2 * 2, 3, 1 + fl2);
      } else {
        R(g, P.i0, fl(-3, 5), y - 4, 5, 3); R(g, P.i1, fl(1, 2), y - 6, 2, 2); R(g, P.i3, fl(3, 1), y - 5, 1, 1);
        R(g, P.i0, fl(-4, 1), y - 4, 1, 2); R(g, P.i2, x, y - 1, 1, 1);
      }
    } else if (a.type === 'wolf') {
      if (a.dead) { R(g, P.st2, x - 8, y - 4, 16, 4); R(g, P.st3, x - 8, y - 4, 16, 1); return; }
      g.beginPath(); g.ellipse(x, y, 8, 2.2, 0, 0, 6.3); g.fill();
      const lf = a.moving ? Math.floor(t * 12) % 2 : 0;
      R(g, P.st1, fl(-6, 2), y - 5 + lf, 2, 5 - lf); R(g, P.st1, fl(4, 2), y - 5 + (1 - lf), 2, 5 - (1 - lf));
      R(g, P.st0, fl(-4, 2), y - 5, 2, 5); R(g, P.st0, fl(2, 2), y - 5, 2, 5);
      R(g, P.st2, fl(-7, 13), y - 10, 13, 5); R(g, P.st3, fl(-7, 13), y - 10, 13, 1); R(g, P.st1, fl(-7, 13), y - 6, 13, 1);
      R(g, P.st2, fl(5, 5), y - 12, 5, 4); R(g, P.st1, fl(9, 3), y - 10, 3, 2); R(g, P.st3, fl(5, 1), y - 14, 1, 2); R(g, P.st3, fl(7, 1), y - 14, 1, 2);
      R(g, a.angry ? P.f3 : P.i0, fl(8, 1), y - 11, 1, 1);
      R(g, P.st2, fl(-11, 4), y - 10, 4, 2);
    } else if (a.type === 'fox') {
      g.beginPath(); g.ellipse(x, y, 6, 1.8, 0, 0, 6.3); g.fill();
      R(g, P.f1, fl(-5, 9), y - 5, 9, 4); R(g, P.f2, fl(-5, 9), y - 5, 9, 1); R(g, P.white, fl(3, 3), y - 2, 3, 1);
      R(g, P.f1, fl(3, 4), y - 7, 4, 3); R(g, P.ink, fl(5, 1), y - 6, 1, 1); R(g, P.f1, fl(3, 1), y - 8, 1, 1);
      R(g, P.f1, fl(-9, 4), y - 4, 4, 2); R(g, P.white, fl(-10, 1), y - 4, 1, 2);
      if (a.injured) { R(g, P.r2, fl(-1, 2), y - 4, 2, 1); }
    }
  };

  S.dog = function (g, x, y, face, state, t) {
    x = Math.round(x); y = Math.round(y);
    const left = face < 0, fl = (px, w) => (left ? x - px - w : x + px);
    const C1 = P.wood5, C2 = P.wood4, C3 = P.wood6;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x, y, 7, 2, 0, 0, 6.3); g.fill();
    if (state === 'lying') {
      R(g, C2, fl(-6, 12), y - 4, 12, 4); R(g, C1, fl(-6, 12), y - 4, 12, 1);
      R(g, C1, fl(4, 4), y - 6, 4, 4); R(g, C2, fl(7, 2), y - 4, 2, 1); R(g, P.ink, fl(6, 1), y - 5, 1, 1);
      const tw = Math.floor(t * 3) % 2; R(g, C2, fl(-9, 3), y - 3 - tw, 3, 1);
      return;
    }
    if (state === 'trapped') {
      R(g, C2, fl(-5, 10), y - 5, 10, 4); R(g, C1, fl(3, 4), y - 7, 4, 4); R(g, P.ink, fl(5, 1), y - 6, 1, 1);
      R(g, P.i3, fl(-6, 13), y - 2, 13, 1); R(g, P.i2, fl(-2, 1), y - 4, 1, 3);
      return;
    }
    const lf = state === 'walk' ? Math.floor(t * 12) % 2 : 0;
    R(g, C2, fl(-5, 2), y - 5 + lf, 2, 5 - lf); R(g, C2, fl(3, 2), y - 5 + (1 - lf), 2, 5 - (1 - lf));
    R(g, C1, fl(-6, 11), y - 10, 11, 5); R(g, C3, fl(-6, 11), y - 10, 11, 1);
    R(g, C1, fl(4, 5), y - 13, 5, 5); R(g, C2, fl(8, 2), y - 10, 2, 2); R(g, P.ink, fl(9, 1), y - 11, 1, 1); R(g, P.ink, fl(6, 1), y - 12, 1, 1);
    R(g, C2, fl(4, 2), y - 14, 2, 2);
    const wag = Math.sin(t * (state === 'growl' ? 2 : 14)) > 0 ? -1 : 0;
    R(g, C2, fl(-9, 3), y - 11 + wag, 3, 1);
    R(g, P.r2, fl(5, 3), y - 9, 3, 1);
  };

  // --------------------------------------------------------------- Monsters
  S.lightHunter = function (g, x, y, t, scale) {
    scale = scale || 1;
    g.save(); g.translate(Math.round(x), Math.round(y)); g.scale(scale, scale);
    const sway = Math.sin(t * 1.3) * 1;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(0, 0, 7, 2, 0, 0, 6.3); g.fill();
    R(g, P.pale0, -4, -24, 2, 24); R(g, P.pale0, 2, -24, 2, 24);
    R(g, P.pale, -5, -44, 10, 21); R(g, P.pale2, -5, -44, 2, 21); R(g, P.pale0, 3, -44, 2, 21);
    for (let i = 0; i < 4; i++) R(g, P.pale0, -4, -40 + i * 4, 8, 1);
    R(g, P.pale, -8 + sway, -42, 2, 30); R(g, P.pale, 6 - sway, -42, 2, 30);
    R(g, P.pale0, -9 + sway, -13, 3, 3); R(g, P.pale0, 6 - sway, -13, 3, 3);
    R(g, P.pale, -4, -55, 8, 12); R(g, P.pale2, -4, -55, 3, 12); R(g, P.ink, -3, -47, 6, 3);
    const gl = 0.7 + Math.sin(t * 6) * 0.3;
    g.fillStyle = S.rgba(P.glow, gl); g.fillRect(-3, -52, 2, 2); g.fillRect(1, -52, 2, 2);
    g.restore();
  };
  // Close-up of the Light Hunter pressed against glass (drawn at view resolution)
  S.lhFace = function (g, cx, cy, t) {
    const br = Math.sin(t * 1.7) * 2;
    g.save(); g.translate(Math.round(cx), Math.round(cy + br));
    // hands pressed flat on the glass
    [-1, 1].forEach((s) => {
      const px = s * 70, py = 28;
      for (let y = -14; y <= 14; y++) for (let x = -12; x <= 12; x++) {
        if (x * x / 144 + y * y / 196 > 1) continue;
        R(g, (x * s) > 6 ? P.pale0 : (x * s) < -6 ? P.pale2 : P.pale, px + x, py + y, 1, 1);
      }
      for (let i = 0; i < 4; i++) {
        const ang = -Math.PI / 2 + s * (-0.55 + i * 0.36);
        const len = 30 + (i === 1 || i === 2 ? 10 : 0);
        for (let k = 0; k < len; k++) {
          const fx = px + Math.cos(ang) * (10 + k), fy = py + Math.sin(ang) * (10 + k);
          R(g, P.pale0, fx - 2, fy - 1, 4, 3); R(g, P.pale, fx - 1, fy - 1, 2, 2);
          if (k % 11 === 10) R(g, P.pale0, fx - 2, fy, 4, 1);
        }
        const tx = px + Math.cos(ang) * (10 + len), ty = py + Math.sin(ang) * (10 + len);
        R(g, P.pale2, tx - 2, ty - 2, 5, 4);
      }
      const th = s > 0 ? Math.PI * 0.15 : Math.PI * 0.85;
      for (let k = 0; k < 18; k++) R(g, P.pale0, px + Math.cos(th) * (10 + k) - 2, py + Math.sin(th) * (6 + k * 0.4) - 1, 4, 3);
    });
    // elongated skull-like head
    for (let y = -78; y < 80; y++) {
      const f = (y + 78) / 158;
      const hw = Math.round(f < 0.35 ? 34 * Math.pow(Math.sin(f / 0.35 * Math.PI / 2), 0.5) : 34 - (f - 0.35) / 0.65 * 25);
      if (hw <= 0) continue;
      for (let x = -hw; x <= hw; x++) {
        const edge = hw - Math.abs(x);
        let c = x < -hw * 0.35 ? P.pale2 : x > hw * 0.45 ? P.pale0 : P.pale;
        if (edge < 2) c = P.pale0;
        if (f > 0.42 && f < 0.6 && Math.abs(x) > hw * 0.55) c = P.pale0; // hollow cheeks
        if (U.hashf(x, y, 77) < 0.035) c = P.pale0;
        R(g, c, x, y, 1, 1);
      }
    }
    // deep eye sockets with burning pinpoints
    const gl = 0.75 + Math.sin(t * 6) * 0.25;
    [[-14, -22], [14, -22]].forEach(([ex, ey]) => {
      g.fillStyle = P.pale0; g.beginPath(); g.ellipse(ex, ey, 12, 15, 0, 0, 6.3); g.fill();
      g.fillStyle = P.ink; g.beginPath(); g.ellipse(ex, ey, 10, 13, 0, 0, 6.3); g.fill();
      g.fillStyle = S.rgba(P.glow, gl); g.fillRect(ex - 2, ey - 1, 4, 4);
      const gr = g.createRadialGradient(ex, ey, 0, ex, ey, 16); gr.addColorStop(0, S.rgba(P.glow, 0.35 * gl)); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(ex - 16, ey - 16, 32, 32);
    });
    // nasal slit and a mouth that runs too long
    R(g, P.pale0, -2, 0, 4, 10); R(g, P.ink, -1, 2, 2, 7);
    R(g, P.ink, -9, 24, 18, 3); R(g, P.ink, -2, 24, 4, 34); R(g, P.pale0, -10, 23, 20, 1);
    // breath fog on the glass
    g.fillStyle = 'rgba(220,228,236,' + (0.1 + Math.max(0, Math.sin(t * 1.7)) * 0.18) + ')';
    g.beginPath(); g.ellipse(0, 46, 30, 15, 0, 0, 6.3); g.fill();
    g.restore();
  };
  S.stag = function (g, x, y, t, alpha) {
    g.save(); g.globalAlpha = alpha == null ? 1 : alpha; g.translate(Math.round(x), Math.round(y));
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(0, 0, 7, 2, 0, 0, 6.3); g.fill();
    const st = Math.round(Math.sin(t * 2.2));
    // long digitigrade legs with hooves
    R(g, P.pale0, -4, -16, 2, 14); R(g, P.pale0, 2, -16, 2, 14); R(g, P.ink, -5, -2, 3, 2); R(g, P.ink, 2, -2, 3, 2);
    R(g, P.pale, -4, -22, 3, 7); R(g, P.pale, 2, -22, 3, 7);
    // gaunt torso, ribs
    R(g, P.pale2, -5, -36, 10, 15); R(g, P.pale0, 3, -36, 2, 15);
    for (let i = 0; i < 4; i++) R(g, P.pale0, -4, -33 + i * 3, 7, 1);
    // arms hanging to the knees
    R(g, P.pale, -8 + st, -35, 2, 20); R(g, P.pale, 6 - st, -35, 2, 20); R(g, P.pale0, -9 + st, -16, 3, 3); R(g, P.pale0, 6 - st, -16, 3, 3);
    // long deer skull
    R(g, P.bone, -3, -46, 6, 10); R(g, P.bone, -2, -38, 4, 4); R(g, P.pale0, 2, -46, 1, 12);
    R(g, P.ink, -3, -43, 2, 3); R(g, P.ink, 1, -43, 2, 3);
    const gl = 0.6 + Math.sin(t * 4) * 0.3;
    g.fillStyle = S.rgba(P.f4, gl); g.fillRect(-2, -42, 1, 1); g.fillRect(2, -42, 1, 1);
    // branching antlers like bare twigs
    g.strokeStyle = P.wood1; g.lineWidth = 1;
    const ant = [[-2, -46, -7, -56], [-7, -56, -12, -60], [-7, -56, -6, -64], [-5, -51, -11, -50], [-10, -59, -15, -58], [2, -46, 7, -56], [7, -56, 12, -60], [7, -56, 6, -64], [5, -51, 11, -50], [10, -59, 15, -58]];
    g.beginPath(); ant.forEach(([a, b, c, d]) => { g.moveTo(a + 0.5, b + 0.5); g.lineTo(c + 0.5, d + 0.5); }); g.stroke();
    // little bells
    const sw = Math.sin(t * 3) * 1.2;
    R(g, P.y1, -14 + sw, -57, 2, 2); R(g, P.y1, 13 - sw, -57, 2, 2); R(g, P.y0, -11 + sw, -49, 2, 2);
    g.restore();
  };
  S.scratcher = function (g, x, y, t, face) {
    g.save(); g.translate(Math.round(x), Math.round(y)); if (face < 0) g.scale(-1, 1);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(0, 0, 11, 2.5, 0, 0, 6.3); g.fill();
    const l = Math.floor(t * 8) % 2;
    R(g, P.ash1, -9, -6 + l, 3, 6 - l); R(g, P.ash1, 5, -6 + (1 - l), 3, 6 - (1 - l));
    R(g, P.mud2, -11, -14, 20, 9); R(g, P.ash2, -11, -14, 20, 2); R(g, P.mud1, -11, -7, 20, 2);
    for (let i = 0; i < 6; i++) R(g, P.ash2, -10 + i * 3, -15 - (i % 2), 1, 2);
    R(g, P.mud2, 7, -13, 7, 7); R(g, P.ash2, 8, -14, 5, 2); R(g, P.f2, 11, -11, 1, 1); R(g, P.f2, 9, -11, 1, 1);
    R(g, P.bone, 13, -7, 1, 3); R(g, P.bone, 11, -6, 1, 3); R(g, P.bone, 9, -6, 1, 2);
    R(g, P.bone, 14, -2, 3, 1); R(g, P.bone, 14, 0, 3, 1);
    g.restore();
  };
  S.siphon = function (g, x, y, t) {
    g.save(); g.translate(Math.round(x), Math.round(y));
    const b = Math.sin(t * 3) * 1;
    R(g, P.i0, -6, -10 + b, 12, 9); R(g, P.i1, -6, -10 + b, 12, 2);
    R(g, P.i0, -10, -8 + b, 4, 2); R(g, P.i0, 6, -8 + b, 4, 2); R(g, P.i0, -11, -6 + b, 2, 6); R(g, P.i0, 9, -6 + b, 2, 6);
    R(g, P.i1, -3, -15 + b, 6, 6); R(g, P.bone, -1, -11 + b, 2, 4);
    g.fillStyle = S.rgba(P.r3, 0.8); g.fillRect(-2, -13 + b, 1, 1); g.fillRect(1, -13 + b, 1, 1);
    g.restore();
  };

  // -------------------------------------------------------------- Furniture
  function planks(g, x, y, w, h, c1, c2, c3) {
    R(g, c1, x, y, w, h);
    for (let i = 0; i < h; i += 3) { R(g, c2, x, y + i, w, 1); }
    R(g, c3, x, y, w, 1);
  }
  S.furn = {};
  S.buildFurniture = function () {
    const F = S.furn;
    F.table = S.mk(40, 28, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 3, 22, 36, 5);
      R(g, P.wood1, 4, 16, 3, 10); R(g, P.wood1, 33, 16, 3, 10);
      planks(g, 1, 3, 38, 15, P.wood4, P.wood3, P.wood5); R(g, P.wood2, 1, 17, 38, 3);
      R(g, P.bone, 8, 6, 7, 5); R(g, P.white, 9, 7, 5, 3); R(g, P.wood1, 25, 7, 6, 4); R(g, P.wood5, 26, 7, 4, 1);
      R(g, P.i2, 17, 8, 1, 4);
    });
    F.chair = S.mk(14, 18, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 2, 14, 11, 3);
      R(g, P.wood2, 2, 0, 10, 7); R(g, P.wood3, 3, 1, 8, 1); R(g, P.wood1, 3, 4, 8, 1);
      R(g, P.wood3, 1, 7, 12, 5); R(g, P.wood4, 1, 7, 12, 1); R(g, P.wood1, 2, 12, 2, 5); R(g, P.wood1, 10, 12, 2, 5);
    });
    F.bed = S.mk(36, 50, (g) => {
      R(g, 'rgba(0,0,0,0.35)', 3, 44, 33, 5);
      R(g, P.wood2, 0, 0, 36, 8); R(g, P.wood3, 1, 1, 34, 2); R(g, P.wood1, 0, 7, 36, 1);
      R(g, P.wood1, 1, 8, 34, 39); R(g, P.bone, 3, 9, 30, 36);
      R(g, P.white, 5, 10, 12, 7); R(g, P.white, 19, 10, 12, 7); R(g, P.st4, 5, 16, 12, 1); R(g, P.st4, 19, 16, 12, 1);
      R(g, P.r1, 2, 19, 32, 28);
      for (let yy = 19; yy < 47; yy += 6) for (let xx = 2; xx < 34; xx += 6) { R(g, ((xx + yy) / 6) % 2 ? P.r2 : P.b1, xx + 1, yy + 1, 4, 4); }
      R(g, P.r0, 2, 45, 32, 2); R(g, P.r3, 2, 19, 32, 1);
      R(g, P.wood2, 0, 46, 36, 3);
    });
    F.nightstand = S.mk(14, 18, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 1, 14, 13, 3);
      R(g, P.wood3, 1, 4, 12, 12); R(g, P.wood4, 1, 4, 12, 2); R(g, P.wood2, 2, 9, 10, 1); R(g, P.y1, 6, 11, 2, 1);
      R(g, P.wood1, 3, 0, 4, 5); R(g, P.y2, 4, 1, 2, 3);
    });
    F.wardrobe = S.mk(30, 40, (g) => {
      R(g, 'rgba(0,0,0,0.35)', 2, 34, 28, 5);
      R(g, P.wood2, 0, 0, 30, 36); R(g, P.wood3, 1, 1, 28, 2); R(g, P.wood1, 14, 3, 2, 32);
      R(g, P.wood3, 2, 4, 11, 30); R(g, P.wood3, 17, 4, 11, 30); R(g, P.wood4, 2, 4, 11, 1); R(g, P.wood4, 17, 4, 11, 1);
      R(g, P.y1, 12, 18, 1, 3); R(g, P.y1, 17, 18, 1, 3); R(g, P.wood1, 0, 35, 30, 1);
    });
    F.trunk = S.mk(28, 16, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 2, 12, 26, 4);
      R(g, P.b1, 1, 2, 26, 12); R(g, P.b2, 1, 2, 26, 3); R(g, P.i2, 1, 5, 26, 1); R(g, P.i2, 6, 2, 1, 12); R(g, P.i2, 21, 2, 1, 12); R(g, P.y1, 13, 6, 2, 2);
    });
    F.chest = S.mk(32, 20, (g) => {
      R(g, 'rgba(0,0,0,0.35)', 2, 15, 30, 5);
      R(g, P.wood2, 1, 3, 30, 14); R(g, P.wood4, 1, 3, 30, 4); R(g, P.wood5, 2, 3, 28, 1);
      R(g, P.wood1, 1, 7, 30, 1); R(g, P.i2, 4, 3, 2, 14); R(g, P.i2, 26, 3, 2, 14); R(g, P.i3, 4, 3, 2, 1); R(g, P.i3, 26, 3, 2, 1);
      R(g, P.y1, 14, 7, 4, 3); R(g, P.y0, 15, 9, 2, 1);
    });
    F.shelves = S.mk(48, 30, (g) => {
      R(g, P.wood1, 0, 0, 48, 30); R(g, P.wood2, 1, 1, 46, 28);
      for (let s = 0; s < 3; s++) {
        const y = 8 + s * 9; R(g, P.wood4, 0, y, 48, 2);
        for (let i = 0; i < 7; i++) {
          const k = U.hash(i, s, 3) % 5, x = 3 + i * 6;
          if (k === 0) { R(g, P.ice0, x, y - 6, 4, 6); R(g, P.r2, x, y - 4, 4, 3); R(g, P.wood5, x, y - 7, 4, 1); }
          else if (k === 1) { R(g, P.i3, x, y - 5, 4, 5); R(g, P.i4, x, y - 5, 4, 1); }
          else if (k === 2) { R(g, P.bone, x - 1, y - 4, 5, 4); R(g, P.d3, x - 1, y - 4, 5, 1); }
          else if (k === 3) { R(g, P.ice1, x, y - 6, 3, 6); R(g, P.y1, x, y - 3, 3, 3); }
        }
      }
    });
    F.sawhorse = S.mk(34, 18, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 2, 14, 30, 4);
      R(g, P.wood2, 4, 8, 2, 9); R(g, P.wood2, 28, 8, 2, 9); R(g, P.wood1, 7, 8, 2, 9); R(g, P.wood1, 25, 8, 2, 9);
      R(g, P.wood4, 1, 5, 32, 4); R(g, P.wood5, 1, 5, 32, 1);
      R(g, P.i3, 10, 1, 14, 3); R(g, P.i4, 10, 1, 14, 1); R(g, P.wood2, 23, 0, 5, 4);
      for (let i = 0; i < 6; i++) R(g, P.wood6, 4 + i * 5, 13 + (i % 2), 2, 1);
    });
    F.desk = S.mk(52, 30, (g) => {
      R(g, 'rgba(0,0,0,0.35)', 3, 25, 49, 5);
      R(g, P.wood2, 1, 4, 50, 22); R(g, P.wood4, 1, 4, 50, 12); R(g, P.wood5, 1, 4, 50, 1); R(g, P.wood1, 1, 16, 50, 1);
      R(g, P.wood3, 3, 18, 14, 7); R(g, P.wood3, 35, 18, 14, 7); R(g, P.y1, 9, 21, 2, 1); R(g, P.y1, 41, 21, 2, 1);
      R(g, P.bone, 8, 6, 12, 8); R(g, P.white, 9, 6, 11, 7); for (let i = 0; i < 4; i++) R(g, P.st3, 10, 8 + i * 2, 8, 1);
      R(g, P.bone, 22, 7, 10, 7); R(g, P.d3, 22, 7, 10, 1); R(g, P.r2, 27, 9, 2, 2);
      R(g, P.wood1, 35, 6, 9, 7); R(g, P.r1, 36, 7, 7, 5);
      R(g, P.i1, 46, 5, 1, 8); R(g, P.b2, 44, 12, 5, 1);
    });
    F.radio = S.mk(32, 24, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 2, 20, 30, 4);
      R(g, P.wood2, 0, 9, 32, 12); R(g, P.wood3, 0, 9, 32, 1);
      R(g, P.i1, 3, 1, 26, 13); R(g, P.i2, 3, 1, 26, 2); R(g, P.i0, 5, 4, 12, 7);
      for (let i = 0; i < 5; i++) R(g, P.i2, 6, 5 + i, 10, 1);
      R(g, P.y0, 19, 4, 8, 4); R(g, P.y2, 20, 5, 6, 2); R(g, P.r2, 22, 5, 1, 2);
      R(g, P.i3, 19, 9, 3, 3); R(g, P.i3, 24, 9, 3, 3);
      R(g, P.i2, 27, 0, 1, 2); R(g, P.i2, 26, -2, 1, 2);
      R(g, P.bone, 3, 15, 10, 4); R(g, P.white, 4, 15, 8, 3);
    });
    F.cabinet = S.mk(20, 32, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 2, 27, 18, 5);
      R(g, P.i2, 1, 0, 18, 29); R(g, P.i3, 1, 0, 18, 2);
      for (let i = 0; i < 3; i++) { R(g, P.i1, 2, 4 + i * 8, 16, 1); R(g, P.i4, 8, 7 + i * 8, 4, 1); R(g, P.bone, 7, 5 + i * 8, 6, 1); }
    });
    F.bookshelf = S.mk(32, 34, (g) => {
      R(g, P.wood1, 0, 0, 32, 34); R(g, P.wood2, 1, 1, 30, 32);
      const cols = [P.r1, P.b1, P.rg2, P.y0, P.wood4, P.pur1, P.r2, P.b2];
      for (let s = 0; s < 3; s++) {
        const y = 10 + s * 10; R(g, P.wood4, 0, y, 32, 2);
        let x = 2;
        while (x < 29) { const w = 2 + (U.hash(x, s) % 2), h = 6 + (U.hash(x, s, 2) % 3); R(g, cols[U.hash(x, s, 4) % cols.length], x, y - h, w, h); R(g, P.bone, x, y - h + 2, w, 1); x += w + (U.hash(x, s, 9) % 3 === 0 ? 1 : 0); }
      }
    });
    F.armchair = S.mk(24, 24, (g) => {
      R(g, 'rgba(0,0,0,0.35)', 2, 19, 22, 5);
      R(g, P.rg1, 2, 0, 20, 10); R(g, P.rg2, 3, 1, 18, 2);
      R(g, P.rg1, 0, 6, 5, 14); R(g, P.rg1, 19, 6, 5, 14); R(g, P.rg2, 0, 6, 5, 2); R(g, P.rg2, 19, 6, 5, 2);
      R(g, P.rg2, 5, 9, 14, 10); R(g, P.rg3, 5, 9, 14, 1); R(g, P.wood1, 1, 20, 3, 3); R(g, P.wood1, 20, 20, 3, 3);
      R(g, P.b1, 6, 11, 8, 6); R(g, P.b2, 6, 11, 8, 1);
    });
    F.rug = S.mk(80, 52, (g) => {
      R(g, P.r0, 0, 0, 80, 52); R(g, P.r1, 2, 2, 76, 48);
      R(g, P.y0, 6, 6, 68, 40); R(g, P.r1, 8, 8, 64, 36); R(g, P.b0, 14, 14, 52, 24); R(g, P.r2, 16, 16, 48, 20);
      for (let i = 0; i < 6; i++) { R(g, P.y1, 20 + i * 8, 24, 4, 4); }
      for (let x = 0; x < 80; x += 4) { R(g, P.bone, x, 0, 1, 1); R(g, P.bone, x + 2, 51, 1, 1); }
    });
    F.rugSmall = S.mk(48, 30, (g) => {
      R(g, P.b0, 0, 0, 48, 30); R(g, P.b1, 2, 2, 44, 26); R(g, P.bone, 6, 6, 36, 18); R(g, P.b1, 8, 8, 32, 14);
      for (let i = 0; i < 4; i++) R(g, P.r2, 12 + i * 7, 13, 4, 4);
    });
    F.counter = S.mk(48, 30, (g) => {
      R(g, 'rgba(0,0,0,0.35)', 2, 25, 46, 5);
      R(g, P.wood2, 0, 8, 48, 18); R(g, P.wood3, 2, 13, 13, 11); R(g, P.wood3, 17, 13, 13, 11); R(g, P.wood3, 32, 13, 14, 11);
      R(g, P.y1, 13, 17, 1, 2); R(g, P.y1, 18, 17, 1, 2); R(g, P.y1, 33, 17, 1, 2);
      R(g, P.st2, 0, 4, 48, 6); R(g, P.st3, 0, 4, 48, 1);
      R(g, P.wood5, 4, 4, 12, 5); R(g, P.wood4, 4, 8, 12, 1); R(g, P.bone, 8, 5, 4, 2);
      R(g, P.i1, 28, 0, 14, 8); R(g, P.i2, 28, 0, 14, 2); R(g, P.i3, 29, 1, 12, 1); R(g, P.i0, 42, 3, 4, 1);
      // hanging utensils on the wall above
      R(g, P.i3, 20, 0, 1, 6); R(g, P.i3, 23, 0, 1, 5); R(g, P.wood3, 19, 5, 3, 2);
    });
    F.coatrack = S.mk(14, 30, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 2, 27, 11, 3);
      R(g, P.wood2, 6, 2, 2, 26); R(g, P.wood1, 3, 27, 8, 2); R(g, P.wood2, 3, 3, 8, 1);
      R(g, P.b1, 1, 4, 5, 12); R(g, P.b0, 1, 14, 5, 2); R(g, P.r1, 8, 4, 4, 8);
    });
    F.barrel = S.mk(16, 20, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 1, 16, 15, 4);
      R(g, P.wood3, 1, 2, 14, 16); R(g, P.wood2, 11, 2, 4, 16); R(g, P.wood4, 2, 2, 3, 16);
      R(g, P.i2, 1, 5, 14, 1); R(g, P.i2, 1, 14, 14, 1); R(g, P.wood2, 2, 0, 12, 3); R(g, P.wood1, 3, 1, 10, 1);
    });
    F.drum = S.mk(18, 24, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 1, 20, 17, 4);
      R(g, P.r1, 1, 3, 16, 19); R(g, P.r2, 2, 3, 4, 19); R(g, P.r0, 13, 3, 4, 19);
      R(g, P.i2, 1, 8, 16, 1); R(g, P.i2, 1, 16, 16, 1); R(g, P.i1, 2, 0, 14, 4); R(g, P.i3, 3, 1, 12, 1); R(g, P.i0, 11, 1, 2, 2);
      R(g, P.y1, 6, 10, 6, 4); R(g, P.ink, 8, 11, 2, 2);
    });
    F.sacks = S.mk(28, 18, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 1, 14, 27, 4);
      R(g, P.d3, 1, 4, 12, 12); R(g, P.bone, 2, 4, 9, 2); R(g, P.d2, 9, 4, 4, 12);
      R(g, P.d3, 13, 6, 13, 10); R(g, P.bone, 14, 6, 10, 2); R(g, P.d2, 22, 6, 4, 10); R(g, P.d1, 6, 3, 2, 2); R(g, P.d1, 19, 5, 2, 2);
    });
    F.wallmap = S.mk(36, 22, (g) => {
      R(g, P.wood1, 0, 0, 36, 22); R(g, P.bone, 2, 2, 32, 18);
      R(g, P.g4, 4, 4, 10, 6); R(g, P.g3, 16, 10, 12, 7); R(g, P.w3, 18, 3, 5, 4); R(g, P.w3, 25, 3, 2, 14);
      R(g, P.d2, 6, 12, 22, 1); R(g, P.d2, 17, 4, 1, 14); R(g, P.r2, 17, 11, 2, 2); R(g, P.r3, 10, 6, 1, 1); R(g, P.r3, 28, 15, 1, 1);
    });
    F.antlers = S.mk(24, 12, (g) => {
      R(g, P.wood2, 9, 6, 6, 5); R(g, P.bone, 3, 2, 1, 6); R(g, P.bone, 4, 7, 6, 1); R(g, P.bone, 20, 2, 1, 6); R(g, P.bone, 14, 7, 6, 1);
      R(g, P.bone, 1, 3, 2, 1); R(g, P.bone, 6, 3, 1, 4); R(g, P.bone, 21, 3, 2, 1); R(g, P.bone, 17, 3, 1, 4);
    });
    F.rifleRack = S.mk(30, 12, (g) => {
      R(g, P.wood1, 2, 2, 2, 8); R(g, P.wood1, 26, 2, 2, 8);
      R(g, P.wood3, 3, 4, 10, 2); R(g, P.i2, 13, 4, 15, 1); R(g, P.wood2, 9, 5, 4, 3);
    });
    F.photo = S.mk(12, 10, (g) => { R(g, P.wood3, 0, 0, 12, 10); R(g, P.b1, 1, 1, 10, 8); R(g, P.sk2, 3, 3, 2, 2); R(g, P.sk2, 7, 3, 2, 2); R(g, P.r1, 2, 5, 4, 3); R(g, P.rg2, 6, 5, 4, 3); });
    F.clock = S.mk(12, 26, (g) => { R(g, P.wood2, 1, 0, 10, 26); R(g, P.wood4, 2, 1, 8, 1); R(g, P.bone, 2, 3, 8, 8); R(g, P.i0, 5, 4, 1, 4); R(g, P.i0, 5, 7, 3, 1); R(g, P.y1, 5, 15, 2, 6); });
    F.stoveBase = S.mk(32, 44, (g) => {
      R(g, 'rgba(0,0,0,0.4)', 1, 38, 31, 6);
      // pipe up the wall
      R(g, P.i1, 12, 0, 8, 18); R(g, P.i2, 12, 0, 2, 18); R(g, P.i0, 18, 0, 2, 18); R(g, P.i2, 11, 8, 10, 2);
      // body
      R(g, P.i1, 2, 16, 28, 24); R(g, P.i2, 2, 16, 28, 3); R(g, P.i3, 3, 16, 26, 1); R(g, P.i0, 2, 37, 28, 3);
      R(g, P.i0, 3, 40, 3, 3); R(g, P.i0, 26, 40, 3, 3);
      R(g, P.i0, 7, 22, 18, 13); R(g, P.i2, 6, 21, 20, 1);
      R(g, P.i3, 24, 27, 3, 2);
    });
    F.woodbox = S.mk(20, 18, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 1, 14, 19, 4);
      R(g, P.wood2, 1, 4, 18, 12); R(g, P.wood3, 1, 4, 18, 2); R(g, P.wood1, 1, 15, 18, 1); R(g, P.wood1, 9, 6, 1, 9);
    });
    F.woodpile = S.mk(44, 30, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 2, 26, 42, 4);
      R(g, P.wood1, 0, 0, 44, 4); R(g, P.wood2, 0, 0, 44, 1); R(g, P.wood1, 1, 4, 2, 24); R(g, P.wood1, 41, 4, 2, 24);
    });
    F.lampTable = S.mk(10, 14, (g) => { R(g, P.i2, 3, 9, 4, 3); R(g, P.i1, 2, 12, 6, 2); R(g, P.ice1, 3, 3, 4, 6); R(g, P.i2, 3, 2, 4, 1); });
    F.lampWall = S.mk(10, 14, (g) => { R(g, P.i2, 4, 0, 2, 4); R(g, P.i2, 2, 4, 6, 1); R(g, P.ice1, 3, 5, 4, 6); R(g, P.i2, 2, 11, 6, 1); });
    F.guitar = S.mk(12, 26, (g) => { R(g, P.wood5, 2, 14, 8, 10); R(g, P.wood5, 3, 10, 6, 5); R(g, P.wood1, 5, 17, 2, 2); R(g, P.wood2, 5, 0, 2, 11); R(g, P.i3, 5, 0, 2, 2); });
    F.boots = S.mk(14, 8, (g) => { R(g, P.wood1, 1, 1, 4, 6); R(g, P.wood1, 1, 5, 6, 2); R(g, P.wood1, 8, 1, 4, 6); R(g, P.wood1, 8, 5, 6, 2); R(g, P.wood2, 1, 1, 4, 1); R(g, P.wood2, 8, 1, 4, 1); });
    F.washstand = S.mk(18, 26, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 2, 22, 16, 4);
      R(g, P.wood2, 3, 10, 2, 14); R(g, P.wood2, 13, 10, 2, 14); R(g, P.wood3, 1, 8, 16, 3); R(g, P.wood4, 1, 8, 16, 1);
      R(g, P.bone, 3, 4, 12, 5); R(g, P.white, 4, 4, 10, 2); R(g, P.b2, 5, 5, 8, 1); R(g, P.bone, 7, 0, 4, 4); R(g, P.white, 7, 0, 2, 1);
      R(g, P.wood3, 3, 18, 12, 2); R(g, P.bone, 5, 15, 8, 3);
    });
    F.logstack = S.mk(28, 20, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 1, 16, 27, 4);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 5 - r; c++) { const x = 2 + c * 5 + r * 2.5, y = 12 - r * 5; R(g, P.wood2, x, y, 5, 5); R(g, P.wood5, x + 1, y + 1, 3, 3); R(g, P.wood4, x + 2, y + 2, 1, 1); }
    });
    F.bench = S.mk(36, 14, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 2, 10, 34, 4);
      R(g, P.wood3, 0, 3, 36, 5); R(g, P.wood4, 0, 3, 36, 1); R(g, P.wood1, 3, 8, 3, 5); R(g, P.wood1, 30, 8, 3, 5);
      R(g, P.r1, 6, 1, 10, 3); R(g, P.r2, 6, 1, 10, 1);
    });
    F.toolwall = S.mk(40, 14, (g) => {
      R(g, P.wood2, 2, 2, 1, 10); R(g, P.i3, 0, 1, 5, 3);
      R(g, P.wood3, 9, 1, 2, 12); R(g, P.i3, 7, 1, 6, 2);
      R(g, P.y0, 18, 3, 10, 6); R(g, P.y1, 19, 4, 8, 4);
      R(g, P.wood2, 32, 2, 6, 10); R(g, P.i2, 33, 3, 4, 2);
    });
  };

  // ------------------------------------------------------------------ Icons
  S.icons = {};
  // Feature modules add item icons: S.registerIcon('fish', (g) => { ...draw on a 16x16 canvas... })
  const extraIcons = {};
  S.registerIcon = function (id, fn) { extraIcons[id] = fn; if (S._iconsBuilt) S.icons[id] = S.mk(16, 16, fn).toDataURL(); };
  S.buildIcons = function () {
    const I = {};
    const ic = (fn) => S.mk(16, 16, fn).toDataURL();
    I.wood = ic((g) => { [[2, 7], [6, 4], [5, 10]].forEach(([x, y]) => { R(g, P.wood2, x, y, 9, 4); R(g, P.wood3, x, y, 9, 1); R(g, P.wood5, x + 8, y, 2, 4); R(g, P.wood6, x + 9, y + 1, 1, 2); }); });
    I.plank = ic((g) => { R(g, P.wood4, 1, 5, 14, 5); R(g, P.wood5, 1, 5, 14, 1); R(g, P.wood2, 1, 9, 14, 1); R(g, P.wood3, 5, 7, 4, 1); });
    I.nails = ic((g) => { for (let i = 0; i < 4; i++) { R(g, P.i3, 3 + i * 3, 4 + (i % 2), 1, 8); R(g, P.i4, 2 + i * 3, 4 + (i % 2), 3, 1); } });
    I.scrap = ic((g) => { R(g, P.i2, 2, 6, 8, 6); R(g, P.i3, 6, 3, 7, 5); R(g, P.r1, 4, 8, 2, 2); R(g, P.i4, 7, 3, 5, 1); R(g, P.i1, 9, 9, 4, 4); });
    I.cloth = ic((g) => { R(g, P.bone, 2, 4, 12, 9); R(g, P.r2, 2, 6, 12, 1); R(g, P.r2, 2, 10, 12, 1); R(g, P.st4, 11, 4, 3, 9); });
    I.rope = ic((g) => { g.strokeStyle = P.d3; g.lineWidth = 2; g.beginPath(); g.ellipse(8, 8, 5, 4, 0, 0, 6.3); g.stroke(); g.strokeStyle = P.y0; g.lineWidth = 1; g.beginPath(); g.ellipse(8, 8, 3, 2, 0, 0, 6.3); g.stroke(); });
    I.glass = ic((g) => { R(g, P.bone, 2, 2, 12, 12); R(g, P.ice1, 3, 3, 10, 10); R(g, P.ice2, 4, 4, 3, 1); R(g, P.ice2, 4, 4, 1, 3); });
    I.ammo = ic((g) => { for (let i = 0; i < 3; i++) { R(g, P.y1, 3 + i * 4, 6, 2, 7); R(g, P.y2, 3 + i * 4, 6, 1, 7); R(g, P.wood4, 3 + i * 4, 3, 2, 3); } });
    I.oil = ic((g) => { R(g, P.r1, 4, 4, 9, 10); R(g, P.r2, 4, 4, 3, 10); R(g, P.i2, 5, 2, 4, 2); R(g, P.y1, 6, 7, 5, 3); });
    I.raw_rabbit = ic((g) => { R(g, P.r2, 3, 5, 10, 7); R(g, P.r3, 4, 5, 6, 2); R(g, P.bone, 12, 7, 3, 2); });
    I.raw_venison = ic((g) => { R(g, P.r1, 2, 4, 12, 8); R(g, P.r2, 3, 4, 9, 3); R(g, P.bone, 5, 7, 6, 1); R(g, P.white, 7, 6, 3, 3); });
    I.cooked_rabbit = ic((g) => { R(g, P.wood3, 3, 5, 10, 7); R(g, P.wood5, 4, 5, 6, 2); R(g, P.bone, 12, 7, 3, 2); R(g, P.wood2, 4, 10, 8, 1); });
    I.cooked_venison = ic((g) => { R(g, P.wood2, 2, 4, 12, 8); R(g, P.wood4, 3, 4, 9, 3); R(g, P.wood1, 5, 8, 6, 1); R(g, P.wood5, 4, 5, 2, 1); });
    I.berries = ic((g) => { [[4, 6], [8, 5], [6, 9], [10, 9], [9, 12]].forEach(([x, y]) => { R(g, P.r2, x, y, 3, 3); R(g, P.r3, x, y, 1, 1); }); R(g, P.g3, 7, 2, 2, 3); });
    I.mushroom = ic((g) => { R(g, P.bone, 7, 8, 2, 6); R(g, P.y1, 3, 4, 10, 4); R(g, P.y2, 4, 4, 5, 1); R(g, P.y0, 3, 7, 10, 1); });
    I.roast_mush = ic((g) => { R(g, P.bone, 7, 8, 2, 6); R(g, P.wood4, 3, 4, 10, 4); R(g, P.wood5, 4, 4, 5, 1); R(g, P.wood2, 3, 7, 10, 1); });
    I.canned = ic((g) => { R(g, P.i3, 4, 3, 8, 11); R(g, P.r2, 4, 6, 8, 5); R(g, P.y1, 6, 7, 4, 2); R(g, P.i4, 4, 3, 8, 1); });
    I.yarrow = ic((g) => { R(g, P.g3, 7, 5, 1, 9); R(g, P.g3, 4, 8, 1, 6); R(g, P.g3, 11, 7, 1, 7); [[3, 3], [7, 2], [10, 4], [4, 6]].forEach(([x, y]) => { R(g, P.white, x, y, 3, 2); R(g, P.y2, x + 1, y, 1, 1); }); });
    I.wintergreen = ic((g) => { [[3, 5], [8, 3], [6, 8], [10, 9]].forEach(([x, y]) => { R(g, P.g4, x, y, 4, 3); R(g, P.g5, x, y, 2, 1); }); R(g, P.r2, 7, 7, 2, 2); });
    I.smokeweed = ic((g) => { R(g, P.pur1, 7, 4, 1, 10); [[4, 3], [9, 2], [6, 6], [10, 7]].forEach(([x, y]) => { R(g, P.pur2, x, y, 2, 4); R(g, P.st3, x, y, 1, 1); }); });
    I.poultice = ic((g) => { R(g, P.bone, 3, 5, 10, 8); R(g, P.g4, 5, 7, 6, 4); R(g, P.d2, 3, 5, 10, 1); });
    I.tonic = ic((g) => { R(g, P.ice1, 6, 2, 4, 3); R(g, P.ice0, 4, 5, 8, 9); R(g, P.g4, 5, 8, 6, 5); R(g, P.wood3, 6, 1, 4, 2); R(g, P.ice2, 5, 6, 1, 4); });
    I.bandage = ic((g) => { R(g, P.white, 3, 4, 10, 8); R(g, P.bone, 3, 9, 10, 3); R(g, P.r2, 7, 5, 2, 6); R(g, P.r2, 5, 7, 6, 2); });
    I.medkit = ic((g) => { R(g, P.white, 2, 4, 12, 9); R(g, P.st4, 2, 11, 12, 2); R(g, P.r2, 7, 5, 2, 6); R(g, P.r2, 5, 7, 6, 2); R(g, P.i2, 6, 2, 4, 2); });
    for (const id in extraIcons) { try { I[id] = ic(extraIcons[id]); } catch (e) { console.error(e); } }
    S.icons = I; S._iconsBuilt = true;
  };

  // --------------------------------------------------------------- Portraits
  // Head-and-shoulders portrait of a visitor, 64x64. v = appearance, o = {blink, breath, t, reveal, snowy, eyeGlow}
  S.portrait = function (g, v, o) {
    const t = o.t || 0;
    R(g, P.night, 0, 0, 64, 64);
    // porch background: planks + lantern light
    for (let y = 0; y < 64; y += 6) { R(g, y % 12 ? P.log1 : P.log0, 0, y, 64, 5); R(g, P.chink2, 0, y + 5, 64, 1); }
    const grd = g.createRadialGradient(32, 26, 4, 32, 30, 46); grd.addColorStop(0, 'rgba(255,200,120,0.25)'); grd.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const skin = v.skin, sk2 = S.mix(skin, P.ink, 0.28), sk3 = S.mix(skin, P.white, 0.15);
    // shoulders / coat
    R(g, v.coat, 6, 48, 52, 16); R(g, S.mix(v.coat, P.ink, 0.3), 40, 48, 18, 16); R(g, S.mix(v.coat, P.white, 0.12), 6, 48, 52, 2);
    R(g, S.mix(v.coat, P.ink, 0.45), 31, 50, 2, 14);
    if (v.scarf) { R(g, v.scarf, 18, 44, 28, 7); R(g, S.mix(v.scarf, P.ink, 0.3), 18, 49, 28, 2); }
    // neck
    R(g, sk2, 27, 40, 10, 6);
    // face
    const fx = 20, fy = 14;
    R(g, skin, fx + 2, fy, 20, 28); R(g, skin, fx, fy + 3, 24, 22); R(g, sk2, fx + 19, fy + 3, 5, 22); R(g, sk3, fx + 1, fy + 4, 2, 14);
    R(g, sk2, fx + 3, fy + 27, 18, 1);
    if (v.old) { R(g, sk2, fx + 3, fy + 17, 4, 1); R(g, sk2, fx + 17, fy + 17, 4, 1); R(g, sk2, fx + 8, fy + 9, 8, 1); }
    // hair
    const hair = v.hair;
    if (v.hairStyle !== 'bald') { R(g, hair, fx, fy - 1, 24, 6); R(g, hair, fx - 1, fy + 2, 3, v.hairStyle === 'long' ? 26 : 12); R(g, hair, fx + 22, fy + 2, 3, v.hairStyle === 'long' ? 26 : 12); }
    if (v.beard) { R(g, hair, fx + 1, fy + 20, 22, 7); R(g, hair, fx + 3, fy + 27, 18, 3); R(g, skin, fx + 8, fy + 21, 8, 2); }
    // eyes
    const reveal = o.reveal || 0;
    const ey = fy + 11;
    if (reveal > 0) {
      R(g, P.ink, fx + 3, ey - 2, 7, 6); R(g, P.ink, fx + 14, ey - 2, 7, 6);
      R(g, S.rgba(P.r3, 0.9), fx + 6, ey, 1, 1); R(g, S.rgba(P.r3, 0.9), fx + 17, ey, 1, 1);
    } else if (o.blink) {
      R(g, sk2, fx + 4, ey + 1, 6, 1); R(g, sk2, fx + 14, ey + 1, 6, 1);
    } else {
      R(g, P.white, fx + 4, ey, 6, 3); R(g, P.white, fx + 14, ey, 6, 3);
      const lk = Math.round(Math.sin(t * 0.7) * 1);
      R(g, v.eyes || P.wood1, fx + 6 + lk, ey, 2, 3); R(g, v.eyes || P.wood1, fx + 16 + lk, ey, 2, 3);
      R(g, P.ink, fx + 6 + lk, ey + 1, 1, 1); R(g, P.ink, fx + 16 + lk, ey + 1, 1, 1);
      if (o.eyeGlow) { R(g, P.eye, fx + 7 + lk, ey, 1, 1); R(g, P.eye, fx + 17 + lk, ey, 1, 1); }
    }
    R(g, hair, fx + 3, ey - 3, 7, 1); R(g, hair, fx + 14, ey - 3, 7, 1);
    if (v.glasses && reveal <= 0) { g.strokeStyle = P.i2; g.lineWidth = 1; g.strokeRect(fx + 3.5, ey - 1.5, 8, 5); g.strokeRect(fx + 13.5, ey - 1.5, 8, 5); R(g, P.i2, fx + 11, ey, 3, 1); }
    // nose & mouth
    R(g, sk2, fx + 11, ey + 3, 2, 6); R(g, sk2, fx + 10, ey + 8, 4, 1);
    if (reveal > 0) {
      const open = Math.min(1, reveal) * 14;
      R(g, P.ink, fx + 4, fy + 21, 16, 2 + open); R(g, P.r0, fx + 6, fy + 23, 12, open - 2);
      for (let i = 0; i < 6; i++) { R(g, P.bone, fx + 5 + i * 2.6, fy + 21, 1, 3); R(g, P.bone, fx + 5 + i * 2.6, fy + 20 + open, 1, 3); }
    } else {
      const mw = o.talking && Math.sin(t * 18) > 0 ? 2 : 1;
      R(g, S.mix(skin, P.r1, 0.55), fx + 8, fy + 22, 8, mw);
    }
    // hat
    const hc = v.hatColor;
    if (v.hat === 'beanie') { R(g, hc, fx - 2, fy - 5, 28, 10); R(g, S.mix(hc, P.ink, 0.3), fx - 2, fy + 3, 28, 3); R(g, S.mix(hc, P.white, 0.25), fx + 8, fy - 8, 8, 4); for (let i = 0; i < 28; i += 3) R(g, S.mix(hc, P.ink, 0.15), fx - 2 + i, fy - 5, 1, 8); }
    else if (v.hat === 'hood') { R(g, hc, fx - 5, fy - 6, 34, 8); R(g, hc, fx - 5, fy, 5, 32); R(g, hc, fx + 24, fy, 5, 32); R(g, S.mix(hc, P.ink, 0.35), fx - 1, fy + 1, 2, 30); R(g, S.mix(hc, P.ink, 0.35), fx + 23, fy + 1, 2, 30); }
    else if (v.hat === 'cap') { R(g, hc, fx - 1, fy - 5, 26, 8); R(g, S.mix(hc, P.ink, 0.35), fx - 3, fy + 2, 30, 3); }
    if (o.snowy) { for (let i = 0; i < 26; i++) R(g, i % 3 ? P.sn3 : P.sn2, 6 + U.hashf(i, 1, 4) * 52, 46 + U.hashf(i, 2, 4) * 4, 2, 1); for (let i = 0; i < 10; i++) R(g, P.sn3, fx + U.hashf(i, 3, 4) * 24, fy - 6 + U.hashf(i, 4, 4) * 3, 1, 1); }
    // breath fog
    if (o.breath) {
      const ph = (t % 2.6) / 2.6;
      if (ph < 0.7) {
        const a = 0.5 * (1 - ph / 0.7);
        g.fillStyle = 'rgba(225,232,240,' + a + ')';
        for (let i = 0; i < 5; i++) { const r = 2 + ph * 10 + i; g.beginPath(); g.arc(32 + Math.sin(i * 2 + t) * 4 + ph * 6, fy + 26 + ph * 6 + i, r, 0, 6.3); g.fill(); }
      }
    }
    if (o.wet) { for (let i = 0; i < 8; i++) R(g, P.b3, 8 + U.hashf(i, 7, 2) * 48, 50 + U.hashf(i, 8, 2) * 12, 1, 2); }
  };

  S.init = function () { S.buildFurniture(); S.buildIcons(); };
})(window.NW);
