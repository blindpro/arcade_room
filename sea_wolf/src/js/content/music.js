// SEA WOLF has no tune. A submarine hunt is a listening game, and anything
// melodic would sit exactly where the screw beats and the echoes need to be —
// so this is a tension bed, not music: a low drone plus a slow heartbeat that
// only becomes audible as the escorts close on you.
//
// `intensity` in [0,1] is the boat's noise signature (how well they have you),
// pushed in by the game screen every frame. At 0 you hear almost nothing; at 1
// the drone has grown a dissonant second voice and the pulse is fast enough to
// feel like the boat's own heartbeat. Same start/stop/update/setIntensity API
// as the collection's other music modules so the screen wiring is unchanged.
content.music = (() => {
  const LOOKAHEAD = 0.2

  let running = false
  let intensity = 0
  let nextPulse = 0
  let bed = null // {gain, lp, low, fifth, lowGain, fifthGain}

  function ctx() { return engine.context() }
  function out() { return engine.mixer.input() }

  // Pulse period: a slow 2.4s at rest tightening to 0.62s when they are on top
  // of you.
  function pulseInterval() { return 2.4 - intensity * 1.78 }

  function ensureBed() {
    if (bed) return bed
    const c = ctx()

    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 260
    lp.Q.value = 0.5

    const gain = c.createGain()
    gain.gain.value = 0.0001
    lp.connect(gain).connect(out())

    // The drone: a low D, plus a tritone above it that only fades in when they
    // have you. The interval is the tell — consonant means you are still a
    // ghost, sour means they are hunting.
    const low = c.createOscillator()
    low.type = 'sine'
    low.frequency.value = 36.7 // D1
    const lowGain = c.createGain()
    lowGain.gain.value = 0.5
    low.connect(lowGain).connect(lp)
    low.start()

    const fifth = c.createOscillator()
    fifth.type = 'sine'
    fifth.frequency.value = 51.9 // G#1 — a tritone over the D
    const fifthGain = c.createGain()
    fifthGain.gain.value = 0.0001
    fifth.connect(fifthGain).connect(lp)
    fifth.start()

    bed = {gain, lp, low, fifth, lowGain, fifthGain}
    return bed
  }

  // One beat of the heartbeat: a soft thud in the hull.
  function pulse(t) {
    const c = ctx()
    const b = ensureBed()
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(88, t)
    o.frequency.exponentialRampToValueAtTime(40, t + 0.16)
    const peak = 0.10 + intensity * 0.42
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(peak, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.30)
    o.connect(g).connect(b.lp)
    o.start(t)
    o.stop(t + 0.35)
  }

  function update() {
    if (!running) return
    const c = ctx()
    const now = c.currentTime
    const b = ensureBed()

    while (nextPulse < now + LOOKAHEAD) {
      pulse(nextPulse)
      nextPulse += pulseInterval()
    }

    // Everything else tracks intensity smoothly so there is no step when the
    // hunt state flips.
    b.gain.gain.setTargetAtTime(0.05 + intensity * 0.16, now, 0.6)
    b.lp.frequency.setTargetAtTime(200 + intensity * 340, now, 0.6)
    b.fifthGain.gain.setTargetAtTime(0.0001 + intensity * 0.34, now, 0.8)
  }

  function start() {
    const c = ctx()
    running = true
    intensity = 0
    nextPulse = c.currentTime + 0.1
    const b = ensureBed()
    b.gain.gain.cancelScheduledValues(c.currentTime)
    b.gain.gain.setValueAtTime(0.0001, c.currentTime)
    b.gain.gain.setTargetAtTime(0.05, c.currentTime, 0.8)
  }

  function setIntensity(v) { intensity = Math.max(0, Math.min(1, v || 0)) }

  function stop() {
    running = false
    if (!bed) return
    const c = ctx()
    const t = c.currentTime
    try {
      bed.gain.gain.cancelScheduledValues(t)
      bed.gain.gain.setValueAtTime(bed.gain.gain.value, t)
      bed.gain.gain.linearRampToValueAtTime(0.0001, t + 0.4)
      bed.fifthGain.gain.setTargetAtTime(0.0001, t, 0.2)
    } catch (e) {}
  }

  return {start, stop, update, setIntensity, isOn: () => running}
})()
