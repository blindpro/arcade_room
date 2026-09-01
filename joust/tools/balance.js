// Balance readout for JOUST. Prints the tuning tables you cannot see by
// playing — the pitch ladder, the flight envelope, the wave schedule — and then
// plays the game out with three bots of increasing competence to check that the
// difficulty curve actually curves.
//
// This is a REPORT, not a test: it has no pass/fail and it never gates a build.
// tools/sim.js is the harness that asserts things.
//
//   node tools/balance.js
'use strict'
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const sandbox = {content: {}, console, Math, Date, JSON, setTimeout, clearTimeout}
sandbox.window = sandbox
vm.createContext(sandbox)
for (const f of ['constants.js', 'events.js', 'game.js']) {
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'content', f), 'utf8'),
    sandbox, {filename: f})
}
const K = sandbox.content.constants
const G = sandbox.content.game

const pad = (v, n) => String(v).padStart(n)
const f1 = (v) => v.toFixed(1)

// ---------------------------------------------------------------------------
console.log('\n=== the pitch ladder ==========================================')
console.log('The only mapping that matters. `dAlt` is how far above you a rider')
console.log('is; the interval is what you actually hear it as, against the')
console.log('reference drone at ' + K.REFERENCE_HZ + ' Hz.\n')
const semis = (d) => 12 * Math.log2(K.pitchFor(d, K.REFERENCE_HZ) / K.REFERENCE_HZ)
const NAMES = ['unison', 'min 2nd', 'maj 2nd', 'min 3rd', 'maj 3rd', 'p 4th', 'tritone',
  'p 5th', 'min 6th', 'maj 6th', 'min 7th', 'maj 7th', 'octave']
const nameOf = (s) => {
  const a = Math.abs(s)
  if (a >= 12) return (a / 12).toFixed(1) + ' octaves'
  return NAMES[Math.round(a)]
}
console.log('   dAlt      Hz    semitones   about a      verdict')
for (const d of [-30, -20, -12, -9, -6, -3, -K.DUEL_MARGIN, 0, K.DUEL_MARGIN, 3, 6, 9, 12, 20, 30]) {
  const o = K.duelOutcome(d)
  const inBox = Math.abs(d) <= K.DUEL_RADIUS_Y
  console.log('  ' + pad(d, 5) + '  ' + pad(K.pitchFor(d, K.REFERENCE_HZ).toFixed(0), 6) +
    '    ' + pad(semis(d).toFixed(2), 7) + '   ' + nameOf(semis(d)).padEnd(11) +
    (inBox ? (o < 0 ? 'you win' : o > 0 ? 'IT WINS' : 'bounce') : '(out of reach)'))
}
console.log('\n  the decision boundary sits ' + Math.abs(semis(K.DUEL_MARGIN)).toFixed(2) +
  ' semitones off the reference,')
console.log('  and the whole bounce band is ' +
  (semis(K.DUEL_MARGIN) - semis(-K.DUEL_MARGIN)).toFixed(2) + ' semitones wide.')

// ---------------------------------------------------------------------------
console.log('\n=== the flight envelope =======================================')
{
  // Terminal speeds are set by thrust/drag, not by the caps.
  const airTop = K.THRUST_AIR / K.DRAG_AIR
  const groundTop = K.THRUST_GROUND / K.DRAG_GROUND
  console.log('  horizontal, in the air:  ' + f1(Math.min(airTop, K.SPEED_MAX_AIR)) +
    ' units/s, reached over ~' + f1(1 / K.DRAG_AIR) + 's')
  console.log('  horizontal, on the deck: ' + f1(Math.min(groundTop, K.SPEED_MAX_GROUND)) +
    ' units/s, reached over ~' + f1(1 / K.DRAG_GROUND) + 's')
  // A sustained climb: each beat adds FLAP_IMPULSE, gravity takes some back.
  const perBeat = K.FLAP_IMPULSE - K.GRAVITY * K.FLAP_COOLDOWN
  const climbRate = Math.min(K.CLIMB_MAX, perBeat / K.FLAP_COOLDOWN)
  console.log('  a beat buys ' + f1(K.FLAP_IMPULSE) + ' units/s, gravity takes ' +
    f1(K.GRAVITY * K.FLAP_COOLDOWN) + ' back before the next one')
  console.log('  sustained climb: about ' + f1(climbRate) + ' units/s, so deck to roof is ~' +
    f1(K.CEILING / climbRate) + 's of solid flapping')
  console.log('  free fall:       ' + f1(K.FALL_MAX) + ' units/s, so roof to deck is ~' +
    f1(K.CEILING / K.FALL_MAX) + 's')
  console.log('  -> climbing costs about ' + (K.FALL_MAX / climbRate).toFixed(1) +
    'x what falling does. That ratio IS the game.')
}

