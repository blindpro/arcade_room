app.screen.game = app.screenManager.invent({
  id: 'game',
  parentSelector: '.a-app--game',
  rootSelector: '.a-game',
  transitions: {
    pause: function () { this.change('pause') },
    gameOver: function (payload) {
      // Stash the payload so `gameover` screen can read it on enter.
      app.screen.gameover._lastPayload = payload || {}
      this.change('gameover')
    },
    readyNext: function () { this.change('ready') },
  },
  state: {
    scoreEl: null,
    livesEl: null,
    roomEl: null,
    robotsEl: null,
    bannerEl: null,
    keyEdge: {},
  },
  onReady: function () {
    const root = this.rootElement
    this.state.scoreEl = root.querySelector('.a-game--score-value')
    this.state.livesEl = root.querySelector('.a-game--lives-value')
    this.state.roomEl = root.querySelector('.a-game--room-value')
    this.state.robotsEl = root.querySelector('.a-game--robots-value')
    this.state.bannerEl = root.querySelector('.a-game--banner')

    // Eat F1/F3/F5 (browser Help/Find/Reload) globally so the game's
    // announcement keys actually fire. Don't bind F11 — let users fullscreen.
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F1' || e.key === 'F3' || e.key === 'F5') e.preventDefault()
      if (e.key === 'F2' || e.key === 'F4') {
        // F2/F4 don't have browser conflicts on most setups but pre-empt anyway
        e.preventDefault()
      }
    }, true)
  },
  onEnter: function () {
    content.audio.start()
    this.refreshHud()
    this.state.keyEdge = {}
  },
  onExit: function () {
    if (content.audio && content.audio.silenceAll) content.audio.silenceAll()
  },
  onFrame: function (e) {
    try {
      if (content.game.state.paused) return

      const dt = (e && e.delta) || 1 / 60
      const ui = app.controls.ui()
      if (ui.pause || ui.back) {
        content.game.pause()
        app.screenManager.dispatch('pause')
        return
      }

      // Status hotkeys F1–F4. Edge-detected so a held key doesn't spam.
      const k = engine.input.keyboard
      const edge = (key) => {
        const isDown = k.is(key)
        const wasDown = !!this.state.keyEdge[key]
        this.state.keyEdge[key] = isDown
        return isDown && !wasDown
      }
      if (edge('F1')) app.announce.polite(app.i18n.t('ann.score', {score: content.game.getScore()}))
      if (edge('F2')) app.announce.polite(app.i18n.t('ann.lives', {lives: content.game.getLives()}))
      if (edge('F3')) app.announce.polite(app.i18n.t('ann.room', {n: content.game.getRoom()}))
      if (edge('F4')) {
        const n = content.robots.aliveCount()
        const otto = content.otto.isAlive()
        const debug = !!(content.game && content.game.state && content.game.state.debugEmpty)
        // F4 has two modes:
        //  - while combat is happening (robots alive and not in debug):
        //    announce robot count + Otto presence.
        //  - in a cleared room or in debug-empty mode: announce the gap
        //    distances so the player can navigate to an exit by ear.
        if (n === 0 || debug) {
          app.announce.polite(this.formatGapDistances(otto && !debug))
        } else if (otto) {
          app.announce.polite(app.i18n.t('ann.robotsAndOtto', {n}))
        } else {
          app.announce.polite(app.i18n.t('ann.robots', {n}))
        }
      }

      content.game.tick(dt)
      content.audio.frame()
      this.refreshHud()
    } catch (err) { console.error(err) }
  },
  // Build a polite-announce string describing how to walk to each exit
  // gap from the player's current position. Format per gap:
  //   "<Cardinal> gap: <N> steps <forwardDir>, <M> steps <lateralDir>"
  // The lateral phrase is dropped when the player is already aligned with
  // the 2-tile gap window.
  formatGapDistances: function (ottoIsHere) {
    if (!content.room || !content.player) return app.i18n.t('ann.noRobots')
    const exits = content.room.exits()
    if (!exits) return app.i18n.t('ann.noRobots')
    const p = content.player.getPosition()
    const dirs = ['N', 'E', 'S', 'W']
    const parts = []
    // Gaps are 3 tiles wide; player half-width ≈ 0.34. The safe alignment
    // window is |lateralRaw| < 1.5 - 0.34 = 1.16. We use 1.0 (conservative)
    // and check the UNROUNDED offset — rounding before the threshold check
    // would let an offset of 1.4 round down to 1 and falsely report
    // "lined up" while the player was outside the gap.
    const ALIGN_THRESHOLD = 1.0
    for (const dir of dirs) {
      const c = content.room.exitCenter(dir)
      if (!c) continue
      const dxRaw = c.x - p.x
      const dyRaw = c.y - p.y
      let forwardRaw, forwardDirKey, lateralRaw, lateralDirKey
      if (dir === 'N' || dir === 'S') {
        forwardRaw = Math.abs(dyRaw)
        forwardDirKey = (dir === 'N') ? 'ann.dir.north' : 'ann.dir.south'
        lateralRaw = dxRaw
        lateralDirKey = (lateralRaw >= 0) ? 'ann.dir.east' : 'ann.dir.west'
      } else {
        forwardRaw = Math.abs(dxRaw)
        forwardDirKey = (dir === 'E') ? 'ann.dir.east' : 'ann.dir.west'
        lateralRaw = dyRaw
        lateralDirKey = (lateralRaw >= 0) ? 'ann.dir.south' : 'ann.dir.north'
      }
      const header = app.i18n.t('ann.gap.' + dir)
      const forward = Math.max(0, Math.round(forwardRaw))
      if (Math.abs(lateralRaw) < ALIGN_THRESHOLD) {
        parts.push(app.i18n.t('ann.gap.itemAligned', {
          header,
          forward,
          forwardDir: app.i18n.t(forwardDirKey),
        }))
      } else {
        // Round AWAY from zero so an offset of 1.4 reports as 2 — better
        // to slightly overshoot the announced step count than to walk into
        // a wall that hasn't been crossed yet.
        const lateral = Math.max(1, Math.ceil(Math.abs(lateralRaw)))
        parts.push(app.i18n.t('ann.gap.item', {
          header,
          forward,
          forwardDir: app.i18n.t(forwardDirKey),
          lateral,
          lateralDir: app.i18n.t(lateralDirKey),
        }))
      }
    }
    const body = parts.join(' ')
    return ottoIsHere ? app.i18n.t('ann.gap.withOtto', {body}) : body
  },
  refreshHud: function () {
    if (!this.state.scoreEl) return
    this.state.scoreEl.textContent = String(content.game.getScore())
    this.state.livesEl.textContent = String(Math.max(0, content.game.getLives()))
    this.state.roomEl.textContent = String(content.game.getRoom())
    this.state.robotsEl.textContent = String(content.robots.aliveCount())
  },
})
