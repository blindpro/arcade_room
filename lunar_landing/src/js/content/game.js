// Top-level Lunar Lander FSM (1D model).
//
// Phases: 'intro' (~1 s mission fanfare while body name is read) →
// 'flying' (player thrusts) → 'landed' (soft, advance after bonus) or
// 'crashed' (hold ~1.5 s for impact audio) → 'gameOver' (transition to
// the gameOver screen, delayed so the cue audio can finish).
content.game = (() => {
  const phase = {
    INTRO: 'intro',
    FLYING: 'flying',
    LANDED: 'landed',
    CRASHED: 'crashed',
    GAMEOVER: 'gameOver',
  }

  const state = {
    phase: phase.INTRO,
    phaseT: 0,
    fuelLevel: 0,
    nextSpeechT: 0,         // seconds until next altitude announcement
  }

  function startMission(missionN) {
    content.lander.reset(missionN)
    content.audio.unmute()
    state.phase = phase.INTRO
    state.phaseT = 0
    state.fuelLevel = 0
    state.nextSpeechT = content.constants.SPEECH_INTERVAL
    content.announcer.reset()
    content.audio.missionFanfare(missionN)
    const cfg = content.constants.bodyConfig(missionN)
    content.announcer.missionStart(missionN, cfg)
  }

  function startNewRun() {
    content.scoring.reset()
    content.missions.reset()
    startMission(1)
  }

  function _checkFuelAnnouncement() {
    const s = content.lander.state
    const ratio = s.fuel / Math.max(1, s.fuelMax)
    let level = 0
    if (s.fuel <= 0) level = 3
    else if (ratio < 0.05) level = 2
    else if (ratio < 0.25) level = 1
    if (level > state.fuelLevel) {
      content.announcer.lowFuel(level)
      state.fuelLevel = level
    }
  }

  function _maybeSpeakAltitude(dt) {
    state.nextSpeechT -= dt
    if (state.nextSpeechT > 0) return
    state.nextSpeechT = content.constants.SPEECH_INTERVAL
    const y = Math.max(0, content.lander.state.y)
    content.announcer.altitudeTick(y)
  }

  function update(dt) {
    state.phaseT += dt
    content.audio.frame()

    if (state.phase === phase.INTRO) {
      if (state.phaseT > 1.0) {
        state.phase = phase.FLYING
        state.phaseT = 0
      }
      return
    }

    if (state.phase === phase.FLYING) {
      content.lander.readInput(dt)
      content.lander.consumeFuel(dt)
      const result = content.physics.step(dt, content.missions.current())
      _checkFuelAnnouncement()
      _maybeSpeakAltitude(dt)
      if (result === 'landed') {
        state.phase = phase.LANDED
        state.phaseT = 0
        content.audio.silenceAll()
        content.audio.touchdownSoft()
        const elapsed = engine.time() - content.lander.state.missionStartTime
        const award = content.scoring.awardLanding(
          content.missions.current(),
          content.lander.state.landingVerdict,
          content.lander.state.fuel,
          content.lander.state.fuelMax,
          elapsed,
        )
        content.announcer.landingVerdict(content.lander.state.landingVerdict)
        content.announcer.landingTier(content.scoring.state.lastTier)
        if (award > 0) {
          setTimeout(() => content.audio.bonusTally(5), 800)
        }
      } else if (result === 'crashed') {
        state.phase = phase.CRASHED
        state.phaseT = 0
        const haptic = app.haptics
        if (haptic) haptic.enqueue({duration: 400, startDelay: 0, strongMagnitude: 0.9, weakMagnitude: 0.4})
        content.audio.silenceAll()
        content.audio.touchdownHard()
        content.announcer.landingVerdict(content.lander.state.landingVerdict)
      }
      return
    }

    if (state.phase === phase.LANDED) {
      if (state.phaseT > 3.5) {
        content.missions.advance()
        startMission(content.missions.current())
      }
      return
    }

    if (state.phase === phase.CRASHED) {
      if (state.phaseT > 1.5) {
        state.phase = phase.GAMEOVER
        content.audio.gameOverCue()
        setTimeout(() => {
          if (app.screen.gameover) {
            app.screenManager.dispatch('gameover')
          }
        }, 1500)
      }
      return
    }
  }

  function silence() {
    content.audio.silenceAll()
  }

  return {
    state,
    phase,
    startNewRun,
    startMission,
    update,
    silence,
    missionNumber: () => content.missions.current(),
  }
})()
