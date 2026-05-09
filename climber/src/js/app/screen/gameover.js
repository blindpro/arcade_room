/**
 * CRAZY CLIMBER — game over screen.
 *
 * Save flow stays on this screen so the player can read the online rank
 * inline. Local save runs only when the score qualifies for the top-10;
 * the online submission always runs once the player has typed a name.
 */
app.screen.gameover = app.screenManager.invent({
  id: 'gameover',
  parentSelector: '.a-app--gameover',
  rootSelector: '.a-gameover',
  transitions: {
    save: function () {},
    restart: function () { this.change('game') },
    menu: function () { this.change('menu') },
  },
  state: {
    entryFrames: 0,
    info: null,
    saved: false,
    posting: false,
    nameInput: null,
    statusEl: null,
    linkEl: null,
  },
  onReady: function () {
    const root = this.rootElement
    this.state.nameInput = root.querySelector('.a-gameover--name')
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
    this.state.entryFrames = 6
    this.state.saved = false
    this.state.posting = false
    const root = this.rootElement
    // Prefer the info captured by the game screen at the moment of death;
    // fall back to a live snapshot for safety.
    const info = app._lastGameOverInfo || content.game.snapshot()
    this.state.info = info
    const summary = root.querySelector('.a-gameover--summary')
    if (summary) summary.textContent = app.i18n.t('gameover.summary', {floor: info.floor, score: info.score, building: info.building})

    if (this.state.nameInput) this.state.nameInput.value = ''
    if (this.state.statusEl) {
      this.state.statusEl.hidden = true
      this.state.statusEl.textContent = ''
    }
    if (this.state.linkEl) this.state.linkEl.hidden = true

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
    if (document.activeElement === this.state.nameInput) return
    const ui = app.controls.ui()
    if (ui.up) app.utility.focus.setPreviousFocusable(this.rootElement)
    if (ui.down) app.utility.focus.setNextFocusable(this.rootElement)
    if (ui.enter || ui.space || ui.confirm) {
      const f = app.utility.focus.get(this.rootElement)
      if (f && f.tagName !== 'INPUT' && f.dataset.action) {
        if (f.dataset.action === 'save') this.handleSave()
        else app.screenManager.dispatch(f.dataset.action)
      }
    }
  },
  handleSave: function () {
    if (this.state.saved || this.state.posting) return
    const info = this.state.info
    if (!info) return
    const raw = (this.state.nameInput && this.state.nameInput.value || '').trim()
    if (!raw) {
      if (app.announce) app.announce.assertive(app.i18n.t('gameover.nameRequired'))
      if (this.state.nameInput) {
        try { this.state.nameInput.focus() } catch (e) {}
      }
      return
    }
    const name = raw
    if (app.highscores && app.highscores.qualifies(info.score)) {
      app.highscores.add(name, info.score, info.floor, info.building)
    }
    this.state.saved = true
    this.state.posting = true
    if (app.announce) app.announce.polite(app.i18n.t('gameover.saved'))
    Promise.resolve(app.onlineSubmit.run({
      name: name,
      score: info.score,
      meta: {floor: info.floor, building: info.building},
      statusEl: this.state.statusEl,
      linkEl: this.state.linkEl,
    })).then(() => { this.state.posting = false })
      .catch(() => { this.state.posting = false })
  },
})
