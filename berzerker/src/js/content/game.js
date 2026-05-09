// Top-level game state machine. Owns score, lives, current room number,
// extra-life thresholds, and the room transition flow:
//   intro → ready → play → death → next | gameOver
//
// Flow:
//  - `start()` resets state, generates room 1, dispatches `ready` to the
//    screen FSM.
//  - The `ready` screen counts down ~1.6s of "GET READY", then dispatches
//    `begin` → `game`.
//  - `game.onFrame` runs `tick(dt)` here, which advances player → robots →
//    Otto and emits events.
//  - On `player-died` we decrement lives. lives > 0 → respawn in same room
//    (preserving robots). lives = 0 → `endGame`.
//  - On `exit-crossed` we transition to the next room (same screen, just
//    re-generate). If robots remained alive we set the "fled" flag so Otto
//    persists.
content.game = (() => {
  const R = () => content.room
  const P = () => content.player
  const O = () => content.otto
  const ROBOTS = () => content.robots
  const SFX = () => content.sfx
  const VOICE = () => content.voice
  const WV = () => content.wallVoice

  const state = {
    score: 0,
    lives: 3,
    room: 1,
    seed: 0,
    started: false,
    paused: false,
    pendingExit: null, // dir if player crossed an exit this frame
    pendingRespawn: false,
    pendingGameOver: false,
    fledLastRoom: false,
    extraLifeThresholds: [5000, 15000, 30000, 50000, 75000, 100000, 150000],
    nextExtraLifeAt: 5000,
    killsThisRoom: 0,
    kills: 0,
    robotsThisRoom: 0,
    debugEmpty: false, // hidden D-key mode: empty rooms, no Otto, no robots
  }

  function reset() {
    state.score = 0
    state.lives = 3
    state.room = 1
    state.seed = (Math.random() * 0xFFFFFFFF) >>> 0
    state.paused = false
    state.pendingExit = null
    state.pendingRespawn = false
    state.pendingGameOver = false
    state.fledLastRoom = false
    state.nextExtraLifeAt = state.extraLifeThresholds[0]
    state.killsThisRoom = 0
    state.kills = 0
    state.robotsThisRoom = 0
    O().reset()
  }

  function buildRoom(seed, depth) {
    R().generate(seed, depth)
    if (state.debugEmpty) {
      ROBOTS().clear()
      O().reset()
    } else {
      ROBOTS().spawnWave(depth)
      O().enterRoom(state.fledLastRoom && depth > 1)
    }
    state.robotsThisRoom = ROBOTS().aliveCount()
    state.killsThisRoom = 0
    P().reset(R().spawn())
    state.fledLastRoom = false
    if (content.exitProbe) content.exitProbe.reset()
    if (content.exitChord) content.exitChord.reset()
  }

  function start() {
    reset()
    state.debugEmpty = false
    P().setLives(state.lives)
    buildRoom(state.seed ^ state.room, state.room)
    state.started = true
  }

  // Hidden debug entry: same as start() but every room is generated empty —
  // no robots, no Otto. Lets the player walk around and learn the exit-gap
  // / wall layout without combat pressure. Triggered by the D key on the
  // main menu.
  function startDebugEmpty() {
    reset()
    state.debugEmpty = true
    P().setLives(state.lives)
    buildRoom(state.seed ^ state.room, state.room)
    state.started = true
  }

  function isStarted() { return state.started }

  function addScore(delta) {
    state.score += delta
    while (state.score >= state.nextExtraLifeAt) {
      state.lives++
      P().setLives(state.lives)
      SFX().extraLifeJingle()
      app.announce.assertive(app.i18n.t('ann.extraLife'))
      const idx = state.extraLifeThresholds.indexOf(state.nextExtraLifeAt)
      if (idx >= 0 && idx < state.extraLifeThresholds.length - 1) {
        state.nextExtraLifeAt = state.extraLifeThresholds[idx + 1]
      } else {
        state.nextExtraLifeAt = state.score + 50000
      }
    }
  }

  function onRobotKilled(ev) {
    if (ev.byWall) {
      // No score for wall-killed robots — that's the Berzerk rule.
      return
    }
    addScore(50)
    state.killsThisRoom++
    state.kills++
    if (Math.random() < 0.25) {
      // A surviving robot vows revenge — but wait until the dying
      // robot's curse has finished so the two voices don't collide.
      const live = ROBOTS().list().filter((r) => r.alive)
      if (live.length) {
        const survivor = live[Math.floor(Math.random() * live.length)]
        const delayMs = ((ev.curseDur || 0) + 0.25) * 1000
        setTimeout(() => {
          if (survivor.alive) VOICE().bark('killAlly', survivor)
        }, delayMs)
      }
    }
  }

  function onPlayerDying(ev) {
    if (ev.cause === 'wall') app.announce.assertive(app.i18n.t('ann.caughtByWall'))
    else if (ev.cause === 'laser') app.announce.assertive(app.i18n.t('ann.caughtByLaser'))
    else if (ev.cause === 'otto') app.announce.assertive(app.i18n.t('ann.caughtByOtto'))
    // Robots crow on a kill (laser-only — wall-deaths and Otto-deaths
    // aren't a robot's doing). Pick the closest alive robot so the bark
    // localises near the actual shooter.
    if (ev.cause === 'laser') {
      const live = ROBOTS().list().filter((r) => r.alive)
      if (live.length) {
        let best = null, bestD = Infinity
        for (const r of live) {
          const d = (r.x - ev.x) ** 2 + (r.y - ev.y) ** 2
          if (d < bestD) { bestD = d; best = r }
        }
        if (best) VOICE().bark('playerKilled', best)
      }
    }
  }

  function onPlayerDied(_ev) {
    state.lives--
    P().setLives(state.lives)
    if (state.lives <= 0) {
      state.pendingGameOver = true
    } else {
      state.pendingRespawn = true
    }
  }

  function onExitCrossed(ev) {
    if (state.pendingExit) return
    state.pendingExit = ev.dir
  }

  function nextRoom() {
    // Cleared room if no robots remain.
    const cleared = ROBOTS().aliveCount() === 0
    if (cleared && state.robotsThisRoom > 0) {
      const bonus = state.robotsThisRoom * 10
      addScore(bonus)
      SFX().roomClearedFanfare()
      app.announce.polite(app.i18n.t('ann.roomCleared', {bonus}))
    }
    state.fledLastRoom = !cleared
    state.room++
    // Silence transient voices but keep Otto's prox prop (we'll rebuild
    // exits which destroys their props; player position resets).
    A_silenceTransients()
    buildRoom(state.seed ^ state.room, state.room)
    app.screenManager.dispatch('readyNext')
  }

  function A_silenceTransients() {
    // Don't silence Otto's prox — it persists if Otto is alive.
    // wallVoice voices are owned by wallVoice.js and rebuilt by frame() each tick
    WV().destroyAll()
    if (content.exitChord) content.exitChord.destroyAll()
  }

  function pause() { state.paused = true }
  function resume() { state.paused = false }

  // Per-frame tick. Driven by the `game` screen's onFrame.
  function tick(dt) {
    if (!state.started || state.paused) return

    P().update(dt)
    if (!state.debugEmpty) {
      ROBOTS().update(dt)
      O().update(dt)
    }

    // The wall-buzz pool retargets each frame to the player's nearest
    // walls — keep audible cue current.
    WV().frame()

    // Probe cardinal exits and announce on change while moving.
    if (content.exitProbe) content.exitProbe.frame()

    // Exit-chord beacons — only audible when the room is cleared.
    if (content.exitChord) content.exitChord.frame()

    // Exit transition deferred so it fires after audio routing is stable.
    if (state.pendingExit) {
      state.pendingExit = null
      nextRoom()
      return
    }
    if (state.pendingRespawn) {
      state.pendingRespawn = false
      // Respawn in same room — keep robots, regenerate Otto state.
      P().reset(R().spawn())
    }
    if (state.pendingGameOver) {
      state.pendingGameOver = false
      endGame()
    }
  }

  function endGame() {
    SFX().gameOverJingle()
    app.announce.assertive(app.i18n.t('ann.gameOverShort'))
    state.started = false
    A_silenceTransients()
    O().reset()
    app.screenManager.dispatch('gameOver', {score: state.score, room: state.room, kills: state.kills})
  }

  function getScore() { return state.score }
  function getLives() { return state.lives }
  function getRoom() { return state.room }

  return {
    state,
    reset,
    start,
    startDebugEmpty,
    tick,
    pause,
    resume,
    addScore,
    isStarted,
    getScore,
    getLives,
    getRoom,
    onRobotKilled,
    onPlayerDying,
    onPlayerDied,
    onExitCrossed,
  }
})()
