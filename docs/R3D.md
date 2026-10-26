# The Night Watch — 3D presentation layer

The game logic is unchanged: survival, monsters, visitors, events, time, saving and every feature
module keep running in their original 2D game coordinates (`js/*.js`, `js/mods/*.js`). The 3D layer
(`js/r3d/*.js`, Three.js r159 classic build in `js/vendor/three.min.js`) **reads** that state every
frame and draws a first-person world. It must never change game state except through the same
calls the 2D game used (actions, `G.enterArea`, etc.). If WebGL2 is missing, the original 2D renderer
(`js/render.js`) is used instead.

Load order (index.html): `three.min.js` → core game → `js/mods/*` → `js/r3d/core, mat, lights, atmos,
controls, fallback, textures, forest, flora, cabin, props, creatures, view, ui3d` → `main.js`.

## Coordinates and scale

- `R3.K = 0.05` metres per game pixel. A tile (16 px) is 0.8 m. The player box (10×5 px) is 0.5 × 0.25 m.
- Forest area `(ax, ay)` occupies world X `[ax·24, ax·24+24]`, Z `[ay·13.6, ay·13.6+13.6]` (game x → +X east,
  game y → +Z south, +Y up). All 25 forest areas form one continuous 120 × 68 m world.
- `R3.areaOrigin(areaId)` → `{x, y, z}` of the area's game pixel (0, 0). Cabin rooms keep their real floor plan
  (`D.ROOM_ORIGIN`) around `R3.CABIN` (x −150). Remote interiors: `in_tower` hangs 11.5 m above the
  fire tower in f_0_0, `in_shack` and `in_mine` sit far away (see `R3.ZONES`).
- `R3.toWorld(areaId, px, py, out)` → `THREE.Vector3` on the ground. `R3.groundAt(x, z, areaId)`.
- `R3.Terrain.height(x, z)` (forest builder) must be continuous across area borders and is used for
  everything placed on the ground (camera, creatures, props). Keep relief gentle (±0.6 m): collision is 2D.
- Models face **+Z (south)** at `rotation.y = 0`; `rotation.y = atan2(dx, dy)` faces game direction (dx, dy).
  Camera `rotation.y = -gameYaw` (game yaw 0 looks north).
- The 2D object position `(x, y)` is the object's ground contact point (bottom centre of the sprite).
  Colliders (`W.collider(o)`, `cx/cy/cw/ch`) give the real footprint — models should match them.

## Builders (each file owns one; `js/r3d/fallback.js` stands in if one is missing)

All builders return `{ group: THREE.Group, update(dt, ctx)? }` for areas and `{ obj, update?(dt, st, ctx), dispose? }`
for things. `group` is placed in world coordinates already.

| File | Global | Responsibility |
|---|---|---|
| `textures.js` | `R3.Tex` | procedural textures and the shared material library `R3.Tex.mat(name, opts)`, `R3.Tex.metreUV(geo)` |
| `forest.js` | `R3.Forest`, `R3.Terrain` | `buildArea(area)` (terrain, water, rocks, logs, shrubs, grass, resources), `buildOuter()`, `owns(obj)`, `Terrain.height(x,z)`, `mats()` |
| `flora.js` | `R3.Flora` | every tree of the world (25 areas, the belt beyond the edge, understory firs): `build()` → world-wide instanced meshes, culled per instance against the camera and split into 3 LODs each frame (`R3.render` calls `Flora.active.update(cam)`) |
| `cabin.js` | `R3.Cabin` | `buildExterior(area f_2_2)` and `buildInterior()` with `anchors` |
| `props.js` | `R3.Props` | `make(key, obj, areaId)` and `buildInterior(areaId, area)` for remote interiors |
| `creatures.js` | `R3.Creatures` | `make(kind, opts)`, `viewmodel()`, `viewmodelUpdate(dt, ctx)` |
| `view.js` | `R3.View` | area visibility, entity sync, lights from game logic, camera, live views (core) |

### `ctx` passed to every update

`{ t, dt, state, area (current game area), indoor, deep, visible: [areaIds], cam, q (quality preset), addLight(l), menu? }`

### Lights — `ctx.addLight(l)` every frame for each source that is on

`{ key?, x, y, z, color: [r,g,b] (linear 0..1), intensity (candela), range (m), decay? (2), flicker?: 'fire'|'candle'|'lantern'|'failing'|'pulse', seed?, shadow?: priority (≥1 = may get a real shadow light; cabin stove 3, lantern 2), glow?: halo size m, glowIntensity?, glowColor? }`.
Only the nearest N reach the shaders. `R3.Lights.f(key)` gives a light's current flicker (0..1.1) to drive linked
emissive surfaces (stove glass, lamp glass) and audio. Lights must mirror game logic exactly: the stove only when
`Survival.stoveLit()` (scaled by `D.STOVE[setting].light`, ×0.6 while the Siphon is on), lamps only when
`state.lamps[room] && state.oil > 0`, window glow outside from `Survival.light.winLeak[wid]`, etc.

### Cabin anchors (both representations)

`R3.Cabin.buildExterior()` result `.anchors` and `buildInterior()` result `.anchors`:

