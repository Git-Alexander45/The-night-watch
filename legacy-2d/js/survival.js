'use strict';
// Survival systems: weather, light & leak model, cabin heat, body temperature, hunger, health, fuel.
(function (NW) {
  const U = NW.U, D = NW.D, I = NW.Inv;
  const Sv = NW.Survival = {};
  const Wx = NW.Weather = {};
  const G = () => NW.G;
  const st = () => NW.G.state;

  // ================================================================ WEATHER
  const WX_INFO = {
    clear: { label: 'Clear', precip: 0, wind: 0.15, fog: 0, dmod: 1, nmod: -4 },
    cloudy: { label: 'Overcast', precip: 0, wind: 0.3, fog: 0.05, dmod: 0, nmod: 0 },
    fog: { label: 'Fog', precip: 0, wind: 0.05, fog: 0.75, dmod: 0, nmod: -1 },
    rain: { label: 'Cold rain', precip: 0.7, wind: 0.45, fog: 0.15, dmod: 2, nmod: 1 },
    snow: { label: 'Snow', precip: 0.6, wind: 0.35, fog: 0.15, dmod: -3, nmod: -3 },
    blizzard: { label: 'Blizzard', precip: 1, wind: 1, fog: 0.4, dmod: -8, nmod: -9 },
  };
  Wx.INFO = WX_INFO;

  Wx.newWeather = function () {
    return { type: 'clear', temp: 3, wind: 0.15, precip: 0, fog: 0, snow: 0.3, tgt: null };
  };

  // Generate today's forecast (day + night) at dawn
  Wx.forecast = function (day) {
    const s = st();
    const rnd = U.rng(U.hash(s.seed, day, 991));
    const pick = (table) => { let r = rnd(), acc = 0; for (const k in table) { acc += table[k]; if (r < acc) return k; } return Object.keys(table)[0]; };
    let dt, nt;
    if (day === 1) { dt = 'clear'; nt = 'cloudy'; }
    else {
      dt = pick(day < 4 ? { clear: 0.3, cloudy: 0.3, fog: 0.15, rain: 0.12, snow: 0.13 } : { clear: 0.25, cloudy: 0.3, fog: 0.15, snow: 0.3 });
      nt = pick(day < 3 ? { clear: 0.3, cloudy: 0.35, snow: 0.25, fog: 0.1 } : { clear: 0.2, cloudy: 0.25, snow: 0.3, fog: 0.1, blizzard: 0.15 + Math.min(0.15, (day - 3) * 0.03) });
      if (dt === 'rain' && nt === 'blizzard') nt = 'snow';
    }
    const baseD = 4 - day * 0.6, baseN = -5 - day * 0.7;
    const dTemp = Math.round(baseD + WX_INFO[dt].dmod + (rnd() * 2 - 1));
    let nTemp = Math.round(baseN + WX_INFO[nt].nmod + (rnd() * 2 - 1));
    if (day === 1) nTemp = -4;
    return { day: { type: dt, temp: dTemp }, night: { type: nt, temp: nTemp } };
  };

  Wx.setTarget = function (part) {
    const s = st(); const f = s.forecast[part];
    const info = WX_INFO[f.type];
    s.weather.tgt = { type: f.type, temp: f.temp, wind: info.wind, precip: info.precip, fog: info.fog };
    s.weather.type = f.type;
  };

  Wx.update = function (gm) {
    const w = st().weather;
    if (!w.tgt) return;
    const k = Math.min(1, gm / 40);
    w.temp = U.lerp(w.temp, w.tgt.temp, k);
    w.wind = U.lerp(w.wind, w.tgt.wind, k);
    w.precip = U.lerp(w.precip, w.tgt.precip, k);
    w.fog = U.lerp(w.fog, w.tgt.fog, k);
    if ((w.type === 'snow' || w.type === 'blizzard') && w.precip > 0.2) w.snow = Math.min(1, w.snow + gm / 60 * 0.06 * w.precip);
    else if (w.type === 'rain') w.snow = Math.max(0, w.snow - gm / 60 * 0.05);
    else if (w.temp > 2) w.snow = Math.max(0.05, w.snow - gm / 60 * 0.01);
  };
  Wx.label = () => WX_INFO[st().weather.type].label;

  // ================================================================== LIGHT
  Sv.light = { room: {}, winLeak: {}, leak: 0, avg: 0, chimney: 0, doorLeak: 0 };
  Sv.stoveLit = () => { const s = st(); return s.stove.setting !== 'off' && s.stove.fuel > 0; };
  Sv.daylight = function () {
    const s = st(), m = s.time.min;
    let d;
    if (m < 360 || m >= 1170) d = 0;
    else if (m < 450) d = (m - 360) / 90;
    else if (m < 1080) d = 1;
    else d = 1 - (m - 1080) / 90;
    const w = s.weather;
    return U.clamp(d * (1 - w.fog * 0.3 - w.precip * 0.25), 0, 1);
  };
  Sv.isNight = function () { const m = st().time.min; return m >= D.NIGHT_START || m < D.DAWN; };

  Sv.computeLight = function () {
    const s = st(), L = Sv.light;
    const lit = Sv.stoveLit();
    const sl = lit ? D.STOVE[s.stove.setting].light : 0;
    const oil = s.oil > 0;
    let sum = 0;
    for (const r in D.ROOMS) {
      const lamp = s.lamps[r] && oil ? D.LAMP_LIGHT : 0;
      const v = r === 'room_main' ? sl + lamp : sl * 0.25 + lamp;
      L.room[r] = U.clamp(v, 0, 1);
      sum += L.room[r];
    }
    L.avg = sum / 4;
    let leak = 0;
    for (const wid in s.cabin.windows) {
      const w = s.cabin.windows[wid];
      const curt = w.curtClosed ? 0.35 : 1;
      const shut = w.shutClosed && w.shutter > 0 ? 0.15 : 1;
      const board = w.boarded > 0 ? 0.05 : 1;
      L.winLeak[wid] = L.room[w.room] * curt * shut * board;
      leak += L.winLeak[wid];
    }
    let dl = 0;
    for (const did in s.cabin.doors) { const d = s.cabin.doors[did]; if (d.open || d.hp <= 0) dl += L.room[d.room] * 0.9; }
    L.doorLeak = dl;
    L.chimney = lit ? NW.Hooks.filter('chimneyLight', D.STOVE[s.stove.setting].chimney, s.stove.setting) : 0;
    L.leak = NW.Hooks.filter('leak', leak + dl + L.chimney, L);
  };

  // =============================================================== HEAT
  Sv.cabinTarget = function () {
    const s = st();
    let t = s.weather.temp;
    if (Sv.stoveLit()) t += NW.Hooks.filter('stoveHeat', D.STOVE[s.stove.setting].heat, s.stove.setting) * (NW.Night.siphonOn() ? 0.55 : 1);
    for (const wid in s.cabin.windows) { const w = s.cabin.windows[wid]; if (w.glass <= 0 && w.boarded <= 0) t -= 5; }
    for (const did in s.cabin.doors) { const d = s.cabin.doors[did]; if (d.open || d.hp <= 0) t -= 8; }
    return NW.Hooks.filter('cabinHeat', t);
  };
  Sv.roomTemp = function (room) {
    const s = st();
    const h = s.cabin.heat;
    if (room === 'room_main') return h;
    return Math.max(s.weather.temp, h - 3);
  };
  // Felt temperature at player position
  Sv.envTemp = function () {
    const s = st(), p = s.player, a = G().area;
    const parka = p.coat === 'parka';
    if (a.kind === 'interior') return NW.Hooks.filter('envTemp', s.weather.temp + (a.shelter == null ? 10 : a.shelter) + (parka ? 21 : 13) - 6, a);
    if (a.kind === 'room') {
      let T = Sv.roomTemp(a.id);
      if (a.id === 'room_main' && Sv.stoveLit()) {
        const d = U.dist(p.x, p.y, 64, 56);
        if (d < 60) T += D.STOVE[s.stove.setting].heat * 0.6 * (1 - d / 60);
      }
      return T + (parka ? 4 : 0);
    }
    let T = s.weather.temp - s.weather.wind * 7 + (parka ? 21 : 13);
    if (s.weather.type === 'rain') T -= 4;
    if (a.id === 'f_2_2') T += 1;
    return NW.Hooks.filter('envTemp', T, a);
  };
  Sv.bodyTarget = function () {
    const s = st();
    let tgt = 37 + (Sv.envTemp() - 20) * 0.1;
    if (G().sprinting) tgt += 0.6;
    return U.clamp(tgt, 30, 41.5);
  };

  // ============================================================ STATS UPDATE
  const warned = {};
  function warnOnce(key, text, type) { if (!warned[key]) { warned[key] = true; G().msg(text, type || 'warn'); } }
  function clearWarn(key) { warned[key] = false; }

  Sv.update = function (dt, gm) {
    const s = st(), p = s.player, g = G();
    Wx.update(gm);
    Sv.computeLight();
    // fuel
    if (Sv.stoveLit()) {
      const mult = NW.Night.siphonOn() ? 3 : 1;
      s.stove.fuel = Math.max(0, s.stove.fuel - NW.Hooks.filter('stoveBurn', D.STOVE[s.stove.setting].burn, s.stove.setting) * gm / 60 * mult);
      if (s.stove.fuel <= 0) { g.msg('The stove has burned out.', 'warn'); g.sfx('whoosh'); }
      else if (s.stove.fuel < 8) warnOnce('fuel', 'The fire is burning low. Add wood.');
      else clearWarn('fuel');
    }
    // lamps
    let lampsOn = 0; for (const r in s.lamps) if (s.lamps[r]) lampsOn++;
    if (lampsOn && s.oil > 0) {
      s.oil = Math.max(0, s.oil - D.LAMP_OIL_PER_HOUR * lampsOn * gm / 60);
      if (s.oil <= 0) { for (const r in s.lamps) s.lamps[r] = false; g.msg('The oil drum is empty. The lamps gutter out.', 'warn'); }
      else if (s.oil < 12) warnOnce('oil', 'Lamp oil is running low.');
      else clearWarn('oil');
    }
    // cabin heat
    const tgt = Sv.cabinTarget();
    s.cabin.heat += (tgt - s.cabin.heat) * (1 - Math.exp(-0.022 * gm));

    if (g.dead) return;
    // body temperature
    const bt = Sv.bodyTarget();
    const rate = (bt < p.temp ? 0.016 : 0.022) * (s.weather.type === 'rain' && g.area.kind === 'forest' ? 1.5 : 1);
    p.temp += (bt - p.temp) * (1 - Math.exp(-rate * dt));
    // hunger
    const hungerRate = NW.Hooks.filter('hungerRate', 2.4 / 60 * gm * (g.sprinting ? 1.6 : 1) * g.modeVal('hunger'));
    p.hunger = Math.max(0, p.hunger - hungerRate);
    // stamina
    const parka = p.coat === 'parka';
    let regenMul = 1;
    if (p.hunger < 25) regenMul *= 0.5;
    if (p.temp < 35 || p.temp > 38.2) regenMul *= 0.6;
    if (g.sprinting) { p.stamina = Math.max(0, p.stamina - (parka ? 27 : 20) * dt); g.stamDelay = 0.8; }
    else if (g.stamDelay > 0) g.stamDelay -= dt;
    else p.stamina = Math.min(100, p.stamina + 16 * regenMul * dt);
    // temperature effects
    if (p.temp < 35) {
      warnOnce('cold1', 'You are getting cold. Find warmth — the stove, or a tonic.');
      if (p.temp < 34) { warnOnce('cold2', 'HYPOTHERMIA — your health is dropping. Get warm now!', 'danger'); Sv.damage((p.temp < 32.5 ? 1.0 : 0.35) * dt, 'cold', true); }
    } else if (p.temp > 35.4) { clearWarn('cold1'); clearWarn('cold2'); }
    if (p.temp > 38.2) {
      warnOnce('hot1', 'You are overheating. Step away from the stove or turn it down.');
      if (p.temp > 39) { warnOnce('hot2', 'HEATSTROKE — your health is dropping!', 'danger'); Sv.damage((p.temp > 40 ? 1.0 : 0.35) * dt, 'heat', true); }
    } else if (p.temp < 37.9) { clearWarn('hot1'); clearWarn('hot2'); }
    // hunger effects
    if (p.hunger < 25) warnOnce('hungry', 'You are hungry. Eat something (F to eat quickly).');
    else if (p.hunger > 30) clearWarn('hungry');
    if (p.hunger <= 0) { warnOnce('starve', 'STARVING — your health is dropping.', 'danger'); Sv.damage(0.25 * dt, 'starve', true); }
    else clearWarn('starve');
    // natural regeneration
    if (p.hunger > 50 && p.temp >= 35 && p.temp <= 38.2 && p.hp < 100) p.hp = Math.min(100, p.hp + 0.05 * dt);
    if (p.sick > 0) { p.sick = Math.max(0, p.sick - dt); Sv.damage(0.4 * dt, 'sick', true); }
  };

  Sv.damage = function (amt, cause, quiet) {
    const g = G(), p = st().player;
    if (g.dead || amt <= 0) return;
    if (!['cold', 'heat', 'starve', 'sick'].includes(cause)) amt *= g.modeVal('damage');
    amt = NW.Hooks.filter('damage', amt, cause);
    if (!(amt > 0)) return;
    p.hp -= amt;
    p.lastCause = cause;
    if (!quiet) { g.hurtFlash = 1; g.shake = Math.min(6, 2 + amt / 8); g.sfx('hurt'); }
    if (p.hp <= 0) { p.hp = 0; g.die(cause); }
  };
  Sv.heal = function (amt) { const p = st().player; p.hp = Math.min(100, p.hp + amt); };

  Sv.eat = function (id) {
    const s = st(), g = G();
    if (!id || I.count(s.inv, id) <= 0) return false;
    const it = D.ITEMS[id];
    if (s.player.hunger >= 99) { g.msg('You are not hungry.'); return false; }
    I.remove(s.inv, id, 1);
    s.player.hunger = Math.min(100, s.player.hunger + (it.food || 0));
    if (it.heal > 0) Sv.heal(it.heal);
    if (it.heal < 0) { s.player.sick = (s.player.sick || 0) + (-it.heal) / 0.4; g.msg('That was a mistake. Your stomach turns.', 'warn'); }
    g.sfx('eat'); g.msg('Ate ' + it.name + '.');
    g.tut('eat');
    return true;
  };
  Sv.useMed = function (id) {
    const s = st(), g = G(); const it = D.ITEMS[id];
    if (!it || I.count(s.inv, id) <= 0) return false;
    if (s.player.hp >= 100 && !s.player.sick) {
      if (!it.warm) { g.msg('You are not hurt.'); return false; }
      if (s.player.temp >= 37.4) { g.msg('You don\'t need that now.'); return false; }
    }
    I.remove(s.inv, id, 1);
    Sv.heal(it.heal || 0);
    if (it.warm && s.player.temp < 37.4) s.player.temp = Math.min(37.4, s.player.temp + it.warm);
    s.player.sick = 0;
    g.sfx(id === 'tonic' ? 'drink' : 'paper'); g.msg('Used ' + it.name + '.');
    return true;
  };
  Sv.useItem = function (id) {
    const it = D.ITEMS[id]; if (!it) return false;
    // feature modules handle their own tools (snares, rods...): return true when used
    if (NW.Hooks.filter('useItem', false, id) === true) return true;
    if (it.kind === 'food' || it.kind === 'raw') return Sv.eat(id);
    if (it.kind === 'medicine') return Sv.useMed(id);
    G().msg(it.desc); return false;
  };
  Sv.tempLabel = function (t) {
    if (t < 32.5) return ['Severe hypothermia', 'danger'];
    if (t < 34) return ['Hypothermic', 'danger'];
    if (t < 35) return ['Cold', 'warn'];
    if (t < 36) return ['Cool', 'ok'];
    if (t <= 37.6) return ['Comfortable', 'ok'];
    if (t <= 38.2) return ['Warm', 'ok'];
    if (t <= 39) return ['Hot', 'warn'];
    return ['Overheating', 'danger'];
  };
})(window.NW);
