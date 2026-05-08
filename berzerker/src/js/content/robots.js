// Robots — three classes with distinct pitch families so multiple instances
// stay individually trackable, and intentionally dumb AI (no pathfinding;
// greedy step toward the player). Killing yourself on a wall is a
// frequent and authentic Berzerk death for both the player and robots.
content.robots = (() => {
  const A = () => content.audio
  const E = () => content.events
  const R = () => content.room
  const P = () => content.player
  const SFX = () => content.sfx
  const VOICE = () => content.voice

  // Per-class definitions. baseHz drives footstep + laser pitch family;
  // drift adds per-instance random spread so 6 grunts have 6 distinct
  // cadences. losFireRate is shots/sec when LOS holds. accuracyDeg is the
  // half-width (degrees) of the firing cone.
  const CLASS_DEFS = {
    grunt:  {baseHz: 220, drift: 0.10, speed: 1.8, fireRate: 0.7,  accuracyDeg: 20, voicePitch: 110},
    flank:  {baseHz: 330, drift: 0.08, speed: 2.6, fireRate: 0.9,  accuracyDeg: 12, voicePitch: 130},
    sniper: {baseHz: 165, drift: 0.06, speed: 1.2, fireRate: 0.45, accuracyDeg: 5,  voicePitch: 90},
  }

  const RADIUS = 0.36
  const FOOTSTEP_PERIOD_BASE = 0.32 // seconds between steps at speed=1.8

  // Level-scaling: a saturating coefficient m ∈ [0, 1) that climbs fast at
  // first then plateaus, so room 1 feels gentle and room ~15 feels mean
  // without ever blowing up. m(1)=0.12, m(5)=0.46, m(10)=0.71, m(20)=0.92.
  function menace(depth) { return 1 - Math.exp(-(depth || 1) / 8) }

  // Engagement is also the audibility radius — a robot that the player
  // can't yet hear (its rolling voice is below the noise floor at this
  // distance) MUST NOT fire. Sniper class is the deliberate exception:
  // they reach further, which is why they're capped at a small minority
  // of the spawn pool.
  const AUDIBLE_BASE = 7,  AUDIBLE_GAIN = 5      // 7 → 12 tiles across levels
  const SNIPER_RANGE_MUL = 1.7                   // snipers reach ~12 → 20 tiles
  const LASER_SPEED_BASE = 8,  LASER_SPEED_GAIN = 4   // 8 → 12 t/s
  const LASER_TTL_BASE = 1.15, LASER_TTL_GAIN = 0.55  // 1.15 → 1.70 s
  const ACCURACY_TIGHTEN = 0.30                       // late-game accuracy ×0.7

  // Stashed by spawnWave so update()/fireLaser() can read the current depth
  // without threading it through every call.
  let currentDepth = 1
  function depthScaling() {
    const m = menace(currentDepth)
    return {
      m,
      audible: AUDIBLE_BASE + AUDIBLE_GAIN * m,
      laserSpeed: LASER_SPEED_BASE + LASER_SPEED_GAIN * m,
      laserTtl: LASER_TTL_BASE + LASER_TTL_GAIN * m,
      accuracyMul: 1 - ACCURACY_TIGHTEN * m,
    }
  }

  let robots = []
  let projectiles = [] // robot lasers
  let nextId = 1
  let projectileId = 1

  // Robots have no continuous voice: their presence is communicated by
  // discrete mechanical-clank footsteps (see sfx.robotFootstep) so the ear
  // hears "something is walking here" rather than a held buzz that could
  // be confused with the wall ambient. Cadence (period scales with class
  // speed) and pitch family (baseHz per class) keep grunt/flank/sniper
  // individually identifiable.

  // Per-projectile in-flight voice. Single square carrier at the canonical
  // arcade-laser pitch (~880 Hz), with a fast vibrato (60 Hz / ±90 cents)
  // that gives the buzzy sci-fi "pew" timbre — and a small noise sizzle
  // riding on top so the beam reads as energetic plasma rather than a
  // pure pitched tone. Pitch is intentionally INDEPENDENT of the shooter's
  // baseHz family (the muzzle one-shot in `sfx.robotLaser` already varies
  // by class); a beam in flight is a beam in flight.
  function buildProjectileVoice() {
    return (out, mod) => {
      const ctx = engine.context()
      const carrierHz = 880

      // Carrier — square wave is the classic arcade laser tone.
      const o = ctx.createOscillator()
      o.type = 'square'
      o.frequency.value = carrierHz
      if (mod && mod.detune) {
        try { mod.detune.connect(o.detune) } catch (_) {}
      }

      // Fast vibrato LFO modulating the carrier's detune — this is what
      // turns a held square into a "pew/zap" buzz instead of a flat note.
      const vib = ctx.createOscillator()
      vib.type = 'sine'
      vib.frequency.value = 60
      const vibGain = ctx.createGain()
      vibGain.gain.value = 90 // cents
      vib.connect(vibGain).connect(o.detune)

      // Bandpass to thin and brighten the square; without it the carrier
      // sounds too thick and chord-like in the mix.
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = carrierHz * 1.3
      bp.Q.value = 5

      const og = ctx.createGain()
      og.gain.value = 0.45
      o.connect(bp).connect(og).connect(out)

      // Sizzle layer — narrowband noise around the carrier for plasma fizz.
      const n = ctx.createBufferSource()
      n.buffer = engine.buffer.whiteNoise({channels: 1, duration: 2.5})
      n.loop = true
      const nbp = ctx.createBiquadFilter()
      nbp.type = 'bandpass'
      nbp.frequency.value = carrierHz * 1.6
      nbp.Q.value = 7
      const ng = ctx.createGain()
      ng.gain.value = 0.18
      n.connect(nbp).connect(ng).connect(out)

      o.start(); vib.start(); n.start()
      return () => {
        try { o.stop() } catch (_) {}
        try { vib.stop() } catch (_) {}
        try { n.stop() } catch (_) {}
      }
    }
  }

  function startProjectileVoice(pr) {
    try {
      pr.voiceProp = A().makeProp({
        build: buildProjectileVoice(),
        x: pr.x, y: pr.y,
        gain: 0,
        normalize: true, // proximity gain controls presence; normalize keeps far beams audible
        // Key so audio.frame() updates the binaural — without it, the
        // voice spatializes at the firing position forever.
        key: 'proj-' + pr.id,
      })
    } catch (_) {}
  }

  function destroyProjectileVoice(pr) {
    if (!pr.voiceProp) return
    // Zero the gain first so the sound is silent immediately even if the
    // node teardown is delayed by the audio thread. Otherwise a frozen
    // beam keeps droning after a wall hit / player death.
    try { pr.voiceProp.setGain(0) } catch (_) {}
    try { pr.voiceProp.destroy() } catch (_) {}
    pr.voiceProp = null
  }

  function clear() {
    for (const pr of projectiles) destroyProjectileVoice(pr)
    robots = []
    projectiles = []
  }

  // Personality multipliers (CLAUDE.md "Per-AI personality randomization").
  function rand(min, max) { return min + Math.random() * (max - min) }

  function spawnAt(kind, x, y) {
    const def = CLASS_DEFS[kind]
    const pitchJitter = (Math.random() * 2 - 1) * def.drift
    const baseHz = def.baseHz * Math.pow(2, pitchJitter)
    const aggression = rand(0.7, 1.3)
    const cooldownMul = rand(0.85, 1.15)
    const r = {
      id: nextId++,
      kind,
      x, y,
      px: x, py: y, // last frame's position (for movement detection)
      vx: 0, vy: 0,
      baseHz,
      voicePitch: def.voicePitch * (1 + (Math.random() - 0.5) * 0.1),
      speed: def.speed,
      fireRate: def.fireRate * aggression,
      cooldown: rand(0.5, 1.5) * cooldownMul,
      accuracyRad: (def.accuracyDeg * Math.PI / 180),
      lastFootstep: 0,
      lastBarkAt: 0,
      alive: true,
      stuck: 0,
    }
    robots.push(r)
    return r
  }

  // Wave spawn — 4 base + scaling, biased toward harder classes with depth.
  // Snipers are the long-range exception to "must be audible to fire", so
  // their share is capped low (≤ ~18%) and ramps slowly with depth — at
  // most 1–2 in a typical room.
  function spawnWave(depth) {
    currentDepth = depth || 1
    clear()
    const count = Math.min(10, 4 + Math.floor(depth * 0.7))
    const tries = count * 12
    let placed = 0
    let attempts = 0
    while (placed < count && attempts < tries) {
      attempts++
      const cx = 2 + Math.floor(Math.random() * (R().cols() - 4))
      const cy = 2 + Math.floor(Math.random() * (R().rows() - 4))
      // Reject if on a wall, near spawn, or near another robot.
      if (R().isWall(cx, cy)) continue
      const sp = R().spawn()
      const dsx = cx - sp.x, dsy = cy - sp.y
      if (dsx * dsx + dsy * dsy < 36) continue
      let nearOther = false
      for (const r of robots) {
        const dx = r.x - cx, dy = r.y - cy
        if (dx * dx + dy * dy < 9) { nearOther = true; break }
      }
      if (nearOther) continue
      // Class roll: shifts toward flank/sniper as depth increases.
      // Sniper bias capped low (rare-but-deadly); flank scales more freely.
      const roll = Math.random()
      let kind = 'grunt'
      const sniperBias = Math.min(0.18, 0.03 + depth * 0.012)
      const flankBias  = Math.min(0.40, 0.10 + depth * 0.030)
      if (roll < sniperBias) kind = 'sniper'
      else if (roll < sniperBias + flankBias) kind = 'flank'
      spawnAt(kind, cx + 0.5, cy + 0.5)
      placed++
    }
    // Squad spawn bark — one robot announces.
    if (robots.length) {
      const r = robots[Math.floor(Math.random() * robots.length)]
      VOICE().bark('spawn', r)
    }
    // Hold off the periodic-taunt timer so the spawn bark doesn't get
    // immediately stepped on by a taunt.
    nextTauntAt = engine.time() + 8 + Math.random() * 4
  }

  // Global next-taunt scheduler (one taunt at a time across the squad).
  // Periodic ambient menace — a random alive robot says something menacing
  // every 6–12 s during pursuit. Without this the room feels mute after
  // the spawn bark and the occasional "spotted" shout on fire.
  let nextTauntAt = 0
  function maybeTaunt(t) {
    if (t < nextTauntAt) return
    const live = robots.filter((r) => r.alive)
    if (!live.length) {
      nextTauntAt = t + 6
      return
    }
    const r = live[Math.floor(Math.random() * live.length)]
    VOICE().bark('taunt', r)
    nextTauntAt = t + 6 + Math.random() * 6
  }

  function aliveCount() {
    let n = 0
    for (const r of robots) if (r.alive) n++
    return n
  }

  function killRobot(r, byWall) {
    if (!r.alive) return
    r.alive = false
    SFX().robotDeath(r.x, r.y)
    // Death curse — last words. Use barkRandom (not bark) so it ignores
    // the per-robot 4s cooldown; a robot that just shouted "FEAR THE
    // ROBOT" should still get to curse on the way out. The duration is
    // forwarded on the event so a survivor's revenge bark can be deferred
    // to start after this curse finishes (rather than overlapping it).
    const curseDur = VOICE().barkRandom('deathCurse', r.x, r.y, {basePitch: r.voicePitch || 110}) || 0
    E().emit('robot-killed', {robot: r, byWall: !!byWall, curseDur})
  }

  // Robot fires a laser at the player with class-dependent inaccuracy.
  function fireLaser(r) {
    const p = P().getPosition()
    const dx = p.x - r.x, dy = p.y - r.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 0.001) return
    const sc = depthScaling()
    const baseAng = Math.atan2(dy, dx)
    const ang = baseAng + (Math.random() * 2 - 1) * r.accuracyRad * sc.accuracyMul
    const pr = {
      id: projectileId++,
      x: r.x, y: r.y,
      vx: Math.cos(ang) * sc.laserSpeed,
      vy: Math.sin(ang) * sc.laserSpeed,
      ttl: sc.laserTtl,
      shooter: r.id,
      baseHz: r.baseHz * 3.0,
      voiceProp: null,
    }
    projectiles.push(pr)
    startProjectileVoice(pr)
    SFX().robotLaser(r.x, r.y, r.baseHz)
    if (Math.random() < 0.18) VOICE().bark('spotted', r)
  }

  // Greedy step toward the player along the dominant axis. If that axis is
  // blocked by a wall cell, try the other; if both are blocked, sit still
  // and increment a stuck counter. Robots that walk into walls die from
  // electrocution — that's the player's main weapon at low difficulty.
  function stepToward(r, dt, difficulty) {
    const p = P().getPosition()
    const dx = p.x - r.x, dy = p.y - r.y
    const ax = Math.abs(dx), ay = Math.abs(dy)
    let mx = 0, my = 0
    // Pick primary axis with some bias so robots that get stuck on a wall
    // don't oscillate. Personality random so they don't all flank the same.
    const preferX = ax > ay
    if (preferX) {
      mx = Math.sign(dx)
      // If primary is blocked by close wall, try perpendicular.
      const trial = R().wallsTouchedBy(r.x + mx * (r.speed * dt + RADIUS), r.y, RADIUS)
      if (trial) { mx = 0; my = Math.sign(dy) }
    } else {
      my = Math.sign(dy)
      const trial = R().wallsTouchedBy(r.x, r.y + my * (r.speed * dt + RADIUS), RADIUS)
      if (trial) { my = 0; mx = Math.sign(dx) }
    }
    if (mx === 0 && my === 0) {
      r.stuck += dt
      return
    }

    // Length-1 vector even on diagonals.
    const len = Math.sqrt(mx * mx + my * my)
    if (len > 0) { mx /= len; my /= len }
    const speedScale = difficulty === 'hard' ? 1.2 : difficulty === 'easy' ? 0.85 : 1.0
    const nx = r.x + mx * r.speed * speedScale * dt
    const ny = r.y + my * r.speed * speedScale * dt

    // Robots' own electrocution: stepping into a wall kills them.
    const into = R().wallsTouchedBy(nx, ny, RADIUS)
    if (into) {
      // Move them just up against the wall; SFX.wallZap then die.
      SFX().wallZap(nx, ny)
      killRobot(r, true)
      return
    }
    r.x = nx; r.y = ny
    r.stuck = 0
  }

  // Footstep cadence per robot. Steps happen at FOOTSTEP_PERIOD_BASE / (speed/1.8).
  function maybeFootstep(r, t) {
    const period = FOOTSTEP_PERIOD_BASE / (r.speed / 1.8)
    if (t - r.lastFootstep > period) {
      SFX().robotFootstep(r.x, r.y, r.baseHz)
      r.lastFootstep = t
    }
  }

  function update(dt) {
    const t = engine.time()
    const playerAlive = P().isAlive()
    const difficulty = (app.settings.computed && app.settings.computed.difficulty) || 'normal'
    const fireMul = difficulty === 'hard' ? 1.3 : difficulty === 'easy' ? 0.65 : 1.0

    // Robots freeze on player death — the death animation owns the stage,
    // and footstep one-shots simply stop firing because we skip the loop.
    if (playerAlive) {
      maybeTaunt(t)
      for (const r of robots) {
        if (!r.alive) continue

        stepToward(r, dt, difficulty)
        if (!r.alive) continue
        maybeFootstep(r, t)

        // LOS + audibility + fire. Rule: a robot may only fire if the
        // player can actually hear it (distance ≤ audible range). Sniper
        // is the exception — their footsteps are faint at the edge of
        // their reach, so we let them shoot from further. Sniper spawns
        // are capped (see spawnWave) so this exception stays rare.
        r.cooldown -= dt
        if (r.cooldown <= 0) {
          const p = P().getPosition()
          const ddx = p.x - r.x, ddy = p.y - r.y
          const dist = Math.sqrt(ddx * ddx + ddy * ddy)
          const sc = depthScaling()
          const range = r.kind === 'sniper' ? sc.audible * SNIPER_RANGE_MUL : sc.audible
          if (dist <= range && !R().lineHitsWall({x: r.x, y: r.y}, {x: p.x, y: p.y})) {
            fireLaser(r)
            r.cooldown = (1 / r.fireRate) / fireMul
          } else {
            r.cooldown = 0.2 // out of range or no LOS — re-check soon
          }
        }
      }
    }

    // Projectiles ALWAYS tick — even while the player is dying — so their
    // voices expire on schedule (wall hit / ttl runout) instead of
    // freezing in place mid-flight and droning under the death sting.
    // Player-collision is gated on `playerAlive` so we don't re-trigger
    // a death that's already in progress.
    const pp = P().getPosition()
    for (const pr of projectiles) {
      const nx = pr.x + pr.vx * dt
      const ny = pr.y + pr.vy * dt
      pr.ttl -= dt
      // Wall hit?
      if (R().isWall(Math.floor(nx), Math.floor(ny))) {
        pr.ttl = 0
        continue
      }
      pr.x = nx; pr.y = ny

      // Update in-flight voice — louder + brighter as it nears the player.
      if (pr.voiceProp) {
        const ddx = pp.x - pr.x, ddy = pp.y - pr.y
        const dist = Math.sqrt(ddx * ddx + ddy * ddy)
        // 0..1: 1 when on top of player, 0 at >= 14 tiles
        const prox = Math.max(0, Math.min(1, (14 - dist) / 14))
        // While the player is dying we drain to silence quickly so the
        // beam doesn't keep singing under the death audio.
        const gain = playerAlive
          ? 0.18 + 0.7 * Math.pow(prox, 1.8)
          : 0
        pr.voiceProp.setPosition(pr.x, pr.y)
        pr.voiceProp.setGain(gain)
      }

      // Hit player (only while alive — skip during the death animation).
      if (playerAlive) {
        const ddx = pp.x - pr.x, ddy = pp.y - pr.y
        if ((ddx * ddx + ddy * ddy) < (P().RADIUS * P().RADIUS)) {
          P().die('laser')
          pr.ttl = 0
          continue
        }
      }
    }
    // Destroy expired projectiles' voices before filtering.
    for (const pr of projectiles) {
      if (pr.ttl <= 0) destroyProjectileVoice(pr)
    }
    projectiles = projectiles.filter((p) => p.ttl > 0)
  }

  // Player laser hit detection: linear segment from old-pos to new-pos
  // versus all live robots. The player-fire event passes a direction; we
  // raycast for FIRE_RANGE tiles or until a wall blocks.
  function onPlayerFire(ev) {
    const FIRE_RANGE = 18
    const STEP = 0.5
    let x = ev.x + ev.dx * 0.6
    let y = ev.y + ev.dy * 0.6
    let traveled = 0
    while (traveled < FIRE_RANGE) {
      if (R().isWall(Math.floor(x), Math.floor(y))) break
      // Robot intersection?
      for (const r of robots) {
        if (!r.alive) continue
        const ddx = r.x - x, ddy = r.y - y
        if (ddx * ddx + ddy * ddy < (RADIUS * RADIUS) * 1.6) {
          killRobot(r, false)
          return
        }
      }
      x += ev.dx * STEP
      y += ev.dy * STEP
      traveled += STEP
    }
  }

  function list() { return robots }
  function projectileList() { return projectiles }

  return {
    CLASS_DEFS,
    spawnAt,
    spawnWave,
    update,
    clear,
    list,
    aliveCount,
    onPlayerFire,
    projectiles: projectileList,
    RADIUS,
    // Exposed for the learn screen to audition continuous voices.
    _buildProjectileVoice: buildProjectileVoice,
  }
})()
