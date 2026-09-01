// SEA WOLF audio.
//
// Everything positional goes through a syngen BINAURAL EAR, fed listener-local
// coordinates — x forward over the bow, y to starboard — exactly the way
// dogfight places its cars. That is what gives front/back and distance as real
// perceptual cues. The first build of this game used a bare StereoPanner, and
// a panned drone turned out to carry almost no information: you could tell
// left from right and nothing else.
//
// The layers, in order of how much they actually tell you:
//
//   proximity beeps  THE navigation interface. One beep per contact, binaural
//                    at its position, with the GAP BETWEEN BEEPS as the range
//                    (slow and lazy at the edge of hearing, a flutter when it
//                    is alongside) and the PITCH as ahead-or-astern. Escorts
//                    beep on a square wave so a threat never sounds like a
//                    prize. This replaces the old continuous screw hum.
//   own boat         a motor voice whose pitch and rumble track your own
//                    speed, so throttle is audible without looking.
//   close aboard     a continuous screw voice, but only inside
//                    CLOSE_VOICE_RANGE — a permanent drone for every distant
//                    ship is the uninformative wash we just removed, so the
//                    continuous layer is only allowed where it means
//                    something. Set CLOSE_VOICE_RANGE to 0 to switch it off.
//   ping and echoes  the transmit, then one bright return per contact after
//                    2*range/SOUND_SPEED seconds. Delay IS range, and it
//                    reaches further than the passive beeps.
//   the fight        tube launch, torpedo run, explosions - and the escorts'
//                    own torpedoes, which get a harsher, warbling run voice
//                    so an incoming fish is never mistaken for one of yours.
//                    A hostile run is also dulled by how far off your depth
//                    it is set, so as you dive away from one you hear it lose
//                    interest in you.
content.audio = (() => {
  const K = () => content.constants

  let sea = null      // {noise, lp, gain} the sea wash (non-positional)
  let motor = null    // {carrier, sub, noiseGain, lp, gain} your own boat
  const closeVoices = new Map() // contactId -> continuous screw voice
  const runVoices = new Map()   // torpedoId -> running whine
  let pendingTimeouts = []

  function ctx() { return engine.context() }
  function out() { return engine.mixer.output() }
  function now() { return engine.time() }

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

  function later(fn, ms) {
    const id = setTimeout(() => {
      pendingTimeouts = pendingTimeouts.filter((x) => x !== id)
      try { fn() } catch (e) {}
    }, ms)
    pendingTimeouts.push(id)
    return id
  }

  // A binaural ear at a listener-local point. `local` is {forward, starboard}
  // from content.game; syngen wants {x: forward, y: left-positive}, so
  // starboard is negated once, here, and nowhere else.
  function earAt(local, options) {
    const ear = engine.ear.binaural.create(options)
    ear.to(out())
    ear.update({x: local.forward, y: -local.starboard, z: 0})
    return ear
  }
  function moveEar(ear, local) {
    ear.update({x: local.forward, y: -local.starboard, z: 0})
  }

  // ===========================================================================
  // proximity beeps — the navigation interface
  // ===========================================================================
  // Placed binaurally so you can turn the boat until the contact swings to
  // dead ahead. Pitch flips at the beam: forward of you it is bright and
  // high, abaft of you it drops to a low tone. That octave drop is what tells
  // you the convoy has slipped past and you need to come about.
  // `muffled` is 0..1 — how deep the boat is. The passive set gets duller the
  // further under you are, so depth costs you the picture as well as speed.
  function beep(local, range, escort, muffled) {
    const k = K()
    const t0 = now()
    const c = ctx()
    const ahead = local.forward >= 0

    const ear = earAt(local)
    const g = c.createGain()
    g.gain.value = 0
    ear.from(g)

    const o = c.createOscillator()
    o.type = escort ? k.BEEP_ESCORT_TYPE : k.BEEP_MERCHANT_TYPE
    o.frequency.value = ahead ? k.BEEP_AHEAD : k.BEEP_ASTERN
    o.connect(g)

    const dur = 0.10
    // Close contacts are louder, but not by much — the RATE is doing the
    // distance work, so gain only has to keep a far contact audible.
    const peak = (0.16 + k.closeness(range) * 0.22) * k.lerp(1, 0.5, muffled || 0)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(peak, t0 + 0.006)
    g.gain.linearRampToValueAtTime(0, t0 + dur)

    o.start(t0)
    o.stop(t0 + dur + 0.02)
    o.onended = () => {
      try { g.disconnect() } catch (e) {}
      try { ear.destroy() } catch (e) {}
    }
  }

  // ===========================================================================
  // your own boat — motor pitch tracks speed
  // ===========================================================================
  // Non-positional: it is you. Without it there is no way to tell "ahead
  // slow" from "stopped" by ear, which was the other half of the old build
  // feeling inert.
  function startMotor() {
    if (motor) return
    const c = ctx()

    const gain = c.createGain()
    gain.gain.value = 0.0001
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 380
    lp.Q.value = 0.6
    lp.connect(gain).connect(out())

    const carrier = c.createOscillator()
    carrier.type = 'triangle'
    carrier.frequency.value = 44
    const carrierGain = c.createGain()
    carrierGain.gain.value = 0.5
    carrier.connect(carrierGain).connect(lp)
    carrier.start()

    const sub = c.createOscillator()
    sub.type = 'sine'
    sub.frequency.value = 22
    const subGain = c.createGain()
    subGain.gain.value = 0.4
    sub.connect(subGain).connect(lp)
    sub.start()

    const rumble = noiseSource()
    const rumbleBp = c.createBiquadFilter()
    rumbleBp.type = 'bandpass'
    rumbleBp.frequency.value = 180
    rumbleBp.Q.value = 0.8
    const rumbleGain = c.createGain()
    rumbleGain.gain.value = 0.0001
    rumble.connect(rumbleBp).connect(rumbleGain).connect(lp)
    rumble.start()

    motor = {gain, lp, carrier, sub, rumble, rumbleBp, rumbleGain}
  }
  function stopMotor() {
    if (!motor) return
    const m = motor
    const t = now()
    try {
      m.gain.gain.cancelScheduledValues(t)
      m.gain.gain.setValueAtTime(m.gain.gain.value, t)
      m.gain.gain.linearRampToValueAtTime(0.0001, t + 0.3)
      setTimeout(() => {
        try { m.carrier.stop(); m.sub.stop(); m.rumble.stop() } catch (e) {}
        try { m.gain.disconnect(); m.lp.disconnect() } catch (e) {}
      }, 400)
    } catch (e) {}
    motor = null
  }
  function updateMotor(speed, maxSpeed, deep) { // `deep` is 0..1
    if (!motor) return
    const t = now()
    const frac = maxSpeed > 0 ? K().clamp(speed / maxSpeed, 0, 1) : 0
    engine.fn.setParam(motor.carrier.frequency, 38 + frac * 46, 0.15)
    engine.fn.setParam(motor.sub.frequency, 19 + frac * 23, 0.15)
    engine.fn.setParam(motor.rumbleBp.frequency, 150 + frac * 320, 0.15)
    engine.fn.setParam(motor.rumbleGain.gain, 0.02 + frac * 0.10, 0.15)
    engine.fn.setParam(motor.gain.gain, 0.05 + frac * 0.14, 0.2)
    engine.fn.setParam(motor.lp.frequency,
      K().lerp(340 + frac * 420, 210, K().clamp(deep || 0, 0, 1)), 0.3)
  }

  // ===========================================================================
  // close-aboard screw voices
  // ===========================================================================
  // Only for ships inside CLOSE_VOICE_RANGE. Binaural, with a behind-muffle
  // borrowed from dogfight's engine voice: the low-pass closes and the pitch
  // drops slightly as a ship passes astern, which reinforces the beep's
  // octave drop.
  function ensureCloseVoice(id, voicePitch, escort) {
    let v = closeVoices.get(id)
    if (v) return v
    const c = ctx()

    const gain = c.createGain()
    gain.gain.value = 0.0001
    const muffle = c.createBiquadFilter()
    muffle.type = 'lowpass'
    muffle.frequency.value = 2600
    muffle.Q.value = 0.5
    gain.connect(muffle)

    const ear = engine.ear.binaural.create()
    ear.from(muffle)
    ear.to(out())

    const osc = c.createOscillator()
    osc.type = escort ? 'square' : 'sine'
    osc.frequency.value = voicePitch
    const oscGain = c.createGain()
    oscGain.gain.value = 0.5
    osc.connect(oscGain).connect(gain)
    osc.start()

    const wash = noiseSource()
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = escort ? 900 : 480
    bp.Q.value = escort ? 1.6 : 0.9
    const washGain = c.createGain()
    washGain.gain.value = 0.35
    wash.connect(bp).connect(washGain).connect(gain)
    wash.start()

    v = {gain, muffle, ear, osc, wash, bp}
    closeVoices.set(id, v)
    return v
  }
  function destroyCloseVoice(id) {
    const v = closeVoices.get(id)
    if (!v) return
    closeVoices.delete(id)
    const t = now()
    try {
      v.gain.gain.cancelScheduledValues(t)
      v.gain.gain.setValueAtTime(v.gain.gain.value, t)
      v.gain.gain.linearRampToValueAtTime(0.0001, t + 0.25)
    } catch (e) {}
    setTimeout(() => {
      try { v.osc.stop(); v.wash.stop() } catch (e) {}
      try { v.gain.disconnect(); v.muffle.disconnect() } catch (e) {}
      try { v.ear.destroy() } catch (e) {}
    }, 350)
  }

  // Called once per frame with everything currently close aboard.
  function updateClose(list, muffled) {
    const k = K()
    if (!k.CLOSE_VOICE_RANGE) { // continuous layer disabled
      for (const id of [...closeVoices.keys()]) destroyCloseVoice(id)
      return
    }
    const seen = new Set()
    for (const c of list) {
      seen.add(c.id)
      const v = ensureCloseVoice(c.id, c.voice, c.escort)
      moveEar(v.ear, c.local)
      const prox = k.clamp(1 - c.range / k.CLOSE_VOICE_RANGE, 0, 1)
      const dist = Math.hypot(c.local.forward, c.local.starboard) || 1
      const behind = k.clamp(-c.local.forward / dist, 0, 1)
      engine.fn.setParam(v.gain.gain,
        (0.02 + prox * 0.16) * k.lerp(1, 0.45, k.clamp(muffled || 0, 0, 1)), 0.12)
      engine.fn.setParam(v.muffle.frequency, k.lerp(2600, 700, behind), 0.12)
      engine.fn.setParam(v.osc.detune, -110 * behind, 0.12)
    }
    for (const id of [...closeVoices.keys()]) {
      if (!seen.has(id)) destroyCloseVoice(id)
    }
  }

  // ===========================================================================
  // active sonar
  // ===========================================================================
  function pingOut() {
    const t0 = now()
    const c = ctx()
    const g = c.createGain()
    g.gain.value = 0
    g.connect(out())
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(1180, t0)
    o.frequency.exponentialRampToValueAtTime(940, t0 + 0.6)
    o.connect(g)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(0.30, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.62)
    o.start(t0)
    o.stop(t0 + 0.65)
    o.onended = () => { try { g.disconnect() } catch (e) {} }
  }

  // A return, binaural at the contact. It lands late in proportion to range,
  // which is the point of the whole mechanic.
  function echo(local, range, escort) {
    const k = K()
    const t0 = now()
    const c = ctx()
    const ear = earAt(local)
    const g = c.createGain()
    g.gain.value = 0
    ear.from(g)

    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = escort ? 1560 : 1040
    o.connect(g)

    const close = k.clamp(1 - range / k.DESPAWN_RANGE, 0, 1)
    const peak = 0.14 + close * 0.24
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(peak, t0 + 0.004)
    g.gain.linearRampToValueAtTime(0, t0 + 0.20)
    o.start(t0)
    o.stop(t0 + 0.22)
    o.onended = () => {
      try { g.disconnect() } catch (e) {}
      try { ear.destroy() } catch (e) {}
    }
  }

  // ===========================================================================
  // the hydrophone sweep — quick, quiet, coarse
  // ===========================================================================
  // It has to be instantly distinguishable from a ping, because the two answer
  // different questions. A ping is a hard sine SHOUT followed by a long silence
  // and then discrete returns. A sweep is a soft band-passed hiss — the sound
  // of the operator swinging the hydrophone, not of anything leaving the boat —
  // and the returns arrive with it rather than seconds later.
  function sweepOut() {
    const t0 = now()
    const c = ctx()
    const src = noiseSource()
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 2.2
    // Sweeping upward: the ping glides DOWN, so the two are opposites even in
    // the shape of their pitch contour.
    bp.frequency.setValueAtTime(420, t0)
    bp.frequency.exponentialRampToValueAtTime(1500, t0 + 0.34)
    const g = c.createGain()
    g.gain.value = 0
    src.connect(bp)
    bp.connect(g)
    g.connect(out())
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(0.13, t0 + 0.05)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.36)
    src.start(t0)
    src.stop(t0 + 0.38)
    src.onended = () => {
      try { g.disconnect() } catch (e) {}
      try { bp.disconnect() } catch (e) {}
    }
  }

  // One return. Placed binaurally at the SMEARED bearing the sweep reported,
  // and pitched by range band rather than gained by distance — a coarse
  // instrument should sound like three buckets, not like a continuum, or the
  // ear will start reading a range off it that the sweep never measured.
  function sweepBlip(local, band, escort) {
    const t0 = now()
    const c = ctx()
    const ear = earAt(local)
    const g = c.createGain()
    g.gain.value = 0
    ear.from(g)

    const o = c.createOscillator()
    o.type = escort ? 'sawtooth' : 'triangle'
    o.frequency.value = [880, 660, 470][band] || 470
    o.connect(g)

    const dur = 0.13
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(escort ? 0.20 : 0.16, t0 + 0.008)
    g.gain.linearRampToValueAtTime(0, t0 + dur)
    o.start(t0)
    o.stop(t0 + dur + 0.02)
    o.onended = () => {
      try { g.disconnect() } catch (e) {}
      try { ear.destroy() } catch (e) {}
    }
  }

  // ===========================================================================
  // torpedoes
  // ===========================================================================
  function fire() {
    // Non-positional: it leaves from under your feet.
    const t0 = now()
    const c = ctx()
    const g = c.createGain()
    g.gain.value = 0
    g.connect(out())
    const s = noiseSource()
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(620, t0)
    f.frequency.exponentialRampToValueAtTime(160, t0 + 0.3)
    s.connect(f).connect(g)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(0.42, t0 + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32)
    s.start(t0)
    s.stop(t0 + 0.35)

    const o = c.createOscillator()
    const og = c.createGain()
    og.gain.value = 0
    o.type = 'sine'
    o.frequency.setValueAtTime(150, t0)
    o.frequency.exponentialRampToValueAtTime(55, t0 + 0.3)
    o.connect(og).connect(out())
    og.gain.setValueAtTime(0, t0)
    og.gain.linearRampToValueAtTime(0.32, t0 + 0.005)
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34)
    o.start(t0)
    o.stop(t0 + 0.36)
    o.onended = () => {
      try { g.disconnect(); og.disconnect() } catch (e) {}
    }
  }

  // Each running fish gets its own binaural whine, so with two in the water
  // you can hear them diverge.
  //
  // A HOSTILE fish sounds different in three ways, because it is the one piece
  // of information that decides whether you live: it runs lower and rougher,
  // it warbles (a slow LFO on the band, which nothing else in the game does),
  // and it is dulled in proportion to how far off your depth it is set. So a
  // fish coming for you is a rising, insistent warble, and one you have dived
  // clear of goes flat and distant even while it is still close aboard.
  function updateRuns(list) {
    const seen = new Set()
    for (const t of list) {
      seen.add(t.id)
      let v = runVoices.get(t.id)
      if (!v) {
        const c = ctx()
        const gain = c.createGain()
        gain.gain.value = 0.0001
        const bp = c.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.value = t.hostile ? 700 : 1500
        bp.Q.value = t.hostile ? 6.0 : 3.4
        const s = noiseSource()
        s.connect(bp).connect(gain)
        s.start()
        const ear = engine.ear.binaural.create()
        ear.from(gain)
        ear.to(out())
        v = {gain, bp, s, ear, hostile: !!t.hostile}

        if (t.hostile) {
          const lfo = c.createOscillator()
          lfo.type = 'sine'
          lfo.frequency.value = 5.5
          const lfoGain = c.createGain()
          lfoGain.gain.value = 240
          lfo.connect(lfoGain).connect(bp.frequency)
          lfo.start()
          v.lfo = lfo
          v.lfoGain = lfoGain
        }
        runVoices.set(t.id, v)
      }
      moveEar(v.ear, t.local)
      const close = K().clamp(1 - t.range / 1600, 0, 1)
      if (v.hostile) {
        // 1 when it is set for your depth, 0 when it is a level away.
        const onDepth = K().clamp(1 - (t.offDepth || 0) * 3.4, 0, 1)
        engine.fn.setParam(v.gain.gain, (0.06 + close * 0.16) * (0.3 + onDepth * 0.7), 0.08)
        engine.fn.setParam(v.bp.frequency, 520 + close * 900 * (0.4 + onDepth * 0.6), 0.08)
        if (v.lfoGain) engine.fn.setParam(v.lfoGain.gain, 90 + onDepth * 260, 0.15)
      } else {
        engine.fn.setParam(v.gain.gain, 0.05 + close * 0.10, 0.08)
        engine.fn.setParam(v.bp.frequency, 900 + close * 1400, 0.08)
      }
    }
    for (const id of [...runVoices.keys()]) {
      if (seen.has(id)) continue
      const v = runVoices.get(id)
      runVoices.delete(id)
      const t = now()
      try {
        v.gain.gain.cancelScheduledValues(t)
        v.gain.gain.setValueAtTime(v.gain.gain.value, t)
        v.gain.gain.linearRampToValueAtTime(0.0001, t + 0.2)
      } catch (e) {}
      setTimeout(() => {
        try { if (v.lfo) v.lfo.stop() } catch (e) {}
        try { v.s.stop(); v.gain.disconnect(); v.bp.disconnect(); v.ear.destroy() } catch (e) {}
      }, 300)
    }
  }
  function stopRuns() {
    for (const id of [...runVoices.keys()]) {
      const v = runVoices.get(id)
      runVoices.delete(id)
      try { if (v.lfo) v.lfo.stop() } catch (e) {}
      try { v.s.stop(); v.gain.disconnect(); v.bp.disconnect(); v.ear.destroy() } catch (e) {}
    }
  }

  // A generic binaural one-shot: noise burst plus an optional tone.
  function boom(local, {peak, dur, cutoff, sweepTo, tone, toneTo, tonePeak, type = 'lowpass', q = 0.9}) {
    const t0 = now()
    const c = ctx()
    const ear = earAt(local, {gainModel: engine.ear.gainModel.normalize})
    const g = c.createGain()
    g.gain.value = 0
    ear.from(g)

    const s = noiseSource()
    const f = c.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(cutoff, t0)
    f.Q.value = q
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t0 + dur)
    s.connect(f).connect(g)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(peak, t0 + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    s.start(t0)
    s.stop(t0 + dur + 0.05)

    if (tone) {
      const o = c.createOscillator()
      const og = c.createGain()
      og.gain.value = 0
      o.type = 'sine'
      o.frequency.setValueAtTime(tone, t0)
      if (toneTo) o.frequency.exponentialRampToValueAtTime(Math.max(18, toneTo), t0 + dur)
      o.connect(og).connect(g)
      og.gain.setValueAtTime(0, t0)
      og.gain.linearRampToValueAtTime(tonePeak || peak, t0 + 0.004)
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
      o.start(t0)
      o.stop(t0 + dur + 0.05)
    }

    setTimeout(() => {
      try { g.disconnect() } catch (e) {}
      try { ear.destroy() } catch (e) {}
    }, (dur + 0.4) * 1000)
  }

  function hit(local, range, escort) {
    const close = K().clamp(1 - range / 2000, 0, 1)
    const loud = 0.35 + close * 0.45
    boom(local, {peak: loud, dur: 0.8, cutoff: 2400, sweepTo: 120, tone: 90, toneTo: 32, tonePeak: loud})
    // The hull tearing, then going down.
    later(() => {
      boom(local, {
        peak: 0.12, dur: 1.6, cutoff: 500, sweepTo: 90,
        tone: escort ? 260 : 150, toneTo: escort ? 90 : 44, tonePeak: 0.16,
      })
    }, 640)
  }

  function torpedoSpent(local, hostile) {
    boom(local, hostile
      ? {peak: 0.07, dur: 0.6, cutoff: 600, sweepTo: 140, tone: 240, toneTo: 90, tonePeak: 0.09}
      : {peak: 0.05, dur: 0.5, cutoff: 900, sweepTo: 220, tone: 420, toneTo: 180, tonePeak: 0.07})
  }

  function fireBlocked(reason) {
    const t0 = now()
    const c = ctx()
    const g = c.createGain()
    g.gain.value = 0
    g.connect(out())
    const o = c.createOscillator()
    o.type = 'square'
    o.frequency.value = reason === 'empty' ? 200 : 160
    o.connect(g)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(0.14, t0 + 0.004)
    g.gain.linearRampToValueAtTime(0, t0 + 0.09)
    o.start(t0)
    o.stop(t0 + 0.11)
    o.onended = () => { try { g.disconnect() } catch (e) {} }
  }

  function tone(freq, {dur = 0.12, peak = 0.18, type = 'square', at = 0, glideTo = 0} = {}) {
    const t0 = now() + at
    const c = ctx()
    const g = c.createGain()
    g.gain.value = 0
    g.connect(out())
    const o = c.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t0)
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + dur)
    o.connect(g)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(peak, t0 + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.start(t0)
    o.stop(t0 + dur + 0.03)
    o.onended = () => { try { g.disconnect() } catch (e) {} }
  }

  function reloaded() { tone(300, {dur: 0.10, peak: 0.10}) }

  // ===========================================================================
  // being hunted
  // ===========================================================================
  function acquired() {
    tone(330, {dur: 0.4, peak: 0.20, type: 'sawtooth'})
    tone(494, {dur: 0.4, peak: 0.13, type: 'sawtooth', at: 0.02})
    tone(330, {dur: 0.45, peak: 0.18, type: 'sawtooth', at: 0.44})
  }
  function lostContact() { tone(400, {dur: 0.45, peak: 0.14, type: 'sine', glideTo: 560}) }

  function escortTurn(local) {
    boom(local, {peak: 0.10, dur: 0.55, cutoff: 700, sweepTo: 2200, type: 'bandpass', q: 1.1,
      tone: 200, toneTo: 420, tonePeak: 0.16})
  }

  // An escort launching. The compressed-air thump is placed at the escort, so
  // it tells you which way the fish is coming FROM before you can hear the
  // run itself — and it is your cue to start changing depth, which takes long
  // enough that waiting until you hear the run is already too late.
  function escortFire(local) {
    boom(local, {peak: 0.26, dur: 0.26, cutoff: 3000, sweepTo: 420, type: 'bandpass', q: 0.9,
      tone: 190, toneTo: 70, tonePeak: 0.20})
    // Two short rising blips: an unmistakable "that was aimed at you".
    later(() => {
      const t0 = now()
      const c = ctx()
      const ear = earAt(local, {gainModel: engine.ear.gainModel.normalize})
      const g = c.createGain()
      g.gain.value = 0
      ear.from(g)
      const o = c.createOscillator()
      o.type = 'square'
      o.frequency.setValueAtTime(300, t0)
      o.frequency.exponentialRampToValueAtTime(560, t0 + 0.26)
      o.connect(g)
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(0.15, t0 + 0.01)
      g.gain.setValueAtTime(0.15, t0 + 0.10)
      g.gain.linearRampToValueAtTime(0.0001, t0 + 0.12)
      g.gain.linearRampToValueAtTime(0.15, t0 + 0.15)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28)
      o.start(t0)
      o.stop(t0 + 0.3)
      o.onended = () => {
        try { g.disconnect() } catch (e) {}
        try { ear.destroy() } catch (e) {}
      }
    }, 150)
  }

  // One of theirs going off against the hull. Nothing else in the game is this
  // loud or this close.
  function enemyHit(local) {
    boom(local, {peak: 0.85, dur: 0.9, cutoff: 2600, sweepTo: 80, tone: 84, toneTo: 26, tonePeak: 0.7})
    later(() => tone(170, {dur: 0.9, peak: 0.14, type: 'sawtooth', glideTo: 230}), 240)
  }

  // A fish running past at the wrong depth: a fast doppler-ish swish and then
  // nothing. This is the sound of a dive having been worth it.
  function torpedoPassed(local, above) {
    boom(local, {
      peak: 0.20, dur: 0.55,
      cutoff: above ? 1500 : 700, sweepTo: above ? 400 : 200,
      type: 'bandpass', q: 1.4,
      tone: above ? 520 : 240, toneTo: above ? 190 : 90, tonePeak: 0.09,
    })
  }

  // Steel on steel. A long, ugly, non-positional groan — it is happening TO
  // you, not somewhere near you — over a binaural crunch where the ship is.
  function collision(local, force) {
    const f = K().clamp(force, 0, 1)
    boom(local, {peak: 0.45 + f * 0.35, dur: 0.7 + f * 0.5, cutoff: 1400, sweepTo: 70,
      tone: 120, toneTo: 34, tonePeak: 0.4 + f * 0.3, q: 1.2})
    tone(74, {dur: 1.3 + f, peak: 0.22 + f * 0.16, type: 'sawtooth', glideTo: 46})
    later(() => tone(340, {dur: 0.5, peak: 0.10 + f * 0.08, type: 'square', glideTo: 210}), 180)
  }

  function damage() {
    tone(520, {dur: 0.35, peak: 0.11, type: 'sawtooth', glideTo: 700})
  }

  // ===========================================================================
  // depth, run state, ui
  // ===========================================================================
  // Ordering a change of level: venting or blowing, and a tone that sweeps the
  // way the boat is about to go. It runs for as long as the trip will actually
  // take, so the sound IS the wait — you hear how big a commitment you just
  // made, and it does not stop until the boat is there.
  function depthChange(down, eta) {
    const t0 = now()
    const dur = K().clamp(eta || 1.2, 0.6, 8)
    const c = ctx()
    const g = c.createGain()
    g.gain.value = 0
    g.connect(out())
    const s = noiseSource()
    const f = c.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 0.7
    f.frequency.setValueAtTime(down ? 2600 : 500, t0)
    f.frequency.exponentialRampToValueAtTime(down ? 420 : 3000, t0 + dur)
    s.connect(f).connect(g)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(0.20, t0 + 0.05)
    g.gain.setValueAtTime(0.20, t0 + dur * 0.8)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    s.start(t0)
    s.stop(t0 + dur + 0.05)
    tone(down ? 240 : 90, {dur: Math.min(dur, 1.1), peak: 0.13, type: 'sine', glideTo: down ? 90 : 260})
    setTimeout(() => { try { g.disconnect() } catch (e) {} }, (dur + 0.4) * 1000)
  }

  // Levelled off. The pitch says which level, so the four stops are four
  // different chimes and you learn where you are without reading the HUD.
  function depthSettled(depth) {
    const k = K()
    const f = k.lerp(520, 150, k.depthFraction(depth))
    tone(f, {dur: 0.12, peak: 0.14})
  }

  // Ordered past the top or the bottom of the ladder.
  function depthLimit() { tone(130, {dur: 0.14, peak: 0.13, type: 'square'}) }

  function batteryLow() {
    tone(620, {dur: 0.10, peak: 0.16})
    tone(620, {dur: 0.10, peak: 0.16, at: 0.20})
  }
  function batteryDead() { tone(620, {dur: 0.5, peak: 0.20, glideTo: 200}) }

  function countTone(n) { tone(500 + (3 - n) * 60, {dur: 0.14, peak: 0.20}) }
  function dive() {
    for (let i = 0; i < 2; i++) {
      tone(300, {dur: 0.36, peak: 0.22, type: 'sawtooth', glideTo: 380, at: i * 0.42})
      tone(452, {dur: 0.36, peak: 0.12, type: 'sawtooth', glideTo: 570, at: i * 0.42})
    }
  }
  function warning(remaining) {
    if (remaining <= 5) tone(820, {dur: 0.10, peak: 0.20})
    else {
      tone(640, {dur: 0.13, peak: 0.18})
      tone(430, {dur: 0.15, peak: 0.16, at: 0.13})
    }
  }
  function doom(reason) {
    if (reason === 'sunk') {
      tone(300, {dur: 1.9, peak: 0.30, type: 'sawtooth', glideTo: 34})
      tone(120, {dur: 2.0, peak: 0.30, type: 'sine', glideTo: 26})
    } else if (reason === 'empty') {
      tone(400, {dur: 0.45, peak: 0.16, glideTo: 260, at: 0.12})
    } else {
      tone(560, {dur: 0.16, peak: 0.20})
      tone(560, {dur: 0.26, peak: 0.20, at: 0.22})
    }
  }
  function gameOver() {
    const notes = [294, 247, 196, 147]
    notes.forEach((f, i) => {
      tone(f, {dur: 0.6, peak: 0.20, type: 'triangle', at: i * 0.26})
      tone(f / 2, {dur: 0.6, peak: 0.14, type: 'sine', at: i * 0.26})
    })
  }

  function menuMove() { tone(1800, {dur: 0.04, peak: 0.10, type: 'sine'}) }
  function menuSelect() {
    tone(392, {dur: 0.12, peak: 0.20, type: 'sine'})
    tone(587, {dur: 0.16, peak: 0.16, type: 'sine', at: 0.07})
  }
  function menuBack() {
    tone(440, {dur: 0.12, peak: 0.17, type: 'sine'})
    tone(294, {dur: 0.16, peak: 0.15, type: 'sine', at: 0.07})
  }

  // ===========================================================================
  // the sea
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
    startMotor()
  }
  function stopAmbient() {
    stopMotor()
    if (!sea) return
    const a = sea
    const t0 = now()
    try {
      a.g.gain.cancelScheduledValues(t0)
      a.g.gain.setValueAtTime(a.g.gain.value, t0)
      a.g.gain.linearRampToValueAtTime(0.0001, t0 + 0.3)
      setTimeout(() => { try { a.s.stop(); a.g.disconnect(); a.lp.disconnect() } catch (e) {} }, 400)
    } catch (e) {}
    sea = null
  }

  // Pumped every frame from the game screen.
  function frame(delta, st) {
    const k = K()
    // The sea closes over you gradually as you go down rather than at a
    // threshold, so the descent between two levels is audible the whole way.
    const df = k.clamp(st.depthFrac != null ? st.depthFrac : k.depthFraction(st.depth || 0), 0, 1)
    if (sea) {
      engine.fn.setParam(sea.g.gain, k.lerp(0.018, 0.030, df), 0.4)
      engine.fn.setParam(sea.lp.frequency, k.lerp(460 + (st.noise || 0) * 220, 150, df), 0.4)
    }
    updateMotor(st.speed || 0, st.maxSpeed || 1, df)
  }

  function silenceAll() {
    for (const id of pendingTimeouts) clearTimeout(id)
    pendingTimeouts = []
    stopAmbient()
    stopRuns()
    for (const id of [...closeVoices.keys()]) destroyCloseVoice(id)
  }

  // ---- learn-the-sounds cues ----
  // Local coordinates are in meters, forward and starboard of the boat.
  function sample(which) {
    const k = K()
    const AHEAD = {forward: 600, starboard: 0}
    const PORT = {forward: 220, starboard: -560}
    const STBD = {forward: 220, starboard: 560}
    const ASTERN = {forward: -600, starboard: 0}
    const CLOSE = {forward: 140, starboard: 60}

    switch (which) {
      case 'beepAhead': beep(AHEAD, 600, false, 0); break
      case 'beepPort': beep(PORT, 600, false, 0); break
      case 'beepStarboard': beep(STBD, 600, false, 0); break
      case 'beepAstern': beep(ASTERN, 600, false, 0); break
      case 'beepNear': beep(CLOSE, 160, false, 0); break
      case 'beepFar': beep({forward: 1480, starboard: 220}, 1500, false, 0); break
      case 'beepEscort': beep(AHEAD, 600, true, 0); break
      // A run of beeps at closing range, so the rate ramp is audible as a ramp.
      case 'beepClosing': {
        const steps = [1550, 1300, 1050, 850, 650, 480, 340, 230, 150]
        let at = 0
        steps.forEach((r) => {
          later(() => beep({forward: r, starboard: r * 0.15}, r, false, 0), at * 1000)
          at += k.beepInterval(r)
        })
        break
      }
      case 'ping': {
        pingOut()
        later(() => echo(PORT, 600, false), k.echoDelay(600) * 1000)
        later(() => echo({forward: 1100, starboard: 700}, 1310, false), k.echoDelay(1310) * 1000)
        break
      }
      // The sweep, for direct comparison with the ping above: same field, but
      // it answers at once and in three coarse buckets instead of in metres.
      case 'sweep': {
        sweepOut()
        const shown = [
          [{forward: 190, starboard: -120}, 0, false],
          [{forward: -300, starboard: 640}, 1, true],
          [{forward: 900, starboard: 340}, 2, false],
        ]
        shown.forEach((r, i) => later(() => sweepBlip(r[0], r[1], r[2]), 120 + i * 130))
        break
      }
      case 'sweepEmpty': sweepOut(); break
      case 'motorSlow': {
        startMotor(); updateMotor(4, 16, 0)
        later(() => { if (!sea) stopMotor() }, 1600)
        break
      }
      case 'motorFlank': {
        startMotor(); updateMotor(16, 16, 0)
        later(() => { if (!sea) stopMotor() }, 1600)
        break
      }
      case 'closeAboard': {
        updateClose([{id: 'demo', local: CLOSE, range: 150, voice: k.SHIP_TYPES.tanker.voice, escort: false}], 0)
        later(() => destroyCloseVoice('demo'), 2200)
        break
      }
      case 'fire': fire(); break
      case 'run': {
        const ids = [{id: 'demo', local: {forward: 120, starboard: 0}, range: 120}]
        updateRuns(ids)
        later(() => updateRuns([{id: 'demo', local: {forward: 700, starboard: 60}, range: 700}]), 400)
        later(() => updateRuns([{id: 'demo', local: {forward: 1400, starboard: 120}, range: 1400}]), 900)
        later(() => updateRuns([]), 1500)
        break
      }
      case 'hit': hit({forward: 700, starboard: -300}, 760, false); break
      case 'spent': torpedoSpent({forward: 900, starboard: 200}, false); break
      case 'acquired': acquired(); break
      case 'escortTurn': escortTurn(STBD); break
      case 'escortFire': escortFire(STBD); break
      // An incoming fish set for your depth, closing from the starboard bow.
      case 'incoming': {
        const track = [1500, 1150, 820, 540, 320, 160]
        track.forEach((r, i) => later(() => updateRuns([
          {id: 'demoHostile', hostile: true, offDepth: 0,
            local: {forward: r * 0.9, starboard: r * 0.45}, range: r},
        ]), i * 320))
        later(() => updateRuns([]), track.length * 320 + 200)
        break
      }
      // The same fish, after you have dived a level clear of it.
      case 'incomingOffDepth': {
        const track = [1200, 850, 520, 260, 120]
        track.forEach((r, i) => later(() => updateRuns([
          {id: 'demoHostile', hostile: true, offDepth: 0.34,
            local: {forward: r * 0.9, starboard: r * 0.45}, range: r},
        ]), i * 320))
        later(() => updateRuns([]), track.length * 320 + 200)
        break
      }
      case 'passedAbove': torpedoPassed({forward: 40, starboard: 30}, true); break
      case 'enemyHit': enemyHit({forward: 20, starboard: -10}); break
      case 'collision': collision({forward: 26, starboard: 14}, 0.8); break
      case 'dive100': depthChange(true, 100 / k.DIVE_RATE); break
      case 'dive300': depthChange(true, 300 / k.DIVE_RATE); break
      case 'risePeriscope': depthChange(false, 300 / k.RISE_RATE); break
      case 'levelPeriscope': depthSettled(0); break
      case 'level300': depthSettled(300); break
      case 'battery': batteryLow(); break
      case 'damage': damage(); break
      case 'klaxon': dive(); break
      case 'over': gameOver(); break
    }
  }

  // Binaural field probe. Because the world is a full circle now, this has to
  // prove front and BACK, not just left and right.
  function testDirection(which) {
    const R = 500
    const at = (f, s) => beep({forward: f, starboard: s}, R, false, false)
    if (which === 'n') at(R, 0)
    else if (which === 's') at(-R, 0)
    else if (which === 'w') at(0, -R)
    else if (which === 'e') at(0, R)
    else if (which === 'c') at(60, 0)
    else if (which === 'sweep' || which === 'ring') {
      const stops = [[R, 0], [R * 0.7, R * 0.7], [0, R], [-R * 0.7, R * 0.7], [-R, 0],
        [-R * 0.7, -R * 0.7], [0, -R], [R * 0.7, -R * 0.7]]
      const use = which === 'sweep' ? stops.slice(0, 5) : stops
      use.forEach((p, i) => later(() => at(p[0], p[1]), i * 420))
    }
  }

  return {
    setStaticListener: function () {},
    beep,
    updateClose,
    updateRuns,
    stopRuns,
    pingOut,
    echo,
    sweepOut,
    sweepBlip,
    fire,
    hit,
    torpedoSpent,
    fireBlocked,
    reloaded,
    acquired,
    lostContact,
    escortTurn,
    escortFire,
    enemyHit,
    torpedoPassed,
    collision,
    damage,
    depthChange,
    depthSettled,
    depthLimit,
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
    startMotor,
    stopMotor,
    updateMotor,
    frame,
    silenceAll,
    sample,
    testDirection,
    later,
  }
})()
