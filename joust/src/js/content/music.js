// JOUST has no tune, and it cannot have one: the entire game is read off
// PITCH, and a melody would put moving notes in exactly the band where riders
// live. So this is a rhythm bed instead — a pulse and a low drone, both well
// clear of the reference at 330 Hz and everything within an octave and a half
// of it.
//
// `intensity` in [0,1] is the threat level: how close the nastiest rider ABOVE
// you is, pushed in by the game screen every frame. At 0 it is a slow heartbeat
// under everything. At 1 the pulse is a gallop and a dissonant partial has
// opened underneath it, so you know something is over you before you have
// finished working out which beat is whose.
//
// Same start/stop/update/setIntensity API as the collection's other music
// modules, so the screen wiring is unchanged.
content.music = (() => {
  const LOOKAHEAD = 0.2

  let running = false
  let intensity = 0
  let nextPulse = 0
  let bed = null // {gain, lp, low, sour, lowGain, sourGain}

  function ctx() { return engine.context() }
  function out() { return engine.mixer.input() }

  // The gallop. 1.5s between beats when nothing is over you, tightening to
  // 0.34s when something is right on top of you.
  function pulseInterval() { return 1.5 - intensity * 1.16 }

  function ensureBed() {
    if (bed) return bed
    const c = ctx()

    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 200
    lp.Q.value = 0.5

    const gain = c.createGain()
    gain.gain.value = 0.0001
    lp.connect(gain).connect(out())

    // An E two octaves below the reference, so the bed is consonant with the
    // pitch scale rather than fighting it.
    const low = c.createOscillator()
    low.type = 'sine'
    low.frequency.value = 82.4 // E2
    const lowGain = c.createGain()
    lowGain.gain.value = 0.5
    low.connect(lowGain).connect(lp)
    low.start()

    // A flat second above it, which only fades in when something is above you.
    // The interval is the tell: clean means the air over your head is clear.
    const sour = c.createOscillator()
    sour.type = 'sine'
    sour.frequency.value = 87.3 // F2
    const sourGain = c.createGain()
    sourGain.gain.value = 0.0001
    sour.connect(sourGain).connect(lp)
    sour.start()

    bed = {gain, lp, low, sour, lowGain, sourGain}
    return bed
  }

  // One beat: a soft hoof-fall.
  function pulse(t) {
    const c = ctx()
    const b = ensureBed()
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(104, t)
    o.frequency.exponentialRampToValueAtTime(46, t + 0.14)
    const peak = 0.09 + intensity * 0.34
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(peak, t + 0.007)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26)
    o.connect(g).connect(b.lp)
    o.start(t)
    o.stop(t + 0.3)
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

    b.gain.gain.setTargetAtTime(0.045 + intensity * 0.13, now, 0.5)
    b.lp.frequency.setTargetAtTime(160 + intensity * 260, now, 0.5)
    b.sourGain.gain.setTargetAtTime(0.0001 + intensity * 0.30, now, 0.7)
  }

  function start() {
    const c = ctx()
    running = true
    intensity = 0
    nextPulse = c.currentTime + 0.1
    const b = ensureBed()
    b.gain.gain.cancelScheduledValues(c.currentTime)
    b.gain.gain.setValueAtTime(0.0001, c.currentTime)
    b.gain.gain.setTargetAtTime(0.045, c.currentTime, 0.8)
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
      bed.sourGain.gain.setTargetAtTime(0.0001, t, 0.2)
    } catch (e) {}
  }

  return {start, stop, update, setIntensity, isOn: () => running}
})()
