'use strict';
// HQ orders: from day 2 Base issues one or two field orders each morning, each with a place, a deadline and a reward.
(function (NW) {
  const U = NW.U, D = NW.D, S = NW.S, I = NW.Inv, H = NW.Hooks, UI = NW.UI;
  const P = S.P, R = S.R;
  const TS = D.TILE;
  const G = () => NW.G;
  const st = () => NW.G.state;
  const MS = NW.Missions = {};

  const mod = () => NW.mod('missions', () => ({ seq: 1, orders: [], lastDay: 0 }));
  const peek = () => { const s = st(); return s && s.mods && s.mods.missions; }; // no lazy init in per-frame hooks
  MS.state = mod;
  const active = () => { const m = peek(); return m ? m.orders.filter((o) => o.status === 'active') : []; };
  MS.active = active;
  MS.summary = function () {
    const m = peek(); const os = m ? m.orders : [];
    return { done: os.filter((o) => o.status === 'done').length, failed: os.filter((o) => o.status === 'failed' || o.status === 'lapsed').length, total: os.length };
  };

  // ------------------------------------------------------------------ item
  D.ITEMS.hq_pack = D.ITEMS.hq_pack || { name: "Hiker's Pack", stack: 1, kind: 'tool', desc: 'A day pack with a name tag. Base wants it logged at the cabin.' };
  S.registerIcon('hq_pack', (g) => {
    R(g, P.f0, 3, 4, 10, 11); R(g, P.f1, 4, 5, 8, 9); R(g, P.f2, 4, 5, 8, 2); R(g, P.f0, 5, 9, 6, 4); R(g, P.f1, 6, 10, 4, 2);
    R(g, P.b1, 3, 2, 10, 3); R(g, P.b2, 3, 2, 10, 1); R(g, P.ink, 5, 2, 1, 3); R(g, P.ink, 10, 2, 1, 3); R(g, P.white, 9, 12, 2, 2);
  });

  // ---------------------------------------------------------------- places
  const areaName = (a) => { if (D.AREAS[a]) return D.AREAS[a].name; const d = NW.World.areaDef(a); return (d && d.name) || 'the fire tower'; };
  const mapArea = (a) => { if (D.AREAS[a]) return a; const d = NW.World.areaDef(a); return d && d.mapAt && D.AREAS[d.mapAt.area] ? d.mapAt.area : 'f_0_0'; };
  const dirOf = (a) => {
    const [x, y] = D.areaXY(mapArea(a)); const v = y < 2 ? 'north' : y > 2 ? 'south' : '', h = x < 2 ? 'west' : x > 2 ? 'east' : '';
    return v && h ? v + '-' + h : v || h;
  };
  MS.directions = (a) => areaName(a) + (D.AREAS[a] ? '' : ' (' + D.AREAS[mapArea(a)].name + ')') + ' lies ' + dirOf(a) + ' of the cabin.';
  // trail junctions: areas with three or more trails
  const JUNCTIONS = Object.keys(D.AREAS).filter((id) => {
    if (id === 'f_2_2') return false;
    const [x, y] = D.areaXY(id);
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => D.linked(x, y, x + dx, y + dy)).length >= 3;
  });
  const placesOk = () => !!(NW.Places && NW.Places.spot && NW.Places.ids && NW.Places.ids.tower && NW.World.areaDef(NW.Places.ids.tower));

  // ------------------------------------------------------------ order types
  // areas: candidate areas; near(a): search centre; n: parts; long: due at dusk tomorrow; reward: [[item, n]]
  const T = {
    breaker: { mark: 'Breaker', title: 'Reset the tripped breaker', short: 'Reset breaker', areas: ['f_4_0'], near: () => [318, 146], reward: [['nails', 4], ['oil', 1]],
      brief: (o) => 'The relay at the ' + areaName(o.parts[0].a) + ' tripped overnight. Reset the breaker box' },
    gauge: { mark: 'Gauge', title: 'Read the snow gauge', short: 'Read gauge', areas: ['f_2_0', 'f_0_3'], near: (a) => (a === 'f_2_0' ? [300, 158] : [240, 140]), reward: [['canned', 1], ['ammo', 4]],
      brief: (o) => 'Read the snow gauge at ' + areaName(o.parts[0].a) + ' and log the depth' },
    markers: { mark: 'Markers', title: 'Tie trail markers', short: 'Tie markers', n: 3, long: true, near: (a) => { const w = NW.World.get(a); return [w.hub.x * TS + 34, w.hub.y * TS + 30]; }, reward: [['rope', 1], ['canned', 2], ['cloth', 1]],
      brief: (o) => 'Tie fresh markers at three trail junctions: ' + o.parts.map((p) => areaName(p.a)).join(', ') },
    restock: { mark: 'Shelter', title: 'Restock the shelter box', short: 'Restock shelter box', areas: ['f_2_3'], long: true, near: () => [282, 150], need: { wood: 2, canned: 1 }, reward: [['canned', 2], ['oil', 1], ['bandage', 1]],
      brief: () => 'Restock the shelter box at the Abandoned Camp: two firewood, one canned food' },
    pack: { mark: 'Lost pack', title: "Recover a hiker's lost pack", short: 'Find lost pack', areas: ['f_1_3', 'f_0_4', 'f_2_1', 'f_4_1', 'f_1_1'], reward: [['cloth', 2], ['canned', 1], ['berries', 3]],
      brief: (o) => 'A day hiker lost a pack in ' + areaName(o.parts[0].a) + '. Bring it back to the cabin' },
    tree: { mark: 'Fallen pine', title: 'Clear the fallen pine', short: 'Clear fallen pine', areas: ['f_1_4'], near: () => [150, 138], r: 40, reward: [['plank', 2], ['nails', 3]],
      brief: () => 'A pine came down on the Logging Road. Clear it' },
    snares: { mark: 'Snares', title: "Pull the poachers' snares", short: 'Pull snares', areas: ['f_4_2'], n: 3, near: () => [318, 150], reward: [['rope', 1], ['scrap', 1], ['ammo', 3]],
      brief: () => "Poachers' snares reported near the Hunting Blind. Pull all three" },
    camera: { mark: 'Camera', title: 'Retrieve the research camera card', short: 'Camera card', areas: ['f_4_3'], near: () => [300, 146], reward: [['ammo', 5], ['medkit', 1]],
      brief: () => 'The research camera at the Hollow Oak stopped sending. Pull its memory card' },
    sign: { mark: 'Mine sign', title: 'Re-post the mine warning sign', short: 'Mine sign', areas: ['f_3_1'], near: () => [196, 134], need: { nails: 2 }, reward: [['nails', 4], ['scrap', 1], ['canned', 1]],
      brief: () => 'The KEEP OUT sign at the Hollow Mine is down. Nail it back up' },
    tower: { mark: 'Tower', title: 'Radio a bearing from the fire tower', short: 'Tower bearing', long: true, tower: true, reward: [['medkit', 1], ['ammo', 6], ['oil', 1]],
      brief: () => 'Climb the Old Fire Tower and radio a fire-finder bearing from the cab' },
  };
  MS.TYPES = T;
  const partsDone = (o) => o.parts.filter((p) => p.ok).length;
  const loot = (n) => Math.max(1, Math.round(n * G().modeVal('loot')));
  const rewardOf = (o) => o.reward.map(([id, n]) => [id, loot(n)]);
  const itemsTxt = (list) => list.map(([id, n]) => n + ' ' + D.ITEMS[id].name).join(', ');
  const dueTxt = (o) => { const d = st().time.day; return o.due === d ? 'today, before dusk' : o.due === d + 1 ? 'tomorrow, before dusk' : 'day ' + o.due + ', before dusk'; };

  // --------------------------------------------------------------- issuing
  function placeParts(type, rnd) {
    const t = T[type], parts = [];
    if (t.tower) {
      if (!placesOk()) return null;
      const id = NW.Places.ids.tower; let sp = null;
      try { sp = NW.Places.spot(id); } catch (e) { sp = null; }
      return sp ? [{ a: id, x: Math.round(sp.x), y: Math.round(sp.y), ok: false }] : null;
    }
    let areas;
    if (type === 'markers') areas = U.shuffle(JUNCTIONS.slice(), rnd).slice(0, 3);
    else { const a = t.areas[Math.floor(rnd() * t.areas.length)]; areas = [a]; for (let i = 1; i < (t.n || 1); i++) areas.push(a); }
    const taken = [];
    for (const a of areas) {
      const c = t.near ? t.near(a) : null;
      let sp = null, fallback = null;
      for (let k = 0; k < 28 && !sp; k++) {
        const p = c && k < 14 ? G().findFreeSpot(a, rnd, c[0], c[1], t.r) : G().findFreeSpot(a, rnd, null, null, t.r);
        if (!p || taken.some((q) => q.a === a && Math.abs(q.x - p.x) < 40 && Math.abs(q.y - p.y) < 30)) continue;
        if (clearSpot(a, p.x, p.y, type)) sp = p; else if (!fallback) fallback = p;
      }
      sp = sp || fallback;
      if (!sp) return null;
      const part = { a, x: sp.x, y: sp.y, ok: false }; parts.push(part); taken.push(part);
    }
    return parts;
  }
  // looks right where it stands: off the trail (the fallen pine wants the road), clear of trunks, canopies and clutter
  function clearSpot(a, x, y, type) {
    const w = NW.World.get(a), WT = NW.World.T;
    if (w.kind === 'forest') {
      if (type === 'tree') { if (NW.World.tile(w, Math.floor(x / TS), Math.floor(y / TS)) !== WT.DIRT) return false; }
      else for (let ty = Math.floor((y - 8) / TS); ty <= Math.floor((y + 4) / TS); ty++) for (let tx = Math.floor((x - 12) / TS); tx <= Math.floor((x + 12) / TS); tx++) if (NW.World.tile(w, tx, ty) === WT.DIRT) return false;
    }
    const half = type === 'tree' ? 30 : 12;
    for (const o of w.objs) {
      const dx = Math.abs(o.x - x), dy = o.y - y;
      if (o.type === 'tree') { if ((dx < half + 6 && dy > -4 && dy < 40) || (dx < half && dy <= -4 && dy > -14)) return false; continue; }
      if (o.layer === 'floor' || o.type === 'cabin_ext' || o.type === 'cabin_annex') continue;
      if (dx < half + (o.cw || 16) / 2 + 8 && Math.abs(dy) < 20) return false;
    }
    return true;
  }
  function issue(d, news) {
    const s = st(), m = mod();
    m.lastDay = d;
    if (d < 2 || d === G().finalNight()) return [];
    const rnd = U.rng(U.hash(s.seed, d, 4471));
    const act = active();
    const busy = new Set(act.map((o) => o.type));
    let n = 1 + (rnd() < 0.55 ? 1 : 0);
    if (act.length) n = Math.min(n, Math.max(0, 3 - act.length), 1);
    const pool = U.shuffle(Object.keys(T).filter((k) => !busy.has(k)), rnd);
    const out = [];
    for (const type of pool) {
      if (out.length >= n) break;
      const parts = placeParts(type, rnd);
      if (!parts) continue;
      const t = T[type];
      const o = { id: 'o' + (m.seq++), type, day: d, due: d + (t.long ? 1 : 0), pri: rnd() < (out.length ? 0.3 : 0.5), status: 'active', parts, reward: t.reward.map((r) => r.slice()), end: null, note: '' };
      if (type === 'camera') o.frame = Math.floor(rnd() * CAMERA.length);
      if (type === 'gauge') o.depth = 38 + Math.floor(rnd() * 50);
      m.orders.push(o); out.push(o);
    }
    if (!out.length) return out;
    const lines = out.map((o) => (o.pri ? 'Priority: ' : '') + T[o.type].brief(o) + (o.due > d ? ' within two days' : ' before dusk') + '.');
    if (news) news.push('Orders for Watch Seven. ' + lines.join(' '));
    G().journal('Day ' + d + ' orders from Base: ' + out.map((o) => T[o.type].title + ' at ' + areaName(o.parts[0].a) + (o.pri ? ' (priority)' : '') + ', due ' + (o.due > d ? 'tomorrow' : 'today') + ' at dusk').join('; ') + '.', 'notes');
    return out;
  }
  MS.issue = issue;

  H.on('morning', (d, news) => {
    const m = mod();
    sweep();
    if (m.lastDay >= d) return;
    const out = issue(d, news);
    if (out.length && d >= 2) { G().sfx('radio_chirp', { vol: 0.5 }); G().msg('New HQ orders. Details at the desk (HQ orders).', 'radio'); }
  });
  // an old save (or one made before this module) gets the day's orders on load, if it is still morning
  H.on('start', (s) => {
    const m = mod();
    if (s.time.day >= 2 && m.lastDay < s.time.day && s.time.min >= D.DAWN && s.time.min < 12 * 60) {
      const out = issue(s.time.day, null);
      if (out.length) G().msg('HQ orders are waiting at the desk.', 'radio');
    }
    sweep(); deliverPack();
  });

  // ------------------------------------------------------------ resolution
  function giveReward(o) {
    const s = st(), list = rewardOf(o);
    if (o.pri) list.push(['canned', 1]);
    list.forEach(([id, n]) => { const left = I.add(s.chest, id, n); if (left > 0) s.drops.push({ area: 'room_storage', x: 120 + Math.round(Math.random() * 40), y: 120, id, n: left }); });
    return list;
  }
  function complete(o, text) {
    if (!o || o.status !== 'active') return;
    const s = st(), g = G();
    o.status = 'done'; o.end = { day: s.time.day, min: Math.floor(s.time.min) };
    const got = giveReward(o);
    if (o.pri) s.rep += 1;
    o.note = text || 'Done.';
    g.sfx('mission_done', { vol: 0.7 });
    g.msg('HQ order done: ' + T[o.type].title + '. Supplies waiting in the storage chest' + (o.pri ? '. Base takes note.' : '.'), 'good');
    g.journal('Order done: ' + T[o.type].title + ' (' + areaName(o.parts[0].a) + '). ' + o.note + ' Base credited ' + itemsTxt(got) + ' to the cabin chest.', 'notes');
    NW.Events.report('Watch Seven completed: ' + T[o.type].title.toLowerCase() + ', ' + areaName(o.parts[0].a) + '.' + (o.pri ? ' Commendation logged.' : ''));
    H.emit('missionDone', o.id, o);
    g.save('mission');
  }
  function fail(o) {
    if (!o || o.status !== 'active') return;
    const s = st(), g = G();
    o.status = o.pri ? 'failed' : 'lapsed'; o.end = { day: s.time.day, min: Math.floor(s.time.min) };
    o.note = o.pri ? 'Missed the deadline. Base logged it against you.' : 'Not done in time. The order lapsed.';
    if (o.type === 'pack') { I.remove(s.inv, 'hq_pack', 9); I.remove(s.chest, 'hq_pack', 9); s.drops = s.drops.filter((x) => x.id !== 'hq_pack'); }
    if (o.pri) {
      s.rep -= 1; g.sfx('mission_fail', { vol: 0.7 });
      g.msg('Priority order failed: ' + T[o.type].title + '. Base is not pleased.', 'danger');
      (s.pendingReports = s.pendingReports || []).push('Watch Seven missed a priority order (' + T[o.type].title.toLowerCase() + '). That goes in your file, ranger.');
    } else g.msg('HQ order lapsed: ' + T[o.type].title + '.', 'warn');
    NW.Events.report('Order ' + (o.pri ? 'FAILED' : 'lapsed') + ': ' + T[o.type].title.toLowerCase() + ', ' + areaName(o.parts[0].a) + '.');
    g.journal('Order ' + (o.pri ? 'failed' : 'lapsed') + ': ' + T[o.type].title + ' (' + areaName(o.parts[0].a) + ').', 'notes');
    H.emit('missionFailed', o.id, o);
  }
  MS.complete = complete; MS.fail = fail;
  const overdue = (o, s) => s.time.day > o.due || (s.time.day === o.due && s.time.min >= D.DUSK);
  function sweep() { const s = st(); if (!s) return; active().forEach((o) => { if (overdue(o, s)) fail(o); }); }
  H.on('update', () => {
    const m = peek(); if (!m || !m.orders.length) return;
    const s = st();
    for (const o of m.orders) if (o.status === 'active' && overdue(o, s)) fail(o);
  });
  function deliverPack() {
    const s = st(), g = G();
    if (!g.area || g.area.kind !== 'room') return;
    const o = active().find((x) => x.type === 'pack' && x.parts[0].ok); if (!o) return;
    if (I.count(s.inv, 'hq_pack') + I.count(s.chest, 'hq_pack') <= 0) return;
    I.remove(s.inv, 'hq_pack', 9); I.remove(s.chest, 'hq_pack', 9);
    g.sfx('paper', { vol: 0.6 });
    complete(o, 'Logged the pack at the cabin. The owner will collect it at the trailhead.');
  }
  H.on('areaEnter', (id) => {
    deliverPack();
    const s = st(), here = active().filter((o) => o.parts.some((p) => p.a === id && !p.ok));
    here.forEach((o) => { if (o.hint !== s.time.day) { o.hint = s.time.day; G().msg('HQ order here: ' + T[o.type].title.toLowerCase() + '.', 'info'); } });
  });

  // ------------------------------------------------------------- sprites
  const sn = () => (st().weather.snow > 0.3 ? 1 : 0);
  const shadow = (g, x, y, w) => R(g, 'rgba(0,0,0,0.3)', x - w / 2, y - 1, w, 3);
  const spr = (k, w, h, fn) => S.cached('ms_' + k + sn(), () => S.mk(w, h, (g) => fn(g, sn())));
  const SPR = {
    breaker: () => spr('breaker', 16, 28, (g, snow) => {
      R(g, P.wood1, 6, 14, 4, 14); R(g, P.wood2, 7, 14, 2, 14); R(g, P.wood3, 7, 14, 1, 14);
      R(g, P.i1, 10, 15, 1, 12); R(g, P.i2, 10, 15, 1, 1);
      R(g, P.i0, 1, 3, 14, 12); R(g, P.i2, 2, 4, 12, 10); R(g, P.i3, 3, 5, 10, 8); R(g, P.i4, 3, 5, 1, 8); R(g, P.i2, 12, 5, 1, 8);
      R(g, P.i1, 0, 2, 16, 2); R(g, P.i3, 1, 2, 14, 1);
      R(g, P.y1, 7, 6, 1, 1); R(g, P.y1, 6, 7, 3, 1); R(g, P.y1, 5, 8, 5, 1); R(g, P.y1, 4, 9, 7, 1); R(g, P.ink, 7, 7, 1, 2);
      R(g, P.i1, 11, 9, 1, 3); R(g, P.i0, 3, 11, 8, 1);
      if (snow) { R(g, P.sn3, 0, 1, 16, 1); R(g, P.sn2, 1, 2, 14, 1); R(g, P.sn2, 5, 27, 6, 1); }
    }),
    gauge: () => spr('gauge', 12, 38, (g, snow) => {
      R(g, P.i2, 3, 0, 5, 2); R(g, P.i3, 4, 0, 3, 1);
      for (let i = 0; i < 8; i++) { R(g, i % 2 ? P.white : P.r2, 4, 2 + i * 4, 3, 4); R(g, i % 2 ? P.st3 : P.r1, 6, 2 + i * 4, 1, 4); }
      for (let i = 0; i < 16; i++) R(g, P.ink, 7, 3 + i * 2, i % 4 === 0 ? 2 : 1, 1);
      R(g, P.i1, 2, 34, 8, 2); R(g, P.i2, 2, 34, 8, 1);
      if (snow) { R(g, P.sn2, 0, 33, 12, 3); R(g, P.sn3, 1, 33, 9, 1); R(g, P.sn3, 3, 0, 5, 1); }
    }),
    stake: () => spr('stake', 8, 18, (g, snow) => {
      R(g, P.wood1, 3, 3, 3, 15); R(g, P.wood3, 3, 3, 1, 15); R(g, P.wood5, 3, 2, 3, 1); R(g, P.wood6, 4, 2, 1, 1);
      if (snow) { R(g, P.sn3, 3, 1, 3, 1); R(g, P.sn2, 1, 16, 7, 2); }
    }),
    box: () => spr('box', 22, 17, (g, snow) => {
      R(g, P.rg0, 1, 3, 20, 13); R(g, P.rg1, 2, 4, 18, 11); R(g, P.rg2, 2, 4, 18, 2); R(g, P.rg3, 2, 4, 18, 1); R(g, P.rg0, 2, 7, 18, 1);
      R(g, P.y1, 3, 10, 16, 2); R(g, P.y0, 3, 11, 16, 1); R(g, P.i3, 10, 7, 2, 3); R(g, P.i4, 10, 7, 1, 1);
      R(g, P.white, 15, 5, 3, 1); R(g, P.white, 16, 4, 1, 3);
      R(g, P.i1, 2, 16, 3, 1); R(g, P.i1, 17, 16, 3, 1);
      if (snow) { R(g, P.sn3, 1, 2, 20, 1); R(g, P.sn2, 2, 3, 18, 1); }
    }),
    pack: () => spr('pack', 16, 12, (g, snow) => {
      R(g, P.f0, 1, 4, 14, 8); R(g, P.f1, 2, 4, 12, 7); R(g, P.f2, 2, 4, 12, 2); R(g, P.f0, 5, 7, 6, 4); R(g, P.f1, 6, 8, 4, 2);
      R(g, P.ink, 3, 5, 1, 6); R(g, P.ink, 12, 5, 1, 6);
      R(g, P.b1, 1, 1, 14, 4); R(g, P.b2, 1, 1, 14, 1); R(g, P.ink, 4, 1, 1, 4); R(g, P.ink, 11, 1, 1, 4); R(g, P.white, 13, 8, 2, 2);
      if (snow) { R(g, P.sn3, 2, 0, 5, 1); R(g, P.sn3, 9, 0, 3, 1); R(g, P.sn2, 0, 11, 16, 1); }
    }),
    tree: () => S.cached('ms_tree' + sn(), () => {
      const snow = sn(), cy = 12;
      const c = S.pix(58, 22, (x, y) => {
        const n = U.hashf(x, y, 51);
        // root plate standing on edge
        if (x < 9) { const rx = (x - 4) / 5, ry = (y - 11) / 10.5; if (rx * rx + ry * ry < 1 - n * 0.15) return snow && y < 3 ? P.sn2 : n < 0.25 ? P.d2 : n < 0.5 ? P.d0 : P.d1; return (y === 20 || y === 1) && x % 3 === 1 ? P.wood1 : null; }
        // crown: ragged boughs swept back from the tip, over the thin end of the trunk
        const d = Math.abs(y - cy), th = 3.6 - (x - 9) * 0.045;
        if (x >= 22 && !(x < 40 && d <= th * (x < 30 ? 1 : 0.5))) {
          const k = (x - 22) / 36, hh = 10.5 * (1 - k * 0.55) - (x > 54 ? (x - 54) * 2.2 : 0);
          const bough = Math.sin((x + d * 1.4) * 0.9) > -0.75;
          if (d < hh * (0.8 + n * 0.3) && bough) {
            if (snow && y < cy && (d > hh * 0.62 || n > 0.85)) return n > 0.4 ? P.sn3 : P.sn2;
            return y < cy ? (n > 0.6 ? P.g4 : n > 0.25 ? P.g3 : P.g2) : n > 0.7 ? P.g3 : n > 0.3 ? P.g2 : P.g1;
          }
        }
        // trunk, tapering toward the crown
        if (x < 46 && d <= th) { const top = y - cy < -th + 1.2; return snow && top && x < 30 ? P.sn3 : y - cy < -th + 2 ? P.wood3 : y - cy > th - 1 ? P.wood0 : (x + (y % 2) * 3) % 7 === 0 ? P.wood1 : P.wood2; }
        return null;
      });
      return c;
    }),
    rounds: () => spr('rounds', 30, 14, (g, snow) => {
      R(g, '#c9a27a', 6, 11, 18, 2);
      [[2, 3], [15, 5]].forEach(([x, y]) => { R(g, P.wood1, x, y, 12, 8); R(g, P.wood2, x, y, 10, 7); R(g, P.wood3, x, y, 10, 2); R(g, P.wood5, x + 9, y, 3, 8); R(g, P.wood6, x + 10, y + 2, 1, 4); R(g, P.wood4, x + 10, y + 3, 1, 2); });
      if (snow) { R(g, P.sn3, 3, 2, 8, 1); }
    }),
    snare: () => spr('snare', 14, 10, (g) => {
      R(g, P.wood1, 1, 1, 2, 9); R(g, P.wood3, 1, 1, 1, 9); R(g, P.i3, 3, 6, 3, 1);
      R(g, P.i4, 7, 3, 4, 1); R(g, P.i3, 7, 8, 4, 1); R(g, P.i3, 6, 4, 1, 4); R(g, P.i4, 11, 4, 1, 4); R(g, P.white, 8, 3, 1, 1);
    }),
    camera: () => spr('camera', 14, 24, (g, snow) => {
      R(g, P.wood1, 5, 10, 4, 14); R(g, P.wood2, 6, 10, 2, 14); R(g, P.wood3, 6, 10, 1, 14);
      R(g, P.rg0, 2, 3, 10, 10); R(g, P.rg1, 3, 4, 8, 8); R(g, P.rg2, 3, 4, 3, 2); R(g, P.d1, 8, 9, 3, 2); R(g, P.rg3, 9, 4, 2, 1);
      R(g, P.ink, 1, 8, 12, 1); R(g, P.i0, 5, 6, 4, 4); R(g, P.i3, 6, 7, 2, 2); R(g, P.i4, 6, 7, 1, 1); R(g, P.r0, 4, 11, 6, 1);
      if (snow) { R(g, P.sn3, 2, 2, 10, 1); }
    }),
    signUp: () => spr('signUp', 26, 26, (g, snow) => {
      R(g, P.wood1, 4, 13, 3, 13); R(g, P.wood1, 19, 13, 3, 13); R(g, P.wood2, 5, 13, 1, 13); R(g, P.wood2, 20, 13, 1, 13);
      R(g, P.wood0, 0, 1, 26, 15); R(g, P.wood4, 1, 2, 24, 13); R(g, P.wood5, 1, 2, 24, 1); R(g, P.wood3, 1, 8, 24, 1);
      text(g, 'KEEP', 5, 3); text(g, 'OUT', 7, 9);
      R(g, P.i3, 2, 3, 1, 1); R(g, P.i3, 23, 3, 1, 1); R(g, P.i3, 2, 13, 1, 1); R(g, P.i3, 23, 13, 1, 1);
      if (snow) { R(g, P.sn3, 0, 0, 26, 1); R(g, P.sn2, 1, 1, 24, 1); }
    }),
    signDown: () => spr('signDown', 30, 16, (g, snow) => {
      R(g, P.wood1, 22, 2, 3, 12); R(g, P.wood2, 23, 2, 1, 12); R(g, P.wood5, 22, 1, 3, 1);
      R(g, P.wood0, 1, 8, 24, 7); R(g, P.wood3, 2, 9, 22, 5); R(g, P.wood4, 2, 9, 22, 1); R(g, P.r1, 5, 11, 3, 1); R(g, P.r1, 10, 11, 4, 1); R(g, P.r1, 16, 11, 3, 1);
      R(g, P.wood1, 3, 4, 3, 5); R(g, P.wood5, 3, 4, 3, 1);
      if (snow) { R(g, P.sn3, 2, 8, 20, 1); R(g, P.sn2, 1, 14, 26, 2); }
    }),
    finder: () => spr('finder', 20, 24, (g) => {
      R(g, P.wood0, 3, 21, 14, 3); R(g, P.wood2, 4, 21, 12, 1); R(g, P.wood1, 8, 10, 4, 12); R(g, P.wood3, 8, 10, 1, 12);
      S.ellipse(g, P.y0, 10, 8, 9, 4.5); S.ellipse(g, P.bone, 10, 7.5, 7.5, 3.5);
      R(g, P.g4, 6, 6, 3, 2); R(g, P.d2, 11, 8, 3, 1); R(g, P.w3, 12, 6, 2, 1); R(g, P.ink, 10, 4, 1, 7); R(g, P.r2, 10, 7, 1, 1);
      R(g, P.i2, 1, 0, 1, 9); R(g, P.i2, 18, 0, 1, 9); R(g, P.i4, 1, 0, 1, 1); R(g, P.i4, 18, 0, 1, 1); R(g, P.i3, 2, 4, 16, 1);
    }),
  };
  // tiny 3x5 stencil letters for the warning sign
  const FONT = { K: ['1.1', '1.1', '11.', '1.1', '1.1'], E: ['111', '1..', '11.', '1..', '111'], P: ['11.', '1.1', '11.', '1..', '1..'], O: ['.1.', '1.1', '1.1', '1.1', '.1.'], U: ['1.1', '1.1', '1.1', '1.1', '111'], T: ['111', '.1.', '.1.', '.1.', '.1.'] };
  function text(g, str, x, y) { for (let i = 0; i < str.length; i++) { const f = FONT[str[i]]; if (f) for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (f[r][c] === '1') R(g, P.r1, x + i * 4 + c, y + r, 1, 1); } }

  function drawPart(g, o, p, t) {
    const x = p.x, y = p.y, ty = o.type, blink = Math.sin(t * 5 + x) > 0.2;
    switch (ty) {
      case 'breaker': shadow(g, x, y, 14); g.drawImage(SPR.breaker(), x - 8, y - 27);
        R(g, P.i0, x + 2, y - 28, 4, 3); R(g, p.ok ? P.g5 : blink ? P.r3 : P.r0, x + 3, y - 27, 2, 2); break;
      case 'gauge': shadow(g, x, y, 10); g.drawImage(SPR.gauge(), x - 6, y - 37); if (p.ok) R(g, P.f2, x + 1, y - 21, 2, 1); break;
      case 'markers': shadow(g, x, y, 6); g.drawImage(SPR.stake(), x - 4, y - 17);
        if (p.ok) { const fl = Math.sin(t * 6 + x) > 0 ? 1 : 0; R(g, P.f1, x - 1, y - 13, 3, 2); R(g, P.f2, x - 1, y - 13, 3, 1); R(g, P.f2, x + 2, y - 13 + fl, 4, 1); R(g, P.f1, x + 2, y - 11 + fl, 3, 1); R(g, P.f2, x + 5, y - 12 + fl, 2, 1); }
        else { R(g, P.pale0, x - 1, y - 12, 3, 1); R(g, P.pale0, x + 1, y - 11, 1, 3); }
        break;
      case 'restock': shadow(g, x, y, 22); g.drawImage(SPR.box(), x - 11, y - 16); break;
      case 'pack': shadow(g, x, y, 14); g.drawImage(SPR.pack(), x - 8, y - 11); break;
      case 'tree': if (p.ok) g.drawImage(SPR.rounds(), x - 15, y - 13); else { R(g, 'rgba(0,0,0,0.3)', x - 26, y - 2, 52, 3); g.drawImage(SPR.tree(), x - 29, y - 20); } break;
      case 'snares': g.drawImage(SPR.snare(), x - 7, y - 9); break;
      case 'camera': shadow(g, x, y, 10); g.drawImage(SPR.camera(), x - 7, y - 23); if (!p.ok && Math.sin(t * 3 + x) > 0.85) R(g, P.r3, x + 2, y - 19, 1, 1); break;
      case 'sign': if (p.ok) { shadow(g, x, y, 22); g.drawImage(SPR.signUp(), x - 13, y - 25); } else g.drawImage(SPR.signDown(), x - 15, y - 15); break;
      case 'tower': shadow(g, x, y, 16); g.drawImage(SPR.finder(), x - 10, y - 23); break;
    }
  }
  const SOLID = { breaker: [8, 4], gauge: [6, 3], restock: [20, 7], camera: [8, 4], tower: [12, 4] };

  // ------------------------------------------------------------- actions
  function partActions(o, p) {
    const s = st(), g = G(), t = T[o.type];
    if (o.status !== 'active' || p.ok) return [];
    const live = () => o.status === 'active' && !p.ok;
    const tick = (msg) => {
      p.ok = true;
      const k = partsDone(o), n = o.parts.length;
      if (k >= n && o.type !== 'pack') complete(o, msg);
      else { if (msg) g.msg(msg + (n > 1 ? ' (' + k + '/' + n + ')' : ''), 'good'); g.save('mission'); }
    };
    switch (o.type) {
      case 'breaker': return [{ label: 'Reset the breaker', time: 3.2, sound: 'rattle', every: 0.7, done: () => { if (!live()) return; g.sfx('beep', { vol: 0.6 }); tick('The relay hums back to life. The lamp turns green.'); } }];
      case 'gauge': return [{ label: 'Read the gauge', time: 1.6, sound: 'paper', every: 0.8, done: () => { if (!live()) return; const cm = Math.round(o.depth * (0.7 + s.weather.snow * 0.6)); o.reading = cm; tick('Snow depth ' + cm + ' cm. Logged for Base.'); } }];
      case 'markers': return [{ label: 'Tie a trail marker', time: 1.6, sound: 'rustle', every: 0.6, done: () => { if (!live()) return; tick('Blaze-orange marker tied.'); } }];
      case 'restock': {
        const ok = I.hasAll(s.inv, t.need);
        return [{ label: 'Restock (' + I.reqText(t.need, s.inv) + ')', time: 2, sound: 'open', every: 1, disabled: ok ? false : 'Need 2 Firewood and 1 Canned Beans in your pack', done: () => {
          if (!live() || !I.removeAll(s.inv, t.need)) return; tick('Shelter box stocked: firewood and a can of beans for whoever needs them.');
        } }, { label: 'Look inside', run: () => g.showText('Shelter box', 'An HQ emergency box, olive paint flaking. Inside: a wool blanket, matches in a jar, a logbook. The last entry is three weeks old: "Thank you. We made it out." The shelves for food and firewood are empty.') }];
      }
      case 'pack': return [{ label: 'Take the pack', time: 1.2, sound: 'rustle', every: 0.6, done: () => {
        if (!live()) return; p.ok = true; I.give('hq_pack', 1);
        g.msg('The tag reads "' + packOwner(o) + '". Take it back to the cabin.', 'good'); g.save('mission');
      } }];
      case 'tree': return [{ label: 'Clear the fallen pine', time: 5, sound: 'chop', every: 0.55, done: () => { if (!live()) return; g.sfx('wood_crack', { vol: 0.7 }); I.give('wood', 2); tick('The road is clear. You keep two logs.'); } }];
      case 'snares': return [{ label: 'Pull the snare', time: 1.4, sound: 'rattle', every: 0.5, done: () => { if (!live()) return; g.sfx('snare_snap', { vol: 0.7 }); tick('Snare pulled and coiled.'); } }];
      case 'camera': return [{ label: 'Pull the memory card', time: 2, sound: 'click', every: 0.6, done: () => {
        if (!live()) return; const txt = CAMERA[o.frame || 0];
        tick('Memory card recovered.');
        g.showText('Trail camera, last frames', txt); g.journal('Research camera at the Hollow Oak, last frames: ' + txt, 'sightings');
      } }];
      case 'sign': {
        const ok = I.count(s.inv, 'nails') >= 2;
        return [{ label: 'Nail the sign back up (2 Nails)', time: 3, sound: 'hammer', every: 0.5, disabled: ok ? false : 'Need 2 Nails', done: () => { if (!live() || !I.remove(s.inv, 'nails', 2)) return; tick('KEEP OUT, in red, facing the trail again.'); } }];
      }
      case 'tower': return [{ label: 'Take a bearing and radio it in', time: 3, sound: 'beep', every: 1, done: () => { if (!live()) return; g.sfx('radio_chirp', { vol: 0.7 }); tick('"Copy, Watch Seven. No smoke on your bearing. Base out."'); } }];
    }
    return [];
  }
  const PART_NAME = { breaker: ['Tripped breaker box', 'Breaker box (reset)'], gauge: ['Snow gauge', 'Snow gauge (read)'], markers: ['Trail junction stake', 'Trail marker (tied)'], restock: ['HQ shelter box', 'HQ shelter box (stocked)'],
    pack: ["A hiker's pack", "A hiker's pack"], tree: ['Fallen pine across the road', 'Sawn log rounds'], snares: ["Poacher's snare", 'Snare'], camera: ['Research trail camera', 'Research trail camera'], sign: ['Fallen KEEP OUT sign', 'KEEP OUT sign'], tower: ['Fire finder', 'Fire finder'] };
  function packOwner(o) { const r = U.rng(U.hash(st().seed, o.day, 919)); return D.FIRST[Math.floor(r() * D.FIRST.length)] + ' ' + D.LAST[Math.floor(r() * D.LAST.length)]; }
  const CAMERA = [
    'Frame 211, 02:40: the oak, the snow, nothing. Frame 212, 02:41: the snow around the oak is trampled in a perfect ring. Frame 213, 02:41: something pale fills the whole frame, too close to focus. The rest are black.',
    'Frame 88, 23:12: a deer, eyes white in the flash. Frame 89, 23:12: the same deer, standing on its hind legs. Frame 90, 23:13: no deer. Hoofprints lead up to the lens.',
    'Frame 140, 04:05: a man in a ranger jacket stands by the oak, facing away. Frame 141, 04:05: he is facing the camera. He has your face. Frame 142: black.',
    'Frame 302, 01:17: lantern light between the trees, moving toward your cabin. Frame 303, 01:30: the light is much closer to the camera. Nobody is holding it.',
    'Frame 57, 03:33: the camera has been turned to face the trunk of the oak. Someone has carved a small door into the bark. Frame 58: the door is open.',
  ];

  // ------------------------------------------------------------- hooks
  H.on('objects', (areaId) => {
    const m = peek(); if (!m || !m.orders.length) return;
    const s = st(), out = [];
    for (const o of m.orders) {
      const show = o.status === 'active' || (o.status === 'done' && o.end && o.end.day === s.time.day);
      if (!show) continue;
      for (const p of o.parts) {
        if (p.a !== areaId) continue;
        if (p.ok && (o.type === 'pack' || o.type === 'snares')) continue;
        const sz = SOLID[o.type] || (o.type === 'sign' && p.ok ? [20, 4] : null);
        const ob = { x: p.x, y: p.y, ms: o.id, draw: (g, t) => drawPart(g, o, p, t), name: () => PART_NAME[o.type][p.ok ? 1 : 0] + (o.status === 'active' && !p.ok ? ' — HQ order' : ''), actions: () => partActions(o, p) };
        if (sz) ob.solid = { x: p.x - sz[0] / 2, y: p.y - sz[1], w: sz[0], h: sz[1] };
        out.push(ob);
      }
    }
    return out;
  });

  H.on('mapMarks', (s) => {
    const out = [];
    active().forEach((o) => {
      let first = true;
      o.parts.forEach((p) => {
        if (p.ok) return;
        const a = mapArea(p.a), seen = s.world.visited[a] && D.AREAS[p.a];
        const label = first ? T[o.type].mark : '';
        let x = seen ? p.x : 240;
        if (D.areaXY(a)[0] === 4 && label) x = Math.min(x, Math.max(40, (90 - 12 - label.length * 5.6) * 16 / 3));
        out.push({ area: a, x, y: seen ? p.y : 136, label, color: o.pri ? '#a5352e' : '#1d5fa0' });
        first = false;
      });
      if (o.type === 'pack' && o.parts[0].ok) out.push({ area: 'f_2_2', x: 200, y: 200, label: 'Log pack', color: o.pri ? '#a5352e' : '#1d5fa0' });
    });
    return out;
  });

  function lineOf(o) {
    const s = st(), t = T[o.type], n = o.parts.length, k = partsDone(o);
    let where = areaName(o.parts.find((p) => !p.ok) ? o.parts.find((p) => !p.ok).a : o.parts[0].a);
    let what = t.short + (n > 1 ? ' ' + k + '/' + n : '');
    if (o.type === 'pack' && o.parts[0].ok) { what = 'Bring the pack'; where = 'cabin'; }
    return (o.pri ? '! ' : '') + what + ', ' + where + (o.due > s.time.day ? ' (tomorrow)' : '');
  }
  H.on('objectives', (obj) => {
    const act = active(); if (!act.length) return;
    const lines = act.map(lineOf);
    if (obj && obj.items) return { title: obj.title, items: obj.items.concat(lines).slice(0, 4) };
    return { title: 'HQ orders', items: lines.slice(0, 4) };
  });

  // ------------------------------------------------------------- desk tab
  UI.addStyle('.ms-pri{color:#a5352e;font-weight:bold;font-size:0.8em;letter-spacing:0.05em;margin-left:0.4em}.ms-ok{color:#3d6b43;font-weight:bold}.ms-bad{color:#a5352e;font-weight:bold}.ms-dim{opacity:0.75}.ms-sub{font-size:0.88em;opacity:0.85}');
  const esc = U.escape;
  function orderHTML(o, s) {
    const t = T[o.type], n = o.parts.length, k = partsDone(o);
    let h = '<div class="entry' + (o.status === 'active' ? '' : ' ms-dim') + '"><div class="when">Issued day ' + o.day + (o.status === 'active' ? ' · due ' + dueTxt(o) : ' · ' + (o.status === 'done' ? 'done' : o.status) + ' day ' + (o.end ? o.end.day + ' ' + U.fmtClock(o.end.min) : '?')) + '</div>';
    h += '<b>' + esc(t.title) + '</b>' + (o.pri ? '<span class="ms-pri">PRIORITY</span>' : '') + '<br>';
    if (o.status === 'active') {
      const places = Array.from(new Set(o.parts.map((p) => p.a)));
      h += '<span class="ms-sub">' + esc(t.brief(o)) + '.</span><br>';
      h += '<span class="ms-sub">' + places.map((a) => esc(MS.directions(a))).join(' ') + '</span><br>';
      if (n > 1) h += '<span class="ms-sub">Progress: ' + k + ' of ' + n + '.</span><br>';
      if (o.type === 'pack' && o.parts[0].ok) h += '<span class="ms-sub">You have the pack. Bring it into the cabin to log it.</span><br>';
      if (t.need) h += '<span class="ms-sub">Bring: ' + esc(I.reqText(t.need, s.inv)) + '.</span><br>';
      h += '<span class="ms-sub">Reward: ' + esc(itemsTxt(rewardOf(o).concat(o.pri ? [['canned', 1]] : []))) + ' to the cabin chest' + (o.pri ? ', and Base\'s good opinion' : '') + '.</span>';
      if (o.pri) h += '<br><span class="ms-sub ms-bad">Failing a priority order costs you standing.</span>';
    } else h += '<span class="' + (o.status === 'done' ? 'ms-ok' : 'ms-bad') + '">' + esc(o.status === 'done' ? 'Done.' : o.status === 'failed' ? 'Failed.' : 'Lapsed.') + '</span> ' + esc(o.note || '') + (o.reading ? ' Reading: ' + o.reading + ' cm.' : '');
    return h + '</div>';
  }
  UI.registerDeskTab('ms_orders', 'HQ orders', (s) => {
    const m = peek(), os = m ? m.orders : [];
    const act = os.filter((o) => o.status === 'active'), done = os.filter((o) => o.status === 'done'), bad = os.filter((o) => o.status === 'failed' || o.status === 'lapsed');
    const sm = MS.summary();
    let h = '<h3>Active orders</h3>' + (act.length ? act.map((o) => orderHTML(o, s)).join('') : '<div class="hint">' + (s.time.day < 2 ? 'Base issues field orders from day 2, with the 07:00 report.' : 'No open orders. New ones come with the 07:00 report.') + '</div>');
    if (done.length) h += '<h3>Completed</h3>' + done.slice(-6).reverse().map((o) => orderHTML(o, s)).join('');
    if (bad.length) h += '<h3>Failed or lapsed</h3>' + bad.slice(-6).reverse().map((o) => orderHTML(o, s)).join('');
    h += '<div class="hint">Record: ' + sm.done + ' done, ' + sm.failed + ' missed, of ' + sm.total + '. Orders are due at dusk. Rewards go to the storage chest. Open orders are marked on the map.</div>';
    return h;
  });
})(window.NW);
