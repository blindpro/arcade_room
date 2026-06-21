content.game = (() => {
  const config = {
    gunRange: 18,
    gunCone: 0.20,
    gunDamage: 8,
    gunCooldown: 0.18,
    missileRange: 48,
    missileCone: 0.42,
    missileDamage: 45,
    missileCooldown: 1.2,
    missileSpeed: 24,
    missileTurnRate: 2.9,
    missileLifetime: 5.5,
    missileHitRadius: 1.8,
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

  function t(key, params) {
    return app.i18n ? app.i18n.t(key, params) : key
  }

  function start({aiOpponents = 0} = {}) {
    end({silent: true})
    running = true
    paused = false
    roundEnding = false
    score = 0
    missiles = []
    nextLockToneAt = 0
    lastLockedId = null

    content.arena.selectMap('large')
    const count = Math.max(1, Math.min(6, aiOpponents + 1))
    const spawns = content.arena.spawnPoints(count)
    api.cars = []

    for (let i = 0; i < count; i++) {
      const isPlayer = i === 0
      const plane = content.car.create({
        id: isPlayer ? 'player' : `ai-${i}`,
        label: isPlayer ? t('label.you') : t('label.ai', {n: i}),
        controller: isPlayer ? 'player' : 'ai',
        profileIndex: i,
        position: {x: spawns[i].x, y: spawns[i].y},
        heading: spawns[i].heading,
        health: 150,
        radius: 1.15,
      })
      plane.throttle = isPlayer ? 0.45 : 0.65
      api.cars.push(plane)
      if (isPlayer) playerCar = plane
    }

    for (const plane of api.cars) {
      if (plane.controller === 'ai') plane.ai = content.ai.create(plane, api)
    }

    targeting = content.targeting.create(api)
    updateAudioStage()
    content.sounds.roundStart()
    if (aiOpponents <= 0) {
      content.announcer.say(t('ann.sandbox'), 'assertive')
    } else {
      content.announcer.say(
        t(aiOpponents === 1 ? 'ann.roundStart1' : 'ann.roundStartN', {count: aiOpponents}),
        'assertive',
      )
      setTimeout(() => sweep(), 900)
    }
  }

  function end({silent = false} = {}) {
    if (!running && !api.cars.length) return
    running = false
    paused = false
    gunsFiring = false
    gunHeat = 0
    content.sounds.stopMachineGun()
    if (targeting) {
      targeting.destroy()
      targeting = null
    }
    for (const plane of api.cars) content.car.destroy(plane)
    api.cars = []
    missiles = []
    playerCar = null
    if (!silent) content.announcer.say(t('game.ended'), 'polite')
  }

  function applyPlayerInput(input) {
    if (!playerCar || playerCar.eliminated) return
    playerCar.input.throttle = input.throttle || 0
    playerCar.input.steering = input.steering || 0
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
          damagePlane(lock.target, config.gunDamage, playerCar, 'gun')
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
        if (gunHeat <= 0) content.announcer.say(t('ann.gunsCooled'), 'polite')
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

  function update(delta) {
    if (!running || paused) return
    delta = Math.min(0.05, Math.max(0, delta || 0))

    for (const plane of api.cars) {
      if (plane.ai) plane.ai.update(delta)
    }
    for (const plane of api.cars) {
      content.physics.integrate(plane, delta)
    }

    resolveCollisions()
    updateGuns(delta)
    updateMissiles(delta)
    updateAudioStage()
    if (targeting) targeting.update()
    updateLockTone()
    checkRoundEnd()
  }

  function resolveCollisions() {
    for (let i = 0; i < api.cars.length; i++) {
      const a = api.cars[i]
      if (a.eliminated) continue
      for (let j = i + 1; j < api.cars.length; j++) {
        const b = api.cars[j]
        if (b.eliminated) continue
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
    if (attacker === playerCar && victim !== playerCar) {
      score += 50
      content.announcer.say(t('ann.youShotDown', {label: victim.label}), 'assertive')
    } else if (victim === playerCar) {
      content.announcer.say(t('ann.youEliminated'), 'assertive')
    } else {
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
    damagePlane(lock.target, config.gunDamage, owner, 'gun')
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
    missiles.push({
      id: `m-${Math.random().toString(36).slice(2)}`,
      owner,
      target: lock.target,
      position: {x: owner.position.x, y: owner.position.y},
      heading: owner.heading,
      bornAt: now,
      warnedAt: 0,
    })
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
      if (!missile.owner || missile.owner.eliminated || !missile.target || missile.target.eliminated) continue
      if (now - missile.bornAt > config.missileLifetime) continue

      const dx = missile.target.position.x - missile.position.x
      const dy = missile.target.position.y - missile.position.y
      const desired = Math.atan2(dy, dx)
      const diff = Math.atan2(Math.sin(desired - missile.heading), Math.cos(desired - missile.heading))
      const turn = engine.fn.clamp(diff, -config.missileTurnRate * delta, config.missileTurnRate * delta)
      missile.heading += turn
      missile.position.x += Math.cos(missile.heading) * config.missileSpeed * delta
      missile.position.y += Math.sin(missile.heading) * config.missileSpeed * delta

      const dist = Math.hypot(missile.target.position.x - missile.position.x, missile.target.position.y - missile.position.y)
      if (missile.target === playerCar && now - missile.warnedAt > 1.2) {
        missile.warnedAt = now
        content.sounds.missileWarning()
      }
      if (dist <= missile.target.radius + config.missileHitRadius) {
        content.sounds.explosion(missile.position, 1)
        damagePlane(missile.target, config.missileDamage, missile.owner, 'missile')
        continue
      }
      live.push(missile)
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

  function updateLockTone() {
    if (!playerCar || playerCar.eliminated) return
    const lock = bestLock(playerCar)
    if (!lock || !lock.info.locked) {
      lastLockedId = null
      return
    }
    const now = engine.time()
    if (lastLockedId !== lock.target.id) {
      lastLockedId = lock.target.id
      content.announcer.say(t('ann.missileLock', {label: lock.target.label}), 'polite')
    }
    const closeness = 1 - engine.fn.clamp(lock.info.diff / config.missileCone, 0, 1)
    const interval = engine.fn.lerp(0.45, 0.09, closeness)
    if (now >= nextLockToneAt) {
      content.sounds.lockTone(closeness)
      nextLockToneAt = now + interval
    }
  }

  function checkRoundEnd() {
    if (roundEnding || api.cars.length <= 1) return
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
      onRoundOver({youWon, score, standings, selfId: playerCar && playerCar.id})
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

  Object.assign(api, {
    start,
    end,
    update,
    applyPlayerInput,
    startGuns,
    stopGuns,
    fireGuns,
    fireMissile,
    lockInfo,
    player: () => playerCar,
    listenerCar,
    livingCount,
    getScore: () => score,
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
  })

  return api
})()
