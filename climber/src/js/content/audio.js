/**
 * ESCALADOR — stereo audio engine.
 *
 * Listener mode: STEREO / non-spatial. Each cue is panned via a
 * StereoPannerNode whose pan ∈ [-1, 1]. We never touch engine.position,
 * never set a binaural ear, never set a listener yaw. Left ear belongs to
 * the LEFT hand, right ear to the RIGHT hand — so the input mapping
 * (A/Z left, K/M right) is also the audio mapping.
 *
 * Continuous voices (always running while game screen is up):
 *   leftGrip   — sine pulsing at the left hand's pitch (pan = -0.85)
 *   rightGrip  — sine pulsing at the right hand's pitch (pan = +0.85)
 *   wind       — broadband noise, gain ∝ altitude (centred)
 *   gorillaRoar — low throbbing drone, on after a threshold (centred)
 *
 * One-shot SFX go through enqueue({type, payload}) → drain() at frame end.
 *
 * Cross-module references use lazy getters per CLAUDE.md gotcha.
 */
content.audio = (() => {
  const _state = {
    started: false,
    masterBus: null,
    droneBus: null,
    sfxBus: null,
    leftGrip: null,           // {osc, sub, gain, pan, lfo, lfoGain}
    rightGrip: null,
    wind: null,               // {src, lp, gain}
    gorillaRoar: null,        // {osc, sub, gain, lfo, lfoGain}
    queue: [],
  }

  function ctx() { return engine.context() }
  function now() { return ctx().currentTime }

  // ----------------------------- ADSR helper -----------------------------
  function adsr(gainParam, t0, attack, hold, release, peak) {
    try {
      gainParam.cancelScheduledValues(t0)
      gainParam.setValueAtTime(0.0001, t0)
      gainParam.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + Math.max(0.001, attack))
      gainParam.setValueAtTime(peak, t0 + attack + hold)
      gainParam.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + Math.max(0.001, release))
      gainParam.setValueAtTime(0, t0 + attack + hold + release + 0.001)
    } catch (e) {}
  }

  function clampPan(x) { return Math.max(-1, Math.min(1, x)) }

  // ----------------------------- bus setup -----------------------------
  function ensureStarted() {
    if (_state.started) return
    _state.started = true
    const c = ctx()
    _state.masterBus = c.createGain()
    _state.masterBus.gain.value = 1
    _state.masterBus.connect(engine.mixer.input())

    _state.droneBus = c.createGain()
    _state.droneBus.gain.value = 0.85
    _state.droneBus.connect(_state.masterBus)

    _state.sfxBus = c.createGain()
    _state.sfxBus.gain.value = 1
    _state.sfxBus.connect(_state.masterBus)
  }

  // ----------------------------- enqueue / drain -----------------------------
  function enqueue(ev) { _state.queue.push(ev) }
  function drain() {
    if (!_state.queue.length) return
    const events = _state.queue
    _state.queue = []
    for (const ev of events) {
      try { dispatch(ev) } catch (e) { console.error(e) }
    }
  }
  function dispatch(ev) {
    if (!_state.started) ensureStarted()
    switch (ev.type) {
      case 'climb':         return onClimb(ev)
      case 'reachStart':    return onReachStart(ev)
      case 'reachFail':     return onReachFail(ev)
      case 'potIncoming':   return onPotIncoming(ev)
      case 'potDodge':      return onPotDodge(ev)
      case 'potHit':        return onPotHit(ev)
      case 'windowCreak':   return onWindowCreak(ev)
      case 'windowSlam':    return onWindowSlam(ev)
      case 'gorillaSwipe':  return onGorillaSwipe(ev)
      case 'gorillaWhoosh': return onGorillaWhoosh(ev)
      case 'fall':          return onFall(ev)
      case 'thud':          return onThud(ev)
      case 'extraLife':     return onExtraLife(ev)
      case 'buildingClear': return onBuildingClear(ev)
      case 'gameOver':      return onGameOver(ev)
      case 'floorChime':    return onFloorChime(ev)
      case 'pause':         return onPause(ev)
    }
  }

  // ----------------------------- continuous grip voice -----------------------------
  // Per-hand drone — sine carrier with a sub-octave triangle for body, plus
  // a gentle 4 Hz amplitude tremolo so a held grip sounds alive (not a held
  // tone). Pitch is set per-frame from hand altitude. Gain dips during reach
  // (in-flight) and re-stabilises on grip.
  function makeGripVoice(panX) {
    const c = ctx()
    const osc = c.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = 140
    const sub = c.createOscillator()
    sub.type = 'triangle'
    sub.frequency.value = 70
    const subGain = c.createGain()
    subGain.gain.value = 0.35
    sub.connect(subGain)
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 2500
    const trem = c.createGain()
    trem.gain.value = 1
    const lfo = c.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 4
    const lfoGain = c.createGain()
    lfoGain.gain.value = 0.10
    lfo.connect(lfoGain).connect(trem.gain)
    osc.connect(lp)
    subGain.connect(lp)
    lp.connect(trem)
    const gain = c.createGain()
    gain.gain.value = 0.0001
    const pan = c.createStereoPanner()
    pan.pan.value = panX
    trem.connect(gain).connect(pan).connect(_state.droneBus)
    osc.start(); sub.start(); lfo.start()
    gain.gain.setTargetAtTime(0.18, now(), 0.20)
    return {osc, sub, subGain, lp, trem, lfo, lfoGain, gain, pan}
  }

  function startGripVoices() {
    ensureStarted()
    if (!_state.leftGrip)  _state.leftGrip  = makeGripVoice(-0.85)
    if (!_state.rightGrip) _state.rightGrip = makeGripVoice(+0.85)
  }

  function stopGripVoices() {
    for (const k of ['leftGrip', 'rightGrip']) {
      const v = _state[k]
      if (!v) continue
      _state[k] = null
      const t = now()
      try { v.gain.gain.setTargetAtTime(0.0001, t, 0.10) } catch (e) {}
      setTimeout(() => {
        try { v.osc.stop() } catch (e) {}
        try { v.sub.stop() } catch (e) {}
        try { v.lfo.stop() } catch (e) {}
        try { v.osc.disconnect() } catch (e) {}
        try { v.sub.disconnect() } catch (e) {}
        try { v.lfo.disconnect() } catch (e) {}
        try { v.subGain.disconnect() } catch (e) {}
        try { v.lp.disconnect() } catch (e) {}
        try { v.trem.disconnect() } catch (e) {}
        try { v.lfoGain.disconnect() } catch (e) {}
        try { v.gain.disconnect() } catch (e) {}
        try { v.pan.disconnect() } catch (e) {}
      }, 300)
    }
  }

  // Floor → fundamental Hz for grip drones. We map an octave per ~24 floors
  // so the climb feels like a genuine ascent, not a fixed tone. Two semitones
  // separate left from right (left = lower octave anchor, right = +2 ST) so
  // the two ears are easy to disambiguate even at the same floor.
  function floorToHz(floor, isRight) {
    const base = isRight ? 165 : 140        // E3 vs C#3, ~+2 ST apart
    const semi = floor / 4                   // every 4 floors = 1 semitone
    return base * Math.pow(2, semi / 12)
  }

  // Update each hand's pitch + gain from current state. Called every frame
  // by content.game.tick. `reach` is 0..1: 0 = solid grip, 1 = mid-reach.
  // While reaching, we drop the gain ~50% and add a subtle pitch glide.
  function updateGripVoice(side, floor, reach, danger) {
    const v = side === 'left' ? _state.leftGrip : _state.rightGrip
    if (!v) return
    const t = now()
    const targetHz = floorToHz(floor, side === 'right')
    try { v.osc.frequency.setTargetAtTime(targetHz, t, 0.05) } catch (e) {}
    try { v.sub.frequency.setTargetAtTime(targetHz / 2, t, 0.05) } catch (e) {}
    // Gain dips while reaching, sits steady while gripping.
    const baseGain = 0.20 - reach * 0.12
    try { v.gain.gain.setTargetAtTime(baseGain, t, 0.04) } catch (e) {}
    // Danger (closing window touching this hand): open lowpass + thicken
    // tremolo into a wobble so the player hears "this hand is in trouble".
    const cutoff = danger ? 5500 : 2400
    try { v.lp.frequency.setTargetAtTime(cutoff, t, 0.05) } catch (e) {}
    try { v.lfoGain.gain.setTargetAtTime(danger ? 0.45 : 0.10, t, 0.05) } catch (e) {}
    try { v.lfo.frequency.setTargetAtTime(danger ? 11 : 4, t, 0.05) } catch (e) {}
  }

  // ----------------------------- wind ambience -----------------------------
  function startWind() {
    ensureStarted()
    if (_state.wind) return
    const c = ctx()
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1
    const src = c.createBufferSource()
    src.buffer = buf
    src.loop = true
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1100
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 220
    const gain = c.createGain()
    gain.gain.value = 0.0001
    src.connect(hp).connect(lp).connect(gain).connect(_state.droneBus)
    src.start()
    _state.wind = {src, lp, hp, gain}
  }
  function stopWind() {
    if (!_state.wind) return
    const w = _state.wind
    _state.wind = null
    try { w.gain.gain.setTargetAtTime(0.0001, now(), 0.20) } catch (e) {}
    setTimeout(() => {
      try { w.src.stop() } catch (e) {}
      try { w.src.disconnect() } catch (e) {}
      try { w.hp.disconnect() } catch (e) {}
      try { w.lp.disconnect() } catch (e) {}
      try { w.gain.disconnect() } catch (e) {}
    }, 400)
  }
  function updateWind(altitude) {
    if (!_state.wind) return
    const t = now()
    // Floor 0 → silent. Floor 100 → loud, bright.
    const a = Math.max(0, Math.min(1, altitude / 100))
    const g = 0.02 + a * 0.18
    const cutoff = 600 + a * 4500
    try { _state.wind.gain.gain.setTargetAtTime(g, t, 0.30) } catch (e) {}
    try { _state.wind.lp.frequency.setTargetAtTime(cutoff, t, 0.30) } catch (e) {}
  }

  // ----------------------------- gorilla roar -----------------------------
  function startGorillaRoar() {
    ensureStarted()
    if (_state.gorillaRoar) return
    const c = ctx()
    // Sub-bass sine + slightly detuned saw, gated by a 0.7 Hz LFO breathing
    // motion. Centred (pan ~0). The throb doubles up: a slow gain wobble +
    // a quicker pitch wobble, creating an animal-presence feel.
    const osc = c.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = 70
    const sub = c.createOscillator()
    sub.type = 'sine'
    sub.frequency.value = 38
    const subGain = c.createGain()
    subGain.gain.value = 0.55
    sub.connect(subGain)
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 320
    osc.connect(lp); subGain.connect(lp)
    const trem = c.createGain()
    trem.gain.value = 1
    const lfo = c.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 0.7
    const lfoGain = c.createGain()
    lfoGain.gain.value = 0.55
    lfo.connect(lfoGain).connect(trem.gain)
    // Pitch wobble — modulates sawtooth freq ±4 Hz at 3.4 Hz
    const pitchLfo = c.createOscillator()
    pitchLfo.type = 'sine'
    pitchLfo.frequency.value = 3.4
    const pitchLfoGain = c.createGain()
    pitchLfoGain.gain.value = 4
    pitchLfo.connect(pitchLfoGain).connect(osc.frequency)
    lp.connect(trem)
    const gain = c.createGain()
    gain.gain.value = 0.0001
    const pan = c.createStereoPanner()
    pan.pan.value = 0
    trem.connect(gain).connect(pan).connect(_state.droneBus)
    osc.start(); sub.start(); lfo.start(); pitchLfo.start()
    gain.gain.setTargetAtTime(0.18, now(), 0.50)
    _state.gorillaRoar = {osc, sub, subGain, lp, trem, lfo, lfoGain, pitchLfo, pitchLfoGain, gain, pan}
  }
  function stopGorillaRoar() {
    if (!_state.gorillaRoar) return
    const g = _state.gorillaRoar
    _state.gorillaRoar = null
    try { g.gain.gain.setTargetAtTime(0.0001, now(), 0.30) } catch (e) {}
    setTimeout(() => {
      try { g.osc.stop() } catch (e) {}
      try { g.sub.stop() } catch (e) {}
      try { g.lfo.stop() } catch (e) {}
      try { g.pitchLfo.stop() } catch (e) {}
      try { g.osc.disconnect() } catch (e) {}
      try { g.sub.disconnect() } catch (e) {}
      try { g.subGain.disconnect() } catch (e) {}
      try { g.lp.disconnect() } catch (e) {}
      try { g.trem.disconnect() } catch (e) {}
      try { g.lfo.disconnect() } catch (e) {}
      try { g.lfoGain.disconnect() } catch (e) {}
      try { g.pitchLfo.disconnect() } catch (e) {}
      try { g.pitchLfoGain.disconnect() } catch (e) {}
      try { g.gain.disconnect() } catch (e) {}
      try { g.pan.disconnect() } catch (e) {}
    }, 500)
  }
  function updateGorillaRoar(intensity) {
    if (!_state.gorillaRoar) return
    const t = now()
    const i = Math.max(0, Math.min(1, intensity))
    try { _state.gorillaRoar.gain.gain.setTargetAtTime(0.06 + i * 0.22, t, 0.20) } catch (e) {}
  }

  // ----------------------------- one-shot handlers -----------------------------
  // climb: bright ascending bell on the side of the hand that pulled up.
  // pitch encodes the new floor (so high floors sound brighter).
  function onClimb(ev) {
    const c = ctx()
    const t0 = now()
    const pan = c.createStereoPanner()
    pan.pan.value = ev.side === 'left' ? -0.6 : 0.6
    pan.connect(_state.sfxBus)
    const f = floorToHz(ev.floor || 0, ev.side === 'right') * 4   // two octaves up
    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(f, t0)
    o.frequency.exponentialRampToValueAtTime(f * 1.5, t0 + 0.10)
    const g = c.createGain()
    g.gain.value = 0
    o.connect(g).connect(pan)
    adsr(g.gain, t0, 0.003, 0.025, 0.130, 0.32)
    o.start(t0); o.stop(t0 + 0.20)
    setTimeout(() => { try{o.disconnect()}catch(e){} try{g.disconnect()}catch(e){} try{pan.disconnect()}catch(e){} }, 250)
  }

  // reachStart: a short upward chirp panned to that hand. Gives the player
  // tactile feedback that the input registered, before the climb chime.
  function onReachStart(ev) {
    const c = ctx()
    const t0 = now()
    const pan = c.createStereoPanner()
    pan.pan.value = ev.side === 'left' ? -0.7 : 0.7
    pan.connect(_state.sfxBus)
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(420, t0)
    o.frequency.exponentialRampToValueAtTime(720, t0 + 0.06)
    const g = c.createGain()
    g.gain.value = 0
    o.connect(g).connect(pan)
    adsr(g.gain, t0, 0.002, 0.010, 0.050, 0.18)
    o.start(t0); o.stop(t0 + 0.10)
    setTimeout(() => { try{o.disconnect()}catch(e){} try{g.disconnect()}catch(e){} try{pan.disconnect()}catch(e){} }, 150)
  }

  // reachFail: hand bonks against a closed window. Dull thud on that side.
  function onReachFail(ev) {
    const c = ctx()
    const t0 = now()
    const pan = c.createStereoPanner()
    pan.pan.value = ev.side === 'left' ? -0.8 : 0.8
    pan.connect(_state.sfxBus)
    const o = c.createOscillator()
    o.type = 'square'
    o.frequency.value = 130
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 700
    const g = c.createGain()
    g.gain.value = 0
    o.connect(lp).connect(g).connect(pan)
    adsr(g.gain, t0, 0.003, 0.040, 0.140, 0.45)
    o.start(t0); o.stop(t0 + 0.20)
    setTimeout(() => { try{o.disconnect()}catch(e){} try{lp.disconnect()}catch(e){} try{g.disconnect()}catch(e){} try{pan.disconnect()}catch(e){} }, 250)
  }

  // potIncoming: schedules a long descending whistle (1.5 s) and ends with
  // either an impact thud (no dodge) or a "miss-below" thud (dodged), but
  // the latter two are scheduled by separate events. The whistle alone is
  // what the player hears for the warning window.
  function onPotIncoming(ev) {
    const c = ctx()
    const t0 = now()
    const dur = ev.dur || 1.5
    const pan = c.createStereoPanner()
    pan.pan.value = ev.side === 'left' ? -0.95 : 0.95
    pan.connect(_state.sfxBus)
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(2400, t0)
    o.frequency.exponentialRampToValueAtTime(420, t0 + dur)
    const g = c.createGain()
    g.gain.value = 0
    o.connect(g).connect(pan)
    // Slow rise then sustained peak, no release before the thud.
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.32, t0 + 0.30)
    g.gain.setValueAtTime(0.32, t0 + dur - 0.05)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.start(t0); o.stop(t0 + dur + 0.05)
    setTimeout(() => { try{o.disconnect()}catch(e){} try{g.disconnect()}catch(e){} try{pan.disconnect()}catch(e){} }, (dur + 0.2) * 1000)
  }

  // potDodge: pot swooshes past below — low, quick whoosh on that side.
  function onPotDodge(ev) {
    const c = ctx()
    const t0 = now()
    const pan = c.createStereoPanner()
    pan.pan.value = ev.side === 'left' ? -0.9 : 0.9
    pan.connect(_state.sfxBus)
    const buf = c.createBuffer(1, c.sampleRate * 0.30, c.sampleRate)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 1.4)
    const src = c.createBufferSource()
    src.buffer = buf
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(900, t0)
    bp.frequency.exponentialRampToValueAtTime(220, t0 + 0.30)
    bp.Q.value = 4
    const g = c.createGain()
    g.gain.value = 0
    src.connect(bp).connect(g).connect(pan)
    adsr(g.gain, t0, 0.005, 0.060, 0.180, 0.40)
    src.start(t0)
    setTimeout(() => { try{src.disconnect()}catch(e){} try{bp.disconnect()}catch(e){} try{g.disconnect()}catch(e){} try{pan.disconnect()}catch(e){} }, 350)
  }

  // potHit: noise burst + bell, very loud, that side.
  function onPotHit(ev) {
    const c = ctx()
    const t0 = now()
    const pan = c.createStereoPanner()
    pan.pan.value = ev.side === 'left' ? -0.95 : 0.95
    pan.connect(_state.sfxBus)
    const buf = c.createBuffer(1, c.sampleRate * 0.45, c.sampleRate)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 1.2)
    const src = c.createBufferSource()
    src.buffer = buf
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1400
    const g = c.createGain()
    g.gain.value = 0
    src.connect(lp).connect(g).connect(pan)
    adsr(g.gain, t0, 0.002, 0.060, 0.350, 0.85)
    src.start(t0)
    // Bell ring on top — high triangle that bends down
    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(1100, t0)
    o.frequency.exponentialRampToValueAtTime(440, t0 + 0.40)
    const og = c.createGain()
    og.gain.value = 0
    o.connect(og).connect(pan)
    adsr(og.gain, t0, 0.002, 0.030, 0.380, 0.45)
    o.start(t0); o.stop(t0 + 0.50)
    setTimeout(() => { try{src.disconnect()}catch(e){} try{lp.disconnect()}catch(e){} try{g.disconnect()}catch(e){} try{o.disconnect()}catch(e){} try{og.disconnect()}catch(e){} try{pan.disconnect()}catch(e){} }, 600)
  }

  // windowCreak: ~1 s slowly accelerating creak, pitched higher as it nears
  // the slam. Distinct from any grip drone (sawtooth, lowpass).
  function onWindowCreak(ev) {
    const c = ctx()
    const t0 = now()
    const dur = ev.dur || 1.0
    const pan = c.createStereoPanner()
    pan.pan.value = ev.side === 'left' ? -0.7 : 0.7
    pan.connect(_state.sfxBus)
    const o = c.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(220, t0)
    o.frequency.exponentialRampToValueAtTime(560, t0 + dur)
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(800, t0)
    lp.frequency.exponentialRampToValueAtTime(2000, t0 + dur)
    const g = c.createGain()
    g.gain.value = 0
    o.connect(lp).connect(g).connect(pan)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.20, t0 + 0.30)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.start(t0); o.stop(t0 + dur + 0.05)
    setTimeout(() => { try{o.disconnect()}catch(e){} try{lp.disconnect()}catch(e){} try{g.disconnect()}catch(e){} try{pan.disconnect()}catch(e){} }, (dur + 0.2) * 1000)
  }

  // windowSlam: sharp wood-on-stone thwack on that side.
  function onWindowSlam(ev) {
    const c = ctx()
    const t0 = now()
    const pan = c.createStereoPanner()
    pan.pan.value = ev.side === 'left' ? -0.8 : 0.8
    pan.connect(_state.sfxBus)
    const buf = c.createBuffer(1, c.sampleRate * 0.20, c.sampleRate)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 1.7)
    const src = c.createBufferSource()
    src.buffer = buf
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 350
    bp.Q.value = 1.5
    const g = c.createGain()
    g.gain.value = 0
    src.connect(bp).connect(g).connect(pan)
    adsr(g.gain, t0, 0.001, 0.020, 0.140, 0.65)
    src.start(t0)
    setTimeout(() => { try{src.disconnect()}catch(e){} try{bp.disconnect()}catch(e){} try{g.disconnect()}catch(e){} try{pan.disconnect()}catch(e){} }, 250)
  }

  // gorillaWhoosh: 1 s warning sweep that pans across (left → right or
  // right → left) — tells the player a swipe is coming.
  function onGorillaWhoosh(ev) {
    const c = ctx()
    const t0 = now()
    const dur = ev.dur || 1.0
    const fromLeft = !!ev.fromLeft
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1
    const src = c.createBufferSource()
    src.buffer = buf
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(380, t0)
    bp.frequency.exponentialRampToValueAtTime(1400, t0 + dur)
    bp.Q.value = 5
    const g = c.createGain()
    g.gain.value = 0
    const pan = c.createStereoPanner()
    pan.pan.setValueAtTime(fromLeft ? -1 : 1, t0)
    pan.pan.linearRampToValueAtTime(fromLeft ? 1 : -1, t0 + dur)
    src.connect(bp).connect(g).connect(pan).connect(_state.sfxBus)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.40, t0 + 0.20)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.start(t0)
    setTimeout(() => { try{src.disconnect()}catch(e){} try{bp.disconnect()}catch(e){} try{g.disconnect()}catch(e){} try{pan.disconnect()}catch(e){} }, (dur + 0.2) * 1000)
  }

  // gorillaSwipe: the impact moment — heavy, centred thud.
  function onGorillaSwipe(ev) {
    const c = ctx()
    const t0 = now()
    const buf = c.createBuffer(1, c.sampleRate * 0.55, c.sampleRate)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 1.2)
    const src = c.createBufferSource()
    src.buffer = buf
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 600
    const g = c.createGain()
    g.gain.value = 0
    src.connect(lp).connect(g).connect(_state.sfxBus)
    adsr(g.gain, t0, 0.005, 0.080, 0.450, 0.95)
    src.start(t0)
    setTimeout(() => { try{src.disconnect()}catch(e){} try{lp.disconnect()}catch(e){} try{g.disconnect()}catch(e){} }, 700)
  }

  // fall: descending wail (siren-like) + wind whoosh that grows.
  function onFall(ev) {
    const c = ctx()
    const t0 = now()
    const dur = ev.dur || 1.4
    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(660, t0)
    o.frequency.exponentialRampToValueAtTime(110, t0 + dur)
    const g = c.createGain()
    g.gain.value = 0
    o.connect(g).connect(_state.sfxBus)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.45, t0 + 0.10)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.start(t0); o.stop(t0 + dur + 0.05)
    // Wind whoosh
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1
    const src = c.createBufferSource()
    src.buffer = buf
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(2000, t0)
    bp.frequency.exponentialRampToValueAtTime(180, t0 + dur)
    bp.Q.value = 3
    const wg = c.createGain()
    wg.gain.value = 0
    src.connect(bp).connect(wg).connect(_state.sfxBus)
    wg.gain.setValueAtTime(0.0001, t0)
    wg.gain.exponentialRampToValueAtTime(0.35, t0 + dur * 0.6)
    wg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.start(t0)
    setTimeout(() => { try{o.disconnect()}catch(e){} try{g.disconnect()}catch(e){} try{src.disconnect()}catch(e){} try{bp.disconnect()}catch(e){} try{wg.disconnect()}catch(e){} }, (dur + 0.2) * 1000)
  }

  // thud: ground impact at the bottom of a fall.
  function onThud(ev) {
    const c = ctx()
    const t0 = now()
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(80, t0)
    o.frequency.exponentialRampToValueAtTime(40, t0 + 0.30)
    const g = c.createGain()
    g.gain.value = 0
    o.connect(g).connect(_state.sfxBus)
    adsr(g.gain, t0, 0.002, 0.060, 0.350, 0.80)
    o.start(t0); o.stop(t0 + 0.50)
    setTimeout(() => { try{o.disconnect()}catch(e){} try{g.disconnect()}catch(e){} }, 600)
  }

  // extraLife: bright ascending triplet (A C E).
  function onExtraLife() {
    const c = ctx()
    const t0 = now()
    const notes = [440, 554.37, 659.25]
    notes.forEach((f, i) => {
      const o = c.createOscillator()
      o.type = 'triangle'
      o.frequency.value = f
      const g = c.createGain()
      g.gain.value = 0
      o.connect(g).connect(_state.sfxBus)
      adsr(g.gain, t0 + i * 0.10, 0.005, 0.040, 0.10, 0.40)
      o.start(t0 + i * 0.10); o.stop(t0 + i * 0.10 + 0.18)
      setTimeout(() => { try{o.disconnect()}catch(e){} try{g.disconnect()}catch(e){} }, 600)
    })
  }

  // buildingClear: triumphant fanfare — major arpeggio + sustained chord.
  function onBuildingClear() {
    const c = ctx()
    const t0 = now()
    const arp = [261.63, 329.63, 392.00, 523.25]
    arp.forEach((f, i) => {
      const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = f
      const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f * 1.005
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4500
      const g = c.createGain(); g.gain.value = 0
      o1.connect(lp); o2.connect(lp); lp.connect(g).connect(_state.sfxBus)
      const t = t0 + i * 0.10
      adsr(g.gain, t, 0.005, 0.06, 0.18, 0.36)
      o1.start(t); o1.stop(t + 0.28)
      o2.start(t); o2.stop(t + 0.28)
      setTimeout(() => {
        try{o1.disconnect()}catch(e){} try{o2.disconnect()}catch(e){}
        try{lp.disconnect()}catch(e){} try{g.disconnect()}catch(e){}
      }, 800)
    })
    const chordT = t0 + 0.50
    const chord = [523.25, 659.25, 783.99, 1046.50]
    chord.forEach((f) => {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f
      const g = c.createGain(); g.gain.value = 0
      o.connect(g).connect(_state.sfxBus)
      adsr(g.gain, chordT, 0.01, 0.40, 0.60, 0.22)
      o.start(chordT); o.stop(chordT + 1.10)
      setTimeout(() => { try{o.disconnect()}catch(e){} try{g.disconnect()}catch(e){} }, 1700)
    })
  }

  // gameOver: descending dirge. Notes are sequential (no overlap) so the
  // dirge reads as three deliberate steps rather than a wash.
  function onGameOver() {
    const c = ctx()
    const t0 = now()
    const notes = [
      {f: 293.66, t: 0.00, dur: 0.55, peak: 0.30},
      {f: 233.08, t: 0.55, dur: 0.55, peak: 0.32},
      {f: 174.61, t: 1.10, dur: 1.10, peak: 0.36},
    ]
    notes.forEach(n => {
      const o1 = c.createOscillator(); o1.type = 'triangle'; o1.frequency.value = n.f
      const o2 = c.createOscillator(); o2.type = 'sine';     o2.frequency.value = n.f / 2
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400
      const g = c.createGain(); g.gain.value = 0
      o1.connect(lp); o2.connect(lp); lp.connect(g).connect(_state.sfxBus)
      const tStart = t0 + n.t
      // Short attack, mostly hold, brief release — keeps each note dry.
      adsr(g.gain, tStart, 0.020, n.dur * 0.70, n.dur * 0.28, n.peak)
      o1.start(tStart); o1.stop(tStart + n.dur + 0.05)
      o2.start(tStart); o2.stop(tStart + n.dur + 0.05)
      setTimeout(() => {
        try{o1.disconnect()}catch(e){} try{o2.disconnect()}catch(e){}
        try{lp.disconnect()}catch(e){} try{g.disconnect()}catch(e){}
      }, (n.t + n.dur + 0.3) * 1000)
    })
  }

  // floorChime: subtle tick when the body altitude crosses an integer floor.
  // Pitch doubles every 10 floors so the player hears progress.
  function onFloorChime(ev) {
    const c = ctx()
    const t0 = now()
    const f = 880 * Math.pow(2, (ev.floor || 0) / 100)
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    const g = c.createGain()
    g.gain.value = 0
    o.connect(g).connect(_state.sfxBus)
    adsr(g.gain, t0, 0.002, 0.010, 0.050, 0.10)
    o.start(t0); o.stop(t0 + 0.10)
    setTimeout(() => { try{o.disconnect()}catch(e){} try{g.disconnect()}catch(e){} }, 150)
  }

  function onPause(ev) {
    const c = ctx()
    const t0 = now()
    const o = c.createOscillator()
    o.type = 'square'
    o.frequency.value = ev.resume ? 880 : 440
    const g = c.createGain()
    g.gain.value = 0
    o.connect(g).connect(_state.sfxBus)
    adsr(g.gain, t0, 0.002, 0.020, 0.080, 0.30)
    o.start(t0); o.stop(t0 + 0.15)
    setTimeout(() => { try{o.disconnect()}catch(e){} try{g.disconnect()}catch(e){} }, 200)
  }

  // ----------------------------- silenceAll -----------------------------
  function silenceAll() {
    if (!_state.started) return
    stopGripVoices()
    stopWind()
    stopGorillaRoar()
    _state.queue = []
  }

  // ----------------------------- diagnostic helpers -----------------------------
  function emitTickAt(panX, freq) {
    ensureStarted()
    const c = ctx()
    const t0 = now()
    const o = c.createOscillator()
    o.type = 'square'
    o.frequency.value = freq || 1500
    const g = c.createGain()
    g.gain.value = 0
    const pan = c.createStereoPanner()
    pan.pan.value = clampPan(panX)
    o.connect(g).connect(pan).connect(_state.sfxBus)
    adsr(g.gain, t0, 0.003, 0.040, 0.080, 0.50)
    o.start(t0); o.stop(t0 + 0.18)
    setTimeout(() => { try{o.disconnect()}catch(e){} try{g.disconnect()}catch(e){} try{pan.disconnect()}catch(e){} }, 250)
  }

  // Preview functions for the learn screen — each starts the cue and
  // returns a stop fn.
  function previewGrip(side) {
    ensureStarted()
    if (side === 'left') {
      if (!_state.leftGrip) _state.leftGrip = makeGripVoice(-0.85)
      updateGripVoice('left', 5, 0, false)
    } else {
      if (!_state.rightGrip) _state.rightGrip = makeGripVoice(+0.85)
      updateGripVoice('right', 5, 0, false)
    }
    return () => {
      // Don't stop both — only the one we started, and only if the other
      // didn't already exist. Simpler: leave them; learn screen calls
      // silenceLearn() explicitly on exit.
    }
  }
  function silenceLearn() {
    stopGripVoices()
    stopWind()
    stopGorillaRoar()
  }
  function previewWind(altitude) {
    startWind()
    updateWind(altitude || 30)
    return () => stopWind()
  }
  function previewGorillaRoar() {
    startGorillaRoar()
    updateGorillaRoar(0.7)
    return () => stopGorillaRoar()
  }

  // ----------------------------- public API -----------------------------
  return {
    start: ensureStarted,
    silenceAll,
    drain,
    enqueue,
    dispatch,
    // continuous voices
    startGripVoices,
    stopGripVoices,
    updateGripVoice,
    startWind,
    stopWind,
    updateWind,
    startGorillaRoar,
    stopGorillaRoar,
    updateGorillaRoar,
    // diagnostics / learn
    emitTickAt,
    previewGrip,
    previewWind,
    previewGorillaRoar,
    silenceLearn,
    // state
    _state,
  }
})()
