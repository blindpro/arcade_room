# The Curb Game — build notes

A faithful, fully-synthesised port of **The Curb Game** (Creative Heroes, 2002)
onto the syngen-template. You are a hedgehog crossing a road by ear: vehicles
pan across the stereo field and grow louder toward the centre; cross to the far
curb while your lane is clear (+100), don't get hit.

This is **not** "starting a new game" — the foundational design is settled below.
The template's generic `CLAUDE.md` still applies for syngen/screen mechanics.

## Design (locked)

1. **Movement** — fixed 320×240 stage. The walker only moves vertically between
   two curbs (Up/Down, 5px steps); each vehicle only moves horizontally across
   the road's centre band. Collision is the original AABB (`intersects`).
2. **Listener — stereo / non-spatial.** NOT binaural. Audio uses Director's
   **linear-balance** pan (centre = full both sides; panning only attenuates the
   far side), reproduced in `content/audio.js`. This is the positional cue the
   game depends on; do not swap it for an equal-power panner or binaural.
3. **Audio role** — audio-first / blind-accessible. Playable screen-off.
4. **Input** — keyboard (Up/Down to cross, Space to hear score, Escape to quit).
5. **Persistence** — high score only (`localStorage['curb.best']`); no autosave.
6. **Progression** — endless score chase; levels 1–11 derived from score
   thresholds; `gVariatie` widens the vehicle pool with level.
7. **Synth aesthetic** — every original sample is replaced by a **synthesised
   voice** matched to the original's measured spectrum (see below). Music beds
   and human/movie voice clips are **original / abstract stand-ins**, not copies.

## Game logic — ported 1:1

The original Lingo (recovered, mirrored in the TS reference port at
`/home/curbgame/src`) is transcribed verbatim into `src/js/content/`:

- `constants.js` — stage, tempo (fixed 30 fps), `VOLUME_PER_COUNTER = 2.55`,
  level thresholds, `variatieForLevel`.
- `objects.js` — the 21 vehicles + hidden `999` warthog, with the original
  per-level speed tables, ghost level-blend, and randomised cars
  (`ghost = random(4)`, `belcar = random(3)+2`).
- `game.js` — the per-frame state machine: `generate → moveTo → moveFrom →
  reset → death → gameover`, with `keyCheck`/`sideCheck`/`collCheck`/
  `exciteCount`/`moveTo`/`moveFrom`/`playWin`/`playStep` 1:1 with MovieScript.
  Note `exciteCount` strips 10 points every ~16 frames *while a car is mid-road*
  (the idle penalty fires during any crossing — faithful, so a single crossing
  nets <100).
- The **warthog/burp-mode easter egg**: object 7 + `playtime ≥ 3` + `random(2)`
  may spawn `999`; dying to it flips `burbMode` on (burp win cues + burp music
  bed) and carries the score over. `playtime` is counted per round-start, which
  reaches the same "3rd game" unlock as the original's attract-frame counter.

Headless regression: `node test/logic.mjs` (21 assertions over scoring,
collision death, levels, idle penalty, warthog→burp). Run after any `content/`
change.

## Audio — Director channels + synth voices

`content/audio.js` builds Director's 8 numbered sound channels on syngen's
`engine.context()`, routed through `engine.mixer.createBus()`:

```
puppetSound(n, name)  -> replace channel n's voice with content.sounds.makeVoice(name)
volume(n, 0..255)     -> channel volume gain
pan(n, -100..100)     -> linear-balance L/R gains (far side attenuates)
stop(n) / silenceAll()
```

The game drives these exactly as the Lingo did (`volume = counter*2.55`, the
per-direction pan ramps). The global reverb send is disabled in `main.js` so the
stereo image stays clean; voices route to the master bus dry.

### Synthesised sounds (recipe DSL)

