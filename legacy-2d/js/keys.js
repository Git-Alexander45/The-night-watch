'use strict';
// Rebindable controls. Each action has up to two keys (primary, secondary). Digits 1-9 always pick prompt actions.
(function (NW) {
  const K = NW.Keys = {};
  K.ACTIONS = [
    ['up', 'Move up', ['KeyW', 'ArrowUp']],
    ['down', 'Move down', ['KeyS', 'ArrowDown']],
    ['left', 'Move left', ['KeyA', 'ArrowLeft']],
    ['right', 'Move right', ['KeyD', 'ArrowRight']],
    ['sprint', 'Sprint', ['ShiftLeft', 'ShiftRight']],
    ['interact', 'Use / first action', ['KeyE', null]],
    ['shoot', 'Fire rifle', ['Space', null]],
    ['pack', 'Pack', ['Tab', 'KeyI']],
    ['map', 'Map', ['KeyM', null]],
    ['journal', 'Journal', ['KeyJ', null]],
    ['eat', 'Quick-eat', ['KeyF', null]],
    ['heal', 'Quick-heal', ['KeyH', null]],
  ];
  K.STORE = 'nightwatch.keys';
  K.binds = {};
  K.reset = function () { K.ACTIONS.forEach(([id, , def]) => { K.binds[id] = def.slice(); }); };
  K.reset();
  K.load = function () {
    try {
      const raw = JSON.parse(localStorage.getItem(K.STORE) || 'null');
      if (raw && typeof raw === 'object') for (const id in raw) if (K.binds[id] && Array.isArray(raw[id])) K.binds[id] = [raw[id][0] || null, raw[id][1] || null];
    } catch (e) { /* defaults */ }
  };
  K.save = function () { try { localStorage.setItem(K.STORE, JSON.stringify(K.binds)); } catch (e) { /* ignore */ } };
  // Is this key code bound to the action?
  K.is = function (action, code) { const b = K.binds[action]; return !!b && (b[0] === code || b[1] === code); };
  // Is any key bound to the action currently held?
  K.held = function (action, keys) { const b = K.binds[action]; return !!b && (!!(b[0] && keys[b[0]]) || !!(b[1] && keys[b[1]])); };
  K.actionFor = function (code) { for (const [id] of K.ACTIONS) if (K.is(id, code)) return id; return null; };
  // Bind a key; a key used elsewhere is removed from that action so one key never does two things.
  K.bind = function (action, slot, code) {
    if (code === 'Escape' || /^Digit[0-9]$/.test(code)) return false;
    for (const id in K.binds) for (let i = 0; i < 2; i++) if (K.binds[id][i] === code) K.binds[id][i] = null;
    K.binds[action][slot] = code;
    K.save();
    return true;
  };
  K.label = function (code) {
    if (!code) return '—';
    return code.replace(/^Key/, '').replace(/^Digit/, '').replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('ShiftLeft', 'L-Shift').replace('ShiftRight', 'R-Shift').replace('ControlLeft', 'L-Ctrl').replace('ControlRight', 'R-Ctrl').replace('AltLeft', 'L-Alt').replace('AltRight', 'R-Alt');
  };
  K.name = (action) => K.label(K.binds[action] && (K.binds[action][0] || K.binds[action][1]));
})(window.NW = window.NW || {});
