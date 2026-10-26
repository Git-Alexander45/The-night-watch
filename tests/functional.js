// Functional test: drives the real game in Chromium and asserts on state.
const { chromium } = require('playwright');
const OUT = process.env.OUT || '/tmp/shots';
let fails = 0;
function check(cond, msg) { if (cond) console.log('  ok  ' + msg); else { fails++; console.log('  FAIL ' + msg); } }
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 816 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
  await page.goto('http://localhost:8123/index.html?view=2d');
  await page.waitForTimeout(600);
  const ev = (fn, arg) => page.evaluate(fn, arg);

  console.log('# New game');
  await page.click('#b-new'); await page.waitForTimeout(150); await page.evaluate(() => { for (const id of ['ng-intro', 'ng-guided']) { const i = document.getElementById(id); if (i && i.checked) i.click(); } }); await page.click('#ng-start');
  await page.waitForTimeout(300);
  let s = await ev(() => ({ day: NW.G.state.time.day, area: NW.G.state.player.area, mode: NW.G.mode, saved: !!localStorage.getItem('nightwatch.save') }));
  check(s.day === 1 && s.area === 'room_main' && s.mode === 'play', 'starts day 1 in main room');
  check(s.saved, 'initial save written');

  console.log('# Movement & collision');
  const p0 = await ev(() => ({ x: NW.G.state.player.x, y: NW.G.state.player.y }));
  await page.keyboard.down('KeyD'); await page.waitForTimeout(500); await page.keyboard.up('KeyD');
  const p1 = await ev(() => ({ x: NW.G.state.player.x, y: NW.G.state.player.y }));
  check(p1.x > p0.x + 15, 'walking right moves player (' + p0.x.toFixed(1) + ' -> ' + p1.x.toFixed(1) + ')');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(3000); await page.keyboard.up('KeyW');
  const p2 = await ev(() => ({ x: NW.G.state.player.x, y: NW.G.state.player.y, area: NW.G.state.player.area }));
  check(p2.y >= 30 || p2.area !== 'room_main', 'top wall stops player (y=' + p2.y.toFixed(1) + ', area ' + p2.area + ')');

  console.log('# Stove interaction via keys');
  await ev(() => { NW.G.enterArea('room_main', 64, 66, 'up'); });
  await page.waitForTimeout(200);
  let f = await ev(() => NW.G.focus && NW.G.focus.name);
  check(f && f.startsWith('Wood stove'), 'stove is focused near it: ' + f);
  await page.keyboard.press('Digit4'); await page.waitForTimeout(100);
  check(await ev(() => NW.G.state.stove.setting) === 'high', 'key 4 sets HIGH');
  const fuel0 = await ev(() => NW.G.state.stove.fuel);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(100);
  const fuel1 = await ev(() => NW.G.state.stove.fuel);
  check(fuel1 > fuel0 + 9, 'E adds a log (' + fuel0.toFixed(1) + ' -> ' + fuel1.toFixed(1) + ')');
  await page.keyboard.press('Digit2');
  check(await ev(() => NW.G.state.stove.setting) === 'low', 'key 2 sets LOW');
  await page.screenshot({ path: OUT + '/f-stove.png' });

  console.log('# Going outside and gathering wood');
  await ev(() => { NW.G.enterArea('room_main', 176, 186, 'down'); });
  await page.waitForTimeout(150);
  f = await ev(() => NW.G.focus && NW.G.focus.name);
  check(f && f.startsWith('Front door'), 'front door focused: ' + f);
  const goIdx = await ev(() => NW.G.focus.actions.findIndex((a) => a.label === 'Go outside'));
  await page.keyboard.press('Digit' + (goIdx + 1)); await page.waitForTimeout(200);
  check(await ev(() => NW.G.state.player.area) === 'f_2_2', 'went outside to clearing');
  const br = await ev(() => { const a = NW.World.get('f_1_2'); const b = a.objs.find((o) => o.type === 'branches' && NW.Objects.available(o)); return b && { x: b.x, y: b.y }; });
  check(!!br, 'found branches in f_1_2');
  await ev((b) => { NW.G.enterArea('f_1_2', b.x, b.y + 10, 'up'); }, br);
  await page.waitForTimeout(200);
  const wood0 = await ev(() => NW.Inv.count(NW.G.state.inv, 'wood'));
  f = await ev(() => NW.G.focus && NW.G.focus.name);
  check(f === 'Fallen branches', 'branches focused: ' + f);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(1100);
  const wood1 = await ev(() => NW.Inv.count(NW.G.state.inv, 'wood'));
  check(wood1 > wood0, 'gathering branches gives wood (' + wood0 + ' -> ' + wood1 + ')');
  const dt = await ev(() => { const a = NW.World.get('f_1_2'); const b = a.objs.find((o) => o.type === 'deadtree' && NW.Objects.available(o)); return b && { x: b.x, y: b.y }; });
  if (dt) {
    await ev((b) => { NW.G.enterArea('f_1_2', b.x, b.y + 9, 'up'); }, dt);
    await page.waitForTimeout(150);
    await page.keyboard.press('KeyE'); await page.waitForTimeout(2900);
    const wood2 = await ev(() => NW.Inv.count(NW.G.state.inv, 'wood'));
    check(wood2 >= wood1 + 3, 'chopping dead tree gives 3 wood (' + wood1 + ' -> ' + wood2 + ')');
  }
  await page.screenshot({ path: OUT + '/f-forest.png' });

  console.log('# Area edge transition');
  await ev(() => { NW.G.enterArea('f_2_2', 240, 266, 'down'); });
  await page.keyboard.down('KeyS'); await page.waitForTimeout(500); await page.keyboard.up('KeyS');
  check(await ev(() => NW.G.state.player.area) === 'f_2_3', 'walking off south edge enters Abandoned Camp');

  console.log('# Hunting');
  const hunt = await ev(() => {
    const G = NW.G, s = G.state;
    G.enterArea('f_2_3', 240, 200, 'up');
    s.animals.list = [{ type: 'rabbit', x: 240, y: 150, vx: 0, vy: 0, t: 5, face: 1, hp: 1, state: 'idle' }];
    const ammo0 = NW.Inv.count(s.inv, 'ammo');
    G.mouse.moved = true; G.mouse.x = 240; G.mouse.y = 146; G.shootCd = 0;
    G.shoot(240, 146);
    return { dead: s.animals.list[0].dead, ammo: ammo0 - NW.Inv.count(s.inv, 'ammo') };
  });
  check(hunt.dead && hunt.ammo === 1, 'shooting a rabbit kills it and uses a round');
  await ev(() => { NW.G.state.player.x = 240; NW.G.state.player.y = 162; });
  await page.waitForTimeout(150);
  f = await ev(() => NW.G.focus && NW.G.focus.name);
  check(f === 'Dead rabbit', 'carcass focused: ' + f);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(2100);
  check(await ev(() => NW.Inv.count(NW.G.state.inv, 'raw_rabbit')) === 1, 'butchering yields raw rabbit');

  console.log('# Cooking');
  await ev(() => { NW.G.state.stove.setting = 'medium'; NW.G.enterArea('room_main', 120, 60, 'up'); });
  await page.waitForTimeout(150);
  f = await ev(() => NW.G.focus && NW.G.focus.name);
  check(f && f.startsWith('Cooking station'), 'cooking station focused: ' + f);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(3900);
  check(await ev(() => NW.Inv.count(NW.G.state.inv, 'cooked_rabbit')) === 1, 'cooked rabbit produced');
  const hung = await ev(() => { const s = NW.G.state; s.player.hunger = 40; NW.Survival.eat('cooked_rabbit'); return s.player.hunger; });
  check(hung >= 67, 'eating restores hunger (' + hung + ')');

  console.log('# Storage & chest UI');
  await ev(() => { NW.G.enterArea('room_storage', 40, 60, 'up'); });
  await page.waitForTimeout(150);
  f = await ev(() => NW.G.focus && NW.G.focus.name);
  check(f === 'Storage chest', 'chest focused: ' + f);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(200);
  check(await ev(() => NW.UI.isOpen('chest')), 'chest panel opens');
  const before = await ev(() => NW.Inv.count(NW.G.state.chest, 'nails'));
  await page.click('.panel-chest .slot[data-side="c"][data-i="3"]');
  const after = await ev(() => ({ c: NW.Inv.count(NW.G.state.chest, 'nails'), p: NW.Inv.count(NW.G.state.inv, 'nails'), slot: NW.G.state.chest[3] }));
  check(after.p > 0 || after.c !== before, 'clicking a chest slot transfers items (pack nails ' + after.p + ')');
  await page.screenshot({ path: OUT + '/f-chest.png' });
  await page.keyboard.press('Escape');
  check(!(await ev(() => NW.UI.isOpen('chest'))), 'Esc closes panel');

  console.log('# Saw a plank and repair');
  await ev(() => { const s = NW.G.state; NW.Inv.add(s.inv, 'wood', 4); NW.G.enterArea('room_storage', 145, 108, 'up'); });
  await page.waitForTimeout(150);
  f = await ev(() => NW.G.focus && NW.G.focus.name);
  check(f === 'Sawhorse', 'sawhorse focused: ' + f);
  const pl0 = await ev(() => NW.Inv.count(NW.G.state.inv, 'plank'));
  await page.keyboard.press('KeyE'); await page.waitForTimeout(2800);
  check(await ev(() => NW.Inv.count(NW.G.state.inv, 'plank')) === pl0 + 1, 'saw produces a plank');

  console.log('# Regression: sprinting through doorways, walking on the Lake Wren dock');
  const sprintCases = [['room_main', 60, 112, 'KeyA', 'room_bed'], ['room_bed', 150, 96, 'KeyD', 'room_main'], ['room_main', 300, 112, 'KeyD', 'room_office'], ['room_office', 60, 96, 'KeyA', 'room_main'], ['room_main', 176, 70, 'KeyW', 'room_storage'], ['room_storage', 128, 110, 'KeyS', 'room_main']];
  for (const [from, x, y, key, to] of sprintCases) {
    await ev(([f, x, y]) => { NW.UI.closeAll(); NW.G.state.player.stamina = 100; NW.G.enterArea(f, x, y, 'down'); }, [from, x, y]);
    await page.waitForTimeout(120);
    await page.keyboard.down('ShiftLeft'); await page.keyboard.down(key); await page.waitForTimeout(1500); await page.keyboard.up(key); await page.keyboard.up('ShiftLeft');
    check(await ev(() => NW.G.state.player.area) === to, 'sprint ' + from + ' -> ' + to);
  }
  await ev(() => NW.G.enterArea('f_2_0', 240, 160, 'up')); await page.waitForTimeout(120);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1600); await page.keyboard.up('KeyW');
  const dockY = await ev(() => NW.G.state.player.y);
  check(dockY < 80, 'can walk out to the end of the Lake Wren dock (y=' + dockY.toFixed(0) + ')');
  check(await ev(() => NW.World.get('f_2_0').objs.find((o) => o.sprite === 'dock').layer === 'floor'), 'dock is drawn under the player');

  console.log('# Errors so far: ' + errors.length);
  errors.forEach((e) => console.log('   ' + e));
  console.log(fails ? fails + ' FAILURES' : 'ALL PASSED');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
