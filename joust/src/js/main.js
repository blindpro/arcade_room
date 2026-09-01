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
  // Deliberately below the value the rest of the collection uses. JOUST runs
  // many more simultaneous positional voices than its neighbours - a wing beat
  // per rider per beat, plus sustained tones, eggs and the reference - and at
  // 1.5 the limiter was engaged more or less continuously, which does not sound
  // loud so much as flat and pumping. The headroom is what keeps a busy wave
  // legible.
  engine.mixer.param.preGain.value = 1.15

  // Start the loop
  engine.loop.start().pause()

  // JOUST authors its own per-cue tails (ADSR + filters) and its own rhythm bed,
  // so kill syngen's always-on global reverb send. This matters more here than
  // in most of the collection: the game is read off PITCH, and a reverb tail
  // smears one wing beat into the next, which is exactly the comparison the
  // player is trying to make.
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
