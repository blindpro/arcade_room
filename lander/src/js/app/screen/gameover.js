// Game-over screen. Shows world, score, rank. Save flow stays on this
// screen so the player sees the online rank inline. Local save runs only
// when the score qualifies for the top-10; online submission always runs
// once the player has typed a name.
app.screen.gameover = app.screenManager.invent({
  id: 'gameover',
  parentSelector: '.a-app--gameover',
  rootSelector: '.a-gameover',
  transitions: {
    save: function () {},
    restart: function () { this.change('game') },
    menu: function () { this.change('menu') },
    highscores: function () { this.change('highscores') },
  },
  state: {
    qualifies: false,
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
    const score = content.scoring.state.score
    const missionN = content.missions.current()
    const cfg = content.constants.bodyConfig(missionN)
    const reasonKey = content.lander.state.crashReasonKey || 'verdict.crashVy'
    const verdict = content.lander.state.landingVerdict || {vy: 0}
    this.state.qualifies = app.highscores.qualifies(score)
    this.state.entryFrames = 8
    this.state.saved = false
    this.state.posting = false
    const tc = content.scoring.state.tierCounts
    const landings = (tc.perfect | 0) + (tc.clean | 0) + (tc.sloppy | 0)
    this.state.snapshot = {
      score: score | 0,
      mission: missionN,
      bodyKey: cfg && cfg.nameKey ? cfg.nameKey : 'body.unknown',
      landings: landings,
    }

    const root = this.rootElement
    const reasonEl = root.querySelector('.a-gameover--reason')
    const scoreEl = root.querySelector('.a-gameover--score')
    const missionEl = root.querySelector('.a-gameover--mission')
    const rankEl = root.querySelector('.a-gameover--rank')
    if (reasonEl) reasonEl.textContent = app.i18n.t(reasonKey, {
      vy: Math.abs(verdict.vy).toFixed(1),
    })
    if (scoreEl) scoreEl.textContent = app.i18n.t('gameover.score', {v: score})
    if (missionEl) missionEl.textContent = app.i18n.t('gameover.mission', {
      n: missionN,
      body: app.i18n.t(cfg.nameKey),
    })
    if (rankEl) rankEl.textContent = app.i18n.t('gameover.rank', {rank: app.i18n.t(content.scoring.rankKey())})
    const tiersEl = root.querySelector('.a-gameover--tiers')
    if (tiersEl) tiersEl.textContent = app.i18n.t('gameover.tiers', {
      perfect: tc.perfect, clean: tc.clean, sloppy: tc.sloppy,
    })

    if (this.state.nameInput) this.state.nameInput.value = ''
    if (this.state.statusEl) {
      this.state.statusEl.hidden = true
      this.state.statusEl.textContent = ''
    }
    if (this.state.linkEl) this.state.linkEl.hidden = true

    content.announcer.gameOver(score, missionN, this.state.qualifies, tc)
    app.utility.focus.setWithin(this.rootElement)
  },
  onFrame: function () {
    try {
      if (this.state.entryFrames > 0) { this.state.entryFrames--; app.controls.ui(); return }
      if (document.activeElement === this.state.nameInput) return
      const ui = app.controls.ui()
      if (ui.up) app.utility.focus.setPreviousFocusable(this.rootElement)
      if (ui.down) app.utility.focus.setNextFocusable(this.rootElement)
      if (ui.enter || ui.space || ui.confirm) {
        const f = app.utility.focus.get(this.rootElement)
        if (f && f.dataset.action) {
          if (f.dataset.action === 'save') this.handleSave()
          else app.screenManager.dispatch(f.dataset.action)
        }
      }
      if (ui.back) app.screenManager.dispatch('menu')
    } catch (e) { console.error(e) }
  },
  handleSave: function () {
    if (this.state.saved || this.state.posting) return
    const s = this.state.snapshot
    if (!s) return
    const raw = (this.state.nameInput && this.state.nameInput.value || '').trim()
    if (!raw) {
      app.announce.assertive(app.i18n.t('gameover.nameRequired'))
      if (this.state.nameInput) {
        try { this.state.nameInput.focus() } catch (e) {}
      }
      return
    }
    const name = raw
    if (app.highscores.qualifies(s.score)) {
      app.highscores.add(name, s.score, s.mission)
    }
    this.state.saved = true
    this.state.posting = true
    app.announce.polite(app.i18n.t('ann.scoreSaved'))
    Promise.resolve(app.onlineSubmit.run({
      name: name,
      score: s.score,
      meta: {body: s.bodyKey, landings: s.landings},
      statusEl: this.state.statusEl,
      linkEl: this.state.linkEl,
    })).then(() => { this.state.posting = false })
      .catch(() => { this.state.posting = false })
  },
})
