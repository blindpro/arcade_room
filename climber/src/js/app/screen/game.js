/**
 * ESCALADOR — game screen.
 *
 * Wires window-level keydown for the four climber keys (A/Z/K/M), since
 * those don't fit the app.controls game-mapping shape (which is built around
 * directional axes). Also wires F1–F4 status hotkeys, Escape to pause,
 * and updates the HUD + announcer from content.game state every frame.
 */
app.screen.game = app.screenManager.invent({
  id: 'game',
  parentSelector: '.a-app--game',
  rootSelector: '.a-game',
  transitions: {
    pause: function () { /* in-place: handled in onFrame */ },
    gameover: function () { this.change('gameover') },
  },
  state: {
    entryFrames: 0,
    paused: false,
    keyHandler: null,
    statusHandler: null,
    pendingGameOver: false,
    pendingClear: false,
    lastFloorAnnounced: -1,
    lastBuildingAnnounced: 0,
  },

  onReady: function () {
    // Cache HUD elements (created in onEnter / never yet).
  },

  onEnter: function () {
    this.state.entryFrames = 6
    this.state.paused = false
    this.state.pendingGameOver = false
    this.state.pendingClear = false
    this.state.lastFloorAnnounced = -1
    this.state.lastBuildingAnnounced = 1
    app.utility.focus.setWithin(this.rootElement)
    if (app.announce) { app.announce.clear() }

    content.game.start()
    content.game.setCallbacks({
      onLifeLost: (info) => this.handleLifeLost(info),
      onGameOver: (info) => this.handleGameOver(info),
      onBuildingClear: (info) => this.handleBuildingClear(info),
    })

    // Window-level keydown for A/Z/K/M and F1–F4 / Escape. Capture phase
    // so we can preventDefault on F1/F3 (Help/Find).
    const onKey = (e) => {
      // F1–F4 status hotkeys
      if (e.code === 'F1' || e.code === 'F2' || e.code === 'F3' || e.code === 'F4') {
        e.preventDefault()
        if (e.type !== 'keydown') return
        this.readStatus(e.code)
        return
      }
      // F5 = reload prevention so the player doesn't accidentally reload
      // the page during a fast hand-grab. F11 (fullscreen) we leave alone.
      if (e.code === 'F5') {
        e.preventDefault()
        return
      }
      if (e.type !== 'keydown') return
      // Pause / quit
      if (e.code === 'Escape' || e.code === 'Backspace') {
        e.preventDefault()
        this.togglePause()
        return
      }
      if (this.state.paused) return
      // Climbing keys
      switch (e.code) {
        case 'KeyA':
          e.preventDefault()
          content.game.press('left', 'up')
          break
        case 'KeyZ':
          e.preventDefault()
          content.game.press('left', 'down')
          break
        case 'KeyK':
          e.preventDefault()
          content.game.press('right', 'up')
          break
        case 'KeyM':
          e.preventDefault()
          content.game.press('right', 'down')
          break
      }
    }
    this.state.keyHandler = onKey
    window.addEventListener('keydown', onKey, true)

    // Resume the loop while we're playing
    if (engine.loop.isPaused()) engine.loop.resume()

    // Initial announce
    if (app.announce) app.announce.assertive(app.i18n.t('game.ready'))
  },

  onExit: function () {
    if (this.state.keyHandler) {
      window.removeEventListener('keydown', this.state.keyHandler, true)
      this.state.keyHandler = null
    }
    content.game.stop()
    engine.loop.pause()
  },

  togglePause: function () {
    this.state.paused = !this.state.paused
    if (this.state.paused) {
      content.audio.enqueue({type: 'pause', resume: false})
      if (app.announce) app.announce.assertive(app.i18n.t('game.paused'))
    } else {
      content.audio.enqueue({type: 'pause', resume: true})
      if (app.announce) app.announce.assertive(app.i18n.t('game.resumed'))
    }
  },

  readStatus: function (code) {
    if (!app.announce) return
    const s = content.game.snapshot()
    const t = app.i18n.t.bind(app.i18n)
    if (code === 'F1') {
      app.announce.assertive(t('game.statusFloor', {n: s.floor, goal: s.goal}))
    } else if (code === 'F2') {
      app.announce.assertive(t('game.statusScore', {score: s.score}))
    } else if (code === 'F3') {
      app.announce.assertive(t('game.statusLives', {n: s.lives}))
    } else if (code === 'F4') {
      app.announce.assertive(t('game.statusHands', {l: s.player.left.floor, r: s.player.right.floor}))
    }
  },

  handleLifeLost: function (info) {
    if (!app.announce) return
    const t = app.i18n.t.bind(app.i18n)
    const sideStr = info && info.side ? t('game.' + info.side) : ''
    const reason = info && info.reasonKey ? t(info.reasonKey, {side: sideStr}) : t('game.deathFell')
    app.announce.assertive(reason)
  },

  handleGameOver: function (info) {
    this.state.pendingGameOver = true
    this.state.gameOverInfo = info
    // Stash on a module-level slot so the gameover screen can read it
    // after this screen has exited and content.game has been stopped.
    app._lastGameOverInfo = info
    setTimeout(() => app.screenManager.dispatch('gameover'), 3500)
  },

  handleBuildingClear: function (info) {
    if (!app.announce) return
    const t = app.i18n.t.bind(app.i18n)
    app.announce.assertive(t('game.buildingClear', {bonus: info.bonus}))
  },

  updateHud: function (s) {
    const root = this.rootElement
    const t = app.i18n.t.bind(app.i18n)
    const floorEl = root.querySelector('.a-game--floor')
    const scoreEl = root.querySelector('.a-game--score')
    const livesEl = root.querySelector('.a-game--lives')
    if (floorEl) floorEl.textContent = t('game.floor', {n: s.floor})
    if (scoreEl) scoreEl.textContent = t('game.score', {score: s.score})
    if (livesEl) livesEl.textContent = t('game.lives', {n: s.lives})
  },

  onFrame: function (e) {
    try {
      if (this.state.entryFrames > 0) {
        this.state.entryFrames--
        return
      }
      if (this.state.paused) return
      // dt from the syngen loop, clamped to avoid huge dt after a tab
      // visibility change (which would otherwise spawn a flood of pots
      // / closing windows in one tick).
      const dt = Math.min(0.05, (e && e.delta) || 1 / 60)
      content.game.tick(dt)
      content.audio.drain()

      const s = content.game.snapshot()
      this.updateHud(s)

      // Polite floor-crossed announce (every 10 floors so it's not spammy)
      if (s.floor > this.state.lastFloorAnnounced && s.floor % 10 === 0) {
        if (app.announce) app.announce.polite(app.i18n.t('game.climb', {n: s.floor}))
        this.state.lastFloorAnnounced = s.floor
      }
      // Building advance announce
      if (s.building !== this.state.lastBuildingAnnounced) {
        if (app.announce) app.announce.assertive(app.i18n.t('game.nextBuilding', {n: s.building}))
        this.state.lastBuildingAnnounced = s.building
      }
    } catch (e) { console.error(e) }
  },
})
