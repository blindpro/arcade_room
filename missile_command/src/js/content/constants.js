// Centralized design constants. Read lazily as content.constants from sibling
// modules so cross-module ordering doesn't matter (CLAUDE.md lazy refs).
content.constants = {
  // --- World layout ---
  SCALE: 8,           // metres per world unit
  LISTENER_YAW: 0,    // audio-front already aligned with world +y via worldToAudio

  // --- Batteries ---
  AMMO_PER_BATTERY: 10,
  COOLDOWN_DURATION: 0.7,
  SHOT_DURATION: 0.8,
  DETONATION_Y: 0.45,
  LOCK_RADIUS: 0.40,
  LOCK_TREM_START: 0.25,
  LOCK_TONE_GAIN: 0.28,

  // --- Blasts ---
  BLAST_EXPAND_TIME: 0.35,
  BLAST_HOLD_TIME: 0.25,
  BLAST_CONTRACT_TIME: 0.55,
  BLAST_MAX_RADIUS: 0.22,

  // --- Game phase timers ---
  INTRO_TIMER: 1.4,
  READY_TIMER: 1.0,
  ALL_CITIES_LOST_TIMER: 1.6,
  WAVE_CLEAR_TIMER: 2.0,

  // --- Scoring ---
  SCORE_ICBM: 25,
  SCORE_SPLITTER: 75,
  SCORE_BOMBER: 100,
  SCORE_BOMB: 50,
  BONUS_THRESHOLD_INCREMENT: 10000,
  MISSILE_BONUS_MUL: 5,
  CITY_BONUS_MUL: 100,

  // --- Threats ---
  LEFT_ZONE_BOUNDARY: -0.33,
  RIGHT_ZONE_BOUNDARY: 0.33,
  ICBM_VY: -0.18,
  ICBM_BASE_HZ_MIN: 700,
  ICBM_BASE_HZ_RANGE: 200,
  ICBM_LEVEL: 0.16,
  SPLITTER_BASE_HZ_MIN: 520,
  SPLITTER_BASE_HZ_RANGE: 80,
  SPLITTER_FORK_Y: 0.45,
  SPLITTER_FORK_Y_RANGE: 0.15,
  BOMBER_DROP_Y: 0.5,
  BOMBER_DROP_Y_RANGE: 1.5,
  BOMBER_MAX_BOMB_CHANCE: 0.3,
  BOMBER_SPEED_BASE: 0.18,
  BOMBER_SPEED_RANGE: 0.06,
  BOMBER_SPAWN_Y_BASE: 0.7,
  BOMBER_SPAWN_Y_RANGE: 0.2,
  BOMB_VY: -0.22,
  BOMB_BASE_HZ_MIN: 650,
  BOMB_BASE_HZ_RANGE: 200,
  BOMB_LEVEL: 0.14,
  BOMB_DRIFT_RANGE: 0.04,
  CITY_KILL_RADIUS: 0.18,
  FORK_SPEED_MUL: 1.05,
  FORK_SPREAD: 0.18,
  FORK_SPREAD_MUL: 1.4,
  FORK_HORIZ_DENOM: 0.4,
  SPAWN_Y_OFFSET: 0.02,
  BOMBER_DROP_COOLDOWN_BASE: 1.2,
  BOMBER_DROP_COOLDOWN_RANGE: 1.6,
  BOMBER_BOUNDS: 1.2,
  BOMBER_HIGHPASS_DURATION: 400,

  // --- Voice / pursuit parameters ---
  THREAT_GAIN_THREATENING: 0.95,
  THREAT_GAIN_BOMBER_BOMB: 0.85,
  HARMLESS_GAIN_MUL: 0.20,
  CUTOFF_HARMLESS: 700,
  CUTOFF_THREATENING: 22000,
  ICBM_FREQ_BASE: 380,
  ICBM_FREQ_RANGE: 1600,
  ICBM_CUTOFF_BASE: 900,
  ICBM_CUTOFF_RANGE: 5000,
  SPLITTER_FREQ_BASE: 520,
  SPLITTER_FREQ_RANGE: 1000,
  SPLITTER_CUTOFF: 2800,

  // --- Wave scheduling ---
  FIRST_SPAWN_GRACE: 0.5,
  SPAWN_X_RANGE: 0.8,
  SPLITTER_SPEED_MUL: 0.92,

  WAVE_TABLE: [
    null,
    {count: 9,  splitterRate: 0.00, bomberRate: 0.00, speedMul: 1.05, duration: 28},
    {count: 12, splitterRate: 0.10, bomberRate: 0.00, speedMul: 1.10, duration: 26},
    {count: 14, splitterRate: 0.20, bomberRate: 0.05, speedMul: 1.20, duration: 24},
    {count: 17, splitterRate: 0.25, bomberRate: 0.10, speedMul: 1.35, duration: 22},
    {count: 20, splitterRate: 0.30, bomberRate: 0.15, speedMul: 1.50, duration: 21},
    {count: 23, splitterRate: 0.40, bomberRate: 0.20, speedMul: 1.65, duration: 20},
    {count: 26, splitterRate: 0.45, bomberRate: 0.20, speedMul: 1.80, duration: 19},
    {count: 29, splitterRate: 0.50, bomberRate: 0.25, speedMul: 2.00, duration: 18},
    {count: 32, splitterRate: 0.55, bomberRate: 0.30, speedMul: 2.20, duration: 17},
  ],
  WAVE_BEYOND_COUNT_BASE: 35,
  WAVE_BEYOND_COUNT_PER: 4,
  WAVE_BEYOND_SPLITTER_RATE: 0.60,
  WAVE_BEYOND_BOMBER_RATE: 0.35,
  WAVE_BEYOND_SPEED_MUL: 2.40,
  WAVE_BEYOND_DURATION: 16,
}
