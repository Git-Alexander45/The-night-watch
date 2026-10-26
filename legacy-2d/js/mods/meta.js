'use strict';
// Records: run history, best nights per mode, achievements, endings seen and monster knowledge carried between runs.
(function (NW) {
  const U = NW.U, D = NW.D, S = NW.S, H = NW.Hooks, UI = NW.UI;
  const P = S.P, R = S.R;
  const G = () => NW.G;
  const st = () => NW.G && NW.G.state;
  const esc = U.escape;
  const MT = NW.Meta = {};
  const KEY = 'nightwatch.meta', VER = 1, MAX_RUNS = 30;
  const MODES = ['easy', 'standard', 'hard', 'harder', 'custom'];

  // ------------------------------------------------------------ storage
  const blank = () => ({ v: VER, runs: [], best: {}, ach: {}, endings: {}, rules: {}, active: {}, places: {}, tot: {}, opt: { remember: true }, started: 0 });
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);
  // Accept whatever survives of a stored record; anything malformed falls back to defaults.
  function clean(raw) {
    const d = blank(); raw = obj(raw);
    d.runs = (Array.isArray(raw.runs) ? raw.runs : []).filter((r) => r && typeof r === 'object' && typeof r.id === 'string').slice(0, MAX_RUNS);
    for (const k in obj(raw.best)) { const b = obj(raw.best[k]); d.best[k] = { n: num(b.n), done: num(b.done), runs: num(b.runs), seed: typeof b.seed === 'string' ? b.seed : '' }; }
    for (const k in obj(raw.ach)) if (raw.ach[k]) d.ach[k] = obj(raw.ach[k]);
    for (const k in obj(raw.endings)) { const e = obj(raw.endings[k]); d.endings[k] = { title: String(e.title || k), n: num(e.n) || 1, t: num(e.t), mode: String(e.mode || '') }; }
    for (const k in obj(raw.rules)) if (D.BESTIARY[k] && Array.isArray(raw.rules[k])) d.rules[k] = raw.rules[k].filter((i) => Number.isInteger(i) && i >= 0 && i < D.BESTIARY[k].rules.length);
    for (const k in obj(raw.active)) { const a = obj(raw.active[k]); if (typeof a.id === 'string') d.active[k] = a; }
    for (const k in obj(raw.places)) d.places[k] = true;
    for (const k in obj(raw.tot)) d.tot[k] = num(raw.tot[k]);
    d.opt.remember = obj(raw.opt).remember !== false;
    d.started = num(raw.started);
    return d;
  }
  let M = null;
  MT.recovered = false;
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (!raw) return blank();
    try { const p = JSON.parse(raw); if (!p || typeof p !== 'object') throw new Error('bad'); return clean(p); }
    catch (e) { MT.recovered = true; try { localStorage.setItem(KEY + '.bad', raw.slice(0, 200000)); } catch (e2) { /* full */ } return blank(); }
  }
  const data = () => (M || (M = load()));
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data())); return true; } catch (e) { return false; } }
  MT.data = data;
  MT.reload = () => { M = null; return data(); };

  // ----------------------------------------------------------- run state
  const newId = () => Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  const DEF = { id: '', best0: null, earned: [], fish: 0, snares: 0, wolves: 0, ups: 0, orders: 0, mimics: 0, openedMimic: false, ended: false, done: false };
  const mod = () => { const m = NW.mod('meta', () => U.clone(DEF)); if (!m) return null; for (const k in DEF) if (m[k] == null) m[k] = U.clone(DEF[k]); if (!m.id) m.id = newId(); return m; };
  const modeId = (s) => (s.mode && MODES.includes(s.mode.id) ? s.mode.id : 'standard');
  const modeName = (id) => (D.MODES[id] ? D.MODES[id].name : 'Standard');
  const bestOf = (id) => { const b = data().best; return b[id] || (b[id] = { n: 0, done: 0, runs: 0, seed: '' }); };
  function snapshot(s, end) {
    const t = s.stats || {};
    return {
      id: mod().id, slot: s.slot || 1, mode: modeId(s), final: (s.mode && s.mode.nights) || D.FINAL_NIGHT, seed: String(s.seedText || s.seed),
      nights: s.nightsSurvived || 0, day: s.time.day, end, t: Date.now(),
      st: { wood: t.wood || 0, animals: t.animals || 0, helped: t.helped || 0, mimics: t.mimicsRefused || 0, repairs: t.repairs || 0, fish: t.fish || 0 },
    };
  }
  function pushRun(e) { const d = data(); d.runs = d.runs.filter((r) => r.id !== e.id); d.runs.unshift(e); if (d.runs.length > MAX_RUNS) d.runs.length = MAX_RUNS; }
  const findRun = (id) => data().runs.find((r) => r.id === id);
  function track(s) { const m = mod(); if (!m || m.done) return; const a = snapshot(s, 'active'); a.ended = m.ended; data().active[m.id] = a; }
  function noteBest(s) {
    const b = bestOf(modeId(s)), n = s.nightsSurvived || 0;
    if (n > b.n) { b.n = n; b.seed = String(s.seedText || s.seed); }
  }
  const tot = (k, n) => { const t = data().tot; t[k] = (t[k] || 0) + (n == null ? 1 : n); return t[k]; };

  // -------------------------------------------------------- achievements
  // secret: hidden until earned. Hints are shown for locked ones.
  const ACH = [
    ['first_night', 'First Light', 'Survive your first night.'],
    ['three_nights', 'Holding On', 'Survive three nights in one watch.'],
    ['ten_nights', 'Long After', 'Survive ten nights in one watch.'],
    ['full_watch', 'Relieved', 'Keep a watch to its last night.'],
    ['done_easy', 'Gentle Winter', 'Complete a watch on Easy.'],
    ['done_standard', 'As It Was Meant', 'Complete a watch on Standard.'],
    ['done_hard', 'Fourteen Nights', 'Complete a watch on Hard.'],
    ['done_harder', 'Twenty-Five Nights', 'Complete a watch on Harder.', true],
    ['done_custom', 'Your Own Rules', 'Complete a watch on Custom.'],
    ['mimic_out', 'Not Today', 'Turn away a Mimic.'],
    ['mimic_5', 'Wrong Breath', 'Turn away five Mimics (all watches).'],
    ['shelter', 'Open Door', 'Shelter someone from the cold.'],
    ['shelter_3', 'Waystation', 'Shelter three people in one watch.'],
    ['shut_tight', 'Bolt Stays Shut', 'Finish a watch where Mimics knocked and you never let one in.'],
    ['wolf', 'Wolf Winter', 'Kill a wolf.'],
    ['fish', 'First Bite', 'Catch a fish through the ice.'],
    ['fish_10', 'Ice Fisher', 'Catch ten fish (all watches).'],
    ['snare', 'Patience of Wire', 'Take an animal in a snare.'],
    ['upgrade', 'Handy', 'Build a cabin upgrade.'],
    ['upgrade_4', 'Fortified', 'Build four upgrades in one watch.'],
    ['order', 'By the Book', 'Carry out an HQ order.'],
    ['order_5', "Base's Favourite", 'Carry out five HQ orders in one watch.'],
    ['places', 'Old Places', 'Go inside the fire tower, the trapper\'s shack and the mine.'],
    ['saved', 'Brought Them Home', 'See someone from the forest reach safety.'],
    ['finale', 'The Long Night', 'Face the last night of a watch with endings.'],
    ['end_keeper', 'Keeper of the Watch', 'Reach the best ending.', true],
    ['end_first_light', 'Relief at First Light', 'Reach a good ending.'],
    ['end_open_door', 'The Open Door', 'Open the door to everyone who knocks.'],
    ['end_long_way', 'The Long Way Down', 'End a watch with mixed choices.'],
    ['end_closed_door', 'The Closed Door', 'Keep everyone out.', true],
    ['end_hollow', 'What Walked Out With You', 'Something else ends the watch.', true],
  ].map(([id, name, desc, secret]) => ({ id, name, desc, secret: !!secret }));
  const ACHMAP = {}; ACH.forEach((a) => { ACHMAP[a.id] = a; });
  MT.ACH = ACH;
  MT.has = (id) => !!data().ach[id];
  function unlock(id) {
    const a = ACHMAP[id], d = data();
    if (!a || d.ach[id]) return false;
    const s = st();
    d.ach[id] = { t: Date.now(), mode: s && s.mode ? modeId(s) : '', seed: s ? String(s.seedText || s.seed) : '' };
    save();
    const m = s && mod(); if (m && !m.earned.includes(id)) m.earned.push(id);
    toast(a);
    return true;
  }
  MT.unlock = unlock;

  // ---------------------------------------------------------------- endings
  const ENDINGS = [
    ['keeper', 'Keeper of the Watch', 'Every door right.'], ['first_light', 'Relief at First Light', 'Help most who knock. Let nothing in.'],
    ['open_door', 'The Open Door', 'Kindness, and a price.'], ['long_way', 'The Long Way Down', 'Some nights right, some not.'],
    ['closed_door', 'The Closed Door', 'Nothing gets in. No one.'], ['hollow', 'What Walked Out With You', 'Too many doors opened.'],
    ['road', 'The Road Is Gone', 'Finish a watch on Easy.'],
  ];

  // ----------------------------------------------------------------- toasts
  UI.addStyle(
    '.mt-toasts{position:absolute;left:50%;top:2.2%;transform:translateX(-50%);z-index:60;pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:0.3em;width:38%}' +
    '.mt-toast{display:flex;align-items:center;gap:0.55em;width:100%;padding:0.3em 0.7em 0.35em 0.4em;background:linear-gradient(180deg,#2c1f14,#15110d);border:2px solid #8f5731;box-shadow:0 0 0 2px #000,inset 0 0 0 1px #4a3020,0 6px 18px rgba(0,0,0,0.7);animation:mt-in 4.6s forwards}' +
    '.mt-toast img{width:2.2em;height:2.2em;image-rendering:pixelated;flex:none}.mt-tl{color:#f2b84b;font-size:0.6em;letter-spacing:0.2em}.mt-tn{color:#f3e3c0;font-size:1em;line-height:1}.mt-td{color:#9c8f7a;font-size:0.68em;line-height:1.05}' +
    '@keyframes mt-in{0%{transform:translateY(-120%);opacity:0}6%{transform:translateY(8%);opacity:1}9%{transform:none}86%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-40%)}}' +
    '.mt-body{width:34em;max-width:100%;height:15em}.panel-records .tab.on{background:#3a2818;color:#f3e3c0;border-color:#8f5731}.panel-records .tabs{border-bottom:1px solid #8f5731}.mt-body .tbl{font-size:0.86em}.mt-body .tbl td,.mt-body .tbl th{white-space:nowrap}.mt-body .tbl td.mt-wrap{white-space:normal}' +
    '.mt-k{color:#f2b84b}.mt-dim{color:#7f7464}.mt-good{color:#8fbf6a}.mt-bad{color:#d8664a}.mt-sub{font-size:0.78em;color:#9c8f7a}' +
    '.mt-sum{display:flex;gap:1.2em;justify-content:center;margin:0.1em 0 0.5em;font-size:0.85em;color:#9c8f7a}.mt-sum b{color:#f3e3c0;font-weight:400}' +
    '.mt-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.3em}.mt-ach{display:flex;gap:0.45em;align-items:center;padding:0.2em 0.35em;border:1px solid #3a2a1a;background:rgba(0,0,0,0.25)}' +
    '.mt-ach img{width:1.7em;height:1.7em;image-rendering:pixelated;flex:none}.mt-ach .mt-an{color:#f3e3c0;line-height:1}.mt-ach .mt-ad{font-size:0.72em;color:#9c8f7a;line-height:1.05}' +
    '.mt-ach.off{opacity:0.62}.mt-ach.off .mt-an{color:#9c8f7a}.mt-ach.on{border-color:#6a4a26;background:rgba(242,184,75,0.07)}' +
    '.mt-end{display:flex;gap:0.6em;align-items:baseline;padding:0.25em 0.4em;border-bottom:1px dotted rgba(120,80,40,0.35)}.mt-end .mt-et{color:#f3e3c0;min-width:11em}.mt-end.off .mt-et{color:#6a6050;letter-spacing:0.2em}' +
    '.mt-ok{color:#8fbf6a;font-size:0.9em}.mt-nw{white-space:nowrap}'
  );
  let toastBox = null, toastQ = [], toastT = 0, lastSnd = 0;
  function toast(a) { toastQ.push(a); pumpToasts(); }
  function pumpToasts() {
    if (toastT || !toastQ.length) return;
    const fr = document.getElementById('frame'); if (!fr) { toastQ.length = 0; return; }
    if (!toastBox || !toastBox.parentNode) { toastBox = document.createElement('div'); toastBox.className = 'mt-toasts'; fr.appendChild(toastBox); }
    const a = toastQ.shift();
    const el = document.createElement('div');
    el.className = 'mt-toast';
    el.innerHTML = (S.icons.mt_badge ? '<img src="' + S.icons.mt_badge + '" alt="">' : '') + '<div><div class="mt-tl">ACHIEVEMENT</div><div class="mt-tn">' + esc(a.name) + '</div><div class="mt-td">' + esc(a.desc) + '</div></div>';
    toastBox.appendChild(el);
    while (toastBox.children.length > 3) toastBox.firstChild.remove();
    setTimeout(() => el.remove(), 4700);
    const now = Date.now(); if (now - lastSnd > 400) { lastSnd = now; G().sfx('achievement', { vol: 0.8 }); }
    toastT = setTimeout(() => { toastT = 0; pumpToasts(); }, 900);
  }

  // ------------------------------------------------------------------ icons
  S.registerIcon('mt_badge', (g) => {
    R(g, P.r1, 4, 0, 3, 6); R(g, P.r2, 5, 0, 1, 5); R(g, P.b1, 9, 0, 3, 6); R(g, P.b2, 10, 0, 1, 5);
    R(g, P.y0, 4, 5, 8, 10); R(g, P.y0, 3, 6, 10, 8); R(g, P.y1, 4, 6, 8, 8); R(g, P.y1, 5, 5, 6, 10);
    R(g, P.y2, 5, 6, 2, 2); R(g, P.y2, 4, 8, 1, 2);
    R(g, P.y0, 7, 7, 2, 1); R(g, P.y0, 6, 8, 4, 2); R(g, P.y0, 7, 10, 2, 2); R(g, P.f3, 7, 8, 2, 2);
  });
  S.registerIcon('mt_lock', (g) => {
    R(g, P.i2, 5, 2, 6, 2); R(g, P.i2, 4, 3, 2, 5); R(g, P.i2, 10, 3, 2, 5); R(g, P.i3, 5, 2, 6, 1);
    R(g, P.i1, 3, 7, 10, 8); R(g, P.i2, 4, 8, 8, 6); R(g, P.i3, 4, 8, 8, 1); R(g, P.ink, 7, 10, 2, 2); R(g, P.ink, 7, 12, 2, 1);
  });
  S.registerIcon('mt_record', (g) => {
    R(g, P.wood1, 3, 1, 10, 14); R(g, P.bone, 4, 2, 8, 12); R(g, P.wood2, 3, 1, 10, 2); R(g, P.y1, 7, 1, 2, 1);
    for (let i = 0; i < 4; i++) R(g, P.pale0, 5, 5 + i * 2, i === 3 ? 4 : 6, 1);
    R(g, P.r2, 9, 11, 2, 2);
  });

  // ------------------------------------------------------------ run events
  H.on('newGame', (s) => {
    const d = data();
    // a run left in this slot was abandoned
    for (const k in d.active) {
      const a = d.active[k];
      if (a.slot !== (s.slot || 1)) continue;
      delete d.active[k];
      if (a.ended || findRun(a.id)) continue;
      if ((a.day || 1) >= 2 || (a.nights || 0) >= 1) { a.end = 'abandoned'; a.t = Date.now(); pushRun(a); }
    }
    const m = mod(); const id = modeId(s);
    m.best0 = bestOf(id).n;
    bestOf(id).runs++;
    d.started++;
    // monster knowledge from earlier watches
    if (d.opt.remember) {
      let n = 0;
      for (const k in d.rules) {
        if (!D.BESTIARY[k] || !d.rules[k].length) continue;
        const arr = s.journal.rules[k] || (s.journal.rules[k] = []);
        d.rules[k].forEach((i) => { if (!arr.includes(i)) { arr.push(i); n++; } });
      }
      if (n) NW.Events.journal('I have kept watch before. What I learned on other winters is still in the back of this journal (What I know). The forest has not forgotten me either.', 'notes');
    }
    track(s);
    save();
  });
  H.on('start', (s) => {
    const m = mod(); if (!m) return;
    if (m.best0 == null) m.best0 = bestOf(modeId(s)).n;
    track(s); save(); // older saves and loaded runs are tracked from here
  });
  H.on('dawn', () => {
    const s = st(), m = mod(); if (!m) return;
    const n = s.nightsSurvived || 0;
    if (n >= 1) unlock('first_night');
    if (n >= 3) unlock('three_nights');
    if (n >= 10) unlock('ten_nights');
    noteBest(s);
    if (m.ended) { const r = findRun(m.id); if (r) { r.nights = Math.max(r.nights, n); r.day = s.time.day; } }
    track(s); save();
  });
  H.on('endingShown', (en, night) => {
    const s = st(), m = mod(), d = data(); if (!m) return;
    const id = (en && en.id) || 'road', title = (en && en.title) || 'The Road Is Gone';
    const mid = modeId(s);
    const e = d.endings[id] || (d.endings[id] = { title, n: 0, t: Date.now(), mode: mid });
    e.n++; e.title = title;
    noteBest(s);
    bestOf(mid).done++;
    const r = snapshot(s, 'ending'); r.ending = id; r.endingTitle = title; r.nights = Math.max(r.nights, night || 0);
    pushRun(r);
    m.ended = true;
    track(s); save();
    unlock('full_watch'); unlock('done_' + mid);
    if (m.mimics > 0 && !m.openedMimic) unlock('shut_tight');
    if (en && ACHMAP['end_' + id]) unlock('end_' + id);
  });
  H.on('death', (cause, s) => {
    const m = mod(); if (!m || m.done) return;
    const info = D.DEATH[cause] || D.DEATH.unknown;
    noteBest(s);
    if (m.ended) { const r = findRun(m.id); if (r) { r.nights = Math.max(r.nights, s.nightsSurvived || 0); r.after = info.title; r.day = s.time.day; } }
    else { const r = snapshot(s, 'death'); r.cause = cause; r.causeTitle = info.title; pushRun(r); }
    tot('deaths');
    delete data().active[m.id];
    m.done = true;
    save();
  });
  H.on('ruleUnlocked', (mon, idx) => {
    const d = data(); if (!D.BESTIARY[mon] || !Number.isInteger(idx)) return;
    const arr = d.rules[mon] || (d.rules[mon] = []);
    if (!arr.includes(idx)) { arr.push(idx); save(); }
  });
  H.on('visitorArrive', (v) => { const m = mod(); if (m && v && v.mimic) m.mimics++; });
  H.on('visitorOpened', (v) => {
    const m = mod(), s = st(); if (!m || !v) return;
    if (v.mimic) { m.openedMimic = true; return; }
    unlock('shelter');
    if ((s.stats.helped || 0) >= 3) unlock('shelter_3');
  });
  H.on('visitorResolved', (v) => {
    if (!v || !v.mimic || v.outcome === 'opened') return;
    unlock('mimic_out');
    if (tot('mimics') >= 5) unlock('mimic_5'); else save();
  });
  H.on('stat', (k) => {
    if (k !== 'animals') return;
    const s = st(), m = mod(); if (!m) return;
    s.animals.list.forEach((an) => { if (an.type === 'wolf' && an.dead && !an.mtc) { an.mtc = 1; m.wolves++; unlock('wolf'); } });
  });
  H.on('fishCaught', () => { const m = mod(); if (m) m.fish++; unlock('fish'); if (tot('fish') >= 10) unlock('fish_10'); else save(); });
  H.on('snareCatch', () => { unlock('snare'); tot('snares'); save(); });
  H.on('upgradeBuilt', () => { const m = mod(); if (!m) return; m.ups++; unlock('upgrade'); if (m.ups >= 4) unlock('upgrade_4'); });
  H.on('missionDone', () => { const m = mod(); if (!m) return; m.orders++; unlock('order'); if (m.orders >= 5) unlock('order_5'); });
  H.on('placeEntered', (id) => {
    const d = data(); if (!id) return;
    d.places[id] = true; save();
    const ids = NW.Places && NW.Places.ids ? NW.Places.ids : { tower: 'in_tower', shack: 'in_shack', mine: 'in_mine' };
    if (['tower', 'shack', 'mine'].every((k) => d.places[ids[k]])) unlock('places');
  });
  H.on('characterFate', (id, fate) => { if (fate === 'safe') unlock('saved'); });
  H.on('finaleStart', () => unlock('finale'));

  // --------------------------------------------------------- game over
  H.on('gameoverLines', (s) => {
    const m = mod(); if (!m) return;
    const out = [], n = s.nightsSurvived || 0;
    if (n > 0 && m.best0 != null && n > m.best0) out.push('<span class="mt-k">New personal best:</span> ' + n + ' night' + (n === 1 ? '' : 's') + ' on ' + esc(modeName(modeId(s))) + (m.best0 ? ' (was ' + m.best0 + ')' : '') + '.');
    if (m.earned.length) out.push('<span class="mt-k">Achievements this watch:</span> ' + m.earned.map((id) => ACHMAP[id] ? esc(ACHMAP[id].name) : '').filter(Boolean).join(' · '));
    return out;
  });

  // ------------------------------------------------------------- settings
  UI.registerSettings(() => '<h3>Records</h3><label class="srow"><span>Remember monster knowledge between runs</span><input type="checkbox" id="mt-remember"' + (data().opt.remember ? ' checked' : '') + '></label>' +
    '<div class="hint">New watches start with the bestiary rules you learned before.</div><button id="mt-wipe" class="small danger">Erase records</button>', (box) => {
    const cb = box.querySelector('#mt-remember'); if (cb) cb.onchange = () => { data().opt.remember = cb.checked; save(); };
    const w = box.querySelector('#mt-wipe'); if (w) w.onclick = () => UI.confirm('Erase all records, achievements and remembered monster knowledge? Saved runs are kept.', () => { const o = data().opt; M = blank(); M.opt = o; save(); UI.refresh('settings'); });
  });

  // -------------------------------------------------------------- records
  let tab = 'best';
  const when = (t) => { if (!t) return '—'; const d = new Date(t); return isNaN(d) ? '—' : d.getDate() + ' ' + MON[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2); };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function bestHTML(d) {
    const nights = d.runs.reduce((a, r) => a + (r.nights || 0), 0);
    const rows = MODES.map((id) => {
      const b = d.best[id] || { n: 0, done: 0, runs: 0, seed: '' }, need = id === 'custom' ? null : D.MODES[id].nights;
      return '<tr><td class="mt-k">' + esc(modeName(id)) + '</td><td>' + (b.n ? '<b>' + b.n + '</b>' + (need ? ' <span class="mt-dim">/ ' + need + '</span>' : '') : '<span class="mt-dim">—</span>') + '</td><td>' + (b.done ? '<span class="mt-good">' + b.done + '×</span>' : '<span class="mt-dim">0</span>') + '</td><td>' + (b.runs || 0) + '</td><td class="mt-dim">' + esc(b.seed || '') + '</td></tr>';
    }).join('');
    return '<div class="mt-sum"><span>Watches begun <b>' + d.started + '</b></span><span>Nights kept <b>' + nights + '</b></span><span>Deaths <b>' + (d.tot.deaths || 0) + '</b></span></div>' +
      '<table class="tbl"><tr><th>Mode</th><th>Best nights</th><th>Completed</th><th>Runs</th><th>Seed</th></tr>' + rows + '</table>' +
      '<div class="hint">Best nights count every dawn you saw, endless nights included.</div>';
  }
  function outcome(r) {
    if (r.end === 'death') return '<span class="mt-bad">' + esc(r.causeTitle || 'Died') + '</span>';
    if (r.end === 'ending') return '<span class="mt-good">' + esc(r.endingTitle || 'Relieved') + '</span>' + (r.after ? ' <span class="mt-dim">then ' + esc(r.after) + '</span>' : '');
    return '<span class="mt-dim">Abandoned</span>';
  }
  function historyHTML(d) {
    if (!d.runs.length) return '<div class="hint">No watches recorded yet. Finished, lost and abandoned runs appear here.</div>';
    return '<table class="tbl"><tr><th>Date</th><th>Mode</th><th>Seed</th><th>Nights</th><th>How it ended</th></tr>' + d.runs.map((r) => {
      const t = r.st || {};
      return '<tr title="Wood ' + (t.wood || 0) + ' · sheltered ' + (t.helped || 0) + ' · Mimics turned away ' + (t.mimics || 0) + ' · repairs ' + (t.repairs || 0) + '"><td class="mt-dim">' + when(r.t) + '</td><td>' + esc(modeName(r.mode)) + '</td><td class="mt-k">' + esc(String(r.seed || '?')) + '</td><td>' + (r.nights || 0) + '<span class="mt-dim">/' + (r.final || '?') + '</span></td><td class="mt-wrap">' + outcome(r) +
        '<div class="mt-sub">wood ' + (t.wood || 0) + ' · sheltered ' + (t.helped || 0) + ' · mimics out ' + (t.mimics || 0) + (t.fish ? ' · fish ' + t.fish : '') + '</div></td></tr>';
    }).join('') + '</table>';
  }
  function achHTML(d) {
    const got = ACH.filter((a) => d.ach[a.id]).length, hidden = ACH.filter((a) => a.secret && !d.ach[a.id]);
    const card = (a) => { const on = !!d.ach[a.id]; return '<div class="mt-ach ' + (on ? 'on' : 'off') + '" data-ach="' + a.id + '">' + UI.h.icon(on ? 'mt_badge' : 'mt_lock').replace('class="ic"', '') + '<div><div class="mt-an">' + esc(a.name) + '</div><div class="mt-ad">' + esc(a.desc) + (on ? ' <span class="mt-nw">· ' + when(d.ach[a.id].t) + '</span>' : '') + '</div></div></div>'; };
    return '<div class="mt-sum"><span>Unlocked <b>' + got + ' / ' + ACH.length + '</b></span>' + (hidden.length ? '<span>Secret <b>' + hidden.length + '</b> still hidden</span>' : '') + '</div>' +
      '<div class="mt-grid">' + ACH.filter((a) => d.ach[a.id] || !a.secret).sort((a, b) => !!d.ach[b.id] - !!d.ach[a.id]).map(card).join('') + '</div>';
  }
  function endingsHTML(d) {
    const known = ENDINGS.map((e) => e[0]), extra = Object.keys(d.endings).filter((k) => !known.includes(k));
    const seen = Object.keys(d.endings).length;
    return '<div class="mt-sum"><span>Endings seen <b>' + seen + ' / ' + (ENDINGS.length + extra.length) + '</b></span></div>' +
      ENDINGS.concat(extra.map((k) => [k, d.endings[k].title, ''])).map(([id, title, hint]) => {
        const e = d.endings[id];
        return e ? '<div class="mt-end"><span class="mt-et">' + esc(e.title || title) + '</span><span class="mt-ok">seen ' + e.n + '×</span><span class="mt-dim">first ' + when(e.t) + ' · ' + esc(modeName(e.mode)) + '</span></div>'
          : '<div class="mt-end off"><span class="mt-et">? ? ?</span><span class="mt-dim">' + esc(hint) + '</span></div>';
      }).join('') + '<div class="hint">Endings belong to Standard, Hard, Harder and Custom. Easy always ends on the road.</div>';
  }
  UI.registerPanel('records', (box) => {
    const d = data();
    const tabs = [['best', 'Best nights'], ['history', 'Run history'], ['ach', 'Achievements'], ['endings', 'Endings seen']];
    const body = tab === 'history' ? historyHTML(d) : tab === 'ach' ? achHTML(d) : tab === 'endings' ? endingsHTML(d) : bestHTML(d);
    box.innerHTML = UI.h.head('Records', 'Every watch you kept') + '<div class="tabs">' + tabs.map(([k, l]) => '<div class="tab' + (k === tab ? ' on' : '') + '" data-tab="' + k + '">' + l + '</div>').join('') + '</div>' +
      '<div class="pbody mt-body">' + (MT.recovered ? '<div class="hint mt-bad">The old records were damaged and could not be read. A fresh record book was started.</div>' : '') + body + '</div><div class="pfoot"><button data-close>Back</button></div>';
    UI.h.bindClose(box, 'records');
    box.querySelectorAll('.tab').forEach((t) => { t.onclick = () => { tab = t.dataset.tab; UI.refresh('records'); }; });
  });
  MT.open = (t) => { if (t) tab = t; UI.open('records'); };
  UI.registerMenuButton('records', 'Records', () => MT.open(), 40);
})(window.NW);
