'use strict';
// Places you can go inside: the Old Fire Tower cab, the Trapper's Shack and the Hollow Mine.
(function (NW) {
  const U = NW.U, D = NW.D, S = NW.S, I = NW.Inv, H = NW.Hooks, UI = NW.UI;
  const P = S.P, R = S.R, TS = D.TILE;
  const G = () => NW.G;
  const st = () => NW.G.state;
  const IDS = { tower: 'in_tower', shack: 'in_shack', mine: 'in_mine' };
  const PL = NW.Places = { ids: IDS };
  const DEF = { taken: {}, once: {}, boards: false, shackFuel: 0, lamps: {}, dread: 0, visits: {}, logPage: 0, viewDay: 0 };
  const mod = () => { const m = NW.mod('places', () => U.clone(DEF)); for (const k in DEF) if (m[k] == null) m[k] = U.clone(DEF[k]); return m; };
  const absMin = () => (st().time.day - 1) * 1440 + st().time.min;
  const lootN = (n) => Math.max(1, Math.round(n * G().modeVal('loot', 1)));
  const garrowHome = () => { try { return !!(NW.Characters && NW.Characters.present && NW.Characters.present('garrow')); } catch (e) { return false; } };
  const shackLit = () => mod().shackFuel > 0 || garrowHome();
  const lampLit = (id) => (mod().lamps[id] || 0) > absMin();
  const spr = (k, w, h, fn) => S.cached('pl_' + k, () => S.mk(w, h, fn));
  const deco = (o) => Object.assign({ type: 'deco' }, o);
  const act = (label, run, extra) => Object.assign({ label, run }, extra || {});

  // ------------------------------------------------------------ salvage
  // once: first search gives a fixed haul; every: refills after that many days with picks from a table
  function give(list, head) {
    const got = [];
    list.forEach(([id, n]) => { if (!D.ITEMS[id] || n <= 0) return; I.give(id, n, true); got.push(n + ' ' + D.ITEMS[id].name); });
    G().sfx('pickup'); G().stat('searched', 1);
    G().msg((head || 'Found: ') + (got.length ? got.join(', ') : 'nothing'), 'item');
    G().save('loot');
  }
  function stash(key, every) {
    const m = mod(), t = m.taken[key];
    return t == null || (every > 0 && st().time.day - t >= every);
  }
  function search(key, cfg) {
    const m = mod(), s = st(), first = !m.once[key];
    m.taken[key] = s.time.day; m.once[key] = true;
    if (first) return give(cfg.once.map(([id, n]) => [id, id === 'signal_flare' || id === 'glass' || id === 'medkit' ? n : lootN(n)]), cfg.head);
    const rnd = U.rng(U.hash(s.seed, s.time.day, U.strHash(key)));
    const picks = lootN(cfg.picks + (rnd() < 0.4 ? 1 : 0)), out = {};
    for (let i = 0; i < picks; i++) { const id = cfg.table[Math.floor(rnd() * cfg.table.length)]; const q = D.LOOT_QTY[id] || [1, 1]; out[id] = (out[id] || 0) + q[0] + Math.floor(rnd() * (q[1] - q[0] + 1)); }
    give(Object.keys(out).map((id) => [id, out[id]]), cfg.head);
  }
  const LOOT = {
    tower_cab: { every: 2, picks: 1, table: ['cloth', 'canned', 'nails', 'ammo', 'oil'], once: [['oil', 1], ['glass', 1], ['ammo', 4], ['signal_flare', 1]] },
    shack_crate: { every: 2, picks: 2, table: ['canned', 'berries', 'rope', 'cloth', 'ammo', 'smokeweed'], once: [['canned', 2], ['rope', 1], ['cloth', 2]] },
    mine_cart: { every: 3, picks: 2, table: ['scrap', 'nails', 'scrap', 'rope'], once: [['scrap', 2], ['nails', 4]] },
    mine_mag: { every: 4, picks: 1, table: ['scrap', 'oil', 'ammo', 'glass', 'scrap'], once: [['ammo', 6], ['glass', 1], ['oil', 1], ['scrap', 2]], head: 'Rare salvage: ' },
    mine_locker: { every: 0, picks: 0, table: [], once: [['bandage', 1], ['cloth', 1], ['canned', 1]] },
  };
  function lootActs(key, verb, sound) {
    const c = LOOT[key];
    if (!stash(key, c.every)) return [act(verb + (c.every ? ' (empty — check back in a few days)' : ' (empty)'), null, { disabled: true })];
    return [{ label: verb, time: 1.6, sound: sound || 'rustle', every: 0.6, done: () => search(key, c) }];
  }
  const stashTag = (key) => (stash(key, LOOT[key].every) ? '' : ' (searched)');

  // ============================================================ SPRITES
  const glassSky = (g, x, y, w, h, t, seed) => {
    const sky = NW.Objects.skyColor(), wt = st().weather;
    R(g, sky, x, y, w, h);
    const tl = S.mix(sky, P.ink, 0.6);
    for (let i = 0; i < w; i++) { const hh = 2 + Math.abs(Math.sin(i * 1.3 + seed)) * Math.min(5, h * 0.35); R(g, tl, x + i, y + h - hh, 1, hh); }
    if (wt.precip > 0.1) for (let i = 0; i < 4; i++) {
      const px = x + ((U.hashf(i, seed) * w + t * (2 + wt.wind * 6)) % w), py = y + ((U.hashf(i, seed, 3) * h + t * (wt.type === 'rain' ? 30 : 8)) % h);
      R(g, wt.type === 'rain' ? P.b3 : P.white, px, py, 1, 1);
    }
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 1, y + 1, 1, h - 2);
  };
  // tower cab: windows all round
  function drawTowerWalls(g, t) {
    [24, 100, 176].forEach((x, i) => {
      R(g, P.wood0, x - 2, 7, 60, 23); glassSky(g, x, 9, 56, 18, t, i * 7 + 1);
      R(g, P.wood1, x + 27, 9, 2, 18); R(g, P.wood1, x, 17, 56, 1); R(g, P.wood4, x - 3, 27, 62, 3); R(g, P.wood2, x - 3, 30, 62, 1);
      if (i === 2) { R(g, P.ink, x + 40, 10, 9, 6); R(g, P.ice1, x + 40, 10, 1, 1); R(g, P.ice1, x + 48, 15, 1, 1); R(g, P.wood5, x + 39, 13, 11, 2); }
    });
    [[4, 44, 46], [4, 100, 36], [244, 44, 46], [244, 100, 36]].forEach(([x, y, h], i) => { R(g, P.wood0, x - 1, y - 1, 10, h + 2); glassSky(g, x, y, 8, h, t, 30 + i); R(g, P.wood1, x, y + (h >> 1), 8, 1); });
    [[24, 147], [176, 147]].forEach(([x, y], i) => { R(g, P.wood0, x - 1, y - 1, 58, 9); glassSky(g, x, y, 56, 7, t, 50 + i); R(g, P.wood1, x + 27, y, 2, 7); });
    // draught through the cracked pane
    const wt = st().weather;
    if (wt.wind > 0.3 || wt.precip > 0.3) for (let i = 0; i < 6; i++) { const ph = (t * (0.6 + wt.wind) + i / 6) % 1; g.fillStyle = 'rgba(235,242,250,' + (0.7 * (1 - ph)) + ')'; g.fillRect(220 + Math.sin(ph * 5 + i) * 6 - ph * 10, 30 + ph * 40, 1, 1); }
  }
  const sCot = () => spr('cot', 22, 54, (g) => {
    R(g, 'rgba(0,0,0,0.3)', 2, 48, 20, 5);
    R(g, P.rg1, 2, 2, 18, 47); R(g, P.rg2, 3, 3, 16, 45); for (let y = 6; y < 48; y += 5) R(g, P.rg1, 3, y, 16, 1);
    R(g, P.bone, 4, 4, 14, 7); R(g, P.st4, 4, 10, 14, 1);
    R(g, P.st2, 3, 26, 16, 21); R(g, P.st3, 3, 26, 16, 2); R(g, P.r1, 3, 31, 16, 2); R(g, P.r1, 3, 41, 16, 2); R(g, P.st1, 3, 46, 16, 1);
    R(g, P.wood1, 0, 1, 2, 49); R(g, P.wood1, 20, 1, 2, 49); R(g, P.wood2, 0, 0, 22, 3); R(g, P.wood2, 0, 47, 22, 3); R(g, P.wood3, 0, 0, 22, 1);
    R(g, P.wood0, 1, 50, 2, 3); R(g, P.wood0, 19, 50, 2, 3);
  });
  const sLogDesk = () => spr('logdesk', 40, 30, (g) => {
    R(g, 'rgba(0,0,0,0.3)', 3, 24, 36, 5);
    R(g, P.wood1, 3, 16, 3, 11); R(g, P.wood1, 34, 16, 3, 11);
    R(g, P.wood3, 1, 3, 38, 15); for (let y = 3; y < 18; y += 3) R(g, P.wood2, 1, y, 38, 1); R(g, P.wood5, 1, 3, 38, 1); R(g, P.wood1, 1, 17, 38, 3);
    R(g, P.b0, 6, 5, 18, 10); R(g, P.bone, 7, 5, 8, 9); R(g, P.bone, 16, 5, 7, 9); R(g, P.d3, 15, 5, 1, 9);
    for (let i = 0; i < 4; i++) { R(g, P.st3, 8, 7 + i * 2, 6, 1); R(g, P.st3, 17, 7 + i * 2, 5 - (i === 3 ? 3 : 0), 1); }
    R(g, P.y1, 22, 12, 7, 1); R(g, P.i3, 28, 12, 1, 1);
    R(g, P.i3, 30, 5, 5, 6); R(g, P.i4, 30, 5, 5, 1); R(g, P.ink, 31, 6, 3, 1); R(g, P.i3, 35, 7, 1, 2);
  });
  const sStool = () => spr('stool', 12, 12, (g) => { R(g, 'rgba(0,0,0,0.3)', 1, 9, 11, 3); R(g, P.wood1, 2, 4, 2, 7); R(g, P.wood1, 8, 4, 2, 7); R(g, P.wood3, 0, 2, 12, 3); R(g, P.wood4, 0, 2, 12, 1); });
  const sScope = () => spr('scope', 20, 30, (g) => {
    R(g, 'rgba(0,0,0,0.3)', 2, 26, 17, 4);
    g.strokeStyle = P.i2; g.lineWidth = 1; g.beginPath(); g.moveTo(10.5, 12); g.lineTo(3.5, 28); g.moveTo(10.5, 12); g.lineTo(17.5, 28); g.moveTo(10.5, 12); g.lineTo(10.5, 28); g.stroke();
    R(g, P.i1, 8, 9, 5, 4); R(g, P.i1, 2, 3, 16, 7); R(g, P.i2, 2, 3, 16, 1);
    R(g, P.i0, 2, 0, 6, 6); R(g, P.i0, 12, 0, 6, 6); R(g, P.b2, 3, 1, 4, 2); R(g, P.b2, 13, 1, 4, 2); R(g, P.b3, 3, 1, 1, 1); R(g, P.b3, 13, 1, 1, 1);
    R(g, P.i3, 9, 4, 2, 3);
  });
  const sHatch = () => spr('hatch', 36, 28, (g) => {
    R(g, P.wood1, 0, 0, 36, 28); R(g, P.ink, 3, 3, 30, 25);
    R(g, P.wood2, 9, 3, 2, 25); R(g, P.wood2, 25, 3, 2, 25); for (let y = 6; y < 28; y += 5) { R(g, P.wood3, 9, y, 18, 2); R(g, P.wood1, 9, y + 2, 18, 1); }
    R(g, P.wood4, 0, 0, 36, 2); R(g, P.i2, 2, 1, 4, 1); R(g, P.i2, 30, 1, 4, 1);
  });
  const sRose = () => spr('rose', 44, 30, (g) => {
    const c = 'rgba(176,64,52,0.55)', b = 'rgba(214,207,187,0.35)';
    g.strokeStyle = b; g.lineWidth = 1; g.beginPath(); g.ellipse(22, 15, 20, 13, 0, 0, 6.3); g.stroke();
    g.fillStyle = c; g.beginPath(); g.moveTo(22, 0); g.lineTo(25, 15); g.lineTo(22, 30); g.lineTo(19, 15); g.fill();
    g.fillStyle = b; g.beginPath(); g.moveTo(1, 15); g.lineTo(22, 12); g.lineTo(43, 15); g.lineTo(22, 18); g.fill();
    g.fillStyle = 'rgba(214,207,187,0.6)'; g.fillRect(21, 0, 1, 1);
  });
  // shack
  const sStove = () => spr('stove', 26, 44, (g) => {
    R(g, 'rgba(0,0,0,0.35)', 3, 39, 22, 5);
    R(g, P.i1, 10, 0, 6, 17); R(g, P.i2, 10, 0, 2, 17); R(g, P.i0, 10, 6, 6, 1); R(g, P.i0, 10, 12, 6, 1);
    R(g, P.i1, 6, 16, 14, 22); R(g, P.i1, 4, 19, 18, 16); R(g, P.i2, 4, 19, 3, 16); R(g, P.i2, 6, 16, 3, 22);
    R(g, P.i2, 3, 15, 20, 3); R(g, P.i3, 3, 15, 20, 1); R(g, P.i2, 4, 34, 18, 2);
    R(g, P.i0, 5, 36, 3, 6); R(g, P.i0, 18, 36, 3, 6);
    R(g, P.i0, 8, 22, 10, 9); R(g, P.i3, 8, 22, 10, 1); R(g, P.i4, 16, 26, 2, 1);
  });
  const sKindling = () => spr('kindling', 20, 16, (g) => {
    R(g, 'rgba(0,0,0,0.3)', 1, 12, 19, 4);
    [[1, 8], [7, 8], [13, 8], [4, 3], [10, 3]].forEach(([x, y]) => { R(g, P.wood2, x, y, 6, 5); R(g, P.wood5, x + 1, y + 1, 4, 3); R(g, P.wood6, x + 2, y + 2, 1, 1); });
  });
  const sPelts = () => spr('pelts', 108, 28, (g) => {
    [[10, 13, P.wood4, P.wood5], [36, 13, P.st3, P.st4], [62, 14, P.d3, P.wood4]].forEach(([cx, cy, c1, c2]) => {
      g.strokeStyle = P.wood2; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy, 10, 12, 0, 0, 6.3); g.stroke();
      g.fillStyle = c1; g.beginPath(); g.moveTo(cx, cy - 10); g.lineTo(cx + 7, cy - 4); g.lineTo(cx + 6, cy + 9); g.lineTo(cx, cy + 6); g.lineTo(cx - 6, cy + 9); g.lineTo(cx - 7, cy - 4); g.fill();
      R(g, c2, cx - 2, cy - 6, 4, 9); g.strokeStyle = P.bone; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - 9, cy); g.lineTo(cx - 6, cy); g.moveTo(cx + 6, cy); g.lineTo(cx + 9, cy); g.stroke();
    });
    // hanging traps on chains
    [[82, 6], [94, 9]].forEach(([x, y]) => { R(g, P.i2, x, 0, 1, y); g.strokeStyle = P.i3; g.lineWidth = 1; g.beginPath(); g.arc(x + 0.5, y + 6, 5, 0, 6.3); g.stroke(); R(g, P.i4, x - 4, y + 6, 9, 1); R(g, P.i2, x, y + 11, 1, 5); });
    R(g, P.wood1, 74, 0, 34, 2);
  });
  const sBunk = () => spr('bunk', 36, 50, (g) => {
    R(g, 'rgba(0,0,0,0.35)', 3, 44, 33, 5);
    R(g, P.wood1, 0, 0, 36, 47); R(g, P.wood2, 0, 0, 36, 7); R(g, P.wood3, 1, 1, 34, 2);
    R(g, P.d2, 2, 7, 32, 38); R(g, P.bone, 4, 8, 12, 6); R(g, P.st4, 4, 13, 12, 1);
    R(g, P.r0, 2, 17, 32, 28); for (let x = 2; x < 34; x += 6) R(g, P.d1, x, 17, 2, 28); for (let y = 21; y < 45; y += 6) R(g, P.d1, 2, y, 32, 1);
    R(g, P.st3, 14, 24, 18, 13); R(g, P.st4, 15, 25, 15, 2); R(g, P.st2, 14, 36, 18, 1);
    R(g, P.wood2, 0, 45, 36, 3);
  });
  const sCrate = (open) => spr('crate' + (open ? 'o' : ''), 26, 22, (g) => {
    R(g, 'rgba(0,0,0,0.3)', 2, 17, 24, 5);
    R(g, P.wood3, 1, 5, 24, 14); for (let y = 5; y < 19; y += 4) R(g, P.wood2, 1, y, 24, 1); R(g, P.wood1, 1, 5, 2, 14); R(g, P.wood1, 23, 5, 2, 14);
    R(g, P.bone, 8, 10, 10, 1); R(g, P.bone, 9, 13, 8, 1);
    if (open) { R(g, P.ink, 3, 5, 20, 3); R(g, P.wood4, 0, 0, 26, 4); R(g, P.wood2, 0, 3, 26, 1); } else { R(g, P.wood4, 0, 3, 26, 3); R(g, P.wood5, 0, 3, 26, 1); }
  });
  const sHide = () => spr('hide', 44, 26, (g) => {
    g.fillStyle = P.wood1; g.beginPath(); g.ellipse(22, 13, 15, 9, 0, 0, 6.3); g.fill();
    [[6, 4], [38, 4], [6, 22], [38, 22]].forEach(([x, y]) => { R(g, P.wood1, Math.min(x, 22), Math.min(y, 13) - 1, Math.abs(x - 22) + 2, 3); R(g, P.wood1, x - 2, y - 1, 5, 3); });
    R(g, P.wood1, 0, 11, 8, 5); R(g, P.wood0, 0, 12, 3, 3); R(g, P.ink, 2, 12, 1, 1);
    g.fillStyle = P.wood2; g.beginPath(); g.ellipse(23, 13, 10, 5, 0, 0, 6.3); g.fill();
  });
  const sShoes = () => spr('shoes', 26, 28, (g) => {
    [[7, 14], [19, 14]].forEach(([cx, cy]) => { g.strokeStyle = P.wood3; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy, 5, 12, 0, 0, 6.3); g.stroke(); g.strokeStyle = P.bone; g.lineWidth = 1; for (let i = -8; i < 9; i += 4) { g.beginPath(); g.moveTo(cx - 4, cy + i); g.lineTo(cx + 4, cy + i + 3); g.stroke(); } });
    R(g, P.i2, 12, 0, 2, 4);
  });
  // mine
  const sCart = () => spr('cart', 30, 24, (g) => {
    R(g, 'rgba(0,0,0,0.35)', 2, 19, 28, 5);
    R(g, P.i2, 2, 6, 26, 12); R(g, P.i1, 2, 14, 26, 4); R(g, P.i3, 2, 6, 26, 1); R(g, P.r1, 6, 9, 3, 6); R(g, P.r0, 20, 11, 4, 3);
    for (let x = 4; x < 28; x += 5) R(g, P.i4, x, 8, 1, 1);
    [[5, 2], [10, 1], [15, 3], [20, 1], [24, 3]].forEach(([x, y]) => { R(g, P.st2, x, y, 5, 5); R(g, P.st3, x, y, 5, 1); });
    R(g, P.i0, 4, 17, 6, 6); R(g, P.i0, 20, 17, 6, 6); R(g, P.i2, 6, 19, 2, 2); R(g, P.i2, 22, 19, 2, 2);
  });
  const sRubble = () => spr('rubble', 36, 22, (g) => {
    R(g, 'rgba(0,0,0,0.3)', 2, 17, 34, 5);
    R(g, P.wood1, 4, 6, 26, 3); R(g, P.wood2, 4, 6, 26, 1); R(g, P.wood5, 29, 6, 2, 3);
    [[1, 12, 9, 8], [8, 9, 10, 10], [16, 11, 12, 9], [25, 13, 10, 7], [12, 4, 8, 7], [21, 7, 7, 6]].forEach(([x, y, w, h], i) => { R(g, i % 2 ? P.st1 : P.st2, x, y, w, h); R(g, P.st3, x, y, w, 1); R(g, P.st0, x, y + h - 1, w, 1); });
  });
  const sNotice = () => spr('notice', 28, 18, (g) => {
    R(g, P.wood1, 0, 0, 28, 16); R(g, P.wood3, 1, 1, 26, 14); R(g, P.bone, 4, 2, 20, 12); R(g, P.r2, 4, 2, 20, 3); R(g, P.white, 6, 3, 3, 1); R(g, P.white, 11, 3, 7, 1);
    for (let i = 0; i < 4; i++) R(g, P.st2, 6, 7 + i * 2, 16 - (i % 2) * 5, 1);
    R(g, P.i3, 13, 1, 2, 1); R(g, P.wood1, 2, 16, 2, 2); R(g, P.wood1, 24, 16, 2, 2);
  });
  const sLamp = (on) => spr('lamp' + (on ? '1' : '0'), 10, 18, (g) => {
    R(g, P.i2, 4, 0, 2, 4); R(g, P.i2, 2, 3, 6, 1);
    R(g, P.i1, 2, 4, 6, 2); R(g, on ? P.f3 : P.st1, 2, 6, 6, 6); R(g, on ? P.f4 : P.st2, 4, 7, 2, 3); R(g, P.i1, 1, 6, 1, 6); R(g, P.i1, 8, 6, 1, 6);
    R(g, P.i1, 1, 12, 8, 3); R(g, P.i3, 1, 12, 8, 1);
  });
  const sTimber = () => spr('timber', 26, 30, (g) => {
    R(g, P.wood1, 2, 2, 5, 28); R(g, P.wood2, 2, 2, 2, 28); R(g, P.wood1, 19, 2, 5, 28); R(g, P.wood2, 19, 2, 2, 28);
    R(g, P.wood2, 0, 0, 26, 5); R(g, P.wood3, 0, 0, 26, 1); R(g, P.wood0, 0, 4, 26, 1); R(g, P.i3, 4, 2, 1, 1); R(g, P.i3, 21, 2, 1, 1);
  });
  const sProp = () => spr('prop', 12, 34, (g) => {
    R(g, 'rgba(0,0,0,0.35)', 2, 30, 10, 4);
    R(g, P.wood2, 3, 4, 6, 28); R(g, P.wood3, 3, 4, 2, 28); R(g, P.wood1, 8, 4, 1, 28);
    R(g, P.wood1, 0, 0, 12, 5); R(g, P.wood3, 0, 0, 12, 1); R(g, P.st3, 1, 30, 10, 2);
  });
  const sMag = () => spr('mag', 28, 22, (g) => {
    R(g, 'rgba(0,0,0,0.35)', 2, 17, 26, 5);
    R(g, P.wood2, 1, 4, 26, 15); R(g, P.wood3, 1, 4, 26, 3); R(g, P.wood1, 1, 7, 26, 1); R(g, P.r1, 1, 11, 26, 4); R(g, P.r2, 1, 11, 26, 1);
    for (let i = 0; i < 5; i++) R(g, P.bone, 5 + i * 4, 12, 2, 2);
    R(g, P.i2, 3, 4, 2, 15); R(g, P.i2, 23, 4, 2, 15);
  });
  const sLocker = (open) => spr('locker' + (open ? 'o' : ''), 16, 32, (g) => {
    R(g, 'rgba(0,0,0,0.3)', 1, 28, 15, 4);
    R(g, P.i2, 1, 0, 14, 30); R(g, P.i3, 1, 0, 14, 1); for (let i = 0; i < 3; i++) R(g, P.i1, 4, 4 + i * 2, 8, 1);
    R(g, P.r1, 2, 20, 4, 6); R(g, P.r0, 11, 14, 3, 5); R(g, P.i4, 12, 16, 1, 3);
    if (open) { R(g, P.ink, 2, 10, 12, 18); R(g, P.bone, 5, 12, 5, 6); R(g, P.sk1, 6, 13, 3, 2); }
  });
  const sWinze = () => spr('winze', 36, 28, (g) => {
    R(g, P.st1, 0, 2, 36, 26); R(g, P.st2, 0, 2, 36, 2); R(g, P.ink, 4, 6, 28, 20);
    R(g, P.wood1, 2, 4, 32, 3); R(g, P.wood1, 2, 25, 32, 3); R(g, P.wood2, 2, 4, 32, 1);
    R(g, P.wood2, 13, 6, 2, 20); R(g, P.wood2, 21, 6, 2, 20); for (let y = 9; y < 26; y += 4) R(g, P.wood1, 13, y, 10, 1);
    R(g, 'rgba(0,0,0,0.6)', 4, 16, 28, 10);
  });
  const sHand = () => spr('hand', 10, 44, (g) => {
    // fingers at the top (toward the ranger), the arm trails off into the dark
    [[1, 3, 2, 5], [3, 0, 1, 8], [5, 0, 1, 8], [7, 1, 1, 7], [8, 4, 1, 4]].forEach(([x, y, w, h]) => R(g, P.pale, x, y, w, h));
    R(g, P.pale2, 3, 0, 1, 1); R(g, P.pale2, 5, 0, 1, 1); R(g, P.pale, 2, 7, 7, 6); R(g, P.pale0, 2, 11, 7, 2); R(g, P.pale2, 3, 8, 3, 1);
    for (let y = 13; y < 44; y++) { const a = 1 - (y - 13) / 31; g.fillStyle = S.rgba(y % 5 === 0 ? P.pale0 : P.pale, a); g.fillRect(3, y, 4, 1); g.fillStyle = S.rgba(P.pale0, a); g.fillRect(6, y, 1, 1); }
  });
  const sHelmet = () => spr('helmet', 12, 8, (g) => { R(g, P.y0, 2, 2, 8, 4); R(g, P.y1, 3, 1, 6, 2); R(g, P.y0, 0, 5, 12, 2); R(g, P.i2, 5, 2, 2, 2); R(g, P.ice1, 5, 2, 1, 1); });

  // ============================================================ TOWER
  const TOWER_MAP = ['TTTTTTTTTTTTTTTT', 'FFFFFFFFFFFFFFFF', '|..............|', '|..............|', '|..............|', '|..............|', '|..............|', '|..............|', '|..............|', '_______dd_______'];
  const LOGBOOK = [
    ['Day 2', 'Took the lookout shift myself. No fire crew this late in the year. Visibility forty miles. Smoke from Garrow\'s shack at seven, like every morning. Base says log everything.'],
    ['Day 4', 'Climbed at dusk to check the cabin chimney draws right. From up here you can see exactly how bright the station burns. Anything that is looking can see it too.'],
    ['Day 6', 'A light at the Hollow Mine, 0210. Not a lantern. Too steady, too white. It went out when I raised the binoculars.'],
    ['Day 7', 'Asked Garrow about the mine. Shut in \'31 after the night shift "heard the foreman calling them deeper." Carry light down there or don\'t go, he says. Stay in the lamps. He laughed. He was not joking.'],
    ['Day 9', 'Bells on the ridge after dark. I wait up here till first light now. The ladder is the only way up, and whatever wears the bells does not climb.'],
    ['Day 11', 'The light at the mine is there every night now. It is the same colour as my lamp. I am going down to look at first light. If Base reads this: don\'t follow the light. Don\'t'],
  ];
  NW.World.registerArea(IDS.tower, {
    name: 'Fire Tower Cab', theme: 'plank', shelter: 6, dark: 0.3, surface: 'wood', map: TOWER_MAP,
    mapAt: { area: 'f_0_0', x: 320, y: 128 },
    exits: [{ x: 112, y: 150, w: 32, h: 10, to: 'f_0_0', tx: 320, ty: 134, dir: 'down' }],
    objs: () => [
      deco({ layer: 'wall', x: -99, y: -99, draw: (g, t) => drawTowerWalls(g, t) }),
      deco({ layer: 'floor', x: -99, y: -99, draw: (g) => { g.drawImage(sRose(), 106, 82); g.drawImage(sHatch(), 110, 132); } }),
      { x: 128, y: 44, cx: 120, cy: 38, cw: 16, ch: 7, solid: true, draw: (g) => g.drawImage(sScope(), 118, 16),
        name: 'Lookout binoculars', actions: () => [act('Look out over the forest', () => openView())] },
      { x: 38, y: 44, cx: 28, cy: 36, cw: 20, ch: 9, solid: true, draw: (g) => { g.drawImage(S.furn.cabinet, 28, 14); if (!stash('tower_cab', LOOT.tower_cab.every)) { R(g, P.ink, 30, 18, 16, 3); R(g, P.i3, 30, 17, 16, 1); } },
        name: () => 'Metal cabinet' + stashTag('tower_cab'), actions: () => lootActs('tower_cab', 'Search the cabinet', 'rattle') },
      { x: 31, y: 116, cx: 20, cy: 68, cw: 22, ch: 46, solid: true, draw: (g) => g.drawImage(sCot(), 20, 64),
        name: 'Canvas cot', actions: () => [{ label: 'Rest a moment', time: 3, sound: 'creak', every: 1.4, done: () => { st().player.stamina = 100; G().msg('The cot sways with the tower. You close your eyes and listen to the wind. Stamina restored.'); } }] },
      { x: 216, y: 74, cx: 200, cy: 62, cw: 36, ch: 12, solid: true, draw: (g) => g.drawImage(sLogDesk(), 198, 50),
        name: () => "Lookout's logbook" + (mod().once.logbook ? '' : ' (unread)'), actions: () => [act('Read the logbook', () => openLog())] },
      deco({ x: 212, y: 82, cx: 208, cy: 88, cw: 8, ch: 4, solid: true, draw: (g) => g.drawImage(sStool(), 206, 80) }),
    ],
  });

  // ============================================================ SHACK
  const SHACK_MAP = ['TTTTTTTTTTTTTTTTTT', 'FFFFFFFFFFFFFFFFFF', '|................|', '|................|', '|................|', '|................|', '|................|', '|................|', '|................|', '|................|', '________dd________'];
  const LEDGER = 'GARROW — LINES, THIS WINTER\n\nMarten 3. Fox 1. Snowshoe hare 11.\nMarten 2. Hare 6.\nNothing. Snares sprung, bait gone, no tracks in or out.\nNothing.\nNothing. Something cleans the lines before I walk them. Hides hung neat on the branches, inside out.\n\nNote: ranger\'s been climbing the tower at night. Told them what my father told me about the mine. Lamps or nothing.';
  function shackWallsDraw(g, t) {
    g.drawImage(sPelts(), 92, 4); g.drawImage(sShoes(), 204, 4);
    [[40, 162], [216, 162]].forEach(([x, y], i) => { R(g, P.wood0, x - 1, y - 1, 34, 11); glassSky(g, x, y, 32, 8, t, 70 + i); R(g, P.wood1, x + 15, y, 2, 8); });
  }
  NW.World.registerArea(IDS.shack, {
    name: "Trapper's Shack", theme: 'log', shelter: 9, dark: 0.45, surface: 'wood', map: SHACK_MAP,
    mapAt: { area: 'f_0_2', x: 335, y: 104 },
    exits: [{ x: 128, y: 166, w: 32, h: 10, to: 'f_0_2', tx: 335, ty: 110, dir: 'down' }],
    objs: () => [
      deco({ layer: 'wall', x: -99, y: -99, draw: (g, t) => shackWallsDraw(g, t) }),
      deco({ layer: 'floor', x: -99, y: -99, draw: (g) => g.drawImage(sHide(), 150, 108) }),
      { x: 140, y: 34, cx: 96, cy: 20, cw: 98, ch: 14, layer: 'wall', name: 'Pelts and traps',
        actions: () => [act('Look', () => G().showText('Pelts and traps', 'Marten, fox and a grey wolf hide, stretched on willow hoops. Leghold traps hang from a beam, jaws oiled. One is bent wide open, as if something pulled its leg out the slow way.'))] },
      { x: 46, y: 50, cx: 34, cy: 40, cw: 22, ch: 10, solid: true, draw: (g, t) => drawShackStove(g, t),
        name: () => 'Potbelly stove — ' + (shackLit() ? 'burning' + (mod().shackFuel > 0 ? ' · ' + U.fmtDur(mod().shackFuel) : '') : 'cold'), actions: () => stoveActs() },
      deco({ x: 70, y: 50, cx: 61, cy: 42, cw: 18, ch: 7, solid: true, draw: (g) => g.drawImage(sKindling(), 60, 34) }),
      { x: 248, y: 76, cx: 230, cy: 36, cw: 36, ch: 40, solid: true, draw: (g) => g.drawImage(sBunk(), 230, 28),
        name: "Garrow's bunk", actions: () => [{ label: 'Rest a moment', time: 3, sound: 'creak', every: 1.4, done: () => { st().player.stamina = 100; G().msg('The blankets smell of smoke and wet dog. Stamina restored.'); } }] },
      { x: 124, y: 96, cx: 106, cy: 84, cw: 36, ch: 12, solid: true, draw: (g, t) => { g.drawImage(S.furn.table, 104, 74); drawLantern(g, 132, 76, t); },
        name: "Trapper's table", actions: () => [act('Read the trap ledger', () => { G().sfx('paper'); G().showText('Trap ledger', LEDGER); G().journalOnce('pl_ledger', 'Garrow\'s trap ledger: his lines have come up empty for weeks. Something cleans them first and hangs the hides inside out.', 'notes'); })] },
      deco({ x: 152, y: 92, cx: 149, cy: 86, cw: 10, ch: 6, solid: true, draw: (g) => g.drawImage(S.furn.chair, 146, 76) }),
      { x: 37, y: 142, cx: 24, cy: 132, cw: 26, ch: 10, solid: true, draw: (g) => g.drawImage(sCrate(!stash('shack_crate', LOOT.shack_crate.every)), 24, 122),
        name: () => 'Supply crate' + stashTag('shack_crate'), actions: () => lootActs('shack_crate', 'Search the crate') },
      deco({ x: 252, y: 140, cx: 245, cy: 132, cw: 14, ch: 8, solid: true, draw: (g) => g.drawImage(S.furn.barrel, 244, 122) }),
    ],
  });
  function drawLantern(g, x, y, t) {
    R(g, P.i1, x, y, 6, 2); R(g, P.i2, x + 2, y - 2, 2, 2);
    const f = 0.8 + Math.sin(t * 9) * 0.1; R(g, P.i1, x, y + 2, 1, 6); R(g, P.i1, x + 5, y + 2, 1, 6); g.fillStyle = S.rgba(P.f3, f); g.fillRect(x + 1, y + 2, 4, 6); R(g, P.f4, x + 2, y + 4, 2, 2); R(g, P.i1, x, y + 8, 6, 2);
  }
  function drawShackStove(g, t) {
    g.drawImage(sStove(), 32, 8);
    if (!shackLit()) return;
    for (let i = 0; i < 10; i++) { const hh = 2 + (Math.sin(t * 11 + i * 1.7) * 0.5 + 0.5) * 6; R(g, P.f1, 41 + i, 39 - hh, 1, hh); R(g, P.f2, 41 + i, 39 - hh * 0.6, 1, hh * 0.6); R(g, P.f3, 41 + i, 39 - hh * 0.3, 1, hh * 0.3); }
    R(g, S.rgba(P.f3, 0.5), 38, 44, 18, 2);
  }
  function stoveActs() {
    const m = mod(), s = st(), wood = I.count(s.inv, 'wood');
    const lit = m.shackFuel > 0;
    const feed = () => { I.remove(s.inv, 'wood', 1); m.shackFuel = Math.min(360, m.shackFuel + 180); G().sfx(lit ? 'thud' : 'fireup'); };
    if (!lit) return [act(garrowHome() ? 'Feed Garrow\'s fire (1 Firewood)' : 'Light the stove (1 Firewood)', () => { feed(); G().msg('The little stove ticks and roars. The shack warms fast.', 'good'); }, { disabled: wood ? false : 'You carry no firewood' })];
    return [act('Add wood (' + wood + ')', () => { if (m.shackFuel > 300) return G().msg('It is full.', 'warn'); feed(); }, { disabled: wood ? false : 'You carry no firewood' })];
  }

  // ============================================================ MINE
  const MINE_MAP = [
    '##############################',
    '##############################',
    '#####################.......##',
    '#######........######.......##',
    '#######........######.......##',
    '#######........######.......##',
    '#######........#######.....###',
    '#######........#######.....###',
    '##########...##########...####',
    '###.......................####',
    '###.......................####',
    '###.......................####',
    '###....########.....##########',
    '###....########.....##########',
    '###....#########...###########',
    '###....#######################',
    '####dd########################',
  ].map((r) => r.replace(/#/g, ' '));
  const LAMPS = { l_gal: { x: 232, y: 130, name: 'gallery' }, l_cart: { x: 136, y: 34, name: 'stope' }, l_deep: { x: 384, y: 18, name: 'deep drift' } };
  const MOUTH = { x: 80, y: 266 };
  const NOTICE = 'HOLLOW MINE — NOTICE TO ALL MEN\n\nNo man past the lamps without a light of his own and a partner with another.\nShould you hear your name called from below, you will come UP at once and report to the foreman.\nThe foreman does not call from below.\n\n— By order, 1931';
  function mineBg(a) {
    const c = S.mk(a.w * TS, a.h * TS), cg = c.getContext('2d');
    const id = cg.createImageData(c.width, c.height), dd = id.data;
    const W = NW.World, solid = (tx, ty) => W.isSolidTile(W.tile(a, tx, ty));
    for (let py = 0; py < c.height; py++) for (let px = 0; px < c.width; px++) {
      const tx = px >> 4, ty = py >> 4, lx = px & 15, ly = py & 15;
      let col;
      const n = S.fbm(px * 0.08, py * 0.08, 41);
      if (!solid(tx, ty)) {
        const n2 = S.vnoise(px * 0.3, py * 0.3, 43);
        col = n < 0.45 ? P.mud1 : n < 0.58 ? P.d0 : S.mix(P.d0, P.d1, 0.6);
        if (n2 > 0.72) col = S.mix(col, P.d1, 0.5); else if (n2 < 0.2) col = S.mix(col, P.mud0, 0.6);
        const h = U.hashf(px, py, 9); if (h < 0.035) col = P.st1; else if (h < 0.045) col = P.st2; else if (h < 0.05) col = P.mud0;
        if (W.tile(a, tx, ty) === W.T.DOORWAY) col = S.mix(col, P.sn1, 0.15 + ly / 40);
        if (solid(tx, ty - 1) && ly < 5) col = S.mix(col, P.ink, ly < 2 ? 0.6 : 0.35);
        if (solid(tx - 1, ty) && lx < 3) col = S.mix(col, P.ink, 0.4);
        if (solid(tx + 1, ty) && lx > 12) col = S.mix(col, P.ink, 0.45);
      } else if (!solid(tx, ty + 1)) {
        // rock face above a floor tile: stratified stone
        const row = Math.floor(py / 4), off = Math.floor(U.hashf(row, 3, 7) * 9);
        const brick = Math.floor((px + off) / (6 + (row % 3) * 2));
        col = U.hashf(brick, row, 5) < 0.5 ? P.st1 : U.hashf(brick, row, 6) < 0.6 ? P.st2 : S.mix(P.st1, P.d1, 0.5);
        if (py % 4 === 0) col = S.mix(col, P.st3, 0.5);
        if (py % 4 === 3) col = P.st0;
        if (ly > 13) col = S.mix(col, P.ink, 0.5);
        if (ly < 2) col = P.st0;
        if (n > 0.66 && U.hashf(px, py, 4) < 0.3) col = S.mix(col, P.w1, 0.4);
      } else {
        const n2 = S.vnoise(px * 0.25, py * 0.25, 47);
        col = S.mix(P.ink, P.st0, U.clamp((n - 0.3) * 1.6, 0, 0.85));
        if (n2 > 0.82 && U.hashf(px, py, 2) < 0.3) col = S.mix(col, P.st1, 0.4);
        if (U.hashf(px >> 1, py >> 1, 3) < 0.004) col = P.st1;
        const edge = (!solid(tx - 1, ty) && lx < 2) || (!solid(tx + 1, ty) && lx > 13) || (!solid(tx, ty - 1) && ly < 2);
        if (edge) col = P.st1;
      }
      const r = S.rgb(col), i4 = (py * c.width + px) * 4; dd[i4] = r[0]; dd[i4 + 1] = r[1]; dd[i4 + 2] = r[2]; dd[i4 + 3] = 255;
    }
    cg.putImageData(id, 0, 0);
    // rails: entrance → gallery → stope, and a spur to the deep drift
    const rail = (x0, y0, x1, y1) => {
      const v = x0 === x1, len = v ? Math.abs(y1 - y0) : Math.abs(x1 - x0), sx = v ? 0 : Math.sign(x1 - x0), sy = v ? Math.sign(y1 - y0) : 0;
      for (let i = 0; i <= len; i += 6) { const x = x0 + sx * i, y = y0 + sy * i; if (v) { R(cg, P.wood2, x - 6, y, 13, 2); R(cg, P.wood0, x - 6, y + 2, 13, 1); } else { R(cg, P.wood2, x, y - 6, 2, 13); R(cg, P.wood0, x + 2, y - 6, 1, 13); } }
      for (let i = 0; i <= len; i++) { const x = x0 + sx * i, y = y0 + sy * i; if (v) { R(cg, P.i3, x - 4, y, 1, 1); R(cg, P.i1, x - 3, y, 1, 1); R(cg, P.i3, x + 3, y, 1, 1); R(cg, P.i1, x + 4, y, 1, 1); } else { R(cg, P.i4, x, y - 4, 1, 1); R(cg, P.i1, x, y - 3, 1, 1); R(cg, P.i4, x, y + 3, 1, 1); R(cg, P.i1, x, y + 4, 1, 1); } }
    };
    rail(80, 270, 80, 170); rail(80, 170, 388, 170); rail(176, 170, 176, 100); rail(392, 170, 392, 100);
    // puddle in the south alcove
    cg.fillStyle = S.rgba(P.w1, 0.85); cg.beginPath(); cg.ellipse(270, 226, 14, 5, 0, 0, 6.3); cg.fill();
    cg.fillStyle = S.rgba(P.w3, 0.4); cg.fillRect(262, 224, 6, 1);
    return c;
  }
  NW.World.registerArea(IDS.mine, {
    name: 'Hollow Mine', theme: 'stone', shelter: 8, dark: 0.86, surface: 'dirt', map: MINE_MAP, bg: mineBg,
    mapAt: { area: 'f_3_1', x: 128, y: 90 },
    exits: [{ x: 64, y: 262, w: 32, h: 10, to: 'f_3_1', tx: 128, ty: 100, dir: 'down' }],
    objs: () => {
      const L = [];
      // timber sets framing the gallery wall, props holding up the chambers
      [128, 232, 344].forEach((x) => L.push(deco({ layer: 'wall', x: -99, y: -99, draw: (g) => g.drawImage(sTimber(), x - 13, 116) })));
      [[124, 62], [228, 62], [346, 44], [440, 44]].forEach(([x, y]) => L.push(deco({ x, y, cx: x - 3, cy: y - 4, cw: 6, ch: 4, solid: true, draw: (g) => g.drawImage(sProp(), x - 6, y - 32) })));
      for (const k in LAMPS) {
        const l = LAMPS[k];
        L.push({ x: l.x, y: l.y + 12, cx: l.x - 6, cy: l.y + 2, cw: 12, ch: 14, layer: 'wall', draw: (g, t) => { g.drawImage(sLamp(lampLit(k)), l.x - 5, l.y); if (lampLit(k) && Math.sin(t * 13 + l.x) > 0.6) R(g, P.f4, l.x - 1, l.y + 8, 2, 2); },
          name: () => "Miner's lamp — " + (lampLit(k) ? 'lit · ' + U.fmtDur(mod().lamps[k] - absMin()) : 'dark'),
          actions: () => { const n = I.count(st().inv, 'oil'); return [act(lampLit(k) ? 'Top up the lamp (1 Lamp Oil)' : 'Light the lamp (1 Lamp Oil)', () => lightLamp(k), { disabled: n ? false : 'Need a tin of Lamp Oil' })]; } });
      }
      L.push({ x: 68, y: 140, cx: 54, cy: 128, cw: 28, ch: 16, layer: 'wall', draw: (g) => g.drawImage(sNotice(), 54, 124),
        name: "Foreman's notice", actions: () => [act('Read', () => { G().sfx('paper'); G().showText("Foreman's notice", NOTICE); G().journalOnce('pl_notice', 'A 1931 notice in the Hollow Mine: no one past the lamps without a light. "The foreman does not call from below."', 'notes'); })] });
      L.push({ x: 176, y: 97, cx: 163, cy: 88, cw: 26, ch: 9, solid: true, draw: (g) => g.drawImage(sCart(), 161, 75),
        name: () => 'Ore cart' + stashTag('mine_cart'), actions: () => lootActs('mine_cart', 'Search the ore cart', 'rattle') });
      L.push(deco({ x: 212, y: 70, cx: 196, cy: 60, cw: 32, ch: 10, solid: true, draw: (g) => g.drawImage(sRubble(), 194, 50) }));
      L.push({ x: 354, y: 78, cx: 342, cy: 68, cw: 24, ch: 10, solid: true, draw: (g) => g.drawImage(sMag(), 340, 58),
        name: () => 'Powder magazine' + stashTag('mine_mag'), actions: () => lootActs('mine_mag', 'Search the magazine', 'rattle') });
      L.push({ x: 418, y: 92, cx: 402, cy: 70, cw: 32, ch: 22, solid: true, layer: 'floor', draw: (g) => g.drawImage(sWinze(), 400, 66),
        name: 'The winze', actions: () => winzeActs() });
      L.push(deco({ layer: 'floor', x: -99, y: -99, draw: (g) => g.drawImage(sHelmet(), 368, 96) }));
      L.push({ x: 312, y: 224, cx: 305, cy: 214, cw: 13, ch: 9, solid: true, draw: (g) => g.drawImage(sLocker(!stash('mine_locker', 0)), 304, 192),
        name: () => "Miner's locker" + stashTag('mine_locker'), actions: () => (stash('mine_locker', 0) ? lootActs('mine_locker', 'Open the locker', 'rattle') : [act('Look inside', () => G().showText("Miner's locker", 'Empty now. A photograph is taped inside the door: a young man in a hard hat, squinting at the sun. On the back, in pencil: "Back up by supper. — E."'))]) });
      return L;
    },
  });
  function lightLamp(k) {
    const m = mod(), s = st();
    if (!I.remove(s.inv, 'oil', 1)) return G().msg('You need a tin of Lamp Oil.', 'warn');
    m.lamps[k] = Math.max(m.lamps[k] || 0, absMin()) + 12 * 60;
    if (m.lamps[k] - absMin() > 24 * 60) m.lamps[k] = absMin() + 24 * 60;
    G().sfx('fireup', { vol: 0.6 }); G().msg('The wick catches. Yellow light pushes the dark back into the rock.', 'good');
    G().journalOnce('pl_lamp', 'Lit a miner\'s lamp in the Hollow Mine. Inside the lamplight the whispering stops.', 'notes');
  }
  function winzeActs() {
    return [
      act('Listen', () => { G().sfx('gust', { vol: 0.25 }); G().showText('The winze', 'A shaft drops straight into black. Cold air breathes up out of it, slow, in and out. After a while you notice it is breathing in time with you.'); }),
      act('Drop a stone', () => { G().sfx('drip', { vol: 0.15 }); G().msg('You let go of the stone. You never hear it land.', 'warn'); G().journalOnce('pl_winze', 'Dropped a stone down the winze at the bottom of the Hollow Mine. It never hit anything.', 'sightings'); }),
    ];
  }

  // ---------------------------------------------------- mine hazard: the dark
  // Outside lamplight the whispers build (telegraphed in stages); at the top something in the dark strikes.
  let dread = { stage: 0, dripT: 3, rumbleT: 40, sndT: 0, dust: 0, eyes: [] };
  PL.inLight = function (x, y) {
    const day = NW.Survival.daylight();
    if (U.dist(x, y, MOUTH.x, MOUTH.y) < (day > 0.35 ? 112 : 60)) return true;
    for (const k in LAMPS) if (lampLit(k) && U.dist(x, y, LAMPS[k].x, LAMPS[k].y + 12) < 76) return true;
    return false;
  };
  function mineTick(dt) {
    const g = G(), s = st(), m = mod(), p = s.player;
    dread.dripT -= dt; dread.rumbleT -= dt; dread.dust = Math.max(0, dread.dust - dt);
    if (dread.dripT <= 0) { dread.dripT = U.rand(2.5, 7); g.sfx('drip', { vol: U.rand(0.15, 0.4), pan: U.rand(-0.8, 0.8) }); }
    if (dread.rumbleT <= 0) {
      dread.rumbleT = U.rand(50, 110); dread.dust = 2.5; g.sfx('mine_rumble', { vol: 0.6 }); g.shake = Math.max(g.shake, 3);
      if (!m.once.rumble) { m.once.rumble = true; g.msg('The mountain shifts. Dust sifts down from the timbers.', 'warn'); }
    }
    if (NW.UI.blocksMovement()) return;
    if (PL.inLight(p.x, p.y)) {
      m.dread = Math.max(0, m.dread - 30 * dt);
      if (dread.stage > 0 && m.dread < 8) { dread.stage = 0; g.msg('In the light, the whispering falls back into the rock.', 'good'); }
      return;
    }
    const rate = 7 * (NW.Survival.isNight() ? 1.25 : 1) * U.clamp(g.modeVal('monster', 1), 0.7, 1.5);
    m.dread = Math.min(100, m.dread + rate * dt);
    dread.sndT -= dt;
    if (dread.sndT <= 0 && m.dread > 20) { dread.sndT = U.rand(1.2, 2.6) - m.dread / 80; g.sfx(m.dread > 60 ? 'heartbeat' : 'gust', { vol: 0.12 + m.dread / 250, pan: U.rand(-1, 1) }); }
    const stage = m.dread >= 80 ? 3 : m.dread >= 52 ? 2 : m.dread >= 22 ? 1 : 0;
    if (stage > dread.stage) {
      dread.stage = stage;
      if (stage === 1) { g.msg('Whispering, just behind you. It stops when you turn.', 'warn'); g.journalOnce('pl_whisper', 'In the Hollow Mine, away from the lamps, something whispers. It knows my name.', 'sightings'); }
      if (stage === 2) { g.msg('The whispers say your name. Your light is not enough down here — get back to a lamp or the entrance.', 'danger'); g.sfx('scratch', { vol: 0.3 }); }
      if (stage === 3) { g.warn('GET TO THE LIGHT'); g.sfx('sting', { vol: 0.5 }); }
    }
    if (m.dread >= 100) {
      m.dread = 52; dread.stage = 2;
      g.flash = 0.35; g.sfx('shriek', { vol: 0.6 });
      NW.Survival.damage(18, 'hollow');
      if (!g.dead) g.msg('Cold fingers close on you out of the dark. Get to the light!', 'danger');
    }
  }
  D.DEATH.hollow = D.DEATH.hollow || { title: 'Taken in the Hollow Mine', text: 'The dark at the bottom of the Hollow Mine closes on anyone who stays outside the lamplight. Light the miner\'s lamps with Lamp Oil, keep inside their glow, and when the whispers start, walk back to the light.' };
  function drawDread(g, t) {
    const m = mod(), k = m.dread / 100;
    if (dread.dust > 0) { g.fillStyle = 'rgba(160,150,135,' + (0.5 * dread.dust / 2.5) + ')'; for (let i = 0; i < 40; i++) g.fillRect(U.hashf(i, 7) * 480, (U.hashf(i, 8) * 272 + t * 40 * (0.5 + U.hashf(i, 9))) % 272, 1, 2); }
    if (k <= 0.05) return;
    const p = st().player, a = G().area, cx = p.x + a.ox, cy = p.y - 8 + a.oy;
    const gr = g.createRadialGradient(cx, cy, 70 - k * 40, cx, cy, 260 - k * 120);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(2,2,6,' + Math.min(0.92, k * 1.05) + ')');
    g.fillStyle = gr; g.fillRect(0, 0, 480, 272);
    if (k > 0.35) {
      // eyes open in the dark around the edge of your light
      const n = Math.floor((k - 0.3) * 14);
      for (let i = 0; i < n; i++) {
        const ang = U.hashf(i, 3, Math.floor(t / 2.7)) * 6.28, rr = 120 - k * 50 + U.hashf(i, 4) * 30;
        if ((t * 1.3 + i * 0.7) % 3.1 < 0.15) continue;
        const ex = cx + Math.cos(ang) * rr, ey = cy + Math.sin(ang) * rr * 0.7;
        g.fillStyle = S.rgba(P.pale2, 0.35 + k * 0.5); g.fillRect(ex - 3, ey, 2, 1); g.fillRect(ex + 2, ey, 2, 1);
      }
    }
    if (k > 0.72) {
      // pale arms reaching in from the dark, fingers toward you
      g.save(); g.globalAlpha = Math.min(1, (k - 0.7) * 3.5);
      for (let i = 0; i < 5; i++) {
        const ang = i / 5 * 6.28 + 0.4 + Math.sin(t * 0.6 + i * 2) * 0.12, reach = 150 - (k - 0.72) * 300 + Math.sin(t * 2.3 + i) * 5;
        g.setTransform(1, 0, 0, 1, Math.round(cx + Math.cos(ang) * reach), Math.round(cy + Math.sin(ang) * reach * 0.75)); g.rotate(ang - Math.PI / 2);
        g.drawImage(sHand(), -5, 0);
      }
      g.restore();
    }
  }

  // ============================================================ ENTRANCES
  // Each landmark's structure gets an entry action in front of its own "Examine".
  const ENTRY = { tower: { x: 128, y: 134, dir: 'up' }, shack: { x: 144, y: 150, dir: 'up' }, mine: { x: 80, y: 246, dir: 'up' } };
  function enter(key) {
    const e = ENTRY[key];
    G().enterArea(IDS[key], e.x, e.y, e.dir);
  }
  const DOORS = {
    firetower: () => { const wx = st().weather, bliz = wx.type === 'blizzard' || wx.wind > 0.8; return [{ label: 'Climb the ladder', time: bliz ? 3.2 : 2.2, sound: 'ladder', every: 0.5, done: () => { if (bliz) G().msg('The wind tears at you all the way up. Your fingers stick to the rungs.', 'warn'); enter('tower'); } }]; },
    shack: () => [act(garrowHome() ? 'Knock and go in' : 'Go inside', () => { G().sfx(garrowHome() ? 'knock' : 'door', garrowHome() ? { count: 2, vol: 0.5 } : { vol: 0.7 }); enter('shack'); })],
    mine: () => (mod().boards ? [act('Enter the mine', () => { G().sfx('heavy_door', { vol: 0.5 }); enter('mine'); })]
      : [{ label: 'Pry the boards loose', time: 2.6, sound: 'wood_crack', every: 0.7, done: () => { mod().boards = true; G().sfx('thud'); G().msg('Two boards come away with a shriek of old nails. Cold air breathes out of the dark.', 'warn'); G().save('event'); } }]),
  };
  const origActions = NW.Objects.actions;
  NW.Objects.actions = function (o) {
    const r = origActions.apply(this, arguments);
    if (o && o.type === 'struct' && DOORS[o.sprite] && NW.G.state && NW.G.area && NW.G.area.kind === 'forest') { try { return DOORS[o.sprite]().concat(r || []); } catch (e) { console.error(e); } }
    return r;
  };
  // ladder, stovepipe smoke and the pried boards, drawn over the landmark structures
  const drawLadder = (g) => { R(g, P.wood1, 316, 52, 2, 68); R(g, P.wood1, 323, 52, 2, 68); for (let y = 56; y < 120; y += 5) { R(g, P.wood3, 316, y, 9, 1); R(g, P.wood0, 316, y + 1, 9, 1); } };
  function drawShackSmoke(g, t) {
    R(g, P.i1, 310, 44, 4, 14); R(g, P.i2, 309, 43, 6, 2);
    if (!shackLit()) return;
    const w = st().weather.wind;
    for (let i = 0; i < 7; i++) { const ph = (t * 0.35 + i / 7) % 1; g.fillStyle = 'rgba(165,170,180,' + (0.4 * (1 - ph)) + ')'; g.beginPath(); g.arc(312 + ph * 26 * (0.4 + w) + Math.sin(ph * 6 + i) * 2, 42 - ph * 40, 1.5 + ph * 5, 0, 6.3); g.fill(); }
  }
  function drawBoards(g) {
    if (!mod().boards) return;
    R(g, P.ink, 116, 58, 24, 20); R(g, P.wood4, 112, 54, 9, 3); R(g, P.wood4, 135, 72, 9, 3); R(g, P.wood3, 113, 60, 3, 9); R(g, P.i3, 117, 55, 1, 1);
  }
  H.on('objects', (aid) => {
    if (aid === 'f_0_0') return { x: 320, y: 134, sy: 121, draw: drawLadder };
    if (aid === 'f_0_2') return { x: 335, y: 106, sy: 101, draw: drawShackSmoke };
    if (aid === 'f_3_1') return { x: 128, y: 100, sy: 89, draw: drawBoards };
  });

  // =========================================================== FREE SPOTS
  // A floor point in an interior kept clear of the furniture, for another module's NPC or object.
  const SPOTS = { [IDS.tower]: [[128, 100], [160, 104], [96, 106], [176, 120]], [IDS.shack]: [[84, 116], [196, 112], [200, 134], [92, 140]], [IDS.mine]: [[300, 162], [104, 214], [150, 166], [300, 186]] };
  PL.spot = function (areaId) {
    const list = SPOTS[areaId]; if (!list) return null;
    for (const [x, y] of list) if (G().spotFree(areaId, x, y, 14)) return { x, y };
    for (const [x, y] of list) if (!NW.World.blocked(NW.World.get(areaId), x - 8, y - 6, 16, 7, null, true)) return { x, y };
    return null;
  };

  // ============================================================== HOOKS
  const FIRST = {
    [IDS.tower]: ['The cab sways in the wind. Windows on every side, rimed with frost. Someone lived up here.', 'Climbed the Old Fire Tower. The cab looks out over the whole backcountry. The last ranger kept a logbook up here.'],
    [IDS.shack]: ['Smoke-dark logs, pelts on the walls. It smells of tallow and wet wool.', 'Inside Garrow\'s shack. Pelts and traps, a potbelly stove, a crate of supplies.'],
    [IDS.mine]: ['Still air, very cold. Water drips somewhere deep in the rock. The old lamps hang dark.', 'Went into the Hollow Mine. Old miner\'s lamps hang along the gallery. Lamp oil would light them.'],
  };
  H.on('areaEnter', (id, prev) => {
    const g = G();
    if (FIRST[id]) {
      const m = mod();
      m.visits[id] = (m.visits[id] || 0) + 1;
      if (m.visits[id] === 1) { g.msg(FIRST[id][0]); g.journalOnce('pl_' + id, FIRST[id][1], 'notes'); }
      if (id === IDS.mine) { m.dread = 0; dread.stage = 0; dread.rumbleT = U.rand(25, 60); }
      if (id === IDS.tower && st().weather.wind > 0.5) g.sfx('wind_high', { vol: 0.5 });
      g.save('area');
      H.emit('placeEntered', id);
    }
    if (prev === IDS.tower && id === 'f_0_0') g.sfx('ladder', { vol: 0.7 });
    if (prev === IDS.shack && id === 'f_0_2') g.sfx('door', { vol: 0.6 });
    if (prev === IDS.mine) { mod().dread = 0; dread.stage = 0; }
  });
  let windT = 4;
  H.on('update', (dt, gm) => {
    const s = st(), a = G().area; if (!s || !a) return;
    const m = s.mods && s.mods.places;
    if (m && m.shackFuel > 0) m.shackFuel = Math.max(0, m.shackFuel - gm);
    if (a.id === IDS.mine) mineTick(dt);
    else if (a.id === IDS.tower) { windT -= dt; if (windT <= 0) { windT = U.rand(6, 14) / (0.4 + s.weather.wind); G().sfx(s.weather.wind > 0.6 ? 'wind_high' : 'gust', { vol: 0.15 + s.weather.wind * 0.35, pan: U.rand(-0.7, 0.7) }); if (Math.random() < 0.3) G().sfx('creak', { vol: 0.2 }); } }
  });
  H.on('envTemp', (T, a) => { if (a && a.id === IDS.shack && shackLit()) return T + 16; });
  H.on('music', (mode, s, a) => {
    if (!a || !s) return;
    if (s.night && s.night.active && s.night.plan && s.night.plan.final) return;
    if (a.id === IDS.mine) return 'mine';
    if (a.id === IDS.tower || a.id === IDS.shack) return 'interior';
  });
  H.on('lights', (a, t) => {
    if (!a || a.kind !== 'interior') return;
    const day = NW.Survival.daylight(), out = [];
    if (a.id === IDS.tower) {
      if (day > 0.05) [[52, 30], [128, 30], [204, 30], [10, 70], [246, 70], [52, 150], [204, 150]].forEach(([x, y]) => out.push({ x, y, r: 74, a: day * 0.75, col: P.b3, ga: 0 }));
    } else if (a.id === IDS.shack) {
      const f = 1 + Math.sin(t * 9) * 0.03;
      out.push({ x: 135, y: 82, r: 64 * f, a: 0.75, col: P.f3, ga: 0.12 });
      if (shackLit()) { const fl = 1 + Math.sin(t * 13) * 0.05 + Math.sin(t * 7.3) * 0.04; out.push({ x: 46, y: 44, r: 96 * fl, a: 0.85, col: P.f2, ga: 0.2 }); }
      if (day > 0.05) [[56, 160], [232, 160]].forEach(([x, y]) => out.push({ x, y, r: 60, a: day * 0.6, col: P.b3, ga: 0 }));
    } else if (a.id === IDS.mine) {
      out.push({ x: MOUTH.x, y: MOUTH.y, r: 60 + day * 80, a: 0.35 + day * 0.55, col: day > 0.3 ? P.b3 : P.st3, ga: 0.05 });
      for (const k in LAMPS) if (lampLit(k)) { const fl = 1 + Math.sin(t * 9 + LAMPS[k].x) * 0.04; out.push({ x: LAMPS[k].x, y: LAMPS[k].y + 10, r: 96 * fl, a: 0.9, col: P.f3, ga: 0.16 }); }
    }
    return out;
  });
  H.on('drawOverlay', (g, a, t) => {
    if (a && a.id === IDS.mine) drawDread(g, t);
    if (UI.isOpen('pl_view')) { const c = document.getElementById('pl-view-c'); if (c) drawView(c, t); }
  });

  // =========================================================== LOOKOUT VIEW
  // A pixel panorama from the tower cab, looking east to south over the backcountry (seeded per world).
  const B0 = 70, B1 = 200;
  const bearing = (id) => { const [x, y] = D.areaXY(id); return Math.atan2(x, -y) * 180 / Math.PI; };
  const bx = (b, w) => Math.round((b - B0) / (B1 - B0) * w);
  function mineLightTonight() { const s = st(); return s.time.day >= 2 && U.hash(s.seed, s.time.day, 313) % 3 !== 0; }
  function viewFacts() {
    const s = st(), Sv = NW.Survival, day = Sv.daylight(), wx = s.weather;
    const fog = Math.max(wx.fog, wx.type === 'blizzard' ? 0.85 : wx.type === 'snow' ? 0.35 : 0);
    const lit = Sv.stoveLit(), set = s.stove.setting, leak = Sv.light.leak || 0;
    const lamps = Object.keys(LAMPS).some(lampLit);
    return { day, fog, lit, set, leak, night: day < 0.3, shack: shackLit() || (day > 0.4 && U.hash(s.seed, s.time.day, 77) % 4 === 0), mineLight: day < 0.3 && mineLightTonight(), lamps, lh: s.night.active && s.night.lh && s.night.lh.stage === 'circling' };
  }
  function drawView(cv, t) {
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const W2 = cv.width, H2 = cv.height, s = st(), f = viewFacts(), dk = 1 - f.day, HZ = 54;
    const sky = NW.Objects.skyColor(), seed = s.seed & 1023;
    const gr = g.createLinearGradient(0, 0, 0, HZ + 10); gr.addColorStop(0, S.mix(sky, P.ink, 0.4)); gr.addColorStop(1, sky);
    g.fillStyle = gr; g.fillRect(0, 0, W2, H2);
    if (f.night && (s.weather.type === 'clear' || s.weather.type === 'cloudy')) for (let i = 0; i < 50; i++) { if (s.weather.type === 'cloudy' && i % 3) continue; g.fillStyle = 'rgba(255,255,255,' + (0.3 + U.hashf(i, 2, seed) * 0.6) + ')'; g.fillRect(U.hashf(i, 3, seed) * W2, U.hashf(i, 4, seed) * HZ * 0.8, 1, 1); }
    const shade = (c, k) => S.mix(c, P.ink, Math.min(0.9, dk * (k == null ? 0.7 : k)));
    // far ridge
    const ridge = S.mix(shade(P.st2, 0.8), sky, 0.45);
    for (let x = 0; x < W2; x++) { const h = 8 + S.fbm(x * 0.012, 3.3, seed) * 22; R(g, ridge, x, HZ - h, 1, h + 2); if (s.weather.snow > 0.3 && S.fbm(x * 0.05, 9, seed) > 0.5) R(g, S.mix(ridge, P.sn3, 0.4), x, HZ - h, 1, 2); }
    const xs = { mast: bx(bearing('f_4_0') + 3, W2), lake: bx(bearing('f_2_0'), W2), mine: bx(bearing('f_3_1'), W2), oak: bx(bearing('f_4_3'), W2), cabin: bx(bearing('f_2_2'), W2), shack: bx(bearing('f_0_2'), W2) };
    // relay mast and the hollow oak on the far skyline
    g.strokeStyle = shade(P.i3); g.lineWidth = 1; g.beginPath(); g.moveTo(xs.mast - 2.5, HZ); g.lineTo(xs.mast + 0.5, HZ - 24); g.lineTo(xs.mast + 3.5, HZ); g.stroke();
    if (Math.sin(t * 3) > 0) { R(g, P.r3, xs.mast, HZ - 26, 2, 2); if (f.night) { g.fillStyle = S.rgba(P.r3, 0.25); g.fillRect(xs.mast - 2, HZ - 28, 6, 6); } }
    g.fillStyle = shade(P.wood1, 0.8); g.beginPath(); g.ellipse(xs.oak, HZ - 6, 9, 7, 0, 0, 6.3); g.fill(); R(g, shade(P.wood0), xs.oak - 1, HZ - 2, 2, 4);
    // the mine's rock outcrop
    g.fillStyle = shade(P.st1, 0.8); g.beginPath(); g.moveTo(xs.mine - 18, HZ + 4); g.lineTo(xs.mine - 6, HZ - 12); g.lineTo(xs.mine + 4, HZ - 9); g.lineTo(xs.mine + 16, HZ + 4); g.fill();
    R(g, P.ink, xs.mine - 2, HZ - 3, 4, 4);
    if (f.lamps && f.night) { g.fillStyle = S.rgba(P.f3, 0.8); g.fillRect(xs.mine - 1, HZ - 2, 2, 2); }
    else if (f.mineLight) { const k = 0.6 + Math.sin(t * 0.9) * 0.3; g.fillStyle = S.rgba(P.pale2, k); g.fillRect(xs.mine - 1, HZ - 2, 2, 2); g.globalCompositeOperation = 'lighter'; const ml = g.createRadialGradient(xs.mine, HZ - 1, 0, xs.mine, HZ - 1, 9); ml.addColorStop(0, S.rgba(P.pale2, k * 0.35)); ml.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = ml; g.fillRect(xs.mine - 9, HZ - 10, 18, 18); g.globalCompositeOperation = 'source-over'; }
    // forest bands: far, mid
    const band = (y0, step, hmin, hvar, col, sd, skip) => { g.fillStyle = col; for (let x = -6; x < W2 + 6; x += step) { if (skip && skip.some((k) => Math.abs(x - k) < 16)) continue; const h = hmin + S.vnoise(x * 0.09 + sd, sd, seed) * hvar; g.beginPath(); g.moveTo(x - step * 0.9, y0); g.lineTo(x, y0 - h); g.lineTo(x + step * 0.9, y0); g.fill(); } g.fillRect(0, y0, W2, H2 - y0); };
    const snowy = s.weather.snow > 0.3;
    band(HZ + 6, 3, 4, 7, S.mix(shade(P.g1, 0.85), sky, 0.35), 11);
    // lake wren: an ice sheet in a clearing
    g.fillStyle = shade(snowy ? P.sn1 : P.gr1, 0.75); g.beginPath(); g.ellipse(xs.lake, HZ + 9, 24, 4, 0, 0, 6.3); g.fill();
    g.fillStyle = shade(P.ice1, 0.75); g.beginPath(); g.ellipse(xs.lake, HZ + 9, 18, 2.5, 0, 0, 6.3); g.fill(); if (f.day > 0.5) R(g, P.white, xs.lake - 8, HZ + 8, 5, 1);
    band(HZ + 16, 4, 6, 10, shade(P.g1, 0.85), 23);
    // the station in its clearing: roof, chimney, smoke, window glow
    const cx = xs.cabin, cy = HZ + 22;
    g.fillStyle = shade(snowy ? P.sn1 : P.gr1, 0.8); g.beginPath(); g.ellipse(cx, cy + 1, 20, 4, 0, 0, 6.3); g.fill();
    R(g, shade(P.log1, 0.8), cx - 9, cy - 5, 18, 6); R(g, shade(P.log2, 0.8), cx - 9, cy - 5, 18, 1); R(g, shade(P.wood0, 0.8), cx - 2, cy - 3, 4, 4);
    g.fillStyle = shade(snowy ? P.sn2 : P.wood2, 0.75); g.beginPath(); g.moveTo(cx - 12, cy - 4); g.lineTo(cx - 6, cy - 11); g.lineTo(cx + 6, cy - 11); g.lineTo(cx + 12, cy - 4); g.fill();
    R(g, shade(P.st2), cx - 5, cy - 15, 3, 5);
    if (f.lit) {
      const lv = { low: 0.4, medium: 0.7, high: 1 }[f.set] || 0.4;
      for (let i = 0; i < 6; i++) { const ph = (t * 0.3 + i / 6) % 1; g.fillStyle = 'rgba(170,175,185,' + (0.45 * (1 - ph) * lv) + ')'; g.beginPath(); g.arc(cx - 4 + ph * 12 * (0.5 + s.weather.wind), cy - 16 - ph * 18, 1 + ph * 3, 0, 6.3); g.fill(); }
      if (f.set === 'high' && f.night) for (let i = 0; i < 3; i++) { const ph = (t * 0.8 + i / 3) % 1; g.fillStyle = S.rgba(ph < 0.5 ? P.f3 : P.f1, 1 - ph); g.fillRect(cx - 4 + Math.sin(i * 3 + t) * 2, cy - 16 - ph * 10, 1, 1); }
    }
    const k = f.night ? U.clamp(f.leak / 1.6, 0, 1) : 0;
    R(g, k > 0.05 ? S.mix(P.ink, P.f3, 0.3 + k * 0.7) : shade(P.ink), cx - 7, cy - 3, 3, 2); R(g, k > 0.05 ? S.mix(P.ink, P.f3, 0.3 + k * 0.7) : shade(P.ink), cx + 4, cy - 3, 3, 2);
    if (k > 0.05) { g.globalCompositeOperation = 'lighter'; const lg = g.createRadialGradient(cx, cy - 2, 1, cx, cy - 2, 18); lg.addColorStop(0, S.rgba(P.f3, 0.25 * k)); lg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = lg; g.fillRect(cx - 18, cy - 20, 36, 36); g.globalCompositeOperation = 'source-over'; }
    if (f.lh) { const lx = cx + Math.cos(t * 0.6) * 15, ly = cy + 1 + Math.sin(t * 0.6) * 3; g.fillStyle = S.rgba(P.pale2, 0.6); g.fillRect(lx, ly - 5, 2, 5); g.fillRect(lx - 1, ly - 4, 1, 2); }
    // the trapper's shack, closer below the tower
    const sx = xs.shack, sy = HZ + 46;
    band(HZ + 34, 5, 8, 12, shade(P.g0, 0.9), 37, [cx]);
    g.fillStyle = shade(snowy ? P.sn1 : P.gr1, 0.85); g.beginPath(); g.ellipse(sx, sy + 1, 22, 4, 0, 0, 6.3); g.fill();
    R(g, shade(P.log1, 0.85), sx - 10, sy - 6, 20, 7); R(g, shade(P.wood0), sx - 2, sy - 4, 4, 5); R(g, shade(P.ink), sx - 8, sy - 4, 3, 2); R(g, shade(P.ink), sx + 5, sy - 4, 3, 2);
    g.fillStyle = shade(snowy ? P.sn2 : P.wood1, 0.8); g.beginPath(); g.moveTo(sx - 13, sy - 5); g.lineTo(sx, sy - 14); g.lineTo(sx + 13, sy - 5); g.fill(); R(g, shade(P.i1), sx - 7, sy - 16, 2, 6);
    if (f.shack) for (let i = 0; i < 6; i++) { const ph = (t * 0.32 + i / 6) % 1; g.fillStyle = 'rgba(170,175,185,' + (0.4 * (1 - ph)) + ')'; g.beginPath(); g.arc(sx - 6 + ph * 10 * (0.5 + s.weather.wind), sy - 17 - ph * 18, 1 + ph * 3, 0, 6.3); g.fill(); }
    // near pines framing the bottom, snow on their shoulders
    const near = shade(P.g0, 0.95);
    for (let i = 0; i < 9; i++) { const x = U.hashf(i, 5, seed) * W2, h = 22 + U.hashf(i, 6, seed) * 20, w = 8 + h * 0.25; if (Math.abs(x - sx) < 34 || Math.abs(x - cx) < 26) continue; g.fillStyle = near; g.beginPath(); g.moveTo(x - w, H2); g.lineTo(x, H2 - h); g.lineTo(x + w, H2); g.fill(); if (snowy) { g.fillStyle = shade(P.sn2, 0.8); g.fillRect(x - 2, H2 - h + 4, 4, 1); g.fillRect(x - 4, H2 - h + 10, 3, 1); } }
    // fog and falling weather
    if (f.fog > 0.05) { const fg = g.createLinearGradient(0, 0, 0, H2); fg.addColorStop(0, S.rgba(S.mix('#8a96a3', P.ink, dk * 0.8), f.fog * 0.95)); fg.addColorStop(1, S.rgba(S.mix('#8a96a3', P.ink, dk * 0.8), f.fog * 0.45)); g.fillStyle = fg; g.fillRect(0, 0, W2, H2); }
    if (s.weather.precip > 0.1) { g.fillStyle = s.weather.type === 'rain' ? S.rgba(P.b3, 0.6) : 'rgba(240,244,250,0.8)'; for (let i = 0; i < 40 * s.weather.precip; i++) g.fillRect((U.hashf(i, 1) * W2 + t * (10 + s.weather.wind * 50)) % W2, (U.hashf(i, 2) * H2 + t * (s.weather.type === 'rain' ? 90 : 18)) % H2, 1, s.weather.type === 'rain' ? 2 : 1); }
    // bearing scale
    R(g, 'rgba(0,0,0,0.55)', 0, H2 - 9, W2, 9);
    g.fillStyle = '#d6cfbb'; g.font = '7px monospace';
    for (let b = 80; b <= 190; b += 10) { const x = bx(b, W2); R(g, b % 45 === 0 ? P.f3 : P.st3, x, H2 - 9, 1, b % 45 === 0 ? 4 : 2); }
    [[90, 'E'], [135, 'SE'], [180, 'S']].forEach(([b, l]) => g.fillText(l + ' ' + b, bx(b, W2) - 8, H2 - 1));
  }
  function viewLines() {
    const f = viewFacts(), out = [];
    if (f.fog > 0.7) out.push('Snow and fog fill the valley. You can barely make out the station.');
    else if (f.fog > 0.4) out.push('Fog lies in the low ground. The far ridges come and go.');
    out.push('SE 135 — Station 7: ' + (f.lit ? (f.set === 'high' ? 'the chimney throws sparks. You can see it from here.' : 'chimney smoke, steady.') : 'no smoke. The stove is out.') + (f.night && f.leak > 1.05 ? ' The windows glow. Anything out there can see them.' : ''));
    out.push("S 180 — Trapper's shack: " + (f.shack ? 'smoke from the stovepipe.' : 'cold. No smoke.'));
    if (f.lamps && f.night) out.push('E 108 — Hollow Mine: your lamps burn in the mouth of it.');
    else if (f.mineLight) out.push('E 108 — Hollow Mine: a pale light at the mouth. It does not flicker like a lamp.');
    if (f.lh) out.push('Something pale circles the station. Close the curtains, ranger.');
    if (f.fog < 0.5) out.push('E 93 — the relay mast, red light blinking.');
    return out;
  }
  function openView() {
    G().sfx('rustle', { vol: 0.5 });
    UI.open('pl_view');
    const s = st(), m = mod(), f = viewFacts();
    if (m.viewDay !== s.time.day) {
      m.viewDay = s.time.day;
      ['f_2_0', 'f_4_0', 'f_3_1', 'f_0_2', 'f_4_3', 'f_1_1', 'f_0_1'].forEach((id) => { s.world.visited[id] = true; });
      const bits = [f.lit ? 'smoke from the station' : 'a cold chimney at the station', f.shack ? 'smoke at the shack' : 'no smoke at the shack'];
      if (f.mineLight) bits.push('a pale light at the Hollow Mine');
      G().journal('From the fire tower: ' + bits.join(', ') + '.', f.mineLight ? 'sightings' : 'notes');
      if (!m.once.mapped) { m.once.mapped = true; G().msg('You sketch the landmarks you can see onto your map.', 'good'); }
    }
  }
  UI.registerPanel('pl_view', (box) => {
    box.innerHTML = UI.h.head('Lookout binoculars', 'Old Fire Tower') + '<div class="pbody view-wrap"><canvas id="pl-view-c" class="pl-view" width="320" height="120"></canvas><div id="pl-view-cap" class="cap pl-cap"></div></div><div class="pfoot"><button data-close>Step back</button></div>';
    UI.h.bindClose(box, 'pl_view');
    const cap = document.getElementById('pl-view-cap');
    const fill = () => { if (!UI.isOpen('pl_view') || !cap.isConnected) return; UI.h.setHTML(cap, viewLines().map((l) => '<div>' + UI.h.esc(l) + '</div>').join('')); setTimeout(fill, 700); };
    fill();
    drawView(document.getElementById('pl-view-c'), G().t);
  });
  function openLog() { G().sfx('page', { vol: 0.6 }); G().sfx('paper', { vol: 0.4 }); UI.open('pl_log'); }
  UI.registerPanel('pl_log', (box) => {
    const m = mod(), i = U.clamp(m.logPage | 0, 0, LOGBOOK.length - 1), [when, text] = LOGBOOK[i];
    m.once.logbook = true;
    if (i === LOGBOOK.length - 1) G().journalOnce('pl_logend', 'The fire tower logbook: the last ranger saw a light at the Hollow Mine every night, and went down to look. The last line stops mid-word.', 'notes');
    box.innerHTML = UI.h.head("Lookout's logbook", 'Page ' + (i + 1) + ' of ' + LOGBOOK.length) + '<div class="pbody doc paper pl-log"><div class="when">' + UI.h.esc(when) + '</div>' + UI.h.esc(text) + (i === LOGBOOK.length - 1 ? '<div class="hint">The rest of the page is blank. The pencil is still in the gutter of the book.</div>' : '') + '</div>' +
      '<div class="pfoot"><button id="pl-prev"' + (i ? '' : ' disabled') + '>Previous</button><button id="pl-next"' + (i < LOGBOOK.length - 1 ? '' : ' disabled') + '>Next page</button><button data-close>Close</button></div>';
    UI.h.bindClose(box, 'pl_log');
    const turn = (d) => { m.logPage = U.clamp(i + d, 0, LOGBOOK.length - 1); G().sfx('page', { vol: 0.5 }); G().sfx('paper', { vol: 0.3 }); UI.refresh('pl_log'); };
    document.getElementById('pl-prev').onclick = () => turn(-1);
    document.getElementById('pl-next').onclick = () => turn(1);
  });
  H.on('panelKey', (v, top, code) => {
    if (top !== 'pl_log') return;
    if (code === 'ArrowRight' || code === 'KeyD') { const b = document.getElementById('pl-next'); if (b && !b.disabled) b.click(); return true; }
    if (code === 'ArrowLeft' || code === 'KeyA') { const b = document.getElementById('pl-prev'); if (b && !b.disabled) b.click(); return true; }
  });
  UI.addStyle('.pl-view { width: calc(var(--u) * 320px * 0.85); image-rendering: pixelated; border: 3px solid #2b1a10; } .pl-cap { max-width: 34em; text-align: left; } .pl-cap div { margin: 0.1em 0; } .pl-log { min-height: 8em; max-width: 30em; font-size: 0.85em; } .pl-log .when { font-weight: bold; margin-bottom: 0.4em; }');
})(window.NW);
