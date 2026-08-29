// SEA WOLF game screen. Real-time: each frame it advances the patrol, reads
// the controls (periscope slew is HELD, everything else is an edge), pumps the
// sea wash and the tension bed, turns content events into stereo audio plus
// screen-reader announcements, and lights an aria-hidden sonar viz. Audio and
// announcements are the source of truth.
//
// The one piece of scheduling that lives here rather than in content: active
// sonar. content.game emits a single `ping` event carrying every return with
// its own delay, and this screen plays each echo late by that delay — which is
// how range is heard.
app.screen.game = app.screenManager.invent({
  id: 'game',
  parentSelector: '.a-app--game',
  rootSelector: '.a-game',
  transitions: {
    pause: function () { this.change('pause') },
    gameOver: function () { this.change('gameover') },
  },
  state: {
    scoreEl: null, torpEl: null, hullEl: null, batteryEl: null,
    depthEl: null, timeEl: null, sonarEl: null, dotEls: [],
    actionDown: {},
    entryFrames: 0,
    wired: false,
    wasReloading: false,
  },

  KEYS: {
    left:  ['ArrowLeft', 'KeyA', 'Numpad4'],
    right: ['ArrowRight', 'KeyD', 'Numpad6'],
    fine:  ['ShiftLeft', 'ShiftRight'],
    fire:  ['Space', 'Enter', 'NumpadEnter'],
    ping:  ['KeyP', 'KeyE', 'Numpad0'],
    deep:  ['ArrowDown', 'KeyS', 'Numpad2'],
    up:    ['ArrowUp', 'KeyW', 'Numpad8'],
  },
  PADS: {
    left:  [14],
    right: [15],
    fine:  [4],
    fire:  [0, 7],
    ping:  [2],
    deep:  [13],
    up:    [12],
  },

  onReady: function () {
    const root = this.rootElement
    this.state.scoreEl = root.querySelector('.a-game--score-value')
    this.state.torpEl = root.querySelector('.a-game--torpedo-value')
    this.state.hullEl = root.querySelector('.a-game--hull-value')
    this.state.batteryEl = root.querySelector('.a-game--battery-value')
    this.state.depthEl = root.querySelector('.a-game--depth-value')
    this.state.timeEl = root.querySelector('.a-game--time-value')
    this.state.sonarEl = root.querySelector('.a-game--sonar')

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
      A().startAim()
      self.refreshHud()
      app.announce.assertive(t('ann.patrol'))
    })

    // --- passive sonar -------------------------------------------------------
    content.events.on('hum', (e) => A().hum(e.bearing, e.range, e.hum, e.escort, e.muffled))
    content.events.on('cross', (e) => A().cross(e.bearing, e.escort))

    // --- active sonar --------------------------------------------------------
    // Each return is played late by its own round-trip delay. That delay is
    // the range; nothing else in the game tells you how far a ship is.
    content.events.on('ping', (e) => {
      A().pingOut()
      for (const r of e.returns) {
        A().later(() => A().echo(r.bearing, r.range, r.escort), r.delay * 1000)
      }
      if (!e.returns.length) {
        app.announce.polite(t('ann.noContacts'))
      } else {
        const n = e.returns[0]
        app.announce.polite(t('ann.pingReport', {
          count: e.returns.length,
          type: t('type.' + n.type),
          bearing: self.bearingWord(n.bearing),
          range: Math.round(n.range),
        }))
      }
    })

    // --- torpedoes -----------------------------------------------------------
    content.events.on('fire', (e) => {
      A().fire(e.bearing)
      A().startRun()
      self.rumble(0.7, 0.3, 180)
      self.refreshHud()
      app.announce.polite(t('ann.fired', {bearing: self.bearingWord(e.bearing), remaining: e.remaining}))
    })
    content.events.on('torpedo-run', (e) => A().updateRun(e.bearing, e.range))
    content.events.on('torpedo-spent', (e) => {
      A().torpedoSpent(e.bearing)
      if (content.game.torpedoCount() === 0) A().stopRun()
    })
    content.events.on('hit', (e) => {
      A().hit(e.bearing, e.range, e.escort)
      if (content.game.torpedoCount() === 0) A().stopRun()
      self.rumble(1.0, 0.6, 380)
      self.refreshHud()
      app.announce.assertive(t('ann.hit', {
        type: t('type.' + e.type), tonnage: e.tonnage, total: e.total,
      }))
    })
    content.events.on('fire-blocked', (e) => {
      A().fireBlocked(e.reason)
      app.announce.polite(t('ann.blocked.' + e.reason))
    })

    // --- being hunted --------------------------------------------------------
    content.events.on('acquired', () => {
      A().acquired()
      self.rumble(0.5, 0.8, 500)
      app.announce.assertive(t('ann.acquired'))
    })
    content.events.on('lost-contact', () => {
      A().lostContact()
      app.announce.polite(t('ann.lostContact'))
    })
    content.events.on('escort-turn', (e) => A().escortTurn(e.bearing))
    content.events.on('charge-splash', (e) => {
      A().chargeSplash(e.bearing, content.constants.CHARGE_FALL_TIME)
      app.announce.assertive(t('ann.charges'))
    })
    content.events.on('charge-detonate', (e) => {
      A().chargeDetonate(e.bearing, e.proximity, e.deep)
      if (e.proximity > 0.2) self.rumble(e.proximity, e.proximity * 0.6, 300)
    })
    content.events.on('damage', (e) => {
      A().damage()
      self.refreshHud()
      app.announce.assertive(t('ann.damage', {hull: Math.round(e.hull)}))
    })

    // --- depth ---------------------------------------------------------------
    content.events.on('depth-change', (e) => {
      A().depthChange(e.to)
      app.announce.polite(t(e.to === 'deep' ? 'ann.diving' : 'ann.surfacing'))
    })
    content.events.on('depth-settled', (e) => {
      A().depthSettled(e.depth)
      self.refreshHud()
    })
    content.events.on('battery-low', () => {
      A().batteryLow()
      app.announce.assertive(t('ann.batteryLow'))
    })
    content.events.on('battery-dead', () => {
      A().batteryDead()
      app.announce.assertive(t('ann.batteryDead'))
    })

    // --- run state -----------------------------------------------------------
    content.events.on('time-warning', (e) => {
      A().warning(e.remaining)
      app.announce.assertive(t('ann.timeLeft', {time: e.remaining}))
    })
    content.events.on('doom', (e) => {
      A().doom(e.reason)
      A().stopRun()
      A().stopAim()
      self.rumble(e.reason === 'sunk' ? 1.0 : 0.5, 0.8, e.reason === 'sunk' ? 700 : 260)
    })
    content.events.on('game-over', (e) => {
      A().gameOver()
      content.music.stop()
      const high = app.highscores.qualifies(e.score)
      app.announce.assertive(high
        ? t('ann.gameOverHigh', {score: e.score})
        : t('ann.gameOver', {tonnage: e.tonnage, sunk: e.sunk}))
      app.screenManager.dispatch('gameOver')
    })
  },

  onEnter: function () {
    content.audio.startAmbient()
    content.music.start()
    this.state.actionDown = {}
    this.state.entryFrames = 10
    this.state.wasReloading = false
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

      // Periscope slew is held; shift (or L1) slows it for a fine bearing.
      let dir = 0
      if (this.held('left', k, gp)) dir -= 1
      if (this.held('right', k, gp)) dir += 1
      const ax = gp.getAxis ? gp.getAxis(0) : 0
      if (dir === 0 && Math.abs(ax) > 0.3) dir = ax < 0 ? -1 : 1
      const fine = this.held('fine', k, gp)

      if (this.state.entryFrames > 0) {
        this.state.entryFrames--
        content.game.update(delta)
        this.renderViz()
        return
      }

      content.game.setAim(dir, fine, delta)

      if (this.edge('fire', this.held('fire', k, gp))) content.game.fire()
      if (this.edge('ping', this.held('ping', k, gp))) {
        if (!content.game.ping()) content.audio.fireBlocked('reload')
      }
      if (this.edge('deep', this.held('deep', k, gp))) content.game.setDepth('deep')
      if (this.edge('up', this.held('up', k, gp))) content.game.setDepth('periscope')

      content.game.update(delta)

      const st = content.game.status()
      content.music.setIntensity(st.noise)
      content.music.update()
      content.audio.frame(delta, {depth: st.depth, noise: st.noise})
      content.audio.updateAim(st.aim, dir !== 0, st.depth === 'periscope' && st.reload <= 0 && st.torpedoes > 0)
      if (app.haptics && app.haptics.update) app.haptics.update(delta)

      // A tube coming ready is worth a small click — it is the difference
      // between a shot and a wasted keypress.
      const reloading = st.reload > 0
      if (this.state.wasReloading && !reloading && st.torpedoes > 0) content.audio.reloaded()
      this.state.wasReloading = reloading

      if (this.edge('f1', k.is('F1'))) this.announceStatus()
      if (this.edge('f2', k.is('F2'))) this.announceSolution()
      if (this.edge('f3', k.is('F3'))) this.announceContacts()

      this.refreshHud()
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
    if (app.haptics && app.haptics.enqueue) {
      app.haptics.enqueue({duration: ms || 200, strongMagnitude: strong, weakMagnitude: weak})
    }
  },

  // "twenty degrees to port" / "dead ahead" / "forty degrees to starboard"
  bearingWord: function (bearing) {
    const b = Math.round(bearing)
    if (Math.abs(b) < 3) return app.i18n.t('dir.ahead')
    return app.i18n.t(b < 0 ? 'dir.port' : 'dir.starboard', {deg: Math.abs(b)})
  },

  // F1 — the boat.
  announceStatus: function () {
    const s = content.game.status()
    app.announce.polite(app.i18n.t('ann.status', {
      tonnage: s.tonnage,
      sunk: s.sunk,
      torpedoes: s.torpedoes,
      hull: s.hull,
      battery: s.battery,
      depth: app.i18n.t('depth.' + (s.depth === 'diving' || s.depth === 'surfacing' ? 'changing' : s.depth)),
      time: Math.ceil(s.timeLeft),
    }))
  },

  // F2 — the firing solution for whatever the periscope is on. This is the
  // accessible form of the lead you are supposed to judge by ear: it gives you
  // the numbers, not the answer, because you still have to slew to them.
  announceSolution: function () {
    const c = content.game.aimedContact()
    const aim = content.game.getAim()
    if (!c) {
      app.announce.polite(app.i18n.t('ann.noSolution', {bearing: this.bearingWord(aim)}))
      return
    }
    app.announce.polite(app.i18n.t('ann.solution', {
      type: app.i18n.t('type.' + c.type),
      bearing: this.bearingWord(c.bearing),
      range: Math.round(c.range),
      off: Math.round(Math.abs(c.offAim)),
      side: app.i18n.t(c.offAim < 0 ? 'dir.leftOf' : 'dir.rightOf'),
      lead: this.bearingWord(c.leadBearing),
      flight: c.flight.toFixed(1),
    }))
  },

  // F3 — everything the passive set can hear, nearest first.
  announceContacts: function () {
    const list = content.game.contactList()
    if (!list.length) {
      app.announce.polite(app.i18n.t('ann.noContacts'))
      return
    }
    const parts = list.slice(0, 5).map((c) => app.i18n.t('ann.contactItem', {
      type: app.i18n.t('type.' + c.type),
      bearing: this.bearingWord(c.bearing),
      range: Math.round(c.range),
    }))
    app.announce.polite(app.i18n.t('ann.contacts', {count: list.length}) + ' ' + parts.join('. '))
  },

  refreshHud: function () {
    if (!this.state.scoreEl) return
    const s = content.game.status()
    this.state.scoreEl.textContent = String(s.tonnage)
    if (this.state.torpEl) this.state.torpEl.textContent = String(s.torpedoes)
    if (this.state.hullEl) this.state.hullEl.textContent = String(s.hull)
    if (this.state.batteryEl) this.state.batteryEl.textContent = String(s.battery)
    if (this.state.depthEl) {
      this.state.depthEl.textContent = app.i18n.t(
        'depth.' + (s.depth === 'diving' || s.depth === 'surfacing' ? 'changing' : s.depth))
    }
    if (this.state.timeEl) this.state.timeEl.textContent = String(Math.ceil(s.timeLeft))
  },

  // Sonar viz (aria-hidden): contacts plotted on the forward arc by bearing
  // (left%) and range (bottom%), escorts marked, plus the periscope line.
  renderViz: function () {
    const el = this.state.sonarEl
    if (!el) return
    const list = content.game.contactList()
    const k = content.constants

    while (this.state.dotEls.length < list.length + 1) {
      const d = document.createElement('span')
      d.className = 'a-game--dot'
      el.appendChild(d)
      this.state.dotEls.push(d)
    }

    for (let i = 0; i < this.state.dotEls.length; i++) {
      const d = this.state.dotEls[i]
      if (i === 0) {
        // The periscope bearing.
        d.className = 'a-game--dot a-game--dot-aim'
        d.style.left = (50 + (content.game.getAim() / k.ARC_HALF) * 48) + '%'
        d.style.bottom = '4%'
        d.style.opacity = '1'
        d.removeAttribute('data-type')
        continue
      }
      const c = list[i - 1]
      if (!c) { d.style.opacity = '0'; continue }
      const lx = 50 + (c.bearing / k.ARC_HALF) * 48
      const by = 8 + Math.min(88, (c.range / k.DESPAWN_RANGE) * 88)
      d.className = 'a-game--dot' + (c.escort ? ' a-game--dot-escort' : '')
      d.style.left = k.clamp(lx, 0, 100) + '%'
      d.style.bottom = by + '%'
      d.style.opacity = String(0.3 + k.closeness(c.range) * 0.7)
      d.setAttribute('data-type', c.escort ? (c.hunting ? 'hunting' : 'escort') : 'merchant')
    }
  },
})
