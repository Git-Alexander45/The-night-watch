// 3D cabin: interior rooms (day / night, stove low/high, lamps), window/door/stove state, window & peephole
// views, the exterior cabin from all sides (glowing windows, chimney), draw calls and console errors.
// Software WebGL (SwiftShader) is slow and compiles shaders lazily, so the scene is pre-compiled and frames
// are grabbed straight from the canvas after a render.
const { chromium } = require('playwright');
const fs = require('fs');
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/d607ac6a-93f8-5870-a0ad-942bb41b98fa/scratchpad/s3';
const ONLY = process.env.ONLY || ''; // e.g. ONLY=int,ext,views,state
let fails = 0; const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL ') + m); if (!c) fails++; };
fs.mkdirSync(SHOTS, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => page.evaluate(f, a);
  await page.goto('http://localhost:8123/index.html'); await page.waitForFunction(() => window.NW && NW.R3 && NW.R3.ready && !NW.R3.preparing && NW.R3.prepareMs, null, { timeout: 300000 }); await page.waitForTimeout(500);
  await ev(() => {
    const r0 = NW.R3.render;
    NW.R3.render = function () { const out = r0.apply(this, arguments); if (window.__cap) { window.__img = NW.R3.canvas.toDataURL('image/jpeg', 0.9); window.__info = { c: NW.R3.renderer.info.render.calls, t: NW.R3.renderer.info.render.triangles }; window.__cap = false; } return out; };
    window.__fr = 0; NW.Hooks.on('r3Frame', () => { window.__fr++; });
  });
  const frames = async (n) => { const f0 = await ev(() => window.__fr); await page.waitForFunction((x) => window.__fr >= x, f0 + n, { timeout: 400000, polling: 250 }); };
  const warm = () => ev(() => { const hid = []; NW.R3.scene.traverse((o) => { if (o.isMesh && !o.visible) { hid.push(o); o.visible = true; } }); NW.R3.renderer.compile(NW.R3.scene, NW.R3.camera); hid.forEach((o) => { o.visible = false; }); });
  const stats = [];
  const shot = async (name, f, arg) => {
    if (f) await ev(f, arg);
    await frames(3);
    await ev(() => { window.__img = null; window.__cap = true; });
    await page.waitForFunction(() => !!window.__img, null, { timeout: 400000, polling: 250 });
    const r = await ev(() => ({ img: window.__img, info: window.__info, err: NW.lastError || null }));
    fs.writeFileSync(SHOTS + '/cabin-' + name + '.jpg', Buffer.from(r.img.split(',')[1], 'base64'));
    stats.push([name, r.info.c, Math.round(r.info.t / 1000)]);
    console.log('  shot cabin-' + name + '  draws ' + r.info.c + '  tris ' + Math.round(r.info.t / 1000) + 'k' + (r.err ? '  ERR ' + r.err : ''));
    return r.info;
  };
  const want = (k) => !ONLY || ONLY.split(',').includes(k);
  const S = (fn) => fn; // readability
  try {
    await ev(() => { NW.G.newGame({ mode: 'standard', seed: 1234, intro: false, guided: false }); NW.G.enterArea('room_main', 176, 150, 'up'); NW.G.state.time.min = 12 * 60; NW.G.state.woodbox = 9; });
    await frames(2); await warm();
    // ---------------------------------------------------------------- builder contract
    const c = await ev(() => {
      const g = NW.R3.View.groups.__cabin, a = g && g.anchors;
      const v3 = (p) => p && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.z === 'number';
      return {
        built: !!(g && g.group && g.update && NW.R3.Cabin), wins: a ? Object.keys(a.windows).sort().join(',') : '',
        views: a ? Object.values(a.windows).every((w) => v3(w.outside) && typeof w.yaw === 'number' && w.view && v3(w.view.pos)) : false,
        rest: a ? !!(v3(a.porchVisitor.pos) && v3(a.peephole.pos) && v3(a.frontDoorOutside.pos) && v3(a.frontDoorOutside.approach) && v3(a.backDoorOutside.pos) && v3(a.roof.pos) && a.ring.r > 10) : false,
        rooms: a ? Object.keys(a.rooms).length : 0,
        peepToVis: a ? a.peephole.pos.distanceTo(a.porchVisitor.pos.clone().setY(a.peephole.pos.y)) : 0,
      };
    });
    check(c.built, 'R3.Cabin.buildInterior is used (no fallback)');
    check(c.wins === 'w_bed,w_front_l,w_front_r,w_office,w_storage', 'interior window anchors for all five windows (' + c.wins + ')');
    check(c.views, 'every interior window has outside/yaw/view');
    check(c.rest && c.rooms === 4, 'porch, peephole, door, roof, ring and room anchors');
    check(c.peepToVis > 0.45 && c.peepToVis < 0.8, 'visitor stands ~0.6 m from the peephole (' + c.peepToVis.toFixed(2) + ')');

    if (want('int')) {
      console.log('-- interior');
      const main = [['n', 0], ['nw', -0.85], ['w', -1.75], ['s', Math.PI], ['e', 1.6]];
      for (const [n, y] of main) await shot('main-day-' + n, (y) => { NW.G.enterArea('room_main', 176, 150, 'up'); NW.G.state.time.min = 12 * 60; NW.G.state.stove.setting = 'medium'; NW.G.state.stove.fuel = 30; NW.R3.Controls.yaw = y; NW.R3.Controls.pitch = -0.08; }, y);
      await shot('main-night-high', () => { NW.G.state.time.min = 23 * 60; NW.G.state.stove.setting = 'high'; NW.G.state.stove.fuel = 45; NW.G.state.lamps.room_main = false; NW.R3.Controls.yaw = -0.85; });
      await shot('main-night-high-e', () => { NW.R3.Controls.yaw = 1.2; });
      await shot('main-night-low', () => { NW.G.state.stove.setting = 'low'; NW.R3.Controls.yaw = -0.85; });
      await shot('main-night-lamp', () => { NW.G.state.lamps.room_main = true; NW.G.state.oil = 60; NW.R3.Controls.yaw = 0.25; });
      await shot('main-night-dark', () => { NW.G.state.lamps.room_main = false; NW.G.state.stove.setting = 'off'; NW.R3.Controls.yaw = -0.85; });
      await shot('stove-close', () => { NW.G.state.stove.setting = 'high'; NW.G.enterArea('room_main', 70, 96, 'up'); NW.R3.Controls.yaw = 0; NW.R3.Controls.pitch = -0.35; });
      const rooms = [['bed', 'room_bed', 150, 140, [-0.6, 0.9, 3.4]], ['office', 'room_office', 140, 140, [-0.5, 0.7, 3.6]], ['storage', 'room_storage', 150, 120, [-0.4, 0.9, 2.2]]];
      for (const [n, id, x, y, yaws] of rooms) {
        for (let i = 0; i < yaws.length; i++) await shot(n + '-day-' + i, ([id, x, y, yw]) => { NW.G.enterArea(id, x, y, 'up'); NW.G.state.time.min = 12 * 60; NW.G.state.lamps[id] = false; NW.R3.Controls.yaw = yw; NW.R3.Controls.pitch = -0.1; }, [id, x, y, yaws[i]]);
        await shot(n + '-night-lamp', ([id, yw]) => { NW.G.state.time.min = 23 * 60; NW.G.state.lamps[id] = true; NW.G.state.oil = 60; NW.R3.Controls.yaw = yw; }, [id, yaws[0]]);
        await shot(n + '-night-dark', ([id]) => { NW.G.state.lamps[id] = false; }, [id]);
      }
    }
    if (want('state')) {
      console.log('-- damage & state');
      await shot('front-damaged', () => {
        const s = NW.G.state; s.time.min = 22 * 60; s.stove.setting = 'medium'; s.stove.fuel = 30; s.lamps.room_main = true; s.oil = 60;
        Object.assign(s.cabin.windows.w_front_l, { glass: 30, curtClosed: false, shutClosed: false, shutter: 0, boarded: 0 });
        Object.assign(s.cabin.windows.w_front_r, { glass: 100, curtClosed: false, boarded: 100 });
        Object.assign(s.cabin.doors.front, { hp: 30, max: 160, reinforced: true, locked: true, open: false });
        NW.G.enterArea('room_main', 176, 150, 'up'); NW.R3.Controls.yaw = Math.PI; NW.R3.Controls.pitch = -0.05;
      });
      await shot('front-open', () => { const s = NW.G.state; Object.assign(s.cabin.doors.front, { hp: 100, max: 100, reinforced: false, locked: false, open: true }); Object.assign(s.cabin.windows.w_front_l, { glass: 0, shutter: 100 }); Object.assign(s.cabin.windows.w_front_r, { boarded: 0, curtClosed: true }); s.time.min = 12 * 60; });
      await shot('front-smashed', () => { const s = NW.G.state; Object.assign(s.cabin.doors.front, { hp: 0, open: false }); s.time.min = 23 * 60; });
      await shot('backdoor', () => { const s = NW.G.state; Object.assign(s.cabin.doors.back, { open: false, hp: 60, max: 100, locked: true, lockBroken: false, reinforced: true }); Object.assign(s.cabin.windows.w_storage, { shutClosed: true, curtClosed: false, glass: 60 }); s.lamps.room_storage = true; NW.G.enterArea('room_storage', 150, 110, 'right'); NW.R3.Controls.yaw = 1.2; });
      await ev(() => { const s = NW.G.state; Object.assign(s.cabin.doors.front, { hp: 100, max: 100, open: false, reinforced: false }); for (const w of Object.values(s.cabin.windows)) Object.assign(w, { glass: 100, shutter: 100, shutClosed: false, curtClosed: false, boarded: 0 }); Object.assign(s.cabin.doors.back, { hp: 100, open: false, reinforced: false }); });
      const wb = await ev(() => { const g = NW.R3.View.groups.__cabin; NW.G.state.woodbox = 7; g.update(0.016, NW.R3.View.ctx); let n = -1; g.group.traverse((o) => { if (o.isInstancedMesh && o.count <= 15 && o.instanceMatrix.count === 15) n = o.count; }); return n; });
      check(wb === 7, 'woodbox shows state.woodbox logs (' + wb + ')');
      const lights = await ev(() => {
        const s = NW.G.state, g = NW.R3.View.groups.__cabin, keys = () => { const L = []; g.update(0.016, Object.assign({}, NW.R3.View.ctx, { addLight: (l) => L.push(l) })); return L; };
        s.time.min = 23 * 60; s.stove.setting = 'high'; s.stove.fuel = 30; s.lamps = { room_main: true, room_bed: false, room_office: true, room_storage: false }; s.oil = 10;
        const a = keys().map((l) => l.key);
        s.oil = 0; const b = keys().map((l) => l.key);
        s.stove.setting = 'off'; const c = keys().map((l) => l.key);
        s.time.min = 12 * 60; const d = keys().filter((l) => /^day:/.test(l.key)).length;
        return { a, b, c, d };
      });
      check(lights.a.includes('stove') && lights.a.includes('lamp:room_main') && lights.a.includes('lamp:room_office') && !lights.a.includes('lamp:room_bed'), 'stove and lit lamps add lights (' + lights.a.join(',') + ')');
      check(!lights.b.some((k) => /^lamp:/.test(k)), 'lamps go out without oil');
      check(!lights.c.includes('stove'), 'no stove light when the stove is out');
      check(lights.d === 5, 'daylight enters through all five windows by day');
    }
    if (want('views')) {
      console.log('-- window & peephole views');
      await ev(() => { const s = NW.G.state; s.stove.setting = 'medium'; s.stove.fuel = 30; NW.G.enterArea('room_main', 176, 150, 'up'); });
      for (const wid of ['w_front_l', 'w_front_r', 'w_bed', 'w_office', 'w_storage']) await shot('view-' + wid + '-day', (wid) => { NW.G.state.time.min = 13 * 60; NW.UI.open('window', wid); }, wid);
      await ev(() => NW.UI.close && NW.UI.close('window'));
      await ev(() => { NW.G.state.time.min = 21 * 60; NW.Night.begin(); NW.Night.arrive(NW.Night.genVisitor(3, false)); });
      await shot('view-w_front_l-night-visitor', () => { NW.UI.open('window', 'w_front_l'); });
      await shot('view-w_front_r-night-visitor', () => { NW.UI.open('window', 'w_front_r'); });
      await ev(() => NW.UI.close && NW.UI.close('window'));
      await shot('peephole-visitor', () => { NW.UI.open('peephole'); });
      const ov = await ev(() => NW.R3.View.override && NW.R3.View.override.type);
      check(ov === 'peephole', 'peephole panel switches to the door camera');
      await ev(() => NW.UI.close && NW.UI.close('peephole'));
    }
    if (want('ext')) {
      console.log('-- exterior');
      await ev(() => { const s = NW.G.state; s.night.vis = null; s.time.min = 12 * 60; s.stove.setting = 'medium'; s.stove.fuel = 30; s.woodpile = 25; NW.G.enterArea('f_2_2', 240, 250, 'up'); });
      await frames(2); await warm();
      const ext = await ev(() => { const g = NW.R3.View.groups.f_2_2; const a = g && g.ext && g.ext.anchors; return { ok: !!(a && a.windows && Object.keys(a.windows).length === 5 && a.porchVisitor && a.roof), }; });
      check(ext.ok, 'exterior anchors (windows, porch, roof)');
      const views = [['front', 240, 262, 0], ['sw', 70, 240, 0.75], ['west', 40, 110, Math.PI / 2], ['north', 240, 18, Math.PI], ['east', 440, 120, -Math.PI / 2], ['se', 430, 240, -0.7]];
      for (const [n, x, y, yw] of views) await shot('ext-day-' + n, ([x, y, yw]) => { NW.G.state.time.min = 12 * 60; NW.G.state.player.x = x; NW.G.state.player.y = y; NW.R3.Controls.yaw = yw; NW.R3.Controls.pitch = 0.05; }, [x, y, yw]);
      await ev(() => { const s = NW.G.state; s.time.min = 23 * 60; s.stove.setting = 'high'; s.lamps.room_main = true; s.lamps.room_bed = true; s.oil = 60; Object.assign(s.cabin.windows.w_front_r, { curtClosed: true }); Object.assign(s.cabin.windows.w_office, { shutClosed: true }); });
      for (const [n, x, y, yw] of views) await shot('ext-night-' + n, ([x, y, yw]) => { NW.G.state.player.x = x; NW.G.state.player.y = y; NW.R3.Controls.yaw = yw; NW.R3.Controls.pitch = 0.08; }, [x, y, yw]);
      await shot('ext-night-damaged', () => { const s = NW.G.state; s.stove.setting = 'low'; Object.assign(s.cabin.windows.w_front_l, { glass: 0, shutter: 0 }); Object.assign(s.cabin.windows.w_front_r, { boarded: 100, curtClosed: false }); Object.assign(s.cabin.doors.front, { open: true }); s.player.x = 240; s.player.y = 262; NW.R3.Controls.yaw = 0; });
      const wl = await ev(() => { const L = []; const g = NW.R3.View.groups.f_2_2; g.update(0.016, Object.assign({}, NW.R3.View.ctx, { addLight: (l) => L.push(l) })); return L.map((l) => l.key); });
      check(wl.some((k) => /^winglow:/.test(k)) && wl.includes('doorglow'), 'window glow and open-door light outside (' + wl.join(',') + ')');
    }
  } catch (e) { console.log('  FAIL exception ' + e.message); fails++; }
  const maxInt = Math.max(0, ...stats.filter((s) => !/^ext|^view|^peep/.test(s[0])).map((s) => s[1]));
  const maxExt = Math.max(0, ...stats.filter((s) => /^ext/.test(s[0])).map((s) => s[1]));
  console.log('max draw calls: interior ' + maxInt + ', exterior views ' + maxExt + ' (whole frame incl. shadow passes and the forest)');
  check(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
