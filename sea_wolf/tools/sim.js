/**
 * Headless simulation harness for SEA WOLF.
 *
 * content/{constants,events,game}.js touch no Web Audio and no DOM, so they can
 * be loaded straight into Node and driven at a fixed timestep. This exercises
 * the parts that are hard to check by ear: that convoys spawn and clear, that a
 * correctly-led torpedo actually hits and a badly-led one misses, that the
 * escorts acquire on noise and give up on silence, and that depth really is
 * the difference between a survivable charge and a fatal one.
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

// Run the sim for `seconds`, calling `each(t)` every step.
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

// ---------------------------------------------------------------------------
console.log('\nSEA WOLF simulation\n')

// --- 1. a patrol runs, convoys arrive, contacts clear ----------------------
{
  const content = load()
  const seen = new Set()
  let maxContacts = 0
  content.events.on('convoy', () => seen.add(seen.size))
  startPatrol(content)
  run(content, 180, () => {
    maxContacts = Math.max(maxContacts, content.game.contactList().length)
  })
  const st = content.game.status()
  const k = content.constants
  // Expect roughly one convoy per CONVOY_GAP, with slack for the dice and for
  // convoys skipped because the arc was already at MAX_CONTACTS.
  const expected = 180 / ((k.CONVOY_GAP[0] + k.CONVOY_GAP[1]) / 2)

  console.log('1. patrol pacing')
  check('convoys arrive at roughly the intended cadence',
    seen.size >= Math.floor(expected * 0.5) && seen.size <= Math.ceil(expected * 1.6),
    seen.size + ' convoys in 180s, expected about ' + expected.toFixed(1))
  check('contacts appear in the arc', maxContacts > 0, 'peak ' + maxContacts)
  check('the arc never exceeds the audio budget', maxContacts <= content.constants.MAX_CONTACTS,
    'peak ' + maxContacts + ' vs budget ' + content.constants.MAX_CONTACTS)
  check('still playing after 180s', content.game.phase() === 'play', content.game.phase())
  check('clock counts down', st.timeLeft < 300 && st.timeLeft > 100, String(st.timeLeft))
  check('no torpedoes spent on their own', st.torpedoes === 12, String(st.torpedoes))
}

// --- 2. a correctly-led shot hits; an unled shot at the same target misses --
// Fires at the true lead bearing the module itself computes, then re-runs the
// identical setup firing straight at the target's current bearing.
//
// Only engagements where the lead is actually non-trivial count. A ship
// crossing at a wide bearing is travelling almost straight down the line of
// sight, so it needs barely any lead and an unled shot hits it fine — that is
// correct geometry, not a broken mechanic, and it is what makes a distant
// beam-on contact the easy shot and a close one the interesting shot. What
// must hold is that where the lead IS large, ignoring it misses.
{
  // Degrees of lead below which the shot is not really testing anything.
  const MIN_LEAD = 4

  function attempt(useLead) {
    const content = load()
    const g = content.game
    // Track WHICH ship was hit. Convoys are strung out along one track, so a
    // shot that misses its target can still blunder into the ship behind it —
    // a fair outcome in the game, but it is not evidence that the lead works.
    let hitId = null
    content.events.on('hit', (e) => { if (hitId === null) hitId = e.id })
    let targetId = null
    startPatrol(content)

    // Wait for a merchant at a workable range with a real lead, then shoot.
    let fired = false
    run(content, 120, () => {
      if (fired) return
      const list = g.contactList().filter((c) => !c.escort && c.range > 500 && c.range < 1400)
      if (!list.length) return
      // Put the periscope on it, then read the solution the module offers.
      g.state.aim = list[0].bearing
      const sol = g.aimedContact()
      if (!sol || sol.escort) return
      if (Math.abs(sol.leadBearing - sol.bearing) < MIN_LEAD) return
      targetId = sol.id
      g.state.aim = useLead ? sol.leadBearing : sol.bearing
      fired = g.fire()
    })
    // Let the fish finish its run before judging the shot.
    run(content, 14)
    return {fired, hit: hitId !== null && hitId === targetId, anyHit: hitId !== null}
  }

  console.log('\n2. the lead is the mechanic')
  // Fire the same engagement many times each way. An unled shot at a slow
  // target on a near-radial course can still connect by luck, so what matters
  // is the gap between the two hit rates, not any single shot.
  const TRIALS = 40
  let ledHits = 0, ledShots = 0, unledHits = 0, unledShots = 0, unledStray = 0
  for (let i = 0; i < TRIALS; i++) {
    const a = attempt(true)
    if (a.fired) { ledShots++; if (a.hit) ledHits++ }
    const b = attempt(false)
    if (b.fired) { unledShots++; if (b.hit) unledHits++; else if (b.anyHit) unledStray++ }
  }
  const ledRate = ledShots ? ledHits / ledShots : 0
  const unledRate = unledShots ? unledHits / unledShots : 0

  console.log('  (led ' + (ledRate * 100).toFixed(0) + '% of ' + ledShots + ' shots, ' +
              'unled ' + (unledRate * 100).toFixed(0) + '% of ' + unledShots + ' shots, ' +
              'plus ' + unledStray + ' unled shots that hit another ship in the convoy)')
  check('shots are actually taken', ledShots > TRIALS * 0.6 && unledShots > TRIALS * 0.6,
    ledShots + '/' + unledShots + ' of ' + TRIALS)
  check('a led shot usually hits', ledRate > 0.7, (ledRate * 100).toFixed(0) + '%')
  check('ignoring a real lead usually misses', unledRate < 0.35,
    (unledRate * 100).toFixed(0) + '% of unled shots still connected')
  check('the lead is worth at least double', ledRate > unledRate * 2,
    (ledRate * 100).toFixed(0) + '% vs ' + (unledRate * 100).toFixed(0) + '%')
}

// --- 3. escorts acquire on noise and give up on silence --------------------
{
  const content = load()
  const g = content.game
  let acquired = false
  let lost = false
  content.events.on('acquired', () => { acquired = true })
  content.events.on('lost-contact', () => { lost = true })

  startPatrol(content)
  // Ping as often as the cooldown allows — the loudest thing you can do.
  run(content, 40, () => { g.ping() })
  const noisy = g.getNoise()

  console.log('\n3. stealth')
  check('pinging raises the noise signature', noisy > 0.4, noisy.toFixed(2))
  check('escorts acquire you', acquired)

  // Now go quiet and deep and wait them out.
  g.setDepth('deep')
  run(content, 60)
  console.log('  (noise after 60s silent+deep: ' + g.getNoise().toFixed(3) + ')')
  check('running silent loses them', lost && !g.isHunted())
}

// --- 4. depth is worth taking ----------------------------------------------
// Same charge, same proximity, both depths — deep must take materially less.
{
  const content = load()
  const k = content.constants
  const prox = 0.9
  const shallow = k.CHARGE_DAMAGE * prox
  const deep = k.CHARGE_DAMAGE * prox * k.DEEP_DAMAGE_MULT

  console.log('\n4. depth')
  check('deep takes less damage', deep < shallow, deep.toFixed(1) + ' vs ' + shallow.toFixed(1))
  check('deep is survivable, shallow is not, over a pattern',
    deep * 4 < k.HULL_MAX && shallow * 4 > k.HULL_MAX,
    '4 charges: ' + (deep * 4).toFixed(0) + ' deep / ' + (shallow * 4).toFixed(0) + ' shallow')

  // The battery has to force you back up eventually.
  const dive = k.BATTERY_MAX / k.BATTERY_DRAIN
  check('a full battery is a finite dive', dive > 10 && dive < 40, dive.toFixed(0) + 's submerged')
}

// --- 5. the boat can actually be sunk ---------------------------------------
{
  const content = load()
  const g = content.game
  let sunk = false
  content.events.on('doom', (e) => { if (e.reason === 'sunk') sunk = true })

  startPatrol(content)
  // Make every possible noise and stay shallow: the worst play there is.
  run(content, 240, () => { g.ping(); g.fire() })

  console.log('\n5. consequences')
  check('reckless play gets you killed or emptied',
    sunk || g.phase() !== 'play',
    'sunk=' + sunk + ' phase=' + g.phase() + ' hull=' + g.status().hull)
}

// --- 6. the patrol ends cleanly ---------------------------------------------
{
  const content = load()
  const g = content.game
  let over = null
  content.events.on('game-over', (e) => { over = e })

  startPatrol(content)
  run(content, 305)

  console.log('\n6. the end')
  check('patrol ends on the clock', !!over, String(g.phase()))
  check('reports a reason', over && over.reason === 'time', over && over.reason)
  check('score is tonnage', over && over.score === over.tonnage)
}

console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all checks passed') + '\n')
process.exit(failures ? 1 : 0)
