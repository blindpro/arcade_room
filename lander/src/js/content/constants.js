// Single tuning surface for Lunar Lander. All physics values are SI
// (m, m/s, m/s², s).
//
// Pure 1D vertical descent (GMA Lander model). The "world" is altitude
// only — no x, no terrain, no tilt. Each mission is a celestial body
// with its own gravity, atmosphere (terminal-velocity cap), thrust, fuel
// and crash speed. After the last body, the table plateaus.
content.constants = (() => {
  const C = {
    // Throttle ramp (1/s) — ~250 ms 0→1 so cutoff isn't instantaneous.
    THROTTLE_RAMP: 4.0,
    // Fuel burn at full throttle, units/s. Linear in throttle.
    FUEL_BURN: 10,

    // Velocity-click thresholds.
    VEL_CLICK_DEADBAND: 0.4,    // m/s — descent speeds below this are silent
    VEL_CLICK_FAST_AT: 18,      // m/s — clicks reach maximum rate at this descent speed

    // Altitude tone "zoom" boundary. Above this, pitch maps over
    // [startAlt..zoomBoundary]; below, pitch resets to high and drops
    // faster over [zoomBoundary..0]. Same idea as GMA's altitude tone.
    ALT_ZOOM_BOUNDARY: 30,
    // Fuel tone zoom — below 10% the pitch resets to high and falls faster
    // over [10%..0]. Same idea applied to fuel.
    FUEL_ZOOM_FRACTION: 0.10,

    // Spoken-altitude cadence (s).
    SPEECH_INTERVAL: 3.0,

    // Landing-tier thresholds. quality = 0.5·vyEfficiency + 0.5·fuelEfficiency,
    // each in [0, 1]. vyEff is 1 when the lander stops dead; fuelEff is 1
    // when used exactly the suicide-burn optimum, 0 when the tank is empty.
    // So a "perfect" run is gentle AND efficient.
    TIER_PERFECT: 0.75,
    TIER_CLEAN:   0.40,

    // Score-tier thresholds for rank promotions.
    RANK_THRESHOLDS: [
      {key: 'rank.cadet',     score: 0},
      {key: 'rank.pilot',     score: 5000},
      {key: 'rank.commander', score: 20000},
      {key: 'rank.captain',   score: 50000},
      {key: 'rank.admiral',   score: 100000},
    ],
  }

  // Suicide-burn time — the minimum seconds of full thrust required to
  // land softly from cfg.startAlt with cfg's gravity, thrust and
  // atmosphere. This is the *floor* for fuel; player skill is judged by
  // how close they get to it.
  //
  //   Vacuum:    free-fall to h₁ = g·h₀/T, then full thrust to 0.
  //              t_burn = √(2·g·h₀ / (T·(T−g)))
  //
  //   Atmosphere: free-fall reaches min(terminalV, vacImpact) then full
  //               thrust to 0. Conservative — drag during the brake also
  //               helps decelerate, so the real number is a touch lower.
  //               t_burn ≈ Δv / (T − g)
  //
  // (Both formulas assume TWR > 1, which every body in the table satisfies.)
  function suicideBurnTime(cfg) {
    const g = cfg.gravity, T = cfg.thrust, h0 = cfg.startAlt
    if (T <= g) return Infinity
    if (!cfg.terminalV || cfg.terminalV <= 0) {
      return Math.sqrt(2 * g * h0 / (T * (T - g)))
    }
    const dv = Math.min(cfg.terminalV, Math.sqrt(2 * g * h0))
    return dv / (T - g)
  }

  // Fuel margin: the budget is `margin` × suicide-burn fuel. Earlier
  // bodies are more forgiving (larger margin) so the player has room to
  // learn the audio cues; the gas-giants near 1.5× force precision.
  //
  // A perfect suicide-burn run on body N lands with (1 − 1/margin) of
  // the tank intact — that's the fuel-remaining bonus.
  C.BODIES = [
    // 1  Moon — vacuum, low g, generous TWR. Tutorial body.
    {nameKey: 'body.moon',     gravity:  1.62, terminalV: 0,  thrust:  4.0, crashSpeed: 3.0, startAlt:  80, fuelMargin: 2.4},
    // 2  Europa — lower g still, narrower thrust margin.
    {nameKey: 'body.europa',   gravity:  1.31, terminalV: 0,  thrust:  3.0, crashSpeed: 2.5, startAlt:  80, fuelMargin: 2.1},
    // 3  Mars — thin atmosphere caps you near 20 m/s.
    {nameKey: 'body.mars',     gravity:  3.72, terminalV: 20, thrust:  6.0, crashSpeed: 4.0, startAlt: 100, fuelMargin: 1.9},
    // 4  Mercury — vacuum, gravity comparable to Mars.
    {nameKey: 'body.mercury',  gravity:  3.70, terminalV: 0,  thrust:  6.0, crashSpeed: 3.0, startAlt: 100, fuelMargin: 1.8},
    // 5  Titan — thick nitrogen, terminal 8 m/s. Brake required (8 > 3.5
    //    crash speed) but the cap makes it forgiving.
    {nameKey: 'body.titan',    gravity:  1.35, terminalV:  8, thrust:  3.5, crashSpeed: 3.5, startAlt:  90, fuelMargin: 1.8},
    // 6  Ganymede — vacuum, marginal thrust.
    {nameKey: 'body.ganymede', gravity:  1.43, terminalV: 0,  thrust:  3.2, crashSpeed: 3.0, startAlt:  80, fuelMargin: 1.7},
    // 7  Io — vacuum, slightly heavier than Luna.
    {nameKey: 'body.io',       gravity:  1.79, terminalV: 0,  thrust:  3.6, crashSpeed: 3.0, startAlt:  80, fuelMargin: 1.7},
    // 8  Venus — brutal g, dense CO₂ keeps terminal just under crash.
    {nameKey: 'body.venus',    gravity:  8.87, terminalV: 12, thrust: 15.0, crashSpeed: 5.0, startAlt: 110, fuelMargin: 1.6},
    // 9  Saturn cloud-deck — high g, terminal > crash so atmo doesn't save you.
    {nameKey: 'body.saturn',   gravity: 10.44, terminalV: 30, thrust: 19.0, crashSpeed: 5.5, startAlt: 120, fuelMargin: 1.5},
    // 10 Jupiter cloud-deck — hardest. Almost no margin.
    {nameKey: 'body.jupiter',  gravity: 24.79, terminalV: 35, thrust: 42.0, crashSpeed: 6.0, startAlt: 130, fuelMargin: 1.45},
  ]

  // Compute fuel for each body from its physics. fuel = ceil(burn_time *
  // FUEL_BURN * margin). Stored back on the row so the rest of the game
  // can read cfg.fuel without re-computing.
  for (const cfg of C.BODIES) {
    cfg.optimalBurnTime = suicideBurnTime(cfg)
    cfg.fuel = Math.ceil(cfg.optimalBurnTime * C.FUEL_BURN * cfg.fuelMargin)
  }

  C.bodyConfig = function (n) {
    const i = Math.max(0, Math.min(C.BODIES.length - 1, (n | 0) - 1))
    return C.BODIES[i]
  }

  // Drag coefficient k such that terminal velocity = sqrt(g/k). Returns 0
  // for vacuum bodies (no atmosphere).
  C.dragK = function (cfg) {
    if (!cfg.terminalV || cfg.terminalV <= 0) return 0
    return cfg.gravity / (cfg.terminalV * cfg.terminalV)
  }

  return C
})()
