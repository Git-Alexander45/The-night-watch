// Characters module: the recurring cast by day (talk, trade, advice, requests), at the door by night
// (genuine and Mimic-worn), fates, the People tab and Whereabouts desk tab, save/reload and old saves.
const { chromium } = require('playwright');
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/d607ac6a-93f8-5870-a0ad-942bb41b98fa/scratchpad/shots';
let fails = 0; const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 960, height: 544 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://localhost:8123/index.html?view=2d'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(400);
  const ev = (f, a) => page.evaluate(f, a);
  const shot = (n) => page.locator('#frame').screenshot({ path: SHOTS + '/characters-' + n + '.png' });
  // crop the screen around a world point (area coords)
  const shotAt = async (n, x, y) => {
    const cam = await ev(() => ({ ox: NW.G.area.ox, oy: NW.G.area.oy }));
    const fr = await page.locator('#frame').boundingBox(); const k = fr.width / 480;
    const cx = fr.x + (x + cam.ox) * k, cy = fr.y + (y + cam.oy) * k;
    await page.screenshot({ path: SHOTS + '/characters-' + n + '.png', clip: { x: Math.max(fr.x, Math.min(cx - 170, fr.x + fr.width - 340)), y: Math.max(fr.y, Math.min(cy - 110, fr.y + fr.height - 200)), width: 340, height: 200 } });
  };
  const helpers = () => ev(() => {
    window._fates = window._fates || [];
    if (!window._hooked) { window._hooked = true; NW.Hooks.on('characterFate', (id, f) => window._fates.push(id + ':' + f)); }
    const keep = () => { const s = NW.G.state; s.player.hp = 100; s.player.hunger = 90; s.player.temp = 37; s.stove.fuel = 50; s.stove.setting = 'medium'; };
    window.TT = {
      keep,
      // stand next to a character in the world and use the "Talk" action like a player would
      approach(id) {
        NW.UI.closeAll();
        const sp = NW.Characters.spot(id); if (!sp) return 'no spot';
        const off = { garrow: [0, 0], mara: [12, 6], pell: [24, 8], hale: [0, 0] }[id];
        const x = sp.x + off[0], y = sp.y + off[1];
        NW.G.enterArea(sp.area, x, y + 14, 'up'); NW.G.state.player.x = x; NW.G.state.player.y = y + 13; NW.G.state.player.dir = 'up';
        NW.debug.step(0.05);
        const f = NW.G.focus; return f ? { name: f.name, acts: f.actions.map((a) => a.label), x, y } : 'no focus';
      },
      talkTo(id) { const r = TT.approach(id); const i = NW.G.focus ? NW.G.focus.actions.findIndex((a) => /^Talk to/.test(a.label)) : -1; if (i >= 0) NW.G.doAction(i); return r; },
      press(k) { const el = document.querySelector('.panel-ch_talk [data-k="' + k + '"]'); if (!el || el.disabled) return false; el.click(); return true; },
      log() { return Array.from(document.querySelectorAll('#ch-log .a')).map((e) => e.textContent).join(' | '); },
      toDusk(day) { NW.UI.closeAll(); keep(); NW.G.enterArea('room_main', 120, 128, 'down'); NW.debug.setTime(18 * 60 - 0.5, day); NW.debug.step(1); },
      toNight() { keep(); NW.debug.setTime(19 * 60 - 0.3); NW.debug.step(1); return NW.G.state.night.plan; },
      charVisitor(id) { const s = NW.G.state, p = s.night.plan; const i = p.visitors.findIndex((x) => s.visitors[x.vid].charId === id); return i < 0 ? null : { i, v: s.visitors[p.visitors[i].vid] }; },
      arrive(id) { const r = TT.charVisitor(id); if (!r) return null; NW.G.state.night.plan.done['v' + r.i] = true; NW.G.state.night.vis = null; NW.Night.arrive(r.v.id); return r.v; },
      toDawn(day) { keep(); NW.UI.closeAll(); NW.debug.setTime(6 * 60 - 0.3, day); NW.debug.step(1); NW.UI.closeAll(); return NW.G.state.lastSummary; },
    };
  });

  console.log('# New run, day 1');
  await ev(() => NW.G.newGame({ mode: 'standard', seed: 1234, intro: false, guided: false }));
  await page.waitForTimeout(200); await helpers();
  check(await ev(() => !!NW.Characters && typeof NW.Characters.summary === 'function'), 'NW.Characters API present');
  let sum = await ev(() => NW.Characters.summary());
  check(sum.met === 0 && sum.list.length === 4 && sum.list.every((c) => c.fate === 'unmet' && c.id && c.name), 'summary: 4 unmet characters per contract (' + sum.list.map((c) => c.name).join(', ') + ')');
  check(await ev(() => NW.Hooks.collect('objects', 'f_0_2', NW.World.get('f_0_2')).filter((o) => o.ch).length === 0 && NW.Hooks.collect('objects', 'f_4_0', NW.World.get('f_4_0')).filter((o) => o.ch).length === 0), 'nobody out on the tutorial day');

  console.log('# Day 2: news, permit, radio');
  await ev(() => { NW.debug.setTime(5 * 60 + 59, 2); NW.debug.step(1); NW.UI.closeAll(); NW.debug.setTime(8 * 60 + 15); NW.debug.step(3); });
  let d2 = await ev(() => { const s = NW.G.state, m = NW.Characters.state(); return { pm: s.records.permits.find((p) => p.name === 'Jonah Pell'), radio: s.radio.pending.concat(s.radio.log).some((r) => /Quill to Watch Seven/.test(r.text)), haleDay: m.haleDay, pellArea: m.pellArea }; });
  check(d2.pm && d2.pm.party === 2 && d2.pm.status === 'active' && d2.pm.met, 'the Pells hold a permit (party of 2, ' + (d2.pm && d2.pm.origin) + ')');
  check(d2.radio, 'Mara radios in on day 2');
  console.log('    hale visits on day ' + d2.haleDay + ', pells camp at ' + d2.pellArea);

  console.log('# Meeting Garrow (talk, advice, trade, request)');
  await ev(() => { document.getElementById('hud-msgs').style.visibility = 'hidden'; NW.debug.setTime(10 * 60); });
  let f = await ev(() => TT.approach('garrow'));
  check(f && f.name === 'A grizzled trapper' && f.acts.includes('Talk to them'), 'unmet Garrow shows as a stranger with a Talk action: ' + JSON.stringify(f));
  const gsp = await ev(() => NW.Characters.spot('garrow'));
  await page.waitForTimeout(200); await shotAt('npc-garrow', gsp.x, gsp.y);
  await ev(() => TT.talkTo('garrow')); await page.waitForTimeout(150);
  check(await ev(() => NW.UI.isOpen('ch_talk') && NW.G.paused), 'talk panel opens and pauses the game');
  check(await ev(() => NW.Characters.fate('garrow') === 'alive' && NW.Characters.state().c.garrow.met), 'meeting Garrow: fate alive, met');
  check(await ev(() => /Thirty winters/.test(TT.log())), 'Garrow introduces himself in his voice');
  check(await ev(() => (window._fates || []).includes('garrow:alive')), "'characterFate' emitted on meeting");
  await ev(() => TT.press('advice')); await ev(() => TT.press('advice'));
  check(await ev(() => (NW.G.state.journal.rules.dweller || []).includes(1)), 'advice unlocks a Dark Dweller rule');
  check(await ev(() => NW.Characters.state().c.garrow.know.includes('garrow_night')), 'Garrow says he never walks at night (known fact)');
  // trade
  await ev(() => { NW.Inv.add(NW.G.state.inv, 'raw_rabbit', 2); TT.press('trade'); });
  await page.waitForTimeout(100); await shot('talk-trade');
  let a0 = await ev(() => NW.Inv.count(NW.G.state.inv, 'ammo'));
  await ev(() => document.querySelector('.panel-ch_talk [data-tr="0"]').click());
  let tr = await ev(() => ({ ammo: NW.Inv.count(NW.G.state.inv, 'ammo'), raw: NW.Inv.count(NW.G.state.inv, 'raw_rabbit'), dis: document.querySelector('.panel-ch_talk [data-tr="0"]').disabled }));
  check(tr.ammo === a0 + 6 && tr.raw === 0 && tr.dis, 'trade: 2 raw meat for 6 rounds, once a day (' + JSON.stringify(tr) + ')');
  // request
  await ev(() => TT.press('need'));
  let rq = await ev(() => NW.Characters.state().c.garrow.req);
  check(rq && rq.status === 'open' && rq.due === 4, 'Garrow asks for medicine by day 4');
  check(await ev(() => !!document.querySelector('.panel-ch_talk [data-k="give"]')), 'a Give button appears for the request');
  await page.waitForTimeout(100); await shot('talk');
  await ev(() => NW.UI.close('ch_talk'));

  console.log('# Save and reload mid-request');
  await ev(() => { NW.G.save('manual'); });
  await page.reload(); await page.waitForTimeout(400);
  await page.click('#b-continue'); await page.waitForTimeout(300); await helpers();
  let rl = await ev(() => { const c = NW.Characters.state().c.garrow; return { met: c.met, req: c.req && c.req.status, fate: c.fate, know: c.know.length, day: NW.G.state.time.day }; });
  check(rl.met && rl.req === 'open' && rl.fate === 'alive' && rl.know === 1 && rl.day === 2, 'character state survives a reload: ' + JSON.stringify(rl));
  await ev(() => { document.getElementById('hud-msgs').style.visibility = 'hidden'; NW.Inv.add(NW.G.state.inv, 'bandage', 1); TT.talkTo('garrow'); });
  check(await ev(() => NW.UI.isOpen('ch_talk') && /Ranger|breathing|door/.test(TT.log())), 'Garrow greets a known face after the reload');
  let am = await ev(() => NW.Inv.count(NW.G.state.inv, 'ammo'));
  await ev(() => TT.press('give'));
  let gv = await ev(() => ({ fate: NW.Characters.fate('garrow'), st: NW.Characters.state().c.garrow.req.status, rule: (NW.G.state.journal.rules.scratcher || []).includes(3) }));
  check(gv.fate === 'safe' && gv.st === 'done' && gv.rule, 'delivering the request: Garrow safe, reward rule learned');
  check(await ev((am) => NW.Inv.count(NW.G.state.inv, 'ammo') === am + 6, am), 'request reward: 6 rounds');
  await ev(() => NW.UI.close('ch_talk'));

  console.log('# Meeting Mara and the Pells');
  f = await ev(() => TT.talkTo('mara'));
  check(f && f.name === 'A woman with a notebook', 'Mara at her camp by the mast');
  const msp = await ev(() => NW.Characters.spot('mara'));
  await ev(() => NW.UI.close('ch_talk')); await page.waitForTimeout(150); await shotAt('npc-mara', msp.x, msp.y);
  await ev(() => TT.talkTo('mara'));
  await ev(() => { TT.press('advice'); TT.press('advice'); TT.press('need'); });
  let mr = await ev(() => ({ fate: NW.Characters.fate('mara'), know: NW.Characters.state().c.mara.know, req: NW.Characters.state().c.mara.req, lh: (NW.G.state.journal.rules.lighthunter || []).includes(1) }));
  check(mr.fate === 'alive' && mr.know.includes('mara_radio') && mr.req && mr.req.due === 4 && mr.lh, 'Mara: advice (Light Hunter rule, dusk radio habit) and a food request');
  await ev(() => NW.UI.close('ch_talk'));
  f = await ev(() => TT.talkTo('pell'));
  check(f && f.name === 'Two hikers', 'the Pells at their camp');
  check(await ev(() => /Wren/.test(TT.log()) && NW.Characters.fate('pell') === 'alive'), 'Jonah introduces himself and Wren');
  await ev(() => { TT.press('advice'); TT.press('advice'); TT.press('need'); NW.Inv.add(NW.G.state.inv, 'poultice', 1); });
  await ev(() => NW.UI.refresh('ch_talk'));
  check(await ev(() => TT.press('give') && NW.Characters.fate('pell') === 'safe'), 'Pells: medicine delivered, safe');
  check(await ev(() => (NW.G.state.journal.rules.mimic || []).includes(4) && NW.Characters.state().c.pell.know.includes('pell_together')), 'Jonah warns about the bridge story and that they never split up');
  await ev(() => NW.UI.close('ch_talk'));
  const psp = await ev(() => NW.Characters.spot('pell'));
  await ev(() => TT.approach('pell')); await page.waitForTimeout(150); await shotAt('npc-pell', psp.x + 6, psp.y);

  console.log('# Deputy Hale');
  const hd = d2.haleDay;
  if (hd === 3) { await ev(() => { NW.debug.setTime(5 * 60 + 59, 3); NW.debug.step(1); NW.UI.closeAll(); }); }
  await ev(() => { NW.debug.setTime(10 * 60); });
  check(await ev(() => NW.Characters.present('hale')), 'Hale is at the clearing on his day');
  f = await ev(() => TT.talkTo('hale'));
  check(f && f.name === 'A county deputy', 'Hale shows as a county deputy');
  const hsp = await ev(() => NW.Characters.spot('hale'));
  await ev(() => NW.UI.close('ch_talk')); await page.waitForTimeout(150); await shotAt('npc-hale', hsp.x, hsp.y);
  await ev(() => TT.talkTo('hale')); await ev(() => { TT.press('advice'); TT.press('advice'); TT.press('advice'); TT.press('need'); });
  check(await ev(() => NW.Characters.state().c.hale.know.includes('hale_night') && /Nothing you can carry/.test(TT.log())), 'Hale: back in town before dark; no request');
  await ev(() => { NW.UI.close('ch_talk'); NW.debug.setTime(16 * 60); });
  check(await ev(() => !NW.Characters.present('hale')), 'Hale has left by the afternoon');
  if (hd === 2) await ev(() => { NW.debug.setTime(5 * 60 + 59, 3); NW.debug.step(1); NW.UI.closeAll(); });
  let d3 = await ev(() => ({ pm: NW.G.state.records.permits.find((p) => p.name === 'Jonah Pell').status, where: NW.Characters.state().c.pell.where }));
  check(d3.pm === 'checkedout' && d3.where === 'town', 'helped Pells check out at the trailhead next morning');

  console.log('# Night 3: a Mimic wears Jonah Pell');
  await ev(() => TT.toDusk(3)); let plan = await ev(() => TT.toNight());
  let pv = await ev(() => { const r = TT.charVisitor('pell'); return r && { mimic: r.v.mimic, tactic: r.v.tactic, tells: r.v.tells, app: r.v.app.coat === NW.Characters.cast.pell.app.coat }; });
  check(pv && pv.mimic && pv.tactic === 'checkedout' && pv.tells.includes('checkedout') && pv.tells.includes('nobreath') && pv.app, 'night 3: Mimic wearing Jonah, tells kept (checked-out permit, no breath): ' + JSON.stringify(pv));
  let ans = await ev(() => { const v = TT.arrive('pell'); NW.UI.open('talk'); document.querySelector('[data-q="who"]').click(); NW.UI.close('talk'); return { who: v.log[0].a, vis: NW.Night.visual(v) }; });
  check(/Just Jonah/.test(ans.who) && !ans.vis.blinks && !ans.vis.breath, 'it says "just Jonah" (they never split up), no blink, no breath fog');
  await ev(() => { NW.UI.open('desk'); const t = document.querySelector('.panel-desk [data-tab=visitor]'); t && t.click(); });
  check(await ev(() => /Checked out/.test(document.querySelector('.panel-desk .pbody').textContent)), 'the desk shows Jonah Pell checked out: the contradiction is discoverable');
  await ev(() => { NW.UI.close('desk'); NW.Night.refuseVisitor(); });
  let sm = await ev(() => TT.toDawn(4));
  check(await ev(() => NW.G.state.records.reports.some((r) => /Halvard/.test(r.text)) && NW.Characters.fate('pell') === 'safe'), 'dawn: HQ confirms the Pells are home; Jonah stays safe');

  console.log('# Night 4: a Mimic wears Deputy Hale');
  await ev(() => TT.toDusk(4)); await ev(() => TT.toNight());
  let hv = await ev(() => { const v = TT.arrive('hale'); return v && { mimic: v.mimic, tactic: v.tactic, tells: v.tells, where: NW.Night.answer(v, 'where'), who: NW.Night.answer(v, 'who') }; });
  check(hv && hv.mimic && hv.tactic === 'character' && hv.tells.includes('nobreath'), 'night 4: Mimic wearing Hale, with a hard tell: ' + JSON.stringify(hv && hv.tells));
  check(hv && /Drove up from HQ/.test(hv.where), 'it claims to have driven up at night: ' + (hv && hv.where));
  await ev(() => { NW.UI.open('desk'); const t = document.querySelector('.panel-desk [data-tab=whereabouts]'); t && t.click(); });
  check(await ev(() => /Never on the road at night/.test(document.querySelector('.panel-desk .pbody').textContent)), 'desk Whereabouts: Hale is in town, never on the road at night');
  await page.waitForTimeout(100); await shot('whereabouts');
  await ev(() => { NW.UI.close('desk'); NW.Night.refuseVisitor(); });
  await ev(() => TT.toDawn(5));
  check(await ev(() => NW.G.state.records.reports.some((r) => /it wasn't him/.test(r.text))), 'dawn: HQ says Hale was in town');
  check(await ev(() => NW.Characters.state().c.mara.req.status === 'failed'), "Mara's request lapsed (day 4)");

  console.log('# Night 5: Mara comes down for real');
  await ev(() => TT.toDusk(5)); await ev(() => TT.toNight());
  check(await ev(() => NW.G.state.radio.pending.concat(NW.G.state.radio.log).some((r) => r.day === 5 && /coming down to you/.test(r.text))), 'Mara radios at dusk that she is coming down');
  let mv = await ev(() => { const v = TT.arrive('mara'); return v && { mimic: v.mimic, need: v.need, tells: v.tells, who: NW.Night.answer(v, 'who'), what: NW.Night.answer(v, 'what'), vis: NW.Night.visual(v), origin: v.origin }; });
  check(mv && !mv.mimic && mv.need === 'food' && mv.tells.length === 0 && mv.vis.blinks && mv.origin === 'f_4_0', 'night 5: genuine Mara at the door, needs food: ' + JSON.stringify(mv && { need: mv.need, origin: mv.origin }));
  check(mv && /radioed/.test(mv.who) && /walked down in the dark/.test(mv.what), 'she answers in her voice and explains breaking her habit');
  await ev(() => { NW.UI.open('talk'); const b = document.querySelector('[data-q="who"]'); b && b.click(); });
  await page.waitForTimeout(250); await shot('door-mara');
  await ev(() => { NW.UI.close('talk'); NW.Night.openForVisitor(); const g = NW.G.state.guests[0]; NW.Inv.add(NW.G.state.inv, 'canned', 1); const a = NW.Night.guestActions(g).find((x) => /^Give/.test(x.label)); a && a.run(); });
  await ev(() => TT.toDawn(6));
  check(await ev(() => NW.Characters.fate('mara') === 'safe' && NW.Characters.state().c.mara.where === 'town'), 'sheltered Mara: safe, leaves the forest');

  console.log('# Night 6: a Mimic wears Garrow, and is let in');
  await ev(() => TT.toDusk(6)); await ev(() => TT.toNight());
  let gm = await ev(() => { const v = TT.arrive('garrow'); return v && { mimic: v.mimic, tells: v.tells, where: NW.Night.answer(v, 'where'), weather: NW.Night.answer(v, 'weather') }; });
  check(gm && gm.mimic && gm.tells.includes('nobreath') && /in the dark/.test(gm.where), 'night 6: "Garrow" says he walked over in the dark (he never walks at night)');
  await ev(() => { NW.UI.open('journal'); const t = document.querySelector('.panel-journal [data-tab=people]'); t && t.click(); });
  check(await ev(() => /never walks at night/i.test(document.querySelector('.panel-journal .pbody').textContent)), 'People tab records that Garrow never walks at night');
  await page.waitForTimeout(150); await shot('people');
  await ev(() => { NW.UI.close('journal'); NW.Night.openForVisitor(); });
  await page.waitForTimeout(100);
  check(await ev(() => NW.G.state.player.hp < 100), 'opening the door to it hurts');
  sm = await ev(() => TT.toDawn(7));
  check(await ev(() => NW.Characters.fate('garrow') === 'taken'), 'Garrow is taken after his Mimic was let in');
  check(sm && sm.lines.some((l) => /shack stands open/.test(l)), 'dawn summary tells what happened at the shack');

  console.log('# Summary and journal');
  sum = await ev(() => NW.Characters.summary());
  check(sum.met === 4 && sum.saved === 2 && sum.lost === 1, 'summary: met 4, saved 2, lost 1 (' + JSON.stringify({ met: sum.met, saved: sum.saved, lost: sum.lost }) + ')');
  check(JSON.stringify(sum.list.map((c) => [c.id, c.fate])) === JSON.stringify([['garrow', 'taken'], ['mara', 'safe'], ['pell', 'safe'], ['hale', 'alive']]), 'fates: ' + JSON.stringify(sum.list.map((c) => c.id + ':' + c.fate)));
  let fl = await ev(() => window._fates);
  check(['garrow:safe', 'pell:safe', 'mara:safe', 'garrow:taken'].every((x) => fl.includes(x)), 'characterFate events: ' + fl.join(', '));
  check(await ev(() => { try { JSON.parse(JSON.stringify(NW.G.state.mods.characters)); return true; } catch (e) { return false; } }), 'run state is JSON-safe');
  await ev(() => { NW.UI.open('journal'); const t = document.querySelector('.panel-journal [data-tab=people]'); t && t.click(); });
  check(await ev(() => { const t = document.querySelector('.panel-journal .pbody').textContent; return /Amos Garrow/.test(t) && /Taken/.test(t) && /Mara Quill/.test(t) && /Ray Hale/.test(t) && document.querySelectorAll('.panel-journal .ch-face').length === 4; }), 'People tab lists all four with portraits and fates');
  await page.waitForTimeout(150); await shot('people-end');
  await ev(() => NW.UI.closeAll());
  check(await ev(() => NW.Hooks.collect('objects', NW.Characters.spot('garrow').area, NW.World.get(NW.Characters.spot('garrow').area)).filter((o) => o.ch).length === 0 && NW.Hooks.collect('objects', 'f_4_0', NW.World.get('f_4_0')).every((o) => !/Mara Quill/.test(typeof o.name === 'function' ? o.name() : o.name))), 'gone characters no longer appear in the world');

  console.log('# Old save without characters data');
  await ev(() => { NW.debug.setTime(9 * 60); delete NW.G.state.mods.characters; NW.G.save('manual'); });
  await page.reload(); await page.waitForTimeout(400);
  await page.click('#b-continue'); await page.waitForTimeout(300); await helpers();
  let old = await ev(() => { const s = NW.Characters.summary(); NW.debug.step(1); const o = NW.Hooks.collect('objects', 'f_4_0', NW.World.get('f_4_0')).filter((x) => x.ch); return { met: s.met, fates: s.list.map((c) => c.fate).join(','), objs: o.length, play: NW.G.mode }; });
  check(old.met === 0 && old.fates === 'unmet,unmet,unmet,unmet' && old.objs >= 3 && old.play === 'play', 'old save loads; cast reset to defaults, Mara camp placed: ' + JSON.stringify(old));
  await ev(() => { NW.UI.open('journal'); const t = document.querySelector('.panel-journal [data-tab=people]'); t && t.click(); });
  check(await ev(() => /No one yet/.test(document.querySelector('.panel-journal .pbody').textContent)), 'People tab on an old save: nobody met yet');
  await ev(() => NW.UI.closeAll());

  console.log('# Second run: the Pells are turned away');
  await ev(() => NW.G.newGame({ mode: 'standard', seed: 4322, intro: false, guided: false }));
  await page.waitForTimeout(150); await helpers();
  await ev(() => { NW.debug.setTime(5 * 60 + 59, 2); NW.debug.step(1); NW.UI.closeAll(); NW.debug.setTime(10 * 60); TT.talkTo('pell'); NW.UI.close('ch_talk'); TT.talkTo('garrow'); TT.press('need'); NW.UI.close('ch_talk'); });
  await ev(() => TT.toDusk(3)); await ev(() => TT.toNight());
  let gp = await ev(() => { const v = TT.arrive('pell'); return v && { mimic: v.mimic, permit: v.permit, party: v.party, need: v.need, who: NW.Night.answer(v, 'who'), vis: NW.Night.visual(v), id: v.id }; });
  check(gp && !gp.mimic && gp.permit && gp.party === 2 && gp.need === 'medicine' && /party of two/.test(gp.who) && gp.vis.blinks, 'night 3: the real Jonah Pell, on a permit, needs medicine');
  await ev(() => NW.Night.refuseVisitor());
  await ev(() => TT.toDawn(4));
  let pf = await ev(() => ({ fate: NW.Characters.fate('pell'), where: NW.Characters.state().c.pell.where, att: NW.Characters.state().c.pell.att }));
  check((pf.fate === 'missing' && pf.where === 'gone') || (pf.fate === 'alive' && pf.where === 'town'), 'turned away: missing, or rescued with frostbite: ' + JSON.stringify(pf));
  if (pf.fate === 'missing') {
    await ev(() => TT.toDawn(5));
    check(await ev(() => NW.Characters.fate('garrow') === 'missing' && NW.G.state.records.reports.some((r) => /trapper is missing/.test(r.text))), "Garrow's request lapsed: his shack is found empty, he is missing");
    await ev(() => TT.toDawn(6));
    check(await ev(() => NW.Characters.fate('pell') === 'dead' && NW.G.state.records.reports.some((r) => /search for Jonah Pell is over/.test(r.text))), 'two days later the search ends: dead');
  }
  check(await ev(() => !NW.Characters.present('pell')), 'the Pells are gone from their camp');

  const hookErrs = await ev(() => NW.hookErrors || []);
  check(hookErrs.length === 0, 'no hook errors' + (hookErrs.length ? ': ' + hookErrs.join('\n') : ''));
  check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join('\n') : ''));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
