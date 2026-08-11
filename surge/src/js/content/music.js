// SURGE music: a generative chiptune bed that adapts to the environment AND
// the pace. Each environment has its own scale, tempo range and groove — the
// city is a driving synthwave vamp, the desert a sparse modal dust-bowl, the
// volcano a fast minor hammer, the tundra a cold echo, space a wide ambient
// shimmer, and the sewer a murky low drone. Intensity (0..1) from speed
// drives tempo, layers and brightness. Sixteenth-note sequencer scheduled on
// the audio clock with a short lookahead so frame jitter never gaps.
content.music = (() => {
  const LOOKAHEAD = 0.16
  const STEPS = 16

  // A–A mixolydian-ish rows as midi offsets from root, for the arp voices.
  const SCALES = {
    city:   [0, 2, 3, 5, 7, 8, 10],     // A minor, airy on the top
    desert: [0, 2, 4, 7, 9],            // A major pentatonic (modal)
    volcano:[0, 1, 3, 5, 7, 8, 10],     // D harmonic minor
    tundra: [0, 3, 5, 7, 10],           // E minor pentatonic
    space:  [0, 5, 7, 12, 15],          // open fourths — wide and sparse
    sewer:  [0, 2, 3, 5, 7],            // murky natural minor
    jungle: [0, 2, 4, 7, 9],            // warm major pentatonic (pan-pipe)
    ocean:  [0, 3, 5, 7, 10],           // watery minor pentatonic
    neon:   [0, 2, 3, 5, 7, 8, 10],     // bright synthwave minor
    cavern: [0, 1, 3, 6, 7, 9],         // dark, unstable
  }

  const ENVS = {
    city:   {root: 45, bars: [45, 41, 43, 45], major: [false, true, true, false], bpmA: 112, bpmB: 175, leadFrom: 0.22, hatFrom: 0.1, kick: 'four', leadType: 'square'},
    desert: {root: 45, bars: [45, 48, 45, 40], major: [true, false, true, true], bpmA: 88, bpmB: 140, leadFrom: 0.3, hatFrom: 0.25, kick: 'offbeat', leadType: 'triangle'},
    volcano:{root: 38, bars: [38, 40, 38, 39], major: [false, false, false, false], bpmA: 150, bpmB: 195, leadFrom: 0.18, hatFrom: 0.12, kick: 'four', leadType: 'square'},
    tundra: {root: 40, bars: [40, 35, 38, 43], major: [false, false, false, false], bpmA: 66, bpmB: 104, leadFrom: 0.35, hatFrom: 0.4, kick: 'none', leadType: 'triangle'},
    space:  {root: 43, bars: [43, 48, 50, 43], major: [true, true, false, true], bpmA: 72, bpmB: 118, leadFrom: 0.3, hatFrom: 0.5, kick: 'none', leadType: 'sine'},
    sewer:  {root: 38, bars: [38, 38, 41, 38], major: [false, false, false, false], bpmA: 78, bpmB: 112, leadFrom: 0.4, hatFrom: 0.35, kick: 'offbeat', leadType: 'triangle'},
    jungle: {root: 43, bars: [43, 45, 43, 38], major: [true, true, true, false], bpmA: 96, bpmB: 148, leadFrom: 0.28, hatFrom: 0.2, kick: 'offbeat', leadType: 'triangle'},
    ocean:  {root: 41, bars: [41, 44, 41, 48], major: [false, true, false, true], bpmA: 78, bpmB: 122, leadFrom: 0.34, hatFrom: 0.3, kick: 'offbeat', leadType: 'sine'},
    neon:   {root: 45, bars: [45, 48, 45, 43], major: [false, true, false, false], bpmA: 118, bpmB: 176, leadFrom: 0.2, hatFrom: 0.12, kick: 'four', leadType: 'square'},
    cavern: {root: 38, bars: [38, 36, 38, 41], major: [false, false, false, false], bpmA: 70, bpmB: 106, leadFrom: 0.36, hatFrom: 0.35, kick: 'none', leadType: 'triangle'},
  }

  let running = false
  let step = 0
  let bar = 0
  let nextTime = 0
  let intensity = 0
  let envId = 'city'
  let master = null

  function ctx() { return engine.context() }
  function out() { return engine.mixer.input() }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12) }
  function env() { return ENVS[envId] || ENVS.city }
  function bpm() { const e = env(); return Math.min(e.bpmB, e.bpmA + intensity * (e.bpmB - e.bpmA)) }
  function stepDur() { return (60 / bpm()) / 4 }

  function ensureMaster() {
    if (master) return master
    const c = ctx()
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 5600
    const gain = c.createGain()
    gain.gain.value = 0.0001
    lp.connect(gain).connect(out())
    master = {gain, lp}
    return master
  }
  function dest() { return ensureMaster().lp }

  function kick(t) {
    const c = ctx()
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(140, t)
    o.frequency.exponentialRampToValueAtTime(46, t + 0.11)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.7, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
    o.connect(g).connect(dest())
    o.start(t); o.stop(t + 0.18)
  }
  let _noise = null
  function noiseBuf() {
    if (_noise) return _noise
    const c = ctx()
    const len = Math.floor(c.sampleRate * 0.5)
    const b = c.createBuffer(1, len, c.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    _noise = b
    return _noise
  }
  function hat(t, peak, open) {
    const c = ctx()
    const s = c.createBufferSource()
    s.buffer = noiseBuf()
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 7600
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(peak, t + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.1 : 0.04))
    s.connect(hp).connect(g).connect(dest())
    s.start(t); s.stop(t + 0.12)
  }
  function bass(t, freq, dur, peak) {
    const c = ctx()
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'square'
    o.frequency.setValueAtTime(freq, t)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(peak || 0.3, t + 0.008)
    g.gain.setValueAtTime(peak || 0.3, t + dur * 0.55)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(dest())
    o.start(t); o.stop(t + dur + 0.03)
  }
  function lead(t, freq, dur, peak, type) {
    const c = ctx()
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = type || 'square'
    o.frequency.setValueAtTime(freq, t)
    if (type === 'sine') o.frequency.exponentialRampToValueAtTime(freq * 1.02, t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(peak, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(dest())
    o.start(t); o.stop(t + dur + 0.03)
  }

  function scheduleStep(s, t) {
    const e = env()
    const b = e.bars[bar % e.bars.length]
    const root = b
    const third = b + (e.major[bar % e.major.length] ? 4 : 3)
    const fifth = b + 7
    const scale = SCALES[envId] || SCALES.city

    // drums
    if (e.kick === 'four' && s % 4 === 0) kick(t)
    else if (e.kick === 'offbeat' && s % 4 === 2) kick(t)
    if (e.kick !== 'none' && s % 8 === 6) kick(t)

    // hats
    const hLvl = e.hatFrom
    if (intensity > hLvl && s % 2 === 0) hat(t, 0.06)
    if (intensity > hLvl + 0.15 && s % 2 === 1) hat(t, 0.03)
    if (intensity > 0.7 && s % 4 === 2) hat(t, 0.04, true)

    // bass — rides the root, picks the fifth at speed
    if (intensity > 0.12) {
      const eighth = (s % 2 === 0)
      if (eighth) {
        const pick = (s % 8 === 2 || s % 8 === 6)
        const note = pick ? (envId === 'space' ? b : b + 7) : b
        bass(t, mtof(note), stepDur() * (pick ? 1.1 : 1.4), envId === 'sewer' ? 0.2 : 0.3)
      }
    }

    // lead arp — chord tones cycling, busier as speed rises
    if (intensity > e.leadFrom) {
      const tones = [root + 12, third + 12, fifth + 12, root + 24]
      const every = intensity > 0.6 ? 1 : 2
      if (s % every === 0) {
        let idx = Math.floor((s / every) * (intensity > 0.6 ? 1 : 0.5)) % tones.length
        const tone = tones[idx]
        // space arps wander the open scale instead
        const freq = envId === 'space' ? mtof(b + 12 + scale[s % scale.length]) : mtof(tone)
        lead(t, freq, stepDur() * (every === 1 ? 1.1 : 1.5), 0.05 + intensity * 0.04, e.leadType)
      }
    }

    if (s === STEPS - 1) bar = (bar + 1) % 1000000
  }

  function update() {
    if (!running) return
    const now = ctx().currentTime
    if (nextTime < now - 0.25) nextTime = now + 0.05
    while (nextTime < now + LOOKAHEAD) {
      scheduleStep(step, nextTime)
      step = (step + 1) % STEPS
      nextTime += stepDur()
    }
    const m = ensureMaster()
    const target = Math.min(0.2, 0.08 + intensity * 0.1)
    m.gain.gain.setTargetAtTime(target, now, 0.4)
    m.lp.frequency.setTargetAtTime(3200 + intensity * 3600, now, 0.3)
  }

  function start() {
    const c = ctx()
    running = true
    step = 0
    bar = 0
    intensity = 0
    nextTime = c.currentTime + 0.08
    const m = ensureMaster()
    m.gain.gain.cancelScheduledValues(c.currentTime)
    m.gain.gain.setValueAtTime(0.0001, c.currentTime)
    m.gain.gain.setTargetAtTime(0.1, c.currentTime, 0.5)
  }
  function setIntensity(v) { intensity = Math.max(0, Math.min(1, v || 0)) }
  function setEnv(id) { if (ENVS[id]) envId = id }
  function stop() {
    running = false
    if (!master) return
    const c = ctx()
    const t = c.currentTime
    try {
      master.gain.gain.cancelScheduledValues(t)
      master.gain.gain.setValueAtTime(master.gain.gain.value, t)
      master.gain.gain.linearRampToValueAtTime(0.0001, t + 0.35)
    } catch (e) {}
  }

  return {start, stop, update, setIntensity, setEnv, isOn: () => running}
})()
