# Feature modules and hooks

Feature modules live in `js/mods/*.js` and plug into the core through `NW.Hooks`.
They load after `ui.js` and before `main.js` (see `index.html`). A module must never
break the game: every hook call is wrapped in try/catch and errors go to `NW.hookErrors`.

Rules for module code:

- Plain script, no ES modules: `(function (NW) { 'use strict'; ... })(window.NW);`
- Keep run state in the save with `NW.mod('key', () => ({ ...defaults }))`. It returns the
  object stored in `G.state.mods.key` (created on first use), so it is saved, loaded and
  reset with the run automatically. Data must be JSON-safe.
- Keep cross-run data (achievements, history) in your own `localStorage` key, wrapped in try/catch.
- Never replace a core function. If you must wrap one, keep a reference and always call the original.
- Determinism: use `U.rng(U.hash(state.seed, ...))` for anything that should follow the world seed.
- Placing things in the world: `G.findFreeSpot(areaId, rnd, cx?, cy?, r?)` / `G.spotFree(areaId, x, y, r?)`
  keep new objects walkable, reachable, off the trail edges, away from the cabin, and clear of day
  events and other modules' objects. Compute positions once (seeded) and store them in your mod state.

## Events — `NW.Hooks.on(name, fn)`

| Event | Arguments | When |
|---|---|---|
| `boot` | – | page loaded, menu shown |
| `newGame` | state, opts | new run created (before records and the first morning) |
| `firstStart` | state, opts | the new run has started playing |
| `start` | state | any run starts or loads |
| `update` | dt, gameMinutes | every fixed step (1/60 s) while playing |
| `areaEnter` | id, prevId | player enters an area |
| `dusk` | day | 18:00 warning |
| `nightBegin` | n, plan | night n starts (`plan.final` on the last night) |
| `nightEnd` | n, lines | night n resolved (push strings into `lines` for the dawn summary) |
| `dawn` | n, lines | after dawn processing, before the dawn/ending panel |
| `morning` | day, news, rnd | 06:00; push strings into `news` to add them to the 07:00 radio report |
| `visitorArrive` / `visitorOpened` / `visitorRefused` | visitor | at the front door |
| `visitorResolved` | visitor, text | dawn verdict on a visitor |
| `guestLeft` | visitor, satisfied, lines | a sheltered guest leaves at dawn |
| `ruleUnlocked` | monster, index | a bestiary rule is learned |
| `stat` | key, n | `G.stat` counter changed |
| `tut` | key | a first-day objective was completed |
| `endingShown` | ending, night | the ending panel opens |
| `death` | cause, state | the ranger died (save already cleared) |
| `key` | code, action | a key the core did not use, while playing |
| `drawWorld` | ctx, area, t | after world sprites, in area coordinates |
| `drawOverlay` | ctx, area, t | after lighting and overlays, in screen coordinates (480x272) |

## Filters — return a new value, or `undefined` to keep it

| Filter | Value, extra args |
|---|---|
| `actions` | `[]`, obj, area — extra actions for a static object |
| `name` | name, obj, area |
| `objectives` | `{ title, items: [text] }` or null, state — HUD objective box |
| `music` | mode, state, area — music mode for this frame |
| `nightPlan` | plan, n, rnd |
| `visitor` | visitor, { night, mimic, rnd, permits, prevGenuine, impersonated } |
| `visitorAnswer` | answer, visitor, questionKey |
| `visitorPatience` | seconds, visitor |
| `lhDamage` | 1, windowId — Light Hunter damage multiplier |
| `clawDamage` | hp per second, door |
| `chimneyLight`, `leak`, `stoveHeat`, `cabinHeat`, `stoveBurn`, `hungerRate`, `envTemp`, `damage` | see `survival.js` |
| `cap` | value, key — `G.cap('WOODBOX_CAP')`, `G.cap('STOVE_CAP')` |
| `ending` | null, { night, lines, mode } — return `{ id, title, text: [paragraphs], tone }` |
| `playIntro` | false, begin, opts — return true to take over; call `begin()` when done |
| `panelKey` | false, topPanel, code, event — return true when your panel handled the key |
| `useItem` | false, itemId — return true when your module used the item (pack "Use" button) |
| `itemUsable` | null, itemId — return a button label (e.g. `'Set snare'`) to show a Use button in the pack |

## Collectors — return an array (or one item)

| Collector | Args | Items |
|---|---|---|
| `objects` | areaId, area | dynamic objects: `{ x, y, sy?, draw(ctx, t), name: string or fn, actions(): [action], solid?: {x,y,w,h} }` |
| `lights` | area, t | `{ x, y, r, a, col?, ga? }` light cut into the darkness |
| `endingButtons` | ending, arg | `{ id, label, run }` buttons on the ending panel |
| `gameoverLines` | state, arg | HTML lines on the game-over panel |
| `mapMarks` | state | `{ area, x, y, label, color }` diamond markers on the map |

Actions: `{ label, run() }`, or a hold action `{ label, time, done(), sound?, every? }`.
Optional: `disabled` (false or a reason string), `danger`, `confirm` (needs a second press).

## Areas, items, icons, UI

- `NW.World.registerArea(id, def)` — an enterable building. `def`: `name`, `map` (ASCII:
  `.` floor, `T` wall top, `F` wall face, `|` side wall, `_` bottom wall, `d` doorway, space = void),
  `theme` (`log`, `plank`, `stone`), `shelter` (°C above outside), `dark` (0..1),
  `objs(px)` returning objects with `draw/name/actions` and collider `cx, cy, cw, ch` + `solid`,
  `exits: [{ x, y, w, h, to, tx, ty, dir }]`, `lights`, `mapAt: { area, x, y }`.
  Enter it with `NW.G.enterArea(id, x, y, dir)`. Interiors have `kind: 'interior'`.
- Items: add to `NW.D.ITEMS[id] = { name, desc, kind, stack, ... }` at load time; icons with
  `NW.S.registerIcon(id, (ctx16) => { ... })`. Death causes: `NW.D.DEATH[cause] = { title, text }`.
- UI: `UI.registerPanel(name, render(box, arg), { pauses, sticky })`, `UI.registerDeskTab`,
  `UI.registerJournalTab`, `UI.registerMenuButton`, `UI.registerPauseButton`, `UI.registerSettings`,
  `UI.registerHowto`, `UI.addStyle(css)`, helpers in `UI.h` (`head`, `bindClose`, `esc`, `icon`).
- Full-screen scenes: set `NW.scene = { frame(ctx, dt), key(code), click(e) }` and `G.mode = 'scene'`.
  Hide `#menu` and `#hud` while it runs; set things back when it ends.
- Difficulty: `G.state.mode` (`id`, `name`, `nights`, `endings`, multipliers). `G.finalNight()`,
  `G.modeVal(key)`.
