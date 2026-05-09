// Gameover screen — final score, name entry, replay/menu buttons. Save
// stays on this screen so the player sees the online rank.
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
    posting: false,
    statusEl: null,
    linkEl: null,
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
    this.state.statusEl = root.querySelector('.a-gameover--online-status')
    this.state.linkEl = root.querySelector('.a-gameover--online-link')
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
    this.state.posting = false
    this.state.score = content.game.score()
    this.state.level = content.game.level()

    if (this.state.el.score) this.state.el.score.textContent = app.i18n.t('gameover.score', {n: this.state.score})
    if (this.state.el.level) this.state.el.level.textContent = app.i18n.t('gameover.level', {n: this.state.level})

    const qualifies = app.highscores.qualifies(this.state.score)
    if (this.state.el.newRecord) {
      this.state.el.newRecord.hidden = !qualifies
    }
    // Always show the name form so online submission is reachable even when
    // the score doesn't qualify for the local top-10.
    if (this.state.el.nameForm) {
      this.state.el.nameForm.hidden = false
    }
    if (this.state.el.nameInput) this.state.el.nameInput.value = ''
    if (this.state.statusEl) {
      this.state.statusEl.hidden = true
      this.state.statusEl.textContent = ''
    }
    if (this.state.linkEl) this.state.linkEl.hidden = true
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
    if (this.state.saved || this.state.posting) return
    const raw = (this.state.el.nameInput && this.state.el.nameInput.value || '').trim()
    if (!raw) {
      app.announce.assertive(app.i18n.t('gameover.nameRequired'))
      if (this.state.el.nameInput) {
        try { this.state.el.nameInput.focus() } catch (e) {}
      }
      return
    }
    const name = raw
    if (app.highscores.qualifies(this.state.score)) {
      app.highscores.add(name, this.state.score, this.state.level)
    }
    this.state.saved = true
    this.state.posting = true
    app.announce.polite(app.i18n.t('gameover.saved'))
    Promise.resolve(app.onlineSubmit.run({
      name: name,
      score: this.state.score,
      meta: {level: this.state.level},
      statusEl: this.state.statusEl,
      linkEl: this.state.linkEl,
    })).then(() => { this.state.posting = false })
      .catch(() => { this.state.posting = false })
  },
})
