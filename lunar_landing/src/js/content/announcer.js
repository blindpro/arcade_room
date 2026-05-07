// Announcer wrapper. Stores i18n keys (or {key, params}) for any value
// rendered later by another module so a locale switch between event and
// render still resolves correctly.
content.announcer = (() => {
  let _lastLowFuelLevel = 0

  function landingVerdict(verdict) {
    const params = {
      vy: Math.abs(verdict.vy).toFixed(1),
    }
    app.announce.assertive(app.i18n.t(verdict.key, params))
  }

  // Polite follow-up after a soft landing — names the tier (perfect /
  // clean / sloppy). Separate from the assertive verdict so the verdict
  // numbers don't get cut off.
  function landingTier(tier) {
    if (!tier) return
    app.announce.polite(app.i18n.t('tier.' + tier))
  }

  function missionStart(missionN, cfg) {
    app.announce.polite(app.i18n.t('ann.missionStart', {
      n: missionN,
      body: app.i18n.t(cfg.nameKey),
      gravity: cfg.gravity.toFixed(2),
      crash: cfg.crashSpeed.toFixed(1),
      fuel: cfg.fuel,
    }))
  }

  function rankPromotion(rankKey) {
    app.announce.assertive(app.i18n.t('ann.rankUp', {rank: app.i18n.t(rankKey)}))
  }

  function lowFuel(level) {
    if (level === _lastLowFuelLevel) return
    if (level === 1) app.announce.assertive(app.i18n.t('ann.lowFuel'))
    else if (level === 2) app.announce.assertive(app.i18n.t('ann.criticalFuel'))
    else if (level === 3) app.announce.assertive(app.i18n.t('ann.outOfFuel'))
    _lastLowFuelLevel = level
  }

  // Spoken altitude — polite, called from the game FSM on a timer.
  function altitudeTick(metres) {
    app.announce.polite(app.i18n.t('ann.altitude', {v: Math.round(metres)}))
  }

  function gameOver(score, missionN, qualifies, tierCounts) {
    const k = qualifies ? 'ann.gameOverHigh' : 'ann.gameOver'
    const tc = tierCounts || {perfect: 0, clean: 0, sloppy: 0}
    app.announce.assertive(app.i18n.t(k, {
      score, n: missionN,
      perfect: tc.perfect, clean: tc.clean, sloppy: tc.sloppy,
    }))
  }

  function reset() {
    _lastLowFuelLevel = 0
  }

  return {
    landingVerdict,
    landingTier,
    missionStart,
    rankPromotion,
    lowFuel,
    altitudeTick,
    gameOver,
    reset,
  }
})()
