'use strict';
// Material factory and global shader overrides:
//  - height-aware drifting exponential fog replaces Three's fog chunks everywhere
//    (scene.fog is a THREE.Fog whose `near` carries the density and `far` the time),
//  - every standard material evaluates the pooled lights (R3.U.uPool*) with Three's own PBR BRDF,
//  - optional features per material: wind sway (vegetation), weathering/grime/wetness, snow on top faces.
(function (NW) {
  const THREE = window.THREE, R3 = NW.R3;
  if (!THREE || !R3) return;
  const C = THREE.ShaderChunk;

  // ------------------------------------------------------------- fog
  const NOISE = `
    float r3hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float r3noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(r3hash(i + vec3(0,0,0)), r3hash(i + vec3(1,0,0)), f.x), mix(r3hash(i + vec3(0,1,0)), r3hash(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(r3hash(i + vec3(0,0,1)), r3hash(i + vec3(1,0,1)), f.x), mix(r3hash(i + vec3(0,1,1)), r3hash(i + vec3(1,1,1)), f.x), f.y), f.z); }`;
  C.fog_pars_vertex = '#ifdef USE_FOG\n varying vec3 vFogWorld;\n#endif';
  C.fog_vertex = '#ifdef USE_FOG\n vFogWorld = cameraPosition + ( transpose( mat3( viewMatrix ) ) * mvPosition.xyz );\n#endif';
  C.fog_pars_fragment = `#ifdef USE_FOG
    uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; varying vec3 vFogWorld;
    ${NOISE}
    float r3FogAmount(){
      vec3 rd = vFogWorld - cameraPosition; float dist = length(rd);
      float k = 0.16;                                   // height falloff (1/m)
      float base = exp(-k * max(cameraPosition.y - R3_FOG_BASE, -4.0));
      float fh = k * rd.y;
      float integ = dist * base * (abs(fh) > 1e-3 ? (1.0 - exp(-fh)) / fh : 1.0);
      vec3 q = vFogWorld * 0.09 + vec3(fogFar * 0.035, 0.0, fogFar * 0.02);
      float n = 0.6 + 0.8 * r3noise(q);
      return 1.0 - exp(-fogNear * integ * n);
    }
  #endif`;
  C.fog_fragment = `#ifdef USE_FOG
    float fogAmt = r3FogAmount();
    #ifdef FOG_FADE
      gl_FragColor.rgb *= 1.0 - fogAmt;
    #else
      gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogAmt );
    #endif
  #endif`;
  // all shaders share the constant
  const FOG_DEFINES = { R3_FOG_BASE: '0.0' };

  // ------------------------------------------------------------- pooled lights
  const POOL_PARS = `
    #define R3_POOL ${R3.POOL_MAX}
    uniform vec3 uPoolPos[ R3_POOL ]; uniform vec3 uPoolCol[ R3_POOL ]; uniform vec2 uPoolRD[ R3_POOL ]; uniform int uPoolN;
    uniform float uTime; uniform vec4 uWind; uniform float uWet; uniform float uSnow;`;
  const POOL_LOOP = `
    for ( int i = 0; i < R3_POOL; i ++ ) {
      if ( i >= uPoolN ) break;
      vec3 r3lv = uPoolPos[ i ] - geometryPosition;
      float r3d = length( r3lv );
      if ( r3d > uPoolRD[ i ].x ) continue;
      IncidentLight r3l;
      r3l.direction = r3lv / max( r3d, 1e-4 );
      r3l.color = uPoolCol[ i ] * getDistanceAttenuation( r3d, uPoolRD[ i ].x, uPoolRD[ i ].y );
      r3l.visible = true;
      RE_Direct( r3l, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
    }
    #include <lights_fragment_maps>`;

  // world position / normal varyings used by weathering, snow and wetness
  const WORLD_VS = `
    vec4 r3wp = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      r3wp = instanceMatrix * r3wp;
    #endif
    r3wp = modelMatrix * r3wp;
    vR3World = r3wp.xyz;
    vec3 r3n = objectNormal;
    #ifdef USE_INSTANCING
      r3n = mat3( instanceMatrix ) * r3n;
    #endif
    vR3Normal = normalize( mat3( modelMatrix ) * r3n );`;

  // vertex wind sway: height above the object's base bends with the shared wind (applied after instancing)
  const WIND_PROJECT = `
    vec4 mvPosition = vec4( transformed, 1.0 );
    float r3h = transformed.y;
    vec3 r3base = modelMatrix[3].xyz;
    #ifdef USE_INSTANCING
      mvPosition = instanceMatrix * mvPosition;
      r3h = mvPosition.y - instanceMatrix[3].y;
      r3base += instanceMatrix[3].xyz;
    #endif
    {
      float r3k = max( r3h, 0.0 ) * uR3Wind;
      float r3ph = r3base.x * 0.37 + r3base.z * 0.29;
      float r3g = uWind.z * ( 0.55 + 0.45 * sin( uTime * 1.3 + r3ph ) ) + uWind.w * ( 0.5 + 0.5 * sin( uTime * 3.1 + r3ph * 1.7 ) );
      mvPosition.xz += uWind.xy * r3g * r3k * r3k * 0.05 + vec2( sin( uTime * 2.3 + r3ph * 3.0 ), cos( uTime * 1.9 + r3ph ) ) * r3k * 0.012 * ( 0.3 + uWind.z );
    }
    mvPosition = modelViewMatrix * mvPosition;
    gl_Position = projectionMatrix * mvPosition;`;

  const SURF_PARS = `
    varying vec3 vR3World; varying vec3 vR3Normal;
    #ifndef USE_FOG
    ${NOISE}
    #endif`;
  // weathering: world-space tint variation and grime toward the ground; wet darkening; snow on up faces
  const SURF_FRAG = `
    {
      if ( uR3S.x > 0.0 ) {
        float r3n1 = r3noise( vR3World * 0.7 ) * 0.6 + r3noise( vR3World * 2.9 ) * 0.4;
        diffuseColor.rgb *= 0.82 + 0.3 * r3n1;
        float r3grime = 1.0 - smoothstep( uR3S.y, uR3S.y + 0.9, vR3World.y );
        diffuseColor.rgb *= 1.0 - r3grime * 0.35 * ( 0.6 + 0.4 * r3noise( vR3World * 3.7 ) );
      }
      if ( uR3S.z > 0.0 ) {
        float r3up = smoothstep( 0.55, 0.9, vR3Normal.y );
        float r3sn = r3up * smoothstep( 0.05, 0.6, uSnow + ( r3noise( vR3World * 1.9 ) - 0.5 ) * 0.5 );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.82, 0.86, 0.92 ), r3sn * uR3S.z );
      }
      if ( uR3S.w > 0.0 ) {
        float r3wet = uWet * ( 0.65 + 0.35 * r3noise( vR3World * 1.3 ) );
        diffuseColor.rgb *= 1.0 - r3wet * 0.32;
      }
    }`;
  const SURF_ROUGH = `
    roughnessFactor = mix( roughnessFactor, 0.12, uR3S.w * uWet * 0.75 * ( 0.4 + 0.6 * smoothstep( 0.4, 0.8, vR3Normal.y ) ) );`;

  // opts: { wind: stiffness (1 = default), weather: true|groundY, snowTop: amount 0..1, wet: true }
  // Only the feature FLAGS (wind / surface) change the shader program; the amounts are per-material uniforms,
  // so materials that differ in stiffness, snow amount or ground height still share one compiled program.
  R3.std = function (params, opts) {
    opts = opts || {};
    if (params) for (const k in params) if (params[k] === undefined) delete params[k];
    const m = new THREE.MeshStandardMaterial(params || {});
    const defs = Object.assign({}, FOG_DEFINES);
    const weather = opts.weather != null && opts.weather !== false;
    const needWorld = weather || !!opts.snowTop || !!opts.wet;
    const uS = { value: new THREE.Vector4(weather ? 1 : 0, typeof opts.weather === 'number' ? opts.weather : 0, +opts.snowTop || 0, opts.wet ? 1 : 0) };
    const uW = { value: opts.wind ? +opts.wind : 0 };
    if (opts.wind) defs.R3_WIND = '';
    if (needWorld) defs.R3_SURF = '';
    m.defines = defs;
    const key = 'r3std|' + Object.keys(defs).map((k) => k + '=' + defs[k]).join(',');
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uPoolPos = R3.U.uPoolPos; sh.uniforms.uPoolCol = R3.U.uPoolCol; sh.uniforms.uPoolRD = R3.U.uPoolRD; sh.uniforms.uPoolN = R3.U.uPoolN;
      sh.uniforms.uTime = R3.U.uTime; sh.uniforms.uWind = R3.U.uWind; sh.uniforms.uWet = R3.U.uWet; sh.uniforms.uSnow = R3.U.uSnow;
      sh.uniforms.uR3S = uS; sh.uniforms.uR3Wind = uW;
      let vs = sh.vertexShader, fs = sh.fragmentShader;
      // declarations go BEFORE the common chunk so builder patches that inject code after it can use them
      vs = vs.replace('#include <common>', 'uniform float uTime; uniform vec4 uWind; uniform float uR3Wind;\n#ifdef R3_SURF\nvarying vec3 vR3World; varying vec3 vR3Normal;\n#endif\n#include <common>');
      if (opts.wind) vs = vs.replace('#include <project_vertex>', WIND_PROJECT);
      if (needWorld) vs = vs.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n#ifdef R3_SURF\n' + WORLD_VS + '\n#endif');
      fs = fs.replace('#include <common>', POOL_PARS + '\nuniform vec4 uR3S;\n#ifdef R3_SURF\n' + SURF_PARS + '\n#endif\n#include <common>');
      // noPool: hand-held things right next to a light (the viewmodel) would be blown out by it
      fs = fs.replace('#include <lights_fragment_maps>', opts.noPool ? '#include <lights_fragment_maps>' : POOL_LOOP);
      if (needWorld) {
        fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n#ifdef R3_SURF\n' + SURF_FRAG + '\n#endif');
        fs = fs.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n#ifdef R3_SURF\n' + SURF_ROUGH + '\n#endif');
      }
      sh.vertexShader = vs; sh.fragmentShader = fs;
      if (opts.patch) opts.patch(sh);
    };
    m.customProgramCacheKey = () => key + (opts.patchKey || '') + (opts.noPool ? '|np' : '');
    return m;
  };

  // Unlit material that still fogs (emissive panes, flames, dark silhouettes).
  R3.basic = function (params, opts) {
    opts = opts || {};
    if (params) for (const k in params) if (params[k] === undefined) delete params[k];
    const m = new THREE.MeshBasicMaterial(params || {});
    m.defines = Object.assign({}, FOG_DEFINES, opts.fade ? { FOG_FADE: '' } : {});
    if (opts.wind) {
      const uW = { value: +opts.wind };
      m.defines.R3_WIND = '';
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = R3.U.uTime; sh.uniforms.uWind = R3.U.uWind; sh.uniforms.uR3Wind = uW;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec4 uWind; uniform float uR3Wind;').replace('#include <project_vertex>', WIND_PROJECT);
      };
      m.customProgramCacheKey = () => 'r3basic-wind';
    }
    return m;
  };

  // Additive glow (light halos, sparks): fades into fog instead of shining through it.
  R3.glowMat = function (params) {
    const m = new THREE.MeshBasicMaterial(Object.assign({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }, params || {}));
    m.defines = Object.assign({}, FOG_DEFINES, { FOG_FADE: '' });
    return m;
  };
  R3.FOG_DEFINES = FOG_DEFINES;
  R3.NOISE_GLSL = NOISE;

  // Merge geometries (each with an optional Matrix4) into one non-indexed BufferGeometry.
  // Keeps position, normal, uv (and color when every part has it). Use per material, per region.
  R3.merge = function (parts) {
    const attrs = ['position', 'normal', 'uv'];
    const hasColor = parts.length && parts.every((p) => p.geo.attributes.color);
    if (hasColor) attrs.push('color');
    let count = 0;
    const flat = parts.map((p) => { const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone(); if (p.matrix) g.applyMatrix4(p.matrix); if (!g.attributes.normal) g.computeVertexNormals(); count += g.attributes.position.count; return g; });
    const out = new THREE.BufferGeometry();
    attrs.forEach((name) => {
      const size = name === 'uv' ? 2 : 3;
      const arr = new Float32Array(count * size);
      let o = 0;
      flat.forEach((g) => { const a = g.attributes[name]; if (a) arr.set(a.array.subarray(0, a.count * size), o); o += g.attributes.position.count * size; });
      out.setAttribute(name, new THREE.BufferAttribute(arr, size));
    });
    flat.forEach((g) => g.dispose());
    out.computeBoundingSphere(); out.computeBoundingBox();
    return out;
  };

  // Shared material cache: R3.mat('bark', () => R3.std({...}, {...}))
  const cache = {};
  R3.mat = function (key, make) { if (!cache[key]) cache[key] = make(); return cache[key]; };
  R3.matCache = cache;
  // Shared geometry cache.
  const gcache = {};
  R3.geo = function (key, make) { if (!gcache[key]) gcache[key] = make(); return gcache[key]; };
})(window.NW);
