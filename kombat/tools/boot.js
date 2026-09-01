// Headless bundle-boot harness for KOMBAT. Loads the REAL built bundle into a
// jsdom document (the real index.html) against a fake Web Audio API, boots it
// like a browser would, then drives the screen FSM: menu -> learn the sounds ->
// back -> Fight -> character select -> a match played through the actual key
// handlers (walk, jump, block, all four attacks, a special motion, the F-key
// readouts) -> game over -> save -> continue.
// Any error a screen swallows into console.error fails the run.
//
// This covers what tools/sim.js cannot see. sim.js runs the rules in isolation;
// everything in content/audio.js and app/screen/game.js only ever executes in a
// browser, so every synthesis call and every event wiring is exercised here for
// the first time. In particular it covers the spatial layer — every positional
// sound builds its own two-channel panner, which the fake Web Audio below has
// to satisfy, and one check reads the resulting graph back to confirm the pan
// is real and is measured against the player. Both show up here rather than in
// the player's ears.
//
// Requires the --debug bundle (no IIFE wrap) so app/content/engine are reachable.
//   npx gulp build --debug && node tools/boot.js
'use strict'
const fs = require('fs')
const path = require('path')
const { JSDOM, VirtualConsole } = require('jsdom')

// ---- fake Web Audio ----
// Scheduled values are kept on `.value` so the spatial check below can read
// back what a cue actually asked its nodes to do. Nothing in the game reads a
// param it scheduled, so this only ever adds information.
function makeParam() {
  const p = { value: 0 }
  for (const m of ['cancelScheduledValues', 'cancelAndHoldAtTime', 'setValueCurveAtTime',
    'connect', 'disconnect']) p[m] = () => p
  for (const m of ['setValueAtTime', 'linearRampToValueAtTime',
    'exponentialRampToValueAtTime', 'setTargetAtTime']) {
    p[m] = (v) => { p.value = v; return p }
  }
  return p
}
const PARAMS = new Set(['gain', 'frequency', 'Q', 'detune', 'pan', 'delayTime', 'playbackRate',
  'threshold', 'knee', 'ratio', 'attack', 'release', 'reduction'])
// Every node ever created, in creation order, so a check can look at the shape
// of the graph a cue built rather than only at whether it threw.
const NODES = []
function makeNode(type) {
  const store = {__type: type}, params = {}
  const node = new Proxy(store, {
    get(t, prop) {
      if (prop in t) return t[prop]
      if (typeof prop === 'symbol') return undefined
      if (PARAMS.has(prop)) return params[prop] || (params[prop] = makeParam())
      return (...a) => (prop === 'connect' ? (a[0] || store) : store)
    },
    set(t, prop, v) { t[prop] = v; return true },
  })
  NODES.push({type, node, params})
  return node
}
class FakeAudioBuffer {
  constructor(channels, length, sampleRate) {
    this.numberOfChannels = channels; this.length = length | 0; this.sampleRate = sampleRate
    this.duration = (length | 0) / sampleRate
    this._c = []
    for (let i = 0; i < Math.max(1, channels); i++) this._c.push(new Float32Array(Math.max(1, length | 0)))
  }
  getChannelData(i) { return this._c[i] || this._c[0] }
}
// The audio clock has to move. Everything that decides how often a cue may
// repeat — the corner thud, the range gate — reads engine.time(), which is
// context.currentTime; pinned at zero those guards can never elapse and the
// harness cannot see the cues at all. It runs on wall time, plus an offset a
// check can push forward when it needs to skip a cooldown deterministically.
const CLOCK_T0 = Date.now()
let CLOCK_OFFSET = 0
function advanceClock(seconds) { CLOCK_OFFSET += seconds }
function makeContext() {
  const base = {
    sampleRate: 44100, state: 'running',
    get currentTime() { return CLOCK_OFFSET + (Date.now() - CLOCK_T0) / 1000 },
    destination: makeNode('destination'), listener: makeNode('listener'),
    createBuffer: (c, l) => new FakeAudioBuffer(c, l, 44100),
    resume: () => Promise.resolve(), suspend: () => Promise.resolve(), close: () => Promise.resolve(),
    addEventListener() {},
  }
  return new Proxy(base, {
    get(t, p) {
      if (p in t) return t[p]
      if (typeof p === 'string' && p.startsWith('create')) return () => makeNode(p)
      return undefined
    },
    set(t, p, v) { t[p] = v; return true },
  })
}

