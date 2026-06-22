content.threats = (() => {
  const K = () => content.constants
  let nextId = 1
  const list = []

  function zoneForX(x) {
    if (x < K().LEFT_ZONE_BOUNDARY) return 'L'
    if (x > K().RIGHT_ZONE_BOUNDARY) return 'R'
    return 'C'
  }

  function spawn(opts) {
    const t = Object.assign({
      id: nextId++,
      kind: 'icbm',
      x: 0,
      y: 1,
      vx: 0,
      vy: K().ICBM_VY,
      alive: true,
      forked: false,
      voice: null,
      jitter: 1 + (Math.random() * 0.10 - 0.05),
    }, opts)

    t.zone = zoneForX(t.x)

    if (t.kind === 'icbm') {
      const baseHz = (K().ICBM_BASE_HZ_MIN + Math.random() * K().ICBM_BASE_HZ_RANGE) * t.jitter
      t.baseHz = baseHz
      const ch = content.audio.makeProp({
        build: (out) => {
          const v = content.audio.buildIncomingWhistle(out, {baseHz, level: K().ICBM_LEVEL})
          t._voiceCtl = v
          return v.stop
        },
        x: t.x,
        y: t.y,
        gain: K().THREAT_GAIN_THREATENING,
      })
      t.voice = ch
    } else if (t.kind === 'splitter') {
      const baseHz = (K().SPLITTER_BASE_HZ_MIN + Math.random() * K().SPLITTER_BASE_HZ_RANGE) * t.jitter
      t.baseHz = baseHz
      const ch = content.audio.makeProp({
        build: (out) => {
          const v = content.audio.buildSplitterVoice(out)
          t._voiceCtl = v
          return v.stop
        },
        x: t.x,
        y: t.y,
        gain: K().THREAT_GAIN_THREATENING,
      })
      t.voice = ch
      t.forkAt = K().SPLITTER_FORK_Y + Math.random() * K().SPLITTER_FORK_Y_RANGE
    } else if (t.kind === 'bomber') {
      const ch = content.audio.makeProp({
        build: (out) => {
          const v = content.audio.buildBomberDrone(out)
          t._voiceCtl = v
          return v.stop
        },
        x: t.x,
        y: t.y,
        gain: K().THREAT_GAIN_BOMBER_BOMB,
      })
      t.voice = ch
      t.dropAt = K().BOMBER_DROP_Y + Math.random() * K().BOMBER_DROP_Y_RANGE
      t.bombsDropped = 0
      t.maxBombs = 1 + (Math.random() < K().BOMBER_MAX_BOMB_CHANCE ? 1 : 0)
    } else if (t.kind === 'bomb') {
      const baseHz = (K().BOMB_BASE_HZ_MIN + Math.random() * K().BOMB_BASE_HZ_RANGE) * t.jitter
      t.baseHz = baseHz
      const ch = content.audio.makeProp({
        build: (out) => {
          const v = content.audio.buildIncomingWhistle(out, {baseHz, level: K().BOMB_LEVEL, wave: 'square'})
          t._voiceCtl = v
          return v.stop
        },
        x: t.x,
        y: t.y,
        gain: K().THREAT_GAIN_BOMBER_BOMB,
      })
      t.voice = ch
    }

    list.push(t)
    content.events.emit('threat-spawn', {id: t.id, kind: t.kind, zone: t.zone, x: t.x, y: t.y})
    return t
  }

  function killById(id, byBlast) {
    for (let i = 0; i < list.length; i++) {
      const t = list[i]
      if (t.id !== id) continue
      _kill(t, byBlast)
      return t
    }
    return null
  }

  function _kill(t, byBlast) {
    if (!t.alive) return
    t.alive = false
    if (t.voice) {
      try { t.voice.destroy() } catch (_) {}
      t.voice = null
    }
    if (byBlast) {
      content.events.emit('threat-killed', {id: t.id, kind: t.kind, x: t.x, y: t.y, zone: t.zone})
    }
  }

  function _impact(t) {
    if (t.kind === 'bomber') return
    const idx = content.cities.nearestAliveTo(t.x)
    content.events.emit('ground-impact', {x: t.x, kind: t.kind})
    if (idx >= 0) {
      const c = content.cities.get(idx)
      if (Math.abs(c.x - t.x) < K().CITY_KILL_RADIUS) {
        content.cities.destroy(idx)
      }
    }
    _kill(t, false)
  }

  function _doFork(t) {
    if (t._voiceCtl && t._voiceCtl.stop) try { t._voiceCtl.stop() } catch (_) {}
    if (t.voice) { try { t.voice.destroy() } catch (_) {} t.voice = null }
    t.alive = false
    const baseDescent = -Math.abs(t.vy) * K().FORK_SPEED_MUL
    const xs = [-K().FORK_SPREAD, 0, K().FORK_SPREAD]
    for (const dx of xs) {
      const targetX = content.world.clamp(t.x + dx * K().FORK_SPREAD_MUL, -0.95, 0.95)
      const horiz = (targetX - t.x) / Math.max(K().FORK_HORIZ_DENOM, t.y / Math.abs(baseDescent))
      spawn({
        kind: 'icbm',
        x: t.x,
        y: t.y - K().SPAWN_Y_OFFSET,
        vx: horiz,
        vy: baseDescent,
      })
    }
    content.events.emit('splitter-fork', {x: t.x, y: t.y})
  }

  function _bomberDrop(t) {
    t.bombsDropped++
    spawn({
      kind: 'bomb',
      x: t.x,
      y: t.y - K().SPAWN_Y_OFFSET,
      vx: (Math.random() - 0.5) * K().BOMB_DRIFT_RANGE,
      vy: K().BOMB_VY,
    })
    content.events.emit('bomber-drop', {x: t.x, y: t.y})
    if (t._voiceCtl && t._voiceCtl.setHighpass) {
      t._voiceCtl.setHighpass(true)
      setTimeout(() => {
        if (t._voiceCtl && t._voiceCtl.setHighpass) t._voiceCtl.setHighpass(false)
      }, K().BOMBER_HIGHPASS_DURATION)
    }
  }

  function projectImpactX(t) {
    if (t.vy >= 0) return t.x
    const tToGround = t.y / -t.vy
    return t.x + t.vx * tToGround
  }

  function isHarmless(t) {
    if (t.kind === 'bomber') return false
    const ix = projectImpactX(t)
    for (const c of content.cities.getAll()) {
      if (!c.alive) continue
      if (Math.abs(c.x - ix) < K().CITY_KILL_RADIUS) return false
    }
    return true
  }

  function tick(dt) {
    for (const t of list) {
      if (!t.alive) continue
      t.x += t.vx * dt
      t.y += t.vy * dt
      t.zone = zoneForX(t.x)

      const harmless = isHarmless(t)

      if (t.voice) {
        t.voice.setPosition(t.x, t.y)
        t.voice._update()
        const baseGain = (t.kind === 'bomb' || t.kind === 'bomber') ? K().THREAT_GAIN_BOMBER_BOMB : K().THREAT_GAIN_THREATENING
        t.voice.setGain(harmless ? baseGain * K().HARMLESS_GAIN_MUL : baseGain)
      }
      const cutoffCap = harmless ? K().CUTOFF_HARMLESS : K().CUTOFF_THREATENING

      if (t.kind === 'icbm' || t.kind === 'bomb') {
        if (t._voiceCtl && t._voiceCtl.setFreq) {
          const yc = content.world.clamp(t.y, 0, 1)
          const hz = (K().ICBM_FREQ_BASE + (1 - yc) * K().ICBM_FREQ_RANGE) * t.jitter
          t._voiceCtl.setFreq(hz)
        }
        if (t._voiceCtl && t._voiceCtl.setCutoff) {
          const yc = content.world.clamp(t.y, 0, 1)
          const c = Math.min(cutoffCap, K().ICBM_CUTOFF_BASE + (1 - yc) * K().ICBM_CUTOFF_RANGE)
          t._voiceCtl.setCutoff(c)
        }
      } else if (t.kind === 'splitter') {
        if (t._voiceCtl && t._voiceCtl.setFreq) {
          const yc = content.world.clamp(t.y, 0, 1)
          const hz = (K().SPLITTER_FREQ_BASE + (1 - yc) * K().SPLITTER_FREQ_RANGE) * t.jitter
          t._voiceCtl.setFreq(hz)
        }
        if (t._voiceCtl && t._voiceCtl.setCutoff) {
          t._voiceCtl.setCutoff(Math.min(cutoffCap, K().SPLITTER_CUTOFF))
        }
        if (!t.forked && t.y <= t.forkAt) {
          _doFork(t)
          continue
        }
      } else if (t.kind === 'bomber') {
        t.dropAt -= dt
        if (t.dropAt <= 0 && t.bombsDropped < t.maxBombs) {
          _bomberDrop(t)
          t.dropAt = K().BOMBER_DROP_COOLDOWN_BASE + Math.random() * K().BOMBER_DROP_COOLDOWN_RANGE
        }
      }

      if (t.kind === 'bomber') {
        if (t.x > K().BOMBER_BOUNDS || t.x < -K().BOMBER_BOUNDS) _kill(t, false)
      } else {
        if (t.y <= 0) _impact(t)
      }
    }

    for (let i = list.length - 1; i >= 0; i--) {
      if (!list[i].alive) list.splice(i, 1)
    }
  }

  function clearAll() {
    for (const t of list) {
      if (t.voice) {
        try { t.voice.destroy() } catch (_) {}
        t.voice = null
      }
      t.alive = false
    }
    list.length = 0
  }

  function getAll() { return list }
  function aliveCount() {
    let n = 0
    for (const t of list) if (t.alive) n++
    return n
  }

  function killableCount() {
    let n = 0
    for (const t of list) if (t.alive) n++
    return n
  }

  function within(x, y, r) {
    const out = []
    const r2 = r * r
    for (const t of list) {
      if (!t.alive) continue
      const dx = t.x - x, dy = t.y - y
      if (dx*dx + dy*dy <= r2) out.push(t)
    }
    return out
  }

  function nearestDistanceTo(x, y) {
    let best = Infinity
    for (const t of list) {
      if (!t.alive) continue
      const dx = t.x - x, dy = t.y - y
      const d = Math.sqrt(dx*dx + dy*dy)
      if (d < best) best = d
    }
    return best
  }

  function threatsInZone(zone) {
    const out = []
    for (const t of list) {
      if (!t.alive) continue
      if (t.zone === zone) out.push(t)
    }
    return out
  }

  function nearestInZone(zone, toX, toY) {
    let best = null, bestD = Infinity
    for (const t of list) {
      if (!t.alive || t.zone !== zone) continue
      const dx = t.x - (toX != null ? toX : 0)
      const dy = t.y - (toY != null ? toY : 0.5)
      const d = Math.sqrt(dx*dx + dy*dy)
      if (d < bestD) { bestD = d; best = t }
    }
    return best
  }

  return {
    spawn, tick, killById, clearAll,
    getAll, aliveCount, killableCount, within, nearestDistanceTo,
    zoneForX, threatsInZone, nearestInZone,
  }
})()
