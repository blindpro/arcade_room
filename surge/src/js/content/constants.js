// Tunables for SURGE. One place for the runner physics, the environments and
// their obstacle/weapon/enemy pools, the weapons and items, the scoring, and
// the audio pacing — so the feel can be tuned without touching logic.
//
// SURGE is an audio-first endless runner with a mobile-game wrapper. You
// always run forward down a 5-lane road; the stereo field is centred on YOU,
// so every obstacle, enemy and pickup is panned by its lane offset from your
// position and loudened by how far ahead it is. You steer left/right, jump
// over hazards, shoot enemies with environment-appropriate weapons, collect
// coins/gems/cores, and everything you earn feeds a persistent profile with
// currencies, a shop, achievements and daily missions.
content.constants = (() => {
  // ---- the road ---------------------------------------------------------------
  const LANES = 5             // lanes across the road
  const LANE_HALF = 2         // metres from centre to edge lane centre (±2)
  const EDGE = 2.35           // hard clamp on the player's x

  // ---- running ------------------------------------------------------------------
  const BASE_SPEED = 11       // m/s when the run starts
  const MAX_SPEED = 30
  const SPEED_RAMP = 0.035    // m/s added per metre run
  const JUMP_SPEED_BOOST = 1.6 // m/s extra forward while airborne
  const STEER_SPEED = 6       // m/s lateral
  const ICE_SLIP = 0.35       // steer effectiveness on ice patches
  const SLUDGE_SLOW = 0.55    // speed multiplier in sewer sludge

  // ---- jumping -------------------------------------------------------------------
  const JUMP_VY = 9.2         // initial vertical velocity
  const GRAVITY = 21          // base gravity (m/s^2) — snappy arc
  const GRAVITY_LOW = 0.55    // low-gravity zone multiplier
  const GRAVITY_HIGH = 1.8    // high-gravity zone multiplier

  // ---- health --------------------------------------------------------------------
  const HP_MAX = 100

  // ---- field generation -------------------------------------------------------------
  const HORIZON = 220         // metres ahead the field is pre-generated
  const CLUSTER_GAP_MIN = 24
  const CLUSTER_GAP_MAX = 46
  const THREAT_SPAN = 85      // metres ahead the nearest threat starts cueing
  const PICKUP_SPAN = 60      // metres ahead pickups whisper
  const HELI_WINDOW = 12      // metres the overhead heli blocks jumping

  // ---- scoring ---------------------------------------------------------------------
  const SCORE_PER_METER = 1
  const SCORE_COIN = 10
  const SCORE_GEM = 50
  const SCORE_CORE = 200
  const SCORE_KILL = 25

  // ---- modes ------------------------------------------------------------------------
  const ADVENTURE_ORDER = ['city', 'desert', 'volcano', 'tundra', 'space', 'jungle', 'ocean', 'neon', 'cavern']
  const ADVENTURE_LEN = 400   // metres per adventure level
  const ENDLESS_SEGMENT = 250 // metres per endless environment segment
  const SPRINT_TIME = 90      // seconds
  const ENDLESS_ORDER = ['city', 'desert', 'volcano', 'tundra', 'space', 'jungle', 'ocean', 'neon', 'cavern']

  function difficultyFor(envLevel, mode, dist) {
    // envLevel: 1-based adventure level or endless segment index (1-based)
    const l = Math.max(1, envLevel | 0)
    const d = Math.max(0, dist)
    if (mode === 'practice') return 0
    if (mode === 'sprint') return 0.5 + Math.min(1, d / 6000) * 0.7
    // adventure: +0.12 per level, endless: ramps with distance, re-pegged per segment
    if (mode === 'adventure') return Math.min(2.2, (l - 1) * 0.14)
    return Math.min(2.2, d / 2200)
  }
  function speedFor(dist, mode) {
    const base = mode === 'practice' ? 12 : BASE_SPEED
    return Math.min(MAX_SPEED, base + Math.max(0, dist) * SPEED_RAMP)
  }
  function clusterGap(diff) {
    const span = CLUSTER_GAP_MAX - CLUSTER_GAP_MIN
    const g = CLUSTER_GAP_MIN + span * (0.25 + Math.random() * 0.75)
    return Math.max(12, g - diff * 5)
  }

  // ---- environments -------------------------------------------------------------------
  // Each environment defines its own obstacle pool (kind + weight + width),
  // enemy pool, default weapon + ammo, ambience id, music scale and colours.
  const OBSTACLE_POOLS = {
    city:    [['car', 3], ['manhole', 3], ['ledge', 2], ['heli', 1.5], ['fence', 0.4]],
    desert:  [['pit', 3], ['spikes', 3], ['ledge', 2], ['drop', 1.5], ['fence', 0.6]],
    volcano: [['lava', 3], ['fire', 3], ['spikes', 2], ['ledge', 1.5], ['fence', 0.7]],
    tundra:  [['pit', 2.5], ['ice', 2.5], ['ledge', 2], ['drop', 1.5], ['fence', 0.5]],
    space:   [['pit', 2], ['teleporter', 2], ['gravity', 2], ['heli', 1.2], ['fence', 0.8]],
    sewer:   [['spikes', 3], ['drop', 2], ['sludge', 2.5], ['pit', 2]],
    jungle:  [['root', 3], ['spear', 3], ['quicksand', 2.5], ['vine', 1.4], ['drop', 1.5]],
    ocean:   [['rip', 3], ['current', 2.5], ['tide', 2.5], ['reef', 2], ['drop', 1.5]],
    neon:    [['glitch', 3], ['turret', 2.5], ['datawall', 2], ['drop', 1.5], ['heli', 0.8]],
    cavern:  [['cavein', 3], ['rockfall', 2.5], ['stalagmite', 2.5], ['magma', 2], ['drop', 1.5]],
  }
  const ENEMY_POOLS = {
    city:    ['thug'],
    desert:  ['thug', 'imp'],
    volcano: ['imp', 'tank'],
    tundra:  ['shielded', 'thug'],
    space:   ['drone', 'shielded'],
    sewer:   ['rat'],
    jungle:  ['monkey', 'viper'],
    ocean:   ['crab', 'octo'],
    neon:    ['bot', 'viroid'],
    cavern:  ['bat', 'troll'],
  }
  const ENV = {
    city:    {nameKey: 'env.city', descKey: 'env.city.desc', gravity: 1.0, ambience: 'city', music: 'city', weapon: 'pistol', ammo: 'pistol', color: '#4a90d9', pools: OBSTACLE_POOLS.city, enemies: ENEMY_POOLS.city},
    desert:  {nameKey: 'env.desert', descKey: 'env.desert.desc', gravity: 1.0, ambience: 'desert', music: 'desert', weapon: 'rifle', ammo: 'rifle', color: '#e0b35e', pools: OBSTACLE_POOLS.desert, enemies: ENEMY_POOLS.desert},
    volcano: {nameKey: 'env.volcano', descKey: 'env.volcano.desc', gravity: 1.0, ambience: 'volcano', music: 'volcano', weapon: 'shotgun', ammo: 'shell', color: '#ff6a3d', pools: OBSTACLE_POOLS.volcano, enemies: ENEMY_POOLS.volcano},
    tundra:  {nameKey: 'env.tundra', descKey: 'env.tundra.desc', gravity: 0.9, ambience: 'tundra', music: 'tundra', weapon: 'bow', ammo: 'arrow', color: '#9ad8ff', pools: OBSTACLE_POOLS.tundra, enemies: ENEMY_POOLS.tundra},
    space:   {nameKey: 'env.space', descKey: 'env.space.desc', gravity: 1.0, ambience: 'space', music: 'space', weapon: 'laser', ammo: 'energy', color: '#c78dff', pools: OBSTACLE_POOLS.space, enemies: ENEMY_POOLS.space},
    sewer:   {nameKey: 'env.sewer', descKey: 'env.sewer.desc', gravity: 1.0, ambience: 'sewer', music: 'sewer', weapon: 'pistol', ammo: 'pistol', color: '#5aa05a', pools: OBSTACLE_POOLS.sewer, enemies: ENEMY_POOLS.sewer},
    jungle:  {nameKey: 'env.jungle', descKey: 'env.jungle.desc', gravity: 1.0, ambience: 'jungle', music: 'jungle', weapon: 'dart', ammo: 'dart', color: '#3da63d', pools: OBSTACLE_POOLS.jungle, enemies: ENEMY_POOLS.jungle},
    ocean:   {nameKey: 'env.ocean', descKey: 'env.ocean.desc', gravity: 0.9, ambience: 'ocean', music: 'ocean', weapon: 'harpoon', ammo: 'harpoon', color: '#2aa8e0', pools: OBSTACLE_POOLS.ocean, enemies: ENEMY_POOLS.ocean},
    neon:    {nameKey: 'env.neon', descKey: 'env.neon.desc', gravity: 1.0, ambience: 'neon', music: 'neon', weapon: 'plasma', ammo: 'plasma', color: '#ff4bd8', pools: OBSTACLE_POOLS.neon, enemies: ENEMY_POOLS.neon},
    cavern:  {nameKey: 'env.cavern', descKey: 'env.cavern.desc', gravity: 1.0, ambience: 'cavern', music: 'cavern', weapon: 'shard', ammo: 'shard', color: '#b07a5a', pools: OBSTACLE_POOLS.cavern, enemies: ENEMY_POOLS.cavern},
  }
  const ENV_IDS = Object.keys(ENV)

  // ---- obstacles ------------------------------------------------------------------------
  // w = default lane-width, dmg = contact damage, cued = has a proximity cue sound.
  const OBSTACLES = {
    pit:        {nameKey: 'obs.pit', w: 1.5, dmg: 25, color: '#20242e', cued: true},
    lava:       {nameKey: 'obs.lava', w: 1.5, dmg: 30, color: '#ff5f1f', cued: true},
    fire:       {nameKey: 'obs.fire', w: 1.2, dmg: 20, color: '#ffd23d', cued: true},
    spikes:     {nameKey: 'obs.spikes', w: 1.2, dmg: 15, color: '#cfd4da', cued: true},
    ledge:      {nameKey: 'obs.ledge', w: 1.6, dmg: 15, color: '#8a6d3b', cued: true},
    drop:       {nameKey: 'obs.drop', w: 1.4, dmg: 5, color: '#b8a26a', cued: true},
    car:        {nameKey: 'obs.car', w: 1.2, dmg: 20, color: '#ff7ab8', cued: true},
    manhole:    {nameKey: 'obs.manhole', w: 1, dmg: 0, color: '#4b4f57', cued: true},
    fence:      {nameKey: 'obs.fence', w: 5, dmg: 25, color: '#ffe96a', cued: true},
    teleporter: {nameKey: 'obs.teleporter', w: 1.4, dmg: 0, color: '#b06bff', cued: true},
    heli:       {nameKey: 'obs.heli', w: 5, dmg: 25, color: '#9fe6c4', cued: true},
    ice:        {nameKey: 'obs.ice', w: 2, dmg: 0, color: '#d8f2ff', cued: true},
    sludge:     {nameKey: 'obs.sludge', w: 2, dmg: 0, color: '#6b8f3d', cued: true},
    gravity:    {nameKey: 'obs.gravity', w: 5, dmg: 0, color: '#9ae6ff', cued: true},
    root:       {nameKey: 'obs.root', w: 1.6, dmg: 15, color: '#6a9a4a', cued: true},
    spear:      {nameKey: 'obs.spear', w: 1.2, dmg: 18, color: '#9fcf5a', cued: true},
    quicksand:  {nameKey: 'obs.quicksand', w: 2, dmg: 0, color: '#a98a4a', cued: true},
    vine:       {nameKey: 'obs.vine', w: 5, dmg: 0, color: '#4aa04a', cued: true},
    rip:        {nameKey: 'obs.rip', w: 1.5, dmg: 20, color: '#2aa8e0', cued: true},
    current:    {nameKey: 'obs.current', w: 2, dmg: 0, color: '#1f7fbf', cued: true},
    tide:       {nameKey: 'obs.tide', w: 2, dmg: 0, color: '#6fd4ff', cued: true},
    reef:       {nameKey: 'obs.reef', w: 1.2, dmg: 15, color: '#7ad9b0', cued: true},
    glitch:     {nameKey: 'obs.glitch', w: 1.2, dmg: 20, color: '#ff4bd8', cued: true},
    turret:     {nameKey: 'obs.turret', w: 1.2, dmg: 22, color: '#ff7a6a', cued: true},
    datawall:   {nameKey: 'obs.datawall', w: 5, dmg: 25, color: '#8f6aff', cued: true},
    rockfall:   {nameKey: 'obs.rockfall', w: 1.2, dmg: 22, color: '#b07a5a', cued: true},
    stalagmite: {nameKey: 'obs.stalagmite', w: 1.2, dmg: 15, color: '#cfa87a', cued: true},
    cavein:     {nameKey: 'obs.cavein', w: 1.5, dmg: 25, color: '#8a6d3b', cued: true},
    magma:      {nameKey: 'obs.magma', w: 1.5, dmg: 30, color: '#ff7a2a', cued: true},
  }
  function obstacleById(id) { return OBSTACLES[id] || OBSTACLES.pit }

  // ---- pickups -------------------------------------------------------------------------
  const PICKUP_REWARDS = {
    coin:      {points: SCORE_COIN,  color: '#ffd24a'},
    gem:       {points: SCORE_GEM,   color: '#7ef2ff'},
    core:      {points: SCORE_CORE,  color: '#ff9ef0'},
    ammo:      {points: 5,           color: '#9affa1'},
    medkit:    {points: 0,           color: '#ff7d7d'},
    emp:       {points: 0,           color: '#ffdd66'},
    shield:    {points: 0,           color: '#7dc8ff'},
    boost:     {points: 0,           color: '#ffb26b'},
    overdrive: {points: 0,           color: '#7ef2ff'},
    brake:     {points: 0,           color: '#c78dff'},
  }

  // ---- weapons ------------------------------------------------------------------------
  // auto: hold space to keep firing · charge: hold space to build power (bow/laser)
  // magSize 0 = magazine-less (laser energy cell, bow arrow).
  const WEAPONS = {
    pistol:  {slot: 1, nameKey: 'weapon.pistol', auto: false, rate: 0.18, magSize: 12, dmg: 20, range: 70, pellets: 1, splash: 0, ammo: 'pistol', charge: 0, color: '#d8d8d8'},
    rifle:   {slot: 2, nameKey: 'weapon.rifle', auto: true, rate: 0.095, magSize: 30, dmg: 13, range: 80, pellets: 1, splash: 0, ammo: 'rifle', charge: 0, color: '#9adc8e'},
    shotgun: {slot: 3, nameKey: 'weapon.shotgun', auto: false, rate: 0.72, magSize: 6, dmg: 9, range: 34, pellets: 5, splash: 0, ammo: 'shell', charge: 0, color: '#ffb06b'},
    laser:   {slot: 4, nameKey: 'weapon.laser', auto: true, rate: 0.08, magSize: 0, dmg: 26, range: 90, pellets: 1, splash: 0, ammo: 'energy', charge: 0.35, color: '#7ef2ff'},
    bow:     {slot: 5, nameKey: 'weapon.bow', auto: false, rate: 0.25, magSize: 1, dmg: 15, range: 75, pellets: 1, splash: 0, ammo: 'arrow', charge: 0.9, color: '#e8d49a'},
    rocket:  {slot: 6, nameKey: 'weapon.rocket', auto: false, rate: 1.6, magSize: 1, dmg: 130, range: 60, pellets: 1, splash: 3, ammo: 'rocket', charge: 0, color: '#ff8d5a'},
    dart:    {slot: 7, nameKey: 'weapon.dart', auto: false, rate: 0.26, magSize: 6, dmg: 24, range: 65, pellets: 1, splash: 0, ammo: 'dart', charge: 0, color: '#7ef2a0'},
    harpoon: {slot: 8, nameKey: 'weapon.harpoon', auto: false, rate: 0.95, magSize: 3, dmg: 45, range: 80, pellets: 1, splash: 0, ammo: 'harpoon', charge: 0, color: '#ffb06b'},
    plasma:  {slot: 9, nameKey: 'weapon.plasma', auto: true, rate: 0.16, magSize: 10, dmg: 22, range: 70, pellets: 1, splash: 0, ammo: 'plasma', charge: 0, color: '#c78dff'},
    shard:   {slot: 10, nameKey: 'weapon.shard', auto: false, rate: 0.32, magSize: 8, dmg: 28, range: 60, pellets: 1, splash: 0, ammo: 'shard', charge: 0, color: '#b9e6ff'},
  }
  function weaponById(id) { return WEAPONS[id] || WEAPONS.pistol }
  const WEAPON_IDS = Object.keys(WEAPONS)

  const AMMO = {
    pistol:   {nameKey: 'ammo.pistol', color: '#d8d8d8'},
    rifle:    {nameKey: 'ammo.rifle', color: '#9adc8e'},
    shell:    {nameKey: 'ammo.shell', color: '#ffb06b'},
    energy:   {nameKey: 'ammo.energy', color: '#7ef2ff'},
    arrow:    {nameKey: 'ammo.arrow', color: '#e8d49a'},
    rocket:   {nameKey: 'ammo.rocket', color: '#ff8d5a'},
    dart:     {nameKey: 'ammo.dart', color: '#7ef2a0'},
    harpoon:  {nameKey: 'ammo.harpoon', color: '#ffb06b'},
    plasma:   {nameKey: 'ammo.plasma', color: '#c78dff'},
    shard:    {nameKey: 'ammo.shard', color: '#b9e6ff'},
  }

  // ---- items (inventory, used with \ and described with /) --------------------------------
  const ITEMS = {
    medkit:    {nameKey: 'item.medkit', descKey: 'item.medkit.desc', heal: 40, color: '#ff7d7d'},
    emp:       {nameKey: 'item.emp', descKey: 'item.emp.desc', color: '#ffdd66'},
    shield:    {nameKey: 'item.shield', descKey: 'item.shield.desc', dur: 12, color: '#7dc8ff'},
    boost:     {nameKey: 'item.boost', descKey: 'item.boost.desc', dur: 12, color: '#ffb26b'},
    overdrive: {nameKey: 'item.overdrive', descKey: 'item.overdrive.desc', dur: 10, mult: 1.6, color: '#7ef2ff'},
    brake:     {nameKey: 'item.brake', descKey: 'item.brake.desc', dur: 8, mult: 0.6, color: '#c78dff'},
  }
  const ITEM_IDS = Object.keys(ITEMS)
  const ITEM_START = {medkit: 2, emp: 1, shield: 0, boost: 0, overdrive: 0, brake: 0}
  const ITEM_CAP = 9

  // ---- enemies ------------------------------------------------------------------------
  // weaponMult: damage multiplier applied to each weapon against this enemy (0 = immune).
  const ENEMIES = {
    thug:     {nameKey: 'enemy.thug', hp: 55, dmg: 15, color: '#ff5d5d', mult: {pistol: 1.0, rifle: 1.2, shotgun: 1.0, laser: 0.8, bow: 1.2, rocket: 1.5, dart: 1.0, harpoon: 1.2, plasma: 0.9, shard: 1.1}},
    imp:      {nameKey: 'enemy.imp', hp: 45, dmg: 18, color: '#ff9f43', mult: {pistol: 0.7, rifle: 1.3, shotgun: 0.9, laser: 1.0, bow: 1.2, rocket: 1.5, dart: 1.0, harpoon: 1.1, plasma: 1.0, shard: 1.2}},
    drone:    {nameKey: 'enemy.drone', hp: 40, dmg: 15, color: '#7ec8ff', mult: {pistol: 0.3, rifle: 0.5, shotgun: 0.2, laser: 1.5, bow: 0.7, rocket: 1.5, dart: 0.6, harpoon: 0.7, plasma: 1.3, shard: 0.8}},
    shielded: {nameKey: 'enemy.shielded', hp: 130, dmg: 20, color: '#c8b6ff', mult: {pistol: 0, rifle: 0.3, shotgun: 1.2, laser: 1.0, bow: 0.8, rocket: 1.5, dart: 0.2, harpoon: 0.9, plasma: 1.1, shard: 0.5}},
    tank:     {nameKey: 'enemy.tank', hp: 260, dmg: 30, color: '#b04545', mult: {pistol: 0.05, rifle: 0.1, shotgun: 0.5, laser: 0.4, bow: 0.3, rocket: 1.0, dart: 0.05, harpoon: 0.6, plasma: 0.5, shard: 0.2}},
    rat:      {nameKey: 'enemy.rat', hp: 30, dmg: 12, color: '#8d9a5a', mult: {pistol: 1.0, rifle: 0.8, shotgun: 1.1, laser: 1.0, bow: 1.0, rocket: 1.5, dart: 1.0, harpoon: 0.9, plasma: 1.0, shard: 1.1}},
    monkey:   {nameKey: 'enemy.monkey', hp: 40, dmg: 14, color: '#d9a441', mult: {pistol: 0.6, rifle: 0.9, shotgun: 1.0, laser: 1.1, bow: 0.9, rocket: 1.5, dart: 1.2, harpoon: 0.8, plasma: 0.7, shard: 1.1}},
    viper:    {nameKey: 'enemy.viper', hp: 55, dmg: 18, color: '#7ad95a', mult: {pistol: 0.7, rifle: 1.0, shotgun: 1.1, laser: 0.8, bow: 1.2, rocket: 1.5, dart: 0.6, harpoon: 1.0, plasma: 0.9, shard: 1.0}},
    crab:     {nameKey: 'enemy.crab', hp: 35, dmg: 14, color: '#ff8c5a', mult: {pistol: 1.0, rifle: 0.9, shotgun: 1.1, laser: 1.0, bow: 0.8, rocket: 1.5, dart: 0.8, harpoon: 1.2, plasma: 1.0, shard: 1.0}},
    octo:     {nameKey: 'enemy.octo', hp: 200, dmg: 25, color: '#c86ad9', mult: {pistol: 0.3, rifle: 0.4, shotgun: 1.0, laser: 1.1, bow: 0.5, rocket: 1.5, dart: 0.4, harpoon: 1.3, plasma: 0.9, shard: 0.6}},
    bot:      {nameKey: 'enemy.bot', hp: 45, dmg: 15, color: '#6ad9c8', mult: {pistol: 0.2, rifle: 0.4, shotgun: 0.1, laser: 1.5, bow: 0.5, rocket: 1.5, dart: 0.5, harpoon: 0.4, plasma: 1.3, shard: 0.6}},
    viroid:   {nameKey: 'enemy.viroid', hp: 30, dmg: 12, color: '#ff6ad9', mult: {pistol: 0.8, rifle: 1.0, shotgun: 0.9, laser: 1.0, bow: 1.1, rocket: 1.5, dart: 1.2, harpoon: 0.7, plasma: 1.2, shard: 1.0}},
    bat:      {nameKey: 'enemy.bat', hp: 40, dmg: 14, color: '#8a6ad9', mult: {pistol: 0.5, rifle: 0.8, shotgun: 1.1, laser: 0.9, bow: 0.9, rocket: 1.5, dart: 0.9, harpoon: 0.8, plasma: 0.8, shard: 1.3}},
    troll:    {nameKey: 'enemy.troll', hp: 280, dmg: 30, color: '#8a5a3a', mult: {pistol: 0.05, rifle: 0.1, shotgun: 0.6, laser: 0.4, bow: 0.3, rocket: 1.0, dart: 0.1, harpoon: 0.8, plasma: 0.5, shard: 0.2}},
  }
  function enemyById(id) { return ENEMIES[id] || ENEMIES.thug }

  // ---- audio pacing ---------------------------------------------------------------------
  // How often the nearest threat of each kind re-cues, and how far ahead it starts.
  function threatInterval(kind, dist) {
    const span = THREAT_SPAN
    const d = Math.max(0, Math.min(span, dist))
    const base = kind === 'heli' ? 0.12 : 0.16
    return base + (d / span) * 0.8 // fast near, lazy far
  }
  function proximity(dist, span) {
    return 1 - Math.max(0, Math.min(1, dist / (span || THREAT_SPAN)))
  }

  return {
    LANES, LANE_HALF, EDGE,
    BASE_SPEED, MAX_SPEED, SPEED_RAMP, JUMP_SPEED_BOOST, STEER_SPEED, ICE_SLIP, SLUDGE_SLOW,
    JUMP_VY, GRAVITY, GRAVITY_LOW, GRAVITY_HIGH,
    HP_MAX,
    HORIZON, CLUSTER_GAP_MIN, CLUSTER_GAP_MAX, THREAT_SPAN, PICKUP_SPAN, HELI_WINDOW,
    SCORE_PER_METER, SCORE_COIN, SCORE_GEM, SCORE_CORE, SCORE_KILL,
    ADVENTURE_ORDER, ADVENTURE_LEN, ENDLESS_SEGMENT, SPRINT_TIME, ENDLESS_ORDER,
    difficultyFor, speedFor, clusterGap,
    ENV, ENV_IDS, ENV_ORDER: ENV_IDS,
    OBSTACLES, obstacleById,
    PICKUP_REWARDS,
    WEAPONS, weaponById, WEAPON_IDS, AMMO,
    ITEMS, ITEM_IDS, ITEM_START, ITEM_CAP,
    ENEMIES, enemyById,
    threatInterval, proximity,
  }
})()
