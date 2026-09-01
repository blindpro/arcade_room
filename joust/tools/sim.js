// Headless mechanics harness for JOUST. Loads content/constants.js,
// content/events.js and content/game.js into a bare node context — no DOM, no
// Web Audio — and exercises the parts of the game that are pure logic: the
// flap physics, the wrapping geometry, the pitch mapping, the three duel
// outcomes, the egg lifecycle, the wave schedule and a full run to game over.
//
// What this CANNOT see is content/audio.js and the game screen, which only
// exist in a browser. tools/boot.js covers those.
//
//   node tools/sim.js
'use strict'
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const sandbox = {content: {}, console, Math, Date, JSON, setTimeout, clearTimeout}
sandbox.window = sandbox
vm.createContext(sandbox)
for (const f of ['constants.js', 'events.js', 'game.js']) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'content', f), 'utf8')
  vm.runInContext(src, sandbox, {filename: f})
}

const K = sandbox.content.constants
const G = sandbox.content.game
const E = sandbox.content.events

let failures = 0
function check(name, cond, detail) {
  const ok = !!cond
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  - ' + detail : ''))
  if (!ok) failures++
}
function section(title) { console.log('\n== ' + title + ' ' + '='.repeat(Math.max(0, 58 - title.length))) }

// Run `seconds` of game time at a fixed step, with an optional per-frame hook.
function run(seconds, hook) {
  const dt = 1 / 60
  const n = Math.round(seconds / dt)
  for (let i = 0; i < n; i++) {
    if (hook) hook(i * dt, i)
    G.update(dt)
  }
}
// Skip the ready countdown.
function begin() {
  G.reset()
  run(3.2)
}

// ---------------------------------------------------------------------------
section('geometry: the wrap')
// The strip wraps, and every offset is taken the short way round. If this is
// wrong, a rider on your left is heard on your right.
check('wrapDx is zero for the same point', K.wrapDx(50, 50) === 0)
check('wrapDx is signed the obvious way', K.wrapDx(50, 70) === 20 && K.wrapDx(70, 50) === -20)
check('wrapDx takes the SHORT way round the seam',
  K.wrapDx(5, K.ARENA_WIDTH - 5) === -10,
  'got ' + K.wrapDx(5, K.ARENA_WIDTH - 5))
check('wrapDx never exceeds half the arena',
  Math.abs(K.wrapDx(0, K.ARENA_WIDTH / 2)) <= K.ARENA_WIDTH / 2 + 0.001)
check('wrapX normalises negatives', K.wrapX(-10) === K.ARENA_WIDTH - 10)
{
  let worst = 0
  for (let i = 0; i < 4000; i++) {
    const a = Math.random() * K.ARENA_WIDTH
    const b = Math.random() * K.ARENA_WIDTH
    worst = Math.max(worst, Math.abs(K.wrapDx(a, b)))
  }
  check('nothing is ever further away than half the strip', worst <= K.HEAR_RANGE + 0.001,
    'worst ' + worst.toFixed(1) + ' of ' + K.HEAR_RANGE)
}

// ---------------------------------------------------------------------------
section('the pitch mapping: is the verdict audible?')
// This is the load-bearing claim of the whole port: relative altitude has to
// land as an interval a player can actually name. Anything under about a
// semitone at the decision boundary and the game is unplayable by ear.
const semis = (dAlt) => 12 * Math.log2(K.pitchFor(dAlt, K.REFERENCE_HZ) / K.REFERENCE_HZ)
console.log('     dAlt   ->   Hz     semitones from the reference')
for (const d of [-25, -20, -12, -9, -6, -2.5, 0, 2.5, 6, 9, 12, 20, 25]) {
  console.log('     ' + String(d).padStart(6) + '   -> ' +
    K.pitchFor(d, K.REFERENCE_HZ).toFixed(0).padStart(5) + '   ' + semis(d).toFixed(2).padStart(6))
}
check('level with you IS the reference', Math.abs(semis(0)) < 1e-9)
check('above you is above the reference', semis(K.DUEL_MARGIN) > 0)
check('below you is below the reference', semis(-K.DUEL_MARGIN) < 0)
check('the win/lose boundary is at least a semitone from the reference',
  Math.abs(semis(K.DUEL_MARGIN)) >= 1,
  semis(K.DUEL_MARGIN).toFixed(2) + ' semitones at the margin')
