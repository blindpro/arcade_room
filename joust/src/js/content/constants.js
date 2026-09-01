// Tunables for JOUST. One place for the flap physics, the arena, the duel
// geometry, the rider tiers, the eggs and the wave schedule, so the feel can be
// tuned without touching logic.
//
// JOUST is an audio-first flying duel. You ride a mount over a wrapping arena.
// You do not have an altitude control — you have a WING, and each press of it
// buys you a little height against gravity. Enemy riders share the air. When
// two riders collide, the HIGHER one wins outright; the loser dies and drops an
// egg, which falls, sits ticking, and hatches into something worse if you do
// not collect it in time.
//
// ---------------------------------------------------------------------------
// The audio model, which is the whole reason this game is worth porting
// ---------------------------------------------------------------------------
// Joust has exactly two spatial axes and they are not equally important, so
// they get two different perceptual channels and never compete:
//
//   HORIZONTAL is BINAURAL. Every rider, egg and wing beat is placed through a
//   syngen binaural ear, laid out left-to-right in front of the listener. This
//   is what stereo does natively and effortlessly.
//
//   ALTITUDE is PITCH, and it is RELATIVE to you. A rider's voice is not
//   "the pitch of its height above the ground" — it is REFERENCE_HZ scaled by
//   how far above or below YOU it is. So:
//
//       higher pitch than the reference  =  it is above you  =  it kills you
//       lower  pitch than the reference  =  it is below you  =  you kill it
//       the same pitch as the reference  =  a bounce, and a coin flip
//
//   That last case is the good part. A quiet reference drone at REFERENCE_HZ
//   runs the whole time you are alive, so a rider level with you BEATS against
//   it acoustically — the tie sounds physically unstable, which is exactly
//   what it is. Nothing had to be built for that; it falls out of putting the
//   reference in the room.
//
// Altitude therefore never touches the binaural ear (z is always 0). Pitch owns
// it exclusively, which is what keeps the two axes legible at the same time.
//
// The one thing pitch cannot tell you is your ABSOLUTE height, because it is a
// relative mapping. That is what the deck wash and the ceiling hiss are for:
// the floor and the roof announce themselves as you approach them.
content.constants = (() => {
  // ---- the arena ------------------------------------------------------------
  // A wrapping strip with a solid deck and a hard roof. Wrapping means you can
  // never be cornered and a chase never ends at a wall — and because bearings
  // are always taken by the SHORTEST way round, the wrap is invisible: a rider
  // running off your right simply arrives on your left.
  // Sized so that crossing it takes about six seconds at top speed. It was
  // half again as wide during development and the game was worse for it: waves
  // took four minutes because you spent them commuting, and the beat-rate ramp
  // had to cover so much ground that the useful part of it — the last thirty
  // units, where you actually decide something — was squeezed into nothing.
  const ARENA_WIDTH = 180     // units; the strip wraps at this width
  const CEILING = 100         // units of altitude above the deck
  // Half the width is therefore the furthest anything can ever be from you.
  const HEAR_RANGE = ARENA_WIDTH / 2

  // ---- the wing -------------------------------------------------------------
  // The signature feel: flapping is a DISCRETE event, not a held control.
  // Holding the key does nothing; you pump it. Each beat adds FLAP_IMPULSE to
  // your vertical speed, gravity takes it back, and CLIMB_MAX caps what mashing
  // can buy you — so a climb is a sustained effort rather than a button.
  const GRAVITY = 26          // units/s^2
  const FLAP_IMPULSE = 13     // units/s added per beat
  const FLAP_COOLDOWN = 0.20  // seconds; ~5 beats/second is the ceiling
  const CLIMB_MAX = 24        // units/s up, however hard you flap
  const FALL_MAX = 32         // units/s down, terminal velocity
  // A full climb from the deck to the roof is therefore about four seconds of
  // continuous work, and a full fall about three. Altitude is a commitment.

  // ---- moving sideways ------------------------------------------------------
  // Air control is deliberately poor and momentum carries you: turning around
  // in mid-air takes time, and that lag is most of the game's tension.
  // Drag is what actually sets the top speed here (thrust/drag), not the caps
  // below — those are a backstop. In the air that works out at about 29 units/s
  // reached over a lazy second and a bit; on the deck it is about the same
  // speed but reached almost at once, which is the trade: the ground is
  // responsive and fast, and it is also the lowest place in the arena, so
  // everything airborne beats you there.
  const THRUST_AIR = 26       // units/s^2
  const THRUST_GROUND = 70    // running on the deck answers immediately
  const DRAG_AIR = 0.9        // per second, linear
  const DRAG_GROUND = 2.4
  const SPEED_MAX_AIR = 30
  const SPEED_MAX_GROUND = 34

  // ---- the pitch mapping ----------------------------------------------------
  // ALT_OCTAVE is the single most important number in the game: it decides
  // whether the difference between "you win this collision" and "you lose it"
  // is an audible interval or an inaudible sliver.
  //
  // At 12 units per octave, the DUEL_MARGIN of 2.5 units is 2.5/12 of an
  // octave — two and a half semitones, a clear whole-tone-and-a-bit against the
  // reference. The top of the collision box (9 units) is a fifth. So the entire
  // decision — climb, dive, or brace for a bounce — is a musical interval you
  // can name.
  //
  // The arena is 100 units tall, which is over eight octaves, so the mapping is
  // clamped: past PITCH_CLAMP_OCTAVES the pitch saturates. That is not a loss.
  // Beyond about twenty units of separation you cannot duel anyway, and a
  // saturated pitch says "way above you" perfectly well.
  const REFERENCE_HZ = 330    // E4; the drone that means "your altitude"
  const ALT_OCTAVE = 12       // units of altitude per octave of pitch
  const PITCH_CLAMP_OCTAVES = 1.6

  // ---- the duel -------------------------------------------------------------
  // A collision box, and inside it a three-way outcome decided purely by who is
  // higher. The margin is small relative to the box so all three outcomes get a
  // fair share of it: above +2.5 you win, below -2.5 you die, and the five
  // units in the middle are a bounce.
  const DUEL_RADIUS_X = 5
  const DUEL_RADIUS_Y = 9
  const DUEL_MARGIN = 2.5
  const BOUNCE_SPEED = 22     // units/s each side is thrown apart
  const BOUNCE_LIFT = 6       // ...and a little upward kick, so a bounce is survivable
  // Before the same pair can collide again. Generous, because a bounce leaves
  // you both in roughly the same place: without a real gap you get re-hit by
  // the rider you just bounced off before you have moved anywhere, and a
  // survivable tie turns into a death.
  const DUEL_COOLDOWN = 0.9

  // ---- eggs -----------------------------------------------------------------
  // The other half of the loop. A dead rider drops an egg that falls under its
  // own gravity, lands, and then TICKS — and the tick accelerates as the hatch
  // approaches, so the timer is a sound rather than a number. Let it hatch and
  // you get back the rider you just killed, one tier meaner.
  const EGG_GRAVITY = 22
  const EGG_FALL_MAX = 26
  const EGG_DRAG = 0.6        // it keeps some of its rider's momentum, briefly
  const EGG_HATCH_TIME = 9    // seconds on the deck before it hatches
  const EGG_TICK_SLOW = 0.85  // seconds between ticks, just landed
  const EGG_TICK_FAST = 0.13  // ...and on the point of hatching
  const EGG_RADIUS_X = 6      // collecting is deliberately generous
  const EGG_RADIUS_Y = 9
  // Consecutive eggs collected within one wave are worth more, so clearing the
  // deck fast is its own reward. Resets when a wave ends or one hatches.
  const EGG_SCORES = [250, 500, 750, 1000]

  // ---- the riders -----------------------------------------------------------
  // Three tiers, each faster and more willing to come at you than the last, and
  // each on its own waveform so you can hear WHAT is closing as well as where.
  // `wave` is the first wave the tier appears in.
  //
  // Two fields are easy to confuse and MUST stay separate:
  //   `climb` is physics — the fastest the rider can rise, and therefore what
  //           decides whether it can get above you and kill you.
  //   `flap`  is AUDIO — how often you hear its wing beat, which is the tier's
  //           character and (multiplied by closeness) its distance display.
  // Driving the rider's actual flapping off `flap` looks natural and is a bug:
  // holding altitude needs GRAVITY / FLAP_IMPULSE = 2 beats a second, so a
  // bounder at 1.5 could never stay up, every rider sank to the deck, and a
  // player who simply hovered was unreachable. Riders fly on
  // RIDER_FLAP_COOLDOWN, exactly like you do, and `climb` alone caps them.
  const RIDER_TYPES = {
    bounder: {
      speed: 17, climb: 15, flap: 1.3, aggression: 0.35,
      score: 500, wave: 1, timbre: 'triangle', bright: 900,
    },
    hunter: {
      speed: 23, climb: 19, flap: 1.8, aggression: 0.55,
      score: 750, wave: 2, timbre: 'sawtooth', bright: 1500,
    },
    shadowlord: {
      speed: 30, climb: 24, flap: 2.4, aggression: 0.80,
      score: 1500, wave: 4, timbre: 'square', bright: 2400,
    },
  }
  const TIER_ORDER = ['bounder', 'hunter', 'shadowlord']

  // ---- rider behaviour ------------------------------------------------------
  // A rider alternates between CHASE and WANDER. In chase it steers for a point
  // a little ABOVE you, because that is how it wins — which means the counter
  // to being hunted is always to climb, and climbing is expensive. In wander it
  // drifts, which is what stops six riders becoming one wall of riders.
  // How far above you a chasing rider tries to sit. This band MUST live inside
  // the collision box and above the duel margin, or the chase is theatre: a
  // rider holding station fifteen units over your head is outside DUEL_RADIUS_Y
  // and can never actually touch you, so it hovers there forever and the
  // strongest play in the game becomes kiting. Read it against DUEL_MARGIN
  // (2.5) and DUEL_RADIUS_Y (9): a rider steering for this band is aiming at a
  // position that both reaches you and wins.
  const AI_ABOVE = [4, 8]
  const AI_CHASE_TIME = [3, 7]    // seconds
  // Kept short: a rider that has decided to mind its own business re-decides
  // soon, which is what stops a wave turning into a search for the one bounder
  // drifting quietly on the far side of the strip.
  const AI_WANDER_TIME = [1.5, 3.5]
  const AI_WANDER_ALT = [12, 80]  // the band it drifts around in
  const AI_DEADBAND = 2.5         // altitude slop before it bothers flapping
  // The rider wing, in seconds between beats. Short enough that every tier can
  // actually fly; `climb` is what makes the tiers differ vertically.
  const RIDER_FLAP_COOLDOWN = 0.16
  // Riders get impatient. After WAVE_HURRY seconds of a wave still running,
  // everything left alive ramps toward WAVE_HURRY_MULT on both speed AND climb,
  // and once the ramp is more than half in they stop wandering and simply come
  // for you.
  //
  // This is the anti-stalling rule, and it has to bite, because without it the
  // strongest strategy in the game is to kite: stay high, flee anything above
  // you, and never engage. It is doing the job the pterodactyl does in the
  // original. The multiplier is what pushes a hurrying hunter past your own top
  // speed, so running stops being an answer.
  const WAVE_HURRY = 30
  const WAVE_HURRY_RAMP = 25
  const WAVE_HURRY_MULT = 1.6
  // Once hurryMult is this far along, wandering stops entirely.
  const WAVE_HURRY_COMMIT = 0.5

  // ---- what you can hear ----------------------------------------------------
  // Every rider is audible as a WING BEAT — a short pitched flap, binaural at
  // its position, whose rate is its tier's natural beat rate multiplied up as
  // it closes on you. That rate ramp is the alarm, and it is the same
  // rate-coded distance trick sea_wolf uses for its contacts, for the same
  // reason: a beat that speeds up says far-versus-near far better than volume.
  //
  // Inside SUSTAIN_FAR the beats grow a SUSTAINED tone on the same pitch, so
  // the rider you are actually about to fight can be tracked continuously
  // rather than sampled. Outside it there is no continuous layer at all — a
  // permanent drone for every distant rider is exactly the uninformative wash
  // this engine's other games had to be rebuilt to remove.
  // The rate ramp runs from BEAT_FAR_MULT across the arena to BEAT_CLOSE_MULT
  // alongside — a 4x spread, which is what you actually hear as "closing".
  //
  // BEAT_FAR_MULT exists because of an arithmetic problem: a late wave fields
  // eight riders, and at the old flat far-rate that was fifty-odd wing beats a
  // second all by itself, six of them overlapping at any instant. The ramp was
  // right and the FLOOR was wrong. Pulling the far end down widens the ramp and
  // empties the mix at the same time, so distant riders now murmur rather than
  // clatter, and closing on one is more obvious than it was before, not less.
  const BEAT_FAR_MULT = 0.45      // ...when it is right across the arena
  const BEAT_CLOSE_MULT = 1.8     // ...when it is right on top of you
  // The other half of the density fix, and the one that only acts when it is
  // needed: total wing-beat loudness is held roughly constant as the crowd
  // grows, so one rider is as loud as it ever was and eight do not sum into a
  // wall. Read as gain *= count^-BEAT_CROWD_POWER, so four riders are at 63%
  // and eight at 49%.
  const BEAT_CROWD_POWER = 0.35

  const SUSTAIN_FAR = 42          // the sustained tone starts fading in here
  const SUSTAIN_NEAR = 10         // ...and is at full weight here
  // Hard caps on the continuous layers. The sustained tone is for the rider you
  // are about to fight, so three is already generous; past that it stops being
  // a tracker and becomes a chord.
  const SUSTAIN_MAX_VOICES = 3
  const FALLING_EGG_MAX_VOICES = 3
  // Only the nearest few eggs tick, because a deck full of them is a drum
  // machine. An egg close to hatching always ticks regardless of rank — that is
  // the one you have to be told about.
  const EGG_TICK_MAX_VOICES = 2
  const EGG_TICK_URGENT = 3.0     // seconds left, at which an egg always ticks

  // ---- placing sound around the head ----------------------------------------
  // Arena units are not metres, and syngen's ear cares: it derives an
  // interaural delay from raw distance, so feeding it hundreds of units would
  // smear every cue behind a huge delay. Instead the strip is COMPRESSED onto a
  // stage a few metres wide in front of the listener. Near riders pan hard and
  // far ones crowd toward the edges, which is the correct perceptual shape
  // anyway — and loudness is set explicitly rather than left to the ear's own
  // distance model, so it stays under this file's control.
  const EAR_DEPTH = 1.6           // metres in front of the listener
  const EAR_MAX_Y = 9             // metres; the widest the stage ever gets
  const EAR_HALF = 15             // arena units at which the pan is half-way out

  // ---- the deck and the roof ------------------------------------------------
  // Pitch is relative, so it can never tell you your absolute height. These two
  // cues are the only things that can, and they are why you do not fly into the
  // floor while concentrating on a duel.
  const GROUND_WARN = 14          // the deck wash rises within this of the floor
  const CEILING_WARN = 12         // the roof hiss rises within this of the top
  // The roof HURTS, and it has to. Riders steer for a point above you, but they
  // cannot steer above the ceiling — so if hitting the roof were free, parking
  // against it would be an unbeatable position and the game would be over. A
  // headlong stop plus a stun means you cannot hold the very top: you bonk, you
  // drop, and you have to climb back. The high ground is real but it is the
  // band just under the roof, and holding it costs continuous flapping.
  const CEILING_BOUNCE = 14       // units/s you are thrown back down at
  const CEILING_STUN = 0.55       // seconds your wing will not answer afterwards

  // ---- the run --------------------------------------------------------------
  const LIVES = 3
  const EXTRA_LIFE_EVERY = 20000
  const RESPAWN_DELAY = 1.6
  // Long enough to actually find somewhere to be. You come back into a live
  // wave, not an empty arena, so a short shield just means dying again where
  // you died.
  const SPAWN_INVULN = 3.0        // seconds; audible as a shimmer on the reference
  const SPAWN_MIN_DIST = 38       // riders never spawn closer to you than this
  const SPAWN_STAGGER = 0.85      // seconds between a wave's arrivals

  // ---- waves ----------------------------------------------------------------
  const WAVE_COUNTS = [3, 4, 4, 5, 5, 6, 6, 7, 7, 8]
  const WAVE_BREAK = 3.2          // breather between waves
  const WAVE_BONUS = 500          // ...times the wave number

  // ---- helpers --------------------------------------------------------------
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }
  function lerp(a, b, t) { return a + (b - a) * clamp(t, 0, 1) }

  // The signed horizontal offset from `from` to `to`, taken the short way round
  // the wrapping strip. Every bearing in the game goes through this, which is
  // why the seam is never audible.
  function wrapDx(from, to) {
    let d = (to - from) % ARENA_WIDTH
    if (d > ARENA_WIDTH / 2) d -= ARENA_WIDTH
    if (d < -ARENA_WIDTH / 2) d += ARENA_WIDTH
    return d
  }

  function wrapX(x) {
    let v = x % ARENA_WIDTH
    if (v < 0) v += ARENA_WIDTH
    return v
  }

  // THE mapping. `dAlt` is how far the thing is above you (negative = below).
  // Above the reference means it beats you; below means you beat it.
  function pitchFor(dAlt, reference) {
    const oct = clamp(dAlt / ALT_OCTAVE, -PITCH_CLAMP_OCTAVES, PITCH_CLAMP_OCTAVES)
    return (reference || REFERENCE_HZ) * Math.pow(2, oct)
  }

  // 0 at the far side of the arena, 1 right on top of you.
  function closeness(dist) { return clamp(1 - Math.abs(dist) / HEAR_RANGE, 0, 1) }

  // Wing beats per second for a rider of `tier` at `dist`. One definition, used
  // by the game, the balance report and the density budget in the harness.
  function beatRate(tier, dist) {
    const spec = RIDER_TYPES[tier] || RIDER_TYPES.bounder
    return spec.flap * lerp(BEAT_FAR_MULT, BEAT_CLOSE_MULT, closeness(dist))
  }

  // How much to duck each wing beat when `count` riders are audible at once, so
  // the layer's total loudness stays roughly flat as a wave fills up.
  function crowdGain(count) {
    return Math.pow(Math.max(1, count || 1), -BEAT_CROWD_POWER)
  }

  // How much sustained tone a rider at this distance has earned, 0..1.
  function sustainWeight(dist) {
    return clamp((SUSTAIN_FAR - Math.abs(dist)) / (SUSTAIN_FAR - SUSTAIN_NEAR), 0, 1)
  }

  // Arena offset -> listener-local metres. `dx` is signed and already wrapped.
  // The compression is a hyperbola: linear near the head, saturating far out.
  function earLocal(dx) {
    const a = Math.abs(dx)
    const y = EAR_MAX_Y * (a / (a + EAR_HALF))
    return {forward: EAR_DEPTH, starboard: dx < 0 ? -y : y}
  }

  // Which way a collision goes. Positive `dAlt` means the OTHER rider is above
  // you, so a positive result past the margin is your death.
  //   -1 you win, 0 bounce, +1 you lose
  function duelOutcome(dAlt) {
    if (dAlt > DUEL_MARGIN) return 1
    if (dAlt < -DUEL_MARGIN) return -1
    return 0
  }

  // Seconds between an egg's ticks, given how much of its life is gone (0..1).
  function eggTickInterval(progress) {
    return lerp(EGG_TICK_SLOW, EGG_TICK_FAST, clamp(progress, 0, 1))
  }

  // How many riders wave `n` (1-based) fields, and the tier mix.
  function waveCount(n) {
    return WAVE_COUNTS[Math.min(n - 1, WAVE_COUNTS.length - 1)]
  }

  // The tiers legal in this wave, weighted so the newest tier is rare when it
  // first appears and becomes the norm several waves later.
  function waveTiers(n) {
    const out = []
    for (const name of TIER_ORDER) {
      const first = RIDER_TYPES[name].wave
      if (n < first) continue
      out.push({name, weight: 1 + Math.min(3, n - first)})
    }
    return out
  }

  function rand(lo, hi) { return lo + Math.random() * (hi - lo) }
  function randInt(lo, hi) { return Math.floor(rand(lo, hi + 1)) }
  function pick(list) { return list[randInt(0, list.length - 1)] }

  // Weighted pick over [{name, weight}].
  function pickWeighted(list) {
    let total = 0
    for (const it of list) total += it.weight
    let r = Math.random() * total
    for (const it of list) {
      r -= it.weight
      if (r <= 0) return it.name
    }
    return list.length ? list[list.length - 1].name : null
  }

  // The tier one step meaner than `name`, for a hatching egg.
  function nextTier(name) {
    const i = TIER_ORDER.indexOf(name)
    if (i < 0) return TIER_ORDER[0]
    return TIER_ORDER[Math.min(i + 1, TIER_ORDER.length - 1)]
  }

  return {
    ARENA_WIDTH,
    CEILING,
    HEAR_RANGE,
    GRAVITY,
    FLAP_IMPULSE,
    FLAP_COOLDOWN,
    CLIMB_MAX,
    FALL_MAX,
    THRUST_AIR,
    THRUST_GROUND,
    DRAG_AIR,
    DRAG_GROUND,
    SPEED_MAX_AIR,
    SPEED_MAX_GROUND,
    REFERENCE_HZ,
    ALT_OCTAVE,
    PITCH_CLAMP_OCTAVES,
    DUEL_RADIUS_X,
    DUEL_RADIUS_Y,
    DUEL_MARGIN,
    BOUNCE_SPEED,
    BOUNCE_LIFT,
    DUEL_COOLDOWN,
    EGG_GRAVITY,
    EGG_FALL_MAX,
    EGG_DRAG,
    EGG_HATCH_TIME,
    EGG_TICK_SLOW,
    EGG_TICK_FAST,
    EGG_RADIUS_X,
    EGG_RADIUS_Y,
    EGG_SCORES,
    RIDER_TYPES,
    TIER_ORDER,
    AI_ABOVE,
    AI_CHASE_TIME,
    AI_WANDER_TIME,
    AI_WANDER_ALT,
    AI_DEADBAND,
    RIDER_FLAP_COOLDOWN,
    WAVE_HURRY,
    WAVE_HURRY_RAMP,
    WAVE_HURRY_MULT,
    WAVE_HURRY_COMMIT,
    BEAT_FAR_MULT,
    BEAT_CLOSE_MULT,
    BEAT_CROWD_POWER,
    SUSTAIN_FAR,
    SUSTAIN_NEAR,
    SUSTAIN_MAX_VOICES,
    FALLING_EGG_MAX_VOICES,
    EGG_TICK_MAX_VOICES,
    EGG_TICK_URGENT,
    EAR_DEPTH,
    EAR_MAX_Y,
    EAR_HALF,
    GROUND_WARN,
    CEILING_WARN,
    CEILING_BOUNCE,
    CEILING_STUN,
    LIVES,
    EXTRA_LIFE_EVERY,
    RESPAWN_DELAY,
    SPAWN_INVULN,
    SPAWN_MIN_DIST,
    SPAWN_STAGGER,
    WAVE_COUNTS,
    WAVE_BREAK,
    WAVE_BONUS,
    clamp,
    lerp,
    wrapDx,
    wrapX,
    pitchFor,
    closeness,
    beatRate,
    crowdGain,
    sustainWeight,
    earLocal,
    duelOutcome,
    eggTickInterval,
    waveCount,
    waveTiers,
    rand,
    randInt,
    pick,
    pickWeighted,
    nextTier,
    MAX_SCORE: 9999999,
  }
})()
