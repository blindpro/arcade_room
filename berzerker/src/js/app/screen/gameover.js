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
    submitted: false,
  },
  _lastPayload: null,
  onReady: function () {
    const root = this.rootElement
    this.state.scoreEl = root.querySelector('.a-gameover--score')
    this.state.roomEl = root.querySelector('.a-gameover--room')
    this.state.initialsBlockEl = root.querySelector('.a-gameover--initials')
    this.state.initialsInputEl = root.querySelector('.a-gameover--initials-input')

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

    const qualifies = app.highscores.qualifies(payload.score)
    if (this.state.initialsBlockEl) {
      if (qualifies) {
        this.state.initialsBlockEl.removeAttribute('hidden')
        if (this.state.initialsInputEl) {
          this.state.initialsInputEl.value = ''
          setTimeout(() => this.state.initialsInputEl && this.state.initialsInputEl.focus(), 50)
        }
      } else {
        this.state.initialsBlockEl.setAttribute('hidden', '')
      }
    }

    app.announce.assertive(app.i18n.t('ann.gameOverShort'))
    app.announce.polite(app.i18n.t('ann.score', {score: payload.score}))
  },
  submitInitials: function () {
    if (this.state.submitted) return
    const payload = this._lastPayload || {score: 0, room: 1}
    let name = (this.state.initialsInputEl && this.state.initialsInputEl.value) || ''
    name = String(name).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3) || 'PLR'
    app.highscores.add(name, payload.score, payload.room)
    this.state.submitted = true
    if (this.state.initialsBlockEl) this.state.initialsBlockEl.setAttribute('hidden', '')
    app.screenManager.dispatch('highscores')
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
