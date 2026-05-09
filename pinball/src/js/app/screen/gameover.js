app.screen.gameover = app.screenManager.invent({
  id: 'gameover',
  parentSelector: '.a-app--gameover',
  rootSelector: '.a-gameover',
  transitions: {
    restart: function () {
      content.game.reset()
      this.change('game')
    },
    back: function () {
      content.game.reset()
      content.audio.rollStop()
      this.change('splash')
    },
  },
  state: {
    entryFrames: 0,
    nameInput: null,
    form: null,
    statusEl: null,
    linkEl: null,
    saved: false,
    posting: false,
    snapshot: null,
  },
  onReady: function () {
    const root = this.rootElement
    this.state.nameInput = root.querySelector('.a-gameover--name-input')
    this.state.form = root.querySelector('.a-gameover--form')
    this.state.statusEl = root.querySelector('.a-gameover--online-status')
    this.state.linkEl = root.querySelector('.a-gameover--online-link')
    if (this.state.form) {
      this.state.form.addEventListener('submit', (e) => {
        e.preventDefault()
        this.handleSave()
      })
    }
  },
  onEnter: function () {
    this.state.entryFrames = 8
    this.state.saved = false
    this.state.posting = false
    const score = content.game.state.score | 0
    const rankIdx = content.game.state.rankIdx | 0
    this.state.snapshot = {score, rankIdx, rankName: content.game.rankName()}
    const root = this.rootElement
    const summary = root.querySelector('.a-gameover--summary')
    if (summary) {
      summary.textContent = app.i18n.t('gameover.summary', {
        score: score.toLocaleString(),
        rank: this.state.snapshot.rankName,
      })
    }
    if (this.state.nameInput) this.state.nameInput.value = ''
    if (this.state.statusEl) { this.state.statusEl.hidden = true; this.state.statusEl.textContent = '' }
    if (this.state.linkEl) { this.state.linkEl.hidden = true }
    setTimeout(() => { try { if (this.state.nameInput) this.state.nameInput.focus() } catch (e) {} }, 250)
  },
  onFrame: function () {
    if (this.state.entryFrames > 0) { this.state.entryFrames--; return }
    if (document.activeElement === this.state.nameInput) {
      const ui = app.controls.ui()
      if (ui.back || ui.pause) app.screenManager.dispatch('back')
      return
    }
    const ui = app.controls.ui()
    if (ui.enter || ui.space || ui.confirm) {
      app.screenManager.dispatch('restart')
    }
    if (ui.back || ui.pause) {
      app.screenManager.dispatch('back')
    }
  },
  handleSave: function () {
    if (this.state.saved || this.state.posting) return
    const s = this.state.snapshot
    const raw = (this.state.nameInput && this.state.nameInput.value || '').trim()
    if (!raw) {
      app.announce.assertive(app.i18n.t('gameover.nameRequired'))
      if (this.state.nameInput) {
        try { this.state.nameInput.focus() } catch (e) {}
      }
      return
    }
    const name = raw
    this.state.saved = true
    this.state.posting = true
    app.announce.polite(app.i18n.t('ann.savedScore'))
    Promise.resolve(app.onlineSubmit.run({
      name: name,
      score: s.score,
      meta: {rank: s.rankIdx},
      statusEl: this.state.statusEl,
      linkEl: this.state.linkEl,
    })).then(() => {
      this.state.posting = false
      try { if (this.state.nameInput) this.state.nameInput.blur() } catch (e) {}
    }).catch(() => {
      this.state.posting = false
    })
  },
})
