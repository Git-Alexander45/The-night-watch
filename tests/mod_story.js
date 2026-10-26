// Story module: opening scene, credits (menu + ending), guided first day.
const { chromium } = require('playwright');
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/d607ac6a-93f8-5870-a0ad-942bb41b98fa/scratchpad/shots';
let fails = 0; const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 960, height: 544 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://localhost:8123/index.html?view=2d'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(500);
  const ev = (f, a) => page.evaluate(f, a);
  const shot = (n) => page.locator('#frame').screenshot({ path: SHOTS + '/story-' + n + '.png' });
  await ev(() => { window._ev = { intro: 0, credits: 0 }; NW.Hooks.on('introDone', () => window._ev.intro++); NW.Hooks.on('creditsDone', () => window._ev.credits++); });
  const hudShown = () => ev(() => !document.getElementById('hud').classList.contains('hidden'));
  // fast-forward the running scene without input
  const runOut = (sec) => ev((sec) => { const cx = document.getElementById('game').getContext('2d'); for (let i = 0; i < sec * 10 && NW.scene; i++) NW.scene.frame(cx, 0.1); return NW.G.mode; }, sec);
  // amber marker pixels near a screen point
  const amberNear = (x, y) => ev(([x, y]) => {
    const d = document.getElementById('game').getContext('2d').getImageData(Math.max(0, x - 8), Math.max(0, y - 14), 17, 22).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 190 && d[i + 1] > 150 && d[i + 2] < 140) n++; return n;
  }, [x, y]);
  const markScreen = () => ev(() => { const m = NW.Story.guideTarget(), a = NW.G.area; return m && m.x >= 0 ? { x: Math.round(m.x + a.ox), y: Math.round(m.y + a.oy), dir: m.dir, hint: m.hint || '' } : null; });
  const objText = async () => { await page.waitForTimeout(80); return ev(() => document.getElementById('objectives').textContent); };

  console.log('# Menu');
  check(await ev(() => !!document.getElementById('b-x-credits')), 'main menu has a Credits button');
  await page.click('#b-new'); await page.waitForTimeout(150);
  check(await ev(() => !!document.getElementById('ng-intro') && document.getElementById('ng-intro').checked), 'New Game offers the opening scene (checked)');
  await ev(() => NW.UI.closeAll());

  console.log('# Opening scene, skipped');
  await ev(() => NW.G.newGame({ mode: 'standard', seed: 1234, intro: true, guided: false }));
  await page.waitForTimeout(300);
  let st = await ev(() => ({ mode: NW.G.mode, scene: !!NW.scene, state: !!NW.G.state, area: !!NW.G.area, menu: document.getElementById('menu').classList.contains('hidden') }));
  check(st.mode === 'scene' && st.scene && st.state && !st.area && st.menu, 'intro takes over: scene mode, state ready, no area yet, menu hidden');
  check(!(await hudShown()), 'HUD hidden during the intro');
  check(await ev(() => NW.Audio.musicMode === 'intro'), 'intro music');
  for (const T of [5, 13, 20, 24, 29, 40, 55, 61]) { await ev((T) => { NW.scene.t = T; }, T); await page.waitForTimeout(110); await shot('intro-' + T); }
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  st = await ev(() => ({ mode: NW.G.mode, scene: !!NW.scene, area: NW.G.area && NW.G.area.id, intro: window._ev.intro, day: NW.G.state.time.day, saved: NW.Save.exists(NW.G.state.slot) }));
  check(st.mode === 'play' && !st.scene && st.area === 'room_main' && st.intro === 1 && st.day === 1, 'Esc skips: the run starts in the cabin, introDone fired (' + JSON.stringify(st) + ')');
  check(st.saved, 'the new run was saved after the intro');
  check(await hudShown(), 'HUD visible after the intro');
  await ev(() => NW.debug.step(1));
  check(await ev(() => NW.G.state.time.min > 480), 'game time runs after the intro');

  console.log('# Opening scene, played out');
  await ev(() => NW.G.newGame({ mode: 'hard', seed: 77, intro: true, guided: false }));
  await page.waitForTimeout(100);
  check(await ev(() => NW.G.mode === 'scene'), 'second intro playing');
  await page.mouse.click(480, 272); // a click in the first 0.4 s does not skip
  check(await ev(() => NW.G.mode === 'scene'), 'an early click does not skip');
  const m1 = await runOut(30);
  check(m1 === 'scene', 'still playing at 30 s');
  const m2 = await runOut(40);
  st = await ev(() => ({ mode: NW.G.mode, intro: window._ev.intro, hud: !document.getElementById('hud').classList.contains('hidden'), nights: NW.G.finalNight() }));
  check(m2 === 'play' && st.intro === 2 && st.hud && st.nights === 14, 'intro ends on its own after ~65 s and starts the run');
  await ev(() => NW.G.newGame({ mode: 'standard', seed: 5, intro: true, guided: false }));
  await page.waitForTimeout(500);
  await page.mouse.click(480, 272); await page.waitForTimeout(200);
  check(await ev(() => NW.G.mode === 'play'), 'a click skips the intro');

  console.log('# Guided first day');
  await ev(() => NW.G.newGame({ mode: 'standard', seed: 1234, intro: false, guided: true }));
  await page.waitForTimeout(250);
  let o = await objText();
  check(/Guided first day · step 1\/10/.test(o) && /four rooms/.test(o), 'step 1/10: walk the four rooms (' + o + ')');
  let mk = await markScreen();
  check(mk && mk.dir !== 'down', 'marker points at a doorway: ' + JSON.stringify(mk));
  await page.waitForTimeout(150);
  check(mk && await amberNear(mk.x, mk.y) > 6, 'marker is drawn on the canvas');
  await shot('guide-1-look');
  for (const r of ['room_bed', 'room_office', 'room_storage', 'room_main']) await ev((r) => NW.G.enterArea(r, r === 'room_main' ? 176 : 100, r === 'room_main' ? 120 : 100, 'down'), r);
  await ev(() => NW.debug.step(0.1));
  o = await objText();
  check(/step 2\/10/.test(o) && /radio/.test(o), 'step 2: the radio (' + o + ')');
  mk = await markScreen();
  check(mk && mk.dir === 'right' && /office/.test(mk.hint), 'from the main room the marker points east to the office: ' + JSON.stringify(mk));
  await ev(() => NW.G.enterArea('room_office', 116, 70, 'up')); await ev(() => NW.debug.step(0.1)); await page.waitForTimeout(150);
  mk = await markScreen();
  check(mk && mk.dir === 'down' && Math.abs(mk.x - 116 - (await ev(() => NW.G.area.ox))) < 2, 'in the office the marker sits over the radio: ' + JSON.stringify(mk));
  check(mk && await amberNear(mk.x, mk.y) > 6, 'radio marker drawn');
  await shot('guide-2-radio');
  check(await ev(() => NW.G.focus && /^Radio/.test(NW.G.focus.name)), 'radio is in reach');
  await ev(() => NW.G.doAction(0)); await page.waitForTimeout(80);
  check(await ev(() => NW.UI.isOpen('radio')), 'radio panel opened');
  await ev(() => NW.UI.closeAll()); await ev(() => NW.debug.step(0.1));
  o = await objText();
  check(/step 3\/10/.test(o) && /branches/i.test(o), 'step 3: firewood (' + o + ')');
  mk = await markScreen();
  check(mk && mk.dir === 'left', 'office marker points back to the main room');
  await ev(() => NW.G.enterArea('room_main', 176, 150, 'down')); await ev(() => NW.debug.step(0.1));
  mk = await markScreen();
  check(mk && mk.dir === 'down' && /front door/.test(mk.hint), 'main room marker points to the front door: ' + JSON.stringify(mk));
  await page.waitForTimeout(120); await shot('guide-3-door');
  await ev(() => NW.G.goOutside('front')); await ev(() => NW.debug.step(0.1)); await page.waitForTimeout(150);
  mk = await markScreen();
  const res = await ev(() => { const m = NW.Story.guideTarget(); const o = NW.G.area.objs.filter((q) => (q.type === 'branches' || q.type === 'deadtree') && NW.Objects.available(q)).find((q) => Math.abs(q.x - m.x) < 1); return o ? { type: o.type, x: o.x, y: o.y } : null; });
  check(mk && res, 'outside, the marker points at ' + JSON.stringify(res));
  check(mk && await amberNear(mk.x, mk.y) > 6, 'outdoor marker drawn');
  await shot('guide-3-wood');
  // gather it for real
  await ev((r) => { const p = NW.G.state.player; const sp = NW.G.safeSpot(NW.G.area, r.x, r.y + 10, null); p.x = sp.x; p.y = sp.y; p.dir = 'up'; }, res);
  await ev(() => NW.debug.step(0.1));
  const fname = await ev(() => NW.G.focus && NW.G.focus.name);
  await ev(() => NW.G.doAction(0)); await ev(() => NW.debug.step(3));
  o = await objText();
  check(/step 4\/10/.test(o) && /wood box/.test(o), 'gathering (' + fname + ') advances to step 4: store wood (' + o + ')');

  console.log('# Save and reload mid-guide');
  await ev(() => NW.G.save('manual'));
  await page.reload(); await page.waitForTimeout(500);
  await ev(() => NW.UI.continueGame()); await page.waitForTimeout(200);
  o = await objText();
  check(/step 4\/10/.test(o), 'guide resumes at step 4 after reload (' + o + ')');
  console.log('# Old save without story data');
  await ev(() => { delete NW.G.state.mods.story; NW.G.save('manual'); });
  await page.reload(); await page.waitForTimeout(500);
  await ev(() => NW.UI.continueGame()); await page.waitForTimeout(200);
  o = await objText();
  check(/step 4\/10/.test(o) && await ev(() => NW.G.mode === 'play'), 'old save loads, guide state rebuilt (' + o + ')');
  await ev(() => { window._ev = { intro: 0, credits: 0 }; NW.Hooks.on('creditsDone', () => window._ev.credits++); });

  console.log('# Steps through to dusk');
  await ev(() => NW.G.enterArea('room_main', 60, 90, 'up')); await ev(() => NW.debug.step(0.1)); await page.waitForTimeout(150);
  mk = await markScreen();
  check(mk && mk.dir === 'down' && mk.x < 120, 'wood box marked in the main room: ' + JSON.stringify(mk));
  await shot('guide-4-woodbox');
  await ev(() => NW.G.tut('store')); await ev(() => NW.debug.step(0.1));
  check(/step 5\/10/.test(await objText()) && /stove/.test(await objText()), 'step 5: stove');
  await ev(() => { NW.G.tut('stove'); NW.G.tut('food'); }); await ev(() => NW.debug.step(0.1));
  o = await objText();
  check(/step 7\/10/.test(o) && /counter/.test(o), 'step 7: cook (' + o + ')');
  await ev(() => { const I = NW.Inv, s = NW.G.state; ['raw_rabbit', 'raw_venison', 'mushroom', 'yarrow', 'cloth', 'wintergreen'].forEach((id) => I.remove(s.inv, id, I.count(s.inv, id))); });
  await ev(() => NW.debug.step(0.1));
  o = await objText();
  check(/yarrow from the chest/.test(o), 'nothing to cook: guide sends you to the chest for yarrow (' + o + ')');
  await ev(() => { NW.G.tut('cook'); NW.G.tut('chest'); NW.G.tut('map'); }); await ev(() => NW.debug.step(0.1));
  o = await objText();
  check(/step 10\/10/.test(o) && /lock the doors/.test(o), 'step 10: dusk (' + o + ')');
  mk = await markScreen();
  check(mk && mk.dir === 'down' && Math.abs(mk.x - 176 - (await ev(() => NW.G.area.ox))) < 3, 'front door marked for locking');
  await ev(() => NW.debug.setTime(19 * 60 + 40)); await ev(() => NW.debug.step(0.2)); await page.waitForTimeout(150);
  await shot('guide-10-dusk');
  await ev(() => NW.G.tut('lock')); await ev(() => NW.debug.step(0.1));
  mk = await markScreen();
  check(mk && (mk.dir === 'down' || mk.dir === 'up') && /curtains/.test(mk.hint), 'then a window is marked for the curtains');
  await ev(() => NW.G.tut('curtain')); await ev(() => NW.debug.step(0.1));
  check(await ev(() => NW.G.state.mods.story.guideDone && !NW.Story.guideActive()), 'guide complete after the dusk step');
  check(!/Guided/.test(await objText()), 'objectives box back to normal');

  console.log('# Skipping steps already done');
  await ev(() => NW.G.newGame({ mode: 'standard', seed: 99, intro: false, guided: true }));
  await ev(() => { NW.G.tut('radio'); NW.G.tut('wood'); });
  for (const r of ['room_bed', 'room_office', 'room_storage', 'room_main']) await ev((r) => NW.G.enterArea(r, r === 'room_main' ? 176 : 100, r === 'room_main' ? 120 : 100, 'down'), r);
  await ev(() => NW.debug.step(0.1));
  o = await objText();
  check(/step 4\/10/.test(o), 'look done → radio and wood already done are skipped (' + o + ')');

  console.log('# Skip guide from the pause menu');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  check(await ev(() => { const b = document.getElementById('p-x-story_guide'); return b && b.style.display !== 'none'; }), 'pause menu shows "Skip guide"');
  await shot('guide-pause');
  await page.click('#p-x-story_guide'); await page.waitForTimeout(150);
  check(await ev(() => NW.G.state.mods.story.guideOff && !NW.UI.isOpen('pause') && !NW.Story.guideActive()), 'guide off, pause closed');
  await ev(() => NW.debug.step(0.1));
  o = await objText();
  check(/^First day/.test(o), 'core objectives back (' + o + ')');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  check(await ev(() => document.getElementById('p-x-story_guide').style.display === 'none'), '"Skip guide" hidden once the guide is off');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);

  console.log('# Dawn of day 2 ends the guide');
  await ev(() => NW.G.newGame({ mode: 'standard', seed: 31, intro: false, guided: true }));
  check(await ev(() => NW.Story.guideActive()), 'guide active on day 1');
  await ev(() => { NW.debug.setTime(23 * 60 + 59); NW.debug.step(0.5); NW.UI.closeAll(); NW.debug.setTime(5 * 60 + 58, 2); NW.debug.step(2); NW.UI.closeAll(); });
  check(await ev(() => NW.G.state.time.day === 2 && NW.G.state.time.min >= 360 && !NW.Story.guideActive() && NW.G.state.mods.story.guideDone), 'guide over at dawn of day 2');
  console.log('# Guide off when the run is not guided');
  await ev(() => NW.G.newGame({ mode: 'standard', seed: 31, intro: false, guided: false }));
  await ev(() => NW.debug.step(0.1));
  check(await ev(() => !NW.Story.guideActive()) && /^First day/.test(await objText()), 'unguided run: no guide, core list shown');

  console.log('# Credits from the menu');
  await ev(() => NW.UI.showMenu()); await page.waitForTimeout(150);
  await page.click('#b-x-credits'); await page.waitForTimeout(300);
  check(await ev(() => NW.G.mode === 'scene' && document.getElementById('menu').classList.contains('hidden') && NW.Audio.musicMode === 'credits'), 'credits play over the menu, music credits');
  for (const T of [3, 12, 22, 34]) { await ev((T) => { NW.scene.t = T; }, T); await page.waitForTimeout(110); await shot('credits-' + T); }
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check(await ev(() => NW.G.mode === 'menu' && !document.getElementById('menu').classList.contains('hidden') && window._ev.credits === 1), 'Esc returns to the menu, creditsDone fired');
  await page.click('#b-x-credits'); await page.waitForTimeout(200);
  const cm = await runOut(120);
  check(cm === 'menu' && await ev(() => window._ev.credits === 2), 'credits roll to the end on their own and return to the menu');

  console.log('# Credits from the ending panel');
  await ev(() => NW.G.newGame({ mode: 'standard', seed: 1234, intro: false, guided: false }));
  await ev(() => { NW.G.state.nightsSurvived = 7; NW.UI.open('ending', { night: 7, lines: ['The fire held.'], ending: null }); });
  await page.waitForTimeout(150);
  check(await ev(() => !!document.getElementById('end-x-credits') && NW.G.paused), 'ending panel has a Credits button');
  await shot('ending-panel');
  await page.click('#end-x-credits'); await page.waitForTimeout(250);
  check(await ev(() => NW.G.mode === 'scene' && !NW.UI.isOpen('ending') && document.getElementById('hud').classList.contains('hidden')), 'credits play from the ending');
  await ev(() => { NW.scene.t = 6; }); await page.waitForTimeout(120); await shot('credits-ending');
  check(await ev(() => NW.G.save('manual') === false), 'no saving mid-credits');
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  st = await ev(() => ({ mode: NW.G.mode, open: NW.UI.isOpen('ending'), paused: NW.G.paused, hud: !document.getElementById('hud').classList.contains('hidden'), arg: NW.UI.arg.ending && NW.UI.arg.ending.night }));
  check(st.mode === 'play' && st.open && st.paused && st.hud && st.arg === 7, 'back to the paused run with the ending panel reopened (' + JSON.stringify(st) + ')');
  await page.click('#end-go'); await page.waitForTimeout(150);
  check(await ev(() => !NW.UI.isOpen('ending') && !NW.G.paused && NW.G.state.endless), 'Continue the watch still works afterwards');
  check(await ev(() => typeof NW.Story.playCredits === 'function'), 'NW.Story.playCredits exported');

  const hookErrs = await ev(() => NW.hookErrors || []);
  check(!hookErrs.length, 'no hook errors ' + JSON.stringify(hookErrs).slice(0, 400));
  check(!errs.length, 'no page errors ' + JSON.stringify(errs).slice(0, 400));
  console.log(fails ? fails + ' FAILURES' : 'ALL PASSED');
  await b.close(); process.exit(fails ? 1 : 0);
})();