check('the two boundaries are at least two semitones apart',
  semis(K.DUEL_MARGIN) - semis(-K.DUEL_MARGIN) >= 2,
  (semis(K.DUEL_MARGIN) - semis(-K.DUEL_MARGIN)).toFixed(2) + ' semitones across the bounce band')
check('the top of the collision box is a wide, unmistakable interval',
  Math.abs(semis(K.DUEL_RADIUS_Y)) >= 4,
  semis(K.DUEL_RADIUS_Y).toFixed(2) + ' semitones')
check('the mapping saturates rather than running off the keyboard',
  Math.abs(semis(K.CEILING)) <= K.PITCH_CLAMP_OCTAVES * 12 + 0.001,
  'full arena reads as ' + semis(K.CEILING).toFixed(1) + ' semitones')
check('the saturated pitch stays in a hearable band',
  K.pitchFor(-K.CEILING, K.REFERENCE_HZ) > 80 && K.pitchFor(K.CEILING, K.REFERENCE_HZ) < 4000,
  K.pitchFor(-K.CEILING, K.REFERENCE_HZ).toFixed(0) + ' Hz .. ' +
  K.pitchFor(K.CEILING, K.REFERENCE_HZ).toFixed(0) + ' Hz')
check('the mapping is monotonic', (() => {
  let last = -Infinity
  for (let d = -30; d <= 30; d += 0.5) {
    const f = K.pitchFor(d, K.REFERENCE_HZ)
    if (f < last - 1e-9) return false
    last = f
  }
  return true
})())

// ---------------------------------------------------------------------------
section('the duel: three outcomes, fairly shared')
check('clearly above -> you lose', K.duelOutcome(K.DUEL_MARGIN + 0.1) === 1)
check('clearly below -> you win', K.duelOutcome(-K.DUEL_MARGIN - 0.1) === -1)
check('level -> bounce', K.duelOutcome(0) === 0)
check('the margin is inclusive at the boundary', K.duelOutcome(K.DUEL_MARGIN) === 0)
{
  // Sweep the whole collision box and see how the outcome splits. If one
  // outcome swallows the box, the duel stops being a decision.
  let win = 0, lose = 0, bounce = 0, n = 0
  for (let d = -K.DUEL_RADIUS_Y; d <= K.DUEL_RADIUS_Y; d += 0.01) {
    const o = K.duelOutcome(d)
    if (o < 0) win++; else if (o > 0) lose++; else bounce++
    n++
  }
  const pct = (v) => ((v / n) * 100).toFixed(0) + '%'
  console.log('     across the collision box: win ' + pct(win) + ', bounce ' + pct(bounce) +
    ', lose ' + pct(lose))
  check('no single outcome swallows the collision box',
    win / n > 0.2 && lose / n > 0.2 && bounce / n > 0.15)
  check('win and lose are symmetric', Math.abs(win - lose) <= 2)
}

// ---------------------------------------------------------------------------
section('the wing: is a climb a commitment?')
begin()
{
  // Flat out: flap on every frame the cooldown allows.
  const y0 = G.getAltitude()
  const t0 = Date.now()
  let flaps = 0
  run(3, () => { if (G.flap()) flaps++ })
  const climbed = G.getAltitude() - y0
  console.log('     3s of continuous flapping: ' + flaps + ' beats, ' + climbed.toFixed(1) + ' units')
  check('mashing the wing climbs', climbed > 20, climbed.toFixed(1) + ' units')
  check('the beat rate is capped by the cooldown',
    flaps <= Math.ceil(3 / K.FLAP_COOLDOWN) + 1, flaps + ' beats in 3s')
  check('a full climb is a sustained effort, not a keypress',
    K.CEILING / (climbed / 3) > 2.5,
    'deck to roof takes about ' + (K.CEILING / (climbed / 3)).toFixed(1) + 's of flapping')
}
{
  // Let go and fall.
  begin()
  const y0 = G.getAltitude()
  run(2)
  const fell = y0 - G.getAltitude()
  check('not flapping means falling', fell > 10, fell.toFixed(1) + ' units in 2s')
  check('the fall has a terminal velocity',
    Math.abs(G.status().vy) <= K.FALL_MAX + 0.001, G.status().vy.toFixed(1) + ' units/s')
}
{
  // The deck catches you and you can stand on it.
  begin()
  run(8)
  check('you land on the deck rather than falling through it', G.getAltitude() >= 0)
  check('landing is a state you can be in', G.isOnGround() || G.getAltitude() > 0)
}
{
  // The roof stops you.
  begin()
  run(12, () => { G.flap() })
  check('the roof is hard', G.getAltitude() <= K.CEILING + 0.001,
    G.getAltitude().toFixed(1) + ' of ' + K.CEILING)
}

