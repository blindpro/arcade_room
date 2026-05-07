// 1D lander state. Pure vertical descent: altitude (y), descent rate
// (vy, negative when falling), throttle, fuel.
//
// Controls collapse to one axis: spacebar (held) fires thrusters, Tab
// toggles them on/off. No tilt, no x. Mission-end verdict is binary —
// soft landing or crash, classified on alt = 0 by |vy| vs body crashSpeed.
//
// Toggle flags govern the four monitor voices (velocity clicks, altitude
// tone, fuel tone, emergency tone). Persisted across missions so the
// player keeps their preference for the run.
content.lander = (() => {
  const C = () => content.constants

  const state = {
    y: 0,                   // metres above the surface
    vy: 0,                  // m/s, negative = falling
    throttle: 0,            // 0..1, ramped
    throttleHeld: false,    // spacebar pressed THIS frame
    throttleToggle: false,  // Tab toggle latch
    fuel: 0,
    fuelMax: 0,
    dead: false,
    landed: false,
    crashReasonKey: null,
    landingVerdict: null,   // {key, vy}
    missionStartTime: 0,

    // Audio toggle states (Shift-V/A/F/E from GMA Lander).
    monitor: {
      vel: true,
      alt: true,
      fuel: true,
      emergency: true,
    },
  }

  function reset(missionNum) {
    const cfg = C().bodyConfig(missionNum)
    state.fuelMax = cfg.fuel
    state.fuel = cfg.fuel
    state.y = cfg.startAlt
    state.vy = 0
    state.throttle = 0
    state.throttleHeld = false
    state.throttleToggle = false
    state.dead = false
    state.landed = false
    state.crashReasonKey = null
    state.landingVerdict = null
    state.missionStartTime = engine.time()
  }

  // Read input each frame. Spacebar = hold-to-thrust; Tab = toggle.
  // Tab is edge-triggered: a fresh press flips the latch.
  let _prevTabDown = false
  function readInput(dt) {
    if (state.dead || state.landed) {
      state.throttleHeld = false
      state.throttle = Math.max(0, state.throttle - C().THROTTLE_RAMP * dt)
      return
    }
    const ui = app.controls.ui()
    const g = app.controls.game()
    state.throttleHeld = !!(ui.space || g.thrust || g.x > 0)
    const tabDown = !!ui.tab
    if (tabDown && !_prevTabDown) {
      state.throttleToggle = !state.throttleToggle
    }
    _prevTabDown = tabDown

    // Combine: thrusters on if either source asks for them.
    let target = (state.throttleHeld || state.throttleToggle) ? 1 : 0
    if (state.fuel <= 0) {
      target = 0
      state.throttleToggle = false
    }
    const ramp = C().THROTTLE_RAMP * dt
    if (state.throttle < target) state.throttle = Math.min(target, state.throttle + ramp)
    else if (state.throttle > target) state.throttle = Math.max(target, state.throttle - ramp)
  }

  function consumeFuel(dt) {
    if (state.throttle > 0 && state.fuel > 0) {
      state.fuel = Math.max(0, state.fuel - C().FUEL_BURN * state.throttle * dt)
    }
  }

  // Toggle a monitor voice (velocity clicks / altitude tone / fuel tone /
  // emergency). Used by Shift-A, Shift-V, Shift-F, Shift-E.
  function toggleMonitor(name) {
    if (!(name in state.monitor)) return
    state.monitor[name] = !state.monitor[name]
    return state.monitor[name]
  }

  return {
    state,
    reset,
    readInput,
    consumeFuel,
    toggleMonitor,
  }
})()
