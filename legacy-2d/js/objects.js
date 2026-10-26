'use strict';
// World objects: sprites + contextual actions for everything the player can use.
(function (NW) {
  const U = NW.U, D = NW.D, S = NW.S, I = NW.Inv;
  const P = S.P, R = S.R;
  const O = NW.Objects = {};
  const RESPAWN = { branches: 2, deadtree: 5, bush: 3, mushrooms: 2, herb: 3 };
  const G = () => NW.G;
  const st = () => NW.G.state;

  O.available = function (o) {
    if (!o.res) return true;
    const t = st().world.taken[o.key];
    if (t == null) return true;
    return st().time.day - t >= RESPAWN[o.type];
  };
  function take(o) { st().world.taken[o.key] = st().time.day; }

  // ------------------------------------------------------------- Struct art
  function sprite(key, w, h, fn) { return S.cached('st_' + key, () => S.mk(w, h, fn)); }
  const STRUCT = {
    firetower: () => sprite('firetower', 64, 112, (g) => {
      const legs = [[8, 6], [54, 58]];
      g.strokeStyle = P.wood2; g.lineWidth = 3;
      g.beginPath(); g.moveTo(8, 110); g.lineTo(18, 38); g.moveTo(56, 110); g.lineTo(46, 38); g.stroke();
      g.strokeStyle = P.wood1; g.lineWidth = 2;
      g.beginPath(); g.moveTo(10, 96); g.lineTo(52, 70); g.moveTo(54, 96); g.lineTo(12, 70); g.moveTo(14, 66); g.lineTo(48, 46); g.moveTo(50, 66); g.lineTo(16, 46); g.stroke();
      R(g, P.wood1, 10, 96, 44, 2); R(g, P.wood1, 14, 66, 36, 2);
      void legs;
      R(g, P.wood2, 10, 22, 44, 18); R(g, P.wood3, 10, 22, 44, 2); R(g, P.ink, 14, 26, 12, 8); R(g, P.ink, 38, 26, 12, 8); R(g, P.b0, 15, 27, 10, 6); R(g, P.b0, 39, 27, 10, 6);
      R(g, P.wood1, 6, 38, 52, 3);
      g.fillStyle = P.r1; g.beginPath(); g.moveTo(4, 24); g.lineTo(32, 6); g.lineTo(60, 24); g.fill();
      R(g, P.r0, 4, 23, 56, 2); R(g, P.i2, 31, 2, 2, 6);
    }),
    dock: () => sprite('dock', 32, 80, (g) => {
      R(g, 'rgba(0,0,0,0.35)', 3, 4, 28, 76);
      for (let i = 0; i < 19; i++) { const y = i * 4 + 2; R(g, i % 3 === 0 ? P.wood3 : P.wood4, 2, y, 28, 3); R(g, P.wood1, 2, y + 3, 28, 1); if (i % 4 === 1) R(g, P.wood5, 4 + (i * 7) % 18, y, 6, 1); }
      R(g, P.wood1, 1, 0, 2, 80); R(g, P.wood1, 29, 0, 2, 80);
      [0, 26, 52].forEach((y) => { R(g, P.wood0, 0, y, 4, 6); R(g, P.wood0, 28, y, 4, 6); R(g, P.wood2, 0, y, 4, 1); R(g, P.wood2, 28, y, 4, 1); });
      R(g, P.i3, 7, 1, 1, 1); R(g, P.i3, 24, 1, 1, 1);
    }),
    mast: () => sprite('mast', 34, 120, (g) => {
      g.strokeStyle = P.i3; g.lineWidth = 1;
      g.beginPath(); g.moveTo(3, 118); g.lineTo(15, 6); g.moveTo(31, 118); g.lineTo(19, 6); g.stroke();
      for (let y = 112; y > 10; y -= 10) { const k = (118 - y) / 112 * 12; g.beginPath(); g.moveTo(3 + k, y); g.lineTo(31 - k, y - 10); g.moveTo(31 - k, y); g.lineTo(3 + k, y - 10); g.stroke(); }
      R(g, P.i2, 12, 2, 10, 5); R(g, P.i3, 13, 0, 8, 2); R(g, P.bone, 22, 30, 8, 5); R(g, P.i1, 0, 116, 34, 4);
    }),
    log: () => sprite('log', 44, 14, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 2, 10, 42, 4); R(g, P.wood2, 2, 2, 40, 9); R(g, P.wood3, 2, 2, 40, 3); R(g, P.wood1, 2, 9, 40, 2);
      R(g, P.wood5, 40, 2, 4, 9); R(g, P.wood4, 41, 4, 2, 5); for (let x = 6; x < 38; x += 7) R(g, P.wood1, x, 4, 3, 1); R(g, P.g3, 12, 2, 6, 1);
    }),
    standing: () => sprite('standing', 14, 28, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 1, 24, 13, 4); R(g, P.st2, 2, 2, 10, 24); R(g, P.st3, 2, 2, 3, 24); R(g, P.st1, 9, 2, 3, 24); R(g, P.st3, 3, 0, 7, 3);
      R(g, P.st1, 5, 8, 4, 1); R(g, P.st1, 6, 9, 1, 4); R(g, P.g3, 2, 20, 4, 4);
    }),
    altar: () => sprite('altar', 24, 14, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 1, 10, 23, 4); R(g, P.st2, 1, 2, 22, 9); R(g, P.st3, 1, 2, 22, 2); R(g, P.r0, 8, 4, 7, 4); R(g, P.r1, 10, 5, 3, 2);
    }),
    mine: () => sprite('mine', 96, 60, (g) => {
      for (let i = 0; i < 260; i++) { const x = U.hashf(i, 1, 3) * 96, y = U.hashf(i, 2, 3) * 50; const c = U.hashf(i, 3, 3); R(g, c < 0.3 ? P.st1 : c < 0.7 ? P.st2 : P.st3, x, y, 5, 4); }
      R(g, P.ink, 34, 18, 28, 36); R(g, P.wood2, 30, 14, 4, 42); R(g, P.wood2, 62, 14, 4, 42); R(g, P.wood3, 28, 12, 40, 5);
      for (let i = 0; i < 3; i++) R(g, P.wood4, 32, 26 + i * 9, 32, 3);
      R(g, P.i2, 40, 52, 16, 1); R(g, P.i2, 40, 56, 16, 1);
    }),
    cart: () => sprite('cart', 22, 16, (g) => { R(g, P.i2, 2, 2, 18, 9); R(g, P.i3, 2, 2, 18, 2); R(g, P.r1, 4, 5, 14, 4); R(g, P.i0, 3, 11, 4, 4); R(g, P.i0, 15, 11, 4, 4); }),
    shack: () => sprite('shack', 76, 64, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 2, 58, 74, 6);
      g.fillStyle = P.wood1; g.beginPath(); g.moveTo(0, 26); g.lineTo(38, 2); g.lineTo(76, 28); g.lineTo(76, 34); g.lineTo(0, 32); g.fill();
      for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? P.wood2 : P.wood1; g.fillRect(4 + i * 12, 8 + Math.abs(i - 3) * 4, 10, 24 - Math.abs(i - 3) * 4); }
      R(g, P.log1, 4, 32, 68, 28); for (let y = 34; y < 60; y += 5) { R(g, P.log2, 4, y, 68, 3); R(g, P.log0, 4, y + 3, 68, 1); }
      R(g, P.wood0, 30, 40, 14, 20); R(g, P.wood1, 31, 41, 12, 19); R(g, P.ink, 10, 40, 12, 9); R(g, P.ink, 54, 40, 12, 9); R(g, P.wood2, 10, 44, 12, 1); R(g, P.wood2, 54, 44, 12, 1);
      R(g, P.wood3, 52, 39, 16, 2);
    }),
    pelts: () => sprite('pelts', 22, 22, (g) => { R(g, P.wood1, 1, 2, 2, 20); R(g, P.wood1, 19, 2, 2, 20); R(g, P.wood2, 0, 2, 22, 2); R(g, P.wood4, 4, 4, 6, 12); R(g, P.st3, 12, 4, 6, 10); R(g, P.wood5, 5, 5, 4, 2); }),
    blind: () => sprite('blind', 36, 58, (g) => {
      R(g, P.wood1, 4, 24, 3, 34); R(g, P.wood1, 29, 24, 3, 34); g.strokeStyle = P.wood2; g.lineWidth = 2; g.beginPath(); g.moveTo(5, 56); g.lineTo(30, 30); g.stroke();
      R(g, P.wood2, 2, 6, 32, 20); R(g, P.wood3, 2, 6, 32, 2); R(g, P.ink, 8, 12, 20, 5); R(g, P.g2, 0, 2, 36, 6); R(g, P.g3, 2, 2, 30, 2);
      for (let y = 30; y < 56; y += 6) R(g, P.wood3, 14, y, 8, 2);
    }),
    charred: () => sprite('charred', 14, 26, (g) => { R(g, P.ash0, 4, 2, 6, 24); R(g, P.ash1, 4, 2, 2, 24); R(g, P.ash0, 1, 8, 4, 2); R(g, P.ash0, 9, 12, 4, 2); R(g, P.f1, 6, 20, 1, 1); }),
    tent: () => sprite('tent', 44, 30, (g) => {
      g.fillStyle = P.y0; g.beginPath(); g.moveTo(2, 28); g.lineTo(22, 2); g.lineTo(42, 28); g.fill();
      g.fillStyle = P.y1; g.beginPath(); g.moveTo(2, 28); g.lineTo(22, 2); g.lineTo(22, 28); g.fill();
      g.fillStyle = P.ink; g.beginPath(); g.moveTo(16, 28); g.lineTo(22, 12); g.lineTo(28, 28); g.fill();
      R(g, P.wood1, 21, 0, 2, 4); g.strokeStyle = P.st3; g.beginPath(); g.moveTo(30, 12); g.lineTo(36, 18); g.stroke();
    }),
    tent2: () => sprite('tent2', 36, 18, (g) => { g.fillStyle = P.b1; g.beginPath(); g.moveTo(1, 16); g.lineTo(10, 4); g.lineTo(26, 8); g.lineTo(35, 16); g.fill(); R(g, P.b2, 10, 6, 10, 2); R(g, P.i2, 26, 6, 1, 10); }),
    firepit: () => sprite('firepit', 20, 12, (g) => { for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; R(g, P.st2, 8 + Math.cos(a) * 7, 5 + Math.sin(a) * 4, 4, 3); } R(g, P.ash1, 6, 4, 8, 4); R(g, P.wood0, 7, 5, 6, 1); }),
    oak: () => sprite('oak', 80, 88, (g) => {
      for (let i = 0; i < 380; i++) { const a = U.hashf(i, 1, 9) * 6.28, r = Math.sqrt(U.hashf(i, 2, 9)) * 34; const c = U.hashf(i, 3, 9); R(g, c < 0.3 ? P.wood2 : c < 0.6 ? P.r1 : c < 0.8 ? P.y0 : P.wood3, 40 + Math.cos(a) * r, 30 + Math.sin(a) * r * 0.75, 3, 3); }
      R(g, P.wood1, 30, 40, 20, 46); R(g, P.wood2, 30, 40, 7, 46); R(g, P.wood0, 45, 40, 5, 46); R(g, P.ink, 35, 60, 10, 14); R(g, P.wood0, 34, 59, 12, 1);
      R(g, P.wood1, 22, 80, 10, 6); R(g, P.wood1, 48, 80, 12, 6); R(g, P.wood1, 18, 44, 14, 3); R(g, P.wood1, 48, 48, 16, 3);
    }),
    car: () => sprite('car', 56, 34, (g) => {
      R(g, 'rgba(0,0,0,0.35)', 3, 26, 52, 7);
      R(g, P.r1, 2, 8, 52, 18); R(g, P.r2, 2, 8, 52, 3); R(g, P.r0, 2, 23, 52, 3);
      R(g, P.wood2, 8, 10, 8, 4); R(g, P.wood1, 30, 16, 12, 5);
      R(g, P.i1, 18, 2, 18, 9); R(g, P.b0, 20, 3, 14, 6); R(g, P.ice0, 21, 3, 4, 2);
      R(g, P.i0, 6, 24, 9, 7); R(g, P.i0, 40, 24, 9, 7); R(g, P.i2, 8, 26, 5, 3); R(g, P.i2, 42, 26, 5, 3);
    }),
    gate: () => sprite('gate', 60, 16, (g) => { R(g, P.wood1, 2, 2, 4, 14); R(g, P.wood1, 54, 2, 4, 14); R(g, P.y1, 6, 4, 44, 3); for (let x = 8; x < 50; x += 8) R(g, P.ink, x, 4, 4, 3); }),
    board: () => sprite('board', 30, 30, (g) => { R(g, P.wood1, 4, 10, 2, 20); R(g, P.wood1, 24, 10, 2, 20); R(g, P.wood2, 1, 2, 28, 16); R(g, P.wood3, 1, 2, 28, 2); R(g, P.bone, 4, 5, 8, 9); R(g, P.white, 15, 6, 10, 7); R(g, P.r2, 6, 6, 2, 2); }),
  };
  O.STRUCT = STRUCT;

  function lootSprite(lm, opened) {
    return S.cached('loot' + lm + (opened ? 'o' : ''), () => S.mk(22, 18, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 2, 14, 20, 4);
      if (lm === 'camp') { R(g, P.rg1, 4, 3, 14, 13); R(g, P.rg2, 4, 3, 14, 3); R(g, P.wood2, 6, 7, 10, 1); R(g, P.y1, 10, 9, 2, 2); if (opened) R(g, P.ink, 6, 3, 10, 2); }
      else if (lm === 'mast' || lm === 'trailhead') { R(g, lm === 'mast' ? P.r1 : P.b1, 2, 6, 18, 10); R(g, lm === 'mast' ? P.r2 : P.b2, 2, 6, 18, 2); R(g, P.i2, 8, 3, 6, 3); if (opened) R(g, P.ink, 3, 6, 16, 2); }
      else { R(g, P.wood2, 2, 4, 18, 12); R(g, P.wood4, 2, 4, 18, 3); R(g, P.wood1, 2, 9, 18, 1); R(g, P.wood1, 10, 4, 1, 12); if (opened) { R(g, P.ink, 3, 4, 16, 3); R(g, P.wood5, 2, 1, 18, 3); } }
    }));
  }
  function cairnSprite() {
    return S.cached('cairn', () => S.mk(22, 26, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 2, 22, 20, 4);
      [[3, 16, 16, 7], [5, 10, 12, 6], [7, 5, 8, 5], [9, 1, 5, 4]].forEach(([x, y, w, h], i) => { R(g, i % 2 ? P.r1 : P.r2, x, y, w, h); R(g, P.r3, x, y, w, 1); R(g, P.r0, x, y + h - 1, w, 1); });
    }));
  }
  function signSprite() { return S.cached('sign', () => S.mk(20, 22, (g) => { R(g, P.wood1, 9, 8, 2, 14); R(g, P.wood3, 1, 1, 18, 9); R(g, P.wood4, 1, 1, 18, 1); R(g, P.wood1, 3, 4, 14, 1); R(g, P.wood1, 3, 6, 10, 1); })); }

  // Exterior cabin (cached by snow level)
  O.cabinExt = function (snow) {
    return S.cached('cabinext' + snow, () => S.mk(256, 156, (g) => {
      const ox = 136, oy = 28; // world origin
      const L = (wx) => wx - ox, T = (wy) => wy - oy;
      // annex roof & wall
      R(g, P.log1, L(336), T(128), 48, 32); for (let y = T(128); y < T(160); y += 5) { R(g, P.log2, L(336), y, 48, 3); R(g, P.chink2, L(336), y + 3, 48, 1); }
      R(g, P.wood2, L(334), T(78), 52, 52); for (let y = T(80); y < T(128); y += 4) R(g, P.wood1, L(334), y, 52, 1); R(g, P.wood3, L(334), T(126), 52, 3);
      // annex back door
      R(g, P.wood0, L(351), T(134), 18, 26); R(g, P.wood3, L(352), T(135), 16, 25); for (let x = L(355); x < L(368); x += 4) R(g, P.wood2, x, T(135), 1, 25); R(g, P.y1, L(365), T(148), 2, 2);
      // main front wall
      R(g, P.log1, L(144), T(144), 192, 32);
      for (let y = T(144); y < T(176); y += 6) { R(g, P.log3, L(144), y, 192, 2); R(g, P.log2, L(144), y + 2, 192, 2); R(g, P.log1, L(144), y + 4, 192, 1); R(g, P.chink2, L(144), y + 5, 192, 1); }
      for (let y = T(144); y < T(176); y += 6) { R(g, P.log4, L(140), y, 6, 5); R(g, P.log4, L(334), y, 6, 5); R(g, P.log2, L(141), y + 1, 4, 3); R(g, P.log2, L(335), y + 1, 4, 3); }
      // roof: back slope then front slope
      R(g, P.wood1, L(138), T(36), 204, 54);
      for (let y = T(38); y < T(90); y += 5) for (let x = L(138) + ((y / 5) % 2) * 6; x < L(342); x += 12) { R(g, P.wood0, x, y, 1, 5); }
      for (let y = T(38); y < T(90); y += 5) R(g, P.wood0, L(138), y + 4, 204, 1);
      R(g, P.wood3, L(136), T(88), 208, 4); R(g, P.wood4, L(136), T(88), 208, 1);
      R(g, P.wood2, L(138), T(92), 204, 54);
      for (let y = T(92); y < T(146); y += 5) for (let x = L(138) + ((y / 5) % 2) * 6; x < L(342); x += 12) R(g, P.wood1, x, y, 1, 5);
      for (let y = T(92); y < T(146); y += 5) { R(g, P.wood1, L(138), y + 4, 204, 1); R(g, P.wood3, L(138), y, 204, 1); }
      R(g, P.wood0, L(136), T(144), 208, 3);
      // snow on roof
      if (snow > 0) {
        for (let y = T(36); y < T(146); y++) for (let x = L(138); x < L(342); x += 1) {
          const n = S.fbm(x * 0.035, y * 0.09, 21) + (y < T(90) ? (T(90) - y) * 0.002 : (T(146) - y) * 0.0025) + (U.hashf(x, y, 3) - 0.5) * 0.04;
          const th = 0.78 - snow * 0.11;
          if (n > th) { const c = n > th + 0.12 ? P.sn3 : y < T(90) ? P.sn1 : P.sn2; R(g, c, x, y, 1, 1); }
        }
        R(g, P.sn3, L(136), T(88), 208, 1);
      }
      // chimney stone stack
      R(g, P.st1, L(178), T(52), 20, 30); for (let y = T(52); y < T(82); y += 5) for (let x = L(178) + ((y / 5) % 2) * 4; x < L(198); x += 8) { R(g, P.st2, x, y, 6, 4); R(g, P.st3, x, y, 6, 1); }
      R(g, P.st0, L(176), T(48), 24, 6); R(g, P.ink, L(180), T(49), 16, 3);
      // windows frames (dark glass; glow drawn dynamically)
      [[184, 152], [272, 152]].forEach(([wx, wy]) => { R(g, P.wood1, L(wx) - 2, T(wy) - 2, 28, 18); R(g, P.ink, L(wx), T(wy), 24, 14); R(g, P.wood1, L(wx) + 11, T(wy), 2, 14); R(g, P.wood5, L(wx) - 3, T(wy) + 14, 30, 2); });
      // front door
      R(g, P.wood0, L(228), T(146), 24, 30); R(g, P.wood3, L(229), T(147), 22, 29); for (let x = L(232); x < L(250); x += 5) R(g, P.wood2, x, T(147), 1, 29);
      R(g, P.i2, L(229), T(152), 22, 2); R(g, P.i2, L(229), T(166), 22, 2); R(g, P.y1, L(246), T(160), 2, 3);
      R(g, P.wood4, L(222), T(176), 36, 3); R(g, P.wood2, L(222), T(179), 36, 2);
      // eaves posts & lantern hook
      R(g, P.wood1, L(144), T(146), 3, 30); R(g, P.wood1, L(333), T(146), 3, 30);
    }));
  };
  // ------------------------------------------------------------- Draw
  // Draw an object at its world position (area-local, offset applied by caller via translate)
  O.draw = function (g, o, t) {
    if (typeof o.draw === 'function') { try { o.draw(g, t, o); } catch (e) { console.error(e); } return; }
    const s = st(); const snow = Math.min(3, Math.floor(s.weather.snow * 4 + 0.1));
    switch (o.type) {
      case 'tree': {
        const spr = o.kind === 'birch' ? S.birch(snow, o.variant) : S.pine(o.size, snow, o.variant);
        const sway = s.weather.wind > 0.5 ? Math.round(Math.sin(t * 1.5 + o.x * 0.1) * 0.6) : 0;
        g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(o.x, o.y - 1, spr.width * 0.32, 3, 0, 0, 6.3); g.fill();
        g.drawImage(spr, Math.round(o.x - spr.width / 2) + sway, o.y - spr.height + 1);
        break;
      }
      case 'deadtree': { const spr = S.deadTree(snow ? 1 : 0, o.variant, !O.available(o)); g.drawImage(spr, o.x - 12, o.y - 40 + 1); break; }
      case 'rock': { const spr = S.rock(o.variant, snow); g.drawImage(spr, Math.round(o.x - spr.width / 2), o.y - spr.height + 1); break; }
      case 'stump': g.drawImage(S.stump(snow ? 1 : 0), o.x - 7, o.y - 9); break;
      case 'reeds': g.drawImage(S.reeds(), o.x - 6, o.y - 14); break;
      case 'bush': g.drawImage(S.bush(O.available(o), snow ? 1 : 0), o.x - 8, o.y - 12); break;
      case 'herb': if (O.available(o)) g.drawImage(S.herb(o.herb), o.x - 6, o.y - 11); break;
      case 'mushrooms': if (O.available(o)) g.drawImage(S.mushrooms(), o.x - 6, o.y - 9); break;
      case 'branches': if (O.available(o)) g.drawImage(S.branches(o.variant, snow), o.x - 8, o.y - 8); break;
      case 'struct': { const spr = STRUCT[o.sprite](); g.drawImage(spr, Math.round(o.x - spr.width / 2), o.y - spr.height + 1);
        if (o.sprite === 'mast' && Math.sin(t * 3) > 0) { R(g, P.r3, o.x - 1, o.y - 120, 3, 3); }
        break; }
      case 'loot': { const spr = lootSprite(o.lm, !lootReady(o)); g.drawImage(spr, o.x - 11, o.y - 16); break; }
      case 'cairn': g.drawImage(cairnSprite(), o.x - 11, o.y - 24); break;
      case 'sign': g.drawImage(signSprite(), o.x - 10, o.y - 21); break;
      case 'chopblock': R(g, P.wood2, o.x - 6, o.y - 7, 12, 7); R(g, P.wood4, o.x - 6, o.y - 8, 12, 3); R(g, P.i3, o.x - 1, o.y - 14, 2, 6); R(g, P.wood1, o.x, o.y - 18, 1, 5); break;
      case 'cabin_ext': drawCabinExt(g, o, t, snow); break;
      case 'cabin_annex': drawCabinAnnex(g, t, snow); break;
      case 'woodpile_ext': {
        g.drawImage(S.furn.woodpile, o.x - 22, o.y - 30);
        const n = s.woodpile;
        for (let i = 0; i < Math.min(40, n); i++) {
          const col = i % 10, row = Math.floor(i / 10);
          const lx = o.x - 19 + col * 4, ly = o.y - 8 - row * 5;
          R(g, P.wood2, lx, ly, 4, 5); R(g, P.wood5, lx + 1, ly + 1, 2, 3); R(g, P.wood6, lx + 1, ly + 1, 1, 1);
        }
        if (snow) R(g, P.sn2, o.x - 22, o.y - 30, 44, 1);
        break;
      }
      case 'extdoor': break;
      // ---------------- interior
      case 'rug': g.drawImage(S.furn[o.sprite], o.x, o.y); break;
      case 'deco': g.drawImage(S.furn[o.sprite], o.x, o.y); break;
      case 'table': g.drawImage(S.furn.table, o.x, o.y); break;
      case 'bed': g.drawImage(S.furn.bed, o.x, o.y); break;
      case 'wardrobe': g.drawImage(S.furn.wardrobe, o.x, o.y); break;
      case 'belongings': g.drawImage(S.furn.trunk, o.x, o.y); break;
      case 'photo': g.drawImage(S.furn.photo, o.x, o.y); break;
      case 'chest': g.drawImage(S.furn.chest, o.x, o.y); break;
      case 'sawhorse': g.drawImage(S.furn.sawhorse, o.x, o.y); break;
      case 'desk': g.drawImage(S.furn.desk, o.x, o.y);
        if (G().deskHasNews()) { const a = 0.5 + Math.sin(t * 4) * 0.5; g.fillStyle = S.rgba(P.y2, a); g.fillRect(o.x + 20, o.y + 2, 3, 3); }
        break;
      case 'wallmap': g.drawImage(S.furn.wallmap, o.x, o.y); break;
      case 'drum': {
        g.drawImage(S.furn.drum, o.x, o.y);
        const lvl = s.oil / D.OIL_CAP; R(g, P.i0, o.x + 15, o.y + 5, 2, 15); R(g, P.y1, o.x + 15, o.y + 5 + 15 * (1 - lvl), 2, 15 * lvl);
        break;
      }
      case 'radio': {
        g.drawImage(S.furn.radio, o.x, o.y);
        const pend = s.radio.pending.length > 0;
        const on = pend ? Math.sin(t * 8) > 0 : true;
        R(g, pend ? (on ? P.r3 : P.r0) : P.g4, o.x + 27, o.y + 10, 2, 2);
        break;
      }
      case 'counter': {
        g.drawImage(S.furn.counter, o.x, o.y);
        const lit = NW.Survival.stoveLit();
        if (lit) for (let i = 0; i < 3; i++) { const ph = (t * 0.6 + i / 3) % 1; g.fillStyle = 'rgba(220,225,235,' + (0.35 * (1 - ph)) + ')'; g.fillRect(o.x + 33 + Math.sin(ph * 6 + i) * 2, o.y - ph * 10, 2, 2); }
        if (G().hold && G().hold.obj === o) { R(g, P.f3, o.x + 32, o.y + 3, 6, 1); }
        break;
      }
      case 'stove': drawStove(g, o, t); break;
      case 'woodbox': {
        g.drawImage(S.furn.woodbox, o.x, o.y);
        const n = s.woodbox;
        for (let i = 0; i < Math.min(15, n); i++) { const col = i % 4, row = Math.floor(i / 4); R(g, P.wood2, o.x + 3 + col * 4, o.y + 5 - row * 3, 4, 3); R(g, P.wood5, o.x + 4 + col * 4, o.y + 5 - row * 3, 2, 2); }
        break;
      }
      case 'lamp': {
        const on = s.lamps[o.room] && s.oil > 0;
        g.drawImage(o.style === 'wall' ? S.furn.lampWall : S.furn.lampTable, o.x, o.y);
        if (on) { const f = 0.85 + Math.sin(t * 9 + o.x) * 0.08; g.fillStyle = S.rgba(P.f3, f); g.fillRect(o.x + 4, o.y + (o.style === 'wall' ? 7 : 5), 2, 3); g.fillStyle = S.rgba(P.f4, f); g.fillRect(o.x + 4, o.y + (o.style === 'wall' ? 8 : 6), 1, 1); }
        break;
      }
      case 'window': drawWindow(g, o, t); break;
      case 'door': drawDoor(g, o, t); break;
    }
  };

  function drawStove(g, o, t) {
    const s = st();
    g.drawImage(S.furn.stoveBase, o.x, o.y);
    const lit = NW.Survival.stoveLit();
    const set = lit ? s.stove.setting : 'off';
    const lv = { off: 0, low: 0.35, medium: 0.65, high: 1 }[set];
    const fx = o.x + 8, fy = o.y + 23, fw = 16, fh = 11;
    R(g, P.ink, fx, fy, fw, fh);
    if (s.stove.fuel > 0) { for (let i = 0; i < 4; i++) { R(g, P.wood1, fx + 1 + i * 4, fy + fh - 3, 3, 2); R(g, lit ? P.f0 : P.wood2, fx + 2 + i * 4, fy + fh - 3, 1, 1); } }
    if (lv > 0) {
      for (let i = 0; i < fw; i++) {
        const h = (Math.sin(t * 11 + i * 1.7) * 0.5 + 0.5) * fh * lv * 0.8 + fh * lv * 0.25 + (U.hashf(i, Math.floor(t * 12)) * 2);
        const hh = Math.min(fh - 1, h);
        R(g, P.f1, fx + i, fy + fh - hh, 1, hh);
        R(g, P.f2, fx + i, fy + fh - hh * 0.7, 1, hh * 0.7);
        if (lv > 0.3) R(g, P.f3, fx + i, fy + fh - hh * 0.4, 1, hh * 0.4);
      }
      if (lv > 0.9) { R(g, P.f4, fx + 5, fy + fh - 5, 6, 3); }
      R(g, S.rgba(P.f3, 0.6), o.x + 7, o.y + 35, 18, 2);
      if (NW.Night && NW.Night.siphonOn() && Math.random() < 0.3) R(g, P.i0, fx + Math.random() * fw, fy + Math.random() * 5, 1, 2);
    }
    R(g, P.i2, fx - 1, fy - 1, fw + 2, 1); R(g, P.i2, fx + 7, fy, 2, fh);
    // fuel gauge on side
    const fr = s.stove.fuel / G().cap('STOVE_CAP');
    R(g, P.i0, o.x + 27, o.y + 20, 2, 14); R(g, fr < 0.2 ? P.r3 : P.f3, o.x + 27, o.y + 20 + 14 * (1 - fr), 2, 14 * fr);
  }

  function skyColor() {
    const s = st(), m = s.time.min;
    const day = NW.Survival.daylight();
    let c = S.mix('#0b1220', '#9db3c8', day);
    if (m > 17 * 60 && m < 19.5 * 60) c = S.mix(c, '#c27a52', 0.35 * (1 - Math.abs(m - 18.4 * 60) / 70));
    if (s.weather.type === 'fog') c = S.mix(c, '#8a96a3', 0.4 * day + 0.1);
    return c;
  }
  O.skyColor = skyColor;

  function drawWindow(g, o, t) {
    const s = st(), w = s.cabin.windows[o.wid];
    const lh = NW.Night.lhAt(o.wid);
    const sky = skyColor();
    if (o.side === 'top') {
      const x = o.x, y = o.y;
      R(g, P.wood0, x + 1, y + 5, 30, 26); R(g, P.wood2, x + 2, y + 6, 28, 24);
      const gx = x + 5, gy = y + 9, gw = 22, gh = 17;
      drawGlass(g, gx, gy, gw, gh, w, sky, t, lh);
      R(g, P.wood5, x, y + 28, 32, 3); R(g, P.wood4, x, y + 30, 32, 1);
      drawCover(g, gx, gy, gw, gh, w, t, 'v');
    } else {
      const x = o.x, y = o.y;
      R(g, P.wood0, x, y, 32, 16); R(g, P.wood2, x + 1, y + 1, 30, 6);
      const gx = x + 3, gy = y + 4, gw = 26, gh = 8;
      drawGlass(g, gx, gy, gw, gh, w, sky, t, lh);
      R(g, P.wood5, x + 1, y, 30, 2);
      drawCover(g, gx, gy, gw, gh, w, t, 'h');
    }
  }
  function drawGlass(g, gx, gy, gw, gh, w, sky, t, lh) {
    R(g, sky, gx, gy, gw, gh);
    // treeline silhouette
    const tl = S.mix(sky, P.ink, 0.6);
    for (let i = 0; i < gw; i++) { const h = 3 + Math.abs(Math.sin(i * 1.3 + gx)) * 4; R(g, tl, gx + i, gy + gh - h, 1, h); }
    const wt = st().weather;
    if (wt.precip > 0) {
      for (let i = 0; i < 6; i++) {
        const px = gx + ((U.hashf(i, gx) * gw + t * (wt.type === 'rain' ? 4 : 2) * (1 + wt.wind)) % gw);
        const py = gy + ((U.hashf(i, gy, 3) * gh + t * (wt.type === 'rain' ? 40 : 9)) % gh);
        R(g, wt.type === 'rain' ? P.b3 : P.white, px, py, 1, wt.type === 'rain' ? 2 : 1);
      }
    }
    if (lh) {
      const pulse = 0.7 + Math.sin(t * 5) * 0.3;
      R(g, P.pale0, gx + gw / 2 - 6, gy + 1, 12, gh - 1); R(g, P.pale, gx + gw / 2 - 5, gy + 1, 10, gh - 2);
      g.fillStyle = S.rgba(P.glow, pulse); g.fillRect(gx + gw / 2 - 4, gy + Math.floor(gh / 3), 2, 2); g.fillRect(gx + gw / 2 + 2, gy + Math.floor(gh / 3), 2, 2);
      R(g, P.pale0, gx + gw / 2 - 10, gy + gh - 4, 4, 3); R(g, P.pale0, gx + gw / 2 + 6, gy + gh - 4, 4, 3);
    }
    // glass sheen and mullions
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(gx + 1, gy + 1, 2, gh - 2);
    R(g, P.wood1, gx + Math.floor(gw / 2) - 1, gy, 2, gh);
    if (gh > 10) R(g, P.wood1, gx, gy + Math.floor(gh / 2), gw, 1);
    if (w.glass <= 0) {
      R(g, P.ink, gx + 2, gy + 1, gw - 4, gh - 2);
      for (let i = 0; i < 7; i++) { R(g, P.ice1, gx + U.hashf(i, 3) * gw, gy + (i % 2 ? 0 : gh - 2), 2, 2); }
    } else if (w.glass < 70) {
      g.strokeStyle = 'rgba(230,240,250,0.8)'; g.lineWidth = 1; g.beginPath();
      g.moveTo(gx + 4, gy + 2); g.lineTo(gx + 8, gy + gh / 2); g.lineTo(gx + 5, gy + gh - 1);
      if (w.glass < 40) { g.moveTo(gx + 8, gy + gh / 2); g.lineTo(gx + gw - 3, gy + 3); g.moveTo(gx + gw - 6, gy + gh - 1); g.lineTo(gx + gw - 9, gy + gh / 2); }
      g.stroke();
    }
  }
  function drawCover(g, gx, gy, gw, gh, w, t, orient) {
    if (w.boarded > 0) {
      for (let i = 0; i < 3; i++) {
        const yy = gy - 2 + i * (gh / 2.5);
        R(g, P.wood4, gx - 3, yy, gw + 6, 4); R(g, P.wood5, gx - 3, yy, gw + 6, 1); R(g, P.wood2, gx - 3, yy + 3, gw + 6, 1);
        R(g, P.i4, gx - 1, yy + 1, 1, 1); R(g, P.i4, gx + gw, yy + 1, 1, 1);
      }
      return;
    }
    if (w.shutClosed && w.shutter > 0) {
      for (let yy = gy; yy < gy + gh; yy += 3) { R(g, P.wood3, gx, yy, gw, 2); R(g, P.wood1, gx, yy + 2, gw, 1); }
      R(g, P.wood1, gx + Math.floor(gw / 2), gy, 1, gh);
      if (w.shutter < 60) { R(g, P.ink, gx + 3, gy + 2, 4, 2); R(g, P.wood5, gx + 3, gy + 4, 5, 1); }
      if (w.shutter < 30) { R(g, P.ink, gx + gw - 8, gy + gh - 5, 5, 3); R(g, P.ink, gx + 9, gy + gh / 2, 3, 2); }
    } else if (w.shutter <= 0) {
      R(g, P.wood2, gx - 2, gy + 1, 3, gh - 2); R(g, P.wood1, gx + gw - 1, gy + 3, 3, gh - 5);
    }
    // curtains (inside, in front)
    const c1 = P.r1, c2 = P.r2;
    if (w.curtClosed) {
      for (let i = 0; i < gw + 4; i++) R(g, i % 3 === 0 ? c1 : c2, gx - 2 + i, gy - 2, 1, gh + 3);
      R(g, P.r0, gx + Math.floor(gw / 2), gy - 2, 1, gh + 3);
      R(g, P.wood1, gx - 3, gy - 3, gw + 6, 1);
    } else {
      for (let i = 0; i < 4; i++) { R(g, i % 2 ? c1 : c2, gx - 3 + i, gy - 2, 1, gh + 3); R(g, i % 2 ? c1 : c2, gx + gw - 1 + i, gy - 2, 1, gh + 3); }
      R(g, P.wood1, gx - 3, gy - 3, gw + 6, 1);
    }
    void orient; void t;
  }

  function drawDoor(g, o, t) {
    const d = st().cabin.doors[o.did];
    const scr = NW.Night.scratcherAt(o.did);
    if (o.side === 'bottom') {
      const x = o.x, y = o.y;
      const swing = NW.G.doorAnim[o.did] || 0;
      if (d.open || d.hp <= 0 || swing > 0) {
        R(g, P.ink, x + 2, y, 28, 16);
        const sky = skyColor(); g.fillStyle = S.rgba(sky, 0.5); g.fillRect(x + 4, y + 6, 24, 10);
        R(g, P.wood3, x + 26, y - 14, 4, 16); R(g, P.wood4, x + 26, y - 14, 1, 16);
      } else {
        R(g, P.wood0, x + 1, y, 30, 16); R(g, P.wood3, x + 2, y + 1, 28, 13);
        for (let i = 0; i < 7; i++) R(g, P.wood2, x + 4 + i * 4, y + 1, 1, 13);
        R(g, P.wood4, x + 2, y + 1, 28, 1);
        R(g, P.i2, x + 4, y + 3, 4, 2); R(g, P.i2, x + 4, y + 10, 4, 2);
        R(g, P.y1, x + 24, y + 6, 2, 3);
        if (d.reinforced) { R(g, P.wood5, x + 1, y + 5, 30, 4); R(g, P.wood4, x + 1, y + 8, 30, 1); R(g, P.i3, x + 3, y + 6, 1, 1); R(g, P.i3, x + 28, y + 6, 1, 1); }
        if (d.locked && !d.lockBroken) { R(g, P.i3, x + 20, y + 7, 7, 2); R(g, P.i4, x + 20, y + 7, 7, 1); }
        if (d.lockBroken) { R(g, P.r2, x + 22, y + 7, 2, 2); }
        doorDamage(g, x + 2, y + 1, 28, 13, d.hp / d.max);
        if (scr) { const sh = Math.sin(t * 30) > 0 ? 1 : 0; R(g, P.ink, x + 6 + sh, y + 14, 20, 2); }
      }
      R(g, P.wood1, x, y + 14, 32, 2);
    } else {
      const x = o.x, y = o.y;
      if (d.open || d.hp <= 0 || NW.G.doorAnim[o.did] > 0) {
        R(g, P.ink, x, y + 2, 16, 28); const sky = skyColor(); g.fillStyle = S.rgba(sky, 0.5); g.fillRect(x + 4, y + 4, 12, 24);
      } else {
        R(g, P.wood0, x, y + 1, 16, 30); R(g, P.wood3, x + 2, y + 2, 12, 28);
        for (let i = 0; i < 6; i++) R(g, P.wood2, x + 2, y + 4 + i * 4, 12, 1);
        R(g, P.y1, x + 4, y + 22, 2, 2);
        if (d.reinforced) { R(g, P.wood5, x + 5, y + 1, 4, 30); R(g, P.wood4, x + 8, y + 1, 1, 30); }
        if (d.locked && !d.lockBroken) { R(g, P.i3, x + 3, y + 16, 2, 6); R(g, P.i4, x + 3, y + 16, 1, 6); }
        if (d.lockBroken) R(g, P.r2, x + 3, y + 18, 2, 2);
        doorDamage(g, x + 2, y + 2, 12, 28, d.hp / d.max);
        if (scr) { const sh = Math.sin(t * 30) > 0 ? 1 : 0; R(g, P.ink, x + 14 + sh, y + 4, 2, 24); }
      }
    }
  }
  function doorDamage(g, x, y, w, h, f) {
    if (f < 0.75) { g.strokeStyle = 'rgba(210,170,120,0.85)'; g.lineWidth = 1; g.beginPath(); for (let i = 0; i < 3; i++) { g.moveTo(x + 3 + i * 3, y + 2); g.lineTo(x + 6 + i * 3, y + h - 3); } g.stroke(); }
    if (f < 0.45) { R(g, P.ink, x + w / 2 - 2, y + h / 2 - 2, 4, 4); R(g, P.wood5, x + w / 2 + 2, y + h / 2 - 3, 2, 1); R(g, P.ink, x + 2, y + h - 4, 3, 3); }
    if (f < 0.2) { R(g, P.ink, x + w - 6, y + 3, 4, 6); }
  }

  function drawCabinAnnex(g, t, snow) {
    const s = st(), img = O.cabinExt(snow);
    g.drawImage(img, 198, 0, 58, 156, 334, 28, 58, 156);
    const ba = NW.G.doorAnim.back || 0;
    if (s.cabin.doors.back.open || s.cabin.doors.back.hp <= 0 || ba > 0) { R(g, P.ink, 352, 135, 16, 25); }
    void t;
  }

  function drawCabinExt(g, o, t, snow) {
    const s = st();
    g.drawImage(O.cabinExt(snow), 0, 0, 198, 156, 136, 28, 198, 156); // main block; the annex (x>=334) is drawn by cabin_annex
    // window glow from inside light (front windows)
    const L = NW.Survival.light;
    [['w_front_l', 184], ['w_front_r', 272]].forEach(([wid, wx]) => {
      const leak = L.winLeak[wid] || 0;
      const w = s.cabin.windows[wid];
      if (w.boarded > 0) { R(g, P.wood4, wx - 2, 154, 28, 4); R(g, P.wood4, wx - 2, 161, 28, 4); return; }
      const day = NW.Survival.daylight();
      const a = Math.min(1, leak * 1.2) * (1 - day * 0.75);
      R(g, S.mix(S.mix(P.ink, '#7d93ab', day * 0.8), P.f3, a), wx, 152, 24, 14);
      if (day > 0.3) { R(g, 'rgba(255,255,255,0.25)', wx + 2, 153, 3, 6); }
      if (w.curtClosed) { R(g, S.mix(P.r0, P.r2, a), wx + 1, 152, 22, 14); }
      if (w.shutClosed && w.shutter > 0) for (let yy = 152; yy < 166; yy += 3) R(g, P.wood2, wx, yy, 24, 2);
      R(g, P.wood1, wx + 11, 152, 2, 14);
      if (w.glass <= 0) { R(g, P.ink, wx + 3, 154, 6, 8); }
      if (a > 0.05) { g.globalCompositeOperation = 'lighter'; const gr = g.createRadialGradient(wx + 12, 172, 2, wx + 12, 172, 28); gr.addColorStop(0, S.rgba(P.f3, 0.25 * a)); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(wx - 20, 150, 64, 50); g.globalCompositeOperation = 'source-over'; }
    });
    // doors open?
    const fa = NW.G.doorAnim.front || 0, ba = NW.G.doorAnim.back || 0;
    if (s.cabin.doors.front.open || s.cabin.doors.front.hp <= 0 || fa > 0) { R(g, P.ink, 229, 147, 22, 29); R(g, S.rgba(P.f3, 0.3), 230, 150, 20, 26); const w = fa > 0 ? Math.round(22 * Math.sin(Math.min(1, (0.6 - fa) / 0.25) * Math.PI / 2) * (fa < 0.2 ? fa / 0.2 : 1)) : 0; R(g, P.wood3, 229, 147, Math.max(3, 22 - w), 29); R(g, P.wood1, 229 + Math.max(3, 22 - w) - 1, 147, 1, 29); }
    void ba;
    // chimney smoke
    const lit = NW.Survival.stoveLit();
    if (lit) {
      const lv = { low: 0.4, medium: 0.7, high: 1 }[s.stove.setting] || 0;
      for (let i = 0; i < 9; i++) {
        const ph = ((t * 0.35 + i / 9) % 1);
        const sx = 188 + ph * 30 * (0.5 + s.weather.wind) + Math.sin(ph * 6 + i) * 3, sy = 72 - ph * 60;
        g.fillStyle = 'rgba(160,165,175,' + (0.35 * (1 - ph) * lv) + ')';
        g.beginPath(); g.arc(sx, sy, 2 + ph * 6, 0, 6.3); g.fill();
      }
      if (s.stove.setting === 'high') for (let i = 0; i < 4; i++) { const ph = (t * 0.9 + i / 4) % 1; R(g, ph < 0.5 ? P.f3 : P.f1, 186 + Math.sin(i * 3 + t) * 5, 76 - ph * 30, 1, 1); }
    }
    if (NW.Night.siphonOn()) S.siphon(g, 188, 78, t);
    void o;
  }

  // =============================================================== ACTIONS
  function lootReady(o) {
    const l = st().world.loot[o.area || G().area.id];
    return !l || st().time.day - l >= 3;
  }
  function act(label, run, extra) { return Object.assign({ label, run }, extra || {}); }
  function hold(label, time, done, extra) { return Object.assign({ label, time, done }, extra || {}); }

  O.name = function (o) {
    if (o.name != null) { try { return typeof o.name === 'function' ? o.name(o) : o.name; } catch (e) { console.error(e); return null; } }
    const s = st();
    switch (o.type) {
      case 'branches': return 'Fallen branches';
      case 'deadtree': return O.available(o) ? 'Dead tree' : 'Stump';
      case 'bush': return O.available(o) ? 'Lingonberry bush' : 'Bare bush';
      case 'herb': return D.ITEMS[o.herb].name;
      case 'mushrooms': return 'Chanterelles';
      case 'loot': return D.LOOT[o.lm].name;
      case 'sign': return 'Sign';
      case 'cairn': return 'Red cairn';
      case 'woodpile_ext': return 'Woodpile (' + s.woodpile + '/' + D.WOODPILE_CAP + ')';
      case 'extdoor': return o.door === 'front' ? 'Front door' : 'Back door';
      case 'stove': return 'Wood stove — ' + (NW.Survival.stoveLit() ? D.STOVE[s.stove.setting].label : (s.stove.fuel > 0 ? 'Smothered' : 'Cold')) + ' · fuel ' + Math.ceil(s.stove.fuel / D.WOOD_FUEL * 10) / 10 + ' logs';
      case 'woodbox': return 'Wood box (' + s.woodbox + '/' + G().cap('WOODBOX_CAP') + ')';
      case 'counter': return 'Cooking station' + (NW.Survival.stoveLit() ? '' : ' (stove is out)');
      case 'table': return 'Table';
      case 'bed': return 'Bed';
      case 'wardrobe': return 'Wardrobe — wearing ' + (s.player.coat === 'parka' ? 'heavy parka' : 'ranger jacket');
      case 'belongings': return 'Your trunk';
      case 'photo': return 'Photograph';
      case 'chest': return 'Storage chest';
      case 'sawhorse': return 'Sawhorse';
      case 'drum': return 'Oil drum (' + Math.round(s.oil) + '/' + D.OIL_CAP + ')';
      case 'desk': return "Ranger's desk";
      case 'wallmap': return 'Wall map';
      case 'radio': return 'Radio' + (s.radio.pending.length ? ' — ' + s.radio.pending.length + ' new' : '');
      case 'lamp': return 'Oil lamp — ' + (s.lamps[o.room] ? 'lit' : 'dark');
      case 'window': return NW.Cabin.windowLabel(o.wid);
      case 'door': return NW.Cabin.doorLabel(o.did);
      case 'struct': return { mine: 'Hollow Mine entrance', altar: 'Stone altar', firetower: 'Old fire tower', oak: 'The Hollow Oak', mast: 'Relay mast', shack: "Trapper's shack", car: 'Rusted pickup', board: 'Notice board', tent: 'Torn tent' }[o.sprite] || null;
    }
    return null;
  };

  O.actions = function (o) {
    if (typeof o.actions === 'function') { try { return o.actions(o) || []; } catch (e) { console.error(e); return []; } }
    const s = st(), g = G();
    const inv = s.inv;
    switch (o.type) {
      case 'branches':
        if (!O.available(o)) return [];
        return [hold('Gather branches', 0.7, () => { const n = 1 + (U.hash(o.x, o.y, s.time.day) % 2); if (I.space(inv, 'wood') < 1) return g.msg('No room for more wood.', 'warn'); take(o); I.give('wood', n); g.sfx('branch'); g.stat('wood', n); g.tut('wood'); }, { sound: 'rustle' })];
      case 'deadtree':
        if (!O.available(o)) return [];
        return [hold('Chop deadwood', 2.4, () => { take(o); I.give('wood', 3); g.stat('wood', 3); g.tut('wood'); g.sfx('wood_crack'); }, { sound: 'chop', every: 0.45 })];
      case 'bush':
        if (!O.available(o)) return [];
        return [hold('Pick berries', 1.0, () => { take(o); I.give('berries', 2 + (U.hash(o.x, s.time.day) % 2)); g.tut('food'); }, { sound: 'rustle' })];
      case 'mushrooms':
        if (!O.available(o)) return [];
        return [hold('Pick mushrooms', 0.8, () => { take(o); I.give('mushroom', 1 + (U.hash(o.y, s.time.day) % 2)); g.tut('food'); }, { sound: 'rustle' })];
      case 'herb':
        if (!O.available(o)) return [];
        return [hold('Gather ' + D.ITEMS[o.herb].name.toLowerCase(), 0.9, () => { take(o); I.give(o.herb, 1 + (U.hash(o.x, o.y, 5) % 2)); g.journalOnce('herb_' + o.herb, 'Found ' + D.ITEMS[o.herb].name + '. ' + D.ITEMS[o.herb].desc, 'notes'); }, { sound: 'rustle' })];
      case 'loot':
        if (!lootReady(o)) return [act('Search (empty — check back in a few days)', null, { disabled: true })];
        return [hold('Search the ' + D.LOOT[o.lm].name.toLowerCase(), 1.6, () => lootContainer(o), { sound: 'rustle' })];
      case 'sign': return [act('Read', () => g.showText('Sign', o.text))];
      case 'cairn': return [act('Examine', () => NW.Events.examineCairn())];
      case 'struct': return structActions(o);
      case 'woodpile_ext': {
        const have = I.count(inv, 'wood');
        return [
          act('Stack wood (' + have + ')', () => { const k = Math.min(have, D.WOODPILE_CAP - s.woodpile); if (k <= 0) return g.msg(have ? 'The woodpile is full.' : 'You carry no wood.', 'warn'); I.remove(inv, 'wood', k); s.woodpile += k; g.sfx('thud'); g.msg('Stacked ' + k + ' wood.'); }, { disabled: have === 0 }),
          act('Take wood', () => { const k = Math.min(s.woodpile, I.space(inv, 'wood')); if (k <= 0) return g.msg(s.woodpile ? 'No room in your pack.' : 'The woodpile is empty.', 'warn'); s.woodpile -= k; I.add(inv, 'wood', k); g.sfx('pickup'); g.msg('Took ' + k + ' wood.'); }, { disabled: s.woodpile === 0 }),
        ];
      }
      case 'extdoor': return NW.Cabin.extDoorActions(o);
      case 'stove': return NW.Cabin.stoveActions(o);
      case 'woodbox': {
        const have = I.count(inv, 'wood');
        return [
          act('Store wood (' + have + ')', () => { const k = Math.min(have, G().cap('WOODBOX_CAP') - s.woodbox); if (k <= 0) return g.msg(have ? 'The wood box is full.' : 'You carry no wood.', 'warn'); I.remove(inv, 'wood', k); s.woodbox += k; g.sfx('thud'); g.msg('Stored ' + k + ' wood.'); g.tut('store'); }, { disabled: have === 0 }),
          act('Take wood', () => { const k = Math.min(s.woodbox, I.space(inv, 'wood')); if (k <= 0) return g.msg(s.woodbox ? 'No room in your pack.' : 'The wood box is empty.', 'warn'); s.woodbox -= k; I.add(inv, 'wood', k); g.sfx('pickup'); g.msg('Took ' + k + ' wood.'); }, { disabled: s.woodbox === 0 ? 'The wood box is empty' : I.space(inv, 'wood') === 0 ? 'No room in your pack' : false }),
        ];
      }
      case 'counter': return recipeActions('cook', o, NW.Survival.stoveLit() ? null : 'Light the stove first');
      case 'sawhorse': return recipeActions('saw', o, null);
      case 'table': {
        const best = I.bestOf(inv, D.FOOD_ORDER);
        return [act(best ? 'Sit and eat (' + D.ITEMS[best].name + ')' : 'Sit and eat (no food)', () => NW.Survival.eat(best), { disabled: !best })];
      }
      case 'bed': return [hold('Rest a moment', 3, () => { s.player.stamina = 100; g.msg('You lie still for a while. Sleep will not come — not on watch. Stamina restored.'); }, { sound: 'creak' })];
      case 'belongings': return [act('Look through', () => g.showText('Your trunk', NW.Events.lore('trunk')))];
      case 'photo': return [act('Look at the photograph', () => g.showText('Photograph', NW.Events.lore('photo')))];
      case 'chest': return [act('Open chest', () => { g.openUI('chest'); g.sfx('open'); g.tut('chest'); })];
      case 'drum': {
        const n = I.count(inv, 'oil');
        return [act('Pour lamp oil (' + n + ')', () => { I.remove(inv, 'oil', 1); s.oil = Math.min(D.OIL_CAP, s.oil + 30); g.sfx('drink'); g.msg('Oil drum: ' + Math.round(s.oil) + '/' + D.OIL_CAP); }, { disabled: n === 0 || s.oil >= D.OIL_CAP })];
      }
      case 'desk': return [act('Open the desk' + (s.deskNews ? ' (new)' : ''), () => { g.openUI('desk'); g.sfx('paper'); g.tut('desk'); }), act('Study the wall map', () => { g.openUI('map'); g.tut('map'); })];
      case 'wardrobe': {
        const parka = s.player.coat === 'parka';
        return [act(parka ? 'Change into the ranger jacket' : 'Put on the heavy parka', () => { s.player.coat = parka ? 'jacket' : 'parka'; g.sfx('rustle'); g.msg(parka ? 'Ranger jacket: lighter, cooler indoors.' : 'Heavy parka: much warmer outside, but hot indoors and tiring to run in.'); })];
      }
      case 'wallmap': return [act('Study the map', () => { g.openUI('map'); g.tut('map'); })];
      case 'radio': return [act(s.radio.pending.length ? 'Listen (' + s.radio.pending.length + ' new)' : 'Radio log', () => { g.openUI('radio'); g.tut('radio'); })];
      case 'lamp': {
        const on = s.lamps[o.room];
        return [act(on ? 'Put out the lamp' : 'Light the lamp', () => { if (!on && s.oil <= 0) return g.msg('The oil drum is empty.', 'warn'); s.lamps[o.room] = !on; g.sfx(on ? 'whoosh' : 'latch'); })];
      }
      case 'window': return NW.Cabin.windowActions(o);
      case 'door': return NW.Cabin.doorActions(o);
    }
    return [];
  };

  function structActions(o) {
    const g = G();
    const texts = {
      mine: 'Boards nailed across the shaft. Cold air breathes out between them, in and out, slow as sleep.',
      altar: 'A flat stone, stained dark. Someone has scratched a lantern into it and crossed it out. Underneath: "IT SEES WHAT BURNS."',
      firetower: 'The old lookout. The ladder is rotten above the first landing. Someone carved names into the legs, the newest dated three days ago.',
      oak: 'An enormous hollow oak. Something has stuffed the hollow with feathers and small bones, arranged neatly.',
      mast: 'The relay mast that carries Base\'s signal. The red light blinks. A maintenance box sits at its foot.',
      shack: 'The trapper\'s shack. The door is nailed shut from the outside.',
      car: 'A rusted pickup on the old logging road. The keys are still in it. The tank is dry.',
      board: 'Notice board: "MISSING — Have you seen this hiker?" The photo has been torn away. Below, in pencil: "don\'t open for them."',
      tent: 'The tent is slashed from the inside.',
    };
    if (!texts[o.sprite]) return [];
    return [act('Examine', () => { g.showText(O.name(o), texts[o.sprite]); g.journalOnce('ex_' + o.sprite, O.name(o) + ': ' + texts[o.sprite], 'notes'); })];
  }

  function lootContainer(o) {
    const s = st(), g = G();
    const aid = g.area.id;
    const first = s.world.loot[aid] == null;
    s.world.loot[aid] = s.time.day;
    const table = D.LOOT[o.lm].table;
    const rnd = U.rng(U.hash(s.seed, s.time.day, aid.length, o.x));
    const picks = Math.max(1, Math.round((2 + (first ? 1 : 0) + (rnd() < 0.4 ? 1 : 0)) * g.modeVal('loot', 1)));
    const got = [];
    for (let i = 0; i < picks; i++) {
      const id = table[Math.floor(rnd() * table.length)];
      const q = D.LOOT_QTY[id] || [1, 1];
      const n = q[0] + Math.floor(rnd() * (q[1] - q[0] + 1));
      I.give(id, n, true); got.push(n + ' ' + D.ITEMS[id].name);
    }
    g.sfx('pickup');
    g.msg('Found: ' + got.join(', '), 'item');
    g.stat('searched', 1);
    g.save('loot');
  }

  function recipeActions(station, o, blocked) {
    const s = st(), g = G();
    return D.RECIPES[station].map((r) => {
      const ok = I.hasAll(s.inv, r.in);
      const label = r.name + ' — ' + I.reqText(r.in, s.inv);
      return hold(label, r.time, () => {
        if (!I.removeAll(s.inv, r.in)) return g.msg('Missing ingredients.', 'warn');
        for (const id in r.out) I.give(id, r.out[id]);
        if (station === 'cook') g.tut('cook');
        if (station === 'saw') g.tut('plank');
      }, { disabled: blocked || (ok ? false : 'Need ' + I.reqText(r.in)), sound: station === 'cook' ? 'sizzle' : 'sawing', every: station === 'cook' ? 1.1 : 1.2, obj: o });
    });
  }
})(window.NW);
