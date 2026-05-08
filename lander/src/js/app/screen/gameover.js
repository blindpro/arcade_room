// Game-over screen. Shows world, score, rank. If the score qualifies
// for the top-10 list, transitions to highScoreEntry; otherwise the
// New Tour button starts a fresh run.
app.screen.gameover = app.screenManager.invent({
  id: 'gameover',
  parentSelector: '.a-app--gameover',
  rootSelector: '.a-gameover',
  transitions: {
    restart: function () { this.change('game') },
    enterScore: function () { this.change('highScoreEntry') },
    menu: function () { this.change('menu') },
    highscores: function () { this.change('highscores') },
  },
  state: {
    qualifies: false,
    entryFrames: 0,
  },
  onReady: function () {
    const root = this.rootElement
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]')
      if (btn) app.screenManager.dispatch(btn.dataset.action)
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

    const root = this.rootElement
    const reasonEl = root.querySelector('.a-gameover--reason')
    const scoreEl = root.querySelector('.a-gameover--score')
    const missionEl = root.querySelector('.a-gameover--mission')
    const rankEl = root.querySelector('.a-gameover--rank')
    const submitBtn = root.querySelector('button[data-action="enterScore"]')
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
    const tc = content.scoring.state.tierCounts
    if (tiersEl) tiersEl.textContent = app.i18n.t('gameover.tiers', {
      perfect: tc.perfect, clean: tc.clean, sloppy: tc.sloppy,
    })
    if (submitBtn) submitBtn.hidden = !this.state.qualifies

    content.announcer.gameOver(score, missionN, this.state.qualifies, tc)
    app.utility.focus.setWithin(this.rootElement)
  },
  onFrame: function () {
    try {
      if (this.state.entryFrames > 0) { this.state.entryFrames--; app.controls.ui(); return }
      const ui = app.controls.ui()
      if (ui.up) app.utility.focus.setPreviousFocusable(this.rootElement)
      if (ui.down) app.utility.focus.setNextFocusable(this.rootElement)
      if (ui.enter || ui.space || ui.confirm) {
        const f = app.utility.focus.get(this.rootElement)
        if (f && f.dataset.action) app.screenManager.dispatch(f.dataset.action)
      }
      if (ui.back) app.screenManager.dispatch('menu')
    } catch (e) { console.error(e) }
  },
})
