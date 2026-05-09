app.screen.gameover = app.screenManager.invent({
  id: 'gameover',
  parentSelector: '.a-app--gameover',
  rootSelector: '.a-gameover',
  transitions: {
    save: function () {},
    retry: function () { this.change('game') },
    menu: function () { this.change('splash') },
    language: function () { this.change('language') },
  },
  state: {
    entryFrames: 0,
    nameInput: null,
    statusEl: null,
    linkEl: null,
    saved: false,
    posting: false,
    snapshot: null,
  },
  onReady: function () {
    const root = this.rootElement
    this.state.nameInput = root.querySelector('.a-gameover--name-input')
    this.state.statusEl = root.querySelector('.a-gameover--online-status')
    this.state.linkEl = root.querySelector('.a-gameover--online-link')
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]')
      if (!btn) return
      const a = btn.dataset.action
      if (a === 'save') this.handleSave()
      else app.screenManager.dispatch(a)
    })
  },
  onEnter: function () {
    this.state.entryFrames = 10
    this.state.saved = false
    this.state.posting = false
    const root = this.rootElement
    const score = content.game.score()
    const level = content.game.level()
    this.state.snapshot = {score, level}
    const high = app.highscores.get()
    const wouldBeNew = score > high.score

    const scoreEl = root.querySelector('.a-gameover--score')
    if (scoreEl) scoreEl.textContent = app.i18n.t('gameover.scoreLine', {score, level})

    const highEl = root.querySelector('.a-gameover--high')
    if (highEl) {
      const refScore = wouldBeNew ? score : high.score
      if (wouldBeNew) {
        highEl.textContent = app.i18n.t('gameover.highScoreNew') + ' ' + app.i18n.t('gameover.highScoreLine', {score: refScore})
      } else {
        highEl.textContent = app.i18n.t('gameover.highScoreLine', {score: refScore})
      }
    }

    if (this.state.nameInput) this.state.nameInput.value = ''
    if (this.state.statusEl) { this.state.statusEl.hidden = true; this.state.statusEl.textContent = '' }
    if (this.state.linkEl) { this.state.linkEl.hidden = true }

    // Tear down audio voices so the menu is silent.
    try { content.game.tearDown() } catch (_) {}

    // Live announce so screen readers get the result on top of the game-over sting.
    setTimeout(() => {
      app.announce.urgent(app.i18n.t('gameover.scoreLine', {score, level}))
    }, 200)
  },
  onFrame: function () {
    if (this.state.entryFrames > 0) {
      this.state.entryFrames--
      app.controls.ui()
      return
    }
    if (document.activeElement === this.state.nameInput) {
      app.controls.ui()
      return
    }
    const ui = app.controls.ui()
    if (ui.back) {
      app.screenManager.dispatch('menu')
    }
  },
  handleSave: function () {
    if (this.state.saved || this.state.posting) return
    const s = this.state.snapshot || {score: content.game.score(), level: content.game.level()}
    const raw = (this.state.nameInput && this.state.nameInput.value || '').trim()
    if (!raw) {
      app.announce.urgent(app.i18n.t('gameover.nameRequired'))
      if (this.state.nameInput) {
        try { this.state.nameInput.focus() } catch (e) {}
      }
      return
    }
    const name = raw
    // Local save: single best record.
    try { app.highscores.submit(s.score, s.level) } catch (e) {}
    this.state.saved = true
    this.state.posting = true
    Promise.resolve(app.onlineSubmit.run({
      name: name,
      score: s.score,
      meta: {level: s.level},
      statusEl: this.state.statusEl,
      linkEl: this.state.linkEl,
    })).then(() => { this.state.posting = false })
      .catch(() => { this.state.posting = false })
  },
})
