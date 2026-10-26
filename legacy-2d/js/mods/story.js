'use strict';
// Story module: the opening scene, the scrolling credits, and the guided first day.
(function (NW) {
  const U = NW.U, D = NW.D, S = NW.S, P = S.P, R = S.R;
  const G = () => NW.G;
  const H = NW.Hooks;
  const st = () => NW.mod('story', () => ({ guideOff: false, guideDone: false, step: -1 }));

  const F_UI = '16px VT323, "Lucida Console", monospace';
  const F_SMALL = '13px VT323, "Lucida Console", monospace';
  const F_TITLE = '700 24px "Pixelify Sans", VT323, monospace';
  const F_BIG = '700 30px "Pixelify Sans", VT323, monospace';
  const F_DOC = '12px "Special Elite", "Courier New", monospace';
  const C_TEXT = '#e8dcc4', C_DIM = '#9c8f7a', C_AMBER = '#f2b84b', C_INK = '#2b1d10';
  H.on('boot', () => { try { if (document.fonts) [F_UI, F_TITLE, F_DOC].forEach((f) => document.fonts.load(f)); } catch (e) { /* fonts are optional */ } });

  // ============================================================ HELPERS
  function txt(g, s, x, y, font, col, align, shadow) {
    g.font = font; g.textAlign = align || 'left'; g.textBaseline = 'top';
    if (shadow !== false) { g.fillStyle = shadow || 'rgba(0,0,0,0.85)'; g.fillText(s, Math.round(x) + 1, Math.round(y) + 1); }
    g.fillStyle = col; g.fillText(s, Math.round(x), Math.round(y));
  }
  // Stepped, dithered vertical gradient: stops [[t, hex], ...]
  function bands(g, x0, y0, w, h, stops, n) {
    const col = (t) => { for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const a = stops[i - 1], b = stops[i]; return S.mix(a[1], b[1], (t - a[0]) / (b[0] - a[0] || 1)); } return stops[stops.length - 1][1]; };
    n = n || 16;
    for (let y = 0; y < h; y++) {
      const f = y / h * n, i = Math.floor(f);
      R(g, col(i / n), x0, y0 + y, w, 1);
      if (f - i > 0.5) { g.fillStyle = col((i + 1) / n); for (let x = (y & 1); x < w; x += 2) g.fillRect(x0 + x, y0 + y, 1, 1); }
    }
  }
  const tint = (spr, col, a, key) => S.cached('sty_t' + key, () => S.mk(spr.width, spr.height, (g) => { g.drawImage(spr, 0, 0); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = a; g.fillStyle = col; g.fillRect(0, 0, spr.width, spr.height); }));
  const glow = (g, x, y, r, rgb, a) => {
    const gr = g.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.globalCompositeOperation = 'source-over';
  };
  const ease = (t) => 1 - Math.pow(1 - U.clamp(t, 0, 1), 3);
  function circle(g, c, cx, cy, r) { for (let dy = -r; dy <= r; dy++) { const h = Math.floor(Math.sqrt(r * r - dy * dy)); R(g, c, cx - h, cy + dy, h * 2 + 1, 1); } }

  // Snow shared by the outdoor shots
  const flakes = [];
  function snow(g, dt, wind, x0, y0, w, h) {
    if (!flakes.length) for (let i = 0; i < 130; i++) flakes.push({ x: Math.random() * 480, y: Math.random() * 272, z: Math.random() });
    g.fillStyle = 'rgba(236,242,250,0.85)';
    for (const p of flakes) {
      p.y += (12 + p.z * 20) * dt; p.x += (wind + Math.sin(p.y * 0.05 + p.z * 9) * 6) * dt * (0.5 + p.z);
      if (p.y > 272) { p.y = -2; p.x = Math.random() * 480; } if (p.x > 480) p.x -= 480; if (p.x < 0) p.x += 480;
      if (x0 != null && (p.x < x0 || p.y < y0 || p.x > x0 + w || p.y > y0 + h)) continue;
      const s = p.z > 0.72 ? 2 : 1; g.fillRect(p.x | 0, p.y | 0, s, s);
    }
  }

  // ======================================================= SCENE RUNNER
  // A full-screen scene on the game canvas. Esc / Enter / Space / click ends it early.
  const SKIP = ['Escape', 'Enter', 'NumpadEnter', 'Space'];
  function runScene(o) {
    const g = G();
    g.mode = 'scene'; g.paused = false; g.keys = {};
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    if (o.music) NW.Audio.setMusic(o.music);
    let ended = false;
    const sc = {
      t: 0, story: o.id,
      end() { if (ended) return; ended = true; if (NW.scene === sc) NW.scene = null; try { o.onEnd(); } catch (e) { console.error(e); } },
      frame(ctx, dt) {
        if (ended) return;
        sc.t += dt;
        ctx.imageSmoothingEnabled = false;
        o.frame(ctx, sc.t, dt, sc);
        if (sc.t >= o.dur()) sc.end();
      },
      key(code, e) { if (sc.t > 0.4 && !(e && e.repeat) && SKIP.includes(code)) { G().sfx('click'); sc.end(); } },
      click() { if (sc.t > 0.4) sc.end(); },
    };
    NW.scene = sc;
    return sc;
  }

  // ======================================================== OPENING SCENE
  const INTRO_LEN = 65;
  const ROAD_Y = 214;
  let intro = null; // per-play scratch data (canvases, footprints, cues)

  function truckSprite() {
    return S.cached('sty_truck', () => S.mk(64, 30, (g) => {
      // bed with a snowy tarp
      R(g, P.rg1, 1, 12, 32, 11); R(g, P.rg2, 1, 12, 32, 2); R(g, P.rg0, 1, 21, 32, 2);
      R(g, P.sn1, 2, 9, 29, 3); R(g, P.sn2, 3, 8, 10, 2); R(g, P.sn2, 17, 8, 11, 2); R(g, P.sn3, 5, 8, 5, 1); R(g, P.sn3, 20, 8, 4, 1);
      R(g, P.r2, 0, 14, 2, 3); R(g, P.i3, 0, 21, 3, 2);
      // cab
      R(g, P.rg2, 32, 3, 20, 20); R(g, P.rg3, 32, 3, 20, 1); R(g, P.rg1, 50, 3, 2, 20);
      R(g, P.sn3, 32, 1, 19, 2); R(g, P.sn2, 33, 0, 14, 1);
      R(g, P.w1, 36, 6, 13, 7); R(g, P.w2, 37, 6, 3, 7); R(g, P.w3, 37, 6, 1, 3); R(g, P.ink, 36, 12, 13, 1);
      R(g, P.rg0, 35, 5, 1, 17); R(g, P.y1, 36, 16, 14, 1); R(g, P.y0, 36, 17, 14, 1); R(g, P.i3, 38, 14, 3, 1);
      R(g, P.r2, 40, 2, 3, 1); R(g, P.y2, 44, 2, 3, 1);
      // hood, grille, lamps
      R(g, P.rg2, 52, 11, 10, 12); R(g, P.rg3, 52, 11, 10, 1); R(g, P.i1, 60, 13, 2, 7);
      R(g, P.glow, 61, 13, 2, 3); R(g, P.i3, 51, 21, 12, 2);
      R(g, P.i0, 3, 23, 58, 2);
      // wheels
      [12, 48].forEach((cx) => { circle(g, P.i0, cx, 24, 5); circle(g, P.i1, cx, 24, 3); R(g, P.i3, cx - 1, 23, 3, 3); R(g, P.i4, cx - 1, 23, 1, 1); R(g, P.sn2, cx - 5, 28, 11, 1); });
    }));
  }

  // Precomputed backdrop of the logging road at dusk (480x272).
  function roadBg() {
    return S.cached('sty_road', () => S.mk(480, 272, (g) => {
      bands(g, 0, 0, 480, 196, [[0, '#090c1c'], [0.35, '#1a1e3a'], [0.58, '#382f50'], [0.76, '#74475a'], [0.92, '#b46a55'], [1, '#d98c5c']], 22);
      for (let i = 0; i < 60; i++) { const y = U.hashf(i, 2, 77) * 90; R(g, S.rgba(P.white, 0.25 + U.hashf(i, 3, 77) * 0.6 * (1 - y / 90)), U.hashf(i, 1, 77) * 480, y, 1, 1); }
      // far peaks with snow caps, then a nearer ridge
      for (let x = 0; x < 480; x++) {
        const n = S.fbm(x * 0.011, 0.5, 31), h = 16 + Math.max(0, n - 0.25) * 150 + Math.abs(((x * 0.9) % 60) - 30) * -0.25 + 8, top = Math.round(190 - h);
        R(g, '#3a3452', x, top, 1, 196 - top);
        if (h > 52) R(g, '#9a94b0', x, top, 1, Math.round((h - 52) * 0.45) + 1);
        else if (h > 44 && x % 3 === 0) R(g, '#6e6888', x, top, 1, 1);
        const h2 = 8 + S.fbm(x * 0.02, 3.1, 57) * 30, t2 = Math.round(198 - h2);
        R(g, '#25223a', x, t2, 1, 200 - t2);
      }
      // treelines
      for (let i = 0; i < 46; i++) {
        const sz = U.hashf(i, 7, 9) < 0.35 ? 0 : 1, spr = tint(S.pine(sz, 2, i % 4), '#151a2c', 0.82, 'p1' + sz + (i % 4));
        g.drawImage(spr, Math.round(i * 11 - 8 + U.hashf(i, 4, 9) * 6), 202 - spr.height + Math.round(U.hashf(i, 5, 9) * 4));
      }
      for (let i = 0; i < 16; i++) {
        if (i > 8 && i < 13) continue; // the clearing where the road ends
        const spr = tint(S.pine(2, 2, i % 4), '#0d1322', 0.7, 'p2' + (i % 4));
        g.drawImage(spr, Math.round(i * 31 - 10 + U.hashf(i, 6, 9) * 10), 206 - spr.height);
      }
      // the road: packed snow, ruts, banks
      bands(g, 0, 200, 480, 36, [[0, '#7c8098'], [0.5, '#9396ad'], [1, '#a3a6bb']], 6);
      for (let x = 0; x < 480; x++) {
        R(g, '#b9bccd', x, 199 + Math.round(S.vnoise(x * 0.15, 1, 5) * 3), 1, 2);
        if (x < 400) { R(g, '#6d7189', x, ROAD_Y + 2 + (x % 7 === 0 ? 1 : 0), 1, 1); R(g, '#6d7189', x, ROAD_Y + 8, 1, 1); }
        if (U.hashf(x, 9, 3) < 0.15) R(g, '#c4c6d6', x, 203 + Math.floor(U.hashf(x, 8, 3) * 30), 1, 1);
      }
      // where the road gives out: a fallen pine half buried in a drift
      R(g, P.wood1, 388, ROAD_Y - 9, 86, 7); R(g, P.wood2, 388, ROAD_Y - 9, 86, 2); R(g, P.wood0, 388, ROAD_Y - 3, 86, 1);
      R(g, P.wood3, 386, ROAD_Y - 9, 4, 7); R(g, P.wood5, 387, ROAD_Y - 7, 2, 3);
      [[404, -16, 1], [426, -15, -1], [452, -17, 1]].forEach(([x, h, d]) => { for (let k = 0; k < 7; k++) R(g, P.wood1, x + k * d, ROAD_Y - 9 + Math.round(h * k / 7), 2, 2); });
      for (let i = 0; i < 80; i++) { const x = 400 + i, h = Math.round(Math.sin(Math.min(1, i / 60) * Math.PI * 0.5 + (i > 60 ? (i - 60) / 40 : 0)) * 14 + S.vnoise(i * 0.3, 2, 8) * 3); R(g, '#b3b6c9', x, ROAD_Y + 8 - h, 1, h + 10); R(g, '#d0d3e0', x, ROAD_Y + 8 - h, 1, 2); }
      R(g, '#d6d9e4', 388, ROAD_Y - 11, 40, 2); R(g, '#e8ebf2', 392, ROAD_Y - 12, 22, 1);
    }));
  }
  function shotRoad(g, lt, dt) {
    g.drawImage(roadBg(), 0, 0);
    // stars twinkle a little
    for (let i = 0; i < 6; i++) if (Math.sin(lt * 2 + i * 1.7) > 0.6) R(g, P.white, U.hashf(i, 11, 5) * 480, U.hashf(i, 12, 5) * 70, 1, 1);
    const tx = Math.round(-70 + 372 * ease(lt / 7.2));
    const moving = lt < 7.2, lights = lt < 10.6;
    const bob = moving && Math.floor(lt * 8) % 2 ? 1 : 0;
    // headlight cone and its pool on the snow
    if (lights) {
      const hx = tx + 63, hy = ROAD_Y - 14;
      g.globalCompositeOperation = 'lighter';
      const gr = g.createLinearGradient(hx, 0, hx + 170, 0); gr.addColorStop(0, 'rgba(255,236,170,0.32)'); gr.addColorStop(1, 'rgba(255,236,170,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(hx, hy - 1); g.lineTo(hx + 170, hy - 22); g.lineTo(hx + 170, ROAD_Y + 18); g.lineTo(hx, hy + 3); g.fill();
      g.globalCompositeOperation = 'source-over';
      glow(g, hx + 1, hy + 1, 7, '255,240,190', 0.8);
    }
    // exhaust
    for (let i = 0; i < 5; i++) { const ph = (lt * 0.8 + i / 5) % 1; g.fillStyle = 'rgba(170,175,195,' + (0.3 * (1 - ph)) + ')'; g.fillRect(tx - 4 - ph * 22, ROAD_Y - 4 - ph * 10 - i, 2 + ph * 5, 2 + ph * 4); }
    g.drawImage(tint(truckSprite(), '#161a33', 0.32, 'truck'), tx, ROAD_Y - 27 + bob);
    if (lt > 9.4) R(g, P.ink, tx + 35, ROAD_Y - 23, 13, 15); // door left open
    if (!lights) R(g, P.y0, tx + 61, ROAD_Y - 14, 2, 3);
    else R(g, P.r3, tx + 1, ROAD_Y - 13, 1, 2);
    // the ranger climbs down and walks toward the drift with a lantern
    if (lt > 9.8) {
      const w = lt - 9.8, x = tx + 44 + w * 17, moving2 = w > 0.6;
      g.save(); g.globalAlpha = U.clamp((15.6 - lt) / 0.8, 0, 1);
      S.human(g, x, ROAD_Y + 6, Object.assign({}, S.PLAYER, { dir: 'right', moving: moving2, frame: Math.floor(w * 7), lantern: true, snowy: true }));
      g.restore();
      glow(g, x + 6, ROAD_Y - 2, 26, '255,183,70', 0.28);
    }
    // foreground pines frame the shot
    const fp = tint(S.pine(2, 3, 1), '#05070d', 0.9, 'fg1'), fp2 = tint(S.pine(2, 3, 2), '#05070d', 0.9, 'fg2');
    g.drawImage(fp, -26, 250 - fp.height * 2, fp.width * 2, fp.height * 2);
    g.drawImage(fp2, 446, 254 - fp2.height * 2, fp2.width * 2, fp2.height * 2);
    snow(g, dt, 10);
  }

  // The real cabin clearing, at dusk, with nobody home.
  function shotCabin(g, lt, dt) {
    const s = G().state, W = NW.World, a = W.get('f_2_2');
    if (!intro.cabinList) {
      intro.cabinList = a.objs.filter((o) => o.type !== 'extdoor' && o.layer !== 'floor').slice().sort((p, q) => p.y - q.y);
      intro.prints = []; intro.lastPrint = null;
    }
    // walk: trail mouth -> front of the porch
    const path = [[1.0, 252, 270], [5.2, 247, 230], [7.6, 240, 199]];
    let rx = 252, ry = 270, moving = false;
    for (let i = 0; i < path.length; i++) {
      const [t1, x1, y1] = path[i];
      if (lt < t1) { const [t0, x0, y0] = i ? path[i - 1] : [0, 252, 270]; if (i) { const f = (lt - t0) / (t1 - t0); rx = U.lerp(x0, x1, f); ry = U.lerp(y0, y1, f); moving = true; } break; }
      rx = x1; ry = y1;
    }
    if (moving && (!intro.lastPrint || U.dist(rx, ry, intro.lastPrint.x, intro.lastPrint.y) > 6)) { intro.lastPrint = { x: rx, y: ry }; intro.prints.push({ x: Math.round(rx + (intro.prints.length % 2 ? 1 : -3)), y: Math.round(ry - 1) }); if (intro.prints.length % 2) G().sfx('step', { surface: 'snow', vol: 0.35 }); }
    const inside = lt > 8.7, doorOpen = lt > 8.1 && lt < 9.3, lamp = lt > 10.2;
    // a 2x close-up that follows the ranger up the trail to the porch
    const cx = 120, cy = Math.round(U.clamp(ry - 90, 100, 136));
    const keep = s.stove.setting;
    g.save(); g.setTransform(2, 0, 0, 2, -cx * 2, -cy * 2);
    try {
      s.stove.setting = 'off'; // cold chimney: nobody has been home for days
      g.drawImage(NW.Render.areaBg(a), 0, 0);
      a.objs.forEach((o) => { if (o.layer === 'floor') NW.Objects.draw(g, o, lt); });
      g.fillStyle = 'rgba(70,82,110,0.55)'; intro.prints.forEach((p) => g.fillRect(p.x, p.y, 2, 2));
      let drawn = inside;
      const ranger = () => S.human(g, rx, ry, Object.assign({}, S.PLAYER, { dir: 'up', moving, frame: Math.floor(lt * 7), lantern: true, snowy: true }));
      for (const o of intro.cabinList) {
        if (!drawn && o.y > ry) { ranger(); drawn = true; }
        NW.Objects.draw(g, o, lt);
      }
      if (!drawn) ranger();
      if (doorOpen) { R(g, P.ink, 229, 147, 22, 29); R(g, S.rgba(P.f3, 0.12), 230, 150, 20, 26); if (lt < 8.7) ranger(); }
    } finally { s.stove.setting = keep; g.restore(); }
    // dusk
    g.globalCompositeOperation = 'multiply'; g.fillStyle = '#5a6794'; g.fillRect(0, 0, 480, 272); g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(8,10,24,0.18)'; g.fillRect(0, 0, 480, 272);
    g.save(); g.setTransform(2, 0, 0, 2, -cx * 2, -cy * 2);
    if (!inside) glow(g, rx + 5, ry - 8, 30, '255,183,70', 0.3);
    if (lamp) {
      const f = U.clamp((lt - 10.2) / 0.6, 0, 1) * (0.92 + Math.sin(lt * 9) * 0.05);
      [184, 272].forEach((wx) => { R(g, S.rgba(P.f3, 0.85 * f), wx, 152, 24, 14); R(g, S.rgba(P.f4, 0.5 * f), wx + 2, 153, 8, 5); R(g, P.wood1, wx + 11, 152, 2, 14); glow(g, wx + 12, 168, 30, '255,170,70', 0.2 * f); });
    }
    g.restore();
    snow(g, dt, 8);
  }

  // A letter from home under the lamp.
  function letterBg() {
    return S.cached('sty_letter', () => S.mk(480, 272, (g) => {
      for (let y = 0; y < 272; y += 18) {
        R(g, P.wood3, 0, y, 480, 18); R(g, P.wood2, 0, y + 16, 480, 2); R(g, P.wood4, 0, y, 480, 1);
        for (let i = 0; i < 40; i++) R(g, P.wood2, U.hashf(i, y, 3) * 480, y + 3 + U.hashf(i, y, 4) * 12, 4 + U.hashf(i, y, 5) * 16, 1);
        R(g, P.wood1, (y * 37) % 480, y, 2, 16);
      }
      // envelope, photograph, pencil, mug ring
      R(g, 'rgba(0,0,0,0.35)', 44, 158, 78, 50); R(g, '#d3c6a5', 40, 154, 78, 50); R(g, '#bfb08c', 40, 154, 78, 1);
      for (let i = 0; i < 26; i++) { R(g, '#b6a682', 40 + i * 1.5, 154 + i, 2, 1); R(g, '#b6a682', 116 - i * 1.5, 154 + i, 2, 1); }
      R(g, P.r2, 102, 158, 10, 12); R(g, P.r3, 104, 160, 6, 8); R(g, '#7d6c56', 56, 188, 34, 1); R(g, '#7d6c56', 56, 193, 26, 1);
      R(g, 'rgba(0,0,0,0.35)', 382, 46, 54, 44); g.drawImage(S.furn.photo, 378, 42, 52, 42);
      R(g, P.y1, 350, 208, 62, 4); R(g, P.y0, 350, 211, 62, 1); R(g, P.wood5, 412, 208, 5, 4); R(g, P.i1, 417, 209, 3, 2); R(g, P.r2, 346, 208, 4, 4);
      g.strokeStyle = 'rgba(40,20,10,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(70, 70, 16, 0.3, 5.6); g.stroke();
      // the letter
      R(g, 'rgba(0,0,0,0.4)', 126, 40, 238, 160); R(g, '#e6dcc3', 122, 36, 238, 160);
      R(g, '#d6caae', 122, 88, 238, 1); R(g, '#d6caae', 122, 141, 238, 1); R(g, '#f2ead8', 122, 36, 238, 1); R(g, '#c9bc9c', 359, 36, 1, 160);
      for (let i = 0; i < 9; i++) R(g, '#d8ceb4', 122 + i * 26 + (i % 2) * 4, 195, 10 - (i % 3) * 3, 1);
    }));
  }
  function shotLetter(g, lt) {
    g.drawImage(letterBg(), 0, 0);
    const c = intro.cards.find((k) => k.kind === 'letter');
    let n = Math.max(0, Math.floor((intro.T - c.at) * c.cps));
    c.lines.forEach((l, i) => {
      const part = l.slice(0, Math.max(0, n)); n -= l.length;
      if (part) txt(g, part, i === c.lines.length - 1 ? 340 : 140, 52 + i * 26, F_DOC, C_INK, i === c.lines.length - 1 ? 'right' : 'left', false);
    });
    // lamp light from the upper left, the rest falls into shadow
    const fl = 0.9 + Math.sin(lt * 7) * 0.04 + Math.sin(lt * 2.3) * 0.03;
    const gr = g.createRadialGradient(150, 40, 30, 200, 110, 330); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(4,3,8,' + (0.82 * fl) + ')');
    g.fillStyle = gr; g.fillRect(0, 0, 480, 272);
    glow(g, 120, 30, 170, '255,170,80', 0.13 * fl);
  }

  // Base on the radio.
  function radioBg() {
    return S.cached('sty_radio', () => S.mk(480, 272, (g) => {
      for (let y = 0; y < 160; y += 14) { R(g, P.log2, 0, y, 480, 14); R(g, P.log3, 0, y + 2, 480, 3); R(g, P.log1, 0, y + 10, 480, 3); R(g, P.chink2, 0, y + 13, 480, 1); }
      // window onto the dark
      R(g, P.wood1, 336, 22, 108, 92); R(g, '#0b1324', 342, 28, 96, 80); R(g, '#111c33', 342, 28, 96, 30);
      for (let i = 0; i < 4; i++) { const spr = tint(S.pine(1, 3, i), '#070b14', 0.75, 'w' + i); g.drawImage(spr, 340 + i * 26, 110 - spr.height + (i % 2) * 6); }
      R(g, P.sn2, 342, 100, 96, 8); R(g, P.wood2, 388, 28, 4, 80); R(g, P.wood2, 342, 66, 96, 3); R(g, P.wood3, 336, 112, 108, 5);
      // HQ map pinned to the logs
      R(g, 'rgba(0,0,0,0.35)', 40, 30, 96, 62); g.drawImage(S.furn.wallmap, 36, 26, 96, 60); R(g, P.r2, 82, 28, 2, 2);
      // desk
      for (let y = 160; y < 272; y += 12) { R(g, P.wood4, 0, y, 480, 12); R(g, P.wood3, 0, y + 10, 480, 2); R(g, P.wood5, 0, y, 480, 1); }
      R(g, P.wood2, 0, 158, 480, 3);
      // the set
      R(g, 'rgba(0,0,0,0.45)', 140, 156, 210, 10);
      R(g, P.i1, 134, 74, 206, 86); R(g, P.i2, 136, 76, 202, 82); R(g, P.i3, 136, 76, 202, 2); R(g, P.i0, 136, 156, 202, 2);
      for (let y = 86; y < 146; y += 4) for (let x = 146; x < 196; x += 4) R(g, P.i0, x, y, 2, 2);
      R(g, P.i1, 206, 84, 120, 34); R(g, '#3a2e14', 208, 86, 116, 30);
      for (let x = 212; x < 322; x += 8) R(g, P.y0, x, 88, 1, x % 24 === 4 ? 6 : 3);
      [[220, 136], [262, 136], [304, 136]].forEach(([x, y]) => { circle(g, P.i0, x, y, 9); circle(g, P.i3, x, y, 7); R(g, P.i4, x - 1, y - 6, 2, 5); });
      R(g, P.bone, 140, 80, 34, 4); R(g, P.i0, 146, 81, 22, 2);
      // microphone on its coil
      R(g, P.i1, 372, 132, 22, 26); R(g, P.i2, 374, 134, 18, 20); for (let y = 136; y < 152; y += 3) R(g, P.i0, 376, y, 14, 1);
      R(g, P.i0, 380, 156, 6, 4); R(g, P.i1, 362, 158, 40, 4);
      for (let i = 0; i < 9; i++) R(g, P.i0, 340 + i * 3, 150 + Math.round(Math.sin(i) * 3), 3, 2);
    }));
  }
  function shotRadio(g, lt, dt) {
    g.drawImage(radioBg(), 0, 0);
    const talking = (intro.T > 46 && intro.T < 58.6);
    // tuning needle, signal lamp, static on the dial
    const nx = 262 + Math.round(Math.sin(lt * 0.7) * 3 + (talking ? Math.sin(lt * 23) : 0));
    R(g, P.r3, nx, 87, 1, 28);
    glow(g, 266, 100, 70, '255,190,90', 0.16 + (talking ? Math.random() * 0.06 : 0));
    R(g, talking && Math.sin(lt * 18) > -0.2 ? P.g5 : P.g1, 324, 126, 4, 4);
    if (talking) glow(g, 326, 128, 10, '140,220,120', 0.4);
    if (talking) for (let i = 0; i < 14; i++) R(g, S.rgba(P.white, 0.25 + Math.random() * 0.3), 210 + Math.random() * 110, 88 + Math.random() * 26, 1, 1);
    // snow beyond the glass
    snow(g, dt, 14, 342, 28, 96, 72);
    const gr = g.createRadialGradient(260, 120, 60, 260, 120, 300); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(3,3,8,0.78)');
    g.fillStyle = gr; g.fillRect(0, 0, 480, 272);
  }

  function shotTitle(g, lt, dt) {
    R(g, '#05060a', 0, 0, 480, 272);
    snow(g, dt, 6);
    const a = U.clamp((lt - 0.3) / 1.2, 0, 1);
    g.globalAlpha = a; txt(g, 'THE NIGHT WATCH', 240, 104, F_BIG, C_AMBER, 'center', '#2a1608'); g.globalAlpha = 1;
    const b = U.clamp((lt - 1.8) / 1, 0, 1);
    g.globalAlpha = b; txt(g, 'Morning. Day one. ' + U.numWord(G().finalNight(), true) + ' nights to hold.', 240, 144, F_UI, C_DIM, 'center'); g.globalAlpha = 1;
  }

  const SHOTS = [[0, 16, shotRoad], [16, 32, shotCabin], [32, 45, shotLetter], [45, 59, shotRadio], [59, INTRO_LEN, shotTitle]];
  function introCards() {
    const N = U.numWord(G().finalNight()), Nc = U.numWord(G().finalNight(), true);
    return [
      { at: 1.2, end: 7.6, kind: 'title', lines: ['SILVERPINE BACKCOUNTRY', 'Logging road, mile 14. The last of the light.'] },
      { at: 8.6, end: 15.2, lines: ['The road gives out a mile short of the station.', 'You walk the rest.'] },
      { at: 17.2, end: 22, lines: ['Ranger Station 7. No smoke from the chimney.'] },
      { at: 22.4, end: 27.3, lines: ['The ranger before you stopped answering the radio.', 'Nobody has found them.'] },
      { at: 27.7, end: 31.5, lines: ['Your watch: ' + N + ' nights.', 'Relief comes after night ' + N + '.'] },
      { at: 33.4, end: 44.4, kind: 'letter', cps: 19, lines: [Nc + ' nights, then come home.', 'Don\'t open the door for anyone', 'you don\'t know. I mean it.', 'Not out there.', '- your sister'] },
      { at: 33.6, end: 38.6, lines: ['Folded in your coat pocket: a letter from home.'] },
      { at: 46.0, end: 51.8, kind: 'radio', lines: ['"Base to Watch Seven. Welcome to Station 7, ranger.', 'Learn our protocol. Every real call opens with'] },
      { at: 52.0, end: 58.6, kind: 'radio', lines: ['\'Base to Watch Seven\' and closes with \'Base out.\'', 'Anything else is not us. Don\'t answer it. Base out."'] },
    ];
  }
  const CUES = [[0.2, 'truck', { vol: 0.8 }], [7.3, 'thud', { vol: 0.25 }], [9.3, 'door', { vol: 0.45 }], [10.6, 'click', { vol: 0.5 }], [20.5, 'howl', { vol: 0.15, wet: 0.9 }],
    [24.1, 'door', { vol: 0.5 }], [26.3, 'latch', { vol: 0.4 }], [32.4, 'paper', { vol: 0.6 }], [45.6, 'radio_chirp', { vol: 0.7 }], [52, 'radio_chirp', { vol: 0.5 }], [58.7, 'click', { vol: 0.4 }], [59.6, 'howl', { vol: 0.12, wet: 0.95 }]];

  function drawCards(g, T) {
    let typed = 0;
    for (const c of intro.cards) {
      if (T < c.at || T > c.end) continue;
      const cps = c.cps || 30;
      let n = Math.floor((T - c.at) * cps);
      const total = c.lines.join('').length;
      typed += Math.min(n, total);
      if (c.kind === 'letter') continue; // written on the paper itself
      const a = U.clamp((c.end - T) / 0.5, 0, 1);
      g.globalAlpha = a;
      if (c.kind === 'title') {
        const p0 = c.lines[0].slice(0, n); n -= c.lines[0].length;
        if (p0) txt(g, p0, 26, 30, F_TITLE, C_AMBER, 'left', '#1a0e05');
        const p1 = c.lines[1].slice(0, Math.max(0, n));
        if (p1) txt(g, p1, 27, 58, F_UI, C_TEXT, 'left');
      } else {
        c.lines.forEach((l, i) => {
          const part = l.slice(0, Math.max(0, n)); n -= l.length;
          if (part) txt(g, part, 240, 236 + i * 16 - (c.lines.length === 1 ? -8 : 0), F_UI, c.kind === 'radio' ? C_AMBER : C_TEXT, 'center');
        });
      }
      g.globalAlpha = 1;
    }
    // one key strike per few letters
    if (typed > intro.typed) { if (T - intro.keyT > 0.06) { intro.keyT = T; G().sfx('typewriter', { vol: 0.28 }); } }
    intro.typed = typed;
  }

  function introFrame(g, T, dt) {
    intro.T = T;
    for (const q of CUES) if (!intro.cued[q[0]] && T >= q[0]) { intro.cued[q[0]] = true; G().sfx(q[1], q[2]); }
    const shot = SHOTS.find((s) => T >= s[0] && T < s[1]) || SHOTS[SHOTS.length - 1];
    const lt = T - shot[0];
    R(g, '#000', 0, 0, 480, 272);
    try { shot[2](g, lt, dt); } catch (e) { if (!intro.err) { intro.err = true; console.error(e); } }
    // fades between shots
    const fade = Math.max(U.clamp(1 - lt / 0.9, 0, 1), U.clamp(1 - (shot[1] - T) / 0.9, 0, 1) * (shot[1] < INTRO_LEN ? 1 : 0.6));
    if (fade > 0) { g.fillStyle = 'rgba(0,0,0,' + fade + ')'; g.fillRect(0, 0, 480, 272); }
    // letterbox, captions, skip hint
    if (T < 59) { R(g, '#000', 0, 0, 480, 18); R(g, '#000', 0, 230, 480, 42); }
    drawCards(g, T);
    if (T > 0.8) txt(g, 'Esc · skip', 472, 3, F_SMALL, '#6f6658', 'right', false);
  }

  // filter('playIntro', false, begin, opts): take over and call begin() when the scene ends
  H.on('playIntro', (taken, begin) => {
    if (taken) return undefined;
    intro = { cards: introCards(), cued: {}, typed: 0, keyT: 0, T: 0 };
    runScene({ id: 'intro', music: 'intro', dur: () => INTRO_LEN, frame: introFrame, onEnd: () => { intro = null; begin(); H.emit('introDone'); } });
    return true;
  });

  // ============================================================== CREDITS
  const ROLE = { lighthunter: 'the thing at the window', dweller: 'the dark in the corners', mimic: 'your visitors', scratcher: 'the thing at the door', siphon: 'the weight on the roof', stag: 'the bells in the trees', wolf: 'the howling' };
  const FATE = { alive: 'still out there', safe: 'safe', missing: 'missing', dead: 'lost', taken: 'taken' };
  function creditLines(run) {
    const L = [], add = (k, a, b) => L.push({ k, a, b });
    add('title', 'THE NIGHT WATCH'); add('sub', 'A Night Watch story');
    if (run && G().state) {
      const s = G().state, n = run.night || s.nightsSurvived;
      add('dim', 'Ranger Station 7 · ' + U.numWord(n) + ' night' + (n === 1 ? '' : 's') + ' kept' + (run.ending && run.ending.title ? ' · ' + run.ending.title : ''));
    }
    add('gap', 34); add('head', 'MADE BY');
    [['Design', 'Built with Claude Code'], ['Code', 'Built with Claude Code'], ['Pixel art', 'Built with Claude Code'], ['Sound & music', 'Built with Claude Code']].forEach((p) => add('pair', p[0], p[1]));
    add('gap', 22); add('head', 'CAST');
    add('pair', 'The ranger', 'you'); add('pair', 'Base', 'a voice on the radio'); add('pair', 'Juniper', 'a good dog');
    for (const k in D.BESTIARY) add('pair', D.BESTIARY[k].name, ROLE[k] || 'as itself');
    let people = [];
    if (run && NW.Characters && NW.Characters.summary) { try { people = (NW.Characters.summary().list || []).filter((c) => c && c.name && c.fate && c.fate !== 'unmet'); } catch (e) { people = []; } }
    if (people.length) { add('gap', 22); add('head', 'IN THE FOREST'); people.forEach((c) => add('pair', c.name, FATE[c.fate] || c.fate)); }
    add('gap', 22); add('head', 'TYPEFACES'); add('line', 'Pixelify Sans · VT323 · Special Elite');
    add('gap', 50); add('line', 'Keep the fire low. Keep the door locked.'); add('line', 'Count the breaths.');
    add('gap', 70); add('end', 'Thank you for keeping the watch.');
    let y = 0;
    const HGT = { title: 36, sub: 22, dim: 20, head: 22, pair: 18, line: 18, end: 24 };
    L.forEach((l) => { if (l.k === 'gap') { y += l.a; return; } l.y = y; y += HGT[l.k]; });
    return L;
  }
  const SPEED = 22;
  function creditsFrame(g, t, dt, sc) {
    const c = sc.cr;
    try { NW.Render.menuScene(g.canvas, t + 40, dt); } catch (e) { R(g, '#05060a', 0, 0, 480, 272); }
    g.fillStyle = 'rgba(4,5,9,0.66)'; g.fillRect(0, 0, 480, 272);
    const endY = c.lines[c.lines.length - 1].y;
    let off = 290 - t * SPEED;
    if (endY + off <= 124) { off = 124 - endY; if (c.holdAt == null) c.holdAt = t; }
    for (const l of c.lines) {
      if (l.y == null) continue;
      const y = Math.round(l.y + off); if (y < -40 || y > 280) continue;
      if (l.k === 'title') txt(g, l.a, 240, y, F_TITLE, C_AMBER, 'center', '#1a0e05');
      else if (l.k === 'sub') txt(g, l.a, 240, y, F_UI, C_TEXT, 'center');
      else if (l.k === 'dim') txt(g, l.a, 240, y, F_SMALL, C_DIM, 'center');
      else if (l.k === 'head') txt(g, l.a, 240, y, F_SMALL, C_AMBER, 'center');
      else if (l.k === 'pair') { txt(g, l.a, 232, y, F_UI, C_TEXT, 'right'); txt(g, l.b, 248, y, F_UI, C_DIM, 'left'); }
      else if (l.k === 'line') txt(g, l.a, 240, y, F_UI, C_TEXT, 'center');
      else if (l.k === 'end') txt(g, l.a, 240, y, F_TITLE.replace('24px', '18px'), C_AMBER, 'center', '#1a0e05');
    }
    // soft top and bottom edges
    const top = g.createLinearGradient(0, 0, 0, 40); top.addColorStop(0, 'rgba(0,0,0,0.95)'); top.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = top; g.fillRect(0, 0, 480, 40);
    const bot = g.createLinearGradient(0, 232, 0, 272); bot.addColorStop(0, 'rgba(0,0,0,0)'); bot.addColorStop(1, 'rgba(0,0,0,0.95)'); g.fillStyle = bot; g.fillRect(0, 232, 480, 40);
    const fade = Math.max(U.clamp(1 - t / 1.2, 0, 1), c.holdAt != null ? U.clamp((t - c.holdAt - 4) / 1.2, 0, 1) : 0);
    if (fade > 0) { g.fillStyle = 'rgba(0,0,0,' + fade + ')'; g.fillRect(0, 0, 480, 272); }
    if (t > 0.8) txt(g, 'Esc · skip', 472, 3, F_SMALL, '#6f6658', 'right', false);
  }
  // Play the credits; onDone() runs afterwards (default: back to the main menu).
  function playCredits(onDone, run) {
    const prevMusic = NW.Audio.musicMode;
    const sc = runScene({
      id: 'credits', music: 'credits', dur: () => (sc.cr.holdAt != null ? sc.cr.holdAt + 5.3 : 1e9), frame: creditsFrame,
      onEnd: () => { H.emit('creditsDone'); if (typeof onDone === 'function') onDone(prevMusic); else NW.UI.showMenu(); },
    });
    sc.cr = { lines: creditLines(run), holdAt: null };
    G().sfx('page', { vol: 0.5 });
    return sc;
  }
  NW.Story = {
    playCredits: (onDone) => playCredits(onDone, G().state && G().mode === 'play' ? { night: G().state.nightsSurvived } : null),
    guideActive: () => guideActive(),
    guideTarget: () => { const i = guideActive() && G().area ? currentStep() : -1; return i < 0 ? null : target(ORDER()[i]); },
  };
  NW.UI.registerMenuButton('credits', 'Credits', () => { NW.UI.closeAll(); playCredits(null, null); }, 90);
  // From the ending panel: credits, then back to the paused run with the same ending shown.
  H.on('endingButtons', (ending, arg) => ({ id: 'credits', label: 'Credits', run: () => {
    NW.UI.close('ending');
    playCredits((prevMusic) => {
      const g = G(); g.mode = 'play';
      NW.UI.showGame(); NW.UI.open('ending', arg);
      if (prevMusic) NW.Audio.setMusic(prevMusic);
    }, { night: arg && arg.night, ending });
  } }));

  // ======================================================== GUIDED FIRST DAY
  const ORDER = () => NW.UI.OBJECTIVES.map((o) => o.k);
  const STEP = {
    look: 'Walk through all four rooms of the cabin.',
    radio: 'Listen to the radio in the office.',
    wood: 'Go outside. Gather branches, chop dead trees.',
    store: 'Store your wood in the wood box by the stove.',
    stove: 'Feed the stove and set its heat.',
    food: 'Find food: berries, mushrooms, or game ({shoot} / click fires).',
    cook: 'Cook something at the counter by the stove.',
    chest: 'Check the storage chest.',
    map: 'Study the map: press {map}, or use the desk.',
    dusk: 'Before dark: lock the doors, draw the curtains.',
  };
  const ROOM_NAME = { room_main: 'main room', room_bed: 'bedroom', room_office: 'office', room_storage: 'storage room' };
  // arrow tips inside each cabin room, toward its doorways: [x, y, pointing]
  const EXIT_MARK = {
    room_main: { room_bed: [12, 112, 'left'], room_office: [340, 112, 'right'], room_storage: [176, 30, 'up'], out: [176, 186, 'down'] },
    room_bed: { room_main: [212, 96, 'right'] },
    room_office: { room_main: [12, 96, 'left'] },
    room_storage: { room_main: [128, 144, 'down'], out: [236, 96, 'right'] },
  };
  const OBJ_H = { branches: 9, deadtree: 40, bush: 13, mushrooms: 10, woodpile_ext: 31, carcass: 8, rabbit: 9, deer: 24 };
  const keys = (t) => t.replace(/\{(\w+)\}/g, (_, k) => NW.Keys.name(k));
  const isDone = (k) => { const d = G().state.tutorial.done; return k === 'dusk' ? !!(d.dusk || (d.lock && d.curtain)) : !!d[k]; };

  function guideActive() {
    const g = G(), s = g.state; if (!s || !s.options || !s.options.guided || !s.tutorial) return false;
    const m = st(); if (!m || m.guideOff || m.guideDone) return false;
    return s.time.day === 1 || (s.time.day === 2 && s.time.min < D.DAWN);
  }
  const currentStep = () => ORDER().findIndex((k) => !isDone(k));

  const mark = (x, y, dir, hint) => ({ x, y, dir: dir || 'down', hint });
  function objMark(a, type, hint) {
    const o = a.objs.find((q) => q.type === type); if (!o) return null;
    return mark(o.cx != null ? o.cx + o.cw / 2 : o.x, o.y - 2, 'down', hint);
  }
  // Toward a cabin room (or 'out' of the cabin) from wherever the ranger stands.
  function route(dest) {
    const a = G().area;
    if (a.kind === 'room') {
      if (a.id === dest) return null;
      const ex = EXIT_MARK[a.id] || {};
      if (dest === 'out') { const m = ex.out || ex.room_main; return m && mark(m[0], m[1], m[2], ex.out ? 'Go out the ' + (a.id === 'room_storage' ? 'back' : 'front') + ' door.' : 'The way out is through the main room.'); }
      const m = ex[dest] || ex.room_main;
      return m && mark(m[0], m[1], m[2], 'The ' + ROOM_NAME[dest] + ' is through the marked doorway.');
    }
    if (dest === 'out') return null;
    if (a.id === 'f_2_2') { const d = a.objs.find((o) => o.type === 'extdoor' && o.door === 'front'); return d ? mark(d.x, d.y - 36, 'down', 'Go in by the front door.') : null; }
    return homeward(a);
  }
  // The trail out of this area that leads back toward the cabin clearing.
  function homeward(a) {
    if (a.kind !== 'forest') { const e = a.exits && a.exits[0]; return e ? mark(e.x + e.w / 2, e.y - 4, 'down', 'Head back to the cabin.') : null; }
    const dx = 2 - a.ax, dy = 2 - a.ay, TS = D.TILE;
    const want = [];
    if (Math.abs(dx) >= Math.abs(dy)) { if (dx) want.push(dx > 0 ? 'e' : 'w'); if (dy) want.push(dy > 0 ? 's' : 'n'); } else { if (dy) want.push(dy > 0 ? 's' : 'n'); if (dx) want.push(dx > 0 ? 'e' : 'w'); }
    const dir = want.find((d) => a.open[d]) || ['n', 's', 'e', 'w'].find((d) => a.open[d]);
    if (!dir) return null;
    const cx = ((a.creek ? 9 : 15) + 1) * TS;
    const P2 = { n: [cx, 8, 'up'], s: [cx, a.h * TS - 6, 'down'], w: [8, 136, 'left'], e: [a.w * TS - 8, 136, 'right'] }[dir];
    return mark(P2[0], P2[1], P2[2], 'Head back to the cabin.');
  }
  // Nearest thing outdoors of the given types in this area.
  function nearest(a, types, animals) {
    const s = G().state, p = s.player; let best = null, bd = 1e9;
    const consider = (x, y, h) => { const d = U.dist(p.x, p.y, x, y); if (d < bd) { bd = d; best = mark(x, y - h - 2, 'down'); } };
    a.objs.forEach((o) => { if (types.includes(o.type) && NW.Objects.available(o)) consider(o.x, o.y, OBJ_H[o.type] || 12); });
    if (animals && s.animals.area === a.id) s.animals.list.forEach((an) => { if ((an.type === 'rabbit' || an.type === 'deer') && !an.flying) consider(an.x, an.y, an.dead ? OBJ_H.carcass : OBJ_H[an.type]); });
    return best;
  }
  function outdoors(types, animals) {
    const a = G().area;
    if (a.kind !== 'forest') return route('out');
    const m = nearest(a, types, animals);
    if (m) return m;
    return mark(-99, -99, 'down', 'Nothing left here. Try the next clearing.');
  }
  function inRoom(room, type, hint) {
    const a = G().area;
    if (a.id === room) return objMark(a, type, hint);
    return route(room);
  }
  // Where the arrow points and what extra line to show for step k.
  function target(k) {
    const s = G().state, a = G().area, I = NW.Inv;
    switch (k) {
      case 'look': {
        const left = ['room_bed', 'room_office', 'room_storage', 'room_main'].filter((r) => !s.tutorial.rooms[r]);
        if (a.kind === 'room') {
          const next = left.find((r) => r !== a.id) || 'room_bed';
          return route(next) || route('room_bed');
        }
        return route('room_main');
      }
      case 'radio': return inRoom('room_office', 'radio', 'Walk up to it and press ' + NW.Keys.name('interact') + '.');
      case 'wood': return outdoors(['branches', 'deadtree']);
      case 'store':
        if (I.count(s.inv, 'wood') > 0) return inRoom('room_main', 'woodbox');
        if (a.id === 'f_2_2') { const m = nearest(a, ['woodpile_ext']); if (m) m.hint = 'No wood in your pack: take some from the woodpile.'; return m; }
        if (a.kind === 'forest') return Object.assign(outdoors(['branches', 'deadtree']), { hint: 'No wood in your pack: gather some.' });
        return Object.assign(route('out') || mark(-99, -99), { hint: 'No wood in your pack: fetch some from outside.' });
      case 'stove': return inRoom('room_main', 'stove');
      case 'food': return outdoors(['bush', 'mushrooms'], true);
      case 'cook': {
        const can = D.RECIPES.cook.some((r) => I.hasAll(s.inv, r.in));
        if (!NW.Survival.stoveLit()) { const m = inRoom('room_main', 'stove'); return m && Object.assign(m, { hint: 'Light the stove first.' }); }
        if (can) return inRoom('room_main', 'counter', 'Roast meat or mushrooms, or boil a poultice.');
        if (I.count(s.chest, 'yarrow') >= 2) { const m = inRoom('room_storage', 'chest'); return m && Object.assign(m, { hint: 'Nothing to cook? Take yarrow from the chest.' }); }
        return Object.assign(outdoors(['bush', 'mushrooms'], true) || mark(-99, -99), { hint: 'Nothing to cook: bring back mushrooms or meat.' });
      }
      case 'chest': return inRoom('room_storage', 'chest');
      case 'map':
        if (a.kind !== 'room') return mark(-99, -99, 'down', 'Press ' + NW.Keys.name('map') + ' to open it anywhere.');
        return inRoom('room_office', 'desk', 'Or press ' + NW.Keys.name('map') + ' anywhere.');
      case 'dusk': {
        const d = s.tutorial.done;
        if (a.kind !== 'room') return route('room_main');
        if (!d.lock) {
          const door = a.objs.find((o) => o.type === 'door');
          if (door) return mark(door.side === 'right' ? door.x - 2 : door.x + door.w / 2, door.side === 'right' ? door.y + door.h / 2 : door.y - 6, door.side === 'right' ? 'right' : 'down', 'Lock it: stand at the door.');
          return route('room_main');
        }
        const w = a.objs.find((o) => o.type === 'window' && !s.cabin.windows[o.wid].curtClosed) || a.objs.find((o) => o.type === 'window');
        if (w) return mark(w.x + w.w / 2, w.side === 'bottom' ? w.y - 6 : w.y + w.h + 2, w.side === 'bottom' ? 'down' : 'up', 'Draw the curtains at the window.');
        return null;
      }
    }
    return null;
  }

  // Objectives box: one step at a time.
  H.on('objectives', (obj, s) => {
    if (!guideActive() || !G().area) return undefined;
    const i = currentStep(); if (i < 0) return undefined;
    const k = ORDER()[i];
    const items = [keys(STEP[k] || NW.UI.OBJECTIVES[i].text)];
    let tg = null; try { tg = target(k); } catch (e) { tg = null; }
    if (tg && tg.hint) items.push(tg.hint);
    // keep lines other modules added to the core box (HQ orders after midnight)
    const core = new Set(NW.UI.OBJECTIVES.map((o) => keys(o.text)));
    if (obj && obj.items) obj.items.forEach((t) => { if (!core.has(t) && items.length < 4) items.push(t); });
    return { title: 'Guided first day · step ' + (i + 1) + '/' + ORDER().length, items };
  });
  H.on('tut', () => {
    if (!guideActive()) return;
    const m = st(), i = currentStep();
    if (i < 0) { m.guideDone = true; G().msg('Guided day complete. The rest you learn alone.', 'good'); G().sfx('page', { vol: 0.5 }); return; }
    if (i !== m.step) { m.step = i; G().sfx('page', { vol: 0.4 }); }
  });
  H.on('dawn', () => { const s = G().state; if (s && s.time.day >= 2) { const m = st(); if (m && !m.guideDone) m.guideDone = true; } });
  H.on('start', () => { if (guideActive()) st().step = currentStep(); });

  // The bobbing marker (drawn over the lighting so it reads in a dark room).
  const ARROW = ['..ooooo..', '..oYYYo..', '..oYyYo..', 'oooYyYooo', '.oYYyYYo.', '..oYYYo..', '...oYo...', '....o....'];
  function arrowSprite(dir) {
    return S.cached('sty_arrow_' + dir, () => {
      const v = dir === 'up' || dir === 'down', w = v ? 9 : 8, h = v ? 8 : 9;
      return S.pix(w, h, (x, y) => {
        let ax = x, ay = y;
        if (dir === 'up') ay = 7 - y; else if (dir === 'right') { ax = y; ay = x; } else if (dir === 'left') { ax = y; ay = 7 - x; }
        const c = ARROW[ay] && ARROW[ay][ax];
        return c === 'o' ? P.ink : c === 'Y' ? P.y1 : c === 'y' ? P.y2 : null;
      });
    });
  }
  H.on('drawOverlay', (g, a, t) => {
    const pb = NW.UI.isOpen('pause') && document.getElementById('p-x-story_guide');
    if (pb) pb.style.display = guideActive() ? '' : 'none';
    if (!guideActive() || G().dead || NW.UI.blocksMovement()) return;
    const i = currentStep(); if (i < 0) return;
    let m = null; try { m = target(ORDER()[i]); } catch (e) { m = null; }
    if (!m || m.x < 0) return;
    const p = G().state.player;
    const x = Math.round(m.x + a.ox), y = Math.round(m.y + a.oy);
    const bob = Math.round(Math.abs(Math.sin(t * 3.2)) * 3);
    const near = U.dist(p.x, p.y - 8, m.x, m.y) < 26;
    const spr = arrowSprite(m.dir);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = near ? 0.4 : 0.92;
    glow(g, x, y, 9, '255,210,120', near ? 0.08 : 0.2 + Math.sin(t * 3.2) * 0.06);
    if (m.dir === 'down') g.drawImage(spr, x - 4, y - 8 - bob);
    else if (m.dir === 'up') g.drawImage(spr, x - 4, y + bob);
    else if (m.dir === 'left') g.drawImage(spr, x + bob, y - 4);
    else g.drawImage(spr, x - 8 - bob, y - 4);
    g.restore();
  });
  NW.UI.registerPauseButton('story_guide', 'Skip guide', () => {
    if (!guideActive()) return;
    st().guideOff = true;
    NW.UI.close('pause');
    G().msg('Guide off. The first-day list stays in the corner.', 'info');
  });
})(window.NW);