// ---------------------------------------------------------------------------
console.log('\n=== the riders ================================================')
console.log('  tier          speed  climb  beats/s  aggro   score  from wave  vs you')
for (const name of K.TIER_ORDER) {
  const s = K.RIDER_TYPES[name]
  const outrun = K.SPEED_MAX_AIR > s.speed ? 'outrun it' : 'cannot outrun'
  const outclimb = K.CLIMB_MAX > s.climb ? 'outclimb it' : 'cannot outclimb'
  console.log('  ' + name.padEnd(13) + pad(s.speed, 5) + pad(s.climb, 7) + pad(s.flap, 9) +
    pad(s.aggression, 7) + pad(s.score, 8) + pad(s.wave, 11) + '  ' +
    outrun + ', ' + outclimb)
}

console.log('\n=== the wave schedule =========================================')
console.log('  wave  riders   tier mix')
for (const n of [1, 2, 3, 4, 5, 6, 8, 10, 15, 20]) {
  const tiers = K.waveTiers(n)
  const total = tiers.reduce((a, t) => a + t.weight, 0)
  const mix = tiers.map((t) => t.name + ' ' + Math.round((t.weight / total) * 100) + '%').join(', ')
  console.log('  ' + pad(n, 4) + pad(K.waveCount(n), 8) + '   ' + mix)
}

// ---------------------------------------------------------------------------
console.log('\n=== the beat rate, which is the distance display ===============')
console.log('  distance   bounder  hunter  shadow lord   (beats/second)')
// Sampled across the arena as it actually is, and through the shared
// K.beatRate so this table cannot drift away from what the game plays.
for (const frac of [1, 0.8, 0.6, 0.45, 0.3, 0.17, 0.06, 0]) {
  const d = K.HEAR_RANGE * frac
  const r = (tier) => K.beatRate(tier, d).toFixed(2)
  console.log('  ' + pad(d.toFixed(0), 8) + pad(r('bounder'), 9) + pad(r('hunter'), 8) +
    pad(r('shadowlord'), 13))
}
{
  const spread = K.beatRate('hunter', 0) / K.beatRate('hunter', K.HEAR_RANGE)
  console.log('  the ramp across the whole arena is ' + spread.toFixed(1) + 'x.')
  console.log('  Total beats/second if a full wave of ' + K.waveCount(K.WAVE_COUNTS.length) +
    ' shadow lords were all on top of you: ' +
    (K.waveCount(K.WAVE_COUNTS.length) * K.beatRate('shadowlord', 0)).toFixed(0) + '.')
}

// ---------------------------------------------------------------------------
console.log('\n=== the mix budget ============================================')
console.log('Peak gain each layer can contribute at once, so it is obvious which')
console.log('one to reach for when the game sounds crowded. Anything much over a')
console.log('total of 1.0 lives on the limiter, which reads as flat rather than')
console.log('loud. These figures mirror content/audio.js by hand - if you retune')
console.log('a level there, update it here too.')
console.log('')
{
  const BEAT_DUR = 0.11
  const maxRiders = K.waveCount(K.WAVE_COUNTS.length)
  const beats = 0.20 * 1.15 * K.crowdGain(maxRiders) *
    (K.beatRate('shadowlord', 0) * BEAT_DUR)
  const layers = [
    ['reference drone', 0.075, 'continuous; the zero of the pitch scale'],
    ['wing beats', beats, maxRiders + ' riders on top of you, after the crowd duck'],
    ['sustained riders', 0.055 * K.SUSTAIN_MAX_VOICES, K.SUSTAIN_MAX_VOICES + ' at full weight'],
    ['music bed', 0.11, 'at full threat'],
    ['music pulse', 0.29, 'transient, at full threat'],
    ['your own wing', 0.29, 'transient, about 5 times a second'],
    ['deck wash', 0.11, 'on the deck'],
    ['roof hiss', 0.035, 'at the ceiling'],
    ['falling eggs', 0.05 * K.FALLING_EGG_MAX_VOICES, K.FALLING_EGG_MAX_VOICES + ' at once'],
    ['egg ticks', 0.17 * K.EGG_TICK_MAX_VOICES, 'transient, about to hatch'],
  ]
  let floor = 0
  let total = 0
  for (const row of layers) {
    console.log('  ' + row[0].padEnd(18) + row[1].toFixed(3).padStart(6) + '   ' + row[2])
    total += row[1]
    if (row[2].indexOf('transient') !== 0) floor += row[1]
  }
  console.log('  ' + '-'.repeat(62))
  console.log('  ' + 'continuous floor'.padEnd(18) + floor.toFixed(3).padStart(6) +
    '   everything that is always there')
  console.log('  ' + 'absolute worst'.padEnd(18) + total.toFixed(3).padStart(6) +
    '   every layer peaking in the same instant')
  console.log('')
  console.log('  master preGain is 1.15 (main.js), so the floor sits at ' +
    (floor * 1.15).toFixed(2) + ' going into the limiter.')
  console.log('  The worst case is allowed over 1.0 - that is what a limiter is for.')
  console.log('  What must not happen is the FLOOR sitting on it, which is what a')
  console.log('  preGain of 1.5 and an unducked wing-beat layer used to do.')
}

