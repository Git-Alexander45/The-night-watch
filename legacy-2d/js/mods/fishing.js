'use strict';
// Fishing and snares: an ice hole at the end of the Lake Wren dock, deep pools along the creek,
// a cast / bite / reel minigame panel, and wire snares set in the forest and checked after a night.
(function (NW) {
  const U = NW.U, D = NW.D, S = NW.S, I = NW.Inv, H = NW.Hooks, UI = NW.UI, W = NW.World;
  const P = S.P, R = S.R;
  const TS = D.TILE;
  const G = () => NW.G;
  const st = () => NW.G.state;
  const FI = NW.Fishing = {};

  const mod = () => NW.mod('fishing', () => ({ v: 1, rodGiven: false, spots: null, snares: [], seq: 1, scraps: 0, bait: 'none', caught: {}, snared: 0, next: null }));
  const peek = () => { const s = st(); return s && s.mods && s.mods.fishing; }; // no lazy init in per-frame hooks
  FI.state = mod;
  const abs = () => { const t = st().time; return t.day * 1440 + t.min; };
  const LAKE = 'f_2_0';
  const HOLE = { x: 240, y: 66, wx: 240, wy: 41 }; // stand point at the dock end, the hole in the ice just north of it

  // ================================================================= ITEMS
  const FISH = {
    perch: { name: 'perch', raw: 'raw_perch', cooked: 'cooked_perch', str: 0.35, zone: [22, 82], reel: 22, col: [P.y1, P.g4, P.y0], len: 9 },
    trout: { name: 'trout', raw: 'raw_trout', cooked: 'cooked_trout', str: 0.6, zone: [27, 79], reel: 17, col: [P.st4, P.st3, P.r3], len: 12 },
    pike: { name: 'pike', raw: 'raw_pike', cooked: 'cooked_pike', str: 0.9, zone: [33, 74], reel: 13, col: [P.g4, P.g3, P.bone], len: 16 },
    char: { name: 'Arctic char', raw: 'raw_char', cooked: 'cooked_char', str: 1.05, zone: [38, 72], reel: 12, col: [P.st4, P.st2, P.r2], len: 13 },
  };
  FI.FISH = FISH;
  const ITEMS = {
    rod: { name: 'Fishing Rod', stack: 1, kind: 'tool', desc: 'A short ice rod and a spool of line. Fish the hole at the end of the Lake Wren dock, or the deep pools along the creek.' },
    snare: { name: 'Wire Snare', stack: 4, kind: 'tool', desc: 'A wire noose on a stake. Set it on open ground in the forest, away from trails. Check it after a night.' },
    raw_perch: { name: 'Raw Perch', stack: 6, kind: 'raw', desc: 'Small, striped and bony. Needs cooking. Raw fish will make you sick.', food: 5, heal: -6 },
    raw_trout: { name: 'Raw Trout', stack: 4, kind: 'raw', desc: 'Speckled and ice-cold. Needs cooking.', food: 7, heal: -6 },
    raw_pike: { name: 'Raw Pike', stack: 3, kind: 'raw', desc: 'All jaw and teeth. A lot of meat on it. Needs cooking.', food: 9, heal: -8 },
    raw_char: { name: 'Raw Char', stack: 3, kind: 'raw', desc: 'Silver back, red belly. Rare this far south. Needs cooking.', food: 9, heal: -6 },
    cooked_perch: { name: 'Fried Perch', stack: 6, kind: 'food', desc: 'Crisp skin, flaky and small. Restores some hunger.', food: 16, heal: 2 },
    cooked_trout: { name: 'Grilled Trout', stack: 4, kind: 'food', desc: 'Smoky and tender. Restores hunger and a little health.', food: 26, heal: 4 },
    cooked_pike: { name: 'Baked Pike', stack: 3, kind: 'food', desc: 'Dense white meat. Mind the bones. Restores a lot of hunger.', food: 34, heal: 4 },
    cooked_char: { name: 'Seared Char', stack: 3, kind: 'food', desc: 'Rich, pink and oily. Restores a lot of hunger and some health.', food: 40, heal: 12 },
  };
  for (const id in ITEMS) if (!D.ITEMS[id]) D.ITEMS[id] = ITEMS[id];
  // ready-to-eat fish joins the eating order next to food of similar weight
  [['cooked_char', 'cooked_venison'], ['cooked_pike', 'cooked_char'], ['cooked_trout', 'cooked_rabbit'], ['cooked_perch', 'roast_mush']].forEach(([id, after]) => {
    if (D.FOOD_ORDER.includes(id)) return;
    const i = D.FOOD_ORDER.indexOf(after); D.FOOD_ORDER.splice(i < 0 ? D.FOOD_ORDER.length : i + 1, 0, id);
  });
  // Cooking: one counter line cooks whichever raw fish you carry (smallest first).
  const RAW_ORDER = ['raw_perch', 'raw_trout', 'raw_pike', 'raw_char'];
  const cookedOf = (raw) => raw.replace('raw_', 'cooked_');
  const fishRecipe = {
    id: 'c_fish', time: 3,
    _pick: 'raw_perch',
    get name() { const s = st(); const has = s && RAW_ORDER.find((id) => I.count(s.inv, id) > 0); return has ? 'Cook ' + D.ITEMS[has].name.replace('Raw ', '').toLowerCase() : 'Cook fish'; },
    get in() { const s = st(); this._pick = (s && RAW_ORDER.find((id) => I.count(s.inv, id) > 0)) || 'raw_perch'; return { [this._pick]: 1 }; },
    get out() { return { [cookedOf(this._pick)]: 1 }; },
  };
  if (D.RECIPES.cook && !D.RECIPES.cook.some((r) => r.id === 'c_fish')) D.RECIPES.cook.splice(Math.min(3, D.RECIPES.cook.length), 0, fishRecipe);
  if (D.RECIPES.saw && !D.RECIPES.saw.some((r) => r.id === 'f_snare')) D.RECIPES.saw.push({ id: 'f_snare', name: 'Twist wire snares', in: { rope: 1, scrap: 1 }, out: { snare: 2 }, time: 3 });

  // ----------------------------------------------------------------- icons
  function fishIcon(g, k, cooked) {
    const f = FISH[k];
    const c0 = cooked ? P.wood4 : f.col[0], c1 = cooked ? P.wood2 : f.col[1], c2 = cooked ? P.wood5 : f.col[2];
    const long = k === 'pike';
    const x0 = long ? 1 : 2, x1 = long ? 12 : 11;
    for (let x = x0; x <= x1; x++) { const h = Math.round(Math.sin((x - x0 + 0.5) / (x1 - x0 + 1) * Math.PI) * (long ? 2.4 : 3.2)) + 1; R(g, c1, x, 8 - h, 1, h * 2); R(g, c0, x, 8 - h, 1, h); }
    R(g, c1, x1 + 1, 6, 1, 4); R(g, c1, x1 + 2, 4, 2, 3); R(g, c1, x1 + 2, 9, 2, 3); // tail
    if (!cooked) {
      if (k === 'perch') for (let x = 4; x <= 10; x += 2) R(g, P.g2, x, 5, 1, 4);
      if (k === 'trout') { R(g, c2, 3, 8, 8, 1); [[5, 6], [8, 5], [10, 7]].forEach(([x, y]) => R(g, P.i1, x, y, 1, 1)); }
      if (k === 'pike') [[4, 7], [7, 6], [9, 8], [11, 7]].forEach(([x, y]) => R(g, c2, x, y, 1, 1));
      if (k === 'char') { R(g, c2, 3, 9, 8, 2); [[5, 6], [9, 6]].forEach(([x, y]) => R(g, P.bone, x, y, 1, 1)); }
      R(g, k === 'perch' ? P.f2 : c1, 6, 11, 2, 1); R(g, P.white, x0 + 1, 7, 1, 1); R(g, P.ink, x0 + 1, 7, 1, 1);
    } else {
      for (let x = x0 + 2; x < x1; x += 3) R(g, P.wood1, x, 5, 1, 6);
      R(g, P.wood6, x0 + 2, 6, 4, 1); R(g, P.ink, x0 + 1, 7, 1, 1);
    }
  }
  for (const k in FISH) { S.registerIcon(FISH[k].raw, (g) => fishIcon(g, k, false)); S.registerIcon(FISH[k].cooked, (g) => fishIcon(g, k, true)); }
  S.registerIcon('rod', (g) => {
    for (let i = 0; i < 11; i++) R(g, i < 4 ? P.wood1 : P.wood3, 2 + i, 14 - i, 1, 1);
    R(g, P.i3, 4, 10, 3, 3); R(g, P.i4, 4, 10, 1, 1); R(g, P.i1, 6, 12, 1, 1);
    g.strokeStyle = P.st4; g.lineWidth = 1; g.beginPath(); g.moveTo(13.5, 3.5); g.quadraticCurveTo(15, 8, 14.5, 12); g.stroke();
    R(g, P.r2, 14, 12, 1, 2); R(g, P.white, 14, 14, 1, 1);
  });
  S.registerIcon('snare', (g) => {
    R(g, P.wood2, 2, 3, 2, 11); R(g, P.wood4, 2, 3, 1, 11); R(g, P.wood1, 2, 13, 2, 1);
    R(g, P.d3, 4, 5, 3, 1);
    g.strokeStyle = P.i4; g.lineWidth = 1; g.beginPath(); g.ellipse(10.5, 8.5, 4, 4.5, 0, 0, 6.3); g.stroke();
    R(g, P.white, 9, 4, 2, 1); R(g, P.i3, 6, 6, 2, 1);
  });

  // ============================================================ WORLD SPOTS
  // Creek pools: shore tiles beside the water, away from trails and corridors. Computed once per run (seeded).
  function creekSpots(areaId) {
    const a = W.get(areaId), T = W.T;
    const rnd = U.rng(U.hash(st().seed, 4417, a.ax, a.ay));
    const cands = [];
    const dirtNear = (tx, ty) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => W.tile(a, tx + dx, ty + dy) === T.DIRT);
    for (let ty = 2; ty <= 14; ty++) {
      if (ty >= 6 && ty <= 10) continue; // the crossing and the east-west trail
      for (let tx = 3; tx <= 27; tx++) {
        if (W.tile(a, tx, ty) !== T.GRASS || dirtNear(tx, ty)) continue;
        const east = W.tile(a, tx + 1, ty) === T.WATER, west = W.tile(a, tx - 1, ty) === T.WATER;
        if (!east && !west) continue;
        if (W.tile(a, tx + (east ? 1 : -1), ty - 1) !== T.WATER || W.tile(a, tx + (east ? 1 : -1), ty + 1) !== T.WATER) continue;
        cands.push({ tx, ty, side: east ? 1 : -1, k: rnd() });
      }
    }
    cands.sort((p, q) => p.k - q.k);
    const out = [];
    for (const c of cands) {
      if (out.length >= 2) break;
      const x = c.tx * TS + (c.side > 0 ? 6 : 10), y = c.ty * TS + 12;
      if (out.some((o) => Math.abs(o.y - y) < 4 * TS)) continue;
      if (!G().spotFree(areaId, x, y, 22)) continue;
      out.push({ x, y, side: c.side, wx: c.side > 0 ? (c.tx + 1) * TS + 8 : (c.tx - 1) * TS + 8, wy: y - 5 });
    }
    return out;
  }
  function ensureSpots() {
    const m = mod();
    if (m.spots) return;
    const spots = {};
    Object.keys(D.AREAS).forEach((id) => { if (D.AREAS[id].creek) { try { spots[id] = creekSpots(id); } catch (e) { console.error(e); spots[id] = []; } } });
    m.spots = spots;
  }
  FI.spots = (areaId) => { const m = peek(); return (m && m.spots && m.spots[areaId]) || []; };

  // -------------------------------------------------------------- sprites
  function spr(key, w, h, fn) { return S.cached('fi_' + key, () => S.mk(w, h, fn)); }
  const SPR = {
    hole: () => spr('hole', 36, 16, (g) => {
      g.fillStyle = P.ice0; g.beginPath(); g.ellipse(18, 8, 17, 7, 0, 0, 6.3); g.fill();
      g.fillStyle = P.ice1; g.beginPath(); g.ellipse(17, 7, 15, 5.5, 0, 0, 6.3); g.fill();
      R(g, P.ice2, 6, 4, 6, 1); R(g, P.ice2, 24, 10, 5, 1); R(g, P.white, 9, 3, 2, 1);
      g.fillStyle = P.sn3; g.beginPath(); g.ellipse(18, 8.5, 7, 3.5, 0, 0, 6.3); g.fill();
      g.fillStyle = P.w0; g.beginPath(); g.ellipse(18, 8.5, 5, 2.4, 0, 0, 6.3); g.fill();
      R(g, P.w1, 15, 9, 6, 1); R(g, P.ice2, 22, 6, 2, 1); R(g, P.ice2, 12, 10, 2, 1);
    }),
    bucket: () => spr('bucket', 10, 11, (g) => {
      R(g, 'rgba(0,0,0,0.3)', 1, 9, 9, 2); R(g, P.i2, 1, 3, 8, 7); R(g, P.i3, 1, 3, 3, 7); R(g, P.i1, 1, 9, 8, 1); R(g, P.i4, 1, 3, 8, 1);
      g.strokeStyle = P.i3; g.lineWidth = 1; g.beginPath(); g.arc(5, 3, 3.5, Math.PI, 0); g.stroke(); R(g, P.ice2, 3, 4, 4, 1);
    }),
    rest: () => spr('rest', 12, 16, (g) => { // forked stick rod-rest and a flat stone
      R(g, 'rgba(0,0,0,0.3)', 1, 13, 11, 3); R(g, P.st2, 1, 11, 10, 4); R(g, P.st3, 2, 11, 7, 1); R(g, P.st1, 1, 14, 10, 1);
      R(g, P.wood2, 5, 3, 1, 9); R(g, P.wood2, 4, 1, 1, 3); R(g, P.wood2, 7, 1, 1, 3); R(g, P.wood3, 6, 3, 1, 1); R(g, P.wood4, 5, 4, 1, 3);
    }),
    snare: (k) => spr('snare_' + k, 20, 16, (g) => {
      const broken = k === 'broken';
      R(g, 'rgba(0,0,0,0.25)', 3, 13, 15, 2);
      if (broken) { R(g, P.wood2, 4, 10, 2, 4); R(g, P.wood4, 4, 10, 1, 1); R(g, P.wood3, 7, 12, 5, 1); R(g, P.wood1, 7, 13, 5, 1); }
      else { R(g, P.wood2, 4, 3, 2, 11); R(g, P.wood4, 4, 3, 1, 11); R(g, P.wood5, 4, 3, 2, 1); R(g, P.d3, 6, 6, 4, 1); }
      g.strokeStyle = k === 'raided' || broken ? P.i3 : P.i4; g.lineWidth = 1; g.beginPath();
      if (broken) { g.moveTo(9.5, 11.5); g.lineTo(13.5, 9.5); g.lineTo(16.5, 12.5); }
      else if (k === 'raided') { g.moveTo(9.5, 6.5); g.lineTo(12.5, 12.5); g.lineTo(16.5, 9.5); g.lineTo(13.5, 7.5); }
      else g.ellipse(13.5, 9.5, 4, 3, 0, 0, 6.3);
      g.stroke();
      if (k === 'set' || k === 'empty') { R(g, P.i4, 10, 6, 1, 1); R(g, P.white, 15, 7, 1, 1); }
    }),
    rabbit: () => spr('rabbit', 16, 10, (g) => { // a snared rabbit lying on its side
      R(g, 'rgba(0,0,0,0.3)', 2, 8, 13, 2);
      R(g, P.d2, 3, 3, 9, 5); R(g, P.d3, 4, 3, 7, 2); R(g, P.d1, 3, 7, 9, 1); R(g, P.white, 2, 4, 2, 2);
      R(g, P.d2, 11, 2, 4, 4); R(g, P.d3, 12, 2, 2, 1); R(g, P.i0, 13, 3, 1, 1);
      R(g, P.d3, 13, 0, 3, 1); R(g, P.d2, 14, 1, 2, 1); R(g, P.d1, 5, 8, 2, 1); R(g, P.d1, 9, 8, 2, 1);
    }),
    fur: () => spr('fur', 26, 14, (g) => { // tufts of fur, blood and paw prints left by a raider
      [[2, 9], [6, 3], [19, 4], [22, 10]].forEach(([x, y]) => { R(g, P.st3, x, y, 2, 1); R(g, P.st4, x + 1, y - 1, 1, 1); });
      [[9, 11], [16, 12], [12, 2]].forEach(([x, y]) => R(g, P.r1, x, y, 1, 1));
      [[0, 12], [4, 13], [21, 1], [24, 2]].forEach(([x, y]) => { R(g, 'rgba(60,70,90,0.55)', x, y, 2, 1); R(g, 'rgba(60,70,90,0.55)', x, y - 2, 1, 1); });
    }),
  };

  // ================================================================ SNARES
  const BRUSH_T = { bush: 1, reeds: 1, herb: 0.6, branches: 0.5, deadtree: 0.6, mushrooms: 0.4 };
  function brushAt(a, x, y) {
    let b = 0;
    a.objs.forEach((o) => { const w = BRUSH_T[o.type]; if (w && Math.abs(o.x - x) < 72 && Math.abs(o.y - y) < 60) b += w; });
    if (a.lm === 'birches' || a.lm === 'bog' || a.id === 'f_0_4' || a.id === 'f_1_3') b += 1.5;
    return Math.min(1, b / 4);
  }
  // A snare's fate is fixed when it is set (seeded): when it resolves and what it finds.
  function arm(sn, now) {
    sn.set = now; sn.st = 'set'; sn.animal = null;
    const rnd = U.rng(U.hash(st().seed, sn.id, Math.floor(now)));
    sn.at = Math.round(now + (6 + rnd() * 7) * 60);
    sn.roll = Math.round(rnd() * 1e6) / 1e6; sn.roll2 = Math.round(rnd() * 1e6) / 1e6;
    const m = mod(); m.next = null;
  }
  function overnight(from, to) { for (let t = from; t < to; t += 30) { const mm = t % 1440; if (mm >= D.NIGHT_START || mm < D.DAWN) return true; } return false; }
  function resolve(sn) {
    const [ax, ay] = D.areaXY(sn.area);
    const far = Math.abs(ax - 2) + Math.abs(ay - 2);
    const pBreak = 0.06, pRaid = Math.min(0.3, (0.06 + far * 0.03) * G().modeVal('monster', 1));
    const pCatch = 0.32 + (sn.brush || 0) * 0.25 + (overnight(sn.set, sn.at) ? 0.15 : 0);
    const r = sn.roll;
    if (r < pBreak) sn.st = 'broken';
    else if (r < pBreak + pRaid) { sn.st = 'raided'; sn.animal = far >= 3 && sn.roll2 < 0.6 ? 'wolf' : 'fox'; }
    else if (r < pBreak + pRaid + pCatch) { sn.st = 'caught'; sn.animal = sn.roll2 < 0.22 ? 'hare' : 'rabbit'; }
    else sn.st = 'empty';
    const g = G();
    if (g.area && g.area.id === sn.area && sn.st !== 'empty') {
      const p = st().player;
      g.sfx('snare_snap', { vol: 0.5, pan: U.clamp((sn.x - p.x) / 240, -1, 1) });
      if (U.dist(sn.x, sn.y, p.x, p.y) < 260) g.msg(sn.st === 'caught' ? 'A snare snaps shut nearby. Something thrashes, then is still.' : sn.st === 'raided' ? 'A yelp and a scuffle by your snare. Something got there first.' : 'A sharp twang from your snare.');
    }
  }
  function tickSnares() {
    const m = peek(); if (!m || !m.snares.length) return;
    const now = abs();
    if (m.next != null && now < m.next) return;
    let next = Infinity;
    m.snares.forEach((sn) => { if (sn.st !== 'set') return; if (now >= sn.at) resolve(sn); else next = Math.min(next, sn.at); });
    m.next = next === Infinity ? now + 600 : next;
  }
  const MAX_SNARES = 5;
  function setSnare() {
    const g = G(), s = st(), a = g.area, p = s.player, T = W.T;
    if (I.count(s.inv, 'snare') <= 0) return true;
    if (!a || a.kind !== 'forest') { g.msg('Set snares outside, on open forest ground.', 'warn'); return true; }
    if (a.id === 'f_2_2') { g.msg('Nothing lives this close to the cabin. Set it farther out.', 'warn'); return true; }
    const m = mod();
    if (m.snares.filter((x) => x.st !== 'broken').length >= MAX_SNARES) { g.msg('You already have ' + MAX_SNARES + ' snares out. Check those first.', 'warn'); return true; }
    const fx = p.dir === 'left' ? -12 : p.dir === 'right' ? 12 : 0, fy = p.dir === 'up' ? -10 : p.dir === 'down' ? 12 : 2;
    const x = Math.round(p.x + fx), y = Math.round(p.y + fy);
    const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
    const near = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => W.tile(a, tx + dx, ty + dy));
    if (near.includes(T.DIRT)) { g.msg('Not on the trail. Animals step around it. Find open ground.', 'warn'); return true; }
    const ground = W.tile(a, tx, ty);
    if (![T.GRASS, T.ASH, T.MUD, T.ROCKG].includes(ground) || near.some((t) => t === T.WATER || t === T.ICE || t === T.DOCK || t === T.BRIDGE)) { g.msg('The ground here is wrong for a snare.', 'warn'); return true; }
    const hidden = a.objs.some((o) => o.type === 'tree' && o.y > y && o.y - y < 30 + (o.size || 0) * 10 && Math.abs(o.x - x) < 20); // under a canopy you'd never find it
    if (hidden || m.snares.some((o) => o.area === a.id && U.dist(o.x, o.y, x, y) < 48) || !g.spotFree(a.id, x, y, 18)) { g.msg('No room here. Find a clear patch of open ground.', 'warn'); return true; }
    I.remove(s.inv, 'snare', 1);
    const sn = { id: m.seq++, area: a.id, x, y, brush: Math.round(brushAt(a, x, y) * 100) / 100 };
    arm(sn, abs());
    m.snares.push(sn);
    g.sfx('snare_set'); g.sfx('rustle', { vol: 0.4 });
    g.msg(sn.brush > 0.45 ? 'Snare set in thick brush. Good cover. Check it after a night.' : 'Snare set. Check it after a night. Brushy ground catches more.', 'good');
    g.journalOnce('fi_snare', 'Set my first wire snare in ' + D.AREAS[a.id].name + '. Rabbits run the brush. Foxes and wolves run the rabbits.', 'notes');
    if (UI.isOpen('inv')) UI.close('inv');
    g.save('snare');
    return true;
  }
  FI.setSnare = setSnare;
  function snareName(sn) {
    const h = Math.floor((abs() - sn.set) / 60);
    switch (sn.st) {
      case 'set': return 'Your snare — set ' + (h < 1 ? 'just now' : h + 'h ago');
      case 'empty': return 'Your snare — empty';
      case 'caught': return 'Your snare — a ' + (sn.animal === 'hare' ? 'snowshoe hare' : 'rabbit') + '!';
      case 'raided': return 'Your snare — raided by a ' + (sn.animal || 'fox');
      case 'broken': return 'Your snare — snapped';
    }
    return 'Snare';
  }
  function snareActions(sn) {
    const g = G(), s = st(), m = mod();
    const remove = () => { const i = m.snares.indexOf(sn); if (i >= 0) m.snares.splice(i, 1); };
    const pickUp = { label: 'Pick up the snare', time: 1.0, sound: 'rustle', every: 0.5, done: () => { if (!m.snares.includes(sn)) return; remove(); I.give('snare', 1); g.sfx('pickup'); } };
    const reset = { label: 'Reset the snare', time: 1.4, sound: 'rustle', every: 0.5, done: () => { if (!m.snares.includes(sn)) return; arm(sn, abs()); g.sfx('snare_set'); g.msg('Snare reset.'); g.save('snare'); } };
    if (sn.st === 'caught') {
      const take = (andReset) => () => {
        if (!m.snares.includes(sn) || sn.st !== 'caught') return;
        const n = sn.animal === 'hare' ? 2 : 1, animal = sn.animal;
        I.give('raw_rabbit', n);
        m.snared = (m.snared || 0) + 1;
        g.sfx('snare_snap', { vol: 0.4 }); g.tut('food');
        g.msg(animal === 'hare' ? 'A big snowshoe hare. Good meat on it.' : 'A rabbit, stiff with cold. Cook it before you eat it.', 'good');
        g.journalOnce('fi_snared', 'First catch in a snare: a ' + (animal === 'hare' ? 'snowshoe hare' : 'rabbit') + '. Cheaper than a rifle round.', 'notes');
        if (andReset) arm(sn, abs()); else { remove(); I.give('snare', 1, true); }
        H.emit('snareCatch', animal);
        g.save('snare');
      };
      return [
        { label: 'Take the ' + (sn.animal === 'hare' ? 'hare' : 'rabbit') + ' and reset', time: 1.6, sound: 'rustle', every: 0.5, done: take(true) },
        { label: 'Take it and pick up the snare', time: 1.8, sound: 'rustle', every: 0.5, done: take(false) },
      ];
    }
    if (sn.st === 'raided') return [Object.assign({}, reset, { label: 'Untangle and reset' }), pickUp];
    if (sn.st === 'broken') return [{ label: 'Clear away the snapped wire', time: 0.8, sound: 'rustle', every: 0.4, done: () => { remove(); g.msg('The wire is ruined.'); } }];
    if (sn.st === 'empty') return [reset, pickUp];
    return [pickUp];
  }
  function drawSnare(g, sn, t) {
    const x = Math.round(sn.x), y = Math.round(sn.y);
    if (sn.st === 'raided') g.drawImage(SPR.fur(), x - 13, y - 11);
    g.drawImage(SPR.snare(sn.st === 'caught' ? 'set' : sn.st), x - 9, y - 14);
    if (sn.st === 'caught') {
      g.drawImage(SPR.rabbit(), x - 2, y - 9);
      if (sn.animal === 'hare') R(g, P.white, x + 2, y - 6, 6, 2);
      if (Math.sin(t * 2 + sn.id) > 0.97) R(g, P.white, x + 9, y - 12, 1, 1);
    }
  }

  // =============================================================== FISHING
  // Live minigame state (not saved): one session per open panel.
  let FX = null;
  let held = false;
  const PLACES = { lake: 'Lake Wren — ice hole', creek: 'Creek pool' };
  function spotForArea(kind, areaId, sp) { return { kind, area: areaId, wx: sp.wx, wy: sp.wy, x: sp.x, y: sp.y }; }
  function hasRod() { return I.count(st().inv, 'rod') > 0; }
  function openFishing(spot) {
    const g = G();
    if (!hasRod()) return g.msg('You need a fishing rod. There is one in the storage chest.', 'warn');
    FX = { spot, phase: 'idle', t: 0, msg: spot.kind === 'lake' ? 'You chip the skin of ice from the hole.' : 'The pool turns slow and black under the bank.', log: [], hp: st().player.hp };
    held = false;
    if (spot.kind === 'lake') g.sfx('ice_crack', { vol: 0.5 });
    UI.open('fishing');
    g.journalOnce('fi_first', 'Fishing: cast, wait for the float to go under, strike, then keep the line taut — not too hard or it snaps, not too slack or it throws the hook.', 'notes');
  }
  FI.open = function (kind) {
    if (kind === 'lake') return openFishing(spotForArea('lake', LAKE, HOLE));
    const a = G().area; const sp = FI.spots(a.id)[0]; if (sp) openFishing(spotForArea('creek', a.id, sp));
  };

  // weights by place and hour; bait and time also change how fast the bites come
  function fishTable() {
    const s = st(), m = s.time.min, sp = FX.spot;
    const w = sp.kind === 'lake' ? { perch: 48, trout: 28, pike: 20, char: 4 } : { trout: 52, perch: 26, char: 10, pike: 12 };
    const dawnDusk = (m >= 300 && m < 540) || (m >= 960 && m < 1200);
    if (dawnDusk) w.char *= 2.5;
    if (NW.Survival.isNight()) w.pike *= 1.6;
    if (FX.bait === 'meat') { w.pike *= 1.8; w.char *= 1.8; }
    if (FX.bait === 'berries') { w.perch *= 1.3; w.trout *= 1.3; }
    return w;
  }
  function biteSpeed() {
    const m = st().time.min;
    let k = 1;
    if ((m >= 300 && m < 540) || (m >= 960 && m < 1200)) k *= 1.3;
    else if (m >= 660 && m < 900) k *= 0.85;
    if (NW.Survival.isNight()) k *= 1.2;
    if (FX.bait === 'berries') k *= 1.35;
    if (FX.bait === 'meat') k *= 1.6;
    return k;
  }
  function pickFish() {
    const w = fishTable(); let tot = 0; for (const k in w) tot += w[k];
    let r = Math.random() * tot;
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return 'perch';
  }
  const rawMeat = () => ['raw_rabbit', 'raw_venison'].find((id) => I.count(st().inv, id) > 0);
  function baitAvail(b) {
    const s = st(), m = mod();
    if (b === 'berries') return I.count(s.inv, 'berries') > 0;
    if (b === 'meat') return (m.scraps || 0) > 0 || !!rawMeat();
    return true;
  }
  function setPhase(ph, msg) { FX.phase = ph; FX.t = 0; if (msg != null) FX.msg = msg; UI.refresh('fishing'); }
  function cast() {
    const g = G(), s = st(), m = mod();
    let bait = m.bait || 'none';
    if (!baitAvail(bait)) bait = 'none';
    if (bait === 'berries') I.remove(s.inv, 'berries', 1);
    if (bait === 'meat') {
      if (!(m.scraps > 0)) { const id = rawMeat(); I.remove(s.inv, id, 1); m.scraps = id === 'raw_venison' ? 6 : 4; g.msg('You cut the ' + D.ITEMS[id].name.toLowerCase() + ' into bait scraps.'); }
      m.scraps -= 1;
    }
    FX.bait = bait;
    FX.biteAt = U.rand(4.5, 13) / biteSpeed();
    FX.nibbles = [];
    for (let i = 0, tt = 1.5; i < 4; i++) { tt += U.rand(1.2, 3.5); if (tt < FX.biteAt - 0.8) FX.nibbles.push(tt); }
    setPhase('cast', bait === 'none' ? 'You flick the line out.' : 'Baited with ' + (bait === 'meat' ? 'a scrap of meat' : 'a lingonberry') + '. You flick the line out.');
    g.sfx('reel', { vol: 0.35 });
  }
  function strike() {
    const g = G();
    if (FX.phase === 'wait') { setPhase('idle', 'Too early. The float was only nodding. You reel in an empty hook.'); g.sfx('reel', { vol: 0.3 }); return; }
    if (FX.phase !== 'bite') return;
    const k = pickFish(), f = FISH[k];
    FX.fish = k; FX.tension = 42; FX.dist = 55 + f.str * 35; FX.over = 0; FX.slack = 0; FX.surge = 0; FX.surgeIn = U.rand(1.2, 2.6); FX.reelSnd = 0;
    setPhase('fight', 'Hooked! Keep the line in the pale band.');
    g.sfx('splash', { vol: 0.6 }); g.sfx('reel', { vol: 0.5 });
  }
  // Space / E / the button: tap to cast or strike, hold to reel.
  FI.press = function () {
    if (!FX || G().dead) return;
    if (FX.phase === 'idle') cast();
    else if (FX.phase === 'wait' || FX.phase === 'bite') strike();
  };
  FI.hold = (on) => { held = !!on; };
  FI.session = () => FX;
  FI.forceBite = () => { if (FX && FX.phase === 'wait') FX.biteAt = Math.min(FX.biteAt, FX.t + 0.01); };

  function land() {
    const g = G(), m = mod(), k = FX.fish, f = FISH[k];
    I.give(f.raw, 1);
    m.caught[k] = (m.caught[k] || 0) + 1;
    FX.log.unshift(k); FX.log.length = Math.min(FX.log.length, 6);
    g.sfx('fish_flop'); g.sfx('splash', { vol: 0.4 });
    const line = { perch: 'A striped perch, flapping on the ice.', trout: 'A speckled trout, cold as the water.', pike: 'A pike, all teeth. It nearly took your fingers.', char: 'An Arctic char. Silver and red. A rare thing this far south.' }[k];
    FX.landed = k;
    setPhase('landed', line);
    g.stat('fish', 1);
    g.journalOnce('fi_' + k, 'Caught a ' + f.name + ' at ' + (FX.spot.kind === 'lake' ? 'the Lake Wren ice hole' : 'a creek pool in ' + D.AREAS[FX.spot.area].name) + '.', 'notes');
    H.emit('fishCaught', k);
  }
  function lose(snap) {
    const g = G();
    if (snap) { g.sfx('line_snap'); setPhase('snap', 'SNAP. The line parts and the ' + FISH[FX.fish].name + ' is gone. You tie on a new hook with numb fingers.'); }
    else { g.sfx('splash', { vol: 0.5 }); setPhase('lost', FX.dist > 120 ? 'The line runs out. The ' + FISH[FX.fish].name + ' is gone.' : 'The line goes slack. The ' + FISH[FX.fish].name + ' threw the hook.'); }
  }
  function updateFishing(dt) {
    if (!FX) return;
    const g = G(), s = st();
    if (!UI.isOpen('fishing')) { FX = null; held = false; return; }
    const p = s.player;
    // danger closes the panel: you drop the rod and look up
    const sg = s.night.stag;
    const danger = (sg.stage === 'watching' || sg.stage === 'hunting') && sg.area === g.area.id;
    if (danger || p.hp < FX.hp - 0.5 || g.area.id !== FX.spot.area || g.dead) {
      if (danger) g.msg('You drop the line. Something pale is watching from the trees.', 'danger');
      else if (p.hp < FX.hp - 0.5 && !g.dead) g.msg('You drop the line.', 'warn');
      UI.close('fishing'); FX = null; held = false; return;
    }
    FX.hp = p.hp;
    FX.t += dt;
    switch (FX.phase) {
      case 'cast':
        if (FX.t >= 0.7) { setPhase('wait', 'Wait for the float to go under. Strike when it does.'); g.sfx('splash', { vol: 0.35 }); if (FX.spot.kind === 'lake' && Math.random() < 0.3) g.sfx('ice_crack', { vol: 0.25 }); }
        break;
      case 'wait':
        if (FX.t >= FX.biteAt) { setPhase('bite', 'The float plunges! STRIKE!'); g.sfx('splash', { vol: 0.45 }); FX.window = 1.1; }
        else if (FX.spot.kind === 'lake' && Math.random() < dt * 0.02) g.sfx('ice_crack', { vol: 0.15, pan: U.rand(-1, 1) });
        break;
      case 'bite':
        if (FX.t >= FX.window) setPhase('idle', 'Too slow. Something stole the bait.');
        break;
      case 'fight': {
        const f = FISH[FX.fish];
        FX.surgeIn -= dt;
        if (FX.surge > 0) FX.surge -= dt;
        else if (FX.surgeIn <= 0) { FX.surge = U.rand(0.4, 0.5 + f.str * 0.5); FX.surgeIn = U.rand(1.3, 3.4) - f.str * 0.5; if (f.str > 0.5 && Math.random() < 0.4) g.sfx('splash', { vol: 0.3 }); }
        // holding winds the line in and raises the tension; letting go eases it. Progress only while the line is in the band.
        let dT = held ? 40 : -36;
        dT += f.str * 8 + (FX.surge > 0 ? f.str * 32 : 0);
        FX.tension = U.clamp(FX.tension + dT * dt, 0, 100);
        const [lo, hi] = f.zone;
        if (FX.tension >= lo && FX.tension <= hi) FX.dist -= f.reel * dt * (held ? 1 : 0.4) * (FX.surge > 0 ? 0.5 : 1);
        else if (FX.tension < lo) FX.dist += (2 + f.str * 5 + (FX.surge > 0 ? f.str * 14 : 0)) * dt;
        if (FX.tension > hi) FX.over += dt; else FX.over = Math.max(0, FX.over - dt * 2);
        if (FX.tension < lo) FX.slack += dt; else FX.slack = Math.max(0, FX.slack - dt * 2);
        if (held) { FX.reelSnd -= dt; if (FX.reelSnd <= 0) { FX.reelSnd = 0.4; g.sfx('reel', { vol: 0.3 + FX.tension / 300 }); } }
        if (FX.dist <= 0) land();
        else if (FX.tension >= 100 || FX.over > 1.3) lose(true);
        else if (FX.slack > 2.4 || FX.dist > 130) lose(false);
        break;
      }
      case 'landed': if (FX.t > 1.6) setPhase('idle', 'Cast again, or step away.'); break;
      case 'snap': if (FX.t > 2.2) setPhase('idle', 'New hook tied. Cast again.'); break;
      case 'lost': if (FX.t > 1.4) setPhase('idle', 'Cast again.'); break;
    }
  }

  // ------------------------------------------------------------ the panel
  const CW = 208, CH = 112, SURF = 46;
  UI.addStyle(
    '.panel-fishing .pbox{min-width:0;width:min(86%,calc(var(--u)*232px))}' +
    '.fi-body{display:flex;flex-direction:column;align-items:center;gap:0.35em}' +
    '#fi-c{width:calc(var(--u)*208px);max-width:100%;image-rendering:pixelated;border:3px solid #2b1a10;box-shadow:0 0 0 1px #000;background:#05060a}' +
    '.fi-msg{min-height:2.3em;text-align:center;max-width:calc(var(--u)*208px)}' +
    '.fi-msg.hot{color:#ffcf6b}.fi-msg.bad{color:#ff9d86}.fi-msg.good{color:#bfe39a}' +
    '.fi-bait{display:flex;gap:0.3em;align-items:center;flex-wrap:wrap;justify-content:center;font-size:0.9em}' +
    '.fi-bait button.on{border-color:var(--amber);color:#ffe8b5;background:linear-gradient(180deg,#5a3a22,#3d2a1b)}' +
    '.fi-log{font-size:0.82em;color:var(--dim)}' +
    '.fi-foot{justify-content:space-between;align-items:center}' +
    '#fi-act{min-width:7em}'
  );
  const ACT_LABEL = { idle: 'Cast', cast: '…', wait: 'Strike', bite: 'STRIKE!', fight: 'Reel (hold)', landed: '…', snap: '…', lost: '…' };
  UI.registerPanel('fishing', (box) => {
    if (!FX) { box.innerHTML = UI.h.head('Fishing') + '<div class="pbody">The line is in.</div>'; UI.h.bindClose(box, 'fishing'); return; }
    const s = st(), m = mod(), esc = UI.h.esc;
    const idle = FX.phase === 'idle';
    const cls = FX.phase === 'bite' ? 'hot' : FX.phase === 'snap' || FX.phase === 'lost' ? 'bad' : FX.phase === 'landed' ? 'good' : '';
    const meat = rawMeat();
    const baits = [['none', '1 No bait', true], ['berries', '2 Berries (' + I.count(s.inv, 'berries') + ')', baitAvail('berries')], ['meat', '3 Meat (' + (m.scraps || 0) + ' scraps' + (meat ? ' +' : '') + ')', baitAvail('meat')]];
    const night = NW.Survival.isNight() && s.night.n >= 2;
    const caught = Object.keys(FISH).filter((k) => m.caught[k]).map((k) => m.caught[k] + ' ' + FISH[k].name).join(' · ');
    box.innerHTML = UI.h.head('Fishing', PLACES[FX.spot.kind] + (FX.spot.kind === 'creek' ? ' · ' + D.AREAS[FX.spot.area].name : '')) +
      '<div class="pbody fi-body"><canvas id="fi-c" width="' + CW + '" height="' + CH + '"></canvas>' +
      '<div id="fi-msg" class="fi-msg ' + cls + '">' + esc(FX.msg || '') + '</div>' +
      '<div class="fi-bait">Bait: ' + baits.map(([id, l, ok]) => '<button class="small' + ((m.bait || 'none') === id ? ' on' : '') + '" data-fbait="' + id + '"' + (ok && idle ? '' : ' disabled') + '>' + esc(l) + '</button>').join('') + '</div>' +
      (night ? '<div class="hint">It is dark. Things walk the forest at night. Keep your ears open.</div>' : '') +
      '<div class="fi-log">' + (caught ? 'Caught this run: ' + esc(caught) : 'Dawn and dusk bring the rare fish. Meat draws the big ones.') + '</div></div>' +
      '<div class="pfoot fi-foot"><span class="small-txt">E / Space: cast · strike · hold to reel</span><span><button id="fi-act" class="strong"' + (ACT_LABEL[FX.phase] === '…' ? ' disabled' : '') + '>' + ACT_LABEL[FX.phase] + '</button> <button data-close>Stop</button></span></div>';
    UI.h.bindClose(box, 'fishing');
    box.querySelectorAll('[data-fbait]').forEach((b) => { b.onclick = () => { mod().bait = b.dataset.fbait; UI.refresh('fishing'); }; });
    const act = box.querySelector('#fi-act');
    if (act) {
      act.onpointerdown = (e) => { e.preventDefault(); if (FX && FX.phase === 'fight') held = true; else FI.press(); };
      act.onpointerup = act.onpointerleave = () => { held = false; };
    }
  });
  const isFishKey = (code) => { const K = NW.Keys; return code === 'Space' || code === 'Enter' || K.is('interact', code) || K.is('shoot', code); };
  H.on('panelKey', (v, top, code, e) => {
    if (top !== 'fishing') return undefined;
    if (/^Digit[1-3]$/.test(code)) { if (FX && FX.phase === 'idle') { const b = ['none', 'berries', 'meat'][+code.slice(5) - 1]; if (baitAvail(b)) { mod().bait = b; UI.refresh('fishing'); } } return true; }
    if (!isFishKey(code)) return undefined;
    if (e && e.repeat) return true;
    if (FX && FX.phase === 'fight') held = true; else FI.press();
    return true;
  });
  window.addEventListener('keyup', (e) => { if (isFishKey(e.code)) held = false; });
  window.addEventListener('blur', () => { held = false; });
  window.addEventListener('pointerup', () => { held = false; });

  // Side-view scene: the ranger, the line, the float and what is under the ice.
  function drawScene(c, t) {
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    const s = st(), lake = FX.spot.kind === 'lake';
    const day = NW.Survival.daylight();
    const sky = NW.Objects && NW.Objects.skyColor ? NW.Objects.skyColor() : '#9db3c8';
    R(g, sky, 0, 0, CW, SURF);
    // far treeline
    const tl = S.mix(sky, P.g0, 0.7), tl2 = S.mix(sky, P.ink, 0.75);
    for (let x = 0; x < CW; x += 7) { const h = 10 + U.hashf(x, 3, 1) * 12; g.fillStyle = tl; g.beginPath(); g.moveTo(x - 5, SURF - 6); g.lineTo(x + 2, SURF - 6 - h); g.lineTo(x + 9, SURF - 6); g.fill(); }
    R(g, tl2, 0, SURF - 8, CW, 4);
    if (s.weather.precip > 0) for (let i = 0; i < 18; i++) R(g, s.weather.type === 'rain' ? P.b3 : P.white, (U.hashf(i, 1, 2) * CW + t * 6) % CW, (U.hashf(i, 2, 2) * SURF + t * (s.weather.type === 'rain' ? 60 : 12)) % SURF, 1, s.weather.type === 'rain' ? 2 : 1);
    // water column
    for (let y = SURF; y < CH; y++) { const k = (y - SURF) / (CH - SURF); R(g, k < 0.25 ? P.w2 : k < 0.6 ? P.w1 : P.w0, 0, y, CW, 1); }
    for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(160,200,230,0.05)'; g.fillRect(70 + i * 34 + Math.sin(t * 0.5 + i) * 4, SURF, 6, CH - SURF); }
    // bottom
    for (let x = 0; x < CW; x += 4) { const h = 4 + U.hashf(x, 9, 4) * 5; R(g, lake ? P.mud1 : P.st1, x, CH - h, 4, h); if (U.hashf(x, 5, 4) < 0.3) R(g, lake ? P.mud2 : P.st2, x, CH - h, 3, 2); }
    if (!lake) for (let x = 6; x < CW; x += 13) R(g, P.g2, x, CH - 14 - U.hashf(x, 2, 2) * 6, 1, 10);
    // ambient fish
    for (let i = 0; i < 3; i++) {
      const fx = (U.hashf(i, 7, 1) * CW + t * (5 + i * 3) * (i % 2 ? 1 : -1) + CW * 4) % (CW + 20) - 10, fy = SURF + 26 + i * 14 + Math.sin(t * 0.8 + i) * 3;
      g.fillStyle = 'rgba(8,18,30,0.55)'; g.fillRect(fx, fy, 7, 2); g.fillRect(fx + (i % 2 ? -2 : 7), fy - 1, 2, 4);
    }
    // surface: ice and dock (lake) or banks (creek)
    let manX, manY, floatX;
    if (lake) {
      R(g, P.ice0, 0, SURF - 2, CW, 6); R(g, P.ice1, 0, SURF - 2, CW, 3); R(g, P.ice2, 0, SURF - 2, CW, 1);
      for (let x = 0; x < CW; x += 9) if (U.hashf(x, 1, 7) < 0.4) R(g, P.white, x, SURF - 2, 3, 1);
      floatX = 108;
      R(g, P.w2, floatX - 7, SURF - 2, 14, 6); R(g, P.sn3, floatX - 9, SURF - 3, 3, 2); R(g, P.sn3, floatX + 7, SURF - 3, 3, 2);
      // dock
      R(g, P.wood1, 0, SURF - 7, 78, 5); R(g, P.wood3, 0, SURF - 7, 78, 2); for (let x = 4; x < 78; x += 8) R(g, P.wood2, x, SURF - 7, 1, 5);
      [10, 40, 70].forEach((x) => { R(g, P.wood0, x, SURF - 2, 4, CH - SURF - 4); R(g, P.wood1, x, SURF - 2, 1, CH - SURF - 4); });
      g.drawImage(SPR.bucket(), 64, SURF - 17);
      manX = 46; manY = SURF - 6;
    } else {
      // near bank sloping into the creek, far bank on the right
      for (let x = 0; x < 72; x++) { const top = SURF - 9 + Math.max(0, x - 56) * 0.9; R(g, P.d1, x, top, 1, SURF + 14 - top - Math.max(0, x - 50) * 0.6); R(g, s.weather.snow > 0.3 ? P.sn2 : P.g3, x, top, 1, 2); }
      for (let x = 180; x < CW; x++) { const top = SURF - 7 - (x - 180) * 0.2; R(g, P.d0, x, top, 1, CH); R(g, s.weather.snow > 0.3 ? P.sn1 : P.g2, x, top, 1, 2); }
      for (let i = 0; i < 6; i++) { const x = 74 + ((i * 23 + t * 9) % 104); R(g, P.w3, x, SURF, 4, 1); }
      g.drawImage(SPR.rest(), 56, SURF - 22);
      floatX = 124;
      manX = 36; manY = SURF - 9;
    }
    // ranger, side view
    const pl = s.player;
    S.human(g, manX, manY, Object.assign({}, S.PLAYER, { dir: 'right', coat: pl.coat === 'parka' ? P.b1 : P.rg2, coat2: pl.coat === 'parka' ? P.b0 : P.rg0, lantern: day < 0.45, shadow: false }));
    // rod
    const ph = FX.phase, fight = ph === 'fight';
    const bend = fight ? FX.tension / 100 : ph === 'bite' ? 0.5 : 0;
    const hx = manX + 4, hy = manY - 11;
    const tipX = hx + 26 - bend * 4, tipY = hy - 16 + bend * 10;
    g.strokeStyle = P.wood3; g.lineWidth = 1; g.beginPath(); g.moveTo(hx, hy); g.quadraticCurveTo(hx + 14, hy - 12 + bend * 4, tipX, tipY); g.stroke();
    R(g, P.i3, hx + 2, hy - 2, 2, 2);
    // line + float / hooked fish
    const fl = FISH[FX.fish] || FISH.perch;
    let endX = floatX, endY = SURF - 1;
    if (ph === 'landed') { endX = tipX + 1; endY = tipY + 9 + Math.round(Math.sin(FX.t * 7) * 1.5); }
    if (ph === 'cast') { const k = Math.min(1, FX.t / 0.7); endX = tipX + (floatX - tipX) * k; endY = tipY - Math.sin(k * Math.PI) * 14 + (SURF - 1 - tipY) * k; }
    if (fight) {
      const shake = FX.surge > 0 ? Math.round(Math.sin(t * 40) * 1.5) : 0;
      endX = U.clamp(floatX + 4 + FX.dist * 0.62, floatX, CW - 8) + shake;
      endY = SURF + 14 + Math.min(40, FX.dist * 0.35) + Math.sin(t * 2.3) * 4;
    }
    const taut = fight ? S.mix(P.st4, P.r3, Math.max(0, (FX.tension - 60) / 40)) : P.st4;
    g.strokeStyle = S.rgba(taut, 0.9); g.beginPath(); g.moveTo(tipX, tipY);
    if (fight || ph === 'landed') g.lineTo(endX, endY); else g.quadraticCurveTo((tipX + endX) / 2, Math.max(tipY, endY) + 4, endX, endY);
    g.stroke();
    if (ph === 'wait' || ph === 'idle' || ph === 'bite' || ph === 'cast') {
      if (ph !== 'idle') {
        let dip = Math.round(Math.sin(t * 3) * 0.6);
        if (ph === 'wait' && FX.nibbles.some((n) => FX.t > n && FX.t < n + 0.35)) dip = 2;
        if (ph === 'bite') {
          dip = 6; const r = (FX.t * 14) % 10;
          g.strokeStyle = 'rgba(220,235,245,0.7)'; g.beginPath(); g.ellipse(endX, SURF, 2 + r, 1 + r * 0.3, 0, 0, 6.3); g.stroke();
        }
        if (ph !== 'cast') endY = SURF - 3 + dip;
        R(g, P.r2, endX - 1, endY - 1, 3, 2); R(g, P.r3, endX - 1, endY - 1, 1, 1); R(g, P.white, endX - 1, endY + 1, 3, 2); R(g, P.ink, endX, endY - 3, 1, 2);
        if (ph === 'wait' || ph === 'cast') { g.fillStyle = 'rgba(200,225,240,0.25)'; g.fillRect(endX - 4, SURF, 9, 1); }
      }
    }
    if (fight || ph === 'landed') {
      const k = ph === 'landed' ? FX.landed : FX.fish, f = FISH[k];
      const len = f.len, dir = ph === 'landed' ? (Math.sin(FX.t * 9) > 0 ? 1 : -1) : 1;
      const fx = endX, fy = ph === 'landed' ? endY + 2 : endY;
      const bh = k === 'pike' ? 2.4 : 3.4;
      for (let i = 0; i < len; i++) { const h = Math.max(1, Math.round(Math.sin((i + 0.6) / (len + 0.6) * Math.PI) * bh)); const x = fx + i * dir; R(g, f.col[1], x, fy - h + 1, 1, h * 2 - 1); R(g, f.col[0], x, fy - h + 1, 1, h - 1); if (i > 1 && i < len - 2 && i % 3 === 0) R(g, f.col[2], x, fy + 1, 1, 1); }
      R(g, f.col[1], fx + len * dir + (dir < 0 ? -2 : 0), fy - 3, 3, 1); R(g, f.col[1], fx + len * dir + (dir < 0 ? -2 : 0), fy + 2, 3, 1); R(g, f.col[1], fx + len * dir + (dir < 0 ? -1 : 0), fy - 2, 2, 5);
      R(g, P.ink, fx + dir * 2, fy - 1, 1, 1);
      if (fight && FX.surge > 0 && Math.random() < 0.5) R(g, 'rgba(220,240,255,0.7)', endX - 2 + Math.random() * 6, endY - 4 - Math.random() * 6, 1, 1);
    }
    // night: everything sinks into the dark except the lantern
    if (day < 0.95) {
      g.fillStyle = 'rgba(4,6,14,' + ((1 - day) * 0.62) + ')'; g.fillRect(0, 0, CW, CH);
      if (day < 0.45) { const gr = g.createRadialGradient(manX + 4, manY - 10, 2, manX + 4, manY - 10, 46); gr.addColorStop(0, 'rgba(255,183,70,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, CW, CH); }
    }
    // tension bar and line meter
    if (fight) {
      const [lo, hi] = fl.zone, bx = 8, by = CH - 11, bw = CW - 16;
      R(g, P.ink, bx - 1, by - 1, bw + 2, 8); R(g, P.i1, bx, by, bw, 6);
      R(g, 'rgba(190,230,150,0.3)', bx + bw * lo / 100, by, bw * (hi - lo) / 100, 6);
      const col = FX.tension > hi ? P.r3 : FX.tension < lo ? P.b3 : P.f3;
      R(g, col, bx, by + 2, Math.round(bw * FX.tension / 100), 3);
      R(g, 'rgba(210,240,170,0.9)', bx + bw * lo / 100, by - 2, bw * (hi - lo) / 100, 1); R(g, P.g5, bx + bw * lo / 100, by - 2, 1, 9); R(g, P.g5, bx + bw * hi / 100, by - 2, 1, 9);
      R(g, P.white, bx + Math.round(bw * FX.tension / 100) - 1, by - 1, 2, 8);
      if (FX.over > 0.2 && Math.sin(t * 20) > 0) R(g, P.r3, bx - 1, by - 1, bw + 2, 1);
      // distance: a fish marker sliding toward the hole
      const mx = 8, mw = 70, my = 4;
      R(g, 'rgba(0,0,0,0.55)', mx - 2, my - 2, mw + 4, 7); R(g, P.st2, mx, my + 1, mw, 1);
      const px = mx + mw * U.clamp(FX.dist / 130, 0, 1);
      R(g, P.y2, px - 2, my - 1, 4, 3); R(g, P.y1, px + 2, my, 2, 1); R(g, P.white, mx, my - 1, 1, 3);
    }
    if (ph === 'bite' && Math.sin(t * 16) > -0.3) { R(g, P.y2, endX - 1, SURF - 22, 3, 9); R(g, P.y2, endX - 1, SURF - 11, 3, 3); R(g, P.ink, endX + 2, SURF - 22, 1, 12); }
  }
  let msgShown = null;
  H.on('drawOverlay', (ctx, a, t) => {
    if (!FX || !UI.isOpen('fishing')) return;
    const c = document.getElementById('fi-c'); if (!c) return;
    drawScene(c, t);
    if (msgShown !== FX.phase + FX.msg) { msgShown = FX.phase + FX.msg; const el = document.getElementById('fi-msg'); if (el && el.textContent !== FX.msg) el.textContent = FX.msg; }
  });
  // in the world: the rod and line out over the water while the panel is open
  H.on('drawWorld', (g, a, t) => {
    if (!FX || !UI.isOpen('fishing') || a.id !== FX.spot.area) return;
    const p = st().player, sp = FX.spot;
    const hx = p.x + (sp.wx > p.x + 4 ? 5 : sp.wx < p.x - 4 ? -5 : 2), hy = p.y - 11;
    const tx = hx + (sp.wx - hx) * 0.45, ty = hy - 10;
    g.strokeStyle = P.wood3; g.lineWidth = 1; g.beginPath(); g.moveTo(hx, hy); g.lineTo(tx, ty); g.stroke();
    if (FX.phase !== 'idle' && FX.phase !== 'cast') {
      g.strokeStyle = 'rgba(220,230,240,0.6)'; g.beginPath(); g.moveTo(tx, ty); g.lineTo(sp.wx, sp.wy); g.stroke();
      if (FX.phase === 'wait') { R(g, P.r2, sp.wx - 1, sp.wy - 1 + Math.round(Math.sin(t * 3) * 0.6), 2, 2); R(g, P.white, sp.wx - 1, sp.wy + 1, 2, 1); }
      if (FX.phase === 'fight' || FX.phase === 'bite') { const r = (t * 10) % 6; g.strokeStyle = 'rgba(220,235,245,0.6)'; g.beginPath(); g.ellipse(sp.wx, sp.wy + 1, 2 + r, 1 + r * 0.4, 0, 0, 6.3); g.stroke(); }
    }
  });

  // ============================================================ WORLD HOOKS
  function spotActions(spot) {
    const rod = hasRod();
    return [{ label: rod ? 'Fish' : 'Fish (no rod)', run: () => openFishing(spot), disabled: rod ? false : 'You need a fishing rod. There is one in the storage chest.' }];
  }
  H.on('objects', (areaId) => {
    const m = peek(); if (!m) return null;
    const out = [];
    if (areaId === LAKE) {
      const sp = spotForArea('lake', LAKE, HOLE);
      out.push({ x: HOLE.x, y: HOLE.y, fishing: 'hole', name: 'Ice-fishing hole', actions: () => spotActions(sp), draw: (g, t) => {
        g.drawImage(SPR.hole(), HOLE.wx - 18, HOLE.wy - 8);
        if (!(FX && UI.isOpen('fishing'))) { const r = (t * 0.7) % 1; g.fillStyle = 'rgba(16,30,48,' + (0.6 * (1 - r)) + ')'; g.fillRect(HOLE.wx - 2 - r * 2, HOLE.wy + 1, 4 + r * 4, 1); }
        g.drawImage(SPR.bucket(), HOLE.x + 7, HOLE.y - 10);
      } });
    }
    const spots = m.spots && m.spots[areaId];
    if (spots) spots.forEach((p) => {
      const sp = spotForArea('creek', areaId, p);
      out.push({ x: p.x, y: p.y, fishing: 'pool', name: 'Deep pool', actions: () => spotActions(sp), draw: (g, t) => {
        g.drawImage(SPR.rest(), p.x - 6 + p.side * 3, p.y - 15);
        for (let i = 0; i < 2; i++) { const r = ((t * 0.5 + i * 0.5) % 1); g.strokeStyle = 'rgba(150,190,220,' + (0.45 * (1 - r)) + ')'; g.lineWidth = 1; g.beginPath(); g.ellipse(p.wx, p.wy + 2, 2 + r * 6, 1 + r * 2.5, 0, 0, 6.3); g.stroke(); }
      } });
    });
    m.snares.forEach((sn) => { if (sn.area === areaId) out.push({ x: sn.x, y: sn.y, snare: sn.id, name: () => snareName(sn), actions: () => snareActions(sn), draw: (g, t) => drawSnare(g, sn, t) }); });
    return out;
  });
  H.on('mapMarks', (s) => {
    const m = s.mods && s.mods.fishing; if (!m) return null;
    const per = {};
    m.snares.forEach((sn) => { (per[sn.area] = per[sn.area] || []).push(sn); });
    return Object.keys(per).map((a) => { const l = per[a]; const ready = l.some((x) => x.st === 'caught'); return { area: a, x: l[0].x, y: l[0].y, label: (l.length > 1 ? 'Snares ×' + l.length : 'Snare') + (ready ? '!' : ''), color: ready ? '#a5352e' : '#5a4a1a' }; });
  });
  H.on('itemUsable', (v, id) => (id === 'snare' ? 'Set snare' : undefined));
  H.on('useItem', (v, id) => (id === 'snare' ? setSnare() : undefined));
  H.on('update', (dt) => { if (FX) updateFishing(dt); tickSnares(); });
  H.on('areaEnter', () => { if (FX && !UI.isOpen('fishing')) FX = null; });

  // new runs: rod and one snare in the storage chest. Older runs get a rod on load if they have none anywhere.
  H.on('newGame', (s) => { const m = mod(); I.add(s.chest, 'rod', 1); I.add(s.chest, 'snare', 1); m.rodGiven = true; });
  H.on('start', (s) => {
    FX = null; held = false;
    const m = mod();
    if (!m.rodGiven) {
      m.rodGiven = true;
      const owned = I.count(s.inv, 'rod') + I.count(s.chest, 'rod') + s.drops.filter((d) => d.id === 'rod').length;
      if (!owned && I.add(s.chest, 'rod', 1) > 0) s.drops.push({ area: 'room_storage', x: 60, y: 120, id: 'rod', n: 1 });
    }
    if (!Array.isArray(m.snares)) m.snares = [];
    m.caught = m.caught || {}; m.next = null;
    ensureSpots();
    tickSnares();
  });
  H.on('morning', (day, news) => {
    const m = peek(); if (!m) return;
    tickSnares();
    if (m.snares.some((x) => x.st === 'caught')) G().journalOnce('fi_check_' + day, 'Day ' + day + ': something is caught in one of my snares. The map shows where.', 'notes');
  });

  // Journal: a short tally
  UI.registerJournalTab('fishing', 'Catch', (s) => {
    const m = s.mods && s.mods.fishing;
    const caught = m ? Object.keys(FISH).filter((k) => m.caught && m.caught[k]) : [];
    let h = '<div class="entry"><b>Fish</b></div>';
    h += caught.length ? caught.map((k) => '<div class="entry">' + UI.h.icon(FISH[k].raw) + m.caught[k] + ' × ' + UI.h.esc(FISH[k].name) + '</div>').join('') : '<div class="hint">Nothing landed yet. The ice hole is at the end of the Lake Wren dock; the creek has deep pools under its banks.</div>';
    h += '<div class="entry"><b>Snares</b></div>';
    const sn = m ? m.snares : [];
    h += sn.length ? sn.map((x) => '<div class="entry">' + UI.h.esc(D.AREAS[x.area].name) + ' — ' + UI.h.esc(snareName(x).replace('Your snare — ', '')) + '</div>').join('') : '<div class="hint">No snares set. Twist them from rope and scrap at the sawhorse; set them from your pack.</div>';
    if (m && m.snared) h += '<div class="hint">Taken from snares so far: ' + m.snared + '.</div>';
    return h;
  });
  UI.registerHowto('Fishing and snares', 'Take the <b>fishing rod</b> from the storage chest. Fish the ice hole at the end of the Lake Wren dock or a deep pool along the creek. ' +
    'Cast, wait for the float to plunge, strike, then <b>hold</b> to reel while keeping the tension in the pale band — too hard snaps the line, too slack loses the fish. ' +
    'Berries and meat scraps bring bites faster; dawn and dusk bring rarer fish. Cook fish at the cooking station. ' +
    '<b>Snares</b>: twist them at the sawhorse (rope + scrap), set them from your pack on open forest ground away from trails, and check them after a night.');
})(window.NW);
