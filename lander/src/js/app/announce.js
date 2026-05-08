// Screen-reader announcer with two aria-live regions. Polite carries
// routine events (status, mission start); assertive carries state changes
// (low fuel, crash, "pull up"). Re-reading identical strings: clear the
// region, yield via rAF, then re-set, so screen readers see the change.
app.announce = (() => {
  let polite, assertive
  let lastPolite = ''

  function ensure() {
    if (!polite) polite = document.querySelector('.a-app--announce')
    if (!assertive) assertive = document.querySelector('.a-app--announce-assertive')
  }

  return {
    polite: function (text) {
      ensure()
      if (!polite) return
      if (text === lastPolite) {
        polite.textContent = ''
        window.requestAnimationFrame(() => { polite.textContent = text })
      } else {
        polite.textContent = text
      }
      lastPolite = text
    },
    assertive: function (text) {
      ensure()
      if (!assertive) return
      assertive.textContent = ''
      window.requestAnimationFrame(() => { assertive.textContent = text })
    },
    clear: function () {
      ensure()
      if (polite) polite.textContent = ''
      if (assertive) assertive.textContent = ''
      lastPolite = ''
    },
  }
})()
