// SKYDIVE real-time logic.
//
// You drop from thousands of meters; gravity accelerates the fall, so the
// longer you go without a crystal the faster you fall. Crystals float below
// you and each one pings at its own pitch — the higher the pitch, the higher
// it lifts you. Steer left/right to centre the next crystal in the stereo
// field; fly over an aligned crystal and you collect it automatically: your
// fall speed resets and you are boosted back up. After two minutes the run
// ends and your score is how high in the sky you are (height in meters).
// Falling to the ground crashes the run early. The module owns state and
// emits events; the game screen turns events into audio + screen-reader
// announcements. Audio is the source of truth.
content.game = (() => {
  const K = () => content.constants
  const E = () => content.events

  const state = {
    phase: 'ready', // ready | play | pending | over
    height: 0,      // meters above the ground
    fallSpeed: 0,   // m/s downward (positive = falling)
    x: 0,           // meters, clamped to [-HALF_WIDTH, HALF_WIDTH]
    steerDir: 0,    // -1 / 0 / +1 from the held steering
    timeLeft: 0,
    elapsed: 0,     // seconds of play
    crystals: 0,    // crystals collected this run
    score: 0,
    readyTimer: 0,
  }

  let crystals = []      // {id, x, alt, pitch, lift}
  let nextId = 1
  let genLowest = 0      // altitude of the lowest crystal generated so far
  let targetId = -1
  let nextGuideAt = 0
  let warned = new Set()

  function clampX(x) { return Math.max(-K().HALF_WIDTH, Math.min(K().HALF_WIDTH, x)) }
  function belowOf(c) { return state.height - c.alt }
  function byId(id) { for (const c of crystals) if (c.id === id) return c; return null }

  function spawnCrystal() {
    const n = K().valueFor()
    const c = {
      id: nextId++,
      x: clampX(state.x + (Math.random() * 2 - 1) * K().CRYSTAL_OFFSET),
      alt: genLowest,
      pitch: K().pitchFor(n),
      lift: K().liftFor(n),
      nextPing: 1 + Math.random() * 1.5,
    }
    crystals.push(c)
    genLowest -= K().CRYSTAL_GAP_MIN + Math.random() * (K().CRYSTAL_GAP_MAX - K().CRYSTAL_GAP_MIN)
    return c
  }

  function stockField() {
    while (genLowest > state.height - K().CRYSTAL_BAND) spawnCrystal()
  }

  function cullField() {
    const lo = state.height - K().CRYSTAL_BAND - 60
    const hi = state.height + 420 // only reachable again after a huge lift
    crystals = crystals.filter((c) => c.alt > lo && c.alt < hi)
  }

  // ---- targeting -------------------------------------------------------------
  // The beacon guides the nearest crystal at or below the player; as you pass
  // or collect it the next one takes over. (Crystals above the player were just
  // flown past, so they drop out of consideration.)
  function retarget() {
    let best = null
    for (const c of crystals) {
      const below = belowOf(c)
      if (below < -0.5) continue
      if (!best || below < best._below) {
        best = c
        best._below = below
      }
    }
    const newId = best ? best.id : -1
    const changed = newId !== targetId
    targetId = newId
    if (changed && best) {
      E().emit('retarget', {dx: best.x - state.x, below: Math.max(0, best._below), pitch: best.pitch, lift: best.lift})
    }
  }

  function reset() {
    state.phase = 'ready'
    state.height = K().START_HEIGHT
    state.fallSpeed = 0
    state.x = 0
    state.timeLeft = K().RUN_TIME
    state.elapsed = 0
    state.crystals = 0
    state.score = 0
    state.readyTimer = 3.0

    crystals = []
    nextId = 1
    warned = new Set()
    targetId = -1
    nextGuideAt = 0

    genLowest = K().START_HEIGHT - K().CRYSTAL_MIN_GAP
    stockField()
    retarget()

    E().emit('run-start', {})
  }

  function beginGameOver(reason) {
    if (state.phase !== 'play') return
    state.phase = 'pending'
    state.phaseTimer = 1.3
    state.reason = reason
    state.score = Math.max(0, Math.round(state.height))
    E().emit('doom', {reason})
  }

  // ---- the fall ---------------------------------------------------------------
  function update(delta) {
    if (state.phase === 'ready') {
      const prev = Math.ceil(state.readyTimer)
      state.readyTimer -= delta
      const now = Math.ceil(state.readyTimer)
      if (now < prev && now >= 1) E().emit('count', {number: now})
      if (state.readyTimer <= 0) {
        state.phase = 'play'
        state.elapsed = 0
        state.timeLeft = K().RUN_TIME
        E().emit('dive', {})
      }
      return
    }

    if (state.phase === 'play') {
      state.elapsed += delta
      state.timeLeft -= delta

      // The longer you fall, the faster you fall.
      state.fallSpeed = Math.min(K().MAX_FALL_SPEED, state.fallSpeed + K().GRAVITY * delta)
      const prevHeight = state.height
      state.height -= state.fallSpeed * delta

      // Steering: hold LEFT / RIGHT to glide sideways at STEER_SPEED.
      state.x = clampX(state.x + state.steerDir * K().STEER_SPEED * delta)

      // Collect any crystal we fly over while aligned.
      for (const c of crystals) {
        if (c._gone) continue
        if (prevHeight >= c.alt && state.height <= c.alt && Math.abs(state.x - c.x) <= K().COLLECT_RADIUS) {
          c._gone = true
          state.crystals++
          state.fallSpeed = K().BASE_FALL_SPEED
          state.height += c.lift // the crystal carries you back up
          E().emit('collect', {dx: c.x - state.x, pitch: c.pitch, lift: c.lift, count: state.crystals})
        }
      }
      if (crystals.some((c) => c._gone)) crystals = crystals.filter((c) => !c._gone)

      // Stock the field below and prune what we've fallen far past.
      stockField()
      cullField()

      // The ground.
      if (state.height <= K().CRASH_HEIGHT) {
        state.height = 0
        beginGameOver('crash')
        E().emit('ground', {})
        return
      }

      // Time's up.
      if (state.timeLeft <= 0) {
        state.timeLeft = 0
        beginGameOver('time')
        return
      }

      // Time warnings.
      for (const w of K().TIME_WARNINGS) {
        if (!warned.has(w) && state.timeLeft <= w) {
          warned.add(w)
          E().emit('time-warning', {remaining: w})
        }
      }

      retarget()

      // Beacon tick for the target crystal.
      const target = byId(targetId)
      if (target && state.elapsed >= nextGuideAt) {
        const below = Math.max(0, belowOf(target))
        E().emit('guide', {dx: target.x - state.x, below, pitch: target.pitch})
        nextGuideAt = state.elapsed + K().tickInterval(below)
      }

      // Soft pings for the other nearby crystals so you can hear an
      // alternative high-pitch crystal and steer for it.
      for (const c of crystals) {
        if (c.id === targetId) continue
        const below = belowOf(c)
        if (below < 0 || below > K().PING_SPAN) continue
        if (state.elapsed >= c.nextPing) {
          c.nextPing = state.elapsed + 1.6 + (c.id % 4) * 0.45
          E().emit('ping', {dx: c.x - state.x, below, pitch: c.pitch})
        }
      }
      return
    }

    if (state.phase === 'pending') {
      state.phaseTimer -= delta
      if (state.phaseTimer <= 0) {
        state.phase = 'over'
        E().emit('game-over', {
          score: state.score,
          height: Math.max(0, Math.round(state.height)),
          crystals: state.crystals,
          reason: state.reason,
        })
      }
    }
  }

  // ---- readouts for the screen (F1/F2/F3, HUD, viz) ---------------------------
  function targetInfo() {
    const t = byId(targetId)
    if (!t || belowOf(t) < -0.5) return null
    return {dx: t.x - state.x, below: Math.max(0, belowOf(t)), pitch: t.pitch, lift: t.lift}
  }

  function nearby() {
    return crystals
      .filter((c) => Math.abs(c.alt - state.height) < 420)
      .map((c) => ({dx: c.x - state.x, dy: state.height - c.alt, pitch: c.pitch, isTarget: c.id === targetId}))
      .sort((a, b) => Math.abs(a.dy) - Math.abs(b.dy))
  }

  function status() {
    return {
      score: Math.max(0, Math.round(state.height)),
      height: Math.max(0, Math.round(state.height)),
      fallSpeed: state.fallSpeed,
      timeLeft: Math.max(0, state.timeLeft),
      crystals: state.crystals,
    }
  }

  return {
    state,
    reset,
    update,
    setSteer: (d) => { state.steerDir = d < 0 ? -1 : (d > 0 ? 1 : 0) },
    isPlaying: () => state.phase === 'play',
    phase: () => state.phase,
    getPlayerX: () => state.x,
    getHeight: () => state.height,
    getFallSpeed: () => state.fallSpeed,
    targetInfo,
    nearby,
    status,
  }
})()
