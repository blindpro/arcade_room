// Style registry for the math-game's procedural music.
//
// Each style is a small bag of knobs that music.js (drums/bass/pad/lead) and
// audio.js (lead voice for digit pips and op cues) read to render the level's
// sound. Game.js picks one style + one meter per level from this table.
//
// The previous version reused dynamic_beatstar's 11 generic-genre styles
// verbatim and they all blurred together, because the LEAD PHRASE shape was
// the same regardless of style. Now every style declares a `leadShape`
// (and optional shape-tuning knobs) that music.js's generateLeadPhrase()
// branches on, and a handful of styles get bespoke drum kits, bass timbres,
// pad timbres, and lead voices to back up that shape.
//
// The result: 14 styles, each with a one-word personality you should be able
// to identify within two measures of music.
//
// Progressions are expressed as `{r, t}` chord descriptors (see
// content.theory) where r is the chord root in semitones from the
// active tonality root, and t is the chord type. The progression is
// the same shape regardless of key — content.theory.expand() turns it
// into Hz frequencies at scheduling time using the active tonality.
//
// Knobs:
//   bpmRange            hint range; level's BPM is clamped into this
//   meterPalette        integers, beats-per-measure (4/4=4, 3/4=3, 5/4=5)
//   progressions        list of 4-chord progressions for major mode
//   minorProgressions   list of 4-chord progressions for minor mode
//   drumKit             timbre branch in music.js drum voices
//   bassVoice           timbre branch in music.js bass voice
//   bassPattern         optional override: 'oompah' | 'walking' | 'pulse' |
//                       'rootFifth' | 'eighths' (default = downbeat-only)
//   padVoice            timbre branch in music.js pad voice
//   leadVoice           timbre branch in audio.js / music.js lead voices
//   leadShape           per-measure lead-phrase generator key (see
//                       music.js#generateLeadPhrase)
//   leadOctaveBias      -1 | 0 | +1 — pull the lead an octave down/up.
//   pad                 pad volume multiplier (0 = off, 1 = full)
content.styles = (() => {
  const STYLES = {
    // vibe: smoky. Late-night jazz — the original lounge + jazz folded into
    // one strong identity. Walking upright bass, brushed kit, ornamented
    // chord-tone lead with neighbour-tone approaches.
    lateNightJazz: {
      id: 'lateNightJazz',
      bpmRange: [80, 120],
      meterPalette: [4, 3],
      progressions: [
        // ii7 - V7 - Imaj7 - VI7  (turnaround with secondary dominant)
        [{r:2,t:'min7'}, {r:7,t:'dom7'}, {r:0,t:'maj7'}, {r:9,t:'dom7'}],
        // Imaj7 - vi7 - ii7 - V7
        [{r:0,t:'maj7'}, {r:9,t:'min7'}, {r:2,t:'min7'}, {r:7,t:'dom7'}],
        // iii7 - VI7 - ii7 - V7
        [{r:4,t:'min7'}, {r:9,t:'dom7'}, {r:2,t:'min7'}, {r:7,t:'dom7'}],
      ],
      minorProgressions: [
        // ii halfdim - V7 - i7 - i7  (minor ii-V-i)
        [{r:2,t:'halfdim'}, {r:7,t:'dom7'}, {r:0,t:'min7'}, {r:0,t:'min7'}],
        // i7 - iv7 - V7 - i7
        [{r:0,t:'min7'}, {r:5,t:'min7'}, {r:7,t:'dom7'}, {r:0,t:'min7'}],
      ],
      drumKit: 'jazz',
      bassVoice: 'upright',
      bassPattern: 'walking',
      padVoice: 'rhodes',
      leadVoice: 'mellow',
      leadShape: 'jazzWalk',
      pad: 0.5,
    },
    // vibe: neon. Synthwave — saw pads, sub bass, sustained square lead.
    synthwave: {
      id: 'synthwave',
      bpmRange: [85, 120],
      meterPalette: [4],
      progressions: [
        // vi - IV - I - V
        [{r:9,t:'min'}, {r:5,t:'maj'}, {r:0,t:'maj'}, {r:7,t:'maj'}],
        // vi - iii - IV - V
        [{r:9,t:'min'}, {r:4,t:'min'}, {r:5,t:'maj'}, {r:7,t:'maj'}],
      ],
      minorProgressions: [
        [{r:0,t:'min'}, {r:8,t:'maj'}, {r:3,t:'maj'}, {r:10,t:'maj'}],
        [{r:0,t:'min'}, {r:5,t:'min'}, {r:10,t:'maj'}, {r:3,t:'maj'}],
      ],
      drumKit: 'electro',
      bassVoice: 'sub',
      padVoice: 'saw',
      leadVoice: 'square',
      leadShape: 'arpUp',
      pad: 0.55,
    },
    // vibe: pumping. Four-on-the-floor house — every beat a kick.
    house: {
      id: 'house',
      bpmRange: [115, 128],
      meterPalette: [4],
      progressions: [
        [{r:0,t:'maj'}, {r:9,t:'min'}, {r:5,t:'maj'}, {r:7,t:'maj'}],
        [{r:9,t:'min'}, {r:5,t:'maj'}, {r:0,t:'maj'}, {r:7,t:'maj'}],
      ],
      minorProgressions: [
        [{r:0,t:'min'}, {r:10,t:'maj'}, {r:8,t:'maj'}, {r:7,t:'maj'}],
        [{r:0,t:'min'}, {r:5,t:'min'}, {r:8,t:'maj'}, {r:7,t:'maj'}],
      ],
      drumKit: 'fourFloor',
      bassVoice: 'pluck',
      padVoice: 'saw',
      leadVoice: 'pluck',
      leadShape: 'eighthStab',
      pad: 0.5,
    },
    // vibe: 8-bit. Chiptune — square waves, blocky arps, NES-style.
    chiptune: {
      id: 'chiptune',
      bpmRange: [100, 140],
      meterPalette: [4, 3, 5],
      progressions: [
        [{r:0,t:'maj'}, {r:7,t:'maj'}, {r:9,t:'min'}, {r:5,t:'maj'}],
        [{r:0,t:'maj'}, {r:5,t:'maj'}, {r:7,t:'maj'}, {r:7,t:'maj'}],
      ],
      minorProgressions: [
        [{r:0,t:'min'}, {r:10,t:'maj'}, {r:8,t:'maj'}, {r:10,t:'maj'}],
        [{r:0,t:'min'}, {r:8,t:'maj'},  {r:3,t:'maj'}, {r:10,t:'maj'}],
      ],
      drumKit: 'chip',
      bassVoice: 'square',
      padVoice: 'arp',
      leadVoice: 'square',
      leadShape: 'sixteenthArp',
      pad: 0.4,
    },
    // vibe: punchy. Rock — backbeat snare, driving saw bass, organ pad.
    rock: {
      id: 'rock',
      bpmRange: [95, 130],
      meterPalette: [4],
      progressions: [
        [{r:0,t:'maj'}, {r:7,t:'maj'}, {r:9,t:'min'}, {r:5,t:'maj'}],
        [{r:0,t:'maj'}, {r:5,t:'maj'}, {r:7,t:'maj'}, {r:7,t:'maj'}],
      ],
      minorProgressions: [
        [{r:0,t:'min'}, {r:10,t:'maj'}, {r:8,t:'maj'}, {r:7,t:'maj'}],
        [{r:0,t:'min'}, {r:8,t:'maj'},  {r:10,t:'maj'}, {r:0,t:'min'}],
      ],
      drumKit: 'rock',
      bassVoice: 'driving',
      bassPattern: 'eighths',
      padVoice: 'organ',
      leadVoice: 'pluck',
      leadShape: 'pentatonic',
      pad: 0.5,
    },
    // vibe: ballroom. 3/4 waltz — pad-on-1, soft kit, bell lead in 3.
    waltz: {
      id: 'waltz',
      bpmRange: [70, 110],
      meterPalette: [3],
      progressions: [
        [{r:0,t:'maj'}, {r:5,t:'maj'}, {r:7,t:'maj'}, {r:0,t:'maj'}],
        [{r:0,t:'maj'}, {r:9,t:'min'}, {r:5,t:'maj'}, {r:7,t:'maj'}],
      ],
      minorProgressions: [
        [{r:0,t:'min'}, {r:8,t:'maj'}, {r:5,t:'min'}, {r:7,t:'maj'}],
      ],
      drumKit: 'brush',
      bassVoice: 'rounded',
      padVoice: 'soft',
      leadVoice: 'bell',
      leadShape: 'waltz',
      pad: 0.6,
    },
    // vibe: greasy. Funk — slap bass, syncopated hat, dom7 vamps.
    funk: {
      id: 'funk',
      bpmRange: [95, 120],
      meterPalette: [4],
      progressions: [
        [{r:0,t:'dom7'}, {r:5,t:'dom7'}, {r:0,t:'dom7'}, {r:7,t:'dom7'}],
        [{r:2,t:'min7'}, {r:7,t:'dom7'}, {r:0,t:'dom7'}, {r:0,t:'dom7'}],
      ],
      minorProgressions: [
        [{r:0,t:'min7'}, {r:5,t:'min7'}, {r:0,t:'min7'}, {r:7,t:'dom7'}],
        [{r:0,t:'min7'}, {r:10,t:'dom7'}, {r:8,t:'dom7'}, {r:7,t:'dom7'}],
      ],
      drumKit: 'funk',
      bassVoice: 'slap',
      padVoice: 'organ',
      leadVoice: 'pluck',
      leadShape: 'syncoSixteenths',
      pad: 0.45,
    },
    // vibe: floating. Ambient — sparse kick, long pad, slow bell lead.
    ambient: {
      id: 'ambient',
      bpmRange: [62, 88],
      meterPalette: [4],
      progressions: [
        [{r:0,t:'maj7'}, {r:4,t:'min7'}, {r:9,t:'min7'}, {r:5,t:'maj7'}],
        [{r:0,t:'maj7'}, {r:7,t:'maj'},  {r:9,t:'min7'}, {r:5,t:'maj7'}],
      ],
      minorProgressions: [
        [{r:0,t:'min7'}, {r:8,t:'maj7'}, {r:3,t:'maj7'}, {r:10,t:'maj7'}],
      ],
      drumKit: 'ambient',
      bassVoice: 'sub',
      padVoice: 'strings',
      leadVoice: 'bell',
      leadShape: 'sparse',
      pad: 0.85,
    },
    // vibe: tropical. Latin — montuno bass, clave-flavoured kit.
    latin: {
      id: 'latin',
      bpmRange: [95, 130],
      meterPalette: [4],
      progressions: [
        [{r:0,t:'maj'}, {r:7,t:'dom7'}, {r:0,t:'maj'}, {r:7,t:'dom7'}],
        [{r:5,t:'maj'}, {r:7,t:'dom7'}, {r:0,t:'maj'}, {r:0,t:'maj'}],
      ],
      minorProgressions: [
        [{r:0,t:'min'}, {r:7,t:'dom7'}, {r:0,t:'min'}, {r:7,t:'dom7'}],
        [{r:0,t:'min'}, {r:5,t:'min'}, {r:7,t:'dom7'}, {r:0,t:'min'}],
      ],
      drumKit: 'latin',
      bassVoice: 'rounded',
      bassPattern: 'rootFifth',
      padVoice: 'rhodes',
      leadVoice: 'pluck',
      leadShape: 'montuno',
      pad: 0.45,
    },
    // vibe: glittery. Disco — four-on-the-floor with offbeat hat, sus pads.
    disco: {
      id: 'disco',
      bpmRange: [110, 128],
      meterPalette: [4],
      progressions: [
        [{r:0,t:'maj7'}, {r:9,t:'min7'}, {r:5,t:'maj7'}, {r:7,t:'dom7'}],
        [{r:2,t:'min7'}, {r:7,t:'dom7'}, {r:0,t:'maj7'}, {r:0,t:'maj7'}],
      ],
      minorProgressions: [
        [{r:0,t:'min'}, {r:10,t:'maj'}, {r:8,t:'maj'}, {r:7,t:'dom7'}],
        [{r:0,t:'min'}, {r:5,t:'min'}, {r:8,t:'maj'}, {r:10,t:'maj'}],
      ],
      drumKit: 'disco',
      bassVoice: 'pluck',
      padVoice: 'saw',
      leadVoice: 'square',
      leadShape: 'discoUp',
      pad: 0.55,
    },

    // ----- Funny / quirky styles -----

    // vibe: clownish. Circus oompah — big-top march in 2/4. Tuba-style
    // alternating root/fifth bass on every beat ("oom-pah-oom-pah"),
    // bouncy octave-skipping accordion lead.
    circus: {
      id: 'circus',
      bpmRange: [90, 130],
      meterPalette: [4, 3],
      progressions: [
        // I - V - I - V (oompah staple)
        [{r:0,t:'maj'}, {r:7,t:'dom7'}, {r:0,t:'maj'}, {r:7,t:'dom7'}],
        // I - IV - V - I
        [{r:0,t:'maj'}, {r:5,t:'maj'},  {r:7,t:'dom7'}, {r:0,t:'maj'}],
      ],
      minorProgressions: [
        // i - V7 - i - V7  (gypsy-flavour minor circus)
        [{r:0,t:'min'}, {r:7,t:'dom7'}, {r:0,t:'min'}, {r:7,t:'dom7'}],
      ],
      drumKit: 'oompah',
      bassVoice: 'tuba',
      bassPattern: 'oompah',
      padVoice: 'organ',
      leadVoice: 'accordion',
      leadShape: 'octaveBounce',
      leadOctaveBias: 0,
      pad: 0.40,
    },
    // vibe: zany. Cartoon-chase — woodblock kit, chromatic 16th runs,
    // 2-feel bass on 1+3. Think Looney-Tunes Carl-Stalling.
    cartoon: {
      id: 'cartoon',
      bpmRange: [120, 168],
      meterPalette: [4],
      progressions: [
        // I - dim - V - I  (chase chord moves)
        [{r:0,t:'maj'}, {r:3,t:'dim'}, {r:7,t:'dom7'}, {r:0,t:'maj'}],
        // I - VI7 - II7 - V7  (chromatic chase)
        [{r:0,t:'maj'}, {r:9,t:'dom7'}, {r:2,t:'dom7'}, {r:7,t:'dom7'}],
      ],
      minorProgressions: [
        [{r:0,t:'min'}, {r:6,t:'dim'}, {r:7,t:'dom7'}, {r:0,t:'min'}],
      ],
      drumKit: 'cartoon',
      bassVoice: 'pluck',
      bassPattern: 'pulse',
      padVoice: 'soft',
      leadVoice: 'square',
      leadShape: 'chromaticRun',
      pad: 0.30,
    },
    // vibe: wedding. Klezmer — minor-mode, ornamented neighbour-tone
    // lead, freylekh-style hat on every 8th, off-beat pad accent.
    klezmer: {
      id: 'klezmer',
      bpmRange: [95, 135],
      meterPalette: [4, 3],
      progressions: [
        // i - V7 - i - i  (freygish flavour)
        [{r:0,t:'min'}, {r:7,t:'dom7'}, {r:0,t:'min'}, {r:0,t:'min'}],
        // i - iv - V7 - i
        [{r:0,t:'min'}, {r:5,t:'min'},  {r:7,t:'dom7'}, {r:0,t:'min'}],
      ],
      minorProgressions: [
        [{r:0,t:'min'}, {r:7,t:'dom7'}, {r:0,t:'min'}, {r:0,t:'min'}],
        [{r:0,t:'min'}, {r:5,t:'min'},  {r:7,t:'dom7'}, {r:0,t:'min'}],
      ],
      drumKit: 'klezmer',
      bassVoice: 'rounded',
      bassPattern: 'rootFifth',
      padVoice: 'organ',
      leadVoice: 'accordion',
      leadShape: 'klezmerOrnament',
      pad: 0.40,
    },
    // vibe: tinkling. Music-box — sparse high bell-y lead, one note every
    // two beats, 3/4 waltz feel, almost no kit.
    musicBox: {
      id: 'musicBox',
      bpmRange: [70, 100],
      meterPalette: [3],
      progressions: [
        // I - vi - IV - V
        [{r:0,t:'maj7'}, {r:9,t:'min7'}, {r:5,t:'maj7'}, {r:7,t:'dom7'}],
        // I - IV - V - I
        [{r:0,t:'maj'}, {r:5,t:'maj'}, {r:7,t:'dom7'}, {r:0,t:'maj'}],
      ],
      minorProgressions: [
        // i - VI - III - VII (music-box minor)
        [{r:0,t:'min7'}, {r:8,t:'maj7'}, {r:3,t:'maj7'}, {r:10,t:'dom7'}],
      ],
      drumKit: 'musicBox',
      bassVoice: 'rounded',
      bassPattern: 'pulse',
      padVoice: 'soft',
      leadVoice: 'toyPiano',
      leadShape: 'musicBoxArp',
      leadOctaveBias: 1,
      pad: 0.55,
    },

    // ----- Mental-concentration styles -----

    // vibe: hypnotic. Minimal pulse — Steve-Reich-style 16th-note repetition
    // on the lead with a tiny pitch-class drift over the measure; pad is a
    // single sustained root drone. Drums are sparse ticks.
    minimalPulse: {
      id: 'minimalPulse',
      bpmRange: [100, 130],
      meterPalette: [4],
      progressions: [
        // I - I - vi - vi  (slow harmonic rhythm = static feel)
        [{r:0,t:'maj7'}, {r:0,t:'maj7'}, {r:9,t:'min7'}, {r:9,t:'min7'}],
        // I - V - vi - IV
        [{r:0,t:'maj7'}, {r:7,t:'maj'},  {r:9,t:'min7'}, {r:5,t:'maj7'}],
      ],
      minorProgressions: [
        // i - i - VI - VI
        [{r:0,t:'min7'}, {r:0,t:'min7'}, {r:8,t:'maj7'}, {r:8,t:'maj7'}],
      ],
      drumKit: 'minimal',
      bassVoice: 'sub',
      bassPattern: 'pulse',
      padVoice: 'soft',
      leadVoice: 'pluck',
      leadShape: 'reichPhasing',
      pad: 0.50,
    },
    // vibe: drifting. Drone trance — one continuous tone that drifts pitch
    // class slowly. Pad is the whole measure, kit is a single soft kick on
    // 1, lead repeats the chord root with subtle inflections.
    dronePad: {
      id: 'dronePad',
      bpmRange: [60, 84],
      meterPalette: [4],
      progressions: [
        // I - I - V - I  (extreme harmonic stasis)
        [{r:0,t:'maj7'}, {r:0,t:'maj7'}, {r:7,t:'maj'}, {r:0,t:'maj7'}],
        // I - I - I - I
        [{r:0,t:'maj7'}, {r:0,t:'maj7'}, {r:0,t:'maj7'}, {r:0,t:'maj7'}],
      ],
      minorProgressions: [
        [{r:0,t:'min7'}, {r:0,t:'min7'}, {r:0,t:'min7'}, {r:0,t:'min7'}],
      ],
      drumKit: 'drone',
      bassVoice: 'sub',
      bassPattern: 'pulse',
      padVoice: 'strings',
      leadVoice: 'drone',
      leadShape: 'rootDrone',
      pad: 0.95,
    },
    // vibe: ticking. Clockwork — tight 16th-note repetition on the lead
    // (mechanical), hat on every 8th, bass on 1 and 3, sparse pad.
    clockwork: {
      id: 'clockwork',
      bpmRange: [100, 130],
      meterPalette: [4],
      progressions: [
        [{r:0,t:'min7'}, {r:5,t:'min7'}, {r:7,t:'min7'}, {r:0,t:'min7'}],
        [{r:0,t:'min7'}, {r:8,t:'maj7'}, {r:3,t:'maj7'}, {r:10,t:'maj7'}],
      ],
      minorProgressions: [
        [{r:0,t:'min7'}, {r:5,t:'min7'}, {r:7,t:'min7'}, {r:0,t:'min7'}],
        [{r:0,t:'min7'}, {r:8,t:'maj7'}, {r:3,t:'maj7'}, {r:10,t:'maj7'}],
      ],
      drumKit: 'clock',
      bassVoice: 'square',
      bassPattern: 'rootFifth',
      padVoice: 'soft',
      leadVoice: 'pluck',
      leadShape: 'clockTick',
      pad: 0.30,
    },
    // vibe: studious. Baroque — harpsichord lead in continuous-counterpoint
    // 8th notes, rolling bass on 1+3, no drums, organ pad.
    baroque: {
      id: 'baroque',
      bpmRange: [80, 120],
      meterPalette: [4, 3],
      progressions: [
        // i - iv - V - i  (Bach minor)
        [{r:0,t:'min'}, {r:5,t:'min'}, {r:7,t:'dom7'}, {r:0,t:'min'}],
        // I - IV - V - I  (Bach major)
        [{r:0,t:'maj'}, {r:5,t:'maj'}, {r:7,t:'dom7'}, {r:0,t:'maj'}],
        // ii - V - I - vi
        [{r:2,t:'min'}, {r:7,t:'dom7'}, {r:0,t:'maj'}, {r:9,t:'min'}],
      ],
      minorProgressions: [
        [{r:0,t:'min'}, {r:5,t:'min'}, {r:7,t:'dom7'}, {r:0,t:'min'}],
        [{r:0,t:'min'}, {r:3,t:'maj'}, {r:7,t:'dom7'}, {r:0,t:'min'}],
      ],
      drumKit: 'baroqueNone',
      bassVoice: 'rounded',
      bassPattern: 'rootFifth',
      padVoice: 'organ',
      leadVoice: 'harpsichord',
      leadShape: 'baroqueRun',
      pad: 0.45,
    },
  }

  function list() { return Object.values(STYLES) }
  function get(id) { return STYLES[id] || STYLES.lateNightJazz }

  // Pick a style at random from the whole pool, avoiding repeating the
  // previous level's style if possible. Style choice doesn't gate
  // difficulty — that's BPM / meter / subdivision's job — so every
  // style is in play from level 1.
  function pickFor(prevId) {
    const all = Object.keys(STYLES)
    const pool = prevId && all.length > 1 ? all.filter((id) => id !== prevId) : all
    return STYLES[pool[Math.floor(Math.random() * pool.length)]]
  }

  // Choose a meter from the style's palette. Below level 3 stick with
  // the style's first (canonical) meter so the player learns the
  // backbeat before odd meters are introduced.
  function pickMeter(style, level) {
    const palette = style.meterPalette
    if (level < 3 || palette.length === 1) return palette[0]
    if (level < 6) return Math.random() < 0.7 ? palette[0] : palette[1 % palette.length]
    return palette[Math.floor(Math.random() * palette.length)]
  }

  function pickProgression(style, mode) {
    const list = (mode === 'minor' && style.minorProgressions)
      ? style.minorProgressions
      : style.progressions
    return list[Math.floor(Math.random() * list.length)].slice()
  }

  // Subdivision probability table. Returns {q, e, s} that sum to 1 —
  // probability per beat of generating a quarter (1 note), an eighth
  // pair (2 notes), or a sixteenth quad (4 notes).
  function subdivisionProbs(level) {
    if (level <= 3) return {q: 1.00, e: 0.00, s: 0.00}
    if (level <= 5) return {q: 0.75, e: 0.25, s: 0.00}
    if (level <= 7) return {q: 0.55, e: 0.40, s: 0.05}
    if (level <= 9) return {q: 0.45, e: 0.40, s: 0.15}
    return            {q: 0.35, e: 0.45, s: 0.20}
  }

  return { list, get, pickFor, pickMeter, pickProgression, subdivisionProbs, STYLES }
})()
