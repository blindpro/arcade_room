// JOUST game screen. Real-time: each frame it reads the controls (sideways is
// HELD, the flap is an EDGE — holding the key does nothing, which is the whole
// feel of the original), advances the arena, turns content events into binaural
// audio and screen-reader announcements, and lights an aria-hidden strip plot.
//
// One piece of logic lives here rather than in content, because it is about how
// sound is produced rather than what happened: the continuous voices — the
// sustained tones of riders close enough to fight, and the descending whistle
// of a falling egg — are driven off the per-frame `frame` event.
app.screen.game = app.screenManager.invent({
  id: 'game',
  parentSelector: '.a-app--game',
  rootSelector: '.a-game',
  transitions: {
    pause: function () { this.change('pause') },
    gameOver: function () { this.change('gameover') },
  },
  state: {
    scoreEl: null, livesEl: null, waveEl: null, altEl: null,
    ridersEl: null, eggsEl: null,
    plotEl: null, selfEl: null, dotEls: [],
    actionDown: {},
    entryFrames: 0,
    wired: false,
    hurried: false,
  },

  KEYS: {
    left:  ['ArrowLeft', 'KeyA', 'Numpad4'],
    right: ['ArrowRight', 'KeyD', 'Numpad6'],
    // Flap is on every key a player might reach for, because it is pressed
    // several times a second for the length of a run.
    flap:  ['Space', 'ArrowUp', 'KeyW', 'Enter', 'NumpadEnter', 'Numpad8', 'ShiftLeft', 'ShiftRight'],
  },
  PADS: {
    left:  [14],
    right: [15],
    flap:  [0, 1, 2, 3, 7, 12],
  },

  onReady: function () {
    const root = this.rootElement
    this.state.scoreEl = root.querySelector('.a-game--score-value')
    this.state.livesEl = root.querySelector('.a-game--lives-value')
    this.state.waveEl = root.querySelector('.a-game--wave-value')
    this.state.altEl = root.querySelector('.a-game--altitude-value')
    this.state.ridersEl = root.querySelector('.a-game--riders-value')
    this.state.eggsEl = root.querySelector('.a-game--eggs-value')
    this.state.plotEl = root.querySelector('.a-game--plot')
    this.state.selfEl = root.querySelector('.a-game--self')

    window.addEventListener('keydown', (e) => {
      if (!app.screenManager.is('game')) return
      if (['F1', 'F2', 'F3', 'F5'].includes(e.key)) e.preventDefault()
      if ([' ', 'Spacebar', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
      }
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

    // --- the wing beats: the radar ------------------------------------------
    content.events.on('beat', (e) => A().beat(e.dx, e.dAlt, e.dist, e.type, e.chasing, e.crowd))

    // --- per-frame continuous voices ----------------------------------------
    content.events.on('frame', (e) => {
      A().updateRiders(e.riders)
      A().updateFallingEggs(e.falling)
    })

    // --- your own wing -------------------------------------------------------
    content.events.on('flap', (e) => A().flap(e.onGround))
    content.events.on('land', (e) => A().land(e.speed))
    content.events.on('ceiling', () => A().ceiling())

    // --- the duel ------------------------------------------------------------
    content.events.on('kill', (e) => {
      A().kill(e.dx, e.dAlt, e.type)
      self.rumble(0.8, 0.4, 220)
      self.refreshHud()
      app.announce.assertive(t('ann.unhorsed', {
        type: t('type.' + e.type), score: e.score, remaining: e.remaining,
      }))
    })
    content.events.on('bounce', (e) => {
      A().bounce(e.dx, e.shielded)
      self.rumble(0.5, 0.7, 160)
    })
    content.events.on('death', (e) => {
      A().death(e.dx || 0, e.dAlt || 0)
      self.rumble(1.0, 0.9, 600)
      self.refreshHud()
      app.announce.assertive(e.lives > 0
        ? t('ann.death', {lives: e.lives})
        : t('ann.lastLife'))
    })
    content.events.on('respawn', () => {
      A().respawn()
      self.refreshHud()
      app.announce.assertive(t('ann.respawn'))
    })
    content.events.on('invuln-end', () => app.announce.polite(t('ann.exposed')))

    // --- riders --------------------------------------------------------------
    content.events.on('arrive', (e) => A().arrive(e.dx, e.dAlt, e.type))

    // --- eggs ----------------------------------------------------------------
    content.events.on('egg-land', (e) => A().eggLand(e.dx, e.dAlt))
    content.events.on('egg-tick', (e) => A().eggTick(e.dx, e.dAlt, e.progress))
    content.events.on('egg-collect', (e) => {
      A().eggCollect(e.dx, e.streak)
      self.refreshHud()
      app.announce.polite(t('ann.egg', {score: e.score, total: e.total}))
    })
    // The hatch is the one thing you are punished for ignoring, so it is said
    // out loud, with the side it came from — you now have to deal with it.
    content.events.on('hatch', (e) => {
      A().hatch(e.dx, e.dAlt)
      self.rumble(0.6, 0.8, 320)
      app.announce.assertive(t('ann.hatch', {
        type: t('type.' + e.type), side: self.sideWord(e.dx),
      }))
    })

    // --- waves ---------------------------------------------------------------
    content.events.on('wave-start', (e) => {
      A().waveStart(e.wave)
      self.state.hurried = false
      self.refreshHud()
      app.announce.assertive(t('ann.wave', {wave: e.wave, riders: e.riders}))
    })
    content.events.on('wave-clear', (e) => {
      A().waveClear()
      self.refreshHud()
      app.announce.assertive(t('ann.waveClear', {wave: e.wave, bonus: e.bonus, total: e.total}))
    })
    content.events.on('extra-life', (e) => {
      A().extraLife()
      self.refreshHud()
      app.announce.assertive(t('ann.extraLife', {lives: e.lives}))
    })

    // --- run state -----------------------------------------------------------
    content.events.on('doom', () => {
      A().doom()
      self.rumble(1.0, 0.8, 700)
    })
    content.events.on('game-over', (e) => {
      A().gameOver()
      content.music.stop()
      const high = app.highscores.qualifies(e.score)
      app.announce.assertive(high
        ? t('ann.gameOverHigh', {score: e.score})
        : t('ann.gameOver', {score: e.score, wave: e.wave}))
      app.screenManager.dispatch('gameOver')
    })
  },

  onEnter: function () {
    content.audio.startAmbient()
    content.music.start()
    this.state.actionDown = {}
    this.state.entryFrames = 10
    this.state.hurried = false
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

      if (this.edge('pause', k.is('Escape') || k.is('Backspace') || gp.isDigital(9))) {
        app.announce.assertive(app.i18n.t('ann.paused'))
        app.screenManager.dispatch('pause')
        return
      }

      if (this.state.entryFrames > 0) {
        this.state.entryFrames--
        content.game.update(delta)
        this.renderPlot()
        return
      }

      // Sideways is held.
      let dir = 0
      if (this.held('left', k, gp)) dir -= 1
      if (this.held('right', k, gp)) dir += 1
      const ax = gp.getAxis ? gp.getAxis(0) : 0
      if (dir === 0 && Math.abs(ax) > 0.3) dir = ax < 0 ? -1 : 1
      content.game.setThrust(dir)

      // The flap is an EDGE. Holding it buys you nothing; you pump it. This one
      // line is most of what makes the game feel like Joust.
      if (this.edge('flap', this.held('flap', k, gp))) content.game.flap()

      content.game.update(delta)

      const st = content.game.status()
      content.music.setIntensity(st.threat)
      content.music.update()
      content.audio.frame(delta, st)
      if (app.haptics && app.haptics.update) app.haptics.update(delta)

      // The wave has dragged on and everything left alive has sped up. Said
      // once, because it is a state change rather than a running condition.
      if (!this.state.hurried && st.hurry > 1.02) {
        this.state.hurried = true
        content.audio.hurry()
        app.announce.assertive(app.i18n.t('ann.hurry'))
      }

      if (this.edge('f1', k.is('F1'))) this.announceStatus()
      if (this.edge('f2', k.is('F2'))) this.announceNearest()
      if (this.edge('f3', k.is('F3'))) this.announceField()

      this.refreshHud()
      this.renderPlot()
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
    if (app.haptics && app.haptics.enqueue) {
      app.haptics.enqueue({duration: ms || 200, strongMagnitude: strong, weakMagnitude: weak})
    }
  },

  // Which side of you something is, spoken. The arena wraps, so an offset is
  // always the short way round and "left" always means "the near way left".
  sideWord: function (dx) {
    const d = Math.round(Math.abs(dx))
    if (d < 4) return app.i18n.t('dir.onYou')
    return app.i18n.t(dx < 0 ? 'dir.left' : 'dir.right', {dist: d})
  },

  // The verdict, in words: what happens if you touch this rider right now.
  // This is the accessible form of the interval you are meant to hear — it
  // gives you the answer to one rider, but not to the arena, so it does not
  // replace the listening.
  verdictWord: function (outcome) {
    if (outcome < 0) return app.i18n.t('verdict.win')
    if (outcome > 0) return app.i18n.t('verdict.lose')
    return app.i18n.t('verdict.bounce')
  },

  heightWord: function (dAlt) {
    const d = Math.round(Math.abs(dAlt))
    if (Math.abs(dAlt) <= content.constants.DUEL_MARGIN) return app.i18n.t('height.level')
    return app.i18n.t(dAlt > 0 ? 'height.above' : 'height.below', {alt: d})
  },

  // F1 — you.
  announceStatus: function () {
    const s = content.game.status()
    app.announce.polite(app.i18n.t('ann.status', {
      score: s.score,
      lives: s.lives,
      wave: s.wave,
      altitude: Math.round(s.altitude),
      ceiling: content.constants.CEILING,
      riders: s.riders + s.pending,
      eggs: s.eggsOut,
    }))
  },

  // F2 — the rider that most needs a decision.
  announceNearest: function () {
    const r = content.game.nearestRider()
    if (!r) {
      app.announce.polite(app.i18n.t('ann.noRiders'))
      return
    }
    app.announce.polite(app.i18n.t('ann.nearest', {
      type: app.i18n.t('type.' + r.type),
      side: this.sideWord(r.dx),
      height: this.heightWord(r.dAlt),
      verdict: this.verdictWord(r.outcome),
      climb: Math.ceil(r.climbNeeded),
    }))
  },

  // F3 — everything in the air and everything on the deck.
  announceField: function () {
    const riders = content.game.riderList().slice(0, 4)
    const eggs = content.game.eggList().slice(0, 3)
    const parts = []
    for (const r of riders) {
      parts.push(app.i18n.t('ann.fieldRider', {
        type: app.i18n.t('type.' + r.type),
        side: this.sideWord(r.dx),
        height: this.heightWord(r.dAlt),
      }))
    }
    for (const e of eggs) {
      parts.push(app.i18n.t(e.landed ? 'ann.fieldEgg' : 'ann.fieldEggFalling', {
        side: this.sideWord(e.dx),
        time: Math.ceil(e.timeLeft),
      }))
    }
    if (!parts.length) {
      app.announce.polite(app.i18n.t('ann.clearAir'))
      return
    }
    app.announce.polite(parts.join('. '))
  },

  refreshHud: function () {
    if (!this.state.scoreEl) return
    const s = content.game.status()
    this.state.scoreEl.textContent = String(s.score)
    if (this.state.livesEl) this.state.livesEl.textContent = String(Math.max(0, s.lives))
    if (this.state.waveEl) this.state.waveEl.textContent = String(s.wave)
    if (this.state.altEl) {
      this.state.altEl.textContent = s.onGround
        ? app.i18n.t('hud.onDeck')
        : String(Math.round(s.altitude))
    }
    if (this.state.ridersEl) this.state.ridersEl.textContent = String(s.riders + s.pending)
    if (this.state.eggsEl) this.state.eggsEl.textContent = String(s.eggsOut)
  },

  // A side-on view of the strip (aria-hidden): you at the centre, riders and
  // eggs placed by horizontal offset and altitude. Sighted and low-vision
  // players get the same two axes the audio carries — left/right and height.
  renderPlot: function () {
    const el = this.state.plotEl
    if (!el) return
    const k = content.constants
    const riders = content.game.riderList()
    const eggs = content.game.eggList()
    const st = content.game.status()
    const items = riders.concat(eggs.map((e) => ({...e, isEgg: true})))

    if (this.state.selfEl) {
      this.state.selfEl.style.bottom = (st.altitudeFrac * 92 + 2) + '%'
      this.state.selfEl.style.opacity = st.alive ? (st.invuln > 0 ? '0.5' : '1') : '0.15'
    }

    while (this.state.dotEls.length < items.length) {
      const d = document.createElement('span')
      d.className = 'a-game--dot'
      el.appendChild(d)
      this.state.dotEls.push(d)
    }

    for (let i = 0; i < this.state.dotEls.length; i++) {
      const d = this.state.dotEls[i]
      const it = items[i]
      if (!it) { d.style.opacity = '0'; continue }
      // Horizontal: the wrapped offset, so the plot is centred on you the same
      // way the audio is.
      const left = 50 + (it.dx / k.HEAR_RANGE) * 48
      const alt = k.clamp((it.dAlt + st.altitude) / k.CEILING, 0, 1)
      d.style.left = left + '%'
      d.style.bottom = (alt * 92 + 2) + '%'
      d.style.opacity = String(0.3 + k.closeness(it.dist) * 0.7)
      d.className = 'a-game--dot' + (it.isEgg ? ' a-game--dot-egg' : '')
      d.setAttribute('data-type', it.isEgg
        ? (it.landed ? 'egg' : 'egg-falling')
        : (it.outcome > 0 ? 'above' : (it.outcome < 0 ? 'below' : 'level')))
    }
  },
})
