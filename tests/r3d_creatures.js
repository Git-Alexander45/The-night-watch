// 3D creatures test (js/r3d/creatures.js): a lineup by day and by night, then in-game cases driven by the real
// entity sync in view.js: wildlife, a visitor and a Mimic through the peephole, the reveal, the Light Hunter at a
// window, the Scratcher at the door, the Pale Stag hunting, the Dark Dweller, Juniper, seated guests and the
// first-person viewmodel. If the cabin builder provides no anchors yet, stand-in anchors are injected so the
// cabin-related creatures can still be checked. Screenshots: $SHOTS/creatures-*.png.
// Run: NODE_PATH=/opt/node22/lib/node_modules node tests/r3d_creatures.js [case ...]
// Software WebGL is slow (and slower when other browsers run): every shot waits for real frames.
const { chromium } = require('playwright');
const fs = require('fs');
const SH = (process.env.SHOTS || '/tmp/claude-0/-home-user/d607ac6a-93f8-5870-a0ad-942bb41b98fa/scratchpad/s3') + '/';
const URL = process.env.URL || 'http://localhost:8123/index.html';
fs.mkdirSync(SH, { recursive: true });
const want = process.argv.slice(2);
const on = (k) => !want.length || want.includes(k);
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL ' + m); } else console.log('ok   ' + m); };

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1024, height: 576 } });
  p.setDefaultTimeout(600000);
  const errs = [];
  p.on('pageerror', (e) => errs.push('PE ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('E ' + m.text().slice(0, 300)); });
  await p.goto(URL); await p.waitForFunction(() => window.NW && NW.R3 && NW.R3.ready && !NW.R3.preparing && NW.R3.prepareMs, null, { timeout: 300000 }); await p.waitForTimeout(500);
  await p.evaluate(() => {
    NW.settings.quality = 'low'; NW.R3.applyQuality();
    window.__fr = 0; window.__hooks = [];
    NW.Hooks.on('r3Frame', (ctx) => { window.__fr++; window.__hooks.forEach((f) => { try { f(ctx); } catch (e) { console.error(e); } }); });
    NW.Hooks.on('update', () => { if (window.__pin) try { window.__pin(); } catch (e) { console.error(e); } });
    NW.G.newGame({ mode: 'standard', seed: 1234, intro: false, guided: false });
  });
  await p.addStyleTag({ content: '#hud, .hud, #msgs, #toasts, #prompt, #look-hint, #crosshair, #toast, .toast, #areaName, .area-name { opacity: 0 !important; }' });
  const frames = async (n) => { const f0 = await p.evaluate(() => window.__fr); await p.waitForFunction((t) => window.__fr >= t, f0 + n, { timeout: 900000, polling: 500 }); };
  const shot = async (name, n) => { await frames(n || 4); await p.screenshot({ path: SH + 'creatures-' + name + '.png', timeout: 900000 }); console.log('shot ' + name + '  ' + JSON.stringify(await p.evaluate(() => NW.R3.renderer.info.render))); };
  const reset = () => p.evaluate(() => { window.__hooks = []; window.__pin = null; (window.__lu || []).forEach((c) => NW.R3.scene.remove(c.obj)); window.__lu = []; NW.UI.closeAll ? NW.UI.closeAll() : ['peephole', 'window', 'reveal', 'talk'].forEach((k) => NW.UI.isOpen(k) && NW.UI.close(k)); });
  // stand-in cabin anchors (only when the cabin builder doesn't provide them)
  const anchors = () => p.evaluate(() => {
    const R3 = NW.R3, V = R3.View, K = R3.K;
    const cab = V.groups.__cabin; if (!cab) return 'no cabin group';
    if (cab.anchors && cab.anchors.peephole) return 'real';
    const o = R3.areaOrigin('room_main');
    const vp = new THREE.Vector3(o.x + 5, 0, o.z - 3);
    const rooms = {};
    ['room_main', 'room_bed', 'room_office', 'room_storage'].forEach((id) => { const a = NW.World.get(id), q = R3.areaOrigin(id), w = a.w * 16 * K, h = a.h * 16 * K;
      rooms[id] = { center: new THREE.Vector3(q.x + w / 2, 0, q.z + h / 2), corners: [[0.9, 1.7], [w - 0.9, 1.7], [w - 0.9, h - 0.9], [0.9, h - 0.9]].map(([x, z]) => new THREE.Vector3(q.x + x, 0, q.z + z)) }; });
    const wout = new THREE.Vector3(o.x + 1.5, 0, o.z - 3);
    cab.anchors = { stub: true, porchVisitor: { pos: vp, yaw: 0 }, peephole: { pos: new THREE.Vector3(vp.x, 1.64, vp.z + 0.6), yaw: 0, pitch: -0.02 },
      windows: { w_front_l: { outside: wout, yaw: Math.PI, view: { pos: new THREE.Vector3(wout.x, 1.55, wout.z + 1.5), yaw: 0, pitch: 0.02 } } },
      frontDoorOutside: { pos: new THREE.Vector3(vp.x, 0, vp.z), yaw: 0, approach: new THREE.Vector3(vp.x, 0, vp.z - 4) }, backDoorOutside: { pos: new THREE.Vector3(vp.x, 0, vp.z), yaw: 0, approach: new THREE.Vector3(vp.x, 0, vp.z - 4) },
      rooms, ring: { x: o.x + 4, y: 0, z: o.z + 3, r: 9 } };
    // a porch floor, a door frame and a window pane so the close-ups have something behind/around them
    const g = new THREE.Group(); g.name = 'stubPorch';
    const wood = R3.std({ color: 0x4a3222, roughness: 0.85 }), glass = R3.std({ color: 0x9fb4c4, roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(6, 0.1, 5), wood); floor.position.set(vp.x - 1.5, -0.05, vp.z - 1); g.add(floor);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 0.2), R3.std({ color: 0x3a2618, roughness: 0.9 })); wall.position.set(vp.x - 2, 1.5, vp.z - 3.5); g.add(wall);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.1), glass); pane.position.set(wout.x, 1.45, wout.z + 0.62); g.add(pane);
    [[-0.52, 1.45, 0.08, 1.2], [0.52, 1.45, 0.08, 1.2], [0, 0.88, 1.12, 0.08], [0, 2.02, 1.12, 0.08]].forEach(([x, y, w, h]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), wood); m.position.set(wout.x + x, y, wout.z + 0.66); g.add(m); });
    const wl = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3, 0.15), R3.std({ color: 0x3a2618, roughness: 0.9 })); wl.position.set(wout.x, 1.5, wout.z + 0.75); wl.scale.set(1, 1, 1);
    R3.scene.add(g);
    window.__porchLight = (ctx) => { ctx.addLight({ key: 'porch', x: vp.x + 0.6, y: 2.3, z: vp.z + 0.5, color: [1, 0.66, 0.36], intensity: 5, range: 7, flicker: 'lantern' }); };
    return 'stub';
  });
  const night = (extra) => p.evaluate((extra) => { const s = NW.G.state; s.time.min = 22 * 60 + 30; s.weather.type = 'snow'; s.weather.precip = 0.5; s.weather.temp = -10; s.weather.snow = 0.8; s.weather.fog = 0.1; if (extra) Object.assign(s.weather, extra); }, extra || null);

  // ---------------------------------------------------------------- lineup
  const lineup = (isNight) => p.evaluate((isNight) => {
    const G = NW.G, s = G.state, R3 = NW.R3;
    s.time.min = isNight ? 23 * 60 : 12 * 60; s.weather.type = 'snow'; s.weather.precip = 0.25; s.weather.temp = -8; s.weather.fog = 0.05; s.night.active = false;
    G.enterArea('f_2_1', 240, 236, 'up');
    R3.Controls.yaw = 0; R3.Controls.pitch = -0.1;
    const kinds = [['human', { app: { coat: '#a5352e', hat: 'beanie', hatColor: '#2a3f66', scarf: '#d2a838', beard: true, hair: '#382014', skin: '#d49c76' } }, { pose: 'stand', breath: true, blinks: true, snowy: true }],
      ['human', { app: { coat: '#2a3f66', hat: 'hood', hatColor: '#556538', hairStyle: 'long', glasses: true, skin: '#ad7552', hair: '#08090e' } }, { pose: 'walk', moving: true, speed: 1.3, blinks: true }],
      ['human', { app: { coat: '#4a3a5c', hat: 'none', hairStyle: 'bald', old: true, skin: '#ecc19c', hair: '#adb4bf', beard: true } }, { pose: 'stand', blinks: true }],
      ['human', { app: { coat: '#8c6a1f', hat: 'cap', hatColor: '#a5352e', skin: '#7d5038', hair: '#08090e' } }, { pose: 'sit', blinks: true }],
      ['dog', {}, { pose: 'stand' }], ['dog', {}, { pose: 'walk', moving: true, speed: 2.5 }], ['dog', {}, { pose: 'lie' }], ['wolf', {}, { moving: true, speed: 3.7, angry: true, state: 'chase' }], ['wolf', {}, { angry: true, state: 'warn' }],
      ['fox', {}, { moving: true, speed: 1.0 }], ['deer', {}, { grazing: true }], ['deer', {}, { moving: true, speed: 5 }], ['rabbit', {}, { moving: true, speed: 3 }], ['rabbit', {}, {}], ['crow', {}, {}], ['crow', {}, { flying: true }],
      ['lighthunter', {}, { stage: 'menu' }], ['stag', {}, { stage: 'watching' }], ['scratcher', {}, { stage: 'approach', moving: true }], ['siphon', {}, {}]];
    R3.camera.updateMatrixWorld();
    const cam = R3.camera.position.clone();
    const out = [], stats = {};
    kinds.forEach(([k, o, st], i) => {
      const c = R3.Creatures.make(k, o); if (!c) { stats[k] = 'FAILED'; return; }
      const row = i < 9 ? 0 : 1, col = row ? i - 9 : i;
      const x = cam.x + (col - (row ? 5 : 4)) * (row ? 1.25 : 1.3), z = cam.z - 5 - row * 4;
      c.obj.position.set(x, R3.groundAt(x, z, 'f_2_1'), z); c.obj.rotation.y = ['human', 'lighthunter', 'stag', 'siphon'].includes(k) ? 0.3 : 1.0;
      R3.scene.add(c.obj); c.st = st; out.push(c);
      let tris = 0, draws = 0; c.obj.traverse((m) => { if (m.isMesh && m.geometry.index) { tris += m.geometry.index.count / 3; draws++; } });
      stats[k + (stats[k] ? i : '')] = { meshes: draws, tris: Math.round(tris) };
    });
    window.__lu = out;
    window.__hooks = [(ctx) => { out.forEach((c) => c.update(ctx.dt, c.st, ctx)); if (isNight) { const p2 = R3.camera.position; ctx.addLight({ key: 'lantern2', x: p2.x - 0.3, y: p2.y - 0.4, z: p2.z - 2, color: [1, 0.62, 0.3], intensity: 14, range: 16, flicker: 'lantern', shadow: 2 }); } }];
    return stats;
  }, isNight);
  if (on('lineup')) {
    const st = await lineup(false); console.log('per-creature (all meshes incl. optional tells):', JSON.stringify(st));
    await shot('lineup-day', 5);
    await lineup(true); await shot('lineup-night', 5);
    await reset();
  }
  // ---------------------------------------------------------------- close-up turntable of the human face (day)
  if (on('face')) {
    await p.evaluate(() => {
      const R3 = NW.R3, s = NW.G.state; s.time.min = 12 * 60; NW.G.enterArea('f_2_1', 240, 236, 'up'); R3.Controls.yaw = 0; R3.Controls.pitch = 0;
      R3.camera.updateMatrixWorld(); const cam = R3.camera.position.clone();
      const a = R3.Creatures.make('human', { app: { coat: '#2a3f66', hat: 'beanie', hatColor: '#6f1a1f', scarf: '#a5352e', skin: '#d49c76', hair: '#714326', eyes: '#46639a' } });
      const m = R3.Creatures.make('human', { app: { coat: '#2e281d', hat: 'none', hairStyle: 'short', skin: '#ad7552', hair: '#08090e', glasses: true, beard: true } });
      [a, m].forEach((c, i) => { const x = cam.x + (i ? 0.35 : -0.35), z = cam.z - 0.95; c.obj.position.set(x, R3.camera.position.y - 1.66, z); R3.scene.add(c.obj); });
      a.st = { pose: 'stand', breath: true, blinks: true, talking: true }; m.st = { pose: 'stand', snowy: true, mimic: true };
      window.__lu = [a, m]; window.__hooks = [(ctx) => window.__lu.forEach((c) => c.update(ctx.dt, c.st, ctx))];
    });
    await shot('face-day', 5);
    await reset();
  }
  // ---------------------------------------------------------------- wildlife in a forest area (real spawning objects)
  if (on('animals')) {
    await p.evaluate(() => {
      const G = NW.G, s = G.state; s.time.min = 11 * 60; s.weather.type = 'clear'; s.weather.fog = 0.02; s.night.active = false;
      G.enterArea('f_1_1', 240, 200, 'up'); NW.R3.Controls.yaw = 0; NW.R3.Controls.pitch = -0.08;
      const mk = (type, x, y, extra) => Object.assign({ type, x, y, t: 99, face: 1, vx: 0, vy: 0, hp: type === 'wolf' ? 2 : 1, state: type === 'wolf' ? 'idle' : undefined }, extra || {});
      s.animals = { area: 'f_1_1', list: [mk('deer', 180, 90, { grazing: true }), mk('rabbit', 215, 120), mk('fox', 270, 110), mk('wolf', 320, 80), mk('crow', 245, 125), mk('deer', 300, 140, { dead: true })] };
      window.__pin = () => { s.animals.list.forEach((a) => { if (!a.dead) { a.t = 99; a.scared = 0; } }); };
    });
    await shot('animals-day', 6);
    await p.evaluate(() => { const s = NW.G.state; s.animals.list[3].state = 'warn'; s.animals.list[3].angry = true; s.time.min = 22 * 60 + 40; s.night.active = false; });
    await shot('animals-night', 5);
    await reset();
  }
  // ---------------------------------------------------------------- visitors through the peephole
  const visitor = async (mimic, name, extra) => {
    await p.evaluate(({ mimic }) => {
      const N = NW.Night, s = NW.G.state;
      s.time.min = 22 * 60; if (!s.night.active) N.begin();
      s.night.vis = null;
      const vid = N.genVisitor(3, mimic);
      const v = s.visitors[vid]; if (mimic && !v.tells.includes('nobreath')) v.tells.push('nobreath');
      if (mimic) v.tells = v.tells.filter((t) => t !== 'dry');
      N.arrive(vid);
      s.night.lh.stage = 'away'; s.night.sc.stage = 'none'; s.night.dd.on = false;
      NW.G.enterArea('room_main', 200, 150, 'up');
      window.__vid = vid;
    }, { mimic });
    await night(extra);
    const how = await anchors(); console.log('anchors: ' + how);
    await p.evaluate(() => { window.__hooks = [(ctx) => window.__porchLight && window.__porchLight(ctx)]; NW.UI.open('peephole'); });
    await shot(name, 6);
  };
  if (on('peephole')) {
    await visitor(false, 'peephole-real');
    await visitor(true, 'peephole-mimic');
    // the reveal: view.js does not pass st.reveal yet, so the test drives it on the live entity
    await p.evaluate(() => {
      NW.UI.close('peephole');
      const V = NW.R3.View, e = V.ents.get('vis:int:' + window.__vid);
      if (e && !e.__rv) { const up = e.update; e.__rv = performance.now(); e.update = (dt, st, ctx) => up(dt, Object.assign({}, st, { reveal: Math.min(1, (performance.now() - e.__rv) / 2500) }), ctx); }
      NW.UI.open('reveal', window.__vid);
    });
    await shot('reveal', 8);
    await reset();
  }
  // ---------------------------------------------------------------- Light Hunter pressed against the window, seen from inside
  if (on('window')) {
    await p.evaluate(() => { const s = NW.G.state; s.time.min = 23 * 60; if (!s.night.active) NW.Night.begin(); s.night.vis = null; NW.G.enterArea('room_main', 200, 150, 'up'); });
    await night();
    await anchors();
    await p.evaluate(() => { const s = NW.G.state; window.__pin = () => { s.night.active = true; s.night.lh.stage = 'window'; s.night.lh.wid = 'w_front_l'; s.night.lh.t = 1; }; window.__pin(); NW.UI.open('window', 'w_front_l'); });
    await shot('lighthunter-window', 6);
    await reset();
  }
  // ---------------------------------------------------------------- Scratcher clawing at the front door (outside) + Siphon + circling Light Hunter
  if (on('scratcher')) {
    await p.evaluate(() => { const s = NW.G.state; s.time.min = 23 * 60; if (!s.night.active) NW.Night.begin(); s.night.vis = null; NW.G.enterArea('f_2_2', 240, 250, 'up'); NW.R3.Controls.yaw = 0; NW.R3.Controls.pitch = -0.15;
      window.__pin = () => { s.night.active = true; s.night.sc.stage = 'door'; s.night.sc.door = 'front'; s.night.sc.t = 1; s.player.hp = 100; s.player.x = 240; s.player.y = 250; }; window.__pin(); });
    await night({ fog: 0.05 });
    await p.evaluate(() => { window.__hooks = [(ctx) => { const c = NW.R3.camera.position; ctx.addLight({ key: 'lan', x: c.x - 0.25, y: c.y - 0.5, z: c.z - 0.4, color: [1, 0.62, 0.3], intensity: 10, range: 14, flicker: 'lantern', shadow: 2 }); }]; });
    await shot('scratcher-door', 6);
    await p.evaluate(() => { const s = NW.G.state; s.night.sc.stage = 'approach'; s.night.sc.t = 7; window.__pin = () => { s.night.active = true; s.night.sc.stage = 'approach'; s.night.sc.t = 7; s.player.x = 240; s.player.y = 250; }; });
    await shot('scratcher-approach', 4);
    await reset();
  }
  // ---------------------------------------------------------------- the Pale Stag
  if (on('stag')) {
    await p.evaluate(() => { const s = NW.G.state; s.time.min = 23 * 60; s.night.active = false; NW.G.enterArea('f_2_1', 240, 236, 'up'); NW.R3.Controls.yaw = 0; NW.R3.Controls.pitch = -0.02;
      window.__pin = () => { const sg = s.night.stag; sg.stage = window.__stagStage || 'watching'; sg.area = 'f_2_1'; sg.x = 240; sg.y = 120; sg.t2 = 0; s.player.hp = 100; }; window.__pin(); });
    await night({ fog: 0.12 });
    await p.evaluate(() => { window.__hooks = [(ctx) => { const c = NW.R3.camera.position; ctx.addLight({ key: 'lan', x: c.x - 0.25, y: c.y - 0.5, z: c.z - 0.4, color: [1, 0.62, 0.3], intensity: 8, range: 13, flicker: 'lantern', shadow: 2 }); }]; });
    await shot('stag-watching', 5);
    await p.evaluate(() => { window.__stagStage = 'hunting'; });
    await shot('stag-hunting', 5);
    await reset();
  }
  // ---------------------------------------------------------------- the Dark Dweller in an unlit room
  if (on('dweller')) {
    await p.evaluate(() => { const s = NW.G.state; s.time.min = 23 * 60; if (!s.night.active) NW.Night.begin(); s.night.vis = null; for (const k in s.lamps) s.lamps[k] = false; s.stove.fuel = 0; s.stove.setting = 'off';
      NW.G.enterArea('room_bed', 80, 100, 'down'); });
    await anchors();
    await p.evaluate(() => { const s = NW.G.state; window.__pin = () => { s.night.active = true; s.night.dd.on = true; s.night.dd.meter = 80; s.night.dd.cool = 99; s.player.hp = 100; for (const k in s.lamps) s.lamps[k] = false; };
      window.__pin(); NW.R3.Controls.pitch = -0.45; });
    await shot('dweller', 6);
    await reset();
  }
  // ---------------------------------------------------------------- Juniper at home, guests seated, Juniper in a snare
  if (on('home')) {
    await p.evaluate(() => {
      const s = NW.G.state; s.time.min = 20 * 60; s.night.active = false; s.lamps.room_main = true; s.oil = 50; s.stove.fuel = 40; s.stove.setting = 'medium';
      s.dog = { status: 'home', area: 'room_main', x: 96, y: 140, face: 1, fedDay: s.time.day };
      const v1 = NW.Night.genVisitor(3, false), v2 = NW.Night.genVisitor(3, false);
      s.guests = [{ vid: v1, satisfied: true, x: 0, y: 0 }, { vid: v2, satisfied: true, x: 0, y: 0 }];
      NW.G.enterArea('room_main', 130, 170, 'up'); NW.R3.Controls.yaw = 0.35; NW.R3.Controls.pitch = -0.3;
    });
    await shot('home', 6);
    await p.evaluate(() => { const s = NW.G.state; s.guests = []; s.dog = null; s.time.min = 12 * 60; NW.G.enterArea('f_2_1', 240, 236, 'up'); NW.R3.Controls.yaw = 0; NW.R3.Controls.pitch = -0.25;
      const R3 = NW.R3; R3.camera.updateMatrixWorld(); const cp = R3.camera.position; const d = R3.Creatures.make('dog'); d.obj.position.set(cp.x, R3.groundAt(cp.x, cp.z - 2.2, 'f_2_1'), cp.z - 2.2); d.obj.rotation.y = Math.PI / 2; R3.scene.add(d.obj); d.st = { pose: 'trapped' };
      window.__lu = [d]; window.__hooks = [(ctx) => d.update(ctx.dt, d.st, ctx)]; });
    await shot('dog-trapped', 5);
    await reset();
  }
  // ---------------------------------------------------------------- viewmodel outdoors at night (lantern + rifle), and a shot
  if (on('viewmodel')) {
    await p.evaluate(() => { const s = NW.G.state; s.time.min = 23 * 60; s.night.active = false; NW.G.enterArea('f_2_1', 240, 236, 'up'); NW.R3.Controls.yaw = 0.4; NW.R3.Controls.pitch = -0.05; });
    await night({ fog: 0.08 });
    await shot('viewmodel-night', 5);
    const vis = await p.evaluate(() => { const vm = NW.R3.camera.getObjectByName('viewmodel'); return vm ? [vm.visible, vm.children.map((c) => c.visible)] : null; });
    ok(vis && vis[0] && vis[1][0] && vis[1][1], 'viewmodel shows lantern and rifle outdoors at night ' + JSON.stringify(vis));
    await p.evaluate(() => { NW.G.shootCd = 0; NW.G.shoot(NW.G.state.player.x, NW.G.state.player.y - 100); });
    await shot('viewmodel-shot', 1);
    await p.evaluate(() => { NW.G.enterArea('room_main', 200, 150, 'up'); });
    await frames(2);
    const inRoom = await p.evaluate(() => { const vm = NW.R3.camera.getObjectByName('viewmodel'); return [vm.visible && vm.children[0].visible, vm.visible && vm.children[1].visible]; });
    ok(!inRoom[0] && !inRoom[1], 'no lantern/rifle inside the cabin ' + JSON.stringify(inRoom));
  }
  ok(!errs.length, 'no console errors' + (errs.length ? ' (' + errs.slice(0, 6).join(' | ') + ')' : ''));
  await b.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
