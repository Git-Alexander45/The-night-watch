# The Night Watch

A first-person 3D survival horror game for the browser (the original top-down pixel-art
view is still included). You are the ranger at Station 7, alone in the Silverpine backcountry. Gather wood and food by day. Survive
until sunrise every night. Hold the watch until relief comes (7 to 25 nights, depending
on difficulty). The last night is a finale with several possible endings, and after it
the watch goes on in endless survival.

## How to launch

There's no build step and nothing to install. Use either option:

**Option A: open the file.** Double-click `index.html`, or drag it into Chrome, Edge or
Firefox. Saving works from `file://`.

**Option B: run a local web server** (recommended):

```bash
cd the-night-watch
python3 -m http.server 8000      # or: npx http-server -p 8000
# then open http://localhost:8000
```

The 3D view needs a browser with WebGL2 (any current Chrome, Edge or Firefox). Without it
the game falls back to the classic 2D view automatically, and `index.html?view=2d` forces
that view. Three.js r159 is bundled in `js/vendor/`, so everything works offline.
The first launch shows a loading screen while the forest is built and shaders are compiled
(a few seconds on a normal GPU); after that the game starts instantly.

The game loads its pixel fonts from Google Fonts. Offline, it falls back to a system
monospace font and still runs. Headphones are recommended because the sound is
directional.

## Controls

| Key | Action |
| --- | --- |
| Mouse | Look around (click the game once to capture the mouse; Esc releases it) |
| WASD | Move relative to where you look (arrow keys turn the view) |
| Shift | Sprint (uses stamina) |
| E | Use the highlighted object (first action) |
| 1–9 | Pick a specific action (for example stove: 2 Low, 3 Medium, 4 High). You can also click the actions |
| Mouse click / Space | Fire the rifle outdoors (at the crosshair) |
| F3 | Performance readout (FPS, frame ms, draw calls, triangles, lights, render scale) |
| Ctrl+M | Mute / unmute all sound |
| Tab or I | Pack (inventory) |
| M | Map |
| J | Journal (notes, sightings, visitors, radio log, what you know about each monster) |
| F / H | Quick-eat / quick-heal |
| Esc | Close a panel, or Pause. **Save & Quit** is in the pause menu |

All keys except Esc and 1–9 can be changed in Settings.

Time keeps running while the pack, map, journal, desk and windows are open. Only the
pause menu stops the clock.

## The 3D view

- **Look:** a snow-bound conifer forest in deep winter: spruce, fir, pine, bare winter birch
  and dead snags with snow-loaded branches, young firs buried in drifts, packed and trodden
  trails with snow banks, wind-plastered snow on trunks. Realistic PBR with HDR, ACES tone
  mapping and a cold grade, a light vignette and grain, and bloom on High. Cold blue-grey darkness against warm
  orange firelight; the stove, lamps, lantern and lit windows are real lights that mirror
  the game's light and leak model exactly. Height-aware drifting fog, a sky dome with
  moon and clouds, distant ridgelines, rain, snow, wind and wet surfaces.
- **Graphics settings** (menu or pause, Settings): View (3D / classic 2D), Quality
  Low / Medium / High, performance readout (F3), mouse sensitivity, invert Y. Resolution
  scales automatically (down to 50% on Low, 60% otherwise) when the frame rate drops below
  about 45 fps and recovers when it improves. Quality and view are remembered. If the game
  stutters, choose **Low**: it draws less far, uses simpler distant trees, fewer lights and
  no real-time shadows.
- **Sound** is positional: the listener follows the camera, sounds come from where they
  happen (a knock at the door, a creak in the next room), walls muffle them, and the
  ambience follows weather and indoor / outdoor.
- All textures and models are generated in code; there are no image or model files.
- Your 2D saves load in 3D and the other way round. Gameplay and balance are unchanged.

## What's in the game

- **Difficulty:** Easy (7 nights, one ending), Standard (7), Hard (14), Harder (25), or
  Custom with sliders for nights, monsters, damage, hunger, visitor patience and salvage.
- **New Game options:** 3 save slots, a shareable world seed (same seed = same forest,
  visitors and nights), an opening scene, and a guided first day with arrows that point
  to each step.
- **The finale:** the last night is a scripted set-piece. Your choices over the whole
  run decide which of six endings you get (Easy keeps a single ending). Credits follow.
- **HQ orders:** from day 2, Base radios 1–2 tasks each morning. They are listed on the
  desk "HQ orders" tab and marked on the map, and pay out supplies and reputation.
- **Recurring characters:** Garrow the trapper, Mara Quill the researcher, the Pell
  hikers and Deputy Hale. You can talk, trade and help them. They may knock at night,
  and so may Mimics wearing their faces. The "People" journal tab tracks their fates.
- **Places to go inside:** the Old Fire Tower (lookout, logbook), the Trapper's Shack
  (a stove to warm up at), and the Hollow Mine (rare salvage, and it is dark down there).
- **Fishing and snares:** the rod is in the storage chest. Fish at the end of the Lake
  Wren dock or at creek pools, then cook the catch at the cooking station. Twist wire
  snares at the sawhorse and set them in the woods overnight.
- **Cabin upgrades:** the workbench in the storage room builds insulation, a stove
  damper, a bigger wood box, banded shutters, door bars, an alarm line and more.
- **Records:** best nights per mode, run history, achievements, endings seen. The
  monster rules you learned carry over to new runs (you can switch this off in Settings).
- **Key rebinding** in Settings, plus a fuller procedural soundtrack and new sounds.

## The essentials

- **Wood** feeds the stove. LOW saves fuel. HIGH heats fast, but it overheats you if you
  stand next to it, and it pours light up the chimney. Fill the wood box by the stove
  before dusk. The outdoor woodpile holds more.
