export const meta = {
  name: 'curb-synth-design',
  description: 'Design + spectrally-tune synth recipes recreating the original Curb Game sounds',
  phases: [{ title: 'Design', detail: 'one agent per sound-group, tuned against measured spectra' }],
}

const DIR = '/tmp/claude-0/-home-gst-curb/083f383a-f4a6-4ed0-bd58-b46d276332af/scratchpad'

const GROUPS = {
  'engines-core': ['auto1', 'scheurkar', 'pruttelauto'],
  'engines-bike-drive': ['motorloop', 'belmobiel', 'driveback01'],
  'engines-boat-train': ['bootloop', 'tjoekbel', 'treinhorn', 'boottoeter'],
  'engines-spooky': ['ghosty', 'ufo2', 'shark'],
  'beasts': ['olistamp', 'olifant', 'schetenloop'],
  'fanfare': ['harmonie'],
  'police-bed': ['sirene', 'boemcar', 'quepasa'],
  'horns-misc': ['toeter1', 'toeter2', 'phone', 'leader'],
  'voices': ['batmanclip', 'gbustclip2', 'driveleo1', 'driveleo2', 'driveleo3'],
  'footsteps': ['i1', 'i2', 'i3', 'i4', 'i5'],
  'outcomes': ['win', 'lose'],
  'burps': Array.from({ length: 17 }, (_, i) => `burp${i + 1}`),
  'music': ['music', 'theburbgamemix'],
}

const DSL = `
SYNTH RECIPE DSL (JSON). One recipe object per sound, written to ${DIR}/recipes/<name>.json.
A recipe renders to mono audio; the harness re-analyses it and scores spectral distance to the original.

recipe = {
  "kind": "loop" | "oneshot",       // loop = continuous engine/bed; oneshot = horn/footstep/jingle
  "dur": <seconds>,                  // render length. loop: 2. oneshot: the sound's real duration (from brief.durationS).
  "gain": <0..1>,                    // optional output trim (default 1) — does NOT affect spectral score, set ~0.8.
  "layers": [ layer, ... ],
  "seq": [ note, ... ]               // optional melodic events (jingles, ringtones, fanfare, music)
}
layer = {
  "type": "osc" | "noise",
  // osc:
  "wave": "sine"|"square"|"sawtooth"|"triangle",
  "freq": <Hz>,
  "unison": [<cents>, ...],          // optional extra detuned copies, e.g. [-7,7] for a fat engine
  "glideTo": <Hz>, "glideTime": <s>, // optional linear pitch ramp (sirens up, lose down)
  "pitchLfoRate": <Hz>, "pitchLfoCents": <cents>,  // vibrato / siren wail
  // noise:
  "color": "white"|"pink"|"brown",
  // both:
  "gain": <0..1>,                    // layer mix level
  "ampLfoRate": <Hz>, "ampLfoDepth": <0..1>, "ampLfoWave": "sine"|"square"|"saw", // tremolo/engine-chug/fart-wobble
  "filter": { "type":"lowpass"|"highpass"|"bandpass"|"peaking", "freq":<Hz>, "q":<num>, "gain":<dB, peaking only> },
  "filterLfoRate": <Hz>, "filterLfoOct": <octaves>,  // sweeping filter (wah, warble)
  "env": { "a":<s>, "d":<s>, "s":<0..1>, "r":<s>, "peak":<0..1> }  // amplitude ADSR (oneshots). loops usually omit.
}
note = { "t":<s start>, "dur":<s>, "freq":<Hz>, "wave":"sine"|"triangle"|"square"|"sawtooth", "gain":<0..1>,
         "filter": {...optional}, "env": {...optional} }

HOW TO TUNE (do this for EVERY sound):
  1. Write ${DIR}/recipes/<name>.json
  2. Run:  node ${DIR}/render.mjs ${DIR}/recipes/<name>.json <name>
     It prints TARGET features, your CANDIDATE features, and DISTANCE <score> {parts}.
  3. Read the parts and adjust:
     - bandL1 high  -> your spectral energy is in the wrong bands. Move filter cutoffs / add/remove layers
       to match target bandEnergy (sub_40_120, low_120_350, lowmid_350_800, mid_800_2k, hi_2k_5k, air_5k_9k).
     - centroidD high -> overall brightness wrong: lower a lowpass to darken, raise to brighten.
     - flatD high   -> tonal vs noisy mismatch: target flatness <0.1 = pure tonal (oscillators, little/no noise);
       >0.5 = very noisy (lead with noise layers); in between = osc + some noise.
     - peakD high (tonal sounds only) -> your dominant partials are at the wrong Hz. Set osc "freq" to the target's
       topPeaksHz fundamentals; add oscillators or "peaking" filters at the strong peak frequencies.
     - sustD/attackD (oneshots) -> tune env a/d/s/r so the amplitude shape matches (attackMs, sustainedFraction).
  4. Iterate up to 7 times, keeping the lowest-scoring version on disk. Stop when score stops improving (<3% gain)
     or reaches a good match (tonal/oneshot < 0.9; noisy/engine < 1.3; voice/music are stylized, < 1.8 is fine).

GUIDANCE BY ROLE:
  engine  -> low osc fundamental at target peak (saw/square + unison) + bandpass/brown-noise body; ampLfo = engine chug.
             Use a lowpass to kill aliasing fizz and hit the (usually low) centroid. Match the firing partials in topPeaks.
  siren   -> two bright triangle/sine oscillators with pitchLfo wail (rate ~3-5 Hz, depth ~100-250 cents) at the peak cluster.
  horn    -> 2-3 oscillators forming the target dyad (saw/square for buzz) + short-ish env. Match the peak interval.
  footstep-> very short (dur ~ brief duration): a low sine "thud" (env fast a, short r) + a quick lowpassed noise scuff.
  jingle(win) -> seq of 4 bright triangle/sine notes rising through the target peak frequencies; sparkly.
  splat(lose) -> noisy burst (white/pink) through a bandpass that glides DOWN, plus a quick downward osc; comic squash.
  burp    -> low voiced osc (saw, ~80-200 Hz) + throaty noise, ampLfo wobble (rate 8-25 Hz), short env. Vary per index.
  fart    -> like burp but longer loop: low saw + brown noise + irregular ampLfo wobble; very noisy.
  bed     -> sub-bass thump loop (boemcar): low sine/saw with rhythmic ampLfo (square, ~2-4 Hz = doof-doof).
  voice   -> DO NOT attempt speech. Build an ABSTRACT formant stand-in: 2-3 oscillators at vowel-ish formant freqs
             (matching target peaks/bands) with a little pitch glide / vibrato and an env shaped like the clip. Stylized.
  music   -> ORIGINAL composition only. Use "seq" for a short (~2 s) loopable bass+lead pattern whose register/energy
             matches the target bands; do NOT reproduce any real melody. Bouncy retro-arcade feel.

IMPORTANT: every numeric field must be a finite number; "type" and "kind" are required. Test that render.mjs runs without error.
`

