'use strict';
// Persistence: checksummed localStorage saves with backup slot, validation and migration.
(function (NW) {
  const U = NW.U, D = NW.D;
  const SV = NW.Save = {};
  SV.KEY = 'nightwatch.save';
  SV.BAK = 'nightwatch.save.bak';
  SV.SETTINGS = 'nightwatch.settings';
  // Three save slots. Slot 1 keeps the original keys, so saves from before slots existed load as slot 1.
  SV.SLOTS = 3;
  SV.slot = 1;
  const key = (slot) => (slot > 1 ? SV.KEY + '.' + slot : SV.KEY);
  const bak = (slot) => (slot > 1 ? SV.KEY + '.' + slot + '.bak' : SV.BAK);
  const pick = (slot) => (slot >= 1 && slot <= SV.SLOTS ? Math.floor(slot) : SV.slot);

  function storage() { try { const k = '__nw_t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; } catch (e) { return null; } }

  SV.write = function (state) {
    const ls = storage();
    if (!ls) return { ok: false, error: 'Browser storage is unavailable (private mode?)' };
    try {
      const slot = pick(state.slot);
      const data = JSON.stringify(state);
      const mode = state.mode || {};
      const payload = JSON.stringify({ v: D.SAVE_VERSION, t: Date.now(), sum: U.fnv(data), day: state.time.day, min: Math.floor(state.time.min), nights: state.nightsSurvived, mode: mode.name || 'Standard', modeId: mode.id || 'standard', final: mode.nights || D.FINAL_NIGHT, seed: state.seedText || state.seed, data });
      const prev = ls.getItem(key(slot));
      if (prev && parse(prev).ok) ls.setItem(bak(slot), prev);
      ls.setItem(key(slot), payload);
      // read-back verification
      const back = parse(ls.getItem(key(slot)));
      if (!back.ok) return { ok: false, error: 'verification failed' };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e && e.name === 'QuotaExceededError') ? 'storage is full' : String(e && e.message || e) };
    }
  };

  function parse(raw) {
    if (!raw) return { ok: false, error: 'missing' };
    let wrap;
    try { wrap = JSON.parse(raw); } catch (e) { return { ok: false, error: 'unreadable' }; }
    if (!wrap || typeof wrap.data !== 'string' || typeof wrap.sum !== 'string') return { ok: false, error: 'malformed' };
    if (U.fnv(wrap.data) !== wrap.sum) return { ok: false, error: 'checksum mismatch' };
    let st;
    try { st = JSON.parse(wrap.data); } catch (e) { return { ok: false, error: 'unreadable data' }; }
    return { ok: true, wrap, state: st };
  }

  // Fill in fields missing from older saves using a fresh state as template
  function deepDefaults(target, def) {
    for (const k in def) {
      if (!(k in target) || target[k] === undefined) target[k] = U.clone(def[k]);
      else if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k]) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
        // don't merge into dictionaries keyed by ids
        if (['visitors', 'taken', 'loot', 'visited', 'once', 'rules', 'done', 'rooms'].includes(k)) continue;
        deepDefaults(target[k], def[k]);
      }
    }
    return target;
  }

  SV.validate = function (st) {
    const errs = [];
    const num = (v) => typeof v === 'number' && isFinite(v);
    if (!st || typeof st !== 'object') return ['not an object'];
    if (!st.time || !num(st.time.day) || st.time.day < 1 || !num(st.time.min) || st.time.min < 0 || st.time.min >= 1440) errs.push('time');
    const p = st.player;
    if (!p || !num(p.x) || !num(p.y) || !num(p.hp) || !num(p.hunger) || !num(p.temp) || typeof p.area !== 'string') errs.push('player');
    else if (!NW.World.isArea(p.area)) errs.push('player area');
    if (!Array.isArray(st.inv) || !Array.isArray(st.chest)) errs.push('inventory');
    else [st.inv, st.chest].forEach((arr) => arr.forEach((s) => { if (s && (!D.ITEMS[s.id] || !num(s.n) || s.n <= 0)) errs.push('item ' + (s && s.id)); }));
    if (!st.cabin || !st.cabin.windows || !st.cabin.doors) errs.push('cabin');
    if (!st.stove || !num(st.stove.fuel) || !D.STOVE[st.stove.setting]) errs.push('stove');
    if (!st.night || typeof st.night !== 'object') errs.push('night');
    if (!num(st.seed)) errs.push('seed');
    return errs;
  };

  SV.migrate = function (st, fromV) {
    const def = NW.G.newState(st.seed || 1);
    deepDefaults(st, def);
    // repair arrays to expected lengths
    while (st.inv.length < D.INV_SLOTS) st.inv.push(null);
    while (st.chest.length < D.CHEST_SLOTS) st.chest.push(null);
    st.inv = st.inv.map((s) => (s && D.ITEMS[s.id] && s.n > 0 ? s : null));
    st.chest = st.chest.map((s) => (s && D.ITEMS[s.id] && s.n > 0 ? s : null));
    if (st.night.active && !st.night.plan) st.night.plan = NW.Night.genPlan(st.night.n || st.time.day);
    if (st.night.plan && !st.night.plan.done) st.night.plan.done = {};
    st.version = D.SAVE_VERSION;
    void fromV;
    return st;
  };

  // returns {state} or {error, recovered?}
  SV.read = function (slot) {
    slot = pick(slot);
    const ls = storage();
    if (!ls) return { error: 'Browser storage is unavailable.' };
    const tryOne = (key) => {
      const r = parse(ls.getItem(key));
      if (!r.ok) return r;
      let st = r.state;
      try { st = SV.migrate(st, r.wrap.v); } catch (e) { return { ok: false, error: 'migration failed' }; }
      const errs = SV.validate(st);
      if (errs.length) return { ok: false, error: 'invalid: ' + errs.join(', ') };
      return { ok: true, state: st, wrap: r.wrap };
    };
    const main = tryOne(key(slot));
    if (main.ok) return { state: main.state, meta: main.wrap };
    if (main.error === 'missing') return { none: true };
    const back = tryOne(bak(slot));
    if (back.ok) return { state: back.state, meta: back.wrap, recovered: 'The latest save was damaged (' + main.error + '). Restored the previous autosave.' };
    return { error: 'Save data is damaged (' + main.error + ') and no backup could be recovered.' };
  };

  SV.summary = function (slot) {
    slot = pick(slot);
    const ls = storage(); if (!ls) return null;
    const raw = ls.getItem(key(slot));
    if (!raw) return null;
    try {
      const w = JSON.parse(raw);
      return { slot, day: w.day, min: w.min, nights: w.nights, t: w.t, mode: w.mode || 'Standard', modeId: w.modeId || 'standard', final: w.final || D.FINAL_NIGHT, seed: w.seed, valid: U.fnv(w.data || '') === w.sum };
    } catch (e) { return { slot, valid: false }; }
  };
  SV.exists = function (slot) { const ls = storage(); return !!(ls && ls.getItem(key(pick(slot)))); };
  SV.clear = function (slot) { const ls = storage(); if (!ls) return; slot = pick(slot); ls.removeItem(key(slot)); ls.removeItem(bak(slot)); };
  // Summaries for every slot (null where empty).
  SV.list = function () { const out = []; for (let i = 1; i <= SV.SLOTS; i++) out.push(SV.summary(i)); return out; };
  SV.anyExists = function () { for (let i = 1; i <= SV.SLOTS; i++) if (SV.exists(i)) return true; return false; };
  // The most recently written slot, or 0 when every slot is empty.
  SV.latest = function () {
    let best = 0, bt = -1;
    SV.list().forEach((m, i) => { if (m && (m.t || 0) > bt) { bt = m.t || 0; best = i + 1; } });
    return best;
  };
  SV.firstFree = function () { for (let i = 1; i <= SV.SLOTS; i++) if (!SV.exists(i)) return i; return 0; };

  SV.loadSettings = function () {
    const ls = storage(); if (!ls) return;
    try { const s = JSON.parse(ls.getItem(SV.SETTINGS) || 'null'); if (s && typeof s === 'object') for (const k in NW.settings) if (k in s) NW.settings[k] = s[k]; } catch (e) { /* defaults */ }
  };
  SV.saveSettings = function () { const ls = storage(); if (!ls) return; try { ls.setItem(SV.SETTINGS, JSON.stringify(NW.settings)); } catch (e) { /* ignore */ } };
})(window.NW);
