// SURGE audio. Player-centric stereo field: everything that matters is panned
// by its lane offset from YOU (dx) and loudened by how far ahead it is (dist),
// so the ear leads the eye. Each environment has its own looping ambience plus
// a palette of one-shots; every obstacle, enemy, weapon, pickup and life event
// has a distinct synthesized voice — no samples, all Web Audio oscillators and
// filtered noise.
//
// STRUCTURE (the "mix bus" overhaul):
//   fxBus  — all one-shot cues, shot/weapon layers, motion bed → limiter
//   ambBus — every environment ambience loop + one-shot scheduler → limiter
//   Cue templates (strike()) let the same layered recipe drive many events;
//   big events duck() the ambience so the foreground reads clearly.
//
// Pan convention: +dx = to your right. panOf(dx) clamps dx/2 to ±1 (the road
// is 5 lanes wide, lane centres at ±1, ±0.5, 0 → the edges sit near the
// speakers). Loudness scales with proximity via at(dx, dist, span).
content.audio = (() => {
  const C = content.constants
  const U = content.util

  let ambience = null   // current environment ambience (loops + scheduler)
  let motion = null     // the "you are running" bed
  let beam = null       // laser beam loop
  let stretch = null    // bow draw loop
  let rotor = null      // heli rotor loop
  let pending = []
  let stepAcc = 0
  let fxBus = null
  let ambBus = null

  function ctx() { return engine.context() }
  function out() { return engine.mixer.input() }

  function ensureBuses() {
    if (fxBus) return
    fxBus = ctx().createGain(); fxBus.gain.value = 1
    ambBus = ctx().createGain(); ambBus.gain.value = 1
    fxBus.connect(out())
    ambBus.connect(out())
  }

  // Dip the ambience bed so loud foreground cues cut through, then restore.
  function duckAmbience(by, secs) {
    if (!ambBus) return
    const c = ctx(), now = c.currentTime
    try {
      ambBus.gain.cancelScheduledValues(now)
      ambBus.gain.setValueAtTime(Math.max(0.0001, ambBus.gain.value), now)
      ambBus.gain.linearRampToValueAtTime(Math.max(0.08, 1 - (by || 0.35)), now + 0.04)
      ambBus.gain.linearRampToValueAtTime(1, now + (secs || 0.8))
    } catch (e) {}
  }

  function panOf(dx) { return Math.max(-1, Math.min(1, dx / Math.max(1, C.LANE_HALF))) }
  function prox(dist, span) { return 1 - Math.max(0, Math.min(1, dist / (span || C.THREAT_SPAN))) }

  // ---- shared noise ----
  let _noise = null
  function noiseBuffer() {
    if (_noise) return _noise
    const c = ctx()
    const len = Math.floor(c.sampleRate * 2)
    const buf = c.createBuffer(1, len, c.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    _noise = buf
    return _noise
  }
  function noiseSource() {
    const s = ctx().createBufferSource()
    s.buffer = noiseBuffer()
    s.loop = true
    return s
  }

  // ---- primitives -----------------------------------------------------------------
  function env(param, t0, {a = 0.005, hold = 0, r = 0.08, peak = 1}) {
    try {
      param.cancelScheduledValues(t0)
      param.setValueAtTime(0.0001, t0)
      param.linearRampToValueAtTime(peak, t0 + a)
      param.setValueAtTime(peak, t0 + a + hold)
      param.linearRampToValueAtTime(0.0001, t0 + a + hold + r)
    } catch (e) {}
  }

  function voice({type = 'square', freq, glideTo, t0, a = 0.004, hold = 0.03, r = 0.08, peak = 0.3, pan = 0, dest}) {
    ensureBuses()
    const c = ctx()
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = type
    o.frequency.setValueAtTime(Math.max(20, freq), t0)
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + a + hold + r)
    env(g.gain, t0, {a, hold, r, peak})
    o.connect(g)
    if (pan !== 0) {
      const sp = c.createStereoPanner()
      sp.pan.value = Math.max(-1, Math.min(1, pan))
      g.connect(sp).connect(dest || fxBus)
    } else {
      g.connect(dest || fxBus)
    }
    o.start(t0)
    o.stop(t0 + a + hold + r + 0.05)
  }

  function noiseBurst(t0, {peak = 0.25, dur = 0.06, cutoff = 3200, pan = 0, type = 'lowpass', q = 0.7, sweepTo = 0, sweepFrom = 0, dest} = {}) {
    ensureBuses()
    const c = ctx()
    const s = noiseSource()
    const f = c.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(sweepFrom || cutoff, t0)
    f.Q.value = q
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t0 + dur)
    const g = c.createGain()
    env(g.gain, t0, {a: 0.002, hold: 0, r: dur, peak})
    s.connect(f).connect(g)
    if (pan !== 0) {
      const sp = c.createStereoPanner()
      sp.pan.value = Math.max(-1, Math.min(1, pan))
      g.connect(sp).connect(dest || fxBus)
    } else {
      g.connect(dest || fxBus)
    }
    s.start(t0)
    s.stop(t0 + dur + 0.05)
    const id = setTimeout(() => { try { g.disconnect(); f.disconnect(); s.disconnect() } catch (e) {} }, (dur + 0.3) * 1000)
    pending.push(id)
  }

  // ---- spatial helpers -------------------------------------------------------------
  function cueAt(dx, dist, span, fn) {
    const p = panOf(dx)
    const v = 0.3 + 0.7 * prox(dist, span)
    fn(p, v, dx)
  }

  // ---- cue template -------------------------------------------------------------------
  // A layered recipe: each layer is either a voice (f/g = pitch in Hz) or a noise
  // burst (cutoff/sweep). Every layer scales peak by `v` (proximity) and pans `p`.
  function strike(spec, p, v, t0) {
    const s = spec || []
    for (const L of s) {
      const dt0 = t0 + (L.d || 0)
      if (L.noise) {
        noiseBurst(dt0, {peak: (L.peak || 0.1) * (v || 1), dur: L.dur || 0.1, cutoff: L.cutoff, sweepTo: L.sweepTo, sweepFrom: L.sweepFrom, type: L.type || 'bandpass', q: L.q || 1, pan: p})
      } else {
        voice({type: L.wave || 'square', freq: L.f, glideTo: L.g, t0: dt0, a: L.a || 0.004, hold: L.hold || 0.04, r: L.r || 0.1, peak: (L.peak || 0.12) * (v || 1), pan: p})
      }
    }
  }

  // =============================================================================
  // AMBIENCE
  // =============================================================================
  // Each environment = a set of continuous loops (noise beds + drones) and a
  // stochastic scheduler that fires one-shots (drips, honks, crackles, chimes).
  const AMBIENCES = {
    city: {
      loops: [
        {noise: true, type: 'lowpass', cutoff: 320, gain: 0.05, lfo: 0.13},      // traffic rumble
        {noise: true, type: 'bandpass', cutoff: 900, gain: 0.02, lfo: 0.07},     // distant wash
        {tone: 'sawtooth', freq: 55, gain: 0.015, lfo: 0.11},                    // low city hum
      ],
      events: [
        {fn: honk, min: 4.5, max: 9, weight: 0.7},
      ],
    },
    desert: {
      loops: [
        {noise: true, type: 'bandpass', cutoff: 640, gain: 0.035, lfo: 0.21, q: 1.4}, // wind
        {noise: true, type: 'highpass', cutoff: 5200, gain: 0.008, lfo: 0.16},        // sand hiss
      ],
      events: [
        {fn: gust, min: 6, max: 12, weight: 0.8},
      ],
    },
    volcano: {
      loops: [
        {noise: true, type: 'lowpass', cutoff: 240, gain: 0.06, lfo: 0.18},      // lava rumble
        {noise: true, type: 'bandpass', cutoff: 1500, gain: 0.018, lfo: 0.5},    // crackle bed
      ],
      events: [
        {fn: crackle, min: 0.25, max: 1.1, weight: 1},
        {fn: lavaBoom, min: 7, max: 14, weight: 0.4},
      ],
    },
    tundra: {
      loops: [
        {noise: true, type: 'bandpass', cutoff: 1800, gain: 0.02, lfo: 0.3, q: 1.6}, // cold wind
        {tone: 'sine', freq: 130, gain: 0.01, lfo: 0.08},                            // deep chill
      ],
      events: [
        {fn: iceChime, min: 3.5, max: 8, weight: 0.6},
      ],
    },
    space: {
      loops: [
        {tone: 'sine', freq: 40, gain: 0.05, lfo: 0.1},       // vacuum sub
        {noise: true, type: 'lowpass', cutoff: 220, gain: 0.012, lfo: 0.07}, // faint station hum
      ],
      events: [
        {fn: starBlip, min: 2.5, max: 7, weight: 0.5},
      ],
    },
    sewer: {
      loops: [
        {tone: 'sine', freq: 58, gain: 0.03, lfo: 0.06},       // murky hum
        {noise: true, type: 'lowpass', cutoff: 520, gain: 0.025, lfo: 0.12}, // water
      ],
      events: [
        {fn: drip, min: 0.7, max: 2.4, weight: 1},
        {fn: gurgle, min: 4, max: 9, weight: 0.5},
      ],
    },
    jungle: {
      loops: [
        {noise: true, type: 'bandpass', cutoff: 1400, gain: 0.03, lfo: 0.3, q: 1.4},   // canopy rustle
        {noise: true, type: 'lowpass', cutoff: 300, gain: 0.035, lfo: 0.11},           // deep forest bed
        {tone: 'triangle', freq: 220, gain: 0.008, lfo: 0.06},                         // warm drone
      ],
      events: [
        {fn: birdCall, min: 3, max: 8, weight: 0.7},
        {fn: insectBuzz, min: 1.5, max: 4, weight: 0.6},
        {fn: monkeyWhoop, min: 8, max: 16, weight: 0.5},
      ],
    },
    ocean: {
      loops: [
        {noise: true, type: 'bandpass', cutoff: 420, gain: 0.05, lfo: 0.08, q: 0.8},   // surf
        {noise: true, type: 'highpass', cutoff: 2400, gain: 0.01, lfo: 0.12},           // spray
        {tone: 'sine', freq: 55, gain: 0.02, lfo: 0.07},                                // depth
      ],
      events: [
        {fn: waveSplash, min: 2, max: 6, weight: 0.8},
        {fn: seabird, min: 6, max: 13, weight: 0.5},
        {fn: bubble, min: 3, max: 8, weight: 0.5},
      ],
    },
    neon: {
      loops: [
        {tone: 'sine', freq: 50, gain: 0.04, lfo: 0.09},         // mains hum
        {noise: true, type: 'highpass', cutoff: 4200, gain: 0.008, lfo: 0.2}, // static
        {tone: 'square', freq: 220, gain: 0.004, lfo: 0.14},     // circuitry tick
      ],
      events: [
        {fn: glitchBlip, min: 1.2, max: 4, weight: 0.9},
        {fn: zzzap, min: 4, max: 9, weight: 0.5},
      ],
    },
    cavern: {
      loops: [
        {noise: true, type: 'lowpass', cutoff: 200, gain: 0.05, lfo: 0.1},     // low rumble
        {noise: true, type: 'bandpass', cutoff: 800, gain: 0.012, lfo: 0.05, q: 2}, // air
        {tone: 'sine', freq: 65, gain: 0.02, lfo: 0.05},                        // stone drone
      ],
      events: [
        {fn: cavernDrip, min: 1.2, max: 4, weight: 1},
        {fn: rockDrop, min: 6, max: 14, weight: 0.5},
        {fn: echoBlip, min: 8, max: 18, weight: 0.4},
      ],
    },
  }

  function startAmbience(envId) {
    stopAmbience()
    ensureBuses()
    const def = AMBIENCES[envId] || AMBIENCES.city
    const c = ctx()
    const master = c.createGain()
    master.gain.value = 0.0001
    master.gain.setTargetAtTime(0.55, c.currentTime, 0.6)
    master.connect(ambBus)
    const loops = []
    for (const d of def.loops) {
      const g = c.createGain()
      g.gain.value = d.gain
      if (d.noise) {
        const s = noiseSource()
        const f = c.createBiquadFilter()
        f.type = d.type
        f.frequency.value = d.cutoff
        f.Q.value = d.q || 0.8
        s.connect(f).connect(g)
        const lfo = c.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = d.lfo
        const lg = c.createGain()
        lg.gain.value = d.cutoff * 0.35
        lfo.connect(lg).connect(f.frequency)
        s.start(); lfo.start()
        loops.push({stop: () => { try { s.stop(); lfo.stop(); g.disconnect(); f.disconnect(); lg.disconnect() } catch (e) {} }})
      } else {
        const o = c.createOscillator()
        o.type = d.type
        o.frequency.value = d.freq
        o.connect(g)
        const lfo = c.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = d.lfo
        const lg = c.createGain()
        lg.gain.value = d.freq * 0.4
        lfo.connect(lg).connect(o.frequency)
        o.start(); lfo.start()
        loops.push({stop: () => { try { o.stop(); lfo.stop(); g.disconnect(); lg.disconnect() } catch (e) {} }})
      }
      g.connect(master)
    }
    let events = []
    const schedule = () => {
      if (!ambience || ambience.def !== def) return
      const pool = def.events.filter(e => e.weight >= Math.random())
      if (pool.length) U.pick(pool).fn()
      const next = U.rand(0.4, 2.2)
      const id = setTimeout(schedule, next * 1000)
      events.push(id)
    }
    events.push(setTimeout(schedule, 500))
    ambience = {def, master, loops, events, envId}
  }
  function stopAmbience() {
    if (!ambience) return
    const a = ambience
    ambience = null
    for (const id of a.events) clearTimeout(id)
    const c = ctx()
    try {
      a.master.gain.cancelScheduledValues(c.currentTime)
      a.master.gain.setValueAtTime(a.master.gain.value, c.currentTime)
      a.master.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.4)
    } catch (e) {}
    const id = setTimeout(() => {
      for (const l of a.loops) l.stop()
      try { a.master.disconnect() } catch (e) {}
    }, 480)
    pending.push(id)
  }

  // ambience one-shots
  function honk() {
    const t0 = ctx().currentTime
    const pan = U.chance(0.5) ? -0.6 : 0.6
    voice({type: 'sawtooth', freq: 190, glideTo: 175, t0, a: 0.02, hold: 0.22, r: 0.1, peak: 0.05, pan})
    voice({type: 'sawtooth', freq: 95, glideTo: 88, t0, a: 0.02, hold: 0.24, r: 0.1, peak: 0.04, pan})
  }
  function gust() {
    const t0 = ctx().currentTime
    noiseBurst(t0, {peak: 0.06, dur: 1.6, cutoff: 500, sweepTo: 1800, type: 'bandpass', q: 1.2, pan: U.rand(-0.5, 0.5)})
  }
  function crackle() {
    const t0 = ctx().currentTime
    noiseBurst(t0, {peak: 0.03, dur: 0.05, cutoff: 3200, type: 'highpass', pan: U.rand(-0.8, 0.8)})
  }
  function lavaBoom() {
    const t0 = ctx().currentTime
    voice({type: 'sine', freq: 70, glideTo: 30, t0, a: 0.01, hold: 0.3, r: 0.6, peak: 0.08})
    noiseBurst(t0, {peak: 0.05, dur: 0.5, cutoff: 300, sweepTo: 60, type: 'lowpass'})
    duckAmbience(0.3, 1.2)
  }
  function iceChime() {
    const t0 = ctx().currentTime
    voice({type: 'sine', freq: U.pick([1760, 2093, 2637, 3136]), t0, a: 0.002, hold: 0.5, r: 1.6, peak: 0.015, pan: U.rand(-0.8, 0.8)})
  }
  function starBlip() {
    const t0 = ctx().currentTime
    voice({type: 'triangle', freq: U.rand(700, 1400), t0, a: 0.002, hold: 0.04, r: 0.3, peak: 0.015, pan: U.rand(-0.8, 0.8)})
  }
  function drip() {
    const t0 = ctx().currentTime
    const pan = U.rand(-0.7, 0.7)
    voice({type: 'sine', freq: U.rand(700, 1400), glideTo: 300, t0, a: 0.003, hold: 0.01, r: 0.14, peak: 0.04, pan})
    noiseBurst(t0 + 0.02, {peak: 0.02, dur: 0.1, cutoff: 2000, type: 'bandpass', q: 2, pan})
  }
  function gurgle() {
    const t0 = ctx().currentTime
    const pan = U.rand(-0.7, 0.7)
    noiseBurst(t0, {peak: 0.04, dur: 0.8, cutoff: 600, sweepTo: 200, sweepFrom: 900, type: 'bandpass', q: 3, pan})
    noiseBurst(t0 + 0.3, {peak: 0.03, dur: 0.5, cutoff: 400, sweepTo: 150, type: 'bandpass', q: 2, pan})
  }
  // new-world one-shots
  function birdCall() {
    const t0 = ctx().currentTime
    const pan = U.rand(-0.8, 0.8)
    const f = U.pick([1500, 1900, 2300])
    voice({type: 'sine', freq: f, glideTo: f * 1.7, t0, a: 0.004, hold: 0.06, r: 0.25, peak: 0.03, pan})
    voice({type: 'sine', freq: f * 1.3, glideTo: f * 0.9, t0: t0 + 0.12, a: 0.004, hold: 0.05, r: 0.2, peak: 0.022, pan})
  }
  function insectBuzz() {
    const t0 = ctx().currentTime
    const pan = U.rand(-0.6, 0.6)
    voice({type: 'square', freq: U.rand(180, 260), t0, a: 0.02, hold: 0.1, r: 0.12, peak: 0.014, pan})
    noiseBurst(t0, {peak: 0.012, dur: 0.2, cutoff: 1500, type: 'bandpass', q: 3, pan})
  }
  function monkeyWhoop() {
    const t0 = ctx().currentTime
    const pan = U.rand(-0.8, 0.8)
    voice({type: 'sawtooth', freq: 300, glideTo: 620, t0, a: 0.03, hold: 0.1, r: 0.25, peak: 0.035, pan})
    voice({type: 'sawtooth', freq: 620, glideTo: 380, t0: t0 + 0.18, a: 0.03, hold: 0.12, r: 0.3, peak: 0.03, pan})
  }
  function waveSplash() {
    const t0 = ctx().currentTime
    const pan = U.rand(-0.7, 0.7)
    noiseBurst(t0, {peak: 0.05, dur: 0.45, cutoff: 900, sweepTo: 220, type: 'bandpass', q: 1, pan})
    noiseBurst(t0 + 0.05, {peak: 0.025, dur: 0.3, cutoff: 3400, type: 'highpass', pan})
  }
  function seabird() {
    const t0 = ctx().currentTime
    const pan = U.rand(-0.8, 0.8)
    voice({type: 'sine', freq: 700, glideTo: 980, t0, a: 0.02, hold: 0.05, r: 0.3, peak: 0.02, pan})
    voice({type: 'sine', freq: 980, glideTo: 720, t0: t0 + 0.15, a: 0.02, hold: 0.05, r: 0.3, peak: 0.016, pan})
  }
  function bubble() {
    const t0 = ctx().currentTime
    const pan = U.rand(-0.7, 0.7)
    voice({type: 'sine', freq: U.rand(500, 900), glideTo: 220, t0, a: 0.004, hold: 0.01, r: 0.12, peak: 0.03, pan})
    noiseBurst(t0, {peak: 0.015, dur: 0.08, cutoff: 2200, type: 'bandpass', q: 2, pan})
  }
  function glitchBlip() {
    const t0 = ctx().currentTime
    const pan = U.rand(-0.8, 0.8)
    voice({type: 'square', freq: U.pick([660, 880, 1100]), glideTo: 330, t0, a: 0.002, hold: 0.02, r: 0.06, peak: 0.022, pan})
  }
  function zzzap() {
    const t0 = ctx().currentTime
    const pan = U.rand(-0.8, 0.8)
    noiseBurst(t0, {peak: 0.04, dur: 0.07, cutoff: 5200, type: 'highpass', pan})
    voice({type: 'sawtooth', freq: 1200, glideTo: 300, t0, a: 0.002, hold: 0.03, r: 0.12, peak: 0.02, pan})
  }
  function cavernDrip() {
    const t0 = ctx().currentTime
    const pan = U.rand(-0.8, 0.8)
    voice({type: 'sine', freq: U.rand(600, 1200), glideTo: 240, t0, a: 0.004, hold: 0.01, r: 0.22, peak: 0.045, pan})
    noiseBurst(t0 + 0.03, {peak: 0.022, dur: 0.14, cutoff: 1800, type: 'bandpass', q: 2, pan})
  }
  function rockDrop() {
    const t0 = ctx().currentTime
    const pan = U.rand(-0.7, 0.7)
    noiseBurst(t0, {peak: 0.05, dur: 0.4, cutoff: 400, sweepTo: 90, type: 'lowpass', pan})
    voice({type: 'sine', freq: 90, glideTo: 40, t0, a: 0.005, hold: 0.12, r: 0.4, peak: 0.05, pan})
  }
  function echoBlip() {
    const t0 = ctx().currentTime
    const pan = U.rand(-0.8, 0.8)
    voice({type: 'triangle', freq: U.pick([784, 988, 1175]), t0, a: 0.002, hold: 0.08, r: 1.1, peak: 0.02, pan})
  }

  // =============================================================================
  // MOTION BED — the constant "you are running forward" sound
  // =============================================================================
  function startMotion() {
    ensureBuses()
    if (motion) return
    const c = ctx()
    const s = noiseSource()
    const f = c.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 360
    f.Q.value = 0.8
    const g = c.createGain()
    g.gain.value = 0.0001
    const p = c.createStereoPanner()
    p.pan.value = 0
    const lfo = c.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 2.2
    const lg = c.createGain()
    lg.gain.value = 140
    lfo.connect(lg).connect(f.frequency)
    s.connect(f).connect(g).connect(p).connect(fxBus)
    s.start(); lfo.start()
    motion = {s, f, g, p, lfo, lg}
  }
  function frameMotion(delta, state) {
    if (!motion) return
    const c = ctx(), t = c.currentTime
    const sp = Math.min(1, Math.max(0, (state.speed || 0) / C.MAX_SPEED))
    const boost = state.boostT > 0 ? 1.3 : state.overdriveT > 0 ? 1.22 : state.brakeT > 0 ? 0.72 : 1
    motion.f.frequency.setTargetAtTime(300 + sp * 900, t, 0.2)
    motion.g.gain.setTargetAtTime(0.02 + sp * 0.075 * boost, t, 0.2)
    motion.p.pan.setTargetAtTime(panOf(state.x || 0) * 0.5, t, 0.3)
    motion.lfo.frequency.setTargetAtTime(2.2 + sp * 7, t, 0.2)
    // footsteps pulse: soft thuds at a rate that climbs with speed
    if (sp > 0.08 && !state.airborne) {
      stepAcc += delta * (0.55 + sp * 2.2) * boost
      if (stepAcc >= 1) {
        stepAcc = 0
        const t0 = t
        voice({type: 'sine', freq: 90, glideTo: 50, t0, a: 0.003, hold: 0.01, r: 0.06, peak: 0.05 + sp * 0.03, pan: panOf(state.x) * 0.5})
      }
    }
  }
  function stopMotion() {
    if (!motion) return
    const m = motion
    motion = null
    const t0 = ctx().currentTime
    try {
      m.g.gain.cancelScheduledValues(t0)
      m.g.gain.setValueAtTime(m.g.gain.value, t0)
      m.g.gain.linearRampToValueAtTime(0.0001, t0 + 0.2)
    } catch (e) {}
    const id = setTimeout(() => {
      try { m.s.stop(); m.lfo.stop(); m.g.disconnect(); m.p.disconnect() } catch (e) {}
    }, 260)
    pending.push(id)
  }

  // =============================================================================
  // THREAT CUES — the "what's ahead of you" language
  // =============================================================================
  // New-world hazards get their voice from a layered template; the classic
  // hazards keep their hand-tuned recipes.
  const THREATS = {
    root:       [{wave: 'square', f: 200, g: 140, hold: 0.03, r: 0.08, peak: 0.12}, {noise: true, cutoff: 1800, dur: 0.05, peak: 0.08}],
    spear:      [{wave: 'square', f: 180, g: 540, hold: 0.03, r: 0.1, peak: 0.1}],
    quicksand:  [{noise: true, cutoff: 500, sweepTo: 120, dur: 0.5, peak: 0.1, q: 2}, {wave: 'sine', f: 140, g: 70, hold: 0.2, r: 0.4, peak: 0.1}],
    vine:       [{noise: true, cutoff: 3200, sweepTo: 600, dur: 0.25, peak: 0.12, q: 1}],
    rip:        [{noise: true, cutoff: 900, sweepTo: 200, dur: 0.5, peak: 0.14, q: 1}, {wave: 'sine', f: 90, g: 50, hold: 0.15, r: 0.4, peak: 0.12}],
    current:    [{noise: true, cutoff: 700, sweepTo: 2500, dur: 0.35, peak: 0.1, q: 1}],
    tide:       [{wave: 'sine', f: 70, g: 40, hold: 0.3, r: 0.7, peak: 0.18}, {noise: true, cutoff: 300, dur: 0.7, peak: 0.08, type: 'lowpass'}],
    reef:       [{wave: 'square', f: 150, g: 100, hold: 0.05, r: 0.12, peak: 0.14}, {noise: true, cutoff: 1200, dur: 0.06, peak: 0.1}],
    glitch:     [{wave: 'sawtooth', f: 400, g: 900, hold: 0.03, r: 0.06, peak: 0.1}, {wave: 'square', f: 900, g: 200, d: 0.04, hold: 0.02, r: 0.05, peak: 0.09}],
    turret:     [{wave: 'square', f: 320, g: 180, hold: 0.04, r: 0.1, peak: 0.12}, {noise: true, cutoff: 2400, dur: 0.08, peak: 0.1, type: 'highpass'}],
    datawall:   [{noise: true, cutoff: 4200, dur: 0.3, peak: 0.12, type: 'highpass'}, {wave: 'sawtooth', f: 700, g: 120, hold: 0.05, r: 0.25, peak: 0.1}],
    rockfall:   [{noise: true, cutoff: 500, sweepTo: 100, dur: 0.7, peak: 0.16, type: 'lowpass'}, {wave: 'sawtooth', f: 90, g: 40, hold: 0.2, r: 0.5, peak: 0.14}],
    stalagmite: [{wave: 'sine', f: 120, g: 70, hold: 0.05, r: 0.15, peak: 0.16}, {noise: true, cutoff: 800, dur: 0.08, peak: 0.1}],
    cavein:     [{noise: true, cutoff: 400, sweepTo: 60, dur: 1, peak: 0.2, type: 'lowpass'}, {wave: 'sawtooth', f: 110, g: 30, hold: 0.2, r: 0.8, peak: 0.16}],
    magma:      [{noise: true, cutoff: 600, sweepTo: 200, dur: 0.5, peak: 0.14, type: 'lowpass'}, {wave: 'sine', f: 60, g: 90, hold: 0.2, r: 0.5, peak: 0.14}],
  }
  const ENEMY_CUES = {
    monkey: [{wave: 'square', f: 700, g: 900, hold: 0.02, r: 0.05, peak: 0.09}, {wave: 'square', f: 900, g: 1200, d: 0.07, hold: 0.02, r: 0.05, peak: 0.08}],
    viper:  [{noise: true, cutoff: 5000, sweepTo: 800, dur: 0.3, peak: 0.1, type: 'highpass', q: 2}],
    crab:   [{wave: 'square', f: 900, hold: 0.02, r: 0.04, peak: 0.08}, {wave: 'square', f: 700, d: 0.05, hold: 0.02, r: 0.04, peak: 0.07}],
    octo:   [{wave: 'sine', f: 120, g: 200, hold: 0.2, r: 0.4, peak: 0.12}, {noise: true, cutoff: 400, dur: 0.4, peak: 0.06, type: 'lowpass'}],
    bot:    [{wave: 'sawtooth', f: 240, hold: 0.08, r: 0.15, peak: 0.09}, {wave: 'square', f: 480, d: 0.03, hold: 0.06, r: 0.12, peak: 0.06}],
    viroid: [{wave: 'square', f: 800, g: 400, hold: 0.02, r: 0.05, peak: 0.09}, {wave: 'square', f: 1200, d: 0.05, g: 600, hold: 0.02, r: 0.05, peak: 0.08}],
    bat:    [{wave: 'triangle', f: 600, g: 1800, hold: 0.04, r: 0.15, peak: 0.08}],
    troll:  [{wave: 'sawtooth', f: 70, g: 45, hold: 0.25, r: 0.5, peak: 0.16}, {noise: true, cutoff: 250, dur: 0.5, peak: 0.08, type: 'lowpass'}],
  }

  function threat(data) {
    const {kind, dx, dist, span} = data
    cueAt(dx, dist, span, (p, v) => threatAt(kind, p, v, dist))
  }
  function threatAt(kind, p, v, dist) {
    const t0 = ctx().currentTime
    const vv = v
    if (THREATS[kind]) { strike(THREATS[kind], p, vv, t0); return }
    switch (kind) {
      case 'pit': case 'lava': {
        const f = kind === 'lava' ? 220 : 140
        voice({type: 'sine', freq: f, glideTo: f * 0.6, t0, a: 0.02, hold: 0.1, r: 0.25, peak: 0.16 * vv, pan: p})
        noiseBurst(t0, {peak: 0.07 * vv, dur: 0.3, cutoff: 900, sweepTo: 300, type: 'lowpass', pan: p})
        break
      }
      case 'fire': {
        noiseBurst(t0, {peak: 0.08 * vv, dur: 0.1, cutoff: 2400, type: 'highpass', pan: p})
        noiseBurst(t0, {peak: 0.05 * vv, dur: 0.3, cutoff: 500, type: 'lowpass', pan: p})
        break
      }
      case 'spikes': {
        voice({type: 'square', freq: 620, t0, a: 0.002, hold: 0.02, r: 0.09, peak: 0.07 * vv, pan: p})
        noiseBurst(t0, {peak: 0.06 * vv, dur: 0.06, cutoff: 4200, type: 'highpass', pan: p})
        break
      }
      case 'ledge': case 'drop': {
        voice({type: 'sine', freq: 90, t0, a: 0.01, hold: 0.04, r: 0.12, peak: 0.15 * vv, pan: p})
        break
      }
      case 'car': {
        voice({type: 'sawtooth', freq: 150, glideTo: 110, t0, a: 0.02, hold: 0.08, r: 0.12, peak: 0.06 * vv, pan: p})
        break
      }
      case 'manhole': {
        voice({type: 'square', freq: 300, t0, a: 0.002, hold: 0.03, r: 0.12, peak: 0.12 * vv, pan: p})
        noiseBurst(t0, {peak: 0.05 * vv, dur: 0.2, cutoff: 800, sweepTo: 200, type: 'bandpass', q: 2, pan: p})
        break
      }
      case 'fence': {
        voice({type: 'sawtooth', freq: 950, t0, a: 0.001, hold: 0.04, r: 0.05, peak: 0.05 * vv, pan: p})
        noiseBurst(t0, {peak: 0.07 * vv, dur: 0.12, cutoff: 5200, type: 'highpass', pan: p})
        break
      }
      case 'teleporter': {
        voice({type: 'sine', freq: 240, glideTo: 720, t0, a: 0.02, hold: 0.05, r: 0.2, peak: 0.1 * vv, pan: p})
        break
      }
      case 'heli': {
        rotorChop(p, 0.12 * vv)
        break
      }
      default: {
        if (kind.startsWith('enemy:')) enemyCue(kind.slice(6), p, vv)
        else {
          voice({type: 'triangle', freq: 440, t0, a: 0.003, hold: 0.04, r: 0.12, peak: 0.08 * vv, pan: p})
        }
      }
    }
  }
  function enemyCue(kind, p, v) {
    const t0 = ctx().currentTime
    if (ENEMY_CUES[kind]) { strike(ENEMY_CUES[kind], p, v, t0); return }
    switch (kind) {
      case 'thug': voice({type: 'sawtooth', freq: 110, glideTo: 90, t0, a: 0.01, hold: 0.1, r: 0.16, peak: 0.14 * v, pan: p}); break
      case 'imp': voice({type: 'square', freq: 500, glideTo: 780, t0, a: 0.005, hold: 0.03, r: 0.08, peak: 0.09 * v, pan: p}); break
      case 'drone': voice({type: 'sine', freq: 880, t0, a: 0.01, hold: 0.12, r: 0.2, peak: 0.08 * v, pan: p}); break
      case 'shielded': voice({type: 'triangle', freq: 260, t0, a: 0.01, hold: 0.12, r: 0.18, peak: 0.1 * v, pan: p}); voice({type: 'triangle', freq: 520, t0, a: 0.01, hold: 0.12, r: 0.2, peak: 0.05 * v, pan: p}); break
      case 'tank': voice({type: 'sawtooth', freq: 60, t0, a: 0.01, hold: 0.2, r: 0.3, peak: 0.16 * v, pan: p}); noiseBurst(t0, {peak: 0.05 * v, dur: 0.2, cutoff: 200, type: 'lowpass', pan: p}); break
      case 'rat': voice({type: 'square', freq: 1100, glideTo: 1500, t0, a: 0.004, hold: 0.02, r: 0.06, peak: 0.08 * v, pan: p}); break
    }
  }
  function threatSwitch(data) {
    const t0 = ctx().currentTime
    voice({type: 'triangle', freq: 660, t0, a: 0.003, hold: 0.02, r: 0.07, peak: 0.07, pan: panOf(data.dx || 0)})
  }
  function rotorChop(pan, gain) {
    const t0 = ctx().currentTime
    noiseBurst(t0, {peak: gain || 0.12, dur: 0.1, cutoff: 1400, sweepTo: 400, type: 'bandpass', q: 3, pan})
  }
  function startRotor() {
    ensureBuses()
    if (rotor) return
    const c = ctx()
    const o = c.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = 40
    const g = c.createGain()
    g.gain.value = 0.0001
    const p = c.createStereoPanner()
    p.pan.value = 0
    // amplitude modulation = the chop
    const am = c.createOscillator()
    am.type = 'square'
    am.frequency.value = 24
    const amG = c.createGain()
    amG.gain.value = 0.09
    o.connect(g).connect(p).connect(fxBus)
    am.connect(amG).connect(g.gain)
    o.start(); am.start()
    g.gain.setTargetAtTime(0.09, c.currentTime, 0.3)
    rotor = {o, am, g, p, amG}
  }
  function frameRotor() {
    if (!rotor) return
    rotor.g.gain.setTargetAtTime(0.09, ctx().currentTime, 0.2)
  }
  function stopRotor() {
    if (!rotor) return
    const r = rotor
    rotor = null
    const t0 = ctx().currentTime
    try { r.g.gain.setTargetAtTime(0.0001, t0, 0.2) } catch (e) {}
    const id = setTimeout(() => { try { r.o.stop(); r.am.stop(); r.g.disconnect(); r.p.disconnect() } catch (e) {} }, 700)
    pending.push(id)
  }

  // =============================================================================
  // PICKUPS
  // =============================================================================
  function pickup(data) {
    const {kind, dx, dist} = data
    const p = panOf(dx)
    const v = 0.3 + 0.7 * prox(dist, C.PICKUP_SPAN)
    const t0 = ctx().currentTime
    switch (kind) {
      case 'coin': voice({type: 'triangle', freq: 1046, t0, a: 0.002, hold: 0.03, r: 0.2, peak: 0.04 + v * 0.04, pan: p}); break
      case 'gem': voice({type: 'sine', freq: 1568, t0, a: 0.002, hold: 0.08, r: 0.35, peak: 0.035 + v * 0.035, pan: p}); break
      case 'core': [2093, 2637, 3136].forEach((f, i) => voice({type: 'triangle', freq: f, t0: t0 + i * 0.05, a: 0.003, hold: 0.1, r: 0.5, peak: 0.03 + v * 0.03, pan: p})); break
      case 'ammo': noiseBurst(t0, {peak: 0.05 + v * 0.05, dur: 0.05, cutoff: 1800, type: 'bandpass', q: 3, pan: p}); break
      case 'medkit': voice({type: 'triangle', freq: 660, glideTo: 990, t0, a: 0.01, hold: 0.08, r: 0.3, peak: 0.05 + v * 0.05, pan: p}); break
      case 'emp': noiseBurst(t0, {peak: 0.06 + v * 0.05, dur: 0.08, cutoff: 3400, type: 'highpass', pan: p}); break
      case 'shield': voice({type: 'sine', freq: 1318, glideTo: 1760, t0, a: 0.004, hold: 0.05, r: 0.25, peak: 0.05 + v * 0.04, pan: p}); break
      case 'boost': voice({type: 'square', freq: 523, glideTo: 1046, t0, a: 0.01, hold: 0.05, r: 0.2, peak: 0.04 + v * 0.04, pan: p}); break
      case 'overdrive': voice({type: 'sine', freq: 880, glideTo: 1760, t0, a: 0.004, hold: 0.06, r: 0.25, peak: 0.04 + v * 0.04, pan: p}); break
      case 'brake': voice({type: 'sine', freq: 660, glideTo: 392, t0, a: 0.005, hold: 0.06, r: 0.28, peak: 0.04 + v * 0.04, pan: p}); break
    }
  }
  function collect(data) {
    const {kind, amount, points, dx} = data
    const p = panOf(dx || 0)
    const t0 = ctx().currentTime
    switch (kind) {
      case 'coin': {
        voice({type: 'square', freq: 988, t0, a: 0.003, hold: 0.03, r: 0.08, peak: 0.12, pan: p})
        voice({type: 'square', freq: 1319, t0: t0 + 0.05, a: 0.003, hold: 0.04, r: 0.12, peak: 0.1, pan: p})
        break
      }
      case 'gem': {
        [1568, 2093, 2637].forEach((f, i) => voice({type: 'sine', freq: f, t0: t0 + i * 0.05, a: 0.004, hold: 0.12, r: 0.4, peak: 0.11, pan: p}))
        break
      }
      case 'core': {
        [1046, 1318, 1568, 2093].forEach((f, i) => voice({type: 'triangle', freq: f, t0: t0 + i * 0.07, a: 0.005, hold: 0.2, r: 0.6, peak: 0.12, pan: p}))
        noiseBurst(t0, {peak: 0.08, dur: 0.4, cutoff: 5200, type: 'highpass', pan: p})
        break
      }
      case 'ammo': {
        noiseBurst(t0, {peak: 0.14, dur: 0.06, cutoff: 2200, type: 'bandpass', q: 3, pan: p})
        voice({type: 'square', freq: 440, t0, a: 0.003, hold: 0.03, r: 0.08, peak: 0.08, pan: p})
        break
      }
      case 'medkit': {
        [392, 494, 587].forEach((f, i) => voice({type: 'triangle', freq: f, t0: t0 + i * 0.06, a: 0.008, hold: 0.15, r: 0.4, peak: 0.11, pan: p}))
        break
      }
      case 'emp': {
        noiseBurst(t0, {peak: 0.12, dur: 0.1, cutoff: 3800, type: 'highpass', pan: p})
        voice({type: 'sawtooth', freq: 900, glideTo: 200, t0, a: 0.002, hold: 0.03, r: 0.15, peak: 0.09, pan: p})
        break
      }
      case 'shield': {
        voice({type: 'sine', freq: 1318, t0, a: 0.004, hold: 0.08, r: 0.2, peak: 0.1, pan: p})
        voice({type: 'sine', freq: 1760, t0: t0 + 0.08, a: 0.004, hold: 0.1, r: 0.3, peak: 0.08, pan: p})
        break
      }
      case 'boost': {
        voice({type: 'square', freq: 440, glideTo: 880, t0, a: 0.005, hold: 0.05, r: 0.25, peak: 0.1, pan: p})
        noiseBurst(t0, {peak: 0.08, dur: 0.3, cutoff: 900, sweepTo: 3200, type: 'bandpass', q: 1, pan: p})
        break
      }
      case 'overdrive': {
        strike([{wave: 'sine', f: 880, g: 1760, hold: 0.06, r: 0.25, peak: 0.12}, {wave: 'triangle', f: 1320, d: 0.06, g: 2200, hold: 0.05, r: 0.3, peak: 0.08}], p, 1, t0)
        noiseBurst(t0, {peak: 0.08, dur: 0.35, cutoff: 1000, sweepTo: 4800, type: 'bandpass', q: 1, pan: p})
        break
      }
      case 'brake': {
        strike([{wave: 'sine', f: 660, g: 330, hold: 0.1, r: 0.35, peak: 0.12}, {wave: 'square', f: 330, d: 0.08, g: 165, hold: 0.08, r: 0.3, peak: 0.08}], p, 1, t0)
        noiseBurst(t0, {peak: 0.07, dur: 0.4, cutoff: 2400, sweepTo: 300, type: 'lowpass', pan: p})
        break
      }
    }
  }
  function pickupItem(data) {
    const t0 = ctx().currentTime
    const p = panOf(data.dx || 0)
    if (data.item === 'emp') {
      noiseBurst(t0, {peak: 0.12, dur: 0.1, cutoff: 3800, type: 'highpass', pan: p})
      voice({type: 'sawtooth', freq: 900, glideTo: 300, t0, a: 0.002, hold: 0.03, r: 0.15, peak: 0.1, pan: p})
    }
  }

  // =============================================================================
  // WEAPONS
  // =============================================================================
  const SHOOTS = {
    dart:    [{noise: true, cutoff: 2600, dur: 0.05, peak: 0.14, type: 'highpass'}, {wave: 'sine', f: 700, g: 1400, hold: 0.02, r: 0.12, peak: 0.1}],
    harpoon: [{wave: 'sine', f: 120, g: 60, hold: 0.12, r: 0.3, peak: 0.22}, {noise: true, cutoff: 1400, dur: 0.14, peak: 0.14, type: 'bandpass', q: 1}],
    plasma:  [{wave: 'sawtooth', f: 300, g: 1500, hold: 0.04, r: 0.2, peak: 0.14}, {noise: true, cutoff: 3800, dur: 0.08, peak: 0.1, type: 'highpass'}],
    shard:   [{wave: 'triangle', f: 900, g: 1800, hold: 0.03, r: 0.2, peak: 0.12}, {wave: 'triangle', f: 1350, d: 0.04, g: 2400, hold: 0.03, r: 0.2, peak: 0.08}],
  }
  function shoot(data) {
    const t0 = ctx().currentTime
    const p = panOf(data.dx || 0)
    if (SHOOTS[data.weapon]) { strike(SHOOTS[data.weapon], p, 1, t0); return }
    switch (data.weapon) {
      case 'pistol': {
        noiseBurst(t0, {peak: 0.16, dur: 0.07, cutoff: 2400, type: 'highpass', pan: p})
        voice({type: 'square', freq: 240, glideTo: 90, t0, a: 0.001, hold: 0.02, r: 0.09, peak: 0.16, pan: p})
        break
      }
      case 'rifle': {
        noiseBurst(t0, {peak: 0.14, dur: 0.06, cutoff: 3200, type: 'bandpass', q: 2, pan: p})
        voice({type: 'square', freq: 300, glideTo: 120, t0, a: 0.001, hold: 0.02, r: 0.07, peak: 0.15, pan: p})
        break
      }
      case 'shotgun': {
        noiseBurst(t0, {peak: 0.3, dur: 0.16, cutoff: 1400, type: 'lowpass', pan: p})
        noiseBurst(t0, {peak: 0.16, dur: 0.1, cutoff: 4200, type: 'highpass', pan: p})
        voice({type: 'sine', freq: 130, glideTo: 50, t0, a: 0.001, hold: 0.08, r: 0.3, peak: 0.3, pan: p})
        break
      }
      case 'laser': {
        // handled by the beam loop; the shot tick adds a tiny zap
        noiseBurst(t0, {peak: 0.05, dur: 0.03, cutoff: 5200, type: 'highpass', pan: p})
        break
      }
      case 'bow': {
        const power = data.power || 0
        voice({type: 'sine', freq: 500 + power * 700, glideTo: 1400 + power * 900, t0, a: 0.01, hold: 0.05, r: 0.3, peak: 0.1 + power * 0.08, pan: p})
        noiseBurst(t0, {peak: 0.06 + power * 0.08, dur: 0.25, cutoff: 1800, sweepTo: 4200, type: 'bandpass', q: 1, pan: p})
        break
      }
      case 'rocket': {
        noiseBurst(t0, {peak: 0.24, dur: 0.6, cutoff: 600, sweepTo: 3200, type: 'bandpass', q: 1, pan: p})
        voice({type: 'sawtooth', freq: 120, glideTo: 420, t0, a: 0.01, hold: 0.2, r: 0.4, peak: 0.12, pan: p})
        break
      }
    }
  }
  function startBeam() {
    ensureBuses()
    if (beam) return
    const c = ctx()
    const o = c.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = 60
    const g = c.createGain()
    g.gain.value = 0.0001
    const p = c.createStereoPanner()
    p.pan.value = 0
    o.connect(g).connect(p).connect(fxBus)
    o.start()
    beam = {o, g, p}
  }
  function frameBeam(power, p) {
    if (!beam) return
    const c = ctx(), t = c.currentTime
    beam.o.frequency.setTargetAtTime(80 + power * 420, t, 0.03)
    beam.g.gain.setTargetAtTime(0.06 + power * 0.08, t, 0.03)
    beam.p.pan.setTargetAtTime(p, t, 0.05)
  }
  function stopBeam() {
    if (!beam) return
    const b = beam
    beam = null
    const t0 = ctx().currentTime
    try { b.g.gain.setTargetAtTime(0.0001, t0, 0.04) } catch (e) {}
    const id = setTimeout(() => { try { b.o.stop(); b.g.disconnect(); b.p.disconnect() } catch (e) {} }, 120)
    pending.push(id)
  }
  function charge(data) {
    const t0 = ctx().currentTime
    const p = panOf(data.dx || 0)
    if (data.weapon === 'bow') {
      if (!stretch) {
        const c = ctx()
        const s = noiseSource()
        const f = c.createBiquadFilter()
        f.type = 'bandpass'
        f.frequency.value = 500
        f.Q.value = 2
        const g = c.createGain()
        g.gain.value = 0.0001
        s.connect(f).connect(g).connect(fxBus)
        s.start()
        stretch = {s, f, g}
      }
      stretch.f.frequency.setTargetAtTime(400 + data.power * 900, t0, 0.05)
      stretch.g.gain.setTargetAtTime(0.03 + data.power * 0.09, t0, 0.05)
    } else if (data.weapon === 'laser') {
      if (data.power >= 1) startBeam()
      frameBeam(data.power, p)
    }
  }
  function releaseBow() {
    if (!stretch) return
    const st = stretch
    stretch = null
    const t0 = ctx().currentTime
    try { st.g.gain.setTargetAtTime(0.0001, t0, 0.06) } catch (e) {}
    const id = setTimeout(() => { try { st.s.stop(); st.g.disconnect(); st.f.disconnect() } catch (e) {} }, 200)
    pending.push(id)
  }
  function empty() {
    const t0 = ctx().currentTime
    voice({type: 'square', freq: 320, t0, a: 0.002, hold: 0.02, r: 0.05, peak: 0.08})
  }
  function reloadStart(data) {
    const t0 = ctx().currentTime
    noiseBurst(t0, {peak: 0.12, dur: 0.05, cutoff: 1500, type: 'bandpass', q: 3})
    voice({type: 'square', freq: 180, t0, a: 0.003, hold: 0.02, r: 0.06, peak: 0.12})
  }
  function reloadShell(data) {
    const t0 = ctx().currentTime
    voice({type: 'square', freq: 500 + (data.shells || 0) * 40, t0, a: 0.002, hold: 0.02, r: 0.06, peak: 0.12})
    noiseBurst(t0, {peak: 0.08, dur: 0.04, cutoff: 2600, type: 'bandpass', q: 3})
  }
  function reloadEnd(data) {
    const t0 = ctx().currentTime
    if (data.weapon === 'shotgun') {
      voice({type: 'square', freq: 700, t0, a: 0.003, hold: 0.03, r: 0.08, peak: 0.1})
    } else {
      voice({type: 'square', freq: 900, t0, a: 0.003, hold: 0.02, r: 0.06, peak: 0.09})
      noiseBurst(t0, {peak: 0.06, dur: 0.05, cutoff: 3200, type: 'highpass'})
    }
  }
  function weaponSwitch(data) {
    const t0 = ctx().currentTime
    const f = C.weaponById(data.weapon).slot * 60 + 440
    voice({type: 'square', freq: f, t0, a: 0.004, hold: 0.03, r: 0.09, peak: 0.11})
    voice({type: 'triangle', freq: f * 2, t0: t0 + 0.03, a: 0.004, hold: 0.03, r: 0.12, peak: 0.06})
  }
  function locked() {
    const t0 = ctx().currentTime
    voice({type: 'sawtooth', freq: 160, t0, a: 0.004, hold: 0.06, r: 0.1, peak: 0.14})
    voice({type: 'sawtooth', freq: 100, t0: t0 + 0.07, a: 0.004, hold: 0.06, r: 0.12, peak: 0.12})
  }

  // =============================================================================
  // JUMP / MOVEMENT EVENTS
  // =============================================================================
  function jump() {
    const t0 = ctx().currentTime
    voice({type: 'sine', freq: 300, glideTo: 700, t0, a: 0.01, hold: 0.06, r: 0.2, peak: 0.13})
    noiseBurst(t0, {peak: 0.08, dur: 0.16, cutoff: 900, sweepTo: 2600, type: 'bandpass', q: 1})
  }
  function land() {
    const t0 = ctx().currentTime
    voice({type: 'sine', freq: 120, glideTo: 50, t0, a: 0.004, hold: 0.03, r: 0.1, peak: 0.2})
    noiseBurst(t0, {peak: 0.1, dur: 0.08, cutoff: 400, type: 'lowpass'})
  }
  function blocked() {
    const t0 = ctx().currentTime
    voice({type: 'square', freq: 200, t0, a: 0.004, hold: 0.05, r: 0.1, peak: 0.14})
    voice({type: 'square', freq: 150, t0: t0 + 0.08, a: 0.004, hold: 0.06, r: 0.12, peak: 0.12})
  }

  // =============================================================================
  // COMBAT / DAMAGE
  // =============================================================================
  function kill(data) {
    const t0 = ctx().currentTime
    const p = panOf(data.dx || 0)
    const v = 0.4 + 0.6 * prox(data.dist, C.THREAT_SPAN)
    duckAmbience(0.25, 0.5)
    if (data.kind === 'car' || data.kind === 'turret' || data.kind === 'rockfall') {
      noiseBurst(t0, {peak: 0.3 * v, dur: 0.5, cutoff: 2000, sweepTo: 150, type: 'lowpass', pan: p})
      noiseBurst(t0, {peak: 0.16 * v, dur: 0.3, cutoff: 3800, type: 'bandpass', q: 1, pan: p})
      voice({type: 'sine', freq: 90, glideTo: 30, t0, a: 0.005, hold: 0.1, r: 0.4, peak: 0.3 * v, pan: p})
    } else if (data.kind === 'tank' || data.kind === 'drone' || data.kind === 'troll' || data.kind === 'octo') {
      noiseBurst(t0, {peak: 0.24 * v, dur: 0.6, cutoff: 300, sweepTo: 60, type: 'lowpass', pan: p})
      noiseBurst(t0, {peak: 0.14 * v, dur: 0.3, cutoff: 2600, type: 'bandpass', q: 1, pan: p})
      voice({type: 'sawtooth', freq: 160, glideTo: 40, t0, a: 0.005, hold: 0.08, r: 0.4, peak: 0.2 * v, pan: p})
    } else {
      voice({type: 'sawtooth', freq: 220, glideTo: 60, t0, a: 0.004, hold: 0.05, r: 0.18, peak: 0.2 * v, pan: p})
      noiseBurst(t0, {peak: 0.12 * v, dur: 0.12, cutoff: 1400, type: 'bandpass', q: 2, pan: p})
    }
  }
  function hit(data) {
    const t0 = ctx().currentTime
    const p = panOf(data.dx || 0)
    duckAmbience(0.3, 0.6)
    voice({type: 'sawtooth', freq: 220, glideTo: 70, t0, a: 0.004, hold: 0.05, r: 0.2, peak: 0.28})
    noiseBurst(t0, {peak: 0.2, dur: 0.15, cutoff: 1200, type: 'lowpass', pan: p})
    if (data.hp <= 0) {
      voice({type: 'sine', freq: 140, glideTo: 34, t0: t0 + 0.1, a: 0.005, hold: 0.05, r: 0.5, peak: 0.3})
    }
  }
  function hitBlocked() {
    const t0 = ctx().currentTime
    voice({type: 'sine', freq: 1568, t0, a: 0.002, hold: 0.08, r: 0.2, peak: 0.14})
    voice({type: 'sine', freq: 2093, t0: t0 + 0.03, a: 0.002, hold: 0.1, r: 0.3, peak: 0.09})
  }
  function lifeline() {
    const t0 = ctx().currentTime
    [659, 784, 988, 1319].forEach((f, i) => voice({type: 'triangle', freq: f, t0: t0 + i * 0.06, a: 0.008, hold: 0.14, r: 0.3, peak: 0.13}))
  }
  function gravity(data) {
    const t0 = ctx().currentTime
    if (data.mult < 1) {
      voice({type: 'sine', freq: 500, glideTo: 180, t0, a: 0.02, hold: 0.1, r: 0.5, peak: 0.12})
    } else {
      voice({type: 'sine', freq: 90, glideTo: 200, t0, a: 0.01, hold: 0.1, r: 0.4, peak: 0.16})
    }
  }

  // =============================================================================
  // ITEMS & POWER-UPS
  // =============================================================================
  function itemUsed(data) {
    const t0 = ctx().currentTime
    switch (data.item) {
      case 'medkit': [392, 494, 587].forEach((f, i) => voice({type: 'triangle', freq: f, t0: t0 + i * 0.06, a: 0.01, hold: 0.2, r: 0.5, peak: 0.12})); break
      case 'emp': noiseBurst(t0, {peak: 0.14, dur: 0.2, cutoff: 4200, type: 'highpass'}); voice({type: 'sawtooth', freq: 1000, glideTo: 150, t0, a: 0.002, hold: 0.05, r: 0.25, peak: 0.12}); break
      case 'shield': voice({type: 'sine', freq: 1318, glideTo: 1760, t0, a: 0.004, hold: 0.1, r: 0.3, peak: 0.12}); break
      case 'boost': voice({type: 'square', freq: 330, glideTo: 1046, t0, a: 0.01, hold: 0.15, r: 0.4, peak: 0.12}); noiseBurst(t0, {peak: 0.1, dur: 0.5, cutoff: 700, sweepTo: 3600, type: 'bandpass', q: 1}); break
      case 'overdrive': voice({type: 'sine', freq: 660, glideTo: 1568, t0, a: 0.008, hold: 0.2, r: 0.5, peak: 0.13}); noiseBurst(t0, {peak: 0.1, dur: 0.5, cutoff: 900, sweepTo: 4800, type: 'bandpass', q: 1}); break
      case 'brake': voice({type: 'sine', freq: 784, glideTo: 196, t0, a: 0.01, hold: 0.15, r: 0.5, peak: 0.13}); noiseBurst(t0, {peak: 0.08, dur: 0.6, cutoff: 3000, sweepTo: 200, type: 'lowpass'}); break
    }
  }
  function itemEmpty() {
    const t0 = ctx().currentTime
    voice({type: 'square', freq: 240, t0, a: 0.003, hold: 0.04, r: 0.1, peak: 0.1})
  }
  function itemSelect() {
    const t0 = ctx().currentTime
    voice({type: 'triangle', freq: 784, t0, a: 0.003, hold: 0.03, r: 0.08, peak: 0.08})
  }
  function itemDesc() {
    const t0 = ctx().currentTime
    voice({type: 'triangle', freq: 880, t0, a: 0.003, hold: 0.03, r: 0.08, peak: 0.08})
  }
  function shieldOn(data) { const t0 = ctx().currentTime; voice({type: 'sine', freq: 1318, glideTo: 2093, t0, a: 0.004, hold: 0.12, r: 0.4, peak: 0.11}) }
  function shieldOff() { const t0 = ctx().currentTime; voice({type: 'sine', freq: 1046, glideTo: 784, t0, a: 0.004, hold: 0.08, r: 0.3, peak: 0.09}) }
  function boostOn() { const t0 = ctx().currentTime; noiseBurst(t0, {peak: 0.14, dur: 0.4, cutoff: 600, sweepTo: 3600, type: 'bandpass', q: 1}); voice({type: 'square', freq: 300, glideTo: 880, t0, a: 0.01, hold: 0.1, r: 0.3, peak: 0.11}) }
  function boostOff() { const t0 = ctx().currentTime; voice({type: 'square', freq: 660, glideTo: 440, t0, a: 0.01, hold: 0.06, r: 0.25, peak: 0.08}) }
  function overdriveOn() { const t0 = ctx().currentTime; voice({type: 'sine', freq: 523, glideTo: 1568, t0, a: 0.01, hold: 0.15, r: 0.4, peak: 0.12}); noiseBurst(t0, {peak: 0.12, dur: 0.5, cutoff: 700, sweepTo: 5200, type: 'bandpass', q: 1}) }
  function overdriveOff() { const t0 = ctx().currentTime; voice({type: 'sine', freq: 1318, glideTo: 784, t0, a: 0.01, hold: 0.08, r: 0.3, peak: 0.09}) }
  function brakeOn() { const t0 = ctx().currentTime; voice({type: 'square', freq: 392, glideTo: 147, t0, a: 0.01, hold: 0.15, r: 0.4, peak: 0.11}); noiseBurst(t0, {peak: 0.09, dur: 0.6, cutoff: 2400, sweepTo: 160, type: 'lowpass'}) }
  function brakeOff() { const t0 = ctx().currentTime; voice({type: 'square', freq: 196, glideTo: 392, t0, a: 0.01, hold: 0.08, r: 0.3, peak: 0.08}) }
  function empUse(data) {
    const t0 = ctx().currentTime
    noiseBurst(t0, {peak: 0.18, dur: 0.25, cutoff: 4400, type: 'highpass'})
    voice({type: 'sawtooth', freq: 1100, glideTo: 200, t0, a: 0.002, hold: 0.06, r: 0.3, peak: 0.14})
    if (data.n) { // the fence sizzles down
      noiseBurst(t0 + 0.1, {peak: 0.12, dur: 0.6, cutoff: 3000, sweepTo: 400, type: 'bandpass', q: 2})
    }
  }
  function fenceEmp() {
    const t0 = ctx().currentTime
    noiseBurst(t0, {peak: 0.12, dur: 0.5, cutoff: 2800, sweepTo: 300, type: 'bandpass', q: 2, pan: panOf(0)})
  }

  // =============================================================================
  // WORLD EVENTS
  // =============================================================================
  const ENV_SEQ = {
    city: [523, 659, 784], desert: [494, 587, 659], volcano: [440, 554, 659],
    tundra: [587, 784, 988], space: [659, 880, 1046], sewer: [392, 494, 587],
    jungle: [523, 587, 784], ocean: [392, 523, 659], neon: [659, 880, 1046], cavern: [311, 349, 392],
  }
  function envEnter(data) {
    const t0 = ctx().currentTime
    const seq = ENV_SEQ[data.env] || [523, 659, 784]
    seq.forEach((f, i) => {
      voice({type: 'triangle', freq: f, t0: t0 + i * 0.07, a: 0.01, hold: 0.12, r: 0.35, peak: 0.1, pan: (i - 1) * 0.22})
    })
    noiseBurst(t0, {peak: 0.08, dur: 0.7, cutoff: 500, sweepTo: 3200, type: 'bandpass', q: 1})
    duckAmbience(0.2, 0.8)
    startAmbience(data.env)
  }
  function modeTitle(data) {
    const t0 = ctx().currentTime
    const base = {practice: 440, sprint: 523, endless: 494, adventure: 587}[data.mode] || 440
    voice({type: 'triangle', freq: base, t0, a: 0.01, hold: 0.2, r: 0.4, peak: 0.14})
    voice({type: 'triangle', freq: base * 1.5, t0: t0 + 0.12, a: 0.01, hold: 0.2, r: 0.4, peak: 0.1})
  }
  function count(data) {
    const t0 = ctx().currentTime
    const n = data.n
    voice({type: 'square', freq: 520 + (3 - n) * 60, t0, a: 0.004, hold: 0.08, r: 0.12, peak: 0.18})
  }
  function go() {
    const t0 = ctx().currentTime
    [523, 659, 784, 1046].forEach((f, i) => voice({type: 'square', freq: f, t0: t0 + i * 0.05, a: 0.004, hold: 0.06, r: 0.18, peak: 0.16}))
    noiseBurst(t0, {peak: 0.14, dur: 0.4, cutoff: 800, sweepTo: 4200, type: 'bandpass', q: 1})
  }
  function teleport() {
    const t0 = ctx().currentTime
    voice({type: 'sine', freq: 220, glideTo: 1400, t0, a: 0.01, hold: 0.1, r: 0.4, peak: 0.16})
    voice({type: 'sine', freq: 440, glideTo: 2800, t0: t0 + 0.02, a: 0.01, hold: 0.08, r: 0.4, peak: 0.1})
    noiseBurst(t0, {peak: 0.16, dur: 0.5, cutoff: 1800, sweepTo: 5200, type: 'bandpass', q: 1})
    duckAmbience(0.3, 0.7)
  }
  function sewerIn() {
    const t0 = ctx().currentTime
    noiseBurst(t0, {peak: 0.24, dur: 0.7, cutoff: 1200, sweepTo: 150, type: 'lowpass'})
    noiseBurst(t0, {peak: 0.1, dur: 0.3, cutoff: 3600, type: 'bandpass', q: 2})
    voice({type: 'sine', freq: 300, glideTo: 80, t0, a: 0.01, hold: 0.2, r: 0.6, peak: 0.2})
    duckAmbience(0.45, 1)
    const id = setTimeout(() => { startAmbience('sewer') }, 250)
    pending.push(id)
  }
  function sewerExit() {
    const t0 = ctx().currentTime
    noiseBurst(t0, {peak: 0.18, dur: 0.5, cutoff: 400, sweepTo: 3600, type: 'bandpass', q: 1})
    voice({type: 'sine', freq: 200, glideTo: 700, t0, a: 0.01, hold: 0.15, r: 0.4, peak: 0.14})
  }
  function levelComplete(data) {
    const t0 = ctx().currentTime
    const seq = [392, 494, 587, 784, 988]
    seq.forEach((f, i) => voice({type: 'square', freq: f, t0: t0 + i * 0.06, a: 0.01, hold: 0.1, r: 0.3, peak: 0.13, pan: (i - 2) * 0.16}))
    duckAmbience(0.4, 1.2)
  }
  function runComplete(data) {
    const t0 = ctx().currentTime
    duckAmbience(0.45, 1.4)
    if (data.victory) {
      const seq = [523, 659, 784, 1046, 1318, 1568]
      seq.forEach((f, i) => voice({type: 'square', freq: f, t0: t0 + i * 0.09, a: 0.01, hold: 0.18, r: 0.4, peak: 0.14, pan: (i - 2.5) * 0.18}))
      noiseBurst(t0 + 0.4, {peak: 0.12, dur: 0.8, cutoff: 5000, type: 'highpass'})
    } else {
      const seq = [523, 659, 784, 1046]
      seq.forEach((f, i) => voice({type: 'square', freq: f, t0: t0 + i * 0.07, a: 0.01, hold: 0.14, r: 0.3, peak: 0.12, pan: (i - 1.5) * 0.2}))
    }
  }

  // =============================================================================
  // THE END
  // =============================================================================
  function doom(data) {
    const t0 = ctx().currentTime
    stopBeam(); releaseBow(); stopRotor()
    duckAmbience(0.5, 1.5)
    switch (data.reason) {
      case 'pit': case 'drop': case 'rip': case 'cavein': {
        noiseBurst(t0, {peak: 0.2, dur: 0.6, cutoff: 2000, sweepTo: 120, type: 'bandpass', q: 1})
        voice({type: 'sine', freq: 500, glideTo: 60, t0, a: 0.01, hold: 0.1, r: 0.8, peak: 0.2})
        break
      }
      case 'lava': case 'magma': {
        noiseBurst(t0, {peak: 0.3, dur: 1, cutoff: 1400, sweepTo: 200, type: 'lowpass'})
        noiseBurst(t0, {peak: 0.14, dur: 0.5, cutoff: 4800, type: 'highpass'})
        voice({type: 'sawtooth', freq: 220, glideTo: 40, t0, a: 0.01, hold: 0.2, r: 1.2, peak: 0.3})
        break
      }
      case 'fence': case 'datawall': {
        noiseBurst(t0, {peak: 0.2, dur: 0.4, cutoff: 4800, type: 'highpass'})
        voice({type: 'sawtooth', freq: 900, glideTo: 60, t0, a: 0.002, hold: 0.1, r: 0.8, peak: 0.24})
        break
      }
      case 'heli': case 'rockfall': {
        noiseBurst(t0, {peak: 0.24, dur: 0.4, cutoff: 3200, sweepTo: 300, type: 'bandpass', q: 2})
        voice({type: 'sawtooth', freq: 600, glideTo: 70, t0, a: 0.005, hold: 0.1, r: 0.7, peak: 0.26})
        break
      }
      default: {
        voice({type: 'sawtooth', freq: 400, glideTo: 40, t0, a: 0.005, hold: 0.08, r: 0.8, peak: 0.28})
        noiseBurst(t0, {peak: 0.2, dur: 0.5, cutoff: 2000, sweepTo: 150, type: 'lowpass'})
      }
    }
  }
  function gameOver() {
    const t0 = ctx().currentTime
    const notes = [523, 392, 311, 262]
    notes.forEach((f, i) => {
      voice({type: 'square', freq: f, t0: t0 + i * 0.24, a: 0.02, hold: 0.12, r: 0.5, peak: 0.18})
      voice({type: 'triangle', freq: f / 2, t0: t0 + i * 0.24, a: 0.02, hold: 0.12, r: 0.5, peak: 0.1})
    })
  }

  // =============================================================================
  // RUN LIFECYCLE
  // =============================================================================
  function startRun(mode, envId) {
    startMotion()
    startAmbience(envId || 'city')
  }
  function update(delta, state) {
    if (!state) return
    frameMotion(delta, state)
    if (state.heliNear) frameRotor()
    // laser beam is driven from its own events; keep the loop alive with power
    if (state.charging || state.beam) {
      if (state.weapon === 'bow') { /* handled via charge events */ }
      if (state.weapon === 'laser' && state.beam) frameBeam(1, panOf(state.x))
    }
  }

  // =============================================================================
  // MENU / UI
  // =============================================================================
  function menuMove() { noiseBurst(ctx().currentTime, {peak: 0.12, dur: 0.03, cutoff: 2400}) }
  function menuSelect() {
    const t0 = ctx().currentTime
    voice({type: 'square', freq: 523, t0, a: 0.004, hold: 0.03, r: 0.1, peak: 0.18})
    voice({type: 'square', freq: 784, t0: t0 + 0.07, a: 0.004, hold: 0.04, r: 0.14, peak: 0.16})
  }
  function menuBack() {
    const t0 = ctx().currentTime
    voice({type: 'square', freq: 494, t0, a: 0.004, hold: 0.03, r: 0.1, peak: 0.16})
    voice({type: 'square', freq: 330, t0: t0 + 0.07, a: 0.004, hold: 0.04, r: 0.14, peak: 0.14})
  }
  function buySuccess() {
    const t0 = ctx().currentTime
    [784, 988, 1319].forEach((f, i) => voice({type: 'square', freq: f, t0: t0 + i * 0.06, a: 0.006, hold: 0.08, r: 0.25, peak: 0.14}))
  }
  function buyFail() {
    const t0 = ctx().currentTime
    voice({type: 'sawtooth', freq: 200, glideTo: 120, t0, a: 0.005, hold: 0.06, r: 0.12, peak: 0.14})
  }

  function silenceAll() {
    for (const id of pending) clearTimeout(id)
    pending = []
    stopMotion()
    stopAmbience()
    stopBeam()
    stopRotor()
    releaseBow()
  }

  // =============================================================================
  // STEREO TEST + LEARN SAMPLES
  // =============================================================================
  function testTone(pan, pitch) {
    const t0 = ctx().currentTime
    voice({type: 'square', freq: pitch || 480, t0, a: 0.005, hold: 0.16, r: 0.2, peak: 0.24, pan})
    voice({type: 'triangle', freq: (pitch || 480) * 2, t0, a: 0.005, hold: 0.07, r: 0.15, peak: 0.08, pan})
  }
  function testDirection(which) {
    const X = 0.9
    if (which === 'sweep') {
      [[-X, 392], [0, 440], [X, 523]].forEach((o, i) => { const id = setTimeout(() => testTone(o[0], o[1]), i * 460); pending.push(id) })
    } else if (which === 'ring') {
      [[-X, 392], [0, 440], [X, 523], [0, 523]].forEach((o, i) => { const id = setTimeout(() => testTone(o[0], o[1]), i * 460); pending.push(id) })
    } else if (which === 'w') testTone(-X, 392)
    else if (which === 'c') testTone(0, 440)
    else if (which === 'e') testTone(X, 523)
    else if (which === 'ambience') startAmbience('city')
  }
  function sample(which) {
    switch (which) {
      case 'pistol': shoot({weapon: 'pistol', dx: 0}); break
      case 'rifle': shoot({weapon: 'rifle', dx: 0}); break
      case 'shotgun': shoot({weapon: 'shotgun', dx: 0}); break
      case 'laser': startBeam(); frameBeam(1, 0); const id = setTimeout(() => { stopBeam() }, 700); pending.push(id); break
      case 'bow': shoot({weapon: 'bow', power: 1, dx: 0}); break
      case 'rocket': shoot({weapon: 'rocket', dx: 0}); break
      case 'dart': shoot({weapon: 'dart', dx: 0}); break
      case 'harpoon': shoot({weapon: 'harpoon', dx: 0}); break
      case 'plasma': shoot({weapon: 'plasma', dx: 0}); break
      case 'shard': shoot({weapon: 'shard', dx: 0}); break
      case 'jump': jump(); break
      case 'land': land(); break
      case 'collectCoin': collect({kind: 'coin', amount: 1, points: 10, dx: 0}); break
      case 'collectGem': collect({kind: 'gem', amount: 1, points: 50, dx: 0}); break
      case 'collectCore': collect({kind: 'core', amount: 1, points: 200, dx: 0}); break
      case 'overdrive': collect({kind: 'overdrive', amount: 1, points: 0, dx: 0}); break
      case 'brake': collect({kind: 'brake', amount: 1, points: 0, dx: 0}); break
      case 'hit': hit({from: 'pit', dmg: 25, hp: 50, dx: 0}); break
      case 'doomLava': doom({reason: 'lava'}); break
      case 'threatPit': threat({kind: 'pit', dx: 0.5, dist: 20}); break
      case 'threatLeft': threat({kind: 'pit', dx: 1.5, dist: 20}); break
      case 'threatRight': threat({kind: 'pit', dx: -1.5, dist: 20}); break
      case 'threatEnemy': threat({kind: 'enemy:thug', dx: 0, dist: 20}); break
      case 'threatHeli': startRotor(); const id2 = setTimeout(() => { stopRotor() }, 1200); pending.push(id2); break
      case 'threatGlitch': threat({kind: 'glitch', dx: 0, dist: 20}); break
      case 'threatMagma': threat({kind: 'magma', dx: 0, dist: 20}); break
      case 'threatVine': threat({kind: 'vine', dx: 0, dist: 20}); break
      case 'fence': threat({kind: 'fence', dx: 0, dist: 15}); break
      case 'teleporter': threat({kind: 'teleporter', dx: 0, dist: 15}); break
      case 'levelComplete': levelComplete({level: 1}); break
      case 'count': count({n: 3}); break
      case 'go': go(); break
      case 'envCity': envEnter({env: 'city'}); break
      case 'envDesert': envEnter({env: 'desert'}); break
      case 'envVolcano': envEnter({env: 'volcano'}); break
      case 'envTundra': envEnter({env: 'tundra'}); break
      case 'envSpace': envEnter({env: 'space'}); break
      case 'envJungle': envEnter({env: 'jungle'}); break
      case 'envOcean': envEnter({env: 'ocean'}); break
      case 'envNeon': envEnter({env: 'neon'}); break
      case 'envCavern': envEnter({env: 'cavern'}); break
      case 'envSewer': sewerIn(); break
      case 'gameOver': gameOver(); break
      case 'teleport': teleport(); break
    }
  }

  return {
    setStaticListener: function () {},
    handle: function (type, data) {
      switch (type) {
        case 'count': count(data); break
        case 'go': go(); break
        case 'mode-title': modeTitle(data); break
        case 'env-enter': envEnter(data); break
        case 'threat': threat(data); break
        case 'threat-switch': threatSwitch(data); break
        case 'pickup': pickup(data); break
        case 'collect': collect(data); break
        case 'pickup-item': pickupItem(data); break
        case 'jump': jump(); break
        case 'land': land(); break
        case 'blocked': blocked(); break
        case 'shoot': shoot(data); break
        case 'charge': charge(data); break
        case 'empty': empty(); break
        case 'reload-start': reloadStart(data); break
        case 'reload-shell': reloadShell(data); break
        case 'reload-end': reloadEnd(data); break
        case 'weapon-switch': weaponSwitch(data); break
        case 'locked': locked(); break
        case 'kill': kill(data); break
        case 'hit': hit(data); break
        case 'hit-blocked': hitBlocked(); break
        case 'lifeline': lifeline(); break
        case 'gravity': gravity(data); break
        case 'item-used': itemUsed(data); break
        case 'item-empty': itemEmpty(); break
        case 'item-select': itemSelect(); break
        case 'item-desc': itemDesc(); break
        case 'shield-on': shieldOn(data); break
        case 'shield-off': shieldOff(); break
        case 'boost-on': boostOn(); break
        case 'boost-off': boostOff(); break
        case 'overdrive-on': overdriveOn(); break
        case 'overdrive-off': overdriveOff(); break
        case 'brake-on': brakeOn(); break
        case 'brake-off': brakeOff(); break
        case 'emp-use': empUse(data); break
        case 'fence-emp': fenceEmp(); break
        case 'teleport': teleport(); break
        case 'sewer-in': sewerIn(); break
        case 'sewer-exit': sewerExit(); break
        case 'level-complete': levelComplete(data); break
        case 'run-complete': runComplete(data); break
        case 'doom': doom(data); break
        case 'game-over': gameOver(); break
      }
    },
    startRun, update, silenceAll,
    menuMove, menuSelect, menuBack, buySuccess, buyFail,
    setAmbience: envId => startAmbience(envId),
    sample, testDirection,
  }
})()
