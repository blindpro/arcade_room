// Tunables for PIPE. One place for the tunnel geometry, the flight model, the
// scoring and the audio pacing, so the feel can be tuned without touching logic.
//
// PIPE is an audio-first tunnel run. You fly down a metal pipe whose cross-
// section is divided into 1-meter lanes. The pipe grows wider with every level
// and every so often a ring blocks it: the ring's opening spans a set of lanes,
// and you must be inside that span when you reach the ring or you slam into the
// wall, lose a life and get thrown back to re-approach it. The opening is
// marked by a hum that pings at its centre — steer LEFT / RIGHT (hold to glide)
// so the hum is dead ahead. Every 10th level is a bonus cavern: no rings, just
// bonus items pitched by how many points they're worth, then an opening that
// spans every lane so you can't miss. Your speed rises every level; the game is
// effectively unlimited and your score is how far you got plus the bonus points.
// All audio is STEREO, centred on the player: pan = lane offset, loudness =
// forward distance.
content.constants = (() => {
  // ---- geometry ---------------------------------------------------------------
  // Lanes are 1 meter wide. The pipe keeps PIPE_MARGIN wall-lanes on each side
  // of the opening, so the pipe is always wider than the opening and slamming is
  // always possible. Level 1 = 3 opening lanes + 6 wall lanes = a 9-lane pipe.
  const LANE_W = 1
  const PIPE_MARGIN = 3

  // The opening's width in lanes: 3 at level 1, +1 per level to level 5, +2 per
  // level from 6 to 10, +3 per level after that.
  function openingWidth(level) {
    const l = Math.max(1, level | 0)
    let w = 3
    w += Math.max(0, Math.min(l - 1, 4))     // levels 2–5: +1 each (→7 at level 5)
    w += 2 * Math.max(0, Math.min(l - 6, 5)) // levels 6–10: +2 each (→17 at level 10)
    w += 3 * Math.max(0, l - 11)             // level 11+: +3 each
    return w
  }
  function pipeLanes(level) { return openingWidth(level) + 2 * PIPE_MARGIN }

  // ---- the flight ---------------------------------------------------------------
  const BASE_SPEED = 10      // m/s at level 1
  const SPEED_PER_LEVEL = 2  // m/s added every level
  const MAX_SPEED = 48
  function speedAt(level) { return Math.min(MAX_SPEED, BASE_SPEED + (level - 1) * SPEED_PER_LEVEL) }

  const STEER_SPEED = 1.1    // m/s lateral glide while a direction is held
  const LIVES = 3

  // ---- rings --------------------------------------------------------------------
  const RINGS_PER_LEVEL = 5  // rings to pass before the level advances
  const RING_SPACING_MIN = 30
  const RING_SPACING_MAX = 55
  const HORIZON = 240        // meters ahead the field is pre-generated
  const THROWBACK = 22       // meters a slam throws you back (re-approach the ring)

  // ---- bonus cavern ---------------------------------------------------------------
  function isBonusLevel(level) { return (level | 0) % 10 === 0 }
  const BONUS_CAVERN_LEN = 160
  const BONUS_ITEMS_MIN = 14
  const BONUS_ITEMS_MAX = 20
  const ITEM_POINTS = [100, 250, 500, 750, 1000]
  const COLLECT_RADIUS = 0.45 // meters around a lane centre that collects an item
  function itemPoints() {
    const roll = Math.pow(Math.random(), 1.4) // bias toward the cheap items
    const i = Math.max(0, Math.min(ITEM_POINTS.length - 1, Math.floor(roll * ITEM_POINTS.length)))
    return ITEM_POINTS[i]
  }
  function itemPitch(points) {
    const lo = ITEM_POINTS[0], hi = ITEM_POINTS[ITEM_POINTS.length - 1]
    return Math.round(300 + ((points - lo) / (hi - lo)) * 650) // 300..950 Hz
  }

  // ---- audio pacing ----------------------------------------------------------------
  // The tunnel hum's tick interval as a function of how far ahead the ring is.
  // Far away it ticks lazily; it tightens into a flutter just as you reach it.
  function tickInterval(dist) {
    const span = 90
    const d = Math.max(0, Math.min(span, dist))
    return 0.10 + (d / span) * 0.60 // ~0.70s far -> ~0.10s at the ring
  }
  // Proximity 0..1 used to scale hum/item loudness by forward distance.
  function proximity(dist, span) {
    return 1 - Math.max(0, Math.min(1, dist / (span || 90)))
  }

  const APPROACH_SPAN = 90   // meters ahead the hum starts tightening
  const PING_SPAN = 55       // meters ahead items whisper

  // ---- scoring ---------------------------------------------------------------------
  const MAX_SCORE = 9999999

  return {
    LANE_W,
    PIPE_MARGIN,
    openingWidth,
    pipeLanes,
    BASE_SPEED,
    SPEED_PER_LEVEL,
    MAX_SPEED,
    speedAt,
    STEER_SPEED,
    LIVES,
    RINGS_PER_LEVEL,
    RING_SPACING_MIN,
    RING_SPACING_MAX,
    HORIZON,
    THROWBACK,
    isBonusLevel,
    BONUS_CAVERN_LEN,
    BONUS_ITEMS_MIN,
    BONUS_ITEMS_MAX,
    ITEM_POINTS,
    COLLECT_RADIUS,
    itemPoints,
    itemPitch,
    tickInterval,
    proximity,
    APPROACH_SPAN,
    PING_SPAN,
    MAX_SCORE,
  }
})()
