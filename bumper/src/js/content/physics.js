/**
 * 2D physics for bumper cars. Self-contained — no external libs.
 * Cars are circles (radius, mass). Walls are axis-aligned.
 */
content.physics = (() => {
  const config = {
    engineForward: 4.0,
    engineReverse: 1.5,
    linearDrag: 0.45,
    angularDrag: 4.0,
    turnRate: 3.5,
    maxSpeed: 7,
    carRestitution: 0.85,
    wallRestitution: 0.55,
    damageScaleCar: 4.0,
    damageScaleWall: 2.5,
    minDamage: 2.0,
    // Attack incentive: equal split so no inherent advantage for the
    // car that's driving harder into the contact normal. Previously 0.35
    // which meant the aggressor (usually the AI with perfect tracking)
    // took far less damage while dishing far more — making the AI nearly
    // unbeatable in a head-on trade.
    aggressorDamageShare: 0.5,
    // AI aggressor damage bonus: multiplies damage when an AI car is the
    // aggressor against a non-AI victim. Randomised so hits feel varied:
    // applied as scale * (0.6 + random * 0.8) → 60-140% of base scale.
    // 1.8 avg → AI hits ~1.8x harder than a player would in the same bump.
    aiDamageScale: 1.2,
    scrapeRate: 0.4,            // hp/s while scraping
    scrapeMinSpeed: 0.6,
    // Speed-burst pickup: while car.boostUntil > engine.time(), the
    // car uses these instead of the base values. Roughly 2x base,
    // long enough to chase down or escape.
    boostMaxSpeed: 14.0,
    boostEngineForward: 9.0,
    boostDuration: 4.0,         // seconds per boost charge
    // Repulsor blast — radial push + damage
    repulsorRadius: 12,
    repulsorPush: 15,
    repulsorDamage: 15,
    // Rocket boost — extreme forward burst with high collision damage
    rocketSpeed: 20,
    rocketDuration: 1.2,
    rocketDamageMultiplier: 5,
  }

  function integrate(car, delta) {
    if (car.eliminated) {
      // Eliminated cars are spectators — no body, no inputs, no inertia.
      // Park them in place so a coasting body can't end up overlapping
      // a live driver's listener position.
      car.velocity.x = 0
      car.velocity.y = 0
      return
    }

    const throttle = engine.fn.clamp(car.input.throttle, -1, 1),
      steering = engine.fn.clamp(car.input.steering, -1, 1)

    // Speed-burst window — boostUntil is set by the host when the car
    // uses a boost charge, replicated to clients via car.boostUntil in
    // the snapshot. While active, both peak speed and forward thrust
    // are scaled up so the boosted car can out-run and ram harder.
    const boosted = car.boostUntil != null && engine.time() < car.boostUntil
    const engineFwd = boosted ? config.boostEngineForward : config.engineForward
    const maxSpd = boosted ? config.boostMaxSpeed : config.maxSpeed

    // Engine force along heading
    const forwardPower = throttle >= 0
      ? engineFwd * throttle
      : config.engineReverse * throttle

    const ax = Math.cos(car.heading) * forwardPower / car.mass,
      ay = Math.sin(car.heading) * forwardPower / car.mass

    car.velocity.x += ax * delta
    car.velocity.y += ay * delta

    // Linear drag (viscous)
    const dragK = Math.max(0, 1 - config.linearDrag * delta)
    car.velocity.x *= dragK
    car.velocity.y *= dragK

    // Soft speed cap
    const speed = Math.hypot(car.velocity.x, car.velocity.y)
    if (speed > maxSpd) {
      const k = maxSpd / speed
      car.velocity.x *= k
      car.velocity.y *= k
    }

    // Heading: steering effectiveness scales with current speed magnitude
    // and the *sign* of the projection onto the heading (so reversing
    // inverts steering, like a real car).
    const headingDir = {x: Math.cos(car.heading), y: Math.sin(car.heading)}
    const forwardSpeed = car.velocity.x * headingDir.x + car.velocity.y * headingDir.y
    const steerEffectiveness = engine.fn.clamp(speed / 1.5, 0, 1)
      * (forwardSpeed >= 0 ? 1 : -1)
    car.heading += steering * config.turnRate * steerEffectiveness * delta
    // NB: do NOT use engine.fn.normalizeAngleSigned — it just subtracts
    // π (it's effectively a rotation, not a wrap). cos/sin tolerate
    // drift, and the AI's diff-to-desired uses atan2(sin, cos) which
    // handles wrap-around itself. Leaving heading unwrapped is safe.

    // Rocket boost: override velocity to fixed speed in heading direction
    if (car.rocketUntil && engine.time() < car.rocketUntil) {
      const rSpd = config.rocketSpeed
      car.velocity.x = Math.cos(car.heading) * rSpd
      car.velocity.y = Math.sin(car.heading) * rSpd
    }

    // Position
    car.position.x += car.velocity.x * delta
    car.position.y += car.velocity.y * delta
  }

  function resolveCarCar(a, b) {
    const dx = b.position.x - a.position.x,
      dy = b.position.y - a.position.y,
      distSq = dx * dx + dy * dy,
      minDist = a.radius + b.radius

    if (distSq >= minDist * minDist || distSq < 1e-8) {
      return null
    }

    const dist = Math.sqrt(distSq)
    const nx = dx / dist, ny = dy / dist

    // Positional correction (split by inverse-mass)
    const overlap = minDist - dist,
      invMassA = a.eliminated ? 0 : 1 / a.mass,
      invMassB = b.eliminated ? 0 : 1 / b.mass,
      invMassSum = invMassA + invMassB

    if (invMassSum > 0) {
      const correction = overlap / invMassSum
      a.position.x -= nx * correction * invMassA
      a.position.y -= ny * correction * invMassA
      b.position.x += nx * correction * invMassB
      b.position.y += ny * correction * invMassB
    }

    // Relative velocity along normal
    const rvx = a.velocity.x - b.velocity.x,
      rvy = a.velocity.y - b.velocity.y,
      vAlongN = rvx * nx + rvy * ny

    if (vAlongN <= 0) return null   // separating

    const j = -(1 + config.carRestitution) * vAlongN / (invMassSum || 1)
    a.velocity.x += j * nx * invMassA
    a.velocity.y += j * ny * invMassA
    b.velocity.x -= j * nx * invMassB
    b.velocity.y -= j * ny * invMassB

    const damage = vAlongN * config.damageScaleCar
    if (damage < config.minDamage) return null

    // Aggressor is whichever car was moving more aggressively *toward*
    // the other along the contact normal. Used by content.game to pick
    // hit-vs-hit-by audio and announcements.
    const velAOnN = a.velocity.x * nx + a.velocity.y * ny       // a's vel toward b
    const velBOnN = -(b.velocity.x * nx + b.velocity.y * ny)    // b's vel toward a
    const aggressor = velAOnN >= velBOnN ? a : b
    const victim = aggressor === a ? b : a

    return {
      damage,
      impact: vAlongN,
      aggressor,
      victim,
      // Event location halfway between cars for sound positioning
      x: (a.position.x + b.position.x) / 2,
      y: (a.position.y + b.position.y) / 2,
    }
  }

  function resolveCarWall(car, arena) {
    const events = []
    const r = car.radius

    // For each wall, compute penetration along the wall normal.
    // arena.bounds = {minX, maxX, minY, maxY}
    const checks = [
      {
        // left wall, normal +x
        penetration: (arena.bounds.minX + r) - car.position.x,
        nx: 1, ny: 0,
        clamp: () => car.position.x = arena.bounds.minX + r,
      },
      {
        // right wall, normal -x
        penetration: car.position.x - (arena.bounds.maxX - r),
        nx: -1, ny: 0,
        clamp: () => car.position.x = arena.bounds.maxX - r,
      },
      {
        // bottom wall, normal +y
        penetration: (arena.bounds.minY + r) - car.position.y,
        nx: 0, ny: 1,
        clamp: () => car.position.y = arena.bounds.minY + r,
      },
      {
        // top wall, normal -y
        penetration: car.position.y - (arena.bounds.maxY - r),
        nx: 0, ny: -1,
        clamp: () => car.position.y = arena.bounds.maxY - r,
      },
    ]

    for (const c of checks) {
      if (c.penetration <= 0) continue

      c.clamp()
      const vAlongN = car.velocity.x * c.nx + car.velocity.y * c.ny
      if (vAlongN >= 0) {
        // already moving away; just clamp position
        continue
      }
      // Reflect
      const impulse = -(1 + config.wallRestitution) * vAlongN
      car.velocity.x += impulse * c.nx
      car.velocity.y += impulse * c.ny

      const impact = -vAlongN
      const damage = impact * config.damageScaleWall
      if (damage >= config.minDamage) {
        events.push({
          type: 'hit',
          damage,
          impact,
          x: car.position.x,
          y: car.position.y,
        })
      } else {
        // Light scrape — ongoing while in contact
        const tangentSpeed = Math.abs(car.velocity.x * -c.ny + car.velocity.y * c.nx)
        if (tangentSpeed >= config.scrapeMinSpeed) {
          events.push({
            type: 'scrape',
            speed: tangentSpeed,
            x: car.position.x,
            y: car.position.y,
          })
        }
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
