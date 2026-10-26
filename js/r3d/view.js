'use strict';
// World manager: builds 3D areas from the game's areas, keeps the right ones visible, syncs every
// entity (animals, monsters, visitors, guests, the dog, day events, module objects) from game state,
// gathers light sources, places the first-person camera, and serves window/peephole views.
(function (NW) {
  const THREE = window.THREE, R3 = NW.R3;
  if (!THREE || !R3) return;
  const V = R3.View = { override: null };
  const U = NW.U, D = NW.D, W = NW.World;
  const G = () => NW.G;
  const K = R3.K;
  const v3 = new THREE.Vector3();

  // ------------------------------------------------------------------ builders (with fallbacks)
  const groups = {};             // areaId -> { group, update, kind }
  let worldSeed = null, buildQueue = [];
  V.groups = groups;
  function hexRGB(hex) { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }
  V.hexRGB = hexRGB;

  function buildArea(id) {
    if (groups[id]) return groups[id];
    const a = W.get(id);
    let out = null;
    try {
      if (a.kind === 'forest') out = R3.Forest ? R3.Forest.buildArea(a) : R3.Fallback.forest(a);
      else if (a.kind === 'room') out = groups.__cabin || (groups.__cabin = R3.Cabin ? R3.Cabin.buildInterior() : R3.Fallback.cabinInterior());
      else out = (R3.Props && R3.Props.buildInterior) ? R3.Props.buildInterior(id, a) : R3.Fallback.interior(id, a);
    } catch (e) { console.error('[r3 build ' + id + ']', e); out = R3.Fallback.interior(id, a); }
    out.kind = a.kind;
    if (a.kind === 'forest') {
      // landmarks and fixed objects that the forest builder doesn't own
      const extras = [];
      a.objs.forEach((o) => {
        if (R3.Forest && R3.Forest.owns && R3.Forest.owns(o)) return;
        if (!R3.Forest && ['tree', 'deadtree', 'rock', 'stump', 'bush', 'branches', 'herb', 'mushrooms', 'reeds'].includes(o.type)) return;
        if (o.type === 'cabin_ext' || o.type === 'cabin_annex' || o.type === 'extdoor' || o.type === 'woodpile_ext' || o.type === 'chopblock') return; // cabin exterior
        const key = o.type === 'struct' ? 'struct:' + o.sprite : o.type === 'loot' ? 'loot:' + o.lm : o.type;
        const p = makeProp(key, o, id);
        if (p) { out.group.add(p.obj); extras.push({ p, o }); }
      });
      if (a.lm === 'cabin') {
        const ext = R3.Cabin ? R3.Cabin.buildExterior(a) : R3.Fallback.cabinExterior(a);
        out.group.add(ext.group); out.ext = ext;
      }
      const up0 = out.update;
      out.update = (dt, ctx) => { if (up0) up0(dt, ctx); extras.forEach((x) => x.p.update && x.p.update(dt, x.o, ctx)); if (out.ext && out.ext.update) out.ext.update(dt, ctx); };
    }
    if (!out.group.parent) R3.scene.add(out.group);
    out.group.visible = false;
    groups[id] = out;
    return out;
  }
  function makeProp(key, o, areaId) {
    try {
      const r = R3.Props && R3.Props.make(key, o, areaId);
      if (r) { if (!r.obj.userData.placed) { R3.toWorld(areaId, o.x, o.y, v3); r.obj.position.copy(v3); } return r; }
    } catch (e) { console.error('[r3 prop ' + key + ']', e); }
    const f = R3.Fallback.prop(key, o); R3.toWorld(areaId, o.x, o.y, v3); f.obj.position.copy(v3); return f;
  }
  V.makeProp = makeProp;

  function resetWorld() {
    for (const id in groups) { const g = groups[id]; if (g && g.group) { R3.scene.remove(g.group); disposeTree(g.group); } delete groups[id]; }
    ents.forEach((e) => removeEnt(e)); ents.clear();
    if (outer) { R3.scene.remove(outer.group); disposeTree(outer.group); outer = null; }
    buildQueue = [];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) buildQueue.push(D.areaId(x, y));
  }
  function disposeTree(o) {
    o.traverse((c) => { if (c.geometry && !c.geometry.userData.shared) c.geometry.dispose(); });
  }
  V.reset = resetWorld;
  let outer = null;

  // ------------------------------------------------------------------ visibility
  let curKey = null;
  function visibleSet(area) {
    const out = [];
    if (area.kind === 'forest') {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = area.ax + dx, y = area.ay + dy; if (x >= 0 && y >= 0 && x < 5 && y < 5) out.push(D.areaId(x, y)); }
    } else if (area.kind === 'room') out.push(area.id);
    else {
      out.push(area.id);
      // the fire-tower cab hangs above the real forest
      if (area.id === 'in_tower') ['f_0_0', 'f_1_0', 'f_0_1', 'f_1_1', 'f_2_0', 'f_2_1'].forEach((i) => out.push(i));
    }
    return out;
  }

  // ------------------------------------------------------------------ entities
  const ents = new Map();
  let frameNo = 0;
  const ids = new WeakMap(); let idSeq = 1;
  const oid = (o) => { let i = ids.get(o); if (!i) { i = idSeq++; ids.set(o, i); } return i; };
  function removeEnt(e) { if (e.obj && e.obj.parent) e.obj.parent.remove(e.obj); if (e.dispose) e.dispose(); }
  // want(key, make) -> entity; make() returns { obj, update(dt, st, ctx)?, dispose? }
  function want(key, make) {
    let e = ents.get(key);
    if (!e) {
      let r = null;
      try { r = make(); } catch (er) { console.error('[r3 ent ' + key + ']', er); }
      if (!r || !r.obj) return null;
      e = Object.assign({ key }, r);
      ents.set(key, e); R3.scene.add(e.obj);
    }
    e.seen = frameNo;
    return e;
  }
  const creature = (kind, opts) => () => (R3.Creatures && R3.Creatures.make(kind, opts || {})) || R3.Fallback.creature(kind, opts || {});
  V.ents = ents;

  // place an entity at game coords of an area, facing a game-space direction
  function place(e, areaId, x, y, yaw, lift) {
    R3.toWorld(areaId, x, y, v3);
    e.obj.position.set(v3.x, v3.y + (lift || 0), v3.z);
    if (yaw != null) e.obj.rotation.y = yaw;
  }
  const yawFrom = (dx, dy) => Math.atan2(dx, dy); // model faces +Z (south) at 0
  function smoothYaw(e, target, dt, k) {
    let d = target - e.obj.rotation.y; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    e.obj.rotation.y += d * Math.min(1, dt * (k || 8));
  }

  // where cabin-related things go, in each representation (exterior f_2_2 / interior)
  function anchors() {
    const ext = groups.f_2_2 && groups.f_2_2.ext, int = groups.__cabin;
    return { ext: (ext && ext.anchors) || null, int: (int && int.anchors) || null };
  }

  function syncEntities(dt, ctx) {
    frameNo++;
    const g = G(), s = g.state, a = g.area;
    const vis = ctx.visible;
    // ---- dynamic objects of the current area (+ day events and module objects of neighbours)
    const dyn = g.dynamicObjects();
    dyn.forEach((o) => syncDyn(o, a.id, dt, ctx));
    if (a.kind === 'forest') {
      vis.forEach((nid) => {
        if (nid === a.id) return;
        try { NW.Events.objectsFor(nid).forEach((o) => syncDyn(o, nid, dt, ctx)); } catch (e) { /* ignore */ }
        NW.Hooks.collect('objects', nid, W.get(nid)).forEach((o) => { if (o && typeof o.x === 'number') { o.type = 'mod'; syncDyn(o, nid, dt, ctx); } });
      });
    }
    // ---- wildlife (current forest area)
    if (a.kind === 'forest' && s.animals.area === a.id) {
      s.animals.list.forEach((an) => {
        const e = want('an:' + oid(an), creature(an.type, { an }));
        if (!e) return;
        const lx = e.lastX == null ? an.x : e.lastX, ly = e.lastY == null ? an.y : e.lastY;
        const dx = an.x - lx, dy = an.y - ly;
        place(e, a.id, an.x, an.y, null, an.flying ? 1.5 + Math.max(0, -an.vy || 0) * 0 : 0);
        if (an.flying) e.obj.position.y += Math.min(8, (e.flyT = (e.flyT || 0) + dt) * 2.2);
        if (Math.hypot(dx, dy) > 0.05) smoothYaw(e, yawFrom(dx, dy), dt, 10); else if (e.lastX == null) e.obj.rotation.y = an.face < 0 ? -Math.PI / 2 : Math.PI / 2;
        e.lastX = an.x; e.lastY = an.y;
        e.update && e.update(dt, { moving: !!an.moving || Math.hypot(dx, dy) > 0.05, dead: !!an.dead, flying: !!an.flying, grazing: !!an.grazing, angry: !!an.angry, state: an.state, speed: Math.hypot(dx, dy) / Math.max(dt, 1e-3) * K }, ctx);
      });
    }
    // ---- Pale Stag
    const sg = s.night.stag;
    if ((sg.stage === 'watching' || sg.stage === 'hunting') && vis.includes(sg.area)) {
      const e = want('stag', creature('stag'));
      if (e) { place(e, sg.area, sg.x, sg.y); const p = s.player; smoothYaw(e, yawFrom(p.x - sg.x, p.y - sg.y), dt, 4); e.update && e.update(dt, { stage: sg.stage, moving: sg.stage === 'hunting' }, ctx); ctx.addLight({ key: 'stag', x: e.obj.position.x, y: e.obj.position.y + 2.2, z: e.obj.position.z, color: [0.75, 0.8, 0.9], intensity: 1.6, range: 7, flicker: 'pulse', glow: 1.4, glowIntensity: 0.25 }); }
    }
    // ---- cabin-related night entities, in both representations
    const anc = anchors();
    const outside = vis.includes('f_2_2'), inside = a.kind === 'room';
    const n = s.night;
    // visitor on the porch
    if (n.vis) {
      const v = s.visitors[n.vis.vid];
      if (v) {
        const vis2 = NW.Night.visual(v);
        const mk = creature('human', { app: v.app, visitor: true });
        const st = { pose: 'stand', breath: vis2.breath, snowy: vis2.snowy, wet: vis2.wet, blinks: vis2.blinks, mimic: v.mimic, eyeGlow: v.mimic && v.tells.includes('nobreath'), talking: (NW.UI.talkT || 0) > 0 };
        if (outside && anc.ext && anc.ext.porchVisitor) { const e = want('vis:ext:' + v.id, mk); if (e) { e.obj.position.copy(anc.ext.porchVisitor.pos); e.obj.rotation.y = anc.ext.porchVisitor.yaw; e.update && e.update(dt, st, ctx); } }
        if (inside && anc.int && anc.int.porchVisitor) { const e = want('vis:int:' + v.id, mk); if (e) { e.obj.position.copy(anc.int.porchVisitor.pos); e.obj.rotation.y = anc.int.porchVisitor.yaw; e.update && e.update(dt, st, ctx); } }
        if (vis2.footprints) { if (outside && anc.ext && anc.ext.porchVisitor) footTrail('ext', anc.ext, v); if (inside && anc.int && anc.int.porchVisitor) footTrail('int', anc.int, v); }
      }
    }
    // Scratcher approaching / at a door
    const sc = n.sc;
    if (sc.stage === 'approach' || sc.stage === 'door') {
      const f = sc.stage === 'approach' ? Math.min(1, sc.t / 14) : 1;
      if (outside) {
        const door = sc.door === 'front' ? { x: 240, y: 186 } : { x: 360, y: 172 }, start = sc.door === 'front' ? { x: 240, y: 270 } : { x: 470, y: 180 };
        const e = want('scr:ext', creature('scratcher'));
        if (e) { place(e, 'f_2_2', U.lerp(start.x, door.x, f), U.lerp(start.y, door.y, f)); e.obj.rotation.y = yawFrom(door.x - start.x, door.y - start.y); e.update && e.update(dt, { stage: sc.stage, moving: sc.stage === 'approach', clawing: sc.stage === 'door' }, ctx); }
      }
      if (inside && anc.int) {
        const d = anc.int[sc.door === 'front' ? 'frontDoorOutside' : 'backDoorOutside'];
        if (d) {
          const e = want('scr:int', creature('scratcher'));
          if (e) { const st0 = d.approach || d.pos; e.obj.position.lerpVectors(st0, d.pos, f); e.obj.rotation.y = d.yaw; e.update && e.update(dt, { stage: sc.stage, moving: sc.stage === 'approach', clawing: sc.stage === 'door' }, ctx); }
        }
      }
    }
    // Light Hunter: circling the clearing, or pressed against a window
    const lh = n.lh;
    if (n.active && (lh.stage === 'circling' || lh.stage === 'window')) {
      const st = { stage: lh.stage };
      if (outside) {
        const e = want('lh:ext', creature('lighthunter'));
        if (e) {
          if (lh.stage === 'window' && anc.ext && anc.ext.windows && anc.ext.windows[lh.wid]) { const w = anc.ext.windows[lh.wid]; e.obj.position.copy(w.outside); e.obj.rotation.y = w.yaw + Math.PI; }
          else { const ang = ctx.t * 0.25; place(e, 'f_2_2', 240 + Math.cos(ang) * 230, 120 + Math.sin(ang) * 140); e.obj.rotation.y = ang + Math.PI; }
          e.update && e.update(dt, st, ctx);
          ctx.addLight({ key: 'lh', x: e.obj.position.x, y: e.obj.position.y + 2.4, z: e.obj.position.z, color: [0.85, 0.9, 1.0], intensity: 4, range: 6, flicker: 'pulse', glow: 1.8, glowIntensity: 0.35 });
        }
      }
      if (inside && anc.int && anc.int.windows) {
        if (lh.stage === 'window' && anc.int.windows[lh.wid]) {
          const w = anc.int.windows[lh.wid], e = want('lh:int', creature('lighthunter'));
          if (e) { e.obj.position.copy(w.outside); e.obj.rotation.y = w.yaw + Math.PI; e.update && e.update(dt, st, ctx); ctx.addLight({ key: 'lhi', x: w.outside.x, y: w.outside.y + 1.6, z: w.outside.z, color: [0.85, 0.9, 1.0], intensity: 3, range: 6, flicker: 'pulse', glow: 1.2, glowIntensity: 0.3 }); }
        } else if (lh.stage === 'circling' && anc.int.ring) {
          const e = want('lh:int', creature('lighthunter'));
          if (e) { const ang = ctx.t * 0.2; const r = anc.int.ring; e.obj.position.set(r.x + Math.cos(ang) * r.r, r.y, r.z + Math.sin(ang) * r.r * 0.7); e.obj.rotation.y = -ang; e.update && e.update(dt, st, ctx); }
        }
      }
    }
    // Siphon on the roof
    if (n.si.stage === 'roof') {
      if (outside && anc.ext && anc.ext.roof) { const e = want('si:ext', creature('siphon')); if (e) { e.obj.position.copy(anc.ext.roof.pos); e.obj.rotation.y = anc.ext.roof.yaw || 0; e.update && e.update(dt, {}, ctx); } }
    }
    // Dark Dweller tendrils in dark cabin rooms (same rule as the 2D view)
    if (inside && n.active && n.dd.on && n.dd.meter >= 30 && anc.int && anc.int.rooms) {
      const L = NW.Survival.light.room;
      const k = Math.min(1, (n.dd.meter - 30) / 70);
      for (const rid in anc.int.rooms) {
        if (!(L[rid] < 0.3)) continue;
        const e = want('dd:' + rid, creature('dweller', { room: anc.int.rooms[rid] }));
        if (e) { const r = anc.int.rooms[rid]; e.obj.position.copy(r.center); e.update && e.update(dt, { k, corners: r.corners, eyes: k > 0.5 }, ctx); }
      }
    }
    // the dog at home
    // (handled by dynamic objects: type 'dog')
    // ---- muzzle flash & tracers
    g.fx.forEach((f) => {
      if (f.type === 'flash') { R3.toWorld(a.id, f.x, f.y, v3); ctx.addLight({ x: v3.x, y: v3.y + 1.3, z: v3.z, color: [1, 0.85, 0.55], intensity: 60 * f.life * 8, range: 12, glow: 0.7, glowIntensity: f.life * 10 }); }
      if (f.type === 'tracer') { const e = want('tr:' + oid(f), () => R3.Fallback.tracer()); if (e) { R3.toWorld(a.id, f.x1, f.y1, v3); const p1 = v3.clone(); R3.toWorld(a.id, f.x2, f.y2, v3); e.set(p1.setY(p1.y + 1.35), v3.setY(v3.y + 1.0), f.life * 8); } }
    });
    // remove what no longer exists
    for (const [k, e] of ents) if (e.seen !== frameNo) { removeEnt(e); ents.delete(k); }
  }
  function footTrail(which, anc, v) {
    const e = want('fp:' + which + ':' + v.id, () => R3.Fallback.footprints(anc.porchVisitor, U.strHash(v.id) % 2));
    return e;
  }

  // dynamic objects -> entities
  function syncDyn(o, areaId, dt, ctx) {
    const s = G().state;
    let e = null;
    switch (o.type) {
      case 'event': {
        const ev = o.ev;
        if (ev.type === 'hiker') { e = want('ev:' + ev.id, creature('human', { app: HIKER_APP })); if (e) { place(e, areaId, o.x, o.y, 0); e.update && e.update(dt, { pose: 'sit', blinks: true }, ctx); } return; }
        if (ev.type === 'dog') { e = want('ev:' + ev.id, creature('dog')); if (e) { place(e, areaId, o.x, o.y, Math.PI / 2); e.update && e.update(dt, { pose: 'trapped' }, ctx); } return; }
        if (ev.type === 'injured') { e = want('ev:' + ev.id, creature(ev.data.animal === 'fox' ? 'fox' : 'deer')); if (e) { place(e, areaId, o.x, o.y, Math.PI / 2); e.update && e.update(dt, { injured: true, pose: 'lie' }, ctx); } return; }
        const key = 'ev:' + ev.type + (ev.type === 'anomaly' ? ':' + ev.data.kind : '');
        e = want('ev:' + ev.id, () => makeProp(key, o, areaId));
        if (e) { place(e, areaId, o.x, o.y); e.update && e.update(dt, o, ctx); }
        if (ev.type === 'anomaly' && ev.data.kind === 'warmfire') { R3.toWorld(areaId, o.x, o.y, v3); ctx.addLight({ key: 'wf' + ev.id, x: v3.x, y: v3.y + 0.4, z: v3.z, color: [1, 0.5, 0.18], intensity: 5, range: 6, flicker: 'fire', glow: 0.6 }); }
        return;
      }
      case 'cairn': e = want('cairn:' + areaId, () => makeProp('cairn', o, areaId)); if (e) place(e, areaId, o.x, o.y); return;
      case 'drop': e = want('drop:' + oid(o.d), () => makeProp('drop', o, areaId)); if (e) { place(e, areaId, o.x, o.y); e.update && e.update(dt, o, ctx); } return;
      case 'carcass': return; // the animal entity itself shows the dead pose
      case 'dog': {
        const d = s.dog;
        e = want('dog', creature('dog'));
        if (e) {
          const lx = e.lastX == null ? d.x : e.lastX, ly = e.lastY == null ? d.y : e.lastY;
          place(e, areaId, d.x, d.y);
          if (Math.hypot(d.x - lx, d.y - ly) > 0.05) smoothYaw(e, yawFrom(d.x - lx, d.y - ly), dt, 8);
          e.lastX = d.x; e.lastY = d.y;
          e.update && e.update(dt, { pose: d.status === 'home' && !G().dogMoving ? 'lie' : G().dogMoving ? 'walk' : 'stand', moving: G().dogMoving }, ctx);
        }
        return;
      }
      case 'guest': {
        const v = s.visitors[o.gs.vid]; if (!v) return;
        e = want('guest:' + v.id, creature('human', { app: v.app }));
        if (e) { place(e, areaId, o.x, o.y, Math.PI * 0.85); e.update && e.update(dt, { pose: 'sit', blinks: true, breath: false }, ctx); }
        return;
      }
      case 'mod': {
        const k = o.key3d || ((o.m3d || 'mod') + ':' + areaId + ':' + Math.round(o.x) + ':' + Math.round(o.y));
        if (o.person) { e = want(k, creature('human', { app: o.person.app, npc: o.person.id })); if (e) { place(e, areaId, o.x, o.y, o.person.yaw != null ? o.person.yaw : 0); e.update && e.update(dt, Object.assign({ pose: 'stand', blinks: true, breath: s.weather.temp < 3 && areaId.startsWith('f_') }, o.person.st || {}), ctx); } return; }
        if (!o.m3d && !o.draw) return;
        e = want(k, () => makeProp(o.m3d || 'mod', o, areaId));
        if (e) { if (!e.obj.userData.fixed) place(e, areaId, o.x, o.y, o.yaw3d); e.update && e.update(dt, o, ctx); }
        return;
      }
    }
  }
  const HIKER_APP = { coat: 0xd2a838, skin: 0xd49c76, hair: 0x714326, hat: 'beanie', hatColor: 0xa5352e, pants: 0x1a253c };

  // ------------------------------------------------------------------ lights from game logic
  function gatherLights(ctx) {
    const g = G(), s = g.state, a = g.area, Sv = NW.Survival;
    // the ranger's lantern: outdoors after dark, and in dark interiors (not inside the cabin: the cabin's
    // darkness is a game mechanic and the 2D game gives no personal light there either)
    const day = Sv.daylight();
    const lanternOn = (a.kind === 'forest' && day < 0.55) || (a.kind === 'interior' && ctx.interiorDark > 0.35);
    V.lantern = lanternOn;
    if (lanternOn) {
      const cam = R3.camera, f = R3.Controls.facing();
      const p = cam.position;
      ctx.addLight({ key: 'lantern', x: p.x + f.x * 0.35 + f.y * 0.25, y: p.y - 0.55, z: p.z + f.y * 0.35 - f.x * 0.25, color: [1.0, 0.62, 0.3], intensity: 7.5 * (1 - day * 0.5), range: 13, flicker: 'lantern', shadow: 2, glow: 0.22, glowIntensity: 0.9 });
    }
    // module lights (2D light lists) -> pooled lights
    const addMod = (areaId, l) => { if (!l || !(l.r > 0)) return; R3.toWorld(areaId, l.x, l.y, v3); const c = hexRGB(l.col || '#ffb746'); ctx.addLight({ x: v3.x, y: v3.y + (l.h3d != null ? l.h3d : 1.0), z: v3.z, color: c, intensity: (l.a || 0.8) * 4, range: Math.max(2, l.r * K * 2.4), flicker: l.flicker3d || 'fire', glow: l.glow3d != null ? l.glow3d : 0.35, glowIntensity: (l.ga != null ? l.ga * 2 : 0.3) }); };
    ctx.visible.forEach((id) => {
      const ar = W.get(id);
      NW.Hooks.collect('lights', ar, ctx.t).forEach((l) => addMod(id, l));
      if (ar.kind === 'interior' && ar.def && ar.def.lights) ar.def.lights.forEach((l) => addMod(id, Object.assign({ flicker3d: 'lantern' }, l)));
    });
  }

  // ------------------------------------------------------------------ camera
  let camArea = null;
  const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3();
  function placeCamera(dt, ctx) {
    const g = G(), s = g.state, p = s.player, C = R3.Controls;
    R3.toWorld(g.area.id, p.x, p.y - 3, camTarget);
    camTarget.y += R3.EYE;
    // head bob and a slight breath sway
    const bobA = g.moving ? (g.sprinting ? 0.05 : 0.032) : 0.0;
    camTarget.y += Math.sin(C.bob * 2) * bobA + Math.sin(ctx.t * 1.1) * 0.006;
    const side = Math.cos(C.bob) * bobA * 0.6;
    const f = C.facing();
    camTarget.x += -f.y * side; camTarget.z += f.x * side;
    // cold shiver (2D game shook the screen below 34.5 C)
    if (p.temp < 34.5 && NW.settings.shake) { camTarget.x += Math.sin(ctx.t * 40) * 0.004; }
    if (g.shake > 0 && NW.settings.shake) { camTarget.x += (Math.random() - 0.5) * g.shake * 0.01; camTarget.y += (Math.random() - 0.5) * g.shake * 0.01; }
    const jump = camPos.distanceTo(camTarget);
    if (camArea !== g.area.id || jump > 3) {
      // area change: snap if far (different place), glide if it's a doorway hop inside the same building
      if (jump > 3) camPos.copy(camTarget); camArea = g.area.id;
    }
    camPos.lerp(camTarget, Math.min(1, dt * 18));
    if (camPos.distanceTo(camTarget) > 1.5) camPos.copy(camTarget);
    R3.camera.position.copy(camPos);
    R3.camera.rotation.set(C.pitch, -C.yaw, 0, 'YXZ');
    R3.camera.fov = g.sprinting ? 76 : 72; R3.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ frame
  V.ctx = null;
  V.frame = function (t, dt) {
    const g = G();
    R3.lastDt = dt;
    if (!V.initDone) V.init();
    const playing = (g.mode === 'play' || g.mode === 'dead') && g.state && g.area;
    if (!playing) return V.menuFrame(t, dt);
    const s = g.state;
    if (worldSeed !== s.seed) { resetWorld(); worldSeed = s.seed; }
    // build a queued forest area per frame so walking around never hitches
    if (buildQueue.length) { const id = buildQueue.shift(); try { buildArea(id); } catch (e) { console.error(e); } }
    if (!outer) { try { outer = R3.Forest && R3.Forest.buildOuter ? R3.Forest.buildOuter() : { group: new THREE.Group() }; R3.scene.add(outer.group); } catch (e) { console.error(e); outer = { group: new THREE.Group() }; } }
    const a = g.area;
    const visible = visibleSet(a);
    const key = visible.join(',');
    visible.forEach((id) => buildArea(id));
    if (key !== curKey) {
      curKey = key;
      for (const id in groups) if (groups[id] && groups[id].group) groups[id].group.visible = false;
      visible.forEach((id) => { const gr = groups[id]; if (gr) gr.group.visible = true; });
      if (a.kind === 'room' && groups.__cabin) groups.__cabin.group.visible = true;
      if (outer) outer.group.visible = a.kind === 'forest' || a.id === 'in_tower';
    }
    R3.Controls.update(dt);
    R3.Lights.begin();
    const ctx = V.ctx = { t, dt, state: s, area: a, indoor: a.kind !== 'forest' && a.id !== 'in_tower', deep: a.id === 'in_mine', visible, cam: R3.camera, q: R3.q(), addLight: R3.Lights.add, interiorDark: a.kind === 'interior' ? Math.max(a.dark || 0, 1 - NW.Survival.daylight()) : 0 };
    placeCamera(dt, ctx);
    R3.Atmos.update(dt, R3.camera, ctx);
    // area updates (lights, animated parts, resources)
    const done = new Set();
    visible.forEach((id) => { const gr = id.startsWith('room_') ? groups.__cabin : groups[id]; if (!gr || done.has(gr)) return; done.add(gr); try { gr.update && gr.update(dt, ctx); } catch (e) { console.error('[r3 update ' + id + ']', e); } });
    if (outer && outer.update) outer.update(dt, ctx);
    gatherLights(ctx);
    syncEntities(dt, ctx);
    if (R3.Creatures && R3.Creatures.viewmodelUpdate) R3.Creatures.viewmodelUpdate(dt, ctx);
    NW.Hooks.emit('r3Frame', ctx);
    // first-person camera, or a fixed view through a window / the peephole
    const cam = V.override ? V.overrideCamera(dt, ctx) : R3.camera;
    R3.render(cam, t);
  };

  // ------------------------------------------------------------------ window / peephole / reveal views
  const viewCam = new THREE.PerspectiveCamera(60, 1.5, 0.05, 300); viewCam.rotation.order = 'YXZ';
  V.overrideCamera = function (dt, ctx) {
    const o = V.override, anc = anchors();
    viewCam.aspect = R3.camera.aspect;
    if (o.type === 'window') {
      const inside = ctx.area.kind === 'room';
      const w = inside ? anc.int && anc.int.windows && anc.int.windows[o.wid] : anc.ext && anc.ext.windows && anc.ext.windows[o.wid];
      if (w && w.view) { viewCam.position.copy(w.view.pos); viewCam.rotation.set(w.view.pitch || -0.05, w.view.yaw, 0, 'YXZ'); viewCam.fov = 64; }
      else return R3.camera;
    } else if (o.type === 'peephole') {
      const pp = anc.int && anc.int.peephole;
      if (!pp) return R3.camera;
      viewCam.position.copy(pp.pos); viewCam.rotation.set(pp.pitch || 0, pp.yaw, 0, 'YXZ'); viewCam.fov = 105;
    } else if (o.type === 'reveal') {
      const pp = anc.int && anc.int.peephole;
      if (!pp) return R3.camera;
      viewCam.position.copy(pp.pos); viewCam.rotation.set(0.02, pp.yaw, 0, 'YXZ'); viewCam.fov = 62 + Math.sin(ctx.t * 37) * 1.5;
    }
    viewCam.updateProjectionMatrix(); viewCam.updateMatrixWorld();
    return viewCam;
  };

  // ------------------------------------------------------------------ menu scene & cinematics
  // A static or scripted view of the world without the player: the main menu backdrop, the credits
  // backdrop, and the opening scene. shot = { visible: [areaIds], pos: Vector3, look: Vector3, timeMin, override?(state), lights?(ctx) }
  let menuState = null;
  function menuStateNew(g) {
    const m = g.newState(424242);
    m.weather.type = 'snow'; m.weather.precip = 0.35; m.weather.snow = 0.8; m.weather.temp = -9; m.weather.wind = 0.3; m.stove.setting = 'medium'; m.stove.fuel = 30;
    return m;
  }
  V.cinematic = null;   // (t) => shot, set by the opening scene
  function showOnly(visible) {
    const key = 'static:' + visible.join(',');
    if (key === curKey) return;
    curKey = key;
    for (const id in groups) if (groups[id] && groups[id].group) groups[id].group.visible = false;
    visible.forEach((id) => { const gr = id.startsWith('room_') ? groups.__cabin : groups[id]; if (gr) gr.group.visible = true; });
  }
  function menuShot(t) {
    const c = R3.areaOrigin('f_2_2');
    const ang = -0.35 + Math.sin(t * 0.05) * 0.18;
    const cx = c.x + 240 * K, cz = c.z + 110 * K;
    return { visible: ['f_2_2', 'f_2_1', 'f_1_2', 'f_3_2', 'f_2_3', 'f_1_1', 'f_3_1', 'f_1_3', 'f_3_3'], timeMin: 22 * 60 + 30, watcher: true,
      pos: new THREE.Vector3(cx + Math.sin(ang) * 15, R3.groundAt(cx, cz + 14, 'f_2_2') + 2.1 + Math.sin(t * 0.13) * 0.15, cz + Math.cos(ang) * 15),
      look: new THREE.Vector3(cx - 1.5, R3.groundAt(cx, cz, 'f_2_2') + 2.4, cz - 1) };
  }
  V.menuFrame = function (t, dt) {
    const g = G();
    let realState = g.state;
    if (!realState || !realState.time) {
      if (!menuState) menuState = menuStateNew(g);
      g.state = menuState;
    }
    const s = g.state;
    const shot = (g.mode === 'scene' && V.cinematic && V.cinematic(t)) || menuShot(t);
    const saved = { min: s.time.min, setting: s.stove.setting };
    try {
      if (worldSeed !== s.seed) { NW.World.clearCache(); resetWorld(); worldSeed = s.seed; }
      s.time.min = shot.timeMin != null ? shot.timeMin : s.time.min;
      if (shot.override) shot.override(s);
      shot.visible.forEach((id) => buildArea(id));
      showOnly(shot.visible);
      if (!outer) { try { outer = R3.Forest && R3.Forest.buildOuter ? R3.Forest.buildOuter() : { group: new THREE.Group() }; R3.scene.add(outer.group); } catch (e) { outer = { group: new THREE.Group() }; } }
      const indoor = shot.visible.some((id) => !id.startsWith('f_'));
      outer.group.visible = !indoor;
      R3.Lights.begin();
      const fakeArea = W.get(shot.visible[0]);
      const ctx = V.ctx = { t, dt, state: s, area: fakeArea, indoor, deep: false, visible: shot.visible, cam: R3.camera, q: R3.q(), addLight: R3.Lights.add, menu: true };
      R3.camera.position.copy(shot.pos);
      R3.camera.lookAt(shot.look);
      R3.camera.fov = shot.fov || 62; R3.camera.updateProjectionMatrix();
      R3.Atmos.update(dt, R3.camera, ctx);
      const done = new Set();
      shot.visible.forEach((id) => { const gr = id.startsWith('room_') ? groups.__cabin : groups[id]; if (!gr || done.has(gr)) return; done.add(gr); try { gr.update && gr.update(dt, ctx); } catch (e) { /* ignore */ } });
      if (shot.lights) shot.lights(ctx);
      frameNo++;
      if (shot.watcher) { const e = want('menu:watcher', creature('lighthunter')); if (e) { R3.toWorld('f_2_2', 60, 150, v3); e.obj.position.copy(v3); e.obj.rotation.y = Math.PI * 0.6; e.update && e.update(dt, { stage: 'menu' }, ctx); } }
      for (const [k, en] of ents) if (en.seen !== frameNo) { removeEnt(en); ents.delete(k); }
      if (R3.Creatures && R3.Creatures.viewmodelUpdate) R3.Creatures.viewmodelUpdate(dt, ctx);
      R3.render(R3.camera, t);
    } finally {
      s.time.min = saved.min; s.stove.setting = saved.setting;
      if (!realState || !realState.time) g.state = realState;
    }
  };

  // ------------------------------------------------------------------ loading: build + compile before play
  // Shader compilation is the slow part of a first frame. prepare() builds the opening areas, the cabin interior and
  // one of every creature, then compiles every program the scene can need while a loading screen is up, so no
  // frame has to stall on a new shader later. Safe to call again (e.g. after a quality change).
  let prep = null, again = null;
  const tick = () => new Promise((r) => setTimeout(r, 16));
  V.prepare = function (label) {
    if (prep) { again = label || true; return prep; }
    const ov = document.getElementById('loading3d');
    const bar = ov && ov.querySelector('.ld-fill'), msg = ov && ov.querySelector('.ld-msg');
    const show = (p, m) => { if (!ov) return; ov.classList.remove('hidden'); if (bar) bar.style.width = Math.round(p * 100) + '%'; if (msg) msg.textContent = m; };
    R3.preparing = true;
    const t0 = performance.now();
    prep = (async () => {
      const g = G();
      const sample = new THREE.Group();
      const hidden = [];
      // before a run exists the menu's own world stands in; the state is only swapped inside a synchronous
      // step, never across an await, so a run that starts meanwhile is left alone
      const step = (fn) => {
        const real = g.state;
        if (real && real.time) { if (worldSeed !== real.seed) { resetWorld(); worldSeed = real.seed; } return fn(); }
        if (!menuState) menuState = menuStateNew(g);
        g.state = menuState;
        try { if (worldSeed !== menuState.seed) { NW.World.clearCache(); resetWorld(); worldSeed = menuState.seed; } return fn(); } finally { g.state = real; }
      };
      try {
        show(0.03, label || 'Waking the forest…'); await tick();
        if (!V.initDone) V.init();
        const ids = ['f_2_2', 'f_2_1', 'f_1_2', 'f_3_2', 'f_2_3', 'f_1_1', 'f_3_1', 'f_1_3', 'f_3_3'];
        for (let i = 0; i < ids.length; i++) { step(() => buildArea(ids[i])); show(0.05 + 0.3 * (i + 1) / ids.length, 'Raising the forest…'); await tick(); }
        step(() => buildArea('room_main')); show(0.4, 'Lighting the cabin…'); await tick();
        step(() => { if (!outer) { try { outer = R3.Forest && R3.Forest.buildOuter ? R3.Forest.buildOuter() : { group: new THREE.Group() }; R3.scene.add(outer.group); } catch (e) { console.error(e); outer = { group: new THREE.Group() }; } } });
        show(0.5, 'Gathering the night…'); await tick();
        R3.scene.add(sample);
        const kinds = (R3.Creatures && R3.Creatures.kinds) || [];
        kinds.forEach((k) => { try { const c = creature(k, k === 'human' ? { app: HIKER_APP, visitor: true } : k === 'dweller' ? { room: null } : {})(); if (c && c.obj) sample.add(c.obj); } catch (e) { /* not every kind builds without context */ } });
        // everything visible at once, so one pass sees every material
        for (const id in groups) if (groups[id] && groups[id].group) { if (!groups[id].group.visible) hidden.push(groups[id].group); groups[id].group.visible = true; }
        if (outer) { if (!outer.group.visible) hidden.push(outer.group); outer.group.visible = true; }
        show(0.6, 'Compiling shaders…'); await tick();
        step(() => R3.Atmos.update(0.016, R3.camera, { t: 0, dt: 0.016, state: g.state, area: W.get('f_2_2'), indoor: false, visible: ids, cam: R3.camera, q: R3.q(), menu: true }));
        await R3.renderer.compileAsync(R3.scene, R3.camera);
        // one tiny draw so the shadow depth programs are built too
        try {
          show(0.9, 'Compiling shaders…'); await tick();
          R3.Lights.forceShadows();
          const rt = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType });
          R3.renderer.setRenderTarget(rt); R3.renderer.render(R3.scene, R3.camera); R3.renderer.setRenderTarget(null); rt.dispose();
        } catch (e) { console.error('[r3 prepare shadows]', e); }
        // full-size procedural textures are painted in workers: start with them, not the blurry previews
        if (R3.Tex && R3.Tex.pending) {
          const t1 = performance.now(), n0 = Math.max(1, R3.Tex.pending());
          while (R3.Tex.pending() > 0 && performance.now() - t1 < 30000) { show(0.9 + 0.07 * (1 - R3.Tex.pending() / n0), 'Painting textures…'); await new Promise((r) => setTimeout(r, 120)); }
        }
        show(0.97, 'Almost there…'); await tick();
      } catch (e) { console.error('[r3 prepare]', e); }
      finally {
        hidden.forEach((o) => { o.visible = false; });
        if (sample.parent) sample.parent.remove(sample);
        curKey = null;
        R3.preparing = false; prep = null;
        if (again) { const l = again; again = null; setTimeout(() => V.prepare(l === true ? undefined : l), 0); }
        R3.prepareMs = performance.now() - t0;
        if (ov) ov.classList.add('hidden');
      }
    })();
    return prep;
  };
  R3.prepare = V.prepare;

  // ------------------------------------------------------------------ init & integration
  V.init = function () {
    V.initDone = true;
    R3.Atmos.init();
    R3.Controls.init(R3.canvas);
    if (R3.Creatures && R3.Creatures.viewmodel) { try { const vm = R3.Creatures.viewmodel(); if (vm) R3.camera.add(vm); } catch (e) { console.error(e); } }
    NW.Hooks.on('start', () => { R3.Controls.setFacingDir(G().state.player.dir); camArea = null; });
    NW.Hooks.on('areaEnter', (id, prev) => {
      // keep looking the way the doorway faces when moving between distant places
      const p = G().state.player;
      if (prev && (id.startsWith('f_') !== prev.startsWith('f_') || !(id.startsWith('room_') && prev.startsWith('room_')))) { if (!(id.startsWith('f_') && prev.startsWith('f_'))) R3.Controls.setFacingDir(p.dir); }
    });
  };
})(window.NW);
