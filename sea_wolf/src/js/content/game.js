// SEA WOLF real-time logic.
//
// You drive a submarine around a full 360 degree ocean. Convoys cross it on
// their own courses; you hear them, work out where they are going, and get the
// boat into a firing position before they are past. Speed is noise, so the
// intercept costs you stealth. Escorts home on the noise and then fight you
// with torpedoes of their own.
//
// Depth is a continuous axis with four ordered stops (0, 100, 200, 300 metres)
// that the boat crawls between. An escort's torpedo runs at the depth you were
// at when it was fired, so changing level is the dodge — but at 21 m/s down
// and 15 m/s up you have to commit to it long before the fish arrives, and
// everything you give up down there (the tubes, the battery, your speed) is
// the price of the dodge.
//
// Steel also meets steel: above SHIP_DRAFT the boat and a ship occupy the same
// water, and running into one damages both of you.
//
// Geometry: world coordinates, +x east and +y north. `heading` is degrees
// clockwise from north (0 = north), so the bow unit vector is
// (sin h, cos h). Anything the audio layer needs is delivered in
// LISTENER-LOCAL coordinates — forward and starboard of the boat — because
// that is what a binaural ear wants.
//
// This module owns state and emits events. The game screen turns events into
// binaural audio and screen-reader announcements. Audio is the source of truth.
content.game = (() => {
  const K = () => content.constants
  const E = () => content.events

  const state = {
    phase: 'ready',     // ready | play | pending | over
    readyTimer: 0,
    phaseTimer: 0,
    reason: null,

    // the boat
    x: 0,
    y: 0,
    heading: 0,         // degrees clockwise from north
    speed: 0,           // m/s along the heading
    throttle: 0,        // 0..1 commanded
    rudder: 0,          // -1..1 held
    periscope: 0,       // degrees relative to the bow

    // Depth in metres below the surface, and the level the planes are set
    // for. `depth` chases `depthTarget` at DIVE_RATE/RISE_RATE.
    depth: 0,
    depthTarget: 0,
    depthSettled: true,
    battery: 0,
    hull: 0,
    noise: 0,           // 0..1 how well the escorts have you
    hunted: false,

    torpedoes: 0,
    reload: 0,
    pingCooldown: 0,

    timeLeft: 0,
    elapsed: 0,
    tonnage: 0,
    sunk: 0,
    fired: 0,
    score: 0,
  }

  let contacts = []
  let torpedoes = []
  let enemyTorpedoes = []
  let nextId = 1
  let convoyTimer = 0
  let warned = new Set()
  let batteryWarned = false

  // ---- geometry ---------------------------------------------------------------
  const rad = (d) => d / K().DEG
  const deg = (r) => r * K().DEG

  function bowVector() {
    const h = rad(state.heading)
    return {x: Math.sin(h), y: Math.cos(h)}
  }

  // World bearing from the boat to a point, degrees clockwise from north.
  function worldBearing(px, py) {
    return deg(Math.atan2(px - state.x, py - state.y))
  }

  function rangeTo(c) { return Math.hypot(c.x - state.x, c.y - state.y) }

  // Bearing relative to the bow: 0 dead ahead, negative to port, +/-180 astern.
  function relBearing(px, py) {
    return K().wrapDeg(worldBearing(px, py) - state.heading)
  }

  // Listener-local coordinates for the audio layer: +forward, +starboard.
  // This is what syngen's binaural ear consumes, and it is the reason the
  // rebuilt game can express "behind you" at all.
  function localOf(px, py) {
    const dx = px - state.x, dy = py - state.y
    const h = rad(state.heading)
    const cos = Math.cos(h), sin = Math.sin(h)
    return {
      forward: dx * sin + dy * cos,
      starboard: dx * cos - dy * sin,
    }
  }

  // How far under we are, 0..1. Speed, noise, battery and the muffling of the
  // passive set all read off this rather than off a discrete level, so the
  // trip between two levels is felt the whole way down.
  function depthFrac() { return K().depthFraction(state.depth) }

  // Periscope depth: the tubes work, the battery charges, and a keel can find
  // you.
  function atPeriscope() { return state.depth <= K().PERISCOPE_BAND }

  function maxSpeed() {
    const k = K()
    return k.lerp(k.SPEED_MAX_SHALLOW, k.SPEED_MAX_DEEP, depthFrac())
  }

  // Seconds for the boat to get from `from` to `to`. Down is faster than up.
  function travelTime(from, to) {
    const k = K()
    return to > from ? (to - from) / k.DIVE_RATE : (from - to) / k.RISE_RATE
  }

  // ---- spawning ---------------------------------------------------------------
  // A convoy is put down at a bearing and range from the boat, steering a
  // course of its own. It is deliberately placed within hearing so there is
  // always something to hunt — the decision is which way to run to meet it,
  // not whether anything exists.
  function spawnConvoy() {
    const k = K()
    const room = k.MAX_CONTACTS - contacts.length
    if (room < 2) return false

    let merchants = k.randInt(k.CONVOY_SIZE[0], k.CONVOY_SIZE[1])
    let escorts = k.randInt(k.CONVOY_ESCORTS[0], k.CONVOY_ESCORTS[1])
    if (merchants + escorts > room) {
      merchants = Math.min(merchants, Math.max(1, room - 1))
      escorts = Math.max(0, Math.min(escorts, room - merchants))
    }

    // Where the convoy is, and where it is going. The course is biased across
    // your line of sight rather than straight at or away from you, so most
    // convoys are an interception problem rather than a straight chase.
    const bearing = k.rand(-180, 180)
    const dist = k.rand(k.SPAWN_NEAR, k.SPAWN_FAR)
    const cx = state.x + Math.sin(rad(bearing)) * dist
    const cy = state.y + Math.cos(rad(bearing)) * dist
    const course = k.wrapDeg(bearing + 180 + (Math.random() < 0.5 ? -1 : 1) * k.rand(50, 130))

    const names = ['freighter', 'tanker', 'liner']
    const order = []
    for (let i = 0; i < merchants; i++) order.push(false)
    for (let i = 0; i < escorts; i++) order.splice(k.randInt(0, order.length), 0, true)

    // String the convoy out along its own course, with a little beam spread,
    // so it reads as a formation moving together rather than a point source.
    for (let i = 0; i < order.length; i++) {
      const isEscort = order[i]
      const type = isEscort ? 'escort' : names[k.randInt(0, names.length - 1)]
      const spec = k.SHIP_TYPES[type]
      const speed = k.rand(spec.speed[0], spec.speed[1])
      const sprint = spec.sprint ? k.rand(spec.sprint[0], spec.sprint[1]) : speed

      const along = (i - order.length / 2) * k.rand(110, 200)
      const abeam = k.rand(-130, 130)
      const ch = rad(course)
      const px = cx + Math.sin(ch) * along + Math.cos(ch) * abeam
      const py = cy + Math.cos(ch) * along - Math.sin(ch) * abeam

      contacts.push({
        id: nextId++,
        type,
        escort: spec.escort,
        tonnage: spec.tonnage,
        voice: spec.voice,
        x: px,
        y: py,
        course,
        speed,
        sprint,
        vx: Math.sin(ch) * speed,
        vy: Math.cos(ch) * speed,
        alive: true,
        hull: spec.hull,
        hunting: false,
        fireTimer: 0,
        ramCooldown: 0,
        nextBeep: Math.random() * 0.5,
      })
    }
    return true
  }

  // ---- the hunt ---------------------------------------------------------------
  function addNoise(amount) { state.noise = K().clamp(state.noise + amount, 0, 1) }

  function updateHunt(delta) {
    const k = K()
    // Both halves of the noise economy now scale smoothly with depth, so
    // dropping to 100 helps a little and dropping to 300 helps a lot.
    const df = depthFrac()

    // Speed is the constant term in the noise economy: a boat at flank is
    // loud all the time, which is the price of running an intercept.
    const speedFrac = maxSpeed() > 0 ? k.clamp(state.speed / maxSpeed(), 0, 1) : 0
    const made = Math.pow(speedFrac, k.SPEED_NOISE_POWER) * k.SPEED_NOISE *
      k.lerp(1, k.DEEP_NOISE_MULT, df) * delta
    const shed = k.NOISE_DECAY * k.lerp(1, k.NOISE_DECAY_DEEP_MULT, df) * delta
    state.noise = k.clamp(state.noise + made - shed, 0, 1)

    const wasHunted = state.hunted
    if (!state.hunted && state.noise >= k.HUNT_THRESHOLD) state.hunted = true
    else if (state.hunted && state.noise <= k.LOSE_THRESHOLD) state.hunted = false

    if (state.hunted && !wasHunted) E().emit('acquired', {})
    if (!state.hunted && wasHunted) E().emit('lost-contact', {})

    for (const c of contacts) {
      if (!c.escort || !c.alive) continue
      const wasHunting = c.hunting
      c.hunting = state.hunted

      if (c.hunting) {
        // Turn toward the boat and open up. The escort was screening the
        // convoy at convoy pace; now it sprints, so being found is audible as
        // a change of pace as well as a swing across the field.
        //
        // It runs in to torpedo range and then holds off: an escort wants a
        // firing solution, not a collision, so it sheers away rather than
        // sitting on top of you. If it does end up alongside that is your
        // doing, and updateCollisions will charge you both for it.
        const r = rangeTo(c) || 1
        const away = r < k.ESCORT_FIRE_MIN ? -1 : 1
        c.vx = ((state.x - c.x) / r) * c.sprint * away
        c.vy = ((state.y - c.y) / r) * c.sprint * away
        if (!wasHunting) E().emit('escort-turn', {local: localOf(c.x, c.y), range: r})

        c.fireTimer -= delta
        if (c.fireTimer <= 0 && r >= k.ESCORT_FIRE_MIN && r <= k.ESCORT_FIRE_RANGE) {
          c.fireTimer = k.ESCORT_FIRE_INTERVAL
          escortFire(c)
        }
      } else if (wasHunting) {
        // Give up and resume the convoy's course.
        const ch = rad(c.course)
        c.vx = Math.sin(ch) * c.speed
        c.vy = Math.cos(ch) * c.speed
      }
    }
  }

  // ---- what the escorts shoot back with ---------------------------------------
  // An escort solves the same lead problem the player does — where will the
  // boat be when the fish gets there — scatters the answer by how well it has
  // you, and launches. The fish is unguided and runs at the depth the boat is
  // at RIGHT NOW, which is what makes changing level a real dodge.
  function escortFire(escort) {
    const k = K()
    const range = rangeTo(escort)

    const bow = bowVector()
    const bvx = bow.x * state.speed
    const bvy = bow.y * state.speed
    let flight = range / k.ENEMY_TORPEDO_SPEED
    for (let i = 0; i < 2; i++) {
      const lx = state.x + bvx * flight
      const ly = state.y + bvy * flight
      flight = Math.hypot(lx - escort.x, ly - escort.y) / k.ENEMY_TORPEDO_SPEED
    }
    const aimX = state.x + bvx * flight
    const aimY = state.y + bvy * flight

    // How firmly they hold you decides the scatter, so going quiet makes their
    // shooting worse before it makes them give up altogether.
    const grip = k.clamp((state.noise - k.LOSE_THRESHOLD) / (1 - k.LOSE_THRESHOLD), 0, 1)
    const spread = k.lerp(k.ESCORT_AIM_ERROR, k.ESCORT_AIM_ERROR_MIN, grip)
    // Their depth estimate is worse the deeper you are and the more loosely
    // they hold you, so depth protects you twice: once passively, by making
    // this guess bad, and once actively, when you change level after the fish
    // is already in the water on the old number.
    const depthErr = k.ESCORT_DEPTH_ERROR * k.depthFraction(state.depth) * k.lerp(1, 0.6, grip)
    const setFor = k.clamp(state.depth + k.rand(-depthErr, depthErr), 0, k.MAX_DEPTH)
    const course = deg(Math.atan2(aimX - escort.x, aimY - escort.y)) + k.rand(-spread, spread)
    const ch = rad(course)

    enemyTorpedoes.push({
      id: nextId++,
      x: escort.x,
      y: escort.y,
      ox: escort.x,
      oy: escort.y,
      vx: Math.sin(ch) * k.ENEMY_TORPEDO_SPEED,
      vy: Math.cos(ch) * k.ENEMY_TORPEDO_SPEED,
      depth: setFor,
      life: k.ENEMY_TORPEDO_LIFE,
      missed: false,
    })

    E().emit('escort-fire', {
      local: localOf(escort.x, escort.y),
      range,
      flight,
      depth: setFor,
    })
  }

  function updateEnemyTorpedoes(delta) {
    const k = K()
    for (const t of enemyTorpedoes) {
      // Same substepping as our own fish, for the same reason: at 105 m/s a
      // whole frame is three hull-widths.
      const steps = Math.max(1,
        Math.ceil((k.ENEMY_TORPEDO_SPEED * delta) / (k.ENEMY_TORPEDO_HIT_RADIUS * 0.8)))
      const dt = delta / steps

      for (let i = 0; i < steps && !t.done; i++) {
        t.x += t.vx * dt
        t.y += t.vy * dt
        t.life -= dt

        const flat = Math.hypot(t.x - state.x, t.y - state.y)
        const armed = Math.hypot(t.x - t.ox, t.y - t.oy) >= k.ENEMY_TORPEDO_ARM

        if (armed && flat <= k.ENEMY_TORPEDO_HIT_RADIUS) {
          const vertical = Math.abs(t.depth - state.depth)
          if (vertical <= k.ENEMY_TORPEDO_DEPTH_BAND) {
            t.done = true
            state.hull = Math.max(0, state.hull - k.ENEMY_TORPEDO_DAMAGE)
            E().emit('enemy-hit', {
              local: localOf(t.x, t.y),
              damage: k.ENEMY_TORPEDO_DAMAGE,
              hull: state.hull,
            })
            E().emit('damage', {hull: state.hull, amount: k.ENEMY_TORPEDO_DAMAGE})
            if (state.hull <= 0) { beginGameOver('sunk'); return }
          } else if (!t.missed) {
            // It ran over or under. Say so — the whole point of paying for a
            // dive is hearing that it bought you something.
            t.missed = true
            E().emit('torpedo-passed', {
              local: localOf(t.x, t.y),
              above: t.depth < state.depth,
              separation: vertical,
            })
          }
        }

        if (t.life <= 0 && !t.done) {
          t.done = true
          E().emit('torpedo-spent', {local: localOf(t.x, t.y), hostile: true})
        }
      }
    }
    if (enemyTorpedoes.some((t) => t.done)) enemyTorpedoes = enemyTorpedoes.filter((t) => !t.done)
  }

  // ---- ramming ----------------------------------------------------------------
  // Only above SHIP_DRAFT: deeper than that the boat passes clean underneath
  // everything. Both sides take damage, scaled by how hard they met, and both
  // are shoved apart so a scrape does not become a grinding contact.
  function updateCollisions(delta) {
    const k = K()
    const shallow = state.depth < k.SHIP_DRAFT
    const bow = bowVector()

    for (const c of contacts) {
      if (c.ramCooldown > 0) c.ramCooldown = Math.max(0, c.ramCooldown - delta)
      if (!shallow || !c.alive || c.ramCooldown > 0) continue

      const dist = Math.hypot(c.x - state.x, c.y - state.y)
      if (dist > k.COLLIDE_RADIUS) continue

      const closing = Math.hypot(c.vx - bow.x * state.speed, c.vy - bow.y * state.speed)
      const force = k.clamp(closing / 25, k.COLLIDE_MIN_MULT, 1)
      const toShip = k.COLLIDE_DAMAGE_SHIP * force
      const toBoat = k.COLLIDE_DAMAGE_SUB * force

      c.ramCooldown = k.COLLIDE_COOLDOWN
      c.hull -= toShip
      state.hull = Math.max(0, state.hull - toBoat)
      addNoise(k.COLLIDE_NOISE)

      E().emit('collision', {
        local: localOf(c.x, c.y),
        type: c.type,
        escort: c.escort,
        force,
        toShip,
        toBoat,
        hull: state.hull,
      })
      E().emit('damage', {hull: state.hull, amount: toBoat})

      // Shove them apart so the next frame is not another collision.
      const push = (k.COLLIDE_RADIUS + 6) - dist
      if (dist > 0.001 && push > 0) {
        c.x += ((c.x - state.x) / dist) * push
        c.y += ((c.y - state.y) / dist) * push
      }

      if (c.hull <= 0) {
        c.alive = false
        state.tonnage += c.tonnage
        state.sunk++
        E().emit('hit', {
          id: c.id,
          local: localOf(c.x, c.y),
          range: rangeTo(c),
          type: c.type,
          tonnage: c.tonnage,
          total: state.tonnage,
          escort: c.escort,
          rammed: true,
        })
      }

      if (state.hull <= 0) { beginGameOver('sunk'); return }
    }
    contacts = contacts.filter((c) => c.alive)
  }

  // ---- torpedoes --------------------------------------------------------------
  function fire() {
    const k = K()
    if (state.phase !== 'play') return false
    if (!atPeriscope()) { E().emit('fire-blocked', {reason: 'depth'}); return false }
    if (state.reload > 0) { E().emit('fire-blocked', {reason: 'reload'}); return false }
    if (state.torpedoes <= 0) { E().emit('fire-blocked', {reason: 'empty'}); return false }

    const course = state.heading + state.periscope
    const ch = rad(course)
    torpedoes.push({
      id: nextId++,
      x: state.x,
      y: state.y,
      vx: Math.sin(ch) * k.TORPEDO_SPEED,
      vy: Math.cos(ch) * k.TORPEDO_SPEED,
      life: k.TORPEDO_LIFE,
    })

    state.torpedoes--
    state.fired++
    state.reload = k.RELOAD_TIME
    addNoise(k.FIRE_NOISE)
    E().emit('fire', {periscope: state.periscope, remaining: state.torpedoes})
    return true
  }

  function updateTorpedoes(delta) {
    const k = K()
    for (const t of torpedoes) {
      // Step in slices so a fast torpedo cannot tunnel through a hull between
      // frames.
      const steps = Math.max(1, Math.ceil((k.TORPEDO_SPEED * delta) / (k.TORPEDO_HIT_RADIUS * 0.8)))
      const dt = delta / steps

      for (let s = 0; s < steps && !t.done; s++) {
        t.x += t.vx * dt
        t.y += t.vy * dt
        t.life -= dt

        for (const c of contacts) {
          if (!c.alive) continue
          if (Math.hypot(c.x - t.x, c.y - t.y) > k.TORPEDO_HIT_RADIUS) continue
          if (Math.hypot(t.x - state.x, t.y - state.y) < k.MIN_ENGAGE_RANGE) continue

          c.alive = false
          t.done = true
          state.tonnage += c.tonnage
          state.sunk++
          // The explosion tells everyone within earshot where the shot came
          // from, so a kill is never free.
          addNoise(k.HIT_NOISE)
          E().emit('hit', {
            id: c.id,
            local: localOf(c.x, c.y),
            range: rangeTo(c),
            type: c.type,
            tonnage: c.tonnage,
            total: state.tonnage,
            escort: c.escort,
          })
          break
        }

        if (t.life <= 0 && !t.done) {
          t.done = true
          E().emit('torpedo-spent', {local: localOf(t.x, t.y)})
        }
      }
    }
    if (torpedoes.some((t) => t.done)) torpedoes = torpedoes.filter((t) => !t.done)
    contacts = contacts.filter((c) => c.alive)
  }

  // ---- active sonar -----------------------------------------------------------
  // The ping is instant; each echo is scheduled by the screen for
  // 2*range/SOUND_SPEED seconds' time, which is how range is heard. Unlike the
  // passive beeps this reaches the full DESPAWN_RANGE, so it is how you find a
  // convoy that is still too far away to hear.
  function ping() {
    if (state.phase !== 'play') return false
    if (state.pingCooldown > 0) return false

    const k = K()
    state.pingCooldown = k.PING_COOLDOWN
    addNoise(k.PING_NOISE)

    const returns = contacts
      .filter((c) => c.alive && rangeTo(c) < k.DESPAWN_RANGE)
      .map((c) => ({
        local: localOf(c.x, c.y),
        range: rangeTo(c),
        bearing: relBearing(c.x, c.y),
        delay: k.echoDelay(rangeTo(c)),
        escort: c.escort,
        type: c.type,
      }))
      .sort((a, b) => a.range - b.range)

    E().emit('ping', {returns})
    return true
  }

  // ---- depth ------------------------------------------------------------------
  // Page up and page down step between DEPTH_LEVELS. The order is commanded
  // instantly and the boat then takes as long as it takes to get there, which
  // is what makes depth a plan rather than a button.
  function setDepthLevel(index) {
    const k = K()
    if (state.phase !== 'play') return false
    const i = Math.round(k.clamp(index, 0, k.DEPTH_LEVELS.length - 1))
    const want = k.DEPTH_LEVELS[i]
    if (want === state.depthTarget) { E().emit('depth-limit', {depth: want}); return false }

    const down = want > state.depthTarget
    state.depthTarget = want
    state.depthSettled = false
    E().emit('depth-change', {
      to: want,
      from: state.depth,
      down,
      eta: travelTime(state.depth, want),
    })
    return true
  }

  // Steps from the COMMANDED level, so two quick presses on a dive queue up
  // 200 metres rather than the second one being swallowed mid-descent.
  function stepDepth(dir) {
    if (state.phase !== 'play') return false
    const k = K()
    const i = k.DEPTH_LEVELS.indexOf(state.depthTarget)
    const from = i >= 0 ? i : k.nearestLevel(state.depthTarget)
    return setDepthLevel(from + (dir > 0 ? 1 : -1))
  }

  function updateDepth(delta) {
    const k = K()

    if (state.depth < state.depthTarget) {
      state.depth = Math.min(state.depthTarget, state.depth + k.DIVE_RATE * delta)
    } else if (state.depth > state.depthTarget) {
      state.depth = Math.max(state.depthTarget, state.depth - k.RISE_RATE * delta)
    }
    if (!state.depthSettled && state.depth === state.depthTarget) {
      state.depthSettled = true
      E().emit('depth-settled', {depth: state.depth})
    }

    if (!atPeriscope()) {
      // Deeper costs more: a fixed price for being under, plus a term that
      // grows with depth.
      const drain = k.BATTERY_DRAIN_BASE + k.BATTERY_DRAIN_DEPTH * depthFrac()
      state.battery = Math.max(0, state.battery - drain * delta)
      if (state.battery <= 0 && state.depthTarget > 0) {
        E().emit('battery-dead', {})
        setDepthLevel(0)
      } else if (state.battery <= k.BATTERY_LOW && !batteryWarned) {
        batteryWarned = true
        E().emit('battery-low', {battery: state.battery})
      }
    } else {
      state.battery = Math.min(k.BATTERY_MAX, state.battery + k.BATTERY_CHARGE * delta)
      if (state.battery > k.BATTERY_LOW + 12) batteryWarned = false
    }
  }

  // ---- driving the boat -------------------------------------------------------
  function setRudder(dir) { state.rudder = dir < 0 ? -1 : (dir > 0 ? 1 : 0) }

  function nudgeThrottle(dir, delta) {
    if (!dir) return
    const k = K()
    state.throttle = k.clamp(state.throttle + dir * k.THROTTLE_STEP * delta, 0, 1)
  }

  function setPeriscope(dir, fine, delta) {
    if (!dir) return
    const k = K()
    const speed = fine ? k.PERISCOPE_FINE : k.PERISCOPE_SPEED
    state.periscope = k.clamp(
      state.periscope + dir * speed * delta, -k.PERISCOPE_LIMIT, k.PERISCOPE_LIMIT)
  }
  function centrePeriscope() { state.periscope = 0 }

  function updateBoat(delta) {
    const k = K()

    // Speed chases the throttle's target. Slowing is lazier than speeding up,
    // which is what gives the boat its weight. The hard cap matters on a dive:
    // max speed drops when you go deep, and the boat has to actually come down
    // to it rather than coasting along above its own limit.
    const target = state.throttle * maxSpeed()
    if (state.speed < target) state.speed = Math.min(target, state.speed + k.ACCEL * delta)
    else state.speed = Math.max(target, state.speed - k.DECEL * delta)
    state.speed = Math.min(state.speed, maxSpeed())

    // The rudder needs water over it: a stopped boat will not turn.
    const way = k.lerp(k.RUDDER_MIN_EFFECT, 1, state.speed / k.SPEED_MAX_SHALLOW)
    state.heading = k.wrapDeg(state.heading + state.rudder * k.RUDDER_RATE * way * delta)

    const bow = bowVector()
    state.x += bow.x * state.speed * delta
    state.y += bow.y * state.speed * delta
  }

  // ---- lifecycle --------------------------------------------------------------
  function reset() {
    const k = K()
    state.phase = 'ready'
    state.readyTimer = 3.0
    state.reason = null

    state.x = 0
    state.y = 0
    state.heading = 0
    state.speed = 0
    state.throttle = 0.35 // ahead slow, so you are moving from the first second
    state.rudder = 0
    state.periscope = 0

    state.depth = 0
    state.depthTarget = 0
    state.depthSettled = true
    state.battery = k.BATTERY_MAX
    state.hull = k.HULL_MAX
    state.noise = 0
    state.hunted = false

    state.torpedoes = k.TORPEDO_LOAD
    state.reload = 0
    state.pingCooldown = 0

    state.timeLeft = k.PATROL_TIME
    state.elapsed = 0
    state.tonnage = 0
    state.sunk = 0
    state.fired = 0
    state.score = 0

    contacts = []
    torpedoes = []
    enemyTorpedoes = []
    nextId = 1
    warned = new Set()
    batteryWarned = false
    convoyTimer = 0

    // Put a convoy in the water immediately — the old build's first complaint
    // was that you could patrol for a long time without meeting anything.
    spawnConvoy()

    E().emit('patrol-start', {})
  }

  function beginGameOver(reason) {
    if (state.phase !== 'play') return
    state.phase = 'pending'
    state.phaseTimer = reason === 'sunk' ? 2.2 : 1.4
    state.reason = reason
    state.score = Math.max(0, Math.round(state.tonnage))
    E().emit('doom', {reason})
  }

  function update(delta) {
    const k = K()

    if (state.phase === 'ready') {
      const prev = Math.ceil(state.readyTimer)
      state.readyTimer -= delta
      const now = Math.ceil(state.readyTimer)
      if (now < prev && now >= 1) E().emit('count', {number: now})
      if (state.readyTimer <= 0) {
        state.phase = 'play'
        state.elapsed = 0
        state.timeLeft = k.PATROL_TIME
        convoyTimer = k.rand(k.CONVOY_GAP[0], k.CONVOY_GAP[1])
        E().emit('dive', {})
      }
      return
    }

    if (state.phase === 'play') {
      state.elapsed += delta
      state.timeLeft -= delta
      if (state.reload > 0) state.reload = Math.max(0, state.reload - delta)
      if (state.pingCooldown > 0) state.pingCooldown = Math.max(0, state.pingCooldown - delta)

      updateBoat(delta)
      updateDepth(delta)

      for (const c of contacts) {
        c.x += c.vx * delta
        c.y += c.vy * delta
      }
      contacts = contacts.filter((c) => rangeTo(c) < k.DESPAWN_RANGE)

      updateTorpedoes(delta)
      updateHunt(delta)
      updateEnemyTorpedoes(delta)
      if (state.phase !== 'play') return
      updateCollisions(delta)
      if (state.phase !== 'play') return

      convoyTimer -= delta
      if (convoyTimer <= 0) {
        convoyTimer = k.rand(k.CONVOY_GAP[0], k.CONVOY_GAP[1])
        if (spawnConvoy()) E().emit('convoy', {})
      }
      // If the ocean has emptied out, put something in it rather than leaving
      // the player driving through silence.
      if (!contacts.length && convoyTimer > 4) convoyTimer = 4

      // Passive sonar: one rate-coded beep per contact. The interval is the
      // range and the pitch is ahead-or-astern; this is how you find things.
      for (const c of contacts) {
        const range = rangeTo(c)
        if (range > k.CONTACT_RANGE) continue
        c.nextBeep -= delta
        if (c.nextBeep > 0) continue
        c.nextBeep = k.beepInterval(range)
        E().emit('beep', {
          id: c.id,
          local: localOf(c.x, c.y),
          range,
          escort: c.escort,
          muffled: depthFrac(),
        })
      }

      // Close-aboard voices and the torpedo run want a position every frame.
      E().emit('frame', {
        close: contacts
          .filter((c) => rangeTo(c) < k.CLOSE_VOICE_RANGE)
          .map((c) => ({id: c.id, local: localOf(c.x, c.y), range: rangeTo(c), voice: c.voice, escort: c.escort})),
        torpedoes: torpedoes.map((t) => ({
          id: t.id, local: localOf(t.x, t.y), range: Math.hypot(t.x - state.x, t.y - state.y),
          hostile: false,
        })).concat(enemyTorpedoes.map((t) => ({
          id: t.id, local: localOf(t.x, t.y), range: Math.hypot(t.x - state.x, t.y - state.y),
          // How far off in depth it is running decides how muted the whine is:
          // a fish set for your level is the one you need to hear clearly.
          hostile: true,
          offDepth: K().clamp(Math.abs(t.depth - state.depth) / K().MAX_DEPTH, 0, 1),
        }))),
        speed: state.speed,
        maxSpeed: maxSpeed(),
        depth: state.depth,
        depthFrac: depthFrac(),
        noise: state.noise,
      })

      for (const w of k.TIME_WARNINGS) {
        if (!warned.has(w) && state.timeLeft <= w) {
          warned.add(w)
          E().emit('time-warning', {remaining: w})
        }
      }

      if (state.timeLeft <= 0) {
        state.timeLeft = 0
        beginGameOver('time')
        return
      }
      if (state.torpedoes <= 0 && torpedoes.length === 0 && state.reload <= 0) {
        beginGameOver('empty')
        return
      }
      return
    }

    if (state.phase === 'pending') {
      state.phaseTimer -= delta
      if (state.phaseTimer <= 0) {
        state.phase = 'over'
        E().emit('game-over', {
          score: state.score,
          tonnage: Math.round(state.tonnage),
          sunk: state.sunk,
          fired: state.fired,
          reason: state.reason,
        })
      }
    }
  }

  // ---- readouts for the screen (F1/F2/F3, HUD, viz) ---------------------------

  // The contact nearest the periscope bearing — the one a shot would be about.
  function aimedContact() {
    let best = null
    let bestDelta = Infinity
    for (const c of contacts) {
      if (!c.alive) continue
      const d = Math.abs(K().wrapDeg(relBearing(c.x, c.y) - state.periscope))
      if (d < bestDelta) { bestDelta = d; best = c }
    }
    if (!best || bestDelta > 30) return null

    const range = rangeTo(best)
    // The firing solution: where the ship will be when a torpedo gets there.
    // Solved once, then refined once against the flight time to that point,
    // which is plenty at these speeds.
    let flight = range / K().TORPEDO_SPEED
    for (let i = 0; i < 2; i++) {
      const lx = best.x + best.vx * flight
      const ly = best.y + best.vy * flight
      flight = Math.hypot(lx - state.x, ly - state.y) / K().TORPEDO_SPEED
    }
    const leadX = best.x + best.vx * flight
    const leadY = best.y + best.vy * flight

    const bearing = relBearing(best.x, best.y)
    const lead = relBearing(leadX, leadY)
    return {
      id: best.id,
      type: best.type,
      escort: best.escort,
      tonnage: best.tonnage,
      bearing,
      range,
      offAim: K().wrapDeg(bearing - state.periscope),
      leadBearing: lead,
      leadOffAim: K().wrapDeg(lead - state.periscope),
      // Can the periscope even reach the solution, or must you turn the boat?
      leadReachable: Math.abs(lead) <= K().PERISCOPE_LIMIT,
      closing: ((best.x - state.x) * (best.vx - bowVector().x * state.speed) +
                (best.y - state.y) * (best.vy - bowVector().y * state.speed)) / (range || 1),
      flight,
    }
  }

  function contactList() {
    return contacts
      .filter((c) => c.alive)
      .map((c) => ({
        id: c.id,
        type: c.type,
        escort: c.escort,
        bearing: relBearing(c.x, c.y),
        range: rangeTo(c),
        local: localOf(c.x, c.y),
        hunting: c.hunting,
        audible: rangeTo(c) <= K().CONTACT_RANGE,
      }))
      .sort((a, b) => a.range - b.range)
  }

  function status() {
    return {
      score: Math.max(0, Math.round(state.tonnage)),
      tonnage: Math.max(0, Math.round(state.tonnage)),
      sunk: state.sunk,
      fired: state.fired,
      torpedoes: state.torpedoes,
      hull: Math.round(state.hull),
      battery: Math.round(state.battery),
      depth: state.depth,
      depthTarget: state.depthTarget,
      changingDepth: state.depth !== state.depthTarget,
      atPeriscope: atPeriscope(),
      heading: state.heading,
      speed: state.speed,
      maxSpeed: maxSpeed(),
      throttle: state.throttle,
      periscope: state.periscope,
      noise: state.noise,
      hunted: state.hunted,
      timeLeft: Math.max(0, state.timeLeft),
      reload: state.reload,
      pingCooldown: state.pingCooldown,
      contacts: contacts.filter((c) => rangeTo(c) <= K().CONTACT_RANGE).length,
    }
  }

  return {
    state,
    reset,
    update,
    fire,
    ping,
    setDepthLevel,
    stepDepth,
    setRudder,
    nudgeThrottle,
    setPeriscope,
    centrePeriscope,
    isPlaying: () => state.phase === 'play',
    phase: () => state.phase,
    getHeading: () => state.heading,
    getPeriscope: () => state.periscope,
    getSpeed: () => state.speed,
    getNoise: () => state.noise,
    isHunted: () => state.hunted,
    aimedContact,
    contactList,
    torpedoCount: () => torpedoes.length,
    incoming: () => enemyTorpedoes.length,
    getDepth: () => state.depth,
    getDepthTarget: () => state.depthTarget,
    status,
  }
})()
