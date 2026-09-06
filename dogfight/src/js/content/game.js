content.game = (() => {
  const M = () => content.math
  const config = {
    gunRange: 20,
    gunCone: 0.40,
    gunDamage: 6,
    gunCooldown: 0.18,
    missileRange: 48,
    missileCone: 0.42,
    missileDamage: 40,
    missileCooldown: 1.2,
    missileSpeed: 18,
    missileTurnRate: 1.0,
    missileLifetime: 3.0,
    missileHitRadius: 0.6,
    // Boost cuts missile tracking significantly — a fast-accelerating
    // target is much harder for a pure-pursuit missile to lead.
    missileBoostTurnPenalty: 0.9,
    // Sharp-turn window also degrades tracking briefly.
    missileSharpTurnPenalty: 1.3,
  }

  const api = {
    cars: [],
  }

  let playerCar = null
  let targeting = null
  let running = false
  let paused = false
  let score = 0
  let onRoundOver = () => {}
  let missiles = []
  let nextLockToneAt = 0
  let roundEnding = false
  let lastLockedId = null
  let gunsFiring = false
  let gunHeat = 0
  const GUN_HEAT_MAX = 100
  const GUN_HEAT_RATE = 50
  const GUN_COOL_RATE = 35
  let boostCooldownAt = 0
  const BOOST_DURATION = 0.6
  const BOOST_COOLDOWN = 5
  const BOOST_IMPULSE = 12
  let playerStability = 100
  let playerSpinning = false
  const STABILITY_SHARP_TURN_COST = 15
  const STABILITY_TURNAROUND_COST = 30
  const STABILITY_RECOVERY_RATE = 8

  // Team / round state
  let mode = 'ffa'
  let currentRound = 1
  let playerRoundWins = 0
  let enemyRoundWins = 0
  let lastOptions = {}
  let killCount = 0
  let survivalChallengerIndex = 0
  let survivalSpawnQueue = []

  // Networking state. "Lightweight host-authoritative": the host runs the
  // full simulation and hard-syncs all planes to clients at 30 Hz. Clients
  // skip physics/AI/missiles entirely — they apply snapshots, replay a
  // small event list (for sounds/announcements snapshots can't carry), and
  // route their own input/actions back to the host over the data channel.
  const SNAP_INTERVAL = 1 / 30
  let role = null                    // 'host' | 'client' | null
  let isMultiplayer = false
  let selfId = null
  let snapAccum = 0
  let netListeners = null
  let remoteInputs = new Map()       // host: peerId → {throttle, steering, seen}
  let clientPlanes = new Map()       // host: peerId → plane
  let planeById = new Map()          // all roles: plane.id → plane
  let remoteGunTimers = new Map()    // client: plane.id → interval
  let clientMissiles = new Map()     // client: missile id → true (voice reconcile)
  let clientMissilePos = new Map()   // client: missile id → {x, y}
  let survivalTeamKills = 0
  // Host: events queued for the next snapshot broadcast.
  const pendingEvents = []

  function t(key, params) {
    return app.i18n ? app.i18n.t(key, params) : key
  }

  function isSurvival() { return mode === 'survival' }

  function normalizeMpMode(m) {
    if (m === 'survival') return 'survival'
    if (m === 'teamDm') return 'teamDm'
    return 'ffa'
  }

  // Team kills: single-player tracks the host's own kills; multiplayer
  // survival is co-op, so everyone shares one team counter.
  function teamKills() {
    return isMultiplayer ? survivalTeamKills : killCount
  }

  function noHumansAlive() {
    return !api.cars.some((p) => p.human && !p.eliminated)
  }

  // addScore writes to the right store: the module `score` scalar in
  // single-player (legacy) or the per-plane `plane.score` in multiplayer
  // (mutated only on the host; authoritative value arrives in snapshots).
  function addScore(plane, amount) {
    if (!plane) return
    if (isMultiplayer) {
      plane.score = (plane.score || 0) + (amount || 0)
    } else {
      score += (amount || 0)
    }
  }

  // Push an event onto the snapshot queue (host only). Clients replay the
  // same audio/announcement side effects from `pendingEvents` in each
  // snapshot. Payload fields must be JSON-serializable and must NOT be
  // named `type` (it's clobbered by the event name on the wire).
  function netEvent(type, payload) {
    if (role !== 'host' || !isMultiplayer) return
    pendingEvents.push({type, ...(payload || {})})
  }

  function start({aiOpponents = 0, controllers = null, selfId: self = null, role: gameRole = null, mode: gameMode = 'ffa'} = {}) {
    end({silent: true})
    mode = gameMode
    running = true
    paused = false
    roundEnding = false
    score = 0
    missiles = []
    nextLockToneAt = 0
    lastLockedId = null
    playerStability = 100
    playerSpinning = false
    killCount = 0
    survivalTeamKills = 0
    survivalChallengerIndex = 0
    survivalSpawnQueue = []
    isMultiplayer = !!controllers
    if (gameRole != null) role = gameRole
    selfId = self
    snapAccum = 0
    pendingEvents.length = 0
    lastOptions = controllers
      ? {controllers, selfId: self, role: gameRole, mode}
      : {aiOpponents, mode}

    content.arena.selectMap('large')
    api.cars = []
    planeById = new Map()
    clientPlanes = new Map()
    remoteInputs = new Map()
    playerCar = null

    let myTeam = null
    if (controllers) {
      for (const c of controllers) {
        if (c.id === selfId) myTeam = c.team || null
      }
      buildControllerPlanes(controllers, myTeam)
      // Seed per-peer remote input records so the host always has a slot
      // to write into (and zeroes for peers that haven't spoken yet).
      for (const [peerId, plane] of clientPlanes) {
        remoteInputs.set(peerId, {throttle: 0, steering: 0, seen: false})
      }
    } else if (mode === 'teamDm') {
      // 2v2 team mode: player + 1 wingman vs 2 enemy AI
      const spawns = content.arena.spawnPoints(4)
      const teamConfigs = [
        {id: 'player', label: t('label.you'), controller: 'player', profileIndex: 0, team: 'player', friendly: false, human: true},
        {id: 'ai-wingman', label: t('label.wingman'), controller: 'ai', profileIndex: 5, team: 'player', friendly: true, human: false},
        {id: 'ai-1', label: t('label.bandit', {n: 1}), controller: 'ai', profileIndex: 1, team: 'enemy', friendly: false, human: false},
        {id: 'ai-2', label: t('label.bandit', {n: 2}), controller: 'ai', profileIndex: 2, team: 'enemy', friendly: false, human: false},
      ]
      for (let i = 0; i < teamConfigs.length; i++) {
        const cfg = teamConfigs[i]
        const isPlayer = cfg.controller === 'player'
        const plane = content.car.create({
          id: cfg.id,
          label: cfg.label,
          controller: cfg.controller,
          profileIndex: cfg.profileIndex,
          position: {x: spawns[i].x, y: spawns[i].y},
          heading: spawns[i].heading,
          health: 180,
          radius: 1.15,
          friendly: cfg.friendly,
          human: cfg.human,
        })
        plane.team = cfg.team
        plane.throttle = isPlayer ? 0.45 : 0.5
        api.cars.push(plane)
        planeById.set(plane.id, plane)
        if (isPlayer) playerCar = plane
      }
      // Wingman gets 5 missiles like player
      const wingman = api.cars.find((p) => p.id === 'ai-wingman')
      if (wingman) wingman.ammo.missiles = 5
      // Enemies get 4 each
      for (const plane of api.cars) {
        if (plane.controller === 'ai' && plane.team === 'enemy') {
          plane.ammo.missiles = 4
        }
      }
    } else {
      const count = Math.max(1, Math.min(6, aiOpponents + 1))
      const spawns = content.arena.spawnPoints(count)
      for (let i = 0; i < count; i++) {
        const isPlayer = i === 0
        const plane = content.car.create({
          id: isPlayer ? 'player' : `ai-${i}`,
          label: isPlayer ? t('label.you') : t('label.ai', {n: i}),
          controller: isPlayer ? 'player' : 'ai',
          profileIndex: i,
          position: {x: spawns[i].x, y: spawns[i].y},
          heading: spawns[i].heading,
          health: 180,
          radius: 1.15,
          human: isPlayer,
        })
        plane.throttle = isPlayer ? 0.45 : 0.5
        api.cars.push(plane)
        planeById.set(plane.id, plane)
        if (isPlayer) playerCar = plane
      }
    }

    // AI instances exist only where the simulation runs. On a client all
    // planes are snapshot-driven, so creating an ai object would just make
    // it waste CPU writing inputs nobody reads.
    for (const plane of api.cars) {
      if (plane.controller === 'ai' && role !== 'client') {
        plane.ai = content.ai.create(plane, api, plane.team)
      }
    }

    targeting = content.targeting.create(api)
    updateAudioStage()
    content.sounds.roundStart()

    if (isMultiplayer) {
      if (mode === 'teamDm') {
        content.announcer.say(t('ann.mpTeamStart', {round: currentRound}), 'assertive')
      } else if (isSurvival()) {
        content.announcer.say(t('ann.survivalRoundStartMp'), 'assertive')
      } else {
        const enemies = api.cars.filter((p) => p.id !== selfId && !p.friendly).length
        content.announcer.say(
          t(enemies === 1 ? 'ann.roundStart1' : 'ann.roundStartN', {count: enemies}),
          'assertive',
        )
      }
      setTimeout(() => sweep(), 900)
    } else if (mode === 'teamDm') {
      if (currentRound === 1) {
        content.announcer.say(t('ann.roundTeam1'), 'assertive')
      } else {
        content.announcer.say(t('ann.roundTeamN', {round: currentRound}), 'assertive')
      }
      setTimeout(() => sweep(), 900)
    } else if (isSurvival()) {
      const key = aiOpponents === 1 ? 'ann.survivalRoundStart1' : 'ann.survivalRoundStartN'
      content.announcer.say(t(key, {count: aiOpponents}), 'assertive')
      setTimeout(() => sweep(), 900)
    } else if (aiOpponents <= 0) {
      content.announcer.say(t('ann.sandbox'), 'assertive')
    } else {
      content.announcer.say(
        t(aiOpponents === 1 ? 'ann.roundStart1' : 'ann.roundStartN', {count: aiOpponents}),
        'assertive',
      )
      setTimeout(() => sweep(), 900)
    }

    attachNet()
  }

  // Build the plane roster from the multiplayer controllers list. Each
  // controller is {id, type: 'player'|'remote'|'ai', label, team,
  // human, peerId?}. The listener's own plane is always controller
  // 'player' (it owns its input locally); everyone else is 'ai' (host
  // simulates) or 'remote' (host awaits inputs). teamDm wingmen carry
  // friendly=true for whatever team they are on.
  function buildControllerPlanes(controllers, myTeam) {
    const count = Math.max(1, Math.min(8, controllers.length))
    const spawns = content.arena.spawnPoints(count)
    for (let i = 0; i < controllers.length; i++) {
      const c = controllers[i]
      const isSelf = c.id === selfId
      const isHuman = !!c.human || c.type === 'player'
      const friendly = !!(c.team && myTeam && c.team === myTeam && c.type === 'ai')
      const plane = content.car.create({
        id: c.id,
        label: c.label || t('label.ai', {n: i + 1}),
        controller: isSelf ? 'player' : (c.type === 'ai' ? 'ai' : 'remote'),
        profileIndex: i,
        position: {x: spawns[i].x, y: spawns[i].y},
        heading: spawns[i].heading,
        health: 180,
        radius: 1.15,
        friendly,
        human: isHuman,
      })
      plane.team = c.team || null
      plane.throttle = isSelf ? 0.45 : 0.5
      api.cars.push(plane)
      planeById.set(plane.id, plane)
      if (isSelf) playerCar = plane
      if (c.peerId && role === 'host') clientPlanes.set(c.peerId, plane)
    }
  }

  function resetMatch() {
    currentRound = 1
    playerRoundWins = 0
    enemyRoundWins = 0
  }

  function nextRound() {
    if (role === 'client' && isMultiplayer) return  // wait for the host's rebroadcast
    currentRound++
    start(lastOptions)
    if (role === 'host' && isMultiplayer && app.net) {
      app.net.broadcast({
        type: 'start',
        selfId,
        controllers: stripControllers(lastOptions.controllers),
        mode,
      })
    }
  }

  function getMatchState() {
    return {mode, currentRound, playerRoundWins, enemyRoundWins}
  }

  function setRole(r) {
    role = r || null
  }

  // Strip host-side peerIds from controllers before sending over the wire.
  function stripControllers(controllers) {
    return (controllers || []).map((c) => {
      const {peerId, ...rest} = c
      return rest
    })
  }

  function end({silent = false} = {}) {
    if (!running && !api.cars.length) return
    running = false
    paused = false
    gunsFiring = false
    gunHeat = 0
    roundEnding = false
    content.sounds.stopMachineGun()
    content.sounds.destroyAllMissileVoices()
    stopAllRemoteGunVoices()
    clientMissiles.clear()
    clientMissilePos.clear()
    if (targeting) {
      targeting.destroy()
      targeting = null
    }
    for (const plane of api.cars) content.car.destroy(plane)
    api.cars = []
    missiles = []
    planeById = new Map()
    playerCar = null
    killCount = 0
    survivalTeamKills = 0
    survivalChallengerIndex = 0
    survivalSpawnQueue = []
    remoteInputs.clear()
    clientPlanes.clear()
    detachNet()
    role = null
    if (!silent) content.announcer.say(t('game.ended'), 'polite')
  }

  function applyPlayerInput(input) {
    if (!playerCar || playerCar.eliminated) return
    if (role === 'client' && app.net) {
      app.net.sendToHost({
        type: 'input',
        t: engine.time(),
        throttle: input.throttle || 0,
        steering: engine.fn.clamp(input.steering || 0, -1, 1),
      })
      return
    }
    if (playerSpinning) {
      playerCar.input.steering = 1
      return
    }
    playerCar.input.throttle = input.throttle || 0
    playerCar.input.steering = engine.fn.clamp(input.steering || 0, -1, 1)
  }

  function performSharpTurn(dir) {
    if (!playerCar || playerCar.eliminated || playerSpinning) return false
    if (role === 'client' && app.net) {
      content.sounds.whoosh()
      app.net.sendToHost({type: 'action', action: 'sharpTurn', dir, t: engine.time()})
      return true
    }
    playerCar.heading += dir * 0.45
    playerCar.sharpTurnEvadeUntil = engine.time() + 0.75
    content.sounds.whoosh()
    playerStability = Math.max(0, playerStability - STABILITY_SHARP_TURN_COST)
    if (playerStability <= 0) {
      enterSpin()
    }
    return true
  }

  function performTurnaround() {
    if (!playerCar || playerCar.eliminated || playerSpinning) return false
    if (role === 'client' && app.net) {
      content.sounds.whoosh()
      app.net.sendToHost({type: 'action', action: 'turnaround', t: engine.time()})
      return true
    }
    playerCar.heading += Math.PI
    content.sounds.whoosh()
    playerStability = Math.max(0, playerStability - STABILITY_TURNAROUND_COST)
    if (playerStability <= 0) {
      enterSpin()
    }
    return true
  }

  function sharpTurnRemote(plane, dir) {
    if (!plane || plane.eliminated) return false
    plane.heading += dir * 0.45
    plane.sharpTurnEvadeUntil = engine.time() + 0.75
    return true
  }

  function turnaroundRemote(plane) {
    if (!plane || plane.eliminated) return false
    plane.heading += Math.PI
    return true
  }

  function enterSpin() {
    if (playerSpinning) return
    playerSpinning = true
    playerStability = 0
    content.announcer.say(t('ann.spin'), 'assertive')
  }

  function exitSpin() {
    if (!playerSpinning) return
    playerSpinning = false
    playerStability = 40
    content.announcer.say(t('ann.recovered'), 'assertive')
  }

  function updateGuns(delta) {
    if (role === 'client') {
      // Sound-only: the authoritative fire loop (heat, ammo, damage) runs
      // on the host; this mirrors the machine-gun cadence locally off the
      // snapshot's fri flag.
      if (playerCar && !playerCar.eliminated && playerCar.fri) {
        content.sounds.startMachineGun(playerCar.position)
      } else {
        content.sounds.stopMachineGun()
      }
      return
    }
    if (!playerCar || playerCar.eliminated) {
      if (gunsFiring) { gunsFiring = false; content.sounds.stopMachineGun() }
      return
    }
    const now = engine.time()

    if (gunsFiring) {
      if (gunHeat < GUN_HEAT_MAX) {
        gunHeat = Math.min(GUN_HEAT_MAX, gunHeat + GUN_HEAT_RATE * delta)
        const lock = bestLock(playerCar)
        if (lock && lock.info.inGunCone && now >= (playerCar.ammo.nextGunAt || 0)) {
          playerCar.ammo.nextGunAt = now + config.gunCooldown
          damagePlane(lock.target, config.gunDamage+M().randInt(0, 4), playerCar, 'gun')
        }
        content.sounds.startMachineGun(playerCar.position)
      } else {
        content.sounds.stopMachineGun()
        content.announcer.say(t('ann.gunsOverheated'), 'assertive')
        gunsFiring = false
      }
    } else {
      if (gunHeat > 0) {
        gunHeat = Math.max(0, gunHeat - GUN_COOL_RATE * delta)
        if (gunHeat <= 0) {
          content.announcer.say(t('ann.gunsCooled'), 'polite')
          content.sounds.gunsCooled()
        }
      }
    }
  }

  // Host-only: simulate a remote player's machine-gun loop (heat,
  // damage, one-shot gun crack) from their startGuns / stopGuns actions.
  function updateRemoteGuns(delta) {
    const now = engine.time()
    for (const plane of api.cars) {
      if (plane.controller !== 'remote' || plane.eliminated) continue
      if (plane.gunFiring) {
        plane.gunHeat = Math.min(GUN_HEAT_MAX, (plane.gunHeat || 0) + GUN_HEAT_RATE * delta)
        if (plane.gunHeat >= GUN_HEAT_MAX) {
          plane.gunFiring = false
          plane.gunOverheated = true
          netEvent('overheat', {planeId: plane.id})
          continue
        }
        if (now >= (plane.ammo.nextGunAt || 0)) {
          plane.ammo.nextGunAt = now + config.gunCooldown
          const lock = bestLock(plane)
          if (lock && lock.info.inGunCone) {
            damagePlane(lock.target, config.gunDamage+M().randInt(0, 4), plane, 'gun')
          }
          content.sounds.gunCrack(plane.position)
        }
      } else if (plane.gunHeat > 0) {
        plane.gunHeat = Math.max(0, plane.gunHeat - GUN_COOL_RATE * delta)
        if (plane.gunHeat <= 0 && plane.gunOverheated) {
          plane.gunOverheated = false
          netEvent('cooled', {planeId: plane.id})
        }
      }
    }
  }

  function startGuns() {
    if (!running || !playerCar || playerCar.eliminated) return
    if (role === 'client' && app.net) {
      if (gunsFiring) return
      gunsFiring = true
      app.net.sendToHost({type: 'action', action: 'startGuns', t: engine.time()})
      return
    }
    gunsFiring = true
  }

  function stopGuns() {
    if (role === 'client' && app.net) {
      gunsFiring = false
      app.net.sendToHost({type: 'action', action: 'stopGuns', t: engine.time()})
      return
    }
    gunsFiring = false
    content.sounds.stopMachineGun()
  }

  function activateBoost() {
    if (!running || !playerCar || playerCar.eliminated) return false
    const now = engine.time()
    if (now < (playerCar.boostCooldownAt || 0)) {
      content.announcer.say(t('ann.boostCooldown'), 'polite')
      return false
    }
    if (role === 'client' && app.net) {
      app.net.sendToHost({type: 'action', action: 'boost', t: engine.time()})
      return true
    }
    return activateBoostFor(playerCar)
  }

  // Host-side boost application for any plane (local player or a remote
  // player's action). Handles cooldown, impulse, timers, sounds, and the
  // networked boost event.
  function activateBoostFor(plane) {
    if (!plane || plane.eliminated) return false
    const now = engine.time()
    if (now < (plane.boostCooldownAt || 0)) return false
    const hx = Math.cos(plane.heading)
    const hy = Math.sin(plane.heading)
    plane.velocity.x += hx * BOOST_IMPULSE
    plane.velocity.y += hy * BOOST_IMPULSE
    plane.boostUntil = now + BOOST_DURATION
    plane.boostCooldownAt = now + BOOST_COOLDOWN
    content.sounds.boostActivated(plane.position)
    netEvent('boost', {planeId: plane.id})
    if (plane === playerCar) {
      content.announcer.say(t('ann.boostEngaged'), 'assertive')
    }
    return true
  }

  function updateBoost(delta) {
    if (role === 'client') return
    const now = engine.time()
    for (const plane of api.cars) {
      if (!plane || plane.eliminated || !plane.boostUntil) continue
      if (plane.boostUntil > now) {
        const hx = Math.cos(plane.heading)
        const hy = Math.sin(plane.heading)
        plane.velocity.x += hx * config.gunCooldown * 8 * delta
        plane.velocity.y += hy * config.gunCooldown * 8 * delta
      }
    }
  }

  function isBoostReady() {
    if (!playerCar || playerCar.eliminated) return false
    return engine.time() >= (playerCar.boostCooldownAt || 0)
  }

  function update(delta) {
    if (!running || paused) return
    delta = Math.min(0.05, Math.max(0, delta || 0))

    if (role === 'client') {
      updateClient(delta)
      return
    }

    // Apply cached remote inputs into the matching planes before physics.
    for (const [peerId, plane] of clientPlanes) {
      if (plane.eliminated) continue
      const inp = remoteInputs.get(peerId)
      if (inp && inp.seen) {
        plane.input.throttle = inp.throttle || 0
        plane.input.steering = inp.steering || 0
      } else {
        plane.input.throttle = 0
        plane.input.steering = 0
      }
    }

    for (const plane of api.cars) {
      if (plane.ai) plane.ai.update(delta)
    }

    if (playerCar && !playerCar.eliminated) {
      if (playerSpinning) {
        playerCar.heading += 4 * delta
      } else {
        playerStability = Math.min(100, playerStability + STABILITY_RECOVERY_RATE * delta)
      }
    }

    for (const plane of api.cars) {
      content.physics.integrate(plane, delta)
    }

    resolveCollisions()
    updateGuns(delta)
    updateRemoteGuns(delta)
    updateAudioStage()
    updateMissiles(delta)
    if (targeting) targeting.update()
    updateLockTone()
    updateBoost(delta)

    if (isSurvival()) {
      if (survivalSpawnQueue.length) {
        const now = engine.time()
        for (let i = survivalSpawnQueue.length - 1; i >= 0; i--) {
          if (now >= survivalSpawnQueue[i].at) {
            survivalSpawnQueue.splice(i, 1)
            spawnSurvivalChallenger()
          }
        }
      }
      if (noHumansAlive()) {
        roundEnding = true
        const alive = api.cars.filter((p) => !p.eliminated)
        const winner = alive[0] || null
        const standings = api.cars.map((p) => ({
          id: p.id,
          label: p.label,
          team: p.team,
          score: p.human ? teamKills() : Math.max(0, Math.round(p.health)),
          eliminated: !!p.eliminated,
          winner: p === winner,
        }))
        const youWon = false
        if (!isMultiplayer && playerCar && playerCar.eliminated) score = Math.max(0, score - 25)
        if (role === 'host' && isMultiplayer && app.net) {
          app.net.broadcast({type: 'end', mode: 'survival', standings, kills: teamKills()})
        }
        setTimeout(() => {
          if (!running) return
          onRoundOver({
            youWon,
            score: teamKills(),
            standings,
            selfId: playerCar && playerCar.id,
            mode: 'survival',
            kills: teamKills(),
            multiplayer: isMultiplayer,
          })
        }, 900)
        return
      }
      return
    }

    checkRoundEnd()

    if (role === 'host' && isMultiplayer && app.net) {
      broadcastSnapshot(delta)
    }
  }

  // Client-mode frame: no physics/AI/missile simulation. Everything
  // authoritative was already applied by applyHostSnapshot; all that's
  // left is the interactive audio surface (spatial stage, lock tone,
  // self machine-gun, missile voices, remote gun crack loops).
  function updateClient(delta) {
    updateAudioStage()
    updateLockTone()
    updateGuns(delta)
    if (targeting) targeting.update()
    for (const [id, pos] of clientMissilePos) {
      content.sounds.updateMissileVoice(id, pos)
    }
  }

  // ---- Network message handling -------------------------------------

  function attachNet() {
    if (!role || !app.net) return
    detachNet()
    const listeners = {
      message: onNetMessage,
      peerLeave: onNetPeerLeave,
    }
    app.net.on('message', listeners.message)
    app.net.on('peerLeave', listeners.peerLeave)
    netListeners = listeners
  }

  function detachNet() {
    if (netListeners && app.net) {
      app.net.off('message', netListeners.message)
      app.net.off('peerLeave', netListeners.peerLeave)
    }
    netListeners = null
  }

  function onNetMessage({peerId, msg}) {
    if (!msg || !running) return
    if (role === 'host') {
      if (msg.type === 'input') {
        const rec = remoteInputs.get(peerId)
        if (rec) {
          rec.throttle = msg.throttle || 0
          rec.steering = engine.fn.clamp(msg.steering || 0, -1, 1)
          rec.seen = true
        }
      } else if (msg.type === 'action') {
        applyRemoteAction(peerId, msg)
      }
      return
    }
    if (role === 'client') {
      if (msg.type === 'snap') {
        applyHostSnapshot(msg)
      } else if (msg.type === 'start') {
        start({controllers: msg.controllers, selfId: msg.selfId, role: 'client', mode: normalizeMpMode(msg.mode)})
      } else if (msg.type === 'end') {
        onNetEnd(msg)
      }
    }
  }

  // Host: translate a remote peer's action message into the equivalent of
  // the local player's input call.
  function applyRemoteAction(peerId, msg) {
    const plane = clientPlanes.get(peerId)
    if (!plane || plane.eliminated) return
    const a = msg.action
    if (a === 'startGuns') { plane.gunFiring = true; return }
    if (a === 'stopGuns') { plane.gunFiring = false; return }
    if (a === 'boost') { activateBoostFor(plane); return }
    if (a === 'fireMissile') { fireRemoteMissile(plane); return }
    if (a === 'sharpTurn') { sharpTurnRemote(plane, msg.dir || 0); return }
    if (a === 'turnaround') { turnaroundRemote(plane); return }
  }

  // Host: a mid-round disconnect counts as a forfeit — the peer's plane is
  // eliminated and the lobby-that-matters hears about it.
  function onNetPeerLeave({peerId, name}) {
    if (role !== 'host' || !running) return
    const plane = clientPlanes.get(peerId)
    if (!plane || plane.eliminated) return
    content.announcer.say(t('ann.leaverForfeit', {label: plane.label}), 'polite')
    damagePlane(plane, plane.health, null, 'wall')
  }

  // Client: apply a host snapshot. Hard-sync every car and the missile
  // voice pool, then replay the event list into the audio surface.
  function applyHostSnapshot(snap) {
    if (!snap || !Array.isArray(snap.cars)) return
    for (const c of snap.cars) {
      const plane = planeById.get(c.id)
      if (!plane) continue
      plane.position.x = c.x
      plane.position.y = c.y
      plane.velocity.x = c.vx
      plane.velocity.y = c.vy
      plane.heading = c.h
      plane.health = c.hp
      plane.eliminated = !!c.el
      plane.score = c.sc || 0
      plane.boostUntil = c.bo || 0
      plane.input.throttle = (c.th || 0) / 100
      if (plane.ammo) plane.ammo.missiles = c.am

      // Diff gun-fire state for remote crack loops. Self is handled by
      // updateGuns off playerCar.fri.
      const firing = !!c.fri
      if (plane !== playerCar) {
        if (firing && !plane.clientFiring) {
          plane.clientFiring = true
          startRemoteGunVoice(plane)
        } else if (!firing && plane.clientFiring) {
          plane.clientFiring = false
          stopRemoteGunVoice(plane)
        } else if (firing && !plane.eliminated) {
          // position refreshes next tick through plane.position
        }
        if (plane.eliminated && plane.clientFiring) {
          plane.clientFiring = false
          stopRemoteGunVoice(plane)
        }
      } else {
        playerCar.fri = firing
      }
    }

    // Reconcile missile voices against the snapshot's live list.
    const next = snap.missiles || []
    const nextIds = new Set()
    for (const m of next) nextIds.add(m.id)
    for (const id of [...clientMissiles.keys()]) {
      if (!nextIds.has(id)) {
        content.sounds.destroyMissileVoice(id)
        clientMissiles.delete(id)
        clientMissilePos.delete(id)
      }
    }
    for (const m of next) {
      clientMissiles.set(m.id, true)
      clientMissilePos.set(m.id, {x: m.x, y: m.y})
      content.sounds.createMissileVoice(m.id, {x: m.x, y: m.y})
      content.sounds.updateMissileVoice(m.id, {x: m.x, y: m.y})
    }

    for (const ev of snap.events || []) replayEvent(ev)
  }

  function startRemoteGunVoice(plane) {
    if (!remoteGunTimers.has(plane.id)) {
      const crack = () => {
        if (!plane || plane.eliminated) { stopRemoteGunVoice(plane); return }
        content.sounds.gunCrack({x: plane.position.x, y: plane.position.y})
      }
      crack()
      remoteGunTimers.set(plane.id, setInterval(crack, 180))
    }
  }

  function stopRemoteGunVoice(plane) {
    const timer = remoteGunTimers.get(plane.id)
    if (timer) {
      clearInterval(timer)
      remoteGunTimers.delete(plane.id)
    }
  }

  function stopAllRemoteGunVoices() {
    for (const timer of remoteGunTimers.values()) clearInterval(timer)
    remoteGunTimers.clear()
  }

  // Client: replay a combat event produced on the host. Perspective is
  // relative to THIS peer's playerCar, exactly like the host's inline code.
  function replayEvent(ev) {
    if (!ev) return
    const get = (id) => (id == null ? null : planeById.get(id))
    switch (ev.type) {
      case 'hit': {
        const victim = get(ev.victimId)
        const attacker = get(ev.attackerId)
        if (!victim) break
        announceHit(attacker, victim, ev.damage, ev.kind)
        break
      }
      case 'ram': {
        const ag = get(ev.aggressorId)
        const vic = get(ev.victimId)
        content.sounds.collision({x: ev.x, y: ev.y}, engine.fn.clamp(ev.damage / 80, 0.2, 1))
        if (ag === playerCar && vic !== playerCar) {
          content.announcer.say(t('ann.youRammed', {
            label: vic ? vic.label : '',
            damage: Math.round(ev.damage),
            selfDamage: Math.round(ev.selfDamage),
          }), 'assertive')
        } else if (vic === playerCar) {
          content.announcer.say(t('ann.youGotRammed', {
            label: ag ? ag.label : '',
            damage: Math.round(ev.damage),
          }), 'assertive')
        }
        break
      }
      case 'wall': {
        const plane = get(ev.planeId)
        content.sounds.wallThud({x: ev.x, y: ev.y}, engine.fn.clamp(ev.damage / 40, 0.2, 1))
        if (plane === playerCar) {
          if (playerSpinning) exitSpin()
          content.announcer.say(t('ann.wallHit', {damage: Math.round(ev.damage)}), 'assertive')
        }
        break
      }
      case 'kill': {
        const victim = get(ev.victimId)
        const attacker = get(ev.attackerId)
        if (!victim) break
        announceEliminated(victim, attacker, ev.kills)
        break
      }
      case 'boost': {
        const p = get(ev.planeId)
        if (p) content.sounds.boostActivated(p.position)
        if (p === playerCar) content.announcer.say(t('ann.boostEngaged'), 'assertive')
        break
      }
      case 'mlaunch': {
        const owner = get(ev.ownerId)
        const tgt = get(ev.tgtId)
        content.sounds.missileLaunch({x: ev.x, y: ev.y})
        if (owner === playerCar) {
          content.announcer.say(t('ann.missileFired', {count: ev.count}), 'assertive')
        } else if (tgt === playerCar) {
          content.sounds.missileWarning()
          content.announcer.say(t('ann.missileIncoming'), 'assertive')
        }
        break
      }
      case 'boom': {
        content.sounds.explosion({x: ev.x, y: ev.y}, ev.severity != null ? ev.severity : 1)
        break
      }
      case 'overheat':
        if (get(ev.planeId) === playerCar) content.announcer.say(t('ann.gunsOverheated'), 'assertive')
        break
      case 'cooled':
        if (get(ev.planeId) === playerCar) {
          content.announcer.say(t('ann.gunsCooled'), 'polite')
          content.sounds.gunsCooled()
        }
        break
      case 'spawn': {
        content.sounds.teleport({x: ev.x, y: ev.y})
        content.announcer.say(t('ann.survivalEnter', {label: ev.label}), 'assertive')
        break
      }
      default: break
    }
  }

  // Client: the round has ended. Derive the listener's own youWon from the
  // host's authoritative outcome and mirror the single-player end flow.
  function onNetEnd(msg) {
    if (role !== 'client' || !running || roundEnding) return
    const m = normalizeMpMode(msg.mode)
    const youWon = m === 'survival'
      ? false
      : m === 'teamDm'
        ? ((playerCar && playerCar.team === 'player') === !!msg.teamAWon)
        : (msg.winnerId != null && playerCar != null && playerCar.id === msg.winnerId)

    if (m === 'teamDm') {
      roundEnding = true
      content.sounds.roundEnd(youWon)
      if (msg.matchOver) {
        content.announcer.say(t(youWon ? 'ann.matchWon' : 'ann.matchLost', {
          playerWins: msg.playerRoundWins || 0,
          enemyWins: msg.enemyRoundWins || 0,
        }), 'assertive')
        setTimeout(() => {
          if (!running) return
          onRoundOver({
            youWon,
            score: playerCar ? Math.round(playerCar.score || 0) : 0,
            standings: msg.standings,
            selfId,
            mode: 'teamDm',
            matchOver: true,
            playerRoundWins: msg.playerRoundWins || 0,
            enemyRoundWins: msg.enemyRoundWins || 0,
            multiplayer: true,
          })
        }, 1200)
      } else {
        content.announcer.say(t(youWon ? 'ann.roundTeamWon' : 'ann.roundTeamLost'), 'assertive')
        setTimeout(() => {
          if (!running) return
          onRoundOver({
            youWon,
            score: playerCar ? Math.round(playerCar.score || 0) : 0,
            selfId,
            mode: 'teamDm',
            matchOver: false,
            playerRoundWins: msg.playerRoundWins || 0,
            enemyRoundWins: msg.enemyRoundWins || 0,
            multiplayer: true,
          })
        }, 2000)
      }
      return
    }

    roundEnding = true
    const scoreVal = m === 'survival'
      ? (msg.kills || 0)
      : (playerCar ? Math.round(playerCar.score || 0) : 0)
    content.sounds.roundEnd(youWon)
    content.announcer.say(t(youWon ? 'ann.youWonFinal' : 'ann.roundOverFinal', {score: scoreVal}), 'assertive')
    setTimeout(() => {
      if (!running) return
      onRoundOver({
        youWon,
        score: scoreVal,
        standings: msg.standings,
        selfId,
        mode: m,
        kills: m === 'survival' ? scoreVal : undefined,
        multiplayer: true,
      })
    }, 900)
  }

  // ---- Host snapshot broadcasting -----------------------------------

  function broadcastSnapshot(delta) {
    snapAccum += delta
    if (snapAccum < SNAP_INTERVAL) return
    snapAccum = 0
    const snap = buildSnapshot()
    try { app.net.broadcast(snap) } catch (e) {}
    pendingEvents.length = 0
  }

  function buildSnapshot() {
    const cars = api.cars.map((plane) => ({
      id: plane.id,
      x: plane.position.x,
      y: plane.position.y,
      vx: plane.velocity.x,
      vy: plane.velocity.y,
      h: plane.heading,
      hp: plane.health,
      el: !!plane.eliminated,
      fri: plane.controller === 'player' ? (gunsFiring ? 1 : 0) : (plane.gunFiring ? 1 : 0),
      am: plane.ammo ? plane.ammo.missiles : 0,
      bo: plane.boostUntil || 0,
      sc: Math.round(plane.score || 0),
      th: Math.round((plane.input.throttle || 0) * 100),
    }))
    const ms = missiles.map((m) => ({
      id: m.id,
      x: m.position.x,
      y: m.position.y,
    }))
    return {
      type: 'snap',
      t: engine.time(),
      cars,
      missiles: ms,
      events: pendingEvents.slice(),
    }
  }

  function resolveCollisions() {
    for (let i = 0; i < api.cars.length; i++) {
      const a = api.cars[i]
      if (a.eliminated) continue
      for (let j = i + 1; j < api.cars.length; j++) {
        const b = api.cars[j]
        if (b.eliminated) continue
        if (mode === 'teamDm' && a.team === b.team) continue
        const ev = content.physics.resolveCarCar(a, b)
        if (!ev) continue
        const severity = engine.fn.clamp(ev.damage / 80, 0.2, 1)
        content.sounds.collision({x: ev.x, y: ev.y}, severity)
        damagePlane(ev.victim, ev.damage, ev.aggressor, 'ram')
        damagePlane(ev.aggressor, ev.selfDamage, ev.victim, 'ramSelf')
        netEvent('ram', {
          aggressorId: ev.aggressor.id,
          victimId: ev.victim.id,
          damage: ev.damage,
          selfDamage: ev.selfDamage,
          x: ev.x,
          y: ev.y,
        })
        if (ev.aggressor === playerCar) {
          content.announcer.say(t('ann.youRammed', {
            label: ev.victim.label,
            damage: Math.round(ev.damage),
            selfDamage: Math.round(ev.selfDamage),
          }), 'assertive')
        } else if (ev.victim === playerCar) {
          content.announcer.say(t('ann.youGotRammed', {
            label: ev.aggressor.label,
            damage: Math.round(ev.damage),
          }), 'assertive')
        }
      }
    }

    for (const plane of api.cars) {
      if (plane.eliminated) continue
      const events = content.physics.resolveCarWall(plane, content.arena)
      for (const ev of events) {
        content.sounds.wallThud({x: ev.x, y: ev.y}, engine.fn.clamp(ev.damage / 40, 0.2, 1))
        damagePlane(plane, ev.damage, null, 'wall')
        netEvent('wall', {planeId: plane.id, damage: ev.damage, x: ev.x, y: ev.y})
        if (plane === playerCar) {
          if (playerSpinning) exitSpin()
          content.announcer.say(t('ann.wallHit', {damage: Math.round(ev.damage)}), 'assertive')
        }
      }
    }
  }

  // Perspective-aware hit surface shared by the host's inline sim and the
  // client's event replay.
  function announceHit(attacker, victim, dealt, kind) {
    if (!victim || dealt <= 0) return
    if (attacker === playerCar && victim !== playerCar) {
      if (kind !== 'ram') {
        content.sounds.scoring(engine.fn.clamp(dealt / 45, 0.1, 1))
        content.announcer.say(t('ann.youHitOther', {
          label: victim.label,
          damage: Math.round(dealt),
          health: Math.round(victim.health),
        }), 'polite')
      }
    } else if (victim === playerCar && attacker && kind !== 'ramSelf' && kind !== 'ram') {
      content.sounds.buzzer(victim.position, engine.fn.clamp(dealt / 45, 0.2, 1))
      content.announcer.say(t('ann.youGotHit', {
        label: attacker.label,
        damage: Math.round(dealt),
        health: Math.round(victim.health),
      }), 'assertive')
    }
  }

  // Perspective-aware elimination surface (shared host + client replay).
  function announceEliminated(victim, attacker, killsAtEvent) {
    if (!victim) return
    content.sounds.eliminate(victim.position)
    if (victim.friendly) {
      content.sounds.wingmanLost()
      content.announcer.say(t('ann.wingmanLost'), 'assertive')
    } else if (attacker === playerCar && victim !== playerCar) {
      if (isSurvival()) {
        content.announcer.say(t('ann.youShotDownSurvival', {
          label: victim.label,
          kills: killsAtEvent != null ? killsAtEvent : teamKills(),
        }), 'assertive')
      } else {
        content.announcer.say(t('ann.youShotDown', {label: victim.label}), 'assertive')
      }
    } else if (victim === playerCar) {
      if (isSurvival()) {
        content.announcer.say(t('ann.youEliminatedSurvival', {kills: teamKills()}), 'assertive')
      } else {
        content.announcer.say(t('ann.youEliminated'), 'assertive')
      }
    } else {
      content.announcer.say(t('ann.otherShotDown', {label: victim.label}), 'polite')
    }
  }

  function damagePlane(victim, amount, attacker, kind) {
    if (!victim || victim.eliminated || amount <= 0) return 0
    const before = victim.health
    content.car.applyDamage(victim, amount, attacker)
    const dealt = Math.max(0, before - victim.health)

    if (role !== 'client') {
      if (attacker === playerCar && victim !== playerCar) {
        addScore(playerCar, Math.round(dealt))
      }
    }
    announceHit(attacker, victim, dealt, kind)
    netEvent('hit', {
      victimId: victim.id,
      attackerId: attacker ? attacker.id : null,
      damage: Math.round(dealt),
      kind,
    })

    if (before > 0 && victim.health <= 0) {
      onEliminated(victim, attacker)
    }
    return dealt
  }

  function onEliminated(victim, attacker) {
    let killsAtEvent = null
    if (role !== 'client') {
      // Team-agnostic score bonus for whoever landed the kill.
      if (attacker && (attacker === playerCar || attacker.human)) {
        addScore(attacker, 50)
      }
      if (isSurvival()) {
        // Any downed challenger is replaced by the next one.
        if (victim.controller === 'ai' && !victim.human) {
          survivalSpawnQueue.push({at: engine.time() + 2.5})
        }
        if (attacker && (attacker === playerCar || attacker.human)) {
          if (isMultiplayer) survivalTeamKills++
          else killCount++
          killsAtEvent = teamKills()
          if (!attacker.eliminated) {
            attacker.health = attacker.maxHealth
            attacker.ammo.missiles = 5
            if (attacker === playerCar) content.sounds.pickupHealth(attacker.position)
          }
        }
      }
    }
    announceEliminated(victim, attacker, killsAtEvent)
    netEvent('kill', {
      victimId: victim.id,
      attackerId: attacker ? attacker.id : null,
      kills: killsAtEvent,
    })
  }

  function lockInfo(owner, target) {
    if (!owner || !target || target.eliminated || owner.eliminated) {
      return {locked: false, inGunCone: false, distance: Infinity, diff: 0}
    }
    const dx = target.position.x - owner.position.x
    const dy = target.position.y - owner.position.y
    const distance = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)
    const diff = Math.abs(Math.atan2(Math.sin(angle - owner.heading), Math.cos(angle - owner.heading)))
    return {
      locked: distance <= config.missileRange && diff <= config.missileCone,
      inGunCone: distance <= config.gunRange && diff <= config.gunCone,
      distance,
      diff,
    }
  }

  function bestLock(owner) {
    let best = null
    let bestInfo = null
    for (const target of api.cars) {
      if (target === owner || target.eliminated) continue
      if (mode === 'teamDm' && target.team === owner.team) continue
      const info = lockInfo(owner, target)
      if (!info.locked && !info.inGunCone) continue
      const score = info.diff * 30 + info.distance
      if (!bestInfo || score < bestInfo.score) {
        best = target
        bestInfo = {...info, score}
      }
    }
    return best ? {target: best, info: bestInfo} : null
  }

  function nearestTarget() {
    if (!playerCar) return null
    let best = null
    let bestDist = Infinity
    for (const plane of api.cars) {
      if (plane === playerCar || plane.eliminated) continue
      if (mode === 'teamDm' && plane.team === playerCar.team) continue
      const d = Math.hypot(plane.position.x - playerCar.position.x, plane.position.y - playerCar.position.y)
      if (d < bestDist) {
        best = plane
        bestDist = d
      }
    }
    return best
  }

  function fireGuns(owner) {
    if (!owner || owner === playerCar) return false
    const now = engine.time()
    owner.ammo = owner.ammo || {missiles: 0, nextGunAt: 0, nextMissileAt: 0}
    if (now < owner.ammo.nextGunAt) return false
    owner.ammo.nextGunAt = now + config.gunCooldown
    const lock = bestLock(owner)
    if (!lock || !lock.info.inGunCone) return true
    damagePlane(lock.target, config.gunDamage+M().randInt(0, 4), owner, 'gun')
    return true
  }

  function fireMissile(owner = playerCar) {
    if (!running || !owner || owner.eliminated) return false
    if (role === 'client') {
      if (owner !== playerCar) return false
      app.net.sendToHost({type: 'action', action: 'fireMissile', t: engine.time()})
      return true
    }
    owner.ammo = owner.ammo || {missiles: 0, nextGunAt: 0, nextMissileAt: 0}
    const now = engine.time()
    if (owner.ammo.missiles <= 0) {
      if (owner === playerCar) content.announcer.say(t('game.noMissiles'), 'polite')
      return false
    }
    if (now < owner.ammo.nextMissileAt) {
      if (owner === playerCar) content.announcer.say(t('game.missileCooldown'), 'polite')
      return false
    }
    const lock = bestLock(owner)
    if (!lock || !lock.info.locked) {
      if (owner === playerCar) content.announcer.say(t('game.noMissileLock'), 'polite')
      return false
    }

    owner.ammo.missiles--
    owner.ammo.nextMissileAt = now + config.missileCooldown
    const missileId = `m-${Math.random().toString(36).slice(2)}`
    const missilePos = {x: owner.position.x, y: owner.position.y}
    missiles.push({
      id: missileId,
      owner,
      target: lock.target,
      position: missilePos,
      heading: owner.heading,
      bornAt: now,
      warnedAt: 0,
    })
    content.sounds.createMissileVoice(missileId, missilePos)
    content.sounds.missileLaunch(owner.position)
    netEvent('mlaunch', {
      ownerId: owner.id,
      tgtId: lock.target.id,
      count: owner.ammo.missiles,
      x: missilePos.x,
      y: missilePos.y,
    })
    if (owner === playerCar) {
      content.announcer.say(t('ann.missileFired', {count: owner.ammo.missiles}), 'assertive')
    } else if (lock.target === playerCar) {
      content.sounds.missileWarning()
      content.announcer.say(t('ann.missileIncoming'), 'assertive')
    }
    return true
  }

  // Host: cast a remote player's fireMissile action.
  function fireRemoteMissile(plane) {
    if (!running || !plane || plane.eliminated) return false
    plane.ammo = plane.ammo || {missiles: 0, nextGunAt: 0, nextMissileAt: 0}
    const now = engine.time()
    if (plane.ammo.missiles <= 0 || now < plane.ammo.nextMissileAt) return false
    const lock = bestLock(plane)
    if (!lock || !lock.info.locked) return false

    plane.ammo.missiles--
    plane.ammo.nextMissileAt = now + config.missileCooldown
    const missileId = `m-${Math.random().toString(36).slice(2)}`
    const missilePos = {x: plane.position.x, y: plane.position.y}
    missiles.push({
      id: missileId,
      owner: plane,
      target: lock.target,
      position: missilePos,
      heading: plane.heading,
      bornAt: now,
      warnedAt: 0,
    })
    content.sounds.createMissileVoice(missileId, missilePos)
    content.sounds.missileLaunch(plane.position)
    netEvent('mlaunch', {
      ownerId: plane.id,
      tgtId: lock.target.id,
      count: plane.ammo.missiles,
      x: missilePos.x,
      y: missilePos.y,
    })
    if (lock.target === playerCar) {
      content.sounds.missileWarning()
      content.announcer.say(t('ann.missileIncoming'), 'assertive')
    }
    return true
  }

  function updateMissiles(delta) {
    const now = engine.time()
    const live = []
    for (const missile of missiles) {
      if (!missile.owner || missile.owner.eliminated || !missile.target || missile.target.eliminated) {
        content.sounds.destroyMissileVoice(missile.id)
        continue
      }
      if (now - missile.bornAt > config.missileLifetime) {
        content.sounds.destroyMissileVoice(missile.id)
        continue
      }

      const dx = missile.target.position.x - missile.position.x
      const dy = missile.target.position.y - missile.position.y
      const desired = Math.atan2(dy, dx)
      const diff = Math.atan2(Math.sin(desired - missile.heading), Math.cos(desired - missile.heading))
      // Boost and sharp-turn windows degrade missile tracking — sudden
      // acceleration or instant heading changes make pure-pursuit miss.
      let effectiveTurn = config.missileTurnRate
      if (missile.target.boostUntil > now) {
        effectiveTurn *= (1 - config.missileBoostTurnPenalty)
      }
      if (missile.target.sharpTurnEvadeUntil > now) {
        effectiveTurn *= (1 - config.missileSharpTurnPenalty)
      }
      const turn = engine.fn.clamp(diff, -effectiveTurn * delta, effectiveTurn * delta)
      missile.heading += turn
      missile.position.x += Math.cos(missile.heading) * config.missileSpeed * delta
      missile.position.y += Math.sin(missile.heading) * config.missileSpeed * delta

      content.sounds.updateMissileVoice(missile.id, missile.position)

      const dist = Math.hypot(missile.target.position.x - missile.position.x, missile.target.position.y - missile.position.y)
      if (missile.target === playerCar && now - missile.warnedAt > 1.2) {
        missile.warnedAt = now
        content.sounds.missileWarning()
      }
      if (dist <= missile.target.radius + config.missileHitRadius) {
        content.sounds.explosion(missile.position, 1)
        content.sounds.destroyMissileVoice(missile.id)
        netEvent('boom', {x: missile.position.x, y: missile.position.y, severity: 1})
        damagePlane(missile.target, config.missileDamage+M().randInt(0, 9), missile.owner, 'missile')
        continue
      }
      live.push(missile)
    }
    for (const missile of missiles) {
      if (!live.includes(missile)) content.sounds.destroyMissileVoice(missile.id)
    }
    missiles = live
  }

  function updateAudioStage() {
    const listener = listenerCar()
    if (!listener) return
    engine.position.setVector({x: listener.position.x, y: listener.position.y, z: 0})
    engine.position.setEuler({yaw: listener.heading})

    for (const plane of api.cars) {
      if (!plane.sound) continue
      const speed = Math.hypot(plane.velocity.x, plane.velocity.y)
      plane.sound.update({
        position: plane.position,
        listener: listener.position,
        listenerYaw: listener.heading,
        speed,
        throttle: plane.input.throttle || plane.throttle || 0,
        scrapeSpeed: 0,
        eliminated: plane.eliminated,
      })
    }
  }

  var lockActive = false
  var prevLockedTarget = null

  function updateLockTone() {
    if (!playerCar || playerCar.eliminated) {
      if (lockActive) { lockActive = false; content.sounds.stopLockTone() }
      return
    }
    const lock = bestLock(playerCar)
    if (!lock) {
      if (lockActive) { lockActive = false; content.sounds.stopLockTone() }
      prevLockedTarget = null
      return
    }
    const now = engine.time()
    if (lock.info.locked) {
      if (!lockActive) {
        lockActive = true
        content.sounds.startLockTone()
      }
      if (prevLockedTarget !== lock.target.id) {
        prevLockedTarget = lock.target.id
        content.announcer.say(t('ann.missileLock', {label: lock.target.label}), 'polite')
      }
    } else {
      if (lockActive) { lockActive = false; content.sounds.stopLockTone() }
      if (lock.info.inGunCone && now >= nextLockToneAt) {
        content.sounds.nearLock()
        nextLockToneAt = now + 0.35
      }
    }
  }

  function checkRoundEnd() {
    if (roundEnding || api.cars.length <= 1) return

    if (mode === 'teamDm') {
      const playerTeamAlive = api.cars.some((p) => !p.eliminated && p.team === 'player')
      const enemyTeamAlive = api.cars.some((p) => !p.eliminated && p.team === 'enemy')
      if (playerTeamAlive && enemyTeamAlive) return

      roundEnding = true
      const playerTeamWon = playerTeamAlive && !enemyTeamAlive

      if (playerTeamWon) playerRoundWins++
      else enemyRoundWins++

      if (playerTeamWon) addScore(playerCar, 100)
      if (playerCar && playerCar.eliminated) {
        if (isMultiplayer) playerCar.score = Math.max(0, (playerCar.score || 0) - 25)
        else score = Math.max(0, score - 25)
      }

      const matchOver = playerRoundWins >= 2 || enemyRoundWins >= 2

      content.sounds.roundEnd(playerTeamWon)
      content.announcer.say(t(playerTeamWon ? 'ann.roundTeamWon' : 'ann.roundTeamLost'), 'assertive')

      const standings = matchOver ? buildTeamStandings() : null
      if (role === 'host' && isMultiplayer && app.net) {
        const payload = {
          type: 'end',
          mode: 'teamDm',
          teamAWon: !!playerTeamWon,
          playerRoundWins,
          enemyRoundWins,
          matchOver: !!matchOver,
        }
        if (matchOver) payload.standings = standings
        app.net.broadcast(payload)
      }

      if (matchOver) {
        const youWonMatch = playerRoundWins >= 2
        content.announcer.say(t(youWonMatch ? 'ann.matchWon' : 'ann.matchLost', {
          playerWins: playerRoundWins,
          enemyWins: enemyRoundWins,
        }), 'assertive')

        setTimeout(() => {
          if (!running) return
          onRoundOver({
            youWon: youWonMatch,
            score: getScore(),
            standings,
            selfId: playerCar && playerCar.id,
            mode: 'teamDm',
            matchOver: true,
            playerRoundWins,
            enemyRoundWins,
            multiplayer: isMultiplayer,
          })
        }, 1200)
      } else {
        setTimeout(() => {
          if (!running) return
          onRoundOver({
            youWon: playerTeamWon,
            score: getScore(),
            selfId: playerCar && playerCar.id,
            mode: 'teamDm',
            matchOver: false,
            playerRoundWins,
            enemyRoundWins,
            multiplayer: isMultiplayer,
          })
        }, 2000)
      }
      return
    }

    const alive = api.cars.filter((plane) => !plane.eliminated)
    if (alive.length > 1) return
    roundEnding = true
    const winner = alive[0] || null
    const youWon = winner === playerCar
    if (youWon) addScore(playerCar, 100)
    if (playerCar && playerCar.eliminated) {
      if (isMultiplayer) playerCar.score = Math.max(0, (playerCar.score || 0) - 25)
      else score = Math.max(0, score - 25)
    }

    content.sounds.roundEnd(youWon)
    content.announcer.say(t(youWon ? 'ann.youWonFinal' : 'ann.roundOverFinal', {score: getScore()}), 'assertive')

    const standings = api.cars
      .map((plane) => ({
        id: plane.id,
        label: plane.label,
        score: plane === playerCar
          ? Math.max(0, Math.round(getScore()))
          : Math.max(0, Math.round(plane.score || plane.health)),
        eliminated: plane.eliminated,
        winner: plane === winner,
      }))
      .sort((a, b) => (b.winner - a.winner) || b.score - a.score)

    if (role === 'host' && isMultiplayer && app.net) {
      app.net.broadcast({
        type: 'end',
        mode: 'ffa',
        standings,
        winnerId: winner ? winner.id : null,
      })
    }

    setTimeout(() => {
      if (!running) return
      onRoundOver({youWon, score: getScore(), standings, selfId: playerCar && playerCar.id, mode: 'ffa', multiplayer: isMultiplayer})
    }, 900)
  }

  function buildTeamStandings() {
    return api.cars
      .map((plane) => ({
        id: plane.id,
        label: plane.label,
        team: plane.team,
        score: plane === playerCar
          ? Math.max(0, Math.round(getScore()))
          : Math.max(0, Math.round(plane.score || plane.health)),
        eliminated: plane.eliminated,
        winner: !plane.eliminated,
      }))
      .sort((a, b) => (b.winner - a.winner) || (a.team === 'player' ? -1 : 1))
  }

  function listenerCar() {
    if (playerCar) return playerCar
    return api.cars.find((plane) => !plane.eliminated) || api.cars[0] || null
  }

  function livingCount() {
    return api.cars.filter((plane) => !plane.eliminated).length
  }

  function getScore() {
    if (isMultiplayer) {
      return isSurvival() ? teamKills() : (playerCar ? Math.max(0, Math.round(playerCar.score || 0)) : 0)
    }
    return isSurvival() ? killCount : score
  }

  function announceScore() {
    content.announcer.say(t('ann.score', {score: getScore()}), 'polite')
  }

  function announceHealth() {
    if (!playerCar) return
    content.announcer.say(t('ann.health', {
      health: Math.round(playerCar.health),
      missiles: playerCar.ammo ? playerCar.ammo.missiles : 0,
    }), 'polite')
  }

  function announcePlanesLeft() {
    const count = livingCount()
    content.announcer.say(t(count === 1 ? 'ann.planesRemaining1' : 'ann.planesRemainingN', {count}), 'polite')
  }

  function announceTarget() {
    const target = nearestTarget()
    if (!target || !playerCar) {
      content.announcer.say(t('target.noOthers'), 'polite')
      return
    }
    const dx = target.position.x - playerCar.position.x
    const dy = target.position.y - playerCar.position.y
    const cos = Math.cos(-playerCar.heading)
    const sin = Math.sin(-playerCar.heading)
    const line = t('target.sweepLine', {
      label: target.label,
      bearing: content.arena.bearingDescription(dx * cos - dy * sin, dx * sin + dy * cos),
      motion: t('target.motion.circling'),
      health: Math.round(target.health),
    })
    content.announcer.say(t('ann.target', {line}), 'polite')
  }

  function sweep() {
    if (!targeting) return
    content.announcer.say(targeting.sweepText(), 'polite')
  }

  function wingmanBeacon() {
    if (targeting) targeting.requestWingmanBeacon()
  }

  function spawnSurvivalChallenger() {
    if (!running) return
    survivalChallengerIndex++
    const points = content.arena.spawnPoints(1)
    const point = points[0]
    const challengerN = survivalChallengerIndex
    const label = t('label.challenger', {n: challengerN})
    const health = livingCount() <= 1 ? 300 : 180

    const plane = content.car.create({
      id: 'survival-ai-' + challengerN,
      label: label,
      controller: 'ai',
      profileIndex: challengerN % 6,
      position: {x: point.x, y: point.y},
      heading: point.heading,
      health: health,
      radius: 1.15,
      human: false,
    })
    plane.team = 'enemy'
    plane.throttle = 0.5
    plane.ammo.missiles = 4
    plane.ai = content.ai.create(plane, api, 'enemy')
    api.cars.push(plane)
    planeById.set(plane.id, plane)

    updateAudioStage()
    content.sounds.teleport({x: point.x, y: point.y})
    content.announcer.say(t('ann.survivalEnter', {label: label}), 'assertive')
    netEvent('spawn', {label, x: point.x, y: point.y})
  }

  Object.assign(api, {
    start,
    end,
    update,
    applyPlayerInput,
    performSharpTurn,
    performTurnaround,
    wingmanBeacon,
    startGuns,
    stopGuns,
    fireGuns,
    fireMissile,
    activateBoost,
    isBoostReady,
    lockInfo,
    player: () => playerCar,
    listenerCar,
    livingCount,
    getScore,
    isRunning: () => running,
    isPaused: () => paused,
    setOnRoundOver: (fn) => { onRoundOver = typeof fn === 'function' ? fn : () => {} },
    announceScore,
    announceHealth,
    announcePlanesLeft,
    announceCarsLeft: announcePlanesLeft,
    announceTarget,
    sweep,
    hasItems: () => false,
    resetMatch,
    nextRound,
    getMatchState,
    getKills: () => (isSurvival() ? teamKills() : killCount),
    isSurvival,
    setRole,
  })

  return api
})()