/**
 * Headless simulation harness for SEA WOLF.
 *
 * content/{constants,events,game}.js touch no Web Audio and no DOM, so they can
 * be loaded straight into Node and driven at a fixed timestep. This exercises
 * the parts that are hard to check by ear: that the boat actually answers the
 * helm, that a player who steers toward a contact closes on it, that a
 * correctly-led torpedo hits and an unled one does not, that speed is what
 * gets you found, and that depth is worth taking.
 *
 *   node tools/sim.js
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const SRC = path.join(__dirname, '..', 'src', 'js', 'content')

function load() {
  const sandbox = {content: {}, console, Math, Date, Set, Map}
  sandbox.global = sandbox
  vm.createContext(sandbox)
  for (const f of ['constants.js', 'events.js', 'game.js']) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), sandbox, {filename: f})
  }
  return sandbox.content
}

let failures = 0
function check(name, cond, detail) {
  if (cond) {
    console.log('  ok   ' + name)
  } else {
    failures++
    console.log('  FAIL ' + name + (detail ? '  -> ' + detail : ''))
  }
}

function run(content, seconds, each, dt) {
  dt = dt || 1 / 60
  const steps = Math.round(seconds / dt)
  for (let i = 0; i < steps; i++) {
    if (each) each(i * dt, dt)
    content.game.update(dt)
  }
}

// Skip the 3-second ready countdown.
function startPatrol(content) {
  content.game.reset()
  run(content, 3.2)
}

// Steer the boat toward a relative bearing, the way a player listening to the
// beeps would: rudder over until it is ahead, throttle up.
function steerToward(g, bearing, throttleDir) {
  g.setRudder(bearing > 3 ? 1 : (bearing < -3 ? -1 : 0))
  g.nudgeThrottle(throttleDir === undefined ? 1 : throttleDir, 1 / 60)
}

console.log('\nSEA WOLF simulation\n')

// --- 1. the boat answers the helm -------------------------------------------
{
  const content = load()
  const g = content.game
  startPatrol(content)

  const h0 = g.getHeading()
  // Stopped, the rudder should do almost nothing.
  g.state.throttle = 0
  g.state.speed = 0
  g.setRudder(1)
  run(content, 2)
  const turnedStopped = Math.abs(content.constants.wrapDeg(g.getHeading() - h0))

  // Under way it should answer properly.
  g.state.speed = content.constants.SPEED_MAX_SHALLOW
  g.state.throttle = 1
  const h1 = g.getHeading()
  run(content, 2)
  const turnedMoving = Math.abs(content.constants.wrapDeg(g.getHeading() - h1))

  console.log('1. the helm')
  check('a stopped boat barely turns', turnedStopped < 12, turnedStopped.toFixed(1) + ' deg in 2s')
  check('a boat under way answers the rudder', turnedMoving > 40,
    turnedMoving.toFixed(1) + ' deg in 2s')
  check('the rudder is much better with way on', turnedMoving > turnedStopped * 3,
    turnedMoving.toFixed(1) + ' vs ' + turnedStopped.toFixed(1))

  // Throttle actually moves the boat.
  const c3 = load()
  startPatrol(c3)
  const before = {x: c3.game.state.x, y: c3.game.state.y}
  c3.game.setRudder(0)
  run(c3, 5, () => c3.game.nudgeThrottle(1, 1 / 60))
  const moved = Math.hypot(c3.game.state.x - before.x, c3.game.state.y - before.y)
  check('throttle moves the boat', moved > 40, moved.toFixed(0) + ' m in 5s')
  check('the motor reaches a useful speed', c3.game.getSpeed() > 10,
    c3.game.getSpeed().toFixed(1) + ' m/s')
}

// --- 2. you can find and close on a convoy ----------------------------------
// The original build's complaint was that you never got into contact. Drive
// the way the beeps tell you to and the range must come down.
{
  const content = load()
  const g = content.game
  startPatrol(content)

  const first = g.contactList()[0]

  let startRange = first ? first.range : Infinity
  let targetId = first ? first.id : null

  run(content, 90, () => {
    const list = g.contactList()
    const t = list.find((c) => c.id === targetId) || list[0]
    if (!t) return
    targetId = t.id
    steerToward(g, t.bearing)
  })
  const after = g.contactList().find((c) => c.id === targetId)

  console.log('\n2. the intercept')
  check('there is something in the water from the first second', !!first,
    first ? Math.round(first.range) + ' m away' : 'nothing')
  check('a contact starts within hearing', startRange <= content.constants.CONTACT_RANGE,
    Math.round(startRange) + ' m')
  check('steering toward a contact closes the range',
    !after || after.range < startRange,
    after ? Math.round(startRange) + ' -> ' + Math.round(after.range) + ' m'
          : 'target left the field (also fine)')
  // A torpedo runs TORPEDO_SPEED * TORPEDO_LIFE metres, so "in range" is
  // generous; what matters is that a pure stern chase gets you inside it.
  const reach = content.constants.TORPEDO_SPEED * content.constants.TORPEDO_LIFE
  check('you can reach torpedo range',
    !after || after.range < reach * 0.6,
    after ? Math.round(after.range) + ' m, torpedo reaches ' + Math.round(reach) + ' m' : 'n/a')
}

// --- 3. the lead is the mechanic --------------------------------------------
// Only engagements where the lead is non-trivial count. A ship coming almost
// straight at you needs barely any lead and an unled shot hits it fine; that is
// correct geometry. What must hold is that where the lead IS large, ignoring it
// misses the ship you aimed at.
{
  const MIN_LEAD = 4

  function attempt(useLead) {
    const content = load()
    const g = content.game
    let hitId = null
    let targetId = null
    content.events.on('hit', (e) => { if (hitId === null) hitId = e.id })
    startPatrol(content)

    let fired = false
    run(content, 150, () => {
      if (fired) return
      const list = g.contactList().filter((c) => !c.escort && c.range > 350 && c.range < 1300)
      if (!list.length) return
      const target = list[0]
      // Point the boat at it, then read the solution the module offers.
      steerToward(g, target.bearing)
      const sol = g.aimedContact()
      if (!sol || sol.escort || sol.id !== target.id) return
      if (!sol.leadReachable) return
      if (Math.abs(sol.leadBearing - sol.bearing) < MIN_LEAD) return
      targetId = sol.id
      g.state.periscope = useLead ? sol.leadBearing : sol.bearing
      fired = g.fire()
    })
    run(content, 14) // let the fish finish its run
    return {fired, hit: hitId !== null && hitId === targetId, anyHit: hitId !== null}
  }

  const TRIALS = 30
  let ledHits = 0, ledShots = 0, unledHits = 0, unledShots = 0, unledStray = 0
  for (let i = 0; i < TRIALS; i++) {
    const a = attempt(true)
    if (a.fired) { ledShots++; if (a.hit) ledHits++ }
    const b = attempt(false)
    if (b.fired) { unledShots++; if (b.hit) unledHits++; else if (b.anyHit) unledStray++ }
  }
  const ledRate = ledShots ? ledHits / ledShots : 0
  const unledRate = unledShots ? unledHits / unledShots : 0

  console.log('\n3. the lead is the mechanic')
  console.log('  (led ' + (ledRate * 100).toFixed(0) + '% of ' + ledShots + ' shots, ' +
              'unled ' + (unledRate * 100).toFixed(0) + '% of ' + unledShots + ' shots, ' +
              'plus ' + unledStray + ' unled shots that hit another ship)')
  check('shots are actually taken', ledShots > TRIALS * 0.5 && unledShots > TRIALS * 0.5,
    ledShots + '/' + unledShots + ' of ' + TRIALS)
  check('a led shot usually hits', ledRate > 0.6, (ledRate * 100).toFixed(0) + '%')
  check('ignoring a real lead usually misses', unledRate < 0.35,
    (unledRate * 100).toFixed(0) + '% still connected')
}

// --- 4. speed is noise -------------------------------------------------------
{
  const fast = load()
  startPatrol(fast)
  fast.game.setRudder(0)
  run(fast, 45, () => fast.game.nudgeThrottle(1, 1 / 60))

  const slow = load()
  startPatrol(slow)
  slow.game.setRudder(0)
  run(slow, 45, () => slow.game.nudgeThrottle(-1, 1 / 60))

  console.log('\n4. speed is noise')
  console.log('  (flank noise ' + fast.game.getNoise().toFixed(2) +
              ', stopped noise ' + slow.game.getNoise().toFixed(2) + ')')
  check('running flank gets you found', fast.game.isHunted() || fast.game.getNoise() > 0.4,
    fast.game.getNoise().toFixed(2))
  check('creeping keeps you quiet', slow.game.getNoise() < 0.15, slow.game.getNoise().toFixed(2))
  check('the difference is large', fast.game.getNoise() > slow.game.getNoise() + 0.25,
    fast.game.getNoise().toFixed(2) + ' vs ' + slow.game.getNoise().toFixed(2))
}

// --- 5. stealth recovers -----------------------------------------------------
{
  const content = load()
  const g = content.game
  let acquired = false, lost = false
  content.events.on('acquired', () => { acquired = true })
  content.events.on('lost-contact', () => { lost = true })

  // This check is about the NOISE ECONOMY, so the boat is made unsinkable for
  // its duration. A boat that gets torpedoed partway through freezes at phase
  // 'over', after which update() is a no-op and the noise gauge simply stops
  // where it was - pinned at 1.0. That made the check fail at random and told
  // us nothing about whether going quiet works.
  const immortal = () => {
    g.state.hull = content.constants.HULL_MAX
    if (g.phase() !== 'play') g.state.phase = 'play'
  }

  startPatrol(content)
  run(content, 50, () => { immortal(); g.nudgeThrottle(1, 1 / 60); g.ping() })
  console.log('\n5. stealth')
  check('flank speed plus constant pinging gets you acquired', acquired,
    g.getNoise().toFixed(2))

  // Take her to the cellar and stop. Depth sheds noise faster, so this is the
  // escape route the noise economy is supposed to offer.
  g.setDepthLevel(content.constants.DEPTH_LEVELS.length - 1)
  run(content, 60, () => { immortal(); g.nudgeThrottle(-1, 1 / 60) })
  console.log('  (noise after 60s stopped and deep: ' + g.getNoise().toFixed(3) + ')')
  check('going quiet and deep loses them', lost && !g.isHunted())
}

// --- 6. depth is worth taking ------------------------------------------------
// Depth is no longer a damage multiplier; it is a MISS. An escort's torpedo runs
// at the depth it guessed when it fired, so what matters is how often that guess
// lands inside ENEMY_TORPEDO_DEPTH_BAND of where the boat actually is.
{
  const k = load().constants

  // Fraction of shots whose depth setting would still be lethal, for a boat
  // sitting at each rung of the ladder. The escort's error scales with the
  // boat's depth, which is what makes the bottom of the ladder worth the trip.
  // Sampled at grip 1 - escorts that have the boat cold - so these are the
  // WORST case for the player. This mirrors escortFire() exactly, including
  // the fact that the guess is floored at the surface but not capped at
  // MAX_DEPTH: capping it was what used to make the cellar a worse place to
  // hide than 200 metres.
  function lethalFraction(depth, grip) {
    let hits = 0
    const TRIALS = 20000
    for (let i = 0; i < TRIALS; i++) {
      const err = k.ESCORT_DEPTH_ERROR * k.depthFraction(depth) * k.lerp(1, 0.6, grip)
      const setFor = Math.max(0, depth + k.rand(-err, err))
      if (Math.abs(setFor - depth) <= k.ENEMY_TORPEDO_DEPTH_BAND) hits++
    }
    return hits / TRIALS
  }

  console.log('\n6. depth')
  const atTop = lethalFraction(k.DEPTH_LEVELS[0], 1)
  const atBottom = lethalFraction(k.MAX_DEPTH, 1)
  for (const d of k.DEPTH_LEVELS) {
    console.log('  ' + String(d).padStart(4) + ' m: ' +
      (lethalFraction(d, 1) * 100).toFixed(0) + '% of well-aimed shots still find you')
  }
  check('at periscope depth they cannot miss you vertically', atTop > 0.95,
    (atTop * 100).toFixed(0) + '%')
  check('the cellar beats most of their shots', atBottom < 0.5,
    (atBottom * 100).toFixed(0) + '%')
  check('the ladder is a gradient, not a switch',
    lethalFraction(100, 1) > lethalFraction(200, 1) &&
    lethalFraction(200, 1) > atBottom)

  // A round trip to the bottom has to cost a real slice of the battery,
  // otherwise there is no reason ever to come up.
  const trip = k.MAX_DEPTH / k.DIVE_RATE + k.MAX_DEPTH / k.RISE_RATE
  const drain = (k.BATTERY_DRAIN_BASE + k.BATTERY_DRAIN_DEPTH * 0.5) * trip
  check('a round trip to the cellar costs real battery',
    drain > 8 && drain < 60, drain.toFixed(0) + '% for a ' + trip.toFixed(0) + 's round trip')
  check('you cannot sit on the bottom all patrol',
    k.BATTERY_MAX / (k.BATTERY_DRAIN_BASE + k.BATTERY_DRAIN_DEPTH) < k.PATROL_TIME * 0.5,
    (k.BATTERY_MAX / (k.BATTERY_DRAIN_BASE + k.BATTERY_DRAIN_DEPTH)).toFixed(0) + 's at the bottom')
  check('running deep costs you the chase', k.SPEED_MAX_DEEP < k.SPEED_MAX_SHALLOW,
    k.SPEED_MAX_DEEP + ' vs ' + k.SPEED_MAX_SHALLOW + ' m/s')
  // The dodge only works if the fish takes longer to arrive than the boat takes
  // to change level. That is the single number the whole evasion loop rests on.
  const rung = k.DEPTH_LEVELS[1] - k.DEPTH_LEVELS[0]
  check('one rung of depth is quicker than a torpedo from the hold-off range',
    rung / k.DIVE_RATE < k.ESCORT_FIRE_MIN / k.ENEMY_TORPEDO_SPEED,
    (rung / k.DIVE_RATE).toFixed(1) + 's to dive vs ' +
    (k.ESCORT_FIRE_MIN / k.ENEMY_TORPEDO_SPEED).toFixed(1) + 's of flight')
}

// --- 6b. the sweep is fast, free and vague -----------------------------------
// The sweep only justifies its existence if it is strictly worse than the ping
// at the ping's job. If its bearings were tight enough to shoot on, or it
// reported a usable range, it would just be a ping with no downside and the
// active/passive choice would collapse.
{
  const content = load()
  const g = content.game
  const k = content.constants
  let last = null
  content.events.on('sweep', (e) => { last = e })
  startPatrol(content)
  run(content, 2)

  console.log('\n6b. the hydrophone sweep')
  const noiseBefore = g.getNoise()
  const ok = g.sweep()
  check('a sweep answers', ok && !!last, last ? last.returns.length + ' returns' : 'none')
  check('it costs no noise', g.getNoise() === noiseBefore,
    noiseBefore.toFixed(3) + ' -> ' + g.getNoise().toFixed(3))
  check('it cannot be spammed every frame', !g.sweep())
  check('it reports bands, never metres',
    last.returns.every((r) => r.band >= 0 && r.band <= 2 && r.range === undefined))
  // One beep per contact, and every beep equally audible: the burst has to be
  // countable, and the far contacts are exactly the ones worth warning about.
  const audible = g.contactList().filter((c) => c.range <= last.reach).length
  check('one return per contact in reach', last.returns.length === audible,
    last.returns.length + ' returns for ' + audible + ' contacts in reach')
  check('all placed at the same radius, so none is faint',
    last.returns.every((r) => Math.abs(
      Math.hypot(r.local.forward, r.local.starboard) - k.SWEEP_PLOT_RADIUS) < 0.01))
  check('the burst sweeps clockwise from dead ahead',
    last.returns.every((r, i, a) => i === 0 ||
      (a[i - 1].bearing < 0 ? a[i - 1].bearing + 360 : a[i - 1].bearing) <=
      (r.bearing < 0 ? r.bearing + 360 : r.bearing)))
  check('each beep says which side of the beam it is on',
    last.returns.every((r) => r.ahead === (Math.abs(r.bearing) < 90)))

  // Sample the bearing error against the truth, and against the thing it must
  // not be good enough for: the lead angle you actually have to shoot on.
  let worst = 0, n = 0, sum = 0
  run(content, 120, () => {
    if (!g.sweep()) return
    const truth = new Map(g.contactList().map((c) => [c.id, c.bearing]))
    for (const r of last.returns) {
      if (!truth.has(r.id)) continue
      const err = Math.abs(k.wrapDeg(r.bearing - truth.get(r.id)))
      worst = Math.max(worst, err); sum += err; n++
    }
  })
  const mean = n ? sum / n : 0
  console.log('  (bearing error over ' + n + ' returns: mean ' +
    mean.toFixed(1) + ' deg, worst ' + worst.toFixed(1) + ')')
  check('bearings are smeared, not exact', mean > 3, mean.toFixed(1) + ' deg mean error')
  // A crossing shot needs about 6 degrees of lead. If the sweep's own error is
  // not comfortably bigger than that, it is accurate enough to aim with.
  check('too vague to shoot on', mean > 6, mean.toFixed(1) + ' deg vs a ~6 deg lead')
  check('but still tells you which way to turn', mean < 45,
    'a 90 degree error would be useless')

  // Depth is supposed to cost you the passive picture, the same way it costs
  // you the beeps.
  const shallowReach = k.CONTACT_RANGE
  const deepReach = k.CONTACT_RANGE * k.SWEEP_DEEP_RANGE_MULT
  check('running deep shortens the sweep', deepReach < shallowReach,
    Math.round(deepReach) + ' m vs ' + Math.round(shallowReach))
}

// --- 7. the ocean stays populated and bounded --------------------------------
{
  const content = load()
  const g = content.game
  let peak = 0, empty = 0, samples = 0
  startPatrol(content)
  run(content, 300, (t) => {
    g.nudgeThrottle(1, 1 / 60)
    if (Math.round(t * 60) % 30) return
    const audible = g.contactList().filter((c) => c.audible).length
    peak = Math.max(peak, g.contactList().length)
    if (!audible) empty++
    samples++
  })

  console.log('\n7. the ocean')
  check('never exceeds the audio budget', peak <= content.constants.MAX_CONTACTS,
    'peak ' + peak + ' vs budget ' + content.constants.MAX_CONTACTS)
  check('rarely leaves you with nothing to hear', empty / samples < 0.35,
    (empty / samples * 100).toFixed(0) + '% of samples had an empty field')
}

// --- 8. the patrol ends cleanly ---------------------------------------------
{
  const content = load()
  const g = content.game
  let over = null
  content.events.on('game-over', (e) => { over = e })
  startPatrol(content)
  run(content, 365)

  console.log('\n8. the end')
  check('patrol ends on the clock', !!over, String(g.phase()))
  check('reports a reason', over && over.reason === 'time', over && over.reason)
  check('score is tonnage', over && over.score === over.tonnage)
}

console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all checks passed') + '\n')
process.exit(failures ? 1 : 0)
