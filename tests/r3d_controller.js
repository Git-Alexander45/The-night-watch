// 3D view: first-person controller, collision, interaction, shooting, saves (incl. a 2D-made save), quality and resize.
const { chromium } = require('playwright');
const SHOTS = process.env.SHOTS || '/tmp/shots';
let fails = 0; const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await b.newPage({ viewport: { width: 960, height: 540 } }); page.setDefaultTimeout(180000);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));   // offline sandbox: web fonts would stall load / screenshots
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => page.evaluate(f, a);
  // ---- a run started in the classic 2D view
  await page.goto('http://localhost:8123/index.html?view=2d'); await ev(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(500);
  check(await ev(() => !NW.R3.active), '?view=2d keeps the classic renderer');
  await ev(() => { NW.G.newGame({ mode: 'standard', seed: 777, intro: false, guided: false }); NW.G.enterArea('f_2_1', 200, 136, 'up'); NW.G.state.inv[0] = { id: 'wood', n: 5 }; NW.G.state.time.min = 10 * 60 + 17; NW.G.save('manual'); });
  const save2d = await ev(() => JSON.stringify({ area: NW.G.state.player.area, x: NW.G.state.player.x, y: NW.G.state.player.y, min: Math.floor(NW.G.state.time.min), inv: NW.G.state.inv[0] }));
  // ---- load it in 3D
  await page.goto('http://localhost:8123/index.html'); await page.waitForFunction(() => window.NW && NW.R3 && NW.R3.ready && !NW.R3.preparing && NW.R3.prepareMs, null, { timeout: 300000 }); await page.waitForTimeout(500);
  check(await ev(() => NW.R3.active), '3D view is the default');
  await page.click('#b-continue'); await page.waitForTimeout(800);
  const loaded = await ev(() => JSON.stringify({ area: NW.G.state.player.area, x: NW.G.state.player.x, y: NW.G.state.player.y, min: Math.floor(NW.G.state.time.min), inv: NW.G.state.inv[0] }));
  const a0 = JSON.parse(save2d), a1 = JSON.parse(loaded);
  check(a0.area === a1.area && Math.abs(a0.x - a1.x) < 1 && Math.abs(a0.y - a1.y) < 1 && a1.min >= a0.min && a1.min <= a0.min + 6 && JSON.stringify(a0.inv) === JSON.stringify(a1.inv), 'a save made in 2D resumes in 3D (' + loaded + ')');
  check(await ev(() => Math.abs(NW.R3.Controls.yaw) < 0.01), 'camera faces the way the ranger faced (north)');
  // ---- deterministic movement: hold keys for a fixed number of simulation steps
  const walk = (key, yaw, steps) => ev(([key, yaw, steps]) => {
    const G = NW.G, p = G.state.player; NW.R3.Controls.yaw = yaw; NW.R3.Controls.pitch = 0;
    const x0 = p.x, y0 = p.y; G.keys = {}; G.keys[key] = true;
    for (let i = 0; i < steps; i++) G.update(1 / 60);
    G.keys = {}; G.update(1 / 60);
    return { dx: p.x - x0, dy: p.y - y0, area: G.area.id };
  }, [key, yaw, steps]);
  await ev(() => { NW.G.enterArea('f_2_1', 240, 140, 'up'); });
  // find an open spot: try a few positions until 30 px around is free
  await ev(() => { const a = NW.G.area; for (let x = 120; x < 380; x += 8) for (let y = 70; y < 200; y += 8) { let ok = true; for (let d = -36; d <= 36 && ok; d += 4) ok = !NW.World.blocked(a, x + d - 5, y - 4, 10, 5) && !NW.World.blocked(a, x - 5, y + d - 4, 10, 5); if (ok) { NW.G.state.player.x = x; NW.G.state.player.y = y; return; } } });
  let r = await walk('KeyW', 0, 30);
  check(r.dy < -20 && Math.abs(r.dx) < 1, 'W with yaw 0 walks north (' + r.dx.toFixed(1) + ',' + r.dy.toFixed(1) + ')');
  r = await walk('KeyW', Math.PI / 2, 30);
  check(r.dx > 20 && Math.abs(r.dy) < 1, 'W with yaw 90° walks east (' + r.dx.toFixed(1) + ',' + r.dy.toFixed(1) + ')');
  r = await walk('KeyD', 0, 30);
  check(r.dx > 20 && Math.abs(r.dy) < 1, 'D strafes right of the view (east when facing north)');
  r = await walk('KeyS', Math.PI, 30);
  check(r.dy < -20, 'S with yaw 180° backs north');
  await ev(() => { const a = NW.G.area; for (let x = 120; x < 380; x += 8) for (let y = 70; y < 200; y += 8) { let ok = true; for (let d = -40; d <= 40 && ok; d += 4) ok = !NW.World.blocked(a, x + d - 5, y - d - 4, 10, 5); if (ok) { NW.G.state.player.x = x; NW.G.state.player.y = y; return; } } });
  r = await walk('KeyW', Math.PI / 4, 30);
  check(r.dx > 12 && r.dy < -12 && Math.abs(Math.abs(r.dx) - Math.abs(r.dy)) < 2, 'diagonal look walks diagonally (' + r.dx.toFixed(1) + ',' + r.dy.toFixed(1) + ')');
  check(await ev(() => NW.G.state.player.dir === 'up' || NW.G.state.player.dir === 'right'), 'facing direction follows the view');
  // collision: walk into the nearest tree and stop at its collider
  const col = await ev(() => {
    const G = NW.G, a = G.area, p = G.state.player;
    const t = a.objs.filter((o) => o.type === 'tree').map((o) => ({ o, c: NW.World.collider(o) })).sort((u, v) => Math.hypot(u.o.x - p.x, u.o.y - p.y) - Math.hypot(v.o.x - p.x, v.o.y - p.y))[0];
    // stand just south of it, look north, walk
    let sy = t.c.y + t.c.h + 14; p.x = t.c.x + t.c.w / 2; p.y = sy;
    if (NW.World.blocked(a, p.x - 5, p.y - 4, 10, 5)) return { skip: true };
    NW.R3.Controls.yaw = 0; G.keys = { KeyW: true }; for (let i = 0; i < 90; i++) G.update(1 / 60); G.keys = {};
    return { py: p.y, top: t.c.y + t.c.h, blocked: NW.World.blocked(a, p.x - 5, p.y - 4, 10, 5) };
  });
  check(col.skip || (col.py >= col.top && col.py < col.top + 6 && !col.blocked), 'a tree trunk stops the ranger at its collider (' + JSON.stringify(col) + ')');
  // doorway between rooms, sprinting
  await ev(() => { NW.G.enterArea('room_main', 40, 116, 'left'); });
  r = await ev(() => { const G = NW.G; NW.R3.Controls.yaw = -Math.PI / 2; G.keys = { KeyW: true, ShiftLeft: true }; for (let i = 0; i < 90 && G.area.id === 'room_main'; i++) G.update(1 / 60); G.keys = {}; return G.area.id; });
  check(r === 'room_bed', 'sprinting west through the doorway enters the bedroom (' + r + ')');
  // interaction: the stove is what you look at
  const foc = await ev(() => { const G = NW.G; G.enterArea('room_main', 64, 92, 'up'); NW.R3.Controls.yaw = 0; G.update(1 / 60); const a = G.focus && G.focus.name; NW.R3.Controls.yaw = Math.PI; G.update(1 / 60); const b2 = G.focus && G.focus.name; return [a, b2]; });
  check(/stove/i.test(foc[0] || '') && !/stove/i.test(foc[1] || ''), 'looking at the stove focuses it; looking away does not (' + foc.join(' / ') + ')');
  // shooting follows the view
  const shot = await ev(() => { const G = NW.G; G.enterArea('f_2_1', 240, 140, 'up'); NW.R3.Controls.yaw = Math.PI / 2; G.update(1 / 60); G.shootCd = 0; const m = G.mouseWorld(); G.shoot(m.x, m.y); const tr = G.fx.find((f) => f.type === 'tracer'); return tr ? { dx: tr.x2 - tr.x1, dy: tr.y2 - tr.y1 } : null; });
  check(shot && shot.dx > 0 && Math.abs(shot.dy) < Math.abs(shot.dx) * 0.2, 'the rifle fires where the camera looks (' + JSON.stringify(shot) + ')');
  // a few frames of real rendering
  await page.waitForTimeout(1500);
  const info = await ev(() => ({ calls: NW.R3.renderer.info.render.calls, tris: NW.R3.renderer.info.render.triangles }));
  check(info.calls > 0, 'frames render (' + JSON.stringify(info) + ')');
  // quality switching and resizing
  for (const q of ['low', 'high', 'medium']) { await ev((q) => { NW.settings.quality = q; NW.R3.applyQuality(); }, q); await page.waitForTimeout(700); }
  // software GL: the browser stops scheduling frames for a while after a real viewport change, so the resize event
  // may arrive late; fire it ourselves once the viewport has changed (the handler reads window.innerWidth/Height)
  await page.setViewportSize({ width: 700, height: 500 }); await ev(() => window.dispatchEvent(new Event('resize')));
  check(await ev(() => NW.R3.renderSize.css[0] === 700 && NW.R3.renderSize.css[1] === 500), 'canvas follows a smaller window (700x500)');
  await page.setViewportSize({ width: 960, height: 540 }); await ev(() => window.dispatchEvent(new Event('resize')));
  check(await ev(() => NW.R3.renderSize.css[0] === 960 && NW.R3.renderSize.css[1] === 540), 'canvas follows the window size back to 960x540');
  check(await ev(() => NW.settings.quality === 'medium'), 'quality setting is kept');
  // switch to 2D and back mid-run
  await ev(() => NW.R3.setView('2d')); await page.waitForTimeout(400);
  check(await ev(() => !NW.R3.active && getComputedStyle(document.getElementById('game')).visibility === 'visible'), 'switching to the classic view mid-run works');
  await ev(() => NW.R3.setView('3d')); await page.waitForTimeout(600);
  check(await ev(() => NW.R3.active), 'and back to 3D');
  // save & quit, resume in 3D
  await ev(() => { NW.G.state.player.x = 222; NW.G.state.player.y = 150; NW.G.save('manual'); });
  await page.reload(); await page.waitForFunction(() => window.NW && NW.R3 && NW.R3.ready && !NW.R3.preparing && NW.R3.prepareMs, null, { timeout: 300000 }); await page.waitForTimeout(500); await page.click('#b-continue'); await page.waitForTimeout(800);
  check(await ev(() => NW.G.area.id === 'f_2_1' && Math.abs(NW.G.state.player.x - 222) < 1), 'save & resume in 3D');
  require('fs').mkdirSync(SHOTS, { recursive: true }); require('fs').writeFileSync(SHOTS + '/r3d-controller.jpg', Buffer.from((await ev(() => NW.R3.shot())).split(',')[1], 'base64'));   // canvas grab: a compositor screenshot stalls under software GL
  console.log('errors:', errs.slice(0, 5));
  check(errs.length === 0, 'no page errors');
  console.log(fails ? fails + ' FAILURES' : 'ALL PASSED');
  await b.close(); process.exit(fails ? 1 : 0);
})();
