;(async () => {
  // Wait for document ready
  await engine.ready()

  // Load and apply preferences
  await app.storage.ready()
  app.updates.apply()
  app.settings.load()
  // Apply detected/persisted locale to the static DOM before screens wire up;
  // that way each screen's onReady sees translated text.
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

  // Boosted dynamic range. The limiter is set fairly hard here because an
  // impact is meant to be much louder than everything around it — the presence
  // drone, the footsteps and the bed all sit at a tenth of a hit's peak, and
  // that gap is the mix doing the game's job for it.
  engine.mixer.param.limiter.attack.value = 0.003
  engine.mixer.param.limiter.gain.value = 1
  engine.mixer.param.limiter.knee.value = 12
  engine.mixer.param.limiter.ratio.value = 15
  engine.mixer.param.limiter.release.value = 0.15
  engine.mixer.param.limiter.threshold.value = -22
  engine.mixer.param.preGain.value = 1.3

  // Start the loop
  engine.loop.start().pause()

  // KOMBAT is read off the ATTACK TELL — a short filter sweep whose direction
  // is the whole cue — and a reverb tail is exactly the thing that smears a
  // sweep's end back over its start. The end of the sweep is also the moment
  // the hit goes live, so blurring it is not a matter of taste; it costs the
  // player the reaction window the timing table was balanced around. Every cue
  // in content/audio.js authors its own dry tail instead.
  engine.mixer.reverb.setActive(false)

  // Activate application
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