// ---------------------------------------------------------------------------
console.log('\n=== does the difficulty curve actually curve? ==================')
console.log('Three bots, each strictly better informed than the last. All of them')
console.log('read exact altitudes, which a player cannot, so treat these as an')
console.log('upper bound on human performance rather than a prediction.\n')

// A bot is a per-frame function that may call G.flap() and G.setThrust().
function play(bot, trials) {
  const runs = []
  for (let t = 0; t < (trials || 6); t++) {
    G.reset()
    let n = 0
    while (G.phase() !== 'over' && n < 300000) {
      if (G.phase() === 'play') bot()
      G.update(1 / 60)
      n++
    }
    const s = G.status()
    runs.push({seconds: n / 60, score: G.state.score, wave: G.state.wave,
      kills: s.kills, eggs: s.eggs, hatched: s.hatched})
  }
  const avg = (key) => runs.reduce((a, r) => a + r[key], 0) / runs.length
  return {
    seconds: avg('seconds'), score: avg('score'), wave: avg('wave'),
    kills: avg('kills'), eggs: avg('eggs'), hatched: avg('hatched'),
    best: Math.max(...runs.map((r) => r.score)),
  }
}

const bots = {
  // Does nothing at all. The floor.
  'does nothing': () => {},

  // Stays airborne, runs from anything above it, chases anything below it.
  // No egg play at all.
  'flies and fights': () => {
    const n = G.nearestRider()
    if (G.getAltitude() < K.CEILING * 0.75) G.flap()
    if (!n) { G.setThrust(0); return }
    if (n.outcome > 0) G.setThrust(n.dx > 0 ? -1 : 1)      // it is above: run
    else G.setThrust(n.dx > 0 ? 1 : -1)                     // it is below: take it
  },

  // ...and also goes back for the eggs, which is the actual game.
  'fights and collects': () => {
    const n = G.nearestRider()
    const eggs = G.eggList()
    const egg = eggs.length ? eggs[0] : null

    // An egg about to hatch outranks everything except a rider on top of you.
    const urgent = egg && egg.landed && egg.timeLeft < 4.5
    const threat = n && n.outcome > 0 && n.dist < 25

    if (threat) {
      G.flap()
      G.setThrust(n.dx > 0 ? -1 : 1)
      return
    }
    if (egg && (urgent || !n || n.dist > 35)) {
      G.setThrust(egg.dx > 0 ? 1 : -1)
      // Dive onto it: only flap if we are already below it.
      if (G.getAltitude() < 6 && !G.isOnGround()) G.flap()
      else if (egg.dAlt > 4) G.flap()
      return
    }
    if (n) {
      G.setThrust(n.dx > 0 ? 1 : -1)
      // Get above it, and stay off the roof.
      if (n.dAlt > -K.DUEL_MARGIN * 1.5 && G.getAltitude() < K.CEILING - 8) G.flap()
      return
    }
    if (G.getAltitude() < K.CEILING * 0.6) G.flap()
    G.setThrust(0)
  },
}

console.log('  bot                    time    score   wave   kills   eggs  hatched    best')
for (const [name, bot] of Object.entries(bots)) {
  const r = play(bot)
  console.log('  ' + name.padEnd(21) +
    pad(f1(r.seconds) + 's', 7) + pad(Math.round(r.score), 9) + pad(f1(r.wave), 7) +
    pad(f1(r.kills), 8) + pad(f1(r.eggs), 7) + pad(f1(r.hatched), 9) +
    pad(Math.round(r.best), 8))
}
console.log('\n  (averages over 6 runs each)')
console.log('\nWhat to look for: each bot should beat the one above it on score AND')
console.log('reach a higher wave, "fights and collects" should have far fewer')
console.log('hatched eggs than "flies and fights", and no bot should survive so')
console.log('long that the run stops being a game.\n')
