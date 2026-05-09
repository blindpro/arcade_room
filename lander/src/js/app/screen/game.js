app.screen.game = app.screenManager.invent({
  id: 'game',
  parentSelector: '.a-app--game',
  rootSelector: '.a-game',
  transitions: {
    pause: function () { this.change('menu') },
    gameover: function () { this.change('gameover') },
    back: function () { this.change('menu') },
  },
  state: {
    started: false,
  },
  onReady: function () {
    content.hud.init()
  },
  onEnter: function () {
    content.audio.start()
    if (!this.state.started || content.lander.state.dead) {
      content.game.startNewRun()
      this.state.started = true
      try { app.onlineScores.openSession().catch(() => {}) } catch (e) {}
    }
    app.utility.focus.set(this.rootElement)
  },
  onExit: function () {
    content.game.silence()
  },
  onFrame: function (e) {
    try {
      const dt = (e && e.delta) || 1 / 60
      content.game.update(dt)
      content.hud.frame()
      const ui = app.controls.ui()
      if (ui.pause || ui.back) {
        app.screenManager.dispatch('back')
      }
    } catch (err) { console.error(err) }
  },
  onReset: function () {
    this.state.started = false
  },
})
