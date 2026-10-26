'use strict';
// World construction: forest areas (deterministic from seed) and cabin rooms; collision.
(function (NW) {
  const U = NW.U, D = NW.D;
  const W = NW.World = {};
  const TS = D.TILE;

  const T = W.T = {
    GRASS: 0, DIRT: 1, WATER: 2, ICE: 3, ASH: 4, MUD: 5, ROCKG: 6, BRIDGE: 7, STONES: 8, FORD: 9,
    FLOOR: 10, WTOP: 11, WFACE: 12, WSIDE: 13, WBOT: 14, DOORWAY: 15, VOID: 16, BUILDING: 17, DOCK: 18,
  };
  const SOLID_T = new Set([T.WATER, T.WTOP, T.WFACE, T.WSIDE, T.WBOT, T.VOID, T.BUILDING]);
  W.isSolidTile = (t) => SOLID_T.has(t);

  const cache = {};
  W.clearCache = () => { for (const k in cache) delete cache[k]; };
  W.get = function (id) {
    if (!cache[id]) cache[id] = registry[id] ? buildInterior(id, registry[id]) : id.startsWith('room_') ? buildRoom(id) : buildForest(id);
    return cache[id];
  };
  // Enterable buildings away from the cabin (fire tower, trapper's shack, mine...) are registered by feature modules.
  const registry = {};
  W.registerArea = function (id, def) { registry[id] = def; delete cache[id]; };
  W.areaDef = (id) => registry[id] || null;
  W.isArea = (id) => typeof id === 'string' && (!!registry[id] || !!D.AREAS[id] || ['room_main', 'room_bed', 'room_office', 'room_storage'].includes(id));

  function newArea(id, kind, w, h) {
    return {
      id, kind, w, h, tiles: new Array(w * h).fill(kind === 'room' ? T.FLOOR : T.GRASS),
      objs: [], exits: [], ox: Math.floor((D.VW - w) * TS / 2), oy: Math.floor((D.VH - h) * TS / 2),
      name: kind === 'room' ? D.ROOMS[id].name : kind === 'forest' ? D.AREAS[id].name : id,
    };
  }
  W.tile = (a, tx, ty) => (tx < 0 || ty < 0 || tx >= a.w || ty >= a.h ? T.VOID : a.tiles[ty * a.w + tx]);
  function setT(a, tx, ty, t) { if (tx >= 0 && ty >= 0 && tx < a.w && ty < a.h) a.tiles[ty * a.w + tx] = t; }

  // ===================================================================== FOREST
  function buildForest(id) {
    const [ax, ay] = D.areaXY(id);
    const info = D.AREAS[id];
    const a = newArea(id, 'forest', 30, 17);
    a.ox = 0; a.oy = 0; a.ax = ax; a.ay = ay; a.lm = info.lm; a.creek = !!info.creek;
    const seed = NW.G.state.seed;
    const rnd = U.rng(U.hash(seed, ax, ay, 77));
    const reserved = new Uint8Array(30 * 17);
    const reserve = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < 30 && y < 17) reserved[y * 30 + x] = 1; };
    const isRes = (x, y) => x < 0 || y < 0 || x >= 30 || y >= 17 || reserved[y * 30 + x] === 1;

    a.open = { n: D.linked(ax, ay, ax, ay - 1), s: D.linked(ax, ay, ax, ay + 1), w: D.linked(ax, ay, ax - 1, ay), e: D.linked(ax, ay, ax + 1, ay) };
    const cx = a.creek ? 9 : 15;
    let hub = { x: cx, y: 8 };
    if (info.lm === 'cabin') hub = { x: 15, y: 12 };
    if (info.lm === 'lake') hub = { x: 15, y: 11 };
    a.hub = hub;

    // --- creek
    if (a.creek) {
      for (let y = 0; y < 17; y++) {
        const wob = Math.round(Math.sin(y * 0.7 + ax) * 0.6);
        for (let x = 18 + wob; x <= 19 + wob; x++) setT(a, x, y, T.WATER);
        reserve(17 + wob, y, 20 + wob, y);
      }
    }

    // --- trails
    const carve = (pts) => {
      for (let i = 0; i < pts.length - 1; i++) {
        let [x0, y0] = pts[i]; const [x1, y1] = pts[i + 1];
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
        for (let s = 0; s <= steps; s++) {
          const fx = x0 + (x1 - x0) * s / steps, fy = y0 + (y1 - y0) * s / steps;
          const wob = Math.sin((fx + fy) * 0.9 + ax * 3 + ay) * 0.45;
          const px = Math.round(fx + (y1 !== y0 ? wob : 0)), py = Math.round(fy + (x1 !== x0 ? wob : 0));
          for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
            const t = W.tile(a, px + dx - (x1 === x0 ? 0 : 0), py + dy);
            if (t === T.GRASS || t === T.ASH || t === T.MUD) setT(a, px + dx, py + dy, T.DIRT);
          }
          reserve(px - 1, py - 1, px + 2, py + 2);
        }
      }
    };
    if (info.lm === 'cabin') {
      if (a.open.n) carve([[15, 0], [15, 1], [5, 1], [5, 12], [15, 12]]);
      if (a.open.w) carve([[0, 8], [5, 8]]);
      if (a.open.e) carve([[29, 8], [25, 8], [25, 12], [15, 12]]);
      if (a.open.s) carve([[15, 16], [15, 12]]);
      carve([[5, 12], [25, 12]]);
    } else {
      if (a.open.n) carve([[cx, 0], [cx, hub.y]]);
      if (a.open.s) carve([[cx, 16], [cx, hub.y]]);
      if (a.open.w) carve([[0, 8], [hub.x, 8]]);
      if (a.open.e) carve([[29, 8], [hub.x, 8]]);
      if (!a.open.e && !a.open.w && (a.open.n || a.open.s)) carve([[cx, hub.y], [cx, hub.y]]);
    }
    // crossings
    if (a.creek) {
      const wobAt = (y) => Math.round(Math.sin(y * 0.7 + ax) * 0.6);
      if (info.lm === 'bridge') { void wobAt; for (let y = 7; y <= 9; y++) for (let x = 16; x <= 21; x++) setT(a, x, y, T.BRIDGE); a.bridge = { x: 16 * TS, y: 7 * TS, w: 6 * TS, h: 3 * TS }; }
      if (info.lm === 'stones') { for (let y = 8; y <= 9; y++) for (let x = 16; x <= 21; x++) if (W.tile(a, x, y) === T.WATER) setT(a, x, y, T.STONES); }
      if (info.lm === 'ford') { for (let y = 7; y <= 9; y++) for (let x = 16; x <= 21; x++) if (W.tile(a, x, y) === T.WATER) setT(a, x, y, T.FORD); }
    }
    // opening corridors
    if (a.open.n) reserve(cx - 2, 0, cx + 3, 2);
    if (a.open.s) reserve(cx - 2, 14, cx + 3, 16);
    if (a.open.w) reserve(0, 6, 2, 10);
    if (a.open.e) reserve(27, 6, 29, 10);

    // --- landmark structures
    stampLandmark(a, info.lm, reserve, rnd);

    // --- trees: borders + interior scatter
    const treeAt = [];
    const canTree = (x, y) => !isRes(x, y) && W.tile(a, x, y) === T.GRASS && !treeAt.some((p) => Math.abs(p[0] - x) + Math.abs(p[1] - y) < 2);
    const isBirch = info.lm === 'birches';
    const addTree = (x, y, kind) => {
      treeAt.push([x, y]);
      const size = kind === 'pine' ? (rnd() < 0.25 ? 2 : rnd() < 0.6 ? 1 : 0) : 0;
      a.objs.push({ type: 'tree', kind, size, variant: Math.floor(rnd() * 4), x: x * TS + 8 + Math.floor(rnd() * 5 - 2), y: y * TS + 14 + Math.floor(rnd() * 3), solid: true });
    };
    for (let y = 0; y < 17; y++) for (let x = 0; x < 30; x++) {
      const border = x < 2 || y < 2 || x > 27 || y > 14;
      const dens = info.lm === 'burned' ? 0.04 : info.lm === 'bog' ? 0.1 : 0.16;
      const n = NW.S.fbm(x * 0.25 + ax * 7, y * 0.25 + ay * 7, seed & 1023);
      if (border ? rnd() < 0.85 : (n > 0.5 && rnd() < dens * 2.2) || rnd() < dens * 0.35) {
        if (canTree(x, y)) addTree(x, y, isBirch ? (rnd() < 0.7 ? 'birch' : 'pine') : 'pine');
      }
    }
    // creek column east half for areas without east access: dense
    if (a.creek && !a.open.e) for (let y = 1; y < 16; y++) for (let x = 21; x < 29; x++) if (rnd() < 0.5 && canTree(x, y)) addTree(x, y, 'pine');

    // --- rocks & decorations
    const occupied = new Set(treeAt.map((p) => p[0] + ',' + p[1]));
    const free = (x, y) => !isRes(x, y) && W.tile(a, x, y) === T.GRASS && !occupied.has(x + ',' + y);
    const place = (n, fn) => {
      for (let i = 0, tries = 0; i < n && tries < 200; tries++) {
        const x = 2 + Math.floor(rnd() * 26), y = 2 + Math.floor(rnd() * 13);
        if (free(x, y)) { occupied.add(x + ',' + y); fn(x, y); i++; }
      }
    };
    place(2 + Math.floor(rnd() * 3), (x, y) => a.objs.push({ type: 'rock', variant: rnd() < 0.3 ? 2 : Math.floor(rnd() * 2), x: x * TS + 8, y: y * TS + 13, solid: true }));
    place(1 + Math.floor(rnd() * 2), (x, y) => a.objs.push({ type: 'stump', x: x * TS + 8, y: y * TS + 13, solid: true }));
    if (info.lm === 'bog' || info.lm === 'lake' || a.creek) place(4, (x, y) => a.objs.push({ type: 'reeds', x: x * TS + 8, y: y * TS + 14, solid: false }));

    // --- solidity & reachability
    computeSolid(a);
    const reach = flood(a, hub.x, hub.y);
    // --- resources (stable keys by order)
    let ridx = 0;
    const res = (type, extra, x, y) => {
      const key = id + ':' + type + ':' + (ridx++);
      a.objs.push(Object.assign({ type, key, x: x * TS + 8, y: y * TS + 12, res: true }, extra));
    };
    const freeR = (x, y) => free(x, y) && reach[y * 30 + x];
    const placeR = (n, fn) => {
      for (let i = 0, tries = 0; i < n && tries < 300; tries++) {
        const x = 1 + Math.floor(rnd() * 28), y = 1 + Math.floor(rnd() * 15);
        if (freeR(x, y)) { occupied.add(x + ',' + y); fn(x, y); i++; }
      }
    };
    const rich = info.lm === 'cabin' ? 0.6 : (Math.abs(ax - 2) + Math.abs(ay - 2)) >= 3 ? 1.35 : 1;
    placeR(Math.round((3 + rnd() * 3) * rich), (x, y) => res('branches', { variant: Math.floor(rnd() * 3), solid: false }, x, y));
    placeR(Math.round((1 + rnd() * 2) * rich) + (info.lm === 'deadfall' || info.lm === 'burned' ? 4 : 0), (x, y) => res('deadtree', { variant: Math.floor(rnd() * 2), solid: true }, x, y));
    placeR(rnd() < 0.7 * rich ? 1 + Math.floor(rnd() * 2) : 0, (x, y) => res('bush', { solid: true }, x, y));
    placeR(rnd() < 0.55 ? 1 : 0, (x, y) => res('mushrooms', { solid: false }, x, y));
    const herbType = info.lm === 'mine' || info.lm === 'stonecircle' || info.lm === 'burned' || info.lm === 'bog' ? 'smokeweed' : rnd() < 0.55 ? 'yarrow' : 'wintergreen';
    placeR(info.lm === 'cabin' ? 1 : 1 + Math.floor(rnd() * 2), (x, y) => res('herb', { herb: herbType, solid: false }, x, y));
    if (rnd() < 0.5) placeR(1, (x, y) => res('herb', { herb: rnd() < 0.6 ? 'yarrow' : 'wintergreen', solid: false }, x, y));

    a.reach = reach;
    computeSolid(a);
    a.objs.forEach((o, i) => { o.id = id + '#' + i; });
    return a;
  }

  function stampLandmark(a, lm, reserve, rnd) {
    const S = (o) => { a.objs.push(o); return o; };
    const block = (x0, y0, x1, y1) => { reserve(x0, y0, x1, y1); };
    switch (lm) {
      case 'cabin': {
        for (let y = 3; y <= 10; y++) for (let x = 9; x <= 20; x++) setT(a, x, y, T.BUILDING);
        for (let y = 5; y <= 9; y++) for (let x = 21; x <= 23; x++) setT(a, x, y, T.BUILDING);
        block(7, 1, 25, 11);
        S({ type: 'cabin_ext', x: 9 * TS, y: 11 * TS, solid: false, layer: 'normal' });
        S({ type: 'cabin_annex', x: 21 * TS, y: 10 * TS, solid: false, layer: 'normal' });
        S({ type: 'extdoor', door: 'front', x: 14 * TS + 16, y: 11 * TS + 4, w: 28, h: 10, solid: false });
        S({ type: 'extdoor', door: 'back', x: 22 * TS + 8, y: 10 * TS + 4, w: 18, h: 10, solid: false });
        S({ type: 'woodpile_ext', x: 7 * TS + 2, y: 9 * TS + 14, solid: true });
        S({ type: 'chopblock', x: 3 * TS + 8, y: 13 * TS + 12, solid: true });
        S({ type: 'sign', text: 'RANGER STATION 7 — Silverpine Backcountry. Report all sightings.', x: 18 * TS, y: 14 * TS + 12, solid: true });
        break;
      }
      case 'firetower':
        S({ type: 'struct', sprite: 'firetower', x: 20 * TS, y: 7 * TS + 8, solid: true, cw: 52, ch: 10 });
        block(17, 1, 24, 8);
        S({ type: 'loot', lm, x: 18 * TS, y: 7 * TS + 12, solid: true });
        break;
      case 'lake':
        for (let y = 2; y <= 7; y++) for (let x = 7; x <= 23; x++) {
          const nx = (x - 15) / 8.5, ny = (y - 4.5) / 3.2;
          if (nx * nx + ny * ny < 1) setT(a, x, y, T.ICE);
        }
        for (let y = 3; y <= 6; y++) for (let x = 10; x <= 20; x++) { const nx = (x - 15) / 5.5, ny = (y - 4.5) / 1.8; if (nx * nx + ny * ny < 1) setT(a, x, y, T.WATER); }
        block(6, 1, 24, 8);
        for (let y = 4; y <= 8; y++) for (let x = 14; x <= 15; x++) if (W.tile(a, x, y) === T.WATER || W.tile(a, x, y) === T.ICE) setT(a, x, y, T.DOCK);
        S({ type: 'struct', sprite: 'dock', x: 15 * TS, y: 9 * TS, solid: false, layer: 'floor' });
        break;
      case 'stones': break;
      case 'mast':
        S({ type: 'struct', sprite: 'mast', x: 21 * TS + 8, y: 6 * TS + 4, solid: true, cw: 30, ch: 10 });
        block(18, 1, 25, 7);
        S({ type: 'loot', lm, x: 18 * TS + 8, y: 6 * TS + 12, solid: true });
        break;
      case 'deadfall':
        for (let i = 0; i < 4; i++) S({ type: 'struct', sprite: 'log', x: (5 + i * 5) * TS, y: (4 + (i % 2) * 7) * TS + 12, solid: true, cw: 40, ch: 8 });
        break;
      case 'stonecircle':
        for (let i = 0; i < 7; i++) {
          const an = i / 7 * Math.PI * 2;
          S({ type: 'struct', sprite: 'standing', x: Math.round(21 * TS + Math.cos(an) * 46), y: Math.round(4.5 * TS + Math.sin(an) * 24 + 8), solid: true, cw: 10, ch: 6 });
        }
        S({ type: 'struct', sprite: 'altar', x: 21 * TS, y: 4.5 * TS + 10, solid: true, cw: 18, ch: 6 });
        block(17, 1, 25, 7);
        break;
      case 'mine':
        for (let y = 1; y <= 5; y++) for (let x = 3; x <= 13; x++) setT(a, x, y, T.ROCKG);
        S({ type: 'struct', sprite: 'mine', x: 8 * TS, y: 5 * TS + 8, solid: true, cw: 80, ch: 50 });
        block(2, 1, 14, 6);
        S({ type: 'loot', lm, x: 12 * TS + 8, y: 6 * TS + 12, solid: true });
        S({ type: 'struct', sprite: 'cart', x: 4 * TS, y: 6 * TS + 12, solid: true, cw: 18, ch: 8 });
        break;
      case 'shack':
        S({ type: 'struct', sprite: 'shack', x: 21 * TS, y: 6 * TS + 4, solid: true, cw: 70, ch: 36 });
        block(16, 1, 26, 7);
        S({ type: 'loot', lm, x: 24 * TS + 10, y: 6 * TS + 14, solid: true });
        S({ type: 'struct', sprite: 'pelts', x: 16 * TS + 8, y: 5 * TS + 12, solid: true, cw: 18, ch: 6 });
        break;
      case 'cairn':
        block(19, 2, 23, 5);
        break;
      case 'bridge': break;
      case 'blind':
        S({ type: 'struct', sprite: 'blind', x: 21 * TS + 8, y: 5 * TS + 8, solid: true, cw: 30, ch: 8 });
        block(18, 1, 25, 6);
        S({ type: 'loot', lm, x: 24 * TS + 8, y: 5 * TS + 12, solid: true });
        break;
      case 'burned':
        for (let y = 2; y < 15; y++) for (let x = 2; x < 28; x++) { const d = Math.hypot((x - 15) / 11, (y - 8) / 6); if (d < 1 && W.tile(a, x, y) === T.GRASS) setT(a, x, y, T.ASH); }
        for (let i = 0; i < 6; i++) S({ type: 'struct', sprite: 'charred', x: (5 + i * 4) * TS + 8, y: ((i % 2) ? 4 : 12) * TS + 12, solid: true, cw: 8, ch: 5 });
        break;
      case 'camp':
        S({ type: 'struct', sprite: 'tent', x: 20 * TS + 8, y: 5 * TS + 8, solid: true, cw: 36, ch: 14 });
        S({ type: 'struct', sprite: 'tent2', x: 9 * TS, y: 5 * TS + 8, solid: true, cw: 30, ch: 12 });
        S({ type: 'struct', sprite: 'firepit', x: 15 * TS + 8, y: 5 * TS + 6, solid: true, cw: 16, ch: 6 });
        block(6, 2, 24, 6);
        S({ type: 'loot', lm, x: 24 * TS + 8, y: 5 * TS + 12, solid: true });
        break;
      case 'oak':
        S({ type: 'struct', sprite: 'oak', x: 21 * TS, y: 6 * TS + 8, solid: true, cw: 26, ch: 10 });
        block(17, 1, 25, 7);
        break;
      case 'car':
        for (let y = 7; y <= 9; y++) for (let x = 0; x < 30; x++) if (W.tile(a, x, y) === T.GRASS) setT(a, x, y, T.DIRT);
        S({ type: 'struct', sprite: 'car', x: 20 * TS, y: 5 * TS + 12, solid: true, cw: 46, ch: 16 });
        block(16, 2, 24, 6);
        S({ type: 'loot', lm, x: 23 * TS + 8, y: 5 * TS + 14, solid: true });
        break;
      case 'trailhead':
        S({ type: 'struct', sprite: 'gate', x: 15 * TS + 8, y: 14 * TS + 14, solid: false });
        S({ type: 'sign', text: 'SILVERPINE TRAILHEAD. Permits required beyond this point. Ranger Station 7 is 1 mile north.', x: 19 * TS, y: 11 * TS + 12, solid: true });
        S({ type: 'struct', sprite: 'board', x: 10 * TS, y: 10 * TS + 12, solid: true, cw: 26, ch: 6 });
        S({ type: 'loot', lm, x: 21 * TS + 8, y: 11 * TS + 12, solid: true });
        block(8, 9, 23, 15);
        break;
      case 'bog':
        for (let y = 2; y < 15; y++) for (let x = 2; x < 28; x++) { const n = NW.S.fbm(x * 0.3, y * 0.3, 55); if (n > 0.55 && W.tile(a, x, y) === T.GRASS) setT(a, x, y, T.MUD); }
        break;
      case 'birches': break;
      case 'ford': break;
    }
  }

  function computeSolid(a) {
    a.solid = new Uint8Array(a.w * a.h);
    for (let i = 0; i < a.tiles.length; i++) a.solid[i] = W.isSolidTile(a.tiles[i]) ? 1 : 0;
  }
  function flood(a, sx, sy) {
    const blocked = new Uint8Array(a.w * a.h);
    for (let i = 0; i < blocked.length; i++) blocked[i] = a.solid[i];
    a.objs.forEach((o) => { if (o.solid) { const tx = Math.floor(o.x / TS), ty = Math.floor((o.y - 2) / TS); if (tx >= 0 && ty >= 0 && tx < a.w && ty < a.h) blocked[ty * a.w + tx] = 1; } });
    const seen = new Uint8Array(a.w * a.h);
    const q = [[sx, sy]];
    seen[sy * a.w + sx] = 1;
    while (q.length) {
      const [x, y] = q.pop();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= a.w || ny >= a.h) return;
        const i = ny * a.w + nx;
        if (seen[i] || blocked[i]) return;
        seen[i] = 1; q.push([nx, ny]);
      });
    }
    return seen;
  }

  // ====================================================================== ROOMS
  const ROOM_MAPS = {
    room_main: [
      'TTTTTTTTTTddTTTTTTTTTT',
      'FFFFFFFFFFddFFFFFFFFFF',
      '|....................|',
      '|....................|',
      '|....................|',
      '|....................|',
      'd....................d',
      'd....................d',
      '|....................|',
      '|....................|',
      '|....................|',
      '|....................|',
      '______________________',
    ],
    room_bed: [
      'TTTTTTTTTTTTTT',
      'FFFFFFFFFFFFFF',
      '|............|',
      '|............|',
      '|............|',
      '|............d',
      '|............d',
      '|............|',
      '|............|',
      '|............|',
      '______________',
    ],
    room_office: [
      'TTTTTTTTTTTTTT',
      'FFFFFFFFFFFFFF',
      '|............|',
      '|............|',
      '|............|',
      'd............|',
      'd............|',
      '|............|',
      '|............|',
      '|............|',
      '______________',
    ],
    room_storage: [
      'TTTTTTTTTTTTTTTT',
      'FFFFFFFFFFFFFFFF',
      '|..............|',
      '|..............|',
      '|..............|',
      '|..............|',
      '|..............|',
      '|..............|',
      '|..............|',
      '_______dd_______',
    ],
  };
  const CH = { '.': T.FLOOR, T: T.WTOP, F: T.WFACE, '|': T.WSIDE, _: T.WBOT, d: T.DOORWAY };

  function buildRoom(id) {
    const map = ROOM_MAPS[id];
    const a = newArea(id, 'room', map[0].length, map.length);
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) a.tiles[y * a.w + x] = CH[map[y][x]];
    const o = (obj) => { a.objs.push(obj); return obj; };
    const px = (tx) => tx * TS;
    if (id === 'room_main') {
      o({ type: 'rug', sprite: 'rug', x: px(3), y: px(5), layer: 'floor' });
      o({ type: 'stove', x: px(3), y: px(1) + 2, solid: true, cx: px(3) + 2, cy: px(3) + 6, cw: 28, ch: 10 });
      o({ type: 'woodbox', x: px(1) + 2, y: px(3), solid: true, cx: px(1) + 2, cy: px(3) + 6, cw: 18, ch: 10 });
      o({ type: 'counter', x: px(6), y: px(1) + 8, solid: true, cx: px(6), cy: px(2) + 8, cw: 48, ch: 14 });
      o({ type: 'deco', sprite: 'antlers', x: px(13), y: px(0) + 6, layer: 'wall' });
      o({ type: 'deco', sprite: 'rifleRack', x: px(15), y: px(1) + 1, layer: 'wall' });
      o({ type: 'deco', sprite: 'clock', x: px(19), y: px(0) + 6, layer: 'wall' });
      o({ type: 'table', x: px(9) + 4, y: px(6), solid: true, cx: px(9) + 6, cy: px(6) + 10, cw: 36, ch: 12 });
      o({ type: 'deco', sprite: 'chair', x: px(10), y: px(4) + 8, solid: true, cx: px(10) + 2, cy: px(5) + 6, cw: 10, ch: 6, chair: true });
      o({ type: 'deco', sprite: 'chair', x: px(12) - 2, y: px(4) + 8, solid: true, cx: px(12), cy: px(5) + 6, cw: 10, ch: 6, chair: true });
      o({ type: 'deco', sprite: 'armchair', x: px(6) + 4, y: px(5), solid: true, cx: px(6) + 6, cy: px(6), cw: 20, ch: 8 });
      o({ type: 'lamp', room: id, style: 'table', x: px(11) + 2, y: px(6) + 1, hx: px(11) + 7, hy: px(7), sy: px(7) + 8 });
      o({ type: 'deco', sprite: 'coatrack', x: px(18), y: px(9) + 2, solid: true, cx: px(18) + 2, cy: px(10) + 6, cw: 10, ch: 5 });
      o({ type: 'deco', sprite: 'boots', x: px(15) + 4, y: px(11) + 4, layer: 'floor' });
      o({ type: 'rug', sprite: 'rugSmall', x: px(9) + 8, y: px(10) - 2, layer: 'floor' });
      o({ type: 'deco', sprite: 'logstack', x: px(1), y: px(8), solid: true, cx: px(1), cy: px(9) + 2, cw: 28, ch: 6 });
      o({ type: 'deco', sprite: 'washstand', x: px(19) + 6, y: px(5), solid: true, cx: px(19) + 6, cy: px(6) + 4, cw: 18, ch: 6 });
      o({ type: 'deco', sprite: 'bench', x: px(13), y: px(9), solid: true, cx: px(13), cy: px(9) + 6, cw: 36, ch: 6 });
      o({ type: 'deco', sprite: 'barrel', x: px(19) + 4, y: px(2), solid: true, cx: px(19) + 5, cy: px(2) + 10, cw: 14, ch: 8 });
      o({ type: 'window', wid: 'w_front_l', side: 'bottom', x: px(4), y: px(12), w: 32, h: 16 });
      o({ type: 'window', wid: 'w_front_r', side: 'bottom', x: px(16), y: px(12), w: 32, h: 16 });
      o({ type: 'door', did: 'front', side: 'bottom', x: px(10), y: px(12), w: 32, h: 16 });
      a.exits.push({ x: 0, y: px(6), w: 10, h: 32, to: 'room_bed', tx: px(12) + 6, ty: px(6) + 4, dir: 'left' });
      a.exits.push({ x: px(22) - 10, y: px(6), w: 10, h: 32, to: 'room_office', tx: px(1) + 10, ty: px(6) + 4, dir: 'right' });
      a.exits.push({ x: px(10), y: 0, w: 32, h: px(2) - 4, to: 'room_storage', tx: px(8), ty: px(8) + 8, dir: 'up' });
    } else if (id === 'room_bed') {
      o({ type: 'rug', sprite: 'rugSmall', x: px(5) + 8, y: px(6), layer: 'floor' });
      o({ type: 'bed', x: px(1) + 4, y: px(2) - 6, solid: true, cx: px(1) + 4, cy: px(2), cw: 36, ch: 42 });
      o({ type: 'deco', sprite: 'nightstand', x: px(4) + 4, y: px(2) - 2, solid: true, cx: px(4) + 4, cy: px(2) + 6, cw: 14, ch: 8 });
      o({ type: 'lamp', room: id, style: 'wall', layer: 'wall', x: px(8) + 4, y: px(1) - 2, hx: px(8) + 9, hy: px(2) + 4 });
      o({ type: 'wardrobe', x: px(10), y: px(1) - 6, solid: true, cx: px(10), cy: px(2) + 2, cw: 30, ch: 12 });
      o({ type: 'belongings', x: px(1) + 6, y: px(5) + 8, solid: true, cx: px(1) + 6, cy: px(6) + 4, cw: 26, ch: 10 });
      o({ type: 'deco', sprite: 'guitar', x: px(12) + 2, y: px(7), solid: true, cx: px(12) + 2, cy: px(8) + 6, cw: 10, ch: 4 });
      o({ type: 'photo', x: px(3) + 10, y: px(0) + 8, layer: 'wall', cx: px(3) + 4, cy: px(1) + 4, cw: 24, ch: 12 });
      o({ type: 'window', wid: 'w_bed', side: 'top', x: px(6), y: px(0), w: 32, h: 32 });
      a.exits.push({ x: px(14) - 10, y: px(5), w: 10, h: 32, to: 'room_main', tx: px(1) + 10, ty: px(7) + 4, dir: 'right' });
    } else if (id === 'room_office') {
      o({ type: 'rug', sprite: 'rugSmall', x: px(4), y: px(6), layer: 'floor' });
      o({ type: 'wallmap', x: px(1) + 4, y: px(0) + 6, layer: 'wall' });
      o({ type: 'desk', x: px(1) + 4, y: px(1) + 4, solid: true, cx: px(1) + 4, cy: px(2) + 4, cw: 52, ch: 18 });
      o({ type: 'deco', sprite: 'chair', x: px(3), y: px(4) - 2, solid: true, cx: px(3) + 2, cy: px(4) + 8, cw: 10, ch: 5 });
      o({ type: 'lamp', room: id, style: 'wall', layer: 'wall', x: px(8) + 4, y: px(1) - 2, hx: px(8) + 9, hy: px(2) + 4 });
      o({ type: 'radio', x: px(6) + 4, y: px(1) + 10, solid: true, cx: px(6) + 4, cy: px(2) + 6, cw: 32, ch: 12 });
      o({ type: 'deco', sprite: 'cabinet', x: px(12) - 2, y: px(1) - 2, solid: true, cx: px(12) - 2, cy: px(2) + 4, cw: 20, ch: 12 });
      o({ type: 'deco', sprite: 'bookshelf', x: px(11) + 4, y: px(6), solid: true, cx: px(11) + 4, cy: px(7) + 8, cw: 32, ch: 10 });
      o({ type: 'window', wid: 'w_office', side: 'top', x: px(9), y: px(0), w: 32, h: 32 });
      a.exits.push({ x: 0, y: px(5), w: 10, h: 32, to: 'room_main', tx: px(20) + 6, ty: px(7) + 4, dir: 'left' });
    } else if (id === 'room_storage') {
      o({ type: 'chest', x: px(1) + 4, y: px(2) - 4, solid: true, cx: px(1) + 4, cy: px(2) + 4, cw: 32, ch: 12 });
      o({ type: 'deco', sprite: 'shelves', x: px(6), y: px(0) + 6, layer: 'wall' });
      o({ type: 'deco', sprite: 'toolwall', x: px(10) + 4, y: px(0) + 10, layer: 'wall' });
      o({ type: 'drum', x: px(13), y: px(2) - 4, solid: true, cx: px(13), cy: px(2) + 8, cw: 18, ch: 10 });
      o({ type: 'deco', sprite: 'barrel', x: px(14) + 2, y: px(3), solid: true, cx: px(14) + 2, cy: px(4), cw: 16, ch: 8 });
      o({ type: 'sawhorse', x: px(8), y: px(5), solid: true, cx: px(8), cy: px(5) + 8, cw: 34, ch: 8 });
      o({ type: 'deco', sprite: 'sacks', x: px(1) + 4, y: px(6) + 4, solid: true, cx: px(1) + 4, cy: px(7) + 2, cw: 28, ch: 8 });
      o({ type: 'deco', sprite: 'barrel', x: px(1) + 2, y: px(4) - 4, solid: true, cx: px(1) + 2, cy: px(4) + 4, cw: 16, ch: 8 });
      o({ type: 'lamp', room: id, style: 'wall', layer: 'wall', x: px(9) + 2, y: px(1) - 2, hx: px(9) + 7, hy: px(2) + 4 });
      o({ type: 'window', wid: 'w_storage', side: 'top', x: px(3) + 8, y: px(0), w: 32, h: 32 });
      o({ type: 'door', did: 'back', side: 'right', x: px(15), y: px(5), w: 16, h: 32 });
      a.exits.push({ x: px(7), y: px(10) - 10, w: 32, h: 10, to: 'room_main', tx: px(11), ty: px(2) + 10, dir: 'down' });
    }
    computeSolid(a);
    // doors and windows occupy wall tiles: keep solid; doors block until used via action
    a.objs.forEach((ob, i) => { ob.id = id + '#' + i; });
    return a;
  }

  // An interior from an ASCII map ('.' floor, T/F/|/_ log walls, d doorway, ' ' or 'v' void).
  // def: { name, map, theme: 'log'|'stone'|'plank', shelter (deg C above outside), dark (0..1 ambient darkness),
  //        objs(px) -> [objects], exits: [{x,y,w,h,to,tx,ty,dir}], lights: [{x,y,r,a}] }
  // Objects may carry draw(g,t,o), name (string or fn) and actions(o) -> [action] instead of a built-in type.
  const ICH = Object.assign({ ' ': T.VOID, v: T.VOID }, CH);
  function buildInterior(id, def) {
    const map = def.map;
    const a = newArea(id, 'interior', map[0].length, map.length);
    a.name = def.name || id; a.remote = true; a.theme = def.theme || 'log'; a.shelter = def.shelter; a.dark = def.dark || 0; a.def = def;
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const c = map[y][x]; a.tiles[y * a.w + x] = ICH[c] != null ? ICH[c] : T.FLOOR; }
    const px = (tx) => tx * TS;
    const objs = typeof def.objs === 'function' ? def.objs(px) : (def.objs || []);
    objs.forEach((ob) => { if (!ob.type) ob.type = 'custom'; a.objs.push(ob); });
    (def.exits || []).forEach((e) => a.exits.push(Object.assign({}, e)));
    computeSolid(a);
    a.objs.forEach((ob, i) => { ob.id = id + '#' + i; });
    return a;
  }

  // ================================================================ COLLISION
  // Object collider rect (pixels, area-local) or null
  W.collider = function (o) {
    if (!o.solid) return null;
    if (o.cw != null && o.cx != null) return { x: o.cx, y: o.cy, w: o.cw, h: o.ch };
    switch (o.type) {
      case 'tree': return o.kind === 'birch' ? { x: o.x - 3, y: o.y - 5, w: 6, h: 5 } : { x: o.x - 4, y: o.y - 6, w: 8, h: 6 };
      case 'deadtree': return { x: o.x - 4, y: o.y - 6, w: 8, h: 6 };
      case 'rock': return o.variant === 2 ? { x: o.x - 12, y: o.y - 9, w: 24, h: 9 } : { x: o.x - 7, y: o.y - 7, w: 14, h: 7 };
      case 'stump': return { x: o.x - 6, y: o.y - 6, w: 12, h: 6 };
      case 'bush': return { x: o.x - 6, y: o.y - 6, w: 12, h: 6 };
      case 'loot': return { x: o.x - 9, y: o.y - 8, w: 18, h: 8 };
      case 'woodpile_ext': return { x: o.x - 22, y: o.y - 10, w: 44, h: 10 };
      case 'chopblock': return { x: o.x - 6, y: o.y - 6, w: 12, h: 6 };
      case 'sign': return { x: o.x - 6, y: o.y - 5, w: 12, h: 5 };
      case 'cairn': return { x: o.x - 9, y: o.y - 8, w: 18, h: 8 };
      case 'struct': return { x: o.x - (o.cw || 16) / 2, y: o.y - (o.ch || 8), w: o.cw || 16, h: o.ch || 8 };
    }
    return null;
  };

  W.blocked = function (a, rx, ry, rw, rh, ignoreObj, noDyn) {
    const x0 = Math.floor(rx / TS), x1 = Math.floor((rx + rw - 0.01) / TS);
    const y0 = Math.floor(ry / TS), y1 = Math.floor((ry + rh - 0.01) / TS);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (a.kind === 'forest' && (tx < 0 || tx >= a.w || ty < 0 || ty >= a.h)) continue; // edges handled by transitions
      const t = W.tile(a, tx, ty);
      if (t === T.BRIDGE && NW.G.state.world.bridgeOut && a.bridge && tx >= 17 && tx <= 20) return true;
      if (W.isSolidTile(t)) return true;
    }
    const r = { x: rx, y: ry, w: rw, h: rh };
    const objs = a.objs;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (o === ignoreObj || !o.solid) continue;
      if (o.res && !NW.Objects.available(o) && o.type !== 'deadtree' && o.type !== 'bush') continue;
      const c = W.collider(o);
      if (c && U.overlap(r, c)) return true;
    }
    const extra = noDyn || a !== NW.G.area ? null : NW.G.dynamicColliders;
    if (extra) for (let i = 0; i < extra.length; i++) if (U.overlap(r, extra[i])) return true;
    return false;
  };

  // Rifle rounds fly over water, ice and fords; trees, rocks, structures and buildings stop them.
  W.blocksShot = function (a, x, y) {
    const t = W.tile(a, Math.floor(x / TS), Math.floor(y / TS));
    if (t === T.BUILDING || t === T.VOID) return a.kind !== 'forest' || (x >= 0 && y >= 0 && x < a.w * TS && y < a.h * TS);
    const r = { x: x - 1, y: y - 1, w: 2, h: 2 };
    for (const o of a.objs) {
      if (!o.solid || (o.res && !NW.Objects.available(o) && o.type !== 'deadtree' && o.type !== 'bush')) continue;
      const c = W.collider(o); if (c && U.overlap(r, c)) return true;
    }
    const extra = NW.G.dynamicColliders;
    if (extra) for (const c of extra) if (U.overlap(r, c)) return true;
    return false;
  };

  W.surfaceAt = function (a, x, y) {
    const t = W.tile(a, Math.floor(x / TS), Math.floor(y / TS));
    if (a.kind === 'room') return 'wood';
    if (a.kind === 'interior') return (a.def && a.def.surface) || (a.theme === 'stone' ? 'dirt' : 'wood');
    if (t === T.BRIDGE) return 'wood';
    if (t === T.FORD || t === T.STONES) return 'water';
    if (t === T.DOCK) return 'wood';
    return NW.G.state.weather.snow > 0.35 ? 'snow' : 'dirt';
  };
})(window.NW);
