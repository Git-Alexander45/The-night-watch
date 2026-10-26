'use strict';
// Finale: "The Long Night" set-piece on the last night, the endings, and the ranger's log of the watch.
(function (NW) {
  const U = NW.U, D = NW.D, S = NW.S, I = NW.Inv, H = NW.Hooks, UI = NW.UI;
  const P = S.P, R = S.R;
  const G = () => NW.G;
  const st = () => NW.G.state;
  const FL = NW.Finale = {};
  const WIN = ['w_front_l', 'w_front_r', 'w_bed', 'w_office', 'w_storage'];

  const mod = () => NW.mod('finale', () => ({ relief: null, visitor: null, started: false, call: false, conv: null, held: [], cracked: [], sigCall: false, rotors: false, signal: null, flare: null, danger: 0, dangerT: 0, warned: false, hurt: false, ending: null }));
  FL.state = mod;
  // Endings and the set-piece belong to modes with endings (Easy keeps the core ending)
  const on = () => { const s = st(); return !!(s && s.mode && s.mode.endings !== false); };
  const finalNight = () => { const s = st(); return !!(s && on() && s.night && s.night.active && s.night.plan && s.night.plan.final); };
  FL.active = finalNight;
  const safe = (fn) => { try { return fn(); } catch (e) { console.error(e); return null; } };
  const chars = () => (NW.Characters && NW.Characters.summary ? safe(() => NW.Characters.summary()) : null);
  const missions = () => (NW.Missions && NW.Missions.summary ? safe(() => NW.Missions.summary()) : null);
  const isChar = (v) => !!(v && (v.charId || v.char || v.character));
  const list = (a) => (a.length <= 1 ? a[0] || '' : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  const names = (vs, max) => { const u = Array.from(new Set(vs.map((v) => v.name))); max = max || 4; return list(u.length > max ? u.slice(0, max - 1).concat([(u.length - max + 1) + ' others']) : u); };
  const winName = (w) => (NW.Cabin.WINDOW_NAMES[w] || 'window').toLowerCase();

  // ------------------------------------------------------------- items
  D.ITEMS.signal_flare = D.ITEMS.signal_flare || { name: 'Signal Flare', stack: 3, kind: 'tool', desc: 'A red road flare. Burns bright and hot for twenty minutes. Base wants it lit in front of the porch at first light.' };
  S.registerIcon('signal_flare', (g) => {
    g.save(); g.translate(8, 8); g.rotate(-0.6); g.translate(-8, -8);
    R(g, P.r1, 3, 6, 10, 4); R(g, P.r2, 3, 6, 10, 1); R(g, P.r3, 4, 6, 3, 1);
    R(g, P.y1, 5, 6, 1, 4); R(g, P.i2, 13, 6, 2, 4); R(g, P.i3, 13, 6, 2, 1);
    R(g, P.ink, 1, 7, 2, 2); R(g, P.bone, 9, 7, 2, 2);
    g.restore();
  });
  D.DEATH.finale_flare = D.DEATH.finale_flare || { title: 'Caught in the Red Light', text: 'You lit the signal flare and stayed out in its glare. On the last night the bells came right to the edge of the clearing. Strike the flare, then get back behind the door before the bells arrive.' };

  // A deterministic name for the relief ranger Base sends (named in the radio calls)
  function reliefName(r) {
    const s = st(); const taken = new Set(s.records.permits.map((p) => p.name).concat(Object.values(s.visitors).map((v) => v.name)));
    let n = '';
    for (let i = 0; i < 30; i++) { n = D.FIRST[Math.floor(r() * D.FIRST.length)] + ' ' + D.LAST[Math.floor(r() * D.LAST.length)]; if (!taken.has(n)) break; }
    return n;
  }
  function relief() { const f = mod(); if (!f.relief) f.relief = reliefName(U.rng(U.hash(st().seed, 7171))); return f.relief; }
  FL.relief = relief;
  // the flare lives in the storage chest from dusk of the last night
  function ensureFlare() {
    const s = st();
    if (I.count(s.inv, 'signal_flare') + I.count(s.chest, 'signal_flare') > 0) return;
    if (I.add(s.chest, 'signal_flare', 1) > 0 && I.add(s.inv, 'signal_flare', 1) > 0) s.drops.push({ area: 'room_storage', x: 64, y: 72, id: 'signal_flare', n: 1 });
  }

  // ------------------------------------------------------------ the plan
  let building = null;
  H.on('nightPlan', (p, n) => {
    if (!p || !p.final || !on()) return;
    const s = st(), f = mod();
    const r = U.rng(U.hash(s.seed, n, 7707));
    const at = (lo, hi) => Math.floor(lo + r() * (hi - lo));
    relief();
    const conv = at(320, 350);
    p.finale = { conv, sig: 560, rotors: 590 };
    // our own Base calls replace the usual evening report; the numbers station keeps quiet
    p.radio = p.radio.filter((x) => x.kind !== 'evening' && x.kind !== 'numbers');
    // a hard but fair mix: one plain visitor fewer, at most two scratchers, one siphon, one phantom knock
    const plain = p.visitors.filter((x) => !isChar(s.visitors[x.vid]));
    if (p.visitors.length >= 2 && plain.length) {
      const drop = plain[plain.length - 1], dv = s.visitors[drop.vid];
      p.visitors.splice(p.visitors.indexOf(drop), 1);
      p.radio = p.radio.filter((x) => !(x.kind === 'fake' && x.vid === drop.vid));
      if (dv && !dv.mimic && dv.permit) { const pm = s.records.permits.find((q) => q.name === dv.name); if (pm) pm.met = false; }
      delete s.visitors[drop.vid];
    }
    // nobody knocks while the forest is silent
    const span = (conv - 140) / Math.max(1, p.visitors.length);
    p.visitors.sort((a, b) => a.at - b.at).forEach((x, i) => { x.at = Math.floor(80 + span * i + r() * span * 0.4); });
    p.radio.forEach((x) => { if (x.kind === 'fake') { const v = p.visitors.find((q) => q.vid === x.vid); if (v) x.at = Math.max(40, v.at - 50); } });
    p.scratcher = p.scratcher.slice(0, 2);
    if (p.scratcher.length) p.scratcher[p.scratcher.length - 1].at = conv + 70; // claws, right after the windows
    p.siphon = p.siphon.slice(0, 1);
    p.phantom = p.phantom.slice(0, 1);
    // the last visitor of the watch
    const mimic = r() < 0.5;
    building = { r };
    let vid = null;
    try { vid = NW.Night.genVisitor(n, mimic, r); } finally { building = null; }
    p.visitors.push({ at: at(420, 470), vid });
    p.visitors.sort((a, b) => a.at - b.at);
    f.visitor = vid;
    return p;
  });

  // Dress the last visitor: a face the ranger knows if the Characters module has one, else "the relief ranger"
  H.on('visitor', (v, ctx) => {
    if (!building) return;
    v.finale = true;
    if (isChar(v)) return v;
    const s = st(), cs = chars();
    const known = cs && Array.isArray(cs.list) ? cs.list.filter((c) => c && c.name && c.fate && c.fate !== 'unmet' && !Object.values(s.visitors).some((x) => x.name === c.name && x.night === ctx.night)) : [];
    const pick = (fates) => { const l = known.filter((c) => fates.includes(c.fate)); return l.length ? l[Math.floor(building.r() * l.length)] : null; };
    const c = v.mimic ? pick(['safe', 'dead', 'taken']) : pick(['alive', 'missing']);
    const rename = (name) => {
      if (v.permit) { const pm = s.records.permits.find((q) => q.name === v.name); if (pm) pm.met = false; }
      v.name = name; v.permit = false; v.party = 1;
      v.tells = v.tells.filter((t) => t !== 'checkedout' && t !== 'repeat');
      if (v.mimic && !v.tells.includes('nobreath')) v.tells.push('nobreath');
    };
    if (c) { rename(c.name); v.charId = c.id; v.finaleFate = c.fate; if (v.mimic) v.tactic = 'character'; if (c.app && typeof c.app === 'object') Object.assign(v.app, c.app); }
    else if (v.mimic) { rename(relief()); v.tactic = 'relief'; }
    return v;
  });
  H.on('visitorAnswer', (a, v, q) => {
    if (!v || !v.finale) return;
    if (v.tactic === 'relief') {
      if (q === 'who') return 'Ranger ' + v.name + '. Base sent me up the trail ahead of the helicopter.';
      if (q === 'where') return 'Up the road from the trailhead. They dropped me at the washout and I walked the rest.';
      if (q === 'what') return "The helicopter can't land in this fog. Base sent me on foot. Open up and we'll wait for it together.";
    }
    if (v.charId && q === 'who') return "It's me. " + v.name + '. You know me, ranger. Please.';
  });

  // ---------------------------------------------------------- the night
  function start(n) {
    const f = mod(), g = G();
    if (f.started) return;
    f.started = true;
    ensureFlare();
    g.sfx('finale_sting', { vol: 0.8 });
    g.msg('The last night. Relief comes at first light — if you are here to meet it.', 'warn');
    g.journal('Night ' + n + '. The last one. Base says relief comes at first light.', 'notes');
    H.emit('finaleStart', n);
  }
  H.on('nightBegin', (n, plan) => { if (plan && plan.final && on()) start(n); });

  function eveningCall() {
    const s = st(), fc = s.forecast && s.forecast.night;
    const wx = fc && NW.Weather.INFO[fc.type] ? NW.Weather.INFO[fc.type].label.toLowerCase() + ', low of ' + fc.temp + '°C' : 'cold';
    NW.Events.radio('base', 'Base to Watch Seven. Last night of your rotation, ranger. Tonight: ' + wx + '. Relief flies at first light — Ranger ' + relief() + ' is on the helicopter. Nobody is walking up that trail tonight. Anyone who says Base sent them on foot is lying. Your signal flare is in the storage chest. Keep it dry. Base out.', { phrase: 'relief flies at first light' });
    G().journal('Base: relief flies at first light. Ranger ' + relief() + ' is on the helicopter. Nobody walks up the trail tonight.', 'notes');
  }
  function signalCall() {
    const g = G();
    ensureFlare();
    NW.Events.radio('base', "Base to Watch Seven. Relief is in the air. Fog is down on the ridge and the pilot can't find your clearing. When you hear rotors, get a flare burning in front of the porch and he'll set down on it. If it isn't safe out there, stay inside. The truck comes up the road when the fog lifts. Your call, ranger. Base out.", { phrase: 'get a flare burning in front of the porch' });
    g.warn('BASE IS CALLING ON THE RADIO');
    g.sfx('radio_chirp', { vol: 0.6 });
    g.journal('Base wants a flare burning in front of the porch when the rotors come. Or I stay inside and wait for the truck.', 'notes');
  }

  // The convergence: the forest goes silent and something makes the rounds of every window
  function convergence(dt, nm, p, f) {
    const s = st(), g = G(), n = s.night;
    if (!f.conv && nm >= p.finale.conv) {
      const order = WIN.slice(); U.shuffle(order, U.rng(U.hash(s.seed, n.n, 3131)));
      f.conv = { stage: 'silence', t: 0, i: 0, order };
      g.warn('THE FOREST HAS GONE SILENT');
      g.msg('The wind drops. The owls stop. Every sound outside the cabin stops at once.', 'danger');
      g.sfx('finale_sting', { vol: 0.45 });
      NW.Events.dogReact('monster');
    }
    const cv = f.conv;
    if (!cv || cv.stage === 'done') return;
    cv.t += dt;
    if (n.lh.stage !== 'window') n.lh.cool = Math.max(n.lh.cool, 2); // the Light Hunter is the one making the rounds
    if (cv.stage === 'silence') {
      if (cv.t >= 9) { cv.stage = 'test'; cv.t = 2.5; g.msg('Tap. Tap. Something is trying the windows, one by one. Keep the light in.', 'danger'); }
      return;
    }
    if (cv.t < 4) return;
    cv.t = 0;
    if (cv.i >= cv.order.length) {
      cv.stage = 'done';
      g.msg('The tapping stops. Slowly, the wind comes back.', f.cracked.length ? 'warn' : 'good');
      g.sfx('wind_high', { vol: 0.6 });
      n.events.push(f.cracked.length ? 'When the forest went silent, something found light at the ' + list(f.cracked.map(winName)) + '.' : 'When the forest went silent, something tried every window. Not one gave it light.');
      if (f.cracked.length && n.plan.lhSens > 0) n.lh.interest = Math.min(90, n.lh.interest + 20 * f.cracked.length);
      g.save('event');
      return;
    }
    const wid = cv.order[cv.i++], w = s.cabin.windows[wid];
    if (!w || (n.lh.stage === 'window' && n.lh.wid === wid)) return;
    const leak = NW.Survival.light.winLeak[wid] || 0;
    if (w.boarded > 0 || (w.shutClosed && w.shutter > 0) || leak <= 0.12) {
      f.held.push(wid);
      g.sfxCabin('glasstap', 'win:' + wid, { vol: 0.7 });
      g.msg('Something taps at the ' + winName(wid) + '... and moves on.');
    } else {
      f.cracked.push(wid);
      w.glass = Math.max(Math.min(w.glass, 10), w.glass - 30);
      g.sfxCabin('glasscrack', 'win:' + wid, { vol: 1 }); g.shake = 2;
      g.msg('Light at the ' + winName(wid) + ' — something leans on the glass. It cracks.', 'danger');
    }
  }

  // The choice before dawn: light the flare on the porch, or stay inside
  FL.canLight = function () {
    const s = st(), f = mod(), g = G();
    if (!finalNight() || !f.sigCall || f.signal) return 'Not now.';
    if (I.count(s.inv, 'signal_flare') <= 0) return 'No flare in your pack — it is in the storage chest';
    if (!f.rotors) return 'Wait for the rotors';
    if (g.area.id !== 'f_2_2' || U.dist(s.player.x, s.player.y, 240, 196) > 90) return 'Light it in front of the porch, where the pilot can see';
    return true;
  };
  FL.lightFlare = function () {
    const s = st(), f = mod(), g = G(), why = FL.canLight();
    if (why !== true) { g.msg(why + '.', 'warn'); return false; }
    I.remove(s.inv, 'signal_flare', 1);
    const p = s.player, side = p.dir === 'left' ? -1 : p.dir === 'right' ? 1 : p.x < 240 ? -1 : 1;
    // planted in the snow beside the ranger, off the porch steps
    f.signal = 'lit'; f.flare = { x: Math.round(U.clamp(p.x + side * 16, 150, 330)), y: Math.round(U.clamp(p.y + 8, 200, 250)), min: Math.floor(s.time.min) };
    f.danger = 10; f.dangerT = 0; f.warned = false;
    g.sfx('flare', { vol: 0.9 }); g.flash = 0.25;
    g.msg('The flare spits and catches. Red light floods the clearing.', 'good');
    g.journal('Lit the flare in front of the porch at ' + U.fmtClock(s.time.min) + '. Rotors somewhere above the fog.', 'notes');
    s.night.events.push('Before dawn you went out and lit a flare in front of the porch.');
    g.save('event');
    return true;
  };
  function danger(dt, f) {
    const g = G();
    f.dangerT += dt;
    if (!f.warned && f.dangerT > 1.5) { f.warned = true; g.warn('BELLS AT THE TREELINE — GET INSIDE'); g.sfx('bell_toll', { vol: 0.8 }); g.sfx('bell', { vol: 0.5, wet: 0.8 }); }
    if (f.dangerT < f.danger) return;
    f.danger = 0;
    if (g.area.id === 'f_2_2') { f.hurt = true; NW.Survival.damage(34, 'finale_flare'); g.flash = 0.6; g.msg('Antlers out of the red glare — a blow — then only bells, fading into the fog.', 'danger'); st().night.events.push('Something with bells struck you in the light of the flare.'); }
    else g.msg('Through the walls you hear bells circle the flare once, and fade into the fog.');
  }

  H.on('update', (dt) => {
    if (!finalNight()) return;
    const s = st(), p = s.night.plan, f = mod(), g = G(), nm = NW.Night.nightMin();
    if (!p.finale) p.finale = { conv: 330, sig: 560, rotors: 590 }; // a last night planned before this module existed
    if (!f.started) start(s.night.n);
    if (!f.call && nm >= 30) { f.call = true; eveningCall(); }
    convergence(dt, nm, p, f);
    if (!f.sigCall && nm >= p.finale.sig) { f.sigCall = true; signalCall(); }
    if (!f.rotors && nm >= p.finale.rotors) { f.rotors = true; g.sfx('helicopter', { vol: 0.3, wet: 0.9 }); g.msg('Rotors — far off, somewhere above the fog.', 'radio'); }
    if (f.danger > 0) danger(dt, f);
  });

  H.on('actions', (acts, o, a) => {
    if (!o || o.type !== 'extdoor' || o.door !== 'front' || !a || a.id !== 'f_2_2' || !finalNight()) return;
    const f = mod(); if (!f.sigCall || f.signal) return;
    const why = FL.canLight();
    return acts.concat([{ label: 'Light the signal flare', time: 2, danger: true, disabled: why === true ? false : why, done: () => FL.lightFlare() }]);
  });
  H.on('itemUsable', (v, id) => (id === 'signal_flare' ? 'Light flare' : undefined));
  H.on('useItem', (v, id) => { if (id !== 'signal_flare') return; if (FL.lightFlare()) UI.close('inv'); return true; });

  H.on('nightEnd', (n, lines) => {
    if (n !== G().finalNight() || !on()) return;
    const f = mod();
    if (!f.signal) f.signal = 'stayed';
    lines.push(f.signal === 'lit' ? 'At first light a helicopter dropped out of the fog onto your flare.' : 'You stayed behind the door. The fog held until noon, and the relief truck came up the road.');
  });
  H.on('dawn', (n) => {
    if (n !== G().finalNight() || !on()) return;
    G().sfx(mod().signal === 'lit' ? 'helicopter' : 'truck', { vol: 0.9 });
  });

  // ------------------------------------------------------------ drawing
  const flareSprite = () => S.cached('fi_flare', () => S.mk(8, 14, (g) => {
    R(g, 'rgba(0,0,0,0.35)', 0, 12, 8, 2);
    R(g, P.r1, 3, 4, 2, 9); R(g, P.r2, 3, 4, 1, 9); R(g, P.y1, 3, 8, 2, 1);
    R(g, P.sn2, 1, 12, 6, 1); R(g, P.sn3, 2, 11, 4, 1);
  }));
  H.on('drawWorld', (g, a, t) => {
    if (a.id !== 'f_2_2') return;
    const f = st().mods && st().mods.finale;
    if (!f || !f.flare || !finalNight()) return;
    const x = f.flare.x, y = f.flare.y;
    // the pale thing at the treeline while the flare draws it in
    if (f.danger > 0 && f.warned) {
      const k = U.clamp((f.dangerT - 1.5) / (f.danger - 1.5), 0, 1);
      S.stag(g, U.lerp(x + 170, x + 44, k), U.lerp(266, y + 22, k), t, 0.45 + 0.45 * k);
    }
    // smoke, stick, burning head, sparks
    for (let i = 0; i < 5; i++) { const ph = (t * 0.5 + i / 5) % 1; g.fillStyle = 'rgba(160,120,120,' + (0.28 * (1 - ph)).toFixed(3) + ')'; g.fillRect(Math.round(x - 1 + Math.sin(t * 1.3 + i) * 3 * ph + ph * 6), Math.round(y - 14 - ph * 30), 2 + Math.round(ph * 4), 2 + Math.round(ph * 3)); }
    g.drawImage(flareSprite(), x - 4, y - 12);
    const fl = Math.sin(t * 31) > 0;
    R(g, P.f4, x - 1, y - 11, 2, 2); R(g, P.white, x - 1 + (fl ? 1 : 0), y - 12, 1, 1);
    R(g, fl ? P.r3 : P.f2, x - 2, y - 10, 1, 1); R(g, fl ? P.f2 : P.r3, x + 1, y - 10, 1, 1);
    for (let i = 0; i < 4; i++) { const ph = (t * 2.3 + i * 0.27) % 1; R(g, ph < 0.5 ? P.f4 : P.f2, x + Math.round(Math.sin(i * 7.1 + t) * 5 * ph), y - 11 - Math.round(ph * 9) + Math.round(ph * ph * 10), 1, 1); }
  });
  H.on('lights', (a, t) => {
    if (a.id !== 'f_2_2') return;
    const f = st().mods && st().mods.finale;
    if (!f || !f.flare || !finalNight()) return;
    const fl = 1 + Math.sin(t * 17) * 0.05 + Math.sin(t * 5.3) * 0.06;
    return [{ x: f.flare.x, y: f.flare.y - 10, r: 140 * fl, a: 0.95, col: '#ff4a2a', ga: 0.8 }, { x: f.flare.x, y: f.flare.y - 10, r: 34 * fl, a: 1, col: P.f3, ga: 0.5 }];
  });

  // ------------------------------------------------- HUD, music, deaths
  H.on('objectives', (obj) => {
    if (!finalNight()) return;
    const s = st(), f = mod(), items = [];
    if (f.signal === 'lit') items.push(f.danger > 0 ? 'Get back inside. Now.' : 'Hold the cabin until first light');
    else if (f.sigCall) items.push(I.count(s.inv, 'signal_flare') > 0 ? (f.rotors ? 'Light the flare in front of the porch — or stay inside' : 'Wait for the rotors. Then decide: flare on the porch, or stay inside') : 'Fetch the flare from the storage chest — or stay inside');
    else items.push('Hold the cabin until first light (06:00)');
    if (f.conv && f.conv.stage !== 'done') items.push('Keep the light in. Every window.');
    return { title: 'The Long Night', items: items.concat(obj && obj.items ? obj.items : []).slice(0, 4) };
  });
  H.on('music', (m) => {
    if (UI.isOpen('ending')) { const f = st().mods && st().mods.finale; if (f && f.ending) return f.ending.tone === 'bad' ? 'ending_bad' : 'ending_good'; return; }
    if (m === 'night' && finalNight()) return 'finale';
  });
  H.on('gameoverLines', (s) => {
    if (!s || !s.night || !s.night.active || !s.night.plan || !s.night.plan.final) return;
    const left = Math.max(0, Math.ceil((D.DAWN - s.time.min + (s.time.min >= D.DAWN ? 1440 : 0)) / 60));
    return 'It was the last night. Relief was ' + (left <= 1 ? 'less than an hour' : left + ' hours') + ' away.';
  });

  // ------------------------------------------------------------- endings
  FL.facts = function () {
    const s = st(), f = mod(), N = G().finalNight();
    const vs = Object.values(s.visitors || {});
    const sheltered = vs.filter((v) => !v.mimic && v.outcome === 'sheltered');
    const turned = vs.filter((v) => !v.mimic && (v.outcome === 'refused' || v.outcome === 'ignored'));
    const mimIn = vs.filter((v) => v.mimic && v.outcome === 'opened');
    const mimOut = vs.filter((v) => v.mimic && (v.outcome === 'refused' || v.outcome === 'ignored'));
    const cs = chars(), ms = missions();
    const ups = NW.Upgrades && NW.Upgrades.built ? safe(() => NW.Upgrades.built()) || [] : [];
    const cl = cs && Array.isArray(cs.list) ? cs.list : [];
    return {
      N, sheltered, turned, mimIn,
      helped: Math.max(s.stats.helped || 0, sheltered.length), refused: Math.max(s.stats.genuineRefused || 0, turned.length),
      mimicsIn: mimIn.length, mimicsOut: Math.max(s.stats.mimicsRefused || 0, mimOut.length), rep: s.rep || 0,
      signal: f.signal || 'stayed', hurt: !!f.hurt, fv: f.visitor ? s.visitors[f.visitor] || null : null,
      held: f.held || [], cracked: f.cracked || [], conv: !!(f.conv && f.conv.stage === 'done'),
      ms, cs, ups: Array.isArray(ups) ? ups : [], dog: !!(s.dog && s.dog.status === 'home'),
      saved: cl.filter((c) => c.fate === 'safe').map((c) => c.name), lost: cl.filter((c) => c.fate === 'dead' || c.fate === 'taken' || c.fate === 'missing').map((c) => c.name),
    };
  };
  // Thresholds scale with the length of the watch
  FL.choose = function (x) {
    const minHelp = Math.max(1, Math.round(x.N / 4)), badMimic = Math.max(2, Math.ceil(x.N / 6));
    const frac = x.helped / Math.max(1, x.helped + x.refused);
    const msOk = !x.ms || !x.ms.total || (x.ms.done >= Math.ceil(x.ms.total / 2) && (x.ms.failed || 0) <= x.ms.done);
    const lost = x.cs ? x.cs.lost || x.lost.length : 0, saved = x.cs ? x.cs.saved || x.saved.length : 0;
    const fvIn = !!(x.fv && x.fv.mimic && x.fv.outcome === 'opened');
    if (x.mimicsIn + (fvIn ? 1 : 0) >= badMimic) return 'hollow';
    if ((x.helped === 0 && x.refused >= 1) || (x.refused >= Math.max(2, minHelp) && frac < 0.34) || (x.rep <= -Math.max(2, minHelp) && frac < 0.5)) return 'closed_door';
    if (x.refused === 0 && x.helped >= minHelp && x.mimicsIn === 0 && x.signal === 'lit' && msOk && lost === 0 && x.rep >= minHelp) return 'keeper';
    if (frac >= 0.6 && x.helped >= minHelp && x.mimicsIn === 0 && x.rep >= 0 && lost <= Math.max(1, saved)) return 'first_light';
    if (x.mimicsIn >= 1 && x.helped >= 1) return 'open_door';
    return 'long_way';
  };
  const TONE = { keeper: 'good', first_light: 'good', open_door: 'bittersweet', long_way: 'bittersweet', closed_door: 'bad', hollow: 'bad' };
  const TITLE = { keeper: 'Keeper of the Watch', first_light: 'Relief at First Light', open_door: 'The Open Door', long_way: 'The Long Way Down', closed_door: 'The Closed Door', hollow: 'What Walked Out With You' };
  FL.IDS = Object.keys(TITLE);

  function arrival(x) {
    const r = relief();
    return x.signal === 'lit'
      ? 'At first light the fog tore open over the clearing and a helicopter came down onto your flare, rotor wash stripping the snow from the roof. Ranger ' + r + ' was out before the skids touched.' + (x.hurt ? ' You met them with blood frozen in your sleeve.' : '')
      : 'You never went out to the porch. The fog held until noon; then a truck ground up the washed-out road in chains, and Ranger ' + r + ' knocked and said your name. You looked through the peephole for a long time before you opened the door.';
  }
  function lastNight(x) {
    const fv = x.fv, out = [];
    if (fv && fv.outcome) {
      if (!fv.mimic && fv.outcome === 'sheltered') out.push('On the last night ' + fv.name + ' knocked, and you let them in. They rode down the mountain beside you.');
      else if (!fv.mimic) out.push('On the last night ' + fv.name + ' knocked, and you left them out there. That one stays with you.');
      else if (fv.outcome !== 'opened') out.push('On the last night something wearing the name ' + fv.name + ' asked you to open the door. You did not.');
    }
    if (x.conv) out.push(x.cracked.length ? 'When the forest went silent it found light at the ' + list(x.cracked.map(winName)) + ', and the cracks are still there.' : 'When the forest went silent and something tried every window, not one gave it light.');
    return out.join(' ');
  }
  function record(x) {
    const out = [];
    if (x.ms && x.ms.total) out.push("Of HQ's " + x.ms.total + ' orders you carried out ' + x.ms.done + (x.ms.failed ? ' and let ' + x.ms.failed + ' slip' : '') + '.');
    if (x.saved.length) out.push(list(x.saved) + (x.saved.length > 1 ? ' are' : ' is') + ' safe in town.');
    if (x.lost.length) out.push('No one has found ' + list(x.lost) + '.');
    if (x.ups.length >= 2) out.push('The cabin you hand over is stronger than the one you found.');
    if (x.dog) out.push('Juniper rides out on your knees, growling at the treeline until it is gone.');
    return out.join(' ');
  }
  FL.compose = function (id, x) {
    const N = x.N, nights = U.numWord(N), shel = names(x.sheltered), turn = names(x.turned), mims = names(x.mimIn);
    const T = [arrival(x)];
    if (id === 'keeper') {
      T.push('In town they already knew your name. ' + (shel ? shel + ' had told it' : 'People had told it') + ' in the bar, at the clinic, to anyone who would listen: the ranger at Station Seven opens the door.');
      T.push('Not once in ' + nights + ' nights did you leave a living person in the cold. Not once did you open the door to something that only sounded like one.' + (x.mimicsOut ? ' ' + U.numWord(x.mimicsOut, true) + (x.mimicsOut === 1 ? ' time' : ' times') + ' a borrowed voice begged on your porch, and the bolt stayed shut.' : ''));
    } else if (id === 'first_light') {
      T.push((shel || 'The people you sheltered') + ' walked out of these woods because you opened the door.' + (turn ? ' You think about ' + turn + ', too. You always will.' : ''));
      if (x.mimicsOut) T.push('Some of the voices at your door were not people. You heard the difference every time it mattered.');
    } else if (id === 'open_door') {
      T.push('You opened the door to whoever knocked. ' + (shel ? shel + (x.sheltered.length > 1 ? ' are' : ' is') + ' alive because of it.' : 'Some of them were people.'));
      T.push((x.mimicsIn === 1 ? 'But once' : 'But ' + U.numWord(x.mimicsIn) + ' times') + ' the thing on the porch was not a person. You still feel the cold that came in with "' + mims + '", the way the face came apart in the lamplight. The medic counts the scars on your arms and does not ask.');
    } else if (id === 'long_way') {
      T.push(shel ? shel + ' made it out because of you.' + (turn ? ' ' + turn + ' did not get the same chance.' : '') : turn ? 'You kept the door shut on ' + turn + '. Some nights that was right. You will never know which.' : x.mimicsOut ? 'The only things that knocked were not people, and the bolt stayed shut on every one. The forest kept its living to itself this winter.' : 'Hardly anyone came to the door. The forest kept its people to itself this winter.');
      T.push('The log you leave behind is honest: some nights you got it right, some you did not. The ink runs where the snow got in.');
    } else if (id === 'closed_door') {
      T.push('Nothing got in. You made sure of it.' + (x.mimicsOut ? ' The things that knocked went away hungry.' : ''));
      T.push((turn ? 'Search and rescue spent the week following tracks that ended at your door: ' + turn + '.' : 'Search and rescue spent the week in the woods below the station.') + ' Base does not put it in writing. Ranger ' + relief() + ' takes the keys without looking at you.');
    } else if (id === 'hollow') {
      T.push('You let them in. "' + mims + '" — you heard the wrong breath, saw the dry coat, and opened the door anyway.' + (shel ? ' ' + shel + ' got out alive. That was real, too.' : ''));
      T.push(x.signal === 'lit' ? 'As the helicopter lifts off, the pilot keeps glancing back at the cabin. "Thought I saw somebody in your window," he says. "Standing there. Waving."' : 'As the truck pulls away, the driver watches the mirror. "Thought I saw somebody in your window," he says. "Standing there. Waving."');
    }
    const ln = lastNight(x); if (ln && id !== 'hollow') T.push(ln);
    const rc = record(x); if (rc && id !== 'hollow') T.push(rc);
    T.push({
      keeper: 'In March they ask whether you will take Station Seven again next winter. You look at the treeline for a long time before you say yes.',
      first_light: 'The pilot asks what it was like up there. You tell him it was quiet. Most of it was.',
      open_door: 'Next winter, the new ranger finds a note pinned above the peephole in your handwriting: Look first. Then open.',
      long_way: 'You go down the long way, past the washout, past Crow Creek. You do not look back until the cabin is gone in the trees. Then you do.',
      closed_door: 'You kept the watch for ' + nights + ' nights. Down in town, nobody asks you how.',
      hollow: 'The next ranger finds the stove warm and two cups on the table. Some nights in town you hear knocking, and you do not answer. You are no longer sure which side of the door you are on.',
    }[id]);
    return T.slice(0, 6);
  };
  FL.ending = function () {
    const x = FL.facts(), id = FL.choose(x);
    return { id, title: TITLE[id], text: FL.compose(id, x), tone: TONE[id] };
  };
  H.on('ending', (val, ctx) => {
    if (val || !on() || (ctx && ctx.mode && ctx.mode.endings === false)) return;
    const e = FL.ending();
    mod().ending = { id: e.id, tone: e.tone };
    return e;
  });
  H.on('endingShown', (e) => {
    if (!e || !TONE[e.id]) return;
    mod().ending = { id: e.id, tone: e.tone };
    if (NW.Audio && NW.Audio.setMusic) NW.Audio.setMusic(e.tone === 'bad' ? 'ending_bad' : 'ending_good');
  });

  // ------------------------------------------------- journal: "The watch"
  const entry = (when, text) => '<div class="entry"><div class="when">' + UI.h.esc(when) + '</div>' + text + '</div>';
  FL.logHTML = function (s) {
    const esc = UI.h.esc, N = G().finalNight(), f = (s.mods && s.mods.finale) || {};
    const reached = s.nightsSurvived >= N || !!(s.night.active && s.night.plan && s.night.plan.final);
    if (!reached) return '<div class="hint">This page gets written on the last night of the watch — night ' + N + '.</div>';
    const x = FL.facts(), b = esc, h = [];
    // only what the ranger knows: tonight's visitors are not resolved until dawn
    const turned = x.turned.filter((v) => v.revealed), mOut = Object.values(s.visitors).filter((v) => v.mimic && v.revealed && v.outcome !== 'opened').length;
    h.push('<div class="fi-log"><h3>Station Seven — watch log</h3><div class="hint">' + b((s.mode && s.mode.name) || 'Standard') + ' · ' + N + ' nights · seed ' + b(s.seedText || String(s.seed)) + '</div>');
    h.push(entry('The watch', 'Nights kept: ' + Math.min(s.nightsSurvived, N) + ' of ' + N + '.' + (s.nightsSurvived > N ? ' ' + (s.nightsSurvived - N) + ' more past relief.' : '')));
    h.push(entry('The door', (x.sheltered.length ? 'Let in: ' + b(names(x.sheltered, 8)) + '.' : 'I let no one in.') + (turned.length ? ' Left outside: ' + b(names(turned, 8)) + '.' : '')));
    const mimLine = (mOut ? 'Turned away ' + mOut + ' that were not people.' : '') + (x.mimIn.length ? ' Opened the door to ' + b(names(x.mimIn, 6)) + '. It was not them.' : '');
    if (mimLine) h.push(entry('The others', mimLine.trim()));
    const st2 = s.stats, beasts = [];
    if (st2.lhRepelled) beasts.push('the thing at the windows ' + st2.lhRepelled + '×');
    if (st2.scRepelled) beasts.push('the claws at the door ' + st2.scRepelled + '×');
    if (st2.siRepelled) beasts.push('the thing on the roof ' + st2.siRepelled + '×');
    if (beasts.length) h.push(entry('Driven off', b(list(beasts)) + '.'));
    h.push(entry('The cabin', 'Wood gathered: ' + (st2.wood || 0) + '. Repairs: ' + (st2.repairs || 0) + '.' + (x.ups.length ? ' Improvements built: ' + x.ups.length + '.' : '') + (s.dog ? ' ' + (s.dog.status === 'home' ? 'Juniper sleeps by the stove.' : s.dog.status === 'gone' ? 'Juniper is gone.' : 'Juniper is with me.') : '')));
    if (x.ms && x.ms.total) h.push(entry('HQ orders', 'Carried out ' + x.ms.done + ' of ' + x.ms.total + (x.ms.failed ? ', failed ' + x.ms.failed : '') + '.'));
    if (x.cs && Array.isArray(x.cs.list)) { const met = x.cs.list.filter((c) => c && c.fate && c.fate !== 'unmet'); if (met.length) h.push(entry('People of the forest', met.map((c) => b(c.name) + ' — ' + b({ alive: 'out there', safe: 'safe', missing: 'missing', dead: 'dead', taken: 'taken' }[c.fate] || c.fate)).join('<br>'))); }
    const ln = [];
    if (f.call) ln.push('Base: relief at first light. Ranger ' + b(f.relief || '') + ' on the helicopter.');
    if (f.conv) ln.push(f.conv.stage !== 'done' ? 'The forest has gone silent. Something is trying the windows.' : f.cracked && f.cracked.length ? 'The silence. It found light at the ' + b(list(f.cracked.map(winName))) + '.' : 'The silence. Every window held.');
    const fv = x.fv;
    if (fv && fv.outcome) ln.push(b(fv.name) + ' at the door: ' + ({ sheltered: 'I let them in.', opened: 'I opened the door.', refused: 'I sent them away.', ignored: 'I never answered.' }[fv.outcome] || ''));
    else if (fv && s.night.vis && s.night.vis.vid === fv.id) ln.push('Someone is at the door. ' + b(fv.name) + ', they say.');
    if (f.sigCall) ln.push(f.signal === 'lit' ? 'Lit the flare in front of the porch' + (f.flare ? ' at ' + U.fmtClock(f.flare.min) : '') + '.' + (f.hurt ? ' Paid for it.' : '') : f.signal === 'stayed' ? 'Stayed inside. Waited for the truck.' : 'Base wants a flare on the porch when the rotors come.');
    if (ln.length) h.push(entry('The last night', ln.join('<br>')));
    h.push('</div>');
    return h.join('');
  };
  UI.registerJournalTab('fi_watch', 'The watch', (s) => FL.logHTML(s));
  UI.addStyle('.fi-log h3{margin-top:0}.ending-bad .big-title{color:#e0614a;text-shadow:0 0 14px rgba(200,40,20,0.5),0 3px 0 #000}.ending-bittersweet .big-title{color:#c9d6ea;text-shadow:0 0 12px rgba(150,180,230,0.35),0 3px 0 #000}');
})(window.NW);
