app.screen.gameover = app.screenManager.invent({
  id: 'gameover',
  parentSelector: '.a-app--gameover',
  rootSelector: '.a-gameover',
  transitions: {
    playAgain: function () {
      this.change('ready')
    },
    highscores: function () {
      app.screen.highscores._returnTo = 'gameover'
      this.change('highscores')
    },
    menu: function () {
      this.change('menu')
    },
  },
  state: {
    entryFrames: 0,
    scoreEl: null,
    roomEl: null,
    initialsBlockEl: null,
    initialsInputEl: null,
    statusEl: null,
    linkEl: null,
    submitted: false,
    posting: false,
  },
  _lastPayload: null,
  onReady: function () {
    const root = this.rootElement
    this.state.scoreEl = root.querySelector('.a-gameover--score')
    this.state.roomEl = root.querySelector('.a-gameover--room')
    this.state.initialsBlockEl = root.querySelector('.a-gameover--initials')
    this.state.initialsInputEl = root.querySelector('.a-gameover--initials-input')
    this.state.statusEl = root.querySelector('.a-gameover--online-status')
    this.state.linkEl = root.querySelector('.a-gameover--online-link')

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]')
      if (!btn) return
      if (btn.dataset.action === 'submit') {
        this.submitInitials()
        return
      }
      app.screenManager.dispatch(btn.dataset.action)
    })

    if (this.state.initialsInputEl) {
      this.state.initialsInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.submitInitials() }
      })
    }
  },
  onEnter: function () {
    const payload = this._lastPayload || {score: 0, room: 1}
    if (this.state.scoreEl) this.state.scoreEl.textContent = String(payload.score)
    if (this.state.roomEl) this.state.roomEl.textContent = String(payload.room)
    this.state.entryFrames = 6
    this.state.submitted = false
    this.state.posting = false

    // Always show the initials block — even sub-leaderboard scores can be
    // submitted to the online ranking.
    if (this.state.initialsBlockEl) {
      this.state.initialsBlockEl.removeAttribute('hidden')
      if (this.state.initialsInputEl) {
        this.state.initialsInputEl.value = ''
        setTimeout(() => this.state.initialsInputEl && this.state.initialsInputEl.focus(), 50)
      }
    }
    if (this.state.statusEl) { this.state.statusEl.hidden = true; this.state.statusEl.textContent = '' }
    if (this.state.linkEl) { this.state.linkEl.hidden = true }

    app.announce.assertive(app.i18n.t('ann.gameOverShort'))
    app.announce.polite(app.i18n.t('ann.score', {score: payload.score}))
  },
  submitInitials: function () {
    if (this.state.submitted || this.state.posting) return
    const payload = this._lastPayload || {score: 0, room: 1}
    let raw = (this.state.initialsInputEl && this.state.initialsInputEl.value) || ''
    raw = String(raw).trim()
    if (!raw) {
      app.announce.assertive(app.i18n.t('gameover.nameRequired'))
      if (this.state.initialsInputEl) {
        try { this.state.initialsInputEl.focus() } catch (e) {}
      }
      return
    }
    const name = raw
    if (app.highscores.qualifies(payload.score)) {
      app.highscores.add(name, payload.score, payload.room)
    }
    this.state.submitted = true
    this.state.posting = true
    Promise.resolve(app.onlineSubmit.run({
      name: name,
      score: payload.score,
      meta: {level: payload.room, kills: payload.kills | 0},
      statusEl: this.state.statusEl,
      linkEl: this.state.linkEl,
    })).then(() => { this.state.posting = false })
      .catch(() => { this.state.posting = false })
  },
  onFrame: function () {
    try {
      if (this.state.entryFrames > 0) {
        this.state.entryFrames--
        app.controls.ui()
        return
      }
      // Allow keyboard navigation only when not focused on the initials input.
      const inputFocused = document.activeElement === this.state.initialsInputEl
      if (inputFocused) return

      const ui = app.controls.ui()
      if (ui.up) { content.sfx.menuMove(); app.utility.focus.setPreviousFocusable(this.rootElement) }
      if (ui.down) { content.sfx.menuMove(); app.utility.focus.setNextFocusable(this.rootElement) }
      if (ui.enter || ui.space || ui.confirm) {
        const f = app.utility.focus.get(this.rootElement)
        if (f && f.dataset.action === 'submit') { this.submitInitials(); return }
        if (f && f.dataset.action) { content.sfx.menuConfirm(); app.screenManager.dispatch(f.dataset.action) }
      }
      if (ui.back) app.screenManager.dispatch('menu')
    } catch (e) { console.error(e) }
  },
})
