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
    mode: 'ffa',
    pendingHud: 0,
  },
  onReady: function () {
    this.elHealth = this.rootElement.querySelector('.a-game--healthValue')
    this.elScore  = this.rootElement.querySelector('.a-game--scoreValue')
    this.elCars   = this.rootElement.querySelector('.a-game--carsValue')
    this.elRound  = this.rootElement.querySelector('.a-game--roundValue')
    this.elTeamScore = this.rootElement.querySelector('.a-game--teamScore')

    content.game.setOnRoundOver((data) => {
      if (data.mode === 'teamDm') {
        if (data.matchOver) {
          const store = app.storage.get('dogfight') || {}
          const best = Math.max(store.bestScore || 0, data.score || 0)
          app.storage.set('dogfight', {...store, bestScore: best})
          app.screenManager.dispatch('over', {
            youWon: data.youWon,
            score: data.score,
            best,
            multiplayer: false,
            standings: data.standings,
            selfId: data.selfId,
            mode: 'teamDm',
            playerRoundWins: data.playerRoundWins,
            enemyRoundWins: data.enemyRoundWins,
          })
        } else {
          const t = app.i18n.t
          const msg = data.youWon
            ? t('ann.roundTeamWon')
            : t('ann.roundTeamLost')
          content.announcer.say(msg + '. ' + t('ann.roundTeamN', {round: data.playerRoundWins + data.enemyRoundWins + 1}), 'assertive')
          setTimeout(() => {
            content.game.nextRound()
          }, 2500)
        }
        return
      }

      const store = app.storage.get('dogfight') || {}
      const best = Math.max(store.bestScore || 0, data.score || 0)
      app.storage.set('dogfight', {...store, bestScore: best})

      app.screenManager.dispatch('over', {
        youWon: data.youWon,
        score: data.score,
        best,
        multiplayer: false,
        standings: data.standings,
        selfId: data.selfId,
        mode: 'dogfight',
      })
    })

    window.addEventListener('keyup', (e) => {
      if (!content.game.isRunning() || content.game.isPaused()) return
      if (!app.screenManager.is('game')) return
      if (e.code === 'Space') {
        e.preventDefault()
        content.game.stopGuns()
      }
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
        content.game.startGuns()
        return
      }
      if (e.code === 'KeyF') {
        e.preventDefault()
        if (!e.repeat) content.game.fireMissile()
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        e.preventDefault()
        if (!e.repeat) content.game.activateBoost()
      }
    })
  },
  onEnter: function (e = {}) {
    this.state.aiOpponents = e.aiOpponents || 0
    this.state.mode = e.mode || 'ffa'
    const hud = this.rootElement.querySelector('.a-game--hud')
    if (this.state.mode === 'teamDm') {
      content.game.resetMatch()
      hud.classList.add('a-game--hud-team')
    } else {
      hud.classList.remove('a-game--hud-team')
    }
    content.game.start({aiOpponents: this.state.aiOpponents, mode: this.state.mode})
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
    const match = content.game.getMatchState()
    if (match.mode === 'teamDm') {
      this.elRound.textContent = String(match.currentRound)
      this.elTeamScore.textContent = match.playerRoundWins + ' - ' + match.enemyRoundWins
    }
  },
})
