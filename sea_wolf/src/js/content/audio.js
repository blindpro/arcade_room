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
//   the fight        tube launch, torpedo run, explosions, depth charges.
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
    const peak = (0.16 + k.closeness(range) * 0.22) * (muffled ? 0.55 : 1)
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
  function updateMotor(speed, maxSpeed, deep) {
    if (!motor) return
    const t = now()
    const frac = maxSpeed > 0 ? K().clamp(speed / maxSpeed, 0, 1) : 0
    engine.fn.setParam(motor.carrier.frequency, 38 + frac * 46, 0.15)
    engine.fn.setParam(motor.sub.frequency, 19 + frac * 23, 0.15)
    engine.fn.setParam(motor.rumbleBp.frequency, 150 + frac * 320, 0.15)
    engine.fn.setParam(motor.rumbleGain.gain, 0.02 + frac * 0.10, 0.15)
    engine.fn.setParam(motor.gain.gain, 0.05 + frac * 0.14, 0.2)
    engine.fn.setParam(motor.lp.frequency, deep ? 240 : 340 + frac * 420, 0.3)
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
      engine.fn.setParam(v.gain.gain, (0.02 + prox * 0.16) * (muffled ? 0.5 : 1), 0.12)
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
        bp.frequency.value = 1500
        bp.Q.value = 3.4
        const s = noiseSource()
        s.connect(bp).connect(gain)
        s.start()
        const ear = engine.ear.binaural.create()
        ear.from(gain)
        ear.to(out())
        v = {gain, bp, s, ear}
        runVoices.set(t.id, v)
      }
      moveEar(v.ear, t.local)
      const close = K().clamp(1 - t.range / 1600, 0, 1)
      engine.fn.setParam(v.gain.gain, 0.05 + close * 0.10, 0.08)
      engine.fn.setParam(v.bp.frequency, 900 + close * 1400, 0.08)
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
        try { v.s.stop(); v.gain.disconnect(); v.bp.disconnect(); v.ear.destroy() } catch (e) {}
      }, 300)
    }
  }
  function stopRuns() {
    for (const id of [...runVoices.keys()]) {
      const v = runVoices.get(id)
      runVoices.delete(id)
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

  function torpedoSpent(local) {
    boom(local, {peak: 0.05, dur: 0.5, cutoff: 900, sweepTo: 220, tone: 420, toneTo: 180, tonePeak: 0.07})
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

  // Charges in the water: the splash where the escort is, then a long
  // descending whistle that ends in the bang. The whistle is your dive cue.
  function chargeSplash(local, fall) {
    boom(local, {peak: 0.24, dur: 0.32, cutoff: 4200, sweepTo: 700, type: 'bandpass', q: 0.8})
    const t = fall || K().CHARGE_FALL_TIME
    const t0 = now() + 0.12
    const c = ctx()
    const ear = earAt(local, {gainModel: engine.ear.gainModel.normalize})
    const g = c.createGain()
    g.gain.value = 0
    ear.from(g)
    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(900, t0)
    o.frequency.exponentialRampToValueAtTime(130, t0 + t)
    o.connect(g)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(0.11, t0 + 0.08)
    g.gain.setValueAtTime(0.11, t0 + t * 0.7)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + t)
    o.start(t0)
    o.stop(t0 + t + 0.05)
    o.onended = () => {
      try { g.disconnect() } catch (e) {}
      try { ear.destroy() } catch (e) {}
    }
  }

  function chargeDetonate(local, proximity, deep) {
    const near = K().clamp(proximity, 0, 1)
    const loud = 0.10 + near * (deep ? 0.30 : 0.55)
    boom(local, {
      peak: loud, dur: 0.35 + near * 0.5,
      cutoff: deep ? 900 : 2200, sweepTo: 90,
      tone: 70 + near * 40, toneTo: 28, tonePeak: loud,
    })
    if (near > 0.35) later(() => tone(190, {dur: 0.7, peak: 0.10 * near, type: 'sawtooth', glideTo: 240}), 260)
  }

  function damage() {
    tone(520, {dur: 0.35, peak: 0.11, type: 'sawtooth', glideTo: 700})
  }

  // ===========================================================================
  // depth, run state, ui
  // ===========================================================================
  function depthChange(to) {
    const t0 = now()
    const c = ctx()
    const g = c.createGain()
    g.gain.value = 0
    g.connect(out())
    const s = noiseSource()
    const f = c.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 0.7
    f.frequency.setValueAtTime(to === 'deep' ? 2600 : 500, t0)
    f.frequency.exponentialRampToValueAtTime(to === 'deep' ? 420 : 3000, t0 + 1.0)
    s.connect(f).connect(g)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(0.24, t0 + 0.05)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.05)
    s.start(t0)
    s.stop(t0 + 1.1)
    tone(to === 'deep' ? 240 : 90, {dur: 0.9, peak: 0.13, type: 'sine', glideTo: to === 'deep' ? 90 : 260})
    setTimeout(() => { try { g.disconnect() } catch (e) {} }, 1400)
  }
  function depthSettled(depth) { tone(depth === 'deep' ? 180 : 420, {dur: 0.11, peak: 0.13}) }

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
    const deep = st.depth === 'deep' || st.depth === 'diving'
    if (sea) {
      engine.fn.setParam(sea.g.gain, deep ? 0.028 : 0.018, 0.4)
      engine.fn.setParam(sea.lp.frequency, deep ? 170 : 460 + (st.noise || 0) * 220, 0.4)
    }
    updateMotor(st.speed || 0, st.maxSpeed || 1, deep)
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
      case 'beepAhead': beep(AHEAD, 600, false, false); break
      case 'beepPort': beep(PORT, 600, false, false); break
      case 'beepStarboard': beep(STBD, 600, false, false); break
      case 'beepAstern': beep(ASTERN, 600, false, false); break
      case 'beepNear': beep(CLOSE, 160, false, false); break
      case 'beepFar': beep({forward: 2000, starboard: 300}, 2020, false, false); break
      case 'beepEscort': beep(AHEAD, 600, true, false); break
      // A run of beeps at closing range, so the rate ramp is audible as a ramp.
      case 'beepClosing': {
        const steps = [2100, 1700, 1300, 1000, 750, 550, 400, 280, 190]
        let at = 0
        steps.forEach((r) => {
          later(() => beep({forward: r, starboard: r * 0.15}, r, false, false), at * 1000)
          at += k.beepInterval(r)
        })
        break
      }
      case 'ping': {
        pingOut()
        later(() => echo(PORT, 600, false), k.echoDelay(600) * 1000)
        later(() => echo({forward: 1400, starboard: 900}, 1660, false), k.echoDelay(1660) * 1000)
        break
      }
      case 'motorSlow': {
        startMotor(); updateMotor(4, 16, false)
        later(() => { if (!sea) stopMotor() }, 1600)
        break
      }
      case 'motorFlank': {
        startMotor(); updateMotor(16, 16, false)
        later(() => { if (!sea) stopMotor() }, 1600)
        break
      }
      case 'closeAboard': {
        updateClose([{id: 'demo', local: CLOSE, range: 150, voice: k.SHIP_TYPES.tanker.voice, escort: false}], false)
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
      case 'spent': torpedoSpent({forward: 900, starboard: 200}); break
      case 'acquired': acquired(); break
      case 'escortTurn': escortTurn(STBD); break
      case 'splash': chargeSplash({forward: 200, starboard: 120}, k.CHARGE_FALL_TIME); break
      case 'detonateNear': chargeDetonate({forward: 60, starboard: -40}, 0.9, false); break
      case 'detonateDeep': chargeDetonate({forward: 60, starboard: -40}, 0.9, true); break
      case 'diveDeep': depthChange('deep'); break
      case 'risePeriscope': depthChange('periscope'); break
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
    fire,
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
