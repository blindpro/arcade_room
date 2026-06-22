const Car = (() => {
  const C = Config

  function create() {
    return {
      // track distance
      z: 0,
      // lateral offset, -1 = left edge, +1 = right edge
      x: 0,
      // m/s
      speed: C.MIN_SPEED,
      // visual pitch/roll
      bank: 0,
      pitch: 0,
      // health
      health: C.HEALTH_MAX,
      // meta
      lap: 1,
      checkpoint: 0,
      gear: 1,
      prevGear: 1,
      boosting: false,
      offroad: false,
      finished: false,
      finishTime: 0,
      // steer smoothed
      steerInput: 0,
      // ammo from shooter pickups
      bullets: 0,
      // held item slot ('nitro' | 'mine' | 'decoy' | null)
      item: null,
      // remaining seconds of active nitro boost
      nitroT: 0,
    }
  }

  function gearFromSpeed(speed) {
    const t = Math.min(1, speed / C.BOOST_SPEED)
    return 1 + Math.min(C.GEAR_COUNT - 1, Math.floor(t * C.GEAR_COUNT))
  }

  function update(car, dt, steer, accel, brake, boost) {
    // Determine segment
    const seg = Track.findSegment(car.z)
    const curve = seg.curve

    // Smooth steering input toward target
    const target = steer
    car.steerInput += (target - car.steerInput) * Math.min(1, dt * C.STEER_SMOOTHING)

    // Nitro: 2-second super-boost that overrides the normal caps and costs
    // no health. Tick it down before reading it so effects are sample-accurate.
    if (car.nitroT > 0) car.nitroT = Math.max(0, car.nitroT - dt)
    const nitroActive = car.nitroT > 0

    // Target speed depending on input
    let targetAccel = 0
    if (nitroActive) {
      targetAccel = C.BOOST_ACCEL * C.NITRO_ACCEL_MUL
      car.boosting = true
    } else if (boost && car.health > 0) {
      targetAccel = C.BOOST_ACCEL
      car.boosting = true
    } else if (accel) {
      targetAccel = C.ACCEL
      car.boosting = false
    } else {
      car.boosting = false
    }

    if (brake) {
      car.speed -= C.BRAKE * dt
    } else if (targetAccel > 0) {
      const cap = nitroActive ? C.BOOST_SPEED * C.NITRO_SPEED_CAP_MUL : (boost ? C.BOOST_SPEED : C.MAX_SPEED)
      if (car.speed < cap) {
        car.speed += targetAccel * dt
        if (car.speed > cap) car.speed = cap
      } else if (car.speed > cap) {
        car.speed = Math.max(cap, car.speed - C.COAST * C.COAST_OVERSHOOT_MUL * dt)
      }
    } else {
      car.speed -= C.COAST * dt
    }

    // Offroad decel
    if (Math.abs(car.x) > 1) {
      car.speed -= C.OFFROAD_DECEL * dt
      car.offroad = true
      car.health -= C.OFFROAD_HEALTH_DRAIN * dt
    } else {
      car.offroad = false
    }

    // Boost drain
    if (car.boosting) {
      car.health -= C.BOOST_HEALTH_DRAIN * dt
    }

    if (car.health < 0) car.health = 0
    if (car.health > C.HEALTH_MAX) car.health = C.HEALTH_MAX

    // Death → cap speed low
    if (car.health <= 0) {
      car.speed = Math.min(car.speed, C.MIN_SPEED * C.DEAD_SPEED_MUL)
    }

    car.speed = Math.max(C.SPEED_MIN, Math.min(car.speed, C.BOOST_SPEED))

    // Move forward
    car.z = Track.wrap(car.z + car.speed * dt)

    // Lateral drift from curve (centrifugal) + steer
    const speedRatio = car.speed / C.MAX_SPEED
    const drift = -curve * C.CENTRIFUGAL * speedRatio * dt
    car.x += drift
    car.x += car.steerInput * C.STEER_RATE * dt

    if (car.x > C.OFFROAD_X_LIMIT) car.x = C.OFFROAD_X_LIMIT
    if (car.x < -C.OFFROAD_X_LIMIT) car.x = -C.OFFROAD_X_LIMIT

    // Bank: combine steer input and curve
    const targetBank = Math.max(-1, Math.min(1, car.steerInput * C.BANK_STEER_WEIGHT + curve * speedRatio * C.BANK_CURVE_WEIGHT))
    car.bank += (targetBank * C.BANK_MAX - car.bank) * Math.min(1, dt * C.BANK_SMOOTHING)

    // Pitch (hill sense)
    const nextSeg = Track.findSegment(car.z + Track.SEGMENT_LENGTH)
    const dy = (nextSeg.p2.world.y - seg.p1.world.y)
    const targetPitch = -dy / C.PITCH_DIVISOR
    car.pitch += (targetPitch - car.pitch) * Math.min(1, dt * C.PITCH_SMOOTHING)

    // Gear
    car.prevGear = car.gear
    car.gear = gearFromSpeed(car.speed)
  }

  return {
    MAX_SPEED: C.MAX_SPEED,
    MIN_SPEED: C.MIN_SPEED,
    BOOST_SPEED: C.BOOST_SPEED,
    HEALTH_MAX: C.HEALTH_MAX,
    GEAR_COUNT: C.GEAR_COUNT,
    create,
    update,
  }
})()