// ---------------------------------------------------------------------------
section('sideways: momentum and poor air control')
{
  // Measuring the control response means measuring it UNDISTURBED. A rider
  // bouncing off you rewrites your velocity outright, so any window in which
  // that happened has to be thrown away and retried rather than averaged in.
  let disturbed = false
  E.clear()
  for (const ev of ['bounce', 'death', 'respawn']) E.on(ev, () => { disturbed = true })
  const quietWindow = (seconds, hook) => {
    disturbed = false
    run(seconds, hook)
    return !disturbed && G.isAlive()
  }

  // Stay airborne throughout, or this measures running on the deck instead —
  // a different, and deliberately much snappier, control regime.
  const stayUp = () => { if (G.getAltitude() < 60) G.flap() }

  let measured = null
  for (let attempt = 0; attempt < 12 && !measured; attempt++) {
    begin()
    G.setThrust(1)
    if (!quietWindow(3, stayUp)) continue
    const top = G.getSpeed()
    G.setThrust(-1)
    let flipAt = null
    const ok = quietWindow(4, (t) => {
      stayUp()
      if (flipAt === null && G.getSpeed() < 0) flipAt = t
    })
    if (!ok) continue
    measured = {top, flipAt, back: G.getSpeed()}
  }

  check('an undisturbed control window could be measured at all', measured !== null)
  if (measured) {
    check('leaning right builds speed to the right', measured.top > 15, measured.top.toFixed(1))
    check('speed is capped', Math.abs(measured.top) <= K.SPEED_MAX_AIR + 0.001)
    check('turning around in mid-air takes real time',
      measured.flipAt !== null && measured.flipAt > 0.4,
      measured.flipAt === null ? 'never flipped' : measured.flipAt.toFixed(2) + 's to reverse')
    check('it does eventually reverse', measured.back < -5, measured.back.toFixed(1))
  }
  E.clear()
}
{
  // The deck is the other half of the trade: nearly instant control, and the
  // lowest place in the arena.
  begin()
  G.setThrust(0)
  for (let i = 0; i < 60 * 20 && !G.isOnGround(); i++) G.update(1 / 60)
  G.setThrust(1)
  let groundFlip = null
  run(1.5, (t) => { if (groundFlip === null && G.getSpeed() > 15) groundFlip = t })
  check('the deck answers almost at once',
    G.isOnGround() && groundFlip !== null && groundFlip < 0.6,
    G.isOnGround() ? (groundFlip === null ? 'never got up to speed' :
      groundFlip.toFixed(2) + 's to 15 units/s') : 'not on the deck')
}

// ---------------------------------------------------------------------------
section('the roof: the ceiling must not be a safe seat')
{
  // Riders steer for a point above the player and cannot steer above the roof,
  // so if the ceiling were free to hold, it would be the winning move in the
  // whole game. It has to cost something.
  begin()
  let bonks = 0
  E.clear()
  E.on('ceiling', () => bonks++)
  let atRoof = 0
  let frames = 0
  run(20, () => {
    G.flap() // try to live at the ceiling
    if (G.getAltitude() > K.CEILING - 3) atRoof++
    frames++
  })
  const share = atRoof / frames
  console.log('     mashing the wing for 20s: ' + bonks + ' bangs on the roof, ' +
    (share * 100).toFixed(0) + '% of the time within 3 units of it')
  check('you do hit the roof if you keep climbing', bonks > 0, bonks + ' bangs')
  check('the roof cannot be camped', share < 0.5, (share * 100).toFixed(0) + '% of frames at the roof')
  check('a bang on the roof throws you back down', K.CEILING_BOUNCE > 8,
    K.CEILING_BOUNCE + ' units/s')
  check('...and costs you the wing for a moment', K.CEILING_STUN > 0.2,
    K.CEILING_STUN + 's')
}

// ---------------------------------------------------------------------------
section('waves')
check('wave 1 fields a handful, not a swarm', K.waveCount(1) >= 2 && K.waveCount(1) <= 4,
  K.waveCount(1) + ' riders')
