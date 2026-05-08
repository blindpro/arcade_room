/**
 * ESCALADOR — wall (the building).
 *
 * The "wall" is one column wide with two grip-holds at each integer floor:
 * a left grip and a right grip. Each grip has a state:
 *   open    — safe to grip
 *   closing — slamming shut soon (windowCreak playing)
 *   closed  — cannot grip; reach fails
 *
 * State transitions are scheduled (timer-driven). Most floors stay open;
 * only some windows are scheduled to close, and only above a difficulty
 * threshold (so floors 1–5 are always safe).
 *
 * Cross-module references via lazy getters per CLAUDE.md gotcha.
 */
content.wall = (() => {
  const _state = {
    building: 1,
    height: 100,           // floors per building
    grips: new Map(),      // key 'L:floor' or 'R:floor' -> {state, slamAt, openAt, lastWarn}
    pendingWarn: [],       // [{key, side, floor, atT}] — windowCreak audio events
  }

  function key(side, floor) { return (side === 'left' ? 'L:' : 'R:') + floor }

  function reset(building) {
    _state.building = building || 1
    _state.grips.clear()
    _state.pendingWarn = []
  }

  function gripState(side, floor) {
    const g = _state.grips.get(key(side, floor))
    return g ? g.state : 'open'
  }

  // Returns true when the named grip is in a state that allows holding.
  // (Closing is risky — your hand will be forced off when the slam fires —
  // but it is technically grippable until then.)
  function canGrip(side, floor) {
    if (floor < 0) return true   // ground
    const s = gripState(side, floor)
    return s === 'open' || s === 'closing'
  }

  // Reach success requires a fully open destination — closing windows reject
  // a fresh grip (you'd just have to release immediately).
  function canGripFresh(side, floor) {
    if (floor < 0) return true
    return gripState(side, floor) === 'open'
  }

  // Difficulty curve — chance per second that a window above the player
  // begins closing. Scales with floor and building.
  function spawnRatePerSec(bodyFloor) {
    const fScale = Math.max(0, (bodyFloor - 5) / 25)
    const bScale = (_state.building - 1) * 0.25
    return Math.min(1.6, 0.20 * fScale + bScale)   // up to ~1.6 closures/sec
  }

  // Try to schedule a window-close near the player. Picks a random side and
  // a floor 1–4 above the body. If that grip is already closing/closed,
  // no-op. windowCreak (1s) plays first; then state flips to closed for
  // CLOSED_DUR seconds, then back to open.
  const WARN_DUR = 1.0
  const CLOSED_DUR = 4.0
  function scheduleClose(bodyFloor, t) {
    if (bodyFloor >= _state.height - 1) return
    const side = Math.random() < 0.5 ? 'left' : 'right'
    const floor = Math.min(_state.height - 1, bodyFloor + 1 + Math.floor(Math.random() * 4))
    const k = key(side, floor)
    const g = _state.grips.get(k)
    if (g && g.state !== 'open') return
    const slamAt = t + WARN_DUR
    const openAt = slamAt + CLOSED_DUR
    _state.grips.set(k, {state: 'closing', slamAt, openAt, side, floor})
    content.audio.enqueue({type: 'windowCreak', side, dur: WARN_DUR})
  }

  // Per-frame tick: drive scheduled state changes.
  function tick(t, bodyFloor, dt) {
    // Probabilistic spawning of closures
    const rate = spawnRatePerSec(bodyFloor)
    if (rate > 0 && Math.random() < rate * dt) scheduleClose(bodyFloor, t)
    // Advance any scheduled grips
    for (const [k, g] of _state.grips) {
      if (g.state === 'closing' && t >= g.slamAt) {
        g.state = 'closed'
        content.audio.enqueue({type: 'windowSlam', side: g.side})
        // Whoever's gripping this grip right now is forced off.
        content.player.windowSlamOn(g.side, g.floor)
      } else if (g.state === 'closed' && t >= g.openAt) {
        g.state = 'open'
        _state.grips.delete(k)
      }
    }
  }

  // Returns the closest closing/closed grip on each side that the player
  // could currently see, used by audio to mark danger on the grip drone.
  function dangerForHand(side, floor) {
    // Hand is in "danger" if its current floor's grip is closing.
    if (floor < 0) return false
    const s = gripState(side, floor)
    return s === 'closing'
  }

  // For HUD/diagnostics
  function snapshot() {
    return {
      building: _state.building,
      height: _state.height,
      grips: Array.from(_state.grips.values()).map(g => ({...g})),
    }
  }

  return {
    reset,
    tick,
    canGrip,
    canGripFresh,
    gripState,
    dangerForHand,
    snapshot,
    height: () => _state.height,
    building: () => _state.building,
    setBuilding: (n) => { _state.building = n },
    _state,
  }
})()
