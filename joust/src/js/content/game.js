// JOUST real-time logic.
//
// You ride a mount over a wrapping strip of air with a solid deck and a hard
// roof. You have no altitude control, only a wing: each flap buys height
// against constant gravity. Enemy riders share the air with you, and when two
// riders touch, the HIGHER one wins outright — no health, no hit points, just
// who was above whom at the moment of contact. The loser drops an egg, which
// falls to the deck and starts ticking; collect it for points or let it hatch
// into a meaner rider than the one you just killed.
//
// Geometry: `x` runs along the strip and wraps at ARENA_WIDTH; `y` is altitude
// above the deck, 0 to CEILING. Every horizontal offset in the game is taken
// the short way round via constants.wrapDx, so the seam never matters.
//
// What this module hands the audio layer, and why it is shaped this way:
//   - `dx`, the wrapped horizontal offset, which becomes a binaural position
//   - `dAlt`, how far above YOU the thing is, which becomes a PITCH
// Those two are the entire interface. Altitude is never given as a position,
// only ever as a pitch offset, because that is what keeps the two axes from
// competing for the same perceptual channel.
//
// This module owns state and emits events. The game screen turns events into
// binaural audio and screen-reader announcements. Audio is the source of truth.
content.game = (() => {
  const K = () => content.constants
  const E = () => content.events

  const state = {
    phase: 'ready',     // ready | play | break | dying | pending | over
    readyTimer: 0,
    phaseTimer: 0,
    reason: null,

    // the player
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    thrust: 0,          // -1/0/+1 held sideways input
    onGround: true,
    flapTimer: 0,
    stun: 0,            // the wing will not answer while this is running
    invuln: 0,
    alive: true,

    lives: 0,
    score: 0,
    wave: 0,
    waveTime: 0,
    eggStreak: 0,
    kills: 0,
    eggs: 0,
    hatched: 0,
    nextExtraLife: 0,
    elapsed: 0,
  }

  let riders = []
  let eggs = []
  let spawnQueue = []     // riders waiting to arrive, staggered
  let spawnTimer = 0
  let nextId = 1

  // ---- spawning ---------------------------------------------------------------
  // Riders arrive somewhere you are not, at a comfortable altitude, and are
  // staggered over a few seconds so a wave feels like an arrival rather than an
  // ambush.
  function spawnPointAwayFromPlayer() {
    const k = K()
    for (let i = 0; i < 24; i++) {
      const x = k.rand(0, k.ARENA_WIDTH)
      if (Math.abs(k.wrapDx(state.x, x)) >= k.SPAWN_MIN_DIST) return x
    }
    // Fall back to the far side of the strip.
    return k.wrapX(state.x + k.ARENA_WIDTH / 2)
  }

  function makeRider(type, x, y) {
    const k = K()
    const spec = k.RIDER_TYPES[type]
    return {
      id: nextId++,
      type,
      spec,
      x: x != null ? x : spawnPointAwayFromPlayer(),
      y: y != null ? y : k.rand(k.AI_WANDER_ALT[0], k.AI_WANDER_ALT[1]),
      vx: (Math.random() < 0.5 ? -1 : 1) * k.rand(4, spec.speed * 0.5),
      vy: 0,
      onGround: false,
      alive: true,
      // Behaviour
      mode: 'wander',
      modeTimer: k.rand(k.AI_WANDER_TIME[0], k.AI_WANDER_TIME[1]),
      targetY: k.rand(k.AI_WANDER_ALT[0], k.AI_WANDER_ALT[1]),
      above: k.rand(k.AI_ABOVE[0], k.AI_ABOVE[1]),
      wanderDir: Math.random() < 0.5 ? -1 : 1,
      flapTimer: Math.random() * 0.6,
      // Audio: the wing beat is rate-coded, so each rider carries its own clock.
      beatTimer: Math.random() * 0.5,
      duelCooldown: 0,
    }
  }

  function queueWave(n) {
    const k = K()
    const count = k.waveCount(n)
    const tiers = k.waveTiers(n)
    spawnQueue = []
    for (let i = 0; i < count; i++) {
      spawnQueue.push(k.pickWeighted(tiers) || 'bounder')
    }
    spawnTimer = 0.5
  }

  function startWave(n) {
    const k = K()
    state.wave = n
    state.waveTime = 0
    state.eggStreak = 0
    riders = []
    eggs = []
    queueWave(n)
    E().emit('wave-start', {wave: n, riders: spawnQueue.length})
  }

  // How much faster everything left alive is moving, because the wave has
  // dragged on. Pressure without a new mechanic.
  function hurryMult() {
    const k = K()
    const over = state.waveTime - k.WAVE_HURRY
    if (over <= 0) return 1
    return k.lerp(1, k.WAVE_HURRY_MULT, over / k.WAVE_HURRY_RAMP)
  }

  // ---- the player -------------------------------------------------------------
  // The wing. Edge-triggered: holding the key does nothing, which is the whole
  // feel of the original. FLAP_COOLDOWN caps how fast you can pump it, so a
  // climb costs sustained attention rather than one keypress.
  function flap() {
    const k = K()
    if (state.phase !== 'play' || !state.alive) return false
    // A bang on the roof costs you the wing for a moment, which is what stops
    // the ceiling from being a place you can simply sit.
    if (state.stun > 0) return false
    if (state.flapTimer > 0) return false
    state.flapTimer = k.FLAP_COOLDOWN
    state.vy = Math.min(k.CLIMB_MAX, state.vy + k.FLAP_IMPULSE)
    if (state.onGround) state.onGround = false
    E().emit('flap', {altitude: state.y, onGround: false})
    return true
  }

  function setThrust(dir) {
    state.thrust = dir < 0 ? -1 : (dir > 0 ? 1 : 0)
  }

  function updatePlayer(delta) {
    const k = K()
    if (!state.alive) return

    if (state.flapTimer > 0) state.flapTimer = Math.max(0, state.flapTimer - delta)
    if (state.stun > 0) state.stun = Math.max(0, state.stun - delta)
    if (state.invuln > 0) {
      state.invuln = Math.max(0, state.invuln - delta)
      if (state.invuln === 0) E().emit('invuln-end', {})
    }

    const wasGround = state.onGround

    // Horizontal: thrust, then drag, then a hard cap. Air control is weak on
    // purpose — momentum is what makes a mistimed approach unrecoverable.
    const thrust = state.onGround ? k.THRUST_GROUND : k.THRUST_AIR
    const drag = state.onGround ? k.DRAG_GROUND : k.DRAG_AIR
    const cap = state.onGround ? k.SPEED_MAX_GROUND : k.SPEED_MAX_AIR
    state.vx += (state.thrust || 0) * thrust * delta
    state.vx -= state.vx * drag * delta
    state.vx = k.clamp(state.vx, -cap, cap)
    state.x = k.wrapX(state.x + state.vx * delta)

    // Vertical: gravity always, and whatever the wing last bought you.
    if (!state.onGround) {
      state.vy -= k.GRAVITY * delta
      state.vy = k.clamp(state.vy, -k.FALL_MAX, k.CLIMB_MAX)
      state.y += state.vy * delta
    }

    if (state.y >= k.CEILING) {
      // The roof, and it is not a soft stop. You are thrown back down and your
      // wing stops answering for half a second. Without this, the ceiling would
      // be the winning move in the whole game: riders steer for a point above
      // you and cannot steer above the roof, so a player parked against it
      // could never lose a collision.
      state.y = k.CEILING
      if (state.vy > 0) {
        state.vy = -k.CEILING_BOUNCE
        state.stun = k.CEILING_STUN
        E().emit('ceiling', {})
      }
    }

    if (state.y <= 0) {
      state.y = 0
      state.vy = 0
      if (!state.onGround) {
        state.onGround = true
        E().emit('land', {speed: Math.abs(state.vx)})
      }
    } else if (state.onGround && state.vy > 0) {
      state.onGround = false
    }

    if (wasGround && !state.onGround) state.onGround = false
  }

  // ---- the riders -------------------------------------------------------------
  // A rider alternates between CHASE and WANDER. Chasing, it steers for a point
  // a little above the player, because being higher is how it wins — which is
  // why the answer to being hunted is always to climb, and climbing is work.
  function updateRider(r, delta) {
    const k = K()
    const mult = hurryMult()

    // Once the wave has dragged on far enough, nobody wanders any more. This is
    // what makes stalling lose: you cannot outlast a wave, only clear it.
    const committed = mult >= 1 + (k.WAVE_HURRY_MULT - 1) * k.WAVE_HURRY_COMMIT
    if (committed && r.mode !== 'chase') {
      r.mode = 'chase'
      r.modeTimer = 999
      r.above = k.rand(k.AI_ABOVE[0], k.AI_ABOVE[1])
    }

    r.modeTimer -= delta
    if (r.modeTimer <= 0) {
      if (r.mode === 'chase' && !committed) {
        r.mode = 'wander'
        r.modeTimer = k.rand(k.AI_WANDER_TIME[0], k.AI_WANDER_TIME[1])
        r.targetY = k.rand(k.AI_WANDER_ALT[0], k.AI_WANDER_ALT[1])
        r.wanderDir = Math.random() < 0.5 ? -1 : 1
      } else if (!committed) {
        // Whether it comes for you at all is its aggression. A wave of bounders
        // mostly mills about; a wave of shadow lords is a pack.
        const comes = Math.random() < r.spec.aggression
        r.mode = comes ? 'chase' : 'wander'
        r.modeTimer = comes
          ? k.rand(k.AI_CHASE_TIME[0], k.AI_CHASE_TIME[1])
          : k.rand(k.AI_WANDER_TIME[0], k.AI_WANDER_TIME[1])
        if (comes) r.above = k.rand(k.AI_ABOVE[0], k.AI_ABOVE[1])
        else { r.targetY = k.rand(k.AI_WANDER_ALT[0], k.AI_WANDER_ALT[1]); r.wanderDir = Math.random() < 0.5 ? -1 : 1 }
      } else {
        r.modeTimer = 999
      }
    }

    let wantDir
    let wantY
    if (r.mode === 'chase' && state.alive) {
      const dx = k.wrapDx(r.x, state.x)
      wantDir = dx === 0 ? 0 : (dx > 0 ? 1 : -1)
      wantY = k.clamp(state.y + r.above, 4, k.CEILING - 4)
    } else {
      wantDir = r.wanderDir
      wantY = r.targetY
    }

    // Horizontal.
    const speed = r.spec.speed * mult
    r.vx += wantDir * k.THRUST_AIR * 0.9 * delta
    r.vx -= r.vx * k.DRAG_AIR * delta
    r.vx = k.clamp(r.vx, -speed, speed)
    r.x = k.wrapX(r.x + r.vx * delta)

    // Vertical: riders fly with the same wing you do, so their altitude bobs
    // between flaps. That bob is audible as a wavering pitch, which is what
    // makes them sound alive rather than placed.
    // Riders fly on the same wing model you do: a discrete beat on a fixed
    // cooldown, capped by the tier's `climb`. Note this is deliberately NOT
    // r.spec.flap — that number is the wing beat you HEAR, and using it here
    // meant a bounder could not generate enough lift to stay in the air.
    const climb = r.spec.climb * mult
    r.flapTimer -= delta
    if (r.y < wantY - k.AI_DEADBAND && r.flapTimer <= 0) {
      r.flapTimer = k.RIDER_FLAP_COOLDOWN
      r.vy = Math.min(climb, r.vy + k.FLAP_IMPULSE)
    }
    r.vy -= k.GRAVITY * delta
    r.vy = k.clamp(r.vy, -k.FALL_MAX, climb)
    r.y += r.vy * delta

    if (r.y >= k.CEILING) { r.y = k.CEILING; if (r.vy > 0) r.vy = -k.CEILING_BOUNCE }
    if (r.y <= 0) {
      r.y = 0
      if (r.vy < 0) r.vy = 0
      r.onGround = true
      // Riders do not linger on the deck; give them a beat to get airborne.
      if (r.flapTimer <= 0) { r.flapTimer = k.RIDER_FLAP_COOLDOWN; r.vy = k.FLAP_IMPULSE }
    } else {
      r.onGround = false
    }

    if (r.duelCooldown > 0) r.duelCooldown = Math.max(0, r.duelCooldown - delta)
  }

  // ---- the duel ---------------------------------------------------------------
  // The one rule the whole game is built on: inside the collision box, the
  // higher rider wins. Everything else — the flap physics, the pitch mapping,
  // the eggs — exists to make this one comparison the thing you are listening
  // for.
  function updateDuels(delta) {
    const k = K()
    if (!state.alive) return

    for (const r of riders) {
      if (!r.alive) continue
      const dx = k.wrapDx(state.x, r.x)
      const dAlt = r.y - state.y
      if (Math.abs(dx) > k.DUEL_RADIUS_X || Math.abs(dAlt) > k.DUEL_RADIUS_Y) continue
      if (r.duelCooldown > 0) continue

      const outcome = k.duelOutcome(dAlt)
      r.duelCooldown = k.DUEL_COOLDOWN

      if (outcome < 0) {
        killRider(r, dx, dAlt)
      } else if (outcome > 0) {
        if (state.invuln > 0) {
          bounce(r, dx, dAlt, true)
        } else {
          playerDies('unhorsed', {dx, dAlt, type: r.type})
          return
        }
      } else {
        bounce(r, dx, dAlt, false)
      }
    }
  }

  // A tie. Both are thrown apart and lifted a little, so a bounce is a reset
  // rather than a death sentence — and it is the sound you learn to want when
  // you have misjudged a closing rider.
  function bounce(r, dx, dAlt, shielded) {
    const k = K()
    const push = dx >= 0 ? -1 : 1
    state.vx = push * k.BOUNCE_SPEED
    state.vy = Math.max(state.vy, k.BOUNCE_LIFT)
    state.onGround = false
    r.vx = -push * k.BOUNCE_SPEED
    r.vy = Math.max(r.vy, k.BOUNCE_LIFT)
    E().emit('bounce', {dx, dAlt, type: r.type, shielded: !!shielded})
  }

  function killRider(r, dx, dAlt) {
    const k = K()
    r.alive = false
    state.kills++
    addScore(r.spec.score)
    // The egg inherits some of its rider's momentum, then falls.
    eggs.push({
      id: nextId++,
      type: r.type,
      x: r.x,
      y: r.y,
      vx: r.vx * 0.4,
      vy: 0,
      landed: false,
      life: 0,
      tickTimer: 0,
    })
    E().emit('kill', {
      dx, dAlt, type: r.type, score: r.spec.score, total: state.score,
      remaining: riders.filter((o) => o.alive).length + spawnQueue.length,
    })
  }

  function playerDies(reason, info) {
    const k = K()
    if (!state.alive) return
    state.alive = false
    state.lives--
    state.phase = 'dying'
    state.phaseTimer = k.RESPAWN_DELAY
    state.reason = reason
    E().emit('death', {...(info || {}), reason, lives: state.lives})
    if (state.lives <= 0) {
      state.phase = 'pending'
      state.phaseTimer = 2.4
      state.score = Math.max(0, Math.round(state.score))
      E().emit('doom', {reason})
    }
  }

  function respawn() {
    const k = K()
    state.x = spawnPointAwayFromPlayer()
    state.y = k.rand(30, 55)
    state.vx = 0
    state.vy = 0
    state.thrust = 0
    state.onGround = false
    state.flapTimer = 0
    state.stun = 0
    state.invuln = k.SPAWN_INVULN
    state.alive = true
    state.phase = 'play'
    E().emit('respawn', {lives: state.lives, invuln: state.invuln})
  }

  // ---- eggs -------------------------------------------------------------------
  // An egg falls, lands, and ticks. The tick accelerates as the hatch nears, so
  // the timer is something you hear rather than something you read — and
  // because pitch is altitude, a falling egg's own voice descends as it drops,
  // which is the mapping doing its job for free.
  function updateEggs(delta) {
    const k = K()
    // Rank the landed eggs by distance once per frame, so the tick budget below
    // is a stable "nearest few" rather than whichever happened to fire first.
    const tickRank = new Map()
    eggs.filter((e) => e.landed && !e.collected && !e.hatched)
      .map((e) => ({id: e.id, d: Math.abs(k.wrapDx(state.x, e.x))}))
      .sort((a, b) => a.d - b.d)
      .forEach((e, i) => tickRank.set(e.id, i))

    for (const e of eggs) {
      if (e.collected || e.hatched) continue

      if (!e.landed) {
        e.vx -= e.vx * k.EGG_DRAG * delta
        e.x = k.wrapX(e.x + e.vx * delta)
        e.vy -= k.EGG_GRAVITY * delta
        e.vy = Math.max(-k.EGG_FALL_MAX, e.vy)
        e.y += e.vy * delta
        if (e.y <= 0) {
          e.y = 0
          e.vy = 0
          e.vx = 0
          e.landed = true
          E().emit('egg-land', {dx: k.wrapDx(state.x, e.x), dAlt: -state.y, type: e.type})
        }
      } else {
        e.life += delta
        if (e.life >= k.EGG_HATCH_TIME) {
          hatch(e)
          continue
        }
        e.tickTimer -= delta
        if (e.tickTimer <= 0) {
          e.tickTimer = k.eggTickInterval(e.life / k.EGG_HATCH_TIME)
          // A deck full of eggs is a drum machine, so only the nearest few are
          // allowed a voice. An egg about to hatch always gets one regardless
          // of rank: that is precisely the one you need to be told about, and
          // it is usually not the nearest.
          const urgent = (k.EGG_HATCH_TIME - e.life) <= k.EGG_TICK_URGENT
          if (urgent || tickRank.get(e.id) < k.EGG_TICK_MAX_VOICES) {
            E().emit('egg-tick', {
              dx: k.wrapDx(state.x, e.x),
              dAlt: -state.y,
              progress: e.life / k.EGG_HATCH_TIME,
              type: e.type,
              urgent,
            })
          }
        }
      }

      // Collecting. Generous, because the reward for a clean kill should not be
      // a second precision task.
      if (!state.alive) continue
      const dx = k.wrapDx(state.x, e.x)
      const dAlt = e.y - state.y
      if (Math.abs(dx) <= k.EGG_RADIUS_X && Math.abs(dAlt) <= k.EGG_RADIUS_Y) {
        e.collected = true
        const tier = Math.min(state.eggStreak, k.EGG_SCORES.length - 1)
        const value = k.EGG_SCORES[tier]
        state.eggStreak++
        state.eggs++
        addScore(value)
        E().emit('egg-collect', {
          dx, dAlt, type: e.type, score: value, streak: state.eggStreak, total: state.score,
        })
      }
    }
    eggs = eggs.filter((e) => !e.collected && !e.hatched)
  }

  // The punishment for ignoring an egg: back it comes, one tier meaner, and the
  // egg streak you were building resets.
  function hatch(e) {
    const k = K()
    e.hatched = true
    state.eggStreak = 0
    state.hatched++
    const type = k.nextTier(e.type)
    const r = makeRider(type, e.x, 2)
    r.mode = 'chase'
    r.modeTimer = k.rand(k.AI_CHASE_TIME[0], k.AI_CHASE_TIME[1])
    riders.push(r)
    E().emit('hatch', {dx: k.wrapDx(state.x, e.x), dAlt: -state.y, from: e.type, type})
  }

  // ---- scoring ----------------------------------------------------------------
  function addScore(n) {
    const k = K()
    state.score += n
    while (state.score >= state.nextExtraLife) {
      state.lives++
      state.nextExtraLife += k.EXTRA_LIFE_EVERY
      E().emit('extra-life', {lives: state.lives, at: state.score})
    }
  }

  // ---- the wing beats the audio layer plays -----------------------------------
  // Every rider is heard as its wing beat: a short pitched flap, binaural at its
  // position, at its tier's natural rate multiplied up as it closes. The rate
  // ramp is the alarm. Riders inside SUSTAIN_FAR additionally grow a sustained
  // tone (handled by the per-frame event below), so the one you are about to
  // fight can be tracked continuously instead of sampled.
  function updateBeats(delta) {
    const k = K()
    // How many riders are competing for the same layer. Everything in the arena
    // is within hearing (the strip is only two HEAR_RANGEs around), so this is
    // simply how many are alive — and it is what lets the audio layer hold the
    // wing-beat layer at a constant total loudness instead of letting eight
    // riders sum into a wall.
    const crowd = riders.reduce((n, r) => n + (r.alive ? 1 : 0), 0)
    for (const r of riders) {
      if (!r.alive) continue
      const dx = k.wrapDx(state.x, r.x)
      const dist = Math.abs(dx)
      r.beatTimer -= delta
      if (r.beatTimer > 0) continue
      r.beatTimer = 1 / k.beatRate(r.type, dist)
      E().emit('beat', {
        id: r.id,
        dx,
        dAlt: r.y - state.y,
        dist,
        type: r.type,
        chasing: r.mode === 'chase',
        crowd,
      })
    }
  }

  // ---- lifecycle --------------------------------------------------------------
  function reset() {
    const k = K()
    state.phase = 'ready'
    state.readyTimer = 3.0
    state.reason = null

    state.x = 0
    state.y = 45
    state.vx = 0
    state.vy = 0
    state.thrust = 0
    state.onGround = false
    state.flapTimer = 0
    state.stun = 0
    state.invuln = k.SPAWN_INVULN
    state.alive = true

    state.lives = k.LIVES
    state.score = 0
    state.wave = 0
    state.waveTime = 0
    state.eggStreak = 0
    state.kills = 0
    state.eggs = 0
    state.hatched = 0
    state.nextExtraLife = k.EXTRA_LIFE_EVERY
    state.elapsed = 0

    riders = []
    eggs = []
    spawnQueue = []
    spawnTimer = 0
    nextId = 1

    E().emit('run-start', {})
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
        startWave(1)
      }
      return
    }

    if (state.phase === 'dying') {
      state.phaseTimer -= delta
      // The world keeps moving while you are down, so you come back into a
      // situation rather than a freeze-frame.
      for (const r of riders) if (r.alive) updateRider(r, delta)
      updateEggs(delta)
      emitFrame()
      if (state.phaseTimer <= 0) respawn()
      return
    }

    if (state.phase === 'break') {
      state.phaseTimer -= delta
      updatePlayer(delta)
      emitFrame()
      if (state.phaseTimer <= 0) {
        state.phase = 'play'
        startWave(state.wave + 1)
      }
      return
    }

    if (state.phase === 'play') {
      state.elapsed += delta
      state.waveTime += delta

      // Staggered arrivals.
      if (spawnQueue.length) {
        spawnTimer -= delta
        if (spawnTimer <= 0) {
          spawnTimer = k.SPAWN_STAGGER
          const type = spawnQueue.shift()
          const r = makeRider(type)
          riders.push(r)
          E().emit('arrive', {dx: k.wrapDx(state.x, r.x), dAlt: r.y - state.y, type})
        }
      }

      updatePlayer(delta)
      for (const r of riders) if (r.alive) updateRider(r, delta)
      updateDuels(delta)
      if (state.phase !== 'play') return
      updateEggs(delta)
      riders = riders.filter((r) => r.alive)
      updateBeats(delta)
      emitFrame()

      // A wave is over when the air is clear AND the deck is clear: an egg you
      // never went back for keeps the wave alive until it hatches, which is the
      // cost of ignoring it.
      if (!riders.length && !eggs.length && !spawnQueue.length) {
        const bonus = k.WAVE_BONUS * state.wave
        addScore(bonus)
        state.phase = 'break'
        state.phaseTimer = k.WAVE_BREAK
        E().emit('wave-clear', {wave: state.wave, bonus, total: state.score})
      }
      return
    }

    if (state.phase === 'pending') {
      state.phaseTimer -= delta
      for (const r of riders) if (r.alive) updateRider(r, delta)
      if (state.phaseTimer <= 0) {
        state.phase = 'over'
        E().emit('game-over', {
          score: state.score,
          wave: state.wave,
          kills: state.kills,
          eggs: state.eggs,
          reason: state.reason,
        })
      }
    }
  }

  // The per-frame packet: everything with a continuous voice, plus the handful
  // of scalars the ambience tracks. Riders are sorted nearest-first and only
  // the ones close enough to have earned a sustained tone are included, so the
  // continuous layer can never become a wash.
  function emitFrame() {
    const k = K()
    const near = riders
      .filter((r) => r.alive)
      .map((r) => {
        const dx = k.wrapDx(state.x, r.x)
        return {
          id: r.id,
          dx,
          dAlt: r.y - state.y,
          dist: Math.abs(dx),
          type: r.type,
          chasing: r.mode === 'chase',
          weight: k.sustainWeight(Math.abs(dx)),
        }
      })
      .filter((r) => r.weight > 0)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, k.SUSTAIN_MAX_VOICES)

    E().emit('frame', {
      riders: near,
      // A falling egg gets a continuous voice because its descent IS the pitch
      // mapping in miniature, and it is worth hearing all the way down.
      falling: eggs.filter((e) => !e.landed)
        .map((e) => ({
          id: e.id,
          dx: k.wrapDx(state.x, e.x),
          dAlt: e.y - state.y,
          dist: Math.abs(k.wrapDx(state.x, e.x)),
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, k.FALLING_EGG_MAX_VOICES),
      altitude: state.y,
      vy: state.vy,
      speed: Math.abs(state.vx),
      onGround: state.onGround,
      alive: state.alive,
      invuln: state.invuln,
      groundNear: k.clamp(1 - state.y / k.GROUND_WARN, 0, 1),
      ceilingNear: k.clamp(1 - (k.CEILING - state.y) / k.CEILING_WARN, 0, 1),
      // The nastiest thing currently above you, 0..1, for the music bed.
      threat: threatLevel(),
    })
  }

  // How much trouble you are in: the closest rider that is ABOVE you, weighted
  // by how close it is. A rider below you is not a threat, it is a target, so
  // it contributes nothing.
  function threatLevel() {
    const k = K()
    let worst = 0
    for (const r of riders) {
      if (!r.alive) continue
      const dAlt = r.y - state.y
      if (dAlt <= k.DUEL_MARGIN) continue
      const dist = Math.abs(k.wrapDx(state.x, r.x))
      const near = k.clamp(1 - dist / (k.SUSTAIN_FAR * 1.4), 0, 1)
      const height = k.clamp(dAlt / 25, 0, 1)
      worst = Math.max(worst, near * (0.5 + height * 0.5) * (0.6 + r.spec.aggression * 0.4))
    }
    return k.clamp(worst, 0, 1)
  }

  // ---- readouts for the screen (F1/F2/F3, HUD, viz) ---------------------------

  // F2's subject: the rider that most needs a decision, which is the nearest
  // one, whichever side of you it is on.
  function nearestRider() {
    const k = K()
    let best = null
    let bestDist = Infinity
    for (const r of riders) {
      if (!r.alive) continue
      const dist = Math.abs(k.wrapDx(state.x, r.x))
      if (dist < bestDist) { bestDist = dist; best = r }
    }
    if (!best) return null
    const dx = k.wrapDx(state.x, best.x)
    const dAlt = best.y - state.y
    return {
      id: best.id,
      type: best.type,
      dx,
      dAlt,
      dist: bestDist,
      chasing: best.mode === 'chase',
      // The verdict, spelled out: what happens if you touch it right now.
      outcome: k.duelOutcome(dAlt),
      // ...and how much altitude you would have to find to flip it.
      climbNeeded: Math.max(0, dAlt + k.DUEL_MARGIN),
    }
  }

  function riderList() {
    const k = K()
    return riders
      .filter((r) => r.alive)
      .map((r) => {
        const dx = k.wrapDx(state.x, r.x)
        return {
          id: r.id,
          type: r.type,
          dx,
          dAlt: r.y - state.y,
          dist: Math.abs(dx),
          chasing: r.mode === 'chase',
          outcome: k.duelOutcome(r.y - state.y),
        }
      })
      .sort((a, b) => a.dist - b.dist)
  }

  function eggList() {
    const k = K()
    return eggs.map((e) => {
      const dx = k.wrapDx(state.x, e.x)
      return {
        id: e.id,
        type: e.type,
        dx,
        dAlt: e.y - state.y,
        dist: Math.abs(dx),
        landed: e.landed,
        progress: e.landed ? e.life / k.EGG_HATCH_TIME : 0,
        timeLeft: e.landed ? Math.max(0, k.EGG_HATCH_TIME - e.life) : k.EGG_HATCH_TIME,
      }
    }).sort((a, b) => a.dist - b.dist)
  }

  function status() {
    const k = K()
    return {
      score: Math.max(0, Math.round(state.score)),
      lives: state.lives,
      wave: state.wave,
      kills: state.kills,
      eggs: state.eggs,
      hatched: state.hatched,
      altitude: state.y,
      altitudeFrac: k.clamp(state.y / k.CEILING, 0, 1),
      vy: state.vy,
      speed: state.vx,
      onGround: state.onGround,
      alive: state.alive,
      invuln: state.invuln,
      stun: state.stun,
      // The two absolute-height cues, computed once here so the audio layer and
      // the frame event cannot drift apart.
      groundNear: k.clamp(1 - state.y / k.GROUND_WARN, 0, 1),
      ceilingNear: k.clamp(1 - (k.CEILING - state.y) / k.CEILING_WARN, 0, 1),
      riders: riders.filter((r) => r.alive).length,
      pending: spawnQueue.length,
      eggsOut: eggs.length,
      eggStreak: state.eggStreak,
      threat: threatLevel(),
      hurry: hurryMult(),
    }
  }

  return {
    state,
    reset,
    update,
    flap,
    setThrust,
    isPlaying: () => state.phase === 'play',
    phase: () => state.phase,
    getAltitude: () => state.y,
    getSpeed: () => state.vx,
    isOnGround: () => state.onGround,
    isAlive: () => state.alive,
    nearestRider,
    riderList,
    eggList,
    riderCount: () => riders.filter((r) => r.alive).length,
    eggCount: () => eggs.length,
    status,
  }
})()
