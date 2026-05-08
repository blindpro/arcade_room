/**
 * ESCALADOR — game over screen.
 *
 * Shows the final score; if it qualifies for the high score table the
 * input is shown so the player can enter their name. Otherwise: just
 * Restart / Menu.
 */
app.screen.gameover = app.screenManager.invent({
  id: 'gameover',
  parentSelector: '.a-app--gameover',
  rootSelector: '.a-gameover',
  transitions: {
    restart: function () { this.change('game') },
    menu: function () { this.change('menu') },
  },
  state: {
    entryFrames: 0,
    info: null,
    submitted: false,
  },
  onReady: function () {
    const root = this.rootElement
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]')
      if (!btn) return
      this.commitName()
      app.screenManager.dispatch(btn.dataset.action)
    })
  },
  commitName: function () {
    if (this.state.submitted) return
    const root = this.rootElement
    const wrap = root.querySelector('.a-gameover--newhighscore')
    if (!wrap || wrap.hidden) return
    const input = root.querySelector('.a-gameover--name')
    const name = input && input.value ? input.value.trim() : ''
    const info = this.state.info
    if (!info) return
    if (app.highscores) app.highscores.add(name || 'Player', info.score, info.floor, info.building)
    this.state.submitted = true
  },
  onEnter: function () {
    this.state.entryFrames = 6
    this.state.submitted = false
    const root = this.rootElement
    // Prefer the info captured by the game screen at the moment of death;
    // fall back to a live snapshot for safety.
    const info = app._lastGameOverInfo || content.game.snapshot()
    this.state.info = info
    const summary = root.querySelector('.a-gameover--summary')
    if (summary) summary.textContent = app.i18n.t('gameover.summary', {floor: info.floor, score: info.score, building: info.building})
    const wrap = root.querySelector('.a-gameover--newhighscore')
    if (wrap) {
      const qualifies = app.highscores && app.highscores.qualifies(info.score)
      wrap.hidden = !qualifies
      if (qualifies) {
        const input = root.querySelector('.a-gameover--name')
        if (input) {
          input.value = ''
          // Don't auto-focus the input — the buttons are the primary
          // path; name entry is opt-in.
        }
      }
    }
    app.utility.focus.setWithin(this.rootElement)
    if (app.announce) {
      app.announce.assertive(app.i18n.t('gameover.title') + '. ' + app.i18n.t('gameover.summary', {floor: info.floor, score: info.score, building: info.building}))
    }
  },
  onFrame: function () {
    if (this.state.entryFrames > 0) {
      this.state.entryFrames--
      app.controls.ui()
      return
    }
    const ui = app.controls.ui()
    if (ui.up) app.utility.focus.setPreviousFocusable(this.rootElement)
    if (ui.down) app.utility.focus.setNextFocusable(this.rootElement)
    if (ui.enter || ui.space || ui.confirm) {
      const f = app.utility.focus.get(this.rootElement)
      if (f && f.tagName !== 'INPUT' && f.dataset.action) {
        this.commitName()
        app.screenManager.dispatch(f.dataset.action)
      }
    }
  },
})
