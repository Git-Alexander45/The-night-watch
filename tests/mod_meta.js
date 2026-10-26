// Meta layer: run history, best nights, achievements, endings seen, carried-over monster knowledge, Records panel.
const { chromium } = require('playwright');
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/d607ac6a-93f8-5870-a0ad-942bb41b98fa/scratchpad/shots';
let fails = 0; const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1280, height: 760 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => page.evaluate(f, a);
  const boot = async () => { await page.reload(); await page.waitForFunction(() => window.NW && NW.G && document.getElementById('b-new')); await page.waitForTimeout(250); };
  await page.goto('http://localhost:8123/index.html?view=2d'); await ev(() => localStorage.clear()); await boot();
  const shot = (n) => page.screenshot({ path: SHOTS + '/meta-' + n + '.png' });
  // advance one whole night from the current day
  const night = () => ev(() => {
    const G = NW.G, s = G.state, D = NW.D;
    s.time.min = D.NIGHT_START - 0.5; NW.debug.step(1); NW.UI.closeAll(); G.paused = false;
    s.player.hp = 100; s.player.temp = 36.8; s.player.hunger = 90;
    s.time.min = 23 * 60 + 59.5; NW.debug.step(1);
    s.time.min = D.DAWN - 0.5; s.player.hp = 100; NW.debug.step(1);
    const out = { n: s.nightsSurvived, open: NW.UI.openNames() };
    return out;
  });

  console.log('# Menu button and empty records');
  check(await ev(() => !!document.getElementById('b-x-records')), 'Records button on the main menu');
  check(await ev(() => !localStorage.getItem('nightwatch.meta')), 'no meta record before anything happens');
  await page.click('#b-x-records'); await page.waitForTimeout(150);
  check(await ev(() => NW.UI.isOpen('records') && document.querySelectorAll('.panel-records .tab').length === 4), 'Records panel with 4 tabs');
  await shot('empty-best');
  await ev(() => NW.UI.closeAll());

  console.log('# Run A: a night, knowledge, fish, death');
  await ev(() => NW.G.newGame({ mode: 'standard', seed: 1234, intro: false, guided: false }));
  let r = await ev(() => ({ act: Object.keys(NW.Meta.data().active).length, started: NW.Meta.data().started, id: NW.G.state.mods.meta.id }));
  check(r.act === 1 && r.started === 1 && r.id, 'new run tracked as active');
  r = await night();
  check(r.n === 1 && r.open.includes('dawn'), 'night 1 survived (' + JSON.stringify(r) + ')');
  check(await ev(() => !!NW.Meta.data().ach.first_night), 'achievement: first night');
  check(await ev(() => document.querySelectorAll('.mt-toast').length >= 1 && /First Light/.test(document.querySelector('.mt-toast').textContent)), 'unlock toast shown');
  await ev(() => NW.UI.closeAll()); await page.waitForTimeout(150);
  await shot('toast');
  await ev(() => { NW.Events.unlockRule('dweller', 1); NW.Events.unlockRule('mimic', 2); NW.Hooks.emit('fishCaught', 'trout'); NW.Hooks.emit('placeEntered', 'in_tower'); });
  check(await ev(() => { const d = NW.Meta.data(); return d.rules.dweller.includes(1) && d.rules.mimic.includes(2) && d.ach.fish && d.places.in_tower; }), 'rules, fish and places remembered');
  check(await ev(() => NW.Meta.data().best.standard.n === 1), 'best standard = 1');
  // save + reload mid-run
  await ev(() => NW.G.save('manual')); await boot();
  check(await ev(() => document.querySelectorAll('.mt-toast').length === 0), 'no toasts on page load');
  await ev(() => NW.UI.continueGame(1)); await page.waitForTimeout(150);
  r = await ev(() => ({ id: NW.G.state.mods.meta.id, fish: NW.G.state.mods.meta.fish, ach: !!NW.Meta.data().ach.fish, n: NW.G.state.nightsSurvived }));
  check(r.fish === 1 && r.ach && r.n === 1, 'run state and records survive reload (' + JSON.stringify(r) + ')');
  // wolf kill through the real shooting code
  await ev(() => {
    const G = NW.G, s = G.state; s.time.min = 10 * 60; G.enterArea('f_4_4', 240, 150);
    s.animals = { area: 'f_4_4', list: [{ type: 'wolf', x: 300, y: 150, vx: 0, vy: 0, t: 1, face: 1, hp: 1, state: 'idle' }] };
    NW.Inv.add(s.inv, 'ammo', 3); G.shootCd = 0; G.shoot(300, 144);
  });
  check(await ev(() => NW.G.state.mods.meta.wolves === 1 && !!NW.Meta.data().ach.wolf), 'wolf kill counted');
  await ev(() => { NW.G.enterArea('room_main', 120, 128); NW.G.die('cold'); }); await page.waitForTimeout(1700);
  r = await ev(() => { const d = NW.Meta.data(); return { run: d.runs[0], act: Object.keys(d.active).length, deaths: d.tot.deaths }; });
  check(r.run && r.run.end === 'death' && r.run.causeTitle === 'Frozen' && r.run.nights === 1 && r.run.seed === '1234' && r.run.mode === 'standard', 'death recorded in history (' + JSON.stringify(r.run) + ')');
  check(r.act === 0 && r.deaths === 1, 'run no longer active');
  const go = await ev(() => document.querySelector('.panel-gameover') && document.querySelector('.panel-gameover').textContent);
  check(/New personal best/.test(go) && /Achievements this watch/.test(go) && /Wolf Winter/.test(go), 'game over shows personal best and achievements');
  await shot('gameover');

  console.log('# Run B: carry-over knowledge, then abandoned');
  await ev(() => NW.UI.startNew({ mode: 'standard', slot: 1, seed: 'moon', intro: false, guided: false }));
  r = await ev(() => { const s = NW.G.state; return { d: s.journal.rules.dweller || [], m: s.journal.rules.mimic || [], note: s.journal.entries.some((e) => /kept watch before/.test(e.text)) }; });
  check(r.d.includes(1) && r.m.includes(2) && r.note, 'remembered rules pre-filled with a journal note');
  await ev(() => NW.UI.open('journal')); await page.click('.panel-journal [data-tab=bestiary]'); await page.waitForTimeout(120);
  check(await ev(() => /keep your own room lit/i.test(document.querySelector('.panel-journal').textContent)), 'bestiary shows remembered rule');
  await shot('journal'); await ev(() => NW.UI.closeAll());
  await night(); await ev(() => { NW.UI.closeAll(); NW.G.save('manual'); });
  const bId = await ev(() => NW.G.state.mods.meta.id);
  await ev(() => NW.UI.showMenu());
  await ev(() => NW.UI.startNew({ mode: 'easy', slot: 1, seed: 'pine', intro: false, guided: false }));
  r = await ev((id) => NW.Meta.data().runs.find((x) => x.id === id), bId);
  check(r && r.end === 'abandoned' && r.seed === 'MOON' && r.nights === 1, 'overwritten slot recorded as abandoned (' + JSON.stringify(r) + ')');

  console.log('# Run C: Easy to the end (core ending), Mimic turned away');
  await ev(() => {
    const s = NW.G.state; const vid = NW.Night.genVisitor(2, true); const v = s.visitors[vid];
    NW.Hooks.emit('visitorArrive', v); v.outcome = 'refused'; NW.Hooks.emit('visitorResolved', v, '');
    s.stats.helped = 3; NW.Hooks.emit('visitorOpened', { mimic: false });
    s.time.day = 7; s.nightsSurvived = 6;
  });
  r = await night();
  check(r.n === 7 && r.open.includes('ending'), 'Easy watch ends after night 7 (' + JSON.stringify(r) + ')');
  r = await ev(() => { const d = NW.Meta.data(); return { run: d.runs[0], end: d.endings.road, ach: Object.keys(d.ach), best: d.best.easy }; });
  check(r.run.end === 'ending' && r.run.ending === 'road' && r.end && r.end.n === 1, 'core ending recorded');
  check(['full_watch', 'done_easy', 'mimic_out', 'shut_tight', 'shelter', 'shelter_3'].every((k) => r.ach.includes(k)), 'completion + visitor achievements (' + r.ach.join(',') + ')');
  check(r.best.done === 1 && r.best.n === 7, 'Easy best 7 nights, 1 completion');
  await page.waitForTimeout(400); await shot('ending');
  // endless, then death: history entry is updated, not duplicated
  await ev(() => { NW.UI.closeAll(); NW.G.paused = false; });
  const cId = await ev(() => NW.G.state.mods.meta.id);
  await night(); await ev(() => { NW.UI.closeAll(); NW.G.die('dweller'); }); await page.waitForTimeout(200);
  r = await ev((id) => NW.Meta.data().runs.filter((x) => x.id === id), cId);
  check(r.length === 1 && r[0].nights === 8 && r[0].after === 'Consumed by the Dark', 'endless death updates the ended run (' + JSON.stringify(r[0]) + ')');

  console.log('# Run D: Standard ending from the finale');
  await ev(() => NW.UI.startNew({ mode: 'standard', slot: 2, seed: 'ash', intro: false, guided: false }));
  await ev(() => { const s = NW.G.state; s.time.day = 7; s.nightsSurvived = 6; s.stats.helped = 2; });
  r = await night();
  r = await ev(() => { const d = NW.Meta.data(); return { run: d.runs[0], ach: Object.keys(d.ach), endings: Object.keys(d.endings) }; });
  check(r.run.end === 'ending' && r.run.ending && r.run.ending !== 'road' && r.endings.length === 2, 'finale ending recorded: ' + r.run.ending + ' / ' + r.run.endingTitle);
  check(r.ach.includes('done_standard') && (!r.run.ending || r.ach.includes('end_' + r.run.ending) || !['keeper', 'first_light', 'open_door', 'long_way', 'closed_door', 'hollow'].includes(r.run.ending)), 'standard completion + ending achievement');
  await ev(() => { NW.UI.closeAll(); NW.G.paused = false; NW.G.save('manual'); NW.UI.showMenu(); });

  console.log('# Persistence across reload + Records panel');
  const before = await ev(() => JSON.stringify(NW.Meta.data()));
  await boot();
  check(await ev((b) => JSON.stringify(NW.Meta.data()) === b, before), 'records identical after reload');
  await page.click('#b-x-records'); await page.waitForTimeout(150);
  check(await ev(() => /Standard/.test(document.querySelector('.panel-records').textContent) && /Watches begun/.test(document.querySelector('.panel-records').textContent)), 'best nights tab');
  await shot('best');
  for (const t of ['history', 'ach', 'endings']) {
    await page.click('.panel-records [data-tab=' + t + ']'); await page.waitForTimeout(120); await shot(t);
  }
  r = await ev(() => ({ rows: document.querySelectorAll('.panel-records .tbl tr').length }));
  await page.click('.panel-records [data-tab=history]'); await page.waitForTimeout(80);
  r = await ev(() => ({ rows: document.querySelectorAll('.panel-records .tbl tr').length - 1, txt: document.querySelector('.panel-records .pbody').textContent }));
  check(r.rows === 4 && /Abandoned/.test(r.txt) && /Frozen/.test(r.txt) && /The Road Is Gone/.test(r.txt), 'history lists 4 runs (death, abandoned, ending, ending)');
  await page.click('.panel-records [data-tab=ach]'); await page.waitForTimeout(80);
  r = await ev(() => ({ cards: document.querySelectorAll('.mt-ach').length, on: document.querySelectorAll('.mt-ach.on').length, secret: !!document.querySelector('[data-ach=end_hollow]'), total: NW.Meta.ACH.length, txt: document.querySelector('.panel-records .mt-sum').textContent }));
  check(r.total >= 20 && r.total <= 32 && r.on >= 10 && !r.secret && r.cards < r.total, 'achievements: locked shown with hints, secrets hidden (' + JSON.stringify(r) + ')');
  await page.click('.panel-records [data-tab=endings]'); await page.waitForTimeout(80);
  check(await ev(() => document.querySelectorAll('.mt-end').length === 7 && document.querySelectorAll('.mt-end.off').length === 5), 'endings tab: 2 seen, 5 unknown');
  await ev(() => NW.UI.closeAll());

  console.log('# Remember setting off');
  await ev(() => NW.UI.open('settings')); await page.waitForTimeout(100);
  check(await ev(() => document.getElementById('mt-remember').checked), 'remember knowledge on by default');
  await page.click('#mt-remember'); await page.waitForTimeout(60);
  await shot('settings');
  check(await ev(() => NW.Meta.data().opt.remember === false), 'setting stored');
  await ev(() => { NW.UI.closeAll(); NW.UI.startNew({ mode: 'hard', slot: 3, seed: 'x', intro: false, guided: false }); });
  check(await ev(() => !Object.keys(NW.G.state.journal.rules).some((k) => NW.G.state.journal.rules[k].length)), 'no pre-filled rules when off');
  await ev(() => { NW.Meta.data().opt.remember = true; });

  console.log('# Old save without meta state');
  await ev(() => { delete NW.G.state.mods.meta; const d = NW.Meta.data(); for (const k in d.active) if (d.active[k].slot === 3) delete d.active[k]; localStorage.setItem('nightwatch.meta', JSON.stringify(d)); NW.G.save('manual'); });
  await boot();
  await ev(() => NW.UI.continueGame(3)); await page.waitForTimeout(150);
  r = await ev(() => ({ m: NW.G.state.mods.meta, act: Object.values(NW.Meta.data().active).some((a) => a.slot === 3) }));
  check(r.m && r.m.id && r.act && r.m.best0 != null, 'old save gets meta state lazily and is tracked');
  await night(); check(await ev(() => NW.Meta.data().best.hard.n === 1), 'old save run counts toward best');
  await ev(() => { NW.UI.closeAll(); NW.G.save('manual'); NW.UI.showMenu(); });

  console.log('# Corrupt storage');
  await ev(() => localStorage.setItem('nightwatch.meta', '{"v":1,"runs":[{bad json'));
  await boot();
  r = await ev(() => { const d = NW.Meta.data(); return { rec: NW.Meta.recovered, runs: d.runs.length, bad: !!localStorage.getItem('nightwatch.meta.bad') }; });
  check(r.rec && r.runs === 0 && r.bad, 'unreadable record replaced with a fresh one, raw kept aside');
  await page.click('#b-x-records'); await page.waitForTimeout(120);
  check(await ev(() => /damaged/.test(document.querySelector('.panel-records').textContent)), 'Records panel mentions the recovery');
  await ev(() => NW.UI.closeAll());
  await ev(() => localStorage.setItem('nightwatch.meta', JSON.stringify({ v: 1, runs: 'nope', best: { standard: { n: 'x', done: 2 } }, ach: { fish: { t: 1 } }, rules: { mimic: [1, 99, 'a'], bogus: [1] }, opt: null })));
  await boot();
  r = await ev(() => { const d = NW.Meta.data(); return { runs: Array.isArray(d.runs), best: d.best.standard, fish: !!d.ach.fish, mimic: d.rules.mimic, bogus: !!d.rules.bogus, rem: d.opt.remember }; });
  check(r.runs && r.best.n === 0 && r.best.done === 2 && r.fish && JSON.stringify(r.mimic) === '[1]' && !r.bogus && r.rem === true, 'partly damaged record salvaged (' + JSON.stringify(r) + ')');
  await ev(() => NW.UI.continueGame(3)); await page.waitForTimeout(150);
  await ev(() => { NW.G.die('wolf'); }); await page.waitForTimeout(1600);
  check(await ev(() => NW.Meta.data().runs.length === 1 && NW.UI.isOpen('gameover')), 'play continues normally on the salvaged record');

  const he = await ev(() => NW.hookErrors || []);
  check(he.length === 0, 'no hook errors' + (he.length ? ': ' + he.join(' | ') : ''));
  check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(fails ? fails + ' FAILURES' : 'ALL PASSED');
  await b.close(); process.exit(fails ? 1 : 0);
})();
