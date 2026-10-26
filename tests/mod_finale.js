// Finale module: the Long Night set-piece, the flare choice, endings, the watch log.
const { chromium } = require('playwright');
const SHOTS = process.env.SHOTS || '/tmp/shots';
let fails = 0; const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 960, height: 544 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://localhost:8123/index.html?view=2d'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(400);
  const ev = (f, a) => page.evaluate(f, a);
  // helpers inside the page: keep the ranger alive while time runs, and step to a night minute
  const installHelpers = () => ev(() => {
    window.T = {
      god: true,
      keep() { const s = NW.G.state; s.player.hunger = 100; s.player.temp = 36.8; if (T.god) s.player.hp = 100; s.stove.fuel = 30; s.woodbox = 10; },
      stepTo(nm) { let g = 0; while (NW.Night.nightMin() < nm && NW.G.state.night.active && g++ < 400) { T.keep(); NW.debug.step(2); NW.UI.closeNames(['peephole', 'talk', 'radio', 'reveal']); } return NW.Night.nightMin(); },
    };
    if (!window.__godHook) { window.__godHook = true; NW.Hooks.on('damage', (a) => (window.T && T.god ? 0 : undefined)); }
    NW.__fin = []; NW.Hooks.on('finaleStart', (n) => NW.__fin.push(n));
  });

  console.log('# The Long Night (custom, 3 nights)');
  await ev(() => NW.G.newGame({ mode: 'custom', custom: { nights: 3 }, seed: 1234, intro: false, guided: false }));
  await installHelpers();
  let r = await ev(() => {
    const s = NW.G.state, G = NW.G;
    G.enterArea('room_main', 120, 140, 'down');
    NW.debug.setTime(NW.D.NIGHT_START - 0.5, 3); T.keep(); NW.debug.step(1);
    const p = s.night.plan, f = s.mods.finale;
    return { final: p.final, fin: p.finale, started: NW.__fin.slice(), vid: f.visitor, inPlan: p.visitors.some((v) => v.vid === f.visitor), fvFinale: !!(s.visitors[f.visitor] && s.visitors[f.visitor].finale), radios: p.radio.map((x) => x.kind), vis: p.visitors.length, sc: p.scratcher.length, flare: NW.Inv.count(s.chest, 'signal_flare'), music: NW.Audio.musicMode, relief: f.relief };
  });
  check(r.final && r.fin && r.fin.conv >= 320 && r.fin.sig === 560, 'last night is planned as the Long Night ' + JSON.stringify(r.fin));
  check(r.started.length === 1 && r.started[0] === 3, 'finaleStart(3) emitted once');
  check(r.inPlan && r.fvFinale, 'a final visitor is planned and dressed (' + r.vid + ')');
  check(!r.radios.includes('evening') && !r.radios.includes('numbers'), 'core evening/numbers calls replaced: ' + r.radios.join(','));
  check(r.vis <= 3 && r.sc <= 2, 'threats thinned: ' + r.vis + ' visitors, ' + r.sc + ' scratchers');
  check(r.flare === 1, 'signal flare placed in the storage chest');
  check(r.music === 'finale', 'music is finale (' + r.music + ')');
  check(/^[A-Z][a-z]+ [A-Z]/.test(r.relief), 'relief ranger named: ' + r.relief);
  // isolate the convergence from the Light Hunter / Dweller for a deterministic test
  r = await ev(() => {
    const s = NW.G.state; s.night.plan.lhSens = 0; s.night.plan.ddSens = 0;
    T.stepTo(31);
    const all = s.radio.pending.concat(s.radio.log);
    return { call: all.some((m) => /Relief flies at first light/.test(m.text) && m.text.includes(s.mods.finale.relief)), phrase: s.radio.lastPhrase };
  });
  check(r.call, 'evening Base call names the relief ranger');
  check(r.phrase === 'relief flies at first light', 'call sets the phrase Mimics can echo');
  r = await ev(() => {
    const s = NW.G.state, f = s.mods.finale, W = s.cabin.windows;
    for (const k in W) { W[k].curtClosed = true; W[k].shutClosed = true; }
    W.w_bed.curtClosed = false; W.w_bed.shutClosed = false; s.lamps.room_bed = true; s.oil = 80;
    T.stepTo(s.night.plan.finale.conv + 1);
    const stage0 = f.conv && f.conv.stage;
    const ob = NW.Hooks.filter('objectives', null, s); const objs = ob ? ob.title + ': ' + ob.items.join(' | ') : '';
    for (let i = 0; i < 40 && f.conv.stage !== 'done'; i++) { T.keep(); NW.debug.step(1); }
    return { stage0, objs, stage: f.conv.stage, cracked: f.cracked.slice(), held: f.held.slice(), glass: W.w_bed.glass, ev: s.night.events.slice(-1)[0] };
  });
  check(r.stage0 === 'silence', 'the forest goes silent at the convergence');
  check(/The Long Night/.test(r.objs) && /Every window/.test(r.objs), 'objectives show the Long Night: ' + r.objs);
  check(r.stage === 'done' && r.cracked.join() === 'w_bed' && r.held.length === 4, 'every window tested; only the lit one cracked (' + r.cracked + ' / ' + r.held + ')');
  check(r.glass === 70, 'cracked glass, not broken (' + r.glass + ')');
  check(/found light at the bedroom window/.test(r.ev || ''), 'dawn summary line: ' + r.ev);

  console.log('# Save and reload mid-night');
  await ev(() => NW.G.save('manual'));
  await page.reload(); await page.waitForTimeout(400);
  await page.click('#b-continue'); await page.waitForTimeout(300);
  await installHelpers();
  r = await ev(() => { const s = NW.G.state, f = s.mods.finale; return { active: s.night.active, fin: !!s.night.plan.finale, conv: f.conv && f.conv.stage, cracked: f.cracked.join(), call: f.call, started: NW.__fin.length }; });
  check(r.active && r.fin && r.conv === 'done' && r.cracked === 'w_bed' && r.call, 'finale state survives a reload');
  check(r.started === 0, 'no second finaleStart after reload');
  r = await ev(() => {
    const s = NW.G.state, f = s.mods.finale; s.night.plan.lhSens = 0; s.night.plan.ddSens = 0;
    const at = s.night.plan.visitors.find((v) => v.vid === f.visitor).at;
    let g = 0; while (!(s.night.vis && s.night.vis.vid === f.visitor) && g++ < 200) { T.keep(); NW.debug.step(2); NW.UI.closeNames(['peephole', 'talk', 'reveal']); if (s.night.vis && s.night.vis.vid !== f.visitor) NW.Night.refuseVisitor(); }
    const v = s.visitors[f.visitor];
    const who = NW.Night.answer(v, 'who');
    NW.Night.refuseVisitor();
    return { at, there: !!v, who, tactic: v.tactic, mimic: v.mimic, outcome: v.outcome, relief: f.relief };
  });
  check(r.there && r.outcome === 'refused', 'final visitor knocked (' + r.at + ') and was sent away');
  check(r.mimic ? (r.tactic === 'relief' || r.tactic === 'character') && r.who.includes(r.relief.split(' ')[0]) || r.tactic === 'character' : true, 'final visitor answer fits its role (' + (r.mimic ? 'mimic ' + r.tactic : 'genuine') + '): ' + r.who);

  console.log('# The choice before dawn');
  r = await ev(() => {
    const s = NW.G.state, f = s.mods.finale, I = NW.Inv;
    T.stepTo(561);
    const all = s.radio.pending.concat(s.radio.log);
    const ob = NW.Hooks.filter('objectives', null, s); const obj1 = ob ? ob.title + ': ' + ob.items.join(' | ') : '';
    I.remove(s.chest, 'signal_flare', 1); I.add(s.inv, 'signal_flare', 1);
    NW.G.goOutside('front'); s.player.x = 240; s.player.y = 196; s.player.dir = 'up';
    NW.debug.step(0.1);
    const early = NW.G.focus && NW.G.focus.actions.find((a) => /signal flare/.test(a.label));
    NW.G.enterCabin('front');
    T.stepTo(591);
    return { call: all.some((m) => /flare burning in front of the porch/.test(m.text)), obj1, sig: f.sigCall, early: early ? early.disabled : 'missing', rotors: f.rotors };
  });
  check(r.call && r.sig, 'Base asks for a flare on the porch');
  check(/flare/.test(r.obj1), 'objective names the choice: ' + r.obj1);
  check(r.early === 'Wait for the rotors', 'flare action waits for the rotors (' + r.early + ')');
  check(r.rotors, 'rotors heard');
  r = await ev(() => {
    const s = NW.G.state, f = s.mods.finale;
    NW.G.goOutside('front'); s.player.x = 240; s.player.y = 196; s.player.dir = 'down';
    NW.debug.step(0.1);
    const acts = NW.G.focus ? NW.G.focus.actions.map((a) => a.label) : [];
    const i = acts.findIndex((l) => /signal flare/.test(l));
    if (i >= 0) NW.G.doAction(i);
    NW.debug.step(2.2);
    return { focus: NW.G.focus && NW.G.focus.name, acts, signal: f.signal, flare: f.flare, left: NW.Inv.count(s.inv, 'signal_flare') };
  });
  check(r.acts.some((l) => /signal flare/.test(l)), 'front door outside offers "Light the signal flare"');
  check(r.signal === 'lit' && r.flare && r.left === 0, 'flare lit at ' + JSON.stringify(r.flare));
  await ev(() => { NW.debug.step(4.5); });
  await page.waitForTimeout(250);
  await page.screenshot({ path: SHOTS + '/finale-flare.png' });
  r = await ev(() => { const s = NW.G.state; T.god = false; s.player.hp = 100; NW.debug.step(5); const hp = s.player.hp; T.god = true; return { hp, hurt: s.mods.finale.hurt, danger: s.mods.finale.danger }; });
  check(r.hurt && r.hp < 100 && r.hp > 50 && r.danger === 0, 'staying out in the flare light costs health but is survivable (hp ' + Math.round(r.hp) + ')');
  r = await ev(() => { NW.G.enterCabin('front'); return NW.Finale.facts().signal; });
  check(r === 'lit', 'choice recorded');

  console.log('# Dawn and the ending');
  r = await ev(() => {
    const s = NW.G.state; let g = 0;
    while (!NW.UI.isOpen('ending') && g++ < 200) { T.keep(); NW.debug.step(2); NW.UI.closeNames(['peephole', 'talk', 'radio', 'reveal']); }
    const a = NW.UI.arg.ending;
    return { open: NW.UI.isOpen('ending'), id: s.ending, title: s.endingTitle, ending: a && a.ending, ids: NW.Finale.IDS, music: NW.Audio.musicMode, lines: a && a.lines };
  });
  check(r.open && r.ids.includes(r.id), 'ending panel shows a finale ending: ' + r.id + ' — ' + r.title);
  check(r.ending && r.ending.text.length >= 3 && r.ending.text.length <= 6, 'ending has 3-6 paragraphs');
  check(r.ending && /helicopter/.test(r.ending.text[0]), 'lit flare -> helicopter arrival');
  check(/ending_(good|bad)/.test(r.music), 'ending music: ' + r.music);
  check((r.lines || []).some((l) => /helicopter dropped out of the fog/.test(l)), 'last-night line mentions the helicopter');
  await page.waitForTimeout(200);
  await page.screenshot({ path: SHOTS + '/finale-ending1.png' });
  await ev(() => { document.getElementById('end-go').click(); NW.UI.open('journal'); });
  await page.waitForTimeout(100);
  await page.click('.tab[data-tab="fi_watch"]'); await page.waitForTimeout(150);
  r = await ev(() => document.querySelector('.panel-journal .pbody').textContent);
  check(/watch log/.test(r) && /Lit the flare/.test(r) && /bedroom window/.test(r), 'journal "The watch" logs the run and the last night');
  await page.screenshot({ path: SHOTS + '/finale-journal.png' });
  await ev(() => NW.UI.closeAll());

  console.log('# Every ending is reachable');
  r = await ev(() => {
    const s = NW.G.state, out = {};
    const keep = { C: NW.Characters, M: NW.Missions, U: NW.Upgrades }; NW.Characters = NW.Missions = NW.Upgrades = undefined;
    const mk = (spec) => {
      s.visitors = {}; s.stats.helped = 0; s.stats.genuineRefused = 0; s.stats.mimicsRefused = 0; s.rep = spec.rep || 0;
      let k = 0; const add = (mimic, outcome, name) => { const id = 'tv' + (k++); s.visitors[id] = { id, night: 2 + (k % 2), name, mimic, outcome, app: {}, tells: [], soft: [] }; return id; };
      (spec.sh || []).forEach((n) => { add(false, 'sheltered', n); s.stats.helped++; });
      (spec.ref || []).forEach((n) => { add(false, 'refused', n); s.stats.genuineRefused++; });
      (spec.mo || []).forEach((n) => { add(true, 'refused', n); s.stats.mimicsRefused++; });
      (spec.mi || []).forEach((n) => add(true, 'opened', n));
      s.mods.finale.signal = spec.sig || 'stayed'; s.mods.finale.visitor = null;
      return NW.Hooks.filter('ending', null, { night: 3, lines: [], mode: s.mode });
    };
    const cases = {
      keeper: { sh: ['Ada Moss', 'Ben Hale'], mo: ['Cy Vane'], sig: 'lit', rep: 2 },
      first_light: { sh: ['Ada Moss', 'Ben Hale'], ref: ['Dee Roe'], rep: 1 },
      open_door: { sh: ['Ada Moss', 'Ben Hale'], mi: ['Eli Frost'], rep: 1 },
      long_way: { sh: ['Ada Moss'], ref: ['Dee Roe'] },
      closed_door: { ref: ['Dee Roe', 'Fay Lund'], mo: ['Cy Vane'], rep: -2 },
      hollow: { sh: ['Ada Moss'], mi: ['Eli Frost', 'Gus Pike'], sig: 'lit' },
    };
    for (const id in cases) { const e = mk(cases[id]); out[id] = { got: e && e.id, tone: e && e.tone, n: e && e.text.length, text: e && e.text.join(' ') }; }
    // the cross-module summaries feed the text when present
    NW.Characters = { summary: () => ({ met: 2, saved: 1, lost: 1, list: [{ id: 'c1', name: 'Wren Ott', fate: 'safe' }, { id: 'c2', name: 'Moss Kade', fate: 'dead' }] }) };
    NW.Missions = { summary: () => ({ done: 3, failed: 1, total: 5 }) };
    const e = mk({ sh: ['Ada Moss', 'Ben Hale'], ref: ['Dee Roe'], rep: 1 });
    out.cross = { id: e.id, text: e.text.join(' ') };
    NW.Characters = keep.C; NW.Missions = keep.M; NW.Upgrades = keep.U;
    return out;
  });
  for (const id of ['keeper', 'first_light', 'open_door', 'long_way', 'closed_door', 'hollow']) check(r[id].got === id && r[id].n >= 3 && r[id].n <= 6, 'ending ' + id + ' reachable (' + r[id].got + ', ' + r[id].tone + ', ' + r[id].n + ' paragraphs)');
  check(/Ada Moss and Ben Hale/.test(r.keeper.text) && /Eli Frost/.test(r.open_door.text) && /Dee Roe and Fay Lund/.test(r.closed_door.text), 'endings name the people involved');
  check(/Wren Ott is safe/.test(r.cross.text) && /Moss Kade/.test(r.cross.text) && /3/.test(r.cross.text), 'characters and HQ orders appear in the ending: ' + r.cross.id);
  check(new Set(['keeper', 'first_light', 'open_door', 'long_way', 'closed_door', 'hollow'].map((k) => r[k].text)).size === 6, 'six distinct ending texts');
  // a second ending on screen
  await ev(() => { const s = NW.G.state; s.visitors = { a: { id: 'a', night: 2, name: 'Eli Frost', mimic: true, outcome: 'opened', app: {}, tells: [], soft: [] }, b: { id: 'b', night: 3, name: 'Gus Pike', mimic: true, outcome: 'opened', app: {}, tells: [], soft: [] } }; const e = NW.Hooks.filter('ending', null, { night: 3, lines: [], mode: s.mode }); NW.UI.open('ending', { night: 3, lines: [], ending: e }); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: SHOTS + '/finale-ending2.png' });
  await ev(() => NW.UI.closeAll());

  console.log('# Easy mode keeps the core ending');
  r = await ev(() => {
    NW.G.newGame({ mode: 'easy', seed: 1234, intro: false, guided: false });
    const s = NW.G.state; NW.G.enterArea('room_main', 120, 140, 'down');
    NW.debug.setTime(NW.D.NIGHT_START - 0.5, 7); T.keep(); NW.debug.step(1);
    return { final: s.night.plan.final, fin: !!s.night.plan.finale, end: NW.Hooks.filter('ending', null, { night: 7, lines: [], mode: s.mode }), music: NW.Audio.musicMode, fv: s.mods.finale ? s.mods.finale.visitor : null };
  });
  check(r.final && !r.fin && !r.fv, 'easy: last night is not reshaped');
  check(r.end === null, 'easy: ending filter returns null');
  check(r.music !== 'finale', 'easy: no finale music (' + r.music + ')');

  console.log('# Old save without finale data');
  r = await ev(() => {
    NW.G.newGame({ mode: 'standard', seed: 99, intro: false, guided: false });
    const s = NW.G.state; NW.G.enterArea('room_main', 120, 140, 'down');
    NW.debug.setTime(NW.D.NIGHT_START - 0.5, 7); T.keep(); NW.debug.step(1);
    delete s.mods.finale; delete s.night.plan.finale; // as if planned before the module existed
    NW.G.save('manual'); const saved = NW.Save.read(s.slot).state;
    NW.G.loadState(saved);
    const s2 = NW.G.state; s2.night.plan.lhSens = 0; s2.night.plan.ddSens = 0;
    T.stepTo(40);
    const f = s2.mods.finale;
    let g = 0; while (!NW.UI.isOpen('ending') && g++ < 300) { T.keep(); NW.debug.step(2); NW.UI.closeNames(['peephole', 'talk', 'radio', 'reveal']); if (s2.night.vis) NW.Night.refuseVisitor(); }
    const a = NW.UI.arg.ending;
    return { started: f && f.started, call: f && f.call, plan: !!(s2.night.plan && s2.night.plan.finale), signal: f && f.signal, id: s2.ending, arr: a && a.ending && a.ending.text[0] };
  });
  check(r.started && r.call && r.plan, 'old last-night save picks the finale up lazily');
  check(r.signal === 'stayed' && /truck/.test(r.arr || ''), 'not lighting the flare -> stayed, truck arrival (' + r.id + ')');
  await ev(() => NW.UI.closeAll());

  const he = await ev(() => NW.hookErrors || []);
  check(he.length === 0, 'no hook errors ' + JSON.stringify(he.slice(0, 3)));
  check(errs.length === 0, 'no page errors ' + JSON.stringify(errs.slice(0, 3)));
  console.log(fails ? fails + ' FAILURES' : 'ALL PASSED');
  await b.close(); process.exit(fails ? 1 : 0);
})();
