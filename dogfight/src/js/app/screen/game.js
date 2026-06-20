app.screen.game = app.screenManager.invent({
  id: 'game',
  parentSelector: '.a-app--game',
  rootSelector: '.a-game',
  transitions: {
    over: function (data) { this.change('gameOver', data) },
    quit: function () { this.change('menu') },
  },
  state: {
    aiOpponents: 0,
    pendingHud: 0,
  },
  onReady: function () {
    this.elHealth = this.rootElement.querySelector('.a-game--healthValue')
    this.elScore  = this.rootElement.querySelector('.a-game--scoreValue')
    this.elCars   = this.rootElement.querySelector('.a-game--carsValue')

    content.game.setOnRoundOver(({youWon, score, standings, selfId}) => {
      const data = app.storage.get('dogfight') || {}
      const best = Math.max(data.bestScore || 0, score)
      app.storage.set('dogfight', {...data, bestScore: best})

      app.screenManager.dispatch('over', {
        youWon,
        score,
        best,
        multiplayer: false,
        standings,
        selfId,
        mode: 'dogfight',
      })
    })

    window.addEventListener('keydown', (e) => {
      if (!content.game.isRunning() || content.game.isPaused()) return
      if (!app.screenManager.is('game')) return

      if (e.code === 'F1') {
        e.preventDefault()
        content.game.announceScore()
        return
      }
      if (e.code === 'F2') {
        e.preventDefault()
        content.game.announcePlanesLeft()
        return
      }
      if (e.code === 'F3') {
        e.preventDefault()
        content.game.announceTarget()
        return
      }
      if (e.code === 'F4') {
        e.preventDefault()
        content.game.announceHealth()
        return
      }
      if (e.code === 'KeyQ') {
        e.preventDefault()
        content.game.sweep()
        return
      }
      if (e.code === 'Space') {
        e.preventDefault()
        if (!e.repeat) content.game.fireGuns()
        return
      }
      if (e.code === 'KeyF') {
        e.preventDefault()
        if (!e.repeat) content.game.fireMissile()
      }
    })
  },
  onEnter: function (e = {}) {
    this.state.aiOpponents = e.aiOpponents || 0
    content.game.start({aiOpponents: this.state.aiOpponents})
    this.updateHud()
  },
  onExit: function () {
    content.game.end({silent: true})
  },
  onFrame: function () {
    if (!content.game.isRunning()) return

    const ui = app.controls.ui()
    if (ui.pause || ui.back) {
      content.sounds.uiBack()
      content.announcer.say(app.i18n.t('game.ended'), 'polite')
      app.screenManager.dispatch('quit')
      return
    }

    const game = app.controls.game()
    content.game.applyPlayerInput({
      throttle: game.x || 0,
      steering: game.rotate || 0,
    })

    const delta = engine.loop.delta()
    try {
      content.game.update(delta)
    } catch (e) {
      console.error(e)
    }
    app.haptics.update(delta * 1000)

    this.state.pendingHud += delta
    if (this.state.pendingHud > 0.1) {
      this.state.pendingHud = 0
      this.updateHud()
    }
  },
  updateHud: function () {
    const player = content.game.player()
    if (player) this.elHealth.textContent = String(Math.round(player.health))
    this.elScore.textContent = String(content.game.getScore())
    this.elCars.textContent = String(content.game.livingCount())
  },
})
