'use strict';
// Recurring characters: a small cast met by day (talk, trade, advice, requests) who come back at night,
// genuinely or wearing a Mimic. Fates are tracked per run; journal "People" tab and desk "Whereabouts".
(function (NW) {
  const U = NW.U, D = NW.D, S = NW.S, I = NW.Inv, H = NW.Hooks, UI = NW.UI;
  const P = S.P, R = S.R;
  const G = () => NW.G;
  const st = () => NW.G.state;
  const C = NW.Characters = {};
  // strangers must never share a name with the cast (a random "Mara Hask" would read as Mara Quill)
  ['Mara', 'Wren', 'Jonah', 'Amos', 'Ray'].forEach((n) => { const i = D.FIRST.indexOf(n); if (i >= 0) D.FIRST.splice(i, 1); });
  ['Garrow', 'Quill', 'Pell', 'Hale'].forEach((n) => { const i = D.LAST.indexOf(n); if (i >= 0) D.LAST.splice(i, 1); });

  const FOOD = ['canned', 'cooked_rabbit', 'cooked_venison', 'roast_mush'];
  const MEDS = ['bandage', 'poultice', 'tonic', 'medkit'];
  const RAW = ['raw_rabbit', 'raw_venison'];
  const ORDER = ['garrow', 'mara', 'pell', 'hale'];

  // ------------------------------------------------------------------ the cast
  const CAST = {
    garrow: {
      name: 'Amos Garrow', short: 'Garrow', role: 'Trapper', home: 'f_0_2', stranger: 'A grizzled trapper',
      app: { skin: P.sk1, hair: P.st3, hairStyle: 'long', hat: 'beanie', hatColor: P.wood3, coat: P.wood2, pants: P.wood1, scarf: null, beard: true, glasses: false, old: true, eyes: P.g3 },
      intro: 'Garrow. I run my lines out of this shack. Did before they put a ranger in that cabin. Thirty winters.',
      greet: ['Ranger.', 'Still breathing. Good.', 'Shut the door, you\'re letting the cold in.'],
      cold: 'You again. Say your piece.',
      advice: [
        { text: 'The dark one. It won\'t touch you in the light. Keep a lamp burning in whatever room you\'re standing in and it sulks in the corners.', rule: ['dweller', 1] },
        { text: 'I don\'t walk at night. Not for anyone. Something knocks with my name after dark, it ain\'t me.', know: 'garrow_night' },
        { text: 'Something claws at doors come midwinter. Put your weight on the door and it quits. Planks and rope make it quit sooner.', rule: ['scratcher', 2] },
        { text: 'Bells in the trees after dark, you run for your clearing. It won\'t cross into it.', rule: ['stag', 1] },
      ],
      trades: [
        { give: RAW, n: 2, what: '2 raw meat', get: { ammo: 6 } },
        { give: ['wood'], n: 3, what: '3 Firewood', get: { smokeweed: 2 } },
      ],
      req: { any: MEDS, n: 1, what: 'a bandage or a poultice', days: 2, reward: { ammo: 6 }, rule: ['scratcher', 3],
        ask: 'My hand. Caught it in a set and it\'s gone hot and swollen. Bring me something for it — a poultice, a bandage — and I\'d be obliged.',
        thanks: 'That\'ll do. That\'ll do fine. Take these, I can\'t sight a rifle with this hand anyway. And reinforce your doors, ranger. Planks, nails, rope.' },
      status: { alive: 'Lines are empty. The animals know something\'s wrong this winter. So do I.', req: 'Hand\'s worse.', safe: 'Hand\'s mending. I\'ll see the spring, I reckon.' },
      story: 'Roof came down on the shack in the wind. I swore I\'d never walk at night. Tonight I had no choice.',
      need: { food: 'Something hot to eat. I\'ve had nothing since the roof fell.', medicine: 'Something for this hand. It\'s gone black at the knuckles.', warmth: 'A spot by your stove till first light. That\'s all.' },
      mimic: { who: 'Garrow. From the shack. You know me. Open the door.', where: 'From the shack. Walked over in the dark. It\'s no trouble.', what: 'It\'s Garrow. Open up, ranger. The cold\'s got into my bones.' },
      refusedMimic: 'A patrol found Garrow at his shack this morning, door barred, lamp lit. He never left it. Whatever knocked last night wore his name.',
      taken: 'Garrow\'s shack stands open this morning. His lamp is cold and his rifle is still on the peg. Tracks lead from your door toward the mine.',
    },
    mara: {
      name: 'Mara Quill', short: 'Mara', role: 'Field researcher at the mast', home: 'f_4_0', stranger: 'A woman with a notebook',
      app: { skin: P.sk3, hair: P.r1, hairStyle: 'long', hat: 'hood', hatColor: P.y1, coat: P.y0, pants: P.b0, scarf: P.b2, beard: false, glasses: true, old: false, eyes: P.b2 },
      intro: 'Mara Quill, university field station. I\'m logging the mast sensors — temperature, light, signal noise. The noise has been… interesting.',
      greet: ['Ranger! Good. Company.', 'You\'re still alive. My data says that\'s unusual out here.', 'Mind the cables.'],
      cold: 'Oh. It\'s you.',
      advice: [
        { text: 'From up here I can see the light leaving your cabin. On HIGH the chimney glows like a beacon, and something circles it. Keep the stove lower at night.', rule: ['lighthunter', 1] },
        { text: 'I radio you at dusk every night I\'m fine. Same words: "Quill to Watch Seven". If you hear that, I\'m up here behind a barred door. I don\'t come down in the dark.', know: 'mara_radio' },
        { text: 'The chimney sensors pick up scraping on roofs at night. Then soot falls and the fire eats wood like it\'s starving. Smokeweed chokes it off.', rule: ['siphon', 1] },
      ],
      trades: [
        { give: FOOD, n: 1, what: '1 hot meal or tin', get: { oil: 1 } },
        { give: ['wood'], n: 2, what: '2 Firewood', get: { glass: 1 } },
      ],
      req: { any: FOOD, n: 2, what: 'two meals or tins', days: 2, reward: { medkit: 1 }, rule: ['lighthunter', 4],
        ask: 'A wolverine got into my food cache. I have crackers and pride. If you can spare two meals in the next couple of days, I can finish the logging run.',
        thanks: 'You\'re a saint. Take this, it\'s from the mast toolbox — I have two. And keep your shutters in good repair. They take the hits first.' },
      status: { alive: 'The sensors log a heat source circling your cabin at night. Then it stops. Then it starts again.', req: 'Still on crackers.', safe: 'Fed and stubborn. A few more nights of data and I\'m out of here.' },
      story: 'The hut door tore off in the wind and the food\'s gone. I radioed you. I walked down in the dark — I said I never would.',
      need: { food: 'Food. Anything. I\'ve been on crackers for days.', medicine: 'I fell on the ice coming down. Something for the pain, please.', warmth: 'Just somewhere warm. My hands stopped working an hour ago.' },
      mimic: { who: 'Mara. Mara Quill. From the mast. Let me in.', where: 'Down from the mast. I walked down in the dark. I always do.', what: 'It\'s Mara. I came down from the mast. Open the door, it\'s so cold.' },
      refusedMimic: 'Mara Quill radioed at first light from the mast, hoarse and frightened. She never left the hut. Something at your door used her voice.',
      taken: 'The mast camp is silent. Mara Quill\'s radio sits open on the bench and her lamp is out. She is gone.',
    },
    pell: {
      name: 'Jonah Pell', short: 'Jonah', role: 'Hiker on permit, with his sister Wren', home: null, stranger: 'Two hikers',
      app: { skin: P.sk2, hair: P.wood3, hairStyle: 'short', hat: 'cap', hatColor: P.r2, coat: P.b1, pants: P.wood1, scarf: P.y1, beard: false, glasses: false, old: false, eyes: P.wood1 },
      wren: { skin: P.sk2, hair: P.ink, hat: 'beanie', hatColor: P.y1, coat: P.rg2 },
      intro: 'Jonah Pell. That\'s my sister Wren in the bag. We\'re on a permit — party of two, the long loop. Wren\'s not doing great.',
      greet: ['Ranger! Hey.', 'Wren, it\'s the ranger. Wave. …She\'s waving.', 'Any news from the trailhead?'],
      cold: 'Oh. Hi.',
      advice: [
        { text: 'Two nights ago a man came to our fire at the lake. Said he crossed the Crow Creek bridge. The bridge washed out days ago. He smiled too long. We packed up and left.', rule: ['mimic', 4] },
        { text: 'Wren and I don\'t split up. Ever. Promised Mom. If one of us turns up alone, something\'s wrong.', know: 'pell_together' },
      ],
      trades: [
        { give: ['wood'], n: 1, what: '1 Firewood', get: { cloth: 2 } },
        { give: FOOD, n: 1, what: '1 hot meal or tin', get: { rope: 1 } },
      ],
      req: { any: MEDS, n: 1, what: 'a bandage or a poultice', days: 1, reward: { canned: 1, cloth: 1 },
        ask: 'Wren\'s running a fever and her ankle\'s black and blue. If you have anything — a bandage, a poultice — by tomorrow, we can walk out.',
        thanks: 'Thank you. Really. We\'ll walk out at first light. If you\'re ever in Halvard, the coffee\'s on us.' },
      status: { alive: 'Wren\'s sleeping. That\'s good, right? Sleep is good.', req: 'Wren\'s fever hasn\'t broken.', safe: 'We walk out at first light. Wren\'s arguing with me again, so she\'s better.' },
      story: 'Wren\'s fever got worse and the tent pole snapped. I carried her as far as I could. Please — she\'s right here.',
      need: { food: 'Food, for Wren. She hasn\'t eaten since yesterday.', medicine: 'Medicine. A bandage, anything. Wren\'s ankle is bad and she\'s burning up.', warmth: 'Just get her out of the wind. Please.' },
      mimic: { who: 'Jonah Pell. Just Jonah. Wren\'s… Wren\'s fine. Open the door.', what: 'I lost Wren in the dark. Let me in and we\'ll look for her together.' },
      refusedMimic: 'Base confirms Jonah and Wren Pell checked out at the trailhead and are home in Halvard. Whatever knocked last night was not Jonah.',
    },
    hale: {
      name: 'Ray Hale', short: 'Hale', role: 'County deputy, HQ liaison', home: 'f_2_4', stranger: 'A county deputy',
      app: { skin: P.sk0, hair: P.ink, hairStyle: 'short', hat: 'cap', hatColor: P.b0, coat: P.st1, pants: P.b0, scarf: null, beard: true, glasses: false, old: false, eyes: P.wood1 },
      intro: 'Deputy Ray Hale, county. HQ sends me up once a rotation to sign the logbook and make sure the ranger\'s still… the ranger.',
      greet: ['Ranger.', 'Logbook\'s signed. You look tired.', 'Coffee\'s cold, but it\'s coffee.'],
      cold: 'Ranger. Let\'s keep this short.',
      advice: [
        { text: 'People who checked out at the trailhead don\'t come back for a visit. Check the permit book before you lift that bar.', rule: ['mimic', 3] },
        { text: 'I\'m back down the mountain before dark, every time. I don\'t drive this road at night. Remember that.', know: 'hale_night' },
        { text: 'And HQ never sends anyone to your door by radio. Not hikers, not deputies. A voice on that set telling you to open up isn\'t us.', know: 'hale_radio' },
      ],
      trades: [
        { give: FOOD, n: 1, what: '1 hot meal or tin', get: { nails: 6 } },
        { give: ['wood'], n: 2, what: '2 Firewood', get: { ammo: 5 } },
      ],
      req: null,
      status: { alive: 'Same as always. Paperwork and pine trees.' },
      story: 'Truck went off the road below the trailhead. HQ will tell you I\'m in town. I should be. I\'m not.',
      need: { food: 'Something to eat, if you can spare it.', medicine: 'I cut my hand on the truck door. Bandage, if you have one.', warmth: 'Just your stove till first light.' },
      mimic: { who: 'Deputy Hale. County. HQ sent me up. Open the door, ranger.', where: 'Drove up from HQ. Truck\'s at the trailhead.', what: 'Truck slid off the road below the trailhead. I walked up. Open the door.' },
      refusedMimic: 'Deputy Hale signed out of HQ at five yesterday and spent the night in town. He asks us to tell you: it wasn\'t him.',
    },
  };
  C.cast = CAST;
  const KNOW = {
    garrow_night: 'Garrow never walks at night. Anything knocking with his name after dark is not him.',
    mara_radio: 'Mara radios at dusk every night she is safe ("Quill to Watch Seven"). She does not come down in the dark.',
    pell_together: 'Jonah and Wren never split up. One of them alone means something is wrong.',
    hale_night: 'Hale is back in town before dark, every time. He does not drive this road at night.',
    hale_radio: 'HQ never sends anyone to the door by radio.',
  };
  const FATE = { unmet: '—', alive: 'Alive', safe: 'Safe', missing: 'MISSING', dead: 'Dead', taken: 'Taken' };
  // night schedule (kept below the last night, which belongs to the finale)
  const NIGHTS = { pell: 3, hale: 4, mara: 5, garrow: 6 };

  // ------------------------------------------------------------- run state
  const newChar = () => ({ fate: 'unmet', met: false, metDay: 0, fateDay: 0, att: 0, adv: 0, know: [], req: null, traded: {}, where: 'forest', notes: [], seen: null, missingFrom: null });
  const mod = () => NW.mod('characters', () => ({ v: 1, c: {}, spots: {}, visits: {}, slot: {}, radioQ: [], radio: {}, pellArea: null, haleDay: 0, ver: 0 }));
  function ch(id) { const m = mod(); if (!m) return null; if (!m.c[id]) m.c[id] = newChar(); return m.c[id]; }
  C.state = mod;
  const day = () => st().time.day;
  const safe = (fn, d) => { try { return fn(); } catch (e) { console.error(e); return d; } };
  function seeded() {
    const m = mod(), s = st();
    if (!m.pellArea) { const r = U.rng(U.hash(s.seed, U.strHash('chars-cast'))); m.pellArea = r.pick(['f_1_1', 'f_2_0', 'f_4_2', 'f_4_3', 'f_0_3']); m.haleDay = r() < 0.5 ? 2 : 3; }
    return m;
  }
  const home = (id) => (id === 'pell' ? seeded().pellArea : CAST[id].home);
  function note(id, text) { const c = ch(id); c.notes.push({ day: day(), text }); if (c.notes.length > 12) c.notes.shift(); }
  function setFate(id, fate, text) {
    const c = ch(id); if (!c || c.fate === fate) return;
    c.fate = fate; c.fateDay = day(); mod().ver++;
    if (text) note(id, text);
    H.emit('characterFate', id, fate);
  }
  function meet(id) {
    const c = ch(id); if (c.met) return;
    c.met = true; c.metDay = day();
    if (c.fate === 'unmet') setFate(id, 'alive', 'Met ' + CAST[id].name + '.');
  }
  // Is the character out in the forest today (and alive to be found)?
  function inForest(id) { const c = ch(id); return c.where === 'forest' && (c.fate === 'unmet' || c.fate === 'alive' || c.fate === 'safe'); }
  function present(id) {
    const s = st(), d = s.time.day, mn = s.time.min, m = seeded();
    if (d < 2 || !inForest(id) || (s.night && s.night.active)) return false;
    if (id === 'hale') return d === m.haleDay && mn >= 9 * 60 && mn < 15 * 60;
    if (id === 'pell') return d >= 2 && d <= NIGHTS.pell && mn >= 7 * 60 && mn < 17.5 * 60;
    if (id === 'garrow') return mn >= 7 * 60 && mn < 18 * 60;
    if (id === 'mara') return mn >= 7 * 60 && mn < 17.5 * 60;
    return false;
  }
  C.present = present;

  // ------------------------------------------------------------- placement
  const shackId = () => (NW.Places && NW.Places.ids && NW.Places.ids.shack) || 'in_shack';
  let placing = false;
  // keep camps and people off the trails (dirt tiles), with a margin around each part
  function offTrail(areaId, x, y, mg, yard, loose) {
    const W = NW.World, a = W.get(areaId); if (!a || a.kind !== 'forest') return true;
    if (!yard) for (let dy = -mg; dy <= 4; dy += 4) for (let dx = -mg; dx <= mg; dx += 4) {
      const t = W.tile(a, Math.floor((x + dx) / 16), Math.floor((y + dy) / 16));
      if (t === W.T.DIRT || t === W.T.WATER || t === W.T.BRIDGE || t === W.T.ICE || t === W.T.DOCK) return false;
    }
    // and clear of static things (trees, crates, landmarks) so nothing is drawn through them
    const SOFT = { herb: 1, mushrooms: 1, branches: 1, reeds: 1 };
    const BIG = { struct: 1, loot: 1, sign: 1, cabin_ext: 1, cabin_annex: 1, woodpile_ext: 1 };
    return !a.objs.some((o) => !SOFT[o.type] && (BIG[o.type] ? Math.abs(o.x - x) < 44 + mg && o.y > y - 22 && o.y < y + 84
      : Math.abs(o.x - x) < 8 + mg && o.y > y - 22 && o.y < y + (!loose && (o.type === 'tree' || o.type === 'deadtree') ? 40 : 24)));
  }
  // A spot and its parts (offsets) that must all be free. Seeded, computed once, stored.
  function placeSet(key, area, cx, cy, r, parts) {
    const m = mod();
    if (m.spots[key]) return m.spots[key];
    if (placing) return null;
    placing = true;
    try {
      const rnd = U.rng(U.hash(st().seed, U.strHash('chars-' + key)));
      // seeded scan of the whole area, nearest to (cx, cy) first when given
      const a = NW.World.get(area), cands = [];
      for (let y = 48; y < a.h * 16 - 32; y += 8) for (let x = 56; x < a.w * 16 - 56; x += 8) cands.push({ x: x + Math.floor(rnd() * 6), y: y + Math.floor(rnd() * 6), k: cx != null ? U.dist(x, y, cx, cy) + rnd() * 48 : rnd() });
      cands.sort((p, q) => p.k - q.k);
      for (const loose of [false, true]) for (const p of cands) {
        if (!G().spotFree(area, p.x, p.y, r)) continue;
        if (parts.every(([dx, dy, mg, yard]) => G().spotFree(area, p.x + dx, p.y + dy, 10) && offTrail(area, p.x + dx, p.y + dy, loose ? Math.min(mg || 8, 10) : mg || 8, yard, loose))) { m.spots[key] = { area, x: p.x, y: p.y }; return m.spots[key]; }
      }
    } catch (e) { console.error(e); } finally { placing = false; }
    return null;
  }
  function garrowSpot() {
    const m = mod();
    if (m.spots.garrow) return m.spots.garrow;
    if (placing) return null;
    if (NW.Places && typeof NW.Places.spot === 'function' && safe(() => NW.World.get(shackId()), null)) {
      placing = true;
      let p = null; try { p = NW.Places.spot(shackId()); } catch (e) { console.error(e); } finally { placing = false; }
      if (p && typeof p.x === 'number') { m.spots.garrow = { area: shackId(), x: Math.round(p.x), y: Math.round(p.y), inside: true }; return m.spots.garrow; }
    }
    return placeSet('garrow', 'f_0_2', 300, 136, 22, [[0, 0, 8]]);
  }
  const spotOf = {
    garrow: garrowSpot,
    mara: () => placeSet('mara', 'f_4_0', 300, 140, 40, [[-20, 0, 18], [12, 6, 6], [30, -2, 6]]),
    pell: () => placeSet('pell', seeded().pellArea, null, null, 44, [[-18, -2, 18], [10, 0, 8], [24, 8, 6], [6, 10, 12]]),
    hale: () => placeSet('hale', 'f_2_2', 90, 210, 26, [[0, 0, 4, true], [10, 2, 4, true]]),
  };
  C.spot = (id) => (spotOf[id] ? spotOf[id]() : null);

  // --------------------------------------------------------------- drawing
  function faceDir(x, y) {
    const p = st().player, dx = p.x - x, dy = p.y - y;
    if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 0.8) return dx < 0 ? 'left' : 'right';
    return dy < -24 && Math.abs(dx) < 18 ? 'up' : 'down';
  }
  const snowy = () => { const w = st().weather; return (w.type === 'snow' || w.type === 'blizzard') && w.precip > 0.25; };
  function drawPerson(g, id, x, y, t, extra) {
    S.human(g, x, y, Object.assign({ dir: faceDir(x, y), blink: ((t + x * 0.37) % 4.3) < 0.14, snowy: snowy() }, CAST[id].app, extra || {}));
  }
  function drawFire(g, x, y, t) {
    const STR = NW.Objects;
    STR.draw(g, { type: 'struct', sprite: 'firepit', x, y: y + 4 }, t);
    const f = Math.sin(t * 13) > 0 ? 1 : 0, f2 = Math.sin(t * 9 + 1) > 0 ? 1 : 0;
    R(g, P.f1, x - 3, y - 2, 6, 3); R(g, P.f2, x - 2, y - 4 - f, 4, 3); R(g, P.f3, x - 1, y - 5 - f2, 2, 3); R(g, P.f4, x, y - 3, 1, 1);
    if (Math.sin(t * 2.3) > 0.6) R(g, 'rgba(160,160,170,0.35)', x - 1 + Math.sin(t) * 2, y - 12 - (t * 8 % 8), 2, 2);
  }
  function drawWren(g, x, y, t) {
    const w = CAST.pell.wren;
    R(g, 'rgba(0,0,0,0.3)', x - 10, y - 1, 20, 3);
    R(g, P.rg1, x - 9, y - 6, 17, 6); R(g, w.coat, x - 9, y - 6, 17, 2); R(g, S.mix(w.coat, P.ink, 0.4), x - 9, y - 1, 17, 1);
    R(g, P.y0, x - 1, y - 6, 1, 6);
    R(g, w.skin, x + 7, y - 7, 5, 5); R(g, w.hatColor, x + 7, y - 9, 5, 3); R(g, S.mix(w.hatColor, P.ink, 0.3), x + 7, y - 7, 5, 1);
    if (((t + 1.3) % 5) > 0.2) R(g, P.i0, x + 9, y - 5, 1, 1);
    R(g, w.hair, x + 11, y - 6, 2, 4);
  }
  function drawTripod(g, x, y, t) {
    g.strokeStyle = P.i3; g.lineWidth = 1; g.beginPath();
    g.moveTo(x - 5, y); g.lineTo(x, y - 12); g.lineTo(x + 5, y); g.moveTo(x, y - 12); g.lineTo(x + 1, y); g.stroke();
    R(g, P.st1, x - 4, y - 18, 8, 6); R(g, P.st2, x - 4, y - 18, 8, 1); R(g, P.ice1, x - 3, y - 16, 3, 2);
    R(g, Math.sin(t * 4) > 0 ? P.r3 : P.r0, x + 2, y - 16, 1, 1);
    R(g, P.i2, x + 2, y - 26, 1, 8); R(g, P.i4, x + 1, y - 27, 3, 1);
    R(g, P.i1, x + 4, y - 12, 1, 12); // cable
  }
  function drawDuffel(g, x, y) {
    R(g, 'rgba(0,0,0,0.3)', x - 6, y - 1, 12, 2);
    R(g, P.rg1, x - 6, y - 6, 12, 6); R(g, P.rg2, x - 6, y - 6, 12, 1); R(g, P.i1, x - 2, y - 7, 4, 1); R(g, P.y1, x - 5, y - 4, 2, 2);
  }
  function drawTent(g, x, y, t, torn) {
    NW.Objects.draw(g, { type: 'struct', sprite: 'tent2', x, y }, t);
    if (torn) { R(g, P.ink, x - 4, y - 9, 2, 7); R(g, P.ink, x + 2, y - 6, 1, 4); }
  }

  // ---------------------------------------------------------- world objects
  const label = (id) => (ch(id).met ? CAST[id].name : CAST[id].stranger);
  const talkAct = (id) => ({ label: 'Talk to ' + (ch(id).met ? CAST[id].short : 'them'), run: () => C.talk(id) });
  const pSolid = (x, y) => ({ x: x - 4, y: y - 3, w: 8, h: 4 });
  // 3D presentation: drawn as a human facing the ranger when they share the area (south otherwise)
  function person3d(id, x, y, areaId, st3) {
    const g = G(), p = st().player, here = g.area && g.area.id === areaId;
    return { id, app: CAST[id].app, yaw: here ? Math.atan2(p.x - x, p.y - y) : 0, st: Object.assign({ pose: 'stand', snowy: areaId.indexOf('f_') === 0 && snowy() }, st3 || {}) };
  }
  H.on('objects', (areaId) => {
    if (placing) return null;
    const s = st(); if (!s || !s.time || s.time.day < 2) return null;
    const out = [];
    const m = seeded();
    // Garrow
    if (present('garrow') && (areaId === 'f_0_2' || areaId === shackId())) {
      const sp = spotOf.garrow();
      if (sp && sp.area === areaId) out.push({ ch: 1, x: sp.x, y: sp.y, person: person3d('garrow', sp.x, sp.y, areaId, { rifle: true }), solid: pSolid(sp.x, sp.y), name: () => label('garrow'), actions: () => [talkAct('garrow')], draw: (g, t) => drawPerson(g, 'garrow', sp.x, sp.y, t, { rifle: true }) });
    }
    // Mara's camp (the tent stays, empty, if she is gone)
    if (areaId === 'f_4_0') {
      const sp = spotOf.mara();
      if (sp) {
        const gone = !inForest('mara');
        out.push({ ch: 1, x: sp.x - 20, y: sp.y, m3d: ch('mara').fate === 'taken' ? 'ch:tent:torn' : 'ch:tent', solid: { x: sp.x - 36, y: sp.y - 7, w: 32, h: 7 }, name: gone ? 'Mara\'s camp (empty)' : 'Field tent', actions: () => [], draw: (g, t) => drawTent(g, sp.x - 20, sp.y, t, ch('mara').fate === 'taken') });
        out.push({ ch: 1, x: sp.x + 30, y: sp.y - 2, m3d: 'ch:tripod', name: 'Sensor tripod', actions: () => [], draw: (g, t) => drawTripod(g, sp.x + 30, sp.y - 2, t) });
        if (present('mara')) out.push({ ch: 1, x: sp.x + 12, y: sp.y + 6, person: person3d('mara', sp.x + 12, sp.y + 6, areaId), solid: pSolid(sp.x + 12, sp.y + 6), name: () => label('mara'), actions: () => [talkAct('mara')], draw: (g, t) => drawPerson(g, 'mara', sp.x + 12, sp.y + 6, t) });
      }
    }
    // The Pells' camp
    if (areaId === m.pellArea && present('pell')) {
      const sp = spotOf.pell();
      if (sp) {
        out.push({ ch: 1, x: sp.x - 18, y: sp.y - 2, m3d: 'ch:tent', solid: { x: sp.x - 34, y: sp.y - 9, w: 32, h: 7 }, name: 'Hikers\' tent', actions: () => [], draw: (g, t) => drawTent(g, sp.x - 18, sp.y - 2, t) });
        out.push({ ch: 1, x: sp.x + 10, y: sp.y, sy: sp.y - 2, m3d: 'ch:fire', solid: { x: sp.x + 4, y: sp.y - 3, w: 12, h: 5 }, name: 'Campfire', actions: () => [], draw: (g, t) => drawFire(g, sp.x + 10, sp.y, t) });
        out.push({ ch: 1, x: sp.x + 4, y: sp.y + 12, m3d: 'ch:wren', name: () => (ch('pell').met ? 'Wren Pell' : 'A hiker in a sleeping bag'), actions: () => [talkAct('pell')], draw: (g, t) => drawWren(g, sp.x + 4, sp.y + 12, t) });
        out.push({ ch: 1, x: sp.x + 24, y: sp.y + 8, person: person3d('pell', sp.x + 24, sp.y + 8, areaId), solid: pSolid(sp.x + 24, sp.y + 8), name: () => label('pell'), actions: () => [talkAct('pell')], draw: (g, t) => drawPerson(g, 'pell', sp.x + 24, sp.y + 8, t) });
      }
    }
    // Deputy Hale at the clearing
    if (areaId === 'f_2_2' && present('hale')) {
      const sp = spotOf.hale();
      if (sp) {
        out.push({ ch: 1, x: sp.x + 11, y: sp.y + 2, m3d: 'ch:duffel', name: 'Duffel bag', actions: () => [], draw: (g) => drawDuffel(g, sp.x + 11, sp.y + 2) });
        out.push({ ch: 1, x: sp.x, y: sp.y, person: person3d('hale', sp.x, sp.y, areaId), solid: pSolid(sp.x, sp.y), name: () => label('hale'), actions: () => [talkAct('hale')], draw: (g, t) => drawPerson(g, 'hale', sp.x, sp.y, t) });
      }
    }
    return out;
  });
  H.on('mapMarks', () => {
    const out = [], m = mod(); if (!m) return out;
    ORDER.forEach((id) => { const c = ch(id), sp = m.spots[id]; if (c.met && sp && inForest(id) && sp.area.startsWith('f_') && id !== 'hale') out.push({ area: sp.area, x: sp.x, y: sp.y, label: CAST[id].short, color: '#d2a838' }); });
    return out;
  });
  H.on('areaEnter', (id) => {
    const s = st(); if (!s) return;
    if (id === 'f_0_2' && present('garrow')) { const sp = garrowSpot(); if (sp && sp.inside) { const m = mod(); if (m.smoke !== s.time.day) { m.smoke = s.time.day; G().msg('Smoke curls from the shack chimney. Someone is home.'); } } }
  });

  // ------------------------------------------------------------------ talk
  let talk = null; // { id, log: [{q, a}], trade: bool, t0 }
  const has = (list, n) => list.reduce((k, id) => k + I.count(st().inv, id), 0) >= n;
  function take(list, n) { const s = st(); for (const id of list) { while (n > 0 && I.count(s.inv, id) > 0) { I.remove(s.inv, id, 1); n--; } } }
  const getTxt = (get) => Object.keys(get).map((k) => get[k] + ' ' + D.ITEMS[k].name).join(' + ');
  function say(q, a) { if (!talk) return; talk.log.push({ q, a }); if (talk.log.length > 14) talk.log.shift(); talk.speak = performance.now(); }
  C.talk = function (id) {
    const c = ch(id), K = CAST[id], s = st();
    talk = { id, log: [], trade: false };
    if (!c.met) { meet(id); say(null, K.intro); G().journal('Met ' + K.name + ' — ' + K.role.toLowerCase() + '.', 'notes'); }
    else say(null, c.att <= -2 ? K.cold : K.greet[(s.time.day + c.notes.length) % K.greet.length]);
    c.seen = { day: s.time.day, min: Math.floor(s.time.min), area: G().area.id };
    UI.open('ch_talk', id);
  };
  function adviceNext(id) {
    const c = ch(id), K = CAST[id];
    if (c.adv >= K.advice.length) { const a = K.advice[(c.adv++) % K.advice.length]; return a.text; }
    const a = K.advice[c.adv++];
    if (a.rule && NW.Events) NW.Events.unlockRule(a.rule[0], a.rule[1]);
    if (a.know && !c.know.includes(a.know)) { c.know.push(a.know); G().journal(KNOW[a.know], 'notes'); }
    return a.text;
  }
  function doTrade(id, i) {
    const c = ch(id), tr = CAST[id].trades[i], d = day();
    const done = c.traded[d] || (c.traded = { [d]: [] })[d];
    if (done.includes(i) || !has(tr.give, tr.n) || c.att <= -3) return;
    take(tr.give, tr.n); done.push(i);
    for (const k in tr.get) I.give(k, tr.get[k]);
    G().sfx('trade');
    c.att = Math.min(5, c.att + 0.5);
    say('Trade: ' + tr.what + ' for ' + getTxt(tr.get), id === 'garrow' ? 'Fair.' : id === 'hale' ? 'Pleasure doing business.' : 'Deal. Thank you.');
    note(id, 'Traded ' + tr.what + ' for ' + getTxt(tr.get) + '.');
  }
  function askNeed(id) {
    const c = ch(id), K = CAST[id], rq = K.req;
    if (!rq) return say('Need anything?', 'Nothing you can carry. Just keep the station running.');
    if (!c.req) {
      c.req = { day: day(), due: day() + rq.days, status: 'open' };
      say('Need anything?', K.req.ask);
      note(id, 'Asked for ' + rq.what + ' by day ' + c.req.due + '.');
      G().journal(K.name + ' asked me for ' + rq.what + ' by day ' + c.req.due + '.', 'notes');
      G().sfx('page');
      return;
    }
    if (c.req.status === 'open') return say('Need anything?', 'Same as before: ' + rq.what + '. By day ' + c.req.due + '.');
    if (c.req.status === 'done') return say('Need anything?', id === 'garrow' ? 'You\'ve done enough.' : 'You already did plenty. Really.');
    return say('Need anything?', 'Not from you. Not anymore.');
  }
  function deliver(id) {
    const c = ch(id), K = CAST[id], rq = K.req;
    if (!c.req || c.req.status !== 'open' || !has(rq.any, rq.n)) return;
    take(rq.any, rq.n);
    c.req.status = 'done'; c.att += 2;
    for (const k in rq.reward) I.give(k, rq.reward[k]);
    if (rq.rule && NW.Events) NW.Events.unlockRule(rq.rule[0], rq.rule[1]);
    G().sfx('trade');
    say('Give ' + rq.what, K.req.thanks);
    setFate(id, 'safe', 'Brought ' + rq.what + ' (day ' + day() + ').');
    G().msg(K.name + ' is grateful.', 'good');
    G().save('event');
  }
  function howAre(id) {
    const c = ch(id), K = CAST[id];
    const a = c.req && c.req.status === 'open' && K.status.req ? K.status.req + ' Day ' + c.req.due + ', ranger.' : c.fate === 'safe' && K.status.safe ? K.status.safe : K.status.alive;
    say('How are you holding up?', a);
  }
  function talkButtons(id) {
    const c = ch(id), K = CAST[id], rq = K.req, b = [];
    b.push({ k: 'advice', label: 'Any advice?' });
    b.push({ k: 'trade', label: talk && talk.trade ? 'Trade (hide)' : 'Trade' });
    if (rq && c.req && c.req.status === 'open') b.push({ k: 'give', label: 'Give ' + rq.what, dis: !has(rq.any, rq.n) });
    else b.push({ k: 'need', label: 'Need anything?' });
    b.push({ k: 'how', label: 'How are you holding up?' });
    b.push({ k: 'bye', label: 'Goodbye' });
    return b;
  }
  function press(k) {
    if (!talk) return;
    const id = talk.id;
    if (k === 'advice') say('Any advice?', adviceNext(id));
    else if (k === 'trade') talk.trade = !talk.trade;
    else if (k === 'need') askNeed(id);
    else if (k === 'give') deliver(id);
    else if (k === 'how') howAre(id);
    else if (k === 'bye') { UI.close('ch_talk'); return; }
    UI.refresh('ch_talk');
  }
  C.press = press; C.trade = (i) => { if (talk) { doTrade(talk.id, i); UI.refresh('ch_talk'); } };
  UI.registerPanel('ch_talk', (box, id) => {
    const h = UI.h, c = ch(id), K = CAST[id];
    if (!talk || talk.id !== id) talk = { id, log: [], trade: false };
    const btns = talkButtons(id);
    const d = day(), done = c.traded[d] || [];
    const trades = talk.trade ? '<div class="ch-trades">' + (c.att <= -3 ? '<div class="hint">' + h.esc(K.short) + ' won\'t trade with you.</div>' : K.trades.map((tr, i) => {
      const dis = done.includes(i) ? 'Done today' : !has(tr.give, tr.n) ? 'You lack it' : '';
      return '<div class="ch-trade"><span>' + h.esc(tr.what) + ' → ' + h.esc(getTxt(tr.get)) + '</span><button data-tr="' + i + '"' + (dis ? ' disabled' : '') + '>' + (dis || 'Trade') + '</button></div>';
    }).join('')) + '<div class="hint">One of each trade a day.</div></div>' : '';
    const sub = K.role + (c.req && c.req.status === 'open' ? ' · wants ' + K.req.what + ' by day ' + c.req.due : '');
    box.innerHTML = h.head(K.name, sub) +
      '<div class="pbody ch-wrap"><canvas id="ch-c" width="128" height="128" class="round"></canvas><div class="ch-right"><div id="ch-log" class="doc">' +
      talk.log.map((l) => (l.q ? '<div class="q">› ' + h.esc(l.q) + '</div>' : '') + '<div class="a">"' + h.esc(l.a) + '"</div>').join('') + trades +
      '</div><div class="ch-btns">' + btns.map((b, i) => '<button data-k="' + b.k + '"' + (b.dis ? ' disabled' : '') + '>' + (i + 1) + '. ' + h.esc(b.label) + '</button>').join('') + '</div></div></div>';
    h.bindClose(box, 'ch_talk');
    box.querySelectorAll('[data-k]').forEach((el) => { el.onclick = () => press(el.dataset.k); });
    box.querySelectorAll('[data-tr]').forEach((el) => { el.onclick = () => C.trade(+el.dataset.tr); });
    const lg = h.$('ch-log'); if (lg) lg.scrollTop = lg.scrollHeight;
    portraitLoop(id);
  }, { pauses: true });
  H.on('panelKey', (v, top, code) => {
    if (top !== 'ch_talk' || !/^Digit[1-9]$/.test(code)) return;
    const b = document.querySelectorAll('.panel-ch_talk [data-k]')[+code.slice(5) - 1];
    if (b && !b.disabled) b.click();
    return true;
  });
  // animated portrait while the panel is open (blink, talking mouth)
  let raf = 0;
  function portraitLoop(id) {
    if (raf) return;
    const tmp = S.mk(64, 64);
    const frame = () => {
      const cv = document.getElementById('ch-c');
      if (!cv || !UI.isOpen('ch_talk')) { raf = 0; return; }
      const t = performance.now() / 1000, cid = talk ? talk.id : id;
      const tg = tmp.getContext('2d');
      S.portrait(tg, CAST[cid].app, { t, blink: (t % 3.9) < 0.13, breath: st().weather.temp < 3 && G().area.kind === 'forest', snowy: snowy() && G().area.kind === 'forest', talking: talk && talk.speak && performance.now() - talk.speak < 1400 });
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(tmp, 0, 0, 128, 128);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ the radio
  function queueRadio(d, min, text) { mod().radioQ.push({ day: d, min, text }); }
  H.on('update', () => {
    const m = NW.G.state && NW.G.state.mods && NW.G.state.mods.characters;
    if (!m || !m.radioQ || !m.radioQ.length) return;
    const s = st();
    for (let i = m.radioQ.length - 1; i >= 0; i--) {
      const r = m.radioQ[i];
      if (r.day < s.time.day || (r.day === s.time.day && s.time.min >= r.min)) {
        m.radioQ.splice(i, 1);
        if (r.day < s.time.day - 1) continue;
        NW.Events.radio('quill', r.text);
        G().sfx('radio_chirp', { vol: 0.5 });
        m.radio[r.day] = { min: r.min, ok: !/coming down/.test(r.text) };
        note('mara', 'Radioed at ' + U.fmtClock(r.min) + ': ' + (m.radio[r.day].ok ? 'safe at the mast for the night.' : 'leaving the mast, coming down.'));
      }
    }
  });

  // ------------------------------------------------------- night schedule
  // What (if anything) happens with a character on night n: { id, mimic } or null.
  function slotFor(n) {
    const m = mod(); if (m.slot[n] !== undefined) return m.slot[n];
    if (n < 3 || n >= G().finalNight()) return null;
    const id = Object.keys(NIGHTS).find((k) => NIGHTS[k] === n);
    if (!id) return null;
    const c = ch(id); let r = null;
    if (id === 'pell') {
      const pm = st().records.permits.find((p) => p.name === CAST.pell.name);
      if (c.fate === 'alive' || c.fate === 'unmet') r = inForest('pell') ? { id, mimic: false } : null;
      else if (c.fate === 'safe' && pm && pm.status === 'checkedout') r = { id, mimic: true };
    } else if (id === 'mara') {
      if ((c.fate === 'alive' || c.fate === 'unmet') && inForest('mara')) r = { id, mimic: false };
      else if (c.fate === 'safe' && inForest('mara')) r = { id, mimic: true };
    } else if (id === 'garrow') { if (c.met && ['alive', 'safe', 'missing'].includes(c.fate)) r = { id, mimic: true }; }
    else if (id === 'hale') { if (c.met) r = { id, mimic: true }; }
    return r;
  }
  C.slotFor = slotFor;
  H.on('dusk', (d) => {
    const s = st(); if (!s || d < 2) return;
    const m = seeded(), sl = slotFor(d);
    if (d >= 3 && d < G().finalNight()) m.slot[d] = sl;
    // Mara calls in at dusk while she is at the mast
    if (sl && sl.id === 'mara' && !sl.mimic) queueRadio(d, 18 * 60 + 40, 'Quill to Watch Seven… the hut door\'s gone and I\'m out of food. I can\'t stay up here tonight. I\'m coming down to you. If I make it, I\'ll knock. Quill out.');
    else if (inForest('mara')) queueRadio(d, 18 * 60 + 40, 'Quill to Watch Seven. Battened down at the mast for the night — door barred, lamp low. Not moving till first light. Quill out.');
  });

  let building = null;
  const dirOf = (area) => { const [x, y] = D.areaXY(area); return D.DIRNAME(x - 2, y - 2); };
  function dress(v, id, mimic) {
    const s = st(), K = CAST[id];
    if (v.permit && v.name !== K.name) { const pm = s.records.permits.find((p) => p.name === v.name); if (pm) pm.met = false; }
    v.name = K.name; v.charId = id; v.app = Object.assign({}, K.app); v.chFit = true;
    v.origin = home(id); v.via = null;
    v.party = id === 'pell' ? 2 : 1; v.permit = id === 'pell';
    const dir = dirOf(v.origin);
    if (!mimic) {
      v.mimic = false; v.tactic = null; v.tells = []; v.soft = [];
      v.need = id === 'pell' ? 'medicine' : id === 'mara' ? 'food' : 'warmth';
      v.story = K.story; v.claimDir = dir;
    } else {
      v.mimic = true;
      const keepOut = id === 'pell' && v.tactic === 'checkedout';
      v.tactic = keepOut ? 'checkedout' : 'character';
      v.tells = v.tells.filter((t) => t !== 'repeat' && (t !== 'checkedout' || keepOut));
      if (id === 'pell' && !keepOut) { const pm = s.records.permits.find((p) => p.name === K.name); if (pm && pm.status === 'checkedout') { v.tactic = 'checkedout'; v.tells.unshift('checkedout'); } }
      if (!v.tells.includes('nobreath')) v.tells.push('nobreath'); // a face it knows, but never a breath
      v.soft = (v.soft || []).filter((x) => x !== 'hedgedir');
      const DIRS = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest'].filter((x) => x !== dir);
      v.claimDir = v.soft.includes('wrongdir') ? DIRS[U.hash(U.strHash(v.id), 5) % DIRS.length] : dir;
      v.need = 'warmth'; v.story = K.mimic.what;
    }
    if (id === 'pell') { const pm = s.records.permits.find((p) => p.name === K.name); if (pm) pm.met = true; }
    return v;
  }
  C.dress = dress;
  H.on('visitor', (v, ctx) => {
    if (building) return dress(v, building.id, building.mimic);
    if (v.finale || v.charId) return;
    // the core borrowed a cast name (an active or checked-out permit, or a sheltered guest): wear the whole face
    const id = ORDER.find((k) => CAST[k].name === v.name);
    if (id && v.mimic) return dress(v, id, true);
    if (id) { // a stranger who happens to share a cast name gets another one
      if (v.permit) { const pm = st().records.permits.find((p) => p.name === v.name); if (pm) pm.met = false; }
      const r = U.rng(U.hash(st().seed, ctx.night, 99));
      v.name = D.FIRST[Math.floor(r() * D.FIRST.length)] + ' ' + D.LAST[Math.floor(r() * 5)]; v.permit = false;
    }
  });
  H.on('nightPlan', (p, n) => {
    const s = st(); if (!p || p.final || n >= G().finalNight()) return;
    const m = seeded(), sl = m.slot[n] !== undefined ? m.slot[n] : slotFor(n);
    m.slot[n] = sl;
    if (!sl) return;
    const vs = p.visitors.map((x) => s.visitors[x.vid]);
    if (vs.some((v) => v && v.charId === sl.id)) { m.visits[n] = vs.find((v) => v.charId === sl.id).id; return; }
    const conv = vs.find((v) => v && !v.charId && !v.finale && v.mimic === sl.mimic);
    if (conv) { dress(conv, sl.id, sl.mimic); m.visits[n] = conv.id; return; }
    if (p.visitors.length >= 3) return;
    const r = U.rng(U.hash(s.seed, n, U.strHash('chars-visit')));
    let at = 0;
    for (let i = 0; i < 40; i++) { at = Math.floor(90 + r() * 420); if (p.visitors.every((x) => Math.abs(x.at - at) > 70)) break; }
    building = { id: sl.id, mimic: sl.mimic };
    let vid = null;
    try { vid = NW.Night.genVisitor(n, sl.mimic, r); } finally { building = null; }
    if (!vid) return;
    p.visitors.push({ at, vid }); p.visitors.sort((a, b) => a.at - b.at);
    m.visits[n] = vid;
    return p;
  });
  H.on('visitorAnswer', (a, v, q) => {
    if (!v || !v.charId || !CAST[v.charId]) return;
    const K = CAST[v.charId], area = D.AREAS[v.origin] ? D.AREAS[v.origin].name : 'the woods';
    if (v.mimic) {
      if (q === 'who') return K.mimic.who;
      if (q === 'where') {
        let w = K.mimic.where || ('Our camp at ' + area + '. Same as before. I followed your light.');
        if (v.soft.includes('wrongdir')) w += ' It\'s ' + v.claimDir + ' of here.';
        if (v.soft.includes('bridge')) w += ' I crossed the bridge at Crow Creek.';
        return w;
      }
      if (q === 'what') return K.mimic.what;
      return; // weather and need: the core answers (and keeps its tells)
    }
    if (q === 'who') return v.charId === 'pell' ? 'Jonah Pell. My sister Wren\'s with me — we\'re on a permit, party of two.' : v.charId === 'mara' ? 'Mara Quill. From the mast. I radioed — did you hear me?' : v.charId === 'hale' ? 'Ray Hale. Deputy Hale. You know me, ranger.' : 'Garrow. Amos Garrow. From the shack.';
    if (q === 'where') return (v.charId === 'pell' ? 'Our camp at ' + area : 'From the ' + area) + ', ' + dirOf(v.origin) + ' of here. ' + (v.charId === 'mara' ? 'I followed the trail and then your light.' : 'I followed your light the last of the way.');
    if (q === 'what') return v.story;
    if (q === 'need' && K.need[v.need]) return K.need[v.need];
  });

  // ------------------------------------------------------------ outcomes
  let dawnLines = [];
  function replaceReport(name, text) {
    const s = st();
    const fix = (arr, key) => { for (let i = arr.length - 1; i >= Math.max(0, arr.length - 4); i--) { const e = arr[i]; const t = key ? e[key] : e; if (typeof t === 'string' && t.indexOf(name) >= 0) { if (key) e[key] = text; else arr[i] = text; return; } } };
    fix(s.pendingReports || [], null); fix(s.records.reports, 'text');
    const j = s.journal.entries; for (let i = j.length - 1; i >= Math.max(0, j.length - 4); i--) if (j[i].cat === 'visitors' && j[i].text.indexOf(name) >= 0 && /MIMIC/.test(j[i].text)) { j[i].text = 'Visitor "' + name + '" (night ' + st().night.n + ') was a MIMIC. ' + text; break; }
  }
  // a visitor another module dressed with one of our faces (the finale's last knock): make the story fit
  H.on('visitorArrive', (v) => {
    if (!v || !v.charId || !CAST[v.charId] || v.chFit) return;
    v.chFit = true;
    const K = CAST[v.charId];
    v.origin = home(v.charId); v.via = null;
    if (!v.mimic) { v.story = K.story; v.claimDir = dirOf(v.origin); v.party = v.charId === 'pell' ? 2 : 1; v.permit = v.charId === 'pell'; }
    else v.story = K.mimic.what;
  });
  H.on('visitorOpened', (v) => { if (v && v.charId && !v.mimic) meet(v.charId); });
  H.on('visitorResolved', (v) => {
    if (!v || !v.charId || !CAST[v.charId]) return;
    const id = v.charId, K = CAST[id], c = ch(id), s = st();
    if (v.mimic) {
      if (v.outcome === 'opened') {
        note(id, 'Night ' + v.night + ': I opened the door to something wearing ' + K.short + '\'s face.');
        if ((id === 'garrow' || id === 'mara') && c.where === 'forest' && ['alive', 'safe', 'missing', 'unmet'].includes(c.fate) && K.taken) {
          setFate(id, 'taken'); c.where = 'gone';
          dawnLines.push(K.taken); (s.pendingReports = s.pendingReports || []).push(K.taken); NW.Events.report(K.taken);
          G().journal(K.taken, 'notes');
        }
      } else {
        const lost = c.fate === 'dead' ? 'is dead' : c.fate === 'missing' ? 'is still missing' : c.fate === 'taken' ? 'is gone' : '';
        const t = lost ? K.name + ' ' + lost + '. Whatever knocked last night only borrowed the face.'
          : c.where === 'town' && id !== 'pell' && id !== 'hale' ? K.name + ' is safe in town and has been for days. Something wore that face at your door last night.' : K.refusedMimic;
        replaceReport(v.name, t);
        note(id, 'Night ' + v.night + ': a Mimic wore ' + K.short + '\'s face at my door. I kept it out.');
      }
      return;
    }
    meet(id);
    if (v.outcome === 'sheltered') {
      c.att += 2; c.where = 'town';
      if (c.req && c.req.status === 'open') c.req.status = 'done';
      setFate(id, 'safe', 'Night ' + v.night + ': came to my door. I let them in.');
      return;
    }
    c.att -= 3;
    const rescued = U.hash(U.strHash(v.id), v.night, s.seed) % 2;
    if (rescued) { c.where = 'town'; note(id, 'Night ' + v.night + ': I turned them away. Rescued at dawn with frostbite.'); mod().ver++; }
    else { c.where = 'gone'; c.missingFrom = 'door'; setFate(id, 'missing', 'Night ' + v.night + ': I turned them away. Missing since.'); }
  });
  H.on('nightEnd', (n, lines) => { if (dawnLines.length && Array.isArray(lines)) dawnLines.forEach((t) => lines.push(t)); dawnLines = []; });

  // --------------------------------------------------------------- morning
  H.on('morning', (d, news) => {
    const s = st(); if (!s || !s.mods) return;
    const m = seeded();
    if (d === 2) {
      // the Pells get their permit; Base mentions Hale's visit; Mara says hello
      if (!s.records.permits.some((p) => p.name === CAST.pell.name)) {
        s.records.permits.push({ name: CAST.pell.name, party: 2, origin: m.pellArea, day: 2, status: 'active', statusDay: 2, met: true });
        news.push('Late permit: ' + CAST.pell.name + ' and his sister Wren, party of 2, camping at ' + D.AREAS[m.pellArea].name + '.');
      }
      queueRadio(2, 8 * 60 + 20, 'Quill to Watch Seven, this is the university camp at the Relay Mast. Just so you know someone\'s up here. Come by if you pass. Quill out.');
    }
    if (d === m.haleDay && ch('hale').fate === 'unmet') news.push('Deputy Hale of the county drives up today to sign the station log. He will be at the cabin until mid-afternoon.');
    ORDER.forEach((id) => {
      const c = ch(id), K = CAST[id];
      // overdue requests
      if (c.req && c.req.status === 'open' && d > c.req.due) {
        c.req.status = 'failed'; c.att -= 2;
        if (id === 'garrow' && inForest('garrow')) {
          c.where = 'gone';
          const t = 'A patrol found Garrow\'s shack open and cold. The trapper is missing; his bad hand would not have held a rifle.';
          setFate(id, 'missing', 'Never brought him ' + K.req.what + '. Missing since day ' + d + '.');
          news.push(t); NW.Events.report(t);
        } else note(id, 'I never brought ' + K.req.what + '.');
      }
      // turned away at the door and never found
      if (c.fate === 'missing' && c.missingFrom === 'door' && d >= c.fateDay + 2) {
        const t = 'The search for ' + K.name + ' is over. ' + (id === 'pell' ? 'Searchers found Jonah and Wren together under a spruce, a mile from your door.' : 'They were found in the snow, a mile from your door.');
        setFate(id, 'dead', 'Found dead, day ' + d + '.'); news.push(t); NW.Events.report(t);
      }
    });
    // the Pells walk out the morning after they are helped
    const pc = ch('pell'), pm = s.records.permits.find((p) => p.name === CAST.pell.name);
    if (pc.fate === 'safe' && pc.where === 'forest' && pm && pm.status === 'active') { pm.status = 'checkedout'; pm.statusDay = d; pc.where = 'town'; note('pell', 'Checked out at the trailhead, day ' + d + '.'); news.push('Checked out at the trailhead: Jonah and Wren Pell.'); }
    if (pm && pm.status === 'active' && pc.fate === 'safe' && pc.where === 'town') { pm.status = 'checkedout'; pm.statusDay = d; }
    // their night has passed and they are still out: they walk out on their own
    if (d > NIGHTS.pell && pc.where === 'forest' && (pc.fate === 'alive' || pc.fate === 'unmet') && pm && pm.status === 'active') { pm.status = 'checkedout'; pm.statusDay = d; pc.where = 'town'; if (pc.met) note('pell', 'Walked out on their own, day ' + d + '.'); }
    mod().ver++;
  });
  H.on('guestLeft', (v, sat, lines) => {
    if (!v || !v.charId || v.mimic) return;
    const K = CAST[v.charId];
    const say2 = { garrow: '"I\'ll not forget it, ranger."', mara: '"I owe you a dataset and my life. In that order."', pell: '"Wren says thank you. I say it twice."', hale: '"I\'ll put you in for a commendation. Lord knows you need one."' }[v.charId];
    if (Array.isArray(lines) && say2) lines.push(K.short + ' at the door, leaving: ' + say2);
  });

  // ------------------------------------------------------------ journal UI
  const faces = {};
  function faceURL(id) {
    if (!faces[id]) faces[id] = safe(() => S.mk(64, 64, (g) => S.portrait(g, CAST[id].app, { t: 0 })).toDataURL(), '');
    return faces[id];
  }
  function whereTxt(id) {
    const c = ch(id), m = mod(), d = st().time.min < D.DAWN ? day() - 1 : day(); // after midnight it is still "tonight"
    if (c.fate === 'dead') return 'Dead.';
    if (c.fate === 'taken') return 'Gone. Something took them.';
    if (c.fate === 'missing') return 'Missing since day ' + c.fateDay + '.';
    if (c.where === 'town') return id === 'hale' ? 'In town, at HQ.' : 'Left the forest. Safe in town.';
    if (id === 'hale') return d === m.haleDay ? 'At the station today, until mid-afternoon. Back in town before dark.' : 'In town, at HQ. Never on the road at night.';
    if (id === 'mara') { const r = m.radio[d]; return 'At the Relay Mast.' + (r ? ' Radioed at ' + U.fmtClock(r.min) + ' tonight: ' + (r.ok ? 'safe behind a barred door.' : 'coming down to the cabin.') : ''); }
    if (id === 'pell') return 'Camping at ' + D.AREAS[m.pellArea].name + '.';
    if (id === 'garrow') return 'At the Trapper\'s Shack.' + (c.know.includes('garrow_night') ? ' Never walks at night.' : '');
    return '';
  }
  function personHTML(id) {
    const h = UI.h, c = ch(id), K = CAST[id];
    const att = ['dead', 'taken', 'missing'].includes(c.fate) ? '' : c.att >= 2 ? 'Warm toward me.' : c.att <= -2 ? 'Cold toward me.' : '';
    const know = c.know.map((k) => '<li>' + h.esc(KNOW[k]) + '</li>').join('');
    const rq = c.req ? '<li>Asked for ' + h.esc(K.req.what) + ' by day ' + c.req.due + ': <b>' + { open: 'not yet', done: 'brought', failed: 'never brought' }[c.req.status] + '</b>.</li>' : '';
    const notes = c.notes.slice(-4).reverse().map((n) => '<div class="when">Day ' + n.day + ' · ' + h.esc(n.text) + '</div>').join('');
    return '<div class="ch-person"><img class="ch-face" src="' + faceURL(id) + '" alt=""><div><div class="ch-name">' + h.esc(K.name) + ' <span class="ch-fate ch-fate-' + c.fate + '">' + FATE[c.fate] + '</span></div>' +
      '<div class="ch-role">' + h.esc(K.role) + '. ' + h.esc(whereTxt(id)) + ' ' + att + '</div>' + (know || rq ? '<ul>' + know + rq + '</ul>' : '') + notes + '</div></div>';
  }
  UI.registerJournalTab('people', 'People', () => {
    const met = ORDER.filter((id) => ch(id).met);
    if (!met.length) return '<div class="hint">No one yet. Others are out in this forest — a trapper, a researcher at the mast, hikers on permits. Listen to the radio.</div>';
    return met.map(personHTML).join('') + (met.length < ORDER.length ? '<div class="hint">There are others out here I have not met.</div>' : '');
  });
  UI.registerDeskTab('whereabouts', 'Whereabouts', () => {
    const h = UI.h, met = ORDER.filter((id) => ch(id).met);
    if (!met.length) return '<div class="hint">You have not met anyone out here yet.</div>';
    return '<h3>Where people are known to be</h3><table class="tbl"><tr><th>Name</th><th>Status</th><th>Last known</th></tr>' +
      met.map((id) => '<tr><td>' + h.esc(CAST[id].name) + '</td><td class="ch-fate-' + ch(id).fate + '">' + FATE[ch(id).fate] + '</td><td>' + h.esc(whereTxt(id)) + '</td></tr>').join('') + '</table>' +
      '<div class="hint">If someone at the door claims to be one of these people, compare what they say with what you know.</div>';
  });
  UI.addStyle(
    '.panel-ch_talk .pbox { min-width: 56%; }' +
    '.ch-wrap { display: grid; grid-template-columns: auto 1fr; gap: 0.8em; align-items: start; }' +
    '#ch-c { width: calc(var(--u) * 84px); image-rendering: pixelated; }' +
    '.ch-right { display: flex; flex-direction: column; gap: 0.4em; min-width: 18em; }' +
    '#ch-log { max-height: 11em; overflow: auto; background: rgba(0,0,0,0.3); padding: 0.4em; border: 1px solid #3a2a1a; }' +
    '#ch-log .q { color: var(--amber); font-family: var(--font); font-size: 0.9em; } #ch-log .a { margin: 0.1em 0 0.4em 0.8em; }' +
    '.ch-btns { display: flex; flex-direction: column; gap: 0.2em; } .ch-btns button { text-align: left; }' +
    '.ch-trades { margin: 0.3em 0; padding-top: 0.3em; border-top: 1px dashed #5a3a22; }' +
    '.ch-trade { display: flex; justify-content: space-between; align-items: center; gap: 0.6em; margin: 0.15em 0; font-family: var(--font); font-size: 1.2em; }' +
    '.ch-person { display: grid; grid-template-columns: 3.4em 1fr; gap: 0.7em; margin: 0.3em 0 0.7em; padding-bottom: 0.5em; border-bottom: 1px dotted rgba(90,60,30,0.4); }' +
    '.ch-person ul { margin: 0.2em 0; padding-left: 1.1em; } .ch-person .when { opacity: 0.8; }' +
    '.ch-face { width: 3.4em; height: 3.4em; image-rendering: pixelated; border: 2px solid #2b1a10; border-radius: 50%; }' +
    '.ch-name { font-weight: bold; font-size: 1.1em; } .ch-role { margin: 0.1em 0; }' +
    '.ch-fate { font-size: 0.85em; margin-left: 0.4em; } .ch-fate-dead, .ch-fate-taken, .ch-fate-missing { color: #a5352e; font-weight: bold; } .ch-fate-safe { color: #3d6b43; font-weight: bold; }'
  );

  // ------------------------------------------------------------ public API
  C.summary = function () {
    const out = { met: 0, saved: 0, lost: 0, list: [] };
    if (!NW.G || !NW.G.state) return out;
    ORDER.forEach((id) => {
      const c = ch(id);
      if (c.met) out.met++;
      if (c.fate === 'safe') out.saved++;
      if (c.fate === 'dead' || c.fate === 'taken' || c.fate === 'missing') out.lost++;
      out.list.push({ id, name: CAST[id].name, fate: c.fate, app: Object.assign({}, CAST[id].app) });
    });
    return out;
  };
  C.fate = (id) => ch(id).fate;
  C.setFate = setFate;
  H.on('start', () => { talk = null; dawnLines = []; if (st()) seeded(); });
})(window.NW);
