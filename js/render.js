'use strict';
// Rendering: terrain, rooms, y-sorted entities, lighting, weather, overlays, window/peephole views, menu scene, map.
(function (NW) {
  const U = NW.U, D = NW.D, S = NW.S, W = NW.World;
  const P = S.P, R = S.R, T = W.T, TS = D.TILE;
  const Rn = NW.Render = {};
  let cv, g, light, lg, fogC;
  const bgCache = {};
  const particles = [];
  const prints = [];
  Rn.prints = prints; // footprints in snow (also drawn by the 3D view)

  // ------------------------------------------------------- fast value noise
  const NT = new Float32Array(256 * 256);
  (function () { const r = U.rng(1234567); for (let i = 0; i < NT.length; i++) NT[i] = r(); })();
  function vn(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const x0 = xi & 255, y0 = yi & 255, x1 = (x0 + 1) & 255, y1 = (y0 + 1) & 255;
    const a = NT[y0 * 256 + x0], b = NT[y0 * 256 + x1], c = NT[y1 * 256 + x0], d = NT[y1 * 256 + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const fbm = (x, y) => vn(x, y) * 0.55 + vn(x * 2.07 + 17, y * 2.07 + 9) * 0.3 + vn(x * 4.3 + 41, y * 4.3 + 3) * 0.15;
  const hp = (x, y, s) => NT[((y * 31 + s * 7) & 255) * 256 + ((x * 17 + s * 13) & 255)];
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
  const bay = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

  Rn.init = function (canvas) {
    cv = canvas; g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    light = S.mk(D.CW, D.CH); lg = light.getContext('2d');
    fogC = S.mk(256, 256, (fg) => {
      const id = fg.createImageData(256, 256);
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
        const n = (vn(x / 32, y / 32) * 0.6 + vn(x / 16 + 50, y / 16) * 0.4);
        const i = (y * 256 + x) * 4; id.data[i] = 200; id.data[i + 1] = 208; id.data[i + 2] = 220; id.data[i + 3] = Math.max(0, n - 0.35) * 255 * 1.3;
      }
      fg.putImageData(id, 0, 0);
    });
  };
  Rn.clearCache = () => { for (const k in bgCache) delete bgCache[k]; };

  // ===================================================================== BACKGROUNDS
  function forestBg(a) {
    const s = NW.G.state;
    const snowB = Math.round(s.weather.snow * 8) / 8;
    const key = a.id + '_' + snowB + (s.world.bridgeOut ? 'b' : '');
    if (bgCache[key]) return bgCache[key];
    for (const k in bgCache) if (k.startsWith(a.id + '_')) delete bgCache[k];
    const c = S.mk(a.w * TS, a.h * TS);
    const cg = c.getContext('2d');
    const id = cg.createImageData(c.width, c.height); const dd = id.data;
    const ox = a.ax * 480, oy = a.ay * 272;
    const put = (i, col) => { const r = S.rgb(col); dd[i] = r[0]; dd[i + 1] = r[1]; dd[i + 2] = r[2]; dd[i + 3] = 255; };
    for (let py = 0; py < c.height; py++) for (let px = 0; px < c.width; px++) {
      const wx = px + ox, wy = py + oy;
      const jx = Math.round((vn(wx * 0.15, wy * 0.15) - 0.5) * 6), jy = Math.round((vn(wx * 0.15 + 30, wy * 0.15) - 0.5) * 6);
      const t = W.tile(a, Math.floor((px + jx) / TS), Math.floor((py + jy) / TS));
      const tt = t === T.VOID ? W.tile(a, Math.floor(px / TS), Math.floor(py / TS)) : t;
      const n = fbm(wx * 0.04, wy * 0.04), h = hp(wx, wy, 1), h2 = hp(wx + 7, wy + 3, 2);
      let col;
      switch (tt) {
        case T.DIRT: case T.BUILDING:
          col = n < 0.42 ? P.d0 : n < 0.62 ? P.d1 : P.d2; if (h < 0.02) col = P.st2; else if (h < 0.05) col = P.d3; break;
        case T.ASH: col = n < 0.5 ? P.ash0 : P.ash1; if (h < 0.03) col = P.ash2; if (h < 0.004) col = P.f0; break;
        case T.MUD: col = n < 0.45 ? P.mud0 : n < 0.6 ? P.mud1 : P.mud2; if (h < 0.02) col = P.w1; break;
        case T.ROCKG: col = n < 0.45 ? P.st1 : n < 0.62 ? P.st2 : P.st0; if (h < 0.03) col = P.st3; break;
        case T.ICE: { col = n < 0.5 ? P.ice0 : P.ice1; const cr = Math.abs(vn(wx * 0.12, wy * 0.12) - 0.5); if (cr < 0.012) col = P.ice2; if (h < 0.01) col = P.white; break; }
        case T.WATER: case T.DOCK: col = n < 0.5 ? P.w1 : P.w0; break;
        case T.FORD: col = n < 0.5 ? P.w2 : P.w1; if (h < 0.06) col = P.st2; break;
        case T.STONES: col = P.w1; break;
        case T.BRIDGE: col = P.w1; break;
        default: {
          const n2 = fbm(wx * 0.022 + 5, wy * 0.022) + bay(px, py) * 0.09;
          col = n2 < 0.4 ? P.gr0 : n2 < 0.5 ? P.gr1 : n2 < 0.6 ? P.gr2 : P.gr1;
          const blade = hp(wx >> 1, wy, 1);
          if (blade < 0.06 && (py & 1) === 0) col = n2 < 0.45 ? P.gr2 : P.gr3; else if (h < 0.012) col = P.gr4; else if (h2 < 0.01) col = P.d2;
          if (h2 > 0.997) col = P.r1;
        }
      }
      // snow
      if (tt !== T.WATER && tt !== T.DOCK && tt !== T.STONES && tt !== T.BRIDGE && tt !== T.FORD && tt !== T.ICE) {
        const amt = snowB * (tt === T.DIRT ? 0.55 : tt === T.ASH ? 0.8 : 1);
        const m = fbm(wx * 0.03 + 100, wy * 0.03 + 50) + bay(px, py) * 0.05;
        const th = amt < 0.02 ? -1 : 0.26 + amt * 0.52;
        if (m < th) {
          col = (th - m) < 0.025 ? P.sn1 : (n > 0.6 ? P.sn3 : P.sn2);
          if (h < 0.006) col = P.sn4;
          if (tt === T.DIRT && (th - m) > 0.03) col = h2 < 0.3 ? P.sn0 : P.sn1;
        }
      }
      put((py * c.width + px) * 4, col);
    }
    cg.putImageData(id, 0, 0);
    // shoreline darkening around water
    for (let ty = 0; ty < a.h; ty++) for (let tx = 0; tx < a.w; tx++) {
      const t = W.tile(a, tx, ty);
      if (t === T.STONES) { [[3, 4], [9, 9]].forEach(([dx, dy]) => { R(cg, P.st1, tx * TS + dx, ty * TS + dy, 6, 4); R(cg, P.st3, tx * TS + dx, ty * TS + dy, 5, 1); }); }
      if (t === T.BRIDGE && !(s.world.bridgeOut && tx >= 17 && tx <= 20)) {
        for (let i = 0; i < 4; i++) { R(cg, i % 2 ? P.wood3 : P.wood4, tx * TS, ty * TS + i * 4, 16, 3); R(cg, P.wood1, tx * TS, ty * TS + i * 4 + 3, 16, 1); }
        if (ty === 7) R(cg, P.wood1, tx * TS, ty * TS, 16, 2);
        if (ty === 9) R(cg, P.wood1, tx * TS, ty * TS + 14, 16, 2);
      }
    }
    if (s.world.bridgeOut && a.bridge) { R(cg, P.wood2, 17 * TS, 7 * TS + 5, 9, 3); R(cg, P.wood1, 17 * TS + 2, 8 * TS + 2, 3, 6); R(cg, P.wood2, 20 * TS + 6, 9 * TS + 2, 10, 3); R(cg, P.wood1, 20 * TS + 10, 8 * TS + 4, 3, 5); }
    bgCache[key] = c;
    return c;
  }

  // Interior themes recolour the log-cabin palette per pixel: 'stone' for the mine, 'plank' for weathered grey boards.
  const THEMES = {
    plank: (c, floor) => { const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11; const k = floor ? 0.55 : 0.7; return [c[0] + (l * 0.95 - c[0]) * k, c[1] + (l * 0.95 - c[1]) * k, c[2] + (l * 1.02 - c[2]) * k]; },
    stone: (c, floor) => { const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11; return floor ? [l * 1.05, l * 0.9, l * 0.72] : [l * 0.92, l * 0.95, l * 1.05]; },
  };
  function roomBg(a) {
    if (bgCache[a.id]) return bgCache[a.id];
    const c = S.mk(a.w * TS, a.h * TS), cg = c.getContext('2d');
    const id = cg.createImageData(c.width, c.height); const dd = id.data;
    const put = (i, col) => { const r = S.rgb(col); dd[i] = r[0]; dd[i + 1] = r[1]; dd[i + 2] = r[2]; dd[i + 3] = 255; };
    const seed = a.id.length * 31;
    const remap = THEMES[a.theme] || null;
    for (let py = 0; py < c.height; py++) for (let px = 0; px < c.width; px++) {
      const tx = Math.floor(px / TS), ty = Math.floor(py / TS), t = W.tile(a, tx, ty);
      const lx = px % TS, ly = py % TS;
      let col = P.ink;
      if (t === T.FLOOR || t === T.DOORWAY) {
        const row = Math.floor(py / 5), ry = py % 5;
        const off = Math.floor(hp(row, seed, 3) * 40);
        const plank = Math.floor((px + off) / 37), pxin = (px + off) % 37;
        const tint = hp(plank, row, 4);
        col = tint < 0.45 ? S.mix(P.wood3, P.wood2, 0.35) : tint < 0.85 ? P.wood3 : S.mix(P.wood3, P.wood4, 0.5);
        if (tint > 0.94) col = P.wood2;
        const grain = vn(px * 0.25 + row * 13, row * 3.1);
        if (grain < 0.3) col = S.mix(col, P.wood2, 0.5);
        if (ry === 0) col = S.mix(col, P.wood5, 0.25);
        if (ry === 4) col = P.wood1;
        if (pxin === 0) col = P.wood1;
        if (pxin === 2 && ry === 2 && hp(plank, row, 9) < 0.35) col = P.wood1;
        if (t === T.DOORWAY) col = S.mix(col, P.wood1, 0.35);
      } else if (t === T.WFACE) {
        const yy = ly % 6;
        col = yy === 0 ? P.log3 : yy < 3 ? P.log2 : yy === 3 ? P.log1 : yy === 4 ? P.log0 : P.chink;
        if (yy > 0 && yy < 4 && hp(px, Math.floor(py / 6), 5) < 0.02) col = P.log1;
        if (yy === 5 && hp(px, py, 6) < 0.3) col = P.chink2;
      } else if (t === T.WTOP) {
        col = ly < 2 ? P.wood2 : ly > 13 ? P.wood0 : P.wood1;
        if (hp(px, py, 7) < 0.05) col = P.wood0;
      } else if (t === T.WSIDE) {
        const inner = W.tile(a, tx + 1, ty) === T.FLOOR || W.tile(a, tx + 1, ty) === T.DOORWAY;
        const edge = inner ? lx : 15 - lx;
        col = edge > 12 ? P.wood2 : edge > 10 ? P.wood1 : P.wood0;
        const yy = py % 8; if (edge < 9 && yy === 0) col = P.wood1;
      } else if (t === T.WBOT) {
        col = ly < 2 ? P.wood2 : ly < 4 ? P.wood1 : P.wood0;
        if (ly >= 4 && hp(px, py, 8) < 0.04) col = P.wood1;
      }
      if (remap) { const rc = remap(S.rgb(col), t === T.FLOOR || t === T.DOORWAY), i4 = (py * c.width + px) * 4; dd[i4] = rc[0]; dd[i4 + 1] = rc[1]; dd[i4 + 2] = rc[2]; dd[i4 + 3] = 255; }
      else put((py * c.width + px) * 4, col);
    }
    cg.putImageData(id, 0, 0);
    // shadows cast by walls onto floor
    for (let tx = 0; tx < a.w; tx++) {
      if (W.tile(a, tx, 2) === T.FLOOR || W.tile(a, tx, 2) === T.DOORWAY) { cg.fillStyle = 'rgba(0,0,0,0.35)'; cg.fillRect(tx * TS, 2 * TS, TS, 4); cg.fillStyle = 'rgba(0,0,0,0.15)'; cg.fillRect(tx * TS, 2 * TS + 4, TS, 4); }
    }
    for (let ty = 2; ty < a.h - 1; ty++) { if (W.tile(a, 1, ty) === T.FLOOR) { cg.fillStyle = 'rgba(0,0,0,0.25)'; cg.fillRect(TS, ty * TS, 3, TS); } }
    bgCache[a.id] = c;
    return c;
  }
  Rn.areaBg = (a) => (a.kind === 'forest' ? forestBg(a) : a.def && a.def.bg ? (bgCache[a.id] = bgCache[a.id] || a.def.bg(a)) : roomBg(a));

  function drawWater(a, t) {
    for (let ty = 0; ty < a.h; ty++) for (let tx = 0; tx < a.w; tx++) {
      const tl = W.tile(a, tx, ty);
      if (tl !== T.WATER && tl !== T.FORD && tl !== T.STONES && !(tl === T.BRIDGE && NW.G.state.world.bridgeOut)) continue;
      if (tl === T.BRIDGE && !(tx >= 17 && tx <= 20)) continue;
      const lake = a.lm === 'lake';
      for (let i = 0; i < 3; i++) {
        const ph = (t * (lake ? 0.3 : 1.2) + hp(tx, ty, i) * 5 + i * 0.33) % 1;
        const x = tx * TS + Math.floor(hp(tx, ty, i + 3) * 12), y = ty * TS + Math.floor((lake ? hp(tx, ty, i + 7) * 14 : ph * 16));
        g.fillStyle = tl === T.FORD ? 'rgba(180,210,230,0.35)' : 'rgba(120,170,210,' + (0.35 * Math.sin(ph * 3.14)) + ')';
        g.fillRect(x, y, lake ? 4 : 2, 1);
      }
    }
  }

  // ============================================================ ENTITY LIST
  function sortY(o) {
    if (o.sy != null) return o.sy;
    if (o.type === 'cabin_ext') return 176;
    if (o.type === 'cabin_annex') return 160;
    if (NW.G.area.kind !== 'forest') {
      if (o.cy != null) return o.cy + (o.ch || 0);
      if (o.type === 'lamp') return o.hy + 8;
      return o.y + 16;
    }
    return o.y;
  }

  // =================================================================== FRAME
  Rn.frame = function (t, dt) {
    const G = NW.G, s = G.state, a = G.area;
    if (!a) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#05060a'; g.fillRect(0, 0, D.CW, D.CH);
    let sx = 0, sy = 0;
    if (G.shake > 0 && NW.settings.shake) { sx = Math.round((Math.random() - 0.5) * G.shake); sy = Math.round((Math.random() - 0.5) * G.shake); }
    if (s.player.temp < 34.5 && NW.settings.shake) sx += Math.round(Math.sin(t * 40) * 0.6);
    g.save();
    g.translate(a.ox + sx, a.oy + sy);
    g.drawImage(Rn.areaBg(a), 0, 0);
    if (a.kind === 'forest') drawWater(a, t);
    // footprints
    if (a.kind === 'forest') {
      for (let i = prints.length - 1; i >= 0; i--) {
        const p = prints[i];
        if (p.area !== a.id) continue;
        p.life -= dt * 0.02;
        if (p.life <= 0) { prints.splice(i, 1); continue; }
        g.fillStyle = 'rgba(80,95,120,' + (0.45 * p.life) + ')'; g.fillRect(p.x, p.y, 2, 2);
      }
    }
    // floor / wall layers
    const list = [];
    const dyn = G.dynamicObjects();
    a.objs.forEach((o) => { if (o.layer === 'floor') NW.Objects.draw(g, o, t); });
    a.objs.forEach((o) => { if (o.layer === 'wall' || o.type === 'window' || o.type === 'door') NW.Objects.draw(g, o, t); });
    a.objs.forEach((o) => { if (!o.layer && o.type !== 'window' && o.type !== 'door' && o.type !== 'extdoor') list.push({ y: sortY(o), o }); else if (o.layer === 'normal') list.push({ y: sortY(o), o }); });
    dyn.forEach((o) => list.push({ y: o.sy != null ? o.sy : o.y, o, dyn: true }));
    list.push({ y: s.player.y, player: true });
    if (a.kind === 'forest') {
      s.animals.list.forEach((an) => list.push({ y: an.y, animal: an }));
      const sg = s.night.stag;
      if ((sg.stage === 'watching' || sg.stage === 'hunting') && sg.area === a.id) list.push({ y: sg.y, stag: sg });
      if (a.id === 'f_2_2') {
        const sc = s.night.sc;
        if (sc.stage === 'approach' || sc.stage === 'door') {
          const door = sc.door === 'front' ? { x: 240, y: 186 } : { x: 360, y: 172 };
          const f = sc.stage === 'approach' ? Math.min(1, sc.t / 14) : 1;
          const start = sc.door === 'front' ? { x: 240, y: 270 } : { x: 470, y: 180 };
          list.push({ y: U.lerp(start.y, door.y, f), scr: { x: U.lerp(start.x, door.x, f), y: U.lerp(start.y, door.y, f), face: sc.door === 'front' ? 1 : -1 } });
        }
        const lh = s.night.lh;
        if (lh.stage === 'window' && (lh.wid === 'w_front_l' || lh.wid === 'w_front_r')) list.push({ y: 182, lh: { x: lh.wid === 'w_front_l' ? 196 : 284, y: 182 } });
        else if (lh.stage === 'circling') { const ang = t * 0.25; const lx = 240 + Math.cos(ang) * 230, ly = 120 + Math.sin(ang) * 140; if (lx > 0 && lx < 480 && ly > 0 && ly < 272 && (ly < 40 || ly > 200 || lx < 60 || lx > 420)) list.push({ y: ly, lh: { x: lx, y: ly } }); }
        const vs = s.night.vis;
        if (vs) list.push({ y: 186, visitor: s.visitors[vs.vid] });
      }
    }
    list.sort((p, q) => p.y - q.y);
    for (const it of list) {
      if (it.player) drawPlayer(t);
      else if (it.animal) S.animal(g, it.animal, t);
      else if (it.stag) S.stag(g, it.stag.x, it.stag.y, t, it.stag.stage === 'watching' ? 0.75 : 1);
      else if (it.scr) S.scratcher(g, it.scr.x, it.scr.y, t, it.scr.face);
      else if (it.lh) S.lightHunter(g, it.lh.x, it.lh.y, t, 1);
      else if (it.visitor) { const v = it.visitor; S.human(g, 240, 186, Object.assign({ dir: 'up' }, v.app)); }
      else if (it.dyn) G.drawDynamic(g, it.o, t);
      else NW.Objects.draw(g, it.o, t);
    }
    // dweller tendrils
    if (a.kind === 'room') drawDweller(t);
    NW.Hooks.emit('drawWorld', g, a, t);
    // tracers & muzzle flash
    G.fx.forEach((f) => { if (f.type === 'tracer') { g.strokeStyle = 'rgba(255,230,160,' + (f.life * 8) + ')'; g.lineWidth = 1; g.beginPath(); g.moveTo(f.x1, f.y1); g.lineTo(f.x2, f.y2); g.stroke(); } });
    g.restore();

    // weather (outdoor)
    if (a.kind === 'forest') drawWeather(t, dt);
    drawLighting(t, sx, sy);
    if (a.kind === 'forest' && s.weather.fog > 0.02) drawFog(t);
    drawOverlays(t);
    NW.Hooks.emit('drawOverlay', g, a, t);
  };

  function drawPlayer(t) {
    const G = NW.G, s = G.state, p = s.player;
    const outside = G.area.kind === 'forest';
    const night = NW.Survival.daylight() < 0.45;
    S.human(g, p.x, p.y, Object.assign({}, S.PLAYER, { dir: p.dir, frame: G.anim, moving: G.moving, lantern: outside && night, rifle: outside, coat: p.coat === 'parka' ? P.b1 : P.rg2, coat2: p.coat === 'parka' ? P.b0 : P.rg0 }));
    if (G.hold) {
      const f = G.hold.t / G.hold.time;
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 3; g.beginPath(); g.arc(p.x, p.y - 30, 5, 0, 6.3); g.stroke();
      g.strokeStyle = G.hold.danger ? P.r3 : P.y2; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y - 30, 5, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); g.stroke();
    }
    // breath fog outdoors in cold
    if (outside && s.weather.temp < 2) {
      const ph = (t % 2.2) / 2.2;
      if (ph < 0.5) { g.fillStyle = 'rgba(230,236,245,' + (0.35 * (1 - ph * 2)) + ')'; const dx = p.dir === 'left' ? -5 : p.dir === 'right' ? 5 : 0; g.fillRect(p.x + dx - 1 + ph * 4 * Math.sign(dx || 1), p.y - 18 - ph * 4, 3 + ph * 3, 2); }
    }
  }

  function drawDweller(t) {
    const s = NW.G.state, dd = s.night.dd, a = NW.G.area;
    if (!s.night.active || !dd.on) return;
    const L = NW.Survival.light.room[a.id];
    const dark = L < 0.3;
    if (!dark || dd.meter < 30) return;
    const k = Math.min(1, (dd.meter - 30) / 70);
    const W2 = a.w * TS, H2 = a.h * TS;
    const corners = [[16, 32], [W2 - 16, 32], [16, H2 - 16], [W2 - 16, H2 - 16]];
    g.strokeStyle = 'rgba(0,0,0,0.9)';
    corners.forEach(([cx, cy], ci) => {
      for (let i = 0; i < 4 + Math.floor(k * 5); i++) {
        const ang = Math.atan2(H2 / 2 - cy, W2 / 2 - cx) + (i - 3) * 0.25 + Math.sin(t * 0.8 + i + ci) * 0.15;
        const len = 20 + k * 70 + Math.sin(t * 1.3 + i * 2 + ci) * 10;
        g.lineWidth = 2 + (i % 2);
        g.beginPath(); g.moveTo(cx, cy);
        g.quadraticCurveTo(cx + Math.cos(ang + 0.6) * len * 0.5, cy + Math.sin(ang + 0.6) * len * 0.5, cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
        g.stroke();
      }
      if (k > 0.5 && ci === (Math.floor(t * 0.2) % 4)) { g.fillStyle = S.rgba(P.r3, 0.5 + Math.sin(t * 3) * 0.3); g.fillRect(cx + (cx < W2 / 2 ? 6 : -9), cy + (cy < H2 / 2 ? 6 : -9), 1, 1); g.fillRect(cx + (cx < W2 / 2 ? 9 : -6), cy + (cy < H2 / 2 ? 6 : -9), 1, 1); }
    });
  }

  // ================================================================= WEATHER
  function drawWeather(t, dt) {
    const w = NW.G.state.weather;
    const want = Math.floor(w.precip * (w.type === 'rain' ? 160 : 220));
    while (particles.length < want) particles.push({ x: Math.random() * D.CW, y: Math.random() * D.CH, z: Math.random(), s: Math.random() });
    if (particles.length > want) particles.length = want;
    const rain = w.type === 'rain';
    g.fillStyle = rain ? 'rgba(170,190,215,0.55)' : 'rgba(240,244,250,0.85)';
    for (const p of particles) {
      const sp = rain ? 260 + p.z * 140 : 22 + p.z * 26;
      p.y += sp * dt; p.x += (w.wind * (rain ? 90 : 110) * (0.5 + p.z) + Math.sin(t * 2 + p.s * 10) * (rain ? 0 : 8)) * dt;
      if (p.y > D.CH) { p.y -= D.CH + 4; p.x = Math.random() * D.CW; }
      if (p.x > D.CW) p.x -= D.CW; if (p.x < 0) p.x += D.CW;
      if (rain) g.fillRect(p.x, p.y, 1, 3 + p.z * 3);
      else g.fillRect(p.x, p.y, p.z > 0.7 ? 2 : 1, p.z > 0.7 ? 2 : 1);
    }
  }
  function drawFog(t) {
    const w = NW.G.state.weather;
    g.globalAlpha = Math.min(0.85, w.fog * 0.9);
    const ox = (t * 6 * (0.3 + w.wind)) % 256, oy = (t * 2) % 256;
    for (let y = -256; y < D.CH + 256; y += 256) for (let x = -256; x < D.CW + 256; x += 256) g.drawImage(fogC, Math.floor(x + ox), Math.floor(y + oy));
    g.globalAlpha = Math.min(0.5, w.fog * 0.5);
    const ox2 = (-t * 4) % 256;
    for (let y = -256; y < D.CH + 256; y += 256) for (let x = -256; x < D.CW + 256; x += 256) g.drawImage(fogC, Math.floor(x + ox2), Math.floor(y + 60));
    g.globalAlpha = 1;
  }

  // ================================================================ LIGHTING
  function cut(x, y, r, a) {
    const gr = lg.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(0,0,0,' + a + ')'); gr.addColorStop(0.55, 'rgba(0,0,0,' + (a * 0.6) + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    lg.fillStyle = gr; lg.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function glow(x, y, r, col, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, S.rgba(col, a)); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function drawLighting(t, sx, sy) {
    const G = NW.G, s = G.state, a = G.area, Sv = NW.Survival;
    const day = Sv.daylight();
    const ox = a.ox + sx, oy = a.oy + sy;
    const lights = [];
    let amb;
    if (a.kind === 'forest') {
      amb = (1 - day) * 0.9;
      if (s.weather.type === 'blizzard') amb = Math.max(amb, 0.25);
      if (amb > 0.05) {
        const p = s.player;
        lights.push({ x: p.x + (p.dir === 'left' ? -6 : 5), y: p.y - 8, r: 85 + Math.sin(t * 7) * 2, a: 0.95, col: P.f3, ga: 0.12 });
        if (a.id === 'f_2_2') {
          const L = Sv.light;
          [['w_front_l', 196], ['w_front_r', 284]].forEach(([wid, wx]) => { const lk = L.winLeak[wid] || 0; if (lk > 0.02) lights.push({ x: wx, y: 170, r: 30 + lk * 50, a: Math.min(0.95, lk), col: P.f3, ga: 0.18 * Math.min(1, lk) }); });
          if (s.cabin.doors.front.open || s.cabin.doors.front.hp <= 0) lights.push({ x: 240, y: 180, r: 60, a: 0.8, col: P.f3, ga: 0.15 });
          if (Sv.stoveLit() && s.stove.setting === 'high') lights.push({ x: 188, y: 70, r: 40, a: 0.6, col: P.f2, ga: 0.2 });
        }
        const sg = s.night.stag;
        if ((sg.stage === 'watching' || sg.stage === 'hunting') && sg.area === a.id) lights.push({ x: sg.x, y: sg.y - 30, r: 34, a: 0.55, col: P.pale2, ga: 0.12 });
        G.fx.forEach((f) => { if (f.type === 'flash') lights.push({ x: f.x, y: f.y, r: 70, a: f.life * 8, col: P.f4, ga: f.life * 3 }); });
        s.dayEvents.forEach((ev) => { if (ev.area === a.id && ev.status !== 'done' && ev.type === 'anomaly' && ev.data.kind === 'warmfire') lights.push({ x: ev.x, y: ev.y - 4, r: 40, a: 0.7, col: P.f2, ga: 0.15 }); });
      }
    } else if (a.kind === 'interior') {
      amb = U.clamp(Math.max(0.9 - day * 0.55, a.dark || 0), 0.15, 0.96);
      const p = s.player;
      if (amb > 0.35) lights.push({ x: p.x + (p.dir === 'left' ? -5 : 4), y: p.y - 8, r: 62 + Math.sin(t * 7) * 2, a: 0.9, col: P.f3, ga: 0.1 });
      ((a.def && a.def.lights) || []).forEach((l) => lights.push(Object.assign({ a: 0.8, col: P.f3, ga: 0.12 }, l)));
    } else {
      const L = Sv.light.room[a.id] || 0;
      amb = U.clamp(0.93 - day * 0.58 - L * 0.06, 0.22, 0.94);
      const lit = Sv.stoveLit();
      a.objs.forEach((o) => {
        if (o.type === 'stove' && lit) {
          const lv = D.STOVE[s.stove.setting].light * (NW.Night.siphonOn() ? 0.6 : 1);
          const fl = 1 + Math.sin(t * 13) * 0.04 + Math.sin(t * 7.3) * 0.05;
          lights.push({ x: o.x + 16, y: o.y + 34, r: (44 + lv * 120) * fl, a: 0.5 + lv * 0.45, col: P.f2, ga: 0.12 + lv * 0.2 });
        }
        if (o.type === 'lamp' && s.lamps[o.room] && s.oil > 0) {
          const fl = 1 + Math.sin(t * 9 + o.x) * 0.03;
          lights.push({ x: o.hx, y: o.hy, r: 86 * fl, a: 0.85, col: P.f3, ga: 0.16 });
        }
        if (o.type === 'window' && day > 0.05) {
          const w = s.cabin.windows[o.wid];
          const f = w.boarded > 0 ? 0.1 : (w.curtClosed ? 0.35 : 1) * (w.shutClosed && w.shutter > 0 ? 0.2 : 1);
          lights.push({ x: o.x + 16, y: o.side === 'top' ? o.y + 40 : o.y - 10, r: 80, a: day * f * 0.8, col: P.b3, ga: 0 });
        }
      });
      // light from the main room spilling through doorways
      if (a.id !== 'room_main' && lit) {
        const ex = a.exits.find((e) => e.to === 'room_main');
        if (ex) lights.push({ x: ex.x + ex.w / 2, y: ex.y + ex.h / 2, r: 60, a: 0.45 * D.STOVE[s.stove.setting].light, col: P.f2, ga: 0.06 });
      }
      if (s.night.lh.stage === 'window') a.objs.forEach((o) => { if (o.type === 'window' && o.wid === s.night.lh.wid) lights.push({ x: o.x + 16, y: o.side === 'top' ? o.y + 18 : o.y + 6, r: 26, a: 0.6, col: P.glow, ga: 0.15 }); });
    }
    NW.Hooks.collect('lights', a, t).forEach((l) => { if (l && l.r > 0) lights.push(Object.assign({ a: 0.8, col: P.f3, ga: 0.12 }, l)); });
    lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, D.CW, D.CH);
    lg.fillStyle = a.kind === 'forest' ? 'rgba(4,7,18,' + amb + ')' : 'rgba(6,5,10,' + amb + ')';
    lg.fillRect(0, 0, D.CW, D.CH);
    if (a.kind !== 'forest') { lg.fillStyle = 'rgba(6,5,10,1)'; lg.fillRect(0, 0, D.CW, a.oy + sy); lg.fillRect(0, a.oy + sy + a.h * TS, D.CW, D.CH); lg.fillRect(0, 0, a.ox + sx, D.CH); lg.fillRect(a.ox + sx + a.w * TS, 0, D.CW, D.CH); }
    lg.globalCompositeOperation = 'destination-out';
    lights.forEach((l) => cut(l.x + ox, l.y + oy, l.r, l.a));
    lg.globalCompositeOperation = 'source-over';
    g.drawImage(light, 0, 0);
    if (a.kind !== 'forest') { g.fillStyle = '#05060a'; g.fillRect(0, 0, D.CW, a.oy + sy - 1); g.fillRect(0, a.oy + sy + a.h * TS + 1, D.CW, D.CH); g.fillRect(0, 0, a.ox + sx - 1, D.CH); g.fillRect(a.ox + sx + a.w * TS + 1, 0, D.CW, D.CH); }
    g.globalCompositeOperation = 'lighter';
    lights.forEach((l) => { if (l.ga > 0) glow(l.x + ox, l.y + oy, l.r * 0.8, l.col, l.ga); });
    g.globalCompositeOperation = 'source-over';
    // daytime colour grading outdoors
    if (a.kind === 'forest') {
      const m = s.time.min;
      if (m > 16.5 * 60 && m < 19.5 * 60) { const k = 1 - Math.abs(m - 18 * 60) / 90; g.fillStyle = 'rgba(200,100,60,' + (0.12 * k) + ')'; g.fillRect(0, 0, D.CW, D.CH); }
      if (m >= 5.5 * 60 && m < 7.5 * 60) { const k = 1 - Math.abs(m - 6.5 * 60) / 60; g.fillStyle = 'rgba(220,150,120,' + (0.1 * Math.max(0, k)) + ')'; g.fillRect(0, 0, D.CW, D.CH); }
      if (s.weather.precip > 0.3 || s.weather.type === 'cloudy') { g.fillStyle = 'rgba(70,80,100,' + (0.12 * day) + ')'; g.fillRect(0, 0, D.CW, D.CH); }
    }
  }

  // ================================================================ OVERLAYS
  let vign;
  function drawOverlays(t) {
    const G = NW.G, p = G.state.player;
    if (!vign) vign = S.mk(D.CW, D.CH, (vg) => { const gr = vg.createRadialGradient(240, 136, 120, 240, 136, 300); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.6)'); vg.fillStyle = gr; vg.fillRect(0, 0, D.CW, D.CH); });
    g.drawImage(vign, 0, 0);
    if (p.temp < 35.6) {
      const k = U.clamp((35.6 - p.temp) / 2.5, 0, 1);
      const gr = g.createRadialGradient(240, 136, 90, 240, 136, 290);
      gr.addColorStop(0, 'rgba(180,210,240,0)'); gr.addColorStop(1, 'rgba(190,220,250,' + (0.55 * k) + ')');
      g.fillStyle = gr; g.fillRect(0, 0, D.CW, D.CH);
      g.fillStyle = 'rgba(235,245,255,' + (0.6 * k) + ')';
      for (let i = 0; i < 60 * k; i++) { const ang = hp(i, 1, 9) * 6.28; const rr = 230 + hp(i, 2, 9) * 60; g.fillRect(240 + Math.cos(ang) * rr, 136 + Math.sin(ang) * rr * 0.6, 2, 2); }
    }
    if (p.temp > 38.3) { const k = U.clamp((p.temp - 38.3) / 1.5, 0, 1); g.fillStyle = 'rgba(200,80,30,' + (0.18 * k * (0.8 + Math.sin(t * 3) * 0.2)) + ')'; g.fillRect(0, 0, D.CW, D.CH); }
    if (p.hp < 35) {
      const k = (35 - p.hp) / 35 * (0.6 + Math.sin(t * 4) * 0.4);
      const gr = g.createRadialGradient(240, 136, 100, 240, 136, 280); gr.addColorStop(0, 'rgba(120,0,0,0)'); gr.addColorStop(1, 'rgba(120,0,0,' + (0.6 * k) + ')');
      g.fillStyle = gr; g.fillRect(0, 0, D.CW, D.CH);
    }
    if (G.hurtFlash > 0) { g.fillStyle = 'rgba(160,0,0,' + (G.hurtFlash * 0.35) + ')'; g.fillRect(0, 0, D.CW, D.CH); }
    if (G.flash > 0) { g.fillStyle = 'rgba(255,255,255,' + (G.flash * 0.6) + ')'; g.fillRect(0, 0, D.CW, D.CH); }
    if (G.fade > 0) { g.fillStyle = 'rgba(0,0,0,' + G.fade + ')'; g.fillRect(0, 0, D.CW, D.CH); }
  }

  Rn.addPrint = function (area, x, y) { prints.push({ area, x: Math.round(x), y: Math.round(y), life: 1 }); if (prints.length > 300) prints.shift(); };

  // ============================================================== WINDOW VIEW
  // Outside view through a window (or from the porch). c: 240x135 canvas.
  Rn.windowView = function (c, wid, t) {
    const vg = c.getContext('2d'); vg.imageSmoothingEnabled = false;
    const s = NW.G.state, Sv = NW.Survival;
    const W2 = c.width, H2 = c.height;
    const day = Sv.daylight();
    const sky = NW.Objects.skyColor();
    const gr = vg.createLinearGradient(0, 0, 0, H2 * 0.6);
    gr.addColorStop(0, S.mix(sky, P.ink, 0.35)); gr.addColorStop(1, sky);
    vg.fillStyle = gr; vg.fillRect(0, 0, W2, H2);
    const front = wid === 'w_front_l' || wid === 'w_front_r';
    const seed = wid.length * 7 + (wid === 'w_front_r' ? 3 : 0);
    // stars & moon
    if (day < 0.3 && (s.weather.type === 'clear' || s.weather.type === 'cloudy')) {
      for (let i = 0; i < 40; i++) { if (s.weather.type === 'cloudy' && i % 3) continue; vg.fillStyle = 'rgba(255,255,255,' + (0.3 + hp(i, 3, seed) * 0.6) + ')'; vg.fillRect(hp(i, 1, seed) * W2, hp(i, 2, seed) * H2 * 0.45, 1, 1); }
      if (s.weather.type === 'clear') { R(vg, P.bone, W2 * 0.75, 14, 10, 10); R(vg, P.white, W2 * 0.75 + 1, 15, 8, 8); R(vg, S.mix(sky, P.ink, 0.2), W2 * 0.75 + 5, 13, 7, 9); }
    }
    // far trees
    const far = S.mix(sky, P.ink, 0.55), mid = S.mix(sky, P.ink, 0.8);
    for (let x = 0; x < W2; x += 3) { const h = 18 + vn(x * 0.06 + seed, 1) * 26; vg.fillStyle = far; vg.beginPath(); vg.moveTo(x - 4, H2 * 0.62); vg.lineTo(x + 1.5, H2 * 0.62 - h); vg.lineTo(x + 7, H2 * 0.62); vg.fill(); }
    // ground
    const snowy = s.weather.snow > 0.3;
    const gcol = snowy ? S.mix(P.sn1, P.ink, (1 - day) * 0.75) : S.mix(P.gr1, P.ink, (1 - day) * 0.7);
    vg.fillStyle = gcol; vg.fillRect(0, H2 * 0.6, W2, H2 * 0.4);
    for (let x = 0; x < W2; x += 5) { const h = 26 + vn(x * 0.09 + seed + 40, 2) * 34; vg.fillStyle = mid; vg.beginPath(); vg.moveTo(x - 6, H2 * 0.66); vg.lineTo(x + 2, H2 * 0.66 - h); vg.lineTo(x + 10, H2 * 0.66); vg.fill(); }
    for (let i = 0; i < 260; i++) { const gx = hp(i, 11, seed) * W2, gy = H2 * 0.62 + hp(i, 12, seed) * H2 * 0.38; vg.fillStyle = snowy ? (hp(i, 13, 1) < 0.5 ? S.mix(P.sn2, P.ink, (1 - day) * 0.75) : S.mix(P.sn0, P.ink, (1 - day) * 0.75)) : S.mix(hp(i, 13, 1) < 0.5 ? P.gr2 : P.gr0, P.ink, (1 - day) * 0.7); vg.fillRect(gx, gy, 2, 1); }
    const snowB = Math.min(3, Math.floor(s.weather.snow * 4 + 0.1));
    vg.save(); vg.filter = 'brightness(' + (0.35 + day * 0.65).toFixed(2) + ')';
    for (let i = 0; i < 5; i++) {
      const tx = (hp(i, 21, seed) * 1.2 - 0.1) * W2; if (front && Math.abs(tx - (wid === 'w_front_l' ? W2 - 40 : 40)) < 30) continue;
      const spr = S.pine(i % 3, snowB, i % 4), sc2 = 1.1 + hp(i, 22, seed) * 0.6, ty = H2 * 0.7 + hp(i, 23, seed) * H2 * 0.12;
      vg.drawImage(spr, tx - spr.width * sc2 / 2, ty - spr.height * sc2, spr.width * sc2, spr.height * sc2);
    }
    if (wid === 'w_storage') { const wp = S.furn.woodpile; vg.drawImage(wp, W2 * 0.18, H2 - 50, wp.width * 1.6, wp.height * 1.6); }
    vg.restore();
    // warm light spilling from this window onto the ground
    const leak = Sv.light.winLeak[wid] || 0;
    if (leak > 0.03) { const lgd = vg.createRadialGradient(W2 / 2, H2, 4, W2 / 2, H2, 90); lgd.addColorStop(0, S.rgba(P.f3, Math.min(0.45, leak * 0.4))); lgd.addColorStop(1, 'rgba(0,0,0,0)'); vg.fillStyle = lgd; vg.fillRect(0, H2 * 0.5, W2, H2 * 0.5); }
    // porch (front windows show the porch & front door to the side)
    const ent = [];
    if (front) {
      const doorX = wid === 'w_front_l' ? W2 - 40 : 40;
      R(vg, S.mix(P.wood2, P.ink, 0.5), 0, H2 - 18, W2, 18); for (let x = 0; x < W2; x += 8) R(vg, S.mix(P.wood1, P.ink, 0.5), x, H2 - 18, 1, 18);
      R(vg, S.mix(P.wood3, P.ink, 0.4), doorX - 14, H2 - 60, 28, 44);
      const vs = s.night.vis;
      if (vs) {
        const v = s.visitors[vs.vid], vis = NW.Night.visual(v);
        if (vis.footprints) { const fromLeft = U.strHash(v.id) % 2; for (let i = 0; i < 9; i++) { const fx = fromLeft ? doorX - 30 - i * 14 : doorX + 30 + i * 14; R(vg, P.sn0, fx, H2 - 24 - i * 3, 4, 2); } }
        ent.push(() => { vg.save(); vg.translate(doorX, H2 - 16); vg.scale(2, 2); S.human(vg, 0, 0, Object.assign({ dir: 'up', snowy: vis.snowy }, v.app)); vg.restore();
          if (vis.breath) { const ph = (t % 2.6) / 2.6; if (ph < 0.6) { vg.fillStyle = 'rgba(230,236,245,' + (0.5 * (1 - ph / 0.6)) + ')'; vg.beginPath(); vg.arc(doorX + 4 + ph * 14, H2 - 60 - ph * 10, 3 + ph * 8, 0, 6.3); vg.fill(); } } });
      }
      if (NW.Night.scratcherNear('front')) {
        const sc = s.night.sc; const f = sc.stage === 'approach' ? Math.min(1, sc.t / 14) : 1;
        ent.push(() => { vg.save(); vg.translate(U.lerp(W2 / 2, doorX, f), U.lerp(H2 * 0.68, H2 - 16, f)); vg.scale(2, 2); S.scratcher(vg, 0, 0, t, doorX > W2 / 2 ? 1 : -1); vg.restore(); });
      }
    }
    if (wid === 'w_storage' && NW.Night.scratcherNear('back')) {
      const sc = s.night.sc; const f = sc.stage === 'approach' ? Math.min(1, sc.t / 14) : 1;
      ent.push(() => { vg.save(); vg.translate(U.lerp(40, W2 - 30, f), U.lerp(H2 * 0.7, H2 - 10, f)); vg.scale(2, 2); S.scratcher(vg, 0, 0, t, 1); vg.restore(); });
    }
    const lh = s.night.lh;
    if (s.night.active && lh.stage === 'circling' && ((Math.floor(t / 3) + seed) % 4 === 0)) ent.push(() => { vg.save(); vg.globalAlpha = 0.6; vg.translate((t * 30 + seed * 40) % (W2 + 60) - 30, H2 * 0.66); vg.scale(1.4, 1.4); S.lightHunter(vg, 0, 0, t); vg.restore(); });
    if (s.night.active && !NW.Night.lhAt(wid) && ((Math.floor(t / 6) * 7 + seed) % 11) === 0) {
      const ph = (t % 6) / 6; const fx = -20 + ph * (W2 + 40);
      ent.push(() => { vg.fillStyle = 'rgba(5,6,10,0.85)'; vg.fillRect(fx, H2 * 0.66 - 34, 6, 30); vg.fillRect(fx + 1, H2 * 0.66 - 40, 4, 6); vg.fillRect(fx - 2, H2 * 0.66 - 30, 2, 18); vg.fillRect(fx + 6, H2 * 0.66 - 30, 2, 18); });
    }
    ent.forEach((f) => f());
    // night darkness
    vg.fillStyle = 'rgba(4,6,14,' + ((1 - day) * 0.55) + ')'; vg.fillRect(0, 0, W2, H2);
    if (leak > 0.03) { const lgd = vg.createRadialGradient(W2 / 2, H2, 4, W2 / 2, H2, 110); lgd.addColorStop(0, S.rgba(P.f3, Math.min(0.25, leak * 0.25))); lgd.addColorStop(1, 'rgba(0,0,0,0)'); vg.globalCompositeOperation = 'lighter'; vg.fillStyle = lgd; vg.fillRect(0, 0, W2, H2); vg.globalCompositeOperation = 'source-over'; }
    // weather
    const w = s.weather;
    if (w.precip > 0.05) {
      vg.fillStyle = w.type === 'rain' ? 'rgba(170,190,215,0.6)' : 'rgba(240,244,250,0.9)';
      for (let i = 0; i < w.precip * 120; i++) {
        const x = (hp(i, 4, seed) * W2 + t * w.wind * 60 * (0.5 + hp(i, 5, 1))) % W2, y = (hp(i, 6, seed) * H2 + t * (w.type === 'rain' ? 160 : 24) * (0.6 + hp(i, 7, 2))) % H2;
        vg.fillRect(x, y, 1, w.type === 'rain' ? 4 : (hp(i, 8, 3) > 0.7 ? 2 : 1));
      }
    }
    if (w.fog > 0.1) { vg.globalAlpha = Math.min(0.7, w.fog * 0.8); vg.drawImage(fogC, (t * 5) % 256 - 256, 0); vg.drawImage(fogC, (t * 5) % 256, 0); vg.globalAlpha = 1; }
    // Light Hunter pressed to THIS window
    if (NW.Night.lhAt(wid)) {
      vg.fillStyle = 'rgba(0,0,0,0.5)'; vg.fillRect(0, 0, W2, H2);
      S.lhFace(vg, W2 / 2, H2 * 0.55, t);
      const pl = 0.7 + Math.sin(t * 5) * 0.3; vg.fillStyle = S.rgba(P.glow, 0.15 * pl); vg.fillRect(0, 0, W2, H2);
    }
    // glass: cracks, frame
    const win = s.cabin.windows[wid];
    if (win.glass < 70) { vg.strokeStyle = 'rgba(230,240,250,0.7)'; vg.lineWidth = 1; vg.beginPath(); vg.moveTo(30, 0); vg.lineTo(70, 60); vg.lineTo(50, H2); vg.moveTo(70, 60); vg.lineTo(W2, 40); if (win.glass < 35) { vg.moveTo(160, 0); vg.lineTo(130, 70); vg.lineTo(190, H2); } vg.stroke(); }
    if (win.glass <= 0) { vg.fillStyle = 'rgba(0,0,0,0.0)'; }
    vg.fillStyle = 'rgba(200,220,240,0.06)'; vg.fillRect(6, 4, 10, H2 - 8);
    R(vg, P.wood1, W2 / 2 - 2, 0, 4, H2); R(vg, P.wood1, 0, H2 / 2 - 2, W2, 4);
    if (win.curtClosed) { for (let x = 0; x < W2 / 2 - 14; x += 2) { R(vg, x % 6 ? P.r1 : P.r0, x, 0, 2, H2); R(vg, x % 6 ? P.r1 : P.r0, W2 - x - 2, 0, 2, H2); } }
    vg.strokeStyle = P.wood0; vg.lineWidth = 6; vg.strokeRect(0, 0, W2, H2);
  };

  // Peephole: fish-eye view of the porch
  Rn.peephole = function (c, t) {
    const vg = c.getContext('2d'); vg.imageSmoothingEnabled = false;
    const s = NW.G.state;
    vg.fillStyle = '#000'; vg.fillRect(0, 0, c.width, c.height);
    vg.save();
    vg.beginPath(); vg.arc(c.width / 2, c.height / 2, c.height / 2 - 4, 0, 6.3); vg.clip();
    const vs = s.night.vis;
    const tmp = Rn._pp || (Rn._pp = S.mk(64, 64));
    const tg = tmp.getContext('2d');
    if (vs) {
      const v = s.visitors[vs.vid], vis = NW.Night.visual(v);
      const blink = vis.blinks && (t % 3.7) < 0.14;
      S.portrait(tg, v.app, { t, blink, breath: vis.breath, snowy: vis.snowy, wet: vis.wet, eyeGlow: v.mimic && v.tells.includes('nobreath') && (t % 9) < 0.25 });
    } else {
      R(tg, P.night, 0, 0, 64, 64);
      for (let y = 0; y < 64; y += 6) { R(tg, y % 12 ? P.log1 : P.log0, 0, y, 64, 5); }
      tg.fillStyle = 'rgba(0,0,0,0.5)'; tg.fillRect(0, 0, 64, 64);
      if (s.weather.precip > 0.1) { tg.fillStyle = 'rgba(240,244,250,0.8)'; for (let i = 0; i < 20; i++) tg.fillRect((hp(i, 1, 2) * 64 + t * 10) % 64, (hp(i, 2, 2) * 64 + t * 20) % 64, 1, 1); }
    }
    const k = c.height / 64;
    vg.drawImage(tmp, (c.width - 64 * k) / 2, 0, 64 * k, 64 * k);
    const gr = vg.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.2, c.width / 2, c.height / 2, c.height / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.8, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0.95)');
    vg.fillStyle = gr; vg.fillRect(0, 0, c.width, c.height);
    vg.restore();
  };

  Rn.revealView = function (c, v, t) {
    const vg = c.getContext('2d'); vg.imageSmoothingEnabled = false;
    const tmp = Rn._rv || (Rn._rv = S.mk(64, 64));
    S.portrait(tmp.getContext('2d'), v.app, { t, reveal: Math.min(1.2, t * 1.5) });
    vg.fillStyle = '#000'; vg.fillRect(0, 0, c.width, c.height);
    const k = c.height / 64; const j = (Math.random() - 0.5) * 6;
    vg.drawImage(tmp, (c.width - 64 * k) / 2 + j, j, 64 * k, 64 * k);
    vg.fillStyle = 'rgba(120,0,0,' + (0.25 + Math.random() * 0.2) + ')'; vg.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 6; i++) { const y = Math.random() * c.height; vg.drawImage(c, 0, y, c.width, 4, (Math.random() - 0.5) * 20, y, c.width, 4); }
  };

  Rn.portraitTo = function (c, v, opts) {
    const tmp = S.mk(64, 64); S.portrait(tmp.getContext('2d'), v.app, opts || {});
    const vg = c.getContext('2d'); vg.imageSmoothingEnabled = false; vg.drawImage(tmp, 0, 0, c.width, c.height);
  };

  // ================================================================ MENU SCENE
  const menuSnow = [];
  Rn.menuScene = function (c, t, dt) {
    const mg = c.getContext('2d'); mg.imageSmoothingEnabled = false;
    const W2 = c.width, H2 = c.height;
    const gr = mg.createLinearGradient(0, 0, 0, H2);
    gr.addColorStop(0, '#05070e'); gr.addColorStop(0.6, '#121a2c'); gr.addColorStop(1, '#1b2335');
    mg.fillStyle = gr; mg.fillRect(0, 0, W2, H2);
    for (let i = 0; i < 70; i++) { mg.fillStyle = 'rgba(255,255,255,' + (0.2 + hp(i, 1, 4) * 0.6 * (0.7 + Math.sin(t * 2 + i) * 0.3)) + ')'; mg.fillRect(hp(i, 2, 4) * W2, hp(i, 3, 4) * H2 * 0.5, 1, 1); }
    mg.fillStyle = '#e9e5d6'; mg.beginPath(); mg.arc(W2 * 0.78 + 8, 38, 9, 0, 6.3); mg.fill(); mg.fillStyle = '#c9c4b2'; mg.fillRect(W2 * 0.78 + 4, 35, 3, 2); mg.fillRect(W2 * 0.78 + 10, 41, 2, 2); mg.fillStyle = '#0b1120'; mg.beginPath(); mg.arc(W2 * 0.78 + 13, 35, 8.5, 0, 6.3); mg.fill();
    const mg2 = mg.createRadialGradient(W2 * 0.78 + 6, 38, 4, W2 * 0.78 + 6, 38, 60); mg2.addColorStop(0, 'rgba(200,210,230,0.15)'); mg2.addColorStop(1, 'rgba(0,0,0,0)'); mg.fillStyle = mg2; mg.fillRect(0, 0, W2, 120);
    for (let layer = 0; layer < 3; layer++) {
      const col = ['#0f1626', '#0b111d', '#070b13'][layer];
      const base = H2 * (0.55 + layer * 0.08), hgt = 40 + layer * 25, step = 7 + layer * 4;
      for (let x = -20; x < W2 + 20; x += step) {
        const h = hgt * (0.6 + vn(x * 0.05 + layer * 30, layer) * 0.7);
        mg.fillStyle = col; mg.beginPath(); mg.moveTo(x - step, base); mg.lineTo(x + step / 2, base - h); mg.lineTo(x + step * 2, base); mg.fill();
      }
    }
    mg.fillStyle = '#c7d2df'; mg.fillRect(0, H2 * 0.74, W2, H2);
    mg.fillStyle = '#a6b3c4'; for (let x = 0; x < W2; x += 2) mg.fillRect(x, H2 * 0.74 + vn(x * 0.04, 9) * 6, 2, 2);
    // cabin silhouette with lit window
    const cx = W2 * 0.3, cy = H2 * 0.74;
    mg.fillStyle = '#1c130e'; mg.fillRect(cx - 60, cy - 46, 120, 46);
    mg.fillStyle = '#2b1c13'; mg.beginPath(); mg.moveTo(cx - 72, cy - 44); mg.lineTo(cx, cy - 92); mg.lineTo(cx + 72, cy - 44); mg.fill();
    mg.fillStyle = '#dfe7f0'; mg.beginPath(); mg.moveTo(cx - 72, cy - 44); mg.lineTo(cx, cy - 92); mg.lineTo(cx + 72, cy - 44); mg.lineTo(cx + 60, cy - 46); mg.lineTo(cx, cy - 84); mg.lineTo(cx - 60, cy - 46); mg.fill();
    mg.fillStyle = '#3a3f4a'; mg.fillRect(cx - 40, cy - 98, 12, 30);
    const fl = 0.85 + Math.sin(t * 9) * 0.06 + Math.sin(t * 3.3) * 0.05;
    mg.fillStyle = 'rgba(255,183,70,' + fl + ')'; mg.fillRect(cx - 40, cy - 34, 18, 14); mg.fillRect(cx + 22, cy - 34, 18, 14);
    mg.fillStyle = '#1c130e'; mg.fillRect(cx - 32, cy - 34, 2, 14); mg.fillRect(cx + 30, cy - 34, 2, 14); mg.fillRect(cx - 8, cy - 30, 16, 30);
    mg.globalCompositeOperation = 'lighter';
    const wg = mg.createRadialGradient(cx, cy - 20, 4, cx, cy - 10, 90); wg.addColorStop(0, 'rgba(255,170,70,' + (0.22 * fl) + ')'); wg.addColorStop(1, 'rgba(0,0,0,0)');
    mg.fillStyle = wg; mg.fillRect(cx - 120, cy - 120, 240, 200);
    mg.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 8; i++) { const ph = (t * 0.2 + i / 8) % 1; mg.fillStyle = 'rgba(150,155,170,' + (0.3 * (1 - ph)) + ')'; mg.beginPath(); mg.arc(cx - 34 + ph * 40, cy - 100 - ph * 60, 3 + ph * 10, 0, 6.3); mg.fill(); }
    // the tall figure at the treeline, barely visible
    const fx = W2 * 0.06 + Math.sin(t * 0.1) * 3;
    mg.save(); mg.globalAlpha = 0.28 + Math.sin(t * 0.5) * 0.08; S.lightHunter(mg, fx, H2 * 0.72, t, 1.3); mg.restore();
    // foreground pines
    for (let i = 0; i < 5; i++) { const spr = S.pine(2, 3, i % 4); mg.save(); mg.globalAlpha = 1; mg.filter = 'brightness(0.35)'; mg.drawImage(spr, (i < 2 ? i * 40 - 10 : W2 - (i - 1) * 38), H2 - spr.height * 1.6, spr.width * 1.6, spr.height * 1.6); mg.restore(); }
    if (menuSnow.length < 140) for (let i = 0; i < 140; i++) menuSnow.push({ x: Math.random() * W2, y: Math.random() * H2, z: Math.random() });
    mg.fillStyle = 'rgba(240,244,250,0.85)';
    menuSnow.forEach((p) => { p.y += (14 + p.z * 22) * dt; p.x += (12 + Math.sin(t + p.z * 9) * 8) * dt * (0.5 + p.z); if (p.y > H2) { p.y = -2; p.x = Math.random() * W2; } if (p.x > W2) p.x = 0; mg.fillRect(p.x, p.y, p.z > 0.7 ? 2 : 1, p.z > 0.7 ? 2 : 1); });
    const vg2 = mg.createRadialGradient(W2 / 2, H2 / 2, H2 * 0.3, W2 / 2, H2 / 2, W2 * 0.7); vg2.addColorStop(0, 'rgba(0,0,0,0)'); vg2.addColorStop(1, 'rgba(0,0,0,0.7)'); mg.fillStyle = vg2; mg.fillRect(0, 0, W2, H2);
  };

  // ======================================================================= MAP
  Rn.map = function (c, opts) {
    const mg = c.getContext('2d'); mg.imageSmoothingEnabled = false;
    const s = NW.G.state;
    const cw = 90, ch = 51, pad = 6;
    mg.fillStyle = '#d8ccae'; mg.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 900; i++) { mg.fillStyle = 'rgba(120,90,50,' + (hp(i, 1, 6) * 0.12) + ')'; mg.fillRect(hp(i, 2, 6) * c.width, hp(i, 3, 6) * c.height, 2, 2); }
    for (let ay = 0; ay < 5; ay++) for (let ax = 0; ax < 5; ax++) {
      const id = D.areaId(ax, ay), x0 = pad + ax * (cw + 2), y0 = pad + ay * (ch + 2);
      const known = s.world.visited[id] || id === 'f_2_2' || opts.all;
      if (!known) { mg.fillStyle = 'rgba(80,70,50,0.25)'; mg.fillRect(x0, y0, cw, ch); mg.fillStyle = 'rgba(80,60,40,0.5)'; mg.font = '10px monospace'; mg.fillText('?', x0 + cw / 2 - 3, y0 + ch / 2 + 3); continue; }
      const a = W.get(id);
      for (let ty = 0; ty < 17; ty++) for (let tx = 0; tx < 30; tx++) {
        const t = W.tile(a, tx, ty);
        let col = '#b8b08a';
        if (t === T.DIRT) col = '#8a6a44'; else if (t === T.WATER || t === T.FORD) col = '#5c8db0'; else if (t === T.ICE) col = '#a9c8da'; else if (t === T.ASH) col = '#5a5550'; else if (t === T.MUD) col = '#6b6248'; else if (t === T.ROCKG) col = '#8a8a86'; else if (t === T.BUILDING) col = '#5a3a24'; else if (t === T.BRIDGE) col = s.world.bridgeOut ? '#5c8db0' : '#7a4a2c'; else if (t === T.STONES) col = '#7a8290'; else if (t === T.DOCK) col = '#7a4a2c';
        mg.fillStyle = col; mg.fillRect(x0 + tx * 3, y0 + ty * 3, 3, 3);
      }
      a.objs.forEach((o) => { if (o.type === 'tree') { mg.fillStyle = o.kind === 'birch' ? '#a89a40' : '#3d5a3a'; mg.fillRect(x0 + Math.floor(o.x / 16) * 3, y0 + Math.floor(o.y / 16) * 3 - 1, 3, 3); } });
      mg.strokeStyle = 'rgba(70,50,30,0.6)'; mg.lineWidth = 1; mg.strokeRect(x0 + 0.5, y0 + 0.5, cw - 1, ch - 1);
      if (s.world.dropArea === id) { mg.fillStyle = '#b02020'; mg.fillRect(x0 + cw - 12, y0 + 4, 8, 8); mg.fillStyle = '#fff'; mg.fillRect(x0 + cw - 9, y0 + 5, 2, 6); }
      if (s.world.cairnSeen === id) { mg.fillStyle = '#a5352e'; mg.fillRect(x0 + 4, y0 + 4, 5, 5); mg.fillStyle = '#3a2410'; mg.font = 'bold 9px monospace'; mg.fillText('?!', x0 + 11, y0 + 11); }
    }
    // cairn as marked on the official map
    { const x0 = pad + 1 * (cw + 2), y0 = pad + 2 * (ch + 2); mg.fillStyle = '#a5352e'; mg.fillRect(x0 + 21 * 3 - 2, y0 + 4 * 3 - 2, 5, 5); }
    // labels
    mg.font = '9px monospace';
    for (let ay = 0; ay < 5; ay++) for (let ax = 0; ax < 5; ax++) {
      const id = D.areaId(ax, ay); const known = s.world.visited[id] || id === 'f_2_2' || opts.all || D.AREAS[id].lm;
      if (!known) continue;
      const x0 = pad + ax * (cw + 2), y0 = pad + ay * (ch + 2);
      const name = D.AREAS[id].name;
      mg.fillStyle = 'rgba(232,222,196,0.85)'; const tw = mg.measureText(name).width; mg.fillRect(x0 + cw / 2 - tw / 2 - 2, y0 + ch - 12, tw + 4, 10);
      mg.fillStyle = s.world.visited[id] || id === 'f_2_2' ? '#2a1a0c' : '#7a6a50'; mg.fillText(name, x0 + cw / 2 - tw / 2, y0 + ch - 4);
    }
    // markers from feature modules (HQ orders...): { area, x, y, label, color }
    NW.Hooks.collect('mapMarks', s).forEach((m) => {
      if (!m || !D.AREAS[m.area]) return;
      const [mx, my] = D.areaXY(m.area);
      const x = pad + mx * (cw + 2) + (m.x == null ? 240 : m.x) / 16 * 3, y = pad + my * (ch + 2) + (m.y == null ? 136 : m.y) / 16 * 3;
      mg.fillStyle = m.color || '#1d5fa0'; mg.beginPath(); mg.moveTo(x, y - 7); mg.lineTo(x + 5, y); mg.lineTo(x, y + 7); mg.lineTo(x - 5, y); mg.closePath(); mg.fill();
      mg.strokeStyle = '#000'; mg.lineWidth = 1; mg.stroke();
      if (m.label) { mg.font = 'bold 9px monospace'; const tw = mg.measureText(m.label).width; mg.fillStyle = 'rgba(232,222,196,0.9)'; mg.fillRect(x + 6, y - 6, tw + 4, 11); mg.fillStyle = m.color || '#1d5fa0'; mg.fillText(m.label, x + 8, y + 2); }
    });
    // player marker
    if (opts.player) {
      const pa = NW.G.area;
      let ax = 2, ay = 2, px = 15, py = 10;
      if (pa.kind === 'forest') { ax = pa.ax; ay = pa.ay; px = s.player.x / 16; py = s.player.y / 16; }
      else if (pa.kind === 'interior' && pa.def && pa.def.mapAt) { const m = pa.def.mapAt; [ax, ay] = D.areaXY(m.area); px = m.x / 16; py = m.y / 16; }
      const x = pad + ax * (cw + 2) + px * 3, y = pad + ay * (ch + 2) + py * 3;
      const bl = (Date.now() / 300) % 2 < 1;
      mg.fillStyle = bl ? '#d02020' : '#fff'; mg.fillRect(x - 3, y - 3, 6, 6); mg.strokeStyle = '#000'; mg.strokeRect(x - 3.5, y - 3.5, 7, 7);
    }
    // compass
    mg.fillStyle = '#3a2a1a'; mg.font = 'bold 10px monospace'; mg.fillText('N', c.width - 14, 14); mg.fillRect(c.width - 11, 16, 1, 8);
  };
})(window.NW);
