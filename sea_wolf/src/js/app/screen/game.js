// SEA WOLF game screen. Real-time: each frame it reads the helm (rudder and
// periscope are HELD, throttle is held-and-ramps, everything else is an edge),
// advances the patrol, pumps the sea wash and your own motor voice, turns
// content events into binaural audio and screen-reader announcements, and
// lights an aria-hidden 360-degree plot.
//
// Two pieces of logic live here rather than in content, because both are about
// how sound is produced rather than what happened:
//   - active sonar: content.game emits one `ping` event carrying every return
//     with its own delay, and this screen plays each echo late by that delay,
//     which is how range is heard.
//   - the continuous voices: close-aboard screws and running torpedoes are
//     driven off the per-frame `frame` event.
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
    depthEl: null, timeEl: null, headingEl: null, speedEl: null,
    plotEl: null, dotEls: [],
    actionDown: {},
    entryFrames: 0,
    wired: false,
    wasReloading: false,
  },

  KEYS: {
    port:      ['ArrowLeft', 'KeyA', 'Numpad4'],
    starboard: ['ArrowRight', 'KeyD', 'Numpad6'],
    faster:    ['ArrowUp', 'KeyW', 'Numpad8'],
    slower:    ['ArrowDown', 'KeyS', 'Numpad2'],
    scopeLeft: ['KeyQ', 'Numpad7'],
    scopeRight:['KeyE', 'Numpad9'],
    scopeMid:  ['KeyR', 'Numpad5'],
    fine:      ['ShiftLeft', 'ShiftRight'],
    fire:      ['Space', 'Enter', 'NumpadEnter'],
    ping:      ['KeyP', 'Numpad0'],
    depth:     ['KeyX', 'KeyC', 'NumpadDecimal'],
  },
  PADS: {
    port:      [14],
    starboard: [15],
    faster:    [12],
    slower:    [13],
    scopeLeft: [4],
    scopeRight:[5],
    scopeMid:  [10],
    fine:      [6],
    fire:      [0, 7],
    ping:      [2],
    depth:     [1],
  },

  onReady: function () {
    const root = this.rootElement
    this.state.scoreEl = root.querySelector('.a-game--score-value')
    this.state.torpEl = root.querySelector('.a-game--torpedo-value')
    this.state.hullEl = root.querySelector('.a-game--hull-value')
    this.state.batteryEl = root.querySelector('.a-game--battery-value')
    this.state.depthEl = root.querySelector('.a-game--depth-value')
    this.state.timeEl = root.querySelector('.a-game--time-value')
    this.state.headingEl = root.querySelector('.a-game--heading-value')
    this.state.speedEl = root.querySelector('.a-game--speed-value')
    this.state.plotEl = root.querySelector('.a-game--plot')

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
      app.announce.assertive(t('ann.patrol'))
    })

    // --- passive sonar: the rate-coded beeps ---------------------------------
    content.events.on('beep', (e) => A().beep(e.local, e.range, e.escort, e.muffled))

    // --- per-frame continuous voices -----------------------------------------
    content.events.on('frame', (e) => {
      A().updateClose(e.close, e.depth !== 'periscope')
      A().updateRuns(e.torpedoes)
    })

    // --- active sonar --------------------------------------------------------
    // Each return is played late by its own round-trip delay. That delay is
    // the range; nothing else in the game tells you how far a ship is.
    content.events.on('ping', (e) => {
      A().pingOut()
      for (const r of e.returns) {
        A().later(() => A().echo(r.local, r.range, r.escort), r.delay * 1000)
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
      A().fire()
      self.rumble(0.7, 0.3, 180)
      self.refreshHud()
      app.announce.polite(t('ann.fired', {
        bearing: self.bearingWord(e.periscope), remaining: e.remaining,
      }))
    })
    content.events.on('torpedo-spent', (e) => A().torpedoSpent(e.local))
    content.events.on('hit', (e) => {
      A().hit(e.local, e.range, e.escort)
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
    content.events.on('escort-turn', (e) => A().escortTurn(e.local))
    content.events.on('charge-splash', (e) => {
      A().chargeSplash(e.local, content.constants.CHARGE_FALL_TIME)
      app.announce.assertive(t('ann.charges'))
    })
    content.events.on('charge-detonate', (e) => {
      A().chargeDetonate(e.local, e.proximity, e.deep)
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
      A().stopRuns()
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

      if (this.state.entryFrames > 0) {
        this.state.entryFrames--
        content.game.update(delta)
        this.renderPlot()
        return
      }

      // Helm. Rudder and periscope are held; throttle ramps while held.
      let rudder = 0
      if (this.held('port', k, gp)) rudder -= 1
      if (this.held('starboard', k, gp)) rudder += 1
      const ax = gp.getAxis ? gp.getAxis(0) : 0
      if (rudder === 0 && Math.abs(ax) > 0.3) rudder = ax < 0 ? -1 : 1
      content.game.setRudder(rudder)

      let thr = 0
      if (this.held('faster', k, gp)) thr += 1
      if (this.held('slower', k, gp)) thr -= 1
      const ay = gp.getAxis ? gp.getAxis(1) : 0
      if (thr === 0 && Math.abs(ay) > 0.3) thr = ay < 0 ? 1 : -1
      content.game.nudgeThrottle(thr, delta)

      let scope = 0
      if (this.held('scopeLeft', k, gp)) scope -= 1
      if (this.held('scopeRight', k, gp)) scope += 1
      const ax2 = gp.getAxis ? gp.getAxis(2) : 0
      if (scope === 0 && Math.abs(ax2) > 0.3) scope = ax2 < 0 ? -1 : 1
      content.game.setPeriscope(scope, this.held('fine', k, gp), delta)
      if (this.edge('scopeMid', this.held('scopeMid', k, gp))) content.game.centrePeriscope()

      if (this.edge('fire', this.held('fire', k, gp))) content.game.fire()
      if (this.edge('ping', this.held('ping', k, gp))) {
        if (!content.game.ping()) content.audio.fireBlocked('reload')
      }
      if (this.edge('depth', this.held('depth', k, gp))) content.game.toggleDepth()

      content.game.update(delta)

      const st = content.game.status()
      content.music.setIntensity(st.noise)
      content.music.update()
      content.audio.frame(delta, st)
      if (app.haptics && app.haptics.update) app.haptics.update(delta)

      // A tube coming ready is worth a click — it is the difference between a
      // shot and a wasted keypress.
      const reloading = st.reload > 0
      if (this.state.wasReloading && !reloading && st.torpedoes > 0) content.audio.reloaded()
      this.state.wasReloading = reloading

      if (this.edge('f1', k.is('F1'))) this.announceStatus()
      if (this.edge('f2', k.is('F2'))) this.announceSolution()
      if (this.edge('f3', k.is('F3'))) this.announceContacts()

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

  // Relative bearings, spoken the way a lookout would: "green four zero" is
  // clumsy for a screen reader, so plain words. The full circle needs astern.
  bearingWord: function (bearing) {
    const b = Math.round(content.constants.wrapDeg(bearing))
    const a = Math.abs(b)
    if (a < 5) return app.i18n.t('dir.ahead')
    if (a > 175) return app.i18n.t('dir.astern')
    return app.i18n.t(b < 0 ? 'dir.port' : 'dir.starboard', {deg: a})
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
      heading: Math.round((s.heading + 360) % 360),
      speed: s.speed.toFixed(1),
      time: Math.ceil(s.timeLeft),
    }))
  },

  // F2 — the firing solution for whatever the periscope is on. The accessible
  // form of the lead you are meant to judge by ear: it gives you the numbers,
  // not the answer, because you still have to steer onto them.
  announceSolution: function () {
    const c = content.game.aimedContact()
    const scope = content.game.getPeriscope()
    if (!c) {
      app.announce.polite(app.i18n.t('ann.noSolution', {bearing: this.bearingWord(scope)}))
      return
    }
    const key = c.leadReachable ? 'ann.solution' : 'ann.solutionTurn'
    app.announce.polite(app.i18n.t(key, {
      type: app.i18n.t('type.' + c.type),
      bearing: this.bearingWord(c.bearing),
      range: Math.round(c.range),
      off: Math.round(Math.abs(c.leadOffAim)),
      side: app.i18n.t(c.leadOffAim < 0 ? 'dir.leftOf' : 'dir.rightOf'),
      lead: this.bearingWord(c.leadBearing),
      flight: c.flight.toFixed(1),
    }))
  },

  // F3 — everything the passive set can hear, nearest first.
  announceContacts: function () {
    const list = content.game.contactList().filter((c) => c.audible)
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
    if (this.state.headingEl) this.state.headingEl.textContent = String(Math.round((s.heading + 360) % 360))
    if (this.state.speedEl) this.state.speedEl.textContent = s.speed.toFixed(1)
    if (this.state.timeEl) this.state.timeEl.textContent = String(Math.ceil(s.timeLeft))
  },

  // A 360-degree plot (aria-hidden): the boat at the centre facing up,
  // contacts placed by relative bearing and range, escorts marked, plus a
  // marker for the periscope bearing.
  renderPlot: function () {
    const el = this.state.plotEl
    if (!el) return
    const list = content.game.contactList()
    const k = content.constants
    const R = 46 // percent of the box the outer ring sits at

    while (this.state.dotEls.length < list.length + 1) {
      const d = document.createElement('span')
      d.className = 'a-game--dot'
      el.appendChild(d)
      this.state.dotEls.push(d)
    }

    for (let i = 0; i < this.state.dotEls.length; i++) {
      const d = this.state.dotEls[i]
      if (i === 0) {
        // The periscope bearing, on the outer ring.
        const a = content.game.getPeriscope() / k.DEG
        d.className = 'a-game--dot a-game--dot-scope'
        d.style.left = (50 + Math.sin(a) * R) + '%'
        d.style.top = (50 - Math.cos(a) * R) + '%'
        d.style.opacity = '1'
        d.removeAttribute('data-type')
        continue
      }
      const c = list[i - 1]
      if (!c) { d.style.opacity = '0'; continue }
      const a = c.bearing / k.DEG
      const r = Math.min(1, c.range / k.CONTACT_RANGE) * R
      d.className = 'a-game--dot' + (c.escort ? ' a-game--dot-escort' : '')
      d.style.left = (50 + Math.sin(a) * r) + '%'
      d.style.top = (50 - Math.cos(a) * r) + '%'
      d.style.opacity = String(c.audible ? 0.35 + k.closeness(c.range) * 0.65 : 0.15)
      d.setAttribute('data-type', c.escort ? (c.hunting ? 'hunting' : 'escort') : 'merchant')
    }
  },
})
