;(async () => {
  // Wait for document ready
  await engine.ready()

  // Load and apply preferences
  await app.storage.ready()
  app.updates.apply()
  app.settings.load()
  // Apply detected/persisted locale to the static DOM before screens
  // wire up; that way each screen's onReady sees translated text.
  app.i18n.applyDom()
  app.screenManager.ready()

  // ESCALADOR persists high scores via app.highscores, not engine.state.
  if (app.autosave && typeof app.autosave.disable === 'function') {
    app.autosave.disable()
  }

  // ESCALADOR runs fully dry — no global reverb. Every cue authors its own
  // tail (release time on stings, lowpass-shaped wind), so leaking the
  // global convolver onto the gameOver dirge or any other on-screen sting
  // would just smear them. Disable the auxiliary reverb send entirely.
  engine.mixer.reverb.setActive(false)

  // Boosted dynamic range
  engine.mixer.param.limiter.attack.value = 0.003
  engine.mixer.param.limiter.gain.value = 1
  engine.mixer.param.limiter.knee.value = 15
  engine.mixer.param.limiter.ratio.value = 15
  engine.mixer.param.limiter.release.value = 0.125
  engine.mixer.param.limiter.threshold.value = -24
  engine.mixer.param.preGain.value = 1.4

  // Start the loop
  engine.loop.start().pause()

  // Resume the WebAudio context on first user gesture (browser autoplay policy)
  const resumeAudio = () => {
    const ctx = engine.context()
    if (ctx && ctx.state === 'suspended') ctx.resume()
  }
  ;['pointerdown', 'keydown', 'touchstart'].forEach((ev) => {
    window.addEventListener(ev, resumeAudio, {once: false})
  })

  // Wire announcer regions
  if (app.announce) app.announce.ready()

  // Activate application — honors window.location.hash for diagnostic routes
  app.screenManager.dispatch('activate')
  app.activate()

  // Prevent closing HTML5 builds
  if (!app.isElectron()) {
    window.addEventListener('beforeunload', (e) => {
      if (!engine.loop.isPaused()) {
        e.preventDefault()
        e.returnValue = 'Quit?'
      }
    })
  }
})()
