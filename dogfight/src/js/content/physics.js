content.physics = (() => {
  const config = {
    engineForward: 9.0,
    brakeDrag: 2.2,
    linearDrag: 0.16,
    turnRate: 2.15,
    minTurnEffect: 0.28,
    maxSpeed: 15,
    wallRestitution: 0.35,
    wallDamageScale: 4.0,
    ramDamageScale: 5.0,
    ramSelfShare: 0.5,
    minDamage: 2.0,
    stallSpeed: 3.0,
  }

  function integrate(plane, delta) {
    if (plane.eliminated) {
      plane.velocity.x = 0
      plane.velocity.y = 0
      return
    }

    const inputThrottle = engine.fn.clamp(plane.input.throttle, -1, 1)
    const steering = engine.fn.clamp(plane.input.steering, -1, 1)
    const throttle = Math.max(0, inputThrottle)
    const braking = Math.max(0, -inputThrottle)

    plane.throttle = engine.fn.clamp((plane.throttle || 0.35) + (throttle - braking * 0.75) * delta * 1.4, 0.12, 1)

    const hx = Math.cos(plane.heading)
    const hy = Math.sin(plane.heading)
    plane.velocity.x += hx * config.engineForward * plane.throttle * delta
    plane.velocity.y += hy * config.engineForward * plane.throttle * delta

    const drag = Math.max(0, 1 - (config.linearDrag + braking * config.brakeDrag) * delta)
    plane.velocity.x *= drag
    plane.velocity.y *= drag

    const speed = Math.hypot(plane.velocity.x, plane.velocity.y)
    if (speed > config.maxSpeed) {
      const k = config.maxSpeed / speed
      plane.velocity.x *= k
      plane.velocity.y *= k
    }

    const turnEffect = Math.max(config.minTurnEffect, engine.fn.clamp(speed / 8, 0, 1))
    plane.heading += steering * config.turnRate * turnEffect * delta

    plane.position.x += plane.velocity.x * delta
    plane.position.y += plane.velocity.y * delta
  }

  function resolveCarCar(a, b) {
    const dx = b.position.x - a.position.x
    const dy = b.position.y - a.position.y
    const minDist = a.radius + b.radius
    const distSq = dx * dx + dy * dy
    if (distSq >= minDist * minDist || distSq < 1e-8) return null

    const dist = Math.sqrt(distSq)
    const nx = dx / dist
    const ny = dy / dist
    const overlap = minDist - dist
    const invA = a.eliminated ? 0 : 1 / a.mass
    const invB = b.eliminated ? 0 : 1 / b.mass
    const invSum = invA + invB

    if (invSum > 0) {
      const correction = overlap / invSum
      a.position.x -= nx * correction * invA
      a.position.y -= ny * correction * invA
      b.position.x += nx * correction * invB
      b.position.y += ny * correction * invB
    }

    const rvx = a.velocity.x - b.velocity.x
    const rvy = a.velocity.y - b.velocity.y
    const closing = rvx * nx + rvy * ny
    if (closing <= 0) return null

    const impulse = -(1 + 0.55) * closing / (invSum || 1)
    a.velocity.x += impulse * nx * invA
    a.velocity.y += impulse * ny * invA
    b.velocity.x -= impulse * nx * invB
    b.velocity.y -= impulse * ny * invB

    const baseDamage = closing * config.ramDamageScale
    if (baseDamage < config.minDamage) return null

    const aTowardB = a.velocity.x * nx + a.velocity.y * ny
    const bTowardA = -(b.velocity.x * nx + b.velocity.y * ny)
    const aggressor = aTowardB >= bTowardA ? a : b
    const victim = aggressor === a ? b : a

    return {
      damage: baseDamage,
      selfDamage: baseDamage * config.ramSelfShare,
      aggressor,
      victim,
      impact: closing,
      x: (a.position.x + b.position.x) / 2,
      y: (a.position.y + b.position.y) / 2,
    }
  }

  function resolveCarWall(plane, arena) {
    const events = []
    const r = plane.radius
    const checks = [
      {penetration: (arena.bounds.minX + r) - plane.position.x, nx: 1, ny: 0, clamp: () => plane.position.x = arena.bounds.minX + r},
      {penetration: plane.position.x - (arena.bounds.maxX - r), nx: -1, ny: 0, clamp: () => plane.position.x = arena.bounds.maxX - r},
      {penetration: (arena.bounds.minY + r) - plane.position.y, nx: 0, ny: 1, clamp: () => plane.position.y = arena.bounds.minY + r},
      {penetration: plane.position.y - (arena.bounds.maxY - r), nx: 0, ny: -1, clamp: () => plane.position.y = arena.bounds.maxY - r},
    ]

    for (const c of checks) {
      if (c.penetration <= 0) continue
      c.clamp()
      const vAlong = plane.velocity.x * c.nx + plane.velocity.y * c.ny
      if (vAlong >= 0) continue
      const impact = -vAlong
      plane.velocity.x += (1 + config.wallRestitution) * impact * c.nx
      plane.velocity.y += (1 + config.wallRestitution) * impact * c.ny
      const damage = impact * config.wallDamageScale
      if (damage >= config.minDamage) {
        events.push({type: 'hit', damage, impact, x: plane.position.x, y: plane.position.y})
      }
    }
    return events
  }

  return {
    config,
    integrate,
    resolveCarCar,
    resolveCarWall,
  }
})()
