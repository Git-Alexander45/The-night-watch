const { chromium } = require('playwright');
let fails = 0;
function check(c, m) { if (c) console.log('  ok  ' + m); else { fails++; console.log('  FAIL ' + m); } }
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 816 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:8123/index.html?view=2d'); await page.waitForTimeout(400);
  await page.click('#b-new'); await page.waitForTimeout(150); await page.evaluate(() => { for (const id of ['ng-intro', 'ng-guided']) { const i = document.getElementById(id); if (i && i.checked) i.click(); } }); await page.click('#ng-start'); await page.waitForTimeout(200);
  const r = await page.evaluate(() => {
    const G = NW.G, s = G.state, I = NW.Inv, out = [];
    const ok = (c, m) => out.push([!!c, m]);
    const runAct = (acts, pred) => { const a = acts.find(pred); if (!a) return false; if (a.disabled) return 'disabled:' + a.disabled; if (a.time) a.done(); else a.run(); return true; };
    // ---- day events
    const add = (type, area) => { const ev = { id: 'e' + (s.evSeq++), type, area, x: 200, y: 150, status: 'new', day: s.time.day, data: {} }; if (type === 'tracks') ev.data.note = 1; if (type === 'injured') ev.data.animal = 'deer'; if (type === 'anomaly') ev.data.kind = 'warmfire'; if (type === 'cache') ev.data.items = [['nails', 4], ['rope', 1]]; s.dayEvents.push(ev); return ev; };
    G.enterArea('f_1_2', 200, 170);
    let ev = add('dog', 'f_1_2');
    ok(runAct(NW.Events.actions({ ev }), (a) => a.label === 'Free the dog') === true && s.dog && s.dog.status === 'following', 'free trapped dog -> follows');
    G.enterArea('f_2_2', 240, 200); ok(s.dog.area === 'f_2_2', 'dog follows across areas');
    G.enterCabin('front'); ok(s.dog.status === 'home', 'dog stays home once inside');
    I.add(s.inv, 'raw_rabbit', 1); s.dog.fedDay = 0;
    ok(runAct(NW.Events.dogActions(), (a) => a.label.startsWith('Feed')) === true && s.dog.fedDay === s.time.day, 'feed the dog');
    ev = add('cache', 'f_1_2'); const n0 = I.count(s.inv, 'rope'); runAct(NW.Events.actions({ ev }), () => true); ok(I.count(s.inv, 'rope') === n0 + 1 && ev.status === 'done', 'search abandoned pack');
    ev = add('tracks', 'f_1_2'); runAct(NW.Events.actions({ ev }), () => true); ok((s.journal.rules.lighthunter || []).includes(1), 'strange tracks note teaches a rule'); NW.UI.closeAll();
    ev = add('injured', 'f_1_2'); I.add(s.inv, 'yarrow', 1); runAct(NW.Events.actions({ ev }), (a) => a.label.startsWith('Tend')); ok(s.giftPending && ev.status === 'done', 'tend injured deer -> gift pending');
    ev = add('anomaly', 'f_1_2'); s.player.temp = 35; runAct(NW.Events.actions({ ev }), () => true); ok(s.player.temp > 35.5, 'warm campfire anomaly warms'); NW.UI.closeAll();
    ev = add('supply', 'f_1_2'); const nn = I.count(s.inv, 'nails') + I.count(s.inv, 'canned') + I.count(s.inv, 'ammo'); runAct(NW.Events.actions({ ev }), () => true); ok(ev.status === 'done', 'open supply crate');
    G.enterArea('f_1_2', 200, 170); ev = add('hiker', 'f_1_2');
    const hacts = NW.Events.actions({ ev }); const rep0 = s.rep; runAct(hacts, (a) => a.label === 'Point south'); ok(s.rep === rep0 + 1, 'point lost hiker the right way (south from Red Cairn Woods)');
    // ---- loot containers
    const lootObj = NW.World.get('f_0_2').objs.find((o) => o.type === 'loot'); G.enterArea('f_0_2', 200, 200);
    const inv0 = JSON.stringify(s.inv); runAct(NW.Objects.actions(lootObj), () => true); ok(JSON.stringify(s.inv) !== inv0 && s.world.loot.f_0_2 === s.time.day, 'loot trapper chest');
    ok(NW.Objects.actions(lootObj)[0].disabled, 'container empty until refilled');
    // ---- cabin objects
    G.enterArea('room_main', 120, 140);
    const door = NW.World.get('room_main').objs.find((o) => o.did === 'front');
    s.inv.fill(null); I.add(s.inv, 'plank', 6); I.add(s.inv, 'nails', 10); I.add(s.inv, 'rope', 1); I.add(s.inv, 'scrap', 1);
    s.cabin.doors.front.hp = 50; s.cabin.doors.front.lockBroken = true;
    runAct(NW.Cabin.doorActions(door), (a) => a.label.startsWith('Repair door')); ok(s.cabin.doors.front.hp === 100, 'repair door');
    runAct(NW.Cabin.doorActions(door), (a) => a.label.startsWith('Reinforce')); ok(s.cabin.doors.front.reinforced && s.cabin.doors.front.max === 160, 'reinforce door');
    runAct(NW.Cabin.doorActions(door), (a) => a.label.startsWith('Repair lock')); ok(!s.cabin.doors.front.lockBroken, 'repair lock');
    runAct(NW.Cabin.doorActions(door), (a) => a.label === 'Lock'); ok(s.cabin.doors.front.locked, 'lock door');
    const win = NW.World.get('room_main').objs.find((o) => o.wid === 'w_front_r');
    s.cabin.windows.w_front_r.shutter = 20; runAct(NW.Cabin.windowActions(win), (a) => a.label.startsWith('Repair shutters')); ok(s.cabin.windows.w_front_r.shutter === 100, 'repair shutters');
    runAct(NW.Cabin.windowActions(win), (a) => a.label === 'Close shutters'); ok(s.cabin.windows.w_front_r.shutClosed, 'close shutters');
    I.add(s.inv, 'glass', 1); s.cabin.windows.w_front_r.glass = 0; runAct(NW.Cabin.windowActions(win), (a) => a.label.startsWith('Replace glass')); ok(s.cabin.windows.w_front_r.glass === 100, 'replace glass');
    const lamp = NW.World.get('room_main').objs.find((o) => o.type === 'lamp'); runAct(NW.Objects.actions(lamp), () => true); ok(s.lamps.room_main, 'light lamp');
    const drum = NW.World.get('room_storage').objs.find((o) => o.type === 'drum'); s.oil = 10; I.add(s.inv, 'oil', 1); runAct(NW.Objects.actions(drum), () => true); ok(s.oil === 40, 'pour oil into drum');
    const ward = NW.World.get('room_bed').objs.find((o) => o.type === 'wardrobe'); runAct(NW.Objects.actions(ward), () => true); ok(s.player.coat === 'parka', 'wear parka');
    const wb = NW.World.get('room_main').objs.find((o) => o.type === 'woodbox'); I.add(s.inv, 'wood', 3); const wb0 = s.woodbox; runAct(NW.Objects.actions(wb), (a) => a.label.startsWith('Store')); ok(s.woodbox > wb0, 'store wood in wood box');
    const wp = NW.World.get('f_2_2').objs.find((o) => o.type === 'woodpile_ext'); const wp0 = s.woodpile; G.enterArea('f_2_2', 120, 180); runAct(NW.Objects.actions(wp), (a) => a.label.startsWith('Take')); ok(s.woodpile < wp0, 'take wood from outdoor woodpile');
    // stove from wood box when pack empty
    G.enterArea('room_main', 64, 66); I.remove(s.inv, 'wood', 99); s.stove.fuel = 5; const box0 = s.woodbox;
    runAct(NW.Cabin.stoveActions(), (a) => a.label.startsWith('Add a log')); ok(s.woodbox === box0 - 1 && s.stove.fuel === 15, 'stove pulls from wood box');
    // eating & medicine
    s.player.hunger = 20; I.add(s.inv, 'canned', 1); NW.Survival.eat(NW.Inv.bestOf(s.inv, NW.D.FOOD_ORDER)); ok(s.player.hunger >= 48, 'quick eat');
    s.player.hp = 40; I.add(s.inv, 'poultice', 1); NW.Survival.useMed('poultice'); ok(s.player.hp === 70, 'poultice heals 30');
    I.add(s.inv, 'raw_venison', 1); s.player.hunger = 50; s.player.hp = 90; NW.Survival.eat('raw_venison'); ok(s.player.sick > 0, 'raw meat makes you sick');
    s.player.sick = 0;
    // drop & pick up
    G.dropItem('cloth', 2); const d = s.drops.find((x) => x.id === 'cloth'); const pc = I.count(s.inv, 'cloth');
    G.dynamicActions({ type: 'drop', d })[0].run(); ok(I.count(s.inv, 'cloth') === pc + 2 && !s.drops.includes(d), 'pick up dropped item');
    // inventory overflow drops
    const inv2 = s.inv.slice(); for (let i = 0; i < s.inv.length; i++) s.inv[i] = { id: 'canned', n: 4 };
    const before = s.drops.length; NW.Inv.give('berries', 3); ok(s.drops.length === before + 1, 'full pack drops overflow'); s.inv = inv2; s.drops = [];
    // guest needs
    const vid = NW.Night.genVisitor(4, false); const v = s.visitors[vid]; v.need = 'food'; s.guests.push({ vid, satisfied: false }); I.add(s.inv, 'cooked_rabbit', 1);
    runAct(NW.Night.guestActions(s.guests[0]), (a) => a.label.startsWith('Give')); ok(s.guests[0].satisfied, 'feed a sheltered guest');
    // world anomalies
    s.world.loop = { area: 'f_1_1', dir: 'e' }; G.enterArea('f_1_1', 476, 136); s.player.x = 479; NW.debug.step(0.05); ok(s.player.area === 'f_1_1' && s.player.x < 20, 'looping trail returns to same area');
    s.world.loop = null; s.world.cairnArea = 'f_2_1'; s.world.cairnPos = null; const objs = NW.Events.objectsFor('f_2_1'); ok(objs.some((o) => o.type === 'cairn') && !NW.Events.objectsFor('f_1_2').some((o) => o.type === 'cairn'), 'cairn moves to another area');
    G.enterArea('f_2_1', 200, 150); NW.Events.examineCairn(); NW.UI.closeAll(); ok(s.world.cairnSeen === 'f_2_1', 'moved cairn noted on map');
    s.world.bridgeOut = true; const a = NW.World.get('f_3_2'); ok(NW.World.blocked(a, 18 * 16, 8 * 16, 8, 4), 'washed-out bridge blocks crossing');
    ok(!NW.World.blocked(a, 4 * 16, 8 * 16 + 2, 8, 4), 'west trail still walkable');
    s.world.bridgeOut = false;
    return out;
  });
  r.forEach(([c, m]) => check(c, m));
  console.log('# Monsters vs countermeasures');
  const m = await page.evaluate(() => {
    const G = NW.G, s = G.state, out = [];
    const ok = (c, msg) => out.push([!!c, msg]);
    NW.UI.closeAll(); G.paused = false;
    s.time.day = 6; s.time.min = 18 * 60 + 59.5; NW.debug.step(0.5); NW.UI.closeAll(); G.paused = false;
    ok(s.night.active && s.night.n === 6, 'night 6 begins');
    s.time.min = 21 * 60;
    G.enterArea('room_main', 120, 150);
    // scratcher brace
    s.cabin.doors.back.locked = true; NW.Night.scratcherStart('back'); NW.debug.step(15);
    ok(s.night.sc.stage === 'door', 'scratcher reaches the back door');
    const hp0 = s.cabin.doors.back.hp; NW.debug.step(3); ok(s.cabin.doors.back.hp < hp0, 'locked door takes claw damage');
    s.player.stamina = 100; NW.Night.brace('back'); ok(s.night.sc.stage === 'none' && s.player.stamina === 65, 'bracing drives it off (costs stamina)');
    // unlocked door -> inside
    s.cabin.doors.front.locked = false; s.cabin.doors.front.lockBroken = false; s.player.hp = 100; NW.Night.scratcherStart('front'); NW.debug.step(21);
    ok(s.player.hp < 65, 'unlocked door lets the Scratcher in (hp ' + s.player.hp.toFixed(0) + ')');
    // siphon & smokeweed
    s.player.hp = 100; s.stove.setting = 'medium'; s.stove.fuel = 50; NW.Night.siphonStart(); const f0 = s.stove.fuel; NW.debug.step(5);
    ok(f0 - s.stove.fuel > 1.9, 'siphon triples fuel burn (' + (f0 - s.stove.fuel).toFixed(2) + ' in 5s)');
    NW.Night.smokeweed(); ok(s.night.si.stage === 'none', 'smokeweed drives siphon off');
    s.night.plan.siphon = []; NW.Night.siphonStart(); s.stove.setting = 'off'; NW.debug.step(13); ok(s.night.si.stage === 'none', 'starving the fire makes siphon leave' + (s.night.si.stage === 'none' ? '' : ' ' + JSON.stringify({ si: s.night.si, paused: NW.G.paused, dead: NW.G.dead, mode: NW.G.mode, active: s.night.active, min: s.time.min, top: NW.UI.top(), hp: s.player.hp }))); s.stove.setting = 'medium';
    // dweller
    s.night.dd.cool = 0; s.night.dd.meter = 99; for (const r in s.lamps) s.lamps[r] = false; G.enterArea('room_bed', 100, 120); s.player.hp = 100; NW.debug.step(1.5);
    ok(s.player.hp <= 71, 'Dark Dweller strikes in a dark room (hp ' + s.player.hp.toFixed(0) + ')');
    s.night.dd.cool = 0; s.night.dd.meter = 99; s.lamps.room_bed = true; s.player.hp = 100; NW.debug.step(1.5);
    ok(s.player.hp >= 99, 'lit room: it recoils instead');
    // stag
    s.lamps.room_bed = false; G.enterArea('f_1_3', 240, 150); s.player.hp = 100; NW.debug.step(29);
    ok(s.night.stag.stage === 'hunting' || s.player.hp < 100, 'Pale Stag hunts a ranger in the woods at night (' + s.night.stag.stage + ')');
    NW.debug.step(10); ok(s.player.hp < 65, 'and catches a walking ranger (hp ' + s.player.hp.toFixed(0) + ')');
    G.enterArea('f_2_2', 240, 220); NW.debug.step(1); ok(s.night.stag.stage === 'none', 'the clearing is safe');
    // wolves by day
    s.time.min = 10 * 60; s.night.active = false; G.enterArea('f_4_4', 240, 150);
    s.animals = { area: 'f_4_4', list: [{ type: 'wolf', x: 300, y: 150, vx: 0, vy: 0, t: 1, face: 1, hp: 2, state: 'idle' }] };
    s.player.hp = 100; NW.debug.step(6); ok(s.player.hp < 100, 'wolf attacks (hp ' + s.player.hp.toFixed(0) + ')');
    G.shootCd = 0; NW.Inv.add(s.inv, 'ammo', 5); const w = s.animals.list[0]; G.shoot(w.x, w.y - 6); G.shootCd = 0; G.shoot(w.x, w.y - 6);
    ok(w.dead, 'two shots kill a wolf');
    return out;
  });
  m.forEach(([c, msg]) => check(c, msg));
  console.log('# Errors: ' + errors.length); errors.forEach((e) => console.log('  ' + e));
  console.log(fails ? fails + ' FAILURES' : 'ALL PASSED');
  await browser.close(); process.exit(fails ? 1 : 0);
})();
