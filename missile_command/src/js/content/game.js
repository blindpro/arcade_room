content.game = (() => {
  const K = () => content.constants
  const STATE_INTRO       = 'intro'
  const STATE_READY       = 'ready'
  const STATE_PLAY        = 'play'
  const STATE_WAVE_CLEAR  = 'waveClear'
  const STATE_GAME_OVER   = 'gameOver'

  const S = () => content.state

  function startNewGame() {
    S().resetForNewGame()
    content.cities.init()
    content.batteries.init()
    content.threats.clearAll()
    content.outgoing.clear()
    content.blasts.clear()
    content.wave.reset()
    S().wave = 0
    S().phase = STATE_INTRO
    S().phaseTimer = K().INTRO_TIMER
  }

  function _beginWave() {
    S().wave += 1
    content.wave.start(S().wave)
    content.batteries.init()
    S().phase = STATE_READY
    S().phaseTimer = K().READY_TIMER
    content.events.emit('wave-start', {wave: S().wave})
  }

  function addScore(n) {
    const before = S().score
    S().score += n
    while (S().score >= S().nextBonusAt) {
      S().nextBonusAt += K().BONUS_THRESHOLD_INCREMENT
      const idx = content.cities.firstDestroyedIndex()
      if (idx >= 0) content.cities.restore(idx)
    }
    content.events.emit('score-change', {score: S().score, delta: S().score - before})
  }

  function update(delta) {
    if (S().paused) return
    S().phaseTimer -= delta

    switch (S().phase) {
      case STATE_INTRO:
        if (S().phaseTimer <= 0) _beginWave()
        break

      case STATE_READY:
        if (S().phaseTimer <= 0) {
          S().phase = STATE_PLAY
          S().phaseTimer = 0
        }
        break

      case STATE_PLAY:
        content.batteries.tick(delta)
        content.outgoing.tick(delta)
        content.blasts.tick(delta)
        content.threats.tick(delta)
        content.wave.tick(delta)

        if (content.cities.aliveCount() === 0) {
          content.threats.clearAll()
          content.outgoing.clear()
          S().phase = STATE_WAVE_CLEAR
          S().phaseTimer = K().ALL_CITIES_LOST_TIMER
          content.events.emit('all-cities-lost')
        }
        else if (content.wave.isCleared()) {
          const survMissiles = content.batteries.totalAmmo()
          const survCities = content.cities.aliveCount()
          const bonus = content.wave.bonus(survMissiles, survCities)
          addScore(bonus)
          content.events.emit('wave-clear', {wave: S().wave, bonus, missiles: survMissiles, cities: survCities})
          S().phase = STATE_WAVE_CLEAR
          S().phaseTimer = K().WAVE_CLEAR_TIMER
        }
        break

      case STATE_WAVE_CLEAR:
        if (S().phaseTimer <= 0) {
          if (content.cities.aliveCount() === 0) {
            S().phase = STATE_GAME_OVER
            content.events.emit('game-over', {score: S().score, wave: S().wave})
          } else {
            _beginWave()
          }
        }
        break

      case STATE_GAME_OVER:
        break
    }
  }

  content.events.on('threat-killed', (e) => {
    let pts = K().SCORE_ICBM
    if (e.kind === 'splitter') pts = K().SCORE_SPLITTER
    else if (e.kind === 'bomber') pts = K().SCORE_BOMBER
    else if (e.kind === 'bomb') pts = K().SCORE_BOMB
    addScore(pts)
  })

  return {
    update, startNewGame, addScore,
    setPaused: (v) => S().paused = !!v,
    isPaused: () => S().paused,
    isPlaying: () => S().phase === STATE_PLAY,
    phase: () => S().phase,
    STATE_INTRO, STATE_READY, STATE_PLAY, STATE_WAVE_CLEAR, STATE_GAME_OVER,
  }
})()
