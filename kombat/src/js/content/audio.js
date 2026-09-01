// KOMBAT audio.
//
// Three channels, three questions, and they are kept apart so hard that you can
// answer any one of them while ignoring the other two:
//
//   WHERE are they?      Stereo position, plus a footstep pulse whose RATE
//                        speeds up as they close. Volume is deliberately not
//                        the distance cue — volume has to stay free to mean
//                        "how hard did that land".
//
//   Are they in the AIR? Brightness. A grounded fighter's presence tone is dark
//                        and bodied; a jump lifts it an octave and opens the
//                        filter, and it falls back as they land. This is the
//                        only reason you know a low attack is about to be
//                        wasted, or that a high one is about to be worth 35%
//                        more.
//
//   HIGH or LOW?         The direction the tell SWEEPS. Every attack broadcasts
//                        a whoosh during its startup frames: a high attack
//                        sweeps up, a low attack sweeps down. Nothing else in
//                        the game sweeps, so the two are never confusable, and
//                        the sweep lasts exactly as long as the startup — when
//                        it stops, the hit is live. A kick's sweep is long
//                        enough to react to; a punch's is not, which is the
//                        whole reason punches are worth throwing.
//
// On top of that sit the things that are not decisions: impacts, the round
// bell, the crowd, and a heartbeat that only exists to tell you the round is
// nearly over.
content.audio = (() => {
  const K = () => content.constants

  let presence = null      // the opponent: drone + pulse clock
  let heart = null         // low-health heartbeat
  let crowd = null         // the room
  let pulseT = 0
  let heartT = 0
  let staticListener = false
  let pendingTimeouts = []

  function ctx() { return engine.context() }
  function out() { return engine.mixer.output() }
  function now() { return engine.time() }

  // ---- shared noise ---------------------------------------------------------
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

  // A binaural ear at an arena offset. Arena units are compressed onto a small
  // listening stage by constants.earLocal, because the ear derives an
  // interaural delay from raw distance. syngen wants {x: forward,
  // y: left-positive}, so the sign flips exactly once, here.
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

  // ===========================================================================
  // the opponent: where they are, and whether they are on the floor
  // ===========================================================================
  // One continuous voice, running the whole round. Two oscillators a fifth
  // apart on the fighter's own toneHz, through a lowpass that opens when they
  // leave the ground. Quiet on purpose — it is a bed you stop noticing until it
  // changes, and every change in it is a change you need.
  function startPresence(toneHz) {
    stopPresence()
    const c = ctx()
    const ear = earAt(0)

    const gain = c.createGain()
    gain.gain.value = 0.0001
    ear.from(gain)

    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 320
    lp.Q.value = 0.7
    lp.connect(gain)

    const a = c.createOscillator()
    a.type = 'sawtooth'
    a.frequency.value = toneHz
    const ag = c.createGain()
    ag.gain.value = 0.5
    a.connect(ag).connect(lp)
    a.start()

    const b = c.createOscillator()
    b.type = 'sine'
    b.frequency.value = toneHz * 1.5
    const bg = c.createGain()
    bg.gain.value = 0.22
    b.connect(bg).connect(lp)
    b.start()

    gain.gain.linearRampToValueAtTime(0.05, now() + 0.4)
    presence = {ear, gain, lp, a, b, ag, bg, toneHz}
  }

  function stopPresence() {
    if (!presence) return
    const p = presence
    presence = null
    try {
      p.gain.gain.cancelScheduledValues(now())
      p.gain.gain.setTargetAtTime(0.0001, now(), 0.05)
    } catch (e) {}
    later(() => {
      try { p.a.stop(); p.b.stop() } catch (e) {}
      try { p.ear.destroy() } catch (e) {}
    }, 260)
  }

  // Called every frame with the match status. This is where the three channels
  // are actually driven.
  function frame(delta, st) {
    if (!st || st.foeX == null) return

    if (presence) {
      moveEar(presence.ear, st.dx)
      // Air = bright and an octave up. The ramp is short but not instant, so a
      // jump sounds like a jump rather than a switch.
      const air = K().clamp(st.foeY / K().JUMP_HEIGHT, 0, 1)
      const t = now()
      presence.lp.frequency.setTargetAtTime(320 + air * 2400, t, 0.05)
      presence.a.frequency.setTargetAtTime(presence.toneHz * (1 + air), t, 0.05)
      presence.b.frequency.setTargetAtTime(presence.toneHz * 1.5 * (1 + air), t, 0.05)
      presence.gain.gain.setTargetAtTime(0.04 + K().closeness(st.dist) * 0.05, t, 0.08)
    }

    // The footstep pulse: the distance channel. Interval shrinks as they close,
    // so an approach accelerates audibly long before it is in range.
    pulseT -= delta
    if (pulseT <= 0) {
      const interval = K().lerp(K().PULSE_FAR, K().PULSE_NEAR, K().closeness(st.dist))
      pulseT = interval
      step(st.dx, st.dist, st.foeStance)
    }

    // The heartbeat only exists below a third of your health. It is not
    // information you could not read off the HUD; it is there so that a blind
    // player knows the round is nearly decided without asking.
    if (st.healthFrac < 0.34 && st.phase === 'fight') {
      heartT -= delta
      if (heartT <= 0) {
        heartT = K().lerp(0.42, 0.86, st.healthFrac / 0.34)
        beat(st.healthFrac)
      }
    } else {
      heartT = 0
    }
  }

  // One footstep — the cue you actually locate the opponent with. Timbre carries
  // stance, so the pulse train answers "where" and "on the floor?" at the same
  // time even when the presence drone is masked.
  //
  // It is built in two parts, and the split is about localisation rather than
  // about how it sounds. The BODY is a wide, low-Q band that gives the step
  // weight and its stance colour. The TRANSIENT on top is a very short
  // high-passed click, and that is what the ear actually places: the
  // interaural time difference is read off a sharp broadband onset, and a
  // narrow band of noise barely has one. A step without the click is audible
  // on a side; a step with it is audible AT a place.
  function step(dx, dist, stance) {
    const c = ctx(), t0 = now()
    const ear = earAt(dx)
    const g = c.createGain()
    g.gain.value = 0
    ear.from(g)

    // Body: wide, so it carries broadband content the ear can compare.
    const s = noiseSource()
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = stance === 'air' ? 2400 : (stance === 'block' ? 900 : 460)
    bp.Q.value = stance === 'air' ? 1.2 : 0.6
    const sg = c.createGain()
    sg.gain.value = 0.75
    s.connect(bp).connect(sg).connect(g)

    // Transient: the localisation cue. Short enough to read as one instant.
    const click = noiseSource()
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 1800
    const cg = c.createGain()
    cg.gain.value = 0
    click.connect(hp).connect(cg).connect(g)
    cg.gain.setValueAtTime(0.9, t0)
    cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.012)

    const peak = 0.08 + K().closeness(dist) * 0.10
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(peak, t0 + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08)

    s.start(t0)
    s.stop(t0 + 0.11)
    click.start(t0)
    click.stop(t0 + 0.04)
    s.onended = () => {
      try { g.disconnect(); bp.disconnect(); sg.disconnect() } catch (e) {}
      try { hp.disconnect(); cg.disconnect() } catch (e) {}
      try { ear.destroy() } catch (e) {}
    }
  }

  function beat(frac) {
    const c = ctx(), t0 = now()
    const g = c.createGain()
    g.gain.value = 0
    g.connect(out())
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(72, t0)
    o.frequency.exponentialRampToValueAtTime(44, t0 + 0.13)
    o.connect(g)
    const peak = 0.10 + (1 - frac / 0.34) * 0.06
    g.gain.linearRampToValueAtTime(peak, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18)
    o.start(t0)
    o.stop(t0 + 0.22)
    o.onended = () => { try { g.disconnect() } catch (e) {} }
  }

  // ===========================================================================
  // the tell — the most important sound in the game
  // ===========================================================================
  // Played the instant an attack starts, at the attacker's position, lasting
  // exactly the startup. HIGH sweeps up, LOW sweeps down; a punch is a tight
  // band, a kick is a wide one with body behind it. The sweep ENDING is the
  // moment the hit goes live, so the cue is also a timer.
  function tell(dx, level, limb, startup) {
    const c = ctx(), t0 = now()
    const dur = Math.max(0.07, startup)
    const ear = earAt(dx)
    const g = c.createGain()
    g.gain.value = 0
    ear.from(g)

    const s = noiseSource()
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = limb === 'punch' ? 5.5 : 2.2

    const from = level === 'high' ? 700 : 620
    const to = level === 'high' ? 2100 : 150
    bp.frequency.setValueAtTime(from, t0)
    bp.frequency.exponentialRampToValueAtTime(to, t0 + dur)
    s.connect(bp).connect(g)

    // A kick drags a sine with it, so the heavier attack is heavier before it
    // arrives and not only after.
    if (limb !== 'punch') {
      const o = c.createOscillator()
      o.type = 'triangle'
      o.frequency.setValueAtTime(level === 'high' ? 220 : 150, t0)
      o.frequency.exponentialRampToValueAtTime(level === 'high' ? 480 : 70, t0 + dur)
      const og = c.createGain()
      og.gain.value = 0.4
      o.connect(og).connect(g)
      o.start(t0)
      o.stop(t0 + dur + 0.04)
    }

    const peak = limb === 'punch' ? 0.13 : 0.19
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(peak, t0 + dur * 0.35)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.03)

    s.start(t0)
    s.stop(t0 + dur + 0.05)
    s.onended = () => {
      try { g.disconnect(); bp.disconnect() } catch (e) {}
      try { ear.destroy() } catch (e) {}
    }
  }

  // ===========================================================================
  // impacts
  // ===========================================================================
  // Sub thump for weight, bandpassed click for the strike, noise tail for the
  // body. Pitched down for a low attack and up for a high one, so an impact
  // confirms which line you just got caught on — you need that to know what to
  // do differently next time.
  function hit(dx, level, limb, damage, airHit) {
    const c = ctx(), t0 = now()
    const ear = earAt(dx)
    const g = c.createGain()
    g.gain.value = 0
    ear.from(g)

    const weight = K().clamp(damage / 18, 0.35, 1.4)

    const sub = c.createOscillator()
    sub.type = 'sine'
    const base = level === 'high' ? 150 : 96
    sub.frequency.setValueAtTime(base, t0)
    sub.frequency.exponentialRampToValueAtTime(base * 0.45, t0 + 0.11)
    const subg = c.createGain()
    subg.gain.value = 0.85 * weight
    sub.connect(subg).connect(g)
    sub.start(t0)
    sub.stop(t0 + 0.2)

    const s = noiseSource()
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(limb === 'punch' ? 1800 : 1100, t0)
    bp.frequency.exponentialRampToValueAtTime(300, t0 + 0.14)
    bp.Q.value = 1.1
    const sg = c.createGain()
    sg.gain.value = 0.6
    s.connect(bp).connect(sg).connect(g)
    s.start(t0)
    s.stop(t0 + 0.24)

    // Catching them out of the air rings — it is the biggest single swing in
    // the damage table and it should sound like it.
    if (airHit) {
      const ring = c.createOscillator()
      ring.type = 'square'
      ring.frequency.setValueAtTime(880, t0)
      ring.frequency.exponentialRampToValueAtTime(1760, t0 + 0.09)
      const rg = c.createGain()
      rg.gain.value = 0.14
      ring.connect(rg).connect(g)
      ring.start(t0)
      ring.stop(t0 + 0.14)
    }

    const dur = 0.22 + weight * 0.1
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(0.30 * weight, t0 + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

    sub.onended = () => {
      later(() => {
        try { g.disconnect(); bp.disconnect(); sg.disconnect() } catch (e) {}
        try { ear.destroy() } catch (e) {}
      }, 300)
    }
  }

  // Bright, metallic, and short — a block should feel like a good outcome, and
  // it should be impossible to mistake for a hit even at the edge of hearing.
  function blocked(dx) {
    const c = ctx(), t0 = now()
    const ear = earAt(dx)
    const g = c.createGain()
    g.gain.value = 0
    ear.from(g)

    for (const f of [1900, 2840, 4130]) {
      const o = c.createOscillator()
      o.type = 'square'
      o.frequency.value = f
      const og = c.createGain()
      og.gain.value = 0.22
      o.connect(og).connect(g)
      o.start(t0)
      o.stop(t0 + 0.13)
    }
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 1200
    const s = noiseSource()
    const sg = c.createGain()
    sg.gain.value = 0.3
    s.connect(hp).connect(sg).connect(g)
    s.start(t0)
    s.stop(t0 + 0.1)

    g.gain.linearRampToValueAtTime(0.20, t0 + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14)
    s.onended = () => {
      try { g.disconnect(); hp.disconnect(); sg.disconnect() } catch (e) {}
      try { ear.destroy() } catch (e) {}
    }
  }

  // Empty air. No body, no sub — the absence of weight IS the information.
  function whiff(dx, limb) {
    const c = ctx(), t0 = now()
    const ear = earAt(dx)
    const g = c.createGain()
    g.gain.value = 0
    ear.from(g)
    const s = noiseSource()
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(limb === 'punch' ? 1400 : 900, t0)
    bp.frequency.exponentialRampToValueAtTime(280, t0 + 0.2)
    bp.Q.value = 0.9
    s.connect(bp).connect(g)
    g.gain.linearRampToValueAtTime(0.10, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24)
    s.start(t0)
    s.stop(t0 + 0.28)
    s.onended = () => {
      try { g.disconnect(); bp.disconnect() } catch (e) {}
      try { ear.destroy() } catch (e) {}
    }
  }

  // A sweep that passed underneath somebody. Deliberately NOT the whiff sound:
  // one of them means "you were out of range", the other means "they read you",
  // and those are different lessons.
  function jumpedOver(dx) {
    const c = ctx(), t0 = now()
    const ear = earAt(dx)
    const g = c.createGain()
    g.gain.value = 0
    ear.from(g)
    const s = noiseSource()
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(240, t0)
    bp.frequency.exponentialRampToValueAtTime(1500, t0 + 0.22)
    bp.Q.value = 3.5
    s.connect(bp).connect(g)
    g.gain.linearRampToValueAtTime(0.12, t0 + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26)
    s.start(t0)
    s.stop(t0 + 0.3)
    s.onended = () => {
      try { g.disconnect(); bp.disconnect() } catch (e) {}
      try { ear.destroy() } catch (e) {}
    }
  }

  // ===========================================================================
  // your own body
  // ===========================================================================
  function jump(dx) {
    const c = ctx(), t0 = now()
    const ear = earAt(dx)
    const g = c.createGain()
    g.gain.value = 0
    ear.from(g)
    const s = noiseSource()
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(400, t0)
    bp.frequency.exponentialRampToValueAtTime(2200, t0 + 0.3)
    bp.Q.value = 2
    s.connect(bp).connect(g)
    g.gain.linearRampToValueAtTime(0.13, t0 + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32)
    s.start(t0)
    s.stop(t0 + 0.36)
    s.onended = () => {
      try { g.disconnect(); bp.disconnect() } catch (e) {}
      try { ear.destroy() } catch (e) {}
    }
  }

  function land(dx) {
    thud(dx, 0.14, 110)
  }

  function knockdown(dx) {
    thud(dx, 0.30, 62)
  }

  function getup(dx) {
    const c = ctx(), t0 = now()
    const ear = earAt(dx)
    const g = c.createGain()
    g.gain.value = 0
    ear.from(g)
    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(180, t0)
    o.frequency.exponentialRampToValueAtTime(360, t0 + 0.2)
    o.connect(g)
    g.gain.linearRampToValueAtTime(0.10, t0 + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24)
    o.start(t0)
    o.stop(t0 + 0.28)
    o.onended = () => {
      try { g.disconnect() } catch (e) {}
      try { ear.destroy() } catch (e) {}
    }
  }

  function thud(dx, peak, hz) {
    const c = ctx(), t0 = now()
    const ear = earAt(dx)
    const g = c.createGain()
    g.gain.value = 0
    ear.from(g)
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(hz, t0)
    o.frequency.exponentialRampToValueAtTime(hz * 0.4, t0 + 0.16)
    o.connect(g)
    const s = noiseSource()
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 480
    const sg = c.createGain()
    sg.gain.value = 0.5
    s.connect(lp).connect(sg).connect(g)
    g.gain.linearRampToValueAtTime(peak, t0 + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26)
    o.start(t0); o.stop(t0 + 0.3)
    s.start(t0); s.stop(t0 + 0.3)
    o.onended = () => {
      try { g.disconnect(); lp.disconnect(); sg.disconnect() } catch (e) {}
      try { ear.destroy() } catch (e) {}
    }
  }

  // Backed into the wall. Short, dry, and unmistakably not an impact — being
  // cornered is the position you lose from, so it gets its own sound.
  let cornerT = 0
  function corner(dx) {
    if (now() - cornerT < 0.6) return
    cornerT = now()
    const c = ctx(), t0 = now()
    const g = c.createGain()
    g.gain.value = 0
    g.connect(out())
    const s = noiseSource()
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 240
    bp.Q.value = 6
    s.connect(bp).connect(g)
    g.gain.linearRampToValueAtTime(0.09, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2)
    s.start(t0)
    s.stop(t0 + 0.24)
    s.onended = () => { try { g.disconnect(); bp.disconnect() } catch (e) {} }
  }

  // ===========================================================================
  // specials
  // ===========================================================================
  // A rising charge whose length is the special's own charge time, so it is a
  // countdown to something you can still get out of the way of. Each fighter
  // gets its own waveform, because "which special is this" is a real question
  // in a four-fighter ladder.
  const CHARGE_WAVE = {rook: 'sawtooth', vex: 'square', sable: 'triangle', kroll: 'sine'}

  function specialCharge(dx, fighter, level, charge) {
    const c = ctx(), t0 = now()
    const dur = Math.max(0.12, charge)
    const ear = earAt(dx)
    const g = c.createGain()
    g.gain.value = 0
    ear.from(g)
    const o = c.createOscillator()
    o.type = CHARGE_WAVE[fighter] || 'sawtooth'
    const from = level === 'low' ? 90 : 220
    o.frequency.setValueAtTime(from, t0)
    o.frequency.exponentialRampToValueAtTime(from * (level === 'low' ? 1.9 : 3.2), t0 + dur)
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(500, t0)
    lp.frequency.exponentialRampToValueAtTime(4000, t0 + dur)
    o.connect(lp).connect(g)
    g.gain.linearRampToValueAtTime(0.16, t0 + dur * 0.6)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.05)
    o.start(t0)
    o.stop(t0 + dur + 0.08)
    o.onended = () => {
      try { g.disconnect(); lp.disconnect() } catch (e) {}
      try { ear.destroy() } catch (e) {}
    }
  }

  function specialFire(dx, id) {
    const c = ctx(), t0 = now()
    const ear = earAt(dx)
    const g = c.createGain()
    g.gain.value = 0
    ear.from(g)
    const o = c.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(id === 'quake' ? 60 : 520, t0)
    o.frequency.exponentialRampToValueAtTime(id === 'quake' ? 34 : 180, t0 + 0.3)
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = id === 'quake' ? 220 : 2600
    o.connect(lp).connect(g)
    g.gain.linearRampToValueAtTime(0.24, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34)
    o.start(t0)
    o.stop(t0 + 0.38)
    o.onended = () => {
      try { g.disconnect(); lp.disconnect() } catch (e) {}
      try { ear.destroy() } catch (e) {}
    }
  }

  // Vanish and arrive, in that order, with the gap between them being the whole
  // point: the stereo image is about to move and you get one beat to notice.
  function teleport(dx) {
    const c = ctx(), t0 = now()
    const ear = earAt(dx)
    const g = c.createGain()
    g.gain.value = 0
    ear.from(g)
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(1400, t0)
    o.frequency.exponentialRampToValueAtTime(180, t0 + 0.22)
    o.connect(g)
    g.gain.linearRampToValueAtTime(0.15, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24)
    o.start(t0)
    o.stop(t0 + 0.28)
    o.onended = () => {
      try { g.disconnect() } catch (e) {}
      try { ear.destroy() } catch (e) {}
    }
  }

  // A projectile is tracked, not sampled: one voice that moves across the
  // stereo field and rises in pitch as it closes, so "it is nearly here" is a
  // continuous reading rather than a countdown you have to remember.
  let boltVoice = null
  function projectile(dx, dist) {
    const c = ctx()
    if (!boltVoice) {
      const ear = earAt(dx)
      const g = c.createGain()
      g.gain.value = 0.0001
      ear.from(g)
      const o = c.createOscillator()
      o.type = 'triangle'
      o.frequency.value = 300
      o.connect(g)
      o.start()
      g.gain.linearRampToValueAtTime(0.13, now() + 0.05)
      boltVoice = {ear, g, o}
    }
    moveEar(boltVoice.ear, dx)
    boltVoice.o.frequency.setTargetAtTime(
      300 + K().closeness(dist) * 900, now(), 0.03)
  }

  function projectileGone() {
    if (!boltVoice) return
    const v = boltVoice
    boltVoice = null
    try {
      v.g.gain.cancelScheduledValues(now())
      v.g.gain.setTargetAtTime(0.0001, now(), 0.03)
    } catch (e) {}
    later(() => {
      try { v.o.stop() } catch (e) {}
      try { v.ear.destroy() } catch (e) {}
    }, 180)
  }

  // ===========================================================================
  // the room and the round
  // ===========================================================================
  function startAmbient() {
    if (crowd) return
    const c = ctx()
    const g = c.createGain()
    g.gain.value = 0.0001
    g.connect(out())
    const s = noiseSource()
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 500
    bp.Q.value = 0.4
    s.connect(bp).connect(g)
    s.start()
    g.gain.linearRampToValueAtTime(0.014, now() + 1.2)
    crowd = {g, s, bp}
  }

  function crowdRoar(strength) {
    if (!crowd) return
    const t = now()
    crowd.g.gain.cancelScheduledValues(t)
    crowd.g.gain.setValueAtTime(crowd.g.gain.value, t)
    crowd.g.gain.linearRampToValueAtTime(0.014 + 0.05 * strength, t + 0.08)
    crowd.g.gain.setTargetAtTime(0.014, t + 0.4, 0.8)
    crowd.bp.frequency.setValueAtTime(500 + 700 * strength, t)
    crowd.bp.frequency.setTargetAtTime(500, t + 0.5, 0.9)
  }

  // The round bell. `n` is the round number, and the interval it lands on says
  // which round it is without anyone having to read a number.
  function bell(n) {
    const c = ctx(), t0 = now()
    const g = c.createGain()
    g.gain.value = 0
    g.connect(out())
    const base = 440 * Math.pow(2, (n - 1) / 12 * 2)
    for (const [mult, amp] of [[1, 0.5], [2.76, 0.22], [5.4, 0.1]]) {
      const o = c.createOscillator()
      o.type = 'sine'
      o.frequency.value = base * mult
      const og = c.createGain()
      og.gain.value = amp
      o.connect(og).connect(g)
      o.start(t0)
      o.stop(t0 + 1.6)
    }
    g.gain.linearRampToValueAtTime(0.20, t0 + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.5)
    later(() => { try { g.disconnect() } catch (e) {} }, 1800)
  }

  function fightCall() {
    const c = ctx(), t0 = now()
    const g = c.createGain()
    g.gain.value = 0
    g.connect(out())
    const o = c.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(120, t0)
    o.frequency.exponentialRampToValueAtTime(300, t0 + 0.35)
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(400, t0)
    lp.frequency.exponentialRampToValueAtTime(3000, t0 + 0.35)
    o.connect(lp).connect(g)
    g.gain.linearRampToValueAtTime(0.22, t0 + 0.05)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6)
    o.start(t0)
    o.stop(t0 + 0.65)
    o.onended = () => { try { g.disconnect(); lp.disconnect() } catch (e) {} }
    crowdRoar(0.7)
  }

  function ko(won) {
    const c = ctx(), t0 = now()
    const g = c.createGain()
    g.gain.value = 0
    g.connect(out())
    const o = c.createOscillator()
    o.type = 'sawtooth'
    // Up if you won it, down if you did not. There is no faster way to say it.
    o.frequency.setValueAtTime(won ? 180 : 420, t0)
    o.frequency.exponentialRampToValueAtTime(won ? 720 : 90, t0 + 0.7)
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 2600
    o.connect(lp).connect(g)
    g.gain.linearRampToValueAtTime(0.26, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9)
    o.start(t0)
    o.stop(t0 + 0.95)
    o.onended = () => { try { g.disconnect(); lp.disconnect() } catch (e) {} }
    crowdRoar(won ? 1 : 0.35)
  }

  function stageClear() {
    const notes = [392, 523, 659, 784]
    notes.forEach((hz, i) => later(() => chime(hz, 0.5), i * 130))
  }

  function gameOver() {
    const notes = [392, 349, 294, 196]
    notes.forEach((hz, i) => later(() => chime(hz, 0.7), i * 190))
  }

  function chime(hz, dur) {
    const c = ctx(), t0 = now()
    const g = c.createGain()
    g.gain.value = 0
    g.connect(out())
    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.value = hz
    o.connect(g)
    g.gain.linearRampToValueAtTime(0.16, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.start(t0)
    o.stop(t0 + dur + 0.05)
    o.onended = () => { try { g.disconnect() } catch (e) {} }
  }

  // ===========================================================================
  // menus
  // ===========================================================================
  function blip(hz, dur, type, peak) {
    const c = ctx(), t0 = now()
    const g = c.createGain()
    g.gain.value = 0
    g.connect(out())
    const o = c.createOscillator()
    o.type = type || 'sine'
    o.frequency.value = hz
    o.connect(g)
    g.gain.linearRampToValueAtTime(peak == null ? 0.09 : peak, t0 + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 0.08))
    o.start(t0)
    o.stop(t0 + (dur || 0.08) + 0.02)
    o.onended = () => { try { g.disconnect() } catch (e) {} }
  }

  // ===========================================================================
  // teardown and the learn screen
  // ===========================================================================
  function silenceAll() {
    stopPresence()
    projectileGone()
    for (const id of pendingTimeouts) clearTimeout(id)
    pendingTimeouts = []
    if (crowd) {
      const cr = crowd
      crowd = null
      try {
        cr.g.gain.cancelScheduledValues(now())
        cr.g.gain.setTargetAtTime(0.0001, now(), 0.15)
      } catch (e) {}
      setTimeout(() => {
        try { cr.s.stop() } catch (e) {}
        try { cr.g.disconnect() } catch (e) {}
      }, 600)
    }
    pulseT = 0
    heartT = 0
  }

  // One cue at a time, in isolation, for the learn screen. Every entry here is
  // a sound the player is expected to act on — nothing decorative is listed,
  // because a vocabulary list you cannot use is just a longer menu.
  function sample(which) {
    switch (which) {
      case 'presenceNear': demoPresence(0.7, 0); break
      case 'presenceLeft': demoPresence(3.2, 0, -1); break
      case 'presenceRight': demoPresence(3.2, 0, 1); break
      case 'presenceAir': demoPresence(1.4, 1); break
      // A calibration cue: the same footstep walked across the whole image, so
      // the player can hear what "hard left" and "hard right" sound like before
      // having to read one under pressure.
      case 'footsteps': {
        for (let i = 0; i <= 10; i++) {
          const dx = -K().EAR_FULL_PAN + i * (K().EAR_FULL_PAN / 5)
          later(() => step(dx, Math.abs(dx), 'stand'), i * 190)
        }
        break
      }
      case 'tellHighPunch': tell(0.9, 'high', 'punch', 0.13); break
      case 'tellHighKick': tell(0.9, 'high', 'kick', 0.25); break
      case 'tellLowPunch': tell(0.9, 'low', 'punch', 0.15); break
      case 'tellLowKick': tell(0.9, 'low', 'kick', 0.28); break
      case 'hitHigh': hit(0.9, 'high', 'kick', 13, false); break
      case 'hitLow': hit(0.9, 'low', 'kick', 12, false); break
      case 'hitAir': hit(0.9, 'high', 'kick', 18, true); break
      case 'blocked': blocked(0.9); break
      case 'whiff': whiff(0.9, 'kick'); break
      case 'jumpedOver': jumpedOver(0.9); break
      case 'jump': jump(0); break
      case 'land': land(0); break
      case 'knockdown': knockdown(0.9); break
      case 'charge': specialCharge(1.2, 'sable', 'high', 0.34); break
      case 'quake': specialCharge(1.2, 'rook', 'low', 0.52); later(() => specialFire(1.2, 'quake'), 540); break
      case 'bolt': demoBolt(); break
      case 'teleport': teleport(1.2); break
      case 'corner': corner(0); break
      case 'heartbeat': beat(0.15); later(() => beat(0.15), 480); break
      case 'bell': bell(1); break
      case 'fight': fightCall(); break
      case 'koWin': ko(true); break
      case 'koLose': ko(false); break
      default: blip(440, 0.1)
    }
  }

  function demoPresence(dist, air, side) {
    const dx = (side == null ? 1 : side) * dist
    startPresence(124)
    const st = {
      foeX: dx, dx, dist, foeY: air * K().JUMP_HEIGHT,
      healthFrac: 1, phase: 'learn', foeStance: air ? 'air' : 'stand',
    }
    let n = 0
    const iv = setInterval(() => {
      frame(1 / 20, st)
      if (++n > 40) { clearInterval(iv); stopPresence() }
    }, 50)
  }

  function demoBolt() {
    specialCharge(3.2, 'sable', 'high', 0.34)
    later(() => {
      specialFire(3.2, 'bolt')
      let x = 3.2
      const iv = setInterval(() => {
        x -= 0.25
        projectile(x, Math.abs(x))
        if (x <= 0.3) { clearInterval(iv); projectileGone(); hit(0, 'high', 'special', 14, false) }
      }, 40)
    }, 360)
  }

  // The spatial diagnostic behind #test.
  function testDirection(dir) {
    const play = (dx) => step(dx, Math.abs(dx), 'stand')
    switch (dir) {
      case 'l': play(-K().ARENA_HALF); break
      case 'c': play(0); break
      case 'r': play(K().ARENA_HALF); break
      case 'high': tell(0, 'high', 'kick', 0.25); break
      case 'low': tell(0, 'low', 'kick', 0.28); break
      case 'sweep': {
        for (let i = 0; i <= 10; i++) {
          later(() => play(-K().ARENA_HALF + i * (K().ARENA_HALF / 5)), i * 120)
        }
        break
      }
      case 'ladder': {
        const list = ['tellLowKick', 'tellLowPunch', 'tellHighPunch', 'tellHighKick']
        list.forEach((s, i) => later(() => sample(s), i * 420))
        break
      }
    }
  }

  return {
    // round wiring
    startAmbient,
    startPresence,
    stopPresence,
    frame,
    // cues
    tell, hit, blocked, whiff, jumpedOver,
    jump, land, knockdown, getup, corner,
    specialCharge, specialFire, teleport, projectile, projectileGone,
    bell, fightCall, ko, stageClear, gameOver, crowdRoar,
    // menus
    menuMove: () => blip(520, 0.06, 'sine', 0.07),
    menuSelect: () => blip(780, 0.12, 'triangle', 0.10),
    menuBack: () => blip(300, 0.12, 'triangle', 0.09),
    // housekeeping
    silenceAll,
    sample,
    testDirection,
    setStaticListener: function () { staticListener = true },
  }
})()
