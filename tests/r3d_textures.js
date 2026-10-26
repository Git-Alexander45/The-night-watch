// Procedural texture library check: generation timings (1024 / 512), quality swap in place,
// swatch renders of every material, game start without errors.
//   node tests/r3d_textures.js            (server on :8123; SHOTS=dir for screenshots)
const { chromium } = require('playwright');
const fs = require('fs');
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await b.newPage({ viewport: { width: 1366, height: 768 } });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());   // offline sandbox: do not block on web fonts
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  page.setDefaultTimeout(240000); await page.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } }); await page.goto('http://localhost:8123/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.NW && NW.R3 && NW.R3.ready && !NW.R3.preparing && NW.R3.prepareMs, null, { timeout: 300000 });
  const ev = (f, a) => page.evaluate(f, a);
  const names = await ev(() => NW.R3.Tex.names());
  check(names.length >= 45, names.length + ' generated names');
  check(await ev(() => Object.keys({ bark_pine: 1, bark_birch: 1, needles: 1, wood_log: 1, wood_log_end: 1, wood_plank: 1, wood_plank_dark: 1, wood_weathered: 1, roof_shingle: 1, chinking: 1, snow: 1, dirt: 1, mud: 1, ash: 1, rock: 1, stone_wall: 1, gravel: 1, ice: 1, metal_dark: 1, metal_rust: 1, metal_painted: 1, cast_iron: 1, brass: 1, glass: 1, fabric_wool: 1, fabric_canvas: 1, fabric_blue: 1, leather: 1, fur: 1, paper: 1, grass_dry: 1, moss: 1, foliage_birch: 1 }).every((k) => NW.R3.Tex.BASE[k] && NW.R3.Tex.names().includes(k))), 'every original BASE name is generated');

  console.log('# Lazy generation: previews on the main thread, full size in workers');
  const g1 = await ev(async () => {
    NW.settings.quality = 'medium'; NW.R3.applyQuality();
    const T = NW.R3.Tex, THREE = window.THREE, t0 = performance.now();
    T.names().forEach((n) => T.mat(n, /needles|foliage|grass_card|grass_dry/.test(n) ? { alphaTest: 0.5, side: THREE.DoubleSide } : {}));
    const main = performance.now() - t0;
    await T.whenReady();
    const wall = performance.now() - t0;
    return { main, wall, sizes: T.names().map((n) => T._sets[n === 'log_wall' ? 'log_wall@0.300' : n].N), stats: Object.assign({}, T.stats) };
  });
  check(g1.sizes.every((n) => n === 1024), 'all sets upgraded to 1024');
  console.log('  main thread (all previews) ' + g1.main.toFixed(0) + ' ms, all full-size ready after ' + g1.wall.toFixed(0) + ' ms wall');
  const tot1024 = Object.values(g1.stats).reduce((a, b) => a + b, 0);
  console.log('  per set @1024 (worker ms, sum ' + tot1024.toFixed(0) + '): ' + Object.entries(g1.stats).map(([k, v]) => k + ' ' + v).join(', '));
  fs.writeFileSync(SHOTS + '/tex-timings-1024.json', JSON.stringify(g1, null, 1));
  console.log('# Quality swap to Low (512)');
  const g2 = await ev(async () => {
    const T = NW.R3.Tex, m = T.mat('rock'), before = m.map, t0 = performance.now();
    NW.settings.quality = 'low'; NW.R3.applyQuality();
    const main = performance.now() - t0;
    await T.whenReady();
    return { main, wall: performance.now() - t0, same: T.mat('rock') === m, size: m.map.image.width, swapped: m.map !== before, stats: Object.assign({}, T.stats) };
  });
  check(g2.same && g2.swapped && g2.size === 512, 'materials kept, maps swapped to 512 in place (main ' + g2.main.toFixed(0) + ' ms, ready after ' + g2.wall.toFixed(0) + ' ms)');
  const tot512 = Object.values(g2.stats).reduce((a, b) => a + b, 0);
  console.log('  per set @512 (sum ' + tot512.toFixed(0) + '): ' + Object.entries(g2.stats).map(([k, v]) => k + ' ' + v).join(', '));
  fs.writeFileSync(SHOTS + '/tex-timings-512.json', JSON.stringify(g2, null, 1));
  await ev(async () => { NW.settings.quality = 'medium'; NW.R3.applyQuality(); await NW.R3.Tex.whenReady(); });

  await ev(() => {
    const R3 = NW.R3, THREE = window.THREE, T = R3.Tex;
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0x9aa6b6, 0x2a2622, 0.6));
    const d = new THREE.DirectionalLight(0xfff2e0, 2.2); d.position.set(-3, 5, 4); sc.add(d); sc.add(d.target);
    const p = new THREE.PointLight(0xff9a50, 6, 8, 2); p.position.set(2.5, 1.5, 2); sc.add(p);
    const sphere = T.metreUV(new THREE.SphereGeometry(0.42, 48, 32), 1), box = T.metreUV(new THREE.BoxGeometry(0.75, 0.75, 0.75), 1), plane = new THREE.PlaneGeometry(1.6, 1.6);
    const cyl = new THREE.CylinderGeometry(0.4, 0.4, 0.2, 40);
    window.__sw = { sc, groups: {} };
    T.names().forEach((n) => {
      const g = new THREE.Group();
      const m = T.mat(n, /needles|foliage|grass_card|grass_dry/.test(n) ? { alphaTest: 0.5, side: THREE.DoubleSide } : {});
      const s = new THREE.Mesh(n === 'wood_log_end' ? cyl : sphere, m); s.position.set(-0.55, 0.45, 0); if (n === 'wood_log_end') s.rotation.x = Math.PI / 2;
      const bx = new THREE.Mesh(box, m); bx.position.set(0.5, 0.38, 0.1); bx.rotation.y = 0.6;
      const pl = new THREE.Mesh(plane, m); pl.rotation.x = -Math.PI / 2;
      g.add(s, bx, pl); g.visible = false; sc.add(g); window.__sw.groups[n] = g;
    });
  });
  // render: 4 x 2 swatches per shot, each in its own viewport
  const render = (list) => ev((list) => {
    const R3 = NW.R3, THREE = window.THREE, S = window.__sw, r = R3.renderer;
    const W = r.domElement.width, H = r.domElement.height, out = document.createElement('canvas'); out.width = W; out.height = H;
    const g2 = out.getContext('2d'); g2.fillStyle = '#000'; g2.fillRect(0, 0, W, H);
    const cam = new THREE.PerspectiveCamera(40, (W / 4) / (H / 2), 0.05, 50); cam.position.set(0, 1.5, 2.6); cam.lookAt(0, 0.25, 0);
    const realScene = R3.scene;
    list.forEach((n, k) => {
      Object.values(S.groups).forEach((g) => { g.visible = false; }); S.groups[n].visible = true;
      R3.scene = S.sc; R3.U.uPoolN.value = 0;
      R3.post().uGrain.value = 0; R3.post().uVig.value = 0;
      R3.render(cam, 1); R3.scene = realScene;
      const x = (k % 4) * W / 4, y = Math.floor(k / 4) * H / 2;
      g2.drawImage(r.domElement, W * 0.125 * 0, 0, W, H, x, y, W / 4, H / 2);
      g2.fillStyle = '#fff'; g2.font = '14px sans-serif'; g2.fillText(n, x + 6, y + 18);
    });
    return out.toDataURL('image/png');
  }, list);
  for (let i = 0; i < names.length; i += 8) {
    const url = await render(names.slice(i, i + 8));
    fs.writeFileSync(SHOTS + '/tex-' + (i / 8 + 1) + '.png', Buffer.from(url.split(',')[1], 'base64'));
  }
  // flat colour maps (closer look at the patterns)
  for (let i = 0; i < names.length; i += 12) {
    const url = await ev((list) => { const W = 1200, out = document.createElement('canvas'); out.width = W; out.height = 900; const g = out.getContext('2d'); g.fillStyle = '#333'; g.fillRect(0, 0, W, 900);
      list.forEach((n, k) => { const cv = NW.R3.Tex.canvas(n); const x = (k % 4) * 300, y = Math.floor(k / 4) * 300; g.drawImage(cv, x, y, 300, 300); g.fillStyle = '#fff'; g.fillText(n, x + 4, y + 12); }); return out.toDataURL('image/png'); }, names.slice(i, i + 12));
    fs.writeFileSync(SHOTS + '/tex-maps-' + (i / 12 + 1) + '.png', Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log('# Game start');
  await ev(() => NW.G.newGame({ mode: 'standard', seed: 1234, intro: false, guided: false }));
  await page.waitForTimeout(2500);
  check(await ev(() => NW.G.mode === 'play'), 'game running');
  check(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'all ok');
  process.exit(fails ? 1 : 0);
})();
