// Player model. Continuous 2D position, 8-direction movement on arrows,
// 8-direction firing on a separate key cluster (WASD by default). The
// canonical Berzerk feel: while firing, the player stops moving — the
// risk/reward of standing still to shoot is the iconic skill ceiling.
//
// State machine `mode`:
//   idle     - no input
//   moving   - integrating velocity from move axis
//   firing   - velocity zero, fire a projectile (cooldown gates the next shot)
//   dying    - hit by laser/wall/Otto, animation timer running
//   dead     - awaiting `player-died` event consumer
content.player = (() => {
  const E = () => content.events
  const R = () => content.room
  const SFX = () => content.sfx

  const SPEED = 6.0           // tiles / second
  const RADIUS = 0.34         // collision radius
  const FIRE_COOLDOWN = 0.35  // seconds between shots
  const DEATH_DELAY = 0.85    // seconds from death-trigger → emit player-died
  const FOOTSTEP_PERIOD = 0.26 // seconds between player footsteps while moving

  const state = {
    x: 0, y: 0,
    vx: 0, vy: 0,
    mode: 'idle',
    fireDir: null,
    fireCooldown: 0,
    deathTimer: 0,
    causeOfDeath: null,
    lives: 3,
    entryFrames: 0,
    lastFootstep: 0,
  }

  function reset(at) {
    state.x = at ? at.x : R().spawn().x
    state.y = at ? at.y : R().spawn().y
    state.vx = state.vy = 0
    state.mode = 'idle'
    state.fireDir = null
    state.fireCooldown = 0
    state.deathTimer = 0
    state.causeOfDeath = null
    state.entryFrames = 8
  }

  function setLives(n) { state.lives = n }
  function getLives() { return state.lives }

  // 8-way direction snap. Returns {x, y} unit vector or null if both axes are 0.
  function snap8(rx, ry) {
    if (rx === 0 && ry === 0) return null
    const ax = Math.abs(rx), ay = Math.abs(ry)
    if (ax > ay * 2) return {x: Math.sign(rx), y: 0}
    if (ay > ax * 2) return {x: 0, y: Math.sign(ry)}
    const inv = 1 / Math.SQRT2
    return {x: Math.sign(rx) * inv, y: Math.sign(ry) * inv}
  }

  // Read the fire direction from the active control scheme. wasdFire =
  // WASD; numpadFire = numpad arrows. Plus right-stick when gamepad is on.
  function readFireDir() {
    const k = engine.input.keyboard
    const scheme = (app.settings.computed && app.settings.computed.controlScheme) || 'wasdFire'

    let fx = 0, fy = 0
    if (scheme === 'numpadFire') {
      if (k.is('Numpad4')) fx -= 1
      if (k.is('Numpad6')) fx += 1
      if (k.is('Numpad8')) fy -= 1
      if (k.is('Numpad2') || k.is('Numpad5')) fy += 1
      if (k.is('Numpad7')) { fx -= 1; fy -= 1 }
      if (k.is('Numpad9')) { fx += 1; fy -= 1 }
      if (k.is('Numpad1')) { fx -= 1; fy += 1 }
      if (k.is('Numpad3')) { fx += 1; fy += 1 }
    } else {
      if (k.is('KeyA')) fx -= 1
      if (k.is('KeyD')) fx += 1
      if (k.is('KeyW')) fy -= 1
      if (k.is('KeyS')) fy += 1
    }

    // Gamepad right stick (axes 2, 3) — independent fire stick.
    if (app.settings.computed && app.settings.computed.gamepadEnabled !== false) {
      try {
        const pads = navigator.getGamepads ? navigator.getGamepads() : []
        for (const pad of pads) {
          if (!pad) continue
          const ax = pad.axes[2] || 0, ay = pad.axes[3] || 0
          if (Math.abs(ax) > 0.4 || Math.abs(ay) > 0.4) {
            fx += ax; fy += ay
          }
          // Fire button (south face) = ArrowKey-aligned with last move? No —
          // we just use the right stick. Trigger fallback:
          if ((pad.buttons[7] && pad.buttons[7].pressed) || (pad.buttons[5] && pad.buttons[5].pressed)) {
            // Lock onto the move direction if no right stick deflection.
            if (Math.abs(ax) < 0.4 && Math.abs(ay) < 0.4) {
              fx += pad.axes[0] || 0
              fy += pad.axes[1] || 0
            }
          }
          break
        }
      } catch (_) {}
    }

    return snap8(fx, fy)
  }

  // Read movement from the standard `app.controls.game()` (arrow keys
  // remapped through the mappings file). The template controls use
  // x = forward/backward, y = strafe; we want screen x/y so we remap.
  function readMoveDir() {
    const k = engine.input.keyboard
    let mx = 0, my = 0
    if (k.is('ArrowLeft')) mx -= 1
    if (k.is('ArrowRight')) mx += 1
    if (k.is('ArrowUp')) my -= 1
    if (k.is('ArrowDown')) my += 1

    if (app.settings.computed && app.settings.computed.gamepadEnabled !== false) {
      try {
        const pads = navigator.getGamepads ? navigator.getGamepads() : []
        for (const pad of pads) {
          if (!pad) continue
          const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0
          if (Math.abs(ax) > 0.25) mx += ax
          if (Math.abs(ay) > 0.25) my += ay
          // D-pad
          if (pad.buttons[14] && pad.buttons[14].pressed) mx -= 1
          if (pad.buttons[15] && pad.buttons[15].pressed) mx += 1
          if (pad.buttons[12] && pad.buttons[12].pressed) my -= 1
          if (pad.buttons[13] && pad.buttons[13].pressed) my += 1
          break
        }
      } catch (_) {}
    }

    return snap8(mx, my)
  }

  function fire(dir) {
    state.fireCooldown = FIRE_COOLDOWN
    SFX().playerLaser(state.x, state.y)
    E().emit('player-fire', {x: state.x, y: state.y, dx: dir.x, dy: dir.y})
  }

  function die(cause) {
    if (state.mode === 'dying' || state.mode === 'dead') return
    state.mode = 'dying'
    state.deathTimer = DEATH_DELAY
    state.causeOfDeath = cause
    state.vx = state.vy = 0
    // Cause-specific stings on top of any environmental sound.
    if (cause === 'wall') {
      SFX().wallZap(state.x, state.y)
      SFX().playerHitByWall(state.x, state.y)
    } else if (cause === 'laser') {
      SFX().playerHitByLaser(state.x, state.y)
    } else if (cause === 'otto') {
      SFX().playerHitByOtto(state.x, state.y)
    }
    E().emit('player-dying', {x: state.x, y: state.y, cause})
  }

  function update(dt) {
    if (state.entryFrames > 0) {
      state.entryFrames--
      return
    }

    if (state.fireCooldown > 0) state.fireCooldown -= dt

    if (state.mode === 'dying') {
      state.deathTimer -= dt
      if (state.deathTimer <= 0) {
        state.mode = 'dead'
        E().emit('player-died', {cause: state.causeOfDeath})
      }
      return
    }
    if (state.mode === 'dead') return

    const fireDir = readFireDir()
    const moveDir = readMoveDir()

    // Firing always wins over movement.
    if (fireDir) {
      state.mode = 'firing'
      state.fireDir = fireDir
      state.vx = 0; state.vy = 0
      if (state.fireCooldown <= 0) fire(fireDir)
      return
    }

    if (moveDir) {
      state.mode = 'moving'
      state.fireDir = null
      state.vx = moveDir.x * SPEED
      state.vy = moveDir.y * SPEED
      const nx = state.x + state.vx * dt
      const ny = state.y + state.vy * dt
      // Sub-step the move to avoid tunneling at high speeds; simple but
      // adequate at SPEED=6 t/s with 60 Hz frames (≈0.1 t/frame).
      state.x = nx
      state.y = ny

      // Footstep cadence — emit one boot-thud every FOOTSTEP_PERIOD while
      // moving so the player audibly hears their own locomotion (and can
      // tell their footsteps apart from the metallic robot clanks).
      const t = engine.time()
      if (t - state.lastFootstep > FOOTSTEP_PERIOD) {
        SFX().playerFootstep(state.x, state.y)
        state.lastFootstep = t
      }

      // Wall collision: any contact = electrocution.
      const hit = R().wallsTouchedBy(state.x, state.y, RADIUS)
      if (hit) {
        die('wall')
        return
      }

      // Did the player exit through a door?
      const exitDir = R().exitAt(state.x, state.y)
      if (exitDir) {
        E().emit('exit-crossed', {dir: exitDir, x: state.x, y: state.y})
      }
    } else {
      state.mode = 'idle'
      state.fireDir = null
      state.vx = 0; state.vy = 0
    }
  }

  function getPosition() { return {x: state.x, y: state.y} }
  function getMode() { return state.mode }
  function getFireDir() { return state.fireDir }
  function isAlive() { return state.mode !== 'dying' && state.mode !== 'dead' }

  return {
    state,
    reset,
    update,
    fire,
    die,
    setLives,
    getLives,
    getPosition,
    getMode,
    getFireDir,
    isAlive,
    SPEED,
    RADIUS,
  }
})()
