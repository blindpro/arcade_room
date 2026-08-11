// PIPE music: a driving 8-bit bed that intensifies as your speed rises — the
// faster you fly, the harder the music pushes you to thread the next opening.
// A sixteenth-note sequencer scheduled on the audio clock with a short
// lookahead (frame/setTimeout jitter never causes audible gaps); the game loop
// only refills the queue via update(). Intensity `intensity` in [0,1] comes
// from speed / MAX_SPEED and drives tempo, layers and brightness. Mixed under
// the ring cues so the spatial pings always read on top. Started on game-screen
// enter, stopped on exit (so pausing stops it cleanly). Self-contained: no
// reach into content.audio's privates.
content.music = (() => {
  const LOOKAHEAD = 0.16 // seconds scheduled ahead of the audio clock
  const STEPS = 16       // one bar of sixteenth notes

  // A i–VI–VII–i vamp in A minor, one chord per bar — relentless, like the tunnel.
  const BARS = [
    {root: 45, major: false}, // A minor
    {root: 41, major: true},  // F major
    {root: 43, major: true},  // G major
    {root: 45, major: false}, // A minor
  ]

  let running = false
  let step = 0
  let bar = 0
  let nextTime = 0
  let intensity = 0

  let master = null // {gain, lp}

  function ctx() { return engine.context() }
  function out() { return engine.mixer.input() }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12) }
  function bpm() { return Math.min(180, 112 + intensity * 68) }
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

  // ---- layer voices (all routed through the master bus) ----
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
  function hat(t, peak) {
    const c = ctx()
    const s = c.createBufferSource()
    s.buffer = noiseBuf()
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 7600
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(peak, t + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04)
    s.connect(hp).connect(g).connect(dest())
    s.start(t); s.stop(t + 0.05)
  }

  function bass(t, freq, dur) {
    const c = ctx()
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'square'
    o.frequency.setValueAtTime(freq, t)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.3, t + 0.008)
    g.gain.setValueAtTime(0.3, t + dur * 0.55)
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
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(peak, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(dest())
    o.start(t); o.stop(t + dur + 0.03)
  }

  // ---- the sequencer ----
  function scheduleStep(s, t) {
    const b = BARS[bar % BARS.length]
    const root = b.root
    const thirdM = root + (b.major ? 4 : 3)
    const fifthM = root + 7

    // kick — four on the floor
    if (s % 4 === 0) kick(t)

    // square bass groove, riding the root with the occasional fifth
    if (intensity > 0.15) {
      const eighth = (s % 2 === 0)
      if (eighth) {
        const note = (s % 8 === 2 || s % 8 === 6) ? mtof(fifthM) : mtof(root)
        bass(t, note, stepDur() * 1.4)
      }
    }

    // hats — offbeat eighths early, sixteenths at speed
    if (intensity > 0.05 && s % 2 === 0) hat(t, 0.07)
    if (intensity > 0.5 && s % 2 === 1) hat(t, 0.035)

    // chiptune lead arpeggio — chord tones cycling, busier as you fly faster
    if (intensity > 0.25) {
      const tones = [root + 12, thirdM + 12, fifthM + 12, root + 24]
      const every = intensity > 0.6 ? 1 : 2
      if (s % every === 0) {
        const f = mtof(tones[(s / every) % tones.length] | 0)
        lead(t, f, stepDur() * (every === 1 ? 1.2 : 1.6), 0.06 + intensity * 0.04, intensity > 0.75 ? 'square' : 'triangle')
      }
    }

    if (s === STEPS - 1) bar = (bar + 1) % 1000000
  }

  function update() {
    if (!running) return
    const now = ctx().currentTime
    if (nextTime < now - 0.25) nextTime = now + 0.05 // resync after tab throttling
    while (nextTime < now + LOOKAHEAD) {
      scheduleStep(step, nextTime)
      step = (step + 1) % STEPS
      nextTime += stepDur()
    }
    const m = ensureMaster()
    const target = Math.min(0.22, 0.1 + intensity * 0.1)
    m.gain.gain.setTargetAtTime(target, now, 0.4)
    m.lp.frequency.setTargetAtTime(3600 + intensity * 3600, now, 0.3)
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
    m.gain.gain.setTargetAtTime(0.12, c.currentTime, 0.5)
  }

  function setIntensity(v) { intensity = Math.max(0, Math.min(1, v || 0)) }

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

  return {start, stop, update, setIntensity, isOn: () => running}
})()
