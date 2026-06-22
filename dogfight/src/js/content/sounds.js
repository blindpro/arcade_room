/**
 * Library of one-shot synthesized SFX. Each function spawns an audio
 * graph at the given world position, schedules its envelope, and
 * disconnects itself. UI-class sounds are non-spatial (passed straight
 * to the master bus).
 */
content.sounds = (() => {
  function ctx() { return engine.context() }
  function now() { return engine.time() }

  // --- helpers -------------------------------------------------------

  function spatialNode() {
    // A binaural ear, updated once for the lifetime of a one-shot.
    return engine.ear.binaural.create()
  }

  function playSpatial({x, y}, attachInput) {
    const ear = spatialNode()
    ear.to(engine.mixer.output())

    const listener = engine.position.getVector()
    const relative = {
      x: x - listener.x,
      y: y - listener.y,
      z: 0,
    }
    // Rotate into listener-local frame using yaw
    const lq = engine.position.getQuaternion()
    // For 2D, derive yaw from quaternion: yaw = 2 * atan2(z, w) when only yaw is set.
    const yaw = 2 * Math.atan2(lq.z, lq.w)
    const cos = Math.cos(-yaw), sin = Math.sin(-yaw)
    const local = {
      x: relative.x * cos - relative.y * sin,
      y: relative.x * sin + relative.y * cos,
      z: 0,
    }
    ear.update(local)

    const node = attachInput()
    ear.from(node)

    return ear
  }

  function disconnectAfter(node, when, ear) {
    setTimeout(() => {
      try { node.disconnect() } catch (e) {}
      try { ear.destroy() } catch (e) {}
    }, Math.max(50, (when - now()) * 1000 + 200))
  }

  function envelope(gain, t0, attack, hold, release, peak) {
    gain.cancelScheduledValues(t0)
    gain.setValueAtTime(0, t0)
    gain.linearRampToValueAtTime(peak, t0 + attack)
    gain.setValueAtTime(peak, t0 + attack + hold)
    gain.linearRampToValueAtTime(0, t0 + attack + hold + release)
  }

  // --- one-shots -----------------------------------------------------

  function collision(position, severity = 0.5) {
    const t0 = now()
    const dur = 0.6
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0

      const buf = engine.buffer.whiteNoise({channels: 1, duration: dur})
      const src = c.createBufferSource()
      src.buffer = buf
      const bp = c.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(1200 + 1000 * severity, t0)
      bp.frequency.exponentialRampToValueAtTime(80, t0 + dur)
      bp.Q.value = 2
      const ng = c.createGain()
      ng.gain.value = 0
      envelope(ng.gain, t0, 0.003, 0.08, dur - 0.083, 0.7 * severity + 0.4)
      src.connect(bp).connect(ng).connect(out)
      src.start(t0)

      const crunch = c.createOscillator()
      crunch.type = 'sawtooth'
      crunch.frequency.setValueAtTime(80, t0)
      crunch.frequency.exponentialRampToValueAtTime(15, t0 + dur * 0.7)
      const cg = c.createGain()
      cg.gain.value = 0
      envelope(cg.gain, t0, 0.003, 0.12, dur * 0.5, 0.35)
      crunch.connect(cg).connect(out)
      crunch.start(t0)
      crunch.stop(t0 + dur)

      const sub = c.createOscillator()
      sub.type = 'sine'
      sub.frequency.setValueAtTime(80, t0)
      sub.frequency.exponentialRampToValueAtTime(25, t0 + dur * 0.6)
      const sg = c.createGain()
      sg.gain.value = 0
      envelope(sg.gain, t0, 0.002, 0.1, dur * 0.5, 0.5 * severity + 0.2)
      sub.connect(sg).connect(out)
      sub.start(t0)
      sub.stop(t0 + dur)

      envelope(out.gain, t0, 0.003, 0.1, dur - 0.103, engine.fn.clamp(0.5 + severity * 0.6, 0.4, 1.0))
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.2, ear)
  }

  /**
   * Distant-feeling wall thud for *other* cars hitting a wall. Lower
   * fundamental and a low-pass-filtered noise burst so it reads as
   * "something happened over there" rather than "I just hit something."
   * Spatialised at the wall-hit position; relies on the binaural pan
   * to convey direction.
   */
  function wallThud(position, severity = 0.5) {
    const t0 = now()
    const dur = 0.40
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0

      // Sub thump — lower than collision() so it doesn't compete with
      // the listener's own hits.
      const osc = c.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(80 + 25 * severity, t0)
      osc.frequency.exponentialRampToValueAtTime(28, t0 + dur)
      osc.connect(out)
      osc.start(t0)
      osc.stop(t0 + dur + 0.05)

      // Muffled noise burst (lowpass kept low — others' bumps shouldn't
      // be bright/in-your-face).
      const buf = engine.buffer.whiteNoise({channels: 1, duration: dur})
      const src = c.createBufferSource()
      src.buffer = buf
      const nf = c.createBiquadFilter()
      nf.type = 'lowpass'
      nf.frequency.setValueAtTime(700 + 400 * severity, t0)
      nf.frequency.exponentialRampToValueAtTime(150, t0 + dur)
      const ng = c.createGain()
      ng.gain.value = 0
      envelope(ng.gain, t0, 0.005, 0.03, dur - 0.035, 0.35 * severity + 0.15)
      src.connect(nf).connect(ng).connect(out)
      src.start(t0)

      // Lower overall peak than collision() so distant bumps stay subtle.
      envelope(out.gain, t0, 0.005, 0.04, dur - 0.045, engine.fn.clamp(0.18 + severity * 0.45, 0.18, 0.7))
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.2, ear)
  }

  function wallScrape(position, speed) {
    // Short tick on demand — a continuous version is built in content.car.
    const t0 = now()
    const dur = 0.15
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0

      const buf = engine.buffer.pinkNoise({channels: 1, duration: dur})
      const src = c.createBufferSource()
      src.buffer = buf
      const f = c.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = 1800
      f.Q.value = 4
      src.connect(f).connect(out)
      src.start(t0)

      envelope(out.gain, t0, 0.01, 0.05, dur - 0.06, engine.fn.clamp(speed * 0.15, 0.05, 0.5))
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.1, ear)
  }

  /**
   * Played when the player deals damage. Four ascending notes;
   * `magnitude` (0..1) raises the base pitch and shortens the
   * gap between notes so big hits feel snappier.
   */
  function scoring(magnitude = 0.4) {
    const m = engine.fn.clamp(magnitude, 0, 1)
    const c = ctx()
    const t0 = now()
    const out = c.createGain()
    out.gain.value = 0.5
    out.connect(engine.mixer.output())

    const baseFreq = engine.fn.lerp(300, 700, m)
    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(baseFreq, t0)
    o.frequency.linearRampToValueAtTime(baseFreq * 0.5, t0 + 0.1)
    o.connect(out)
    o.start(t0)
    o.stop(t0 + 0.12)
    envelope(out.gain, t0, 0.002, 0.03, 0.08, 0.5)
    o.onended = () => { try { out.disconnect() } catch (e) {} }
  }

  /**
   * Played when the player *takes* damage (hit by another car). A short
   * descending square-wave buzzer, spatialised at the impact point.
   */
  function buzzer(position, severity = 0.6) {
    const t0 = now()
    const dur = 0.25 + severity * 0.15
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0

      const o = c.createOscillator()
      o.type = 'triangle'
      o.frequency.setValueAtTime(600 + 400 * severity, t0)
      o.frequency.exponentialRampToValueAtTime(200, t0 + dur)
      o.connect(out)
      o.start(t0)
      o.stop(t0 + dur + 0.05)

      const buf = engine.buffer.whiteNoise({channels: 1, duration: dur})
      const src = c.createBufferSource()
      src.buffer = buf
      const bp = c.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(3000, t0)
      bp.frequency.linearRampToValueAtTime(500, t0 + dur)
      bp.Q.value = 2
      const ng = c.createGain()
      ng.gain.value = 0
      envelope(ng.gain, t0, 0.005, 0.02, dur - 0.025, 0.2)
      src.connect(bp).connect(ng).connect(out)
      src.start(t0)

      envelope(out.gain, t0, 0.005, 0.04, dur - 0.045, engine.fn.clamp(0.3 + severity * 0.4, 0.3, 0.8))
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.2, ear)
  }

  function eliminate(position) {
    const t0 = now()
    const dur = 1.2
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0

      const impact = c.createOscillator()
      impact.type = 'sine'
      impact.frequency.setValueAtTime(120, t0)
      impact.frequency.exponentialRampToValueAtTime(15, t0 + dur * 0.8)
      const ig = c.createGain()
      ig.gain.value = 0
      envelope(ig.gain, t0, 0.003, 0.2, dur * 0.6, 0.8)
      impact.connect(ig).connect(out)
      impact.start(t0)
      impact.stop(t0 + dur + 0.05)

      const noiseBuf = engine.buffer.whiteNoise({channels: 1, duration: dur})
      const noise = c.createBufferSource()
      noise.buffer = noiseBuf
      const bp = c.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(2000, t0)
      bp.frequency.exponentialRampToValueAtTime(60, t0 + dur)
      bp.Q.value = 1.5
      const ng = c.createGain()
      ng.gain.value = 0
      envelope(ng.gain, t0, 0.005, 0.25, dur - 0.255, 0.85)
      noise.connect(bp).connect(ng).connect(out)
      noise.start(t0)

      const sub = c.createOscillator()
      sub.type = 'sawtooth'
      sub.frequency.setValueAtTime(50, t0)
      sub.frequency.exponentialRampToValueAtTime(8, t0 + dur)
      const sg = c.createGain()
      sg.gain.value = 0
      envelope(sg.gain, t0, 0.01, 0.3, dur - 0.31, 0.5)
      sub.connect(sg).connect(out)
      sub.start(t0)
      sub.stop(t0 + dur + 0.05)

      envelope(out.gain, t0, 0.003, 0.2, dur - 0.203, 0.9)
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.25, ear)
  }

  // --- non-spatial UI / global cues ----------------------------------

  function uiTick(freq = 800, gain = 0.3, dur = 0.06) {
    const c = ctx()
    const t0 = now()
    const out = c.createGain()
    out.gain.value = 0
    out.connect(engine.mixer.output())

    const osc = c.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = freq
    osc.connect(out)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
    envelope(out.gain, t0, 0.005, 0.01, dur - 0.015, gain)

    osc.onended = () => out.disconnect()
  }

  function uiFocus()    { uiTick(800, 0.18, 0.05) }
  function uiBack()     { uiTick(500, 0.22, 0.07) }

  /**
   * Lobby cue: a peer joined the room. Two-note ascending blip — short,
   * unobtrusive, distinct from `uiFocus` so it reads as "something
   * happened" rather than "you focused something".
   */
  function peerJoin() {
    const c = ctx()
    const t0 = now()
    const out = c.createGain()
    out.gain.value = 0
    out.connect(engine.mixer.output())
    ;[660, 990].forEach((f, i) => {
      const o = c.createOscillator()
      o.type = 'sine'
      o.frequency.value = f
      const g = c.createGain()
      g.gain.value = 0
      o.connect(g).connect(out)
      const start = t0 + i * 0.09
      envelope(g.gain, start, 0.005, 0.04, 0.08, 0.4)
      o.start(start)
      o.stop(start + 0.16)
    })
    out.gain.value = 1
    setTimeout(() => { try { out.disconnect() } catch (e) {} }, 500)
  }

  /**
   * Lobby cue: a peer left the room. Mirror of `peerJoin` — two-note
   * descending blip so the user can tell join from leave at a glance.
   */
  function peerLeave() {
    const c = ctx()
    const t0 = now()
    const out = c.createGain()
    out.gain.value = 0
    out.connect(engine.mixer.output())
    ;[660, 440].forEach((f, i) => {
      const o = c.createOscillator()
      o.type = 'sine'
      o.frequency.value = f
      const g = c.createGain()
      g.gain.value = 0
      o.connect(g).connect(out)
      const start = t0 + i * 0.09
      envelope(g.gain, start, 0.005, 0.04, 0.08, 0.4)
      o.start(start)
      o.stop(start + 0.16)
    })
    out.gain.value = 1
    setTimeout(() => { try { out.disconnect() } catch (e) {} }, 500)
  }

  /**
   * Hold-to-honk horn voices, one per honking car. Each voice owns its
   * own binaural ear so the listener hears every honk panned to the
   * honker's position.
   *
   * Sustained — no tremolo / no beep loop. Hold Space and you get a
   * continuous "beeeeeeep" until release. Timbre is intentionally
   * obnoxious: two detuned saw oscillators around a 400 Hz fundamental
   * (the classic car-horn pitch) plus a fifth on top for harmonic bite,
   * passed through a mild lowpass to keep it from being ear-shredding.
   * Sounds like a leaning-on-the-horn taxi driver, not a toy beep.
   *
   * Volumes are deliberately capped low so even a full lobby of trolls
   * can't drown out gameplay-critical cues (collisions, announcer).
   *
   * Lifecycle: `startHorn(carId)` / `stopHorn(carId)`. Idempotent — a
   * second start while already running is a no-op (snapshot replays
   * after the local immediate-start are harmless), and a stop on an
   * unknown id is also a no-op. `updateHornsSpatial` reposes the binaural
   * ear each frame; `stopAllHorns` is the round-end / disconnect cleanup.
   */
  const hornVoices = new Map()  // carId -> {ear, out, voices}

  function startHorn(carId, hornOffset) {
    if (hornVoices.has(carId)) return
    if (hornOffset === undefined) hornOffset = 0
    const c = ctx()
    const t0 = now()
    // Trumpet-like four-note motif looping while held. Two detuned saws
    // (7 Hz apart) through a lowpass give a muted-brass texture; per-note
    // attack/release give distinct articulation rather than a sustained tone.
    const NOTES    = [620, 700, 800, 700]
    const NOTE_DUR = 0.080   // 90 ms per note
    const ATTACK   = 0.010   // 10 ms attack
    const HOLD_END = 0.075   // release starts at 75 ms (15 ms release to NOTE_DUR)
    const DETUNE   = 7       // Hz between the two saws
    const PEAK     = 0.13    // capped low so a lobby of honkers can't bury cues

    const ear = engine.ear.binaural.create()
    ear.to(engine.mixer.output())

    const out = c.createGain()
    out.gain.value = 0

    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1500
    lp.Q.value = 1.0
    lp.connect(out)

    const sawA = c.createOscillator()
    sawA.type = 'sawtooth'
    const sawB = c.createOscillator()
    sawB.type = 'sawtooth'
    sawA.connect(lp)
    sawB.connect(lp)

    ear.from(out)
    sawA.start(t0)
    sawB.start(t0)

    let noteIndex = 0
    let scheduleTime = t0

    function scheduleChunk() {
      const lookahead = now() + 0.6
      while (scheduleTime < lookahead) {
        const freq = NOTES[noteIndex % NOTES.length] + hornOffset
        const t = scheduleTime
        sawA.frequency.setValueAtTime(freq, t)
        sawB.frequency.setValueAtTime(freq + DETUNE, t)
        out.gain.setValueAtTime(0, t)
        out.gain.linearRampToValueAtTime(PEAK, t + ATTACK)
        out.gain.setValueAtTime(PEAK, t + HOLD_END)
        out.gain.linearRampToValueAtTime(0, t + NOTE_DUR)
        scheduleTime += NOTE_DUR
        noteIndex++
      }
    }

    scheduleChunk()
    const interval = setInterval(scheduleChunk, 250)

    hornVoices.set(carId, {ear, out, voices: [sawA, sawB], interval})
  }

  function stopHorn(carId) {
    const v = hornVoices.get(carId)
    if (!v) return
    hornVoices.delete(carId)
    clearInterval(v.interval)
    const t = ctx().currentTime
    v.out.gain.cancelScheduledValues(t)
    v.out.gain.setValueAtTime(v.out.gain.value, t)
    v.out.gain.linearRampToValueAtTime(0, t + 0.025)
    setTimeout(() => {
      for (const o of v.voices) { try { o.stop() } catch (e) {} }
      try { v.out.disconnect() } catch (e) {}
      try { v.ear.destroy() } catch (e) {}
    }, 90)
  }

  /**
   * Reposition active horn voices in listener-local space. Called once
   * per frame from content.game.updateAudioStage (host + client). Pass
   * a `getCarPosition(carId)` so the caller can resolve ids without
   * sounds.js holding a reference to the cars list.
   */
  function updateHornsSpatial(getCarPosition, listenerPos, listenerYaw) {
    if (!hornVoices.size) return
    const cos = Math.cos(-listenerYaw), sin = Math.sin(-listenerYaw)
    for (const [carId, voice] of hornVoices) {
      const pos = getCarPosition(carId)
      if (!pos) continue
      const dx = pos.x - listenerPos.x
      const dy = pos.y - listenerPos.y
      voice.ear.update({
        x: dx * cos - dy * sin,
        y: dx * sin + dy * cos,
        z: 0,
      })
    }
  }

  function stopAllHorns() {
    for (const carId of [...hornVoices.keys()]) stopHorn(carId)
  }

  function roundStart() {
    const t0 = now()
    const c = ctx()
    const out = c.createGain()
    out.gain.value = 0
    out.connect(engine.mixer.output())

    ;[660, 880, 1320].forEach((f, i) => {
      const o = c.createOscillator()
      o.type = 'sine'
      o.frequency.value = f
      const g = c.createGain()
      g.gain.value = 0
      o.connect(g).connect(out)
      const start = t0 + i * 0.18
      envelope(g.gain, start, 0.01, 0.06, 0.1, 0.5)
      o.start(start)
      o.stop(start + 0.2)
    })
    out.gain.value = 1
    setTimeout(() => out.disconnect(), 1200)
  }

  function roundEnd(win) {
    const t0 = now()
    const c = ctx()
    const out = c.createGain()
    out.gain.value = 0
    out.connect(engine.mixer.output())

    const notes = win ? [523, 659, 784, 1046] : [220, 175, 147, 110]
    notes.forEach((f, i) => {
      const o = c.createOscillator()
      o.type = win ? 'triangle' : 'sawtooth'
      o.frequency.value = f
      const g = c.createGain()
      g.gain.value = 0
      o.connect(g).connect(out)
      const start = t0 + i * 0.22
      envelope(g.gain, start, 0.02, 0.15, 0.25, 0.45)
      o.start(start)
      o.stop(start + 0.45)
    })
    out.gain.value = 1
    setTimeout(() => out.disconnect(), 2500)
  }

  function heartbeat() {
    // One pulse. Caller schedules the next based on health.
    const t0 = now()
    const c = ctx()
    const out = c.createGain()
    out.gain.value = 0
    out.connect(engine.mixer.output())

    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(140, t0)
    o.frequency.exponentialRampToValueAtTime(70, t0 + 0.18)
    o.connect(out)
    o.start(t0)
    o.stop(t0 + 0.22)
    envelope(out.gain, t0, 0.005, 0.04, 0.16, 0.45)
    o.onended = () => out.disconnect()
  }

  function gunsCooled() {
    const t0 = now()
    const c = ctx()
    const out = c.createGain()
    out.gain.value = 0
    out.connect(engine.mixer.output())

    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(520, t0)
    o.frequency.linearRampToValueAtTime(680, t0 + 0.1)
    o.connect(out)
    o.start(t0)
    o.stop(t0 + 0.15)
    envelope(out.gain, t0, 0.01, 0.06, 0.1, 0.18)
    o.onended = () => { try { out.disconnect() } catch (e) {} }
  }

  function nearLock() {
    const t0 = now()
    const c = ctx()
    const out = c.createGain()
    out.gain.value = 0
    out.connect(engine.mixer.output())

    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = 440
    o.connect(out)
    o.start(t0)
    o.stop(t0 + 0.12)
    envelope(out.gain, t0, 0.008, 0.04, 0.072, 0.1)
    o.onended = () => { try { out.disconnect() } catch (e) {} }
  }

  // --- Missile flyby voices ------------------------------------------

  var missileVoices = new Map()

  function createMissileVoice(id, position) {
    if (missileVoices.has(id)) return
    const c = ctx()
    const t0 = now()

    const ear = engine.ear.binaural.create()
    ear.to(engine.mixer.output())

    const out = c.createGain()
    out.gain.value = 0

    const noiseBuf = engine.buffer.whiteNoise({channels: 1, duration: 1.0})
    const noise = c.createBufferSource()
    noise.buffer = noiseBuf
    noise.loop = true
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 900
    bp.Q.value = 2
    const ng = c.createGain()
    ng.gain.value = 0.18

    const osc = c.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = 320
    const og = c.createGain()
    og.gain.value = 0.1

    noise.connect(bp).connect(ng).connect(out)
    osc.connect(og).connect(out)
    noise.start(t0)
    osc.start(t0)

    out.gain.setValueAtTime(0, t0)
    out.gain.linearRampToValueAtTime(0.25, t0 + 0.15)

    ear.from(out)

    missileVoices.set(id, {ear, out, noise, osc})
    updateMissileVoice(id, position)
    return id
  }

  function updateMissileVoice(id, position) {
    const v = missileVoices.get(id)
    if (!v) return
    const listener = engine.position.getVector()
    const lq = engine.position.getQuaternion()
    const yaw = 2 * Math.atan2(lq.z, lq.w)
    const cos = Math.cos(-yaw), sin = Math.sin(-yaw)
    v.ear.update({
      x: (position.x - listener.x) * cos - (position.y - listener.y) * sin,
      y: (position.x - listener.x) * sin + (position.y - listener.y) * cos,
      z: 0,
    })
  }

  function destroyMissileVoice(id) {
    const v = missileVoices.get(id)
    if (!v) return
    missileVoices.delete(id)
    try {
      v.out.gain.linearRampToValueAtTime(0, ctx().currentTime + 0.1)
      setTimeout(() => {
        try { v.noise.stop() } catch (e) {}
        try { v.osc.stop() } catch (e) {}
        try { v.out.disconnect() } catch (e) {}
        try { v.ear.destroy() } catch (e) {}
      }, 150)
    } catch (e) {}
  }

  function destroyAllMissileVoices() {
    for (const id of [...missileVoices.keys()]) destroyMissileVoice(id)
  }

  // --- Arcade-mode sounds --------------------------------------------

  /**
   * One-shot pickup chime — health pack acquired (player or AI).
   * Bright bell-like ping at the pickup location.
   */
  function pickupHealth(position) {
    const t0 = now()
    const dur = 0.6
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0
      ;[1318, 1760, 2637].forEach((f, i) => {
        const o = c.createOscillator()
        o.type = 'sine'
        o.frequency.value = f
        const g = c.createGain()
        g.gain.value = 0
        o.connect(g).connect(out)
        const start = t0 + i * 0.04
        envelope(g.gain, start, 0.005, 0.04, 0.4, 0.45)
        o.start(start)
        o.stop(start + 0.5)
      })
      out.gain.value = 1
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.3, ear)
  }

  function pickupShield(position) {
    const t0 = now()
    const dur = 0.55
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0

      const o = c.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(220, t0)
      o.frequency.exponentialRampToValueAtTime(660, t0 + dur)
      o.connect(out)
      o.start(t0)
      o.stop(t0 + dur + 0.05)

      // Tremolo for the elastic feel
      const lfo = c.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.value = 14
      const lfoGain = c.createGain()
      lfoGain.gain.value = 0.25
      const carrier = c.createGain()
      carrier.gain.value = 0.7
      lfo.connect(lfoGain).connect(carrier.gain)
      o.disconnect(); o.connect(carrier).connect(out)
      lfo.start(t0)
      lfo.stop(t0 + dur + 0.05)

      envelope(out.gain, t0, 0.01, 0.05, dur - 0.06, 0.55)
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.3, ear)
  }

  function pickupBullets(position) {
    const t0 = now()
    const dur = 0.5
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0

      const o = c.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(180, t0)
      o.frequency.exponentialRampToValueAtTime(900, t0 + 0.18)
      o.frequency.exponentialRampToValueAtTime(220, t0 + dur)
      o.connect(out)
      o.start(t0)
      o.stop(t0 + dur + 0.05)

      envelope(out.gain, t0, 0.005, 0.06, dur - 0.07, 0.55)
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.3, ear)
  }

  function pickupMine(position) {
    const t0 = now()
    const dur = 0.45
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0

      const o = c.createOscillator()
      o.type = 'square'
      o.frequency.setValueAtTime(420, t0)
      o.frequency.linearRampToValueAtTime(280, t0 + dur)
      o.connect(out)
      o.start(t0)
      o.stop(t0 + dur + 0.05)

      envelope(out.gain, t0, 0.005, 0.04, dur - 0.05, 0.4)
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.3, ear)
  }

  /**
   * One-shot when a speed-burst pickup is grabbed: rising whoosh.
   */
  function pickupSpeed(position) {
    const t0 = now()
    const dur = 0.55
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0

      const o = c.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(180, t0)
      o.frequency.exponentialRampToValueAtTime(900, t0 + dur)
      const lp = c.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 1600
      lp.Q.value = 4
      o.connect(lp).connect(out)
      o.start(t0)
      o.stop(t0 + dur + 0.05)

      envelope(out.gain, t0, 0.01, 0.06, dur - 0.07, 0.45)
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.3, ear)
  }

  /**
   * One-shot when a teleport pickup is grabbed: bright shimmering chime.
   */
  function pickupTeleport(position) {
    const t0 = now()
    const dur = 0.55
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0
      ;[1320, 1980, 2640, 3300].forEach((f, i) => {
        const o = c.createOscillator()
        o.type = 'sine'
        o.frequency.value = f
        const g = c.createGain()
        g.gain.value = 0
        o.connect(g).connect(out)
        const start = t0 + i * 0.045
        envelope(g.gain, start, 0.005, 0.04, 0.4, 0.32)
        o.start(start)
        o.stop(start + 0.5)
      })
      out.gain.value = 1
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.3, ear)
  }

  /**
   * Spatial cue played at the *old* position when a car teleports away.
   * Whoosh-and-sparkle: filtered noise sweeping up plus a rising sine
   * pair, so any peer hearing it knows "someone vanished from there".
   */
  function teleport(position) {
    const t0 = now()
    const dur = 0.7
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0

      // Rising sweep (a sine "whoosh" that climbs out of audibility).
      const sweep = c.createOscillator()
      sweep.type = 'sine'
      sweep.frequency.setValueAtTime(220, t0)
      sweep.frequency.exponentialRampToValueAtTime(2200, t0 + dur)
      const sweepGain = c.createGain()
      sweepGain.gain.value = 0
      envelope(sweepGain.gain, t0, 0.005, 0.05, dur - 0.06, 0.45)
      sweep.connect(sweepGain).connect(out)
      sweep.start(t0)
      sweep.stop(t0 + dur + 0.05)

      // Detuned partial for the "phasing" sci-fi feel.
      const partial = c.createOscillator()
      partial.type = 'triangle'
      partial.frequency.setValueAtTime(330, t0)
      partial.frequency.exponentialRampToValueAtTime(3300, t0 + dur)
      const partialGain = c.createGain()
      partialGain.gain.value = 0
      envelope(partialGain.gain, t0, 0.005, 0.05, dur - 0.06, 0.25)
      partial.connect(partialGain).connect(out)
      partial.start(t0)
      partial.stop(t0 + dur + 0.05)

      // Bandpassed noise sparkle.
      const noise = c.createBufferSource()
      noise.buffer = engine.buffer.whiteNoise({channels: 1, duration: dur + 0.1})
      const bp = c.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(900, t0)
      bp.frequency.exponentialRampToValueAtTime(4500, t0 + dur)
      bp.Q.value = 6
      const noiseGain = c.createGain()
      noiseGain.gain.value = 0
      envelope(noiseGain.gain, t0, 0.005, 0.05, dur - 0.06, 0.5)
      noise.connect(bp).connect(noiseGain).connect(out)
      noise.start(t0)
      noise.stop(t0 + dur + 0.05)

      envelope(out.gain, t0, 0.005, 0.06, dur - 0.07, 0.85)
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.3, ear)
  }

  /**
   * Activation cue when a car uses a speed burst: short noisy whoosh
   * with a bright pitch sweep so it's distinctive at any spatial range.
   */
  function boostActivated(position) {
    const t0 = now()
    const dur = 0.6
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0

      const noise = c.createBufferSource()
      noise.buffer = engine.buffer.whiteNoise({channels: 1, duration: dur + 0.2})
      const bp = c.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(800, t0)
      bp.frequency.exponentialRampToValueAtTime(2400, t0 + dur)
      bp.Q.value = 6
      noise.connect(bp).connect(out)
      noise.start(t0)
      noise.stop(t0 + dur + 0.05)

      const o = c.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(220, t0)
      o.frequency.exponentialRampToValueAtTime(1200, t0 + dur)
      const oGain = c.createGain()
      oGain.gain.value = 0.4
      o.connect(oGain).connect(out)
      o.start(t0)
      o.stop(t0 + dur + 0.05)

      envelope(out.gain, t0, 0.005, 0.05, dur - 0.06, 0.6)
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.3, ear)
  }

  /**
   * "Can't fire yet" denial buzz — short low square-wave bleat used
   * when the player tries to shoot during the bullet cooldown. Quick
   * and unobtrusive; not networked (it's purely local UX feedback).
   */
  function bulletDenied() {
    const t0 = now()
    const dur = 0.18
    const c = ctx()
    const out = c.createGain()
    out.gain.value = 0
    out.connect(engine.mixer.output())

    const o = c.createOscillator()
    o.type = 'square'
    o.frequency.setValueAtTime(280, t0)
    o.frequency.linearRampToValueAtTime(180, t0 + dur)
    o.connect(out)
    o.start(t0)
    o.stop(t0 + dur + 0.05)

    out.gain.setValueAtTime(0, t0)
    out.gain.linearRampToValueAtTime(0.10, t0 + 0.005)
    out.gain.linearRampToValueAtTime(0, t0 + dur - 0.01)

    o.onended = () => { try { out.disconnect() } catch (e) {} }
  }

  /**
   * Subtle wind-down when a boost expires.
   */
  function boostExpired(position) {
    const t0 = now()
    const dur = 0.35
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0

      const o = c.createOscillator()
      o.type = 'triangle'
      o.frequency.setValueAtTime(900, t0)
      o.frequency.exponentialRampToValueAtTime(220, t0 + dur)
      o.connect(out)
      o.start(t0)
      o.stop(t0 + dur + 0.05)

      envelope(out.gain, t0, 0.005, 0.04, dur - 0.05, 0.3)
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.3, ear)
  }

  /**
   * Shield-blocked impact: short elastic boing instead of damage buzz.
   */
  function shieldBlock(position) {
    const t0 = now()
    const dur = 0.45
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0

      const o = c.createOscillator()
      o.type = 'triangle'
      o.frequency.setValueAtTime(660, t0)
      o.frequency.exponentialRampToValueAtTime(220, t0 + dur)
      o.connect(out)
      o.start(t0)
      o.stop(t0 + dur + 0.05)

      const lfo = c.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.value = 22
      const lfoGain = c.createGain()
      lfoGain.gain.value = 30
      lfo.connect(lfoGain).connect(o.frequency)
      lfo.start(t0)
      lfo.stop(t0 + dur + 0.05)

      envelope(out.gain, t0, 0.005, 0.05, dur - 0.06, 0.65)
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.3, ear)
  }

  /**
   * Explosion (bullet hit or mine detonation).
   */
  function explosion(position, severity = 0.7) {
    const t0 = now()
    const dur = 0.55 + severity * 0.3
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0

      // Sub thump
      const sub = c.createOscillator()
      sub.type = 'sine'
      sub.frequency.setValueAtTime(110, t0)
      sub.frequency.exponentialRampToValueAtTime(35, t0 + dur)
      const subGain = c.createGain()
      subGain.gain.value = 0.85
      sub.connect(subGain).connect(out)
      sub.start(t0)
      sub.stop(t0 + dur + 0.05)

      // Noise burst
      const buf = engine.buffer.whiteNoise({channels: 1, duration: dur})
      const src = c.createBufferSource()
      src.buffer = buf
      const f = c.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.setValueAtTime(3000, t0)
      f.frequency.exponentialRampToValueAtTime(160, t0 + dur)
      const ng = c.createGain()
      ng.gain.value = 0
      envelope(ng.gain, t0, 0.005, 0.04, dur - 0.05, 0.7)
      src.connect(f).connect(ng).connect(out)
      src.start(t0)

      envelope(out.gain, t0, 0.005, 0.06, dur - 0.07, engine.fn.clamp(0.7 + severity * 0.4, 0.5, 1.2))
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.3, ear)
  }

  /**
   * One-shot when a repulsor pickup is grabbed: low thrumming pulse.
   */
  function pickupRepulsor(position) {
    const t0 = now()
    const dur = 0.5
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0

      const o = c.createOscillator()
      o.type = 'triangle'
      o.frequency.setValueAtTime(110, t0)
      o.frequency.linearRampToValueAtTime(220, t0 + dur)
      o.connect(out)
      o.start(t0)
      o.stop(t0 + dur + 0.05)

      const lfo = c.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.value = 8
      const lfoGain = c.createGain()
      lfoGain.gain.value = 0.3
      lfo.connect(lfoGain).connect(out.gain)
      lfo.start(t0)
      lfo.stop(t0 + dur + 0.05)

      envelope(out.gain, t0, 0.01, 0.1, dur - 0.11, 0.5)
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.3, ear)
  }

  /**
   * One-shot when a rocket pickup is grabbed: high-energy ascending buzz.
   */
  function pickupRocket(position) {
    const t0 = now()
    const dur = 0.45
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0

      const o = c.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(300, t0)
      o.frequency.exponentialRampToValueAtTime(900, t0 + dur)
      const lp = c.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 2000
      lp.Q.value = 3
      o.connect(lp).connect(out)
      o.start(t0)
      o.stop(t0 + dur + 0.05)

      envelope(out.gain, t0, 0.005, 0.04, dur - 0.05, 0.5)
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.3, ear)
  }

  // --- Repulsor Blast ------------------------------------------------

  /**
   * Deep "WOOMF" — low-passed noise burst with a sub sine sweep.
   * Spatialised at the activator's position. All peers hear it.
   */
  function repulsorActivated(position) {
    const t0 = now()
    const dur = 0.55
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0

      // Sub thump — the chest-hit
      const sub = c.createOscillator()
      sub.type = 'sine'
      sub.frequency.setValueAtTime(80, t0)
      sub.frequency.exponentialRampToValueAtTime(35, t0 + dur)
      const subGain = c.createGain()
      subGain.gain.value = 0.8
      sub.connect(subGain).connect(out)
      sub.start(t0)
      sub.stop(t0 + dur + 0.05)

      // Bandpassed noise for the "pressure wave"
      const noise = c.createBufferSource()
      noise.buffer = engine.buffer.whiteNoise({channels: 1, duration: dur + 0.1})
      const bp = c.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(400, t0)
      bp.frequency.exponentialRampToValueAtTime(100, t0 + dur)
      bp.Q.value = 6
      const noiseGain = c.createGain()
      noiseGain.gain.value = 0
      envelope(noiseGain.gain, t0, 0.005, 0.04, dur - 0.05, 0.6)
      noise.connect(bp).connect(noiseGain).connect(out)
      noise.start(t0)
      noise.stop(t0 + dur + 0.05)

      envelope(out.gain, t0, 0.005, 0.08, dur - 0.09, 0.75)
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.3, ear)
  }

  // --- Rocket Boost --------------------------------------------------

  /**
   * Rising whoosh when a rocket fires. Short, aggressive, immediate.
   */
  function rocketActivated(position) {
    const t0 = now()
    const dur = 0.45
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0

      // Rapid ascending saw
      const o = c.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(200, t0)
      o.frequency.exponentialRampToValueAtTime(2000, t0 + dur)
      const lp = c.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 3000
      lp.Q.value = 3
      o.connect(lp).connect(out)
      o.start(t0)
      o.stop(t0 + dur + 0.05)

      // Noise burst
      const noise = c.createBufferSource()
      noise.buffer = engine.buffer.whiteNoise({channels: 1, duration: dur + 0.1})
      const bp = c.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(1000, t0)
      bp.frequency.exponentialRampToValueAtTime(3500, t0 + dur)
      bp.Q.value = 4
      const ng = c.createGain()
      ng.gain.value = 0
      envelope(ng.gain, t0, 0.005, 0.04, dur - 0.05, 0.5)
      noise.connect(bp).connect(ng).connect(out)
      noise.start(t0)
      noise.stop(t0 + dur + 0.05)

      envelope(out.gain, t0, 0.005, 0.04, dur - 0.05, 0.65)
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.3, ear)
  }

  /**
   * Descending wind-down when a rocket expires.
   */
  function rocketExpired(position) {
    const t0 = now()
    const dur = 0.4
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0

      const o = c.createOscillator()
      o.type = 'triangle'
      o.frequency.setValueAtTime(1200, t0)
      o.frequency.exponentialRampToValueAtTime(200, t0 + dur)
      o.connect(out)
      o.start(t0)
      o.stop(t0 + dur + 0.05)

      envelope(out.gain, t0, 0.005, 0.04, dur - 0.05, 0.3)
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.3, ear)
  }

  var machineGunInterval = null
  var machineGunLastPos = {x: 0, y: 0}

  function gunCrack(position) {
    const t0 = now()
    const dur = 0.05
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0

      const buf = engine.buffer.whiteNoise({channels: 1, duration: dur + 0.1})
      const src = c.createBufferSource()
      src.buffer = buf
      const hp = c.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 1200
      const ng = c.createGain()
      ng.gain.value = 0
      envelope(ng.gain, t0, 0.001, 0.005, dur - 0.006, 0.35)
      src.connect(hp).connect(ng).connect(out)
      src.start(t0)
      src.stop(t0 + dur + 0.05)

      const thump = c.createOscillator()
      thump.type = 'sine'
      thump.frequency.setValueAtTime(250, t0)
      thump.frequency.exponentialRampToValueAtTime(60, t0 + dur)
      const tg = c.createGain()
      tg.gain.value = 0
      envelope(tg.gain, t0, 0.001, 0.008, dur - 0.009, 0.2)
      thump.connect(tg).connect(out)
      thump.start(t0)
      thump.stop(t0 + dur + 0.05)

      envelope(out.gain, t0, 0.001, 0.008, dur - 0.009, 0.4)
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.2, ear)
  }

  function startMachineGun(position) {
    machineGunLastPos.x = position.x
    machineGunLastPos.y = position.y
    if (machineGunInterval) return
    machineGunInterval = setInterval(() => {
      gunCrack(machineGunLastPos)
    }, 180)
    gunCrack(machineGunLastPos)
  }

  function stopMachineGun() {
    if (machineGunInterval) {
      clearInterval(machineGunInterval)
      machineGunInterval = null
    }
  }

  function missileLaunch(position) {
    const t0 = now()
    const dur = 0.55
    const ear = playSpatial(position, () => {
      const c = ctx()
      const out = c.createGain()
      out.gain.value = 0

      const noise = c.createBufferSource()
      noise.buffer = engine.buffer.whiteNoise({channels: 1, duration: dur + 0.1})
      const bp = c.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(500, t0)
      bp.frequency.exponentialRampToValueAtTime(2600, t0 + dur)
      bp.Q.value = 5
      noise.connect(bp).connect(out)
      noise.start(t0)
      noise.stop(t0 + dur)

      const o = c.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(160, t0)
      o.frequency.exponentialRampToValueAtTime(900, t0 + dur)
      const og = c.createGain()
      og.gain.value = 0.35
      o.connect(og).connect(out)
      o.start(t0)
      o.stop(t0 + dur)

      envelope(out.gain, t0, 0.005, 0.08, dur - 0.085, 0.7)
      return out
    })
    disconnectAfter(ear.left, t0 + dur + 0.25, ear)
  }

  function missileWarning() {
    const c = ctx()
    const t0 = now()
    const out = c.createGain()
    out.gain.value = 0.5
    out.connect(engine.mixer.output())

    ;[0, 0.16, 0.32].forEach((offset) => {
      const o = c.createOscillator()
      o.type = 'square'
      o.frequency.value = 980
      const g = c.createGain()
      const t = t0 + offset
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.25, t + 0.006)
      g.gain.linearRampToValueAtTime(0, t + 0.09)
      o.connect(g).connect(out)
      o.start(t)
      o.stop(t + 0.11)
    })

    setTimeout(() => { try { out.disconnect() } catch (e) {} }, 700)
  }

  var lockToneVoice = null

  function startLockTone() {
    if (lockToneVoice) return
    const c = ctx()
    const t0 = now()
    const out = c.createGain()
    out.gain.value = 0
    out.connect(engine.mixer.output())

    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = 880
    o.connect(out)
    o.start()

    out.gain.linearRampToValueAtTime(0.12, t0 + 0.05)
    lockToneVoice = {out, o}
  }

  function wingmanLost() {
    const t0 = now()
    const c = ctx()
    const out = c.createGain()
    out.gain.value = 0
    out.connect(engine.mixer.output())

    // Sad descending two-tone — a descending fifth (C5 → F4) that signals
    // "ally lost" without competing with the player's own defeat sound.
    ;[523, 349].forEach((f, i) => {
      const o = c.createOscillator()
      o.type = 'triangle'
      o.frequency.value = f
      const g = c.createGain()
      g.gain.value = 0
      o.connect(g).connect(out)
      const start = t0 + i * 0.35
      envelope(g.gain, start, 0.02, 0.35, 0.4, 0.5)
      o.start(start)
      o.stop(start + 0.8)
    })
    out.gain.value = 1
    setTimeout(() => { try { out.disconnect() } catch (e) {} }, 1800)
  }

  /**
   * Quick air whoosh for sharp turn / turnaround maneuvers.
   * Non-spatial — it's the player's own plane.
   */
  function whoosh() {
    const t0 = now()
    const dur = 0.12
    const c = ctx()
    const out = c.createGain()
    out.gain.value = 0
    out.connect(engine.mixer.output())

    const noise = c.createBufferSource()
    noise.buffer = engine.buffer.whiteNoise({channels: 1, duration: dur + 0.1})
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(400, t0)
    bp.frequency.exponentialRampToValueAtTime(2000, t0 + dur)
    bp.Q.value = 4
    noise.connect(bp).connect(out)
    noise.start(t0)
    noise.stop(t0 + dur + 0.05)

    envelope(out.gain, t0, 0.002, 0.02, dur - 0.024, 0.22)
    setTimeout(() => { try { out.disconnect() } catch (e) {} }, (dur + 0.3) * 1000)
  }

  function stopLockTone() {
    if (!lockToneVoice) return
    const t = ctx().currentTime
    lockToneVoice.out.gain.cancelScheduledValues(t)
    lockToneVoice.out.gain.linearRampToValueAtTime(0, t + 0.05)
    setTimeout(() => {
      try { lockToneVoice.o.stop() } catch (e) {}
      try { lockToneVoice.out.disconnect() } catch (e) {}
      lockToneVoice = null
    }, 100)
  }

  return {
    collision,
    scoring,
    buzzer,
    wallScrape,
    wallThud,
    eliminate,
    uiFocus,
    uiBack,
    peerJoin,
    peerLeave,
    startHorn,
    stopHorn,
    updateHornsSpatial,
    stopAllHorns,
    roundStart,
    roundEnd,
    heartbeat,
    gunsCooled,
    nearLock,
    createMissileVoice,
    updateMissileVoice,
    destroyMissileVoice,
    destroyAllMissileVoices,
    pickupHealth,
    pickupShield,
    pickupBullets,
    pickupMine,
    pickupSpeed,
    pickupTeleport,
    teleport,
    boostActivated,
    boostExpired,
    bulletDenied,
    shieldBlock,
    explosion,
    repulsorActivated,
    rocketActivated,
    rocketExpired,
    startMachineGun,
    stopMachineGun,
    missileLaunch,
    missileWarning,
    startLockTone,
    stopLockTone,
    pickupRepulsor,
    pickupRocket,
    wingmanLost,
    whoosh,
  }
})()
