'use strict';
// Procedural audio: ambience loops, synthesized sound effects, generative music.
(function (NW) {
  const A = NW.Audio = {
    ready: false,
    vol: { master: 0.8, music: 0.55, sfx: 0.8, amb: 0.7 },
    musicMode: 'none',
    errors: [],
  };
  let ctx, master, busMusic, busSfx, busAmb, reverbSend, mverbSend, averbSend;
  let noiseW, noiseP, noiseB;
  const loops = {};
  let nextPulse = 0, tension = 0, ambNext = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const hz = (root, semi) => root * Math.pow(2, semi / 12);

  function mkNoise(type) {
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'white') d[i] = w;
      else if (type === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    return buf;
  }
  function mkImpulse(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  // three reverbs: sfx (into the sfx bus), music (longer, into the music bus), ambience (into the amb bus) so every slider governs its own tails
  function mkVerb(sec, decay, gain, dest) {
    const cv = ctx.createConvolver(); cv.buffer = mkImpulse(sec, decay);
    const send = ctx.createGain(); send.gain.value = gain;
    send.connect(cv); cv.connect(dest); return send;
  }
  function mkBuses(dest) {
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(dest);
    busMusic = ctx.createGain(); busSfx = ctx.createGain(); busAmb = ctx.createGain();
    busMusic.connect(master); busSfx.connect(master); busAmb.connect(master);
    reverbSend = mkVerb(2.8, 2.6, 0.5, busSfx);
    mverbSend = mkVerb(3.6, 2.4, 0.45, busMusic);
    averbSend = mkVerb(2.4, 2.2, 0.6, busAmb);
  }

  A.init = function () {
    if (A.ready) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC(); liveCtx = ctx;
      mkBuses(ctx.destination);
      noiseW = mkNoise('white'); noiseP = mkNoise('pink'); noiseB = mkNoise('brown');
      buildLoops();
      A.ready = true;
      A.applyVolumes();
      // the listener follows the rendered camera exactly once per 3D frame
      if (NW.Hooks && NW.Hooks.on) NW.Hooks.on('r3Frame', () => { try { if (A.ready && liveCtx) updateListener(true); } catch (e) { if (A.errors.length < 50) A.errors.push('listener: ' + e.message); } });
    } catch (e) { console.warn('Audio unavailable', e); }
  };

  A.applyVolumes = function () {
    if (!A.ready) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(A.vol.master, t, 0.05);
    busMusic.gain.setTargetAtTime(A.vol.music * 0.9, t, 0.05);
    busSfx.gain.setTargetAtTime(A.vol.sfx, t, 0.05);
    busAmb.gain.setTargetAtTime(A.vol.amb, t, 0.05);
  };

  function loopNoise(buf) {
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    s.loopStart = Math.random(); s.start(0, Math.random() * 2); return s;
  }

  function buildLoops() {
    // Wind
    const w = loopNoise(noiseB);
    const wbp = ctx.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 420; wbp.Q.value = 0.8;
    const wlp = ctx.createBiquadFilter(); wlp.type = 'lowpass'; wlp.frequency.value = 2000;
    const wg = ctx.createGain(); wg.gain.value = 0;
    w.connect(wbp); wbp.connect(wlp); wlp.connect(wg); wg.connect(busAmb);
    loops.wind = { g: wg, bp: wbp, lp: wlp, gust: 0 };
    // wind through the trees: the same noise, high and airy (needles and bare branches)
    const lhp = ctx.createBiquadFilter(); lhp.type = 'highpass'; lhp.frequency.value = 2200;
    const lbp = ctx.createBiquadFilter(); lbp.type = 'bandpass'; lbp.frequency.value = 4200; lbp.Q.value = 0.6;
    const lg = ctx.createGain(); lg.gain.value = 0;
    w.connect(lhp); lhp.connect(lbp); lbp.connect(lg); lg.connect(busAmb);
    loops.leaves = { g: lg, bp: lbp };
    // Rain
    const r = loopNoise(noiseW);
    const rhp = ctx.createBiquadFilter(); rhp.type = 'highpass'; rhp.frequency.value = 1400;
    const rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 7000;
    const rg = ctx.createGain(); rg.gain.value = 0;
    r.connect(rhp); rhp.connect(rlp); rlp.connect(rg); rg.connect(busAmb);
    loops.rain = { g: rg, lp: rlp };
    // rain on the roof (heard inside the cabin): a mid patter band and a low drumming of the boards
    const rfb = ctx.createBiquadFilter(); rfb.type = 'bandpass'; rfb.frequency.value = 1100; rfb.Q.value = 0.6;
    const rfg = ctx.createGain(); rfg.gain.value = 0;
    const rfl = ctx.createBiquadFilter(); rfl.type = 'lowpass'; rfl.frequency.value = 380;
    const rfg2 = ctx.createGain(); rfg2.gain.value = 0;
    r.connect(rfb); rfb.connect(rfg); rfg.connect(busAmb); r.connect(rfl); rfl.connect(rfg2); rfg2.connect(busAmb);
    loops.roof = { g: rfg, g2: rfg2 };
    // Fire rumble
    const f = loopNoise(noiseB);
    const flp = ctx.createBiquadFilter(); flp.type = 'lowpass'; flp.frequency.value = 260;
    const fg = ctx.createGain(); fg.gain.value = 0;
    f.connect(flp); flp.connect(fg); fg.connect(busAmb);
    // 3D: the same rumble plus crackles through a panner at the stove
    const fg3 = ctx.createGain(); fg3.gain.value = 0;
    const crk = ctx.createGain(); crk.gain.value = 1;
    const crkLp = ctx.createBiquadFilter(); crkLp.type = 'lowpass'; crkLp.frequency.value = 16000;
    const fpn = mkPanner(0, -50, 0, 1.5, 1.2);
    flp.connect(fg3); fg3.connect(fpn); crk.connect(crkLp); crkLp.connect(fpn); fpn.connect(busAmb);
    loops.fire = { g: fg, level: 0, g3: fg3, crk, crkLp, pn: fpn };
    // Monster drone
    const dg = ctx.createGain(); dg.gain.value = 0;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 180;
    [41.2, 41.7, 61.9].forEach((fr) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(dlp); o.start(); });
    dlp.connect(dg); dg.connect(busAmb);
    loops.drone = { g: dg };
    // Whispers
    const wh = loopNoise(noiseP);
    const whb = ctx.createBiquadFilter(); whb.type = 'bandpass'; whb.frequency.value = 1500; whb.Q.value = 6;
    const whb2 = ctx.createBiquadFilter(); whb2.type = 'bandpass'; whb2.frequency.value = 2600; whb2.Q.value = 8;
    const whg = ctx.createGain(); whg.gain.value = 0;
    const whp = ctx.createStereoPanner();
    wh.connect(whb); wh.connect(whb2); whb.connect(whg); whb2.connect(whg); whg.connect(whp); whp.connect(busAmb);
    loops.whisper = { g: whg, b1: whb, b2: whb2, p: whp, lvl: 0 };
    // Radio static
    const rs = loopNoise(noiseW);
    const rsb = ctx.createBiquadFilter(); rsb.type = 'bandpass'; rsb.frequency.value = 2200; rsb.Q.value = 0.6;
    const rsg = ctx.createGain(); rsg.gain.value = 0;
    rs.connect(rsb); rsb.connect(rsg); rsg.connect(busAmb);
    // 3D: static from the office radio set
    const rsg3 = ctx.createGain(); rsg3.gain.value = 0;
    const rslp = ctx.createBiquadFilter(); rslp.type = 'lowpass'; rslp.frequency.value = 8000;
    const rpn = mkPanner(0, -50, 0, 1, 1);
    rsb.connect(rsg3); rsg3.connect(rslp); rslp.connect(rpn); rpn.connect(busAmb);
    loops.radio = { g: rsg, lvl: 0, g3: rsg3, lp: rslp, pn: rpn };
    // Room tone / forest bed
    const bed = loopNoise(noiseP);
    const bedlp = ctx.createBiquadFilter(); bedlp.type = 'lowpass'; bedlp.frequency.value = 500;
    const bedg = ctx.createGain(); bedg.gain.value = 0.02;
    bed.connect(bedlp); bedlp.connect(bedg); bedg.connect(busAmb);
    loops.bed = { g: bedg, lp: bedlp };
  }

  // ---------------------------------------------------------------- voice tracking
  // Every one-shot output chain is registered with an end time on the audio clock. Finished chains are
  // disconnected; past MAX_VOICES the oldest is faded out (40 ms, no click) and dropped.
  const voices = [], dying = [];
  const MAX_VOICES = 48;
  let liveCtx = null;
  function track(nodes, end, head) {
    if (!liveCtx || ctx !== liveCtx) return;           // offline renders manage themselves
    voices.push({ nodes, end, head });
    if (voices.length > MAX_VOICES) kill(voices.shift(), true);
  }
  function kill(v, fade) {
    if (fade && v.head) {
      const t = ctx.currentTime;
      try { v.head.gain.cancelScheduledValues(t); v.head.gain.setValueAtTime(v.head.gain.value, t); v.head.gain.linearRampToValueAtTime(0, t + 0.04); } catch (e) { /* gone */ }
      dying.push({ nodes: v.nodes, end: t + 0.08 });
      return;
    }
    for (const n of v.nodes) { try { n.disconnect(); } catch (e) { /* gone */ } }
  }
  function reap(t) {
    for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end < t) { kill(voices[i]); voices.splice(i, 1); }
    for (let i = dying.length - 1; i >= 0; i--) if (dying[i].end < t) { kill(dying[i]); dying.splice(i, 1); }
  }
  // how long a sound's graph stays alive (seconds, generous)
  const DUR = { bell_toll: 6.5, finale_sting: 4, sting: 3, mine_rumble: 3.6, wind_high: 3.8, howl: 3.4, bell: 3.4, gust: 2.4, voice: 3.6, flare: 3.2 };
  function durOf(n, o) {
    if (n === 'helicopter') return ((o && o.dur) || 6) + 0.8;
    if (n === 'truck') return ((o && o.dur) || 5) + 0.8;
    return (DUR[n] || 2.5) + 0.8;
  }

  // ---------------------------------------------------------------- SFX helpers
  function out(pan, vol, wet, dur) {
    const g = ctx.createGain(); g.gain.value = vol;
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0));
    g.connect(p); p.connect(busSfx);
    const nodes = [g, p];
    if (wet) { const s = ctx.createGain(); s.gain.value = wet; p.connect(s); s.connect(reverbSend); nodes.push(s); }
    track(nodes, ctx.currentTime + (dur || 3.3), g);
    return g;
  }

  // ================================================================ 3D positional audio
  // When the first-person view is on (NW.R3.active), sounds that come from somewhere play through a
  // PannerNode (HRTF, equalpower on Low quality) at their world position and the AudioContext listener
  // follows the camera. Cabin interior and exterior are two separate places in world space (the interior
  // keeps its 2D floor plan at R3.CABIN), so a source is converted into the listener's frame first, and a
  // low-pass fakes walls between them. With 3D off everything goes through the original stereo path.
  const L3 = { on: false, init: false, x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0, frame: 'world', room: null, kind: 'forest', inCabin: false, indoor: false };
  let v3a = null, v3b = null, lastQ = null;
  const isLowQ = () => !!(NW.settings && NW.settings.quality === 'low');
  function r3on() {
    const R3 = NW.R3, G = NW.G;
    return !!(R3 && R3.active && R3.camera && R3.toWorld && window.THREE && G && G.state && G.area && (G.mode === 'play' || G.mode === 'dead'));
  }
  function setParam(pr, v, snap, t) {
    if (snap) { pr.cancelScheduledValues(t); pr.setValueAtTime(v, t); } else pr.setTargetAtTime(v, t, 0.03);
  }
  function setPos(pn, x, y, z, snap) {
    if (pn.positionX) { const t = ctx.currentTime; setParam(pn.positionX, x, snap, t); setParam(pn.positionY, y, snap, t); setParam(pn.positionZ, z, snap, t); }
    else pn.setPosition(x, y, z);
    pn._p = [x, y, z];
  }
  function mkPanner(x, y, z, ref, roll) {
    const pn = ctx.createPanner();
    pn.panningModel = isLowQ() ? 'equalpower' : 'HRTF';
    pn.distanceModel = 'inverse'; pn.refDistance = ref || 3; pn.rolloffFactor = roll == null ? 1 : roll; pn.maxDistance = 250;
    setPos(pn, x, y, z, true);
    return pn;
  }
  // listener = camera (position + forward/up). Between rendered frames (and during NW.debug.step) the eye is
  // derived from the player position and the look angles, which is where the camera will be.
  function updateListener(fromCam) {
    const was = L3.on;
    L3.on = r3on();
    if (!L3.on || !ctx) return;
    const R3 = NW.R3, G = NW.G, a = G.area, p = G.state.player, C = R3.Controls || { yaw: 0, pitch: 0 };
    if (!v3a) { v3a = new THREE.Vector3(); v3b = new THREE.Vector3(); }
    const e = R3.toWorld(a.id, p.x, p.y - 3, v3a); e.y += R3.EYE || 1.62;
    const cp = R3.camera.position;
    let x = e.x, y = e.y, z = e.z, fx, fy, fz, ux, uy, uz;
    const camOk = Math.hypot(cp.x - x, cp.y - y, cp.z - z) < 1.5;
    if (fromCam || camOk) { x = cp.x; y = cp.y; z = cp.z; }
    if (fromCam) {
      R3.camera.updateMatrixWorld();
      const d = R3.camera.getWorldDirection(v3b); fx = d.x; fy = d.y; fz = d.z;
      const u = v3b.set(0, 1, 0).applyQuaternion(R3.camera.quaternion); ux = u.x; uy = u.y; uz = u.z;
    } else {
      const yw = C.yaw || 0, pt = C.pitch || 0;
      fx = Math.sin(yw) * Math.cos(pt); fy = Math.sin(pt); fz = -Math.cos(yw) * Math.cos(pt);
      ux = -Math.sin(pt) * Math.sin(yw); uy = Math.cos(pt); uz = Math.sin(pt) * Math.cos(yw);
    }
    const snap = !L3.init || !was || Math.hypot(x - L3.x, y - L3.y, z - L3.z) > 3;
    Object.assign(L3, { x, y, z, fx, fy, fz, ux, uy, uz });
    L3.kind = a.kind; L3.room = a.id; L3.inCabin = a.kind === 'room'; L3.frame = L3.inCabin ? 'cabin' : 'world';
    L3.indoor = a.kind !== 'forest' && a.id !== 'in_tower';
    const li = ctx.listener, t = ctx.currentTime;
    if (li.positionX) {
      setParam(li.positionX, x, snap, t); setParam(li.positionY, y, snap, t); setParam(li.positionZ, z, snap, t);
      setParam(li.forwardX, fx, snap, t); setParam(li.forwardY, fy, snap, t); setParam(li.forwardZ, fz, snap, t);
      setParam(li.upX, ux, snap, t); setParam(li.upY, uy, snap, t); setParam(li.upZ, uz, snap, t);
    } else { li.setPosition(x, y, z); li.setOrientation(fx, fy, fz, ux, uy, uz); }
    L3.init = true;
    // quality switch: persistent panners follow (HRTF <-> equalpower)
    const q = isLowQ();
    if (q !== lastQ) { lastQ = q; [loops.fire && loops.fire.pn, loops.radio && loops.radio.pn].forEach((pn) => { if (pn) pn.panningModel = q ? 'equalpower' : 'HRTF'; }); }
  }

  // ---- frames: the cabin interior plan ("cabin global" px, as G.cabinPoint) vs the exterior cabin in f_2_2
  const CAB_EXT_C = [264, 112], CAB_G_C = [300, 160], CAB_RE = 6.4; // exterior centre (f_2_2 px), same point in cabin-global px, shell radius (m)
  function cabG2Int(gx, gy, h) { const R3 = NW.R3; return { x: R3.CABIN.x + gx * R3.K, y: R3.CABIN.y + (h || 0), z: R3.CABIN.z + gy * R3.K }; }
  function cabG2Ext(gx, gy, h) { const v = NW.R3.toWorld('f_2_2', gx / 2.5 + 144, gy / 2.5 + 48, v3b || new THREE.Vector3()); return { x: v.x, y: v.y + (h || 0), z: v.z }; }
  function extToInt(p) {
    const c = NW.R3.toWorld('f_2_2', CAB_EXT_C[0], CAB_EXT_C[1], v3b || new THREE.Vector3());
    const dx = p.x - c.x, dz = p.z - c.z, r = Math.hypot(dx, dz) || 1e-3;
    const r2 = r <= CAB_RE ? r * 2.5 : CAB_RE * 2.5 + (r - CAB_RE);
    const ci = cabG2Int(CAB_G_C[0], CAB_G_C[1], 0);
    return { x: ci.x + dx / r * r2, y: ci.y + (p.y - c.y), z: ci.z + dz / r * r2 };
  }
  function intToExt(p) {
    const R3 = NW.R3;
    return cabG2Ext((p.x - R3.CABIN.x) / R3.K, (p.z - R3.CABIN.z) / R3.K, p.y - R3.CABIN.y);
  }
  function inFrame(p, frame) {
    if (frame === L3.frame) return p;
    return L3.frame === 'cabin' ? extToInt(p) : intToExt(p);
  }
  // where a listener / an area is, for wall occlusion: 'cabin', 'out' (forest + fire tower cab) or the remote interior's id
  const placeOf = (id) => (!id ? 'out' : id.startsWith('room_') ? 'cabin' : (id.startsWith('f_') || id === 'in_tower') ? 'out' : id);
  function cabinAnchors(frame) {
    const V = NW.R3.View, gr = V && V.groups;
    if (!gr) return null;
    if (frame === 'cabin') return (gr.__cabin && gr.__cabin.anchors) || null;
    return (gr.f_2_2 && gr.f_2_2.ext && gr.f_2_2.ext.anchors) || null;
  }
  const HGT = { owl: 6, crow: 1.2, bird: 5, bell: 1.8, howl: 0.9, growl: 0.5, bark: 0.5, whine: 0.4, roar: 1.4, voice: 1.6, snare_snap: 0.15, thud: 0.4, fireup: 0.5, whoosh: 0.6, latch: 0.7, heavystep: 0.2 };
  // sounds that only make sense outdoors: heard muffled when the listener is inside
  const OUTDOOR = { owl: 1, howl: 1, crow: 1, bird: 1, bell: 1, branch: 1, gust: 1, heavystep: 1, roar: 1, wind_high: 1, helicopter: 1, truck: 1, bell_toll: 1, flare: 1 };
  A.lastSpatial = null;
  // -> { x, y, z (listener frame), ref, roll, lp, vol } or null for a non-positional sound
  function spatial(name, o) {
    if (!L3.on || !r3on()) return null;
    if (!L3.init) updateListener(false);
    const lis = placeOf(L3.room);
    let sp = null;
    if (o.pos) {
      const p = inFrame({ x: o.pos[0], y: o.pos[1], z: o.pos[2] }, o.frame || L3.frame);
      sp = { x: p.x, y: p.y, z: p.z, ref: o.ref || 3, roll: 1, lp: o.lp || 0, vol: 1 };
    } else if (o.at && o.at.area) {
      const ar = o.at.area, R3 = NW.R3;
      const v = R3.toWorld(ar, o.at.x, o.at.y, v3b || new THREE.Vector3());
      const p = inFrame({ x: v.x, y: v.y + (o.at.h != null ? o.at.h : HGT[name] != null ? HGT[name] : 0.6), z: v.z }, ar.startsWith('room_') ? 'cabin' : 'world');
      const src = placeOf(ar);
      let lp = 0, vol = 1;
      if (src !== lis) { lp = src === 'cabin' || lis === 'cabin' ? 650 : 400; vol = 0.8; }
      else if (src === 'cabin' && ar !== L3.room) lp = 1800;
      sp = { x: p.x, y: p.y, z: p.z, ref: o.ref || 3, roll: 1, lp, vol };
    } else if (o.cabin) {
      sp = cabinSpatial(o.cabin);
    } else if (typeof o.pan === 'number') {
      // legacy stereo pan: keep the direction (pan -1 = left .. 1 = right, sometimes behind), keep the loudness
      const far = (o.wet || 0) >= 0.6, d = far ? 25 : 4;
      const az = Math.max(-1, Math.min(1, o.pan)) * Math.PI / 2 * 0.95;
      sp = aroundListener(Math.random() < 0.3 ? Math.PI - az : az, d, far ? 2 : 0);
      sp.ref = d; sp.roll = 1; sp.lp = L3.indoor && OUTDOOR[name] ? 900 : 0; sp.vol = 1;
    }
    if (sp) A.lastSpatial = { name, x: sp.x, y: sp.y, z: sp.z, lp: sp.lp, frame: L3.frame, lis: { x: L3.x, y: L3.y, z: L3.z, fx: L3.fx, fz: L3.fz } };
    return sp;
  }
  // az: radians from the facing direction, + = to the right
  function aroundListener(az, d, h) {
    let fx = L3.fx, fz = L3.fz; const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
    const rx = -fz, rz = fx, c = Math.cos(az), s = Math.sin(az);
    return { x: L3.x + (fx * c + rx * s) * d, y: L3.y + (h || 0), z: L3.z + (fz * c + rz * s) * d };
  }
  // cabin sounds (G.sfxCabin): { gx, gy (cabin-global px), where: 'door:front'|'win:<id>'|'roof'|'radio'|'obj'|..., room }
  function cabinSpatial(c) {
    const w = c.where || '', inside = L3.inCabin;
    const kind = w.startsWith('door:') ? 'door' : w.startsWith('win:') ? 'win' : w === 'roof' ? 'roof' : 'in';
    const H = { door: 1.2, win: 1.3, roof: inside ? 2.7 : 3.8, in: c.h != null ? c.h : 0.8 }[kind];
    let p = null;
    const anc = cabinAnchors(L3.frame);
    try {
      if (anc && kind === 'door') { const a = w === 'door:front' ? anc.frontDoorOutside : anc.backDoorOutside; if (a && a.pos) p = { x: a.pos.x, y: a.pos.y + H, z: a.pos.z }; }
      if (anc && kind === 'win') { const a = anc.windows && anc.windows[w.slice(4)]; if (a && a.outside) p = { x: a.outside.x, y: a.outside.y + H, z: a.outside.z }; }
      if (anc && kind === 'roof' && !inside && anc.roof && anc.roof.pos) p = { x: anc.roof.pos.x, y: anc.roof.pos.y + 0.3, z: anc.roof.pos.z };
    } catch (e) { p = null; }
    if (!p) p = inside ? cabG2Int(c.gx, c.gy, H) : cabG2Ext(c.gx, c.gy, H);
    let lp = 0, vol = 1;
    if (kind === 'in') {
      if (!inside) { lp = 500; vol = 0.7; } else if (c.room && c.room !== L3.room) lp = 1600;
    } else if (inside) {
      // the source is on the shell, outside: through the door / glass / roof boards
      if (kind === 'door') lp = (c.room === L3.room) ? 900 : 450;
      else if (kind === 'win') lp = (c.room === L3.room) ? 2600 : 900;
      else lp = 700;
    }
    if (!inside && placeOf(L3.room) !== 'out') { lp = 350; vol *= 0.5; }
    return { x: p.x, y: p.y, z: p.z, ref: 3, roll: 1, lp, vol };
  }
  // positional output chain: gain -> [low-pass] -> panner -> bus, plus a distance-weighted reverb send
  function out3d(sp, vol, wet, dur, bus, verb) {
    const g = ctx.createGain(); g.gain.value = vol * (sp.vol == null ? 1 : sp.vol);
    let last = g; const nodes = [g];
    if (sp.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = sp.lp; f.Q.value = 0.5; g.connect(f); last = f; nodes.push(f); }
    const pn = mkPanner(sp.x, sp.y, sp.z, sp.ref, sp.roll);
    last.connect(pn); pn.connect(bus || busSfx); nodes.push(pn);
    const dist = Math.hypot(sp.x - L3.x, sp.y - L3.y, sp.z - L3.z), ref = sp.ref || 3;
    const w = Math.max(wet || 0, Math.min(0.8, dist / 50));
    if (w > 0.01) { const s = ctx.createGain(); s.gain.value = w * Math.sqrt(ref / Math.max(ref, dist)); last.connect(s); s.connect(verb || reverbSend); nodes.push(s); }
    g._pn = pn;
    track(nodes, ctx.currentTime + (dur || 3.3), g);
    return g;
  }
  // gunshot echo off the far treeline: two late, dark reflections from random directions
  function gunEcho(t, vol) {
    for (let i = 0; i < 2; i++) {
      const d = rnd(35, 75), sp = aroundListener(rnd(-Math.PI, Math.PI), d, 4);
      sp.ref = d * 0.5; sp.roll = 1;
      const g = out3d(sp, vol * 0.55, 0.9, 3.2, busSfx, reverbSend);
      const tt = t + d / 343 + i * 0.22;
      noiseHit(g, tt, 0.8, 'lowpass', 900 - i * 300, 0.7, 0.35, noiseB); tone(g, tt, 0.45, 'sine', 90, 40, 0.3);
    }
  }
  A.listener = function () {
    const li = ctx && ctx.listener;
    return { on: L3.on, x: L3.x, y: L3.y, z: L3.z, fx: L3.fx, fy: L3.fy, fz: L3.fz, ux: L3.ux, uy: L3.uy, uz: L3.uz, frame: L3.frame, room: L3.room,
      param: li && li.positionX ? { x: li.positionX.value, y: li.positionY.value, z: li.positionZ.value, fx: li.forwardX.value, fy: li.forwardY.value, fz: li.forwardZ.value } : null };
  };
  function noiseHit(dest, t, dur, type, freq, q, peak, buf) {
    const s = ctx.createBufferSource(); s.buffer = buf || noiseW;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 2); s.stop(t + dur + 0.05);
    return f;
  }
  function tone(dest, t, dur, type, f0, f1, peak, attack) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + (attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  // long noise bed with a shaped envelope: pts = [[time, level], ...] relative to t
  function noiseEnv(dest, t, pts, type, freq, q, buf) {
    const s = ctx.createBufferSource(); s.buffer = buf || noiseB; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    pts.forEach(([dt, v]) => g.gain.linearRampToValueAtTime(Math.max(0.0001, v), t + dt));
    const end = pts[pts.length - 1][0];
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 2); s.stop(t + end + 0.05);
    return { f, g, s };
  }
  // inharmonic FM bell / chime
  function fmBell(dest, t, f, peak, dur, ratio, index) {
    const c = ctx.createOscillator(); c.frequency.value = f;
    const m = ctx.createOscillator(); m.frequency.value = f * (ratio || 1.41);
    const mg = ctx.createGain(); mg.gain.setValueAtTime(f * (index || 1.2), t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur);
    m.connect(mg); mg.connect(c.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    c.connect(g); g.connect(dest); c.start(t); m.start(t); c.stop(t + dur + 0.05); m.stop(t + dur + 0.05);
  }

  const SFX = {
    // footsteps: per surface, heel/toe grains with random colour so long walks don't loop audibly
    // o.sprint: harder, shorter heel strike; o.depth: snow cover 0..1 (deeper = longer crunch); o.cold: squeaky dry snow
    step(d, t, o) {
      const s = o.surface || 'wood', sp = o.sprint ? 1.2 : 1, sh = o.sprint ? 0.8 : 1;
      if (s === 'wood') {
        noiseHit(d, t, rnd(0.05, 0.09) * sh, 'lowpass', rnd(550, 900), 1, rnd(0.28, 0.38) * sp, noiseP); tone(d, t, 0.06, 'sine', rnd(115, 165), 65, rnd(0.2, 0.28) * sp);
        if (Math.random() < 0.12) tone(d, t + 0.03, 0.12, 'sawtooth', rnd(180, 260), rnd(220, 320), 0.025, 0.03);
      } else if (s === 'snow') {
        const deep = o.depth == null ? 0.5 : o.depth;
        const n = 2 + (Math.random() < 0.5 ? 1 : 0) + (deep > 0.65 ? 1 : 0);
        for (let i = 0; i < n; i++) noiseHit(d, t + i * rnd(0.018, 0.03) * (0.8 + deep * 0.5) * sh, rnd(0.06, 0.1) * (0.8 + deep * 0.4), 'bandpass', rnd(2200, 3600) - deep * 500, rnd(0.7, 1.2), rnd(0.12, 0.2) * sp);
        noiseHit(d, t + 0.02, 0.08, 'highpass', rnd(3600, 4800), 1, 0.07);
        if (deep > 0.5) noiseHit(d, t, 0.09 * sh, 'lowpass', rnd(260, 380), 1, 0.12 * sp, noiseB);
        if (o.cold && Math.random() < 0.5) tone(d, t + 0.03, 0.05, 'triangle', rnd(1300, 1700), rnd(1700, 2100), 0.025);
      } else if (s === 'trail') {
        // packed, trodden snow: one firm squeaky compression and a dull thump
        noiseHit(d, t, rnd(0.05, 0.07) * sh, 'bandpass', rnd(1500, 2300), 1.6, rnd(0.18, 0.24) * sp);
        tone(d, t, 0.05, 'sine', rnd(85, 110), 60, 0.16 * sp);
        if (Math.random() < 0.4) tone(d, t + 0.02, 0.04, 'triangle', rnd(1100, 1500), rnd(1500, 1900), 0.02);
      } else if (s === 'ice') {
        // hard boot on lake ice: a sharp click, a hollow tock, sometimes the ice sings
        noiseHit(d, t, 0.02, 'highpass', rnd(2800, 3600), 1, rnd(0.18, 0.24) * sp);
        tone(d, t, 0.07, 'sine', rnd(200, 260), rnd(140, 170), 0.2 * sp);
        if (o.sprint) noiseHit(d, t + 0.03, 0.12, 'bandpass', rnd(2200, 3000), 2, 0.06);
        if (Math.random() < 0.08) tone(d, t + 0.05, rnd(0.4, 0.7), 'sine', rnd(1800, 2600), rnd(260, 420), 0.035);
      } else if (s === 'stone') {
        // grit on rock: a dry scuff of fine grains over a short knock
        noiseHit(d, t, rnd(0.04, 0.06) * sh, 'bandpass', rnd(1700, 2500), 2, rnd(0.2, 0.26) * sp);
        for (let i = 0; i < 2; i++) noiseHit(d, t + rnd(0.01, 0.05), 0.02, 'highpass', rnd(3800, 5200), 1, rnd(0.04, 0.08));
        tone(d, t, 0.05, 'sine', rnd(160, 210), 90, 0.18 * sp);
      } else if (s === 'water') {
        noiseHit(d, t, rnd(0.12, 0.18), 'bandpass', rnd(700, 1100), 2, 0.28 * sp); tone(d, t + 0.02, 0.06, 'sine', rnd(500, 700), rnd(900, 1200), 0.04);
        noiseHit(d, t + rnd(0.08, 0.14), rnd(0.12, 0.2), 'lowpass', rnd(900, 1400), 1, 0.12 * sp, noiseP);
        if (Math.random() < 0.5) tone(d, t + rnd(0.1, 0.2), 0.05, 'sine', rnd(700, 1000), rnd(1300, 1700), 0.03);
      } else { noiseHit(d, t, rnd(0.06, 0.08) * sh, 'bandpass', rnd(800, 1300), 1.2, rnd(0.2, 0.27) * sp); if (Math.random() < 0.3) noiseHit(d, t + 0.03, 0.04, 'highpass', 3000, 1, 0.05); }
    },
    // a muffled voice at the door: formant-filtered glottal buzz in syllables (o.mimic: pitch slips wrongly)
    voice(d, t, o) {
      const n = (o && o.syll) || 5 + Math.floor(Math.random() * 5), mim = !!(o && o.mimic);
      const f0 = rnd(110, 200);
      const src = ctx.createOscillator(); src.type = 'sawtooth'; src.frequency.setValueAtTime(f0, t);
      const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 5; f1.frequency.value = 600;
      const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 7; f2.frequency.value = 1500;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
      src.connect(f1); src.connect(f2); f1.connect(g); f2.connect(g); g.connect(lp); lp.connect(d);
      let tt = t + 0.02;
      for (let i = 0; i < n; i++) {
        const sd = rnd(0.09, 0.22);
        const slip = mim && Math.random() < 0.3 ? rnd(0.55, 1.7) : 1;
        src.frequency.linearRampToValueAtTime(f0 * rnd(0.85, 1.2) * slip * (i === n - 1 && !mim ? 0.85 : 1), tt + sd * 0.6);
        f1.frequency.setValueAtTime(rnd(300, 850), tt); f2.frequency.setValueAtTime(rnd(900, 2400), tt);
        g.gain.linearRampToValueAtTime(rnd(0.5, 0.75), tt + 0.03); g.gain.linearRampToValueAtTime(0.03, tt + sd);
        if (Math.random() < 0.35) noiseHit(lp, tt, 0.05, 'bandpass', rnd(2500, 4000), 2, 0.08);
        tt += sd + (Math.random() < 0.2 ? rnd(0.12, 0.3) : rnd(0.02, 0.06));
      }
      g.gain.linearRampToValueAtTime(0.0001, tt + 0.05);
      src.start(t); src.stop(tt + 0.12);
    },
    creak(d, t) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const base = 70 + Math.random() * 60; o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * (1.3 + Math.random() * 0.5), t + 0.5);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9; bp.frequency.setValueAtTime(500, t); bp.frequency.linearRampToValueAtTime(900, t + 0.6);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.1); g.gain.linearRampToValueAtTime(0.0001, t + 0.7);
      o.connect(bp); bp.connect(g); g.connect(d); o.start(t); o.stop(t + 0.8);
    },
    knock(d, t, o) {
      const n = o.count || 3, base = rnd(100, 140), gap = rnd(0.24, 0.32);
      for (let i = 0; i < n; i++) {
        const tt = t + i * (gap + Math.random() * 0.06), f = base * rnd(0.92, 1.08);
        tone(d, tt, rnd(0.15, 0.2), 'sine', f, f * 0.45, rnd(0.8, 0.95)); noiseHit(d, tt, 0.05, 'lowpass', rnd(1200, 1800), 1, rnd(0.4, 0.55));
      }
    },
    bang(d, t) { tone(d, t, 0.4, 'sine', 80, 35, 1); noiseHit(d, t, 0.25, 'lowpass', 900, 1, 0.8, noiseB); },
    door(d, t) {
      const v = Math.floor(Math.random() * 3);
      if (v === 0) { SFX.creak(d, t); tone(d, t + 0.45, 0.2, 'sine', 90, 45, 0.6); noiseHit(d, t + 0.45, 0.1, 'lowpass', 800, 1, 0.4); }
      else if (v === 1) { SFX.latch(d, t); tone(d, t + 0.18, 0.18, 'sine', rnd(95, 115), 50, 0.55); noiseHit(d, t + 0.18, 0.12, 'lowpass', 900, 1, 0.4, noiseP); }
      else { SFX.creak(d, t); SFX.creak(d, t + 0.25); tone(d, t + 0.7, 0.22, 'sine', 80, 42, 0.6); noiseHit(d, t + 0.7, 0.1, 'lowpass', 700, 1, 0.35); }
    },
    latch(d, t) { tone(d, t, 0.03, 'square', 2200, 1800, 0.15); tone(d, t + 0.07, 0.04, 'square', 1500, 1200, 0.15); },
    chop(d, t) {
      noiseHit(d, t, rnd(0.1, 0.14), 'bandpass', rnd(1350, 2100), 1.5, rnd(0.5, 0.65)); tone(d, t, 0.12, 'sine', rnd(135, 185), rnd(60, 80), rnd(0.5, 0.65));
      if (Math.random() < 0.35) noiseHit(d, t + rnd(0.04, 0.08), 0.06, 'bandpass', rnd(2500, 3500), 3, 0.15);
    },
    pickup(d, t) { tone(d, t, 0.12, 'triangle', 520, 860, 0.18); },
    rustle(d, t) { noiseHit(d, t, 0.25, 'bandpass', 2400, 1.2, 0.18); noiseHit(d, t + 0.08, 0.2, 'bandpass', 3200, 1.2, 0.12); },
    click(d, t) { tone(d, t, 0.04, 'square', 900, 700, 0.07); },
    hover(d, t) { tone(d, t, 0.03, 'sine', 1200, 1100, 0.04); },
    open(d, t) { tone(d, t, 0.1, 'triangle', 300, 450, 0.12); },
    gun(d, t) {
      noiseHit(d, t, 0.5, 'lowpass', 5000, 0.7, 1.2); tone(d, t, 0.3, 'sine', 120, 40, 1);
      noiseHit(d, t + 0.32, 0.6, 'lowpass', 1200, 0.7, 0.25, noiseB); noiseHit(d, t + 0.7, 0.8, 'lowpass', 700, 0.7, 0.12, noiseB);
    },
    dryfire(d, t) { tone(d, t, 0.04, 'square', 1800, 1500, 0.15); },
    owl(d, t) { for (let i = 0; i < 2; i++) { const tt = t + i * 0.55; tone(d, tt, 0.45, 'sine', 370, 340, 0.25, 0.08); } },
    howl(d, t, o) {
      const k = (o && o.pitch) || 1;
      const o1 = ctx.createOscillator(); o1.type = 'triangle';
      o1.frequency.setValueAtTime(280 * k, t); o1.frequency.linearRampToValueAtTime(560 * k, t + 0.8); o1.frequency.linearRampToValueAtTime(480 * k, t + 2.2); o1.frequency.linearRampToValueAtTime(330 * k, t + 2.8);
      const v = ctx.createOscillator(); v.frequency.value = 5; const vg = ctx.createGain(); vg.gain.value = 8; v.connect(vg); vg.connect(o1.frequency);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.28, t + 0.5); g.gain.linearRampToValueAtTime(0.2, t + 2.2); g.gain.linearRampToValueAtTime(0.0001, t + 2.9);
      o1.connect(g); g.connect(d); o1.start(t); v.start(t); o1.stop(t + 3); v.stop(t + 3);
    },
    crow(d, t) {
      for (let i = 0; i < 3; i++) {
        const tt = t + i * 0.3; const o = tone(d, tt, 0.18, 'sawtooth', 640, 420, 0.12);
        void o; noiseHit(d, tt, 0.15, 'bandpass', 1300, 3, 0.1);
      }
    },
    bird(d, t) { for (let i = 0; i < 3; i++) tone(d, t + i * 0.11, 0.08, 'sine', 2400 + Math.random() * 1200, 3200 + Math.random() * 800, 0.05); },
    bell(d, t) {
      [0, 0.35, 0.9].forEach((dt, i) => {
        const c = ctx.createOscillator(); c.frequency.value = 1180 - i * 70;
        const m = ctx.createOscillator(); m.frequency.value = (1180 - i * 70) * 1.41; const mg = ctx.createGain(); mg.gain.value = 600;
        m.connect(mg); mg.connect(c.frequency);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t + dt); g.gain.linearRampToValueAtTime(0.12, t + dt + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 2.2);
        c.connect(g); g.connect(d); c.start(t + dt); m.start(t + dt); c.stop(t + dt + 2.3); m.stop(t + dt + 2.3);
      });
    },
    heavystep(d, t) { tone(d, t, 0.35, 'sine', 55, 30, 1); noiseHit(d, t, 0.2, 'lowpass', 220, 1, 0.6, noiseB); },
    glasstap(d, t) { for (let i = 0; i < 3; i++) { tone(d, t + i * 0.18, 0.08, 'triangle', 3200 + Math.random() * 400, 2800, 0.12); } },
    glasscrack(d, t) { noiseHit(d, t, 0.3, 'highpass', 3000, 1, 0.5); for (let i = 0; i < 5; i++) tone(d, t + Math.random() * 0.2, 0.15, 'sine', 3000 + Math.random() * 3000, 2000, 0.06); },
    glassbreak(d, t) { noiseHit(d, t, 0.8, 'highpass', 2000, 1, 0.9); for (let i = 0; i < 14; i++) tone(d, t + Math.random() * 0.6, 0.2, 'sine', 2500 + Math.random() * 5000, 1500, 0.06); },
    wood_crack(d, t) { noiseHit(d, t, 0.25, 'bandpass', rnd(750, 1050), 1, 0.8); tone(d, t, 0.2, 'sawtooth', rnd(105, 135), 60, 0.3); },
    scratch(d, t) { for (let i = 0; i < 6; i++) noiseHit(d, t + i * 0.13 + Math.random() * 0.04, 0.1, 'bandpass', 2600 + Math.random() * 1500, 2, 0.35); },
    rattle(d, t) { for (let i = 0; i < 5; i++) { tone(d, t + i * 0.07, 0.04, 'square', 1500 + Math.random() * 500, 1000, 0.1); } },
    drag(d, t) { noiseHit(d, t, 1.1, 'bandpass', 500, 1.5, 0.25, noiseB); },
    roofscrape(d, t) {
      const f = noiseHit(d, t, 1.6, 'bandpass', 500, 3, 0.4);
      f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(1400, t + 1.5);
    },
    scream(d, t) {
      const ws = ctx.createWaveShaper(); const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 6); }
      ws.curve = curve; ws.connect(d);
      tone(ws, t, 1.3, 'sawtooth', 820, 140, 0.6, 0.02); tone(ws, t, 1.3, 'sawtooth', 870, 155, 0.5, 0.02);
      noiseHit(ws, t, 1.2, 'bandpass', 1800, 1, 0.6);
    },
    shriek(d, t) { tone(d, t, 0.9, 'sawtooth', 1600, 500, 0.25, 0.05); tone(d, t, 0.9, 'sawtooth', 1660, 520, 0.2, 0.05); noiseHit(d, t, 0.8, 'highpass', 2500, 1, 0.3); },
    roar(d, t) { tone(d, t, 1.2, 'sawtooth', 90, 50, 0.6, 0.1); noiseHit(d, t, 1.1, 'lowpass', 600, 1, 0.6, noiseB); },
    hurt(d, t) { tone(d, t, 0.25, 'sine', 160, 50, 0.9); noiseHit(d, t, 0.15, 'lowpass', 1200, 1, 0.6); },
    eat(d, t) { for (let i = 0; i < 4; i++) noiseHit(d, t + i * 0.14, 0.07, 'bandpass', 1800, 2, 0.2); },
    drink(d, t) { for (let i = 0; i < 3; i++) tone(d, t + i * 0.2, 0.12, 'sine', 300, 500, 0.15); },
    sizzle(d, t) { noiseHit(d, t, 1.2, 'highpass', 3500, 0.5, 0.18); },
    beep(d, t) { tone(d, t, 0.1, 'sine', 1000, 1000, 0.15); tone(d, t + 0.15, 0.1, 'sine', 1300, 1300, 0.15); },
    bark(d, t) { for (let i = 0; i < 2; i++) { const tt = t + i * 0.32; tone(d, tt, 0.14, 'sawtooth', 420, 240, 0.35); noiseHit(d, tt, 0.1, 'bandpass', 900, 2, 0.3); } },
    growl(d, t) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 85;
      const am = ctx.createOscillator(); am.frequency.value = 23; const ag = ctx.createGain(); ag.gain.value = 0.15; am.connect(ag);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.25, t + 0.2); g.gain.linearRampToValueAtTime(0.0001, t + 1.2);
      ag.connect(g.gain);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
      o.connect(lp); lp.connect(g); g.connect(d); o.start(t); am.start(t); o.stop(t + 1.3); am.stop(t + 1.3);
    },
    whine(d, t) { tone(d, t, 0.6, 'sine', 900, 1300, 0.12, 0.1); },
    heartbeat(d, t) { tone(d, t, 0.15, 'sine', 60, 40, 0.8); tone(d, t + 0.22, 0.15, 'sine', 55, 38, 0.6); },
    whoosh(d, t) { const f = noiseHit(d, t, 0.6, 'lowpass', 300, 1, 0.6, noiseP); f.frequency.linearRampToValueAtTime(1500, t + 0.4); },
    sting(d, t) {
      [0, 1, 6, 11].forEach((st) => { tone(d, t, 2.5, 'sawtooth', 110 * Math.pow(2, st / 12), 0, 0.08, 0.4); });
    },
    gust(d, t) { const f = noiseHit(d, t, 2.0, 'bandpass', 300, 0.8, 0.35, noiseB); f.frequency.linearRampToValueAtTime(800, t + 1.2); },
    thud(d, t) { tone(d, t, 0.3, 'sine', rnd(62, 78), 35, 0.7); },
    sawing(d, t) { for (let i = 0; i < 4; i++) noiseHit(d, t + i * 0.3, 0.25, 'bandpass', 1800 + (i % 2) * 600, 2, 0.25); },
    hammer(d, t) { for (let i = 0; i < 3; i++) { tone(d, t + i * 0.35, 0.08, 'square', 900, 400, 0.15); noiseHit(d, t + i * 0.35, 0.06, 'bandpass', 2500, 2, 0.3); } },
    shutter(d, t) { tone(d, t, 0.2, 'sine', 140, 60, 0.6); noiseHit(d, t, 0.1, 'bandpass', 1200, 1, 0.3); },
    curtain(d, t) { noiseHit(d, t, 0.35, 'bandpass', 3000, 0.7, 0.12); },
    fireup(d, t) { const f = noiseHit(d, t, 0.9, 'lowpass', 200, 1, 0.5, noiseB); f.frequency.linearRampToValueAtTime(900, t + 0.6); },
    branch(d, t) { noiseHit(d, t, 0.12, 'bandpass', 1400, 3, 0.5); tone(d, t, 0.08, 'triangle', 600, 300, 0.2); },
    animal(d, t) { noiseHit(d, t, 0.2, 'bandpass', 1800, 2, 0.2); },
    paper(d, t) { noiseHit(d, t, 0.18, 'highpass', 3000, 0.5, 0.12); },

    // ------------------------------------------------ fishing, traps, building
    splash(d, t) {
      noiseHit(d, t, 0.35, 'lowpass', 1600, 0.8, 0.6, noiseP); noiseHit(d, t, 0.5, 'bandpass', 3200, 0.9, 0.18);
      for (let i = 0; i < 5; i++) { const tt = t + 0.05 + Math.random() * 0.35, f = rnd(500, 1100); tone(d, tt, rnd(0.04, 0.07), 'sine', f, f * 1.8, rnd(0.04, 0.08)); }
    },
    reel(d, t) {
      const n = 7 + Math.floor(Math.random() * 3), base = rnd(2600, 3200);
      for (let i = 0; i < n; i++) { const tt = t + i * 0.042 + Math.random() * 0.006; tone(d, tt, 0.018, 'square', base, base * 0.8, 0.05); noiseHit(d, tt, 0.015, 'highpass', 5000, 1, 0.06); }
      tone(d, t, 0.34, 'triangle', 180, 200, 0.03, 0.03);
    },
    fish_flop(d, t) {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) { const tt = t + i * rnd(0.12, 0.22); noiseHit(d, tt, 0.07, 'bandpass', rnd(900, 1400), 1.5, 0.35, noiseP); tone(d, tt, 0.06, 'sine', rnd(180, 240), 90, 0.25); }
    },
    line_snap(d, t) {
      tone(d, t, 0.35, 'triangle', 1900, 520, 0.22); tone(d, t, 0.25, 'sine', 3800, 900, 0.08);
      noiseHit(d, t, 0.05, 'highpass', 4000, 1, 0.5); noiseHit(d, t + 0.02, 0.3, 'bandpass', 600, 1, 0.12, noiseP);
    },
    ice_crack(d, t) {
      noiseHit(d, t, 0.08, 'highpass', 2500, 1, 0.55);
      for (let i = 0; i < 3; i++) { const tt = t + i * rnd(0.04, 0.09); tone(d, tt, rnd(0.35, 0.6), 'sine', rnd(2200, 3600), rnd(160, 280), 0.12); }
      tone(d, t, 0.6, 'sine', 70, 38, 0.4); noiseHit(d, t + 0.05, 0.5, 'lowpass', 400, 1, 0.25, noiseB);
    },
    snare_set(d, t) {
      noiseHit(d, t, 0.3, 'bandpass', 1800, 1, 0.22); noiseHit(d, t + 0.25, 0.25, 'bandpass', 2600, 1.2, 0.16);
      tone(d, t + 0.55, 0.035, 'square', 1700, 1300, 0.12); tone(d, t + 0.62, 0.05, 'triangle', 900, 700, 0.1);
    },
    snare_snap(d, t) {
      const f = noiseHit(d, t, 0.12, 'bandpass', 3000, 2, 0.6); f.frequency.exponentialRampToValueAtTime(800, t + 0.1);
      tone(d, t, 0.15, 'triangle', 700, 180, 0.25); tone(d, t + 0.08, 0.3, 'sine', 90, 45, 0.5); noiseHit(d, t + 0.08, 0.35, 'bandpass', 2200, 1, 0.12);
    },
    build_done(d, t) {
      for (let i = 0; i < 2; i++) { tone(d, t + i * 0.22, 0.08, 'square', 900, 400, 0.12); noiseHit(d, t + i * 0.22, 0.06, 'bandpass', 2500, 2, 0.25); }
      tone(d, t + 0.45, 0.25, 'sine', 70, 40, 0.5);
      [293.66, 369.99, 440, 587.33].forEach((f, i) => { tone(d, t + 0.6 + i * 0.09, 1.1, 'triangle', f, f, 0.09, 0.01); tone(d, t + 0.6 + i * 0.09, 0.7, 'sine', f * 2, f * 2, 0.025); });
    },
    radio_chirp(d, t) {
      noiseHit(d, t, 0.12, 'bandpass', 2400, 0.7, 0.28); tone(d, t + 0.1, 0.07, 'sine', 1450, 1450, 0.13); tone(d, t + 0.19, 0.09, 'sine', 1900, 1900, 0.12);
      noiseHit(d, t + 0.3, 0.08, 'bandpass', 2000, 0.8, 0.18);
    },
    mission_done(d, t) {
      [587.33, 739.99, 880, 1174.66].forEach((f, i) => fmBell(d, t + i * 0.11, f, 0.07, 1.4, 2, 0.4));
      tone(d, t, 1.6, 'triangle', 293.66, 293.66, 0.06, 0.05);
    },
    mission_fail(d, t) {
      tone(d, t, 0.9, 'triangle', 311.13, 300, 0.12, 0.02); tone(d, t + 0.35, 1.4, 'triangle', 233.08, 220, 0.12, 0.02);
      tone(d, t + 0.35, 1.4, 'sine', 116.54, 110, 0.1, 0.05);
    },
    ladder(d, t) {
      for (let i = 0; i < 4; i++) {
        const tt = t + i * rnd(0.28, 0.34);
        tone(d, tt, 0.07, 'triangle', rnd(320, 420), rnd(200, 260), 0.25); noiseHit(d, tt, 0.06, 'bandpass', rnd(1100, 1600), 2, 0.2, noiseP);
        if (Math.random() < 0.4) tone(d, tt + 0.05, 0.2, 'sawtooth', rnd(150, 210), rnd(230, 300), 0.02, 0.05);
      }
    },
    heavy_door(d, t) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(48, t); o.frequency.linearRampToValueAtTime(70, t + 1.1);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 7; bp.frequency.setValueAtTime(300, t); bp.frequency.linearRampToValueAtTime(520, t + 1.2);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.4, t + 0.2); g.gain.linearRampToValueAtTime(0.0001, t + 1.25);
      o.connect(bp); bp.connect(g); g.connect(d); o.start(t); o.stop(t + 1.3);
      tone(d, t + 1.2, 0.6, 'sine', 62, 30, 0.9); noiseHit(d, t + 1.2, 0.4, 'lowpass', 500, 1, 0.6, noiseB); tone(d, t + 1.25, 0.08, 'square', 1300, 900, 0.05);
    },
    drip(d, t) {
      const f = rnd(700, 1100);
      tone(d, t, 0.09, 'sine', f, f * rnd(1.8, 2.4), 0.75, 0.002); tone(d, t + 0.01, 0.05, 'sine', f * 3, f * 3.5, 0.1, 0.002);
    },
    mine_rumble(d, t) {
      const n = noiseEnv(d, t, [[0.5, 0.7], [1.6, 0.55], [3.2, 0]], 'lowpass', 160, 0.8, noiseB);
      n.f.frequency.linearRampToValueAtTime(260, t + 1); n.f.frequency.linearRampToValueAtTime(90, t + 3);
      tone(d, t, 3, 'sine', 38, 30, 0.45, 0.6);
      for (let i = 0; i < 9; i++) noiseHit(d, t + 0.6 + Math.random() * 2.2, rnd(0.02, 0.05), 'bandpass', rnd(1500, 3500), 2, rnd(0.04, 0.1));
    },
    wind_high(d, t) {
      const n = noiseEnv(d, t, [[1, 0.5], [2, 0.65], [3.4, 0]], 'bandpass', 900, 14, noiseW);
      n.f.frequency.linearRampToValueAtTime(rnd(1200, 1600), t + 1.2); n.f.frequency.linearRampToValueAtTime(rnd(700, 1000), t + 2.4); n.f.frequency.linearRampToValueAtTime(rnd(1300, 1800), t + 3.4);
      const m = noiseEnv(d, t, [[1.2, 0.4], [3.2, 0]], 'bandpass', 400, 0.8, noiseB); m.f.frequency.linearRampToValueAtTime(700, t + 1.5);
    },
    trade(d, t) {
      for (let i = 0; i < 4; i++) { const tt = t + i * rnd(0.06, 0.1); fmBell(d, tt, rnd(2400, 3400), 0.05, 0.25, 2.76, 0.6); }
      noiseHit(d, t + 0.35, 0.2, 'highpass', 3000, 0.5, 0.1); tone(d, t + 0.4, 0.15, 'triangle', 520, 780, 0.08);
    },
    finale_sting(d, t) {
      tone(d, t, 2.2, 'sine', 55, 30, 1, 0.01); noiseHit(d, t, 1.5, 'lowpass', 400, 1, 0.7, noiseB);
      [0, 1, 6, 7, 13].forEach((st) => { const o = tone(d, t + 0.05, 3.2, 'sawtooth', 73.42 * Math.pow(2, st / 12), 0, 0.06, 0.9); o.detune.value = rnd(-8, 8); });
      tone(d, t + 0.1, 3, 'sine', 1174.66, 1108.73, 0.03, 1.2);
    },
    flare(d, t) {
      tone(d, t, 0.06, 'square', 300, 120, 0.25); noiseHit(d, t, 0.18, 'highpass', 2000, 0.7, 0.6);
      noiseEnv(d, t + 0.05, [[0.25, 0.32], [1.6, 0.22], [2.8, 0]], 'highpass', 2800, 0.6, noiseW);
      noiseEnv(d, t + 0.05, [[0.3, 0.2], [2.8, 0]], 'lowpass', 300, 1, noiseB);
    },
    helicopter(d, t, o) {
      // rotor thump: brown noise amplitude-chopped by a ~11 Hz LFO, distance swell in and out
      const dur = (o && o.dur) || 6;
      const s = ctx.createBufferSource(); s.buffer = noiseB; s.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(250, t); lp.frequency.linearRampToValueAtTime(600, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(220, t + dur);
      const chop = ctx.createGain(); chop.gain.value = 0.5;
      const lfo = ctx.createOscillator(); lfo.type = 'triangle'; lfo.frequency.setValueAtTime(10.5, t); lfo.frequency.linearRampToValueAtTime(11.8, t + dur * 0.5); lfo.frequency.linearRampToValueAtTime(10, t + dur);
      const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(chop.gain);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.9, t + dur * 0.45); g.gain.linearRampToValueAtTime(0.7, t + dur * 0.6); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      s.connect(lp); lp.connect(chop); chop.connect(g); g.connect(d);
      s.start(t, Math.random() * 2); lfo.start(t); s.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
      const w = tone(d, t, dur, 'sawtooth', 92, 86, 0.02, dur * 0.4); void w;
    },
    bell_toll(d, t) {
      const f = 196;
      [[1, 0.22, 5], [2.01, 0.1, 3.5], [2.76, 0.06, 2.5], [0.5, 0.12, 6], [4.07, 0.03, 1.5]].forEach(([r, v, dur]) => fmBell(d, t, f * r, v, dur, 1.41, 0.5));
      noiseHit(d, t, 0.04, 'bandpass', 2000, 1, 0.2);
    },
    truck(d, t, o) {
      const dur = (o && o.dur) || 5;
      const eng = ctx.createOscillator(); eng.type = 'sawtooth';
      eng.frequency.setValueAtTime(38, t); eng.frequency.linearRampToValueAtTime(52, t + dur * 0.4); eng.frequency.linearRampToValueAtTime(44, t + dur * 0.45); eng.frequency.linearRampToValueAtTime(58, t + dur);
      const am = ctx.createOscillator(); am.frequency.value = 13; const ag = ctx.createGain(); ag.gain.value = 0.25; am.connect(ag);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.4, t + dur * 0.6); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      const pre = ctx.createGain(); pre.gain.value = 0.7; ag.connect(pre.gain);
      eng.connect(lp); lp.connect(pre); pre.connect(g); g.connect(d);
      eng.start(t); am.start(t); eng.stop(t + dur + 0.05); am.stop(t + dur + 0.05);
      noiseEnv(d, t, [[dur * 0.35, 0.18], [dur * 0.6, 0.14], [dur, 0]], 'lowpass', 500, 0.7, noiseB);
      noiseEnv(d, t, [[dur * 0.4, 0.05], [dur, 0]], 'bandpass', 2400, 1.2, noiseW);
    },
    typewriter(d, t) {
      noiseHit(d, t, rnd(0.025, 0.04), 'bandpass', rnd(2400, 3600), 1.5, rnd(0.6, 0.8)); tone(d, t, 0.035, 'square', rnd(160, 220), 90, 0.18);
      if (Math.random() < 0.06) fmBell(d, t + 0.05, 2637, 0.04, 0.6, 3.1, 0.3);
    },
    page(d, t) {
      const f = noiseHit(d, t, rnd(0.22, 0.3), 'bandpass', rnd(2500, 3500), 0.8, 0.3, noiseP); f.frequency.linearRampToValueAtTime(rnd(5000, 6500), t + 0.2);
      noiseHit(d, t + 0.2, 0.06, 'highpass', 3500, 0.7, 0.14);
    },
    achievement(d, t) {
      [[587.33, 0], [880, 0.12], [1174.66, 0.24]].forEach(([f, dt]) => fmBell(d, t + dt, f, 0.09, 1.5, 3.01, 0.35));
      tone(d, t + 0.24, 1.2, 'triangle', 293.66, 293.66, 0.05, 0.08);
    },
  };

  const playRate = {};
  // name, {pan, vol, wet}
  A.play = function (name, o) {
    if (!A.ready || !SFX[name]) return;
    o = o || {};
    const now = ctx.currentTime, t = now + 0.01 + (o.delay || 0);
    // a storm of the same immediate sound (a scripted burst, a stuck key) adds nothing but nodes: at most 4 per 100 ms
    if (!o.delay) {
      const rl = playRate[name] || (playRate[name] = []);
      while (rl.length && rl[0] < now - 0.1) rl.shift();
      if (rl.length >= 4) return;
      rl.push(now);
    }
    try {
      reap(now);
      const vol = o.vol == null ? 1 : o.vol, dur = (o.delay || 0) + durOf(name, o);
      const sp = L3.on ? spatial(name, o) : null;
      SFX[name](sp ? out3d(sp, vol, o.wet, dur, busSfx, reverbSend) : out(o.pan, vol, o.wet, dur), t, o);
      if (name === 'gun' && L3.on && !L3.indoor) gunEcho(t, vol);
    } catch (e) { if (A.errors.length < 50) A.errors.push(name + ': ' + e.message); }
  };
  A.sounds = () => Object.keys(SFX);

  // ------------------------------------------------- ambience
  function ambOut(pan, vol, wet, lp, dur) {
    const g = ctx.createGain(); g.gain.value = vol;
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0));
    let head = g; const nodes = [g, p];
    if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.connect(g); head = f; nodes.push(f); }
    g.connect(p); p.connect(busAmb);
    if (wet) { const s = ctx.createGain(); s.gain.value = wet; p.connect(s); s.connect(averbSend); nodes.push(s); }
    track(nodes, ctx.currentTime + (dur || 8), g);
    return head;
  }
  // an ambient one-shot from a direction around the listener: { az (rad from facing, + right), d (m), h, vol, wet, lp, dur, ref }
  // 3D: a panner at that point (ref defaults to d, so the level is the designed one); 2D: a stereo pan.
  function ambAt(o) {
    if (L3.on && r3on()) {
      const sp = aroundListener(o.az, o.d, o.h || 0);
      sp.ref = o.ref || o.d; sp.roll = 1; sp.lp = o.lp || 0;
      return out3d(sp, o.vol, o.wet, o.dur || 4, busAmb, averbSend);
    }
    return ambOut(Math.sin(o.az), o.vol, o.wet, o.lp, o.dur || 4);
  }
  // rare far-off events: a wolf chorus, the lake ice singing, a snow-laden branch giving way, a wind swell
  const AMB = {
    wolves(d, t) { const n = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) SFX.howl(d, t + i * rnd(0.5, 1.4), { pitch: rnd(0.85, 1.2) }); },
    ice(d, t) {
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) { const tt = t + i * rnd(0.15, 0.7); tone(d, tt, rnd(0.6, 1.1), 'sine', rnd(1400, 2600), rnd(120, 220), 0.12); }
      const o = tone(d, t, 2.2, 'triangle', rnd(70, 90), rnd(38, 48), 0.25, 0.4); void o;
    },
    branch(d, t) {
      noiseHit(d, t, 0.14, 'bandpass', rnd(1100, 1700), 3, 0.5); tone(d, t, 0.1, 'triangle', rnd(500, 700), 260, 0.18);
      const n = noiseEnv(d, t + 0.12, [[0.25, 0.22], [1.1, 0]], 'bandpass', 1800, 0.6, noiseP); n.f.frequency.linearRampToValueAtTime(700, t + 1.2);
      tone(d, t + 1.1, 0.2, 'sine', 90, 50, 0.25);
    },
    gust(d, t) { const n = noiseEnv(d, t, [[1.4, 0.4], [2.2, 0.32], [4, 0]], 'bandpass', 280, 0.9, noiseB); n.f.frequency.linearRampToValueAtTime(rnd(700, 1000), t + 1.6); n.f.frequency.linearRampToValueAtTime(300, t + 4); },
  };
  function ambientEvent(p, t) {
    const G = NW.G, s = G && G.state;
    const night = !!(s && s.night && s.night.active) || (p.tension || 0) > 0;
    const snowy = !!(s && s.weather && s.weather.snow > 0.2);
    const choices = [['gust', 0.4 + p.wind * 2], ['ice', 0.5], ['wolves', night ? 0.9 : 0.15]];
    if (snowy || p.wind > 0.4) choices.push(['branch', 0.6 + p.wind * 0.6]);
    let r = Math.random() * choices.reduce((a, c) => a + c[1], 0), k = choices[0][0];
    for (const c of choices) { r -= c[1]; if (r <= 0) { k = c[0]; break; } }
    const base = { wolves: 0.28, ice: 0.3, branch: 0.35, gust: 0.25 + p.wind * 0.3 }[k];
    const d = ambAt({ az: rnd(-Math.PI, Math.PI), d: rnd(40, 80), h: 3, vol: base * (p.indoors ? 0.35 : 1), wet: k === 'gust' ? 0.15 : 0.9, lp: p.indoors ? 600 : k === 'wolves' ? 1400 : 0, dur: 9 });
    AMB[k](d, t + 0.02);
    A.lastAmb = k;
  }

  // ------------------------------------------------- layered ambience one-shots
  // distant animals: owls and wolves at night, ravens by day, elk bugling at dusk
  const ANIM = {
    owl(d, t) { SFX.owl(d, t); },
    wolf(d, t) { SFX.howl(d, t, { pitch: rnd(0.85, 1.2) }); },
    raven(d, t) {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) { const tt = t + i * rnd(0.35, 0.55), f = rnd(330, 420); tone(d, tt, 0.22, 'sawtooth', f, f * 0.7, 0.12); noiseHit(d, tt, 0.18, 'bandpass', rnd(800, 1000), 3, 0.1); }
    },
    elk(d, t) {
      // bugle: a breathy slide up into a high whistle, then grunts
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(rnd(500, 650), t); o.frequency.linearRampToValueAtTime(rnd(1250, 1450), t + 0.9); o.frequency.setValueAtTime(rnd(1250, 1450), t + 1.7); o.frequency.linearRampToValueAtTime(rnd(380, 460), t + 2.3);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.18, t + 0.5); g.gain.setValueAtTime(0.16, t + 1.7); g.gain.linearRampToValueAtTime(0.0001, t + 2.4);
      o.connect(g); g.connect(d); o.start(t); o.stop(t + 2.5);
      noiseEnv(d, t, [[0.5, 0.05], [1.7, 0.04], [2.4, 0]], 'bandpass', 1300, 2, noiseP);
      for (let i = 0; i < 3; i++) tone(d, t + 2.6 + i * 0.32, 0.18, 'sawtooth', rnd(110, 140), 70, 0.12);
    },
  };
  function animalCall(p, t, muffle) {
    const night = !!p.night || (p.tension || 0) > 0;
    const dusk = p.min != null && p.dusk != null && Math.abs(p.min - p.dusk) < 80;
    const choices = night ? [['owl', 1], ['wolf', 0.6]] : dusk ? [['elk', 1.2], ['raven', 0.5], ['owl', 0.3]] : [['raven', 1], ['owl', 0.1]];
    let r = Math.random() * choices.reduce((a, c) => a + c[1], 0), k = choices[0][0];
    for (const c of choices) { r -= c[1]; if (r <= 0) { k = c[0]; break; } }
    const base = { owl: 0.4, wolf: 0.32, raven: 0.3, elk: 0.34 }[k];
    const dist = rnd(35, 75);
    const d = ambAt({ az: rnd(-Math.PI, Math.PI), d: dist, h: k === 'owl' ? 8 : 3, ref: dist * 0.5, vol: base * (p.indoors ? 0.4 : 1) * (1 - muffle * 0.4), wet: 0.85, lp: p.indoors ? 700 : 3800 - muffle * 1800, dur: 5 });
    ANIM[k](d, t + 0.02);
    A.lastAnimal = k;
  }
  // rare unexplained sounds at night, from behind and around the listener
  function oddSound(p, t) {
    const inCab = !!p.inCabin;
    const choices = inCab ? [['door', 0.2], ['whisper', 0.25], ['steps', 0.4], ['snap', 0.15]] : [['door', 0.25], ['whisper', 0.2], ['steps', 0.25], ['snap', 0.4]];
    let r = Math.random() * choices.reduce((a, c) => a + c[1], 0), k = choices[0][0];
    for (const c of choices) { r -= c[1]; if (r <= 0) { k = c[0]; break; } }
    const behind = Math.PI + rnd(-0.7, 0.7);
    if (k === 'door') {
      const d = ambAt({ az: rnd(-Math.PI, Math.PI), d: rnd(30, 50), h: 1, ref: 15, vol: 0.3, wet: 0.9, lp: inCab ? 700 : 1500, dur: 3 });
      SFX.creak(d, t + 0.02); tone(d, t + 0.75, 0.3, 'sine', 80, 40, 0.5); noiseHit(d, t + 0.75, 0.15, 'lowpass', 600, 1, 0.35, noiseB);
    } else if (k === 'whisper') {
      const d = ambAt({ az: behind, d: 1.2, h: 0, vol: 0.14, wet: 0.2, dur: 3 });
      for (let i = 0, n = 3 + Math.floor(Math.random() * 3), tt = t + 0.02; i < n; i++) {
        const sd = rnd(0.15, 0.3);
        noiseEnv(d, tt, [[sd * 0.4, rnd(0.25, 0.4)], [sd, 0]], 'bandpass', rnd(1500, 3200), rnd(4, 8), noiseP);
        tt += sd + rnd(0.04, 0.12);
      }
    } else if (k === 'snap') {
      const d = ambAt({ az: behind, d: rnd(3, 5), h: -0.8, vol: inCab ? 0.2 : 0.45, wet: 0.35, lp: inCab ? 1200 : 0, dur: 2 });
      noiseHit(d, t + 0.02, 0.12, 'bandpass', rnd(1200, 1700), 3, 0.6); tone(d, t + 0.02, 0.08, 'triangle', rnd(500, 700), 280, 0.22);
      if (Math.random() < 0.5) noiseHit(d, t + 0.25, 0.1, 'bandpass', 2400, 1.2, 0.12);
    } else {
      // footsteps circling: crunching steps that walk an arc around the listener (behind the walls when inside)
      const n = 8 + Math.floor(Math.random() * 4), gap = rnd(0.5, 0.65), rad = inCab ? rnd(7, 9) : rnd(6, 9), a0 = behind, sweep = rnd(2.2, 3.4) * (Math.random() < 0.5 ? -1 : 1);
      const vol = inCab ? 0.4 : 0.5, lp = inCab ? 900 : 0;
      const g = ambAt({ az: a0, d: rad, h: -1.5, vol, wet: 0.3, lp, dur: n * gap + 2, ref: 3 });
      if (g._pn && g._pn.positionX) {
        const pn = g._pn;
        for (let i = 1; i <= n; i++) { const q = aroundListener(a0 + sweep * i / n, rad, -1.5), tt = t + i * gap; pn.positionX.linearRampToValueAtTime(q.x, tt); pn.positionZ.linearRampToValueAtTime(q.z, tt); }
      } else if (!g._pn) {
        // 2D: a separate stereo panner sweeping the arc
        const sp = ctx.createStereoPanner(); sp.pan.setValueAtTime(Math.sin(a0), t);
        for (let i = 1; i <= n; i++) sp.pan.linearRampToValueAtTime(Math.sin(a0 + sweep * i / n), t + i * gap);
        sp.connect(g); track([sp], t + n * gap + 2);
        for (let i = 0; i < n; i++) SFX.step(sp, t + 0.05 + i * gap * rnd(0.95, 1.05), { surface: 'snow', depth: p.snow || 0.5 });
        A.lastOdd = k; return;
      }
      for (let i = 0; i < n; i++) SFX.step(g, t + 0.05 + i * gap * rnd(0.95, 1.05), { surface: 'snow', depth: p.snow || 0.5 });
    }
    A.lastOdd = k;
  }
  function cabinCreak(p, t) {
    const d = ambAt({ az: rnd(-Math.PI, Math.PI), d: rnd(2, 5), h: rnd(-1.4, 1.1), vol: rnd(0.07, 0.15) * (1 + (p.wind || 0) * 0.6), wet: 0.25, dur: 1.6 });
    if (Math.random() < 0.6) SFX.creak(d, t + 0.02);
    else for (let i = 0, n = 1 + Math.floor(Math.random() * 3); i < n; i++) tone(d, t + 0.02 + i * rnd(0.1, 0.4), 0.04, 'triangle', rnd(900, 1500), rnd(500, 700), 0.35);
    A.lastCreak = t;
  }
  function roofDrip(p, t, roof) {
    const d = ambAt({ az: rnd(-Math.PI, Math.PI), d: rnd(1.5, 4), h: rnd(0.4, 1.2), vol: rnd(0.03, 0.08) * roof, wet: 0.2, lp: 3000, dur: 0.6 });
    const f = rnd(1200, 2400); tone(d, t + 0.01, 0.05, 'sine', f, f * 1.5, 0.6, 0.002);
  }
  // the visitor's voice through the front door (after their knocks, and as they answer questions)
  function visitorVoice(mimic, delay) {
    const G = NW.G;
    if (G && G.sfxCabin) G.sfxCabin('voice', 'door:front', { mimic, delay, vol: 0.7 });
  }

  // Ambience parameters per frame.
  // Original params: indoors, wind, rain, fire, firePan, drone, whisper, radio, tension, muted.
  // Optional (3D and layered ambience): area, kind, inCabin, snow (cover 0..1), snowing (0..1), temp, stove (level 0..1, 0 = out),
  //   radioPending, night, min, dusk, visitor ({ knock, mimic } or null).
  const lay = {};
  A.layers = () => Object.assign({}, lay);
  A.ambience = function (p, dt) {
    if (!A.ready) return;
    const t = ctx.currentTime;
    reap(t);
    try { updateListener(false); } catch (e) { L3.on = false; if (A.errors.length < 50) A.errors.push('listener: ' + e.message); }
    const on3 = L3.on, mute = p.muted ? 0 : 1, wind = p.wind || 0;
    const W = loops.wind;
    // gusts follow the 3D wind uniform (the same gusts that bend the trees) when there is one, else a random walk
    const uw = on3 && NW.R3.U && NW.R3.U.uWind ? NW.R3.U.uWind.value : null;
    if (uw && wind > 0.01) { const tg = Math.min(0.85, (uw.w / 1.4) / Math.max(0.1, wind)) * 0.7 - 0.15; W.gust += (tg - W.gust) * Math.min(1, dt * 2); }
    else { W.gust += (Math.random() - 0.5) * dt * 1.2; W.gust = Math.max(-0.4, Math.min(0.4, W.gust * 0.995)); }
    // snow-muffled stillness: fresh cover and falling snow soak up the highs when the air is calm
    const muffle = p.snow == null ? 0 : U01(((p.snow || 0) - 0.3) * 0.6 + (p.snowing || 0) * 0.7, 0, 1) * (1 - Math.min(1, wind) * 0.6);
    const wv = (0.05 + wind * 0.45) * (1 + W.gust) * (p.indoors ? 0.35 : 1) * mute;
    W.g.gain.setTargetAtTime(wv, t, 0.3);
    W.bp.frequency.setTargetAtTime(300 + wind * 400 + W.gust * 300, t, 0.4);
    W.lp.frequency.setTargetAtTime(p.indoors ? 450 : 2400 - muffle * 1300, t, 0.3);
    const trees = !p.indoors && (p.kind == null || p.kind === 'forest') ? 1 : 0;
    const lv = trees * (0.012 + wind * 0.1) * (1 + Math.max(0, W.gust) * 2) * (1 - muffle * 0.7) * mute;
    loops.leaves.g.gain.setTargetAtTime(lv, t, 0.25);
    loops.leaves.bp.frequency.setTargetAtTime(3200 + wind * 1500 + W.gust * 1200, t, 0.3);
    const rv = (p.rain || 0) * (p.indoors ? 0.12 : 0.35) * mute;
    loops.rain.g.gain.setTargetAtTime(rv, t, 0.4);
    loops.rain.lp.frequency.setTargetAtTime(p.indoors ? 1800 : 7000, t, 0.3);
    const roof = p.inCabin ? (p.rain || 0) * mute : 0;
    loops.roof.g.gain.setTargetAtTime(roof * 0.2, t, 0.5); loops.roof.g2.gain.setTargetAtTime(roof * 0.12, t, 0.5);
    // fire: 2D keeps the original level/pan; 3D puts rumble and crackles at the stove, flickering with its light
    const fireP = on3 && p.stove != null;
    let fire3 = 0, flick = 1;
    if (fireP) {
      flick = NW.R3.Lights && NW.R3.Lights.f ? Math.max(0, NW.R3.Lights.f('stove')) : 1;
      fire3 = L3.inCabin ? p.stove * (0.55 + 0.45 * Math.min(1.1, flick)) : 0;
      if (fire3 > 0) {
        const sv = NW.R3.toWorld('room_main', 64, 50, v3b); setPos(loops.fire.pn, sv.x, sv.y + 0.5, sv.z, Math.hypot(sv.x - loops.fire.pn._p[0], sv.z - loops.fire.pn._p[2]) > 1);
        loops.fire.crkLp.frequency.setTargetAtTime(L3.room === 'room_main' ? 16000 : 1800, t, 0.1);
      }
    }
    loops.fire.g.gain.setTargetAtTime(fireP ? 0 : (p.fire || 0) * 0.5, t, 0.2);
    loops.fire.g3.gain.setTargetAtTime(fire3, t, 0.2);
    loops.drone.g.gain.setTargetAtTime((p.drone || 0) * 0.22, t, 0.6);
    const W2 = loops.whisper;
    W2.g.gain.setTargetAtTime((p.whisper || 0) * 0.35 * (0.5 + 0.5 * Math.sin(t * 3.1) * Math.sin(t * 1.7)), t, 0.08);
    W2.b1.frequency.setTargetAtTime(900 + Math.random() * 1800, t, 0.06);
    W2.b2.frequency.setTargetAtTime(1800 + Math.random() * 1800, t, 0.06);
    W2.p.pan.setTargetAtTime(Math.sin(t * 0.7), t, 0.2);
    // radio static: 3D from the office radio set while messages wait
    const radioP = on3 && p.radioPending != null;
    let radio3 = 0;
    if (radioP && p.radioPending > 0 && L3.inCabin) {
      radio3 = 1;
      const rv3 = NW.R3.toWorld('room_office', 116, 30, v3b); setPos(loops.radio.pn, rv3.x, rv3.y + 1, rv3.z, Math.hypot(rv3.x - loops.radio.pn._p[0], rv3.z - loops.radio.pn._p[2]) > 1);
      loops.radio.lp.frequency.setTargetAtTime(L3.room === 'room_office' ? 8000 : 1500, t, 0.1);
    }
    loops.radio.g.gain.setTargetAtTime(radioP ? 0 : (p.radio || 0) * 0.12 * (0.6 + Math.random() * 0.4), t, 0.03);
    loops.radio.g3.gain.setTargetAtTime(radio3 * 0.25 * mute * (0.6 + Math.random() * 0.4), t, 0.03);
    loops.bed.g.gain.setTargetAtTime((p.indoors ? 0.015 : 0.03) * (1 - muffle * 0.5), t, 0.5);
    loops.bed.lp.frequency.setTargetAtTime(500 - muffle * 260, t, 0.5);
    Object.assign(lay, { on3, wind: wv, leaves: lv, rain: rv, roof: roof * 0.2, fire: fireP ? 0 : (p.fire || 0) * 0.5, fire3, flick, radio: radioP ? 0 : (p.radio || 0) * 0.12, radio3: radio3 * 0.25 * mute, muffle });
    // Fire crackles (rate-limited on the audio clock so fast-forwarded frames can't pile up nodes)
    const fl = fireP ? fire3 : (p.fire || 0);
    if (fl > 0.02 && Math.random() < dt * (3 + fl * 14) * (fireP ? Math.min(1.3, flick * flick) : 1) && t - (loops.fire.last || 0) > 0.03) {
      loops.fire.last = t;
      if (fireP) {
        noiseHit(loops.fire.crk, t + 0.01, 0.02 + Math.random() * 0.03, 'highpass', 2500 + Math.random() * 3000, 1, 0.8 * (0.25 * fl + 0.04));
        if (flick > 0.97 && Math.random() < 0.25) { noiseHit(loops.fire.crk, t + 0.02, 0.05, 'bandpass', rnd(900, 1500), 1.5, 0.3 * fl); tone(loops.fire.crk, t + 0.02, 0.05, 'sine', rnd(90, 140), 60, 0.12 * fl); }
      } else {
        const g = out(p.firePan || 0, 0.25 * p.fire + 0.04, 0, 0.3);
        noiseHit(g, t + 0.01, 0.02 + Math.random() * 0.03, 'highpass', 2500 + Math.random() * 3000, 1, 0.8);
      }
    }
    // occasional distant events, on the audio clock
    if (!ambNext) ambNext = t + rnd(15, 30);
    if (t > ambNext) {
      ambNext = t + rnd(22, 55) / (0.7 + wind * 0.6);
      if (!p.muted) try { ambientEvent(p, t); } catch (e) { if (A.errors.length < 50) A.errors.push('amb: ' + e.message); }
    }
    // layered one-shots (only with the extended params, so old callers sound exactly as before)
    if (p.kind != null && !p.muted) {
      try {
        const forestish = p.kind === 'forest' || p.inCabin || p.area === 'in_tower';
        if (forestish) {
          if (!A._animT) A._animT = t + rnd(8, 20);
          if (t > A._animT) { A._animT = t + rnd(18, 45) * (1 + muffle * 0.8); animalCall(p, t, muffle); }
        }
        if (p.inCabin) {
          const cold = p.temp != null ? U01(-p.temp / 25, 0, 1) : 0;
          if (t > (A._creakT || 0) && Math.random() < dt * (0.015 + wind * 0.07 + cold * 0.04)) { A._creakT = t + 2.5; cabinCreak(p, t); }
          if (roof > 0.05 && t > (A._dripT || 0)) { A._dripT = t + rnd(0.15, 0.7) / roof; roofDrip(p, t, roof); }
        }
        if (p.night) {
          if (t > (A._oddT || 0) && Math.random() < dt * (0.004 + (p.tension || 0) * 0.02)) { A._oddT = t + 20; oddSound(p, t); }
        }
        // visitor: a voice after each round of knocking, and when they answer through the door
        const vis = p.visitor;
        if (vis && A._visK != null && vis.knock > A._visK + 3) visitorVoice(!!vis.mimic, 1.3);
        A._visK = vis ? vis.knock : null;
        const tk = (NW.UI && NW.UI.talkT) || 0;
        if (vis && tk > (A._talk || 0) + 0.5) visitorVoice(!!vis.mimic, 0.05);
        A._talk = tk;
      } catch (e) { if (A.errors.length < 50) A.errors.push('amb layers: ' + e.message); }
    }
    tension = p.tension || 0;
  };
  // test hooks: force a layered one-shot now
  A.ambTest = function (kind, p) {
    if (!A.ready) return;
    const t = ctx.currentTime; p = p || {};
    if (kind === 'animal') animalCall(p, t, 0); else if (kind === 'odd') oddSound(p, t); else if (kind === 'creak') cabinCreak(p, t); else if (kind === 'drip') roofDrip(p, t, 1); else if (kind === 'voice') visitorVoice(!!p.mimic, 0);
  };
  A.stats3d = () => ({ voices: voices.length, dying: dying.length, listener: L3.on, master: master ? master.gain.value : 0, lastOdd: A.lastOdd || null, lastAnimal: A.lastAnimal || null });

  // --------------------------------------------------------------- Music
  // Each mode plays into its own bus (lowpass -> fader). Switching modes fades the old bus out and lets its
  // voices die on their own; the scheduler writes one bar at a time, a fraction of a second ahead.
  const D3 = 146.83, D2 = 73.42;
  // the "Night Watch" motif: D A G F E — a fifth up, then a slow fall. [semitones, beats]
  const MOTIF = [[0, 1], [7, 1], [5, 0.5], [3, 0.5], [2, 2]];
  const ANSWER = [[3, 1], [2, 0.5], [0, 0.5], [-2, 1], [0, 2]];
  const MOTIF_MAJ = [[0, 1], [7, 1], [5, 0.5], [4, 0.5], [2, 1], [0, 2]];
  const MOTIF_BAD = [[0, 1.5], [6, 1.5], [5, 0.75], [1, 0.75], [0, 3]];
  const BUSCFG = {
    menu: { lp: 16000, wet: 0.6, lvl: 1 }, day: { lp: 16000, wet: 0.55, lvl: 1 }, night: { lp: 16000, wet: 0.7, lvl: 1 },
    intro: { lp: 9000, wet: 0.8, lvl: 1 }, finale: { lp: 12000, wet: 0.45, lvl: 1 },
    ending_good: { lp: 14000, wet: 0.65, lvl: 1 }, ending_bad: { lp: 6000, wet: 0.85, lvl: 1 },
    interior: { lp: 1100, wet: 0.35, lvl: 1 }, mine: { lp: 2400, wet: 0.9, lvl: 1 },
  };
  const M = { bus: null, mode: 'none', next: 0, bar: 0, t0: 0, old: [] };

  function mkMusicBus(mode, fade) {
    const cfg = BUSCFG[mode] || BUSCFG.day;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cfg.lp; lp.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    const ws = ctx.createGain(); ws.gain.value = cfg.wet;
    lp.connect(g); g.connect(busMusic); g.connect(ws); ws.connect(mverbSend);
    const t = ctx.currentTime;
    if (fade) g.gain.setTargetAtTime(cfg.lvl, t, fade); else g.gain.value = cfg.lvl;
    return { in: lp, g, lp, ws, mode, st: {} };
  }
  function fadeBus(b, fast) {
    const t = ctx.currentTime;
    b.g.gain.cancelScheduledValues(t); b.g.gain.setValueAtTime(Math.max(0.0001, b.g.gain.value), t);
    b.g.gain.setTargetAtTime(0.0001, t, fast ? 0.03 : 0.7);
    b.dead = t + (fast ? 0.2 : 4.5);
    M.old.push(b);
  }
  function reapBuses(t, force) {
    while (M.old.length > 3) { const b = M.old.shift(); try { b.g.disconnect(); } catch (e) { /* gone */ } }
    for (let i = M.old.length - 1; i >= 0; i--) if (force || t >= M.old[i].dead) { try { M.old[i].g.disconnect(); } catch (e) { /* gone */ } M.old.splice(i, 1); }
  }
  function lvl(b, v, t, tc) { b.g.gain.setTargetAtTime(Math.max(0.0001, v), t, tc || 2); }

  // voices: all take a bus as destination
  function pluck(b, t, f, vol, dur, bright) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.001;
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(bright || 1800, t); lp.frequency.exponentialRampToValueAtTime(Math.max(200, (bright || 1800) * 0.35), t + dur);
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(b.in);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }
  function pad(b, t, freqs, vol, dur, type, cut) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cut || 700;
    lp.connect(g); g.connect(b.in);
    freqs.forEach((f) => {
      [-4, 4].forEach((det) => {
        const o = ctx.createOscillator(); o.type = type || 'sawtooth'; o.frequency.value = f; o.detune.value = det + rnd(-1.5, 1.5);
        o.connect(lp); o.start(t); o.stop(t + dur + 0.1);
      });
    });
  }
  function chime(b, t, f, vol, dur) { fmBell(b.in, t, f, vol, dur, 3.01, 0.35); }
  function bass(b, t, f, vol, dur) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    o.connect(lp); lp.connect(g); g.connect(b.in); o.start(t); o.stop(t + dur + 0.05);
  }
  // driving low pulse with a filter "pluck"
  function pulse(b, t, f, vol, dur, open) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4; lp.frequency.setValueAtTime(open || 600, t); lp.frequency.exponentialRampToValueAtTime(90, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(b.in); o.start(t); o.stop(t + dur + 0.05);
  }
  function drone(b, t, freqs, vol, dur, cut) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.3); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cut || 220;
    lp.connect(g); g.connect(b.in);
    freqs.forEach((f, i) => { const o = ctx.createOscillator(); o.type = i ? 'sine' : 'sawtooth'; o.frequency.value = f; o.frequency.linearRampToValueAtTime(f * rnd(0.985, 1.015), t + dur); o.connect(lp); o.start(t); o.stop(t + dur + 0.05); });
  }
  function windSwell(b, t, vol, dur) {
    const n = noiseEnv(b.in, t, [[dur * 0.45, vol], [dur, 0]], 'bandpass', 500, 2, noiseP);
    n.f.frequency.linearRampToValueAtTime(rnd(900, 1300), t + dur * 0.5); n.f.frequency.linearRampToValueAtTime(400, t + dur);
  }
  // phrase player: returns its length in seconds
  function phrase(b, t, notes, root, beat, voice, vol, dur) {
    let tt = t;
    notes.forEach(([st, bt], i) => {
      const f = hz(root, st), d = dur || Math.max(1.2, bt * beat * 2.2);
      if (voice === 'chime') chime(b, tt, f, vol, d + 1);
      else if (voice === 'pad') pad(b, tt, [f], vol, bt * beat + 0.8, 'triangle', 1200);
      else pluck(b, tt, f, vol * (i === notes.length - 1 ? 1.1 : 1), d, 2200);
      tt += bt * beat;
    });
    return tt - t;
  }
  const sc = (root, steps) => steps.map((s) => hz(root, s));
  const SCALES = {
    menu: [146.83, 174.61, 220, 261.63, 293.66, 349.23, 440],
    morning: sc(D3, [0, 2, 4, 7, 9, 12, 14, 16]),       // D major pentatonic-ish, bright
    afternoon: sc(D3, [0, 2, 5, 7, 9, 10, 12, 14]),     // D dorian
    snow: sc(D3 * 2, [0, 3, 7, 10, 12, 14]),            // high, glassy
    dusk: sc(D3, [-5, -2, 0, 3, 5, 7]),                 // low minor
    night: [73.42, 110, 116.54, 146.83, 155.56, 220],
    nightLate: [73.42, 77.78, 110, 103.83, 146.83, 155.56],
  };
  const stG = () => { try { return NW.G && NW.G.state; } catch (e) { return null; } };

  const MODES = {
    menu(b, t, st) {
      const len = 8;
      if (st.n % 3 === 1) phrase(b, t + 0.5, st.n % 6 === 4 ? ANSWER : MOTIF, D3 * 2, 0.95, 'pluck', 0.12);
      else for (let i = 0; i < 3; i++) if (Math.random() < 0.75) { const f = pick(SCALES.menu); pluck(b, t + i * rnd(2.2, 2.8), f, 0.14, 3.2); if (Math.random() < 0.3) pluck(b, t + i * 2.5 + 0.4, f * 1.5, 0.06, 2.5); }
      pad(b, t, st.n % 2 ? [58.27, 87.31, 146.83] : [73.42, 110, 174.61], 0.03, 9, 'triangle');
      return len;
    },
    day(b, t, st) {
      const s = stG(), min = s && s.time ? s.time.min : 600, w = s && s.weather || {};
      const dusk = (NW.D && NW.D.DUSK) || 1080;
      const snowy = w.type === 'snow' || w.type === 'blizzard';
      const nearDusk = min > dusk - 120, morning = min < 11 * 60;
      const v = nearDusk ? 'dusk' : snowy ? 'snow' : morning ? 'morning' : 'afternoon';
      lvl(b, nearDusk ? U01(1 - (min - (dusk - 120)) / 160, 0.35, 0.8) : snowy ? 0.8 : 1, t, 3);
      const len = v === 'snow' ? 14 : v === 'dusk' ? 13 : 11;
      if (v === 'morning') {
        for (let i = 0; i < 4; i++) if (Math.random() < 0.6) pluck(b, t + i * 2.6 + rnd(0, 0.6), pick(SCALES.morning), 0.075, 3, 2400);
        pad(b, t, st.n % 2 ? [73.42, 110, 146.83] : [98, 146.83, 185], 0.016, 12, 'triangle');
      } else if (v === 'afternoon') {
        if (st.n % 4 === 2) phrase(b, t + 1, MOTIF_MAJ.slice(0, 5), D3 * 2, 1.1, 'pluck', 0.06);
        else for (let i = 0; i < 3; i++) if (Math.random() < 0.65) pluck(b, t + i * 3.4 + rnd(0, 1), pick(SCALES.afternoon), 0.075, 3);
        pad(b, t, st.n % 2 ? [73.42, 110, 146.83] : [65.41, 98, 130.81], 0.018, 12, 'triangle');
      } else if (v === 'snow') {
        for (let i = 0; i < 3; i++) if (Math.random() < 0.55) chime(b, t + i * 4.2 + rnd(0, 1.5), pick(SCALES.snow), 0.03, 4);
        pad(b, t, st.n % 2 ? [73.42, 110, 164.81] : [58.27, 87.31, 146.83], 0.02, 15, 'sine', 900);
      } else {
        if (st.n % 3 === 0) phrase(b, t + 1.5, MOTIF.slice(0, 3), D3, 1.6, 'pluck', 0.055);
        else for (let i = 0; i < 2; i++) if (Math.random() < 0.5) pluck(b, t + i * 5 + rnd(0, 2), pick(SCALES.dusk), 0.055, 4, 1200);
        pad(b, t, [73.42, 110, 174.61], 0.016, 14, 'triangle', 500);
      }
      st.variant = v;
      return len;
    },
    night(b, t, st) {
      const s = stG(), nightNo = s && s.time ? s.time.day : 1, late = nightNo >= 4;
      const T = tension, scl = late ? SCALES.nightLate : SCALES.night;
      const len = Math.max(4.5, 10 - T * 5);
      const notes = 1 + (T > 0.4 ? 1 : 0) + (T > 0.75 ? 1 : 0);
      for (let i = 0; i < notes; i++) {
        if (Math.random() > 0.45 + T * 0.4) continue;
        const tt = t + i * (len / notes) + rnd(0, 1), f = pick(scl);
        pluck(b, tt, f * 2, 0.05 + T * 0.04, 4, 1400 + T * 800);
        if (T > 0.4 && Math.random() < 0.5) pluck(b, tt + 0.13, f * 2 * 1.0595, 0.04, 3);
      }
      // motif fragment, low and slow, on calm stretches
      if (T < 0.5 && st.n % 4 === 3) phrase(b, t + 0.5, MOTIF.slice(0, 3 + (nightNo % 2)), D2 * 2, 1.9, 'pluck', 0.05);
      if (Math.random() < 0.25 + nightNo * 0.03) chime(b, t + rnd(1, len), hz(D3 * 4, pick([1, 6, 11])), 0.012 + T * 0.01, 3);
      const ch = T > 0.5 ? [55, 58.27, 82.41] : late ? [49, 69.3, 98] : (Math.random() < 0.5 ? [55, 82.41, 130.81] : [49, 73.42, 116.54]);
      pad(b, t, ch, 0.025 + T * 0.03, len + 1, 'sawtooth', 500 + T * 500);
      return len;
    },
    intro(b, t, st) {
      const chords = [[73.42, 110, 174.61], [58.27, 87.31, 146.83], [49, 98, 116.54], [55, 82.41, 138.59]];
      const len = 9;
      pad(b, t, chords[st.n % 4], 0.03, len + 1.5, 'triangle', 900);
      if (st.n % 4 === 0) windSwell(b, t, 0.05, len);
      if (st.n % 2 === 0) phrase(b, t + 0.6, MOTIF, D3 * 2, 1.4, 'chime', 0.05);
      else phrase(b, t + 0.6, ANSWER, D3 * 2, 1.4, 'pluck', 0.07);
      bass(b, t, chords[st.n % 4][0], 0.12, len);
      return len;
    },
    finale(b, t, st) {
      const beat = 0.3, len = beat * 8;
      const age = t - st.t0, I = Math.min(1, age / 150 + tension * 0.4);
      lvl(b, 0.7 + I * 0.35, t, 2);
      const roots = [36.71, 29.14, 32.7, 27.5]; // D, Bb, C, A
      const r = roots[Math.floor(st.n / 2) % 4];
      for (let i = 0; i < 8; i++) pulse(b, t + i * beat, r * 2, (i % 4 === 0 ? 0.12 : 0.07) * (0.7 + I * 0.4), beat * 0.9, 300 + I * 700 + (i % 4 === 0 ? 300 : 0));
      if (I > 0.35) for (let i = 0; i < 4; i++) bass(b, t + i * beat * 2, r, 0.12, beat * 1.6);
      if (st.n % 4 === 0) pad(b, t, [r * 2, r * 3, r * 2 * 1.189], 0.025 + I * 0.02, len * 4, 'sawtooth', 400 + I * 600);
      if (st.n % 8 === 2) phrase(b, t, MOTIF, D2, beat * 2, 'pad', 0.03 + I * 0.02);
      if (I > 0.6) for (let i = 0; i < 16; i++) pluck(b, t + i * beat / 2, hz(r * 16, i % 2 ? 1 : 0), 0.012 * I, 0.25, 3000);
      if (I > 0.5 && st.n % 2 === 1) SFX.heartbeat(b.in, t + beat * 4);
      return len;
    },
    ending_good(b, t, st) {
      const len = 7;
      const chords = [[73.42, [0, 4, 7, 11]], [98, [0, 4, 7]], [61.74, [0, 3, 7]], [55, [0, 4, 7]], [73.42, [0, 4, 7, 14]]];
      const [r, tri] = chords[st.n % 5];
      pad(b, t, tri.map((x) => hz(r * 2, x)), 0.024, len + 2, 'triangle', 1500);
      bass(b, t, r, 0.15, len);
      if (st.n % 5 === 0) phrase(b, t + 0.5, MOTIF_MAJ, D3 * 2, 1, 'chime', 0.05);
      else for (let i = 0; i < 3; i++) pluck(b, t + i * 2.2 + rnd(0, 0.4), hz(r * 4, pick(tri)), 0.05, 3.5, 2400);
      return len;
    },
    ending_bad(b, t, st) {
      const len = 10;
      pad(b, t, st.n % 2 ? [55, 77.78, 110] : [73.42, 103.83, 146.83], 0.026, len + 2, 'sawtooth', 450);
      if (st.n % 3 === 0) phrase(b, t + 1, MOTIF_BAD, D3, 1.6, 'pluck', 0.06);
      else if (Math.random() < 0.6) chime(b, t + rnd(1, 6), hz(D3 * 2, pick([1, 6, 8])), 0.025, 5);
      drone(b, t, [36.71, 51.91], 0.04, len + 2, 160);
      return len;
    },
    interior(b, t, st) {
      const len = 9;
      pad(b, t, st.n % 2 ? [73.42, 110, 174.61] : [65.41, 98, 155.56], 0.03, len + 1.5, 'triangle', 600);
      if (st.n % 4 === 1) phrase(b, t + 0.8, MOTIF.slice(0, 4), D3, 1.5, 'pluck', 0.08);
      else for (let i = 0; i < 3; i++) if (Math.random() < 0.6) pluck(b, t + i * 2.8 + rnd(0, 0.8), pick(SCALES.dusk) * 2, 0.07, 3.5, 1200);
      return len;
    },
    mine(b, t, st) {
      const len = 10;
      drone(b, t, [36.71, 36.9, 73.6], 0.07, len + 3, 180);
      for (let i = 0, n = 1 + Math.floor(Math.random() * 3); i < n; i++) {
        const tt = t + rnd(0.5, len), f = rnd(900, 1500);
        const g = ctx.createGain(); g.gain.value = 0.5; g.connect(b.in); tone(g, tt, 0.1, 'sine', f, f * 2, 0.08, 0.002);
      }
      if (st.n % 3 === 2) pad(b, t + 2, [55, 58.27], 0.03, 7, 'sawtooth', 260);
      if (st.n % 5 === 4) phrase(b, t + 1, MOTIF.slice(0, 3), D2, 2.6, 'chime', 0.02);
      if (Math.random() < 0.3) windSwell(b, t + rnd(0, 4), 0.03, 5);
      return len;
    },
  };
  const U01 = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  A.setMusic = function (mode) { A.musicMode = mode; };
  A.updateMusic = function () {
    if (!A.ready) return;
    const t = ctx.currentTime, mode = A.musicMode;
    reapBuses(t); reap(t);
    if (mode !== M.mode) {
      if (M.bus) fadeBus(M.bus, M.old.length >= 3);
      M.bus = MODES[mode] ? mkMusicBus(mode, mode === 'finale' ? 0.4 : 1.2) : null;
      M.mode = mode; M.next = t + (M.bus && M.old.length ? 0.6 : 0.1); M.bar = 0;
      if (M.bus) M.bus.st = { n: 0, t0: t };
    }
    const b = M.bus;
    if (!b) return;
    if (M.next < t) M.next = t + 0.05;
    for (let guard = 0; guard < 2 && M.next < t + 0.3; guard++) {
      let len = 4;
      try { len = MODES[mode](b, M.next, b.st); } catch (e) { if (A.errors.length < 50) A.errors.push('music ' + mode + ': ' + e.message); }
      b.st.n++; M.next += Math.max(1, len || 4);
    }
    if (mode === 'night' && tension > 0.55) {
      if (nextPulse < t) nextPulse = t + 0.1;
      if (nextPulse < t + 0.25) { const g = ctx.createGain(); g.gain.value = 0.35 * tension; g.connect(b.in); SFX.heartbeat(g, nextPulse); nextPulse += 1.25 - tension * 0.45; }
    }
  };
  A.musicModes = () => Object.keys(MODES);
  A.stats = () => ({ mode: M.mode, buses: (M.bus ? 1 : 0) + M.old.length, bar: M.bus ? M.bus.st.n : 0, variant: M.bus && M.bus.st.variant, lastAmb: A.lastAmb || null });

  // Render offline (for checks): fn(dest) schedules into a fresh graph; returns a Promise<AudioBuffer>
  function renderOffline(sec, fn) {
    if (!A.ready || !window.OfflineAudioContext) return Promise.resolve(null);
    const saved = [ctx, master, busMusic, busSfx, busAmb, reverbSend, mverbSend, averbSend, tension];
    const off = new OfflineAudioContext(2, Math.ceil(ctx.sampleRate * sec), ctx.sampleRate);
    try {
      ctx = off; mkBuses(off.destination);
      master.gain.value = A.vol.master; busMusic.gain.value = A.vol.music * 0.9; busSfx.gain.value = A.vol.sfx; busAmb.gain.value = A.vol.amb;
      fn(off);
    } finally { [ctx, master, busMusic, busSfx, busAmb, reverbSend, mverbSend, averbSend, tension] = saved; }
    return off.startRendering();
  }
  A.renderSfx = (name, o, sec) => renderOffline(sec || 3, () => { o = o || {}; SFX[name](out(o.pan, o.vol == null ? 1 : o.vol, o.wet), 0.02, o); });
  A.renderMusic = (mode, sec, tens) => renderOffline(sec || 20, () => {
    tension = tens || 0;
    const b = mkMusicBus(mode, 0); b.st = { n: 0, t0: 0 };
    for (let t = 0.05; t < sec;) t += Math.max(1, MODES[mode](b, t, b.st) || 4), b.st.n++;
  });
  A.renderAmb = (kind, sec) => renderOffline(sec || 5, () => AMB[kind](ambOut(0, 0.3, 0.9, 0), 0.02));

  A.now = () => (ctx ? ctx.currentTime : 0);
})(window.NW);
