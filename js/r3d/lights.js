'use strict';
// Pooled lighting. Every light source in the game is registered each frame with R3.Lights.add();
// only the N nearest (8/12/16 by quality) are uploaded to the shared uniform arrays that every
// R3.std material evaluates. 0-2 real shadow-casting point lights follow the most important nearby
// sources and crossfade when their assignment changes. Flicker drives light, glow, emissive and audio.
(function (NW) {
  const THREE = window.THREE, R3 = NW.R3;
  if (!THREE || !R3) return;
  const L = R3.Lights = {};
  let list = [], used = [];
  const shadowSlots = [];
  let glowMesh = null, glowMax = 64;
  const tmp = new THREE.Vector3();

  // ---------------------------------------------------------------- flicker
  function n1(t, s) { return Math.sin(t * 1.0 + s) * 0.5 + Math.sin(t * 2.3 + s * 1.7) * 0.3 + Math.sin(t * 5.1 + s * 3.1) * 0.2; }
  L.flicker = function (kind, t, seed) {
    seed = seed || 0;
    switch (kind) {
      case 'fire': return 0.82 + 0.12 * n1(t * 3.1, seed) + 0.06 * n1(t * 9.7, seed + 4) + (Math.sin(t * 17 + seed) > 0.96 ? 0.08 : 0);
      case 'candle': return 0.9 + 0.06 * n1(t * 4.0, seed) + 0.04 * n1(t * 13, seed + 2);
      case 'lantern': return 0.94 + 0.04 * n1(t * 2.2, seed) + 0.02 * n1(t * 11, seed);
      case 'failing': { const d = n1(t * 0.7, seed); return d < -0.55 ? 0.15 + 0.2 * Math.abs(n1(t * 25, seed)) : 0.9 + 0.08 * n1(t * 6, seed); }
      case 'pulse': return 0.75 + 0.25 * Math.sin(t * 2.2 + seed);
      default: return 1;
    }
  };
  const flickVals = {};
  L.f = (key) => (flickVals[key] == null ? 1 : flickVals[key]);

  // ---------------------------------------------------------------- frame api
  // l: { key, x, y, z (world), color: [r,g,b] linear 0..1, intensity (candela), range (m), decay?, flicker?, seed?,
  //      shadow?: priority > 0 to be considered for a real shadow light, glow?: size in m (additive halo), glowColor? }
  L.begin = function () { list = []; };
  L.add = function (l) { if (l && l.intensity > 0.001) list.push(l); return l; };
  L.all = () => list;
  // render every shadow slot's depth pass on the next draw (used once while loading, to compile the depth programs)
  L.forceShadows = () => { shadowSlots.forEach((s) => { s.light.shadow.autoUpdate = true; }); };

  L.applyQuality = function (q) {
    const want = q.shadows;
    while (shadowSlots.length < 2) {
      const pl = new THREE.PointLight(0xffffff, 0, 10, 2);
      pl.castShadow = false;
      pl.shadow.bias = -0.0025; pl.shadow.normalBias = 0.03; pl.shadow.camera.near = 0.08;
      R3.scene.add(pl);
      shadowSlots.push({ light: pl, key: null, w: 0, prev: null, prevW: 0 });
    }
    shadowSlots.forEach((s, i) => {
      const on = i < want;
      s.light.castShadow = on;
      s.light.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      if (s.light.shadow.map) { s.light.shadow.map.dispose(); s.light.shadow.map = null; }
      if (!on) { s.key = null; s.w = 0; }
    });
    // glow sprites (one instanced draw call)
    if (!glowMesh) {
      const tex = makeGlowTex();
      const mat = R3.glowMat({ map: tex, color: 0xffffff, side: THREE.DoubleSide });
      const geo = new THREE.PlaneGeometry(1, 1);
      glowMesh = new THREE.InstancedMesh(geo, mat, glowMax);
      glowMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(glowMax * 3), 3);
      glowMesh.frustumCulled = false; glowMesh.renderOrder = 10; glowMesh.count = 0;
      R3.scene.add(glowMesh);
    }
  };
  function makeGlowTex() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  // Choose and upload the pool for a camera. Called right before each render.
  const dummy = new THREE.Object3D();
  L.upload = function (cam) {
    const U = R3.U, q = R3.q(), t = U.uTime.value;
    const cp = cam.getWorldPosition(tmp).clone();
    const view = cam.matrixWorldInverse;
    // flicker
    for (const l of list) {
      const f = l.flicker ? L.flicker(l.flicker, t, l.seed || 0) : 1;
      l._f = f; if (l.key) flickVals[l.key] = f;
      l._d = Math.hypot(l.x - cp.x, l.y - cp.y, l.z - cp.z);
      // importance: bright, near lights first; lights whose range can't reach the camera's surroundings rank last
      l._score = l._d - Math.min(l.range || 10, 25) * 0.6;
    }
    list.sort((a, b) => a._score - b._score);
    // shadow slots
    const ns = q.shadows;
    // Medium keeps its one cube shadow for the stove; the carried lantern's six-pass shadow is High only
    const cands = list.filter((l) => l.shadow >= (q.shadowMin || 1) && l._d < (l.range || 10) + 4).sort((a, b) => (b.shadow - a.shadow) || (a._d - b._d)).slice(0, ns);
    const dt = Math.min(0.1, R3.lastDt || 0.016);
    shadowSlots.forEach((s, i) => {
      const want = i < ns ? cands[i] : null;
      const wantKey = want ? want.key : null;
      if (s.key !== wantKey) {
        // crossfade: the new light fades in on this slot, the old one returns to the pool
        s.key = wantKey; s.w = 0;
      }
      s.w = Math.min(1, s.w + dt * 3);
      s.src = want;
      const pl = s.light;
      if (want) {
        pl.position.set(want.x, want.y, want.z);
        pl.color.setRGB(want.color[0], want.color[1], want.color[2]);
        pl.intensity = want.intensity * want._f * s.w;
        pl.distance = want.range || 10; pl.decay = want.decay || 2;
        pl.shadow.camera.far = Math.max(2, pl.distance);
      } else pl.intensity = 0;
      // the cube shadow map costs six scene passes: only render it while this slot actually lights something
      pl.shadow.autoUpdate = !!want && pl.intensity > 0.001;
    });
    // pool: nearest N, minus the share carried by shadow lights
    const N = Math.min(q.pool, R3.POOL_MAX);
    let n = 0;
    used = [];
    for (const l of list) {
      if (n >= N) break;
      let w = 1;
      for (const s of shadowSlots) if (s.src === l && s.light.castShadow) w = 1 - s.w;
      if (w <= 0.001) { used.push(l); continue; }
      tmp.set(l.x, l.y, l.z).applyMatrix4(view);
      U.uPoolPos.value[n].copy(tmp);
      const k = l.intensity * l._f * w;
      U.uPoolCol.value[n].set(l.color[0] * k, l.color[1] * k, l.color[2] * k);
      U.uPoolRD.value[n].set(l.range || 10, l.decay || 2);
      n++; used.push(l);
    }
    U.uPoolN.value = n;
    // glow halos: camera-facing quads
    if (glowMesh) {
      let g = 0;
      const col = new THREE.Color();
      for (const l of list) {
        if (!l.glow || g >= glowMax) continue;
        dummy.position.set(l.x, l.y, l.z);
        dummy.quaternion.copy(cam.quaternion);
        const s = l.glow * (0.85 + 0.15 * l._f);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        glowMesh.setMatrixAt(g, dummy.matrix);
        const gc = l.glowColor || l.color, gi = (l.glowIntensity == null ? 0.6 : l.glowIntensity) * l._f;
        col.setRGB(gc[0] * gi, gc[1] * gi, gc[2] * gi);
        glowMesh.setColorAt(g, col);
        g++;
      }
      glowMesh.count = g;
      glowMesh.instanceMatrix.needsUpdate = true;
      if (glowMesh.instanceColor) glowMesh.instanceColor.needsUpdate = true;
    }
  };
  L.stats = function () { const sh = shadowSlots.filter((s) => s.light.castShadow && s.src).length; return R3.U.uPoolN.value + '/' + list.length + ' · shadows ' + sh; };
  L.used = () => used;
  // brightness of pooled light reaching a world point (for audio/flicker links and tests)
  L.lightAt = function (x, y, z) {
    let sum = 0;
    for (const l of list) { const d = Math.hypot(l.x - x, l.y - y, l.z - z); const r = l.range || 10; if (d < r) sum += l.intensity * (l._f || 1) / Math.max(1, d * d) * Math.pow(1 - d / r, 2); }
    return sum;
  };
})(window.NW);
