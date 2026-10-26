'use strict';
// DOM user interface: HUD, prompts, panels (inventory, chest, map, journal, desk, radio, windows, visitors), menus.
(function (NW) {
  const U = NW.U, D = NW.D, I = NW.Inv, S = NW.S;
  const UI = NW.UI = {};
  const $ = (id) => document.getElementById(id);
  const G = () => NW.G;
  const esc = U.escape;
  let stack = [];           // open panel names (top = last)
  const panels = {};
  const txtCache = new Map();
  function setText(el, t) { if (!el) return; if (txtCache.get(el) !== t) { txtCache.set(el, t); el.textContent = t; } }
  function setHTML(el, h) { if (!el) return; if (txtCache.get(el) !== h) { txtCache.set(el, h); el.innerHTML = h; } }

  UI.OBJECTIVES = [
    { k: 'look', text: 'Explore all four rooms of the cabin' },
    { k: 'radio', text: 'Listen to the radio in the office' },
    { k: 'wood', text: 'Gather firewood outside (branches, dead trees)' },
    { k: 'store', text: 'Store wood in the wood box by the stove' },
    { k: 'stove', text: 'Feed the stove and set its heat' },
    { k: 'food', text: 'Forage or hunt (rifle: click or {shoot})' },
    { k: 'cook', text: 'Cook raw food at the cooking station' },
    { k: 'chest', text: 'Check the storage chest' },
    { k: 'map', text: 'Study the map ({map}) or the desk' },
    { k: 'dusk', text: 'Before dark: lock the doors, draw curtains' },
  ];

  const icons = {};
  UI.iconImg = function (id) {
    if (!S.icons[id]) return null;
    if (!icons[id]) { const im = new Image(); im.src = S.icons[id]; icons[id] = im; }
    return icons[id];
  };
  function iconHTML(id) { return S.icons[id] ? '<img class="ic" src="' + S.icons[id] + '" alt="">' : ''; }

  // ============================================================== LAYOUT
  UI.resize = function () {
    const fr = $('frame'), cv = $('game');
    const root = $('root'), cs = getComputedStyle(root);
    const sw = Math.max(200, root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    const sh = Math.max(120, root.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom));
    let sc = Math.min(sw / D.CW, sh / D.CH);
    if (sc >= 2) { const fl = Math.floor(sc); if (fl / sc > 0.86) sc = fl; }
    const w = Math.floor(D.CW * sc), h = Math.floor(D.CH * sc);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    fr.style.width = w + 'px'; fr.style.height = h + 'px';
    fr.style.setProperty('--u', sc);
    UI.scale = sc;
  };

  UI.init = function () {
    UI.resize();
    window.addEventListener('resize', UI.resize);
    $('prompt').addEventListener('mousedown', (e) => {
      const row = e.target.closest('[data-act]'); if (!row) return;
      e.stopPropagation(); G().doAction(+row.dataset.act);
    });
    document.addEventListener('mousedown', (e) => { if (e.target.closest('button,.slot,.tab,input,.prow')) NW.Audio.play('click'); });
    buildMenu();
  };

  // ================================================================= MENU
  // Extra main-menu buttons from feature modules: [{ id, label, run, order }]
  const menuButtons = [];
  UI.registerMenuButton = function (id, label, run, order) { menuButtons.push({ id, label, run, order: order == null ? 50 : order }); if ($('menu').innerHTML) buildMenu(); };
  function buildMenu() {
    const m = $('menu');
    const extra = menuButtons.slice().sort((a, b) => a.order - b.order);
    m.innerHTML = '<div class="menu-inner"><div class="title">THE NIGHT WATCH</div><div class="tagline">One cabin. Long nights. Don\'t open the door.</div>' +
      '<div class="menu-btns"><button id="b-continue">Continue</button><div id="save-info"></div><button id="b-new">New Game</button><button id="b-load">Load Game</button>' +
      extra.map((b) => '<button id="b-x-' + esc(b.id) + '">' + esc(b.label) + '</button>').join('') +
      '<button id="b-howto">How to Play</button><button id="b-settings">Settings</button></div>' +
      '<div id="menu-err"></div><div class="menu-foot">A top-down survival horror · headphones recommended</div></div>';
    $('b-continue').onclick = () => UI.continueGame();
    $('b-new').onclick = () => { NW.Audio.init(); UI.openNewGame(); };
    $('b-load').onclick = () => { NW.Audio.init(); UI.open('slots'); };
    extra.forEach((b) => { $('b-x-' + b.id).onclick = () => { NW.Audio.init(); b.run(); }; });
    $('b-howto').onclick = () => { NW.Audio.init(); UI.open('howto'); };
    $('b-settings').onclick = () => { NW.Audio.init(); UI.open('settings'); };
  }
  // Start a run in a slot (the slot is wiped first). opts as G.newGame.
  UI.startNew = function (opts) { NW.Save.clear(opts.slot); UI.closeAll(); G().newGame(opts); };
  UI.continueGame = function (slot) {
    NW.Audio.init();
    slot = slot || NW.Save.latest() || 1;
    const r = NW.Save.read(slot);
    if (r.state) { NW.Save.slot = slot; r.state.slot = slot; UI.closeAll(); G().loadState(r.state); if (r.recovered) G().msg(r.recovered, 'warn'); }
    else UI.refreshMenu(r.error || 'No saved run found.');
  };
  UI.showMenu = function () {
    G().mode = 'menu'; G().paused = false;
    UI.closeAll();
    $('hud').classList.add('hidden'); $('menu').classList.remove('hidden');
    NW.Audio.setMusic('menu');
    UI.refreshMenu();
  };
  UI.refreshMenu = function (err) {
    const slot = NW.Save.latest();
    const sum = slot ? NW.Save.summary(slot) : null;
    const r = sum ? NW.Save.read(slot) : null;
    const ok = r && r.state;
    $('b-continue').disabled = !ok;
    $('b-load').disabled = !NW.Save.anyExists();
    let info = '';
    if (ok) { const st = r.state; info = 'Slot ' + slot + ' · ' + ((st.mode && st.mode.name) || 'Standard') + ' · Day ' + st.time.day + ' · ' + U.fmtClock(st.time.min) + ' · ' + st.nightsSurvived + ' night' + (st.nightsSurvived === 1 ? '' : 's') + ' survived'; }
    setText($('save-info'), info);
    const e = err || (sum && r && r.error) || (r && r.recovered) || '';
    const box = $('menu-err');
    box.innerHTML = e ? esc(e) + (r && r.error ? ' <button id="b-delsave" class="small">Delete damaged save</button>' : '') : '';
    const del = $('b-delsave'); if (del) del.onclick = () => { NW.Save.clear(slot); UI.refreshMenu(); };
  };
  UI.showGame = function () {
    $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
  };

  // ================================================================ PANELS
  function panelEl(name) {
    if (panels[name]) return panels[name];
    const el = document.createElement('div');
    el.className = 'panel panel-' + name;
    el.innerHTML = '<div class="pbox"></div>';
    $('panels').appendChild(el);
    panels[name] = el;
    return el;
  }
  // Panels that pause the game while open, and panels the player cannot close with Esc.
  const PAUSING = new Set(['pause', 'dawn', 'ending', 'gameover']);
  const STICKY = new Set(['dawn', 'ending', 'gameover']);
  UI.isOpen = (n) => stack.includes(n);
  UI.top = () => stack[stack.length - 1];
  UI.blocksMovement = () => stack.length > 0;
  UI.open = function (name, arg) {
    const el = panelEl(name);
    if (!stack.includes(name)) stack.push(name);
    el.classList.add('open');
    el.style.zIndex = String(10 + stack.length);
    UI.arg = UI.arg || {}; UI.arg[name] = arg;
    G().hold = null;
    renderPanel(name, arg);
    if (PAUSING.has(name) && G().mode === 'play') G().paused = true;
    if (name === 'pause') NW.Audio.play('open');
  };
  UI.close = function (name) {
    const i = stack.indexOf(name); if (i < 0) return;
    stack.splice(i, 1); panels[name].classList.remove('open');
    if (PAUSING.has(name) && name !== 'gameover' && !stack.some((n) => PAUSING.has(n))) G().paused = false;
    if (name === 'talk' || name === 'peephole' || name === 'window') NW.UI._live = null;
  };
  UI.openNames = () => stack.slice();
  UI.closeNames = function (names) { (names || []).forEach((n) => UI.close(n)); };
  UI.closeAll = function () { stack.slice().forEach((n) => UI.close(n)); };

  function renderPanel(name, arg) {
    const box = panels[name].querySelector('.pbox');
    const fn = R[name];
    if (fn) fn(box, arg);
  }
  UI.refresh = function (name) { if (UI.isOpen(name)) renderPanel(name, UI.arg[name]); };
  function head(title, sub) { return '<div class="phead"><span>' + esc(title) + '</span>' + (sub ? '<span class="psub">' + esc(sub) + '</span>' : '') + '<button class="x" data-close>✕</button></div>'; }
  function bindClose(box, name) { box.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => UI.close(name); }); }

  const R = {};
  // ------------------------------------------------------- extension points
  // registerPanel(name, render(box, arg), { pauses, sticky }) — sticky panels ignore Esc (they close themselves).
  UI.registerPanel = function (name, render, opts) {
    R[name] = render; opts = opts || {};
    if (opts.pauses) PAUSING.add(name);
    if (opts.sticky) STICKY.add(name);
  };
  UI.h = { head: (t, s) => head(t, s), bindClose: (b, n) => bindClose(b, n), esc, $, icon: (id) => iconHTML(id), setHTML: (el, h) => setHTML(el, h) };
  UI.addStyle = function (css) { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); };
  // Desk / journal tabs: body(state) returns HTML; after(box) wires up buttons.
  const deskTabs = [], journalTabs = [], settingsSections = [], pauseButtons = [], howtoSections = [];
  UI.registerDeskTab = function (key, label, body, after) { deskTabs.push({ key, label, body, after }); };
  UI.registerJournalTab = function (key, label, body, after) { journalTabs.push({ key, label, body, after }); };
  UI.registerSettings = function (html, bind) { settingsSections.push({ html, bind }); };
  UI.registerPauseButton = function (id, label, run) { pauseButtons.push({ id, label, run }); };
  UI.registerHowto = function (title, html) { howtoSections.push({ title, html }); };
  const runAfter = (t, box) => { if (t && t.after) { try { t.after(box); } catch (e) { console.error(e); } } };
  const runBody = (t, s) => { try { return t.body(s) || ''; } catch (e) { console.error(e); return '<div class="hint">(this page could not be shown)</div>'; } };
  // ---------------------------------------------------------------- text
  UI.openText = function (title, body) { UI.open('text', { title, body }); };
  R.text = function (box, a) {
    box.innerHTML = head(a.title) + '<div class="pbody doc">' + esc(a.body).replace(/\n/g, '<br>') + '</div><div class="pfoot"><button data-close>OK</button></div>';
    bindClose(box, 'text');
  };
  // -------------------------------------------------------------- confirm
  UI.confirm = function (text, yes, no) { UI.open('confirm', { text, yes, no }); };
  R.confirm = function (box, a) {
    box.innerHTML = '<div class="pbody">' + esc(a.text) + '</div><div class="pfoot"><button id="c-yes" class="danger">Yes</button><button id="c-no">Cancel</button></div>';
    $('c-yes').onclick = () => { UI.close('confirm'); a.yes && a.yes(); };
    $('c-no').onclick = () => { UI.close('confirm'); a.no && a.no(); };
  };

  // ------------------------------------------------------------ inventory
  let sel = null;
  R.inv = function (box) {
    const s = G().state;
    const slots = s.inv.map((it, i) => slotHTML(it, 'p', i, sel === i)).join('');
    const it = sel != null ? s.inv[sel] : null;
    let det = '<div class="hint">Select an item. Click to select; double-click to use.</div>';
    if (it) {
      const d = D.ITEMS[it.id];
      const modUse = NW.Hooks.filter('itemUsable', null, it.id); // a label such as 'Set snare', or null
      const usable = d.kind === 'food' || d.kind === 'raw' || d.kind === 'medicine' || !!modUse;
      det = '<div class="det-name">' + iconHTML(it.id) + esc(d.name) + ' ×' + it.n + '</div><div class="det-desc">' + esc(d.desc) + '</div>' +
        (d.food ? '<div class="det-stat">Hunger +' + d.food + (d.heal ? ' · Health ' + (d.heal > 0 ? '+' : '') + d.heal : '') + '</div>' : '') + (d.kind === 'medicine' ? '<div class="det-stat">Health +' + d.heal + (d.warm ? ' · Warms you' : '') + '</div>' : '') +
        '<div class="det-btns">' + (usable ? '<button id="i-use">' + esc(modUse || (d.kind === 'medicine' ? 'Use' : 'Eat')) + '</button>' : '') + '<button id="i-drop1">Drop 1</button><button id="i-dropall">Drop all</button></div>';
    }
    const p = s.player;
    box.innerHTML = head('Pack', I.count(s.inv, 'wood') + ' wood · ' + I.count(s.inv, 'ammo') + ' rounds') +
      '<div class="pbody inv-wrap"><div class="grid g5">' + slots + '</div><div class="inv-det">' + det + '</div></div>' +
      '<div class="pfoot small-txt">Equipment: hatchet, ranger rifle, lantern, keys · Wearing: ' + (p.coat === 'parka' ? 'heavy parka (warm outside, hot indoors, tires faster)' : 'ranger jacket') + ' · F: quick-eat · H: quick-heal · Time keeps moving.</div>';
    bindClose(box, 'inv');
    box.querySelectorAll('.slot').forEach((el) => {
      el.onclick = () => { const i = +el.dataset.i; sel = s.inv[i] ? i : null; UI.refresh('inv'); };
      el.ondblclick = () => { const i = +el.dataset.i; if (s.inv[i]) { NW.Survival.useItem(s.inv[i].id); if (!s.inv[i]) sel = null; UI.refresh('inv'); } };
    });
    const use = $('i-use'); if (use) use.onclick = () => { NW.Survival.useItem(it.id); if (!s.inv[sel]) sel = null; UI.refresh('inv'); };
    const d1 = $('i-drop1'); if (d1) d1.onclick = () => { I.remove(s.inv, it.id, 1); G().dropItem(it.id, 1); if (!s.inv[sel]) sel = null; UI.refresh('inv'); };
    const da = $('i-dropall'); if (da) da.onclick = () => { const n = it.n; s.inv[sel] = null; G().dropItem(it.id, n); sel = null; UI.refresh('inv'); };
  };
  function slotHTML(it, side, i, selected) {
    if (!it) return '<div class="slot empty" data-side="' + side + '" data-i="' + i + '"></div>';
    return '<div class="slot' + (selected ? ' sel' : '') + '" data-side="' + side + '" data-i="' + i + '" title="' + esc(D.ITEMS[it.id].name + ' — ' + D.ITEMS[it.id].desc) + '">' + iconHTML(it.id) + '<span class="n">' + it.n + '</span></div>';
  }
  // ------------------------------------------------------------------ chest
  R.chest = function (box) {
    const s = G().state;
    box.innerHTML = head('Storage chest', 'Click: move stack · Shift+click: move one') +
      '<div class="pbody chest-wrap"><div><div class="lbl">Your pack</div><div class="grid g5">' + s.inv.map((it, i) => slotHTML(it, 'p', i)).join('') + '</div></div>' +
      '<div><div class="lbl">Chest</div><div class="grid g6">' + s.chest.map((it, i) => slotHTML(it, 'c', i)).join('') + '</div></div></div>' +
      '<div class="pfoot"><button id="ch-food">Store food</button><button id="ch-mat">Store materials</button><button id="ch-sort">Sort chest</button><button data-close>Close</button></div>';
    bindClose(box, 'chest');
    box.querySelectorAll('.slot').forEach((el) => {
      el.onclick = (e) => {
        const from = el.dataset.side === 'p' ? s.inv : s.chest, to = el.dataset.side === 'p' ? s.chest : s.inv;
        const i = +el.dataset.i, it = from[i]; if (!it) return;
        const n = e.shiftKey ? 1 : it.n;
        const left = I.add(to, it.id, n);
        const moved = n - left;
        if (moved <= 0) { G().msg('No room.', 'warn'); return; }
        it.n -= moved; if (it.n <= 0) from[i] = null;
        UI.refresh('chest');
      };
    });
    const moveKinds = (kinds) => { s.inv.forEach((it, i) => { if (it && kinds.includes(D.ITEMS[it.id].kind)) { const left = I.add(s.chest, it.id, it.n); if (left > 0) it.n = left; else s.inv[i] = null; } }); UI.refresh('chest'); };
    $('ch-food').onclick = () => moveKinds(['food', 'raw']);
    $('ch-mat').onclick = () => { s.inv.forEach((it, i) => { if (it && D.ITEMS[it.id].kind === 'material' && it.id !== 'ammo') { const left = I.add(s.chest, it.id, it.n); if (left > 0) it.n = left; else s.inv[i] = null; } }); UI.refresh('chest'); };
    $('ch-sort').onclick = () => { I.compact(s.chest); UI.refresh('chest'); };
  };

  // -------------------------------------------------------------------- map
  R.map = function (box) {
    box.innerHTML = head('Map of the Silverpine backcountry', 'Ranger Station 7') + '<div class="pbody map-wrap"><canvas id="map-c" width="472" height="277"></canvas>' +
      '<div class="legend">■ <b class="red">You</b> &nbsp; ▣ HQ supply drop &nbsp; ? unexplored &nbsp; Trails in brown · water blue · the red mark is the Red Cairn as surveyed</div></div>';
    bindClose(box, 'map');
    NW.Render.map($('map-c'), { player: true });
    G().tut('map');
  };

  // ---------------------------------------------------------------- journal
  let jtab = 'notes';
  R.journal = function (box) {
    const s = G().state;
    s.journal.unread = 0;
    const tabs = [['notes', 'Notes'], ['sightings', 'Sightings'], ['visitors', 'Visitors'], ['radio', 'Radio log'], ['bestiary', 'What I know']].concat(journalTabs.map((t) => [t.key, t.label]));
    const xt = journalTabs.find((t) => t.key === jtab);
    let body = '';
    if (jtab === 'bestiary') body = bestiaryHTML();
    else if (xt) body = runBody(xt, s);
    else {
      const list = s.journal.entries.filter((e) => e.cat === jtab).slice().reverse();
      body = list.length ? list.map((e) => '<div class="entry"><div class="when">Day ' + e.day + ' · ' + U.fmtClock(e.min) + '</div>' + esc(e.text) + '</div>').join('') : '<div class="hint">Nothing written here yet.</div>';
    }
    box.innerHTML = head('Journal') + '<div class="tabs">' + tabs.map(([k, l]) => '<div class="tab' + (k === jtab ? ' on' : '') + '" data-tab="' + k + '">' + l + '</div>').join('') + '</div><div class="pbody doc paper">' + body + '</div>';
    bindClose(box, 'journal');
    box.querySelectorAll('.tab').forEach((t) => { t.onclick = () => { jtab = t.dataset.tab; UI.refresh('journal'); }; });
    runAfter(xt, box);
  };
  function bestiaryHTML() {
    const s = G().state; let h = '';
    for (const k in D.BESTIARY) {
      const b = D.BESTIARY[k], got = s.journal.rules[k] || [];
      if (!got.length) { h += '<div class="beast unknown"><div class="bname">??? </div><div class="hint">Not yet encountered.</div></div>'; continue; }
      h += '<div class="beast"><div class="bname">' + esc(b.name) + '</div><ul>' + b.rules.map((r, i) => got.includes(i) ? '<li>' + esc(r) + '</li>' : '<li class="unk">— (something else to learn)</li>').join('') + '</ul></div>';
    }
    return h;
  }

  // ------------------------------------------------------------------- desk
  let dtab = 'overview';
  R.desk = function (box) {
    const s = G().state;
    s.deskNews = false;
    const tabs = [['overview', 'Overview'], ['visitor', 'At the door'], ['permits', 'Permit records'], ['reports', 'HQ reports'], ['ledger', 'Visitor ledger'], ['cabin', 'Cabin']].concat(deskTabs.map((t) => [t.key, t.label]), [['map', 'Map']]);
    const xt = deskTabs.find((t) => t.key === dtab);
    let body = '';
    if (xt) body = runBody(xt, s);
    else if (dtab === 'overview') {
      const f = s.forecast;
      const rep = s.rep >= 2 ? 'Base trusts you. Supply drops are frequent.' : s.rep >= 0 ? 'Base considers your record acceptable.' : 'Base is questioning your judgement. Supply drops are rare.';
      body = '<h3>Recent developments</h3>' + (s.records.reports.slice(-5).reverse().map((r) => '<div class="entry"><div class="when">Day ' + r.day + '</div>' + esc(r.text) + '</div>').join('') || '<div class="hint">Nothing new.</div>') +
        '<h3>Forecast</h3><div class="entry">Today: ' + NW.Weather.INFO[f.day.type].label + ', ' + f.day.temp + '°C. Tonight: ' + NW.Weather.INFO[f.night.type].label + ', low ' + f.night.temp + '°C.</div>' +
        (s.world.dropArea ? '<div class="entry"><b>Supply drop</b> waiting at ' + esc(D.AREAS[s.world.dropArea].name) + '.</div>' : '') +
        '<h3>Standing</h3><div class="entry">' + rep + '</div>' +
        (NW.Night.visitorAtDoor() ? '<div class="entry alert">Someone is at the front door. See "At the door".</div>' : '');
    } else if (dtab === 'visitor') {
      const v = NW.Night.currentVisitor();
      if (!v) body = '<div class="hint">No one is at the door. When a visitor arrives, their claims appear here next to what the records say.</div>';
      else {
        const asked = v.log || [];
        const claims = asked.length ? asked.map((q) => '<div class="entry"><div class="when">' + esc(q.q) + '</div>"' + esc(q.a) + '"</div>').join('') : '<div class="hint">You have not spoken to them yet. Talk to them at the front door.</div>';
        let rec = '';
        const namesaid = v.log && v.log.some((q) => q.k === 'who');
        if (namesaid) {
          const pm = s.records.permits.filter((p) => p.name === v.name);
          rec += pm.length ? pm.map((p) => '<div class="entry">Permit: <b>' + esc(p.name) + '</b>, party of ' + p.party + ', route ' + esc(D.AREAS[p.origin].name) + ', issued day ' + p.day + '. Status: <b>' + statusTxt(p) + '</b></div>').join('') : '<div class="entry">No permit on file under the name ' + esc(v.name) + '.</div>';
          const prev = Object.values(s.visitors).filter((x) => x.name === v.name && x.id !== v.id && x.outcome);
          prev.forEach((x) => { rec += '<div class="entry">Ledger: a visitor giving the name ' + esc(x.name) + ' came on night ' + x.night + ' (' + outcomeTxt(x) + ').</div>'; });
        }
        if (v.log && v.log.some((q) => q.k === 'where')) {
          const [ox, oy] = D.areaXY(v.origin);
          rec += '<div class="entry">Map: ' + esc(D.AREAS[v.origin].name) + ' lies ' + D.DIRNAME(ox - 2, oy - 2) + ' of the cabin.' + (s.world.bridgeOut ? ' Report: the Crow Creek bridge is out.' : '') + '</div>';
        }
        if (s.radio.log.length) { const last = s.radio.log[s.radio.log.length - 1]; rec += '<div class="entry">Last radio (' + U.fmtClock(last.min) + '): "' + esc(last.text.slice(0, 160)) + (last.text.length > 160 ? '…' : '') + '"</div>'; }
        body = '<div class="cols"><div><h3>What they told you</h3>' + claims + '</div><div><h3>What the records say</h3>' + (rec || '<div class="hint">Ask their name and where they came from.</div>') + '</div></div><div class="hint">The records do not decide for you. Real people misremember; Mimics lie well.</div>';
      }
    } else if (dtab === 'permits') {
      body = '<table class="tbl"><tr><th>Name</th><th>Party</th><th>Route</th><th>Issued</th><th>Status</th></tr>' + s.records.permits.slice().reverse().map((p) => '<tr><td>' + esc(p.name) + '</td><td>' + p.party + '</td><td>' + esc(D.AREAS[p.origin].name) + '</td><td>Day ' + p.day + '</td><td class="st-' + p.status + '">' + statusTxt(p) + '</td></tr>').join('') + '</table>';
    } else if (dtab === 'reports') {
      body = s.records.reports.slice().reverse().map((r) => '<div class="entry"><div class="when">Day ' + r.day + '</div>' + esc(r.text) + '</div>').join('');
    } else if (dtab === 'ledger') {
      const vs = Object.values(s.visitors).filter((v) => v.outcome || (s.night.vis && s.night.vis.vid === v.id));
      body = vs.length ? '<table class="tbl"><tr><th>Night</th><th>Gave name</th><th>Decision</th><th>Truth</th></tr>' + vs.map((v) => '<tr><td>' + v.night + '</td><td>' + esc(v.name) + '</td><td>' + outcomeTxt(v) + '</td><td>' + (v.revealed ? (v.mimic ? '<b class="red">Mimic</b>' : 'Real person') : 'Unknown') + '</td></tr>').join('') + '</table>' : '<div class="hint">No visitors yet.</div>';
    } else if (dtab === 'cabin') {
      body = '<h3>Windows</h3>' + Object.keys(s.cabin.windows).map((w) => '<div class="entry">' + esc(NW.Cabin.windowLabel(w)) + '</div>').join('') + '<h3>Doors</h3>' + Object.keys(s.cabin.doors).map((d) => '<div class="entry">' + esc(NW.Cabin.doorLabel(d)) + '</div>').join('') +
        '<h3>Repairs (done at the window or door itself)</h3>' + Object.values(D.REPAIRS).map((r) => '<div class="entry">' + esc(r.name) + ': ' + esc(I.reqText(r.in, s.inv)) + '</div>').join('') + '<div class="hint">Planks: saw 2 firewood at the sawhorse in storage. Nails, scrap, rope and glass are salvaged from landmarks and supply drops.</div>';
    } else if (dtab === 'map') {
      body = '<canvas id="desk-map" width="472" height="277"></canvas>';
    }
    box.innerHTML = head("Ranger's desk", 'Best read when the cabin is quiet') + '<div class="tabs">' + tabs.map(([k, l]) => '<div class="tab' + (k === dtab ? ' on' : '') + '" data-tab="' + k + '">' + l + (k === 'visitor' && NW.Night.visitorAtDoor() ? ' •' : '') + '</div>').join('') + '</div><div class="pbody doc paper">' + body + '</div>';
    bindClose(box, 'desk');
    box.querySelectorAll('.tab').forEach((t) => { t.onclick = () => { dtab = t.dataset.tab; UI.refresh('desk'); }; });
    if (dtab === 'map') NW.Render.map($('desk-map'), { player: true });
    runAfter(xt, box);
    G().tut('desk');
  };
  function statusTxt(p) { return { active: 'In the backcountry', checkedout: 'Checked out (day ' + p.statusDay + ')', missing: 'MISSING', rescued: 'Rescued (frostbite)' }[p.status] || p.status; }
  function outcomeTxt(v) { return { sheltered: 'Let in', opened: 'Opened the door', refused: 'Turned away', ignored: 'Ignored', null: 'At the door' }[v.outcome] || 'At the door'; }

  // ------------------------------------------------------------------ radio
  R.radio = function (box) {
    const s = G().state;
    const fresh = NW.Events.hearAll();
    const show = fresh.length ? fresh : s.radio.log.slice(-1);
    const msgHTML = (m, isNew) => '<div class="rmsg' + (isNew ? ' new' : '') + '"><div class="when">Day ' + m.day + ' · ' + U.fmtClock(m.min) + (m.from === 'base' ? '' : ' · unidentified signal') + '</div><div class="rtext" data-full="' + esc(m.text) + '"></div></div>';
    box.innerHTML = head('Radio', fresh.length ? fresh.length + ' new transmission' + (fresh.length > 1 ? 's' : '') : 'No new transmissions') +
      '<div class="pbody doc radio-body">' + (show.length ? show.map((m) => msgHTML(m, fresh.length > 0)).join('') : '<div class="hint">Only static.</div>') +
      '<h3>Earlier</h3>' + (s.radio.log.slice(0, Math.max(0, s.radio.log.length - show.length)).slice(-8).reverse().map((m) => '<div class="entry"><div class="when">Day ' + m.day + ' · ' + U.fmtClock(m.min) + '</div>' + esc(m.text) + '</div>').join('') || '<div class="hint">—</div>') + '</div>';
    bindClose(box, 'radio');
    // typewriter
    const els = Array.from(box.querySelectorAll('.rtext'));
    let i = 0, c = 0;
    const tick = () => {
      if (!UI.isOpen('radio') || i >= els.length) return;
      const full = els[i].dataset.full;
      c += 3; els[i].textContent = full.slice(0, c);
      if (c >= full.length) { i++; c = 0; }
      if (Math.random() < 0.3) NW.Audio.play('animal', { vol: 0.05 });
      setTimeout(tick, 22);
    };
    if (fresh.length) { NW.Audio.play('beep'); tick(); } else els.forEach((e) => { e.textContent = e.dataset.full; });
    if (fresh.length) G().tut('radio');
  };

  // --------------------------------------------------------------- windows
  R.window = function (box, wid) {
    box.innerHTML = head(NW.Cabin.WINDOW_NAMES[wid], 'Looking outside') + '<div class="pbody view-wrap"><canvas id="win-c" width="240" height="135"></canvas><div id="win-cap" class="cap"></div></div>' +
      '<div class="pfoot"><button id="w-curt"></button><button id="w-shut"></button><button data-close>Step back</button></div>';
    bindClose(box, 'window');
    const s = G().state, w = s.cabin.windows[wid];
    const sync = () => { setText($('w-curt'), w.curtClosed ? 'Open curtains' : 'Draw curtains'); setText($('w-shut'), w.shutter <= 0 ? 'Shutters broken' : 'Close shutters'); $('w-shut').disabled = w.shutter <= 0; };
    $('w-curt').onclick = () => { w.curtClosed = !w.curtClosed; NW.Audio.play('curtain'); G().tut('curtain'); sync(); };
    $('w-shut').onclick = () => { if (w.shutter > 0) { w.shutClosed = true; NW.Audio.play('shutter'); UI.close('window'); } };
    sync();
    UI._live = { kind: 'window', wid };
  };
  R.peephole = function (box) {
    const vis = NW.Night.visitorAtDoor();
    box.innerHTML = head('Peephole', 'Front door') + '<div class="pbody view-wrap"><canvas id="pp-c" width="160" height="160" class="round"></canvas><div id="pp-cap" class="cap"></div></div>' +
      '<div class="pfoot">' + (vis ? '<button id="pp-talk">Talk</button><button id="pp-open" class="danger">Open the door</button><button id="pp-refuse">Tell them to leave</button>' : '') + '<button data-close>Step back</button></div>';
    bindClose(box, 'peephole');
    if (vis) { $('pp-talk').onclick = () => { UI.close('peephole'); UI.open('talk'); }; $('pp-open').onclick = () => NW.Night.openForVisitor(); $('pp-refuse').onclick = () => NW.Night.refuseVisitor(); }
    UI._live = { kind: 'peephole', vis: !!vis };
  };
  const QUESTIONS = [['who', 'Who are you?'], ['where', 'Where did you come from?'], ['what', 'What happened to you?'], ['weather', "How's the weather out there?"], ['need', 'What do you need?']];
  R.talk = function (box) {
    const v = NW.Night.currentVisitor();
    if (!v) { box.innerHTML = head('Front door') + '<div class="pbody">No one is there anymore.</div>'; bindClose(box, 'talk'); return; }
    v.log = v.log || [];
    const porch = NW.G.area && NW.G.area.kind === 'forest';
    box.innerHTML = head(porch ? 'Talking on the porch' : 'Talking through the door', porch ? 'You are outside with them. Time is passing.' : 'They can hear you. Time is passing.') +
      '<div class="pbody talk-wrap"><canvas id="talk-c" width="128" height="128" class="round"></canvas><div class="talk-right"><div id="talk-log" class="doc">' +
      (v.log.length ? v.log.map((l) => '<div class="q">› ' + esc(l.q) + '</div><div class="a">"' + esc(l.a) + '"</div>').join('') : '<div class="hint">' + (porch ? 'A figure on the porch, an arm\'s length away. Ask your questions. Compare what you hear with the records at the desk.' : 'A shape on the other side of the door, waiting. Ask your questions. Compare what you hear with the records at the desk.') + '</div>') +
      '</div><div class="qbtns">' + QUESTIONS.map(([k, q], i) => '<button data-q="' + k + '"' + (v.asked[k] ? ' class="asked"' : '') + '>' + (i + 1) + '. ' + esc(q) + '</button>').join('') + '</div></div></div>' +
      '<div class="pfoot"><button id="t-open" class="danger">' + (porch ? 'Let them in (go inside together)' : 'Open the door') + '</button><button id="t-refuse">Tell them to leave</button><button data-close>Step away</button></div>';
    bindClose(box, 'talk');
    box.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => ask(b.dataset.q); });
    // on the porch, letting them in means walking in together, and it takes a second click to commit
    $('t-open').onclick = porch ? () => {
      const b = $('t-open');
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Click again to let them in'; return; }
      UI.close('talk'); NW.G.enterCabin('front');
    } : () => NW.Night.openForVisitor();
    $('t-refuse').onclick = () => NW.Night.refuseVisitor();
    const lg = $('talk-log'); lg.scrollTop = lg.scrollHeight;
    UI._live = { kind: 'talk' };
  };
  function ask(k) {
    const v = NW.Night.currentVisitor(); if (!v) return;
    const q = QUESTIONS.find((x) => x[0] === k)[1];
    const a = NW.Night.answer(v, k);
    v.log = v.log || [];
    v.log.push({ k, q, a });
    if (!v.journaled) v.journaled = {};
    if (!v.journaled[k]) { v.journaled[k] = true; NW.Events.journal('Night ' + v.night + ' visitor — asked "' + q + '" — "' + a + '"', 'visitors'); }
    UI.talkT = 1.5;
    UI.refresh('talk');
  }
  R.reveal = function (box, vid) {
    box.innerHTML = '<div class="pbody view-wrap"><canvas id="rv-c" width="200" height="200"></canvas><div class="cap red big">IT WAS NOT A PERSON</div></div>';
    UI._live = { kind: 'reveal', vid, t0: performance.now() };
    setTimeout(() => UI.close('reveal'), 2800);
  };

  // --------------------------------------------------------------- new game
  // Remembers the last choices so "New Game" opens where the player left it.
  const ng = { mode: 'standard', custom: { nights: 10, monster: 1, damage: 1, hunger: 1, patience: 1, loot: 1 }, seed: '', slot: 0, intro: true, guided: true };
  const CUSTOM = [['nights', 'Nights to survive', 3, 40, 1], ['monster', 'Monster aggression', 0.5, 2, 0.05], ['damage', 'Damage taken', 0.5, 2, 0.05], ['hunger', 'Hunger speed', 0.5, 2, 0.05], ['patience', 'Visitor patience', 0.5, 2, 0.05], ['loot', 'Salvage found', 0.5, 2, 0.05]];
  const fmtCustom = (k, v) => (k === 'nights' ? String(v) : Math.round(v * 100) + '%');
  // Each fresh open suggests the first empty slot (or the slot passed in); refreshes keep the current pick.
  UI.openNewGame = function (arg) { ng.slot = 0; UI.open('newgame', arg || {}); };
  const hasIntro = () => !!(NW.Hooks._h.playIntro && NW.Hooks._h.playIntro.length);
  R.newgame = function (box, arg) {
    if (arg && !arg.used) {
      arg.used = true;
      if (arg.mode && D.MODES[arg.mode]) ng.mode = arg.mode;
      if (arg.mode === 'custom' && arg.custom) CUSTOM.forEach(([k]) => { if (typeof arg.custom[k] === 'number') ng.custom[k] = arg.custom[k]; });
      if (arg.slot) ng.slot = arg.slot;
    }
    if (!ng.slot) ng.slot = NW.Save.firstFree() || NW.Save.latest() || 1;
    const slots = NW.Save.list();
    const sumTxt = (m) => (!m ? 'empty' : !m.valid ? 'damaged save' : esc(m.mode) + ' · day ' + m.day + ' · ' + m.nights + ' night' + (m.nights === 1 ? '' : 's') + ' survived');
    const modeCard = (id) => { const m = D.MODES[id]; return '<div class="mode-card' + (ng.mode === id ? ' on' : '') + '" data-mode="' + id + '"><div class="mc-name">' + esc(m.name) + '</div><div class="mc-n">' + (id === 'custom' ? fmtCustom('nights', ng.custom.nights) : m.nights) + ' nights' + (m.endings ? ' · endings' : '') + '</div><div class="mc-d">' + esc(m.desc) + '</div></div>'; };
    box.innerHTML = head('New game') + '<div class="pbody newgame">' +
      '<h3>Difficulty</h3><div class="mode-grid">' + Object.keys(D.MODES).map(modeCard).join('') + '</div>' +
      (ng.mode === 'custom' ? '<div class="custom-box">' + CUSTOM.map(([k, l, lo, hi, st]) => '<label class="srow"><span>' + l + '</span><input type="range" min="' + lo + '" max="' + hi + '" step="' + st + '" value="' + ng.custom[k] + '" data-c="' + k + '"><span class="sv">' + fmtCustom(k, ng.custom[k]) + '</span></label>').join('') + '</div>' : '') +
      '<h3>Save slot</h3><div class="slot-pick">' + slots.map((m, i) => '<label class="slot-opt' + (ng.slot === i + 1 ? ' on' : '') + '"><input type="radio" name="ng-slot" value="' + (i + 1) + '"' + (ng.slot === i + 1 ? ' checked' : '') + '><b>Slot ' + (i + 1) + '</b> <span class="dim">' + sumTxt(m) + '</span></label>').join('') + '</div>' +
      '<h3>World seed</h3><div class="seed-row"><input id="ng-seed" type="text" maxlength="24" placeholder="random" value="' + esc(ng.seed) + '" spellcheck="false" autocomplete="off"><button id="ng-rand" class="small">Random</button></div><div class="hint">Same seed and difficulty = the same forest, visitors and nights. Share it with a friend.</div>' +
      '<h3>Options</h3>' + (hasIntro() ? '<label class="srow"><span>Play the opening scene</span><input type="checkbox" id="ng-intro"' + (ng.intro ? ' checked' : '') + '></label>' : '') +
      '<label class="srow"><span>Guided first day (step-by-step help)</span><input type="checkbox" id="ng-guided"' + (ng.guided ? ' checked' : '') + '></label>' +
      '</div><div class="pfoot"><button id="ng-start" class="strong">Start the watch</button><button data-close>Cancel</button></div>';
    bindClose(box, 'newgame');
    box.querySelectorAll('[data-mode]').forEach((c) => { c.onclick = () => { ng.mode = c.dataset.mode; UI.refresh('newgame'); }; });
    box.querySelectorAll('[data-c]').forEach((r) => { r.oninput = () => { const k = r.dataset.c; ng.custom[k] = k === 'nights' ? Math.round(+r.value) : Math.round(+r.value * 100) / 100; r.nextElementSibling.textContent = fmtCustom(k, ng.custom[k]); const n = box.querySelector('[data-mode=custom] .mc-n'); if (n && k === 'nights') n.textContent = ng.custom.nights + ' nights · endings'; }; });
    box.querySelectorAll('input[name=ng-slot]').forEach((r) => { r.onchange = () => { ng.slot = +r.value; UI.refresh('newgame'); }; });
    const seedIn = $('ng-seed');
    seedIn.oninput = () => { ng.seed = seedIn.value.replace(/[^A-Za-z0-9-]/g, '').toUpperCase(); if (seedIn.value !== ng.seed) seedIn.value = ng.seed; };
    $('ng-rand').onclick = () => { ng.seed = ''; seedIn.value = ''; };
    const intro = $('ng-intro'); if (intro) intro.onchange = () => { ng.intro = intro.checked; };
    $('ng-guided').onchange = (e) => { ng.guided = e.target.checked; };
    $('ng-start').onclick = () => {
      const opts = { mode: ng.mode, custom: ng.mode === 'custom' ? Object.assign({}, ng.custom) : null, slot: ng.slot, seed: ng.seed, intro: hasIntro() && ng.intro, guided: ng.guided };
      const m = slots[ng.slot - 1];
      if (m) UI.confirm('Slot ' + ng.slot + ' already holds a run (' + (m.valid ? m.mode + ', day ' + m.day : 'damaged') + '). Overwrite it?', () => UI.startNew(opts));
      else UI.startNew(opts);
    };
  };

  // ------------------------------------------------------------- load slots
  R.slots = function (box) {
    const slots = NW.Save.list();
    const when = (t) => { if (!t) return ''; const d = new Date(t); return d.toLocaleDateString() + ' ' + U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes()); };
    box.innerHTML = head('Load game') + '<div class="pbody slots">' + slots.map((m, i) => {
      const n = i + 1;
      if (!m) return '<div class="slot-row empty"><b>Slot ' + n + '</b><span class="dim">Empty</span></div>';
      if (!m.valid) return '<div class="slot-row"><b>Slot ' + n + '</b><span class="red">Damaged save</span><button data-load="' + n + '" class="small">Try to recover</button><button data-del="' + n + '" class="small danger">Delete</button></div>';
      return '<div class="slot-row"><b>Slot ' + n + '</b><span>' + esc(m.mode) + ' · Day ' + m.day + ' · ' + U.fmtClock(m.min) + ' · ' + m.nights + '/' + m.final + ' nights<br><span class="dim">Seed ' + esc(String(m.seed || '?')) + ' · saved ' + when(m.t) + '</span></span><button data-load="' + n + '">Load</button><button data-del="' + n + '" class="small danger">Delete</button></div>';
    }).join('') + '<div id="slots-err" class="red"></div></div><div class="pfoot"><button data-close>Back</button></div>';
    bindClose(box, 'slots');
    box.querySelectorAll('[data-load]').forEach((b) => { b.onclick = () => {
      const n = +b.dataset.load; const r = NW.Save.read(n);
      if (r.state) { NW.Save.slot = n; r.state.slot = n; UI.closeAll(); G().loadState(r.state); if (r.recovered) G().msg(r.recovered, 'warn'); }
      else $('slots-err').textContent = r.error || 'Could not load that slot.';
    }; });
    box.querySelectorAll('[data-del]').forEach((b) => { b.onclick = () => { const n = +b.dataset.del; UI.confirm('Delete the run in slot ' + n + '? This cannot be undone.', () => { NW.Save.clear(n); UI.refresh('slots'); UI.refreshMenu(); }); }; });
  };

  // ------------------------------------------------------------------ pause
  R.pause = function (box) {
    const s = G().state;
    box.innerHTML = '<div class="phead"><span>Paused</span><span class="psub">Day ' + s.time.day + ' · ' + U.fmtClock(s.time.min) + ' · ' + esc((s.mode && s.mode.name) || 'Standard') + ' · slot ' + (s.slot || 1) + '</span></div><div class="pbody menu-col">' +
      '<button id="p-resume">Resume</button><button id="p-save">Save game</button><button id="p-journal">Journal</button>' + pauseButtons.map((b) => '<button id="p-x-' + esc(b.id) + '">' + esc(b.label) + '</button>').join('') +
      '<button id="p-howto">How to play</button><button id="p-settings">Settings</button><button id="p-quit" class="strong">Save &amp; Quit to menu</button><button id="p-quitns" class="danger small">Quit without saving</button>' +
      '<div class="seedline">Seed <b>' + esc(s.seedText || String(s.seed)) + '</b> — share it to play the same forest</div></div>';
    pauseButtons.forEach((b) => { $('p-x-' + b.id).onclick = () => b.run(); });
    $('p-resume').onclick = () => UI.close('pause');
    $('p-save').onclick = () => { if (G().save('manual')) { G().msg('Game saved.', 'good'); setText($('p-save'), 'Saved ✓'); } };
    $('p-journal').onclick = () => UI.open('journal');
    $('p-howto').onclick = () => UI.open('howto');
    $('p-settings').onclick = () => UI.open('settings');
    $('p-quit').onclick = () => { G().paused = false; const ok = G().save('quit'); if (ok) UI.showMenu(); else UI.confirm('Saving failed. Quit anyway and lose progress since the last save?', () => UI.showMenu()); };
    $('p-quitns').onclick = () => UI.confirm('Quit to the menu without saving? Progress since the last autosave will be lost.', () => UI.showMenu());
  };
  R.settings = function (box) {
    const st = NW.settings;
    const sl = (k, l) => '<label class="srow"><span>' + l + '</span><input type="range" min="0" max="100" value="' + Math.round(st[k] * 100) + '" data-k="' + k + '"><span class="sv">' + Math.round(st[k] * 100) + '</span></label>';
    const K = NW.Keys, cap = UI._capture;
    const keyBtn = (id, i) => '<button class="keyb' + (cap && cap.action === id && cap.slot === i ? ' cap' : '') + '" data-bind="' + id + '" data-slot="' + i + '">' + (cap && cap.action === id && cap.slot === i ? 'press a key…' : esc(K.label(K.binds[id][i]))) + '</button>';
    box.innerHTML = head('Settings') + '<div class="pbody settings-body"><h3>Sound</h3>' + sl('master', 'Master volume') + sl('music', 'Music') + sl('sfx', 'Sound effects') + sl('amb', 'Ambience') +
      '<h3>Display</h3><label class="srow"><span>Screen shake</span><input type="checkbox" id="s-shake"' + (st.shake ? ' checked' : '') + '></label>' +
      settingsSections.map((x) => { try { return x.html(); } catch (e) { console.error(e); return ''; } }).join('') +
      '<h3>Controls</h3><div class="hint">Click a key to change it, then press the new key. Esc cancels, Backspace clears. Number keys 1–9 always pick actions.</div>' +
      '<table class="tbl keys rebind">' + K.ACTIONS.map(([id, label]) => '<tr><td>' + esc(label) + '</td><td>' + keyBtn(id, 0) + '</td><td>' + keyBtn(id, 1) + '</td></tr>').join('') + '</table>' +
      '<button id="s-keyreset" class="small">Reset controls</button></div><div class="pfoot"><button id="s-reset">Reset sound</button><button data-close>Done</button></div>';
    bindClose(box, 'settings');
    box.querySelectorAll('[data-bind]').forEach((b) => { b.onclick = () => { UI._capture = { action: b.dataset.bind, slot: +b.dataset.slot }; const sc = box.querySelector('.pbody').scrollTop; UI.refresh('settings'); box.querySelector('.pbody').scrollTop = sc; }; });
    $('s-keyreset').onclick = () => { K.reset(); K.save(); UI._capture = null; UI.refresh('settings'); };
    settingsSections.forEach((x) => { if (x.bind) { try { x.bind(box); } catch (e) { console.error(e); } } });
    box.querySelectorAll('input[type=range]').forEach((r) => {
      r.oninput = () => { st[r.dataset.k] = r.value / 100; r.nextElementSibling.textContent = r.value; applyAudio(); NW.Save.saveSettings(); };
      r.onchange = () => NW.Audio.play('beep', { vol: 0.5 });
    });
    $('s-shake').onchange = (e) => { st.shake = e.target.checked; NW.Save.saveSettings(); };
    $('s-reset').onclick = () => { Object.assign(st, { master: 0.8, music: 0.55, sfx: 0.8, amb: 0.7, shake: true }); applyAudio(); NW.Save.saveSettings(); UI.refresh('settings'); };
  };
  function applyAudio() { const st = NW.settings; Object.assign(NW.Audio.vol, { master: st.master, music: st.music, sfx: st.sfx, amb: st.amb }); NW.Audio.applyVolumes(); }
  UI.applyAudio = applyAudio;
  const kk = (a) => { const b = NW.Keys.binds[a]; return [b[0], b[1]].filter(Boolean).map((c) => esc(NW.Keys.label(c))).join(' / ') || '—'; };
  R.howto = function (box) {
    box.innerHTML = head('How to play') + '<div class="pbody doc">' +
      '<h3>Controls</h3><table class="tbl keys"><tr><td>' + kk('up') + kk('left') + kk('down') + kk('right') + '</td><td>Move</td></tr><tr><td>' + kk('sprint') + '</td><td>Sprint (uses stamina)</td></tr><tr><td>' + kk('interact') + ' or 1–9</td><td>Use the highlighted object (' + kk('interact') + ' = first action, numbers pick an action; you can also click)</td></tr>' +
      '<tr><td>Mouse click / ' + kk('shoot') + '</td><td>Fire the rifle outdoors (aim with the mouse)</td></tr><tr><td>' + kk('pack') + '</td><td>Pack / inventory</td></tr><tr><td>' + kk('map') + '</td><td>Map</td></tr><tr><td>' + kk('journal') + '</td><td>Journal</td></tr><tr><td>' + kk('eat') + ' / ' + kk('heal') + '</td><td>Quick-eat / quick-heal</td></tr><tr><td>Esc</td><td>Close panel / Pause (Save &amp; Quit is here)</td></tr></table><div class="hint">Keys can be changed in Settings.</div>' +
      '<h3>The watch</h3><p>Days: gather firewood, hunt, forage and salvage. Nights: you cannot sleep. Survive until 06:00. The first night is quiet; every night after brings something new.</p>' +
      '<h3>Fire &amp; warmth</h3><p>The stove burns wood; LOW saves fuel, HIGH heats fast but leaks light up the chimney and can overheat you if you stand next to it. Your body temperature changes slowly — watch the thermometer.</p>' +
      '<h3>Light</h3><p>Light escaping through windows, open doors and the chimney draws attention. Curtains and shutters hold light in. But rooms left dark invite something else. Balance them.</p>' +
      '<h3>Visitors</h3><p>Look through the peephole, ask questions, and compare answers with the records at the Ranger\'s desk before you open the door. Not everyone who knocks is a person.</p>' +
      '<h3>Saving</h3><p>The game autosaves often, at dusk, at dawn, and after important events. Use Save &amp; Quit from the pause menu (Esc) to stop at any moment — even mid-night. There are three save slots. Death ends the run.</p>' +
      howtoSections.map((x) => '<h3>' + esc(x.title) + '</h3>' + x.html).join('') + '</div><div class="pfoot"><button data-close>Close</button></div>';
    bindClose(box, 'howto');
  };

  // ------------------------------------------------------------ dawn / end
  R.dawn = function (box, a) {
    const s = G().state;
    const tip = D.TIPS[(a.night * 3) % D.TIPS.length];
    box.innerHTML = '<div class="pbody center"><div class="big-title">NIGHT ' + a.night + ' SURVIVED</div><div class="sub">Day ' + s.time.day + ' begins. ' + (a.night < G().finalNight() ? (G().finalNight() - a.night) + ' night' + (G().finalNight() - a.night === 1 ? '' : 's') + ' until relief.' : 'Endless watch.') + '</div>' +
      (a.lines.length ? '<div class="doc summary">' + a.lines.map((l) => '<div class="entry">' + esc(l) + '</div>').join('') + '</div>' : '<div class="doc summary"><div class="entry">A quiet night. The fire held.</div></div>') +
      '<div class="hint">' + esc(tip) + '</div><div class="pfoot"><button id="dawn-ok">Face the day</button></div></div>';
    $('dawn-ok').onclick = () => UI.close('dawn');
  };
  // a.ending (from a feature module) = { id, title, text: string | [paragraphs], tone: 'good' | 'bad' | 'bittersweet' }
  R.ending = function (box, a) {
    const s = G().state, st = s.stats, en = a.ending;
    const paras = en ? (Array.isArray(en.text) ? en.text : [en.text || '']) : ['At dawn the radio crackles: "Base to Watch Seven. Relief convoy turned back at the washout. The road is gone. We can\'t reach you. Hold the watch, ranger. Hold it as long as you can. Base out."'];
    const title = en ? en.title : U.numWord(a.night).toUpperCase() + ' NIGHTS';
    const extra = NW.Hooks.collect('endingButtons', en, a);
    box.innerHTML = '<div class="pbody center ending-' + esc((en && en.tone) || 'plain') + '">' + (en ? '<div class="sub">THE WATCH IS OVER · ' + esc(U.numWord(a.night).toUpperCase()) + ' NIGHTS</div>' : '') + '<div class="big-title">' + esc(title) + '</div><div class="doc summary">' +
      paras.map((l) => '<div class="entry">' + esc(l) + '</div>').join('') +
      (a.lines.length ? '<div class="entry dim-entry">Last night: ' + a.lines.map((l) => esc(l)).join(' ') + '</div>' : '') +
      '<div class="entry">Wood gathered: ' + (st.wood || 0) + ' · People sheltered: ' + (st.helped || 0) + ' · Mimics turned away: ' + (st.mimicsRefused || 0) + ' · Repairs: ' + (st.repairs || 0) + '</div></div>' +
      '<div class="sub">You can keep the watch going in endless survival. Each night grows harder.</div><div class="pfoot">' + extra.map((b) => '<button id="end-x-' + esc(b.id) + '">' + esc(b.label) + '</button>').join('') + '<button id="end-go">Continue the watch</button><button id="end-quit">Save &amp; Quit</button></div></div>';
    extra.forEach((b) => { $('end-x-' + b.id).onclick = () => b.run(); });
    $('end-go').onclick = () => { s.endless = true; UI.close('ending'); G().save('manual'); };
    $('end-quit').onclick = () => { s.endless = true; G().paused = false; G().save('quit'); UI.showMenu(); };
  };
  R.gameover = function (box, a) {
    const s = G().state, st = s.stats;
    const info = D.DEATH[a.cause] || D.DEATH.unknown;
    box.innerHTML = '<div class="pbody center"><div class="big-title red">' + esc(info.title.toUpperCase()) + '</div><div class="sub">You kept the watch for ' + s.nightsSurvived + ' night' + (s.nightsSurvived === 1 ? '' : 's') + ' (died on day ' + s.time.day + ' at ' + U.fmtClock(s.time.min) + ').</div>' +
      '<div class="doc summary"><div class="entry"><b>What happened:</b> ' + esc(info.text) + '</div>' +
      '<div class="entry">Wood gathered: ' + (st.wood || 0) + ' · Animals hunted: ' + (st.animals || 0) + ' · People sheltered: ' + (st.helped || 0) + ' · Mimics turned away: ' + (st.mimicsRefused || 0) + ' · Repairs: ' + (st.repairs || 0) + '</div>' +
      '<div class="entry">' + esc((s.mode && s.mode.name) || 'Standard') + ' · seed <b>' + esc(s.seedText || String(s.seed)) + '</b></div>' + NW.Hooks.collect('gameoverLines', s, a).map((l) => '<div class="entry">' + l + '</div>').join('') + '</div>' +
      '<div class="pfoot"><button id="go-same">Same seed again</button><button id="go-new">New run</button><button id="go-menu">Main menu</button></div></div>';
    const again = { mode: (s.mode && s.mode.id) || 'standard', custom: s.mode, slot: s.slot || 1, seed: s.seedText || String(s.seed), intro: false, guided: false };
    $('go-same').onclick = () => UI.startNew(again);
    $('go-new').onclick = () => UI.openNewGame({ mode: again.mode, custom: s.mode, slot: again.slot });
    $('go-menu').onclick = () => UI.showMenu();
  };

  // ================================================================== KEYS
  UI.handleKey = function (e) {
    const code = e.code, top = UI.top(), K = NW.Keys;
    // rebinding a control in Settings
    if (UI._capture) {
      if (!e.repeat) {
        const cp = UI._capture; UI._capture = null;
        if (code === 'Backspace' || code === 'Delete') { K.binds[cp.action][cp.slot] = null; K.save(); }
        else if (code !== 'Escape' && !K.bind(cp.action, cp.slot, code)) UI.msg('That key is reserved.', 'warn');
        UI.refresh('settings');
      }
      return true;
    }
    if (top === 'confirm') { if (code === 'Escape') { UI.close('confirm'); return true; } if (code === 'Enter') { $('c-yes').click(); return true; } return true; }
    if (top && NW.Hooks.filter('panelKey', false, top, code, e) === true) return true;
    if (G().mode === 'menu') { if (code === 'Escape' && top && !STICKY.has(top)) { UI.close(top); return true; } return false; }
    if (top && STICKY.has(top)) { if (!e.repeat && (code === 'Enter' || code === 'Space' || K.is('interact', code)) && top === 'dawn') { UI.close('dawn'); } return true; }
    if (e.repeat && top) return true;
    if (code === 'Escape') {
      if (top) { if (top !== 'reveal') UI.close(top); } else if (G().mode === 'play' && !G().dead) UI.open('pause');
      return true;
    }
    if (G().dead) return true;
    if (top === 'inv' && (K.is('eat', code) || K.is('heal', code))) { G().quickUse(K.is('eat', code) ? 'KeyF' : 'KeyH'); sel = null; UI.refresh('inv'); return true; }
    if (top === 'pause' || top === 'settings' || top === 'howto') return true;
    const isPanelKey = K.is('pack', code) || K.is('map', code) || K.is('journal', code);
    if (e.repeat) return isPanelKey;
    if (UI.isOpen('pause') && isPanelKey && !(K.is('journal', code) && top === 'journal')) return true; // paused: only close the journal
    if (K.is('pack', code)) { toggle(UI.isOpen('chest') ? 'chest' : 'inv'); return true; }
    if (K.is('map', code)) { toggle('map'); return true; }
    if (K.is('journal', code)) { toggle('journal'); return true; }
    if (top === 'talk' && /^Digit[1-5]$/.test(code)) { ask(QUESTIONS[+code.slice(5) - 1][0]); return true; }
    if (top && (/^Digit\d$/.test(code) || K.is('interact', code) || K.is('shoot', code) || K.is('eat', code) || K.is('heal', code))) { if (K.is('interact', code) && (top === 'text' || top === 'window' || top === 'peephole')) UI.close(top); return true; }
    return false;
  };
  function toggle(n) { if (UI.isOpen(n)) UI.close(n); else UI.open(n); }

  // =================================================================== HUD
  const msgs = [];
  UI.msg = function (text, type) {
    const box = $('hud-msgs'); if (!box) return;
    const last = msgs[msgs.length - 1];
    if (last && last.text === text && performance.now() - last.t < 3000) return;
    const el = document.createElement('div');
    el.className = 'msg m-' + type; el.textContent = text;
    box.appendChild(el);
    msgs.push({ el, t: performance.now(), text });
    while (msgs.length > 6) { const m = msgs.shift(); m.el.remove(); }
    if (type === 'danger') NW.Audio.play('heartbeat', { vol: 0.4 });
  };
  UI.clearMsgs = function () { msgs.splice(0).forEach((m) => m.el.remove()); };
  UI.warn = function (text) { const w = $('hud-warn'); w.textContent = text; w.classList.remove('show'); void w.offsetWidth; w.classList.add('show'); UI.warnT = performance.now(); };
  UI.areaName = function (text) { const w = $('hud-area'); w.textContent = text; w.classList.remove('show'); void w.offsetWidth; w.classList.add('show'); };
  UI.saveBlip = function () { const b = $('save-blip'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); };

  UI.update = function (dt) {
    const g = G(), s = g.state;
    const now = performance.now();
    msgs.forEach((m) => { const age = (now - m.t) / 1000; m.el.style.opacity = age > 7 ? Math.max(0, 1 - (age - 7) / 1.5) : 1; });
    for (let i = msgs.length - 1; i >= 0; i--) if ((now - msgs[i].t) / 1000 > 8.5) { msgs[i].el.remove(); msgs.splice(i, 1); }
    if (!s || g.mode === 'menu' || g.mode === 'scene' || !g.area) return;
    // clock
    const m = s.time.min, night = NW.Survival.isNight();
    setText($('clk-day'), (night && m < D.DAWN ? 'Night ' + s.night.n : night ? 'Night ' + s.time.day : 'Day ' + s.time.day));
    setText($('clk-time'), U.fmtClock(m));
    let label, frac;
    if (night) { const left = (D.DAWN - m + 1440) % 1440; label = 'Sunrise in ' + U.fmtDur(left); frac = 1 - left / 660; }
    else { const left = D.NIGHT_START - m; label = left > 0 ? 'Nightfall in ' + U.fmtDur(left) : 'Night falls'; frac = U.clamp((m - D.DAWN) / (D.NIGHT_START - D.DAWN), 0, 1); }
    setText($('phase-label'), label);
    const pf = $('phase-fill'); pf.style.width = (frac * 100).toFixed(1) + '%'; pf.className = night ? 'night' : (m >= D.DUSK ? 'dusk' : 'day');
    setText($('wx'), NW.Weather.label() + ' · ' + Math.round(s.weather.temp) + '°C outside' + (s.weather.wind > 0.6 ? ' · strong wind' : ''));
    // objectives
    const tdone = s.tutorial.done;
    const showObj = s.time.day === 1 || (s.time.day === 2 && m < D.DAWN);
    let obj = null;
    if (showObj) {
      const open = UI.OBJECTIVES.filter((o) => !(o.k === 'dusk' ? (tdone.lock && tdone.curtain) : tdone[o.k])).slice(0, 3);
      if (open.length) obj = { title: night ? 'Night 1 is safe — learn the cabin' : 'First day', items: open.map((o) => o.text.replace(/\{(\w+)\}/g, (_, k) => NW.Keys.name(k))) };
    }
    // modules (guided first day, missions) may replace or extend this: { title, items: [text] } or null
    obj = NW.Hooks.filter('objectives', obj, s);
    setHTML($('objectives'), obj && obj.items && obj.items.length ? '<div class="obj-h">' + esc(obj.title || '') + '</div>' + obj.items.map((t) => '<div class="obj">◇ ' + esc(t) + '</div>').join('') : '');
    // stats
    const p = s.player;
    bar('st-hp', p.hp, Math.round(p.hp), p.hp < 30 ? 'danger' : '');
    bar('st-hunger', p.hunger, p.hunger < 25 ? 'Hungry' : p.hunger > 80 ? 'Full' : 'Fed', p.hunger < 25 ? 'warn' : '');
    bar('st-stam', p.stamina, Math.round(p.stamina), p.stamina < 20 ? 'warn' : '');
    const [tl, tc] = NW.Survival.tempLabel(p.temp);
    const tf = U.clamp((p.temp - 31) / (41 - 31) * 100, 0, 100);
    bar('st-temp', tf, p.temp.toFixed(1) + '°C ' + tl, tc === 'ok' ? '' : tc);
    const tb = $('st-temp'); const trend = NW.Survival.bodyTarget() - p.temp;
    setText(tb.querySelector('.trend'), Math.abs(trend) < 0.15 ? '' : trend > 0 ? '▲' : '▼');
    // cabin status
    const inCabin = g.area.kind === 'room' || g.area.id === 'f_2_2';
    const cab = $('hud-cabin');
    if (inCabin) {
      cab.classList.remove('hidden');
      const lit = NW.Survival.stoveLit();
      const fuelLogs = s.stove.fuel / D.WOOD_FUEL;
      const doors = s.cabin.doors;
      const dtxt = (d, n) => '<span class="' + (d.hp <= 0 || d.open ? 'bad' : d.locked && !d.lockBroken ? 'good' : 'bad') + '">' + n + ': ' + (d.hp <= 0 ? 'smashed' : d.open ? 'OPEN' : d.lockBroken ? 'lock broken' : d.locked ? 'locked' : 'unlocked') + '</span>';
      const leak = NW.Survival.light.leak;
      const leakTxt = leak > 1.9 ? '<span class="bad">blazing</span>' : leak > 1.05 ? '<span class="warnc">bright</span>' : leak > 0.5 ? 'dim' : 'dark';
      setHTML(cab, '<div><b>Stove</b> ' + (lit ? D.STOVE[s.stove.setting].label : 'out') + ' <span class="fuel"><i style="width:' + Math.round(s.stove.fuel / G().cap('STOVE_CAP') * 100) + '%"></i></span> ' + fuelLogs.toFixed(1) + ' logs</div>' +
        '<div>Wood box ' + s.woodbox + ' · pile ' + s.woodpile + ' · oil ' + Math.round(s.oil) + '</div>' +
        '<div>Cabin ' + Math.round(s.cabin.heat) + '°C · light outside: ' + leakTxt + '</div>' +
        '<div>' + dtxt(doors.front, 'Front') + ' · ' + dtxt(doors.back, 'Back') + '</div>');
    } else cab.classList.add('hidden');
    // bottom-right
    const ammo = I.count(s.inv, 'ammo'), wood = I.count(s.inv, 'wood');
    const free = s.inv.filter((x) => !x).length;
    setHTML($('hud-br'), (g.area.kind === 'forest' ? '<span>Rounds ' + ammo + '</span>' : '') + '<span>Wood ' + wood + '</span><span>Pack ' + (D.INV_SLOTS - free) + '/' + D.INV_SLOTS + '</span>' + (s.journal.unread ? '<span class="hl">' + esc(NW.Keys.name('journal')) + ': journal (' + s.journal.unread + ')</span>' : '') + '<span class="dim">Esc: pause</span>');
    // prompt
    const pr = $('prompt');
    const f = g.focus;
    if (f && !UI.blocksMovement() && !g.dead) {
      let h = '<div class="pname">' + esc(f.name || '') + '</div>';
      if (g.hold) h += '<div class="prow active"><span class="k">…</span>' + esc(g.hold.label) + '<span class="pbar"><i style="width:' + Math.round(g.hold.t / g.hold.time * 100) + '%"></i></span></div>';
      else f.actions.forEach((a, i) => { if (i < 9) h += '<div class="prow' + (a.disabled ? ' dis' : '') + (a.danger ? ' dang' : '') + '" data-act="' + i + '"><span class="k">' + (i === 0 ? esc(NW.Keys.name('interact')) : i + 1) + '</span>' + esc(a.label) + (a.time ? ' <span class="hold">· ' + a.time + 's</span>' : '') + (a.disabled && typeof a.disabled === 'string' ? '<span class="why"> — ' + esc(a.disabled) + '</span>' : '') + (a.confirm && !a.disabled ? '<span class="why"> (press twice)</span>' : '') + '</div>'; });
      setHTML(pr, h); pr.classList.remove('hidden');
    } else pr.classList.add('hidden');
    // live views
    const lv = UI._live;
    if (lv) {
      const t = g.t;
      if (lv.kind === 'window' && UI.isOpen('window')) {
        NW.Render.windowView($('win-c'), lv.wid, t);
        const leak = NW.Survival.light.winLeak[lv.wid] || 0;
        const vis = lv.wid.startsWith('w_front') && NW.Night.visitorAtDoor();
        setText($('win-cap'), (NW.Night.lhAt(lv.wid) ? 'IT IS RIGHT THERE. Darken this room!' : vis ? 'Someone stands at the front door.' : 'The forest. ' + NW.Weather.label() + '.') + '  Light escaping here: ' + (leak > 0.6 ? 'bright' : leak > 0.15 ? 'some' : 'barely any') + '.');
      } else if (lv.kind === 'peephole' && UI.isOpen('peephole') && lv.vis !== undefined && lv.vis !== NW.Night.visitorAtDoor()) {
        UI.refresh('peephole');
      } else if (lv.kind === 'peephole' && UI.isOpen('peephole')) {
        NW.Render.peephole($('pp-c'), t);
        const v = NW.Night.currentVisitor();
        setText($('pp-cap'), v ? 'A figure stands close to the door' + (v.log && v.log.some((q) => q.k === 'who') ? ' — "' + v.name + '"' : '') + '. Look closely.' : 'The porch is empty. Snow drifts across the boards.');
      } else if (lv.kind === 'talk' && UI.isOpen('talk')) {
        const v = NW.Night.currentVisitor();
        if (v) { UI.talkT = Math.max(0, (UI.talkT || 0) - dt); const c = $('talk-c'); const vis = NW.Night.visual(v); const tmp = UI._tp || (UI._tp = S.mk(64, 64)); S.portrait(tmp.getContext('2d'), v.app, { t, blink: vis.blinks && (t % 3.7) < 0.14, breath: vis.breath, snowy: vis.snowy, wet: vis.wet, talking: UI.talkT > 0 }); const cg = c.getContext('2d'); cg.imageSmoothingEnabled = false; cg.drawImage(tmp, 0, 0, 128, 128); }
        else { UI.close('talk'); }
      } else if (lv.kind === 'reveal' && UI.isOpen('reveal')) {
        const v = s.visitors[lv.vid]; NW.Render.revealView($('rv-c'), v, (performance.now() - lv.t0) / 1000);
      }
    }
    if (UI.isOpen('map') && Math.floor(now / 300) !== UI._mapT) { UI._mapT = Math.floor(now / 300); NW.Render.map($('map-c'), { player: true }); }
  };
  function bar(id, pct, txt, cls) {
    const el = $(id); if (!el) return;
    el.querySelector('.fill').style.width = U.clamp(pct, 0, 100).toFixed(1) + '%';
    setText(el.querySelector('.val'), String(txt));
    const c = 'stat ' + (cls || '');
    if (el.className !== c) el.className = c;
  }
})(window.NW);
