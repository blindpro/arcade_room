// Lunar Lander audio palette — GMA-style 1D model.
//
// The audio IS the input device, not flavor. Five monitor voices, each
// carrying one piece of state with no overlap:
//
//   velocity clicks   center      click rate ∝ |vy|, silent at <deadband
//   ascent tone       center      replaces clicks when vy > 0 ("you're rising")
//   altitude tone     left ear    pitch falls with altitude; resets to high
//                                 below ALT_ZOOM_BOUNDARY, then falls faster
//   fuel tone         right ear   pitch falls with fuel; resets to high at
//                                 FUEL_ZOOM_FRACTION, then falls faster
//   emergency tone    off-center  plays whenever physics.willCrash() is true
//
// One-shots: thrust hiss while throttling, soft/hard touchdown, mission
// fanfare on body change, game-over swoop. Voices route through a single
// engine.mixer bus; no engine.position / binaural pipeline.
content.audio = (() => {
  const C = () => content.constants
  const L = () => content.lander
  const P = () => content.physics

  let _started = false
  let _ctx = null
  let _bus = null
  let _voices = null
  let _silenced = false

  // Click scheduler state: time of next scheduled click.
  let _nextClickTime = 0

  function ctx() { return _ctx || engine.context() }
  function bus() {
    if (!_bus) _bus = engine.mixer.createBus()
    return _bus
  }

  // --- ADSR helper --------------------------------------------------------
  function envelope(param, t0, attack, hold, release, peak) {
    param.cancelScheduledValues(t0)
    param.setValueAtTime(0.00001, t0)
    param.linearRampToValueAtTime(peak, t0 + attack)
    param.linearRampToValueAtTime(peak, t0 + attack + hold)
    param.linearRampToValueAtTime(0.00001, t0 + attack + hold + release)
  }

  // --- Continuous voice constructors -------------------------------------

  // Soft thrust hiss. Quiet rumble + bandpassed noise; gain follows
  // throttle². Centered.
  function makeThrust() {
    const c = ctx()
    const out = c.createGain(); out.gain.value = 0
    const pan = c.createStereoPanner(); pan.pan.value = 0
    out.connect(pan); pan.connect(bus())
    const oscA = c.createOscillator(); oscA.type = 'triangle'; oscA.frequency.value = 90
    const oscB = c.createOscillator(); oscB.type = 'triangle'; oscB.frequency.value = 180
    const triGain = c.createGain(); triGain.gain.value = 0.25
    oscA.connect(triGain); oscB.connect(triGain)
    const noiseBuf = engine.buffer.whiteNoise({channels: 1, duration: 1.5})
    const noise = c.createBufferSource(); noise.buffer = noiseBuf; noise.loop = true
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1000; bp.Q.value = 1.0
    const noiseGain = c.createGain(); noiseGain.gain.value = 0.35
    noise.connect(bp); bp.connect(noiseGain)
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600
    triGain.connect(lp); noiseGain.connect(lp); lp.connect(out)
    oscA.start(); oscB.start(); noise.start()
    return {out, lp}
  }

  // Altitude tone — sine on the left. Pitch:
  //   y in [zoom..startAlt]:  high → mid     (the "coarse" range)
  //   y in [0..zoom]:         high → low     (the "fine" zoom)
  // Two-stage so the player gets fine resolution exactly when needed
  // (the last few metres). 'high' is reused at the top of each stage so
  // the boundary reads as "we're zooming in."
  function makeAltTone() {
    const c = ctx()
    const out = c.createGain(); out.gain.value = 0
    const pan = c.createStereoPanner(); pan.pan.value = -0.75
    out.connect(pan); pan.connect(bus())
    const osc = c.createOscillator(); osc.type = 'sine'; osc.frequency.value = 1200
    osc.connect(out); osc.start()
    return {out, osc}
  }

  // Fuel tone — sine on the right. Same two-stage zoom as altitude but
  // mirrored to the other ear. Distinct waveform (square) so the player
  // can tell altitude from fuel without remembering ear assignments.
  function makeFuelTone() {
    const c = ctx()
    const out = c.createGain(); out.gain.value = 0
    const pan = c.createStereoPanner(); pan.pan.value = 0.75
    out.connect(pan); pan.connect(bus())
    const osc = c.createOscillator(); osc.type = 'square'; osc.frequency.value = 900
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800
    osc.connect(lp); lp.connect(out); osc.start()
    return {out, osc}
  }

  // Ascent tone — high sine, centered. Plays while vy > 0 (= rising) as
  // an "you're wasting fuel and not landing" cue. GMA's audible scolding.
  function makeAscent() {
    const c = ctx()
    const out = c.createGain(); out.gain.value = 0
    const pan = c.createStereoPanner(); pan.pan.value = 0
    out.connect(pan); pan.connect(bus())
    const osc = c.createOscillator(); osc.type = 'sine'; osc.frequency.value = 1600
    osc.connect(out); osc.start()
    return {out}
  }

  // Emergency tone — siren-style two-tone alternation, panned off-center
  // (slightly right of center) so it's distinct from ascent (center) and
  // fuel (hard right). Plays whenever physics.willCrash() is true.
  function makeEmergency() {
    const c = ctx()
    const out = c.createGain(); out.gain.value = 0
    const pan = c.createStereoPanner(); pan.pan.value = 0.35
    out.connect(pan); pan.connect(bus())
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 520
    // Square LFO at 4 Hz alternates the pitch ±80 Hz for a siren character.
    const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 4
    const lfoDepth = c.createGain(); lfoDepth.gain.value = 80
    lfo.connect(lfoDepth); lfoDepth.connect(osc.frequency)
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500
    osc.connect(lp); lp.connect(out)
    osc.start(); lfo.start()
    return {out}
  }

  // --- Initialization ----------------------------------------------------
  function start() {
    if (_started) return
    _ctx = engine.context()
    _voices = {
      thrust:    makeThrust(),
      altTone:   makeAltTone(),
      fuelTone:  makeFuelTone(),
      ascent:    makeAscent(),
      emergency: makeEmergency(),
    }
    _nextClickTime = engine.time() + 0.5
    _started = true
  }

  function silenceAll() {
    if (!_voices) return
    const t = engine.time()
    for (const k of Object.keys(_voices)) {
      const v = _voices[k]
      v.out.gain.cancelScheduledValues(t)
      v.out.gain.setValueAtTime(0, t)
    }
    _silenced = true
  }

  function unmute() { _silenced = false }
  function isStarted() { return _started }

  // --- Click scheduler ---------------------------------------------------
  // Fires brief square pings at a rate determined by current descent
  // speed. lerp(slowPeriod, fastPeriod, normalized |vy|).
  function scheduleClicks(now) {
    const s = L().state
    if (!s.monitor.vel) return
    if (s.dead || s.landed) return
    const downSpeed = -s.vy        // positive when descending
    if (downSpeed < C().VEL_CLICK_DEADBAND) {
      _nextClickTime = now + 0.25  // hold the next-click time near "now"
      return
    }
    if (s.vy > 0) {                // ascending — ascent tone takes over
      _nextClickTime = now + 0.25
      return
    }
    const norm = Math.min(1, downSpeed / C().VEL_CLICK_FAST_AT)
    const period = 0.5 - 0.45 * norm   // 0.5s slow → 0.05s fast
    while (_nextClickTime < now + 0.4) {
      playClick(_nextClickTime)
      _nextClickTime += period
    }
  }

  function playClick(when) {
    const c = ctx()
    const out = c.createGain(); out.gain.value = 0
    const pan = c.createStereoPanner(); pan.pan.value = 0
    out.connect(pan); pan.connect(bus())
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 1100
    o.connect(out)
    envelope(out.gain, when, 0.001, 0.012, 0.018, 0.18)
    o.start(when); o.stop(when + 0.04)
    setTimeout(() => { try { pan.disconnect() } catch (e) {} }, (when + 0.06 - engine.time()) * 1000)
  }

  // --- Per-frame parameter coupling -------------------------------------
  function frame() {
    if (!_started || _silenced) return
    const s = L().state
    const t = engine.time()
    const cfg = C().bodyConfig(content.missions.current())
    const alive = !s.dead && !s.landed

    // Thrust hiss — gain ∝ throttle², LP cutoff opens with throttle.
    const thrustGain = s.throttle * s.throttle * 0.35
    _voices.thrust.out.gain.setTargetAtTime(thrustGain, t, 0.04)
    _voices.thrust.lp.frequency.setTargetAtTime(400 + 3000 * s.throttle, t, 0.05)

    // Altitude tone (left ear). Two-stage zoom around ALT_ZOOM_BOUNDARY.
    const startAlt = cfg.startAlt
    const zoomBoundary = Math.min(C().ALT_ZOOM_BOUNDARY, startAlt * 0.5)
    if (s.monitor.alt && alive) {
      const y = Math.max(0, s.y)
      let pitch
      if (y >= zoomBoundary) {
        // Coarse stage: high (1200) → mid (500) over [start..zoom].
        const u = (y - zoomBoundary) / Math.max(1, startAlt - zoomBoundary)
        pitch = 500 + u * 700
      } else {
        // Fine stage: high (1200) → low (180) over [zoom..0].
        const u = y / zoomBoundary
        pitch = 180 + u * 1020
      }
      _voices.altTone.osc.frequency.setTargetAtTime(pitch, t, 0.06)
      _voices.altTone.out.gain.setTargetAtTime(0.13, t, 0.08)
    } else {
      _voices.altTone.out.gain.setTargetAtTime(0, t, 0.08)
    }

    // Fuel tone (right ear). Two-stage zoom at FUEL_ZOOM_FRACTION.
    const fRatio = s.fuel / Math.max(1, s.fuelMax)
    if (s.monitor.fuel && alive && s.fuel > 0) {
      const fz = C().FUEL_ZOOM_FRACTION
      let pitch
      if (fRatio >= fz) {
        const u = (fRatio - fz) / (1 - fz)
        pitch = 400 + u * 500   // 900 high → 400 mid
      } else {
        const u = fRatio / fz
        pitch = 180 + u * 720   // 900 high → 180 low
      }
      _voices.fuelTone.osc.frequency.setTargetAtTime(pitch, t, 0.06)
      _voices.fuelTone.out.gain.setTargetAtTime(0.10, t, 0.08)
    } else {
      _voices.fuelTone.out.gain.setTargetAtTime(0, t, 0.08)
    }

    // Ascent tone (center) — only while rising.
    if (s.monitor.vel && alive && s.vy > 0.2) {
      _voices.ascent.out.gain.setTargetAtTime(0.13, t, 0.05)
    } else {
      _voices.ascent.out.gain.setTargetAtTime(0, t, 0.06)
    }

    // Emergency tone (off-center) — physics asks "will I crash?"
    if (s.monitor.emergency && alive && P().willCrash()) {
      _voices.emergency.out.gain.setTargetAtTime(0.18, t, 0.04)
    } else {
      _voices.emergency.out.gain.setTargetAtTime(0, t, 0.08)
    }

    // Velocity clicks
    scheduleClicks(t)
  }

  // --- One-shot cues -----------------------------------------------------
  function playBeep(when, freq, dur, gain, pan, type) {
    const c = ctx()
    const out = c.createGain(); out.gain.value = 0
    const p = c.createStereoPanner(); p.pan.value = pan
    out.connect(p); p.connect(bus())
    const o = c.createOscillator(); o.type = type || 'square'; o.frequency.value = freq
    o.connect(out)
    envelope(out.gain, when, 0.005, dur * 0.4, dur * 0.6, gain)
    o.start(when); o.stop(when + dur + 0.05)
    setTimeout(() => { try { p.disconnect() } catch (e) {} }, (when + dur + 0.1 - engine.time()) * 1000)
  }

  function touchdownSoft() {
    const t = engine.time()
    const c = ctx()
    const out = c.createGain(); out.gain.value = 0
    const p = c.createStereoPanner(); p.pan.value = 0
    out.connect(p); p.connect(bus())
    const o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = 220
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 330
    o1.connect(out); o2.connect(out)
    envelope(out.gain, t, 0.02, 0.5, 0.6, 0.35)
    o1.start(t); o2.start(t)
    o1.stop(t + 1.2); o2.stop(t + 1.2)
    setTimeout(() => { try { p.disconnect() } catch (e) {} }, 1300)
  }

  function touchdownHard() {
    const t = engine.time()
    const c = ctx()
    const out = c.createGain(); out.gain.value = 0
    const p = c.createStereoPanner(); p.pan.value = 0
    out.connect(p); p.connect(bus())
    const noiseBuf = engine.buffer.whiteNoise({channels: 1, duration: 0.3})
    const noise = c.createBufferSource(); noise.buffer = noiseBuf
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 200; bp.Q.value = 0.7
    const noiseGain = c.createGain()
    noise.connect(bp); bp.connect(noiseGain); noiseGain.connect(out)
    envelope(noiseGain.gain, t, 0.005, 0.1, 0.15, 0.7)
    const sub = c.createOscillator(); sub.type = 'sawtooth'; sub.frequency.value = 50
    const subGain = c.createGain()
    sub.connect(subGain); subGain.connect(out)
    envelope(subGain.gain, t, 0.005, 0.05, 0.4, 0.5)
    out.gain.value = 1
    noise.start(t); sub.start(t); sub.stop(t + 0.6)
    setTimeout(() => { try { p.disconnect() } catch (e) {} }, 700)
  }

  // Mission fanfare — short triad rising with body index. Capped at the
  // 6th body so it doesn't drift unrecognizably high on the gas-giant runs.
  function missionFanfare(missionN) {
    const t = engine.time() + 0.05
    const root = 220 * Math.pow(2, Math.min(missionN - 1, 6) / 12)
    const intervals = [1, 5/4, 3/2]
    intervals.forEach((iv, i) => {
      const c = ctx()
      const out = c.createGain(); out.gain.value = 0
      const p = c.createStereoPanner(); p.pan.value = 0
      out.connect(p); p.connect(bus())
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = root * iv
      o.connect(out)
      envelope(out.gain, t + i * 0.18, 0.01, 0.18, 0.4, 0.25)
      o.start(t + i * 0.18); o.stop(t + i * 0.18 + 0.7)
      setTimeout(() => { try { p.disconnect() } catch (e) {} }, (t + i * 0.18 + 0.8 - engine.time()) * 1000)
    })
  }

  function bonusTally(steps) {
    const t = engine.time() + 0.05
    const n = Math.max(2, Math.min(8, steps | 0))
    for (let i = 0; i < n; i++) {
      playBeep(t + i * 0.12, 600 + i * 110, 0.08, 0.18, 0)
    }
  }

  function gameOverCue() {
    const t = engine.time()
    const c = ctx()
    const out = c.createGain(); out.gain.value = 0
    const p = c.createStereoPanner(); p.pan.value = 0
    out.connect(p); p.connect(bus())
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 660
    o.connect(out)
    envelope(out.gain, t, 0.02, 1.2, 0.3, 0.4)
    o.frequency.setValueAtTime(660, t)
    o.frequency.exponentialRampToValueAtTime(110, t + 1.5)
    o.start(t); o.stop(t + 1.7)
    const sub = c.createOscillator(); sub.type = 'sine'; sub.frequency.value = 55
    const subGain = c.createGain(); subGain.gain.value = 0
    sub.connect(subGain); subGain.connect(out)
    envelope(subGain.gain, t + 0.02, 0.01, 0.05, 0.25, 0.35)
    sub.start(t + 0.02); sub.stop(t + 0.5)
    setTimeout(() => { try { p.disconnect() } catch (e) {} }, 1800)
  }

  // --- Diagnostic helpers (used by #test / #learn) -----------------------
  function emitOneShot(spec) {
    const {kind, pan = 0} = spec
    if (kind === 'click')        return playClick(engine.time() + 0.02)
    if (kind === 'altTone')      return playBeep(engine.time(), 900, 0.7, 0.22, -0.75, 'sine')
    if (kind === 'fuelTone')     return playBeep(engine.time(), 700, 0.7, 0.18, 0.75, 'square')
    if (kind === 'ascent')       return playBeep(engine.time(), 1600, 0.6, 0.22, 0, 'sine')
    if (kind === 'emergency')    return playBeep(engine.time(), 520, 0.8, 0.25, 0.35, 'sawtooth')
    if (kind === 'thrust')       return playBeep(engine.time(), 180, 0.5, 0.3, pan, 'triangle')
    if (kind === 'softLand')     return touchdownSoft()
    if (kind === 'hardLand')     return touchdownHard()
    if (kind === 'fanfare')      return missionFanfare(1)
    if (kind === 'bonusTally')   return bonusTally(5)
    if (kind === 'gameOver')     return gameOverCue()
  }

  return {
    start,
    silenceAll,
    unmute,
    isStarted,
    frame,
    touchdownSoft,
    touchdownHard,
    missionFanfare,
    bonusTally,
    gameOverCue,
    emitOneShot,
  }
})()
