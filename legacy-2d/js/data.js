'use strict';
// Static game data: items, recipes, world layout, names, bestiary text, loot.
(function (NW) {
  const D = NW.D = {};

  D.TILE = 16;
  D.VW = 30; D.VH = 17;               // view size in tiles
  D.CW = 480; D.CH = 272;             // canvas size in pixels
  D.SAVE_VERSION = 3;
  D.FINAL_NIGHT = 7;
  // Difficulty modes. Multipliers: monster (how fast threats escalate), damage (monster damage to you),
  // hunger (hunger drain), patience (how long visitors wait), loot (salvage quantity).
  D.MODES = {
    easy: { name: 'Easy', nights: 7, endings: false, monster: 0.75, damage: 0.7, hunger: 0.8, patience: 1.4, loot: 1.3,
      desc: 'Seven nights. Gentler monsters, slower hunger, patient visitors and more salvage. One ending.' },
    standard: { name: 'Standard', nights: 7, endings: true, monster: 1, damage: 1, hunger: 1, patience: 1, loot: 1,
      desc: 'Seven nights, the way the watch was meant to be. Your choices decide the ending. Endless survival afterwards.' },
    hard: { name: 'Hard', nights: 14, endings: true, monster: 1.15, damage: 1.15, hunger: 1.1, patience: 0.9, loot: 0.85,
      desc: 'Fourteen nights. Faster threats, harder hits, scarcer salvage.' },
    harder: { name: 'Harder', nights: 25, endings: true, monster: 1.3, damage: 1.3, hunger: 1.2, patience: 0.8, loot: 0.7,
      desc: 'Twenty-five nights. For rangers who have seen it all.' },
    custom: { name: 'Custom', nights: 10, endings: true, monster: 1, damage: 1, hunger: 1, patience: 1, loot: 1,
      desc: 'Set the number of nights and tune every pressure yourself.' },
  };

  // Time: minutes of game time per real second
  D.DAY_SPEED = 2.4;
  D.NIGHT_SPEED = 1.6;
  D.NIGHT_START = 19 * 60;  // 19:00
  D.DAWN = 6 * 60;          // 06:00
  D.DUSK = 18 * 60;         // 18:00

  // ---------------------------------------------------------------- Items
  D.ITEMS = {
    wood:        { name: 'Firewood', stack: 8, kind: 'material', desc: 'Split dry wood. Feeds the stove. Each log burns for a while.' },
    plank:       { name: 'Plank', stack: 6, kind: 'material', desc: 'A sawn board. Used for repairs and reinforcement.' },
    nails:       { name: 'Nails', stack: 20, kind: 'material', desc: 'Iron nails. Needed for nearly every repair.' },
    scrap:       { name: 'Scrap Metal', stack: 5, kind: 'material', desc: 'Bent iron and old hinges. Used to repair locks.' },
    cloth:       { name: 'Cloth', stack: 5, kind: 'material', desc: 'Clean-ish fabric. Used for bandages.' },
    rope:        { name: 'Rope', stack: 5, kind: 'material', desc: 'Sturdy hemp rope. Used to reinforce doors.' },
    glass:       { name: 'Glass Pane', stack: 2, kind: 'material', desc: 'A window pane wrapped in newspaper. Rare. Restores a broken window.' },
    ammo:        { name: 'Rifle Rounds', stack: 20, kind: 'material', desc: '.30-06 rounds for the ranger rifle.' },
    oil:         { name: 'Lamp Oil', stack: 3, kind: 'material', desc: 'A tin of kerosene. Pour into the oil drum in storage (+30 oil).' },
    raw_rabbit:  { name: 'Raw Rabbit', stack: 4, kind: 'raw', desc: 'Needs cooking. Eating it raw will make you sick.', food: 8, heal: -8 },
    raw_venison: { name: 'Raw Venison', stack: 4, kind: 'raw', desc: 'A cut of deer meat. Needs cooking.', food: 10, heal: -8 },
    cooked_rabbit:  { name: 'Roast Rabbit', stack: 4, kind: 'food', desc: 'Restores hunger and a little health.', food: 28, heal: 4 },
    cooked_venison: { name: 'Venison Steak', stack: 4, kind: 'food', desc: 'Hearty. Restores a lot of hunger and a little health.', food: 42, heal: 6 },
    berries:     { name: 'Lingonberries', stack: 10, kind: 'food', desc: 'Tart forest berries. Edible raw, but not filling.', food: 6, heal: 0 },
    mushroom:    { name: 'Chanterelles', stack: 6, kind: 'raw', desc: 'Best roasted. Raw they upset the stomach.', food: 4, heal: -4 },
    roast_mush:  { name: 'Roasted Mushrooms', stack: 6, kind: 'food', desc: 'Earthy and warm.', food: 15, heal: 2 },
    canned:      { name: 'Canned Beans', stack: 4, kind: 'food', desc: 'Old reliable. Ready to eat.', food: 30, heal: 2 },
    yarrow:      { name: 'Yarrow', stack: 6, kind: 'herb', desc: 'White-flowered herb. Base of most remedies.' },
    wintergreen: { name: 'Wintergreen', stack: 6, kind: 'herb', desc: 'Glossy leaves. Brewed into a warming tonic.' },
    smokeweed:   { name: 'Smokeweed', stack: 6, kind: 'herb', desc: 'Grey, bitter, smoulders with thick acrid smoke when thrown in a fire.' },
    poultice:    { name: 'Yarrow Poultice', stack: 4, kind: 'medicine', desc: 'Packed on wounds. Restores health.', heal: 30 },
    tonic:       { name: 'Wintergreen Tonic', stack: 4, kind: 'medicine', desc: 'Restores health and warms the body.', heal: 50, warm: 1.2 },
    bandage:     { name: 'Bandage', stack: 4, kind: 'medicine', desc: 'Boiled cloth and yarrow. Restores some health.', heal: 22 },
    medkit:      { name: 'First Aid Kit', stack: 2, kind: 'medicine', desc: 'Proper supplies. Restores a lot of health.', heal: 70 },
  };
  D.FOOD_ORDER = ['cooked_venison', 'cooked_rabbit', 'canned', 'roast_mush', 'berries'];
  D.MED_ORDER = ['medkit', 'tonic', 'poultice', 'bandage'];

  D.INV_SLOTS = 10;
  D.CHEST_SLOTS = 24;
  D.WOODBOX_CAP = 15;
  D.WOODPILE_CAP = 40;
  D.STOVE_CAP = 50;      // fuel units
  D.WOOD_FUEL = 10;      // units per log
  D.OIL_CAP = 100;

  // Stove settings: fuel per game hour, heat contribution (°C), light
  D.STOVE = {
    off:    { label: 'Out',    burn: 0,  heat: 0,  light: 0,    chimney: 0 },
    low:    { label: 'Low',    burn: 3,  heat: 15, light: 0.32, chimney: 0.06 },
    medium: { label: 'Medium', burn: 6,  heat: 24, light: 0.55, chimney: 0.22 },
    high:   { label: 'High',   burn: 12, heat: 34, light: 0.9,  chimney: 0.95 },
  };
  D.LAMP_LIGHT = 0.5;
  D.LAMP_OIL_PER_HOUR = 3;

  // Recipes, grouped by the station that offers them (contextual, no crafting table)
  D.RECIPES = {
    cook: [
      { id: 'c_rabbit', name: 'Roast rabbit', in: { raw_rabbit: 1 }, out: { cooked_rabbit: 1 }, time: 3.5 },
      { id: 'c_venison', name: 'Cook venison', in: { raw_venison: 1 }, out: { cooked_venison: 1 }, time: 4.5 },
      { id: 'c_mush', name: 'Roast mushrooms', in: { mushroom: 1 }, out: { roast_mush: 1 }, time: 2.5 },
      { id: 'm_poultice', name: 'Yarrow poultice', in: { yarrow: 2 }, out: { poultice: 1 }, time: 3.5 },
      { id: 'm_tonic', name: 'Wintergreen tonic', in: { yarrow: 1, wintergreen: 1 }, out: { tonic: 1 }, time: 4.5 },
      { id: 'm_bandage', name: 'Boil bandage', in: { cloth: 1, yarrow: 1 }, out: { bandage: 1 }, time: 3 },
    ],
    saw: [
      { id: 's_plank', name: 'Saw plank', in: { wood: 2 }, out: { plank: 1 }, time: 2.5 },
    ],
  };

  D.REPAIRS = {
    glass:     { name: 'Replace glass', in: { glass: 1 }, time: 3 },
    board:     { name: 'Board up window', in: { plank: 2, nails: 3 }, time: 3.5 },
    shutter:   { name: 'Repair shutters', in: { plank: 1, nails: 2 }, time: 3 },
    door:      { name: 'Repair door', in: { plank: 2, nails: 2 }, time: 3.5 },
    reinforce: { name: 'Reinforce door', in: { plank: 3, nails: 4, rope: 1 }, time: 4.5 },
    lock:      { name: 'Repair lock', in: { scrap: 1, nails: 1 }, time: 3 },
  };

  // ------------------------------------------------------------- World
  D.AREAS = {
    f_0_0: { name: 'Old Fire Tower', lm: 'firetower' },
    f_1_0: { name: 'Birch Hollow', lm: 'birches' },
    f_2_0: { name: 'Lake Wren', lm: 'lake' },
    f_3_0: { name: 'Creek Stones', lm: 'stones', creek: true },
    f_4_0: { name: 'Relay Mast', lm: 'mast' },
    f_0_1: { name: 'Deadfall Ridge', lm: 'deadfall' },
    f_1_1: { name: 'Stone Circle', lm: 'stonecircle' },
    f_2_1: { name: 'North Woods', lm: null },
    f_3_1: { name: 'Hollow Mine', lm: 'mine', creek: true },
    f_4_1: { name: 'East Pines', lm: null },
    f_0_2: { name: "Trapper's Shack", lm: 'shack' },
    f_1_2: { name: 'Red Cairn Woods', lm: 'cairn' },
    f_2_2: { name: 'Ranger Cabin', lm: 'cabin' },
    f_3_2: { name: 'Crow Creek Bridge', lm: 'bridge', creek: true },
    f_4_2: { name: 'Hunting Blind', lm: 'blind' },
    f_0_3: { name: 'Burned Clearing', lm: 'burned' },
    f_1_3: { name: 'Fern Gully', lm: null },
    f_2_3: { name: 'Abandoned Camp', lm: 'camp' },
    f_3_3: { name: 'Creekside', lm: null, creek: true },
    f_4_3: { name: 'Hollow Oak', lm: 'oak' },
    f_0_4: { name: 'Southwest Thicket', lm: null },
    f_1_4: { name: 'Logging Road', lm: 'car' },
    f_2_4: { name: 'Trailhead', lm: 'trailhead' },
    f_3_4: { name: 'Shallow Ford', lm: 'ford', creek: true },
    f_4_4: { name: 'Southeast Bog', lm: 'bog' },
  };
  // Trail connections between neighbouring areas.
  D.LINKS_H = [ // [x,y] connects to [x+1,y]
    [0, 0], [1, 0], [2, 0], [3, 0],
    [0, 1], [1, 1], [2, 1],
    [0, 2], [1, 2], [2, 2], [3, 2],
    [0, 3], [1, 3], [2, 3],
    [1, 4], [2, 4], [3, 4],
  ];
  D.LINKS_V = [ // [x,y] connects to [x,y+1]
    [0, 0], [0, 1], [0, 2], [0, 3],
    [1, 0], [1, 1], [1, 2], [1, 3],
    [2, 0], [2, 1], [2, 2], [2, 3],
    [3, 0], [3, 1], [3, 2], [3, 3],
    [4, 0], [4, 1], [4, 2], [4, 3],
  ];
  D.areaId = (x, y) => 'f_' + x + '_' + y;
  D.areaXY = (id) => { const p = id.split('_'); return [+p[1], +p[2]]; };
  D.linked = function (x1, y1, x2, y2) {
    if (y1 === y2) { const x = Math.min(x1, x2); return Math.abs(x1 - x2) === 1 && D.LINKS_H.some((l) => l[0] === x && l[1] === y1); }
    if (x1 === x2) { const y = Math.min(y1, y2); return Math.abs(y1 - y2) === 1 && D.LINKS_V.some((l) => l[0] === x1 && l[1] === y); }
    return false;
  };
  D.DIRNAME = (dx, dy) => {
    const v = dy < 0 ? 'north' : dy > 0 ? 'south' : '';
    const h = dx < 0 ? 'west' : dx > 0 ? 'east' : '';
    return (v + h) || 'here';
  };
  // Containers in landmarks that hold salvage (refill every few days)
  D.LOOT = {
    firetower: { name: "Lookout's footlocker", table: ['ammo', 'cloth', 'canned', 'nails', 'glass', 'oil'] },
    shack:     { name: "Trapper's chest", table: ['rope', 'scrap', 'nails', 'ammo', 'cloth', 'smokeweed'] },
    camp:      { name: 'Abandoned backpack', table: ['canned', 'cloth', 'medkit', 'oil', 'rope', 'berries'] },
    mine:      { name: 'Mining crate', table: ['scrap', 'nails', 'oil', 'rope', 'scrap', 'nails'] },
    car:       { name: 'Rusted trunk', table: ['scrap', 'glass', 'oil', 'cloth', 'nails', 'canned'] },
    blind:     { name: "Hunter's box", table: ['ammo', 'ammo', 'canned', 'rope', 'cloth', 'nails'] },
    mast:      { name: 'Maintenance toolbox', table: ['scrap', 'nails', 'glass', 'oil', 'nails', 'medkit'] },
    trailhead: { name: 'Lost-and-found bin', table: ['canned', 'cloth', 'medkit', 'berries', 'oil', 'nails'] },
  };
  D.LOOT_QTY = { ammo: [3, 6], nails: [3, 7], cloth: [1, 2], canned: [1, 2], glass: [1, 1], oil: [1, 1], rope: [1, 2], scrap: [1, 2], medkit: [1, 1], berries: [2, 4], smokeweed: [1, 2] };

  // ---------------------------------------------------------- Rooms
  D.ROOMS = {
    room_main: { name: 'Main Room' },
    room_bed: { name: 'Bedroom' },
    room_office: { name: "Ranger's Office" },
    room_storage: { name: 'Storage Room' },
  };
  // Global cabin-plan origin of each room (tiles) - used for directional sound
  D.ROOM_ORIGIN = { room_main: [14, 10], room_bed: [0, 11], room_office: [35, 11], room_storage: [17, 1] };

  // ------------------------------------------------------- People
  D.FIRST = ['Dana', 'Marcus', 'Elena', 'Tom', 'Priya', 'Owen', 'Ruth', 'Caleb', 'Ines', 'Walt', 'June', 'Felix', 'Hana', 'Silas', 'Mara', 'Gideon', 'Nell', 'Arlo', 'Tess', 'Bram', 'Lucia', 'Ivan', 'Wren', 'Abel', 'Della', 'Rory', 'Celia', 'Hollis', 'Agnes', 'Emmett'];
  D.LAST = ['Whitlock', 'Bell', 'Okafor', 'Lindqvist', 'Moreau', 'Hask', 'Delgado', 'Pryor', 'Vance', 'Ashby', 'Kowal', 'Brandt', 'Ferris', 'Nakamura', 'Holt', 'Ruiz', 'Garrow', 'Sutter', 'Albrecht', 'Quill', 'Marsh', 'Tamsin', 'Oyelaran', 'Reyes', 'Coombs'];
  D.ORIGINS = ['f_2_0', 'f_0_0', 'f_1_1', 'f_0_2', 'f_2_3', 'f_4_2', 'f_4_0', 'f_3_1', 'f_2_4', 'f_1_4', 'f_4_3', 'f_0_3'];

  // ------------------------------------------------------- Bestiary
  D.BESTIARY = {
    lighthunter: {
      name: 'The Light Hunter',
      rules: [
        'Drawn to light and heat escaping the cabin: windows and the chimney.',
        'A HIGH stove pours light up the chimney, curtains and shutters only partly hide it.',
        'Heavy footsteps circling the cabin mean it is interested. Lower the light.',
        'At a window it presses on the glass. Darken that room and it loses interest.',
        'Closed shutters take the damage first. Repair them before they fail.',
      ],
    },
    dweller: {
      name: 'The Dark Dweller',
      rules: [
        'It grows in rooms left dark for too long. Whispers mean it is gathering.',
        'It strikes only when the room YOU are in is dark. Keep your own room lit.',
        'Keeping some light inside keeps it at bay - but light can draw the Light Hunter.',
        'Lamps and the stove both count. Curtains let you keep light inside without leaking it.',
      ],
    },
    mimic: {
      name: 'Mimics',
      rules: [
        'Some visitors are not people. They sound right and they look almost right.',
        'In freezing air, real breath fogs. Look closely through the peephole.',
        'Fresh snow keeps footprints. Look from the front windows.',
        'They borrow names: people who already left the forest, or who already came to your door.',
        'Their stories drift: wrong weather, wrong landmarks, a bridge that is no longer there.',
        'Real people make mistakes too. Weigh everything before opening the door.',
      ],
    },
    scratcher: {
      name: 'The Scratcher',
      rules: [
        'It comes to a door, never a window. Dragging sounds and a growling dog warn of it.',
        'An unlocked door is an invitation. Keep doors locked at night.',
        'It claws at locked doors. Brace the door (hold) to drive it off, at a cost of stamina.',
        'Reinforced doors resist it far longer.',
      ],
    },
    siphon: {
      name: 'The Siphon',
      rules: [
        'It clings to the chimney and drinks the fire\'s heat. The stove burns wood three times faster.',
        'Scraping across the roof and soot falling into the stove are its signs.',
        'Smokeweed thrown into the stove drives it off at once.',
        'Starving the fire (stove OUT) for a short while also makes it leave - if you can bear the cold and the dark.',
      ],
    },
    stag: {
      name: 'The Pale Stag',
      rules: [
        'It walks the forest after dark. Bells mean it has your scent.',
        'It will not cross into the cabin clearing.',
        'You cannot outfight it. Be home before nightfall, or run for the clearing.',
      ],
    },
    wolf: {
      name: 'Grey Wolves',
      rules: [
        'Wolves roam the far edges of the forest by day. A growl comes before the bite.',
        'Two rifle hits will stop one. Running far enough makes them lose interest.',
      ],
    },
  };

  D.DEATH = {
    cold: { title: 'Frozen', text: 'Your body temperature fell too low. Body heat drops slowly in the cold: watch the thermometer, keep the stove burning, stay near it, and avoid long trips outside at night or in blizzards. A Wintergreen Tonic warms you quickly.' },
    heat: { title: 'Heatstroke', text: 'You stayed too close to a stove burning on HIGH. High heat warms the cabin fast but overheats you if you stand next to it. Step away or turn it down when the thermometer turns red.' },
    starve: { title: 'Starvation', text: 'Hunger ran out and your health drained away. Hunt rabbits and deer, gather berries and mushrooms, and cook meat at the cooking station. Eat when the hunger bar turns amber.' },
    lighthunter: { title: 'Taken by the Light Hunter', text: 'The Light Hunter broke through a window. It follows light and heat that escape the cabin. When you hear heavy footsteps circling, lower the stove, put out lamps in rooms with open windows, and close curtains or shutters.' },
    dweller: { title: 'Consumed by the Dark', text: 'The Dark Dweller struck while you stood in a dark room. It gathers when rooms stay dark too long and attacks only where there is no light. Keep a lamp or the stove lit, and carry light with you at night.' },
    scratcher: { title: 'Torn Through the Door', text: 'The Scratcher came through a door. Lock both doors at night. When you hear claws, brace the door to drive it off, and reinforce doors with planks, nails and rope.' },
    mimic: { title: 'You Let It In', text: 'The visitor was a Mimic. Check for breath fog through the peephole, footprints from the front windows, and compare names and stories with the records at the Ranger\'s desk.' },
    stag: { title: 'Run Down by the Pale Stag', text: 'The Pale Stag hunts anyone in the forest after dark. Return to the cabin clearing before nightfall. When you hear its bells, run for the clearing.' },
    wolf: { title: 'Killed by Wolves', text: 'Wolves roam the outer forest. When you hear a growl, shoot (two hits) or retreat toward the cabin. Keep health up before long trips.' },
    sick: { title: 'Poisoned', text: 'Raw meat and raw mushrooms damage your health. Cook them at the cooking station first.' },
    unknown: { title: 'The Watch Ends', text: 'Your health reached zero.' },
  };

  D.TIPS = [
    'Wood is everything. Keep the wood box by the stove full before dusk.',
    'Closed curtains keep light inside. Shutters hide even more, but you cannot see out.',
    'A lamp in your room keeps the Dark Dweller away from you.',
    'HQ always opens with "Base to Watch Seven" and closes with "Base out."',
    'Check the records at the desk before you open the door to a stranger.',
    'Cold creeps in slowly. Watch the thermometer, not your feelings.',
    'A plank is two logs on the sawhorse. Repairs need planks and nails.',
  ];
})(window.NW);
