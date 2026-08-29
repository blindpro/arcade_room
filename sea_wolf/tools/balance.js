/**
 * Balance probe for SEA WOLF. tools/sim.js proves the mechanics work at all;
 * this asks whether they are worth playing — how much is in the arc, how far
 * away it is, how big the lead angle actually gets (if it is under a couple of
 * degrees you cannot hear it and the game has no skill in it), and what a
 * skilled patrol scores versus a reckless one.
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
    n: s.length,
    min: s[0],
    p50: s[Math.floor(s.length * 0.5)],
    p90: s[Math.floor(s.length * 0.9)],
    max: s[s.length - 1],
    mean: sum / s.length,
  }
}
const f1 = (x) => (x == null ? '-' : x.toFixed(1))

console.log('\nSEA WOLF balance probe\n')

// --- the shape of the arc ---------------------------------------------------
{
  const content = load()
  const counts = []
  const ranges = []
  const escortShare = []
  startPatrol(content)
  run(content, 300, (t) => {
    if (Math.round(t * 60) % 30) return // sample twice a second
    const list = content.game.contactList()
    counts.push(list.length)
    for (const c of list) ranges.push(c.range)
    if (list.length) escortShare.push(list.filter((c) => c.escort).length / list.length)
  })
  const c = stats(counts)
  const r = stats(ranges)
  console.log('the arc, sampled across a full 5-minute patrol')
  console.log('  contacts in view   min ' + c.min + '  median ' + c.p50 + '  p90 ' + c.p90 + '  max ' + c.max)
  console.log('  contact range (m)  min ' + f1(r.min) + '  median ' + f1(r.p50) + '  p90 ' + f1(r.p90) + '  max ' + f1(r.max))
  console.log('  escort share       ' + (stats(escortShare).mean * 100).toFixed(0) + '%')
  console.log('  empty-arc samples  ' + counts.filter((x) => x === 0).length + ' / ' + counts.length)
}

// --- is the lead audible? ---------------------------------------------------
// The whole game rests on the difference between the target's bearing and the
// bearing you must fire at. Measure it.
{
  const content = load()
  const leads = []
  const flights = []
  startPatrol(content)
  run(content, 300, (t) => {
    if (Math.round(t * 60) % 30) return
    for (const c of content.game.contactList()) {
      if (c.escort) continue
      content.game.state.aim = c.bearing
      const sol = content.game.aimedContact()
      if (!sol) continue
      leads.push(Math.abs(sol.leadBearing - sol.bearing))
      flights.push(sol.flight)
    }
  })
  const l = stats(leads)
  const fl = stats(flights)
  console.log('\nthe lead — how far ahead of the target you must aim')
  console.log('  lead angle (deg)   min ' + f1(l.min) + '  median ' + f1(l.p50) + '  p90 ' + f1(l.p90) + '  max ' + f1(l.max))
  console.log('  torpedo run (s)    min ' + f1(fl.min) + '  median ' + f1(fl.p50) + '  max ' + f1(fl.max))
  const tooSmall = leads.filter((x) => x < 2).length / leads.length
  console.log('  leads under 2 deg  ' + (tooSmall * 100).toFixed(0) + '%  (these are the ones you cannot hear)')
}

// --- what does a patrol score? ----------------------------------------------
// Three players. The perfect one fires only on a computed lead and never
// pings; the pinger uses active sonar constantly; the reckless one does
// everything at once and stays shallow.
function patrol(style, seed) {
  const content = load()
  const g = content.game
  startPatrol(content)

  let lastCharge = false
  let lastPing = -99
  content.events.on('charge-splash', () => { lastCharge = true })

  run(content, 300, () => {
    if (g.phase() !== 'play') return

    if (style === 'pinger' || style === 'reckless') g.ping()
    // The realistic player: a ping every twenty seconds or so to refresh the
    // picture, then silence while the fish runs.
    if (style === 'scout' && g.state.elapsed - lastPing > 20) {
      if (g.ping()) lastPing = g.state.elapsed
    }

    // Dive when charges are in the water, come up when it is quiet.
    if (style !== 'reckless') {
      const st = g.status()
      if (lastCharge && st.depth === 'periscope') { g.setDepth('deep'); lastCharge = false }
      else if (!g.isHunted() && st.depth === 'deep') g.setDepth('periscope')
    }

    // Shoot the best available merchant on a proper lead.
    const list = g.contactList().filter((c) => !c.escort && c.range > 400 && c.range < 1500)
    if (!list.length) return
    const target = list.sort((a, b) => a.range - b.range)[0]
    g.state.aim = target.bearing
    const sol = g.aimedContact()
    if (!sol || sol.escort) return
    g.state.aim = style === 'reckless' ? sol.bearing : sol.leadBearing
    g.fire()
  })

  const st = g.status()
  return {
    tonnage: st.tonnage,
    sunk: st.sunk,
    fired: st.fired,
    hull: st.hull,
    phase: g.phase(),
    reason: g.state.reason,
  }
}

console.log('\na patrol, four ways (5 runs each)')
console.log('  NOTE: these bots read exact ranges out of the sim without pinging, which a')
console.log('  real player cannot. Read the table for how the STYLES compare, not for')
console.log('  what a human would score - the tonnage is an upper bound.')
for (const style of ['sniper', 'scout', 'pinger', 'reckless']) {
  const runs = []
  for (let i = 0; i < 5; i++) runs.push(patrol(style, i))
  const t = stats(runs.map((r) => r.tonnage))
  const s = stats(runs.map((r) => r.sunk))
  const h = stats(runs.map((r) => r.hull))
  const acc = runs.map((r) => (r.fired ? r.sunk / r.fired : 0))
  const died = runs.filter((r) => r.reason === 'sunk').length
  console.log('  ' + style.padEnd(9) +
    ' tonnage ' + String(Math.round(t.mean)).padStart(6) +
    '   sunk ' + s.mean.toFixed(1).padStart(4) +
    '   hits/shots ' + (stats(acc).mean * 100).toFixed(0).padStart(3) + '%' +
    '   hull left ' + String(Math.round(h.mean)).padStart(3) +
    '   killed ' + died + '/5')
}

console.log('')
