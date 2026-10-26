// 3D positional audio: the listener follows the camera, cabin sounds sit on the correct side and are muffled
// through walls, every SFX plays in 2D and 3D, ambience layers follow weather / indoor-outdoor, mute silences
// the master, and node counts stay bounded over simulated minutes.
const { chromium } = require('playwright');
let fails = 0; const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 960, height: 540 } });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(() => {
    const C = window.__ac = { started: 0, ended: 0 };
    [AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype].forEach((P) => {
      const start = P.start;
      P.start = function (...a) { if (!(this.context instanceof OfflineAudioContext)) { C.started++; this.addEventListener('ended', () => C.ended++); } return start.apply(this, a); };
    });
  });
  const ev = (f, a) => page.evaluate(f, a);
  const live = () => ev(() => window.__ac.started - window.__ac.ended);
  // drive the game and the 3D view directly (requestAnimationFrame is unreliable in a loaded headless box)
  const tick = (sec) => ev((s) => { NW.debug.step(s); NW.R3.frame(NW.G.t, 1 / 60); NW.debug.step(1 / 60); NW.R3.frame(NW.G.t, 1 / 60); }, sec || 0.1);
  await page.goto('http://localhost:8123/index.html?view=3d', { timeout: 90000 });
  await page.waitForFunction(() => window.NW && NW.R3 && NW.R3.ready && !NW.R3.preparing && NW.R3.prepareMs, null, { timeout: 300000 });
  await ev(() => localStorage.clear());
  check(await ev(() => !!(NW.R3 && NW.R3.active)), '3D view active');
  await ev(() => { NW.G.newGame({ mode: 'standard', seed: 1234, intro: false, guided: false }); NW.Audio.init(); });
  await tick(); await tick();
  check(await ev(() => !!(NW.R3.View && NW.R3.View.ctx && !NW.R3.View.ctx.menu)), 'first-person view running');
  const base = await live();

  console.log('# Listener follows the camera');
  const lis = async () => ev(() => { const L = NW.Audio.listener(), c = NW.R3.camera, d = c.getWorldDirection(new THREE.Vector3()); return { L, c: { x: c.position.x, y: c.position.y, z: c.position.z, fx: d.x, fy: d.y, fz: d.z } }; });
  for (const yaw of [0, 1.2, -2.4]) {
    await ev((y) => { NW.R3.Controls.yaw = y; }, yaw);
    await tick();
    const r = await lis();
    const dp = Math.hypot(r.L.x - r.c.x, r.L.y - r.c.y, r.L.z - r.c.z), dot = r.L.fx * r.c.fx + r.L.fy * r.c.fy + r.L.fz * r.c.fz;
    const pp = r.L.param ? Math.hypot(r.L.param.x - r.c.x, r.L.param.z - r.c.z) : 0;
    check(r.L.on && dp < 0.3 && dot > 0.97 && pp < 0.5, 'yaw ' + yaw + ': listener at camera (' + dp.toFixed(2) + ' m, AudioListener param ' + pp.toFixed(2) + ' m, facing dot ' + dot.toFixed(3) + ')');
  }

  console.log('# Front-door knock: outside f_2_2 vs inside room_main');
  // side of the last positional sound relative to the listener: +1 = right, -1 = left (and ahead/behind)
  const knock = (yaw) => ev((y) => {
    NW.R3.Controls.yaw = y; NW.Audio.ambience({ wind: 0, rain: 0, fire: 0, drone: 0, whisper: 0, radio: 0 }, 0.016);
    NW.G.sfxCabin('knock', 'door:front', { count: 2 });
    const s = NW.Audio.lastSpatial, l = s.lis, n = Math.hypot(l.fx, l.fz), fx = l.fx / n, fz = l.fz / n, dx = s.x - l.x, dz = s.z - l.z;
    return { right: dx * -fz + dz * fx, ahead: dx * fx + dz * fz, lp: s.lp, frame: s.frame, x: s.x, z: s.z, lx: l.x, lz: l.z };
  }, yaw);
  for (const where of ['outside', 'inside']) {
    await ev((w) => { if (w === 'outside') NW.G.enterArea('f_2_2', 230, 240, 'up'); else NW.G.enterArea('room_main', 64, 90, 'down'); }, where);
    await tick();
    const k0 = await knock(0), k90 = await knock(Math.PI / 2), k180 = await knock(Math.PI), k270 = await knock(-Math.PI / 2);
    const ddx = k0.x - k0.lx, ddz = k0.z - k0.lz; // world offset of the door from the listener
    check(Math.sign(k0.right) === Math.sign(ddx) && Math.sign(k180.right) === -Math.sign(ddx), where + ': facing north/south the door flips side (right ' + k0.right.toFixed(1) + ' / ' + k180.right.toFixed(1) + ', door dx ' + ddx.toFixed(1) + ')');
    check(Math.sign(k90.right) === Math.sign(ddz) && Math.sign(k270.right) === -Math.sign(ddz), where + ': facing east/west the door flips side (right ' + k90.right.toFixed(1) + ' / ' + k270.right.toFixed(1) + ', door dz ' + ddz.toFixed(1) + ')');
    check(Math.sign(k0.ahead) === -Math.sign(ddz), where + ': ahead/behind consistent (' + k0.ahead.toFixed(1) + ')');
    if (where === 'outside') check(k0.frame === 'world' && k0.lp === 0 && k0.x > 0, 'outside: exterior door position, clear (no low-pass)');
    else check(k0.frame === 'cabin' && k0.lp > 0 && k0.lp < 1500 && k0.x < -100, 'inside: interior door position, dull through the door (low-pass ' + k0.lp + ' Hz)');
  }
  const win = await ev(() => { const wid = Object.keys(NW.G.state.cabin.windows)[0]; NW.G.sfxCabin('glasstap', 'win:' + wid); const a = NW.Audio.lastSpatial; NW.G.sfxCabin('beep', 'radio'); const r = NW.Audio.lastSpatial; return { wl: a.lp, rl: r.lp }; });
  check(win.wl > 0 && win.rl >= 0, 'window tap and radio beep positional inside (lp ' + win.wl + ' / ' + win.rl + ')');
  await ev(() => NW.G.enterArea('f_2_2', 230, 240, 'up')); await tick();
  const rOut = await ev(() => { NW.G.sfxCabin('beep', 'radio'); return NW.Audio.lastSpatial.lp; });
  check(rOut > 0 && rOut < 1000, 'radio heard from outside is muffled (' + rOut + ' Hz)');
  const wolf = await ev(() => { const p = NW.G.state.player; NW.G.sfx('growl', { at: { area: 'f_2_2', x: p.x + 60, y: p.y } }); return NW.Audio.lastSpatial; });
  check(wolf && wolf.lp === 0 && Math.abs(wolf.x - wolf.lis.x - 3) < 0.6, 'at: {area,x,y} places a growl 3 m east');

  console.log('# Every SFX plays (3D, then 2D)');
  const names = await ev(() => NW.Audio.sounds());
  const playAll = () => ev((all) => {
    const p = NW.G.state.player;
    all.forEach((n, i) => {
      const o = [{ vol: 0.4 }, { vol: 0.4, pan: 0.6, wet: 0.7 }, { vol: 0.4, at: { area: NW.G.area.id, x: p.x - 40, y: p.y + 20 } }, { vol: 0.4, pos: [0, 1, 0] }][i % 4];
      NW.Audio.play(n, Object.assign({ delay: i * 0.01 }, o));
    });
    ['wood', 'snow', 'trail', 'dirt', 'water', 'ice', 'stone'].forEach((s) => { NW.Audio.play('step', { surface: s, sprint: true, depth: 0.9, cold: true }); NW.Audio.play('step', { surface: s }); });
    ['door:front', 'door:back', 'roof', 'radio', { room: 'room_main', x: 100, y: 120 }].forEach((w) => NW.G.sfxCabin('scratch', w, { vol: 0.3 }));
    NW.Audio.play('gun', { vol: 0.5, wet: 0.8 });
    return NW.Audio.errors.slice();
  }, names);
  let e3 = await playAll();
  check(e3.length === 0 && names.includes('voice'), names.length + ' sounds in 3D without errors ' + JSON.stringify(e3));
  await ev(() => NW.R3.setView('2d')); await tick();
  check(await ev(() => !NW.Audio.listener().on), '2D: listener off');
  const e2 = await playAll();
  check(e2.length === 0, 'all sounds in 2D without errors ' + JSON.stringify(e2));
  const ls2 = await ev(() => { NW.Audio.lastSpatial = null; NW.G.sfxCabin('knock', 'door:front'); NW.G.sfx('growl', { pan: 0.5, at: { area: 'f_2_2', x: 10, y: 10 } }); return NW.Audio.lastSpatial; });
  check(ls2 === null, '2D: no panner path used (stereo pan as before)');
  await ev(() => NW.R3.setView('3d')); await tick();

  console.log('# Ambience layers');
  const L = () => ev(() => NW.Audio.layers());
  const setWx = (type, precip, wind, snow) => ev((a) => { const w = NW.G.state.weather; w.type = a[0]; w.precip = a[1]; w.wind = a[2]; w.snow = a[3]; if (w.tgt) Object.assign(w.tgt, { type: a[0], precip: a[1], wind: a[2] }); }, [type, precip, wind, snow]);
  await setWx('rain', 0.8, 0.5, 0.1); await tick();
  let l = await L();
  check(l.on3 && l.rain > 0.1 && l.roof === 0 && l.leaves > 0.02, 'outside in rain: rain hiss + wind in the trees, no roof (' + JSON.stringify({ rain: l.rain, leaves: l.leaves, roof: l.roof }) + ')');
  await ev(() => { NW.G.enterArea('room_main', 64, 90, 'down'); const s = NW.G.state; s.stove.setting = 'high'; s.stove.fuel = 40; });
  await tick();
  l = await L();
  check(l.roof > 0.05 && l.leaves === 0, 'inside in rain: rain on the roof, no tree wind (roof ' + l.roof.toFixed(3) + ')');
  check(l.fire3 > 0.3 && l.fire === 0 && l.flick > 0, 'stove fire positional in 3D, following the stove light flicker (' + l.fire3.toFixed(2) + ', flick ' + l.flick.toFixed(2) + ')');
  await ev(() => NW.R3.setView('2d')); await tick();
  l = await L();
  check(l.fire > 0.1 && l.fire3 === 0, '2D: original fire level path (' + l.fire.toFixed(2) + ')');
  await ev(() => NW.R3.setView('3d')); await tick();
  await ev(() => { NW.G.enterArea('room_office', 100, 60, 'up'); NW.G.state.radio.pending.push({ text: 'test', day: 1, min: 600 }); });
  await tick();
  l = await L();
  check(l.radio3 > 0 && l.radio === 0, 'radio static from the office radio while messages wait (' + l.radio3.toFixed(3) + ')');
  await ev(() => { NW.G.state.radio.pending.length = 0; });
  await setWx('clear', 0, 0.1, 0.2); await tick();
  l = await L();
  check(l.roof < 0.01 && l.rain < 0.01 && l.radio3 === 0, 'rain and static stop when they should');
  await ev(() => NW.G.enterArea('f_1_2', 200, 170)); await setWx('snow', 0.8, 0.05, 1); await tick();
  l = await L();
  check(l.muffle > 0.4, 'snow-muffled stillness outside in calm snowfall (muffle ' + l.muffle.toFixed(2) + ')');
  const odd = await ev(() => { const A = NW.Audio, r = new Set(); for (let i = 0; i < 24; i++) { A.ambTest('odd', { night: true, inCabin: i % 2 === 0, snow: 0.6 }); r.add(A.lastOdd); } for (let i = 0; i < 6; i++) { A.ambTest('animal', { night: i % 2 === 0, min: 1080, dusk: 1080 }); r.add('a:' + A.lastAnimal); } A.ambTest('creak', {}); A.ambTest('drip', {}); A.ambTest('voice', { mimic: true }); return { kinds: [...r], errs: A.errors.slice() }; });
  check(odd.errs.length === 0 && odd.kinds.length >= 4, 'night oddities / distant animals / creaks / voice play: ' + odd.kinds.join(','));

  console.log('# Mute');
  await ev(() => { NW.settings.mute = true; NW.UI.applyAudio(); }); await page.waitForTimeout(700); await tick();
  check(await ev(() => NW.Audio.stats3d().master < 0.01), 'mute: master gain 0');
  await ev(() => { NW.settings.mute = false; NW.UI.applyAudio(); }); await page.waitForTimeout(700); await tick();
  check(await ev(() => NW.Audio.stats3d().master > 0.3), 'unmute restores master');

  console.log('# Bounded nodes over simulated minutes');
  let maxV = 0, maxLive = 0;
  await ev(() => { const s = NW.G.state; s.time.day = 3; s.time.min = 21 * 60 + 30; });
  for (const [area, x, y] of [['f_2_2', 230, 240], ['room_main', 64, 90], ['f_1_2', 200, 170], ['room_bed', 60, 60]]) {
    for (let i = 0; i < 3; i++) {
      await ev((a) => { NW.G.enterArea(a[0], a[1], a[2], 'down'); NW.debug.step(30); for (let k = 0; k < 30; k++) NW.G.sfxCabin('knock', 'door:front'); }, [area, x, y]);
      maxV = Math.max(maxV, (await ev(() => NW.Audio.stats3d())).voices); maxLive = Math.max(maxLive, await live());
      await tick();
    }
  }
  check(maxV <= 48, 'tracked voices capped (max ' + maxV + ')');
  check(maxLive - base < 600, 'live sources bounded (base ' + base + ', max ' + maxLive + ')');
  await page.waitForTimeout(7000); await tick(0.02);
  const st = await ev(() => NW.Audio.stats3d());
  check(st.voices < 20 && st.dying === 0, 'finished voices disconnected (' + st.voices + ' tracked, ' + st.dying + ' dying)');
  check((await live()) - base < 60, 'sources drain (' + (await live()) + ' vs base ' + base + ')');
  check(await ev(() => NW.Audio.errors.length === 0), 'NW.Audio.errors empty ' + JSON.stringify(await ev(() => NW.Audio.errors)));
  check(await ev(() => !NW.hookErrors || NW.hookErrors.length === 0), 'no hook errors');
  check(errs.length === 0, 'no page errors ' + JSON.stringify(errs.slice(0, 5)));
  console.log(fails ? fails + ' FAILURES' : 'ALL PASSED');
  await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
