// Gameover screen — final score, optional high-score entry, replay/menu
// buttons.
app.screen.gameover = app.screenManager.invent({
  id: 'gameover',
  parentSelector: '.a-app--gameover',
  rootSelector: '.a-gameover',
  transitions: {
    playAgain: function () { this.change('game') },
    menu:      function () { this.change('menu') },
    highscores: function () { this.change('highscores') },
  },
  state: {
    entryFrames: 0,
    score: 0,
    level: 1,
    saved: false,
  },
  onReady: function () {
    const root = this.rootElement
    this.state.el = {
      score:  root.querySelector('.a-gameover--score'),
      level:  root.querySelector('.a-gameover--level'),
      newRecord: root.querySelector('.a-gameover--newRecord'),
      nameForm:  root.querySelector('.a-gameover--nameForm'),
      nameInput: root.querySelector('.a-gameover--nameInput'),
    }
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]')
      if (!btn) return
      if (btn.dataset.action === 'save') this.saveScore()
      else app.screenManager.dispatch(btn.dataset.action)
    })
    root.addEventListener('submit', (e) => {
      e.preventDefault()
      this.saveScore()
    })
  },
  onEnter: function () {
    this.state.entryFrames = 6
    this.state.saved = false
    this.state.score = content.game.score()
    this.state.level = content.game.level()

    if (this.state.el.score) this.state.el.score.textContent = app.i18n.t('gameover.score', {n: this.state.score})
    if (this.state.el.level) this.state.el.level.textContent = app.i18n.t('gameover.level', {n: this.state.level})

    const qualifies = app.highscores.qualifies(this.state.score)
    if (this.state.el.newRecord) {
      this.state.el.newRecord.hidden = !qualifies
    }
    if (this.state.el.nameForm) {
      this.state.el.nameForm.hidden = !qualifies
    }
    app.announce.assertive(app.i18n.t('ann.gameover', {score: this.state.score}))
  },
  onFrame: function () {
    if (this.state.entryFrames > 0) {
      this.state.entryFrames--
      app.controls.ui()
      return
    }
    const ui = app.controls.ui()
    if (ui.back) app.screenManager.dispatch('menu')
  },
  saveScore: function () {
    if (this.state.saved) return
    const name = (this.state.el.nameInput && this.state.el.nameInput.value || 'Player').trim() || 'Player'
    app.highscores.add(name, this.state.score, this.state.level)
    this.state.saved = true
    if (this.state.el.nameForm) this.state.el.nameForm.hidden = true
    if (this.state.el.newRecord) this.state.el.newRecord.hidden = true
    app.announce.polite(app.i18n.t('gameover.saved'))
  },
})