check('waves get bigger', K.waveCount(6) > K.waveCount(1))
check('the wave size stops growing rather than running away',
  K.waveCount(50) === K.waveCount(K.WAVE_COUNTS.length), K.waveCount(50) + ' riders at wave 50')
check('only bounders can appear in wave 1',
  K.waveTiers(1).every((t) => t.name === 'bounder'),
  K.waveTiers(1).map((t) => t.name).join(', '))
check('every tier is reachable',
  K.waveTiers(10).length === K.TIER_ORDER.length,
  K.waveTiers(10).map((t) => t.name).join(', '))
{
  // A tier should be rare when it first appears and common later, or the
  // difficulty curve is a cliff.
  const share = (n, name) => {
    const tiers = K.waveTiers(n)
    const total = tiers.reduce((a, t) => a + t.weight, 0)
    const t = tiers.find((x) => x.name === name)
    return t ? t.weight / total : 0
  }
  console.log('     shadow lord share: wave 4 ' + (share(4, 'shadowlord') * 100).toFixed(0) +
    '%, wave 8 ' + (share(8, 'shadowlord') * 100).toFixed(0) +
    '%, wave 20 ' + (share(20, 'shadowlord') * 100).toFixed(0) + '%')
  check('a new tier arrives rare and becomes normal',
    share(4, 'shadowlord') < share(12, 'shadowlord'))
}
{
  begin()
  check('wave 1 starts on its own', G.status().wave === 1, 'wave ' + G.status().wave)
  run(6)
  check('riders arrive', G.riderCount() > 0, G.riderCount() + ' in the air')
  check('they arrive staggered rather than all at once',
    G.status().riders + G.status().pending === K.waveCount(1),
    G.status().riders + ' up, ' + G.status().pending + ' still to come')
}
{
  // Riders never appear on top of you.
  let worst = Infinity
  for (let trial = 0; trial < 12; trial++) {
    begin()
    run(0.02)
    let firstSeen = false
    E.on('arrive', (e) => {
      if (firstSeen) return
      firstSeen = true
      worst = Math.min(worst, Math.abs(e.dx))
    })
    run(1.2)
  }
  check('riders never arrive in your lap', worst >= K.SPAWN_MIN_DIST - 1,
    'nearest arrival ' + (worst === Infinity ? 'n/a' : worst.toFixed(0)) + ' units')
}

// ---------------------------------------------------------------------------
section('the wing beats: the radar')
{
  begin()
  const beats = []
  E.clear()
  E.on('beat', (e) => beats.push(e))
  run(6)
  check('riders beat their wings', beats.length > 0, beats.length + ' beats in 6s')
  check('every beat carries a side and a height',
    beats.every((b) => typeof b.dx === 'number' && typeof b.dAlt === 'number'))
  check('beats never claim to be further than the arena allows',
    beats.every((b) => Math.abs(b.dx) <= K.HEAR_RANGE + 0.001))
}
{
  // The rate ramp is the distance display, so prove it actually ramps.
  const rate = (d, tier) => K.beatRate(tier, d)
  const far = rate(K.HEAR_RANGE, 'hunter')
  const near = rate(0, 'hunter')
  console.log('     hunter beat rate: ' + far.toFixed(2) + '/s across the arena -> ' +
    near.toFixed(2) + '/s on top of you (' + (near / far).toFixed(1) + 'x)')
  check('the beat rate ramps enough to be heard as a ramp', near / far >= 2,
    (near / far).toFixed(2) + 'x')
  check('a distant beat is a murmur, not a clatter', far <= 1.2, far.toFixed(2) + '/s')
  check('nastier tiers beat faster',
    K.RIDER_TYPES.shadowlord.flap > K.RIDER_TYPES.hunter.flap &&
    K.RIDER_TYPES.hunter.flap > K.RIDER_TYPES.bounder.flap)
}

