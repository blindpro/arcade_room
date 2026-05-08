// Evil Otto. The indestructible smiling bouncer that arrives if the
// player dawdles in a room. Cannot be killed. Passes through walls.
// Persists across rooms when the player flees with robots still alive
// (running out of a room with no kills earns Otto's continued attention).
//
// Audio signature: a two-tone tritone bounce. Each half-period of the
// vertical bounce phase plays one of {C5, F#5} alternately — one of the
// most recognizable arcade sounds. The bounce period shortens as he
// closes (0.6s → 0.3s) so the cue accelerates audibly with danger. On top
// of that, a continuous proximity-buzz voice opens its filter as Otto
// nears, layering an analog panic cue.
content.otto = (() => {
  const A = () => content.audio
  const E = () => content.events
  const P = () => content.player
  const SFX = () => content.sfx

  // Spawn timer per room. Scales down with depth, never below the floor.
  const OTTO_DELAY_BASE = 25
  const OTTO_DELAY_MIN = 9
  const OTTO_SPEED = 5.4 // tiles/sec — slower than player walk (6.0); escapable
  const OTTO_RADIUS = 0.45

  const state = {
    alive: false,
    persistent: false,    // carried over from previous room
    x: 0, y: 0,
    bouncePhase: 0,
    bouncePeriod: 0.6,
    halfPhase: 0,         // 0 or 1, flips on each half-period to alternate tritone tones
    spawnTimer: 0,
    spawnedThisRoom: false,
    proxProp: null,
    proxFilter: null,
  }

  function clearProxProp() {
    if (state.proxProp) {
      try { state.proxProp.destroy() } catch (_) {}
      state.proxProp = null
      state.proxFilter = null
    }
  }

  function buildProxVoice() {
    return (out, mod) => {
      const ctx = engine.context()
      const n = ctx.createBufferSource()
      n.buffer = engine.buffer.whiteNoise({channels: 1, duration: 4})
      n.loop = true
      if (mod && mod.detune) {
        try { mod.detune.connect(n.detune) } catch (_) {}
      }
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 700
      bp.Q.value = 1.4
      const g = ctx.createGain()
      g.gain.value = 0.7
      n.connect(bp).connect(g).connect(out)
      n.start()
      // Stash the filter on state so update() can sweep it.
      state.proxFilter = bp
      return () => { try { n.stop() } catch (_) {} }
    }
  }

  function spawnProxVoice() {
    clearProxProp()
    state.proxProp = A().makeProp({
      build: buildProxVoice(),
      x: state.x, y: state.y,
      gain: 0,
      key: 'ottoBuzz',
      normalize: true,
    })
  }

  // Begin a new room. If `keepAlive` is true (player fled), Otto persists
  // and is repositioned; spawn timer is short. Otherwise reset entirely.
  function enterRoom(keepAlive) {
    if (keepAlive && state.alive) {
      state.persistent = true
      state.spawnedThisRoom = true
      // Drop Otto somewhere off-board on the side opposite the player's spawn.
      const sp = content.room.spawn()
      const cols = content.room.cols(), rows = content.room.rows()
      // Place him at one edge, far from spawn, so he has to travel.
      const side = Math.floor(Math.random() * 4)
      if (side === 0) { state.x = 1.5; state.y = 1.5 }
      else if (side === 1) { state.x = cols - 1.5; state.y = 1.5 }
      else if (side === 2) { state.x = 1.5; state.y = rows - 1.5 }
      else { state.x = cols - 1.5; state.y = rows - 1.5 }
      // ensure not exactly on player spawn
      if (Math.abs(state.x - sp.x) < 4 && Math.abs(state.y - sp.y) < 4) state.x = cols - 1.5
      spawnProxVoice()
      announceArrival()
      return
    }
    // Fresh room, no carry-over.
    state.alive = false
    state.persistent = false
    state.spawnedThisRoom = false
    state.bouncePhase = 0
    state.halfPhase = 0
    clearProxProp()
    const difficulty = (app.settings.computed && app.settings.computed.difficulty) || 'normal'
    const depth = content.room.depth() || 1
    const mul = difficulty === 'hard' ? 0.6 : difficulty === 'easy' ? 1.4 : 1.0
    state.spawnTimer = Math.max(OTTO_DELAY_MIN, OTTO_DELAY_BASE - (depth - 1) * 1.5) * mul
  }

  function announceArrival() {
    app.announce.assertive(app.i18n.t('ann.ottoArrives'))
    E().emit('otto-spawn', {x: state.x, y: state.y})
  }

  function spawn() {
    if (state.alive) return
    state.alive = true
    state.spawnedThisRoom = true
    // Spawn at one of the four corners.
    const cols = content.room.cols(), rows = content.room.rows()
    const corners = [
      {x: 2, y: 2}, {x: cols - 2, y: 2},
      {x: 2, y: rows - 2}, {x: cols - 2, y: rows - 2},
    ]
    const c = corners[Math.floor(Math.random() * corners.length)]
    state.x = c.x; state.y = c.y
    state.bouncePhase = 0
    state.halfPhase = 0
    state.bouncePeriod = 0.6
    spawnProxVoice()
    announceArrival()
  }

  function update(dt) {
    if (!state.spawnedThisRoom && !state.alive) {
      state.spawnTimer -= dt
      if (state.spawnTimer <= 0) spawn()
      return
    }
    if (!state.alive) return

    // Pursuit (ignoring walls).
    if (P().isAlive()) {
      const p = P().getPosition()
      const dx = p.x - state.x, dy = p.y - state.y
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len > 0.001) {
        const sp = OTTO_SPEED
        state.x += (dx / len) * sp * dt
        state.y += (dy / len) * sp * dt
      }

      // Period shortens as Otto closes. clamp(0.3 + dist*0.02, 0.3, 0.6)
      state.bouncePeriod = Math.max(0.3, Math.min(0.6, 0.3 + len * 0.02))

      // Bounce phase. Each half-period wrap fires a tritone tick alternately.
      state.bouncePhase += dt
      const half = state.bouncePeriod / 2
      while (state.bouncePhase >= half) {
        state.bouncePhase -= half
        SFX().ottoBounceTick(state.x, state.y, state.halfPhase)
        state.halfPhase = (state.halfPhase + 1) & 1
      }

      // Proximity buzz: sweep filter cutoff 700 Hz → 4 kHz as len → 0.
      if (state.proxFilter) {
        const t = Math.max(0, Math.min(1, (12 - len) / 12))
        const cutoff = 700 + t * 3300
        state.proxFilter.frequency.setTargetAtTime(cutoff, engine.context().currentTime, 0.08)
      }
      if (state.proxProp) {
        state.proxProp.setPosition(state.x, state.y)
        const t = Math.max(0, Math.min(1, (10 - len) / 10))
        state.proxProp.setGain(0.4 * t)
      }

      // Touch player → kill.
      if ((p.x - state.x) ** 2 + (p.y - state.y) ** 2 < (OTTO_RADIUS + P().RADIUS) ** 2) {
        P().die('otto')
      }
    }
  }

  function isAlive() { return state.alive }
  function getPosition() { return {x: state.x, y: state.y} }
  function spawnedThisRoom() { return state.spawnedThisRoom }

  function reset() {
    state.alive = false
    state.persistent = false
    state.spawnedThisRoom = false
    state.spawnTimer = 0
    state.bouncePhase = 0
    state.halfPhase = 0
    clearProxProp()
  }

  return {
    state,
    enterRoom,
    update,
    spawn,
    isAlive,
    getPosition,
    spawnedThisRoom,
    reset,
    OTTO_SPEED,
    OTTO_RADIUS,
  }
})()
