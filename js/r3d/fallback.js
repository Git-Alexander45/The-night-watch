'use strict';
// Minimal stand-ins used only when a detailed builder (forest, cabin, props, creatures) is missing
// or throws, so the world stays playable and nothing in the game is ever invisible or blocked.
(function (NW) {
  const THREE = window.THREE, R3 = NW.R3;
  if (!THREE || !R3) return;
  const F = R3.Fallback = {};
  const K = R3.K;
  const box = (w, h, d, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), R3.mat('fb' + c, () => R3.std({ color: c, roughness: 0.9 }))); m.position.y = h / 2; return m; };

  F.forest = function (a) {
    const g = new THREE.Group();
    const o = R3.areaOrigin(a.id);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(R3.AREA_W, R3.AREA_H), R3.mat('fbground', () => R3.std({ color: 0xb8c0cc, roughness: 1 })));
    ground.rotation.x = -Math.PI / 2; ground.position.set(o.x + R3.AREA_W / 2, 0, o.z + R3.AREA_H / 2); g.add(ground);
    const cone = R3.geo('fbcone', () => new THREE.ConeGeometry(0.9, 4, 7).translate(0, 2.6, 0));
    const trees = a.objs.filter((ob) => ob.type === 'tree');
    const im = new THREE.InstancedMesh(cone, R3.mat('fbtree', () => R3.std({ color: 0x1f3a2c, roughness: 1 })), Math.max(1, trees.length));
    const m = new THREE.Matrix4();
    trees.forEach((t, i) => { m.makeTranslation(o.x + t.x * K, 0, o.z + t.y * K); im.setMatrixAt(i, m); });
    im.count = trees.length; g.add(im);
    a.objs.forEach((ob) => { if (ob.type === 'rock' || ob.type === 'stump' || ob.type === 'deadtree' || ob.type === 'bush') { const b = box(0.6, 0.5, 0.6, 0x555b63); b.position.set(o.x + ob.x * K, 0.25, o.z + ob.y * K); g.add(b); } });
    return { group: g };
  };
  F.cabinInterior = function () {
    const g = new THREE.Group();
    ['room_main', 'room_bed', 'room_office', 'room_storage'].forEach((id) => {
      const a = NW.World.get(id), o = R3.areaOrigin(id);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(a.w * 16 * K, a.h * 16 * K), R3.mat('fbfloor', () => R3.std({ color: 0x6b4a32, roughness: 0.8 })));
      fl.rotation.x = -Math.PI / 2; fl.position.set(o.x + a.w * 8 * K, 0, o.z + a.h * 8 * K); g.add(fl);
      for (let ty = 0; ty < a.h; ty++) for (let tx = 0; tx < a.w; tx++) if (NW.World.isSolidTile(NW.World.tile(a, tx, ty))) { const b = box(16 * K, 2.6, 16 * K, 0x5a3a22); b.position.set(o.x + (tx + 0.5) * 16 * K, 1.3, o.z + (ty + 0.5) * 16 * K); g.add(b); }
    });
    return { group: g, update: (dt, ctx) => { const s = ctx.state; if (NW.Survival.stoveLit()) { const o = R3.areaOrigin('room_main'); ctx.addLight({ key: 'stove', x: o.x + 64 * K, y: 0.6, z: o.z + 50 * K, color: [1, 0.55, 0.25], intensity: 12, range: 12, flicker: 'fire', shadow: 3 }); } void s; } };
  };
  F.cabinExterior = function (a) {
    const g = new THREE.Group(), o = R3.areaOrigin(a.id);
    const b = box(12 * 16 * K, 3.2, 8 * 16 * K, 0x4a2f1c); b.position.set(o.x + 15 * 16 * K, 1.6, o.z + 7 * 16 * K); g.add(b);
    return { group: g, anchors: null };
  };
  F.interior = function (id, a) {
    const g = new THREE.Group(), o = R3.areaOrigin(id);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(a.w * 16 * K, a.h * 16 * K), R3.mat('fbfloor', () => R3.std({ color: 0x6b4a32, roughness: 0.8 })));
    fl.rotation.x = -Math.PI / 2; fl.position.set(o.x + a.w * 8 * K, o.y, o.z + a.h * 8 * K); g.add(fl);
    for (let ty = 0; ty < a.h; ty++) for (let tx = 0; tx < a.w; tx++) if (NW.World.isSolidTile(NW.World.tile(a, tx, ty))) { const b = box(16 * K, 2.6, 16 * K, 0x4a3a30); b.position.set(o.x + (tx + 0.5) * 16 * K, o.y + 1.3, o.z + (ty + 0.5) * 16 * K); g.add(b); }
    return { group: g };
  };
  F.prop = function (key, o) {
    const b = box(0.5, 0.5, 0.5, 0x7a6a5a);
    const gr = new THREE.Group(); gr.add(b);
    return { obj: gr };
  };
  F.creature = function (kind) {
    const gr = new THREE.Group();
    const h = { human: 1.75, deer: 1.4, wolf: 0.8, rabbit: 0.3, crow: 0.2, dog: 0.6, fox: 0.45, lighthunter: 2.6, stag: 2.4, scratcher: 0.9, dweller: 0.2, siphon: 0.8 }[kind] || 1;
    const m = box(h * 0.35, h, h * 0.35, kind === 'human' ? 0x46639a : 0x2a2a30);
    gr.add(m);
    return { obj: gr };
  };
  F.tracer = function () {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1], 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffe6a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const line = new THREE.Line(geo, mat); line.frustumCulled = false;
    return { obj: line, set: (a, b, op) => { const p = geo.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true; mat.opacity = Math.min(1, op); }, dispose: () => { geo.dispose(); mat.dispose(); } };
  };
  F.footprints = function (anchor, fromLeft) {
    const g = new THREE.Group();
    const mat = R3.mat('footprint', () => R3.std({ color: 0x5a6a80, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    const geo = R3.geo('footprint', () => { const gg = new THREE.PlaneGeometry(0.12, 0.26); gg.rotateX(-Math.PI / 2); gg.userData.shared = true; return gg; });
    const yaw = anchor.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), sx = fromLeft ? -1 : 1;
    for (let i = 1; i < 12; i++) {
      const m = new THREE.Mesh(geo, mat);
      const d = i * 0.42;
      m.position.set(anchor.pos.x + fx * d * 0.7 + fz * sx * d * 0.7 + (i % 2 ? 0.1 : -0.1) * fz, anchor.pos.y + 0.012, anchor.pos.z + fz * d * 0.7 - fx * sx * d * 0.7);
      m.rotation.y = yaw + sx * 0.8;
      g.add(m);
    }
    return { obj: g };
  };
})(window.NW);
