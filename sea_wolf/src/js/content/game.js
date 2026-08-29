// SEA WOLF real-time logic.
//
// You drive a submarine around a full 360 degree ocean. Convoys cross it on
// their own courses; you hear them, work out where they are going, and get the
// boat into a firing position before they are past. Speed is noise, so the
// intercept costs you stealth. Escorts home on the noise, and once they are
// overhead you go deep and time the depth charges.
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

    depth: 'periscope', // periscope | diving | deep | surfacing
    depthTimer: 0,
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
  let charges = []
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

  function maxSpeed() {
    const k = K()
    return state.depth === 'periscope' ? k.SPEED_MAX_SHALLOW : k.SPEED_MAX_DEEP
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
        hunting: false,
        chargeTimer: 0,
        nextBeep: Math.random() * 0.5,
      })
    }
    return true
  }

  // ---- the hunt ---------------------------------------------------------------
  function addNoise(amount) { state.noise = K().clamp(state.noise + amount, 0, 1) }

  function updateHunt(delta) {
    const k = K()
    const deep = state.depth === 'deep'

    // Speed is the constant term in the noise economy: a boat at flank is
    // loud all the time, which is the price of running an intercept.
    const speedFrac = maxSpeed() > 0 ? k.clamp(state.speed / maxSpeed(), 0, 1) : 0
    const made = Math.pow(speedFrac, k.SPEED_NOISE_POWER) * k.SPEED_NOISE *
      (deep ? k.DEEP_NOISE_MULT : 1) * delta
    const shed = k.NOISE_DECAY * (deep ? k.NOISE_DECAY_DEEP_MULT : 1) * delta
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
        const r = rangeTo(c) || 1
        c.vx = ((state.x - c.x) / r) * c.sprint
        c.vy = ((state.y - c.y) / r) * c.sprint
        if (!wasHunting) E().emit('escort-turn', {local: localOf(c.x, c.y), range: r})

        if (r < k.ESCORT_ATTACK_RANGE) {
          c.chargeTimer -= delta
          if (c.chargeTimer <= 0) {
            c.chargeTimer = k.CHARGE_INTERVAL
            dropCharge(c)
          }
        }
      } else if (wasHunting) {
        // Give up and resume the convoy's course.
        const ch = rad(c.course)
        c.vx = Math.sin(ch) * c.speed
        c.vy = Math.cos(ch) * c.speed
      }
    }
  }

  // A pattern lands near the boat but not on it. How wide it scatters depends
  // on how well they have you, so a noisy boat gets tighter and tighter
  // patterns until it goes quiet.
  function dropCharge(escort) {
    const k = K()
    const spread = k.CHARGE_SPREAD_LOOSE -
      state.noise * (k.CHARGE_SPREAD_LOOSE - k.CHARGE_SPREAD_TIGHT)
    charges.push({
      id: nextId++,
      x: state.x + k.rand(-spread, spread),
      y: state.y + k.rand(-spread, spread),
      fuse: k.CHARGE_FALL_TIME,
    })
    E().emit('charge-splash', {local: localOf(escort.x, escort.y), range: rangeTo(escort)})
  }

  function updateCharges(delta) {
    const k = K()
    for (const ch of charges) {
      ch.fuse -= delta
      if (ch.fuse > 0) continue
      ch.done = true

      const dist = Math.hypot(ch.x - state.x, ch.y - state.y)
      const prox = k.clamp(1 - dist / k.CHARGE_KILL_RADIUS, 0, 1)
      const deep = state.depth === 'deep'
      const damage = k.CHARGE_DAMAGE * prox * (deep ? k.DEEP_DAMAGE_MULT : 1)

      E().emit('charge-detonate', {
        local: localOf(ch.x, ch.y),
        distance: dist,
        proximity: prox,
        deep,
        damage,
      })

      if (damage > 0.5) {
        state.hull = Math.max(0, state.hull - damage)
        E().emit('damage', {hull: state.hull, amount: damage})
        if (state.hull <= 0) { beginGameOver('sunk'); return }
      }
    }
    if (charges.some((c) => c.done)) charges = charges.filter((c) => !c.done)
  }

  // ---- torpedoes --------------------------------------------------------------
  function fire() {
    const k = K()
    if (state.phase !== 'play') return false
    if (state.depth !== 'periscope') { E().emit('fire-blocked', {reason: 'depth'}); return false }
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
  function setDepth(want) {
    if (state.phase !== 'play') return
    if (want === 'deep' && state.depth === 'periscope') {
      state.depth = 'diving'
      state.depthTimer = K().DIVE_TIME
      E().emit('depth-change', {to: 'deep'})
    } else if (want === 'periscope' && state.depth === 'deep') {
      state.depth = 'surfacing'
      state.depthTimer = K().DIVE_TIME
      E().emit('depth-change', {to: 'periscope'})
    }
  }
  function toggleDepth() {
    if (state.depth === 'periscope') setDepth('deep')
    else if (state.depth === 'deep') setDepth('periscope')
  }

  function updateDepth(delta) {
    const k = K()
    if (state.depth === 'diving' || state.depth === 'surfacing') {
      state.depthTimer -= delta
      if (state.depthTimer <= 0) {
        state.depth = state.depth === 'diving' ? 'deep' : 'periscope'
        E().emit('depth-settled', {depth: state.depth})
      }
    }

    if (state.depth === 'deep' || state.depth === 'diving') {
      state.battery = Math.max(0, state.battery - k.BATTERY_DRAIN * delta)
      if (state.battery <= 0 && state.depth === 'deep') {
        E().emit('battery-dead', {})
        setDepth('periscope')
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

    state.depth = 'periscope'
    state.depthTimer = 0
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
    charges = []
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
        // An escort that runs the boat down would otherwise sit on top of us
        // and spin; hold it off at a small stand-off.
        if (c.hunting) {
          const r = rangeTo(c)
          if (r < 60 && r > 0.001) {
            c.x = state.x + ((c.x - state.x) / r) * 60
            c.y = state.y + ((c.y - state.y) / r) * 60
          }
        }
      }
      contacts = contacts.filter((c) => rangeTo(c) < k.DESPAWN_RANGE)

      updateTorpedoes(delta)
      updateHunt(delta)
      updateCharges(delta)
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
          muffled: state.depth !== 'periscope',
        })
      }

      // Close-aboard voices and the torpedo run want a position every frame.
      E().emit('frame', {
        close: contacts
          .filter((c) => rangeTo(c) < k.CLOSE_VOICE_RANGE)
          .map((c) => ({id: c.id, local: localOf(c.x, c.y), range: rangeTo(c), voice: c.voice, escort: c.escort})),
        torpedoes: torpedoes.map((t) => ({
          id: t.id, local: localOf(t.x, t.y), range: Math.hypot(t.x - state.x, t.y - state.y),
        })),
        speed: state.speed,
        maxSpeed: maxSpeed(),
        depth: state.depth,
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
    setDepth,
    toggleDepth,
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
    status,
  }
})()
