content.batteries = (() => {
  const AMMO_PER_BATTERY = 10
  const COOLDOWN_DURATION = 0.7
  const SHOT_DURATION = 0.8
  const DETONATION_Y = 0.45

  const LOCK_ZONES = {
    L: {pitch: 180, x: -0.65, y: DETONATION_Y},
    C: {pitch: 240, x:  0.00, y: DETONATION_Y},
    R: {pitch: 320, x:  0.65, y: DETONATION_Y},
  }

  const LOCK_RADIUS = 0.40
  const LOCK_TREM_START = 0.25

  const list = []

  function init() {
    _destroyLockVoices()
    list.length = 0
    const positions = content.world.BATTERY_POSITIONS
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]
      const z = LOCK_ZONES[p.id] || LOCK_ZONES.C
      list.push({
        index: i,
        id: p.id,
        x: p.x,
        labelKey: p.labelKey,
        ammo: AMMO_PER_BATTERY,
        cooldown: 0,
        zoneInfo: z,
        _lockVoice: null,
        _lockCtl: null,
      })
    }
    _createLockVoices()
  }

  function _createLockVoices() {
    for (const b of list) {
      const z = b.zoneInfo
      const voice = content.audio.makeProp({
        build: (out) => {
          const v = content.audio.buildBatteryLockTone(out, {
            pitch: z.pitch,
            panPos: content.world.clamp(z.x, -1, 1),
          })
          b._lockCtl = v
          return v.stop
        },
        x: z.x,
        y: z.y,
        gain: 0,
      })
      b._lockVoice = voice
    }
  }

  function _destroyLockVoices() {
    for (const b of list) {
      if (b._lockVoice) {
        try { b._lockVoice.destroy() } catch (_) {}
        b._lockVoice = null
        b._lockCtl = null
      }
    }
  }

  function fire(i) {
    const b = list[i]
    if (!b) return null
    if (b.cooldown > 0) return null
    if (b.ammo <= 0) return null

    b.ammo--
    b.cooldown = COOLDOWN_DURATION

    const z = b.zoneInfo

    content.audio.batteryThunk(b.id)
    content.audio.emitOutgoingWhistle(b.x, 0, z.x, z.y, SHOT_DURATION, b.id)

    const shot = {
      batteryIndex: i,
      startX: b.x,
      startY: 0,
      endX: z.x,
      endY: z.y,
      duration: SHOT_DURATION,
      elapsed: 0,
    }
    content.outgoing.spawn(shot)

    if (b.ammo === 0) {
      content.audio.emitDepletion()
      content.events.emit('battery-depleted', {index: i, labelKey: b.labelKey})
    }
    content.events.emit('battery-fire', {index: i, ammo: b.ammo})
    return shot
  }

  function totalAmmo() {
    let n = 0
    for (const b of list) n += b.ammo
    return n
  }

  // Update lock tone gain and wobble based on nearest threat in each zone.
  function _updateLockTones() {
    for (const b of list) {
      const z = b.zoneInfo
      const threats = content.threats.threatsInZone(b.id)
      let d = Infinity
      for (const t of threats) {
        const dx = t.x - z.x, dy = t.y - z.y
        const td = Math.sqrt(dx*dx + dy*dy)
        if (td < d) d = td
      }

      let gain = 0
      let tremDepth = 0
      if (d < Infinity) {
        const norm = content.world.clamp(d / LOCK_RADIUS, 0, 1)
        gain = (1 - norm) * 0.28
        if (d < LOCK_TREM_START) {
          const k = 1 - (d / LOCK_TREM_START)
          tremDepth = k * k
        }
      }

      if (b._lockVoice) {
        b._lockVoice.setGain(gain)
        b._lockVoice._update()
      }
      if (b._lockCtl) {
        b._lockCtl.setTremolo(tremDepth)
      }
    }
  }

  function tick(dt) {
    for (const b of list) {
      if (b.cooldown > 0) {
        b.cooldown -= dt
        if (b.cooldown < 0) b.cooldown = 0
      }
    }
    _updateLockTones()
  }

  function silenceAll() {
    for (const b of list) {
      if (b._lockCtl) {
        b._lockCtl.setTremolo(0)
      }
      if (b._lockVoice) {
        b._lockVoice.setGainImmediate(0)
      }
    }
  }

  function getAll() { return list }
  function get(i) { return list[i] }

  return {
    init, fire, totalAmmo, tick, getAll, get,
    silenceAll, AMMO_PER_BATTERY,
  }
})()
