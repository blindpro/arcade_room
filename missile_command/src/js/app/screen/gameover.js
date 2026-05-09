app.screen.gameover = app.screenManager.invent({
  id: 'gameover',
  parentSelector: '.a-app--gameover',
  rootSelector: '.a-gameover',
  transitions: {
    continue: function () { this.change('menu') },
  },
  state: {
    nameInput: null,
    submitBtn: null,
    rankMsg: null,
    scoreEl: null,
    waveEl: null,
    form: null,
    statusEl: null,
    linkEl: null,
    qualifies: false,
    saved: false,
    posting: false,
  },
  onReady: function () {
    const root = this.rootElement
    this.state.nameInput = root.querySelector('.a-gameover--name')
    this.state.submitBtn = root.querySelector('.a-gameover--submit')
    this.state.rankMsg   = root.querySelector('.a-gameover--rank-msg')
    this.state.scoreEl   = root.querySelector('.a-gameover--score')
    this.state.waveEl    = root.querySelector('.a-gameover--wave')
    this.state.form      = root.querySelector('.a-gameover--form')
    this.state.statusEl  = root.querySelector('.a-gameover--online-status')
    this.state.linkEl    = root.querySelector('.a-gameover--online-link')

    this.state.form.addEventListener('submit', (e) => {
      e.preventDefault()
      this.handleSave()
    })

    root.addEventListener('click', (e) => {
      if (e.target.closest('button[data-action="continue"]')) {
        app.screenManager.dispatch('continue')
      }
    })
  },
  onEnter: function () {
    const score = content.state.score
    const wave = Math.max(1, content.state.wave)
    if (this.state.scoreEl) this.state.scoreEl.textContent = String(score)
    if (this.state.waveEl) this.state.waveEl.textContent = String(wave)
    this.state.qualifies = app.highscores.qualifies(score)
    if (this.state.rankMsg) this.state.rankMsg.hidden = !this.state.qualifies
    // Always show the form (so the user can submit to the online leaderboard
    // even when the score doesn't qualify locally).
    if (this.state.form) this.state.form.hidden = false
    if (this.state.statusEl) { this.state.statusEl.hidden = true; this.state.statusEl.textContent = '' }
    if (this.state.linkEl) { this.state.linkEl.hidden = true }
    this.state.saved = false
    this.state.posting = false
    if (this.state.qualifies) {
      app.announce.assertive(app.i18n.t('ann.gameOverHigh', {score, wave}))
    } else {
      app.announce.assertive(app.i18n.t('ann.gameOver', {score, wave}))
    }
    setTimeout(() => {
      if (this.state.nameInput) this.state.nameInput.focus()
    }, 250)
  },
  onFrame: function () {
    try {
      const ui = app.controls.ui()
      const f = app.utility.focus.get(this.rootElement)
      if (f === this.state.nameInput) return
      if (ui.back) app.screenManager.dispatch('continue')
      if (ui.enter || ui.space || ui.confirm) {
        const target = f && f.dataset && f.dataset.action ? f : null
        if (target) target.click()
      }
    } catch (e) { console.error(e) }
  },
  handleSave: function () {
    if (this.state.saved || this.state.posting) return
    const score = content.state.score
    const wave = Math.max(1, content.state.wave)
    const raw = (this.state.nameInput && this.state.nameInput.value || '').trim()
    if (!raw) {
      app.announce.assertive(app.i18n.t('gameover.nameRequired'))
      if (this.state.nameInput) {
        try { this.state.nameInput.focus() } catch (e) {}
      }
      return
    }
    const name = raw
    if (this.state.qualifies) {
      app.highscores.add(name, score, wave)
    }
    this.state.saved = true
    this.state.posting = true
    app.announce.polite(app.i18n.t('ann.scoreSaved'))
    Promise.resolve(app.onlineSubmit.run({
      name: name,
      score: score,
      meta: {wave: wave},
      statusEl: this.state.statusEl,
      linkEl: this.state.linkEl,
    })).then(() => { this.state.posting = false })
      .catch(() => { this.state.posting = false })
  },
})