phase('Design')

const SCHEMA = {
  type: 'object',
  required: ['results'],
  additionalProperties: false,
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'score', 'summary'],
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          score: { type: 'number' },
          summary: { type: 'string', description: 'one line: what timbre you built + final distance parts' },
        },
      },
    },
  },
}

const entries = Object.entries(GROUPS)
const out = await parallel(entries.map(([group, names]) => () =>
  agent(
    `You are recreating original game sound effects with a Web Audio synth, matching their measured spectra.

Your group "${group}" covers these sounds: ${JSON.stringify(names)}.

Read ${DIR}/briefs.json and find your sounds' entries (role, description, kind, durationS, and target spectral features).
The target features are what the ORIGINAL sound measured; your job is to design a synth recipe whose render measures close to it.

${DSL}

Workflow:
- For EACH of your sounds, design, write ${DIR}/recipes/<name>.json, and tune it with render.mjs until the distance plateaus.
- Keep the BEST (lowest-score) recipe file on disk for each sound (the file is the deliverable; leave it valid).
- These sounds should also be musically/aesthetically pleasing (modern, soft-clipped, not harsh): no naked piercing
  square highs, roll off ultra-high fizz, and make engines/beds one evolving continuous voice.

Return the results array: one {name, score, summary} per sound, with the FINAL distance score and a one-line summary.`,
    { label: `synth:${group}`, phase: 'Design', schema: SCHEMA, effort: 'medium' },
  ).then((r) => (r && r.results ? r.results : [])),
))

const flat = out.filter(Boolean).flat()
flat.sort((a, b) => (b.score || 0) - (a.score || 0))
log(`Designed ${flat.length} recipes. Worst matches: ${flat.slice(0, 5).map((r) => `${r.name}=${r.score}`).join(', ')}`)
return { count: flat.length, results: flat }
