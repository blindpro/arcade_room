// Wave scheduling. Linear-ish escalation; on each wave we precompute a
// shuffled queue of N spawn events spaced over the wave duration, with
// per-spawn jitter.
content.wave = (() => {
  const K = () => content.constants

  function paramsForWave(n) {
    if (n < 1) n = 1
    if (n < K().WAVE_TABLE.length) return K().WAVE_TABLE[n]
    return {
      count: K().WAVE_BEYOND_COUNT_BASE + K().WAVE_BEYOND_COUNT_PER * (n - K().WAVE_TABLE.length),
      splitterRate: K().WAVE_BEYOND_SPLITTER_RATE,
      bomberRate: K().WAVE_BEYOND_BOMBER_RATE,
      speedMul: K().WAVE_BEYOND_SPEED_MUL,
      duration: K().WAVE_BEYOND_DURATION,
    }
  }

  let queue = []
  let active = false
  let elapsed = 0
  let totalSpawned = 0
  let waveNumber = 0
  let cleared = false

  function start(n) {
    waveNumber = n
    const p = paramsForWave(n)
    queue = []
    elapsed = 0
    totalSpawned = 0
    cleared = false
    active = true

    const interval = p.duration / p.count
    let t = K().FIRST_SPAWN_GRACE
    for (let i = 0; i < p.count; i++) {
      const r = Math.random()
      let kind = 'icbm'
      if (r < p.bomberRate) kind = 'bomber'
      else if (r < p.bomberRate + p.splitterRate) kind = 'splitter'
      const jit = (Math.random() - 0.5) * 0.5 * interval
      queue.push({when: t + jit, kind, speedMul: p.speedMul})
      t += interval
    }
    queue.sort((a, b) => a.when - b.when)
    return p
  }

  function _spawn(kind, speedMul) {
    if (kind === 'bomber') {
      const fromLeft = Math.random() < 0.5
      const startX = fromLeft ? -K().BOMBER_BOUNDS : K().BOMBER_BOUNDS
      const speed = (K().BOMBER_SPEED_BASE + Math.random() * K().BOMBER_SPEED_RANGE) * speedMul
      content.threats.spawn({
        kind: 'bomber',
        x: startX,
        y: K().BOMBER_SPAWN_Y_BASE + Math.random() * K().BOMBER_SPAWN_Y_RANGE,
        vx: fromLeft ? speed : -speed,
        vy: 0,
      })
    } else {
      const startX = (Math.random() * 2 * K().SPAWN_X_RANGE) - K().SPAWN_X_RANGE
      const targetX = (Math.random() * 2 * K().SPAWN_X_RANGE) - K().SPAWN_X_RANGE
      const baseDescent = -K().ICBM_VY * speedMul * (kind === 'splitter' ? K().SPLITTER_SPEED_MUL : 1.0)
      const flightTime = 1.0 / baseDescent
      const vx = (targetX - startX) / flightTime
      content.threats.spawn({
        kind,
        x: startX,
        y: 1.0,
        vx,
        vy: -baseDescent,
      })
    }
    totalSpawned++
  }

  function tick(dt) {
    if (!active) return
    elapsed += dt
    while (queue.length && queue[0].when <= elapsed) {
      const e = queue.shift()
      _spawn(e.kind, e.speedMul)
    }
    // Cleared = no queued spawns AND no live threats.
    if (!cleared && queue.length === 0 && content.threats.aliveCount() === 0) {
      cleared = true
      active = false
      content.events.emit('wave-cleared', {wave: waveNumber})
    }
  }

  function isCleared() { return cleared }
  function isActive() { return active }
  function remaining() { return queue.length + content.threats.aliveCount() }

  function bonus(survivingMissiles, survivingCities) {
    return survivingMissiles * K().MISSILE_BONUS_MUL + survivingCities * K().CITY_BONUS_MUL
  }

  function reset() {
    queue = []
    active = false
    elapsed = 0
    totalSpawned = 0
    waveNumber = 0
    cleared = false
  }

  return {start, tick, isCleared, isActive, remaining, bonus, reset, paramsForWave}
})()
