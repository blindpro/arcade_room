content.ai = (() => {
  function shortAngle(a) {
    return Math.atan2(Math.sin(a), Math.cos(a))
  }

  function create(plane, game) {
    let state = 'WANDER'
    let target = null
    let wanderTarget = randomPoint()
    let retargetAt = 0
    let nextGunAt = engine.time() + 0.5 + Math.random()
    let nextMissileAt = engine.time() + 3 + Math.random() * 3

    function randomPoint() {
      const b = content.arena.bounds
      const m = 8
      return {
        x: engine.fn.lerp(b.minX + m, b.maxX - m, Math.random()),
        y: engine.fn.lerp(b.minY + m, b.maxY - m, Math.random()),
      }
    }

    function pickTarget() {
      let best = null
      let bestScore = -Infinity
      for (const other of game.cars) {
        if (other === plane || other.eliminated) continue
        const d = Math.hypot(other.position.x - plane.position.x, other.position.y - plane.position.y)
        const score = -d * 0.7 - other.health + (other === plane.lastHitBy ? 35 : 0)
        if (score > bestScore) {
          bestScore = score
          best = other
        }
      }
      return best
    }

    function wallAvoidance() {
      const b = content.arena.bounds
      const margin = 10
      let ax = 0
      let ay = 0
      const dl = plane.position.x - b.minX
      const dr = b.maxX - plane.position.x
      const db = plane.position.y - b.minY
      const dt = b.maxY - plane.position.y
      if (dl < margin) ax += (margin - dl) / margin
      if (dr < margin) ax -= (margin - dr) / margin
      if (db < margin) ay += (margin - db) / margin
      if (dt < margin) ay -= (margin - dt) / margin
      return {x: ax * 0.8, y: ay * 0.8}
    }

    function steerToward(point) {
      const dx = point.x - plane.position.x
      const dy = point.y - plane.position.y
      const noiseX = (Math.random() - 0.5) * 2
      const noiseY = (Math.random() - 0.5) * 2
      const len = Math.hypot(dx, dy) || 1
      const avoid = wallAvoidance()
      const desired = Math.atan2(dy / len + avoid.y * 2 + noiseY * 0.3, dx / len + avoid.x * 2 + noiseX * 0.3)
      const diff = shortAngle(desired - plane.heading)
      plane.input.steering = engine.fn.clamp(Math.sin(diff) * 1.8, -1, 1)
      plane.input.throttle = Math.abs(diff) > 2.4 ? -0.3 : 1
    }

    function update() {
      if (plane.eliminated) {
        plane.input.throttle = 0
        plane.input.steering = 0
        return
      }

      const now = engine.time()
      if (now >= retargetAt || !target || target.eliminated) {
        target = pickTarget()
        state = target ? 'PURSUE' : 'WANDER'
        retargetAt = now + 0.4 + Math.random() * 0.4
      }

      if (plane.health < 20 && target) state = 'EVADE'
      else if (state === 'EVADE' && plane.health > 55) state = target ? 'PURSUE' : 'WANDER'

      if (state === 'EVADE' && target) {
        steerToward({
          x: plane.position.x + (plane.position.x - target.position.x),
          y: plane.position.y + (plane.position.y - target.position.y),
        })
      } else if (state === 'PURSUE' && target) {
        steerToward(target.position)
      } else {
        if (Math.hypot(wanderTarget.x - plane.position.x, wanderTarget.y - plane.position.y) < 5) {
          wanderTarget = randomPoint()
        }
        steerToward(wanderTarget)
      }

      if (target && !target.eliminated) {
        const lock = game.lockInfo(plane, target)
        if (lock.inGunCone && now >= nextGunAt) {
          game.fireGuns(plane)
          nextGunAt = now + 0.35 + Math.random() * 0.5
        }
        if (lock.locked && now >= nextMissileAt && plane.ammo.missiles > 0) {
          if (Math.random() < 0.6) game.fireMissile(plane)
          nextMissileAt = now + 4 + Math.random() * 4
        }
      }
    }

    return {
      get state() { return state },
      get target() { return target },
      update,
    }
  }

  return {create}
})()
