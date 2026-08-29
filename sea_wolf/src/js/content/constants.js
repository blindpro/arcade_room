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
//   3. the EVASION — escorts shoot back with torpedoes of their own, aimed at
//      the depth you were at when they fired. Changing depth is the dodge, and
//      it is slow (see DIVE_RATE), so it is a decision you commit to early.
content.constants = (() => {
  // ---- the boat -------------------------------------------------------------
  // Submarine handling: heavy, slow to answer the rudder, and it cannot turn
  // at all when stopped. Speeds are arcade, not realistic — a real boat would
  // take an hour to reach anything.
  const SPEED_MAX_SHALLOW = 18   // m/s at periscope depth
  const SPEED_MAX_DEEP = 10      // m/s at MAX_DEPTH; running deep costs the chase
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
  // Depth is a real axis now, not a toggle. Four ordered levels, and the boat
  // travels between them at a fixed rate - a run from periscope depth to the
  // cellar is the better part of fifteen seconds, and the same again coming
  // back. That slowness is the point: an escort's torpedo is aimed at the
  // depth you were at when it left the tube, so depth is how you dodge, but
  // you have to start the dodge long before you are sure you need it.
  const DEPTH_LEVELS = [0, 100, 200, 300]   // metres
  const MAX_DEPTH = DEPTH_LEVELS[DEPTH_LEVELS.length - 1]
  const DIVE_RATE = 21           // m/s going down
  const RISE_RATE = 15           // m/s coming up; blowing tanks is the slow way
  // Within this many metres of the surface the periscope is up: you can shoot,
  // the battery charges, and a ship's keel can find you.
  const PERISCOPE_BAND = 12
  const SHIP_DRAFT = 45          // below this nothing on the surface can reach you

  const BATTERY_MAX = 100
  // Drain is a fixed cost for being under plus a term that grows with depth,
  // so sitting at 300 is much more expensive than sitting at 100.
  const BATTERY_DRAIN_BASE = 0.8  // %/s below the periscope band
  const BATTERY_DRAIN_DEPTH = 1.7 // %/s more, at MAX_DEPTH; a round trip to 300 is most of a full charge
  const BATTERY_CHARGE = 3.0     // %/s at periscope depth
  const BATTERY_LOW = 25

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
  // ---- what the escorts shoot back with -------------------------------------
  // Escorts fight the way you do: they run in and launch torpedoes. An escort
  // torpedo is unguided - it leaves on a lead solution for where the boat will
  // be, running at the depth the boat was at when it fired - so every one of
  // them can be beaten by changing course, speed or depth after you hear it
  // launch. That makes an incoming run a puzzle rather than a die roll, which
  // is what the old depth-charge pattern was.
  const ESCORT_FIRE_RANGE = 1400  // they will shoot from this far out
  // ...and they hold off at least this far, which is the number that makes the
  // whole fight work: at ENEMY_TORPEDO_SPEED a shot from 600 metres takes the
  // better part of six seconds to arrive, and six seconds is just enough to
  // change one level of depth. Let an escort in closer than this and the flight
  // time drops below the dive time, at which point nothing you do matters.
  const ESCORT_FIRE_MIN = 600
  const ESCORT_FIRE_INTERVAL = 7.5
  const ESCORT_AIM_ERROR = 7      // degrees of scatter when they barely have you
  const ESCORT_AIM_ERROR_MIN = 1.6 // ...and when they have you cold
  // They have to guess your depth as well as your position, and a deep boat is
  // much harder to fix: this is the metres of error at MAX_DEPTH, scaling to
  // nothing at the surface. Read against ENEMY_TORPEDO_DEPTH_BAND it sets the
  // shape of the whole ladder - at 100 metres they still have you, at 200 you
  // beat about a third of their shots, and at 300 you beat well over half.
  // That gradient is what makes the bottom of the ladder worth the battery,
  // the speed and the fourteen seconds it costs to get there.
  const ESCORT_DEPTH_ERROR = 160
  const ENEMY_TORPEDO_SPEED = 105
  const ENEMY_TORPEDO_LIFE = 17
  const ENEMY_TORPEDO_HIT_RADIUS = 30
  // Vertical miss distance. A fish set for periscope depth passes harmlessly
  // over a boat at 100 metres, which is the whole reason to dive.
  const ENEMY_TORPEDO_DEPTH_BAND = 40
  const ENEMY_TORPEDO_ARM = 140   // it has not armed this close to its launcher
  const ENEMY_TORPEDO_DAMAGE = 28

  // ---- ramming --------------------------------------------------------------
  // Steel meets steel and both sides pay. Only possible above SHIP_DRAFT, so a
  // deep boat can neither be rammed nor do the ramming.
  const COLLIDE_RADIUS = 34
  const COLLIDE_DAMAGE_SUB = 34   // to the boat, at a head-on closing speed
  const COLLIDE_DAMAGE_SHIP = 58  // to the ship
  const COLLIDE_MIN_MULT = 0.35   // even a gentle scrape costs this much of it
  const COLLIDE_COOLDOWN = 2.5    // seconds before the same ship can hit you again
  const COLLIDE_NOISE = 0.45      // a ram is about the loudest thing you can do

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
  //
  // `hull` only matters for ramming - a torpedo sinks anything it reaches. A
  // loaded tanker shrugs off a scrape; an escort does not.
  const SHIP_TYPES = {
    freighter: {tonnage: 4200, speed: [11, 14], voice: 62,  escort: false, hull: 100},
    tanker:    {tonnage: 9800, speed: [8, 11],  voice: 44,  escort: false, hull: 130},
    liner:     {tonnage: 6500, speed: [15, 18], voice: 78,  escort: false, hull: 90},
    escort:    {tonnage: 1800, speed: [12, 16], voice: 128, escort: true, sprint: [20, 25], hull: 55},
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

  // 0 at the surface, 1 in the cellar. Everything that scales with depth -
  // speed, noise, battery - reads it from here.
  function depthFraction(depth) { return clamp(depth / MAX_DEPTH, 0, 1) }

  // Index of the ordered level nearest a depth, so page up/down can step from
  // wherever the boat actually is rather than from where it was told to go.
  function nearestLevel(depth) {
    let best = 0
    for (let i = 1; i < DEPTH_LEVELS.length; i++) {
      if (Math.abs(DEPTH_LEVELS[i] - depth) < Math.abs(DEPTH_LEVELS[best] - depth)) best = i
    }
    return best
  }

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
    DEPTH_LEVELS,
    MAX_DEPTH,
    DIVE_RATE,
    RISE_RATE,
    PERISCOPE_BAND,
    SHIP_DRAFT,
    BATTERY_MAX,
    BATTERY_DRAIN_BASE,
    BATTERY_DRAIN_DEPTH,
    BATTERY_CHARGE,
    BATTERY_LOW,
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
    ESCORT_FIRE_RANGE,
    ESCORT_FIRE_MIN,
    ESCORT_FIRE_INTERVAL,
    ESCORT_AIM_ERROR,
    ESCORT_AIM_ERROR_MIN,
    ESCORT_DEPTH_ERROR,
    ENEMY_TORPEDO_SPEED,
    ENEMY_TORPEDO_LIFE,
    ENEMY_TORPEDO_HIT_RADIUS,
    ENEMY_TORPEDO_DEPTH_BAND,
    ENEMY_TORPEDO_ARM,
    ENEMY_TORPEDO_DAMAGE,
    COLLIDE_RADIUS,
    COLLIDE_DAMAGE_SUB,
    COLLIDE_DAMAGE_SHIP,
    COLLIDE_MIN_MULT,
    COLLIDE_COOLDOWN,
    COLLIDE_NOISE,
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
    depthFraction,
    nearestLevel,
    rand,
    randInt,
    MAX_SCORE: 9999999,
  }
})()
