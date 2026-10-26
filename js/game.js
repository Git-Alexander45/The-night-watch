'use strict';
// Core game: state creation, main update, input, movement, interaction, area transitions, time.
(function (NW) {
  const U = NW.U, D = NW.D, W = NW.World, I = NW.Inv, S = NW.S;
  const TS = D.TILE;
  const G = NW.G = {
    state: null, area: null, mode: 'menu', paused: false, dead: false,
    hold: null, fx: [], shake: 0, flash: 0, hurtFlash: 0, fade: 0,
    anim: 0, moving: false, sprinting: false, stamDelay: 0, stepDist: 0,
    keys: {}, mouse: { x: 240, y: 136, moved: false }, dynamicColliders: [],
    focus: null, t: 0, autosaveT: 0, lastSave: 0, shootCd: 0,
  };
  NW.settings = { master: 0.8, music: 0.55, sfx: 0.8, amb: 0.7, shake: true, quality: 'medium', view: '3d', perf: false, sens: 1, invertY: false, mute: false };

  // =========================================================== NEW STATE
  G.newState = function (seed) {
    seed = seed >>> 0 || (Math.floor(Math.random() * 2 ** 31) >>> 0);
    const inv = new Array(D.INV_SLOTS).fill(null);
    const chest = new Array(D.CHEST_SLOTS).fill(null);
    I.add(inv, 'wood', 2); I.add(inv, 'ammo', 10); I.add(inv, 'canned', 1);
    I.add(chest, 'cooked_rabbit', 2); I.add(chest, 'canned', 2); I.add(chest, 'plank', 3); I.add(chest, 'nails', 10);
    I.add(chest, 'yarrow', 2); I.add(chest, 'bandage', 1); I.add(chest, 'cloth', 1); I.add(chest, 'scrap', 1); I.add(chest, 'oil', 1);
    return {
      version: D.SAVE_VERSION, seed,
      time: { day: 1, min: 8 * 60 },
      player: { area: 'room_main', x: 120, y: 128, dir: 'down', hp: 100, hunger: 78, stamina: 100, temp: 36.8, coat: 'jacket', sick: 0, lastCause: null },
      inv, chest, woodbox: 6, woodpile: 14,
      stove: { setting: 'low', fuel: 22 },
      lamps: { room_main: false, room_bed: false, room_office: false, room_storage: false }, oil: 55,
      cabin: NW.Cabin.newCabin(),
      weather: NW.Weather.newWeather(), forecast: null,
      world: { taken: {}, loot: {}, visited: { f_2_2: true }, bridgeOut: false, loop: null, cairnArea: null, cairnPos: null, cairnSeen: null, dropArea: null, loopSeen: false },
      dayEvents: [], evSeq: 1,
      animals: { area: null, list: [] },
      drops: [],
      dog: null, guests: [], visitors: {},
      night: NW.Night.newNight(),
      radio: { pending: [], log: [], seq: 1, sched: [], lastPhrase: null },
      journal: { entries: [], once: {}, rules: {}, unread: 0 },
      records: { permits: [], reports: [] },
      rep: 0, nightsSurvived: 0, endless: false, endingShown: false,
      stats: { wood: 0, animals: 0, helped: 0, repairs: 0, searched: 0 },
      tutorial: { done: {}, rooms: {} },
      deskNews: true, pendingReports: [], giftPending: false, lastSummary: null,
      mode: G.makeMode('standard'), slot: 1, options: { guided: true }, mods: {}, ending: null, endingTitle: null, seedText: String(seed),
    };
  };

  // opts: { mode: 'easy'|'standard'|'hard'|'harder'|'custom', custom: {...}, slot: 1-3, seed, intro: bool, guided: bool }
  G.newGame = function (opts) {
    opts = opts || {};
    const seed = G.parseSeed(opts.seed);
    G.state = G.newState(seed);
    W.clearCache(); NW.Render.clearCache();
    const s = G.state;
    s.mode = G.makeMode(opts.mode || 'standard', opts.custom);
    s.seedText = opts.seed != null && String(opts.seed).trim() !== '' ? String(opts.seed).trim().toUpperCase().slice(0, 24) : String(seed);
    s.slot = opts.slot || NW.Save.slot || 1;
    s.options = { guided: opts.guided !== false };
    NW.Save.slot = s.slot;
    NW.Hooks.emit('newGame', s, opts);
    NW.Events.newGameRecords();
    NW.Events.morning();
    s.weather.temp = s.forecast.day.temp; s.weather.snow = 0.3;
    const nn = s.mode.nights;
    NW.Events.journal('Day 1. ' + nn + ' nights on watch at Station 7. The stove, the wood, the radio. Base says relief comes after night ' + nn + '.', 'notes');
    NW.Events.journal('HQ protocol: real Base transmissions open with "Base to Watch Seven" and close with "Base out." Anything else is not us.', 'notes');
    const begin = () => {
      G.start();
      const K = NW.Keys;
      G.msg(K.name('up') + K.name('left') + K.name('down') + K.name('right') + ' move · ' + K.name('sprint') + ' sprint · ' + K.name('interact') + ' / 1-9 use · ' + K.name('pack') + ' pack · ' + K.name('map') + ' map · ' + K.name('journal') + ' journal · Esc pause', 'info');
      G.msg('Day 1. Explore the cabin and gather firewood before nightfall.', 'good');
      G.save('new');
      NW.Hooks.emit('firstStart', s, opts);
    };
    // A module may play the opening scene first; it returns true and calls begin() when finished.
    if (!(opts.intro && NW.Hooks.filter('playIntro', false, begin, opts) === true)) begin();
  };
  G.parseSeed = function (v) {
    if (v == null || v === '') return (Math.floor(Math.random() * 2 ** 31) >>> 0) || 1;
    const t = String(v).trim();
    if (/^\d+$/.test(t)) return (Number(t) >>> 0) || 1;
    return U.strHash(t.toUpperCase()) || 1;
  };
  // Mode settings live in the save so a run always keeps its rules.
  G.makeMode = function (id, custom) {
    const base = D.MODES[id] || D.MODES.standard;
    const m = Object.assign({ id }, U.clone(base));
    if (id === 'custom' && custom) for (const k of ['nights', 'monster', 'damage', 'hunger', 'patience', 'loot']) if (typeof custom[k] === 'number' && isFinite(custom[k])) m[k] = custom[k];
    m.nights = U.clamp(Math.round(m.nights), 3, 40);
    return m;
  };
  // Capacities that upgrades can raise: G.cap('WOODBOX_CAP'), G.cap('STOVE_CAP')
  G.cap = (k) => NW.Hooks.filter('cap', D[k], k);
  G.finalNight = () => (G.state && G.state.mode ? G.state.mode.nights : D.FINAL_NIGHT);
  G.modeVal = (k, def) => (G.state && G.state.mode && typeof G.state.mode[k] === 'number' ? G.state.mode[k] : (def == null ? 1 : def));
  G.loadState = function (st) {
    G.state = st;
    W.clearCache(); NW.Render.clearCache();
    G.start();
    G.msg('Welcome back. Day ' + st.time.day + ', ' + U.fmtClock(st.time.min) + '.', 'good');
  };
  G.start = function () {
    const s = G.state;
    G.dead = false; G.paused = false; G.hold = null; G.fx = []; G.fade = 1; G.flash = 0; G.hurtFlash = 0; G.shake = 0;
    G.area = W.get(s.player.area);
    G.refreshColliders();
    const fix = G.safeSpot(G.area, s.player.x, s.player.y, null);
    s.player.x = fix.x; s.player.y = fix.y;
    G.mode = 'play';
    NW.Survival.computeLight();
    NW.UI.clearMsgs();
    NW.UI.showGame();
    NW.Audio.setMusic(NW.Survival.isNight() ? 'night' : 'day');
    G.autosaveT = 0;
    NW.Hooks.emit('start', s);
  };

  // ============================================================ MESSAGING
  G.msg = (text, type) => NW.UI && NW.UI.msg(text, type || 'info');
  G.warn = (text) => NW.UI && NW.UI.warn(text);
  G.showText = (title, body) => NW.UI.openText(title, body);
  G.openUI = (name, arg) => NW.UI.open(name, arg);
  G.closeUI = (names) => NW.UI.closeNames(names);
  G.journal = (t, c) => NW.Events.journal(t, c);
  G.journalOnce = (k, t, c) => NW.Events.journalOnce(k, t, c);
  G.stat = (k, n) => { G.state.stats[k] = (G.state.stats[k] || 0) + n; NW.Hooks.emit('stat', k, n); };
  G.deskHasNews = () => !!G.state.deskNews;
  G.tut = function (k) {
    const t = G.state.tutorial;
    if (t.done[k]) return;
    t.done[k] = true;
    if ((k === 'lock' || k === 'curtain') && t.done.lock && t.done.curtain) G.tut('dusk');
    const ob = NW.UI.OBJECTIVES.find((o) => o.k === k);
    if (ob && G.state.time.day <= 2) G.msg('✓ ' + ob.text.replace(/\{(\w+)\}/g, (_, x) => NW.Keys.name(x)), 'good');
    NW.Hooks.emit('tut', k);
  };

  // Sound helpers ---------------------------------------------------------
  G.sfx = (name, o) => NW.Audio.play(name, o);
  function cabinGlobal(room, x, y) { const o = D.ROOM_ORIGIN[room]; return { x: o[0] * TS + x, y: o[1] * TS + y }; }
  function playerGlobal() {
    const a = G.area, p = G.state.player;
    if (a.kind === 'room') return cabinGlobal(a.id, p.x, p.y);
    if (a.id === 'f_2_2') return { x: (p.x - 144) * 2.5 + 0, y: (p.y - 48) * 2.5 + 0, outside: true };
    return null;
  }
  G.cabinPoint = function (where) {
    if (typeof where === 'object') return cabinGlobal(where.room, where.x, where.y);
    if (where === 'roof') return cabinGlobal('room_main', 64, 0);
    if (where === 'radio') return cabinGlobal('room_office', 116, 30);
    const [k, id] = where.split(':');
    if (k === 'door') return id === 'front' ? cabinGlobal('room_main', 176, 205) : cabinGlobal('room_storage', 252, 96);
    if (k === 'win') {
      const room = G.state.cabin.windows[id].room; const a = W.get(room);
      const o = a.objs.find((ob) => ob.wid === id);
      return cabinGlobal(room, o.x + 16, o.y + 8);
    }
    return cabinGlobal('room_main', 176, 100);
  };
  G.sfxCabin = function (name, where, o) {
    o = Object.assign({}, o || {});
    const src = G.cabinPoint(where);
    const pg = playerGlobal();
    // 3D view: the sound plays at its real place on/in the cabin (positional, walls muffle it); the audio module
    // maps the cabin plan into whichever cabin the listener is in (interior rooms or the f_2_2 exterior)
    if (NW.R3 && NW.R3.active && (G.area.kind === 'room' || G.area.kind === 'forest')) {
      const w = typeof where === 'string' ? where : 'obj';
      const room = typeof where === 'object' ? where.room : w === 'radio' ? 'room_office' : w.startsWith('door:') ? (w === 'door:front' ? 'room_main' : 'room_storage')
        : w.startsWith('win:') ? G.state.cabin.windows[w.split(':')[1]].room : 'room_main';
      o.cabin = { gx: src.x, gy: src.y, where: w, room };
      NW.Audio.play(name, o);
      return;
    }
    if (!pg) { o.vol = (o.vol == null ? 1 : o.vol) * 0.08; NW.Audio.play(name, o); return; }
    const dx = src.x - pg.x, dy = src.y - pg.y, d = Math.hypot(dx, dy);
    o.pan = U.clamp(dx / 260, -0.9, 0.9);
    const inRoom = G.area.kind === 'room' && typeof where === 'string' && where.startsWith('win:') && G.state.cabin.windows[where.split(':')[1]].room === G.area.id;
    o.vol = (o.vol == null ? 1 : o.vol) * U.clamp(1.15 - d / 700, 0.3, 1) * (inRoom ? 1.2 : 1) * (pg.outside ? 0.6 : 1);
    NW.Audio.play(name, o);
  };

  // footstep surface for the sound only (W.surfaceAt stays the gameplay surface): lake ice, rock, trodden trail
  G.stepSurface = function (a, x, y, surf) {
    const tl = W.tile(a, Math.floor(x / TS), Math.floor(y / TS)), s = G.state;
    if (a.kind === 'interior' && (a.id === 'in_mine' || a.theme === 'stone')) return 'stone';
    if (a.kind !== 'forest') return surf;
    if (tl === W.T.ICE) return 'ice';
    if (tl === W.T.ROCKG && s.weather.snow < 0.6) return 'stone';
    if (tl === W.T.DIRT && surf === 'snow') return 'trail';
    return surf;
  };

  // ============================================================= SAVING
  G.save = function (reason) {
    if (!G.state || G.dead || G.mode === 'menu' || G.mode === 'scene') return false;
    const now = Date.now();
    if (reason && reason !== 'manual' && reason !== 'quit' && reason !== 'auto' && reason !== 'dawn' && reason !== 'dusk' && now - G.lastSave < 2500) return false;
    const r = NW.Save.write(G.state);
    G.lastSave = now; G.autosaveT = 0;
    if (r.ok) NW.UI.saveBlip();
    else G.msg('Saving failed: ' + r.error, 'danger');
    return r.ok;
  };

  // ============================================================ DYNAMIC OBJ
  G.dynamicObjects = function () {
    const s = G.state, a = G.area, out = [];
    if (a.kind === 'forest') {
      NW.Events.objectsFor(a.id).forEach((o) => out.push(o));
      s.animals.list.forEach((an) => { if (an.dead && s.animals.area === a.id) out.push({ type: 'carcass', an, x: an.x, y: an.y, noDraw: true }); });
    }
    s.drops.forEach((d) => { if (d.area === a.id) out.push({ type: 'drop', d, x: d.x, y: d.y }); });
    if (s.dog && ((s.dog.status === 'following' && s.dog.area === a.id) || (s.dog.status === 'home' && a.id === 'room_main'))) out.push({ type: 'dog', x: s.dog.x, y: s.dog.y });
    if (a.id === 'room_main') s.guests.forEach((gs, i) => { const seat = [[170, 92, 92], [196, 92, 92], [112, 100, 106]][i % 3]; gs.x = seat[0]; gs.y = seat[1]; out.push({ type: 'guest', gs, x: seat[0], y: seat[1], sy: seat[2] }); });
    NW.Hooks.collect('objects', a.id, a).forEach((o) => { if (o && typeof o.x === 'number') { o.type = 'mod'; out.push(o); } });
    return out;
  };
  G.drawDynamic = function (g, o, t) {
    const s = G.state;
    if (o.noDraw) return;
    if (o.type === 'event') NW.Events.draw(g, o, t);
    else if (o.type === 'cairn') NW.Objects.draw(g, o, t);
    else if (o.type === 'drop') { const ic = NW.UI.iconImg(o.d.id); if (ic) { S.R(g, 'rgba(0,0,0,0.3)', o.x - 5, o.y - 1, 10, 2); g.drawImage(ic, o.x - 6, o.y - 12 + Math.sin(t * 3) * 1, 12, 12); } }
    else if (o.type === 'dog') { const d = s.dog; S.dog(g, d.x, d.y, d.face || 1, d.status === 'home' && !G.dogMoving ? 'lying' : G.dogMoving ? 'walk' : 'stand', t); }
    else if (o.type === 'guest') { const v = s.visitors[o.gs.vid]; S.human(g, o.x, o.y, Object.assign({ dir: 'down', blink: (t + o.x) % 4 < 0.15 }, v.app)); }
    else if (o.type === 'mod' && o.draw) { try { o.draw(g, t); } catch (e) { console.error(e); } }
  };
  G.dynamicActions = function (o) {
    const s = G.state;
    if (o.type === 'event') return NW.Events.actions(o);
    if (o.type === 'cairn') return NW.Objects.actions(o);
    if (o.type === 'drop') return [{ label: 'Pick up ' + o.d.n + ' ' + D.ITEMS[o.d.id].name, run: () => { const left = I.add(s.inv, o.d.id, o.d.n); if (left === o.d.n) return G.msg('No room in your pack.', 'warn'); G.sfx('pickup'); if (left > 0) o.d.n = left; else s.drops.splice(s.drops.indexOf(o.d), 1); } }];
    if (o.type === 'carcass') return [{ label: 'Butcher', time: 1.8, sound: 'chop', every: 0.6, done: () => {
      const an = o.an;
      if (an.type === 'rabbit') I.give('raw_rabbit', 1); else if (an.type === 'deer') I.give('raw_venison', 3); else G.msg('Nothing worth taking from the wolf.');
      s.animals.list.splice(s.animals.list.indexOf(an), 1); G.tut('food');
    } }];
    if (o.type === 'dog') return NW.Events.dogActions();
    if (o.type === 'guest') return NW.Night.guestActions(o.gs);
    if (o.type === 'mod') { try { return (o.actions && o.actions()) || []; } catch (e) { console.error(e); return []; } }
    return [];
  };
  G.dynamicName = function (o) {
    if (o.type === 'event') return NW.Events.name(o);
    if (o.type === 'cairn') return 'Red cairn';
    if (o.type === 'drop') return D.ITEMS[o.d.id].name;
    if (o.type === 'carcass') return o.an.type === 'rabbit' ? 'Dead rabbit' : o.an.type === 'deer' ? 'Dead deer' : 'Dead wolf';
    if (o.type === 'dog') return 'Juniper' + (G.state.dog.fedDay >= G.state.time.day ? '' : ' (hungry)');
    if (o.type === 'guest') { const v = G.state.visitors[o.gs.vid]; return v.name + (o.gs.satisfied ? '' : ' — needs ' + v.need); }
    if (o.type === 'mod') { try { return typeof o.name === 'function' ? o.name() : o.name || null; } catch (e) { return null; } }
    return null;
  };
  // Is (x, y) a good place for a new object in an area? Walkable, reachable, clear of the edges,
  // and at least r px from day events and every module's objects. Used by feature modules.
  let spotGuard = false;
  G.spotFree = function (areaId, x, y, r) {
    r = r || 28;
    const a = W.get(areaId);
    if (x < 40 || y < 40 || x > a.w * TS - 40 || y > a.h * TS - 24) return false;
    if (W.blocked(a, x - 10, y - 8, 20, 10, null, true)) return false;
    if (a.reach && !a.reach[Math.floor(y / TS) * a.w + Math.floor(x / TS)]) return false;
    const near = (o) => o && typeof o.x === 'number' && Math.abs(o.x - x) < r && Math.abs(o.y - y) < r;
    if (a.kind === 'forest' && NW.Events.objectsFor(areaId).some(near)) return false;
    if (areaId === 'f_2_2' && x > 120 && x < 400 && y < 230) return false; // the cabin and its porch
    if (!spotGuard) { spotGuard = true; try { if (NW.Hooks.collect('objects', areaId, a).some(near)) return false; } finally { spotGuard = false; } }
    return true;
  };
  // A free spot in an area from a seeded rnd(), searched around (cx, cy) when given. Null if none.
  G.findFreeSpot = function (areaId, rnd, cx, cy, r) {
    const a = W.get(areaId);
    for (let i = 0; i < 300; i++) {
      const x = cx != null && i < 200 ? cx + (rnd() - 0.5) * (40 + i * 1.5) : 48 + rnd() * (a.w * TS - 96);
      const y = cy != null && i < 200 ? cy + (rnd() - 0.5) * (30 + i * 1.0) : 48 + rnd() * (a.h * TS - 80);
      const px = Math.round(x), py = Math.round(y);
      if (G.spotFree(areaId, px, py, r)) return { x: px, y: py };
    }
    return null;
  };
  G.refreshColliders = function () {
    const out = [];
    if (G.area && G.area.kind === 'forest') NW.Events.objectsFor(G.area.id).forEach((o) => { if (o.solid) out.push(o.type === 'cairn' ? { x: o.x - 9, y: o.y - 8, w: 18, h: 8 } : { x: o.x - 10, y: o.y - 8, w: 20, h: 8 }); });
    if (G.area) NW.Hooks.collect('objects', G.area.id, G.area).forEach((o) => { if (o && o.solid && typeof o.solid === 'object') out.push(o.solid); });
    G.dynamicColliders = out;
    // something new appeared on top of the player (a crate dropped at dawn): step them clear of it
    const p = G.state && G.state.player;
    if (p && G.area && p.area === G.area.id && out.some((r) => p.x + 5 > r.x && p.x - 5 < r.x + r.w && p.y + 1 > r.y && p.y - 4 < r.y + r.h)) {
      const fix = G.safeSpot(G.area, p.x, p.y, null); p.x = fix.x; p.y = fix.y;
    }
  };
  G.dropItem = function (id, n) {
    const p = G.state.player;
    G.state.drops.push({ area: G.area.id, x: Math.round(p.x + U.rand(-6, 6)), y: Math.round(p.y + 4), id, n });
  };

  // ======================================================== INTERACTION
  function irect(o) {
    if (o.type === 'window' || o.type === 'door') return { x: o.x, y: o.y, w: o.w, h: o.h };
    if (o.type === 'extdoor') return { x: o.x - o.w / 2, y: o.y - o.h / 2, w: o.w, h: o.h };
    if (o.type === 'lamp') return { x: o.hx - 6, y: o.hy - 10, w: 12, h: 12 };
    if (o.cx != null) return { x: o.cx, y: o.cy, w: o.cw, h: o.ch };
    const c = W.collider(o); if (c) return c;
    return { x: o.x - 7, y: o.y - 10, w: 14, h: 12 };
  }
  const NO_ACT = new Set(['tree', 'rock', 'stump', 'reeds', 'rug', 'deco', 'cabin_ext', 'cabin_annex', 'chopblock', 'wallmap']);
  function findFocus() {
    const s = G.state, p = s.player, a = G.area;
    const px = p.x, py = p.y - 5;
    // first person: look direction is continuous and reach is a little longer (arm's length from the eyes)
    const v3 = NW.R3 && NW.R3.active && p.fx != null;
    const fx = v3 ? p.fx * 11 : p.dir === 'left' ? -6 : p.dir === 'right' ? 6 : 0, fy = v3 ? p.fy * 11 : p.dir === 'up' ? -6 : p.dir === 'down' ? 6 : 0;
    const reach = v3 ? 19 : 15;
    let best = null, bd = 1e9, bestAct = false;
    const extra = (o) => NW.Hooks.filter('actions', [], o, a);
    const dyns = G.dynamicObjects();
    const dynSoon = (o) => dyns.some((q) => q !== o && (G.dynamicActions(q) || []).length && U.distToRect(px, py, irect(q)) < 15);
    const consider = (o, dyn) => {
      if (!dyn && o.res && !NW.Objects.available(o) && (o.type === 'branches' || o.type === 'herb' || o.type === 'mushrooms')) return;
      const r = irect(o);
      let d = U.distToRect(px + fx, py + fy, r) * 0.6 + U.distToRect(px, py, r) * 0.4;
      if (v3) { const cx = r.x + r.w / 2 - px, cy = r.y + r.h / 2 - py, cl = Math.hypot(cx, cy); if (cl > 8 && (cx * p.fx + cy * p.fy) / cl < 0.2) return; }
      if (!(d < reach && d < bd)) return;
      if (!dyn && (NO_ACT.has(o.type) || (o.type === 'struct' && !NW.Objects.name(o))) && !extra(o).length) return;
      // a dynamic thing with nothing left to do (a hiker already helped) must not hide what sits next to it
      if (dyn && !(G.dynamicActions(o) || []).length && (bestAct || dynSoon(o))) return;
      bd = d; best = { o, dyn }; bestAct = !dyn || !!(G.dynamicActions(o) || []).length;
    };
    a.objs.forEach((o) => consider(o, false));
    dyns.forEach((o) => consider(o, true));
    if (!best) return null;
    const o = best.o;
    let acts = best.dyn ? G.dynamicActions(o) : NW.Objects.actions(o).concat(extra(o));
    const name = NW.Hooks.filter('name', best.dyn ? G.dynamicName(o) : NW.Objects.name(o), o, a);
    if (!acts || !acts.length) { if (!name) return null; acts = []; }
    return { o, dyn: best.dyn, name, actions: acts };
  }
  G.doAction = function (i) {
    if (G.hold || G.dead) return;
    const f = G.focus; if (!f || !f.actions[i]) return;
    const a = f.actions[i];
    if (a.disabled) { G.msg(typeof a.disabled === 'string' ? a.disabled : 'Not possible right now.', 'warn'); G.sfx('dryfire'); return; }
    if (a.confirm && !(G.confirmAct && G.confirmAct.label === a.label && G.t < G.confirmAct.until)) {
      G.confirmAct = { label: a.label, until: G.t + 2.5 };
      G.msg('Press again to confirm: ' + a.label, 'warn'); G.sfx('dryfire');
      return;
    }
    G.confirmAct = null;
    if (a.time) {
      G.hold = { label: a.label, time: a.time, t: 0, done: a.done, obj: a.obj || f.o, focusObj: f.o, sound: a.sound, every: a.every || 0.8, sndT: 0, danger: a.danger };
      G.sfx('click');
    } else { G.sfx('click'); a.run && a.run(); }
  };

  // ============================================================ TRANSITIONS
  G.enterArea = function (id, x, y, dir) {
    const s = G.state, prev = G.area ? G.area.id : null;
    G.area = W.get(id);
    s.player.area = id; s.player.x = x; s.player.y = y; if (dir) s.player.dir = dir;
    G.fade = 0.9; G.hold = null; G.focus = null;
    if (G.area.kind === 'forest') {
      s.world.visited[id] = true;
      if (s.animals.area !== id) spawnAnimals();
    }
    if (G.area.kind === 'room' && !G.area.remote) { s.tutorial.rooms[id] = true; if (Object.keys(s.tutorial.rooms).length >= 4) G.tut('look'); }
    // dog follows
    if (s.dog && s.dog.status === 'following') {
      if (G.area.kind === 'room' && !G.area.remote) { s.dog.status = 'home'; s.dog.area = 'room_main'; s.dog.x = 96; s.dog.y = 140; G.msg('Juniper curls up by the stove. She will warn you when something comes.', 'good'); G.journalOnce('dog_home', 'Juniper is home. She growls at things I cannot hear. Feed her once a day.', 'notes'); }
      else { s.dog.area = id; const ds = NW.Entities.freeNear(G.area, x, y + 6); s.dog.x = ds.x; s.dog.y = ds.y; }
    }
    G.refreshColliders();
    NW.Hooks.emit('areaEnter', id, prev);
    NW.UI.areaName(G.area.kind === 'forest' ? D.AREAS[id].name : G.area.name);
    if (prev && (G.area.kind === 'forest' || (prev && prev.startsWith('f_')))) G.save('area');
  };
  G.doorAnim = {};
  G.swingDoor = (did) => { G.doorAnim[did] = 0.6; };
  G.goOutside = function (did) {
    const s = G.state, d = s.cabin.doors[did];
    G.swingDoor(did);
    if (d.locked && !d.lockBroken && d.hp > 0) { d.locked = false; G.sfx('latch'); }
    G.sfx('door');
    if (did === 'front') G.enterArea('f_2_2', 240, 196, 'down'); else G.enterArea('f_2_2', 360, 182, 'down');
    if (NW.Survival.isNight() && s.night.n >= 2) G.msg('It is dark. Something walks the forest at night — stay in the clearing.', 'warn');
  };
  G.enterCabin = function (did) {
    const s = G.state, d = s.cabin.doors[did];
    G.swingDoor(did);
    if (d.locked && !d.lockBroken && d.hp > 0) { d.locked = false; G.sfx('latch'); }
    G.sfx('door');
    if (did === 'front') G.enterArea('room_main', 176, 178, 'up'); else G.enterArea('room_storage', 226, 96, 'left');
    if (did === 'front' && s.night.vis) { G.msg('The figure on the porch follows you through the open door.', 'danger'); NW.Night.openForVisitor(); return; }
    if (NW.Survival.isNight() || s.time.min > D.DUSK) G.msg('Lock the ' + did + ' door behind you.', 'warn');
  };

  function spawnAnimals() {
    const s = G.state, a = G.area;
    s.animals = { area: a.id, list: [] };
    if (a.id === 'f_2_2') return;
    const night = NW.Survival.isNight();
    const [ax, ay] = [a.ax, a.ay];
    const farness = Math.abs(ax - 2) + Math.abs(ay - 2);
    const rnd = Math.random;
    const spot = () => {
      for (let i = 0; i < 60; i++) {
        const tx = 2 + Math.floor(rnd() * 26), ty = 2 + Math.floor(rnd() * 13);
        if (a.reach && !a.reach[ty * a.w + tx]) continue;
        const x = tx * TS + 8, y = ty * TS + 10;
        if (U.dist(x, y, s.player.x, s.player.y) < 90) continue;
        if (!W.blocked(a, x - 4, y - 3, 8, 4)) return { x, y };
      }
      return null;
    };
    const add = (type, extra) => { const p = spot(); if (p) s.animals.list.push(Object.assign({ type, x: p.x, y: p.y, vx: 0, vy: 0, t: rnd() * 2, face: rnd() < 0.5 ? -1 : 1, hp: type === 'wolf' ? 2 : 1, state: 'idle' }, extra || {})); };
    const nr = night ? (rnd() < 0.3 ? 1 : 0) : (rnd() < 0.75 ? 1 + Math.floor(rnd() * 2) : 0);
    for (let i = 0; i < nr; i++) add('rabbit');
    if (!night && rnd() < 0.3 + farness * 0.08) add('deer', { grazing: true });
    if (!night && rnd() < 0.5) for (let i = 0; i < 2 + Math.floor(rnd() * 3); i++) add('crow');
    const wolfEv = s.dayEvents.find((e) => e.type === 'wolves' && e.area === a.id && e.status !== 'done');
    if (!night && (wolfEv || (farness >= 3 && s.time.day >= 3 && rnd() < 0.12))) { for (let i = 0; i < 2 + (s.time.day > 5 ? 1 : 0); i++) add('wolf'); if (wolfEv) wolfEv.status = 'done'; }
  }

  // ============================================================== UPDATE
  G.update = function (dt) {
    if (G.mode !== 'play' || G.paused) return;
    const s = G.state;
    G.t += dt;
    G.fade = Math.max(0, G.fade - dt * 3);
    G.flash = Math.max(0, G.flash - dt * 1.5);
    G.hurtFlash = Math.max(0, G.hurtFlash - dt * 2);
    G.shake = Math.max(0, G.shake - dt * 10);
    G.shootCd = Math.max(0, G.shootCd - dt);
    if (G.dead) return;
    G.refreshColliders();
    for (const k in G.doorAnim) { G.doorAnim[k] -= dt; if (G.doorAnim[k] <= 0) delete G.doorAnim[k]; }
    for (let i = G.fx.length - 1; i >= 0; i--) { G.fx[i].life -= dt; if (G.fx[i].life <= 0) G.fx.splice(i, 1); }

    // time
    const night = NW.Survival.isNight();
    const speed = night ? D.NIGHT_SPEED : D.DAY_SPEED;
    const gm = speed * dt;
    advanceTime(gm);
    if (G.mode !== 'play') return;

    updatePlayer(dt);
    NW.Survival.update(dt, gm);
    if (G.dead) return;
    NW.Night.update(dt, gm);
    if (G.dead) return;
    NW.Entities.update(dt);
    NW.Hooks.emit('update', dt, gm);
    if (G.dead || G.mode !== 'play') return;
    updateHold(dt);
    G.focus = G.hold ? G.focus : findFocus();

    // radio schedule
    for (let i = s.radio.sched.length - 1; i >= 0; i--) {
      const r = s.radio.sched[i];
      if (r.day < s.time.day || (r.day === s.time.day && s.time.min >= r.min)) { s.radio.sched.splice(i, 1); NW.Events.radio('base', r.text); }
    }
    // autosave
    G.autosaveT += dt;
    if (G.autosaveT > 30) G.save('auto');

    // audio
    const inside = G.area.kind !== 'forest', inCab = G.area.kind === 'room';
    const L = NW.Survival.light;
    let fireLvl = 0, firePan = 0;
    if (NW.Survival.stoveLit()) {
      const lv = { low: 0.35, medium: 0.6, high: 1 }[s.stove.setting];
      if (G.area.id === 'room_main') { const d = U.dist(s.player.x, s.player.y, 64, 50); fireLvl = lv * U.clamp(1 - d / 260, 0.15, 1); firePan = U.clamp((64 - s.player.x) / -200, -1, 1); }
      else if (inCab) fireLvl = lv * 0.08;
    }
    const n = s.night;
    NW.Audio.ambience({
      indoors: inside, wind: s.weather.wind, rain: s.weather.type === 'rain' ? s.weather.precip : 0,
      fire: fireLvl, firePan,
      drone: (n.active && n.lh.stage === 'circling' ? 0.5 : 0) + (n.active && n.lh.stage === 'window' ? 1 : 0),
      whisper: n.active && n.dd.on && inCab ? U.clamp((n.dd.meter - 25) / 75, 0, 1) * (L.room[G.area.id] < 0.3 ? 1 : 0.4) : 0,
      radio: s.radio.pending.length ? (G.area.id === 'room_office' ? 0.8 : inCab ? 0.12 : 0) : 0,
      tension: NW.Night.tension(),
      // layered / positional ambience
      area: G.area.id, kind: G.area.kind, inCabin: inCab, snow: s.weather.snow,
      snowing: s.weather.type === 'snow' || s.weather.type === 'blizzard' ? s.weather.precip : 0, temp: s.weather.temp,
      stove: NW.Survival.stoveLit() ? { low: 0.35, medium: 0.6, high: 1 }[s.stove.setting] || 0 : 0,
      radioPending: s.radio.pending.length, night: NW.Survival.isNight(), min: s.time.min, dusk: D.DUSK,
      visitor: n.vis ? { knock: n.vis.knock, mimic: !!(s.visitors[n.vis.vid] && s.visitors[n.vis.vid].mimic) } : null,
      muted: !!NW.settings.mute,
    }, dt);
    // modules may choose another score (finale, interiors): filter('music', mode, state, area)
    const wantMusic = NW.Hooks.filter('music', NW.Survival.isNight() || s.time.min >= D.DUSK ? 'night' : 'day', s, G.area);
    if (NW.Audio.musicMode !== wantMusic) NW.Audio.setMusic(wantMusic);
    if (!night && G.area.kind === 'forest' && Math.random() < dt * 0.06) G.sfx(Math.random() < 0.7 ? 'bird' : 'crow', { vol: 0.25, pan: U.rand(-1, 1), wet: 0.4 });
    if (!night && G.area.kind === 'forest' && Math.random() < dt * 0.008) G.sfx('howl', { vol: 0.1, pan: U.rand(-1, 1), wet: 0.9 });
  };

  function advanceTime(gm) {
    const s = G.state, t = s.time;
    const before = t.min;
    t.min += gm;
    const cross = (m) => before < m && t.min >= m;
    if (cross(D.DUSK)) { G.msg('The light is failing. Head back to the cabin before dark.', 'warn'); G.sfx('howl', { vol: 0.2, wet: 0.9 }); NW.Hooks.emit('dusk', s.time.day); }
    if (cross(D.DUSK + 40)) G.msg('Nightfall in 20 minutes. Lock the doors. Draw the curtains. Fill the wood box.', 'warn');
    if (cross(D.NIGHT_START)) NW.Night.begin();
    if (t.min >= 1440) { t.min -= 1440; t.day += 1; }
    if (before < D.DAWN && t.min >= D.DAWN && t.min < D.DAWN + 60) dawn();
  }

  function dawn() {
    const s = G.state;
    const n = s.night.n;
    const lines = NW.Night.end() || [];
    NW.Events.morning();
    if (s.dog && s.dog.status === 'following') s.dog.status = 'gone';
    G.msg('Sunrise. You survived night ' + n + '.', 'good');
    NW.Hooks.emit('dawn', n, lines);
    G.save('dawn');
    if (n >= G.finalNight() && !s.endingShown) {
      s.endingShown = true;
      // A module may pick an ending from the run's choices: { id, title, text }.
      const ending = NW.Hooks.filter('ending', null, { night: n, lines, mode: s.mode });
      if (ending) { s.ending = ending.id || 'custom'; s.endingTitle = ending.title; }
      G.save('dawn');
      NW.Hooks.emit('endingShown', ending, n);
      NW.UI.open('ending', { night: n, lines, ending });
    } else NW.UI.open('dawn', { night: n, lines });
  }

  // ================================================================ PLAYER
  function updatePlayer(dt) {
    const s = G.state, p = s.player, a = G.area, k = G.keys;
    if (NW.UI.blocksMovement()) { G.moving = false; G.sprinting = false; return; }
    let mx = 0, my = 0;
    const KB = NW.Keys;
    const R3 = NW.R3 && NW.R3.active ? NW.R3 : null;
    // in first person the arrow keys turn the view instead of strafing
    const held = (act) => (R3 && (act === 'left' || act === 'right') ? KB.binds[act].some((c) => c && c !== 'ArrowLeft' && c !== 'ArrowRight' && k[c]) : KB.held(act, k));
    if (held('left')) mx -= 1; if (held('right')) mx += 1;
    if (held('up')) my -= 1; if (held('down')) my += 1;
    const moving = mx !== 0 || my !== 0;
    if (R3) { const f = R3.Controls.facing(); p.fx = f.x; p.fy = f.y; p.dir = R3.Controls.dirName(); }
    if (moving && G.hold) { G.hold = null; G.msg('Interrupted.'); }
    let speed = 58;
    const wantSprint = KB.held('sprint', k) && moving && p.stamina > 1;
    G.sprinting = wantSprint && !G.sprintLock;
    if (p.stamina <= 1) G.sprintLock = true; if (G.sprintLock && p.stamina > 25) G.sprintLock = false;
    if (G.sprinting) speed = p.coat === 'parka' ? 90 : 98;
    if (p.temp < 34) speed *= 0.85;
    if (p.hunger <= 0) speed *= 0.9;
    if (p.hp < 25) speed *= 0.9;
    const tl = W.tile(a, Math.floor(p.x / TS), Math.floor(p.y / TS));
    if (tl === W.T.FORD) speed *= 0.6;
    if (a.kind === 'forest' && s.weather.snow > 0.75 && tl !== W.T.DIRT) speed *= 0.92;
    if (moving) {
      if (R3) { const mv = R3.Controls.moveVector(mx, my); mx = mv.x; my = mv.y; }
      const l = Math.hypot(mx, my); mx /= l; my /= l;
      if (!R3) { if (Math.abs(mx) > Math.abs(my)) p.dir = mx < 0 ? 'left' : 'right'; else p.dir = my < 0 ? 'up' : 'down'; }
      const dx = mx * speed * dt, dy = my * speed * dt;
      const bw = 10, bh = 5;
      const free = (x, y) => !W.blocked(a, x - bw / 2, y - bh + 1, bw, bh);
      // when a full step is blocked, advance in small increments up to the obstacle
      const nudge = (ax, ay) => { const n = Math.ceil(Math.hypot(ax, ay) / 0.25); for (let i = 0; i < n; i++) { if (!free(p.x + ax / n, p.y + ay / n)) break; p.x += ax / n; p.y += ay / n; } };
      if (free(p.x + dx, p.y)) p.x += dx;
      else { nudge(dx, 0); if (Math.abs(my) < 0.1) { // slide around corners
        if (free(p.x + dx, p.y - 3)) p.y -= 40 * dt; else if (free(p.x + dx, p.y + 3)) p.y += 40 * dt;
      } }
      if (free(p.x, p.y + dy)) p.y += dy;
      else { nudge(0, dy); if (Math.abs(mx) < 0.1) {
        if (free(p.x - 3, p.y + dy)) p.x -= 40 * dt; else if (free(p.x + 3, p.y + dy)) p.x += 40 * dt;
      } }
      const moved = Math.hypot(dx, dy);
      G.stepDist += moved; G.anim += moved / 7;
      if (G.stepDist > (G.sprinting ? 17 : 13)) {
        G.stepDist = 0;
        const surf = W.surfaceAt(a, p.x, p.y);
        G.sfx('step', { surface: G.stepSurface(a, p.x, p.y, surf), vol: G.sprinting ? 0.7 : 0.5, sprint: G.sprinting, depth: s.weather.snow, cold: s.weather.temp < -8, wet: a.id === 'in_mine' ? 0.45 : 0 });
        if (a.kind === 'forest' && s.weather.snow > 0.3 && surf === 'snow') NW.Render.addPrint(a.id, p.x + (Math.random() < 0.5 ? -2 : 1), p.y - 1);
        if (a.kind === 'room' && Math.random() < 0.04) G.sfx('creak', { vol: 0.25 });
      }
    }
    G.moving = moving;
    // exits
    if (a.kind !== 'forest') {
      for (const e of a.exits) if (U.pointIn(p.x, p.y - 2, e)) { G.sfx('step', { surface: 'wood' }); G.enterArea(e.to, e.tx, e.ty, e.dir); return; }
    } else {
      let dir = null;
      if (p.x < 3) dir = 'w'; else if (p.x > a.w * TS - 3) dir = 'e'; else if (p.y < 4) dir = 'n'; else if (p.y > a.h * TS - 1) dir = 's';
      if (dir) {
        const cx = a.creek ? 9 : 15;
        const inCorridor = (dir === 'n' || dir === 's') ? (p.x >= (cx - 2) * TS && p.x < (cx + 4) * TS) : (p.y >= 6 * TS && p.y < 11 * TS);
        if (!a.open[dir] || !inCorridor) { p.x = U.clamp(p.x, 4, a.w * TS - 4); p.y = U.clamp(p.y, 5, a.h * TS - 2); return; }
        const lp = s.world.loop;
        if (lp && lp.area === a.id && lp.dir === dir) {
          const nx = dir === 'w' ? a.w * TS - 6 : dir === 'e' ? 6 : p.x, ny = dir === 'n' ? a.h * TS - 4 : dir === 's' ? 8 : p.y;
          const sp = G.safeSpot(a, nx, ny, dir);
          G.enterArea(a.id, sp.x, sp.y);
          if (!s.world.loopSeen || s.world.loopSeen !== s.time.day) { s.world.loopSeen = s.time.day; G.msg('The trail loops back on itself. You are where you started.', 'warn'); G.journal('The trail ' + ({ n: 'north', s: 'south', e: 'east', w: 'west' })[dir] + ' out of ' + D.AREAS[a.id].name + ' looped back into itself today. The map shows a straight path.', 'sightings'); }
          return;
        }
        const nx = a.ax + (dir === 'e' ? 1 : dir === 'w' ? -1 : 0), ny = a.ay + (dir === 's' ? 1 : dir === 'n' ? -1 : 0);
        const id = D.areaId(nx, ny);
        const px = dir === 'w' ? a.w * TS - 6 : dir === 'e' ? 6 : p.x, py = dir === 'n' ? a.h * TS - 4 : dir === 's' ? 8 : p.y;
        const sp = G.safeSpot(W.get(id), px, py, dir);
        G.enterArea(id, sp.x, sp.y);
      }
    }
  }

  // A walkable spot for the player near (x, y): the corridor centre, then a spiral search, then the area's hub.
  const pFree = (a, x, y) => !W.blocked(a, x - 5, y - 4, 10, 5);
  G.safeSpot = function (a, x, y, dir) {
    if (pFree(a, x, y)) return { x, y };
    if (a.kind === 'forest') {
      const cx = (a.creek ? 9 : 15) * TS + 8;
      const c = dir === 'n' || dir === 's' ? { x: cx, y } : dir ? { x, y: 8 * TS + 8 } : null;
      if (c && pFree(a, c.x, c.y)) return c;
    }
    for (let r = 4; r <= 64; r += 4) for (let k = 0; k < 16; k++) {
      const ang = k / 16 * Math.PI * 2, nx = x + Math.cos(ang) * r, ny = y + Math.sin(ang) * r;
      if (nx > 6 && ny > 6 && nx < a.w * TS - 6 && ny < a.h * TS - 2 && pFree(a, nx, ny)) return { x: nx, y: ny };
    }
    return a.hub ? { x: a.hub.x * TS + 8, y: a.hub.y * TS + 10 } : { x, y };
  };

  function updateHold(dt) {
    const h = G.hold; if (!h) return;
    const p = G.state.player;
    const o = h.focusObj;
    if (o) {
      const r = irect(o);
      if (U.distToRect(p.x, p.y - 5, r) > 26) { G.hold = null; return; }
    }
    h.t += dt; h.sndT -= dt;
    if (h.sound && h.sndT <= 0) { h.sndT = h.every; G.sfx(h.sound, { vol: 0.7 }); }
    if (h.t >= h.time) { G.hold = null; try { h.done(); } catch (e) { console.error(e); } }
  }

  // ================================================================ COMBAT
  G.shoot = function (tx, ty) {
    const s = G.state, a = G.area, p = s.player;
    if (G.dead) return;
    if (a.kind !== 'forest' || G.shootCd > 0 || NW.UI.blocksMovement()) return;
    if (I.count(s.inv, 'ammo') <= 0) { G.sfx('dryfire'); G.msg('Out of rifle rounds.', 'warn'); G.shootCd = 0.4; return; }
    I.remove(s.inv, 'ammo', 1);
    G.shootCd = 1.1;
    const sx = p.x, sy = p.y - 10;
    let dx = tx - sx, dy = ty - sy; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    if (Math.abs(dx) > Math.abs(dy)) p.dir = dx < 0 ? 'left' : 'right'; else p.dir = dy < 0 ? 'up' : 'down';
    G.sfx('gun', { vol: 0.9, wet: 0.8 }); G.shake = 3;
    let ex = sx, ey = sy, hit = null;
    for (let d = 6; d < 240; d += 3) {
      const x = sx + dx * d, y = sy + dy * d;
      ex = x; ey = y;
      for (const an of s.animals.list) { if (an.dead || an.flying) continue; const r = an.type === 'deer' ? 11 : an.type === 'wolf' ? 9 : 6; if (U.dist(x, y, an.x, an.y - (an.type === 'deer' ? 10 : 4)) < r) { hit = an; break; } }
      if (hit) break;
      if (d > 14 && W.blocksShot(a, x, y + 7)) break;
    }
    G.fx.push({ type: 'tracer', x1: sx + dx * 8, y1: sy + dy * 8, x2: ex, y2: ey, life: 0.1 });
    G.fx.push({ type: 'flash', x: sx + dx * 8, y: sy + dy * 8, life: 0.08 });
    NW.Entities.onShot(hit);
  };

  // ================================================================= DEATH
  G.die = function (cause) {
    if (G.dead) return;
    G.dead = true;
    G.hold = null;
    const s = G.state;
    s.player.hp = 0;
    NW.Save.clear(s.slot);
    NW.Hooks.emit('death', cause, s);
    G.sfx('heartbeat'); G.sfx('sting', { vol: 0.6 });
    G.paused = false; NW.UI.closeNames(NW.UI.openNames().filter((n) => n !== 'reveal')); // keep a Mimic's reveal on screen
    setTimeout(() => { if (G.state !== s || G.mode !== 'play') return; NW.UI.closeAll(); G.mode = 'dead'; NW.UI.open('gameover', { cause }); NW.Audio.setMusic('menu'); }, 1400);
    G.fade = 0;
  };

  // ================================================================= INPUT
  G.onKey = function (e, down) {
    const code = e.code;
    // typing in a text box (seed field) never moves the ranger or opens panels
    const tg = e.target;
    if (tg && (tg.tagName === 'TEXTAREA' || (tg.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(tg.type))) && code !== 'Escape') return;
    if (G.mode === 'scene') { if (down && NW.scene && NW.scene.key) { try { NW.scene.key(code, e); } catch (er) { console.error(er); } } e.preventDefault(); return; }
    if (down && NW.UI.handleKey(e)) { e.preventDefault(); return; }
    const K = NW.Keys;
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code) || K.actionFor(code)) e.preventDefault();
    G.keys[code] = down;
    if (!down || G.mode !== 'play' || G.paused || G.dead) return;
    if (e.repeat) return;
    if (/^Digit[1-9]$/.test(code)) G.doAction(+code.slice(5) - 1);
    else if (K.is('interact', code)) { if (G.focus && G.focus.actions.length) G.doAction(0); }
    else if (K.is('shoot', code)) { const m = G.mouseWorld(); G.shoot(m.x, m.y); }
    else if (K.is('eat', code)) G.quickUse('KeyF');
    else if (K.is('heal', code)) G.quickUse('KeyH');
    else NW.Hooks.emit('key', code, K.actionFor(code));
  };
  // F: eat the smallest food that covers your hunger (or the biggest if none does). H: same for medicine; tonic first when cold.
  G.quickUse = function (code) {
    const s = G.state, p = s.player;
    const pickBy = (order, val, need) => {
      const own = order.filter((id) => I.count(s.inv, id) > 0).sort((x, y) => val(x) - val(y));
      if (!own.length) return null;
      return own.find((id) => val(id) >= need) || own[own.length - 1];
    };
    if (code === 'KeyF') {
      const f = pickBy(D.FOOD_ORDER, (id) => D.ITEMS[id].food || 0, 100 - p.hunger);
      if (f) NW.Survival.eat(f); else G.msg('No ready-to-eat food in your pack.', 'warn');
    } else {
      let m = null;
      if (p.temp < 35 && I.count(s.inv, 'tonic') > 0) m = 'tonic';
      else if (p.hp >= 100 && !p.sick) return G.msg('You are not hurt.');
      else m = pickBy(D.MED_ORDER, (id) => D.ITEMS[id].heal || 0, 100 - p.hp);
      if (m) NW.Survival.useMed(m); else G.msg('No medicine in your pack.', 'warn');
    }
  };
  G.mouseWorld = function () {
    const p = G.state.player;
    if (NW.R3 && NW.R3.active && p.fx != null) return { x: p.x + p.fx * 220, y: p.y - 6 + p.fy * 220 };
    if (!G.mouse.moved) return { x: p.x + (p.dir === 'left' ? -100 : p.dir === 'right' ? 100 : 0), y: p.y - 10 + (p.dir === 'up' ? -100 : p.dir === 'down' ? 100 : 0) };
    return { x: G.mouse.x - G.area.ox, y: G.mouse.y - G.area.oy };
  };
})(window.NW);
