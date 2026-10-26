// 3D flora + wildlife checks: every game tree has a 3D tree at its collider, trees next to trails keep their
// crowns above eye height, culling/LOD keeps the triangle budget per quality, quadruped rigs are finite (their
// heads used to collapse), no page errors. Screenshots: $SHOTS/flora-*.jpg (via NW.R3.shot()).
// Run: NODE_PATH=$(npm root -g) node tests/r3d_flora.js   (server on :8123; software WebGL is slow)
const { chromium } = require('playwright');
const fs = require('fs');
const SH = (process.env.SHOTS || '/tmp/shots') + '/';
fs.mkdirSync(SH, { recursive: true });
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL ' + m); } else console.log('ok   ' + m); };

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 450 } });
  p.setDefaultTimeout(1800000);
  // the container has no route to Google Fonts; answer instead of hanging
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const errs = [];
  p.on('pageerror', (e) => errs.push('PE ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('E ' + m.text().slice(0, 300)); });
  await p.goto('http://localhost:8123/index.html');
  await p.waitForFunction(() => window.NW && NW.R3 && NW.R3.ready && !NW.R3.preparing && NW.R3.prepareMs, null, { polling: 500 });
  ok(await p.evaluate(() => NW.R3.Tex.pending() === 0), 'loading screen waited for the full-size textures');
  await p.evaluate(() => { window.__fr = 0; NW.Hooks.on('r3Frame', () => window.__fr++); NW.R3.dyn.lock = true; NW.G.newGame({ mode: 'standard', seed: 1234, intro: false, guided: false }); });
  await p.waitForFunction(() => !NW.R3.preparing && window.__fr > 2 && NW.R3.Flora.active, null, { polling: 500 });
  const frames = async (n) => { const f0 = await p.evaluate(() => window.__fr); await p.waitForFunction((t) => window.__fr >= t, f0 + n, { polling: 300 }); };

  const r = await p.evaluate(() => {
    const Fl = NW.R3.Flora, list = Fl.active.list, W = NW.World, D = NW.D, K = NW.R3.K, T = W.T;
    let trees = 0, matched = 0, lowCrown = 0, nearTrail = 0;
    for (let ay = 0; ay < 5; ay++) for (let ax = 0; ax < 5; ax++) {
      const a = W.get(D.areaId(ax, ay));
      a.objs.forEach((o) => {
        if (o.type !== 'tree') return;
        trees++;
        const x = ax * NW.R3.AREA_W + o.x * K, z = ay * NW.R3.AREA_H + (o.y - 3) * K;
        const it = list.find((t) => !t.belt && Math.abs(t.x - x) < 0.01 && Math.abs(t.z - z) < 0.01);
        if (!it) return;
        matched++;
        const tx = Math.floor(o.x / 16), ty = Math.floor((o.y - 3) / 16);
        let trail = false; for (let q = -1; q <= 1; q++) for (let pp = -1; pp <= 1; pp++) { const t = W.tile(a, tx + pp, ty + q); if (t === T.DIRT) trail = true; }
        if (!trail) return;
        nearTrail++;
        const sp = Fl.SPEC[it.v], s = it.m[5];
        if (sp.p.cb != null && sp.p.R != null) { const low = sp.p.cb * s - sp.p.R * sp.p.droop * Math.hypot(it.m[0], it.m[2]); if (low < 2.0) lowCrown++; }
      });
    }
    return { trees, matched, nearTrail, lowCrown, inst: Fl.stats.instances, buildMs: Fl.stats.buildMs, modelMs: Fl.stats.modelMs };
  });
  ok(r.trees > 500 && r.matched === r.trees, 'every game tree has a 3D tree at its position (' + r.matched + '/' + r.trees + ', ' + r.inst + ' instances with belt and understory)');
  ok(r.lowCrown === 0, 'trees beside trails keep their lowest branches above eye height (' + r.nearTrail + ' checked, ' + r.lowCrown + ' too low)');
  ok(r.buildMs + r.modelMs < 3000, 'flora build ' + r.buildMs + ' ms + models ' + r.modelMs + ' ms');

  const quad = await p.evaluate(() => ['deer', 'rabbit', 'wolf', 'fox', 'dog'].map((k) => { const c = NW.R3.Creatures.make(k, {}); c.update(0.05, { grazing: k === 'deer' }, null); c.obj.updateMatrixWorld(true); const v = new THREE.Vector3(); c.rig.b.head.getWorldPosition(v); const ok2 = c.rig.bones.every((bn) => Number.isFinite(bn.position.x + bn.position.y + bn.position.z)); return k + ':' + (ok2 && Number.isFinite(v.y) && v.y > 0.05 ? 'ok' : 'BROKEN y=' + v.y); }));
  ok(quad.every((q) => q.endsWith(':ok')), 'quadruped heads are attached and finite (' + quad.join(' ') + ')');

  for (const q of ['low', 'medium', 'high']) {
    await p.evaluate((q) => { NW.settings.quality = q; NW.R3.applyQuality(); }, q);
    await p.waitForFunction(() => !NW.R3.preparing, null, { polling: 500 });
    await p.evaluate(() => { NW.R3.dyn.scale = NW.R3.q().scale; NW.R3.resize(true); const G = NW.G, s = G.state; G.enterArea('f_2_1', 150, 140, 'up'); s.player.x = 150; s.player.y = 140; s.time.min = 720; NW.R3.Controls.yaw = 1.4; NW.R3.Controls.pitch = -0.05; });
    await frames(3);
    const info = await p.evaluate(() => ({ calls: NW.R3.renderer.info.render.calls, tris: NW.R3.renderer.info.render.triangles, shown: NW.R3.Flora.stats.shown }));
    const budget = { low: 420000, medium: 620000, high: 900000 }[q];
    ok(info.tris < budget && info.calls < 300, q + ': ' + Math.round(info.tris / 1000) + 'k triangles (budget ' + budget / 1000 + 'k), ' + info.calls + ' draw calls, ' + info.shown + ' trees drawn');
    const url = await p.evaluate(() => NW.R3.shot());
    if (url) fs.writeFileSync(SH + 'flora-' + q + '.jpg', Buffer.from(url.split(',')[1], 'base64'));
  }
  // looking at the sky culls the whole forest floor; turning around re-culls
  await p.evaluate(() => { NW.R3.Controls.pitch = 1.2; });
  await frames(2);
  const up = await p.evaluate(() => NW.R3.Flora.stats.shown);
  await p.evaluate(() => { NW.R3.Controls.pitch = -0.05; NW.R3.Controls.yaw += Math.PI; });
  await frames(2);
  const back = await p.evaluate(() => NW.R3.Flora.stats.shown);
  ok(up > 0 && back > 0, 'culling follows the camera (sky ' + up + ', turned around ' + back + ' trees)');

  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