// ---------------------------------------------------------------------------
section('the audio budget: how loud can it possibly get?')
{
  // The first build of this was genuinely overloading, and the cause was
  // arithmetic rather than taste: a late wave fields eight riders, each firing
  // a wing beat several times a second, and nothing anywhere held the total
  // down. These checks are the budget that stops it coming back.
  const worstTier = 'shadowlord'
  const maxRiders = K.waveCount(K.WAVE_COUNTS.length)
  const closeRate = K.beatRate(worstTier, 0)
  const farRate = K.beatRate(worstTier, K.HEAR_RANGE)
  const BEAT_DUR = 0.11 // must match content/audio.js

  // The pathological case: every rider of the nastiest tier, all on top of you.
  const worstPerSecond = maxRiders * closeRate
  const worstOverlap = worstPerSecond * BEAT_DUR
  console.log('     worst case: ' + maxRiders + ' x ' + worstTier + ' on top of you = ' +
    worstPerSecond.toFixed(0) + ' beats/s, ' + worstOverlap.toFixed(1) + ' overlapping')
  check('the wing-beat layer cannot become a continuous tone',
    worstPerSecond < 45, worstPerSecond.toFixed(0) + ' beats/s')
  check('only a few wing beats can ever overlap',
    worstOverlap < 4, worstOverlap.toFixed(1) + ' at once')

  // ...and the loudness of that pile, which is the number that actually
  // matters, because the crowd duck is what holds it flat.
  const nearPeak = 0.20 * 1.15   // distanceGain(0, 0.20, ..) * the chasing boost
  const solo = nearPeak * K.crowdGain(1) * (K.beatRate(worstTier, 0) * BEAT_DUR)
  const mob = nearPeak * K.crowdGain(maxRiders) * worstOverlap
  console.log('     summed wing-beat gain: one rider ' + solo.toFixed(2) +
    ', ' + maxRiders + ' riders ' + mob.toFixed(2) +
    ' (duck is ' + K.crowdGain(maxRiders).toFixed(2) + 'x)')
  check('the crowd duck actually ducks', K.crowdGain(maxRiders) < 0.6,
    K.crowdGain(maxRiders).toFixed(2) + 'x at ' + maxRiders + ' riders')
  check('a solo rider is not quietened for no reason', K.crowdGain(1) === 1)
  check('a full wave does not sum past the limiter on wing beats alone',
    mob < 1.0, mob.toFixed(2) + ' summed gain')
  check('...and a full wave is still louder than one rider, just not 8x',
    mob > solo && mob < solo * 5,
    (mob / solo).toFixed(1) + 'x louder for ' + maxRiders + 'x the riders')

  // The continuous layers are capped by count, not just by gain.
  check('sustained rider voices are capped', K.SUSTAIN_MAX_VOICES <= 3,
    K.SUSTAIN_MAX_VOICES + ' voices')
  check('falling-egg voices are capped', K.FALLING_EGG_MAX_VOICES <= 3,
    K.FALLING_EGG_MAX_VOICES + ' voices')
  check('egg ticks are capped', K.EGG_TICK_MAX_VOICES <= 2,
    K.EGG_TICK_MAX_VOICES + ' ticking at once')
  check('...but an egg about to hatch always gets heard',
    K.EGG_TICK_URGENT > 1 && K.EGG_TICK_URGENT < K.EGG_HATCH_TIME,
    'always ticks inside ' + K.EGG_TICK_URGENT + 's of hatching')
}
{
  // And measured, rather than reasoned about: play a real run and count every
  // positional one-shot in the busiest one-second window.
  let events = 0
  E.clear()
  E.on('beat', () => { events++ })
  E.on('egg-tick', () => { events++ })
  begin()
  const window = []
  let worst = 0
  let peakRiders = 0
  for (let i = 0; i < 60 * 300 && G.phase() !== 'over'; i++) {
    const before = events
    G.update(1 / 60)
    window.push(events - before)
    if (window.length > 60) window.shift()
    if (window.length === 60) worst = Math.max(worst, window.reduce((a, b) => a + b, 0))
    peakRiders = Math.max(peakRiders, G.status().riders)
  }
  console.log('     measured in real play: peak ' + peakRiders +
    ' riders, busiest second held ' + worst + ' one-shots')
  check('real play stays inside the budget', worst < 30, worst + ' one-shots in a second')
  E.clear()
}

