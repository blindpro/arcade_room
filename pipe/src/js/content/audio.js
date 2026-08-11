// PIPE audio: retro chiptune over a plain STEREO field (no binaural). The
// listener IS the player in the pipe, so every cue is panned by the lane
// offset (dx) of whatever you're aiming for, and loudened by how far ahead it
// is. The next ring's opening is marked by a hum that pings at its centre:
// off to one side it sits in that ear, and the pings tighten into a flutter as
// you reach it — steer until it is dead ahead. When a new ring becomes the
// target, its left and right edges sweep so you hear how wide the opening is.
// The forward motion itself is a sawtooth drone whose pitch and "vibrating"
// tremble grow with your speed, and the drone leans slightly the way you
// steer. Slamming into a wall is a metallic clang; the bonus cavern sprinkles
// items that whisper at the pitch of their points, and collecting one is a
// chime that rises with its value.
//
// Pan convention: +dx = to your right. Pan = clamp(dx / halfPipe, -1, 1) so the
// pipe walls sit hard left/right and the centre is dead ahead.
content.audio = (() => {
  const K = () => content.constants

  let flight = null
  let pendingTimeouts = []
  let curLevel = 1

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
  function panOf(dx, level) {
    const half = 0.5 * K().pipeLanes(level || curLevel)
    return Math.max(-1, Math.min(1, dx / Math.max(1, half)))
  }
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
  // the ring opening
  // ===========================================================================

  // A new ring is the target: sweep its left edge, then its right edge, then a
  // confirming centre chirp. A wide opening reads as two clicks far apart; a
  // narrow one as two clicks huddled around the centre.
  function ringReveal(dx, left, right, width, dist, level) {
    const t0 = ctx().currentTime
    const panL = panOf(left, level)
    const panR = panOf(right, level)
    const panC = panOf(dx, level)
    // the left edge
    voice({type: 'square', freq: 700, t0, a: 0.002, hold: 0.01, r: 0.05, peak: 0.14, pan: panL})
    noiseBurst(t0, {peak: 0.08, dur: 0.04, cutoff: 2600, pan: panL, type: 'highpass'})
    // the right edge, a beat later — the gap between the two is the width
    const tr = t0 + 0.13
    voice({type: 'square', freq: 700, t0: tr, a: 0.002, hold: 0.01, r: 0.05, peak: 0.14, pan: panR})
    noiseBurst(tr, {peak: 0.08, dur: 0.04, cutoff: 2600, pan: panR, type: 'highpass'})
    // the centre: pitch rises with width so a big gap sounds airy, a small one tight
    const w = Math.max(1, width)
    voice({type: 'triangle', freq: 300 + w * 22, glideTo: 480 + w * 18, t0: t0 + 0.26, a: 0.004, hold: 0.1, r: 0.22, peak: 0.2, pan: panC})
    voice({type: 'sine', freq: 120 + w * 8, t0: t0 + 0.26, a: 0.004, hold: 0.12, r: 0.3, peak: 0.22, pan: panC})
  }

  // The hum: pings at the opening's centre, tighter and louder the nearer you
  // get. Off-centre it is duller; centred it gains a bright octave so dead-ahead
  // is unmistakable.
  function hum(dx, dist, width, level) {
    const prox = K().proximity(dist, K().APPROACH_SPAN)
    const pan = panOf(dx, level)
    const centred = Math.max(0, 1 - Math.abs(dx) / 2)
    const base = 300 + Math.min(40, width * 6)
    const t0 = ctx().currentTime
    voice({type: 'square', freq: base, t0, a: 0.002, hold: 0.02, r: 0.05 + prox * 0.03, peak: 0.05 + prox * 0.17, pan})
    if (centred > 0.35) {
      voice({type: 'triangle', freq: base * 2, t0, a: 0.002, hold: 0.015, r: 0.04, peak: (0.03 + prox * 0.09) * centred, pan})
    }
  }

  // Passing cleanly through a ring: a bright "through the gap" whoosh + a rise.
  function pass(width, level, dx) {
    const t0 = ctx().currentTime
    const pan = panOf(dx || 0, level)
    noiseBurst(t0, {peak: 0.12, dur: 0.14, cutoff: 3200, sweepTo: 5200, pan, type: 'bandpass', q: 1.2})
    const base = 392 + Math.min(160, width * 10)
    ;[base, base * 1.25, base * 1.5].forEach((f, i) => {
      voice({type: 'square', freq: f, t0: t0 + 0.03 + i * 0.05, a: 0.003, hold: 0.05, r: 0.16, peak: 0.15, pan})
    })
  }

  // Slam! A metallic clang (you hit the wall) and a backward whoosh (you're
  // thrown back past the ring to re-approach it).
  function slam(lives, dx, level) {
    const t0 = ctx().currentTime
    const pan = panOf(dx || 0, level)
    voice({type: 'sawtooth', freq: 180, glideTo: 45, t0, a: 0.002, hold: 0.05, r: 0.4, peak: 0.5, pan})
    noiseBurst(t0, {peak: 0.35, dur: 0.12, cutoff: 3400, q: 2.5, pan, type: 'bandpass'})
    noiseBurst(t0 + 0.01, {peak: 0.3, dur: 0.28, cutoff: 420, sweepTo: 90, pan, type: 'lowpass'})
    // thrown back: a whoosh that rushes the OPPOSITE way (down in pitch = receding)
    noiseBurst(t0 + 0.12, {peak: 0.16, dur: 0.5, cutoff: 1800, sweepTo: 160, pan, type: 'bandpass', q: 1})
    if (lives > 0) {
      voice({type: 'square', freq: 520, t0: t0 + 0.35, a: 0.004, hold: 0.06, r: 0.2, peak: 0.18, pan: 0})
    } else {
      voice({type: 'square', freq: 220, glideTo: 60, t0: t0 + 0.3, a: 0.01, hold: 0.1, r: 0.5, peak: 0.26, pan: 0})
    }
  }

  // ---- bonus cavern ----

  // The cavern opens: a big airy rush and a sparkle of descending tones.
  function bonusStart(level, count) {
    const t0 = ctx().currentTime
    noiseBurst(t0, {peak: 0.2, dur: 0.9, cutoff: 900, sweepTo: 4200, type: 'bandpass', q: 0.9})
    const seq = [523, 587, 659, 784, 880]
    seq.forEach((f, i) => {
      voice({type: 'triangle', freq: f, t0: t0 + 0.1 + i * 0.09, a: 0.01, hold: 0.18, r: 0.4, peak: 0.16, pan: (i - 2) * 0.18})
    })
    voice({type: 'sine', freq: 65, t0: t0 + 0.1, a: 0.05, hold: 0.9, r: 0.8, peak: 0.18})
  }

  // An item whispers: a soft ping at the pitch of its points, louder the closer
  // it gets, panned to its lane.
  function itemPing(dx, pitch, dist, level) {
    const prox = K().proximity(dist, K().PING_SPAN)
    const t0 = ctx().currentTime
    const pan = panOf(dx, level)
    voice({type: 'triangle', freq: pitch, t0, a: 0.003, hold: 0.02, r: 0.09, peak: 0.03 + prox * 0.09, pan})
  }

  // Collecting an item: a chime that rises with its value.
  function itemCollect(points, pitch, count, level) {
    const t0 = ctx().currentTime
    const pan = panOf(0, level)
    const base = Math.max(150, pitch * 0.5)
    ;[base, base * 1.25, pitch, pitch * 1.5].forEach((f, i) => {
      voice({type: 'square', freq: f, t0: t0 + i * 0.04, a: 0.004, hold: 0.05, r: 0.2, peak: 0.15, pan})
    })
    voice({type: 'triangle', freq: pitch * 2, t0: t0 + 0.02, a: 0.004, hold: 0.03, r: 0.16, peak: 0.09, pan})
    noiseBurst(t0, {peak: 0.05, dur: 0.1, cutoff: 7600, pan, type: 'highpass'})
  }

  // The cavern's end: a fast airy whoosh into the bigger tunnel, then the
  // level-up fanfare follows.
  function bonusEnd(level) {
    const t0 = ctx().currentTime
    noiseBurst(t0, {peak: 0.18, dur: 0.6, cutoff: 600, sweepTo: 5200, type: 'bandpass', q: 1})
    voice({type: 'sine', freq: 160, glideTo: 320, t0, a: 0.02, hold: 0.2, r: 0.5, peak: 0.18})
  }

  // ---- level progression ----
  function levelUp(level, bonus, width) {
    const t0 = ctx().currentTime
    if (bonus) {
      // a rare glittering fanfare announcing the bonus cavern ahead
      const seq = [392, 523, 659, 784, 1047]
      seq.forEach((f, i) => {
        voice({type: 'square', freq: f, t0: t0 + i * 0.07, a: 0.01, hold: 0.08, r: 0.3, peak: 0.16, pan: (i - 2) * 0.15})
      })
      noiseBurst(t0 + 0.3, {peak: 0.1, dur: 0.5, cutoff: 6000, type: 'highpass'})
    } else {
      const seq = [330, 392, 494, 587]
      seq.forEach((f, i) => {
        voice({type: 'square', freq: f, t0: t0 + i * 0.06, a: 0.01, hold: 0.07, r: 0.22, peak: 0.18, pan: (i - 1.5) * 0.18})
      })
    }
  }

  // ---- the flight drone: speed and trajectory, always audible ----
  // A sawtooth drone whose pitch and trembling grow with forward speed, and
  // which leans slightly the way you steer. This is the constant "you are
  // moving fast" sound from the game spec.
  function startFlight() {
    if (flight) return
    const c = ctx()
    const o = c.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = 80
    // vibrato: an LFO on the drone's pitch — its RATE grows with speed
    const vLfo = c.createOscillator()
    vLfo.type = 'sine'
    vLfo.frequency.value = 5
    const vGain = c.createGain()
    vGain.gain.value = 3
    vLfo.connect(vGain).connect(o.frequency)
    // tremble: a slow LFO pulsing the loudness — faster with speed
    const tLfo = c.createOscillator()
    tLfo.type = 'sine'
    tLfo.frequency.value = 3
    const tGain = c.createGain()
    tGain.gain.value = 0.15
    const bed = c.createGain()
    bed.gain.value = 0.0001
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 500
    o.connect(lp).connect(bed)
    tLfo.connect(tGain).connect(bed.gain)
    // a faint air wash that also grows with speed
    const s = noiseSource()
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 400
    bp.Q.value = 0.6
    const ng = c.createGain()
    ng.gain.value = 0.0001
    s.connect(bp).connect(ng)
    // route to output (drone centred; pan shifts are applied in frame())
    bed.connect(out())
    ng.connect(out())
    o.start(); vLfo.start(); tLfo.start(); s.start()
    flight = {o, vLfo, vGain, tLfo, tGain, bed, lp, s, bp, ng}
  }
  function stopFlight() {
    if (!flight) return
    const t0 = ctx().currentTime
    const f = flight
    try {
      f.bed.gain.cancelScheduledValues(t0)
      f.bed.gain.setValueAtTime(f.bed.gain.value, t0)
      f.bed.gain.linearRampToValueAtTime(0.0001, t0 + 0.25)
      f.ng.gain.cancelScheduledValues(t0)
      f.ng.gain.setValueAtTime(f.ng.gain.value, t0)
      f.ng.gain.linearRampToValueAtTime(0.0001, t0 + 0.25)
      setTimeout(() => {
        try { f.o.stop(); f.vLfo.stop(); f.tLfo.stop(); f.s.stop(); f.bed.disconnect(); f.ng.disconnect() } catch (e) {}
      }, 320)
    } catch (e) {}
    flight = null
  }
  function frame(delta, speed, steerDir) {
    if (!flight) return
    const c = ctx(), t = c.currentTime
    const sp = Math.min(1, Math.max(0, (speed || 0) / K().MAX_SPEED))
    const base = 80 + sp * 150                      // pitch grows with speed
    flight.o.frequency.setTargetAtTime(base, t, 0.15)
    flight.vLfo.frequency.setTargetAtTime(5 + sp * 14, t, 0.2)     // vibrato rate grows
    flight.vGain.gain.setTargetAtTime(2.5 + sp * 9, t, 0.2)        // vibrato depth grows
    flight.tLfo.frequency.setTargetAtTime(2.5 + sp * 10, t, 0.2)   // tremble faster
    flight.tGain.gain.setTargetAtTime(0.08 + sp * 0.08, t, 0.2)
    flight.bed.gain.setTargetAtTime(0.03 + sp * 0.08, t, 0.2)
    flight.lp.frequency.setTargetAtTime(320 + sp * 1400, t, 0.2)
    flight.ng.gain.setTargetAtTime(0.008 + sp * 0.03, t, 0.25)
    flight.bp.frequency.setTargetAtTime(300 + sp * 900, t, 0.25)
  }

  // ---- run state ----
  function setLevel(level) { curLevel = Math.max(1, level | 0) || 1 }
  function countTone(n) {
    voice({type: 'square', freq: 660 + (3 - n) * 40, t0: ctx().currentTime, a: 0.003, hold: 0.06, r: 0.12, peak: 0.22})
  }
  function dive() {
    const t0 = ctx().currentTime
    voice({type: 'square', freq: 220, glideTo: 900, t0, a: 0.02, hold: 0.05, r: 0.3, peak: 0.28})
    voice({type: 'triangle', freq: 440, glideTo: 1760, t0: t0 + 0.01, a: 0.02, hold: 0.04, r: 0.25, peak: 0.12})
    noiseBurst(t0, {peak: 0.18, dur: 0.5, cutoff: 900, sweepTo: 5200, pan: 0, type: 'bandpass', q: 1.2})
  }

  // ---- the end ----
  function doom(reason) {
    const t0 = ctx().currentTime
    if (reason === 'lives') {
      voice({type: 'sawtooth', freq: 900, glideTo: 50, t0, a: 0.01, hold: 0.05, r: 1.1, peak: 0.32})
      noiseBurst(t0, {peak: 0.24, dur: 0.9, cutoff: 3000, sweepTo: 200, type: 'bandpass', q: 1})
      voice({type: 'sine', freq: 120, glideTo: 34, t0: t0 + 0.05, a: 0.005, hold: 0.05, r: 0.6, peak: 0.4})
    } else {
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

  function silenceAll() {
    for (const id of pendingTimeouts) clearTimeout(id)
    pendingTimeouts = []
    stopFlight()
  }

  // ---- learn-the-sounds cues ----
  function sample(which) {
    const L = K().pipeLanes(1)
    const X = (L / 2 - 1.5)
    switch (which) {
      case 'ringCentre': ringReveal(0, -1, 1, 3, 60, 1); break
      case 'ringLeft': ringReveal(-X, -X - 1.5, -X + 1.5, 3, 60, 1); break
      case 'ringRight': ringReveal(X, X - 1.5, X + 1.5, 3, 60, 1); break
      case 'ringWide': ringReveal(0, -5, 5, 10, 60, 1); break
      case 'hum': hum(0, 10, 3, 1); break
      case 'humOff': hum(3, 10, 3, 1); break
      case 'pass': pass(3, 1, 0); break
      case 'slam': slam(2, 0, 1); break
      case 'levelUp': levelUp(2, false, 4); break
      case 'bonus': bonusStart(10, 16); break
      case 'itemPing': itemPing(X * 0.7, 500, 30, 10); break
      case 'itemCollect': itemCollect(500, 500, 500, 10); break
      case 'dive': dive(); break
      case 'over': gameOver(); break
    }
  }

  // Stereo field probe: left / centre / right + a sweep, plus a flight-drone
  // preview so the movement sound can be tuned by ear.
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
    else if (which === 'flight') {
      startFlight()
      frame(0, K().MAX_SPEED * 0.6, 1)
      const id = setTimeout(() => { stopFlight() }, 1400)
      pendingTimeouts.push(id)
    }
  }

  return {
    setStaticListener: function () {}, // stereo — nothing to pin
    setLevel,
    ringReveal,
    hum,
    pass,
    slam,
    bonusStart,
    itemPing,
    itemCollect,
    bonusEnd,
    levelUp,
    startFlight,
    stopFlight,
    frame,
    countTone,
    dive,
    doom,
    gameOver,
    menuMove,
    menuSelect,
    menuBack,
    silenceAll,
    sample,
    testDirection,
  }
})()
