// Places: fire tower cab, trapper's shack, Hollow Mine — entrances, furniture, loot, mine hazard, saving inside.
const { chromium } = require('playwright');
const SHOTS = process.env.SHOTS || '/tmp/shots';
let fails = 0; const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://localhost:8123/index.html?view=2d'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(400);
  const ev = (f, a) => page.evaluate(f, a);
  const shot = (n) => page.locator('#game').screenshot({ path: SHOTS + '/places-' + n + '.png' });
  const shotFull = (n) => page.screenshot({ path: SHOTS + '/places-' + n + '.png' });
  await ev(() => {
    NW.G.newGame({ mode: 'standard', seed: 1234, intro: false, guided: false });
    NW.UI.closeAll(); NW.G.state.time.day = 3; NW.G.state.time.min = 10 * 60;
    window.entered = []; NW.Hooks.on('placeEntered', (id) => window.entered.push(id));
  });
  await page.waitForTimeout(100);
  // test helpers: stand somewhere, let the game pick a focus, act
  const helpers = () => ev(() => { window.T = {
      at(x, y, dir) { const p = NW.G.state.player; p.x = x; p.y = y; p.dir = dir || 'up'; NW.G.hold = null; NW.debug.step(0.05); const f = NW.G.focus; return f ? { name: f.name, acts: f.actions.map((a) => a.label + (a.disabled ? '#off' : '')) } : null; },
      act(i, sec) { NW.G.doAction(i || 0); if (sec) NW.debug.step(sec); },
      inv: (id) => NW.Inv.count(NW.G.state.inv, id),
      // every focusable object in the area can be reached on foot from (sx, sy)
      reach(sx, sy) {
        const a = NW.G.area, W = NW.World, seen = new Set(), q = [[sx, sy]], ok = [];
        const free = (x, y) => !W.blocked(a, x - 5, y - 4, 10, 5);
        while (q.length) { const [x, y] = q.pop(); const k = x + ',' + y; if (seen.has(k)) continue; seen.add(k); ok.push([x, y]); [[4, 0], [-4, 0], [0, 4], [0, -4]].forEach(([dx, dy]) => { const nx = x + dx, ny = y + dy; if (nx > 0 && ny > 0 && nx < a.w * 16 && ny < a.h * 16 && !seen.has(nx + ',' + ny) && free(nx, ny)) q.push([nx, ny]); }); }
        const objs = a.objs.filter((o) => NW.Objects.name(o));
        const miss = objs.filter((o) => { const r = o.cx != null ? { x: o.cx, y: o.cy, w: o.cw, h: o.ch } : { x: o.x - 7, y: o.y - 10, w: 14, h: 12 }; return !ok.some(([x, y]) => NW.U.distToRect(x, y - 5, r) < 12); }).map((o) => NW.Objects.name(o));
        const exits = a.exits.filter((e) => !ok.some(([x, y]) => x >= e.x && x < e.x + e.w && y - 2 >= e.y - 6)).length;
        return { n: objs.length, miss, exits, cells: ok.length };
      },
    };
  });
  await helpers();

  console.log('# API');
  const api = await ev(() => ({ ids: NW.Places.ids, areas: ['in_tower', 'in_shack', 'in_mine'].map((id) => !!NW.World.areaDef(id)),
    spots: ['in_tower', 'in_shack', 'in_mine'].map((id) => { const p = NW.Places.spot(id); const a = NW.World.get(id); return p && !NW.World.blocked(a, p.x - 10, p.y - 8, 20, 10, null, true) ? 1 : 0; }), none: NW.Places.spot('f_2_2') }));
  check(api.ids.tower === 'in_tower' && api.ids.shack === 'in_shack' && api.ids.mine === 'in_mine', 'NW.Places.ids');
  check(api.areas.every(Boolean), 'three interiors registered');
  check(api.spots.join() === '1,1,1' && api.none === null, 'spot() returns a free floor point in each interior (null elsewhere)');

  console.log('# Fire tower');
  await ev(() => NW.G.enterArea('f_0_0', 320, 134, 'up')); await page.waitForTimeout(300);
  let f = await ev(() => T.at(320, 134, 'up'));
  check(f && f.name === 'Old fire tower' && f.acts[0] === 'Climb the ladder' && f.acts.includes('Examine'), 'tower foot: climb the ladder, still examine (' + JSON.stringify(f) + ')');
  await shot('entrance-tower');
  await page.keyboard.press('KeyE'); await page.waitForTimeout(50);
  check(await ev(() => NW.G.hold && NW.G.hold.label === 'Climb the ladder'), 'climbing is a hold action');
  await ev(() => NW.debug.step(2.4));
  let st = await ev(() => ({ a: NW.G.area.id, e: window.entered.slice(), mus: NW.Hooks.filter('music', 'day', NW.G.state, NW.G.area) }));
  check(st.a === 'in_tower' && st.e[0] === 'in_tower', 'reached the cab; placeEntered(in_tower) emitted');
  check(st.mus === 'interior', 'interior music in the cab');
  check(await ev(() => { const r = T.reach(128, 134); return r.miss.length === 0 && r.exits === 0 && r.n >= 4; }), 'every tower object and the hatch reachable: ' + JSON.stringify(await ev(() => T.reach(128, 134))));
  await ev(() => NW.UI.clearMsgs()); await page.waitForTimeout(300);
  await shot('tower-day');
  f = await ev(() => T.at(128, 56, 'up'));
  check(f && f.name === 'Lookout binoculars', 'binoculars: ' + JSON.stringify(f));
  await ev(() => T.act(0)); await page.waitForTimeout(900);
  st = await ev(() => ({ open: NW.UI.isOpen('pl_view'), cap: document.getElementById('pl-view-cap').textContent, vis: ['f_3_1', 'f_0_2', 'f_4_0'].every((id) => NW.G.state.world.visited[id]), j: NW.G.state.journal.entries.some((e) => /From the fire tower/.test(e.text)) }));
  check(st.open && /Station 7/.test(st.cap) && /shack/.test(st.cap), 'lookout panorama with observations: ' + st.cap.slice(0, 120));
  check(st.vis && st.j, 'landmarks sketched onto the map; journal note');
  await shotFull('view-day');
  await ev(() => { NW.UI.closeAll(); NW.G.state.time.min = 23 * 60; NW.G.state.stove.setting = 'high'; NW.G.state.stove.fuel = 40; NW.UI.open('pl_view'); }); await page.waitForTimeout(900);
  await shotFull('view-night');
  await ev(() => NW.UI.closeAll());
  f = await ev(() => T.at(38, 56, 'up'));
  check(f && /Metal cabinet/.test(f.name) && f.acts[0] === 'Search the cabinet', 'cabinet: ' + JSON.stringify(f));
  let before = await ev(() => ({ oil: T.inv('oil'), glass: T.inv('glass'), ammo: T.inv('ammo') }));
  await ev(() => T.act(0, 2));
  let after = await ev(() => ({ oil: T.inv('oil'), glass: T.inv('glass'), ammo: T.inv('ammo'), flare: T.inv('signal_flare'), fin: !!NW.D.ITEMS.signal_flare }));
  check(after.oil > before.oil && after.glass > before.glass && after.ammo > before.ammo && (!after.fin || after.flare === 1), 'cabinet salvage: oil, glass, rounds, flare ' + JSON.stringify(after));
  f = await ev(() => T.at(38, 56, 'up'));
  check(f && /searched/.test(f.name) && /#off/.test(f.acts[0]), 'cabinet empty until it refills');
  check(await ev(() => { NW.G.state.time.day += 2; const f = T.at(38, 56, 'up'); NW.G.state.time.day -= 2; return f && !/#off/.test(f.acts[0]); }), 'cabinet refills two days later');
  f = await ev(() => T.at(52, 92, 'left'));
  check(f && f.name === 'Canvas cot', 'cot: ' + JSON.stringify(f));
  await ev(() => { NW.G.state.player.stamina = 30; T.act(0, 3.2); });
  check(await ev(() => NW.G.state.player.stamina === 100), 'resting on the cot restores stamina');
  f = await ev(() => T.at(226, 86, 'up'));
  check(f && /logbook/.test(f.name), 'logbook: ' + JSON.stringify(f));
  await ev(() => T.act(0)); await page.waitForTimeout(200);
  for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(60); }
  st = await ev(() => ({ open: NW.UI.isOpen('pl_log'), txt: document.querySelector('.pl-log').textContent, j: NW.G.state.journal.entries.some((e) => /logbook/.test(e.text)) }));
  check(st.open && /follow the light/.test(st.txt) && st.j, 'logbook pages turn to the last entry; journal note');
  await shotFull('logbook');
  await ev(() => NW.UI.closeAll());
  // map marker at the landmark while inside
  await ev(() => NW.UI.open('map')); await page.waitForTimeout(150);
  const px = await ev(() => { const c = document.getElementById('map-c'); NW.Render.map(c, { player: true }); const d = c.getContext('2d').getImageData(6 + 320 / 16 * 3, 6 + 128 / 16 * 3, 1, 1).data; return [d[0], d[1], d[2]]; });
  check((px[0] > 200 && px[1] < 60) || (px[0] > 240 && px[1] > 240), 'map shows the ranger at the fire tower while inside (' + px + ')');
  await shotFull('map-tower');
  await ev(() => { NW.UI.closeAll(); NW.G.state.time.min = 11 * 60; NW.G.state.player.x = 128; NW.G.state.player.y = 136; NW.G.state.player.dir = 'down'; });
  await page.keyboard.down('KeyS'); await page.waitForTimeout(700); await page.keyboard.up('KeyS'); await page.waitForTimeout(100);
  st = await ev(() => ({ a: NW.G.area.id, x: NW.G.state.player.x, y: NW.G.state.player.y }));
  check(st.a === 'f_0_0' && Math.abs(st.x - 320) < 20 && st.y > 125 && st.y < 160, 'walking through the hatch climbs down to the tower foot ' + JSON.stringify(st));

  console.log("# Trapper's shack");
  await ev(() => { NW.G.state.time.min = 21 * 60; NW.G.enterArea('f_0_2', 335, 110, 'up'); }); await page.waitForTimeout(300);
  f = await ev(() => T.at(335, 110, 'up'));
  check(f && f.name === "Trapper's shack" && /Go inside|Knock/.test(f.acts[0]), 'shack door: ' + JSON.stringify(f));
  await shot('entrance-shack');
  await ev(() => T.act(0)); await page.waitForTimeout(100);
  st = await ev(() => ({ a: NW.G.area.id, e: window.entered.slice(-1)[0] }));
  check(st.a === 'in_shack' && st.e === 'in_shack', 'inside the shack at night; placeEntered(in_shack)');
  check(await ev(() => { const r = T.reach(144, 150); return r.miss.length === 0 && r.exits === 0 && r.n >= 5; }), 'every shack object reachable: ' + JSON.stringify(await ev(() => T.reach(144, 150))));
  const sp = await ev(() => NW.Places.spot('in_shack'));
  check(sp && await ev((p) => { const r = T.reach(144, 150); void r; return !NW.World.blocked(NW.G.area, p.x - 6, p.y - 5, 12, 6); }, sp), 'trapper spot is clear floor ' + JSON.stringify(sp));
  f = await ev(() => T.at(46, 58, 'up'));
  check(f && /Potbelly stove — cold/.test(f.name) && /Light the stove/.test(f.acts[0]), 'cold stove at night: ' + JSON.stringify(f));
  const t0 = await ev(() => NW.Survival.envTemp());
  await ev(() => T.act(0));
  st = await ev(() => ({ t: NW.Survival.envTemp(), wood: T.inv('wood'), name: T.at(46, 58, 'up').name }));
  check(st.t - t0 > 12 && /burning/.test(st.name), 'lighting the stove warms the shack (' + t0.toFixed(1) + ' → ' + st.t.toFixed(1) + ')');
  await ev(() => NW.UI.clearMsgs()); await page.waitForTimeout(300);
  await shot('shack-night');
  f = await ev(() => T.at(140, 40, 'up'));
  check(f && f.name === 'Pelts and traps', 'pelt wall: ' + JSON.stringify(f));
  await ev(() => T.act(0)); check(await ev(() => NW.UI.isOpen('text')), 'pelts: look'); await ev(() => NW.UI.closeAll());
  f = await ev(() => T.at(124, 102, 'up'));
  check(f && f.name === "Trapper's table", 'table: ' + JSON.stringify(f));
  await ev(() => T.act(0)); check(await ev(() => NW.UI.isOpen('text') && /LINES/.test(document.querySelector('.panel-text').textContent)), 'trap ledger'); await ev(() => NW.UI.closeAll());
  f = await ev(() => T.at(240, 84, 'up'));
  check(f && f.name === "Garrow's bunk", 'bunk: ' + JSON.stringify(f));
  f = await ev(() => T.at(37, 148, 'up'));
  check(f && /Supply crate/.test(f.name), 'crate: ' + JSON.stringify(f));
  before = await ev(() => T.inv('canned')); await ev(() => T.act(0, 2));
  check(await ev((b) => T.inv('canned') > b, before), 'crate gives supplies');
  await ev(() => { NW.G.state.player.x = 144; NW.G.state.player.y = 150; NW.G.state.player.dir = 'down'; });
  await page.keyboard.down('KeyS'); await page.waitForTimeout(700); await page.keyboard.up('KeyS'); await page.waitForTimeout(100);
  check(await ev(() => NW.G.area.id === 'f_0_2'), 'walking out of the shack door at night');
  await page.waitForTimeout(300); await shot('entrance-shack-smoke-night');

  console.log('# Hollow Mine');
  await ev(() => { const s = NW.G.state; s.inv.forEach((it, i) => { if (it && it.id !== 'wood' && it.id !== 'ammo') s.inv[i] = null; }); s.time.min = 10 * 60; s.time.day = 4; NW.G.enterArea('f_3_1', 128, 100, 'up'); }); await page.waitForTimeout(300);
  f = await ev(() => T.at(128, 100, 'up'));
  check(f && f.name === 'Hollow Mine entrance' && f.acts[0] === 'Pry the boards loose', 'boarded mine: ' + JSON.stringify(f));
  await ev(() => T.act(0, 2.8));
  f = await ev(() => T.at(128, 100, 'up'));
  check(f && f.acts[0] === 'Enter the mine', 'boards pried: enter the mine');
  await page.waitForTimeout(150); await shot('entrance-mine');
  await ev(() => T.act(0)); await page.waitForTimeout(100);
  st = await ev(() => ({ a: NW.G.area.id, e: window.entered.slice(-1)[0], mus: NW.Hooks.filter('music', 'day', NW.G.state, NW.G.area) }));
  check(st.a === 'in_mine' && st.e === 'in_mine' && st.mus === 'mine', 'inside the mine; placeEntered(in_mine); mine music');
  check(await ev(() => { const r = T.reach(80, 246); return r.miss.length === 0 && r.exits === 0 && r.n >= 8; }), 'every mine object reachable: ' + JSON.stringify(await ev(() => T.reach(80, 246))));
  f = await ev(() => T.at(68, 150, 'up')); check(f && f.name === "Foreman's notice", 'notice: ' + JSON.stringify(f));
  await ev(() => T.act(0)); check(await ev(() => NW.UI.isOpen('text')), 'notice reads'); await ev(() => NW.UI.closeAll());
  f = await ev(() => T.at(176, 104, 'up')); check(f && /Ore cart/.test(f.name), 'ore cart: ' + JSON.stringify(f));
  before = await ev(() => T.inv('scrap')); await ev(() => T.act(0, 2)); check(await ev((b) => T.inv('scrap') > b, before), 'ore cart salvage');
  await ev(() => { NW.G.state.mods.places.dread = 0; });
  f = await ev(() => T.at(354, 86, 'up')); check(f && /Powder magazine/.test(f.name), 'magazine: ' + JSON.stringify(f));
  before = await ev(() => ({ ammo: T.inv('ammo'), glass: T.inv('glass') })); await ev(() => T.act(0, 2));
  check(await ev((b) => T.inv('ammo') > b.ammo && T.inv('glass') > b.glass, before), 'rare salvage from the magazine');
  f = await ev(() => T.at(418, 100, 'up')); check(f && f.name === 'The winze' && f.acts.length === 2, 'winze: ' + JSON.stringify(f));
  await ev(() => T.act(1)); check(await ev(() => NW.G.state.journal.entries.some((e) => /winze/.test(e.text))), 'drop a stone');
  f = await ev(() => T.at(296, 222, 'right')); check(f && /locker/.test(f.name), 'locker: ' + JSON.stringify(f));
  before = await ev(() => T.inv('bandage')); await ev(() => T.act(0, 2)); check(await ev((b) => T.inv('bandage') > b, before), 'locker: bandage');
  f = await ev(() => T.at(296, 222, 'right')); check(f && f.acts[0] === 'Look inside', 'locker is a one-time find');
  f = await ev(() => T.at(232, 150, 'up')); check(f && /Miner's lamp — dark/.test(f.name), 'lamp: ' + JSON.stringify(f));

  console.log('# Mine hazard');
  await ev(() => { NW.G.state.time.min = 23 * 60; const s = NW.G.state; s.player.hp = 100; s.mods.places.dread = 0; for (let i = 0; i < 6; i++) NW.Inv.remove(s.inv, 'oil', 9); NW.UI.clearMsgs(); });
  check(await ev(() => NW.Places.inLight(80, 240) && !NW.Places.inLight(380, 90)), 'entrance is lit, the deep drift is dark');
  await ev(() => { T.at(84, 236, 'up'); NW.debug.step(1); NW.UI.clearMsgs(); T.at(380, 92, 'up'); });
  await ev(() => NW.debug.step(3.5));
  st = await ev(() => ({ d: NW.G.state.mods.places.dread, msg: document.getElementById('hud-msgs').textContent }));
  check(st.d > 22 && st.d < 60 && /Whispering/.test(st.msg), 'darkness: the whispers start (telegraph 1) dread=' + st.d.toFixed(1) + ' ' + st.msg.slice(-160));
  await ev(() => NW.debug.step(6));
  st = await ev(() => ({ d: NW.G.state.mods.places.dread, hp: NW.G.state.player.hp, msg: document.getElementById('hud-msgs').textContent }));
  check(st.d >= 80 && st.hp === 100 && /your name/.test(st.msg), 'telegraph 2 and 3 before any harm (dread=' + st.d.toFixed(1) + ')');
  await page.waitForTimeout(200); await shot('mine-dread');
  await ev(() => NW.debug.step(2.5));
  st = await ev(() => ({ d: NW.G.state.mods.places.dread, hp: NW.G.state.player.hp, dead: NW.G.dead }));
  check(st.hp < 100 && st.hp >= 75 && !st.dead && st.d < 80, 'staying in the dark: something strikes (hp ' + st.hp.toFixed(1) + ')');
  await ev(() => { T.at(84, 236, 'down'); NW.debug.step(3); });
  st = await ev(() => ({ d: NW.G.state.mods.places.dread, hp: NW.G.state.player.hp }));
  check(st.d === 0, 'back in the entrance light the dread drains away');
  await ev(() => NW.Inv.add(NW.G.state.inv, 'oil', 2));
  f = await ev(() => T.at(384, 40, 'up')); check(f && /Miner's lamp/.test(f.name) && /Light the lamp/.test(f.acts[0]), 'deep lamp: ' + JSON.stringify(f));
  await ev(() => T.act(0));
  check(await ev(() => NW.Places.inLight(380, 90) && T.inv('oil') === 1), 'a lit lamp makes the deep drift safe (costs 1 Lamp Oil)');
  await ev(() => { T.at(380, 92, 'up'); NW.debug.step(6); });
  check(await ev(() => NW.G.state.mods.places.dread === 0), 'no dread inside lamplight');
  await ev(() => { NW.G.state.time.min = 11 * 60; T.at(250, 160, 'up'); NW.UI.clearMsgs(); }); await page.waitForTimeout(400);
  await shot('mine-lamp');

  console.log('# Save inside and reload');
  await ev(() => { T.at(176, 168, 'up'); NW.G.save('manual'); });
  await page.reload(); await page.waitForTimeout(400);
  await ev(() => NW.G.loadState(NW.Save.read(1).state)); await helpers(); await page.waitForTimeout(300);
  st = await ev(() => { const m = NW.G.state.mods.places; return { a: NW.G.area.id, x: NW.G.state.player.x, boards: m.boards, lamp: NW.Places.inLight(380, 90), taken: !!m.taken.mine_mag, shack: m.shackFuel > 0, mus: NW.Hooks.filter('music', 'day', NW.G.state, NW.G.area) }; });
  check(st.a === 'in_mine' && st.boards && st.lamp && st.taken && st.mus === 'mine', 'reload inside the mine keeps area, boards, lamps and loot ' + JSON.stringify(st));
  await ev(() => { NW.G.state.player.x = 80; NW.G.state.player.y = 250; NW.G.state.player.dir = 'down'; });
  await page.keyboard.down('KeyS'); await page.waitForTimeout(700); await page.keyboard.up('KeyS'); await page.waitForTimeout(100);
  st = await ev(() => ({ a: NW.G.area.id, x: NW.G.state.player.x, y: NW.G.state.player.y }));
  check(st.a === 'f_3_1' && Math.abs(st.x - 128) < 20 && st.y >= 96, 'walking out of the mine mouth ' + JSON.stringify(st));

  console.log('# Night and blizzard');
  await ev(() => { const s = NW.G.state; s.time.min = 22 * 60; s.weather.type = 'blizzard'; s.weather.wind = 1; s.weather.precip = 1; NW.G.enterArea('f_0_0', 320, 134, 'up'); });
  f = await ev(() => T.at(320, 134, 'up'));
  check(f && f.acts[0] === 'Climb the ladder', 'tower climbable in a blizzard at night');
  await ev(() => T.act(0, 3.5));
  check(await ev(() => NW.G.area.id === 'in_tower' && NW.G.state.night.stag.stage === 'none'), 'in the cab at night; the stag cannot follow');
  await ev(() => NW.UI.clearMsgs()); await page.waitForTimeout(400); await shot('tower-night-blizzard');
  await ev(() => { NW.G.state.player.x = 128; NW.G.state.player.y = 140; NW.G.state.player.dir = 'down'; });
  await page.keyboard.down('KeyS'); await page.waitForTimeout(700); await page.keyboard.up('KeyS'); await page.waitForTimeout(100);
  check(await ev(() => NW.G.area.id === 'f_0_0'), 'climbing down at night in a blizzard');
  await ev(() => { NW.G.enterArea('in_mine', 80, 246, 'up'); }); await page.waitForTimeout(300);
  await ev(() => NW.UI.clearMsgs()); await page.waitForTimeout(300); await shot('mine-night');
  await ev(() => { NW.G.enterArea('in_shack', 144, 150, 'up'); NW.UI.clearMsgs(); }); await page.waitForTimeout(400); await shot('shack-night-blizzard');

  console.log('# Old save without places data');
  await ev(() => { const s = NW.G.state; s.weather.type = 'clear'; s.weather.wind = 0.15; s.weather.precip = 0; s.time.min = 9 * 60; NW.G.enterArea('f_2_2', 240, 210, 'down'); delete s.mods.places; NW.G.save('manual'); });
  await page.reload(); await page.waitForTimeout(400);
  await ev(() => NW.G.loadState(NW.Save.read(1).state)); await helpers(); await page.waitForTimeout(200);
  st = await ev(() => { NW.G.enterArea('f_3_1', 128, 100, 'up'); const f = T.at(128, 100, 'up'); NW.G.enterArea('in_tower', 128, 134, 'up'); const g = T.at(38, 56, 'up'); NW.debug.step(1); return { f: f && f.acts[0], g: g && g.name, m: !!NW.G.state.mods.places }; });
  check(st.f === 'Pry the boards loose' && st.g === 'Metal cabinet' && st.m, 'old save loads; places state starts fresh ' + JSON.stringify(st));
  await ev(() => NW.G.enterArea('in_shack', 144, 150, 'up')); await page.waitForTimeout(500); await shot('shack-day');

  const he = await ev(() => NW.hookErrors || []);
  check(he.length === 0, 'no hook errors ' + he.slice(0, 2).join(' | '));
  check(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
  console.log(fails ? fails + ' FAILURES' : 'ALL PASSED');
  await b.close(); process.exit(fails ? 1 : 0);
})();
