app.screen.gameover = app.screenManager.invent({
  id: 'gameover',
  parentSelector: '.a-app--gameover',
  rootSelector: '.a-gameover',
  transitions: {
    retry: function () { this.change('game') },
    multiplayer: function () { this.change('multiplayer') },
    menu: function () { this.change('menu') },
  },
  state: {
    entryFrames: 0,
    wasMp: false,
    nameInput: null,
    form: null,
    statusEl: null,
    linkEl: null,
    formEl: null,
    saved: false,
    posting: false,
    snapshot: null,
  },
  onReady: function () {
    const root = this.rootElement
    this.state.nameInput = root.querySelector('.a-gameover--name-input')
    this.state.form = root.querySelector('.a-gameover--form')
    this.state.formEl = this.state.form
    this.state.statusEl = root.querySelector('.a-gameover--online-status')
    this.state.linkEl = root.querySelector('.a-gameover--online-link')
    if (this.state.form) {
      this.state.form.addEventListener('submit', (e) => {
        e.preventDefault()
        this.handleSave()
      })
    }
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]')
      if (!btn) return
      if (btn.dataset.action === 'save') {
        // Form submit handler will fire; don't double-dispatch.
        return
      }
      // "retry" goes back to MP lobby in multiplayer; otherwise to game.
      if (btn.dataset.action === 'retry' && this.state.wasMp) {
        app.screenManager.dispatch('multiplayer')
        return
      }
      app.screenManager.dispatch(btn.dataset.action)
    })
  },
  onEnter: function () {
    this.state.entryFrames = 6
    this.state.saved = false
    this.state.posting = false
    const s = content.game.state
    const root = this.rootElement
    const setText = (sel, text) => {
      const el = root.querySelector(sel)
      if (el) el.textContent = text
    }

    this.state.wasMp = s.mode === 'multi'
    const rosterEl = root.querySelector('.a-gameover--mpRoster')
    const statsEl = root.querySelector('.a-gameover--stats')
    const subtitleEl = root.querySelector('.a-gameover--subtitle')

    if (this.state.nameInput) this.state.nameInput.value = ''
    if (this.state.statusEl) { this.state.statusEl.hidden = true; this.state.statusEl.textContent = '' }
    if (this.state.linkEl) { this.state.linkEl.hidden = true }

    if (this.state.wasMp) {
      // Hide single-player stats; render the MP leaderboard.
      if (statsEl) statsEl.hidden = true
      if (rosterEl) {
        rosterEl.hidden = false
        rosterEl.innerHTML = ''
        const sorted = (s.mp.finalRoster || s.mp.players).slice().sort((a, b) => b.score - a.score)
        for (let i = 0; i < sorted.length; i++) {
          const p = sorted[i]
          const li = document.createElement('li')
          li.textContent = app.i18n.t('gameover.mpRow', {
            rank:  i + 1,
            name:  p.name,
            score: p.score,
            level: p.highestLevel || 1,
          })
          rosterEl.appendChild(li)
        }
      }
      if (subtitleEl) subtitleEl.textContent = app.i18n.t('gameover.mpSubtitle')

      // Update Play Again button label to "Back to lobby" in MP.
      const retryBtn = root.querySelector('button[data-action="retry"]')
      if (retryBtn) retryBtn.textContent = app.i18n.t('gameover.mpReturn')
      // No online submission for multiplayer (per-peer scores are messy).
      if (this.state.formEl) this.state.formEl.hidden = true
      this.state.snapshot = null
    } else {
      if (statsEl) statsEl.hidden = false
      if (rosterEl) rosterEl.hidden = true
      setText('.a-gameover--subtitle', app.i18n.t('gameover.subtitle', {score: s.score, level: s.level}))

      const totalNotes = s.totalHits + s.totalMisses
      const accuracy = totalNotes > 0 ? Math.round(s.totalHits / totalNotes * 100) : 0
      setText('.a-gameover--statScore',    String(s.score))
      setText('.a-gameover--statLevel',    String(s.level))
      setText('.a-gameover--statPatterns', String(s.totalPatternsCleared))
      setText('.a-gameover--statAccuracy', accuracy + '% (' + s.totalHits + '/' + totalNotes + ')')
      setText('.a-gameover--statPerfect',  String(s.perfectHits))

      const retryBtn = root.querySelector('button[data-action="retry"]')
      if (retryBtn) retryBtn.textContent = app.i18n.t('gameover.retry')

      if (this.state.formEl) this.state.formEl.hidden = false
      this.state.snapshot = {score: s.score | 0, level: s.level | 0}
    }
  },
  onFrame: function () {
    if (this.state.entryFrames > 0) {
      this.state.entryFrames--
      app.controls.ui()
      return
    }
    if (document.activeElement === this.state.nameInput) {
      const ui = app.controls.ui()
      if (ui.back) app.screenManager.dispatch('menu')
      return
    }
    const ui = app.controls.ui()
    app.utility.menuNav.handle(ui, this.rootElement)
    if (ui.back) app.screenManager.dispatch('menu')
  },
  handleSave: function () {
    if (this.state.saved || this.state.posting) return
    if (!this.state.snapshot) return
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
      meta: {level: s.level},
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