- **Body temperature** changes slowly. Watch the thermometer in the top right, not your
  feelings. The heavy parka in the bedroom wardrobe keeps you warm outside but is hot
  indoors.
- **Hunger.** Hunt rabbits and deer (shoot, then butcher), gather berries and mushrooms,
  and cook at the cooking station while the stove is lit.
- **Medicine** uses fixed recipes at the cooking station: yarrow poultice, wintergreen
  tonic, bandages.
- **Planks** are 2 firewood on the sawhorse in the storage room. Repairs need planks,
  nails, scrap, rope or glass, salvaged from landmarks and HQ supply drops.
- **Light** that escapes through windows, open doors and the chimney draws attention.
  Curtains and shutters keep it in. Rooms left dark invite something else.
- **Visitors.** Use the peephole, talk to them, look out the front windows, and compare
  what they say with the records at the Ranger's desk before opening the door.
- **The radio** in the office carries HQ reports, weather, permit lists and other
  signals. Real Base transmissions always open with "Base to Watch Seven" and close
  with "Base out."

## Saving

- The game autosaves every 30 seconds, on every area change, at dusk and dawn, and
  after important events (visitor decisions, repairs, break-ins, salvage). It also saves
  when the tab is hidden or closed.
- **Save & Quit** (Esc menu) stops at the exact moment, mid-night included. **Continue**
  resumes the same clock, position, monster states, visitor at the door, fire, repairs
  and everything else.
- Saves live in `localStorage` with a checksum and a rolling backup. If the latest save
  is damaged, the game restores the backup and tells you. If both are damaged, the menu
  says so and offers to delete them.
- Three save slots (Load Game on the menu). Death ends the run and deletes its slot.
  New Game asks before overwriting a slot that holds a run.

## Project layout

```
index.html          page shell and HUD markup
css/style.css       UI styling
js/util.js          math, seeded RNG, hashing, formatting
js/data.js          items, recipes, world layout, bestiary, death explanations
js/audio.js         procedural WebAudio: ambience, sound effects, generative music
js/sprites.js       procedural pixel art: palette, trees, characters, creatures, furniture, icons, portraits
js/items.js         inventory and container helpers
js/world.js         forest area generation (seeded), cabin rooms, collision
js/objects.js       world object sprites and contextual actions
js/cabin.js         windows, doors, stove controls, repairs
js/survival.js      weather, light and leak model, cabin heat, body temperature, hunger, health
js/night.js         night director: Light Hunter, Dark Dweller, Scratcher, Siphon, Pale Stag, visitors and Mimics
js/events.js        day events, radio, permits and reports, journal, anomalies, lore
js/entities.js      wildlife AI, dog companion, outdoor monster contact
js/render.js        classic 2D renderer: terrain, lighting, weather, window and peephole views, menu scene, map
js/r3d/*.js         the 3D layer (reads game state each frame and draws it; see docs/R3D.md):
                    core (renderer, post, quality, dynamic resolution), mat (fog + pooled-light shaders),
                    lights, atmos (sky, fog, weather), textures, forest (terrain, water, ground cover),
                    flora (every tree, world-wide instancing with 3 LODs), cabin, props, creatures,
                    view (areas, entities, camera, loading), controls, ui3d
js/vendor/          Three.js r159 (MIT, see three.LICENSE)
legacy-2d/          untouched copy of the finished 2D game
js/save.js          checksummed persistence, validation, migration, backup
js/game.js          state, main update, input, movement, interaction, transitions
js/ui.js            HUD, prompts, panels and menus
js/hooks.js         plug-in events, filters and collectors for feature modules
js/keys.js          rebindable controls
js/mods/*.js        feature modules: story, finale, missions, characters, places,
                    fishing, upgrades, meta (records/achievements)
docs/MODDING.md     the hook API used by the feature modules
js/main.js          boot and main loop
tests/              Playwright test scripts (see below)
```

## Tests

The `tests/` folder holds browser tests that drive the real game in headless Chromium.
They cover movement, collisions, every interaction, cooking, crafting, repairs, all day
events, every monster and its countermeasure, visitors, dawn, death, multi-night
simulations, and save/reload equality.

```bash
npx http-server -p 8123 -s .          # in one terminal
node tests/functional.js              # core interactions
node tests/night.js                   # nights, monsters, visitors, save/reload, corrupt saves, death
node tests/events.js                  # day events, repairs, companions, anomalies, monster countermeasures
node tests/menus.js                   # menu, pause, Save & Quit, Continue, overwrite confirmation, settings
node tests/r3d_controller.js          # 3D movement, collision, interaction, rifle, quality, resize, 2D save in 3D
node tests/r3d_textures.js            # procedural textures
node tests/r3d_forest.js              # forest builder, times of day, weather
node tests/r3d_cabin.js               # cabin interior/exterior, window and peephole views
node tests/r3d_props.js               # landmarks, loot, events, remote interiors
node tests/r3d_creatures.js           # visitors and their tells, animals, monsters, viewmodel
node tests/r3d_audio.js               # positional audio, ambience, mute, node counts
node tests/r3d_flora.js               # trees: build, culling/LOD, triangle budget, screenshots
MODE=careful node tests/sim.js        # scripted 9-night run (also MODE=mid / MODE=careless)
```

The tests need Playwright (`npm i -D playwright`) and expect the server on port 8123.
The 2D logic suites load `?view=2d`. The `r3d_*` suites run Chromium with software WebGL
(SwiftShader) when no GPU is present, which is slow (minutes per suite); screenshots go to
`$SHOTS` (default `/tmp/shots`).
