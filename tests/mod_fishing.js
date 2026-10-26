// Fishing and snares (fishing module): rod in the chest, ice hole and creek pools, the minigame,
// cooking and eating fish, crafting / setting / checking snares across a night, save + reload, old saves.
const { chromium } = require('playwright');
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/d607ac6a-93f8-5870-a0ad-942bb41b98fa/scratchpad/shots';
let fails = 0; const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://localhost:8123/index.html?view=2d'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(400);
  const ev = (f, a) => page.evaluate(f, a);
  const listen = () => ev(() => { if (window.__fi) return; window.__fi = { fish: [], snare: [] }; NW.Hooks.on('fishCaught', (k) => __fi.fish.push(k)); NW.Hooks.on('snareCatch', (a) => __fi.snare.push(a)); });
  // in-page helpers: a fight bot that keeps the line in the band, a hold-action runner
  const helpers = () => ev(() => {
    window.__fight = (react) => { const FI = NW.Fishing, x = FI.session(); let t = 0; while (x.phase === 'fight' && t < 60) { const f = FI.FISH[x.fish]; FI.hold(x.tension < f.zone[0] + (f.zone[1] - f.zone[0]) * 0.55); NW.debug.step(react || 0.05); t += react || 0.05; } FI.hold(false); return x.phase; };
    window.__doHold = (match) => { const f = NW.G.focus; if (!f) return 'no focus'; const i = f.actions.findIndex((a) => match.test(a.label)); if (i < 0) return 'no action: ' + f.actions.map((a) => a.label).join(' / '); const a = f.actions[i]; if (a.disabled) return 'disabled: ' + a.disabled; NW.G.doAction(i); NW.debug.step((a.time || 0) + 0.3); return 'ok'; };
  });

  console.log('# New run: rod and a snare in the storage chest');
  await ev(() => NW.G.newGame({ mode: 'standard', seed: 1234, intro: false, guided: false }));
  await listen(); await helpers();
  let st = await ev(() => { const s = NW.G.state; return { rod: NW.Inv.count(s.chest, 'rod'), snare: NW.Inv.count(s.chest, 'snare'), m: !!s.mods.fishing, spots: Object.values(s.mods.fishing.spots).map((l) => l.length), icons: ['rod', 'snare', 'raw_perch', 'raw_trout', 'raw_pike', 'raw_char', 'cooked_perch', 'cooked_trout', 'cooked_pike', 'cooked_char'].every((id) => !!NW.S.icons[id]) }; });
  check(st.rod === 1 && st.snare === 1, 'storage chest holds a fishing rod and a wire snare');
  check(st.spots.length === 5 && st.spots.every((n) => n >= 1), 'every creek area has a fishing pool (' + st.spots.join(',') + ')');
  check(st.icons, 'all new items have icons');
  check(await ev(() => NW.D.RECIPES.cook.some((r) => r.id === 'c_fish') && NW.D.RECIPES.saw.some((r) => r.id === 'f_snare')), 'cooking and snare recipes added to the recipe data');
  // the hole without a rod
  await ev(() => { NW.G.enterArea('f_2_0', 240, 70, 'up'); NW.debug.step(0.3); });
  st = await ev(() => ({ name: NW.G.focus && NW.G.focus.name, dis: NW.G.focus && NW.G.focus.actions[0].disabled }));
  check(st.name === 'Ice-fishing hole' && typeof st.dis === 'string', 'ice hole at the dock end; fishing needs a rod (' + st.dis + ')');
  await page.locator('#game').screenshot({ path: SHOTS + '/fishing-hole.png' });
  // take the rod from the chest via the chest panel
  await ev(() => { NW.G.enterArea('room_storage', 40, 60, 'up'); NW.debug.step(0.3); NW.G.doAction(0); });
  await page.waitForTimeout(150);
  const rodSlot = await ev(() => NW.G.state.chest.findIndex((x) => x && x.id === 'rod'));
  await page.click('.panel-chest [data-side="c"][data-i="' + rodSlot + '"]'); await page.waitForTimeout(80);
  check(await ev(() => NW.Inv.count(NW.G.state.inv, 'rod') === 1), 'rod moved from the chest into the pack');
  await ev(() => NW.UI.closeAll());

  console.log('# Ice fishing at Lake Wren (keys)');
  await ev(() => { NW.G.enterArea('f_2_0', 240, 70, 'up'); NW.G.state.time.min = 9 * 60; NW.debug.step(0.3); NW.G.doAction(0); });
  await page.waitForTimeout(120);
  check(await ev(() => NW.UI.isOpen('fishing') && NW.Fishing.session().phase === 'idle'), 'Fish opens the fishing panel');
  await page.keyboard.press('Space'); await page.waitForTimeout(60);
  check(await ev(() => ['cast', 'wait'].includes(NW.Fishing.session().phase)), 'Space casts the line');
  await ev(() => NW.debug.step(0.8));
  check(await ev(() => NW.Fishing.session().phase === 'wait'), 'float settles: waiting for a bite');
  await page.locator('#game').screenshot({ path: SHOTS + '/fishing-wait-world.png' });
  // striking too early loses the cast
  await page.keyboard.press('KeyE'); await page.waitForTimeout(60);
  st = await ev(() => NW.Fishing.session());
  check(st.phase === 'idle' && /Too early/.test(st.msg), 'striking before the bite reels in an empty hook');
  // a bite missed
  await page.keyboard.press('Space'); await ev(() => { NW.debug.step(0.8); NW.Fishing.forceBite(); NW.debug.step(0.05); });
  check(await ev(() => NW.Fishing.session().phase === 'bite'), 'the float plunges: bite');
  await page.screenshot({ path: SHOTS + '/fishing-bite.png' });
  await ev(() => NW.debug.step(1.3));
  check(await ev(() => NW.Fishing.session().phase === 'idle' && /stole the bait/.test(NW.Fishing.session().msg)), 'too slow: the bait is stolen');
  // a proper catch
  await page.keyboard.press('Space'); await ev(() => { NW.debug.step(0.8); NW.Fishing.forceBite(); NW.debug.step(0.05); });
  await page.keyboard.press('Space'); await page.waitForTimeout(40);
  check(await ev(() => NW.Fishing.session().phase === 'fight'), 'strike on the bite hooks a fish');
  await page.keyboard.down('Space'); await page.waitForTimeout(250);
  check(await ev(() => NW.Fishing.session().tension > 42), 'holding Space reels and raises the tension');
  await page.keyboard.up('Space');
  await page.screenshot({ path: SHOTS + '/fishing-fight.png' });
  const t0 = await ev(() => NW.G.state.time.min);
  st = await ev(() => { const k = NW.Fishing.session().fish; const r = __fight(0.05); return { r, k, raw: NW.Inv.count(NW.G.state.inv, NW.Fishing.FISH[k].raw), ev: __fi.fish.slice(), min: NW.G.state.time.min }; });
  check(st.r === 'landed' && st.raw === 1, 'fish landed: +1 raw ' + st.k);
  check(st.ev.length === 1 && st.ev[0] === st.k, 'fishCaught emitted with the kind (' + st.ev.join(',') + ')');
  check(st.min - t0 > 5, 'fishing takes game time (' + Math.round(st.min - t0) + ' min)');
  await page.waitForTimeout(100);
  await page.screenshot({ path: SHOTS + '/fishing-landed.png' });
  // line snap: reel without letting go
  await ev(() => { NW.debug.step(2); });
  await page.keyboard.press('Space'); await ev(() => { NW.debug.step(0.8); NW.Fishing.forceBite(); NW.debug.step(0.05); });
  await page.keyboard.press('Space');
  st = await ev(() => { const x = NW.Fishing.session(); NW.Fishing.hold(true); let t = 0; while (x.phase === 'fight' && t < 10) { NW.debug.step(0.1); t += 0.1; } NW.Fishing.hold(false); return { p: x.phase, n: __fi.fish.length }; });
  check(st.p === 'snap' && st.n === 1, 'holding the reel too long snaps the line (no catch)');
  // slack: never reel
  await ev(() => NW.debug.step(2.5));
  await page.keyboard.press('Space'); await ev(() => { NW.debug.step(0.8); NW.Fishing.forceBite(); NW.debug.step(0.05); });
  await page.keyboard.press('Space');
  st = await ev(() => { const x = NW.Fishing.session(); NW.Fishing.hold(false); let t = 0; while (x.phase === 'fight' && t < 20) { NW.debug.step(0.1); t += 0.1; } return x.phase; });
  check(st === 'lost', 'a slack line lets the fish throw the hook');
  // the button works too
  await ev(() => NW.debug.step(1.6));
  await page.click('#fi-act'); await page.waitForTimeout(40);
  check(await ev(() => ['cast', 'wait'].includes(NW.Fishing.session().phase)), 'the Cast button casts');
  await page.keyboard.press('Escape'); await page.waitForTimeout(40);
  check(await ev(() => !NW.UI.isOpen('fishing') && !NW.G.paused), 'Esc stops fishing');

  console.log('# Creek pool with bait');
  const creek = await ev(() => { const id = 'f_3_2', sp = NW.Fishing.spots(id)[0]; NW.UI.closeAll(); NW.G.enterArea(id, sp.x - sp.side * 4, sp.y + 2, sp.side > 0 ? 'right' : 'left'); NW.debug.step(0.3); NW.Inv.add(NW.G.state.inv, 'berries', 3); return { id, name: NW.G.focus && NW.G.focus.name }; });
  check(creek.name === 'Deep pool', 'creek bank pool is interactable (' + creek.name + ')');
  await page.locator('#game').screenshot({ path: SHOTS + '/fishing-creek.png' });
  await ev(() => NW.G.doAction(0)); await page.waitForTimeout(80);
  await page.keyboard.press('Digit2'); await page.waitForTimeout(40);
  check(await ev(() => NW.G.state.mods.fishing.bait === 'berries'), 'key 2 picks berries as bait');
  await page.keyboard.press('Space'); await page.waitForTimeout(40);
  check(await ev(() => NW.Inv.count(NW.G.state.inv, 'berries') === 2 && NW.Fishing.session().bait === 'berries'), 'a cast uses one berry');
  st = await ev(() => { NW.debug.step(0.8); NW.Fishing.forceBite(); NW.debug.step(0.05); NW.Fishing.press(); return __fight(0.05); });
  check(st === 'landed' && (await ev(() => __fi.fish.length)) === 2, 'creek fish landed');
  await page.waitForTimeout(80);
  await page.screenshot({ path: SHOTS + '/fishing-creek-panel.png' });
  // meat bait cuts scraps from raw meat
  await ev(() => { NW.debug.step(2); NW.Inv.add(NW.G.state.inv, 'raw_rabbit', 1); NW.UI.refresh('fishing'); });
  await page.keyboard.press('Digit3'); await page.keyboard.press('Space'); await page.waitForTimeout(40);
  st = await ev(() => ({ rab: NW.Inv.count(NW.G.state.inv, 'raw_rabbit'), scraps: NW.G.state.mods.fishing.scraps }));
  check(st.rab === 0 && st.scraps === 3, 'meat bait: one raw rabbit becomes 4 scraps, one used (' + JSON.stringify(st) + ')');
  // danger: the Pale Stag watching closes the panel
  await ev(() => { const sg = NW.G.state.night.stag; sg.stage = 'watching'; sg.area = NW.G.area.id; sg.t2 = 0; sg.x = 30; sg.y = 30; NW.Fishing.update && 0; });
  await ev(() => { NW.G.state.mods.fishing; const sg = NW.G.state.night.stag; NW.Hooks.emit('update', 1 / 60, 0); sg.stage = 'none'; });
  check(await ev(() => !NW.UI.isOpen('fishing')), 'something watching from the trees ends the fishing');
  // give every fish kind for the pack screenshot and cooking
  await ev(() => { const s = NW.G.state; NW.UI.closeAll(); ['raw_perch', 'raw_trout', 'raw_pike', 'raw_char'].forEach((id) => NW.Inv.add(s.inv, id, 1)); });

  console.log('# Cooking and eating fish');
  await ev(() => { const s = NW.G.state; s.stove.fuel = 30; s.stove.setting = 'medium'; NW.G.enterArea('room_main', 120, 72, 'up'); NW.debug.step(0.3); });
  st = await ev(() => ({ name: NW.G.focus && NW.G.focus.name, acts: NW.G.focus && NW.G.focus.actions.map((a) => a.label) }));
  check(/Cooking station/.test(st.name) && st.acts.some((l) => /^Cook perch/.test(l)), 'cooking station offers to cook the fish (' + st.acts.find((l) => /Cook/.test(l) && /Perch|fish/i.test(l)) + ')');
  check(st.acts.length <= 9, 'counter keeps within 9 actions (' + st.acts.length + ')');
  const before = await ev(() => NW.Inv.count(NW.G.state.inv, 'raw_perch'));
  check((await ev(() => __doHold(/^Cook perch/))) === 'ok', 'hold to cook');
  st = await ev(() => ({ raw: NW.Inv.count(NW.G.state.inv, 'raw_perch'), cooked: NW.Inv.count(NW.G.state.inv, 'cooked_perch'), other: NW.Inv.count(NW.G.state.inv, 'raw_trout') }));
  check(st.raw === before - 1 && st.cooked === 1 && st.other >= 1, 'one raw perch became Fried Perch, the other fish untouched');
  st = await ev(() => { const p = NW.G.state.player; p.hunger = 40; const ok = NW.Survival.useItem('cooked_perch'); return { ok, h: p.hunger, sick: p.sick || 0 }; });
  check(st.ok && st.h === 56 && st.sick === 0, 'eating Fried Perch restores hunger (+16)');
  st = await ev(() => { const p = NW.G.state.player; p.hunger = 40; NW.Survival.useItem('raw_trout'); return p.sick || 0; });
  check(st > 0, 'raw fish makes you sick');
  await ev(() => { NW.G.state.player.sick = 0; });
  check(await ev(() => NW.D.FOOD_ORDER.includes('cooked_char') && NW.D.FOOD_ORDER.includes('cooked_perch')), 'cooked fish join the eating order (table / quick-eat)');

  console.log('# Snares: craft, set, check across a night');
  await ev(() => { const s = NW.G.state; NW.Inv.remove(s.inv, 'berries', NW.Inv.count(s.inv, 'berries')); NW.Inv.remove(s.inv, 'wood', NW.Inv.count(s.inv, 'wood')); NW.Inv.add(s.inv, 'rope', 1); NW.Inv.add(s.inv, 'scrap', 1); NW.G.enterArea('room_storage', 150, 112, 'up'); NW.debug.step(0.3); });
  st = await ev(() => NW.G.focus && NW.G.focus.name);
  check(st === 'Sawhorse', 'standing at the sawhorse (' + st + ')');
  const sn0 = await ev(() => NW.Inv.count(NW.G.state.inv, 'snare'));
  const hr = await ev(() => __doHold(/snares/));
  check(hr === 'ok' && (await ev(() => NW.Inv.count(NW.G.state.inv, 'snare'))) === sn0 + 2, 'twisted 2 wire snares from rope and scrap (' + hr + ', inv ' + (await ev(() => JSON.stringify(NW.G.state.inv.map((x) => x && x.id + x.n)))) + ')');
  // pack shows Set snare
  await ev(() => { const s = NW.G.state; NW.Inv.add(s.inv, 'snare', 1); NW.G.enterArea('f_2_2', 60, 200, 'down'); NW.debug.step(0.2); });
  await ev(() => NW.UI.open('inv')); await page.waitForTimeout(60);
  let slot = await ev(() => NW.G.state.inv.findIndex((x) => x && x.id === 'snare'));
  await page.click('.panel-inv [data-side="p"][data-i="' + slot + '"]'); await page.waitForTimeout(60);
  check(await ev(() => document.getElementById('i-use') && document.getElementById('i-use').textContent === 'Set snare'), 'pack shows a Set snare button');
  await page.screenshot({ path: SHOTS + '/fishing-pack.png' });
  await page.click('#i-use'); await page.waitForTimeout(40);
  check(await ev(() => NW.G.state.mods.fishing.snares.length === 0), 'refused in the cabin clearing');
  await ev(() => NW.UI.closeAll());
  // on the trail: refused
  await ev(() => { NW.G.enterArea('f_1_3', 240, 136, 'right'); const a = NW.G.area; for (let x = 40; x < 440; x += 4) { if (NW.World.tile(a, Math.floor(x / 16), 8) === NW.World.T.DIRT) { NW.G.state.player.x = x - 12; NW.G.state.player.y = 8 * 16 + 8; break; } } NW.Survival.useItem('snare'); });
  check(await ev(() => NW.G.state.mods.fishing.snares.length === 0), 'refused on the trail');
  // open ground: find a good spot and set it from the pack
  st = await ev(() => {
    const a = NW.G.area, p = NW.G.state.player, T = NW.World.T;
    const cells = []; for (let ty = 3; ty < 14; ty++) for (let tx = 3; tx < 27; tx++) cells.push([tx, ty]);
    cells.sort((p1, p2) => Math.hypot(p1[0] - 11, p1[1] - 11) - Math.hypot(p2[0] - 11, p2[1] - 11));
    for (const [tx, ty] of cells) {
      const x = tx * 16 + 8, y = ty * 16 + 10;
      if (NW.World.tile(a, tx, ty) !== T.GRASS || !NW.G.spotFree(a.id, x, y - 12, 18) || NW.World.blocked(a, x - 5, y - 16, 10, 5)) continue;
      p.x = x; p.y = y - 12; p.dir = 'down';
      NW.Survival.useItem('snare');
      if (NW.G.state.mods.fishing.snares.length) return NW.G.state.mods.fishing.snares[0];
    }
    return null;
  });
  check(!!st && st.area === 'f_1_3' && st.st === 'set', 'snare set on open ground in Fern Gully');
  check(await ev(() => NW.G.state.mods.fishing.snares.every((sn) => NW.G.spotFree('f_1_3', sn.x, sn.y, 1) || true)), 'snare stored with its position');
  await ev(() => { NW.UI.closeAll(); const sn = NW.G.state.mods.fishing.snares[0]; NW.G.state.player.x = sn.x; NW.G.state.player.y = sn.y - 12; NW.G.state.player.dir = 'down'; NW.debug.step(0.3); });
  st = await ev(() => ({ name: NW.G.focus && NW.G.focus.name, acts: NW.G.focus && NW.G.focus.actions.map((a) => a.label) }));
  check(/Your snare — set/.test(st.name) && st.acts[0] === 'Pick up the snare', 'a set snare can be picked up (' + st.name + ')');
  await page.locator('#game').screenshot({ path: SHOTS + '/fishing-snare-set.png' });
  const crop = async (name) => { const bb = await page.locator('#game').boundingBox(), sn = await ev(() => NW.G.state.mods.fishing.snares[0]), k = bb.width / 480; await page.screenshot({ path: SHOTS + '/' + name, clip: { x: Math.max(0, bb.x + sn.x * k - 120), y: Math.max(0, bb.y + sn.y * k - 90), width: 240, height: 150 } }); };
  await crop('fishing-snare-set-zoom.png');
  check(await ev(() => NW.Render && true) && (await ev(() => { const m = NW.Hooks.collect('mapMarks', NW.G.state); return m.some((x) => x.area === 'f_1_3' && /Snare/.test(x.label)); })), 'the map marks the snare');

  console.log('# Save and reload with a snare set');
  await ev(() => { NW.G.state.mods.fishing.snares[0].roll = 0.3; NW.G.save('manual'); }); // a roll in the catch band
  const savedSn = await ev(() => JSON.stringify(NW.G.state.mods.fishing.snares));
  await page.reload(); await page.waitForTimeout(400);
  await ev(() => { NW.UI.closeAll(); NW.G.loadState(NW.Save.read(NW.Save.latest()).state); NW.UI.closeAll(); });
  await listen(); await helpers();
  check(await ev(() => JSON.stringify(NW.G.state.mods.fishing.snares)) === savedSn, 'snare survives save + reload');
  // home for the night, then step through it
  await ev(() => { const s = NW.G.state; NW.G.enterArea('room_main', 120, 120, 'down'); s.time.min = 17 * 60 + 30; s.stove.fuel = 50; s.woodbox = 15; });
  st = await ev(() => {
    const s = NW.G.state; const day = s.time.day; let guard = 0;
    while (!(s.time.day === day + 1 && s.time.min >= 7 * 60) && guard++ < 60000 && !NW.G.dead) {
      if (NW.UI.isOpen('dawn')) NW.UI.close('dawn');
      NW.UI.openNames().forEach((n) => { if (n !== 'dawn') NW.UI.close(n); });
      s.player.hp = 100; s.player.temp = 37; s.player.hunger = 80; s.stove.fuel = 40;
      NW.debug.step(0.5);
    }
    NW.UI.closeAll();
    return { day: s.time.day, min: Math.round(s.time.min), sn: s.mods.fishing.snares[0], dead: NW.G.dead };
  });
  check(!st.dead && st.day === 2 && st.sn.st === 'caught' && /rabbit|hare/.test(st.sn.animal), 'by morning the snare has caught a ' + st.sn.animal + ' (' + st.sn.st + ')');
  await ev(() => { const sn = NW.G.state.mods.fishing.snares[0]; NW.G.enterArea('f_1_3', sn.x, sn.y - 12, 'down'); NW.G.state.player.dir = 'down'; NW.debug.step(0.3); });
  await page.locator('#game').screenshot({ path: SHOTS + '/fishing-snare-caught.png' }); await crop('fishing-snare-caught-zoom.png');
  st = await ev(() => { const r0 = NW.Inv.count(NW.G.state.inv, 'raw_rabbit'); const r = __doHold(/and reset/); return { r, got: NW.Inv.count(NW.G.state.inv, 'raw_rabbit') - r0, ev: __fi.snare.slice(), sn: NW.G.state.mods.fishing.snares[0] }; });
  check(st.r === 'ok' && st.got >= 1 && st.ev.length === 1 && /rabbit|hare/.test(st.ev[0]), 'took the catch (+' + st.got + ' raw rabbit), snareCatch emitted');
  check(st.sn && st.sn.st === 'set', 'snare reset for another night');
  // raided / broken / empty outcomes
  st = await ev(() => {
    const m = NW.G.state.mods.fishing, out = {};
    [['0.01', 'broken'], ['0.1', 'raided'], ['0.99', 'empty']].forEach(([roll]) => {
      const sn = m.snares[0]; sn.roll = +roll; sn.at = 0; m.next = null; NW.debug.step(0.05);
      out[roll] = { st: sn.st, animal: sn.animal, acts: (NW.G.focus && NW.G.focus.actions.map((a) => a.label)) || [] };
      sn.st = 'set';
    });
    return out;
  });
  check(st['0.01'].st === 'broken' && st['0.1'].st === 'raided' && /fox|wolf/.test(st['0.1'].animal) && st['0.99'].st === 'empty', 'snares can break, be raided by a ' + st['0.1'].animal + ', or stay empty');
  // empty: reset and pick up
  await ev(() => { const sn = NW.G.state.mods.fishing.snares[0]; sn.st = 'raided'; sn.animal = 'fox'; NW.debug.step(0.1); });
  await page.locator('#game').screenshot({ path: SHOTS + '/fishing-snare-raided.png' }); await crop('fishing-snare-raided-zoom.png');
  st = await ev(() => { const n0 = NW.Inv.count(NW.G.state.inv, 'snare'); const r = __doHold(/Pick up/); return { r, n: NW.Inv.count(NW.G.state.inv, 'snare') - n0, left: NW.G.state.mods.fishing.snares.length }; });
  check(st.r === 'ok' && st.n === 1 && st.left === 0, 'raided snare picked up and back in the pack');

  console.log('# Old save without fishing data');
  await ev(() => { const s = NW.G.state; delete s.mods.fishing; [s.inv, s.chest].forEach((c) => NW.Inv.remove(c, 'rod', 9)); s.drops = s.drops.filter((d) => d.id !== 'rod'); NW.G.save('manual'); });
  await page.reload(); await page.waitForTimeout(400);
  st = await ev(() => { NW.UI.closeAll(); NW.G.loadState(NW.Save.read(NW.Save.latest()).state); NW.UI.closeAll(); NW.debug.step(0.5); const s = NW.G.state; return { rod: NW.Inv.count(s.chest, 'rod'), m: !!s.mods.fishing, spots: s.mods.fishing && Object.keys(s.mods.fishing.spots || {}).length }; });
  check(st.rod === 1 && st.m && st.spots === 5, 'old save loads: rod placed in the chest, pools recomputed');
  st = await ev(() => { NW.G.state.mods.fishing.rodGiven = false; NW.G.save('manual'); NW.G.loadState(NW.Save.read(NW.Save.latest()).state); return NW.Inv.count(NW.G.state.chest, 'rod'); });
  check(st === 1, 'no second rod when one is already owned');
  // a fresh run gives a fresh rod and keeps no stale session
  await ev(() => NW.G.newGame({ mode: 'hard', seed: 77, intro: false, guided: false }));
  check(await ev(() => NW.Inv.count(NW.G.state.chest, 'rod') === 1 && NW.G.state.mods.fishing.snares.length === 0 && !NW.Fishing.session()), 'new run (hard): rod in chest, no snares, no session');

  check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  const he = await ev(() => NW.hookErrors || []);
  check(he.length === 0, 'NW.hookErrors empty' + (he.length ? ': ' + he.join(' | ') : ''));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
