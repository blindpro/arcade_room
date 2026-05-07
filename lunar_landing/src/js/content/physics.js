// 1D vertical physics. Forces on the lander each frame:
//
//   gravity:  -g
//   thrust:   +throttle * body.thrust  (always upward)
//   drag:     -k * vy * |vy|           (always opposes motion)
//
// where k = g / terminalV² for atmospheric bodies, 0 for vacuum bodies
// (so vacuum free-fall accelerates indefinitely). At terminal velocity
// the drag exactly cancels gravity, which is the definition.
//
// Touchdown: y ≤ 0. Soft if |vy| ≤ body.crashSpeed, otherwise crash.
// No collision sub-stepping needed — the only "geometry" is a floor at
// y=0 and we cap dt so a tab-restore doesn't teleport through it.
content.physics = (() => {
  const C = () => content.constants
  const L = () => content.lander

  const MAX_DT = 0.05

  function step(dt, missionNum) {
    if (dt > MAX_DT) dt = MAX_DT
    const s = L().state
    if (s.landed || s.dead) return null
    const cfg = C().bodyConfig(missionNum)
    const g = cfg.gravity
    const k = C().dragK(cfg)
    const thrust = cfg.thrust * s.throttle

    // Acceleration this frame.
    const drag = -k * s.vy * Math.abs(s.vy)
    const a = -g + thrust + drag
    s.vy += a * dt
    s.y  += s.vy * dt

    if (s.y <= 0) {
      s.y = 0
      const impactVy = s.vy
      s.vy = 0
      s.throttle = 0
      s.throttleToggle = false
      const safe = Math.abs(impactVy) <= cfg.crashSpeed
      if (safe) {
        s.landed = true
        s.landingVerdict = {key: 'verdict.soft', vy: impactVy}
        return 'landed'
      } else {
        s.dead = true
        s.crashReasonKey = 'verdict.crashVy'
        s.landingVerdict = {key: 'verdict.crashVy', vy: impactVy}
        return 'crashed'
      }
    }
    return null
  }

  // Predict whether, given current vy and altitude, applying full thrust
  // for the rest of the descent leaves us under the body's crash speed.
  // Used by the emergency tone: if the answer is "no, you'll crash" the
  // tone plays.
  //
  // Steady-state shortcut: at full thrust the net upward acceleration is
  // (thrust - g + drag). Drag opposes vy, so during descent (vy<0) drag
  // is positive (upward). The kinematic identity vy_f² = vy² + 2·a·Δy
  // gives the impact speed assuming constant a. We use the average of
  // current and full-thrust acceleration as a conservative proxy — it's
  // exact in vacuum and slightly pessimistic with atmosphere (drag falls
  // as vy slows).
  function willCrash() {
    const s = L().state
    const cfg = C().bodyConfig(content.missions.current())
    if (s.y <= 0 || s.vy >= 0) return false
    const g = cfg.gravity
    const k = C().dragK(cfg)
    const drag = -k * s.vy * Math.abs(s.vy)        // positive during descent
    const aFull = -g + cfg.thrust + drag           // net upward at full throttle
    if (aFull <= 0) return true                    // can't even hold against gravity
    // vy_f² = vy² - 2·aFull·y  (going from vy<0, y, to vy_f, 0; integrating
    // upward acceleration over the fall distance y):
    const vySq = s.vy * s.vy - 2 * aFull * s.y
    if (vySq <= 0) return false                    // would stop before impact
    const impact = Math.sqrt(vySq)
    return impact > cfg.crashSpeed
  }

  return {
    step,
    willCrash,
  }
})()
