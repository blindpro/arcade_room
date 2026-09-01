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
    // and at the edge of the fight. This is the distance channel, and it is the
    // number you decide to attack on, so its resolution has to live where the
    // decision does. Spread over the whole arena it moved from 2.7 pulses a
    // second to 4.6 across ten units — which meant the difference between "my
    // kick reaches" and "my kick does not reach" was three pulses a second
    // against three and a bit. It is now spread over SPACING_FAR instead, so
    // stepping into range roughly doubles the rate.
    PULSE_NEAR: 0.12,
    PULSE_FAR: 0.70,
    SPACING_FAR: 3.0,           // beyond this you are not in a fight, you are apart
    HEAR_RANGE: 2 * ARENA_HALF, // the widest gap the arena allows
    // The stereo image. The listener is the PLAYER'S FIGHTER — not the screen,
    // not the middle of the arena — so a source's pan is worked out from where
    // it stands relative to where the player is standing right now.
    //
    // The scale that matters is FIGHTING distance, not arena width. Almost
    // every moment of a match happens between about half a unit and two units
    // apart, so normalising the pan against ARENA_HALF put the opponent within
    // 15 degrees of dead centre for the entire fight — technically stereo, and
    // useless for telling which side they were on. EAR_FULL_PAN is the offset
    // at which the image is already hard over; beyond it the pan stops widening
    // and the pulse RATE carries the remaining distance, which is the division
    // of labour the whole audio design is built on.
    EAR_FULL_PAN: 1.5,          // arena units to reach full pan
    EAR_CURVE: 0.6,             // <1 widens small offsets
    // The three things that actually place a sound, and how far each is pushed
    // at full pan. See the panner in content/audio.js.
    EAR_ITD: 0.00062,           // seconds of extra delay on the far ear
    EAR_SHADOW_HZ: 2000,        // far-ear lowpass — a head is in the way
    EAR_FAR_TRIM: 0.92,         // <1 so the far channel never reaches silence

    // ---- helpers ---------------------------------------------------------
    clamp: (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v),
    lerp: (a, b, t) => a + (b - a) * t,

    // 1 at touching range, 0 at the far wall. Every LOUDNESS in the game curves
    // through this, and only loudness: it is deliberately gentle, because a cue
    // that fades out with distance is a cue you stop being able to read.
    closeness: function (dist) {
      const t = this.clamp(dist / this.HEAR_RANGE, 0, 1)
      return (1 - t) * (1 - t)
    },

    // 1 at touching range, 0 once you are simply apart. This is the SPACING
    // reading — the one the pulse rate carries — and it is linear on purpose:
    // every tenth of a unit between the bodies is worth the same amount of
    // change, because they are all worth the same amount to the player.
    spacing: function (dist) {
      const lo = this.MIN_SEPARATION
      const t = this.clamp((dist - lo) / (this.SPACING_FAR - lo), 0, 1)
      return 1 - t
    },

    // Where a source sits in the stereo image: -1 hard left, 0 dead centre,
    // +1 hard right. This is the ONE place arena space becomes ear space, and
    // it takes both positions explicitly, because a pan is meaningless without
    // saying who is listening. `listenerX` is the player's own x, so a source
    // standing where the player stands is centred, and walking past the
    // opponent swings them across the image rather than moving the arena.
    //
    // The curve is the important part. A linear map spends most of its range on
    // offsets that never happen; raising the normalised offset to EAR_CURVE
    // pushes the resolution down into the first unit and a half, where the
    // fight actually is. Standing almost on top of someone still reads as a
    // side rather than as "in front of me".
    panOf: function (sourceX, listenerX) {
      const t = this.clamp((sourceX - (listenerX || 0)) / this.EAR_FULL_PAN, -1, 1)
      return Math.sign(t) * Math.pow(Math.abs(t), this.EAR_CURVE)
    },
  }
})()
