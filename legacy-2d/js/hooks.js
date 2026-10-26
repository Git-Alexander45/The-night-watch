'use strict';
// Extension hooks: feature modules plug into the core through events, value filters and providers.
// Every hook call is isolated: a failing module logs an error and never breaks the game loop.
(function (NW) {
  const H = NW.Hooks = { _h: {} };

  // Register a handler. Returns a function that removes it.
  H.on = function (name, fn) {
    (H._h[name] = H._h[name] || []).push(fn);
    return () => { const a = H._h[name]; const i = a ? a.indexOf(fn) : -1; if (i >= 0) a.splice(i, 1); };
  };
  function fail(name, e) {
    console.error('[hook ' + name + ']', e);
    NW.hookErrors = NW.hookErrors || [];
    if (NW.hookErrors.length < 50) NW.hookErrors.push(name + ': ' + (e && e.stack || e));
  }
  // Fire an event: handlers receive the arguments, return values are ignored.
  H.emit = function (name) {
    const a = H._h[name]; if (!a || !a.length) return;
    const args = Array.prototype.slice.call(arguments, 1);
    for (const fn of a.slice()) { try { fn.apply(null, args); } catch (e) { fail(name, e); } }
  };
  // Pass a value through every handler; a handler returns the new value (or undefined to keep it).
  H.filter = function (name, value) {
    const a = H._h[name]; if (!a || !a.length) return value;
    const args = Array.prototype.slice.call(arguments, 2);
    for (const fn of a.slice()) { try { const r = fn.apply(null, [value].concat(args)); if (r !== undefined) value = r; } catch (e) { fail(name, e); } }
    return value;
  };
  // Collect arrays returned by handlers into one array.
  H.collect = function (name) {
    const a = H._h[name]; const out = []; if (!a || !a.length) return out;
    const args = Array.prototype.slice.call(arguments, 1);
    for (const fn of a.slice()) { try { const r = fn.apply(null, args); if (Array.isArray(r)) out.push.apply(out, r); else if (r) out.push(r); } catch (e) { fail(name, e); } }
    return out;
  };

  // Per-run module storage inside the save: NW.mod('missions', () => ({...defaults}))
  NW.mod = function (key, init) {
    const s = NW.G && NW.G.state; if (!s) return null;
    s.mods = s.mods || {};
    if (!s.mods[key]) s.mods[key] = init ? init() : {};
    return s.mods[key];
  };
})(window.NW = window.NW || {});
