app.screen.game = app.screenManager.invent({
  id: 'game',
  parentSelector: '.a-app--game',
  rootSelector: '.a-game',
  transitions: {
    pause:    function () { this.change('pause') },
    gameOver: function () { this.change('gameover') },
    menu:     function () { this.change('menu') },
  },
  state: {
    scoreEl: null,
    waveEl: null,
    citiesEl: null,
    ammoEl: null,
    fKey: {F1: false, F2: false, F3: false, F4: false},
    fireKey: {KeyA: false, KeyS: false, KeyD: false, Space: false},
    pauseKey: false,
    helpKey: false,
  },
  onReady: function () {
    const root = this.rootElement
    this.state.scoreEl  = root.querySelector('.a-game--score-value')
    this.state.waveEl   = root.querySelector('.a-game--wave-value')
    this.state.citiesEl = root.querySelector('.a-game--cities-value')
    this.state.ammoEl   = root.querySelector('.a-game--ammo-value')
    this.refreshHud()

    window.addEventListener('keydown', (e) => {
      if (e.key === 'F1' || e.key === 'F2' || e.key === 'F3' || e.key === 'F4' || e.key === 'F5') {
        if (app.screenManager.is('game')) e.preventDefault()
      }
    }, true)

    content.events.on('score-change', () => this.refreshHud())
    content.events.on('wave-start', (e) => {
      this.refreshHud()
      app.announce.polite(app.i18n.tPool('ann.waveStart', {n: e.wave}))
    })
    content.events.on('wave-clear', (e) => {
      app.announce.assertive(app.i18n.tPool('ann.waveClear', {n: e.wave, bonus: e.bonus}))
    })
    content.events.on('city-lost', (e) => {
      app.announce.assertive(app.i18n.tPool('ann.cityLost', {city: app.i18n.t(e.nameKey)}))
      this.refreshHud()
    })
    content.events.on('city-restored', (e) => {
      app.announce.assertive(app.i18n.tPool('ann.bonusCity', {city: app.i18n.t(e.nameKey)}))
      this.refreshHud()
    })
    content.events.on('battery-depleted', (e) => {
      app.announce.polite(app.i18n.tPool('ann.depleted', {battery: app.i18n.t(e.labelKey)}))
      this.refreshHud()
      if (content.batteries.totalAmmo() === 0) {
        app.announce.assertive(app.i18n.t('ann.allDepleted'))
      }
    })
    content.events.on('battery-fire', () => this.refreshHud())
    content.events.on('game-over', (e) => {
      setTimeout(() => app.screenManager.dispatch('gameOver'), 1600)
      app.announce.assertive(app.i18n.t('ann.gameOver', {score: e.score, wave: e.wave}))
    })
  },
  onEnter: function () {
    content.audio.start()
    content.audio.setStaticListener(content.world.LISTENER_YAW)
    content.batteries.init()
    this.refreshHud()
    try { app.onlineScores.openSession().catch(() => {}) } catch (e) {}
    app.announce.polite(app.i18n.t('ann.score', {
      score: content.state.score,
      wave: content.state.wave,
      cities: content.cities.aliveCount(),
    }))
    this.state.fKey = {F1: false, F2: false, F3: false, F4: false}
    this.state.fireKey = {KeyA: false, KeyS: false, KeyD: false, Space: false}
    this.state.pauseKey = false
    this.state.helpKey = false
  },
  onExit: function () {
    content.batteries.silenceAll()
    if (content.audio && content.audio.silenceAll) content.audio.silenceAll()
    content.threats.clearAll()
    content.outgoing.clear()
    content.blasts.clear()
  },
  onFrame: function (e) {
    try {
      if (content.game.isPaused()) return

      const k = engine.input.keyboard

      this._fEdge('F1', k.is('F1'), () => this.announceScore())
      this._fEdge('F2', k.is('F2'), () => this.announceCities())
      this._fEdge('F3', k.is('F3'), () => this.announceAmmo())
      this._fEdge('F4', k.is('F4'), () => this.announceWave())

      // Battery fire: A = left (0), S = center (1), D = right (2)
      this._fireEdge('KeyA', k.is('KeyA'), 0)
      this._fireEdge('KeyS', k.is('KeyS'), 1)
      this._fireEdge('KeyD', k.is('KeyD'), 2)
      // Space -> center battery (index 1)
      const spaceDown = k.is('Space')
      if (spaceDown && !this.state.fireKey.Space) {
        const idx = 1
        const b = content.batteries.get(idx)
        if (b && b.ammo > 0) this._fireBattery(idx)
        else content.audio.emitDepletion()
      }
      this.state.fireKey.Space = spaceDown

      const pDown = k.is('KeyP')
      if (pDown && !this.state.pauseKey) {
        this.state.pauseKey = true
        content.game.setPaused(true)
        app.screenManager.dispatch('pause')
        return
      }
      if (!pDown) this.state.pauseKey = false

      const ui = app.controls.ui()
      if (ui.pause || ui.back) {
        content.game.setPaused(true)
        app.screenManager.dispatch('pause')
        return
      }

      const delta = (e && e.delta) || 1/60
      content.game.update(delta)
      content.audio.frameCities()
      this.refreshHud()
    } catch (err) {
      console.error(err)
    }
  },
  _fEdge: function (key, isDown, cb) {
    if (isDown && !this.state.fKey[key]) cb()
    this.state.fKey[key] = isDown
  },
  _fireEdge: function (key, isDown, batteryIndex) {
    if (isDown && !this.state.fireKey[key]) this._fireBattery(batteryIndex)
    this.state.fireKey[key] = isDown
  },
  _fireBattery: function (i) {
    const fired = content.batteries.fire(i)
    if (!fired) {
      const b = content.batteries.get(i)
      if (b && b.ammo === 0) content.audio.emitDepletion()
    }
  },
  refreshHud: function () {
    if (!this.state.scoreEl) return
    this.state.scoreEl.textContent  = String(content.state.score)
    this.state.waveEl.textContent   = String(Math.max(1, content.state.wave))
    this.state.citiesEl.textContent = String(content.cities.aliveCount())
    const bs = content.batteries.getAll()
    const a = bs.map((b) => b.ammo).join('/')
    this.state.ammoEl.textContent = a
  },
  announceScore: function () {
    app.announce.polite(app.i18n.t('ann.score', {
      score: content.state.score,
      wave: Math.max(1, content.state.wave),
      cities: content.cities.aliveCount(),
    }))
  },
  announceCities: function () {
    const alive = content.cities.aliveList()
    if (!alive.length) {
      app.announce.polite(app.i18n.t('ann.citiesNone'))
      return
    }
    const list = alive.map((c) => app.i18n.t(c.nameKey)).join(', ')
    app.announce.polite(app.i18n.t('ann.cities', {list}))
  },
  announceAmmo: function () {
    const bs = content.batteries.getAll()
    app.announce.polite(app.i18n.t('ann.ammo', {l: bs[0].ammo, c: bs[1].ammo, r: bs[2].ammo}))
  },
  announceWave: function () {
    app.announce.polite(app.i18n.t('ann.waveStat', {
      wave: Math.max(1, content.state.wave),
      remaining: content.wave.remaining(),
    }))
  },
})
