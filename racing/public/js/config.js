const Config = {
  // ============================= Car physics =============================
  MAX_SPEED: 222,                // m/s ~= 800 km/h
  MIN_SPEED: 111,                // m/s ~= 400 km/h
  BOOST_SPEED: 278,              // m/s ~= 1000 km/h
  ACCEL: 12,
  BOOST_ACCEL: 22,
  BRAKE: 45,
  COAST: 15,
  OFFROAD_DECEL: 80,
  STEER_RATE: 2.2,
  CENTRIFUGAL: 0.35,
  BANK_MAX: 0.6,
  HEALTH_MAX: 100,
  BOOST_HEALTH_DRAIN: 18,
  OFFROAD_HEALTH_DRAIN: 12,
  GEAR_COUNT: 6,
  STEER_SMOOTHING: 8,
  NITRO_ACCEL_MUL: 1.6,
  NITRO_SPEED_CAP_MUL: 1.3,
  COAST_OVERSHOOT_MUL: 3,
  DEAD_SPEED_MUL: 0.6,
  SPEED_MIN: 40,
  OFFROAD_X_LIMIT: 1.6,
  BANK_STEER_WEIGHT: 0.7,
  BANK_CURVE_WEIGHT: 0.4,
  BANK_SMOOTHING: 6,
  PITCH_SMOOTHING: 4,
  PITCH_DIVISOR: 500,

  // ============================= Race =============================
  TOTAL_LAPS: 3,
  DT_CEIL: 0.1,
  ANNOUNCE_COOLDOWN: 12,

  // ============================= AI =============================
  AI_DEFAULT_SPEED: 115,
  AI_LANES: [-0.55, 0.55, -0.2, 0.35, -0.4, 0.1],
  AI_Z_STARTS: [250, 450, 650],
  AI_WEAVE_SPEED: 0.7,
  AI_CURVE_BIAS: 0.05,
  AI_WEAVE_AMP: 0.15,
  AI_X_CLAMP: 0.7,
  AI_X_SMOOTHING: 2,
  AI_BASE_TARGET_SPEED: 185,
  AI_INDEX_SPEED_BONUS: 6,
  AI_CATCHUP_THRESHOLD: 800,
  AI_CATCHUP_BOOST: 25,
  AI_SLOWDOWN_THRESHOLD: 800,
  AI_SLOWDOWN_PENALTY: 20,
  AI_SPEED_SMOOTHING: 0.18,

  // ============================= Bump physics =============================
  BUMP_Z_TOL: 50,
  BUMP_X_TOL: 0.22,
  BUMP_PUSH: 0.015,
  BUMP_SELF_SPEED_MUL: 0.985,
  BUMP_OTHER_SPEED_MUL: 0.99,
  BUMP_DAMAGE: 6,
  BUMP_COOLDOWN: 0.5,

  // ============================= Damage =============================
  DAMAGE_DIRECT: 35,
  DAMAGE_HIT: 18,
  DAMAGE_CLIP: 10,
  DAMAGE_THRESHOLD_DIRECT: 0.7,
  DAMAGE_THRESHOLD_HIT: 0.35,

  // ============================= Pickups =============================
  PICKUP_HEALTH_AMOUNT: 30,
  PICKUP_BULLET_AMOUNT: 3,
  PICKUP_NITRO_DURATION: 2.0,

  // ============================= Bullets =============================
  BULLET_Z_SPEED: 600,
  BULLET_X_SPEED: 3.0,
  BULLET_LIFETIME: 3.0,
  BULLET_HIT_Z_TOL: 140,
  BULLET_HIT_X_TOL: 0.5,
  BULLET_AUDIBLE_RANGE: 2500,
  BULLET_MIN_GAP: -200,
  BULLET_FORWARD_DX_WEIGHT: 200,
  BULLET_DIRECTION_X_TOL: 0.05,
  BULLET_START_OFFSET: 8,
  BULLET_TRAVEL_RANGE: 3500,
  BULLET_X_LIMIT: 2.5,
  BULLET_SLOW_MUL_BASE: 0.35,
  BULLET_SLOW_MUL_RANGE: 0.5,
  BULLET_SLOW_T_BASE: 2.0,
  BULLET_SLOW_T_RANGE: 1.2,
  SLOW_T_BASE: 2.0,
  SLOW_T_RANGE: 1.2,
  BOT_SPEED_SLOW_BASE: 0.35,
  BOT_SPEED_SLOW_RANGE: 0.5,
  BOT_SPEED_MIN: 60,
  BULLET_PASS_OFFSET: 40,

  // ============================= Mines =============================
  MINE_LIFETIME: 20.0,
  MINE_GRACE: 0.8,
  MINE_HIT_Z: 45,
  MINE_HIT_X: 0.35,
  MINE_DAMAGE: 35,
  MINE_SPEED_MUL: 0.4,
  MINE_SPEED_MIN: 60,

  // ============================= Audio / proximity =============================
  AUDIO_PROXIMITY_DENOM: 2500,
  FIRE_PAN_LEFT: -0.7,
  FIRE_PAN_RIGHT: 0.7,
  FIRE_PAN_FORWARD: 0,
  FIRE_DIR_PAN_LEFT: -0.3,
  FIRE_DIR_PAN_RIGHT: 0.3,

  // ============================= Bot spawning (single-player) =============================
  SP_BOT_CHECK_INTERVAL: 2.0,
  SP_BOT_MAX: 6,
  SP_BOT_SPEED: 180,
  SP_BOT_SPAWN_AHEAD: 500,
  SP_BOT_SPAWN_RANGE: 300,
  SP_BOT_GAP_THRESHOLD: 0.5,

  // ============================= Online =============================
  NET_INPUT_HZ: 20,
  NET_SNAP_HZ: 15,
  ONLINE_START_Z_MUL: 40,
  BOT_START_Z_BASE: 250,
  BOT_START_Z_STAGGER: 200,
}
