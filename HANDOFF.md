# The Night Watch — 3D conversion: handoff notes

Read this first, then `docs/R3D.md` (the 3D architecture contract). The project is a plain-JS browser game
(no build tools, opens by double-clicking `index.html`). The task in progress is converting it from a 2D
pixel-art top-down view to a **first-person 3D** view with Three.js, **without changing any gameplay**.

## 1. What the game is (already finished, 2D)

Survival horror: a ranger at a forest cabin. Days: gather wood/food, fish, snares, explore 25 forest areas
(5×5 grid `f_X_Y`, cabin in `f_2_2`), enterable places (fire tower, trapper's shack, mine). Nights: keep the stove
burning (temperature, hunger), answer visitors at the door (peephole, questions, desk records) — some are
Mimics. Threats: Light Hunter, Dark Dweller, Scratcher, Siphon, Pale Stag, wolves. Radio, HQ missions,
recurring characters, cabin upgrades, achievements, run history, 6 endings + finale (not on Easy).
Difficulty: Easy 7 / Standard 7 / Hard 14 / Harder 25 nights / Custom. 3 save slots, shareable seeds, key
rebinding, opening cinematic, guided first day (the credits were removed at the owner's request).

Code layout:
- `js/*.js` — core game (data, world, game loop `game.js`, survival, night, events, ui, save, render (2D), main).
- `js/mods/*.js` — feature modules hooked in via `NW.Hooks` (story, finale, missions, characters, places,
  fishing, upgrades, meta, audio-related).
- `js/hooks.js`, `js/keys.js` — hook system and key bindings.
- `legacy-2d/` — untouched copy of the finished 2D version (also backed up outside the repo originally).

## 2. The 3D conversion request (summary of the user's spec)

- First-person 3D with **Three.js only** (WebGL2), vendored & pinned: `js/vendor/three.min.js` = r159 (0.159.0)
  classic UMD build (its deprecation `console.warn` line replaced by `void 0,`). Must work offline from file://.
- Look: realistic stylised PBR; cold blue-grey darkness vs warm orange light. HDR + ACES + cold grading,
  vignette, film grain, faint chromatic aberration, bloom on High only.
- Lights: pooled point lights (8/12/16 by quality) evaluated inside MeshStandardMaterial; 0/1/2 real shadow
  lights with crossfade; flicker drives glow/emissive/audio; fake volumetrics (glow sprites, cones, motes).
- Height-aware drifting exponential fog replacing Three's fog everywhere; additive effects fade into fog;
  sky dome matching fog horizon, clouds, moon; distant ridgeline silhouettes; cheap rain/snow/wind + wetness.
- Procedural textures only (512 on Low, 1024 otherwise) — no image/model files.
- Instanced vegetation with wind sway, LOD, merged static geometry, aim for low hundreds of draw calls.
- Quality presets Low/Medium/High (localStorage), changeable from menu/pause. Dynamic resolution (fps < ~34 →
  lower render scale in steps, min 60%; raise when recovered). Resize/DPR handling.
  Toggleable perf readout (FPS, ms, draw calls, triangles, lights, render scale) — F3.
- Positional 3D audio + ambience (wind, fire, creaks, distant animals, radio static, rain on roof, surface
  footsteps, unexplained sounds) + mute (Ctrl+M).
- **Preserve ALL mechanics & balance.** Conversion, not redesign. Keep save keys/format — 2D saves must load in 3D.
- Back up 2D version (done). Test the real running game with Playwright: controller/collision tests,
  screenshots day/night, quality/resize/save, no console errors.
- **Final report to the user must state**: what changed, what was tested, measured performance + GPU / software
  renderer used, remaining issues, how to launch.
- Spec vs actual game discrepancies (keep the actual game, mention in final report): campaign is 7 nights
  on Standard (spec said 5); wildlife is rabbits/deer/wolves/crows (+ injured fox event) — no bears; the
  carried light is a lantern, not a flashlight. The "NYC After Dark" reference project mentioned in the
  spec was not available; its described techniques were followed.

**User preference:** do not narrate progress. Just do the work and give one short summary at the end.

## 3. Architecture (done)

Game logic stays in 2D pixel coordinates. The 3D layer reads state each frame and draws it.
`R3.K = 0.05` m per pixel. Full contract in `docs/R3D.md`. Files in `js/r3d/` (load order in `index.html`):

| File | Status | Contents |
|---|---|---|
| `core.js` | done | constants, quality presets, shared uniforms `R3.U`, renderer/scene/camera/post init, resize, dynamic resolution, perf readout, `R3.frame`, `R3.setView('3d'/'2d')`, `R3.wanted()` (URL `?view=2d` override) |
| `mat.js` | done | global fog shader chunk override, `R3.std/basic/glowMat` material factories with pooled lights (onBeforeCompile), wind sway, weather (wet/snow), `R3.merge`, geo/mat caches |
| `lights.js` | done | light pool, flicker kinds, shadow slots with fade, glow instanced quads, `R3.Lights.f(key)` |
| `atmos.js` | done | sky dome, sun/moon directional, hemisphere, ridgelines, rain/snow/motes, fog colour/density by time/weather, grading |
| `controls.js` | done | mouse look (pointer lock, drag fallback), arrow keys turn, head bob, crosshair, "Click to look around" hint |
| `fallback.js` | done | simple box stand-ins used when a builder is missing |
| `view.js` | done | area building queue, visibility, entity sync (wildlife, visitors w/ tells, monsters, footprints, tracers, events, module objects), lights from game logic, camera, live-view overrides (window/peephole/reveal), menu + cinematic camera |
| `ui3d.js` | done | Graphics settings section, live view panels, F3 / Ctrl+M |
| `textures.js` | written by sub-agent, unverified | procedural textures + `R3.Tex.mat(name, opts)` material library |
| `forest.js` | written by sub-agent, unverified | terrain `R3.Terrain.height`, instanced trees/grass/rocks, `buildArea`, `buildOuter` |
| `cabin.js` | written by sub-agent, unverified | cabin exterior (f_2_2) + interior rooms with anchors (windows, peephole, porch, roof, rooms, ring) |
| `props.js` | written by sub-agent, unverified | landmark/loot/event/module props + remote interiors (tower, shack, mine) |
| `creatures.js` | written by sub-agent, unverified | humans (visitor tells), animals, monsters, first-person viewmodel (hands/lantern/rifle) |
| `js/audio.js` | rewritten by sub-agent, unverified | positional audio + ambience |

Edits to existing game files for 3D: `js/game.js` (settings defaults quality/view/perf/sens/invertY/mute;
camera-relative movement; focus by view cone; `G.mouseWorld` = point ahead of camera), `js/main.js` (boot
picks view; loop renders R3 or 2D; rifle fires on click when pointer-locked), `js/ui.js` (mute), `js/render.js`
(`Rn.prints` export), `js/mods/story.js` (3D opening cinematic shots `intro3d`), `css/style.css`
(3D canvas, crosshair, perf readout, live-view panels).

## 4. Testing

```
cd the-night-watch
npx http-server -p 8123 -s -c-1 .            # leave running
NODE_PATH=$(npm root -g) node tests/r3d_controller.js
```
Playwright Chromium with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` (software WebGL2, no GPU in
the container; very slow: ~1-5 fps, frames arrive in irregular bursts, a suite takes 10-30 min). Judge looks, not speed.
Things learned about the software renderer: `page.screenshot` and `setViewportSize` can stall for minutes (use
`NW.R3.shot()`, which returns the next rendered frame as a data URL, and dispatch `resize` yourself); block Google Fonts
with `page.route` or page load/screenshots hang; wait for `NW.R3.prepareMs` (loading screen finished) before driving frames.

Status at handoff:
- 2D suites (`events, foundation, functional, menus, night, sim, mod_*`, use `?view=2d`): all pass.
- 3D suites passing: `r3d_creatures`, `r3d_audio`, `r3d_textures`, `r3d_props` (subset of shots via `ONLY=` regex),
  `r3d_forest` (with view names as argv), `r3d_controller` (all checks passed; its final screenshot step was
  switched to `R3.shot()` and not re-run). `r3d_cabin` (run with `ONLY=state,views,ext`) was still running when
  this was written; its full interior-shot gallery was never run end to end.
- Never run on a real GPU. Measured only: ~165 draw calls / ~950k triangles outdoors, ~105-150 draw calls / 135-150k
  triangles in the cabin, ~56-60 shader programs, loading screen ~5-6 s on SwiftShader.

## 5. What was done in the last session, and what is left

Done: found and fixed that `R3.std` never assigned its edited shaders back (pooled lights, wind, weathering, snow
were silently inactive); materials now share programs (amounts are per-material uniforms, only wind/surface flags change
the program); `R3.View.prepare()` loading screen (`#loading3d`) builds the opening areas + one of every creature and
compiles everything via `compileAsync` before play (also re-run when quality changes the shadow-light count);
shadow lights skip their depth pass while unused; audio burst cap; HUD no longer swallows mouse clicks
(`body.r3 #root { pointer-events: none }`, which was why "click to look around" did nothing for a real mouse);
README updated for 3D.

Left / known weak spots (the owner is not happy with overall quality, so treat these as the real to-do list):
1. Visual quality is mediocre. Models are procedural and blocky; humans and creatures read as simple. Cabin
   windows glow flat orange in daylight (emissive pane should be dim/reflective by day); cabin interior at noon is
   dim (needs window daylight spill / more indoor ambient); outdoor scenes were never reviewed in full-res day/dusk/
   night screenshots (the ones taken stood against the cabin wall). Do a proper art pass with real screenshots.
2. Performance on real hardware is unknown. Dynamic resolution and quality presets exist but are untested on a GPU.
   ~950k triangles outdoors may be heavy for integrated GPUs; consider more LOD / fewer instanced trees.
3. Remaining shader variants (~56 programs): forest/creature custom patches (`|foRough|foCard|foTerrain|foWater`,
   `|ring`, `|tex` vs `|texM`) could be folded into uniforms. A few depth (shadow) programs still compile on first use.
4. Programs leak slightly when quality is switched repeatedly (old programs stay).
5. Full screenshot galleries (cabin interiors, all forest views, all props) never run in full; tests default to
   scratchpad paths from an old session, set `SHOTS=`.
6. Optional: republish the web build (wrapper HTML + `files` map; must add `js/vendor/three.min.js` and all
   `js/r3d/*.js` in the `index.html` order). Final report to the user must still state what changed, what was tested,
   measured performance + renderer (SwiftShader), remaining issues, how to launch, and the spec discrepancies.

## 6. Launch

Double-click `index.html` (or serve the folder). `index.html?view=2d` forces the classic 2D view; the
Settings → Graphics menu switches view and quality.

## 7. Session 3 (winter art + performance pass) — what changed

User asks (all addressed): better performance on Low, a clean cinematic look, a *snowy winter* forest that is not
repetitive, the trail visible through the trees, animals without heads, small ugly details.

- **`js/r3d/flora.js` (new)**: every tree (25 areas, the belt beyond the edge, understory firs) is drawn by world-wide
  InstancedMeshes, culled per instance against the camera every frame and split into 3 LODs. Species: spruce, fir,
  pine, winter birch, snags (burned area), young firs; high-crowned variants next to trails. Canvas-painted branch
  atlas + snow mask. Triangles in the forest went from ~0.9-1.4M to ~0.3-0.5M (Low ~370k, Medium ~510k, High ~700k).
- **forest.js**: no longer draws trees; trail is a trodden, sunken path with snow banks; dry grass stalks and bare
  shrubs from the flora atlas; snow mounds; wind-plastered snow on trunks/rocks; crisp lake ice edge.
- **Animals had no heads**: the quadruped specs defined `neck`/`head` twice (joint and ring list), so the head bones were
  NaN. Rings are now `neckR`/`headR`. Also sturdier proportions, a real grazing pose. `tests/r3d_flora.js` guards it.
- **Perf**: pooled lights skip out-of-range fragments, one fog noise instead of two, lantern cube shadows only on High,
  Low = 70% scale / 6 lights / 60 m draw distance, dynamic resolution reacts below 45 fps (down to 50% on Low).
- **Loading screen** now waits for the full-size textures (they used to start as 64 px previews -> blotchy look).
- **2D view bug**: the 3D loading overlay never hid in `?view=2d` (also the no-WebGL2 fallback) and swallowed clicks.
- Viewmodel: rifle at low ready, lantern without the forearm blob; cabin window glass reflects by day; red cairn rebuilt.
- Visual snow never drops below a winter minimum (`uSnow = 0.62 + 0.38 * weather.snow`); gameplay snow is untouched.

Tests: all 14 2D suites pass; r3d_flora, r3d_controller, r3d_creatures pass. Tests that block Google Fonts must
*fulfill* the request with an empty stylesheet, not abort it (an aborted request is logged as a page error).
Still never run on a real GPU.
