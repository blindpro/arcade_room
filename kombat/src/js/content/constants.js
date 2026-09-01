// KOMBAT constants.
//
// The whole game happens on ONE horizontal line plus a jump arc, so there are
// only two spatial numbers anywhere in this codebase: `x` (where along the
// floor a fighter is) and `y` (how far off the floor). Everything else —
// damage, reach, the AI, the audio — is derived from those two and from the
// clock.
//
// The two numbers map onto two independent perceptual channels, and they never
// swap:
//
//   x  -> STEREO. The opponent is panned to the side they are actually on, and
//         the distance between you is carried by how fast their footstep pulse
//         repeats, not by volume. Volume has to stay free to mean "how hard did
//         that land".
//   y  -> BRIGHTNESS. A grounded fighter is dark and bodied; a fighter in the
//         air is thin and bright and rising. You are not asked to judge a
//         height in metres, only to answer one question — are they on the floor
//         or in the air — because that is the only thing the hit rules care
//         about.
//
// And the attack LEVEL (high or low) gets its own channel again — the pitch
// direction of the tell. A high attack's whoosh sweeps UP, a low one sweeps
// DOWN. That is the single most important sound in the game: it is the half
// second in which you decide to block or to jump.
content.constants = (() => {
  const ARENA_HALF = 5

  return {
    // ---- the floor -------------------------------------------------------
    ARENA_HALF,                 // fighters live in x ∈ [-5, +5]
    MIN_SEPARATION: 0.62,       // bodies do not pass through each other
    WALK_SPEED: 2.7,            // units/second, before the fighter's own mult

    // ---- the jump --------------------------------------------------------
    // W is not just movement — it is the only answer to a low attack, so its
    // timing is a balance number, not a feel number. AIRBORNE_AT is the height
    // above which a low attack passes underneath you: it is deliberately low
    // enough that the jump beats a sweep almost as soon as you leave the floor,
    // and JUMP_TIME is long enough that jumping at the wrong moment leaves you
    // hanging in front of a high attack you can no longer block.
    JUMP_TIME: 0.62,            // seconds, floor to floor
    JUMP_HEIGHT: 1.15,          // peak y
    AIRBORNE_AT: 0.18,          // y above which you count as `air`
    AIR_DRIFT: 0.55,            // fraction of walk speed you keep in the air

    // ---- the round -------------------------------------------------------
    ROUND_TIME: 60,             // seconds; on timeout the higher health wins
    ROUNDS_TO_WIN: 2,           // best of three
    READY_TIME: 2.2,            // "round one — fight" before control unlocks
    KO_TIME: 2.4,               // how long the KO hangs before the next round

    // ---- getting hit -----------------------------------------------------
    HITSTUN: 0.28,              // you cannot act
    BLOCKSTUN: 0.16,            // shorter, which is why blocking keeps its turn
    KNOCKDOWN_TIME: 0.95,       // sweep knockdown, invulnerable while down
    CHIP_FRACTION: 0.12,        // damage a blocked attack still does
    AIR_HIT_BONUS: 1.35,        // catching someone out of the air pays

    // ---- specials --------------------------------------------------------
    SPECIAL_COOLDOWN: 3.6,
    MOTION_WINDOW: 0.40,        // seconds to complete a direction sequence
    PROJECTILE_SPEED: 6.2,

    // ---- audio -----------------------------------------------------------
    // The opponent's footstep pulse: how often it repeats, at touching range
    // and at the far wall. This is the distance channel.
    PULSE_NEAR: 0.16,
    PULSE_FAR: 0.62,
    HEAR_RANGE: 2 * ARENA_HALF, // the widest gap the arena allows
    // The listening stage. Arena units are compressed onto a stage a couple of
    // metres wide, because syngen's binaural ear derives an interaural delay
    // from raw distance and ten units of it would smear every cue.
    EAR_SPREAD: 1.5,            // metres of stage per arena half-width
    EAR_FORWARD: 1.1,           // how far in front of the listener the stage is

    // ---- helpers ---------------------------------------------------------
    clamp: (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v),
    lerp: (a, b, t) => a + (b - a) * t,

    // 1 at touching range, 0 at the far wall. Every distance-driven number in
    // the game goes through this so they all curve the same way.
    closeness: function (dist) {
      const t = this.clamp(dist / this.HEAR_RANGE, 0, 1)
      return (1 - t) * (1 - t)
    },

    // An arena offset placed on the listening stage. syngen wants
    // {x: forward, y: left-positive}, so the sign is flipped exactly once —
    // here, and nowhere else in the game.
    earLocal: function (dx) {
      const spread = this.clamp(dx / this.ARENA_HALF, -1.6, 1.6) * this.EAR_SPREAD
      return {forward: this.EAR_FORWARD, starboard: spread}
    },
  }
})()
