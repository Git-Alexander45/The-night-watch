'use strict';
// Creatures: people (visitors, guests, NPCs), wildlife, Juniper, the night monsters and the first-person
// viewmodel. Everything is generated in code: shaped swept surfaces (lofted rings with per-ring
// superellipse sections and sculpting functions) skinned to small procedural skeletons. Each creature is
// one SkinnedMesh per material sharing one skeleton, so it costs a handful of draw calls while every limb
// animates. Models face +Z with their feet at the object origin (docs/R3D.md).
(function (NW) {
  const THREE = window.THREE, R3 = NW.R3;
  if (!THREE || !R3) return;
  const Cr = R3.Creatures = {};
  const V3 = THREE.Vector3;
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const gauss = (x, y) => Math.exp(-(x * x + y * y));
  function hsh(a, b, c) { const s = Math.sin(a * 127.1 + (b || 0) * 311.7 + (c || 0) * 74.7) * 43758.5453; return s - Math.floor(s); }
  function vn(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let xf = x - xi, yf = y - yi, zf = z - zi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf);
    const h = (i, j, k) => hsh(xi + i, yi + j, zi + k);
    return lerp(lerp(lerp(h(0, 0, 0), h(1, 0, 0), xf), lerp(h(0, 1, 0), h(1, 1, 0), xf), yf), lerp(lerp(h(0, 0, 1), h(1, 0, 1), xf), lerp(h(0, 1, 1), h(1, 1, 1), xf), yf), zf);
  }
  // smooth 1D noise in [-1, 1]
  const n1 = (t, s) => Math.sin(t * 1.0 + s) * 0.5 + Math.sin(t * 2.31 + s * 1.7) * 0.3 + Math.sin(t * 4.13 + s * 3.1) * 0.2;
  function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
  const _c = new THREE.Color();
  function rgb(h, m) {
    if (m == null) m = 1;
    if (Array.isArray(h)) return [h[0] * m, h[1] * m, h[2] * m];
    try { _c.set(h == null ? 0x808080 : h); } catch (e) { _c.set(0x808080); }
    return [_c.r * m, _c.g * m, _c.b * m];
  }
  const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const lum = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;

  // ------------------------------------------------------------------ geometry kit
  // GB accumulates vertices (position, normal, uv, colour, skin weights) from swept surfaces.
  function GB(skin) { this.P = []; this.N = []; this.U = []; this.C = []; this.SI = []; this.SW = []; this.I = []; this.skin = !!skin; }
  function normW(bw) {
    if (typeof bw === 'number') return [bw, 0, 0, 0, 1, 0, 0, 0];
    const m = {};
    bw.forEach(([b, w]) => { if (w > 1e-4) m[b] = (m[b] || 0) + w; });
    const a = Object.keys(m).map((k) => [+k, m[k]]).sort((x, y) => y[1] - x[1]).slice(0, 4);
    if (!a.length) a.push([0, 1]);
    const s = a.reduce((q, x) => q + x[1], 0);
    const out = [0, 0, 0, 0, 0, 0, 0, 0];
    a.forEach((x, i) => { out[i] = x[0]; out[4 + i] = x[1] / s; });
    return out;
  }
  const _m3 = new THREE.Matrix3(), _p = new V3(), _n = new V3();
  // pts: [{ p:[x,y,z], w (side radius), d (front radius), e (superellipse exponent), ref }]
  // o: n, ref (front direction), cap0/cap1 (rounded cap length, 0 = flat, false = open), arc ([a0,a1] or fn(i,s)),
  //    mod(th, s, i, base) radius multiplier, color (hex|[r,g,b]|fn(p, th, s, i, n)), bone (idx|fn(p, th, s, i)),
  //    vary (colour noise), flip, uvs (uv units per metre), loop (closed path), mat (Matrix4), jit (fn(p)->offset)
  GB.prototype.sweep = function (pts, o) {
    o = o || {};
    const n = o.n || 12;
    let R = pts.map((q) => ({ c: new V3().fromArray(q.p), w: q.w, d: q.d == null ? q.w : q.d, e: q.e || 2, ref: q.ref || null }));
    const tanAt = (L, i) => {
      if (o.loop) { const k = L.length - 1; const a = L[(i - 1 + k) % k].c, b = L[(i + 1) % k].c; return new V3().subVectors(b, a).normalize(); }
      const a = L[Math.max(0, i - 1)].c, b = L[Math.min(L.length - 1, i + 1)].c; return new V3().subVectors(b, a).normalize();
    };
    if (!o.loop) {
      const cap = (end) => {
        const cl = end ? o.cap1 : o.cap0;
        if (cl === false) return;
        const i0 = end ? R.length - 1 : 0, r0 = R[i0], T = tanAt(R, i0).multiplyScalar(end ? 1 : -1);
        if (r0.w < 1e-5 && r0.d < 1e-5) return;
        const len = cl == null ? Math.min(r0.w, r0.d) * 0.8 : cl;
        const m = len > 0 ? 3 : 1, add = [];
        for (let k = 1; k <= m; k++) {
          const a = (PI / 2) * k / m;
          add.push({ c: r0.c.clone().addScaledVector(T, len * Math.sin(a)), w: r0.w * (k === m ? 0 : Math.cos(a)), d: r0.d * (k === m ? 0 : Math.cos(a)), e: r0.e, ref: r0.ref });
        }
        if (end) R = R.concat(add); else R = add.reverse().concat(R);
      };
      cap(false); cap(true);
    }
    const NR = R.length;
    const ref0 = new V3().fromArray(o.ref || [0, 0, 1]);
    const frames = R.map((r, i) => {
      const T = tanAt(R, i);
      const ref = r.ref ? new V3().fromArray(r.ref) : ref0;
      let N = ref.clone().addScaledVector(T, -ref.dot(T));
      if (N.lengthSq() < 1e-6) { N = new V3(0, 1, 0).addScaledVector(T, -T.y); if (N.lengthSq() < 1e-6) N = new V3(1, 0, 0).addScaledVector(T, -T.x); }
      N.normalize();
      const B = new V3().crossVectors(T, N).normalize();
      return { T, N, B };
    });
    const sArr = [0];
    for (let i = 1; i < NR; i++) sArr.push(sArr[i - 1] + R[i].c.distanceTo(R[i - 1].c));
    const sTot = sArr[NR - 1] || 1;
    const W = n + 1;
    const pos = new Array(NR * W), ths = new Array(NR * W);
    let closed = !o.arc;
    for (let i = 0; i < NR; i++) {
      const r = R[i], f = frames[i], s = sArr[i] / sTot;
      let a0 = 0, a1 = TAU;
      if (o.arc) { const ar = typeof o.arc === 'function' ? o.arc(i, s) : o.arc; a0 = ar[0]; a1 = ar[1]; }
      for (let j = 0; j <= n; j++) {
        const th = a0 + (a1 - a0) * j / n + (o.rot || 0);
        const sn = Math.sin(th), cs = Math.cos(th), ex = 2 / r.e;
        const sx = Math.sign(sn) * Math.pow(Math.abs(sn), ex), cz = Math.sign(cs) * Math.pow(Math.abs(cs), ex);
        const p = r.c.clone().addScaledVector(f.B, sx * r.w).addScaledVector(f.N, cz * r.d);
        if (o.mod) { const m = o.mod(th, s, i, p); p.sub(r.c).multiplyScalar(m).add(r.c); }
        if (o.jit) { const d = o.jit(p, th, s, i); if (d) p.x += d[0], p.y += d[1], p.z += d[2]; }
        pos[i * W + j] = p; ths[i * W + j] = th;
      }
    }
    if (o.arc && typeof o.arc !== 'function' && o.arc[1] - o.arc[0] >= TAU - 1e-6) closed = true;
    const nrm = new Array(NR * W);
    const dth = new V3(), ds = new V3();
    for (let i = 0; i < NR; i++) for (let j = 0; j <= n; j++) {
      let jm = j - 1, jp = j + 1;
      if (closed) { if (jm < 0) jm = n - 1; if (jp > n) jp = 1; } else { jm = Math.max(0, jm); jp = Math.min(n, jp); }
      let im = i - 1, ip = i + 1;
      if (o.loop) { if (im < 0) im = NR - 2; if (ip > NR - 1) ip = 1; } else { im = Math.max(0, im); ip = Math.min(NR - 1, ip); }
      dth.subVectors(pos[i * W + jp], pos[i * W + jm]);
      ds.subVectors(pos[ip * W + j], pos[im * W + j]);
      const nn = new V3().crossVectors(ds, dth);
      const p = pos[i * W + j];
      const rad = new V3().subVectors(p, R[i].c);
      if (nn.lengthSq() < 1e-14 || (R[i].w < 1e-5 && R[i].d < 1e-5)) nn.copy(frames[i].T).multiplyScalar(i < NR / 2 ? -1 : 1);
      else if (nn.dot(rad) < 0) nn.negate();
      nn.normalize();
      if (o.flip) nn.negate();
      nrm[i * W + j] = nn;
    }
    // vertices
    const base = this.P.length / 3;
    const uvs = o.uvs || 1;
    if (o.mat) _m3.getNormalMatrix(o.mat);
    for (let i = 0; i < NR; i++) {
      const per = PI * (R[i].w + R[i].d) * uvs, s = sArr[i] / sTot;
      for (let j = 0; j <= n; j++) {
        const p = pos[i * W + j], nn = nrm[i * W + j], th = ths[i * W + j];
        const pa = [p.x, p.y, p.z];
        let col = typeof o.color === 'function' ? o.color(pa, th, s, i, nn) : rgb(o.color == null ? 0x888888 : o.color);
        if (o.vary) { const k = 1 + o.vary * (vn(p.x * 37, p.y * 37, p.z * 37) - 0.5) * 2; col = [col[0] * k, col[1] * k, col[2] * k]; }
        let bw = 0;
        if (this.skin) bw = typeof o.bone === 'function' ? o.bone(pa, th, s, i) : (o.bone || 0);
        _p.copy(p); _n.copy(nn);
        if (o.mat) { _p.applyMatrix4(o.mat); _n.applyMatrix3(_m3).normalize(); }
        this.P.push(_p.x, _p.y, _p.z); this.N.push(_n.x, _n.y, _n.z);
        this.U.push(j / n * per, sArr[i] * uvs); this.C.push(col[0], col[1], col[2]);
        if (this.skin) { const w = normW(bw); this.SI.push(w[0], w[1], w[2], w[3]); this.SW.push(w[4], w[5], w[6], w[7]); }
      }
    }
    // winding: make the geometric normal agree with the vertex normals
    const mi = Math.max(0, Math.floor(NR / 2) - 1), mj = Math.floor(n / 4);
    const A = pos[mi * W + mj], Bp = pos[(mi + 1) * W + mj], Cp = pos[(mi + 1) * W + mj + 1];
    const gn = new V3().crossVectors(new V3().subVectors(Bp, A), new V3().subVectors(Cp, A));
    const flipW = gn.dot(nrm[mi * W + mj]) < 0;
    for (let i = 0; i < NR - 1; i++) for (let j = 0; j < n; j++) {
      const a = base + i * W + j, b = base + (i + 1) * W + j, c = b + 1, d = a + 1;
      if (flipW) this.I.push(a, c, b, a, d, c); else this.I.push(a, b, c, a, c, d);
    }
    return this;
  };
  // ellipsoid; axis 'y' (default) or 'z'
  GB.prototype.ellip = function (c, rx, ry, rz, o) {
    o = Object.assign({ cap0: false, cap1: false }, o || {});
    const m = o.rings || 8, pts = [];
    for (let k = 0; k <= m; k++) {
      const ph = PI * k / m, al = -Math.cos(ph), r = Math.sin(ph);
      if (o.axis === 'z') pts.push({ p: [c[0], c[1], c[2] + rz * al], w: rx * r, d: ry * r });
      else pts.push({ p: [c[0], c[1] + ry * al, c[2]], w: rx * r, d: rz * r });
    }
    if (o.axis === 'z' && !o.ref) o.ref = [0, 1, 0];
    return this.sweep(pts, o);
  };
  GB.prototype.geo = function () {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    if (this.skin) { g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4)); }
    g.setIndex(this.I);
    g.computeBoundingSphere();
    return g;
  };
  GB.prototype.tris = function () { return this.I.length / 3; };

  // polyline-chain skin weights: joints J0..Jm, bones[k] owns segment k, blended over `bl` metres at joints
  function chainW(J, bones, bl) {
    const segs = [];
    for (let k = 0; k < J.length - 1; k++) { const a = new V3().fromArray(J[k]), b = new V3().fromArray(J[k + 1]); segs.push({ a, d: new V3().subVectors(b, a), len: a.distanceTo(b) }); }
    const q = new V3();
    return (p) => {
      q.fromArray(p);
      let best = 0, bu = 0, bd = 1e9;
      segs.forEach((s, k) => { let u = q.clone().sub(s.a).dot(s.d) / (s.len * s.len); u = clamp(u, 0, 1); const dd = s.a.clone().addScaledVector(s.d, u).distanceToSquared(q); if (dd < bd - 1e-9) { bd = dd; best = k; bu = u; } });
      const s = segs[best], d0 = bu * s.len, d1 = (1 - bu) * s.len;
      if (best > 0 && d0 < bl) { const t = 0.5 + 0.5 * d0 / bl; return [[bones[best], t], [bones[best - 1], 1 - t]]; }
      if (best < segs.length - 1 && d1 < bl) { const t = 0.5 + 0.5 * d1 / bl; return [[bones[best], t], [bones[best + 1], 1 - t]]; }
      return [[bones[best], 1]];
    };
  }

  // ------------------------------------------------------------------ skeletons
  function Rig(defs) {
    const r = { bones: [], b: {}, i: {}, abs: {} };
    defs.forEach(([name, par, x, y, z]) => {
      const bn = new THREE.Bone(); bn.name = name; r.abs[name] = [x, y, z];
      if (par) { const pa = r.abs[par]; bn.position.set(x - pa[0], y - pa[1], z - pa[2]); r.b[par].add(bn); } else bn.position.set(x, y, z);
      bn.userData.rest = bn.position.clone();
      r.i[name] = r.bones.length; r.bones.push(bn); r.b[name] = bn;
    });
    r.reset = () => { for (const b of r.bones) { b.position.copy(b.userData.rest); b.rotation.set(0, 0, 0); b.scale.set(1, 1, 1); } };
    return r;
  }
  // parts: [{ name, geo, mat, shadow }] ; bs: bounding sphere [x, y, z, r] in model space
  function assemble(rig, parts, bs) {
    const obj = new THREE.Group(), body = new THREE.Group();
    obj.add(body); body.add(rig.bones[0]);
    const meshes = {};
    parts.forEach((pt) => {
      const m = new THREE.SkinnedMesh(pt.geo, pt.mat);
      m.castShadow = pt.shadow !== false; m.receiveShadow = pt.shadow !== false;
      m.name = pt.name; body.add(m); meshes[pt.name] = m;
    });
    obj.updateMatrixWorld(true);
    const sk = new THREE.Skeleton(rig.bones);
    const sph = new THREE.Sphere(new V3(bs[0], bs[1], bs[2]), bs[3]);
    for (const k in meshes) { const m = meshes[k]; m.bind(sk); m.boundingSphere = sph.clone(); m.geometry.boundingSphere = sph.clone(); }
    return { obj, body, meshes, sk };
  }

  // ------------------------------------------------------------------ textures (small tileable normal maps)
  function tnoise(x, y, P) { // tileable value noise, period P lattice cells
    const xi = Math.floor(x), yi = Math.floor(y); let xf = x - xi, yf = y - yi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
    const h = (i, j) => hsh(((xi + i) % P + P) % P, ((yi + j) % P + P) % P, P);
    return lerp(lerp(h(0, 0), h(1, 0), xf), lerp(h(0, 1), h(1, 1), xf), yf);
  }
  function normalTex(key, N, k, hfn) {
    return R3.geo('crtex:' + key, () => {
      const H = new Float32Array(N * N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) H[y * N + x] = hfn(x / N, y / N);
      const cv = document.createElement('canvas'); cv.width = cv.height = N;
      const g = cv.getContext('2d'), id = g.createImageData(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = H[y * N + (x + 1) % N] - H[y * N + (x - 1 + N) % N], dy = H[((y + 1) % N) * N + x] - H[((y - 1 + N) % N) * N + x];
        let nx = -dx * k, ny = dy * k, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        const o = (y * N + x) * 4; id.data[o] = (nx * 0.5 + 0.5) * 255; id.data[o + 1] = (ny * 0.5 + 0.5) * 255; id.data[o + 2] = (nz * 0.5 + 0.5) * 255; id.data[o + 3] = 255;
      }
      g.putImageData(id, 0, 0);
      const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace || '';
      t.needsUpdate = true;
      return t;
    });
  }
  const TX = {
    fabric: () => normalTex('fabric', 128, 6, (u, v) => 0.5 * Math.abs(Math.sin(u * PI * 32)) * (0.6 + 0.4 * Math.abs(Math.sin(v * PI * 32))) + 0.6 * tnoise(u * 16, v * 16, 16)),
    knit: () => normalTex('knit', 128, 7, (u, v) => { const cu = (u * 24) % 1, cv = (v * 32 + (Math.floor(u * 24) % 2) * 0.5) % 1; return Math.sin(cu * PI) * (0.6 + 0.4 * Math.sin(cv * PI)) + 0.3 * tnoise(u * 32, v * 32, 32); }),
    fur: () => normalTex('fur', 256, 9, (u, v) => tnoise(u * 96, v * 6, 96) * 0.7 + tnoise(u * 48 + 7, v * 3, 48) * 0.6 + tnoise(u * 8, v * 8, 8) * 0.8),
    skin: () => normalTex('skin', 128, 3, (u, v) => tnoise(u * 64, v * 64, 64) * 0.5 + tnoise(u * 16, v * 16, 16) * 0.5),
    hide: () => normalTex('hide', 128, 8, (u, v) => { const a = tnoise(u * 12, v * 12, 12), b = tnoise(u * 40, v * 40, 40); return Math.pow(Math.abs(a - 0.5) * 2, 0.5) * 0.8 + b * 0.4; }),
    bark: () => normalTex('bark', 128, 8, (u, v) => tnoise(u * 48, v * 4, 48) * 0.8 + tnoise(u * 16, v * 16, 16) * 0.4),
    puff: () => R3.geo('crtex:puff', () => {
      const N = 64, cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d'), id = g.createImageData(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = (x + 0.5) / N * 2 - 1, dy = (y + 0.5) / N * 2 - 1, r = Math.hypot(dx, dy);
        const a = Math.max(0, 1 - r) ** 1.6 * (0.7 + 0.3 * tnoise(x / 8, y / 8, 8)), o = (y * N + x) * 4;
        id.data[o] = id.data[o + 1] = id.data[o + 2] = 255 * a; id.data[o + 3] = 255;
      }
      g.putImageData(id, 0, 0); const t = new THREE.CanvasTexture(cv); t.needsUpdate = true; return t;
    }),
  };
  const shareGeo = (g) => { g.userData.shared = true; return g; };

  // billboard helper: re-orients a mesh to face whichever camera renders it (the peephole/window views too)
  const _q = new THREE.Quaternion(), _s = new V3(), _wp = new V3();
  function billboard(mesh, size) {
    mesh.onBeforeRender = function (r, sc, cam) {
      this.matrixWorld.decompose(_wp, _q, _s);
      const k = (typeof size === 'function' ? size() : size) * _s.x;
      this.matrixWorld.compose(_wp, cam.getWorldQuaternion(_q), _s.set(k, k, k));
      this.modelViewMatrix.multiplyMatrices(cam.matrixWorldInverse, this.matrixWorld);
    };
    mesh.frustumCulled = false;
    return mesh;
  }
  function glowDot(color, size) {
    const g = R3.geo('cr:quad', () => shareGeo(new THREE.PlaneGeometry(1, 1)));
    const m = R3.glowMat({ color, map: TX.puff() });
    const me = new THREE.Mesh(g, m); me.renderOrder = 5;
    return billboard(me, size);
  }

  // =================================================================== HUMAN
  // Canonical figure is 1.76 m; the body group is scaled per person. Joint table (model space).
  const HJ = [
    ['root', null, 0, 0, 0], ['hips', 'root', 0, 0.96, 0], ['spine', 'hips', 0, 1.1, 0], ['chest', 'spine', 0, 1.28, 0],
    ['neck', 'chest', 0, 1.49, -0.005], ['head', 'neck', 0, 1.585, 0.0], ['jaw', 'head', 0, 1.628, -0.005],
    ['faceL', 'head', 0.068, 1.68, -0.015], ['faceR', 'head', -0.068, 1.68, -0.015],
    ['eyeL', 'faceL', 0.033, 1.683, 0.083], ['eyeR', 'faceR', -0.033, 1.683, 0.083],
    ['lidL', 'faceL', 0.033, 1.683, 0.083], ['lidR', 'faceR', -0.033, 1.683, 0.083],
    ['armL', 'chest', 0.195, 1.44, -0.005], ['foreL', 'armL', 0.228, 1.17, -0.02], ['handL', 'foreL', 0.245, 0.925, 0.0],
    ['armR', 'chest', -0.195, 1.44, -0.005], ['foreR', 'armR', -0.228, 1.17, -0.02], ['handR', 'foreR', -0.245, 0.925, 0.0],
    ['thighL', 'hips', 0.095, 0.93, 0], ['shinL', 'thighL', 0.096, 0.5, 0.012], ['footL', 'shinL', 0.095, 0.085, -0.01],
    ['thighR', 'hips', -0.095, 0.93, 0], ['shinR', 'thighR', -0.096, 0.5, 0.012], ['footR', 'shinR', -0.095, 0.085, -0.01],
  ];
  // head rings [y, w, d, zoff]
  const HR = [[1.55, 0.03, 0.032, 0.05], [1.562, 0.042, 0.047, 0.044], [1.58, 0.056, 0.068, 0.03], [1.605, 0.064, 0.084, 0.018], [1.635, 0.069, 0.093, 0.01],
    [1.665, 0.073, 0.098, 0.006], [1.69, 0.076, 0.1, 0.004], [1.72, 0.077, 0.1, 0], [1.75, 0.074, 0.095, -0.006], [1.78, 0.063, 0.081, -0.012], [1.8, 0.042, 0.056, -0.016]];
  function headMod(th, y) {
    const a = Math.atan2(Math.sin(th), Math.cos(th)), aa = Math.abs(a);
    let m = 1;
    m -= 0.05 * gauss((aa - 0.45) / 0.2, (y - 1.684) / 0.014);       // eye sockets
    m += 0.022 * gauss((aa - 0.42) / 0.32, (y - 1.708) / 0.009);     // brow ridge
    m += 0.028 * gauss((aa - 0.78) / 0.3, (y - 1.652) / 0.02);       // cheekbones
    m += 0.03 * gauss(a / 0.24, (y - 1.613) / 0.0075);               // lips
    m -= 0.012 * gauss(a / 0.3, (y - 1.598) / 0.006);                // under-lip groove
    m += 0.02 * gauss(a / 0.35, (y - 1.567) / 0.012);                // chin
    m += 0.02 * gauss((aa - 1.1) / 0.35, (y - 1.59) / 0.02);         // jaw angle
    m -= 0.025 * gauss((aa - 1.45) / 0.3, (y - 1.72) / 0.03);        // temples
    return m;
  }
  function headRingAt(y) {
    if (y <= HR[0][0]) return HR[0];
    for (let i = 0; i < HR.length - 1; i++) if (y <= HR[i + 1][0]) { const t = (y - HR[i][0]) / (HR[i + 1][0] - HR[i][0]); return [y, lerp(HR[i][1], HR[i + 1][1], t), lerp(HR[i][2], HR[i + 1][2], t), lerp(HR[i][3], HR[i + 1][3], t)]; }
    return HR[HR.length - 1];
  }
  // z of the face surface at (x, y)
  function faceZ(x, y) {
    const r = headRingAt(y), sn = clamp(x / r[1], -0.999, 0.999), th = Math.asin(sn);
    return r[3] + r[2] * Math.cos(th) * headMod(th, y);
  }
  const HP = () => (NW.S && NW.S.P) || {};
  function normApp(a) {
    a = a || {};
    return { skin: a.skin || '#d49c76', hair: a.hair || '#382014', hairStyle: a.hairStyle || 'short', hat: a.hat || 'none', hatColor: a.hatColor || '#6f1a1f',
      coat: a.coat || '#556538', pants: a.pants || '#1a253c', scarf: a.scarf || null, beard: !!a.beard, glasses: !!a.glasses, old: !!a.old, eyes: a.eyes || '#382014' };
  }

  function buildHuman(opts) {
    const app = normApp(opts.app);
    const seed = strHash(JSON.stringify(app) + (opts.npc || ''));
    const rnd = (k) => hsh(seed * 1000, k, 3.1);
    const rig = Rig(HJ), I = rig.i;
    const style = app.old ? 'wool' : ['parka', 'parka', 'wool', 'canvas'][Math.floor(rnd(1) * 4)];
    const bw = 0.93 + rnd(2) * 0.14;
    const hem = style === 'wool' ? 0.6 : style === 'canvas' ? 0.8 : 0.72;
    const skin = rgb(app.skin), coat = rgb(app.coat), pants = rgb(app.pants), hatC = rgb(app.hatColor);
    let hair = rgb(app.hair); if (app.old) hair = mixc(hair, [0.55, 0.55, 0.56], 0.55);
    const glove = rgb(['#1d1d20', '#2a2219', '#3a2c20', '#24272c'][Math.floor(rnd(3) * 4)]);
    const boot = rgb(['#2a1c12', '#1a1614', '#3a2a1a'][Math.floor(rnd(4) * 3)]);
    const puff = style === 'parka' ? (th, s, i, p) => 1 + 0.022 * Math.pow(Math.abs(Math.sin((p.y - 0.7) / 0.085 * PI)), 0.6) : null;
    const fab = new GB(true), sk = new GB(true), eye = new GB(true), snow = new GB(true), maw = new GB(true);

    // ---- torso / coat
    const TRr = [[hem, 0.2, 0.148, 0, 2.2], [0.8, 0.19, 0.14, 0, 2.2], [0.92, 0.178, 0.128, 0, 2.3], [1.02, 0.168, 0.121, 0.005, 2.3], [1.14, 0.17, 0.122, 0.008, 2.4],
      [1.26, 0.18, 0.128, 0.01, 2.6], [1.36, 0.188, 0.126, 0.008, 2.8], [1.42, 0.183, 0.116, 0, 2.8], [1.465, 0.14, 0.096, -0.005, 2.4], [1.505, 0.086, 0.078, 0, 2], [1.535, 0.074, 0.072, 0, 2]]
      .filter((r, i) => i === 0 || r[0] > hem + 0.03);
    const torsoW = (p) => {
      const y = p[1]; let w;
      if (y < 1.0) w = [[I.hips, 1]];
      else if (y < 1.2) { const t = sstep(1.0, 1.2, y); w = [[I.hips, 1 - t], [I.spine, t]]; }
      else { const t = sstep(1.2, 1.34, y); w = [[I.spine, 1 - t], [I.chest, t]]; }
      if (y < 0.9) { const k = sstep(0.92, 0.66, y) * (p[2] > 0 ? 0.6 : 0.25) * sstep(0.0, 0.07, Math.abs(p[0])); if (k > 0) { w = w.map(([b, x]) => [b, x * (1 - k)]); w.push([p[0] > 0 ? I.thighL : I.thighR, k]); } }
      return w;
    };
    const coatCol = (p, th) => {
      let c = coat;
      const front = Math.cos(th) > 0.97 && p[2] > 0;
      if (front) c = rgb(c, style === 'wool' ? 0.75 : 0.55);
      if (p[1] < hem + 0.035) c = rgb(c, 0.8);
      if (style === 'canvas' && p[2] > 0.06 && Math.abs(p[0]) > 0.06 && Math.abs(p[0]) < 0.15 && p[1] > 0.84 && p[1] < 0.97) c = rgb(c, 0.82);
      if (style === 'wool' && Math.abs(p[0] - 0.035) < 0.012 && p[2] > 0.09 && ((p[1] * 100) % 11) < 1.6) c = [0.03, 0.025, 0.02];
      return c;
    };
    fab.sweep(TRr.map((r) => ({ p: [0, r[0], r[3]], w: r[1] * bw, d: r[2] * bw, e: r[4] })), { n: 24, cap0: 0, cap1: 0.01, mod: puff, color: coatCol, bone: torsoW, vary: 0.06, uvs: 8 });
    // stand-up collar
    fab.sweep([{ p: [0, 1.49, 0], w: 0.088, d: 0.084 }, { p: [0, 1.565, 0.002], w: 0.083, d: 0.08 }], { n: 20, cap0: false, cap1: false, color: rgb(coat, 0.85), bone: (p) => [[I.chest, 0.7], [I.neck, 0.3]], uvs: 8 });
    // sleeves, gloves
    [1, -1].forEach((s) => {
      const L = s > 0 ? 'L' : 'R';
      const J = [[s * 0.15, 1.47, -0.005], [s * 0.195, 1.44, -0.005], [s * 0.228, 1.17, -0.02], [s * 0.245, 0.925, 0]];
      const sw = chainW(J, [I.chest, I['arm' + L], I['fore' + L]], 0.05);
      fab.sweep([{ p: J[0], w: 0.05 }, { p: [s * 0.198, 1.43, -0.006], w: 0.064 * bw, d: 0.062 * bw }, { p: [s * 0.213, 1.31, -0.012], w: 0.057 * bw }, { p: [s * 0.228, 1.17, -0.02], w: 0.05 * bw },
        { p: [s * 0.238, 1.05, -0.01], w: 0.047 * bw, d: 0.048 * bw }, { p: [s * 0.244, 0.955, 0], w: 0.05, d: 0.052 }, { p: [s * 0.246, 0.93, 0], w: 0.05, d: 0.052 }],
      { n: 14, cap1: 0, mod: puff, color: (p) => (p[1] < 0.965 ? rgb(coat, 0.75) : coat), bone: sw, vary: 0.06, uvs: 8 });
      // glove: flattened hand, palm facing in
      const hb = I['hand' + L];
      fab.sweep([{ p: [s * 0.247, 0.94, 0.0], w: 0.024, d: 0.031 }, { p: [s * 0.248, 0.885, 0.006], w: 0.026, d: 0.043 }, { p: [s * 0.246, 0.84, 0.01], w: 0.023, d: 0.046 }, { p: [s * 0.243, 0.79, 0.014], w: 0.019, d: 0.043 }, { p: [s * 0.238, 0.755, 0.016], w: 0.015, d: 0.036 }],
        { n: 12, cap1: 0.012, color: glove, bone: hb, vary: 0.05, uvs: 10 });
      fab.sweep([{ p: [s * 0.236, 0.885, 0.03] , w: 0.012 }, { p: [s * 0.228, 0.845, 0.05], w: 0.011 }, { p: [s * 0.226, 0.82, 0.055], w: 0.01 }], { n: 8, color: glove, bone: hb });
      // legs (trousers) and boots
      const LJ = [[s * 0.095, 1.02, 0], [s * 0.095, 0.93, 0], [s * 0.096, 0.5, 0.012], [s * 0.095, 0.085, -0.01], [s * 0.095, 0.0, 0.05]];
      const lw = chainW(LJ, [I.hips, I['thigh' + L], I['shin' + L], I['foot' + L]], 0.06);
      fab.sweep([{ p: [s * 0.092, 1.0, 0], w: 0.088 * bw, d: 0.09 * bw }, { p: [s * 0.097, 0.88, 0.005], w: 0.084 * bw, d: 0.087 * bw }, { p: [s * 0.098, 0.72, 0.01], w: 0.072 * bw, d: 0.075 * bw }, { p: [s * 0.097, 0.5, 0.016], w: 0.059, d: 0.063 },
        { p: [s * 0.096, 0.36, 0.0], w: 0.057, d: 0.06 }, { p: [s * 0.095, 0.21, 0], w: 0.05, d: 0.052 }, { p: [s * 0.095, 0.15, 0], w: 0.05, d: 0.052 }],
      { n: 14, cap0: 0, cap1: false, color: pants, bone: lw, vary: 0.07, uvs: 8 });
      const bt = (p) => (p[1] < 0.022 ? rgb(boot, 0.45) : p[1] > 0.19 ? rgb(boot, 0.8) : boot);
      fab.sweep([{ p: [s * 0.095, 0.02, -0.005], w: 0.055, d: 0.06 }, { p: [s * 0.095, 0.12, -0.008], w: 0.058, d: 0.062 }, { p: [s * 0.095, 0.205, -0.008], w: 0.06, d: 0.064 }],
        { n: 14, cap0: false, cap1: 0, color: bt, bone: (p) => (p[1] > 0.14 ? [[I['shin' + L], 1]] : [[I['foot' + L], 1]]), vary: 0.05, uvs: 10 });
      fab.sweep([{ p: [s * 0.095, 0.052, -0.07], w: 0.042, d: 0.05 }, { p: [s * 0.095, 0.056, -0.03], w: 0.047, d: 0.056 }, { p: [s * 0.096, 0.048, 0.04], w: 0.049, d: 0.046 }, { p: [s * 0.098, 0.04, 0.115], w: 0.047, d: 0.038 }, { p: [s * 0.1, 0.034, 0.165], w: 0.036, d: 0.03 }],
        { n: 14, ref: [0, 1, 0], cap0: 0.02, cap1: 0.02, color: bt, bone: I['foot' + L], vary: 0.05, uvs: 10 });
    });
    // scarf
    if (app.scarf) {
      const sc = rgb(app.scarf), loop = [];
      for (let k = 0; k <= 18; k++) { const a = k / 18 * TAU; loop.push({ p: [Math.sin(a) * 0.084, 1.505 + Math.sin(a * 2) * 0.004, Math.cos(a) * 0.08 + 0.004], w: 0.024, d: 0.032 }); }
      const scol = (p) => (Math.floor((p[1] + 2) * 60) % 4 === 0 ? rgb(sc, 0.7) : sc);
      fab.sweep(loop, { n: 10, loop: true, ref: [0, 1, 0], color: scol, bone: (p) => [[I.chest, 0.5], [I.neck, 0.5]], vary: 0.08, uvs: 10 });
      fab.sweep([{ p: [0.035, 1.49, 0.09], w: 0.042, d: 0.011 }, { p: [0.05, 1.4, 0.13], w: 0.044, d: 0.01 }, { p: [0.056, 1.3, 0.142], w: 0.043, d: 0.01 }, { p: [0.058, 1.23, 0.14], w: 0.042, d: 0.009 }],
        { n: 10, ref: [0, 0, 1], e: 3, cap1: 0, color: scol, bone: I.chest, vary: 0.08, uvs: 10 });
    }
    // ---- neck and head (skin)
    let skinC = skin;
    sk.sweep([{ p: [0, 1.45, -0.012], w: 0.056, d: 0.058 }, { p: [0, 1.53, -0.008], w: 0.054, d: 0.056 }, { p: [0, 1.6, -0.01], w: 0.052, d: 0.054 }],
      { n: 14, cap0: false, cap1: false, color: rgb(skin, 0.86), bone: (p) => { const t = sstep(1.55, 1.6, p[1]); return [[I.neck, 1 - t], [I.head, t]]; } });
    const faceSide = (th) => (th < PI ? I.faceL : I.faceR);
    const headW = (p, th) => {
      const y = p[1], z = p[2];
      const wJ = sstep(1.626, 1.604, y) * sstep(-0.035, 0.03, z);
      const wF = (1 - wJ) * sstep(-0.01, 0.045, z) * sstep(1.585, 1.62, y);
      return [[I.jaw, wJ], [faceSide(th), wF], [I.head, Math.max(0, 1 - wJ - wF)]];
    };
    const lipC = mixc(skin, [0.32, 0.07, 0.06], 0.45), blush = mixc(skin, [0.55, 0.12, 0.1], 0.35), under = rgb(skin, 0.78);
    const headCol = (p, th) => {
      const a = Math.atan2(Math.sin(th), Math.cos(th)), aa = Math.abs(a), y = p[1];
      let c = skinC;
      c = mixc(c, blush, 0.6 * gauss((aa - 0.7) / 0.3, (y - 1.645) / 0.02));
      c = mixc(c, under, 0.5 * gauss((aa - 0.45) / 0.22, (y - 1.672) / 0.008));
      c = mixc(c, lipC, gauss(a / 0.2, (y - 1.612) / 0.0065));
      if (app.old) c = mixc(c, rgb(skin, 0.85), 0.4 * gauss((aa - 0.6) / 0.2, (y - 1.64) / 0.004));
      if (app.beard) c = mixc(c, mixc(c, hair, 0.35), sstep(1.645, 1.62, y) * sstep(1.9, 1.3, aa));
      return c;
    };
    sk.sweep(HR.map((r) => ({ p: [0, r[0], r[3]], w: r[1], d: r[2] })), { n: 32, cap0: 0.012, cap1: 0.018, mod: (th, s, i, p) => headMod(th, p.y), color: headCol, bone: headW, vary: 0.03, uvs: 12 });
    // nose
    const noseZ = faceZ(0, 1.69);
    sk.sweep([{ p: [0, 1.697, noseZ - 0.006], w: 0.011, d: 0.009 }, { p: [0, 1.673, noseZ + 0.006], w: 0.0115, d: 0.012 }, { p: [0, 1.652, noseZ + 0.017], w: 0.014, d: 0.015 }, { p: [0, 1.64, noseZ + 0.015], w: 0.019, d: 0.012 }],
      { n: 12, cap1: 0.007, color: (p) => mixc(skinC, blush, sstep(1.66, 1.645, p[1]) * 0.5), bone: (p) => [[p[0] >= 0 ? I.faceL : I.faceR, 1]] });
    // ears
    [1, -1].forEach((s) => sk.ellip([s * 0.077, 1.668, -0.008], 0.011, 0.03, 0.02, { n: 10, rings: 7, color: mixc(skin, blush, 0.5), bone: I.head }));
    // mouth slit (stretches open with the jaw)
    const mz = faceZ(0, 1.6115);
    sk.ellip([0, 1.6115, mz - 0.008], 0.021, 0.0042, 0.012, { n: 14, rings: 6, color: [0.06, 0.012, 0.012], bone: (p) => (p[1] < 1.6115 ? [[I.jaw, 1]] : [[p[0] >= 0 ? I.faceL : I.faceR, 1]]) });
    // eyes, lids, brows, glasses
    const eyeC = rgb(app.eyes);
    [1, -1].forEach((s) => {
      const L = s > 0 ? 'L' : 'R', c = [s * 0.033, 1.683, 0.083];
      eye.ellip(c, 0.0124, 0.0124, 0.0124, { axis: 'z', n: 20, rings: 14, bone: I['eye' + L], color: (p) => {
        const dx = p[0] - c[0], dy = p[1] - c[1], dz = p[2] - c[2], a = Math.acos(clamp(dz / 0.0124, -1, 1));
        if (a < 0.17) return [0.01, 0.01, 0.012];
        if (a < 0.43) return mixc(eyeC, rgb(eyeC, 0.45), sstep(0.3, 0.43, a));
        return mixc([0.78, 0.74, 0.7], [0.62, 0.42, 0.4], sstep(1.0, 1.5, a) * 0.5);
      } });
      // upper lid: spherical cap that rotates down to close
      const R = 0.0136, pts = [];
      for (let k = 0; k <= 6; k++) { const ph = 0.06 + (0.78 - 0.06) * k / 6; pts.push({ p: [c[0], c[1] + R * Math.cos(ph), c[2]], w: R * Math.sin(ph), d: R * Math.sin(ph) }); }
      sk.sweep(pts, { n: 14, arc: [-1.75, 1.75], cap0: false, cap1: false, color: (p, th, sN) => mixc(skinC, [0.08, 0.05, 0.04], sstep(0.8, 1, sN)), bone: I['lid' + L] });
      const pl = [];
      for (let k = 0; k <= 4; k++) { const ph = 2.22 + 0.55 * k / 4; pl.push({ p: [c[0], c[1] + R * Math.cos(ph), c[2]], w: R * Math.sin(ph), d: R * Math.sin(ph) }); }
      sk.sweep(pl, { n: 12, arc: [-1.6, 1.6], cap0: false, cap1: false, color: (p, th, sN) => mixc(rgb(skinC, 0.9), [0.3, 0.12, 0.1], sstep(0.25, 0, sN) * 0.6), bone: I['face' + L] });
      // brow
      fab.sweep([[s * 0.011, 1.703], [s * 0.03, 1.709], [s * 0.05, 1.705]].map((q, k) => ({ p: [q[0], q[1], faceZ(q[0], q[1]) + 0.0012], w: 0.0042 - k * 0.0006, d: 0.0028 })),
        { n: 8, ref: [0, 0, 1], cap0: 0.003, cap1: 0.004, color: rgb(hair, 0.8), bone: I['face' + L] });
      if (app.glasses) {
        const ring = [];
        for (let k = 0; k <= 16; k++) { const a = k / 16 * TAU; ring.push({ p: [c[0] + Math.sin(a) * 0.021, c[1] + Math.cos(a) * 0.016, 0.104], w: 0.0018 }); }
        eye.sweep(ring, { n: 6, loop: true, ref: [0, 0, 1], color: [0.02, 0.02, 0.022], bone: I['face' + L] });
        eye.sweep([{ p: [s * 0.054, 1.687, 0.1], w: 0.0016 }, { p: [s * 0.074, 1.69, 0.06], w: 0.0016 }, { p: [s * 0.08, 1.69, -0.01], w: 0.0016 }], { n: 6, color: [0.02, 0.02, 0.022], bone: I.head });
      }
    });
    if (app.glasses) eye.sweep([{ p: [0.012, 1.69, 0.104], w: 0.0016 }, { p: [0, 1.692, 0.106], w: 0.0016 }, { p: [-0.012, 1.69, 0.104], w: 0.0016 }], { n: 6, color: [0.02, 0.02, 0.022], bone: I.faceR });

    // ---- hair
    const hairRings = HR.filter((r) => r[0] >= 1.58).map((r) => ({ p: [0, r[0], r[3]], w: r[1], d: r[2] }));
    const hairCol = (p) => mixc(hair, rgb(hair, 0.6), vn(p[0] * 300, p[1] * 40, p[2] * 300) * 0.6);
    const hairShell = (visFn, thick) => fab.sweep(hairRings, { n: 32, cap0: false, cap1: 0.02, color: hairCol, bone: headW,
      mod: (th, s, i, p) => headMod(th, p.y) * lerp(0.93, 1 + thick * (0.4 + 0.6 * sstep(1.7, 1.78, p.y)), visFn(th, p.y)), uvs: 14 });
    const hatOn = app.hat !== 'none';
    if (app.hairStyle !== 'bald' && !(app.hat === 'hood')) {
      hairShell((th, y) => {
        const c = Math.cos(th);
        const hy = c > 0 ? lerp(1.70, 1.745, sstep(0.25, 0.65, c)) : lerp(1.70, 1.6, sstep(-0.1, -0.6, c));
        return sstep(hy - 0.006, hy + 0.006, y);
      }, app.hairStyle === 'long' ? 0.09 : 0.06);
    } else if (app.hairStyle === 'bald' && app.old && !hatOn) {
      hairShell((th, y) => sstep(0.2, -0.2, Math.cos(th)) * sstep(1.64, 1.65, y) * sstep(1.72, 1.71, y), 0.04);
    }
    if (app.hairStyle === 'long') {
      const hb = (p) => { const t = sstep(1.62, 1.5, p[1]); return [[I.head, 1 - t], [I.neck, t * 0.5], [I.chest, t * 0.5]]; };
      fab.sweep([{ p: [0, 1.74, -0.05], w: 0.07, d: 0.05 }, { p: [0, 1.66, -0.075], w: 0.085, d: 0.042 }, { p: [0, 1.56, -0.085], w: 0.095, d: 0.032 }, { p: [0, 1.46, -0.1], w: 0.1, d: 0.022 }],
        { n: 16, e: 2.6, cap1: 0.015, color: hairCol, bone: hb, uvs: 14, mod: (th, s) => 1 + 0.05 * Math.sin(th * 9 + s * 4) * s });
      [1, -1].forEach((s) => fab.sweep([{ p: [s * 0.072, 1.72, 0.03], w: 0.012, d: 0.025 }, { p: [s * 0.078, 1.64, 0.035], w: 0.012, d: 0.024 }, { p: [s * 0.08, 1.55, 0.02], w: 0.01, d: 0.02 }],
        { n: 10, cap1: 0.01, color: hairCol, bone: hb }));
    }
    if (app.beard) {
      fab.sweep(HR.filter((r) => r[0] <= 1.67).map((r) => ({ p: [0, r[0], r[3]], w: r[1], d: r[2] })), { n: 32, cap0: 0.016, cap1: false, color: hairCol, bone: headW, uvs: 14,
        mod: (th, s, i, p) => {
          const a = Math.atan2(Math.sin(th), Math.cos(th));
          let v = sstep(1.655, 1.64, p.y) * sstep(1.9, 1.45, Math.abs(a));
          v *= 1 - gauss(a / 0.3, (p.y - 1.611) / 0.006);
          return headMod(th, p.y) * lerp(0.95, 1.075 + 0.02 * vn(p.x * 200, p.y * 200, p.z * 200), v);
        } });
    }
    // ---- hats
    let topY = 1.82;
    if (app.hat === 'beanie') {
      const pom = rnd(5) < 0.4;
      const br = [[1.70, 1.17], [1.735, 1.17], [1.738, 1.12], [1.76, 1.11], [1.79, 1.1], [1.82, 1.08], [1.845, 1.0], [1.86, 0.75]];
      fab.sweep(br.map(([y, k]) => { const r = headRingAt(Math.min(y, 1.8)); return { p: [0, y, r[3] - 0.004], w: r[1] * k, d: r[2] * k }; }),
        { n: 32, cap0: false, cap1: 0.02, color: (p) => (p[1] < 1.737 ? rgb(hatC, 0.8) : hatC), mod: (th, s, i, p) => (1 + 0.012 * Math.cos(th * 46)) * (1 - 0.02 * Math.cos(th) * sstep(1.74, 1.7, p.y)), bone: I.head, vary: 0.08, uvs: 14 });
      topY = 1.875;
      if (pom) { fab.ellip([0, 1.89, -0.02], 0.034, 0.03, 0.034, { n: 12, rings: 8, color: rgb(hatC, 1.15), jit: (p) => { const k = (vn(p.x * 300, p.y * 300, p.z * 300) - 0.5) * 0.012; return [p.x * k * 10, k, p.z * k * 10]; }, bone: I.head }); topY = 1.91; }
    } else if (app.hat === 'cap') {
      const br = [[1.715, 1.09], [1.75, 1.09], [1.78, 1.07], [1.8, 1.0], [1.815, 0.6]];
      fab.sweep(br.map(([y, k]) => { const r = headRingAt(Math.min(y, 1.8)); return { p: [0, y, r[3]], w: r[1] * k, d: r[2] * k }; }), { n: 28, cap0: false, cap1: 0.012, color: hatC, bone: I.head, vary: 0.05, uvs: 12 });
      fab.sweep([{ p: [0, 1.722, 0.06], w: 0.075, d: 0.005 }, { p: [0, 1.718, 0.12], w: 0.07, d: 0.005 }, { p: [0, 1.708, 0.165], w: 0.05, d: 0.004 }], { n: 16, ref: [0, 1, 0], cap1: 0.02, color: rgb(hatC, 0.7), bone: I.head });
      topY = 1.835;
    } else if (app.hat === 'hood') {
      const rings = [];
      for (let k = 0; k <= 9; k++) { const y = 1.47 + k * 0.045; const r = headRingAt(clamp(y, 1.56, 1.8)); const t = sstep(1.8, 1.9, y); rings.push({ p: [0, y, r[3] - 0.03 - k * 0.002], w: (r[1] + 0.045 + (y < 1.56 ? 0.03 * (1.56 - y) / 0.09 : 0)) * (1 - t * 0.5), d: (r[2] + 0.05) * (1 - t * 0.45) }); }
      const open = (i) => { const y = 1.47 + i * 0.045; const o = 0.95 * Math.pow(Math.max(0, Math.sin(clamp((y - 1.5) / 0.32, 0, 1) * PI)), 0.6); return [o, TAU - o]; };
      fab.sweep(rings, { n: 30, arc: open, cap0: false, cap1: 0.03, color: (p, th) => mixc(hatC, rgb(hatC, 0.55), sstep(0.35, 1.2, Math.cos(th)) * 0.6), bone: (p) => { const t = sstep(1.52, 1.6, p[1]); return [[I.chest, (1 - t) * 0.7], [I.neck, (1 - t) * 0.3], [I.head, t]]; }, vary: 0.06, uvs: 10 });
      topY = 1.89;
    }
    // ---- snow (shown when st.snowy)
    const snowW = (p) => (Math.abs(p[0]) > 0.17 ? [[p[0] > 0 ? I.armL : I.armR, 1]] : [[I.chest, 1]]);
    for (let k = 0; k < 22; k++) {
      const s = k % 2 ? 1 : -1, x = s * (0.05 + hsh(k, 1, seed) * 0.18), z = (hsh(k, 2, seed) - 0.55) * 0.12;
      const ax = Math.abs(x), y = ax < 0.09 ? 1.55 : ax < 0.15 ? lerp(1.53, 1.505, (ax - 0.09) / 0.06) : 1.51 + (ax - 0.15) * 0.1;
      snow.ellip([x, y + 0.004, z], 0.022 + hsh(k, 3) * 0.02, 0.008 + hsh(k, 4) * 0.006, 0.02 + hsh(k, 5) * 0.015, { n: 8, rings: 5, color: [0.86, 0.9, 0.95], bone: snowW, jit: (p) => [0, (vn(p.x * 200, 3, p.z * 200) - 0.5) * 0.006, 0] });
    }
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU + seed, r = k ? 0.035 + hsh(k, 6) * 0.03 : 0;
      snow.ellip([Math.sin(a) * r, topY - 0.006 - r * 0.35, Math.cos(a) * r - 0.01], 0.022, 0.009, 0.022, { n: 8, rings: 5, color: [0.88, 0.91, 0.96], bone: I.head });
    }
    // ---- the Mimic's inside (reveal only): a flesh cavity and rows of teeth riding the split face
    maw.ellip([0, 1.665, 0.02], 0.064, 0.09, 0.075, { n: 18, rings: 10, flip: true, color: (p) => mixc([0.16, 0.012, 0.015], [0.03, 0.0, 0.004], sstep(0.06, -0.06, p[2])), bone: I.head });
    const tooth = [0.62, 0.58, 0.48];
    [1, -1].forEach((s) => {
      for (let k = 0; k < 9; k++) {
        const y = 1.625 + k * 0.012, z = 0.06 + hsh(k, s) * 0.02, len = 0.016 + hsh(k, s + 4) * 0.02;
        sk.sweep([{ p: [s * 0.016, y, z], w: 0.0035, d: 0.003 }, { p: [s * (0.016 - len), y - 0.003, z + 0.004], w: 0.0002 }], { n: 6, cap0: 0, cap1: false, color: tooth, bone: s > 0 ? I.faceL : I.faceR });
      }
    });
    for (let k = 0; k < 10; k++) {
      const x = -0.04 + k * 0.009, len = 0.014 + hsh(k, 9) * 0.014;
      sk.sweep([{ p: [x, 1.596, 0.072 - Math.abs(x) * 0.4], w: 0.0035, d: 0.003 }, { p: [x, 1.596 + len, 0.074 - Math.abs(x) * 0.4], w: 0.0002 }], { n: 6, cap0: 0, cap1: false, color: tooth, bone: I.jaw });
    }

    // ---- materials (per person: wetness and the reveal change them)
    const mFab = R3.std({ vertexColors: true, roughness: 0.92, metalness: 0, normalMap: TX.fabric(), normalScale: new THREE.Vector2(0.55, 0.55), side: THREE.DoubleSide });
    const mSkin = R3.std({ vertexColors: true, roughness: 0.55, metalness: 0, normalMap: TX.skin(), normalScale: new THREE.Vector2(0.25, 0.25), emissive: new THREE.Color().setRGB(skin[0] * 0.05 + 0.006, skin[1] * 0.02, skin[2] * 0.015) });
    const mEye = R3.std({ vertexColors: true, roughness: 0.1, metalness: 0 });
    const mSnow = R3.mat('cr:snow', () => R3.std({ color: 0xffffff, vertexColors: true, roughness: 0.8, emissive: 0x0b0e14 }));
    const mMaw = R3.mat('cr:maw', () => R3.std({ vertexColors: true, roughness: 0.25, metalness: 0, side: THREE.BackSide, emissive: 0x1a0204 }));
    const parts = [{ name: 'fab', geo: fab.geo(), mat: mFab }, { name: 'skin', geo: sk.geo(), mat: mSkin }, { name: 'eye', geo: eye.geo(), mat: mEye, shadow: false },
      { name: 'snow', geo: snow.geo(), mat: mSnow, shadow: false }, { name: 'maw', geo: maw.geo(), mat: mMaw, shadow: false }];
    const A = assemble(rig, parts, [0, 0.9, 0, 1.15]);
    A.meshes.snow.visible = false; A.meshes.maw.visible = false;
    const H = (app.old ? 1.7 : 1.72 + rnd(6) * 0.13) / 1.76;
    A.body.scale.setScalar(H);
    const tris = fab.tris() + sk.tris() + eye.tris();

    // breath vapour: one mesh of camera-facing quads rewritten each render
    const NP = 7, bGeo = new THREE.BufferGeometry();
    bGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(NP * 12), 3));
    bGeo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(NP * 12).map((v, i) => (i % 3 === 2 ? 1 : 0)), 3));
    bGeo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(NP * 8).map((v, i) => [0, 0, 1, 0, 1, 1, 0, 1][i % 8]), 2));
    bGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(NP * 16), 4));
    const bIdx = []; for (let i = 0; i < NP; i++) bIdx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    bGeo.setIndex(bIdx);
    const mBreath = R3.mat('cr:breath', () => R3.std({ color: 0xdfe6ee, roughness: 1, metalness: 0, transparent: true, depthWrite: false, vertexColors: true, alphaMap: TX.puff(), emissive: 0x1c2026 }));
    const breath = new THREE.Mesh(bGeo, mBreath); breath.frustumCulled = false; breath.renderOrder = 4; breath.visible = false;
    A.obj.add(breath);
    const puffs = []; for (let i = 0; i < NP; i++) puffs.push({ age: 9, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.05 });
    const _r = new V3(), _u = new V3(), _iq = new THREE.Quaternion();
    breath.onBeforeRender = function (r, scn, cam) {
      cam.getWorldQuaternion(_q); A.obj.getWorldQuaternion(_iq).invert(); _q.premultiply(_iq);
      _r.set(1, 0, 0).applyQuaternion(_q); _u.set(0, 1, 0).applyQuaternion(_q);
      const pa = bGeo.attributes.position.array, ca = bGeo.attributes.color.array;
      puffs.forEach((p, i) => {
        const L = 1.7, a = p.age < L ? Math.pow(1 - p.age / L, 1.4) * sstep(0, 0.12, p.age) * 0.55 : 0, s = p.s;
        const cx = [-1, 1, 1, -1], cy = [-1, -1, 1, 1];
        for (let k = 0; k < 4; k++) {
          const o = (i * 4 + k) * 3;
          pa[o] = p.x + (_r.x * cx[k] + _u.x * cy[k]) * s; pa[o + 1] = p.y + (_r.y * cx[k] + _u.y * cy[k]) * s; pa[o + 2] = p.z + (_r.z * cx[k] + _u.z * cy[k]) * s;
          const c = (i * 4 + k) * 4; ca[c] = ca[c + 1] = ca[c + 2] = 1; ca[c + 3] = a;
        }
      });
      bGeo.attributes.position.needsUpdate = true; bGeo.attributes.color.needsUpdate = true;
    };
    // eye glow (the Mimic's tell) and the reveal's red pinpoints
    const glows = [rig.b.eyeL, rig.b.eyeR].map((b) => { const g = glowDot(0xffe27a, 0.05); g.position.set(0, 0, 0.012); g.visible = false; b.add(g); return g; });
    const glowMats = glows.map((g) => g.material);

    const S = { t: hsh(seed, 7) * 10, blinkT: 1 + rnd(8) * 3, blink: 9, gaze: [0, 0], gazeT: 0, gazeTo: [0, 0], breathPh: rnd(9) * 3, emit: 0, mv: 0, spd: 1.3, phase: 0, wet: -1, rev: -1 };
    const mouthL = new V3(), headQ = new THREE.Quaternion(), fwd = new V3();
    const b = rig.b;
    function update(dt, st, ctx) {
      st = st || {}; dt = Math.min(0.1, dt || 0.016);
      const t = (S.t += dt);
      rig.reset();
      const pose = st.pose || 'stand';
      const sd = seed * 10;
      // gait blend
      const walking = pose === 'walk' || (st.moving && pose !== 'sit' && pose !== 'lie');
      S.mv = lerp(S.mv, walking ? 1 : 0, Math.min(1, dt * 5));
      if (st.speed != null && st.speed > 0.05) S.spd = lerp(S.spd, clamp(st.speed, 0.6, 3), Math.min(1, dt * 3));
      S.phase += dt * TAU * (S.spd / 1.35) * (walking ? 1 : 0.0);
      const ph = S.phase, mv = S.mv;
      // idle: breathing, weight shift
      const br = Math.sin(t * TAU / 3.6 + sd);
      const ws = n1(t * 0.55, sd) * (1 - mv);
      b.chest.rotation.x -= 0.012 * br; b.neck.rotation.x += 0.01 * br;
      b.armL.rotation.z += 0.012 * br; b.armR.rotation.z -= 0.012 * br;
      b.hips.position.x += 0.014 * ws; b.hips.rotation.z += 0.03 * ws; b.spine.rotation.z -= 0.02 * ws; b.chest.rotation.z -= 0.012 * ws;
      b.thighL.rotation.z -= 0.03 * ws; b.thighR.rotation.z -= 0.03 * ws;
      const relax = Math.max(0, -ws), relax2 = Math.max(0, ws);
      b.thighL.rotation.x -= 0.06 * relax; b.shinL.rotation.x += 0.12 * relax; b.footL.rotation.x -= 0.06 * relax;
      b.thighR.rotation.x -= 0.06 * relax2; b.shinR.rotation.x += 0.12 * relax2; b.footR.rotation.x -= 0.06 * relax2;
      b.armL.rotation.z += 0.07; b.armR.rotation.z -= 0.07; b.foreL.rotation.x -= 0.18; b.foreR.rotation.x -= 0.18;
      // head wander and gaze (people glance about; Mimics stare)
      const look = st.mimic ? 0.15 : 1;
      b.head.rotation.y += 0.13 * n1(t * 0.31, sd + 2) * look * (1 - mv * 0.5); b.head.rotation.x += 0.05 * n1(t * 0.27, sd + 5) * look;
      if (st.mimic) b.head.rotation.z += 0.05 + 0.02 * Math.sin(t * 0.2);
      S.gazeT -= dt;
      if (S.gazeT <= 0) { S.gazeT = 0.6 + hsh(t, sd) * 2.4; S.gazeTo = st.mimic ? [0, 0] : [(hsh(t, 3) - 0.5) * 0.5, (hsh(t, 4) - 0.5) * 0.2]; }
      S.gaze[0] = lerp(S.gaze[0], S.gazeTo[0], Math.min(1, dt * 18)); S.gaze[1] = lerp(S.gaze[1], S.gazeTo[1], Math.min(1, dt * 18));
      b.eyeL.rotation.y = b.eyeR.rotation.y = S.gaze[0]; b.eyeL.rotation.x = b.eyeR.rotation.x = S.gaze[1];
      // cold: shiver
      if (st.breath && !st.mimic) { const sh = Math.sin(t * 38) * 0.006 + Math.sin(t * 27 + 1) * 0.004; b.chest.rotation.z += sh; b.armL.rotation.z += sh; b.armR.rotation.z -= sh; }
      if (app.old) { b.spine.rotation.x += 0.1; b.chest.rotation.x += 0.14; b.neck.rotation.x -= 0.1; b.head.rotation.x -= 0.1; b.shinL.rotation.x += 0.08; b.shinR.rotation.x += 0.08; b.thighL.rotation.x -= 0.06; b.thighR.rotation.x -= 0.06; }
      // walk cycle
      if (mv > 0.01) {
        const s = Math.sin(ph), c = Math.cos(ph);
        b.thighL.rotation.x += -0.45 * s * mv; b.thighR.rotation.x += 0.45 * s * mv;
        b.shinL.rotation.x += (0.08 + 0.8 * Math.pow(Math.max(0, c), 1.5)) * mv; b.shinR.rotation.x += (0.08 + 0.8 * Math.pow(Math.max(0, -c), 1.5)) * mv;
        b.footL.rotation.x += (0.25 * s - 0.15 * Math.max(0, c)) * mv; b.footR.rotation.x += (-0.25 * s - 0.15 * Math.max(0, -c)) * mv;
        b.hips.position.y += (Math.abs(c) - 1) * 0.022 * mv; b.hips.rotation.y -= 0.07 * s * mv; b.chest.rotation.y += 0.09 * s * mv;
        b.armL.rotation.x += 0.38 * s * mv; b.armR.rotation.x -= 0.38 * s * mv;
        b.foreL.rotation.x -= (0.15 + 0.2 * Math.max(0, -s)) * mv; b.foreR.rotation.x -= (0.15 + 0.2 * Math.max(0, s)) * mv;
        b.spine.rotation.x += 0.05 * mv;
      }
      if (pose === 'sit') {
        const ground = ctx && ctx.area && ctx.area.kind === 'forest';
        if (ground) {
          b.hips.position.y = 0.14; b.hips.position.z = -0.25;
          b.thighL.rotation.x = -1.95; b.thighR.rotation.x = -1.85; b.shinL.rotation.x = 1.95; b.shinR.rotation.x = 1.6; b.footL.rotation.x = -0.3;
          b.thighL.rotation.z = 0.12; b.thighR.rotation.z = -0.15;
          b.spine.rotation.x = 0.25; b.chest.rotation.x += 0.12;
          b.armL.rotation.x = -0.75; b.foreL.rotation.x = -0.9; b.armR.rotation.x = -0.6; b.foreR.rotation.x = -1.1; b.armL.rotation.z = -0.1; b.armR.rotation.z = 0.15;
          b.head.rotation.x += 0.15;
        } else {
          b.hips.position.y = 0.5; b.hips.position.z = -0.06;
          b.thighL.rotation.x = -1.5; b.thighR.rotation.x = -1.5; b.shinL.rotation.x = 1.42; b.shinR.rotation.x = 1.55;
          b.thighL.rotation.z = 0.06; b.thighR.rotation.z = -0.06;
          b.spine.rotation.x = 0.06; b.chest.rotation.x += 0.08;
          b.armL.rotation.x = -0.45; b.foreL.rotation.x = -0.75; b.armR.rotation.x = -0.45; b.foreR.rotation.x = -0.75;
          b.armL.rotation.z = -0.02; b.armR.rotation.z = 0.02;
        }
      } else if (pose === 'lie') {
        b.root.rotation.x = -PI / 2; b.root.position.y = 0.12; b.root.position.z = 0.8;
        b.armL.rotation.z = 0.2; b.armR.rotation.z = -0.2; b.head.rotation.y = 0.4;
      }
      // blink (people only)
      let lid = 0;
      if (st.blinks && !st.mimic) {
        S.blinkT -= dt;
        if (S.blinkT <= 0) { S.blink = 0; S.blinkT = 2.2 + hsh(t, sd, 1) * 3.8; }
      }
      if (S.blink < 0.17) { S.blink += dt; lid = Math.sin(clamp(S.blink / 0.17, 0, 1) * PI); }
      b.lidL.rotation.x = b.lidR.rotation.x = 0.1 + lid * 1.25;
      // talking
      if (st.talking) b.jaw.rotation.x = 0.03 + 0.17 * (0.5 + 0.5 * Math.sin(t * 13)) * (0.55 + 0.45 * Math.sin(t * 3.1 + 1));
      // the reveal
      const rv = clamp(st.reveal || 0, 0, 1);
      if (rv > 0) {
        const e = sstep(0, 1, rv), j = (hsh(t * 60, 1) - 0.5) * 0.05 * (1 - e * 0.5);
        b.faceL.rotation.y = e * 0.95 + j; b.faceR.rotation.y = -e * 0.95 - j;
        b.faceL.rotation.x = b.faceR.rotation.x = -e * 0.15;
        b.jaw.rotation.x = e * 0.75 + j; b.jaw.position.y -= e * 0.012;
        b.neck.scale.y = 1 + e * 0.22; b.head.rotation.x -= e * 0.25; b.head.rotation.z += j * 2;
        b.eyeL.rotation.x = b.eyeR.rotation.x = -0.8 * e;
        b.armL.rotation.x -= e * 0.5; b.armR.rotation.x -= e * 0.5; b.foreL.rotation.x -= e * 0.6; b.foreR.rotation.x -= e * 0.6;
        b.chest.rotation.x -= e * 0.12;
      }
      A.meshes.maw.visible = rv > 0.01;
      if (S.rev !== rv) { S.rev = rv; mEye.color.setScalar(1 - 0.97 * sstep(0, 0.4, rv)); }
      // tells
      A.meshes.snow.visible = !!st.snowy;
      const wet = st.wet ? 1 : 0;
      if (S.wet !== wet) {
        S.wet = wet;
        mFab.color.setScalar(wet ? 0.62 : 1); mFab.roughness = wet ? 0.42 : 0.92;
        mSkin.roughness = wet ? 0.28 : 0.55; mSkin.color.setScalar(wet ? 0.92 : 1);
      }
      let glow = 0;
      if (rv > 0.05) { glow = 0.6 + 0.4 * Math.sin(t * 9); glowMats.forEach((m) => m.color.setRGB(1, 0.12, 0.06)); }
      else if (st.eyeGlow) { const g = (t + seed * 9) % 9; glow = g < 0.25 ? Math.sin(g / 0.25 * PI) : 0; glowMats.forEach((m) => m.color.setRGB(1, 0.89, 0.48)); }
      glows.forEach((g) => { g.visible = glow > 0.01; g.material.opacity = glow; });
      // breath: exhale a burst of vapour every few seconds from the mouth (st.breath = real person in the cold)
      A.obj.updateMatrixWorld(true);
      b.head.getWorldPosition(mouthL); b.head.getWorldQuaternion(headQ);
      fwd.set(0, 0, 1).applyQuaternion(headQ);
      const mo = new V3(0, 1.612 - 1.585, 0.12).multiplyScalar(H).applyQuaternion(headQ);
      mouthL.add(mo); A.obj.worldToLocal(mouthL);
      const iq = A.obj.getWorldQuaternion(_iq).invert(); fwd.applyQuaternion(iq);
      if (st.breath) {
        const cyc = (t + S.breathPh) % 3.3;
        if (cyc < 0.9) { S.emit -= dt; if (S.emit <= 0) { S.emit = 0.13; const p = puffs.reduce((a, q) => (q.age > a.age ? q : a)); p.age = 0; p.x = mouthL.x; p.y = mouthL.y - 0.01; p.z = mouthL.z; const sp = 0.32 * (1 - cyc / 1.1); p.vx = fwd.x * sp + (hsh(t, 1) - 0.5) * 0.05; p.vy = fwd.y * sp - 0.02; p.vz = fwd.z * sp + (hsh(t, 2) - 0.5) * 0.05; p.s = 0.03; } }
      }
      let any = false;
      puffs.forEach((p) => { if (p.age < 2) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 1 - dt * 1.4; p.vz *= 1 - dt * 1.4; p.vy = p.vy * (1 - dt * 1.4) + dt * 0.06; p.s = 0.03 + p.age * 0.14; any = true; } });
      breath.visible = any;
    }
    function dispose() { [fab, sk].length; for (const k in A.meshes) if (!A.meshes[k].geometry.userData.shared) A.meshes[k].geometry.dispose(); bGeo.dispose(); mFab.dispose(); mSkin.dispose(); mEye.dispose(); glowMats.forEach((m) => m.dispose()); }
    update(0.016, {}, null);
    return { obj: A.obj, update, dispose, rig, tris, kind: 'human' };
  }

  // =================================================================== QUADRUPEDS
  // One rig for every four-legged animal. Specs give joints (left side, x > 0), body/neck/head rings and colours.
  function canid(o) {
    // base: a husky-sized dog; o.size scales, o.leg lifts the body (longer legs), o.muzzle stretches the snout
    const S = o.size || 1, dy = o.leg || 0, mz = o.muzzle || 0, BK = o.bulk || 1;
    const Y = (y) => y + dy * clamp(y / 0.45, 0, 1);
    const P = (x, y, z) => [x * S, Y(y) * S, z * S];
    const zf = (z) => (z > 0.42 ? z + (z - 0.42) * mz : z);
    const sp = {
      pelvis: P(0, 0.5, -0.28), spine: P(0, 0.52, -0.04), chest: P(0, 0.52, 0.18), neck: P(0, 0.56, 0.28), head: P(0, 0.72, 0.38), jaw: P(0, 0.68, 0.43),
      hind: [P(0.075, 0.48, -0.3), P(0.085, 0.32, -0.2), P(0.08, 0.15, -0.35), P(0.075, 0.025, -0.32)],
      fore: [P(0.085, 0.46, 0.2), P(0.085, 0.31, 0.15), P(0.08, 0.1, 0.18), P(0.08, 0.025, 0.21)],
      hindR: [0.074 * S * BK, 0.047 * S * BK, 0.03 * S * BK, 0.027 * S * BK], foreR: [0.062 * S * BK, 0.039 * S * BK, 0.027 * S * BK, 0.026 * S * BK],
      body: [[-0.43, 0.5, 0.055, 0.065], [-0.38, 0.505, 0.105, 0.115], [-0.28, 0.51, 0.12, 0.125], [-0.14, 0.51, 0.112, 0.118], [0.0, 0.515, 0.118, 0.135], [0.14, 0.52, 0.128, 0.16], [0.24, 0.54, 0.118, 0.15], [0.31, 0.57, 0.085, 0.1]]
        .map(([z, y, w, d]) => [z * S, Y(y) * S, w * S * (o.slim || 1), d * S * BK]),
      neckR: [[0, 0.54, 0.22, 0.1 * (o.slim || 1), 0.12], [0, 0.6, 0.31, 0.094 * (o.slim || 1), 0.104], [0, 0.68, 0.37, 0.074, 0.078]].map(([x, y, z, w, d]) => [x, Y(y) * S, z * S, w * S, d * S]),
      headR: [[0.31, 0.74, 0.055, 0.06], [0.35, 0.755, 0.078, 0.08], [0.41, 0.75, 0.074, 0.072], [0.46, 0.728, 0.05, 0.056], [0.52, 0.71, 0.039, 0.046], [0.57, 0.7, 0.031, 0.037], [0.598, 0.697, 0.022, 0.025]]
        .map(([z, y, w, d]) => [zf(z) * S, Y(y) * S, w * S, d * S * (z > 0.45 ? 1 - mz * 0.3 : 1)]),
      eye: P(0.037, 0.755, 0.445), eyeR: 0.0105 * S, nose: P(0, 0.698, zf(0.605)), noseR: 0.016 * S,
      ear: { base: P(0.04, 0.785, 0.375), tip: P(0.058 * (o.earW || 1), 0.785 + 0.09 * (o.earL || 1), 0.36), w: 0.03 * S * (o.earW || 1), d: 0.008 * S },
      tail: o.tail === 'curl' ? [P(0, 0.54, -0.42), P(0, 0.62, -0.5), P(0, 0.71, -0.47), P(0, 0.74, -0.38)] : o.tail === 'brush' ? [P(0, 0.52, -0.42), P(0, 0.47, -0.56), P(0, 0.4, -0.72), P(0, 0.36, -0.84)] : [P(0, 0.52, -0.42), P(0, 0.44, -0.5), P(0, 0.33, -0.55), P(0, 0.24, -0.58)],
      tailR: (o.tail === 'brush' ? [0.035, 0.06, 0.065, 0.05] : o.tail === 'curl' ? [0.035, 0.05, 0.05, 0.035] : [0.035, 0.045, 0.045, 0.035]).map((r) => r * S),
      paw: 'paw', S,
    };
    sp.jawLine = Y(0.705) * S; sp.jawZ = 0.42 * S;
    return sp;
  }
  function deerSpec() {
    return {
      pelvis: [0, 0.92, -0.38], spine: [0, 0.92, -0.05], chest: [0, 0.93, 0.28], neck: [0, 1.0, 0.42], head: [0, 1.36, 0.58], jaw: [0, 1.31, 0.64],
      hind: [[0.1, 0.9, -0.42], [0.11, 0.62, -0.3], [0.1, 0.4, -0.52], [0.1, 0.02, -0.47]],
      fore: [[0.11, 0.85, 0.3], [0.11, 0.62, 0.24], [0.1, 0.3, 0.27], [0.1, 0.02, 0.28]],
      hindR: [0.095, 0.052, 0.027, 0.023], foreR: [0.076, 0.042, 0.024, 0.022],
      body: [[-0.58, 0.95, 0.065, 0.085], [-0.52, 0.94, 0.14, 0.16], [-0.4, 0.93, 0.16, 0.18], [-0.15, 0.91, 0.158, 0.18], [0.1, 0.92, 0.158, 0.2], [0.28, 0.95, 0.145, 0.195], [0.4, 1.0, 0.105, 0.135]],
      neckR: [[0, 0.98, 0.34, 0.1, 0.135], [0, 1.14, 0.47, 0.078, 0.098], [0, 1.3, 0.55, 0.062, 0.072]],
      headR: [[0.5, 1.39, 0.055, 0.055], [0.56, 1.4, 0.072, 0.074], [0.62, 1.382, 0.064, 0.063], [0.69, 1.348, 0.046, 0.047], [0.76, 1.318, 0.036, 0.036], [0.8, 1.307, 0.029, 0.029], [0.822, 1.302, 0.02, 0.02]],
      eye: [0.056, 1.4, 0.6], eyeR: 0.014, nose: [0, 1.302, 0.82], noseR: 0.02,
      ear: { base: [0.045, 1.44, 0.54], tip: [0.15, 1.52, 0.51], w: 0.045, d: 0.012 },
      tail: [[0, 0.98, -0.57], [0, 0.95, -0.64], [0, 0.9, -0.69]], tailR: [0.04, 0.05, 0.035],
      paw: 'hoof', S: 1.6, jawLine: 1.32, jawZ: 0.62,
    };
  }
  function hareSpec() {
    return {
      pelvis: [0, 0.16, -0.09], spine: [0, 0.18, 0.0], chest: [0, 0.17, 0.08], neck: [0, 0.19, 0.12], head: [0, 0.235, 0.15], jaw: [0, 0.22, 0.18],
      hind: [[0.055, 0.15, -0.1], [0.065, 0.1, -0.02], [0.062, 0.035, -0.12], [0.058, 0.012, -0.0]],
      fore: [[0.045, 0.14, 0.1], [0.045, 0.085, 0.085], [0.04, 0.035, 0.12], [0.04, 0.01, 0.14]],
      hindR: [0.06, 0.036, 0.021, 0.019], foreR: [0.022, 0.017, 0.013, 0.013],
      body: [[-0.17, 0.148, 0.045, 0.055], [-0.145, 0.146, 0.09, 0.11], [-0.07, 0.154, 0.096, 0.115], [0.03, 0.162, 0.08, 0.1], [0.09, 0.174, 0.062, 0.076], [0.125, 0.195, 0.044, 0.054]],
      neckR: [[0, 0.185, 0.1, 0.04, 0.045], [0, 0.215, 0.14, 0.034, 0.038]],
      headR: [[0.115, 0.245, 0.034, 0.038], [0.145, 0.25, 0.047, 0.05], [0.185, 0.238, 0.04, 0.039], [0.215, 0.224, 0.026, 0.027], [0.232, 0.218, 0.016, 0.017]],
      eye: [0.034, 0.254, 0.175], eyeR: 0.0095, nose: [0, 0.222, 0.232], noseR: 0.0065,
      ear: { base: [0.016, 0.278, 0.135], tip: [0.032, 0.39, 0.085], w: 0.022, d: 0.006 },
      tail: [[0, 0.17, -0.16], [0, 0.19, -0.185], [0, 0.2, -0.195]], tailR: [0.02, 0.026, 0.016],
      paw: 'paw', S: 0.4, jawLine: 0.22, jawZ: 0.19,
    };
  }
  const QCOL = {
    dog: (p, n, part, S) => { // Juniper: grey-brown husky
      const top = rgb(0x5d5245), side = rgb(0x8c7d6b), cream = rgb(0xd5cab5);
      let c = mixc(side, top, sstep(0.0, 0.7, n[1]) * (part === 'leg' ? 0.3 : 1));
      c = mixc(c, cream, sstep(-0.1, -0.6, n[1]));
      if (part === 'leg') c = mixc(c, cream, sstep(0.3 * S, 0.12 * S, p[1]) * 0.8);
      if (part === 'head') { c = mixc(c, cream, sstep(0.45 * S, 0.52 * S, p[2]) * (1 - sstep(0.4, 0.9, n[1]) * 0.7)); c = mixc(c, cream, sstep(0.2, -0.4, n[1])); }
      if (part === 'neck') c = mixc(c, cream, sstep(0.2, 0.8, n[2]) * 0.8);
      if (part === 'tail') c = mixc(c, cream, sstep(0.0, -0.5, n[1]));
      return c;
    },
    wolf: (p, n, part, S) => {
      const top = rgb(0x3d3a36), side = rgb(0x7a7064), pale = rgb(0xbdb5a6);
      let c = mixc(side, top, sstep(0.1, 0.8, n[1]) * (part === 'leg' ? 0.2 : 1));
      c = mixc(c, pale, sstep(-0.1, -0.6, n[1]));
      if (part === 'leg') c = mixc(c, pale, 0.4);
      if (part === 'head') { c = mixc(c, pale, sstep(0.5 * S, 0.57 * S, p[2]) * 0.6); c = mixc(c, pale, sstep(0.1, -0.4, n[1])); }
      if (part === 'tail') c = mixc(c, top, sstep(0.7, 1, (p[1] < 0.3 * S ? 1 : 0)));
      return c;
    },
    fox: (p, n, part, S) => {
      const red = rgb(0xa8481a), dark = rgb(0x6a2a10), white = rgb(0xe6e0d6), black = rgb(0x1a1210);
      let c = mixc(red, dark, sstep(0.4, 1, n[1]) * 0.4);
      c = mixc(c, white, sstep(-0.2, -0.6, n[1]) * (part === 'body' ? 0.6 : 0));
      if (part === 'leg') c = mixc(c, black, sstep(0.38 * S, 0.25 * S, p[1]));
      if (part === 'head') c = mixc(c, white, sstep(0.0, -0.5, n[1]));
      if (part === 'neck') c = mixc(c, white, sstep(0.1, 0.7, n[2]));
      if (part === 'tail') c = mixc(c, white, sstep(-0.74 * S, -0.82 * S, p[2]));
      if (part === 'ear') c = mixc(c, black, sstep(-0.2, -0.8, n[2]));
      return c;
    },
    deer: (p, n, part) => {
      const coat = rgb(0x6c5a49), dark = rgb(0x4a3d32), white = rgb(0xe2ddd2), tan = rgb(0x8a7458);
      let c = mixc(coat, dark, sstep(0.5, 1, n[1]) * 0.5);
      c = mixc(c, white, sstep(-0.35, -0.75, n[1]) * (part === 'body' || part === 'neck' ? 1 : 0));
      if (part === 'leg') c = mixc(c, tan, sstep(0.6, 0.3, p[1]));
      if (part === 'neck') c = mixc(c, white, gauss((p[1] - 1.24) / 0.05, 0) * sstep(0.2, 0.8, n[2]));
      if (part === 'head') { c = mixc(c, white, gauss((p[2] - 0.75) / 0.025, 0) * 0.8); c = mixc(c, white, sstep(0.1, -0.5, n[1]) * sstep(0.68, 0.74, p[2])); c = mixc(c, white, gauss((p[2] - 0.6) / 0.03, (p[1] - 1.41) / 0.02) * 0.7); }
      if (part === 'tail') c = mixc(c, white, sstep(0.0, -0.4, n[2] + n[1]));
      if (part === 'ear') c = mixc(c, white, sstep(0.0, 0.6, n[2]) * 0.6);
      return c;
    },
    rabbit: (p, n, part) => {
      const back = rgb(0x84776a), white = rgb(0xe8e6e1), dk = rgb(0x2a2420);
      let c = mixc(white, back, sstep(-0.1, 0.6, n[1]) * (part === 'leg' ? 0.2 : 0.85));
      if (part === 'tail') c = white;
      if (part === 'ear') c = mixc(back, dk, sstep(0.34, 0.38, p[1]));
      return c;
    },
  };
  const qGeoCache = {};
  function quadRig(sp) {
    const m = (a, s) => [a[0] * s, a[1], a[2]];
    const d = [['root', null, 0, 0, 0], ['pelvis', 'root', ...sp.pelvis], ['spine', 'pelvis', ...sp.spine], ['chest', 'spine', ...sp.chest], ['neck', 'chest', ...sp.neck], ['head', 'neck', ...sp.head], ['jaw', 'head', ...sp.jaw],
      ['earL', 'head', ...sp.ear.base], ['earR', 'head', ...m(sp.ear.base, -1)], ['tail0', 'pelvis', ...sp.tail[0]], ['tail1', 'tail0', ...sp.tail[1]], ['tail2', 'tail1', ...sp.tail[2]]];
    [['L', 1], ['R', -1]].forEach(([L, s]) => {
      d.push(['hl0' + L, 'pelvis', ...m(sp.hind[0], s)], ['hl1' + L, 'hl0' + L, ...m(sp.hind[1], s)], ['hl2' + L, 'hl1' + L, ...m(sp.hind[2], s)]);
      d.push(['fl0' + L, 'chest', ...m(sp.fore[0], s)], ['fl1' + L, 'fl0' + L, ...m(sp.fore[1], s)], ['fl2' + L, 'fl1' + L, ...m(sp.fore[2], s)]);
    });
    return Rig(d);
  }
  function quadGeo(kind, sp, rig) {
    const I = rig.i, f = new GB(true), e = new GB(true);
    const col = QCOL[kind];
    const C = (part) => (p, th, s, i, n) => col(p, [n.x, n.y, n.z], part, sp.S);
    const shag = kind === 'dog' ? 0.06 : kind === 'wolf' ? 0.07 : kind === 'fox' ? 0.04 : 0.025;
    const jit = (amt) => (p) => { const k = (vn(p.x * 90, p.y * 90, p.z * 90) - 0.5) * amt * sp.S * 0.06; return [k, k, k]; };
    const spineJ = [sp.pelvis, sp.spine, sp.chest, sp.neck];
    f.sweep(sp.body.map(([z, y, w, d]) => ({ p: [0, y, z], w, d, e: 2.2 })), { n: 22, ref: [0, 1, 0], cap0: sp.body[0][2] * 0.6, cap1: false, color: C('body'), bone: chainW([[0, sp.pelvis[1], sp.body[0][0]], sp.spine, sp.chest, [0, sp.chest[1], sp.body[sp.body.length - 1][0]]], [I.pelvis, I.spine, I.chest], 0.12 * sp.S / 1.0), jit: jit(shag), vary: 0.08, uvs: 1 / 0.12 });
    void spineJ;
    f.sweep(sp.neckR.map(([x, y, z, w, d]) => ({ p: [x, y, z], w, d })), { n: 18, ref: [0, 0.3, 1], cap0: false, cap1: false, color: C('neck'), bone: chainW([sp.chest, sp.neck, sp.head], [I.chest, I.neck], 0.06 * sp.S), jit: jit(shag * 1.4), vary: 0.08, uvs: 1 / 0.12 });
    const jawW = (p) => { const k = sstep(sp.jawLine + 0.004 * sp.S, sp.jawLine - 0.01 * sp.S, p[1]) * sstep(sp.jawZ - 0.02 * sp.S, sp.jawZ + 0.03 * sp.S, p[2]); return [[I.jaw, k], [I.head, 1 - k]]; };
    f.sweep(sp.headR.map(([z, y, w, d]) => ({ p: [0, y, z], w, d })), { n: 20, ref: [0, 1, 0], cap0: sp.headR[0][3] * 0.9, cap1: sp.headR[sp.headR.length - 1][2] * 0.8, color: C('head'), bone: jawW, jit: jit(shag * 0.5), vary: 0.05, uvs: 1 / 0.1 });
    // ears
    [1, -1].forEach((s) => {
      const E = sp.ear, b0 = [E.base[0] * s, E.base[1], E.base[2]], t0 = [E.tip[0] * s, E.tip[1], E.tip[2]];
      const mid = [lerp(b0[0], t0[0], 0.5), lerp(b0[1], t0[1], 0.5), lerp(b0[2], t0[2], 0.5) - E.d];
      f.sweep([{ p: b0, w: E.w, d: E.d * 1.6 }, { p: mid, w: E.w * 0.85, d: E.d }, { p: t0, w: E.w * 0.08, d: E.d * 0.5 }], { n: 10, ref: [0, 0, 1], e: 2.4, cap0: false, cap1: 0.004, color: C('ear'), bone: s > 0 ? I.earL : I.earR });
    });
    // tail
    f.sweep(sp.tail.map((p, k) => ({ p, w: sp.tailR[k] })), { n: 12, ref: [0, 1, 0], cap0: false, cap1: sp.tailR[sp.tailR.length - 1] * 1.2, color: C('tail'), bone: chainW(sp.tail, [I.tail0, I.tail1, I.tail2], 0.05 * sp.S), jit: jit(shag * 2.2), vary: 0.1, uvs: 1 / 0.12 });
    // legs
    [['L', 1], ['R', -1]].forEach(([L, s]) => {
      [['h', sp.hind, sp.hindR, I.pelvis], ['f', sp.fore, sp.foreR, I.chest]].forEach(([k, J, R, body]) => {
        const j = J.map((q) => [q[0] * s, q[1], q[2]]);
        const top = [j[0][0] * 0.7, j[0][1] + R[0] * 0.6, j[0][2]];
        const bones = [body, I[k + 'l0' + L], I[k + 'l1' + L], I[k + 'l2' + L]];
        const pts = [{ p: top, w: R[0] * 0.9 }, { p: j[0], w: R[0] }, { p: [lerp(j[0][0], j[1][0], 0.5), lerp(j[0][1], j[1][1], 0.5), lerp(j[0][2], j[1][2], 0.5)], w: lerp(R[0], R[1], 0.6) },
          { p: j[1], w: R[1] }, { p: [lerp(j[1][0], j[2][0], 0.5), lerp(j[1][1], j[2][1], 0.5), lerp(j[1][2], j[2][2], 0.5)], w: lerp(R[1], R[2], 0.5) }, { p: j[2], w: R[2] }, { p: j[3], w: R[3] }];
        f.sweep(pts, { n: 12, ref: [0, 0, 1], cap0: R[0] * 0.5, cap1: sp.paw === 'hoof' ? 0 : R[3], color: C('leg'), bone: chainW([top, j[0], j[1], j[2], j[3]], bones, 0.035 * sp.S), jit: jit(shag * (k === 'h' ? 1.2 : 0.8)), vary: 0.06, uvs: 1 / 0.12 });
        if (sp.paw === 'hoof') f.sweep([{ p: [j[3][0], j[3][1] + 0.025, j[3][2] - 0.01], w: R[3] * 1.05, d: R[3] * 1.2 }, { p: [j[3][0], j[3][1] - 0.02, j[3][2] + 0.012], w: R[3] * 1.15, d: R[3] * 1.5 }], { n: 10, cap0: false, cap1: 0, color: [0.03, 0.025, 0.02], bone: bones[3] });
        else f.ellip([j[3][0], j[3][1] - R[3] * 0.25, j[3][2] + R[3] * 0.8], R[3] * 1.2, R[3] * 0.8, R[3] * 1.6, { n: 10, rings: 6, color: C('leg'), bone: bones[3] });
      });
    });
    // eyes, nose
    [1, -1].forEach((s) => e.ellip([sp.eye[0] * s, sp.eye[1], sp.eye[2]], sp.eyeR * 0.8, sp.eyeR * 0.85, sp.eyeR, { n: 10, rings: 6, color: [0.02, 0.016, 0.012], bone: I.head }));
    e.ellip(sp.nose, sp.noseR * 1.1, sp.noseR * 0.8, sp.noseR * 0.9, { n: 10, rings: 6, color: [0.025, 0.02, 0.02], bone: I.head });
    return { fur: shareGeo(f.geo()), eye: shareGeo(e.geo()), tris: f.tris() + e.tris() };
  }
  const furMat = (kind) => R3.mat('cr:fur:' + kind, () => R3.std({ vertexColors: true, roughness: 0.96, metalness: 0, normalMap: TX.fur(), normalScale: new THREE.Vector2(0.9, 0.9) }));
  const animEyeMat = () => R3.mat('cr:aeye', () => R3.std({ vertexColors: true, roughness: 0.12, metalness: 0 }));

  // gait: leg angle (positive = leg swung back) and lift (0..1) for phase ph (0..1), duty beta
  function legCycle(ph, beta) {
    ph = ((ph % 1) + 1) % 1;
    if (ph < beta) return [lerp(-1, 1, ph / beta), 0];
    const u = (ph - beta) / (1 - beta);
    return [lerp(1, -1, sstep(0, 1, u)), Math.sin(u * PI)];
  }
  const GAITS = {
    walk: { ph: { hlL: 0, flL: 0.25, hlR: 0.5, flR: 0.75 }, beta: 0.66, A: 0.32, lift: 0.7, stride: 1.25, bob: 0.01 },
    trot: { ph: { hlL: 0, flR: 0.0, hlR: 0.5, flL: 0.5 }, beta: 0.45, A: 0.45, lift: 1, stride: 1.9, bob: 0.02 },
    gallop: { ph: { hlL: 0, hlR: 0.08, flL: 0.5, flR: 0.58 }, beta: 0.36, A: 0.62, lift: 1.25, stride: 3.0, bob: 0.04, flex: 0.16 },
    hop: { ph: { hlL: 0, hlR: 0.02, flL: 0.45, flR: 0.5 }, beta: 0.4, A: 0.7, lift: 1.3, stride: 2.4, bob: 0.06, flex: 0.25 },
  };
  function buildQuad(kind, opts) {
    const sp = kind === 'deer' ? deerSpec() : kind === 'rabbit' ? hareSpec() : kind === 'wolf' ? canid({ size: 1.22, leg: 0.03, muzzle: 0.0, slim: 1.2, bulk: 1.18, earL: 1.15, earW: 1.1 }) : kind === 'fox' ? canid({ size: 0.66, leg: 0.0, muzzle: 0.22, tail: 'brush', earL: 1.3, earW: 1.15, slim: 0.95 }) : canid({ size: 1.0, tail: 'curl', earL: 1.0 });
    const rig = quadRig(sp);
    const G = qGeoCache[kind] || (qGeoCache[kind] = quadGeo(kind, sp, rig));
    const A = assemble(rig, [{ name: 'fur', geo: G.fur, mat: furMat(kind) }, { name: 'eye', geo: G.eye, mat: animEyeMat(), shadow: false }], [0, sp.chest[1], 0, Math.max(0.5, sp.S * 0.75)]);
    const b = rig.b;
    // eyeshine (lantern light reflected in the eyes): wolves at night, everyone faintly
    const shine = [1, -1].map((s) => { const g = glowDot(kind === 'wolf' ? 0xffb040 : 0xd8e8b0, sp.eyeR * 4); g.position.set(sp.eye[0] * s - sp.head[0], sp.eye[1] - sp.head[1], sp.eye[2] - sp.head[2] + sp.eyeR * 0.9); b.head.add(g); g.visible = false; return g; });
    // dog extras: snare wire when trapped
    let snare = null;
    if (kind === 'dog') {
      const sg = new GB(false);
      sg.sweep([{ p: [0, 0.02, 0], w: 0.003 }, { p: [0, 0.02, -0.55], w: 0.003 }], { n: 5, color: [0.35, 0.36, 0.38] });
      sg.sweep([{ p: [0, -0.05, -0.55], w: 0.014 }, { p: [0, 0.12, -0.56], w: 0.016 }], { n: 8, color: [0.3, 0.22, 0.14] });
      snare = new THREE.Mesh(sg.geo(), R3.mat('cr:snare', () => R3.std({ vertexColors: true, roughness: 0.4, metalness: 0.5 })));
      snare.visible = false; A.obj.add(snare);
    }
    const S = { t: Math.random() * 10, ph: Math.random(), spd: 0, mv: 0, gait: 'walk', earT: 0, ear: 0, lunge: 9, sitT: 0, crouch: 0 };
    const legLen = sp.hind[0][1];
    const seed = Math.random() * 10;
    function update(dt, st, ctx) {
      st = st || {}; dt = Math.min(0.1, dt || 0.016);
      const t = (S.t += dt);
      rig.reset();
      const moving = !!st.moving && !st.dead;
      const spd = st.speed != null ? st.speed : moving ? (kind === 'deer' ? 1.2 : 1) : 0;
      S.spd = lerp(S.spd, moving ? Math.max(0.3, Math.min(spd, 8)) : 0, Math.min(1, dt * 4));
      S.mv = lerp(S.mv, moving ? 1 : 0, Math.min(1, dt * 6));
      const rel = S.spd / Math.max(0.1, legLen);
      let gait = kind === 'rabbit' ? 'hop' : rel < 2.6 ? 'walk' : rel < 5.5 && kind !== 'deer' ? 'trot' : 'gallop';
      if (kind === 'deer' && rel >= 2.2) gait = 'gallop';
      if (st.pose === 'walk' && kind === 'dog') gait = 'trot';
      S.gait = gait;
      const g = GAITS[gait];
      S.ph += dt * Math.max(S.spd, moving ? 0.6 : 0) / (legLen * g.stride) * (moving ? 1 : 0);
      const mv = S.mv;
      // idle life: breathing, ears, tail, head
      const br = Math.sin(t * 2.4 + seed);
      b.chest.scale.set(1 + br * 0.012, 1 + br * 0.015, 1);
      S.earT -= dt; if (S.earT < 0) { S.earT = 1 + Math.random() * 4; S.ear = 0.35; }
      S.ear = Math.max(0, S.ear - dt * 2);
      b.earL.rotation.x = -Math.sin(S.ear * 18) * S.ear; b.earR.rotation.z = Math.sin(S.ear * 14) * S.ear * 0.5;
      b.head.rotation.y = 0.25 * n1(t * 0.4, seed) * (1 - mv); b.head.rotation.x = 0.08 * n1(t * 0.33, seed + 3);
      b.tail0.rotation.y = 0.15 * Math.sin(t * (kind === 'dog' ? 5 : 1.3));
      if (kind === 'deer') { b.tail0.rotation.y = 0.2 * Math.sin(t * 7) * (Math.sin(t * 0.7) > 0.6 ? 1 : 0); if (gait === 'gallop' && moving) b.tail0.rotation.x = -1.3; }
      if (kind === 'wolf' || kind === 'fox') b.tail0.rotation.x = -0.15 * mv;
      // gait legs
      if (mv > 0.01) {
        const legs = [['hlL', 'h'], ['hlR', 'h'], ['flL', 'f'], ['flR', 'f']];
        legs.forEach(([k, typ]) => {
          const [ang, lift] = legCycle(S.ph + g.ph[k], g.beta);
          const L = k.slice(-1), A0 = g.A * mv, lf = lift * g.lift * mv;
          if (typ === 'h') { b['hl0' + L].rotation.x += ang * A0 * 0.8 - lf * 0.15; b['hl1' + L].rotation.x += lf * 0.55 + ang * A0 * 0.2; b['hl2' + L].rotation.x -= lf * 0.75; }
          else { b['fl0' + L].rotation.x += ang * A0 * 0.85 - lf * 0.3; b['fl1' + L].rotation.x -= lf * 0.2; b['fl2' + L].rotation.x += lf * 1.25; }
        });
        const c = S.ph * TAU;
        b.pelvis.position.y += Math.abs(Math.sin(c * (gait === 'walk' ? 2 : 1))) * g.bob * sp.S * mv - g.bob * 0.5 * sp.S * mv;
        if (g.flex) { const fl = Math.sin(c + 0.6) * g.flex * mv; b.spine.rotation.x += fl; b.chest.rotation.x -= fl * 1.2; b.pelvis.rotation.x -= fl * 0.4; b.neck.rotation.x += fl * 0.6; }
        b.neck.rotation.x += Math.sin(c * 2) * 0.03 * mv;
        if (gait === 'gallop' || gait === 'hop') { b.neck.rotation.x -= 0.15 * mv; b.earL.rotation.x += 0.4 * mv; b.earR.rotation.x += 0.4 * mv; }
        if (kind === 'rabbit') { const u = (((S.ph % 1) + 1) % 1); const air = Math.max(0, Math.sin(clamp((u - 0.02) / 0.5, 0, 1) * PI)); b.root.position.y += air * 0.07 * mv; b.pelvis.rotation.x -= air * 0.3 * mv; }
      }
      if (kind === 'rabbit' && mv < 0.5) { // crouched: nose twitch
        b.head.position.z += Math.sin(t * 22) * 0.0015 * (Math.sin(t * 0.9) > 0 ? 1 : 0);
        b.earL.rotation.x -= 0.15; b.earR.rotation.x -= 0.15;
      }
      if (st.grazing && !moving) {
        // nose down to the snow, now and then lifting the head to look around
        S.gz = lerp(S.gz || 0, 0.5 + 0.5 * Math.sin(t * 0.25 + seed) > 0.2 ? 1 : 0.15, Math.min(1, dt * 2.5));
        const gz = S.gz, deep = kind === 'deer' ? 1 : 0.6;
        b.chest.rotation.x += 0.16 * gz * deep; b.neck.rotation.x += (1.05 + 0.8 * deep) * gz; b.head.rotation.x += (0.45 + 0.35 * deep) * gz + Math.sin(t * 5) * 0.04 * gz;
        b.fl0L.rotation.x -= 0.16 * gz; b.fl0R.rotation.x += 0.08 * gz;
      }
      // wolf: growl / lunge
      if (kind === 'wolf') {
        if (st.state === 'warn' || (st.angry && !moving && st.state !== 'chase')) {
          b.pelvis.position.y -= 0.08; b.chest.rotation.x += 0.12; b.neck.rotation.x += 0.35; b.head.rotation.x -= 0.25;
          b.hl0L.rotation.x -= 0.35; b.hl1L.rotation.x += 0.5; b.hl2L.rotation.x -= 0.25; b.hl0R.rotation.x -= 0.35; b.hl1R.rotation.x += 0.5; b.hl2R.rotation.x -= 0.25;
          b.fl0L.rotation.x -= 0.1; b.fl0R.rotation.x -= 0.1; b.fl1L.rotation.x += 0.2; b.fl1R.rotation.x += 0.2;
          b.jaw.rotation.x = 0.22 + Math.sin(t * 30) * 0.02; b.earL.rotation.x = 0.6; b.earR.rotation.x = 0.6; b.tail0.rotation.x = 0.3;
        }
        if (st.angry && st.state === 'chase' && S.spd < 0.8) { if (S.lunge > 1.3) S.lunge = 0; }
        if (S.lunge < 0.7) {
          const u = S.lunge / 0.7, k = Math.sin(u * PI);
          b.root.position.z += k * 0.6; b.root.position.y += k * 0.25; b.pelvis.rotation.x -= k * 0.25;
          b.fl0L.rotation.x -= k * 1.0; b.fl0R.rotation.x -= k * 1.1; b.hl0L.rotation.x += k * 0.6; b.hl0R.rotation.x += k * 0.6; b.jaw.rotation.x = 0.45 * k; b.neck.rotation.x -= 0.2 * k;
        }
        S.lunge += dt;
      }
      // dog poses
      const pose = st.pose;
      if (kind === 'dog' && pose === 'lie') {
        b.pelvis.position.y -= 0.36; b.chest.position.y -= 0.0; b.root.position.y += 0.0;
        b.root.rotation.z = 0.25; b.root.position.y = -0.05;
        b.hl0L.rotation.x = -1.0; b.hl1L.rotation.x = 2.2; b.hl2L.rotation.x = -1.6; b.hl0R.rotation.x = -1.0; b.hl1R.rotation.x = 2.2; b.hl2R.rotation.x = -1.6;
        b.hl0L.rotation.z = -0.5; b.hl0R.rotation.z = 0.3;
        b.chest.rotation.x = 0.15; b.spine.rotation.y = 0.35; b.chest.rotation.y = 0.35; b.spine.position.y -= 0.0;
        b.fl0L.rotation.x = -1.35; b.fl1L.rotation.x = 0.2; b.fl2L.rotation.x = 0.1; b.fl0R.rotation.x = -1.35; b.fl1R.rotation.x = 0.2; b.fl2R.rotation.x = 0.1;
        b.chest.position.y -= 0.0;
        b.neck.rotation.x = 0.55; b.neck.rotation.y = 0.5; b.head.rotation.x = 0.0; b.head.rotation.z = -0.1;
        b.tail0.rotation.x = 1.8; b.tail0.rotation.y = 0.8; b.tail1.rotation.y = 0.6;
        b.pelvis.position.y += 0.0;
        // breathing while asleep
        b.chest.scale.y = 1 + Math.sin(t * 1.4) * 0.03;
      } else if (kind === 'dog' && pose === 'trapped') {
        const tug = Math.max(0, Math.sin(t * 2.6)) ** 3;
        b.hl0L.rotation.x = 0.9 + tug * 0.15; b.hl1L.rotation.x = -0.2; b.hl2L.rotation.x = 0.3;
        b.pelvis.rotation.x = -0.05; b.root.position.z += tug * 0.05;
        b.fl0L.rotation.x = -0.35 - tug * 0.2; b.fl0R.rotation.x = -0.25 - tug * 0.25; b.fl2L.rotation.x = 0.1; b.hl0R.rotation.x = -0.15;
        b.chest.rotation.x = 0.12 + tug * 0.1; b.neck.rotation.x = 0.35; b.head.rotation.x = -0.2; b.head.rotation.y = Math.sin(t * 1.3) * 0.4;
        b.tail0.rotation.x = 1.4; b.earL.rotation.x = 0.7; b.earR.rotation.x = 0.7;
      }
      if (snare) {
        snare.visible = pose === 'trapped';
        if (snare.visible) { A.obj.updateMatrixWorld(true); const pp = new V3(); b.hl2L.getWorldPosition(pp); A.obj.worldToLocal(pp); snare.position.set(pp.x, 0, pp.z - 0.06); snare.scale.set(1, 1, 1); }
      }
      if (st.injured || (kind === 'deer' && pose === 'lie')) {
        // lying sternal, legs folded, head up, laboured breathing
        const dy = sp.pelvis[1] * 0.68;
        b.pelvis.position.y -= dy; b.root.position.y -= 0;
        ['L', 'R'].forEach((L, i) => { const s = i ? -1 : 1;
          b['hl0' + L].rotation.x = -1.1; b['hl1' + L].rotation.x = 2.4; b['hl2' + L].rotation.x = -2.0; b['hl0' + L].rotation.z = -0.25 * s;
          b['fl0' + L].rotation.x = -0.6; b['fl1' + L].rotation.x = 0.9; b['fl2' + L].rotation.x = 2.2; });
        b.spine.rotation.z = 0.08; b.neck.rotation.x = -0.15 + Math.sin(t * 0.4) * 0.08; b.head.rotation.x = 0.25;
        b.chest.scale.set(1 + Math.sin(t * 3.2) * 0.03, 1 + Math.sin(t * 3.2) * 0.04, 1);
        b.earL.rotation.x = 0.5; b.earR.rotation.x = 0.5;
      }
      if (st.dead) {
        const hw = (sp.body[3][2] || 0.1) * 0.9;
        b.root.rotation.z = PI / 2; b.root.position.x = sp.pelvis[1] - hw; b.root.position.y = hw;
        ['L', 'R'].forEach((L, i) => { b['hl0' + L].rotation.x = 0.35 + i * 0.25; b['fl0' + L].rotation.x = -0.4 - i * 0.2; b['fl2' + L].rotation.x = 0.4; b['hl1' + L].rotation.x = 0.2; });
        b.neck.rotation.x = -0.4; b.head.rotation.x = -0.2; b.jaw.rotation.x = 0.12; b.chest.scale.set(1, 1, 1); b.tail0.rotation.x = 0.3;
        b.earL.rotation.x = 0.3; b.earR.rotation.x = 0.3;
      }
      // eyeshine: visible only in the dark, toward the light
      const night = ctx && NW.Survival ? NW.Survival.daylight() < 0.3 : false;
      const sh = st.dead ? 0 : night ? (kind === 'wolf' ? (st.angry ? 0.9 : 0.55) : 0.3) : 0;
      shine.forEach((g) => { g.visible = sh > 0.01; g.material.opacity = sh * (0.8 + 0.2 * Math.sin(t * 3 + seed)); });
    }
    update(0.016, {}, null);
    return { obj: A.obj, update, dispose() { shine.forEach((g) => g.material.dispose()); }, rig, tris: G.tris, kind };
  }

  // =================================================================== CROW
  let crowG = null;
  function buildCrow() {
    const rig = Rig([['root', null, 0, 0, 0], ['body', 'root', 0, 0.09, 0], ['neck', 'body', 0, 0.12, 0.06], ['head', 'neck', 0, 0.15, 0.09], ['tail', 'body', 0, 0.09, -0.07],
      ['wL0', 'body', 0.035, 0.115, 0.03], ['wL1', 'wL0', 0.2, 0.115, 0.01], ['wR0', 'body', -0.035, 0.115, 0.03], ['wR1', 'wR0', -0.2, 0.115, 0.01], ['legL', 'body', 0.02, 0.06, 0.0], ['legR', 'body', -0.02, 0.06, 0.0]]);
    const I = rig.i;
    if (!crowG) {
      const f = new GB(true), black = [0.018, 0.02, 0.026];
      f.ellip([0, 0.1, 0.0], 0.045, 0.048, 0.1, { axis: 'z', n: 14, rings: 9, color: black, bone: (p) => (p[2] > 0.06 ? [[I.neck, 1]] : p[2] < -0.06 ? [[I.tail, 0.5], [I.body, 0.5]] : [[I.body, 1]]), vary: 0.2 });
      f.ellip([0, 0.15, 0.1], 0.03, 0.03, 0.036, { axis: 'z', n: 12, rings: 7, color: black, bone: I.head, vary: 0.2 });
      f.sweep([{ p: [0, 0.15, 0.125], w: 0.012, d: 0.014 }, { p: [0, 0.145, 0.165], w: 0.006, d: 0.008 }, { p: [0, 0.138, 0.185], w: 0.001, d: 0.001 }], { n: 8, ref: [0, 1, 0], cap0: false, cap1: false, color: [0.03, 0.03, 0.035], bone: I.head });
      f.sweep([{ p: [0, 0.095, -0.07], w: 0.03, d: 0.006 }, { p: [0, 0.085, -0.15], w: 0.045, d: 0.004 }, { p: [0, 0.08, -0.2], w: 0.05, d: 0.003 }], { n: 10, ref: [0, 1, 0], cap1: 0.01, color: black, bone: I.tail });
      [1, -1].forEach((s) => {
        const L = s > 0 ? 'L' : 'R';
        f.sweep([{ p: [s * 0.03, 0.115, 0.03], w: 0.045, d: 0.008 }, { p: [s * 0.12, 0.115, 0.015], w: 0.06, d: 0.006 }, { p: [s * 0.2, 0.115, 0.0], w: 0.065, d: 0.005 }, { p: [s * 0.3, 0.115, -0.02], w: 0.055, d: 0.004 }, { p: [s * 0.36, 0.115, -0.04], w: 0.03, d: 0.003 }],
          { n: 10, ref: [0, 1, 0], e: 3, cap1: 0.02, color: black, bone: chainW([[s * 0.03, 0.115, 0.03], [s * 0.2, 0.115, 0.01], [s * 0.36, 0.115, -0.04]], [I['w' + L + '0'], I['w' + L + '1']], 0.03), jit: (p) => [0, 0, Math.abs(p.x) > 0.15 ? Math.sin(p.z * 400 + p.x * 90) * 0.006 : 0] });
        f.sweep([{ p: [s * 0.02, 0.07, 0], w: 0.004 }, { p: [s * 0.02, 0.0, 0.005], w: 0.003 }], { n: 5, color: [0.05, 0.05, 0.05], bone: I['leg' + L] });
        f.sweep([{ p: [s * 0.02, 0.003, -0.02], w: 0.003, d: 0.002 }, { p: [s * 0.02, 0.003, 0.04], w: 0.003, d: 0.002 }], { n: 5, ref: [0, 1, 0], color: [0.05, 0.05, 0.05], bone: I['leg' + L] });
      });
      const e = new GB(true);
      [1, -1].forEach((s) => e.ellip([s * 0.024, 0.158, 0.112], 0.006, 0.006, 0.006, { n: 8, rings: 5, color: [0.01, 0.01, 0.01], bone: I.head }));
      crowG = { f: shareGeo(f.geo()), e: shareGeo(e.geo()), tris: f.tris() + e.tris() };
    }
    const mat = R3.mat('cr:crow', () => R3.std({ vertexColors: true, roughness: 0.42, metalness: 0.1, normalMap: TX.fur(), normalScale: new THREE.Vector2(0.4, 0.4) }));
    const A = assemble(rig, [{ name: 'f', geo: crowG.f, mat }, { name: 'e', geo: crowG.e, mat: animEyeMat(), shadow: false }], [0, 0.1, 0, 0.45]);
    const b = rig.b, S = { t: Math.random() * 5, hop: 9, peck: 9, nextT: 1 };
    function update(dt, st) {
      st = st || {}; dt = Math.min(0.1, dt || 0.016);
      const t = (S.t += dt); rig.reset();
      if (st.dead) { b.root.rotation.z = PI / 2; b.root.position.y = 0.04; b.wL0.rotation.z = 0.3; b.wL0.rotation.y = 0.4; return; }
      if (st.flying) {
        const f = Math.sin(t * 15);
        b.wL0.rotation.z = f * 0.9; b.wR0.rotation.z = -f * 0.9; b.wL1.rotation.z = f * 0.5; b.wR1.rotation.z = -f * 0.5;
        b.body.rotation.x = -0.2; b.legL.rotation.x = 1.2; b.legR.rotation.x = 1.2; b.root.position.y = Math.sin(t * 15 + 1) * 0.02;
        b.tail.rotation.x = 0.1;
        return;
      }
      // perched: fold wings along the body, hop and peck now and then
      b.wL0.rotation.y = 1.45; b.wR0.rotation.y = -1.45; b.wL0.rotation.z = -0.25; b.wR0.rotation.z = 0.25; b.wL1.rotation.y = 1.4; b.wR1.rotation.y = -1.4;
      b.wL0.position.y -= 0.005; b.wR0.position.y -= 0.005;
      b.body.rotation.x = -0.25; b.tail.rotation.x = 0.35; b.neck.rotation.x = 0.1;
      S.nextT -= dt;
      if (S.nextT <= 0) { S.nextT = 0.8 + Math.random() * 2; if (Math.random() < 0.5) S.hop = 0; else S.peck = 0; }
      if (S.hop < 0.3) { const k = Math.sin(S.hop / 0.3 * PI); b.root.position.y += k * 0.05; b.wL0.rotation.z -= k * 0.5; b.wR0.rotation.z += k * 0.5; }
      if (S.peck < 0.5) { const k = Math.sin(S.peck / 0.5 * PI); b.neck.rotation.x += k * 0.9; b.head.rotation.x += k * 0.4; b.body.rotation.x += k * 0.4; }
      S.hop += dt; S.peck += dt;
      b.head.rotation.y = Math.round(n1(t * 0.7, 3) * 3) * 0.3;
    }
    update(0.016, {});
    return { obj: A.obj, update, rig, tris: crowG.tris, kind: 'crow' };
  }

  // =================================================================== GAUNT FIGURES (Light Hunter, Pale Stag)
  // limb with optional knob joints; J = joint list, R = radius per joint, bones per segment (+ body first)
  function limb(gb, J, R, bones, o) {
    const pts = [];
    for (let k = 0; k < J.length; k++) {
      pts.push({ p: J[k], w: R[k] * (o.wk || 1), d: R[k] });
      if (k < J.length - 1) { const a = J[k], c = J[k + 1]; pts.push({ p: [lerp(a[0], c[0], 0.5), lerp(a[1], c[1], 0.5), lerp(a[2], c[2], 0.5)], w: lerp(R[k], R[k + 1], 0.5) * (o.mid || 0.85) * (o.wk || 1), d: lerp(R[k], R[k + 1], 0.5) * (o.mid || 0.85) }); }
    }
    gb.sweep(pts, Object.assign({ n: 12, bone: chainW(J, bones, o.bl || 0.04) }, o));
  }
  function handFingers(gb, s, wrist, len, R, bone, col, spread, curl) {
    // palm then 4 long fingers and a thumb (hanging down, palm facing in)
    const w = wrist, pl = len * 0.35;
    gb.sweep([{ p: w, w: R * 0.7, d: R * 1.6 }, { p: [w[0] + s * 0.002, w[1] - pl * 0.5, w[2] + 0.004], w: R * 0.75, d: R * 2.3 }, { p: [w[0], w[1] - pl, w[2] + 0.006], w: R * 0.65, d: R * 2.2 }], { n: 10, cap0: false, cap1: R * 0.5, color: col, bone });
    for (let f = 0; f < 4; f++) {
      const z = w[2] + 0.006 + (f - 1.5) * R * 1.05 * (spread || 1), fl = len * 0.65 * [0.85, 1, 0.95, 0.75][f], y0 = w[1] - pl * 0.92;
      const c = curl || 0;
      gb.sweep([{ p: [w[0], y0, z], w: R * 0.38 }, { p: [w[0] - s * c * 0.01, y0 - fl * 0.35, z + (f - 1.5) * 0.004 + c * 0.012], w: R * 0.36 }, { p: [w[0] - s * c * 0.02, y0 - fl * 0.7, z + (f - 1.5) * 0.007 + c * 0.03], w: R * 0.32 }, { p: [w[0] - s * c * 0.03, y0 - fl, z + (f - 1.5) * 0.009 + c * 0.05], w: R * 0.22 }],
        { n: 7, cap0: false, cap1: R * 0.3, color: col, bone, mod: (th, sN) => 1 + 0.18 * Math.pow(Math.abs(Math.sin(sN * PI * 3)), 8) });
    }
    gb.sweep([{ p: [w[0] - s * 0.004, w[1] - pl * 0.3, w[2] + R * 1.8], w: R * 0.4 }, { p: [w[0] - s * 0.008, w[1] - pl * 0.3 - len * 0.25, w[2] + R * 2.6], w: R * 0.3 }], { n: 7, cap1: R * 0.3, color: col, bone });
  }

  function buildLightHunter() {
    const J = { hips: [0, 1.5, 0], spine: [0, 1.72, 0], chest: [0, 2.0, 0], neck: [0, 2.32, 0.01], head: [0, 2.44, 0.03], jaw: [0, 2.5, 0.04],
      armL: [0.25, 2.25, 0], foreL: [0.28, 1.72, -0.02], handL: [0.3, 1.2, 0], thighL: [0.1, 1.47, 0], shinL: [0.105, 0.8, 0.02], footL: [0.1, 0.07, -0.01] };
    const defs = [['root', null, 0, 0, 0], ['hips', 'root', ...J.hips], ['spine', 'hips', ...J.spine], ['chest', 'spine', ...J.chest], ['neck', 'chest', ...J.neck], ['head', 'neck', ...J.head], ['jaw', 'head', ...J.jaw]];
    const mir = (a) => [-a[0], a[1], a[2]];
    [['L', (a) => a], ['R', mir]].forEach(([L, m]) => defs.push(['arm' + L, 'chest', ...m(J.armL)], ['fore' + L, 'arm' + L, ...m(J.foreL)], ['hand' + L, 'fore' + L, ...m(J.handL)], ['thigh' + L, 'hips', ...m(J.thighL)], ['shin' + L, 'thigh' + L, ...m(J.shinL)], ['foot' + L, 'shin' + L, ...m(J.footL)]));
    const rig = Rig(defs), I = rig.i;
    const bd = new GB(true), hd = new GB(true);
    const pale = rgb(0xc9c6bb), hollow = rgb(0x85827a), dirt = rgb(0x5d5a52);
    const ribs = (th, y) => {
      const c = Math.cos(th);
      let m = 1;
      if (y > 1.84 && y < 2.17) m += (0.05 * Math.pow(Math.abs(Math.sin((y - 1.84) / 0.042 * PI)), 4) - 0.025) * (c > -0.4 ? 1 : 0.3);
      if (c < -0.85) m += 0.06 * Math.pow(Math.abs(Math.sin(y / 0.04 * PI)), 6) * sstep(1.55, 1.65, y);
      if (c > 0.2) m -= 0.1 * sstep(1.6, 1.68, y) * sstep(1.82, 1.74, y);
      m += 0.06 * gauss((Math.abs(Math.sin(th)) - 0.75) / 0.2, (y - 1.5) / 0.03) * (c > 0 ? 1 : 0);
      m += 0.05 * gauss((Math.abs(Math.sin(th)) - 0.5) / 0.3, (y - 2.25) / 0.012) * (c > 0 ? 1 : 0); // clavicles
      return m;
    };
    const torsoCol = (p, th) => { const y = p[1], c = Math.cos(th); let k = 0; if (y > 1.84 && y < 2.17) k = (1 - Math.pow(Math.abs(Math.sin((y - 1.84) / 0.042 * PI)), 2)) * 0.6 * (c > -0.4 ? 1 : 0.3); if (c > 0.2) k = Math.max(k, 0.5 * sstep(1.62, 1.7, y) * sstep(1.82, 1.74, y)); return mixc(pale, hollow, k); };
    const TR = [[1.42, 0.12, 0.08, 0], [1.5, 0.135, 0.085, 0], [1.6, 0.11, 0.07, 0], [1.72, 0.092, 0.06, 0.005], [1.82, 0.12, 0.08, 0.01], [1.95, 0.145, 0.095, 0.01], [2.08, 0.155, 0.1, 0.005], [2.18, 0.16, 0.09, 0], [2.25, 0.15, 0.072, -0.005], [2.3, 0.08, 0.055, 0], [2.36, 0.042, 0.042, 0.01]];
    bd.sweep(TR.map((r) => ({ p: [0, r[0], r[3]], w: r[1], d: r[2], e: 2.3 })), { n: 26, cap0: 0.04, cap1: false, mod: (th, s, i, p) => ribs(th, p.y), color: torsoCol, bone: chainW([[0, 1.42, 0], J.spine, J.chest, J.neck], [I.hips, I.spine, I.chest], 0.1), vary: 0.05, uvs: 8 });
    bd.sweep([{ p: [0, 2.28, 0.0], w: 0.036 }, { p: [0, 2.38, 0.02], w: 0.031 }, { p: [0, 2.47, 0.03], w: 0.03 }], { n: 12, cap0: false, cap1: false, color: pale, bone: chainW([J.chest, J.neck, J.head], [I.chest, I.neck], 0.05), mod: (th) => 1 + 0.15 * Math.pow(Math.max(0, Math.cos(th)), 6) });
    [1, -1].forEach((s) => {
      const L = s > 0 ? 'L' : 'R', m = (a) => [a[0] * s, a[1], a[2]];
      limb(bd, [m([0.2, 2.28, 0]), m(J.armL), m(J.foreL), m(J.handL)], [0.035, 0.036, 0.036, 0.021], [I.chest, I['arm' + L], I['fore' + L]], { n: 12, cap0: 0.02, cap1: false, color: (p) => mixc(pale, dirt, sstep(1.4, 1.2, p[1]) * 0.6), mid: 0.75, vary: 0.05 });
      handFingers(bd, s, m(J.handL), 0.42, 0.02, I['hand' + L], mixc(pale, dirt, 0.55), 1.1, 0.2);
      limb(bd, [m([0.09, 1.55, 0]), m(J.thighL), m(J.shinL), m(J.footL)], [0.06, 0.058, 0.043, 0.024], [I.hips, I['thigh' + L], I['shin' + L]], { n: 12, cap0: false, cap1: false, color: (p) => mixc(pale, dirt, sstep(0.5, 0.1, p[1]) * 0.7), mid: 0.78, vary: 0.05 });
      bd.sweep([{ p: m([0.1, 0.09, -0.04]), w: 0.024, d: 0.03 }, { p: m([0.1, 0.04, 0.05]), w: 0.03, d: 0.02 }, { p: m([0.1, 0.018, 0.17]), w: 0.026, d: 0.012 }, { p: m([0.1, 0.01, 0.23]), w: 0.016, d: 0.008 }], { n: 10, ref: [0, 1, 0], cap0: 0.02, cap1: 0.01, color: dirt, bone: I['foot' + L] });
    });
    // featureless elongated head, shallow sockets, a mouth that runs too long
    const HRl = [[2.43, 0.03, 0.035, 0.06], [2.46, 0.045, 0.055, 0.05], [2.52, 0.056, 0.07, 0.035], [2.6, 0.065, 0.082, 0.02], [2.68, 0.07, 0.088, 0.005], [2.76, 0.068, 0.09, -0.012], [2.82, 0.056, 0.078, -0.03], [2.86, 0.032, 0.048, -0.045]];
    const hmod = (th, y) => { const a = Math.atan2(Math.sin(th), Math.cos(th)); return 1 - 0.13 * gauss((Math.abs(a) - 0.45) / 0.25, (y - 2.64) / 0.03) - 0.08 * gauss((Math.abs(a) - 0.8) / 0.3, (y - 2.56) / 0.03); };
    hd.sweep(HRl.map((r) => ({ p: [0, r[0], r[3]], w: r[1], d: r[2] })), { n: 28, cap0: 0.015, cap1: 0.02, mod: (th, s, i, p) => hmod(th, p.y),
      color: (p, th) => { const a = Math.atan2(Math.sin(th), Math.cos(th)); return mixc(rgb(0xd8d5ca), [0.04, 0.04, 0.045], 0.85 * gauss((Math.abs(a) - 0.45) / 0.18, (p[1] - 2.64) / 0.02)); },
      bone: (p) => { const k = sstep(2.51, 2.49, p[1]) * sstep(0.0, 0.05, p[2]); return [[I.jaw, k], [I.head, 1 - k]]; }, vary: 0.04 });
    hd.ellip([0, 2.502, 0.105 + 0.0], 0.05, 0.004, 0.02, { n: 16, rings: 6, color: [0.02, 0.015, 0.015], bone: (p) => (p[1] < 2.502 ? [[I.jaw, 1]] : [[I.head, 1]]) });
    const mBody = R3.mat('cr:lh', () => R3.std({ vertexColors: true, roughness: 0.58, metalness: 0, normalMap: TX.skin(), normalScale: new THREE.Vector2(0.6, 0.6), emissive: 0x1a1b1f }));
    const mHead = R3.mat('cr:lhhead', () => R3.std({ vertexColors: true, roughness: 0.5, metalness: 0, emissive: 0x3a3b40 }));
    const A = assemble(rig, [{ name: 'body', geo: bd.geo(), mat: mBody }, { name: 'head', geo: hd.geo(), mat: mHead }], [0, 1.4, 0, 1.7]);
    const b = rig.b;
    const eyes = [1, -1].map((s) => { const g = glowDot(0xfff4c4, 0.05); g.position.set(s * 0.03, 2.64 - 2.44, 0.07); b.head.add(g); return g; });
    const S = { t: Math.random() * 10, ph: 0, jerk: 0, jT: 2 };
    function update(dt, st) {
      st = st || {}; dt = Math.min(0.1, dt || 0.016);
      const t = (S.t += dt); rig.reset();
      const stage = st.stage || 'menu';
      const br = Math.sin(t * 1.3);
      b.chest.scale.set(1 + br * 0.02, 1, 1 + br * 0.025);
      S.jT -= dt; if (S.jT < 0) { S.jT = 1.5 + Math.random() * 4; S.jerk = (Math.random() - 0.5) * 0.9; }
      const jerkTilt = S.jerk;
      b.armL.rotation.z = 0.06; b.armR.rotation.z = -0.06; b.foreL.rotation.x = -0.1; b.foreR.rotation.x = -0.1;
      if (stage === 'window') {
        // folded down to the glass: knees bent, back curved, hands flat on the pane, face against it
        b.hips.position.y -= 0.42; b.hips.position.z -= 0.22;
        b.thighL.rotation.x = -0.75; b.thighR.rotation.x = -0.7; b.shinL.rotation.x = 1.25; b.shinR.rotation.x = 1.2; b.footL.rotation.x = -0.5; b.footR.rotation.x = -0.5;
        b.thighL.rotation.z = 0.12; b.thighR.rotation.z = -0.12;
        b.spine.rotation.x = 0.45; b.chest.rotation.x = 0.35 + br * 0.02; b.neck.rotation.x = 0.1; b.head.rotation.x = -0.55 + Math.sin(t * 0.7) * 0.03; b.head.rotation.z = 0.12 * Math.sin(t * 0.23);
        [['L', 1], ['R', -1]].forEach(([L, s]) => {
          b['arm' + L].rotation.x = -2.05; b['arm' + L].rotation.z = s * 0.55; b['fore' + L].rotation.x = -0.45; b['fore' + L].rotation.z = -s * 0.2;
          b['hand' + L].rotation.y = -s * 1.45; b['hand' + L].rotation.x = 0.5;
        });
        b.handL.rotation.z = Math.sin(t * 0.9) * 0.05; // fingers creeping on the glass
        b.jaw.rotation.x = 0.12 + Math.max(0, Math.sin(t * 1.7)) * 0.12;
      } else if (stage === 'circling') {
        const ph = (S.ph += dt * TAU * 0.45), s = Math.sin(ph), c = Math.cos(ph);
        b.thighL.rotation.x = -0.4 * s - 0.15; b.thighR.rotation.x = 0.4 * s - 0.15;
        b.shinL.rotation.x = 0.25 + 0.95 * Math.pow(Math.max(0, c), 1.5); b.shinR.rotation.x = 0.25 + 0.95 * Math.pow(Math.max(0, -c), 1.5);
        b.footL.rotation.x = 0.2 * s; b.footR.rotation.x = -0.2 * s;
        b.hips.position.y += (Math.abs(c) - 1) * 0.05 - 0.06;
        b.spine.rotation.x = 0.28; b.chest.rotation.x = 0.22; b.neck.rotation.x = 0.25; b.head.rotation.x = -0.35;
        b.armL.rotation.x = 0.25 * s + 0.1; b.armR.rotation.x = -0.25 * s + 0.1; b.foreL.rotation.x = -0.2; b.foreR.rotation.x = -0.2;
        b.head.rotation.z = jerkTilt * 0.6; b.head.rotation.y = Math.sin(t * 0.4) * 0.4;
      } else {
        // standing at the treeline, too still
        b.head.rotation.z = 0.18 + jerkTilt * 0.25; b.head.rotation.y = Math.sin(t * 0.12) * 0.1;
        b.spine.rotation.x = 0.08; b.chest.rotation.x = 0.1; b.neck.rotation.x = 0.12; b.head.rotation.x = -0.05;
        b.hips.rotation.z = Math.sin(t * 0.5) * 0.015; b.armL.rotation.x = Math.sin(t * 0.6) * 0.03;
      }
      const gl = 0.55 + Math.sin(t * 6) * 0.25;
      eyes.forEach((g) => { g.material.opacity = gl; });
    }
    update(0.016, {});
    return { obj: A.obj, update, dispose() { eyes.forEach((g) => g.material.dispose()); }, rig, tris: 0, kind: 'lighthunter' };
  }

  // antler: recursive bare branches
  function antler(gb, s, base, bone, col, rnd) {
    const grow = (p, dir, len, r, depth) => {
      const pts = [], N = 4; let d = dir.clone(), q = new V3().fromArray(p);
      pts.push({ p: q.toArray(), w: r });
      for (let k = 1; k <= N; k++) {
        d.x += (rnd() - 0.5) * 0.35; d.y += (rnd() - 0.4) * 0.3; d.z += (rnd() - 0.5) * 0.3; d.normalize();
        q = q.clone().addScaledVector(d, len / N);
        pts.push({ p: q.toArray(), w: r * (1 - 0.8 * k / N) + 0.002 });
      }
      gb.sweep(pts, { n: 7, cap0: false, cap1: 0.004, color: col, bone, vary: 0.15, mod: (th, sN) => 1 + 0.15 * Math.pow(Math.abs(Math.sin(sN * 9)), 6) });
      const tips = [q.toArray()];
      if (depth > 0) {
        const nb = depth > 1 ? 3 : 2;
        for (let i = 0; i < nb; i++) {
          const k = 1 + Math.floor(rnd() * (N - 1)), at = pts[k].p;
          const nd = dir.clone().add(new V3((rnd() - 0.3) * s * 1.2, rnd() * 0.8, (rnd() - 0.5) * 0.9)).normalize();
          tips.push(...grow(at, nd, len * (0.5 + rnd() * 0.25), pts[k].w * 0.75, depth - 1));
        }
      }
      return tips;
    };
    return grow(base, new V3(s * 0.7, 0.75, -0.15).normalize(), 0.55, 0.022, 3);
  }

  function buildStag() {
    const J = { hips: [0, 1.2, 0], spine: [0, 1.42, 0], chest: [0, 1.68, 0.02], neck: [0, 1.9, 0.05], head: [0, 2.03, 0.08], jaw: [0, 2.0, 0.16],
      armL: [0.2, 1.84, 0], foreL: [0.23, 1.38, -0.03], handL: [0.25, 0.96, 0], thighL: [0.11, 1.18, 0], shinL: [0.12, 0.8, 0.15], metaL: [0.12, 0.42, -0.1], footL: [0.12, 0.07, -0.05] };
    const defs = [['root', null, 0, 0, 0], ['hips', 'root', ...J.hips], ['spine', 'hips', ...J.spine], ['chest', 'spine', ...J.chest], ['neck', 'chest', ...J.neck], ['head', 'neck', ...J.head], ['jaw', 'head', ...J.jaw]];
    const mir = (a) => [-a[0], a[1], a[2]];
    [['L', (a) => a], ['R', mir]].forEach(([L, m]) => defs.push(['arm' + L, 'chest', ...m(J.armL)], ['fore' + L, 'arm' + L, ...m(J.foreL)], ['hand' + L, 'fore' + L, ...m(J.handL)], ['thigh' + L, 'hips', ...m(J.thighL)], ['shin' + L, 'thigh' + L, ...m(J.shinL)], ['meta' + L, 'shin' + L, ...m(J.metaL)], ['foot' + L, 'meta' + L, ...m(J.footL)]));
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // bells: bones hung from antler points (filled after the antlers are grown)
    const bd = new GB(true), bell = new GB(true);
    const pale = rgb(0xd9d3c2), hollow = rgb(0x8f897b), fur = rgb(0x8a8478), wood = rgb(0x2e2218), boneC = rgb(0xd6cfbb);
    const rig0 = Rig(defs); const I0 = rig0.i;
    const tipsL = antler(bd, 1, [0.045, 2.14, 0.06], I0.head, (p) => mixc(wood, rgb(0x6a5a48), sstep(2.3, 2.9, p[1]) * 0.6), rnd);
    const tipsR = antler(bd, -1, [-0.045, 2.14, 0.06], I0.head, (p) => mixc(wood, rgb(0x6a5a48), sstep(2.3, 2.9, p[1]) * 0.6), rnd);
    const hang = tipsL.slice(1, 4).concat(tipsR.slice(1, 4)).map((p) => [p[0], p[1] - 0.02, p[2]]);
    hang.forEach((p, k) => defs.push(['bell' + k, 'head', p[0], p[1], p[2]]));
    const rig = Rig(defs), I = rig.i;
    // rebind antler weights: indices of the shared bones are unchanged (bells were appended)
    const ribs = (th, y) => { const c = Math.cos(th); let m = 1; if (y > 1.45 && y < 1.75) m += (0.05 * Math.pow(Math.abs(Math.sin((y - 1.45) / 0.04 * PI)), 4) - 0.02) * (c > -0.3 ? 1 : 0.4); if (c < -0.85) m += 0.07 * Math.pow(Math.abs(Math.sin(y / 0.038 * PI)), 6); return m; };
    const TR = [[1.1, 0.11, 0.085, 0], [1.2, 0.13, 0.09, 0], [1.32, 0.1, 0.07, 0.005], [1.45, 0.125, 0.09, 0.01], [1.58, 0.15, 0.108, 0.015], [1.7, 0.165, 0.112, 0.015], [1.8, 0.16, 0.098, 0.01], [1.86, 0.11, 0.075, 0.015], [1.93, 0.055, 0.058, 0.035]];
    bd.sweep(TR.map((r) => ({ p: [0, r[0], r[3]], w: r[1], d: r[2], e: 2.3 })), { n: 24, cap0: 0.03, cap1: false, mod: (th, s, i, p) => ribs(th, p.y),
      color: (p, th) => { let c = mixc(pale, hollow, (p[1] > 1.45 && p[1] < 1.75 ? (1 - Math.pow(Math.abs(Math.sin((p[1] - 1.45) / 0.04 * PI)), 2)) * 0.55 : 0)); c = mixc(c, fur, vn(p[0] * 20, p[1] * 20, p[2] * 20) > 0.6 && p[1] > 1.6 ? 0.8 : 0); return c; },
      bone: chainW([[0, 1.1, 0], J.spine, J.chest, J.neck], [I.hips, I.spine, I.chest], 0.1), vary: 0.06, jit: (p) => { const k = vn(p.x * 30, p.y * 30, p.z * 30) > 0.62 && p.y > 1.6 ? 0.012 : 0; return [p.x * k * 4, 0, p.z * k * 4]; } });
    bd.sweep([{ p: [0, 1.86, 0.02], w: 0.05, d: 0.055 }, { p: [0, 1.97, 0.06], w: 0.042 }, { p: [0, 2.06, 0.07], w: 0.045 }], { n: 12, cap0: false, cap1: false, color: fur, bone: chainW([J.chest, J.neck, J.head], [I.chest, I.neck], 0.05), jit: (p) => { const k = (vn(p.x * 80, p.y * 80, p.z * 80) - 0.5) * 0.02; return [k, 0, k]; } });
    // deer skull
    bd.sweep([[0.0, 2.1, 0.06, 0.065], [0.06, 2.11, 0.074, 0.075], [0.14, 2.08, 0.06, 0.06], [0.24, 2.04, 0.04, 0.04], [0.34, 2.0, 0.031, 0.03], [0.4, 1.985, 0.024, 0.022]].map(([z, y, w, d]) => ({ p: [0, y, z], w, d })),
      { n: 20, ref: [0, 1, 0], cap0: 0.05, cap1: 0.015, color: (p) => { let c = boneC; c = mixc(c, [0.02, 0.015, 0.012], gauss((Math.abs(p[0]) - 0.06) / 0.018, (p[2] - 0.1) / 0.025) * 0.95); c = mixc(c, [0.03, 0.02, 0.02], gauss(p[0] / 0.012, (p[2] - 0.38) / 0.03) * (p[1] > 1.98 ? 0.9 : 0)); return c; },
        mod: (th, s, i, p) => 1 - 0.18 * gauss((Math.abs(p.x) - 0.06) / 0.02, (p.z - 0.1) / 0.03), bone: (p) => { const k = sstep(2.0, 1.985, p[1]) * sstep(0.12, 0.18, p[2]); return [[I.jaw, k], [I.head, 1 - k]]; }, vary: 0.05 });
    [1, -1].forEach((s) => {
      const L = s > 0 ? 'L' : 'R', m = (a) => [a[0] * s, a[1], a[2]];
      limb(bd, [m([0.15, 1.86, 0]), m(J.armL), m(J.foreL), m(J.handL)], [0.04, 0.04, 0.034, 0.02], [I.chest, I['arm' + L], I['fore' + L]], { n: 12, cap0: 0.02, cap1: false, color: (p) => mixc(pale, fur, sstep(1.7, 1.8, p[1])), mid: 0.75, vary: 0.05 });
      handFingers(bd, s, m(J.handL), 0.3, 0.02, I['hand' + L], mixc(pale, [0.05, 0.04, 0.035], 0.5), 1, 0.4);
      limb(bd, [m([0.09, 1.25, 0]), m(J.thighL), m(J.shinL), m(J.metaL), m(J.footL)], [0.075, 0.07, 0.045, 0.03, 0.025], [I.hips, I['thigh' + L], I['shin' + L], I['meta' + L]], { n: 12, cap0: false, cap1: false, color: (p) => mixc(fur, pale, sstep(0.9, 0.7, p[1])), mid: 0.8, vary: 0.06 });
      bd.sweep([{ p: m([0.12, 0.09, -0.05]), w: 0.03, d: 0.035 }, { p: m([0.12, 0.0, -0.035]), w: 0.04, d: 0.05 }], { n: 10, cap0: false, cap1: 0, color: [0.03, 0.025, 0.02], bone: I['foot' + L] });
    });
    // bells on threads
    const brass = [0.55, 0.38, 0.12];
    hang.forEach((p, k) => {
      const bi = I['bell' + k];
      bd.sweep([{ p: [p[0], p[1] + 0.02, p[2]], w: 0.002 }, { p: [p[0], p[1] - 0.1, p[2]], w: 0.002 }], { n: 4, color: [0.05, 0.04, 0.03], bone: (q) => (q[1] > p[1] ? [[I.head, 1]] : [[bi, 1]]) });
      bell.sweep([{ p: [p[0], p[1] - 0.095, p[2]], w: 0.008 }, { p: [p[0], p[1] - 0.105, p[2]], w: 0.016 }, { p: [p[0], p[1] - 0.125, p[2]], w: 0.02 }, { p: [p[0], p[1] - 0.142, p[2]], w: 0.027 }], { n: 12, cap0: 0.006, cap1: 0, color: brass, bone: bi });
    });
    const mBody = R3.mat('cr:stag', () => R3.std({ vertexColors: true, roughness: 0.7, metalness: 0, normalMap: TX.skin(), normalScale: new THREE.Vector2(0.6, 0.6), emissive: 0x15161a }));
    const mBell = R3.mat('cr:brass', () => R3.std({ vertexColors: true, roughness: 0.32, metalness: 0.85 }));
    const A = assemble(rig, [{ name: 'body', geo: bd.geo(), mat: mBody }, { name: 'bell', geo: bell.geo(), mat: mBell, shadow: false }], [0, 1.5, 0, 1.8]);
    const b = rig.b;
    const eyes = [1, -1].map((s) => { const g = glowDot(0xffeaa0, 0.035); g.position.set(s * 0.055, 2.08 - 2.03, 0.1 - 0.08); b.head.add(g); return g; });
    const S = { t: Math.random() * 10, ph: 0, mv: 0 };
    function update(dt, st) {
      st = st || {}; dt = Math.min(0.1, dt || 0.016);
      const t = (S.t += dt); rig.reset();
      const hunt = st.stage === 'hunting';
      S.mv = lerp(S.mv, hunt ? 1 : 0, Math.min(1, dt * 4));
      const mv = S.mv;
      // watching: still, head cocked; bells sway
      b.head.rotation.z = (0.38 + Math.sin(t * 0.3) * 0.04) * (1 - mv); b.head.rotation.y = 0.25 * (1 - mv); b.neck.rotation.x = 0.1;
      b.armL.rotation.z = 0.08; b.armR.rotation.z = -0.08; b.foreL.rotation.x = -0.15; b.foreR.rotation.x = -0.15;
      b.shinL.rotation.x = 0.0; b.chest.scale.set(1 + Math.sin(t * 1.1) * 0.02, 1, 1 + Math.sin(t * 1.1) * 0.03);
      if (mv > 0.01) {
        // charging on all fours, a bounding gallop
        const ph = (S.ph += dt * TAU * 2.1), s = Math.sin(ph), c = Math.cos(ph);
        b.hips.rotation.x = 1.15 * mv + s * 0.12 * mv; b.hips.position.y -= 0.18 * mv; b.hips.position.y += Math.abs(s) * 0.08 * mv;
        b.chest.rotation.x = 0.1 * mv - s * 0.1 * mv; b.neck.rotation.x = -0.75 * mv; b.head.rotation.x = -0.35 * mv + c * 0.08 * mv;
        ['L', 'R'].forEach((L, i) => { const o = i ? 0.15 : 0, sw = Math.sin(ph + o * TAU);
          b['arm' + L].rotation.x = (-1.15 - sw * 0.65) * mv; b['fore' + L].rotation.x = (-0.15 + Math.max(0, Math.cos(ph + o * TAU)) * 0.9) * mv; b['hand' + L].rotation.x = 0.6 * mv;
          const lw = Math.sin(ph + PI + o * TAU);
          b['thigh' + L].rotation.x = (-1.25 + lw * 0.6) * mv; b['shin' + L].rotation.x = (0.6 + Math.max(0, Math.cos(ph + PI + o * TAU)) * 0.8) * mv; b['meta' + L].rotation.x = (-0.4) * mv; });
      }
      const sw = hunt ? 0.6 : 0.15;
      for (let k = 0; k < hang.length; k++) { const bn = b['bell' + k]; bn.rotation.x = Math.sin(t * (hunt ? 9 : 2.2) + k * 1.7) * sw; bn.rotation.z = Math.cos(t * (hunt ? 7 : 1.7) + k) * sw * 0.7; }
      eyes.forEach((g) => { g.material.opacity = 0.6 + Math.sin(t * 4) * 0.3; });
    }
    update(0.016, {});
    return { obj: A.obj, update, dispose() { eyes.forEach((g) => g.material.dispose()); }, rig, tris: bd.tris() + bell.tris(), kind: 'stag' };
  }

  // =================================================================== SCRATCHER
  function buildScratcher() {
    const J = { pelvis: [0, 0.42, -0.5], spine: [0, 0.52, -0.1], chest: [0, 0.58, 0.3], neck: [0, 0.56, 0.52], head: [0, 0.52, 0.64], jaw: [0, 0.47, 0.7],
      armL: [0.27, 0.56, 0.36], foreL: [0.42, 0.32, 0.46], handL: [0.4, 0.07, 0.68], legL: [0.2, 0.4, -0.55], shinL: [0.33, 0.2, -0.48], footL: [0.33, 0.03, -0.72],
      tail0: [0, 0.36, -0.82], tail1: [0, 0.2, -1.15], tail2: [0, 0.08, -1.5] };
    const defs = [['root', null, 0, 0, 0], ['pelvis', 'root', ...J.pelvis], ['spine', 'pelvis', ...J.spine], ['chest', 'spine', ...J.chest], ['neck', 'chest', ...J.neck], ['head', 'neck', ...J.head], ['jaw', 'head', ...J.jaw],
      ['tail0', 'pelvis', ...J.tail0], ['tail1', 'tail0', ...J.tail1], ['tail2', 'tail1', ...J.tail2]];
    const mir = (a) => [-a[0], a[1], a[2]];
    [['L', (a) => a], ['R', mir]].forEach(([L, m]) => defs.push(['arm' + L, 'chest', ...m(J.armL)], ['fore' + L, 'arm' + L, ...m(J.foreL)], ['hand' + L, 'fore' + L, ...m(J.handL)], ['leg' + L, 'pelvis', ...m(J.legL)], ['shin' + L, 'leg' + L, ...m(J.shinL)], ['foot' + L, 'shin' + L, ...m(J.footL)]));
    const rig = Rig(defs), I = rig.i;
    const gb = new GB(true);
    const hideC = (p, th, s, i, n) => { const a = rgb(0x2a241b), b2 = rgb(0x4a4642), k = vn(p[0] * 9, p[1] * 9, p[2] * 9); let c = mixc(a, b2, sstep(0.55, 0.8, k) * 0.7); c = mixc(c, rgb(0x15110c), sstep(0.0, -0.6, n.y)); return c; };
    const spineW = chainW([[0, 0.4, -0.9], J.pelvis, J.spine, J.chest, J.neck], [I.tail0, I.pelvis, I.spine, I.chest], 0.12);
    const BR = [[-0.88, 0.37, 0.08, 0.07], [-0.72, 0.41, 0.18, 0.14], [-0.5, 0.44, 0.22, 0.17], [-0.25, 0.5, 0.24, 0.2], [0.0, 0.56, 0.28, 0.24], [0.22, 0.63, 0.3, 0.27], [0.4, 0.63, 0.26, 0.22], [0.55, 0.57, 0.15, 0.14]];
    gb.sweep(BR.map(([z, y, w, d]) => ({ p: [0, y, z], w, d, e: 2.2 })), { n: 26, ref: [0, 1, 0], cap0: 0.05, cap1: false, color: hideC, bone: spineW, vary: 0.1, uvs: 3,
      mod: (th, s, i, p) => 1 + 0.06 * (vn(p.x * 7, p.y * 7, p.z * 7) - 0.5) + 0.05 * Math.pow(Math.abs(Math.sin(p.z * 22)), 6) * sstep(0.2, -0.3, Math.cos(th)) });
    // head: low, wide, wet; jaw
    const HDr = [[0.5, 0.56, 0.1, 0.09], [0.62, 0.54, 0.135, 0.1], [0.72, 0.5, 0.125, 0.085], [0.82, 0.46, 0.095, 0.06], [0.88, 0.44, 0.065, 0.042]];
    gb.sweep(HDr.map(([z, y, w, d]) => ({ p: [0, y, z], w, d })), { n: 20, ref: [0, 1, 0], cap0: false, cap1: 0.03, color: (p, th, s, i, n) => (Math.abs(p[1] - 0.455 - (0.88 - p[2]) * 0.0) < 0.008 && p[2] > 0.66 ? [0.12, 0.01, 0.01] : hideC(p, th, s, i, n)), bone: (p) => { const k = sstep(0.47, 0.44, p[1]) * sstep(0.6, 0.66, p[2]); return [[I.jaw, k], [I.head, 1 - k]]; }, vary: 0.08 });
    // teeth
    for (let k = 0; k < 12; k++) { const a = (k / 11 - 0.5) * 2.2, x = Math.sin(a) * 0.075, z = 0.66 + Math.cos(a) * 0.19; gb.sweep([{ p: [x, 0.455, z], w: 0.007 }, { p: [x * 1.05, 0.42 - hsh(k, 1) * 0.02, z + 0.005], w: 0.0005 }], { n: 6, cap0: 0, cap1: false, color: rgb(0xb8ad94), bone: I.head }); }
    // spines along the back
    for (let k = 0; k < 13; k++) {
      const z = -0.62 + k * 0.09, r = BR.reduce((a, q) => (Math.abs(q[0] - z) < Math.abs(a[0] - z) ? q : a)), top = r[1] + r[3] * 0.95, len = 0.08 + hsh(k, 2) * 0.12 * sstep(-0.6, 0.2, z);
      gb.sweep([{ p: [0, top - 0.02, z], w: 0.016, d: 0.022 }, { p: [(hsh(k, 3) - 0.5) * 0.04, top + len, z - len * 0.6], w: 0.001 }], { n: 6, cap0: 0, cap1: false, color: rgb(0x5a554e), bone: spineW([0, top, z]) });
    }
    gb.sweep([{ p: [0, 0.38, -0.82], w: 0.08, d: 0.07 }, { p: J.tail1, w: 0.05, d: 0.04 }, { p: [0, 0.1, -1.45], w: 0.025 }, { p: [0, 0.05, -1.62], w: 0.008 }], { n: 12, ref: [0, 1, 0], cap0: false, cap1: 0.01, color: hideC, bone: chainW([[0, 0.38, -0.82], J.tail1, J.tail2, [0, 0.05, -1.62]], [I.tail0, I.tail1, I.tail2], 0.08), vary: 0.1 });
    [1, -1].forEach((s) => {
      const L = s > 0 ? 'L' : 'R', m = (a) => [a[0] * s, a[1], a[2]];
      limb(gb, [m([0.16, 0.62, 0.32]), m(J.armL), m(J.foreL), m(J.handL)], [0.11, 0.1, 0.075, 0.055], [I.chest, I['arm' + L], I['fore' + L]], { n: 16, cap0: 0.05, cap1: false, color: hideC, mid: 0.95, vary: 0.1, bl: 0.07 });
      gb.ellip(m([0.4, 0.06, 0.73]), 0.075, 0.035, 0.08, { n: 12, rings: 7, color: hideC, bone: I['hand' + L] });
      for (let f = 0; f < 4; f++) {
        const x = s * (0.4 + (f - 1.5) * 0.035), z0 = 0.78, len = 0.2 + (f === 1 || f === 2 ? 0.05 : 0);
        gb.sweep([{ p: [x, 0.06, z0], w: 0.012, d: 0.016 }, { p: [x + s * (f - 1.5) * 0.01, 0.05, z0 + len * 0.5], w: 0.008, d: 0.01 }, { p: [x + s * (f - 1.5) * 0.02, 0.01, z0 + len * 0.85], w: 0.003 }, { p: [x + s * (f - 1.5) * 0.02, -0.02, z0 + len], w: 0.0005 }],
          { n: 6, ref: [0, 1, 0], cap0: 0, cap1: false, color: (p) => mixc(rgb(0xb8ad94), rgb(0x2a241b), sstep(z0 + len * 0.6, z0, p[2])), bone: I['hand' + L] });
      }
      limb(gb, [m([0.12, 0.45, -0.52]), m(J.legL), m(J.shinL), m(J.footL)], [0.09, 0.08, 0.055, 0.04], [I.pelvis, I['leg' + L], I['shin' + L]], { n: 12, cap0: 0.04, cap1: 0.04, color: hideC, mid: 0.9, vary: 0.1 });
    });
    const mat = R3.mat('cr:scratcher', () => R3.std({ vertexColors: true, roughness: 0.26, metalness: 0.05, normalMap: TX.hide(), normalScale: new THREE.Vector2(1.1, 1.1) }));
    const A = assemble(rig, [{ name: 'body', geo: gb.geo(), mat }], [0, 0.5, -0.3, 1.4]);
    const b = rig.b;
    const eyes = [[0.07, 0.535, 0.79], [-0.07, 0.535, 0.79], [0.1, 0.55, 0.72], [-0.1, 0.55, 0.72]].map((p, k) => { const g = glowDot(0xea7420, k < 2 ? 0.05 : 0.03); g.position.set(p[0], p[1] - J.head[1], p[2] - J.head[2]); b.head.add(g); return g; });
    const S = { t: Math.random() * 10, ph: 0, rake: 0 };
    function update(dt, st) {
      st = st || {}; dt = Math.min(0.1, dt || 0.016);
      const t = (S.t += dt); rig.reset();
      const br = Math.sin(t * 1.9);
      b.chest.scale.set(1 + br * 0.03, 1 + br * 0.04, 1);
      if (st.clawing || st.stage === 'door') {
        // reared up against the door, claws raking down in turns
        b.pelvis.rotation.x = -0.95; b.pelvis.position.y += 0.08; b.pelvis.position.z += 0.1;
        b.legL.rotation.x = 0.85; b.legR.rotation.x = 0.85; b.shinL.rotation.x = -0.4; b.shinR.rotation.x = -0.4; b.footL.rotation.x = 0.4; b.footR.rotation.x = 0.4;
        b.tail0.rotation.x = 1.0; b.tail1.rotation.x = 0.4;
        b.spine.rotation.x = 0.15; b.chest.rotation.x = 0.15; b.neck.rotation.x = 0.55; b.head.rotation.x = 0.35 + Math.sin(t * 7) * 0.05;
        const r = (S.rake += dt * 2.6);
        ['L', 'R'].forEach((L, i) => {
          const u = ((r + i * 0.5) % 1), down = u < 0.35 ? sstep(0, 0.35, u) : 1 - sstep(0.35, 1, u);
          b['arm' + L].rotation.x = -1.2 + down * 1.1; b['fore' + L].rotation.x = -0.6 + down * 0.3; b['hand' + L].rotation.x = 0.6 - down * 0.4;
          b['arm' + L].rotation.z = (i ? -1 : 1) * -0.25;
        });
        b.jaw.rotation.x = 0.25 + Math.abs(Math.sin(t * 5)) * 0.2;
      } else {
        // dragging itself through the snow: arms reach and haul, body heaves
        const sp = st.moving ? 1 : 0.15;
        const ph = (S.ph += dt * TAU * 0.7 * sp);
        ['L', 'R'].forEach((L, i) => {
          const u = Math.sin(ph + i * PI), reach = Math.max(0, Math.cos(ph + i * PI));
          b['arm' + L].rotation.x = -0.15 - u * 0.5; b['arm' + L].rotation.y = (i ? 1 : -1) * 0.1;
          b['fore' + L].rotation.x = -reach * 0.5; b['hand' + L].rotation.x = reach * 0.4;
          b['arm' + L].rotation.z = (i ? 1 : -1) * reach * 0.15;
        });
        b.chest.rotation.z = Math.sin(ph) * 0.12; b.spine.rotation.z = -Math.sin(ph) * 0.06; b.chest.position.y += Math.abs(Math.cos(ph)) * 0.04 * sp;
        b.neck.rotation.y = Math.sin(ph * 0.5) * 0.2; b.head.rotation.x = Math.sin(ph * 2) * 0.06;
        b.legL.rotation.x = 0.3 + Math.sin(ph) * 0.2 * sp; b.legR.rotation.x = 0.3 - Math.sin(ph) * 0.2 * sp;
        b.tail0.rotation.y = Math.sin(ph * 0.5 + 1) * 0.2; b.tail1.rotation.y = Math.sin(ph * 0.5 + 2) * 0.25;
        b.jaw.rotation.x = 0.08 + Math.max(0, Math.sin(t * 0.8)) * 0.15;
      }
      eyes.forEach((g, k) => { g.material.opacity = 0.75 + Math.sin(t * 5 + k) * 0.25; });
    }
    update(0.016, {});
    return { obj: A.obj, update, dispose() { eyes.forEach((g) => g.material.dispose()); }, rig, tris: gb.tris(), kind: 'scratcher' };
  }

  // =================================================================== SIPHON
  // Origin = the stovepipe axis at roof level; limbs wrap a pipe of radius ~0.13 m from 0.1 to 1.1 m up.
  function buildSiphon() {
    const defs = [['root', null, 0, 0, 0], ['base', 'root', 0, 0.2, 0.19], ['body', 'base', 0, 0.5, 0.2], ['chest', 'body', 0, 0.78, 0.18], ['head', 'chest', 0, 1.0, 0.12]];
    const LH = [0.25, 0.42, 0.58, 0.72, 0.88, 1.0];
    LH.forEach((h, k) => defs.push(['l' + k, k < 3 ? 'body' : 'chest', 0, h, 0]));
    const rig = Rig(defs), I = rig.i;
    const gb = new GB(true);
    const dark = (p) => mixc(rgb(0x121318), rgb(0x2d2238), vn(p[0] * 20, p[1] * 20, p[2] * 20) * 0.6);
    gb.sweep([{ p: [0, 0.1, 0.2], w: 0.03 }, { p: [0, 0.3, 0.21], w: 0.06, d: 0.045 }, { p: [0, 0.55, 0.22], w: 0.075, d: 0.05 }, { p: [0, 0.75, 0.2], w: 0.085, d: 0.055 }, { p: [0, 0.9, 0.17], w: 0.06, d: 0.045 }, { p: [0, 0.97, 0.14], w: 0.035 }],
      { n: 16, cap0: 0.04, cap1: false, color: dark, bone: chainW([[0, 0.1, 0.2], [0, 0.5, 0.2], [0, 0.78, 0.18], [0, 1.0, 0.12]], [I.base, I.body, I.chest], 0.1), vary: 0.1,
        mod: (th, s, i, p) => 1 + 0.08 * Math.pow(Math.abs(Math.sin(p.y * 70)), 4) * (Math.cos(th) > 0 ? 0 : 1) });
    // head: a long pale bone mask bowed over the pipe mouth
    gb.sweep([{ p: [0, 1.0, 0.16], w: 0.045, d: 0.05 }, { p: [0, 1.07, 0.1], w: 0.05, d: 0.055 }, { p: [0, 1.1, 0.03], w: 0.035, d: 0.035 }, { p: [0, 1.09, -0.04], w: 0.018, d: 0.02 }],
      { n: 14, cap0: false, cap1: 0.02, ref: [0, 1, 0], color: (p) => mixc(dark(p), rgb(0x9c9584), sstep(0.08, 0.0, p[2])), bone: I.head });
    LH.forEach((h, k) => {
      const dir = k % 2 ? 1 : -1, a0 = dir * 1.1 + (hsh(k, 1) - 0.5) * 0.4, turn = dir * (2.2 + hsh(k, 2) * 1.6), dy = (hsh(k, 3) - 0.5) * 0.35, pts = [];
      for (let j = 0; j <= 14; j++) {
        const u = j / 14, a = a0 + turn * u, r = 0.15 + 0.025 * Math.sin(u * 23 + k);
        const x = j === 0 ? 0.06 * dir : Math.sin(a) * r, z = j === 0 ? 0.2 : Math.cos(a) * r;
        pts.push({ p: [x, h + dy * u, z], w: lerp(0.024, 0.005, u) * (1 + 0.4 * Math.pow(Math.abs(Math.sin(u * 14)), 10)) });
      }
      gb.sweep(pts, { n: 7, cap0: false, cap1: 0.006, color: dark, bone: I['l' + k], vary: 0.1 });
    });
    const mat = R3.mat('cr:siphon', () => R3.std({ vertexColors: true, roughness: 0.38, metalness: 0.05, normalMap: TX.hide(), normalScale: new THREE.Vector2(0.6, 0.6), emissive: 0x07050a }));
    const A = assemble(rig, [{ name: 'body', geo: gb.geo(), mat }], [0, 0.6, 0, 0.9]);
    const b = rig.b;
    const eyes = [1, -1].map((s) => { const g = glowDot(0xcf3020, 0.03); g.position.set(s * 0.03, 0.075, 0.04); b.head.add(g); return g; });
    const S = { t: Math.random() * 10 };
    function update(dt) {
      dt = Math.min(0.1, dt || 0.016); const t = (S.t += dt); rig.reset();
      const pu = Math.pow(0.5 + 0.5 * Math.sin(t * 2.2), 3);
      b.body.scale.set(1 + pu * 0.12, 1, 1 + pu * 0.15); b.chest.scale.set(1 + pu * 0.1, 1, 1 + pu * 0.12);
      b.head.rotation.x = 0.1 + pu * 0.08; b.chest.rotation.x = -pu * 0.05;
      LH.forEach((h, k) => { b['l' + k].rotation.y = Math.sin(t * 0.7 + k * 1.3) * 0.08; b['l' + k].scale.setScalar(1 + pu * 0.04); });
      eyes.forEach((g) => { g.material.opacity = 0.5 + pu * 0.5; });
    }
    update(0.016);
    return { obj: A.obj, update, dispose() { eyes.forEach((g) => g.material.dispose()); }, rig, tris: gb.tris(), kind: 'siphon' };
  }

  // =================================================================== DARK DWELLER
  // Smoke-black tendrils crawling from the room's floor corners toward its centre. One mesh: every tendril is a
  // tube whose path is evaluated in the vertex shader (writhing, growth with uK), soft-edged like smoke, with a faint rim.
  const DW_VS_PARS = `
    uniform float uK; attribute float aT; attribute vec2 aRing; attribute vec3 aStart; attribute vec3 aDir; attribute vec3 aPar;
    vec3 dwC(float t) {
      float vis = smoothstep(aPar.z - 0.08, aPar.z + 0.04, uK);
      float L = aPar.x * (0.3 + 0.7 * uK) * vis;
      vec3 side = normalize(vec3(-aDir.z, 0.0, aDir.x));
      float s = t * L;
      float w = (sin(s * 2.3 - uTime * 0.8 + aPar.y * 6.0) * 0.22 + sin(s * 5.1 + uTime * 1.6 + aPar.y * 3.0) * 0.07) * t;
      float lift = 0.025 + sin(t * 3.1416) * (0.06 + 0.12 * fract(aPar.y * 3.7)) * (0.6 + 0.4 * sin(uTime * 0.7 + aPar.y * 9.0)) + (1.0 - t) * (1.0 - t) * 0.45 * fract(aPar.y * 7.3);
      return aStart + aDir * s + side * w * min(L, 1.5) + vec3(0.0, lift, 0.0);
    }`;
  const DW_NORMAL = `
    float dwT = aT; vec3 dwP = dwC(dwT);
    vec3 dwTg = dwC(min(dwT + 0.01, 1.0)) - dwC(max(dwT - 0.01, 0.0)); dwTg = length(dwTg) > 1e-5 ? normalize(dwTg) : aDir;
    vec3 dwN0 = cross(dwTg, vec3(0.0, 1.0, 0.0)); dwN0 = length(dwN0) > 1e-4 ? normalize(dwN0) : vec3(1.0, 0.0, 0.0);
    vec3 dwB = normalize(cross(dwN0, dwTg));
    float dwVis = smoothstep(aPar.z - 0.08, aPar.z + 0.04, uK);
    float dwR = (0.05 * (0.55 + 0.45 * uK) * pow(1.0 - dwT, 0.75) * (1.0 + 0.3 * sin(dwT * 22.0 - uTime * 2.0 + aPar.y * 5.0)) + 0.002) * dwVis;
    vec3 objectNormal = dwN0 * aRing.x + dwB * aRing.y;`;
  const DW_FRAG = `
    float dwF = abs(dot(normalize(normal), normalize(vViewPosition)));
    outgoingLight = outgoingLight * 0.2 + vec3(0.085, 0.075, 0.13) * pow(1.0 - dwF, 2.5) * 0.55;
    diffuseColor.a *= smoothstep(0.02, 0.6, dwF) * 0.97;
    #include <opaque_fragment>`;
  function buildDweller(opts) {
    const room = opts.room || {}, ctr = room.center ? new V3().copy(room.center) : new V3();
    const corners = (room.corners && room.corners.length ? room.corners : [[-2, 0, -2], [2, 0, -2], [2, 0, 2], [-2, 0, 2]].map((q) => ctr.clone().add(new V3().fromArray(q)))).map((c) => (Array.isArray(c) ? new V3().fromArray(c) : new V3().copy(c)).sub(ctr).setY(0));
    const PER = 9, NS = 30, NRg = 7;
    const T = [], RG = [], ST = [], DR = [], PA = [], POS = [], IDX = [];
    let v = 0;
    corners.forEach((c, ci) => {
      const toC = c.clone().multiplyScalar(-1); const dist = toC.length(); toC.normalize();
      const start = c.clone().addScaledVector(toC, 0.12);
      for (let i = 0; i < PER; i++) {
        const ang = (i - (PER - 1) / 2) * 0.2 + (hsh(ci, i, 1) - 0.5) * 0.2;
        const d = new V3(toC.x * Math.cos(ang) - toC.z * Math.sin(ang), 0, toC.x * Math.sin(ang) + toC.z * Math.cos(ang));
        const len = dist * (0.45 + hsh(ci, i, 2) * 0.45) * (i % 3 === 1 ? 1 : 0.8);
        const ord = i < 4 ? i * 0.03 : (i - 3) / 6 * 0.9;
        const sd = hsh(ci, i, 3);
        for (let s = 0; s <= NS; s++) for (let r = 0; r <= NRg; r++) {
          const a = r / NRg * TAU;
          T.push(s / NS); RG.push(Math.cos(a), Math.sin(a)); ST.push(start.x, 0, start.z); DR.push(d.x, 0, d.z); PA.push(len, sd, ord); POS.push(start.x, 0, start.z);
        }
        for (let s = 0; s < NS; s++) for (let r = 0; r < NRg; r++) { const a = v + s * (NRg + 1) + r, b2 = a + NRg + 1; IDX.push(a, b2, a + 1, a + 1, b2, b2 + 1); }
        v += (NS + 1) * (NRg + 1);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(POS, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(POS.length).fill(0).map((x, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(T, 1)); g.setAttribute('aRing', new THREE.Float32BufferAttribute(RG, 2));
    g.setAttribute('aStart', new THREE.Float32BufferAttribute(ST, 3)); g.setAttribute('aDir', new THREE.Float32BufferAttribute(DR, 3)); g.setAttribute('aPar', new THREE.Float32BufferAttribute(PA, 3));
    g.setIndex(IDX);
    g.boundingSphere = new THREE.Sphere(new V3(0, 0.3, 0), corners.reduce((m, c) => Math.max(m, c.length()), 1) + 1);
    const uK = { value: 0 };
    const mat = R3.std({ color: 0x000000, roughness: 1, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide }, { patchKey: '|dweller', patch: (sh) => {
      sh.uniforms.uK = uK;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + DW_VS_PARS)
        .replace('#include <beginnormal_vertex>', DW_NORMAL).replace('#include <begin_vertex>', 'vec3 transformed = dwP + objectNormal * dwR;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', DW_FRAG);
    } });
    const obj = new THREE.Group();
    const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = 3; obj.add(mesh);
    // darkness pooling in the corners
    const pg = new GB(false);
    corners.forEach((c) => { const p = c.clone().multiplyScalar(0.88); pg.sweep([{ p: [p.x, 0.012, p.z], w: 0.001 }, { p: [p.x, 0.012, p.z + 0.0001], w: 1 }], { n: 16, ref: [1, 0, 0], cap0: false, cap1: false, color: [0, 0, 0] }); });
    const pgeo = pg.geo();
    // radial uv for the alpha map
    { const pa = pgeo.attributes.position, uv = pgeo.attributes.uv; let k = 0; corners.forEach((c) => { const p = c.clone().multiplyScalar(0.88); for (let i = 0; i < 2 * 17; i++, k++) { uv.setXY(k, 0.5 + (pa.getX(k) - p.x) * 0.5, 0.5 + (pa.getZ(k) - p.z) * 0.5); } }); uv.needsUpdate = true; }
    const pmat = R3.basic({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, alphaMap: TX.puff(), polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
    const pool = new THREE.Mesh(pgeo, pmat); pool.renderOrder = 2; obj.add(pool);
    // two faint red eyes low in one corner
    const ec = corners[Math.floor(hsh(corners.length, 3) * corners.length)].clone().multiplyScalar(0.86);
    const side = new V3(-ec.z, 0, ec.x).normalize();
    const eyes = [-1, 1].map((s) => { const e = glowDot(0xff2a18, 0.035); e.position.copy(ec).addScaledVector(side, s * 0.045).setY(0.32); obj.add(e); return e; });
    const S = { t: Math.random() * 10, k: 0 };
    function update(dt, st) {
      st = st || {}; dt = Math.min(0.1, dt || 0.016); const t = (S.t += dt);
      S.k = lerp(S.k, clamp(st.k || 0, 0, 1), Math.min(1, dt * 0.8));
      uK.value = S.k;
      pmat.opacity = 0.35 + S.k * 0.6; pool.scale.setScalar(1);
      const blink = (t % 6.3) < 0.18 ? 0 : 1;
      eyes.forEach((e) => { e.visible = !!st.eyes; e.material.opacity = (0.35 + 0.2 * Math.sin(t * 0.9)) * blink; });
    }
    update(0.016, { k: 0 });
    return { obj, update, dispose() { g.dispose(); pgeo.dispose(); mat.dispose(); pmat.dispose(); eyes.forEach((e) => e.material.dispose()); }, tris: IDX.length / 3, kind: 'dweller' };
  }

  // =================================================================== VIEWMODEL (first-person hands)
  let VM = null;
  Cr.viewmodel = function () {
    if (VM) return VM.root;
    const root = new THREE.Group(); root.name = 'viewmodel';
    const metal = R3.std({ color: 0x2a2c30, roughness: 0.42, metalness: 0.75 });
    const paint = R3.std({ color: 0x4a1a14, roughness: 0.55, metalness: 0.35 });
    const wood = R3.std({ color: 0x5e3a20, roughness: 0.45, metalness: 0, normalMap: TX.bark(), normalScale: new THREE.Vector2(0.25, 0.25) });
    const glove = R3.std({ vertexColors: true, roughness: 0.85, metalness: 0, normalMap: TX.fabric(), normalScale: new THREE.Vector2(0.4, 0.4), emissive: 0x000000 }, { noPool: true });
    const glass = R3.std({ color: 0xffe2b0, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.55, emissive: 0xffa040, emissiveIntensity: 1.6, depthWrite: false });
    const mk = (gb, m) => { const me = new THREE.Mesh(gb.geo(), m); me.castShadow = false; me.receiveShadow = false; me.frustumCulled = false; return me; };
    const gloveC = (p) => (p[1] < -0.02 || p[2] > 0.06 ? rgb(0x2f3d24, 0.9) : rgb(0x2a2018));
    // ---- lantern (held by the bail in the left hand)
    const lantern = new THREE.Group();
    { const m = new GB(false), p = new GB(false), gl = new GB(false), gv = new GB(false);
      p.sweep([{ p: [0, 0, 0], w: 0.05 }, { p: [0, 0.035, 0], w: 0.055 }, { p: [0, 0.045, 0], w: 0.045 }], { n: 20, cap0: 0, cap1: 0, color: 0xffffff });
      gl.sweep([{ p: [0, 0.045, 0], w: 0.026 }, { p: [0, 0.08, 0], w: 0.042 }, { p: [0, 0.12, 0], w: 0.044 }, { p: [0, 0.155, 0], w: 0.032 }, { p: [0, 0.17, 0], w: 0.022 }], { n: 20, cap0: false, cap1: false, color: 0xffffff });
      p.sweep([{ p: [0, 0.165, 0], w: 0.05 }, { p: [0, 0.18, 0], w: 0.045 }, { p: [0, 0.2, 0], w: 0.02 }, { p: [0, 0.215, 0], w: 0.018 }], { n: 18, cap0: 0, cap1: 0.004, color: 0xffffff });
      for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4; m.sweep([{ p: [Math.sin(a) * 0.048, 0.04, Math.cos(a) * 0.048], w: 0.0022 }, { p: [Math.sin(a) * 0.052, 0.1, Math.cos(a) * 0.052], w: 0.0022 }, { p: [Math.sin(a) * 0.04, 0.165, Math.cos(a) * 0.04], w: 0.0022 }], { n: 5, color: 0xffffff }); }
      const bail = []; for (let k = 0; k <= 12; k++) { const a = -PI / 2 + k / 12 * PI; bail.push({ p: [Math.sin(a) * 0.056, 0.19 + Math.cos(a) * 0.075, 0], w: 0.0024 }); }
      m.sweep(bail, { n: 5, color: 0xffffff });
      lantern.add(mk(p, paint), mk(m, metal), mk(gl, glass));
      // gloved fist around the bail top
      gv.ellip([0, 0.275, 0.0], 0.03, 0.04, 0.045, { n: 12, rings: 8, color: gloveC });
      for (let f = 0; f < 4; f++) gv.sweep([{ p: [-0.02, 0.28 - f * 0.018 + 0.03, 0.035], w: 0.011 }, { p: [0.0, 0.272 - f * 0.018 + 0.03, 0.05], w: 0.011 }, { p: [0.022, 0.268 - f * 0.018 + 0.03, 0.035], w: 0.01 }], { n: 8, color: gloveC });
      // (no forearm: this close to the lens it only reads as a dark blob; the fist on the bail is enough)
      lantern.add(mk(gv, glove));
      const flame = glowDot(0xffb050, 0.07); flame.position.set(0, 0.085, 0); lantern.add(flame); lantern.userData.flame = flame;
      lantern.userData.glass = glass;
    }
    const lanternPivot = new THREE.Group(); lanternPivot.add(lantern); lantern.position.set(0, -0.275, 0);
    lanternPivot.scale.setScalar(0.58);
    root.add(lanternPivot);
    // ---- hunting rifle (bolt action), held low
    const rifle = new THREE.Group();
    { const st = new GB(false), mt = new GB(false), gv = new GB(false);
      mt.sweep([{ p: [0, 0, -0.04], w: 0.011 }, { p: [0, 0, -0.35], w: 0.0095 }, { p: [0, 0, -0.62], w: 0.0085 }], { n: 12, ref: [0, 1, 0], cap0: false, cap1: 0, color: 0xffffff });
      mt.sweep([{ p: [0, 0.0, 0.06], w: 0.015 }, { p: [0, 0.0, -0.08], w: 0.016 }], { n: 12, ref: [0, 1, 0], cap0: 0, cap1: 0, color: 0xffffff });
      mt.sweep([{ p: [0, 0.012, -0.6], w: 0.002, d: 0.004 }, { p: [0, 0.022, -0.6], w: 0.0015 }], { n: 5, color: 0xffffff });
      mt.sweep([{ p: [0.012, 0.004, 0.03], w: 0.004 }, { p: [0.045, -0.012, 0.035], w: 0.004 }], { n: 6, cap1: 0.008, color: 0xffffff });
      mt.ellip([0.048, -0.014, 0.035], 0.008, 0.008, 0.008, { n: 8, rings: 5, color: 0xffffff });
      mt.sweep([{ p: [0, -0.03, 0.01], w: 0.003, d: 0.012 }, { p: [0, -0.045, 0.04], w: 0.003, d: 0.012 }, { p: [0, -0.03, 0.07], w: 0.003, d: 0.012 }], { n: 6, color: 0xffffff });
      st.sweep([{ p: [0, -0.012, -0.42], w: 0.016, d: 0.012 }, { p: [0, -0.016, -0.3], w: 0.021, d: 0.02 }, { p: [0, -0.018, -0.08], w: 0.023, d: 0.024 }, { p: [0, -0.022, 0.07], w: 0.02, d: 0.026 }, { p: [0, -0.035, 0.14], w: 0.018, d: 0.026 },
        { p: [0, -0.055, 0.28], w: 0.021, d: 0.05 }, { p: [0, -0.065, 0.42], w: 0.022, d: 0.06 }], { n: 14, ref: [0, 1, 0], e: 2.4, cap0: 0.01, cap1: 0.006, color: 0xffffff });
      rifle.add(mk(st, wood), mk(mt, metal));
      // right glove on the wrist of the stock
      gv.ellip([0.004, -0.04, 0.12], 0.032, 0.04, 0.05, { axis: 'z', n: 12, rings: 8, color: gloveC });
      for (let f = 0; f < 3; f++) gv.sweep([{ p: [0.03, -0.03 - f * 0.016, 0.1], w: 0.01 }, { p: [0.0, -0.06 - f * 0.012, 0.09], w: 0.01 }, { p: [-0.025, -0.045 - f * 0.012, 0.1], w: 0.009 }], { n: 8, color: gloveC });
      gv.sweep([{ p: [0.01, -0.05, 0.15], w: 0.038 }, { p: [0.04, -0.09, 0.26], w: 0.05 }, { p: [0.08, -0.14, 0.4], w: 0.06 }], { n: 12, cap0: false, color: (q) => (q[2] > 0.19 ? rgb(0x3c4a2c) : rgb(0x2a2018)) });
      rifle.add(mk(gv, glove));
      // left glove under the forend (shown when the lantern isn't carried)
      const lg = new GB(false);
      lg.ellip([0, -0.045, -0.26], 0.034, 0.03, 0.05, { axis: 'z', n: 12, rings: 7, color: gloveC });
      lg.sweep([{ p: [-0.01, -0.06, -0.24], w: 0.036 }, { p: [-0.07, -0.12, -0.12], w: 0.048 }, { p: [-0.14, -0.2, 0.02], w: 0.058 }], { n: 12, cap0: false, color: (q) => (q[2] > -0.2 ? rgb(0x3c4a2c) : rgb(0x2a2018)) });
      const lgm = mk(lg, glove); rifle.add(lgm); rifle.userData.leftHand = lgm;
      const flash = glowDot(0xffd080, 0.25); flash.position.set(0, 0, -0.66); flash.visible = false; rifle.add(flash); rifle.userData.flash = flash;
    }
    rifle.scale.setScalar(0.62);
    root.add(rifle);
    root.visible = false;
    let lastFrame = -1;
    const baseUMW = root.updateMatrixWorld.bind(root);
    root.updateMatrixWorld = function (force) { if (NW.G.mode !== 'play' || (VM && VM.frame !== lastFrame && performance.now() - VM.at > 250)) this.visible = false; baseUMW(force); };
    VM = { root, lantern, lanternPivot, rifle, glove, frame: 0, at: 0, shotT: 9, lastCd: 0, swing: 0, swingV: 0, lastYaw: 0, lastPitch: 0, aim: 0, lagX: 0, lagY: 0 };
    void lastFrame;
    return root;
  };
  Cr.viewmodelUpdate = function (dt, ctx) {
    if (!VM) return;
    const G = NW.G, v = VM, C = R3.Controls;
    dt = Math.min(0.1, dt || 0.016);
    v.at = performance.now(); v.frame++;
    const show = !!ctx && !ctx.menu && G.mode === 'play' && !G.dead && !(NW.UI && NW.UI.blocksMovement && NW.UI.blocksMovement()) && !(R3.View && R3.View.override);
    v.root.visible = show;
    if (!show) return;
    const outdoors = ctx.area && ctx.area.kind === 'forest';
    const lan = !!(R3.View && R3.View.lantern);
    v.rifle.visible = outdoors; v.lanternPivot.visible = lan;
    v.rifle.userData.leftHand.visible = !lan;
    // shots: shootCd jumps to 1.1 and a muzzle-flash fx appears
    const cd = G.shootCd || 0;
    if (cd > v.lastCd + 0.5 && (G.fx || []).some((f) => f.type === 'flash')) v.shotT = 0;
    v.lastCd = cd; v.shotT += dt;
    const k = v.shotT;
    const aimT = k < 0.08 ? k / 0.08 : k < 0.65 ? 1 : 1 - sstep(0.65, 1.05, k);
    v.aim = lerp(v.aim, aimT, Math.min(1, dt * 30));
    const kick = k < 1 ? Math.exp(-k * 14) * Math.min(1, k * 60) : 0;
    // sway from walking and from turning the view
    const mvk = G.moving ? (G.sprinting ? 1.6 : 1) : 0, bob = C.bob || 0, t = ctx.t || 0;
    const dyaw = ((C.yaw - v.lastYaw + PI * 3) % TAU) - PI, dpit = C.pitch - v.lastPitch; v.lastYaw = C.yaw; v.lastPitch = C.pitch;
    v.lagX = lerp(v.lagX, clamp(-dyaw / Math.max(dt, 1e-3) * 0.004, -0.03, 0.03), Math.min(1, dt * 8));
    v.lagY = lerp(v.lagY, clamp(dpit / Math.max(dt, 1e-3) * 0.004, -0.03, 0.03), Math.min(1, dt * 8));
    const swX = Math.cos(bob) * 0.008 * mvk + v.lagX, swY = Math.abs(Math.sin(bob)) * 0.01 * mvk + Math.sin(t * 1.3) * 0.002 + v.lagY;
    const spr = G.sprinting ? 1 : 0;
    // rifle: low on the right, raised to the eye for a shot
    const r = v.rifle, a = v.aim;
    // at rest it is carried at low ready (barrel angled down and across), so only the stock and receiver
    // sit in the lower-right corner; it comes up to the eye for a shot
    r.position.set(lerp(0.16, 0.0, a) + swX, lerp(-0.19, -0.062, a) - swY - spr * 0.05, lerp(-0.26, -0.12, a) + kick * 0.05);
    r.rotation.set(lerp(-0.22 + spr * 0.2, 0.0, a) + kick * 0.22, lerp(0.38 + spr * 0.3, 0.0, a), lerp(0.2, 0, a));
    r.userData.flash.visible = k < 0.06;
    // lantern: pendulum swing driven by turning and walking
    const force = -dyaw / Math.max(dt, 1e-3) * 0.25 + Math.sin(bob) * 1.4 * mvk;
    v.swingV += (-v.swing * 22 - v.swingV * 2.6 + force) * dt; v.swing += v.swingV * dt; v.swing = clamp(v.swing, -0.6, 0.6);
    const lp = v.lanternPivot;
    lp.position.set(-0.24 + swX * 0.7, -0.13 - swY * 0.8 - spr * 0.03, -0.42);
    lp.rotation.set(-0.05, 0.25, v.swing * 0.5);
    v.lantern.rotation.set(Math.sin(t * 0.9) * 0.03 + v.swing * 0.15, 0, v.swing * 0.6);
    const fl = R3.Lights && R3.Lights.f ? R3.Lights.f('lantern') : 1;
    v.lantern.userData.glass.emissiveIntensity = 1.3 * fl; v.lantern.userData.flame.material.opacity = 0.9 * fl;
    v.glove.emissive.setRGB(0.05, 0.022, 0.008).multiplyScalar(lan ? fl : 0);
  };

  // =================================================================== factory
  Cr.make = function (kind, opts) {
    opts = opts || {};
    try {
      switch (kind) {
        case 'human': case 'mimic': return buildHuman(opts);
        case 'dog': case 'wolf': case 'fox': case 'deer': case 'rabbit': return buildQuad(kind, opts);
        case 'crow': return buildCrow();
        case 'lighthunter': return buildLightHunter();
        case 'stag': return buildStag();
        case 'scratcher': return buildScratcher();
        case 'siphon': return buildSiphon();
        case 'dweller': return buildDweller(opts);
      }
    } catch (e) { console.error('[r3 creature ' + kind + ']', e); }
    return null;
  };
  Cr.kinds = ['human', 'dog', 'rabbit', 'deer', 'fox', 'wolf', 'crow', 'lighthunter', 'stag', 'scratcher', 'siphon', 'dweller'];
})(window.NW);
