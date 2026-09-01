// KOMBAT tension bed.
//
// Two sustained notes and a pulse, and all three of them are driven by ONE
// number: how badly the round is going. It is not a soundtrack — a fighting
// game read by ear cannot afford a busy one, because every voice in the mix is
// a voice competing with the tell. What it is instead is a second opinion on
// the health bars, running quietly enough that you can ignore it and
// consistently enough that you never have to check.
//
// Intensity 0 is "even fight": a slow open fifth. Intensity 1 is "you are one
// hit from losing": the fifth becomes a tritone and the pulse doubles. The
// interval doing the work is the point — you do not have to be listening for it
// to notice it has gone wrong.
content.music = (() => {
  const ROOT = 55        // A1

  let voice = null
  let intensity = 0
  let target = 0
  let pulseT = 0

  function ctx() { return engine.context() }
  function out() { return engine.mixer.output() }
  function now() { return engine.time() }

  function start() {
    if (voice) return
    const c = ctx()

    const gain = c.createGain()
    gain.gain.value = 0.0001
    gain.connect(out())

    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 700
    lp.Q.value = 0.6
    lp.connect(gain)

    const root = c.createOscillator()
    root.type = 'sawtooth'
    root.frequency.value = ROOT
    const rg = c.createGain()
    rg.gain.value = 0.35
    root.connect(rg).connect(lp)
    root.start()

    // The interval that carries the whole reading: a fifth when the fight is
    // even, bent down toward a tritone as it stops being one.
    const upper = c.createOscillator()
    upper.type = 'sawtooth'
    upper.frequency.value = ROOT * 1.5
    const ug = c.createGain()
    ug.gain.value = 0.22
    upper.connect(ug).connect(lp)
    upper.start()

    gain.gain.linearRampToValueAtTime(0.03, now() + 1.5)
    voice = {gain, lp, root, upper, rg, ug}
    intensity = 0
    target = 0
    pulseT = 0
  }

  function stop() {
    if (!voice) return
    const v = voice
    voice = null
    try {
      v.gain.gain.cancelScheduledValues(now())
      v.gain.gain.setTargetAtTime(0.0001, now(), 0.3)
    } catch (e) {}
    setTimeout(() => {
      try { v.root.stop(); v.upper.stop() } catch (e) {}
      try { v.gain.disconnect() } catch (e) {}
    }, 1400)
  }

  // Called each frame from the game screen with the match status.
  function setIntensity(v) {
    target = Math.max(0, Math.min(1, v || 0))
  }

  function update(delta) {
    if (!voice) return
    const d = delta || 1 / 60
    // Slew, so a single exchange does not make the bed lurch.
    intensity += (target - intensity) * Math.min(1, d * 1.5)

    const t = now()
    // 1.5 (a fifth) -> 1.414 (a tritone).
    voice.upper.frequency.setTargetAtTime(ROOT * (1.5 - 0.086 * intensity), t, 0.25)
    voice.lp.frequency.setTargetAtTime(700 + intensity * 1100, t, 0.3)
    voice.gain.gain.setTargetAtTime(0.03 + intensity * 0.025, t, 0.3)

    pulseT -= d
    if (pulseT <= 0) {
      pulseT = 1.15 - intensity * 0.55
      pulse()
    }
  }

  function pulse() {
    const c = ctx(), t0 = now()
    const g = c.createGain()
    g.gain.value = 0
    g.connect(out())
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(ROOT * 2, t0)
    o.frequency.exponentialRampToValueAtTime(ROOT, t0 + 0.12)
    o.connect(g)
    g.gain.linearRampToValueAtTime(0.03 + intensity * 0.04, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2)
    o.start(t0)
    o.stop(t0 + 0.24)
    o.onended = () => { try { g.disconnect() } catch (e) {} }
  }

  return {start, stop, setIntensity, update, isRunning: () => !!voice}
})()
