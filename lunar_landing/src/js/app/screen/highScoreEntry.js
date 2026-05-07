app.screen.highScoreEntry = app.screenManager.invent({
  id: 'highScoreEntry',
  parentSelector: '.a-app--highScoreEntry',
  rootSelector: '.a-highScoreEntry',
  transitions: {
    submit: function () { this.change('highscores') },
    cancel: function () { this.change('highscores') },
  },
  state: {
    nameInput: null,
    form: null,
  },
  onReady: function () {
    const root = this.rootElement
    this.state.nameInput = root.querySelector('.a-highScoreEntry--name')
    this.state.form = root.querySelector('.a-highScoreEntry--form')
    if (this.state.form) {
      this.state.form.addEventListener('submit', (e) => {
        e.preventDefault()
        const name = (this.state.nameInput.value || '').trim() || 'Pilot'
        app.highscores.add(name, content.scoring.state.score, content.missions.current())
        app.announce.polite(app.i18n.t('ann.scoreSaved'))
        app.screenManager.dispatch('submit')
      })
    }
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]')
      if (btn && btn.dataset.action === 'cancel') app.screenManager.dispatch('cancel')
    })
  },
  onEnter: function () {
    if (this.state.nameInput) this.state.nameInput.value = ''
    setTimeout(() => { if (this.state.nameInput) this.state.nameInput.focus() }, 200)
    app.announce.polite(app.i18n.t('ann.enterName', {score: content.scoring.state.score}))
  },
  onFrame: function () {
    const f = app.utility.focus.get(this.rootElement)
    if (f === this.state.nameInput) return
    const ui = app.controls.ui()
    if (ui.back) app.screenManager.dispatch('cancel')
  },
})
