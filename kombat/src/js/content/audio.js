// KOMBAT audio.
//
// Four channels, four questions, and they are kept apart so hard that you can
// answer any one of them while ignoring the others:
//
//   WHERE are they?      Stereo position, plus a footstep pulse whose RATE
//                        speeds up as they close. Volume is deliberately not
//                        the distance cue — volume has to stay free to mean
//                        "how hard did that land". Position is always relative
//                        to YOUR fighter, who is the listener; see the panner
//                        below, which is the other half of this spec.
//
//   Are they in the AIR? Brightness. A grounded fighter's presence tone is dark
//                        and bodied; a jump lifts it an octave and opens the
//                        filter, and it falls back as they land. This is the
//                        only reason you know a low attack is about to be
//                        wasted, or that a high one is about to be worth 35%
//                        more.
//
//   What REACHES from    Three answers, not two: nothing, kicks, or everything.
//   here?                Each band has its own two-tone dyad, played rising as
//                        you get into it and falling as you drop out of it, and
//                        while you are in one, every footstep of theirs carries
//                        a tick per band — one for kicks, two for punches. So
//                        the crossing is announced and the state can also be
//                        read off any single step without having heard it.
//
//                        This is the question you answer before pressing
//                        anything, and for a long time the game did not answer
//                        it. The pulse rate technically carried distance, but
//                        spread across the whole arena, so the difference
//                        between "my kick lands" and "my kick whiffs" was three
//                        pulses a second against three and a bit; and when a
//                        gate was finally added it reported only the kick band,
//                        which told the player they were in range while their
//                        punches were still a foot short. See
//                        constants.spacing().
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
  let selfStepT = 0
  let reachBand = 0        // 0 nothing reaches, 1 kicks reach, 2 punches too
  let reachT = 0
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

  // ===========================================================================
  // the listener, and everything that is placed against it
  // ===========================================================================
  // THE LISTENER IS THE PLAYER'S FIGHTER. It is not the screen and not the
  // middle of the arena: it is a point that walks around with you. Every
  // positional cue below is handed the SOURCE's own arena x — the attacker's
  // for a tell, the victim's for an impact, the walker's for a footstep — and
  // the pan is worked out here against wherever the player is standing this
  // frame. That is what makes backing away actually sound like backing away,
  // and it is why your own body always sounds like it is at the centre of the
  // image: your x minus your x is zero.
  //
  // The listener faces the screen, not the opponent. Facing flips every time
  // you cross them, and an image that mirrors itself mid-match is unreadable;
  // arena left is your left for the whole fight.
  const SELF_STEP_INTERVAL = 0.31   // your own walking cadence, seconds
  // The two fighters spend most of a round within a hand's width of one of the
  // range edges, so the gate needs real hysteresis and a floor on how often it
  // can speak. Without both it is a smoke alarm.
  const REACH_HYSTERESIS = 0.30     // units you must leave a band by before losing it
  const REACH_REFRACTORY = 0.55     // and the soonest it may change its mind

  // The two bands, low to high. Closer is higher: each band's marker is its own
  // pair of tones, played rising as you enter it and falling as you fall out of
  // it, so "further in" and "further out" are the same gesture in two
  // directions and there is nothing to memorise beyond up and down.
  const BAND_TONES = {1: [740, 1110], 2: [1180, 1770]}

  let listenerX = 0
  function setListener(x) { listenerX = typeof x === 'number' ? x : 0 }

  // A mono source placed in the stereo image at arena position `x`.
  //
  // This deliberately does NOT use syngen's binaural ear. That ear is built for
  // a world where sources are metres out and it derives the entire image from
  // head geometry — and with gainModel.normalize both of its channels run at
  // the SAME gain, so all that separated left from right was a few hundred
  // microseconds of delay and a gentle shadow filter. That is a headphones-only
  // cue, it is close to inaudible on speakers, and syngen ramps it into place
  // over a frame, by which time a 12ms footstep transient is already finished.
  // The whole fight happened in the middle of your head.
  //
  // So the pan is built out of the three things that actually place a sound,
  // all of them set INSTANTLY at the moment the cue starts:
  //
  //   LEVEL   an equal-power split between the near and the far channel. This
  //           is the cue that survives speakers, a phone and a room.
  //   TIME    up to EAR_ITD of extra delay on the far channel. This is what
  //           makes it read as a place rather than as a volume knob.
  //   SHADOW  a lowpass on the far channel only. A head is in the way.
  //
  // Distance is NOT in here. Volume means "how hard did that land" and nothing
  // else; the footstep pulse RATE carries distance.
  const SHADOW_OPEN = 20000

  function sourceAt(x) {
    const c = ctx()
    const input = c.createGain()
    const merger = c.createChannelMerger(2)

    const channel = (n) => {
      const delay = c.createDelay(0.05)
      const shadow = c.createBiquadFilter()
      shadow.type = 'lowpass'
      shadow.frequency.value = SHADOW_OPEN
      shadow.Q.value = 0.4
      const gain = c.createGain()
      gain.gain.value = 1
      input.connect(delay)
      delay.connect(shadow)
      shadow.connect(gain)
      gain.connect(merger, 0, n)
      return {delay, shadow, gain}
    }

    const src = {
      input,
      merger,
      left: channel(0),
      right: channel(1),
      from: function (node) { node.connect(this.input); return this },
      destroy: function () {
        try { this.merger.disconnect() } catch (e) {}
        for (const ch of [this.left, this.right]) {
          try { ch.gain.disconnect() } catch (e) {}
          try { ch.shadow.disconnect() } catch (e) {}
          try { ch.delay.disconnect() } catch (e) {}
        }
        try { this.input.disconnect() } catch (e) {}
      },
    }

    merger.connect(out())
    place(src, x, true)
    return src
  }

  // `instant` is what every one-shot uses: the position is set on the sample
  // the cue starts, because the part of a sound the ear places is its first few
  // milliseconds. The two voices that are HELD while their source moves — the
  // opponent's presence drone and a projectile in flight — glide instead.
  function place(src, x, instant) {
    const p = K().panOf(x, listenerX)
    const a = Math.abs(p)
    const t = now()

    const set = (param, v) => {
      try {
        if (instant) {
          param.cancelScheduledValues(t)
          param.setValueAtTime(v, t)
        } else {
          param.setTargetAtTime(v, t, 0.04)
        }
      } catch (e) {}
    }

    // Equal power, stopping just short of silencing the far channel: a channel
    // that reaches absolute zero vanishes entirely when the two are summed.
    //
    // The SQRT2 is a level-matching trim, not a taste one. These cues were all
    // written against an ear that ran both channels at unity, so a plain
    // equal-power law would quietly drop every positional sound 3dB below the
    // bell, the heartbeat and the crowd, which are wired straight to the mix.
    // Scaled this way a centred cue is exactly as loud as it always was, and a
    // cue keeps that loudness as it pans — which it must, because in this game
    // volume means "how hard did that land" and nothing else.
    const theta = (p * K().EAR_FAR_TRIM + 1) * Math.PI / 4
    set(src.left.gain.gain, Math.SQRT2 * Math.cos(theta))
    set(src.right.gain.gain, Math.SQRT2 * Math.sin(theta))

    const itd = a * K().EAR_ITD
    set(src.left.delay.delayTime, p > 0 ? itd : 0)
    set(src.right.delay.delayTime, p < 0 ? itd : 0)

    const shadowed = SHADOW_OPEN * Math.pow(K().EAR_SHADOW_HZ / SHADOW_OPEN, a)
    set(src.left.shadow.frequency, p > 0 ? shadowed : SHADOW_OPEN)
    set(src.right.shadow.frequency, p < 0 ? shadowed : SHADOW_OPEN)
  }

  function moveSource(src, x) { place(src, x, false) }

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
    const src = sourceAt(0)

    const gain = c.createGain()
    gain.gain.value = 0.0001
    src.from(gain)

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
    presence = {src, gain, lp, a, b, ag, bg, toneHz}
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
      try { p.src.destroy() } catch (e) {}
    }, 260)
  }

  // Called every frame with the match status. This is where the three channels
  // are actually driven.
  function frame(delta, st) {
    if (!st || st.foeX == null) return

    // Before anything is placed: move the listener onto the player's fighter.
    // Everything below hands out ABSOLUTE arena positions and lets the panner
    // do the subtraction, so there is exactly one place in the game that knows
    // where you are standing, and it is this line.
    setListener(st.playerX)

    if (presence) {
      moveSource(presence.src, st.foeX)
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
    // so an approach accelerates audibly long before it is in range. It plays
    // at the OPPONENT's position, which is what makes it the cue you track them
    // with.
    pulseT -= delta
    if (pulseT <= 0) {
      const interval = K().lerp(K().PULSE_FAR, K().PULSE_NEAR, K().spacing(st.dist))
      pulseT = interval
      step(st.foeX, st.dist, st.foeStance)
    }

    // Your own footsteps, at your own position — which is dead centre, because
    // you are the listener. They are quieter, darker and carry no transient
    // click: the click is the localisation cue and it belongs to the opponent,
    // whose position you actually have to read. These exist so that walking
    // sounds like walking and so the middle of the image is anchored to a body.
    // They run on their own clock at a fixed cadence, and only while you are
    // actually walking on the floor, so they never compete with the pulse.
    if (st.playerWalking && st.stance !== 'air' && st.stance !== 'down') {
      selfStepT -= delta
      if (selfStepT <= 0) {
        selfStepT = SELF_STEP_INTERVAL
        step(st.playerX, 0, 'self')
      }
    } else {
      selfStepT = 0
    }

    // Can you reach them? This is the one thing a fighter has to know before it
    // is worth pressing anything, and it was the one thing the game never said.
    // The pulse rate carries how far away they are, but reading a rate takes
    // time you do not have mid-exchange, so the crossing itself gets a sound:
    // a short rising dyad when your longest attack starts reaching them, and a
    // falling one when it stops. It is a pure tone pair on purpose — every
    // attack in the game is swept noise, so this can never be mistaken for one.
    //
    // The gate has to be sticky. Two fighters at the edge of a kick jitter
    // across the boundary several times a second, and a cue that chattered
    // there would be worse than no cue at all.
    if (st.kickReach != null) {
      const want = bandFor(st.dist, st.punchReach, st.kickReach)
      // The state only flips when it is allowed to make a sound, so what you
      // last heard is always what the gate currently says. Deferring the flip
      // rather than dropping the cue is the difference between a gate that is
      // quiet for a moment and a gate that lies to you.
      if (want !== reachBand && now() - reachT >= REACH_REFRACTORY) {
        const closer = want > reachBand
        // Stepping out of punch range and out of the fight entirely in one
        // movement is one crossing, not two: you get told where you ended up.
        reachBand = want
        reachT = now()
        reachMark(st.foeX, want, closer)
      }
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
  //
  // `stance` of 'self' is your OWN step. It gets the body and not the click,
  // and it sits well under the opponent's: it is there to give you a walking
  // body at the centre of the image, not to be read for a position you already
  // know.
  function step(x, dist, stance) {
    const c = ctx(), t0 = now()
    const self = stance === 'self'
    const src = sourceAt(x)
    const g = c.createGain()
    g.gain.value = 0
    src.from(g)

    // Body: wide, so it carries broadband content the ear can compare.
    const s = noiseSource()
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = self ? 240 : (stance === 'air' ? 2400 : (stance === 'block' ? 900 : 460))
    bp.Q.value = stance === 'air' ? 1.2 : 0.6
    const sg = c.createGain()
    sg.gain.value = 0.75
    s.connect(bp).connect(sg).connect(g)

    // In-range tick. The gate above says the moment the window opens or shuts;
    // this says it CONTINUOUSLY, on the back of the pulse the player is already
    // counting, so "can I reach them" can be checked at any moment instead of
    // having to be remembered from the last time it changed. It is a single
    // short partial well above the step's own band, so it colours the step
    // without touching the stance reading underneath it.
    // One tick for kick range, two for punch range. Counting to two is faster
    // and far more robust than judging a pitch, and it means the band can be
    // read off any single footstep without having to have heard the crossing.
    //
    // They hang off the panner directly rather than off `g`: the step's own
    // envelope is down to nothing 80ms in, which would leave the second tick
    // thirty times quieter than the first and turn "two" into "one and a
    // maybe".
    let tickBus = null
    if (!self && reachBand > 0) {
      tickBus = c.createGain()
      tickBus.gain.value = 0.055
      src.from(tickBus)
      for (let i = 0; i < reachBand; i++) {
        const at = t0 + i * 0.038
        const tick = c.createOscillator()
        tick.type = 'sine'
        tick.frequency.value = 2640
        const tg = c.createGain()
        tg.gain.setValueAtTime(0.0001, at)
        tg.gain.exponentialRampToValueAtTime(1, at + 0.004)
        tg.gain.exponentialRampToValueAtTime(0.0001, at + 0.03)
        tick.connect(tg).connect(tickBus)
        tick.start(at)
        tick.stop(at + 0.04)
      }
    }

    // Transient: the localisation cue. Short enough to read as one instant.
    const click = noiseSource()
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 1800
    const cg = c.createGain()
    cg.gain.value = 0
    click.connect(hp).connect(cg).connect(g)
    cg.gain.setValueAtTime(self ? 0.12 : 0.9, t0)
    cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.012)

    const peak = self ? 0.045 : 0.08 + K().closeness(dist) * 0.10
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
      try { if (tickBus) tickBus.disconnect() } catch (e) {}
      try { src.destroy() } catch (e) {}
    }
  }

  // Which band a distance falls in. Hysteresis applies only on the way OUT of
  // whatever band we are currently in, so closing the distance is reported the
  // moment it is true and losing it takes a real step back.
  function bandFor(dist, punchReach, kickReach) {
    const slack = (band) => reachBand >= band ? REACH_HYSTERESIS : 0
    if (punchReach != null && dist <= punchReach + slack(2)) return 2
    if (dist <= kickReach + slack(1)) return 1
    return 0
  }

  // The range gate. Two short sine partials at the opponent's position — so it
  // answers "can I reach THEM" and not merely "is something in range" — rising
  // as you get into a band and falling as you drop out of it. Quiet: it is a
  // permission, not an event, and it plays over the top of a fight that still
  // has to be audible.
  //
  // Moving OUT of a band is announced with the tones of the band you just lost,
  // falling. That is deliberate: what you need to know at that moment is which
  // buttons stopped working, and those are the buttons the band you left had
  // just given you.
  function reachMark(x, band, closer) {
    const c = ctx(), t0 = now()
    const src = sourceAt(x)
    const g = c.createGain()
    g.gain.value = 0
    src.from(g)
    const tones = BAND_TONES[closer ? band : band + 1] || BAND_TONES[1]
    const pair = closer ? tones : [tones[1], tones[0]]
    pair.forEach((hz, i) => {
      const o = c.createOscillator()
      o.type = 'sine'
      o.frequency.value = hz
      const og = c.createGain()
      og.gain.value = 0
      og.gain.setValueAtTime(0, t0 + i * 0.045)
      og.gain.linearRampToValueAtTime(0.6, t0 + i * 0.045 + 0.005)
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.045 + 0.05)
      o.connect(og).connect(g)
      o.start(t0 + i * 0.045)
      o.stop(t0 + i * 0.045 + 0.06)
    })
    g.gain.setValueAtTime(closer ? 0.085 : 0.06, t0)
    later(() => { try { g.disconnect() } catch (e) {} try { src.destroy() } catch (e) {} }, 260)
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
  function tell(x, level, limb, startup) {
    const c = ctx(), t0 = now()
    const dur = Math.max(0.07, startup)
    const src = sourceAt(x)
    const g = c.createGain()
    g.gain.value = 0
    src.from(g)

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
      try { src.destroy() } catch (e) {}
    }
  }

  // ===========================================================================
  // impacts
  // ===========================================================================
  // Sub thump for weight, bandpassed click for the strike, noise tail for the
  // body. Pitched down for a low attack and up for a high one, so an impact
  // confirms which line you just got caught on — you need that to know what to
  // do differently next time.
  function hit(x, level, limb, damage, airHit) {
    const c = ctx(), t0 = now()
    const src = sourceAt(x)
    const g = c.createGain()
    g.gain.value = 0
    src.from(g)

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
        try { src.destroy() } catch (e) {}
      }, 300)
    }
  }

  // Bright, metallic, and short — a block should feel like a good outcome, and
  // it should be impossible to mistake for a hit even at the edge of hearing.
  function blocked(x) {
    const c = ctx(), t0 = now()
    const src = sourceAt(x)
    const g = c.createGain()
    g.gain.value = 0
    src.from(g)

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
      try { src.destroy() } catch (e) {}
    }
  }

  // Empty air. No body, no sub — the absence of weight IS the information.
  function whiff(x, limb) {
    const c = ctx(), t0 = now()
    const src = sourceAt(x)
    const g = c.createGain()
    g.gain.value = 0
    src.from(g)
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
      try { src.destroy() } catch (e) {}
    }
  }

  // A sweep that passed underneath somebody. Deliberately NOT the whiff sound:
  // one of them means "you were out of range", the other means "they read you",
  // and those are different lessons.
  function jumpedOver(x) {
    const c = ctx(), t0 = now()
    const src = sourceAt(x)
    const g = c.createGain()
    g.gain.value = 0
    src.from(g)
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
      try { src.destroy() } catch (e) {}
    }
  }

  // ===========================================================================
  // your own body
  // ===========================================================================
  function jump(x) {
    const c = ctx(), t0 = now()
    const src = sourceAt(x)
    const g = c.createGain()
    g.gain.value = 0
    src.from(g)
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
      try { src.destroy() } catch (e) {}
    }
  }

  function land(x) {
    thud(x, 0.14, 110)
  }

  function knockdown(x) {
    thud(x, 0.30, 62)
  }

  function getup(x) {
    const c = ctx(), t0 = now()
    const src = sourceAt(x)
    const g = c.createGain()
    g.gain.value = 0
    src.from(g)
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
      try { src.destroy() } catch (e) {}
    }
  }

  function thud(x, peak, hz) {
    const c = ctx(), t0 = now()
    const src = sourceAt(x)
    const g = c.createGain()
    g.gain.value = 0
    src.from(g)
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
      try { src.destroy() } catch (e) {}
    }
  }

  // Backed into the wall. Short, dry, and unmistakably not an impact — being
  // cornered is the position you lose from, so it gets its own sound.
  let cornerT = 0
  function corner() {
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

  function specialCharge(x, fighter, level, charge) {
    const c = ctx(), t0 = now()
    const dur = Math.max(0.12, charge)
    const src = sourceAt(x)
    const g = c.createGain()
    g.gain.value = 0
    src.from(g)
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
      try { src.destroy() } catch (e) {}
    }
  }

  function specialFire(x, id) {
    const c = ctx(), t0 = now()
    const src = sourceAt(x)
    const g = c.createGain()
    g.gain.value = 0
    src.from(g)
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
      try { src.destroy() } catch (e) {}
    }
  }

  // Vanish and arrive, in that order, with the gap between them being the whole
  // point: the stereo image is about to move and you get one beat to notice.
  function teleport(x) {
    const c = ctx(), t0 = now()
    const src = sourceAt(x)
    const g = c.createGain()
    g.gain.value = 0
    src.from(g)
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
      try { src.destroy() } catch (e) {}
    }
  }

  // A projectile is tracked, not sampled: one voice that moves across the
  // stereo field and rises in pitch as it closes, so "it is nearly here" is a
  // continuous reading rather than a countdown you have to remember.
  let boltVoice = null
  function projectile(x, dist) {
    const c = ctx()
    if (!boltVoice) {
      const src = sourceAt(x)
      const g = c.createGain()
      g.gain.value = 0.0001
      src.from(g)
      const o = c.createOscillator()
      o.type = 'triangle'
      o.frequency.value = 300
      o.connect(g)
      o.start()
      g.gain.linearRampToValueAtTime(0.13, now() + 0.05)
      boltVoice = {src, g, o}
    }
    moveSource(boltVoice.src, x)
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
      try { v.src.destroy() } catch (e) {}
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
    selfStepT = 0
    reachBand = 0
    reachT = 0
    setListener(0)
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
          const x = -K().EAR_FULL_PAN + i * (K().EAR_FULL_PAN / 5)
          later(() => step(x, Math.abs(x), 'stand'), i * 190)
        }
        break
      }
      // One demo per band: the crossing, then the pulse as it sounds once you
      // are there — the marker and the tick count are the same reading told
      // twice, and the player needs to recognise both.
      case 'rangeKick': {
        reachBand = 0
        reachMark(1.6, 1, true)
        reachBand = 1
        for (let i = 1; i <= 4; i++) later(() => step(1.6, 1.6, 'stand'), 240 + i * 300)
        later(() => { reachBand = 0 }, 1900)
        break
      }
      case 'rangePunch': {
        reachBand = 1
        reachMark(0.9, 2, true)
        reachBand = 2
        for (let i = 1; i <= 4; i++) later(() => step(0.9, 0.9, 'stand'), 240 + i * 230)
        later(() => { reachBand = 0 }, 1700)
        break
      }
      case 'rangeOut': {
        reachBand = 1
        for (let i = 0; i < 2; i++) later(() => step(2.4, 2.4, 'stand'), i * 300)
        later(() => { reachMark(2.4, 0, false); reachBand = 0 }, 620)
        for (let i = 1; i <= 3; i++) later(() => step(2.4, 2.4, 'stand'), 760 + i * 380)
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
    const foeX = (side == null ? 1 : side) * dist
    startPresence(124)
    const st = {
      playerX: 0, foeX, dist, foeY: air * K().JUMP_HEIGHT,
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
    const play = (x) => step(x, Math.abs(x), 'stand')
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
    // The learn and test screens play cues in isolation, with positions given
    // as plain arena offsets. Putting the listener back at the origin is what
    // makes those offsets mean what they say.
    setListener,
    setStaticListener: function () { setListener(0) },
  }
})()
