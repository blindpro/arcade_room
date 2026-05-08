// Procedural backing track for the math game.
//
// Adapted from /home/games/dynamic_beatstar/src/js/content/music.js. Same
// drum / bass / pad scheduler and bridge-modulation logic, with one major
// addition: a continuous **melodic lead** voice that plays through the
// whole solve window. Beatstar's lead voice was reserved for the hint
// pattern; here, since the player is solving an operation rather than
// repeating a melody, the lead runs as a generative chord-tone phrase so
// the music never feels percussive-only.
//
// All other architecture is verbatim from beatstar — see comments in that
// file for the full design.
content.music = (() => {
  const LOOKAHEAD_S = 0.15
  const STEPS_PER_BEAT = 4    // 16th-note grid
  const BUS_GAIN = 0.32

  const state = {
    running: false,
    bpm: 90,
    style: null,
    meter: 4,
    tonality: {rootSemitone: 0, mode: 'major'},
    progression: [
      {r:0,t:'maj'}, {r:0,t:'maj'}, {r:0,t:'maj'}, {r:0,t:'maj'},
    ],
    bridgeChords: null,
    bridgeStyle: null,
    nextStepTime: 0,
    stepIndex: 0,
    bus: null,
    frameSubbed: false,
    // Whether the lead melody plays. Off during intro count-in (so the
    // count is clean) and during the verdict pause; on through the solve
    // window. Toggled by content.game via setLeadActive().
    leadActive: false,
    // Per-measure lead phrase, regenerated at every measure boundary so
    // the melody stays fresh. Indexed by step-in-measure.
    leadPhrase: null,
    leadPhraseMeasureIndex: -1,
  }

  function ctx()  { return engine.context() }
  function dest() { return engine.mixer.input() }

  function ensureBus() {
    if (state.bus) return state.bus
    state.bus = ctx().createGain()
    state.bus.gain.value = 0
    state.bus.connect(dest())
    return state.bus
  }

  function envGain(parent, t0, attack, hold, release, peak) {
    const g = ctx().createGain()
    g.gain.cancelScheduledValues(t0)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(peak, t0 + attack)
    g.gain.setValueAtTime(peak, t0 + attack + hold)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release)
    g.connect(parent)
    return g
  }

  function noiseBuffer(durS) {
    const c = ctx()
    const n = Math.max(1, Math.floor(c.sampleRate * durS))
    const buf = c.createBuffer(1, n, c.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    return buf
  }

  // ----------------------------------------------------------------
  // Drum voices (forked from beatstar; new kits added for circus,
  // cartoon, klezmer, music-box, minimal, drone, clock).
  // ----------------------------------------------------------------
  function drumKick(when, kit) {
    const c = ctx()
    let f0 = 110, f1 = 38, dur = 0.18, peak = 0.95, click = true
    if (kit === 'electro')   { f0 = 130; f1 = 32; dur = 0.22; peak = 1.00 }
    else if (kit === 'fourFloor') { f0 = 120; f1 = 36; dur = 0.16; peak = 1.00 }
    else if (kit === 'rock')      { f0 = 130; f1 = 50; dur = 0.16; peak = 0.95 }
    else if (kit === 'chip')      { f0 = 70;  f1 = 70; dur = 0.04; peak = 0.55; click = false }
    else if (kit === 'bossa')     { f0 = 100; f1 = 60; dur = 0.10; peak = 0.55; click = false }
    else if (kit === 'brush')     { f0 = 95;  f1 = 50; dur = 0.10; peak = 0.55; click = false }
    else if (kit === 'funk')      { f0 = 125; f1 = 42; dur = 0.13; peak = 0.95 }
    else if (kit === 'jazz')      { f0 = 110; f1 = 55; dur = 0.10; peak = 0.55; click = false }
    else if (kit === 'latin')     { f0 = 110; f1 = 55; dur = 0.09; peak = 0.60; click = false }
    else if (kit === 'disco')     { f0 = 122; f1 = 36; dur = 0.18; peak = 1.00 }
    else if (kit === 'ambient')   { f0 = 90;  f1 = 45; dur = 0.18; peak = 0.42; click = false }
    // circus oompah: tuba-shaped fat low thump on the "oom".
    else if (kit === 'oompah')    { f0 = 80;  f1 = 50; dur = 0.20; peak = 0.85; click = false }
    // cartoon: tight, bright thump
    else if (kit === 'cartoon')   { f0 = 150; f1 = 55; dur = 0.08; peak = 0.85 }
    // klezmer: dry tom-like thump
    else if (kit === 'klezmer')   { f0 = 105; f1 = 65; dur = 0.10; peak = 0.55; click = false }
    // music-box: very soft tap
    else if (kit === 'musicBox')  { f0 = 200; f1 = 200; dur = 0.02; peak = 0.18; click = false }
    // minimal: short woody pulse
    else if (kit === 'minimal')   { f0 = 95;  f1 = 70; dur = 0.05; peak = 0.45; click = false }
    // drone: barely-there thud
    else if (kit === 'drone')     { f0 = 65;  f1 = 50; dur = 0.30; peak = 0.30; click = false }
    // clockwork: percussive tick (mechanical)
    else if (kit === 'clock')     { f0 = 1200; f1 = 1200; dur = 0.01; peak = 0.30; click = false }
    // baroqueNone: no drums (kit handler returns no kicks)
    else if (kit === 'baroqueNone') { return }
    const o = c.createOscillator(); o.type = 'sine'
    o.frequency.setValueAtTime(f0, when)
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, when + dur * 0.6)
    const e = envGain(state.bus, when, 0.001, 0.01, dur, peak)
    o.connect(e); o.start(when); o.stop(when + dur + 0.05)
    if (click) {
      const src = c.createBufferSource(); src.buffer = noiseBuffer(0.01)
      const hp = c.createBiquadFilter(); hp.type = 'highpass'
      hp.frequency.setValueAtTime(2500, when)
      const eC = envGain(state.bus, when, 0.0005, 0.001, 0.012, 0.40)
      src.connect(hp).connect(eC)
      src.start(when); src.stop(when + 0.02)
    }
  }

  function drumSnare(when, kit, ghost) {
    const c = ctx()
    const peakBody = ghost ? 0.18 : 0.35
    const peakNoise = ghost ? 0.28 : 0.55
    let bodyF = 190, bodyF1 = 150, noiseF = 1800, noiseDur = 0.16, hasBody = true
    if (kit === 'electro')   { bodyF = 220; bodyF1 = 170; noiseF = 2200; noiseDur = 0.13 }
    else if (kit === 'rock') { bodyF = 200; bodyF1 = 160; noiseF = 1800 }
    else if (kit === 'bossa') { hasBody = false; noiseF = 2500; noiseDur = 0.06 }
    else if (kit === 'brush') { hasBody = false; noiseF = 1200; noiseDur = 0.18 }
    else if (kit === 'fourFloor') { bodyF = 200; bodyF1 = 160; noiseF = 2000 }
    else if (kit === 'chip') { hasBody = false; noiseF = 3000; noiseDur = 0.04 }
    else if (kit === 'funk') { bodyF = 210; bodyF1 = 170; noiseF = 2400; noiseDur = 0.10 }
    else if (kit === 'jazz') { hasBody = false; noiseF = 1500; noiseDur = 0.14 }
    else if (kit === 'latin') { hasBody = false; noiseF = 2800; noiseDur = 0.04 }
    else if (kit === 'disco') { bodyF = 200; bodyF1 = 160; noiseF = 2200; noiseDur = 0.14 }
    else if (kit === 'ambient') { hasBody = false; noiseF = 900; noiseDur = 0.22 }
    // circus: snare-drum roll-shape, bright and rim-shotty
    else if (kit === 'oompah') { bodyF = 230; bodyF1 = 180; noiseF = 2600; noiseDur = 0.08 }
    // cartoon: woodblock — pitched body, no noise
    else if (kit === 'cartoon') { bodyF = 900; bodyF1 = 900; noiseF = 4000; noiseDur = 0.012 }
    // klezmer: tom-like body, light noise
    else if (kit === 'klezmer') { bodyF = 240; bodyF1 = 200; noiseF = 1600; noiseDur = 0.08 }
    // music-box: silent (no snare)
    else if (kit === 'musicBox') { hasBody = false; noiseF = 4000; noiseDur = 0.008 }
    // minimal: short bandpassed click
    else if (kit === 'minimal') { hasBody = false; noiseF = 3200; noiseDur = 0.04 }
    // drone: silent
    else if (kit === 'drone')   { hasBody = false; noiseF = 1200; noiseDur = 0.005 }
    // clock: hi-pitched 'tock' on backbeat — like the second-hand cousin
    else if (kit === 'clock')   { hasBody = false; noiseF = 5500; noiseDur = 0.015 }
    else if (kit === 'baroqueNone') { return }
    if (hasBody) {
      const o = c.createOscillator(); o.type = 'triangle'
      o.frequency.setValueAtTime(bodyF, when)
      o.frequency.exponentialRampToValueAtTime(bodyF1, when + 0.06)
      const eO = envGain(state.bus, when, 0.001, 0.005, 0.08, peakBody)
      o.connect(eO)
      o.start(when); o.stop(when + 0.12)
    }
    const src = c.createBufferSource(); src.buffer = noiseBuffer(noiseDur + 0.02)
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'
    bp.frequency.setValueAtTime(noiseF, when)
    bp.Q.value = 0.9
    const eN = envGain(state.bus, when, 0.001, 0.005, noiseDur, peakNoise)
    src.connect(bp).connect(eN)
    src.start(when); src.stop(when + noiseDur + 0.02)
  }

  function drumHat(when, kit, accent) {
    const c = ctx()
    let hpF = 7000, dur = 0.05, peak = accent ? 0.30 : 0.18, release = accent ? 0.04 : 0.025
    if (kit === 'electro') { hpF = 8500; peak = accent ? 0.25 : 0.16 }
    else if (kit === 'fourFloor') { hpF = 8000; peak = accent ? 0.32 : 0.22 }
    else if (kit === 'chip') { hpF = 6000; peak = accent ? 0.22 : 0.14 }
    else if (kit === 'brush') { hpF = 5500; peak = accent ? 0.18 : 0.12; release = 0.05 }
    else if (kit === 'bossa') { hpF = 6500; peak = accent ? 0.22 : 0.14 }
    else if (kit === 'funk')  { hpF = 8200; peak = accent ? 0.28 : 0.20 }
    else if (kit === 'jazz')  { hpF = 5800; peak = accent ? 0.20 : 0.14; release = 0.06 }
    else if (kit === 'latin') { hpF = 7500; peak = accent ? 0.22 : 0.16 }
    else if (kit === 'disco') { hpF = 7800; peak = accent ? 0.34 : 0.22; release = 0.06 }
    else if (kit === 'ambient') { hpF = 5000; peak = accent ? 0.10 : 0.07; release = 0.08 }
    // oompah: bright crash-cymbal-like accent on the "pah"
    else if (kit === 'oompah') { hpF = 9000; peak = accent ? 0.40 : 0.22; release = 0.10 }
    // cartoon: short bright tick
    else if (kit === 'cartoon') { hpF = 9500; peak = accent ? 0.30 : 0.18; release = 0.02 }
    // klezmer: ride-flavoured shimmer
    else if (kit === 'klezmer') { hpF = 6500; peak = accent ? 0.30 : 0.22; release = 0.07 }
    // music-box: tiny tick
    else if (kit === 'musicBox') { hpF = 8000; peak = 0.05; release = 0.02 }
    // minimal: barely-audible tick
    else if (kit === 'minimal') { hpF = 7500; peak = accent ? 0.10 : 0.06; release = 0.02 }
    // drone: silence (no hat)
    else if (kit === 'drone')   { return }
    // clock: 'tick' — narrow bandpassed noise that reads as a clock
    else if (kit === 'clock')   { hpF = 6000; peak = 0.18; release = 0.012; dur = 0.02 }
    else if (kit === 'baroqueNone') { return }
    const src = c.createBufferSource(); src.buffer = noiseBuffer(dur + 0.01)
    const hp = c.createBiquadFilter(); hp.type = 'highpass'
    hp.frequency.setValueAtTime(hpF, when)
    const e = envGain(state.bus, when, 0.0005, 0.002, release, peak)
    src.connect(hp).connect(e)
    src.start(when); src.stop(when + dur)
  }

  // ----------------------------------------------------------------
  // Bass voices (forked from beatstar; 'tuba' added for circus oompah)
  // ----------------------------------------------------------------
  function bassNote(freq, when, dur, voice) {
    const c = ctx()
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'
    lp.frequency.setValueAtTime(420, when)
    let peak = 0.45

    if (voice === 'sub') {
      lp.frequency.setValueAtTime(220, when)
      const o1 = c.createOscillator(); o1.type = 'sine'
      o1.frequency.setValueAtTime(freq, when)
      const o2 = c.createOscillator(); o2.type = 'sine'
      o2.frequency.setValueAtTime(freq, when); o2.detune.setValueAtTime(-7, when)
      const e = envGain(state.bus, when, 0.005, dur * 0.6, dur * 0.4, 0.55)
      o1.connect(lp); o2.connect(lp); lp.connect(e)
      o1.start(when); o1.stop(when + dur + 0.05)
      o2.start(when); o2.stop(when + dur + 0.05)
      return
    }
    if (voice === 'square') {
      const o = c.createOscillator(); o.type = 'square'
      o.frequency.setValueAtTime(freq, when)
      lp.frequency.setValueAtTime(680, when)
      const e = envGain(state.bus, when, 0.002, Math.min(dur * 0.5, 0.12), Math.min(dur * 0.5, 0.20), 0.30)
      o.connect(lp).connect(e)
      o.start(when); o.stop(when + dur + 0.05)
      return
    }
    if (voice === 'pluck') {
      const o = c.createOscillator(); o.type = 'triangle'
      o.frequency.setValueAtTime(freq, when)
      lp.frequency.setValueAtTime(900, when)
      lp.frequency.exponentialRampToValueAtTime(380, when + 0.15)
      const e = envGain(state.bus, when, 0.003, 0.02, 0.18, 0.42)
      o.connect(lp).connect(e)
      o.start(when); o.stop(when + 0.25)
      return
    }
    if (voice === 'slap') {
      const o1 = c.createOscillator(); o1.type = 'square'
      o1.frequency.setValueAtTime(freq, when)
      const o2 = c.createOscillator(); o2.type = 'sine'
      o2.frequency.setValueAtTime(freq / 2, when)
      lp.frequency.setValueAtTime(2200, when)
      lp.frequency.exponentialRampToValueAtTime(420, when + 0.08)
      const e = envGain(state.bus, when, 0.001, 0.04, 0.16, 0.42)
      o1.connect(lp); o2.connect(lp); lp.connect(e)
      o1.start(when); o1.stop(when + 0.25)
      o2.start(when); o2.stop(when + 0.25)
      return
    }
    if (voice === 'driving') {
      const o1 = c.createOscillator(); o1.type = 'sawtooth'
      o1.frequency.setValueAtTime(freq, when)
      const o2 = c.createOscillator(); o2.type = 'sine'
      o2.frequency.setValueAtTime(freq, when); o2.detune.setValueAtTime(-5, when)
      lp.frequency.setValueAtTime(520, when)
      const e = envGain(state.bus, when, 0.003, dur * 0.4, dur * 0.5, 0.42)
      o1.connect(lp); o2.connect(lp); lp.connect(e)
      o1.start(when); o1.stop(when + dur + 0.05)
      o2.start(when); o2.stop(when + dur + 0.05)
      return
    }
    if (voice === 'upright') {
      const o1 = c.createOscillator(); o1.type = 'sine'
      o1.frequency.setValueAtTime(freq, when)
      const o2 = c.createOscillator(); o2.type = 'sawtooth'
      o2.frequency.setValueAtTime(freq, when)
      lp.frequency.setValueAtTime(360, when)
      const eo2 = c.createGain(); eo2.gain.value = 0.08
      o2.connect(eo2).connect(lp)
      const e = envGain(state.bus, when, 0.012, dur * 0.4, dur * 0.5, 0.40)
      o1.connect(lp); lp.connect(e)
      o1.start(when); o1.stop(when + dur + 0.05)
      o2.start(when); o2.stop(when + dur + 0.05)
      return
    }
    if (voice === 'tuba') {
      // Tuba — fat low fundamental + mild buzzy second harmonic, slow
      // attack so each "oom" reads as a brass blat rather than a thud.
      const o1 = c.createOscillator(); o1.type = 'sine'
      o1.frequency.setValueAtTime(freq, when)
      const o2 = c.createOscillator(); o2.type = 'triangle'
      o2.frequency.setValueAtTime(freq * 2, when)
      const buzz = c.createGain(); buzz.gain.value = 0.18
      o2.connect(buzz)
      lp.frequency.setValueAtTime(380, when)
      lp.frequency.exponentialRampToValueAtTime(280, when + dur)
      const e = envGain(state.bus, when, 0.018, Math.min(dur * 0.4, 0.18), dur * 0.5, 0.55)
      o1.connect(lp); buzz.connect(lp); lp.connect(e)
      o1.start(when); o1.stop(when + dur + 0.05)
      o2.start(when); o2.stop(when + dur + 0.05)
      return
    }
    // 'rounded' (default)
    const o1 = c.createOscillator(); o1.type = 'triangle'
    o1.frequency.setValueAtTime(freq, when)
    const o2 = c.createOscillator(); o2.type = 'sine'
    o2.frequency.setValueAtTime(freq, when); o2.detune.setValueAtTime(-7, when)
    const e = envGain(state.bus, when, 0.005, dur * 0.5, dur * 0.5, peak)
    o1.connect(lp); o2.connect(lp); lp.connect(e)
    o1.start(when); o1.stop(when + dur + 0.05)
    o2.start(when); o2.stop(when + dur + 0.05)
  }

  // ----------------------------------------------------------------
  // Pad voices (verbatim from beatstar)
  // ----------------------------------------------------------------
  function padChord(chord, when, dur, voice, intensity) {
    if (intensity <= 0) return
    const c = ctx()
    const peak = 0.18 * intensity

    if (voice === 'arp') {
      const notes = [chord.root * 2, chord.third * 2, chord.fifth * 2, chord.root * 4]
      const stepDur = dur / Math.max(8, notes.length * 2)
      const N = Math.floor(dur / stepDur)
      for (let i = 0; i < N; i++) {
        const f = notes[i % notes.length]
        const t = when + i * stepDur
        const o = c.createOscillator(); o.type = 'square'
        o.frequency.setValueAtTime(f, t)
        const e = envGain(state.bus, t, 0.002, 0.005, stepDur * 0.7, peak * 0.6)
        o.connect(e); o.start(t); o.stop(t + stepDur)
      }
      return
    }

    const voices = [chord.root * 2, chord.third * 2, chord.fifth * 2]
    if (chord.seventh) voices.push(chord.seventh * 2)

    let lpStart = 900, lpMid = 1400, oscType = 'sine', second = 'triangle'
    let aFrac = 0.10, hFrac = 0.50, rFrac = 0.40
    if (voice === 'saw')        { lpStart = 1100; lpMid = 2200; oscType = 'sawtooth'; second = 'sawtooth'; aFrac = 0.04; hFrac = 0.65; rFrac = 0.30 }
    else if (voice === 'organ') { lpStart = 1400; lpMid = 2200; oscType = 'square';   second = 'square';   aFrac = 0.03; hFrac = 0.70; rFrac = 0.25 }
    else if (voice === 'rhodes'){ lpStart = 800;  lpMid = 1500; oscType = 'sine';     second = 'triangle'; aFrac = 0.06; hFrac = 0.55; rFrac = 0.38 }
    else if (voice === 'soft')  { lpStart = 700;  lpMid = 1100; oscType = 'sine';     second = 'sine';     aFrac = 0.18; hFrac = 0.40; rFrac = 0.42 }
    else if (voice === 'strings'){lpStart = 600;  lpMid = 1800; oscType = 'sawtooth'; second = 'triangle'; aFrac = 0.20; hFrac = 0.35; rFrac = 0.43 }

    const lp = c.createBiquadFilter(); lp.type = 'lowpass'
    lp.frequency.setValueAtTime(lpStart, when)
    lp.frequency.linearRampToValueAtTime(lpMid, when + dur * 0.5)
    lp.frequency.linearRampToValueAtTime(lpStart, when + dur)

    const attack = Math.min(dur * aFrac, 0.08)
    const e = envGain(state.bus, when, attack, dur * hFrac, dur * rFrac, peak)
    lp.connect(e)
    voices.forEach((f, i) => {
      const o = c.createOscillator(); o.type = i === 0 ? oscType : second
      o.frequency.setValueAtTime(f, when)
      o.detune.setValueAtTime(i * 3 - 4, when)
      o.connect(lp)
      o.start(when); o.stop(when + dur + 0.1)
    })
  }

  // ----------------------------------------------------------------
  // Lead voice — *new for this game*. A staccato sine/square pluck
  // playing chord-tone phrases on a per-step plan. Tuned a touch under
  // the digit-pip volume so each typed digit still pops on top.
  // ----------------------------------------------------------------
  function leadNote(freq, when, dur, voice) {
    const c = ctx()
    const peak = 0.16

    // ---- Accordion: detuned twin squares + slow tremolo ----
    if (voice === 'accordion') {
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'
      lp.frequency.setValueAtTime(2200, when)
      const o1 = c.createOscillator(); o1.type = 'square'
      o1.frequency.setValueAtTime(freq, when); o1.detune.setValueAtTime(-8, when)
      const o2 = c.createOscillator(); o2.type = 'square'
      o2.frequency.setValueAtTime(freq, when); o2.detune.setValueAtTime(+8, when)
      // Tremolo — small LFO modulates a separate gain stage.
      const trem = c.createGain(); trem.gain.value = 0.85
      const lfo = c.createOscillator(); lfo.type = 'sine'
      lfo.frequency.setValueAtTime(5.5, when)
      const lfoGain = c.createGain(); lfoGain.gain.value = 0.15
      lfo.connect(lfoGain).connect(trem.gain)
      const attack = Math.min(dur * 0.15, 0.04)
      const release = dur * 0.55
      const e = envGain(state.bus, when, attack, dur * 0.25, release, peak * 1.05)
      o1.connect(lp); o2.connect(lp); lp.connect(trem).connect(e)
      o1.start(when); o1.stop(when + dur + 0.05)
      o2.start(when); o2.stop(when + dur + 0.05)
      lfo.start(when); lfo.stop(when + dur + 0.1)
      return
    }
    // ---- Toy piano: high sine + filtered noise click + brief 3rd harmonic ----
    if (voice === 'toyPiano') {
      const o = c.createOscillator(); o.type = 'sine'
      o.frequency.setValueAtTime(freq * 2, when)
      const o3 = c.createOscillator(); o3.type = 'sine'
      o3.frequency.setValueAtTime(freq * 6, when)
      const e = envGain(state.bus, when, 0.002, 0.008, dur * 0.55, peak * 0.95)
      const e3 = envGain(state.bus, when, 0.001, 0.005, dur * 0.20, peak * 0.30)
      o.connect(e); o3.connect(e3)
      o.start(when); o.stop(when + dur + 0.05)
      o3.start(when); o3.stop(when + dur + 0.05)
      // Click — bandpassed noise burst at attack
      const src = c.createBufferSource(); src.buffer = noiseBuffer(0.012)
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'
      bp.frequency.setValueAtTime(freq * 4, when); bp.Q.value = 6
      const eC = envGain(state.bus, when, 0.0005, 0.001, 0.012, peak * 0.18)
      src.connect(bp).connect(eC)
      src.start(when); src.stop(when + 0.02)
      return
    }
    // ---- Drone: very soft sine + slow LP sweep ----
    if (voice === 'drone') {
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'
      lp.frequency.setValueAtTime(900, when)
      lp.frequency.linearRampToValueAtTime(1500, when + dur)
      const o1 = c.createOscillator(); o1.type = 'sine'
      o1.frequency.setValueAtTime(freq, when)
      const o2 = c.createOscillator(); o2.type = 'sine'
      o2.frequency.setValueAtTime(freq * 2, when); o2.detune.setValueAtTime(+5, when)
      const attack = Math.min(dur * 0.4, 0.20)
      const release = dur * 0.65
      const e = envGain(state.bus, when, attack, dur * 0.20, release, peak * 0.85)
      o1.connect(lp); o2.connect(lp); lp.connect(e)
      o1.start(when); o1.stop(when + dur + 0.05)
      o2.start(when); o2.stop(when + dur + 0.05)
      return
    }
    // ---- Harpsichord: quick-attack sawtooth + bright filter, tiny decay ----
    if (voice === 'harpsichord') {
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'
      lp.frequency.setValueAtTime(3200, when)
      lp.frequency.exponentialRampToValueAtTime(1400, when + dur * 0.6)
      const o1 = c.createOscillator(); o1.type = 'sawtooth'
      o1.frequency.setValueAtTime(freq, when)
      const o2 = c.createOscillator(); o2.type = 'sawtooth'
      o2.frequency.setValueAtTime(freq * 2, when); o2.detune.setValueAtTime(+6, when)
      const eO2 = c.createGain(); eO2.gain.value = 0.35
      o2.connect(eO2)
      const e = envGain(state.bus, when, 0.001, 0.005, dur * 0.45, peak * 0.95)
      o1.connect(lp); eO2.connect(lp); lp.connect(e)
      o1.start(when); o1.stop(when + dur + 0.05)
      o2.start(when); o2.stop(when + dur + 0.05)
      return
    }

    // ---- Built-in beatstar voices: bell / square / pluck / mellow ----
    let oscType = 'sine', secondType = null, lpF = 2400, releaseFrac = 0.7
    if (voice === 'square')      { oscType = 'square'; lpF = 1800; releaseFrac = 0.55 }
    else if (voice === 'pluck')  { oscType = 'triangle'; lpF = 2400; releaseFrac = 0.6 }
    else if (voice === 'mellow') { oscType = 'sine'; secondType = 'sine'; lpF = 1500; releaseFrac = 0.8 }
    // 'bell' default
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'
    lp.frequency.setValueAtTime(lpF, when)
    const o = c.createOscillator(); o.type = oscType
    o.frequency.setValueAtTime(freq, when)
    const attack = 0.005
    const hold = Math.min(dur * 0.15, 0.04)
    const release = dur * releaseFrac
    const e = envGain(state.bus, when, attack, hold, release, peak)
    o.connect(lp).connect(e)
    o.start(when); o.stop(when + dur + 0.05)
    if (secondType) {
      const o2 = c.createOscillator(); o2.type = secondType
      o2.frequency.setValueAtTime(freq * 2, when)
      const e2 = envGain(state.bus, when, attack, hold, release * 0.5, peak * 0.35)
      o2.connect(lp); o2.connect(e2)
      o2.start(when); o2.stop(when + dur + 0.05)
    }
  }

  // Pick a chord-tone phrase for the upcoming measure. Returns a sparse
  // map step-in-measure → freq (in Hz). The voicing octave depends on
  // the style's leadShape and leadOctaveBias.
  //
  // The shape parameter is `style.leadShape` (see styles.js for the list);
  // each shape is a small generator with its own rhythmic / melodic
  // personality. A measureIndex variation keeps the phrase from looping
  // identically every bar.
  function generateLeadPhrase(chord, meter, measureIndex, style) {
    const phrase = {}
    const shape = (style && style.leadShape) || 'classic'
    const octBias = (style && style.leadOctaveBias) || 0
    const octMul = Math.pow(2, octBias)
    // Octave-up tones so the lead sits above the bass and pad.
    const root = chord.root * 2 * octMul
    const third = chord.third * 2 * octMul
    const fifth = chord.fifth * 2 * octMul
    const seventh = chord.seventh ? chord.seventh * 2 * octMul : null
    const rootHi = chord.root * 4 * octMul
    const tones = [root, third, fifth]
    if (seventh) tones.push(seventh)
    tones.push(rootHi)
    const stepsPerMeasure = meter * STEPS_PER_BEAT
    const variant = measureIndex % 4

    // ---- helpers ----
    const setStep = (s, f) => { if (s >= 0 && s < stepsPerMeasure && f) phrase[s] = f }

    if (shape === 'octaveBounce') {
      // Circus oompah lead — bouncy octave skips on every beat. Big-top
      // feel: low chord-tone on the down, high chord-tone on the up.
      for (let b = 0; b < meter; b++) {
        const lowIdx = (b + variant) % tones.length
        const hiIdx = (lowIdx + 2) % tones.length
        setStep(b * STEPS_PER_BEAT, tones[lowIdx])
        setStep(b * STEPS_PER_BEAT + 2, tones[hiIdx] * 2)  // octave-up off-beat
      }
      return phrase
    }

    if (shape === 'chromaticRun') {
      // Cartoon-chase — fast 16th chromatic runs on beats 3 and 4.
      // Beats 1+2 are chord tones, then a chromatic ascending or
      // descending run of 4-6 16ths.
      setStep(0, root)
      setStep(STEPS_PER_BEAT, third)
      const runStart = 2 * STEPS_PER_BEAT
      const dirUp = (variant % 2) === 0
      const runBase = dirUp ? root : root * 2
      // 8 chromatic 16th-notes climbing/descending across beats 3+4
      for (let i = 0; i < 8 && (runStart + i) < stepsPerMeasure; i++) {
        const semi = dirUp ? i : -i
        setStep(runStart + i, runBase * Math.pow(2, semi / 12))
      }
      return phrase
    }

    if (shape === 'klezmerOrnament') {
      // Klezmer — chord tones with a grace-note neighbour-tone approach
      // a half-step below on the 16th right before each beat.
      for (let b = 0; b < meter; b++) {
        const target = tones[(b + variant) % tones.length]
        setStep(b * STEPS_PER_BEAT, target)
        // grace note on the 16th before the next beat (= step -1 of next)
        if (b > 0) setStep(b * STEPS_PER_BEAT - 1, target * Math.pow(2, -1 / 12))
        // off-beat ornament: 6th above
        setStep(b * STEPS_PER_BEAT + 2, target * Math.pow(2, 9 / 12))
      }
      return phrase
    }

    if (shape === 'musicBoxArp') {
      // Music-box — sparse twinkling arpeggio, one note every two beats
      // (or every beat in 3/4) at high register.
      const stride = meter >= 4 ? 2 : 1
      for (let b = 0; b < meter; b += stride) {
        const idx = (b + variant) % tones.length
        setStep(b * STEPS_PER_BEAT, tones[idx] * 2)
      }
      // Tiny grace tone on beat-2's 'and' on alternate measures
      if (variant % 2 === 1 && meter >= 3) {
        setStep(STEPS_PER_BEAT + 2, fifth * 2)
      }
      return phrase
    }

    if (shape === 'reichPhasing') {
      // Minimal pulse — repeat one note per 16th, with a pitch-class drift
      // every 4 16ths (beat). The drift cycles through chord tones across
      // the measure. Reich-style "hocketing" by ducking every 5th step.
      const baseTone = tones[variant % tones.length]
      for (let s = 0; s < stepsPerMeasure; s++) {
        // Every 4th 16th the tone changes to next chord tone.
        const beatIdx = Math.floor(s / 2)
        const t = tones[(beatIdx + variant) % tones.length]
        // Subtle phasing — drop every 5th step for breathing
        if (s % 5 === 4) continue
        // Lead pulses on every 8th
        if (s % 2 === 0) setStep(s, t)
      }
      // Suppress unused var warning
      void baseTone
      return phrase
    }

    if (shape === 'rootDrone') {
      // Drone — single sustained root tone, restruck once per measure.
      // Optionally a fifth on the half-measure for a tiny inflection.
      setStep(0, root)
      if (meter >= 4 && variant % 2 === 0) {
        setStep(Math.floor(meter / 2) * STEPS_PER_BEAT, fifth)
      }
      return phrase
    }

    if (shape === 'clockTick') {
      // Clockwork — tight 16th-note pulse on a single tone, with a tiny
      // pitch-class shift on beat 1 of alternate measures. Mechanical.
      const tic = (variant % 2 === 0) ? root : fifth
      for (let s = 0; s < stepsPerMeasure; s++) {
        setStep(s, tic)
      }
      // Accent the downbeat with a higher pitch
      setStep(0, tic * 2)
      return phrase
    }

    if (shape === 'baroqueRun') {
      // Baroque — continuous 8th-note line, mostly stepwise with occasional
      // chord-tone leaps. Walks up the chord then down.
      const dirUp = (variant % 2) === 0
      const seq = dirUp ? [0, 1, 2, 3, 4, 3, 2, 1] : [4, 3, 2, 1, 0, 1, 2, 3]
      let stepIdx = 0
      for (let s = 0; s < stepsPerMeasure; s += 2) {
        const tIdx = seq[stepIdx % seq.length] % tones.length
        setStep(s, tones[tIdx])
        stepIdx++
      }
      return phrase
    }

    if (shape === 'arpUp') {
      // Synthwave — ascending arpeggio across the chord, repeated per
      // measure with a subtle inversion variant.
      for (let b = 0; b < meter; b++) {
        const idx = (b + variant) % tones.length
        setStep(b * STEPS_PER_BEAT, tones[idx])
        setStep(b * STEPS_PER_BEAT + 2, tones[(idx + 1) % tones.length])
      }
      return phrase
    }

    if (shape === 'eighthStab') {
      // House — stab on every off-beat (the "and" of each beat).
      for (let b = 0; b < meter; b++) {
        if (b === 0) setStep(0, root)
        setStep(b * STEPS_PER_BEAT + 2, tones[(b + variant) % tones.length])
      }
      return phrase
    }

    if (shape === 'sixteenthArp') {
      // Chiptune — repeating 16th-note arp on root/3rd/5th/octave.
      const arp = [root, third, fifth, rootHi]
      for (let s = 0; s < stepsPerMeasure; s++) {
        // Every 16th, alternating fast pattern
        if (s % 1 === 0) setStep(s, arp[(s + variant) % arp.length])
      }
      return phrase
    }

    if (shape === 'pentatonic') {
      // Rock — pentatonic riff, one or two notes per beat with a hammer-on
      // on beat 3.
      const pent = [root, third, fifth, rootHi]
      for (let b = 0; b < meter; b++) {
        const idx = (b + variant) % pent.length
        setStep(b * STEPS_PER_BEAT, pent[idx])
        if (b === 2) setStep(b * STEPS_PER_BEAT + 2, pent[(idx + 1) % pent.length])
      }
      return phrase
    }

    if (shape === 'syncoSixteenths') {
      // Funk — syncopated 16th figure: rest on beat-1's 16, hit the
      // "e", "and", "a" of beat 1, then chord tones on beats 2+3+4.
      setStep(1, third)
      setStep(2, fifth)
      setStep(3, root)
      for (let b = 1; b < meter; b++) {
        setStep(b * STEPS_PER_BEAT, tones[(b + variant) % tones.length])
        if ((b + variant) % 2 === 0) setStep(b * STEPS_PER_BEAT + 2, tones[(b + variant + 2) % tones.length])
      }
      return phrase
    }

    if (shape === 'jazzWalk') {
      // Late-night jazz — chromatic-approach chord-tone walk, 8th feel.
      for (let b = 0; b < meter; b++) {
        const idx = (b + variant) % tones.length
        setStep(b * STEPS_PER_BEAT, tones[idx])
        // Chromatic approach to next beat's tone
        if (b < meter - 1) {
          const next = tones[(b + 1 + variant) % tones.length]
          setStep(b * STEPS_PER_BEAT + 2, next * Math.pow(2, -1 / 12))
        }
      }
      return phrase
    }

    if (shape === 'sparse') {
      // Ambient — one note per measure, on beat 1 only. Float.
      setStep(0, tones[variant % tones.length])
      if (meter >= 4 && variant % 2 === 1) {
        setStep((meter - 1) * STEPS_PER_BEAT, tones[(variant + 2) % tones.length])
      }
      return phrase
    }

    if (shape === 'montuno') {
      // Latin — 2-3 montuno feel: hits on 1, 2-and, 3, 4-and.
      setStep(0, root)
      setStep(STEPS_PER_BEAT + 2, third)
      setStep(2 * STEPS_PER_BEAT, fifth)
      if (meter >= 4) setStep(3 * STEPS_PER_BEAT + 2, tones[(variant + 1) % tones.length])
      return phrase
    }

    if (shape === 'discoUp') {
      // Disco — quarter-note ascending stabs hitting an octave on beat 4.
      for (let b = 0; b < meter; b++) {
        const idx = b % tones.length
        setStep(b * STEPS_PER_BEAT, tones[idx])
      }
      // Octave hit on the last beat
      setStep((meter - 1) * STEPS_PER_BEAT + 2, rootHi)
      return phrase
    }

    if (shape === 'waltz') {
      // 3/4 waltz — long note on 1, two passing tones on 2-and-3.
      setStep(0, tones[variant % tones.length])
      setStep(STEPS_PER_BEAT, third)
      setStep(2 * STEPS_PER_BEAT, fifth)
      return phrase
    }

    // 'classic' fallback — beatstar's original pattern, kept for
    // backward compatibility / styles that don't declare a leadShape.
    for (let b = 0; b < meter; b++) {
      const t0 = b * STEPS_PER_BEAT
      const idx = variant === 0 ? (b % tones.length)
                : variant === 1 ? ((b * 2 + 1) % tones.length)
                : variant === 2 ? ((meter - b) % tones.length)
                : ((b * 3) % tones.length)
      setStep(t0, tones[idx])
      const t1 = b * STEPS_PER_BEAT + 2
      const skipOff = (variant === 2 && b === meter - 1) || (variant === 3 && b === 0)
      if (!skipOff) {
        const offIdx = (idx + 2) % tones.length
        setStep(t1, tones[offIdx])
      }
    }
    return phrase
  }

  // ----------------------------------------------------------------
  // Drum pattern generator (verbatim from beatstar)
  // ----------------------------------------------------------------
  function drumPlan(kit, meter) {
    const N = meter * 4
    const k = new Array(N).fill(0)
    const s = new Array(N).fill(0)
    const h = new Array(N).fill(0)
    const backbeat = Math.floor(meter / 2)

    if (kit === 'fourFloor') {
      for (let b = 0; b < meter; b++) k[b * 4] = 1
      s[backbeat * 4] = 1
      for (let b = 0; b < meter; b++) h[b * 4 + 2] = 1
    } else if (kit === 'electro') {
      k[0] = 1
      if (meter >= 4) k[(meter - 2) * 4 + 2] = 1
      s[backbeat * 4] = 1
      for (let i = 0; i < N; i += 2) h[i] = 1
    } else if (kit === 'rock') {
      k[0] = 1
      if (meter >= 4) k[backbeat * 4] = 1
      for (let b = 1; b < meter; b += 2) s[b * 4] = 1
      for (let i = 0; i < N; i += 2) h[i] = 1
    } else if (kit === 'chip') {
      k[0] = 1
      if (meter >= 3) k[backbeat * 4] = 1
      s[backbeat * 4] = 0.5
    } else if (kit === 'brush') {
      k[0] = 1
      s[backbeat * 4] = 0.5
      for (let b = 0; b < meter; b++) h[b * 4 + 2] = 1
    } else if (kit === 'bossa') {
      k[0] = 1
      if (meter >= 4) k[6] = 1
      s[(meter - 1) * 4] = 0.5
      for (let i = 0; i < N; i += 2) h[i] = 1
    } else if (kit === 'funk') {
      k[0] = 1
      if (meter >= 3) k[6] = 1
      if (meter >= 4) k[10] = 1
      s[backbeat * 4] = 1
      s[2] = 0.5
      if (meter >= 4) s[(backbeat + 1) * 4 + 2] = 0.5
      for (let i = 0; i < N; i++) h[i] = (i % 4 === 0) ? 1 : 0.6
    } else if (kit === 'jazz') {
      for (let b = 0; b < meter; b++) k[b * 4] = (b === 0) ? 1 : 0.5
      for (let b = 0; b < meter; b += 2) {
        if (b > 0) s[b * 4] = 0.5
      }
      for (let b = 0; b < meter; b++) {
        h[b * 4] = 1
        if (b === backbeat || b === meter - 1) h[b * 4 + 2] = 1
      }
    } else if (kit === 'latin') {
      k[0] = 1
      if (meter >= 4) k[6] = 1
      s[0] = 0.5
      if (meter >= 4) s[6] = 0.5
      if (meter >= 4) s[12] = 0.5
      if (meter >= 2) s[16 % N] = 0.5
      if (meter >= 3) s[24 % N] = 0.5
      for (let i = 0; i < N; i += 2) h[i] = (i % 4 === 0) ? 1 : 0.6
    } else if (kit === 'disco') {
      for (let b = 0; b < meter; b++) k[b * 4] = 1
      s[backbeat * 4] = 1
      if (meter >= 4) s[(meter - 1) * 4] = 1
      for (let b = 0; b < meter; b++) h[b * 4 + 2] = 1
    } else if (kit === 'ambient') {
      k[0] = 0.6
      h[0] = 0.4
      if (meter >= 4) h[(meter - 1) * 4 + 2] = 0.3
    } else if (kit === 'oompah') {
      // Big-top oompah — kick on every beat ("oom"), snare on every
      // off-beat 8th ("pah"). Crash-flavoured hat on beat 1.
      for (let b = 0; b < meter; b++) {
        k[b * 4] = 1
        s[b * 4 + 2] = 0.7
      }
      h[0] = 1
      if (meter >= 4) h[backbeat * 4] = 0.6
    } else if (kit === 'cartoon') {
      // Woodblock chase — woodblock on every 8th, kick on 1+3,
      // accent ticks scattered.
      k[0] = 1
      if (meter >= 3) k[backbeat * 4] = 1
      for (let i = 0; i < N; i += 2) s[i] = (i % 4 === 0) ? 0.5 : 0.7
      for (let i = 0; i < N; i += 2) h[i] = 0.6
    } else if (kit === 'klezmer') {
      // Freylekh feel — kick on 1+3, tom-snare backbeat, hat on every 8th.
      k[0] = 1
      if (meter >= 4) k[backbeat * 4] = 1
      if (meter >= 4) {
        s[backbeat * 4] = 0.6
        s[(meter - 1) * 4 + 2] = 0.5
      } else {
        s[(meter - 1) * 4] = 0.6
      }
      for (let i = 0; i < N; i += 2) h[i] = (i % 4 === 0) ? 1 : 0.6
    } else if (kit === 'musicBox') {
      // Almost-silent — barely-audible tap on beat 1.
      k[0] = 0.4
    } else if (kit === 'minimal') {
      // Sparse 16th tick on every beat (woody pulse), no snare, no hat.
      for (let b = 0; b < meter; b++) k[b * 4] = (b === 0) ? 0.7 : 0.5
    } else if (kit === 'drone') {
      // One ultra-soft thud on the downbeat.
      k[0] = 0.5
    } else if (kit === 'clock') {
      // Clockwork — tick on every 8th, "tock" on the backbeat.
      for (let i = 0; i < N; i += 2) h[i] = 0.5
      if (meter >= 2) s[backbeat * 4] = 0.6
    } else if (kit === 'baroqueNone') {
      // No drums in baroque — counterpoint carries the rhythm.
    }
    return {k, s, h}
  }

  // ----------------------------------------------------------------
  // Scheduler
  // ----------------------------------------------------------------
  function scheduleStep(stepIndex, when) {
    const style = state.style
    if (!style) return
    const meter = state.meter
    const stepsPerMeasure = meter * STEPS_PER_BEAT
    const stepInMeasure = stepIndex % stepsPerMeasure
    const measureIndex = Math.floor(stepIndex / stepsPerMeasure)

    const inBridge = state.bridgeChords && measureIndex === 0
    const beatInMeasure = stepInMeasure / STEPS_PER_BEAT
    const halfPoint = Math.max(1, Math.floor(meter / 2))
    const effectiveStyle = inBridge && state.bridgeStyle && beatInMeasure < halfPoint
      ? state.bridgeStyle
      : style

    const chordDesc = inBridge
      ? state.bridgeChords[Math.floor(beatInMeasure) % state.bridgeChords.length]
      : state.progression[(measureIndex - (state.bridgeChords ? 1 : 0)) % state.progression.length]
    const chord = content.theory.expand(chordDesc, state.tonality)
    const beatDur = 60 / state.bpm
    const measureDur = beatDur * meter

    const plan = drumPlan(effectiveStyle.drumKit, meter)
    if (plan.k[stepInMeasure])  drumKick(when, effectiveStyle.drumKit)
    if (plan.s[stepInMeasure])  drumSnare(when, effectiveStyle.drumKit, plan.s[stepInMeasure] < 1)
    if (plan.h[stepInMeasure])  drumHat(when, effectiveStyle.drumKit, stepInMeasure === 0)

    // Bass scheduling — each style picks a pattern, falling back to
    // legacy voice-driven alternation for the inherited beatstar voices.
    const pattern = effectiveStyle.bassPattern || (
      effectiveStyle.bassVoice === 'upright'  ? 'walking' :
      effectiveStyle.bassVoice === 'driving'  ? 'rootFifthHalf' :
      'downbeat'
    )
    if (pattern === 'eighths') {
      // Bass on every 8th — driving rock feel.
      if (stepInMeasure % 2 === 0) {
        const beat = stepInMeasure / STEPS_PER_BEAT
        const wholeBeat = (stepInMeasure % STEPS_PER_BEAT) === 0
        const f = wholeBeat ? chord.root : chord.fifth
        bassNote(f, when, beatDur * 0.45, effectiveStyle.bassVoice)
        void beat
      }
    } else if (stepInMeasure % STEPS_PER_BEAT === 0) {
      let freq = chord.root
      if (pattern === 'walking') {
        // Quarter-note walk — root on 1, third on 2, fifth on 3, third
        // on 4 (a clichéd-but-recognisable jazz walk).
        if      (beatInMeasure === 0) freq = chord.root
        else if (beatInMeasure === 1) freq = chord.third
        else if (beatInMeasure === 2) freq = chord.fifth
        else                          freq = chord.third
      } else if (pattern === 'rootFifth') {
        // Klezmer / baroque — root, fifth, root, fifth on every beat.
        freq = (beatInMeasure % 2 === 1) ? chord.fifth : chord.root
      } else if (pattern === 'rootFifthHalf') {
        // Driving rock — root on 1+3, fifth on 2+4 (legacy 'driving' voice).
        freq = (beatInMeasure % 2 === 1) ? chord.fifth : chord.root
      } else if (pattern === 'oompah') {
        // Circus — root on 1, fifth on 2, root on 3, fifth on 4 (low-high
        // alternation read by the brain as "oom-pah-oom-pah"). Drop an
        // octave on the down-beat for the canonical tuba boom.
        const isDown = (beatInMeasure % 2 === 0)
        freq = isDown ? chord.root / 2 : chord.fifth
      } else if (pattern === 'pulse') {
        // Single root tone every beat — no alternation. Used by minimal,
        // drone, music-box.
        freq = chord.root
      } else {
        // 'downbeat' — root on every beat.
        freq = chord.root
      }
      bassNote(freq, when, beatDur * 0.95, effectiveStyle.bassVoice)
    }

    if (stepInMeasure === 0 && !inBridge) {
      padChord(chord, when, measureDur * 0.97, effectiveStyle.padVoice, effectiveStyle.pad || 0)
    }

    // Lead — only when active (gameplay is in solve phase) and not
    // during the bridge measure (mid-measure key/style changes would
    // smear the melody). Regenerate the phrase at every measure
    // boundary using the current chord.
    if (state.leadActive && !inBridge) {
      if (stepInMeasure === 0 || state.leadPhraseMeasureIndex !== measureIndex) {
        state.leadPhrase = generateLeadPhrase(chord, meter, measureIndex, effectiveStyle)
        state.leadPhraseMeasureIndex = measureIndex
      }
      const freq = state.leadPhrase ? state.leadPhrase[stepInMeasure] : null
      if (freq) {
        const isOnBeat = (stepInMeasure % STEPS_PER_BEAT === 0)
        // Per-shape duration — drone holds for the whole beat; sparse
        // shapes ring out longer; rapid 16th shapes get shorter pips.
        const shape = effectiveStyle.leadShape
        let dur
        if (shape === 'rootDrone' || shape === 'sparse') {
          dur = beatDur * (isOnBeat ? 3.0 : 1.5)
        } else if (shape === 'sixteenthArp' || shape === 'clockTick' ||
                   shape === 'reichPhasing' || shape === 'chromaticRun') {
          dur = beatDur * 0.20
        } else if (shape === 'baroqueRun') {
          dur = beatDur * 0.45
        } else if (shape === 'musicBoxArp') {
          dur = beatDur * 1.40
        } else {
          dur = isOnBeat ? beatDur * 0.85 : beatDur * 0.45
        }
        leadNote(freq, when, dur, effectiveStyle.leadVoice)
      }
    }
  }

  function tick() {
    if (!state.running) return
    try {
      const c = ctx()
      const ahead = c.currentTime + LOOKAHEAD_S
      const stepDur = (60 / state.bpm) / STEPS_PER_BEAT
      while (state.nextStepTime < ahead) {
        scheduleStep(state.stepIndex, state.nextStepTime)
        state.stepIndex++
        state.nextStepTime += stepDur
      }
    } catch (e) {
      console.error(e)
    }
  }

  function start(opts) {
    if (state.running) return
    if (opts) {
      if (opts.bpm)          state.bpm = opts.bpm
      if (opts.style)        state.style = opts.style
      if (opts.meter)        state.meter = opts.meter
      if (opts.progression)  state.progression = opts.progression.slice()
      if (opts.tonality)     state.tonality = {...opts.tonality}
    }
    if (!state.style) state.style = content.styles.get('lounge')
    state.stepIndex = 0
    const c = ctx()
    state.nextStepTime = c.currentTime + 0.1
    ensureBus()
    const t = c.currentTime
    state.bus.gain.cancelScheduledValues(t)
    state.bus.gain.setValueAtTime(0, t)
    state.bus.gain.linearRampToValueAtTime(BUS_GAIN, t + 0.2)
    state.running = true
    if (!state.frameSubbed) {
      engine.loop.on('frame', tick)
      state.frameSubbed = true
    }
  }

  function stop() {
    if (!state.running) return
    state.running = false
    state.leadActive = false
    state.leadPhrase = null
    if (!state.bus) return
    const t = ctx().currentTime
    const bus = state.bus
    bus.gain.cancelScheduledValues(t)
    bus.gain.setValueAtTime(bus.gain.value, t)
    bus.gain.linearRampToValueAtTime(0, t + 0.4)
    state.bus = null
    setTimeout(() => { try { bus.disconnect() } catch (_) {} }, 700)
  }

  function setBpm(bpm) { state.bpm = bpm }

  function setLeadActive(active) {
    state.leadActive = !!active
    if (!active) {
      state.leadPhrase = null
      state.leadPhraseMeasureIndex = -1
    }
  }

  // Briefly duck the music bus so a fail buzzer + announcer reading
  // sit cleanly above the backing track. The bus drops near-silent for
  // `durationS`, then ramps back up. Independent of start/stop fades —
  // do not call cancelScheduledValues during a start/stop ramp.
  function duck(durationS) {
    if (!state.bus) return
    const c = ctx()
    const t = c.currentTime
    const dur = Math.max(0.1, durationS || 0.6)
    const cur = state.bus.gain.value
    state.bus.gain.cancelScheduledValues(t)
    state.bus.gain.setValueAtTime(cur, t)
    state.bus.gain.linearRampToValueAtTime(0.0001, t + 0.06)
    state.bus.gain.setValueAtTime(0.0001, t + dur)
    state.bus.gain.linearRampToValueAtTime(BUS_GAIN, t + dur + 0.18)
  }

  function unduck(rampS) {
    if (!state.bus) return
    const c = ctx()
    const t = c.currentTime
    state.bus.gain.cancelScheduledValues(t)
    state.bus.gain.setValueAtTime(state.bus.gain.value, t)
    state.bus.gain.linearRampToValueAtTime(BUS_GAIN, t + (rampS || 0.18))
  }

  function configure(opts) {
    if (!opts) return
    if (opts.bpm)          state.bpm = opts.bpm
    if (opts.style)        state.style = opts.style
    if (opts.meter)        state.meter = opts.meter
    if (opts.progression)  state.progression = opts.progression.slice()
    if (opts.tonality)     state.tonality = {...opts.tonality}
    state.bridgeChords = opts.bridgeChords ? opts.bridgeChords.slice() : null
    state.bridgeStyle  = opts.bridgeStyle || null
    if (opts.alignAt != null) {
      state.stepIndex = 0
      state.nextStepTime = opts.alignAt
    }
  }

  function nextDownbeat() {
    const stepDur = (60 / state.bpm) / STEPS_PER_BEAT
    const stepsPerMeasure = state.meter * STEPS_PER_BEAT
    const cur = state.stepIndex % stepsPerMeasure
    const stepsLeft = cur === 0 ? 0 : stepsPerMeasure - cur
    return state.nextStepTime + stepsLeft * stepDur
  }

  return {
    start, stop, configure, setBpm, setLeadActive,
    duck, unduck,
    nextDownbeat,
    bpm:      () => state.bpm,
    meter:    () => state.meter,
    style:    () => state.style,
    tonality: () => ({...state.tonality}),
    progression: () => state.progression.slice(),
  }
})()
