/**
 * The whole game as a per-frame state machine, transcribed from the Director
 * score (via the TS reference port). Each tick() is one Director frame:
 *
 *   generate -> frame 5  (Generate)        moveTo   -> frame 6  (Move To Centre)
 *   moveFrom -> frame 7  (Move From Centre) reset    -> frame 8  (Reset & Continue)
 *   death    -> frame 10 (fade music)       gameover -> post-death
 *
 * The handler bodies (keyCheck, sideCheck, collCheck, exciteCount, moveTo,
 * moveFrom, generate, defineLevel, playWin, playStep) are 1:1 with MovieScript.
 * Sounds are routed through content.audio's Director-channel mixer, which plays
 * synthesised voices (content.sounds) instead of the original samples.
 */
content.game = (() => {
  const C = content.constants
  // Sibling modules referenced lazily (alphabetical concat is not guaranteed).
  const sound = () => content.audio
  const objects = () => content.objects
  const rng = (n) => content.rng(n)

  const WalkerStart = C.WALKER_START_V

  // --- every Lingo global that drives gameplay (GameState) ---
  const s = {
    counter: 0, speed: 1, score: 0, direction: 1, object: 0,
    sideCheck: 1, soundCheck: 0, stepCount: 0, step: 0, variatie: 1,
    exciteCount: 0, death: 0, level: 1,
    walkerV: WalkerStart, carX: 0, blend: 100,
    walkerFrame: 'a', walkerBlend: 100, walkerFlipH: false, walkerFlipV: false,
    car: null, sound2Chosen: null,
    // persist across games (the original never cleared these between games)
    burbMode: 0, holdScore: 0, playtime: 0,
  }

  // input: held arrows + a pending "speak score" request, set by the game screen
  const input = {up: false, down: false}

  let phaseState = 'attract'
  let musicVolume = 80
  let lastLevel = 0
  let best = 0
  let wasNewBest = false

  function resetState() {
    s.counter = 0; s.speed = 1
    s.score = s.holdScore // gScore = 0 + gHoldScore
    s.direction = 1; s.object = 0
    s.sideCheck = 1; s.soundCheck = 0; s.stepCount = 0; s.step = 0
    s.variatie = 1; s.exciteCount = 0; s.death = 0; s.level = 1
    s.walkerV = WalkerStart; s.carX = 0; s.blend = 100
    s.walkerFrame = 'a'; s.walkerBlend = 100; s.walkerFlipH = false; s.walkerFlipV = false
    s.car = null; s.sound2Chosen = null
  }

  // --- lifecycle ----------------------------------------------------------

  function playTitle() {
    phaseState = 'attract'
    // music bed under the menu (looped).
    sound().puppetSound(8, s.burbMode ? 'theburbgamemix' : 'music')
    sound().volume(8, 80)
    sound().pan(8, 0)
  }

  function start() {
    // gPlaytime counted the attract arrivals before each game (orig frame 40),
    // so the warthog (and burp mode) becomes reachable from the 3rd game. We
    // count it per round-start, which reaches the same "3rd game" unlock.
    s.playtime += 1
    resetState()
    // base channel mix from startMovie / the startloop reset
    sound().stop(7)
    sound().volume(1, 0); sound().pan(1, 0)
    sound().volume(2, 50)
    sound().volume(3, 200); sound().pan(3, 0)
    sound().volume(4, 130); sound().pan(4, 0) // footsteps
    sound().volume(5, 150); sound().pan(5, 0) // win / lose
    sound().volume(6, 150)
    musicVolume = 80
    sound().puppetSound(8, s.burbMode ? 'theburbgamemix' : 'music')
    sound().volume(8, 80); sound().pan(8, 0)
    lastLevel = 1
    phaseState = 'generate'
    content.announce.status(s.burbMode ? app.i18n.t('ann.burp') : app.i18n.t('ann.go'))
  }

  function tick() {
    switch (phaseState) {
      case 'generate': stepGenerate(); break
      case 'moveTo': stepMoveTo(); break
      case 'moveFrom': stepMoveFrom(); break
      case 'reset': stepReset(); break
      case 'death': stepDeath(); break
      case 'attract':
      case 'gameover': break
    }
  }

  // --- frame 5: Generate --------------------------------------------------

  function stepGenerate() {
    keyCheck(); sideCheck(); generate(); collCheck()
    phaseState = 'moveTo'
  }

  function generate() {
    defineLevel()
    s.object = rng(s.variatie)
    s.direction = rng(2)
    let car = objects().CARS[s.object]

    if (s.object === 7 && s.playtime >= 3 && rng(2) === 2) {
      s.object = 999
      car = objects().WARTHOG_999
    }

    s.car = car
    s.blend = car.blend ? car.blend(s.level) : 100
    s.speed = car.speed(s.level, rng)

    sound().puppetSound(1, car.sound1)
    let s2 = null
    if (car.sound2) {
      s2 = typeof car.sound2 === 'string'
        ? car.sound2
        : car.sound2[rng(car.sound2.length) - 1]
      sound().puppetSound(2, s2)
    }
    s.sound2Chosen = s2

    s.carX = s.direction === 1 ? -80 : 400 // spawn off the edge it drives in from
  }

  function defineLevel() {
    let level = 1
    for (const t of C.LEVEL_THRESHOLDS) {
      if (s.score >= t.score) { level = t.level; break }
    }
    s.level = level
    s.variatie = C.variatieForLevel(level)

    if (level !== lastLevel) {
      lastLevel = level
      content.announce.status(app.i18n.t('ann.level', {level}))
    }
  }

  // --- frame 6: Move To Centre --------------------------------------------

  function stepMoveTo() {
    keyCheck(); sideCheck(); collCheck()
    if (s.counter < 100) {
      s.counter += s.speed
      moveTo()
      exciteCount()
    } else {
      phaseState = 'moveFrom'
    }
  }

  function moveTo() {
    const vol = s.counter * C.VOLUME_PER_COUNTER
    sound().volume(1, vol); sound().volume(2, vol); sound().volume(3, vol)
    if (s.direction === 1) {
      const pan = -100 + s.counter
      sound().pan(1, pan); sound().pan(2, pan); sound().pan(3, pan)
      s.carX += s.speed * C.VOLUME_PER_COUNTER
    } else {
      const pan = 100 - s.counter
      sound().pan(1, pan); sound().pan(2, pan); sound().pan(3, pan)
      s.carX -= s.speed * C.VOLUME_PER_COUNTER
    }
  }

  // --- frame 7: Move From Centre ------------------------------------------

  function stepMoveFrom() {
    keyCheck(); sideCheck(); collCheck()
    if (s.counter > 0) {
      s.counter -= s.speed
      moveFrom()
      exciteCount()
    } else {
      sound().stop(1); sound().stop(2)
      sound().volume(1, 0); sound().volume(2, 0)
      phaseState = 'reset'
    }
  }

  function moveFrom() {
    const vol = s.counter * C.VOLUME_PER_COUNTER
    sound().volume(1, vol); sound().volume(2, vol)
    if (s.direction === 1) {
      const pan = 100 - s.counter
      sound().pan(1, pan); sound().pan(2, pan); sound().pan(3, pan)
      s.carX += s.speed * 2
    } else {
      const pan = -100 + s.counter
      sound().pan(1, pan); sound().pan(2, pan); sound().pan(3, pan)
      s.carX -= s.speed * 2
    }
  }

  // --- frame 8: Reset & Continue ------------------------------------------

  function stepReset() {
    keyCheck(); sideCheck(); collCheck()
    s.counter = 0
    if (s.death === 1) {
      if (s.object === 999) {
        s.burbMode = 1 // dying to the warthog flips into burp mode...
        s.holdScore = s.score // ...and carries the score over
      }
      musicVolume = 80
      phaseState = 'death'
    } else {
      phaseState = 'generate'
    }
  }

  // --- frame 10: death1 (fade music) --------------------------------------

  function stepDeath() {
    sound().stop(1); sound().stop(2); sound().stop(3)
    musicVolume -= 1
    sound().volume(8, musicVolume)
    if (musicVolume <= 0) enterGameOver()
  }

  function enterGameOver() {
    sound().stop(8)
    const prevBest = best
    const isNewBest = s.score > prevBest
    wasNewBest = isNewBest
    if (isNewBest) setBest(s.score)
    content.announce.gameOver(s.score, isNewBest)
    phaseState = 'gameover'
  }

  // --- shared handlers (called every frame) -------------------------------

  function keyCheck() {
    if (s.death !== 0) return

    if (input.down) {
      if (s.walkerV >= C.WALKER_BOTTOM) {
        s.walkerV = C.WALKER_BOTTOM
        if (s.sideCheck === 2) { s.sideCheck = 1; s.soundCheck = 1 }
      } else {
        s.walkerV += C.STEP_SIZE
        s.stepCount -= 1
        if (s.stepCount + 6 <= 0) { s.step -= 1; playStep(); s.stepCount = 0 }
        if (s.stepCount + 2 <= 0) s.walkerFrame = 'a'
        if (s.stepCount + 4 <= 0) s.walkerFrame = 'b'
      }
    }

    if (input.up) {
      if (s.walkerV <= C.WALKER_TOP) {
        s.walkerV = C.WALKER_TOP
        if (s.sideCheck === 1) { s.sideCheck = 2; s.soundCheck = 1 }
      } else {
        s.walkerV -= C.STEP_SIZE
        s.stepCount += 1
        if (s.stepCount - 6 >= 0) { s.step += 1; playStep(); s.stepCount = 0 }
        if (s.stepCount - 2 >= 0) s.walkerFrame = 'b'
        if (s.stepCount - 4 >= 0) s.walkerFrame = 'a'
      }
    }
  }

  function sideCheck() {
    // both branches: a curb was just reached (soundCheck set by keyCheck) ->
    // award and play the win sound.
    if (s.soundCheck === 1) {
      playWin()
      s.soundCheck = 0
      s.score += C.SCORE_PER_CROSSING
    }
  }

  function collCheck() {
    if (s.death !== 0) return
    if (intersects()) {
      sound().puppetSound(5, 'lose')
      s.walkerFrame = 'death'
      s.walkerBlend = 90
      s.walkerFlipH = s.direction === 1
      s.walkerFlipV = s.walkerV < 120
      s.death = 1
    }
  }

  function intersects() {
    const car = s.car
    if (!car) return false
    const wl = C.PLAYER_X - C.WALKER_W / 2, wr = C.PLAYER_X + C.WALKER_W / 2
    const wt = s.walkerV - C.WALKER_H / 2, wb = s.walkerV + C.WALKER_H / 2
    const cl = s.carX - car.w / 2, cr = s.carX + car.w / 2
    const ct = C.CAR_Y - car.h / 2, cb = C.CAR_Y + car.h / 2
    return wl < cr && wr > cl && wt < cb && wb > ct
  }

  function exciteCount() {
    if (s.death !== 0) return
    if (s.exciteCount - C.EXCITE_LIMIT > 0) {
      s.exciteCount = 0
      s.score -= C.EXCITE_PENALTY
      if (s.score <= 0) s.score = 0
    } else {
      s.exciteCount += 1
    }
  }

  function playWin() {
    if (s.burbMode === 0) {
      sound().puppetSound(5, 'win')
    } else {
      const i = rng(17) // random(17)
      sound().puppetSound(5, 'burp' + i)
    }
  }

  function playStep() {
    if (s.step >= 1 && s.step <= 5) sound().puppetSound(4, 'i' + s.step)
  }

  // --- best score (high score only, localStorage) -------------------------

  const BEST_KEY = 'curb.best'
  function loadBest() {
    try {
      const n = parseInt(localStorage.getItem(BEST_KEY) || '0', 10)
      best = Number.isFinite(n) ? n : 0
    } catch (e) { best = 0 }
    return best
  }
  function setBest(v) {
    best = v
    try { localStorage.setItem(BEST_KEY, String(v)) } catch (e) {}
  }

  // --- public -------------------------------------------------------------

  return {
    state: s,
    input,
    loadBest,
    get best() { return best },
    get phase() { return phaseState },
    isPlaying: () => phaseState !== 'attract' && phaseState !== 'gameover',
    playTitle, start, tick,
    speakScore() { content.announce.announceScore(s.score) },
    get view() {
      return {
        phase: phaseState, score: s.score, level: s.level,
        burbMode: s.burbMode === 1,
        walkerX: C.PLAYER_X, walkerV: s.walkerV, walkerFrame: s.walkerFrame,
        carX: s.carX, carY: C.CAR_Y, car: s.car, direction: s.direction,
        best, wasNewBest,
      }
    },
  }
})()
