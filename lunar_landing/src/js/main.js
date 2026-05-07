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

  // Initialize mix
  engine.mixer.reverb.setImpulse(
    engine.buffer.impulse({
      buffer: engine.buffer.whiteNoise({
        channels: 2,
        duration: 2,
      }),
      power: 2,
    })
  )

  // Boosted dynamic range
  engine.mixer.param.limiter.attack.value = 0.003
  engine.mixer.param.limiter.gain.value = 1
  engine.mixer.param.limiter.knee.value = 15
  engine.mixer.param.limiter.ratio.value = 15
  engine.mixer.param.limiter.release.value = 0.125
  engine.mixer.param.limiter.threshold.value = -24
  engine.mixer.param.preGain.value = 1.5

  // Start the loop running so menu / diagnostic screens get frame events
  // for input polling. The game screen owns gameplay updates itself.
  engine.loop.start()

  // Resume audio context on first user gesture (browser autoplay policy).
  const resumeAudio = () => {
    const ctx = engine.context()
    if (ctx && ctx.state === 'suspended') ctx.resume()
  }
  ;['pointerdown', 'keydown', 'touchstart'].forEach((ev) => {
    window.addEventListener(ev, resumeAudio)
  })

  // Activate application — honors window.location.hash for diagnostic
  // routes (#test, #learn, #help). See screenManager's `none → activate`.
  app.screenManager.dispatch('activate')
  app.activate()

  // Confirm before closing during a live mission.
  if (!app.isElectron()) {
    window.addEventListener('beforeunload', (e) => {
      if (app.screenManager.is('game')) {
        e.preventDefault()
        e.returnValue = 'Quit?'
      }
    })
  }
})()
