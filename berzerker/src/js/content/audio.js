// Spatial audio core for BERZERK!. Drives the listener from the player's
// pose (with a FIXED yaw — top-down camera never turns), provides shared
// helpers for spatial one-shots and continuous looping props, and exposes a
// global behind-listener muffle so any source behind the player is dulled.
//
// Coordinate convention: screen tile coords use +y = south (down), but
// syngen's binaural ear places the LEFT ear at +y in its listener-local
// frame. We compensate by negating y everywhere it crosses the screen→audio
// boundary: in tileToM(), the source half of relativeVector(), and in
// behindness(). After those flips, +x in audio = front, +y = left,
// -y = right.
//
// Listener orientation is FIXED to screen-north (LISTENER_YAW = π/2). This
// is the canonical Berzerk top-down framing — the player views the room
// from above and the camera never rotates, so a robot south of the player
// always sounds behind, regardless of which way the player last moved.
content.audio = (() => {
  const TILE_TO_M = 2

  const LISTENER_YAW = Math.PI / 2

  let started = false
  let staticListener = null // when set, overrides the per-frame player-driven listener

  const props = {} // key → { _update, setPosition, setGain, destroy, ... } for the learn screen

  function distanceGain(distTiles, near = 2.5, pow = 1.8) {
    if (distTiles <= near) return 1
    return Math.min(1, Math.pow(near / distTiles, pow))
  }

  function tileToM(v) {
    return {x: v.x * TILE_TO_M, y: -v.y * TILE_TO_M, z: 0}
  }

  function normAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI
    while (a < -Math.PI) a += 2 * Math.PI
    return a
  }

  // Apply a listener pose. Used by the in-game frame loop with the player's
  // position at the canonical yaw, and by the diagnostic screens with a
  // fixed (0,0) listener at any yaw.
  function applyListener(x, y, yaw) {
    engine.position.setVector({x: x * TILE_TO_M, y: -y * TILE_TO_M, z: 0})
    content.audio._lastYaw = yaw
    engine.position.setQuaternion(engine.tool.quaternion.fromEuler({yaw}))
  }

  function updateListener() {
    if (staticListener != null) {
      applyListener(0, 0, staticListener)
      return
    }
    const player = content.player
    if (!player) {
      applyListener(0, 0, LISTENER_YAW)
      return
    }
    const p = player.getPosition()
    applyListener(p.x, p.y, LISTENER_YAW)
  }

  // Sticks the listener at (0,0) with a chosen yaw. Diagnostic screens
  // (`#test`, `#learn`) call this on enter so subsequent props position
  // relative to a known fixed pose. Cleared by setStaticListener(null) or
  // any in-game frame that calls the regular updateListener().
  function setStaticListener(yaw) {
    staticListener = (yaw == null) ? null : yaw
    if (staticListener != null) applyListener(0, 0, staticListener)
  }

  function relativeVector(x, y) {
    const listener = engine.position.getVector()
    const lq = engine.position.getQuaternion().conjugate()
    return engine.tool.vector3d.create({
      x:  x * TILE_TO_M - listener.x,
      y: -y * TILE_TO_M - listener.y,
      z: 0,
    }).rotateQuaternion(lq)
  }

  function behindness(srcX, srcY) {
    const listener = engine.position.getVector()
    const dx = srcX * TILE_TO_M - listener.x
    const dy = -srcY * TILE_TO_M - listener.y
    if (dx === 0 && dy === 0) return 0
    const yaw = content.audio._lastYaw || 0
    const rel = Math.abs(normAngle(Math.atan2(dy, dx) - yaw))
    if (rel <= Math.PI / 2) return 0
    return Math.min(1, (rel - Math.PI / 2) / (Math.PI / 2))
  }

  // Master ADSR helper. Cancels prior schedules on the param, then ramps
  // attack → hold → release. peak defaults to 1. Used everywhere a synth
  // voice needs a clean amplitude envelope.
  function envelope(param, t0, attack, hold, release, peak) {
    if (peak == null) peak = 1
    try { param.cancelScheduledValues(t0) } catch (_) {}
    param.setValueAtTime(0.0001, t0)
    param.linearRampToValueAtTime(peak, t0 + Math.max(0.001, attack))
    const sustainEnd = t0 + Math.max(0.001, attack) + Math.max(0, hold)
    param.linearRampToValueAtTime(peak, sustainEnd)
    param.exponentialRampToValueAtTime(0.0001, sustainEnd + Math.max(0.005, release))
  }

  // Stereo + binaural dual path for one-shot SFX. Stereo carries pan
  // strongly; binaural adds HRTF colour. `build(out)` connects the synth
  // graph to `out` and returns a stop fn. Returns a `dispose(when)` that
  // tears down after the tail.
  function playSpatial(sx, sy, build, opts = {}) {
    const ctx = engine.context()

    const out = ctx.createGain()
    out.gain.value = opts.gain != null ? opts.gain : 1

    // Stereo path: pan by audio-x (left = +1 in audio, but StereoPanner
    // expects -1 = left, +1 = right, so we flip the sign).
    const stereoIn = ctx.createGain()
    stereoIn.gain.value = opts.stereoGain != null ? opts.stereoGain : 0.85
    const panner = ctx.createStereoPanner()
    const rel = relativeVector(sx, sy)
    const distM = Math.sqrt(rel.x * rel.x + rel.y * rel.y)
    panner.pan.value = Math.max(-1, Math.min(1, distM > 0 ? -rel.y / Math.max(distM, 0.5) : 0))
    out.connect(stereoIn).connect(panner).connect(engine.mixer.input())

    // Binaural path: weaker, HRTF colour only.
    const binIn = ctx.createGain()
    binIn.gain.value = opts.binauralGain != null ? opts.binauralGain : 0.5
    const muffle = ctx.createBiquadFilter()
    muffle.type = 'lowpass'
    const b = behindness(sx, sy)
    muffle.frequency.value = 22000 - b * 20500
    muffle.Q.value = 0.7

    const binaural = engine.ear.binaural.create({
      gainModel: engine.ear.gainModel.exponential.instantiate(),
      filterModel: engine.ear.filterModel.head.instantiate(),
    }).from(muffle).to(engine.mixer.input())
    binaural.update(rel)

    // Distance attenuation on top, applied to both paths via `out`.
    const distGain = distanceGain(distM / TILE_TO_M, opts.near || 3, opts.pow || 1.6)
    out.gain.value *= distGain

    out.connect(binIn).connect(muffle)

    // Behind-source pitch shift for one-shots: small (~-100 cents at full
    // behindness, well under a semitone). Voices multiply their oscillator
    // base frequencies by `pitchMul` to apply.
    const pitchMul = 1 - 0.06 * b

    let stop
    try { stop = build(out, {pitchMul, behindness: b}) } catch (e) { console.error(e) }

    return function dispose(when) {
      const w = when || (engine.time() + 0.5)
      const wait = Math.max(0, (w - engine.time()) * 1000) + 50
      setTimeout(() => {
        try { stop && stop() } catch (_) {}
        try { out.disconnect() } catch (_) {}
        try { stereoIn.disconnect() } catch (_) {}
        try { panner.disconnect() } catch (_) {}
        try { binIn.disconnect() } catch (_) {}
        try { muffle.disconnect() } catch (_) {}
        try { binaural.destroy() } catch (_) {}
      }, wait)
    }
  }

  // Looping prop: build(out, mod) connects an oscillator/noise chain to
  // `out` and returns a stop fn. The prop owns its own muffle (lowpass)
  // driven by `behindness` so any source behind the listener is dulled,
  // and a `mod.detune` ConstantSource that voices can connect to oscillator
  // / buffer-source detune params for the "behind sounds lower-pitched"
  // cue (bumper carEngine.js pattern: ~-120 cents at full behindness).
  // Voices opt-in by `mod.detune.connect(osc.detune)`; voices that don't
  // still get the muffle.
  function makeProp({build, x = 0, y = 0, gain = 1, key, normalize = false}) {
    const ctx = engine.context()
    const output = ctx.createGain()
    output.gain.value = gain

    const muffle = ctx.createBiquadFilter()
    muffle.type = 'lowpass'
    muffle.frequency.value = 22000
    muffle.Q.value = 0.7
    output.connect(muffle)

    // Behind-detune feed. Voices `mod.detune.connect(osc.detune)` to get
    // a small pitch drop when behind. Cents are negative (drops pitch).
    const detuneCS = ctx.createConstantSource()
    detuneCS.offset.value = 0
    detuneCS.start()

    const binaural = engine.ear.binaural.create({
      gainModel: normalize
        ? engine.ear.gainModel.normalize.instantiate()
        : engine.ear.gainModel.exponential.instantiate(),
      filterModel: engine.ear.filterModel.head.instantiate(),
      x: x * TILE_TO_M,
      y: -y * TILE_TO_M,
      z: 0,
    }).from(muffle).to(engine.mixer.input())

    const stop = build(output, {detune: detuneCS})
    let vector = {x, y, z: 0}

    const prop = {
      output,
      key,
      setPosition(nx, ny) { vector = {x: nx, y: ny, z: 0} },
      setGain(v) { output.gain.value = v },
      getPosition: () => ({x: vector.x, y: vector.y}),
      destroy() {
        try { stop && stop() } catch (_) {}
        try { detuneCS.stop() } catch (_) {}
        try { detuneCS.disconnect() } catch (_) {}
        try { output.disconnect() } catch (_) {}
        try { muffle.disconnect() } catch (_) {}
        try { binaural.destroy() } catch (_) {}
        if (key && props[key] === prop) delete props[key]
      },
      _update() {
        binaural.update(relativeVector(vector.x, vector.y))
        const b = behindness(vector.x, vector.y)
        const cutoff = 22000 - b * 21300
        muffle.frequency.setTargetAtTime(Math.max(700, cutoff), ctx.currentTime, 0.05)
        // -120 cents at full behindness (~1.2 semitones — bumper's value).
        detuneCS.offset.setTargetAtTime(-120 * b, ctx.currentTime, 0.05)
      },
    }
    if (key) props[key] = prop
    return prop
  }

  // One-shot percussive tick. Reused by the #test diagnostic and by gameplay
  // beacons (e.g. exit-direction hint). Pitches down + muffles when behind.
  function emitTick(x, y, {freq = 1500, dur = 0.08, gain = 0.6} = {}) {
    const ctx = engine.context()
    const t0 = ctx.currentTime

    const b = behindness(x, y)
    const pitchMul = 1 - 0.55 * b
    const f0 = freq * pitchMul

    const osc1 = ctx.createOscillator()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(f0, t0)
    osc1.frequency.exponentialRampToValueAtTime(Math.max(80, f0 * 0.35), t0 + dur)

    const osc2 = ctx.createOscillator()
    osc2.type = 'triangle'
    osc2.frequency.setValueAtTime(f0 * 2, t0)
    osc2.frequency.exponentialRampToValueAtTime(Math.max(160, f0 * 0.7), t0 + dur)

    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t0)
    env.gain.linearRampToValueAtTime(gain, t0 + 0.002)
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

    const muffle = ctx.createBiquadFilter()
    muffle.type = 'lowpass'
    muffle.Q.value = 0.7
    muffle.frequency.value = 22000 - b * 20500

    const post = ctx.createGain()
    const listener = engine.position.getVector()
    const dx = x * TILE_TO_M - listener.x, dy = -y * TILE_TO_M - listener.y
    const distM = Math.sqrt(dx * dx + dy * dy)
    post.gain.value = distanceGain(distM / TILE_TO_M, 2.5, 1.5)

    const binaural = engine.ear.binaural.create({
      gainModel: engine.ear.gainModel.exponential.instantiate(),
      filterModel: engine.ear.filterModel.head.instantiate(),
    }).from(post).to(engine.mixer.input())

    osc1.connect(env)
    osc2.connect(env)
    env.connect(muffle).connect(post)
    binaural.update(relativeVector(x, y))

    osc1.start(t0); osc2.start(t0)
    osc1.stop(t0 + dur + 0.05); osc2.stop(t0 + dur + 0.05)

    setTimeout(() => {
      try { osc1.disconnect() } catch (_) {}
      try { osc2.disconnect() } catch (_) {}
      try { env.disconnect() } catch (_) {}
      try { muffle.disconnect() } catch (_) {}
      try { post.disconnect() } catch (_) {}
      try { binaural.destroy() } catch (_) {}
    }, (dur + 0.2) * 1000)
  }

  // Tick the binaural of a registered prop so its position is current.
  // Called by the learn screen (no in-game frame loop running there).
  function tickProp(key) {
    const p = props[key]
    if (p && p._update) p._update()
  }

  function silenceAll() {
    for (const k in props) {
      const p = props[k]
      if (p && p.setGain) p.setGain(0)
    }
  }

  function destroyAll() {
    for (const k in props) {
      try { props[k].destroy() } catch (_) {}
      delete props[k]
    }
  }

  // Per-frame entry point. Updates listener pose then ticks every prop's
  // binaural and behind-muffle. The game-screen onFrame calls this once per
  // frame; diagnostic screens call setStaticListener and skip this.
  function frame() {
    updateListener()
    for (const k in props) {
      try { props[k]._update && props[k]._update() } catch (_) {}
    }
  }

  function start() {
    started = true
    // Resume the audio context if it was suspended pre-gesture.
    try { engine.context().resume && engine.context().resume() } catch (_) {}
  }

  function isStarted() { return started }

  return {
    TILE_TO_M,
    LISTENER_YAW,
    _props: props,
    _lastYaw: LISTENER_YAW,
    distanceGain,
    tileToM,
    relativeVector,
    behindness,
    envelope,
    playSpatial,
    makeProp,
    emitTick,
    tickProp,
    silenceAll,
    destroyAll,
    setStaticListener,
    updateListener,
    frame,
    start,
    isStarted,
  }
})()
