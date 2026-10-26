'use strict';
// Atmosphere: time-of-day and weather drive the fog, sky dome, sun/moon and ambient light,
// distant ridgelines, falling snow/rain, drifting motes and the shared wind. All values come
// from the game's own state (time, Survival.daylight(), weather), nothing here changes it.
(function (NW) {
  const THREE = window.THREE, R3 = NW.R3;
  if (!THREE || !R3) return;
  const A = R3.Atmos = {};
  let sky, sun, moonLight, hemi, ridges, snow, rain, motes;
  const col = (r, g, b) => new THREE.Color(r, g, b);
  const lerpC = (a, b, t) => a.clone().lerp(b, t);

  // palette (linear)
  const FOG_DAY = col(0.42, 0.46, 0.52), FOG_DUSK = col(0.30, 0.20, 0.20), FOG_NIGHT = col(0.016, 0.022, 0.038), FOG_DAWN = col(0.36, 0.30, 0.32);
  const ZEN_DAY = col(0.30, 0.36, 0.45), ZEN_NIGHT = col(0.004, 0.006, 0.014);

  A.init = function () {
    const scene = R3.scene;
    // sky dome
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uHorizon: { value: new THREE.Color() }, uZenith: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() },
        uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uMoon: { value: 0 }, uCloud: { value: 0.6 }, uTime: R3.U.uTime, uStars: { value: 0 }, uCloudCol: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }',
      fragmentShader: `varying vec3 vDir; uniform vec3 uHorizon, uZenith, uSunDir, uSunCol, uMoonDir, uCloudCol; uniform float uMoon, uCloud, uTime, uStars;
        ${R3.NOISE_GLSL}
        float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * r3noise(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 c = mix(uHorizon, uZenith, smoothstep(-0.02, 0.55, h));
          // below the horizon the fog colour continues (mountains & mist hide the seam)
          c = mix(uHorizon, c, smoothstep(-0.12, 0.02, h));
          // sun glow (overcast: wide and soft)
          float sd = max(dot(d, uSunDir), 0.0); c += uSunCol * (pow(sd, 8.0) * 0.25 + pow(sd, 120.0) * 0.6);
          // stars
          if (uStars > 0.0 && h > 0.0) { vec3 sp = floor(d * 380.0); float st = step(0.9975, r3hash(sp)); c += vec3(0.6, 0.7, 0.9) * st * uStars * smoothstep(0.0, 0.3, h) * (0.6 + 0.4 * sin(uTime * 3.0 + sp.x)); }
          // moon
          float md = dot(d, uMoonDir); float disc = smoothstep(0.99935, 0.99955, md);
          float mn = r3noise(d * 90.0) * 0.35 + 0.65;
          c += vec3(0.75, 0.8, 0.9) * disc * uMoon * mn * 2.4 + vec3(0.12, 0.15, 0.22) * pow(max(md, 0.0), 60.0) * uMoon;
          // slow cloud layer
          if (h > -0.05) {
            vec2 uv = d.xz / (h + 0.18);
            float cl = fbm(vec3(uv * 0.55 + vec2(uTime * 0.004, uTime * 0.0015), uTime * 0.002));
            float cov = smoothstep(1.0 - uCloud, 1.05 - uCloud * 0.45, cl) * smoothstep(-0.05, 0.25, h);
            c = mix(c, uCloudCol * (0.8 + 0.4 * cl), cov * 0.85);
            c *= 1.0 - cov * disc * 0.9;
          }
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), skyMat);
    sky.frustumCulled = false; sky.renderOrder = -10;
    scene.add(sky);
    // lights (constant count so programs never recompile)
    sun = new THREE.DirectionalLight(0xffffff, 1); sun.position.set(40, 80, 20); scene.add(sun); scene.add(sun.target);
    moonLight = sun; // one directional serves sun and moon
    hemi = new THREE.HemisphereLight(0x9aa6b6, 0x2a2622, 0.5); scene.add(hemi);
    // distant ridgelines rising out of the mist
    ridges = new THREE.Group();
    [[210, 34, 0.0, 0.9], [300, 58, 1.7, 0.75], [150, 16, 3.1, 1.0]].forEach(([r, hgt, ph, k]) => {
      const seg = 160, pos = [], idx = [];
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * Math.PI * 2;
        const n = 0.55 + 0.25 * Math.sin(a * 3 + ph) + 0.15 * Math.sin(a * 7.3 + ph * 2) + 0.08 * Math.sin(a * 17 + ph) + 0.05 * Math.sin(a * 31 + ph * 3);
        const cx = 60 + Math.cos(a) * r, cz = 34 + Math.sin(a) * r;
        pos.push(cx, -20, cz, cx, hgt * n, cz);
        if (i < seg) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      const m = new THREE.ShaderMaterial({ side: THREE.DoubleSide, fog: false, depthWrite: true,
        uniforms: { uFog: { value: new THREE.Color() }, uBase: { value: new THREE.Color() }, uK: { value: k } },
        vertexShader: 'varying float vH; void main(){ vH = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'varying float vH; uniform vec3 uFog, uBase; uniform float uK; void main(){ float m = clamp(uK * 0.78 + 0.18 * smoothstep(-5.0, 45.0, -vH + 30.0), 0.0, 0.97); gl_FragColor = vec4(mix(uBase, uFog, m), 1.0); }' });
      const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = -5; ridges.add(mesh);
    });
    scene.add(ridges);
    // particles: snow and rain share one approach — a box of points wrapped around the camera in the shader
    snow = makeParticles(5200, false); rain = makeParticles(3200, true); motes = makeMotes(260);
    scene.add(snow); scene.add(rain); scene.add(motes);
  };

  function makeParticles(n, isRain) {
    const pos = new Float32Array(n * 3), rnd = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = Math.random(); pos[i * 3 + 1] = Math.random(); pos[i * 3 + 2] = Math.random(); rnd[i] = Math.random(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aR', new THREE.BufferAttribute(rnd, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true, blending: isRain ? THREE.NormalBlending : THREE.NormalBlending,
      defines: Object.assign({}, R3.FOG_DEFINES, isRain ? { RAIN: '' } : {}),
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(26, 14, 26) }, uFall: { value: 0 }, uWindOff: { value: new THREE.Vector2() },
        uAmt: { value: 0 }, uCol: { value: new THREE.Color(1, 1, 1) }, uSize: { value: 1 }, uTime: R3.U.uTime }]),
      vertexShader: `attribute float aR; uniform vec3 uCam, uBox; uniform float uFall, uAmt, uSize, uTime; uniform vec2 uWindOff; varying float vA; varying float vR;
        #include <fog_pars_vertex>
        void main(){
          vec3 p = position * uBox;
          p.y -= uFall * (0.75 + aR * 0.5);
          p.xz += uWindOff * (0.7 + aR * 0.6);
          #ifndef RAIN
            p.x += sin(uTime * 0.9 + aR * 40.0) * 0.35; p.z += cos(uTime * 0.7 + aR * 31.0) * 0.35;
          #endif
          p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float keep = step(aR, uAmt);
          #ifdef RAIN
            gl_PointSize = keep * uSize * 26.0 / max(0.3, -mvPosition.z);
          #else
            gl_PointSize = keep * uSize * (10.0 + aR * 9.0) / max(0.3, -mvPosition.z);
          #endif
          vA = keep * smoothstep(0.2, 1.5, -mvPosition.z); vR = aR;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform vec3 uCol; varying float vA; varying float vR;
        #include <fog_pars_fragment>
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          #ifdef RAIN
            float a = smoothstep(0.06, 0.0, abs(c.x)) * (1.0 - abs(c.y) * 2.0) * 0.35;
          #else
            float a = smoothstep(0.5, 0.15, length(c)) * 0.85;
          #endif
          gl_FragColor = vec4(uCol, a * vA);
          if (gl_FragColor.a < 0.01) discard;
          #include <fog_fragment>
        }`,
    });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 5; pts.visible = false;
    return pts;
  }
  function makeMotes(n) {
    const pos = new Float32Array(n * 3), rnd = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = Math.random(); pos[i * 3 + 1] = Math.random(); pos[i * 3 + 2] = Math.random(); rnd[i] = Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aR', new THREE.BufferAttribute(rnd, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
      defines: Object.assign({}, R3.FOG_DEFINES, { FOG_FADE: '' }),
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCam: { value: new THREE.Vector3() }, uAmt: { value: 0.5 }, uCol: { value: new THREE.Color(1, 0.8, 0.6) }, uTime: R3.U.uTime }]),
      vertexShader: `attribute float aR; uniform vec3 uCam; uniform float uTime, uAmt; varying float vA;
        #include <fog_pars_vertex>
        void main(){ vec3 box = vec3(9.0, 4.0, 9.0); vec3 p = position * box + vec3(sin(uTime * 0.13 + aR * 50.0), sin(uTime * 0.07 + aR * 20.0) * 0.6 + uTime * 0.03, cos(uTime * 0.11 + aR * 30.0)) * 0.8;
          p = mod(p - uCam + box * 0.5, box) - box * 0.5 + uCam;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = step(aR, uAmt) * 5.0 / max(0.3, -mvPosition.z); vA = 0.5 + 0.5 * sin(uTime * 0.8 + aR * 90.0);
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform vec3 uCol; varying float vA;
        #include <fog_pars_fragment>
        void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(uCol * a * vA * 0.5, 1.0);
        #include <fog_fragment>
        }` });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 6;
    return pts;
  }

  // ---------------------------------------------------------------- per frame
  let fallSnow = 0, fallRain = 0;
  const windOff = new THREE.Vector2();
  A.state = { fogColor: new THREE.Color(), night: 0, day: 1, indoor: false };
  A.update = function (dt, cam, ctx) {
    const s = NW.G.state, w = s.weather, m = s.time.min, Sv = NW.Survival;
    const day = Sv.daylight();
    const indoor = ctx.indoor, deep = ctx.deep; // deep: mine, no sky at all
    // twilight tint: around 06:00-07:30 and 18:00-19:30
    const duskK = Math.max(0, 1 - Math.abs(m - 1125) / 75), dawnK = Math.max(0, 1 - Math.abs(m - 405) / 60);
    let fog = lerpC(FOG_NIGHT, FOG_DAY, day);
    fog.lerp(FOG_DUSK.clone().multiplyScalar(0.4 + day * 0.6), duskK * 0.6);
    fog.lerp(FOG_DAWN.clone().multiplyScalar(0.4 + day * 0.6), dawnK * 0.5);
    if (w.type === 'blizzard') fog.lerp(col(0.5, 0.54, 0.6).multiplyScalar(0.15 + day * 0.85), 0.5);
    const fogC = R3.scene.fog.color;
    fogC.copy(fog);
    let dens = 0.03 + (1 - day) * 0.016 + w.fog * 0.11 + (w.type === 'blizzard' ? 0.07 : w.type === 'snow' ? 0.018 : w.type === 'rain' ? 0.012 : 0);
    if (indoor) dens *= 0.25;
    if (deep) { fogC.setRGB(0.004, 0.004, 0.006); dens = 0.06; }
    R3.scene.fog.near = dens;
    R3.scene.fog.far = R3.U.uTime.value;
    A.state.fogColor.copy(fogC); A.state.day = day; A.state.night = 1 - day; A.state.indoor = indoor;
    // sun / moon
    const tod = (m / 1440) * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(tod - Math.PI / 2) * 0.8, Math.sin(tod - Math.PI / 2), 0.35).normalize();
    const moonDir = new THREE.Vector3(-0.45, 0.62, -0.64).normalize();
    const overcast = Math.min(1, 0.5 + w.precip * 0.4 + w.fog * 0.3 + (w.type === 'cloudy' ? 0.3 : 0));
    const moonVis = (1 - day) * (1 - overcast * 0.7);
    if (day > 0.02) { sun.position.copy(sunDir.y > 0.05 ? sunDir : new THREE.Vector3(0.6, 0.25, 0.3)).multiplyScalar(100).add(cam.position); sun.color.setRGB(1.0, 0.94 - duskK * 0.2, 0.86 - duskK * 0.35); sun.intensity = (indoor || deep) ? 0 : day * (2.4 - overcast * 1.2); }
    else { sun.position.copy(moonDir).multiplyScalar(100).add(cam.position); sun.color.setRGB(0.55, 0.65, 0.95); sun.intensity = (indoor || deep) ? 0 : 0.12 + moonVis * 0.3; }
    sun.target.position.copy(cam.position);
    // ambient: cold blue-grey at night, never pitch black
    const hk = deep ? 0.03 : indoor ? 0.07 + day * 0.85 : 0.17 + day * 2.1;
    hemi.intensity = hk;
    hemi.color.copy(lerpC(col(0.18, 0.24, 0.42), col(0.62, 0.68, 0.76), day));
    hemi.groundColor.copy(lerpC(col(0.05, 0.05, 0.07), col(0.28, 0.27, 0.27), day).lerp(col(0.6, 0.62, 0.66), Math.min(1, s.weather.snow) * 0.3 * day));
    // sky
    const su = sky.material.uniforms;
    su.uHorizon.value.copy(fogC); su.uZenith.value.copy(lerpC(ZEN_NIGHT, ZEN_DAY, day)).lerp(fogC, overcast * 0.6);
    su.uSunDir.value.copy(sunDir); su.uSunCol.value.setRGB(0.9, 0.55, 0.3).multiplyScalar((duskK + dawnK) * 0.8 * (1 - overcast * 0.5) + day * 0.05);
    su.uMoonDir.value.copy(moonDir); su.uMoon.value = moonVis;
    su.uCloud.value = Math.min(0.95, 0.35 + overcast * 0.6); su.uStars.value = (1 - day) * (1 - overcast);
    su.uCloudCol.value.copy(fogC).multiplyScalar(day > 0.1 ? 1.08 : 1.6).add(col(0.01, 0.012, 0.02).multiplyScalar(1 - day));
    sky.position.copy(cam.position);
    sky.visible = !deep;
    ridges.visible = !deep && !indoor;
    ridges.children.forEach((r, i) => { r.material.uniforms.uFog.value.copy(fogC); r.material.uniforms.uBase.value.copy(fogC).multiplyScalar(0.55 - i * 0.05).add(col(0.0, 0.004, 0.01)); });
    // wind (shared with vegetation sway, particles and audio)
    const wind = w.wind || 0;
    const gust = Math.max(0, Math.sin(R3.U.uTime.value * 0.31) * Math.sin(R3.U.uTime.value * 0.17 + 1.3)) * wind;
    R3.U.uWind.value.set(0.82, 0.57, 0.25 + wind * 1.2, gust * 1.4);
    // a winter forest: the ground and branches always carry snow; fresh falls add to it
    R3.U.uSnow.value = 0.62 + 0.38 * Math.min(1, s.weather.snow);
    R3.U.uWet.value += ((w.type === 'rain' ? Math.min(1, w.precip * 1.4) : 0) - R3.U.uWet.value) * Math.min(1, dt * 0.08);
    windOff.x += 0.82 * (0.5 + wind * 4 + gust * 3) * dt; windOff.y += 0.57 * (0.5 + wind * 4 + gust * 3) * dt;
    // precipitation
    const q = R3.q();
    const snowAmt = (w.type === 'snow' || w.type === 'blizzard') ? Math.min(1, w.precip * (w.type === 'blizzard' ? 1.5 : 1)) : (s.weather.snow > 0 && w.precip > 0 && w.type !== 'rain' ? w.precip * 0.4 : 0);
    const rainAmt = w.type === 'rain' ? Math.min(1, w.precip) : 0;
    fallSnow += dt * (0.9 + wind * 0.6); fallRain += dt * 9;
    [[snow, snowAmt * q.particles, fallSnow, col(0.9, 0.93, 1.0).multiplyScalar(0.25 + day * 0.75), 1.0], [rain, rainAmt * q.particles, fallRain, col(0.6, 0.66, 0.75).multiplyScalar(0.3 + day * 0.7), 1.0]].forEach(([pts, amt, fall, c, sz]) => {
      pts.visible = amt > 0.01 && !deep && !indoor;
      const u = pts.material.uniforms;
      u.uCam.value.copy(cam.position); u.uAmt.value = amt; u.uFall.value = fall; u.uWindOff.value.copy(windOff).multiplyScalar(pts === rain ? 0.4 : 1); u.uCol.value.copy(c); u.uSize.value = sz * (R3.renderSize ? R3.renderSize.h / 720 : 1);
      u.fogColor.value.copy(fogC); u.fogNear.value = R3.scene.fog.near; u.fogFar.value = R3.scene.fog.far;
    });
    // motes: dust in warm light indoors, ice crystals outdoors at night
    const mu = motes.material.uniforms;
    mu.uCam.value.copy(cam.position); mu.uAmt.value = (indoor ? 0.6 : 0.25 * (1 - day)) * q.particles; mu.uCol.value.copy(indoor ? col(1, 0.75, 0.5) : col(0.6, 0.7, 0.9));
    mu.fogColor.value.copy(fogC); mu.fogNear.value = R3.scene.fog.near; mu.fogFar.value = R3.scene.fog.far;
    motes.visible = !deep;
    // grading: colder at night
    const post = R3.post();
    post.uCold.value = 0.35 + (1 - day) * 0.55;
    post.uSat.value = 0.86 + day * 0.06;
  };
})(window.NW);