// ---------------------------------------------------------------------------
section('the listening stage')
{
  // Arena units are compressed onto a stage a few metres wide, because syngen's
  // ear derives an interaural delay from raw distance. If this compression
  // breaks, every cue picks up a huge delay.
  const far = K.earLocal(K.HEAR_RANGE)
  const near = K.earLocal(2)
  const centre = K.earLocal(0)
  console.log('     dx 0 -> ' + centre.starboard.toFixed(2) + 'm, dx 2 -> ' +
    near.starboard.toFixed(2) + 'm, dx ' + K.HEAR_RANGE + ' -> ' + far.starboard.toFixed(2) + 'm')
  check('a centred rider is dead ahead, not inside your head',
    centre.starboard === 0 && centre.forward > 0.5)
  check('the stage never gets wider than a room',
    Math.abs(far.starboard) <= K.EAR_MAX_Y + 0.001,
    Math.abs(far.starboard).toFixed(1) + 'm')
  check('the interaural delay stays under 30ms',
    Math.hypot(far.forward, far.starboard) / 343 < 0.03,
    ((Math.hypot(far.forward, far.starboard) / 343) * 1000).toFixed(1) + 'ms')
  check('sides are preserved',
    K.earLocal(-30).starboard < 0 && K.earLocal(30).starboard > 0)
  check('the pan is monotonic in distance', (() => {
    let last = -Infinity
    for (let d = 0; d <= K.HEAR_RANGE; d += 1) {
      const y = K.earLocal(d).starboard
      if (y < last - 1e-9) return false
      last = y
    }
    return true
  })())
  check('near riders get most of the pan range',
    Math.abs(K.earLocal(K.EAR_HALF).starboard) / K.EAR_MAX_Y > 0.4,
    (Math.abs(K.earLocal(K.EAR_HALF).starboard) / K.EAR_MAX_Y * 100).toFixed(0) +
    '% of the stage by ' + K.EAR_HALF + ' units')
}

// ---------------------------------------------------------------------------
section('the sustained layer stays a layer, not a wash')
{
  check('the sustain is off across the arena', K.sustainWeight(K.HEAR_RANGE) === 0)
  check('the sustain is full when it is on you', K.sustainWeight(0) === 1)
  check('the sustain only covers a fraction of the arena',
    K.SUSTAIN_FAR / K.HEAR_RANGE < 0.6,
    'sustained inside ' + ((K.SUSTAIN_FAR / K.HEAR_RANGE) * 100).toFixed(0) + '% of the arena')
  begin()
  let worst = 0
  E.clear()
  E.on('frame', (e) => { worst = Math.max(worst, e.riders.length) })
  run(45)
  check('the continuous layer is capped', worst <= 4, 'at most ' + worst + ' sustained voices')
}

// ---------------------------------------------------------------------------
section('eggs')
{
  begin()
  E.clear()
  const seen = {land: 0, tick: 0, hatch: 0, collect: 0}
  E.on('egg-land', () => seen.land++)
  E.on('egg-tick', () => seen.tick++)
  E.on('hatch', () => seen.hatch++)
  E.on('egg-collect', () => seen.collect++)

  // Force a kill by driving the state directly: put a rider just below the
  // player and let the collision resolve.
  run(4)
  const before = G.status().score
  // Fly into whatever is nearest, from above.
  let killed = false
  for (let i = 0; i < 3600 && !killed; i++) {
    const n = G.nearestRider()
    if (n) {
      // Chase it horizontally and stay well above it.
      G.setThrust(n.dx > 0 ? 1 : -1)
      if (n.dAlt > -K.DUEL_RADIUS_Y * 0.6) G.flap()
    }
    G.update(1 / 60)
    if (G.status().kills > 0) killed = true
  }
  check('a rider can actually be unhorsed by flying above it', killed,
    G.status().kills + ' kills')
  check('unhorsing scores', G.status().score > before, before + ' -> ' + G.status().score)
  if (killed) {
    check('an egg is dropped', G.eggCount() > 0 || seen.collect > 0,
      G.eggCount() + ' eggs out')
  }
}
{
  // The hatch clock: it must accelerate, and it must be readable at both ends.
  const slow = K.eggTickInterval(0)
  const fast = K.eggTickInterval(1)
  console.log('     hatch clock: ' + slow.toFixed(2) + 's between ticks when it lands -> ' +
    fast.toFixed(2) + 's on the point of hatching (' + (slow / fast).toFixed(1) + 'x)')
  check('the tick accelerates', fast < slow)
  check('the acceleration is big enough to hear', slow / fast >= 3, (slow / fast).toFixed(1) + 'x')
  check('the fast end is still ticks, not a tone', fast > 0.05, fast.toFixed(3) + 's')
  check('the clock is monotonic', (() => {
    let last = Infinity
    for (let p = 0; p <= 1; p += 0.01) {
      const v = K.eggTickInterval(p)
      if (v > last + 1e-9) return false
      last = v
    }
    return true
  })())
  {
    // How many ticks does a player actually get? Too few and the timer is
    // invisible; too many and it is noise.
    let t = 0, n = 0
    while (t < K.EGG_HATCH_TIME && n < 500) { t += K.eggTickInterval(t / K.EGG_HATCH_TIME); n++ }
    console.log('     an egg ticks about ' + n + ' times before it hatches')
    check('an egg gives you enough ticks to act on', n >= 12 && n <= 60, n + ' ticks')
  }
}
{
  check('the egg streak escalates', (() => {
    for (let i = 1; i < K.EGG_SCORES.length; i++) {
      if (K.EGG_SCORES[i] <= K.EGG_SCORES[i - 1]) return false
    }
    return true
  })(), K.EGG_SCORES.join(', '))
  check('an egg is worth less than the rider that dropped it',
    K.EGG_SCORES[0] < K.RIDER_TYPES.bounder.score)
  check('a hatch escalates the tier',
    K.nextTier('bounder') === 'hunter' && K.nextTier('hunter') === 'shadowlord')
  check('the escalation tops out rather than running away',
    K.nextTier('shadowlord') === 'shadowlord')
}

