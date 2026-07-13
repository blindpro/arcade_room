/**
 * Screen-reader announcements via ARIA live regions. The original spoke the
 * score with the Mac speech API (voiceSpeak); per the port's accessibility
 * brief this uses two visually-hidden live regions instead — polite for passive
 * status (level changes, "go"), assertive for things the player asked for or
 * must hear now (the on-demand score, game over).
 */
content.announce = (() => {
  let polite, assertive

  function regions() {
    if (!polite) polite = document.querySelector('.a-app--announce-polite')
    if (!assertive) assertive = document.querySelector('.a-app--announce-assertive')
  }

  // Re-assigning identical text won't re-fire some screen readers, so clear the
  // region first and set it after a short delay (~120 ms is the battle-tested
  // window for NVDA/JAWS to register the cleared state).
  function say(region, message) {
    if (!region) return
    region.textContent = ''
    window.setTimeout(() => { region.textContent = message }, 120)
  }

  return {
    announceScore(score) {
      regions()
      say(assertive, score <= 0 ? app.i18n.t('ann.noScore') : app.i18n.t('ann.score', {score}))
    },
    gameOver(score, isNewBest) {
      regions()
      const best = isNewBest ? ' ' + app.i18n.t('ann.newBest') : ''
      say(assertive, app.i18n.t('ann.gameOver', {score}) + best)
    },
    status(message) { regions(); say(polite, message) },
    alert(message) { regions(); say(assertive, message) },
  }
})()
