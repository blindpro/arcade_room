// Headless match simulator and rules check.
//
// content/{constants,combat,characters,game,ai}.js touch nothing but each other
// — no DOM, no Web Audio, no syngen — which is the whole reason the split
// exists. So the rules can be interrogated directly and a full ladder can be
// played out at a fixed timestep, in less time than one real round takes.
//
// Two things are checked, and they are checked differently on purpose:
//
//   THE TRIANGLE is asserted against combat.resolve() directly, with fighters
//   posed by hand. It is the one part of the game that must be exactly true
//   rather than true on average — "a sweep goes under a block" is not a
//   tendency — and running it through the AI would only tell us what the AI
//   happens to throw.
//
//   THE LADDER is played out for every fighter against several scripted player
//   styles. That is a liveness check, not a balance one: it catches a round
//   that cannot end, a stage that cannot be cleared, and a special that throws.
//
// Run with `npm run sim`.
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const SRC = path.join(__dirname, '..', 'src', 'js', 'content')
const MODULES = ['constants.js', 'events.js', 'combat.js', 'characters.js', 'ai.js', 'game.js']

function load() {
  const sandbox = {content: {}, console, Math, Date, JSON}
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  for (const m of MODULES) {
    vm.runInContext(fs.readFileSync(path.join(SRC, m), 'utf8'), sandbox, {filename: m})
  }
  return sandbox.content
}

const STEP = 1 / 60
let failures = 0

function check(label, actual, expected) {
  const ok = actual === expected
  if (!ok) failures++
  console.log(`   ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} ${actual}${ok ? '' : '  (expected ' + expected + ')'}`)
}

// ---------------------------------------------------------------------------
// the triangle, asserted against the rules themselves
// ---------------------------------------------------------------------------

function poseFighter(content, id, over) {
  return Object.assign({
    side: 'foe',
    character: content.characters.get(id),
    x: 0, y: 0, blocking: false, down: 0,
  }, over)
}

function triangle(content) {
  const K = content.constants
  const C = content.combat
  const atk = poseFighter(content, 'sable', {side: 'player', x: 0})

  const standing = () => poseFighter(content, 'sable', {x: 0.8})
  const blocking = () => poseFighter(content, 'sable', {x: 0.8, blocking: true})
  const airborne = () => poseFighter(content, 'sable', {x: 0.8, y: K.JUMP_HEIGHT})
  const airBlock = () => poseFighter(content, 'sable', {x: 0.8, y: K.JUMP_HEIGHT, blocking: true})

  console.log('=== the defensive triangle (combat.resolve, fighters posed by hand) ===')

  // High attacks: a block answers them, a jump does not.
  for (const id of ['highPunch', 'highKick']) {
    const a = C.get(id)
    check(`${id} vs standing`, C.resolve(a, atk, standing()).outcome, 'hit')
    check(`${id} vs blocking  -> stopped`, C.resolve(a, atk, blocking()).outcome, 'block')
    check(`${id} vs airborne  -> still connects`, C.resolve(a, atk, airborne()).outcome, 'hit')
    check(`${id} vs airborne  -> block does not save them`,
      C.resolve(a, atk, airBlock()).outcome, 'hit')
  }

  // Low attacks: a jump answers them, a block does not.
  for (const id of ['lowPunch', 'lowKick']) {
    const a = C.get(id)
    check(`${id} vs standing`, C.resolve(a, atk, standing()).outcome, 'hit')
    check(`${id} vs blocking  -> goes UNDER the guard`,
      C.resolve(a, atk, blocking()).outcome, 'hit')
    check(`${id} vs airborne  -> passes underneath`,
      C.resolve(a, atk, airborne()).outcome, 'jumped')
  }

  // Catching someone in the air has to actually pay, or the anti-air read is
  // not worth making.
  const air = C.resolve(C.get('highKick'), atk, airborne())
  const ground = C.resolve(C.get('highKick'), atk, standing())
  check('a high kick pays more in the air', air.damage > ground.damage, true)
  check('a high kick in the air knocks down', !!air.knockdown, true)

  // A block still costs you something, or blocking would be free.
  const blk = C.resolve(C.get('highKick'), atk, blocking())
  check('a blocked hit still chips', blk.damage > 0, true)
  check('a blocked hit chips much less than it hits', blk.damage < ground.damage * 0.3, true)

  // Range is real: step back out of a kick and nothing happens.
  const far = poseFighter(content, 'sable', {x: 3.0})
  check('a kick at three units whiffs', C.resolve(C.get('highKick'), atk, far).outcome, 'whiff')

  // A kick must out-range a punch, or the two columns are the same button.
  check('kicks out-range punches',
    C.get('highKick').reach > C.get('highPunch').reach, true)
  // And a kick must be slower, or there is no reason ever to punch.
  check('kicks are slower to start than punches',
    C.get('highKick').startup > C.get('highPunch').startup, true)
  // The sweep must be the reactable one, since jumping it is the only answer.
  check('the sweep is the slowest attack',
    C.get('lowKick').startup >= Math.max(...C.ORDER.map((i) => C.get(i).startup)), true)
}

