'use strict';
// First-person controls: pointer-lock mouse look (click-and-drag fallback), camera-relative movement
// fed into the game's own movement and collision code, head bob, and the facing vector the
// interaction system uses to pick what the ranger is looking at.
(function (NW) {
  const THREE = window.THREE, R3 = NW.R3;
  if (!THREE || !R3) return;
  const C = R3.Controls = { yaw: 0, pitch: -0.08, locked: false, dragging: false, bob: 0 };
  const PI2 = Math.PI * 2;

  // facing in game coordinates (x east, y south); yaw 0 looks north (-y)
  C.facing = () => ({ x: Math.sin(C.yaw), y: -Math.cos(C.yaw) });
  C.setFacingDir = function (dir) { C.yaw = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[dir] || 0; };
  // Convert held movement keys (screen up/down/left/right) into a game-space vector relative to the view.
  C.moveVector = function (mx, my) {
    const f = C.facing(), r = { x: -f.y, y: f.x };
    const fwd = -my, str = mx;
    return { x: f.x * fwd + r.x * str, y: f.y * fwd + r.y * str };
  };
  C.dirName = function () {
    const f = C.facing();
    return Math.abs(f.x) > Math.abs(f.y) ? (f.x < 0 ? 'left' : 'right') : (f.y < 0 ? 'up' : 'down');
  };

  C.init = function (canvas) {
    const sens = () => (NW.settings.sens || 1) * 0.0022;
    const canLook = () => NW.G.mode === 'play' && !NW.G.paused && !NW.UI.blocksMovement() && !NW.G.dead && !R3.View.override;
    canvas.addEventListener('mousedown', (e) => {
      if (NW.G.mode !== 'play' || NW.UI.blocksMovement()) return;
      if (!C.locked && canvas.requestPointerLock) {
        try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (er) { /* fallback to drag */ }
        C.dragging = true; C.lastX = e.clientX; C.lastY = e.clientY; C.clickT = performance.now();
      }
    });
    window.addEventListener('mouseup', () => { C.dragging = false; });
    document.addEventListener('pointerlockchange', () => { C.locked = document.pointerLockElement === canvas; if (C.locked) C.dragging = false; C.hint(); });
    document.addEventListener('pointerlockerror', () => { C.locked = false; });
    window.addEventListener('mousemove', (e) => {
      if (!canLook()) return;
      let dx = 0, dy = 0;
      if (C.locked) { dx = e.movementX || 0; dy = e.movementY || 0; }
      else if (C.dragging) { dx = e.clientX - C.lastX; dy = e.clientY - C.lastY; C.lastX = e.clientX; C.lastY = e.clientY; }
      else return;
      if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return; // browser glitch on lock
      C.yaw = (C.yaw + dx * sens()) % PI2;
      C.pitch = Math.max(-1.35, Math.min(1.25, C.pitch - dy * sens() * (NW.settings.invertY ? -1 : 1)));
    });
    // panels and pause need the cursor back
    NW.Hooks.on('update', () => {
      const want = canLook();
      if (!want && C.locked && document.exitPointerLock) document.exitPointerLock();
      C.hint();
    });
    const hint = document.createElement('div'); hint.id = 'look-hint'; hint.className = 'hidden'; hint.textContent = 'Click to look around';
    document.body.appendChild(hint); C.hintEl = hint;
    const xh = document.createElement('div'); xh.id = 'crosshair'; xh.className = 'hidden'; document.body.appendChild(xh); C.xhEl = xh;
  };
  let hintState = null;
  C.hint = function () {
    if (!C.hintEl) return;
    const play = NW.G.mode === 'play' && !NW.G.paused && !NW.UI.blocksMovement() && !NW.G.dead && R3.active && !R3.View.override;
    const show = play && !C.locked && !C.dragging;
    const st = (show ? 1 : 0) + (play ? 2 : 0);
    if (st === hintState) return; hintState = st;
    C.hintEl.classList.toggle('hidden', !show);
    C.xhEl.classList.toggle('hidden', !play);
  };
  // Mouse click while looking: fire the rifle outdoors (same rule as the 2D game)
  C.clickFire = function () { return C.locked; };

  // keyboard turning for players without a mouse (Q/E are taken; arrow keys turn when bound as secondary move keys)
  C.update = function (dt) {
    const G = NW.G, k = G.keys;
    if (NW.settings.arrowTurn !== false && !NW.UI.blocksMovement() && G.mode === 'play' && !G.paused) {
      if (k.ArrowLeft) C.yaw -= dt * 2.2;
      if (k.ArrowRight) C.yaw += dt * 2.2;
    }
    C.bob += (G.moving ? dt * (G.sprinting ? 11 : 7.5) : 0);
  };
})(window.NW);
