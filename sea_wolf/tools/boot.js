// Headless bundle-boot harness for SEA WOLF. Loads the REAL built bundle into
// a jsdom document (the real index.html) against a fake Web Audio API, boots it
// like a browser would, then drives the screen FSM: menu -> learn the sounds ->
// back -> Start -> a full patrol played through the actual key handlers (helm,
// throttle, periscope, ping, fire, dive) -> game over -> save -> continue. Any
// error a screen swallows into console.error fails the run.
//
// It also covers the binaural layer: every positional sound goes through
// engine.ear.binaural, which the fake Web Audio below has to satisfy, so a
// missing or misused ear API shows up here rather than in the player's ears.
//
// This covers what tools/sim.js cannot see: content/audio.js and the game
// screen only ever run in a browser, so every synthesis call and every event
// wiring is exercised here for the first time.
//
// Requires the --debug bundle (no IIFE wrap) so app/content/engine are reachable.
//   npx gulp build --debug && node tools/boot.js
'use strict'
const fs = require('fs')
const path = require('path')
const { JSDOM, VirtualConsole } = require('jsdom')

// ---- fake Web Audio ----
function makeParam() {
  const p = { value: 0 }
  for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime',
    'setTargetAtTime', 'cancelScheduledValues', 'cancelAndHoldAtTime', 'setValueCurveAtTime',
    'connect', 'disconnect']) p[m] = () => p
  return p
}
const PARAMS = new Set(['gain', 'frequency', 'Q', 'detune', 'pan', 'delayTime', 'playbackRate',
  'threshold', 'knee', 'ratio', 'attack', 'release', 'reduction'])