// ---------------------------------------------------------------------------
// the ladder, played out
// ---------------------------------------------------------------------------

// A scripted player. Deliberately crude — these are liveness probes, not good
// play. Each one closes to its own working range and then commits.
function player(style) {
  let cool = 0
  return function intent(st, delta) {
    const out = {left: false, right: false, jump: false, block: false, attack: null}
    if (!st || st.dist == null) return out
    cool -= delta

    const range = style === 'poker' ? 1.0 : 1.5
    // No dead band: either walk in, or do the thing. A gap between "close" and
    // "attack" leaves the player standing at arm's length doing nothing, which
    // is a bug in the probe rather than in the game.
    if (st.dist > range) {
      out[st.dx > 0 ? 'right' : 'left'] = true
      return out
    }

    switch (style) {
      case 'blocker': out.block = true; break
      case 'jumper': out.jump = true; break
      case 'sweeper': if (cool <= 0) { out.attack = 'lowKick'; cool = 0.8 } break
      case 'poker': if (cool <= 0) { out.attack = 'highPunch'; cool = 0.35 } break
      case 'mixer':
        if (cool <= 0) {
          const pick = ['highPunch', 'highKick', 'lowPunch', 'lowKick']
          out.attack = pick[Math.floor(Math.random() * pick.length)]
          cool = 0.5
        }
        break
      // Walks in and throws the special's motion over and over.
      case 'special': {
        if (cool <= 0) { out.attack = st.specialReady ? null : 'highPunch'; cool = 0.3 }
        const phase = Math.floor(Date.now() / 90) % 4
        if (phase === 0) out.left = true
        if (phase === 2) out.right = true
        if (phase === 3 && st.specialReady) out.attack = 'highPunch'
        break
      }
      default: break
    }
    return out
  }
}

function run(content, fighterId, style) {
  const intent = player(style)
  content.events.clear()

  let dealt = 0, taken = 0
  const seen = {hit: 0, blocked: 0, whiff: 0, jumped: 0, ko: 0, stages: 0, specials: 0}
  content.events.on('hit', (e) => {
    seen.hit++
    if (e.victim === 'player') taken += e.damage; else dealt += e.damage
  })
  content.events.on('blocked', () => seen.blocked++)
  content.events.on('whiff', () => seen.whiff++)
  content.events.on('jumped-over', () => seen.jumped++)
  content.events.on('ko', () => seen.ko++)
  content.events.on('stage-clear', () => seen.stages++)
  content.events.on('special-fire', () => seen.specials++)

  content.game.reset(fighterId)

  const limit = 60 * 60 * 15
  let frames = 0
  let err = null
  try {
    while (frames < limit) {
      const st = content.game.status()
      if (st.phase === 'gameover') break
      content.game.setInput(intent(st, STEP))
      content.game.update(STEP)
      frames++
    }
  } catch (e) {
    err = e
  }

  const st = content.game.status()
  return {
    finished: st.phase === 'gameover',
    err,
    stage: st.stage,
    score: st.score,
    seconds: Math.round(frames * STEP),
    dealt: Math.round(dealt),
    taken: Math.round(taken),
    seen,
  }
}

function ladder(content) {
  console.log('\n=== ladder liveness (every fighter, every probe, must terminate) ===')
  const styles = ['blocker', 'jumper', 'sweeper', 'poker', 'mixer', 'special']
  for (const f of content.characters.ids()) {
    for (const s of styles) {
      const r = run(content, f, s)
      if (r.err) {
        failures++
        console.log(`   FAIL ${f}/${s} threw: ${r.err && r.err.message}`)
        continue
      }
      if (!r.finished) {
        failures++
        console.log(`   FAIL ${f}/${s} did not reach a result in 15 minutes`)
        continue
      }
      console.log(
        `   ok   ${f.padEnd(6)} ${s.padEnd(8)} ` +
        `reached stage ${r.stage}  ${String(r.seconds).padStart(4)}s  ` +
        `score ${String(r.score).padStart(6)}  dealt ${String(r.dealt).padStart(4)} ` +
        `took ${String(r.taken).padStart(4)}  ` +
        `KOs ${r.seen.ko} specials ${r.seen.specials}`)
    }
  }

  // A competent probe has to be able to get somewhere, or the AI is unbeatable
  // and no balance number below it means anything.
  console.log('\n=== can the ladder actually be climbed? ===')
  let best = 0
  for (const f of content.characters.ids()) {
    for (let i = 0; i < 3; i++) {
      const r = run(content, f, 'mixer')
      best = Math.max(best, r.stage)
    }
  }
  check('some run clears at least the first stage', best >= 2, true)
}

function main() {
  const content = load()
  triangle(content)
  ladder(content)
  console.log(failures ? `\nFAILED: ${failures} check(s).` : '\nOK: rules hold and every ladder terminates.')
  process.exit(failures ? 1 : 0)
}

main()
