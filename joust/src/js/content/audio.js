// JOUST audio.
//
// Two axes, two perceptual channels, and they never touch:
//
//   HORIZONTAL -> a syngen BINAURAL EAR. Riders, eggs and wing beats are laid
//   out left to right on a stage a couple of metres in front of the listener.
//   Arena units are compressed onto that stage by constants.earLocal, because
//   the ear derives an interaural delay from raw distance and feeding it
//   hundreds of units would smear every cue behind a huge delay. The ear's own
//   distance-gain model is switched off (gainModel.normalize) and loudness is
//   set explicitly here, so the two things stay independently tunable.
//
//   ALTITUDE -> PITCH, and always RELATIVE TO THE PLAYER. Nothing in this file
//   ever asks how high something is; it only ever asks how far above YOU it is,
//   and turns that into a frequency through constants.pitchFor. z is 0 for
//   every ear in the game, on purpose: the moment altitude also became a
//   position, the two axes would be fighting over the same channel and both
//   would get worse.
//
// The layers, in order of how much they actually tell you:
//
//   reference drone  A quiet sine at REFERENCE_HZ, non-positional, running the
//                    whole time you are alive. It is not decoration — it is the
//                    zero of the pitch scale, and without it "higher than you"
//                    has nothing to be higher than. It also does the game's
//                    best trick for free: a rider level with you sits within a
//                    few Hz of it and BEATS against it, so a coin-flip
//                    collision sounds physically unstable before it happens.
//   wing beats       One short pitched flap per rider, binaural, at a rate that
//                    speeds up as it closes. The rate ramp is the alarm; the
//                    pitch is the verdict. This is the whole radar.
//   sustained voices Riders close enough to fight grow a continuous tone on the
//                    same pitch, faded in by distance, so the one that matters
//                    can be tracked rather than sampled. Deliberately capped
//                    and deliberately short-range: a drone per rider is the
//                    uninformative wash this engine's games get rebuilt to
//                    remove.
//   your own wing    Each flap is a noise whoosh. Non-positional; it is you.
//   deck and roof    The only cues that carry ABSOLUTE height, because a
//                    relative pitch mapping structurally cannot. A rising wash
//                    near the deck, a thin hiss near the roof.
//   eggs             A falling egg's voice descends as it falls, which is the
//                    pitch mapping doing its own job. A landed egg ticks, and
//                    the tick accelerates toward the hatch, so the timer is a
//                    sound rather than a number.
content.audio = (() => {
  const K = () => content.constants

  let reference = null   // {osc, gain, shimmer} the zero of the pitch scale
  let deck = null        // {noise, lp, gain} the ground wash
  let roof = null        // {noise, hp, gain} the ceiling hiss
  const riderVoices = new Map()  // riderId -> sustained voice
  const eggVoices = new Map()    // eggId -> falling whistle
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

  // A binaural ear at a horizontal offset. `dx` is the wrapped arena offset;
  // constants.earLocal compresses it onto the listening stage. syngen wants
  // {x: forward, y: left-positive}, so the starboard sign is flipped once,
  // here, and nowhere else. z stays 0 — altitude belongs to pitch.
  function earAt(dx) {
    const local = K().earLocal(dx)
    const ear = engine.ear.binaural.create({
      gainModel: engine.ear.gainModel.normalize,
    })
    ear.to(out())
    ear.update({x: local.forward, y: -local.starboard, z: 0})
    return ear
  }
  function moveEar(ear, dx) {
    const local = K().earLocal(dx)
    ear.update({x: local.forward, y: -local.starboard, z: 0})
  }

  // The single mapping this whole game is built on.
  function pitch(dAlt) { return K().pitchFor(dAlt, K().REFERENCE_HZ) }

  // How loud something at this horizontal distance should be. Explicit, because
  // the ear's own model is switched off. Distant riders stay clearly audible —
  // the RATE of their beat is carrying the distance, not the volume.
  function distanceGain(dist, near, far) {
    return K().lerp(far == null ? 0.05 : far, near == null ? 0.22 : near,
      K().closeness(dist))
  }

  // ===========================================================================
  // the reference drone — the zero of the pitch scale
  // ===========================================================================
  // Non-positional and quiet, but it is the most load-bearing sound in the
  // game: every rider's pitch means nothing except against this. It also gives
  // the tie its sound, since a rider within the duel margin lands close enough
  // in frequency to beat audibly against it.
  function startReference() {
    if (reference) return
    const c = ctx()

    const gain = c.createGain()
    gain.gain.value = 0.0001
    gain.connect(out())

    const osc = c.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = K().REFERENCE_HZ
    const oscGain = c.createGain()
    oscGain.gain.value = 0.55
    osc.connect(oscGain).connect(gain)
    osc.start()

    // An octave below, to give the reference some body so it survives under a
    // busy wave without having to be turned up into the way of everything else.
    const sub = c.createOscillator()
    sub.type = 'sine'
    sub.frequency.value = K().REFERENCE_HZ / 2
    const subGain = c.createGain()
    subGain.gain.value = 0.30
    sub.connect(subGain).connect(gain)
    sub.start()

    // Respawn invulnerability rides on the reference as a tremolo, because that
    // is the one sound guaranteed to be playing and guaranteed to be noticed.
    const shimmer = c.createOscillator()
    shimmer.type = 'sine'
    shimmer.frequency.value = 9
    const shimmerGain = c.createGain()
    shimmerGain.gain.value = 0
    shimmer.connect(shimmerGain).connect(gain.gain)
    shimmer.start()

    reference = {gain, osc, oscGain, sub, subGain, shimmer, shimmerGain}
  }
  function stopReference() {
    if (!reference) return
    const r = reference
    const t = now()
    try {
      r.gain.gain.cancelScheduledValues(t)
      r.gain.gain.setValueAtTime(r.gain.gain.value, t)
      r.gain.gain.linearRampToValueAtTime(0.0001, t + 0.3)
    } catch (e) {}
    setTimeout(() => {
      try { r.osc.stop(); r.sub.stop(); r.shimmer.stop() } catch (e) {}
      try { r.gain.disconnect() } catch (e) {}
    }, 400)
    reference = null
  }
  function updateReference(alive, invuln) {
    if (!reference) return
    engine.fn.setParam(reference.gain.gain, alive ? 0.075 : 0.02, 0.2)
    engine.fn.setParam(reference.shimmerGain.gain, invuln > 0 ? 0.045 : 0, 0.12)
  }

  // ===========================================================================
  // wing beats — the radar
  // ===========================================================================
  // One per rider per beat, binaural at its offset, pitched by how far above
  // you it is. Rate comes from content.game (tier rate multiplied up by
  // closeness), so a rider bearing down on you audibly accelerates. Timbre is
  // the tier, so you hear WHAT is coming as well as where and how high.
  function beat(dx, dAlt, dist, type, chasing) {
    const k = K()
    const spec = k.RIDER_TYPES[type] || k.RIDER_TYPES.bounder
    const t0 = now()
    const c = ctx()

    const ear = earAt(dx)
    const g = c.createGain()
    g.gain.value = 0
    ear.from(g)

    // The beat itself: a short pitched blip on the tier's waveform.
    const o = c.createOscillator()
    o.type = spec.timbre
    const f = pitch(dAlt)
    o.frequency.setValueAtTime(f, t0)
    // A small downward chirp, so a beat reads as a wing stroke rather than a
    // bleep, without moving far enough to blur which side of the reference it
    // is on.
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f * 0.88), t0 + 0.09)

    // A puff of air under it, brightened by tier. This is the only thing
    // separating a bounder from a shadow lord at a distance where the tone is
    // still faint.
    const s = noiseSource()
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = spec.bright
    bp.Q.value = 1.1
    const sg = c.createGain()
    sg.gain.value = 0.35

    o.connect(g)
    s.connect(bp).connect(sg).connect(g)

    const dur = 0.11
    const peak = distanceGain(dist, 0.30, 0.075) * (chasing ? 1.25 : 1)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(peak, t0 + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

    o.start(t0)
    o.stop(t0 + dur + 0.02)
    s.start(t0)
    s.stop(t0 + dur + 0.02)
    o.onended = () => {
      try { g.disconnect(); bp.disconnect(); sg.disconnect() } catch (e) {}
      try { ear.destroy() } catch (e) {}
    }
  }

  // ===========================================================================
  // sustained rider voices — for the ones you are about to fight
  // ===========================================================================
  // Faded in over the last stretch of approach and capped by content.game to
  // the four nearest, so the continuous layer only ever carries riders that are
  // a decision. Pitch tracks altitude continuously here, which is what lets you
  // hold a duel: you can hear the other rider climbing while you climb.
  function ensureRiderVoice(id, type) {
    let v = riderVoices.get(id)
    if (v) return v
    const c = ctx()
    const k = K()
    const spec = k.RIDER_TYPES[type] || k.RIDER_TYPES.bounder

    const gain = c.createGain()
    gain.gain.value = 0.0001
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = spec.bright * 1.6
    lp.Q.value = 0.5
    gain.connect(lp)

    const ear = engine.ear.binaural.create({
      gainModel: engine.ear.gainModel.normalize,
    })
    ear.from(lp)
    ear.to(out())

    const osc = c.createOscillator()
    osc.type = spec.timbre
    osc.frequency.value = k.REFERENCE_HZ
    osc.connect(gain)
    osc.start()

    v = {gain, lp, ear, osc, type}
    riderVoices.set(id, v)
    return v
  }
  function destroyRiderVoice(id) {
    const v = riderVoices.get(id)
    if (!v) return
    riderVoices.delete(id)
    const t = now()
    try {
      v.gain.gain.cancelScheduledValues(t)
      v.gain.gain.setValueAtTime(v.gain.gain.value, t)
      v.gain.gain.linearRampToValueAtTime(0.0001, t + 0.18)
    } catch (e) {}
    setTimeout(() => {
      try { v.osc.stop() } catch (e) {}
      try { v.gain.disconnect(); v.lp.disconnect() } catch (e) {}
      try { v.ear.destroy() } catch (e) {}
    }, 260)
  }

  // Called every frame with the riders that have earned a sustained voice.
  function updateRiders(list) {
    const k = K()
    const seen = new Set()
    for (const r of list) {
      seen.add(r.id)
      const v = ensureRiderVoice(r.id, r.type)
      moveEar(v.ear, r.dx)
      // Pitch is the point: fast enough to follow a climb, slow enough not to
      // zipper.
      engine.fn.setParam(v.osc.frequency, pitch(r.dAlt), 0.05)
      engine.fn.setParam(v.gain.gain, 0.008 + r.weight * 0.085, 0.08)
      // A rider coming for you opens up; one drifting stays dull. Same pitch,
      // different urgency.
      engine.fn.setParam(v.lp.frequency,
        k.lerp(700, 3200, r.weight * (r.chasing ? 1 : 0.55)), 0.12)
    }
    for (const id of [...riderVoices.keys()]) {
      if (!seen.has(id)) destroyRiderVoice(id)
    }
  }

  // ===========================================================================
  // eggs
  // ===========================================================================
  // A falling egg gets a continuous voice whose pitch is, like everything else,
  // its altitude relative to yours — so it audibly descends as it drops. It is
  // the clearest demonstration of the mapping in the game, and it is also
  // genuinely useful: you can dive to meet an egg before it lands.
  function updateFallingEggs(list) {
    const seen = new Set()
    const c = ctx()
    for (const e of list) {
      seen.add(e.id)
      let v = eggVoices.get(e.id)
      if (!v) {
        const gain = c.createGain()
        gain.gain.value = 0.0001
        const ear = engine.ear.binaural.create({
          gainModel: engine.ear.gainModel.normalize,
        })
        ear.from(gain)
        ear.to(out())
        const osc = c.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = K().REFERENCE_HZ
        osc.connect(gain)
        osc.start()
        // A shadow a fifth up, so an egg is never mistaken for a rider even
        // though both are pitched by the same rule.
        const fifth = c.createOscillator()
        fifth.type = 'sine'
        fifth.frequency.value = K().REFERENCE_HZ * 1.5
        const fifthGain = c.createGain()
        fifthGain.gain.value = 0.32
        fifth.connect(fifthGain).connect(gain)
        fifth.start()
        v = {gain, ear, osc, fifth, fifthGain}
        eggVoices.set(e.id, v)
      }
      moveEar(v.ear, e.dx)
      const f = pitch(e.dAlt)
      engine.fn.setParam(v.osc.frequency, f, 0.04)
      engine.fn.setParam(v.fifth.frequency, f * 1.5, 0.04)
      engine.fn.setParam(v.gain.gain, distanceGain(e.dist, 0.10, 0.03), 0.08)
    }
    for (const id of [...eggVoices.keys()]) {
      if (seen.has(id)) continue
      const v = eggVoices.get(id)
      eggVoices.delete(id)
      const t = now()
      try {
        v.gain.gain.cancelScheduledValues(t)
        v.gain.gain.setValueAtTime(v.gain.gain.value, t)
        v.gain.gain.linearRampToValueAtTime(0.0001, t + 0.12)
      } catch (e) {}
      setTimeout(() => {
        try { v.osc.stop(); v.fifth.stop() } catch (e) {}
        try { v.gain.disconnect(); v.ear.destroy() } catch (e) {}
      }, 200)
    }
  }

  // An egg reaching the deck. A soft settle, low because the deck is below you.
  function eggLand(dx, dAlt) {
    burst(dx, {peak: 0.16, dur: 0.22, cutoff: 900, sweepTo: 220,
      tone: pitch(dAlt), toneTo: pitch(dAlt) * 0.8, tonePeak: 0.13})
  }

  // The hatch clock. The tick is a hard wooden knock at the egg's pitch, and it
  // gets brighter and sharper as the hatch approaches — so an egg you have left
  // too long is not merely faster, it is uglier.
  function eggTick(dx, dAlt, progress) {
    const k = K()
    const t0 = now()
    const c = ctx()
    const p = k.clamp(progress, 0, 1)

    const ear = earAt(dx)
    const g = c.createGain()
    g.gain.value = 0
    ear.from(g)

    const o = c.createOscillator()
    o.type = p > 0.72 ? 'square' : 'triangle'
    const f = pitch(dAlt)
    o.frequency.setValueAtTime(f * k.lerp(1, 1.35, p), t0)
    o.connect(g)

    const s = noiseSource()
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = k.lerp(1200, 3000, p)
    bp.Q.value = 2.2
    const sg = c.createGain()
    sg.gain.value = k.lerp(0.2, 0.55, p)
    s.connect(bp).connect(sg).connect(g)

    const dur = k.lerp(0.09, 0.05, p)
    const peak = k.lerp(0.14, 0.26, p)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(peak, t0 + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.start(t0); o.stop(t0 + dur + 0.02)
    s.start(t0); s.stop(t0 + dur + 0.02)
    o.onended = () => {
      try { g.disconnect(); bp.disconnect(); sg.disconnect() } catch (e) {}
      try { ear.destroy() } catch (e) {}
    }
  }

  // Collecting one. A bright rising arpeggio whose top note climbs with the
  // streak, so a run of eggs is audibly a run.
  function eggCollect(dx, streak) {
    const k = K()
    const step = Math.min(streak - 1, k.EGG_SCORES.length - 1)
    const base = 520 * Math.pow(2, step / 12)
    ;[0, 4, 7, 12].forEach((semi, i) => {
      positionalTone(dx, base * Math.pow(2, semi / 12), {
        dur: 0.13, peak: 0.16, type: 'sine', at: i * 0.045,
      })
    })
  }

  // A hatch. The worst sound in the game, and it should be: a shell cracking
  // and something climbing out of it.
  function hatch(dx, dAlt) {
    burst(dx, {peak: 0.38, dur: 0.30, cutoff: 3600, sweepTo: 500, type: 'bandpass', q: 1.2,
      tone: 180, toneTo: 90, tonePeak: 0.22})
    later(() => {
      positionalTone(dx, 150, {dur: 0.55, peak: 0.20, type: 'sawtooth', glideTo: 420})
      positionalTone(dx, 226, {dur: 0.55, peak: 0.12, type: 'sawtooth', glideTo: 634, at: 0.03})
    }, 190)
  }

  // ===========================================================================
  // your own wing, the deck and the roof
  // ===========================================================================
  // Your flap is non-positional: it is you. It is also the only sound in the
  // game that is not pitched by altitude, which is what makes it read as
  // "self" without any further work.
  function flap(onGround) {
    const t0 = now()
    const c = ctx()
    const g = c.createGain()
    g.gain.value = 0
    g.connect(out())

    const s = noiseSource()
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(340, t0)
    bp.frequency.exponentialRampToValueAtTime(1500, t0 + 0.10)
    bp.Q.value = 0.8
    s.connect(bp).connect(g)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(0.26, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.17)
    s.start(t0)
    s.stop(t0 + 0.2)

    // A thump under it so the beat has weight, and so mashing has a rhythm you
    // can feel rather than just a rate you can count.
    const o = c.createOscillator()
    const og = c.createGain()
    og.gain.value = 0
    o.type = 'sine'
    o.frequency.setValueAtTime(onGround ? 130 : 96, t0)
    o.frequency.exponentialRampToValueAtTime(52, t0 + 0.14)
    o.connect(og).connect(out())
    og.gain.setValueAtTime(0, t0)
    og.gain.linearRampToValueAtTime(0.18, t0 + 0.006)
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16)
    o.start(t0)
    o.stop(t0 + 0.18)
    o.onended = () => { try { g.disconnect(); og.disconnect(); bp.disconnect() } catch (e) {} }
  }

  // The deck wash and the roof hiss are the ONLY absolute-height cues in the
  // game, because a relative pitch mapping structurally cannot provide one.
  // Without them you would fly into the floor while concentrating on a duel.
  function startBounds() {
    const c = ctx()
    if (!deck) {
      const s = noiseSource()
      const lp = c.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 240
      lp.Q.value = 0.7
      const g = c.createGain()
      g.gain.value = 0.0001
      s.connect(lp).connect(g).connect(out())
      s.start()
      deck = {s, lp, g}
    }
    if (!roof) {
      const s = noiseSource()
      const hp = c.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 5200
      hp.Q.value = 0.7
      const g = c.createGain()
      g.gain.value = 0.0001
      s.connect(hp).connect(g).connect(out())
      s.start()
      roof = {s, hp, g}
    }
  }
  function stopBounds() {
    for (const b of [deck, roof]) {
      if (!b) continue
      const t = now()
      try {
        b.g.gain.cancelScheduledValues(t)
        b.g.gain.setValueAtTime(b.g.gain.value, t)
        b.g.gain.linearRampToValueAtTime(0.0001, t + 0.25)
      } catch (e) {}
      setTimeout(() => { try { b.s.stop(); b.g.disconnect() } catch (e) {} }, 350)
    }
    deck = null
    roof = null
  }
  function updateBounds(groundNear, ceilingNear) {
    const k = K()
    if (deck) {
      engine.fn.setParam(deck.g.gain, 0.0001 + Math.pow(groundNear, 1.5) * 0.16, 0.12)
      engine.fn.setParam(deck.lp.frequency, k.lerp(170, 420, groundNear), 0.15)
    }
    if (roof) {
      engine.fn.setParam(roof.g.gain, 0.0001 + Math.pow(ceilingNear, 1.6) * 0.035, 0.12)
    }
  }

  function land(speed) {
    const k = K()
    const f = k.clamp(speed / k.SPEED_MAX_GROUND, 0, 1)
    tone(70, {dur: 0.18, peak: 0.16 + f * 0.10, type: 'sine', glideTo: 44})
    noiseHit(0.14 + f * 0.10, 0.14, 700, 180)
  }
  function ceiling() {
    tone(190, {dur: 0.14, peak: 0.14, type: 'square', glideTo: 120})
    noiseHit(0.10, 0.10, 2600, 900)
  }

  // ===========================================================================
  // the duel
  // ===========================================================================
  // Winning. The lance goes through, and the pitch of the strike is the rider's
  // pitch — so the sound of a kill confirms the altitude judgement that earned
  // it.
  function kill(dx, dAlt, type) {
    const k = K()
    const spec = k.RIDER_TYPES[type] || k.RIDER_TYPES.bounder
    burst(dx, {peak: 0.42, dur: 0.26, cutoff: spec.bright * 1.8, sweepTo: 400,
      type: 'bandpass', q: 1.0, tone: pitch(dAlt), toneTo: pitch(dAlt) * 0.55, tonePeak: 0.30})
    // ...and the mount going down, a long fall in pitch. It is going to become
    // an egg, and this is the sound of it starting.
    later(() => {
      positionalTone(dx, pitch(dAlt) * 0.9, {
        dur: 0.6, peak: 0.15, type: spec.timbre, glideTo: pitch(dAlt) * 0.32,
      })
    }, 130)
  }

  // Losing. Nothing else in the game is this loud, this low, or this final.
  function death(dx, dAlt) {
    burst(dx, {peak: 0.8, dur: 0.5, cutoff: 3000, sweepTo: 90,
      tone: 140, toneTo: 40, tonePeak: 0.55})
    tone(220, {dur: 1.5, peak: 0.26, type: 'sawtooth', glideTo: 33})
    tone(110, {dur: 1.6, peak: 0.22, type: 'sine', glideTo: 27})
  }

  // The tie. A hard metallic clang with two detuned partials — it is meant to
  // sound like the unresolved thing it is, and it is the sound you learn to
  // want when you have misjudged a closing rider.
  function bounce(dx, shielded) {
    const t0 = now()
    const c = ctx()
    const ear = earAt(dx)
    const g = c.createGain()
    g.gain.value = 0
    ear.from(g)

    const base = shielded ? 900 : 640
    ;[1, 1.48, 2.07].forEach((mult, i) => {
      const o = c.createOscillator()
      const og = c.createGain()
      og.gain.value = 0
      o.type = 'square'
      o.frequency.setValueAtTime(base * mult, t0)
      o.frequency.exponentialRampToValueAtTime(base * mult * 0.82, t0 + 0.28)
      o.connect(og).connect(g)
      const peak = 0.26 / (i + 1)
      og.gain.setValueAtTime(0, t0)
      og.gain.linearRampToValueAtTime(peak, t0 + 0.003)
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3)
      o.start(t0)
      o.stop(t0 + 0.32)
    })

    const s = noiseSource()
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 2600
    bp.Q.value = 1.6
    const sg = c.createGain()
    sg.gain.value = 0
    s.connect(bp).connect(sg).connect(g)
    sg.gain.setValueAtTime(0, t0)
    sg.gain.linearRampToValueAtTime(0.22, t0 + 0.003)
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12)
    s.start(t0)
    s.stop(t0 + 0.15)

    g.gain.setValueAtTime(1, t0)
    setTimeout(() => {
      try { g.disconnect() } catch (e) {}
      try { ear.destroy() } catch (e) {}
    }, 500)
  }

  // A rider arriving. Placed where it comes in, and pitched where it comes in,
  // so a wave announces its own shape before anything is close enough to fight.
  function arrive(dx, dAlt, type) {
    const k = K()
    const spec = k.RIDER_TYPES[type] || k.RIDER_TYPES.bounder
    const f = pitch(dAlt)
    positionalTone(dx, f * 0.6, {dur: 0.3, peak: 0.16, type: spec.timbre, glideTo: f})
  }

  // ===========================================================================
  // generic voices
  // ===========================================================================
  // A binaural one-shot: a filtered noise burst plus an optional tone.
  function burst(dx, {peak, dur, cutoff, sweepTo, tone: toneFreq, toneTo, tonePeak, type = 'lowpass', q = 0.9}) {
    const t0 = now()
    const c = ctx()
    const ear = earAt(dx)
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

    if (toneFreq) {
      const o = c.createOscillator()
      const og = c.createGain()
      og.gain.value = 0
      o.type = 'sine'
      o.frequency.setValueAtTime(toneFreq, t0)
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

  // A binaural pitched tone.
  function positionalTone(dx, freq, {dur = 0.12, peak = 0.18, type = 'sine', at = 0, glideTo = 0} = {}) {
    const t0 = now() + at
    const c = ctx()
    const ear = earAt(dx)
    const g = c.createGain()
    g.gain.value = 0
    ear.from(g)
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
    setTimeout(() => {
      try { g.disconnect() } catch (e) {}
      try { ear.destroy() } catch (e) {}
    }, (at + dur + 0.4) * 1000)
  }

  // A non-positional tone: menus, warnings, and anything happening TO you
  // rather than somewhere near you.
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

  function noiseHit(peak, dur, from, to) {
    const t0 = now()
    const c = ctx()
    const g = c.createGain()
    g.gain.value = 0
    g.connect(out())
    const s = noiseSource()
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(from, t0)
    f.frequency.exponentialRampToValueAtTime(Math.max(60, to), t0 + dur)
    s.connect(f).connect(g)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(peak, t0 + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    s.start(t0)
    s.stop(t0 + dur + 0.05)
    setTimeout(() => { try { g.disconnect() } catch (e) {} }, (dur + 0.3) * 1000)
  }

  // ===========================================================================
  // run state and ui
  // ===========================================================================
  function countTone(n) { tone(500 + (3 - n) * 60, {dur: 0.14, peak: 0.20}) }

  function waveStart(wave) {
    // A rising fanfare that climbs a step per wave, so how deep you are is
    // audible without counting.
    const step = Math.min(wave - 1, 11)
    const base = 262 * Math.pow(2, step / 12)
    ;[0, 7, 12].forEach((semi, i) => {
      tone(base * Math.pow(2, semi / 12), {dur: 0.3, peak: 0.20, type: 'triangle', at: i * 0.14})
    })
  }
  function waveClear() {
    ;[392, 494, 587, 784].forEach((f, i) => {
      tone(f, {dur: 0.34, peak: 0.19, type: 'triangle', at: i * 0.13})
      tone(f / 2, {dur: 0.34, peak: 0.10, type: 'sine', at: i * 0.13})
    })
  }
  function extraLife() {
    ;[523, 659, 784, 1047].forEach((f, i) => {
      tone(f, {dur: 0.2, peak: 0.2, type: 'sine', at: i * 0.08})
    })
  }
  function respawn() {
    tone(160, {dur: 0.45, peak: 0.20, type: 'triangle', glideTo: 330})
    tone(240, {dur: 0.45, peak: 0.12, type: 'sine', glideTo: 495, at: 0.04})
  }
  function hurry() {
    tone(880, {dur: 0.09, peak: 0.16})
    tone(880, {dur: 0.09, peak: 0.16, at: 0.14})
    tone(1046, {dur: 0.16, peak: 0.18, at: 0.28})
  }
  function doom() {
    tone(300, {dur: 1.9, peak: 0.30, type: 'sawtooth', glideTo: 34})
    tone(120, {dur: 2.0, peak: 0.30, type: 'sine', glideTo: 26})
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
  // lifecycle
  // ===========================================================================
  function startAmbient() {
    startReference()
    startBounds()
  }
  function stopAmbient() {
    stopReference()
    stopBounds()
  }

  // Pumped every frame from the game screen.
  function frame(delta, st) {
    updateReference(st.alive !== false, st.invuln || 0)
    updateBounds(st.groundNear || 0, st.ceilingNear || 0)
  }

  function silenceAll() {
    for (const id of pendingTimeouts) clearTimeout(id)
    pendingTimeouts = []
    stopAmbient()
    for (const id of [...riderVoices.keys()]) destroyRiderVoice(id)
    updateFallingEggs([])
  }

  // ---- learn-the-sounds cues ----
  // `dx` is in arena units either side of you; `dAlt` is units above you, which
  // is the number that becomes a pitch.
  function sample(which) {
    const k = K()
    const AHEAD = 0
    const LEFT = -34
    const RIGHT = 34
    const FAR = 110

    switch (which) {
      case 'reference': {
        startReference()
        updateReference(true, 0)
        later(() => { if (!content.game.isPlaying()) stopReference() }, 2600)
        break
      }
      case 'flap': flap(false); break
      case 'flapGround': flap(true); break
      // The three verdicts, played against the reference so the interval is
      // the thing being taught.
      case 'riderLevel': {
        startReference(); updateReference(true, 0)
        for (let i = 0; i < 5; i++) later(() => beat(AHEAD, 0, 20, 'bounder', true), i * 380)
        later(() => { if (!content.game.isPlaying()) stopReference() }, 2600)
        break
      }
      case 'riderAbove': {
        startReference(); updateReference(true, 0)
        for (let i = 0; i < 5; i++) later(() => beat(AHEAD, 14, 20, 'bounder', true), i * 380)
        later(() => { if (!content.game.isPlaying()) stopReference() }, 2600)
        break
      }
      case 'riderBelow': {
        startReference(); updateReference(true, 0)
        for (let i = 0; i < 5; i++) later(() => beat(AHEAD, -14, 20, 'bounder', true), i * 380)
        later(() => { if (!content.game.isPlaying()) stopReference() }, 2600)
        break
      }
      case 'riderLeft': for (let i = 0; i < 4; i++) later(() => beat(LEFT, 0, 34, 'bounder', false), i * 400); break
      case 'riderRight': for (let i = 0; i < 4; i++) later(() => beat(RIGHT, 0, 34, 'bounder', false), i * 400); break
      case 'riderFar': for (let i = 0; i < 4; i++) later(() => beat(FAR, 4, FAR, 'bounder', false), i * 620); break
      // The rate ramp: one rider crossing the arena at you.
      case 'riderClosing': {
        const steps = [120, 96, 74, 55, 40, 28, 18, 11, 6, 3]
        let at = 0
        steps.forEach((d) => {
          later(() => beat(d, 3, d, 'hunter', true), at * 1000)
          at += 1 / (k.RIDER_TYPES.hunter.flap * k.lerp(1, k.BEAT_CLOSE_MULT, k.closeness(d)))
        })
        break
      }
      case 'bounder': for (let i = 0; i < 4; i++) later(() => beat(AHEAD, 0, 24, 'bounder', true), i * 420); break
      case 'hunter': for (let i = 0; i < 5; i++) later(() => beat(AHEAD, 0, 24, 'hunter', true), i * 300); break
      case 'shadowlord': for (let i = 0; i < 6; i++) later(() => beat(AHEAD, 0, 24, 'shadowlord', true), i * 230); break
      // The sustained voice, sweeping past you and climbing as it goes.
      case 'sustain': {
        const track = [[52, -8], [38, -4], [24, 0], [12, 4], [4, 8], [-10, 12], [-26, 14], [-46, 14]]
        track.forEach((p, i) => later(() => updateRiders([
          {id: 'demo', type: 'hunter', dx: p[0], dAlt: p[1], dist: Math.abs(p[0]),
            weight: k.sustainWeight(Math.abs(p[0])), chasing: true},
        ]), i * 260))
        later(() => updateRiders([]), track.length * 260 + 300)
        break
      }
      case 'kill': kill(RIGHT * 0.3, -6, 'bounder'); break
      case 'bounce': bounce(LEFT * 0.3, false); break
      case 'death': death(0, 4); break
      case 'arrive': arrive(FAR * 0.7, 20, 'hunter'); break
      // An egg falling past you, then landing.
      case 'eggFall': {
        const track = [30, 18, 6, -8, -22, -34, -44]
        track.forEach((alt, i) => later(() => updateFallingEggs([
          {id: 'demoEgg', dx: 18, dAlt: alt, dist: 18},
        ]), i * 200))
        later(() => { updateFallingEggs([]); eggLand(18, -46) }, track.length * 200 + 120)
        break
      }
      // The hatch clock, from just-landed to about to go.
      case 'eggTick': {
        let at = 0
        for (let i = 0; i < 14; i++) {
          const p = i / 13
          later(() => eggTick(12, -40, p), at * 1000)
          at += k.eggTickInterval(p)
        }
        break
      }
      case 'eggCollect': eggCollect(0, 3); break
      case 'hatch': hatch(-20, -40); break
      case 'deck': {
        startBounds()
        let at = 0
        for (let i = 0; i <= 10; i++) {
          const g = i / 10
          later(() => updateBounds(g, 0), at)
          at += 180
        }
        later(() => { if (!content.game.isPlaying()) stopBounds() }, at + 400)
        break
      }
      case 'roof': {
        startBounds()
        let at = 0
        for (let i = 0; i <= 10; i++) {
          const g = i / 10
          later(() => updateBounds(0, g), at)
          at += 180
        }
        later(() => { if (!content.game.isPlaying()) stopBounds() }, at + 400)
        break
      }
      case 'land': land(20); break
      case 'ceiling': ceiling(); break
      case 'waveStart': waveStart(3); break
      case 'waveClear': waveClear(); break
      case 'extraLife': extraLife(); break
      case 'respawn': respawn(); break
      case 'hurry': hurry(); break
      case 'over': gameOver(); break
    }
  }

  // Binaural field probe. The arena is a left-to-right strip, so this proves
  // the stereo stage; the pitch demos above prove the other axis.
  function testDirection(which) {
    const k = K()
    const W = k.HEAR_RANGE
    const at = (dx, dAlt) => beat(dx, dAlt || 0, Math.abs(dx), 'bounder', false)
    if (which === 'l') at(-W * 0.8)
    else if (which === 'r') at(W * 0.8)
    else if (which === 'c') at(0)
    else if (which === 'up') { startReference(); updateReference(true, 0); at(0, 16) }
    else if (which === 'down') { startReference(); updateReference(true, 0); at(0, -16) }
    else if (which === 'sweep') {
      const stops = [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9]
      stops.forEach((p, i) => later(() => at(W * p), i * 360))
    }
    else if (which === 'ladder') {
      // The pitch scale, bottom to top, against the reference. This is the
      // single most useful thing on this screen.
      startReference()
      updateReference(true, 0)
      const alts = [-20, -12, -6, -2.5, 0, 2.5, 6, 12, 20]
      alts.forEach((a, i) => later(() => at(0, a), i * 460))
      later(() => { if (!content.game.isPlaying()) stopReference() }, alts.length * 460 + 800)
    }
  }

  return {
    setStaticListener: function () {},
    beat,
    updateRiders,
    updateFallingEggs,
    eggLand,
    eggTick,
    eggCollect,
    hatch,
    flap,
    land,
    ceiling,
    kill,
    death,
    bounce,
    arrive,
    countTone,
    waveStart,
    waveClear,
    extraLife,
    respawn,
    hurry,
    doom,
    gameOver,
    menuMove,
    menuSelect,
    menuBack,
    startAmbient,
    stopAmbient,
    startReference,
    stopReference,
    updateReference,
    startBounds,
    stopBounds,
    updateBounds,
    tone,
    positionalTone,
    frame,
    silenceAll,
    sample,
    testDirection,
    later,
  }
})()
