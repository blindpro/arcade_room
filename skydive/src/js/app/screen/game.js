// SKYDIVE game screen. Real-time: each frame it advances the dive, reads the
// controls (left/right steering is HELD/continuous), pumps the wind wash and the
// chiptune bed (intensity = fall speed), turns content events into stereo audio
// + screen-reader announcements, and lights an aria-hidden sky viz. Audio +
// announcements are the source of truth.
app.screen.game = app.screenManager.invent({
  id: 'game',
  parentSelector: '.a-app--game',
  rootSelector: '.a-game',
  transitions: {
    pause: function () { this.change('pause') },
    gameOver: function () { this.change('gameover') },
  },
  state: {
    scoreEl: null, speedEl: null, timeEl: null, crystalEl: null,
    skyEl: null, dotEls: [],
    actionDown: {},
    entryFrames: 0,
    wired: false,
    warnedReady: false,
  },

  KEYS: {
    left:  ['ArrowLeft', 'KeyA', 'Numpad4'],
    right: ['ArrowRight', 'KeyD', 'Numpad6'],
  },
  PADS: {
    left:  [14],
    right: [15],
  },

  onReady: function () {
    const root = this.rootElement
    this.state.scoreEl = root.querySelector('.a-game--score-value')
    this.state.speedEl = root.querySelector('.a-game--speed-value')
    this.state.timeEl = root.querySelector('.a-game--time-value')
    this.state.crystalEl = root.querySelector('.a-game--crystal-value')
    this.state.skyEl = root.querySelector('.a-game--sky')

    window.addEventListener('keydown', (e) => {
      if (!app.screenManager.is('game')) return
      if (['F1', 'F2', 'F3', 'F5'].includes(e.key)) e.preventDefault()
      if ([' ', 'Spacebar', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault()
    })

    this.wireEvents()
  },

  wireEvents: function () {
    if (this.state.wired) return
    this.state.wired = true
    const self = this
    const A = () => content.audio
    const t = (k, p) => app.i18n.t(k, p)

    content.events.on('count', (e) => {
      A().countTone(e.number)
      if (e.number === 2) app.announce.assertive(t('ann.two'))
      else if (e.number === 1) app.announce.assertive(t('ann.one'))
    })
    content.events.on('dive', () => {
      A().dive()
      self.refreshHud()
      app.announce.assertive(t('ann.dive'))
    })
    content.events.on('retarget', (e) => A().retarget(e.dx, e.pitch))
    content.events.on('guide', (e) => A().crystalTick(e.dx, e.below, e.pitch))
    content.events.on('ping', (e) => A().crystalPing(e.dx, e.below, e.pitch))
    content.events.on('collect', (e) => {
      A().collect(e.dx, e.pitch)
      self.rumble(0.4, 0.3, 90)
      self.refreshHud()
      app.announce.polite(t('ann.collect', {lift: e.lift, count: e.count}))
    })
    content.events.on('time-warning', (e) => {
      A().warning(e.remaining)
      app.announce.assertive(t('ann.timeLeft', {time: e.remaining}))
    })
    content.events.on('doom', (e) => {
      A().doom(e.reason)
      self.rumble(e.reason === 'crash' ? 1.0 : 0.6, e.reason === 'crash' ? 0.8 : 0.3, e.reason === 'crash' ? 420 : 260)
    })
    content.events.on('game-over', (e) => {
      A().gameOver()
      content.music.stop()
      const high = app.highscores.qualifies(e.score)
      app.announce.assertive(high
        ? t('ann.gameOverHigh', {score: e.score})
        : t('ann.gameOver', {height: e.height, crystals: e.crystals}))
      app.screenManager.dispatch('gameOver')
    })
  },

  onEnter: function () {
    content.audio.startAmbient()
    content.music.start()
    this.state.actionDown = {}
    this.state.entryFrames = 10
    this.state.warnedReady = false
    app.utility.focus.setWithin(this.rootElement)
    this.refreshHud()
    if (content.game.phase() === 'ready') app.announce.assertive(app.i18n.t('ann.ready'))
    try { app.onlineScores.openSession().catch(() => {}) } catch (e) {}
  },

  onExit: function () {
    if (content.audio && content.audio.silenceAll) content.audio.silenceAll()
    if (content.music && content.music.stop) content.music.stop()
  },

  onFrame: function (e) {
    try {
      const delta = Math.min(0.05, (e && e.delta) || 1 / 60)
      const k = engine.input.keyboard
      const gp = engine.input.gamepad

      // pause (edge)
      if (this.edge('pause', k.is('Escape') || k.is('Backspace') || gp.isDigital(9))) {
        app.announce.assertive(app.i18n.t('ann.paused'))
        app.screenManager.dispatch('pause')
        return
      }

      // held steering -> -1 / 0 / +1 (also gamepad axis 0)
      let dir = 0
      if (this.held('left', k, gp)) dir -= 1
      if (this.held('right', k, gp)) dir += 1
      const ax = gp.getAxis ? gp.getAxis(0) : 0
      if (dir === 0 && Math.abs(ax) > 0.3) dir = ax < 0 ? -1 : 1
      content.game.setSteer(this.state.entryFrames > 0 ? 0 : dir)

      content.game.update(delta)
      content.music.setIntensity(content.game.getFallSpeed() / content.constants.MAX_FALL_SPEED)
      content.music.update()
      content.audio.frame(delta, content.game.getFallSpeed())
      if (app.haptics && app.haptics.update) app.haptics.update(delta)

      if (this.state.entryFrames > 0) { this.state.entryFrames--; this.renderViz(); return }

      if (this.edge('f1', k.is('F1'))) this.announceStatus()
      if (this.edge('f2', k.is('F2'))) this.announceHeight()
      if (this.edge('f3', k.is('F3'))) this.announceField()

      this.renderViz()
    } catch (err) {
      console.error(err)
    }
  },

  held: function (action, k, gp) {
    for (const code of this.KEYS[action]) if (k.is(code)) return true
    for (const b of this.PADS[action]) if (gp.isDigital(b)) return true
    return false
  },
  edge: function (name, isDown) {
    const was = this.state.actionDown[name]
    this.state.actionDown[name] = isDown
    return isDown && !was
  },
  rumble: function (strong, weak, ms) {
    if (app.haptics && app.haptics.enqueue) app.haptics.enqueue({duration: ms || 200, strongMagnitude: strong, weakMagnitude: weak})
  },

  dirWord: function (dx) {
    if (Math.abs(dx) < 0.4) return app.i18n.t('dir.centre')
    return app.i18n.t(dx < 0 ? 'dir.left' : 'dir.right')
  },

  announceStatus: function () {
    const s = content.game.status()
    app.announce.polite(app.i18n.t('ann.status', {
      score: s.score, height: s.height, time: Math.ceil(s.timeLeft), crystals: s.crystals,
    }))
  },

  announceHeight: function () {
    const s = content.game.status()
    const target = content.game.targetInfo()
    let msg = app.i18n.t('ann.height', {height: s.height})
    if (target) {
      const prox = target.below < 10 ? 'prox.close' : (target.below < 60 ? 'prox.near' : 'prox.far')
      msg += ' ' + app.i18n.t('ann.beacon', {
        dir: this.dirWord(target.dx), pitch: target.pitch, prox: app.i18n.t(prox),
      })
    }
    app.announce.polite(msg)
  },

  announceField: function () {
    const s = content.game.status()
    app.announce.polite(app.i18n.t('ann.field', {
      crystals: s.crystals, speed: Math.round(s.fallSpeed), time: Math.ceil(s.timeLeft),
    }))
  },

  refreshHud: function () {
    if (!this.state.scoreEl) return
    const s = content.game.status()
    this.state.scoreEl.textContent = String(s.score)
    if (this.state.speedEl) this.state.speedEl.textContent = String(Math.round(s.fallSpeed))
    if (this.state.timeEl) this.state.timeEl.textContent = String(Math.ceil(s.timeLeft))
    if (this.state.crystalEl) this.state.crystalEl.textContent = String(s.crystals)
  },

  // Sky viz (aria-hidden): plot nearby crystals by horizontal offset (left%) and
  // vertical gap (bottom%), the beacon ringed, a marker for you.
  renderViz: function () {
    const sky = this.state.skyEl
    if (!sky) return
    const crystals = content.game.nearby()
    while (this.state.dotEls.length < crystals.length + 1) {
      const d = document.createElement('span')
      d.className = 'a-game--dot'
      sky.appendChild(d)
      this.state.dotEls.push(d)
    }
    const HW = content.constants.HALF_WIDTH
    for (let i = 0; i < this.state.dotEls.length; i++) {
      const d = this.state.dotEls[i]
      if (i === 0) {
        d.className = 'a-game--dot a-game--dot-player'
        d.style.left = '50%'
        d.style.bottom = '14%'
        d.style.opacity = '1'
        d.removeAttribute('data-type')
        continue
      }
      const c = crystals[i - 1]
      if (!c) { d.style.opacity = '0'; continue }
      const lx = 50 + (c.dx / (HW + 0.5)) * 48
      const by = 14 + Math.max(-12, Math.min(80, (-c.dy / 90) * 70))
      d.className = 'a-game--dot' + (c.isTarget ? ' a-game--dot-target' : '')
      d.style.left = Math.max(0, Math.min(100, lx)) + '%'
      d.style.bottom = by + '%'
      d.style.opacity = String(0.35 + Math.max(0, 1 - Math.abs(c.dy) / 90) * 0.6)
      const k = content.constants
      d.setAttribute('data-type', c.pitch > k.PITCH_MIN + (k.PITCH_MAX - k.PITCH_MIN) * 0.66 ? 'high'
        : c.pitch > k.PITCH_MIN + (k.PITCH_MAX - k.PITCH_MIN) * 0.33 ? 'mid' : 'low')
    }
  },
})