// ---------------------------------------------------------------------------
section('lives, and a full run')
{
  begin()
  check('you start with lives', G.status().lives === K.LIVES, G.status().lives)
  check('an extra life is a real but distant target',
    K.EXTRA_LIFE_EVERY >= K.RIDER_TYPES.bounder.score * 8,
    K.EXTRA_LIFE_EVERY + ' points, about ' +
    Math.round(K.EXTRA_LIFE_EVERY / K.RIDER_TYPES.bounder.score) + ' bounders')
}
{
  // A passive player — never flaps, never moves — should die, and the run
  // should reach a clean game over rather than hanging.
  G.reset()
  let n = 0
  while (G.phase() !== 'over' && n < 200000) { G.update(1 / 60); n++ }
  check('a run that is played badly ends', G.phase() === 'over',
    (n / 60).toFixed(0) + 's of game time')
  check('game over reports a score', typeof G.state.score === 'number')
  check('the run does not hang', n < 200000, n + ' frames')
}
{
  // A player who does flap should survive materially longer than one who does
  // not — otherwise the wing is decoration.
  const survive = (useWing) => {
    G.reset()
    let n = 0
    while (G.phase() !== 'over' && n < 120000) {
      if (useWing) {
        const near = G.nearestRider()
        // Stay high, and run from anything above you.
        if (G.getAltitude() < K.CEILING * 0.8) G.flap()
        if (near) G.setThrust(near.dAlt > 0 ? (near.dx > 0 ? -1 : 1) : (near.dx > 0 ? 1 : -1))
      }
      G.update(1 / 60)
      n++
    }
    return {seconds: n / 60, score: G.state.score, wave: G.state.wave}
  }
  const lazy = survive(false)
  const active = survive(true)
  console.log('     never flapping: ' + lazy.seconds.toFixed(0) + 's, ' + lazy.score +
    ' points, reached wave ' + lazy.wave)
  console.log('     flying high:    ' + active.seconds.toFixed(0) + 's, ' + active.score +
    ' points, reached wave ' + active.wave)
  check('playing well beats playing badly', active.score > lazy.score,
    active.score + ' vs ' + lazy.score)
  check('climbing away from a threat is a real defence', active.seconds > lazy.seconds,
    active.seconds.toFixed(0) + 's vs ' + lazy.seconds.toFixed(0) + 's')
}