- `windows[wid] = { outside: Vector3 (ground point ~0.6 m outside the window), yaw (rotation.y of a figure there facing AWAY from the cabin), view?: { pos, yaw, pitch } (camera inside looking out through it — interior only) }`
- `porchVisitor = { pos, yaw }` — where a visitor stands, `yaw` faces the front door.
- `peephole = { pos, yaw, pitch }` — interior only: a camera at the door's peephole that frames the visitor's head and shoulders.
- `frontDoorOutside`, `backDoorOutside = { pos, yaw, approach: Vector3 }` — the Scratcher's spot at the door and where its approach starts.
- `roof = { pos, yaw }` — the Siphon's spot by the chimney.
- `rooms[roomId] = { center, corners: [4 Vector3 floor corners] }` — interior only (Dark Dweller tendrils).
- `ring = { x, y, z, r }` — interior only: radius around the interior shell for the circling Light Hunter.
The exterior cabin must occupy exactly the `T.BUILDING` tiles of f_2_2 (x 9–20, y 3–10; annex x 21–23, y 5–9).

### Creature kinds and the state passed to `update(dt, st, ctx)`

- `human` (`opts.app` appearance as in `night.js genVisitor`, plus `opts.visitor`, `opts.npc`): `st = { pose: 'stand'|'walk'|'sit'|'lie', breath, snowy, wet, blinks, mimic, eyeGlow, talking }`.
  These are gameplay tells and must be clearly visible: breath vapour when `breath`, snow on head/shoulders when `snowy`,
  wet sheen when `wet`, eyes that blink only when `blinks`, a brief eye glow when `eyeGlow`.
- `dog`: `{ pose: 'lie'|'walk'|'stand'|'trapped', moving }` · `rabbit`, `deer`, `wolf`, `fox`, `crow`:
  `{ moving, dead, flying, grazing, angry, state, speed, injured, pose }`.
- `lighthunter` `{ stage: 'circling'|'window'|'menu' }` · `stag` `{ stage, moving }` · `scratcher` `{ stage, moving, clawing }` ·
  `siphon` `{}` · `dweller` (`opts.room`) `{ k: 0..1, corners, eyes }` · `mimic` reveal is the `human` with `st.reveal` 0..1.

### Prop keys for `R3.Props.make(key, obj, areaId)`

`struct:<sprite>` (firetower, mast, log, standing, altar, mine, cart, shack, pelts, blind, charred, tent, tent2, firepit,
oak, car, gate, board, dock), `loot:<lm>` (opened state via `NW.Objects.available`-like rules in objects.js),
`sign`, `cairn`, `drop`, `ev:cache`, `ev:supply`, `ev:tracks`, `ev:gift`, `ev:wolves`, `ev:anomaly:<door|bells|warmfire|crows|voice>`,
and every module object's `m3d` key. Module objects may also carry `person: { id, app, yaw, st }` to be drawn as a human.

## Materials and shaders

- Always create materials through `R3.Tex.mat(name, opts)`, `R3.std(params, opts)`, `R3.basic(params, opts)` or
  `R3.glowMat(params)`: they carry the pooled lights, the height fog and the shared uniforms
  (`uTime`, `uWind`, `uWet`, `uSnow`). `opts`: `wind` (vertex sway stiffness), `weather` (world-space grime/variation,
  number = ground height), `snowTop` (0..1 snow on up faces), `wet` (darkens/smooths with rain).
- Never use `THREE.Sprite` or materials made outside these factories (fog chunks expect our uniforms).
- Share geometry and materials (`R3.geo(key, fn)`, `R3.mat(key, fn)`), instance repeated things,
  merge static geometry per material per area (`R3.merge(parts)`). Target: low hundreds of draw calls.
- Textures are procedural (canvas), no image files. UVs in metres (`R3.Tex.metreUV`).

## Testing

Static server: `npx http-server -p 8123 -s -c-1 .` · Playwright Chromium with
`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` (software WebGL2 — slow, ~5 fps; judge looks, not speed).
Start a run with `NW.G.newGame({ mode: 'standard', seed: 1234, intro: false, guided: false })`, move with
`NW.G.enterArea(id, x, y, dir)`, aim with `NW.R3.Controls.yaw/pitch`, set time with `NW.G.state.time.min`.
`NW.R3.renderer.info.render` gives draw calls / triangles after a frame.

## Flora (trees)

`R3.Flora` draws all trees with one InstancedMesh per variant, LOD and material (bark / snow-loaded branch tiers /
alpha branch sprays), so the cost does not grow with the number of built areas. Tree positions come from the game's
own `tree` objects (so trunks match colliders); the species is chosen per tree (spruce, fir, pine, winter birch, snag;
high-crowned variants next to trails so the path stays visible). Instance colour channels are read as variation
(x brightness, y snow load, z hue), not as a tint, by the flora materials; bark meshes get a plain grey tint.
The branch-spray atlas and its snow mask are painted on a canvas at start (`Flora.atlas()`), cells:
0 spruce/fir spray, 1 pine tufts, 2 bare twigs, 3 dry grass stalks (forest.js uses 2 and 3 for shrubs and grass).
Visual snow cover never drops below a winter minimum: `uSnow = 0.62 + 0.38 * weather.snow` (atmos.js).
