content.audio = (() => {
  const W = () => content.world

  function ctxNow() { return engine.context().currentTime }

  // ---------- helpers ----------

  function envelope(gain, t0, attack, hold, release, peak) {
    gain.cancelScheduledValues(t0)
    gain.setValueAtTime(0, t0)
    gain.linearRampToValueAtTime(peak, t0 + attack)
    if (hold > 0) gain.setValueAtTime(peak, t0 + attack + hold)
    gain.linearRampToValueAtTime(0, t0 + attack + hold + release)
  }

  function spatialNode() {
    return engine.ear.binaural.create()
  }

  function playAt(x, y, build, opts = {}) {
    const ctx = engine.context()
    const t0 = ctx.currentTime
    const post = ctx.createGain()
    post.gain.value = opts.gain != null ? opts.gain : 1

    const b = W().behindness(x, y)
    const muffle = ctx.createBiquadFilter()
    muffle.type = 'lowpass'
    muffle.Q.value = 0.7
    muffle.frequency.value = Math.max(700, 22000 - b * 21300)
    post.connect(muffle)

    const xNorm = W().clamp(x, -1, 1)
    const yNorm = W().clamp(y, 0, 1)
    const pan = ctx.createStereoPanner()
    pan.pan.setValueAtTime(xNorm, t0)
    const dist = ctx.createGain()
    dist.gain.value = (1 - 0.45 * yNorm) * (1 - 0.30 * b)
    muffle.connect(pan).connect(dist).connect(engine.mixer.input())

    const binauralTap = ctx.createGain()
    binauralTap.gain.value = 0.45
    const binaural = engine.ear.binaural.create({
      gainModel: engine.ear.gainModel.exponential.instantiate(),
      filterModel: engine.ear.filterModel.head.instantiate(),
    }).from(binauralTap).to(engine.mixer.input())
    binaural.update(W().relativeVector(x, y))
    muffle.connect(binauralTap)

    const ttl = build(post, t0) || 1
    setTimeout(() => {
      try { post.disconnect() } catch (_) {}
      try { muffle.disconnect() } catch (_) {}
      try { pan.disconnect() } catch (_) {}
      try { dist.disconnect() } catch (_) {}
      try { binauralTap.disconnect() } catch (_) {}
      try { binaural.destroy() } catch (_) {}
    }, (ttl + 0.25) * 1000)
  }

  function playUi(build, opts = {}) {
    const ctx = engine.context()
    const t0 = ctx.currentTime
    const post = ctx.createGain()
    post.gain.value = opts.gain != null ? opts.gain : 1
    post.connect(engine.mixer.input())
    const ttl = build(post, t0) || 1
    setTimeout(() => {
      try { post.disconnect() } catch (_) {}
    }, (ttl + 0.25) * 1000)
  }

  // ---------- looping voices (props) ----------

  function makeProp({build, x = 0, y = 0.5, gain = 0, stereo = true}) {
    const ctx = engine.context()
    const output = ctx.createGain()
    output.gain.value = gain

    const muffle = ctx.createBiquadFilter()
    muffle.type = 'lowpass'
    muffle.frequency.value = 22000
    muffle.Q.value = 0.7
    output.connect(muffle)

    let pan, distGain
    if (stereo) {
      pan = ctx.createStereoPanner()
      pan.pan.value = W().clamp(x, -1, 1)
      distGain = ctx.createGain()
      distGain.gain.value = 1
      muffle.connect(pan).connect(distGain).connect(engine.mixer.input())
    }

    const binauralTap = ctx.createGain()
    binauralTap.gain.value = stereo ? 0.5 : 1
    muffle.connect(binauralTap)
    const binaural = engine.ear.binaural.create({
      gainModel: engine.ear.gainModel.exponential.instantiate(),
      filterModel: engine.ear.filterModel.head.instantiate(),
    }).from(binauralTap).to(engine.mixer.input())

    const stop = build(output)
    let vector = {x, y}

    return {
      output,
      setPosition(nx, ny) { vector = {x: nx, y: ny} },
      setGain(v) { output.gain.setTargetAtTime(v, ctxNow(), 0.04) },
      setGainImmediate(v) { output.gain.value = v },
      getPosition: () => ({x: vector.x, y: vector.y}),
      destroy() {
        try { stop && stop() } catch (_) {}
        try { output.disconnect() } catch (_) {}
        try { muffle.disconnect() } catch (_) {}
        if (pan) { try { pan.disconnect() } catch (_) {} }
        if (distGain) { try { distGain.disconnect() } catch (_) {} }
        try { binauralTap.disconnect() } catch (_) {}
        try { binaural.destroy() } catch (_) {}
      },
      _update() {
        if (pan) pan.pan.setTargetAtTime(W().clamp(vector.x, -1, 1), ctxNow(), 0.03)
        if (distGain) {
          const yc = W().clamp(vector.y, 0, 1)
          distGain.gain.setTargetAtTime(1 - 0.35 * yc, ctxNow(), 0.05)
        }
        binaural.update(W().relativeVector(vector.x, vector.y))
        const b = W().behindness(vector.x, vector.y)
        const cutoff = 22000 - b * 21300
        muffle.frequency.setTargetAtTime(Math.max(700, cutoff), ctxNow(), 0.05)
      },
    }
  }

  // ---------- voice builders ----------

  function buildIncomingWhistle(out, opts = {}) {
    const ctx = engine.context()
    const t0 = ctxNow()

    const buf = engine.buffer.whiteNoise({channels: 1, duration: 4})
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true

    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = opts.baseHz || 1500
    bp.Q.value = opts.wave === 'square' ? 3.5 : 2.8

    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 9.0
    const lfoDepth = ctx.createGain()
    lfoDepth.gain.value = 0.45
    const ampMod = ctx.createGain()
    ampMod.gain.value = 0.5
    lfo.connect(lfoDepth).connect(ampMod.gain)

    const g = ctx.createGain()
    g.gain.value = opts.level != null ? opts.level : 0.10
    bp.connect(ampMod).connect(g).connect(out)
    src.connect(bp)
    src.start()
    lfo.start()

    return {
      stop: () => {
        try { src.stop() } catch (_) {}
        try { lfo.stop() } catch (_) {}
      },
      setFreq: (hz) => {
        bp.frequency.setTargetAtTime(hz, ctxNow(), 0.02)
      },
      setCutoff: (c) => {
        bp.Q.setTargetAtTime(0.8 + (c / 4900) * 3.5, ctxNow(), 0.03)
      },
    }
  }

  function buildSplitterVoice(out) {
    const ctx = engine.context()
    const oscs = [], lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 1.4
    const g = ctx.createGain(); g.gain.value = 0.18
    const ratios = [1.0, 1.06, 1.12]
    for (const r of ratios) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = 700 * r
      o.connect(lp)
      o.start()
      oscs.push(o)
    }
    lp.connect(g).connect(out)
    return {
      stop: () => { for (const o of oscs) try { o.stop() } catch (_) {} },
      setFreq: (hz) => {
        for (let i = 0; i < oscs.length; i++) {
          oscs[i].frequency.setTargetAtTime(hz * ratios[i], ctxNow(), 0.03)
        }
      },
      setCutoff: (hz) => lp.frequency.setTargetAtTime(hz, ctxNow(), 0.04),
    }
  }

  function buildBomberDrone(out) {
    const ctx = engine.context()
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 80
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 82
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 1.0
    const g = ctx.createGain(); g.gain.value = 0.18
    o1.connect(lp); o2.connect(lp)
    lp.connect(g).connect(out)
    o1.start(); o2.start()
    return {
      stop: () => { try { o1.stop() } catch (_) {} try { o2.stop() } catch (_) {} },
      setHighpass: (open) => {
        lp.frequency.setTargetAtTime(open ? 1400 : 600, ctxNow(), 0.05)
      },
    }
  }

  function buildCityAmbient(out, hz) {
    const ctx = engine.context()
    const lo = ctx.createOscillator(); lo.type = 'triangle'; lo.frequency.value = hz
    const hi = ctx.createOscillator(); hi.type = 'sine';     hi.frequency.value = hz * 2
    const mix = ctx.createGain(); mix.gain.value = 0.5
    lo.connect(mix); hi.connect(mix)
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.6 + (hz % 1.3) * 0.3
    const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0.18
    const trem = ctx.createGain(); trem.gain.value = 0.55
    lfo.connect(lfoDepth).connect(trem.gain)
    const g = ctx.createGain(); g.gain.value = 0.05
    mix.connect(trem).connect(g).connect(out)
    lo.start(); hi.start(); lfo.start()
    return {
      stop: () => {
        try { lo.stop() } catch (_) {}
        try { hi.stop() } catch (_) {}
        try { lfo.stop() } catch (_) {}
      },
    }
  }

  // Battery lock tone: continuous sine with proximity wobble.
  // Each battery has a distinct base pitch and fixed pan position.
  // As threats approach the battery's zone, gain rises and an LFO-driven
  // tremolo/vibrato intensifies ("wow-wow-wow" wobble).
  function buildBatteryLockTone(out, {pitch = 240, panPos = 0} = {}) {
    const ctx = engine.context()
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = pitch
    const g = ctx.createGain(); g.gain.value = 0

    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 8
    const ampDepth = ctx.createGain(); ampDepth.gain.value = 0
    const tremGain = ctx.createGain(); tremGain.gain.value = 1
    lfo.connect(ampDepth).connect(tremGain.gain)

    const pitchDepth = ctx.createGain(); pitchDepth.gain.value = 0
    lfo.connect(pitchDepth).connect(osc.frequency)

    osc.connect(tremGain).connect(g).connect(out)
    osc.start(); lfo.start()

    // Set pan position via a fixed StereoPanner before the output.
    const panner = ctx.createStereoPanner()
    panner.pan.value = panPos
    g.connect(panner)
    panner.connect(out)

    return {
      stop: () => {
        try { osc.stop() } catch (_) {}
        try { lfo.stop() } catch (_) {}
      },
      setGain: (v) => g.gain.setTargetAtTime(v, ctxNow(), 0.04),
      setTremolo: (depth) => {
        const d = Math.max(0, Math.min(1, depth))
        ampDepth.gain.setTargetAtTime(d * 0.85, ctxNow(), 0.02)
        pitchDepth.gain.setTargetAtTime(d * 35, ctxNow(), 0.02)
      },
    }
  }

  // ---------- one-shots ----------

  function batteryThunk(batteryId) {
    const pitches = {L: 180, C: 240, R: 320}
    const f = pitches[batteryId] || 240
    playUi((out, t0) => {
      const ctx = engine.context()
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(f, t0)
      o.frequency.exponentialRampToValueAtTime(f * 0.5, t0 + 0.18)
      const eg = ctx.createGain(); eg.gain.value = 0
      envelope(eg.gain, t0, 0.003, 0.005, 0.18, 0.55)
      o.connect(eg).connect(out)
      o.start(t0); o.stop(t0 + 0.25)
      const buf = engine.buffer.whiteNoise({channels: 1, duration: 0.04})
      const src = ctx.createBufferSource(); src.buffer = buf
      const cf = ctx.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = 1500
      const cg = ctx.createGain(); cg.gain.value = 0
      envelope(cg.gain, t0, 0.001, 0.003, 0.04, 0.4)
      src.connect(cf).connect(cg).connect(out)
      src.start(t0)
      return 0.3
    }, {gain: 0.9})
  }

  function emitOutgoingWhistle(startX, startY, endX, endY, durSec, batteryId) {
    const ctx = engine.context()
    const t0 = ctx.currentTime
    const post = ctx.createGain(); post.gain.value = 0
    const pan = ctx.createStereoPanner()
    pan.pan.setValueAtTime(W().clamp(startX, -1, 1), t0)
    pan.pan.linearRampToValueAtTime(W().clamp(endX, -1, 1), t0 + durSec)
    post.connect(pan).connect(engine.mixer.input())

    const wave = batteryId === 'L' ? 'sawtooth' : (batteryId === 'C' ? 'square' : 'triangle')
    const osc = ctx.createOscillator(); osc.type = wave
    osc.frequency.setValueAtTime(440, t0)
    osc.frequency.exponentialRampToValueAtTime(1760, t0 + durSec)
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4000; lp.Q.value = 0.8
    osc.connect(lp).connect(post)

    envelope(post.gain, t0, 0.02, durSec - 0.05, 0.05, 0.16)
    osc.start(t0); osc.stop(t0 + durSec + 0.1)

    const binaural = engine.ear.binaural.create()
    binaural.to(engine.mixer.input())
    const tap = ctx.createGain(); tap.gain.value = 0.35
    post.connect(tap)
    binaural.from(tap)
    binaural.update(W().relativeVector((startX + endX) / 2, (startY + endY) / 2))

    setTimeout(() => {
      try { post.disconnect() } catch (_) {}
      try { pan.disconnect() } catch (_) {}
      try { lp.disconnect() } catch (_) {}
      try { tap.disconnect() } catch (_) {}
      try { binaural.destroy() } catch (_) {}
    }, (durSec + 0.4) * 1000)
  }

  function emitBlast(x, y, durSec) {
    const ctx = engine.context()
    const t0 = ctx.currentTime
    const post = ctx.createGain(); post.gain.value = 0
    const pan = ctx.createStereoPanner()
    pan.pan.value = W().clamp(x, -1, 1)
    post.connect(pan).connect(engine.mixer.input())

    const sub = ctx.createOscillator()
    sub.type = 'sine'
    sub.frequency.setValueAtTime(45, t0)
    sub.frequency.exponentialRampToValueAtTime(12, t0 + durSec)
    const subGain = ctx.createGain()
    envelope(subGain.gain, t0, 0.003, durSec * 0.20, durSec * 0.80, 0.75)
    sub.connect(subGain).connect(post)
    sub.start(t0); sub.stop(t0 + durSec + 0.1)

    const buf = engine.buffer.whiteNoise({channels: 1, duration: durSec + 0.1})
    const src = ctx.createBufferSource(); src.buffer = buf
    const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.Q.value = 0.8
    bp.frequency.setValueAtTime(700, t0)
    bp.frequency.exponentialRampToValueAtTime(30, t0 + durSec)
    const noiseGain = ctx.createGain()
    envelope(noiseGain.gain, t0, 0.005, durSec * 0.10, durSec * 0.90, 0.65)
    src.connect(bp).connect(noiseGain).connect(post)
    src.start(t0); src.stop(t0 + durSec + 0.1)

    envelope(post.gain, t0, 0.001, 0.03, 0.02, 1.2)

    setTimeout(() => {
      try { post.disconnect() } catch (_) {}
      try { pan.disconnect() } catch (_) {}
      try { sub.disconnect() } catch (_) {}
      try { subGain.disconnect() } catch (_) {}
      try { bp.disconnect() } catch (_) {}
      try { noiseGain.disconnect() } catch (_) {}
    }, (durSec + 0.4) * 1000)
  }

  function emitCityDestroy(x, basePitchHz) {
    playAt(x, 0, (out, t0) => {
      const ctx = engine.context()
      const o = ctx.createOscillator(); o.type = 'sawtooth'
      o.frequency.setValueAtTime(basePitchHz, t0)
      o.frequency.exponentialRampToValueAtTime(basePitchHz * 0.25, t0 + 1.1)
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2200, t0)
      lp.frequency.exponentialRampToValueAtTime(280, t0 + 1.1)
      const eg = ctx.createGain(); eg.gain.value = 0
      envelope(eg.gain, t0, 0.02, 0.05, 1.05, 0.55)
      o.connect(lp).connect(eg).connect(out)
      o.start(t0); o.stop(t0 + 1.2)
      const buf = engine.buffer.whiteNoise({channels: 1, duration: 1.1})
      const ns = ctx.createBufferSource(); ns.buffer = buf
      const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 600
      const ng = ctx.createGain(); ng.gain.value = 0
      envelope(ng.gain, t0, 0.01, 0.3, 0.7, 0.35)
      ns.connect(nf).connect(ng).connect(out)
      ns.start(t0)
      return 1.2
    }, {gain: 1.2})
  }

  function emitBonusCity(x, basePitchHz) {
    playAt(x, 0, (out, t0) => {
      const ctx = engine.context()
      const notes = [1.0, 1.25, 1.5, 2.0]
      notes.forEach((mult, i) => {
        const o = ctx.createOscillator(); o.type = 'triangle'
        o.frequency.value = basePitchHz * mult
        const eg = ctx.createGain(); eg.gain.value = 0
        const ts = t0 + i * 0.10
        envelope(eg.gain, ts, 0.005, 0.05, 0.20, 0.35)
        o.connect(eg).connect(out)
        o.start(ts); o.stop(ts + 0.3)
      })
      return 0.7
    }, {gain: 1.0})
  }

  function emitDepletion() {
    playUi((out, t0) => {
      const ctx = engine.context()
      const o = ctx.createOscillator(); o.type = 'square'
      o.frequency.setValueAtTime(420, t0)
      o.frequency.exponentialRampToValueAtTime(350, t0 + 0.18)
      const eg = ctx.createGain(); eg.gain.value = 0
      envelope(eg.gain, t0, 0.003, 0.02, 0.18, 0.30)
      o.connect(eg).connect(out)
      o.start(t0); o.stop(t0 + 0.3)
      return 0.3
    }, {gain: 0.9})
  }

  function emitTick(x, y, {freq = 900, dur = 0.25, gain = 0.7} = {}) {
    const b = content.world.behindness(x, y)
    const f = freq * (1 - 0.55 * b)
    playAt(x, y, (out, t0) => {
      const ctx = engine.context()
      const o = ctx.createOscillator(); o.type = 'sine'
      o.frequency.setValueAtTime(f, t0)
      o.frequency.exponentialRampToValueAtTime(Math.max(80, f * 0.4), t0 + dur)
      const o2 = ctx.createOscillator(); o2.type = 'triangle'
      o2.frequency.setValueAtTime(f * 2, t0)
      o2.frequency.exponentialRampToValueAtTime(Math.max(160, f * 0.7), t0 + dur)
      const eg = ctx.createGain(); eg.gain.value = 0
      envelope(eg.gain, t0, 0.002, 0.02, dur - 0.022, 0.55)
      o.connect(eg); o2.connect(eg); eg.connect(out)
      o.start(t0); o2.start(t0)
      o.stop(t0 + dur + 0.05); o2.stop(t0 + dur + 0.05)
      return dur + 0.1
    }, {gain})
  }

  // ---------- city ambient props ----------

  const CITY_PITCHES = [
    130.81, // C3 — Madrid
    146.83, // D3 — Barcelona
    164.81, // E3 — Sevilla
    196.00, // G3 — Valencia
    220.00, // A3 — Zaragoza
    261.63, // C4 — Bilbao
  ]

  const cityProps = []
  let started = false

  function start() {
    if (started) return
    started = true
    const cities = content.world.CITY_POSITIONS
    for (let i = 0; i < cities.length; i++) {
      const hz = CITY_PITCHES[i] || 150
      const prop = makeProp({
        build: (out) => buildCityAmbient(out, hz),
        x: cities[i].x,
        y: 0,
        gain: 0,
      })
      prop.pitchHz = hz
      cityProps.push(prop)
    }
  }

  function stop() {
    if (!started) return
    started = false
    for (const p of cityProps) {
      try { p.destroy() } catch (_) {}
    }
    cityProps.length = 0
  }

  function setStaticListener(yaw) {
    const y = yaw != null ? yaw : content.world.LISTENER_YAW
    engine.position.setVector({x: 0, y: 0, z: 0})
    engine.position.setQuaternion(engine.tool.quaternion.fromEuler({yaw: y}))
    content.world._lastYaw = y
  }

  function silenceAll() {
    for (const p of cityProps) p.setGainImmediate(0)
  }

  function frameCities() {
    if (!started) return
    const alive = content.cities ? content.cities.aliveFlags() : null
    for (let i = 0; i < cityProps.length; i++) {
      const target = alive && alive[i] ? 0.7 : 0
      cityProps[i].setGain(target)
      cityProps[i]._update()
    }
  }

  function getCityProp(i) { return cityProps[i] }
  function getCityPitch(i) { return CITY_PITCHES[i] }

  return {
    envelope, spatialNode, playAt, playUi, ctxNow,
    makeProp,
    buildIncomingWhistle, buildSplitterVoice, buildBomberDrone,
    buildBatteryLockTone,
    batteryThunk, emitOutgoingWhistle, emitBlast,
    emitCityDestroy, emitBonusCity, emitDepletion, emitTick,
    start, stop, setStaticListener, silenceAll, frameCities,
    isStarted: () => started,
    getCityProp, getCityPitch,
    CITY_PITCHES,
  }
})()
