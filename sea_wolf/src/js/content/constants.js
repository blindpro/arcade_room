// Tunables for SEA WOLF. One place for the boat, the geometry, the sonar
// timings, the torpedo ballistics and the escort AI, so the feel can be tuned
// without touching logic.
//
// SEA WOLF is an audio-first submarine hunt. You DRIVE the boat — rudder,
// throttle and depth — around a full 360 degree ocean, hunting convoys and
// running from their escorts.
//
// Audio model (the same one dogfight uses, and the reason this game was
// rebuilt): every sound goes through a syngen BINAURAL EAR placed in
// listener-local coordinates, so front/back and distance are real perceptual
// cues instead of a stereo slider. On top of that, contacts are found by
// RATE-CODED BEEPS — the gap between beeps is the range, and the pitch says
// whether the thing is ahead of you or behind you. A continuous drone panned
// left and right tells you almost nothing; a beep that speeds up as you close
// and drops an octave when it slips behind you tells you everything.
//
// Two skills stack:
//   1. the INTERCEPT — hear a convoy, work out which way it is going, and get
//      the boat into a firing position before it is past you. Speed is noise,
//      so closing fast is what gets you found.
//   2. the LEAD — a torpedo takes range/TORPEDO_SPEED to arrive and the target
//      keeps moving, so you fire at where the ship will be.
content.constants = (() => {
  // ---- the boat -------------------------------------------------------------
  // Submarine handling: heavy, slow to answer the rudder, and it cannot turn
  // at all when stopped. Speeds are arcade, not realistic — a real boat would
  // take an hour to reach anything.
  const SPEED_MAX_SHALLOW = 18   // m/s at periscope depth
  const SPEED_MAX_DEEP = 10      // m/s deep; running deep costs you the chase
  const ACCEL = 3.2              // m/s^2 toward the throttle's target speed
  const DECEL = 2.0              // m/s^2 when the throttle is below your speed
  const THROTTLE_STEP = 0.9      // throttle units/second while held
  const RUDDER_RATE = 30         // degrees/second at full way on
  // The rudder needs water over it. At a dead stop you barely turn at all;
  // this is the fraction of full turn rate available at zero speed.
  const RUDDER_MIN_EFFECT = 0.12

  // ---- the periscope --------------------------------------------------------
  // Torpedoes leave on the periscope bearing, which is an offset from the bow.
  // The boat does the coarse aiming and the periscope does the fine — nobody
  // wants to steer a 2000-tonne boat to correct a 4 degree lead.
  const PERISCOPE_LIMIT = 45     // degrees either side of the bow
  const PERISCOPE_SPEED = 26     // degrees/second
  const PERISCOPE_FINE = 9       // ...while holding shift

  // ---- ranges ---------------------------------------------------------------
  const CONTACT_RANGE = 2200     // beyond this a contact is not audible at all
  const DESPAWN_RANGE = 4200     // ...and past this it is forgotten entirely
  const MIN_ENGAGE_RANGE = 180   // closer than this a torpedo has not armed
  // Where a new convoy is put down relative to the boat: close enough to hear
  // and reach, far enough that the intercept is a real decision.
  const SPAWN_NEAR = 900
  const SPAWN_FAR = 2100

  // ---- proximity beeps (the primary navigation cue) -------------------------
  // Interval ramps from SLOW at the edge of hearing to FAST alongside; pitch
  // says ahead or astern. This is the whole find-the-convoy interface.
  const BEEP_SLOW = 1.5          // seconds between beeps at CONTACT_RANGE
  const BEEP_FAST = 0.16         // ...and when it is right on top of you
  const BEEP_AHEAD = 1180        // Hz when the contact is forward of the beam
  const BEEP_ASTERN = 460        // Hz when it is abaft the beam
  // Escorts beep on a different waveform so a threat never sounds like a prize.
  const BEEP_MERCHANT_TYPE = 'sine'
  const BEEP_ESCORT_TYPE = 'square'

  // ---- close-aboard voice ---------------------------------------------------
  // A continuous screw voice, but only for ships you are nearly under.
  // Deliberately SHORT-RANGE: a permanent drone for every distant contact is
  // exactly the uninformative wash this game had before it was rebuilt, so the
  // continuous layer is only allowed where it actually means something.
  // Set to 0 to switch the continuous layer off entirely.
  const CLOSE_VOICE_RANGE = 420

  // ---- torpedoes ------------------------------------------------------------
  // Speed is the lead. For a target crossing your bow the angle you must aim
  // ahead is about asin(shipSpeed / TORPEDO_SPEED) — it depends on the speed
  // ratio and NOT on range — so this number alone decides whether the core
  // skill is audible or an inaudible sliver.
  const TORPEDO_SPEED = 145      // m/s
  const TORPEDO_LIFE = 14        // seconds before it runs out of fuel
  const TORPEDO_HIT_RADIUS = 26  // meters
  const TORPEDO_LOAD = 14        // per patrol
  const RELOAD_TIME = 3.5        // seconds between shots

  // ---- depth ----------------------------------------------------------------
  const DIVE_TIME = 2.2
  const BATTERY_MAX = 100
  const BATTERY_DRAIN = 4.0      // %/s while deep
  const BATTERY_CHARGE = 3.0     // %/s at periscope depth
  const BATTERY_LOW = 25
  const DEEP_DAMAGE_MULT = 0.25

  // ---- active sonar ---------------------------------------------------------
  const SOUND_SPEED = 1500       // m/s; round-trip delay = 2 * range / this
  const PING_COOLDOWN = 3.0
  const PING_NOISE = 0.34        // deliberately below HUNT_THRESHOLD

  // ---- being hunted ---------------------------------------------------------
  // The noise economy. SPEED is now the constant term — a boat at flank is
  // loud the whole time, which is the price of the intercept. Pings, shots and
  // hits are spikes on top of it.
  const SPEED_NOISE = 0.10       // added per second at FULL speed, shallow
  // Noise goes as speed^SPEED_NOISE_POWER. With decay at 0.055/s that puts
  // break-even at about three quarters throttle: below it you are shedding
  // noise no matter how long you run, above it you are on a clock.
  const SPEED_NOISE_POWER = 2
  const DEEP_NOISE_MULT = 0.45   // running deep is quieter at the same speed
  const NOISE_DECAY = 0.055      // per second, always shedding
  // Going deep is how you break contact, so silence pays off faster down
  // there. Without this the only way out of a hunt was to outrun escorts
  // that are faster than you — which is to say, no way out at all.
  const NOISE_DECAY_DEEP_MULT = 1.9
  const FIRE_NOISE = 0.22
  const HIT_NOISE = 0.30
  const HUNT_THRESHOLD = 0.5
  const LOSE_THRESHOLD = 0.24
  const ESCORT_ATTACK_RANGE = 380
  const CHARGE_INTERVAL = 3.4
  const CHARGE_FALL_TIME = 2.6
  const CHARGE_KILL_RADIUS = 120
  const CHARGE_DAMAGE = 26
  const CHARGE_SPREAD_LOOSE = 210
  const CHARGE_SPREAD_TIGHT = 95

  // ---- the hull -------------------------------------------------------------
  const HULL_MAX = 100

  // ---- the patrol -----------------------------------------------------------
  const PATROL_TIME = 360        // seconds (6 minutes)
  const TIME_WARNINGS = [180, 120, 60, 30, 15, 10, 5, 4, 3, 2, 1]

  // ---- contacts -------------------------------------------------------------
  // The tanker is the prize (9800 tons) and the easiest shot (slowest, so the
  // smallest lead); the liner is worth less, needs the biggest lead, and is
  // fast enough to run away from you. That gradient is the difficulty curve.
  //
  // `voice` is the close-aboard screw pitch: low for a loaded tanker, high for
  // an escort's fast screws.
  const SHIP_TYPES = {
    freighter: {tonnage: 4200, speed: [11, 14], voice: 62,  escort: false},
    tanker:    {tonnage: 9800, speed: [8, 11],  voice: 44,  escort: false},
    liner:     {tonnage: 6500, speed: [15, 18], voice: 78,  escort: false},
    escort:    {tonnage: 1800, speed: [12, 16], voice: 128, escort: true, sprint: [20, 25]},
  }

  const CONVOY_GAP = [26, 40]    // seconds between convoys
  const CONVOY_SIZE = [2, 4]     // merchants per convoy
  const CONVOY_ESCORTS = [1, 2]
  // An audio budget, not a difficulty knob.
  const MAX_CONTACTS = 10

  // ---- helpers --------------------------------------------------------------
  const DEG = 180 / Math.PI

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }
  function lerp(a, b, t) { return a + (b - a) * clamp(t, 0, 1) }

  // Wrap a bearing into (-180, 180].
  function wrapDeg(d) {
    let x = d % 360
    if (x > 180) x -= 360
    if (x <= -180) x += 360
    return x
  }

  // Range -> 0..1 closeness, driving beep rate and gain.
  function closeness(range) { return clamp(1 - range / CONTACT_RANGE, 0, 1) }

  // Beep interval for a contact at `range`.
  function beepInterval(range) { return lerp(BEEP_SLOW, BEEP_FAST, closeness(range)) }

  function echoDelay(range) { return (2 * range) / SOUND_SPEED }

  function rand(lo, hi) { return lo + Math.random() * (hi - lo) }
  function randInt(lo, hi) { return Math.floor(rand(lo, hi + 1)) }

  return {
    SPEED_MAX_SHALLOW,
    SPEED_MAX_DEEP,
    ACCEL,
    DECEL,
    THROTTLE_STEP,
    RUDDER_RATE,
    RUDDER_MIN_EFFECT,
    PERISCOPE_LIMIT,
    PERISCOPE_SPEED,
    PERISCOPE_FINE,
    CONTACT_RANGE,
    DESPAWN_RANGE,
    MIN_ENGAGE_RANGE,
    SPAWN_NEAR,
    SPAWN_FAR,
    BEEP_SLOW,
    BEEP_FAST,
    BEEP_AHEAD,
    BEEP_ASTERN,
    BEEP_MERCHANT_TYPE,
    BEEP_ESCORT_TYPE,
    CLOSE_VOICE_RANGE,
    TORPEDO_SPEED,
    TORPEDO_LIFE,
    TORPEDO_HIT_RADIUS,
    TORPEDO_LOAD,
    RELOAD_TIME,
    DIVE_TIME,
    BATTERY_MAX,
    BATTERY_DRAIN,
    BATTERY_CHARGE,
    BATTERY_LOW,
    DEEP_DAMAGE_MULT,
    SOUND_SPEED,
    PING_COOLDOWN,
    PING_NOISE,
    SPEED_NOISE,
    SPEED_NOISE_POWER,
    DEEP_NOISE_MULT,
    NOISE_DECAY,
    NOISE_DECAY_DEEP_MULT,
    FIRE_NOISE,
    HIT_NOISE,
    HUNT_THRESHOLD,
    LOSE_THRESHOLD,
    ESCORT_ATTACK_RANGE,
    CHARGE_INTERVAL,
    CHARGE_FALL_TIME,
    CHARGE_KILL_RADIUS,
    CHARGE_DAMAGE,
    CHARGE_SPREAD_LOOSE,
    CHARGE_SPREAD_TIGHT,
    HULL_MAX,
    PATROL_TIME,
    TIME_WARNINGS,
    SHIP_TYPES,
    CONVOY_GAP,
    CONVOY_SIZE,
    CONVOY_ESCORTS,
    MAX_CONTACTS,
    DEG,
    clamp,
    lerp,
    wrapDeg,
    closeness,
    beepInterval,
    echoDelay,
    rand,
    randInt,
    MAX_SCORE: 9999999,
  }
})()
