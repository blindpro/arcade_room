/**
 * CRAZY CLIMBER — hazards (falling pots, the gorilla).
 *
 * Pots:
 *   - Spawn rate scales with the body floor and current building.
 *   - Each pot has {side: 'left' | 'right', spawnT, landAt, dodged}.
 *   - On spawn we enqueue a 'potIncoming' audio event (descending whistle
 *     with pan = side). Player has the warning window to press the matching
 *     DOWN key (Z or M) — that sets player.duckT > 0 on that hand. If the
 *     hand is ducked at landAt, the pot whooshes past harmlessly. Otherwise
 *     it cracks the hand and the climber falls.
 *
 * Gorilla:
 *   - Active above GORILLA_FLOOR. Drone is started/stopped from here based
 *     on the player's body floor.
 *   - Periodic swipes: a 1 s whoosh warning, then an impact. If the
 *     climber is at body altitude > swipeFloor - 1 at impact, they fall.
 *     Avoidance: drop at least one hand BEFORE impact. (Both ducked is
 *     safest because it lowers the body altitude by ~0.5 floors.)
 *
 * Cross-module references via lazy getters per CLAUDE.md gotcha.
 */
content.hazards = (() => {
  const POT_DUR = 1.5
  const GORILLA_FLOOR = 50
  const SWIPE_WARN = 1.0

  const _state = {
    pots: [],            // [{id, side, spawnT, landAt, dodged}]
    gorillaActive: false,
    gorillaIntensity: 0,
    swipe: null,         // {warnAt, impactAt, fromLeft}
    nextSwipeAt: 0,
    nextPotAt: 0,
    nextId: 1,
  }

  function reset() {
    _state.pots = []
    _state.gorillaActive = false
    _state.gorillaIntensity = 0
    _state.swipe = null
    _state.nextSwipeAt = 0
    _state.nextPotAt = 0
    _state.nextId = 1
  }

  // -------------- pot scheduling --------------
  function potRatePerSec(bodyFloor, building) {
    if (bodyFloor < 8) return 0
    const fScale = (bodyFloor - 8) / 30
    const bScale = (building - 1) * 0.30
    return Math.min(1.4, 0.20 + 0.40 * fScale + bScale)
  }

  function spawnPot(t) {
    const side = Math.random() < 0.5 ? 'left' : 'right'
    const pot = {
      id: _state.nextId++,
      side,
      spawnT: t,
      landAt: t + POT_DUR,
      dodged: false,
    }
    _state.pots.push(pot)
    content.audio.enqueue({type: 'potIncoming', side, dur: POT_DUR})
  }

  // -------------- gorilla scheduling --------------
  function updateGorilla(bodyFloor, t) {
    const wantActive = bodyFloor >= GORILLA_FLOOR
    if (wantActive && !_state.gorillaActive) {
      _state.gorillaActive = true
      content.audio.startGorillaRoar()
      _state.nextSwipeAt = t + 6 + Math.random() * 4
    } else if (!wantActive && _state.gorillaActive) {
      _state.gorillaActive = false
      content.audio.stopGorillaRoar()
      _state.nextSwipeAt = 0
      _state.swipe = null
    }
    if (_state.gorillaActive) {
      // Roar intensity grows as you climb closer to the top.
      const span = Math.max(1, content.wall.height() - GORILLA_FLOOR)
      const i = Math.max(0, Math.min(1, (bodyFloor - GORILLA_FLOOR) / span))
      _state.gorillaIntensity = 0.35 + i * 0.65
      content.audio.updateGorillaRoar(_state.gorillaIntensity)
    }
  }

  function maybeSwipe(t) {
    if (!_state.gorillaActive) return
    if (_state.swipe) return
    if (t < _state.nextSwipeAt) return
    const fromLeft = Math.random() < 0.5
    _state.swipe = {warnAt: t, impactAt: t + SWIPE_WARN, fromLeft}
    content.audio.enqueue({type: 'gorillaWhoosh', fromLeft, dur: SWIPE_WARN})
  }

  // -------------- per-frame tick --------------
  function tick(t, dt, bodyFloor, building) {
    // Pot spawning
    const rate = potRatePerSec(bodyFloor, building)
    if (rate > 0 && Math.random() < rate * dt) spawnPot(t)
    // Resolve pots whose land time has passed
    for (let i = _state.pots.length - 1; i >= 0; i--) {
      const p = _state.pots[i]
      if (t >= p.landAt) {
        if (content.player.isProtectedFromPot(p.side)) {
          p.dodged = true
          content.audio.enqueue({type: 'potDodge', side: p.side})
          if (content.game && content.game.notifyDodge) content.game.notifyDodge(p.side)
        } else {
          content.audio.enqueue({type: 'potHit', side: p.side})
          content.player.die('game.deathPot', p.side)
        }
        _state.pots.splice(i, 1)
      }
    }
    // Gorilla
    updateGorilla(bodyFloor, t)
    maybeSwipe(t)
    if (_state.swipe && t >= _state.swipe.impactAt) {
      content.audio.enqueue({type: 'gorillaSwipe'})
      // Hit if the climber is "exposed": body floor near the top AND not
      // ducked on either hand at the moment of impact. Ducking either hand
      // counts as crouching low enough.
      const ps = content.player.snapshot()
      const ducked = (ps.left && ps.left.duckT > 0) || (ps.right && ps.right.duckT > 0) ||
                     (content.player._state.left.duckT > 0) || (content.player._state.right.duckT > 0)
      if (!ducked) {
        content.player.die('game.deathGorilla', null)
      } else {
        if (content.game && content.game.notifySwipeAvoided) content.game.notifySwipeAvoided()
      }
      _state.swipe = null
      _state.nextSwipeAt = t + 7 + Math.random() * 6
    }
  }

  return {
    reset,
    tick,
    GORILLA_FLOOR,
    _state,
  }
})()
