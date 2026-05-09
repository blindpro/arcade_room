const Track = (() => {
  const SEGMENT_LENGTH = 80
  const ROAD_WIDTH = 2400
  const RUMBLE_LENGTH = 3
  const LANES = 5
  const CHECKPOINTS = 4
  const segments = []

  // ── Core builders ──────────────────────────────────────────────────────────

  function lastY() {
    return segments.length ? segments[segments.length - 1].p2.world.y : 0
  }
  function easeIn(a, b, pct)    { return a + (b - a) * pct * pct }
  function easeInOut(a, b, pct) { return a + (b - a) * ((-Math.cos(pct * Math.PI) / 2) + 0.5) }

  function addSegment(curve, y) {
    const n = segments.length
    segments.push({
      index: n,
      p1: { world: { y: lastY(), z: n * SEGMENT_LENGTH }, camera: {}, screen: {} },
      p2: { world: { y,          z: (n + 1) * SEGMENT_LENGTH }, camera: {}, screen: {} },
      curve,
      color: Math.floor(n / RUMBLE_LENGTH) % 2 ? 'dark' : 'light',
    })
  }

  function addRoad(enter, hold, leave, curve, y = 0) {
    const startY = lastY()
    const endY   = startY + y
    const total  = enter + hold + leave
    for (let n = 0; n < enter; n++) addSegment(easeIn(0, curve, n / enter),    easeInOut(startY, endY, n / total))
    for (let n = 0; n < hold;  n++) addSegment(curve,                           easeInOut(startY, endY, (enter + n) / total))
    for (let n = 0; n < leave; n++) addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total))
  }

  // ── Track definitions ──────────────────────────────────────────────────────
  // To add a new track: copy one of the objects below, give it a name,
  // and fill in addRoad calls. Each addRoad is:
  //   addRoad(enter, hold, leave, curve, height)
  //   curve: negative = left, positive = right, 0 = straight
  //   height: positive = uphill, negative = downhill, 0 = flat

  const TRACKS = [

    {
      name: 'Punchy Hills',
      build() {
        addRoad(3, 5,  3,  0.0,   0)   // short start straight
        addRoad(4, 7,  4, -3.5,  40)   // sweeping left + hill up
        addRoad(3, 4,  3,  0.0, -20)   // crest
        addRoad(4, 7,  4,  4.5,   0)   // tight right
        addRoad(3, 9,  3,  0.0,   0)   // straight
        addRoad(3, 5,  3, -5.5,  50)   // sharp left climb
        addRoad(3, 4,  3,  0.0, -50)   // dip
        addRoad(3, 6,  3,  3.0,   0)   // medium right
        addRoad(2, 3,  2, -3.0,   0)   // chicane L
        addRoad(2, 3,  2,  3.0,   0)   // chicane R
        addRoad(3, 10, 3,  0.0,   0)   // back straight
        addRoad(5, 9,  5, -4.5,   0)   // long sweeping left
        addRoad(3, 5,  3,  2.5,  30)   // uphill right
        addRoad(3, 5,  3,  0.0, -30)   // down crest
      }
    },

    {
      name: 'Flowing Valley',
      build() {
        addRoad(5, 12, 5,  0.0,   0)   // long start straight
        addRoad(6, 12, 6, -2.0,  60)   // gentle long left + big climb
        addRoad(4, 8,  4,  0.0, -30)   // crest plateau
        addRoad(5, 10, 5,  2.5,   0)   // sweeping right
        addRoad(4, 14, 4,  0.0,   0)   // long mid straight
        addRoad(4, 8,  4, -3.0,  40)   // left + rise
        addRoad(3, 6,  3,  3.5, -40)   // right + descent
        addRoad(4, 8,  4, -2.0,   0)   // flowing left
        addRoad(4, 8,  4,  2.0,   0)   // flowing right
        addRoad(5, 16, 5,  0.0,   0)   // long back straight
        addRoad(6, 10, 6, -3.5,  50)   // big sweeping left climb
        addRoad(4, 6,  4,  0.0, -50)   // drop
        addRoad(5, 8,  5,  2.0,  20)   // gentle uphill right
        addRoad(4, 6,  4,  0.0, -20)   // flatten out
      }
    },

  ]

  // ── Build ──────────────────────────────────────────────────────────────────

  let activeTrack = null

  function build(trackDef) {
    segments.length = 0
    trackDef.build()
    while (segments.length % RUMBLE_LENGTH) addSegment(0, lastY())
    activeTrack = trackDef.name
    console.log(`[Track] "${trackDef.name}" — ${segments.length} segments`)
  }

  function randomise() {
    const pick = TRACKS[Math.floor(Math.random() * TRACKS.length)]
    build(pick)
  }

  // Pick a random track on first load
  randomise()

  // ── Utility ────────────────────────────────────────────────────────────────

  function getLength()            { return segments.length * SEGMENT_LENGTH }
  function getCheckpointSpacing() { return getLength() / CHECKPOINTS }

  function findSegment(z) {
    const len = segments.length
    return segments[(Math.floor(z / SEGMENT_LENGTH) % len + len) % len]
  }
  function wrap(z) {
    const len = getLength()
    z = z % len
    if (z < 0) z += len
    return z
  }
  function checkpointIndex(z) {
    return Math.floor(wrap(z) / getCheckpointSpacing())
  }

  return {
    SEGMENT_LENGTH,
    ROAD_WIDTH,
    RUMBLE_LENGTH,
    LANES,
    CHECKPOINTS,
    segments,
    get length()            { return getLength() },
    get checkpointSpacing() { return getCheckpointSpacing() },
    get activeTrack()       { return activeTrack },
    findSegment,
    wrap,
    checkpointIndex,
    randomise,
  }
})()