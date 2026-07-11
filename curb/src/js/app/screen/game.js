app.screen.game = app.screenManager.invent({
  id: 'game',
  parentSelector: '.a-app--game',
  rootSelector: '.a-game',
  transitions: {
    pause: function () { this.change('menu') },
    gameover: function () { this.change('gameover') },
  },
  state: {
    acc: 0,
    keydown: null,
    keyup: null,
    hud: null,
  },
  onReady: function () {
    this.state.hud = {
      score: this.rootElement.querySelector('.a-game--score'),
      level: this.rootElement.querySelector('.a-game--level'),
      best: this.rootElement.querySelector('.a-game--best'),
    }
  },
  onEnter: function () {
    content.audio.ready()
    content.game.loadBest()
    content.game.start()
    this.state.acc = 0

    const input = content.game.input
    input.up = false
    input.down = false

    // The game owns the keyboard while this screen is active: held arrows drive
    // the walker, Space speaks the score. Attach raw window listeners (a held
    // key must register every frame, which app.controls.ui() deltas don't give).
    this.state.keydown = (e) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { input.up = true; e.preventDefault() }
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { input.down = true; e.preventDefault() }
      else if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault() }
      else if (e.key === 'Escape') { e.preventDefault(); app.screenManager.dispatch('pause') }
    }
    this.state.keyup = (e) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { input.up = false }
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { input.down = false }
      else if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); content.game.speakScore() }
    }
    window.addEventListener('keydown', this.state.keydown)
    window.addEventListener('keyup', this.state.keyup)

    this.updateHud()
  },
  onExit: function () {
    if (this.state.keydown) window.removeEventListener('keydown', this.state.keydown)
    if (this.state.keyup) window.removeEventListener('keyup', this.state.keyup)
    this.state.keydown = this.state.keyup = null
    content.game.input.up = false
    content.game.input.down = false
    content.audio.silenceAll()
  },
  onFrame: function (e) {
    try {
      const FRAME_S = content.constants.FRAME_MS / 1000
      let acc = this.state.acc + (e && e.delta ? e.delta : FRAME_S)
      if (acc > FRAME_S * 5) acc = FRAME_S * 5 // clamp after a stall
      while (acc >= FRAME_S) {
        content.game.tick()
        acc -= FRAME_S
      }
      this.state.acc = acc

      this.updateHud()

      if (content.game.phase === 'gameover') {
        app.screenManager.dispatch('gameover')
      }
    } catch (err) { console.error(err) }
  },
  updateHud: function () {
    const hud = this.state.hud
    if (!hud) return
    const v = content.game.view
    if (hud.score) hud.score.textContent = String(v.score)
    if (hud.level) hud.level.textContent = String(v.level)
    if (hud.best) hud.best.textContent = String(v.best)
  },
})
