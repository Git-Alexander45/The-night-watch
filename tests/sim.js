// Plays many nights with a scripted strategy, logging outcomes. MODE=careful|careless
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:8123/index.html?view=2d');
  await page.waitForTimeout(400);
  await page.click('#b-new'); await page.waitForTimeout(150); await page.evaluate(() => { for (const id of ['ng-intro', 'ng-guided']) { const i = document.getElementById(id); if (i && i.checked) i.click(); } }); await page.click('#ng-start');
  await page.waitForTimeout(200);
  const res = await page.evaluate(async (mode) => {
    const G = NW.G, s = () => G.state, log = [];
    const msgs = []; const origMsg = NW.UI.msg; NW.UI.msg = (t, ty) => { if (ty === 'danger') msgs.push('[' + s().night.n + ' ' + NW.U.fmtClock(s().time.min) + '] ' + t); origMsg(t, ty); };
    const origWarn = NW.UI.warn; NW.UI.warn = (t) => { msgs.push('[' + s().night.n + ' ' + NW.U.fmtClock(s().time.min) + '] !! ' + t); origWarn(t); };
    const careful = mode === 'careful' || mode === 'mid'; const mid = mode === 'mid';
    G.enterArea('room_main', 120, 140, 'down');
    let lastNight = 0, dmg = {};
    const origDamage = NW.Survival.damage;
    NW.Survival.damage = (a, c, q) => { dmg[c] = (dmg[c] || 0) + a; origDamage(a, c, q); };
    for (let sec = 0; sec < 13 * 700 && !G.dead; sec++) {
      const st = s();
      // upkeep: food/fuel so we test monsters, not starvation
      st.player.hunger = Math.max(st.player.hunger, 60);
      if (st.stove.fuel < 20) st.stove.fuel += 10;
      st.oil = Math.max(st.oil, 30);
      NW.Inv.add(st.inv, 'smokeweed', NW.Inv.count(st.inv, 'smokeweed') < 1 ? 1 : 0);
      if (careful) {
        st.stove.setting = st.weather.type === 'blizzard' ? 'medium' : (st.night.si.stage === 'roof' ? 'medium' : 'medium');
        st.lamps.room_main = true;
        for (const w in st.cabin.windows) { const ww = st.cabin.windows[w]; ww.curtClosed = true; if (w.startsWith('w_front') && !mid) ww.shutClosed = true; if (ww.shutter < 40) ww.shutter = 100; if (ww.glass <= 0) ww.boarded = 100; }
        for (const d in st.cabin.doors) { const dd = st.cabin.doors[d]; if (!mid && (dd.hp <= 0 || dd.open)) { dd.hp = Math.max(dd.hp, 60); dd.open = false; } if (!mid) dd.lockBroken = false; if (dd.hp > 0 && !dd.open) dd.locked = true; }
        if (st.night.sc.stage === 'door' && !mid) { if (st.player.stamina >= 15) NW.Night.brace(st.night.sc.door); }
        if (st.night.si.stage === 'roof' && NW.Survival.stoveLit() && !mid) { NW.Inv.remove(st.inv, 'smokeweed', 1); NW.Night.smokeweed(); }
        if (st.night.vis) { const v = st.visitors[st.night.vis.vid]; if (v.mimic) NW.Night.refuseVisitor(); else NW.Night.openForVisitor(); st.cabin.doors.front.locked = true; }
        if (st.player.hp < 50 && !mid) { NW.Inv.add(st.inv, 'medkit', 1); NW.Survival.useMed('medkit'); }
      } else {
        st.stove.setting = 'high'; for (const r in st.lamps) st.lamps[r] = true;
      }
      NW.debug.step(1);
      if (NW.UI.isOpen('dawn') || NW.UI.isOpen('ending')) {
        const n = st.lastSummary ? st.lastSummary.night : '?';
        log.push('Dawn after night ' + n + ': hp ' + st.player.hp.toFixed(0) + ' temp ' + st.player.temp.toFixed(1) + ' | ' + (st.lastSummary ? st.lastSummary.lines.join(' / ') : ''));
        NW.UI.closeAll(); G.paused = false;
        if (n >= 9) break;
      }
      if (st.night.n !== lastNight && st.night.active) { lastNight = st.night.n; const p = st.night.plan; log.push('== Night ' + p ? ('Night ' + st.night.n + ' plan: lh ' + p.lhSens.toFixed(2) + ' dd ' + p.ddSens.toFixed(2) + ' vis ' + p.visitors.length + ' sc ' + p.scratcher.length + ' si ' + p.siphon.length + ' wx ' + st.forecast.night.type + ' ' + st.forecast.night.temp) : ''); }
    }
    return { log, msgs: msgs.slice(-60), dead: G.dead, cause: s().player.lastCause, day: s().time.day, nights: s().nightsSurvived, dmg, err: NW.lastError || null };
  }, process.env.MODE || 'careful');
  console.log(res.log.join('\n'));
  console.log('--- dead:', res.dead, res.cause, 'day', res.day, 'nights', res.nights, 'dmg', JSON.stringify(res.dmg));
  if (process.env.V) console.log(res.msgs.join('\n'));
  console.log('err:', res.err, errors.join('\n'));
  await browser.close();
})();
