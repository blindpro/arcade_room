/**
 * Balance probe for SEA WOLF. tools/sim.js proves the mechanics work at all;
 * this asks whether they are worth playing — how much is within earshot and how
 * far away, how audible the beep rate ramp actually is across that range, how
 * big the lead angle gets, and what different ways of driving the boat score.
 *
 *   node tools/balance.js
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const SRC = path.join(__dirname, '..', 'src', 'js', 'content')

function load() {
  const sandbox = {content: {}, console, Math, Date, Set, Map}
  vm.createContext(sandbox)
  for (const f of ['constants.js', 'events.js', 'game.js']) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), sandbox, {filename: f})
  }
  return sandbox.content
}

function run(content, seconds, each, dt) {
  dt = dt || 1 / 60
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    if (each) each(i * dt, dt)
    content.game.update(dt)
  }
}
function startPatrol(content) { content.game.reset(); run(content, 3.2) }

function stats(xs) {
  if (!xs.length) return {n: 0}
  const s = xs.slice().sort((a, b) => a - b)
  const sum = s.reduce((a, b) => a + b, 0)
  return {
    n: s.length, min: s[0], p50: s[Math.floor(s.length * 0.5)],
    p90: s[Math.floor(s.length * 0.9)], max: s[s.length - 1], mean: sum / s.length,
  }
}
const f1 = (x) => (x == null ? '-' : x.toFixed(1))

console.log('\nSEA WOLF balance probe\n')

// --- is the beep rate ramp actually readable? -------------------------------
// The whole navigation interface is "the gap between beeps is the range". If
// the interval barely moves across the useful band, the interface is a lie.
{
  const k = load().constants
  console.log('the beep rate ramp - the primary distance cue')
  const rows = [k.CONTACT_RANGE, 1300, 1000, 800, 600, 450, 250, 100]
  for (const r of rows) {
    const iv = k.beepInterval(r)
    const bar = '#'.repeat(Math.max(1, Math.round(60 / (iv * 20))))
    console.log('  ' + String(Math.round(r)).padStart(5) + ' m  ' +
      iv.toFixed(2) + 's  ' + bar)
  }
  const ratio = k.beepInterval(k.CONTACT_RANGE) / k.beepInterval(100)
  console.log('  edge-of-hearing beep is ' + ratio.toFixed(1) + 'x slower than close aboard')
}

// --- the shape of the ocean --------------------------------------------------
{
  const content = load()
  const g = content.game
  const audible = [], ranges = [], escortShare = []
  startPatrol(content)
  // Drive the way a player would: chase whatever is nearest.
  run(content, 360, (t) => {
    // Once the boat is dead the world stops moving, and every later sample is
    // a duplicate of the frame it died on. That used to pull the median onto
    // the final value and make it identical to the extreme, which read as a
    // suspicious result rather than as "the patrol ended early".
    if (g.phase() !== 'play') return
    const list = g.contactList()
    if (list.length) {
      g.setRudder(list[0].bearing > 3 ? 1 : (list[0].bearing < -3 ? -1 : 0))
      g.nudgeThrottle(1, 1 / 60)
    }
    if (Math.round(t * 60) % 30) return
    const aud = list.filter((c) => c.audible)
    audible.push(aud.length)
    for (const c of aud) ranges.push(c.range)
    if (aud.length) escortShare.push(aud.filter((c) => c.escort).length / aud.length)
  })
  const a = stats(audible), r = stats(ranges)
  console.log('\nthe ocean, sampled across a full 6-minute patrol (driving hard)')
  console.log('  audible contacts   min ' + a.min + '  median ' + a.p50 + '  p90 ' + a.p90 + '  max ' + a.max)
  console.log('  their range (m)    min ' + f1(r.min) + '  median ' + f1(r.p50) + '  p90 ' + f1(r.p90))
  console.log('  escort share       ' + (stats(escortShare).mean * 100).toFixed(0) + '%')
  console.log('  silent samples     ' + audible.filter((x) => x === 0).length + ' / ' + audible.length)
}

// --- can you actually close on things? ---------------------------------------
{
  const content = load()
  const g = content.game
  startPatrol(content)
  const closest = []
  let best = Infinity
  run(content, 360, (t) => {
    if (g.phase() !== 'play') return
    const list = g.contactList().filter((c) => !c.escort)
    if (list.length) {
      g.setRudder(list[0].bearing > 3 ? 1 : (list[0].bearing < -3 ? -1 : 0))
      g.nudgeThrottle(1, 1 / 60)
      best = Math.min(best, list[0].range)
    }
    if (Math.round(t * 60) % 60) return
    if (list.length) closest.push(list[0].range)
  })
  const c = stats(closest)
  console.log('\nthe intercept - range to the nearest merchant while chasing')
  console.log('  median ' + f1(c.p50) + ' m,  best of the patrol ' + f1(best) + ' m')
  console.log('  (torpedo reaches ' +
    Math.round(load().constants.TORPEDO_SPEED * load().constants.TORPEDO_LIFE) + ' m)')
}

// --- is the lead audible? -----------------------------------------------------
{
  const content = load()
  const g = content.game
  const leads = [], flights = []
  // Split by ASPECT. Chasing a ship from astern it is running almost straight
  // down your line of sight and needs barely any lead; catching one on the beam
  // it is crossing and needs a lot. That is correct geometry, and it is the
  // tactical choice the movement rebuild introduced: the easy shot is the one
  // you had to work hardest to get into position for.
  const sternLeads = [], beamLeads = []
  startPatrol(content)
  run(content, 360, (t) => {
    if (g.phase() !== 'play') return
    const list = g.contactList().filter((c) => !c.escort)
    if (list.length) {
      g.setRudder(list[0].bearing > 3 ? 1 : (list[0].bearing < -3 ? -1 : 0))
      g.nudgeThrottle(1, 1 / 60)
    }
    if (Math.round(t * 60) % 30) return
    for (const c of list) {
      if (c.range > content.constants.CONTACT_RANGE) continue
      g.state.periscope = content.constants.clamp(c.bearing, -45, 45)
      const sol = g.aimedContact()
      if (!sol || sol.escort || sol.id !== c.id) continue
      const lead = Math.abs(content.constants.wrapDeg(sol.leadBearing - sol.bearing))
      leads.push(lead)
      flights.push(sol.flight)
      // A small lead means the target is running down the sight line (a stern
      // chase); a large one means it is crossing.
      if (lead < 3) sternLeads.push(lead)
      else beamLeads.push(lead)
    }
  })
  const l = stats(leads), fl = stats(flights)
  console.log('\nthe lead - how far ahead of the target you must aim')
  console.log('  lead angle (deg)   min ' + f1(l.min) + '  median ' + f1(l.p50) +
    '  p90 ' + f1(l.p90) + '  max ' + f1(l.max))
  console.log('  torpedo run (s)    min ' + f1(fl.min) + '  median ' + f1(fl.p50) + '  max ' + f1(fl.max))
  const tooSmall = leads.length ? leads.filter((x) => x < 2).length / leads.length : 0
  console.log('  leads under 2 deg  ' + (tooSmall * 100).toFixed(0) +
    '%  (stern chases - the target is running down your sight line)')
  const b = stats(beamLeads)
  console.log('  crossing shots     ' + (beamLeads.length / Math.max(1, leads.length) * 100).toFixed(0) +
    '% of engagements, median lead ' + f1(b.p50) + ' deg  <- where the skill lives')
}

// --- what does a patrol score? -----------------------------------------------
// Four ways of driving. `hunter` runs the intercept hard; `stalker` creeps
// under the noise threshold; `pinger` spams active sonar; `blind` never leads
// its shots.
function patrol(style) {
  const content = load()
  const g = content.game
  const k = content.constants
  startPatrol(content)

  // A launch puts the boat into evasion for a fixed window: down a rung and
  // hold, because the fish is set for the level it was fired at. Once the
  // window closes it comes back up, since periscope depth is the only place
  // the tubes work and the battery charges.
  let evade = 0
  let lastPing = -99
  content.events.on('escort-fire', () => { evade = 10 })

  run(content, 360, (t, dt) => {
    if (g.phase() !== 'play') return
    const st = g.status()
    evade = Math.max(0, evade - dt)

    if (evade > 0) {
      if (st.depthTarget < 200 && !st.changingDepth) g.stepDepth(1)
    } else if (st.depthTarget > 0 && !st.changingDepth && !g.isHunted()) {
      g.stepDepth(-1)
    }

    if (style === 'pinger') g.ping()
    else if (style !== 'blind' && g.state.elapsed - lastPing > 25) {
      if (g.ping()) lastPing = g.state.elapsed
    }

    // Steer at the nearest merchant - but sheer off rather than driving the
    // boat into it at flank speed, which is a way to die that says nothing
    // about the balance of the hunt.
    const list = g.contactList().filter((c) => !c.escort)
    const target = list[0]
    const nearest = g.contactList()[0]
    if (nearest && nearest.range < 200 && st.atPeriscope) {
      g.setRudder(nearest.bearing > 0 ? -1 : 1)
      g.nudgeThrottle(-1, 1 / 60)
    } else if (target) {
      g.setRudder(target.bearing > 3 ? 1 : (target.bearing < -3 ? -1 : 0))
      // The stalker holds the throttle under the noise break-even point;
      // everyone else runs flat out.
      const want = style === 'stalker' ? 0.6 : 1
      g.nudgeThrottle(st.throttle < want ? 1 : -1, 1 / 60)
    }

    // Shoot when there is a reachable solution.
    if (!target || target.range > k.CONTACT_RANGE || !st.atPeriscope) return
    g.state.periscope = k.clamp(target.bearing, -k.PERISCOPE_LIMIT, k.PERISCOPE_LIMIT)
    const sol = g.aimedContact()
    if (!sol || sol.escort || sol.id !== target.id) return
    if (!sol.leadReachable) return
    g.state.periscope = style === 'blind'
      ? k.clamp(sol.bearing, -k.PERISCOPE_LIMIT, k.PERISCOPE_LIMIT)
      : k.clamp(sol.leadBearing, -k.PERISCOPE_LIMIT, k.PERISCOPE_LIMIT)
    g.fire()
  })

  const st = g.status()
  return {
    tonnage: st.tonnage, sunk: st.sunk, fired: st.fired, hull: st.hull,
    reason: g.state.reason,
  }
}

console.log('\na patrol, four ways (5 runs each)')
for (const style of ['hunter', 'stalker', 'pinger', 'blind']) {
  const runs = []
  for (let i = 0; i < 8; i++) runs.push(patrol(style))
  const t = stats(runs.map((r) => r.tonnage))
  const s = stats(runs.map((r) => r.sunk))
  const h = stats(runs.map((r) => r.hull))
  const acc = runs.map((r) => (r.fired ? r.sunk / r.fired : 0))
  const died = runs.filter((r) => r.reason === 'sunk').length
  console.log('  ' + style.padEnd(8) +
    ' tonnage ' + String(Math.round(t.mean)).padStart(6) +
    '   sunk ' + s.mean.toFixed(1).padStart(4) +
    '   hits/shots ' + (stats(acc).mean * 100).toFixed(0).padStart(3) + '%' +
    '   hull left ' + String(Math.round(h.mean)).padStart(3) +
    '   killed ' + died + '/8')
}

console.log('')
