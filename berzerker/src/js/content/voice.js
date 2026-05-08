// Robot voice synthesis. The fighters game's `voice.js::buildVoice` is the
// formant base — sawtooth carrier through a 3-bandpass formant bank. On
// top of that we run a robotization layer (ring-mod + bit-crush + comb
// delay) that gives the voice its overtly mechanical timbre. Phrases are
// built by tokenising the text into 5-vowel + small-consonant frames; each
// vowel/consonant becomes a short scheduled segment of the synth bus.
//
// Per-locale phrase pools (`robotbarks.pools.*` in i18n.js) are AUTHORED
// independently — the Spanish robots don't say translated English. The
// voice module is locale-agnostic; it just speaks whatever the i18n key
// resolves to in the current locale.
content.voice = (() => {
  const A = () => content.audio
  const ctxFn = () => engine.context()

  let busGain = 1
  function setBusGain(g) { busGain = g }

  // 5-vowel formant table (F1, F2 in Hz) — a simplified Peterson-Barney.
  const VOWELS = {
    a: {f1: 700, f2: 1100},
    e: {f1: 500, f2: 1800},
    i: {f1: 320, f2: 2400},
    o: {f1: 500, f2:  900},
    u: {f1: 320, f2:  800},
  }

  // Consonants we approximate. Each is a short noise burst with a
  // bandpass centre. Anything not in this set or VOWELS becomes a 60ms
  // silent gap (pacing).
  const CONSONANTS = {
    s: {f: 5800, q: 1.6, dur: 0.06, gain: 0.55},
    t: {f: 3800, q: 0.9, dur: 0.04, gain: 0.65},
    k: {f: 2400, q: 0.9, dur: 0.04, gain: 0.55},
    p: {f: 1200, q: 1.0, dur: 0.04, gain: 0.55},
    m: {f:  280, q: 1.4, dur: 0.06, gain: 0.45},
    n: {f:  500, q: 1.4, dur: 0.06, gain: 0.45},
    r: {f:  900, q: 2.4, dur: 0.06, gain: 0.50},
    l: {f:  650, q: 1.6, dur: 0.06, gain: 0.45},
    h: {f: 4200, q: 0.7, dur: 0.05, gain: 0.40},
    f: {f: 5200, q: 1.2, dur: 0.06, gain: 0.45},
    v: {f:  900, q: 1.4, dur: 0.06, gain: 0.45},
    z: {f: 4400, q: 1.2, dur: 0.06, gain: 0.50},
    j: {f: 2200, q: 1.4, dur: 0.05, gain: 0.50},
    g: {f: 1400, q: 1.0, dur: 0.05, gain: 0.50},
    d: {f: 1600, q: 0.9, dur: 0.04, gain: 0.55},
    b: {f:  700, q: 1.0, dur: 0.04, gain: 0.55},
  }

  // Map any input character to a phoneme key, normalising accents.
  function normChar(ch) {
    const c = ch.toLowerCase()
    if (c === 'á' || c === 'à' || c === 'ä') return 'a'
    if (c === 'é' || c === 'è' || c === 'ë') return 'e'
    if (c === 'í' || c === 'ì' || c === 'ï') return 'i'
    if (c === 'ó' || c === 'ò' || c === 'ö') return 'o'
    if (c === 'ú' || c === 'ù' || c === 'ü') return 'u'
    if (c === 'ñ') return 'n'
    if (c === 'ç') return 's'
    return c
  }

  // Tokenise a phrase into a sequence of {kind, key, dur} frames.
  // Vowels = 'v', consonants = 'c', gaps = 'gap'. Whitespace yields a longer
  // silence; punctuation yields a brief pause and a slight pitch dip.
  function tokenize(phrase) {
    const tokens = []
    for (const raw of phrase) {
      const c = normChar(raw)
      if (VOWELS[c]) tokens.push({kind: 'v', key: c, dur: 0.10})
      else if (CONSONANTS[c]) tokens.push({kind: 'c', key: c, dur: CONSONANTS[c].dur})
      else if (c === ' ') tokens.push({kind: 'gap', dur: 0.10})
      else if (c === ',' || c === ';' || c === ':') tokens.push({kind: 'gap', dur: 0.18})
      else if (c === '.' || c === '!' || c === '?') tokens.push({kind: 'gap', dur: 0.28})
      else tokens.push({kind: 'gap', dur: 0.04})
    }
    return tokens
  }

  // Bit-crush: 5-bit quantization. Precomputed Float32 LUT, reused.
  const CRUSH_LUT = (() => {
    const N = 4096
    const STEPS = 32 // 2^5 levels
    const lut = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1
      lut[i] = Math.round(x * (STEPS / 2)) / (STEPS / 2)
    }
    return lut
  })()

  function makeRobotizationBus() {
    const ctx = ctxFn()
    const input = ctx.createGain()
    input.gain.value = 1
    const output = ctx.createGain()
    output.gain.value = 1

    // Ring modulator: multiply the signal by a 75 Hz square LFO carrier.
    // Implemented as input → ringGain.gain controlled by a square oscillator
    // (range -1..+1 mapped to gain range via DC-blocking trick).
    const ringGain = ctx.createGain()
    ringGain.gain.value = 0
    const ringLfo = ctx.createOscillator()
    ringLfo.type = 'square'
    ringLfo.frequency.value = 75
    // Map the oscillator (-1..+1) directly onto an a-rate gain. We also add
    // a small DC bias so the modulation doesn't pure-zero out the signal —
    // 0.4 mod depth keeps the voice intelligible.
    const bias = ctx.createConstantSource()
    bias.offset.value = 0.55
    const ringMix = ctx.createGain()
    ringMix.gain.value = 0.45
    ringLfo.connect(ringMix).connect(ringGain.gain)
    bias.connect(ringGain.gain)
    input.connect(ringGain)

    // Bit-crush waveshaper.
    const shaper = ctx.createWaveShaper()
    shaper.curve = CRUSH_LUT
    shaper.oversample = '2x'
    ringGain.connect(shaper)

    // Comb delay (7 ms, feedback 0.4) — metallic ring.
    const delay = ctx.createDelay(0.05)
    delay.delayTime.value = 0.007
    const fb = ctx.createGain()
    fb.gain.value = 0.4
    shaper.connect(delay)
    delay.connect(fb).connect(delay)

    // Mix dry + delayed.
    const dry = ctx.createGain()
    dry.gain.value = 0.7
    shaper.connect(dry).connect(output)
    const wet = ctx.createGain()
    wet.gain.value = 0.5
    delay.connect(wet).connect(output)

    ringLfo.start()
    bias.start()

    return {
      input, output,
      stop() {
        try { ringLfo.stop() } catch (_) {}
        try { bias.stop() } catch (_) {}
        try { input.disconnect() } catch (_) {}
        try { ringGain.disconnect() } catch (_) {}
        try { shaper.disconnect() } catch (_) {}
        try { delay.disconnect() } catch (_) {}
        try { fb.disconnect() } catch (_) {}
        try { dry.disconnect() } catch (_) {}
        try { wet.disconnect() } catch (_) {}
        try { output.disconnect() } catch (_) {}
      },
    }
  }

  // Schedule a vowel frame (saw + 3 bandpass formants).
  function scheduleVowel(out, t0, dur, basePitch, vowelKey) {
    const ctx = ctxFn()
    const v = VOWELS[vowelKey]
    const bus = ctx.createGain()
    bus.gain.value = 0
    A().envelope(bus.gain, t0, 0.015, dur - 0.04, 0.025, 0.85)

    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(basePitch, t0)
    // Slight downward inflection per syllable so it doesn't sound flat.
    o.frequency.linearRampToValueAtTime(basePitch * 0.97, t0 + dur)

    const f1 = ctx.createBiquadFilter()
    f1.type = 'bandpass'; f1.frequency.value = v.f1; f1.Q.value = 9
    const f2 = ctx.createBiquadFilter()
    f2.type = 'bandpass'; f2.frequency.value = v.f2; f2.Q.value = 11
    const f3 = ctx.createBiquadFilter()
    f3.type = 'bandpass'; f3.frequency.value = 2800; f3.Q.value = 8

    const g1 = ctx.createGain(); g1.gain.value = 0.9
    const g2 = ctx.createGain(); g2.gain.value = 0.6
    const g3 = ctx.createGain(); g3.gain.value = 0.3

    o.connect(f1).connect(g1).connect(bus)
    o.connect(f2).connect(g2).connect(bus)
    o.connect(f3).connect(g3).connect(bus)
    bus.connect(out)

    o.start(t0); o.stop(t0 + dur + 0.02)
    return o
  }

  // Schedule a consonant noise burst.
  function scheduleConsonant(out, t0, dur, key) {
    const ctx = ctxFn()
    const c = CONSONANTS[key]
    if (!c) return null
    const n = ctx.createBufferSource()
    n.buffer = engine.buffer.whiteNoise({channels: 1, duration: dur + 0.05})
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = c.f
    bp.Q.value = c.q
    const g = ctx.createGain()
    g.gain.value = 0
    A().envelope(g.gain, t0, 0.004, dur - 0.02, 0.018, c.gain)
    n.connect(bp).connect(g).connect(out)
    n.start(t0); n.stop(t0 + dur + 0.04)
    return n
  }

  // Speak a phrase at world position (sx, sy). Returns the total duration
  // so the caller can chain follow-up cues. Positional audio inherits the
  // standard binaural + behind-muffle from `playSpatial`.
  function say(phraseOrKey, sx, sy, opts = {}) {
    const phrase = (typeof phraseOrKey === 'string' && phraseOrKey.indexOf('.') !== -1)
      ? app.i18n.t(phraseOrKey) : phraseOrKey
    if (!phrase) return 0
    const tokens = tokenize(String(phrase))
    let total = 0
    for (const tok of tokens) total += tok.dur
    if (total <= 0) return 0

    const basePitch = opts.basePitch || 110

    A().playSpatial(sx, sy, (out, mod) => {
      const pm = (mod && mod.pitchMul) || 1
      const robot = makeRobotizationBus()
      const post = ctxFn().createGain()
      post.gain.value = (opts.gain != null ? opts.gain : 1) * busGain
      robot.output.connect(post).connect(out)

      const t0 = engine.time() + 0.01
      let t = t0
      const stops = []
      for (const tok of tokens) {
        if (tok.kind === 'v') {
          stops.push(scheduleVowel(robot.input, t, tok.dur, basePitch * pm, tok.key))
        } else if (tok.kind === 'c') {
          const n = scheduleConsonant(robot.input, t, tok.dur, tok.key)
          if (n) stops.push(n)
        }
        t += tok.dur
      }
      const endAt = t + 0.2
      setTimeout(() => {
        for (const s of stops) { try { s.stop() } catch (_) {} }
        try { robot.stop() } catch (_) {}
        try { post.disconnect() } catch (_) {}
      }, Math.max(0, (endAt - engine.time()) * 1000))
      return () => {
        for (const s of stops) { try { s.stop() } catch (_) {} }
        try { robot.stop() } catch (_) {}
      }
    }, {gain: 1.0, near: opts.near || 5, pow: opts.pow || 1.3, stereoGain: 0.85, binauralGain: 0.55})

    return total
  }

  // Pick a phrase key from an i18n pool (`robotbarks.pools.<category>`).
  // Returns the picked phrase key; caller passes that to `say`.
  function pickPool(category) {
    const pool = app.i18n.t('robotbarks.pools.' + category)
    if (!Array.isArray(pool) || pool.length === 0) return null
    return pool[Math.floor(Math.random() * pool.length)]
  }

  function barkRandom(category, sx, sy, opts) {
    const key = pickPool(category)
    if (!key) return 0
    return say(key, sx, sy, opts)
  }

  // Robot bark: per-robot cooldown so a chase doesn't spam the announcer.
  // The robot object is expected to expose `lastBarkAt`.
  function bark(category, robot) {
    if (!robot) return 0
    const now = engine.time()
    if (robot.lastBarkAt && now - robot.lastBarkAt < 4) return 0
    robot.lastBarkAt = now
    return barkRandom(category, robot.x, robot.y, {basePitch: robot.voicePitch || 110})
  }

  return {
    setBusGain,
    busGain: () => busGain,
    say,
    bark,
    barkRandom,
    pickPool,
  }
})()
