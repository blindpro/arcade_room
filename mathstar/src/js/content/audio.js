// Audio cues for the math game.
//
// Listener mode: stereo / non-spatial. Every cue routes through a per-cue
// StereoPanner (mostly centred). No engine.position, no binaural ear.
//
// Reuses beatstar's lead-voice timbres (bell / square / pluck / mellow)
// for the digit pips and for the operation-announce flourish, so the
// math game's UI cues stay in the same sonic family as the backing
// music. Style changes (set via setLeadVoice) cascade through every
// cue automatically.
//
// Tonality (rootSemitone + mode) is set per level by content.game's
// configure() — digit pips are scale-aware, so 0–9 sound like an
// ascending phrase IN the active key, not random tones.
//
// Public surface used by content.game and the screens:
//   setLeadVoice(id)             - 'bell' | 'square' | 'pluck' | 'mellow'
//   setTonality({rootSemitone, mode})
//   countIn(beats, when)         - one click per beat for the level intro
//   opCue(operator, when)        - 2-note motif identifying +,-,×,÷
//   digit(d, when)               - 0..9, scale-degree pip
//   correct(when)                - rising arpeggio on op cleared
//   fail(when)                   - dissonant blip on wrong digit / timeout
//   levelUp(when)                - longer fanfare on level clear
//   gameOver(when)               - descending dirge
//   now()                        - audioContext.currentTime
content.audio = (() => {
  const A4 = 440
  // Twelve-tone equal temperament. Returns the Hz of a note `semitones`
  // above C4 (MIDI 60).
  function midiHz(midi) { return A4 * Math.pow(2, (midi - 69) / 12) }
  function noteHz(rootSemitone, scaleDegree) {
    // scaleDegree is 0-based degree within the active scale.
    const scale = state.scale
    const octaves = Math.floor(scaleDegree / scale.length)
    const idx = ((scaleDegree % scale.length) + scale.length) % scale.length
    const semis = scale[idx] + octaves * 12 + rootSemitone
    return midiHz(60 + semis)
  }

  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
  }

  const state = {
    leadVoice: 'bell',
    rootSemitone: 0,
    mode: 'major',
    scale: SCALES.major,
  }

  const ctx  = () => engine.context()
  const dest = () => engine.mixer.input()
  const now  = () => ctx().currentTime

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

  function playAt(pan, gain, build, when) {
    const c = ctx()
    const t0 = when != null ? when : c.currentTime
    const post = c.createGain()
    post.gain.value = gain != null ? gain : 1
    const p = c.createStereoPanner()
    p.pan.setValueAtTime(pan, t0)
    post.connect(p).connect(dest())
    const ttl = build(post, t0) || 1
    const leadIn = Math.max(0, t0 - c.currentTime)
    setTimeout(() => {
      try { post.disconnect() } catch (_) {}
      try { p.disconnect() } catch (_) {}
    }, (leadIn + ttl + 0.1) * 1000)
  }

  // ---- voice timbres (shared with leadNote in music.js but tuned for
  // short staccato pips, not melodic phrases) ----

  function voiceBell(out, t0, freq, peak) {
    const c = ctx()
    const o1 = c.createOscillator(); o1.type = 'sine'
    o1.frequency.setValueAtTime(freq, t0)
    const e1 = envGain(out, t0, 0.004, 0.01, 0.5, peak)
    o1.connect(e1); o1.start(t0); o1.stop(t0 + 0.6)
    const o2 = c.createOscillator(); o2.type = 'sine'
    o2.frequency.setValueAtTime(freq * 3, t0)
    const e2 = envGain(out, t0, 0.003, 0.005, 0.22, peak * 0.35)
    o2.connect(e2); o2.start(t0); o2.stop(t0 + 0.3)
    return 0.7
  }

  function voiceSquare(out, t0, freq, peak) {
    const c = ctx()
    const o1 = c.createOscillator(); o1.type = 'square'
    o1.frequency.setValueAtTime(freq, t0)
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'
    lp.frequency.setValueAtTime(freq * 6, t0)
    lp.frequency.exponentialRampToValueAtTime(freq * 2.5, t0 + 0.22)
    const e1 = envGain(out, t0, 0.002, 0.01, 0.32, peak)
    o1.connect(lp).connect(e1); o1.start(t0); o1.stop(t0 + 0.45)
    return 0.55
  }

  function voicePluck(out, t0, freq, peak) {
    const c = ctx()
    const o = c.createOscillator(); o.type = 'triangle'
    o.frequency.setValueAtTime(freq, t0)
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'
    lp.frequency.setValueAtTime(freq * 8, t0)
    lp.frequency.exponentialRampToValueAtTime(freq * 2, t0 + 0.18)
    const e = envGain(out, t0, 0.002, 0.005, 0.28, peak)
    o.connect(lp).connect(e); o.start(t0); o.stop(t0 + 0.36)
    return 0.45
  }

  function voiceMellow(out, t0, freq, peak) {
    const c = ctx()
    const o = c.createOscillator(); o.type = 'sine'
    o.frequency.setValueAtTime(freq, t0)
    const e = envGain(out, t0, 0.012, 0.05, 0.45, peak)
    o.connect(e); o.start(t0); o.stop(t0 + 0.55)
    return 0.6
  }

  // Accordion-style pip — twin detuned squares with brief tremolo flutter.
  function voiceAccordion(out, t0, freq, peak) {
    const c = ctx()
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'
    lp.frequency.setValueAtTime(2000, t0)
    const o1 = c.createOscillator(); o1.type = 'square'
    o1.frequency.setValueAtTime(freq, t0); o1.detune.setValueAtTime(-9, t0)
    const o2 = c.createOscillator(); o2.type = 'square'
    o2.frequency.setValueAtTime(freq, t0); o2.detune.setValueAtTime(+9, t0)
    const e = envGain(out, t0, 0.005, 0.02, 0.32, peak)
    o1.connect(lp); o2.connect(lp); lp.connect(e)
    o1.start(t0); o1.stop(t0 + 0.45)
    o2.start(t0); o2.stop(t0 + 0.45)
    return 0.5
  }

  // Toy-piano pip — high sine + bandpassed click for the hammer.
  function voiceToyPiano(out, t0, freq, peak) {
    const c = ctx()
    const o = c.createOscillator(); o.type = 'sine'
    o.frequency.setValueAtTime(freq * 2, t0)
    const e = envGain(out, t0, 0.002, 0.008, 0.35, peak)
    o.connect(e); o.start(t0); o.stop(t0 + 0.4)
    // Hammer click
    const src = c.createBufferSource(); src.buffer = (() => {
      const n = Math.max(1, Math.floor(c.sampleRate * 0.012))
      const buf = c.createBuffer(1, n, c.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
      return buf
    })()
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'
    bp.frequency.setValueAtTime(freq * 4, t0); bp.Q.value = 6
    const eC = envGain(out, t0, 0.0005, 0.001, 0.012, peak * 0.25)
    src.connect(bp).connect(eC)
    src.start(t0); src.stop(t0 + 0.02)
    return 0.45
  }

  // Drone pip — soft slow-attack sine.
  function voiceDrone(out, t0, freq, peak) {
    const c = ctx()
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'
    lp.frequency.setValueAtTime(900, t0)
    const o = c.createOscillator(); o.type = 'sine'
    o.frequency.setValueAtTime(freq, t0)
    const e = envGain(out, t0, 0.025, 0.04, 0.55, peak)
    o.connect(lp).connect(e)
    o.start(t0); o.stop(t0 + 0.7)
    return 0.7
  }

  // Harpsichord pip — quick-attack saw + bright filter, baroque feel.
  function voiceHarpsichord(out, t0, freq, peak) {
    const c = ctx()
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'
    lp.frequency.setValueAtTime(3000, t0)
    lp.frequency.exponentialRampToValueAtTime(1200, t0 + 0.18)
    const o = c.createOscillator(); o.type = 'sawtooth'
    o.frequency.setValueAtTime(freq, t0)
    const o2 = c.createOscillator(); o2.type = 'sawtooth'
    o2.frequency.setValueAtTime(freq * 2, t0); o2.detune.setValueAtTime(+6, t0)
    const eO2 = c.createGain(); eO2.gain.value = 0.3
    o2.connect(eO2)
    const e = envGain(out, t0, 0.001, 0.005, 0.25, peak * 0.95)
    o.connect(lp); eO2.connect(lp); lp.connect(e)
    o.start(t0); o.stop(t0 + 0.35)
    o2.start(t0); o2.stop(t0 + 0.35)
    return 0.4
  }

  function pipForLead(out, t0, freq, peak) {
    const v = state.leadVoice
    if (v === 'square')      return voiceSquare(out, t0, freq, peak)
    if (v === 'pluck')       return voicePluck (out, t0, freq, peak)
    if (v === 'mellow')      return voiceMellow(out, t0, freq, peak)
    if (v === 'accordion')   return voiceAccordion(out, t0, freq, peak)
    if (v === 'toyPiano')    return voiceToyPiano(out, t0, freq, peak)
    if (v === 'drone')       return voiceDrone(out, t0, freq, peak)
    if (v === 'harpsichord') return voiceHarpsichord(out, t0, freq, peak)
    return voiceBell(out, t0, freq, peak)
  }

  // ---- public cues ----

  // One-bar count-in clicks. Beat 1 is a higher pitch than the rest so
  // the player can feel "1" of the count.
  function countIn(beats, when, beatDur) {
    const t0 = when != null ? when : now()
    const dur = beatDur || 0.5
    for (let i = 0; i < beats; i++) {
      const t = t0 + i * dur
      const f = (i === 0) ? 1200 : 800
      playAt(0, 0.5, (out, tt) => {
        const c = ctx()
        const o = c.createOscillator(); o.type = 'square'
        o.frequency.setValueAtTime(f, tt)
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'
        lp.frequency.setValueAtTime(2400, tt)
        const e = envGain(out, tt, 0.002, 0.005, 0.05, 0.5)
        o.connect(lp).connect(e); o.start(tt); o.stop(tt + 0.08)
        return 0.1
      }, t)
    }
  }

  // 2-note motif identifying the operator. Plays on the operation-
  // reveal so the player hears (and learns) which operator is active.
  //   '+': root → 5th       (rising P5, asking)
  //   '-': 5th  → root      (descending P5)
  //   '*': root → octave    (energetic leap)
  //   '/': octave → 5th     (descending splitting motion)
  function opCue(operator, when) {
    const t0 = when != null ? when : now()
    const r = state.rootSemitone
    const root = midiHz(60 + r)
    const fifth = midiHz(60 + r + 7)
    const oct = midiHz(60 + r + 12)
    let n1, n2
    if (operator === '+')      { n1 = root;  n2 = fifth }
    else if (operator === '-') { n1 = fifth; n2 = root }
    else if (operator === '*') { n1 = root;  n2 = oct }
    else if (operator === '/') { n1 = oct;   n2 = fifth }
    else { n1 = root; n2 = fifth }
    playAt(-0.20, 0.9, (out, t) => { pipForLead(out, t, n1, 0.32); return 0.5 }, t0)
    playAt( 0.20, 0.9, (out, t) => { pipForLead(out, t, n2, 0.32); return 0.5 }, t0 + 0.18)
  }

  // Digit pip — 0..9 as scale degrees in the active tonality.
  // Layout: 0 → root one octave below; 1..7 → scale degrees 0..6;
  //         8 → root +1 octave; 9 → 9th (degree 1, +1 octave).
  function digit(d, when) {
    const t0 = when != null ? when : now()
    let degree
    if (d === 0)      degree = -7   // one octave below root (low anchor)
    else if (d <= 7)  degree = d - 1
    else if (d === 8) degree = 7    // root one octave up
    else              degree = 8    // 9th
    const f = noteHz(state.rootSemitone, degree)
    playAt(0, 0.95, (out, t) => pipForLead(out, t, f, 0.42), t0)
  }

  // Rising arpeggio on a cleared operation. Three notes: 1-3-5.
  function correct(when) {
    const t0 = when != null ? when : now()
    const r = state.rootSemitone
    const f1 = midiHz(60 + r)
    const f3 = midiHz(60 + r + (state.mode === 'minor' ? 3 : 4))
    const f5 = midiHz(60 + r + 7)
    playAt(-0.10, 0.9, (out, t) => pipForLead(out, t, f1, 0.40), t0)
    playAt( 0.00, 0.9, (out, t) => pipForLead(out, t, f3, 0.40), t0 + 0.07)
    playAt( 0.15, 1.0, (out, t) => pipForLead(out, t, f5 * 2, 0.40), t0 + 0.14)
  }

  // Two-note fall — terse and dissonant, signals "wrong, moving on".
  function fail(when) {
    const t0 = when != null ? when : now()
    const r = state.rootSemitone
    // tritone above root → minor 2nd above root (very dissonant pair)
    const f1 = midiHz(60 + r + 6)
    const f2 = midiHz(60 + r + 1)
    playAt(-0.30, 1.0, (out, t) => {
      const c = ctx()
      const o = c.createOscillator(); o.type = 'sawtooth'
      o.frequency.setValueAtTime(f1, t)
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'
      lp.frequency.setValueAtTime(900, t)
      const e = envGain(out, t, 0.002, 0.02, 0.18, 0.45)
      o.connect(lp).connect(e); o.start(t); o.stop(t + 0.25)
      return 0.3
    }, t0)
    playAt( 0.30, 1.0, (out, t) => {
      const c = ctx()
      const o = c.createOscillator(); o.type = 'sawtooth'
      o.frequency.setValueAtTime(f2, t)
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'
      lp.frequency.setValueAtTime(700, t)
      const e = envGain(out, t, 0.002, 0.02, 0.20, 0.40)
      o.connect(lp).connect(e); o.start(t); o.stop(t + 0.27)
      return 0.32
    }, t0 + 0.10)
  }

  // Level-up fanfare: 1-3-5-8 ascending, brisk.
  function levelUp(when) {
    const t0 = when != null ? when : now()
    const r = state.rootSemitone
    const f1 = midiHz(60 + r)
    const f3 = midiHz(60 + r + (state.mode === 'minor' ? 3 : 4))
    const f5 = midiHz(60 + r + 7)
    const f8 = midiHz(60 + r + 12)
    const beat = 0.10
    playAt(-0.20, 1.0, (out, t) => pipForLead(out, t, f1, 0.45), t0)
    playAt(-0.05, 1.0, (out, t) => pipForLead(out, t, f3, 0.45), t0 + beat)
    playAt( 0.10, 1.0, (out, t) => pipForLead(out, t, f5, 0.45), t0 + beat * 2)
    playAt( 0.25, 1.0, (out, t) => pipForLead(out, t, f8, 0.50), t0 + beat * 3)
    // Extra ringing high note
    playAt( 0.0,  0.8, (out, t) => pipForLead(out, t, f8 * 2, 0.30), t0 + beat * 4 + 0.05)
  }

  // Game-over: descending minor triad + low rumble.
  function gameOver(when) {
    const t0 = when != null ? when : now()
    const r = state.rootSemitone
    const f1 = midiHz(60 + r + 7)
    const f2 = midiHz(60 + r + 3)
    const f3 = midiHz(60 + r)
    const f4 = midiHz(60 + r - 12)
    playAt(0, 1.0, (out, t) => {
      const c = ctx()
      const o = c.createOscillator(); o.type = 'sine'
      o.frequency.setValueAtTime(f1, t)
      const e = envGain(out, t, 0.005, 0.05, 0.4, 0.35)
      o.connect(e); o.start(t); o.stop(t + 0.5)
      return 0.5
    }, t0)
    playAt(0, 1.0, (out, t) => {
      const c = ctx()
      const o = c.createOscillator(); o.type = 'sine'
      o.frequency.setValueAtTime(f2, t)
      const e = envGain(out, t, 0.005, 0.05, 0.4, 0.35)
      o.connect(e); o.start(t); o.stop(t + 0.5)
      return 0.5
    }, t0 + 0.22)
    playAt(0, 1.0, (out, t) => {
      const c = ctx()
      const o = c.createOscillator(); o.type = 'sine'
      o.frequency.setValueAtTime(f3, t)
      const e = envGain(out, t, 0.005, 0.05, 0.6, 0.40)
      o.connect(e); o.start(t); o.stop(t + 0.7)
      return 0.7
    }, t0 + 0.44)
    // Sub rumble underneath
    playAt(0, 1.0, (out, t) => {
      const c = ctx()
      const o = c.createOscillator(); o.type = 'sine'
      o.frequency.setValueAtTime(f4, t)
      const e = envGain(out, t, 0.05, 0.4, 0.7, 0.30)
      o.connect(e); o.start(t); o.stop(t + 1.2)
      return 1.2
    }, t0)
  }

  // ---- configuration ----

  function setLeadVoice(id) {
    if (id) state.leadVoice = id
  }

  function setTonality(opts) {
    if (!opts) return
    if (typeof opts.rootSemitone === 'number') state.rootSemitone = opts.rootSemitone
    if (opts.mode === 'major' || opts.mode === 'minor') {
      state.mode = opts.mode
      state.scale = SCALES[opts.mode]
    }
  }

  return {
    setLeadVoice, setTonality,
    countIn, opCue, digit,
    correct, fail, levelUp, gameOver,
    now,
  }
})()
