// PIPE real-time logic.
//
// You fly down a metal pipe divided into 1-meter lanes. The pipe grows wider
// with every level, and a sequence of rings blocks it: each ring's opening
// spans a set of lanes, and you must be inside that span when you reach the
// ring or you slam into its wall, lose a life and get thrown back to re-approach
// it. The opening's centre is the target — the hum guides you to it. Every 10th
// level is a bonus cavern: no rings, just bonus items pitched by their points,
// then an opening that spans every lane so you can't miss. Speed rises with
// level; the game is effectively unlimited and your score is how far you got
// plus the bonus points. The module owns state and emits events; the game
// screen turns events into stereo audio + screen-reader announcements. Audio is
// the source of truth.
content.game = (() => {
  const K = () => content.constants
  const E = () => content.events

  const state = {
    phase: 'ready', // ready | play | pending | over
    z: 0,           // meters flown down the pipe
    x: 0,           // lateral position in meters within the pipe
    steerDir: 0,    // -1 / 0 / +1 from the held steering
    speed: 0,       // m/s forward
    level: 1,
    lives: 0,
    bonusPoints: 0,
    ringsPassed: 0,
    elapsed: 0,     // seconds of play
    readyTimer: 0,
    phaseTimer: 0,
    reason: '',
    score: 0,
  }

  let rings = []       // {id, z, left, width} — opening spans meters [left, left+width)
  let items = []       // {id, z, lane, points, pitch}
  let lastRingZ = 0
  let nextId = 1
  let targetRingId = -1
  let nextHumAt = 0
  let cavern = null    // {startZ, endZ} when the current level is a bonus cavern

  function pipeLanes() { return K().pipeLanes(state.level) }
  function clampX(x) { return Math.max(0, Math.min(pipeLanes(), x)) }
  function nextRingZ() { return lastRingZ + K().RING_SPACING_MIN + Math.random() * (K().RING_SPACING_MAX - K().RING_SPACING_MIN) }

  function addRing() {
    const width = K().openingWidth(state.level)
    const maxLeft = Math.max(0, pipeLanes() - width)
    const left = Math.random() * maxLeft
    rings.push({id: nextId++, z: nextRingZ(), left, width})
  }

  function stockField() {
    while (lastRingZ < state.z + K().HORIZON) {
      addRing()
      lastRingZ = rings[rings.length - 1].z
    }
  }

  function spawnItems() {
    const lanes = pipeLanes()
    const count = K().BONUS_ITEMS_MIN + Math.floor(Math.random() * (K().BONUS_ITEMS_MAX - K().BONUS_ITEMS_MIN + 1))
    for (let i = 0; i < count; i++) {
      const span = Math.max(1, cavern.endZ - cavern.startZ - 24)
      const z = cavern.startZ + 12 + Math.random() * span
      const lane = Math.random() * Math.max(1, lanes)
      const points = K().itemPoints()
      items.push({
        id: nextId++,
        z, lane,
        points,
        pitch: K().itemPitch(points),
        nextPing: Math.random() * 1.4,
      })
    }
    items.sort((a, b) => a.z - b.z)
  }

  function startCavern() {
    cavern = {startZ: state.z + 60, endZ: state.z + 60 + K().BONUS_CAVERN_LEN}
    items = []
    spawnItems()
  }

  function levelUp() {
    state.level++
    const L = state.level
    rings = []
    items = []
    cavern = null
    lastRingZ = state.z
    targetRingId = -1
    nextHumAt = state.elapsed
    if (K().isBonusLevel(L)) startCavern()
    else stockField()
    E().emit('level-up', {level: L, bonus: K().isBonusLevel(L), width: K().openingWidth(L)})
  }

  function nextRing() {
    for (const r of rings) if (r.z > state.z) return r
    return null
  }

  function beginGameOver(reason) {
    if (state.phase !== 'play') return
    state.phase = 'pending'
    state.phaseTimer = 1.3
    state.reason = reason
    state.score = Math.floor(state.z) + state.bonusPoints
    E().emit('doom', {reason})
  }

  function reset() {
    state.phase = 'ready'
    state.readyTimer = 3.0
    state.z = 0
    state.x = K().pipeLanes(1) / 2
    state.steerDir = 0
    state.speed = 0
    state.level = 1
    state.lives = K().LIVES
    state.bonusPoints = 0
    state.ringsPassed = 0
    state.elapsed = 0

    rings = []
    items = []
    cavern = null
    lastRingZ = 0
    targetRingId = -1
    nextHumAt = 0
    nextId = 1

    stockField()
    E().emit('run-start', {})
  }

  // ---- the flight ----
  function update(delta) {
    if (state.phase === 'ready') {
      const prev = Math.ceil(state.readyTimer)
      state.readyTimer -= delta
      const now = Math.ceil(state.readyTimer)
      if (now < prev && now >= 1) E().emit('count', {number: now})
      if (state.readyTimer <= 0) {
        state.phase = 'play'
        state.elapsed = 0
        state.speed = K().speedAt(state.level)
        E().emit('dive', {})
      }
      return
    }

    if (state.phase === 'play') {
      state.elapsed += delta
      state.speed = K().speedAt(state.level)
      const prevZ = state.z
      state.z += state.speed * delta
      state.x = clampX(state.x + state.steerDir * K().STEER_SPEED * delta)

      if (cavern) {
        // bonus cavern: catch items, then ride the full-width opening at the end
        for (const it of items) {
          if (it._gone) continue
          if (it.z > prevZ && it.z <= state.z && Math.abs(state.x - (it.lane + 0.5)) <= K().COLLECT_RADIUS) {
            it._gone = true
            state.bonusPoints += it.points
            E().emit('item-collect', {points: it.points, pitch: it.pitch, count: state.bonusPoints, level: state.level})
          }
        }
        if (items.some((it) => it._gone)) items = items.filter((it) => !it._gone)
        if (state.z >= cavern.endZ) {
          E().emit('bonus-end', {level: state.level})
          levelUp()
        }
      } else {
        // normal levels: reach each ring inside its opening
        let r = nextRing()
        while (r && state.z >= r.z) {
          const inOpening = state.x >= r.left && state.x <= r.left + r.width
          if (inOpening) {
            rings = rings.filter((x) => x.id !== r.id)
            state.ringsPassed++
            E().emit('pass', {width: r.width, level: state.level, dx: r.left + r.width / 2 - state.x})
            if (state.ringsPassed >= K().RINGS_PER_LEVEL) {
              state.ringsPassed = 0
              levelUp()
            }
          } else {
            // slammed into the ring wall — lose a life, get thrown back
            state.lives--
            state.z = Math.max(0, r.z - K().THROWBACK)
            targetRingId = -1
            E().emit('slam', {lives: state.lives, dx: r.left + r.width / 2 - state.x, level: state.level})
            if (state.lives <= 0) { beginGameOver('lives'); return }
            break
          }
          r = nextRing()
        }
        stockField()
      }

      // Ring reveal + hum: when the target ring changes, sweep its edges so the
      // player learns the opening's width and position; then ping its centre.
      const tr = nextRing()
      if (!cavern && tr) {
        if (tr.id !== targetRingId) {
          targetRingId = tr.id
          const center = tr.left + tr.width / 2
          E().emit('ring-reveal', {
            dx: center - state.x,
            left: tr.left - state.x,
            right: tr.left + tr.width - state.x,
            width: tr.width,
            dist: Math.max(0, tr.z - state.z),
          })
        }
        const dist = Math.max(0, tr.z - state.z)
        if (dist <= K().APPROACH_SPAN + 50 && state.elapsed >= nextHumAt) {
          const center = tr.left + tr.width / 2
          E().emit('hum', {dx: center - state.x, dist, width: tr.width, level: state.level})
          nextHumAt = state.elapsed + K().tickInterval(dist)
        }
      }

      // item whispers in a bonus cavern
      for (const it of items) {
        if (it._gone) continue
        const dist = it.z - state.z
        if (dist < 0 || dist > K().PING_SPAN) continue
        if (state.elapsed >= it.nextPing) {
          it.nextPing = state.elapsed + 1.4 + (it.id % 4) * 0.4
          E().emit('item-ping', {dx: (it.lane + 0.5) - state.x, pitch: it.pitch, dist, level: state.level})
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
          distance: Math.floor(state.z),
          bonusPoints: state.bonusPoints,
          level: state.level,
          lives: Math.max(0, state.lives),
        })
      }
    }
  }

  // ---- readouts for the screen (F1/F2/F3, HUD, viz) ----
  function status() {
    return {
      score: Math.floor(state.z) + state.bonusPoints,
      distance: Math.floor(state.z),
      bonusPoints: state.bonusPoints,
      speed: state.speed,
      level: state.level,
      lives: Math.max(0, state.lives),
    }
  }

  function targetInfo() {
    if (cavern) {
      return {bonus: true, dist: Math.max(0, cavern.endZ - state.z), remaining: items.length}
    }
    const tr = nextRing()
    if (!tr) return null
    const center = tr.left + tr.width / 2
    return {bonus: false, width: tr.width, dist: Math.max(0, tr.z - state.z), dx: center - state.x, left: tr.left - state.x, right: tr.left + tr.width - state.x}
  }

  function nearby() {
    const out = []
    if (cavern) {
      for (const it of items) {
        const d = it.z - state.z
        if (d < -20 || d > 200) continue
        out.push({kind: 'item', dx: (it.lane + 0.5) - state.x, dist: d, pitch: it.pitch})
      }
    } else {
      for (const r of rings) {
        const d = r.z - state.z
        if (d < -20 || d > 200) continue
        out.push({kind: 'ring', dx: (r.left + r.width / 2) - state.x, dist: d, width: r.width, isTarget: r.id === targetRingId})
      }
    }
    out.sort((a, b) => a.dist - b.dist)
    return out
  }

  return {
    state,
    reset,
    update,
    setSteer: (d) => { state.steerDir = d < 0 ? -1 : (d > 0 ? 1 : 0) },
    isPlaying: () => state.phase === 'play',
    phase: () => state.phase,
    getX: () => state.x,
    getSpeed: () => state.speed,
    getSteerDir: () => state.steerDir,
    getPipeLanes: () => pipeLanes(),
    status,
    targetInfo,
    nearby,
  }
})()
