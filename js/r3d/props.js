'use strict';
// Props: every landmark structure, loot container, sign, cairn, dropped item, day event and feature-module
// object in 3D, plus the three remote interiors (fire tower cab, trapper's shack, Hollow Mine) and the 3D
// stand-ins for module overlays (guided-day chevron, finale flare, fishing line, mine dread).
//   R3.Props.make(key, obj, areaId) -> { obj, update?(dt, o, ctx), dispose? }
//   R3.Props.buildInterior(areaId, area) -> { group, update(dt, ctx) }
// Models are built from parts merged per material (Kit), origin = the object's ground contact point,
// +X east, +Z south, +Y up, 1 m units. Everything is procedural.
(function (NW) {
  const THREE = window.THREE, R3 = NW.R3;
  if (!THREE || !R3) return;
  const K = R3.K, U = NW.U, D = NW.D, W = NW.World, TS = 16;
  const G = () => NW.G, st = () => NW.G.state;
  const Pr = R3.Props = {};
  const V3 = THREE.Vector3, PI = Math.PI;
  const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new V3(), _s = new V3(), _w = new V3();
  const YUP = new V3(0, 1, 0);

  // ================================================================== small helpers
  const hashf = (a, b, c) => { const h = Math.sin(a * 127.1 + b * 311.7 + (c || 0) * 74.7) * 43758.5453; return h - Math.floor(h); };
  const rngOf = (...a) => U.rng(U.hash(...a.map((x) => (typeof x === 'string' ? U.strHash(x) : Math.round(x * 100)))));
  const n3 = (x, y, z) => (R3.Tex && R3.Tex.noise3 ? R3.Tex.noise3(x, y, z) : Math.sin(x * 1.7 + y * 2.3) * Math.cos(z * 1.9 + x) * 0.6);
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const sstep = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  function mtx(p, r, s) {
    _e.set(r ? r[0] || 0 : 0, r ? r[1] || 0 : 0, r ? r[2] || 0 : 0, (r && r[3]) || 'XYZ'); _q.setFromEuler(_e);
    _p.set(p ? p[0] : 0, p ? p[1] : 0, p ? p[2] : 0);
    if (s == null) _s.set(1, 1, 1); else if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
    return new THREE.Matrix4().compose(_p, _q, _s);
  }
  const daylight = () => { try { return NW.Survival.daylight(); } catch (e) { return 1; } };
  const snowy = () => { const s = st(); return s && s.weather ? s.weather.snow > 0.3 : true; };
  // make a vertex-smooth normal set for a non-indexed geometry (welds by position)
  function smoothNormals(geo) {
    geo.computeVertexNormals();
    const p = geo.attributes.position, n = geo.attributes.normal, acc = new Map();
    const key = (i) => Math.round(p.getX(i) * 500) + ',' + Math.round(p.getY(i) * 500) + ',' + Math.round(p.getZ(i) * 500);
    for (let i = 0; i < p.count; i++) { const k = key(i); let a = acc.get(k); if (!a) acc.set(k, a = [0, 0, 0]); a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); }
    for (let i = 0; i < p.count; i++) { const a = acc.get(key(i)); const l = Math.hypot(a[0], a[1], a[2]) || 1; n.setXYZ(i, a[0] / l, a[1] / l, a[2] / l); }
    n.needsUpdate = true;
    return geo;
  }
  // rough rock: displaced icosphere, flattened underside
  function rockGeo(seed, sx, sy, sz, rough, detail) {
    let g = new THREE.IcosahedronGeometry(1, detail == null ? 2 : detail);
    if (g.index) g = g.toNonIndexed();
    const p = g.attributes.position, o = seed * 7.13;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const d = 1 + (rough == null ? 0.35 : rough) * (n3(x * 1.3 + o, y * 1.3, z * 1.3 - o) * 0.75 + n3(x * 3.1 - o, y * 3.1 + o, z * 3.1) * 0.25);
      x *= d; y *= d; z *= d;
      if (y < -0.35) y = -0.35 + (y + 0.35) * 0.25;
      p.setXYZ(i, x * sx, y * sy, z * sz);
    }
    return smoothNormals(g);
  }
  // pillow-ish box (sacks, packs, cushions, bags): corners pulled in
  function softBox(w, h, d, puff, seg) {
    seg = seg || 4;
    let g = new THREE.BoxGeometry(2, 2, 2, seg, seg, seg);
    g = g.toNonIndexed();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
      const f = 1 - puff * (ax * ay + ay * az + az * ax) / 3;
      p.setXYZ(i, x * f * w / 2, y * f * h / 2, z * f * d / 2);
    }
    return smoothNormals(g);
  }
  // UVs of a cylinder in metres (around = U by default; axis = U for lying logs)
  function cylUV(g, r, h, axisU) {
    const uv = g.attributes.uv, c = 2 * PI * r;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); if (axisU) uv.setXY(i, v * h, u * c); else uv.setXY(i, u * c, v * h); }
    return g;
  }

  // ================================================================== Kit: parts merged per material
  function Kit() { this.parts = new Map(); }
  Kit.prototype.geo = function (mat, geo, m, uv) {
    let arr = this.parts.get(mat); if (!arr) this.parts.set(mat, arr = []);
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (m) g.applyMatrix4(m);
    if (uv === 'm') R3.Tex.metreUV(g);
    arr.push({ geo: g });
    if (!geo.userData.shared) geo.dispose();
    return this;
  };
  const withBase = (base, m) => (base ? base.clone().multiply(m) : m);
  Kit.prototype.box = function (mat, s, p, r, base) { return this.geo(mat, new THREE.BoxGeometry(s[0], s[1], s[2]), withBase(base, mtx(p, r)), 'm'); };
  // cylinder: centre p, axis along local Y then rotated by r
  Kit.prototype.cyl = function (mat, r0, r1, h, p, r, seg, axisU, base, open) {
    const g = cylUV(new THREE.CylinderGeometry(r1, r0, h, seg || 10, 1, !!open), (r0 + r1) / 2, h, axisU);
    return this.geo(mat, g, withBase(base, mtx(p, r)));
  };
  // a tapered round limb from a to b (radius r0 at a, r1 at b)
  Kit.prototype.limb = function (mat, a, b, r0, r1, seg, base) {
    const d = new V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
    if (len < 1e-4) return this;
    const g = cylUV(new THREE.CylinderGeometry(r1, r0, len, seg || 7, 1, true), (r0 + r1) / 2, len, false);
    const q = new THREE.Quaternion().setFromUnitVectors(YUP, d.clone().normalize());
    const m = new THREE.Matrix4().compose(new V3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new V3(1, 1, 1));
    return this.geo(mat, g, withBase(base, m));
  };
  // a square beam from a to b
  Kit.prototype.beam = function (mat, a, b, w, d, base) {
    const v = new V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = v.length();
    const q = new THREE.Quaternion().setFromUnitVectors(YUP, v.normalize());
    const m = new THREE.Matrix4().compose(new V3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new V3(1, 1, 1));
    return this.geo(mat, new THREE.BoxGeometry(w, len, d == null ? w : d), withBase(base, m), 'm');
  };
  // a lying log along local X with sawn end caps
  Kit.prototype.log = function (bark, end, len, r, p, ry, rz, base) {
    const b = withBase(base, mtx(p, [0, ry || 0, rz || 0]));
    this.geo(bark, cylUV(new THREE.CylinderGeometry(r, r * 0.96, len, 12, 1, true), r, len, false), b.clone().multiply(mtx([0, 0, 0], [0, 0, PI / 2])));
    if (end) {
      this.geo(end, new THREE.CircleGeometry(r * 0.97, 12), b.clone().multiply(mtx([len / 2, 0, 0], [0, PI / 2, 0])));
      this.geo(end, new THREE.CircleGeometry(r * 0.93, 12), b.clone().multiply(mtx([-len / 2, 0, 0], [0, -PI / 2, 0])));
    }
    return this;
  };
  Kit.prototype.build = function (opts) {
    opts = opts || {};
    const g = opts.into || new THREE.Group();
    for (const [mat, arr] of this.parts) {
      if (!arr.length) continue;
      const geo = arr.length === 1 ? arr[0].geo : R3.merge(arr);
      if (arr.length > 1) arr.forEach((x) => x.geo.dispose());
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      const solid = !mat.transparent && !mat.userData.noShadow && opts.shadow !== false;
      mesh.castShadow = solid; mesh.receiveShadow = !mat.transparent;
      g.add(mesh);
    }
    this.parts.clear();
    return g;
  };

  // ================================================================== materials
  // snow amounts are quantised so the number of shader variants stays small
  const TM = (name, o) => { o = o || {}; if (o.snowTop != null) { o = Object.assign({}, o); if (o.snowTop > 0) { o.snowTop = 0.8; o.weather = 0; } else delete o.snowTop; } return R3.Tex.mat(name, o); };
  const OUT = { snowTop: 0.75, weather: 0 };
  const MAT = {
    timber: (o) => TM('wood_weathered', Object.assign({}, OUT, o)),
    boards: (o) => TM('boards_weathered', Object.assign({}, OUT, o)),
    plank: (o) => TM('wood_plank', Object.assign({}, OUT, o)),
    dark: (o) => TM('wood_plank_dark', Object.assign({}, OUT, o)),
    log: (o) => TM('wood_log', Object.assign({}, OUT, o)),
    logEnd: () => TM('wood_log_end', {}),
    bark: (o) => TM('bark_pine', Object.assign({}, OUT, o)),
    deadBark: (o) => TM('bark_dead', Object.assign({}, OUT, o)),
    rock: (o) => TM('rock', Object.assign({ snowTop: 0.9, weather: 0 }, o)),
    lichen: (o) => TM('rock_lichen', Object.assign({ snowTop: 0.9, weather: 0 }, o)),
    metal: (o) => TM('metal_dark', Object.assign({ snowTop: 0.5 }, o)),
    rust: (o) => TM('metal_rust', Object.assign({}, OUT, o)),
    paint: (c, o) => TM('metal_painted', Object.assign({ color: c, snowTop: 0.6 }, o)),
    iron: (o) => TM('cast_iron', Object.assign({}, o)),
    brass: () => TM('brass', {}),
    glass: () => TM('glass', { transparent: true, opacity: 0.22, depthWrite: false }),
    canvas: (c, o) => TM('fabric_canvas', Object.assign({ color: c, snowTop: 0.6 }, o)),
    blue: (c, o) => TM('fabric_blue', Object.assign(c != null ? { color: c } : {}, { snowTop: 0.6 }, o)),
    wool: (c) => TM('fabric_wool', c != null ? { color: c } : {}),
    red: (c) => TM('fabric_red', c != null ? { color: c } : {}),
    leather: (c) => TM('leather', c != null ? { color: c } : {}),
    fur: (c) => TM('fur', c != null ? { color: c } : {}),
    paper: () => TM('paper', {}),
    ash: (o) => TM('ash', Object.assign({ weather: 0 }, o)),
    roof: (o) => TM('roof_shingle', Object.assign({ snowTop: 1 }, o)),
    snow: () => TM('snow', {}),
    dirt: () => TM('dirt', {}),
    mud: () => TM('mud', {}),
    needles: () => TM('needles', { alphaTest: 0.45, side: THREE.DoubleSide, snowTop: 0.8 }),
    logWall: () => TM('log_wall', {}),
    floor: () => TM('wood_plank_floor', {}),
    stoneWall: () => TM('stone_wall', {}),
    chink: () => TM('chinking', {}),
    plain: (c, r, m) => R3.mat('plain' + c + '|' + r + '|' + (m || 0), () => R3.std({ color: c, roughness: r == null ? 0.8 : r, metalness: m || 0 })),
    black: () => R3.mat('pr_black', () => R3.basic({ color: 0x000000 })),
    voidMat: () => R3.mat('pr_void', () => { const m = R3.std({ color: 0x050507, roughness: 1, side: THREE.BackSide }); return m; }),
  };
  // emissive material owned by one prop instance (its intensity animates)
  function glowStd(color, emissive, base) {
    const m = R3.std({ color: color, roughness: 0.4, emissive: emissive, emissiveIntensity: base == null ? 1 : base });
    m.userData.own = true; m.userData.noShadow = true;
    return m;
  }

  // ================================================================== canvas textures
  const texCache = {};
  function ctex(name, w, h, draw, srgb) {
    if (texCache[name]) return texCache[name];
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return (texCache[name] = t);
  }
  const TEX = {
    puff: () => ctex('puff', 64, 64, (g) => {
      for (let i = 0; i < 9; i++) { const x = 32 + (hashf(i, 1) - 0.5) * 18, y = 32 + (hashf(i, 2) - 0.5) * 18, r = 12 + hashf(i, 3) * 10; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
    }),
    flame: () => ctex('flame', 32, 64, (g) => {
      const gr = g.createRadialGradient(16, 46, 1, 16, 40, 30);
      gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.25, 'rgba(255,190,90,0.9)'); gr.addColorStop(0.55, 'rgba(255,90,20,0.45)'); gr.addColorStop(1, 'rgba(120,20,0,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(16, 2); g.bezierCurveTo(30, 26, 30, 60, 16, 62); g.bezierCurveTo(2, 60, 2, 26, 16, 2); g.fill();
    }),
    glow: () => ctex('glowdot', 32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); }),
    column: () => ctex('column', 32, 128, (g) => {
      for (let y = 0; y < 128; y++) { const a = Math.sin(y / 128 * PI) * 0.8 * (0.6 + 0.4 * Math.sin(y * 0.4)); const gr = g.createLinearGradient(0, 0, 32, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,' + a.toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, y, 32, 1); }
    }),
    print: () => ctex('print', 32, 64, (g) => {
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath(); g.ellipse(16, 20, 10, 15, 0, 0, 6.3); g.fill(); g.beginPath(); g.ellipse(16, 50, 8, 10, 0, 0, 6.3); g.fill();
    }),
    paw: () => ctex('paw', 32, 32, (g) => { g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(16, 20, 7, 6, 0, 0, 6.3); g.fill(); [[8, 10], [13, 6], [19, 6], [24, 10]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 3, 0, 6.3); g.fill(); }); }),
    keepout: () => ctex('keepout', 256, 128, (g) => {
      g.fillStyle = '#c9c0a8'; g.fillRect(0, 0, 256, 128);
      for (let i = 0; i < 400; i++) { g.fillStyle = 'rgba(80,60,40,' + (hashf(i, 4) * 0.12) + ')'; g.fillRect(hashf(i, 1) * 256, hashf(i, 2) * 128, 2 + hashf(i, 3) * 30, 1); }
      g.fillStyle = '#8a1c14'; g.font = 'bold 58px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('KEEP', 128, 38); g.fillText('OUT', 128, 94);
      g.strokeStyle = '#3a2a1a'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 122);
    }),
    notice: () => ctex('notice', 256, 192, (g) => {
      g.fillStyle = '#4a3020'; g.fillRect(0, 0, 256, 192);
      const sheet = (x, y, w, h, r, col, lines, head) => { g.save(); g.translate(x, y); g.rotate(r); g.fillStyle = col; g.fillRect(-w / 2, -h / 2, w, h); g.fillStyle = 'rgba(40,30,20,0.75)'; if (head) { g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.fillText(head, 0, -h / 2 + 16); } for (let i = 0; i < lines; i++) g.fillRect(-w / 2 + 8, -h / 2 + 26 + i * 9, w - 16 - (i % 3) * 12, 3); g.fillStyle = '#a02018'; g.beginPath(); g.arc(0, -h / 2 + 5, 3, 0, 6.3); g.fill(); g.restore(); };
      sheet(62, 70, 92, 110, -0.04, '#d8ccae', 8, 'PERMITS');
      sheet(172, 62, 84, 96, 0.05, '#e4e0d4', 6, 'MISSING');
      sheet(180, 150, 70, 50, -0.08, '#c8b890', 2, '');
      sheet(70, 158, 80, 40, 0.03, '#d8ccae', 2, 'BEARS');
      g.fillStyle = 'rgba(40,30,20,0.6)'; g.fillRect(150, 30, 44, 34);
    }),
    paperLines: () => ctex('paperLines', 128, 128, (g) => {
      g.fillStyle = '#d6cbb0'; g.fillRect(0, 0, 128, 128);
      g.fillStyle = 'rgba(60,50,40,0.6)'; for (let y = 16; y < 120; y += 9) g.fillRect(10, y, 50 - (y % 3) * 6, 2); for (let y = 16; y < 120; y += 9) g.fillRect(70, y, 46 - (y % 4) * 5, 2);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(63, 0, 2, 128);
    }),
    foreman: () => ctex('foreman', 128, 96, (g) => {
      g.fillStyle = '#cdbf9c'; g.fillRect(0, 0, 128, 96); g.fillStyle = '#7a1c14'; g.fillRect(0, 0, 128, 18);
      g.fillStyle = '#efe4c8'; g.font = 'bold 11px serif'; g.textAlign = 'center'; g.fillText('NOTICE TO ALL MEN', 64, 13);
      g.fillStyle = 'rgba(40,30,20,0.7)'; for (let y = 28; y < 86; y += 8) g.fillRect(10, y, 108 - (y % 5) * 8, 2);
      g.font = 'italic 9px serif'; g.fillText('— By order, 1931', 80, 92);
    }),
    rose: () => ctex('rose', 256, 256, (g) => {
      g.clearRect(0, 0, 256, 256); g.translate(128, 128);
      g.strokeStyle = 'rgba(214,207,187,0.55)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 118, 0, 6.3); g.stroke(); g.beginPath(); g.arc(0, 0, 100, 0, 6.3); g.stroke();
      for (let i = 0; i < 8; i++) { g.save(); g.rotate(i * PI / 4); g.fillStyle = i % 2 ? 'rgba(214,207,187,0.45)' : 'rgba(176,64,52,0.6)'; g.beginPath(); g.moveTo(0, -(i % 2 ? 70 : 112)); g.lineTo(12, 0); g.lineTo(-12, 0); g.fill(); g.restore(); }
      g.fillStyle = 'rgba(214,207,187,0.7)'; g.font = 'bold 26px serif'; g.textAlign = 'center'; g.fillText('N', 0, -88);
    }),
    finder: () => ctex('finder', 256, 256, (g) => {
      g.fillStyle = '#d8ccae'; g.beginPath(); g.arc(128, 128, 126, 0, 6.3); g.fill();
      g.strokeStyle = 'rgba(60,90,60,0.5)'; g.lineWidth = 2; for (let i = 0; i < 18; i++) { g.beginPath(); g.moveTo(128 + (hashf(i, 1) - 0.5) * 220, 128 + (hashf(i, 2) - 0.5) * 220); g.bezierCurveTo(128 + (hashf(i, 3) - 0.5) * 220, 128 + (hashf(i, 4) - 0.5) * 220, 128 + (hashf(i, 5) - 0.5) * 220, 128, 128 + (hashf(i, 6) - 0.5) * 220, 128 + (hashf(i, 7) - 0.5) * 220); g.stroke(); }
      g.fillStyle = 'rgba(60,110,150,0.5)'; g.beginPath(); g.ellipse(150, 70, 24, 10, 0.3, 0, 6.3); g.fill();
      g.strokeStyle = '#2a2018'; g.lineWidth = 1; for (let i = 0; i < 72; i++) { const a = i / 72 * 2 * PI, r0 = i % 9 === 0 ? 108 : 116; g.beginPath(); g.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); g.lineTo(128 + Math.cos(a) * 124, 128 + Math.sin(a) * 124); g.stroke(); }
      g.fillStyle = '#a02018'; g.beginPath(); g.arc(128, 128, 4, 0, 6.3); g.fill();
    }),
    stencil: () => ctex('stencil', 256, 128, (g) => {
      g.clearRect(0, 0, 256, 128); g.fillStyle = 'rgba(235,235,225,0.85)'; g.font = 'bold 44px Arial, sans-serif'; g.textAlign = 'center';
      g.fillText('HQ', 128, 52); g.font = 'bold 22px Arial, sans-serif'; g.fillText('SILVERPINE · WATCH 7', 128, 92);
    }),
    cross: () => ctex('cross', 64, 64, (g) => { g.clearRect(0, 0, 64, 64); g.fillStyle = 'rgba(240,238,230,0.95)'; g.fillRect(24, 8, 16, 48); g.fillRect(8, 24, 48, 16); }),
    hazard: () => ctex('hazard', 64, 64, (g) => { g.clearRect(0, 0, 64, 64); g.fillStyle = '#e0b420'; g.beginPath(); g.moveTo(32, 4); g.lineTo(62, 58); g.lineTo(2, 58); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.moveTo(36, 18); g.lineTo(26, 38); g.lineTo(34, 38); g.lineTo(28, 54); g.lineTo(42, 30); g.lineTo(34, 30); g.lineTo(40, 18); g.fill(); }),
  };
  // flat picture material (decals, signs, papers)
  function picMat(name, o) {
    return R3.mat('pic|' + name + JSON.stringify(o || {}), () => {
      const m = R3.std(Object.assign({ map: TEX[name](), roughness: 0.85, transparent: !!(o && o.transparent), alphaTest: o && o.alphaTest, depthWrite: !(o && o.transparent), polygonOffset: true, polygonOffsetFactor: -2, side: o && o.side }, o && o.extra));
      m.userData.noShadow = true; return m;
    });
  }
  function decalMat(name, color, opacity) {
    return R3.mat('decal|' + name + color + opacity, () => { const m = R3.std({ map: TEX[name](), color, roughness: 1, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }); m.userData.noShadow = true; return m; });
  }

  // ================================================================== particles (smoke / flames / sparks)
  function ptclMat(add, texName, color) {
    return R3.mat('ptcl|' + (add ? 'a' : 'n') + texName + color, () => {
      const m = add ? R3.glowMat({ map: TEX[texName](), color }) : R3.basic({ map: TEX[texName](), color, transparent: true, depthWrite: false });
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aAlpha; varying float vR3A;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvR3A = aAlpha;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vR3A;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vR3A;');
      };
      m.customProgramCacheKey = () => 'r3ptcl' + (add ? 'a' : 'n');
      m.userData.noShadow = true;
      return m;
    });
  }
  // o: { n, add, tex, color, speed (cycles/s), rise, spread, drift, wobble, s0, s1, alpha, fadeIn, seed, gravity }
  function Particles(o) {
    const n = o.n || 8;
    const geo = new THREE.PlaneGeometry(1, 1);
    const al = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    geo.setAttribute('aAlpha', al);
    const mesh = new THREE.InstancedMesh(geo, ptclMat(o.add, o.tex || 'puff', o.color == null ? 0xffffff : o.color), n);
    mesh.frustumCulled = false; mesh.renderOrder = o.add ? 7 : 6; mesh.castShadow = false;
    const sd = [];
    for (let i = 0; i < n; i++) sd.push([hashf(i, 1, o.seed || 0), hashf(i, 2, o.seed || 0), hashf(i, 3, o.seed || 0)]);
    const dm = new THREE.Object3D(), qi = new THREE.Quaternion(), qc = new THREE.Quaternion(), qr = new THREE.Quaternion(), ZA = new V3(0, 0, 1);
    return {
      mesh,
      update(t, rate, cam) {
        mesh.visible = rate > 0.01;
        if (!mesh.visible) return;
        if (mesh.parent) mesh.parent.getWorldQuaternion(qi); else qi.identity();
        qi.invert(); cam.getWorldQuaternion(qc); qi.multiply(qc);
        const w = R3.U.uWind.value, ws = 0.25 + w.z;
        for (let i = 0; i < n; i++) {
          const s = sd[i];
          const ph = ((t * (o.speed || 0.3)) * (0.85 + s[0] * 0.3) + i / n) % 1;
          const x = (s[1] - 0.5) * (o.spread || 0.1) + w.x * ws * ph * (o.drift || 0) + Math.sin(ph * 7 + i) * (o.wobble || 0) * ph;
          const z = (s[2] - 0.5) * (o.spread || 0.1) + w.y * ws * ph * (o.drift || 0) + Math.cos(ph * 5 + i * 2) * (o.wobble || 0) * ph;
          const y = ph * (o.rise || 1) - (o.gravity ? ph * ph * o.gravity : 0);
          const sc = (o.s0 || 0.2) + ((o.s1 || 0.6) - (o.s0 || 0.2)) * ph;
          dm.position.set(x, y, z);
          qr.setFromAxisAngle(ZA, s[0] * 6.28 + ph * (o.spin || 0.6));
          dm.quaternion.copy(qi).multiply(qr);
          dm.scale.set(sc * (o.aspect || 1), sc, sc);
          dm.updateMatrix(); mesh.setMatrixAt(i, dm.matrix);
          al.array[i] = (o.alpha || 0.4) * rate * Math.min(1, ph * (o.fadeIn || 5)) * Math.pow(1 - ph, o.fadeOut || 1);
        }
        mesh.instanceMatrix.needsUpdate = true; al.needsUpdate = true;
      },
    };
  }

  // ================================================================== object helpers
  function disposeObj(obj) {
    obj.traverse((c) => {
      if (c.geometry && !c.geometry.userData.shared) c.geometry.dispose();
      if (c.material && c.material.userData && c.material.userData.own) c.material.dispose();
    });
  }
  function result(obj, update) { return { obj, update, dispose: () => disposeObj(obj) }; }
  function addLightAt(ctx, obj, lx, ly, lz, l) {
    obj.updateWorldMatrix(true, false);
    _w.set(lx, ly, lz); obj.localToWorld(_w);
    l.x = _w.x; l.y = _w.y; l.z = _w.z;
    ctx.addLight(l);
  }
  const flick = (key) => (R3.Lights && R3.Lights.f ? R3.Lights.f(key) : 1);
  const night = () => 1 - daylight();

  // ------------------------------------------------------------ re-usable little models
  function backpack(k, body, top, s) {
    s = s || 1;
    k.geo(body, softBox(0.36 * s, 0.2 * s, 0.5 * s, 0.6), mtx([0, 0.1 * s, 0], [0, 0.2, 0]));
    k.geo(top, softBox(0.34 * s, 0.1 * s, 0.18 * s, 0.6), mtx([0.01, 0.17 * s, -0.2 * s], [0.1, 0.2, 0]));
    k.geo(body, softBox(0.24 * s, 0.1 * s, 0.22 * s, 0.6), mtx([0.03, 0.2 * s, 0.07 * s], [0, 0.2, 0]));
    const strap = MAT.plain(0x15161a, 0.7);
    k.box(strap, [0.04 * s, 0.03, 0.42 * s], [-0.08 * s, 0.015, 0.02], [0, 0.2, 0]);
    k.box(strap, [0.04 * s, 0.03, 0.42 * s], [0.1 * s, 0.015, -0.03], [0, 0.2, 0]);
    k.cyl(MAT.canvas(0x5a5a3a), 0.07 * s, 0.07 * s, 0.4 * s, [0, 0.07 * s, 0.32 * s], [0, 0.2, PI / 2], 10);
  }
  function sack(k, mat, s) {
    k.geo(mat, softBox(0.42 * s, 0.32 * s, 0.36 * s, 0.75), mtx([0, 0.15 * s, 0], [0, 0.4, 0]));
    k.cyl(mat, 0.05 * s, 0.08 * s, 0.12 * s, [0, 0.33 * s, 0], [0, 0, 0.1], 8);
    k.cyl(MAT.plain(0x8a7a5a, 0.9), 0.055 * s, 0.055 * s, 0.03, [0, 0.31 * s, 0], [0, 0, 0.1], 8);
  }
  // open-topped box (crate/chest body) of size w,h,d with wall thickness t
  function openBox(k, mat, w, h, d, t, inner) {
    k.box(mat, [w, t, d], [0, t / 2, 0]);
    k.box(mat, [w, h, t], [0, h / 2, d / 2 - t / 2]); k.box(mat, [w, h, t], [0, h / 2, -d / 2 + t / 2]);
    k.box(mat, [t, h, d - 2 * t], [w / 2 - t / 2, h / 2, 0]); k.box(mat, [t, h, d - 2 * t], [-w / 2 + t / 2, h / 2, 0]);
    if (inner) k.box(inner, [w - 2 * t - 0.002, 0.004, d - 2 * t - 0.002], [0, t + 0.002, 0]);
  }
  // hinged lid: returns a pivot group at the back top edge; set pivot.rotation.x = -angle to open
  function lidOn(group, buildLid, w, h, d) {
    const piv = new THREE.Group(); piv.position.set(0, h, -d / 2);
    const k = new Kit(); buildLid(k); const lg = k.build(); lg.position.set(0, 0, d / 2); piv.add(lg);
    group.add(piv); return piv;
  }
  // a standing dead snag with crooked branches
  function snag(k, mat, h, r, seed, opts) {
    opts = opts || {};
    const rnd = U.rng(seed);
    let px = 0, pz = 0, y = 0, rr = r * 1.25;
    const segs = 5;
    for (let i = 0; i < segs; i++) {
      const y1 = h * (i + 1) / segs, nx = px + (rnd() - 0.5) * 0.18, nz = pz + (rnd() - 0.5) * 0.18, r1 = r * (1 - (i + 1) / segs * 0.75);
      k.limb(mat, [px, y, pz], [nx, y1, nz], rr, r1, 9);
      if (i >= 1 && !opts.bare) {
        const nb = 1 + Math.floor(rnd() * 2);
        for (let j = 0; j < nb; j++) {
          const a = rnd() * 6.28, up = 0.3 + rnd() * 0.6, L = (0.5 + rnd() * 0.9) * (1 - i / segs * 0.5) * (opts.spread || 1);
          const bx = px + Math.cos(a) * L, bz = pz + Math.sin(a) * L, by = y1 - 0.1 + up * L;
          k.limb(mat, [px, y1 - 0.15, pz], [bx, by, bz], r1 * 0.55, r1 * 0.15, 6);
          if (rnd() < 0.7) { const a2 = a + (rnd() - 0.5) * 1.6, L2 = L * 0.5; k.limb(mat, [bx, by, bz], [bx + Math.cos(a2) * L2, by + L2 * 0.5, bz + Math.sin(a2) * L2], r1 * 0.15, r1 * 0.05, 5); }
          if (opts.tips) opts.tips.push([bx, by, bz]);
        }
      }
      px = nx; pz = nz; y = y1; rr = r1;
    }
    if (opts.broken) k.limb(mat, [px, y, pz], [px + 0.05, y + 0.25, pz - 0.04], rr, 0.01, 7);
    return [px, y, pz];
  }
  // fire ring of stones + ash + charred logs; burning adds embers material
  function fireRing(k, n, R, seed, embers) {
    const rnd = U.rng(seed);
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.28 + rnd() * 0.2;
      k.geo(MAT.rock({ snowTop: 0.6 }), rockGeo(seed + i, 0.13 + rnd() * 0.05, 0.11, 0.12, 0.4, 1), mtx([Math.cos(a) * R, 0.06, Math.sin(a) * R], [0, rnd() * 6, 0]));
    }
    k.geo(MAT.ash({ snowTop: 0 }), new THREE.CircleGeometry(R * 0.85, 14), mtx([0, 0.015, 0], [-PI / 2, 0, 0]));
    const ch = MAT.plain(0x161210, 0.95);
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.3; k.log(ch, null, 0.42, 0.04, [Math.cos(a) * 0.06, 0.06 + i * 0.015, Math.sin(a) * 0.06], a, 0.12); }
    if (embers) for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, r = rnd() * R * 0.5; k.geo(embers, rockGeo(i + 3, 0.05, 0.03, 0.04, 0.3, 0), mtx([Math.cos(a) * r, 0.03, Math.sin(a) * r])); }
  }
  // flames + sparks + smoke for a fire at y0; returns updater(t, k, cam)
  function fireFx(group, y0, scale, seed) {
    const fl = Particles({ n: 10, add: true, tex: 'flame', color: 0xffb070, speed: 1.6, rise: 0.45 * scale, spread: 0.18 * scale, s0: 0.32 * scale, s1: 0.12 * scale, alpha: 0.9, fadeIn: 8, aspect: 0.6, spin: 0.2, seed });
    const sp = Particles({ n: 6, add: true, tex: 'glow', color: 0xffa040, speed: 0.7, rise: 1.4 * scale, spread: 0.3, wobble: 0.15, s0: 0.035, s1: 0.015, alpha: 1, seed: seed + 1 });
    const sm = Particles({ n: 8, tex: 'puff', color: 0x9a9ca4, speed: 0.22, rise: 2.4 * scale, spread: 0.15, drift: 1.2, wobble: 0.2, s0: 0.3 * scale, s1: 1.4 * scale, alpha: 0.35, seed: seed + 2 });
    [fl, sp, sm].forEach((p) => { p.mesh.position.y = y0; group.add(p.mesh); });
    return (t, k, cam) => { fl.update(t, k, cam); sp.update(t, k, cam); sm.update(t, Math.min(1, k * 1.2), cam); };
  }
  // footprint decals along a list of local points [x, z, yaw, scale]
  function prints(k, pts, areaId, base, texName, color, opacity) {
    const mat = decalMat(texName || 'print', color == null ? 0x2a3444 : color, opacity == null ? 0.45 : opacity);
    const gb = base ? R3.groundAt(base.x, base.z, areaId) : 0;
    pts.forEach(([x, z, yaw, s]) => {
      const gy = base ? R3.groundAt(base.x + x, base.z + z, areaId) - gb : 0;
      const g = new THREE.PlaneGeometry(0.13 * (s || 1), 0.28 * (s || 1));
      k.geo(mat, g, mtx([x, gy + 0.012, z], [-PI / 2, 0, -(yaw || 0)], null));
    });
  }

  // ================================================================== STRUCTURES
  const S = {};
  // ---------------------------------------------------------------- fire tower
  function towerCab() { // the cab footprint (world) from the in_tower interior map
    const o = R3.areaOrigin('in_tower');
    return { x0: o.x + 16 * K, x1: o.x + 240 * K, z0: o.z + 32 * K, z1: o.z + 160 * K, y: o.y, H: 2.6 };
  }
  // a wall run with a window band. A, B: [x, z] local; n: inward normal [nx, nz]; body extends outward.
  function wallFrame(A, B, n) {
    const dx = n[1], dz = -n[0];
    let s = A, e = B; if ((B[0] - A[0]) * dx + (B[1] - A[1]) * dz < 0) { s = B; e = A; }
    const len = Math.hypot(e[0] - s[0], e[1] - s[1]);
    const m = new THREE.Matrix4().makeBasis(new V3(dx, 0, dz), new V3(0, 1, 0), new V3(n[0], 0, n[1])).setPosition(s[0], 0, s[1]);
    return { m, len };
  }
  function windowWall(k, mats, A, B, n, o) {
    const f = wallFrame(A, B, n), L = f.len, t = o.thick, b = f.m.clone().premultiply(mtx([0, o.y0 || 0, 0]));
    if (L < 0.01) return;
    k.box(mats.wall, [L + (o.ext || 0) * 2, o.sill, t], [L / 2, o.sill / 2, -t / 2], null, b);
    k.box(mats.wall, [L + (o.ext || 0) * 2, o.h - o.head, t], [L / 2, (o.h + o.head) / 2, -t / 2], null, b);
    const nP = Math.max(1, Math.round(L / o.pane));
    for (let i = 0; i <= nP; i++) k.box(mats.frame, [0.08, o.head - o.sill, t + 0.03], [clamp(i * L / nP, 0.04, L - 0.04), (o.sill + o.head) / 2, -t / 2], null, b);
    k.box(mats.frame, [L, 0.05, t + 0.1], [L / 2, o.sill + 0.02, -t / 2], null, b);
    k.box(mats.frame, [L, 0.04, t + 0.03], [L / 2, (o.sill + o.head) / 2 + 0.05, -t / 2], null, b);
    k.box(mats.glass, [L, o.head - o.sill, 0.012], [L / 2, (o.sill + o.head) / 2, -t / 2], null, b);
  }
  S.firetower = function (o, areaId) {
    const grp = new THREE.Group();
    const P = R3.toWorld(areaId, o.x, o.y); grp.position.copy(P); grp.userData.placed = true;
    const C = towerCab(), H = C.y - P.y;
    const x0 = C.x0 - P.x, x1 = C.x1 - P.x, z0 = C.z0 - P.z, z1 = C.z1 - P.z, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const tim = MAT.timber(), dk = MAT.dark(), k = new Kit();
    // four legs, leaning slightly outward, heavy timber
    const legs = [[-2.2, -0.25, -3.0, z1 - 0.5], [2.2, -0.25, 3.0, z1 - 0.5], [-2.2, -4.9, -3.0, z0 + 0.6], [2.2, -4.9, 3.0, z0 + 0.6]];
    const legAt = (L, y) => { const f = y / H; return [L[0] + (L[2] - L[0]) * f, y, L[1] + (L[3] - L[1]) * f]; };
    legs.forEach((L) => { k.beam(tim, [L[0], -0.3, L[1]], [L[2], H - 0.25, L[3]], 0.24); k.box(MAT.stoneWall(), [0.6, 0.35, 0.6], [L[0], 0.1, L[1]]); });
    const lv = [0.6, 3.2, 5.8, 8.4, H - 0.4];
    const faces = [[0, 1], [2, 3], [0, 2], [1, 3]];
    lv.forEach((y, li) => faces.forEach(([a, b]) => {
      k.beam(dk, legAt(legs[a], y), legAt(legs[b], y), 0.12, 0.16);
      if (li < lv.length - 1) { const y2 = lv[li + 1]; k.beam(dk, legAt(legs[a], y + 0.1), legAt(legs[b], y2 - 0.1), 0.09, 0.05); k.beam(dk, legAt(legs[b], y + 0.1), legAt(legs[a], y2 - 0.1), 0.09, 0.05); }
    }));
    // knee braces out to the cab corners + floor joists
    [[x0, z0, 2], [x1, z0, 3], [x0, z1, 0], [x1, z1, 1]].forEach(([x, z, li]) => k.beam(tim, legAt(legs[li], H - 3.2), [x * 0.98, H - 0.35, z], 0.14));
    for (let i = 0; i <= 5; i++) { const x = x0 + (x1 - x0) * i / 5; k.box(tim, [0.14, 0.22, z1 - z0 + 0.8], [x, H - 0.3, cz]); }
    k.box(dk, [x1 - x0 + 1.4, 0.18, 0.18], [cx, H - 0.5, z0 - 0.2]); k.box(dk, [x1 - x0 + 1.4, 0.18, 0.18], [cx, H - 0.5, z1 + 0.2]);
    // floor deck + catwalk with railing
    k.box(MAT.boards(), [x1 - x0 + 1.4, 0.12, z1 - z0 + 1.4], [cx, H - 0.08, cz]);
    const rail = (a, b) => { k.beam(tim, [a[0], H + 1.0, a[1]], [b[0], H + 1.0, b[1]], 0.07, 0.1); k.beam(tim, [a[0], H + 0.5, a[1]], [b[0], H + 0.5, b[1]], 0.05, 0.06); };
    const rx0 = x0 - 0.66, rx1 = x1 + 0.66, rz0 = z0 - 0.66, rz1 = z1 + 0.66;
    rail([rx0, rz0], [rx1, rz0]); rail([rx0, rz1], [rx1, rz1]); rail([rx0, rz0], [rx0, rz1]); rail([rx1, rz0], [rx1, rz1]);
    for (let x = rx0; x <= rx1 + 0.01; x += (rx1 - rx0) / 8) { k.box(tim, [0.08, 1.05, 0.08], [x, H + 0.5, rz0]); k.box(tim, [0.08, 1.05, 0.08], [x, H + 0.5, rz1]); }
    for (let z = rz0; z <= rz1 + 0.01; z += (rz1 - rz0) / 4) { k.box(tim, [0.08, 1.05, 0.08], [rx0, H + 0.5, z]); k.box(tim, [0.08, 1.05, 0.08], [rx1, H + 0.5, z]); }
    // ladder up the south face to the hatch, with a landing
    const lb = [0, 0, 1.3], lt = [0, H - 0.1, (z1 - 0.4)];
    [-0.24, 0.24].forEach((dx) => k.beam(tim, [lb[0] + dx, lb[1] - 0.2, lb[2]], [lt[0] + dx, lt[1] + 1.1, lt[2] - 0.05], 0.06, 0.09));
    const steps = Math.floor(H / 0.32);
    for (let i = 1; i < steps; i++) { const f = i / steps, y = lb[1] + (lt[1] - lb[1]) * f, z = lb[2] + (lt[2] - lb[2]) * f; if (i % 11 === 7) continue; k.box(dk, [0.5, 0.04, 0.05], [0, y, z]); }
    k.box(MAT.boards(), [1.4, 0.08, 1.2], [0, 5.8, -0.6]);
    k.box(tim, [1.4, 0.07, 0.07], [0, 6.75, -1.2]);
    // carved names on a leg are only in the text; a rusted sign plate
    k.box(MAT.paint(0x6a2a20), [0.5, 0.3, 0.02], [-2.05, 1.6, -0.12], [0, 0, 0.03]);
    k.build({ into: grp });
    // cab shell (hidden from inside the cab: the interior builds its own walls)
    const cab = new THREE.Group(), kc = new Kit();
    const mats = { wall: MAT.boards({ snowTop: 0 }), frame: MAT.timber({ snowTop: 0 }), glass: MAT.glass() };
    const wo = { h: C.H, sill: 0.95, head: 2.15, thick: 0.12, pane: 1.2, y0: H };
    windowWall(kc, mats, [x0, z0], [x1, z0], [0, 1], wo); windowWall(kc, mats, [x0, z1], [x1, z1], [0, -1], wo);
    windowWall(kc, mats, [x0, z0], [x0, z1], [1, 0], wo); windowWall(kc, mats, [x1, z0], [x1, z1], [-1, 0], wo);
    [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].forEach(([x, z]) => kc.box(mats.frame, [0.2, C.H, 0.2], [x + (x < cx ? -0.06 : 0.06), H + C.H / 2, z + (z < cz ? -0.06 : 0.06)]));
    kc.build({ into: cab });
    grp.add(cab);
    // hipped roof with a deep overhang, lightning rod
    const kr = new Kit();
    const rw = (x1 - x0) / 2 + 0.75, rd = (z1 - z0) / 2 + 0.75;
    const cone = new THREE.ConeGeometry(1, 1.5, 4, 1); cone.rotateY(PI / 4);
    kr.geo(MAT.roof(), cone, mtx([cx, H + C.H + 0.75, cz], null, [rw * Math.SQRT2, 1, rd * Math.SQRT2]), 'm');
    kr.box(mats.frame, [rw * 2, 0.12, rd * 2], [cx, H + C.H + 0.02, cz]);
    kr.cyl(MAT.metal(), 0.012, 0.012, 1.2, [cx, H + C.H + 2.0, cz], null, 5);
    kr.build({ into: grp });
    return result(grp, (dt, ob, ctx) => { cab.visible = !(ctx.area && ctx.area.id === 'in_tower'); });
  };
  // ---------------------------------------------------------------- relay mast
  S.mast = function () {
    const grp = new THREE.Group(), k = new Kit();
    const stl = MAT.paint(0x8a8e92, { snowTop: 0.4 }), H = 17;
    const legs = [0, 1, 2].map((i) => { const a = i / 3 * 6.28 + 0.4; return [Math.cos(a), Math.sin(a)]; });
    const R = (y) => 1.2 - (y / H) * 0.85;
    const pt = (i, y) => [legs[i][0] * R(y), y, legs[i][1] * R(y) - 0.25];
    for (let i = 0; i < 3; i++) k.limb(stl, pt(i, 0), pt(i, H), 0.05, 0.035, 6);
    for (let y = 0, s = 0; y < H - 0.5; y += 1.4, s++) for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      k.limb(stl, pt(i, y + 1.4), pt(j, y + 1.4), 0.015, 0.015, 4);
      k.limb(stl, pt(i, y), pt(j, y + 1.4), 0.012, 0.012, 4);
    }
    // antenna panels and a dish
    for (let i = 0; i < 3; i++) { const a = i / 3 * 6.28 + 1.4; k.box(MAT.paint(0xc8c8c0, { snowTop: 0.3 }), [0.28, 1.0, 0.08], [Math.cos(a) * 0.45, H - 1.2, Math.sin(a) * 0.45 - 0.25], [0, -a + PI / 2, 0]); }
    const dish = new THREE.SphereGeometry(0.45, 14, 6, 0, 6.28, 0, 0.9); dish.rotateX(PI / 2);
    k.geo(MAT.paint(0xd0d0c8, { snowTop: 0.3 }), dish, mtx([0.35, H - 3.2, 0.2], [0, 0.7, 0]));
    k.limb(stl, [0, H, -0.25], [0, H + 1.6, -0.25], 0.03, 0.015, 5);
    // concrete pads and guy anchors
    for (let i = 0; i < 3; i++) k.box(MAT.stoneWall(), [0.35, 0.2, 0.35], [pt(i, 0)[0], 0.05, pt(i, 0)[2]]);
    // equipment hut
    const hx = 2.3, hz = -1.4, ply = MAT.paint(0x4a5a4a, { snowTop: 0.7 });
    k.box(ply, [2.0, 2.0, 1.8], [hx, 1.0, hz]);
    k.box(MAT.metal({ snowTop: 1 }), [2.3, 0.08, 2.1], [hx, 2.08, hz], [0.06, 0, 0]);
    k.box(MAT.paint(0x2e3a30), [0.8, 1.7, 0.04], [hx - 0.3, 0.9, hz + 0.91]);
    k.box(MAT.metal(), [0.05, 0.05, 0.05], [hx - 0.0, 0.95, hz + 0.94]);
    k.box(MAT.paint(0xb8b090), [0.3, 0.2, 0.01], [hx + 0.5, 1.5, hz + 0.91]);
    k.cyl(MAT.metal(), 0.03, 0.03, 2.3, [hx - 1.1, 1.9, hz], [0, 0, PI / 2 - 0.25], 6);
    k.build({ into: grp });
    // blinking red beacon
    const lampMat = glowStd(0x400000, 0xff2010, 0);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), lampMat); lamp.position.set(0, H + 1.65, -0.25); grp.add(lamp);
    return result(grp, (dt, ob, ctx) => {
      const on = Math.sin(ctx.t * 3) > 0;
      lampMat.emissiveIntensity = on ? 4 : 0.15;
      if (on) addLightAt(ctx, grp, 0, H + 1.65, -0.25, { key: 'mast', color: [1, 0.08, 0.04], intensity: 2.5, range: 6, glow: 1.6, glowIntensity: 1.4 });
    });
  };
  // ---------------------------------------------------------------- deadfall logs
  S.log = function (o) {
    const grp = new THREE.Group(), k = new Kit(), rnd = rngOf('log', o.x, o.y);
    const len = 2.4 + rnd() * 0.6, r = 0.3 + rnd() * 0.12, tilt = (rnd() - 0.5) * 0.3, bark = MAT.bark();
    k.log(bark, MAT.logEnd(), len, r, [0, r * 0.85, -0.22], tilt, (rnd() - 0.5) * 0.06);
    // splintered root end and branch stubs
    const ex = Math.cos(tilt) * len / 2, ez = -Math.sin(tilt) * len / 2;
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; k.limb(MAT.deadBark(), [ex, r * 0.85 + Math.sin(a) * r * 0.6, -0.22 + ez + Math.cos(a) * r * 0.6], [ex + 0.25 + rnd() * 0.3, r * 0.85 + Math.sin(a) * r * 1.4, -0.22 + ez + Math.cos(a) * r * 1.4], r * 0.22, 0.02, 5); }
    for (let i = 0; i < 4; i++) { const f = (rnd() - 0.5) * 0.8 * len, a = rnd() * 6.28; const px = Math.cos(tilt) * f, pz = -Math.sin(tilt) * f - 0.22; k.limb(MAT.deadBark(), [px, r * 0.85, pz], [px + Math.cos(a) * 0.15, r * 0.85 + Math.abs(Math.sin(a)) * 0.6 + 0.2, pz + Math.sin(a) * 0.5], r * 0.18, 0.02, 5); }
    // moss pads
    k.geo(TM('moss', { snowTop: 0.9 }), softBox(0.5, 0.06, 0.3, 0.8), mtx([-0.3, r * 1.62, -0.25], [0, tilt, 0]));
    k.build({ into: grp });
    return result(grp);
  };
  // ---------------------------------------------------------------- stone circle
  S.standing = function (o) {
    const grp = new THREE.Group(), k = new Kit(), rnd = rngOf('st', o.x, o.y);
    const h = 1.3 + rnd() * 0.5;
    k.geo(MAT.lichen(), rockGeo(o.x + o.y, 0.3, h / 2, 0.18, 0.22, 2), mtx([0, h / 2 - 0.05, -0.15], [(rnd() - 0.5) * 0.1, 0, (rnd() - 0.5) * 0.12]));
    // a carved mark on the face toward the circle
    k.box(MAT.plain(0x1a1a1c, 1), [0.12, 0.02, 0.01], [0, h * 0.6, 0.03]); k.box(MAT.plain(0x1a1a1c, 1), [0.02, 0.16, 0.01], [0, h * 0.55, 0.03]);
    k.build({ into: grp });
    // face the altar
    const cx = 21 * TS, cy = 4.5 * TS + 10;
    grp.children.forEach((c) => { c.rotation.y = Math.atan2(cx - o.x, cy - o.y); });
    return result(grp);
  };
  S.altar = function (o) {
    const grp = new THREE.Group(), k = new Kit();
    k.geo(MAT.rock(), rockGeo(91, 0.55, 0.32, 0.32, 0.12, 2), mtx([0, 0.3, -0.15]));
    k.geo(MAT.rock(), rockGeo(92, 0.2, 0.25, 0.2, 0.2, 1), mtx([-0.32, 0.18, -0.12]));
    k.geo(MAT.rock(), rockGeo(93, 0.2, 0.25, 0.2, 0.2, 1), mtx([0.34, 0.18, -0.16]));
    const stain = R3.mat('altarStain', () => { const m = R3.std({ color: 0x3a0a08, roughness: 0.35, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -3 }); m.userData.noShadow = true; return m; });
    const sg = new THREE.CircleGeometry(0.22, 12); sg.scale(1.3, 1, 1);
    k.geo(stain, sg, mtx([0.04, 0.6, -0.14], [-PI / 2, 0, 0.4]));
    // scratched lantern, crossed out
    const sc = MAT.plain(0xb0a890, 0.9);
    k.box(sc, [0.1, 0.005, 0.14], [-0.3, 0.6, -0.12]); k.box(sc, [0.26, 0.005, 0.015], [-0.3, 0.602, -0.12], [0, 0.8, 0]); k.box(sc, [0.26, 0.005, 0.015], [-0.3, 0.602, -0.12], [0, -0.8, 0]);
    k.build({ into: grp });
    return result(grp);
  };
  // ---------------------------------------------------------------- Hollow Mine entrance
  const placesMod = () => { const s = st(); return (s && s.mods && s.mods.places) || {}; };
  S.mine = function () {
    const grp = new THREE.Group(), k = new Kit();
    const rk = MAT.rock({ snowTop: 1 });
    // rock masses around and over the adit
    [[-3.2, 1.6, -2.2, 2.6, 2.1, 2.4, 1], [3.4, 1.4, -2.3, 2.6, 1.9, 2.4, 2], [0.2, 3.8, -2.9, 2.6, 1.5, 2.6, 3], [0, 2.4, -5.2, 4.2, 2.6, 2.4, 4], [-5.2, 0.7, -3, 1.6, 1.2, 1.8, 5], [5.4, 0.6, -3.4, 1.8, 1.1, 1.8, 6], [1.5, 0.35, 0.4, 0.5, 0.35, 0.4, 7], [-2.1, 0.3, 0.6, 0.4, 0.3, 0.35, 8]].forEach(([x, y, z, sx, sy, sz, s]) => k.geo(rk, rockGeo(s * 13, sx, sy, sz, 0.35, 2), mtx([x, y, z])));
    // the adit: stone headwall, timber set, dark tunnel
    const hw = MAT.stoneWall();
    k.box(hw, [1.2, 3.0, 1.2], [-1.55, 1.3, -0.75]); k.box(hw, [1.2, 3.0, 1.2], [1.55, 1.3, -0.75]); k.box(hw, [4.3, 1.1, 1.3], [0, 3.05, -0.8]);
    const tim = MAT.timber();
    k.box(tim, [0.28, 2.5, 0.28], [-0.92, 1.25, -0.1], [0, 0, 0.04]); k.box(tim, [0.28, 2.5, 0.28], [0.92, 1.25, -0.1], [0, 0, -0.04]);
    k.box(tim, [2.4, 0.32, 0.34], [0, 2.6, -0.1]);
    for (let i = 0; i < 4; i++) k.box(tim, [1.7, 0.08, 0.2], [0, 2.38, -0.6 - i * 0.7]);
    const vm = MAT.voidMat();
    k.box(vm, [1.6, 2.4, 6], [0, 1.2, -3.2]);
    k.geo(MAT.black(), new THREE.PlaneGeometry(1.6, 2.4), mtx([0, 1.2, -5.0]));
    // rails out of the mouth
    const rail = MAT.rust({ snowTop: 0.3 });
    for (let z = -3; z < 1.6; z += 0.55) k.box(MAT.dark(), [1.1, 0.07, 0.14], [0, 0.03, z]);
    [-0.3, 0.3].forEach((x) => k.box(rail, [0.05, 0.06, 4.8], [x, 0.09, -0.7]));
    k.build({ into: grp });
    // boards: nailed across (closed) or pried loose (open)
    const kb = new Kit(), bw = MAT.boards();
    [[0.9, 0.25], [1.5, -0.18], [2.0, 0.1]].forEach(([y, a]) => kb.box(bw, [2.0, 0.22, 0.04], [0, y, 0.08], [0, 0, a]));
    kb.box(MAT.paint(0xa8a090, { snowTop: 0 }), [0.5, 0.3, 0.01], [0.3, 1.25, 0.11], [0, 0, -0.05]);
    const closed = kb.build();
    const ko = new Kit();
    ko.box(bw, [2.0, 0.22, 0.04], [0.15, 1.95, 0.08], [0, 0, 0.35]);
    ko.box(bw, [2.0, 0.22, 0.04], [-0.7, 0.04, 0.8], [PI / 2, 0, 0.5]); ko.box(bw, [1.6, 0.22, 0.04], [0.8, 0.07, 0.9], [PI / 2, 0, -0.3]);
    const open = ko.build();
    grp.add(closed, open);
    return result(grp, () => { const o = !!placesMod().boards; closed.visible = !o; open.visible = o; });
  };
  S.cart = function () {
    const grp = new THREE.Group(), k = new Kit();
    cartModel(k, true);
    k.build({ into: grp });
    grp.children.forEach((c) => { c.rotation.y = 0.25; });
    return result(grp);
  };
  function cartModel(k, rails) {
    const rs = MAT.rust({ snowTop: 0.8 });
    const body = new THREE.CylinderGeometry(0.55, 0.42, 0.55, 4, 1, true); body.rotateY(PI / 4); body.scale(1.35, 1, 0.9);
    k.geo(rs, body, mtx([0, 0.62, -0.2]), 'm');
    k.box(rs, [0.75, 0.04, 0.5], [0, 0.36, -0.2]);
    k.box(MAT.iron(), [1.1, 0.06, 0.06], [0, 0.9, 0.12]); k.box(MAT.iron(), [1.1, 0.06, 0.06], [0, 0.9, -0.52]);
    [[-0.32, 0.08], [0.32, 0.08], [-0.32, -0.48], [0.32, -0.48]].forEach(([x, z]) => k.cyl(MAT.iron(), 0.16, 0.16, 0.06, [x, 0.16, z], [PI / 2, 0, 0], 12));
    for (let i = 0; i < 6; i++) k.geo(MAT.rock({ snowTop: 0.9 }), rockGeo(i + 40, 0.14, 0.1, 0.12, 0.4, 1), mtx([(i % 3 - 1) * 0.22, 0.85, -0.2 + (i > 2 ? 0.12 : -0.12)]));
    if (rails) {
      for (let x = -1.4; x <= 1.4; x += 0.55) k.box(MAT.dark(), [0.14, 0.07, 1.0], [x, 0.03, -0.2]);
      [0.08, -0.48].forEach((z) => k.box(MAT.rust({ snowTop: 0.3 }), [3.0, 0.06, 0.05], [0, 0.09, z]));
    }
  }
  // ---------------------------------------------------------------- trapper's shack
  const shackLit = () => { const m = placesMod(); let g = false; try { g = !!(NW.Characters && NW.Characters.present && NW.Characters.present('garrow')); } catch (e) { g = false; } return (m.shackFuel || 0) > 0 || g; };
  S.shack = function () {
    const grp = new THREE.Group(), k = new Kit();
    const W2 = 1.95, Dz = 3.6, Hh = 2.1, lr = 0.13, lw = MAT.log(), le = MAT.logEnd();
    // log walls (alternating overlaps at the corners)
    for (let i = 0, y = lr; y < Hh; i++, y += lr * 1.8) {
      k.log(lw, le, W2 * 2 + 0.5, lr, [0, y + (i % 2 ? lr * 0.9 : 0), 0], 0);
      k.log(lw, le, W2 * 2 + 0.5, lr, [0, y + (i % 2 ? lr * 0.9 : 0), -Dz], 0);
      k.log(lw, le, Dz + 0.5, lr, [-W2, y + (i % 2 ? 0 : lr * 0.9), -Dz / 2], PI / 2);
      k.log(lw, le, Dz + 0.5, lr, [W2, y + (i % 2 ? 0 : lr * 0.9), -Dz / 2], PI / 2);
    }
    // chinking cores
    k.box(MAT.chink(), [W2 * 2 - 0.1, Hh, 0.1], [0, Hh / 2, 0]); k.box(MAT.chink(), [W2 * 2 - 0.1, Hh, 0.1], [0, Hh / 2, -Dz]);
    k.box(MAT.chink(), [0.1, Hh, Dz], [-W2, Hh / 2, -Dz / 2]); k.box(MAT.chink(), [0.1, Hh, Dz], [W2, Hh / 2, -Dz / 2]);
    // gables (vertical boards) and roof (ridge runs front to back)
    const gab = new THREE.Shape(); gab.moveTo(-W2, 0); gab.lineTo(W2, 0); gab.lineTo(0, 1.25); gab.lineTo(-W2, 0);
    const gg = new THREE.ExtrudeGeometry(gab, { depth: 0.08, bevelEnabled: false });
    k.geo(MAT.boards(), gg.clone(), mtx([0, Hh, 0.02]), 'm'); k.geo(MAT.boards(), gg, mtx([0, Hh, -Dz - 0.1]), 'm');
    const pitch = Math.atan2(1.25, W2), sl = Math.hypot(W2, 1.25) + 0.45;
    [-1, 1].forEach((s) => {
      k.box(MAT.roof(), [sl, 0.08, Dz + 1.0], [s * (sl / 2 - 0.02) * Math.cos(pitch), Hh + 1.25 - (sl / 2) * Math.sin(pitch) + 0.08, -Dz / 2], [0, 0, -s * pitch]);
    });
    k.box(MAT.timber(), [0.14, 0.14, Dz + 1.1], [0, Hh + 1.3, -Dz / 2]);
    // door, frame, small windows, step
    k.box(MAT.timber({ snowTop: 0 }), [0.12, 1.95, 0.16], [-0.5, 0.98, 0.1]); k.box(MAT.timber({ snowTop: 0 }), [0.12, 1.95, 0.16], [0.5, 0.98, 0.1]); k.box(MAT.timber(), [1.15, 0.14, 0.18], [0, 1.98, 0.1]);
    k.box(MAT.boards({ snowTop: 0 }), [0.88, 1.88, 0.06], [0, 0.95, 0.13]);
    k.box(MAT.dark(), [0.88, 0.1, 0.03], [0, 1.5, 0.17]); k.box(MAT.dark(), [0.88, 0.1, 0.03], [0, 0.45, 0.17]); k.box(MAT.dark(), [0.1, 1.2, 0.03], [0, 0.98, 0.17], [0, 0, 0.62]);
    k.box(MAT.iron(), [0.04, 0.12, 0.05], [0.35, 1.0, 0.18]);
    k.box(MAT.timber(), [1.3, 0.16, 0.6], [0, 0.06, 0.45]);
    // the antlers over the door
    const bone = MAT.plain(0xcfc4a8, 0.6);
    [-1, 1].forEach((s) => { k.limb(bone, [0, 2.15, 0.22], [s * 0.3, 2.4, 0.25], 0.025, 0.015, 5); k.limb(bone, [s * 0.3, 2.4, 0.25], [s * 0.45, 2.62, 0.2], 0.015, 0.006, 5); k.limb(bone, [s * 0.22, 2.33, 0.24], [s * 0.2, 2.55, 0.3], 0.012, 0.005, 4); });
    // woodpile against the west wall
    for (let i = 0; i < 12; i++) k.log(MAT.bark(), le, 0.5, 0.07, [-W2 - 0.35 - (i % 2) * 0.01, 0.08 + Math.floor(i / 4) * 0.14, -0.8 - (i % 4) * 0.15], PI / 2);
    // stovepipe
    k.cyl(MAT.iron(), 0.08, 0.08, 1.2, [-1.0, Hh + 1.2, -2.2], null, 10);
    k.cyl(MAT.iron(), 0.12, 0.12, 0.08, [-1.0, Hh + 1.8, -2.2], null, 10);
    k.build({ into: grp });
    // window panes: dark by day, warm glow when the stove burns at night
    const winMat = R3.mat('shackWin', () => { const m = R3.std({ color: 0x0a0c10, roughness: 0.1, emissive: 0xff8a3a, emissiveIntensity: 0 }); m.userData.noShadow = true; return m; });
    const kw = new Kit();
    [-1.25, 1.25].forEach((x) => { kw.box(winMat, [0.55, 0.42, 0.03], [x, 1.25, 0.16]); kw.box(MAT.timber({ snowTop: 0 }), [0.68, 0.06, 0.08], [x, 1.03, 0.18]); kw.box(MAT.timber({ snowTop: 0 }), [0.04, 0.42, 0.05], [x, 1.25, 0.18]); kw.box(MAT.timber({ snowTop: 0 }), [0.68, 0.05, 0.06], [x, 1.47, 0.18]); });
    kw.build({ into: grp });
    const smoke = Particles({ n: 10, tex: 'puff', color: 0xa9adb6, speed: 0.13, rise: 3.2, spread: 0.12, drift: 2.2, wobble: 0.25, s0: 0.25, s1: 1.6, alpha: 0.45, seed: 31 });
    smoke.mesh.position.set(-1.0, Hh + 1.85, -2.2); grp.add(smoke.mesh);
    return result(grp, (dt, ob, ctx) => {
      const lit = shackLit(), nk = night();
      smoke.update(ctx.t, lit ? 1 : 0, ctx.cam);
      winMat.emissiveIntensity = lit ? 0.4 + nk * 2.2 * flick('shackwin') : 0;
      if (lit && nk > 0.35) addLightAt(ctx, grp, 0, 1.2, 1.0, { key: 'shackwin', color: [1, 0.55, 0.25], intensity: 2.2 * nk, range: 5, flicker: 'fire', seed: 3 });
    });
  };
  S.pelts = function () {
    const grp = new THREE.Group(), k = new Kit(), tim = MAT.timber();
    k.box(tim, [0.09, 1.7, 0.09], [-0.55, 0.85, -0.15], [0, 0, 0.04]); k.box(tim, [0.09, 1.7, 0.09], [0.55, 0.85, -0.15], [0, 0, -0.04]);
    k.box(tim, [1.4, 0.08, 0.08], [0, 1.66, -0.15]);
    const hoop = MAT.plain(0x5a4028, 0.9);
    [[-0.27, 0x6e5034, 1.0], [0.27, 0x8a8478, 0.9]].forEach(([x, c, s]) => {
      k.geo(hoop, new THREE.TorusGeometry(0.24 * s, 0.015, 5, 18), mtx([x, 1.18, -0.13], null, [1, 1.25, 1]));
      const hide = new THREE.CircleGeometry(0.22 * s, 16); hide.scale(1, 1.25, 1);
      k.geo(MAT.fur(c), hide, mtx([x, 1.18, -0.13]));
      k.geo(MAT.fur(c), hide.clone(), mtx([x, 1.18, -0.14], [0, PI, 0]));
      k.limb(MAT.plain(0x2a2a20, 0.9), [x, 1.62, -0.13], [x, 1.47, -0.13], 0.004, 0.004, 3);
    });
    k.build({ into: grp });
    return result(grp);
  };
  S.blind = function () {
    const grp = new THREE.Group(), k = new Kit(), tim = MAT.timber(), H = 2.5;
    [[-0.72, 0], [0.72, 0], [-0.72, -1.2], [0.72, -1.2]].forEach(([x, z]) => k.box(tim, [0.12, H, 0.12], [x, H / 2, z]));
    k.beam(tim, [-0.72, 0.2, 0], [0.72, H - 0.2, 0], 0.07); k.beam(tim, [0.72, 0.2, -1.2], [-0.72, H - 0.2, -1.2], 0.07);
    k.box(MAT.boards(), [1.7, 0.08, 1.5], [0, H, -0.6]);
    const camo = MAT.boards({ color: 0x4a4636 });
    k.box(camo, [1.6, 0.9, 0.06], [0, H + 0.45, 0.12]); k.box(camo, [1.6, 1.3, 0.06], [0, H + 0.65, -1.32]);
    k.box(camo, [0.06, 1.3, 1.44], [-0.8, H + 0.65, -0.6]); k.box(camo, [0.06, 1.3, 1.44], [0.8, H + 0.65, -0.6]);
    k.box(camo, [1.6, 0.18, 0.06], [0, H + 1.21, 0.12]);
    k.box(MAT.black(), [1.3, 0.22, 0.02], [0, H + 1.0, 0.1]);
    k.box(MAT.roof(), [1.9, 0.07, 1.8], [0, H + 1.38, -0.6], [-0.14, 0, 0]);
    // cut spruce boughs tied on as camouflage
    const nd = MAT.needles();
    for (let i = 0; i < 7; i++) { const g = new THREE.PlaneGeometry(0.5, 0.8); k.geo(nd, g, mtx([-0.65 + i * 0.22, H + 0.4, 0.17], [0.15, (i % 2 ? 0.3 : -0.3), (i - 3) * 0.12])); }
    // ladder
    [-0.2, 0.2].forEach((x) => k.beam(tim, [x, 0, 0.75], [x, H + 0.15, 0.1], 0.05, 0.07));
    for (let i = 1; i < 8; i++) { const f = i / 8; k.box(MAT.dark(), [0.42, 0.04, 0.05], [0, H * f, 0.75 - 0.65 * f]); }
    k.build({ into: grp });
    return result(grp);
  };
  S.charred = function (o) {
    const grp = new THREE.Group(), k = new Kit(), rnd = rngOf('ch', o.x, o.y);
    const mat = R3.mat('charredWood', () => R3.std({ color: 0x141110, roughness: 0.95 }, { snowTop: 0.8, weather: 0 }));
    snag(k, mat, 2.2 + rnd() * 1.6, 0.17 + rnd() * 0.05, U.hash(o.x, o.y, 5), { broken: true, spread: 0.6 });
    for (let i = 0; i < 4; i++) { const a = i * 1.6 + rnd(); k.limb(mat, [0, 0.15, 0], [Math.cos(a) * 0.45, 0.0, Math.sin(a) * 0.45], 0.08, 0.03, 5); }
    k.build({ into: grp });
    grp.children.forEach((c) => { c.position.z = -0.12; });
    return result(grp);
  };
  // ---------------------------------------------------------------- abandoned camp
  function aTent(k, mat, w, d, h, sag, torn) {
    // ridge tent from two pitched planes with a sag, back triangle, front flap
    const seg = 8, g = new THREE.BufferGeometry(), pos = [], uv = [];
    const pt = (s, u, v) => { // s side -1/1, u along length 0..1 (front to back), v from ridge (0) to ground (1)
      const z = -u * d, x = s * v * w / 2, y = h * (1 - v) - sag * Math.sin(u * PI) * (1 - v) * Math.sin(v * PI + 0.3);
      return [x, Math.max(0, y), z];
    };
    for (const s of [-1, 1]) for (let i = 0; i < seg; i++) for (let j = 0; j < seg; j++) {
      const a = pt(s, i / seg, j / seg), b = pt(s, (i + 1) / seg, j / seg), c = pt(s, (i + 1) / seg, (j + 1) / seg), e = pt(s, i / seg, (j + 1) / seg);
      const q = s > 0 ? [a, e, c, a, c, b] : [a, b, c, a, c, e];
      q.forEach((p) => { pos.push(...p); uv.push(p[2], p[1] + Math.abs(p[0])); });
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    k.geo(mat, g);
    const back = new THREE.Shape(); back.moveTo(-w / 2, 0); back.lineTo(w / 2, 0); back.lineTo(0, h); back.lineTo(-w / 2, 0);
    k.geo(mat, new THREE.ShapeGeometry(back), mtx([0, 0, -d]), 'm');
    // front: one closed flap, the other torn and hanging
    const fl = new THREE.Shape(); fl.moveTo(0, 0); fl.lineTo(-w / 2, 0); fl.lineTo(0, h); fl.lineTo(0, 0);
    k.geo(mat, new THREE.ShapeGeometry(fl), mtx([0, 0, 0.0]), 'm');
    const fl2 = new THREE.Shape(); fl2.moveTo(0, 0.25); fl2.lineTo(w * 0.32, 0.05); fl2.lineTo(0.05, h * 0.95); fl2.lineTo(0, 0.25);
    k.geo(mat, new THREE.ShapeGeometry(fl2), mtx([0.02, 0, 0.0], [0, torn ? -0.9 : -0.2, 0]), 'm');
    k.geo(MAT.black(), new THREE.ShapeGeometry(fl), mtx([0, 0, -0.03], [0, PI, 0]), 'm');
    // poles, ropes, pegs
    const pole = MAT.metal();
    k.cyl(pole, 0.012, 0.012, h + 0.15, [0, (h + 0.15) / 2, 0.02], null, 5); k.cyl(pole, 0.012, 0.012, h + 0.15, [0, (h + 0.15) / 2, -d - 0.02], null, 5);
    const rope = MAT.plain(0x8a8268, 0.9);
    k.limb(rope, [0, h + 0.1, 0.02], [0, 0, 0.8], 0.004, 0.004, 3); k.limb(rope, [0, h + 0.1, -d - 0.02], [0, 0, -d - 0.8], 0.004, 0.004, 3);
    [[w / 2 + 0.25, -0.2], [w / 2 + 0.25, -d + 0.2], [-w / 2 - 0.25, -0.2], [-w / 2 - 0.25, -d + 0.2]].forEach(([x, z]) => k.limb(rope, [Math.sign(x) * w * 0.3, h * 0.42, z], [x, 0, z], 0.003, 0.003, 3));
  }
  S.tent = function () {
    const grp = new THREE.Group(), k = new Kit();
    const mat = MAT.canvas(0xa08028, { snowTop: 0.7 });
    const inner = new THREE.Group(); const k2 = new Kit();
    aTent(k2, R3.mat('tentYellow', () => R3.std({ color: 0x9a7a22, roughness: 0.9, side: THREE.DoubleSide }, { snowTop: 0.8, weather: 0 })), 1.9, 2.1, 1.25, 0.25, true);
    k2.build({ into: inner }); inner.position.set(0, 0, 0.35); grp.add(inner);
    // spilled things
    k.geo(MAT.blue(0x30405a), softBox(0.7, 0.12, 0.5, 0.8), mtx([0.7, 0.06, 0.45], [0, 0.6, 0]));
    k.cyl(MAT.metal(), 0.07, 0.07, 0.12, [-0.75, 0.04, 0.55], [PI / 2, 0, 0.3], 10);
    k.build({ into: grp }); void mat;
    return result(grp);
  };
  S.tent2 = function () {
    const grp = new THREE.Group(), k = new Kit();
    let g = new THREE.SphereGeometry(1, 18, 8, 0, PI * 2, 0, PI / 2); g = g.toNonIndexed();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const c = 0.35 + 0.25 * n3(x * 2.2, z * 2.2, 3) + 0.1 * Math.sin(x * 9); p.setXYZ(i, x * 0.85, Math.max(0.02, y * c), z * 0.65); }
    smoothNormals(g);
    k.geo(R3.mat('tentBlue', () => R3.std({ color: 0x23365a, roughness: 0.85, side: THREE.DoubleSide }, { snowTop: 0.8, weather: 0 })), g, mtx([0, 0, -0.3]));
    const pole = MAT.metal();
    k.limb(pole, [-0.3, 0.2, -0.3], [0.5, 0.75, -0.1], 0.012, 0.012, 5); k.limb(pole, [0.1, 0.2, -0.6], [-0.2, 0.55, 0.2], 0.012, 0.012, 5);
    k.build({ into: grp });
    return result(grp);
  };
  S.firepit = function (o) {
    const grp = new THREE.Group(), k = new Kit();
    fireRing(k, 8, 0.38, U.hash(o.x, o.y, 9), null);
    k.log(MAT.log(), MAT.logEnd(), 0.9, 0.12, [0.65, 0.12, -0.35], 0.4);
    k.build({ into: grp });
    grp.children.forEach((c) => { c.position.z = -0.15; });
    return result(grp);
  };
  // ---------------------------------------------------------------- the Hollow Oak
  S.oak = function (o) {
    const grp = new THREE.Group(), k = new Kit(), rnd = rngOf('oak', o.x, o.y);
    const bark = R3.mat('oakBark', () => TM('bark_dead', { color: 0x4a443c, snowTop: 0.8, weather: 0 }));
    // trunk with flaring base and a real hollow
    const TH = 4.6, seg = 18, hs = 10;
    let tg = new THREE.CylinderGeometry(1, 1, TH, seg, hs, true);
    const idx = tg.index.array, keep = [];
    const pos = tg.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i) + TH / 2, z = pos.getZ(i);
      const a = Math.atan2(z, x), f = y / TH;
      let r = 0.82 - f * 0.18 + 0.75 * Math.exp(-y * 2.6) * (0.6 + 0.4 * Math.abs(Math.sin(a * 2.5 + 0.7)));
      r *= 1 + 0.12 * n3(Math.cos(a) * 1.5, y * 0.9, Math.sin(a) * 1.5) + 0.05 * Math.sin(a * 11 + y * 2);
      pos.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r);
    }
    // cut the hollow out of the front (+z) between 0.5 m and 1.7 m
    for (let t = 0; t < idx.length; t += 3) {
      let cx2 = 0, cy = 0, cz = 0; for (let j = 0; j < 3; j++) { cx2 += pos.getX(idx[t + j]); cy += pos.getY(idx[t + j]); cz += pos.getZ(idx[t + j]); }
      cx2 /= 3; cy /= 3; cz /= 3;
      const a = Math.atan2(cx2, cz);
      if (Math.abs(a) < 0.5 && cy > 0.45 && cy < 1.75) continue;
      keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    tg.setIndex(keep);
    const uvs = tg.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * 5.5, pos.getY(i));
    tg.computeVertexNormals();
    k.geo(bark, tg, mtx([0, 0, -0.25]));
    // dark cavity behind the hole, lip around it
    const cav = new THREE.SphereGeometry(0.55, 12, 10); cav.scale(0.9, 1.3, 0.9);
    k.geo(R3.mat('oakCavity', () => R3.std({ color: 0x0c0a08, roughness: 1, side: THREE.BackSide })), cav, mtx([0, 1.1, -0.3]));
    k.geo(bark, new THREE.TorusGeometry(0.42, 0.09, 6, 16), mtx([0, 1.1, 0.42], [0, 0, 0], [0.95, 1.5, 0.6]));
    // feathers and small bones arranged inside
    const bone = MAT.plain(0xd8cdb0, 0.6);
    for (let i = 0; i < 5; i++) k.box(bone, [0.12, 0.015, 0.015], [-0.15 + i * 0.07, 0.62, -0.05 - (i % 2) * 0.08], [0, i * 0.7, 0]);
    // roots
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28 + rnd() * 0.4; if (Math.abs(Math.atan2(Math.cos(a), Math.sin(a))) < 0.3) continue; k.limb(bark, [Math.cos(a) * 0.9, 0.35, Math.sin(a) * 0.9 - 0.25], [Math.cos(a) * 2.0, -0.15, Math.sin(a) * 2.0 - 0.25], 0.25, 0.04, 6); }
    // crown: a few massive crooked limbs, two more orders of branches
    const grow = (a, dir, len, r, depth) => {
      const b = [a[0] + dir.x * len, a[1] + dir.y * len, a[2] + dir.z * len];
      const mid = [(a[0] + b[0]) / 2 + (rnd() - 0.5) * len * 0.2, (a[1] + b[1]) / 2 + (rnd() - 0.5) * len * 0.15, (a[2] + b[2]) / 2 + (rnd() - 0.5) * len * 0.2];
      k.limb(bark, a, mid, r, r * 0.82, depth > 1 ? 8 : 5); k.limb(bark, mid, b, r * 0.82, r * 0.62, depth > 1 ? 8 : 5);
      if (depth <= 0) return;
      const nC = depth > 1 ? 3 : 2 + Math.floor(rnd() * 2);
      for (let i = 0; i < nC; i++) {
        const d2 = dir.clone().add(new V3((rnd() - 0.5) * 1.3, (rnd() - 0.2) * 0.8, (rnd() - 0.5) * 1.3)).normalize();
        grow(i === 0 ? b : mid, d2, len * (0.55 + rnd() * 0.2), r * 0.5, depth - 1);
      }
    };
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * 6.28 + rnd() * 0.6, up = 0.55 + rnd() * 0.5;
      grow([Math.cos(a) * 0.3, TH - 0.4 - rnd() * 0.6, Math.sin(a) * 0.3 - 0.25], new V3(Math.cos(a), up, Math.sin(a)).normalize(), 2.4 + rnd() * 0.8, 0.32, 2);
    }
    k.build({ into: grp });
    // dead leaves still clinging
    const kl = new Kit(), leaf = R3.mat('oakLeaves', () => TM('foliage_birch', { color: 0x6a4a28, alphaTest: 0.5, side: THREE.DoubleSide, wind: 0.6, snowTop: 0.5 }));
    for (let i = 0; i < 14; i++) { const a = rnd() * 6.28, r = 1.5 + rnd() * 2.6; const g = new THREE.PlaneGeometry(1.1, 0.9); kl.geo(leaf, g, mtx([Math.cos(a) * r, TH + 1.2 + rnd() * 2.6, Math.sin(a) * r - 0.25], [rnd() * 3, rnd() * 3, rnd() * 3])); }
    kl.build({ into: grp, shadow: false });
    return result(grp);
  };
  // ---------------------------------------------------------------- the rusted pickup
  S.car = function () {
    const grp = new THREE.Group(), k = new Kit();
    const body = R3.mat('truckPaint', () => TM('metal_painted', { color: 0x5a2c22, snowTop: 0.9, roughness: 0.75 }));
    const rs = MAT.rust({ snowTop: 0.9 }), tire = MAT.plain(0x121214, 0.9), gl = R3.mat('truckGlass', () => { const m = R3.std({ color: 0x0c1014, roughness: 0.15, metalness: 0.2 }); return m; });
    const W2 = 0.9;
    const arch = (sh, x, r) => { sh.lineTo(x + r, 0.45); sh.absarc(x, 0.42, r, 0, PI, false); sh.lineTo(x - r, 0.45); };
    // cab + hood silhouette (front at -x)
    const s1 = new THREE.Shape();
    s1.moveTo(0.62, 0.45); s1.lineTo(0.62, 1.78); s1.lineTo(-0.5, 1.78); s1.lineTo(-0.95, 1.18); s1.lineTo(-2.2, 1.08); s1.lineTo(-2.36, 0.92); s1.lineTo(-2.36, 0.45);
    s1.lineTo(-1.9, 0.45); s1.absarc(-1.45, 0.42, 0.45, PI, 0, true); s1.lineTo(0.62, 0.45);
    const eg = new THREE.ExtrudeGeometry(s1, { depth: W2 * 2, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 10 });
    k.geo(body, eg, mtx([0, 0, -W2]), 'm');
    // bed: floor, sides with wheel arch, front wall, tailgate
    const s2 = new THREE.Shape(); s2.moveTo(0.66, 0.45); s2.lineTo(0.66, 1.05); s2.lineTo(2.3, 1.05); s2.lineTo(2.3, 0.45); s2.lineTo(1.9, 0.45); s2.absarc(1.45, 0.42, 0.45, 0, PI, false); s2.lineTo(0.66, 0.45);
    const sg = new THREE.ExtrudeGeometry(s2, { depth: 0.06, bevelEnabled: false, curveSegments: 10 });
    k.geo(body, sg.clone(), mtx([0, 0, W2 - 0.06]), 'm'); k.geo(body, sg, mtx([0, 0, -W2]), 'm');
    k.box(rs, [1.64, 0.05, W2 * 2 - 0.12], [1.48, 0.62, 0]); k.box(body, [0.06, 0.55, W2 * 2], [2.27, 0.78, 0], [0, 0, -0.18]);
    // glass and trim
    k.box(gl, [0.02, 0.5, W2 * 2 - 0.2], [-0.74, 1.47, 0], [0, 0, -0.93]);
    k.box(gl, [0.02, 0.48, W2 * 2 - 0.25], [0.645, 1.45, 0]);
    [-1, 1].forEach((s) => { const sh = new THREE.Shape(); sh.moveTo(0.5, 1.2); sh.lineTo(0.5, 1.68); sh.lineTo(-0.45, 1.68); sh.lineTo(-0.8, 1.2); sh.lineTo(0.5, 1.2); k.geo(gl, new THREE.ShapeGeometry(sh), mtx([0, 0, s * (W2 + 0.045)], [0, s < 0 ? PI : 0, 0], [s < 0 ? -1 : 1, 1, 1])); });
    k.box(rs, [0.14, 0.2, W2 * 2 + 0.1], [-2.4, 0.55, 0]); k.box(rs, [0.12, 0.18, W2 * 2 + 0.1], [2.36, 0.52, 0]);
    k.box(MAT.metal(), [0.03, 0.28, 1.1], [-2.37, 0.8, 0]);
    [-0.62, 0.62].forEach((z) => k.cyl(MAT.plain(0x2a2c2a, 0.3), 0.09, 0.09, 0.05, [-2.37, 0.85, z], [0, 0, PI / 2], 12));
    // wheels: one flat
    [[-1.45, W2 - 0.1, 0.4], [-1.45, -W2 + 0.1, 0.4], [1.45, W2 - 0.1, 0.4], [1.45, -W2 + 0.1, 0.25]].forEach(([x, z, r]) => {
      k.cyl(tire, r, r, 0.24, [x, r, z], [PI / 2, 0, 0], 16);
      k.cyl(rs, r * 0.55, r * 0.55, 0.25, [x, r, z + Math.sign(z) * 0.01], [PI / 2, 0, 0], 12);
    });
    // junk in the bed
    k.geo(MAT.canvas(0x4a4a38, { snowTop: 0.9 }), softBox(0.8, 0.25, 1.0, 0.7), mtx([1.6, 0.8, 0.1], [0, 0.4, 0]));
    k.build({ into: grp });
    const inner = grp.children.slice();
    inner.forEach((c) => { c.position.z = -0.85; c.rotation.z = 0.02; c.rotation.x = 0.025; });
    return result(grp);
  };
  S.gate = function () {
    const grp = new THREE.Group(), k = new Kit(), tim = MAT.timber();
    k.box(tim, [0.2, 1.2, 0.2], [-1.45, 0.6, -0.1]); k.box(tim, [0.2, 1.1, 0.2], [1.5, 0.55, -0.1]);
    const yel = MAT.paint(0xc89a20, { snowTop: 0.8 }), blk = MAT.paint(0x15161a, { snowTop: 0.8 });
    k.box(yel, [3.0, 0.1, 0.1], [0.05, 0.98, -0.1], [0, 0, 0.0]);
    for (let i = 0; i < 6; i++) k.box(blk, [0.24, 0.105, 0.105], [-1.1 + i * 0.47, 0.98, -0.1]);
    k.box(MAT.stoneWall(), [0.35, 0.3, 0.3], [-1.75, 0.95, -0.1]);
    k.cyl(MAT.metal(), 0.03, 0.03, 0.06, [1.42, 0.95, -0.02], [PI / 2, 0, 0], 8);
    k.geo(MAT.metal(), new THREE.TorusGeometry(0.05, 0.012, 5, 10), mtx([1.42, 0.86, 0.0]));
    k.build({ into: grp });
    return result(grp);
  };
  S.board = function () {
    const grp = new THREE.Group(), k = new Kit(), tim = MAT.timber();
    k.box(tim, [0.12, 2.1, 0.12], [-0.6, 1.05, -0.15]); k.box(tim, [0.12, 2.1, 0.12], [0.6, 1.05, -0.15]);
    k.box(MAT.boards({ snowTop: 0 }), [1.4, 0.95, 0.05], [0, 1.4, -0.13]);
    k.box(tim, [1.5, 0.06, 0.1], [0, 1.9, -0.12]); k.box(tim, [1.5, 0.06, 0.1], [0, 0.9, -0.12]);
    k.box(MAT.roof(), [1.7, 0.05, 0.55], [0, 2.15, -0.15], [0.35, 0, 0]);
    k.geo(picMat('notice'), new THREE.PlaneGeometry(1.3, 0.88), mtx([0, 1.4, -0.1]));
    k.build({ into: grp });
    return result(grp);
  };
  S.dock = () => result(new THREE.Group());

  // ================================================================== LOOT, SIGNS, CAIRN, DROPS
  const lootReady = (areaId) => { const s = st(); const l = s && s.world.loot[areaId]; return !l || s.time.day - l >= 3; };
  function container(kind) {
    const grp = new THREE.Group(), k = new Kit(), dark = MAT.plain(0x0e0c0a, 1);
    let piv = null, W2, Hh, Dd;
    const lidBox = (mat, extra) => (kk) => { kk.box(mat, [W2 + 0.02, 0.05, Dd + 0.02], [0, 0.025, 0]); if (extra) extra(kk); };
    if (kind === 'pack') {
      backpack(k, MAT.canvas(0x3c4a30, { snowTop: 0.8 }), MAT.canvas(0x2c3626, { snowTop: 0.8 }), 1);
      k.build({ into: grp });
      return { grp, set: () => {} };
    }
    if (kind === 'toolbox' || kind === 'rustbox') {
      const m = kind === 'toolbox' ? MAT.paint(0x8a1e18, { snowTop: 0.7 }) : MAT.rust({ snowTop: 0.8 });
      W2 = 0.62; Hh = 0.26; Dd = 0.3;
      openBox(k, m, W2, Hh, Dd, 0.02, dark);
      piv = lidOn(grp, (kk) => { kk.box(m, [W2 + 0.02, 0.07, Dd + 0.02], [0, 0.035, 0]); kk.box(MAT.metal(), [0.25, 0.04, 0.04], [0, 0.1, 0]); }, W2, Hh, Dd);
    } else if (kind === 'bin') {
      const m = MAT.plain(0x22406a, 0.45);
      W2 = 0.8; Hh = 0.5; Dd = 0.5;
      openBox(k, m, W2, Hh, Dd, 0.03, dark);
      k.box(MAT.plain(0xd8d8d0, 0.6), [0.36, 0.12, 0.005], [0, 0.32, Dd / 2 + 0.003]);
      piv = lidOn(grp, lidBox(m), W2, Hh, Dd);
    } else { // wooden crates and chests
      const tint = { footlocker: 0x4a4a32, chest: 0x5a3a22, crate: 0x7a5a3a, ammo: 0x3e4430 }[kind] || 0x6a4a30;
      const m = TM('wood_plank', { color: tint, snowTop: 0.8, weather: 0 });
      W2 = kind === 'crate' ? 0.8 : 0.78; Hh = kind === 'crate' ? 0.5 : 0.38; Dd = kind === 'crate' ? 0.55 : 0.42;
      openBox(k, m, W2, Hh, Dd, 0.03, dark);
      const band = MAT.iron({ snowTop: 0.4 });
      if (kind === 'chest' || kind === 'footlocker') { [-0.25, 0.25].forEach((x) => k.box(band, [0.05, Hh + 0.01, Dd + 0.01], [x, Hh / 2, 0])); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => k.box(band, [0.06, 0.06, 0.06], [sx * (W2 / 2 - 0.02), 0.03, sz * (Dd / 2 - 0.02)])); k.box(MAT.brass(), [0.06, 0.08, 0.02], [0, Hh - 0.05, Dd / 2 + 0.01]); }
      if (kind === 'crate') { [-0.25, 0.25].forEach((y) => k.box(m, [W2 + 0.02, 0.07, Dd + 0.02], [0, Hh / 2 + y * Hh * 0.6, 0])); k.geo(picMat('stencil', { transparent: true }), new THREE.PlaneGeometry(0.6, 0.3), mtx([0, Hh * 0.5, Dd / 2 + 0.017])); }
      if (kind === 'ammo') k.box(MAT.paint(0xc8b040), [0.3, 0.06, 0.005], [0, Hh * 0.55, Dd / 2 + 0.003]);
      piv = lidOn(grp, (kk) => { kk.box(m, [W2 + 0.02, 0.05, Dd + 0.02], [0, 0.025, 0]); if (kind === 'chest' || kind === 'footlocker') [-0.25, 0.25].forEach((x) => kk.box(band, [0.05, 0.06, Dd + 0.03], [x, 0.03, 0])); }, W2, Hh, Dd);
    }
    k.build({ into: grp });
    return { grp, set: (open) => { if (piv) piv.rotation.x = open ? -1.95 : 0; } };
  }
  const LOOT_KIND = { firetower: 'footlocker', shack: 'chest', camp: 'pack', mine: 'crate', car: 'rustbox', blind: 'ammo', mast: 'toolbox', trailhead: 'bin' };
  function makeLoot(lm, areaId) {
    const c = container(LOOT_KIND[lm] || 'crate');
    const grp = new THREE.Group(); c.grp.position.z = -0.22; c.grp.rotation.y = (U.strHash(lm) % 7 - 3) * 0.05; grp.add(c.grp);
    // the camp backpack: an opened pack spills its insides
    let spill = null;
    if (lm === 'camp') { const k = new Kit(); k.geo(MAT.wool(0x6a5a40), softBox(0.3, 0.06, 0.25, 0.8), mtx([0.35, 0.03, 0.05], [0, 0.6, 0])); k.cyl(MAT.metal(), 0.04, 0.04, 0.1, [0.25, 0.04, 0.25], [PI / 2, 0, 1], 8); spill = k.build(); grp.add(spill); }
    return result(grp, () => { const open = !lootReady(areaId); c.set(open); if (spill) spill.visible = open; });
  }
  function makeSign() {
    const grp = new THREE.Group(), k = new Kit(), tim = MAT.timber();
    k.box(tim, [0.12, 1.5, 0.12], [0, 0.75, -0.12]);
    k.box(MAT.boards({ snowTop: 0.9 }), [1.05, 0.42, 0.05], [0, 1.35, -0.06]);
    k.box(MAT.dark(), [0.95, 0.03, 0.012], [0, 1.47, -0.03]); k.box(MAT.dark(), [0.95, 0.03, 0.012], [0, 1.23, -0.03]);
    for (let i = 0; i < 3; i++) k.box(MAT.plain(0x2a1c12, 1), [0.6 - i * 0.12, 0.025, 0.008], [-0.05, 1.4 - i * 0.07, -0.03]);
    k.build({ into: grp });
    return result(grp);
  }
  function makeCairn() {
    const grp = new THREE.Group(), k = new Kit();
    // a hand-built pile of rust-red slabs: uneven sizes, each set a little off-centre and tilted
    const red = R3.mat('cairnRed', () => TM('rock', { color: 0x5e2a22, snowTop: 0.55, weather: 0 }));
    const grey = R3.mat('cairnGrey', () => TM('rock', { color: 0x4e4a46, snowTop: 0.6, weather: 0 }));
    [[0.4, 0.13, 0.33, 0.1, 0.05, -0.03], [0.36, 0.11, 0.28, 0.32, -0.04, 0.03], [0.3, 0.12, 0.24, 0.52, 0.03, 0.0], [0.27, 0.09, 0.22, 0.7, -0.02, -0.04], [0.2, 0.1, 0.17, 0.86, 0.04, 0.02], [0.16, 0.08, 0.13, 1.0, -0.01, 0.0], [0.09, 0.09, 0.08, 1.12, 0.02, -0.01]]
      .forEach(([sx, sy, sz, y, dx, dz], i) => k.geo(i === 3 ? grey : red, rockGeo(i * 5 + 3, sx, sy, sz, 0.32, 2), mtx([dx, y, -0.2 + dz], [(i % 3 - 1) * 0.09, i * 1.9, (i % 2 - 0.5) * 0.14])));
    // a few fallen stones at its foot
    [[0.38, 0.2], [-0.35, 0.05], [0.1, -0.5]].forEach(([x, z], i) => k.geo(red, rockGeo(40 + i, 0.1, 0.06, 0.08, 0.35, 1), mtx([x, 0.02, -0.2 + z], [0.3, i * 2.2, 0.2])));
    k.build({ into: grp });
    return result(grp);
  }
  function makeDrop(o) {
    const grp = new THREE.Group(), k = new Kit(), id = (o && o.d && o.d.id) || '';
    if (id === 'wood' || id === 'plank') for (let i = 0; i < 4; i++) k.log(MAT.bark(), MAT.logEnd(), 0.5, 0.06, [0, 0.06 + (i > 2 ? 0.1 : 0), -0.12 + (i % 3) * 0.12], 0.3);
    else if (id === 'hq_pack') backpack(k, MAT.canvas(0xc06018), MAT.blue(), 0.9);
    else if (id === 'rod') { k.cyl(MAT.plain(0x3a2a1a, 0.5), 0.012, 0.005, 1.2, [0, 0.02, 0], [0, 0.4, PI / 2], 5); k.cyl(MAT.metal(), 0.04, 0.04, 0.04, [-0.45, 0.04, -0.2], [PI / 2, 0, 0], 10); }
    else if (id === 'signal_flare') { k.cyl(MAT.plain(0xa01a14, 0.5), 0.02, 0.02, 0.3, [0, 0.025, 0], [0, 0.7, PI / 2], 8); }
    else sack(k, MAT.canvas(0x7a6a4a, { snowTop: 0.3 }), 0.8);
    k.build({ into: grp });
    return result(grp);
  }

  // ================================================================== DAY EVENTS
  const EV = {};
  EV.cache = function () {
    const grp = new THREE.Group(), k = new Kit();
    backpack(k, MAT.canvas(0x3c5a3a, { snowTop: 0.5 }), MAT.canvas(0x2a3c28, { snowTop: 0.5 }), 1.05);
    k.cyl(MAT.paint(0xc8a018), 0.035, 0.035, 0.07, [0.32, 0.035, 0.18], null, 8);
    k.build({ into: grp }); grp.rotation.y = 0.7;
    return result(grp);
  };
  EV.tracks = function (o, areaId) {
    const grp = new THREE.Group(), k = new Kit();
    backpack(k, MAT.canvas(0x3c5a3a, { snowTop: 0.5 }), MAT.canvas(0x2a3c28, { snowTop: 0.5 }), 1);
    // torn notebook, pages fluttering out
    k.box(MAT.leather(0x2a1a12), [0.16, 0.012, 0.22], [0.35, 0.006, 0.12], [0, 0.4, 0]);
    k.geo(picMat('paperLines'), new THREE.PlaneGeometry(0.28, 0.2), mtx([0.36, 0.015, 0.12], [-PI / 2 + 0.05, 0, 0.4]));
    k.geo(MAT.paper(), new THREE.PlaneGeometry(0.14, 0.2), mtx([0.62, 0.008, -0.1], [-PI / 2, 0, 1.2]));
    k.geo(MAT.paper(), new THREE.PlaneGeometry(0.14, 0.2), mtx([0.9, 0.008, 0.2], [-PI / 2, 0, 2.2]));
    // a trail of prints leading away west
    const P = R3.toWorld(areaId, o.x, o.y), pts = [];
    for (let i = 0; i < 9; i++) { const x = (-30 - i * 14) * K, z = (-4 + Math.sin(i) * 6) * K; pts.push([x, z, -PI / 2 + Math.sin(i) * 0.2, 1], [x + 4 * K, z + 3 * K + 0.12, -PI / 2 + Math.sin(i) * 0.2, 1]); }
    prints(k, pts, areaId, P);
    k.build({ into: grp });
    return result(grp);
  };
  EV.supply = function () {
    const grp = new THREE.Group(), k = new Kit();
    const wood = TM('wood_plank', { color: 0x8a6a42, snowTop: 0.6, weather: 0 });
    k.box(wood, [1.1, 0.66, 0.72], [0, 0.33, -0.2]);
    [-0.35, 0.35].forEach((x) => k.box(wood, [0.08, 0.68, 0.74], [x, 0.34, -0.2]));
    k.geo(picMat('stencil', { transparent: true }), new THREE.PlaneGeometry(0.62, 0.31), mtx([0, 0.36, 0.165]));
    // red-and-white strap and the crumpled chute
    const r = MAT.red(0xa01e18), w = MAT.canvas(0xd8d4c8);
    k.box(r, [0.1, 0.665, 0.725], [0, 0.333, -0.2]); k.box(r, [1.105, 0.665, 0.1], [0, 0.333, -0.2]);
    let ch = new THREE.SphereGeometry(0.6, 14, 6, 0, PI * 2, 0, PI / 2); ch = ch.toNonIndexed();
    const p = ch.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x * 1.3, y * (0.28 + 0.2 * Math.abs(Math.sin(x * 8 + z * 5))), z); } smoothNormals(ch);
    k.geo(w, ch, mtx([1.2, 0, 0.25]));
    k.geo(r, softBox(0.5, 0.12, 0.4, 0.8), mtx([1.0, 0.1, 0.0], [0, 0.4, 0]));
    for (let i = 0; i < 4; i++) k.limb(MAT.plain(0xc8c4b8, 0.9), [0.5, 0.6, -0.2 + i * 0.05], [0.95 + i * 0.12, 0.08, 0.05 + i * 0.1], 0.004, 0.004, 3);
    k.box(MAT.metal(), [0.12, 0.08, 0.12], [0.38, 0.7, -0.4]);
    k.build({ into: grp });
    const lm = glowStd(0x300000, 0xff2a10, 0);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), lm); lamp.position.set(0.38, 0.78, -0.4); grp.add(lamp);
    return result(grp, (dt, ob, ctx) => {
      const on = Math.sin(ctx.t * 4) > 0;
      lm.emissiveIntensity = on ? 5 : 0.1;
      if (on) addLightAt(ctx, grp, 0.38, 0.82, -0.4, { key: 'supply', color: [1, 0.1, 0.05], intensity: 1.8, range: 5, glow: 0.7, glowIntensity: 1.2 });
    });
  };
  EV.gift = function (o, areaId) {
    const grp = new THREE.Group(), k = new Kit();
    k.geo(TM('bark_birch', { snowTop: 0.4 }), softBox(0.28, 0.14, 0.2, 0.5), mtx([0, 0.07, 0], [0, 0.3, 0]));
    k.box(MAT.red(0x9a1a18), [0.3, 0.03, 0.02], [0, 0.12, 0], [0, 0.3, 0]); k.box(MAT.red(0x9a1a18), [0.02, 0.03, 0.22], [0, 0.12, 0], [0, 0.3, 0]);
    const P = R3.toWorld(areaId, o.x, o.y), pts = [];
    for (let i = 0; i < 8; i++) pts.push([0.25 + i * 0.22, 0.25 + i * 0.28 + (i % 2) * 0.1, PI * 0.8, 0.45]);
    prints(k, pts, areaId, P, 'paw', 0x2a3444, 0.5);
    k.build({ into: grp });
    return result(grp);
  };
  EV.wolves = () => result(new THREE.Group());
  // ---- anomalies
  EV['anomaly:door'] = function () {
    const grp = new THREE.Group(), k = new Kit(), tim = MAT.timber({ snowTop: 0.5 });
    k.box(tim, [0.12, 2.15, 0.16], [-0.5, 1.07, 0]); k.box(tim, [0.12, 2.15, 0.16], [0.5, 1.07, 0]); k.box(tim, [1.12, 0.14, 0.18], [0, 2.18, 0]);
    k.box(tim, [1.0, 0.06, 0.2], [0, 0.03, 0]);
    k.box(TM('wood_painted', { color: 0x5a4a3a }), [0.86, 2.05, 0.05], [0, 1.06, 0.0]);
    [[0.65, 0.35], [1.5, 0.35]].forEach(([y, h]) => k.box(MAT.plain(0x2a201a, 0.8), [0.66, h, 0.012], [0, y, 0.03]));
    k.geo(MAT.brass(), new THREE.SphereGeometry(0.035, 10, 8), mtx([0.33, 1.0, 0.07]));
    k.build({ into: grp });
    // warm light leaking around the door edges (the cabin on the other side, stove on HIGH)
    const leak = R3.mat('doorLeak', () => { const m = R3.basic({ color: 0xff9a40 }); m.userData.noShadow = true; return m; });
    const kl = new Kit(); kl.box(leak, [0.86, 0.015, 0.06], [0, 0.065, 0.01]); kl.box(leak, [0.012, 2.0, 0.06], [0.435, 1.06, 0.01]);
    const lg = kl.build({ shadow: false }); grp.add(lg);
    return result(grp, (dt, ob, ctx) => {
      const nk = night(); lg.visible = nk > 0.3;
      if (nk > 0.3) addLightAt(ctx, grp, 0.1, 0.2, 0.35, { key: 'doorleak', color: [1, 0.55, 0.22], intensity: 0.8 * nk, range: 2.5, flicker: 'fire', seed: 7 });
    });
  };
  EV['anomaly:bells'] = function (o) {
    const grp = new THREE.Group(), k = new Kit(), tips = [];
    snag(k, MAT.deadBark({ snowTop: 0.7 }), 3.4, 0.14, U.hash(o.x | 0, o.y | 0, 3), { tips, spread: 1.1 });
    k.build({ into: grp });
    // four brass bells on red thread, swinging with no wind
    const bells = [];
    const bellGeo = R3.geo('bellLathe', () => { const pts = [[0, -0.07], [0.045, -0.065], [0.05, -0.05], [0.035, -0.02], [0.025, 0.02], [0.012, 0.035], [0, 0.036]].map(([x, y]) => new THREE.Vector2(x, y)); const g = new THREE.LatheGeometry(pts, 12); g.userData.shared = true; return g; });
    const thread = MAT.red(0xa01a14);
    tips.slice(0, 6).forEach((tp, i) => {
      if (bells.length >= 4) return;
      const piv = new THREE.Group(); piv.position.set(tp[0], Math.min(tp[1], 2.9), tp[2]);
      const L = 0.25 + (i % 2) * 0.2;
      const th = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, L, 3), thread); th.position.y = -L / 2; piv.add(th);
      const b = new THREE.Mesh(bellGeo, MAT.brass()); b.position.y = -L - 0.03; b.castShadow = true; piv.add(b);
      grp.add(piv); bells.push(piv);
    });
    return result(grp, (dt, ob, ctx) => bells.forEach((b, i) => { b.rotation.z = Math.sin(ctx.t * 3 + i) * 0.35; b.rotation.x = Math.cos(ctx.t * 2.3 + i * 2) * 0.2; }));
  };
  EV['anomaly:warmfire'] = function (o) {
    const grp = new THREE.Group(), k = new Kit();
    const emb = glowStd(0x1a0a04, 0xff4a10, 1.5);
    fireRing(k, 6, 0.3, U.hash(o.x | 0, o.y | 0, 2), emb);
    k.build({ into: grp });
    const fx = Particles({ n: 6, tex: 'puff', color: 0x9a9ca4, speed: 0.2, rise: 1.8, spread: 0.1, drift: 0.6, wobble: 0.15, s0: 0.15, s1: 0.8, alpha: 0.25, seed: 5 });
    const sp = Particles({ n: 4, add: true, tex: 'glow', color: 0xff8030, speed: 0.6, rise: 0.8, spread: 0.2, wobble: 0.1, s0: 0.03, s1: 0.01, alpha: 0.9, seed: 6 });
    grp.add(fx.mesh, sp.mesh);
    return result(grp, (dt, ob, ctx) => {
      const f = flick('wf' + (ob && ob.ev ? ob.ev.id : ''));
      emb.emissiveIntensity = 1.2 + f * 1.6;
      fx.update(ctx.t, 1, ctx.cam); sp.update(ctx.t, 1, ctx.cam);
    });
  };
  EV['anomaly:crows'] = function () {
    const grp = new THREE.Group(), k = new Kit();
    const feath = MAT.plain(0x0b0b0e, 0.55), beak = MAT.plain(0x1e1e22, 0.4);
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * 6.28, r = 0.6, base = mtx([Math.cos(a) * r, 0, Math.sin(a) * r * 0.55 - 0.1], [0, -a + PI / 2, 0]);
      // heads point inward (toward -Z in the crow's frame)
      k.geo(feath, softBox(0.12, 0.09, 0.22, 0.7), base.clone().multiply(mtx([0, 0.05, 0.04], [0, 0, 0.5])));
      k.geo(feath, new THREE.SphereGeometry(0.045, 8, 6), base.clone().multiply(mtx([0, 0.05, -0.1])));
      const bk = new THREE.ConeGeometry(0.015, 0.06, 5); bk.rotateX(-PI / 2);
      k.geo(beak, bk, base.clone().multiply(mtx([0, 0.045, -0.17])));
      k.box(feath, [0.09, 0.015, 0.12], [0, 0.02, 0.2], [0, 0.1, 0], base);
      k.box(feath, [0.2, 0.012, 0.14], [0.06, 0.08, 0.04], [0, 0, 0.9], base);
      k.limb(beak, [0, 0.03, 0.08], [0.02, 0.09, 0.13], 0.004, 0.003, 3, base);
    }
    // the unburnt match
    k.box(MAT.plain(0xc8a878, 0.8), [0.005, 0.005, 0.06], [0, 0.003, -0.1]);
    k.geo(MAT.plain(0x8a1810, 0.6), new THREE.SphereGeometry(0.006, 6, 4), mtx([0, 0.004, -0.13]));
    k.build({ into: grp });
    return result(grp);
  };
  EV['anomaly:voice'] = function () {
    const grp = new THREE.Group();
    const mat = R3.mat('voiceCol', () => { const m = R3.glowMat({ map: TEX.column(), color: 0xc8d2e6, side: THREE.DoubleSide, opacity: 0.4 }); m.userData.noShadow = true; m.userData.own = false; return m; });
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 2.2), mat); m.position.y = 1.1; m.rotation.y = i * PI / 3; grp.add(m); }
    const motes = Particles({ n: 8, add: true, tex: 'glow', color: 0xd8e0f0, speed: 0.15, rise: 2.2, spread: 0.3, wobble: 0.12, s0: 0.04, s1: 0.02, alpha: 0.8, seed: 9 });
    grp.add(motes.mesh);
    return result(grp, (dt, ob, ctx) => {
      mat.opacity = 0.25 + Math.sin(ctx.t * 2) * 0.15;
      grp.children.forEach((c, i) => { if (i < 3) c.rotation.y = i * PI / 3 + ctx.t * 0.2; });
      motes.update(ctx.t, 1, ctx.cam);
    });
  };

  // ================================================================== MODULE OBJECTS
  const MOD = {};
  MOD['pl:none'] = () => result(new THREE.Group());
  // ---- missions
  const msOk = (key) => /:ok$/.test(key);
  MOD['ms:breaker'] = function (o, a, key) {
    const grp = new THREE.Group(), k = new Kit(), ok = msOk(key);
    k.box(MAT.timber(), [0.12, 1.5, 0.12], [0, 0.75, -0.18]);
    const st2 = MAT.paint(0x6a7072, { snowTop: 0.8 });
    k.box(st2, [0.5, 0.6, 0.22], [0, 1.15, -0.02]);
    k.box(st2, [0.54, 0.04, 0.26], [0, 1.47, -0.02], [-0.1, 0, 0]);
    k.geo(picMat('hazard', { transparent: true }), new THREE.PlaneGeometry(0.18, 0.18), mtx([0, 1.2, 0.092]));
    k.box(MAT.metal(), [0.02, 0.16, 0.03], [0.21, 1.1, 0.1]);
    k.cyl(MAT.metal(), 0.02, 0.02, 0.9, [0.16, 0.45, -0.1], null, 6);
    k.build({ into: grp });
    const lm = glowStd(ok ? 0x002000 : 0x300000, ok ? 0x30ff40 : 0xff2010, 2);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), lm); lamp.position.set(0.15, 1.52, 0.04); grp.add(lamp);
    return result(grp, (dt, ob, ctx) => { const on = ok || Math.sin(ctx.t * 5 + (ob ? ob.x : 0)) > 0.2; lm.emissiveIntensity = on ? 3 : 0.1; if (on && night() > 0.3) addLightAt(ctx, grp, 0.15, 1.55, 0.1, { key: 'brk', color: ok ? [0.2, 1, 0.3] : [1, 0.1, 0.05], intensity: 0.6, range: 2.5, glow: 0.3, glowIntensity: 0.8 }); });
  };
  MOD['ms:gauge'] = function () {
    const grp = new THREE.Group(), k = new Kit();
    const r = MAT.paint(0xa01e18, { snowTop: 0.2 }), w = MAT.paint(0xdedad0, { snowTop: 0.2 });
    for (let i = 0; i < 9; i++) k.box(i % 2 ? w : r, [0.08, 0.2, 0.08], [0, 0.1 + i * 0.2, 0]);
    for (let i = 0; i < 18; i++) k.box(MAT.plain(0x101010, 0.8), [i % 2 ? 0.03 : 0.05, 0.01, 0.005], [0.03, 0.05 + i * 0.1, 0.042]);
    k.box(MAT.metal(), [0.12, 0.04, 0.12], [0, 1.82, 0]); k.box(MAT.metal(), [0.3, 0.02, 0.3], [0, 0.01, 0]);
    k.build({ into: grp });
    return result(grp);
  };
  MOD['ms:markers'] = function (o, a, key) {
    const grp = new THREE.Group(), k = new Kit(), ok = msOk(key);
    k.box(MAT.timber(), [0.06, 0.95, 0.06], [0, 0.47, 0]);
    k.cyl(MAT.timber(), 0.0, 0.04, 0.12, [0, 0.0, 0], [PI, 0, 0], 4);
    if (!ok) { k.box(MAT.paint(0xd8d8e0), [0.065, 0.06, 0.065], [0, 0.8, 0]); }
    k.build({ into: grp });
    let rib = null;
    if (ok) {
      const m = R3.mat('blaze', () => R3.std({ color: 0xff5a10, roughness: 0.6, emissive: 0x401000, side: THREE.DoubleSide }));
      rib = new THREE.Group(); rib.position.set(0.03, 0.82, 0);
      [0, 1].forEach((i) => { const g = new THREE.PlaneGeometry(0.32, 0.04); g.translate(0.16, 0, 0); const mm = new THREE.Mesh(g, m); mm.position.y = -i * 0.05; rib.add(mm); });
      k.box(m, [0.07, 0.05, 0.07], [0, 0.82, 0]); k.build({ into: grp });
      grp.add(rib);
    }
    return result(grp, (dt, ob, ctx) => { if (rib) rib.children.forEach((c, i) => { c.rotation.y = 0.6 + Math.sin(ctx.t * 6 + i * 2) * 0.4; c.rotation.z = -0.5 + Math.sin(ctx.t * 4.3 + i) * 0.15; }); });
  };
  MOD['ms:restock'] = function () {
    const grp = new THREE.Group(), k = new Kit();
    const ol = MAT.paint(0x46502e, { snowTop: 0.9 });
    k.box(ol, [1.1, 0.62, 0.62], [0, 0.31, -0.15]);
    k.box(ol, [1.14, 0.06, 0.66], [0, 0.64, -0.15]);
    k.box(MAT.paint(0xc8a018), [1.105, 0.1, 0.625], [0, 0.22, -0.15]);
    k.geo(picMat('cross', { transparent: true }), new THREE.PlaneGeometry(0.2, 0.2), mtx([0.35, 0.44, 0.162]));
    k.box(MAT.metal(), [0.1, 0.12, 0.04], [0, 0.5, 0.17]);
    [-0.45, 0.45].forEach((x) => k.box(MAT.metal(), [0.08, 0.06, 0.66], [x, 0.03, -0.15]));
    k.build({ into: grp });
    return result(grp);
  };
  MOD['ms:pack'] = function () {
    const grp = new THREE.Group(), k = new Kit();
    backpack(k, MAT.canvas(0xc06018, { snowTop: 0.5 }), MAT.blue(null, { snowTop: 0.5 }), 1);
    k.box(MAT.paper(), [0.06, 0.005, 0.04], [0.15, 0.2, 0.15]);
    k.build({ into: grp }); grp.rotation.y = -0.5;
    return result(grp);
  };
  function roadIsEW(areaId, x, y) {
    try { const a = W.get(areaId), T = W.T; const d = (dx, dy) => W.tile(a, Math.floor((x + dx) / TS), Math.floor((y + dy) / TS)) === T.DIRT; return (d(-24, 0) && d(24, 0)) || !(d(0, -24) && d(0, 24)); } catch (e) { return true; }
  }
  MOD['ms:tree'] = function (o, areaId, key) {
    const grp = new THREE.Group(), k = new Kit(), ok = msOk(key), inner = new THREE.Group();
    if (!ok) {
      // a pine down across the road: root plate on edge, tapering trunk, boughs swept back
      k.limb(MAT.bark(), [-1.45, 0.3, 0], [1.6, 0.18, 0.05], 0.24, 0.07, 10);
      const rp = new THREE.CylinderGeometry(0.62, 0.55, 0.22, 12); rp.rotateZ(PI / 2);
      k.geo(MAT.dirt(), rp, mtx([-1.6, 0.55, 0]));
      for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28; k.limb(MAT.bark(), [-1.62, 0.55, 0], [-1.7, 0.55 + Math.sin(a) * 0.75, Math.cos(a) * 0.75], 0.04, 0.01, 4); }
      const nd = MAT.needles();
      for (let i = 0; i < 9; i++) {
        const f = i / 9, x = 0.1 + f * 1.6, s = 1.1 - f * 0.6;
        [-1, 1].forEach((sd) => { const g = new THREE.PlaneGeometry(0.9 * s, 0.7 * s); k.geo(nd, g, mtx([x, 0.3 + (i % 3) * 0.12, sd * 0.35 * s], [-PI / 2 + sd * 0.5, sd * 0.2, 0.3])); });
        const g2 = new THREE.PlaneGeometry(0.8 * s, 0.8 * s); k.geo(nd, g2, mtx([x, 0.55 * s + 0.2, 0], [0, 0, 0.6 + i]));
      }
    } else {
      [[-0.2, 0.0, 0.3], [0.45, 0.25, -0.4]].forEach(([x, z, a]) => k.log(MAT.bark(), MAT.logEnd(), 0.4, 0.22, [x, 0.22, z], a));
      k.geo(R3.mat('sawdust', () => R3.std({ color: 0xc9a27a, roughness: 1, transparent: true, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -3 })), new THREE.CircleGeometry(0.5, 12), mtx([0.1, 0.01, 0], [-PI / 2, 0, 0], [1.4, 1, 1]));
    }
    k.build({ into: inner }); grp.add(inner);
    if (roadIsEW(areaId, o.x, o.y) && !ok) inner.rotation.y = PI / 2 - 0.15;
    return result(grp);
  };
  function snareModel(k, state) {
    k.box(MAT.timber(), [0.04, 0.32, 0.04], [-0.12, 0.13, 0], [0, 0, 0.1]);
    const wire = MAT.plain(0x9a9ca0, 0.35, 0.8);
    if (state === 'broken') { k.limb(wire, [-0.1, 0.12, 0], [0.05, 0.1, 0.06], 0.003, 0.003, 3); k.limb(wire, [0.05, 0.1, 0.06], [0.12, 0.02, -0.04], 0.003, 0.003, 3); return; }
    k.limb(wire, [-0.1, 0.12, 0], [0.04, 0.12, 0], 0.003, 0.003, 3);
    if (state === 'set') k.geo(wire, new THREE.TorusGeometry(0.07, 0.003, 4, 14), mtx([0.11, 0.12, 0], [0, PI / 2, 0]));
    else k.geo(wire, new THREE.TorusGeometry(0.05, 0.003, 4, 12), mtx([0.09, 0.02, 0], [PI / 2, 0, 0], [1, 0.6, 1]));
  }
  function rabbitModel(k, white) {
    const f = MAT.fur(white ? 0xd8d4cc : 0x7a6450);
    k.geo(f, softBox(0.3, 0.13, 0.15, 0.8), mtx([0.2, 0.07, 0.0], [PI / 2 - 0.15, 0, 0.1]));
    k.geo(f, new THREE.SphereGeometry(0.06, 10, 8), mtx([0.04, 0.06, 0.02], null, [1.2, 1, 1]));
    [-0.02, 0.02].forEach((z) => k.geo(f, new THREE.SphereGeometry(0.03, 6, 4), mtx([-0.04, 0.03, z + 0.04], null, [3, 0.4, 1])));
    k.geo(MAT.fur(0xe8e4dc), new THREE.SphereGeometry(0.03, 6, 5), mtx([0.36, 0.06, 0.0]));
    k.box(MAT.plain(0x3a0a08, 0.4), [0.12, 0.004, 0.08], [0.08, 0.002, 0.1]);
  }
  MOD['fi:snare'] = function (o, a, key) {
    const state = key.split(':')[2] || 'set';
    const grp = new THREE.Group(), k = new Kit();
    snareModel(k, state === 'caught' ? 'tight' : state === 'raided' || state === 'empty' ? 'tight' : state);
    if (state === 'caught') { const s = fishingSnare(o); rabbitModel(k, s && s.animal === 'hare'); }
    if (state === 'raided') {
      for (let i = 0; i < 6; i++) k.geo(MAT.fur(0x8a7a66), softBox(0.06, 0.03, 0.05, 0.9), mtx([0.1 + hashf(i, 1) * 0.4 - 0.2, 0.015, hashf(i, 2) * 0.4 - 0.2], [0, i, 0]));
      k.box(MAT.plain(0x3a0a08, 0.4), [0.16, 0.004, 0.1], [0.1, 0.003, 0.05], [0, 0.6, 0]);
    }
    k.build({ into: grp });
    return result(grp);
  };
  function fishingSnare(o) { try { const m = NW.Fishing.state(); return m.snares.find((s) => s.id === o.snare); } catch (e) { return null; } }
  MOD['ms:snares'] = function () { const grp = new THREE.Group(), k = new Kit(); snareModel(k, 'set'); k.build({ into: grp }); return result(grp); };
  MOD['ms:camera'] = function (o, a, key) {
    const grp = new THREE.Group(), k = new Kit(), ok = msOk(key);
    k.box(MAT.timber(), [0.14, 1.3, 0.14], [0, 0.65, -0.12]);
    const camo = MAT.paint(0x4a4a30, { snowTop: 0.6 });
    k.box(camo, [0.16, 0.22, 0.1], [0, 1.0, -0.0]);
    k.box(MAT.plain(0x0a0a0c, 0.2), [0.07, 0.07, 0.01], [0, 1.03, 0.051]);
    k.box(MAT.plain(0x1a1a1a, 0.8), [0.18, 0.03, 0.26], [0, 1.0, -0.12]);
    k.build({ into: grp });
    const lm = glowStd(0x200000, 0xff2010, 0);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), lm); led.position.set(0.05, 0.93, 0.052); grp.add(led);
    return result(grp, (dt, ob, ctx) => { lm.emissiveIntensity = !ok && Math.sin(ctx.t * 3 + (ob ? ob.x : 0)) > 0.85 ? 6 : 0; });
  };
  MOD['ms:sign'] = function (o, a, key) {
    const grp = new THREE.Group(), k = new Kit(), ok = msOk(key), sm = picMat('keepout');
    if (ok) {
      [-0.42, 0.42].forEach((x) => k.box(MAT.timber(), [0.1, 1.6, 0.1], [x, 0.8, -0.1]));
      k.box(MAT.boards({ snowTop: 0.8 }), [1.25, 0.65, 0.05], [0, 1.25, -0.04]);
      k.geo(sm, new THREE.PlaneGeometry(1.15, 0.57), mtx([0, 1.25, -0.012]));
    } else {
      k.box(MAT.timber(), [0.1, 0.7, 0.1], [0.5, 0.33, -0.05], [0, 0, 0.12]);
      k.box(MAT.boards({ snowTop: 0.8 }), [1.25, 0.05, 0.65], [-0.1, 0.06, 0.05], [0.1, 0.1, 0.05]);
      k.geo(sm, new THREE.PlaneGeometry(1.15, 0.57), mtx([-0.1, 0.09, 0.05], [-PI / 2 + 0.1, 0, 0.1]));
    }
    k.build({ into: grp });
    return result(grp);
  };
  MOD['ms:tower'] = function () {
    const grp = new THREE.Group(), k = new Kit();
    k.box(MAT.dark({ snowTop: 0 }), [0.5, 0.95, 0.5], [0, 0.47, 0]);
    k.cyl(MAT.dark({ snowTop: 0 }), 0.4, 0.4, 0.06, [0, 0.98, 0], null, 24);
    k.geo(picMat('finder'), new THREE.CircleGeometry(0.36, 32), mtx([0, 1.013, 0], [-PI / 2, 0, 0]));
    k.geo(MAT.brass(), new THREE.TorusGeometry(0.37, 0.012, 5, 32), mtx([0, 1.015, 0], [PI / 2, 0, 0]));
    [-1, 1].forEach((s) => { k.box(MAT.brass(), [0.03, 0.22, 0.008], [s * 0.36, 1.12, 0], [0, PI / 2, 0]); k.box(MAT.metal(), [0.002, 0.15, 0.002], [s * 0.36, 1.14, 0]); });
    k.box(MAT.brass(), [0.72, 0.01, 0.02], [0, 1.02, 0]);
    k.build({ into: grp });
    return result(grp);
  };
  // ---- characters
  MOD['ch:tent'] = function (o, a, key) {
    const torn = /torn/.test(key);
    const grp = new THREE.Group(), k = new Kit();
    let g = new THREE.SphereGeometry(1, 18, 8, 0, PI * 2, 0, PI / 2);
    g.scale(0.85, 1.1, 0.75);
    const fab = R3.mat('domeTent', () => R3.std({ color: 0x2c4a7a, roughness: 0.75, side: THREE.DoubleSide }, { snowTop: 0.8, weather: 0 }));
    k.geo(fab, g, mtx([0, 0, -0.55]));
    const fly = new THREE.SphereGeometry(1.02, 18, 4, 0, PI * 2, 0, 0.6); fly.scale(0.85, 1.1, 0.75);
    k.geo(R3.mat('domeFly', () => R3.std({ color: 0x8a6a1a, roughness: 0.7, side: THREE.DoubleSide }, { snowTop: 0.8, weather: 0 })), fly, mtx([0, 0, -0.55]));
    const door = new THREE.CircleGeometry(0.32, 14); door.scale(0.9, 1.3, 1);
    k.geo(MAT.black(), door, mtx([0, 0.38, 0.19], [-0.25, 0, 0]));
    const pole = MAT.metal();
    [0.8, -0.8].forEach((r) => k.geo(pole, new THREE.TorusGeometry(0.8, 0.008, 4, 20, PI), mtx([0, 0, -0.55], [0, r, 0], [1, 1.37, 1])));
    if (torn) [[0.4, 0.5, 0.2], [-0.3, 0.7, -0.2]].forEach(([x, y, r]) => k.box(MAT.black(), [0.05, 0.28, 0.01], [x, y, -0.55 + 0.7], [0.3, x, r]));
    k.build({ into: grp });
    return result(grp);
  };
  MOD['ch:tripod'] = function () {
    const grp = new THREE.Group(), k = new Kit(), m = MAT.metal();
    [0, 2.1, 4.2].forEach((a) => k.limb(m, [0, 0.65, 0], [Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32], 0.012, 0.012, 4));
    k.box(MAT.paint(0x5a6066), [0.24, 0.18, 0.16], [0, 0.78, 0]);
    k.box(MAT.plain(0x1a2a3a, 0.2), [0.08, 0.06, 0.01], [-0.05, 0.8, 0.081]);
    k.limb(m, [0.08, 0.86, 0], [0.08, 1.35, 0], 0.006, 0.003, 4);
    k.limb(MAT.plain(0x101010, 0.6), [0.1, 0.7, 0], [0.3, 0.0, 0.2], 0.008, 0.008, 4);
    k.build({ into: grp });
    const lm = glowStd(0x200000, 0xff2010, 0);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), lm); led.position.set(0.07, 0.82, 0.082); grp.add(led);
    return result(grp, (dt, ob, ctx) => { lm.emissiveIntensity = Math.sin(ctx.t * 4) > 0 ? 5 : 0.1; });
  };
  MOD['ch:fire'] = function (o) {
    const grp = new THREE.Group(), k = new Kit(), emb = glowStd(0x1a0a04, 0xff5a10, 2);
    fireRing(k, 7, 0.32, 77, emb);
    [0, 2.1, 4.2].forEach((a) => k.limb(MAT.bark(), [Math.cos(a) * 0.28, 0.02, Math.sin(a) * 0.28], [0, 0.3, 0], 0.04, 0.03, 6));
    k.build({ into: grp });
    const fx = fireFx(grp, 0.08, 1, 21);
    const key = 'chfire' + Math.round(o.x) + Math.round(o.y);
    return result(grp, (dt, ob, ctx) => {
      const f = flick(key);
      emb.emissiveIntensity = 1.5 + f * 2;
      fx(ctx.t, 1, ctx.cam);
      addLightAt(ctx, grp, 0, 0.45, 0, { key, color: [1, 0.5, 0.2], intensity: 6, range: 8, flicker: 'fire', seed: 5, shadow: 1, glow: 0.7, glowIntensity: 0.6 });
    });
  };
  MOD['ch:wren'] = function () {
    const grp = new THREE.Group(), k = new Kit();
    const w = (NW.Characters && NW.Characters.cast && NW.Characters.cast.pell && NW.Characters.cast.pell.wren) || { skin: '#c99a76', hair: '#08090e', hatColor: '#d2a838' };
    k.geo(MAT.canvas(0x3c5a3a, { snowTop: 0.3 }), softBox(1.6, 0.24, 0.6, 0.7), mtx([-0.1, 0.12, 0]));
    k.geo(MAT.canvas(0x2c4a2c), softBox(0.4, 0.26, 0.62, 0.8), mtx([0.55, 0.14, 0]));
    k.geo(MAT.plain(new THREE.Color(w.skin).getHex(), 0.6), new THREE.SphereGeometry(0.1, 12, 10), mtx([0.78, 0.17, 0.0], null, [1, 0.9, 0.9]));
    k.geo(MAT.wool(new THREE.Color(w.hatColor).getHex()), new THREE.SphereGeometry(0.105, 12, 8, 0, PI * 2, 0, PI / 2), mtx([0.82, 0.17, 0.0], [0, 0, -PI / 2 + 0.2]));
    k.geo(MAT.plain(new THREE.Color(w.hair).getHex(), 0.7), softBox(0.1, 0.05, 0.16, 0.8), mtx([0.8, 0.1, 0.06]));
    k.geo(MAT.plain(0x161214, 0.8), new THREE.SphereGeometry(0.075, 8, 6), mtx([0.65, 0.16, 0.0]));
    k.build({ into: grp });
    return result(grp);
  };
  MOD['ch:duffel'] = function () {
    const grp = new THREE.Group(), k = new Kit();
    k.geo(MAT.canvas(0x2c3c2a, { snowTop: 0.5 }), softBox(0.7, 0.3, 0.32, 0.85), mtx([0, 0.15, 0], [0, 0.2, 0]));
    k.box(MAT.plain(0x101010, 0.7), [0.3, 0.02, 0.04], [0, 0.31, 0], [0, 0.2, 0]);
    k.build({ into: grp });
    return result(grp);
  };
  // ---- fishing
  MOD['fi:hole'] = function () {
    const grp = new THREE.Group(), k = new Kit(), hz = -25 * K;
    k.geo(R3.mat('holeWater', () => R3.std({ color: 0x02060a, roughness: 0.05, metalness: 0.2 })), new THREE.CircleGeometry(0.26, 18), mtx([0, 0.005, hz], [-PI / 2, 0, 0]));
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; k.geo(MAT.snow(), rockGeo(i + 70, 0.09, 0.05, 0.08, 0.4, 1), mtx([Math.cos(a) * 0.32, 0.02, hz + Math.sin(a) * 0.32])); }
    for (let i = 0; i < 6; i++) k.geo(TM('ice', {}), rockGeo(i + 90, 0.06, 0.02, 0.05, 0.5, 0), mtx([0.4 + hashf(i, 1) * 0.4 - 0.2, 0.01, hz + 0.3 + hashf(i, 2) * 0.3], [0, i, 0]));
    // bucket with a little ice, the ice auger leaning on it
    k.cyl(MAT.paint(0x7a8088, { snowTop: 0.5 }), 0.12, 0.14, 0.26, [0.4, 0.13, -0.1], null, 14, false, null, true);
    k.geo(MAT.plain(0x101418, 0.2), new THREE.CircleGeometry(0.13, 14), mtx([0.4, 0.2, -0.1], [-PI / 2, 0, 0]));
    k.geo(MAT.metal(), new THREE.TorusGeometry(0.13, 0.004, 4, 12, PI), mtx([0.4, 0.26, -0.1], [0, 0.4, 0]));
    k.limb(MAT.metal(), [0.62, 0.0, -0.25], [0.5, 1.0, -0.15], 0.02, 0.02, 6);
    k.build({ into: grp });
    const rip = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.075, 20), R3.mat('ripple', () => { const m = R3.basic({ color: 0x8aa8c0, transparent: true, opacity: 0.4, depthWrite: false }); m.userData.noShadow = true; return m; }));
    rip.rotation.x = -PI / 2; rip.position.set(0, 0.01, hz); grp.add(rip);
    return result(grp, (dt, ob, ctx) => { const r = (ctx.t * 0.7) % 1; rip.scale.setScalar(0.5 + r * 2.5); });
  };
  MOD['fi:pool'] = function (o, areaId) {
    const grp = new THREE.Group(), k = new Kit();
    let sp = null; try { sp = NW.Fishing.spots(areaId).find((p) => p.x === o.x && p.y === o.y); } catch (e) { sp = null; }
    const side = sp ? sp.side : 1, wx = sp ? (sp.wx - o.x) * K : 0.8, wz = sp ? (sp.wy - o.y) * K : -0.25;
    k.geo(MAT.rock(), rockGeo(side + 3, 0.18, 0.06, 0.14, 0.3, 1), mtx([side * 0.15, 0.03, -0.1]));
    k.limb(MAT.bark(), [side * 0.15, 0, -0.1], [side * 0.17, 0.45, -0.12], 0.015, 0.012, 5);
    k.limb(MAT.bark(), [side * 0.17, 0.4, -0.12], [side * 0.24, 0.52, -0.12], 0.01, 0.006, 4);
    k.limb(MAT.bark(), [side * 0.17, 0.4, -0.12], [side * 0.1, 0.53, -0.12], 0.01, 0.006, 4);
    k.build({ into: grp });
    const rings = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.12, 24), R3.mat('ripple', () => R3.basic({ color: 0x8aa8c0, transparent: true, opacity: 0.4, depthWrite: false }))); m.rotation.x = -PI / 2; m.position.set(wx, -0.05, wz + 0.1); grp.add(m); return m; });
    return result(grp, (dt, ob, ctx) => rings.forEach((m, i) => { const r = (ctx.t * 0.5 + i * 0.5) % 1; m.scale.setScalar(0.3 + r * 3); }));
  };
  // ---- upgrades (the bench is a real object; the rest are decorations placed against the cabin)
  const upM = () => { const s = st(); return (s && s.mods && s.mods.upgrades) || { built: {} }; };
  const upHas = (id) => !!(upM().built && upM().built[id]);
  MOD['up:bench'] = function () {
    const grp = new THREE.Group(), k = new Kit(), wd = TM('wood_plank', {}), dk = TM('wood_plank_dark', {});
    const z0 = -0.45;
    k.box(wd, [2.1, 0.09, 0.85], [0, 0.88, z0]);
    [[-0.95, -0.35], [0.95, -0.35], [-0.95, 0.35], [0.95, 0.35]].forEach(([x, z]) => k.box(dk, [0.1, 0.84, 0.1], [x, 0.42, z0 + z]));
    k.box(dk, [1.9, 0.05, 0.7], [0, 0.18, z0]);
    k.box(dk, [2.1, 0.7, 0.04], [0, 1.25, z0 - 0.43]);
    // vise, tools on the backboard, a can of nails
    k.box(TM('cast_iron', {}), [0.14, 0.12, 0.18], [0.8, 0.98, z0 + 0.3]); k.cyl(TM('metal_dark', {}), 0.01, 0.01, 0.3, [0.8, 0.99, z0 + 0.45], [0, 0, PI / 2], 5);
    [[-0.7, 0.18], [-0.45, 0.3], [-0.2, 0.25], [0.2, 0.22]].forEach(([x, h]) => { k.box(TM('wood_plank_dark', {}), [0.025, h, 0.025], [x, 1.25, z0 - 0.4]); k.box(TM('metal_dark', {}), [0.1, 0.05, 0.02], [x, 1.25 + h / 2, z0 - 0.4]); });
    k.box(TM('metal_dark', {}), [0.5, 0.06, 0.02], [0.4, 1.4, z0 - 0.4], [0, 0, 0.1]);
    k.cyl(TM('metal_rust', {}), 0.06, 0.06, 0.12, [-0.85, 0.99, z0 + 0.1], null, 10);
    k.build({ into: grp });
    const kp = new Kit(); kp.box(TM('wood_plank', { color: 0xb08a5a }), [0.9, 0.06, 0.25], [0.0, 0.96, z0 + 0.05]); kp.box(TM('wood_plank', { color: 0xb08a5a }), [0.8, 0.06, 0.22], [0.05, 1.02, z0 + 0.08], [0, 0.08, 0]);
    const proj = kp.build(); grp.add(proj);
    return result(grp, () => { proj.visible = !!upM().proj; });
  };
  function roomWorld(roomId, x, y, h) { const v = R3.toWorld(roomId, x, y); v.y += h || 0; return v; }
  // decorations position themselves in world coordinates (obj.userData.fixed)
  function fixedDeco(build) {
    const grp = new THREE.Group(); grp.userData.fixed = true;
    let sig = null, kids = null;
    const update = (dt, o, ctx) => {
      const s2 = build.sig(ctx);
      if (s2 === sig) { if (build.anim && kids) build.anim(kids, ctx); return; }
      sig = s2;
      while (grp.children.length) { const c = grp.children.pop(); disposeObj(c); }
      kids = build.make(grp, ctx);
    };
    return { obj: grp, update, dispose: () => disposeObj(grp) };
  }
  const iron = () => TM('cast_iron', {});
  MOD['up:wall'] = function (o, areaId) {
    return fixedDeco({
      sig: () => { const s = st(), a = W.get(areaId); return [upHas('shutters'), upHas('bars'), upHas('reflectors'), upHas('curtains')].join() + '|' + a.objs.filter((q) => q.type === 'window').map((q) => { const w = s.cabin.windows[q.wid]; return w ? [w.boarded, w.shutClosed, w.shutter > 0] : 0; }).join() + '|' + Object.keys(s.cabin.doors).map((d) => { const dd = s.cabin.doors[d]; return [dd.open, dd.hp > 0, (NW.G.doorAnim[d] || 0) > 0]; }).join(); },
      make: (grp) => {
        const s = st(), a = W.get(areaId), k = new Kit();
        a.objs.forEach((q) => {
          if (q.type === 'window' && upHas('shutters')) {
            const w = s.cabin.windows[q.wid]; if (!w || w.boarded > 0 || !(w.shutClosed && w.shutter > 0)) return;
            const top = q.side === 'top', zpx = top ? 32 : q.y, c = roomWorld(areaId, q.x + q.w / 2, zpx, 0), out = top ? -1 : 1;
            [1.15, 1.6].forEach((y) => { k.box(iron(), [q.w * K + 0.1, 0.06, 0.015], [c.x, c.y + y, c.z + out * 0.24]); for (let i = -1; i <= 1; i++) k.box(TM('metal_dark', {}), [0.025, 0.025, 0.02], [c.x + i * q.w * K * 0.4, c.y + y, c.z + out * 0.25]); });
          }
          if (q.type === 'door' && upHas('bars')) {
            const d = s.cabin.doors[q.did]; if (!d || d.open || d.hp <= 0 || (NW.G.doorAnim[q.did] || 0) > 0) return;
            if (q.side === 'bottom') { const c = roomWorld(areaId, q.x + q.w / 2, q.y, 1.0); k.box(iron(), [q.w * K + 0.25, 0.08, 0.05], [c.x, c.y, c.z - 0.06]); [-1, 1].forEach((sd) => k.box(iron(), [0.06, 0.16, 0.08], [c.x + sd * (q.w * K / 2 + 0.1), c.y, c.z - 0.05])); }
            else { const c = roomWorld(areaId, q.x, q.y + q.h / 2, 1.0); k.box(iron(), [0.05, 0.08, q.h * K + 0.25], [c.x - 0.06, c.y, c.z]); [-1, 1].forEach((sd) => k.box(iron(), [0.08, 0.16, 0.06], [c.x - 0.05, c.y, c.z + sd * (q.h * K / 2 + 0.1)])); }
          }
          if (q.type === 'lamp' && q.style === 'wall' && upHas('reflectors')) {
            const c = roomWorld(areaId, q.hx, 32, 1.75);
            const dish = new THREE.SphereGeometry(0.16, 14, 6, 0, PI * 2, 0, 0.9); dish.rotateX(PI / 2);
            k.geo(R3.mat('tinDish', () => R3.std({ color: 0xb8b8b4, roughness: 0.3, metalness: 0.9, side: THREE.DoubleSide })), dish, mtx([c.x, c.y, c.z + 0.02]));
          }
        });
        k.build({ into: grp });
      },
    });
  };
  MOD['up:tablelamp'] = function (o, areaId) {
    return fixedDeco({
      sig: () => 'x',
      make: (grp) => {
        const a = W.get(areaId), q = a.objs.find((x) => x.type === 'lamp' && x.style !== 'wall'); if (!q) return;
        const c = roomWorld(areaId, q.hx, q.hy - 6, 0.82), k = new Kit();
        const dish = new THREE.SphereGeometry(0.12, 14, 6, 0, PI * 2, 0, 0.9); dish.rotateX(PI / 2);
        k.geo(R3.mat('tinDish', () => R3.std({ color: 0xb8b8b4, roughness: 0.3, metalness: 0.9, side: THREE.DoubleSide })), dish, mtx([c.x, c.y + 0.15, c.z - 0.12]));
        k.box(TM('metal_dark', {}), [0.02, 0.2, 0.02], [c.x, c.y + 0.05, c.z - 0.13]);
        k.build({ into: grp });
      },
    });
  };
  const stoveAt = (areaId) => { const a = W.get(areaId), q = a.objs.find((x) => x.type === 'stove'); return q ? roomWorld(areaId, q.cx + q.cw / 2, q.cy + q.ch / 2 - 4, 0) : null; };
  MOD['up:stove'] = function (o, areaId) {
    return fixedDeco({
      sig: () => [upHas('damper'), upHas('firebox')].join(),
      make: (grp) => {
        const c = stoveAt(areaId); if (!c) return; const k = new Kit();
        if (upHas('damper')) { k.geo(iron(), new THREE.TorusGeometry(0.1, 0.015, 6, 16), mtx([c.x, c.y + 1.45, c.z - 0.1], [PI / 2, 0, 0])); k.box(TM('metal_dark', {}), [0.25, 0.015, 0.015], [c.x + 0.12, c.y + 1.45, c.z - 0.1]); k.geo(MAT.plain(0x8a1a14, 0.5), new THREE.SphereGeometry(0.025, 8, 6), mtx([c.x + 0.25, c.y + 1.45, c.z - 0.1])); }
        if (upHas('firebox')) k.box(iron(), [0.82, 0.05, 0.6], [c.x, c.y + 0.45, c.z]);
        k.build({ into: grp });
      },
    });
  };
  MOD['up:box'] = function (o, areaId) {
    return fixedDeco({
      sig: () => String(Math.min(30, st().woodbox)),
      make: (grp) => {
        const k = new Kit(), c = roomWorld(areaId, 42, 58, 0), wd = TM('wood_plank', {});
        openBox(k, wd, 0.55, 0.55, 0.62, 0.03, null);
        const n = Math.max(0, Math.min(30, st().woodbox) - (D.WOODBOX_CAP || 15));
        for (let i = 0; i < Math.min(n, 12); i++) k.log(TM('bark_pine', {}), TM('wood_log_end', {}), 0.5, 0.06, [0, 0.1 + Math.floor(i / 4) * 0.12, -0.2 + (i % 4) * 0.13], PI / 2);
        k.build({ into: grp }); grp.children.forEach((m) => { m.position.add(c); });
      },
    });
  };
  MOD['up:rack'] = function (o, areaId) {
    let smoke = null;
    return fixedDeco({
      sig: () => (upM().rack || []).map((r) => r.id + (r.t >= 180 ? 'r' : r.t > 60 ? 'h' : '')).join(),
      make: (grp) => {
        const c = stoveAt(areaId); if (!c) return null; const k = new Kit();
        k.box(TM('wood_plank_dark', {}), [1.5, 0.05, 0.05], [c.x, c.y + 1.85, c.z - 0.15]);
        [-1, 1].forEach((s) => k.box(TM('metal_dark', {}), [0.02, 0.35, 0.02], [c.x + s * 0.7, c.y + 2.0, c.z - 0.15]));
        const rk = upM().rack || [];
        [-0.55, -0.35, 0.35, 0.55].forEach((x, i) => {
          k.box(TM('metal_dark', {}), [0.006, 0.08, 0.006], [c.x + x, c.y + 1.79, c.z - 0.15]);
          const r = rk[i]; if (!r) return;
          const kk = clamp(r.t / 180, 0, 1), col = new THREE.Color(0x8a2a20).lerp(new THREE.Color(0x3a1a10), kk);
          k.geo(MAT.plain(col.getHex(), 0.5), softBox(0.08, 0.28, 0.03, 0.6), mtx([c.x + x, c.y + 1.6, c.z - 0.15]));
        });
        k.build({ into: grp });
        smoke = Particles({ n: 6, tex: 'puff', color: 0xb0b4bc, speed: 0.12, rise: 0.6, spread: 0.6, wobble: 0.1, s0: 0.15, s1: 0.5, alpha: 0.25, seed: 4 });
        smoke.mesh.position.set(c.x, c.y + 1.55, c.z - 0.15); grp.add(smoke.mesh);
        return { smoke };
      },
      anim: (kids, ctx) => { if (kids && kids.smoke) kids.smoke.update(ctx.t, (upM().rack || []).length && NW.Survival.stoveLit() ? 1 : 0, ctx.cam); },
    });
  };
  MOD['up:ext'] = function () {
    let cans = null;
    return fixedDeco({
      sig: () => { const s = st(); return [upHas('alarm'), upHas('shutters')].join() + ['w_front_l', 'w_front_r'].map((w) => { const x = s.cabin.windows[w]; return x ? [x.boarded, x.shutClosed, x.shutter > 0] : 0; }).join(); },
      make: (grp) => {
        const s = st(), k = new Kit();
        cans = [];
        if (upHas('alarm')) {
          [[140, 330, 176], [338, 390, 160]].forEach(([a, b, zf]) => {
            const A = roomWorld('f_2_2', a, zf + 7, 2.05), B = roomWorld('f_2_2', b, zf + 7, 2.05); A.y = B.y = Math.max(A.y, B.y);
            k.limb(MAT.plain(0x5a4a3a, 0.9), [A.x, A.y, A.z], [B.x, B.y, B.z], 0.004, 0.004, 3);
            for (let x = a + 4, i = 0; x < b - 3; x += 11, i++) {
              if (x > 226 && x < 254) continue;
              const P = roomWorld('f_2_2', x, zf + 7, 0); const L = 0.15 + (i % 2) * 0.06;
              const piv = new THREE.Group(); piv.position.set(P.x, A.y, P.z);
              const can = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.11, 10), MAT.plain(i % 3 ? 0x8a8c90 : 0xa08a40, 0.35, 0.7)); can.position.y = -L - 0.055; can.castShadow = true;
              const str = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, L, 3), MAT.plain(0x5a4a3a, 0.9)); str.position.y = -L / 2;
              piv.add(can, str); grp.add(piv); cans.push(piv);
            }
          });
        }
        if (upHas('shutters')) [['w_front_l', 184], ['w_front_r', 272]].forEach(([wid, wx]) => {
          const w = s.cabin.windows[wid]; if (!w || w.boarded > 0) return;
          const closed = w.shutClosed && w.shutter > 0;
          const c = roomWorld('f_2_2', wx + 12, 176, 0);
          [1.15, 1.6].forEach((y) => { if (closed) k.box(iron(), [1.3, 0.06, 0.015], [c.x, c.y + y, c.z + 0.1]); else [-1, 1].forEach((sd) => k.box(iron(), [0.08, 0.06, 0.02], [c.x + sd * 0.7, c.y + y, c.z + 0.08])); });
        });
        k.build({ into: grp });
        return { cans };
      },
      anim: (kids, ctx) => { const w = R3.U.uWind.value.z; kids.cans.forEach((p, i) => { p.rotation.z = Math.sin(ctx.t * 2.5 + i) * 0.08 * (0.3 + w); }); },
    });
  };

  // ---- places: interior objects (built by buildInterior)
  const nameOf = (o) => { try { return typeof o.name === 'function' ? o.name() : o.name || ''; } catch (e) { return ''; } };
  const IN = (name, o) => TM(name, Object.assign({}, o));
  MOD['pl:scope'] = function () {
    const grp = new THREE.Group(), k = new Kit(), m = IN('metal_dark');
    [0, 2.1, 4.2].forEach((a) => k.limb(m, [0, 1.2, 0], [Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], 0.015, 0.015, 5));
    k.cyl(m, 0.03, 0.03, 0.15, [0, 1.25, 0], null, 8);
    [-0.07, 0.07].forEach((x) => { k.cyl(IN('cast_iron'), 0.05, 0.045, 0.32, [x, 1.36, -0.05], [PI / 2, 0, 0], 12); k.cyl(MAT.plain(0x1a2a3a, 0.1, 0.2), 0.042, 0.042, 0.005, [x, 1.36, -0.211], [PI / 2, 0, 0], 12); });
    k.box(m, [0.14, 0.04, 0.06], [0, 1.36, -0.02]);
    k.build({ into: grp });
    return result(grp);
  };
  MOD['pl:cabinet'] = function () {
    const grp = new THREE.Group(), k = new Kit(), m = IN('metal_painted', { color: 0x4a5448 });
    k.box(m, [0.95, 1.35, 0.45], [0, 0.675, -0.22]);
    for (let i = 0; i < 3; i++) { k.box(IN('metal_dark'), [0.85, 0.01, 0.01], [0, 0.4 + i * 0.4, 0.006]); k.box(IN('brass'), [0.12, 0.025, 0.02], [0, 0.55 + i * 0.4 - 0.12, 0.01]); }
    k.build({ into: grp });
    const kd = new Kit(); kd.box(m, [0.85, 0.36, 0.42], [0, 1.15, 0.0]); kd.box(MAT.plain(0x0c0c0c, 1), [0.8, 0.005, 0.38], [0, 1.31, 0.0]);
    const drawer = kd.build(); grp.add(drawer);
    return result(grp, (dt, o) => { drawer.position.z = /searched/.test(nameOf(o)) ? 0.0 : -0.22; drawer.visible = /searched/.test(nameOf(o)); });
  };
  MOD['pl:cot'] = function (o) {
    const grp = new THREE.Group(), k = new Kit(), L = (o.ch || 46) * K, Wd = (o.cw || 22) * K * 0.9;
    const fr = IN('wood_plank_dark');
    [-1, 1].forEach((s) => k.box(fr, [0.05, 0.05, L], [s * Wd / 2, 0.42, 0]));
    [-1, 1].forEach((s) => [-1, 1].forEach((t) => k.limb(fr, [s * Wd / 2, 0.42, t * L / 2 * 0.9], [-s * Wd / 2, 0.02, t * L / 2 * 0.9], 0.02, 0.02, 4)));
    k.box(IN('fabric_canvas', { color: 0x3c4430 }), [Wd, 0.03, L - 0.05], [0, 0.44, 0]);
    k.geo(IN('fabric_wool', { color: 0x5a4a3a }), softBox(Wd - 0.05, 0.1, L * 0.55, 0.6), mtx([0, 0.5, L * 0.18], [0.03, 0, 0]));
    k.geo(IN('fabric_canvas', { color: 0xc8c0a8 }), softBox(0.5, 0.1, 0.3, 0.8), mtx([0, 0.52, -L / 2 + 0.25]));
    k.build({ into: grp });
    return result(grp);
  };
  MOD['pl:logdesk'] = function () {
    const grp = new THREE.Group(), k = new Kit(), wd = IN('wood_plank');
    k.box(wd, [1.8, 0.06, 0.6], [0, 0.78, -0.3]);
    [[-0.82, -0.05], [0.82, -0.05], [-0.82, -0.55], [0.82, -0.55]].forEach(([x, z]) => k.box(IN('wood_plank_dark'), [0.07, 0.76, 0.07], [x, 0.38, z]));
    k.geo(picMat('paperLines'), new THREE.PlaneGeometry(0.42, 0.3), mtx([-0.3, 0.815, -0.3], [-PI / 2, 0, 0.08]));
    k.box(IN('leather', { color: 0x1e2a3a }), [0.44, 0.02, 0.32], [-0.3, 0.8, -0.3], [0, -0.08, 0]);
    k.box(MAT.plain(0xc8a030, 0.6), [0.16, 0.008, 0.008], [0.0, 0.815, -0.2], [0, 0.5, 0]);
    k.cyl(MAT.plain(0x6a7a8a, 0.4, 0.4), 0.045, 0.04, 0.1, [0.5, 0.86, -0.4], null, 10);
    k.box(IN('metal_dark'), [0.25, 0.18, 0.18], [0.65, 0.9, -0.45]);
    k.build({ into: grp });
    return result(grp);
  };
  MOD['pl:stool'] = function () {
    const grp = new THREE.Group(), k = new Kit();
    k.cyl(IN('wood_plank'), 0.17, 0.17, 0.05, [0, 0.46, -0.1], null, 12);
    [0, 2.1, 4.2].forEach((a) => k.limb(IN('wood_plank_dark'), [Math.cos(a) * 0.1, 0.44, Math.sin(a) * 0.1 - 0.1], [Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18 - 0.1], 0.02, 0.02, 5));
    k.build({ into: grp });
    return result(grp);
  };
  MOD['pl:stove'] = function () {
    const grp = new THREE.Group(), k = new Kit(), ir = IN('cast_iron');
    const body = new THREE.SphereGeometry(0.3, 16, 12); body.scale(1, 1.2, 1);
    k.geo(ir, body, mtx([0, 0.55, -0.25]));
    k.cyl(ir, 0.26, 0.3, 0.12, [0, 0.2, -0.25], null, 16); k.cyl(ir, 0.3, 0.3, 0.05, [0, 0.9, -0.25], null, 16);
    [0, 1.57, 3.14, 4.71].forEach((a) => k.limb(ir, [Math.cos(a) * 0.22, 0.18, Math.sin(a) * 0.22 - 0.25], [Math.cos(a) * 0.27, 0, Math.sin(a) * 0.27 - 0.25], 0.025, 0.02, 5));
    k.cyl(ir, 0.07, 0.07, 1.6, [0, 1.7, -0.25], null, 10);
    k.box(IN('metal_dark'), [0.9, 0.04, 0.9], [0, 0.01, -0.25]);
    k.build({ into: grp });
    const fireMat = glowStd(0x1a0804, 0xff6a20, 0);
    const door = new THREE.Mesh(new THREE.CircleGeometry(0.11, 14), fireMat); door.position.set(0, 0.5, 0.06); door.scale.set(1, 0.8, 1); grp.add(door);
    const kd = new Kit(); for (let i = -2; i <= 2; i++) kd.box(ir, [0.012, 0.18, 0.01], [i * 0.04, 0.5, 0.065]); kd.build({ into: grp });
    return result(grp, (dt, o, ctx) => {
      const lit = /burning/.test(nameOf(o));
      fireMat.emissiveIntensity = lit ? 2 + 2.5 * flick('shackstove') : 0;
      if (lit) addLightAt(ctx, grp, 0, 0.55, 0.25, { key: 'shackstove', color: [1, 0.48, 0.18], intensity: 9, range: 9, flicker: 'fire', shadow: 3, glow: 0.35, glowIntensity: 0.6 });
    });
  };
  MOD['pl:kindling'] = function () {
    const grp = new THREE.Group(), k = new Kit();
    for (let i = 0; i < 11; i++) k.log(IN('bark_pine'), IN('wood_log_end'), 0.45, 0.065, [-0.2 + (i % 4) * 0.13 + (Math.floor(i / 4) % 2) * 0.06, 0.07 + Math.floor(i / 4) * 0.12, -0.2], PI / 2);
    k.build({ into: grp });
    return result(grp);
  };
  MOD['pl:bunk'] = function (o) {
    const grp = new THREE.Group(), k = new Kit(), L = (o.ch || 40) * K, Wd = (o.cw || 36) * K * 0.92, fr = IN('wood_log');
    [-1, 1].forEach((s) => k.box(fr, [0.1, 0.12, L], [s * Wd / 2, 0.42, 0]));
    [-1, 1].forEach((s) => [-1, 1].forEach((t) => k.box(fr, [0.1, 0.6, 0.1], [s * Wd / 2, 0.3, t * (L / 2 - 0.05)])));
    k.box(fr, [Wd, 0.5, 0.08], [0, 0.6, -L / 2]);
    k.box(IN('wood_plank'), [Wd, 0.04, L], [0, 0.42, 0]);
    k.geo(IN('fabric_canvas', { color: 0x4a4030 }), softBox(Wd - 0.1, 0.12, L - 0.1, 0.5), mtx([0, 0.5, 0]));
    k.geo(IN('fabric_wool', { color: 0x6a1a1c }), softBox(Wd - 0.05, 0.1, L * 0.6, 0.6), mtx([0, 0.58, L * 0.15], [0.04, 0.05, 0]));
    k.geo(IN('fur', { color: 0x7a7468 }), softBox(Wd * 0.6, 0.08, 0.6, 0.8), mtx([0.1, 0.65, L * 0.15], [0, 0.4, 0]));
    k.geo(IN('fabric_canvas', { color: 0xbab098 }), softBox(0.55, 0.12, 0.32, 0.8), mtx([0, 0.6, -L / 2 + 0.28]));
    k.build({ into: grp });
    return result(grp);
  };
  MOD['pl:table'] = function () {
    const grp = new THREE.Group(), k = new Kit(), wd = IN('wood_plank');
    k.box(wd, [1.7, 0.07, 0.75], [0, 0.76, -0.3]);
    [[-0.75, 0], [0.75, 0], [-0.75, -0.6], [0.75, -0.6]].forEach(([x, z]) => k.box(IN('wood_plank_dark'), [0.08, 0.74, 0.08], [x, 0.37, z]));
    k.geo(picMat('paperLines'), new THREE.PlaneGeometry(0.36, 0.25), mtx([-0.35, 0.8, -0.25], [-PI / 2, 0, -0.15]));
    k.cyl(IN('metal_dark'), 0.04, 0.035, 0.09, [-0.05, 0.84, -0.45], null, 10);
    // the lantern
    const lx = 0.4, lz = -0.35;
    k.cyl(IN('metal_dark'), 0.08, 0.08, 0.03, [lx, 0.81, lz], null, 10); k.cyl(IN('metal_dark'), 0.05, 0.07, 0.04, [lx, 1.06, lz], null, 10);
    [0, 1.57, 3.14, 4.71].forEach((a) => k.box(IN('metal_dark'), [0.008, 0.22, 0.008], [lx + Math.cos(a) * 0.065, 0.93, lz + Math.sin(a) * 0.065]));
    k.geo(IN('metal_dark'), new THREE.TorusGeometry(0.05, 0.004, 4, 12, PI), mtx([lx, 1.08, lz]));
    k.build({ into: grp });
    const gm = glowStd(0xfff0d0, 0xffb060, 2);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.2, 12, 1, true), gm); glass.position.set(lx, 0.93, lz); grp.add(glass);
    return result(grp, (dt, o, ctx) => {
      gm.emissiveIntensity = 1.5 + flick('shacklantern') * 1.5;
      addLightAt(ctx, grp, lx, 1.0, lz, { key: 'shacklantern', color: [1, 0.62, 0.3], intensity: 3.2, range: 6.5, flicker: 'lantern', seed: 2, shadow: 2, glow: 0.3, glowIntensity: 0.8 });
    });
  };
  MOD['pl:chair'] = function () {
    const grp = new THREE.Group(), k = new Kit(), wd = IN('wood_plank'), dk = IN('wood_plank_dark');
    k.box(wd, [0.45, 0.05, 0.42], [0, 0.46, -0.15]);
    [[-0.19, 0.03], [0.19, 0.03], [-0.19, -0.33], [0.19, -0.33]].forEach(([x, z]) => k.box(dk, [0.04, 0.46, 0.04], [x, 0.23, z]));
    k.box(dk, [0.04, 0.5, 0.04], [-0.19, 0.72, 0.03]); k.box(dk, [0.04, 0.5, 0.04], [0.19, 0.72, 0.03]); k.box(wd, [0.42, 0.12, 0.03], [0, 0.88, 0.03]);
    k.build({ into: grp }); grp.rotation.y = PI - 0.3;
    return result(grp);
  };
  MOD['pl:crate'] = function () {
    const c = container('crate'), grp = new THREE.Group(); c.grp.position.z = -0.25; grp.add(c.grp);
    return result(grp, (dt, o) => c.set(/searched/.test(nameOf(o))));
  };
  MOD['pl:barrel'] = function () {
    const grp = new THREE.Group(), k = new Kit();
    const g = new THREE.CylinderGeometry(0.28, 0.28, 0.8, 16, 6, false), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), f = 1 + 0.12 * Math.cos(y / 0.4 * PI / 2); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); }
    g.computeVertexNormals(); cylUV(g, 0.3, 0.8, false);
    k.geo(IN('wood_plank', { color: 0x5a3a22 }), g, mtx([0, 0.4, -0.25]));
    [0.12, 0.68].forEach((y) => k.cyl(IN('metal_dark'), 0.295, 0.295, 0.04, [0, y, -0.25], null, 16));
    k.build({ into: grp });
    return result(grp);
  };
  MOD['pl:prop'] = function () {
    const grp = new THREE.Group(), k = new Kit(), t = IN('wood_weathered');
    k.cyl(t, 0.12, 0.11, 2.4, [0, 1.2, -0.1], [0.03, 0, 0.02], 9);
    k.box(t, [0.9, 0.18, 0.22], [0, 2.38, -0.1]);
    k.box(IN('wood_plank_dark'), [0.15, 0.1, 0.2], [0.08, 2.25, -0.1], [0, 0, 0.3]);
    k.build({ into: grp });
    return result(grp);
  };
  MOD['pl:lamp'] = function () {
    const grp = new THREE.Group(), k = new Kit(), m = IN('cast_iron'), y = 1.85, z = 0.18;
    k.box(m, [0.04, 0.04, 0.22], [0, y + 0.22, z / 2]); k.box(m, [0.05, 0.3, 0.03], [0, y + 0.1, 0.01]);
    k.limb(m, [0, y + 0.22, z], [0, y + 0.12, z], 0.004, 0.004, 3);
    k.cyl(m, 0.06, 0.06, 0.03, [0, y - 0.13, z], null, 10); k.cyl(m, 0.035, 0.06, 0.05, [0, y + 0.08, z], null, 10);
    [0, 1.57, 3.14, 4.71].forEach((a) => k.box(m, [0.007, 0.18, 0.007], [Math.cos(a) * 0.05, y - 0.03, z + Math.sin(a) * 0.05]));
    k.build({ into: grp });
    const gm = glowStd(0x2a2620, 0xffa850, 0);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.17, 12, 1, true), gm); glass.position.set(0, y - 0.03, z); grp.add(glass);
    let key = 'minelamp' + Math.random().toString(36).slice(2, 6);
    return result(grp, (dt, o, ctx) => {
      const lit = /lit/.test(nameOf(o)) && !/dark/.test(nameOf(o));
      key = 'ml' + Math.round(o.x);
      gm.color.setHex(lit ? 0xfff0d0 : 0x2a2620);
      gm.emissiveIntensity = lit ? 1.5 + flick(key) * 2 : 0;
      if (lit) addLightAt(ctx, grp, 0, y - 0.05, z + 0.05, { key, color: [1, 0.6, 0.28], intensity: 7, range: 9, flicker: 'lantern', seed: o.x, shadow: 2, glow: 0.4, glowIntensity: 0.7 });
    });
  };
  MOD['pl:notice'] = function () {
    const grp = new THREE.Group(), k = new Kit();
    k.box(IN('wood_plank'), [1.4, 0.8, 0.04], [0, 1.45, 0.03]);
    k.geo(picMat('foreman'), new THREE.PlaneGeometry(1.0, 0.7), mtx([0, 1.45, 0.052]));
    k.build({ into: grp });
    return result(grp);
  };
  MOD['pl:cart'] = function () { const grp = new THREE.Group(), k = new Kit(); cartModel(k, false); k.build({ into: grp }); grp.children.forEach((c) => { c.rotation.y = PI / 2; c.position.z = -0.25; }); return result(grp); };
  MOD['pl:rubble'] = function () {
    const grp = new THREE.Group(), k = new Kit();
    for (let i = 0; i < 8; i++) k.geo(IN('rock'), rockGeo(i * 3 + 100, 0.25 + hashf(i, 1) * 0.25, 0.18 + hashf(i, 2) * 0.2, 0.22, 0.4, 1), mtx([(hashf(i, 3) - 0.5) * 1.4, 0.1, -0.25 + (hashf(i, 4) - 0.5) * 0.4]));
    k.box(IN('wood_weathered'), [1.4, 0.16, 0.16], [0, 0.35, -0.3], [0.1, 0.3, 0.25]);
    k.build({ into: grp });
    return result(grp);
  };
  MOD['pl:mag'] = function () {
    const grp = new THREE.Group(), k = new Kit(), wd = IN('wood_plank', { color: 0x5a4028 });
    k.box(wd, [1.25, 0.72, 0.65], [0, 0.36, -0.3]);
    k.box(IN('fabric_red', { color: 0x7a1a14 }), [1.255, 0.18, 0.655], [0, 0.42, -0.3]);
    [-0.55, 0.55].forEach((x) => k.box(IN('metal_dark'), [0.06, 0.74, 0.67], [x, 0.37, -0.3]));
    for (let i = 0; i < 4; i++) k.cyl(IN('paper', { color: 0xc8b890 }), 0.03, 0.03, 0.22, [-0.3 + i * 0.12, 0.82, -0.3], [PI / 2, 0, 0], 8);
    k.build({ into: grp });
    return result(grp);
  };
  MOD['pl:winze'] = function (o) {
    const grp = new THREE.Group(), k = new Kit(), t = IN('wood_weathered');
    const W2 = 1.3, D2 = 0.9;
    k.box(MAT.voidMat(), [W2, 7, D2], [0, -3.5, -0.55]);
    k.geo(MAT.black(), new THREE.PlaneGeometry(W2, D2), mtx([0, -6.9, -0.55], [-PI / 2, 0, 0]));
    [[0, -0.55 - D2 / 2 - 0.1, W2 + 0.4, 0.2], [0, -0.55 + D2 / 2 + 0.1, W2 + 0.4, 0.2]].forEach(([x, z, w, d]) => k.box(t, [w, 0.18, d], [x, 0.05, z]));
    [-1, 1].forEach((s) => k.box(t, [0.2, 0.18, D2], [s * (W2 / 2 + 0.1), 0.05, -0.55]));
    [-0.15, 0.15].forEach((x) => k.box(t, [0.06, 4, 0.06], [x, -1.8, -0.55 - D2 / 2 + 0.08]));
    for (let i = 0; i < 10; i++) k.box(IN('wood_plank_dark'), [0.36, 0.04, 0.04], [0, -0.2 - i * 0.38, -0.55 - D2 / 2 + 0.1]);
    k.build({ into: grp });
    void o;
    return result(grp);
  };
  MOD['pl:locker'] = function () {
    const grp = new THREE.Group(), k = new Kit(), m = IN('metal_painted', { color: 0x3a4a52 });
    k.box(m, [0.55, 1.75, 0.04], [0, 0.875, -0.45]); [-1, 1].forEach((s) => k.box(m, [0.03, 1.75, 0.45], [s * 0.26, 0.875, -0.24])); k.box(m, [0.55, 0.03, 0.45], [0, 1.74, -0.24]); k.box(m, [0.55, 0.03, 0.45], [0, 0.05, -0.24]);
    k.box(MAT.plain(0x0c0c0c, 1), [0.48, 1.6, 0.01], [0, 0.88, -0.42]);
    k.geo(MAT.plain(0xc8c0a8, 0.8), new THREE.PlaneGeometry(0.12, 0.16), mtx([0, 1.3, -0.41]));
    k.build({ into: grp });
    const piv = new THREE.Group(); piv.position.set(-0.27, 0, 0);
    const kd = new Kit(); kd.box(m, [0.53, 1.7, 0.025], [0.265, 0.875, 0]); for (let i = 0; i < 3; i++) kd.box(IN('metal_dark'), [0.3, 0.012, 0.005], [0.265, 1.5 - i * 0.04, 0.014]); kd.box(IN('metal_dark'), [0.02, 0.12, 0.03], [0.48, 0.95, 0.02]); kd.build({ into: piv });
    grp.add(piv);
    return result(grp, (dt, o) => { piv.rotation.y = /searched/.test(nameOf(o)) ? -1.9 : 0; });
  };

  // ================================================================== make()
  Pr.make = function (key, o, areaId) {
    let fn = null, sub = key;
    if (key.startsWith('struct:')) fn = S[key.slice(7)];
    else if (key.startsWith('loot:')) return makeLoot(key.slice(5), areaId);
    else if (key === 'sign') return makeSign(o);
    else if (key === 'cairn') return makeCairn(o);
    else if (key === 'drop') return makeDrop(o);
    else if (key.startsWith('ev:')) fn = EV[key.slice(3)];
    else {
      fn = MOD[key];
      if (!fn) { const base = key.split(':').slice(0, 2).join(':'); fn = MOD[base]; sub = key; }
    }
    if (!fn) return null;
    const r = fn(o || {}, areaId, sub);
    if (r && r.obj) r.obj.userData.r3key = key;
    return r;
  };
  Pr.keys = () => ({ struct: Object.keys(S), ev: Object.keys(EV), mod: Object.keys(MOD) });
  // interiors whose lights this file adds itself (the core may skip converting their 2D light lists)
  Pr.ownsLights = (areaId) => areaId === 'in_shack' || areaId === 'in_mine';

  // ================================================================== INTERIORS
  function mapEdges(a) {
    const T = W.T, walk = (tx, ty) => { const t = W.tile(a, tx, ty); return t === T.FLOOR || t === T.DOORWAY; };
    const runs = new Map(), exits = [];
    for (let ty = 0; ty < a.h; ty++) for (let tx = 0; tx < a.w; tx++) {
      if (!walk(tx, ty)) continue;
      const door = W.tile(a, tx, ty) === T.DOORWAY;
      [[0, -1, 'n'], [0, 1, 's'], [-1, 0, 'w'], [1, 0, 'e']].forEach(([dx, dy, d]) => {
        const nx = tx + dx, ny = ty + dy;
        if (walk(nx, ny)) return;
        const out = nx < 0 || ny < 0 || nx >= a.w || ny >= a.h;
        const line = d === 'n' ? ty : d === 's' ? ty + 1 : d === 'w' ? tx : tx + 1, pos = d === 'n' || d === 's' ? tx : ty;
        if (door && out) { exits.push({ d, line, a: pos, b: pos + 1 }); return; }
        const key = d + line; let r = runs.get(key); if (!r) runs.set(key, r = []); r.push(pos);
      });
    }
    const list = [];
    for (const [key, arr] of runs) {
      arr.sort((x, y) => x - y);
      let s = arr[0], p = arr[0];
      const d = key[0], line = +key.slice(1);
      for (let i = 1; i <= arr.length; i++) { if (i < arr.length && arr[i] === p + 1) { p = arr[i]; continue; } list.push({ d, line, a: s, b: p + 1 }); if (i < arr.length) { s = p = arr[i]; } }
    }
    return { runs: list, exits };
  }
  // a run to local metre coordinates: A, B on the wall line, n inward normal
  function runGeom(r) {
    const L = r.line * TS * K, a = r.a * TS * K, b = r.b * TS * K;
    if (r.d === 'n') return { A: [a, L], B: [b, L], n: [0, 1] };
    if (r.d === 's') return { A: [a, L], B: [b, L], n: [0, -1] };
    if (r.d === 'w') return { A: [L, a], B: [L, b], n: [1, 0] };
    return { A: [L, a], B: [L, b], n: [-1, 0] };
  }
  // the rough rock displacement field shared by mine walls, floor and ceiling (no cracks: same field everywhere)
  function rockDisp(x, y, z, amp) {
    const k = amp * (0.25 + 0.75 * sstep(0, 0.5, y));
    return [x + n3(x * 0.9, y * 0.9, z * 0.9 + 3) * k + n3(x * 2.7, y * 2.7, z * 2.7) * k * 0.35, y + n3(x * 0.8 + 7, y * 0.8, z * 0.8) * k * (y > 1.5 ? 1.6 : 0.4), z + n3(x * 0.9 - 5, y * 0.9, z * 0.9) * k + n3(z * 2.7, y * 2.7, x * 2.7) * k * 0.35];
  }
  function displaceGeo(g, amp) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const v = rockDisp(p.getX(i), p.getY(i), p.getZ(i), amp); p.setXYZ(i, v[0], v[1], v[2]); } return g; }

  Pr.buildInterior = function (areaId, area) {
    const group = new THREE.Group(), O = R3.areaOrigin(areaId);
    group.position.set(O.x, O.y, O.z);
    const def = area.def || {}, theme = area.theme || def.theme || 'log';
    const { runs, exits } = mapEdges(area);
    const walk = (tx, ty) => { const t = W.tile(area, tx, ty); return t === W.T.FLOOR || t === W.T.DOORWAY; };
    const H = areaId === 'in_tower' ? 2.6 : theme === 'stone' ? 2.5 : theme === 'log' ? 2.3 : 2.5;
    const k = new Kit();
    const updates = [];
    const C = (px) => px * K;
    if (theme === 'stone') {
      // ---------------- mine: rough rock gallery
      const rock = IN('rock'), amp = 0.24;
      runs.forEach((r) => {
        const g = runGeom(r), f = wallFrame(g.A, g.B, g.n), segs = Math.round(f.len / 0.8 * 3);
        const pg = new THREE.PlaneGeometry(f.len, H, segs, 8); pg.translate(f.len / 2, H / 2, 0); pg.applyMatrix4(f.m);
        k.geo(rock, displaceGeo(pg.toNonIndexed(), amp));
      });
      const floorParts = [], ceil = [];
      for (let ty = 0; ty < area.h; ty++) for (let tx = 0; tx < area.w; tx++) {
        if (!walk(tx, ty)) continue;
        const x0 = C(tx * TS), z0 = C(ty * TS);
        const inWinze = tx >= 25 && tx <= 26 && ty >= 4 && ty <= 5 && areaId === 'in_mine';
        if (!inWinze) { const fg = new THREE.PlaneGeometry(0.8, 0.8, 3, 3); fg.rotateX(-PI / 2); fg.translate(x0 + 0.4, 0, z0 + 0.4); floorParts.push(displaceGeo(fg.toNonIndexed(), amp)); }
        const cg = new THREE.PlaneGeometry(0.8, 0.8, 3, 3); cg.rotateX(PI / 2); cg.translate(x0 + 0.4, H, z0 + 0.4); ceil.push(displaceGeo(cg.toNonIndexed(), amp));
      }
      floorParts.forEach((g) => k.geo(IN('mud'), g, null, 'm'));
      ceil.forEach((g) => k.geo(rock, g));
      const built = k.build({ into: group });
      built.children.forEach((m) => { if (m.material === rock) { smoothNormals(m.geometry); R3.Tex.metreUV(m.geometry); } else if (m.material === IN('mud')) smoothNormals(m.geometry); });
      // timber sets across the gallery, rails, puddle, a dropped helmet
      const kt = new Kit(), tim = IN('wood_weathered');
      [128, 232, 344].forEach((x) => { kt.box(tim, [0.2, H - 0.1, 0.2], [C(x), (H - 0.1) / 2, C(144) + 0.12]); kt.box(tim, [0.2, H - 0.1, 0.2], [C(x), (H - 0.1) / 2, C(192) - 0.12]); kt.box(tim, [0.22, 0.22, C(48) + 0.1], [C(x), H - 0.18, C(168)]); });
      const rail = (x0, y0, x1, y1) => {
        const v = x0 === x1, len = C(Math.abs(v ? y1 - y0 : x1 - x0)), cx = C((x0 + x1) / 2), cz = C((y0 + y1) / 2);
        for (let s = 0; s < len; s += 0.55) { const f = s - len / 2; kt.box(IN('wood_plank_dark'), v ? [1.0, 0.07, 0.14] : [0.14, 0.07, 1.0], v ? [cx, 0.03, cz + f] : [cx + f, 0.03, cz]); }
        [-0.3, 0.3].forEach((o2) => kt.box(IN('metal_rust'), v ? [0.05, 0.06, len] : [len, 0.06, 0.05], v ? [cx + o2, 0.09, cz] : [cx, 0.09, cz + o2]));
      };
      rail(80, 268, 80, 170); rail(80, 170, 390, 170); rail(176, 170, 176, 100); rail(392, 170, 392, 100);
      kt.geo(R3.mat('puddle', () => R3.std({ color: 0x05080a, roughness: 0.02, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -3 })), new THREE.CircleGeometry(0.4, 18), mtx([C(270), 0.04, C(226)], [-PI / 2, 0, 0], [1.8, 0.7, 1]));
      kt.geo(IN('metal_painted', { color: 0xb08a20 }), new THREE.SphereGeometry(0.14, 12, 8, 0, PI * 2, 0, PI / 2), mtx([C(374), 0.04, C(100)], [0.3, 0, 0.4]));
      kt.build({ into: group });
      // the mouth: daylight
      const mouthMat = R3.mat('mineMouth', () => R3.basic({ color: 0xffffff }));
      exits.forEach((e) => { const g = runGeom(e), f = wallFrame(g.A, g.B, g.n); const pl = new THREE.Mesh(new THREE.PlaneGeometry(f.len + 0.6, H + 0.4), mouthMat); pl.position.set((g.A[0] + g.B[0]) / 2, H / 2, (g.A[1] + g.B[1]) / 2); pl.lookAt(pl.position.x + g.n[0], H / 2, pl.position.z + g.n[1]); group.add(pl); });
      const ks = new Kit(); for (let i = 0; i < 6; i++) ks.geo(MAT.snow(), rockGeo(i + 300, 0.4, 0.08, 0.3, 0.3, 1), mtx([C(70 + hashf(i, 1) * 28), 0.0, C(258 + hashf(i, 2) * 12)])); ks.build({ into: group });
      updates.push((dt, ctx) => { const d = daylight(); mouthMat.color.setRGB(0.04 + 0.8 * d, 0.05 + 0.84 * d, 0.07 + 0.9 * d); });
      // the dread: pale eyes in the dark, then arms reaching in
      const dread = mineDread(group, O);
      updates.push(dread);
    } else {
      // ---------------- plank (tower) or log (shack) rooms
      const isTower = areaId === 'in_tower';
      const wallMat = isTower ? IN('boards_weathered') : IN('log_wall', { spacing: 0.28 });
      const frame = IN('wood_weathered'), floor = IN('wood_plank_floor', isTower ? { color: 0x6a5a48 } : { color: 0x4a3626 });
      runs.forEach((r) => {
        const g = runGeom(r);
        if (isTower) windowWall(k, { wall: wallMat, frame, glass: MAT.glass() }, g.A, g.B, g.n, { h: H, sill: 0.95, head: 2.15, thick: 0.1, pane: 1.2, ext: 0.05 });
        else {
          const f = wallFrame(g.A, g.B, g.n);
          k.box(wallMat, [f.len + 0.3, H, 0.3], [f.len / 2, H / 2, -0.15], null, f.m);
          // round log faces along the wall
          for (let y = 0.14; y < H; y += 0.28) k.geo(IN('wood_log'), cylUV(new THREE.CylinderGeometry(0.14, 0.14, f.len + 0.3, 10, 1, true), 0.14, f.len, true), f.m.clone().multiply(mtx([f.len / 2, y, -0.07], [0, 0, PI / 2])));
        }
      });
      for (let ty = 0; ty < area.h; ty++) for (let tx = 0; tx < area.w; tx++) {
        if (!walk(tx, ty)) continue;
        const hole = isTower && W.tile(area, tx, ty) === W.T.DOORWAY;
        if (!hole) k.box(floor, [0.8, 0.06, 0.8], [C(tx * TS) + 0.4, -0.03, C(ty * TS) + 0.4]);
        k.box(isTower ? IN('wood_plank') : IN('wood_plank_dark'), [0.8, 0.04, 0.8], [C(tx * TS) + 0.4, H + 0.02, C(ty * TS) + 0.4]);
      }
      // ceiling beams
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      for (let ty = 0; ty < area.h; ty++) for (let tx = 0; tx < area.w; tx++) if (walk(tx, ty) && W.tile(area, tx, ty) !== W.T.DOORWAY) { minX = Math.min(minX, tx); maxX = Math.max(maxX, tx + 1); minZ = Math.min(minZ, ty); maxZ = Math.max(maxZ, ty + 1); }
      for (let x = minX * 0.8 + 0.8; x < maxX * 0.8 - 0.4; x += 1.6) k.box(isTower ? frame : IN('wood_log'), [0.16, 0.2, (maxZ - minZ) * 0.8], [x, H - 0.1, (minZ + maxZ) * 0.4]);
      // exits: shack door / tower hatch
      exits.forEach((e) => {
        const g = runGeom(e), f = wallFrame(g.A, g.B, g.n);
        if (isTower) { k.box(wallMat, [f.len + 0.2, H, 0.1], [f.len / 2, H / 2, -0.05], null, f.m); return; }
        k.box(wallMat, [f.len + 0.3, H, 0.3], [f.len / 2, H / 2, -0.15], null, f.m);
        k.box(IN('boards_weathered', { color: 0x5a4430 }), [0.9, 1.95, 0.06], [f.len / 2, 0.98, 0.04], null, f.m);
        k.box(frame, [1.1, 0.12, 0.1], [f.len / 2, 2.0, 0.05], null, f.m);
        k.box(IN('cast_iron'), [0.05, 0.14, 0.05], [f.len / 2 + 0.33, 1.0, 0.1], null, f.m);
      });
      if (isTower) {
        // the hatch: frame around the hole, ladder rails rising through it, open trapdoor
        const hx = C(128), hz = C(152);
        [[-0.85, 0], [0.85, 0]].forEach(([dx]) => k.box(frame, [0.1, 0.1, 0.8], [hx + dx, 0.0, hz]));
        [-0.24, 0.24].forEach((dx) => k.box(frame, [0.06, 1.2, 0.09], [hx + dx, 0.45, hz - 0.05]));
        k.box(IN('wood_plank'), [1.5, 0.05, 0.7], [hx, 0.4, hz - 0.45], [-1.2, 0, 0]);
        // painted compass rose on the floor
        k.geo(picMat('rose', { transparent: true }), new THREE.PlaneGeometry(2.2, 2.2), mtx([C(128), 0.005, C(97)], [-PI / 2, 0, 0], [1, 0.75, 1]));
      } else {
        // pelts and traps on the north wall, snowshoes, frosted windows, hide rug
        const nz = C(32);
        [[C(102), 0x6e5034], [C(128), 0x8a8478], [C(154), 0x5a4a3a]].forEach(([x, c]) => {
          k.geo(IN('wood_weathered'), new THREE.TorusGeometry(0.28, 0.012, 5, 18), mtx([x, 1.45, nz + 0.04], null, [1, 1.25, 1]));
          const hide = new THREE.CircleGeometry(0.26, 16); hide.scale(1, 1.25, 1); k.geo(IN('fur', { color: c }), hide, mtx([x, 1.45, nz + 0.035]));
        });
        k.box(IN('wood_log'), [1.8, 0.1, 0.1], [C(190), 2.05, nz + 0.25]);
        [C(178), C(196)].forEach((x, i) => { k.limb(IN('metal_dark'), [x, 2.0, nz + 0.25], [x, 1.7 - i * 0.1, nz + 0.25], 0.006, 0.006, 3); k.geo(IN('metal_dark'), new THREE.TorusGeometry(0.11, 0.008, 4, 16), mtx([x, 1.58 - i * 0.1, nz + 0.25])); });
        [C(212), C(226)].forEach((x) => { k.geo(IN('wood_weathered'), new THREE.TorusGeometry(0.16, 0.012, 5, 18), mtx([x, 1.3, nz + 0.04], null, [0.55, 1.5, 1])); k.geo(IN('leather', { color: 0x8a7050 }), new THREE.CircleGeometry(0.15, 12), mtx([x, 1.3, nz + 0.03], null, [0.5, 1.45, 1])); });
        const frost = R3.mat('frostPane', () => { const m = R3.std({ color: 0x8aa0b8, roughness: 0.6, emissive: 0x6080a0, emissiveIntensity: 0.3 }); m.userData.noShadow = true; return m; });
        const sz = C(160);
        [C(56), C(232)].forEach((x) => { k.box(frost, [0.62, 0.42, 0.04], [x, 1.35, sz - 0.02]); k.box(frame, [0.7, 0.06, 0.1], [x, 1.13, sz - 0.04]); k.box(frame, [0.04, 0.42, 0.06], [x, 1.35, sz - 0.04]); k.box(frame, [0.7, 0.05, 0.06], [x, 1.57, sz - 0.04]); });
        updates.push(() => { const d = daylight(); frost.emissiveIntensity = 0.05 + d * 0.9; });
        k.geo(IN('fur', { color: 0x6a5a48 }), softBox(1.6, 0.03, 1.0, 0.95), mtx([C(172), 0.015, C(121)], [0, 0.1, 0]));
        // stove smoke hanging under the ceiling
        const haze = Particles({ n: 8, tex: 'puff', color: 0x8a8c90, speed: 0.03, rise: 0.3, spread: 6, drift: 0, wobble: 0.6, s0: 1.4, s1: 2.4, alpha: 0.12, seed: 12 });
        haze.mesh.position.set(C(140), H - 0.55, C(90)); group.add(haze.mesh);
        updates.push((dt, ctx) => haze.update(ctx.t, shackLit() ? 1 : 0.4, ctx.cam));
      }
      k.build({ into: group });
    }
    // ---------------- interior objects
    const items = [];
    (area.objs || []).forEach((o) => {
      if (!o.m3d || o.m3d === 'pl:none') return;
      let r = null;
      try { r = Pr.make(o.m3d, o, areaId); } catch (e) { console.error('[r3 interior prop ' + o.m3d + ']', e); }
      if (!r) return;
      let px = o.cx != null ? o.cx + o.cw / 2 : o.x, py = o.cy != null ? o.cy + o.ch / 2 : o.y;
      if (o.layer === 'wall' || o.m3d === 'pl:lamp' || o.m3d === 'pl:notice') { px = o.x; let ty = Math.floor(py / TS); while (ty > 0 && walk(Math.floor(px / TS), ty - 1)) ty--; py = ty * TS; }
      else if (o.m3d === 'pl:cabinet' || o.m3d === 'pl:logdesk' || o.m3d === 'pl:stove' || o.m3d === 'pl:kindling' || o.m3d === 'pl:mag' || o.m3d === 'pl:locker') { py = (o.cy != null ? o.cy + o.ch : o.y); }
      r.obj.position.set(C(px), 0, C(py));
      group.add(r.obj); items.push({ r, o });
    });
    return {
      group,
      update(dt, ctx) {
        updates.forEach((u) => u(dt, ctx));
        items.forEach(({ r, o }) => { if (r.update) r.update(dt, o, ctx); });
      },
    };
  };
  // pale eyes and reaching arms around the ranger in the mine's dark (3D form of places.js drawDread)
  function mineDread(group, O) {
    const eyeMat = R3.mat('dreadEyes', () => { const m = R3.glowMat({ map: TEX.glow(), color: 0xd8dccf }); m.userData.noShadow = true; return m; });
    const eyes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.05, 0.03), eyeMat, 24); eyes.count = 0; eyes.frustumCulled = false; group.add(eyes);
    const pale = R3.mat('paleSkin', () => R3.std({ color: 0xbfc0b6, roughness: 0.55, emissive: 0x202220, emissiveIntensity: 1 }));
    const arms = [];
    for (let i = 0; i < 5; i++) {
      const k = new Kit();
      k.limb(pale, [0, 0, -1.6], [0, 0, -0.12], 0.035, 0.03, 8);
      k.geo(pale, softBox(0.08, 0.025, 0.1, 0.6), mtx([0, 0, -0.06]));
      [-0.03, -0.012, 0.008, 0.026].forEach((x, j) => k.limb(pale, [x, 0, -0.02], [x * 1.3, -0.01, 0.08 + (j === 1 || j === 2 ? 0.03 : 0)], 0.008, 0.005, 4));
      const a = k.build({ shadow: false }); a.visible = false; group.add(a); arms.push(a);
    }
    const dm = new THREE.Object3D(), cp = new V3();
    return (dt, ctx) => {
      const m = placesMod(), kk = ctx.area && ctx.area.id === 'in_mine' ? (m.dread || 0) / 100 : 0;
      cp.copy(ctx.cam.position).sub(group.position);
      const n = kk > 0.35 ? Math.min(12, Math.floor((kk - 0.3) * 14)) : 0;
      let c = 0;
      for (let i = 0; i < n; i++) {
        if ((ctx.t * 1.3 + i * 0.7) % 3.1 < 0.15) continue;
        const ang = hashf(i, 3, Math.floor(ctx.t / 2.7)) * 6.28, rr = 4.2 - kk * 1.8 + hashf(i, 4) * 1.2;
        const ex = cp.x + Math.cos(ang) * rr, ez = cp.z + Math.sin(ang) * rr, ey = 0.9 + hashf(i, 5) * 1.0;
        [-0.045, 0.045].forEach((o) => { if (c >= 24) return; dm.position.set(ex + Math.sin(ang) * o, ey, ez - Math.cos(ang) * o); dm.lookAt(cp.x, ey, cp.z); dm.updateMatrix(); eyes.setMatrixAt(c++, dm.matrix); });
      }
      eyes.count = c; eyes.instanceMatrix.needsUpdate = true;
      eyeMat.opacity = 0.4 + kk * 0.6;
      arms.forEach((a, i) => {
        a.visible = kk > 0.72;
        if (!a.visible) return;
        const ang = i / 5 * 6.28 + 0.4 + Math.sin(ctx.t * 0.6 + i * 2) * 0.12 + ctx.cam.rotation.y * 0, reach = 2.6 - (kk - 0.72) * 5 + Math.sin(ctx.t * 2.3 + i) * 0.08;
        a.position.set(cp.x + Math.cos(ang) * reach, 0.7 + (i % 3) * 0.35, cp.z + Math.sin(ang) * reach);
        a.lookAt(cp.x + group.position.x, a.position.y + group.position.y + 0.1, cp.z + group.position.z);
      });
    };
  }

  // ================================================================== overlays in 3D (r3Frame)
  // finale: the burning signal flare in front of the porch; the pale stag drawn in by it
  let flare = null, chev = null, fline = null;
  function flareObj() {
    const grp = new THREE.Group(), k = new Kit();
    k.cyl(MAT.plain(0x8a1410, 0.5), 0.022, 0.022, 0.32, [0, 0.12, 0], [0.12, 0, 0.06], 8);
    k.build({ into: grp });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), glowStd(0xffffff, 0xff6a50, 8)); head.position.set(0.01, 0.28, 0.02); grp.add(head);
    const fl = Particles({ n: 8, add: true, tex: 'flame', color: 0xff5a40, speed: 2.4, rise: 0.25, spread: 0.04, s0: 0.16, s1: 0.06, alpha: 1, aspect: 0.6, seed: 41 });
    const sp = Particles({ n: 10, add: true, tex: 'glow', color: 0xffa070, speed: 1.2, rise: 0.9, spread: 0.1, wobble: 0.25, gravity: 0.9, s0: 0.03, s1: 0.012, alpha: 1, seed: 42 });
    const sm = Particles({ n: 10, tex: 'puff', color: 0xb08888, speed: 0.25, rise: 2.4, spread: 0.1, drift: 1.6, wobble: 0.2, s0: 0.2, s1: 1.2, alpha: 0.3, seed: 43 });
    [fl, sp, sm].forEach((p) => { p.mesh.position.set(0.01, 0.28, 0.02); grp.add(p.mesh); });
    grp.userData.fx = [fl, sp, sm];
    R3.scene.add(grp);
    return grp;
  }
  let stag = null;
  function frameFinale(ctx) {
    const s = ctx.state, f = s && s.mods && s.mods.finale;
    const on = !!(f && f.flare && NW.Finale && NW.Finale.active && NW.Finale.active() && ctx.visible.includes('f_2_2'));
    if (!on) { if (flare) flare.visible = false; if (stag) stag.obj.visible = false; return; }
    if (!flare) flare = flareObj();
    flare.visible = true;
    R3.toWorld('f_2_2', f.flare.x, f.flare.y, _w); flare.position.copy(_w);
    const fk = flick('flare');
    flare.userData.fx.forEach((p) => p.update(ctx.t, 1, ctx.cam));
    ctx.addLight({ key: 'flare', x: _w.x, y: _w.y + 0.45, z: _w.z, color: [1, 0.16, 0.08], intensity: 26, range: 18, flicker: 'fire', seed: 11, shadow: 3, glow: 1.6, glowIntensity: 1.6 });
    void fk;
    // the pale thing at the treeline while the flare draws it in
    if (f.danger > 0 && f.warned && R3.Creatures) {
      if (!stag) { try { stag = R3.Creatures.make('stag', {}); if (stag) R3.scene.add(stag.obj); } catch (e) { stag = null; } }
      if (stag) {
        const kk = clamp((f.dangerT - 1.5) / (f.danger - 1.5), 0, 1);
        R3.toWorld('f_2_2', U.lerp(f.flare.x + 170, f.flare.x + 44, kk), U.lerp(266, f.flare.y + 22, kk), _p);
        stag.obj.visible = true; stag.obj.position.copy(_p); stag.obj.rotation.y = Math.atan2(_w.x - _p.x, _w.z - _p.z);
        if (stag.update) stag.update(ctx.dt, { stage: 'hunting', moving: kk < 1 }, ctx);
      }
    } else if (stag) stag.obj.visible = false;
  }
  // guided first day: a soft glowing chevron over the target
  function chevObj() {
    const sh = new THREE.Shape();
    sh.moveTo(-0.16, 0.12); sh.lineTo(0, -0.04); sh.lineTo(0.16, 0.12); sh.lineTo(0.16, 0.0); sh.lineTo(0, -0.16); sh.lineTo(-0.16, 0.0); sh.lineTo(-0.16, 0.12);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 }); g.translate(0, 0, -0.015);
    const m = R3.mat('chevron', () => { const mm = R3.std({ color: 0xffc860, emissive: 0xffa830, emissiveIntensity: 2.2, roughness: 0.4, transparent: true, opacity: 0.92 }); mm.userData.noShadow = true; return mm; });
    const inner = new THREE.Group(), mesh = new THREE.Mesh(g, m); inner.add(mesh);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), R3.mat('chevHalo', () => R3.glowMat({ map: TEX.glow(), color: 0xffb040, opacity: 0.35 })));
    const grp = new THREE.Group(); grp.add(inner, halo); grp.userData.inner = inner; grp.userData.halo = halo;
    R3.scene.add(grp);
    return grp;
  }
  const OBJ_H = { branches: 9, deadtree: 40, bush: 13, mushrooms: 10, woodpile_ext: 31, carcass: 8, rabbit: 9, deer: 24 };
  function frameGuide(ctx) {
    let m = null;
    try { m = NW.Story && NW.Story.guideActive && NW.Story.guideActive() && !G().dead && !NW.UI.blocksMovement() ? NW.Story.guideTarget() : null; } catch (e) { m = null; }
    if (!m || m.x < 0 || R3.View.override) { if (chev) chev.visible = false; return; }
    if (!chev) chev = chevObj();
    const a = ctx.area, p = ctx.state.player;
    let gx = m.x, gy = m.y, hgt = 1.9;
    if (m.dir === 'down') {
      // find what the 2D marker sits over: a ground object whose top is at m.y
      let best = null;
      (a.objs || []).forEach((o) => { if (Math.abs((o.cx != null && a.kind !== 'forest' ? o.cx + o.cw / 2 : o.x) - m.x) < 1.5 && o.y > m.y - 2) { const gyy = a.kind === 'forest' ? o.y : (o.cy != null ? o.cy + o.ch / 2 : o.y); if (!best || gyy < best) best = gyy; } });
      if (a.kind === 'forest' && !best && ctx.state.animals.area === a.id) ctx.state.animals.list.forEach((an) => { if (Math.abs(an.x - m.x) < 1.5) best = an.y; });
      if (best != null) { gy = best; const typ = (a.objs.find((o) => o.y === best) || {}).type; hgt = a.kind === 'forest' ? Math.max(1.1, ((OBJ_H[typ] || 12) * K * 1.8) + 0.7) : 1.6; }
      else { gy = m.y + 12; hgt = a.kind === 'forest' ? 1.6 : 1.5; }
    } else hgt = 1.3;
    R3.toWorld(a.id, gx, gy, _w);
    const near = Math.hypot(p.x - m.x, p.y - 8 - m.y) < 26;
    const bob = Math.abs(Math.sin(ctx.t * 3.2)) * 0.12;
    chev.visible = true;
    const inner = chev.userData.inner;
    if (m.dir === 'down') { chev.position.set(_w.x, _w.y + hgt + bob, _w.z); inner.rotation.set(0, ctx.t * 1.2, 0, 'XYZ'); }
    else {
      const d = { up: [0, -1], left: [-1, 0], right: [1, 0] }[m.dir] || [0, 1];
      chev.position.set(_w.x - d[0] * bob, _w.y + hgt, _w.z - d[1] * bob);
      // the chevron's tip is local -Y: tip it forward (-Z), then turn toward the game direction
      inner.rotation.set(PI / 2, Math.atan2(-d[0], -d[1]), 0, 'YXZ');
    }
    chev.userData.halo.quaternion.copy(ctx.cam.quaternion);
    inner.children[0].material.opacity = near ? 0.35 : 0.92;
    chev.userData.halo.material.opacity = near ? 0.1 : 0.3 + Math.sin(ctx.t * 3.2) * 0.06;
  }
  // fishing: the line out to the water while the fishing panel is open
  function frameFishing(ctx) {
    let fx = null;
    try { fx = NW.Fishing && NW.Fishing.session && NW.UI.isOpen('fishing') ? NW.Fishing.session() : null; } catch (e) { fx = null; }
    if (!fx || !fx.spot || fx.spot.area !== ctx.area.id) { if (fline) fline.visible = false; return; }
    if (!fline) {
      fline = new THREE.Group();
      const lm = R3.mat('fishline', () => R3.basic({ color: 0xc8d0d8, transparent: true, opacity: 0.6 }));
      const ln = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 1, 3, 1, true), lm); fline.add(ln);
      const flt = new THREE.Group(), k = new Kit(); k.geo(MAT.plain(0xc01a14, 0.4), new THREE.SphereGeometry(0.025, 8, 6), mtx([0, 0.02, 0])); k.geo(MAT.plain(0xe8e8e0, 0.4), new THREE.SphereGeometry(0.025, 8, 6), mtx([0, -0.01, 0])); k.build({ into: flt, shadow: false }); fline.add(flt);
      const rip = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.075, 20), R3.mat('ripple', () => R3.basic({ color: 0x8aa8c0, transparent: true, opacity: 0.4, depthWrite: false }))); rip.rotation.x = -PI / 2; fline.add(rip);
      fline.userData = { ln, flt, rip };
      R3.scene.add(fline);
    }
    const sp = fx.spot, ph = fx.phase;
    fline.visible = ph !== 'idle' && ph !== 'cast';
    if (!fline.visible) return;
    R3.toWorld(sp.area, sp.wx, sp.wy, _w); _w.y -= 0.05;
    const cam = ctx.cam, f = R3.Controls.facing();
    const tip = new V3(cam.position.x + f.x * 1.4 + f.y * 0.25, cam.position.y + 0.25, cam.position.z + f.y * 1.4 - f.x * 0.25);
    let dip = Math.sin(ctx.t * 3) * 0.01; if (ph === 'bite') dip = -0.06; if (ph === 'fight') dip = -0.1;
    const end = _w.clone(); end.y += dip;
    const { ln, flt, rip } = fline.userData;
    const mid = tip.clone().add(end).multiplyScalar(0.5), len = tip.distanceTo(end);
    ln.position.copy(mid); ln.scale.set(1, len, 1); ln.quaternion.setFromUnitVectors(YUP, end.clone().sub(tip).normalize());
    flt.position.copy(end); flt.visible = ph === 'wait' || ph === 'bite';
    rip.position.set(_w.x, _w.y + 0.01, _w.z); rip.visible = ph === 'bite' || ph === 'fight'; const r = (ctx.t * 1.6) % 1; rip.scale.setScalar(0.5 + r * 3);
  }
  NW.Hooks.on('r3Frame', (ctx) => {
    if (!ctx || ctx.menu || !ctx.state) { if (flare) flare.visible = false; if (chev) chev.visible = false; if (fline) fline.visible = false; return; }
    try { frameFinale(ctx); } catch (e) { console.error('[r3 flare]', e); }
    try { frameGuide(ctx); } catch (e) { console.error('[r3 guide]', e); }
    try { frameFishing(ctx); } catch (e) { console.error('[r3 fishing]', e); }
  });
})(window.NW);
