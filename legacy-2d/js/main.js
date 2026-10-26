'use strict';
// Boot & main loop.
(function (NW) {
  const G = NW.G, D = NW.D;
  let last = 0, acc = 0, menuT = 0;
  const STEP = 1 / 60;

  function boot() {
    NW.Keys.load();
    NW.S.init();
    NW.Save.loadSettings();
    const cv = document.getElementById('game');
    NW.Render.init(cv);
    NW.UI.init();
    NW.UI.applyAudio();
    NW.UI.showMenu();
    NW.Hooks.emit('boot');

    window.addEventListener('keydown', (e) => { NW.Audio.init(); G.onKey(e, true); });
    window.addEventListener('keyup', (e) => G.onKey(e, false));
    window.addEventListener('blur', () => { G.keys = {}; });
    cv.addEventListener('mousemove', (e) => {
      const r = cv.getBoundingClientRect();
      G.mouse.x = (e.clientX - r.left) / r.width * D.CW; G.mouse.y = (e.clientY - r.top) / r.height * D.CH; G.mouse.moved = true;
    });
    cv.addEventListener('mousedown', (e) => {
      NW.Audio.init();
      if (G.mode === 'scene' && NW.scene && NW.scene.click) { try { NW.scene.click(e); } catch (er) { console.error(er); } return; }
      if (G.mode !== 'play' || G.paused || e.button !== 0) return;
      const r = cv.getBoundingClientRect();
      G.mouse.x = (e.clientX - r.left) / r.width * D.CW; G.mouse.y = (e.clientY - r.top) / r.height * D.CH; G.mouse.moved = true;
      if (G.area && G.area.kind === 'forest' && !NW.UI.blocksMovement()) { const m = G.mouseWorld(); G.shoot(m.x, m.y); }
    });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    const saveNow = () => { if (G.mode === 'play' && !G.dead && G.state) NW.Save.write(G.state); };
    window.addEventListener('beforeunload', saveNow);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
    requestAnimationFrame(loop);
  }

  function loop(ts) {
    const now = ts / 1000;
    let dt = last ? now - last : STEP;
    last = now;
    if (dt > 0.25) dt = 0.25;
    try {
      if (G.mode === 'play' || G.mode === 'dead') {
        acc += dt;
        while (acc >= STEP) { G.update(STEP); acc -= STEP; }
        NW.Render.frame(G.t, dt);
      } else if (G.mode === 'scene' && NW.scene) {
        // full-screen scenes (opening, credits) draw straight onto the game canvas: NW.scene = { frame(ctx, dt), key(code), click(e) }
        const cv = document.getElementById('game'), cx = cv.getContext('2d');
        cx.setTransform(1, 0, 0, 1, 0, 0);
        NW.scene.frame(cx, dt);
      } else {
        menuT += dt;
        NW.Render.menuScene(document.getElementById('game'), menuT, dt);
      }
      NW.UI.update(dt);
      NW.Audio.updateMusic();
    } catch (e) {
      console.error(e);
      NW.lastError = String(e && e.stack || e);
    }
    requestAnimationFrame(loop);
  }

  NW.debug = {
    step(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) G.update(STEP); },
    setTime(min, day) { if (day) G.state.time.day = day; G.state.time.min = min; },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.NW);
