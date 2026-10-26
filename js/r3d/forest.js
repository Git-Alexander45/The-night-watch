'use strict';
// Forest builder: terrain (R3.Terrain.height), ground, water, ice, bridge, dock, vegetation and natural
// objects of every forest area, footprints in snow, and the belt of forest beyond the playable world.
// Everything is generated in code. Game logic is only read: tiles from NW.World, resources via
// NW.Objects.available, the bridge from state.world.bridgeOut, footprints from NW.Render.prints.
(function (NW) {
  const THREE = window.THREE, R3 = NW.R3;
  if (!THREE || !R3) return;
  const U = NW.U, D = NW.D, W = NW.World;
  const T = W.T;
  const K = R3.K, TM = 0.8;                 // metres per tile
  const AW = R3.AREA_W, AH = R3.AREA_H;
  const F = R3.Forest = { stats: {} };
  const TR = R3.Terrain = {};
  const TAU = Math.PI * 2;
  const st = () => NW.G.state;

  // ===================================================================== noise (JS)
  function h2(ix, iz, s) {
    let h = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, z, s) {
    const ix = Math.floor(x), iz = Math.floor(z);
    let fx = x - ix, fz = z - iz; fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
    const a = h2(ix, iz, s), b = h2(ix + 1, iz, s), c = h2(ix, iz + 1, s), d = h2(ix + 1, iz + 1, s);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ===================================================================== terrain fields
  // One global grid at tile resolution covering the outer belt too (tiles -50..199 x -50..134).
  const GX0 = -50, GY0 = -50, NX = 250, NY = 185;
  const C_GRASS = 0, C_DIRT = 1, C_MUD = 2, C_ASH = 3, C_ROCK = 4, C_WET = 5;
  let FLD = null;
  function areaAtTile(gx, gy) { return W.get(D.areaId(Math.floor(gx / 30), Math.floor(gy / 17))); }
  function tileG(gx, gy) {
    if (gx >= 0 && gx < 150 && gy >= 0 && gy < 85) { const a = areaAtTile(gx, gy); return a.tiles[(gy % 17) * 30 + (gx % 30)]; }
    // beyond the world the creek keeps running north and south
    if (gx >= 0 && gx < 150 && (gy < 0 || gy >= 85)) { const cy = gy < 0 ? 0 : 84; const t = tileG(gx, cy); if (t === T.WATER && D.AREAS[D.areaId(Math.floor(gx / 30), Math.floor(cy / 17))].creek) return T.WATER; }
    return T.GRASS;
  }
  function seedOf() { const s = NW.G && NW.G.state; return s ? s.seed | 0 : 1; }
  let NS = 1;
  function N0(x, z) {
    return (vnoise(x / 17, z / 17, NS) - 0.5) * 0.85 + (vnoise(x / 6.5, z / 6.5, NS + 1) - 0.5) * 0.26 + (vnoise(x / 2.4, z / 2.4, NS + 2) - 0.5) * 0.07;
  }
  function outerRise(x, z) {
    const dx = x < 0 ? -x : x > 120 ? x - 120 : 0, dz = z < 0 ? -z : z > 68 ? z - 68 : 0;
    if (!dx && !dz) return 0;
    return 3.2 * smooth(5, 42, Math.hypot(dx, dz));
  }
  function blurSep(src, rad, wts) {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    let ws = 0; for (let k = -rad; k <= rad; k++) ws += wts[k + rad];
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
      let s = 0; for (let k = -rad; k <= rad; k++) { const xx = Math.min(NX - 1, Math.max(0, x + k)); s += src[y * NX + xx] * wts[k + rad]; }
      tmp[y * NX + x] = s / ws;
    }
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
      let s = 0; for (let k = -rad; k <= rad; k++) { const yy = Math.min(NY - 1, Math.max(0, y + k)); s += tmp[yy * NX + x] * wts[k + rad]; }
      out[y * NX + x] = s / ws;
    }
    return out;
  }
  function ensureFields() {
    const seed = seedOf();
    const probe = W.get('f_2_2');
    if (FLD && FLD.seed === seed && FLD.probe === probe) return FLD;
    NS = (U.hash(seed, 9137) % 100000) + 3;
    const tF = performance.now();
    const n = NX * NY;
    const cls = new Uint8Array(n), dip = new Float32Array(n), flw = new Float32Array(n), fll = new Float32Array(n), rough = new Float32Array(n);
    const trl = new Float32Array(n), deck = new Uint8Array(n), deckL = new Float32Array(n), iceT = new Float32Array(n), fordT = new Float32Array(n), lakeT = new Uint8Array(n);
    const info = {};
    for (let ay = 0; ay < 5; ay++) for (let ax = 0; ax < 5; ax++) {
      const id = D.areaId(ax, ay), lm = D.AREAS[id].lm, ox = ax * AW, oz = ay * AH;
      const inf = info[id] = { lm, creek: !!D.AREAS[id].creek };
      if (lm === 'lake') inf.lakeL = N0(ox + 15.5 * TM, oz + 4.5 * TM);
      if (lm === 'cabin') inf.cabinL = N0(ox + 16 * TM, oz + 7 * TM);
    }
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
      const gx = x + GX0, gy = y + GY0, i = y * NX + x;
      const t = tileG(gx, gy);
      const inWorld = gx >= 0 && gx < 150 && gy >= 0 && gy < 85;
      const aid = inWorld ? D.areaId(Math.floor(gx / 30), Math.floor(gy / 17)) : null;
      const inf = aid ? info[aid] : null, lx = ((gx % 30) + 30) % 30, ly = ((gy % 17) + 17) % 17;
      const lake = !!(inf && inf.lm === 'lake');
      let c = C_GRASS, d = 0;
      switch (t) {
        case T.DIRT: c = C_DIRT; d = -0.13; trl[i] = 1; break;
        case T.BUILDING: c = C_DIRT; break;
        case T.MUD: c = C_MUD; d = -0.1; break;
        case T.ASH: c = C_ASH; break;
        case T.ROCKG: c = C_ROCK; rough[i] = 1; break;
        case T.WATER: c = C_WET; d = lake ? -0.9 : -0.66; if (lake) { lakeT[i] = 1; } break;
        case T.ICE: c = C_WET; d = -0.85; iceT[i] = 1; lakeT[i] = 1; deck[i] = 4; break;
        case T.DOCK: c = C_WET; d = -0.85; iceT[i] = 1; lakeT[i] = 1; deck[i] = 2; break;
        case T.FORD: c = C_WET; d = -0.3; fordT[i] = 1; break;
        case T.STONES: c = C_WET; d = -0.55; deck[i] = 3; break;
        case T.BRIDGE: {
          const ax = Math.floor(gx / 30), wob = Math.round(Math.sin(ly * 0.7 + ax) * 0.6);
          if (lx >= 18 + wob && lx <= 19 + wob) { c = C_WET; d = -0.66; } else c = C_DIRT;
          deck[i] = lx >= 17 && lx <= 20 ? 5 : 1; break;
        }
        default: break;
      }
      cls[i] = c; dip[i] = d;
      if (inf && ((lake && (t === T.WATER || t === T.ICE || t === T.DOCK)) || (inf.lm === 'cabin' && t === T.BUILDING))) { flw[i] = 1; fll[i] = lake ? inf.lakeL : inf.cabinL; }
    }
    const dipB = blurSep(blurSep(dip, 1, [1, 2, 1]), 1, [1, 2, 1]);
    // snow pushed aside by walkers forms low banks along the trail edges
    const trN = blurSep(trl, 1, [1, 2, 1]), trW = blurSep(blurSep(trl, 2, [1, 2, 3, 2, 1]), 1, [1, 2, 1]);
    for (let i = 0; i < n; i++) dipB[i] += Math.max(0, trW[i] - trN[i]) * 0.32 * (cls[i] === C_WET ? 0 : 1);
    const box = [1, 1, 1, 1, 1];
    const flwB = blurSep(blurSep(flw, 2, box), 1, [1, 2, 1]), fllB = blurSep(blurSep(fll, 2, box), 1, [1, 2, 1]);
    const roughB = blurSep(rough, 1, [1, 2, 1]);
    const iceB = blurSep(iceT, 1, [1, 2, 1]), fordB = blurSep(fordT, 1, [1, 2, 1]);
    F.stats.fields = (F.stats.fields || 0) + 1;
    FLD = { seed, probe, cls, dip: dipB, flw: flwB, fll: fllB, rough: roughB, deck, deckL, ice: iceB, ford: fordB, lakeT, info };
    // deck levels need the base surface
    for (const id in info) {
      const inf = info[id];
      if (inf.lm === 'bridge') { const [ax, ay] = D.areaXY(id); inf.bridgeL = base(ax * AW + 18.5 * TM, ay * AH + 8.5 * TM) + 0.3; }
    }
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
      const i = y * NX + x, dk = deck[i]; if (!dk) continue;
      const gx = x + GX0, gy = y + GY0, wx = (gx + 0.5) * TM, wz = (gy + 0.5) * TM, inf = info[D.areaId(Math.floor(gx / 30), Math.floor(gy / 17))];
      deckL[i] = dk === 1 || dk === 5 ? inf.bridgeL : dk === 2 ? inf.lakeL + 0.12 : dk === 4 ? inf.lakeL - 0.17 : base(wx, wz) - 0.08;
    }
    F.stats.fieldMs = Math.round(performance.now() - tF);
    return FLD;
  }
  // bilinear sample helpers (tile-centred)
  let si = 0, sw00 = 0, sw10 = 0, sw01 = 0, sw11 = 0;
  function sPrep(x, z) {
    let fx = x / TM - 0.5 - GX0, fz = z / TM - 0.5 - GY0;
    fx = Math.max(0, Math.min(NX - 1.001, fx)); fz = Math.max(0, Math.min(NY - 1.001, fz));
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    si = iz * NX + ix; sw00 = (1 - tx) * (1 - tz); sw10 = tx * (1 - tz); sw01 = (1 - tx) * tz; sw11 = tx * tz;
  }
  const sGet = (a) => a[si] * sw00 + a[si + 1] * sw10 + a[si + NX] * sw01 + a[si + NX + 1] * sw11;
  function base(x, z) {
    const f = FLD; sPrep(x, z);
    const fw = Math.min(1, sGet(f.flw)), lv = fw > 1e-4 ? sGet(f.fll) / Math.max(1e-4, sGet(f.flw)) : 0;
    const r = sGet(f.rough);
    let n = N0(x, z); if (r > 0.01) n += r * (vnoise(x / 0.9, z / 0.9, NS + 5) - 0.5) * 0.3;
    return n * (1 - fw) + lv * fw + outerRise(x, z);
  }
  function bed(x, z) { ensureFields(); const b = base(x, z); return b + sGet(FLD.dip); }
  TR.bed = bed;
  TR.base = function (x, z) { ensureFields(); return base(x, z); };
  TR.height = function (x, z) {
    ensureFields();
    const b = base(x, z), h = b + sGet(FLD.dip);
    const f = FLD, i0 = si, ws = [sw00, sw10, sw01, sw11], ids = [i0, i0 + 1, i0 + NX, i0 + NX + 1];
    let w = 0, l = 0;
    const out = st() && st().world && st().world.bridgeOut;
    for (let k = 0; k < 4; k++) { const dk = f.deck[ids[k]]; if (!dk || (dk === 5 && out)) continue; w += ws[k]; l += f.deckL[ids[k]] * ws[k]; }
    if (w <= 0) return h;
    const lv = l / w, t = smooth(0, 0.5, w);
    return h + (lv - h) * t;
  };
  TR.waterLevel = function (x, z) { ensureFields(); sPrep(x, z); return sGet(FLD.lakeT) > 0 ? null : base(x, z) - 0.2; };
  TR.reset = () => { FLD = null; };

  // ===================================================================== textures & materials
  let noiseTex = null;
  function makeNoiseTex() {
    const S = 128, data = new Uint8Array(S * S * 4);
    const per = (x, z, P, s) => { const ix = Math.floor(x), iz = Math.floor(z); let fx = x - ix, fz = z - iz; fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz); const H = (a, b) => h2(((a % P) + P) % P, ((b % P) + P) % P, s); const a = H(ix, iz), b = H(ix + 1, iz), c = H(ix, iz + 1), d = H(ix + 1, iz + 1); return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz; };
    const fbm = (u, v, P, s) => per(u * P, v * P, P, s) * 0.55 + per(u * P * 2, v * P * 2, P * 2, s + 1) * 0.3 + per(u * P * 4, v * P * 4, P * 4, s + 2) * 0.15;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, i = (y * S + x) * 4;
      data[i] = Math.round(fbm(u, v, 4, 11) * 255);
      data[i + 1] = Math.round(fbm(u, v, 8, 23) * 255);
      data[i + 2] = Math.round(fbm(u, v, 16, 37) * 255);
      const r = Math.abs(fbm(u, v, 6, 51) - 0.5) * 2; data[i + 3] = Math.round(Math.min(1, r) * 255);
    }
    const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
    return t;
  }
  const texMaps = (name) => { try { return R3.Tex && R3.Tex.maps ? R3.Tex.maps(name) : null; } catch (e) { return null; } };
  function viewTex(tex, size, name) { if (!tex) return null; const v = tex.source.version, t = tex.clone(); t.source.version = v; if (name !== 'wood_log_end') t.repeat.set(1 / size[0], 1 / size[1]); return t; }
  const bound = [];   // { m, name, normal } materials whose maps we rebind on quality changes
  function bindMaps(m, name, normal) {
    const s = texMaps(name);
    if (!s) { const b = (R3.Tex && R3.Tex.BASE && R3.Tex.BASE[name]) || [0x888888, 0.9]; m.color.set(b[0]); return m; }
    m.map = viewTex(s.map, s.size, name); if (normal) { m.normalMap = viewTex(s.normalMap, s.size, name); }
    m.needsUpdate = true;
    if (!bound.includes(m)) bound.push(Object.assign(m.userData, { foTex: name, foN: normal }) && m);
    return m;
  }
  // terrain sampler uniforms (shared, rebound on quality change)
  const TU = { tNoise: { value: null }, tFloor: { value: null }, tFloorN: { value: null }, tDirt: { value: null }, tSnow: { value: null }, tSnowN: { value: null }, tTrail: { value: null }, tGravel: { value: null },
    uS0: { value: new THREE.Vector4(3, 2, 2, 2) }, uS1: { value: new THREE.Vector4(2, 1, 1, 1) } };
  function bindTerrainTex() {
    if (!noiseTex) noiseTex = makeNoiseTex();
    TU.tNoise.value = noiseTex;
    const pick = (name) => texMaps(name);
    const fl = pick('forest_floor'), di = pick('dirt'), sn = pick('snow'), tr = pick('snow_trail'), gv = pick('gravel');
    TU.tFloor.value = fl ? fl.map : noiseTex; TU.tFloorN.value = fl ? fl.normalMap : null;
    TU.tDirt.value = di ? di.map : noiseTex; TU.tSnow.value = sn ? sn.map : noiseTex; TU.tSnowN.value = sn ? sn.normalMap : null;
    TU.tTrail.value = tr ? tr.map : noiseTex; TU.tGravel.value = gv ? gv.map : noiseTex;
    TU.uS0.value.set(fl ? fl.size[0] : 3, di ? di.size[0] : 2, sn ? sn.size[0] : 2, tr ? tr.size[0] : 2);
    TU.uS1.value.set(gv ? gv.size[0] : 2, 1, 1, 1);
    TU.hasMaps = !!(fl && sn);
  }
  NW.Hooks.on('r3Quality', () => {
    try {
      bindTerrainTex();
      bound.forEach((m) => { const s = texMaps(m.userData.foTex); if (!s) return; m.map = viewTex(s.map, s.size, m.userData.foTex); if (m.userData.foN) m.normalMap = viewTex(s.normalMap, s.size, m.userData.foTex); m.needsUpdate = true; });
    } catch (e) { console.error('[r3 forest quality]', e); }
  });

  // Our shaders read the shared uniforms under private names, so they compile whether or not
  // R3.std's own injections reached the shader.
  function foU(sh) {
    sh.uniforms.foSnow = R3.U.uSnow; sh.uniforms.foWet = R3.U.uWet; sh.uniforms.foTime = R3.U.uTime;
    const d = '\nuniform float foSnow; uniform float foWet; uniform float foTime;\n';
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>' + d);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + d);
  }
  const NOISE_GLSL = `
    float foH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float foN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(foH(i), foH(i + vec2(1.0, 0.0)), f.x), mix(foH(i + vec2(0.0, 1.0)), foH(i + vec2(1.0, 1.0)), f.x), f.y); }`;

  // ---- terrain material
  function terrainMat() {
    return R3.mat('fo.terrain', () => {
      bindTerrainTex();
      return R3.std({ color: 0xffffff, roughness: 1, metalness: 0 }, { patchKey: '|foTerrain', patch(sh) {
        foU(sh);
        Object.keys(TU).forEach((k) => { if (k !== 'hasMaps') sh.uniforms[k] = TU[k]; });
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aW0; attribute vec4 aW1; varying vec4 vW0; varying vec4 vW1; varying vec3 vTW; varying vec3 vTN;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW0 = aW0; vW1 = aW1; vTW = (modelMatrix * vec4(transformed, 1.0)).xyz; vTN = normalize(mat3(modelMatrix) * objectNormal);');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          varying vec4 vW0; varying vec4 vW1; varying vec3 vTW; varying vec3 vTN;
          uniform sampler2D tNoise, tFloor, tFloorN, tDirt, tSnow, tSnowN, tTrail, tGravel; uniform vec4 uS0, uS1;`)
          .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 fxz = vTW.xz;
          vec4 nA = texture2D(tNoise, fxz * 0.029);
          vec4 nB = texture2D(tNoise, fxz * 0.16 + 0.31);
          vec4 nC = texture2D(tNoise, fxz * 0.9 + 0.7);
          vec3 cF = texture2D(tFloor, fxz / uS0.x).rgb;
          vec3 cD = texture2D(tDirt, fxz / uS0.y).rgb;
          vec3 cS = texture2D(tSnow, fxz / uS0.z).rgb;
          vec3 cT = texture2D(tTrail, fxz / uS0.w).rgb;
          vec3 cG = texture2D(tGravel, fxz / uS1.x).rgb;
          float ed = (nB.b - 0.5) * 0.55 + (nC.r - 0.5) * 0.2;
          float wd = smoothstep(0.32, 0.68, vW0.x + ed), wm = smoothstep(0.3, 0.7, vW0.y + ed), wa = smoothstep(0.22, 0.6, vW0.z + ed), wr = smoothstep(0.3, 0.7, vW0.w + ed);
          float wwet = clamp(vW1.x, 0.0, 1.0), can = clamp(vW1.y, 0.0, 1.0), low = vW1.z;
          // forest floor: dry grass, moss patches, needle litter under the trees
          vec3 g = cF * mix(vec3(1.0), vec3(0.78, 1.0, 0.72), smoothstep(0.5, 0.72, nA.r) * 0.8);
          g = mix(g, g * vec3(1.15, 1.05, 0.8), smoothstep(0.45, 0.25, nA.g) * 0.6);
          g = mix(g, g * vec3(0.7, 0.52, 0.4), can * 0.65);
          vec3 col = g;
          col = mix(col, cD * vec3(0.95, 0.9, 0.85), wd);
          col = mix(col, cD * vec3(0.42, 0.38, 0.33), wm);
          float lum = dot(cF, vec3(0.3333));
          col = mix(col, vec3(lum * 0.35 + 0.012) * (0.55 + 0.9 * nC.g) * vec3(1.0, 0.97, 0.94), wa);
          col = mix(col, cG * 0.85, wr);
          col = mix(col, cG * vec3(0.32, 0.33, 0.34), wwet * 0.85);
          float fRough = mix(0.95, 0.9, wd);
          fRough = mix(fRough, 0.42, wm); fRough = mix(fRough, 0.3, wwet);
          // snow cover follows foSnow (0..1); trails become packed grey snow
          float cap = 1.0 - wm * 0.5 - wwet * 0.9 - can * 0.3 - wr * 0.2;
          float sAmt = clamp(foSnow * cap, 0.0, 1.0);
          float fCov = smoothstep(0.02, 0.6, sAmt);
          float nn = nA.g * 0.5 + nB.r * 0.35 + nC.b * 0.15;
          float cover = smoothstep(1.0 - fCov - 0.05, 1.0 - fCov + 0.05, nn) * step(0.001, fCov);
          cover = max(cover, smoothstep(0.85, 1.0, fCov));
          // trodden trail: packed, bluish-grey snow with boot-worn ruts and earth showing in the middle
          float tw = smoothstep(0.38, 0.62, vW0.x + ed * 0.35);
          vec3 packed = cT * vec3(0.8, 0.83, 0.9);
          float rut = smoothstep(0.55, 0.85, nC.r * 0.7 + nB.g * 0.3) * smoothstep(0.7, 1.0, vW0.x);
          packed = mix(packed, cD * vec3(0.62, 0.58, 0.54), rut * 0.35 * (1.0 - foSnow * 0.5));
          float bank = clamp(vW0.x * (1.0 - vW0.x) * 4.0, 0.0, 1.0) * (1.0 - tw);
          vec3 sCol = mix(cS * vec3(0.98, 1.0, 1.04), packed, tw);
          sCol *= (0.92 + 0.12 * nB.g) * (1.0 + bank * 0.06);
          sCol = mix(sCol, sCol * vec3(0.72, 0.74, 0.78), foWet * 0.6);
          col = mix(col, sCol, cover);
          fRough = mix(fRough, mix(0.72, 0.5, tw), cover);
          // rain: darker ground, puddles in low spots
          float puddle = smoothstep(0.42, 0.62, low + (nB.g - 0.5) * 0.45) * foWet * (1.0 - cover * 0.85);
          col *= 1.0 - foWet * 0.38 * (1.0 - cover);
          col = mix(col, col * 0.22 + vec3(0.003, 0.005, 0.007), puddle);
          fRough = mix(fRough, fRough * 0.55, foWet * (1.0 - cover));
          fRough = mix(fRough, 0.04, puddle);
          diffuseColor.rgb *= col;`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = fRough;')
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            vec3 mF = texture2D(tFloorN, fxz / uS0.x).xyz * 2.0 - 1.0;
            vec3 mS = texture2D(tSnowN, fxz / uS0.z).xyz * 2.0 - 1.0;
            vec3 m = normalize(mix(mF, mS * vec3(0.7, 0.7, 1.0), cover));
            m.xy *= 1.0 - puddle;
            vec3 Nw = normalize(vTN);
            vec3 Tw = normalize(vec3(1.0, 0.0, 0.0) - Nw * Nw.x), Bw = normalize(cross(Tw, Nw));
            vec3 nw = normalize(Tw * m.x - Bw * m.y + Nw * m.z);
            normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
          }`);
      } });
    });
  }

  // ---- water / ice material
  function waterMat() {
    return R3.mat('fo.water', () => {
      if (!noiseTex) noiseTex = makeNoiseTex();
      const m = R3.std({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, depthWrite: true }, { patchKey: '|foWater', patch(sh) {
        foU(sh);
        sh.uniforms.tNoise = TU.tNoise; sh.uniforms.tSnow = TU.tSnow; sh.uniforms.uS0 = TU.uS0;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aW0; varying vec4 vW0; varying vec3 vTW;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW0 = aW0; vTW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vW0; varying vec3 vTW; uniform sampler2D tNoise, tSnow; uniform vec4 uS0;')
          .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 wxz = vTW.xz; float tt = foTime;
          float flow = vW0.z, ford = clamp(vW0.w, 0.0, 1.0), depth = vW0.y;
          vec4 st0 = texture2D(tNoise, wxz * 0.21);
          vec4 st1 = texture2D(tNoise, wxz * 0.9 + 0.13);
          float ice = smoothstep(0.47, 0.53, vW0.x + (st0.r - 0.5) * 0.3 + (st1.g - 0.5) * 0.1);
          vec4 r1 = texture2D(tNoise, wxz * vec2(0.55, 0.32) + vec2(tt * 0.013, -tt * flow * 0.32));
          vec4 r2 = texture2D(tNoise, wxz * vec2(1.6, 1.1) + vec2(-tt * 0.031, -tt * flow * 0.85 + tt * 0.02));
          vec4 r3 = texture2D(tNoise, wxz * 3.4 + vec2(tt * 0.05, -tt * flow * 1.6));
          vec2 rip = (r1.gb - 0.5) * 0.55 + (r2.rg - 0.5) * 0.45 + (r3.gb - 0.5) * (0.25 + ford * 0.6);
          rip *= (0.35 + ford * 1.1 + foWet * 0.6 + flow * 0.9) * (1.0 - ice);
          vec3 wcol = vec3(0.022, 0.034, 0.042);
          vec3 bedC = vec3(0.05, 0.045, 0.035) * (0.6 + st1.b);
          wcol = mix(bedC, wcol, smoothstep(0.03, 0.5, depth));
          float foam = smoothstep(0.62, 0.8, r2.r * 0.6 + r3.g * 0.5) * (ford * 0.8 + flow * 0.25) * (1.0 - ice);
          wcol = mix(wcol, vec3(0.42, 0.46, 0.5), foam * 0.6);
          // ice: blue-grey, cracked, dusted with snow
          float cr = 1.0 - smoothstep(0.0, 0.035, st0.a) ; float cr2 = 1.0 - smoothstep(0.0, 0.03, st1.a);
          vec3 icol = vec3(0.16, 0.22, 0.26) * (0.75 + 0.5 * st0.g) + vec3(0.05, 0.07, 0.08) * st1.r;
          icol = mix(icol, vec3(0.06, 0.09, 0.11), smoothstep(0.62, 0.8, st0.b) * 0.45);
          icol = mix(icol, vec3(0.55, 0.62, 0.68), max(cr, cr2 * 0.6) * 0.75);
          float dust = smoothstep(1.0 - foSnow * 0.95 - 0.12, 1.0 - foSnow * 0.95 + 0.12, st0.r * 0.6 + st1.g * 0.4) * step(0.02, foSnow);
          vec3 sCol = texture2D(tSnow, wxz / uS0.z).rgb;
          icol = mix(icol, sCol * 0.95, dust * 0.9);
          // a pale shelf edge where the ice meets open water, slush floating in it
          float shelf = smoothstep(0.36, 0.47, vW0.x + (st0.r - 0.5) * 0.3) * (1.0 - ice);
          wcol = mix(wcol, vec3(0.5, 0.56, 0.62), shelf * 0.55 + smoothstep(0.7, 0.85, st1.r) * 0.25 * (1.0 - ford));
          diffuseColor.rgb = mix(wcol, icol, ice);
          diffuseColor.a = mix(mix(0.6, 0.97, smoothstep(0.02, 0.4, depth)), 1.0, max(ice, foam));
          float wRough = mix(0.035 + ford * 0.05, mix(0.22, 0.75, dust), ice);
          vec3 wN = normalize(vec3(rip.x, 1.0, rip.y));
          vec3 wV = normalize(cameraPosition - vTW);
          float fres = pow(1.0 - max(dot(wV, wN), 0.0), 4.0);`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = wRough;')
          .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          #ifdef USE_FOG
            totalEmissiveRadiance += fogColor * (0.12 + fres * 0.75) * (1.0 - ice) * 0.9;
          #endif`);
      } });
      return m;
    });
  }

  // ---- vegetation materials
  const CARD_PATCH = (sh) => {
    foU(sh);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aCard; varying vec3 vCard;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vCard = aCard;
      if (aCard.z > 3.5 && aCard.z < 4.5) {          // grass: sinks into deep snow, sways from the tips
        float gh = max(transformed.y, 0.0);
        #ifdef USE_INSTANCING
          vec2 gp = instanceMatrix[3].xz;
        #else
          vec2 gp = vec2(0.0);
        #endif
        float gs = sin(foTime * 2.1 + gp.x * 0.7 + gp.y * 0.5) * 0.6 + sin(foTime * 3.7 + gp.x * 1.3) * 0.25;
        transformed.xz += vec2(0.8, 0.55) * gs * gh * gh * 0.9;
        transformed.y -= foSnow * 0.3 * max(0.0, 1.0 - transformed.y * 0.4);
      }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCard;\n' + NOISE_GLSL)
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        float sh = vCard.z, cu = vCard.x, cv = vCard.y, msk = 1.0;
        if (sh > 8.5) { diffuseColor.a = 1.0; }
        else if (sh > 0.5 && sh < 1.5) {           // pine spray: tapered, ragged
          float hw = (1.0 - pow(cu, 2.2)) * smoothstep(0.0, 0.1, cu) * 0.92 + 0.08;
          hw += (foN(vec2(cu * 22.0, step(0.0, cv) * 7.0)) - 0.5) * 0.35;
          msk = step(abs(cv), hw);
        } else if (sh > 1.5 && sh < 2.5) {         // round clump
          vec2 q = vec2(cu * 2.0 - 1.0, cv);
          float a = atan(q.y, q.x);
          msk = step(length(q), 0.9 - foN(vec2(a * 3.0, 1.7)) * 0.35);
        } else if (sh > 2.5 && sh < 3.5) {         // fern frond
          float hw = sin(3.14159 * clamp(cu, 0.0, 1.0)) * 0.95;
          float pin = fract(cu * 16.0 + abs(cv) * 1.6);
          msk = step(abs(cv), hw) * (step(pin, 0.62) + step(abs(cv), 0.06));
        }
        diffuseColor.a *= clamp(msk, 0.0, 1.0);
      }`)
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
  };
  const ROUGH_PATCH = (sh) => {
    // wind-driven snow plastered in streaks on the windward side of trunks, logs and boulders
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      #ifdef R3_SURF
      {
        float wwd = dot(vR3Normal, -normalize(vec3(uWind.x, 0.0, uWind.y)));
        float pn = r3noise(vR3World * vec3(9.0, 0.45, 9.0)) * 0.65 + r3noise(vR3World * vec3(23.0, 2.0, 23.0)) * 0.35;
        float pl = smoothstep(0.3, 0.85, wwd) * smoothstep(0.5, 0.6, pn) * smoothstep(0.35, 0.9, uSnow) * uR3S.z;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.82, 0.88) * (0.88 + 0.15 * pn), pl * 0.8);
      }
      #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n#ifdef USE_NORMALMAP\n  roughnessFactor *= texture2D( normalMap, vNormalMapUv ).a;\n#endif');
  };
  const MAT = {};
  function mats() {
    if (MAT.ok) return MAT;
    MAT.ok = true;
    // Few shader variants: maps differ, defines are shared (one program per group).
    const BARK = { wind: 0.1, snowTop: 0.7, wet: true, patch: ROUGH_PATCH, patchKey: '|foRough' };     // instanced trunks
    const STAT = { snowTop: 0.9, wet: true, patch: ROUGH_PATCH, patchKey: '|foRough' };                  // static rocks / wood
    const tex = (key, name, opts, extra) => R3.mat(key, () => bindMaps(R3.std(Object.assign({ color: 0xffffff, roughness: 1, vertexColors: true, normalScale: new THREE.Vector2(1, 1) }, extra || {}), opts), name, true));
    MAT.barkPine = tex('fo.barkPine', 'bark_pine', BARK);
    MAT.barkBirch = tex('fo.barkBirch', 'bark_birch', BARK);
    MAT.barkDead = tex('fo.barkDead', 'bark_dead', BARK);
    MAT.woodEnd = tex('fo.woodEnd', 'wood_log_end', BARK);
    MAT.log = tex('fo.log', 'bark_pine', STAT);
    MAT.rock = tex('fo.rock', 'rock_lichen', STAT, { normalScale: new THREE.Vector2(1.2, 1.2) });
    MAT.boards = tex('fo.boards', 'boards_weathered', STAT);
    MAT.boardLog = tex('fo.boardLog', 'wood_log', STAT);
    const card = (key, name) => R3.mat(key, () => bindMaps(R3.std({ color: 0xffffff, roughness: 0.85, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide }, { wind: 0.12, snowTop: 0.8, wet: true, patch: CARD_PATCH, patchKey: '|foCard' }), name, false));
    MAT.needles = card('fo.needles', 'needles');
    MAT.leaf = card('fo.leaf', 'foliage_birch');
    MAT.lowLeaf = MAT.leaf;
    MAT.grass = card('fo.grass', 'grass_card');
    MAT.plain = R3.mat('fo.plain', () => R3.std({ color: 0xffffff, roughness: 0.65, vertexColors: true, side: THREE.DoubleSide }, { wind: 1.0, snowTop: 0.5, wet: true }));
    MAT.plainStiff = MAT.plain;
    MAT.flora = R3.Flora ? R3.Flora.cardMat() : MAT.grass;
    return MAT;
  }
  F.mats = mats;

  // ===================================================================== geometry builder
  class GB {
    constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.k = []; this.ix = []; }
    v(x, y, z, nx, ny, nz, u, w, col, k) {
      this.p.push(x, y, z); const l = Math.hypot(nx, ny, nz) || 1; this.n.push(nx / l, ny / l, nz / l); this.uv.push(u, w);
      this.c.push(col[0], col[1], col[2]); this.k.push(k ? k[0] : 0, k ? k[1] : 0, k ? k[2] : 0);
      return this.p.length / 3 - 1;
    }
    t(a, b, c) { this.ix.push(a, b, c); }
    q(a, b, c, d) { this.ix.push(a, b, c, a, c, d); }
    // generalized cylinder along points [{x,y,z,r}], radial segments, colour, cap
    tube(pts, rad, col, opt) {
      opt = opt || {};
      const rings = [];
      let along = 0; const up = new THREE.Vector3(0, 1, 0), tx = new THREE.Vector3(1, 0, 0);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const t = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
        const ref = Math.abs(t.y) < 0.9 ? up : tx;
        const n1 = new THREE.Vector3().crossVectors(t, ref).normalize(), n2 = new THREE.Vector3().crossVectors(t, n1).normalize();
        if (i > 0) along += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y, p.z - pts[i - 1].z);
        const ring = [];
        const circ = TAU * (opt.uR || p.r);
        for (let j = 0; j <= rad; j++) {
          const an = j / rad * TAU, cx = Math.cos(an), cz = Math.sin(an);
          const jr = p.jag ? 1 + (h2(i, j, 77) - 0.5) * p.jag : 1;
          const nx = n1.x * cx + n2.x * cz, ny = n1.y * cx + n2.y * cz, nz = n1.z * cx + n2.z * cz;
          const yj = p.yj ? (h2(j % rad, i, 91) - 0.5) * p.yj : 0;
          ring.push(this.v(p.x + nx * p.r * jr, p.y + ny * p.r * jr + yj, p.z + nz * p.r * jr, nx, ny + (opt.ny || 0), nz, j / rad * circ, along, col, opt.k));
        }
        rings.push(ring);
      }
      for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < rad; j++) this.q(rings[i][j], rings[i + 1][j], rings[i + 1][j + 1], rings[i][j + 1]);
      if (opt.cap) {
        const p = pts[pts.length - 1], l = rings[rings.length - 1];
        const c = this.v(p.x, p.y + (opt.capY || 0), p.z, 0, 1, 0, 0, along, opt.capCol || col, opt.k);
        for (let j = 0; j < rad; j++) this.t(l[j], c, l[j + 1]);
      }
      return this;
    }
    // bent card: origin o, unit dir d (length axis), unit s (width axis), length L, width Wd, segs, droop (m at tip),
    // uv in metres (sheet), shape id, colour, normal fn(px,py,pz) -> [nx,ny,nz]
    card(o, d, s, L, Wd, segs, droop, shape, col, nfn, uvo) {
      const base = this.p.length / 3; uvo = uvo || [0, 0];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs, dy = -droop * t * t;
        for (let k = -1; k <= 1; k += 2) {
          const x = o.x + d.x * L * t + s.x * k * Wd / 2, y = o.y + d.y * L * t + dy + s.y * k * Wd / 2, z = o.z + d.z * L * t + s.z * k * Wd / 2;
          const n = nfn(x, y, z, t, k);
          this.v(x, y, z, n[0], n[1], n[2], uvo[0] + t * L, uvo[1] + (k * 0.5 + 0.5) * Wd, col, [t, k, shape]);
        }
      }
      for (let i = 0; i < segs; i++) { const a = base + i * 2; this.q(a, a + 2, a + 3, a + 1); }
      return this;
    }
    // ellipsoid blob (berries, caps, umbels)
    blob(cx, cy, cz, rx, ry, rz, col, seg) {
      seg = seg || 4; const base = this.p.length / 3;
      for (let i = 0; i <= seg; i++) { const v = i / seg * Math.PI; for (let j = 0; j <= seg * 2; j++) { const u = j / (seg * 2) * TAU; const nx = Math.sin(v) * Math.cos(u), ny = Math.cos(v), nz = Math.sin(v) * Math.sin(u); this.v(cx + nx * rx, cy + ny * ry, cz + nz * rz, nx / rx, ny / ry, nz / rz, 0, 0, col); } }
      const row = seg * 2 + 1;
      for (let i = 0; i < seg; i++) for (let j = 0; j < seg * 2; j++) { const a = base + i * row + j; this.q(a, a + row, a + row + 1, a + 1); }
      return this;
    }
    // flat tapered blade strip from root (x,y,z) along dir with bend
    blade(x, y, z, dx, dz, h, w, lean, col, segs) {
      segs = segs || 3; const base = this.p.length / 3; const sx = -dz, sz = dx;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs, ww = w * (1 - t * 0.9), off = lean * t * t * h;
        for (let k = -1; k <= 1; k += 2) this.v(x + dx * off + sx * k * ww / 2, y + h * t * (1 - lean * lean * t * 0.3), z + dz * off + sz * k * ww / 2, dx * 0.3, 1, dz * 0.3, k, t, [col[0] * (0.7 + 0.4 * t), col[1] * (0.7 + 0.4 * t), col[2] * (0.7 + 0.4 * t)]);
      }
      for (let i = 0; i < segs; i++) { const a = base + i * 2; this.q(a, a + 2, a + 3, a + 1); }
      return this;
    }
    geo() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setAttribute('aCard', new THREE.Float32BufferAttribute(this.k, 3));
      g.setIndex(this.ix);
      g.computeBoundingSphere(); g.computeBoundingBox();
      g.userData.shared = true;
      return g;
    }
  }
  const outward = (k) => (x, y, z) => { const r = Math.hypot(x, z) || 1; return [x / r * 0.8, k, z / r * 0.8]; };

  // ===================================================================== models (shared, built once)
  const PINE_H = 12;
  const pineR = (y, H) => 0.24 * Math.pow(Math.max(0, 1 - y / H), 1.1) + 0.012 + 0.09 * Math.exp(-y * 5);
  function pineTrunk(H, rad, rings, stubs, rnd) {
    const g = new GB(), pts = [];
    for (let i = 0; i <= rings; i++) { const y = -0.15 + (H + 0.15) * Math.pow(i / rings, 1.15); pts.push({ x: Math.sin(y * 0.4) * 0.04, y, z: Math.cos(y * 0.33) * 0.03, r: pineR(Math.max(0, y), H) }); }
    g.tube(pts, rad, [1, 1, 1], { uR: 0.24 });
    if (stubs) for (let i = 0; i < stubs; i++) {
      const y = 0.8 + rnd() * 1.6, a = rnd() * TAU, l = 0.3 + rnd() * 0.7, r = pineR(y, H);
      g.tube([{ x: Math.cos(a) * r * 0.7, y, z: Math.sin(a) * r * 0.7, r: 0.025 }, { x: Math.cos(a) * (r + l), y: y + l * 0.1 - 0.15 * l, z: Math.sin(a) * (r + l), r: 0.006 }], 3, [0.75, 0.72, 0.7]);
    }
    return g.geo();
  }
  function pineCrown(H, detail, rnd) {
    const g = new GB();
    const y0 = detail === 0 ? 2.0 : detail === 1 ? 2.3 : 2.8;
    const step = detail === 0 ? 0.66 : detail === 1 ? 1.25 : 2.4;
    const maxL = 2.5;
    for (let y = y0; y < H - 0.25; y += step * (0.85 + rnd() * 0.3)) {
      const rel = (H - y) / (H - y0);
      const nb = detail === 0 ? 5 + Math.floor(rnd() * 3) : detail === 1 ? 5 : 4;
      const a0 = rnd() * TAU;
      for (let b = 0; b < nb; b++) {
        const a = a0 + b / nb * TAU + (rnd() - 0.5) * 0.6;
        const L = (maxL * Math.pow(rel, 0.95) + 0.35) * (0.85 + rnd() * 0.3) * (detail === 2 ? 1.1 : 1);
        const dx = Math.cos(a), dz = Math.sin(a), el = 0.12 - rel * 0.2 + (rnd() - 0.5) * 0.1;
        const d = new THREE.Vector3(dx * Math.cos(el), Math.sin(el), dz * Math.cos(el)).normalize();
        const r = pineR(y, H);
        const o = { x: dx * r * 0.5, y, z: dz * r * 0.5 };
        const Wd = Math.min(1.5, Math.max(0.4, L * 0.62)) * (detail ? 1.25 : 1);
        const tint = 0.85 + rnd() * 0.3, col = [tint * (0.95 + rel * 0.1), tint, tint * (0.95 + rnd() * 0.1)];
        const nf = (x, yy, z) => { const rr = Math.hypot(x, z) || 1; const up = 0.5 + (yy - y0) / H * 0.25; return [x / rr * 0.85, up, z / rr * 0.85]; };
        const droop = L * (0.22 + (1 - rel) * 0.05 + rnd() * 0.1);
        const rolls = detail === 0 ? [-0.55, 0.55] : [0];
        rolls.forEach((roll) => {
          const s0 = new THREE.Vector3(-dz, 0, dx), s = s0.clone().applyAxisAngle(d, roll);
          g.card(o, d, s, L, Wd, detail === 2 ? 1 : 2, droop, 1, col, nf, [rnd() * 3, rnd() * 3]);
        });
      }
    }
    // dense inner mass so the crown never looks hollow
    const rad = detail === 0 ? 9 : detail === 1 ? 7 : 6, rings = detail === 0 ? 6 : detail === 1 ? 4 : 3;
    const pts = [];
    for (let i = 0; i <= rings; i++) {
      const t = i / rings, y = y0 + 0.4 + (H * 0.94 - y0 - 0.4) * t;
      pts.push({ x: 0, y, z: 0, r: Math.max(0.05, (maxL * 0.5) * Math.pow(1 - t, 1.0) + 0.05), jag: 0.45 });
    }
    g.tube(pts, rad, [0.42, 0.48, 0.44], { k: [0.5, 0, 9], ny: 0.5, cap: true, capY: 0.4 });
    return g.geo();
  }
  function birchParts(H, leafy, detail, rnd) {
    const bark = new GB(), crown = new GB();
    const pts = [];
    const lean = (rnd() - 0.5) * 0.3, rings = detail ? 3 : 7;
    for (let i = 0; i <= rings; i++) { const y = -0.1 + (H + 0.1) * i / rings; pts.push({ x: lean * y * y / H * 0.3 + Math.sin(y * 0.9) * 0.05, y, z: Math.sin(y * 0.5) * 0.05, r: 0.15 * Math.pow(1 - Math.max(0, y) / H, 0.9) + 0.012 + 0.06 * Math.exp(-Math.max(0, y) * 6) }); }
    bark.tube(pts, detail ? 5 : 8, [1, 1, 1], { uR: 0.15 });
    const at = (y) => { const t = y / H; return { x: lean * y * y / H * 0.3 + Math.sin(y * 0.9) * 0.05, z: Math.sin(y * 0.5) * 0.05, r: 0.15 * Math.pow(1 - t, 0.9) + 0.012 }; };
    const nbr = detail ? 6 : 10;
    for (let b = 0; b < nbr; b++) {
      const y = H * (0.42 + 0.5 * b / nbr) + (rnd() - 0.5) * 0.4, a = b * 2.4 + rnd() * 0.5, L = (1.4 + rnd() * 1.4) * (1 - (y / H - 0.4) * 0.8);
      const c = at(y), dx = Math.cos(a), dz = Math.sin(a);
      const bp = [];
      for (let i = 0; i <= 3; i++) { const t = i / 3; bp.push({ x: c.x + dx * L * t, y: y + L * t * (0.55 + t * 0.35), z: c.z + dz * L * t, r: 0.045 * (1 - t * 0.85) }); }
      bark.tube(bp, detail ? 3 : 4, [0.55, 0.5, 0.5]);
      const tip = bp[3];
      if (leafy) {
        const nc = detail ? 1 : 3;
        for (let k = 0; k < nc; k++) {
          const t = detail ? 0.85 : 0.45 + k * 0.28, px = c.x + dx * L * t, py = y + L * t * (0.55 + t * 0.35), pz = c.z + dz * L * t;
          const sz = (0.9 + rnd() * 0.6) * (detail ? 1.8 : 1);
          const d = new THREE.Vector3(dx, 0.25 + rnd() * 0.3, dz).normalize();
          const nf = (x, yy, z) => { const rr = Math.hypot(x, z) || 1; return [x / rr, 0.6, z / rr]; };
          const tint = 0.8 + rnd() * 0.35, col = [tint, tint * (0.95 + rnd() * 0.1), tint * 0.85];
          [0, Math.PI / 2].forEach((roll) => { const s = new THREE.Vector3(-dz, 0, dx).applyAxisAngle(d, roll); crown.card({ x: px - d.x * sz * 0.5, y: py - d.y * sz * 0.5, z: pz - d.z * sz * 0.5 }, d, s, sz, sz, 1, 0.1, 2, col, nf, [rnd() * 2, rnd() * 2]); });
        }
      } else if (!detail) {
        for (let k = 0; k < 4; k++) {
          const t = 0.4 + k * 0.2, px = c.x + dx * L * t, py = y + L * t * (0.55 + t * 0.35), pz = c.z + dz * L * t;
          const a2 = a + (rnd() - 0.5) * 2.2, l2 = 0.5 + rnd() * 0.6;
          bark.tube([{ x: px, y: py, z: pz, r: 0.014 }, { x: px + Math.cos(a2) * l2, y: py + l2 * (0.3 + rnd() * 0.5), z: pz + Math.sin(a2) * l2, r: 0.003 }], 3, [0.35, 0.28, 0.28]);
        }
        void tip;
      }
    }
    if (leafy) {
      for (let k = 0; k < (detail ? 2 : 4); k++) {
        const y = H * (0.7 + k * 0.08), c = at(y), sz = 1.2 + rnd() * 0.5, a = rnd() * TAU, d = new THREE.Vector3(Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3).normalize();
        const s = new THREE.Vector3(Math.cos(a + 1.6), 0, Math.sin(a + 1.6));
        crown.card({ x: c.x, y: y - sz * 0.2, z: c.z }, d, s, sz, sz, 1, 0, 2, [0.95, 0.95, 0.8], (x, yy, z) => [x, 0.7, z], [rnd(), rnd()]);
      }
    }
    return { bark: bark.geo(), crown: leafy ? crown.geo() : null };
  }
  function deadTree(variant, rnd) {
    const g = new GB(), H = variant ? 3.6 : 5.4, lean = variant ? 0.14 : 0.03, pts = [];
    for (let i = 0; i <= 6; i++) { const y = -0.1 + (H + 0.1) * i / 6; pts.push({ x: lean * y, y, z: Math.sin(y) * 0.04, r: 0.21 * (1 - y / H * 0.6) + 0.06 * Math.exp(-Math.max(0, y) * 5), yj: i === 6 ? 0.7 : 0 }); }
    g.tube(pts, 8, [1, 1, 1], { uR: 0.21, cap: true, capY: -0.25, capCol: [0.8, 0.75, 0.7] });
    const nb = variant ? 3 : 6;
    for (let b = 0; b < nb; b++) {
      const y = H * (0.35 + 0.55 * b / nb), a = b * 2.3 + rnd(), L = 0.5 + rnd() * (variant ? 0.8 : 1.4), r = 0.21 * (1 - y / H * 0.6);
      const dx = Math.cos(a), dz = Math.sin(a), x0 = lean * y;
      g.tube([{ x: x0 + dx * r * 0.6, y, z: dz * r * 0.6, r: 0.06 }, { x: x0 + dx * (r + L * 0.6), y: y + L * 0.35, z: dz * (r + L * 0.6), r: 0.035 }, { x: x0 + dx * (r + L), y: y + L * 0.5 + (rnd() - 0.5) * 0.3, z: dz * (r + L), r: 0.012 }], 4, [0.9, 0.88, 0.85]);
    }
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + rnd(); g.tube([{ x: Math.cos(a) * 0.15, y: 0.25, z: Math.sin(a) * 0.15, r: 0.08 }, { x: Math.cos(a) * 0.5, y: -0.05, z: Math.sin(a) * 0.5, r: 0.03 }], 4, [0.8, 0.78, 0.75]); }
    return g.geo();
  }
  function stumpSide(rnd) {
    const g = new GB();
    g.tube([{ x: 0, y: -0.1, z: 0, r: 0.33 }, { x: 0, y: 0.15, z: 0, r: 0.29 }, { x: 0, y: 0.45, z: 0, r: 0.27, yj: 0.05 }], 10, [1, 1, 1], { uR: 0.28 });
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + rnd() * 0.5; g.tube([{ x: Math.cos(a) * 0.2, y: 0.18, z: Math.sin(a) * 0.2, r: 0.09 }, { x: Math.cos(a) * 0.45, y: 0.02, z: Math.sin(a) * 0.45, r: 0.06 }, { x: Math.cos(a) * 0.7, y: -0.08, z: Math.sin(a) * 0.7, r: 0.02 }], 5, [0.9, 0.9, 0.9]); }
    return g.geo();
  }
  function stumpTop() {
    const g = new THREE.CircleGeometry(0.27, 14); g.rotateX(-Math.PI / 2); g.translate(0, 0.452, 0);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    g.userData.shared = true; return g;
  }
  function rockGeo(seedK, detail, sx, sy, sz, flatTop) {
    const g = new THREE.IcosahedronGeometry(1, detail);
    // merge duplicated vertices so the displaced surface stays smooth
    const pos = g.attributes.position, map = new Map(), idx = [], verts = [];
    for (let i = 0; i < pos.count; i++) { const k = Math.round(pos.getX(i) * 1e4) + ',' + Math.round(pos.getY(i) * 1e4) + ',' + Math.round(pos.getZ(i) * 1e4); let j = map.get(k); if (j == null) { j = verts.length / 3; map.set(k, j); verts.push(pos.getX(i), pos.getY(i), pos.getZ(i)); } idx.push(j); }
    for (let i = 0; i < verts.length; i += 3) {
      let x = verts[i], y = verts[i + 1], z = verts[i + 2];
      const n = (vnoise(x * 1.7 + seedK, z * 1.7 + y * 1.3, 501) - 0.5) * 0.55 + (vnoise(x * 4.1 + y * 2.3, z * 4.1 + seedK, 502) - 0.5) * 0.18;
      const r = 1 + n;
      x *= r * sx; y *= r * sy; z *= r * sz;
      if (flatTop && y > sy * 0.55) y = sy * 0.55 + (y - sy * 0.55) * 0.25;
      if (y < -0.1 * sy) y = -0.1 * sy + (y + 0.1 * sy) * 0.15;
      verts[i] = x; verts[i + 1] = y + sy * 0.18; verts[i + 2] = z;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); out.setIndex(idx); out.computeVertexNormals();
    R3.Tex.metreUV(out);
    g.dispose();
    return out;
  }
  function bushGeo(berries, rnd) {
    const g = new GB(), b = new GB();
    for (let i = 0; i < 16; i++) {
      const a = rnd() * TAU, el = 0.15 + rnd() * 0.9, r = 0.32;
      const cx = Math.cos(a) * Math.cos(el) * r, cy = 0.2 + Math.sin(el) * r * 0.9, cz = Math.sin(a) * Math.cos(el) * r;
      const d = new THREE.Vector3(-Math.sin(a), 0.2 + rnd() * 0.4, Math.cos(a)).normalize(), s = new THREE.Vector3(Math.cos(a) * Math.sin(el), -Math.cos(el), Math.sin(a) * Math.sin(el)).normalize().multiplyScalar(-1);
      const sz = 0.32 + rnd() * 0.18, tint = 0.85 + rnd() * 0.3;
      g.card({ x: cx - d.x * sz / 2, y: cy - d.y * sz / 2, z: cz - d.z * sz / 2 }, d, s, sz, sz, 1, 0.02, 2, [0.3 * tint, 0.42 * tint, 0.22 * tint], (x, y, z) => [x, y - 0.1, z], [rnd(), rnd()]);
    }
    for (let i = 0; i < 5; i++) { const a = rnd() * TAU; g.tube([{ x: 0, y: -0.02, z: 0, r: 0.015 }, { x: Math.cos(a) * 0.3, y: 0.35 + rnd() * 0.2, z: Math.sin(a) * 0.3, r: 0.004 }], 3, [0.3, 0.2, 0.15], { k: [0.5, 0, 9] }); }
    if (berries) for (let i = 0; i < 34; i++) {
      const a = rnd() * TAU, el = 0.05 + rnd() * 1.1, r = 0.36 + rnd() * 0.06;
      const cr = 0.6 + rnd() * 0.25;
      b.blob(Math.cos(a) * Math.cos(el) * r, 0.2 + Math.sin(el) * r * 0.9, Math.sin(a) * Math.cos(el) * r, 0.024, 0.024, 0.024, [cr, 0.025, 0.03], 3);
    }
    return { leaves: g.geo(), berries: berries ? b.geo() : null };
  }
  function branchesGeo(rnd) {
    const g = new GB();
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI, L = 0.6 + rnd() * 0.7, r = 0.022 + rnd() * 0.025, cx = (rnd() - 0.5) * 0.3, cz = (rnd() - 0.5) * 0.3, y = 0.03 + i * 0.025;
      const dx = Math.cos(a) * L / 2, dz = Math.sin(a) * L / 2;
      g.tube([{ x: cx - dx, y, z: cz - dz, r }, { x: cx, y: y + 0.03, z: cz, r: r * 0.85 }, { x: cx + dx, y: y + 0.01, z: cz + dz, r: r * 0.5 }], 4, [0.75, 0.62, 0.5]);
      const t = 0.3 + rnd() * 0.4, fx = cx - dx + dx * 2 * t, fz = cz - dz + dz * 2 * t, a2 = a + (rnd() < 0.5 ? 0.6 : -0.6), l2 = 0.25 + rnd() * 0.2;
      g.tube([{ x: fx, y: y + 0.02, z: fz, r: r * 0.5 }, { x: fx + Math.cos(a2) * l2, y: y + 0.06, z: fz + Math.sin(a2) * l2, r: 0.004 }], 3, [0.7, 0.6, 0.5]);
    }
    return g.geo();
  }
  function herbGeo(kind, rnd) {
    const g = new GB();
    if (kind === 'yarrow') {
      for (let i = 0; i < 7; i++) {
        const a = rnd() * TAU, r = rnd() * 0.08, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.38 + rnd() * 0.2, tx = x + (rnd() - 0.5) * 0.08, tz = z + (rnd() - 0.5) * 0.08;
        g.tube([{ x, y: 0, z, r: 0.006 }, { x: tx, y: h, z: tz, r: 0.004 }], 3, [0.22, 0.28, 0.16]);
        g.blob(tx, h + 0.012, tz, 0.055, 0.02, 0.055, [0.86, 0.84, 0.74], 3);
      }
      for (let i = 0; i < 10; i++) { const a = rnd() * TAU; g.blade(0, 0, 0, Math.cos(a), Math.sin(a), 0.18 + rnd() * 0.1, 0.035, 0.7, [0.26, 0.32, 0.22]); }
    } else if (kind === 'wintergreen') {
      for (let i = 0; i < 9; i++) {
        const a = rnd() * TAU, r = 0.03 + rnd() * 0.1, x = Math.cos(a) * r, z = Math.sin(a) * r, y = 0.04 + rnd() * 0.08;
        const base = g.p.length / 3, la = a + (rnd() - 0.5), L = 0.09 + rnd() * 0.03, Wd = L * 0.6, col = [0.04, 0.12, 0.05];
        const c = g.v(x, y, z, 0, 1, 0, 0, 0, col);
        for (let k = 0; k <= 8; k++) { const t = k / 8 * TAU, lx = Math.cos(t) * L * 0.5 + L * 0.5, lz = Math.sin(t) * Wd * 0.5; g.v(x + Math.cos(la) * lx - Math.sin(la) * lz, y + lx * 0.15, z + Math.sin(la) * lx + Math.cos(la) * lz, 0, 1, 0, 0, 0, [0.05, 0.16, 0.06]); }
        for (let k = 0; k < 8; k++) g.t(c, base + 2 + k, base + 1 + k);
        g.tube([{ x, y: 0, z, r: 0.004 }, { x, y, z, r: 0.003 }], 3, [0.2, 0.1, 0.06]);
      }
      for (let i = 0; i < 6; i++) { const a = rnd() * TAU, r = rnd() * 0.06; g.blob(Math.cos(a) * r, 0.05 + rnd() * 0.03, Math.sin(a) * r, 0.02, 0.02, 0.02, [0.7, 0.03, 0.04], 3); }
    } else {
      for (let i = 0; i < 16; i++) { const a = rnd() * TAU, r = rnd() * 0.05; g.blade(Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(a), Math.sin(a), 0.35 + rnd() * 0.25, 0.03, 0.35 + rnd() * 0.3, [0.3, 0.26, 0.32]); }
      for (let i = 0; i < 6; i++) { const a = rnd() * TAU, r = 0.04 + rnd() * 0.06, h = 0.42 + rnd() * 0.18; g.tube([{ x: 0, y: 0, z: 0, r: 0.005 }, { x: Math.cos(a) * r, y: h, z: Math.sin(a) * r, r: 0.004 }], 3, [0.25, 0.22, 0.24]); g.blob(Math.cos(a) * r, h + 0.04, Math.sin(a) * r, 0.03, 0.07, 0.03, [0.52, 0.46, 0.56], 3); }
    }
    return g.geo();
  }
  function mushGeo(rnd) {
    const g = new GB();
    for (let i = 0; i < 6; i++) {
      const a = rnd() * TAU, r = rnd() * 0.1, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.05 + rnd() * 0.05, cr = 0.035 + rnd() * 0.025, col = [0.82, 0.5 + rnd() * 0.08, 0.08];
      g.tube([{ x, y: -0.01, z, r: 0.012 }, { x, y: h, z, r: 0.018 }], 5, [0.75, 0.48, 0.12]);
      const pts = [{ x, y: h - 0.005, z, r: 0.012 }, { x, y: h + 0.015, z, r: cr * 0.7 }, { x, y: h + 0.022, z, r: cr, jag: 0.25 }];
      g.tube(pts, 9, col, { cap: true, capY: -0.01, capCol: [col[0] * 0.9, col[1] * 0.9, col[2]] });
    }
    return g.geo();
  }
  function reedsGeo(rnd) {
    const g = new GB();
    for (let i = 0; i < 22; i++) { const a = rnd() * TAU, r = rnd() * 0.22, c = rnd() < 0.3 ? [0.28, 0.3, 0.2] : [0.5, 0.42, 0.25]; g.blade(Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(a), Math.sin(a), 0.7 + rnd() * 0.55, 0.03, 0.2 + rnd() * 0.4, c, 4); }
    for (let i = 0; i < 5; i++) { const a = rnd() * TAU, r = rnd() * 0.15, h = 0.9 + rnd() * 0.4, x = Math.cos(a) * r, z = Math.sin(a) * r; g.tube([{ x, y: 0, z, r: 0.006 }, { x: x * 1.2, y: h, z: z * 1.2, r: 0.005 }], 3, [0.4, 0.36, 0.22]); g.tube([{ x: x * 1.2, y: h - 0.06, z: z * 1.2, r: 0.022 }, { x: x * 1.22, y: h + 0.1, z: z * 1.22, r: 0.022 }], 5, [0.2, 0.11, 0.06], { cap: true, capY: 0.02 }); }
    return g.geo();
  }
  // winter grass: crossed cards of dry stalks from the flora atlas (cell 3), rooted at v = 0
  function grassGeo(rnd) {
    const g = new GB(), c0 = [0.5, 0];
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI + rnd() * 0.4, dx = Math.cos(a), dz = Math.sin(a), w = 0.55, h = 0.5;
      const base = g.p.length / 3;
      for (let j = 0; j <= 1; j++) for (let k = 0; k <= 1; k++) { const p = g.v(dx * (k - 0.5) * w, j * h, dz * (k - 0.5) * w, -dz * 0.3, 1, dx * 0.3, 0, 0, [1, 1, 1]); g.uv[p * 2] = c0[0] + k * 0.497; g.uv[p * 2 + 1] = c0[1] + j * 0.497; }
      g.q(base, base + 1, base + 3, base + 2);
    }
    return g.geo();
  }
  // bare winter shrub: crossed twig cards (flora atlas cell 2) fanning up from the root
  function shrubGeo(rnd) {
    const g = new GB(), c0 = [0, 0];
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU + rnd() * 0.5, lean = 0.35 + rnd() * 0.35, L = 0.75 + rnd() * 0.3, W2 = L * 0.8;
      const d = new THREE.Vector3(Math.cos(a) * lean, 1, Math.sin(a) * lean).normalize(), sd = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      const base = g.p.length / 3;
      for (let j = 0; j <= 1; j++) for (let k = -1; k <= 1; k += 2) {
        const x = d.x * L * j + sd.x * k * W2 / 2, y = d.y * L * j + 0.02, z = d.z * L * j + sd.z * k * W2 / 2;
        const p = g.v(x, y, z, Math.cos(a) * 0.6, 0.8, Math.sin(a) * 0.6, 0, 0, [1, 1, 1]);
        g.uv[p * 2] = c0[0] + j * 0.497; g.uv[p * 2 + 1] = c0[1] + (k * 0.5 + 0.5) * 0.497;
      }
      g.q(base, base + 2, base + 3, base + 1);
    }
    return g.geo();
  }
  function fernGeo(rnd) {
    const g = new GB();
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + rnd() * 0.4, d = new THREE.Vector3(Math.cos(a), 0.9, Math.sin(a)).normalize(), s = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      const L = 0.5 + rnd() * 0.25;
      g.card({ x: 0, y: 0.02, z: 0 }, d, s, L, 0.24, 4, L * 0.75, 3, [0.9, 0.9, 0.9], () => [0, 1, 0], [rnd(), rnd()]);
    }
    return g.geo();
  }
  function logGeo(L, r, rnd) {
    const g = new GB(), pts = [];
    for (let i = 0; i <= 4; i++) pts.push({ x: -L / 2 + L * i / 4, y: 0, z: (rnd() - 0.5) * 0.06, r: r * (1 - i * 0.05) });
    // tube along X: build points then rotate (tube handles arbitrary directions)
    g.tube(pts, 8, [0.85, 0.85, 0.85], { uR: r });
    const stubA = rnd() * TAU;
    g.tube([{ x: L * 0.1, y: 0, z: 0, r: r * 0.35 }, { x: L * 0.1 + 0.1, y: Math.cos(stubA) * 0.45, z: Math.sin(stubA) * 0.45, r: r * 0.12 }], 4, [0.8, 0.8, 0.8]);
    return g.geo();
  }

  let MODELS = null;
  function models() {
    if (MODELS) return MODELS;
    mats();
    const rnd = U.rng(424242);
    const M = {};
    M.p0t = pineTrunk(PINE_H, 8, 8, 7, rnd); M.p0c = pineCrown(PINE_H, 0, rnd);
    M.p1t = pineTrunk(PINE_H, 5, 3, 0, rnd); M.p1c = pineCrown(PINE_H, 1, rnd);
    M.p2c = (() => { const g = pineCrown(PINE_H, 2, rnd); return g; })();
    const bl0 = birchParts(11, true, 0, rnd), bb0 = birchParts(11, false, 0, rnd), bl1 = birchParts(11, true, 1, rnd), bb1 = birchParts(11, false, 1, rnd);
    M.bl0t = bl0.bark; M.bl0c = bl0.crown; M.bb0t = bb0.bark; M.bl1t = bl1.bark; M.bl1c = bl1.crown; M.bb1t = bb1.bark;
    M.d0 = deadTree(0, rnd); M.d1 = deadTree(1, rnd);
    M.stS = stumpSide(rnd); M.stT = stumpTop();
    const bu = bushGeo(true, rnd); M.bush = shrubGeo(rnd); M.berry = bu.berries;
    M.br = branchesGeo(rnd);
    M.hy = herbGeo('yarrow', rnd); M.hw = herbGeo('wintergreen', rnd); M.hs = herbGeo('smokeweed', rnd);
    M.mu = mushGeo(rnd); M.re = reedsGeo(rnd); M.gr = grassGeo(rnd); M.fe = fernGeo(rnd);
    M.rocks = [rockGeo(1.3, 2, 0.45, 0.32, 0.32), rockGeo(4.7, 2, 0.42, 0.36, 0.3), rockGeo(8.1, 2, 0.75, 0.5, 0.42)];
    M.pebble = [rockGeo(11, 1, 1, 0.6, 0.8), rockGeo(15, 1, 1, 0.5, 0.9)];
    M.stone = rockGeo(21, 2, 0.24, 0.16, 0.2, true);
    M.logs = [logGeo(3.2, 0.17, rnd), logGeo(4.4, 0.22, rnd)];
    Object.values(M).forEach((g) => { if (g && g.userData) g.userData.shared = true; if (Array.isArray(g)) g.forEach((x) => { x.userData.shared = true; }); });
    MODELS = M;
    return M;
  }
  // slot definitions: model key -> material, flags
  const SLOT_DEF = {
    p0t: ['barkPine', 1], p0c: ['needles', 0], p1t: ['barkPine', 1], p1c: ['needles', 0],
    bl0t: ['barkBirch', 1], bl0c: ['leaf', 0], bb0t: ['barkBirch', 1], bl1t: ['barkBirch', 1], bl1c: ['leaf', 0], bb1t: ['barkBirch', 1],
    d0: ['barkDead', 1], d1: ['barkDead', 1], stS: ['barkPine', 1], stT: ['woodEnd', 0],
    bush: ['flora', 0], berry: ['plainStiff', 0], br: ['barkDead', 0], hy: ['plain', 0], hw: ['plain', 0], hs: ['plain', 0], mu: ['plainStiff', 0],
    re: ['plain', 0], gr: ['flora', 0], fe: ['lowLeaf', 0],
  };

  // ===================================================================== instanced slots
  class Slot {
    constructor(group, key, max) {
      const M = models(), d = SLOT_DEF[key];
      this.mesh = new THREE.InstancedMesh(M[key], mats()[d[0]], Math.max(1, max));
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, max) * 3).fill(1), 3);
      this.mesh.count = 0; this.mesh.visible = false; this.mesh.castShadow = !!d[1]; this.mesh.receiveShadow = true;
      this.mesh.name = 'fo:' + key;
      group.add(this.mesh); this.max = max;
    }
    fill(list) {
      const m = this.mesh, a = m.instanceMatrix.array, c = m.instanceColor.array;
      let n = 0;
      for (let i = 0; i < list.length && n < this.max; i++) { const it = list[i]; a.set(it.m, n * 16); c[n * 3] = it.c[0]; c[n * 3 + 1] = it.c[1]; c[n * 3 + 2] = it.c[2]; n++; }
      m.count = n; m.visible = n > 0;
      m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
      if (n) m.computeBoundingSphere();
    }
  }
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), YAX = new THREE.Vector3(0, 1, 0);
  function mtx(x, y, z, ry, sx, sy, sz, tilt) {
    tmpQ.setFromAxisAngle(YAX, ry);
    if (tilt) { const q2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt[0], 0, tilt[1])); tmpQ.premultiply(q2); }
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy == null ? sx : sy, sz == null ? sx : sz));
    return Float32Array.from(tmpM.elements);
  }

  // ===================================================================== terrain geometry
  // Grid of (cx+1) x (cz+1) vertices from (x0, z0) with steps (dx, dz). opts: { trees: [[x,z]], lower, keep(cellX, cellZ) }
  function terrainGeo(x0, z0, cx, cz, dx, dz, opts) {
    ensureFields();
    const f = FLD, M = 4, gw = cx + 1 + M * 2, gh = cz + 1 + M * 2;
    const H = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) H[j * gw + i] = bed(x0 + (i - M) * dx, z0 + (j - M) * dz);
    const nv = (cx + 1) * (cz + 1);
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), w0 = new Float32Array(nv * 4), w1 = new Float32Array(nv * 4);
    // tree canopy lookup grid
    const trees = opts.trees || [], cell = 2.5, bucket = new Map();
    trees.forEach((t) => { const k = Math.floor(t[0] / cell) + ',' + Math.floor(t[1] / cell); let b = bucket.get(k); if (!b) bucket.set(k, b = []); b.push(t); });
    const acc = [0, 0, 0, 0, 0, 0];
    let v = 0;
    for (let j = 0; j <= cz; j++) for (let i = 0; i <= cx; i++, v++) {
      const gi = (j + M) * gw + (i + M), x = x0 + i * dx, z = z0 + j * dz;
      let y = H[gi];
      if (opts.lower && (!opts.lowerIn || (x > 0 && x < 120 && z > 0 && z < 68))) y -= opts.lower;
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      const hx = (H[gi + 1] - H[gi - 1]) / (2 * dx), hz = (H[gi + gw] - H[gi - gw]) / (2 * dz);
      const nl = Math.hypot(hx, 1, hz); nor[v * 3] = -hx / nl; nor[v * 3 + 1] = 1 / nl; nor[v * 3 + 2] = -hz / nl;
      // tile classes (jittered bilinear)
      const jx = (vnoise(x * 0.9, z * 0.9, NS + 7) - 0.5) * 0.6, jz = (vnoise(x * 0.9 + 31, z * 0.9, NS + 8) - 0.5) * 0.6;
      sPrep(x + jx, z + jz);
      acc.fill(0);
      acc[f.cls[si]] += sw00; acc[f.cls[si + 1]] += sw10; acc[f.cls[si + NX]] += sw01; acc[f.cls[si + NX + 1]] += sw11;
      sPrep(x, z);
      const dp = sGet(f.dip);
      const wet = Math.max(acc[C_WET], smooth(-0.06, -0.3, dp));
      // canopy
      let can = 0;
      const bx = Math.floor(x / cell), bz = Math.floor(z / cell);
      for (let q = -1; q <= 1; q++) for (let p = -1; p <= 1; p++) { const b = bucket.get((bx + p) + ',' + (bz + q)); if (b) for (const t of b) { const d = Math.hypot(t[0] - x, t[1] - z); if (d < 2.6) can += (1 - d / 2.6) * (1 - d / 2.6) * (t[2] || 1); } }
      // low spots (puddles)
      const r = 3;
      const avg = (H[gi - r] + H[gi + r] + H[gi - r * gw] + H[gi + r * gw]) * 0.25;
      const low = Math.max(0, Math.min(1, (avg - H[gi]) * 9 + (acc[C_DIRT] * 0.25)));
      w0[v * 4] = acc[C_DIRT]; w0[v * 4 + 1] = acc[C_MUD]; w0[v * 4 + 2] = acc[C_ASH]; w0[v * 4 + 3] = acc[C_ROCK];
      w1[v * 4] = wet; w1[v * 4 + 1] = Math.min(1, can * (opts.canK || 1)); w1[v * 4 + 2] = low; w1[v * 4 + 3] = 0;
    }
    const idx = [];
    for (let j = 0; j < cz; j++) for (let i = 0; i < cx; i++) {
      if (opts.keep && !opts.keep(x0 + (i + 0.5) * dx, z0 + (j + 0.5) * dz)) continue;
      const a = j * (cx + 1) + i, b = a + 1, c = a + cx + 1, d = c + 1;
      if ((i + j) & 1) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aW0', new THREE.BufferAttribute(w0, 4)); g.setAttribute('aW1', new THREE.BufferAttribute(w1, 4));
    g.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }

  // ===================================================================== water geometry (tiles of one area or strips)
  function waterGeo(a) {
    ensureFields();
    const f = FLD, inf = f.info[a.id], ox = a.ax * AW, oz = a.ay * AH;
    const want = new Uint8Array(30 * 17);
    const isW = (t) => t === T.WATER || t === T.FORD || t === T.STONES || t === T.ICE || t === T.DOCK;
    for (let y = 0; y < 17; y++) for (let x = 0; x < 30; x++) {
      const t = a.tiles[y * 30 + x];
      let w = isW(t);
      if (t === T.BRIDGE) { const gi = (a.ay * 17 + y - GY0) * NX + (a.ax * 30 + x - GX0); w = f.cls[gi] === C_WET; }
      if (w) for (let q = -1; q <= 1; q++) for (let p = -1; p <= 1; p++) { const xx = x + p, yy = y + q; if (xx >= 0 && yy >= 0 && xx < 30 && yy < 17) want[yy * 30 + xx] = 1; }
    }
    const pos = [], aw = [], idx = [];
    const S = 3, step = TM / S;
    const lake = inf.lm === 'lake';
    for (let y = 0; y < 17; y++) for (let x = 0; x < 30; x++) {
      if (!want[y * 30 + x]) continue;
      const b0 = pos.length / 3;
      for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) {
        const wx = ox + x * TM + i * step, wz = oz + y * TM + j * step;
        const bd = bed(wx, wz);
        const ice = lake ? Math.min(1, sGet(f.ice) * 1.6) : 0, ford = sGet(f.ford);
        const lv = lake ? inf.lakeL - 0.2 + ice * 0.03 : base(wx, wz) - 0.2;
        pos.push(wx, lv, wz);
        aw.push(ice, Math.max(0, lv - bd), lake ? 0 : 0.35, ford);
      }
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const a0 = b0 + j * (S + 1) + i; idx.push(a0, a0 + S + 1, a0 + S + 2, a0, a0 + S + 2, a0 + 1); }
    }
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const nn = new Float32Array(pos.length); for (let i = 1; i < nn.length; i += 3) nn[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
    g.setAttribute('aW0', new THREE.Float32BufferAttribute(aw, 4));
    g.setIndex(idx); g.computeBoundingSphere();
    return g;
  }

  // ===================================================================== static merges
  class Merge {
    constructor() { this.parts = []; }
    add(geo, m) { this.parts.push({ geo, matrix: m }); }
    mesh(mat, opts) {
      if (!this.parts.length) return null;
      const hasCol = this.parts.every((p) => p.geo.attributes.color);
      const g = R3.merge(this.parts);
      if (mat.vertexColors && !hasCol) { const c = new Float32Array(g.attributes.position.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
      const m = new THREE.Mesh(g, mat); m.castShadow = !!(opts && opts.cast); m.receiveShadow = true; m.matrixAutoUpdate = false;
      return m;
    }
  }
  const box = (w, h, d) => R3.Tex.metreUV(new THREE.BoxGeometry(w, h, d));
  const m4 = (x, y, z, rx, ry, rz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0, 'YXZ')), new THREE.Vector3(1, 1, 1));

  function buildBridge(a, rnd) {
    const inf = FLD.info[a.id], ox = a.ax * AW, oz = a.ay * AH, L = inf.bridgeL;
    const out = { intact: new THREE.Group(), broken: new THREE.Group() };
    const X0 = ox + 16 * TM - 0.3, X1 = ox + 22 * TM + 0.3, Z0 = oz + 7 * TM + 0.1, Z1 = oz + 10 * TM - 0.1;
    const gapA = ox + 17 * TM, gapB = ox + 21 * TM;
    [['intact', false], ['broken', true]].forEach(([k, broken]) => {
      const planks = new Merge(), logs = new Merge();
      const zs = [Z0 + 0.15, Z1 - 0.15];
      // stringers
      zs.forEach((z) => {
        const lg = R3.Tex.metreUV(new THREE.CylinderGeometry(0.13, 0.13, 1, 8).rotateZ(Math.PI / 2));
        if (!broken) { const len = X1 - X0; const g = lg.clone().scale(len, 1, 1); logs.add(g, m4((X0 + X1) / 2, L - 0.16, z)); }
        else {
          const l1 = gapA + 0.7 - X0, l2 = X1 - (gapB - 0.6);
          logs.add(lg.clone().scale(l1, 1, 1), m4(X0 + l1 / 2, L - 0.16 - 0.05, z, 0, 0, -0.12));
          logs.add(lg.clone().scale(l2, 1, 1), m4(X1 - l2 / 2, L - 0.16 - 0.08, z, 0, 0, 0.16));
        }
        lg.dispose();
      });
      // planks across
      for (let x = X0 + 0.12; x < X1 - 0.1; x += 0.24) {
        if (broken && x > gapA && x < gapB) continue;
        const pl = box(0.22, 0.05, Z1 - Z0 + (rnd() - 0.5) * 0.1);
        const tilt = broken && (Math.abs(x - gapA) < 0.5 || Math.abs(x - gapB) < 0.5) ? (rnd() - 0.5) * 0.25 : (rnd() - 0.5) * 0.02;
        planks.add(pl, m4(x, L - 0.01 + (rnd() - 0.5) * 0.015 - (broken && Math.abs(x - gapA) < 0.5 ? 0.06 : 0), (Z0 + Z1) / 2 + (rnd() - 0.5) * 0.05, tilt, (rnd() - 0.5) * 0.03, 0));
      }
      if (broken) {
        // dangling planks and debris in the creek
        planks.add(box(0.22, 0.05, 1.4), m4(gapA + 0.35, L - 0.55, Z0 + 0.6, 1.2, 0.1, 0.3));
        planks.add(box(0.22, 0.05, 1.2), m4(gapB - 0.3, L - 0.6, Z1 - 0.7, -1.1, -0.2, -0.2));
        planks.add(box(0.22, 0.05, 2.0), m4((gapA + gapB) / 2, TR.base(ox + 18.5 * TM, oz + 9.2 * TM) - 0.25, oz + 9.4 * TM, 0.05, 0.7, 0.08));
      }
      // posts and rails
      [Z0 + 0.02, Z1 - 0.02].forEach((z) => {
        const posts = [];
        for (let x = X0 + 0.15; x <= X1 - 0.1; x += 1.2) { if (broken && x > gapA - 0.1 && x < gapB + 0.1) continue; posts.push(x); }
        posts.forEach((x) => planks.add(box(0.1, 1.25, 0.1), m4(x, L + 0.4, z, 0, 0, (rnd() - 0.5) * 0.04)));
        const seg = (xa, xb, tilt) => { const len = xb - xa; planks.add(box(len, 0.08, 0.07), m4((xa + xb) / 2, L + 0.95, z, 0, 0, tilt || 0)); planks.add(box(len, 0.06, 0.05), m4((xa + xb) / 2, L + 0.5, z, 0, 0, tilt || 0)); };
        if (!broken) seg(X0 + 0.1, X1 - 0.05);
        else { seg(X0 + 0.1, gapA + 0.4, -0.08); seg(gapB - 0.4, X1 - 0.05, 0.1); }
      });
      // abutment stones
      const M = models();
      [X0 + 0.1, X1 - 0.1].forEach((x, i) => { for (let s = 0; s < 3; s++) { const z = Z0 + 0.2 + s * 0.9; logs.add(M.pebble[s % 2], m4(x + (i ? 0.1 : -0.1), TR.bed(x, z) - 0.05, z, 0, rnd() * 3, 0).scale(new THREE.Vector3(0.35, 0.3, 0.35))); } });
      const pm = planks.mesh(mats().boards, { cast: true }); if (pm) out[k].add(pm);
      const lm = logs.mesh(mats().boardLog, { cast: true }); if (lm) out[k].add(lm);
    });
    return out;
  }
  function buildDock(a, rnd) {
    const inf = FLD.info[a.id], ox = a.ax * AW, oz = a.ay * AH, L = inf.lakeL + 0.12;
    const planks = new Merge(), posts = new Merge();
    const X0 = ox + 11.2, X1 = ox + 12.8, Z0 = oz + 3.2, Z1 = oz + 7.2;
    for (let z = Z0 + 0.1; z < Z1; z += 0.21) planks.add(box(X1 - X0 + (rnd() - 0.5) * 0.08, 0.05, 0.19), m4((X0 + X1) / 2 + (rnd() - 0.5) * 0.04, L + (rnd() - 0.5) * 0.012, z, 0, (rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.02));
    [X0 + 0.12, X1 - 0.12].forEach((x) => planks.add(box(0.12, 0.16, Z1 - Z0), m4(x, L - 0.11, (Z0 + Z1) / 2)));
    [0, 1.3, 2.6].forEach((dz) => [X0 + 0.04, X1 - 0.04].forEach((x) => {
      const z = Z0 + 0.1 + dz, bt = TR.bed(x, z) - 0.2, top = L + 0.28, h = top - bt;
      const g = R3.Tex.metreUV(new THREE.CylinderGeometry(0.09, 0.1, h, 7)); posts.add(g, m4(x, bt + h / 2, z, (rnd() - 0.5) * 0.04, 0, (rnd() - 0.5) * 0.04));
    }));
    const grp = new THREE.Group();
    const pm = planks.mesh(mats().boards, { cast: true }); if (pm) grp.add(pm);
    const lm = posts.mesh(mats().boardLog, { cast: true }); if (lm) grp.add(lm);
    return grp;
  }

  // ===================================================================== areas
  F.owns = (o) => !!o && (['tree', 'deadtree', 'rock', 'stump', 'bush', 'branches', 'herb', 'mushrooms', 'reeds'].includes(o.type) || (o.type === 'struct' && o.sprite === 'dock'));
  const lodDist = () => ({ low: 20, medium: 28, high: 36 })[(NW.settings && NW.settings.quality) || 'medium'] || 28;
  const grassN = () => ({ low: 45, medium: 100, high: 170 })[(NW.settings && NW.settings.quality) || 'medium'] || 100;

  function treeListAround(ax, ay) {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = ax + dx, y = ay + dy; if (x < 0 || y < 0 || x > 4 || y > 4) continue;
      const a = W.get(D.areaId(x, y)), ox = x * AW, oz = y * AH;
      a.objs.forEach((o) => { if (o.type === 'tree') out.push([ox + o.x * K, oz + (o.y - 3) * K, o.kind === 'birch' ? 0.5 : o.size === 2 ? 1.3 : 1]); });
    }
    return out;
  }

  F.buildArea = function (a) {
    const t0 = performance.now();
    ensureFields(); models(); mats();
    const group = new THREE.Group(); group.name = 'forest:' + a.id;
    const seed = seedOf(), rnd = U.rng(U.hash(seed, a.ax, a.ay, 991));
    const ox = a.ax * AW, oz = a.ay * AH, inf = FLD.info[a.id];
    // ---- terrain
    const tg = terrainGeo(ox, oz, 90, 51, AW / 90, AH / 51, { trees: treeListAround(a.ax, a.ay) });
    const terr = new THREE.Mesh(tg, terrainMat()); terr.receiveShadow = true; terr.matrixAutoUpdate = false; terr.name = 'fo:terrain';
    group.add(terr);
    // ---- water / ice
    const wg = waterGeo(a);
    if (wg) { const wm = new THREE.Mesh(wg, waterMat()); wm.receiveShadow = true; wm.renderOrder = 1; wm.matrixAutoUpdate = false; wm.name = 'fo:water'; group.add(wm); }
    // ---- bridge / dock
    let bridge = null;
    if (a.bridge) { bridge = buildBridge(a, rnd); group.add(bridge.intact); group.add(bridge.broken); }
    if (a.objs.some((o) => o.type === 'struct' && o.sprite === 'dock')) group.add(buildDock(a, rnd));

    // ---- object items
    const items = [];   // { x, z, parts: { code: [[slot, m, c]] }, code(near) }
    const rocks = new Merge();
    const W2 = (px, py) => [ox + px * K, oz + py * K];
    const M = models();
    const solids = [];
    a.objs.forEach((o) => { const c = W.collider(o); if (c) solids.push(c); });
    a.objs.forEach((o, oi) => {
      const r2 = U.rng(U.hash(seed, a.ax * 31 + a.ay, oi, 17));
      const rot = r2() * TAU;
      const tint = (k) => [1 - k + r2() * k * 2, 1 - k + r2() * k * 2, 1 - k + r2() * k * 2];
      switch (o.type) {
        case 'tree': break;   // drawn world-wide by R3.Flora
        case 'deadtree': {
          const [x, z] = W2(o.x, o.y - 3), y = TR.bed(x, z) - 0.05;
          const m = mtx(x, y, z, rot, 1, 1, 1), ms = mtx(x, y - 0.05, z, rot, 0.78, 0.8, 0.78);
          const c = tint(0.06);
          items.push({ x, z, o, parts: { a: [[o.variant ? 'd1' : 'd0', m, c]], u: [['stS', ms, [0.9, 0.9, 0.9]], ['stT', ms, [1.25, 1.15, 1.05]]] }, avail: true });
          break;
        }
        case 'stump': {
          const [x, z] = W2(o.x, o.y - 3), y = TR.bed(x, z) - 0.04;
          const m = mtx(x, y, z, rot, 1, 0.9 + r2() * 0.2, 1);
          items.push({ x, z, parts: { a: [['stS', m, [1, 1, 1]], ['stT', m, [0.62, 0.6, 0.58]]] } });
          break;
        }
        case 'bush': {
          const [x, z] = W2(o.x, o.y - 3), y = TR.bed(x, z) - 0.03;
          const m = mtx(x, y, z, rot, 1.15, 1.1, 1.15);
          items.push({ x, z, o, avail: true, parts: { a: [['bush', m, [0.9 + r2() * 0.2, 1, 0.5]], ['berry', m, [1, 1, 1]]], u: [['bush', m, [0.8, 1, 0.5]]] } });
          break;
        }
        case 'branches': {
          const [x, z] = W2(o.x, o.y - 3), y = TR.bed(x, z);
          items.push({ x, z, o, avail: true, parts: { a: [['br', mtx(x, y, z, rot + (o.variant || 0), 1.1), tint(0.08)]], u: [] } });
          break;
        }
        case 'herb': {
          const [x, z] = W2(o.x, o.y - 3), y = TR.bed(x, z) - 0.01;
          const k = o.herb === 'yarrow' ? 'hy' : o.herb === 'wintergreen' ? 'hw' : 'hs';
          items.push({ x, z, o, avail: true, parts: { a: [[k, mtx(x, y, z, rot, 1.35), tint(0.06)]], u: [] } });
          break;
        }
        case 'mushrooms': {
          const [x, z] = W2(o.x, o.y - 3), y = TR.bed(x, z) - 0.005;
          items.push({ x, z, o, avail: true, parts: { a: [['mu', mtx(x, y, z, rot, 1.5), tint(0.05)]], u: [] } });
          break;
        }
        case 'reeds': {
          const [x, z] = W2(o.x, o.y - 3), y = TR.bed(x, z);
          items.push({ x, z, parts: { a: [['re', mtx(x, y, z, rot, 1), tint(0.1)]] } });
          break;
        }
        case 'rock': {
          const v = o.variant || 0, [x, z] = W2(o.x, o.y - (v === 2 ? 4.5 : 3.5)), y = TR.bed(x, z) - 0.06;
          const s = v === 2 ? 1 : 1.0 + r2() * 0.15;
          rocks.add(M.rocks[v], new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(YAX, (r2() - 0.5) * 0.6), new THREE.Vector3(s, s * (0.85 + r2() * 0.3), s)));
          break;
        }
      }
    });
    // stepping stones & ford pebbles
    for (let ty = 0; ty < 17; ty++) for (let tx = 0; tx < 30; tx++) {
      const t = a.tiles[ty * 30 + tx];
      if (t === T.STONES) [[6, 6], [12, 12]].forEach(([dx, dy]) => { const x = ox + (tx * 16 + dx) * K, z = oz + (ty * 16 + dy) * K, y = TR.base(x, z) - 0.32; rocks.add(M.stone, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(YAX, rnd() * TAU), new THREE.Vector3(1.4, 1.6, 1.4))); });
      if (t === T.FORD) for (let k = 0; k < 4; k++) { const x = ox + (tx + rnd()) * TM, z = oz + (ty + rnd()) * TM, y = TR.bed(x, z), s = 0.12 + rnd() * 0.16; rocks.add(M.pebble[k % 2], new THREE.Matrix4().compose(new THREE.Vector3(x, y - s * 0.2, z), new THREE.Quaternion().setFromAxisAngle(YAX, rnd() * TAU), new THREE.Vector3(s, s, s))); }
    }

    // ---- decoration scatter (off trails, off blocking tiles and colliders)
    const nearSolid = (px, py, m) => solids.some((c) => px > c.x - m && px < c.x + c.w + m && py > c.y - m && py < c.y + c.h + m);
    const nearObj = (px, py, m) => a.objs.some((o) => (o.res || o.type === 'reeds' || o.type === 'herb') && Math.abs(o.x - px) < m && Math.abs(o.y - py) < m);
    const tileAt = (px, py) => W.tile(a, Math.floor(px / 16), Math.floor(py / 16));
    const trailNear = (px, py, r) => { for (let q = -r; q <= r; q++) for (let p = -r; p <= r; p++) { const t = tileAt(px + p * 16, py + q * 16); if (t === T.DIRT || t === T.BRIDGE || t === T.BUILDING || t === T.DOCK) return true; } return false; };
    const inCabin = (px, py) => a.lm === 'cabin' && px > 6 * 16 && px < 26 * 16 && py > 0 && py < 12 * 16;
    const freeSpot = (px, py, m, trailR) => { const t = tileAt(px, py); return (t === T.GRASS || t === T.ASH || t === T.MUD || t === T.ROCKG) && !trailNear(px, py, trailR) && !nearSolid(px, py, m) && !nearObj(px, py, m * 0.8) && !inCabin(px, py); };
    const border = (px, py) => px < 32 || px > 28 * 16 || py < 32 || py > 15 * 16;
    // grass tufts
    const ng = Math.round(grassN() * (a.lm === 'burned' ? 0.35 : a.lm === 'bog' ? 1.3 : 1));
    for (let i = 0, tries = 0; i < ng && tries < ng * 4; tries++) {
      const px = rnd() * 480, py = rnd() * 272;
      const t = tileAt(px, py);
      if (t !== T.GRASS && t !== T.MUD && !(t === T.ASH && rnd() < 0.3)) continue;
      if (nearSolid(px, py, 3) || inCabin(px, py) || trailNear(px, py, 0)) continue;
      // clumps
      const n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n && i < ng; k++, i++) {
        const qx = px + (rnd() - 0.5) * 14, qy = py + (rnd() - 0.5) * 10, x = ox + qx * K, z = oz + qy * K, s = 0.7 + rnd() * 0.7;
        const dry = rnd(), c = t === T.ASH ? [0.4, 0.5, 0.5] : [0.7 + dry * 0.5, 0.6, 0.3 + dry * 0.4];
        items.push({ x, z, parts: { a: [['gr', mtx(x, TR.bed(x, z) - 0.02, z, rnd() * TAU, s, s * (0.8 + rnd() * 0.5), s), c]] } });
      }
    }
    // ferns (Fern Gully is full of them), saplings, extra reeds by the water, fallen logs, pebbles
    const nf = a.id === 'f_1_3' ? 26 : a.lm === 'burned' ? 0 : 6;
    for (let i = 0, tries = 0; i < nf && tries < 200; tries++) {
      const px = 16 + rnd() * 448, py = 16 + rnd() * 240; if (!freeSpot(px, py, 6, 1) || tileAt(px, py) !== T.GRASS) continue;
      const x = ox + px * K, z = oz + py * K, s = 0.8 + rnd() * 0.6, br = rnd();
      items.push({ x, z, parts: { a: [['fe', mtx(x, TR.bed(x, z) - 0.02, z, rnd() * TAU, s), [0.6 + br * 0.3, 0.42 + br * 0.15, 0.25]]] } }); i++;
    }
    if (inf.creek || a.lm === 'lake' || a.lm === 'bog') {
      for (let i = 0, tries = 0; i < 8 && tries < 300; tries++) {
        const tx = Math.floor(rnd() * 30), ty = Math.floor(rnd() * 17);
        if (a.tiles[ty * 30 + tx] !== T.GRASS && a.tiles[ty * 30 + tx] !== T.MUD) continue;
        let nearW = false; for (let q = -1; q <= 1; q++) for (let p = -1; p <= 1; p++) { const t = W.tile(a, tx + p, ty + q); if (t === T.WATER || t === T.ICE || t === T.MUD && a.lm === 'bog') nearW = true; }
        const px = tx * 16 + 4 + rnd() * 8, py = ty * 16 + 4 + rnd() * 8;
        if (!nearW || nearSolid(px, py, 4) || trailNear(px, py, 0)) continue;
        const x = ox + px * K, z = oz + py * K;
        items.push({ x, z, parts: { a: [['re', mtx(x, TR.bed(x, z), z, rnd() * TAU, 0.8 + rnd() * 0.4), [0.9 + rnd() * 0.2, 0.9, 0.85]]] } }); i++;
      }
    }
    const logsM = new Merge();
    const nlog = a.lm === 'cabin' ? 0 : 1 + Math.floor(rnd() * 2);
    for (let i = 0, tries = 0; i < nlog && tries < 120; tries++) {
      const px = 8 + rnd() * 464, py = 8 + rnd() * 256;
      if (!border(px, py) || !freeSpot(px, py, 8, 2)) continue;
      const ang = rnd() * Math.PI, L = rnd() < 0.5 ? 3.2 : 4.4, hx = Math.cos(ang) * L / 2 / K, hy = Math.sin(ang) * L / 2 / K;
      if (!freeSpot(px + hx, py + hy, 6, 1) || !freeSpot(px - hx, py - hy, 6, 1)) continue;
      const x = ox + px * K, z = oz + py * K, y1 = TR.bed(x - Math.cos(ang) * L / 2, z - Math.sin(ang) * L / 2), y2 = TR.bed(x + Math.cos(ang) * L / 2, z + Math.sin(ang) * L / 2);
      const pitch = Math.atan2(y2 - y1, L);
      logsM.add(M.logs[L > 4 ? 1 : 0], new THREE.Matrix4().compose(new THREE.Vector3(x, (y1 + y2) / 2 + (L > 4 ? 0.16 : 0.12), z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -ang, pitch, 'YXZ')), new THREE.Vector3(1, 1, 1)));
      i++;
    }
    const np = 14 + Math.floor(rnd() * 10) + (a.lm === 'mine' ? 30 : 0);
    for (let i = 0, tries = 0; i < np && tries < 300; tries++) {
      const px = rnd() * 480, py = rnd() * 272, t = tileAt(px, py);
      if (t === T.WATER || t === T.ICE || t === T.BUILDING || t === T.BRIDGE || t === T.DOCK || nearSolid(px, py, 2) || inCabin(px, py)) continue;
      const x = ox + px * K, z = oz + py * K, s = (t === T.ROCKG ? 0.12 + rnd() * 0.22 : 0.06 + rnd() * 0.14);
      rocks.add(M.pebble[i % 2], new THREE.Matrix4().compose(new THREE.Vector3(x, TR.bed(x, z) - s * 0.25, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.4, rnd() * TAU, 0)), new THREE.Vector3(s, s * (0.7 + rnd() * 0.5), s)));
      i++;
    }
    // soft snow mounds: drifts over buried stumps, brush and stones
    const mounds = new Merge();
    const nmd = a.lm === 'cabin' ? 3 : 5 + Math.floor(rnd() * 7);
    for (let i = 0, tries = 0; i < nmd && tries < 200; tries++) {
      const px = 16 + rnd() * 448, py = 16 + rnd() * 240;
      if (!freeSpot(px, py, 8, 1) || tileAt(px, py) !== T.GRASS) continue;
      const x = ox + px * K, z = oz + py * K, sx = 0.5 + rnd() * 0.7, sy = 0.18 + rnd() * 0.22;
      mounds.add(M.pebble[i % 2], new THREE.Matrix4().compose(new THREE.Vector3(x, TR.bed(x, z) - sy * 0.45, z), new THREE.Quaternion().setFromAxisAngle(YAX, rnd() * TAU), new THREE.Vector3(sx, sy / 0.6, sx * (0.7 + rnd() * 0.5))));
      i++;
    }
    const mdm = mounds.mesh(R3.mat('fo.mound', () => R3.Tex.mat('snow', { roughness: 0.8 }))); if (mdm) { mdm.name = 'fo:mounds'; group.add(mdm); }
    const rm = rocks.mesh(mats().rock, { cast: true }); if (rm) { rm.name = 'fo:rocks'; group.add(rm); }
    const lgm = logsM.mesh(mats().log, { cast: true }); if (lgm) { lgm.name = 'fo:logs'; group.add(lgm); }

    // ---- slots
    const counts = {};
    items.forEach((it) => { const seen = new Set(); Object.values(it.parts).forEach((list) => list.forEach((p) => seen.add(p[0]))); seen.forEach((k) => { counts[k] = (counts[k] || 0) + 1; }); });
    const slots = {};
    Object.keys(counts).forEach((k) => { slots[k] = new Slot(group, k, counts[k]); });
    const LODD = lodDist();
    function codeOf(it, cx, cz) {
      if (it.lod) return Math.hypot(it.x - cx, it.z - cz) < LODD ? 'n' : 'f';
      if (it.avail) return NW.Objects.available(it.o) ? 'a' : 'u';
      return 'a';
    }
    let lodT = 1e9, firstFill = true;
    const lists = {};
    function partition(cx, cz) {
      const dirty = new Set();
      items.forEach((it) => {
        const c = codeOf(it, cx, cz);
        if (c !== it.code) { if (it.code) (it.parts[it.code] || []).forEach((p) => dirty.add(p[0])); (it.parts[c] || []).forEach((p) => dirty.add(p[0])); it.code = c; }
      });
      if (firstFill) { Object.keys(slots).forEach((k) => dirty.add(k)); firstFill = false; }
      if (!dirty.size) return;
      dirty.forEach((k) => { lists[k] = []; });
      items.forEach((it) => (it.parts[it.code] || []).forEach((p) => { if (lists[p[0]] && dirty.has(p[0])) lists[p[0]].push({ m: p[1], c: p[2] }); }));
      dirty.forEach((k) => slots[k] && slots[k].fill(lists[k]));
    }
    partition(ox + AW / 2, oz + AH / 2);

    // ---- footprints
    const fp = footprintMesh(); group.add(fp.mesh);

    const buildMs = performance.now() - t0;
    F.stats[a.id] = { ms: Math.round(buildMs * 10) / 10, items: items.length };
    return {
      group, buildMs,
      update(dt, ctx) {
        lodT += dt;
        if (lodT > 0.25) { lodT = 0; const p = (ctx && ctx.cam ? ctx.cam.position : R3.camera.position); partition(p.x, p.z); }
        if (bridge) { const out = !!(st().world && st().world.bridgeOut); bridge.intact.visible = !out; bridge.broken.visible = out; }
        fp.update(a.id, ox, oz);
      },
    };
  };

  // ===================================================================== footprints
  function footprintMat() {
    return R3.mat('fo.prints', () => R3.std({ color: 0x4e5c70, roughness: 0.95, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }, { patchKey: '|foPrint', patch(sh) {
      foU(sh);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aLife; varying float vLife; varying vec2 vFp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLife = aLife; vFp = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLife; varying vec2 vFp;')
        .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 q = vFp - 0.5;
        float sole = 1.0 - smoothstep(0.85, 1.0, length(vec2(q.x / 0.36, (q.y - 0.1) / 0.4)));
        float heel = 1.0 - smoothstep(0.8, 1.0, length(vec2(q.x / 0.3, (q.y + 0.3) / 0.17)));
        float sh = max(sole, heel);
        float rim = smoothstep(0.55, 0.9, sh) * (1.0 - smoothstep(0.9, 1.0, sh));
        diffuseColor.rgb *= 0.8 + 0.4 * step(0.5, fract((vFp.y) * 14.0));
        diffuseColor.a = sh * clamp(vLife, 0.0, 1.0) * 0.6 * smoothstep(0.25, 0.5, foSnow);`);
    } }));
  }
  function footprintMesh() {
    const g = R3.geo('fo.printGeo', () => { const gg = new THREE.PlaneGeometry(0.13, 0.3); gg.rotateX(-Math.PI / 2); gg.userData.shared = true; return gg; });
    const geo = new THREE.InstancedBufferGeometry(); geo.index = g.index; Object.keys(g.attributes).forEach((k) => geo.setAttribute(k, g.attributes[k]));
    const MAX = 300, life = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    geo.setAttribute('aLife', life);
    const mesh = new THREE.InstancedMesh(geo, footprintMat(), MAX);
    mesh.count = 0; mesh.visible = false; mesh.renderOrder = 2; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.name = 'fo:prints';
    let lastSig = '';
    return {
      mesh,
      update(areaId, ox, oz) {
        const pr = NW.Render && NW.Render.prints;
        if (!pr || !pr.length) { mesh.visible = false; return; }
        let n = 0, prev = null, sig = 0;
        for (let i = 0; i < pr.length && n < MAX; i++) {
          const p = pr[i]; if (p.area !== areaId) continue;
          const x = ox + p.x * K, z = oz + p.y * K;
          let ang = prev ? Math.atan2(x - prev[0], z - prev[1]) : 0;
          if (prev && Math.hypot(x - prev[0], z - prev[1]) > 1.5) ang = prev[2];
          mesh.instanceMatrix.array.set(mtx(x, TR.bed(x, z) + 0.012, z, ang, 1, 1, 1), n * 16);
          life.array[n] = p.life; sig += p.x * 3 + p.y + p.life;
          prev = [x, z, ang]; n++;
        }
        mesh.count = n; mesh.visible = n > 0;
        if (n) { const s = n + ':' + sig.toFixed(2); if (s !== lastSig) { lastSig = s; mesh.instanceMatrix.needsUpdate = true; life.needsUpdate = true; } }
      },
    };
  }

  // ===================================================================== outer belt + distant world
  F.buildOuter = function () {
    const t0 = performance.now();
    ensureFields(); models(); mats();
    const group = new THREE.Group(); group.name = 'forest:outer';
    const creekX = []; // creek centre lines at the north / south world edges
    [0, 84].forEach((gy) => { let s = 0, n = 0; for (let gx = 90; gx < 120; gx++) if (tileG(gx, gy) === T.WATER) { s += gx; n++; } creekX.push(n ? (s / n + 0.5) * TM : 87.6); });
    // every tree (play areas, belt, understory) is drawn by R3.Flora's world-wide instanced meshes
    let flora = null;
    if (R3.Flora) { try { R3.Flora.creekX = creekX; flora = R3.Flora.build(); group.add(flora.group); R3.Flora.active = flora; } catch (e) { console.error('[r3 flora]', e); } }
    const tl = flora ? flora.list.filter((t) => t.belt && t.r > 3).map((t) => [t.x, t.z, 1]) : [];
    const outerTerr = terrainGeo(-40, -40, 100, 74, 2, 2, { trees: tl, canK: 0.6, lower: 0.07, lowerIn: true, keep: (x, z) => !(x > 1.5 && x < 118.5 && z > 1.5 && z < 66.5) });
    const ot = new THREE.Mesh(outerTerr, terrainMat()); ot.receiveShadow = true; ot.matrixAutoUpdate = false; ot.name = 'fo:outerTerrain'; group.add(ot);
    // creek running on beyond the world edges
    const wpos = [], waw = [], widx = [];
    [[creekX[0], -40, 0.4], [creekX[1], 67.6, 108]].forEach(([cx, z0, z1]) => {
      const n = Math.ceil((z1 - z0) / 0.8);
      for (let j = 0; j <= n; j++) for (let i = 0; i <= 4; i++) {
        const z = z0 + (z1 - z0) * j / n, x = cx - 1.8 + i * 0.9, b = TR.base(x, z), lv = b - 0.2;
        wpos.push(x, lv, z); waw.push(0, Math.max(0, lv - TR.bed(x, z)), 0.35, 0);
      }
      const b0 = wpos.length / 3 - (n + 1) * 5;
      for (let j = 0; j < n; j++) for (let i = 0; i < 4; i++) { const a0 = b0 + j * 5 + i; widx.push(a0, a0 + 5, a0 + 6, a0, a0 + 6, a0 + 1); }
    });
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
    const wn = new Float32Array(wpos.length); for (let i = 1; i < wn.length; i += 3) wn[i] = 1; wg.setAttribute('normal', new THREE.BufferAttribute(wn, 3));
    wg.setAttribute('aW0', new THREE.Float32BufferAttribute(waw, 4)); wg.setIndex(widx); wg.computeBoundingSphere();
    const wm = new THREE.Mesh(wg, waterMat()); wm.renderOrder = 1; wm.name = 'fo:outerCreek'; group.add(wm);

    // ---- distant world: coarse terrain + simple trees for areas that are not built/visible
    const far = { chunks: {}, idxAll: [], trees: {} };
    const pos = [], nor = [], w0 = [], w1 = [];
    let vbase = 0;
    for (let ay = 0; ay < 5; ay++) for (let ax = 0; ax < 5; ax++) {
      const id = D.areaId(ax, ay), x0 = ax * AW - 0.8, z0 = ay * AH - 0.8;
      const g = terrainGeo(x0, z0, 16, 10, (AW + 1.6) / 16, (AH + 1.6) / 10, { trees: treeListAround(ax, ay), lower: 0.12 });
      const pa = g.attributes;
      pos.push(...pa.position.array); nor.push(...pa.normal.array); w0.push(...pa.aW0.array); w1.push(...pa.aW1.array);
      const ix = Array.from(g.index.array, (v) => v + vbase);
      far.chunks[id] = ix; vbase += pa.position.count; g.dispose();
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    fg.setAttribute('aW0', new THREE.Float32BufferAttribute(w0, 4)); fg.setAttribute('aW1', new THREE.Float32BufferAttribute(w1, 4));
    fg.setIndex(new THREE.Uint32BufferAttribute(new Uint32Array(1), 1));
    const farTerr = new THREE.Mesh(fg, terrainMat()); farTerr.receiveShadow = true; farTerr.name = 'fo:farTerrain'; farTerr.matrixAutoUpdate = false;
    group.add(farTerr);
    let lastKey = null, lodT = 0;
    F.stats.outer = { ms: Math.round((performance.now() - t0) * 10) / 10, flora: flora ? flora.list.length : 0 };
    return {
      group, flora,
      update(dt, ctx) {
        // footprints fade (the 2D renderer that used to age them is not running in 3D)
        const pr = NW.Render && NW.Render.prints;
        if (pr && pr.length && ctx && ctx.area) for (let i = pr.length - 1; i >= 0; i--) { const p = pr[i]; if (p.area !== ctx.area.id) continue; p.life -= dt * 0.02; if (p.life <= 0) pr.splice(i, 1); }
        lodT += dt; if (lodT < 0.25) return; lodT = 0;
        const vis = (ctx && ctx.visible) || [];
        const built = R3.View && R3.View.groups ? R3.View.groups : {};
        const hide = vis.filter((id) => built[id]);
        const key = hide.join(',');
        if (key === lastKey) return;
        lastKey = key;
        const idx = [];
        for (const id in far.chunks) { if (hide.includes(id)) continue; const c = far.chunks[id]; for (let i = 0; i < c.length; i++) idx.push(c[i]); }
        fg.setIndex(new THREE.Uint32BufferAttribute(new Uint32Array(idx.length ? idx : [0]), 1)); fg.setDrawRange(0, idx.length);
        fg.computeBoundingSphere();
        farTerr.visible = idx.length > 0;
      },
    };
  };
})(window.NW);
