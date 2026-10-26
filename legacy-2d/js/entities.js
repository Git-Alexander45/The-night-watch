'use strict';
// Wildlife AI, the dog companion, and outdoor monster proximity.
(function (NW) {
  const U = NW.U, W = NW.World, D = NW.D;
  const En = NW.Entities = {};
  const G = () => NW.G;

  function free(a, x, y) { return !W.blocked(a, x - 4, y - 3, 8, 3) && x > 4 && x < a.w * 16 - 4 && y > 6 && y < a.h * 16 - 2; }
  const open = (a, x, y) => !W.blocked(a, x - 4, y - 3, 8, 3); // fleeing animals may leave the screen
  // nearest walkable spot to (x, y) inside the area
  En.freeNear = function (a, x, y) {
    if (free(a, x, y)) return { x, y };
    for (let r = 6; r <= 80; r += 6) for (let k = 0; k < 12; k++) {
      const nx = x + Math.cos(k / 12 * Math.PI * 2) * r, ny = y + Math.sin(k / 12 * Math.PI * 2) * r;
      if (free(a, nx, ny)) return { x: nx, y: ny };
    }
    return { x, y };
  };

  En.update = function (dt) {
    const g = G(), s = g.state, a = g.area, p = s.player;
    if (a.kind === 'forest' && s.animals.area === a.id) {
      const list = s.animals.list;
      for (let i = list.length - 1; i >= 0; i--) {
        const an = list[i];
        if (an.dead) continue;
        if (!an.flying && !open(a, an.x, an.y)) { const fx = En.freeNear(a, an.x, an.y); if (open(a, fx.x, fx.y)) { an.x = fx.x; an.y = fx.y; } else { list.splice(i, 1); continue; } }
        an.t -= dt;
        const dp = U.dist(an.x, an.y, p.x, p.y);
        an.moving = false;
        if (an.type === 'crow') {
          if (!an.flying && (dp < 46 || (g.sprinting && dp < 80))) { an.flying = true; an.vx = U.sign(an.x - p.x || 1) * 70; an.vy = -60; g.sfx('crow', { vol: 0.3, pan: (an.x - p.x) / 240 }); }
          if (an.flying) { an.x += an.vx * dt; an.y += an.vy * dt; if (an.y < -20 || an.x < -20 || an.x > 500) list.splice(i, 1); }
          else if (an.t <= 0) { an.t = U.rand(0.6, 2); an.x += U.rand(-4, 4); an.face = Math.random() < 0.5 ? -1 : 1; }
          continue;
        }
        if (an.type === 'wolf') { updateWolf(an, dt, dp, a); continue; }
        const fleeR = an.type === 'deer' ? (g.sprinting ? 120 : 82) : (g.sprinting ? 95 : 56);
        if (dp < fleeR || an.scared > 0) {
          an.scared = Math.max(0, (an.scared || 0) - dt);
          const sp = an.type === 'deer' ? 105 : 88;
          let dx = an.x - p.x, dy = an.y - p.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
          const nx = an.x + dx * sp * dt, ny = an.y + dy * sp * dt;
          if (open(a, nx, an.y)) an.x = nx; else { const sy = an.y + (dy >= 0 ? 1 : -1) * sp * dt * 0.7; if (open(a, an.x, sy)) an.y = sy; }
          if (open(a, an.x, ny)) an.y = ny; else { const sx = an.x + (dx >= 0 ? 1 : -1) * sp * dt * 0.7; if (open(a, sx, an.y)) an.x = sx; }
          an.face = dx < 0 ? -1 : 1; an.moving = true; an.grazing = false;
          if (an.x < -10 || an.x > a.w * 16 + 10 || an.y < -10 || an.y > a.h * 16 + 10) list.splice(i, 1);
          an.x = U.clamp(an.x, -12, a.w * 16 + 12); an.y = U.clamp(an.y, -12, a.h * 16 + 12);
          if (an.x <= -12 || an.x >= a.w * 16 + 12 || an.y <= -12 || an.y >= a.h * 16 + 12) { const k = list.indexOf(an); if (k >= 0) list.splice(k, 1); }
        } else {
          // calm again just past the edge of the area: it has left
          if (an.x <= 4 || an.x >= a.w * 16 - 4 || an.y <= 6 || an.y >= a.h * 16 - 2) { list.splice(i, 1); continue; }
          if (an.t <= 0) {
            an.t = U.rand(1, 3.5);
            if (Math.random() < 0.5) { an.vx = 0; an.vy = 0; an.grazing = an.type === 'deer'; }
            else { const ang = Math.random() * 6.28; const sp = an.type === 'deer' ? 18 : 26; an.vx = Math.cos(ang) * sp; an.vy = Math.sin(ang) * sp; an.grazing = false; }
          }
          if (an.vx || an.vy) {
            const nx = an.x + an.vx * dt, ny = an.y + an.vy * dt;
            if (free(a, nx, ny)) { an.x = nx; an.y = ny; an.moving = true; an.face = an.vx < 0 ? -1 : 1; } else { an.vx = -an.vx; an.vy = -an.vy; }
          }
        }
      }
    }
    // dog follows the player outdoors
    const dog = s.dog;
    g.dogMoving = false;
    if (dog && dog.status === 'following' && dog.area === a.id) {
      const tx = p.x - (p.dir === 'left' ? -14 : 14), ty = p.y + 4;
      const d = U.dist(dog.x, dog.y, tx, ty);
      if (d > 18) {
        const sp = Math.min(110, 40 + d * 1.5);
        const nx = dog.x + (tx - dog.x) / d * sp * dt, ny = dog.y + (ty - dog.y) / d * sp * dt;
        if (free(a, nx, dog.y)) dog.x = nx; if (free(a, dog.x, ny)) dog.y = ny;
        if (d > 120) { const fp = En.freeNear(a, tx, ty); dog.x = fp.x; dog.y = fp.y; }
        dog.face = tx < dog.x ? -1 : 1; g.dogMoving = true;
      }
    }
    // Scratcher in the clearing will turn on a ranger standing nearby
    if (a.id === 'f_2_2' && s.night.sc.stage === 'door') {
      const door = s.night.sc.door === 'front' ? { x: 240, y: 186 } : { x: 360, y: 172 };
      if (U.dist(p.x, p.y, door.x, door.y) < 36) {
        NW.Survival.damage(40, 'scratcher'); g.sfx('roar'); s.night.sc.stage = 'none';
        g.msg('It turns from the door and lunges at you — then flees into the dark.', 'danger');
      }
    }
  };

  function updateWolf(an, dt, dp, a) {
    const g = G(), s = g.state, p = s.player;
    an.cd = Math.max(0, (an.cd || 0) - dt);
    if (an.state === 'idle') {
      if (dp < 130) { an.state = 'warn'; an.t = 1.4; an.angry = true; g.sfx('growl', { vol: 0.8, pan: (an.x - p.x) / 240 }); g.msg('A low growl. Wolves!', 'danger'); NW.Events.unlockRule('wolf', 0); }
      else if (an.t <= 0) { an.t = U.rand(1, 3); const ang = Math.random() * 6.28; an.vx = Math.cos(ang) * 20; an.vy = Math.sin(ang) * 20; }
      const nx = an.x + (an.vx || 0) * dt, ny = an.y + (an.vy || 0) * dt;
      if (free(a, nx, ny)) { an.x = nx; an.y = ny; an.moving = true; an.face = an.vx < 0 ? -1 : 1; }
      return;
    }
    if (an.state === 'warn') { an.face = p.x < an.x ? -1 : 1; if (an.t <= 0) an.state = 'chase'; return; }
    if (an.state === 'flee') {
      const dx = an.x - p.x, dy = an.y - p.y, l = Math.hypot(dx, dy) || 1;
      const nx = an.x + dx / l * 90 * dt, ny = an.y + dy / l * 90 * dt, bx = an.x, by = an.y;
      if (open(a, nx, an.y)) an.x = nx; else { const sy = an.y + (dy >= 0 ? 1 : -1) * 63 * dt; if (open(a, an.x, sy)) an.y = sy; }
      if (open(a, an.x, ny)) an.y = ny; else { const sx = an.x + (dx >= 0 ? 1 : -1) * 63 * dt; if (open(a, sx, an.y)) an.x = sx; }
      an.moving = true; an.face = dx < 0 ? -1 : 1;
      an.stuck = an.x === bx && an.y === by ? (an.stuck || 0) + dt : 0;
      // gone past the edge, or boxed in by water and trees: it slips away into the forest
      if (an.x < -20 || an.x > a.w * 16 + 20 || an.y < -20 || an.y > a.h * 16 + 20 || an.stuck > 0.4) { const list = s.animals.list; list.splice(list.indexOf(an), 1); }
      return;
    }
    // chase
    if (dp > 230) { an.lost = (an.lost || 0) + dt; if (an.lost > 3) { an.state = 'idle'; an.angry = false; an.lost = 0; return; } } else an.lost = 0;
    const dx = p.x - an.x, dy = p.y - an.y, l = Math.hypot(dx, dy) || 1;
    if (an.backoff > 0) {
      an.backoff -= dt;
      const nx = an.x - dx / l * 60 * dt, ny = an.y - dy / l * 60 * dt;
      if (free(a, nx, an.y)) an.x = nx; if (free(a, an.x, ny)) an.y = ny;
      an.moving = true; an.face = dx < 0 ? -1 : 1;
      return;
    }
    if (l > 12) {
      const sp = 74;
      const nx = an.x + dx / l * sp * dt, ny = an.y + dy / l * sp * dt;
      if (free(a, nx, an.y)) an.x = nx; if (free(a, an.x, ny)) an.y = ny;
      an.moving = true; an.face = dx < 0 ? -1 : 1;
    } else if (an.cd <= 0) {
      an.cd = 1.6; an.backoff = 0.9 + Math.random() * 0.6; NW.Survival.damage(9, 'wolf'); g.sfx('growl', { vol: 1 });
    }
  }

  En.onShot = function (hit) {
    const g = G(), s = g.state;
    s.animals.list.forEach((an) => {
      if (an.dead) return;
      if (an.type === 'crow' && !an.flying) { an.flying = true; an.vx = U.rand(-70, 70); an.vy = -70; }
      if (an.type === 'rabbit' || an.type === 'deer') an.scared = 3;
    });
    if (!hit) return;
    hit.hp -= 1;
    if (hit.hp <= 0) {
      hit.dead = true; hit.moving = false;
      g.stat('animals', 1);
      g.msg(hit.type === 'wolf' ? 'The wolf drops.' : 'Clean shot. Butcher it for meat.', 'good');
      if (hit.type === 'wolf') { s.animals.list.forEach((w) => { if (w.type === 'wolf' && !w.dead && Math.random() < 0.5) w.state = 'flee'; }); }
    } else { hit.state = 'chase'; hit.angry = true; g.sfx('growl'); }
  };
})(window.NW);
