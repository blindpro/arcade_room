// Tunables for SEA WOLF. One place for the geometry, the sonar timings, the
// torpedo ballistics and the escort AI, so the feel can be tuned without
// touching logic.
//
// SEA WOLF is an audio-first submarine hunt. You sit submerged in a shipping
// lane; convoys cross your bow. Everything is heard on a FORWARD 180 DEGREE
// ARC — bearing -90 (hard port / left) through 0 (dead ahead) to +90
// (starboard / right) — so pan maps straight onto bearing with no front/back
// ambiguity. Passive sonar gives you every ship's bearing continuously; an
// active PING gives you range, because the echo comes back later the further
// away the ship is. But the ping is heard by the escorts too, and once they
// have you they close in and drop depth charges.
//
// The skill is the LEAD. A torpedo takes range/TORPEDO_SPEED seconds to arrive
// and the target keeps moving, so you must fire at the bearing the ship will
// be at, not the one it is at now.
content.constants = (() => {
  // ---- the arc --------------------------------------------------------------
  // Bearings are degrees, 0 = dead ahead, negative = port (left).
  // pan = bearing / ARC_HALF, so a contact at the edge reads hard left/right.
  const ARC_HALF = 90

  // ---- ranges ---------------------------------------------------------------
  // Meters. Everything is scaled for arcade pacing, not for realism: a real
  // torpedo run would be minutes.
  const SPAWN_RANGE = 1300      // contacts appear at about this range
  const DESPAWN_RANGE = 1500    // ...and are forgotten past this
  const MIN_ENGAGE_RANGE = 200  // closer than this a torpedo has no time to arm
  // Convoys cross at anything from close aboard to the edge of the field. The
  // near end matters: a close convoy is loud, its echoes come straight back and
  // the shot is quick — but its escorts are already on top of you.
  const TRACK_NEAR = 320
  const TRACK_FAR = 950

  // ---- the periscope --------------------------------------------------------
  const AIM_SPEED = 46          // degrees/second while holding left/right
  const AIM_FINE_SPEED = 13     // ...while also holding shift
  // The aim tone sweeps this pitch range across the arc, so bearing is audible
  // even when nothing is out there to compare against.
  const AIM_PITCH_LOW = 200     // Hz at -90 (hard port)
  const AIM_PITCH_HIGH = 900    // Hz at +90 (hard starboard)
  // Sweeping the aim past a contact's current bearing fires a click.
  const CROSS_ANGLE = 2.5       // degrees

  // ---- torpedoes ------------------------------------------------------------
  // Speed is the lead. For a target crossing your bow the angle you must aim
  // ahead is about asin(shipSpeed / TORPEDO_SPEED) — it depends on the speed
  // ratio, NOT on range — so this number alone decides whether the lead is a
  // few audible degrees or an inaudible sliver. At 160 m/s a freighter needs
  // about 7 degrees and a fast liner about 9.
  const TORPEDO_SPEED = 145     // m/s
  const TORPEDO_LIFE = 12       // seconds before it runs out of fuel
  const TORPEDO_HIT_RADIUS = 26 // meters — how close the run must pass
  const TORPEDO_LOAD = 12       // per patrol
  const RELOAD_TIME = 4.0       // seconds between shots

  // ---- depth ----------------------------------------------------------------
  // Two states. Periscope depth: you can fire, and you hear everything
  // clearly. Deep: charges mostly miss you, but the tubes will not fire and
  // the sea muffles the convoy. The battery only recharges up top.
  const DIVE_TIME = 2.2         // seconds to change depth either way
  const BATTERY_MAX = 100
  const BATTERY_DRAIN = 5.5     // %/s while deep
  const BATTERY_CHARGE = 3.2    // %/s while at periscope depth
  const BATTERY_LOW = 25        // warn below this
  // How much of a charge's damage the depth gets you out of.
  const DEEP_DAMAGE_MULT = 0.25

  // ---- active sonar ---------------------------------------------------------
  // Scaled well above the real 1500 m/s so a long-range echo lands in about
  // two and a half seconds instead of nearly seven.
  const SOUND_SPEED = 1500      // m/s, round trip -> delay = 2 * range / this
  const PING_COOLDOWN = 3.0     // seconds
  // Deliberately below HUNT_THRESHOLD: ONE ping is a risk you can take, and
  // it fades before it kills you. Two in quick succession, or a ping on top
  // of a shot, is what puts them onto you. Range and silence are the trade.
  const PING_NOISE = 0.34       // how much a ping adds to your noise signature

  // ---- being hunted ---------------------------------------------------------
  // `noise` is 0..1: how well the escorts have you. Pings and torpedo shots
  // spike it; running deep and quiet bleeds it away.
  const NOISE_DECAY_DEEP = 0.075   // per second while deep
  const NOISE_DECAY_SHALLOW = 0.035 // per second at periscope depth
  const FIRE_NOISE = 0.22
  const HIT_NOISE = 0.30        // an explosion is the loudest thing out there
  const HUNT_THRESHOLD = 0.5    // escorts acquire you above this
  const LOSE_THRESHOLD = 0.18   // ...and lose you below it
  const ESCORT_ATTACK_RANGE = 480 // meters — starts dropping charges inside this
  const CHARGE_INTERVAL = 3.4   // seconds between charge patterns
  const CHARGE_FALL_TIME = 2.6  // splash -> detonation
  const CHARGE_KILL_RADIUS = 120  // meters, full damage
  const CHARGE_DAMAGE = 34      // hull points at ground zero
  // How wide a pattern lands. The better they have you the tighter it is, so
  // a noisy boat is not just found more often, it is hit harder when it is.
  const CHARGE_SPREAD_LOOSE = 210
  const CHARGE_SPREAD_TIGHT = 95

  // ---- the hull -------------------------------------------------------------
  const HULL_MAX = 100

  // ---- the patrol -----------------------------------------------------------
  const PATROL_TIME = 300       // seconds (5 minutes)
  const TIME_WARNINGS = [120, 60, 30, 15, 10, 5, 4, 3, 2, 1]

  // ---- contacts -------------------------------------------------------------
  // Merchants are the prize; escorts are the problem. Speeds in m/s.
  // `speed` is the cruising speed a ship holds across your bow. An escort also
  // has a `sprint`: it screens the convoy at convoy pace until it has you, and
  // only then opens up — which is why an escort turning on you is audible as a
  // change of pace, not just a change of bearing.
  //
  // The tanker is the prize (9800 tons) and the easiest shot (slowest, so the
  // smallest lead); the liner is worth less but needs the biggest lead. That
  // gradient is the difficulty curve.
  const SHIP_TYPES = {
    freighter: {tonnage: 4200, speed: [15, 19], hum: 62,  screw: 2.1, escort: false},
    tanker:    {tonnage: 9800, speed: [12, 16], hum: 44,  screw: 1.5, escort: false},
    liner:     {tonnage: 6500, speed: [20, 26], hum: 78,  screw: 2.8, escort: false},
    escort:    {tonnage: 1800, speed: [13, 17], hum: 128, screw: 4.6, escort: true, sprint: [26, 33]},
  }

  // A convoy is a burst of merchants with a couple of escorts, then a lull.
  //
  // Cadence is set by DWELL, not by taste. A ship crosses the whole field, so
  // it stays audible for roughly 2 * DESPAWN_RANGE / speed — around two and a
  // half minutes — and the number of ships in the arc at once settles at
  // (ships per convoy / CONVOY_GAP) * dwell. Spawn them any faster and the arc
  // turns into a wall of screw beats with nothing readable in it.
  const CONVOY_GAP = [45, 70]   // seconds between convoys
  const CONVOY_SIZE = [3, 4]    // merchants per convoy
  const CONVOY_ESCORTS = [1, 2]
  // Hard ceiling on how much can be in the water at once, whatever the dice
  // say. This is an audio budget, not a difficulty knob.
  const MAX_CONTACTS = 12

  // ---- helpers --------------------------------------------------------------
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }

  // Bearing (degrees) -> stereo pan. Straight linear mapping so the ear can
  // read a bearing off the pan without a lookup.
  function panOf(bearing) { return clamp(bearing / ARC_HALF, -1, 1) }

  // Aim bearing -> the periscope tone's pitch.
  function aimPitch(bearing) {
    const n = (clamp(bearing, -ARC_HALF, ARC_HALF) + ARC_HALF) / (2 * ARC_HALF)
    return AIM_PITCH_LOW + n * (AIM_PITCH_HIGH - AIM_PITCH_LOW)
  }

  // Range -> 0..1 closeness, used for gain and for how open the low-pass sits.
  // Distant ships are quiet AND dull; near ones are loud AND bright.
  function closeness(range) {
    return clamp(1 - range / DESPAWN_RANGE, 0, 1)
  }

  // Round-trip echo delay for an active ping.
  function echoDelay(range) { return (2 * range) / SOUND_SPEED }

  function rand(lo, hi) { return lo + Math.random() * (hi - lo) }
  function randInt(lo, hi) { return Math.floor(rand(lo, hi + 1)) }

  return {
    ARC_HALF,
    SPAWN_RANGE,
    DESPAWN_RANGE,
    MIN_ENGAGE_RANGE,
    TRACK_NEAR,
    TRACK_FAR,
    AIM_SPEED,
    AIM_FINE_SPEED,
    AIM_PITCH_LOW,
    AIM_PITCH_HIGH,
    CROSS_ANGLE,
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
    NOISE_DECAY_DEEP,
    NOISE_DECAY_SHALLOW,
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
    clamp,
    panOf,
    aimPitch,
    closeness,
    echoDelay,
    rand,
    randInt,
    MAX_SCORE: 9999999,
  }
})()
