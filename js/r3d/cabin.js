'use strict';
// Ranger cabin: the four interior rooms (one coherent log interior with a fake exterior ring seen
// through windows and doors) and the cabin as seen in the f_2_2 clearing. Static geometry is merged
// per material per room; stateful parts (doors, windows, curtains, shutters, boards, fire, woodbox,
// lamps, smoke) are small separate meshes driven from game state every frame. Lights mirror render.js.
(function (NW) {
  const THREE = window.THREE, R3 = NW.R3;
  if (!THREE || !R3) return;
  const Cab = R3.Cabin = {};
  const K = R3.K, TS = 16, PI = Math.PI;
  const D = () => NW.D, W = () => NW.World, ST = () => NW.G.state;
  const Tx = () => R3.Tex;

  // ================================================================ constants
  const CEIL = 2.7;          // interior ceiling height
  const WT = 0.35;           // exterior wall thickness (inner face -> outer face)
  const GROUND = -0.45;      // ground level around the interior cabin (floor is y = 0)
  const PORCH_Y = -0.05;     // porch deck top
  const LOG_R = 0.155, LOG_P = 0.30, LOG_F = 0.6; // wall log radius, course pitch, flattening
  const WIN = { w: 1.2, y0: 0.88, y1: 2.0 };
  const DOOR = { w: 1.04, h: 2.04 };
  const PASS = { w: 1.3, h: 2.12 };
  const UP = new THREE.Vector3(0, 1, 0);

  // ================================================================ small helpers
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
  // local transform: translate, rotate (yaw, pitch, roll in YXZ), scale
  function lm(x, y, z, ry, rx, rz, sx, sy, sz) {
    _q.setFromEuler(_e.set(rx || 0, ry || 0, rz || 0, 'YXZ'));
    return new THREE.Matrix4().compose(_v.set(x || 0, y || 0, z || 0), _q, _s.set(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz));
  }
  // frame whose local +Z is the horizontal normal (nx, nz), +X = up x n (right-handed), origin p
  function frame(nx, nz, px, py, pz) {
    const n = new THREE.Vector3(nx, 0, nz), d = new THREE.Vector3().crossVectors(UP, n);
    return new THREE.Matrix4().makeBasis(d, UP, n).setPosition(px, py, pz);
  }
  const mul = (a, b) => a.clone().multiply(b);
  const yawTo = (dx, dz) => Math.atan2(dx, dz);         // model rotation.y facing (dx, dz)
  const camYaw = (fx, fz) => Math.atan2(-fx, -fz);      // camera rotation.y looking along (fx, fz)

  // geometry with metre UVs (grain along local X)
  function gBox(w, h, d) { return Tx().metreUV(new THREE.BoxGeometry(w, h, d)); }
  function gBoxV(w, h, d) { const g = Tx().metreUV(new THREE.BoxGeometry(h, w, d)); g.rotateZ(PI / 2); return g; } // grain vertical
  // cylinder along Y with UV u = along axis (m), v = around (m)
  function gCyl(rt, rb, h, seg, open, thetaLen) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg || 12, 1, !!open, 0, thetaLen || PI * 2);
    const uv = g.attributes.uv, r = Math.max(rt, rb);
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v * h, u * r * (thetaLen || PI * 2)); }
    return g;
  }
  function gLogX(r, len, seg) { const g = gCyl(r, r, len, seg || 10, true); g.rotateZ(PI / 2); return g; } // along X, open ends
  function gDisc(r, seg) { return new THREE.CircleGeometry(r, seg || 12); } // uv 0..1 (log end rings)
  function gSphere(r, ws, hs) { return Tx().metreUV(new THREE.SphereGeometry(r, ws || 10, hs || 7)); }
  function gPlane(w, h) { return Tx().metreUV(new THREE.PlaneGeometry(w, h)); }
  function withColor(geo, hex) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const c = new THREE.Color(hex), a = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    return g;
  }
  // half-log facing +Z along X (u along log, v around), front at z = 0, axis behind
  function gHalfLog(len, r, flat, seg) {
    seg = seg || 8;
    const pos = [], nor = [], uv = [], idx = [];
    for (let j = 0; j <= seg; j++) {
      const a = -PI / 2 + PI * j / seg, sy = Math.sin(a), cz = Math.cos(a);
      const nx = 0, ny = sy * flat, nz = cz; const nl = Math.hypot(ny, nz) || 1;
      for (let i = 0; i <= 1; i++) { pos.push(i * len, r * sy, r * cz * flat - r * flat); nor.push(nx, ny / nl, nz / nl); uv.push(i * len, r * a); }
    }
    for (let j = 0; j < seg; j++) { const a = j * 2, b = a + 2; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return g;
  }
  // folded fabric panel: hangs from y = 0 down to -h, spans x 0..w, folds in z
  function gCurtain(w, h, folds) {
    const g = new THREE.PlaneGeometry(w, h, folds * 4, 4); g.translate(w / 2, -h / 2, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.sin(x / w * folds * PI * 2) * 0.035 * (1 + (-y / h) * 0.3)); }
    g.computeVertexNormals(); Tx().metreUV(g);
    const uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getY(i), p.getX(i)); // fabric runs down
    return g;
  }

  // ---------------------------------------------------------------- builder: merge per material
  function Bld() { this.map = new Map(); }
  Bld.prototype.add = function (mat, geo, m) { let a = this.map.get(mat); if (!a) { a = []; this.map.set(mat, a); } a.push({ geo, matrix: m || null }); };
  Bld.prototype.flush = function (group, opts) {
    opts = opts || {};
    const out = [];
    for (const [mat, parts] of this.map) {
      if (!parts.length) continue;
      const g = R3.merge(parts);
      const mesh = new THREE.Mesh(g, mat);
      // only big opaque surfaces cast (each caster costs 6 draws per shadowed point light)
      mesh.castShadow = opts.cast !== false && !mat.transparent && (opts.cast === true || CASTERS.has(mat.userData.tex));
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      group.add(mesh); out.push(mesh);
    }
    this.map.clear();
    return out;
  };
  const CASTERS = new Set(['wood_log', 'wood_plank', 'cast_iron', 'stone_wall', 'fabric_blue']);
  // object placement context: o.put(mat, geo, local transform args)
  function Ctx(B, base) { this.B = B; this.base = base; }
  Ctx.prototype.put = function (mat, geo, x, y, z, ry, rx, rz, sx, sy, sz) { this.B.add(mat, geo, mul(this.base, lm(x, y, z, ry, rx, rz, sx, sy, sz))); return this; };
  Ctx.prototype.box = function (mat, w, h, d, x, y, z, ry, rx, rz) { return this.put(mat, gBox(w, h, d), x, y, z, ry, rx, rz); };      // centre
  Ctx.prototype.boxV = function (mat, w, h, d, x, y, z, ry, rx, rz) { return this.put(mat, gBoxV(w, h, d), x, y, z, ry, rx, rz); };
  Ctx.prototype.cyl = function (mat, rt, rb, h, x, y, z, seg, rx, rz, ry) { return this.put(mat, gCyl(rt, rb, h, seg || 12), x, y, z, ry, rx, rz); };
  Ctx.prototype.vc = function (hex, geo, x, y, z, ry, rx, rz, sx, sy, sz) { return this.put(M.vc(), withColor(geo, hex), x, y, z, ry, rx, rz, sx, sy, sz); };
  Ctx.prototype.sub = function (x, y, z, ry) { return new Ctx(this.B, mul(this.base, lm(x, y, z, ry))); };

  // ================================================================ materials
  const M = {
    log: () => Tx().mat('wood_log'), logEnd: () => Tx().mat('wood_log_end'), chink: () => Tx().mat('chinking'),
    floor: () => Tx().mat('wood_plank_floor'), plank: () => Tx().mat('wood_plank'), dark: () => Tx().mat('wood_plank_dark'),
    weath: () => Tx().mat('boards_weathered'), wweath: () => Tx().mat('wood_weathered'),
    iron: () => Tx().mat('cast_iron'), metal: () => Tx().mat('metal_dark'), brass: () => Tx().mat('brass'), rust: () => Tx().mat('metal_rust'),
    paint: () => Tx().mat('metal_painted'), drum: () => Tx().mat('metal_painted', { color: 0x5a2a20 }),
    stone: () => Tx().mat('stone_wall'), wool: () => Tx().mat('fabric_wool'), red: () => Tx().mat('fabric_red', { side: THREE.DoubleSide }),
    canvas: () => Tx().mat('fabric_canvas'), blue: () => Tx().mat('fabric_blue'), leather: () => Tx().mat('leather'), paper: () => Tx().mat('paper'),
    green: () => Tx().mat('fabric_wool', { color: 0x34402e }), linen: () => Tx().mat('fabric_canvas', { color: 0xb8ae98 }),
    glass: () => Tx().mat('glass', { side: THREE.DoubleSide }),
    roof: () => Tx().mat('roof_shingle', { snowTop: 1 }), snowLog: () => Tx().mat('wood_log', { snowTop: 0.6 }),
    snowPlank: () => Tx().mat('boards_weathered', { snowTop: 0.9 }), snow: () => Tx().mat('snow'),
    vc: () => R3.mat('cab_vc', () => R3.std({ vertexColors: true, roughness: 0.72, metalness: 0 })),
    atlas: () => R3.mat('cab_atlas', () => { const m = R3.std({ map: atlasTex(), roughness: 0.88 }); return m; }),
    atlasGloss: () => R3.mat('cab_atlas_g', () => R3.std({ map: atlasTex(), roughness: 0.35 })),
  };

  // ---------------------------------------------------------------- printed things atlas (rugs, quilt, map, photo...)
  const AT = 1024;
  const REG = {
    rug: [0, 0, 512, 320], rugS: [512, 0, 384, 240], quilt: [0, 320, 384, 384], map: [384, 320, 384, 256], photo: [768, 320, 128, 96],
    clock: [896, 320, 128, 128], papers: [768, 448, 256, 128], books: [0, 704, 512, 128], labels: [512, 704, 256, 64], radio: [768, 704, 256, 128],
    cal: [512, 768, 128, 128], ledger: [640, 768, 128, 96], board: [896, 240, 128, 80], mapS: [384, 576, 256, 128],
  };
  let _atlas = null;
  function atlasTex() {
    if (_atlas) return _atlas;
    const c = document.createElement('canvas'); c.width = c.height = AT;
    const g = c.getContext('2d'), r = rng(911);
    const noise = (x, y, w, h, a, n) => { for (let i = 0; i < n; i++) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '0,0,0' : '255,255,255') + ',' + (a * r()) + ')'; g.fillRect(x + r() * w, y + r() * h, 1 + r() * 2, 1 + r() * 2); } };
    // big rug: oxblood field, ochre and navy borders, medallion
    (function () {
      const [x, y, w, h] = REG.rug;
      g.fillStyle = '#4a1414'; g.fillRect(x, y, w, h);
      const band = (i, col) => { g.strokeStyle = col; g.lineWidth = 10; g.strokeRect(x + i, y + i, w - i * 2, h - i * 2); };
      band(8, '#2a1a12'); band(22, '#9a7334'); band(36, '#1c2a44'); band(52, '#7a2a1c'); band(62, '#b08a48');
      for (let i = 0; i < 26; i++) { g.fillStyle = i % 2 ? '#c8a050' : '#24324c'; g.fillRect(x + 40 + i * 17, y + 32, 8, 8); g.fillRect(x + 40 + i * 17, y + h - 40, 8, 8); }
      g.save(); g.translate(x + w / 2, y + h / 2);
      [[120, '#1e2c46'], [96, '#a8823e'], [74, '#5a1a16'], [46, '#c8a050'], [24, '#1e2c46']].forEach(([s, col]) => { g.fillStyle = col; g.beginPath(); g.moveTo(-s * 1.4, 0); g.lineTo(0, -s * 0.8); g.lineTo(s * 1.4, 0); g.lineTo(0, s * 0.8); g.fill(); });
      g.restore();
      noise(x, y, w, h, 0.18, 9000);
      for (let i = 0; i < w; i += 3) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x + i, y, 1, h); }
    })();
    (function () { // small rug: braided rag rug
      const [x, y, w, h] = REG.rugS;
      g.fillStyle = '#2a3446'; g.fillRect(x, y, w, h);
      const cols = ['#5a4a3a', '#7a3a2a', '#3a4a5a', '#8a7a5a', '#4a2a2a', '#5a6a6a'];
      for (let i = 0; i < 22; i++) { g.strokeStyle = cols[i % cols.length]; g.lineWidth = 6; const ix = i * 8; g.beginPath(); g.ellipse(x + w / 2, y + h / 2, Math.max(4, w / 2 - 6 - ix), Math.max(2, h / 2 - 6 - ix * h / w), 0, 0, PI * 2); g.stroke(); }
      noise(x, y, w, h, 0.2, 5000);
    })();
    (function () { // quilt: patchwork
      const [x, y, w, h] = REG.quilt; const n = 8, s = w / n;
      const cols = ['#6a1c1c', '#2a3a5a', '#8a6a3a', '#3a4a3a', '#7a4a3a', '#b0a080', '#4a2a3a'];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { g.fillStyle = cols[(i * 3 + j * 5 + ((i * j) % 3)) % cols.length]; g.fillRect(x + i * s, y + j * s, s, s); g.strokeStyle = 'rgba(230,220,190,0.35)'; g.setLineDash([3, 3]); g.lineWidth = 1.5; g.strokeRect(x + i * s + 3, y + j * s + 3, s - 6, s - 6); }
      g.setLineDash([]); noise(x, y, w, h, 0.18, 6000);
    })();
    function drawMap(x, y, w, h) {
      g.fillStyle = '#d6c8a2'; g.fillRect(x, y, w, h);
      for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(110,90,50,' + (0.2 + r() * 0.3) + ')'; g.lineWidth = 1; g.beginPath(); const cx = x + r() * w, cy = y + r() * h, rr = 8 + r() * 50; g.ellipse(cx, cy, rr, rr * (0.5 + r() * 0.5), r() * 3, 0, PI * 2); g.stroke(); }
      g.strokeStyle = '#3a6a9a'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + w * 0.62, y); g.bezierCurveTo(x + w * 0.55, y + h * 0.3, x + w * 0.7, y + h * 0.6, x + w * 0.6, y + h); g.stroke();
      g.fillStyle = 'rgba(60,110,70,0.35)'; for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(x + r() * w, y + r() * h, 10 + r() * 30, 8 + r() * 20, 0, 0, PI * 2); g.fill(); }
      g.strokeStyle = 'rgba(60,40,30,0.8)'; g.setLineDash([5, 4]); g.lineWidth = 2; g.beginPath(); g.moveTo(x + 10, y + h * 0.5); g.lineTo(x + w * 0.4, y + h * 0.45); g.lineTo(x + w * 0.5, y + h * 0.8); g.lineTo(x + w - 10, y + h * 0.7); g.stroke(); g.setLineDash([]);
      [[0.3, 0.3], [0.5, 0.45], [0.8, 0.25], [0.2, 0.75], [0.7, 0.8]].forEach(([u, v], i) => { g.fillStyle = i === 1 ? '#c02020' : '#202060'; g.beginPath(); g.arc(x + u * w, y + v * h, 4, 0, PI * 2); g.fill(); });
      g.strokeStyle = '#3a2a1a'; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
      noise(x, y, w, h, 0.12, 3000);
    }
    drawMap(...REG.map); drawMap(...REG.mapS);
    (function () { // photograph: two figures before a lake, sepia
      const [x, y, w, h] = REG.photo;
      g.fillStyle = '#e8e0cc'; g.fillRect(x, y, w, h);
      const ix = x + 8, iy = y + 8, iw = w - 16, ih = h - 16;
      const gr = g.createLinearGradient(0, iy, 0, iy + ih); gr.addColorStop(0, '#b8a888'); gr.addColorStop(0.55, '#8a7a60'); gr.addColorStop(1, '#5a4a38'); g.fillStyle = gr; g.fillRect(ix, iy, iw, ih);
      g.fillStyle = '#3a3026'; for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(ix + i * 9, iy + ih * 0.55); g.lineTo(ix + i * 9 + 5, iy + ih * 0.2); g.lineTo(ix + i * 9 + 10, iy + ih * 0.55); g.fill(); }
      [[0.38, '#2a2018'], [0.6, '#3a2a20']].forEach(([u, col]) => { g.fillStyle = col; g.fillRect(ix + u * iw - 6, iy + ih * 0.45, 12, ih * 0.5); g.beginPath(); g.arc(ix + u * iw, iy + ih * 0.4, 6, 0, PI * 2); g.fill(); });
      noise(ix, iy, iw, ih, 0.2, 800);
    })();
    (function () { // clock face
      const [x, y, w] = REG.clock; const cx = x + w / 2, cy = y + w / 2;
      g.fillStyle = '#2a1c12'; g.fillRect(x, y, w, w);
      g.fillStyle = '#e4dcc4'; g.beginPath(); g.arc(cx, cy, w * 0.46, 0, PI * 2); g.fill();
      g.strokeStyle = '#1a1410'; g.lineWidth = 2; g.stroke();
      for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; g.lineWidth = i % 3 ? 2 : 4; g.beginPath(); g.moveTo(cx + Math.sin(a) * w * 0.36, cy - Math.cos(a) * w * 0.36); g.lineTo(cx + Math.sin(a) * w * 0.43, cy - Math.cos(a) * w * 0.43); g.stroke(); }
      noise(x, y, w, w, 0.1, 400);
    })();
    (function () { // loose papers & forms
      const [x, y, w, h] = REG.papers;
      g.fillStyle = '#ddd2b4'; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(40,40,60,0.6)';
      for (let j = 0; j < 14; j++) g.fillRect(x + 12, y + 12 + j * 8, (w / 2 - 30) * (0.5 + r() * 0.5), 2);
      for (let j = 0; j < 12; j++) g.fillRect(x + w / 2 + 10, y + 16 + j * 9, (w / 2 - 26) * (0.4 + r() * 0.6), 2);
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); g.stroke();
      g.fillStyle = 'rgba(160,30,30,0.7)'; g.fillRect(x + w - 40, y + 8, 28, 10);
      noise(x, y, w, h, 0.1, 1500);
    })();
    (function () { // book spines
      const [x, y, w, h] = REG.books; let cx = x;
      const cols = ['#5a1a1a', '#1a2a4a', '#2a3a22', '#6a5a3a', '#3a2a1a', '#7a6a4a', '#4a1a2a', '#1a1a1a', '#8a3a1a'];
      while (cx < x + w) { const bw = 10 + r() * 16; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(cx, y, bw, h); g.fillStyle = 'rgba(200,170,90,0.7)'; g.fillRect(cx + 2, y + h * 0.15, bw - 4, 2); g.fillRect(cx + 2, y + h * 0.8, bw - 4, 2); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(cx + bw - 1, y, 1, h); cx += bw; }
      noise(x, y, w, h, 0.15, 2000);
    })();
    (function () { // can / jar labels
      const [x, y, w, h] = REG.labels; const cols = ['#a83a2a', '#d0b060', '#3a6a4a', '#e0d8c0', '#2a4a7a'];
      for (let i = 0; i < 8; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(x + i * 32, y, 32, h); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(x + i * 32 + 4, y + h * 0.4, 24, 6); }
    })();
    (function () { // radio front panel
      const [x, y, w, h] = REG.radio;
      g.fillStyle = '#2c3430'; g.fillRect(x, y, w, h);
      g.fillStyle = '#121614'; g.fillRect(x + 12, y + 14, 100, 70); for (let i = 0; i < 12; i++) { g.fillStyle = '#2a302c'; g.fillRect(x + 14, y + 18 + i * 5.5, 96, 2); }
      g.fillStyle = '#c8a860'; g.fillRect(x + 130, y + 16, 110, 34); g.fillStyle = '#2a1a0a'; for (let i = 0; i < 20; i++) g.fillRect(x + 134 + i * 5.3, y + 20 + (i % 2 ? 4 : 0), 1, 10 - (i % 2 ? 4 : 0)); g.fillStyle = '#c02020'; g.fillRect(x + 180, y + 18, 2, 30);
      [[150, 82], [200, 82], [60, 106], [100, 106]].forEach(([u, v]) => { g.fillStyle = '#0c0e0c'; g.beginPath(); g.arc(x + u, y + v, 12, 0, PI * 2); g.fill(); g.fillStyle = '#5a5a52'; g.beginPath(); g.arc(x + u, y + v, 8, 0, PI * 2); g.fill(); });
      g.fillStyle = '#d8d0b8'; g.fillRect(x + 140, y + 104, 90, 14); g.fillStyle = '#222'; g.fillRect(x + 146, y + 109, 70, 3);
      noise(x, y, w, h, 0.1, 1500);
    })();
    (function () { // calendar
      const [x, y, w, h] = REG.cal; g.fillStyle = '#e0d8c0'; g.fillRect(x, y, w, h); g.fillStyle = '#8a2a1a'; g.fillRect(x, y, w, 26);
      g.fillStyle = '#333'; for (let j = 0; j < 5; j++) for (let i = 0; i < 7; i++) { g.fillRect(x + 8 + i * 16, y + 34 + j * 18, 8, 8); if ((i + j * 7) < 11) { g.strokeStyle = '#a02020'; g.beginPath(); g.moveTo(x + 6 + i * 16, y + 32 + j * 18); g.lineTo(x + 18 + i * 16, y + 44 + j * 18); g.stroke(); } }
    })();
    (function () { // ledger cover
      const [x, y, w, h] = REG.ledger; g.fillStyle = '#3a2418'; g.fillRect(x, y, w, h); g.fillStyle = '#c0a060'; g.fillRect(x + 20, y + 20, w - 40, 18); noise(x, y, w, h, 0.2, 800);
    })();
    (function () { // painted board (sign / tin)
      const [x, y, w, h] = REG.board; g.fillStyle = '#5a6a4a'; g.fillRect(x, y, w, h); g.fillStyle = '#e8e0c8'; g.font = 'bold 18px serif'; g.fillText('STATION 7', x + 10, y + 46); noise(x, y, w, h, 0.25, 1200);
    })();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true;
    _atlas = t; return t;
  }
  // plane (w x h, facing +Z) mapped to an atlas region
  function gAtlas(reg, w, h, rot) {
    const g = new THREE.PlaneGeometry(w, h);
    const [x, y, rw, rh] = REG[reg], uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      let u = uv.getX(i), v = uv.getY(i);
      if (rot) { const t = u; u = v; v = 1 - t; }
      uv.setXY(i, (x + u * rw) / AT, 1 - (y + (1 - v) * rh) / AT);
    }
    return g;
  }
  function gAtlasCyl(r, h) {
    const g = new THREE.CylinderGeometry(r, r, h, 10, 1, false); const [x, y, rw, rh] = REG.labels, uv = g.attributes.uv, k = (Math.floor(Math.random() * 8)) * 32;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + k + uv.getX(i) * 30) / AT, 1 - (y + (1 - uv.getY(i)) * rh) / AT);
    return g;
  }
  // box whose +Y face carries an atlas region, other faces a thin edge of it
  function gAtlasBox(reg, w, h, d) {
    const g = new THREE.BoxGeometry(w, h, d);
    const [x, y, rw, rh] = REG[reg], uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, (x + 2 + u * (rw - 4)) / AT, 1 - (y + 2 + (1 - v) * (rh - 4)) / AT); }
    return g;
  }

  // decals with alpha: glass cracks, door gouges and holes
  let _decal = null;
  const DREG = { crack1: [0, 0], crack2: [256, 0], dmg1: [512, 0], dmg2: [768, 0] };
  function decalTex() {
    if (_decal) return _decal;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
    const g = c.getContext('2d'), r = rng(77);
    function crack(x0, y0, n, len) {
      for (let i = 0; i < n; i++) {
        let x = x0, y = y0, a = r() * PI * 2;
        g.beginPath(); g.moveTo(x, y);
        const L = len * (0.5 + r() * 0.6);
        for (let s = 0; s < L; s += 10) { a += (r() - 0.5) * 0.6; x += Math.cos(a) * 10; y += Math.sin(a) * 10; g.lineTo(x, y); }
        g.stroke();
      }
    }
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(235,245,255,0.95)'; g.lineWidth = 1.6;
    crack(70, 80, 9, 150);
    g.strokeStyle = 'rgba(235,245,255,0.9)'; g.save(); g.translate(256, 0); crack(70, 80, 9, 150); crack(180, 170, 12, 180); crack(130, 120, 6, 90);
    for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(180, 170, 8 + i * 9, r() * 6, r() * 6 + 1.2); g.stroke(); }
    g.restore();
    // door damage: claw gouges (light raw wood) and dark holes
    function gouges(ox, n) { for (let k = 0; k < n; k++) { const x = ox + 30 + r() * 190, y = 20 + r() * 140; for (let i = 0; i < 4; i++) { g.strokeStyle = 'rgba(190,150,100,0.95)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + i * 9, y); g.lineTo(x + i * 9 + 14 + r() * 6, y + 60 + r() * 30); g.stroke(); g.strokeStyle = 'rgba(20,12,8,0.8)'; g.lineWidth = 1; g.stroke(); } } }
    gouges(512, 3);
    gouges(768, 5);
    function hole(x, y, s) { g.fillStyle = 'rgba(6,4,3,1)'; g.beginPath(); for (let i = 0; i < 14; i++) { const a = i / 14 * PI * 2, rr = s * (0.5 + r() * 0.6); i ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill(); g.strokeStyle = 'rgba(200,160,110,0.95)'; g.lineWidth = 3; g.stroke(); }
    hole(768 + 128, 128, 26); hole(768 + 60, 210, 16);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    _decal = t; return t;
  }
  function gDecal(reg, w, h, sub) {
    const g = new THREE.PlaneGeometry(w, h); const [x] = DREG[reg]; const uv = g.attributes.uv;
    const s = sub || [0, 0, 1, 1];
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + (s[0] + uv.getX(i) * s[2]) * 256) / 1024, s[1] + uv.getY(i) * s[3]);
    return g;
  }
  const decalMat = () => R3.mat('cab_decal', () => R3.std({ map: decalTex(), transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }));
  const crackMat = () => R3.mat('cab_crack', () => R3.std({ map: decalTex(), transparent: true, depthWrite: false, roughness: 0.15, side: THREE.DoubleSide, emissive: 0x0a0c10, emissiveIntensity: 1 }));

  // flame and smoke textures
  let _flame = null, _puff = null;
  function flameTex() {
    if (_flame) return _flame;
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
    for (let i = 0; i < 5; i++) {
      const cx = 14 + i * 25, h = 70 + (i % 2) * 40;
      const gr = g.createRadialGradient(cx, 120, 2, cx, 120 - h * 0.35, h * 0.7);
      gr.addColorStop(0, 'rgba(255,240,190,1)'); gr.addColorStop(0.25, 'rgba(255,170,60,0.9)'); gr.addColorStop(0.6, 'rgba(200,60,10,0.45)'); gr.addColorStop(1, 'rgba(120,20,0,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(cx - 14, 128); g.quadraticCurveTo(cx - 12, 120 - h * 0.5, cx, 120 - h); g.quadraticCurveTo(cx + 12, 120 - h * 0.5, cx + 14, 128); g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; _flame = t; return t;
  }
  function puffTex() {
    if (_puff) return _puff;
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = rng(5);
    for (let i = 0; i < 18; i++) { const x = 20 + r() * 24, y = 20 + r() * 24, rr = 8 + r() * 14; const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
    const t = new THREE.CanvasTexture(c); _puff = t; return t;
  }

  // ring materials: the fake exterior seen from inside. Indoors the core thins the fog (x0.25) and drops the
  // sun; these restore outdoor fog density and add back the missing outdoor fill so snow reads as daylight.
  const RU = { uRingFog: { value: 1 }, uRingFill: { value: 0 } };
  const ringCache = {};
  function ringMat(name, opts) {
    const key = name + JSON.stringify(opts || {});
    if (ringCache[key]) return ringCache[key];
    const m = Tx().mat(name, Object.assign({}, opts || {}, { _ring: 1 }));
    const prev = m.onBeforeCompile, pk = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
    m.onBeforeCompile = function (sh) {
      if (prev) prev.call(this, sh);
      sh.uniforms.uRingFog = RU.uRingFog; sh.uniforms.uRingFill = RU.uRingFill;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uRingFog; uniform float uRingFill;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * uRingFill;')
        .replace('#include <fog_fragment>', '#ifdef USE_FOG\n { float fa = 1.0 - pow(max(1.0 - r3FogAmount(), 0.0), uRingFog); gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fa); }\n#endif');
    };
    m.customProgramCacheKey = () => pk + '|ring';
    return (ringCache[key] = m);
  }

  // ================================================================ log walls
  // Visible side normal n = (nx, nz); plane coordinate c along n (face where log fronts sit); tangent range
  // [lo, hi] in world coords along d = up x n; openings [{a, b, y0, y1}] in world tangent coords.
  // opts: { y0 (base), H, phase, ext (extend ends), chink (bool), mat, outer (full round logs + end caps), seg }
  function logWall(B, nx, nz, c, lo, hi, openings, opts) {
    opts = opts || {};
    const y0 = opts.y0 || 0, H = opts.H || CEIL, phase = opts.phase || 0, r = opts.r || LOG_R, flat = opts.flat || LOG_F;
    const F = frame(nx, nz, nx * c, 0, nz * c);
    const d = new THREE.Vector3().crossVectors(UP, new THREE.Vector3(nx, 0, nz));
    const s = d.x + d.z; // +1 / -1: local u = t * s
    let u0 = Math.min(lo * s, hi * s), u1 = Math.max(lo * s, hi * s);
    const ext0 = opts.ext0 != null ? opts.ext0 : (opts.ext || 0), ext1 = opts.ext1 != null ? opts.ext1 : (opts.ext || 0);
    const ops = (openings || []).map((o) => ({ a: Math.min(o.a * s, o.b * s), b: Math.max(o.a * s, o.b * s), y0: o.y0, y1: o.y1 }));
    const logMat = opts.mat || M.log();
    const nC = Math.ceil((H - phase) / LOG_P);
    for (let k = -1; k < nC; k++) {
      const yc = y0 + phase + LOG_P * (k + 0.5);
      if (yc - r > y0 + H || yc + r * 0.2 < y0) continue;
      // cut by openings
      let segs = [[u0 - ext0, u1 + ext1]];
      ops.forEach((o) => {
        if (yc + r * 0.85 < o.y0 || yc - r * 0.85 > o.y1) return;
        const out = [];
        segs.forEach(([a, b]) => { if (o.b <= a || o.a >= b) { out.push([a, b]); return; } if (o.a > a) out.push([a, o.a]); if (o.b < b) out.push([o.b, b]); });
        segs = out;
      });
      segs.forEach(([a, b]) => {
        if (b - a < 0.02) return;
        // clip the top course at the ceiling with a squashed log
        const sy = yc + r > y0 + H ? Math.max(0.2, (y0 + H - (yc - r)) / (2 * r)) : 1;
        if (opts.outer) {
          const g = gLogX(r, b - a, opts.seg || 10);
          B.add(logMat, g, mul(F, lm((a + b) / 2, yc, -r * 0.45, 0, 0, 0, 1, 1, 1)));
          if (opts.caps) {
            if (a < u0 - 0.01) B.add(M.logEnd(), gDisc(r * 0.98, 10), mul(F, lm(a - 0.002, yc, -r * 0.45, -PI / 2)));
            if (b > u1 + 0.01) B.add(M.logEnd(), gDisc(r * 0.98, 10), mul(F, lm(b + 0.002, yc, -r * 0.45, PI / 2)));
          }
        } else {
          const g = gHalfLog(b - a, r, flat, opts.seg || 7);
          B.add(logMat, g, mul(F, lm(a, yc, 0, 0, 0, 0, 1, sy, 1)));
        }
      });
    }
    // chinking backing (rectangles around the openings)
    if (opts.chink !== false) {
      const zc = opts.outer ? -r * 0.6 : -r * flat * 0.45;
      const xs = [u0 - ext0, u1 + ext1]; ops.forEach((o) => { xs.push(Math.max(u0, o.a), Math.min(u1, o.b)); });
      xs.sort((p, q) => p - q);
      for (let i = 0; i < xs.length - 1; i++) {
        const a = xs[i], b = xs[i + 1]; if (b - a < 0.005) continue;
        const m = (a + b) / 2;
        let ys = [[y0, y0 + H]];
        ops.forEach((o) => { if (o.a < m && o.b > m) { const out = []; ys.forEach(([p, q]) => { if (o.y1 <= p || o.y0 >= q) { out.push([p, q]); return; } if (o.y0 > p) out.push([p, o.y0]); if (o.y1 < q) out.push([o.y1, q]); }); ys = out; } });
        ys.forEach(([p, q]) => { if (q - p < 0.005) return; B.add(M.chink(), gPlane(b - a, q - p), mul(F, lm(m, (p + q) / 2, zc))); });
      }
    }
    return F;
  }

  // ================================================================ room layout from the game's tile maps
  function roomInfo(id) {
    const a = W().get(id), o = R3.areaOrigin(id);
    let tx0 = 99, tx1 = -1, ty0 = 99, ty1 = -1;
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (W().tile(a, x, y) === W().T.FLOOR) { tx0 = Math.min(tx0, x); tx1 = Math.max(tx1, x); ty0 = Math.min(ty0, y); ty1 = Math.max(ty1, y); }
    const r = { id, a, o, tx0, tx1, ty0, ty1, x0: o.x + tx0 * TS * K, x1: o.x + (tx1 + 1) * TS * K, z0: o.z + ty0 * TS * K, z1: o.z + (ty1 + 1) * TS * K };
    r.P = (px, py) => ({ x: o.x + px * K, z: o.z + py * K });
    r.cx = (r.x0 + r.x1) / 2; r.cz = (r.z0 + r.z1) / 2;
    // doorway runs on each side
    const DW = W().T.DOORWAY, runs = { top: [], bottom: [], left: [], right: [] };
    const scan = (side, coords) => { let cur = null; coords.forEach(([x, y, t]) => { if (W().tile(a, x, y) === DW) { if (!cur) { cur = [t, t]; runs[side].push(cur); } else cur[1] = t; } else cur = null; }); };
    const row = (y) => { const out = []; for (let x = tx0; x <= tx1; x++) out.push([x, y, x]); return out; };
    const col = (x) => { const out = []; for (let y = ty0; y <= ty1; y++) out.push([x, y, y]); return out; };
    scan('top', row(ty0 - 1)); scan('bottom', row(ty1 + 1)); scan('left', col(tx0 - 1)); scan('right', col(tx1 + 1));
    r.doorways = runs;
    return r;
  }
  // side descriptors: visible normal into the room, plane coordinate c (= dot(face point, n)), tangent range
  function sideOf(r, side) {
    switch (side) {
      case 'top': return { nx: 0, nz: 1, c: r.z0, lo: r.x0, hi: r.x1, plane: r.z0, axis: 'x' };
      case 'bottom': return { nx: 0, nz: -1, c: -r.z1, lo: r.x0, hi: r.x1, plane: r.z1, axis: 'x' };
      case 'left': return { nx: 1, nz: 0, c: r.x0, lo: r.z0, hi: r.z1, plane: r.x0, axis: 'z' };
      default: return { nx: -1, nz: 0, c: -r.x1, lo: r.z0, hi: r.z1, plane: r.x1, axis: 'z' };
    }
  }
  // world point on a side's face at tangent t
  function facePoint(sd, t) { return sd.axis === 'x' ? { x: t, z: sd.plane } : { x: sd.plane, z: t }; }

  // ================================================================ furniture models (local: origin on floor, front = +Z)
  const FURN = {};
  FURN.chair = function (o, rot) {
    const leg = gBoxV(0.04, 0.45, 0.04);
    [[-0.19, -0.17], [0.19, -0.17], [-0.19, 0.17], [0.19, 0.17]].forEach(([x, z]) => o.put(M.dark(), leg, x, 0.225, z));
    o.box(M.plank(), 0.46, 0.04, 0.42, 0, 0.47, 0, 0.0);
    [-0.19, 0.19].forEach((x) => o.boxV(M.dark(), 0.04, 0.5, 0.04, x, 0.72, -0.19));
    o.box(M.plank(), 0.42, 0.09, 0.025, 0, 0.88, -0.19); o.box(M.plank(), 0.42, 0.06, 0.025, 0, 0.7, -0.19);
    o.box(M.dark(), 0.38, 0.03, 0.03, 0, 0.12, 0.17); o.box(M.dark(), 0.03, 0.03, 0.34, -0.19, 0.12, 0); o.box(M.dark(), 0.03, 0.03, 0.34, 0.19, 0.12, 0);
    void rot;
  };
  FURN.barrel = function (o, h, r) {
    h = h || 0.85; r = r || 0.28;
    const n = 7, g = new THREE.LatheGeometry(Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return new THREE.Vector2(r * (0.86 + 0.14 * Math.sin(t * PI)), t * h); }), 14);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * h, uv.getX(i) * PI * 2 * r);
    o.put(M.plank(), g, 0, 0, 0, 0, 0, 0);
    [0.12, 0.5, 0.88].forEach((t) => { const rr = r * (0.86 + 0.14 * Math.sin(t * PI)) + 0.006; o.cyl(M.rust(), rr, rr, 0.04, 0, t * h, 0, 16); });
    o.put(M.dark(), new THREE.CircleGeometry(r * 0.86, 14), 0, h - 0.02, 0, 0, -PI / 2);
  };
  FURN.lampTable = function (o) { // returns local glass centre
    o.cyl(M.brass(), 0.075, 0.09, 0.03, 0, 0.015, 0, 16);
    o.cyl(M.brass(), 0.03, 0.05, 0.05, 0, 0.055, 0, 12);
    o.put(M.glass(), new THREE.LatheGeometry([[0.03, 0], [0.065, 0.02], [0.07, 0.06], [0.055, 0.1], [0.02, 0.12]].map(([x, y]) => new THREE.Vector2(x, y)), 14), 0, 0.08, 0);
    o.cyl(M.brass(), 0.04, 0.04, 0.03, 0, 0.215, 0, 12);
    return { x: 0, y: 0.32, z: 0 };
  };
  FURN.lampWall = function (o) { // mounted on a wall at local z = 0 (wall), returns glass centre
    o.box(M.brass(), 0.08, 0.16, 0.02, 0, 0, 0.01);
    o.box(M.brass(), 0.02, 0.02, 0.16, 0, -0.04, 0.09);
    o.cyl(M.brass(), 0.07, 0.06, 0.03, 0, -0.06, 0.17, 14);
    o.put(M.glass(), new THREE.LatheGeometry([[0.03, 0], [0.065, 0.02], [0.07, 0.06], [0.055, 0.1], [0.02, 0.12]].map(([x, y]) => new THREE.Vector2(x, y)), 14), 0, -0.045, 0.17);
    o.put(M.brass(), new THREE.TorusGeometry(0.035, 0.006, 6, 14), 0, 0.12, 0.17, 0, PI / 2);
    return { x: 0, y: 0.04, z: 0.17 };
  };
  FURN.splitLogs = function (o, n, len, r0, rnd) {
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / 5), col = i % 5;
      const r = r0 * (0.8 + rnd() * 0.4), x = (col - 2) * r0 * 2.05 + row * r0 * 0.9, y = r + row * r0 * 1.75;
      if (col > 4 - row) continue;
      o.put(M.log(), gLogX(r, len, 7), x, y, 0, PI / 2, rnd() * 3);
      o.put(M.logEnd(), gDisc(r * 0.97, 7), x, y, len / 2 + 0.001, 0, 0, rnd() * 3);
      o.put(M.logEnd(), gDisc(r * 0.97, 7), x, y, -len / 2 - 0.001, PI, 0, rnd() * 3);
    }
  };

  // ================================================================ dynamic parts
  // a mesh fixed in place by a full matrix (no auto update)
  function fixed(mesh, m) { mesh.matrixAutoUpdate = false; mesh.matrix.copy(m); return mesh; }
  function mergeGroup(fn, cast) { const B = new Bld(); fn(B); const g = new THREE.Group(); B.flush(g, { cast: cast ? true : false }); return g; }

  // ---- window (interior side): frame F local: x across, y up, z into room; glass plane, curtains, boards, shutters outside
  function buildWindowInt(B, group, F, wid, wW, y0, y1, depth) {
    const o = new Ctx(B, F), w = wW, h = y1 - y0, cy = (y0 + y1) / 2, tb = 0.12;
    // reveal lining & sill & casing
    o.box(M.plank(), 0.04, h, depth, -w / 2 - 0.02, cy, -depth / 2); o.box(M.plank(), 0.04, h, depth, w / 2 + 0.02, cy, -depth / 2);
    o.box(M.plank(), w + 0.08, 0.04, depth, 0, y1 + 0.02, -depth / 2);
    o.box(M.plank(), w + 0.3, 0.045, depth + 0.1, 0, y0 - 0.022, -depth / 2 + 0.05);
    o.box(M.dark(), w + 0.24, 0.06, 0.04, 0, y0 - 0.08, 0.02);
    o.boxV(M.dark(), tb, h + tb + 0.02, 0.03, -w / 2 - tb / 2, cy + tb / 2, 0.015); o.boxV(M.dark(), tb, h + tb + 0.02, 0.03, w / 2 + tb / 2, cy + tb / 2, 0.015);
    o.box(M.dark(), w + tb * 2 + 0.04, tb, 0.035, 0, y1 + tb / 2, 0.017);
    // sash at depth -0.2: frame, mullion cross
    const zs = -depth + 0.13;
    o.box(M.dark(), w, 0.06, 0.05, 0, y0 + 0.03, zs); o.box(M.dark(), w, 0.06, 0.05, 0, y1 - 0.03, zs);
    o.boxV(M.dark(), 0.06, h, 0.05, -w / 2 + 0.03, cy, zs); o.boxV(M.dark(), 0.06, h, 0.05, w / 2 - 0.03, cy, zs);
    o.boxV(M.dark(), 0.035, h, 0.04, 0, cy, zs); o.box(M.dark(), w, 0.035, 0.04, 0, cy, zs);
    // curtain rod
    o.cyl(M.iron(), 0.012, 0.012, w + 0.5, 0, y1 + 0.2, 0.12, 8, 0, PI / 2);
    [-1, 1].forEach((sx) => { o.put(M.iron(), gSphere(0.025, 8, 6), sx * (w / 2 + 0.26), y1 + 0.2, 0.12); o.box(M.iron(), 0.015, 0.015, 0.12, sx * (w / 2 + 0.15), y1 + 0.2, 0.06); });
    // dynamic: glass
    const gw = w - 0.1, gh = h - 0.1;
    const glass = fixed(new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), M.glass()), mul(F, lm(0, cy, zs - 0.005))); glass.renderOrder = 2; group.add(glass);
    const cr1 = fixed(new THREE.Mesh(gDecal('crack1', gw, gh), crackMat()), mul(F, lm(0, cy, zs + 0.004))); cr1.renderOrder = 3; group.add(cr1);
    const cr2 = fixed(new THREE.Mesh(gDecal('crack2', gw, gh), crackMat()), mul(F, lm(0, cy, zs + 0.006))); cr2.renderOrder = 3; group.add(cr2);
    // broken: jagged shards left in the frame + on the sill/floor
    const shards = mergeGroup((SB) => {
      const so = new Ctx(SB, F), rr = rng(wid.length * 13 + 7);
      for (let i = 0; i < 12; i++) {
        const edge = i % 4, t = rr() * 0.8 + 0.1, L = 0.08 + rr() * 0.18;
        const shape = new THREE.Shape(); shape.moveTo(-0.06, 0); shape.lineTo(0.06, 0); shape.lineTo((rr() - 0.5) * 0.05, L); shape.closePath();
        const g = new THREE.ShapeGeometry(shape);
        const px = edge < 2 ? -gw / 2 + t * gw : (edge === 2 ? -gw / 2 : gw / 2), py = edge === 0 ? y0 + 0.06 : edge === 1 ? y1 - 0.06 : y0 + 0.06 + t * (gh);
        const rot = edge === 0 ? 0 : edge === 1 ? PI : edge === 2 ? -PI / 2 : PI / 2;
        so.put(M.glass(), g, px, py, zs - 0.004, 0, 0, rot);
      }
      for (let i = 0; i < 9; i++) { const g = new THREE.CircleGeometry(0.03 + rr() * 0.05, 3); so.put(M.glass(), g, (rr() - 0.5) * w * 1.2, 0.006 + rr() * 0.002, 0.15 + rr() * 0.7, rr() * 6, -PI / 2); }
      for (let i = 0; i < 5; i++) { const g = new THREE.CircleGeometry(0.02 + rr() * 0.04, 3); so.put(M.glass(), g, (rr() - 0.5) * w, y0 + 0.003, -depth / 2 + rr() * 0.12, rr() * 6, -PI / 2); }
    });
    shards.children.forEach((m) => { m.castShadow = false; }); group.add(shards);
    // curtains: two folded panels, scale.x animates (closed 1, open 0.26)
    const cw = w / 2 + 0.3, ch = (y1 + 0.2) - (y0 - 0.12);
    const cg = R3.geo('cab_curtain_' + cw.toFixed(2) + '_' + ch.toFixed(2), () => { const g = gCurtain(cw, ch, 5); g.userData.shared = true; return g; });
    const curt = [-1, 1].map((sx) => {
      const piv = new THREE.Group(); piv.matrixAutoUpdate = false; piv.matrix.copy(mul(F, lm(sx * (w / 2 + 0.3), y1 + 0.18, 0.12)));
      const m = new THREE.Mesh(cg, M.red()); m.scale.x = -sx; m.castShadow = true; m.receiveShadow = true; piv.add(m); group.add(piv); return m;
    });
    // boards nailed across inside
    const boards = [[-0.1, 0.12], [0.07, -0.18], [-0.04, 0.0]].map(([rz, dy], i) => {
      const bg = mergeGroup((BB) => { const bo = new Ctx(BB, F); bo.box(M.weath(), w + 0.34, 0.17, 0.028, 0, cy + (i - 1) * h * 0.34 + dy * 0.2, 0.045, 0, 0, rz); [-1, 1].forEach((sx) => [-0.04, 0.04].forEach((dyy) => bo.cyl(M.metal(), 0.007, 0.007, 0.01, sx * (w / 2 + 0.09), cy + (i - 1) * h * 0.34 + dy * 0.2 + dyy + sx * Math.sin(-rz) * (w / 2 + 0.09), 0.06, 6, PI / 2))); });
      group.add(bg); return bg;
    });
    // shutters outside: hinged at the outer jamb edges
    const shut = [-1, 1].map((sx) => {
      const piv = new THREE.Group(); piv.matrixAutoUpdate = false; piv.matrix.copy(mul(F, lm(sx * (w / 2 + 0.03), cy, -depth - 0.025)));
      const inner = new THREE.Group(); piv.add(inner);
      const leaf = mergeGroup((SB) => {
        const so = new Ctx(SB, new THREE.Matrix4());
        const lw = w / 2 + 0.02;
        for (let i = 0; i < 4; i++) so.boxV(M.weath(), lw / 4 - 0.006, h + 0.1, 0.03, -sx * (lw / 8 + i * lw / 4), 0, 0);
        so.box(M.weath(), lw - 0.04, 0.1, 0.025, -sx * lw / 2, h * 0.32, -0.025); so.box(M.weath(), lw - 0.04, 0.1, 0.025, -sx * lw / 2, -h * 0.32, -0.025);
        so.box(M.weath(), Math.hypot(lw, h * 0.6) - 0.06, 0.08, 0.022, -sx * lw / 2, 0, -0.024, 0, 0, sx * Math.atan2(h * 0.6, lw));
        so.box(M.iron(), 0.22, 0.03, 0.01, -sx * 0.1, h * 0.32, -0.04); so.box(M.iron(), 0.22, 0.03, 0.01, -sx * 0.1, -h * 0.32, -0.04);
      });
      inner.add(leaf); group.add(piv); return { piv, inner };
    });
    return { glass, cr1, cr2, shards, curt, boards, shut, cs: [1, 1], sa: [0, 0], F };
  }
  function updateWindow(wd, w, dt, ext) {
    const broken = w.glass <= 0;
    wd.glass.visible = !broken;
    wd.cr1.visible = !broken && w.glass < 70; wd.cr2.visible = !broken && w.glass < 35;
    wd.shards.visible = broken;
    const bn = w.boarded > 0 ? Math.max(1, Math.min(3, Math.ceil(w.boarded / 34))) : 0;
    wd.boards.forEach((b, i) => { b.visible = i < bn; });
    if (wd.curt) {
      const tgt = w.curtClosed ? 1 : 0.24;
      wd.curt.forEach((m, i) => { wd.cs[i] += (tgt - wd.cs[i]) * Math.min(1, dt * 5); m.scale.x = (i ? 1 : -1) * -wd.cs[i]; m.visible = true; });
    }
    // shutters: closed 0, open swung back flat against the wall; broken: one dangling, one gone
    const closed = w.shutClosed && w.shutter > 0;
    wd.shut.forEach((s, i) => {
      const sx = i ? 1 : -1;
      let ang = closed ? 0 : sx * -2.95 * (ext ? -1 : 1), rz = 0;
      if (w.shutter <= 0) { if (i) { s.piv.visible = false; return; } ang = sx * -1.2 * (ext ? -1 : 1); rz = 0.35; }
      s.piv.visible = true;
      wd.sa[i] += (ang - wd.sa[i]) * Math.min(1, dt * 6);
      s.inner.rotation.set(0, wd.sa[i], rz);
    });
  }

  // ---- door leaf with pivot (frame F local: x across opening, z into the room / inward side); hinge on -x side
  function buildDoor(group, F, did, w, h, zLeaf, inwardSign) {
    const piv = new THREE.Group(); piv.matrixAutoUpdate = false; piv.matrix.copy(mul(F, lm(-w / 2, 0, zLeaf)));
    group.add(piv);
    const leaf = new THREE.Group(); piv.add(leaf);
    const zi = inwardSign; // +1: inside face toward +z
    leaf.add(mergeGroup((B) => {
      const o = new Ctx(B, new THREE.Matrix4());
      const n = 6, bw = w / n;
      for (let i = 0; i < n; i++) o.boxV(M.plank(), bw - 0.004, h - 0.01, 0.045, bw * (i + 0.5), h / 2, 0);
      // Z brace on the inside face, iron strap hinges on the outside
      o.box(M.dark(), w - 0.08, 0.13, 0.03, w / 2, h * 0.2, zi * 0.037); o.box(M.dark(), w - 0.08, 0.13, 0.03, w / 2, h * 0.8, zi * 0.037);
      o.box(M.dark(), Math.hypot(w - 0.2, h * 0.6) - 0.05, 0.12, 0.028, w / 2, h / 2, zi * 0.037, 0, 0, Math.atan2(h * 0.6, w - 0.2));
      [h * 0.2, h * 0.8].forEach((y) => { o.box(M.iron(), w * 0.62, 0.045, 0.012, w * 0.31, y, -zi * 0.03); o.cyl(M.iron(), 0.02, 0.02, 0.12, 0.0, y, 0, 8); });
      // handle & latch both sides, peephole (front door)
      [1, -1].forEach((sd) => { o.put(M.iron(), new THREE.TorusGeometry(0.045, 0.009, 6, 12, PI), w - 0.12, 1.02, sd * 0.03, 0, 0, -PI / 2); o.box(M.iron(), 0.05, 0.1, 0.012, w - 0.12, 1.02, sd * 0.027); });
      o.box(M.iron(), 0.14, 0.035, 0.02, w - 0.1, 1.12, zi * 0.035);
      if (did === 'front') { o.cyl(M.brass(), 0.016, 0.016, 0.06, w / 2, 1.56, 0, 10, PI / 2); }
    }, true));
    // reinforcement crossbars (inside)
    const bars = mergeGroup((B) => { const o = new Ctx(B, new THREE.Matrix4()); [0.55, 1.45].forEach((y) => { o.box(M.dark(), w + 0.1, 0.16, 0.07, w / 2, y, zi * 0.075); [0.08, w - 0.08].forEach((x) => o.cyl(M.metal(), 0.012, 0.012, 0.02, x, y, zi * 0.11, 6, PI / 2)); }); });
    leaf.add(bars);
    // lock bolt (inside)
    const bolt = mergeGroup((B) => { const o = new Ctx(B, new THREE.Matrix4()); o.box(M.metal(), 0.18, 0.025, 0.025, 0, 0, 0); o.box(M.metal(), 0.02, 0.05, 0.02, -0.03, 0.03, 0.0); });
    bolt.position.set(w - 0.14, 1.2, zi * 0.045); leaf.add(bolt);
    const guide = mergeGroup((B) => { const o = new Ctx(B, new THREE.Matrix4()); o.box(M.metal(), 0.05, 0.05, 0.03, 0, 0, 0); });
    guide.position.set(w - 0.2, 1.2, zi * 0.045); leaf.add(guide);
    // damage decals on both faces
    const dmg = [['dmg1', 0], ['dmg2', 0], ['dmg2', 1]].map(([reg, extra]) => {
      const g2 = new THREE.Group();
      [1, -1].forEach((sd) => { const m = new THREE.Mesh(gDecal(reg, w * 0.9, h * 0.6, extra ? [0.4, 0, 0.6, 1] : null), decalMat()); m.position.set(w / 2 + (extra ? 0.1 : 0), extra ? 1.4 : 0.9, sd * 0.0235); if (sd < 0) m.rotation.y = PI; m.renderOrder = 2; g2.add(m); });
      leaf.add(g2); return g2;
    });
    // splintered remains (hp <= 0): stub boards at the hinge, planks on the floor inside
    const broken = mergeGroup((B) => {
      const o = new Ctx(B, mul(F, lm(-w / 2, 0, zLeaf))), rr = rng(did.length * 31);
      for (let i = 0; i < 2; i++) { const hh = 0.5 + rr() * 1.2; o.boxV(M.plank(), w / 6 - 0.01, hh, 0.045, w / 12 + i * w / 6, hh / 2, 0, 0, 0, (rr() - 0.5) * 0.08); }
      o.box(M.iron(), 0.1, 0.045, 0.012, 0.05, h * 0.8, -zi * 0.03, 0, 0, 0.6);
      for (let i = 0; i < 5; i++) { const L = 0.5 + rr() * 1.2; o.boxV(M.plank(), w / 6 - 0.01, L, 0.045, 0.2 + rr() * (w - 0.2), 0.03 + i * 0.012, zi * (0.4 + rr() * 1.0), rr() * PI, PI / 2); }
      for (let i = 0; i < 10; i++) o.box(M.plank(), 0.02 + rr() * 0.04, 0.01, 0.1 + rr() * 0.25, rr() * w, 0.006, zi * (0.2 + rr() * 1.3), rr() * PI);
    });
    group.add(broken);
    return { piv, leaf, bars, bolt, dmg, broken, ang: 0, w, inwardSign };
  }
  function updateDoor(dd, d, anim, scratch, dt, t) {
    const dead = d.hp <= 0;
    dd.leaf.visible = !dead; dd.broken.visible = dead;
    let open = d.open ? 1 : 0;
    if (anim > 0 && !d.open) open = anim > 0.35 ? (0.6 - anim) / 0.25 : anim / 0.35;
    const tgt = -dd.inwardSign * open * 1.62;
    dd.ang += (tgt - dd.ang) * Math.min(1, dt * 7);
    let jit = 0; if (scratch && !d.open && !dead) jit = Math.sin(t * 31) * 0.006 + Math.sin(t * 13.7) * 0.004;
    dd.leaf.rotation.y = dd.ang + jit * dd.inwardSign * -1;
    dd.bars.visible = !!d.reinforced;
    const f = d.hp / (d.max || 100);
    dd.dmg[0].visible = f < 0.75; dd.dmg[1].visible = f < 0.45; dd.dmg[2].visible = f < 0.2;
    // bolt: locked -> slid into the jamb, unlocked -> back, broken -> hanging bent
    const b = dd.bolt;
    if (d.lockBroken) { b.position.x = dd.w - 0.12; b.rotation.z = -0.7; b.position.y = 1.15; }
    else { b.rotation.z = 0; b.position.y = 1.2; b.position.x += ((d.locked ? dd.w - 0.02 : dd.w - 0.14) - b.position.x) * Math.min(1, dt * 10); }
  }
  // the leaf's pivot group is driven by matrix; apply leaf rotation via child (pivot matrix fixed)

  // ---- woodpile (instanced split logs, count from state)
  function buildWoodpile(group, base, max, ringed) {
    const lg = R3.geo('cab_wp_log', () => { const g = gLogX(0.075, 0.48, 7); g.rotateY(PI / 2); g.userData.shared = true; return g; });
    const cg = R3.geo('cab_wp_cap', () => { const a = gDisc(0.073, 7); a.translate(0, 0, 0.241); const b = gDisc(0.073, 7); b.rotateY(PI); b.translate(0, 0, -0.241); const g = R3.merge([{ geo: a }, { geo: b }]); g.userData.shared = true; return g; });
    const m1 = new THREE.InstancedMesh(lg, ringed ? ringMat('wood_log', { snowTop: 0.6 }) : M.snowLog(), max), m2 = new THREE.InstancedMesh(cg, ringed ? ringMat('wood_log_end') : M.logEnd(), max);
    const rr = rng(41), mats = [];
    const per = 10;
    for (let i = 0; i < max; i++) {
      const row = Math.floor(i / per), col = i % per;
      const x = (col - (per - 1) / 2) * 0.155 + (row % 2) * 0.07, y = 0.08 + row * 0.135;
      mats.push(mul(base, lm(x, y, (rr() - 0.5) * 0.06, (rr() - 0.5) * 0.08, 0, rr() * 6)));
    }
    mats.forEach((m, i) => { m1.setMatrixAt(i, m); m2.setMatrixAt(i, m); });
    [m1, m2].forEach((m) => { m.castShadow = true; m.receiveShadow = true; m.count = 0; group.add(m); });
    // shelter frame (static, merged by caller via returned function)
    return { set(n) { n = Math.max(0, Math.min(max, n | 0)); m1.count = n; m2.count = n; } };
  }
  function woodpileFrame(o, len, h, roofMat) {
    [-1, 1].forEach((sx) => { o.boxV(M.wweath(), 0.09, h, 0.09, sx * len / 2, h / 2, -0.22); o.boxV(M.wweath(), 0.09, h - 0.15, 0.09, sx * len / 2, (h - 0.15) / 2, 0.24); });
    o.box(M.wweath(), len + 0.3, 0.06, 0.8, 0, h + 0.02, 0, 0, 0.18);
    o.box(roofMat, len + 0.4, 0.04, 0.84, 0, h + 0.07, 0.0, 0, 0.18);
    o.box(M.wweath(), len, 0.08, 0.6, 0, 0.04, 0);
  }

  // ================================================================ INTERIOR
  Cab.buildInterior = function () {
    const group = new THREE.Group(); group.name = 'cabin-int';
    const ROOMS = ['room_main', 'room_bed', 'room_office', 'room_storage'];
    const RI = {}; ROOMS.forEach((id) => { RI[id] = roomInfo(id); });
    const builders = {}; ROOMS.forEach((id) => { builders[id] = new Bld(); });
    const ringB = new Bld();
    const anchors = { windows: {}, rooms: {} };
    const dyn = { windows: {}, doors: {}, lamps: [], dayLights: [], spills: [] };

    // ---- openings per room side
    const ops = {}; // room -> side -> [{kind, t, w, y0, y1, ...}]
    ROOMS.forEach((id) => { ops[id] = { top: [], bottom: [], left: [], right: [] }; });
    const passages = [];
    ROOMS.forEach((id) => {
      const r = RI[id];
      ['top', 'bottom', 'left', 'right'].forEach((side) => r.doorways[side].forEach(([a, b]) => {
        const sd = sideOf(r, side);
        const t = sd.axis === 'x' ? r.o.x + (a + b + 1) / 2 * TS * K : r.o.z + (a + b + 1) / 2 * TS * K;
        ops[id][side].push({ kind: 'pass', t, w: PASS.w, y0: 0, y1: PASS.h });
        if (id === 'room_main') passages.push({ from: id, side, t });
      }));
      r.a.objs.forEach((ob) => {
        if (ob.type === 'window') {
          const side = ob.side, sd = sideOf(r, side), p = r.P(ob.x + 16, ob.y);
          ops[id][side].push({ kind: 'window', wid: ob.wid, t: sd.axis === 'x' ? p.x : p.z, w: WIN.w, y0: WIN.y0, y1: WIN.y1 });
        } else if (ob.type === 'door') {
          const side = ob.side, sd = sideOf(r, side);
          const p = side === 'right' ? r.P(ob.x, ob.y + 16) : r.P(ob.x + 16, ob.y);
          ops[id][side].push({ kind: 'door', did: ob.did, t: sd.axis === 'x' ? p.x : p.z, w: DOOR.w, y0: 0, y1: DOOR.h });
        }
      });
    });
    // passage partner rooms and wall gap
    const partner = { left: ['room_bed', 'right'], right: ['room_office', 'left'], top: ['room_storage', 'bottom'] };
    passages.forEach((p) => { const [rid, side] = partner[p.side]; p.to = rid; p.toSide = side; p.a = sideOf(RI.room_main, p.side).plane; p.b = sideOf(RI[rid], side).plane; });

    // ---- shells: floors, ceilings, beams, walls
    ROOMS.forEach((id, ri) => {
      const r = RI[id], B = builders[id], w = r.x1 - r.x0, d = r.z1 - r.z0;
      const fl = new THREE.PlaneGeometry(w, d); fl.rotateX(-PI / 2); fl.translate(r.cx, 0, r.cz); Tx().metreUV(fl); B.add(M.floor(), fl);
      const ce = new THREE.PlaneGeometry(w, d); ce.rotateX(PI / 2); ce.translate(r.cx, CEIL, r.cz); Tx().metreUV(ce); B.add(M.dark(), ce);
      // beams across the short span, plus a wall plate along the long sides
      const alongX = w < d; const span = alongX ? w : d, len = alongX ? d : w;
      const nb = Math.max(2, Math.round(len / 1.9));
      for (let i = 0; i < nb; i++) {
        const t = (i + 0.5) / nb * len;
        const g = gLogX(0.12, span + 0.1, 10);
        if (alongX) B.add(M.log(), g, lm(r.cx, CEIL - 0.1, r.z0 + t, 0, 0, 0, 1, 0.85, 1)); else B.add(M.log(), g, lm(r.x0 + t, CEIL - 0.1, r.cz, PI / 2, 0, 0, 1, 0.85, 1));
      }
      ['top', 'bottom', 'left', 'right'].forEach((side) => {
        const sd = sideOf(r, side);
        const o2 = ops[id][side].map((op) => ({ a: op.t - op.w / 2, b: op.t + op.w / 2, y0: op.y0, y1: op.y1 }));
        logWall(B, sd.nx, sd.nz, sd.c, sd.lo, sd.hi, o2, { H: CEIL, phase: sd.axis === 'x' ? 0 : LOG_P / 2, ext: LOG_R * LOG_F });
        // base trim along floor is the bottom log; corner posts hide the seams
      });
      [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]].forEach(([x, z]) => { B.add(M.dark(), gBoxV(0.14, CEIL, 0.14), lm(x, CEIL / 2, z, PI / 4)); });
      anchors.rooms[id] = { center: new THREE.Vector3(r.cx, 0, r.cz), corners: [new THREE.Vector3(r.x0, 0, r.z0), new THREE.Vector3(r.x1, 0, r.z0), new THREE.Vector3(r.x1, 0, r.z1), new THREE.Vector3(r.x0, 0, r.z1)] };
      void ri;
    });
    // passage linings (through the thick wall between two room faces)
    passages.forEach((p) => {
      const B = builders.room_main, sd = sideOf(RI.room_main, p.side);
      const n0 = Math.min(p.a, p.b), n1 = Math.max(p.a, p.b), depth = n1 - n0, mid = (n0 + n1) / 2;
      const nrm = sd.axis === 'x' ? [0, 1] : [1, 0];
      const F = frame(nrm[0], nrm[1], sd.axis === 'x' ? p.t : mid, 0, sd.axis === 'x' ? mid : p.t);
      const o = new Ctx(B, F), hw = PASS.w / 2;
      [-1, 1].forEach((sx) => { o.put(M.plank(), gBoxV(depth, PASS.h, 0.05), sx * (hw + 0.025), PASS.h / 2, 0, PI / 2); });
      o.put(M.log(), gLogX(0.13, PASS.w + 0.3, 10), 0, PASS.h + 0.13, 0, 0, 0, 0, 1, 1, depth / 0.26);
      o.box(M.plank(), PASS.w, 0.03, depth, 0, PASS.h + 0.015, 0);
      const fl = new THREE.PlaneGeometry(PASS.w, depth); fl.rotateX(-PI / 2); Tx().metreUV(fl); o.put(M.floor(), fl, 0, 0.001, 0);
      o.box(M.dark(), PASS.w + 0.1, 0.03, 0.14, 0, 0.015, depth / 2 - 0.07); o.box(M.dark(), PASS.w + 0.1, 0.03, 0.14, 0, 0.015, -depth / 2 + 0.07);
      // casing on both faces
      [-1, 1].forEach((fz) => {
        const z = fz * (depth / 2 + 0.015);
        [-1, 1].forEach((sx) => o.boxV(M.dark(), 0.13, PASS.h + 0.13, 0.03, sx * (hw + 0.065), (PASS.h + 0.13) / 2, z));
        o.box(M.dark(), PASS.w + 0.3, 0.14, 0.035, 0, PASS.h + 0.07, z);
      });
    });

    // ---- windows & doors in their openings
    ROOMS.forEach((id) => {
      const r = RI[id], B = builders[id];
      ['top', 'bottom', 'left', 'right'].forEach((side) => {
        const sd = sideOf(r, side);
        ops[id][side].forEach((op) => {
          const fp = facePoint(sd, op.t);
          const F = frame(sd.nx, sd.nz, fp.x, 0, fp.z);
          const out = { x: -sd.nx, z: -sd.nz };
          if (op.kind === 'window') {
            const wd = buildWindowInt(B, group, F, op.wid, op.w, op.y0, op.y1, WT);
            dyn.windows[op.wid] = Object.assign(wd, { room: id, fp, out });
            const front = side === 'bottom';
            const oy = front ? PORCH_Y : GROUND;
            const op2 = { x: fp.x + out.x * (WT + 0.6), z: fp.z + out.z * (WT + 0.6) };
            // window view: inside, looking out; front windows turn toward the door/porch
            let fx = out.x, fz = out.z;
            if (front) { const door = ops.room_main.bottom.find((q) => q.kind === 'door'); const s = Math.sign(door.t - op.t); const a = 0.42 * s; fx = Math.sin(a); fz = Math.cos(a); }
            anchors.windows[op.wid] = {
              outside: new THREE.Vector3(op2.x, oy, op2.z), yaw: yawTo(out.x, out.z),
              view: { pos: new THREE.Vector3(fp.x - out.x * 0.28, 1.52, fp.z - out.z * 0.28), yaw: camYaw(fx, fz), pitch: front ? -0.1 : -0.06 },
            };
            dyn.dayLights.push({ wid: op.wid, x: fp.x - out.x * 0.9, z: fp.z - out.z * 0.9 });
          } else if (op.kind === 'door') {
            const o = new Ctx(B, F), hw = op.w / 2, h = op.y1;
            // jambs, head, threshold, casing
            [-1, 1].forEach((sx) => o.box(M.plank(), 0.05, h, WT, sx * (hw + 0.025), h / 2, -WT / 2));
            o.box(M.plank(), op.w + 0.1, 0.05, WT, 0, h + 0.025, -WT / 2);
            o.box(M.dark(), op.w + 0.1, 0.035, WT + 0.06, 0, 0.0175, -WT / 2);
            [-1, 1].forEach((sx) => o.boxV(M.dark(), 0.13, h + 0.13, 0.03, sx * (hw + 0.115), (h + 0.13) / 2, 0.015));
            o.box(M.dark(), op.w + 0.36, 0.14, 0.035, 0, h + 0.12, 0.017);
            // bolt keeper on the latch-side jamb
            o.box(M.metal(), 0.04, 0.07, 0.04, hw - 0.01, 1.2, -0.04 + 0.0);
            const dd = buildDoor(group, F, op.did, op.w - 0.02, h - 0.03, -0.09, 1);
            dyn.doors[op.did] = dd;
            const outP = { x: fp.x + out.x * (WT + 0.03), z: fp.z + out.z * (WT + 0.03) };
            if (op.did === 'front') {
              anchors.peephole = { pos: new THREE.Vector3(outP.x, 1.57, outP.z), yaw: camYaw(out.x, out.z), pitch: 0.05 };
              anchors.porchVisitor = { pos: new THREE.Vector3(outP.x + out.x * 0.6, PORCH_Y, outP.z + out.z * 0.6), yaw: yawTo(-out.x, -out.z) };
              anchors.frontDoorOutside = { pos: new THREE.Vector3(outP.x + out.x * 0.45, PORCH_Y, outP.z + out.z * 0.45), yaw: yawTo(-out.x, -out.z), approach: new THREE.Vector3(outP.x + 4.5, GROUND, outP.z + out.z * 8) };
            } else {
              anchors.backDoorOutside = { pos: new THREE.Vector3(outP.x + out.x * 0.55, GROUND + 0.2, outP.z + out.z * 0.55), yaw: yawTo(-out.x, -out.z), approach: new THREE.Vector3(outP.x + out.x * 7, GROUND, outP.z - 4.5) };
            }
            dyn.doors[op.did].fp = fp; dyn.doors[op.did].out = out;
          }
        });
      });
    });

    // ---- furniture & objects from the game's room objects
    const place = (id, px, py, ry) => { const p = RI[id].P(px, py); return new Ctx(builders[id], lm(p.x, 0, p.z, ry || 0)); };
    // wall mount on a room's top wall at game x px, height y, offset off the wall
    const onTop = (id, px, y, off) => { const r = RI[id], p = r.P(px, 0); return new Ctx(builders[id], lm(p.x, y, r.z0 + (off || 0), 0)); };
    const onSide = (id, side, py, y, off) => { const r = RI[id], p = r.P(0, py); return side === 'right' ? new Ctx(builders[id], lm(r.x1 - (off || 0), y, p.z, -PI / 2)) : new Ctx(builders[id], lm(r.x0 + (off || 0), y, p.z, PI / 2)); };
    const colC = (ob) => ({ x: ob.cx + ob.cw / 2, y: ob.cy + ob.ch / 2 });
    const rnd = rng(1234);
    let stove = null;
    const lamps = {};

    ROOMS.forEach((id) => {
      const r = RI[id];
      r.a.objs.forEach((ob) => {
        const sp = ob.sprite;
        if (ob.type === 'rug') {
          const big = sp === 'rug', w = (big ? 80 : 48) * K, d = (big ? 52 : 30) * K;
          const o = place(id, ob.x + (big ? 40 : 24), ob.y + (big ? 26 : 15));
          o.put(M.atlas(), gAtlasBox(big ? 'rug' : 'rugS', w, 0.012, d), 0, 0.006, 0);
        } else if (ob.type === 'stove') {
          const c = colC(ob); // (64, 59)
          const o = place(id, c.x, 52);
          const zw = -(52 - 32) * K; // wall plane in local z
          // hearth pad and heat shield
          o.box(M.stone(), 1.6, 0.06, -zw + 0.85, 0, 0.03, (zw + 0.85) / 2);
          o.box(M.dark(), 1.66, 0.04, 0.05, 0, 0.02, 0.86);
          o.box(M.stone(), 1.6, 1.55, 0.08, 0, 0.775, zw + 0.06);
          // stove body
          [[-0.34, -0.24], [0.34, -0.24], [-0.34, 0.24], [0.34, 0.24]].forEach(([x, z]) => o.box(M.iron(), 0.07, 0.14, 0.07, x, 0.13, z));
          // body shell with the firebox window opening (x +-0.24, y 0.33..0.63)
          o.box(M.iron(), 0.8, 0.64, 0.04, 0, 0.5, -0.27); [-1, 1].forEach((sx) => o.box(M.iron(), 0.04, 0.64, 0.58, sx * 0.38, 0.5, 0));
          o.box(M.iron(), 0.8, 0.15, 0.04, 0, 0.255, 0.27); o.box(M.iron(), 0.8, 0.19, 0.04, 0, 0.725, 0.27);
          [-1, 1].forEach((sx) => o.box(M.iron(), 0.16, 0.3, 0.04, sx * 0.32, 0.48, 0.27));
          o.box(M.iron(), 0.72, 0.03, 0.54, 0, 0.32, 0);
          o.box(M.iron(), 0.86, 0.05, 0.64, 0, 0.845, 0);
          o.box(M.iron(), 0.84, 0.05, 0.62, 0, 0.18, 0);
          [-0.36, 0.36].forEach((x) => { for (let i = 0; i < 5; i++) o.box(M.iron(), 0.02, 0.5, 0.02, x + Math.sign(x) * 0.012, 0.5, -0.22 + i * 0.11); });
          // door frame around the glass, hinges, handle, ash drawer, air knob
          o.box(M.iron(), 0.6, 0.06, 0.04, 0, 0.66, 0.3); o.box(M.iron(), 0.6, 0.06, 0.04, 0, 0.3, 0.3);
          o.box(M.iron(), 0.06, 0.42, 0.04, -0.27, 0.48, 0.3); o.box(M.iron(), 0.06, 0.42, 0.04, 0.27, 0.48, 0.3);
          o.cyl(M.brass(), 0.018, 0.018, 0.12, 0.33, 0.52, 0.32, 8);
          o.box(M.iron(), 0.5, 0.08, 0.02, 0, 0.225, 0.3); o.cyl(M.brass(), 0.02, 0.02, 0.03, 0, 0.225, 0.315, 8, PI / 2);
          o.cyl(M.iron(), 0.04, 0.04, 0.03, -0.18, 0.225, 0.315, 10, PI / 2);
          // kettle on top
          o.put(M.iron(), new THREE.SphereGeometry(0.11, 12, 8, 0, PI * 2, 0, PI * 0.6), 0.18, 0.87, 0.05, 0, 0, 0, 1, 0.9, 1);
          o.cyl(M.iron(), 0.11, 0.11, 0.06, 0.18, 0.9, 0.05, 12);
          o.cyl(M.iron(), 0.015, 0.025, 0.12, 0.3, 0.95, 0.05, 6, 0, -1.0);
          o.put(M.iron(), new THREE.TorusGeometry(0.08, 0.008, 6, 12, PI), 0.18, 0.98, 0.05);
          // stovepipe to the ceiling with damper and ceiling collar
          o.cyl(M.metal(), 0.085, 0.085, 0.3, 0, 1.0, -0.12, 14);
          o.put(M.metal(), new THREE.TorusGeometry(0.085, 0.012, 6, 14), 0, 1.15, -0.12, 0, PI / 2);
          o.cyl(M.metal(), 0.085, 0.085, CEIL - 1.15, 0, 1.15 + (CEIL - 1.15) / 2, -0.12, 14);
          o.cyl(M.brass(), 0.01, 0.01, 0.06, 0.1, 1.6, -0.12, 6, 0, PI / 2);
          o.box(M.metal(), 0.36, 0.015, 0.36, 0, CEIL - 0.01, -0.12);
          // fire: glass, embers, flames (dynamic)
          const base = lm(r.P(c.x, 52).x, 0, r.P(c.x, 52).z);
          const emb = R3.basic({ color: 0x000000 });
          const embers = mergeGroup((EB) => { const eo = new Ctx(EB, base); for (let i = 0; i < 4; i++) eo.put(emb, gLogX(0.045, 0.42, 8), (i - 1.5) * 0.02, 0.3 + (i % 2) * 0.06, 0.05 + (i - 1.5) * 0.06, 0.25 * (i - 1.5), 0, 0); eo.box(emb, 0.5, 0.36, 0.01, 0, 0.47, -0.2); });
          embers.children.forEach((m) => { m.castShadow = false; });
          group.add(embers);
          const flameMat = R3.glowMat({ map: flameTex(), color: 0xffffff, side: THREE.DoubleSide });
          const fg = R3.merge([0, 1, 2].map((i) => ({ geo: new THREE.PlaneGeometry(0.46, 0.34), matrix: lm(0, 0.17, 0, i * 0.7 - 0.7) })));
          const flame = new THREE.Mesh(fg, flameMat); flame.position.copy(new THREE.Vector3(0, 0.3, 0.05).applyMatrix4(base)); flame.rotation.y = 0; flame.renderOrder = 4; group.add(flame);
          const gm = R3.std({ color: 0x0a0806, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.45, emissive: 0xff7a30, emissiveIntensity: 0, depthWrite: false });
          const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.3), gm); sg.position.copy(new THREE.Vector3(0, 0.48, 0.305).applyMatrix4(base)); sg.renderOrder = 5; group.add(sg);
          const lp = new THREE.Vector3(0, 0.48, 0.62).applyMatrix4(base), gp = new THREE.Vector3(0, 0.48, 0.33).applyMatrix4(base);
          stove = { embers, emb, flame, flameMat, glass: gm, lp, gp, lv: 0 };
        } else if (ob.type === 'woodbox') {
          const c = colC(ob), o = place(id, c.x, c.y - 2);
          const w = 0.9, d = 0.5, h = 0.5;
          o.box(M.plank(), w, 0.04, d, 0, 0.06, 0);
          o.box(M.plank(), w, h, 0.03, 0, h / 2 + 0.02, d / 2 - 0.015); o.box(M.plank(), w, h, 0.03, 0, h / 2 + 0.02, -d / 2 + 0.015);
          o.box(M.plank(), 0.03, h, d, -w / 2 + 0.015, h / 2 + 0.02, 0); o.box(M.plank(), 0.03, h, d, w / 2 - 0.015, h / 2 + 0.02, 0);
          o.box(M.dark(), w + 0.02, 0.05, 0.04, 0, h + 0.02, d / 2 - 0.015); o.box(M.dark(), w + 0.02, 0.05, 0.04, 0, h + 0.02, -d / 2 + 0.015);
          [-1, 1].forEach((sx) => o.boxV(M.dark(), 0.05, h, 0.05, sx * (w / 2 - 0.025), h / 2 + 0.02, d / 2 - 0.025));
          // instanced logs (state.woodbox)
          const p = r.P(c.x, c.y - 2);
          const lg = R3.geo('cab_wb_log', () => { const g = gLogX(0.06, 0.42, 7); g.rotateY(PI / 2); g.userData.shared = true; return g; });
          const cg = R3.geo('cab_wb_cap', () => { const a = gDisc(0.058, 7); a.translate(0, 0, 0.211); const b = gDisc(0.058, 7); b.rotateY(PI); b.translate(0, 0, -0.211); const g = R3.merge([{ geo: a }, { geo: b }]); g.userData.shared = true; return g; });
          const im1 = new THREE.InstancedMesh(lg, M.log(), 15), im2 = new THREE.InstancedMesh(cg, M.logEnd(), 15);
          for (let i = 0; i < 15; i++) {
            const row = Math.floor(i / 4), col = i % 4;
            const m = lm(p.x + (col - 1.5) * 0.19 + (row % 2) * 0.05, 0.14 + row * 0.11, p.z + (rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.12, 0, rnd() * 6);
            im1.setMatrixAt(i, m); im2.setMatrixAt(i, m);
          }
          [im1, im2].forEach((m) => { m.castShadow = true; m.receiveShadow = true; m.count = 0; group.add(m); });
          dyn.woodbox = [im1, im2];
        } else if (ob.type === 'counter') {
          const c = colC(ob), o = place(id, c.x, c.y), w = 2.4, d = 0.7;
          o.box(M.plank(), w, 0.84, d - 0.05, 0, 0.42, -0.025);
          o.box(M.dark(), w, 0.08, d - 0.08, 0, 0.04, -0.06);
          for (let i = 0; i < 3; i++) { const x = (i - 1) * 0.8; o.box(M.dark(), 0.74, 0.62, 0.02, x, 0.46, d / 2 - 0.04); o.box(M.plank(), 0.6, 0.48, 0.02, x, 0.46, d / 2 - 0.03); o.cyl(M.brass(), 0.012, 0.012, 0.05, x + 0.28, 0.66, d / 2 - 0.01, 8, PI / 2); }
          o.box(M.dark(), w + 0.06, 0.06, d + 0.04, 0, 0.87, 0);
          // back ledge against the wall with jars
          const zb = -(c.y - 32) * K; // wall in local z
          o.box(M.dark(), w, 0.1, -zb - d / 2, 0, 0.95, (zb - d / 2) / 2);
          o.box(M.plank(), w, 0.9, 0.05, 0, 0.45, zb + 0.025);
          // basin, cutting board, pot, kettle
          o.put(M.vc(), withColor(new THREE.SphereGeometry(0.2, 14, 8, 0, PI * 2, PI / 2, PI / 2), 0xc8c6bc), -0.7, 1.08, 0.02, 0, PI);
          o.vc(0x2a3a52, new THREE.TorusGeometry(0.2, 0.012, 6, 16), -0.7, 1.08, 0.02, 0, PI / 2);
          o.box(M.plank(), 0.42, 0.03, 0.28, 0.05, 0.915, 0.08, 0.2);
          o.cyl(M.iron(), 0.14, 0.13, 0.18, 0.65, 0.99, 0.05, 16); o.cyl(M.iron(), 0.145, 0.145, 0.015, 0.65, 1.085, 0.05, 16);
          o.box(M.iron(), 0.18, 0.02, 0.02, 0.85, 1.05, 0.05);
          o.vc(0xd8d0b8, new THREE.CylinderGeometry(0.04, 0.035, 0.1, 10), -0.15, 0.95, -0.05); o.vc(0x7a2a20, new THREE.CylinderGeometry(0.045, 0.045, 0.12, 10), -0.05, 0.96, -0.12);
          // jars on the ledge
          for (let i = 0; i < 9; i++) { const x = -1.05 + i * 0.26 + rnd() * 0.05, hh = 0.12 + rnd() * 0.12; o.put(M.glass(), new THREE.CylinderGeometry(0.05, 0.05, hh, 10), x, 1.0 + hh / 2, zb + 0.13); o.vc([0x8a5a20, 0x5a3a1a, 0xa83a2a, 0xc8b070, 0x3a5a2a][i % 5], new THREE.CylinderGeometry(0.044, 0.044, hh * 0.7, 10), x, 1.0 + hh * 0.35, zb + 0.13); o.vc(0x5a4a3a, new THREE.CylinderGeometry(0.052, 0.052, 0.025, 10), x, 1.0 + hh + 0.01, zb + 0.13); }
          // open shelf above with tins and crockery; utensil rail
          const so = onTop(id, c.x, 1.72, 0);
          so.box(M.dark(), 2.2, 0.04, 0.3, 0, 0, 0.15);
          [-0.9, 0, 0.9].forEach((x) => so.box(M.dark(), 0.04, 0.18, 0.2, x, -0.1, 0.1, 0, 0, 0));
          for (let i = 0; i < 11; i++) { const x = -1.0 + i * 0.2; const k = i % 4; if (k === 0) so.put(M.atlas(), gAtlasCyl(0.05, 0.14), x, 0.09, 0.15); else if (k === 1) so.vc(0xe0dccc, new THREE.CylinderGeometry(0.06, 0.04, 0.08, 10), x, 0.06, 0.15); else if (k === 2) so.vc(0x6a5a3a, new THREE.CylinderGeometry(0.045, 0.045, 0.2, 10), x, 0.12, 0.15); else so.put(M.glass(), new THREE.CylinderGeometry(0.045, 0.045, 0.18, 10), x, 0.11, 0.15); }
          const ro = onTop(id, c.x, 1.35, 0);
          ro.cyl(M.iron(), 0.008, 0.008, 1.2, 0.3, 0, 0.06, 6, 0, PI / 2);
          for (let i = 0; i < 5; i++) { const x = -0.2 + i * 0.22; ro.box(M.iron(), 0.012, 0.25, 0.012, x, -0.14, 0.06); if (i % 2) ro.cyl(M.iron(), 0.05, 0.05, 0.01, x, -0.3, 0.06, 10, PI / 2); else ro.box(M.plank(), 0.04, 0.1, 0.012, x, -0.3, 0.06); }
        } else if (ob.type === 'table') {
          const c = colC(ob), o = place(id, c.x, c.y - 2), w = 1.9, d = 0.92, h = 0.76;
          [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => o.boxV(M.dark(), 0.075, h - 0.05, 0.075, sx * (w / 2 - 0.12), (h - 0.05) / 2, sz * (d / 2 - 0.1)));
          o.box(M.dark(), w - 0.3, 0.1, 0.03, 0, h - 0.1, d / 2 - 0.1); o.box(M.dark(), w - 0.3, 0.1, 0.03, 0, h - 0.1, -d / 2 + 0.1);
          o.box(M.dark(), 0.03, 0.1, d - 0.25, -w / 2 + 0.12, h - 0.1, 0); o.box(M.dark(), 0.03, 0.1, d - 0.25, w / 2 - 0.12, h - 0.1, 0);
          o.box(M.plank(), w, 0.05, d, 0, h - 0.025, 0);
          o.box(M.dark(), 1.4, 0.06, 0.06, 0, 0.18, 0);
          // tableware: plate, mug, papers, knife
          o.vc(0xd8d2c0, new THREE.CylinderGeometry(0.12, 0.09, 0.02, 16), -0.55, h + 0.01, 0.12);
          o.vc(0x3a4a5a, new THREE.CylinderGeometry(0.045, 0.04, 0.1, 12), -0.25, h + 0.05, -0.1);
          o.put(M.atlas(), gAtlasBox('papers', 0.36, 0.006, 0.26), 0.05, h + 0.003, 0.05, 0.25);
          o.box(M.metal(), 0.2, 0.006, 0.02, -0.4, h + 0.003, 0.2, 0.4);
          const p = r.P(183, 104); lamps[id] = { p: { x: p.x, z: p.z }, y: h, type: 'table' };
        } else if (ob.type === 'deco' && sp === 'chair') {
          const c = colC(ob);
          const facing = id === 'room_office' ? PI : 0;
          FURN.chair(place(id, c.x, c.y, facing + (rnd() - 0.5) * 0.15));
        } else if (sp === 'armchair') {
          const c = colC(ob), o = place(id, c.x, c.y, PI * 0.85), G2 = M.green();
          o.box(G2, 0.7, 0.18, 0.62, 0, 0.36, 0.04);
          o.box(M.dark(), 0.86, 0.1, 0.8, 0, 0.17, 0);
          [-1, 1].forEach((sx) => { o.box(G2, 0.15, 0.36, 0.78, sx * 0.39, 0.45, 0); o.cyl(G2, 0.09, 0.09, 0.78, sx * 0.39, 0.64, 0, 10, PI / 2); });
          o.box(G2, 0.74, 0.62, 0.17, 0, 0.72, -0.33, 0, -0.12); o.cyl(G2, 0.09, 0.09, 0.74, 0, 1.03, -0.36, 10, 0, PI / 2);
          o.box(M.linen(), 0.6, 0.1, 0.5, 0, 0.5, 0.06);
          [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => o.box(M.dark(), 0.06, 0.12, 0.06, sx * 0.38, 0.06, sz * 0.34));
          o.box(M.wool(), 0.5, 0.06, 0.5, -0.05, 0.92, -0.38, 0.1, -0.5);
        } else if (ob.type === 'lamp') {
          if (ob.style === 'table') return; // placed on the table above
          const p = r.P(ob.x + 5, 0), y = 1.75;
          const o = new Ctx(builders[id], lm(p.x, y, r.z0, 0));
          const gc = FURN.lampWall(o);
          lamps[id] = { p: { x: p.x, z: r.z0 + gc.z }, y: y + gc.y - 0.04, type: 'wall' };
        } else if (sp === 'coatrack') {
          const c = colC(ob), o = place(id, c.x, c.y, 0.3);
          o.cyl(M.dark(), 0.025, 0.03, 1.8, 0, 0.9, 0, 8);
          [0, 1, 2, 3].forEach((i) => { const a = i * PI / 2; o.box(M.dark(), 0.34, 0.04, 0.05, Math.sin(a) * 0.15, 0.03, Math.cos(a) * 0.15, a + PI / 2); o.box(M.dark(), 0.018, 0.018, 0.16, Math.sin(a) * 0.07, 1.68, Math.cos(a) * 0.07, a, -0.7); });
          o.put(M.blue(), new THREE.CylinderGeometry(0.1, 0.24, 0.95, 12, 1, false), 0.1, 1.2, 0.08, 0, 0.12, 0.08);
          o.put(M.red(), new THREE.CylinderGeometry(0.05, 0.08, 0.6, 8), -0.12, 1.35, -0.06, 0, -0.1, -0.1);
          o.put(M.canvas(), new THREE.SphereGeometry(0.11, 10, 6, 0, PI * 2, 0, PI / 2), 0, 1.82, 0, 0, 0, 0, 1, 0.6, 1);
          o.cyl(M.canvas(), 0.19, 0.19, 0.01, 0, 1.82, 0, 14);
        } else if (sp === 'boots') {
          const o = place(id, ob.x + 7, ob.y + 5, -0.4);
          [-0.08, 0.08].forEach((x, i) => { const bo = o.sub(x, 0, 0, i * 0.15); bo.box(M.leather(), 0.1, 0.24, 0.12, 0, 0.12, -0.03); bo.box(M.leather(), 0.1, 0.09, 0.28, 0, 0.045, 0.04); bo.box(M.dark(), 0.11, 0.02, 0.3, 0, 0.01, 0.04); });
        } else if (sp === 'logstack') {
          const c = colC(ob), o = place(id, c.x, c.y);
          FURN.splitLogs(o.sub(0, 0, 0, PI / 2), 12, 0.36, 0.085, rnd);
        } else if (sp === 'washstand') {
          const c = colC(ob), o = place(id, c.x + 2, c.y, -PI / 2);
          [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => o.boxV(M.dark(), 0.045, 0.8, 0.045, sx * 0.38, 0.4, sz * 0.18));
          o.box(M.plank(), 0.84, 0.04, 0.44, 0, 0.8, 0); o.box(M.plank(), 0.76, 0.03, 0.36, 0, 0.25, 0);
          o.box(M.plank(), 0.84, 0.18, 0.03, 0, 0.9, -0.2);
          o.put(M.vc(), withColor(new THREE.SphereGeometry(0.17, 14, 8, 0, PI * 2, PI / 2, PI / 2), 0xd8d4c8), 0.05, 0.92, 0.02, 0, PI);
          o.put(M.vc(), withColor(new THREE.LatheGeometry([[0.0, 0], [0.07, 0.01], [0.08, 0.1], [0.05, 0.2], [0.045, 0.24], [0.06, 0.27]].map(([x, y]) => new THREE.Vector2(x, y)), 12), 0xd8d4c8), -0.27, 0.82, 0.05);
          o.box(M.linen(), 0.03, 0.4, 0.2, 0.43, 0.6, 0.05);
          o.vc(0xc8b890, new THREE.BoxGeometry(0.08, 0.04, 0.05), 0.3, 0.84, 0.1);
          // mirror on the wall above
          const mo = onSide(id, 'right', c.y, 1.55, 0.01);
          mo.box(M.dark(), 0.5, 0.62, 0.03, 0, 0, 0.015);
          mo.put(R3.mat('cab_mirror', () => R3.std({ color: 0x8a9098, roughness: 0.05, metalness: 1 })), new THREE.PlaneGeometry(0.42, 0.54), 0, 0, 0.032);
        } else if (sp === 'bench') {
          const c = colC(ob), o = place(id, c.x, c.y);
          o.box(M.plank(), 1.8, 0.06, 0.36, 0, 0.44, 0);
          [-0.75, 0.75].forEach((x) => { o.box(M.dark(), 0.06, 0.41, 0.3, x, 0.205, 0); });
          o.box(M.dark(), 1.4, 0.05, 0.04, 0, 0.18, 0);
          o.put(M.wool(), gBox(0.55, 0.08, 0.34), -0.45, 0.51, 0, 0.05);
          o.put(M.leather(), gBox(0.32, 0.22, 0.16), 0.5, 0.58, 0, -0.3);
        } else if (sp === 'barrel') {
          const c = colC(ob), rr = 0.26;
          const cx = Math.min(c.x, r.x1 === undefined ? c.x : c.x);
          const p = r.P(cx, c.y); const px = Math.min(p.x, r.x1 - rr - 0.03), pz = Math.min(p.z, r.z1 - rr - 0.03);
          const o = new Ctx(builders[id], lm(px, 0, pz, rnd() * 6));
          FURN.barrel(o, 0.84, rr);
          if (id === 'room_main') o.box(M.plank(), 0.5, 0.03, 0.5, 0, 0.855, 0);
        } else if (sp === 'antlers') {
          const o = onTop(id, ob.x + 12, 2.15, 0);
          o.put(M.dark(), new THREE.CylinderGeometry(0.13, 0.13, 0.03, 7), 0, 0, 0.015, 0, PI / 2);
          o.vc(0xd8ccb0, new THREE.SphereGeometry(0.07, 8, 6), 0, 0.02, 0.07, 0, 0, 0, 1, 0.8, 1.2);
          [-1, 1].forEach((sx) => { let x = sx * 0.05, y = 0.04, z = 0.08; for (let i = 0; i < 5; i++) { const nx = x + sx * 0.08, ny = y + 0.06 + i * 0.01, nz = z + 0.03; o.vc(0xd8ccb0, new THREE.CylinderGeometry(0.012 - i * 0.0015, 0.016 - i * 0.0015, 0.12, 6), (x + nx) / 2, (y + ny) / 2, (z + nz) / 2, 0, 0.3, -sx * 0.9); if (i % 2) o.vc(0xd8ccb0, new THREE.CylinderGeometry(0.006, 0.01, 0.1, 5), nx, ny + 0.05, nz, 0, 0.2, 0); x = nx; y = ny; z = nz; } });
        } else if (sp === 'rifleRack') {
          const o = onTop(id, ob.x + 15, 1.5, 0);
          [-0.5, 0.5].forEach((x) => { o.box(M.dark(), 0.06, 0.12, 0.1, x, 0, 0.05); o.box(M.dark(), 0.06, 0.12, 0.1, x, 0.3, 0.05); });
          const rf = o.sub(0, 0.04, 0.09);
          rf.box(M.dark(), 0.45, 0.07, 0.04, -0.35, 0, 0, 0, 0, -0.05); rf.box(M.dark(), 0.3, 0.05, 0.035, -0.04, 0.02, 0); rf.cyl(M.metal(), 0.011, 0.011, 0.75, 0.45, 0.04, 0, 8, 0, PI / 2); rf.box(M.metal(), 0.14, 0.04, 0.03, 0.02, 0.05, 0);
          o.box(M.leather(), 0.6, 0.012, 0.01, 0, -0.05, 0.12, 0, 0, 0.05);
        } else if (sp === 'clock') {
          const o = onTop(id, ob.x + 6, 1.95, 0);
          o.box(M.dark(), 0.34, 0.7, 0.14, 0, 0, 0.07); o.put(M.dark(), new THREE.CylinderGeometry(0.2, 0.2, 0.14, 4, 1), 0, 0.42, 0.07, PI / 4, PI / 2, 0, 1, 1, 0.5);
          o.put(M.atlasGloss(), gAtlas('clock', 0.26, 0.26), 0, 0.2, 0.141);
          o.put(M.glass(), new THREE.PlaneGeometry(0.24, 0.3), 0, -0.17, 0.142);
          const cp = { x: RI[id].P(ob.x + 6, 0).x, z: RI[id].z0 };
          dyn.clock = { x: cp.x, y: 1.95, z: cp.z };
        } else if (ob.type === 'bed') {
          const c = colC(ob), o = place(id, c.x, c.y), w = 1.66, L = 2.06;
          [[-1, -1, 1.05], [1, -1, 1.05], [-1, 1, 0.7], [1, 1, 0.7]].forEach(([sx, sz, hh]) => o.cyl(M.log(), 0.06, 0.065, hh, sx * w / 2, hh / 2, sz * L / 2, 10));
          o.put(M.log(), gLogX(0.05, w, 10), 0, 0.92, -L / 2); o.put(M.log(), gLogX(0.05, w, 10), 0, 0.62, -L / 2);
          for (let i = 0; i < 7; i++) o.boxV(M.plank(), 0.18, 0.3, 0.03, -w / 2 + 0.2 + i * 0.21, 0.77, -L / 2);
          o.put(M.log(), gLogX(0.05, w, 10), 0, 0.6, L / 2); o.put(M.log(), gLogX(0.045, w, 10), 0, 0.36, L / 2);
          o.put(M.log(), gLogX(0.05, L, 10), -w / 2, 0.3, 0, PI / 2); o.put(M.log(), gLogX(0.05, L, 10), w / 2, 0.3, 0, PI / 2);
          o.box(M.linen(), w - 0.08, 0.2, L - 0.1, 0, 0.42, 0);
          // quilt top + hanging sides
          o.put(M.atlas(), gAtlasBox('quilt', w + 0.06, 0.06, L * 0.72), 0, 0.535, L * 0.12);
          [-1, 1].forEach((sx) => o.put(M.atlas(), gAtlas('quilt', L * 0.72, 0.28, true), sx * (w / 2 + 0.03), 0.42, L * 0.12, sx * PI / 2));
          o.put(M.atlas(), gAtlas('quilt', w + 0.06, 0.24), 0, 0.43, L * 0.12 + L * 0.36 + 0.001);
          [-0.38, 0.38].forEach((x) => { o.put(M.linen(), gSphere(0.3, 12, 8), x, 0.58, -L / 2 + 0.3, 0, 0, 0, 1, 0.22, 0.55); });
          o.put(M.wool(), gBox(w * 0.7, 0.05, 0.4), 0.1, 0.57, L / 2 - 0.35, 0.08);
        } else if (sp === 'nightstand') {
          const c = colC(ob), o = place(id, c.x, c.y);
          o.box(M.plank(), 0.55, 0.55, 0.42, 0, 0.3, 0); o.box(M.dark(), 0.6, 0.04, 0.46, 0, 0.6, 0);
          o.box(M.dark(), 0.48, 0.16, 0.02, 0, 0.44, 0.215); o.cyl(M.brass(), 0.015, 0.015, 0.03, 0, 0.44, 0.23, 8, PI / 2);
          [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => o.box(M.dark(), 0.05, 0.05, 0.05, sx * 0.24, 0.025, sz * 0.18));
          o.vc(0xd8d0b0, new THREE.CylinderGeometry(0.025, 0.025, 0.14, 10), -0.12, 0.69, 0.02); o.cyl(M.brass(), 0.06, 0.05, 0.015, -0.12, 0.625, 0.02, 12);
          o.put(M.atlas(), gAtlasBox('ledger', 0.16, 0.035, 0.22), 0.1, 0.64, 0.0, 0.3);
        } else if (ob.type === 'wardrobe') {
          const c = colC(ob), o = place(id, c.x, c.y), w = 1.4, d = 0.58, h = 2.0;
          o.box(M.plank(), w, h - 0.1, d, 0, (h - 0.1) / 2 + 0.08, 0);
          o.box(M.dark(), w + 0.08, 0.08, d + 0.06, 0, h + 0.02, 0); o.box(M.dark(), w + 0.04, 0.1, d + 0.02, 0, 0.05, 0);
          [-1, 1].forEach((sx) => { o.box(M.dark(), w / 2 - 0.06, h - 0.32, 0.02, sx * w / 4, h / 2 + 0.03, d / 2 + 0.008); o.box(M.plank(), w / 2 - 0.18, h - 0.5, 0.02, sx * w / 4, h / 2 + 0.03, d / 2 + 0.016); o.cyl(M.brass(), 0.012, 0.012, 0.12, sx * 0.05, 1.05, d / 2 + 0.035, 8); });
        } else if (ob.type === 'belongings') {
          const c = colC(ob), o = place(id, c.x, c.y), w = 1.2, d = 0.52;
          o.box(M.blue(), w, 0.42, d, 0, 0.23, 0);
          o.put(M.blue(), gCyl(d / 2, d / 2, w, 14, false, PI), 0, 0.44, 0, 0, 0, PI / 2, 1, 1, 0.4);
          [-0.4, 0.4].forEach((x) => { o.box(M.leather(), 0.06, 0.5, d + 0.01, x, 0.25, 0); });
          [0.06, 0.42].forEach((y) => o.box(M.brass(), w + 0.01, 0.025, d + 0.01, 0, y, 0));
          o.box(M.brass(), 0.08, 0.08, 0.02, 0, 0.4, d / 2 + 0.01);
          o.box(M.leather(), 0.14, 0.04, 0.04, -w / 2 - 0.01, 0.3, 0, PI / 2);
        } else if (sp === 'guitar') {
          const c = colC(ob), p = r.P(c.x, c.y);
          const o = new Ctx(builders[id], lm(r.x1 - 0.14, 0, p.z, -PI / 2));
          const go = o.sub(0, 0, 0.0); const tilt = -0.28;
          const gm = R3.mat('cab_guitar', () => Tx().mat('wood_plank', { color: 0x8a5a2a, roughness: 0.35 }));
          go.put(gm, new THREE.CylinderGeometry(0.19, 0.19, 0.1, 18), 0, 0.22, -0.03, 0, PI / 2 + tilt);
          go.put(gm, new THREE.CylinderGeometry(0.15, 0.15, 0.1, 18), 0, 0.5, -0.11, 0, PI / 2 + tilt);
          go.put(M.vc(), withColor(new THREE.CircleGeometry(0.05, 14), 0x0a0806), 0, 0.42, -0.02, 0, tilt);
          go.box(M.dark(), 0.055, 0.6, 0.03, 0, 0.92, -0.25, 0, tilt);
          go.box(M.dark(), 0.075, 0.17, 0.025, 0, 1.28, -0.36, 0, tilt);
        } else if (ob.type === 'photo') {
          const o = onTop(id, ob.x + 6 + 8, 1.42, 0);
          o.box(M.dark(), 0.38, 0.3, 0.025, 0, 0, 0.012);
          o.put(M.atlasGloss(), gAtlas('photo', 0.32, 0.24), 0, 0, 0.026);
          o.box(M.dark(), 0.004, 0.18, 0.004, 0, 0.22, 0.005, 0, 0, 0.6); o.box(M.dark(), 0.004, 0.18, 0.004, 0, 0.22, 0.005, 0, 0, -0.6);
        } else if (ob.type === 'wallmap') {
          const o = onTop(id, ob.x + 18, 1.68, 0);
          o.box(M.dark(), 1.72, 1.06, 0.03, 0, 0, 0.015);
          o.put(M.atlas(), gAtlas('map', 1.62, 0.96), 0, 0, 0.032);
          const co = onTop(id, ob.x + 52, 1.55, 0); co.put(M.atlas(), gAtlas('cal', 0.3, 0.3), 0, 0, 0.012);
        } else if (ob.type === 'desk') {
          const c = colC(ob), o = place(id, c.x, c.y), w = 2.4, d = 0.82, h = 0.76;
          [-1, 1].forEach((sx) => { o.box(M.plank(), 0.5, h - 0.05, d - 0.06, sx * (w / 2 - 0.27), (h - 0.05) / 2, 0); for (let i = 0; i < 3; i++) { o.box(M.dark(), 0.44, 0.19, 0.02, sx * (w / 2 - 0.27), 0.14 + i * 0.22, d / 2 - 0.02); o.cyl(M.brass(), 0.01, 0.01, 0.08, sx * (w / 2 - 0.27), 0.17 + i * 0.22, d / 2 - 0.005, 6, 0, PI / 2); } });
          o.box(M.plank(), w - 1.04, 0.4, 0.03, 0, h - 0.25, -d / 2 + 0.05);
          o.box(M.dark(), w, 0.05, d, 0, h - 0.025, 0);
          o.put(M.atlas(), gAtlasBox('papers', 0.5, 0.008, 0.34), -0.55, h + 0.004, 0.08, -0.12);
          o.put(M.atlas(), gAtlasBox('papers', 0.3, 0.012, 0.4), -0.15, h + 0.006, -0.05, 0.35);
          o.put(M.atlas(), gAtlasBox('ledger', 0.28, 0.05, 0.36), 0.35, h + 0.025, 0.02, 0.05);
          o.put(M.atlas(), gAtlasBox('mapS', 0.5, 0.006, 0.3), 0.75, h + 0.003, -0.15, 0.2);
          o.vc(0x6a7a8a, new THREE.CylinderGeometry(0.04, 0.035, 0.09, 12), 0.85, h + 0.045, 0.2);
          o.box(M.metal(), 0.14, 0.008, 0.012, 0.6, h + 0.005, 0.18, 0.6);
          o.cyl(M.metal(), 0.06, 0.08, 0.02, -0.95, h + 0.01, -0.2, 12); o.box(M.metal(), 0.02, 0.2, 0.02, -0.95, h + 0.11, -0.2); o.vc(0x2a5a3a, new THREE.CylinderGeometry(0.03, 0.09, 0.08, 12, 1, true), -0.95, h + 0.23, -0.13, 0, 0.6);
          dyn.deskNote = mergeGroup((NB) => { const no = new Ctx(NB, mul(lm(r.P(c.x, c.y).x, 0, r.P(c.x, c.y).z), lm(-0.15, h + 0.016, 0.22, 0.1))); no.put(R3.mat('cab_note', () => R3.basic({ color: 0xffe08a })), new THREE.PlaneGeometry(0.1, 0.1), 0, 0, 0, 0, -PI / 2); });
          group.add(dyn.deskNote);
        } else if (ob.type === 'radio') {
          const c = colC(ob), o = place(id, c.x, c.y), w = 1.5, d = 0.6;
          [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => o.boxV(M.dark(), 0.05, 0.72, 0.05, sx * (w / 2 - 0.05), 0.36, sz * (d / 2 - 0.05)));
          o.box(M.plank(), w, 0.04, d, 0, 0.74, 0);
          o.box(M.paint(), 0.66, 0.36, 0.34, -0.2, 0.94, -0.05);
          o.put(M.atlas(), gAtlas('radio', 0.64, 0.33), -0.2, 0.94, 0.121);
          o.box(M.paint(), 0.3, 0.18, 0.28, 0.4, 0.85, -0.05);
          [0.33, 0.47].forEach((x) => o.cyl(M.metal(), 0.02, 0.02, 0.02, x, 0.88, 0.1, 8, PI / 2));
          o.cyl(M.metal(), 0.025, 0.035, 0.02, -0.55, 0.77, 0.15, 10); o.cyl(M.metal(), 0.008, 0.008, 0.16, -0.55, 0.85, 0.15, 6); o.vc(0x222222, new THREE.CylinderGeometry(0.03, 0.03, 0.07, 10), -0.55, 0.95, 0.17, 0, PI / 2 - 0.3);
          o.put(M.vc(), withColor(new THREE.TorusGeometry(0.08, 0.012, 6, 14, PI), 0x1a1a1a), 0.25, 0.79, 0.15, 0.3, -PI / 2);
          o.cyl(M.metal(), 0.004, 0.004, CEIL - 1.15, -0.45, 1.12 + (CEIL - 1.15) / 2, -0.24, 4);
          const lp = new THREE.Vector3(0.05, 1.07, 0.123).applyMatrix4(lm(r.P(c.x, c.y).x, 0, r.P(c.x, c.y).z));
          const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), R3.basic({ color: 0x30ff40 })); led.position.copy(lp); group.add(led);
          dyn.led = led;
        } else if (sp === 'cabinet') {
          const c = colC(ob), p = r.P(c.x, c.y), w = 0.78, px = Math.min(p.x, r.x1 - w / 2 - 0.02);
          const o = new Ctx(builders[id], lm(px, 0, p.z, 0));
          o.box(M.paint(), w, 1.32, 0.6, 0, 0.66, 0);
          for (let i = 0; i < 4; i++) { o.box(M.paint(), w - 0.06, 0.29, 0.02, 0, 0.2 + i * 0.31, 0.305); o.box(M.metal(), 0.16, 0.025, 0.03, 0, 0.28 + i * 0.31, 0.325); o.vc(0xe8e0c8, new THREE.BoxGeometry(0.08, 0.04, 0.005), 0, 0.32 + i * 0.31, 0.317); }
          o.put(M.atlas(), gAtlasBox('papers', 0.32, 0.03, 0.24), -0.1, 1.335, 0, 0.3);
        } else if (sp === 'bookshelf') {
          const c = colC(ob), w = 1.3, d = 0.4, h = 1.9;
          const p = r.P(c.x, c.y), px = Math.min(p.x, r.x1 - w / 2 - 0.01);
          const o = new Ctx(builders[id], lm(px, 0, p.z, 0));
          [-1, 1].forEach((sx) => o.box(M.dark(), 0.04, h, d, sx * (w / 2 - 0.02), h / 2, 0));
          o.box(M.dark(), w, 0.03, d, 0, h, 0); o.box(M.plank(), w, h, 0.02, 0, h / 2, -d / 2 + 0.01);
          for (let s = 0; s < 5; s++) {
            const y = 0.05 + s * 0.43; o.box(M.dark(), w - 0.08, 0.03, d - 0.02, 0, y, 0);
            if (s === 4) continue;
            let x = -w / 2 + 0.06;
            while (x < w / 2 - 0.12) { const bw = 0.03 + rnd() * 0.04, bh = 0.24 + rnd() * 0.1; if (rnd() < 0.07) { x += 0.08; continue; } const lean = x > w / 2 - 0.25 && rnd() < 0.5 ? 0.25 : 0; o.put(M.atlas(), gAtlasBox('books', bw, bh, 0.24 - rnd() * 0.05), x + bw / 2, y + 0.015 + bh / 2, 0.02, 0, 0, lean); x += bw + 0.003; }
          }
        } else if (ob.type === 'chest') {
          const c = colC(ob), o = place(id, c.x, c.y), w = 1.5, d = 0.6, h = 0.62;
          o.box(M.plank(), w, h - 0.12, d, 0, (h - 0.12) / 2 + 0.03, 0);
          o.put(M.plank(), gCyl(d / 2, d / 2, w, 14, false, PI), 0, h - 0.09, 0, 0, 0, PI / 2, 1, 1, 0.38);
          [-0.6, -0.2, 0.2, 0.6].forEach((x) => { o.box(M.iron(), 0.05, h - 0.1, d + 0.012, x, (h - 0.1) / 2 + 0.03, 0); o.put(M.iron(), gCyl(d / 2 + 0.006, d / 2 + 0.006, 0.05, 14, true, PI), x, h - 0.09, 0, 0, 0, PI / 2, 1, 1, 0.38); });
          o.box(M.brass(), 0.1, 0.12, 0.02, 0, h - 0.12, d / 2 + 0.01);
          [-1, 1].forEach((sx) => o.put(M.iron(), new THREE.TorusGeometry(0.05, 0.008, 6, 10, PI), sx * (w / 2 + 0.01), h * 0.6, 0, sx * PI / 2, 0, PI));
        } else if (sp === 'shelves') {
          const o = onTop(id, ob.x + 24, 0, 0), w = 2.3, d = 0.38;
          [-1, 0, 1].forEach((sx) => o.boxV(M.dark(), 0.05, 2.1, 0.05, sx * (w / 2 - 0.03), 1.05, d - 0.04));
          [0.35, 0.9, 1.45, 2.0].forEach((y, si) => {
            o.box(M.plank(), w, 0.035, d, 0, y, d / 2);
            let x = -w / 2 + 0.1;
            while (x < w / 2 - 0.12) {
              const k = Math.floor(rnd() * 6);
              if (k === 0) { o.put(M.glass(), new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10), x, y + 0.12, d / 2); o.vc([0xa83a2a, 0xc8a040, 0x5a7a3a][si % 3], new THREE.CylinderGeometry(0.055, 0.055, 0.14, 10), x, y + 0.09, d / 2); x += 0.15; }
              else if (k === 1 || k === 2) { o.put(M.atlas(), gAtlasCyl(0.055, 0.13), x, y + 0.085, d / 2 + (rnd() - 0.5) * 0.1); x += 0.13; }
              else if (k === 3) { o.put(M.canvas(), gSphere(0.15, 10, 7), x + 0.08, y + 0.11, d / 2, rnd(), 0, 0, 1, 0.75, 0.8); x += 0.32; }
              else if (k === 4) { o.vc(0x4a5a3a, new THREE.BoxGeometry(0.28, 0.18, 0.24), x + 0.12, y + 0.105, d / 2); x += 0.32; }
              else x += 0.12;
            }
          });
        } else if (sp === 'toolwall') {
          const o = onTop(id, ob.x + 20, 0, 0);
          o.box(M.plank(), 2.0, 0.9, 0.025, 0, 1.45, 0.013);
          o.box(M.dark(), 2.06, 0.06, 0.04, 0, 1.92, 0.02); o.box(M.dark(), 2.06, 0.06, 0.04, 0, 0.98, 0.02);
          // saw, axe, hammers, coil of rope, lantern hook
          o.box(M.metal(), 0.6, 0.16, 0.004, -0.6, 1.6, 0.04, 0, 0, 0.02); o.box(M.plank(), 0.14, 0.12, 0.03, -0.95, 1.62, 0.045);
          o.box(M.plank(), 0.04, 0.7, 0.03, -0.1, 1.45, 0.05, 0, 0, 0.08); o.box(M.metal(), 0.2, 0.12, 0.012, -0.05, 1.77, 0.05, 0, 0, 0.08);
          [0.25, 0.4].forEach((x, i) => { o.box(M.plank(), 0.03, 0.32, 0.025, x, 1.45 - i * 0.04, 0.045); o.box(M.metal(), 0.12, 0.04, 0.04, x, 1.6 - i * 0.04, 0.05); });
          o.put(M.vc(), withColor(new THREE.TorusGeometry(0.15, 0.03, 6, 16), 0xa89058), 0.75, 1.5, 0.06);
          o.put(M.vc(), withColor(new THREE.TorusGeometry(0.11, 0.028, 6, 16), 0xa89058), 0.75, 1.48, 0.09);
          o.cyl(M.iron(), 0.012, 0.012, 0.08, 0.75, 1.72, 0.05, 6, PI / 2);
        } else if (ob.type === 'drum') {
          const c = colC(ob), o = place(id, c.x, c.y - 2), rr = 0.29, h = 0.88;
          o.put(M.drum(), gCyl(rr, rr, h, 18), 0, h / 2, 0);
          [0.02, 0.3, 0.58, 0.86].forEach((y) => o.put(M.drum(), new THREE.TorusGeometry(rr, 0.012, 5, 18), 0, y, 0, 0, PI / 2));
          o.put(M.drum(), new THREE.CircleGeometry(rr, 18), 0, h + 0.001, 0, 0, -PI / 2);
          o.cyl(M.metal(), 0.035, 0.035, 0.03, 0.12, h + 0.015, 0.08, 10); o.cyl(M.brass(), 0.012, 0.012, 0.25, -0.1, h + 0.12, -0.05, 6, 0.4);
          // sight glass
          o.box(M.metal(), 0.06, 0.62, 0.02, 0, 0.44, rr + 0.012);
          const p = r.P(c.x, c.y - 2);
          const lvl = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.56, 0.01), R3.std({ color: 0xa87a20, emissive: 0x2a1a04, roughness: 0.3 }));
          lvl.geometry.translate(0, 0.28, 0); lvl.position.set(p.x, 0.16, p.z + rr + 0.025); group.add(lvl); dyn.oil = lvl;
        } else if (ob.type === 'sawhorse') {
          const c = colC(ob), o = place(id, c.x, c.y - 2);
          o.box(M.plank(), 1.6, 0.1, 0.14, 0, 0.68, 0);
          [-0.62, 0.62].forEach((x) => [-1, 1].forEach((sz) => o.boxV(M.dark(), 0.07, 0.74, 0.06, x, 0.34, sz * 0.13, 0, sz * 0.32)));
          o.box(M.weath(), 1.4, 0.04, 0.25, 0.1, 0.75, 0.0, 0.15);
          o.box(M.metal(), 0.55, 0.12, 0.003, -0.2, 0.83, 0.12, 0.3, 0, 0); o.box(M.plank(), 0.13, 0.1, 0.03, -0.53, 0.83, 0.03, 0.3);
          for (let i = 0; i < 18; i++) o.box(M.plank(), 0.02 + rnd() * 0.03, 0.006, 0.03 + rnd() * 0.05, (rnd() - 0.5) * 1.2, 0.003, (rnd() - 0.5) * 0.8, rnd() * 3);
        } else if (sp === 'sacks') {
          const c = colC(ob), o = place(id, c.x, c.y);
          [[-0.38, 0, 0], [0.05, 0, 0.05], [0.4, 0, -0.05], [-0.15, 0.36, 0.0]].forEach(([x, y, z], i) => { o.put(M.canvas(), gSphere(0.26, 12, 8), x, y + 0.24, z, rnd(), 0, 0, 0.9, 1.0 - i * 0.05, 0.7); o.put(M.canvas(), new THREE.CylinderGeometry(0.04, 0.09, 0.12, 8), x, y + 0.5, z); });
        }
      });
    });
    // table lamp (main) sits on the table
    Object.keys(lamps).forEach((id) => {
      const L = lamps[id];
      let gc;
      if (L.type === 'table') { const o = new Ctx(builders[id], lm(L.p.x, L.y, L.p.z)); FURN.lampTable(o); gc = { x: L.p.x, y: L.y + 0.16, z: L.p.z }; }
      else gc = { x: L.p.x, y: L.y, z: L.p.z };
      const gm = R3.std({ color: 0xffd9a0, emissive: 0xffa040, emissiveIntensity: 0, transparent: true, opacity: 0.7, roughness: 0.2 });
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), gm); fl.scale.set(1, 2.2, 1); fl.position.set(gc.x, gc.y - 0.02, gc.z); group.add(fl);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 8), R3.std({ color: 0xfff0d0, emissive: 0xffb060, emissiveIntensity: 0, transparent: true, opacity: 0.22, roughness: 0.1, depthWrite: false }));
      halo.scale.set(1, 1.3, 1); halo.position.set(gc.x, gc.y - 0.02, gc.z); group.add(halo);
      dyn.lamps.push({ room: id, pos: gc, flame: fl, halo, gm });
    });
    // clock hands & pendulum
    if (dyn.clock) {
      const c = dyn.clock, hm = R3.basic({ color: 0x0c0a08 });
      const mk = (len, wid) => { const g = new THREE.BoxGeometry(wid, len, 0.004); g.translate(0, len / 2, 0); const m = new THREE.Mesh(g, hm); m.position.set(c.x, c.y + 0.2, c.z + 0.145); group.add(m); return m; };
      c.hh = mk(0.065, 0.012); c.mh = mk(0.1, 0.008);
      const pg = new THREE.Group(); pg.position.set(c.x, c.y - 0.04, c.z + 0.07); group.add(pg);
      pg.add(mergeGroup((PB) => { const po = new Ctx(PB, new THREE.Matrix4()); po.box(M.brass(), 0.008, 0.22, 0.004, 0, -0.11, 0); po.cyl(M.brass(), 0.04, 0.04, 0.008, 0, -0.24, 0, 14, PI / 2); }));
      c.pend = pg;
    }

    // ---- fake exterior: shell around the rooms, porch, back stoop, ground, woodpile, pines in the fog
    const shell = [];
    ROOMS.forEach((id) => { const r = RI[id]; shell.push([r.x0 - WT, r.z0 - WT, r.x1 + WT, r.z1 + WT]); });
    passages.forEach((p) => {
      const ra = RI.room_main, rb = RI[p.to];
      const n0 = Math.min(p.a, p.b), n1 = Math.max(p.a, p.b);
      if (p.side === 'top') shell.push([Math.max(ra.x0, rb.x0) - WT, n0, Math.min(ra.x1, rb.x1) + WT, n1]);
      else shell.push([n0, Math.max(ra.z0, rb.z0) - WT, n1, Math.min(ra.z1, rb.z1) + WT]);
    });
    let bx0 = 1e9, bz0 = 1e9, bx1 = -1e9, bz1 = -1e9;
    shell.forEach(([a, b, c, d]) => { bx0 = Math.min(bx0, a); bz0 = Math.min(bz0, b); bx1 = Math.max(bx1, c); bz1 = Math.max(bz1, d); });
    const RES = 0.05, gw = Math.round((bx1 - bx0) / RES) + 2, gh = Math.round((bz1 - bz0) / RES) + 2;
    const cell = new Uint8Array(gw * gh);
    shell.forEach(([a, b, c, d]) => { const i0 = Math.round((a - bx0) / RES) + 1, i1 = Math.round((c - bx0) / RES) + 1, j0 = Math.round((b - bz0) / RES) + 1, j1 = Math.round((d - bz0) / RES) + 1; for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) cell[j * gw + i] = 1; });
    const inside = (i, j) => (i >= 0 && j >= 0 && i < gw && j < gh ? cell[j * gw + i] : 0);
    const X = (i) => bx0 + (i - 1) * RES, Z = (j) => bz0 + (j - 1) * RES;
    // outer openings (window / door outer faces) per plane
    const outerOps = [];
    ROOMS.forEach((id) => ['top', 'bottom', 'left', 'right'].forEach((side) => { const sd = sideOf(RI[id], side); ops[id][side].forEach((op) => { if (op.kind === 'pass') return; outerOps.push({ axis: sd.axis, plane: sd.plane - (sd.axis === 'x' ? sd.nz : sd.nx) * WT, a: op.t - op.w / 2, b: op.t + op.w / 2, y0: op.y0, y1: op.y1 }); }); }));
    const extWalls = [];
    // horizontal edges (normal +-z)
    for (let j = 1; j < gh; j++) {
      for (const dir of [-1, 1]) { // -1: outside is -z (north face), +1: south face
        let run = null;
        for (let i = 0; i <= gw; i++) {
          const edge = i < gw && (dir < 0 ? inside(i, j) && !inside(i, j - 1) : inside(i, j - 1) && !inside(i, j));
          if (edge && run == null) run = i; else if (!edge && run != null) { extWalls.push({ axis: 'x', n: dir, plane: Z(j), lo: X(run), hi: X(i) }); run = null; }
        }
      }
    }
    for (let i = 1; i < gw; i++) {
      for (const dir of [-1, 1]) {
        let run = null;
        for (let j = 0; j <= gh; j++) {
          const edge = j < gh && (dir < 0 ? inside(i, j) && !inside(i - 1, j) : inside(i - 1, j) && !inside(i, j));
          if (edge && run == null) run = j; else if (!edge && run != null) { extWalls.push({ axis: 'z', n: dir, plane: X(i), lo: Z(run), hi: Z(j) }); run = null; }
        }
      }
    }
    const EH = CEIL + 0.25 - GROUND;
    extWalls.forEach((ew) => {
      const nx = ew.axis === 'z' ? ew.n : 0, nz = ew.axis === 'x' ? ew.n : 0;
      const c = ew.plane * (nx + nz);
      const op2 = outerOps.filter((q) => q.axis === ew.axis && Math.abs(q.plane - ew.plane) < 0.01 && q.a >= ew.lo - 0.01 && q.b <= ew.hi + 0.01).map((q) => ({ a: q.a, b: q.b, y0: q.y0, y1: q.y1 }));
      logWall(ringB, nx, nz, c, ew.lo, ew.hi, op2, { y0: GROUND + 0.25, H: EH - 0.25, phase: ew.axis === 'x' ? 0 : LOG_P / 2, outer: true, caps: true, ext: 0.28, seg: 9, mat: ringMat('wood_log'), r: 0.16 });
      // stone footing
      const mid = (ew.lo + ew.hi) / 2, off = ew.plane - ew.n * 0.08;
      ringB.add(ringMat('stone_wall'), gBox(ew.hi - ew.lo + 0.3, 0.32, 0.34), ew.axis === 'x' ? lm(mid, GROUND + 0.12, off) : lm(off, GROUND + 0.12, mid, PI / 2));
    });
    // roof slabs over the shell (seen as eaves from the windows)
    shell.forEach(([a, b, c, d], i) => {
      const y = CEIL + 0.3 + (i === 0 ? 0.1 : 0) + i * 0.01;
      ringB.add(ringMat('roof_shingle', { snowTop: 1 }), gBox(c - a + 1.1, 0.16, d - b + 1.1), lm((a + c) / 2, y, (b + d) / 2));
      ringB.add(ringMat('wood_plank_dark'), gBox(c - a + 1.12, 0.12, d - b + 1.12), lm((a + c) / 2, y - 0.12, (b + d) / 2));
    });
    // porch along the front (main bottom wall)
    const rm = RI.room_main, fdoor = dyn.doors.front;
    const zo = rm.z1 + WT, px0 = rm.x0 + 1.0, px1 = rm.x1 - 1.0, pd = 2.0;
    {
      const o = new Ctx(ringB, new THREE.Matrix4()), wM = ringMat('boards_weathered', { snowTop: 0.5 }), pM = ringMat('wood_weathered');
      const nb = Math.round(pd / 0.15);
      for (let i = 0; i < nb; i++) o.put(wM, gBox(px1 - px0, 0.04, 0.14), (px0 + px1) / 2, PORCH_Y - 0.02, zo + 0.075 + i * pd / nb);
      [0.3, 1.0, 1.7].forEach((t) => o.put(pM, gBox(px1 - px0, 0.2, 0.12), (px0 + px1) / 2, PORCH_Y - 0.14, zo + t));
      // steps in front of the door
      const dx = fdoor.fp.x;
      [[0.13, 0.32], [0.27, 0.62]].forEach(([dy, dz]) => o.put(wM, gBox(1.6, 0.05, 0.3), dx, PORCH_Y - dy - 0.025, zo + pd + dz - 0.15));
      [-0.82, 0.82].forEach((sx) => o.put(pM, gBox(0.06, 0.4, 0.75), dx + sx, PORCH_Y - 0.25, zo + pd + 0.3, 0, 0.5));
      // posts, rails, roof
      const posts = [px0 + 0.1, dx - 0.95, dx + 0.95, px1 - 0.1];
      posts.forEach((x) => o.put(ringMat('wood_log'), gCyl(0.09, 0.1, 2.5, 10), x, PORCH_Y + 1.23, zo + pd - 0.12));
      [[px0 + 0.1, dx - 0.95], [dx + 0.95, px1 - 0.1]].forEach(([a, b]) => { o.put(pM, gBox(b - a, 0.07, 0.09), (a + b) / 2, PORCH_Y + 0.92, zo + pd - 0.12); o.put(pM, gBox(b - a, 0.05, 0.06), (a + b) / 2, PORCH_Y + 0.35, zo + pd - 0.12); for (let x = a + 0.3; x < b - 0.1; x += 0.3) o.put(pM, gBoxV(0.04, 0.55, 0.04), x, PORCH_Y + 0.63, zo + pd - 0.12); });
      const ry0 = 2.78, ry1 = PORCH_Y + 2.5, slope = Math.atan2(ry0 - ry1, pd);
      o.put(ringMat('roof_shingle', { snowTop: 1 }), gBox(px1 - px0 + 0.5, 0.1, Math.hypot(pd + 0.4, ry0 - ry1) + 0.1), (px0 + px1) / 2, (ry0 + ry1) / 2 + 0.12, zo + pd / 2 + 0.15, 0, slope);
      o.put(pM, gBox(px1 - px0 + 0.2, 0.14, 0.12), (px0 + px1) / 2, ry1 + 0.02, zo + pd - 0.12);
      for (let x = px0 + 0.4; x < px1; x += 1.2) o.put(pM, gBox(0.08, 0.12, pd + 0.3), x, (ry0 + ry1) / 2 + 0.02, zo + pd / 2, 0, slope);
      // a chair, lantern hook and snow shovel on the porch
      FURN.chair(new Ctx(ringB, lm(px0 + 0.7, PORCH_Y, zo + 0.6, PI * 0.15)));
      o.put(pM, gBox(0.2, 1.3, 0.03), px1 - 0.4, PORCH_Y + 0.65, zo + 0.08, 0, -0.15);
      // back stoop
      const bd = dyn.doors.back, bx = bd.fp.x + bd.out.x * WT, bz = bd.fp.z;
      [[0, 0.12], [0.18, -0.12]].forEach(([dx2, dy]) => o.put(wM, gBox(0.55, 0.05, 1.5), bx + 0.275 + dx2, GROUND + 0.27 + dy, bz));
      o.put(pM, gBox(0.5, 0.3, 1.4), bx + 0.25, GROUND + 0.12, bz);
    }
    // ground (snow) and drifts
    const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
    {
      const g = new THREE.CircleGeometry(75, 48); g.rotateX(-PI / 2); g.translate(cx, GROUND, cz); Tx().metreUV(g);
      ringB.add(ringMat('snow'), g);
      const rr = rng(99);
      extWalls.forEach((ew) => { const L = ew.hi - ew.lo; for (let t = 0.6; t < L - 0.4; t += 1.4 + rr()) { const p = ew.axis === 'x' ? [ew.lo + t, ew.plane + ew.n * 0.35] : [ew.plane + ew.n * 0.35, ew.lo + t]; ringB.add(ringMat('snow'), gSphere(1, 12, 6), lm(p[0], GROUND - 0.05, p[1], ew.axis === 'x' ? 0 : PI / 2, 0, 0, 0.9 + rr() * 0.8, 0.22 + rr() * 0.18, 0.5)); } });
    }
    // woodpile outside the storage window
    const ws = dyn.windows.w_storage;
    const wpBase = lm(ws.fp.x - 0.4, GROUND, ws.fp.z - WT - 1.6, PI);
    const wpile = buildWoodpile(group, wpBase, 40, true);
    woodpileFrame(new Ctx(ringB, wpBase), 1.7, 1.3, ringMat('roof_shingle', { snowTop: 1 }));
    {
      // chopping block and a sawbuck near it
      const o = new Ctx(ringB, lm(ws.fp.x + 1.8, GROUND, ws.fp.z - WT - 2.4));
      o.put(ringMat('wood_log', { snowTop: 0.8 }), gCyl(0.24, 0.27, 0.5, 12), 0, 0.25, 0);
      o.put(ringMat('wood_log_end'), gDisc(0.235, 12), 0, 0.501, 0, 0, -PI / 2);
    }
    // pines: instanced, 6..40 m from the shell, receding into the fog
    {
      const trunkG = R3.geo('cab_pine_trunk', () => { const g = gCyl(0.08, 0.2, 7, 7, true); g.translate(0, 3.5, 0); g.userData.shared = true; return g; });
      const foliG = R3.geo('cab_pine_foli', () => {
        const parts = [];
        for (let i = 0; i < 6; i++) { const t = i / 6; const rad = 2.2 * (1 - t) + 0.25, hh = 2.6 - t * 1.0; const c = new THREE.ConeGeometry(rad, hh, 9, 2, true); const p = c.attributes.position; for (let k = 0; k < p.count; k++) { const y = p.getY(k); if (y < -hh / 2 + 0.01) p.setY(k, y - 0.35 * Math.sin(k * 1.7)); } c.computeVertexNormals(); Tx().metreUV(c); parts.push({ geo: c, matrix: lm(0, 1.6 + i * 1.18 + hh / 2, 0, i * 0.6) }); }
        const g = R3.merge(parts); g.userData.shared = true; return g;
      });
      const rr = rng(4242), mats = [];
      const dist = (x, z) => { const dx = Math.max(bx0 - x, 0, x - bx1), dz = Math.max(bz0 - z, 0, z - bz1); return Math.hypot(dx, dz); };
      let tries = 0;
      while (mats.length < 300 && tries++ < 6000) {
        const a = rr() * PI * 2, rad = 8 + Math.pow(rr(), 0.7) * 48;
        const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad * 0.85;
        const d = dist(x, z);
        if (d < 6.5 || d > 40) continue;
        if (d < 12 && rr() < 0.5) continue;
        const s = 0.75 + rr() * 0.6;
        mats.push(lm(x, GROUND - 0.1, z, rr() * 6, (rr() - 0.5) * 0.05, (rr() - 0.5) * 0.05, s, s * (0.9 + rr() * 0.35), s));
      }
      const t1 = new THREE.InstancedMesh(trunkG, ringMat('bark_pine'), mats.length), t2 = new THREE.InstancedMesh(foliG, ringMat('needles', { snowTop: 0.8, wind: 0.25 }), mats.length);
      mats.forEach((m, i) => { t1.setMatrixAt(i, m); t2.setMatrixAt(i, m); });
      [t1, t2].forEach((m) => { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; group.add(m); });
    }
    anchors.ring = { x: cx, y: GROUND, z: cz, r: Math.max(bx1 - bx0, (bz1 - bz0) / 0.7) / 2 + 5 };
    // roof anchor: above the stovepipe
    anchors.roof = { pos: new THREE.Vector3(stove ? stove.gp.x : cx, CEIL + 0.6, stove ? stove.gp.z - 0.6 : cz), yaw: 0 };

    // ---- flush static geometry
    ROOMS.forEach((id) => builders[id].flush(group));
    ringB.flush(group, { cast: false }).forEach((m) => { m.receiveShadow = false; });

    // ================================================================ per-frame update
    const day3 = new THREE.Color();
    function update(dt, ctx) {
      const s = ctx.state, Sv = NW.Survival, Dd = NW.D, t = ctx.t;
      const day = Sv.daylight();
      const add = ctx.addLight;
      // ring materials: restore outdoor fog density and fill while indoors
      RU.uRingFog.value = ctx.indoor ? 4 : 1;
      RU.uRingFill.value = ctx.indoor ? day * 0.55 + (1 - day) * 0.03 : 0;
      // stove
      const lit = Sv.stoveLit();
      if (stove) {
        const set = lit ? s.stove.setting : 'off';
        const lvTgt = { off: 0, low: 0.35, medium: 0.65, high: 1 }[set] || 0;
        stove.lv += (lvTgt - stove.lv) * Math.min(1, dt * 2);
        const siph = NW.Night.siphonOn() ? 0.6 : 1;
        const f = R3.Lights.f('stove');
        const k = stove.lv * siph;
        if (lit) {
          const lvl = Dd.STOVE[s.stove.setting].light * siph;
          add({ key: 'stove', x: stove.lp.x, y: stove.lp.y, z: stove.lp.z, color: [1.0, 0.46, 0.17], intensity: 6 + 75 * lvl, range: (44 + lvl * 120) * K * 2.0, flicker: 'fire', shadow: 3, glow: 0.35 + lvl * 0.3, glowIntensity: 0.25 + lvl * 0.35, glowColor: [1, 0.55, 0.2] });
        }
        stove.glass.emissiveIntensity = k * f * 2.2;
        const ek = (s.stove.fuel > 0 ? 0.04 : 0) + k * f * 1.6;
        stove.emb.color.setRGB(ek * 1.6, ek * 0.45, ek * 0.08);
        stove.flame.visible = k > 0.02;
        stove.flame.scale.set(1, (0.35 + k * 0.75) * (0.88 + 0.12 * Math.sin(t * 9.3) + 0.06 * Math.sin(t * 23)), 1);
        stove.flameMat.color.setRGB(k * f * 1.4, k * f * 1.2, k * f * 1.0);
      }
      // lamps
      dyn.lamps.forEach((L) => {
        const on = s.lamps[L.room] && s.oil > 0;
        const f = R3.Lights.f('lamp:' + L.room);
        if (on) add({ key: 'lamp:' + L.room, x: L.pos.x, y: L.pos.y, z: L.pos.z, color: [1.0, 0.64, 0.32], intensity: 22, range: 86 * K * 1.9, flicker: 'lantern', seed: L.pos.x, shadow: 1, glow: 0.3, glowIntensity: 0.5 });
        L.gm.emissiveIntensity = on ? 3.5 * f : 0; L.flame.visible = on;
        L.halo.material.emissiveIntensity = on ? 0.9 * f : 0;
      });
      // daylight through each window (2D: boarded 0.1, curtains 0.35, closed shutters 0.2)
      if (day > 0.05) dyn.dayLights.forEach((dl) => {
        const w = s.cabin.windows[dl.wid];
        const fct = w.boarded > 0 ? 0.1 : (w.curtClosed ? 0.35 : 1) * (w.shutClosed && w.shutter > 0 ? 0.2 : 1);
        add({ key: 'day:' + dl.wid, x: dl.x, y: 1.5, z: dl.z, color: [0.6, 0.7, 0.88], intensity: day * fct * 0.8 * 45, range: 80 * K * 2.2 });
      });
      // stove light spilling through the doorways into the side rooms (as 2D)
      if (lit) passages.forEach((p) => {
        const sd = sideOf(RI[p.to], p.toSide), fp = facePoint(sd, p.t);
        add({ key: 'spill:' + p.to, x: fp.x + sd.nx * 0.3, y: 1.1, z: fp.z + sd.nz * 0.3, color: [1.0, 0.5, 0.2], intensity: 0.45 * Dd.STOVE[s.stove.setting].light * 20, range: 60 * K * 2, flicker: 'fire' });
      });
      // windows
      for (const wid in dyn.windows) updateWindow(dyn.windows[wid], s.cabin.windows[wid], dt, false);
      // doors
      for (const did in dyn.doors) updateDoor(dyn.doors[did], s.cabin.doors[did], NW.G.doorAnim[did] || 0, NW.Night.scratcherAt(did), dt, t);
      // woodbox and woodpile
      if (dyn.woodbox) { const n = Math.min(15, s.woodbox | 0); dyn.woodbox.forEach((m) => { m.count = n; }); }
      wpile.set(s.woodpile);
      // radio LED, desk note, oil gauge, clock
      if (dyn.led) { const pend = s.radio.pending.length > 0; const on = pend ? Math.sin(t * 8) > 0 : true; dyn.led.material.color.setRGB(pend ? (on ? 3 : 0.15) : 0.1, pend ? (on ? 0.15 : 0.02) : 1.4, pend ? 0.05 : 0.2); }
      if (dyn.deskNote) dyn.deskNote.visible = !!NW.G.deskHasNews() && Math.sin(t * 4) > -0.6;
      if (dyn.oil) dyn.oil.scale.y = Math.max(0.001, Math.min(1, s.oil / Dd.OIL_CAP));
      if (dyn.clock) { const m = s.time.min; dyn.clock.mh.rotation.z = -(m % 60) / 60 * PI * 2; dyn.clock.hh.rotation.z = -((m / 60) % 12) / 12 * PI * 2; dyn.clock.pend.rotation.z = Math.sin(t * PI) * 0.12; }
      void day3;
    }
    return { group, update, anchors };
  };

  // ================================================================ EXTERIOR (f_2_2 clearing)
  Cab.buildExterior = function (area) {
    const group = new THREE.Group(); group.name = 'cabin-ext';
    const B = new Bld();
    const P = (px, py) => R3.toWorld(area.id, px, py, new THREE.Vector3());
    // footprint from the BUILDING tiles
    const mA = P(9 * TS, 3 * TS), mB = P(21 * TS, 11 * TS), aA = P(21 * TS, 5 * TS), aB = P(24 * TS, 10 * TS);
    const hs = [mA, mB, P(9 * TS, 11 * TS), P(21 * TS, 3 * TS), aB];
    const base = hs.reduce((m, p) => Math.min(m, R3.groundAt(p.x, p.z, area.id)), 99);
    const FL = base + 0.42;        // floor level
    const WH = 2.85;               // wall height above floor
    const top = FL + WH;
    const x0 = mA.x, z0 = mA.z, x1 = mB.x, z1 = mB.z; // main block
    const ax0 = aA.x, az0 = aA.z, ax1 = aB.x, az1 = aB.z; // annex
    const anchors = { windows: {} };
    const dyn = { windows: {} };
    // openings
    const front = P(240, 0).x, back = P(360, 0).x;
    const winX = { w_front_l: P(196, 0).x, w_front_r: P(284, 0).x, w_bed: P(178, 0).x, w_office: P(296, 0).x, w_storage: (ax0 + ax1) / 2 };
    const WD = { w: 1.05, y0: 0.95, y1: 1.95 };
    const sOps = [{ a: front - 0.55, b: front + 0.55, y0: base - 1, y1: FL + 2.08 }, { a: winX.w_front_l - WD.w / 2, b: winX.w_front_l + WD.w / 2, y0: FL + WD.y0, y1: FL + WD.y1 }, { a: winX.w_front_r - WD.w / 2, b: winX.w_front_r + WD.w / 2, y0: FL + WD.y0, y1: FL + WD.y1 }];
    const nOps = [{ a: winX.w_bed - WD.w / 2, b: winX.w_bed + WD.w / 2, y0: FL + WD.y0, y1: FL + WD.y1 }, { a: winX.w_office - WD.w / 2, b: winX.w_office + WD.w / 2, y0: FL + WD.y0, y1: FL + WD.y1 }];
    const opt = (phase, ext) => ({ y0: base - 0.05, H: top - base + 0.05, phase, outer: true, caps: true, ext, seg: 10, r: 0.17 });
    // main block walls (south, north, west, east) with notched corners
    logWall(B, 0, 1, z1, x0, x1, sOps, opt(0, 0.32));
    logWall(B, 0, -1, -z0, x0, x1, nOps, opt(0, 0.32));
    logWall(B, -1, 0, -x0, z0, z1, [], opt(LOG_P / 2, 0.32));
    logWall(B, 1, 0, x1, z0, z1, [], opt(LOG_P / 2, 0.32));
    // annex (lower, shed roof)
    const atop = FL + 2.35;
    const aopt = (phase, e0, e1) => ({ y0: base - 0.05, H: atop - base + 0.05, phase, outer: true, caps: true, ext0: e0, ext1: e1, seg: 9, r: 0.15 });
    logWall(B, 0, 1, az1, ax0, ax1, [{ a: back - 0.48, b: back + 0.48, y0: base - 1, y1: FL + 2.0 }], aopt(0.08, 0, 0.28));
    logWall(B, 0, -1, -az0, ax0, ax1, [{ a: winX.w_storage - 0.4, b: winX.w_storage + 0.4, y0: FL + 1.0, y1: FL + 1.75 }], aopt(0.08, 0.28, 0));
    logWall(B, 1, 0, ax1, az0, az1, [], aopt(0.08 + LOG_P / 2, 0.28, 0.28));
    // foundation stones
    const o = new Ctx(B, new THREE.Matrix4());
    const rr = rng(77);
    [[x0, z0, x1, z1], [ax0, az0, ax1, az1]].forEach(([a, b, c, d]) => {
      for (let x = a; x < c; x += 0.55) for (const z of [b, d]) o.put(M.stone(), gSphere(0.2, 7, 5), x + 0.25, base - 0.02, z, rr() * 3, 0, 0, 1.3, 0.6 + rr() * 0.3, 1);
      for (let z = b; z < d; z += 0.55) for (const x of [a, c]) o.put(M.stone(), gSphere(0.2, 7, 5), x, base - 0.02, z + 0.25, rr() * 3, 0, 0, 1, 0.6 + rr() * 0.3, 1.3);
    });
    // gable roof, ridge along X
    const zr = (z0 + z1) / 2, ov = 0.55, half = (z1 - z0) / 2 + ov, rise = 2.25, pitch = Math.atan2(rise, half - ov);
    const run = half / Math.cos(pitch);
    const ridgeY = top + rise;
    const eaveY = top - ov * Math.tan(pitch);
    [-1, 1].forEach((s2) => {
      const midZ = zr + s2 * half / 2, midY = (ridgeY + eaveY) / 2;
      o.put(M.roof(), gBox(x1 - x0 + 0.9, 0.12, run + 0.08), (x0 + x1) / 2, midY + 0.14, midZ, 0, -s2 * pitch);
      o.put(M.dark(), gBox(x1 - x0 + 0.86, 0.1, run), (x0 + x1) / 2, midY + 0.02, midZ, 0, -s2 * pitch);
      o.put(M.wweath(), gBox(x1 - x0 + 0.95, 0.2, 0.05), (x0 + x1) / 2, eaveY + 0.02, zr + s2 * (half + 0.02));
    });
    o.put(M.roof(), gBox(x1 - x0 + 0.95, 0.12, 0.3), (x0 + x1) / 2, ridgeY + 0.2, zr);
    // gable ends: board infill triangles + barge boards
    [x0, x1].forEach((gx, i) => {
      const sh = new THREE.Shape(); sh.moveTo(-(half - ov) - 0.05, 0); sh.lineTo(half - ov + 0.05, 0); sh.lineTo(0, rise + 0.02); sh.closePath();
      const g = new THREE.ShapeGeometry(sh); Tx().metreUV(g);
      o.put(M.weath(), g, gx + (i ? 0.1 : -0.1), top, zr, i ? PI / 2 : -PI / 2);
      for (let k = -4; k <= 4; k++) o.put(M.wweath(), gBoxV(0.035, Math.max(0.1, rise * (1 - Math.abs(k) / 4.5)), 0.03), gx + (i ? 0.12 : -0.12), top + rise * (1 - Math.abs(k) / 4.5) / 2, zr + k * 0.38, i ? PI / 2 : -PI / 2);
      [-1, 1].forEach((s2) => o.put(M.wweath(), gBox(0.06, 0.24, run + 0.1), gx + (i ? 0.45 : -0.45), (ridgeY + eaveY) / 2 + 0.06, zr + s2 * half / 2, 0, -s2 * pitch));
    });
    // annex shed roof, lean-to against the east gable
    {
      const sl = Math.atan2(0.5, ax1 - ax0 + 0.5), len = (ax1 - ax0 + 0.6) / Math.cos(sl);
      o.put(M.roof(), gBox(len, 0.12, az1 - az0 + 0.9), (ax0 + ax1) / 2 + 0.25, atop + 0.32, (az0 + az1) / 2, 0, 0, -sl);
      o.put(M.dark(), gBox(len, 0.1, az1 - az0 + 0.85), (ax0 + ax1) / 2 + 0.25, atop + 0.21, (az0 + az1) / 2, 0, 0, -sl);
      [az0, az1].forEach((z, i) => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(ax1 - ax0, 0); sh.lineTo(0, 0.5); sh.closePath(); const g = new THREE.ShapeGeometry(sh); o.put(M.weath(), g, ax0, atop, z + (i ? 0.02 : -0.02), i ? 0 : PI, 0, 0, i ? 1 : -1, 1, 1); });
    }
    // chimney: stone stack through the back slope
    const chX = P(188, 0).x, chZ = zr - 0.9;
    const roofYAt = (z) => ridgeY - Math.abs(z - zr) * Math.tan(pitch);
    const chTop = ridgeY + 1.0;
    {
      const yb = roofYAt(chZ) - 0.3;
      o.put(M.stone(), gBox(0.72, chTop - yb, 0.72), chX, (chTop + yb) / 2, chZ);
      o.put(M.stone(), gBox(0.86, 0.12, 0.86), chX, chTop + 0.04, chZ);
      o.put(M.iron(), gCyl(0.12, 0.12, 0.35, 10, true), chX, chTop + 0.25, chZ);
      o.put(M.metal(), gBox(0.4, 0.03, 0.4), chX, chTop + 0.44, chZ);
      o.put(M.snow(), gBox(0.8, 0.06, 0.8), chX, chTop + 0.13, chZ);
    }
    // porch: low deck, steps, posts and a shed roof
    const pz0 = z1 + 0.05, pd = 1.5, pxa = front - 3.1, pxb = front + 3.1;
    const deckY = Math.max(base + 0.14, R3.groundAt(front, pz0 + 1, area.id) + 0.12);
    {
      const nb = Math.round(pd / 0.15);
      for (let i = 0; i < nb; i++) o.put(M.snowPlank(), gBox(pxb - pxa, 0.04, 0.14), (pxa + pxb) / 2, deckY - 0.02, pz0 + 0.075 + i * pd / nb);
      o.put(M.wweath(), gBox(pxb - pxa, 0.3, 0.1), (pxa + pxb) / 2, deckY - 0.19, pz0 + pd - 0.05);
      o.put(M.snowPlank(), gBox(1.4, 0.05, 0.3), front, deckY - 0.12, pz0 + pd + 0.15);
      const py0 = FL + 2.45, py1 = deckY + 2.25, sl = Math.atan2(py0 - py1, pd);
      [pxa + 0.1, pxb - 0.1].forEach((x) => o.put(M.log(), gCyl(0.085, 0.095, py1 - deckY + 0.05, 10), x, (py1 + deckY) / 2, pz0 + pd - 0.1));
      o.put(M.roof(), gBox(pxb - pxa + 0.4, 0.1, Math.hypot(pd + 0.3, py0 - py1)), front, (py0 + py1) / 2 + 0.1, pz0 + pd / 2 + 0.1, 0, sl);
      o.put(M.wweath(), gBox(pxb - pxa + 0.2, 0.14, 0.12), front, py1, pz0 + pd - 0.1);
      [[pxa + 0.1, front - 0.75], [front + 0.75, pxb - 0.1]].forEach(([a, b]) => { o.put(M.wweath(), gBox(b - a, 0.07, 0.08), (a + b) / 2, deckY + 0.85, pz0 + pd - 0.1); for (let x = a + 0.3; x < b - 0.1; x += 0.32) o.put(M.wweath(), gBoxV(0.04, 0.8, 0.04), x, deckY + 0.43, pz0 + pd - 0.1); });
      // sign board above the door
      o.put(M.atlas(), gAtlas('board', 0.9, 0.36), front, FL + 2.3, z1 + 0.2);
    }
    // back stoop
    o.put(M.snowPlank(), gBox(1.2, 0.08, 0.7), back, base + 0.18, az1 + 0.38);
    o.put(M.wweath(), gBox(1.1, 0.25, 0.6), back, base + 0.05, az1 + 0.38);
    // window frames (static) and dynamic panes / shutters / boards
    const winDefs = [
      ['w_front_l', winX.w_front_l, z1, 0, 1, WD], ['w_front_r', winX.w_front_r, z1, 0, 1, WD],
      ['w_bed', winX.w_bed, z0, 0, -1, WD], ['w_office', winX.w_office, z0, 0, -1, WD],
      ['w_storage', winX.w_storage, az0, 0, -1, { w: 0.8, y0: 1.0, y1: 1.75 }],
    ];
    winDefs.forEach(([wid, wx, wz, nx, nz, wd]) => {
      const F = frame(nx, nz, wx, FL, wz + nz * 0.02);
      const wo = new Ctx(B, F), w = wd.w, y0 = wd.y0, y1 = wd.y1, h = y1 - y0, cy = (y0 + y1) / 2;
      // casing, sill, recess lining
      [-1, 1].forEach((sx) => wo.boxV(M.wweath(), 0.12, h + 0.12, 0.06, sx * (w / 2 + 0.06), cy + 0.03, 0.03));
      wo.box(M.wweath(), w + 0.32, 0.14, 0.07, 0, y1 + 0.07, 0.035);
      wo.box(M.snowPlank(), w + 0.36, 0.06, 0.2, 0, y0 - 0.03, 0.07, 0, 0.12);
      [-1, 1].forEach((sx) => wo.box(M.dark(), 0.03, h, 0.25, sx * (w / 2 - 0.015), cy, -0.12));
      wo.box(M.dark(), w, 0.03, 0.25, 0, y1 - 0.015, -0.12);
      const zs = -0.2;
      wo.boxV(M.dark(), 0.04, h, 0.04, 0, cy, zs + 0.02); wo.box(M.dark(), w, 0.04, 0.04, 0, cy, zs + 0.02);
      // pane: emissive from inside light; curtain shows as a warm red glow
      const pm = R3.std({ color: 0x0c1014, roughness: 0.18, metalness: 0.0, emissive: 0x000000, emissiveIntensity: 1 });
      const pane = fixed(new THREE.Mesh(new THREE.PlaneGeometry(w, h), pm), mul(F, lm(0, cy, zs))); group.add(pane);
      const curt = fixed(new THREE.Mesh(gCurtain(w, h, 6), R3.std({ color: 0x3a0e0e, roughness: 0.9, emissive: 0xff6a3a, emissiveIntensity: 0, side: THREE.DoubleSide })), mul(F, lm(-w / 2, y1, zs - 0.08))); group.add(curt);
      const cr = fixed(new THREE.Mesh(gDecal('crack2', w, h), crackMat()), mul(F, lm(0, cy, zs + 0.004))); cr.renderOrder = 3; group.add(cr);
      const hole = fixed(new THREE.Mesh(new THREE.PlaneGeometry(w * 0.92, h * 0.92), R3.basic({ color: 0x020203 })), mul(F, lm(0, cy, zs + 0.002))); group.add(hole);
      const shards = mergeGroup((SB) => { const so = new Ctx(SB, F), r2 = rng(wid.length * 3); for (let i = 0; i < 10; i++) { const sh = new THREE.Shape(); sh.moveTo(-0.05, 0); sh.lineTo(0.05, 0); sh.lineTo((r2() - 0.5) * 0.05, 0.08 + r2() * 0.14); sh.closePath(); const edge = i % 4, tt = r2() * 0.8 + 0.1; so.put(M.glass(), new THREE.ShapeGeometry(sh), edge < 2 ? -w / 2 + tt * w : edge === 2 ? -w / 2 + 0.02 : w / 2 - 0.02, edge === 0 ? y0 + 0.02 : edge === 1 ? y1 - 0.02 : y0 + tt * h, zs + 0.006, 0, 0, edge === 0 ? 0 : edge === 1 ? PI : edge === 2 ? -PI / 2 : PI / 2); } for (let i = 0; i < 8; i++) so.put(M.glass(), new THREE.CircleGeometry(0.03 + r2() * 0.04, 3), (r2() - 0.5) * w * 1.4, base - FL + 0.02, 0.3 + r2() * 0.6, r2() * 6, -PI / 2); });
      group.add(shards);
      const boards = [[-0.12, 0], [0.09, 1], [-0.05, 2]].map(([rz, i]) => { const g2 = mergeGroup((BB) => { const bo = new Ctx(BB, F); bo.box(M.weath(), w + 0.4, 0.16, 0.03, 0, y0 + 0.15 + i * (h - 0.3) / 2, 0.08, 0, 0, rz); }); group.add(g2); return g2; });
      const shut = [-1, 1].map((sx) => {
        const piv = new THREE.Group(); piv.matrixAutoUpdate = false; piv.matrix.copy(mul(F, lm(sx * (w / 2 + 0.12), cy, 0.08)));
        const inner = new THREE.Group(); piv.add(inner);
        inner.add(mergeGroup((SB) => { const so = new Ctx(SB, new THREE.Matrix4()); const lw = w / 2 + 0.1; for (let i = 0; i < 4; i++) so.boxV(M.weath(), lw / 4 - 0.006, h + 0.18, 0.03, -sx * (lw / 8 + i * lw / 4), 0, 0); so.box(M.weath(), lw - 0.04, 0.1, 0.025, -sx * lw / 2, h * 0.3, 0.025); so.box(M.weath(), lw - 0.04, 0.1, 0.025, -sx * lw / 2, -h * 0.3, 0.025); so.box(M.iron(), 0.25, 0.03, 0.01, -sx * 0.11, h * 0.3, 0.04); so.box(M.iron(), 0.25, 0.03, 0.01, -sx * 0.11, -h * 0.3, 0.04); }));
        group.add(piv); return { piv, inner };
      });
      dyn.windows[wid] = { pane, pm, curt, cr, hole, shards, boards, shut, sa: [0, 0], glass: pane, cr1: cr, cr2: cr };
      const out = new THREE.Vector3(wx, 0, wz + nz * 0.75);
      out.y = R3.groundAt(out.x, out.z, area.id);
      if (nz > 0) out.y = Math.max(out.y, deckY);
      anchors.windows[wid] = { outside: out, yaw: yawTo(nx, nz), glow: new THREE.Vector3(wx, FL + cy - 0.3, wz + nz * 0.7) };
    });
    // doors (exterior: z+ is outside, leaf swings inward = -z)
    const doors = {};
    {
      const F = frame(0, 1, front, FL, z1 + 0.02);
      const fo = new Ctx(B, F);
      [-1, 1].forEach((sx) => { fo.boxV(M.wweath(), 0.13, 2.15, 0.06, sx * 0.6, 1.07, 0.03); fo.box(M.dark(), 0.04, 2.08, 0.3, sx * 0.53, 1.04, -0.15); });
      fo.box(M.wweath(), 1.36, 0.16, 0.07, 0, 2.15, 0.035);
      fo.box(M.dark(), 1.1, 0.04, 0.32, 0, 0.0, -0.14);
      const dark = fixed(new THREE.Mesh(new THREE.PlaneGeometry(1.04, 2.06), R3.basic({ color: 0x000000 })), mul(F, lm(0, 1.03, -0.32))); group.add(dark);
      doors.front = buildDoor(group, F, 'front', 1.02, 2.04, -0.1, -1); doors.front.dark = dark;
      const Fb = frame(0, 1, back, FL, az1 + 0.02);
      const bo = new Ctx(B, Fb);
      [-1, 1].forEach((sx) => { bo.boxV(M.wweath(), 0.12, 2.05, 0.06, sx * 0.54, 1.02, 0.03); bo.box(M.dark(), 0.04, 1.98, 0.3, sx * 0.48, 0.99, -0.15); });
      bo.box(M.wweath(), 1.22, 0.14, 0.07, 0, 2.05, 0.035);
      const darkB = fixed(new THREE.Mesh(new THREE.PlaneGeometry(0.94, 1.96), R3.basic({ color: 0x000000 })), mul(Fb, lm(0, 0.98, -0.32))); group.add(darkB);
      doors.back = buildDoor(group, Fb, 'back', 0.92, 1.94, -0.1, -1); doors.back.dark = darkB;
    }
    // woodpile (instanced, from state.woodpile) under its own little roof
    const wp = area.objs.find((ob) => ob.type === 'woodpile_ext');
    let wpile = null;
    if (wp) {
      const p = P(wp.x, wp.y - 5);
      const wb = lm(p.x, R3.groundAt(p.x, p.z, area.id), p.z, 0);
      wpile = buildWoodpile(group, wb, 40, false);
      woodpileFrame(new Ctx(B, wb), 1.75, 1.3, M.roof());
    }
    const cb = area.objs.find((ob) => ob.type === 'chopblock');
    if (cb) {
      const p = P(cb.x, cb.y - 3), gy = R3.groundAt(p.x, p.z, area.id);
      const co = new Ctx(B, lm(p.x, gy, p.z, 0.4));
      co.put(Tx().mat('wood_log', { snowTop: 0.8 }), gCyl(0.24, 0.28, 0.5, 12), 0, 0.25, 0);
      co.put(M.logEnd(), gDisc(0.235, 12), 0, 0.501, 0, 0, -PI / 2);
      co.box(M.plank(), 0.035, 0.75, 0.04, 0.05, 0.85, 0, 0, 0, -0.35);
      co.box(M.metal(), 0.2, 0.12, 0.02, -0.02, 0.53, 0, 0, 0, -0.35);
      const r3 = rng(8);
      for (let i = 0; i < 14; i++) co.box(M.plank(), 0.04 + r3() * 0.05, 0.015, 0.08 + r3() * 0.12, (r3() - 0.5) * 1.4, 0.01, (r3() - 0.5) * 1.2, r3() * 3);
      [[0.55, 0.2], [-0.4, 0.5]].forEach(([dx, dz]) => { co.put(M.log(), gLogX(0.08, 0.45, 8), dx, 0.08, dz, r3() * 3); co.put(M.logEnd(), gDisc(0.078, 8), dx + Math.cos(0) * 0.225, 0.08, dz, PI / 2); });
    }
    // rain barrel at the NE corner, snow drifts along walls
    {
      const bo = new Ctx(B, lm(x1 + 0.45, R3.groundAt(x1 + 0.45, z0 + 0.4, area.id), z0 + 0.45, 0.5));
      FURN.barrel(bo, 0.9, 0.3);
      bo.put(M.snow(), new THREE.CircleGeometry(0.26, 14), 0, 0.885, 0, 0, -PI / 2);
      const r4 = rng(13);
      const walls = [[x0, z1 + 0.25, x1, 0], [x0, z0 - 0.3, x1, 0], [x0 - 0.3, z0, z1, 1], [ax1 + 0.3, az0, az1, 1]];
      walls.forEach(([a, b, c, vert]) => { const L = vert ? c - b : c - a; for (let t = 0.4; t < L - 0.3; t += 1.1 + r4()) { if (!vert && Math.abs(a + t - front) < 1.6 && b > z1) continue; const px = vert ? a : a + t, pz = vert ? b + t : b; o.put(M.snow(), gSphere(1, 12, 6), px, R3.groundAt(px, pz, area.id) - 0.06, pz, vert ? PI / 2 : 0, 0, 0, 0.8 + r4() * 0.9, 0.2 + r4() * 0.2, 0.45); } });
    }
    B.flush(group);

    // chimney smoke: instanced camera-facing puffs with per-instance alpha; sparks when the stove burns high
    const NP = 30;
    const smokeMat = R3.basic({ map: puffTex(), color: 0xffffff, transparent: true, depthWrite: false });
    smokeMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aA; varying float vA;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvA = aA;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vA;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vA;');
    };
    smokeMat.customProgramCacheKey = () => 'cab_smoke';
    const pg = new THREE.PlaneGeometry(1, 1); const aAl = new THREE.InstancedBufferAttribute(new Float32Array(NP), 1); pg.setAttribute("aA", aAl);
    const smoke = new THREE.InstancedMesh(pg, smokeMat, NP); smoke.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NP * 3), 3); smoke.frustumCulled = false; smoke.renderOrder = 6; group.add(smoke);
    const NS = 14;
    const sparks = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.05, 0.05), R3.glowMat({ color: 0xffa040 }), NS); sparks.frustumCulled = false; sparks.renderOrder = 7; group.add(sparks);
    const seeds = Array.from({ length: NP }, (_, i) => [i / NP, rr(), rr()]);
    const dummy = new THREE.Object3D(), col = new THREE.Color();
    const chimTop = new THREE.Vector3(chX, chTop + 0.45, chZ);
    let smokeAmt = 0;

    anchors.porchVisitor = { pos: new THREE.Vector3(front, deckY, z1 + 0.62), yaw: PI };
    anchors.frontDoorOutside = { pos: new THREE.Vector3(front, deckY, z1 + 0.5), yaw: PI, approach: new THREE.Vector3(front, R3.groundAt(front, z1 + 4.5, area.id), z1 + 4.5) };
    anchors.backDoorOutside = { pos: new THREE.Vector3(back, base + 0.2, az1 + 0.5), yaw: PI, approach: new THREE.Vector3(back + 5, base, az1 + 0.5) };
    anchors.roof = { pos: new THREE.Vector3(chX + 0.75, roofYAt(chZ + 0.2) + 0.02, chZ + 0.2), yaw: -PI / 2 };

    function update(dt, ctx) {
      const s = ctx.state, Sv = NW.Survival, L = Sv.light, t = ctx.t, add = ctx.addLight;
      const day = Sv.daylight();
      // windows: warm glow from Survival.light.winLeak, pooled light outside
      for (const wid in dyn.windows) {
        const wd = dyn.windows[wid], w = s.cabin.windows[wid], leak = L.winLeak[wid] || 0;
        const roomL = L.room[w.room] || 0;
        const broken = w.glass <= 0;
        const glow = (w.boarded > 0 ? 0 : roomL * (w.shutClosed && w.shutter > 0 ? 0.15 : 1));
        // by day the glass mostly reflects the cold sky; the warm interior only shows once it gets dark
        const warm = broken ? 0 : (1 - Math.exp(-glow * 1.3)) * (w.curtClosed ? 0.25 : 1.35) * Math.pow(1 - day, 1.5);
        wd.pm.emissive.setRGB(warm + day * 0.075, warm * 0.25 + day * 0.095, warm * 0.017 + day * 0.125); wd.pm.emissiveIntensity = 1;
        wd.pm.color.setRGB(0.015, 0.018, 0.022);
        wd.curt.visible = !!w.curtClosed && w.boarded <= 0;
        wd.curt.material.emissiveIntensity = glow * 0.9 * Math.pow(1 - day, 1.5);
        wd.cr.visible = !broken && w.glass < 70;
        wd.hole.visible = broken && !w.curtClosed;
        wd.hole.material.color.setRGB(roomL * 0.25, roomL * 0.12, roomL * 0.05);
        wd.pane.visible = !broken;
        wd.shards.visible = broken;
        const bn = w.boarded > 0 ? Math.max(1, Math.min(3, Math.ceil(w.boarded / 34))) : 0;
        wd.boards.forEach((b, i) => { b.visible = i < bn; });
        const closed = w.shutClosed && w.shutter > 0;
        wd.shut.forEach((sh, i) => {
          const sx = i ? 1 : -1;
          let ang = closed ? 0 : sx * 2.95, rz = 0;
          if (w.shutter <= 0) { if (i) { sh.piv.visible = false; return; } ang = sx * 1.3; rz = -0.35; }
          sh.piv.visible = true; wd.sa[i] += (ang - wd.sa[i]) * Math.min(1, dt * 6); sh.inner.rotation.set(0, wd.sa[i], rz);
        });
        if (leak > 0.02) { const g = anchors.windows[wid].glow; add({ key: 'winglow:' + wid, x: g.x, y: g.y, z: g.z, color: [1.0, 0.6, 0.28], intensity: leak * 9, range: (30 + leak * 50) * K * 2.2, flicker: 'fire', seed: g.x, glow: w.curtClosed ? 0 : 0.5 * leak, glowIntensity: 0.25 }); }
      }
      // doors
      ['front', 'back'].forEach((did) => {
        const d = s.cabin.doors[did], dd = doors[did];
        updateDoor(dd, d, NW.G.doorAnim[did] || 0, NW.Night.scratcherAt(did), dt, t);
        const open = d.open || d.hp <= 0 || (NW.G.doorAnim[did] || 0) > 0;
        dd.dark.visible = open;
        const rl = L.room[d.room] || 0;
        dd.dark.material.color.setRGB(0.02 + rl * 0.5, 0.012 + rl * 0.22, 0.006 + rl * 0.08);
      });
      if (s.cabin.doors.front.open || s.cabin.doors.front.hp <= 0) add({ key: 'doorglow', x: front, y: FL + 1.0, z: z1 + 0.8, color: [1.0, 0.58, 0.26], intensity: 2 + (L.room.room_main || 0) * 10, range: 60 * K * 2.2, flicker: 'fire' });
      // woodpile
      if (wpile) wpile.set(s.woodpile);
      // chimney: smoke amount follows the stove setting; glow and sparks when high (gameplay information)
      const lit = Sv.stoveLit();
      const lv = lit ? ({ low: 0.4, medium: 0.7, high: 1 }[s.stove.setting] || 0) : 0;
      smokeAmt += (lv - smokeAmt) * Math.min(1, dt * 0.5);
      const cam = ctx.cam, wind = s.weather.wind || 0;
      const shade = 0.05 + day * 0.5;
      for (let i = 0; i < NP; i++) {
        const sd = seeds[i], ph = (t * (0.07 + smokeAmt * 0.05) + sd[0]) % 1;
        const rise = ph * (5 + smokeAmt * 4);
        dummy.position.set(chimTop.x + ph * ph * (2 + wind * 9) * 0.82 + Math.sin(ph * 5 + sd[1] * 6) * 0.3, chimTop.y + rise, chimTop.z + ph * ph * (2 + wind * 9) * 0.57 + Math.cos(ph * 4 + sd[2] * 6) * 0.3);
        dummy.quaternion.copy(cam.quaternion); dummy.rotateZ(sd[1] * 6 + ph * 1.5);
        const sc = 0.5 + ph * (2.2 + smokeAmt * 1.4); dummy.scale.set(sc, sc, sc); dummy.updateMatrix();
        smoke.setMatrixAt(i, dummy.matrix);
        aAl.array[i] = smokeAmt * Math.sin(Math.min(1, ph * 6) * PI / 2) * (1 - ph) * 0.7;
        const warm = s.stove.setting === 'high' && lit ? Math.max(0, 1 - ph * 4) * 0.5 : 0;
        col.setRGB(shade + warm, shade * 1.0 + warm * 0.4, shade * 1.05 + warm * 0.1); smoke.setColorAt(i, col);
      }
      smoke.visible = smokeAmt > 0.01; smoke.instanceMatrix.needsUpdate = true; aAl.needsUpdate = true; smoke.instanceColor.needsUpdate = true;
      const high = lit && s.stove.setting === 'high';
      sparks.visible = high;
      if (high) {
        for (let i = 0; i < NS; i++) { const ph = (t * 0.9 + i / NS) % 1; dummy.position.set(chimTop.x + Math.sin(i * 3.1 + t) * 0.25 * ph + ph * wind * 1.5, chimTop.y + ph * 2.4, chimTop.z + Math.cos(i * 2.3 + t) * 0.25 * ph); dummy.quaternion.copy(cam.quaternion); const sc = (1 - ph) * 1.4; dummy.scale.set(sc, sc, sc); dummy.updateMatrix(); sparks.setMatrixAt(i, dummy.matrix); }
        sparks.instanceMatrix.needsUpdate = true;
        add({ key: 'chimney', x: chimTop.x, y: chimTop.y + 0.1, z: chimTop.z, color: [1.0, 0.45, 0.15], intensity: 4, range: 6, flicker: 'fire', glow: 0.9, glowIntensity: 0.6 });
      }
    }
    return { group, update, anchors };
  };
})(window.NW);
