// Tunables for SKYDIVE. One place for the fall physics, the crystal field, the
// scoring math and the audio distances, so the feel can be tuned without
// touching logic.
//
// SKYDIVE is an audio-first skydive. You drop from thousands of meters; gravity
// accelerates your fall — the longer you go without a crystal, the faster you
// fall. Magic crystals float below you: each one pings at its own pitch, and
// the higher the pitch, the higher it lifts you. Steer LEFT / RIGHT to centre
// the next crystal in the stereo field and you collect it automatically as you
// fly over it; collecting resets your fall speed and boosts you back up. After
// two minutes the run ends and your score is how high in the sky you are.
// Falling to the ground crashes the run early. All audio is STEREO, centred on
// the player: pan = the crystal's horizontal offset, loudness = its vertical
// distance from you.
content.constants = (() => {
  // ---- play field -----------------------------------------------------------
  // Horizontal extent in meters; x is clamped to [-HALF_WIDTH, HALF_WIDTH].
  // Audio pan = crystal.dx / PAN_SCALE so an edge-to-edge offset reads hard
  // left/right.
  const HALF_WIDTH = 30
  const PAN_SCALE = HALF_WIDTH

  // ---- the dive ---------------------------------------------------------------
  const START_HEIGHT = 5000   // meters above the ground at take-off
  const RUN_TIME = 120        // seconds of play (2 minutes)
  const CRASH_HEIGHT = 0      // the ground; falling past it ends the run

  const GRAVITY = 10          // m/s^2 — fall acceleration ("the more you fall,
                              //   the faster you fall")
  const BASE_FALL_SPEED = 12  // m/s downward right after a crystal catch
  const MAX_FALL_SPEED = 260  // m/s terminal cap

  // ---- steering ---------------------------------------------------------------
  const STEER_SPEED = 1.0     // m/s — hold LEFT / RIGHT to glide sideways
  const COLLECT_RADIUS = 2.5  // meters — |dx| within this collects a crystal

  // ---- the crystal field ------------------------------------------------------
  // Crystals are generated in a band below the player, [MIN_GAP, BAND] meters
  // down. Each crystal's x is a random step from the player's current x so it
  // stays reachable at skydive steering speeds.
  const CRYSTAL_MIN_GAP = 18  // the nearest crystal can sit this far below
  const CRYSTAL_BAND = 380    // how far below the player the field stays stocked
  const CRYSTAL_GAP_MIN = 18  // vertical gap between consecutive crystals
  const CRYSTAL_GAP_MAX = 42
  const CRYSTAL_OFFSET = 8    // crystal x = player.x ± this (clamped to corridor)

  // Higher pitch = bigger lift. n in [0,1] is the crystal's "value" (bias low).
  const LIFT_MIN = 30         // meters of lift from the weakest crystal
  const LIFT_MAX = 160        // meters of lift from the strongest
  const PITCH_MIN = 300       // Hz — the weakest crystal's beacon pitch
  const PITCH_MAX = 950       // Hz — the strongest crystal's beacon pitch

  // A crystal's value n (0..1) drives pitch and lift together, weighted so weak
  // crystals are common and strong ones are rare.
  function valueFor() { return Math.pow(Math.random(), 1.5) }
  function pitchFor(n) { return Math.round(PITCH_MIN + n * (PITCH_MAX - PITCH_MIN)) }
  function liftFor(n) { return Math.round(LIFT_MIN + n * (LIFT_MAX - LIFT_MIN)) }

  // ---- audio pacing -------------------------------------------------------------
  // The target beacon's tick interval as a function of how far below it is.
  // Far away it ticks lazily; it tightens into a flutter just before you fly
  // over it. Clamped both ends.
  function tickInterval(dist) {
    const d = Math.max(0, Math.min(CRYSTAL_BAND, dist))
    return 0.10 + (d / CRYSTAL_BAND) * 0.55 // ~0.65s far -> ~0.10s at the crystal
  }

  // Proximity 0..1 used to scale beacon/ping loudness by vertical distance.
  function proximity(dist, span) {
    return 1 - Math.max(0, Math.min(1, dist / (span || CRYSTAL_BAND)))
  }

  // Only crystals within this many meters below the player are pinged (the
  // beacon guides the nearest one; the others whisper in the background so you
  // can hear a better-pitch crystal and steer for it).
  const PING_SPAN = 120

  // ---- time warnings -------------------------------------------------------------
  // Remaining-seconds thresholds that get an assertive readout (60/30/15/10 then
  // a final 5..1 countdown).
  const TIME_WARNINGS = [60, 30, 15, 10, 5, 4, 3, 2, 1]

  return {
    HALF_WIDTH,
    PAN_SCALE,
    START_HEIGHT,
    RUN_TIME,
    CRASH_HEIGHT,
    GRAVITY,
    BASE_FALL_SPEED,
    MAX_FALL_SPEED,
    STEER_SPEED,
    COLLECT_RADIUS,
    CRYSTAL_MIN_GAP,
    CRYSTAL_BAND,
    CRYSTAL_GAP_MIN,
    CRYSTAL_GAP_MAX,
    CRYSTAL_OFFSET,
    LIFT_MIN,
    LIFT_MAX,
    PITCH_MIN,
    PITCH_MAX,
    valueFor,
    pitchFor,
    liftFor,
    tickInterval,
    proximity,
    PING_SPAN,
    TIME_WARNINGS,
    MAX_SCORE: 9999999,
  }
})()
