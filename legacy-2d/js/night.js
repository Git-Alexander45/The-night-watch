'use strict';
// Night director: Light Hunter, Dark Dweller, Scratcher, Siphon, Pale Stag, visitors & Mimics.
(function (NW) {
  const U = NW.U, D = NW.D, I = NW.Inv;
  const N = NW.Night = {};
  const G = () => NW.G;
  const st = () => NW.G.state;
  const WIN_ROOM = { w_front_l: 'room_main', w_front_r: 'room_main', w_bed: 'room_bed', w_office: 'room_office', w_storage: 'room_storage' };

  N.newNight = function () {
    return {
      n: 0, active: false, plan: null,
      lh: { on: false, interest: 0, stage: 'away', wid: null, calm: 0, t: 0, cool: 0, snd: 0 },
      dd: { on: false, meter: 0, stage: 0, cool: 0, room: null },
      sc: { stage: 'none', door: null, t: 0, snd: 0 },
      si: { stage: 'none', t: 0, offT: 0, snd: 0 },
      vis: null,
      stag: { stage: 'none', t: 0, x: 0, y: 0, area: null, snd: 0 },
      amb: 30, events: [],
    };
  };

  // -------------------------------------------------------------- Queries
  N.lhAt = (wid) => { const lh = st().night.lh; return st().night.active && lh.stage === 'window' && lh.wid === wid; };
  N.scratcherAt = (did) => { const sc = st().night.sc; return sc.stage === 'door' && sc.door === did; };
  N.scratcherNear = (did) => { const sc = st().night.sc; return (sc.stage === 'door' || sc.stage === 'approach') && sc.door === did; };
  N.siphonOn = () => st().night.si.stage === 'roof';
  N.visitorAtDoor = () => !!st().night.vis;
  N.currentVisitor = () => { const v = st().night.vis; return v ? st().visitors[v.vid] : null; };
  N.nightMin = () => { const m = st().time.min; return (m - D.NIGHT_START + 1440) % 1440; };

  N.tension = function () {
    const s = st(), n = s.night;
    if (!n.active) return 0;
    let t = 0.1;
    if (n.lh.stage === 'circling') t = Math.max(t, 0.45);
    if (n.lh.stage === 'window') t = Math.max(t, 0.95);
    if (n.dd.on) t = Math.max(t, n.dd.meter / 110);
    if (n.sc.stage === 'approach') t = Math.max(t, 0.5);
    if (n.sc.stage === 'door') t = Math.max(t, 0.9);
    if (n.si.stage === 'roof') t = Math.max(t, 0.45);
    if (n.vis) t = Math.max(t, 0.35);
    if (n.stag.stage === 'watching') t = Math.max(t, 0.6);
    if (n.stag.stage === 'hunting') t = Math.max(t, 1);
    return t;
  };

  // ---------------------------------------------------------------- Plan
  N.genPlan = function (n) {
    const s = st();
    const rnd = U.rng(U.hash(s.seed, n, 4242));
    const at = (lo, hi) => Math.floor(lo + rnd() * (hi - lo));
    const p = { lhSens: 0, ddSens: 0, visitors: [], scratcher: [], siphon: [], phantom: [], radio: [] };
    p.radio.push({ at: 30, kind: 'evening' });
    // difficulty mode scales monster sensitivity (capped so late endless nights stay survivable)
    const mm = NW.G.modeVal('monster', 1), scale = (b) => Math.min(Math.max(b, 2.2), b * mm);
    if (n >= 2) p.lhSens = scale(n === 2 ? 0.7 : n === 3 ? 0.85 : n <= 5 ? 0.95 + (n - 4) * 0.05 : 1.05 + (n - 6) * 0.06);
    if (n >= 5) p.ddSens = scale(n === 5 ? 0.75 : 0.85 + Math.min(0.6, (n - 6) * 0.06));
    let nv = 0, ns = 0, nsi = 0, nph = 0;
    if (n === 3) nv = rnd() < 0.5 ? 1 : 2;
    else if (n === 4) { nv = 1 + (rnd() < 0.4 ? 1 : 0); ns = 1; }
    else if (n === 5) { nv = 1 + (rnd() < 0.5 ? 1 : 0); ns = 1; nph = 1; }
    else if (n === 6) { nv = 2; ns = 1; nsi = 1; nph = 1; }
    else if (n === 7) { nv = 2; ns = 2; nsi = 1; nph = 1; }
    else if (n > 7) { const k = n - 7; nv = 2 + (k % 2); ns = Math.min(4, 2 + Math.floor(k / 2)); nsi = Math.min(3, 1 + Math.floor(k / 3)); nph = 1 + (k % 2); }
    const spread = (count, lo, hi) => { const out = []; for (let i = 0; i < count; i++) { const seg = (hi - lo) / count; out.push(at(lo + seg * i, lo + seg * (i + 1) - 10)); } return out; };
    // visitors
    let mimicSoFar = (s.visitors && Object.values(s.visitors).some((v) => v.mimic));
    spread(nv, 80, 560).forEach((t, i) => {
      let mimic = rnd() < (n === 3 ? 0.5 : 0.55);
      if (n === 4 && !mimicSoFar && i === nv - 1) mimic = true;
      if (mimic) mimicSoFar = true;
      const vid = N.genVisitor(n, mimic, rnd);
      p.visitors.push({ at: t, vid });
    });
    spread(ns, 120, 580).forEach((t) => p.scratcher.push({ at: t, door: rnd() < 0.5 ? 'front' : 'back' }));
    spread(nsi, 150, 560).forEach((t) => p.siphon.push({ at: t }));
    spread(nph, 60, 600).forEach((t) => p.phantom.push({ at: t, door: rnd() < 0.6 ? 'back' : 'front' }));
    if (n >= 3 && rnd() < 0.7) p.radio.push({ at: at(150, 450), kind: 'emergency' });
    if (n >= 5 && p.visitors.some((v) => s.visitors[v.vid].mimic)) {
      const mv = p.visitors.find((v) => s.visitors[v.vid].mimic);
      p.radio.push({ at: Math.max(40, mv.at - 50), kind: 'fake', vid: mv.vid });
    }
    if (n >= 4 && rnd() < 0.5) p.radio.push({ at: at(300, 600), kind: 'numbers' });
    p.final = n === NW.G.finalNight();
    p.done = {};
    return NW.Hooks.filter('nightPlan', p, n, rnd) || p;
  };

  // ------------------------------------------------------------- Visitors
  function routeVia(origin) {
    let [x, y] = D.areaXY(origin); const via = [];
    while (x !== 2 || y !== 2) {
      if (y !== 2 && (x === 2 || Math.abs(y - 2) >= Math.abs(x - 2))) y += U.sign(2 - y); else x += U.sign(2 - x);
      if (x !== 2 || y !== 2) via.push(D.areaId(x, y));
    }
    return via;
  }
  function dirOf(areaId) { const [x, y] = D.areaXY(areaId); return D.DIRNAME(x - 2, y - 2); }
  const DIRS = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest'];

  N.genVisitor = function (night, mimic, rnd) {
    const s = st();
    rnd = rnd || Math.random;
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const id = 'v' + night + '_' + Math.floor(rnd() * 1e6).toString(36);
    const permits = s.records.permits;
    const impersonated = new Set(Object.values(s.visitors).filter((v) => v.mimic).map((v) => v.name));
    const prevGenuine = Object.values(s.visitors).filter((v) => !v.mimic && v.outcome === 'sheltered' && v.night < night && !impersonated.has(v.name));
    let name, permit = null, tactic = null;
    const tells = [], soft = [];
    if (mimic) {
      const opts = [];
      if (permits.some((p) => p.status === 'checkedout' && !impersonated.has(p.name))) opts.push('checkedout', 'checkedout');
      if (prevGenuine.length) opts.push('repeat');
      opts.push('active', 'random');
      tactic = pick(opts);
      if (tactic === 'checkedout') { permit = pick(permits.filter((p) => p.status === 'checkedout' && !impersonated.has(p.name))); name = permit.name; tells.push('checkedout'); }
      else if (tactic === 'repeat') { name = pick(prevGenuine).name; tells.push('repeat'); }
      else if (tactic === 'active' && permits.some((p) => p.status === 'active')) { permit = pick(permits.filter((p) => p.status === 'active')); name = permit.name; }
      else { tactic = 'random'; name = pick(D.FIRST) + ' ' + pick(D.LAST); }
    } else {
      const act = permits.filter((p) => p.status === 'active' && !p.met);
      if (act.length && rnd() < 0.6) { permit = pick(act); name = permit.name; permit.met = true; }
      else name = pick(D.FIRST) + ' ' + pick(D.LAST);
    }
    const origin = permit ? permit.origin : pick(D.ORIGINS);
    const via = routeVia(origin);
    const app = {
      skin: pick([NW.S.P.sk1, NW.S.P.sk2, NW.S.P.sk3, NW.S.P.sk0]),
      hair: pick([NW.S.P.wood1, NW.S.P.ink, NW.S.P.y0, NW.S.P.st3, NW.S.P.r1, NW.S.P.wood3]),
      hairStyle: pick(['short', 'short', 'long', 'bald']),
      hat: pick(['beanie', 'hood', 'cap', 'none', 'beanie']),
      hatColor: pick([NW.S.P.r1, NW.S.P.b1, NW.S.P.rg2, NW.S.P.y0, NW.S.P.pur1, NW.S.P.st2]),
      coat: pick([NW.S.P.b1, NW.S.P.r1, NW.S.P.rg1, NW.S.P.y0, NW.S.P.wood2, NW.S.P.pur1, NW.S.P.st1]),
      scarf: rnd() < 0.5 ? pick([NW.S.P.r2, NW.S.P.y1, NW.S.P.b2, NW.S.P.bone]) : null,
      beard: rnd() < 0.3, glasses: rnd() < 0.2, old: rnd() < 0.3,
      eyes: pick([NW.S.P.wood1, NW.S.P.b2, NW.S.P.g3]),
    };
    if (tactic === 'repeat') { const src = prevGenuine.find((v) => v.name === name); if (src) Object.assign(app, src.app, { hatColor: app.hatColor }); }
    const party = permit ? permit.party : 1 + Math.floor(rnd() * 3);
    // mimic hard tells (always noBreath candidates; others depend on weather at arrival - resolved when shown)
    if (mimic) {
      const hard = ['nobreath', 'nofoot', 'dry', 'echo'];
      U.shuffle(hard, rnd);
      const want = tells.length ? 1 : 1 + (rnd() < 0.5 ? 1 : 0);
      for (let i = 0; i < want; i++) tells.push(hard[i]);
      if (!tells.includes('nobreath') && !tells.includes('checkedout') && !tells.includes('repeat')) tells.push('nobreath');
      if (rnd() < 0.6) soft.push(pick(['wrongdir', 'wrongweather', 'bridge']));
    } else if (rnd() < 0.3) soft.push('hedgedir');
    const need = mimic ? 'warmth' : pick(['food', 'medicine', 'warmth', 'food']);
    let claimDir = dirOf(origin);
    if (soft.includes('wrongdir')) claimDir = pick(DIRS.filter((d) => d !== claimDir));
    if (soft.includes('hedgedir')) claimDir = pick(DIRS.filter((d) => d !== claimDir));
    const v = {
      id, night, name, mimic, tactic, tells, soft, app, party, need,
      permit: !!permit, origin, via: via.length ? via[Math.floor(rnd() * via.length)] : null, claimDir,
      story: pick(mimic ? MIMIC_STORIES : STORIES[need]),
      outcome: null, revealed: false, asked: {}, echo: null,
    };
    // feature modules may dress a visitor as a recurring character, etc.
    const out = NW.Hooks.filter('visitor', v, { night, mimic, rnd, permits, prevGenuine, impersonated }) || v;
    out.id = id;
    s.visitors[id] = out;
    return id;
  };

  const STORIES = {
    food: ["We ran out of food two days ago. My hands won't stop shaking.", "A bear got into our packs. We haven't eaten since yesterday morning.", "I rationed badly. I'm so hungry I can barely think."],
    medicine: ["My partner fell on the ridge. I came ahead for help — I twisted my ankle too, it's swelling.", "I cut my hand open on the ice. It won't stop bleeding.", "I slipped crossing rocks. I think my wrist is broken."],
    warmth: ["Our tent tore in the wind. I've been walking for hours to stay warm.", "I lost the trail when it got dark and saw your light.", "My stove fuel froze. I can't feel my toes anymore."],
  };
  const MIMIC_STORIES = ["I just need to come in. It's so cold out here. Let me in.", "I lost the others. I saw your light. Please open the door, it's cold.", "Something is out here with me. Please. Open the door.", "We were camping and then... it got dark. Let me in and I'll explain."];

  N.answer = function (v, q) { return NW.Hooks.filter('visitorAnswer', answerBase(v, q), v, q); };
  function answerBase(v, q) {
    const s = st();
    const w = s.weather;
    v.asked[q] = true;
    switch (q) {
      case 'who': {
        let a = 'My name is ' + v.name + '.';
        if (v.permit) a += ' I registered at the trailhead — party of ' + v.party + '.';
        else a += v.mimic ? ' Just ' + v.name + '.' : " We didn't get a permit. I'm sorry, I know we should have.";
        return a;
      }
      case 'where': {
        const oname = D.AREAS[v.origin].name;
        const hedge = v.soft.includes('hedgedir') ? ' I think? I got turned around in the dark.' : '';
        let a = 'I was at ' + oname + ', ' + v.claimDir + ' of here.' + hedge;
        const [ox] = D.areaXY(v.origin);
        if (v.mimic && v.soft.includes('bridge')) a += ' I crossed the bridge at Crow Creek.';
        else if (ox === 4 && s.world.bridgeOut) a += v.mimic ? ' I came over the creek.' : ' The Crow Creek bridge is gone, so I waded the ford.';
        else if (v.via) a += ' I followed the trail past ' + D.AREAS[v.via].name + '.';
        return a;
      }
      case 'what': return v.story;
      case 'weather': {
        if (v.mimic && v.tells.includes('echo') && s.radio.lastPhrase) { v.echo = s.radio.lastPhrase; return '"' + s.radio.lastPhrase + '"'; }
        if (v.mimic && v.soft.includes('wrongweather') && (w.precip > 0.3 || w.wind > 0.6)) return "Weather? It's a calm, clear night. Lovely, really.";
        if (v.mimic) return "Cold. It's cold out here.";
        if (w.type === 'blizzard') return "It's a whiteout. I can't see my own hands out here.";
        if (w.type === 'snow') return "Snowing hard since dusk. It's getting deep.";
        if (w.type === 'rain') return "Freezing rain. I'm soaked through.";
        if (w.type === 'fog') return "Fog so thick I walked into a tree.";
        if (w.type === 'clear') return "Clear and bitter. The stars are out, but it's so cold.";
        return "Cold and grey. The wind cuts right through you.";
      }
      case 'need': {
        if (v.mimic) return 'Just let me in. Please. Let me in.';
        return { food: "Food. Anything. And a few hours by your fire.", medicine: "Something for the pain — bandages, medicine. And somewhere warm.", warmth: "Just somewhere warm until sunrise. I won't be any trouble." }[v.need];
      }
    }
    return '...';
  };
  // Visual tells at the door depend on current weather (resolved live)
  N.visual = function (v) {
    const w = st().weather;
    const cold = w.temp < 3;
    return {
      breath: cold && !(v.mimic && v.tells.includes('nobreath')),
      snowy: (w.type === 'snow' || w.type === 'blizzard') && w.precip > 0.25 && !(v.mimic && v.tells.includes('dry')),
      wet: w.type === 'rain' && !(v.mimic && v.tells.includes('dry')),
      footprints: w.snow > 0.3 && !(v.mimic && v.tells.includes('nofoot')),
      blinks: !v.mimic,
    };
  };

  // -------------------------------------------------------------- Update
  N.update = function (dt, gm) {
    const s = st(), n = s.night, g = G();
    if (!n.active) { N.updateStag(dt); return; }
    const nm = N.nightMin();
    const p = n.plan;
    // scheduled events
    p.radio.forEach((r, i) => { const k = 'r' + i; if (!p.done[k] && nm >= r.at) { p.done[k] = true; NW.Events.nightRadio(r); } });
    p.visitors.forEach((v, i) => { const k = 'v' + i; if (!p.done[k] && nm >= v.at && !n.vis) { p.done[k] = true; N.arrive(v.vid); } });
    p.scratcher.forEach((sc, i) => { const k = 's' + i; if (!p.done[k] && nm >= sc.at && n.sc.stage === 'none') { p.done[k] = true; N.scratcherStart(sc.door); } });
    p.siphon.forEach((si, i) => { const k = 'si' + i; if (!p.done[k] && nm >= si.at && n.si.stage === 'none') { p.done[k] = true; N.siphonStart(); } });
    p.phantom.forEach((ph, i) => { const k = 'p' + i; if (!p.done[k] && nm >= ph.at) { p.done[k] = true; g.sfxCabin('knock', 'door:' + ph.door, { count: 3 }); g.msg('Knocking — at the ' + ph.door + ' door.', 'warn'); NW.Events.dogReact('phantom'); } });

    if (p.lhSens > 0) updateLH(dt, p.lhSens);
    if (p.ddSens > 0) updateDD(dt, p.ddSens);
    updateScratcher(dt);
    updateSiphon(dt);
    updateVisitor(dt);
    N.updateStag(dt);
    // ambience
    n.amb -= dt;
    if (n.amb <= 0) {
      n.amb = U.rand(14, 32);
      const r = Math.random();
      if (r < 0.25) g.sfx('owl', { vol: 0.35, pan: U.rand(-0.8, 0.8), wet: 0.6 });
      else if (r < 0.45) g.sfx('branch', { vol: 0.3, pan: U.rand(-1, 1) });
      else if (r < 0.6) g.sfx('howl', { vol: 0.18, pan: U.rand(-1, 1), wet: 0.8 });
      else if (r < 0.8) g.sfx('creak', { vol: 0.4 });
      else g.sfx('gust', { vol: 0.5 });
    }
  };

  // ---- Light Hunter
  function updateLH(dt, sens) {
    const s = st(), lh = s.night.lh, g = G(), L = NW.Survival.light;
    const thr = 1.05;
    lh.on = true;
    if (lh.cool > 0) { lh.cool -= dt; return; }
    if (N.nightMin() < 45) return;
    if (lh.stage !== 'window') {
      if (L.leak > thr) lh.interest += (L.leak - thr) * 3.4 * sens * dt;
      else lh.interest -= 3 * dt;
      lh.interest = U.clamp(lh.interest, 0, 100);
      if (lh.stage === 'away' && lh.interest >= 35) {
        lh.stage = 'circling';
        g.journalOnce('lh_first', 'Heavy footsteps circled the cabin tonight — something huge, drawn to the light leaking out.', 'sightings');
        NW.Events.unlockRule('lighthunter', 0); NW.Events.unlockRule('lighthunter', 2);
        g.msg('Heavy footsteps circle the cabin. Something is drawn to your light.', 'danger');
        NW.Events.dogReact('monster');
      }
      if (lh.stage === 'circling') {
        lh.snd -= dt;
        if (lh.snd <= 0) { lh.snd = U.rand(1.6, 3.2); const ang = (s.time.min * 0.3) % 6.28; g.sfx('heavystep', { vol: 0.65, pan: Math.sin(ang * 5) }); }
        if (lh.interest < 20) { lh.stage = 'away'; g.msg('The heavy footsteps fade into the trees.'); }
      }
      if (lh.interest >= 100) {
        let best = null, bv = -1;
        for (const wid in L.winLeak) if (L.winLeak[wid] > bv) { bv = L.winLeak[wid]; best = wid; }
        if (bv < 0.05) best = Math.random() < 0.5 ? 'w_front_l' : 'w_front_r';
        lh.stage = 'window'; lh.wid = best; lh.calm = 0; lh.t = 0; lh.snd = 0; lh.reach = 0; lh.reachWarned = false;
        g.warn('SOMETHING IS AT THE ' + NW.Cabin.WINDOW_NAMES[best].toUpperCase() + '!');
        g.sfxCabin('glasstap', 'win:' + best, { vol: 1 });
        g.sfx('sting', { vol: 0.5 });
        NW.Events.unlockRule('lighthunter', 3);
        g.save('event');
      }
    } else {
      lh.t += dt;
      const w = s.cabin.windows[lh.wid];
      const wl = L.winLeak[lh.wid];
      const pressing = wl > 0.12 || L.leak > thr + 0.7;
      lh.snd -= dt;
      if (pressing) {
        lh.calm = 0;
        const lm = NW.Hooks.filter('lhDamage', 1, lh.wid);
        if (w.boarded > 0) { w.boarded = Math.max(0, w.boarded - 3.5 * lm * dt); }
        else if (w.shutClosed && w.shutter > 0) { w.shutter = Math.max(0, w.shutter - 4.5 * lm * dt); if (w.shutter <= 0) { g.msg('The shutters on the ' + NW.Cabin.WINDOW_NAMES[lh.wid].toLowerCase() + ' splinter apart!', 'danger'); g.sfxCabin('wood_crack', 'win:' + lh.wid); } }
        else { const before = w.glass; w.glass = Math.max(0, w.glass - 4.2 * lm * dt); if (before >= 60 && w.glass < 60) { g.sfxCabin('glasscrack', 'win:' + lh.wid); g.msg('The glass is cracking!', 'danger'); } }
        if (lh.snd <= 0) { lh.snd = U.rand(0.8, 1.6); g.sfxCabin(Math.random() < 0.5 ? 'glasstap' : 'creak', 'win:' + lh.wid, { vol: 0.9 }); }
        if (w.glass <= 0 && w.boarded <= 0 && !(w.shutClosed && w.shutter > 0)) {
          lh.reach = (lh.reach || 0) + dt;
          if (!lh.reachWarned) { lh.reachWarned = true; g.msg('A long pale arm gropes through the broken ' + NW.Cabin.WINDOW_NAMES[lh.wid].toLowerCase() + '. Kill the light!', 'danger'); }
          if (lh.reach > 9) lhBreakIn(lh.wid);
        }
      } else {
        lh.calm += dt;
        if (lh.snd <= 0) { lh.snd = 3; g.sfxCabin('heavystep', 'win:' + lh.wid, { vol: 0.4 }); }
        if (lh.calm >= 7) { lh.stage = 'away'; lh.interest = 30; lh.cool = 18; g.msg('The pressure at the glass eases. It has lost interest — for now.'); NW.Events.unlockRule('lighthunter', 3); s.stats.lhRepelled = (s.stats.lhRepelled || 0) + 1; }
      }
      if (lh.stage === 'window' && lh.t > 80) { lh.stage = 'away'; lh.interest = 20; lh.cool = 25; g.msg('Whatever was at the window withdraws into the dark.'); }
    }
  }
  function lhBreakIn(wid) {
    const s = st(), lh = s.night.lh, g = G();
    const w = s.cabin.windows[wid];
    w.glass = 0; w.shutter = 0; w.shutClosed = false;
    g.sfxCabin('glassbreak', 'win:' + wid, { vol: 1 }); g.sfx('roar', { vol: 0.8 });
    const room = WIN_ROOM[wid];
    g.warn('THE LIGHT HUNTER REACHES INSIDE');
    s.lamps[room] = false;
    if (room === 'room_main' || Math.random() < 0.5) s.stove.setting = 'off';
    if (g.area.id === room) { g.flash = 1; NW.Survival.damage(45, 'lighthunter'); }
    else g.msg('Glass explodes somewhere in the cabin. The lights die.', 'danger');
    NW.Events.unlockRule('lighthunter', 1); NW.Events.unlockRule('lighthunter', 4);
    s.night.events.push('The Light Hunter broke the ' + NW.Cabin.WINDOW_NAMES[wid].toLowerCase() + '.');
    lh.stage = 'away'; lh.interest = 0; lh.cool = 40;
    g.save('event');
  }

  // ---- Dark Dweller
  function updateDD(dt, sens) {
    const s = st(), dd = s.night.dd, g = G(), L = NW.Survival.light;
    dd.on = true;
    if (N.nightMin() < 60) return;
    if (dd.cool > 0) { dd.cool -= dt; return; }
    const inside = g.area.kind === 'room';
    const myLight = inside ? L.room[g.area.id] : 1;
    const myDark = inside && myLight < 0.3;
    const darkness = Math.max(0, 0.32 - L.avg) / 0.32;
    const rate = (darkness * 3.2 + (myDark ? 2.4 : 0)) * sens;
    if (rate > 0.25) dd.meter += rate * dt; else dd.meter -= 4 * dt;
    dd.meter = U.clamp(dd.meter, 0, 100);
    let dark = null, dv = 9;
    for (const r in L.room) if (L.room[r] < dv) { dv = L.room[r]; dark = r; }
    dd.room = dark;
    if (dd.meter >= 30 && dd.stage < 1) { dd.stage = 1; g.msg('Whispering. It comes from the dark rooms.', 'warn'); g.journalOnce('dd_first', 'Whispers from the unlit rooms. Something lives in the dark of this cabin.', 'sightings'); NW.Events.unlockRule('dweller', 0); }
    if (dd.meter >= 65 && dd.stage < 2) { dd.stage = 2; g.msg('Something moves in the dark of the ' + D.ROOMS[dark].name.toLowerCase() + '. Bring light.', 'danger'); NW.Events.dogReact('monster'); NW.Events.unlockRule('dweller', 2); }
    if (dd.meter < 25) dd.stage = 0;
    if (dd.meter >= 100) {
      if (myDark) {
        g.warn('THE DARK TAKES HOLD OF YOU'); g.sfx('shriek', { vol: 1 }); g.flash = 0.6;
        NW.Survival.damage(30, 'dweller');
        s.player.stamina = 0;
        dd.meter = 40; dd.cool = 18;
        NW.Events.unlockRule('dweller', 1);
        s.night.events.push('The Dark Dweller struck you in the dark.');
      } else {
        g.sfx('shriek', { vol: 0.6, pan: -0.5 });
        g.msg('A shriek from the darkness — it recoils from your light.', 'warn');
        NW.Events.unlockRule('dweller', 1);
        const lit = Object.keys(s.lamps).filter((r) => s.lamps[r] && r !== g.area.id);
        if (lit.length) { const r = U.pick(lit); s.lamps[r] = false; g.msg('The lamp in the ' + D.ROOMS[r].name.toLowerCase() + ' is snuffed out.', 'warn'); }
        else if (NW.Survival.stoveLit()) s.stove.fuel = Math.max(1, s.stove.fuel - 6);
        dd.meter = 55; dd.cool = 12;
      }
      dd.stage = 0;
    }
  }

  // ---- Scratcher
  N.scratcherStart = function (door) {
    const s = st(), sc = s.night.sc, g = G();
    sc.stage = 'approach'; sc.door = door; sc.t = 0; sc.snd = 0; sc.rattle = 0;
    g.sfxCabin('drag', 'door:' + door, { vol: 0.8 });
    g.msg('Something drags itself through the snow toward the ' + door + ' door.', 'danger');
    NW.Events.dogReact('monster');
    g.journalOnce('sc_first', 'Something low and heavy dragged itself to the ' + door + ' door tonight. Claws.', 'sightings');
    NW.Events.unlockRule('scratcher', 0);
  };
  function updateScratcher(dt) {
    const s = st(), sc = s.night.sc, g = G();
    if (sc.stage === 'none') return;
    sc.t += dt; sc.snd -= dt;
    const d = s.cabin.doors[sc.door];
    if (sc.stage === 'approach') {
      if (sc.snd <= 0) { sc.snd = 3; g.sfxCabin('drag', 'door:' + sc.door, { vol: 0.7 }); }
      if (sc.t >= 14) { sc.stage = 'door'; sc.t = 0; g.warn('CLAWS AT THE ' + sc.door.toUpperCase() + ' DOOR!'); g.sfx('sting', { vol: 0.4 }); g.save('event'); }
      return;
    }
    if (sc.stage === 'door') {
      if (d.hp <= 0 || d.open) return scratcherAttack('The door stands open.');
      if (!d.locked || d.lockBroken) {
        sc.rattle = (sc.rattle || 0) + dt;
        if (sc.snd <= 0) { sc.snd = 1; g.sfxCabin('rattle', 'door:' + sc.door, { vol: 1 }); }
        if (sc.rattle > 5) { d.open = true; g.sfxCabin('door', 'door:' + sc.door, { vol: 1 }); NW.Events.unlockRule('scratcher', 1); return scratcherAttack('The ' + sc.door + ' door was unlocked.'); }
      } else {
        d.hp = Math.max(0, d.hp - NW.Hooks.filter('clawDamage', d.reinforced ? 1.6 : 3.4, sc.door) * dt);
        if (sc.snd <= 0) { sc.snd = U.rand(0.9, 1.5); g.sfxCabin('scratch', 'door:' + sc.door, { vol: 1 }); if (Math.random() < 0.3) g.sfxCabin('bang', 'door:' + sc.door, { vol: 0.8 }); }
        if (d.hp <= 0) { g.sfxCabin('wood_crack', 'door:' + sc.door, { vol: 1 }); return scratcherAttack('The ' + sc.door + ' door gave way.'); }
      }
      if (sc.t > 55) { sc.stage = 'none'; g.msg('The scratching stops. Something drags itself away into the trees.'); NW.Events.unlockRule('scratcher', 3); s.stats.scRepelled = (s.stats.scRepelled || 0) + 1; }
    }
  }
  function scratcherAttack(why) {
    const s = st(), sc = s.night.sc, g = G();
    g.warn('IT IS INSIDE'); g.sfx('roar', { vol: 1 }); g.flash = 0.7;
    const doorPos = sc.door === 'front' ? { x: 240, y: 186 } : { x: 360, y: 172 };
    const inCabin = g.area.kind === 'room' || (g.area.id === 'f_2_2' && U.dist(s.player.x, s.player.y, doorPos.x, doorPos.y) < 44);
    if (inCabin) NW.Survival.damage(40, 'scratcher');
    else g.msg('Something tore through the cabin while you were away.', 'danger');
    const d = s.cabin.doors[sc.door];
    if (d.hp > 0) d.open = true;
    if (Math.random() < 0.5) d.lockBroken = true;
    s.night.events.push('The Scratcher got in. ' + why);
    sc.stage = 'none';
    g.save('event');
  }
  N.brace = function (did) {
    const s = st(), sc = s.night.sc, g = G();
    if (!(sc.stage === 'door' && sc.door === did)) return g.msg('Nothing presses against the door now.');
    s.player.stamina = Math.max(0, s.player.stamina - 35);
    const d = s.cabin.doors[did]; d.hp = Math.max(1, d.hp - 4);
    sc.stage = 'none';
    g.sfx('roar', { vol: 0.6 }); g.shake = 4;
    g.msg('You throw your weight against the door. A furious howl — then claws retreating into the dark.');
    NW.Events.unlockRule('scratcher', 2);
    s.stats.scRepelled = (s.stats.scRepelled || 0) + 1;
    g.save('event');
  };

  // ---- Siphon
  N.siphonStart = function () {
    const s = st(), si = s.night.si, g = G();
    si.stage = 'roof'; si.t = 0; si.offT = 0; si.snd = 0;
    g.sfxCabin('thud', 'roof', { vol: 1 }); g.sfxCabin('roofscrape', 'roof', { vol: 0.9, delay: 0.5 });
    g.msg('Something heavy lands on the roof and scrapes toward the chimney. The fire gutters.', 'danger');
    g.journalOnce('si_first', 'Something clung to the chimney. The fire drank wood three times as fast and gave no heat.', 'sightings');
    NW.Events.unlockRule('siphon', 0); NW.Events.unlockRule('siphon', 1);
  };
  function updateSiphon(dt) {
    const s = st(), si = s.night.si, g = G();
    if (si.stage !== 'roof') return;
    si.t += dt; si.snd -= dt;
    if (si.snd <= 0) { si.snd = U.rand(5, 9); g.sfxCabin(Math.random() < 0.5 ? 'roofscrape' : 'creak', 'roof', { vol: 0.7 }); }
    if (!NW.Survival.stoveLit()) si.offT += dt; else si.offT = 0;
    if (si.offT >= 12) { si.stage = 'none'; g.msg('Finding nothing to drink, the thing on the roof scrabbles away.'); NW.Events.unlockRule('siphon', 3); }
    else if (si.t >= 150) { si.stage = 'none'; g.msg('The scraping on the roof stops. The fire breathes again.'); }
  }
  N.smokeweed = function () {
    const s = st(), g = G();
    g.sfx('fireup');
    if (s.night.si.stage === 'roof') {
      s.night.si.stage = 'none';
      g.sfxCabin('shriek', 'roof', { vol: 0.8 });
      g.msg('Acrid smoke pours up the chimney. A shriek — and something flees the roof.', 'good');
      NW.Events.unlockRule('siphon', 2);
      s.stats.siRepelled = (s.stats.siRepelled || 0) + 1;
    } else g.msg('Thick, bitter smoke curls up the chimney.');
  };

  // ---- Visitors at the door
  N.arrive = function (vid) {
    const s = st(), g = G(), v = s.visitors[vid];
    s.night.vis = { vid, t: 0, knock: 12, patience: NW.Hooks.filter('visitorPatience', (v.night <= 3 ? 85 : 70) * g.modeVal('patience', 1), v) };
    v.arrivedMin = s.time.min;
    NW.Hooks.emit('visitorArrive', v);
    g.sfxCabin('knock', 'door:front', { count: 3 });
    g.warn('SOMEONE IS KNOCKING AT THE FRONT DOOR');
    NW.Events.dogReact(v.mimic ? 'mimic' : 'visitor');
    g.journalOnce('vis_first', 'A visitor came to the door at night. Look through the peephole, ask questions, check the records at the desk before opening.', 'notes');
    g.save('event');
  };
  function updateVisitor(dt) {
    const s = st(), vs = s.night.vis, g = G();
    if (!vs) return;
    vs.t += dt; vs.knock -= dt;
    const v = s.visitors[vs.vid];
    if (vs.knock <= 0) {
      vs.knock = U.rand(12, 18);
      g.sfxCabin('knock', 'door:front', { count: v.mimic ? 4 : 2 + Math.floor(Math.random() * 2) });
      const calls = v.mimic ? ['"Let me in. Please. Let me in."', '"I can see your light. I know you\'re there."', '"It\'s cold. Open the door."'] : ['"Hello? Please — is anyone there?"', '"Ranger? Please, I need help!"', '"I can see your light! Please!"'];
      if (g.area.kind === 'room') g.msg('A voice at the front door: ' + U.pick(calls));
    }
    if (vs.t >= vs.patience) {
      v.outcome = 'ignored';
      s.night.vis = null;
      NW.Hooks.emit('visitorRefused', v);
      g.msg('The knocking stops. Footsteps crunch away from the door.');
      g.closeUI(['peephole', 'talk']);
      g.save('event');
    }
  }
  N.openForVisitor = function () {
    const s = st(), g = G(), vs = s.night.vis;
    if (!vs) return;
    const v = s.visitors[vs.vid];
    s.night.vis = null;
    g.closeUI(['peephole', 'talk']);
    const d = s.cabin.doors.front;
    g.sfxCabin('door', 'door:front'); g.swingDoor('front');
    if (v.mimic) {
      v.outcome = 'opened'; v.revealed = true;
      g.openUI('reveal', v.id);
      g.sfx('scream', { vol: 1 });
      NW.Survival.damage(38, 'mimic');
      d.open = true; if (Math.random() < 0.5) d.lockBroken = true; d.locked = false;
      NW.Events.unlockRule('mimic', 0); NW.Events.unlockRule('mimic', 5);
      s.night.events.push('You opened the door to "' + v.name + '". It was a Mimic.');
      g.journal('The visitor calling themselves ' + v.name + ' was a Mimic. It did not breathe like a person. Its face split open when the door opened.', 'visitors');
      NW.Hooks.emit('visitorOpened', v);
    } else {
      v.outcome = 'sheltered';
      d.open = false; d.locked = false;
      s.guests.push({ vid: v.id, satisfied: v.need === 'warmth', x: 0, y: 0 });
      g.msg(v.name + ' stumbles inside, shaking with cold. "Thank you. Thank you."', 'good');
      if (v.need !== 'warmth') g.msg(v.name + ' needs ' + (v.need === 'food' ? 'food' : 'medicine') + '. Talk to them inside.');
      g.msg('Remember to lock the front door again.', 'warn');
      s.stats.helped = (s.stats.helped || 0) + 1;
      s.night.events.push('You sheltered ' + v.name + '.');
      NW.Hooks.emit('visitorOpened', v);
    }
    g.save('event');
  };
  N.refuseVisitor = function () {
    const s = st(), g = G(), vs = s.night.vis;
    if (!vs) return;
    const v = s.visitors[vs.vid];
    v.outcome = 'refused';
    s.night.vis = null;
    g.closeUI(['peephole', 'talk']);
    if (v.mimic) {
      g.msg('"' + U.pick(["You'll open the door eventually.", 'I can wait. I can wait so long.', 'Your light is so warm.']) + '" The voice is wrong now. Then silence.', 'warn');
      g.sfxCabin('scratch', 'door:front', { vol: 0.4 });
    } else g.msg('"Please... please." Footsteps stumble away into the dark.');
    NW.Hooks.emit('visitorRefused', v);
    g.save('event');
  };

  // ---- Guests inside
  N.guestActions = function (gst) {
    const s = st(), g = G(), v = s.visitors[gst.vid];
    const a = [{ label: 'Talk', run: () => g.showText(v.name, gst.satisfied ? '"I owe you my life, ranger. At first light I\'ll head for the trailhead."' : v.need === 'food' ? '"Do you have anything to eat? Anything at all..."' : v.need === 'medicine' ? '"It hurts. Do you have medicine, a bandage, anything?"' : '"Just let me sit by the fire."') }];
    if (!gst.satisfied && v.need === 'food') {
      const f = I.bestOf(s.inv, D.FOOD_ORDER);
      a.push({ label: f ? 'Give ' + D.ITEMS[f].name : 'Give food (none)', disabled: f ? false : 'No food', run: () => { I.remove(s.inv, f, 1); gst.satisfied = true; g.msg(v.name + ' eats ravenously. "Thank you."', 'good'); } });
    }
    if (!gst.satisfied && v.need === 'medicine') {
      const m = I.bestOf(s.inv, ['bandage', 'poultice', 'tonic', 'medkit']);
      a.push({ label: m ? 'Give ' + D.ITEMS[m].name : 'Give medicine (none)', disabled: m ? false : 'No medicine', run: () => { I.remove(s.inv, m, 1); gst.satisfied = true; g.msg('You tend to ' + v.name + '. They relax a little.', 'good'); } });
    }
    return a;
  };

  // ---- Pale Stag (outdoors after dark)
  N.updateStag = function (dt) {
    const s = st(), g = G(), sg = s.night.stag;
    const outdoors = g.area.kind === 'forest';
    const dark = NW.Survival.isNight() || s.time.min >= D.NIGHT_START - 20;
    if (!outdoors || !dark || s.night.n < 2 || !s.night.active && s.time.min < D.DUSK) {
      if (sg.stage !== 'none' || sg.t > 0) { sg.stage = 'none'; sg.t = 0; }
      return;
    }
    const p = s.player;
    if (g.area.id === 'f_2_2') {
      sg.t = Math.max(0, sg.t - 2 * dt);
      if (sg.stage === 'hunting' || sg.stage === 'watching') { sg.stage = 'none'; g.msg('The bells stop at the edge of the clearing.'); }
      return;
    }
    sg.t += dt; sg.snd -= dt;
    if (sg.area !== g.area.id && sg.stage !== 'none') { sg.stage = 'none'; sg.t = Math.min(sg.t, 20); }
    if (sg.stage === 'none') {
      if (sg.t > 10 && sg.snd <= 0) { sg.snd = 8; g.sfx('bell', { vol: 0.25, pan: U.rand(-1, 1), wet: 0.8 }); if (!sg.warned) { sg.warned = true; g.msg('Bells, somewhere in the trees. Something has your scent. Get to the cabin clearing.', 'danger'); NW.Events.unlockRule('stag', 0); } }
      if (sg.t > 22) {
        sg.stage = 'watching'; sg.area = g.area.id; sg.t2 = 0;
        const corners = [[30, 30], [450, 30], [30, 240], [450, 240]];
        corners.sort((a, b) => U.dist(b[0], b[1], p.x, p.y) - U.dist(a[0], a[1], p.x, p.y));
        sg.x = corners[0][0]; sg.y = corners[0][1];
        g.sfx('bell', { vol: 0.6, pan: (sg.x - p.x) / 240 });
        g.journalOnce('stag_first', 'A pale shape with antlers of bare branches watched me from the trees after dark. Bells.', 'sightings');
      }
    } else if (sg.stage === 'watching') {
      sg.t2 += dt;
      if (sg.t2 > 4) { sg.stage = 'hunting'; g.warn('RUN'); g.sfx('roar', { vol: 0.5 }); NW.Events.unlockRule('stag', 1); }
    } else if (sg.stage === 'hunting') {
      const dx = p.x - sg.x, dy = p.y - 6 - sg.y, d = Math.hypot(dx, dy);
      const sp = 64 * dt;
      if (d > 1) { sg.x += dx / d * sp; sg.y += dy / d * sp; }
      if (sg.snd <= 0) { sg.snd = 1.4; g.sfx('bell', { vol: 0.5, pan: U.clamp(-dx / 240, -1, 1) }); }
      if (d < 12) {
        NW.Survival.damage(40, 'stag'); g.flash = 0.8; g.sfx('roar', { vol: 1 });
        sg.stage = 'none'; sg.t = 8;
        NW.Events.unlockRule('stag', 2);
        g.msg('It struck you and melted back into the dark. RUN for the cabin.', 'danger');
      }
    }
  };

  // ---- Night lifecycle
  N.begin = function () {
    const s = st(), g = G();
    const n = s.time.day;
    s.night = N.newNight();
    s.night.n = n; s.night.active = true;
    s.night.plan = N.genPlan(n);
    NW.Weather.setTarget('night');
    g.warn(s.night.plan.final ? 'THE LAST NIGHT — SURVIVE UNTIL SUNRISE' : 'NIGHT ' + n + (n > g.finalNight() ? ' (ENDLESS)' : '') + ' — SURVIVE UNTIL SUNRISE');
    g.sfx('sting', { vol: 0.35 });
    const intro = {
      1: 'Night 1 is quiet. Keep the stove fed, stay warm, and learn the cabin.',
      2: 'Tonight something may be drawn to light escaping the cabin. Curtains, shutters and a lower fire keep it in.',
      3: 'People may come to the door tonight. Not all of them will be people. Use the peephole, ask questions, check the desk.',
      4: 'Lock both doors tonight. Listen for claws, and check the doors are sound.',
      5: 'The dark rooms feel wrong tonight. Keep the room you are in lit.',
      6: 'If the fire starts drinking wood and giving no heat, look to the chimney. Smokeweed helps.',
    }[n];
    if (intro) g.msg(intro, n === 1 ? 'good' : 'warn');
    NW.Hooks.emit('nightBegin', n, s.night.plan);
    g.save('dusk');
  };

  N.end = function () {
    const s = st(), g = G();
    const n = s.night;
    if (!n.active) return;
    const lines = [];
    // visitor at door leaves
    if (n.vis) { const v = s.visitors[n.vis.vid]; v.outcome = 'ignored'; n.vis = null; }
    g.closeUI(['peephole', 'talk']);
    // resolve all of tonight's visitors
    Object.values(s.visitors).filter((v) => v.night === n.n && v.outcome).forEach((v) => {
      v.revealed = true;
      const r = NW.Events.resolveVisitor(v);
      if (r) lines.push(r);
      NW.Hooks.emit('visitorResolved', v, r);
    });
    // guests leave with rewards
    s.guests.forEach((gst) => {
      const v = s.visitors[gst.vid];
      const sat = gst.satisfied && (v.need !== 'warmth' || s.cabin.heat > 5);
      if (sat) {
        const rnd = U.rng(U.hash(s.seed, n.n, U.strHash(v.id)));
        const pool = ['ammo', 'nails', 'cloth', 'canned', 'glass', 'medkit', 'rope', 'scrap', 'oil'];
        const got = [];
        const nItems = Math.max(2, Math.round(3 * g.modeVal('loot', 1)));
        for (let i = 0; i < nItems; i++) { const id = pool[Math.floor(rnd() * pool.length)]; const q = D.LOOT_QTY[id] || [1, 1]; const k = q[0] + Math.floor(rnd() * (q[1] - q[0] + 1)); I.add(s.chest, id, k); got.push(k + ' ' + D.ITEMS[id].name); }
        s.rep += 1;
        lines.push(v.name + ' left at first light and pressed supplies on you (placed in your chest): ' + got.join(', ') + '.');
      } else lines.push(v.name + ' left at first light, still weak. They thank you for the shelter.');
      NW.Hooks.emit('guestLeft', v, sat, lines);
    });
    s.guests = [];
    n.events.forEach((e) => lines.unshift(e));
    n.active = false;
    n.lh.stage = 'away'; n.sc.stage = 'none'; n.si.stage = 'none';
    s.nightsSurvived = Math.max(s.nightsSurvived, n.n);
    NW.Hooks.emit('nightEnd', n.n, lines);
    s.lastSummary = { night: n.n, lines };
    return lines;
  };
})(window.NW);