There are **no audio samples**. `content/sounds.js` is a Web-Audio interpreter
for a small synth DSL (osc/noise layers with unison, glide, pitch/amp/filter
LFOs, biquads, ADSR, and `seq` note lists). `content/sounds-data.js` holds one
recipe per sound name (`auto1`, `sirene`, `toeter1`, `i1`…`i5`, `win`, `lose`,
`burp1`…`burp17`, `music`, …).

Recipes were produced by the spectral-matching pipeline in `tools/audio/`:

- `analyze.mjs` decodes each original mp3 (`/home/curbgame/public/sounds`) and
  measures centroid, flatness, band energy, dominant peaks, envelope →
  `analysis.json`.
- `render.mjs` is the **offline twin** of `content/sounds.js` (same DSL); `feat.mjs`
  re-analyses a rendered recipe and scores its spectral distance to the target.
- `synth-workflow.js` fanned out one agent per sound-group, each tuning its
  recipes against the measured target until the distance plateaued
  (mean ≈ 0.46; engines/SFX 0.2–0.6; abstract voice clips & original music higher
  by design).
- `harvest.mjs` assembles `recipes/*.json` → `src/js/content/sounds-data.js`.

**To re-tune a sound:** edit `tools/audio/recipes/<name>.json`, check it with
`node tools/audio/render.mjs tools/audio/recipes/<name>.json <name>`, then
`node tools/audio/harvest.mjs && pnpx gulp build`. The browser interpreter and
`render.mjs` implement the same DSL, so what you score offline is what you hear.

**Deliberate departures from the originals (2026-07):** ALL 55 sounds were
redesigned to sound *modern and plausible* rather than matching the toyish
2002 samples. Spectral distance to the analysis targets is now large **on
purpose**; do not re-tune anything back toward `analysis.json`. Each recipe
keeps its original's *identity* (fundamental register, flutter/firing rates,
durations, envelope timing, melody) so the by-ear gameplay vocabulary is
unchanged. House rules:

- **Engines** (`auto1`, `scheurkar`, `pruttelauto`, `belmobiel`, `motorloop`,
  `driveback01`, `bootloop`, `shark`): sub-sine foundation + dark detuned saw
  stack (lowpassed ≤ ~650 Hz), slow pitch drift (`pitchLfoCents` 10–25 at
  0.3–0.9 Hz), firing-rate pulse as *triangle* amp LFO with per-layer
  decorrelated rates (never one synced sine trem on everything), brown-noise
  exhaust, a slowly-breathing pink band ~1 kHz for tire/road noise, and no
  open-ended hiss (bandpass, never bare highpass).
- **Horns**: `toeter1`/`toeter2` are dual-tone saw pairs (349+440 / 330+415 Hz)
  with resonant diaphragm bandpass formants; `treinhorn` is a K5LA-style
  chord (311/415/494/622) with `glideTo` pitch-scoops; `boottoeter` a deep
  114 Hz ship blast. `sirene` is a continuous electronic wail (deep sine
  `pitchLfoCents` sweep through a horn-speaker resonance).
- **Voices/animals** (`quepasa`, `leader`, `batmanclip`, `gbustclip2`,
  `driveleo*`, `olifant`, burps): source-filter model — low saw/noise source
  with vibrato through vocal-formant bandpasses + syllabic (4–7 Hz) amp LFO;
  never oscillators placed *at* formant frequencies (that's the whistle/organ
  tell). Burps: low glottal saw with falling `glideTo`, deep saw-wave flutter,
  brown gurgle band.
- **Footsteps** (`i1`–`i5`): percussive — sine thump with downward glide +
  brown-noise body band + tiny scuff band; near-instant attack, no tonal plink.
- **Music beds** (`music`, `harmonie`, `boemcar`, `theburbgamemix`): every saw
  and square goes through a lowpass; harmonie has a 2 Hz march-drum layer;
  boemcar is sub-dominant (subwoofer heard through a car body).

## Build / run

```sh
pnpm install
pnpx gulp build            # -> public/scripts.min.js + styles.min.css
node test/logic.mjs        # headless game-logic regression
```

The original samples and images under `/home/curbgame` are reference only and
are not shipped — this port is sample-free.
