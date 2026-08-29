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

  startPatrol(content)
  run(content, 50, () => { g.nudgeThrottle(1, 1 / 60); g.ping() })
  console.log('\n5. stealth')
  check('flank speed plus constant pinging gets you acquired', acquired,
    g.getNoise().toFixed(2))

  g.setDepth('deep')
  run(content, 60, () => g.nudgeThrottle(-1, 1 / 60))
  console.log('  (noise after 60s stopped and deep: ' + g.getNoise().toFixed(3) + ')')
  check('going quiet and deep loses them', lost && !g.isHunted())
}

// --- 6. depth is worth taking ------------------------------------------------
{
  const k = load().constants
  const prox = 0.9
  const shallow = k.CHARGE_DAMAGE * prox
  const deep = k.CHARGE_DAMAGE * prox * k.DEEP_DAMAGE_MULT

  console.log('\n6. depth')
  check('deep takes less damage', deep < shallow, deep.toFixed(1) + ' vs ' + shallow.toFixed(1))
  // Expressed as the thing that actually matters: how many charges at ground
  // zero it takes to kill the boat at each depth.
  const killsShallow = k.HULL_MAX / shallow
  const killsDeep = k.HULL_MAX / deep
  check('a shallow boat dies to a handful of close charges',
    killsShallow > 2 && killsShallow < 7, killsShallow.toFixed(1) + ' charges')
  check('a deep boat can ride out a long attack',
    killsDeep > 12, killsDeep.toFixed(1) + ' charges')
  check('a full battery is a finite dive',
    k.BATTERY_MAX / k.BATTERY_DRAIN > 15 && k.BATTERY_MAX / k.BATTERY_DRAIN < 45,
    (k.BATTERY_MAX / k.BATTERY_DRAIN).toFixed(0) + 's submerged')
  check('running deep costs you the chase', k.SPEED_MAX_DEEP < k.SPEED_MAX_SHALLOW,
    k.SPEED_MAX_DEEP + ' vs ' + k.SPEED_MAX_SHALLOW + ' m/s')
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