// ---------------------------------------------------------------------------
section('pressure')
{
  // The bug this exists to prevent: a chasing rider steers for a point
  // AI_ABOVE units over your head. If that band sits outside the collision box
  // it can never actually touch you, so it holds station up there forever and
  // the strongest strategy in the whole game becomes kiting. The band has to be
  // above the margin (so the rider wins) and inside the box (so it can reach).
  check('a chasing rider aims at a position that can actually reach you',
    K.AI_ABOVE[1] < K.DUEL_RADIUS_Y,
    'aims ' + K.AI_ABOVE[0] + '-' + K.AI_ABOVE[1] + ' above you, box is +/-' + K.DUEL_RADIUS_Y)
  check('...and at one that wins when it gets there',
    K.AI_ABOVE[0] > K.DUEL_MARGIN,
    'closest it aims is ' + K.AI_ABOVE[0] + ', margin is ' + K.DUEL_MARGIN)

  // The anti-stalling rule has to actually bite: a hurrying rider must be able
  // to run you down, or waiting is still a strategy.
  const hurried = (tier) => K.RIDER_TYPES[tier].speed * K.WAVE_HURRY_MULT
  console.log('     at full hurry: bounder ' + hurried('bounder').toFixed(0) +
    ', hunter ' + hurried('hunter').toFixed(0) +
    ', shadow lord ' + hurried('shadowlord').toFixed(0) +
    ' vs your ' + K.SPEED_MAX_AIR)
  check('a dragging wave eventually outruns you',
    hurried('hunter') > K.SPEED_MAX_AIR,
    'hurrying hunter does ' + hurried('hunter').toFixed(0) + ' vs your ' + K.SPEED_MAX_AIR)
  check('...and can climb over you',
    K.RIDER_TYPES.hunter.climb * K.WAVE_HURRY_MULT > K.CLIMB_MAX,
    (K.RIDER_TYPES.hunter.climb * K.WAVE_HURRY_MULT).toFixed(0) + ' vs your ' + K.CLIMB_MAX)
  check('wandering stops before the hurry is fully wound up',
    K.WAVE_HURRY_COMMIT > 0 && K.WAVE_HURRY_COMMIT < 1,
    'riders commit at ' + (K.WAVE_HURRY_COMMIT * 100) + '% of the ramp, about ' +
    (K.WAVE_HURRY + K.WAVE_HURRY_RAMP * K.WAVE_HURRY_COMMIT).toFixed(0) + 's into a wave')
}
{
  check('a dragging wave speeds everything up',
    K.WAVE_HURRY_MULT > 1 && K.WAVE_HURRY > 20,
    'after ' + K.WAVE_HURRY + 's, ramping to ' + K.WAVE_HURRY_MULT + 'x over ' +
    K.WAVE_HURRY_RAMP + 's')
  check('a shadow lord can outclimb you',
    K.RIDER_TYPES.shadowlord.climb >= K.CLIMB_MAX,
    K.RIDER_TYPES.shadowlord.climb + ' vs your ' + K.CLIMB_MAX)
  check('a bounder cannot', K.RIDER_TYPES.bounder.climb < K.CLIMB_MAX,
    K.RIDER_TYPES.bounder.climb + ' vs your ' + K.CLIMB_MAX)
  check('you can outrun a bounder but not a shadow lord',
    K.SPEED_MAX_AIR > K.RIDER_TYPES.bounder.speed &&
    K.SPEED_MAX_AIR <= K.RIDER_TYPES.shadowlord.speed,
    'you ' + K.SPEED_MAX_AIR + ', bounder ' + K.RIDER_TYPES.bounder.speed +
    ', shadow lord ' + K.RIDER_TYPES.shadowlord.speed)
  check('aggression escalates with tier',
    K.RIDER_TYPES.bounder.aggression < K.RIDER_TYPES.hunter.aggression &&
    K.RIDER_TYPES.hunter.aggression < K.RIDER_TYPES.shadowlord.aggression)
}
{
  // The anti-stalling rule, tested directly rather than by comparing two bots.
  // Which STRATEGY scores best is a balance question with enormous run-to-run
  // variance — that belongs in tools/balance.js, which averages over many runs.
  // What has to be true HERE is structural: a player who refuses to engage
  // cannot simply outlast a wave. Hover high, never move, never fight, and the
  // wave must still come and get you.
  const hoverForever = () => {
    G.reset()
    let n = 0
    while (G.phase() !== 'over' && n < 300000) {
      if (G.phase() === 'play') {
        // Sit high, and do nothing else at all.
        if (G.getAltitude() < K.CEILING * 0.75) G.flap()
        G.setThrust(0)
      }
      G.update(1 / 60)
      n++
    }
    return n / 60
  }
  const runs = []
  for (let i = 0; i < 5; i++) runs.push(hoverForever())
  const avg = runs.reduce((a, b) => a + b, 0) / runs.length
  const worst = Math.max(...runs)
  console.log('     hovering and never engaging: ' + avg.toFixed(0) + 's average, ' +
    worst.toFixed(0) + 's at worst, over 5 runs')
  check('refusing to engage does not let you outlast a wave', worst < 400,
    'longest stall was ' + worst.toFixed(0) + 's')
  check('...and it is a losing line, not merely a slow one', avg < 240,
    avg.toFixed(0) + 's average')
}


console.log('\n' + (failures === 0 ? 'MECHANICS HARNESS PASSED' : failures + ' CHECK(S) FAILED'))
process.exit(failures === 0 ? 0 : 1)
