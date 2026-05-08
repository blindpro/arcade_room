// Exit-chord beacons. One looped pad per cardinal exit, placed at the
// gap centroid in the perimeter wall. Each direction gets its own chord
// fingerprint (root + interval + timbre) so the player can identify
// which exit they're walking toward, and binaural carries the bearing.
// Chords ONLY play once the room is cleared (no robots remaining and
// Otto inactive) — until then the room is meant to feel hostile, and
// the chord pad would mask combat audio.
content.exitChord = (() => {
  const A = () => content.audio
  const R = () => content.room
  const ROBOTS = () => content.robots
  const P = () => content.player

  // Per-direction chord identity. Frequencies are deliberately spread
  // across registers so each cardinal owns a distinct part of the
  // spectrum even before binaural localisation kicks in.
  //   N — bright, high, major (E5/G#5/B5) → "open sky"
  //   E — mid, stable, major  (C4/E4/G4)  → "neutral, normal exit"
  //   S — warm, low, minor    (A3/C4/E4)  → "low, grounded"
  //   W — deep, mysterious, dim (E3/G3/A#3) → "shadowed"
  // Each voice also gets a slow LFO on amplitude so the pad pulses
  // gently — chord-pads that stay perfectly flat tend to vanish into
  // the binaural mix.
  const CHORDS = {
    N: {root: 659.25, third: 830.61, fifth: 987.77, type: 'sine',     bp: 1500, lfoHz: 0.42},
    E: {root: 261.63, third: 329.63, fifth: 392.00, type: 'triangle', bp:  900, lfoHz: 0.35},
    S: {root: 220.00, third: 261.63, fifth: 329.63, type: 'triangle', bp:  600, lfoHz: 0.30},
    W: {root: 164.81, third: 196.00, fifth: 233.08, type: 'sawtooth', bp:  450, lfoHz: 0.25},
  }

  const PROX_NEAR = 1.5  // tiles — peak gain inside this radius
  const PROX_FAR  = 22   // tiles — silent past this (whole-room reach)
  const PROX_POW  = 1.4  // gentle falloff so the chord stays trackable across a room
  const PEAK_CAP  = 0.32 // per-voice ceiling — leave headroom for Otto/footsteps

  let voices = {}        // dir → prop
  let busGain = 0.7

  function setBusGain(g) { busGain = g }

  function buildChordVoice(spec) {
    return (out, mod) => {
      const ctx = engine.context()

      // Three oscillators (root, third, fifth) sum into a soft bandpass
      // so the pad sits in its assigned register without harsh upper
      // partials. Each oscillator is independent so phase relationships
      // jitter and the chord doesn't sound like a synthetic stack.
      const oRoot = ctx.createOscillator()
      const oThird = ctx.createOscillator()
      const oFifth = ctx.createOscillator()
      oRoot.type = spec.type
      oThird.type = spec.type
      oFifth.type = spec.type
      oRoot.frequency.value  = spec.root
      oThird.frequency.value = spec.third
      oFifth.frequency.value = spec.fifth
      if (mod && mod.detune) {
        try {
          mod.detune.connect(oRoot.detune)
          mod.detune.connect(oThird.detune)
          mod.detune.connect(oFifth.detune)
        } catch (_) {}
      }

      // Mild detune per partial so the triad has analog shimmer.
      oThird.detune.value = 6
      oFifth.detune.value = -8

      // Per-partial gain — root carries, third/fifth quieter so the
      // chord reads as a tonic with colour rather than three equal voices.
      const gRoot  = ctx.createGain(); gRoot.gain.value  = 0.40
      const gThird = ctx.createGain(); gThird.gain.value = 0.22
      const gFifth = ctx.createGain(); gFifth.gain.value = 0.22

      // Bandpass thins the stack and gives each direction its own register.
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = spec.bp
      bp.Q.value = 0.9

      // Slow amplitude LFO — pad pulses gently. Without it the chord can
      // get masked by the player's own footsteps.
      const lfo = ctx.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.value = spec.lfoHz
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = 0.18 // ±18% amplitude swing
      const ampMod = ctx.createGain()
      ampMod.gain.value = 1.0
      lfo.connect(lfoGain).connect(ampMod.gain)

      oRoot.connect(gRoot).connect(bp)
      oThird.connect(gThird).connect(bp)
      oFifth.connect(gFifth).connect(bp)
      bp.connect(ampMod).connect(out)

      oRoot.start(); oThird.start(); oFifth.start(); lfo.start()
      return () => {
        try { oRoot.stop() } catch (_) {}
        try { oThird.stop() } catch (_) {}
        try { oFifth.stop() } catch (_) {}
        try { lfo.stop() } catch (_) {}
      }
    }
  }

  function ensureVoices() {
    const room = R()
    if (!room) return
    const exits = room.exits()
    if (!exits) return
    for (const dir of ['N', 'E', 'S', 'W']) {
      if (voices[dir]) continue
      const c = room.exitCenter(dir)
      if (!c) continue
      voices[dir] = A().makeProp({
        build: buildChordVoice(CHORDS[dir]),
        x: c.x, y: c.y,
        gain: 0,
        normalize: true, // far walls stay barely audible — distance carried by gain curve below
        key: 'exitChord-' + dir,
      })
    }
  }

  function destroyAll() {
    for (const k in voices) {
      try { voices[k].destroy() } catch (_) {}
    }
    voices = {}
  }

  // Reset on room transition: tear voices down so the new room rebuilds
  // them at fresh exit centroids.
  function reset() {
    destroyAll()
  }

  function frame() {
    const room = R()
    if (!room || !P()) return
    const robots = ROBOTS()
    const cleared = robots && robots.aliveCount() === 0
    if (!cleared) {
      // While robots are alive: keep voices silent. We don't destroy them
      // because the player might clear the room and we want instant onset.
      for (const k in voices) {
        try { voices[k].setGain(0) } catch (_) {}
      }
      return
    }

    ensureVoices()
    const p = P().getPosition()
    for (const dir in voices) {
      const v = voices[dir]
      const c = room.exitCenter(dir)
      if (!c) { try { v.setGain(0) } catch (_) {}; continue }
      const dx = c.x - p.x, dy = c.y - p.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      let g
      if (dist <= PROX_NEAR) g = 1
      else if (dist >= PROX_FAR) g = 0
      else {
        const t = (PROX_FAR - dist) / (PROX_FAR - PROX_NEAR)
        g = Math.pow(t, PROX_POW)
      }
      v.setPosition(c.x, c.y)
      v.setGain(Math.min(PEAK_CAP, g) * busGain)
    }
  }

  return {
    frame,
    reset,
    destroyAll,
    setBusGain,
    busGain: () => busGain,
    CHORDS,
  }
})()
