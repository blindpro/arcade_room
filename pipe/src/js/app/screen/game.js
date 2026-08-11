// PIPE game screen. Real-time: each frame it advances the flight, reads the
// controls (left/right steering is HELD/continuous), pumps the flight drone and
// the chiptune bed (intensity = speed), turns content events into stereo audio
// + screen-reader announcements, and lights an aria-hidden pipe viz. Audio +
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
    scoreEl: null, speedEl: null, levelEl: null, livesEl: null, bonusEl: null,
    pipeEl: null, barEls: [], dotEls: [],
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
    this.state.levelEl = root.querySelector('.a-game--level-value')
    this.state.livesEl = root.querySelector('.a-game--lives-value')
    this.state.bonusEl = root.querySelector('.a-game--bonus-value')
    this.state.pipeEl = root.querySelector('.a-game--pipe')

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
      A().setLevel(1)
      A().dive()
      self.refreshHud()
      app.announce.assertive(t('ann.dive'))
    })
    content.events.on('ring-reveal', (e) => A().ringReveal(e.dx, e.left, e.right, e.width, e.dist, e.level))
    content.events.on('hum', (e) => A().hum(e.dx, e.dist, e.width, e.level))
    content.events.on('pass', (e) => {
      A().pass(e.width, e.level, e.dx)
      self.refreshHud()
      app.announce.polite(t('ann.pass', {width: e.width}))
    })
    content.events.on('slam', (e) => {
      A().slam(e.lives, e.dx, e.level)
      self.rumble(1.0, 0.6, 320)
      self.refreshHud()
      app.announce.assertive(t('ann.slam', {lives: e.lives}))
    })
    content.events.on('level-up', (e) => {
      A().setLevel(e.level)
      A().levelUp(e.level, e.bonus, e.width)
      self.refreshHud()
      app.announce.assertive(e.bonus ? t('ann.bonusLevel', {level: e.level}) : t('ann.levelUp', {level: e.level}))
    })
    content.events.on('bonus-start', (e) => {
      A().bonusStart(e.level, e.count)
      app.announce.assertive(t('ann.bonusStart', {count: e.count}))
    })
    content.events.on('bonus-end', (e) => {
      A().bonusEnd(e.level)
      app.announce.polite(t('ann.bonusEnd'))
    })
    content.events.on('item-ping', (e) => A().itemPing(e.dx, e.pitch, e.dist, e.level))
    content.events.on('item-collect', (e) => {
      A().itemCollect(e.points, e.pitch, e.count, e.level)
      self.rumble(0.35, 0.25, 70)
      self.refreshHud()
      app.announce.polite(t('ann.collect', {points: e.points, count: e.count}))
    })
    content.events.on('doom', (e) => {
      A().doom(e.reason)
      self.rumble(1.0, 0.8, 460)
    })
    content.events.on('game-over', (e) => {
      A().gameOver()
      content.music.stop()
      const high = app.highscores.qualifies(e.score)
      app.announce.assertive(high
        ? t('ann.gameOverHigh', {score: e.score})
        : t('ann.gameOver', {score: e.score, distance: e.distance, level: e.level}))
      app.screenManager.dispatch('gameOver')
    })
  },

  onEnter: function () {
    content.audio.startFlight()
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
      content.music.setIntensity(content.game.getSpeed() / content.constants.MAX_SPEED)
      content.music.update()
      content.audio.frame(delta, content.game.getSpeed(), content.game.getSteerDir())
      if (app.haptics && app.haptics.update) app.haptics.update(delta)

      if (this.state.entryFrames > 0) { this.state.entryFrames--; this.renderViz(); return }

      if (this.edge('f1', k.is('F1'))) this.announceStatus()
      if (this.edge('f2', k.is('F2'))) this.announceTarget()
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
  distWord: function (dist) {
    if (dist < 25) return app.i18n.t('prox.close')
    if (dist < 90) return app.i18n.t('prox.near')
    return app.i18n.t('prox.far')
  },

  announceStatus: function () {
    const s = content.game.status()
    app.announce.polite(app.i18n.t('ann.status', {
      score: s.score, distance: s.distance, bonusPoints: s.bonusPoints,
      speed: Math.round(s.speed), level: s.level, lives: s.lives,
    }))
  },

  announceTarget: function () {
    const s = content.game.status()
    const target = content.game.targetInfo()
    let msg = app.i18n.t('ann.distance', {distance: s.distance})
    if (target) {
      if (target.bonus) {
        msg += ' ' + app.i18n.t('ann.targetBonus', {
          dist: Math.round(target.dist), remaining: target.remaining, prox: app.i18n.t(this.distWord(target.dist)),
        })
      } else {
        msg += ' ' + app.i18n.t('ann.target', {
          dir: this.dirWord(target.dx), width: Math.round(target.width), dist: Math.round(target.dist), prox: app.i18n.t(this.distWord(target.dist)),
        })
      }
    }
    app.announce.polite(msg)
  },

  announceField: function () {
    const s = content.game.status()
    const ringsLeft = Math.max(0, content.constants.RINGS_PER_LEVEL - content.game.state.ringsPassed)
    app.announce.polite(app.i18n.t('ann.field', {
      speed: Math.round(s.speed), level: s.level, rings: ringsLeft,
    }))
  },

  refreshHud: function () {
    if (!this.state.scoreEl) return
    const s = content.game.status()
    this.state.scoreEl.textContent = String(s.score)
    if (this.state.speedEl) this.state.speedEl.textContent = String(Math.round(s.speed))
    if (this.state.levelEl) this.state.levelEl.textContent = String(s.level)
    if (this.state.livesEl) this.state.livesEl.textContent = String(s.lives)
    if (this.state.bonusEl) this.state.bonusEl.textContent = String(s.bonusPoints)
  },

  // Pipe viz (aria-hidden): the player dot centre, each upcoming ring opening as
  // a horizontal bar (left/width from lane offsets), bonus items as small dots.
  renderViz: function () {
    const pipe = this.state.pipeEl
    if (!pipe) return
    const game = content.game
    const lanes = game.getPipeLanes()
    const half = lanes / 2
    const near = game.nearby()
    const bars = near.filter((o) => o.kind === 'ring')
    const dots = near.filter((o) => o.kind === 'item')
    const total = 1 + bars.length + dots.length

    while (this.state.barEls.length < bars.length) {
      const b = document.createElement('span')
      b.className = 'a-game--bar'
      pipe.appendChild(b)
      this.state.barEls.push(b)
    }
    while (this.state.dotEls.length < dots.length) {
      const d = document.createElement('span')
      d.className = 'a-game--dot'
      pipe.appendChild(d)
      this.state.dotEls.push(d)
    }

    const scale = 46 / half
    const bottomOf = (dist) => 12 + Math.max(0, Math.min(82, 82 - (dist / 200) * 82))

    for (let i = 0; i < this.state.barEls.length; i++) {
      const b = this.state.barEls[i]
      const r = bars[i]
      if (!r) { b.style.opacity = '0'; continue }
      const lx = 50 + r.dx * scale - (r.width / 2) * scale
      b.className = 'a-game--bar' + (r.isTarget ? ' a-game--bar-target' : '')
      b.style.left = Math.max(1, Math.min(99, lx)) + '%'
      b.style.width = Math.max(2, Math.min(96, r.width * scale)) + '%'
      b.style.bottom = bottomOf(r.dist) + '%'
      b.style.opacity = String(0.4 + Math.max(0, 1 - r.dist / 200) * 0.6)
    }
    for (let i = 0; i < this.state.dotEls.length; i++) {
      const d = this.state.dotEls[i]
      const it = dots[i]
      if (!it) { d.style.opacity = '0'; continue }
      const lx = 50 + it.dx * scale
      d.style.left = Math.max(2, Math.min(98, lx)) + '%'
      d.style.bottom = bottomOf(it.dist) + '%'
      d.style.opacity = String(0.5 + Math.max(0, 1 - it.dist / 200) * 0.5)
    }
    // player dot (always the first span: dot 0 in a shared pool)
    let p = this.state.playerEl
    if (!p) {
      p = document.createElement('span')
      p.className = 'a-game--dot a-game--dot-player'
      pipe.appendChild(p)
      this.state.playerEl = p
    }
    p.style.left = '50%'
    p.style.bottom = '10%'
    p.style.opacity = '1'
  },
})
