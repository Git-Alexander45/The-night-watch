'use strict';
// 3D presentation layer (Three.js r159, classic build). The game logic keeps running in its
// original 2D coordinates; this layer maps that state into a first-person 3D world.
//   1 game pixel = R3.K metres. Forest area (ax, ay) sits at (ax * 24 m, ay * 13.6 m).
//   Game x -> world +X, game y (south) -> world +Z, world +Y is up.
(function (NW) {
  const THREE = window.THREE;
  const R3 = NW.R3 = { active: false, ready: false };
  if (!THREE) return;
  const U = NW.U, D = NW.D;

  R3.K = 0.05;                       // metres per game pixel
  R3.AREA_W = 30 * 16 * R3.K;        // 24 m
  R3.AREA_H = 17 * 16 * R3.K;        // 13.6 m
  R3.EYE = 1.62;
  // Interiors live away from the forest: the cabin rooms keep their real floor plan (D.ROOM_ORIGIN).
  R3.CABIN = { x: -150, y: 0, z: 0 };
  R3.ZONES = {
    in_tower: () => { const o = R3.areaOrigin('f_0_0'); return { x: o.x + 320 * R3.K - 128 * R3.K, y: 11.5, z: o.z + 128 * R3.K - 150 * R3.K }; },
    in_shack: () => ({ x: -150, y: 0, z: 90 }),
    in_mine: () => ({ x: -150, y: 0, z: 160 }),
  };

  // ------------------------------------------------------------ quality
  R3.QUALITY = {
    low: { label: 'Low', scale: 0.7, minScale: 0.5, dpr: 1, pool: 6, shadows: 0, shadowMin: 9, shadowSize: 512, bloom: false, msaa: 0, tex: 512, particles: 0.4, drawDist: 60 },
    medium: { label: 'Medium', scale: 0.85, dpr: 1, pool: 10, shadows: 1, shadowMin: 3, shadowSize: 512, bloom: false, msaa: 2, tex: 1024, particles: 0.75, drawDist: 80 },
    high: { label: 'High', scale: 1, dpr: 1.5, pool: 16, shadows: 2, shadowMin: 1, shadowSize: 1024, bloom: true, msaa: 4, tex: 1024, particles: 1, drawDist: 100 },
  };
  R3.POOL_MAX = 16;
  R3.q = () => R3.QUALITY[(NW.settings && NW.settings.quality) || 'medium'] || R3.QUALITY.medium;

  // Shared uniforms every 3D material reads (time, wind, wetness, snow cover, pool lights).
  R3.U = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector4(1, 0, 0.3, 0) },   // xy dir, z strength, w gust
    uWet: { value: 0 },
    uSnow: { value: 0.3 },
    uPoolPos: { value: Array.from({ length: R3.POOL_MAX }, () => new THREE.Vector3()) },
    uPoolCol: { value: Array.from({ length: R3.POOL_MAX }, () => new THREE.Vector3()) },
    uPoolRD: { value: Array.from({ length: R3.POOL_MAX }, () => new THREE.Vector2(10, 2)) },
    uPoolN: { value: 0 },
  };

  R3.supported = function () {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2')); } catch (e) { return false; }
  };

  // ------------------------------------------------------------ coordinates
  R3.areaOrigin = function (areaId) {
    if (!areaId) return { x: 0, y: 0, z: 0 };
    if (areaId.startsWith('f_')) { const [ax, ay] = D.areaXY(areaId); return { x: ax * R3.AREA_W, y: 0, z: ay * R3.AREA_H }; }
    if (areaId.startsWith('room_')) { const o = D.ROOM_ORIGIN[areaId]; return { x: R3.CABIN.x + o[0] * 16 * R3.K, y: R3.CABIN.y, z: R3.CABIN.z + o[1] * 16 * R3.K }; }
    const z = R3.ZONES[areaId];
    if (z) return z();
    // unknown interiors get their own spot far from everything
    const h = U.strHash(areaId) % 20;
    return { x: -320 - h * 60, y: 0, z: 300 };
  };
  // ground height at a world position (forest terrain, interiors are flat)
  R3.groundAt = function (x, z, areaId) {
    if (areaId && !areaId.startsWith('f_')) return R3.areaOrigin(areaId).y;
    return R3.Terrain ? R3.Terrain.height(x, z) : 0;
  };
  R3.toWorld = function (areaId, px, py, out) {
    const o = R3.areaOrigin(areaId);
    out = out || new THREE.Vector3();
    out.x = o.x + px * R3.K; out.z = o.z + py * R3.K;
    out.y = R3.groundAt(out.x, out.z, areaId);
    return out;
  };
  R3.fromWorld = function (areaId, x, z) { const o = R3.areaOrigin(areaId); return { x: (x - o.x) / R3.K, y: (z - o.z) / R3.K }; };

  // ------------------------------------------------------------ setup
  let renderer, rt, rtBloom = [], quad, postScene, postCam, compMat, brightMat, blurMat, copyMat;
  R3.init = function () {
    if (R3.ready || !R3.supported()) return false;
    const cv = document.createElement('canvas');
    cv.id = 'view3d';
    document.body.insertBefore(cv, document.body.firstChild);
    try {
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
    } catch (e) { console.error(e); cv.remove(); return false; }
    R3.renderer = renderer;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the composite pass encodes sRGB itself
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.info.autoReset = false;
    R3.canvas = cv;
    R3.scene = new THREE.Scene();
    R3.scene.fog = new THREE.Fog(0x8a96a6, 0.03, 0); // near = density, far = time (see atmos.js)
    R3.camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 520);
    R3.camera.rotation.order = 'YXZ';
    R3.scene.add(R3.camera);
    // post-processing chain
    postScene = new THREE.Scene(); postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null); quad.frustumCulled = false; postScene.add(quad);
    const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    compMat = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
        uExposure: { value: 1 }, uGrain: { value: 0.02 }, uVig: { value: 0.3 }, uCA: { value: 0.0007 }, uCold: { value: 0.5 }, uFlash: { value: new THREE.Vector4(0, 0, 0, 0) }, uSat: { value: 0.9 } },
      vertexShader: vs, depthTest: false, depthWrite: false,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv; uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uBloom, uTime, uExposure, uGrain, uVig, uCA, uCold, uSat; uniform vec2 uRes; uniform vec4 uFlash;
        // ACES fitted (Stephen Hill)
        vec3 RRTAndODTFit(vec3 v){ vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return a/b; }
        vec3 aces(vec3 c){ const mat3 i = mat3(0.59719,0.07600,0.02840, 0.35458,0.90834,0.13383, 0.04823,0.01566,0.83777);
          const mat3 o = mat3(1.60475,-0.10208,-0.00327, -0.53108,1.10813,-0.07276, -0.07367,-0.00605,1.07602); c = i*c; c = RRTAndODTFit(c); return clamp(o*c, 0.0, 1.0); }
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4))-0.055, step(0.0031308, c)); }
        void main(){
          vec2 d = vUv - 0.5; float r2 = dot(d, d);
          vec2 off = d * uCA * r2 * 4.0;
          vec3 col;
          col.r = texture2D(tScene, vUv + off).r; col.g = texture2D(tScene, vUv).g; col.b = texture2D(tScene, vUv - off).b;
          if (uBloom > 0.0) col += texture2D(tBloom, vUv).rgb * uBloom;
          col *= uExposure;
          col = mix(col, uFlash.rgb, uFlash.a);
          col = aces(col);
          // cold grading: blue-grey shadows, slight desaturation
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(l), col, uSat);
          float sh = 1.0 - smoothstep(0.0, 0.45, l);
          col = mix(col, col * vec3(0.84, 0.95, 1.14), sh * uCold);
          col += vec3(-0.002, 0.0, 0.006) * sh * uCold;
          // vignette
          col *= 1.0 - uVig * smoothstep(0.12, 0.72, r2 * 1.6);
          col = toSRGB(clamp(col, 0.0, 1.0));
          // film grain (after encoding so it reads evenly)
          float g = hash(vUv * uRes + fract(uTime * 13.7) * 91.0) - 0.5;
          col += g * uGrain * (0.6 + 0.4 * (1.0 - l));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    brightMat = new THREE.ShaderMaterial({ uniforms: { tScene: { value: null }, uThr: { value: 1.1 } }, vertexShader: vs, depthTest: false, depthWrite: false,
      fragmentShader: 'varying vec2 vUv; uniform sampler2D tScene; uniform float uThr; void main(){ vec3 c = texture2D(tScene, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(uThr, uThr * 2.2, l), 1.0); }' });
    blurMat = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uOff: { value: 1 } }, vertexShader: vs, depthTest: false, depthWrite: false,
      fragmentShader: 'varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uOff; void main(){ vec2 o = uTexel * (uOff + 0.5); vec3 c = texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb; gl_FragColor = vec4(c * 0.25, 1.0); }' });
    copyMat = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null } }, vertexShader: vs, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true,
      fragmentShader: 'varying vec2 vUv; uniform sampler2D tSrc; void main(){ gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }' });
    R3.ready = true;
    R3.applyQuality();
    window.addEventListener('resize', R3.resize);
    if (window.matchMedia) { try { const mq = () => { const m = window.matchMedia('(resolution: ' + window.devicePixelRatio + 'dppx)'); m.addEventListener('change', () => { R3.resize(); mq(); }, { once: true }); }; mq(); } catch (e) { /* old browsers */ } }
    R3.initPerf();
    const gl = renderer.getContext();
    try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); R3.gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (e) { R3.gpu = '?'; }
    return true;
  };

  // ------------------------------------------------------------ sizing
  R3.dyn = { scale: 1, slowT: 0, fastT: 0 };
  R3.applyQuality = function () {
    if (!R3.ready) return;
    const q = R3.q();
    R3.dyn.scale = q.scale;
    R3.U.uPoolN.value = Math.min(q.pool, R3.POOL_MAX);
    if (R3.Lights) R3.Lights.applyQuality(q);
    if (R3.Tex) R3.Tex.applyQuality && R3.Tex.applyQuality(q);
    R3.resize(true);
    // the number of real shadow lights changes the compiled programs: rebuild them behind the loading screen
    const sig = String(q.shadows);
    if (R3.progSig != null && R3.progSig !== sig && R3.View && R3.View.initDone && R3.prepare) R3.prepare('Applying graphics…');
    R3.progSig = sig;
    NW.Hooks.emit('r3Quality', q);
  };
  R3.resize = function (force) {
    if (!R3.ready) return;
    const q = R3.q();
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
    const s = R3.dyn.scale * dpr;
    const rw = Math.max(64, Math.round(w * s)), rh = Math.max(64, Math.round(h * s));
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, true);
    R3.camera.aspect = w / h; R3.camera.updateProjectionMatrix();
    if (force === true || !rt || rt.width !== rw || rt.height !== rh || rt.samples !== q.msaa) {
      if (rt) rt.dispose();
      rt = new THREE.WebGLRenderTarget(rw, rh, { type: THREE.HalfFloatType, samples: q.msaa, depthBuffer: true });
      rtBloom.forEach((r) => r.dispose()); rtBloom = [];
      if (q.bloom) { let bw = rw >> 1, bh = rh >> 1; for (let i = 0; i < 4; i++) { rtBloom.push(new THREE.WebGLRenderTarget(Math.max(8, bw), Math.max(8, bh), { type: THREE.HalfFloatType })); bw >>= 1; bh >>= 1; } }
      compMat.uniforms.uRes.value.set(rw, rh);
    }
    R3.renderSize = { w: rw, h: rh, css: [w, h] };
  };
  function dynamicResolution(dt) {
    const d = R3.dyn, q = R3.q();
    if (d.lock) return;   // tests and screenshots pin the render scale
    const fps = 1 / Math.max(0.001, R3.perf.ema);
    const lo = q.minScale || 0.6;
    if (fps < 45) { d.slowT += dt; d.fastT = 0; } else if (fps > 56) { d.fastT += dt; d.slowT = 0; } else { d.slowT = Math.max(0, d.slowT - dt); d.fastT = Math.max(0, d.fastT - dt); }
    if (d.slowT > 1.2 && d.scale > lo) { d.scale = Math.max(lo, Math.round((d.scale - 0.1) * 100) / 100); d.slowT = 0; R3.resize(); }
    if (d.fastT > 4 && d.scale < q.scale) { d.scale = Math.min(q.scale, Math.round((d.scale + 0.05) * 100) / 100); d.fastT = 0; R3.resize(); }
  }

  // ------------------------------------------------------------ render
  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(postScene, postCam); }
  // Render a camera through the full chain to the screen (or into a canvas-sized target).
  R3.render = function (cam, t) {
    const q = R3.q();
    renderer.info.reset();
    if (R3.Lights) R3.Lights.upload(cam);
    if (R3.Flora && R3.Flora.active) R3.Flora.active.update(cam);
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(R3.scene, cam);
    let bloom = 0;
    if (q.bloom && rtBloom.length) {
      brightMat.uniforms.tScene.value = rt.texture; pass(brightMat, rtBloom[0]);
      for (let i = 1; i < rtBloom.length; i++) { blurMat.uniforms.tSrc.value = rtBloom[i - 1].texture; blurMat.uniforms.uTexel.value.set(1 / rtBloom[i - 1].width, 1 / rtBloom[i - 1].height); blurMat.uniforms.uOff.value = 1; pass(blurMat, rtBloom[i]); }
      for (let i = rtBloom.length - 2; i >= 0; i--) { copyMat.uniforms.tSrc.value = rtBloom[i + 1].texture; quad.material = copyMat; renderer.setRenderTarget(rtBloom[i]); renderer.autoClear = false; renderer.render(postScene, postCam); renderer.autoClear = true; }
      bloom = 0.32;
    }
    compMat.uniforms.tScene.value = rt.texture;
    compMat.uniforms.tBloom.value = rtBloom.length ? rtBloom[0].texture : null;
    compMat.uniforms.uBloom.value = bloom;
    compMat.uniforms.uTime.value = t;
    pass(compMat, null);
  };
  R3.post = function () { return compMat.uniforms; };

  // ------------------------------------------------------------ perf readout
  R3.perf = { ema: 1 / 60, frames: 0, acc: 0, fps: 60, ms: 16.7, min: 1 / 60 };
  R3.initPerf = function () {
    const el = document.createElement('div'); el.id = 'perf3d'; el.className = 'hidden';
    document.body.appendChild(el); R3.perfEl = el;
  };
  R3.togglePerf = function (on) {
    NW.settings.perf = on == null ? !NW.settings.perf : !!on;
    NW.Save.saveSettings();
  };
  function perfTick(dt) {
    const p = R3.perf;
    p.ema += (dt - p.ema) * 0.08;
    p.frames++; p.acc += dt;
    if (p.acc >= 0.5) {
      p.fps = p.frames / p.acc; p.ms = p.acc / p.frames * 1000; p.frames = 0; p.acc = 0;
      const el = R3.perfEl;
      if (el) {
        el.classList.toggle('hidden', !NW.settings.perf);
        if (NW.settings.perf) {
          const i = renderer.info;
          el.innerHTML = '<b>' + p.fps.toFixed(0) + ' fps</b> · ' + p.ms.toFixed(1) + ' ms<br>draws ' + i.render.calls + ' · tris ' + (i.render.triangles / 1000).toFixed(0) + 'k<br>lights ' + (R3.Lights ? R3.Lights.stats() : '-') +
            '<br>scale ' + Math.round(R3.dyn.scale * 100) + '% · ' + R3.renderSize.w + '×' + R3.renderSize.h + '<br>' + R3.q().label + ' · ' + U.escape(String(R3.gpu || '').slice(0, 40));
        }
      }
    }
  }

  // ------------------------------------------------------------ frame
  R3.frame = function (t, dt) {
    if (!R3.ready || R3.preparing) return;
    perfTick(dt);
    R3.U.uTime.value = t;
    try {
      if (R3.View) R3.View.frame(t, dt);
    } catch (e) { console.error(e); NW.lastError = String(e && e.stack || e); }
    if (R3.shotCb) { const cb = R3.shotCb; R3.shotCb = null; try { cb(R3.canvas.toDataURL('image/jpeg', 0.92)); } catch (e) { cb(null); } }
    dynamicResolution(dt);
  };
  // Next rendered frame as a data URL (read in the same task as the draw, so no compositor round-trip; used by tests).
  R3.shot = function () { return new Promise((res) => { R3.shotCb = res; }); };

  // 3D first-person view or the classic 2D view. ?view=2d / ?view=3d in the URL override the setting.
  R3.wanted = function () {
    const m = /[?&]view=(2d|3d)/.exec(location.search);
    if (m) return m[1];
    return (NW.settings && NW.settings.view) || '3d';
  };
  R3.setView = function (mode) {
    if (mode === '3d' && (R3.ready || R3.init())) {
      R3.active = true; document.body.classList.add('r3');
    } else {
      R3.active = false; document.body.classList.remove('r3', 'r3-view', 'r3-scene2d');
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
      if (R3.View) R3.View.override = null;
      const ov = document.getElementById('loading3d'); if (ov && !R3.preparing) ov.classList.add('hidden');
    }
    if (R3.canvas) R3.canvas.style.display = R3.active ? 'block' : 'none';
    ['crosshair', 'look-hint', 'perf3d'].forEach((id) => { const el = document.getElementById(id); if (el && !R3.active) el.classList.add('hidden'); });
    return R3.active;
  };
  R3.dispose = function () { /* the page owns the context for its lifetime */ };
})(window.NW);
