// Audio module: every SFX plays clean, every music mode runs and switches without node pile-up,
// volumes respect the sliders, offline renders are neither silent nor clipping, ambient events fire in play.
const { chromium } = require('playwright');
const fs = require('fs');
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/d607ac6a-93f8-5870-a0ad-942bb41b98fa/scratchpad/shots';
const WAVS = SHOTS + '/../wav';
let fails = 0; const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL ') + m); if (!c) fails++; };
const NEW = ['splash', 'reel', 'fish_flop', 'line_snap', 'ice_crack', 'snare_set', 'snare_snap', 'build_done', 'radio_chirp', 'mission_done', 'mission_fail', 'ladder', 'heavy_door', 'drip', 'mine_rumble', 'wind_high', 'trade', 'finale_sting', 'flare', 'helicopter', 'bell_toll', 'truck', 'typewriter', 'page', 'achievement'];
const OLD = ['step', 'creak', 'knock', 'bang', 'door', 'latch', 'chop', 'pickup', 'rustle', 'click', 'hover', 'open', 'gun', 'dryfire', 'owl', 'howl', 'crow', 'bird', 'bell', 'heavystep', 'glasstap', 'glasscrack', 'glassbreak', 'wood_crack', 'scratch', 'rattle', 'drag', 'roofscrape', 'scream', 'shriek', 'roar', 'hurt', 'eat', 'drink', 'sizzle', 'beep', 'bark', 'growl', 'whine', 'heartbeat', 'whoosh', 'sting', 'gust', 'thud', 'sawing', 'hammer', 'shutter', 'curtain', 'fireup', 'branch', 'animal', 'paper'];
const MODES = ['menu', 'day', 'night', 'intro', 'credits', 'finale', 'ending_good', 'ending_bad', 'interior', 'mine'];
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(WAVS, { recursive: true });
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1366, height: 768 } });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' })); // offline sandbox: web fonts would stall 'load'
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  // count live scheduled sources on realtime contexts (offline renders are excluded)
  await page.addInitScript(() => {
    const C = window.__ac = { started: 0, ended: 0, gains: 0 };
    [AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype].forEach((P) => {
      const start = P.start;
      P.start = function (...a) { if (!(this.context instanceof OfflineAudioContext)) { C.started++; this.addEventListener('ended', () => C.ended++); } return start.apply(this, a); };
    });
    const cg = BaseAudioContext.prototype.createGain;
    BaseAudioContext.prototype.createGain = function () { if (!(this instanceof OfflineAudioContext)) C.gains++; return cg.call(this); };
  });
  await page.goto('http://localhost:8123/index.html?view=2d'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(400);
  const ev = (f, a) => page.evaluate(f, a);
  const live = () => ev(() => window.__ac.started - window.__ac.ended);

  console.log('# Init');
  await ev(() => { NW.Audio.init(); NW.Audio.setMusic('none'); }); await page.waitForTimeout(5000);
  check(await ev(() => NW.Audio.ready && typeof NW.Audio.play === 'function' && typeof NW.Audio.ambience === 'function' && typeof NW.Audio.updateMusic === 'function' && typeof NW.Audio.applyVolumes === 'function' && typeof NW.Audio.now() === 'number'), 'public API intact, audio ready');
  const base = await live();
  check(base >= 6 && base <= 12, 'continuous loops running (' + base + ' sources)');

  console.log('# SFX');
  const names = await ev(() => NW.Audio.sounds());
  check(NEW.every((n) => names.includes(n)), 'all 25 new sounds exist: missing ' + NEW.filter((n) => !names.includes(n)).join(','));
  check(OLD.every((n) => names.includes(n)), 'every existing sound kept: missing ' + OLD.filter((n) => !names.includes(n)).join(','));
  await ev((all) => { all.forEach((n, i) => NW.Audio.play(n, { vol: 0.5, pan: (i % 5) / 2 - 1, wet: 0.3, delay: i * 0.02 })); ['wood', 'snow', 'dirt', 'water'].forEach((s) => NW.Audio.play('step', { surface: s })); NW.Audio.play('nope'); }, NEW.concat(OLD));
  check(await ev(() => NW.Audio.errors.length === 0), 'every sound plays without errors ' + JSON.stringify(await ev(() => NW.Audio.errors)));
  const peakLive = await live();
  await page.waitForTimeout(9000);
  const after = await live();
  check(after <= base + 4, 'one-shot voices all finish (' + peakLive + ' -> ' + after + ')');

  console.log('# Offline renders (peak / RMS)');
  const stats = await ev(async (all) => {
    const out = {};
    const meas = (buf, from, to) => { let pk = 0, ss = 0, n = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); const a = Math.floor(from * buf.sampleRate), z = Math.min(d.length, Math.floor(to * buf.sampleRate)); for (let i = a; i < z; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; ss += d[i] * d[i]; n++; } } return { pk, rms: Math.sqrt(ss / Math.max(1, n)) }; };
    for (const n of all) {
      const long = n === 'helicopter' || n === 'truck';
      const buf = await NW.Audio.renderSfx(n, { vol: 1 }, long ? 7 : 4);
      const m = meas(buf, 0, buf.duration);
      out[n] = { pk: m.pk, rms: m.rms, early: meas(buf, 0, 0.6).rms, late: meas(buf, 3.5, 4.5).rms, tail: meas(buf, buf.duration - 0.4, buf.duration).pk };
    }
    return out;
  }, NEW.concat(['step', 'chop', 'door', 'knock']));
  for (const n of NEW) { const s = stats[n]; check(s.pk > 0.02 && s.pk <= 1 && Math.max(s.rms, s.early) > 0.0015, n.padEnd(13) + ' peak ' + s.pk.toFixed(3) + ' rms ' + s.rms.toFixed(4)); }
  check(stats.helicopter.late > 0.01 && stats.truck.late > 0.01 && stats.helicopter.tail < 0.05 && stats.truck.tail < 0.05, 'helicopter and truck last seconds and fade out (late rms ' + stats.helicopter.late.toFixed(3) + ' / ' + stats.truck.late.toFixed(3) + ')');
  check(['typewriter', 'page', 'drip', 'reel'].every((n) => stats[n].late < 0.002), 'UI sounds are short');
  // variants: same sound twice renders differently
  const vary = await ev(async () => { const r = []; for (const n of ['step', 'chop', 'door', 'knock']) { const a = await NW.Audio.renderSfx(n, { surface: 'snow' }, 2), c = await NW.Audio.renderSfx(n, { surface: 'snow' }, 2); let diff = 0; const x = a.getChannelData(0), y = c.getChannelData(0); for (let i = 0; i < x.length; i += 7) diff += Math.abs(x[i] - y[i]); r.push(diff); } return r; });
  check(vary.every((d) => d > 0.5), 'frequent sounds have randomized variants ' + vary.map((d) => d.toFixed(1)).join(','));
  // write a few WAVs
  const wavs = await ev(async (list) => {
    const res = {};
    for (const [name, kind] of list) {
      const buf = kind === 'music' ? await NW.Audio.renderMusic(name, 16, 0.3) : await NW.Audio.renderSfx(name, {}, name === 'helicopter' || name === 'truck' ? 7 : 3);
      const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, sr = buf.sampleRate;
      const ab = new ArrayBuffer(44 + n * 4), v = new DataView(ab); let o = 0;
      const s = (str) => { for (const ch of str) v.setUint8(o++, ch.charCodeAt(0)); }; const u32 = (x) => { v.setUint32(o, x, true); o += 4; }; const u16 = (x) => { v.setUint16(o, x, true); o += 2; };
      s('RIFF'); u32(36 + n * 4); s('WAVE'); s('fmt '); u32(16); u16(1); u16(2); u32(sr); u32(sr * 4); u16(4); u16(16); s('data'); u32(n * 4);
      for (let i = 0; i < n; i++) { v.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true); o += 2; v.setInt16(o, Math.max(-1, Math.min(1, R[i])) * 32767, true); o += 2; }
      let bin = ''; const u8 = new Uint8Array(ab); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      res[name] = btoa(bin);
    }
    return res;
  }, [['helicopter', 'sfx'], ['ice_crack', 'sfx'], ['achievement', 'sfx'], ['credits', 'music'], ['mine', 'music']]);
  for (const k in wavs) fs.writeFileSync(WAVS + '/audio-' + k + '.wav', Buffer.from(wavs[k], 'base64'));
  console.log('  wavs written to ' + WAVS);

  console.log('# Music modes (offline)');
  const mus = await ev(async (modes) => {
    const out = {};
    for (const m of modes) {
      const buf = await NW.Audio.renderMusic(m, 24, m === 'night' || m === 'finale' ? 0.7 : 0.1);
      let pk = 0, ss = 0; const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; ss += d[i] * d[i]; }
      out[m] = { pk, rms: Math.sqrt(ss / d.length) };
    }
    return out;
  }, MODES);
  for (const m of MODES) check(mus[m].pk > 0.005 && mus[m].pk < 1 && mus[m].rms > 0.0008, 'music ' + m.padEnd(11) + ' peak ' + mus[m].pk.toFixed(3) + ' rms ' + mus[m].rms.toFixed(4));
  check(mus.finale.rms > mus.night.rms * 0.8 || mus.finale.rms > 0.01, 'finale is driving, not sparse');

  console.log('# Volumes');
  const vols = await ev(async () => {
    const A = NW.Audio, keep = Object.assign({}, A.vol), pk = (buf) => { let p = 0; const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i])); return p; };
    A.vol.music = 0; const m0 = pk(await A.renderMusic('credits', 10));
    A.vol.music = keep.music; A.vol.sfx = 0; const s0 = pk(await A.renderSfx('ice_crack', { wet: 0.9 }, 3));
    A.vol.sfx = keep.sfx; A.vol.amb = 0; const a0 = pk(await A.renderAmb('wolves', 5));
    A.vol.amb = keep.amb; const a1 = pk(await A.renderAmb('wolves', 5)); const m1 = pk(await A.renderMusic('credits', 10));
    A.vol.master = 0; A.applyVolumes(); A.vol.master = keep.master; A.applyVolumes();
    return { m0, s0, a0, a1, m1 };
  });
  check(vols.m0 < 1e-4 && vols.s0 < 1e-4 && vols.a0 < 1e-4, 'music/sfx/amb sliders at 0 silence their bus incl. reverb tails ' + JSON.stringify(vols));
  check(vols.a1 > 0.003 && vols.m1 > 0.003, 'and restore when raised');
  const ambk = await ev(async () => { const r = {}; for (const k of ['wolves', 'ice', 'branch', 'gust']) { const buf = await NW.Audio.renderAmb(k, 5); let p = 0; const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i])); r[k] = p; } return r; });
  check(Object.values(ambk).every((p) => p > 0.002 && p < 0.6), 'ambient events audible but quiet ' + JSON.stringify(ambk));

  console.log('# Live music: every mode, switches, bounded nodes');
  const gains0 = await ev(() => window.__ac.gains);
  let maxLive = 0, maxBus = 0;
  for (const m of MODES) {
    await ev((mm) => NW.Audio.setMusic(mm), m);
    for (let i = 0; i < 6; i++) { await page.waitForTimeout(600); const l = await live(); const st = await ev(() => NW.Audio.stats()); maxLive = Math.max(maxLive, l); maxBus = Math.max(maxBus, st.buses); }
    const st = await ev(() => NW.Audio.stats());
    check(st.mode === m && st.bar >= 1, 'mode ' + m + ' scheduling (bar ' + st.bar + ', live ' + (await live()) + ')');
  }
  console.log('  long runs');
  for (const [m, sec] of [['finale', 30], ['mine', 22], ['credits', 16]]) {
    await ev((mm) => { NW.Audio.setMusic(mm); NW.Audio.ambience({ wind: 0.3, rain: 0, fire: 0, drone: 0, whisper: 0, radio: 0, tension: 0.8 }, 0.016); }, m);
    let mx = 0; for (let i = 0; i < sec; i++) { await page.waitForTimeout(1000); mx = Math.max(mx, await live()); }
    const st = await ev(() => NW.Audio.stats());
    check(st.bar >= 3 && mx < 200, m + ' for ' + sec + 's: ' + st.bar + ' bars, max live sources ' + mx);
    maxLive = Math.max(maxLive, mx);
  }
  console.log('  rapid switching');
  for (let i = 0; i < 40; i++) { await ev((mm) => NW.Audio.setMusic(mm), MODES[i % MODES.length]); await page.waitForTimeout(80); maxBus = Math.max(maxBus, (await ev(() => NW.Audio.stats())).buses); maxLive = Math.max(maxLive, await live()); }
  await ev(() => NW.Audio.setMusic('night')); await page.waitForTimeout(6000);
  const stR = await ev(() => NW.Audio.stats());
  check(maxBus <= 5 && stR.buses <= 2, 'music buses bounded (max ' + maxBus + ', now ' + stR.buses + ')');
  check(maxLive < 400, 'live sources bounded across modes and rapid switches (max ' + maxLive + ')');
  check(await ev(() => NW.Audio.errors.length === 0), 'no audio errors ' + JSON.stringify(await ev(() => NW.Audio.errors)));
  await ev(() => NW.Audio.setMusic('none')); await page.waitForTimeout(5500);
  check(await ev(() => NW.Audio.stats().buses === 0), "'none' fades and drops every bus");
  check(await live() <= base + 6, 'voices drain after silence (' + (await live()) + ')');

  console.log('# In play');
  await ev(() => { NW.G.newGame({ mode: 'standard', seed: 1234, intro: false, guided: false }); });
  await page.waitForTimeout(800);
  check(await ev(() => NW.G.mode === 'play' && NW.Audio.musicMode === 'day'), 'day music in play');
  await ev(() => { NW.G.state.time.min = 7 * 60; });
  await page.waitForTimeout(1200);
  const v1 = await ev(() => NW.Audio.stats().variant);
  check(['morning', 'snow', 'afternoon', 'dusk'].includes(v1), 'day variant chosen from time/weather: ' + v1);
  // fast-forwarded frames must not pile up nodes (ambience and crackles rate-limited on the audio clock)
  const l0 = await live();
  await ev(() => { NW.G.enterArea('room_main', 64, 90, 'down'); NW.G.state.stove.setting = 'high'; NW.G.state.stove.fuel = 60; NW.debug.step(120); });
  const l1 = await live();
  check(l1 - l0 < 120, 'debug.step(120s) does not pile up voices (' + l0 + ' -> ' + l1 + ')');
  await ev(() => { NW.G.enterArea('f_1_2', 200, 170); });
  // wait for at least one distant ambient event (first one 15-30s in)
  let amb = null; for (let i = 0; i < 40 && !amb; i++) { await page.waitForTimeout(1000); amb = await ev(() => NW.Audio.stats().lastAmb); }
  check(!!amb, 'an ambient event fired during play: ' + amb);
  await ev(() => NW.G.save('manual'));
  await page.screenshot({ path: SHOTS + '/audio-play.png' });
  // night
  await ev(() => { const s = NW.G.state; s.time.day = 3; s.time.min = 21 * 60; NW.debug.step(1); });
  await page.waitForTimeout(1500);
  check(await ev(() => NW.Audio.musicMode === 'night' && NW.Audio.stats().mode === 'night'), 'night music after dark');
  await page.waitForTimeout(4000);

  console.log('  gains created on the live context since the music run: ' + ((await ev(() => window.__ac.gains)) - gains0));
  console.log('# Save / reload');
  await ev(() => NW.G.save('manual'));
  await page.reload(); await page.waitForTimeout(500);
  await ev(() => NW.Audio.init());
  await page.click('#b-continue'); await page.waitForTimeout(1500);
  check(await ev(() => NW.G.mode === 'play' && NW.Audio.ready && ['night', 'day'].includes(NW.Audio.stats().mode)), 'reload + continue: music resumes (' + (await ev(() => NW.Audio.stats().mode)) + ')');
  check(await ev(() => !NW.G.state.mods || !('audio' in NW.G.state.mods)), 'audio keeps no run state (old saves unaffected)');

  console.log('# Waveform sheet');
  await ev(async (all) => {
    const cv = document.createElement('canvas'); cv.width = 1300; cv.height = 700; cv.id = 'wavesheet';
    Object.assign(cv.style, { position: 'fixed', left: '30px', top: '30px', zIndex: 9999, background: '#10141c' });
    document.body.appendChild(cv); const x = cv.getContext('2d'); x.font = '12px monospace';
    for (let k = 0; k < all.length; k++) {
      const n = all[k], buf = await NW.Audio.renderSfx(n, {}, n === 'helicopter' || n === 'truck' ? 7 : 3), d = buf.getChannelData(0);
      const cx = (k % 5) * 260, cy = Math.floor(k / 5) * 138, w = 250, h = 110;
      x.fillStyle = '#1b2230'; x.fillRect(cx + 5, cy + 18, w, h); x.fillStyle = '#cfd8e8'; x.fillText(n + ' ' + buf.duration.toFixed(0) + 's', cx + 8, cy + 14);
      x.fillStyle = '#7fb0e0';
      for (let i = 0; i < w; i++) { let p = 0; const a = Math.floor(i / w * d.length), z = Math.floor((i + 1) / w * d.length); for (let j = a; j < z; j++) p = Math.max(p, Math.abs(d[j])); const hh = Math.min(1, p) * h / 2; x.fillRect(cx + 5 + i, cy + 18 + h / 2 - hh, 1, Math.max(1, hh * 2)); }
    }
  }, NEW);
  await page.screenshot({ path: SHOTS + '/audio-waves.png' });

  check(await ev(() => NW.Audio.errors.length === 0), 'A.errors empty at end');
  check(await ev(() => !NW.hookErrors || NW.hookErrors.length === 0), 'NW.hookErrors empty');
  check(errs.length === 0, 'no page errors ' + JSON.stringify(errs.slice(0, 5)));
  console.log(fails ? fails + ' FAILURES' : 'ALL PASSED');
  await b.close(); process.exit(fails ? 1 : 0);
})();
