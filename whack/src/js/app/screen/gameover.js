app.screen.gameover = app.screenManager.invent({
  id: 'gameover',
  parentSelector: '.a-app--gameover',
  rootSelector: '.a-gameover',
  transitions: {
    save: function () {},
    play: function () { this.change('game') },
    menu: function () { this.change('menu') },
  },
  state: {
    entryFrames: 0,
    summary: null,
    nameInput: null,
    statusEl: null,
    linkEl: null,
    saved: false,
    posting: false,
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
  onEnter: function (_e, summary) {
    this.state.entryFrames = 6
    this.state.summary = summary || {score: 0, level: 1, isNew: false}
    this.state.saved = false
    this.state.posting = false
    const el = this.rootElement.querySelector('.a-gameover--summary')
    const key = this.state.summary.isNew ? 'gameover.summaryNew' : 'gameover.summary'
    if (el) el.textContent = app.i18n.t(key, this.state.summary)
    if (this.state.summary.isNew) {
      app.announce.assertive(app.i18n.t('ann.newHigh'))
    }
    if (this.state.nameInput) this.state.nameInput.value = ''
    if (this.state.statusEl) { this.state.statusEl.hidden = true; this.state.statusEl.textContent = '' }
    if (this.state.linkEl) { this.state.linkEl.hidden = true }
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
    if (ui.back) app.screenManager.dispatch('menu')
  },
  handleSave: function () {
    if (this.state.saved || this.state.posting) return
    const s = this.state.summary || {score: 0, level: 1}
    const raw = (this.state.nameInput && this.state.nameInput.value || '').trim()
    if (!raw) {
      app.announce.assertive(app.i18n.t('gameover.nameRequired'))
      if (this.state.nameInput) {
        try { this.state.nameInput.focus() } catch (e) {}
      }
      return
    }
    const name = raw
    // Local save was already attempted by content.game on game-over (sets isNew).
    this.state.saved = true
    this.state.posting = true
    Promise.resolve(app.onlineSubmit.run({
      name: name,
      score: s.score | 0,
      meta: {},
      statusEl: this.state.statusEl,
      linkEl: this.state.linkEl,
    })).then(() => { this.state.posting = false })
      .catch(() => { this.state.posting = false })
  },
})
