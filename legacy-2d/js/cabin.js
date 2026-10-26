'use strict';
// Cabin structures: windows, doors, stove control, repairs.
(function (NW) {
  const D = NW.D, I = NW.Inv;
  const C = NW.Cabin = {};
  const G = () => NW.G;
  const st = () => NW.G.state;

  C.WINDOW_NAMES = { w_front_l: 'Front window (left)', w_front_r: 'Front window (right)', w_bed: 'Bedroom window', w_office: 'Office window', w_storage: 'Storage window' };
  C.DOOR_NAMES = { front: 'Front door', back: 'Back door' };

  C.newCabin = function () {
    const win = (room) => ({ room, glass: 100, shutter: 100, shutClosed: false, curtClosed: false, boarded: 0 });
    return {
      heat: 12,
      windows: { w_front_l: win('room_main'), w_front_r: win('room_main'), w_bed: win('room_bed'), w_office: win('room_office'), w_storage: win('room_storage') },
      doors: {
        front: { room: 'room_main', hp: 100, max: 100, locked: false, lockBroken: false, open: false, reinforced: false },
        back: { room: 'room_storage', hp: 100, max: 100, locked: true, lockBroken: false, open: false, reinforced: false },
      },
    };
  };

  C.windowStatus = function (wid) {
    const w = st().cabin.windows[wid]; const tags = [];
    if (w.boarded > 0) tags.push('Boarded ' + Math.round(w.boarded) + '%');
    else {
      tags.push(w.curtClosed ? 'Curtains drawn' : 'Curtains open');
      if (w.shutter <= 0) tags.push('Shutters BROKEN');
      else tags.push((w.shutClosed ? 'Shutters closed' : 'Shutters open') + (w.shutter < 100 ? ' ' + Math.round(w.shutter) + '%' : ''));
    }
    if (w.glass <= 0) tags.push('Glass BROKEN');
    else if (w.glass < 100) tags.push('Glass ' + Math.round(w.glass) + '%');
    return tags.join(' · ');
  };
  C.windowLabel = (wid) => C.WINDOW_NAMES[wid] + ' — ' + C.windowStatus(wid);
  C.doorStatus = function (did) {
    const d = st().cabin.doors[did]; const tags = [];
    if (d.hp <= 0) tags.push('SMASHED');
    else if (d.open) tags.push('OPEN');
    else tags.push(d.lockBroken ? 'Lock broken' : d.locked ? 'Locked' : 'Unlocked');
    tags.push(Math.round(d.hp / d.max * 100) + '%');
    if (d.reinforced) tags.push('Reinforced');
    return tags.join(' · ');
  };
  C.doorLabel = (did) => C.DOOR_NAMES[did] + ' — ' + C.doorStatus(did);

  function act(label, run, extra) { return Object.assign({ label, run }, extra || {}); }
  function hold(label, time, done, extra) { return Object.assign({ label, time, done }, extra || {}); }
  function repair(key, done) {
    const r = D.REPAIRS[key], inv = st().inv;
    const ok = I.hasAll(inv, r.in);
    return hold(r.name + ' — ' + I.reqText(r.in, inv), r.time, () => {
      if (!I.removeAll(inv, r.in)) return G().msg('Missing materials.', 'warn');
      done(); G().sfx('hammer'); G().stat('repairs', 1); G().save('repair');
    }, { disabled: ok ? false : 'Missing materials', sound: 'hammer', every: 1.05 });
  }

  C.windowActions = function (o) {
    const s = st(), w = s.cabin.windows[o.wid], g = G();
    const a = [];
    const shutBlocks = w.shutClosed && w.shutter > 0;
    a.push(act(w.curtClosed ? 'Peek through the curtains' : 'Look outside', () => { g.openUI('window', o.wid); g.tut('window'); },
      { disabled: w.boarded > 0 ? 'Boarded up' : shutBlocks ? 'Shutters are closed' : false }));
    if (w.boarded <= 0) {
      a.push(act(w.curtClosed ? 'Open curtains' : 'Draw curtains', () => { w.curtClosed = !w.curtClosed; g.sfx('curtain'); g.tut('curtain'); }));
      if (w.shutter > 0) a.push(act(w.shutClosed ? 'Open shutters' : 'Close shutters', () => { w.shutClosed = !w.shutClosed; g.sfx('shutter'); }));
      if (w.shutter < 100) a.push(repair('shutter', () => { w.shutter = 100; g.msg('Shutters repaired.'); }));
      if (w.glass < 100) a.push(repair('glass', () => { w.glass = 100; g.msg('New glass fitted.'); }));
      a.push(repair('board', () => { w.boarded = 100; w.shutClosed = false; g.msg('Window boarded up. No light gets out — and you can no longer see out.'); }));
    } else {
      a.push(hold('Pry off the boards (recover 1 plank)', 2, () => { w.boarded = 0; I.give('plank', 1); g.sfx('wood_crack'); }, { sound: 'wood_crack', every: 0.9 }));
      if (w.glass < 100) a.push(repair('glass', () => { w.glass = 100; g.msg('New glass fitted.'); }));
    }
    return a;
  };

  C.doorActions = function (o) {
    const s = st(), d = s.cabin.doors[o.did], g = G(), N = NW.Night;
    const a = [];
    const vis = o.did === 'front' && N.visitorAtDoor();
    if (N.scratcherAt(o.did)) a.push(hold('BRACE THE DOOR', 2.2, () => N.brace(o.did), { danger: true, sound: 'thud', every: 0.5, disabled: s.player.stamina < 15 ? 'Too exhausted (stamina)' : false }));
    // Common actions keep stable slots; visitor actions come after them, and opening the door needs a confirming second press.
    if (o.did === 'front') a.push(act('Look through the peephole', () => { g.openUI('peephole'); g.tut('peephole'); }, { disabled: d.open || d.hp <= 0 ? 'The door is open' : false }));
    if (d.hp > 0) {
      if (d.open) a.push(act('Close the door', () => { d.open = false; g.sfx('door'); }));
      else if (!d.lockBroken) a.push(act(d.locked ? 'Unlock' : 'Lock', () => { d.locked = !d.locked; g.sfx('latch'); g.tut('lock'); }));
    }
    if (!vis) a.push(act(N.scratcherNear(o.did) ? 'Go outside (something is at this door!)' : 'Go outside', () => g.goOutside(o.did), { danger: N.scratcherNear(o.did), confirm: N.scratcherNear(o.did) }));
    if (vis) {
      a.push(act('Talk to the visitor', () => g.openUI('talk')));
      a.push(act('Tell them to leave', () => N.refuseVisitor()));
      a.push(act('Open the door for them', () => N.openForVisitor(), { danger: true, confirm: true }));
    }
    if (d.hp < d.max) a.push(repair('door', () => { d.hp = d.max; d.open = false; g.msg('Door repaired.'); }));
    if (!d.reinforced && d.hp > 0) a.push(repair('reinforce', () => { d.reinforced = true; d.max = 160; d.hp = Math.min(160, d.hp + 60); g.msg('Door reinforced with crossbars.'); }));
    if (d.lockBroken) a.push(repair('lock', () => { d.lockBroken = false; g.msg('Lock repaired.'); }));
    return a;
  };

  C.extDoorActions = function (o) {
    const s = st(), d = s.cabin.doors[o.door], g = G();
    const N = NW.Night;
    if (o.door === 'front' && N.visitorAtDoor()) {
      return [
        act('Talk to the stranger on the porch', () => g.openUI('talk')),
        act('Tell them to leave', () => N.refuseVisitor()),
        act('Use the back door instead', () => g.msg('The back door is on the right side of the cabin.')),
        act('Open the front door (they will come in)', () => g.enterCabin('front'), { danger: true, confirm: true }),
      ];
    }
    const a = [act(o.door === 'front' ? 'Enter the cabin' : 'Enter through the back door', () => g.enterCabin(o.door))];
    if (d.hp > 0 && !d.open && !d.lockBroken) a.push(act(d.locked ? 'Unlock (key)' : 'Lock (key)', () => { d.locked = !d.locked; g.sfx('latch'); }));
    return a;
  };

  C.stoveActions = function () {
    const s = st(), g = G(), Sv = NW.Survival;
    const a = [];
    const woodSrc = I.count(s.inv, 'wood') > 0 ? 'pack' : s.woodbox > 0 ? 'box' : null;
    a.push(act('Add a log' + (woodSrc === 'box' ? ' (from wood box)' : woodSrc === 'pack' ? '' : ' (no wood)'), () => {
      if (s.stove.fuel + D.WOOD_FUEL > NW.G.cap('STOVE_CAP') + 0.01) return g.msg('The stove is full.', 'warn');
      if (woodSrc === 'pack') I.remove(s.inv, 'wood', 1); else if (woodSrc === 'box') s.woodbox--; else return;
      const wasOut = !Sv.stoveLit();
      s.stove.fuel += D.WOOD_FUEL;
      if (s.stove.setting === 'off') { s.stove.setting = 'low'; }
      g.sfx('fireup'); g.tut('stove');
      if (wasOut) g.msg('The fire catches.');
    }, { disabled: !woodSrc ? 'No wood in pack or wood box' : s.stove.fuel + D.WOOD_FUEL > NW.G.cap('STOVE_CAP') + 0.01 ? 'Stove is full' : false }));
    ['low', 'medium', 'high'].forEach((k) => {
      a.push(act('Set ' + D.STOVE[k].label.toUpperCase(), () => { s.stove.setting = k; g.sfx(k === 'high' ? 'fireup' : 'latch'); g.tut('stove'); },
        { disabled: s.stove.setting === k ? 'Already ' + D.STOVE[k].label : s.stove.fuel <= 0 ? 'No fuel' : false }));
    });
    a.push(act('Smother the fire (out)', () => { s.stove.setting = 'off'; g.sfx('whoosh'); }, { disabled: s.stove.setting === 'off' ? 'Already out' : false }));
    const sw = I.count(s.inv, 'smokeweed');
    if (sw > 0) a.push(act('Throw smokeweed in (' + sw + ')', () => { I.remove(s.inv, 'smokeweed', 1); NW.Night.smokeweed(); }, { disabled: !Sv.stoveLit() ? 'Fire must be lit' : false }));
    return a;
  };
})(window.NW);
