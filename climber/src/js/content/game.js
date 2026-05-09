/**
 * CRAZY CLIMBER — top-level game module: scoring, lives, building progression,
 * and the per-frame orchestration of player + wall + hazards + audio.
 *
 * Phase FSM:
 *   ready    — countdown / "ground floor" announce; held until the player
 *              presses any key
 *   play     — gameplay loop
 *   dying    — pendingGameOver: audio fall sting plays out (1.4 s) before
 *              the screen transitions to gameover or restart
 *   clear    — building cleared; bonus tally, then advance to next building
 *
 * Cross-module references via lazy getters per CLAUDE.md gotcha.
 */
content.game = (() => {
  const PHASE_READY = 'ready'
  const PHASE_PLAY  = 'play'
  const PHASE_DYING = 'dying'
  const PHASE_CLEAR = 'clear'

  const SCORE_PER_FLOOR = 100
  const SCORE_DODGE = 250
  const SCORE_SWIPE_AVOIDED = 1000
  const BUILDING_CLEAR_BASE = 5000

  const _state = {
    phase: PHASE_READY,
    phaseT: 0,
    t: 0,
    score: 0,
    floorMax: 0,             // highest floor reached this run (for HUD)
    lives: 1,
    building: 1,
    pendingDeathAt: 0,       // audio play-out deadline
    pendingClearAt: 0,
    deathReasonKey: null,
    deathSide: null,
    onGameOver: null,        // callback set by the screen
    onBuildingClear: null,
    onLifeLost: null,
  }

  function reset() {
    _state.phase = PHASE_READY
    _state.phaseT = 0
    _state.t = 0
    _state.score = 0
    _state.floorMax = 0
    _state.lives = 1
    _state.building = 1
    _state.pendingDeathAt = 0
    _state.pendingClearAt = 0
    _state.deathReasonKey = null
    _state.deathSide = null
    _state._handledDeath = false
    content.player.reset()
    content.wall.reset(1)
    content.hazards.reset()
  }

  function start() {
    reset()
    content.audio.start()
    content.audio.startGripVoices()
    content.audio.startWind()
    _state.phase = PHASE_READY
    _state.phaseT = 0
  }

  function setCallbacks(cbs) {
    if (!cbs) return
    if (cbs.onGameOver) _state.onGameOver = cbs.onGameOver
    if (cbs.onBuildingClear) _state.onBuildingClear = cbs.onBuildingClear
    if (cbs.onLifeLost) _state.onLifeLost = cbs.onLifeLost
  }

  function stop() {
    content.audio.silenceAll()
  }

  // ---------- input passthrough (called by game screen) ----------
  function press(side, dir) {
    if (_state.phase === PHASE_READY) {
      _state.phase = PHASE_PLAY
      _state.phaseT = 0
    }
    if (_state.phase !== PHASE_PLAY) return false
    return content.player.press(side, dir)
  }

  // ---------- callbacks from sub-modules ----------
  function notifyClimb(side, floor) {
    if (floor > _state.floorMax) {
      const gained = floor - _state.floorMax
      _state.floorMax = floor
      addScore(gained * SCORE_PER_FLOOR)
      // Floor chime every 5 floors
      if (floor % 5 === 0) {
        content.audio.enqueue({type: 'floorChime', floor})
      }
    }
  }
  function notifyDodge(side) {
    addScore(SCORE_DODGE)
  }
  function notifySwipeAvoided() {
    addScore(SCORE_SWIPE_AVOIDED)
  }
  function notifyRejected(reason) {
    // Hook for haptics / "buzz on rejected input". No-op for now.
  }

  function maybeBuildingClear() {
    if (_state.phase !== PHASE_PLAY) return
    const top = content.wall.height() - 1
    if (content.player.bodyFloor() >= top) {
      _state.phase = PHASE_CLEAR
      _state.phaseT = 0
      _state.pendingClearAt = _state.t + 2.5
      const bonus = BUILDING_CLEAR_BASE + (_state.building * 1000)
      addScore(bonus)
      content.audio.enqueue({type: 'buildingClear'})
      if (_state.onBuildingClear) {
        try { _state.onBuildingClear({building: _state.building, bonus}) } catch (e) {}
      }
    }
  }

  function addScore(n) {
    _state.score += n
  }

  // ---------- per-frame tick ----------
  function tick(dt) {
    _state.t += dt
    _state.phaseT += dt

    if (_state.phase === PHASE_READY) {
      // Wait for the first input (handled in press()). Keep the wind /
      // grip drones alive during ready so they're already breathing.
      const ps = content.player.snapshot()
      content.audio.updateGripVoice('left',  ps.left.floor,  Math.min(1, ps.left.reachT  / content.player.REACH_DUR), false)
      content.audio.updateGripVoice('right', ps.right.floor, Math.min(1, ps.right.reachT / content.player.REACH_DUR), false)
      content.audio.updateWind(ps.bodyAltitude)
      return
    }

    if (_state.phase === PHASE_PLAY) {
      content.player.tick(dt)
      content.wall.tick(_state.t, content.player.bodyFloor(), dt)
      content.hazards.tick(_state.t, dt, content.player.bodyFloor(), _state.building)

      const ps = content.player.snapshot()
      const lDanger = content.wall.dangerForHand('left',  ps.left.floor)
      const rDanger = content.wall.dangerForHand('right', ps.right.floor)
      content.audio.updateGripVoice('left',  ps.left.floor,  Math.min(1, ps.left.reachT  / content.player.REACH_DUR), lDanger)
      content.audio.updateGripVoice('right', ps.right.floor, Math.min(1, ps.right.reachT / content.player.REACH_DUR), rDanger)
      content.audio.updateWind(ps.bodyAltitude)

      // Auto-detect building clear when both hands reach the top floor
      maybeBuildingClear()

      if (content.player.isFalling()) {
        _state.phase = PHASE_DYING
        _state.phaseT = 0
        _state.pendingDeathAt = _state.t + 1.5
        const sn = content.player.snapshot()
        _state.deathReasonKey = sn.deathReason
        _state.deathSide = sn.deathSide
        if (_state.onLifeLost) {
          try { _state.onLifeLost({reasonKey: _state.deathReasonKey, side: _state.deathSide}) } catch (e) {}
        }
      }
      return
    }

    if (_state.phase === PHASE_DYING) {
      // Animate the fall: tick the player so fallT advances, then drive the
      // grip voices and wind from a dropping altitude (death floor → 0 across
      // FALL_DUR). The descending 'fall' SFX rides on top, the 'thud' lands
      // at FALL_DUR. After pendingDeathAt we fade the drones out (silenceAll)
      // and fire the gameOver callback so the screen can transition.
      content.player.tick(dt)
      const ps = content.player.snapshot()
      const drop = 1 - ps.fallProgress
      const lf = ps.fallStartLeft  * drop
      const rf = ps.fallStartRight * drop
      content.audio.updateGripVoice('left',  lf, 0, false)
      content.audio.updateGripVoice('right', rf, 0, false)
      content.audio.updateWind((lf + rf) / 2)

      if (_state.t >= _state.pendingDeathAt && !_state._handledDeath) {
        _state._handledDeath = true
        _state.lives = 0
        content.audio.silenceAll()
        if (_state.onGameOver) {
          try { _state.onGameOver({score: _state.score, floor: _state.floorMax, building: _state.building, reasonKey: _state.deathReasonKey, side: _state.deathSide}) } catch (e) {}
        }
        // Phase stays DYING; the game screen handles transition.
      }
      return
    }

    if (_state.phase === PHASE_CLEAR) {
      if (_state.t >= _state.pendingClearAt) {
        _state.building++
        _state.floorMax = 0
        content.player.reset()
        content.wall.reset(_state.building)
        content.hazards.reset()
        _state.phase = PHASE_READY
        _state.phaseT = 0
      }
      return
    }
  }

  function snapshot() {
    return {
      phase: _state.phase,
      score: _state.score,
      lives: _state.lives,
      floor: _state.floorMax,
      building: _state.building,
      goal: content.wall.height(),
      deathReasonKey: _state.deathReasonKey,
      deathSide: _state.deathSide,
      player: content.player.snapshot(),
    }
  }

  return {
    start,
    stop,
    reset,
    tick,
    press,
    setCallbacks,
    notifyClimb,
    notifyDodge,
    notifySwipeAvoided,
    notifyRejected,
    maybeBuildingClear,
    snapshot,
    isAlive: () => content.player.isAlive(),
    isPlaying: () => _state.phase === PHASE_PLAY || _state.phase === PHASE_READY,
    phase: () => _state.phase,
    _state,
  }
})()
