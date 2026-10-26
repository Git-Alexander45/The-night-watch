'use strict';
// Inventory & container helpers. Containers are arrays of {id, n} | null.
(function (NW) {
  const D = NW.D;
  const I = NW.Inv = {};

  I.stackOf = (id) => (D.ITEMS[id] ? D.ITEMS[id].stack : 1);
  I.count = function (arr, id) { let n = 0; for (const s of arr) if (s && s.id === id) n += s.n; return n; };
  I.space = function (arr, id) {
    const st = I.stackOf(id); let n = 0;
    for (const s of arr) { if (!s) n += st; else if (s.id === id) n += st - s.n; }
    return n;
  };
  // add n of id; returns leftover that did not fit
  I.add = function (arr, id, n) {
    const st = I.stackOf(id);
    for (const s of arr) { if (n <= 0) break; if (s && s.id === id && s.n < st) { const k = Math.min(n, st - s.n); s.n += k; n -= k; } }
    for (let i = 0; i < arr.length && n > 0; i++) { if (!arr[i]) { const k = Math.min(n, st); arr[i] = { id, n: k }; n -= k; } }
    return n;
  };
  I.remove = function (arr, id, n) {
    for (let i = arr.length - 1; i >= 0 && n > 0; i--) {
      const s = arr[i];
      if (s && s.id === id) { const k = Math.min(n, s.n); s.n -= k; n -= k; if (s.n <= 0) arr[i] = null; }
    }
    return n === 0;
  };
  I.hasAll = function (arr, req) { for (const id in req) if (I.count(arr, id) < req[id]) return false; return true; };
  I.removeAll = function (arr, req) { if (!I.hasAll(arr, req)) return false; for (const id in req) I.remove(arr, id, req[id]); return true; };
  I.reqText = function (req, arr) {
    return Object.keys(req).map((id) => {
      const have = arr ? I.count(arr, id) : null;
      return req[id] + ' ' + D.ITEMS[id].name + (have != null ? ' (' + have + ')' : '');
    }).join(', ');
  };
  I.compact = function (arr) {
    const items = arr.filter(Boolean); arr.fill(null);
    items.sort((a, b) => (a.id < b.id ? -1 : 1));
    items.forEach((s) => I.add(arr, s.id, s.n));
  };
  // Give to player; overflow dropped at the player's feet
  I.give = function (id, n, quiet) {
    const G = NW.G, st = G.state;
    const left = I.add(st.inv, id, n);
    const got = n - left;
    if (got > 0 && !quiet) G.msg('+' + got + ' ' + D.ITEMS[id].name, 'item');
    if (left > 0) {
      G.dropItem(id, left);
      G.msg('Inventory full. Dropped ' + left + ' ' + D.ITEMS[id].name + '.', 'warn');
    }
    return got;
  };
  I.bestOf = function (arr, order) { for (const id of order) if (I.count(arr, id) > 0) return id; return null; };
})(window.NW);
