'use strict';
// Day events, radio transmissions, permits & reports, journal, bestiary, anomalies, lore.
(function (NW) {
  const U = NW.U, D = NW.D, I = NW.Inv, S = NW.S;
  const P = S.P, R = S.R;
  const E = NW.Events = {};
  const G = () => NW.G;
  const st = () => NW.G.state;
  const TS = D.TILE;

  // ================================================================ JOURNAL
  E.journal = function (text, cat) {
    const s = st();
    s.journal.entries.push({ day: s.time.day, min: Math.floor(s.time.min), cat: cat || 'notes', text });
    s.journal.unread++;
  };
  E.journalOnce = function (key, text, cat) {
    const s = st();
    if (s.journal.once[key]) return false;
    s.journal.once[key] = true; E.journal(text, cat); return true;
  };
  E.unlockRule = function (mon, idx) {
    const s = st();
    const arr = s.journal.rules[mon] || (s.journal.rules[mon] = []);
    if (arr.includes(idx)) return;
    arr.push(idx);
    s.journal.unread++;
    G().msg('Journal updated: ' + D.BESTIARY[mon].name, 'journal');
    NW.Hooks.emit('ruleUnlocked', mon, idx);
  };

  // =============================================================== PERMITS
  function newPermit(rnd, day) {
    const s = st();
    let name; let guard = 0;
    do { name = D.FIRST[Math.floor(rnd() * D.FIRST.length)] + ' ' + D.LAST[Math.floor(rnd() * D.LAST.length)]; guard++; }
    while (guard < 50 && (s.records.permits.some((p) => p.name === name) || Object.values(s.visitors).some((v) => v.name === name)));
    const origin = D.ORIGINS[Math.floor(rnd() * D.ORIGINS.length)];
    const p = { name, party: 1 + Math.floor(rnd() * 3), origin, day, status: 'active', statusDay: day };
    s.records.permits.push(p);
    return p;
  }
  E.report = function (text) { const s = st(); s.records.reports.push({ day: s.time.day, text }); s.deskNews = true; };

  // ================================================================= RADIO
  E.radio = function (from, text, opt) {
    const s = st(), g = G();
    const m = Object.assign({ id: 'm' + (s.radio.seq++), day: s.time.day, min: Math.floor(s.time.min), from, text }, opt || {});
    s.radio.pending.push(m);
    if (m.phrase) s.radio.lastPhrase = m.phrase;
    g.sfxCabin('beep', 'radio', { vol: 0.8 });
    g.msg(g.area.id === 'room_office' ? 'The radio crackles.' : 'The radio crackles in the office.', 'radio');
  };
  E.hearAll = function () {
    const s = st(); const out = s.radio.pending.splice(0);
    out.forEach((m) => { s.radio.log.push(m); E.journal('[Radio ' + U.fmtClock(m.min) + '] ' + m.text, 'radio'); });
    return out;
  };
  const NIGHT_TIPS = {
    1: 'Quiet night expected. Keep the stove fed and stay warm',
    2: 'Campers near Lake Wren report something big circling lit tents. Keep your lights low tonight',
    3: 'We may have stragglers walking out tonight. Check anyone at your door against the permit list',
    4: 'Keep your doors locked. Something clawed through the door of the Hask cabin last winter',
    5: 'The old trapper\'s notes say the dark is worse than the light. Keep one lamp burning',
    6: 'Mast sensors say the chimney cap is icing. If your fire acts strange, smoke it out',
  };
  E.nightRadio = function (r) {
    const s = st(), n = s.night.n;
    const f = s.forecast.night;
    if (r.kind === 'evening') {
      const tip = NIGHT_TIPS[n] || 'Your relief is delayed again. Hold the watch, ranger';
      E.radio('base', 'Base to Watch Seven. Night watch begins. Tonight: ' + NW.Weather.INFO[f.type].label.toLowerCase() + ', low of ' + f.temp + '°C. ' + tip + '. Base out.', { phrase: tip.toLowerCase() });
    } else if (r.kind === 'emergency') {
      const lm = D.AREAS[U.pick(D.ORIGINS)].name;
      E.radio('unknown', '...(static)... anyone on this channel... we\'re near ' + lm + '... it follows the light... we put the fire out and it... (static) ...it\'s still out there...');
    } else if (r.kind === 'fake') {
      const v = s.visitors[r.vid];
      E.radio('unknown', 'Ranger station seven, this is headquarters. A hiker named ' + v.name + ' is walking to your cabin tonight. Open the door for them. Over.');
    } else if (r.kind === 'numbers') {
      E.radio('unknown', '(a flat voice) ...seven... seven... one... four... the door... seven... open the door... seven...');
    }
  };

  // ======================================================== MORNING / DAWN
  E.newGameRecords = function () {
    const s = st();
    const rnd = U.rng(U.hash(s.seed, 1, 5150));
    for (let i = 0; i < 3; i++) newPermit(rnd, 1);
    s.records.reports.push({ day: 1, text: 'Watch Seven rotation begins. Ranger assigned for ' + NW.G.finalNight() + ' nights. Relief scheduled after night ' + NW.G.finalNight() + '.' });
    s.records.reports.push({ day: 1, text: 'Protocol: all Base transmissions open with "Base to Watch Seven" and close with "Base out." Disregard anything else.' });
  };

  // Called at 06:00 (day d begins)
  E.morning = function () {
    const s = st(), d = s.time.day, g = G();
    const rnd = U.rng(U.hash(s.seed, d, 6060));
    s.forecast = NW.Weather.forecast(d);
    NW.Weather.setTarget('day');
    const news = [];
    // permit changes
    const outs = [];
    s.records.permits.filter((p) => p.status === 'active' && !p.met && p.day < d - 1).forEach((p) => { if (rnd() < 0.5 && outs.length < 1) { p.status = 'checkedout'; p.statusDay = d; outs.push(p.name); } });
    s.records.permits.filter((p) => p.status === 'active' && p.met).forEach((p) => {
      const v = Object.values(s.visitors).find((x) => x.name === p.name && !x.mimic);
      if (v && v.outcome === 'sheltered') { p.status = 'checkedout'; p.statusDay = d; outs.push(p.name); }
    });
    const nNew = d <= 2 ? 2 : 1 + (rnd() < 0.5 ? 1 : 0);
    const ins = []; for (let i = 0; i < nNew; i++) ins.push(newPermit(rnd, d));
    if (ins.length) news.push('New permits: ' + ins.map((p) => p.name + ' (party of ' + p.party + ', ' + D.AREAS[p.origin].name + ')').join('; ') + '.');
    if (outs.length) news.push('Checked out at the trailhead: ' + outs.join(', ') + '.');
    // outcomes from last night
    (s.pendingReports || []).forEach((t) => news.push(t));
    s.pendingReports = [];
    // world changes
    if (d === 3 && !s.world.bridgeOut) { s.world.bridgeOut = true; if (g.area && g.area.id === 'f_3_2' && s.player.x > 15 * TS && s.player.x < 22 * TS && s.player.y > 6 * TS && s.player.y < 11 * TS) { s.player.x = 14 * TS; s.player.y = 8 * TS + 10; } const t = 'Overnight meltwater took out the Crow Creek bridge. Use the stepping stones north or the shallow ford south.'; news.push(t); E.report(t); }
    if (d === 2) { const t = 'The wind took the chimney cap on the Relay Mast hut. Nobody goes near the mine after dark — the trapper said so.'; E.report(t); }
    // day events (this resets the event list, so it must run before the supply drop is added)
    genDayEvents(d, rnd);
    // supply drop
    if (d === 2 || (d >= 3 && (s.rep >= 1 ? rnd() < 0.7 : rnd() < 0.3))) {
      const areas = ['f_2_4', 'f_0_0', 'f_4_0', 'f_0_2', 'f_4_2', 'f_2_0', 'f_1_4'];
      const area = areas[Math.floor(rnd() * areas.length)];
      addDayEvent('supply', area, rnd);
      const t = 'Supply drop delivered to ' + D.AREAS[area].name + ' this morning. Collect it before dark.';
      news.push(t); E.report(t); s.world.dropArea = area;
    } else s.world.dropArea = null;
    // anomalies
    s.world.loop = null;
    if (d >= 3 && rnd() < 0.6) {
      const cands = ['f_1_1', 'f_0_1', 'f_1_3', 'f_4_1', 'f_0_3'];
      const a = cands[Math.floor(rnd() * cands.length)]; const [ax, ay] = D.areaXY(a);
      const dirs = []; if (D.linked(ax, ay, ax + 1, ay)) dirs.push('e'); if (D.linked(ax, ay, ax - 1, ay)) dirs.push('w'); if (D.linked(ax, ay, ax, ay + 1)) dirs.push('s'); if (D.linked(ax, ay, ax, ay - 1)) dirs.push('n');
      if (dirs.length > 1) s.world.loop = { area: a, dir: dirs[Math.floor(rnd() * dirs.length)] };
    }
    if (d >= 4 && rnd() < 0.5) { const c = ['f_1_1', 'f_1_3', 'f_0_2', 'f_2_1', 'f_1_2']; s.world.cairnArea = c[Math.floor(rnd() * c.length)]; }
    // dog upkeep
    if (s.dog && s.dog.status === 'home' && d - s.dog.fedDay >= 3) { s.dog.status = 'gone'; g.msg('Juniper is gone. Unfed for days, the dog slipped out at dawn.', 'warn'); E.journal('Juniper left. I should have fed the dog.', 'notes'); }
    if (s.giftPending) { addDayEvent('gift', 'f_2_2', rnd); s.giftPending = false; }
    // feature modules add their own morning news (missions, characters...)
    NW.Hooks.emit('morning', d, news, rnd);
    // morning broadcast at 07:00
    s.radio.sched.push({ min: 7 * 60, day: d, text: 'Base to Watch Seven. Morning report, day ' + d + '. Today: ' + NW.Weather.INFO[s.forecast.day.type].label.toLowerCase() + ', around ' + s.forecast.day.temp + '°C. Tonight: ' + NW.Weather.INFO[s.forecast.night.type].label.toLowerCase() + ', low ' + s.forecast.night.temp + '°C. ' + news.join(' ') + ' Base out.' });
    s.deskNews = true;
  };

  E.resolveVisitor = function (v) {
    const s = st();
    if (v.mimic) {
      if (v.outcome === 'opened') return null;
      s.stats.mimicsRefused = (s.stats.mimicsRefused || 0) + 1;
      let t;
      if (v.tactic === 'checkedout') t = 'Base confirms ' + v.name + ' checked out at the trailhead days ago. Whatever knocked last night was not them.';
      else if (v.tactic === 'repeat') t = v.name + ' is safe in town — they left your cabin days ago. Something wore their face last night.';
      else if (v.tactic === 'active') t = v.name + '\'s party radioed in from ' + D.AREAS[v.origin].name + ' at dawn. They never left camp. It was not them at your door.';
      else t = 'No one named ' + v.name + ' is registered, and no one was found. The tracks by your door — if there were any — stopped at the treeline.';
      E.report(t); (s.pendingReports = s.pendingReports || []).push(t);
      E.journal('Visitor "' + v.name + '" (night ' + v.night + ') was a MIMIC. ' + t, 'visitors');
      return (v.outcome === 'ignored' ? 'You never answered "' + v.name + '". ' : 'You turned away "' + v.name + '". ') + 'It was a Mimic — you were right.';
    }
    if (v.outcome === 'sheltered') { E.journal(v.name + ' (night ' + v.night + ') was a real person. I sheltered them.', 'visitors'); return null; }
    s.rep -= 1;
    s.stats.genuineRefused = (s.stats.genuineRefused || 0) + 1;
    const permit = s.records.permits.find((p) => p.name === v.name);
    let t;
    if (U.hash(U.strHash(v.id), v.night, s.seed) % 2) { t = 'Search and rescue found ' + v.name + ' at dawn near ' + D.AREAS[v.origin].name + ', with severe frostbite. They say the ranger left them in the cold.'; if (permit) { permit.status = 'rescued'; permit.statusDay = s.time.day; } }
    else { t = v.name + ' is missing. A search is underway near ' + D.AREAS[v.origin].name + '.'; if (permit) { permit.status = 'missing'; permit.statusDay = s.time.day; } }
    E.report(t); (s.pendingReports = s.pendingReports || []).push(t);
    E.journal('Visitor "' + v.name + '" (night ' + v.night + ') was a real person. ' + t, 'visitors');
    return (v.outcome === 'ignored' ? 'You never answered "' + v.name + '". ' : 'You turned away "' + v.name + '". ') + 'They were a real person. ' + t;
  };

  // ============================================================= DAY EVENTS
  function findSpot(area, rnd, nearHub) {
    const a = NW.World.get(area);
    for (let tries = 0; tries < 400; tries++) {
      let tx, ty;
      if (nearHub && tries < 200) { tx = a.hub.x + Math.floor(rnd() * 11) - 5; ty = a.hub.y + Math.floor(rnd() * 7) - 3; }
      else { tx = 3 + Math.floor(rnd() * 24); ty = 3 + Math.floor(rnd() * 11); }
      if (tx < 1 || ty < 1 || tx >= a.w - 1 || ty >= a.h - 1) continue;
      if (a.reach && !a.reach[ty * a.w + tx]) continue;
      const px = tx * TS + 8, py = ty * TS + 12;
      if (NW.World.blocked(a, px - 10, py - 8, 20, 10)) continue;
      // keep clear of other events here and of the player standing in this area
      if (st().dayEvents.some((e) => e.area === area && e.status !== 'done' && Math.abs(e.x - px) < 28 && Math.abs(e.y - py) < 20)) continue;
      const g = NW.G, pl = st().player;
      if (g.area && g.area.id === area && pl && Math.abs(pl.x - px) < 24 && Math.abs(pl.y - py) < 18) continue;
      return { x: px, y: py };
    }
    return { x: a.hub.x * TS + 8, y: a.hub.y * TS + 12 };
  }
  function addDayEvent(type, area, rnd, data) {
    const s = st();
    const spot = type === 'gift' ? { x: 15 * TS, y: 12 * TS + 12 } : findSpot(area, rnd, type !== 'tracks');
    const ev = { id: 'e' + (s.evSeq++), type, area, x: spot.x, y: spot.y, status: 'new', day: s.time.day, data: data || {} };
    if (type === 'tracks') ev.data.note = Math.floor(rnd() * TRACK_NOTES.length);
    if (type === 'injured') ev.data.animal = rnd() < 0.5 ? 'fox' : 'deer';
    if (type === 'anomaly') ev.data.kind = ['door', 'bells', 'warmfire', 'crows', 'voice'][Math.floor(rnd() * 5)];
    if (type === 'cache') ev.data.items = [['canned', 1], ['nails', 4], ['cloth', 1], ['ammo', 4], ['rope', 1], ['oil', 1], ['yarrow', 2], ['glass', 1], ['medkit', 1]].sort(() => rnd() - 0.5).slice(0, 3);
    s.dayEvents.push(ev);
    return ev;
  }
  function genDayEvents(d, rnd) {
    const s = st();
    s.dayEvents = s.dayEvents.filter((e) => e.type === 'gift' && e.status !== 'done');
    const ring = Object.keys(D.AREAS).filter((a) => a !== 'f_2_2');
    const used = new Set();
    const pickArea = (pred) => { const c = ring.filter((a) => !used.has(a) && (!pred || pred(a))); const a = c[Math.floor(rnd() * c.length)]; used.add(a); return a; };
    const far = (a) => { const [x, y] = D.areaXY(a); return Math.abs(x - 2) + Math.abs(y - 2) >= 3; };
    const near = (a) => { const [x, y] = D.areaXY(a); return Math.abs(x - 2) + Math.abs(y - 2) <= 2; };
    if (d === 1) { addDayEvent('cache', pickArea(near), rnd); addDayEvent('tracks', pickArea(near), rnd); return; }
    const pool = ['cache', 'tracks', 'injured', 'anomaly', 'hiker'];
    if (!s.dog || s.dog.status === 'none') pool.push('dog', 'dog');
    U.shuffle(pool, rnd);
    for (let i = pool.length - 1; i >= 0; i--) if (pool.indexOf(pool[i]) !== i) pool.splice(i, 1);
    const n = 2 + (rnd() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) addDayEvent(pool[i], pickArea(pool[i] === 'dog' ? near : pool[i] === 'hiker' ? (a) => near(a) && a !== 'f_2_4' : null), rnd);
    if (d >= 2 && rnd() < 0.6) addDayEvent('wolves', pickArea(far), rnd);
  }

  const TRACK_NOTES = [
    { rule: ['mimic', 1], text: 'A torn page, frozen stiff: "...she said she was Mary. Mary\'s voice, Mary\'s coat. But it was minus twenty and the glass by her mouth stayed CLEAR. No breath. I didn\'t open. I didn\'t open."' },
    { rule: ['lighthunter', 1], text: 'A notebook in a ruined pack: "We kept the fire roaring all night for warmth. Sparks up the flue like a beacon. It came for the chimney glow first. Bank the fire. BANK THE FIRE."' },
    { rule: ['dweller', 3], text: 'Scrawled on birch bark: "Light in the room you\'re IN. It doesn\'t care about the rest. Curtains keep the light in and the tall one out."' },
    { rule: ['scratcher', 3], text: 'A carpenter\'s pencil note nailed to a tree: "Crossbars. Three planks, nails, rope to lash them. The low thing clawed all night and never got through."' },
    { rule: ['siphon', 2], text: 'A bundle of grey herbs tied with string and a tag: "SMOKEWEED — for the chimney thing. Throw in the fire. It hates the smoke."' },
    { rule: ['mimic', 3], text: 'A trapper\'s ledger page: "Old Garrow came knocking. Garrow left for town Tuesday — I SAW him go. It knew his name. It borrows names."' },
    { rule: ['stag', 2], text: 'Carved into a stump: "THE BELLS STOP AT THE CLEARING. RUN FOR THE LIGHT."' },
    { rule: ['mimic', 2], text: 'A scrap of map with a note: "Fresh snow, no footprints to the door. Real people leave tracks, ranger."' },
  ];

  E.objectsFor = function (areaId) {
    const s = st(), out = [];
    s.dayEvents.forEach((ev) => {
      if (ev.area !== areaId || ev.status === 'done') return;
      out.push({ type: 'event', ev, x: ev.x, y: ev.y, solid: ev.type === 'supply' || ev.type === 'cache' });
    });
    if (s.world.cairnArea === areaId || (!s.world.cairnArea && areaId === 'f_1_2')) {
      if (!s.world.cairnPos || s.world.cairnPos.area !== areaId) {
        const spot = areaId === 'f_1_2' ? { x: 21 * TS, y: 4 * TS + 12 } : findSpot(areaId, U.rng(U.hash(s.seed, areaId.length, s.time.day)), true);
        s.world.cairnPos = { area: areaId, x: spot.x, y: spot.y };
      }
      out.push({ type: 'cairn', x: s.world.cairnPos.x, y: s.world.cairnPos.y, solid: true });
    }
    return out;
  };

  E.examineCairn = function () {
    const s = st(), g = G();
    const here = g.area.id;
    if (here === 'f_1_2') g.showText('Red cairn', 'A cairn of red-stained stones, waist high. The map marks it here, in Red Cairn Woods. Nobody knows who built it.');
    else {
      g.showText('Red cairn', 'The red cairn. It belongs in Red Cairn Woods — the map is clear about that. But it is HERE, in ' + D.AREAS[here].name + '. The stones are warm to the touch.');
      E.journal('The red cairn has moved to ' + D.AREAS[here].name + '. The map says it stands in Red Cairn Woods. The forest does not match the map.', 'sightings');
      s.world.cairnSeen = here;
    }
  };

  E.name = function (o) {
    const ev = o.ev;
    switch (ev.type) {
      case 'dog': return 'A dog caught in a snare';
      case 'hiker': return ev.status === 'helped' ? 'Hiker' : 'A lost hiker';
      case 'cache': return 'Abandoned pack';
      case 'tracks': return 'Torn pack at the end of strange tracks';
      case 'injured': return ev.data.animal === 'fox' ? 'An injured fox' : 'An injured deer';
      case 'supply': return 'HQ supply crate';
      case 'gift': return 'Something on the porch';
      case 'wolves': return null;
      case 'anomaly': return { door: 'A door, standing alone', bells: 'Bells in a dead tree', warmfire: 'A still-warm campfire', crows: 'A ring of dead crows', voice: 'A voice in the trees' }[ev.data.kind];
    }
    return null;
  };

  E.actions = function (o) {
    const s = st(), g = G(), ev = o.ev;
    const done = (msg) => { ev.status = 'done'; if (msg) g.msg(msg, 'good'); g.save('event'); };
    switch (ev.type) {
      case 'dog': if (s.dog && s.dog.status !== 'none') return [{ label: 'Free the dog (it runs off into the trees)', run: () => done('The dog bolts into the trees the moment it is free.') }];
        return [{ label: 'Free the dog', time: 2.2, sound: 'rattle', every: 0.6, done: () => {
        s.dog = { status: 'following', fedDay: s.time.day, x: o.x, y: o.y, area: g.area.id, face: 1 };
        done('The snare springs open. The dog limps free — and won\'t leave your side. You name her Juniper.');
        E.journal('Freed a dog from a snare. She follows me home. Juniper. Dogs hear things before I do.', 'notes');
        g.sfx('whine');
      } }];
      case 'hiker': {
        if (ev.status === 'helped') return [];
        const dirs = ['north', 'south', 'east', 'west'];
        const [x, y] = D.areaXY(g.area.id);
        const correct = D.DIRNAME(Math.sign(2 - x) * (Math.abs(2 - x) > Math.abs(4 - y) ? 1 : 0), Math.sign(4 - y) * (Math.abs(4 - y) >= Math.abs(2 - x) ? 1 : 0));
        return [{ label: 'Talk', run: () => g.showText('Lost hiker', '"Ranger! Thank god. I\'ve lost the trail — which way to the trailhead from here? I have to get out before dark." (Check your map: M)') }]
          .concat(dirs.map((dname) => ({ label: 'Point ' + dname, run: () => {
            ev.status = 'helped';
            if (dname === correct) {
              s.rep += 1; I.give(['canned', 'ammo', 'cloth'][U.hash(x, y) % 3], 2);
              g.msg('"' + dname.charAt(0).toUpperCase() + dname.slice(1) + '. Right. Thank you!" They press supplies into your hands.', 'good');
              E.journal('Pointed a lost hiker ' + dname + ' to the trailhead.', 'notes');
            } else {
              s.rep -= 1; (s.pendingReports = s.pendingReports || []).push('A day hiker came in hours late and half-frozen. They say a ranger sent them the wrong way.');
              g.msg('They hurry off ' + dname + '. Something about that nags at you.', 'warn');
            }
            g.save('event');
          } })));
      }
      case 'cache': return [{ label: 'Search the pack', time: 1.4, sound: 'rustle', done: () => { ev.data.items.forEach(([id, n]) => I.give(id, n)); done(); } }];
      case 'tracks': return [{ label: 'Search the pack', time: 1.2, sound: 'paper', done: () => {
        const note = TRACK_NOTES[ev.data.note];
        g.showText('Found note', note.text);
        E.journal('Found at the end of strange tracks in ' + D.AREAS[ev.area].name + ': ' + note.text, 'sightings');
        E.unlockRule(note.rule[0], note.rule[1]);
        I.give(U.pick(['yarrow', 'smokeweed', 'canned', 'nails']), 2);
        done();
      } }];
      case 'injured': {
        const a = [{ label: 'Tend its wound (1 yarrow)', time: 2.5, sound: 'rustle', disabled: I.count(s.inv, 'yarrow') < 1 ? 'Need 1 yarrow' : false, done: () => {
          I.remove(s.inv, 'yarrow', 1); s.giftPending = true; s.rep += 0;
          done('You pack the wound with yarrow. The ' + ev.data.animal + ' limps off into the brush, looking back once.');
          E.journal('Tended an injured ' + ev.data.animal + ' in ' + D.AREAS[ev.area].name + '.', 'notes');
        } }];
        a.push({ label: 'End its suffering', time: 1.5, done: () => {
          if (ev.data.animal === 'deer') I.give('raw_venison', 2);
          done(); g.msg('It is quiet now.');
        } });
        return a;
      }
      case 'supply': return [{ label: 'Open the supply crate', time: 2, sound: 'wood_crack', every: 0.7, done: () => {
        const rnd = U.rng(U.hash(s.seed, s.time.day, 333));
        const items = [['nails', 6], ['plank', 2], ['canned', 2], ['oil', 1], ['ammo', 6], ['medkit', 1], ['glass', 1], ['rope', 1], ['smokeweed', 1]];
        U.shuffle(items, rnd).slice(0, 4 + (s.rep >= 2 ? 1 : 0)).forEach(([id, n]) => I.give(id, n));
        done('HQ supply drop recovered.');
        s.world.dropArea = null;
      } }];
      case 'gift': return [{ label: 'Pick it up', run: () => { I.give(U.pick(['raw_rabbit', 'medkit', 'ammo', 'yarrow']), 1); done('Something left this on your porch. Paw prints lead away into the woods.'); } }];
      case 'anomaly': return anomalyActions(o, done);
    }
    return [];
  };

  function anomalyActions(o, done) {
    const g = G(), s = st(), k = o.ev.data.kind;
    const texts = {
      door: 'A door in a frame, standing alone among the trees, no walls. You open it. Through it you see the inside of your own cabin: the stove burning HIGH, every lamp lit, every curtain open. Something tall stands at the window, looking in. You close the door. Only trees behind it.',
      bells: 'Small brass bells hang from the branches of a dead tree, tied with red thread. There is no wind. They ring anyway. Hoofprints circle the tree — they stop at nothing, start from nothing.',
      warmfire: 'A campfire, still warm, embers glowing. No tracks lead to it or away. You warm your hands. It feels like someone is sitting just across from you.',
      crows: 'A perfect ring of dead crows on the snow, heads pointing inward, toward a single unburnt match.',
      voice: 'From the trees, a voice calls your name. It is your own voice. It says: "Lock the back door." Then nothing.',
    };
    return [{ label: 'Examine', run: () => {
      g.showText(E.name(o), texts[k]);
      E.journal('Anomaly in ' + D.AREAS[o.ev.area].name + ': ' + texts[k], 'sightings');
      if (k === 'bells') E.unlockRule('stag', 0);
      if (k === 'door') E.unlockRule('lighthunter', 0);
      if (k === 'warmfire' && s.player.temp < 37.2) { s.player.temp = Math.min(37.2, s.player.temp + 1.2); }
      done();
    } }];
  }

  E.draw = function (g, o, t) {
    const ev = o.ev, x = Math.round(o.x), y = Math.round(o.y);
    switch (ev.type) {
      case 'dog': S.dog(g, x, y, 1, 'trapped', t); break;
      case 'hiker': S.human(g, x, y, { dir: 'down', coat: P.y1, coat2: P.y0, pants: P.b0, skin: P.sk2, hair: P.wood3, hat: 'beanie', hatColor: P.r2, blink: (t % 4) < 0.15 }); break;
      case 'cache': case 'tracks':
        R(g, 'rgba(0,0,0,0.3)', x - 8, y - 2, 16, 3); R(g, P.rg1, x - 6, y - 11, 12, 10); R(g, P.rg2, x - 6, y - 11, 12, 3); R(g, P.wood2, x - 4, y - 7, 8, 1); R(g, P.y1, x - 1, y - 5, 2, 2);
        if (ev.type === 'tracks') { for (let i = 0; i < 9; i++) { const px = x - 30 - i * 14, py = y - 4 + Math.sin(i) * 6; R(g, P.sn0, px, py, 3, 2); R(g, P.sn0, px + 4, py + 3, 3, 2); } }
        break;
      case 'injured': S.animal(g, { type: ev.data.animal === 'fox' ? 'fox' : 'deer', x, y, face: 1, injured: true, grazing: true, moving: false }, t); R(g, P.r1, x - 8, y + 1, 4, 1); break;
      case 'supply':
        R(g, 'rgba(0,0,0,0.35)', x - 11, y - 2, 22, 4); R(g, P.wood3, x - 10, y - 14, 20, 13); R(g, P.wood4, x - 10, y - 14, 20, 3); R(g, P.wood1, x - 10, y - 8, 20, 1);
        R(g, P.r2, x - 2, y - 13, 4, 12); R(g, P.white, x - 8, y - 6, 4, 3);
        if (Math.sin(t * 4) > 0) R(g, P.r3, x + 6, y - 18, 2, 2);
        break;
      case 'gift': R(g, P.wood2, x - 4, y - 5, 8, 5); R(g, P.r2, x - 2, y - 4, 4, 2); break;
      case 'anomaly': {
        const k = ev.data.kind;
        if (k === 'door') { R(g, 'rgba(0,0,0,0.3)', x - 9, y - 2, 18, 3); R(g, P.wood1, x - 8, y - 30, 16, 30); R(g, P.wood3, x - 6, y - 28, 12, 28); R(g, P.y1, x + 3, y - 14, 2, 2); }
        else if (k === 'bells') { g.drawImage(S.deadTree(1, 1, false), x - 12, y - 39); for (let i = 0; i < 4; i++) { const sw = Math.sin(t * 3 + i) * 1.5; R(g, P.r2, x - 8 + i * 5 + sw, y - 30 + (i % 2) * 6, 1, 4); R(g, P.y1, x - 9 + i * 5 + sw, y - 26 + (i % 2) * 6, 3, 2); } }
        else if (k === 'warmfire') { for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; R(g, P.st2, x + Math.cos(a) * 6 - 1, y - 3 + Math.sin(a) * 3, 3, 2); } R(g, P.f1, x - 2, y - 4, 4, 2); if (Math.sin(t * 7) > 0) R(g, P.f3, x - 1, y - 5, 2, 1); }
        else if (k === 'crows') { for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28; R(g, P.i0, x + Math.cos(a) * 12 - 2, y - 3 + Math.sin(a) * 6, 4, 2); } R(g, P.bone, x, y - 3, 1, 3); }
        else if (k === 'voice') { const a = 0.3 + Math.sin(t * 2) * 0.2; g.fillStyle = 'rgba(200,210,230,' + a + ')'; g.fillRect(x - 1, y - 18, 2, 14); g.fillRect(x - 3, y - 20, 6, 4); }
        break;
      }
    }
  };

  // ================================================================== DOG
  E.dogReact = function (kind) {
    const s = st(), g = G();
    if (!s.dog || s.dog.status !== 'home') return;
    if (kind === 'monster') { g.sfxCabin('growl', { room: 'room_main', x: 100, y: 120 }, { vol: 0.8 }); if (g.area.kind === 'room') g.msg('Juniper growls low, hackles up, staring at the wall.'); }
    else if (kind === 'mimic') {
      if (Math.random() < 0.7) { g.sfxCabin('growl', { room: 'room_main', x: 170, y: 180 }, {}); g.msg('Juniper backs away from the front door, growling.'); }
      else { g.sfxCabin('bark', { room: 'room_main', x: 170, y: 180 }, {}); g.msg('Juniper barks at the front door.'); }
    } else if (kind === 'visitor') {
      if (Math.random() < 0.75) { g.sfxCabin('whine', { room: 'room_main', x: 170, y: 180 }, {}); g.msg('Juniper whines at the front door, tail wagging.'); }
      else { g.sfxCabin('bark', { room: 'room_main', x: 170, y: 180 }, {}); g.msg('Juniper barks at the front door.'); }
    } else if (kind === 'phantom') { if (Math.random() < 0.5) g.msg('Juniper lifts her head... and lies back down.'); }
  };
  E.dogActions = function () {
    const s = st(), g = G();
    const fed = s.dog.fedDay >= s.time.day;
    const foods = ['raw_rabbit', 'raw_venison', 'cooked_rabbit', 'cooked_venison', 'canned'];
    const f = I.bestOf(s.inv, foods);
    return [
      { label: 'Pet Juniper', run: () => { g.msg('Juniper leans into your hand. Her tail thumps the floor.'); g.sfx('whine'); } },
      { label: fed ? 'Feed (already fed today)' : f ? 'Feed (' + D.ITEMS[f].name + ')' : 'Feed (needs meat or canned food)', disabled: fed ? 'Fed today' : !f ? 'No suitable food' : false, run: () => { I.remove(s.inv, f, 1); s.dog.fedDay = s.time.day; g.msg('Juniper wolfs it down.'); g.sfx('eat'); } },
    ];
  };

  // ================================================================== LORE
  E.lore = function (k) {
    if (k === 'trunk') return 'Wool socks, a tin of letters, your father\'s compass. The top letter, in your sister\'s handwriting: "' + U.numWord(NW.G.finalNight(), true) + ' nights, then come home. Promise me you won\'t open the door for anyone you don\'t know. I mean it. Not out there." Under the letters: the previous ranger\'s handbook, its last pages torn out.';
    if (k === 'photo') return 'You and your sister at the trailhead, two summers ago, squinting into the sun. On the back, in pencil that isn\'t yours: "Count the breaths."';
    return '';
  };
  E.deskSummary = function () {
    const s = st(); const out = [];
    for (const wid in s.cabin.windows) { const w = s.cabin.windows[wid]; if (w.glass < 100 || w.shutter < 100) out.push(NW.Cabin.windowLabel(wid)); }
    for (const did in s.cabin.doors) { const d = s.cabin.doors[did]; if (d.hp < d.max || d.lockBroken || !d.reinforced) out.push(NW.Cabin.doorLabel(did)); }
    return out;
  };
})(window.NW);
