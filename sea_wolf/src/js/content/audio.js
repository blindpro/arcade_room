// SEA WOLF audio. Everything sits on a plain STEREO field that maps directly
// onto the forward arc: pan = bearing / 90, so a ship hard to port is hard
// left and a ship dead ahead is centred. There is no front/back to confuse,
// which is the whole reason the game is a periscope and not a full circle.
//
// The layers, quietest to loudest:
//   sea        — a low wash under everything, muffled when you are deep
//   aim tone   — a thin continuous tone at YOUR periscope bearing; its pitch
//                rises left-to-right, so you can read your own aim by ear
//   screw beat — one pulse per ship per beat, panned to its bearing, pitched
//                by hull size (tanker low, escort high) and beating faster the
//                faster the ship. This is passive sonar and it never stops.
//   ping/echo  — the transmit, then one bright return per contact after
//                2*range/SOUND_SPEED seconds. Delay IS range.
//   the fight  — tube launch, torpedo run, explosions, depth charges.
content.audio = (() => {
  const K = () => content.constants

  let sea = null          // {s, lp, g} looping sea wash
  let aim = null          // {o, g, p} the periscope tone
  let run = null          // {s, bp, g, p} torpedo run whine
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
  function panOf(bearing) { return K().panOf(bearing) }

  function env(param, t0, {a = 0.005, hold = 0, r = 0.08, peak = 1}) {
    param.cancelScheduledValues(t0)
    param.setValueAtTime(0.0001, t0)
    param.linearRampToValueAtTime(peak, t0 + a)
    param.setValueAtTime(peak, t0 + a + hold)
    param.linearRampToValueAtTime(0.0001, t0 + a + hold + r)
  }

  // One voice, optionally panned. osc -> gain -> panner -> mix.
  function voice({type = 'sine', freq, glideTo, t0, a = 0.004, hold = 0.03, r = 0.08, peak = 0.3, pan = 0, dest}) {
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
      sp.pan.value = K().clamp(pan, -1, 1)
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
      sp.pan.value = K().clamp(pan, -1, 1)
      g.connect(sp).connect(dest || out())
    } else {
      g.connect(dest || out())
    }
    s.start(t0)
    s.stop(t0 + dur + 0.05)
    setTimeout(() => { try { g.disconnect() } catch (e) {} }, (dur + 0.25) * 1000)
  }

  function later(fn, ms) {
    const id = setTimeout(() => {
      pendingTimeouts = pendingTimeouts.filter((x) => x !== id)
      try { fn() } catch (e) {}
    }, ms)
    pendingTimeouts.push(id)
    return id
  }

  // ===========================================================================
  // passive sonar — the screw beat
  // ===========================================================================
  // One pulse per ship per beat. Pitch is the hull (tanker 44 Hz, escort
  // 128 Hz), so type is audible; gain and brightness fall off with range, so
  // distance is audible; pan is the bearing. Deep muffles everything.
  function hum(bearing, range, pitch, escort, muffled) {
    const k = K()
    const close = k.closeness(range)
    const pan = panOf(bearing)
    const t0 = ctx().currentTime
    const duck = muffled ? 0.4 : 1

    // The thump of the engine.
    voice({
      type: escort ? 'square' : 'sine',
      freq: pitch,
      t0,
      a: 0.006,
      hold: escort ? 0.02 : 0.05,
      r: 0.06 + close * 0.10,
      peak: (0.03 + close * 0.13) * duck,
      pan,
    })
    // The wash of the screw over it — brighter and more present up close,
    // which is most of what makes a ship feel near.
    noiseBurst(t0, {
      peak: (0.012 + close * 0.055) * duck,
      dur: 0.09 + close * 0.06,
      cutoff: (escort ? 1400 : 700) * (0.35 + close * 0.9) * (muffled ? 0.4 : 1),
      pan,
      type: 'bandpass',
      q: escort ? 1.6 : 0.9,
    })
  }

  // Sweeping the periscope across a contact's bearing.
  function cross(bearing, escort) {
    const t0 = ctx().currentTime
    const pan = panOf(bearing)
    voice({type: 'square', freq: escort ? 1500 : 1050, t0, a: 0.001, hold: 0.008, r: 0.03, peak: 0.11, pan})
  }

  // ===========================================================================
  // the periscope tone — your own bearing, always audible
  // ===========================================================================
  function startAim() {
    if (aim) return
    const c = ctx()
    const o = c.createOscillator()
    const g = c.createGain()
    const p = c.createStereoPanner()
    o.type = 'triangle'
    o.frequency.value = K().aimPitch(0)
    g.gain.value = 0.0001
    o.connect(g).connect(p).connect(out())
    o.start()
    aim = {o, g, p}
  }
  function stopAim() {
    if (!aim) return
    const a = aim
    const t = ctx().currentTime
    try {
      a.g.gain.cancelScheduledValues(t)
      a.g.gain.setValueAtTime(a.g.gain.value, t)
      a.g.gain.linearRampToValueAtTime(0.0001, t + 0.2)
      setTimeout(() => { try { a.o.stop(); a.g.disconnect(); a.p.disconnect() } catch (e) {} }, 300)
    } catch (e) {}
    aim = null
  }
  // `moving` lifts the tone while you are actually slewing, so the periscope
  // is prominent when you are aiming and stays out of the way when you are not.
  function updateAim(bearing, moving, canFire) {
    if (!aim) return
    const t = ctx().currentTime
    aim.o.frequency.setTargetAtTime(K().aimPitch(bearing), t, 0.02)
    aim.p.pan.setTargetAtTime(panOf(bearing), t, 0.02)
    const base = canFire ? 0.016 : 0.007
    aim.g.gain.setTargetAtTime(moving ? base * 2.4 : base, t, 0.06)
  }

  // ===========================================================================
  // active sonar
  // ===========================================================================
  function pingOut() {
    const t0 = ctx().currentTime
    // The classic transmit: a bright tone that drops away.
    voice({type: 'sine', freq: 1180, glideTo: 940, t0, a: 0.004, hold: 0.10, r: 0.55, peak: 0.30})
    voice({type: 'sine', freq: 2360, t0, a: 0.004, hold: 0.05, r: 0.30, peak: 0.07})
  }

  // A return. Bright, short, panned to the contact — and it lands late in
  // proportion to range, which is the point of the whole mechanic.
  function echo(bearing, range, escort) {
    const k = K()
    const close = k.closeness(range)
    const t0 = ctx().currentTime
    const pan = panOf(bearing)
    voice({
      type: 'sine',
      freq: escort ? 1560 : 1040,
      t0,
      a: 0.002,
      hold: 0.03,
      r: 0.16 + close * 0.10,
      peak: 0.09 + close * 0.20,
      pan,
    })
    noiseBurst(t0, {peak: 0.02 + close * 0.05, dur: 0.10, cutoff: 2600, pan, type: 'bandpass', q: 2.2})
  }

  // ===========================================================================
  // torpedoes
  // ===========================================================================
  function fire(bearing) {
    const t0 = ctx().currentTime
    const pan = panOf(bearing)
    // Compressed air slamming the fish out of the tube.
    noiseBurst(t0, {peak: 0.42, dur: 0.28, cutoff: 620, sweepTo: 160, pan, type: 'lowpass', q: 0.8})
    voice({type: 'sine', freq: 150, glideTo: 55, t0, a: 0.002, hold: 0.04, r: 0.30, peak: 0.34, pan})
  }

  function startRun() {
    if (run) return
    const c = ctx()
    const s = noiseSource()
    const bp = c.createBiquadFilter()
    const g = c.createGain()
    const p = c.createStereoPanner()
    bp.type = 'bandpass'
    bp.frequency.value = 1500
    bp.Q.value = 3.2
    g.gain.value = 0.0001
    s.connect(bp).connect(g).connect(p).connect(out())
    s.start()
    run = {s, bp, g, p}
  }
  function stopRun() {
    if (!run) return
    const r = run
    const t = ctx().currentTime
    try {
      r.g.gain.cancelScheduledValues(t)
      r.g.gain.setValueAtTime(r.g.gain.value, t)
      r.g.gain.linearRampToValueAtTime(0.0001, t + 0.25)
      setTimeout(() => { try { r.s.stop(); r.g.disconnect(); r.bp.disconnect(); r.p.disconnect() } catch (e) {} }, 350)
    } catch (e) {}
    run = null
  }
  // The fish going away from you: the whine thins and quietens with range, so
  // you can hear roughly how far out it is when it hits (or does not).
  function updateRun(bearing, range) {
    if (!run) return
    const t = ctx().currentTime
    const close = K().closeness(range)
    run.p.pan.setTargetAtTime(panOf(bearing), t, 0.05)
    run.g.gain.setTargetAtTime(0.012 + close * 0.05, t, 0.08)
    run.bp.frequency.setTargetAtTime(900 + close * 1500, t, 0.08)
  }

  function hit(bearing, range, escort) {
    const t0 = ctx().currentTime
    const pan = panOf(bearing)
    const close = K().closeness(range)
    const loud = 0.35 + close * 0.45

    // The detonation.
    noiseBurst(t0, {peak: loud, dur: 0.7, cutoff: 2400, sweepTo: 120, pan, type: 'lowpass', q: 0.9})
    voice({type: 'sine', freq: 90, glideTo: 32, t0, a: 0.001, hold: 0.06, r: 0.8, peak: loud})
    // The hull tearing, then going down.
    later(() => {
      const t = ctx().currentTime
      voice({type: 'sawtooth', freq: escort ? 260 : 150, glideTo: escort ? 90 : 44, t0: t, a: 0.05, hold: 0.3, r: 1.4, peak: 0.18, pan})
      noiseBurst(t, {peak: 0.10, dur: 1.6, cutoff: 500, sweepTo: 90, pan, type: 'lowpass', q: 1.2})
    }, 620)
  }

  function torpedoSpent(bearing) {
    const t0 = ctx().currentTime
    voice({type: 'sine', freq: 420, glideTo: 180, t0, a: 0.02, hold: 0.1, r: 0.55, peak: 0.09, pan: panOf(bearing)})
  }

  function fireBlocked(reason) {
    const t0 = ctx().currentTime
    if (reason === 'empty') {
      // Dry tubes: a hollow clack, nothing behind it.
      noiseBurst(t0, {peak: 0.16, dur: 0.05, cutoff: 1800, type: 'bandpass', q: 3})
      noiseBurst(t0 + 0.09, {peak: 0.10, dur: 0.05, cutoff: 1400, type: 'bandpass', q: 3})
    } else {
      voice({type: 'square', freq: 160, t0, a: 0.002, hold: 0.05, r: 0.08, peak: 0.14})
    }
  }

  function reloaded() {
    const t0 = ctx().currentTime
    noiseBurst(t0, {peak: 0.13, dur: 0.09, cutoff: 900, type: 'bandpass', q: 2.4})
    voice({type: 'square', freq: 300, t0: t0 + 0.06, a: 0.003, hold: 0.03, r: 0.09, peak: 0.10})
  }

  // ===========================================================================
  // being hunted
  // ===========================================================================
  // They have you. Two hard tones a fifth apart — deliberately the least
  // pleasant sound in the game.
  function acquired() {
    const t0 = ctx().currentTime
    voice({type: 'sawtooth', freq: 330, t0, a: 0.01, hold: 0.22, r: 0.35, peak: 0.20})
    voice({type: 'sawtooth', freq: 494, t0: t0 + 0.02, a: 0.01, hold: 0.22, r: 0.35, peak: 0.14})
    voice({type: 'sawtooth', freq: 330, t0: t0 + 0.42, a: 0.01, hold: 0.22, r: 0.4, peak: 0.18})
  }

  function lostContact() {
    const t0 = ctx().currentTime
    voice({type: 'sine', freq: 400, glideTo: 560, t0, a: 0.03, hold: 0.14, r: 0.4, peak: 0.14})
  }

  // An escort turning toward you — the sound of being found, panned where it is.
  function escortTurn(bearing) {
    const t0 = ctx().currentTime
    const pan = panOf(bearing)
    voice({type: 'square', freq: 200, glideTo: 420, t0, a: 0.04, hold: 0.16, r: 0.45, peak: 0.16, pan})
    noiseBurst(t0, {peak: 0.09, dur: 0.5, cutoff: 700, sweepTo: 2200, pan, type: 'bandpass', q: 1.1})
  }

  // Charges in the water: the splash, then a long descending whistle that ends
  // in the bang. The whistle is your dive cue and your countdown.
  function chargeSplash(bearing, fallTime) {
    const t0 = ctx().currentTime
    const pan = panOf(bearing)
    noiseBurst(t0, {peak: 0.24, dur: 0.30, cutoff: 4200, sweepTo: 700, pan, type: 'bandpass', q: 0.8})
    const fall = fallTime || K().CHARGE_FALL_TIME
    voice({
      type: 'triangle',
      freq: 900,
      glideTo: 130,
      t0: t0 + 0.12,
      a: 0.06,
      hold: fall * 0.35,
      r: fall * 0.6,
      peak: 0.10,
      pan,
    })
  }

  function chargeDetonate(bearing, proximity, deep) {
    const t0 = ctx().currentTime
    const pan = panOf(bearing)
    const near = K().clamp(proximity, 0, 1)
    const loud = 0.10 + near * (deep ? 0.30 : 0.55)

    noiseBurst(t0, {peak: loud, dur: 0.35 + near * 0.5, cutoff: deep ? 900 : 2200, sweepTo: 90, pan, type: 'lowpass', q: 1.0})
    voice({type: 'sine', freq: 70 + near * 40, glideTo: 28, t0, a: 0.001, hold: 0.05, r: 0.6 + near * 0.5, peak: loud})
    if (near > 0.35) {
      // The hull answering it.
      later(() => {
        const t = ctx().currentTime
        voice({type: 'sawtooth', freq: 190, glideTo: 240, t0: t, a: 0.08, hold: 0.2, r: 0.7, peak: 0.10 * near})
      }, 260)
    }
  }

  function damage() {
    const t0 = ctx().currentTime
    // Rivets and plating under pressure.
    voice({type: 'sawtooth', freq: 520, glideTo: 700, t0, a: 0.01, hold: 0.06, r: 0.35, peak: 0.11})
    noiseBurst(t0 + 0.05, {peak: 0.09, dur: 0.30, cutoff: 3000, sweepTo: 900, type: 'bandpass', q: 2.4})
  }

  // ===========================================================================
  // depth
  // ===========================================================================
  function depthChange(to) {
    const t0 = ctx().currentTime
    if (to === 'deep') {
      // Venting ballast.
      noiseBurst(t0, {peak: 0.26, dur: 1.1, cutoff: 2600, sweepTo: 420, type: 'bandpass', q: 0.7})
      voice({type: 'sine', freq: 240, glideTo: 90, t0, a: 0.05, hold: 0.4, r: 0.9, peak: 0.14})
    } else {
      noiseBurst(t0, {peak: 0.22, dur: 0.9, cutoff: 500, sweepTo: 3000, type: 'bandpass', q: 0.7})
      voice({type: 'sine', freq: 90, glideTo: 260, t0, a: 0.05, hold: 0.35, r: 0.8, peak: 0.13})
    }
  }
  function depthSettled(depth) {
    const t0 = ctx().currentTime
    const f = depth === 'deep' ? 180 : 420
    voice({type: 'square', freq: f, t0, a: 0.004, hold: 0.05, r: 0.10, peak: 0.13})
  }

  function batteryLow() {
    const t0 = ctx().currentTime
    for (let i = 0; i < 2; i++) {
      voice({type: 'square', freq: 620, t0: t0 + i * 0.20, a: 0.003, hold: 0.06, r: 0.10, peak: 0.16})
    }
  }
  function batteryDead() {
    const t0 = ctx().currentTime
    voice({type: 'square', freq: 620, glideTo: 200, t0, a: 0.01, hold: 0.15, r: 0.5, peak: 0.20})
  }

  // ===========================================================================
  // run state
  // ===========================================================================
  function countTone(n) {
    voice({type: 'square', freq: 500 + (3 - n) * 60, t0: ctx().currentTime, a: 0.003, hold: 0.07, r: 0.13, peak: 0.20})
  }
  function dive() {
    const t0 = ctx().currentTime
    // The klaxon: two blasts, then you are on patrol.
    for (let i = 0; i < 2; i++) {
      voice({type: 'sawtooth', freq: 300, glideTo: 380, t0: t0 + i * 0.42, a: 0.03, hold: 0.22, r: 0.14, peak: 0.22})
      voice({type: 'sawtooth', freq: 452, glideTo: 570, t0: t0 + i * 0.42, a: 0.03, hold: 0.22, r: 0.14, peak: 0.12})
    }
  }
  function warning(remaining) {
    const t0 = ctx().currentTime
    if (remaining <= 5) {
      voice({type: 'square', freq: 820, t0, a: 0.002, hold: 0.06, r: 0.09, peak: 0.20})
    } else {
      voice({type: 'square', freq: 640, t0, a: 0.003, hold: 0.07, r: 0.12, peak: 0.18})
      voice({type: 'square', freq: 430, t0: t0 + 0.13, a: 0.003, hold: 0.08, r: 0.14, peak: 0.16})
    }
  }
  function doom(reason) {
    const t0 = ctx().currentTime
    if (reason === 'sunk') {
      // The boat goes down: everything descending at once.
      voice({type: 'sawtooth', freq: 300, glideTo: 34, t0, a: 0.02, hold: 0.2, r: 1.8, peak: 0.30})
      voice({type: 'sine', freq: 120, glideTo: 26, t0, a: 0.02, hold: 0.2, r: 2.0, peak: 0.30})
      noiseBurst(t0, {peak: 0.28, dur: 1.9, cutoff: 1800, sweepTo: 90, type: 'lowpass', q: 1.0})
    } else if (reason === 'empty') {
      noiseBurst(t0, {peak: 0.16, dur: 0.06, cutoff: 1800, type: 'bandpass', q: 3})
      voice({type: 'square', freq: 400, glideTo: 260, t0: t0 + 0.12, a: 0.01, hold: 0.1, r: 0.4, peak: 0.16})
    } else {
      voice({type: 'square', freq: 560, t0, a: 0.003, hold: 0.1, r: 0.14, peak: 0.20})
      voice({type: 'square', freq: 560, t0: t0 + 0.22, a: 0.003, hold: 0.2, r: 0.2, peak: 0.20})
    }
  }
  function gameOver() {
    const t0 = ctx().currentTime
    const notes = [294, 247, 196, 147]
    notes.forEach((f, i) => {
      voice({type: 'triangle', freq: f, t0: t0 + i * 0.26, a: 0.03, hold: 0.14, r: 0.6, peak: 0.20})
      voice({type: 'sine', freq: f / 2, t0: t0 + i * 0.26, a: 0.03, hold: 0.14, r: 0.6, peak: 0.14})
    })
  }

  // ---- menu / ui ----
  function menuMove() { noiseBurst(ctx().currentTime, {peak: 0.12, dur: 0.03, cutoff: 1800}) }
  function menuSelect() {
    const t0 = ctx().currentTime
    voice({type: 'sine', freq: 392, t0, a: 0.004, hold: 0.04, r: 0.11, peak: 0.20})
    voice({type: 'sine', freq: 587, t0: t0 + 0.07, a: 0.004, hold: 0.05, r: 0.15, peak: 0.16})
  }
  function menuBack() {
    const t0 = ctx().currentTime
    voice({type: 'sine', freq: 440, t0, a: 0.004, hold: 0.04, r: 0.11, peak: 0.17})
    voice({type: 'sine', freq: 294, t0: t0 + 0.07, a: 0.004, hold: 0.05, r: 0.15, peak: 0.15})
  }

  // ===========================================================================
  // the sea — a wash under everything that closes up when you go deep
  // ===========================================================================
  function startAmbient() {
    if (sea) return
    const c = ctx()
    const s = noiseSource()
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 420
    lp.Q.value = 0.6
    const g = c.createGain()
    g.gain.value = 0.0001
    s.connect(lp).connect(g).connect(out())
    s.start()
    sea = {s, lp, g}
  }
  function stopAmbient() {
    if (!sea) return
    const a = sea
    const t0 = ctx().currentTime
    try {
      a.g.gain.cancelScheduledValues(t0)
      a.g.gain.setValueAtTime(a.g.gain.value, t0)
      a.g.gain.linearRampToValueAtTime(0.0001, t0 + 0.3)
      setTimeout(() => { try { a.s.stop(); a.g.disconnect(); a.lp.disconnect() } catch (e) {} }, 400)
    } catch (e) {}
    sea = null
  }

  // Pumped every frame: the sea darkens as you dive, and the whole bed tightens
  // when the escorts have you.
  function frame(delta, {depth, noise} = {}) {
    if (!sea) return
    const t = ctx().currentTime
    const deep = depth === 'deep' || depth === 'diving'
    sea.g.gain.setTargetAtTime(deep ? 0.030 : 0.020, t, 0.4)
    sea.lp.frequency.setTargetAtTime(deep ? 170 : 460 + (noise || 0) * 220, t, 0.4)
  }

  function silenceAll() {
    for (const id of pendingTimeouts) clearTimeout(id)
    pendingTimeouts = []
    stopAmbient()
    stopAim()
    stopRun()
  }

  // ---- learn-the-sounds cues ----
  function sample(which) {
    const k = K()
    const L = -k.ARC_HALF * 0.7
    const R = k.ARC_HALF * 0.7
    switch (which) {
      case 'humLeft': hum(L, 700, k.SHIP_TYPES.freighter.hum, false, false); break
      case 'humAhead': hum(0, 700, k.SHIP_TYPES.freighter.hum, false, false); break
      case 'humRight': hum(R, 700, k.SHIP_TYPES.freighter.hum, false, false); break
      case 'humNear': hum(0, 260, k.SHIP_TYPES.freighter.hum, false, false); break
      case 'humTanker': hum(0, 700, k.SHIP_TYPES.tanker.hum, false, false); break
      case 'humEscort': hum(0, 700, k.SHIP_TYPES.escort.hum, true, false); break
      case 'ping': {
        pingOut()
        later(() => echo(-30, 500, false), k.echoDelay(500) * 1000)
        later(() => echo(25, 1500, false), k.echoDelay(1500) * 1000)
        break
      }
      case 'cross': cross(0, false); break
      case 'fire': fire(0); break
      case 'run': {
        startRun()
        updateRun(0, 200)
        later(() => updateRun(0, 900), 500)
        later(() => updateRun(0, 1600), 1000)
        later(() => stopRun(), 1600)
        break
      }
      case 'hit': hit(-20, 800, false); break
      case 'spent': torpedoSpent(10); break
      case 'acquired': acquired(); break
      case 'escortTurn': escortTurn(35); break
      case 'splash': chargeSplash(0, k.CHARGE_FALL_TIME); break
      case 'detonateNear': chargeDetonate(0, 0.9, false); break
      case 'detonateDeep': chargeDetonate(0, 0.9, true); break
      case 'diveDeep': depthChange('deep'); break
      case 'risePeriscope': depthChange('periscope'); break
      case 'battery': batteryLow(); break
      case 'damage': damage(); break
      case 'klaxon': dive(); break
      case 'over': gameOver(); break
    }
  }

  // Stereo field probe. The arc IS the stereo field, so this doubles as a
  // bearing calibration: hard left is 90 to port, centre is dead ahead.
  function testTone(pan, pitch) {
    const t0 = ctx().currentTime
    voice({type: 'triangle', freq: pitch || 440, t0, a: 0.005, hold: 0.18, r: 0.22, peak: 0.26, pan})
  }
  function testDirection(which) {
    const k = K()
    if (which === 'sweep' || which === 'ring') {
      const stops = which === 'sweep'
        ? [-90, -45, 0, 45, 90]
        : [-90, -45, 0, 45, 90, 45, 0, -45]
      stops.forEach((b, i) => {
        later(() => testTone(k.panOf(b), k.aimPitch(b)), i * 420)
      })
    } else if (which === 'w') testTone(-1, k.aimPitch(-90))
    else if (which === 'e') testTone(1, k.aimPitch(90))
    else testTone(0, k.aimPitch(0))
  }

  return {
    setStaticListener: function () {}, // stereo — nothing to pin
    hum,
    cross,
    startAim,
    stopAim,
    updateAim,
    pingOut,
    echo,
    fire,
    startRun,
    stopRun,
    updateRun,
    hit,
    torpedoSpent,
    fireBlocked,
    reloaded,
    acquired,
    lostContact,
    escortTurn,
    chargeSplash,
    chargeDetonate,
    damage,
    depthChange,
    depthSettled,
    batteryLow,
    batteryDead,
    countTone,
    dive,
    warning,
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
    later,
  }
})()