function makeNode() {
  const store = {}, params = {}
  return new Proxy(store, {
    get(t, prop) {
      if (prop in t) return t[prop]
      if (typeof prop === 'symbol') return undefined
      if (PARAMS.has(prop)) return params[prop] || (params[prop] = makeParam())
      return (...a) => (prop === 'connect' ? (a[0] || store) : store)
    },
    set(t, prop, v) { t[prop] = v; return true },
  })
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
function makeContext() {
  const base = {
    sampleRate: 44100, currentTime: 0, state: 'running', destination: makeNode(), listener: makeNode(),
    createBuffer: (c, l) => new FakeAudioBuffer(c, l, 44100),
    resume: () => Promise.resolve(), suspend: () => Promise.resolve(), close: () => Promise.resolve(),
    addEventListener() {},
  }
  return new Proxy(base, {
    get(t, p) {
      if (p in t) return t[p]
      if (typeof p === 'string' && p.startsWith('create')) return () => makeNode()
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
  function frames(n) {
    for (let i = 0; i < n; i++) screen().onFrame({ delta: 1 / 60 })
  }

  // ---- every cue in Learn the Sounds actually synthesises -------------------
  click('.a-menu button[data-action="learn"]')
  check('Learn the sounds opens', app.screenManager.is('learn'))
  const cues = [...doc.querySelectorAll('.a-learn button[data-sound]')]
  check('learn screen lists every cue', cues.length >= 20, cues.length + ' cues')
  errors.length = 0
  for (const b of cues) b.click()
  await new Promise((r) => setTimeout(r, 250)) // let deferred cues (echo, run) fire
  check('every learn cue plays without error', clean('learn cues'))
  click('.a-learn button[data-action="back"]')
  check('returns to menu from learn', app.screenManager.is('menu'))

  // ---- start a patrol -------------------------------------------------------
  errors.length = 0
  click('.a-menu button[data-action="start"]')
  check('Start enters the game screen', app.screenManager.is('game'))
  check('patrol begins in the ready countdown', content.game.phase() === 'ready',
    content.game.phase())

  frames(220)
  check('countdown reaches play', content.game.phase() === 'play', content.game.phase())
  check('countdown and klaxon ran clean', clean('countdown'))

  // ---- drive the actual controls -------------------------------------------
  // Throttle first: the boat has to be moving before the rudder does anything.
  errors.length = 0
  key('ArrowUp')
  frames(120)
  keyUp('ArrowUp')
  const speed = content.game.getSpeed()
  check('holding up builds speed', speed > 6, speed.toFixed(1) + ' m/s')

  const h0 = content.game.getHeading()
  key('ArrowRight')
  frames(90)
  keyUp('ArrowRight')
  const turned = content.constants.wrapDeg(content.game.getHeading() - h0)
  check('holding right puts the rudder over to starboard', turned > 10,
    turned.toFixed(1) + ' deg')

  const h1 = content.game.getHeading()
  key('ArrowLeft')
  frames(180)
  keyUp('ArrowLeft')
  const back = content.constants.wrapDeg(content.game.getHeading() - h1)
  check('holding left brings her back to port', back < -10, back.toFixed(1) + ' deg')
  check('the helm ran clean', clean('helm'))

  // The periscope is the fine aim, independent of the boat.
  errors.length = 0
  key('KeyE')
  frames(45)
  keyUp('KeyE')
  const scope = content.game.getPeriscope()
  check('E trains the periscope to starboard', scope > 3, scope.toFixed(1) + ' deg')
  check('the periscope stops at its limit',
    Math.abs(scope) <= content.constants.PERISCOPE_LIMIT + 0.01, scope.toFixed(1))
  key('KeyR')
  frames(3)
  keyUp('KeyR')
  check('R centres the periscope', Math.abs(content.game.getPeriscope()) < 0.01,
    content.game.getPeriscope().toFixed(2))
  check('the periscope ran clean', clean('periscope'))

  // The beeps are the navigation interface; make sure they are firing and
  // that the binaural path survives them.
  errors.length = 0
  let beeps = 0
  content.events.on('beep', () => { beeps++ })
  frames(300)
  check('contacts are beeping', beeps > 0, beeps + ' beeps in 5s')
  check('the beeps ran clean', clean('beeps'))

  // Ping. The echo scheduling is the one piece of game logic that lives in the
  // screen rather than in content, so it can only be exercised here.
  errors.length = 0
  let pingSeen = false
  content.events.on('ping', () => { pingSeen = true })
  key('KeyS')
  frames(10)
  keyUp('KeyS')
  check('S sends an active ping', pingSeen)
  await new Promise((r) => setTimeout(r, 400)) // let the scheduled echoes land
  check('ping and its echoes ran clean', clean('ping'))

  // S must no longer touch the throttle - it used to be throttle-down, and a
  // ping that also slowed the boat would be a nasty surprise mid-intercept.
  const speedBeforePing = content.game.getSpeed()
  key('KeyS'); frames(30); keyUp('KeyS')
  check('S no longer works the throttle',
    Math.abs(content.game.getSpeed() - speedBeforePing) < 0.6,
    speedBeforePing.toFixed(1) + ' -> ' + content.game.getSpeed().toFixed(1) + ' m/s')

  // The sweep: instant, free, and usable far more often than the ping.
  errors.length = 0
  let sweepSeen = null
  content.events.on('sweep', (e) => { sweepSeen = e })
  // Advance a single frame around the sweep. The boat is at flank speed here,
  // so the noise gauge is climbing on its own at about 0.0017 per frame; what
  // this has to rule out is a STEP, of the kind a ping puts in (0.34).
  const noiseBeforeSweep = content.game.getNoise()
  key('KeyF'); frames(1); keyUp('KeyF')
  check('F sends a hydrophone sweep', !!sweepSeen,
    sweepSeen && sweepSeen.returns.length + ' returns')
  check('the sweep puts no step in the noise gauge',
    content.game.getNoise() - noiseBeforeSweep < 0.01,
    (content.game.getNoise() - noiseBeforeSweep).toFixed(4) +
    ' vs ' + content.constants.PING_NOISE + ' for a ping')
  frames(9)
  await new Promise((r) => setTimeout(r, 700)) // let the blips play out
  check('the sweep and its blips ran clean', clean('sweep'))

  // Fire, then let the fish run to a hit or to exhaustion. The running whine
  // is a per-torpedo binaural voice created and torn down by the frame event.
  errors.length = 0
  const before = content.game.status().torpedoes
  key('Space')
  frames(10)
  keyUp('Space')
  check('Space fires a torpedo', content.game.status().torpedoes === before - 1,
    before + ' -> ' + content.game.status().torpedoes)
  frames(900)
  check('the torpedo run and its outcome ran clean', clean('torpedo'))

  // Depth. It is a four-rung ladder travelled at a fixed rate, not a toggle, so
  // each order has to be given its travel time before the boat is anywhere.
  errors.length = 0
  const levels = content.constants.DEPTH_LEVELS
  key('KeyX'); frames(6); keyUp('KeyX')
  frames(60 * Math.ceil(levels[1] / content.constants.DIVE_RATE) + 60)
  check('X takes her down a rung', content.game.status().depth === levels[1],
    content.game.status().depth + ' m')
  check('the boat reports the level it settled on', !content.game.status().changingDepth)

  const blocked = content.game.status().torpedoes
  key('Space'); frames(6); keyUp('Space')
  check('the tubes will not fire from below periscope depth',
    content.game.status().torpedoes === blocked)

  key('KeyC'); frames(6); keyUp('KeyC')
  frames(60 * Math.ceil(levels[1] / content.constants.RISE_RATE) + 60)
  check('C brings her back to periscope depth', content.game.status().atPeriscope,
    content.game.status().depth + ' m')
  check('depth changes ran clean', clean('depth'))

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

  // ---- play it out to the end ----------------------------------------------
  errors.length = 0
  let n = 0
  while (!app.screenManager.is('gameover') && n < 60000) {
    screen().onFrame({ delta: 1 / 60 })
    if (n % 300 === 0) content.game.fire() // also exercise the out-of-torpedoes path
    n++
  }
  check('a full patrol reaches game over', app.screenManager.is('gameover'), n + ' frames')
  check('the whole patrol ran clean', clean('patrol'))

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

  console.log('\n' + (failures === 0 ? 'BOOT HARNESS PASSED' : failures + ' BOOT CHECK(S) FAILED'))
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
