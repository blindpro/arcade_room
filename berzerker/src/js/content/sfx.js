// Discrete one-shot SFX. Every effect routes through `audio.playSpatial`
// for in-world cues, or directly to the mixer for non-spatial UI sounds
// (menu beep, extra-life jingle). All amplitude shaping uses the shared
// ADSR helper from `audio.envelope`.
content.sfx = (() => {
  const A = () => content.audio
  const ctxFn = () => engine.context()

  let busGain = 1
  function setBusGain(g) { busGain = g }

  // ----- helpers ------------------------------------------------------------

  function dispose(t, fn) {
    setTimeout(fn, Math.max(0, (t - engine.time()) * 1000) + 50)
  }

  function noiseBuffer(durSec) {
    return engine.buffer.whiteNoise({channels: 1, duration: durSec})
  }

  // ----- player laser -------------------------------------------------------

  function playerLaser(sx, sy) {
    const t0 = engine.time()
    const dur = 0.18
    A().playSpatial(sx, sy, (out, mod) => {
      const ctx = ctxFn()
      const pm = (mod && mod.pitchMul) || 1
      const o = ctx.createOscillator()
      o.type = 'square'
      o.frequency.setValueAtTime(1600 * pm, t0)
      o.frequency.exponentialRampToValueAtTime(420 * pm, t0 + dur)
      const g = ctx.createGain()
      g.gain.value = 0
      A().envelope(g.gain, t0, 0.005, 0.04, dur - 0.04, 0.55 * busGain)
      o.connect(g).connect(out)
      o.start(t0); o.stop(t0 + dur + 0.05)
      return () => { try { o.stop() } catch (_) {} }
    }, {gain: 1.0, near: 4, pow: 1.4})
  }

  // ----- robot laser --------------------------------------------------------

  function robotLaser(sx, sy, baseHz) {
    const t0 = engine.time()
    const dur = 0.22
    const f0 = (baseHz || 220) * 3.2
    A().playSpatial(sx, sy, (out, mod) => {
      const ctx = ctxFn()
      const pm = (mod && mod.pitchMul) || 1
      const f0m = f0 * pm
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(f0m, t0)
      o.frequency.exponentialRampToValueAtTime(Math.max(80, f0m * 0.25), t0 + dur)
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = f0m * 0.8
      bp.Q.value = 5
      const g = ctx.createGain()
      g.gain.value = 0
      A().envelope(g.gain, t0, 0.004, 0.05, dur - 0.05, 0.45 * busGain)
      o.connect(bp).connect(g).connect(out)
      o.start(t0); o.stop(t0 + dur + 0.05)
      return () => { try { o.stop() } catch (_) {} }
    }, {gain: 1.0, near: 5, pow: 1.5})
  }

  // ----- robot footstep -----------------------------------------------------
  // Mechanical clank: pitched square body + a short bandpassed-noise click
  // transient that gives the metallic edge. Deliberately tonal and percussive
  // so it can't be confused with the white-noise wall buzz. Pitch family
  // (baseHz) keeps grunt / flank / sniper individually identifiable.
  function robotFootstep(sx, sy, baseHz) {
    const t0 = engine.time()
    const dur = 0.11
    const f = (baseHz || 220) * 0.6
    A().playSpatial(sx, sy, (out, mod) => {
      const ctx = ctxFn()
      const pm = (mod && mod.pitchMul) || 1
      const fm = f * pm

      // Pitched body — square gives a hard, industrial edge.
      const o = ctx.createOscillator()
      o.type = 'square'
      o.frequency.setValueAtTime(fm, t0)
      o.frequency.exponentialRampToValueAtTime(Math.max(45, fm * 0.55), t0 + dur)
      const ob = ctx.createBiquadFilter()
      ob.type = 'lowpass'
      ob.frequency.value = fm * 4
      ob.Q.value = 1.2
      const gBody = ctx.createGain()
      gBody.gain.value = 0
      A().envelope(gBody.gain, t0, 0.003, 0.012, dur - 0.012, 0.36 * busGain)
      o.connect(ob).connect(gBody).connect(out)
      o.start(t0); o.stop(t0 + dur + 0.03)

      // Click transient — narrow band of noise around 2 × fm gives the
      // "metal scuff" that tells the ear "this is mechanical."
      const n = ctx.createBufferSource()
      n.buffer = noiseBuffer(0.04)
      const nbp = ctx.createBiquadFilter()
      nbp.type = 'bandpass'
      nbp.frequency.value = fm * 5.5
      nbp.Q.value = 6
      const gClick = ctx.createGain()
      gClick.gain.value = 0
      A().envelope(gClick.gain, t0, 0.001, 0.005, 0.025, 0.22 * busGain)
      n.connect(nbp).connect(gClick).connect(out)
      n.start(t0); n.stop(t0 + 0.05)

      return () => {
        try { o.stop() } catch (_) {}
        try { n.stop() } catch (_) {}
      }
    }, {gain: 1.0, near: 3, pow: 1.5, binauralGain: 0.45})
  }

  // ----- player footstep ----------------------------------------------------
  // Soft boot-on-floor thud: low triangle body + a brief lowpassed noise
  // thump. Deliberately darker and lower than the robot clank so the ear
  // never confuses "I'm walking" with "a robot is walking near me."
  function playerFootstep(sx, sy) {
    const t0 = engine.time()
    const dur = 0.09
    A().playSpatial(sx, sy, (out, mod) => {
      const ctx = ctxFn()
      const pm = (mod && mod.pitchMul) || 1

      // Pitched body — low triangle, fast downsweep, no metallic ring.
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.setValueAtTime(120 * pm, t0)
      o.frequency.exponentialRampToValueAtTime(60 * pm, t0 + dur)
      const gBody = ctx.createGain()
      gBody.gain.value = 0
      A().envelope(gBody.gain, t0, 0.004, 0.01, dur - 0.01, 0.28 * busGain)
      o.connect(gBody).connect(out)
      o.start(t0); o.stop(t0 + dur + 0.03)

      // Soft thump — lowpassed noise burst, no high content (so it can't
      // be mistaken for wall buzz or a robot click).
      const n = ctx.createBufferSource()
      n.buffer = noiseBuffer(0.05)
      const nlp = ctx.createBiquadFilter()
      nlp.type = 'lowpass'
      nlp.frequency.value = 240
      nlp.Q.value = 0.9
      const gThump = ctx.createGain()
      gThump.gain.value = 0
      A().envelope(gThump.gain, t0, 0.002, 0.005, 0.04, 0.20 * busGain)
      n.connect(nlp).connect(gThump).connect(out)
      n.start(t0); n.stop(t0 + 0.06)

      return () => {
        try { o.stop() } catch (_) {}
        try { n.stop() } catch (_) {}
      }
    }, {gain: 0.9, near: 1.8, pow: 1.4, binauralGain: 0.30})
  }

  // ----- robot death (zap + electric sizzle) --------------------------------

  function robotDeath(sx, sy) {
    const t0 = engine.time()
    const dur = 0.45
    A().playSpatial(sx, sy, (out, mod) => {
      const ctx = ctxFn()
      const pm = (mod && mod.pitchMul) || 1
      // Zap: fast saw downsweep
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(1200 * pm, t0)
      o.frequency.exponentialRampToValueAtTime(110 * pm, t0 + 0.18)
      const og = ctx.createGain()
      og.gain.value = 0
      A().envelope(og.gain, t0, 0.003, 0.04, 0.18, 0.6 * busGain)
      o.connect(og).connect(out)
      o.start(t0); o.stop(t0 + 0.25)

      // Sizzle: filtered noise tail
      const n = ctx.createBufferSource()
      n.buffer = noiseBuffer(dur)
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 2400
      bp.Q.value = 1.4
      const ng = ctx.createGain()
      ng.gain.value = 0
      A().envelope(ng.gain, t0 + 0.12, 0.01, 0.05, dur - 0.18, 0.4 * busGain)
      n.connect(bp).connect(ng).connect(out)
      n.start(t0); n.stop(t0 + dur + 0.05)
      return () => {
        try { o.stop() } catch (_) {}
        try { n.stop() } catch (_) {}
      }
    }, {gain: 1.0, near: 3, pow: 1.4})
  }

  // ----- player death stings ------------------------------------------------
  // Each cause gets a distinct sting layered ON TOP of any cause-specific
  // SFX (laser zap is silent on the player; the wall zap already plays
  // wallZap; Otto contacts are otherwise silent). The sting is a clear
  // "you went down" cue that the player can recognize even mid-chaos.

  function playerHitByLaser(sx, sy) {
    const t0 = engine.time()
    const dur = 0.65
    A().playSpatial(sx, sy, (out, mod) => {
      const ctx = ctxFn()
      const pm = (mod && mod.pitchMul) || 1
      // High piercing tone that drops fast — the laser punches through.
      const o = ctx.createOscillator()
      o.type = 'square'
      o.frequency.setValueAtTime(1400 * pm, t0)
      o.frequency.exponentialRampToValueAtTime(180 * pm, t0 + 0.35)
      const og = ctx.createGain()
      og.gain.value = 0
      A().envelope(og.gain, t0, 0.003, 0.05, 0.32, 0.7 * busGain)
      o.connect(og).connect(out)
      o.start(t0); o.stop(t0 + 0.4)

      // Body slump — low triangle that sags.
      const slump = ctx.createOscillator()
      slump.type = 'triangle'
      slump.frequency.setValueAtTime(160 * pm, t0 + 0.15)
      slump.frequency.exponentialRampToValueAtTime(50 * pm, t0 + dur)
      const sg = ctx.createGain()
      sg.gain.value = 0
      A().envelope(sg.gain, t0 + 0.15, 0.02, 0.10, dur - 0.27, 0.55 * busGain)
      slump.connect(sg).connect(out)
      slump.start(t0 + 0.15); slump.stop(t0 + dur + 0.05)

      // Electric tail
      const n = ctx.createBufferSource()
      n.buffer = noiseBuffer(0.35)
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 1800
      bp.Q.value = 2.8
      const ng = ctx.createGain()
      ng.gain.value = 0
      A().envelope(ng.gain, t0, 0.005, 0.05, 0.30, 0.40 * busGain)
      n.connect(bp).connect(ng).connect(out)
      n.start(t0); n.stop(t0 + 0.4)
      return () => {
        try { o.stop() } catch (_) {}
        try { slump.stop() } catch (_) {}
        try { n.stop() } catch (_) {}
      }
    }, {gain: 1.1, near: 4, pow: 1.2, stereoGain: 0.9, binauralGain: 0.55})
  }

  function playerHitByWall(sx, sy) {
    // The wallZap already plays the buzz; layer a body-slump sting on top
    // so the player hears "ME — I just died" not just "wall zapped".
    const t0 = engine.time()
    const dur = 0.85
    A().playSpatial(sx, sy, (out, mod) => {
      const ctx = ctxFn()
      const pm = (mod && mod.pitchMul) || 1
      // Descending lament — a 2-tone fall that reads as defeat.
      const f0 = 660 * pm, f1 = 196 * pm
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(f0, t0)
      o.frequency.exponentialRampToValueAtTime(f1, t0 + dur * 0.7)
      const og = ctx.createGain()
      og.gain.value = 0
      A().envelope(og.gain, t0, 0.01, 0.10, dur - 0.11, 0.45 * busGain)
      o.connect(og).connect(out)
      o.start(t0); o.stop(t0 + dur + 0.05)
      return () => { try { o.stop() } catch (_) {} }
    }, {gain: 1.0, near: 4, pow: 1.2, stereoGain: 0.85, binauralGain: 0.5})
  }

  function playerHitByOtto(sx, sy) {
    // Otto giggles — a high stuttering chirp + a sustained low groan.
    const t0 = engine.time()
    const dur = 1.0
    A().playSpatial(sx, sy, (out, mod) => {
      const ctx = ctxFn()
      const pm = (mod && mod.pitchMul) || 1
      // Chirp giggle: rapid pulse train of sine ticks.
      const stops = []
      for (let i = 0; i < 5; i++) {
        const tk = t0 + i * 0.07
        const o = ctx.createOscillator()
        o.type = 'sine'
        const f = (i % 2 === 0 ? 1100 : 880) * pm
        o.frequency.setValueAtTime(f, tk)
        const g = ctx.createGain()
        g.gain.value = 0
        A().envelope(g.gain, tk, 0.003, 0.025, 0.04, 0.45 * busGain)
        o.connect(g).connect(out)
        o.start(tk); o.stop(tk + 0.08)
        stops.push(o)
      }
      // Groan
      const grn = ctx.createOscillator()
      grn.type = 'sawtooth'
      grn.frequency.setValueAtTime(220 * pm, t0 + 0.4)
      grn.frequency.exponentialRampToValueAtTime(70 * pm, t0 + dur)
      const gg = ctx.createGain()
      gg.gain.value = 0
      A().envelope(gg.gain, t0 + 0.4, 0.02, 0.15, dur - 0.57, 0.5 * busGain)
      grn.connect(gg).connect(out)
      grn.start(t0 + 0.4); grn.stop(t0 + dur + 0.05)
      stops.push(grn)
      return () => stops.forEach((s) => { try { s.stop() } catch (_) {} })
    }, {gain: 1.1, near: 4, pow: 1.2, stereoGain: 0.9, binauralGain: 0.55})
  }

  // ----- wall zap (player or robot electrocuted) ----------------------------

  function wallZap(sx, sy) {
    const t0 = engine.time()
    const dur = 0.7
    A().playSpatial(sx, sy, (out, mod) => {
      const ctx = ctxFn()
      const pm = (mod && mod.pitchMul) || 1
      const n = ctx.createBufferSource()
      n.buffer = noiseBuffer(dur)
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(2400 * pm, t0)
      bp.frequency.exponentialRampToValueAtTime(220 * pm, t0 + dur)
      bp.Q.value = 5
      const g = ctx.createGain()
      g.gain.value = 0
      A().envelope(g.gain, t0, 0.005, 0.08, dur - 0.08, 0.85 * busGain)
      // Modulate amplitude with a 14 Hz square LFO for that buzz quality.
      const lfo = ctx.createOscillator()
      lfo.type = 'square'
      lfo.frequency.value = 14
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = 0.6
      lfo.connect(lfoGain).connect(g.gain)
      n.connect(bp).connect(g).connect(out)
      n.start(t0); n.stop(t0 + dur + 0.05)
      lfo.start(t0); lfo.stop(t0 + dur + 0.05)
      return () => {
        try { n.stop() } catch (_) {}
        try { lfo.stop() } catch (_) {}
      }
    }, {gain: 1.0, near: 4, pow: 1.4})
  }

  // ----- Otto bounce tick (two pitches a tritone apart) ---------------------

  // C5 = 523.25, F#5 = 739.99. The interval is the iconic Otto signature.
  const OTTO_HZ = [523.25, 739.99]

  function ottoBounceTick(sx, sy, phaseIdx) {
    const t0 = engine.time()
    const dur = 0.25
    const f = OTTO_HZ[phaseIdx & 1]
    A().playSpatial(sx, sy, (out, mod) => {
      const ctx = ctxFn()
      const pm = (mod && mod.pitchMul) || 1
      const fm = f * pm
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(fm, t0)
      // Slight upward chirp so it reads as a "bounce arrival" rather than a flat tone.
      o.frequency.exponentialRampToValueAtTime(fm * 1.04, t0 + 0.05)
      o.frequency.exponentialRampToValueAtTime(fm * 0.95, t0 + dur)
      const g = ctx.createGain()
      g.gain.value = 0
      A().envelope(g.gain, t0, 0.005, 0.06, dur - 0.06, 0.6 * busGain)
      o.connect(g).connect(out)
      o.start(t0); o.stop(t0 + dur + 0.05)
      return () => { try { o.stop() } catch (_) {} }
    }, {gain: 1.1, near: 6, pow: 1.2, stereoGain: 0.95, binauralGain: 0.6})
  }

  // ----- non-spatial jingles (UI / score events) ----------------------------

  function jingle(notes, opts = {}) {
    const ctx = ctxFn()
    const t0 = engine.time()
    const out = ctx.createGain()
    out.gain.value = (opts.gain != null ? opts.gain : 0.4) * busGain
    out.connect(engine.mixer.input())
    let t = t0
    const stops = []
    for (const n of notes) {
      const o = ctx.createOscillator()
      o.type = opts.type || 'square'
      o.frequency.value = n.f
      const g = ctx.createGain()
      g.gain.value = 0
      A().envelope(g.gain, t, 0.005, n.d - 0.04, 0.04, 1)
      o.connect(g).connect(out)
      o.start(t); o.stop(t + n.d + 0.05)
      stops.push(o)
      t += n.d * (n.gap != null ? n.gap : 1)
    }
    dispose(t + 0.2, () => {
      stops.forEach((o) => { try { o.stop() } catch (_) {} })
      try { out.disconnect() } catch (_) {}
    })
  }

  function extraLifeJingle() {
    jingle([
      {f: 523.25, d: 0.10},
      {f: 659.25, d: 0.10},
      {f: 783.99, d: 0.10},
      {f: 1046.5, d: 0.20},
    ], {type: 'triangle', gain: 0.45})
  }

  function roomClearedFanfare() {
    jingle([
      {f: 392.00, d: 0.12},
      {f: 523.25, d: 0.12},
      {f: 659.25, d: 0.12},
      {f: 783.99, d: 0.30},
    ], {type: 'square', gain: 0.5})
  }

  function gameOverJingle() {
    jingle([
      {f: 440.00, d: 0.18},
      {f: 349.23, d: 0.18},
      {f: 277.18, d: 0.18},
      {f: 220.00, d: 0.50},
    ], {type: 'sawtooth', gain: 0.45})
  }

  function getReadyTone() {
    jingle([
      {f: 660, d: 0.10},
      {f: 660, d: 0.10},
      {f: 880, d: 0.20},
    ], {type: 'square', gain: 0.4})
  }

  // ----- menu cues ----------------------------------------------------------

  function shortBeep(freq, dur, type, gain) {
    const ctx = ctxFn()
    const t0 = engine.time()
    const o = ctx.createOscillator()
    o.type = type || 'square'
    o.frequency.value = freq
    const g = ctx.createGain()
    g.gain.value = 0
    A().envelope(g.gain, t0, 0.003, dur - 0.02, 0.02, (gain != null ? gain : 0.18) * busGain)
    o.connect(g).connect(engine.mixer.input())
    o.start(t0); o.stop(t0 + dur + 0.04)
    dispose(t0 + dur + 0.1, () => { try { o.disconnect() } catch (_) {}; try { g.disconnect() } catch (_) {} })
  }

  function menuMove() { shortBeep(660, 0.04, 'square', 0.18) }
  function menuBack() { shortBeep(330, 0.06, 'square', 0.18) }
  function menuConfirm() { shortBeep(880, 0.06, 'square', 0.22) }

  return {
    setBusGain,
    busGain: () => busGain,
    playerLaser,
    robotLaser,
    robotFootstep,
    playerFootstep,
    robotDeath,
    playerHitByLaser,
    playerHitByWall,
    playerHitByOtto,
    wallZap,
    ottoBounceTick,
    extraLifeJingle,
    roomClearedFanfare,
    gameOverJingle,
    getReadyTone,
    menuMove,
    menuBack,
    menuConfirm,
  }
})()
