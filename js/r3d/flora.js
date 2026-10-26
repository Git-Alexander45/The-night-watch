'use strict';
// Flora: every tree of the winter forest — the 25 play areas, the belt beyond the world edge and the
// understory of young snow-laden firs — drawn by a few world-wide instanced meshes. Each frame the
// instances are culled against the camera frustum and split into a near model (bark, snow-loaded branch
// tiers, alpha branch sprays) and a far model (bark + tiers only). Tree positions come from the game's
// own objects (NW.World), so colliders and the 3D trunks always agree. Nothing here changes game state.
(function (NW) {
  const THREE = window.THREE, R3 = NW.R3;
  if (!THREE || !R3) return;
  const U = NW.U, D = NW.D, W = NW.World;
  const Fl = R3.Flora = { stats: {} };
  const K = R3.K, TAU = Math.PI * 2, TM = 0.8;
  const AW = R3.AREA_W, AH = R3.AREA_H;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ===================================================================== atlas (canvas-painted)
  // 2 x 2 cells: 0 spruce/fir spray, 1 pine needle tufts, 2 bare twigs, 3 dry grass stalks.
  // A second texture holds where snow settles on each spray (alpha = coverage, red = shading).
  Fl.CELL = [[0, 0.5], [0.5, 0.5], [0, 0], [0.5, 0]];
  let atlas = null;
  function rgba(r, g, b, a) { return 'rgba(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ',' + a + ')'; }
  function paintAtlas(S) {
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const sv = document.createElement('canvas'); sv.width = sv.height = S;
    const g = cv.getContext('2d'), s = sv.getContext('2d');
    const C = S / 2, px = C / 512;
    const rnd = U.rng(77123);
    g.lineCap = 'round'; s.lineCap = 'round';
    // ---- shared: draw batched strokes per colour bucket
    function batch(ctx, segs, w, col) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); for (let i = 0; i < segs.length; i += 4) { ctx.moveTo(segs[i], segs[i + 1]); ctx.lineTo(segs[i + 2], segs[i + 3]); } ctx.stroke(); }
    function blob(ctx, x, y, r, a) { const gr = ctx.createRadialGradient(x, y - r * 0.25, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,' + a + ')'); gr.addColorStop(0.55, 'rgba(215,215,215,' + a * 0.9 + ')'); gr.addColorStop(1, 'rgba(160,160,160,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    // ---- cell 0: spruce / fir branch seen from above (u along the branch, v across)
    {
      const ox = 0, oy = 0, cy = oy + C / 2;
      const needles = [[], [], [], []], stems = [];
      const laterals = [];
      for (let t = 0.04, side = 1; t < 0.97; t += 0.028 + rnd() * 0.012, side = -side) {
        const x0 = ox + t * C, y0 = cy + Math.sin(t * 3) * 4 * px;
        const L = (C * 0.44 * Math.pow(1 - t, 0.75) + C * 0.05) * (0.75 + rnd() * 0.35);
        const ang = (0.55 + rnd() * 0.35) * side;
        laterals.push([x0, y0, ang, L, t]);
      }
      // main axis
      stems.push(ox + 2, cy, ox + C - 2, cy + Math.sin(3) * 4 * px);
      const addNeedles = (x0, y0, dx, dy, L, dens, nl) => {
        const n = Math.floor(L / (2.6 * px) * dens);
        for (let k = 0; k < n; k++) {
          const f = k / n, x = x0 + dx * L * f, y = y0 + dy * L * f;
          for (let sgn = -1; sgn <= 1; sgn += 2) {
            const a = Math.atan2(dy, dx) + sgn * (0.75 + rnd() * 0.5);
            const l = nl * (0.7 + rnd() * 0.6) * (1 - f * 0.35);
            needles[(rnd() * 4) | 0].push(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l);
          }
        }
      };
      laterals.forEach(([x0, y0, ang, L]) => {
        const dx = Math.cos(ang), dy = Math.sin(ang);
        stems.push(x0, y0, x0 + dx * L, y0 + dy * L);
        addNeedles(x0, y0, dx, dy, L, 1, 15 * px);
        // secondary shoots
        for (let k = 0; k < 2; k++) {
          const f = 0.3 + k * 0.3 + rnd() * 0.1, bx = x0 + dx * L * f, by = y0 + dy * L * f, a2 = ang + (k ? -1 : 1) * Math.sign(ang) * 0.7, l2 = L * (0.35 + rnd() * 0.15);
          stems.push(bx, by, bx + Math.cos(a2) * l2, by + Math.sin(a2) * l2);
          addNeedles(bx, by, Math.cos(a2), Math.sin(a2), l2, 1, 12 * px);
        }
      });
      addNeedles(ox, cy, 1, 0, C, 1.2, 16 * px);
      batch(g, stems, 3.2 * px, 'rgb(52,40,30)');
      const nc = [[24, 44, 30], [32, 56, 38], [20, 36, 28], [44, 66, 44]];
      needles.forEach((list, i) => batch(g, list, 2.3 * px, rgba(nc[i][0], nc[i][1], nc[i][2], 1)));
      // snow: clumps resting on the shoots, thick along the axis, thinning toward the tips
      laterals.forEach(([x0, y0, ang, L, t]) => {
        const dx = Math.cos(ang), dy = Math.sin(ang);
        for (let f = 0; f < 0.85; f += 0.14 + rnd() * 0.1) { const r = (9 + rnd() * 14) * px * (1 - f * 0.6) * (1.1 - t * 0.5); blob(s, x0 + dx * L * f, y0 + dy * L * f, r, 0.85); }
      });
      for (let x = ox + 6 * px; x < ox + C * 0.93; x += 9 * px) blob(s, x, cy, (16 + rnd() * 10) * px * (1 - (x - ox) / C * 0.55), 0.95);
    }
    // ---- cell 1: pine needle tufts (long needles in brushes toward the tips)
    {
      const ox = C, oy = 0, cy = oy + C / 2;
      const needles = [[], [], []], stems = [];
      const tufts = [];
      const shoot = (x0, y0, a, L, depth) => {
        const x1 = x0 + Math.cos(a) * L, y1 = y0 + Math.sin(a) * L;
        stems.push(x0, y0, x1, y1);
        tufts.push([x1, y1, a, L]);
        if (depth > 0) for (let k = 0; k < 2; k++) shoot(x0 + (x1 - x0) * (0.45 + k * 0.25), y0 + (y1 - y0) * (0.45 + k * 0.25), a + (k ? 0.65 : -0.65) + (rnd() - 0.5) * 0.3, L * 0.55, depth - 1);
      };
      shoot(ox + 4 * px, cy, 0, C * 0.62, 2);
      tufts.forEach(([x, y, a, L]) => {
        const nl = clamp(L * 0.6, 40 * px, 75 * px);
        for (let k = 0; k < 46; k++) {
          const f = rnd(), bx = x - Math.cos(a) * L * 0.35 * f, by = y - Math.sin(a) * L * 0.35 * f;
          const aa = a + (rnd() - 0.5) * 2.6, l = nl * (0.6 + rnd() * 0.5);
          needles[(rnd() * 3) | 0].push(bx, by, bx + Math.cos(aa) * l, by + Math.sin(aa) * l);
        }
      });
      batch(g, stems, 4 * px, 'rgb(70,52,38)');
      batch(g, needles[0], 2.2 * px, 'rgb(34,54,34)'); batch(g, needles[1], 2.2 * px, 'rgb(46,68,40)'); batch(g, needles[2], 2.0 * px, 'rgb(28,44,30)');
      tufts.forEach(([x, y, a, L]) => { blob(s, x - Math.cos(a) * L * 0.15, y - Math.sin(a) * L * 0.15, (18 + rnd() * 16) * px, 0.9); });
    }
    // ---- cell 2: bare winter twigs (birch, shrubs), branching from the left edge
    {
      const ox = 0, oy = C, cy = oy + C / 2;
      const lv = [[], [], [], []];
      const twig = (x0, y0, a, L, d) => {
        const x1 = x0 + Math.cos(a) * L, y1 = y0 + Math.sin(a) * L;
        lv[Math.min(3, 3 - d)].push(x0, y0, x1, y1);
        if (d > 0) { const n = d > 1 ? 3 : 4; for (let k = 0; k < n; k++) { const f = 0.3 + k / n * 0.65; twig(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, a + (k % 2 ? 1 : -1) * (0.35 + rnd() * 0.45), L * (0.42 + rnd() * 0.2) * (1 - f * 0.4), d - 1); } }
      };
      twig(ox + 2, cy, 0, C * 0.7, 3);
      twig(ox + 2, cy + 20 * px, 0.25, C * 0.45, 2); twig(ox + 2, cy - 20 * px, -0.25, C * 0.45, 2);
      [5.2, 3.4, 2.2, 1.5].forEach((w, i) => batch(g, lv[i], w * px, i < 2 ? 'rgb(58,44,40)' : 'rgb(78,52,44)'));
      // a thin ridge of snow on the thicker twigs
      s.lineCap = 'round';
      [[lv[0], 7], [lv[1], 4.5]].forEach(([list, w]) => { s.strokeStyle = 'rgba(235,235,235,0.9)'; s.lineWidth = w * px; s.beginPath(); for (let i = 0; i < list.length; i += 4) { s.moveTo(list[i], list[i + 1] - 1.5 * px); s.lineTo(list[i + 2], list[i + 3] - 1.5 * px); } s.stroke(); });
    }
    // ---- cell 3: dry grass and weed stalks poking out of the snow (root at the bottom)
    {
      const ox = C, oy = C;
      const cols = ['rgb(150,128,86)', 'rgb(120,100,66)', 'rgb(176,154,110)', 'rgb(96,80,58)'];
      const lists = [[], [], [], []];
      for (let i = 0; i < 70; i++) {
        const x0 = ox + C * 0.12 + rnd() * C * 0.76, h = C * (0.35 + rnd() * 0.6), lean = (rnd() - 0.5) * 0.6, segs = 6;
        let x = x0, y = oy + C - 2;
        const li = lists[(rnd() * 4) | 0];
        for (let k = 0; k < segs; k++) { const t = (k + 1) / segs, nx = x0 + lean * h * t * t, ny = oy + C - 2 - h * t; li.push(x, y, nx, ny); x = nx; y = ny; }
      }
      lists.forEach((l, i) => batch(g, l, (2.6 - i * 0.3) * px, cols[i]));
      // seed heads
      for (let i = 0; i < 9; i++) { g.fillStyle = 'rgb(110,88,60)'; const x = ox + C * 0.2 + rnd() * C * 0.6, y = oy + C * (0.1 + rnd() * 0.3); g.beginPath(); g.ellipse(x, y, 5 * px, 16 * px, (rnd() - 0.5) * 0.5, 0, TAU); g.fill(); }
    }
    const mk = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; };
    return { map: mk(cv, true), snow: mk(sv, false), canvas: cv };
  }
  function getAtlas() { if (!atlas) atlas = paintAtlas((R3.q().tex || 1024) >= 1024 ? 1024 : 512); return atlas; }
  Fl.atlas = getAtlas;

  // ===================================================================== materials
  // Instance colour channels are read as variation, not as a tint: x brightness, y snow load, z hue (green/blue).
  const VAR_VS = `
    #ifdef USE_INSTANCING_COLOR
      vFlVar = instanceColor; vColor.xyz = color.xyz;
    #else
      vFlVar = vec3(1.0, 1.0, 0.5);
    #endif`;
  const VAR_TINT = 'vec3 flTint = vFlVar.x * vec3(1.0 + (vFlVar.z - 0.5) * 0.22, 1.0, 1.0 - (vFlVar.z - 0.5) * 0.22);';
  const SNOW_COL = 'vec3(0.80, 0.85, 0.93)';
  function addVar(sh) {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFlVar;').replace('#include <color_vertex>', '#include <color_vertex>\n' + VAR_VS);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFlVar;');
  }
  // opaque branch tiers: dark needles, snow on everything that faces up
  Fl.massMat = () => R3.mat('fl.mass', () => R3.std({ color: 0xffffff, vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }, { wind: 0.09, wet: true, patchKey: '|flMass', patch(sh) {
    addVar(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      ${VAR_TINT}
      diffuseColor.rgb *= flTint;
      float flN = r3noise(vR3World * 2.3) * 0.65 + r3noise(vR3World * 7.1) * 0.35;
      float flAmt = clamp(uSnow * vFlVar.y, 0.0, 1.3);
      float flCov = smoothstep(0.6, 0.8, vR3Normal.y + (flN - 0.5) * 0.6 + flAmt * 0.38 - 0.1) * step(0.05, flAmt);
      if (!gl_FrontFacing) { flCov = 0.0; diffuseColor.rgb *= 0.6; }
      vec3 flSnow = ${SNOW_COL} * (0.82 + 0.25 * flN);
      diffuseColor.rgb = mix(diffuseColor.rgb, flSnow, flCov);
      float flRough = mix(0.92, 0.78, flCov);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = flRough;');
  } }));
  // alpha-tested branch sprays / twigs / stalks: snow shows on the side of the card that faces the sky
  Fl.cardMat = () => R3.mat('fl.card', () => {
    const A = getAtlas();
    const m = R3.std({ color: 0xffffff, vertexColors: true, map: A.map, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.88, metalness: 0 }, { wind: 0.13, wet: true, patchKey: '|flCard', patch(sh) {
      addVar(sh);
      sh.uniforms.tFlSnow = { value: A.snow };
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tFlSnow;')
        .replace('#include <alphatest_fragment>', `
        {
          ${VAR_TINT}
          diffuseColor.rgb *= flTint;
          vec3 flFn = normalize(cross(dFdx(vR3World), dFdy(vR3World)));
          if (dot(flFn, cameraPosition - vR3World) < 0.0) flFn = -flFn;
          vec4 flSm = texture2D(tFlSnow, vMapUv);
          float flAmt = clamp(uSnow * vFlVar.y, 0.0, 1.3);
          float flS = flSm.a * smoothstep(-0.15, 0.3, flFn.y) * smoothstep(0.05, 0.5, flAmt) * clamp(flAmt * 1.15, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, ${SNOW_COL} * (0.72 + 0.3 * flSm.r), smoothstep(0.25, 0.6, flS));
          diffuseColor.a = max(diffuseColor.a, step(0.55, flS));
        }
        #include <alphatest_fragment>`)
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
    } });
    return m;
  });
  const barkMat = (name) => (R3.Forest && R3.Forest.mats ? R3.Forest.mats()[name] : R3.std({ color: 0x555555, vertexColors: true }));

  // ===================================================================== geometry kit
  class GB {
    constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.ix = []; }
    get nv() { return this.p.length / 3; }
    v(x, y, z, nx, ny, nz, u, w, c) { this.p.push(x, y, z); const l = Math.hypot(nx, ny, nz) || 1; this.n.push(nx / l, ny / l, nz / l); this.uv.push(u, w); this.c.push(c[0], c[1], c[2]); return this.nv - 1; }
    t(a, b, c) { this.ix.push(a, b, c); }
    // recompute smooth normals for the triangles added since index position i0 (vertices from v0)
    smooth(v0, i0, blendUp) {
      const p = this.p, n = this.n;
      for (let v = v0; v < this.nv; v++) { n[v * 3] = 0; n[v * 3 + 1] = 0; n[v * 3 + 2] = 0; }
      for (let i = i0; i < this.ix.length; i += 3) {
        const a = this.ix[i], b = this.ix[i + 1], c = this.ix[i + 2];
        const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
        const wx = p[c * 3] - p[a * 3], wy = p[c * 3 + 1] - p[a * 3 + 1], wz = p[c * 3 + 2] - p[a * 3 + 2];
        const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        [a, b, c].forEach((q) => { n[q * 3] += nx; n[q * 3 + 1] += ny; n[q * 3 + 2] += nz; });
      }
      for (let v = v0; v < this.nv; v++) {
        let x = n[v * 3], y = n[v * 3 + 1], z = n[v * 3 + 2]; const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
        if (blendUp) { y += blendUp; const l2 = Math.hypot(x, y, z); x /= l2; y /= l2; z /= l2; }
        n[v * 3] = x; n[v * 3 + 1] = y; n[v * 3 + 2] = z;
      }
    }
    // tube along points [{x,y,z,r}] with `seg` sides; colour per point (c) or shared
    tube(pts, seg, col, uR, cap) {
      const up = new THREE.Vector3(0, 1, 0), ax = new THREE.Vector3(1, 0, 0), rings = [];
      let along = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const t = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
        const ref = Math.abs(t.y) < 0.9 ? up : ax;
        const n1 = new THREE.Vector3().crossVectors(t, ref).normalize(), n2 = new THREE.Vector3().crossVectors(t, n1).normalize();
        if (i) along += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y, p.z - pts[i - 1].z);
        const ring = [], circ = TAU * (uR || p.r);
        for (let j = 0; j <= seg; j++) {
          const an = j / seg * TAU, cx = Math.cos(an), cz = Math.sin(an);
          const nx = n1.x * cx + n2.x * cz, ny = n1.y * cx + n2.y * cz, nz = n1.z * cx + n2.z * cz;
          ring.push(this.v(p.x + nx * p.r, p.y + ny * p.r, p.z + nz * p.r, nx, ny, nz, j / seg * circ, along, p.c || col));
        }
        rings.push(ring);
      }
      for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < seg; j++) { const a = rings[i][j], b = rings[i + 1][j], c = rings[i + 1][j + 1], d = rings[i][j + 1]; this.t(a, b, c); this.t(a, c, d); }
      if (cap) { const p = pts[pts.length - 1], l = rings[rings.length - 1], c = this.v(p.x, p.y + (cap.y || 0), p.z, 0, 1, 0, 0, along, cap.c || col); for (let j = 0; j < seg; j++) this.t(l[j], l[j + 1], c); }
    }
    // drooping card: origin o, unit dir d, unit side s, length L, width Wd, droop; atlas cell; card colour (AO);
    // lighting normal nfn(x, y, z, t) -> [nx, ny, nz]
    card(o, d, s, L, Wd, segs, droop, cell, col, nfn, flip) {
      const base = this.nv, c0 = Fl.CELL[cell];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs, dy = -droop * t * t;
        for (let k = -1; k <= 1; k += 2) {
          const x = o.x + d.x * L * t + s.x * k * Wd / 2, y = o.y + d.y * L * t + dy + s.y * k * Wd / 2, z = o.z + d.z * L * t + s.z * k * Wd / 2;
          const nn = nfn(x, y, z, t), cc = typeof col === 'function' ? col(t) : col;
          const uu = c0[0] + (flip ? 1 - t : t) * 0.5 * 0.995, vv = c0[1] + (k * 0.5 + 0.5) * 0.5 * 0.995;
          this.v(x, y, z, nn[0], nn[1], nn[2], uu, vv, cc);
        }
      }
      for (let i = 0; i < segs; i++) { const a = base + i * 2; this.t(a, a + 2, a + 3); this.t(a, a + 3, a + 1); }
    }
    geo() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setIndex(this.nv > 65535 ? new THREE.Uint32BufferAttribute(this.ix, 1) : new THREE.Uint16BufferAttribute(this.ix, 1));
      g.computeBoundingSphere(); g.userData.shared = true;
      return g;
    }
    get tris() { return this.ix.length / 3; }
  }

  // ===================================================================== tree models
  // Linear needle colours (multiplied by the atlas for cards, used directly by the opaque tiers).
  const TRUNK = [0.06, 0.045, 0.036];   // bark colour where distant trunks share the tier material
  const GREEN = { spruce: [0.030, 0.050, 0.036], fir: [0.024, 0.044, 0.038], pine: [0.040, 0.058, 0.034] };
  // One branch tier (a whorl): P drooping branch lobes radiating from the trunk. Each lobe is a ridged strip
  // (top surface only; the material is double-sided and treats back faces as the dark underside).
  // Returns the branches ({ a, L, y0, rise, droop }) so cards can follow them.
  function lobes(g, cx, y, cz, R, P, up, droop, col, rnd, far, wk) {
    const a0 = rnd() * TAU, out = [];
    const ts = far > 1 ? [0, 0.6] : far ? [0, 0.55, 1] : [0, 0.45, 1];
    const wf = far > 1 ? [0.1, 0.36] : far ? [0.07, 0.3, 0.05] : [0.07, 0.27, 0.06];
    for (let k = 0; k < P; k++) {
      const a = a0 + k / P * TAU + (rnd() - 0.5) * (TAU / P) * 0.5;
      const L = R * (0.72 + rnd() * 0.4) * (far > 1 ? 1.5 : far ? 1.12 : 1), rise = up * (0.6 + rnd() * 0.8), dr = droop * (0.75 + rnd() * 0.5);
      const ca = Math.cos(a), sa = Math.sin(a), px = -sa, pz = ca;
      const v0 = g.nv, i0 = g.ix.length, rows = [];
      ts.forEach((t, i) => {
        const r = 0.06 + L * t, yc = y + L * (rise * t - dr * t * t), w = L * wf[i] * (wk / 0.6) * (0.85 + rnd() * 0.3), th = L * 0.07 * (1 - t) + 0.025;
        const sh = 0.5 + 0.5 * t, cC = [col[0] * sh, col[1] * sh, col[2] * sh], cE = [col[0] * sh * 0.78, col[1] * sh * 0.78, col[2] * sh * 0.78];
        const bx = cx + ca * r, bz = cz + sa * r;
        rows.push([g.v(bx - px * w, yc - th * 0.5, bz - pz * w, 0, 1, 0, 0, 0, cE), g.v(bx, yc + th * 0.5, bz, 0, 1, 0, 0, 0, cC), g.v(bx + px * w, yc - th * 0.5, bz + pz * w, 0, 1, 0, 0, 0, cE)]);
      });
      for (let i = 0; i < rows.length - 1; i++) { const A = rows[i], B = rows[i + 1]; g.t(A[0], B[1], B[0]); g.t(A[0], A[1], B[1]); g.t(A[1], B[2], B[1]); g.t(A[1], A[2], B[2]); }
      g.smooth(v0, i0, 0.25);
      out.push({ a, L, rise, dr });
    }
    return out;
  }
  function stubs(g, H, from, to, n, rnd, rad) {
    for (let i = 0; i < n; i++) {
      const y = from + Math.pow(rnd(), 0.6) * (to - from), a = rnd() * TAU, l = 0.12 + rnd() * 0.3 * (y - from) / Math.max(0.1, to - from) + 0.05, r = rad(y);
      g.tube([{ x: Math.cos(a) * r * 0.6, y, z: Math.sin(a) * r * 0.6, r: 0.018 }, { x: Math.cos(a) * (r + l), y: y - l * 0.45, z: Math.sin(a) * (r + l), r: 0.004 }], 3, [0.62, 0.58, 0.55]);
    }
  }
  // conifer: spruce (droopy, ragged), fir (dense, upturned), sapling (branches to the ground)
  function conifer(p, lod, seed) {
    const rnd = U.rng(seed), mass = new GB(), cards = new GB(), bark = lod ? mass : new GB();
    const H = p.H, cb = p.cb, col = GREEN[p.kind] || GREEN.spruce;
    const trR = (y) => p.tr * Math.pow(Math.max(0, 1 - y / H), 0.9) + 0.015 + p.tr * 0.35 * Math.exp(-Math.max(0, y) * 4);
    // trunk
    const tp = [];
    const rings = lod > 1 ? 2 : lod ? 3 : 7;
    for (let i = 0; i <= rings; i++) { const y = -0.2 + (H * 0.97 + 0.2) * Math.pow(i / rings, 1.1); tp.push({ x: Math.sin(y * 0.37 + seed) * 0.03, y, z: Math.cos(y * 0.29 + seed) * 0.03, r: trR(Math.max(0, y)) }); }
    bark.tube(tp, lod > 1 ? 4 : lod ? 5 : 8, lod ? TRUNK : [1, 1, 1], p.tr);
    if (!lod && p.stubs) stubs(bark, H, 0.9, cb, p.stubs, rnd, trR);
    // tiers
    const step = p.sp * (lod > 1 ? 3.4 : lod ? 2.2 : 1);
    const P = lod > 1 ? 3 : lod ? Math.max(4, p.tips - 3) : p.tips;
    for (let y = cb; y < H - 0.35; y += step * (0.85 + rnd() * 0.3)) {
      const rel = (y - cb) / Math.max(0.1, H - cb);
      const R = (p.R * Math.pow(1 - rel, p.shape || 1) + 0.12) * (0.88 + rnd() * 0.24) * (lod > 1 ? 1.22 : lod ? 1.1 : 1);
      const ao = 0.55 + 0.45 * rel;
      const c = [col[0] * ao, col[1] * ao, col[2] * ao];
      const br = lobes(mass, 0, y, 0, R, P, p.up, p.droop, c, rnd, lod, p.wk);
      if (!lod) {
        br.forEach(({ a, L, rise, dr }) => {
          const CL = L * (1.22 + rnd() * 0.15), d = new THREE.Vector3(Math.cos(a), rise * 0.9, Math.sin(a)).normalize();
          const s0 = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).applyAxisAngle(d, (rnd() - 0.5) * 0.5);
          const Wd = Math.min(1.4, Math.max(0.35, CL * p.wk));
          const o = { x: 0, y: y - 0.02, z: 0 };
          const nf = (x, yy, z) => { const rr = Math.hypot(x, z) || 1; return [x / rr * 0.75, 0.75, z / rr * 0.75]; };
          const cf = (t) => { const k = (0.5 + 0.5 * t) * (0.75 + 0.25 * rel); return [k, k, k]; };
          cards.card(o, d, s0, CL, Wd, 2, CL * dr * 0.85, p.cell || 0, cf, nf, false);
        });
      }
    }
    // leader
    mass.tube([{ x: 0, y: H - 0.6, z: 0, r: 0.16 }, { x: 0, y: H - 0.2, z: 0, r: 0.08 }, { x: 0, y: H + 0.25, z: 0, r: 0.01 }], 5, [col[0] * 1.1, col[1] * 1.1, col[2] * 1.1]);
    return { bark: lod ? null : bark.geo(), mass: mass.geo(), cards: cards.nv ? cards.geo() : null, tris: (lod ? 0 : bark.tris) + mass.tris + cards.tris };
  }
  // pine: tall bare trunk, a few irregular crown pads up top
  function pine(p, lod, seed) {
    const rnd = U.rng(seed), mass = new GB(), cards = new GB(), bark = lod ? mass : new GB();
    const H = p.H, col = GREEN.pine;
    const trR = (y) => p.tr * Math.pow(Math.max(0, 1 - y / H), 0.7) + 0.02 + p.tr * 0.3 * Math.exp(-Math.max(0, y) * 4);
    const tp = [], rings = lod ? 3 : 8, lean = (rnd() - 0.5) * 0.04;
    const orange = (y) => { const k = clamp((y - H * 0.45) / (H * 0.3), 0, 1), c = [1 + k * 0.45, 1 + k * 0.05, 1 - k * 0.2]; return lod ? [TRUNK[0] * c[0], TRUNK[1] * c[1], TRUNK[2] * c[2]] : c; };
    for (let i = 0; i <= rings; i++) { const y = -0.2 + (H * 0.96 + 0.2) * i / rings; tp.push({ x: lean * y + Math.sin(y * 0.5) * 0.05, y, z: Math.sin(y * 0.3) * 0.04, r: trR(Math.max(0, y)), c: orange(y) }); }
    bark.tube(tp, lod ? 5 : 8, lod ? TRUNK : [1, 1, 1], p.tr);
    if (!lod) stubs(bark, H, 1.2, p.cb, 10, rnd, trR);
    const pads = lod > 1 ? 3 : lod ? 4 : 7;
    for (let i = 0; i < pads; i++) {
      const top = i === pads - 1;
      const y = top ? H - 0.9 : p.cb + (H - p.cb - 1.2) * (i / (pads - 1)) + (rnd() - 0.5) * 0.4;
      const a = rnd() * TAU, dist = top ? 0 : 0.5 + rnd() * 1.2 * (1 - i / pads * 0.5), cx = Math.cos(a) * dist + lean * y, cz = Math.sin(a) * dist;
      const R = top ? 1.1 : 0.85 + rnd() * 0.6;
      if (!top) bark.tube([{ x: lean * y, y: y - 0.5, z: 0, r: 0.07 }, { x: cx * 0.7, y: y - 0.15, z: cz * 0.7, r: 0.05 }, { x: cx, y, z: cz, r: 0.03 }], lod ? 3 : 4, orange(y));
      const br = lobes(mass, cx, y, cz, R * (lod > 1 ? 1.2 : 1), lod > 1 ? 3 : lod ? 5 : 8, 0.3, 0.25, col, rnd, lod, 0.8);
      if (!lod) br.forEach(({ a: aa, L }) => {
        const d = new THREE.Vector3(Math.cos(aa), 0.2, Math.sin(aa)).normalize(), s0 = new THREE.Vector3(-Math.sin(aa), 0.3, Math.cos(aa)).normalize();
        const nf = (x, yy, z) => { const dx = x - cx, dz = z - cz, rr = Math.hypot(dx, dz) || 1; return [dx / rr * 0.7, 0.8, dz / rr * 0.7]; };
        cards.card({ x: cx, y: y + 0.02, z: cz }, d, s0, L * 1.35, L * 0.85, 1, 0.12, 1, [0.9, 0.9, 0.9], nf, rnd() < 0.5);
      });
    }
    return { bark: lod ? null : bark.geo(), mass: mass.geo(), cards: cards.nv ? cards.geo() : null, tris: (lod ? 0 : bark.tris) + mass.tris + cards.tris };
  }
  // winter birch: white trunk, bare limbs, twig sprays
  function birch(p, lod, seed) {
    const rnd = U.rng(seed), bark = new GB(), cards = new GB();
    const H = p.H, lean = (rnd() - 0.5) * 0.35;
    const at = (y) => ({ x: lean * y * y / H * 0.3 + Math.sin(y * 0.9 + seed) * 0.05, z: Math.sin(y * 0.5) * 0.05 });
    const rad = (y) => 0.15 * Math.pow(Math.max(0, 1 - y / H), 0.85) + 0.012 + 0.05 * Math.exp(-Math.max(0, y) * 6);
    const tp = [];
    const rings = lod ? 3 : 7;
    for (let i = 0; i <= rings; i++) { const y = -0.1 + (H + 0.1) * i / rings, c = at(y); tp.push({ x: c.x, y, z: c.z, r: rad(Math.max(0, y)) }); }
    bark.tube(tp, lod ? 5 : 8, [1, 1, 1], 0.15);
    const nb = lod > 1 ? 4 : lod ? 6 : 9;
    for (let b = 0; b < nb; b++) {
      const y = H * (0.36 + 0.52 * b / nb) + (rnd() - 0.5) * 0.4, a = b * 2.4 + rnd() * 0.6, L = (1.6 + rnd() * 1.6) * (1 - (y / H - 0.36) * 0.7);
      const c = at(y), dx = Math.cos(a), dz = Math.sin(a), rise = 0.75 + rnd() * 0.5;
      const bp = [];
      for (let i = 0; i <= 3; i++) { const t = i / 3; bp.push({ x: c.x + dx * L * t, y: y + L * t * rise * (0.6 + t * 0.4), z: c.z + dz * L * t + Math.sin(t * 3) * 0.05, r: 0.05 * (1 - t * 0.8) }); }
      bark.tube(bp, lod ? 3 : 5, [0.75, 0.72, 0.7]);
      if (!lod) for (let k = 0; k < 2; k++) {
        const t = 0.4 + k * 0.3, px = c.x + dx * L * t, py = y + L * t * rise * (0.6 + t * 0.4), pz = c.z + dz * L * t, a2 = a + (k ? 0.8 : -0.8), l2 = L * 0.45;
        bark.tube([{ x: px, y: py, z: pz, r: 0.022 }, { x: px + Math.cos(a2) * l2, y: py + l2 * 0.6, z: pz + Math.sin(a2) * l2, r: 0.006 }], 3, [0.55, 0.45, 0.42]);
      }
      // twig sprays around the outer half of each limb
      const nc = lod ? 1 : 3;
      for (let k = 0; k < nc; k++) {
        const t = lod ? 0.55 : 0.35 + k * 0.25, px = c.x + dx * L * t, py = y + L * t * rise * (0.6 + t * 0.4), pz = c.z + dz * L * t;
        const sz = (1.3 + rnd() * 0.6) * (lod ? 1.6 : 1);
        const d = new THREE.Vector3(dx, rise * 0.8 + 0.3, dz).normalize();
        const nf = (x, yy, z) => { const rr = Math.hypot(x, z) || 1; return [x / rr * 0.8, 0.6, z / rr * 0.8]; };
        [0, Math.PI / 2].forEach((roll) => { const s = new THREE.Vector3(-dz, 0, dx).applyAxisAngle(d, roll + (rnd() - 0.5) * 0.4); cards.card({ x: px, y: py, z: pz }, d, s, sz, sz * 0.9, 1, 0.05, 2, [1, 1, 1], nf, rnd() < 0.5); });
      }
    }
    // a crown of fine twigs at the top
    const ct = at(H * 0.92);
    for (let k = 0; k < (lod ? 2 : 4); k++) { const a = rnd() * TAU, d = new THREE.Vector3(Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35).normalize(), s = new THREE.Vector3(Math.cos(a + 1.6), 0, Math.sin(a + 1.6)); cards.card({ x: ct.x, y: H * 0.86, z: ct.z }, d, s, 1.8, 1.5, 1, 0, 2, [1, 1, 1], (x, yy, z) => [x, 0.8, z], rnd() < 0.5); }
    return { bark: bark.geo(), mass: null, cards: cards.geo(), tris: bark.tris + cards.tris };
  }
  // dead snag: broken top, a few grey branches, root flare
  function snag(p, lod, seed) {
    const rnd = U.rng(seed), g = new GB(), H = p.H, lean = (rnd() - 0.5) * 0.12;
    const tp = [];
    for (let i = 0; i <= (lod ? 3 : 6); i++) { const t = i / (lod ? 3 : 6), y = -0.15 + (H + 0.15) * t; tp.push({ x: lean * y, y, z: Math.sin(y + seed) * 0.03, r: 0.24 * (1 - t * 0.55) + 0.07 * Math.exp(-Math.max(0, y) * 5) }); }
    g.tube(tp, lod ? 5 : 8, [1, 1, 1], 0.24, { y: -0.3, c: [0.8, 0.74, 0.68] });
    const nb = lod ? 3 : p.br;
    for (let b = 0; b < nb; b++) {
      const y = H * (0.3 + 0.62 * b / nb), a = b * 2.3 + rnd(), L = 0.6 + rnd() * 1.4, x0 = lean * y, r = 0.2 * (1 - y / H * 0.55);
      const dx = Math.cos(a), dz = Math.sin(a);
      g.tube([{ x: x0 + dx * r * 0.6, y, z: dz * r * 0.6, r: 0.055 }, { x: x0 + dx * (r + L * 0.6), y: y + L * 0.2, z: dz * (r + L * 0.6), r: 0.03 }, { x: x0 + dx * (r + L), y: y + L * 0.15 - rnd() * 0.3, z: dz * (r + L), r: 0.01 }], lod ? 3 : 4, [0.85, 0.82, 0.8]);
    }
    if (!lod) for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + rnd(); g.tube([{ x: Math.cos(a) * 0.15, y: 0.3, z: Math.sin(a) * 0.15, r: 0.09 }, { x: Math.cos(a) * 0.55, y: -0.05, z: Math.sin(a) * 0.55, r: 0.03 }], 4, [0.8, 0.76, 0.72]); }
    return { bark: g.geo(), mass: null, cards: null, tris: g.tris };
  }

  // Variants. bark: forest bark material name. Heights are model heights; instances scale them.
  const SPEC = [
    { id: 'spruceA', fn: conifer, bark: 'barkPine', p: { kind: 'spruce', H: 12, cb: 4.2, R: 2.0, sp: 0.62, tips: 7, up: 0.2, droop: 0.42, tr: 0.25, wk: 0.62, stubs: 9, shape: 0.95 } },
    { id: 'spruceB', fn: conifer, bark: 'barkPine', p: { kind: 'spruce', H: 12, cb: 4.8, R: 1.8, sp: 0.7, tips: 6, up: 0.16, droop: 0.5, tr: 0.24, wk: 0.58, stubs: 11, shape: 0.9 } },
    { id: 'spruceHi', fn: conifer, bark: 'barkPine', p: { kind: 'spruce', H: 12, cb: 5.6, R: 1.7, sp: 0.66, tips: 7, up: 0.18, droop: 0.45, tr: 0.25, wk: 0.6, stubs: 12, shape: 0.95 } },
    { id: 'firA', fn: conifer, bark: 'barkPine', p: { kind: 'fir', H: 11, cb: 3.9, R: 2.0, sp: 0.58, tips: 7, up: 0.3, droop: 0.2, tr: 0.22, wk: 0.66, stubs: 7, shape: 0.85 } },
    { id: 'firHi', fn: conifer, bark: 'barkPine', p: { kind: 'fir', H: 11, cb: 5.0, R: 1.8, sp: 0.6, tips: 7, up: 0.3, droop: 0.22, tr: 0.22, wk: 0.64, stubs: 10, shape: 0.85 } },
    { id: 'pineA', fn: pine, bark: 'barkPine', p: { H: 14, cb: 8.6, tr: 0.24 } },
    { id: 'pineB', fn: pine, bark: 'barkPine', p: { H: 13, cb: 7.4, tr: 0.22 } },
    { id: 'birchA', fn: birch, bark: 'barkBirch', p: { H: 11 } },
    { id: 'birchB', fn: birch, bark: 'barkBirch', p: { H: 12.5 } },
    { id: 'snagA', fn: snag, bark: 'barkDead', p: { H: 6.5, br: 6 } },
    { id: 'snagB', fn: snag, bark: 'barkDead', p: { H: 3.8, br: 3 } },
    { id: 'sapA', fn: conifer, bark: 'barkPine', p: { kind: 'fir', H: 1.5, cb: 0.12, R: 0.62, sp: 0.2, tips: 6, up: 0.25, droop: 0.35, tr: 0.04, wk: 0.62, stubs: 0, shape: 1 } },
    { id: 'sapB', fn: conifer, bark: 'barkPine', p: { kind: 'spruce', H: 2.8, cb: 0.2, R: 1.0, sp: 0.3, tips: 7, up: 0.2, droop: 0.42, tr: 0.07, wk: 0.6, stubs: 0, shape: 1 } },
    { id: 'spruceLo', fn: conifer, bark: 'barkPine', p: { kind: 'spruce', H: 12, cb: 1.6, R: 2.1, sp: 0.66, tips: 7, up: 0.2, droop: 0.45, tr: 0.25, wk: 0.6, stubs: 3, shape: 0.95 } },
  ];
  const VI = {}; SPEC.forEach((s, i) => { VI[s.id] = i; });
  let MODELS = null;
  function models() {
    if (MODELS) return MODELS;
    const t0 = performance.now();
    MODELS = SPEC.map((s, i) => ({ lods: [0, 1, 2].map((l) => s.fn(s.p, l, 1000 + i * 37)), spec: s }));
    Fl.stats.modelMs = Math.round(performance.now() - t0);
    Fl.stats.tris = MODELS.map((m) => m.spec.id + ':' + m.lods.map((l) => l.tris).join('/')).join(' ');
    return MODELS;
  }

  // ===================================================================== placement
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), YAX = new THREE.Vector3(0, 1, 0);
  function inst(list, v, x, z, H, rot, sx, extra) {
    const spec = SPEC[v], s = H / spec.p.H, y = R3.Terrain.bed(x, z) - 0.06;
    tmpQ.setFromAxisAngle(YAX, rot);
    if (extra && extra.tilt) tmpQ.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(extra.tilt[0], 0, extra.tilt[1])));
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, s, sx));
    const r = Math.max(H * 0.55, 2.2 * sx);
    const c = (extra && extra.c) || [1, 1, 0.5], bk = (extra && extra.bark) || 0.88 + c[0] * 0.12;
    list.push({ v, x, y, z, cy: y + H * 0.55, r, m: Float32Array.from(tmpM.elements), c, bc: [bk, bk, bk], belt: !!(extra && extra.belt), small: H < 3.5 });
  }
  function seedOf() { const s = NW.G && NW.G.state; return s ? s.seed | 0 : 1; }
  // every tree of the world plus understory and belt
  function gather() {
    const seed = seedOf(), out = [];
    const T = W.T;
    for (let ay = 0; ay < 5; ay++) for (let ax = 0; ax < 5; ax++) {
      const id = D.areaId(ax, ay), a = W.get(id), ox = ax * AW, oz = ay * AH, lm = a.lm;
      // some stretches are choked with young firs, others are open stands of tall trunks
      const under = 0.35 + U.rng(U.hash(seed, ax, ay, 6161))() * 1.3;
      const tileAt = (tx, ty) => W.tile(a, tx, ty);
      const trailNear = (tx, ty, r) => { for (let q = -r; q <= r; q++) for (let p = -r; p <= r; p++) { const t = tileAt(tx + p, ty + q); if (t === T.DIRT || t === T.BRIDGE || t === T.BUILDING || t === T.DOCK || t === T.STONES || t === T.FORD) return true; } return false; };
      a.objs.forEach((o, oi) => {
        if (o.type !== 'tree') return;
        const r = U.rng(U.hash(seed, ax * 7 + ay * 131, oi, 5151));
        const x = ox + o.x * K, z = oz + (o.y - 3) * K, tx = Math.floor(o.x / 16), ty = Math.floor((o.y - 3) / 16);
        const nearT = trailNear(tx, ty, 2), edge = tx < 2 || ty < 2 || tx > 27 || ty > 14;
        const sizeH = [9.5, 13, 16.5][o.size || 0] + (r() - 0.5) * 2.6;
        const rot = r() * TAU, k = r();
        let v, H = sizeH, c = [0.86 + r() * 0.28, 0.8 + r() * 0.45, r()];
        if (o.kind === 'birch') { v = r() < 0.5 ? VI.birchA : VI.birchB; H = 9 + r() * 4.5; c = [0.95 + r() * 0.1, 0.4 + r() * 0.5, 0.5]; }
        else if (lm === 'burned') {
          if (k < 0.7) { v = r() < 0.6 ? VI.snagA : VI.snagB; H = SPEC[v].p.H * (0.8 + r() * 0.5); c = [0.3 + r() * 0.1, 0.9, 0.5]; }
          else v = nearT ? VI.spruceHi : VI.spruceB;
        } else if (k < 0.07 && !edge) { v = r() < 0.5 ? VI.birchA : VI.birchB; H = 9 + r() * 4; c = [0.95 + r() * 0.1, 0.5 + r() * 0.5, 0.5]; }
        else if (k < 0.2) v = r() < 0.5 ? VI.pineA : VI.pineB;
        else if (k < 0.42) v = nearT ? VI.firHi : VI.firA;
        else if (nearT) v = VI.spruceHi;
        else v = r() < 0.5 ? VI.spruceA : VI.spruceB;
        if (v === VI.pineA || v === VI.pineB) H = Math.max(H, 12.5) + r() * 3;
        const s = H / SPEC[v].p.H, sx = Math.pow(s, 0.7) * (0.88 + r() * 0.24);
        inst(out, v, x, z, H, rot, sx, { c, bark: lm === 'burned' && (v === VI.snagA || v === VI.snagB) ? c[0] : null });
        // young firs gather at the feet of the big trees away from the trails
        if (!nearT && lm !== 'burned' && lm !== 'cabin' && r() < (edge ? 0.55 : 0.22) * under) {
          const a2 = r() * TAU, d2 = 0.9 + r() * 0.9, sx2 = x + Math.cos(a2) * d2, sz2 = z + Math.sin(a2) * d2;
          const ttx = Math.floor((sx2 - ox) / TM), tty = Math.floor((sz2 - oz) / TM);
          if (!trailNear(ttx, tty, 2) && W.tile(a, ttx, tty) === T.GRASS) { const vs = r() < 0.5 ? VI.sapA : VI.sapB, hh = SPEC[vs].p.H * (0.7 + r() * 0.6); inst(out, vs, sx2, sz2, hh, r() * TAU, hh / SPEC[vs].p.H * (0.85 + r() * 0.3), { c: [0.9 + r() * 0.2, 1.05 + r() * 0.3, r()] }); }
        }
      });
    }
    // belt beyond the world edge (same layout rule as the old belt so the outer terrain still fits)
    const rnd = U.rng(U.hash(seed, 4242));
    const inRect = (x, z, m) => x > -m && x < 120 + m && z > -m && z < 68 + m;
    const creekX = Fl.creekX || [87.6, 87.6];
    const nearCreek = (x, z) => (z < 0 && Math.abs(x - creekX[0]) < 2.6) || (z > 68 && Math.abs(x - creekX[1]) < 2.6);
    for (let z = -40; z < 108; z += 2.4) for (let x = -40; x < 160; x += 2.4) {
      const px = x + (rnd() - 0.5) * 2.2, pz = z + (rnd() - 0.5) * 2.2;
      if (inRect(px, pz, 0.6) || nearCreek(px, pz)) { rnd(); rnd(); rnd(); rnd(); continue; }
      const d = Math.hypot(px < 0 ? -px : px > 120 ? px - 120 : 0, pz < 0 ? -pz : pz > 68 ? pz - 68 : 0);
      if (rnd() > (d < 14 ? 0.72 : 0.72 - (d - 14) / 30)) { rnd(); rnd(); rnd(); continue; }
      const k = rnd(), H = 9 + rnd() * 9, rot = rnd() * TAU;
      const v = d < 4 ? (k < 0.4 ? VI.spruceLo : k < 0.7 ? VI.firA : k < 0.85 ? VI.spruceA : VI.pineA) : (k < 0.55 ? VI.spruceLo : k < 0.8 ? VI.firA : k < 0.92 ? VI.spruceA : VI.pineB);
      const s = H / SPEC[v].p.H;
      inst(out, v, px, pz, H, rot, Math.pow(s, 0.7) * (0.9 + rnd() * 0.2), { c: [0.85 + rnd() * 0.25, 0.85 + rnd() * 0.4, rnd()], belt: true });
      if (d < 10 && rnd() < 0.35) { const vs = rnd() < 0.5 ? VI.sapA : VI.sapB, hh = SPEC[vs].p.H * (0.7 + rnd() * 0.6); inst(out, vs, px + 1.1, pz - 0.6, hh, rnd() * TAU, hh / SPEC[vs].p.H, { c: [1, 1.2, rnd()], belt: true }); }
    }
    return out;
  }

  // ===================================================================== world-wide instanced drawing
  const CELL = 10;
  Fl.build = function () {
    const t0 = performance.now();
    const M = models();
    const list = gather();
    const group = new THREE.Group(); group.name = 'flora';
    // capacity per variant
    const cap = new Array(SPEC.length).fill(0);
    list.forEach((it) => { cap[it.v]++; });
    const meshes = [];   // [variant][lod] -> [{ mesh, kind }]
    const mk = (geo, mat, n, name, shadow) => {
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3).fill(1), 3);
      m.count = 0; m.visible = false; m.frustumCulled = false; m.castShadow = !!shadow; m.receiveShadow = true; m.name = name;
      group.add(m); return m;
    };
    SPEC.forEach((s, v) => {
      const n = cap[v], set = [[], [], []];
      if (n) [0, 1, 2].forEach((lod) => {
        const md = M[v].lods[lod];
        if (md.bark) { const bm = mk(md.bark, barkMat(s.bark), n, 'fl:' + s.id + ':bark' + lod, true); bm.userData.bark = true; set[lod].push(bm); }
        if (md.mass) set[lod].push(mk(md.mass, Fl.massMat(), n, 'fl:' + s.id + ':mass' + lod, true));
        if (md.cards) set[lod].push(mk(md.cards, Fl.cardMat(), n, 'fl:' + s.id + ':cards' + lod, false));
      });
      meshes.push(set);
    });
    // spatial grid
    const grid = new Map();
    list.forEach((it) => { const k = Math.floor(it.x / CELL) + ',' + Math.floor(it.z / CELL); let c = grid.get(k); if (!c) grid.set(k, c = { x: (Math.floor(it.x / CELL) + 0.5) * CELL, z: (Math.floor(it.z / CELL) + 0.5) * CELL, y: 0, items: [] }); c.items.push(it); c.y += it.cy; });
    const cells = [...grid.values()]; cells.forEach((c) => { c.y /= c.items.length; });
    const fr = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere();
    const fill = new Array(SPEC.length).fill(null).map(() => [0, 0, 0]);
    let lastKey = '';
    Fl.stats.instances = list.length; Fl.stats.buildMs = Math.round(performance.now() - t0);
    function update(cam, force) {
      const q = R3.q(), LD = ({ low: [17, 34], medium: [24, 44], high: [34, 60] })[(NW.settings && NW.settings.quality) || 'medium'] || [24, 44];
      const far = q.drawDist || 85;
      cam.updateMatrixWorld();
      const e = cam.matrixWorld.elements;
      const key = [e[12], e[13], e[14], e[8], e[9], e[10]].map((v) => Math.round(v * 40)).join(',') + '|' + cam.fov + '|' + cam.aspect.toFixed(2) + '|' + far;
      if (!force && key === lastKey) return;
      lastKey = key;
      pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr.setFromProjectionMatrix(pm);
      const cx = e[12], cz = e[14];
      fill.forEach((f) => { f[0] = 0; f[1] = 0; f[2] = 0; });
      const n2 = LD[0] * LD[0], m2 = LD[1] * LD[1], far2 = far * far, sap2 = 34 * 34;
      let shown = 0;
      for (const c of cells) {
        const dx = c.x - cx, dz = c.z - cz;
        if (dx * dx + dz * dz > (far + CELL) * (far + CELL)) continue;
        sph.center.set(c.x, c.y, c.z); sph.radius = CELL * 0.75 + 12;
        if (!fr.intersectsSphere(sph)) continue;
        for (const it of c.items) {
          const ex = it.x - cx, ez = it.z - cz, d2 = ex * ex + ez * ez;
          if (d2 > far2 || (it.small && d2 > sap2)) continue;
          sph.center.set(it.x, it.cy, it.z); sph.radius = it.r;
          if (!fr.intersectsSphere(sph)) continue;
          const lod = d2 < n2 ? 0 : d2 < m2 ? 1 : 2, set = meshes[it.v][lod], n = fill[it.v][lod]++;
          for (let k = 0; k < set.length; k++) { const m = set[k], c = m.userData.bark ? it.bc : it.c; m.instanceMatrix.array.set(it.m, n * 16); const ca = m.instanceColor.array; ca[n * 3] = c[0]; ca[n * 3 + 1] = c[1]; ca[n * 3 + 2] = c[2]; }
          shown++;
        }
      }
      meshes.forEach((set, v) => set.forEach((ms, lod) => ms.forEach((m) => {
        const n = fill[v][lod];
        m.count = n; m.visible = n > 0;
        if (n) { m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, n * 16); m.instanceMatrix.needsUpdate = true; m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, n * 3); m.instanceColor.needsUpdate = true; }
      })));
      Fl.stats.shown = shown;
    }
    return { group, update, list };
  };
  Fl.models = models;
  Fl.SPEC = SPEC;
})(window.NW);
