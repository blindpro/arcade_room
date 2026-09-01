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
// the first time. In particular it covers the binaural layer — every positional
// sound builds an engine.ear.binaural, which the fake Web Audio below has to
// satisfy, so a missing or misused ear API shows up here rather than in the
// player's ears.
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
  function frames(n) {
    for (let i = 0; i < n; i++) screen().onFrame({ delta: 1 / 60 })
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

  // ---- every cue the screen can be asked to play ---------------------------
  // Fired directly, because a single match will not naturally produce all of
  // them and each one builds its own ear.
  errors.length = 0
  content.events.emit('tell', {side: 'foe', dx: -2, level: 'low', limb: 'kick', startup: 0.28})
  content.events.emit('hit', {side: 'foe', victim: 'player', dx: 0, level: 'low', limb: 'kick',
    damage: 12, airHit: false, knockdown: true, health: 40, healthFrac: 0.4})
  content.events.emit('hit', {side: 'player', victim: 'foe', dx: 1.2, level: 'high', limb: 'kick',
    damage: 18, airHit: true, knockdown: true, health: 30, healthFrac: 0.3})
  content.events.emit('blocked', {side: 'foe', victim: 'player', dx: 0.9, level: 'high', limb: 'punch', damage: 1})
  content.events.emit('whiff', {side: 'player', dx: 0, level: 'high', limb: 'kick'})
  content.events.emit('jumped-over', {side: 'player', dx: 0, level: 'low', limb: 'kick'})
  content.events.emit('jump', {side: 'foe', dx: 2})
  content.events.emit('land', {side: 'foe', dx: 2})
  content.events.emit('getup', {side: 'player', dx: 0})
  content.events.emit('special-charge', {side: 'foe', dx: -3, id: 'quake', level: 'low',
    charge: 0.52, fighter: 'rook'})
  content.events.emit('special-fire', {side: 'foe', dx: -3, id: 'quake', level: 'low', fighter: 'rook'})
  content.events.emit('teleport', {side: 'foe', dx: 1})
  content.events.emit('dash', {side: 'foe', dx: 1})
  for (const dx of [4, 3, 2, 1]) content.events.emit('projectile', {dx, dist: dx, incoming: true})
  content.events.emit('projectile-gone', {dx: 0})
  await new Promise((r) => setTimeout(r, 400))
  check('every combat cue plays clean', clean('cues'))

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
