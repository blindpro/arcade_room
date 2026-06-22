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

  function t(key, params) {
    return app.i18n ? app.i18n.t(key, params) : key
  }

  function isSurvival() { return mode === 'survival' }

  function start({aiOpponents = 0, mode: gameMode = 'ffa'} = {}) {
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
    survivalChallengerIndex = 0
    survivalSpawnQueue = []
    lastOptions = {aiOpponents, mode}

    content.arena.selectMap('large')
    api.cars = []

    if (mode === 'teamDm') {
      // 2v2 team mode: player + 1 wingman vs 2 enemy AI
      const spawns = content.arena.spawnPoints(4)
      const teamConfigs = [
        {id: 'player', label: t('label.you'), controller: 'player', profileIndex: 0, team: 'player', friendly: false},
        {id: 'ai-wingman', label: t('label.wingman'), controller: 'ai', profileIndex: 5, team: 'player', friendly: true},
        {id: 'ai-1', label: t('label.bandit', {n: 1}), controller: 'ai', profileIndex: 1, team: 'enemy', friendly: false},
        {id: 'ai-2', label: t('label.bandit', {n: 2}), controller: 'ai', profileIndex: 2, team: 'enemy', friendly: false},
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
        })
        plane.team = cfg.team
        plane.throttle = isPlayer ? 0.45 : 0.5
        api.cars.push(plane)
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
        })
        plane.throttle = isPlayer ? 0.45 : 0.5
        api.cars.push(plane)
        if (isPlayer) playerCar = plane
      }
    }

    for (const plane of api.cars) {
      if (plane.controller === 'ai') {
        plane.ai = content.ai.create(plane, api, plane.team)
      }
    }

    targeting = content.targeting.create(api)
    updateAudioStage()
    content.sounds.roundStart()

    if (mode === 'teamDm') {
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
  }

  function resetMatch() {
    currentRound = 1
    playerRoundWins = 0
    enemyRoundWins = 0
  }

  function nextRound() {
    currentRound++
    start(lastOptions)
  }

  function getMatchState() {
    return {mode, currentRound, playerRoundWins, enemyRoundWins}
  }

  function end({silent = false} = {}) {
    if (!running && !api.cars.length) return
    running = false
    paused = false
    gunsFiring = false
    gunHeat = 0
    content.sounds.stopMachineGun()
    content.sounds.destroyAllMissileVoices()
    if (targeting) {
      targeting.destroy()
      targeting = null
    }
    for (const plane of api.cars) content.car.destroy(plane)
    api.cars = []
    missiles = []
    playerCar = null
    killCount = 0
    survivalChallengerIndex = 0
    survivalSpawnQueue = []
    if (!silent) content.announcer.say(t('game.ended'), 'polite')
  }

  function applyPlayerInput(input) {
    if (!playerCar || playerCar.eliminated) return
    if (playerSpinning) {
      playerCar.input.steering = 1
      return
    }
    playerCar.input.throttle = input.throttle || 0
    playerCar.input.steering = engine.fn.clamp(input.steering || 0, -1, 1)
  }

  function performSharpTurn(dir) {
    if (!playerCar || playerCar.eliminated || playerSpinning) return false
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
    playerCar.heading += Math.PI
    content.sounds.whoosh()
    playerStability = Math.max(0, playerStability - STABILITY_TURNAROUND_COST)
    if (playerStability <= 0) {
      enterSpin()
    }
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

  function startGuns() {
    if (!running || !playerCar || playerCar.eliminated) return
    gunsFiring = true
  }

  function stopGuns() {
    gunsFiring = false
    content.sounds.stopMachineGun()
  }

  function activateBoost() {
    if (!running || !playerCar || playerCar.eliminated) return false
    const now = engine.time()
    if (now < boostCooldownAt) {
      content.announcer.say(t('ann.boostCooldown'), 'polite')
      return false
    }
    const hx = Math.cos(playerCar.heading)
    const hy = Math.sin(playerCar.heading)
    playerCar.velocity.x += hx * BOOST_IMPULSE
    playerCar.velocity.y += hy * BOOST_IMPULSE
    playerCar.boostUntil = now + BOOST_DURATION
    boostCooldownAt = now + BOOST_COOLDOWN
    content.sounds.boostActivated(playerCar.position)
    content.announcer.say(t('ann.boostEngaged'), 'assertive')
    return true
  }

  function updateBoost(delta) {
    if (!playerCar || playerCar.eliminated) return
    const now = engine.time()
    if (playerCar.boostUntil > now) {
      const hx = Math.cos(playerCar.heading)
      const hy = Math.sin(playerCar.heading)
      playerCar.velocity.x += hx * config.gunCooldown * 8 * delta
      playerCar.velocity.y += hy * config.gunCooldown * 8 * delta
    }
  }

  function isBoostReady() {
    if (!playerCar || playerCar.eliminated) return false
    return engine.time() >= boostCooldownAt
  }

  function update(delta) {
    if (!running || paused) return
    delta = Math.min(0.05, Math.max(0, delta || 0))

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
      if (playerCar && playerCar.eliminated) {
        roundEnding = true
        const alive = api.cars.filter((p) => !p.eliminated)
        const winner = alive[0] || null
        const standings = api.cars.map((p) => ({
          id: p.id,
          label: p.label,
          score: p === playerCar ? killCount : Math.max(0, Math.round(p.health)),
          eliminated: !!p.eliminated,
          winner: p === winner,
        }))
        const youWon = false
        if (playerCar && playerCar.eliminated) score = Math.max(0, score - 25)
        setTimeout(() => {
          if (!running) return
          onRoundOver({youWon, score: killCount, standings, selfId: playerCar && playerCar.id, mode: 'survival', kills: killCount})
        }, 900)
        return
      }
      return
    }

    checkRoundEnd()
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
        if (plane === playerCar) {
          if (playerSpinning) exitSpin()
          content.announcer.say(t('ann.wallHit', {damage: Math.round(ev.damage)}), 'assertive')
        }
      }
    }
  }

  function damagePlane(victim, amount, attacker, kind) {
    if (!victim || victim.eliminated || amount <= 0) return 0
    const before = victim.health
    content.car.applyDamage(victim, amount, attacker)
    const dealt = Math.max(0, before - victim.health)

    if (attacker === playerCar && victim !== playerCar) {
      score += Math.round(dealt)
      if (kind !== 'ram') {
        content.sounds.scoring(engine.fn.clamp(dealt / 45, 0.1, 1))
        content.announcer.say(t('ann.youHitOther', {
          label: victim.label,
          damage: Math.round(dealt),
          health: Math.round(victim.health),
        }), 'polite')
      }
    } else if (victim === playerCar && attacker && kind !== 'ramSelf') {
      content.sounds.buzzer(victim.position, engine.fn.clamp(dealt / 45, 0.2, 1))
      content.announcer.say(t('ann.youGotHit', {
        label: attacker.label,
        damage: Math.round(dealt),
        health: Math.round(victim.health),
      }), 'assertive')
    }

    if (before > 0 && victim.health <= 0) {
      onEliminated(victim, attacker)
    }
    return dealt
  }

  function onEliminated(victim, attacker) {
    content.sounds.eliminate(victim.position)
    if (victim.friendly && victim.team === 'player') {
      content.sounds.wingmanLost()
      content.announcer.say(t('ann.wingmanLost'), 'assertive')
    } else if (attacker === playerCar && victim !== playerCar) {
      score += 50
      if (isSurvival()) {
        killCount++
        if (playerCar && !playerCar.eliminated) {
          playerCar.health = playerCar.maxHealth
          playerCar.ammo.missiles = 5
          content.sounds.pickupHealth(playerCar.position)
        }
        survivalSpawnQueue.push({at: engine.time() + 2.5})
        content.announcer.say(t('ann.youShotDownSurvival', {label: victim.label, kills: killCount}), 'assertive')
      } else {
        content.announcer.say(t('ann.youShotDown', {label: victim.label}), 'assertive')
      }
    } else if (victim === playerCar) {
      if (isSurvival()) {
        content.announcer.say(t('ann.youEliminatedSurvival', {kills: killCount}), 'assertive')
      } else {
        content.announcer.say(t('ann.youEliminated'), 'assertive')
      }
    } else {
      if (isSurvival() && victim.controller === 'ai') {
        survivalSpawnQueue.push({at: engine.time() + 2.5})
      }
      content.announcer.say(t('ann.otherShotDown', {label: victim.label}), 'polite')
    }
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
    if (owner === playerCar) {
      content.announcer.say(t('ann.missileFired', {count: owner.ammo.missiles}), 'assertive')
    } else if (lock.target === playerCar) {
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

      if (playerTeamWon) score += 100
      if (playerCar && playerCar.eliminated) score = Math.max(0, score - 25)

      const matchOver = playerRoundWins >= 2 || enemyRoundWins >= 2

      content.sounds.roundEnd(playerTeamWon)
      content.announcer.say(t(playerTeamWon ? 'ann.roundTeamWon' : 'ann.roundTeamLost'), 'assertive')

      if (matchOver) {
        const youWonMatch = playerRoundWins >= 2
        content.announcer.say(t(youWonMatch ? 'ann.matchWon' : 'ann.matchLost', {
          playerWins: playerRoundWins,
          enemyWins: enemyRoundWins,
        }), 'assertive')

        const standings = api.cars
          .map((plane) => ({
            id: plane.id,
            label: plane.label,
            team: plane.team,
            score: plane === playerCar ? score : Math.max(0, Math.round(plane.health)),
            eliminated: plane.eliminated,
            winner: !plane.eliminated,
          }))
          .sort((a, b) => (b.winner - a.winner) || (a.team === 'player' ? -1 : 1))

        setTimeout(() => {
          if (!running) return
          onRoundOver({
            youWon: youWonMatch,
            score,
            standings,
            selfId: playerCar && playerCar.id,
            mode: 'teamDm',
            matchOver: true,
            playerRoundWins,
            enemyRoundWins,
          })
        }, 1200)
      } else {
        setTimeout(() => {
          if (!running) return
          onRoundOver({
            youWon: playerTeamWon,
            score,
            selfId: playerCar && playerCar.id,
            mode: 'teamDm',
            matchOver: false,
            playerRoundWins,
            enemyRoundWins,
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
    if (youWon) score += 100
    if (playerCar && playerCar.eliminated) score = Math.max(0, score - 25)

    content.sounds.roundEnd(youWon)
    content.announcer.say(t(youWon ? 'ann.youWonFinal' : 'ann.roundOverFinal', {score}), 'assertive')

    const standings = api.cars
      .map((plane) => ({
        id: plane.id,
        label: plane.label,
        score: plane === playerCar ? score : Math.max(0, Math.round(plane.health)),
        eliminated: plane.eliminated,
        winner: plane === winner,
      }))
      .sort((a, b) => (b.winner - a.winner) || b.score - a.score)

    setTimeout(() => {
      if (!running) return
      onRoundOver({youWon, score, standings, selfId: playerCar && playerCar.id, mode: 'ffa'})
    }, 900)
  }

  function listenerCar() {
    if (playerCar) return playerCar
    return api.cars.find((plane) => !plane.eliminated) || api.cars[0] || null
  }

  function livingCount() {
    return api.cars.filter((plane) => !plane.eliminated).length
  }

  function announceScore() {
    content.announcer.say(t('ann.score', {score}), 'polite')
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
    })
    plane.team = 'enemy'
    plane.throttle = 0.5
    plane.ammo.missiles = 4
    plane.ai = content.ai.create(plane, api, 'enemy')
    api.cars.push(plane)

    updateAudioStage()
    content.sounds.teleport({x: point.x, y: point.y})
    content.announcer.say(t('ann.survivalEnter', {label: label}), 'assertive')
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
    getScore: () => isSurvival() ? killCount : score,
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
    getKills: () => killCount,
    isSurvival,
  })

  return api
})()
