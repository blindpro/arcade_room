// Headless bundle-boot harness for JOUST. Loads the REAL built bundle into a
// jsdom document (the real index.html) against a fake Web Audio API, boots it
// like a browser would, then drives the screen FSM: menu -> learn the sounds ->
// back -> Take flight -> a full run played through the actual key handlers
// (flap, lean, the F-key readouts) -> game over -> save -> continue.
// Any error a screen swallows into console.error fails the run.
//
// This covers what tools/sim.js cannot see: content/audio.js and the game
// screen only ever run in a browser, so every synthesis call and every event
// wiring is exercised here for the first time. In particular it covers the
// binaural layer — every positional sound goes through engine.ear.binaural,
// which the fake Web Audio below has to satisfy, so a missing or misused ear
// API shows up here rather than in the player's ears.
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
  // The flap is an EDGE, so a held key buys exactly one beat. Pumping it means
  // actually releasing between presses, the same as a player does.
  function pump(beats, framesBetween) {
    for (let i = 0; i < beats; i++) {
      key('Space'); frames(1); keyUp('Space'); frames(framesBetween || 13)
    }
  }

  // ---- every cue in Learn the Sounds actually synthesises -------------------
  click('.a-menu button[data-action="learn"]')
  check('Learn the sounds opens', app.screenManager.is('learn'))
  const cues = [...doc.querySelectorAll('.a-learn button[data-sound]')]
  check('learn screen lists every cue', cues.length >= 25, cues.length + ' cues')
  errors.length = 0
  for (const b of cues) b.click()
  await new Promise((r) => setTimeout(r, 400)) // let deferred cues (the ramps) fire
  check('every learn cue plays without error', clean('learn cues'))
  click('.a-learn button[data-action="back"]')
  check('returns to menu from learn', app.screenManager.is('menu'))

  // ---- the audio test screen: both axes ------------------------------------
  errors.length = 0
  app.screenManager.dispatch('learn') // any route out of menu, then straight to test
  app.screenManager.dispatch('back')
  for (const dir of ['l', 'c', 'r', 'up', 'down', 'sweep', 'ladder']) {
    content.audio.testDirection(dir)
  }
  await new Promise((r) => setTimeout(r, 400))
  check('both audio-test axes play clean', clean('audio test'))
  content.audio.silenceAll()

  // ---- take flight ----------------------------------------------------------
  errors.length = 0
  click('.a-menu button[data-action="start"]')
  check('Start enters the game screen', app.screenManager.is('game'))
  check('the run begins in the ready countdown', content.game.phase() === 'ready',
    content.game.phase())

  frames(220)
  check('countdown reaches play', content.game.phase() === 'play', content.game.phase())
  check('wave 1 has started', content.game.status().wave === 1, 'wave ' + content.game.status().wave)
  check('countdown and wave fanfare ran clean', clean('countdown'))

  // ---- the wing: the one control that matters -------------------------------
  errors.length = 0
  {
    const y0 = content.game.getAltitude()
    pump(14)
    const climbed = content.game.getAltitude() - y0
    check('pumping Space climbs', climbed > 5, climbed.toFixed(1) + ' units')
  }
  {
    // Holding it must NOT climb: the flap is an edge, and that is the feel.
    const y0 = content.game.getAltitude()
    key('Space')
    frames(120)
    keyUp('Space')
    const drift = content.game.getAltitude() - y0
    check('HOLDING Space does not climb (the flap is an edge)', drift < 0,
      drift.toFixed(1) + ' units over 2s of holding')
  }
  check('the wing ran clean', clean('wing'))

  // ---- leaning --------------------------------------------------------------
  errors.length = 0
  key('ArrowRight')
  frames(90)
  keyUp('ArrowRight')
  const right = content.game.getSpeed()
  check('holding right leans you right', right > 5, right.toFixed(1))
  key('ArrowLeft')
  frames(180)
  keyUp('ArrowLeft')
  check('holding left brings you back', content.game.getSpeed() < 0,
    content.game.getSpeed().toFixed(1))
  content.game.setThrust(0)
  check('leaning ran clean', clean('leaning'))

  // ---- the wing beats: the radar, and the binaural path ---------------------
  errors.length = 0
  let beats = 0
  content.events.on('beat', () => { beats++ })
  frames(400)
  check('riders beat their wings', beats > 0, beats + ' beats')
  check('the beats and their binaural ears ran clean', clean('beats'))

  // ---- the duel: force all three outcomes through the real audio layer ------
  // The screen turns each of these into a different sound, and each one builds
  // its own ear, so all three paths need exercising.
  errors.length = 0
  content.events.emit('kill', {dx: 12, dAlt: -6, type: 'bounder', score: 500, total: 500, remaining: 2})
  content.events.emit('bounce', {dx: -8, dAlt: 0, type: 'hunter', shielded: false})
  content.events.emit('death', {dx: 3, dAlt: 5, type: 'shadowlord', reason: 'unhorsed', lives: 2})
  content.events.emit('respawn', {lives: 2, invuln: 2.2})
  await new Promise((r) => setTimeout(r, 250))
  check('all three duel outcomes play clean', clean('duel'))

  // ---- eggs -----------------------------------------------------------------
  errors.length = 0
  content.events.emit('egg-land', {dx: 20, dAlt: -30, type: 'bounder'})
  for (const p of [0, 0.3, 0.6, 0.9, 1]) {
    content.events.emit('egg-tick', {dx: 20, dAlt: -30, progress: p, type: 'bounder'})
  }
  content.events.emit('egg-collect', {dx: 0, dAlt: 0, type: 'bounder', score: 500, streak: 2, total: 1000})
  content.events.emit('hatch', {dx: -14, dAlt: -30, from: 'bounder', type: 'hunter'})
  await new Promise((r) => setTimeout(r, 350))
  check('the whole egg lifecycle plays clean', clean('eggs'))

  // ---- waves and the run --------------------------------------------------
  errors.length = 0
  content.events.emit('wave-start', {wave: 4, riders: 5})
  content.events.emit('wave-clear', {wave: 4, bonus: 2000, total: 9000})
  content.events.emit('extra-life', {lives: 4, at: 20000})
  content.events.emit('ceiling', {})
  content.events.emit('land', {speed: 18})
  content.events.emit('arrive', {dx: 90, dAlt: 18, type: 'shadowlord'})
  await new Promise((r) => setTimeout(r, 250))
  check('wave and boundary cues play clean', clean('waves'))

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
  click('.a-pause button[data-action="resume"]')
  check('resume returns to the game', app.screenManager.is('game'))
  check('pause round trip ran clean', clean('pause'))

  // ---- play it out to the end ----------------------------------------------
  // Play it badly on purpose so the run actually ends: never flap, and the
  // riders will find you.
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
  // "ann.hatch" being read out loud to a player.
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
        for (const m of src.matchAll(/'(ann\.[\w.]+|type\.[\w.]+|dir\.[\w.]+|height\.[\w.]+|verdict\.[\w.]+|hud\.[\w.]+)'/g)) used.add(m[1])
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
  for (const tier of ['bounder', 'hunter', 'shadowlord']) used.add('type.' + tier)

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
