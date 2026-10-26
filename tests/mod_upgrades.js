// Cabin upgrades: workbench placement and collisions, building through the panel and hold action,
// every upgrade's effect measured, prerequisites, missing materials, save/reload, old saves, visuals.
const { chromium } = require('playwright');
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/d607ac6a-93f8-5870-a0ad-942bb41b98fa/scratchpad/shots';
let fails = 0; const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 960, height: 544 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://localhost:8123/index.html?view=2d'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(400);
  const ev = (f, a) => page.evaluate(f, a);
  const step = (s) => ev((x) => NW.debug.step(x), s);
  const shot = async (name) => { await page.waitForTimeout(120); const c = await ev(() => { const r = document.querySelector('#frame').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }); await page.screenshot({ path: SHOTS + '/upgrades-' + name + '.png', clip: c }); };
  await ev(() => { NW.G.newGame({ mode: 'standard', seed: 1234, intro: false, guided: false }); });
  await page.waitForTimeout(300);
  await ev(() => { window.__built = []; NW.Hooks.on('upgradeBuilt', (id) => window.__built.push(id)); });
  const give = () => ev(() => { const s = NW.G.state; s.chest.fill(null); for (const [id, n] of [['plank', 18], ['nails', 60], ['scrap', 20], ['rope', 10], ['cloth', 10], ['glass', 2]]) NW.Inv.add(s.chest, id, n); });

  console.log('# API');
  check(await ev(() => !!NW.Upgrades && typeof NW.Upgrades.has === 'function' && Array.isArray(NW.Upgrades.built()) && NW.Upgrades.built().length === 0), 'NW.Upgrades.has / built() exported, nothing built');
  check(await ev(() => NW.Upgrades.LIST.length === 10 && NW.Upgrades.LIST.filter((u) => u.req).length >= 2), '10 upgrades, some with prerequisites');
  check(await ev(() => !!NW.D.ITEMS.jerky && !!NW.S.icons.jerky && NW.Upgrades.LIST.every((u) => !!NW.S.icons['up_' + u.id])), 'jerky item and plan icons registered');

  console.log('# Workbench placement');
  await ev(() => { NW.G.enterArea('room_storage', 226, 96, 'left'); NW.debug.step(0.2); });
  const geo = await ev(() => {
    const G = NW.G, W = NW.World, a = G.area, cols = G.dynamicColliders.slice();
    const bench = cols.find((c) => c.x > 180 && c.y > 100);
    const free = (x, y) => !W.blocked(a, x - 5, y - 4, 10, 5);
    const flood = (sx, sy) => { const seen = new Set(), q = [[sx, sy]]; seen.add(sx + ',' + sy); while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (seen.has(k) || nx < 4 || ny < 4 || nx > a.w * 16 - 4 || ny > a.h * 16 + 8 || !free(nx, ny)) continue; seen.add(k); q.push([nx, ny]); } } return seen; };
    const withB = flood(226, 96); G.dynamicColliders = []; const noB = flood(226, 96); G.dynamicColliders = cols;
    let lost = 0; noB.forEach((k) => { if (!withB.has(k)) { const [x, y] = k.split(',').map(Number); if (!(x > bench.x - 8 && x < bench.x + bench.w + 8 && y > bench.y - 2 && y < bench.y + bench.h + 8)) lost++; } });
    const overl = a.objs.some((o) => { const c = W.collider(o); return c && c.x < bench.x + bench.w && c.x + c.w > bench.x && c.y < bench.y + bench.h && c.y + c.h > bench.y; });
    return { bench, exit: withB.has('128,142') || withB.has('128,144'), front: withB.has('216,140') || withB.has('216,138'), door: free(226, 96), lost, overl, inRoom: bench.x >= 176 && bench.x + bench.w <= 240 && bench.y >= 104 && bench.y + bench.h <= 140 };
  });
  check(!!geo.bench && geo.inRoom, 'workbench collider in the bottom-right corner ' + JSON.stringify(geo.bench));
  check(!geo.overl, 'workbench overlaps no furniture');
  check(geo.door && geo.exit, 'back-door entry point free and the bottom exit reachable from it');
  check(geo.front, 'the front of the workbench is reachable');
  check(geo.lost === 0, 'workbench blocks no floor apart from its own footprint (' + geo.lost + ')');
  await ev(() => { const p = NW.G.state.player; p.x = 216; p.y = 140; p.dir = 'up'; NW.debug.step(0.1); });
  let f = await ev(() => ({ name: NW.G.focus && NW.G.focus.name, acts: NW.G.focus ? NW.G.focus.actions.map((a) => a.label) : [] }));
  check(/^Workbench/.test(f.name || '') && f.acts.includes('Look over the plans'), 'facing the bench focuses it: ' + f.name + ' ' + JSON.stringify(f.acts));
  await shot('bench');

  console.log('# Missing materials and prerequisites');
  await ev(() => { const s = NW.G.state; s.chest.fill(null); s.inv.fill(null); });
  check(await ev(() => NW.Upgrades.start('damper') === false && !NW.G.state.mods.upgrades.proj), 'cannot start without materials');
  await give();
  check(await ev(() => NW.Upgrades.start('firebox') === false && !NW.G.state.mods.upgrades.proj), 'larger firebox refused before the damper');
  check(await ev(() => NW.Upgrades.start('shutters') === false), 'iron-banded shutters refused before the door bars');
  await ev(() => NW.G.doAction(NW.G.focus.actions.findIndex((a) => a.label === 'Look over the plans')));
  check(await ev(() => NW.UI.isOpen('upgrades') && document.querySelectorAll('.up-row').length === 10), 'plans panel lists 10 projects');
  await page.click('[data-up=firebox]'); await page.waitForTimeout(60);
  check(await ev(() => document.querySelector('#up-go').disabled && /Needs Stove damper/.test(document.querySelector('.up-det').textContent)), 'locked project: button disabled, prerequisite named');
  await page.click('[data-up=woodbox]'); await page.waitForTimeout(60);
  check(await ev(() => !document.querySelector('#up-go').disabled), 'woodbox can be started');
  await shot('panel');

  console.log('# Building through the panel');
  const before = await ev(() => ({ plank: NW.Inv.count(NW.G.state.chest, 'plank'), nails: NW.Inv.count(NW.G.state.chest, 'nails'), min: NW.G.state.time.min }));
  await page.click('#up-go'); await page.waitForTimeout(60);
  let h = await ev(() => ({ open: NW.UI.isOpen('upgrades'), hold: NW.G.hold && NW.G.hold.label, proj: NW.G.state.mods.upgrades.proj, plank: NW.Inv.count(NW.G.state.chest, 'plank'), nails: NW.Inv.count(NW.G.state.chest, 'nails') }));
  check(!h.open && /Work on: Bigger wood box/.test(h.hold || ''), 'start closes the panel and begins work: ' + h.hold);
  check(h.plank === before.plank - 2 && h.nails === before.nails - 4, 'materials taken from the chest (2 planks, 4 nails)');
  await step(4);
  await shot('working');
  await ev(() => { NW.G.state.player.x = 120; NW.G.state.player.y = 120; }); await step(0.2);
  h = await ev(() => ({ hold: !!NW.G.hold, prog: NW.G.state.mods.upgrades.proj && NW.G.state.mods.upgrades.proj.prog }));
  check(!h.hold && h.prog > 3.5 && h.prog < 5, 'walking away stops work, progress kept (' + (h.prog || 0).toFixed(2) + 's)');
  check(await ev((m0) => NW.G.state.time.min > m0 + 8, before.min), 'game time passes while working');
  console.log('# Save and reload mid-project');
  await ev(() => NW.G.save('manual'));
  await page.reload(); await page.waitForTimeout(400); await page.click('#b-continue'); await page.waitForTimeout(300);
  h = await ev(() => NW.G.state.mods.upgrades.proj);
  check(h && h.id === 'woodbox' && h.prog > 3.5, 'project survives reload: ' + JSON.stringify(h));
  await ev(() => { window.__built = []; NW.Hooks.on('upgradeBuilt', (id) => window.__built.push(id)); NW.G.enterArea('room_storage', 216, 140, 'up'); NW.debug.step(0.3); NW.G.state.player.dir = 'up'; NW.debug.step(0.1); });
  f = await ev(() => NW.G.focus && NW.G.focus.actions[0].label);
  check(/^Work on: Bigger wood box \(\d+%\)/.test(f || ''), 'bench offers to continue: ' + f);
  await ev(() => NW.G.doAction(0)); await step(7);
  h = await ev(() => ({ b: NW.Upgrades.has('woodbox'), proj: NW.G.state.mods.upgrades.proj, ev: window.__built.slice(), cap: NW.G.cap('WOODBOX_CAP') }));
  check(h.b && !h.proj && h.ev.join() === 'woodbox', 'woodbox finished, upgradeBuilt emitted once');
  check(h.cap === 23, 'wood box capacity 15 -> 23 (' + h.cap + ')');

  console.log('# Effects');
  const done = (id) => ev((i) => NW.Upgrades.complete(i), id);
  // stove damper
  const burn = () => ev(() => { const s = NW.G.state; s.night.si.stage = 'none'; s.stove.setting = 'medium'; s.stove.fuel = 40; NW.debug.step(10); return 40 - s.stove.fuel; });
  const b0 = await burn(); await done('damper'); const b1 = await burn();
  check(Math.abs(b1 / b0 - 0.85) < 0.01, 'damper: stove burns 85% (' + b0.toFixed(3) + ' -> ' + b1.toFixed(3) + ')');
  // larger firebox
  check(await ev(() => NW.G.cap('STOVE_CAP')) === 50, 'stove holds 50 before the firebox');
  await done('firebox');
  check(await ev(() => NW.G.cap('STOVE_CAP')) === 70, 'larger firebox: stove holds 70');
  check(await ev(() => { const s = NW.G.state; s.stove.fuel = 58; NW.G.enterArea('room_main', 64, 80, 'up'); const st = NW.G.area.objs.find((o) => o.type === 'stove'); return !NW.Cabin.stoveActions(st)[0].disabled; }), 'a log fits in the stove at 58 fuel');
  // insulation
  const t0 = await ev(() => NW.Survival.cabinTarget()); await done('insulation'); const t1 = await ev(() => NW.Survival.cabinTarget());
  check(Math.abs(t1 - t0 - 3) < 0.001, 'insulation: cabin target +3°C (' + t0.toFixed(1) + ' -> ' + t1.toFixed(1) + ')');
  // heavy curtains
  const leak = () => ev(() => { const s = NW.G.state; s.oil = 80; s.lamps.room_bed = true; const w = s.cabin.windows.w_bed; w.curtClosed = true; w.shutClosed = false; NW.Survival.computeLight(); return NW.Survival.light.winLeak.w_bed; });
  const l0 = await leak(); await done('curtains'); const l1 = await leak();
  check(l0 > 0 && Math.abs(l1 / l0 - 0.15 / 0.35) < 0.01, 'heavy curtains: bedroom leak ' + l0.toFixed(3) + ' -> ' + l1.toFixed(3));
  // lamp reflectors
  const oil = () => ev(() => { const s = NW.G.state; s.oil = 80; for (const r in s.lamps) s.lamps[r] = true; NW.debug.step(20); const d = 80 - s.oil; for (const r in s.lamps) s.lamps[r] = false; return d; });
  const o0 = await oil(); await done('reflectors'); const o1 = await oil();
  check(Math.abs(o1 / o0 - 0.6) < 0.01, 'reflectors: lamps burn 60% of the oil (' + o0.toFixed(2) + ' -> ' + o1.toFixed(2) + ')');
  // night tests: start night 1 and give it a Light Hunter and a Scratcher
  await ev(() => { const s = NW.G.state; s.time.min = 18 * 60 + 58; s.stove.fuel = 60; s.player.hunger = 90; NW.G.enterArea('room_main', 200, 150, 'down'); NW.debug.step(4); });
  check(await ev(() => NW.G.state.night.active), 'night started');
  // Light Hunter at the bedroom window with the shutters closed
  const lhRun = () => ev(() => {
    const s = NW.G.state, n = s.night; s.time.min = 19 * 60 + 60; n.plan.lhSens = 1; s.stove.setting = 'high'; s.stove.fuel = 60; s.oil = 90;
    for (const r in s.lamps) s.lamps[r] = true;
    const w = s.cabin.windows.w_bed; w.shutClosed = true; w.shutter = 100; w.curtClosed = false; w.glass = 100;
    Object.assign(n.lh, { stage: 'window', wid: 'w_bed', calm: 0, t: 0, snd: 0, reach: 0, cool: 0, interest: 100 });
    NW.debug.step(3); const d = 100 - w.shutter; n.lh.stage = 'away'; n.lh.interest = 0; n.lh.cool = 999; w.shutter = 100; return d;
  });
  const lh0 = await lhRun(); await ev(() => NW.Upgrades.complete('bars')); await done('shutters'); const lh1 = await lhRun();
  check(lh0 > 5 && Math.abs(lh1 / lh0 - 0.55) < 0.02, 'iron-banded shutters: Light Hunter damage ' + lh0.toFixed(1) + ' -> ' + lh1.toFixed(1));
  check(await ev(() => NW.Hooks.filter('lhDamage', 1, 'w_front_l')) === 1 || await ev(() => !NW.G.state.cabin.windows.w_front_l.shutClosed), 'open shutters get no bonus');
  // Scratcher at the locked back door (bars already built: measure with and without)
  const claw = (withBars) => ev((wb) => {
    const s = NW.G.state, sc = s.night.sc, d = s.cabin.doors.back, m = s.mods.upgrades;
    if (!wb) delete m.built.bars; else m.built.bars = s.time.day;
    d.locked = true; d.lockBroken = false; d.hp = 100; d.max = 100; d.reinforced = false; d.open = false;
    Object.assign(sc, { stage: 'door', door: 'back', t: 0, snd: 0, rattle: 0 });
    NW.debug.step(3); const dmg = 100 - d.hp; sc.stage = 'none'; d.hp = 100; return dmg;
  }, withBars);
  const c0 = await claw(false), c1 = await claw(true);
  check(c0 > 5 && Math.abs(c1 / c0 - 0.6) < 0.02, 'steel door bars: claw damage ' + c0.toFixed(1) + ' -> ' + c1.toFixed(1));
  // tin-can alarm line
  await done('alarm');
  const al = await ev(() => {
    const s = NW.G.state, p = s.night.plan, nm = NW.Night.nightMin(), msgs = [];
    const un = NW.Hooks.on('update', () => {}); un();
    const orig = NW.UI.msg; NW.UI.msg = function (t, k) { msgs.push(t); return orig.apply(this, arguments); };
    p.scratcher.push({ at: Math.round(nm) + 25, door: 'back' }); const si = p.scratcher.length - 1;
    p.visitors.push({ at: Math.round(nm) + 25, vid: '__none' }); const vi = p.visitors.length - 1;
    NW.debug.step(1); const early = msgs.filter((m) => /cans/i.test(m)).length;
    NW.debug.step(4); const warned = msgs.filter((m) => /cans/i.test(m));
    p.done['v' + vi] = true; // no real visitor behind this test entry
    for (let i = 0; i < 20 && s.night.sc.stage === 'none'; i++) NW.debug.step(1);
    NW.UI.msg = orig;
    const r = { early, warned, scStage: s.night.sc.stage, scT: s.night.sc.t, scDone: !!p.done['s' + si] };
    s.night.sc.stage = 'none';
    return r;
  });
  check(al.early === 0, 'no rattle while the threat is still far');
  check(al.warned.length === 2 && al.warned.some((m) => /back door/.test(m)) && al.warned.some((m) => /porch/.test(m)), 'cans rattle before the Scratcher and before a visitor: ' + JSON.stringify(al.warned));
  check(al.scDone, 'the Scratcher still arrives after the warning');
  await page.waitForTimeout(100);
  // smoking rack
  await done('smoker');
  const sm = await ev(() => {
    const s = NW.G.state, a = NW.G.area; NW.G.enterArea('room_main', 64, 80, 'up');
    s.inv.fill(null); NW.Inv.add(s.inv, 'raw_venison', 2); NW.Inv.add(s.inv, 'raw_rabbit', 1);
    const stove = NW.G.area.objs.find((o) => o.type === 'stove');
    const acts = () => NW.Hooks.filter('actions', [], stove, NW.G.area);
    for (let i = 0; i < 3; i++) acts()[0].run();
    const hung = s.mods.upgrades.rack.length, left = NW.Inv.count(s.inv, 'raw_venison') + NW.Inv.count(s.inv, 'raw_rabbit');
    s.stove.setting = 'medium';
    let n = 0; while (s.mods.upgrades.rack.some((r) => r.t < 180) && n < 400) { s.stove.fuel = 60; s.player.hunger = 90; NW.debug.step(2); n++; }
    const take = acts().find((x) => /Take jerky/.test(x.label)); if (take) take.run();
    void a;
    return { hung, left, jerky: NW.Inv.count(s.inv, 'jerky'), rack: s.mods.upgrades.rack.length, secs: n * 2, hangDisabled: acts()[0].disabled };
  });
  check(sm.hung === 3 && sm.left === 0, 'three pieces of raw meat hung on the rack');
  check(sm.jerky === 5 && sm.rack === 0, 'smoked over the stove into 5 jerky (2 venison x2, 1 rabbit): ' + sm.jerky + ' after ' + sm.secs + 's');
  check(!!sm.hangDisabled, 'hang action disabled with no raw meat');
  check(await ev(() => NW.Upgrades.built().length === 10), 'all 10 upgrades built');

  console.log('# Visuals');
  await ev(() => { const s = NW.G.state; s.time.min = 11 * 60; s.time.day = 3; s.night.active = false; s.player.hunger = 90; NW.UI.closeAll(); s.woodbox = 21; s.stove.setting = 'low'; s.stove.fuel = 40;
    s.mods.upgrades.rack = [{ id: 'raw_venison', t: 60 }, { id: 'raw_rabbit', t: 180 }, { id: 'raw_venison', t: 10 }];
    s.lamps.room_main = true; s.cabin.windows.w_front_l.curtClosed = true; s.cabin.windows.w_front_r.curtClosed = false; s.cabin.windows.w_front_r.shutClosed = true;
    NW.G.enterArea('room_main', 120, 110, 'up'); NW.debug.step(0.5); });
  await shot('main');
  await ev(() => { const s = NW.G.state; s.cabin.windows.w_bed.shutClosed = true; s.cabin.windows.w_bed.curtClosed = false; NW.G.enterArea('room_bed', 120, 100, 'up'); NW.debug.step(0.3); });
  await shot('bed-shutters');
  await ev(() => { NW.G.enterArea('f_2_2', 250, 230, 'up'); NW.debug.step(0.3); });
  await shot('exterior');
  await ev(() => { const s = NW.G.state; s.time.min = 21 * 60; s.lamps.room_storage = true; s.mods.upgrades.proj = null; NW.G.enterArea('room_storage', 200, 100, 'down'); NW.debug.step(0.3); });
  await shot('storage-night');
  await ev(() => NW.G.openUI('desk')); await page.waitForTimeout(80);
  await page.click('[data-tab=up_plans]'); await page.waitForTimeout(80);
  check(await ev(() => (document.querySelector('.panel-desk .pbody').textContent.match(/built day/g) || []).length === 10), 'desk tab "Upgrades" lists all ten as built');
  await shot('desk');
  await ev(() => NW.UI.closeAll());

  console.log('# Old save without upgrade data');
  await ev(() => { const s = NW.G.state; s.time.min = 10 * 60; delete s.mods.upgrades; NW.G.save('manual'); });
  await page.reload(); await page.waitForTimeout(400); await page.click('#b-continue'); await page.waitForTimeout(300);
  h = await ev(() => ({ play: NW.G.mode, built: NW.Upgrades.built().length, cap: NW.G.cap('WOODBOX_CAP'), heat: NW.Hooks.filter('cabinHeat', 10) }));
  check(h.play === 'play' && h.built === 0 && h.cap === 15 && h.heat === 10, 'old save loads with no upgrades and stock values');
  await ev(() => { NW.G.enterArea('room_storage', 216, 140, 'up'); NW.debug.step(0.3); NW.G.openUI('upgrades'); });
  check(await ev(() => document.querySelectorAll('.up-row').length === 10 && !!NW.G.state.mods.upgrades), 'plans panel opens on an old save (state created lazily)');
  await ev(() => NW.UI.closeAll());
  console.log('# Shelve');
  await give();
  const sh = await ev(() => { const c = () => NW.Inv.count(NW.G.state.chest, 'scrap') + NW.Inv.count(NW.G.state.inv, 'scrap'); const a = c(); NW.Upgrades.start('bars'); const b = c(); NW.Upgrades.shelve(); return { a, b, c: c(), proj: NW.G.state.mods.upgrades.proj }; });
  check(sh.b === sh.a - 2 && sh.c === sh.a && !sh.proj, 'shelving a project refunds its materials');
  await step(1);

  check(await ev(() => (NW.hookErrors || []).length === 0), 'no hook errors ' + JSON.stringify(await ev(() => NW.hookErrors || [])));
  check(errs.length === 0, 'no page errors ' + JSON.stringify(errs.slice(0, 5)));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
