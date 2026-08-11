// The SURGE runner engine. This is the single source of truth for a run:
// physics, field generation, hazards, enemies, weapons, items, pickups,
// environments, modes, scoring and doom. It is audio-agnostic: everything the
// sound design needs is broadcast as events carrying pan (dx) and range
// (dist) so audio.js can shape the stereo field around the player.
//
// Layout of the run:
//   modes        practice / sprint / endless / adventure
//   environments city > desert > volcano > tundra > space (+ sewer detour)
//   weapons      pistol (1) rifle (2) shotgun (3) laser (4) bow (5) rocket (6)
//   items        medkit emp shield boost — used with \ , scrolled with [ ]
//
// Emits (all carry player-relative dx/dist where spatial):
//   count, go, mode-title, env-enter, threat, threat-switch, pickup,
//   collect, hit, kill, jump, land, shoot, empty, reload-start, reload-end,
//   reload-shell, charge, teleport, sewer-in, sewer-exit, emp-use, fence-emp,
//   shield-on, shield-off, boost-on, boost-off, gravity, heli-near, heli-clear,
//   item-used, item-select, weapon-switch, level-complete, doom, game-over,
//   run-complete, speed.
content.game = (() => {
  const C = content.constants
  const M = content.meta
  const U = content.util

  const RELOAD_TIME = {pistol: 0.8, rifle: 0.9, rocket: 1.6, laser: 1.2, bow: 0.45, shotgun: 0.45, dart: 0.9, harpoon: 1.4, plasma: 1.0, shard: 0.9}
  const AMMO_PICKUP = {pistol: 12, rifle: 20, shell: 6, energy: 40, arrow: 5, rocket: 1, dart: 8, harpoon: 3, plasma: 12, shard: 8}
  const LANE_CENTRES = (() => { const a = []; for (let i = 0; i < C.LANES; i++) a.push(-C.LANE_HALF + i * (C.LANE_HALF * 2 / (C.LANES - 1))); return a })()

  const MODE_TITLE = {practice: 'mode.practice', sprint: 'mode.sprint', endless: 'mode.endless', adventure: 'mode.adventure'}

  let ev = {}

  function Game() {
    this.events = {}
    this.keys = {}
    this.state = null
  }
  Game.prototype.on = function (type, fn) {
    (this.events[type] = this.events[type] || []).push(fn)
    return this
  }
  Game.prototype.off = function (type, fn) {
    const l = this.events[type]
    if (!l) return
    const i = l.indexOf(fn)
    if (i >= 0) l.splice(i, 1)
  }
  Game.prototype.emit = function (type, data) {
    const l = this.events[type]
    if (l) l.forEach(fn => { try { fn(data) } catch (e) {} })
  }

  Game.prototype.start = function (mode) {
    this.emit('run-start', {mode})
    this.reset(mode)
    this.countdown = 3
    this.countT = 0
    this.emit('count', {n: 3})
  }

  Game.prototype.reset = function (mode) {
    const s = this.state = {
      mode,
      running: false, over: false, paused: false,
      z: 0, x: 0, vx: 0, y: 0, vy: 0, airborne: false,
      gravityMult: 1,
      hp: M.maxHp(), maxHp: M.maxHp(),
      speed: 0,
      score: 0, coins: 0, gems: 0, cores: 0, kills: 0, jumps: 0,
      dist: 0, elapsed: 0,
      level: 1, levelsCompleted: 0, seg: 1,
      env: 'city', envIndex: 0,
      weapon: 'pistol',
      inventory: M.startInventory(),
      selectedItem: 'medkit',
      loadout: initLoadout(),
      mag: 0, magSize: 0, reserve: 0, reloading: false, reloadT: 0,
      charging: false, chargeT: 0, beam: false,       chargePower: 0,
      fireCd: 0, prevSpace: false,
      shieldT: 0, boostT: 0, overdriveT: 0, brakeT: 0, invulnT: 0, lifelineUsed: false,
      heliNear: false, doom: null, inSewer: false, sewerLen: 0,
      empFences: 0, empItemsUsed: 0, sewerEntries: 0,
      zoneIce: false, zoneSludge: false, zoneGravity: 0,
      visitedEnv: new Set(),
      obstacles: [], enemies: [], pickups: [], shots: [],
      threats: [], pickupsSeen: new Set(),
      cueT: 0, cueKind: null, lastThreatKind: null, lastThreatId: null,
      nextSpawnZ: 40, timeLeft: C.SPRINT_TIME,
      maxSpeedSeen: 0,
      spawnCarsT: 0,
    }
    s.weapon = envDef(s).weapon
    loadWeapon(this, s.weapon)
    this._prevJump = false
    this._boostOn = false
    this._shieldOn = false
    this._overdriveOn = false
    this._brakeOn = false
    this._lastHit = null
    this.noteEnv(s.env)
    this.countT = 0
    this.countdown = 3
    this.emit('mode-title', {mode})
    this.emit('env-enter', {env: s.env, level: s.level, index: s.envIndex})
  }

  // ---- loadouts ------------------------------------------------------------------
  function initLoadout() {
    return {
      pistol:  {mag: 12, reserve: 24},
      rifle:   {mag: 30, reserve: 60},
      shotgun: {mag: 6, reserve: 12},
      laser:   {mag: 100, reserve: 60},
      bow:     {mag: 1, reserve: 5},
      rocket:  {mag: 1, reserve: 2},
      dart:    {mag: 6, reserve: 18},
      harpoon: {mag: 3, reserve: 9},
      plasma:  {mag: 10, reserve: 30},
      shard:   {mag: 8, reserve: 24},
    }
  }
  function loadWeapon(g, id) {
    const s = g.state
    const w = C.weaponById(id)
    const am = s.loadout[id]
    if (id === 'laser') { s.mag = am.mag; s.magSize = 0; s.reserve = am.reserve }
    else if (id === 'bow') { s.mag = am.mag; s.magSize = 1; s.reserve = am.reserve }
    else { s.mag = am.mag; s.magSize = w.magSize; s.reserve = am.reserve }
    s.reloading = false; s.reloadT = 0; s.charging = false; s.chargeT = 0; s.beam = false
  }
  function saveLoadout(g) {
    const s = g.state
    const am = s.loadout[s.weapon]
    if (am) { am.mag = s.mag; am.reserve = s.reserve }
  }

  // ---- environment helpers ---------------------------------------------------------
  function envDef(s) {
    return C.ENV[s.env] || C.ENV.city
  }
  function currentEnvIndex(s) {
    if (s.inSewer) return -1
    if (s.mode === 'adventure') return Math.min(s.levelsCompleted, C.ADVENTURE_ORDER.length - 1)
    return (s.seg - 1) % C.ENDLESS_ORDER.length
  }
  function envForState(s) {
    if (s.inSewer) return 'sewer'
    if (s.mode === 'adventure') return C.ADVENTURE_ORDER[Math.min(s.levelsCompleted, C.ADVENTURE_ORDER.length - 1)]
    return C.ENDLESS_ORDER[(s.seg - 1) % C.ENDLESS_ORDER.length]
  }
  function envLevelFor(s) {
    return s.mode === 'adventure' ? s.level : s.seg
  }
  Game.prototype.noteEnv = function (envId) {
    const s = this.state
    if (s && envId) s.visitedEnv.add(envId)
  }

  // ---- input -------------------------------------------------------------------------
  Game.prototype.input = function (code, active) {
    this.keys[code] = !!active
  }
  Game.prototype.press = function (code) {
    // Fire the press edge immediately for keys the screens can't wait for.
    if (code === 'Space') return
    if (code === 'KeyR') this.doReload()
    if (code === 'Backslash') this.useItem()
    if (code === 'Slash') this.emit('item-desc', {item: this.state.selectedItem, active: true})
    if (code === 'BracketLeft') this.scrollItem(-1)
    if (code === 'BracketRight') this.scrollItem(1)
    const w = weaponForCode(code)
    if (w) this.switchWeapon(w)
  }
  function weaponForCode(code) {
    const map = {Digit1: 'pistol', Digit2: 'rifle', Digit3: 'shotgun', Digit4: 'laser', Digit5: 'bow', Digit6: 'rocket', Digit7: 'dart', Digit8: 'harpoon', Digit9: 'plasma', Digit0: 'shard'}
    return map[code] || null
  }

  Game.prototype.switchWeapon = function (id) {
    const s = this.state
    if (!s || s.over || !s.running) return
    if (id === s.weapon) return
    if (id === 'rocket' && !M.owned('rocket')) { this.emit('locked', {weapon: id}); return }
    saveLoadout(this)
    s.weapon = id
    loadWeapon(this, id)
    this.emit('weapon-switch', {weapon: id})
  }
  Game.prototype.scrollItem = function (dir) {
    const s = this.state
    const ids = C.ITEM_IDS
    const i = ids.indexOf(s.selectedItem)
    s.selectedItem = ids[(i + dir + ids.length) % ids.length]
    this.emit('item-select', {item: s.selectedItem})
  }
  Game.prototype.useItem = function () {
    const s = this.state
    if (!s || s.over || !s.running) return
    const id = s.selectedItem
    if (!s.inventory[id]) { this.emit('item-empty', {item: id}); return }
    s.inventory[id]--
    if (id === 'medkit') { s.hp = Math.min(s.maxHp, s.hp + C.ITEMS.medkit.heal) }
    else if (id === 'emp') { s.empItemsUsed++; this.disableFences() }
    else if (id === 'shield') { s.shieldT = C.ITEMS.shield.dur; this.emit('shield-on', {dur: C.ITEMS.shield.dur}) }
    else if (id === 'boost') { s.boostT = C.ITEMS.boost.dur; this.emit('boost-on', {dur: C.ITEMS.boost.dur}) }
    else if (id === 'overdrive') { s.overdriveT = C.ITEMS.overdrive.dur; this.emit('overdrive-on', {dur: C.ITEMS.overdrive.dur}) }
    else if (id === 'brake') { s.brakeT = C.ITEMS.brake.dur; this.emit('brake-on', {dur: C.ITEMS.brake.dur}) }
    this.emit('item-used', {item: id})
  }
  Game.prototype.disableFences = function () {
    const s = this.state
    let n = 0
    s.obstacles.forEach(o => {
      if ((o.kind === 'fence' || o.kind === 'datawall') && !o.disarmed && o.z > s.z - 5 && o.z < s.z + 100) { o.disarmed = true; n++ }
    })
    this.emit('emp-use', {n})
    if (n) { s.empFences += n; s.score += 40 * n; this.emit('fence-emp', {n, fences: n}) }
  }
  Game.prototype.doReload = function () {
    const s = this.state
    if (!s || s.over || !s.running) return
    const w = C.weaponById(s.weapon)
    if (w.ammo === 'bow') return
    if (s.weapon === 'shotgun') {
      if (s.mag >= w.magSize || s.reserve <= 0) return
      s.reloading = true; s.reloadT = 0.2
      this.emit('reload-start', {weapon: s.weapon})
      return
    }
    if (s.weapon === 'laser') {
      if (s.reserve <= 0 || s.mag >= 100) return
      s.reloading = true; s.reloadT = 0
      this.emit('reload-start', {weapon: s.weapon})
      return
    }
    if (s.mag >= w.magSize || s.reserve <= 0) return
    s.reloading = true; s.reloadT = 0
    this.emit('reload-start', {weapon: s.weapon})
  }

  // ---- main loop -------------------------------------------------------------------
  Game.prototype.update = function (dt) {
    const s = this.state
    if (!s) return
    if (s.paused || s.over) return
    if (!s.running) { this.tickCountdown(dt); return }

    const env = envDef(s)
    const diff = C.difficultyFor(envLevelFor(s), s.mode, s.dist)

    // forward motion ----------------------------------------------------------
    let spd = C.speedFor(s.dist, s.mode) * M.speedMult()
    if (s.boostT > 0) spd *= 1.35
    if (s.overdriveT > 0) spd *= C.ITEMS.overdrive.mult
    if (s.brakeT > 0) spd *= C.ITEMS.brake.mult
    if (s.zoneSludge) spd *= C.SLUDGE_SLOW
    s.speed = spd
    s.maxSpeedSeen = Math.max(s.maxSpeedSeen, spd)
    s.z += spd * dt
    if (s.airborne) s.z += C.JUMP_SPEED_BOOST * dt
    s.dist = s.z
    s.elapsed += dt
    s.score += spd * dt * (s.mode === 'sprint' ? 2 : 1)
    if (s.mode === 'sprint') s.timeLeft = Math.max(0, C.SPRINT_TIME - s.elapsed)
    s.invulnT = Math.max(0, s.invulnT - dt)
    s.shieldT = Math.max(0, s.shieldT - dt)
    s.boostT = Math.max(0, s.boostT - dt)
    s.overdriveT = Math.max(0, s.overdriveT - dt)
    s.brakeT = Math.max(0, s.brakeT - dt)
    if (s.boostT === 0 && this._boostOn) { this._boostOn = false; this.emit('boost-off', {}) }
    if (s.shieldT === 0 && this._shieldOn) { this._shieldOn = false; this.emit('shield-off', {}) }
    if (s.overdriveT === 0 && this._overdriveOn) { this._overdriveOn = false; this.emit('overdrive-off', {}) }
    if (s.brakeT === 0 && this._brakeOn) { this._brakeOn = false; this.emit('brake-off', {}) }

    // steering -----------------------------------------------------------------
    const left = this.keys.ArrowLeft || this.keys.KeyA
    const right = this.keys.ArrowRight || this.keys.KeyD
    const slip = s.zoneIce ? C.ICE_SLIP : 1
    if (left && !right) s.vx = U.lerp(s.vx, -C.STEER_SPEED * slip, Math.min(1, dt * 12))
    else if (right && !left) s.vx = U.lerp(s.vx, C.STEER_SPEED * slip, Math.min(1, dt * 12))
    else s.vx = U.lerp(s.vx, 0, Math.min(1, dt * 8))
    s.x = U.clamp(s.x + s.vx * dt, -C.EDGE, C.EDGE)

    // jumping / gravity ----------------------------------------------------------
    const wantJump = (this.keys.ArrowUp || this.keys.KeyW) && !this._prevJump
    this._prevJump = this.keys.ArrowUp || this.keys.KeyW
    const gMult = s.gravityMult
    if (wantJump && !s.airborne) {
      if (s.heliNear) { this.emit('blocked', {kind: 'heli'}) }
      else {
        s.vy = C.JUMP_VY; s.airborne = true; s.jumps++
        this.emit('jump', {})
      }
    }
    s.vy -= C.GRAVITY * gMult * dt
    s.y += s.vy * dt
    if (s.y <= 0) {
      if (s.airborne) this.emit('land', {})
      s.y = 0; s.vy = 0; s.airborne = false
    }

    // generate the road ahead ------------------------------------------------------
    if (s.mode !== 'practice') {
      while (s.nextSpawnZ < s.z + C.HORIZON) {
        s.nextSpawnZ += U.rand(C.CLUSTER_GAP_MIN * 0.7, C.CLUSTER_GAP_MAX) - diff * 4
        if (s.nextSpawnZ < s.z + 30) s.nextSpawnZ = s.z + 30
        this.spawnCluster(s.nextSpawnZ, diff)
      }
    } else {
      while (s.nextSpawnZ < s.z + C.HORIZON) {
        s.nextSpawnZ += U.rand(24, 40)
        if (s.nextSpawnZ < s.z + 30) s.nextSpawnZ = s.z + 30
        this.spawnPickupRow(s.nextSpawnZ)
      }
    }

    // entities ---------------------------------------------------------------------
    this.updateEntities(dt, spd)
    this.updateZones()
    this.resolveObstaclePass()
    this.updatePickups(dt)
    this.updateShots(dt)
    this.updateEnemies()

    // firing / reloading / items -----------------------------------------------------
    this.updateWeapon(dt)
    this.updateReload(dt)

    // heli overhead ------------------------------------------------------------------
    this.updateHeli()

    // doom ----------------------------------------------------------------------------
    if (s.hp <= 0 && !s.doom) {
      s.doom = this._lastHit || 'hit'
      this.die()
    }

    // environments / modes --------------------------------------------------------------
    this.updateEnvironment(dt)

    // threat + pickup cues --------------------------------------------------------------
    this.updateCues(dt)
  }

  // ---- field generation -----------------------------------------------------------------
  Game.prototype.spawnCluster = function (z, diff) {
    const s = this.state
    if (s.mode === 'practice') return
    const env = envDef(s)
    const lanesFree = new Set(LANES.map((_, i) => i))
    const placed = []

    const count = U.chance(0.5) ? 2 : 1
    for (let i = 0; i < count; i++) {
      const kind = this.pickObstacle(env)
      if (!kind) continue
      const span = obstacleSpan(s, kind)
      const lane = this.pickLane(lanesFree, span)
      if (lane === null) continue
      const obs = this.makeObstacle(kind, lane, span, z, diff)
      s.obstacles.push(obs)
      placed.push(obs)
      for (let l = lane; l < Math.min(C.LANES, lane + span); l++) lanesFree.delete(l)
    }

    // enemies -------------------------------------------------------------------------
    if (env.enemies.length && U.chance(0.35 + Math.min(0.3, diff * 0.2))) {
      const lane = this.pickLane(lanesFree, 1)
      if (lane !== null) {
        s.enemies.push(this.makeEnemy(U.pick(env.enemies), lane, z, diff))
        lanesFree.delete(lane)
      }
    }

    // pickups --------------------------------------------------------------------------
    this.spawnPickupsNear(z, lanesFree, placed, diff)
  }
  Game.prototype.pickObstacle = function (env) {
    const total = env.pools.reduce((a, p) => a + p[1], 0)
    let r = Math.random() * total
    for (const p of env.pools) {
      r -= p[1]
      if (r <= 0) return p[0]
    }
    return env.pools[0][0]
  }
  Game.prototype.pickLane = function (freeSet, span) {
    const fits = [...freeSet].filter(l => l + span <= C.LANES)
    if (!fits.length) return null
    return fits[Math.floor(Math.random() * fits.length)]
  }
  function obstacleSpan(s, kind) {
    if (kind === 'fence' || kind === 'heli' || kind === 'gravity' || kind === 'datawall' || kind === 'vine') return C.LANES
    if (kind === 'pit' || kind === 'lava' || kind === 'fire' || kind === 'rip' || kind === 'cavein' || kind === 'magma') return U.chance(0.18) ? C.LANES : (U.chance(0.5) ? 3 : 1)
    if (kind === 'current' || kind === 'tide' || kind === 'quicksand') return U.chance(0.3) ? 2 : 1
    return 1
  }
  Game.prototype.makeObstacle = function (kind, lane, span, z, diff) {
    const base = C.obstacleById(kind)
    const x = LANE_CENTRES[lane] + (span - 1) * (C.LANE_HALF * 2 / (C.LANES - 1)) / 2
    const o = {id: this._id++, kind, lane, x, w: span, z, dead: false, resolved: false, phase: Math.random() * Math.PI * 2}
    if (kind === 'fire' || kind === 'spikes' || kind === 'manhole' || kind === 'glitch' || kind === 'spear') o.toggle = Math.random() * Math.PI * 2
    if (kind === 'car' || kind === 'turret' || kind === 'rockfall') {
      o.x0 = x; o.range = kind === 'turret' ? 0 : 1 + Math.random(); o.period = U.rand(1.4, 2.4); o.hp = kind === 'rockfall' ? 60 : 30; o.t = Math.random() * 10
    }
    if (kind === 'heli' || kind === 'vine') {
      o.hp = kind === 'heli' ? 40 : 0; o.hSpeed = kind === 'heli' ? U.rand(2, 6) : U.rand(0.4, 1.2); o.spanned = true
    }
    if (kind === 'gravity') {
      o.len = U.rand(14, 22); o.mult = U.chance(0.5) ? C.GRAVITY_LOW : C.GRAVITY_HIGH
    }
    if (kind === 'tide' || kind === 'current') o.len = U.rand(8, 14)
    if (kind === 'quicksand') o.len = U.rand(6, 10)
    if (kind === 'fence' || kind === 'datawall') {
      o.disarmed = false; o.flicker = Math.random() * 10; o.spanned = true
    }
    return o
  }
  Game.prototype.makeEnemy = function (kind, lane, z, diff) {
    const base = C.enemyById(kind)
    return {id: this._id++, kind, lane, x: LANE_CENTRES[lane], z, hp: base.hp * (1 + diff * 0.5), dead: false, passed: false, phase: Math.random() * 10, drone: kind === 'drone'}
  }
  Game.prototype.spawnPickupsNear = function (z, lanesFree, placed, diff) {
    const s = this.state
    const env = envDef(s)
    const free = [...lanesFree]
    if (!free.length) return
    const lane = U.pick(free)

    const roll = Math.random()
    let kind = 'coin'
    if (roll < 0.5) kind = 'coin'
    else if (roll < 0.68) kind = 'ammo'
    else if (roll < 0.78) kind = 'medkit'
    else if (roll < 0.86) kind = 'gem'
    else if (roll < 0.94) kind = 'boost'
    else if (roll < 0.965) kind = 'overdrive'
    else if (roll < 0.985) kind = 'brake'
    else kind = 'core'

    // EMP pickups keep the fences honest.
    const hasFence = placed.some(o => o.kind === 'fence' || o.kind === 'datawall')
    if (hasFence && U.chance(0.6)) kind = 'emp'
    else if ((env.id === 'city' || env.id === 'neon') && U.chance(0.05)) kind = 'emp'

    if (kind === 'coin') {
      const n = U.randInt(3, 6)
      for (let i = 0; i < n; i++) {
        s.pickups.push(this.makePickup('coin', U.pick(free), z + i * 2 - n))
      }
    } else {
      s.pickups.push(this.makePickup(kind, lane, z))
      if (kind === 'ammo') {
        // a little trail of coins with the ammo
        s.pickups.push(this.makePickup('coin', lane, z - 4))
      }
    }
  }
  Game.prototype.spawnPickupRow = function (z) {
    const s = this.state
    for (let l = 0; l < C.LANES; l++) {
      s.pickups.push(this.makePickup('coin', l, z + l * 1.5))
    }
  }
  Game.prototype.makePickup = function (kind, lane, z) {
    return {id: this._id++, kind, lane, x: LANE_CENTRES[lane], z, taken: false, pinged: false}
  }

  // ---- entity updates -------------------------------------------------------------------
  Game.prototype.updateEntities = function (dt, spd) {
    const s = this.state
    const keepO = []
    for (const o of s.obstacles) {
      if (o.kind === 'heli' || o.kind === 'vine') {
        o.z -= o.hSpeed * dt
        o.hp = o.hp || 0
      } else if (o.kind === 'car' || o.kind === 'turret' || o.kind === 'rockfall') {
        o.t += dt
        o.x = U.clamp(o.x0 + Math.sin(o.t * (Math.PI * 2 / o.period)) * o.range, -C.EDGE, C.EDGE)
        o.z -= spd * dt
      } else {
        o.z -= spd * dt
      }
      if (o.z > s.z - 60) keepO.push(o)
    }
    s.obstacles = keepO

    const keepE = []
    for (const e of s.enemies) {
      if (e.drone) e.x = LANE_CENTRES[e.lane] + Math.sin(s.elapsed + e.phase) * 0.5
      else if (e.kind === 'imp' || e.kind === 'rat' || e.kind === 'monkey' || e.kind === 'bat' || e.kind === 'viroid' || e.kind === 'crab') e.x = LANE_CENTRES[e.lane] + Math.sin(s.elapsed * 1.6 + e.phase) * 1.2
      e.z -= spd * dt
      if (e.z > s.z - 80) keepE.push(e)
    }
    s.enemies = keepE
  }
  const ZONE_KINDS = ['ice', 'sludge', 'gravity', 'tide', 'current', 'quicksand']
  const OVERHEAD_KINDS = ['heli', 'vine']
  const CAR_LIKE = ['car', 'turret', 'rockfall']
  const SPAWNED_ZONES = ['ice', 'sludge', 'gravity', 'tide', 'current', 'quicksand']

  Game.prototype.updateZones = function () {
    const s = this.state
    const zones = s.obstacles.filter(o => ZONE_KINDS.indexOf(o.kind) !== -1)
    let inIce = false, inSludge = false, grav = 1
    for (const o of zones) {
      const inside = s.z >= o.z && s.z <= o.z + (o.len || 4)
      if (!inside) continue
      if ((o.kind === 'ice' || o.kind === 'tide') && !s.airborne) inIce = true
      if (o.kind === 'sludge' || o.kind === 'current' || o.kind === 'quicksand') inSludge = true
      if (o.kind === 'gravity') grav = o.mult
    }
    if (inIce !== s.zoneIce) { s.zoneIce = inIce }
    if (inSludge !== s.zoneSludge) { s.zoneSludge = inSludge }
    if (grav !== s.gravityMult && !s.airborne && grav !== 1) this.emit('gravity', {mult: grav})
    s.gravityMult = grav
  }
  Game.prototype.resolveObstaclePass = function () {
    const s = this.state
    for (const o of s.obstacles) {
      if (o.resolved || o.dead) continue
      if (OVERHEAD_KINDS.indexOf(o.kind) !== -1) continue
      if (ZONE_KINDS.indexOf(o.kind) !== -1) continue
      if (s.z < o.z + 0.4) continue
      this.resolveOne(s, o)
    }
  }
  Game.prototype.resolveOne = function (s, o) {
    o.resolved = true
    const onLane = Math.abs(s.x - o.x) < Math.max(0.9, o.w * 0.55)
    const airborne = s.airborne

    switch (o.kind) {
      case 'pit': case 'lava': case 'rip': case 'cavein': case 'magma': {
        if (onLane && !airborne) this.hurt(o.kind, C.obstacleById(o.kind).dmg)
        else if (onLane && airborne) s.score += 5
        break
      }
      case 'fire': case 'spikes': case 'glitch': case 'spear': {
        const active = o.kind === 'fire' || o.kind === 'glitch' ? Math.sin(s.elapsed * 5 + o.toggle) > -0.1 : Math.sin(s.elapsed * 2.6 + o.toggle) > 0
        if (active && onLane && !airborne) this.hurt(o.kind, C.obstacleById(o.kind).dmg)
        break
      }
      case 'ledge': case 'drop': case 'root': case 'reef': case 'stalagmite': {
        if (onLane && !airborne) this.hurt(o.kind, C.obstacleById(o.kind).dmg)
        break
      }
      case 'car': case 'turret': case 'rockfall': {
        if (o.hp > 0 && onLane && !airborne && Math.abs(s.x - o.x) < 0.9) this.hurt(o.kind, C.obstacleById(o.kind).dmg)
        break
      }
      case 'manhole': {
        const open = Math.sin(s.elapsed * 1.1 + o.toggle) > 0.4
        if (onLane && !airborne && open) this.enterSewer()
        break
      }
      case 'fence': case 'datawall': {
        if (o.disarmed) { s.score += 20; break }
        const active = Math.sin(s.elapsed * 0.4 + o.flicker) > -0.98 // nearly always live
        if (active && !airborne) this.hurt(o.kind, C.obstacleById(o.kind).dmg)
        break
      }
      case 'teleporter': {
        if (onLane && !airborne) {
          s.z += U.rand(40, 120)
          s.x = U.pick(LANES.map((_, i) => LANE_CENTRES[i]))
          s.y = 0; s.vy = 0; s.airborne = false
          this.emit('teleport', {dx: 0})
        }
        break
      }
    }
  }
  Game.prototype.enterSewer = function () {
    const s = this.state
    if (s.inSewer) return
    s.inSewer = true
    s.sewerEntries++
    s.sewerLen = s.z + 300
    const old = s.weapon
    this.saveLoadoutSafe()
    s.env = 'sewer'
    this.noteEnv('sewer')
    s.weapon = C.ENV.sewer.weapon
    this.loadWeaponSafe(s.weapon)
    this.emit('sewer-in', {oldWeapon: old})
    this.emit('env-enter', {env: 'sewer', level: s.level, index: -1})
  }
  Game.prototype.exitSewer = function () {
    const s = this.state
    s.inSewer = false
    this.saveLoadoutSafe()
    s.env = envForState(s)
    this.noteEnv(s.env)
    s.weapon = C.ENV[s.env].weapon
    this.loadWeaponSafe(s.weapon)
    this.emit('sewer-exit', {})
    this.emit('env-enter', {env: s.env, level: s.level, index: currentEnvIndex(s)})
  }
  Game.prototype.saveLoadoutSafe = function () { const s = this.state; if (s.loadout[s.weapon]) { s.loadout[s.weapon].mag = s.mag; s.loadout[s.weapon].reserve = s.reserve } }
  Game.prototype.loadWeaponSafe = function (id) {
    const s = this.state
    const am = s.loadout[id]
    if (id === 'laser') { s.mag = am.mag; s.magSize = 0; s.reserve = am.reserve }
    else if (id === 'bow') { s.mag = am.mag; s.magSize = 1; s.reserve = am.reserve }
    else { s.mag = am.mag; s.magSize = C.weaponById(id).magSize; s.reserve = am.reserve }
    s.reloading = false; s.reloadT = 0; s.charging = false; s.beam = false
  }
  Game.prototype.updatePickups = function (dt) {
    const s = this.state
    const magnet = M.owned('magnet') || M.owned('surge_core')
    const keep = []
    for (const p of s.pickups) {
      if (magnet && Math.abs(p.x - s.x) < 1.6) p.x = U.lerp(p.x, s.x, Math.min(1, dt * 8))
      const dz = p.z - s.z
      if (dz < C.PICKUP_SPAN && !p.pinged) { p.pinged = true; this.emit('pickup', {kind: p.kind, dx: p.x - s.x, dist: dz}) }
      if (Math.abs(dz) < 1.2 && Math.abs(p.x - s.x) < 0.85) {
        this.collect(p)
        continue
      }
      if (dz > -60) keep.push(p)
    }
    s.pickups = keep
  }
  Game.prototype.collect = function (p) {
    const s = this.state
    p.taken = true
    const dx = p.x - s.x
    switch (p.kind) {
      case 'coin': {
        const mult = (M.owned('double_coins') ? 2 : 1) * (M.owned('surge_core') ? 3 : 1)
        s.coins += 1 * mult; s.score += C.SCORE_COIN * mult
        this.emit('collect', {kind: 'coin', amount: 1 * mult, points: C.SCORE_COIN * mult, dx})
        break
      }
      case 'gem': {
        s.gems++; s.score += C.SCORE_GEM
        this.emit('collect', {kind: 'gem', amount: 1, points: C.SCORE_GEM, dx})
        break
      }
      case 'core': {
        s.cores++; s.score += C.SCORE_CORE
        this.emit('collect', {kind: 'core', amount: 1, points: C.SCORE_CORE, dx})
        break
      }
      case 'ammo': {
        const w = C.weaponById(s.weapon)
        const n = AMMO_PICKUP[w.ammo] || 5
        s.reserve = (s.reserve || 0) + n
        s.score += C.PICKUP_REWARDS.ammo.points
        this.emit('collect', {kind: 'ammo', amount: n, points: 5, dx})
        break
      }
      case 'medkit': {
        s.hp = Math.min(s.maxHp, s.hp + C.ITEMS.medkit.heal)
        this.emit('collect', {kind: 'medkit', amount: 1, points: 0, dx})
        break
      }
      case 'emp': {
        if (s.inventory.emp < C.ITEM_CAP) {
          s.inventory.emp++
          this.emit('pickup-item', {item: 'emp', dx})
        } else {
          s.score += 100; s.coins += 2
          this.emit('collect', {kind: 'coin', amount: 2, points: 100, dx})
        }
        break
      }
      case 'shield': {
        s.shieldT = Math.max(s.shieldT, C.ITEMS.shield.dur)
        if (!this._shieldOn) { this._shieldOn = true; this.emit('shield-on', {dur: C.ITEMS.shield.dur}) }
        this.emit('collect', {kind: 'shield', amount: 1, points: 0, dx})
        break
      }
      case 'boost': {
        s.boostT = Math.max(s.boostT, C.ITEMS.boost.dur)
        if (!this._boostOn) { this._boostOn = true; this.emit('boost-on', {dur: C.ITEMS.boost.dur}) }
        this.emit('collect', {kind: 'boost', amount: 1, points: 0, dx})
        break
      }
      case 'overdrive': {
        s.overdriveT = Math.max(s.overdriveT, C.ITEMS.overdrive.dur)
        if (!this._overdriveOn) { this._overdriveOn = true; this.emit('overdrive-on', {dur: C.ITEMS.overdrive.dur}) }
        this.emit('collect', {kind: 'overdrive', amount: 1, points: 0, dx})
        break
      }
      case 'brake': {
        s.brakeT = Math.max(s.brakeT, C.ITEMS.brake.dur)
        if (!this._brakeOn) { this._brakeOn = true; this.emit('brake-on', {dur: C.ITEMS.brake.dur}) }
        this.emit('collect', {kind: 'brake', amount: 1, points: 0, dx})
        break
      }
    }
  }
  Game.prototype.updateShots = function (dt) {
    const s = this.state
    const keep = []
    for (const sh of s.shots) {
      sh.z += sh.speed * dt
      sh.x += (sh.dx || 0) * dt
      if (sh.z > s.z + sh.range) continue
      let dead = false
      for (const e of s.enemies) {
        if (e.dead) continue
        if (Math.abs(sh.z - e.z) < 2.5 && Math.abs(sh.x - e.x) < 0.85) {
          this.damageEnemy(e, sh, sh.dmg)
          dead = true
          if (sh.splash) {
            for (const e2 of s.enemies) {
              if (e2 !== e && !e2.dead && Math.abs(e2.z - e.z) < 9 && Math.abs(e2.x - e.x) < 3) this.damageEnemy(e2, sh, sh.dmg * 0.6)
            }
          }
          break
        }
      }
      if (!dead && sh.splash === 0) {
        // cars can be shot apart
        for (const o of s.obstacles) {
          if (CAR_LIKE.indexOf(o.kind) !== -1 && o.hp > 0 && Math.abs(sh.z - o.z) < 2 && Math.abs(sh.x - o.x) < 0.9) {
            o.hp -= sh.dmg
            dead = true
            if (o.hp <= 0) { o.dead = true; this.killVehicle(o) }
            break
          }
        }
      }
      if (!dead && sh.z > s.z - 20) keep.push(sh)
    }
    s.shots = keep
  }
  Game.prototype.damageEnemy = function (e, sh, dmg) {
    const s = this.state
    const mult = (M.owned('surge_core') ? 2 : 1) * (C.enemyById(e.kind).mult[sh.weapon] || 1)
    e.hp -= dmg * mult
    if (e.hp <= 0 && !e.dead) {
      e.dead = true
      s.kills++
      const pts = C.SCORE_KILL
      s.score += pts
      this.emit('kill', {kind: e.kind, points: pts, dx: e.x - s.x, dist: Math.max(0, e.z - s.z)})
    }
  }
  Game.prototype.killVehicle = function (o) {
    const s = this.state
    s.kills++
    const pts = C.SCORE_KILL
    s.score += pts
    this.emit('kill', {kind: o.kind, points: pts, dx: o.x - s.x, dist: Math.max(0, o.z - s.z)})
  }
  Game.prototype.updateEnemies = function () {
    const s = this.state
    for (const e of s.enemies) {
      if (e.dead || e.passed) continue
      if (e.z < s.z) {
        e.passed = true
        if (!e.dead && Math.abs(e.x - s.x) < 0.9 && !s.airborne) this.hurt('enemy:' + e.kind, C.enemyById(e.kind).dmg)
      }
    }
  }

  // ---- damage ------------------------------------------------------------------------
  Game.prototype.hurt = function (from, dmg) {
    const s = this.state
    if (s.invulnT > 0) return
    if (s.shieldT > 0) { this.emit('hit-blocked', {from, dx: 0, dist: 0}); return }
    if (M.owned('lifeline') && !s.lifelineUsed && s.hp - dmg <= 0) {
      s.lifelineUsed = true
      s.hp = 1
      s.invulnT = 1.5
      this._lastHit = from
      this.emit('lifeline', {from})
      return
    }
    s.hp -= dmg
    this._lastHit = from
    this.emit('hit', {from, dmg, hp: s.hp, dx: 0, dist: 0})
  }
  Game.prototype.updateHeli = function () {
    const s = this.state
    let near = false
    for (const o of s.obstacles) {
      if (OVERHEAD_KINDS.indexOf(o.kind) === -1 || o.dead) continue
      const dz = Math.abs(o.z - s.z)
      if (dz < C.HELI_WINDOW) {
        near = true
        if (o.kind === 'heli' && s.airborne && dz < 3) {
          this.hurt('heli', C.obstacleById('heli').dmg)
          s.y = 0; s.vy = 0; s.airborne = false
        }
        break
      }
    }
    if (near !== s.heliNear) {
      s.heliNear = near
      this.emit(near ? 'heli-near' : 'heli-clear', {})
    }
  }

  // ---- weapons ---------------------------------------------------------------------
  Game.prototype.updateWeapon = function (dt) {
    const s = this.state
    const w = C.weaponById(s.weapon)
    s.fireCd = Math.max(0, s.fireCd - dt)
    const space = !!this.keys.Space
    const edge = space && !s.prevSpace
    s.prevSpace = space

    if (s.weapon === 'bow') {
      if (space && !s.charging && !s.reloading && s.mag > 0) { s.charging = true; s.chargeT = 0 }
      if (s.charging) {
        s.chargeT += dt
        s.chargePower = U.clamp(s.chargeT / w.charge, 0, 1)
        this.emit('charge', {weapon: 'bow', power: s.chargePower})
        if (!space) {
          s.charging = false
          this.fireBow(s.chargePower)
        }
      }
      // auto nock
      if (!s.charging && s.mag <= 0 && s.reserve > 0 && !s.reloading) {
        s.reloading = true; s.reloadT = 0
        this.emit('reload-start', {weapon: 'bow'})
      }
      return
    }

    if (s.weapon === 'laser') {
      if (space && !s.charging && !s.reloading && s.mag > 0) { s.charging = true; s.chargeT = 0 }
      if (s.charging) {
        s.chargeT += dt
        if (s.chargeT >= w.charge) { s.charging = false; s.beam = true }
        else this.emit('charge', {weapon: 'laser', power: s.chargeT / w.charge})
      }
      if (s.beam) {
        this.emit('charge', {weapon: 'laser', power: 1})
        if (s.fireCd <= 0 && s.mag > 0) {
          s.fireCd = w.rate
          this.spawnShot('laser', 1, 0)
          s.mag -= 3.3
          if (s.mag <= 0) { s.mag = 0; s.beam = false; s.charging = false; if (s.reserve > 0) this.doReload() }
        }
      }
      if (!space) { s.beam = false; s.charging = false }
      return
    }

    // trigger weapons
    if (s.reloading && s.weapon !== 'shotgun') return
    if (space && (w.auto || edge)) {
      if (s.fireCd <= 0) {
        if (s.mag <= 0) {
          this.emit('empty', {weapon: s.weapon})
          if (s.reserve > 0) this.doReload()
          return
        }
        s.fireCd = w.rate
        if (w.pellets > 1) {
          for (let i = 0; i < w.pellets; i++) this.spawnShot(s.weapon, 1, U.rand(-1.1, 1.1), U.rand(-1.5, 1.5))
        } else {
          this.spawnShot(s.weapon, 1, 0)
        }
        s.mag--
        if (s.mag <= 0 && s.reserve > 0) this.doReload()
      }
    }
  }
  Game.prototype.fireBow = function (power) {
    const s = this.state
    if (s.mag <= 0) return
    const dmg = C.weaponById('bow').dmg * (1 + power * 5)
    s.mag--
    const shot = this.spawnShot('bow', power, 0, dmg)
    if (shot) shot.z += 0.5
    if (s.mag <= 0 && s.reserve > 0) { s.reloading = true; s.reloadT = 0; this.emit('reload-start', {weapon: 'bow'}) }
  }
  Game.prototype.spawnShot = function (weapon, power, dx, dmgOverride) {
    const s = this.state
    const w = C.weaponById(weapon)
    const dmg = dmgOverride || (w.dmg * (M.owned('surge_core') ? 1 : 1))
    const sh = {
      id: this._id++, weapon, z: s.z, x: s.x, dx: dx || 0,
      speed: weapon === 'bow' ? 120 : 110, dmg,
      range: w.range, splash: w.splash || 0,
    }
    s.shots.push(sh)
    this.emit('shoot', {weapon, power: power || 0, dx: s.x, dist: 0})
    return sh
  }
  Game.prototype.updateReload = function (dt) {
    const s = this.state
    if (!s.reloading) return
    const w = C.weaponById(s.weapon)
    if (s.weapon === 'shotgun') {
      if (s.mag < w.magSize && s.reserve > 0) {
        s.reloadT -= dt
        if (s.reloadT <= 0) {
          s.mag++; s.reserve--
          s.reloadT = RELOAD_TIME.shotgun
          this.emit('reload-shell', {weapon: 'shotgun', shells: s.mag})
        }
      } else {
        s.reloading = false
        this.emit('reload-end', {weapon: 'shotgun'})
      }
      return
    }
    if (s.weapon === 'bow') {
      s.reloadT += dt
      if (s.reloadT >= RELOAD_TIME.bow) {
        s.reloading = false; s.mag = 1; s.reserve--
        this.emit('reload-end', {weapon: 'bow'})
      }
      return
    }
    s.reloadT += dt
    const t = RELOAD_TIME[s.weapon]
    if (s.reloadT >= t) {
      s.reloading = false
      if (s.weapon === 'laser') {
        const take = Math.min(60, s.reserve)
        s.mag = take; s.reserve -= take
      } else {
        const take = Math.min(s.reserve, w.magSize - s.mag)
        s.reserve -= take
        s.mag += take
      }
      this.emit('reload-end', {weapon: s.weapon})
    }
  }

  // ---- environment & mode flow -------------------------------------------------------------
  Game.prototype.updateEnvironment = function (dt) {
    const s = this.state
    if (s.inSewer) {
      if (s.z >= s.sewerLen) this.exitSewer()
      return
    }
    const wanted = envForState(s)
    if (wanted !== s.env) {
      this.saveLoadoutSafe()
      s.env = wanted
      this.noteEnv(wanted)
      s.weapon = C.ENV[wanted].weapon
      this.loadWeaponSafe(s.weapon)
      this.emit('env-enter', {env: wanted, level: s.level, index: currentEnvIndex(s)})
    }
    if (s.mode === 'adventure') {
      const levelLen = C.ADVENTURE_LEN
      if (s.dist >= (s.levelsCompleted + 1) * levelLen) {
        s.levelsCompleted++
        const bonus = 500 * s.levelsCompleted
        s.score += bonus
        s.coins += Math.floor(bonus / 10)
        this.emit('level-complete', {level: s.levelsCompleted, bonus, rewards: {coins: Math.floor(bonus / 10)}})
        if (s.levelsCompleted >= C.ADVENTURE_ORDER.length) {
          this.completeRun(true)
          return
        }
        s.hp = s.maxHp
        this.emit('env-enter', {env: envForState(s), level: s.levelsCompleted + 1, index: s.levelsCompleted})
      }
    } else {
      const seg = Math.floor(s.dist / C.ENDLESS_SEGMENT) + 1
      if (seg !== s.seg) { s.seg = seg; s.env = envForState(s); this.noteEnv(s.env) }
    }
    if (s.mode === 'sprint' && s.timeLeft <= 0) this.completeRun(false)
  }

  // ---- doom / finish ---------------------------------------------------------------------
  Game.prototype.die = function () {
    const s = this.state
    if (s.over) return
    s.over = true
    this.emit('doom', {reason: s.doom})
    const results = this.buildResults()
    this.emit('game-over', {results})
  }
  Game.prototype.completeRun = function (victory) {
    const s = this.state
    if (s.over) return
    s.over = true
    this.emit('run-complete', {victory})
    const results = this.buildResults()
    this.emit('game-over', {results, victory})
  }
  Game.prototype.buildResults = function () {
    const s = this.state
    const b = M.load().best[s.mode] || M.load().best.endless
    const newBest = s.score > (b && b.score || 0) && s.mode !== 'practice'
    const out = {
      mode: s.mode,
      score: Math.floor(s.score),
      distance: Math.floor(s.dist),
      coins: s.coins, gems: s.gems, cores: s.cores,
      kills: s.kills, jumps: s.jumps, maxSpeed: s.maxSpeedSeen,
      adventureLevels: s.levelsCompleted,
      empsUsed: s.empItemsUsed,
      sewerEntries: s.sewerEntries,
      worldsVisited: s.visitedEnv.size,
      newBest,
    }
    const commit = M.commit(out)
    out.achievements = commit.achievements
    out.dailies = commit.dailies
    out.balances = commit.balances
    out.level = s.levelsCompleted
    this._results = out
    return out
  }

  // ---- cue scheduling ----------------------------------------------------------------
  Game.prototype.updateCues = function (dt) {
    const s = this.state
    if (s.mode === 'practice') return
    // nearest threat
    let best = null
    for (const o of s.obstacles) {
      if (o.dead || o.kind === 'gravity' || o.kind === 'ice' || o.kind === 'sludge' || o.kind === 'tide' || o.kind === 'current' || o.kind === 'quicksand') continue
      const dz = o.z - s.z
      if (dz < 0 || dz > C.THREAT_SPAN) continue
      if (!best || dz < best.dist) best = {kind: o.kind, id: o.id, x: o.x, dist: dz, span: o.w}
    }
    for (const e of s.enemies) {
      if (e.dead) continue
      const dz = e.z - s.z
      if (dz < 0 || dz > C.THREAT_SPAN) continue
      if (!best || dz < best.dist) best = {kind: 'enemy:' + e.kind, id: e.id, x: e.x, dist: dz, span: 1}
    }
    if (best) {
      if (best.id !== s.lastThreatId) {
        s.lastThreatId = best.id
        this.emit('threat-switch', {kind: best.kind, dx: best.x - s.x, dist: best.dist})
      }
      s.cueT -= dt
      if (s.cueT <= 0) {
        s.cueT = C.threatInterval(best.kind, best.dist)
        this.emit('threat', {kind: best.kind, dx: best.x - s.x, dist: best.dist, span: best.span})
      }
    }
  }

  // ---- countdown -------------------------------------------------------------------------
  Game.prototype.tickCountdown = function (dt) {
    const s = this.state
    if (s.paused) return
    this.countT += dt
    if (this.countT >= 1) {
      this.countT = 0
      this.countdown--
      if (this.countdown > 0) this.emit('count', {n: this.countdown})
      else {
        s.running = true
        this.emit('go', {mode: s.mode})
      }
    }
  }
  Game.prototype.pause = function () { if (this.state) this.state.paused = true }
  Game.prototype.resume = function () { if (this.state) this.state.paused = false }

  // ---- viz / readouts -----------------------------------------------------------------
  // Entities within the pickup span, nearest first, for the aria-hidden lane viz.
  Game.prototype.nearby = function () {
    const s = this.state
    if (!s) return []
    const out = []
    for (const o of s.obstacles) {
      if (o.dead) continue
      const dz = o.z - s.z
      if (dz < 0 || dz > C.PICKUP_SPAN) continue
      out.push({kind: o.kind, lane: o.lane, x: o.x - s.x, z: dz, dist: dz, w: o.w})
    }
    for (const e of s.enemies) {
      if (e.dead) continue
      const dz = e.z - s.z
      if (dz < 0 || dz > C.PICKUP_SPAN) continue
      out.push({kind: 'enemy:' + e.kind, lane: e.lane, x: e.x - s.x, z: dz, dist: dz, w: 1})
    }
    for (const p of s.pickups) {
      if (p.taken) continue
      const dz = p.z - s.z
      if (dz < 0 || dz > C.PICKUP_SPAN) continue
      out.push({kind: p.kind, lane: p.lane, x: p.x - s.x, z: dz, dist: dz, w: 0.5})
    }
    out.sort((a, b) => a.dist - b.dist)
    return out
  }
  Game.prototype.envInfo = function () {
    const s = this.state
    if (!s) return {env: 'city', index: 0, weapon: 'pistol', mode: 'practice'}
    const def = envDef(s)
    return {
      env: s.env,
      index: currentEnvIndex(s),
      weapon: s.weapon,
      ammo: C.weaponById(s.weapon).ammo,
      mode: s.mode,
      inSewer: s.inSewer,
      envKey: def.nameKey,
      envDesc: def.descKey,
      color: def.color,
    }
  }

  // ---- singleton -------------------------------------------------------------------------
  let instance = null
  function ensure() {
    if (!instance) { instance = new Game(); instance._id = 1 }
    return instance
  }
  return {
    start: mode => ensure().start(mode),
    update: dt => ensure().update(dt),
    input: (code, active) => ensure().input(code, active),
    press: code => ensure().press(code),
    on: (t, f) => ensure().on(t, f),
    off: (t, f) => ensure().off(t, f),
    pause: () => ensure().pause(),
    resume: () => ensure().resume(),
    state: () => ensure().state,
    results: () => (instance && instance._results) || null,
    nearby: () => ensure().nearby(),
    envInfo: () => ensure().envInfo(),
    isRunning: () => !!(instance && instance.state && instance.state.running && !instance.state.over),
  }
})()
