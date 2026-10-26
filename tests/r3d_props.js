// 3D props: every landmark, loot container, sign, cairn, drop, day event, module object and the three remote
// interiors, by day and night. Screenshots to $SHOTS/props-*.png; checks draw calls and console errors.
// Run: NODE_PATH=/opt/node22/lib/node_modules node tests/r3d_props.js   (static server on :8123)
const { chromium } = require('playwright');
const SHOTS = process.env.SHOTS || '/tmp/shots';
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
let fails = 0; const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await b.newPage({ viewport: { width: 800, height: 450 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.setDefaultTimeout(600000); await page.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } }); await page.goto('http://localhost:8123/index.html', { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.NW && NW.G && NW.R3 && NW.R3.ready && !NW.R3.preparing && NW.R3.prepareMs, null, { timeout: 300000 }); await page.waitForTimeout(1500);
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => {
    NW.G.newGame({ mode: 'standard', seed: 1234, intro: false, guided: false });
    NW.UI.closeAll();
    const st = document.createElement('style'); st.textContent = 'body > *:not(#view3d) { visibility: hidden !important; }'; document.head.appendChild(st);
    window.T = {
      lm: (lm) => Object.keys(NW.D.AREAS).find((a) => NW.D.AREAS[a].lm === lm),
      // stand at (px, py) in area, look at (tx, ty) at height h, at a time of day
      view(area, px, py, tx, ty, h, min) {
        const g = NW.G, s = g.state;
        g.paused = false;
        // forest: keep the requested distance but swing round the target until no tree stands in the way
        if (area.startsWith('f_')) {
          const a = NW.World.get(area), d0 = Math.hypot(px - tx, py - ty), a0 = Math.atan2(py - ty, px - tx);
          const trees = a.objs.filter((o) => o.type === 'tree' || (o.type === 'deadtree' && NW.Objects.available(o)) || o.type === 'bush');
          const segD = (o, x1, y1) => { const vx = tx - x1, vy = ty - y1, L = vx * vx + vy * vy; const t = Math.max(0, Math.min(1, ((o.x - x1) * vx + (o.y - y1) * vy) / L)); return Math.hypot(o.x - (x1 + vx * t), o.y - (y1 + vy * t)); };
          let best = null;
          for (let i = 0; i < 36 && !best; i++) for (const dd of [1, 0.8, 1.25, 0.65]) {
            const an = a0 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.17, x = tx + Math.cos(an) * d0 * dd, y = ty + Math.sin(an) * d0 * dd;
            if (x < 40 || y < 40 || x > a.w * 16 - 40 || y > a.h * 16 - 48) continue;
            if (trees.some((o) => Math.hypot(o.x - x, o.y - y) < 30)) continue;
            if (trees.some((o) => segD(o, x, y) < (o.type === 'tree' ? 26 : 12) && Math.hypot(o.x - tx, o.y - ty) > 20)) continue;
            best = [x, y]; break;
          }
          if (best) { px = best[0]; py = best[1]; }
        }
        if (g.area.id !== area) g.enterArea(area, px, py, 'up');
        s.player.x = px; s.player.y = py; s.time.min = min; s.player.temp = 37; s.player.hp = 100;
        const dx = tx - px, dy = ty - py, d = Math.hypot(dx, dy) * NW.R3.K;
        NW.R3.Controls.yaw = Math.atan2(dx, -dy);
        NW.R3.Controls.pitch = Math.atan2((h == null ? 0.8 : h) - 1.62, Math.max(0.5, d));
        NW.UI.closeAll();
        requestAnimationFrame(() => requestAnimationFrame(() => { g.paused = true; }));
      },
      info() {
        const i = NW.R3.renderer.info.render; let props = 0;
        NW.R3.scene.traverseVisible((o) => { if (o.isMesh || o.isInstancedMesh) { let p = o; while (p && !(p.userData && p.userData.r3key)) p = p.parent; if (p) props++; } });
        return { calls: i.calls, tris: i.triangles, props };
      },
    };
  });
  const results = [];
  const shot = async (name, area, px, py, tx, ty, h, min, wait) => {
    if (ONLY && !ONLY.test(name)) return;
    await ev(([a, b2, c, d, e, f, g]) => T.view(a, b2, c, d, e, f, g), [area, px, py, tx, ty, h, min == null ? 11 * 60 : min]);
    await ev((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), wait || 8);
    const inf = await ev(() => T.info());
    results.push([name, inf]);
    console.log('    ' + name + ' draws ' + inf.calls + ' (props ' + inf.props + ') tris ' + Math.round(inf.tris / 1000) + 'k');
    await page.screenshot({ path: SHOTS + '/props-' + name + '.png' });
  };
  const both = async (name, area, px, py, tx, ty, h) => { await shot(name + '-day', area, px, py, tx, ty, h, 11 * 60); await shot(name + '-night', area, px, py, tx, ty, h, 22 * 60 + 30); };
  const L = await ev(() => { const o = {}; ['deadfall', 'stonecircle', 'mine', 'shack', 'blind', 'burned', 'camp', 'oak', 'car', 'trailhead', 'mast', 'firetower', 'lake', 'cairn'].forEach((k) => { o[k] = T.lm(k); }); return o; });
  console.log('# landmarks', JSON.stringify(L));
  await both('firetower', L.firetower, 330, 262, 320, 100, 6);
  await shot('firetower-base', L.firetower, 300, 160, 320, 120, 2.5, 11 * 60);
  await both('mast', L.mast, 330, 250, 344, 90, 3);
  await both('deadfall', L.deadfall, 100, 200, 120, 120, 0.4);
  await both('stonecircle', L.stonecircle, 300, 170, 336, 80, 0.8);
  await both('mine', L.mine, 140, 190, 120, 80, 1.4);
  await both('shack', L.shack, 300, 190, 330, 90, 1.5);
  await both('blind', L.blind, 330, 170, 344, 80, 2);
  await both('burned', L.burned, 120, 230, 160, 120, 1.2);
  await both('camp', L.camp, 250, 170, 250, 80, 0.6);
  await both('oak', L.oak, 300, 230, 336, 100, 3);
  await both('car', L.car, 300, 170, 330, 90, 0.8);
  await both('trailhead', L.trailhead, 220, 230, 230, 190, 1.0);
  await shot('trailhead-board', L.trailhead, 170, 230, 160, 172, 1.3, 11 * 60);
  await shot('cabin-sign', 'f_2_2', 250, 262, 288, 236, 1.2, 11 * 60);
  await shot('cairn', 'f_1_2', 330, 130, 336, 76, 0.6, 11 * 60);
  // loot opened
  await ev(([a]) => { NW.G.state.world.loot[a] = NW.G.state.time.day; }, [L.mine]);
  await shot('loot-mine-open', L.mine, 200, 150, 200, 108, 0.3, 11 * 60);
  await ev(([a]) => { NW.G.state.world.loot[a] = NW.G.state.time.day; }, [L.camp]);
  await shot('loot-camp-open', L.camp, 392, 140, 392, 92, 0.3, 11 * 60);
  await shot('loot-trailhead', L.trailhead, 344, 220, 344, 188, 0.4, 11 * 60);
  await shot('loot-mast', L.mast, 296, 150, 296, 108, 0.3, 11 * 60);
  await shot('loot-car', L.car, 376, 150, 376, 94, 0.3, 11 * 60);
  await shot('loot-blind', L.blind, 392, 140, 392, 92, 0.3, 11 * 60);
  // mine boards pried
  await ev(() => { NW.G.state.mods.places = NW.G.state.mods.places || {}; NW.G.state.mods.places.boards = true; });
  await shot('mine-open', L.mine, 130, 170, 128, 88, 1.2, 11 * 60);

  console.log('# day events');
  const evs = [['cache'], ['supply'], ['tracks'], ['gift'], ['anomaly', 'door'], ['anomaly', 'bells'], ['anomaly', 'warmfire'], ['anomaly', 'crows'], ['anomaly', 'voice']];
  for (const [t, k] of evs) {
    await ev(([t2, k2]) => { const s = NW.G.state; s.dayEvents = [{ id: 'e9' + t2 + (k2 || ''), type: t2, area: 'f_2_1', x: 240, y: 150, status: 'new', day: s.time.day, data: k2 ? { kind: k2 } : { note: 0 } }]; }, [t, k]);
    const nm = 'ev-' + t + (k ? '-' + k : '');
    if (t === 'anomaly' || t === 'supply') await both(nm, 'f_2_1', 232, 200, 240, 150, 0.6); else await shot(nm, 'f_2_1', 232, 195, 240, 150, 0.3, 11 * 60);
  }
  await ev(() => { NW.G.state.dayEvents = []; NW.G.state.drops.push({ area: 'f_2_1', x: 240, y: 150, id: 'canned', n: 2 }, { area: 'f_2_1', x: 262, y: 152, id: 'wood', n: 3 }); });
  await shot('drops', 'f_2_1', 250, 190, 250, 150, 0.2, 11 * 60);
  await ev(() => { NW.G.state.drops = []; });

  console.log('# missions');
  const types = ['breaker', 'gauge', 'markers', 'restock', 'pack', 'tree', 'snares', 'camera', 'sign'];
  await ev(([ty]) => {
    const m = NW.Missions.state(); m.orders = [];
    ty.forEach((t, i) => { const x = 60 + (i % 5) * 90, y = i < 5 ? 120 : 200; m.orders.push({ id: 'oT' + i, type: t, day: NW.G.state.time.day, due: NW.G.state.time.day + 1, pri: false, status: 'active', parts: [{ a: 'f_2_1', x, y, ok: false }, { a: 'f_2_1', x: x + 30, y: y + 6, ok: true }], reward: [], end: null, note: '' }); });
    m.orders.push({ id: 'oTt', type: 'tower', day: NW.G.state.time.day, due: NW.G.state.time.day + 1, pri: false, status: 'active', parts: [{ a: 'in_tower', x: 160, y: 104, ok: false }], reward: [], end: null, note: '' });
  }, [types]);
  await shot('ms-row1-day', 'f_2_1', 240, 250, 240, 120, 0.6, 11 * 60);
  await shot('ms-row1-night', 'f_2_1', 240, 250, 240, 120, 0.6, 22 * 60 + 30);
  await shot('ms-left', 'f_2_1', 90, 170, 80, 120, 0.6, 11 * 60);
  await shot('ms-right', 'f_2_1', 380, 170, 400, 120, 0.6, 11 * 60);
  await shot('ms-row2', 'f_2_1', 200, 262, 200, 200, 0.5, 11 * 60);
  await ev(() => { NW.Missions.state().orders = NW.Missions.state().orders.filter((o) => o.type === 'tower'); });

  console.log('# characters');
  const cs = await ev(() => { const s = NW.G.state; s.time.day = 3; s.time.min = 10 * 60; const m = NW.Characters.state(); NW.Characters.spot('mara'); NW.Characters.spot('pell'); NW.Characters.spot('garrow'); return { pell: m.pellArea, hale: m.haleDay, sp: m.spots }; });
  console.log('    ' + JSON.stringify(cs));
  const mara = cs.sp.mara, pell = cs.sp.pell, gar = cs.sp.garrow;
  if (mara) await both('ch-mara', mara.area, mara.x, mara.y + 60, mara.x, mara.y, 0.9);
  if (pell) await both('ch-pells', pell.area, pell.x + 4, pell.y + 60, pell.x + 4, pell.y, 0.6);
  if (gar) await shot('ch-garrow', gar.area, gar.x, gar.y + 50, gar.x, gar.y, 1.2, 10 * 60);
  await ev(([d]) => { NW.G.state.time.day = d; }, [cs.hale]);
  const hale = await ev(() => NW.Characters.spot('hale'));
  if (hale) await shot('ch-hale', hale.area, hale.x, hale.y + 50, hale.x, hale.y, 1.2, 10 * 60);
  await ev(() => { NW.G.state.time.day = 1; });

  console.log('# fishing');
  const fish = await ev(() => {
    const m = NW.Fishing.state(); const creek = Object.keys(NW.D.AREAS).find((a) => NW.Fishing.spots(a).length);
    m.snares = [['set', null], ['caught', 'rabbit'], ['raided', 'fox'], ['broken', null], ['empty', null]].map(([s2, an], i) => ({ id: 900 + i, area: 'f_2_1', x: 120 + i * 60, y: 160, st: s2, animal: an, set: 0, at: 1e9 }));
    return { creek, spot: creek && NW.Fishing.spots(creek)[0] };
  });
  await shot('fi-hole', L.lake, 240, 110, 240, 50, 0.2, 11 * 60);
  if (fish.creek) await shot('fi-pool', fish.creek, fish.spot.x - 40, fish.spot.y + 40, fish.spot.wx, fish.spot.wy, 0.2, 11 * 60);
  await shot('fi-snares', 'f_2_1', 240, 205, 240, 160, 0.1, 11 * 60);
  await ev(() => { NW.Fishing.state().snares = []; });

  console.log('# upgrades');
  await ev(() => { const m = NW.Upgrades.state(); NW.Upgrades.LIST.forEach((u) => { m.built[u.id] = 1; }); m.rack = [{ id: 'raw_rabbit', t: 30 }, { id: 'raw_venison', t: 200 }]; m.proj = { id: 'woodbox', prog: 3 }; NW.G.state.woodbox = 22; const s = NW.G.state; Object.values(s.cabin.windows).forEach((w) => { w.shutClosed = true; w.shutter = Math.max(1, w.shutter || 1); }); });
  await shot('up-bench', 'room_storage', 200, 60, 216, 119, 0.8, 11 * 60);
  await shot('up-stove', 'room_main', 120, 130, 60, 50, 1.2, 11 * 60);
  await shot('up-door', 'room_main', 176, 120, 176, 192, 1.0, 11 * 60);
  await shot('up-ext', 'f_2_2', 240, 250, 240, 176, 1.8, 11 * 60);
  await ev(() => { const m = NW.Upgrades.state(); m.built = {}; m.rack = []; m.proj = null; });

  console.log('# interiors');
  await ev(() => { NW.G.state.mods.places.shackFuel = 200; });
  await both('in-tower', 'in_tower', 128, 130, 128, 40, 1.0);
  await shot('in-tower-view', 'in_tower', 128, 60, 128, -200, -6, 11 * 60);
  await shot('in-tower-west', 'in_tower', 180, 100, 20, 100, 0.8, 11 * 60);
  await both('in-shack', 'in_shack', 160, 150, 120, 60, 0.9);
  await shot('in-shack-east', 'in_shack', 100, 110, 260, 70, 0.8, 22 * 60 + 30);
  await ev(() => { NW.G.state.mods.places.shackFuel = 0; });
  await shot('in-shack-cold', 'in_shack', 160, 150, 60, 60, 0.9, 22 * 60 + 30);
  await shot('in-mine-mouth', 'in_mine', 80, 250, 80, 170, 1.0, 11 * 60);
  await ev(() => { const s = NW.G.state, m = s.mods.places, a = (s.time.day - 1) * 1440 + s.time.min; m.lamps = { l_gal: a + 900, l_cart: a + 900, l_deep: a + 900 }; });
  await shot('in-mine-gallery', 'in_mine', 120, 180, 300, 160, 1.2, 11 * 60);
  await shot('in-mine-stope', 'in_mine', 176, 150, 150, 60, 1.2, 11 * 60);
  await shot('in-mine-deep', 'in_mine', 392, 150, 410, 40, 0.8, 11 * 60);
  await ev(() => { NW.G.state.mods.places.lamps = {}; NW.G.state.mods.places.dread = 90; });
  await shot('in-mine-dread', 'in_mine', 300, 170, 200, 170, 1.2, 11 * 60, 10);
  await ev(() => { NW.G.state.mods.places.dread = 0; });

  console.log('# finale flare');
  await ev(() => { const s = NW.G.state; s.mods.finale = s.mods.finale || NW.Finale.state(); const f = NW.Finale.state(); f.flare = { x: 220, y: 220, min: 0 }; f.signal = 'lit'; s.night.active = true; s.night.plan = Object.assign(s.night.plan || {}, { final: true }); });
  await shot('finale-flare', 'f_2_2', 240, 262, 220, 220, 0.4, 23 * 60 + 30);
  await ev(() => { const s = NW.G.state; NW.Finale.state().flare = null; s.night.active = false; s.night.plan.final = false; });

  console.log('# guided first day');
  await ev(() => { NW.G.paused = false; NW.G.newGame({ mode: 'standard', seed: 1234, intro: false, guided: true }); NW.UI.closeAll(); });
  await page.waitForTimeout(500);
  const tgt = await ev(() => { const t = NW.Story.guideTarget(); return t && { x: t.x, y: t.y, dir: t.dir, area: NW.G.area.id }; });
  console.log('    target ' + JSON.stringify(tgt));
  if (tgt) await shot('guide-arrow', tgt.area, NW_px(tgt), NW_py(tgt), tgt.x, tgt.y, 1.6, 9 * 60);

  const maxCalls = Math.max(...results.map((r) => r[1].calls));
  const maxProps = Math.max(...results.map((r) => r[1].props));
  check(results.length > 50 || ONLY, 'shots taken: ' + results.length);
  check(maxProps <= 120, 'prop meshes visible at most ' + maxProps);
  const mine = errs.filter((e) => !/'aA' has already been declared/.test(e));
  check(mine.length === 0, 'no console errors (' + errs.length + ' total incl. other builders): ' + JSON.stringify(mine.slice(0, 5)));
  console.log('max draw calls ' + maxCalls);
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
function NW_px(t) { return t.dir === 'left' ? t.x + 60 : t.dir === 'right' ? t.x - 60 : t.x; }
function NW_py(t) { return t.dir === 'up' ? t.y + 70 : t.dir === 'down' ? t.y + 70 : t.y; }
