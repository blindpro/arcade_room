/**
 * CRAZY CLIMBER — player (the climber).
 *
 * The climber has two hands, each independently driven. Each hand has:
 *   floor      — integer floor of the grip currently held (or destination
 *                while reaching)
 *   prevFloor  — floor the hand was on before the current reach (used
 *                to roll back on a failed reach)
 *   reachT     — seconds remaining in the current reach (0 = gripping)
 *   duckT      — seconds remaining of a "duck" (Z/M dodge stance)
 *
 * Constraints:
 *   - |left.floor - right.floor| <= 1 at all times.
 *   - You can only release a hand when the OTHER hand is gripping
 *     (reachT == 0). Otherwise: instant fall (both hands off).
 *   - Reaches take REACH_DUR seconds; during that window the other hand
 *     is the only support.
 *
 * State:
 *   alive  — true while the climber is on the wall
 *   falling — true after death triggered, until the screen handles it
 *
 * Cross-module references via lazy getters per CLAUDE.md gotcha.
 */
content.player = (() => {
  const REACH_DUR = 0.20      // seconds for a hand to swing to the next grip
  const DUCK_DUR  = 0.55      // seconds a "duck" lasts (Z/M dodge stance)
  const FALL_DUR  = 1.40      // matches the 'fall' SFX descending tri duration

  const _state = {
    alive: true,
    falling: false,
    fallT: 0,                 // seconds elapsed since die() — drives audio drop
    fallStartLeft: 0,         // hand floors at the moment of death
    fallStartRight: 0,
    deathReason: null,        // i18n key for death reason
    deathSide: null,          // 'left' / 'right' for side-flavored deaths
    left:  {floor: 0, prevFloor: 0, reachT: 0, duckT: 0},
    right: {floor: 0, prevFloor: 0, reachT: 0, duckT: 0},
    // For "alternation bonus" scoring: which hand last completed a climb
    lastClimbSide: null,
  }

  function reset() {
    _state.alive = true
    _state.falling = false
    _state.fallT = 0
    _state.fallStartLeft = 0
    _state.fallStartRight = 0
    _state.deathReason = null
    _state.deathSide = null
    _state.left  = {floor: 0, prevFloor: 0, reachT: 0, duckT: 0}
    _state.right = {floor: 0, prevFloor: 0, reachT: 0, duckT: 0}
    _state.lastClimbSide = null
  }

  function bodyFloor() {
    return Math.min(_state.left.floor, _state.right.floor)
  }
  // Continuous body altitude — useful for wind / score interpolation.
  function bodyAltitude() {
    return (_state.left.floor + _state.right.floor) / 2
  }
  // Number of floors successfully climbed so far this run (high-water mark).
  function highestFloor() {
    return Math.max(_state.left.floor, _state.right.floor)
  }

  function isReaching(hand) { return hand.reachT > 0 }
  function isGripping(hand) { return hand.reachT <= 0 }
  function isDucking(hand) { return hand.duckT > 0 }

  // --------- input handlers ---------
  // Public API: pressUp/pressDown for left/right hand. Returns true if the
  // press did anything; false if it was rejected (already at limit, other
  // hand reaching, etc.) — useful for the "buzz on rejected input" feedback.
  function press(side, dir) {
    if (!_state.alive || _state.falling) return false
    const hand  = side === 'left' ? _state.left  : _state.right
    const other = side === 'left' ? _state.right : _state.left
    // Cannot release this hand while the OTHER hand is mid-reach (you'd
    // have nothing holding you).
    if (isReaching(other)) {
      content.game && content.game.notifyRejected && content.game.notifyRejected('busy')
      return false
    }
    // Cannot start a new reach with this hand while it's already reaching.
    if (isReaching(hand)) return false

    if (dir === 'down') {
      // DOWN doubles as a dodge; even if the move is blocked by the floor,
      // we still trigger a duck (so Z/M always at least register a dodge).
      hand.duckT = DUCK_DUR
      if (hand.floor > 0) {
        const target = hand.floor - 1
        if (Math.abs(other.floor - target) > 1) {
          // Would split too far — duck only, no descent.
          return true
        }
        hand.prevFloor = hand.floor
        hand.reachT = REACH_DUR
        hand.floor = target
        content.audio.enqueue({type: 'reachStart', side})
      }
      return true
    }
    if (dir === 'up') {
      const target = hand.floor + 1
      if (target > content.wall.height() - 1) {
        // Already at top — let the game module decide if this counts as
        // building-clear.
        if (content.game && content.game.maybeBuildingClear) content.game.maybeBuildingClear()
        return false
      }
      if (Math.abs(other.floor - target) > 1) {
        // Other hand is too low; the higher hand can't go further.
        if (content.game && content.game.notifyRejected) content.game.notifyRejected('split')
        return false
      }
      // Reach succeeds only if window above is open.
      if (!content.wall.canGripFresh(side, target)) {
        // Bonk against closed window. Hand stays at original floor.
        content.audio.enqueue({type: 'reachFail', side})
        return false
      }
      hand.prevFloor = hand.floor
      hand.reachT = REACH_DUR
      hand.floor = target
      content.audio.enqueue({type: 'reachStart', side})
      return true
    }
    return false
  }

  // Called by hazards when a pot lands on a side. If the matching hand is
  // ducked (reachT or duckT active for the column), the pot misses.
  function isProtectedFromPot(side) {
    const hand = side === 'left' ? _state.left : _state.right
    return isDucking(hand)
  }

  // Called when the wall slams a window we're gripping or reaching to.
  function windowSlamOn(side, floor) {
    if (!_state.alive || _state.falling) return
    const hand = side === 'left' ? _state.left : _state.right
    if (hand.floor === floor) {
      // Hand is gripping (or in-flight to) the slammed window. Off goes the
      // hand. If the other hand is ALSO mid-reach OR very high above, the
      // climber falls.
      const other = side === 'left' ? _state.right : _state.left
      if (isReaching(other) || other.floor < 0) {
        die('game.deathClosed', side)
        return
      }
      // Otherwise hand drops one floor (we lose grip but other hand catches
      // us). The drop also counts as a duck.
      hand.duckT = DUCK_DUR
      if (hand.floor > 0) {
        hand.prevFloor = hand.floor
        hand.floor = Math.max(0, Math.min(other.floor, hand.floor - 1))
        hand.reachT = REACH_DUR * 0.5
      }
    }
  }

  // Triggered by hazards (pot, gorilla) — kills the climber.
  function die(reasonKey, side) {
    if (!_state.alive) return
    _state.alive = false
    _state.falling = true
    _state.fallT = 0
    _state.fallStartLeft  = _state.left.floor
    _state.fallStartRight = _state.right.floor
    _state.deathReason = reasonKey || 'game.deathFell'
    _state.deathSide = side || null
    content.audio.enqueue({type: 'fall', dur: FALL_DUR})
    setTimeout(() => content.audio.enqueue({type: 'thud'}), FALL_DUR * 1000)
  }

  // ---------- per-frame tick ----------
  function tick(dt) {
    if (_state.falling) {
      _state.fallT = Math.min(FALL_DUR, _state.fallT + dt)
      return
    }
    let landedSide = null
    let landedFloor = null
    for (const side of ['left', 'right']) {
      const hand = side === 'left' ? _state.left : _state.right
      if (hand.reachT > 0) {
        hand.reachT -= dt
        if (hand.reachT <= 0) {
          hand.reachT = 0
          landedSide = side
          landedFloor = hand.floor
        }
      }
      if (hand.duckT > 0) hand.duckT = Math.max(0, hand.duckT - dt)
    }
    // Notify game/scoring when a hand completes a reach.
    if (landedSide != null && landedFloor != null) {
      // Successful land — emit climb chime if the new floor is HIGHER than
      // before the reach. This avoids chiming on dodges/descents.
      const hand = landedSide === 'left' ? _state.left : _state.right
      if (hand.floor > hand.prevFloor) {
        content.audio.enqueue({type: 'climb', side: landedSide, floor: hand.floor})
        if (content.game && content.game.notifyClimb) {
          content.game.notifyClimb(landedSide, hand.floor)
        }
        _state.lastClimbSide = landedSide
      }
    }
  }

  // 0..1 progress of the post-death drop animation (0 while alive).
  function fallProgress() {
    return _state.falling ? Math.min(1, _state.fallT / FALL_DUR) : 0
  }

  function snapshot() {
    return {
      alive: _state.alive,
      falling: _state.falling,
      fallProgress: fallProgress(),
      fallStartLeft: _state.fallStartLeft,
      fallStartRight: _state.fallStartRight,
      bodyFloor: bodyFloor(),
      bodyAltitude: bodyAltitude(),
      left:  {...(_state.left)},
      right: {...(_state.right)},
      deathReason: _state.deathReason,
      deathSide: _state.deathSide,
    }
  }

  return {
    reset,
    tick,
    press,
    die,
    isProtectedFromPot,
    windowSlamOn,
    bodyFloor,
    bodyAltitude,
    highestFloor,
    snapshot,
    isAlive: () => _state.alive,
    isFalling: () => _state.falling,
    REACH_DUR,
    DUCK_DUR,
    _state,
  }
})()
