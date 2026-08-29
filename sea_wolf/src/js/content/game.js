// SEA WOLF real-time logic.
//
// You are submerged in a shipping lane. Convoys cross your bow on a forward
// 180 degree arc; passive sonar gives you their bearings continuously, an
// active ping gives you their range, and a torpedo takes range/TORPEDO_SPEED
// seconds to get there — so you fire at where the ship is GOING. Pings and
// shots make noise, escorts home on the noise, and once they are overhead you
// go deep and time the depth charges.
//
// Geometry: the submarine sits at the origin, bow pointing along +y. A contact
// at (x, y) has bearing atan2(x, y) in degrees (negative = port) and range
// hypot(x, y). Contacts hold a straight course; nothing manoeuvres except an
// escort that has acquired you.
//
// This module owns state and emits events. The game screen turns events into
// audio and screen-reader announcements. Audio is the source of truth.
content.game = (() => {
  const K = () => content.constants
  const E = () => content.events

  const DEG = 180 / Math.PI

  const state = {
    phase: 'ready',     // ready | play | pending | over
    readyTimer: 0,
    phaseTimer: 0,
    reason: null,

    aim: 0,             // periscope bearing, degrees
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
    tonnage: 0,         // score
    sunk: 0,
    fired: 0,
    score: 0,
  }

  let contacts = []     // {id, type, x, y, vx, vy, tonnage, hum, screw, escort, ...}
  let pending = []      // ships queued to enter the field: {ship, at}
  let torpedoes = []    // {id, x, y, vx, vy, life}
  let charges = []      // {id, x, y, fuse}
  let nextId = 1
  let convoyTimer = 0
  let warned = new Set()
  let batteryWarned = false

  // ---- geometry ---------------------------------------------------------------
  function bearingOf(c) { return Math.atan2(c.x, c.y) * DEG }
  function rangeOf(c) { return Math.hypot(c.x, c.y) }
  function inArc(c) { return c.y > 0 && Math.abs(bearingOf(c)) <= K().ARC_HALF }

  // Smallest signed difference between two bearings.
  function bearingDelta(a, b) { return a - b }

  // ---- spawning ---------------------------------------------------------------
  // A convoy enters from one side and crosses the bow. Every ship in it shares
  // a heading so the group reads as one formation moving across the field.
  function spawnConvoy() {
    const k = K()
    // Respect the audio budget. MAX_CONTACTS is a hard ceiling on what can be
    // in the water, so trim the convoy to whatever room is left rather than
    // just declining to start one — otherwise a convoy begun at 11 contacts
    // still overshoots by its whole size.
    const room = k.MAX_CONTACTS - (contacts.length + pending.length)
    if (room < 2) return false

    const fromPort = Math.random() < 0.5
    let merchants = k.randInt(k.CONVOY_SIZE[0], k.CONVOY_SIZE[1])
    let escorts = k.randInt(k.CONVOY_ESCORTS[0], k.CONVOY_ESCORTS[1])
    if (merchants + escorts > room) {
      // Give the merchants priority — a screen with nothing to screen is not
      // worth the audio budget.
      merchants = Math.min(merchants, Math.max(1, room - 1))
      escorts = Math.max(0, Math.min(escorts, room - merchants))
    }

    // Base track: a line crossing the bow at some stand-off distance. Biased
    // toward the near end so most convoys are close enough to hear properly
    // and shoot inside a few seconds, with the occasional distant one that
    // really does need a ping.
    const standOff = k.TRACK_NEAR + Math.pow(Math.random(), 1.7) * (k.TRACK_FAR - k.TRACK_NEAR)
    const names = ['freighter', 'tanker', 'liner']

    // Escorts are interleaved through the convoy rather than tacked on the
    // end, so the screen is spread across the formation the way it would be.
    const order = []
    for (let i = 0; i < merchants; i++) order.push(false)
    for (let i = 0; i < escorts; i++) order.splice(k.randInt(0, order.length), 0, true)

    for (let i = 0; i < order.length; i++) {
      const isEscort = order[i]
      const type = isEscort ? 'escort' : names[k.randInt(0, names.length - 1)]
      const spec = k.SHIP_TYPES[type]
      const speed = k.rand(spec.speed[0], spec.speed[1])
      const sprint = spec.sprint ? k.rand(spec.sprint[0], spec.sprint[1]) : speed

      // Every ship enters at the edge of the field for its own stand-off, and
      // the convoy is strung out in TIME rather than in space — pushing later
      // ships further out would put them past DESPAWN_RANGE and they would be
      // culled on the frame they spawned.
      const y = k.clamp(standOff + k.rand(-120, 120), k.TRACK_NEAR * 0.7, k.SPAWN_RANGE)
      const edge = Math.sqrt(Math.max(0, k.DESPAWN_RANGE * k.DESPAWN_RANGE - y * y)) * 0.97
      const x = fromPort ? -edge : edge

      pending.push({at: state.elapsed + i * k.rand(1.6, 3.4), ship: {
        id: nextId++,
        type,
        escort: spec.escort,
        tonnage: spec.tonnage,
        hum: spec.hum,
        screw: spec.screw,
        x, y,
        vx: fromPort ? speed : -speed,
        vy: 0,
        speed,
        sprint,
        alive: true,
        hunting: false,
        chargeTimer: 0,
        nextHum: Math.random() * 0.6,
      }})
    }
    return true
  }

  // Move any queued ship whose moment has come into the live field.
  function releasePending() {
    if (!pending.length) return
    const due = pending.filter((p) => p.at <= state.elapsed)
    if (!due.length) return
    for (const p of due) contacts.push(p.ship)
    pending = pending.filter((p) => p.at > state.elapsed)
  }

  // ---- the hunt ---------------------------------------------------------------
  // Noise is the whole stealth model. Anything loud spikes it; time bleeds it
  // away, faster when you are deep. Escorts acquire above HUNT_THRESHOLD and
  // only give up once it falls under LOSE_THRESHOLD.
  function addNoise(amount) {
    state.noise = K().clamp(state.noise + amount, 0, 1)
  }

  function updateHunt(delta) {
    const k = K()
    const deep = state.depth === 'deep'
    state.noise = k.clamp(
      state.noise - (deep ? k.NOISE_DECAY_DEEP : k.NOISE_DECAY_SHALLOW) * delta, 0, 1)

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
        // a change of pace as well as a swing across the arc.
        const r = rangeOf(c) || 1
        c.vx = (-c.x / r) * c.sprint
        c.vy = (-c.y / r) * c.sprint
        if (!wasHunting) E().emit('escort-turn', {bearing: bearingOf(c), range: r})

        if (r < k.ESCORT_ATTACK_RANGE) {
          c.chargeTimer -= delta
          if (c.chargeTimer <= 0) {
            c.chargeTimer = k.CHARGE_INTERVAL
            dropCharge(c)
          }
        }
      } else if (wasHunting) {
        // Give up and resume a straight course across the bow.
        c.vx = c.vx >= 0 ? c.speed : -c.speed
        c.vy = 0
      }
    }
  }

  // A pattern lands near the boat but not on it — the scatter is what makes
  // diving worth doing, and what makes a shallow boat get hurt. How wide it
  // scatters depends on how well they have you, so a noisy boat gets tighter
  // and tighter patterns until it goes quiet.
  function dropCharge(escort) {
    const k = K()
    const spread = k.CHARGE_SPREAD_LOOSE -
      state.noise * (k.CHARGE_SPREAD_LOOSE - k.CHARGE_SPREAD_TIGHT)
    charges.push({
      id: nextId++,
      x: k.rand(-spread, spread),
      y: k.rand(-spread, spread),
      fuse: k.CHARGE_FALL_TIME,
    })
    E().emit('charge-splash', {bearing: bearingOf(escort), range: rangeOf(escort)})
  }

  function updateCharges(delta) {
    const k = K()
    for (const ch of charges) {
      ch.fuse -= delta
      if (ch.fuse > 0) continue
      ch.done = true

      const dist = Math.hypot(ch.x, ch.y)
      const prox = k.clamp(1 - dist / k.CHARGE_KILL_RADIUS, 0, 1)
      const deep = state.depth === 'deep'
      const damage = k.CHARGE_DAMAGE * prox * (deep ? k.DEEP_DAMAGE_MULT : 1)

      E().emit('charge-detonate', {
        bearing: Math.atan2(ch.x, ch.y) * DEG,
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

    const rad = state.aim / DEG
    torpedoes.push({
      id: nextId++,
      x: 0,
      y: 0,
      vx: Math.sin(rad) * k.TORPEDO_SPEED,
      vy: Math.cos(rad) * k.TORPEDO_SPEED,
      life: k.TORPEDO_LIFE,
    })

    state.torpedoes--
    state.fired++
    state.reload = k.RELOAD_TIME
    addNoise(k.FIRE_NOISE)
    E().emit('fire', {bearing: state.aim, remaining: state.torpedoes})
    return true
  }

  function updateTorpedoes(delta) {
    const k = K()
    for (const t of torpedoes) {
      // Step in small slices so a fast torpedo cannot tunnel through a hull
      // between frames.
      const steps = Math.max(1, Math.ceil((k.TORPEDO_SPEED * delta) / (k.TORPEDO_HIT_RADIUS * 0.8)))
      const dt = delta / steps

      for (let s = 0; s < steps && !t.done; s++) {
        t.x += t.vx * dt
        t.y += t.vy * dt
        t.life -= dt

        for (const c of contacts) {
          if (!c.alive) continue
          if (Math.hypot(c.x - t.x, c.y - t.y) > k.TORPEDO_HIT_RADIUS) continue
          const range = rangeOf(c)
          if (range < k.MIN_ENGAGE_RANGE) continue // the warhead has not armed

          c.alive = false
          t.done = true
          state.tonnage += c.tonnage
          state.sunk++
          // The explosion tells everyone within earshot exactly where the shot
          // came from, so a kill is never free.
          addNoise(K().HIT_NOISE)
          E().emit('hit', {
            id: c.id,
            bearing: bearingOf(c),
            range,
            type: c.type,
            tonnage: c.tonnage,
            total: state.tonnage,
            escort: c.escort,
          })
          break
        }

        if (t.life <= 0 && !t.done) {
          t.done = true
          E().emit('torpedo-spent', {bearing: Math.atan2(t.x, t.y) * DEG})
        }
      }
    }
    if (torpedoes.some((t) => t.done)) torpedoes = torpedoes.filter((t) => !t.done)
    contacts = contacts.filter((c) => c.alive)
  }

  // ---- active sonar -----------------------------------------------------------
  // The ping itself is instant; each echo is scheduled by the screen for
  // 2*range/SOUND_SPEED seconds' time, which is how range is heard.
  function ping() {
    if (state.phase !== 'play') return false
    if (state.pingCooldown > 0) return false

    const k = K()
    state.pingCooldown = k.PING_COOLDOWN
    addNoise(k.PING_NOISE)

    const returns = contacts
      .filter((c) => c.alive && inArc(c))
      .map((c) => ({
        bearing: bearingOf(c),
        range: rangeOf(c),
        delay: k.echoDelay(rangeOf(c)),
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
        // Out of amps. The boat has to come up whether it is safe or not.
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

  // ---- aim --------------------------------------------------------------------
  function setAim(dir, fine, delta) {
    if (state.phase !== 'play' || !dir) return
    const k = K()
    const speed = fine ? k.AIM_FINE_SPEED : k.AIM_SPEED
    const before = state.aim
    state.aim = k.clamp(state.aim + dir * speed * delta, -k.ARC_HALF, k.ARC_HALF)

    // Sweeping across a contact's bearing clicks, which is how you find a
    // target without pinging.
    if (before === state.aim) return
    const lo = Math.min(before, state.aim) - k.CROSS_ANGLE
    const hi = Math.max(before, state.aim) + k.CROSS_ANGLE
    for (const c of contacts) {
      if (!c.alive || !inArc(c)) continue
      const b = bearingOf(c)
      if (b >= lo && b <= hi) {
        E().emit('cross', {bearing: b, range: rangeOf(c), escort: c.escort})
      }
    }
  }

  // ---- lifecycle --------------------------------------------------------------
  function reset() {
    const k = K()
    state.phase = 'ready'
    state.readyTimer = 3.0
    state.reason = null

    state.aim = 0
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
    pending = []
    torpedoes = []
    charges = []
    nextId = 1
    warned = new Set()
    batteryWarned = false
    convoyTimer = 1.5

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
        E().emit('dive', {})
      }
      return
    }

    if (state.phase === 'play') {
      state.elapsed += delta
      state.timeLeft -= delta
      if (state.reload > 0) state.reload = Math.max(0, state.reload - delta)
      if (state.pingCooldown > 0) state.pingCooldown = Math.max(0, state.pingCooldown - delta)

      // Move every contact along its course.
      for (const c of contacts) {
        c.x += c.vx * delta
        c.y += c.vy * delta
        // An escort that runs the boat down would otherwise sit on the origin
        // and spin; hold it off at a small stand-off.
        if (c.hunting && rangeOf(c) < 60) {
          const r = rangeOf(c) || 1
          c.x = (c.x / r) * 60
          c.y = (c.y / r) * 60
        }
      }
      contacts = contacts.filter((c) => rangeOf(c) < k.DESPAWN_RANGE)

      releasePending()

      convoyTimer -= delta
      if (convoyTimer <= 0) {
        convoyTimer = k.rand(k.CONVOY_GAP[0], k.CONVOY_GAP[1])
        if (spawnConvoy()) E().emit('convoy', {})
      }

      updateDepth(delta)
      updateTorpedoes(delta)
      updateHunt(delta)
      updateCharges(delta)
      if (state.phase !== 'play') return

      // Passive sonar: every contact in the arc pulses its own screw beat.
      // Faster ships beat faster; escorts beat fastest of all, so the arc
      // tells you what is out there without a ping.
      for (const c of contacts) {
        if (!inArc(c)) continue
        c.nextHum -= delta
        if (c.nextHum > 0) continue
        const range = rangeOf(c)
        c.nextHum = 1 / c.screw
        E().emit('hum', {
          bearing: bearingOf(c),
          range,
          hum: c.hum,
          escort: c.escort,
          muffled: state.depth !== 'periscope',
        })
      }

      // Torpedo run noise, so you can hear your own fish going out.
      for (const t of torpedoes) {
        E().emit('torpedo-run', {
          bearing: Math.atan2(t.x, t.y) * DEG,
          range: Math.hypot(t.x, t.y),
          life: t.life,
        })
      }

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

  // The contact nearest the current aim — the one a shot would be about.
  function aimedContact() {
    let best = null
    let bestDelta = Infinity
    for (const c of contacts) {
      if (!c.alive || !inArc(c)) continue
      const d = Math.abs(bearingDelta(bearingOf(c), state.aim))
      if (d < bestDelta) { bestDelta = d; best = c }
    }
    if (!best || bestDelta > 25) return null
    const range = rangeOf(best)
    // The firing solution: where the ship will be when a torpedo gets there.
    const flight = range / K().TORPEDO_SPEED
    const leadX = best.x + best.vx * flight
    const leadY = best.y + best.vy * flight
    return {
      id: best.id,
      type: best.type,
      escort: best.escort,
      tonnage: best.tonnage,
      bearing: bearingOf(best),
      range,
      offAim: bearingDelta(bearingOf(best), state.aim),
      closing: (best.x * best.vx + best.y * best.vy) / (range || 1),
      leadBearing: Math.atan2(leadX, leadY) * DEG,
      flight,
    }
  }

  function contactList() {
    return contacts
      .filter((c) => c.alive && inArc(c))
      .map((c) => ({
        id: c.id,
        type: c.type,
        escort: c.escort,
        bearing: bearingOf(c),
        range: rangeOf(c),
        hunting: c.hunting,
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
      aim: state.aim,
      noise: state.noise,
      hunted: state.hunted,
      timeLeft: Math.max(0, state.timeLeft),
      reload: state.reload,
      pingCooldown: state.pingCooldown,
      contacts: contacts.filter((c) => inArc(c)).length,
    }
  }

  return {
    state,
    reset,
    update,
    fire,
    ping,
    setDepth,
    setAim,
    isPlaying: () => state.phase === 'play',
    phase: () => state.phase,
    getAim: () => state.aim,
    getNoise: () => state.noise,
    isHunted: () => state.hunted,
    aimedContact,
    contactList,
    torpedoCount: () => torpedoes.length,
    status,
  }
})()