// ---- jsdom ----
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8')
  .replace(/<script[^>]*><\/script>/g, '') // we eval the bundle ourselves, after stubbing audio
const errors = []
const vc = new VirtualConsole()
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e && e.message || e)))
const dom = new JSDOM(html, {
  runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc,
})
const { window } = dom

window.AudioContext = function () { return makeContext() }
window.OfflineAudioContext = window.AudioContext
window.AudioBuffer = FakeAudioBuffer
window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} })
if (!window.navigator.getGamepads) window.navigator.getGamepads = () => []
window.console.error = (...a) => errors.push(a.map(String).join(' '))
window.console.warn = () => {}

const bundle = fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts.min.js'), 'utf8')
window.eval(bundle + ';window.__engine=engine;window.__app=app;window.__content=content;')
window.document.dispatchEvent(new window.Event('DOMContentLoaded'))

let failures = 0
function check(name, cond, detail) {
  const ok = !!cond
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  - ' + detail : ''))
  if (!ok) failures++
}
function clean(label) {
  if (!errors.length) return true
  console.log('      errors during ' + label + ': ' + errors.slice(0, 4).join(' | '))
  return false
}

;(async () => {
  const app = window.__app, engine = window.__engine, content = window.__content
  await new Promise((r) => setTimeout(r, 200))

  check('exposes app/content/engine', app && content && engine)
  if (!app) { console.log('\nBUNDLE DID NOT BOOT'); process.exit(1) }
  check('boots to the menu', app.screenManager.is('menu'))

  // Everything below drives screen.onFrame() by hand so the game logic can be
  // stepped deterministically. That means the REAL requestAnimationFrame loop
  // has to be switched off, or the two drivers double-step each other. It is
  // switched back on for one dedicated check further down — see "the real
  // loop" — because a manual driver is completely blind to whether the app is
  // receiving frames at all.
  check('the loop is running after boot', engine.loop.isRunning())
  engine.loop.stop()

  const doc = window.document
  const screen = () => app.screenManager.current()
  function click(sel) {
    const el = doc.querySelector(sel)
    if (!el) throw new Error('no element: ' + sel)
    el.click()
    return el
  }
  function key(code) {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { code, key: code, bubbles: true }))
  }
  function keyUp(code) {
    window.dispatchEvent(new window.KeyboardEvent('keyup', { code, key: code, bubbles: true }))
  }
  // The input assertions need a LIVE match to run in, and they take longer than
  // a match now lasts: the opponent stands inside its own range these days, so
  // both fighters land far more, and the harness was reaching its later probes
  // after the match had already been decided — where `canAct` is false forever
  // and every readout is empty. That failed as "never got a free frame", which
  // is a true statement about the wrong thing. While `keepAlive` is set, both
  // fighters are topped back up each frame, so the fight cannot end underneath
  // a check that is testing the keyboard.
  // `calm` goes further: it stands the opponent off at the far wall and stops it
  // acting. Every check that uses it is asking "does this key reach the game",
  // and the answer must not depend on whether a kick happened to land during
  // the window it was measured in. The opponent now holds a distance inside its
  // own range and attacks about once a second, so an undisturbed half second is
  // no longer something a harness can simply wait for. What is lost is nothing
  // these checks were ever testing; the match under pressure is still played
  // out in full at the end of the run.
  let keepAlive = false
  let calm = false
  function frames(n) {
    for (let i = 0; i < n; i++) {
      const st = content.game.state
      if (keepAlive) {
        for (const f of [st.player, st.foe]) if (f) f.health = f.maxHealth
        st.clock = Math.max(st.clock, 20)
      }
      if (calm && st.player && st.foe) {
        st.foe.x = st.player.x >= 0 ? -content.constants.ARENA_HALF : content.constants.ARENA_HALF
        st.foe.action = null
        st.foe.stun = 0
        st.foe.down = 0
      }
      screen().onFrame({ delta: 1 / 60 })
    }
  }
  // Attacks and the jump are EDGES, so a held key buys exactly one move. Tapping
  // means actually releasing between presses, the same as a player does.
  function tap(code, after) {
    key(code); frames(1); keyUp(code); frames(after == null ? 20 : after)
  }
  // These checks run inside a LIVE match, so the opponent is hitting back the
  // whole time. Hitstun, a knockdown and your own recovery frames all swallow
  // input by design, which would make an input test fail for the right reason
  // at the wrong moment. So every input assertion waits for a frame on which
  // the player can actually act, and reports it if one never comes.
  function whenFree(limit) {
    for (let i = 0; i < (limit || 600); i++) {
      if (content.game.status().canAct) return true
      frames(1)
    }
    return false
  }
  // Some checks need a whole WINDOW of frames in which nothing happened to the
  // player, not just a free first frame — measuring walk speed is meaningless
  // if a kick landed halfway through it. `probe` runs until it gets a window it
  // is happy with, and reports the last attempt if it never does.
  // Note on the ceilings below: they are generous on purpose. A quiet window in
  // a live fight is a probabilistic thing, and a harness that fails once in
  // thirty runs is worse than no harness, because the failure teaches you to
  // ignore it. If one of these ever exhausts its retries it means the player
  // genuinely cannot get a turn, which is a real bug worth failing on.
  function probe(tries, fn) {
    let last = {ok: false, detail: 'no clean window'}
    for (let i = 0; i < tries; i++) {
      if (!whenFree()) { frames(30); continue }
      last = fn() || last
      if (last.ok) return last
      frames(20)
    }
    return last
  }
  // True if the player was left alone for the whole of the last window.
  function undisturbed(fn) {
    let hit = false
    const off = (e) => { if (e.victim === 'player') hit = true }
    content.events.on('hit', off)
    content.events.on('blocked', off)
    const value = fn()
    content.events.off('hit', off)
    content.events.off('blocked', off)
    return {value, hit}
  }

  // ---- every cue in Learn the Sounds actually synthesises -------------------
  click('.a-menu button[data-action="learn"]')
  check('Learn the sounds opens', app.screenManager.is('learn'))
  const cues = [...doc.querySelectorAll('.a-learn button[data-sound]')]
  check('learn screen lists every cue', cues.length >= 25, cues.length + ' cues')
  errors.length = 0
  for (const b of cues) b.click()
  await new Promise((r) => setTimeout(r, 600)) // let deferred cues (the ramps) fire
  check('every learn cue plays without error', clean('learn cues'))
  click('.a-learn button[data-action="back"]')
  check('returns to menu from learn', app.screenManager.is('menu'))

  // ---- the audio test screen ------------------------------------------------
  errors.length = 0
  for (const dir of ['l', 'c', 'r', 'high', 'low', 'sweep', 'ladder']) {
    content.audio.testDirection(dir)
  }
  await new Promise((r) => setTimeout(r, 600))
  check('every audio-test direction plays clean', clean('audio test'))
  content.audio.silenceAll()

  // ---- character select -----------------------------------------------------
  errors.length = 0
  click('.a-menu button[data-action="start"]')
  check('Fight opens character select', app.screenManager.is('select'))
  const picks = [...doc.querySelectorAll('.a-select button[data-fighter]')]
  check('select lists the whole roster',
    picks.length === content.characters.ROSTER.length, picks.length + ' fighters')
  check('each fighter button carries a spoken stat line',
    picks.every((b) => (b.getAttribute('aria-label') || '').length > 40))
  // Walking the list auditions each tone; that path builds and tears down a
  // presence voice every move, which is where a leak would show.
  for (let i = 0; i < picks.length + 2; i++) frames(3)
  await new Promise((r) => setTimeout(r, 200))
  check('auditioning the roster runs clean', clean('select'))

  // ---- into a match ---------------------------------------------------------
  errors.length = 0
  picks[0].click()
  check('picking a fighter enters the game', app.screenManager.is('game'))
  check('the chosen fighter is the one that loaded',
    content.game.status().playerId === picks[0].dataset.fighter,
    content.game.status().playerId)
  check('the match begins in the round intro', content.game.phase() === 'ready',
    content.game.phase())

  // ---- the real loop --------------------------------------------------------
  // app.controls.update() and several syngen subsystems ride the SAME
  // engine.loop 'frame' bus the screen does, and a throw in any of them kills
  // the requestAnimationFrame chain for the entire app. The symptom is a game
  // that boots, plays its round bell, and then sits there: no countdown, no
  // input, no opponent. A harness that calls onFrame() by hand cannot see that
  // at all, so the loop gets driven for real exactly once, here, with no manual
  // stepping, and the match has to move on its own.
  errors.length = 0
  {
    const before = content.game.status()
    engine.loop.start()
    await new Promise((r) => setTimeout(r, 2600)) // past READY_TIME
    const after = content.game.status()
    engine.loop.stop()
    check('the real rAF loop delivers frames to the game',
      after.phase === 'fight', 'phase ' + before.phase + ' -> ' + after.phase)
    check('the opponent moves under the real loop',
      Math.abs(after.foeX - before.foeX) > 0.05,
      'foe ' + before.foeX.toFixed(2) + ' -> ' + after.foeX.toFixed(2))
    check('nothing on the frame bus throws', clean('real loop'))
  }

  frames(200)
  check('the intro reaches the fight', content.game.phase() === 'fight', content.game.phase())
  check('round 1 of stage 1 is live',
    content.game.status().round === 1 && content.game.status().stage === 1)
  check('the round bell and the fight call ran clean', clean('round start'))

  // ---- movement: A and D walk, and only those ------------------------------
  // Everything from here to the end of the special check is about whether a key
  // reaches the game, so the match is held open and the opponent stood off.
  keepAlive = true
  calm = true
  errors.length = 0
  // Walking is measured over a window in which nothing hit the player and the
  // wall was not in the way — getting knocked out of a walk, or pushed into the
  // corner, would read as "the key did nothing".
  for (const [code, sign, label] of [['KeyD', 1, 'D walks right'], ['KeyA', -1, 'A walks left']]) {
    const r = probe(30, () => {
      const x0 = content.game.status().playerX
      const {value: x1, hit} = undisturbed(() => {
        key(code); frames(30); keyUp(code)
        return content.game.status().playerX
      })
      const moved = (x1 - x0) * sign
      if (hit) return {ok: false, detail: 'interrupted'}
      if (Math.abs(x1) >= content.constants.ARENA_HALF - 0.05) {
        return {ok: false, detail: 'hit the wall'}
      }
      return {ok: moved > 0.2, detail: (moved * sign).toFixed(2) + ' units'}
    })
    check('holding ' + label, r.ok, r.detail)
  }

  // ---- the jump: W, and it has to be an edge -------------------------------
  {
    let peak = 0
    key('KeyW')
    for (let i = 0; i < 40; i++) { frames(1); peak = Math.max(peak, content.game.status().playerY) }
    keyUp('KeyW')
    check('W leaves the ground', peak > content.constants.AIRBORNE_AT, 'peak ' + peak.toFixed(2))
    frames(60)
    check('and comes back down', content.game.status().playerY < 0.01,
      content.game.status().playerY.toFixed(3))
  }
  check('jumping ran clean', clean('jump'))

  // ---- block: S is a held state, not a move --------------------------------
  errors.length = 0
  {
    const r = probe(30, () => {
      key('KeyS'); frames(2)
      const up = content.game.status().stance
      keyUp('KeyS'); frames(2)
      const down = content.game.status().stance
      return {ok: up === 'block' && down !== 'block', detail: up + ' -> ' + down, up, down}
    })
    check('holding S raises a block and releasing drops it', r.ok, r.detail)
  }

  // ---- the four attack buttons ---------------------------------------------
  // Each one has to reach content, produce a tell, and resolve to something.
  for (const [code, id] of [['KeyU', 'highPunch'], ['KeyI', 'highKick'],
    ['KeyJ', 'lowPunch'], ['KeyK', 'lowKick']]) {
    errors.length = 0
    let tell = null
    const off = (e) => { if (e.side === 'player') tell = e }
    content.events.on('tell', off)
    // Let the motion buffer age out first — it is shared with the special
    // reader, and a stale direction pair would turn a basic attack into a
    // special. Only THEN wait for a free frame, so nothing can happen between
    // the check and the press.
    frames(40)
    const free = whenFree()
    if (free) tap(code, 40)
    content.events.off('tell', off)
    check(code + ' throws ' + id,
      free && tell && tell.level === content.combat.get(id).level &&
      tell.limb === content.combat.get(id).limb,
      free ? (tell ? tell.level + ' ' + tell.limb : 'no tell') : 'never got a free frame')
    check(code + ' resolves clean', clean(code))
  }

  // ---- holding an attack key must NOT repeat -------------------------------
  {
    let tells = 0
    const off = (e) => { if (e.side === 'player') tells++ }
    const free = whenFree()
    content.events.on('tell', off)
    key('KeyU')
    frames(90)
    keyUp('KeyU')
    content.events.off('tell', off)
    // Exactly one: the press is an edge, and the 89 frames of holding after it
    // buy nothing. More than one would mean the key auto-repeats.
    check('HOLDING an attack throws it once (attacks are edges)',
      free && tells === 1, free ? tells + ' tells' : 'never got a free frame')
  }

  // ---- a special, entered the way a player enters it -----------------------
  // Vex is forward, forward, then J. Walk the motion out with real key edges.
  errors.length = 0
  {
    let fired = null
    const off = (e) => { if (e.side === 'player') fired = e }
    content.events.on('special-fire', off)
    // Work out which way is forward, then tap that direction twice and press
    // the special's button.
    const c = content.characters.get(content.game.status().playerId)
    const btn = { highPunch: 'KeyU', highKick: 'KeyI', lowPunch: 'KeyJ', lowKick: 'KeyK' }[c.special.button]
    // The motion has to land inside MOTION_WINDOW and the special has to be off
    // cooldown, so try a few times rather than assuming the first attempt gets
    // a clean run at it.
    let free = false
    for (let attempt = 0; attempt < 80 && !fired; attempt++) {
      free = whenFree()
      if (!free) { frames(30); continue }
      const st = content.game.status()
      if (!st.specialReady) { frames(30); continue }
      const fwd = st.dx > 0 ? 'KeyD' : 'KeyA'
      const back = fwd === 'KeyD' ? 'KeyA' : 'KeyD'
      const dirFor = (d) => (d === 'forward' ? fwd : back)
      for (const d of c.special.motion) { key(dirFor(d)); frames(2); keyUp(dirFor(d)); frames(2) }
      tap(btn, 40)
    }
    content.events.off('special-fire', off)
    check('a motion input fires ' + c.id + "'s special",
      !!fired, fired ? fired.id : (free ? 'never fired' : 'never got a free frame'))
    check('the special ran clean', clean('special'))
  }
  // The readouts and the pause round trip need a live match, but not a quiet
  // one — from here the opponent fights again.
  calm = false

  // ---- every cue the screen can be asked to play ---------------------------
  // Fired directly, because a single match will not naturally produce all of
  // them and each one builds its own ear.
  errors.length = 0
  content.events.emit('tell', {side: 'foe', x: -2, level: 'low', limb: 'kick', startup: 0.28})
  content.events.emit('hit', {side: 'foe', victim: 'player', x: 0, level: 'low', limb: 'kick',
    damage: 12, airHit: false, knockdown: true, health: 40, healthFrac: 0.4})
  content.events.emit('hit', {side: 'player', victim: 'foe', x: 1.2, level: 'high', limb: 'kick',
    damage: 18, airHit: true, knockdown: true, health: 30, healthFrac: 0.3})
  content.events.emit('blocked', {side: 'foe', victim: 'player', x: 0.9, level: 'high', limb: 'punch', damage: 1})
  content.events.emit('whiff', {side: 'player', x: 0, level: 'high', limb: 'kick'})
  content.events.emit('jumped-over', {side: 'player', x: 0, level: 'low', limb: 'kick'})
  content.events.emit('jump', {side: 'foe', x: 2})
  content.events.emit('land', {side: 'foe', x: 2})
  content.events.emit('getup', {side: 'player', x: 0})
  content.events.emit('special-charge', {side: 'foe', x: -3, id: 'quake', level: 'low',
    charge: 0.52, fighter: 'rook'})
  content.events.emit('special-fire', {side: 'foe', x: -3, id: 'quake', level: 'low', fighter: 'rook'})
  content.events.emit('teleport', {side: 'foe', x: 1})
  content.events.emit('dash', {side: 'foe', x: 1})
  for (const x of [4, 3, 2, 1]) content.events.emit('projectile', {x, dist: x, incoming: true})
  content.events.emit('projectile-gone', {x: 0})
  await new Promise((r) => setTimeout(r, 400))
  check('every combat cue plays clean', clean('cues'))

  // ---- the pan, measured off the graph a cue actually builds ---------------
  // The sim checks constants.panOf() as arithmetic. This checks the thing that
  // arithmetic is supposed to cause: that a cue at an arena position wires up
  // two channels which differ, in the right direction, from the point of view
  // of wherever the LISTENER is. Panning that lives only in a formula is how
  // the last version sounded centred.
  //
  // Per channel the panner builds delay -> lowpass -> gain, left channel first,
  // so a channel's gain is the first gain node created after its delay.
  const panOfCue = (listenerX, x) => {
    const mark = NODES.length
    content.audio.setListener(listenerX)
    content.audio.jump(x)
    const made = NODES.slice(mark)
    const chan = (n) => {
      const at = made.indexOf(made.filter((m) => m.type === 'createDelay')[n])
      return {
        delay: made[at].params.delayTime.value,
        gain: made.slice(at + 1).find((m) => m.type === 'createGain').params.gain.value,
      }
    }
    return {count: made.filter((m) => m.type === 'createDelay').length, left: chan(0), right: chan(1)}
  }

  const right = panOfCue(0, 2)
  check('a cue builds one delay per channel', right.count === 2, right.count + ' delays')
  check('a source on your right is louder on the right',
    right.right.gain > right.left.gain,
    'L ' + right.left.gain.toFixed(3) + ' / R ' + right.right.gain.toFixed(3))
  check('and reaches the far ear later',
    right.left.delay > 0 && right.right.delay === 0,
    'L ' + (right.left.delay * 1000).toFixed(2) + 'ms / R ' + (right.right.delay * 1000).toFixed(2) + 'ms')

  const left = panOfCue(0, -2)
  check('a source on your left mirrors it exactly',
    Math.abs(left.left.gain - right.right.gain) < 1e-9 &&
    Math.abs(left.right.gain - right.left.gain) < 1e-9 &&
    left.right.delay === right.left.delay, true)

  // The one that matters: the listener is the PLAYER'S FIGHTER, so the same
  // arena position is a different sound depending on where the player stands.
  const onTop = panOfCue(2, 2)
  check('a source standing where the player stands is centred',
    Math.abs(onTop.left.gain - onTop.right.gain) < 1e-9 &&
    onTop.left.delay === 0 && onTop.right.delay === 0,
    'L ' + onTop.left.gain.toFixed(3) + ' / R ' + onTop.right.gain.toFixed(3))
  const behind = panOfCue(4, 2)
  check('and the same position pans left once the player has walked past it',
    behind.left.gain > behind.right.gain, true)
  content.audio.setListener(0)

  // Both fighters make footsteps. The opponent's are the pulse train whose rate
  // is the distance channel; yours only run while you are walking, and they are
  // the reason the centre of the image has a body in it.
  const stepsOverASecond = (playerWalking) => {
    const st = {playerX: 0, foeX: 2, dist: 2, foeY: 0, healthFrac: 1, phase: 'fight',
      foeStance: 'stand', stance: 'stand', playerWalking}
    const mark = NODES.length
    for (let i = 0; i < 60; i++) content.audio.frame(1 / 60, st)
    return NODES.slice(mark).filter((n) => n.type === 'createChannelMerger').length
  }
  const standing = stepsOverASecond(false)
  const walking = stepsOverASecond(true)
  check('standing still, only the opponent makes footsteps', standing > 0, standing + ' in a second')
  check('walking adds your own on top of theirs', walking > standing,
    walking + ' vs ' + standing)

  // ---- the range gate ------------------------------------------------------
  // "What reaches from here" is the thing a fighter has to know before pressing
  // anything, and it has THREE answers, not two: nothing, kicks, or everything.
  // The two fighters spend the round hovering within a hand's width of one of
  // those edges, so the gate is as much about not speaking as about speaking.
  // Both guards are checked, because a gate that chatters is one a player
  // learns to ignore and a gate that goes quiet is one that lies.
  const KICK = 1.8, PUNCH = 1.05
  const gate = (foeX) => {
    const mark = NODES.length
    const dist = Math.abs(foeX)
    content.audio.frame(1 / 60, {playerX: 0, foeX, dist, foeY: 0, healthFrac: 1,
      phase: 'fight', foeStance: 'stand', stance: 'stand', playerWalking: false,
      kickReach: KICK, punchReach: PUNCH,
      inKickRange: dist <= KICK, inPunchRange: dist <= PUNCH})
    // reachMark is the only thing in the game that builds these oscillators,
    // and each band has its own pair, so the graph says which band was called.
    const made = NODES.slice(mark).filter((n) => n.type === 'createOscillator' && n.params.frequency)
    const hz = made.map((n) => n.params.frequency.value)
    if (hz.includes(740)) return 'kick'
    if (hz.includes(1770)) return 'punch'
    return ''
  }
  content.audio.silenceAll()
  advanceClock(5)
  check('out of range, the gate says nothing', gate(2.5) === '')
  check('walking into kick range announces the kick band', gate(1.5) === 'kick')
  advanceClock(2)
  check('and it does not repeat itself while you stay there', gate(1.4) === '')
  check('drifting back across the edge does not lose the band', gate(1.9) === '',
    'hysteresis holds to 2.10')
  advanceClock(2)
  check('closing further announces the punch band', gate(0.9) === 'punch')
  advanceClock(2)
  check('and it stays quiet while you stay inside it', gate(1.0) === '')
  check('falling out of punch range is announced with the punch band falling',
    gate(1.5) === 'punch', 'the band you lost is the one that names the buttons')
  check('and it will not immediately change its mind', gate(0.9) === '', 'refractory')
  advanceClock(2)
  check('once it may speak again, closing re-announces it', gate(0.9) === 'punch')
  advanceClock(2)
  check('leaving the fight entirely reports the kick band falling', gate(3.0) === 'kick')
  content.audio.silenceAll()

  // ---- results cues ---------------------------------------------------------
  errors.length = 0
  content.events.emit('ko', {winner: 'player', perfect: true, round: 1,
    playerRounds: 1, foeRounds: 0, remainingHealth: 100})
  content.events.emit('timeout', {winner: 'foe', playerHealth: 20, foeHealth: 40,
    playerRounds: 1, foeRounds: 1})
  content.events.emit('stage-clear', {stage: 1, score: 5000, beat: 'rook', last: false})
  await new Promise((r) => setTimeout(r, 400))
  check('result cues play clean', clean('results'))

  // ---- the F-key readouts ---------------------------------------------------
  const polite = doc.querySelector('.a-app--announce')
  for (const code of ['F1', 'F2', 'F3']) {
    errors.length = 0
    if (polite) polite.textContent = ''
    key(code)
    frames(1)
    keyUp(code)
    await new Promise((r) => setTimeout(r, 120))
    check(code + ' announces without error', errors.length === 0, errors[0] || '')
    check(code + ' produced a readout', !polite || polite.textContent.length > 0,
      polite && JSON.stringify(polite.textContent.slice(0, 70)))
  }

  // ---- pause and resume -----------------------------------------------------
  errors.length = 0
  key('Escape'); frames(1); keyUp('Escape')
  check('Escape pauses', app.screenManager.is('pause'), app.screenManager.current().id)

  // ---- the move list, off the pause menu -----------------------------------
  click('.a-pause button[data-action="moves"]')
  check('the move list opens from pause', app.screenManager.is('moves'))
  const entries = [...doc.querySelectorAll('.a-moves button[data-entry]')]
  check('the move list covers the four attacks plus every fighter',
    entries.length === content.characters.ROSTER.length + 1, entries.length + ' entries')
  // Everything on the screen is generated from the data, so an unresolved i18n
  // key or a renamed field shows up as the key leaking into the text.
  const leaked = entries.filter((b) => /\{\w+\}|moves\.|note\.|attack\./.test(b.getAttribute('aria-label')))
  check('no unresolved placeholders in the move list', leaked.length === 0,
    leaked.length ? leaked[0].getAttribute('aria-label').slice(0, 80) : '')
  // Each fighter's motion input has to actually be spelled out, or the screen
  // does not answer the one question it exists for.
  for (const c of content.characters.ROSTER) {
    const row = entries.find((b) => b.dataset.entry === c.id)
    const text = row ? row.getAttribute('aria-label') : ''
    const btn = content.combat.get(c.special.button).key
    check('the list gives ' + c.id + "'s special and its input",
      !!row && text.includes(app.i18n.t('special.' + c.special.id)) && text.includes(btn))
  }
  check('the entry for the fighter in play is marked',
    entries.some((b) => (b.getAttribute('aria-label') || '').includes(app.i18n.t('moves.you'))))
  // Arrowing through auditions tones; make sure that path builds and tears down
  // cleanly rather than leaving a drone running behind the menu.
  for (let i = 0; i < entries.length + 3; i++) frames(3)
  entries[1].click()
  await new Promise((r) => setTimeout(r, 150))
  check('the move list runs clean', clean('moves'))
  click('.a-moves button[data-action="back"]')
  check('the move list returns to pause', app.screenManager.is('pause'))

  click('.a-pause button[data-action="resume"]')
  check('resume returns to the game', app.screenManager.is('game'))
  check('pause round trip ran clean', clean('pause'))
  // Everything above needed a live match. What follows is about how one ends,
  // so let it.
  keepAlive = false

  // ---- play it out to the end ----------------------------------------------
  // Play it badly on purpose so the ladder ends: stand there and let the
  // opponent work.
  errors.length = 0
  let n = 0
  while (!app.screenManager.is('gameover') && n < 400000) {
    screen().onFrame({ delta: 1 / 60 })
    n++
  }
  check('a full run reaches game over', app.screenManager.is('gameover'),
    (n / 60).toFixed(0) + 's of game time')
  check('the whole run ran clean', clean('run'))

  const scoreEl = doc.querySelector('.a-gameover--score')
  check('game over shows a result', scoreEl && scoreEl.textContent.length > 0,
    scoreEl && JSON.stringify(scoreEl.textContent))

  // Save a score, then continue back to the menu.
  errors.length = 0
  const nameInput = doc.querySelector('.a-gameover--name')
  if (nameInput) {
    nameInput.value = 'Boot Harness'
    const form = doc.querySelector('.a-gameover--form')
    if (form) form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
    await new Promise((r) => setTimeout(r, 80))
    check('saving a score does not throw', clean('score save'))
  }
  click('.a-gameover button[data-action="continue"]')
  check('continue returns to the menu', app.screenManager.is('menu'))

  errors.length = 0
  click('.a-menu button[data-action="highscores"]')
  check('high scores screen opens', app.screenManager.is('highscores'))
  const rows = doc.querySelectorAll('.a-highscores--list li')
  check('high scores list renders', rows.length > 0, rows.length + ' rows')
  check('high scores render clean', clean('highscores'))

  // ---- every string the game can say actually exists ------------------------
  // A missing key falls back to the key itself, which is how a game ships with
  // "ann.knockedDown" being read out loud to a player.
  errors.length = 0
  const used = new Set()
  const srcDir = path.join(__dirname, '..', 'src', 'js')
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name)
      if (f.isDirectory()) walk(p)
      else if (f.name.endsWith('.js')) {
        const src = fs.readFileSync(p, 'utf8')
        for (const m of src.matchAll(/(?:app\.i18n\.t|\bt)\(\s*'([a-z][\w.]*\.[\w.]+)'/gi)) used.add(m[1])
        for (const m of src.matchAll(/'(ann\.[\w.]+|dir\.[\w.]+|range\.[\w.]+|stance\.[\w.]+|hud\.[\w.]+)'/g)) used.add(m[1])
      }
    }
  }
  walk(srcDir)
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8')
  for (const m of htmlSrc.matchAll(/data-i18n(?:-html)?="([\w.]+)"/g)) used.add(m[1])
  for (const m of htmlSrc.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const pair of m[1].split(';')) {
      const parts = pair.split(':')
      if (parts[1]) used.add(parts[1].trim())
    }
  }
  // Interpolated keys the scanner cannot resolve statically.
  for (const c of content.characters.ROSTER) {
    used.add('fighter.' + c.id)
    used.add('blurb.' + c.id)
    used.add('special.' + c.special.id)
  }
  for (const s of ['stand', 'block', 'air', 'down']) used.add('stance.' + s)
  for (const d of ['forward', 'back']) used.add('motion.' + d)

  const missing = []
  for (const k of used) {
    // t() returns the key itself when the lookup fails.
    if (app.i18n.t(k) === k && !k.startsWith('doc.')) missing.push(k)
  }
  check('every string the game can say is defined in English',
    missing.length === 0, missing.slice(0, 8).join(', '))

  // ...and Spanish should not silently fall back for the strings a player hears
  // constantly.
  const before = app.i18n.locale()
  app.i18n.setLocale('es')
  const untranslated = []
  for (const k of used) {
    if (k.startsWith('doc.')) continue
    if (app.i18n.t(k) === k) untranslated.push(k)
  }
  app.i18n.setLocale(before)
  check('every string is defined in Spanish too',
    untranslated.length === 0, untranslated.slice(0, 8).join(', '))

  console.log('\n' + (failures === 0 ? 'BOOT HARNESS PASSED' : failures + ' BOOT CHECK(S) FAILED'))
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
