'use strict';
// UI glue for the 3D view: graphics settings (quality, performance readout, mouse), live views for
// the window / peephole / talk / reveal panels (the 3D camera moves to the window or the door instead
// of drawing a pixel picture), and the 2D view functions turned off while 3D is active.
(function (NW) {
  const R3 = NW.R3, UI = NW.UI;
  if (!R3 || !window.THREE) return;
  const Rn = NW.Render;

  // the old pixel views are only used by the 2D fallback
  ['windowView', 'peephole', 'revealView'].forEach((k) => { const orig = Rn[k]; Rn[k] = function () { if (R3.active) return; return orig.apply(this, arguments); }; });

  // which live view a panel wants
  function wantedOverride() {
    if (!R3.active) return null;
    if (UI.isOpen('reveal')) return { type: 'reveal' };
    if (UI.isOpen('window') && UI._live && UI._live.kind === 'window') return { type: 'window', wid: UI._live.wid };
    if (UI.isOpen('peephole')) return { type: 'peephole' };
    if (UI.isOpen('talk') && NW.G.area && NW.G.area.kind === 'room') return { type: 'peephole' };
    return null;
  }
  NW.Hooks.on('r3Frame', () => {
    const o = wantedOverride();
    const cur = R3.View.override;
    if (!o) { if (cur) { R3.View.override = null; document.body.classList.remove('r3-view'); } return; }
    if (!cur || cur.type !== o.type || cur.wid !== o.wid) { R3.View.override = o; document.body.classList.add('r3-view'); }
  });

  // ---------------------------------------------------------------- settings
  NW.UI.registerSettings(() => {
    const st = NW.settings, q = st.quality || 'medium';
    const opt = (k) => '<option value="' + k + '"' + (q === k ? ' selected' : '') + '>' + R3.QUALITY[k].label + '</option>';
    const v = st.view || '3d';
    return '<h3>Graphics</h3>' + (R3.supported() ? '' : '<div class="hint">3D view unavailable on this device (WebGL2 not supported) — using the classic 2D view.</div>') +
      '<label class="srow"><span>View</span><select id="s-view"' + (R3.supported() ? '' : ' disabled') + '><option value="3d"' + (v === '3d' ? ' selected' : '') + '>First-person 3D</option><option value="2d"' + (v === '2d' ? ' selected' : '') + '>Classic 2D</option></select><span></span></label>' +
      '<label class="srow"><span>Quality</span><select id="s-quality">' + opt('low') + opt('medium') + opt('high') + '</select><span></span></label>' +
      '<label class="srow"><span>Performance readout</span><input type="checkbox" id="s-perf"' + (st.perf ? ' checked' : '') + '><span class="dim">F3</span></label>' +
      '<label class="srow"><span>Mouse sensitivity</span><input type="range" min="20" max="300" value="' + Math.round((st.sens || 1) * 100) + '" id="s-sens"><span class="sv">' + Math.round((st.sens || 1) * 100) + '</span></label>' +
      '<label class="srow"><span>Invert mouse Y</span><input type="checkbox" id="s-inv"' + (st.invertY ? ' checked' : '') + '><span></span></label>' +
      '<label class="srow"><span>Mute all sound</span><input type="checkbox" id="s-mute"' + (st.mute ? ' checked' : '') + '><span class="dim">Ctrl+M</span></label>';
  }, (box) => {
    const $ = (id) => box.querySelector('#' + id);
    $('s-view').onchange = (e) => { NW.settings.view = e.target.value; NW.Save.saveSettings(); R3.setView(e.target.value); };
    $('s-quality').onchange = (e) => { NW.settings.quality = e.target.value; NW.Save.saveSettings(); R3.applyQuality(); };
    $('s-perf').onchange = (e) => R3.togglePerf(e.target.checked);
    $('s-sens').oninput = (e) => { NW.settings.sens = e.target.value / 100; e.target.nextElementSibling.textContent = e.target.value; NW.Save.saveSettings(); };
    $('s-inv').onchange = (e) => { NW.settings.invertY = e.target.checked; NW.Save.saveSettings(); };
    $('s-mute').onchange = (e) => { R3.setMute(e.target.checked); };
  });
  R3.setMute = function (on) {
    NW.settings.mute = !!on; NW.Save.saveSettings();
    if (NW.UI.applyAudio) NW.UI.applyAudio();
    if (NW.UI.isOpen('settings')) NW.UI.refresh('settings');
  };
  // F3 toggles the readout; Ctrl+M mutes
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') { e.preventDefault(); R3.togglePerf(); if (NW.UI.isOpen('settings')) NW.UI.refresh('settings'); }
    if (e.code === 'KeyM' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); R3.setMute(!NW.settings.mute); NW.UI.msg(NW.settings.mute ? 'Sound muted.' : 'Sound on.'); }
  }, true);
})(window.NW);
