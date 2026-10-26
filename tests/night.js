const { chromium } = require('playwright');
const OUT = process.env.OUT || '/tmp/shots';
let fails = 0;
function check(cond, msg) { if (cond) console.log('  ok  ' + msg); else { fails++; console.log('  FAIL ' + msg); } }
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 816 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
  await page.goto('http://localhost:8123/index.html?view=2d');
  await page.waitForTimeout(500);
  await page.click('#b-new'); await page.waitForTimeout(150); await page.evaluate(() => { for (const id of ['ng-intro', 'ng-guided']) { const i = document.getElementById(id); if (i && i.checked) i.click(); } }); await page.click('#ng-start');
  await page.waitForTimeout(300);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const step = (sec) => ev((s) => NW.debug.step(s), sec);

  console.log('# Day 1 -> Night 1 (safe)');
  await ev(() => { NW.G.state.time.min = 18 * 60 + 50; NW.G.state.stove.fuel = 50; NW.G.state.stove.setting = 'medium'; });
  await step(10);
  let n = await ev(() => ({ active: NW.G.state.night.active, n: NW.G.state.night.n, lh: NW.G.state.night.plan.lhSens, vis: NW.G.state.night.plan.visitors.length }));
  check(n.active && n.n === 1, 'night 1 begins at 19:00');
  check(n.lh === 0 && n.vis === 0, 'night 1 has no monsters or visitors');
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/n-night1.png' });
  // run all of night 1 with high light: nothing should attack
  await ev(() => { const s = NW.G.state; s.lamps.room_main = true; s.oil = 100; });
  const hp0 = await ev(() => NW.G.state.player.hp);
  // keep stove fed during the run
  for (let i = 0; i < 9; i++) { await ev(() => { NW.G.state.stove.fuel = 50; NW.G.state.player.hunger = 90; }); await step(50); if (await ev(() => NW.UI.isOpen('dawn'))) break; }
  const d1 = await ev(() => ({ dawn: NW.UI.isOpen('dawn'), day: NW.G.state.time.day, min: NW.G.state.time.min, hp: NW.G.state.player.hp, surv: NW.G.state.nightsSurvived, sched: NW.G.state.radio.sched.length }));
  check(d1.dawn && d1.day === 2, 'dawn screen after night 1, day 2 (' + d1.day + ' ' + d1.min.toFixed(0) + ')');
  check(d1.hp >= hp0 - 1, 'no damage on night 1');
  check(d1.surv === 1, 'nightsSurvived = 1');
  await page.screenshot({ path: OUT + '/n-dawn.png' });
  await ev(() => NW.UI.close('dawn'));

  console.log('# Night 2: Light Hunter');
  await ev(() => { const s = NW.G.state; s.time.min = 18 * 60 + 58; s.stove.fuel = 50; s.stove.setting = 'high'; s.lamps.room_main = true; s.lamps.room_bed = true; NW.G.enterArea('room_main', 200, 150, 'down'); });
  await step(6);
  check(await ev(() => NW.G.state.night.n === 2 && NW.G.state.night.plan.lhSens > 0), 'night 2 has the Light Hunter');
  await ev(() => { NW.G.state.time.min = 19 * 60 + 50; });
  let lh;
  for (let i = 0; i < 40; i++) { await ev(() => { NW.G.state.stove.fuel = 50; }); await step(1); lh = await ev(() => NW.G.state.night.lh); if (lh.stage === 'window') break; }
  check(lh.stage === 'window', 'bright cabin draws LH to a window: ' + lh.wid + ' (interest ' + lh.interest.toFixed(0) + ')');
  await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/n-lh-window.png' });
  // open the window view panel for that window
  await ev((w) => NW.G.openUI('window', w), lh.wid);
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/n-lh-view.png' });
  await ev(() => NW.UI.close('window'));
  // darken: smother fire, lamps off, curtains + shutters
  await ev(() => { const s = NW.G.state; s.stove.setting = 'low'; for (const r in s.lamps) s.lamps[r] = false; for (const w in s.cabin.windows) { s.cabin.windows[w].curtClosed = true; } });
  for (let i = 0; i < 15; i++) { await step(1); lh = await ev(() => NW.G.state.night.lh); if (lh.stage !== 'window') break; }
  const L = await ev(() => NW.Survival.light.leak);
  check(lh.stage !== 'window', 'darkening makes LH leave (leak ' + L.toFixed(2) + ')');
  const g = await ev(() => { const w = NW.G.state.cabin.windows; return Object.keys(w).map((k) => k + ':' + Math.round(w[k].glass)).join(' '); });
  console.log('    glass after visit: ' + g);

  console.log('# LH break-in when ignored');
  await ev(() => { const s = NW.G.state; s.stove.setting = 'high'; s.stove.fuel = 50; s.lamps.room_main = true; for (const w in s.cabin.windows) { s.cabin.windows[w].curtClosed = false; s.cabin.windows[w].shutClosed = false; } s.night.lh.cool = 0; s.night.lh.interest = 99; s.player.hp = 100; NW.G.enterArea('room_main', 80, 170, 'down'); });
  let broke = false, hpb = 100;
  for (let i = 0; i < 60; i++) { await ev(() => { NW.G.state.stove.fuel = 50; }); await step(1); const st = await ev(() => ({ w: NW.G.state.cabin.windows, hp: NW.G.state.player.hp, lh: NW.G.state.night.lh.stage })); if (Object.values(st.w).some((w) => w.glass <= 0)) { broke = true; hpb = st.hp; break; } }
  check(broke, 'ignored LH eventually breaks a window');
  console.log('    player hp after break-in: ' + hpb.toFixed(0));

  console.log('# Repairs persist');
  const rep = await ev(() => { const s = NW.G.state; const wid = Object.keys(s.cabin.windows).find((k) => s.cabin.windows[k].glass <= 0); NW.Inv.add(s.inv, 'plank', 4); NW.Inv.add(s.inv, 'nails', 6); const w = s.cabin.windows[wid]; const room = w.room; const a = NW.World.get(room); const o = a.objs.find((x) => x.wid === wid); NW.G.enterArea(room, o.x + 16, o.side === 'top' ? 40 : o.y - 4, o.side === 'top' ? 'up' : 'down'); return wid; });
  await step(0.1);
  const acts = await ev(() => NW.G.focus && NW.G.focus.actions.map((a) => a.label));
  const bIdx = acts ? acts.findIndex((l) => l.startsWith('Board up')) : -1;
  check(bIdx >= 0, 'board-up action offered: ' + (acts || []).join(' | '));
  await ev((i) => NW.G.doAction(i), bIdx);
  await step(4);
  check(await ev((w) => NW.G.state.cabin.windows[w].boarded > 0, rep), 'window boarded up');

  console.log('# Night 3: visitor at the door');
  await ev(() => NW.UI.closeAll());
  await ev(() => { const s = NW.G.state; s.time.day = 3; s.time.min = 18 * 60 + 59; s.night.active = false; s.player.hp = 100; s.stove.setting = 'medium'; s.stove.fuel = 50; });
  await step(3);
  const plan = await ev(() => NW.G.state.night.plan.visitors.map((v) => ({ at: v.at, mimic: NW.G.state.visitors[v.vid].mimic, name: NW.G.state.visitors[v.vid].name })));
  check(plan.length >= 1, 'night 3 schedules visitors: ' + JSON.stringify(plan));
  await ev((at) => { NW.G.state.time.min = 19 * 60 + at; }, plan[0].at);
  await step(1);
  check(await ev(() => NW.Night.visitorAtDoor()), 'visitor arrived and knocks');
  await ev(() => { NW.G.enterArea('room_main', 176, 188, 'down'); });
  await step(0.1);
  const dacts = await ev(() => NW.G.focus && NW.G.focus.actions.map((a) => a.label));
  check(dacts && dacts.includes('Talk to the visitor') && dacts.includes('Look through the peephole'), 'door offers peephole/talk/open/refuse: ' + (dacts || []).join(' | '));
  await ev(() => NW.G.openUI('peephole'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '/n-peephole.png' });
  await ev(() => { NW.UI.close('peephole'); NW.G.openUI('talk'); });
  for (const q of ['who', 'where', 'weather']) { await page.click('.panel-talk [data-q="' + q + '"]'); await page.waitForTimeout(150); }
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/n-talk.png' });
  const log = await ev(() => NW.Night.currentVisitor().log.map((l) => l.a));
  check(log.length === 3, 'answers recorded: ' + log.join(' / '));
  await ev(() => { NW.UI.close('talk'); NW.G.openUI('desk'); });
  await page.click('.panel-desk .tab[data-tab="visitor"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/n-desk.png' });
  await ev(() => NW.UI.close('desk'));
  const wasMimic = plan[0].mimic;
  const hpv = await ev(() => NW.G.state.player.hp);
  await ev(() => NW.Night.openForVisitor());
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT + '/n-open.png' });
  const after = await ev(() => ({ hp: NW.G.state.player.hp, guests: NW.G.state.guests.length }));
  if (wasMimic) check(after.hp < hpv - 20, 'opening for a Mimic hurts (' + hpv + ' -> ' + after.hp + ')');
  else check(after.guests === 1, 'opening for a real person shelters them');
  await ev(() => NW.UI.closeAll());

  console.log('# Save mid-night & reload');
  await ev(() => { const s = NW.G.state; s.night.lh.interest = 42; s.night.lh.stage = 'circling'; s.night.dd.meter = 33; NW.G.enterArea('room_office', 100, 100, 'left'); });
  await step(0.5);
  const snap = await ev(() => { NW.G.paused = true; NW.G.save('manual'); const s = NW.G.state; return JSON.stringify({ t: s.time, p: [s.player.area, s.player.x, s.player.y, s.player.hp, s.player.temp, s.player.hunger], inv: s.inv, chest: s.chest, stove: s.stove, cabin: s.cabin, night: s.night, guests: s.guests, visitors: Object.keys(s.visitors).length, journal: s.journal.entries.length }); });
  await page.reload();
  await page.waitForTimeout(700);
  const info = await ev(() => document.getElementById('save-info').textContent);
  check(/Day 4|Day 3/.test(info), 'menu shows save info: ' + info);
  // exact: what is on disk equals the state at the moment of saving
  const disk = await ev(() => { const s = NW.Save.read().state; return JSON.stringify({ t: s.time, p: [s.player.area, s.player.x, s.player.y, s.player.hp, s.player.temp, s.player.hunger], inv: s.inv, chest: s.chest, stove: s.stove, cabin: s.cabin, night: s.night, guests: s.guests, visitors: Object.keys(s.visitors).length, journal: s.journal.entries.length }); });
  check(snap === disk, 'persisted state identical to pre-reload state (' + snap.length + ' chars)');
  if (snap !== disk) { for (let i = 0; i < snap.length; i++) if (snap[i] !== disk[i]) { console.log('   diff at', i, snap.slice(i - 80, i + 80), '\n   vs', disk.slice(i - 80, i + 80)); break; } }
  await page.click('#b-continue');
  const res = await ev(() => { const s = NW.G.state; return { min: s.time.min, day: s.time.day, area: s.player.area, x: s.player.x, y: s.player.y, lh: s.night.lh.stage, li: s.night.lh.interest, dd: s.night.dd.meter, guests: s.guests.length, active: s.night.active, n: s.night.n }; });
  const pre = JSON.parse(snap);
  check(res.day === pre.t.day && Math.abs(res.min - pre.t.min) < 2 && res.area === pre.p[0] && Math.abs(res.x - pre.p[1]) < 1 && res.active && res.n === pre.night.n, 'resumed at same moment/place: day ' + res.day + ' ' + res.min.toFixed(1) + ' vs ' + pre.t.min.toFixed(1) + ' in ' + res.area);
  check(res.lh === pre.night.lh.stage && Math.abs(res.dd - pre.night.dd.meter) < 3 && res.guests === pre.guests.length, 'monster states & guests resumed (LH ' + res.lh + ', DD ' + res.dd.toFixed(1) + ')');
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/n-reloaded.png' });

  console.log('# Corrupted save handling');
  await ev(() => { NW.G.save('manual'); NW.G.save('manual'); });
  await page.waitForTimeout(100);
  await ev(() => { const raw = localStorage.getItem('nightwatch.save'); localStorage.setItem('nightwatch.save', raw.slice(0, raw.length - 40) + 'garbage"}'); });
  await ev(() => NW.UI.showMenu());
  await page.waitForTimeout(200);
  const err1 = await ev(() => ({ info: document.getElementById('save-info').textContent, err: document.getElementById('menu-err').textContent, dis: document.getElementById('b-continue').disabled }));
  check(!err1.dis && /Restored|damaged/i.test(err1.err), 'damaged save falls back to backup: ' + err1.err);
  await ev(() => { localStorage.setItem('nightwatch.save', '{bad json'); localStorage.setItem('nightwatch.save.bak', 'also bad'); NW.UI.refreshMenu(); });
  const err2 = await ev(() => ({ err: document.getElementById('menu-err').textContent, dis: document.getElementById('b-continue').disabled }));
  check(err2.dis && /damaged/i.test(err2.err), 'unrecoverable save reported, continue disabled: ' + err2.err);
  await page.screenshot({ path: OUT + '/n-corrupt.png' });

  console.log('# Death');
  await page.click('#b-delsave');
  await page.click('#b-new'); await page.waitForTimeout(150); await page.evaluate(() => { for (const id of ['ng-intro', 'ng-guided']) { const i = document.getElementById(id); if (i && i.checked) i.click(); } }); await page.click('#ng-start');
  await page.waitForTimeout(200);
  await ev(() => { NW.Survival.damage(150, 'wolf'); });
  await page.waitForTimeout(1800);
  const dead = await ev(() => ({ open: NW.UI.isOpen('gameover'), save: localStorage.getItem('nightwatch.save') }));
  check(dead.open && !dead.save, 'game over screen shown and run deleted');
  await page.screenshot({ path: OUT + '/n-gameover.png' });

  console.log('# Errors: ' + errors.length); errors.forEach((e) => console.log('   ' + e));
  console.log(fails ? fails + ' FAILURES' : 'ALL PASSED');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
