// Two-region screen-reader announcer. The polite region carries routine
// events (score, pickup, room counts); the assertive region carries state
// changes (Otto arrives, death, game over). Identical text re-fires
// reliably because each path clears the region for one rAF tick before
// re-setting, defeating the screen-reader "no change → no announcement"
// suppression.
//
// Optional TTS fallback (`setUseTts(true)`) routes the same text through
// SpeechSynthesis for users without an active screen reader. Off by
// default; exposed in settings.
app.announce = (() => {
  let polite, assertive
  let lastPolite = ''
  let useTts = false

  function ensure() {
    if (!polite) polite = document.querySelector('.a-app--announce')
    if (!assertive) assertive = document.querySelector('.a-app--announce-assertive')
  }

  function speak(text) {
    if (!useTts) return
    if (!('speechSynthesis' in window)) return
    try {
      const u = new SpeechSynthesisUtterance(text)
      const loc = (app.i18n && app.i18n.locale && app.i18n.locale()) || 'en'
      u.lang = loc === 'es' ? 'es-ES' : 'en-US'
      u.rate = 1.05
      window.speechSynthesis.speak(u)
    } catch (_) {}
  }

  return {
    polite: function (text) {
      ensure()
      if (!polite || text == null) return
      if (text === lastPolite) {
        polite.textContent = ''
        window.requestAnimationFrame(() => { polite.textContent = text })
      } else {
        polite.textContent = text
      }
      lastPolite = text
      speak(text)
    },
    assertive: function (text) {
      ensure()
      if (!assertive || text == null) return
      assertive.textContent = ''
      window.requestAnimationFrame(() => { assertive.textContent = text })
      speak(text)
    },
    clear: function () {
      ensure()
      if (polite) polite.textContent = ''
      if (assertive) assertive.textContent = ''
      lastPolite = ''
    },
    setUseTts: function (v) { useTts = !!v },
    useTts: () => useTts,
  }
})()
