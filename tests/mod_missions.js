// HQ orders (missions module): issuing, objects, completion, deadlines, rewards, save/reload, old saves, UI.
const { chromium } = require('playwright');
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/d607ac6a-93f8-5870-a0ad-942bb41b98fa/scratchpad/shots';
let fails = 0; const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1440, height: 816 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message + '\n' + e.stack)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://localhost:8123/index.html?view=2d'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(400);
  const ev = (f, a) => page.evaluate(f, a);
  const shot = async (n) => { await page.waitForTimeout(120); await page.screenshot({ path: SHOTS + '/missions-' + n + '.png', clip: await ev(() => { const r = document.getElementById('frame').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }) }); };
  const newRun = (seed) => ev((sd) => { NW.G.newGame({ mode: 'standard', seed: sd, intro: false, guided: false }); NW.UI.closeAll(); }, seed);

  console.log('# Module present, day 1 quiet');
  await newRun(1234);
  check(await ev(() => !!NW.Missions && typeof NW.Missions.summary === 'function'), 'NW.Missions.summary exported');
  check(await ev(() => NW.Missions.active().length === 0 && NW.Missions.summary().total === 0), 'no orders on day 1');

  console.log('# Day 2 morning, the real way (through night 1)');
  const nightRun = await ev(() => {
    const G = NW.G, s = G.state; G.enterArea('room_main', 120, 140);
    s.stove.fuel = 50; s.woodbox = 15; NW.debug.setTime(18 * 60 + 58, 1);
    const t0 = Date.now(); let guard = 0;
    while (!(s.time.day === 2 && s.time.min > 6 * 60 + 5) && guard++ < 900) { NW.debug.step(1); if (s.stove.fuel < 15) s.stove.fuel = 50; s.player.hunger = 80; s.player.temp = 36.8; if (G.dead) break; }
    NW.UI.closeAll();
    const sched = s.radio.sched.find((r) => r.day === 2);
    return { day: s.time.day, dead: G.dead, ms: Date.now() - t0, orders: NW.Missions.active().map((o) => o.type + '@' + o.parts.map((p) => p.a + ':' + p.x + ',' + p.y).join('|')), news: sched ? sched.text : '', notes: s.journal.entries.filter((e) => /orders from Base/.test(e.text)).length };
  });
  check(nightRun.day === 2 && !nightRun.dead, 'reached day 2 alive (' + nightRun.ms + ' ms)');
  check(nightRun.orders.length >= 1 && nightRun.orders.length <= 2, 'day 2 issues 1-2 orders: ' + nightRun.orders.join(' ; '));
  check(/Orders for Watch Seven/.test(nightRun.news), 'orders read in the 07:00 radio report');
  check(nightRun.notes === 1, 'orders written to journal notes');
  // determinism: a second run on the same seed gives the same orders
  await newRun(1234);
  const again = await ev(() => { const s = NW.G.state; s.time.day = 2; s.time.min = 6 * 60; NW.Events.morning(); return NW.Missions.active().map((o) => o.type + '@' + o.parts.map((p) => p.a + ':' + p.x + ',' + p.y).join('|')); });
  check(JSON.stringify(again) === JSON.stringify(nightRun.orders), 'same seed, same day-2 orders and positions');
  await newRun(98765);
  const other = await ev(() => { const s = NW.G.state; s.time.day = 2; s.time.min = 6 * 60; NW.Events.morning(); return NW.Missions.active().map((o) => o.type); });
  console.log('    seed 98765 day 2: ' + other.join(', '));

  console.log('# Every order type can be placed');
  const placed = await ev(() => {
    const out = {}; const M = NW.Missions, T = M.TYPES;
    for (const type of Object.keys(T)) {
      if (type === 'tower') continue;
      const saved = {};
      for (const k of Object.keys(T)) if (k !== type) { saved[k] = T[k]; delete T[k]; }
      M.state().orders = []; M.state().lastDay = 0;
      const got = M.issue(10, null);
      Object.assign(T, saved);
      out[type] = got.length ? got[0].parts.map((p) => p.a + ':' + p.x + ',' + p.y).join('|') : null;
    }
    M.state().orders = [];
    return out;
  });
  for (const k in placed) check(!!placed[k], 'type ' + k + ' placed: ' + placed[k]);

  console.log('# Complete orders end to end');
  await newRun(1234);
  const res = await ev(() => {
    const G = NW.G, s = G.state, I = NW.Inv, M = NW.Missions, out = {};
    const T = M.TYPES; const saved = {};
    const force = (type, day) => { for (const k of Object.keys(T)) if (k !== type) { saved[k] = T[k]; delete T[k]; } M.state().lastDay = 0; const o = M.issue(day, null)[0]; Object.assign(T, saved); for (const k in saved) delete saved[k]; return o; };
    s.time.day = 2; s.time.min = 8 * 60;
    // walk up to a part and use the focus/doAction path
    const doPart = (o, p) => {
      G.enterArea(p.a, p.x, p.y + 12, 'up'); NW.debug.step(0.05);
      const f = G.focus; if (!f || !f.dyn) return 'no focus (' + (f && f.name) + ')';
      const i = f.actions.findIndex((a) => !a.disabled && /Reset|Read|Tie|Restock|Take|Clear|Pull|Nail|bearing/.test(a.label)); if (i < 0) return 'no action: ' + f.actions.map((a) => a.label + '/' + a.disabled).join(';');
      G.doAction(i); NW.debug.step((f.actions[i].time || 0) + 0.3); NW.UI.closeAll(); return f.name;
    };
    // 1) breaker (priority)
    const chest0 = JSON.stringify(s.chest), rep0 = s.rep;
    let o = force('breaker', 2); o.pri = true;
    out.breakerName = doPart(o, o.parts[0]);
    out.breaker = o.status; out.breakerRep = s.rep - rep0; out.chestChanged = JSON.stringify(s.chest) !== chest0;
    out.nails = I.count(s.chest, 'nails');
    // 2) markers across three areas
    o = force('markers', 2);
    out.markerAreas = o.parts.map((p) => p.a).join(',');
    out.markerSteps = o.parts.map((p) => doPart(o, p)).join(' | ');
    out.markers = o.status;
    // 3) restock needs items
    o = force('restock', 2); I.remove(s.inv, 'canned', 9);
    G.enterArea(o.parts[0].a, o.parts[0].x, o.parts[0].y + 12, 'up'); NW.debug.step(0.05);
    out.restockDisabled = G.focus && G.focus.actions[0].disabled;
    I.add(s.inv, 'wood', 2); I.add(s.inv, 'canned', 1); const w0 = I.count(s.inv, 'wood');
    out.restockName = doPart(o, o.parts[0]); out.restock = o.status; out.restockWood = w0 - I.count(s.inv, 'wood');
    // 4) lost pack: pick up, carry home
    o = force('pack', 2);
    doPart(o, o.parts[0]); out.packCarried = I.count(s.inv, 'hq_pack'); out.packMid = o.status;
    G.enterArea('f_2_2', 240, 200); G.enterCabin('front'); out.pack = o.status; out.packLeft = I.count(s.inv, 'hq_pack');
    // 5) snares, tree, camera, sign, gauge
    for (const type of ['snares', 'tree', 'camera', 'sign', 'gauge']) {
      o = force(type, 2); I.add(s.inv, 'nails', 2);
      o.parts.forEach((p) => doPart(o, p)); out[type] = o.status;
    }
    out.summary = M.summary(); out.done = s.mods.missions.orders.filter((x) => x.status === 'done').length;
    return out;
  });
  check(res.breaker === 'done' && res.breakerRep === 1, 'priority breaker reset by hold action -> done, rep +1 (' + res.breakerName + ')');
  check(res.chestChanged && res.nails >= 14, 'reward delivered to the cabin chest (nails ' + res.nails + ')');
  check(res.markers === 'done', 'three trail markers tied in ' + res.markerAreas + ' -> done');
  check(!!res.restockDisabled && res.restock === 'done' && res.restockWood === 2, 'restock needs 2 wood + 1 canned, consumes them');
  check(res.packCarried === 1 && res.packMid === 'active' && res.pack === 'done' && res.packLeft === 0, 'lost pack carried home and logged');
  for (const k of ['snares', 'tree', 'camera', 'sign', 'gauge']) check(res[k] === 'done', k + ' order completed');
  check(res.summary.done === res.done && res.summary.total >= 9, 'summary counts: ' + JSON.stringify(res.summary));

  console.log('# Fire tower order (with a stand-in Places module)');
  const tower = await ev(() => {
    const created = !NW.Places;
    if (created) {
      NW.World.registerArea('in_tower', { name: 'Fire Tower Cab', map: ['TTTTTTTTTT', 'FFFFFFFFFF', '|........|', '|........|', '|........|', '|........|', '____dd____'], theme: 'plank', mapAt: { area: 'f_0_0', x: 320, y: 112 }, exits: [] });
      NW.Places = { ids: { tower: 'in_tower', shack: 'in_shack', mine: 'in_mine' }, spot: () => ({ x: 80, y: 72 }) };
    }
    const G = NW.G, s = G.state, M = NW.Missions, T = M.TYPES, saved = {};
    for (const k of Object.keys(T)) if (k !== 'tower') { saved[k] = T[k]; delete T[k]; }
    M.state().lastDay = 0; const o = M.issue(s.time.day, null)[0]; Object.assign(T, saved);
    if (!o) return { ok: false };
    const marks = NW.Hooks.collect('mapMarks', s).filter((m) => m.label === 'Tower');
    const pt = o.parts && o.parts[0]; const tp = pt ? { x: pt.x, y: pt.y + 12 } : { x: 80, y: 90 };
    G.enterArea('in_tower', tp.x, tp.y, 'up'); NW.debug.step(0.05);
    const f = G.focus; const name = f && f.name;
    G.doAction(0); NW.debug.step(3.4);
    const r = { ok: true, name, status: o.status, mark: marks.length && marks[0].area };
    if (created) { delete NW.Places; }
    G.enterArea('f_2_2', 240, 200);
    return r;
  });
  check(tower.ok && tower.status === 'done' && tower.mark === 'f_0_0', 'tower bearing order done inside the cab (' + tower.name + '), map mark at the Old Fire Tower');

  console.log('# Deadlines');
  await newRun(4321);
  const dl = await ev(() => {
    const G = NW.G, s = G.state, M = NW.Missions, out = {};
    s.time.day = 2; s.time.min = 6 * 60; NW.Events.morning(); NW.UI.closeAll();
    const os = M.active(); os.forEach((o, i) => { o.pri = i === 0; o.due = 2; });
    const rep0 = s.rep;
    G.enterArea('f_2_2', 240, 200);
    s.time.min = 17 * 60 + 58; NW.debug.step(2);
    out.status = os.map((o) => o.status); out.repDelta = s.rep - rep0;
    out.failedEvt = s.journal.entries.some((e) => /Order (failed|lapsed)/.test(e.text));
    out.summary = M.summary();
    out.report = s.pendingReports.some((t) => /priority order/.test(t));
    return out;
  });
  check(dl.status[0] === 'failed' && (dl.status.length < 2 || dl.status[1] === 'lapsed'), 'at dusk the priority order fails and the ordinary one lapses: ' + dl.status.join(','));
  check(dl.repDelta === -1, 'failing a priority order costs 1 standing');
  check(dl.failedEvt && dl.report && dl.summary.failed === dl.status.length, 'failure journaled, reported to the next morning, counted');
  // long orders survive the first dusk
  const longO = await ev(() => {
    const G = NW.G, s = G.state, M = NW.Missions, T = M.TYPES, saved = {};
    s.time.day = 3; s.time.min = 7 * 60;
    for (const k of Object.keys(T)) if (k !== 'markers') { saved[k] = T[k]; delete T[k]; }
    M.state().lastDay = 0; const o = M.issue(3, null)[0]; Object.assign(T, saved);
    s.time.min = 18 * 60 + 5; NW.debug.step(0.2); const a = o.status;
    s.time.day = 4; s.time.min = 18 * 60 + 1; NW.debug.step(0.2);
    return [o.due, a, o.status];
  });
  check(longO[0] === 4 && longO[1] === 'active' && (longO[2] === 'lapsed' || longO[2] === 'failed'), 'two-day order survives day 3 dusk, ends at day 4 dusk ' + JSON.stringify(longO));

  console.log('# Final day and endless');
  const fin = await ev(() => {
    const s = NW.G.state, M = NW.Missions; const n = NW.G.finalNight();
    M.state().lastDay = 0; const a = M.issue(n, []).length;
    M.state().lastDay = 0; const b = M.issue(n + 1, []).length;
    return [a, b];
  });
  check(fin[0] === 0 && fin[1] >= 1, 'no orders on the final night\'s day; they resume in endless days (' + fin.join(',') + ')');

  console.log('# Save and reload mid-order');
  await newRun(1234);
  const mid = await ev(() => {
    const G = NW.G, s = G.state, M = NW.Missions, T = M.TYPES, saved = {};
    s.time.day = 2; s.time.min = 9 * 60;
    for (const k of Object.keys(T)) if (k !== 'snares') { saved[k] = T[k]; delete T[k]; }
    M.state().lastDay = 2; const o = M.issue(2, null)[0]; Object.assign(T, saved);
    const p = o.parts[0]; G.enterArea(p.a, p.x, p.y + 12, 'up'); NW.debug.step(0.05);
    G.doAction(0); NW.debug.step(1.8);
    G.save('manual');
    return { id: o.id, k: o.parts.filter((q) => q.ok).length };
  });
  await page.reload(); await page.waitForTimeout(400);
  const back = await ev((id) => {
    NW.UI.closeAll(); NW.G.loadState(NW.Save.read(NW.Save.latest()).state); NW.UI.closeAll();
    const o = NW.G.state.mods.missions.orders.find((x) => x.id === id);
    const objs = NW.Hooks.collect('objects', NW.G.area.id, NW.G.area).filter((x) => x.ms === id);
    return { k: o && o.parts.filter((q) => q.ok).length, status: o && o.status, objs: objs.length };
  }, mid.id);
  check(mid.k === 1 && back.k === 1 && back.status === 'active' && back.objs === 2, 'progress (1/3 snares) survives save + reload; 2 snares still in the world');

  console.log('# Old save without missions data');
  const old = await ev(() => {
    const s = NW.G.state; delete s.mods.missions; s.time.day = 3; s.time.min = 8 * 60; NW.G.save('manual');
    const st2 = NW.Save.read(NW.Save.latest()).state; NW.G.loadState(st2); NW.UI.closeAll();
    const m = NW.G.state.mods.missions;
    return { has: !!m, n: m ? m.orders.length : -1, last: m && m.lastDay, sum: NW.Missions.summary() };
  });
  check(old.has && old.n >= 1 && old.last === 3, 'old save loads; morning orders issued on load (' + old.n + ')');
  const old2 = await ev(() => { const s = NW.G.state; delete s.mods.missions; s.time.min = 20 * 60; NW.G.save('manual'); NW.G.loadState(NW.Save.read(NW.Save.latest()).state); NW.UI.closeAll(); NW.debug.step(0.5); return { sum: NW.Missions.summary(), html: NW.UI.isOpen('desk') }; });
  check(old2.sum.total === 0, 'old save at night loads cleanly with no orders');

  console.log('# HUD, desk, map, visuals');
  await newRun(1234);
  const ui = await ev(() => {
    const G = NW.G, s = G.state; s.time.day = 2; s.time.min = 6 * 60; NW.Events.morning(); NW.UI.closeAll();
    s.time.min = 9 * 60; G.enterArea('room_office', 60, 90); NW.debug.step(0.3); NW.UI.update(0.016);
    const objTxt = document.getElementById('objectives').textContent;
    NW.UI.open('desk'); const tab = [...document.querySelectorAll('.tab')].find((t) => t.textContent === 'HQ orders'); if (tab) tab.click();
    const deskTxt = document.querySelector('.pbody').textContent;
    return { objTxt, deskTxt, marks: NW.Hooks.collect('mapMarks', s).length, act: NW.Missions.active().map((o) => o.type) };
  });
  check(/HQ orders/.test(ui.objTxt), 'HUD objective box lists HQ orders: ' + ui.objTxt);
  check(/Active orders/.test(ui.deskTxt) && /lies (north|south|east|west)/.test(ui.deskTxt), 'desk tab shows active orders with directions');
  check(ui.marks >= ui.act.length, 'map markers for active orders (' + ui.marks + ')');
  await shot('desk');
  await ev(() => { NW.UI.closeAll(); NW.UI.open('map'); });
  await shot('map');
  await ev(() => NW.UI.closeAll());
  // visit each kind of object in daylight and photograph it
  const kinds = ['breaker', 'restock', 'tree', 'sign', 'camera', 'gauge', 'snares', 'pack', 'markers'];
  for (const k of kinds) {
    await ev((type) => {
      const G = NW.G, s = G.state, M = NW.Missions, T = M.TYPES, saved = {};
      s.time.day = 2; s.time.min = 11 * 60; s.weather.snow = 0.6;
      for (const x of Object.keys(T)) if (x !== type) { saved[x] = T[x]; delete T[x]; }
      s.mods.missions.orders = s.mods.missions.orders.filter((o) => o.status !== 'active' || ((o.type === 'sign' || o.type === 'tree') && o.type !== type));
      M.state().lastDay = 0; const o = M.issue(2, null)[0]; Object.assign(T, saved);
      const p = o.parts[0]; G.enterArea(p.a, p.x - 26, p.y + 14, 'right'); NW.UI.closeAll(); NW.debug.step(0.4);
    }, k);
    await shot('obj-' + k);
  }
  // done states: breaker reset and sign up
  await ev(() => { const M = NW.Missions; const o = M.active().find((x) => x.type === 'sign'); o.parts[0].ok = true; M.complete(o); const ob = NW.G.state.mods.missions.orders.find((x) => x.type === 'sign'); NW.G.enterArea(ob.parts[0].a, ob.parts[0].x - 26, ob.parts[0].y + 14, 'right'); NW.UI.closeAll(); NW.debug.step(0.3); });
  await shot('obj-sign-done');
  await ev(() => { const o = NW.Missions.active().find((x) => x.type === 'tree'); o.parts[0].ok = true; NW.Missions.complete(o); NW.G.enterArea(o.parts[0].a, o.parts[0].x - 26, o.parts[0].y + 14, 'right'); NW.UI.closeAll(); NW.debug.step(0.3); });
  await shot('obj-tree-done');
  await ev(() => { NW.UI.open('map'); });
  await shot('map2');
  await ev(() => NW.UI.closeAll());

  console.log('# Errors');
  const hookErrs = await ev(() => NW.hookErrors || []);
  check(hookErrs.length === 0, 'no hook errors ' + hookErrs.join('\n'));
  check(errs.length === 0, 'no page errors ' + errs.join('\n'));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
