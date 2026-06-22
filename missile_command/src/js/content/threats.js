content.threats = (() => {
  let nextId = 1
  const list = []

  const LEFT_ZONE_BOUNDARY = -0.33
  const RIGHT_ZONE_BOUNDARY = 0.33

  function zoneForX(x) {
    if (x < LEFT_ZONE_BOUNDARY) return 'L'
    if (x > RIGHT_ZONE_BOUNDARY) return 'R'
    return 'C'
  }

  function spawn(opts) {
    const t = Object.assign({
      id: nextId++,
      kind: 'icbm',
      x: 0,
      y: 1,
      vx: 0,
      vy: -0.18,
      alive: true,
      forked: false,
      voice: null,
      jitter: 1 + (Math.random() * 0.10 - 0.05),
    }, opts)

    t.zone = zoneForX(t.x)

    if (t.kind === 'icbm') {
      const baseHz = (700 + Math.random() * 200) * t.jitter
      t.baseHz = baseHz
      const ch = content.audio.makeProp({
        build: (out) => {
          const v = content.audio.buildIncomingWhistle(out, {baseHz, level: 0.16})
          t._voiceCtl = v
          return v.stop
        },
        x: t.x,
        y: t.y,
        gain: 0.95,
      })
      t.voice = ch
    } else if (t.kind === 'splitter') {
      const baseHz = (520 + Math.random() * 80) * t.jitter
      t.baseHz = baseHz
      const ch = content.audio.makeProp({
        build: (out) => {
          const v = content.audio.buildSplitterVoice(out)
          t._voiceCtl = v
          return v.stop
        },
        x: t.x,
        y: t.y,
        gain: 0.95,
      })
      t.voice = ch
      t.forkAt = 0.45 + Math.random() * 0.15
    } else if (t.kind === 'bomber') {
      const ch = content.audio.makeProp({
        build: (out) => {
          const v = content.audio.buildBomberDrone(out)
          t._voiceCtl = v
          return v.stop
        },
        x: t.x,
        y: t.y,
        gain: 0.85,
      })
      t.voice = ch
      t.dropAt = 0.5 + Math.random() * 1.5
      t.bombsDropped = 0
      t.maxBombs = 1 + (Math.random() < 0.3 ? 1 : 0)
    } else if (t.kind === 'bomb') {
      const baseHz = (650 + Math.random() * 200) * t.jitter
      t.baseHz = baseHz
      const ch = content.audio.makeProp({
        build: (out) => {
          const v = content.audio.buildIncomingWhistle(out, {baseHz, level: 0.14, wave: 'square'})
          t._voiceCtl = v
          return v.stop
        },
        x: t.x,
        y: t.y,
        gain: 0.85,
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
      if (Math.abs(c.x - t.x) < 0.18) {
        content.cities.destroy(idx)
      }
    }
    _kill(t, false)
  }

  function _doFork(t) {
    if (t._voiceCtl && t._voiceCtl.stop) try { t._voiceCtl.stop() } catch (_) {}
    if (t.voice) { try { t.voice.destroy() } catch (_) {} t.voice = null }
    t.alive = false
    const baseDescent = -Math.abs(t.vy) * 1.05
    const xs = [-0.18, 0, 0.18]
    for (const dx of xs) {
      const targetX = content.world.clamp(t.x + dx * 1.4, -0.95, 0.95)
      const horiz = (targetX - t.x) / Math.max(0.4, t.y / Math.abs(baseDescent))
      spawn({
        kind: 'icbm',
        x: t.x,
        y: t.y - 0.02,
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
      y: t.y - 0.02,
      vx: (Math.random() - 0.5) * 0.04,
      vy: -0.22,
    })
    content.events.emit('bomber-drop', {x: t.x, y: t.y})
    if (t._voiceCtl && t._voiceCtl.setHighpass) {
      t._voiceCtl.setHighpass(true)
      setTimeout(() => {
        if (t._voiceCtl && t._voiceCtl.setHighpass) t._voiceCtl.setHighpass(false)
      }, 400)
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
      if (Math.abs(c.x - ix) < 0.18) return false
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
        const baseGain = (t.kind === 'bomb' || t.kind === 'bomber') ? 0.85 : 0.95
        t.voice.setGain(harmless ? baseGain * 0.20 : baseGain)
      }
      const cutoffCap = harmless ? 700 : 22000

      if (t.kind === 'icbm' || t.kind === 'bomb') {
        if (t._voiceCtl && t._voiceCtl.setFreq) {
          const yc = content.world.clamp(t.y, 0, 1)
          const hz = (380 + (1 - yc) * 1600) * t.jitter
          t._voiceCtl.setFreq(hz)
        }
        if (t._voiceCtl && t._voiceCtl.setCutoff) {
          const yc = content.world.clamp(t.y, 0, 1)
          const c = Math.min(cutoffCap, 900 + (1 - yc) * 5000)
          t._voiceCtl.setCutoff(c)
        }
      } else if (t.kind === 'splitter') {
        if (t._voiceCtl && t._voiceCtl.setFreq) {
          const yc = content.world.clamp(t.y, 0, 1)
          const hz = (520 + (1 - yc) * 1000) * t.jitter
          t._voiceCtl.setFreq(hz)
        }
        if (t._voiceCtl && t._voiceCtl.setCutoff) {
          t._voiceCtl.setCutoff(Math.min(cutoffCap, 2800))
        }
        if (!t.forked && t.y <= t.forkAt) {
          _doFork(t)
          continue
        }
      } else if (t.kind === 'bomber') {
        t.dropAt -= dt
        if (t.dropAt <= 0 && t.bombsDropped < t.maxBombs) {
          _bomberDrop(t)
          t.dropAt = 1.2 + Math.random() * 1.6
        }
      }

      if (t.kind === 'bomber') {
        if (t.x > 1.2 || t.x < -1.2) _kill(t, false)
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
    LEFT_ZONE_BOUNDARY, RIGHT_ZONE_BOUNDARY,
  }
})()
