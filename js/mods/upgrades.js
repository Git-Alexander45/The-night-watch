'use strict';
// Cabin upgrades: a workbench in the storage room, ten projects built from salvage with time and labour,
// each with a real effect through the survival / night filters and a visible change in the cabin.
(function (NW) {
  const U = NW.U, D = NW.D, S = NW.S, I = NW.Inv, H = NW.Hooks, UI = NW.UI;
  const P = S.P, R = S.R;
  const G = () => NW.G;
  const st = () => NW.G.state;
  const UP = NW.Upgrades = {};

  const mod = () => NW.mod('upgrades', () => ({ v: 1, built: {}, proj: null, rack: [], warn: null }));
  const peek = () => { const s = NW.G && NW.G.state; return s && s.mods && s.mods.upgrades; }; // no lazy init in per-frame hooks
  UP.state = mod;

  // ============================================================== PROJECTS
  // work: seconds of hands-on work at the bench (game time keeps running while you work)
  const LIST = [
    { id: 'woodbox', name: 'Bigger wood box', cost: { plank: 2, nails: 4 }, work: 10,
      desc: 'Raise the sides and add a second bay to the wood box by the stove.', fx: 'Wood box holds 8 more logs.' },
    { id: 'damper', name: 'Stove damper', cost: { scrap: 1, nails: 2 }, work: 10,
      desc: 'A flap valve in the stove pipe to choke the draught.', fx: 'The stove burns 15% less wood.' },
    { id: 'firebox', name: 'Larger firebox', cost: { scrap: 2, nails: 4 }, work: 16, req: 'damper',
      desc: 'Rivet an iron collar into the stove and line it deeper.', fx: 'The stove takes 2 more logs.' },
    { id: 'insulation', name: 'Insulated walls', cost: { plank: 2, cloth: 3, nails: 6 }, work: 22,
      desc: 'Stuff the gaps between the logs with rag and batten them over.', fx: 'The cabin stays 3°C warmer.' },
    { id: 'curtains', name: 'Heavy curtains', cost: { cloth: 3, rope: 1 }, work: 12,
      desc: 'Wool blankets sewn behind the curtains, hung on a pelmet.', fx: 'Drawn curtains let out less than half the light.' },
    { id: 'reflectors', name: 'Lamp reflectors', cost: { scrap: 1, glass: 1, nails: 2 }, work: 12,
      desc: 'Hammered tin dishes behind every lamp throw the light back into the room.', fx: 'Lamps burn 40% less oil.' },
    { id: 'bars', name: 'Steel door bars', cost: { scrap: 2, rope: 1, nails: 4 }, work: 16,
      desc: 'Iron brackets and a steel bar across both doors.', fx: 'Claws do 40% less damage to the doors.' },
    { id: 'shutters', name: 'Iron-banded shutters', cost: { scrap: 3, plank: 2, nails: 6 }, work: 20, req: 'bars',
      desc: 'Iron straps bolted across every shutter.', fx: 'Closed shutters take 45% less damage from the Light Hunter.' },
    { id: 'alarm', name: 'Tin-can alarm line', cost: { rope: 2, scrap: 1, nails: 2 }, work: 14,
      desc: 'Empty tins on a wire along the eaves and the paths to both doors.', fx: 'The cans rattle before anything reaches a door.' },
    { id: 'smoker', name: 'Smoking rack', cost: { plank: 1, rope: 1, nails: 3 }, work: 12,
      desc: 'A rack over the stove pipe to smoke raw meat.', fx: 'Hang raw meat over the lit stove; it becomes jerky.' },
  ];
  const BY = {}; LIST.forEach((u) => { BY[u.id] = u; });
  UP.LIST = LIST;

  UP.has = (id) => { const m = peek(); return !!(m && m.built && m.built[id]); };
  UP.built = () => { const m = peek(); return m && m.built ? LIST.map((u) => u.id).filter((id) => m.built[id]) : []; };

  // ============================================================== ITEMS
  D.ITEMS.jerky = D.ITEMS.jerky || { name: 'Smoked Jerky', stack: 8, kind: 'food', desc: 'Meat smoked dark and hard over the stove. Light, tough, keeps all winter.', food: 22, heal: 2 };
  if (D.FOOD_ORDER && D.FOOD_ORDER.indexOf('jerky') < 0) { const i = D.FOOD_ORDER.indexOf('roast_mush'); D.FOOD_ORDER.splice(i < 0 ? D.FOOD_ORDER.length : i, 0, 'jerky'); }
  S.registerIcon('jerky', (g) => {
    [[2, 3, 4, 11], [7, 2, 3, 12], [11, 4, 3, 9]].forEach(([x, y, w, h]) => { R(g, P.wood1, x, y, w, h); R(g, P.r0, x + 1, y + 1, w - 1, h - 2); R(g, P.wood3, x, y, 1, h); R(g, P.y0, x + 1, y + 2, 1, 2); });
  });
  // plan icons (shown in the workbench panel)
  const ICONS = {
    woodbox: (g) => { R(g, P.wood2, 1, 6, 14, 8); R(g, P.wood3, 1, 6, 14, 1); R(g, P.wood1, 8, 7, 1, 7); for (let i = 0; i < 6; i++) { R(g, P.wood2, 2 + (i % 3) * 4, 3 + Math.floor(i / 3) * 3, 4, 3); R(g, P.wood5, 3 + (i % 3) * 4, 3 + Math.floor(i / 3) * 3, 2, 2); } },
    damper: (g) => { R(g, P.i1, 6, 0, 5, 16); R(g, P.i2, 6, 0, 1, 16); R(g, P.i3, 4, 7, 9, 2); R(g, P.i4, 12, 6, 3, 1); R(g, P.r2, 13, 5, 2, 3); },
    firebox: (g) => { R(g, P.i1, 1, 4, 14, 11); R(g, P.i2, 1, 4, 14, 2); R(g, P.ink, 3, 7, 10, 6); R(g, P.f1, 4, 10, 8, 3); R(g, P.f3, 6, 11, 4, 2); for (let i = 0; i < 5; i++) R(g, P.i4, 2 + i * 3, 5, 1, 1); },
    insulation: (g) => { for (let y = 1; y < 16; y += 5) { R(g, P.log2, 0, y, 16, 4); R(g, P.log3, 0, y, 16, 1); } R(g, P.bone, 0, 5, 16, 1); R(g, P.bone, 0, 10, 16, 1); R(g, P.wood5, 7, 0, 2, 16); },
    curtains: (g) => { R(g, P.wood1, 0, 1, 16, 2); for (let i = 0; i < 16; i++) R(g, i % 3 ? P.r1 : P.r0, i, 3, 1, 12); R(g, P.y1, 0, 3, 16, 1); },
    reflectors: (g) => { R(g, P.st3, 2, 3, 12, 11); R(g, P.st4, 3, 4, 10, 9); R(g, P.white, 4, 5, 2, 2); R(g, P.ice1, 6, 6, 4, 6); R(g, P.f3, 7, 8, 2, 3); R(g, P.i2, 6, 5, 4, 1); },
    bars: (g) => { R(g, P.wood3, 3, 0, 10, 16); for (let i = 0; i < 4; i++) R(g, P.wood2, 3, 2 + i * 4, 10, 1); R(g, P.i1, 0, 7, 16, 3); R(g, P.i3, 0, 7, 16, 1); R(g, P.i2, 1, 5, 2, 7); R(g, P.i2, 13, 5, 2, 7); },
    shutters: (g) => { for (let y = 1; y < 15; y += 3) { R(g, P.wood3, 1, y, 14, 2); R(g, P.wood1, 1, y + 2, 14, 1); } R(g, P.i1, 1, 3, 14, 2); R(g, P.i1, 1, 10, 14, 2); [2, 7, 12].forEach((x) => { R(g, P.i4, x, 3, 1, 1); R(g, P.i4, x, 10, 1, 1); }); },
    alarm: (g) => { R(g, P.d3, 0, 3, 16, 1); [[2, 5], [7, 6], [12, 5]].forEach(([x, y]) => { R(g, P.d3, x + 1, 4, 1, y - 4); R(g, P.st3, x, y, 3, 5); R(g, P.st4, x, y, 1, 5); R(g, P.r2, x, y + 2, 3, 1); }); },
    smoker: (g) => { R(g, P.wood3, 0, 2, 16, 2); R(g, P.wood4, 0, 2, 16, 1); [2, 6, 10].forEach((x) => { R(g, P.i3, x + 1, 4, 1, 2); R(g, P.r1, x, 6, 3, 7); R(g, P.wood1, x, 10, 3, 3); }); R(g, 'rgba(180,185,195,0.6)', 13, 6, 2, 2); R(g, 'rgba(180,185,195,0.4)', 12, 10, 2, 2); },
  };
  for (const id in ICONS) S.registerIcon('up_' + id, ICONS[id]);

  // ============================================================== MATERIALS
  // The bench sits next to the storage chest: materials come from the pack first, then the chest.
  const have = (id) => { const s = st(); return I.count(s.inv, id) + I.count(s.chest, id); };
  const canPay = (cost) => Object.keys(cost).every((id) => have(id) >= cost[id]);
  function pay(cost) {
    if (!canPay(cost)) return false;
    const s = st();
    for (const id in cost) { const a = Math.min(cost[id], I.count(s.inv, id)); if (a) I.remove(s.inv, id, a); if (cost[id] - a) I.remove(s.chest, id, cost[id] - a); }
    return true;
  }
  function refund(cost) {
    const s = st();
    for (const id in cost) { let left = I.add(s.chest, id, cost[id]); if (left) left = I.add(s.inv, id, left); if (left) G().dropItem(id, left); }
  }
  const costHTML = (cost) => Object.keys(cost).map((id) => { const n = have(id), ok = n >= cost[id]; return '<span class="up-mat' + (ok ? '' : ' short') + '">' + UI.h.icon(id) + cost[id] + ' ' + UI.h.esc(D.ITEMS[id].name) + ' <i>(' + n + ')</i></span>'; }).join('');

  // status: built | active | locked | ready | short
  function status(u) {
    const m = mod();
    if (m.built[u.id]) return 'built';
    if (m.proj && m.proj.id === u.id) return 'active';
    if (u.req && !m.built[u.req]) return 'locked';
    return canPay(u.cost) ? 'ready' : 'short';
  }
  const STATUS_TXT = { built: 'Built', active: 'In progress', locked: 'Locked', ready: 'Can build', short: 'Missing materials' };
  const workMin = (u) => Math.round(u.work * D.DAY_SPEED / 5) * 5;

  // ============================================================== BUILDING
  const BENCH = { x: 194, y: 104, cx: 194, cy: 108, cw: 44, ch: 22, sy: 130, solid: { x: 196, y: 117, w: 42, h: 13 } };
  let holdBase = 0;
  const pct = (m) => (m.proj ? Math.floor(U.clamp(m.proj.prog / BY[m.proj.id].work, 0, 0.99) * 100) : 0);
  function workDone() {
    const m = mod(); if (!m.proj) return;
    const u = BY[m.proj.id]; if (!u) { m.proj = null; return; }
    m.built[u.id] = st().time.day; m.proj = null;
    const g = G();
    g.sfx('build_done'); g.sfx('hammer', { vol: 0.5 });
    g.msg(u.name + ' finished. ' + u.fx, 'good');
    g.journal(u.name + ' finished at the workbench. ' + u.fx, 'notes');
    g.stat('upgrades', 1);
    H.emit('upgradeBuilt', u.id);
    g.refreshColliders();
    UI.refresh('upgrades');
    g.save('upgrade');
  }
  function workAction() {
    const m = mod(); const u = m.proj && BY[m.proj.id]; if (!u) return null;
    const left = Math.max(0.5, u.work - m.proj.prog);
    return { label: 'Work on: ' + u.name + ' (' + pct(m) + '%)', time: left, sound: m.proj.prog / u.work < 0.45 ? 'sawing' : 'hammer', every: m.proj.prog / u.work < 0.45 ? 1.3 : 0.9, done: workDone };
  }
  // Start (or continue) working at the bench: the hold stops when the player walks away; progress is kept.
  function beginWork() {
    const g = G(), a = workAction(); if (!a) return false;
    if (g.area.id !== 'room_storage') return false;
    const p = st().player;
    if (U.distToRect(p.x, p.y - 5, { x: BENCH.cx, y: BENCH.cy, w: BENCH.cw, h: BENCH.ch }) > 24) { g.msg('Stand at the workbench to work on it.', 'warn'); return false; }
    holdBase = mod().proj.prog;
    g.hold = { label: a.label, time: a.time, t: 0, done: a.done, obj: benchObj, focusObj: benchObj, sound: a.sound, every: a.every, sndT: 0 };
    g.sfx('click');
    return true;
  }
  UP.start = function (id) {
    const m = mod(), u = BY[id], g = G();
    if (!u || m.built[id]) return false;
    if (m.proj && m.proj.id !== id) { g.msg('Finish or shelve the ' + BY[m.proj.id].name.toLowerCase() + ' first.', 'warn'); return false; }
    if (!m.proj) {
      if (u.req && !m.built[u.req]) { g.msg('Needs ' + BY[u.req].name.toLowerCase() + ' first.', 'warn'); return false; }
      if (!pay(u.cost)) { g.msg('Not enough materials for the ' + u.name.toLowerCase() + '.', 'warn'); g.sfx('dryfire'); return false; }
      m.proj = { id, prog: 0 };
      g.sfx('thud'); g.msg('Materials laid out on the bench: ' + u.name.toLowerCase() + '.');
    }
    return true;
  };
  UP.shelve = function () {
    const m = mod(); if (!m.proj) return;
    const u = BY[m.proj.id]; m.proj = null;
    if (G().hold && G().hold.done === workDone) G().hold = null;
    if (u) { refund(u.cost); G().msg('Project shelved. Materials back in the chest.'); }
  };
  // Finish instantly (tests and the debug console only)
  UP.complete = function (id) { const m = mod(); if (!BY[id] || m.built[id]) return; m.proj = { id, prog: BY[id].work }; workDone(); };

  // ============================================================== EFFECTS
  H.on('cap', (v, k) => {
    if (k === 'WOODBOX_CAP' && UP.has('woodbox')) return v + 8;
    if (k === 'STOVE_CAP' && UP.has('firebox')) return v + 20;
    return undefined;
  });
  H.on('cabinHeat', (t) => (UP.has('insulation') ? t + 3 : undefined));
  H.on('stoveBurn', (b) => (UP.has('damper') ? b * 0.85 : undefined));
  H.on('lhDamage', (m, wid) => {
    if (!UP.has('shutters')) return undefined;
    const w = st().cabin.windows[wid];
    return w && w.boarded <= 0 && w.shutClosed && w.shutter > 0 ? m * 0.55 : undefined;
  });
  H.on('clawDamage', (hp) => (UP.has('bars') ? hp * 0.6 : undefined));
  // heavy curtains: a drawn curtain lets 15% of the room light through instead of 35%
  H.on('leak', (leak, L) => {
    if (!UP.has('curtains') || !L || !L.winLeak) return undefined;
    const s = st(); let cut = 0;
    for (const wid in s.cabin.windows) {
      const w = s.cabin.windows[wid];
      if (!w.curtClosed || w.boarded > 0) continue;
      const before = L.winLeak[wid] || 0, after = before * (0.15 / 0.35);
      L.winLeak[wid] = after; cut += before - after;
    }
    return cut ? Math.max(0, leak - cut) : undefined;
  });

  // ============================================================== UPDATE
  const LEAD = 22; // night minutes of warning the alarm line gives
  let rattleUntil = 0;
  H.on('update', (dt, gm) => {
    const m = peek(); if (!m) return;
    const s = st(), g = G();
    // progress of the current hold at the bench
    if (m.proj && g.hold && g.hold.done === workDone) m.proj.prog = Math.min(BY[m.proj.id].work, holdBase + g.hold.t);
    // reflectors: lamps burn 40% less oil (the core has already burned the full amount this step)
    if (m.built.reflectors && s.oil > 0) {
      let on = 0; for (const r in s.lamps) if (s.lamps[r]) on++;
      if (on) s.oil = Math.min(D.OIL_CAP, s.oil + D.LAMP_OIL_PER_HOUR * on * gm / 60 * 0.4);
    }
    // smoking rack: meat smokes while the stove burns
    if (m.rack && m.rack.length && NW.Survival.stoveLit()) {
      let fin = false;
      m.rack.forEach((r) => { if (r.t < SMOKE_MIN) { r.t += gm; if (r.t >= SMOKE_MIN) fin = true; } });
      if (fin) g.msg('The meat on the smoking rack has cured dark and dry.', 'good');
    }
    if (m.built.alarm && s.night.active) alarmCheck(m, s, g);
  });
  function alarmCheck(m, s, g) {
    const n = s.night, p = n.plan; if (!p || !p.done) return;
    if (!m.warn || m.warn.n !== n.n) m.warn = { n: n.n, k: {} };
    const nm = NW.Night.nightMin();
    const ring = (key, at, door, text) => {
      if (m.warn.k[key] || p.done[key] || nm < at - LEAD || nm >= at) return;
      m.warn.k[key] = 1; rattleUntil = g.t + 5;
      g.sfxCabin('rattle', 'door:' + door, { vol: 0.55 });
      g.msg(text, 'warn');
    };
    (p.scratcher || []).forEach((sc, i) => ring('s' + i, sc.at, sc.door, 'The tin cans rattle by the ' + sc.door + ' door. Something low is coming through the snow.'));
    (p.visitors || []).forEach((v, i) => ring('v' + i, v.at, 'front', 'Cans clink on the porch line. Someone is coming up the path.'));
  }

  // ============================================================== SMOKING RACK
  const SMOKE_MIN = 180, RACK_SLOTS = 4;
  const rawMeat = () => { const inv = st().inv; const ids = ['raw_venison', 'raw_rabbit'].concat(Object.keys(D.ITEMS).filter((k) => /^raw_/.test(k) && k !== 'raw_venison' && k !== 'raw_rabbit')); return ids.find((id) => I.count(inv, id) > 0) || null; };
  const yieldOf = (id) => ((D.ITEMS[id] && D.ITEMS[id].food >= 10) ? 2 : 1);
  function rackActions() {
    const m = mod(), s = st(), g = G();
    const a = [];
    const meat = rawMeat(), n = m.rack.length;
    const ready = m.rack.filter((r) => r.t >= SMOKE_MIN);
    a.push({ label: 'Hang meat on the smoking rack (' + n + '/' + RACK_SLOTS + ')' + (meat ? ': ' + D.ITEMS[meat].name : ''), run: () => {
      I.remove(s.inv, meat, 1); m.rack.push({ id: meat, t: 0 }); g.sfx('pickup'); g.msg(D.ITEMS[meat].name + ' hung over the stove. Keep the fire going.');
    }, disabled: n >= RACK_SLOTS ? 'The rack is full' : !meat ? 'No raw meat in your pack' : false });
    if (ready.length) {
      const k = ready.reduce((t, r) => t + yieldOf(r.id), 0);
      a.push({ label: 'Take jerky (' + k + ')', run: () => {
        let got = 0; // what does not fit in the pack stays on the rack
        m.rack = m.rack.filter((r) => { const y = yieldOf(r.id); if (r.t < SMOKE_MIN || I.space(s.inv, 'jerky') < y) return true; I.add(s.inv, 'jerky', y); got += y; return false; });
        if (!got) return g.msg('No room in your pack.', 'warn');
        g.sfx('pickup'); g.msg('+' + got + ' ' + D.ITEMS.jerky.name, 'item');
      }, disabled: I.space(s.inv, 'jerky') < 1 ? 'No room in your pack' : false });
    }
    return a;
  }
  H.on('actions', (list, o, a) => {
    if (!a || a.id !== 'room_main' || o.type !== 'stove' || !UP.has('smoker')) return undefined;
    return list.concat(rackActions());
  });

  // ============================================================== SPRITES
  const bench = () => S.cached('up_bench', () => S.mk(44, 30, (g) => {
    R(g, 'rgba(0,0,0,0.32)', 2, 25, 42, 5);
    // back legs and lower shelf
    R(g, P.wood1, 4, 12, 3, 14); R(g, P.wood1, 37, 12, 3, 14);
    R(g, P.wood2, 3, 20, 38, 3); R(g, P.wood3, 3, 20, 38, 1);
    R(g, P.wood4, 8, 18, 16, 2); R(g, P.wood5, 8, 18, 16, 1); R(g, P.wood3, 10, 16, 12, 2); R(g, P.wood5, 10, 16, 12, 1);
    R(g, P.st2, 28, 16, 6, 4); R(g, P.st3, 28, 16, 6, 1); R(g, P.i1, 35, 17, 3, 3);
    // top
    R(g, P.wood4, 0, 4, 44, 8); R(g, P.wood5, 0, 4, 44, 1); R(g, P.wood3, 0, 7, 44, 1); R(g, P.wood3, 0, 10, 44, 1);
    R(g, P.wood2, 0, 11, 44, 3); R(g, P.wood1, 0, 13, 44, 1);
    for (let i = 0; i < 5; i++) R(g, P.wood1, 3 + i * 9, 12, 1, 1);
    // front legs
    R(g, P.wood2, 1, 14, 3, 13); R(g, P.wood3, 1, 14, 1, 13); R(g, P.wood2, 40, 14, 3, 13); R(g, P.wood3, 40, 14, 1, 13);
    // vise on the left end
    R(g, P.i2, 1, 2, 8, 5); R(g, P.i3, 1, 2, 8, 1); R(g, P.i0, 4, 2, 1, 5); R(g, P.i1, 1, 6, 8, 1); R(g, P.i4, 0, 8, 10, 1); R(g, P.i3, 0, 7, 1, 3); R(g, P.i3, 9, 7, 1, 3);
    // saw, hammer, nail tin, shavings
    R(g, P.i3, 13, 6, 12, 2); R(g, P.i4, 13, 6, 12, 1); for (let i = 0; i < 6; i++) R(g, P.i2, 14 + i * 2, 8, 1, 1); R(g, P.wood2, 25, 5, 4, 4); R(g, P.wood1, 26, 6, 2, 2);
    R(g, P.wood3, 31, 8, 7, 1); R(g, P.i2, 37, 6, 3, 4); R(g, P.i3, 37, 6, 3, 1);
    R(g, P.st2, 32, 1, 5, 5); R(g, P.st4, 32, 1, 5, 1); R(g, P.i4, 33, 2, 3, 1); R(g, P.r2, 32, 4, 5, 1);
    [[11, 9], [27, 10], [30, 5], [21, 10]].forEach(([x, y]) => R(g, P.wood6, x, y, 1, 1));
  }));

  // ---- workbench object (storage room)
  const benchObj = {
    m3d: 'up:bench', x: BENCH.x + 22, y: BENCH.y + 24, sy: BENCH.sy, cx: BENCH.cx, cy: BENCH.cy, cw: BENCH.cw, ch: BENCH.ch, solid: BENCH.solid,
    draw(g, t) {
      g.drawImage(bench(), BENCH.x, BENCH.y);
      const m = peek(), p = m && m.proj;
      if (p) { // the project laid out on the bench
        const k = U.clamp(p.prog / BY[p.id].work, 0, 1);
        R(g, P.wood5, BENCH.x + 12, BENCH.y + 1, 18, 3); R(g, P.wood6, BENCH.x + 12, BENCH.y + 1, 18, 1);
        R(g, P.i1, BENCH.x + 14, BENCH.y + 2, 1, 1); R(g, P.i1, BENCH.x + 27, BENCH.y + 2, 1, 1);
        R(g, P.g4, BENCH.x + 12, BENCH.y - 1, Math.round(18 * k), 1);
        const h = G().hold;
        if (h && h.done === workDone && Math.sin(t * 14) > 0.6) R(g, P.f4, BENCH.x + 14 + Math.round(Math.random() * 14), BENCH.y + 1, 1, 1);
      }
    },
    name: () => { const m = peek(); return 'Workbench' + (m && m.proj ? ' — ' + BY[m.proj.id].name + ' ' + pct(m) + '%' : ''); },
    actions: () => {
      const m = mod(), a = [{ label: 'Look over the plans', run: () => G().openUI('upgrades') }];
      const w = workAction(); if (w) a.unshift(w);
      return a;
    },
  };

  // ---- decorations that show what was built (never focusable: interaction rect far away)
  const deco = (sy, draw, solid, m3d) => ({ m3d, x: -999, y: -999, sy, cx: -999, cy: -999, cw: 1, ch: 1, draw, solid, name: null, actions: () => [] });
  const WIN_RECT = (o) => (o.side === 'top' ? { gx: o.x + 5, gy: o.y + 9, gw: 22, gh: 17 } : { gx: o.x + 3, gy: o.y + 4, gw: 26, gh: 8 });
  function drawWindowUpgrades(g, area) {
    const s = st();
    for (const o of area.objs) {
      if (o.type !== 'window') continue;
      const w = s.cabin.windows[o.wid]; if (!w || w.boarded > 0) continue;
      const r = WIN_RECT(o);
      if (UP.has('shutters') && w.shutClosed && w.shutter > 0 && !w.curtClosed) {
        const ys = r.gh > 10 ? [r.gy + 3, r.gy + r.gh - 5] : [r.gy + 1, r.gy + r.gh - 3];
        ys.forEach((y) => { R(g, P.i1, r.gx, y, r.gw, 2); R(g, P.i2, r.gx, y, r.gw, 1); for (let x = r.gx + 2; x < r.gx + r.gw; x += 6) R(g, P.i4, x, y, 1, 1); });
      }
      if (UP.has('curtains')) {
        R(g, P.r0, r.gx - 4, r.gy - 5, r.gw + 8, 2); R(g, P.y0, r.gx - 4, r.gy - 3, r.gw + 8, 1);
        if (w.curtClosed) { g.fillStyle = S.rgba(P.r0, 0.45); g.fillRect(r.gx - 2, r.gy - 2, r.gw + 4, r.gh + 3); for (let x = r.gx; x < r.gx + r.gw; x += 4) R(g, P.r0, x, r.gy - 2, 1, r.gh + 3); }
        else { R(g, P.r0, r.gx - 5, r.gy - 2, 2, r.gh + 3); R(g, P.r0, r.gx + r.gw + 3, r.gy - 2, 2, r.gh + 3); R(g, P.y1, r.gx - 5, r.gy + Math.floor(r.gh / 2), 3, 1); R(g, P.y1, r.gx + r.gw + 2, r.gy + Math.floor(r.gh / 2), 3, 1); }
      }
    }
  }
  function drawDoorBars(g, area) {
    const s = st();
    for (const o of area.objs) {
      if (o.type !== 'door') continue;
      const d = s.cabin.doors[o.did]; if (!d || d.open || d.hp <= 0 || (NW.G.doorAnim[o.did] || 0) > 0) continue;
      if (o.side === 'bottom') { R(g, P.i1, o.x, o.y + 2, 32, 2); R(g, P.i3, o.x, o.y + 2, 32, 1); R(g, P.i2, o.x - 1, o.y + 1, 3, 4); R(g, P.i2, o.x + 30, o.y + 1, 3, 4); R(g, P.i4, o.x, o.y + 2, 1, 1); R(g, P.i4, o.x + 31, o.y + 2, 1, 1); }
      else { R(g, P.i1, o.x + 10, o.y + 1, 2, 30); R(g, P.i3, o.x + 10, o.y + 1, 1, 30); R(g, P.i2, o.x + 9, o.y + 2, 4, 3); R(g, P.i2, o.x + 9, o.y + 27, 4, 3); }
    }
  }
  function drawReflector(g, o) {
    const x = o.x, y = o.y + (o.style === 'wall' ? 4 : 2);
    R(g, P.st3, x + 1, y, 2, 8); R(g, P.st3, x + 7, y, 2, 8); R(g, P.st4, x + 1, y + 1, 1, 6); R(g, P.st4, x + 8, y + 1, 1, 6); R(g, P.st2, x + 2, y - 1, 6, 1);
  }
  const wallDeco = deco(-1000, (g) => {
    const a = G().area;
    drawWindowUpgrades(g, a);
    if (UP.has('bars')) drawDoorBars(g, a);
    if (UP.has('reflectors')) a.objs.forEach((o) => { if (o.type === 'lamp' && o.style === 'wall') drawReflector(g, o); });
  }, undefined, 'up:wall');
  const tableLampDeco = deco(120.5, (g) => { const o = G().area.objs.find((q) => q.type === 'lamp' && q.style !== 'wall'); if (o) drawReflector(g, o); }, undefined, 'up:tablelamp');
  // stove fittings: damper on the pipe, iron collar on a deeper firebox
  const stoveDeco = deco(64.5, (g) => {
    const o = G().area.objs.find((q) => q.type === 'stove'); if (!o) return;
    if (UP.has('damper')) { R(g, P.i3, o.x + 11, o.y + 9, 10, 2); R(g, P.i4, o.x + 11, o.y + 9, 10, 1); R(g, P.i2, o.x + 21, o.y + 9, 3, 1); R(g, P.r2, o.x + 23, o.y + 8, 2, 3); }
    if (UP.has('firebox')) { R(g, P.i3, o.x + 2, o.y + 19, 28, 1); for (let x = 4; x < 30; x += 4) R(g, P.i4, o.x + x, o.y + 19, 1, 1); R(g, P.i2, o.x + 5, o.y + 21, 22, 1); }
  }, undefined, 'up:stove');
  // bigger wood box: a second bay to the right, logs counted across both
  const WB = { x: 18, y: 48 };
  const boxExt = () => S.cached('up_boxext', () => S.mk(30, 22, (g) => {
    R(g, 'rgba(0,0,0,0.3)', 1, 18, 29, 4);
    R(g, P.wood2, 1, 4, 28, 16); R(g, P.wood3, 1, 4, 28, 2); R(g, P.wood1, 1, 19, 28, 1); R(g, P.wood1, 19, 6, 1, 13);
    R(g, P.wood3, 0, 2, 2, 18); R(g, P.wood3, 28, 2, 2, 18); R(g, P.wood4, 0, 2, 2, 1); R(g, P.wood4, 28, 2, 2, 1);
    R(g, P.i2, 5, 12, 2, 2); R(g, P.i2, 23, 12, 2, 2);
  }));
  const boxDeco = deco(64.6, (g) => {
    const s = st(), n = Math.min(s.woodbox, 30);
    g.drawImage(boxExt(), WB.x - 1, WB.y - 4);
    for (let i = 0; i < n; i++) { const col = i % 6, row = Math.floor(i / 6); R(g, P.wood2, WB.x + 2 + col * 4, WB.y + 5 - row * 3, 4, 3); R(g, P.wood5, WB.x + 3 + col * 4, WB.y + 5 - row * 3, 2, 2); }
  }, { x: WB.x + 18, y: WB.y + 6, w: 10, h: 10 }, 'up:box');
  // smoking rack across the stove pipe
  const rackDeco = deco(64.7, (g) => {
    const o = G().area.objs.find((q) => q.type === 'stove'); if (!o) return;
    const m = peek(), rk = (m && m.rack) || [], x0 = o.x, y0 = o.y - 2;
    R(g, P.i2, x0 + 1, y0, 2, 4); R(g, P.i2, x0 + 29, y0, 2, 4); R(g, P.wood3, x0, y0 + 1, 32, 2); R(g, P.wood4, x0, y0 + 1, 32, 1);
    const SL = [3, 7, 22, 26];
    SL.forEach((sx, i) => {
      R(g, P.i3, x0 + sx + 1, y0 + 3, 1, 2);
      const r = rk[i]; if (!r) return;
      const k = U.clamp(r.t / SMOKE_MIN, 0, 1), big = yieldOf(r.id) > 1;
      const c1 = S.mix(P.r2, P.wood1, k), c2 = S.mix(P.r1, P.r0, k);
      R(g, c1, x0 + sx, y0 + 5, 3, big ? 9 : 7); R(g, c2, x0 + sx + 2, y0 + 5, 1, big ? 9 : 7); if (k >= 1) R(g, P.y0, x0 + sx, y0 + 6, 1, 2);
    });
    if (rk.length && NW.Survival.stoveLit()) { const t = NW.G.t || 0; for (let i = 0; i < 2; i++) { const ph = (t * 0.5 + i / 2) % 1; g.fillStyle = 'rgba(190,195,205,' + (0.3 * (1 - ph)) + ')'; g.fillRect(x0 + 14 + Math.sin(ph * 5 + i) * 6, y0 + 4 - ph * 8, 2, 2); } }
  }, undefined, 'up:rack');
  // outside: tin cans along the eaves, iron bands on the front shutters
  const extDeco = deco(177, (g, t) => {
    const s = st();
    if (UP.has('alarm')) {
      const shake = (NW.G.t || 0) < rattleUntil;
      [[140, 330], [338, 390]].forEach(([a, b]) => {
        R(g, P.d1, a, 146, b - a, 1);
        for (let x = a + 4, i = 0; x < b - 3; x += 11, i++) {
          if (x > 226 && x < 254) continue; // keep the door frame clear
          const dx = shake ? Math.round(Math.sin(t * 30 + i) * 1.4) : 0, l = 2 + (i % 2);
          R(g, P.d1, x + 1, 147, 1, l); R(g, P.st3, x + dx, 147 + l, 3, 4); R(g, P.st4, x + dx, 147 + l, 1, 4); R(g, i % 3 ? P.r1 : P.y0, x + dx, 148 + l, 3, 1);
        }
      });
    }
    if (UP.has('shutters')) {
      [['w_front_l', 184], ['w_front_r', 272]].forEach(([wid, wx]) => {
        const w = s.cabin.windows[wid]; if (!w || w.boarded > 0) return;
        if (w.shutClosed && w.shutter > 0) [154, 162].forEach((y) => { R(g, P.i1, wx, y, 24, 2); R(g, P.i2, wx, y, 24, 1); for (let x = wx + 2; x < wx + 24; x += 6) R(g, P.i4, x, y, 1, 1); });
        else [154, 162].forEach((y) => { R(g, P.i2, wx - 2, y, 2, 2); R(g, P.i2, wx + 24, y, 2, 2); });
      });
    }
  }, undefined, 'up:ext');

  H.on('objects', (areaId) => {
    if (areaId === 'room_storage') { const out = [benchObj]; if (peek()) out.push(wallDeco); return out; }
    const m = peek(); if (!m || !m.built) return undefined;
    const b = m.built, out = [];
    if (areaId === 'f_2_2') { if (b.alarm || b.shutters) out.push(extDeco); return out; }
    if (areaId.indexOf('room_') !== 0) return undefined;
    if (b.shutters || b.curtains || b.bars || b.reflectors) out.push(wallDeco);
    if (areaId === 'room_main') {
      if (b.reflectors) out.push(tableLampDeco);
      if (b.damper || b.firebox) out.push(stoveDeco);
      if (b.woodbox) out.push(boxDeco);
      if (b.smoker) out.push(rackDeco);
    }
    return out;
  });
  // refresh colliders when the wood box grows while standing in the main room
  H.on('upgradeBuilt', () => { if (NW.G.area) NW.G.refreshColliders(); });

  // ============================================================== UI
  UI.addStyle(
    '.up-wrap{display:grid;grid-template-columns:minmax(11em,0.9fr) 1.3fr;gap:0.8em;min-width:min(46em,80vw)}' +
    '.up-list{display:flex;flex-direction:column;gap:2px}' +
    '.up-row{display:flex;align-items:center;gap:0.3em;padding:0.12em 0.35em;border:1px solid transparent;cursor:pointer;background:rgba(0,0,0,0.18)}' +
    '.up-row:hover{border-color:#5a3a22}.up-row.sel{border-color:var(--amber);background:rgba(90,58,34,0.45)}' +
    '.up-row .up-n{flex:1}.up-tag{font-size:0.75em;color:var(--dim)}' +
    '.up-row.built .up-n{color:var(--green)}.up-row.locked{opacity:0.55}.up-row.active .up-tag{color:var(--amber)}.up-row.ready .up-tag{color:#e8dcc4}' +
    '.up-det .up-title{color:var(--amber);font-size:1.05em;margin-bottom:0.2em}.up-det .up-fx{color:var(--green);margin:0.3em 0}' +
    '.up-mats{display:flex;flex-wrap:wrap;gap:0.15em 0.8em;margin:0.3em 0}.up-mat i{color:var(--dim);font-style:normal}.up-mat.short{color:var(--red)}' +
    '.up-bar{height:0.45em;background:#2a1d13;border:1px solid #4a3020;margin:0.3em 0}.up-bar b{display:block;height:100%;background:var(--amber)}' +
    '.paper .up-mat i{color:#6a5a44}.paper .up-mat.short{color:#a5352e}.paper .up-ok{color:#3d6b43}' +
    '@media (max-width:700px){.up-wrap{grid-template-columns:1fr}}'
  );
  let sel = null;
  function detailHTML(u, atBench) {
    const m = mod(), esc = UI.h.esc, sta = status(u);
    let h = '<div class="up-title">' + UI.h.icon('up_' + u.id) + esc(u.name) + '</div><div>' + esc(u.desc) + '</div><div class="up-fx">' + esc(u.fx) + '</div>';
    if (sta === 'built') return h + '<div class="hint">Built on day ' + m.built[u.id] + '.</div>';
    if (sta === 'active') return h + '<div class="up-bar"><b style="width:' + pct(m) + '%"></b></div><div class="hint">Materials are on the bench. ' + pct(m) + '% done.</div>';
    if (u.req && !m.built[u.req]) h += '<div class="up-mat short">Needs ' + esc(BY[u.req].name) + ' first.</div>';
    h += '<div class="up-mats">' + costHTML(u.cost) + '</div><div class="hint">About ' + workMin(u) + ' minutes of work.' + (atBench ? '' : ' Built at the workbench in the storage room.') + '</div>';
    return h;
  }
  UI.registerPanel('upgrades', (box) => {
    const m = mod(), esc = UI.h.esc;
    const atBench = G().area && G().area.id === 'room_storage';
    if (!sel || !BY[sel]) sel = (m.proj && m.proj.id) || (LIST.find((u) => status(u) === 'ready') || LIST.find((u) => !m.built[u.id]) || LIST[0]).id;
    const u = BY[sel], sta = status(u);
    const nb = UP.built().length;
    const rows = LIST.map((x) => { const t = status(x); return '<div class="up-row ' + t + (x.id === sel ? ' sel' : '') + '" data-up="' + x.id + '">' + UI.h.icon('up_' + x.id) + '<span class="up-n">' + esc(x.name) + '</span><span class="up-tag">' + (t === 'built' ? '✓' : t === 'active' ? pct(m) + '%' : STATUS_TXT[t]) + '</span></div>'; }).join('');
    let btn = '';
    if (sta === 'active') btn = '<button id="up-shelve" class="small">Shelve (refund)</button><button id="up-go" class="strong">Keep working</button>';
    else if (sta !== 'built') btn = '<button id="up-go" class="strong"' + (sta === 'ready' && !m.proj && atBench ? '' : ' disabled') + '>Start building</button>';
    const note = m.proj && sta !== 'active' ? 'The bench is busy: ' + BY[m.proj.id].name.toLowerCase() + '.' : 'Materials come from your pack and the storage chest.';
    box.innerHTML = UI.h.head('Workbench', nb + ' of ' + LIST.length + ' built') +
      '<div class="pbody"><div class="up-wrap"><div class="up-list">' + rows + '</div><div class="up-det">' + detailHTML(u, atBench) + '</div></div></div>' +
      '<div class="pfoot"><span class="small-txt" style="margin-right:auto">' + esc(note) + ' W/S: choose · E: build</span>' + btn + '<button data-close>Close</button></div>';
    UI.h.bindClose(box, 'upgrades');
    box.querySelectorAll('[data-up]').forEach((el) => { el.onclick = () => { sel = el.dataset.up; G().sfx('click'); UI.refresh('upgrades'); }; });
    const go = box.querySelector('#up-go'); if (go) go.onclick = () => buildSel();
    const sh = box.querySelector('#up-shelve'); if (sh) sh.onclick = () => { UP.shelve(); UI.refresh('upgrades'); };
  });
  function buildSel() {
    if (!sel || G().area.id !== 'room_storage') return;
    if (!UP.start(sel)) { UI.refresh('upgrades'); return; }
    UI.close('upgrades');
    beginWork();
  }
  H.on('panelKey', (v, top, code, e) => {
    if (top !== 'upgrades') return undefined;
    const K = NW.Keys, i = LIST.findIndex((u) => u.id === sel);
    if (code === 'ArrowUp' || code === 'KeyW') { sel = LIST[(i + LIST.length - 1) % LIST.length].id; UI.refresh('upgrades'); return true; }
    if (code === 'ArrowDown' || code === 'KeyS') { sel = LIST[(i + 1) % LIST.length].id; UI.refresh('upgrades'); return true; }
    if (code === 'Enter' || (K && K.is && K.is('interact', code))) { if (!(e && e.repeat)) { const sta = status(BY[sel]); if (sta === 'ready' || sta === 'active') buildSel(); } return true; }
    return undefined;
  });
  UI.registerDeskTab('up_plans', 'Upgrades', (s) => {
    const m = mod(), esc = UI.h.esc;
    let h = '<h3>Cabin upgrades</h3>';
    LIST.forEach((u) => {
      const t = status(u);
      h += '<div class="entry">' + UI.h.icon('up_' + u.id) + '<b>' + esc(u.name) + '</b> — ' + (t === 'built' ? '<span class="up-ok">built day ' + m.built[u.id] + '</span>' : t === 'active' ? 'on the bench, ' + pct(m) + '%' : t === 'locked' ? 'needs ' + esc(BY[u.req].name.toLowerCase()) : '<span class="up-mats" style="display:inline-flex">' + costHTML(u.cost) + '</span>') + '<br><span class="hint">' + esc(u.fx) + '</span></div>';
    });
    const rk = m.rack || [];
    if (rk.length) h += '<h3>Smoking rack</h3><div class="entry">' + rk.length + ' piece' + (rk.length === 1 ? '' : 's') + ' hanging, ' + rk.filter((r) => r.t >= SMOKE_MIN).length + ' ready.</div>';
    void s;
    return h + '<div class="hint">Projects are built at the workbench in the storage room, from what is in your pack and the chest. Work stops when you step away; progress is kept.</div>';
  });
  if (UI.registerHowto) UI.registerHowto('Cabin upgrades', 'The <b>workbench</b> in the storage room turns salvage into lasting improvements: warmer walls, a thriftier stove, stronger doors and shutters, an alarm line of tin cans. Lay out the materials, then hold the action to work. Some plans need others first. If something knocks and the cans hung silent, think twice.');
})(window.NW);
