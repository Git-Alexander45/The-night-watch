// 3D forest builder test: screenshots of many viewpoints (areas, times of day, snow, rain, bridge out),
// draw calls / triangles, area build times, resource state -> 3D updates, and console errors.
// Usage: NODE_PATH=/opt/node22/lib/node_modules node tests/r3d_forest.js [only-names,comma,separated]
//   OUT=dir for screenshots (default: scratchpad s3).  FIXCORE=1 serves js/r3d/mat.js with the two R3.std fixes
//   from the forest builder's report applied (assign vs/fs back to the shader; no duplicate NOISE with fog).
const { chromium } = require('playwright');
const OUT = process.env.OUT || '/tmp/claude-0/-home-user/d607ac6a-93f8-5870-a0ad-942bb41b98fa/scratchpad/s3';
const ONLY = process.argv[2] ? process.argv[2].split(',') : null;
let fails = 0;
function check(cond, msg) { if (cond) console.log('  ok  ' + msg); else { fails++; console.log('  FAIL ' + msg); } }
const DAY = 12 * 60, DUSK = 18 * 60 + 25, NIGHT = 23 * 60;
// name, area, x, y, yaw, pitch, time, weather, extra
const VIEWS = [
  ['north-day', 'f_2_1', 240, 150, 0, -0.04, DAY, { snow: 0.55 }],
  ['north-lowsnow', 'f_2_1', 150, 140, 1.4, -0.06, DAY, { snow: 0.12 }],
  ['north-dusk', 'f_2_1', 240, 150, 0.6, -0.02, DUSK, { snow: 0.6 }],
  ['north-night', 'f_2_1', 240, 150, 0, -0.06, NIGHT, { snow: 0.6 }],
  ['lake-day', 'f_2_0', 240, 190, 0, -0.12, DAY, { snow: 0.5 }],
  ['lake-dock', 'f_2_0', 300, 175, -0.7, -0.15, DAY + 120, { snow: 0.3 }],
  ['lake-night', 'f_2_0', 240, 190, 0.2, -0.12, NIGHT, { snow: 0.5 }],
  ['bridge', 'f_3_2', 200, 165, 0.75, -0.12, DAY, { snow: 0.5 }, { bridgeOut: false }],
  ['bridge-out', 'f_3_2', 200, 165, 0.75, -0.12, DAY, { snow: 0.5 }, { bridgeOut: true }],
  ['mine', 'f_3_1', 140, 160, -0.4, -0.06, DAY, { snow: 0.4 }],
  ['burned', 'f_0_3', 240, 200, 0, -0.08, DAY, { snow: 0.3 }],
  ['bog-rain', 'f_4_4', 240, 140, 0.3, -0.12, DAY, { snow: 0.05, type: 'rain', precip: 0.8 }, { wet: 1 }],
  ['birches', 'f_1_0', 240, 140, 0.4, 0.02, DAY, { snow: 0.35 }],
  ['cabin', 'f_2_2', 240, 240, 0, -0.05, DUSK, { snow: 0.7 }],
  ['border', 'f_2_1', 470, 140, Math.PI / 2, -0.04, DAY, { snow: 0.5 }],
  ['ford', 'f_3_4', 240, 140, 1.2, -0.2, DAY, { snow: 0.3 }],
  ['stones', 'f_3_0', 220, 140, 1.4, -0.15, DAY, { snow: 0.4 }],
  ['fern-gully', 'f_1_3', 240, 140, 2.2, -0.06, DAY, { snow: 0.15 }],
];
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: +(process.env.W || 960), height: +(process.env.H || 540) } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  if (process.env.FIXCORE) await page.route('**/js/r3d/mat.js', async (r) => {
    const res = await r.fetch(); let t = await res.text();
    t = t.replace('if (opts.patch) opts.patch(sh);', 'sh.vertexShader = vs; sh.fragmentShader = fs; if (opts.patch) opts.patch(sh);');
    t = t.replace('varying vec3 vR3World; varying vec3 vR3Normal;\n    ${NOISE}`;', 'varying vec3 vR3World; varying vec3 vR3Normal;\n#ifndef USE_FOG\n    ${NOISE}\n#endif\n`;');
    r.fulfill({ response: res, body: t });
  });
  page.setDefaultTimeout(900000);
  await page.goto('http://localhost:8123/index.html');
  await page.waitForFunction(() => window.NW && NW.R3 && NW.R3.ready && !NW.R3.preparing && NW.R3.prepareMs);
  if (process.env.Q) await page.evaluate((q) => { NW.settings.quality = q; NW.R3.applyQuality(); }, process.env.Q);
  await page.addStyleTag({ content: 'body > *:not(#view3d){visibility:hidden !important}' });
  await page.evaluate(() => { window.__fr = 0; const f = NW.R3.frame; NW.R3.frame = function (t, dt) { f.call(this, t, dt); window.__fr++; }; });
  const frames = async (n) => { const f0 = await page.evaluate(() => __fr); await page.waitForFunction((f) => __fr >= f, f0 + n, { polling: 500, timeout: 900000 }); };
  await page.evaluate(() => NW.G.newGame({ mode: 'standard', seed: 1234, intro: false, guided: false }));
  const setView = (v) => page.evaluate((v) => {
    const [name, area, x, y, yaw, pitch, min, w, ex] = v; void name; const G = NW.G, s = G.state;
    G.enterArea(area, x, y, 'up'); s.player.x = x; s.player.y = y;
    s.time.min = min; Object.assign(s.weather, { type: 'clear', precip: 0, fog: 0, wind: 0.2 }, w); s.weather.tgt = Object.assign({}, s.weather);
    s.world.bridgeOut = !!(ex && ex.bridgeOut);
    NW.R3.U.uWet.value = ex && ex.wet != null ? ex.wet : 0;
    NW.R3.Controls.yaw = yaw; NW.R3.Controls.pitch = pitch;
  }, v);

  console.log('# warm-up (shader compilation is slow in SwiftShader)');
  await setView(VIEWS[0]); await frames(4);
  const st = await page.evaluate(() => NW.R3.Forest.stats);
  const areaMs = Object.entries(st).filter(([k]) => k.startsWith('f_')).map(([k, v]) => [k, v.ms]);
  console.log('  build ms: ' + areaMs.map((a) => a.join('=')).join(' ') + ' | outer ' + (st.outer && st.outer.ms) + ' | fields ' + st.fieldMs);
  const later = areaMs.slice(1).map((a) => a[1]).sort((a, b) => a - b);
  check(later.length && later[Math.floor(later.length / 2)] < 60, 'median area build time ' + later[Math.floor(later.length / 2)] + ' ms (first area also pays texture generation)');

  console.log('# viewpoints');
  for (const v of VIEWS) {
    if (ONLY && !ONLY.includes(v[0])) continue;
    const tv = Date.now(); await setView(v); await frames(4);
    await page.screenshot({ path: OUT + '/forest-' + v[0] + '.png' });
    const info = await page.evaluate(() => ({ calls: NW.R3.renderer.info.render.calls, tris: NW.R3.renderer.info.render.triangles }));
    check(info.calls < 320, v[0] + ': ' + info.calls + ' draw calls, ' + Math.round(info.tris / 1000) + 'k triangles (' + Math.round((Date.now() - tv) / 1000) + ' s)');
  }

  console.log('# resources update the 3D view');
  const res = await page.evaluate(async () => {
    const G = NW.G, s = G.state, a = NW.World.get('f_2_1');
    G.enterArea('f_2_1', 240, 150, 'up');
    const grp = NW.R3.View.groups.f_2_1.group;
    const cnt = (k) => { const m = grp.children.find((c) => c.name === 'fo:' + k); return m ? (m.visible ? m.count : 0) : -1; };
    const before = { br: cnt('br'), berry: cnt('berry'), d: cnt('d0') + cnt('d1'), st: cnt('stS') };
    a.objs.filter((o) => o.type === 'branches').slice(0, 1).forEach((o) => { s.world.taken[o.key] = s.time.day; });
    a.objs.filter((o) => o.type === 'bush').forEach((o) => { s.world.taken[o.key] = s.time.day; });
    a.objs.filter((o) => o.type === 'deadtree').slice(0, 1).forEach((o) => { s.world.taken[o.key] = s.time.day; });
    // software GL renders in irregular bursts: wait for a handful of real frames, not for wall time
    const f0 = NW.R3.renderer.info.render.frame;
    for (let i = 0; i < 600 && NW.R3.renderer.info.render.frame < f0 + 8; i++) await new Promise((r) => setTimeout(r, 500));
    const after = { br: cnt('br'), berry: cnt('berry'), d: cnt('d0') + cnt('d1'), st: cnt('stS') };
    return { before, after, bushes: a.objs.filter((o) => o.type === 'bush').length };
  });
  console.log('  ' + JSON.stringify(res));
  check(res.after.br === res.before.br - 1, 'gathered branches disappear');
  check(!res.bushes || res.after.berry === 0, 'picked bushes lose their berries');
  check(res.after.d === res.before.d - 1 && res.after.st === res.before.st + 1, 'chopped dead tree becomes a stump');
  check(await page.evaluate(() => Math.abs(NW.R3.Terrain.height(23.99, 20) - NW.R3.Terrain.height(24.01, 20)) < 0.02), 'terrain continuous across area borders');

  const errs = errors.filter((e) => !/favicon/.test(e));
  check(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 5).join(' || ') : ''));
  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'all ok');
  process.exit(fails ? 1 : 0);
})();
