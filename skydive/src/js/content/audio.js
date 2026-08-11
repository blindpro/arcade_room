// SKYDIVE audio: retro chiptune over a plain STEREO field (no binaural — there
// is no facing direction to anchor). The listener IS the player, so every cue
// is panned left/right by the crystal's horizontal offset and loudened by how
// close you are to it: the beacon crystal you are falling toward ticks at its
// own pitch, the higher the pitch the higher it will lift you; steer until it
// is centred (dead ahead), and it tightens and grows as you reach it. The other
// nearby crystals whisper behind it so you can hear a better-pitch crystal and
// steer for it. Collecting one fires a chiptune pickup and resets your fall.
//
// Pan convention: screen-x is the player's corridor, +x = right. StereoPanner
// pan = clamp(dx / PAN_SCALE, -1, 1) so an edge-to-edge offset reads hard L/R.
content.audio = (() => {
  const K = () => content.constants

  let ambient = null
  let pendingTimeouts = []

  function ctx() { return engine.context() }
  function out() { return engine.mixer.input() }

  // ---- shared noise buffer ----
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

  // ---- helpers ----
  function panOf(dx) { return Math.max(-1, Math.min(1, dx / K().PAN_SCALE)) }
  function env(param, t0, {a = 0.005, hold = 0, r = 0.08, peak = 1}) {
    param.cancelScheduledValues(t0)
    param.setValueAtTime(0.0001, t0)
    param.linearRampToValueAtTime(peak, t0 + a)
    param.setValueAtTime(peak, t0 + a + hold)
    param.linearRampToValueAtTime(0.0001, t0 + a + hold + r)
  }

  // One chiptune voice, optionally panned. Connects osc -> gain -> panner -> mix.
  function voice({type = 'square', freq, glideTo, t0, a = 0.004, hold = 0.03, r = 0.08, peak = 0.3, pan = 0, dest}) {
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
      g.connect(sp).connect(dest || out())
    } else {
      g.connect(dest || out())
    }
    o.start(t0)
    o.stop(t0 + a + hold + r + 0.05)
  }

  function noiseBurst(t0, {peak = 0.25, dur = 0.06, cutoff = 3200, pan = 0, type = 'lowpass', q = 0.7, sweepTo = 0, dest} = {}) {
    const c = ctx()
    const s = noiseSource()
    const f = c.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(cutoff, t0)
    f.Q.value = q
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t0 + dur)
    const g = c.createGain()
    env(g.gain, t0, {a: 0.002, hold: 0, r: dur, peak})
    s.connect(f).connect(g)
    if (pan !== 0) {
      const sp = c.createStereoPanner()
      sp.pan.value = Math.max(-1, Math.min(1, pan))
      g.connect(sp).connect(dest || out())
    } else {
      g.connect(dest || out())
    }
    s.start(t0)
    s.stop(t0 + dur + 0.05)
    setTimeout(() => { try { g.disconnect() } catch (e) {} }, (dur + 0.25) * 1000)
  }

  // ===========================================================================
  // crystal cues (all panned by horizontal offset)
  // ===========================================================================

  // The beacon you are falling toward. Loudness and tightness scale with how
  // far below the crystal sits; the pitch is the crystal's own.
  function crystalTick(dx, below, pitch) {
    const prox = K().proximity(below, K().CRYSTAL_BAND)
    const pan = panOf(dx)
    const t0 = ctx().currentTime
    voice({type: 'square', freq: pitch, t0, a: 0.002, hold: 0.015, r: 0.05 + prox * 0.03, peak: 0.05 + prox * 0.16, pan})
    voice({type: 'triangle', freq: pitch * 2, t0, a: 0.002, hold: 0.008, r: 0.04, peak: 0.03 + prox * 0.08, pan})
  }

  // A nearby non-target crystal, whispering its own (possibly higher) pitch.
  function crystalPing(dx, below, pitch) {
    const prox = K().proximity(below, K().PING_SPAN)
    const pan = panOf(dx)
    const t0 = ctx().currentTime
    voice({type: 'triangle', freq: pitch, t0, a: 0.003, hold: 0.012, r: 0.07, peak: 0.035 + prox * 0.07, pan})
  }

  // The beacon just switched to a new crystal — a quick chirp up to its pitch.
  function retarget(dx, pitch) {
    const t0 = ctx().currentTime
    const pan = panOf(dx)
    voice({type: 'square', freq: Math.max(60, pitch * 0.5), glideTo: pitch, t0, a: 0.003, hold: 0.02, r: 0.1, peak: 0.2, pan})
    voice({type: 'triangle', freq: pitch, t0: t0 + 0.05, a: 0.003, hold: 0.02, r: 0.12, peak: 0.14, pan})
  }

  // A pickup: rising chiptune arpeggio peaking at the crystal's pitch.
  function collect(dx, pitch) {
    const t0 = ctx().currentTime
    const pan = panOf(dx)
    const base = Math.max(180, pitch / 2)
    ;[base, base * 1.25, base * 1.5, pitch].forEach((f, i) => {
      voice({type: 'square', freq: f, t0: t0 + i * 0.045, a: 0.004, hold: 0.05, r: 0.22, peak: 0.16, pan})
    })
    voice({type: 'triangle', freq: pitch * 2, t0: t0 + 0.02, a: 0.004, hold: 0.03, r: 0.18, peak: 0.08, pan})
    noiseBurst(t0, {peak: 0.05, dur: 0.12, cutoff: 7000, pan, type: 'highpass'})
  }

  // ---- countdown / run state ----
  function countTone(n) {
    voice({type: 'square', freq: 660 + (3 - n) * 40, t0: ctx().currentTime, a: 0.003, hold: 0.06, r: 0.12, peak: 0.22})
  }
  function dive() {
    const t0 = ctx().currentTime
    voice({type: 'square', freq: 220, glideTo: 900, t0, a: 0.02, hold: 0.05, r: 0.3, peak: 0.28})
    voice({type: 'triangle', freq: 440, glideTo: 1760, t0: t0 + 0.01, a: 0.02, hold: 0.04, r: 0.25, peak: 0.12})
    noiseBurst(t0, {peak: 0.18, dur: 0.5, cutoff: 900, sweepTo: 5200, pan: 0, type: 'bandpass', q: 1.2})
  }

  // ---- time warnings ----
  function warning(remaining) {
    const t0 = ctx().currentTime
    if (remaining <= 5) {
      voice({type: 'square', freq: 880, t0, a: 0.002, hold: 0.06, r: 0.08, peak: 0.24})
      voice({type: 'square', freq: 880, t0: t0 + 0.16, a: 0.002, hold: 0.06, r: 0.1, peak: 0.24})
    } else {
      voice({type: 'square', freq: 740, t0, a: 0.003, hold: 0.07, r: 0.12, peak: 0.22})
      voice({type: 'square', freq: 494, t0: t0 + 0.12, a: 0.003, hold: 0.08, r: 0.14, peak: 0.2})
    }
  }

  // ---- the end ----
  function ground() {
    const t0 = ctx().currentTime
    voice({type: 'sine', freq: 140, glideTo: 38, t0, a: 0.001, hold: 0.05, r: 0.5, peak: 0.5})
    noiseBurst(t0, {peak: 0.4, dur: 0.4, cutoff: 2400, sweepTo: 150, type: 'lowpass', q: 0.9})
  }
  function doom(reason) {
    if (reason === 'crash') {
      // the plummet
      const t0 = ctx().currentTime
      voice({type: 'sawtooth', freq: 1200, glideTo: 70, t0, a: 0.01, hold: 0.05, r: 1.0, peak: 0.3})
      noiseBurst(t0, {peak: 0.2, dur: 1.0, cutoff: 3000, sweepTo: 300, type: 'bandpass', q: 1})
      ground()
    } else {
      // time's up
      const t0 = ctx().currentTime
      voice({type: 'square', freq: 660, t0, a: 0.003, hold: 0.1, r: 0.14, peak: 0.22})
      voice({type: 'square', freq: 660, t0: t0 + 0.2, a: 0.003, hold: 0.2, r: 0.2, peak: 0.22})
    }
  }
  function gameOver() {
    const t0 = ctx().currentTime
    const notes = [523, 415, 330, 262]
    notes.forEach((f, i) => {
      voice({type: 'square', freq: f, t0: t0 + i * 0.22, a: 0.02, hold: 0.1, r: 0.5, peak: 0.2})
      voice({type: 'triangle', freq: f / 2, t0: t0 + i * 0.22, a: 0.02, hold: 0.1, r: 0.5, peak: 0.12})
    })
  }

  // ---- menu / ui ----
  function menuMove() { noiseBurst(ctx().currentTime, {peak: 0.14, dur: 0.03, cutoff: 2400}) }
  function menuSelect() {
    const t0 = ctx().currentTime
    voice({type: 'square', freq: 523, t0, a: 0.004, hold: 0.03, r: 0.1, peak: 0.2})
    voice({type: 'square', freq: 784, t0: t0 + 0.07, a: 0.004, hold: 0.04, r: 0.14, peak: 0.18})
  }
  function menuBack() {
    const t0 = ctx().currentTime
    voice({type: 'square', freq: 494, t0, a: 0.004, hold: 0.03, r: 0.1, peak: 0.18})
    voice({type: 'square', freq: 330, t0: t0 + 0.07, a: 0.004, hold: 0.04, r: 0.14, peak: 0.16})
  }

  // ---- the wind: a looping wash that swells with fall speed ----
  function startAmbient() {
    if (ambient) return
    const c = ctx()
    const s = noiseSource()
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 480
    bp.Q.value = 0.7
    const ng = c.createGain()
    ng.gain.value = 0.0001
    s.connect(bp).connect(ng).connect(out())
    s.start()
    ambient = {s, bp, ng}
  }
  function stopAmbient() {
    if (!ambient) return
    const t0 = ctx().currentTime
    const a = ambient
    try {
      a.ng.gain.cancelScheduledValues(t0)
      a.ng.gain.setValueAtTime(a.ng.gain.value, t0)
      a.ng.gain.linearRampToValueAtTime(0.0001, t0 + 0.3)
      setTimeout(() => { try { a.s.stop(); a.ng.disconnect(); a.bp.disconnect() } catch (e) {} }, 400)
    } catch (e) {}
    ambient = null
  }
  function frame(delta, fallSpeed) {
    if (!ambient) return
    const c = ctx(), t = c.currentTime
    const sp = Math.min(1, Math.abs(fallSpeed || 0) / K().MAX_FALL_SPEED)
    ambient.ng.gain.setTargetAtTime(0.014 + sp * 0.05, t, 0.25)
    ambient.bp.frequency.setTargetAtTime(380 + sp * 1300, t, 0.25)
  }

  function silenceAll() {
    for (const id of pendingTimeouts) clearTimeout(id)
    pendingTimeouts = []
    stopAmbient()
  }

  // ---- learn-the-sounds cues ----
  function sample(which) {
    const X = K().HALF_WIDTH * 0.8
    switch (which) {
      case 'crystalLeft': crystalTick(-X, 45, 480); break
      case 'crystalCentre': crystalTick(0, 45, 480); break
      case 'crystalRight': crystalTick(X, 45, 480); break
      case 'crystalNear': crystalTick(0, 4, 480); break
      case 'crystalHigh': crystalTick(0, 45, 900); break
      case 'ping': crystalPing(X * 0.6, 60, 700); break
      case 'retarget': retarget(X * 0.5, 700); break
      case 'collect': collect(0, 700); break
      case 'warning': warning(10); break
      case 'dive': dive(); break
      case 'crash': doom('crash'); break
      case 'timeup': doom('time'); break
      case 'over': gameOver(); break
    }
  }

  // Stereo field probe: left / centre / right + a sweep. (The game is stereo, so
  // there is no front/behind to verify — this confirms pan mapping by ear.)
  function testTone(pan, pitch) {
    const t0 = ctx().currentTime
    voice({type: 'square', freq: pitch || 480, t0, a: 0.005, hold: 0.16, r: 0.2, peak: 0.28, pan})
    voice({type: 'triangle', freq: (pitch || 480) * 2, t0, a: 0.005, hold: 0.07, r: 0.15, peak: 0.1, pan})
  }
  function testDirection(which) {
    const X = 0.95
    if (which === 'sweep') {
      const order = [[-X, 392], [0, 440], [X, 523]]
      order.forEach((o, i) => {
        const id = setTimeout(() => testTone(o[0], o[1]), i * 460)
        pendingTimeouts.push(id)
      })
    } else if (which === 'ring') {
      const order = [[-X, 392], [0, 440], [X, 523], [0, 523]]
      order.forEach((o, i) => {
        const id = setTimeout(() => testTone(o[0], o[1]), i * 460)
        pendingTimeouts.push(id)
      })
    } else if (which === 'w') testTone(-X, 392)
    else if (which === 'c' || which === 'n' || which === 's') testTone(0, 440)
    else if (which === 'e') testTone(X, 523)
  }

  return {
    setStaticListener: function () {}, // stereo — nothing to pin
    crystalTick,
    crystalPing,
    retarget,
    collect,
    countTone,
    dive,
    warning,
    ground,
    doom,
    gameOver,
    menuMove,
    menuSelect,
    menuBack,
    startAmbient,
    stopAmbient,
    frame,
    silenceAll,
    sample,
    testDirection,
  }
})()
