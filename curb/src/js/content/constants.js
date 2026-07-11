/**
 * Curb Game constants — ported verbatim from the original Director/Lingo source
 * (via the TS reference port). Where a value came from the Director score rather
 * than Lingo (stage size, sprite anchors, tempo) it is noted.
 */
content.constants = (() => {
  // Stage (gamesmall.html embed was 320x240).
  const STAGE_WIDTH = 320
  const STAGE_HEIGHT = 240

  // Fixed Director-style frame tempo. All motion below is per-frame steps
  // exactly as the Lingo wrote them; the game screen advances them on a fixed
  // 1/FPS timestep so wall-clock speed is refresh-rate independent.
  const TARGET_FPS = 30
  const FRAME_MS = 1000 / TARGET_FPS

  // Director sound-channel scaling.
  const VOLUME_MAX = 255 // sound(n).volume 0..255 -> gain 0..1
  const PAN_MAX = 100 // sound(n).pan -100..100 -> balance -1..1

  // The magic number throughout MovieScript.ls: volume per frame =
  // gCounter * VOLUME_PER_COUNTER; approach travel per frame = gSpeed * it.
  const VOLUME_PER_COUNTER = 2.54999999999999982

  // Sprite anchors from the score (centre of a 320x240 stage).
  const PLAYER_X = 160
  const CAR_Y = 120
  const WALKER_TOP = 25
  const WALKER_BOTTOM = 215
  const STEP_SIZE = 5
  const WALKER_START_V = WALKER_BOTTOM // starts on the bottom curb heading up
  const WALKER_W = 42
  const WALKER_H = 60

  // Scoring.
  const SCORE_PER_CROSSING = 100
  const EXCITE_LIMIT = 15 // ExciteCount fires when (gExciteCount - 15) > 0
  const EXCITE_PENALTY = 10

  // Level thresholds (DefineLevel): level N = highest entry whose score is met.
  const LEVEL_THRESHOLDS = [
    {score: 5000, level: 11},
    {score: 4500, level: 10},
    {score: 4000, level: 9},
    {score: 3500, level: 8},
    {score: 3000, level: 7},
    {score: 2500, level: 6},
    {score: 2000, level: 5},
    {score: 1500, level: 4},
    {score: 1000, level: 3},
    {score: 500, level: 2},
    {score: 0, level: 1},
  ]

  // gVariatie (how many object types can spawn) per level.
  function variatieForLevel(level) {
    switch (level) {
      case 1: return 5
      case 2: return 6
      case 3: return 11
      case 4: return 14
      case 5: return 16
      case 6: return 18
      default: return 21
    }
  }

  return {
    STAGE_WIDTH, STAGE_HEIGHT, TARGET_FPS, FRAME_MS,
    VOLUME_MAX, PAN_MAX, VOLUME_PER_COUNTER,
    PLAYER_X, CAR_Y, WALKER_TOP, WALKER_BOTTOM, STEP_SIZE,
    WALKER_START_V, WALKER_W, WALKER_H,
    SCORE_PER_CROSSING, EXCITE_LIMIT, EXCITE_PENALTY,
    LEVEL_THRESHOLDS, variatieForLevel,
  }
})()
