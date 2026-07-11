# tools/audio — spectral-matching synth pipeline

The Curb Game ships **no audio samples**. Every sound is a synthesised voice
whose recipe was tuned to match the *measured spectrum* of the corresponding
original Shockwave sound. This directory is that pipeline.

## Files

| File | Role |
| --- | --- |
| `analyze.mjs` | Decode each original mp3 (`/home/curbgame/public/sounds`) via ffmpeg and measure features → `analysis.json`. |
| `feat.mjs` | Shared FFT + feature extraction (centroid, flatness, band energy, dominant peaks, envelope) + a `distance()` comparator. |
| `render.mjs` | Offline renderer for the synth DSL — the exact twin of `src/js/content/sounds.js`. `evaluate(recipe, target)` renders a recipe and scores it. |
| `briefs.mjs` / `briefs.json` | Per-sound brief: role, which vehicle uses it, loop flag, and the measured target features. |
| `synth-workflow.js` | The multi-agent workflow that designed + tuned every recipe against its target. |
| `recipes/*.json` | One tuned recipe per sound (the source of truth). |
| `harvest.mjs` | Assemble `recipes/*.json` → `src/js/content/sounds-data.js`. |

## The DSL

A recipe is `{kind, dur, gain, layers[], seq[]}`. A layer is an `osc` (wave,
freq, unison, glide, pitch/amp LFO) or `noise` (white/pink/brown), optionally
through a biquad `filter` (with an LFO sweep) and an ADSR `env`. `seq` is a list
of melodic note events. `render.mjs` and `content/sounds.js` implement the same
semantics, so a recipe's offline score predicts what you hear in the browser.

## Re-tuning a sound

```sh
# inspect the target vs your candidate and the distance breakdown
node tools/audio/render.mjs tools/audio/recipes/sirene.json sirene
# …edit tools/audio/recipes/sirene.json, re-run until the distance drops…
node tools/audio/harvest.mjs        # regenerate src/js/content/sounds-data.js
pnpx gulp build
```

## Re-deriving everything from scratch

```sh
node tools/audio/analyze.mjs        # rebuild analysis.json from the originals
node tools/audio/briefs.mjs         # rebuild briefs.json + groups.json
# (re-run the synth-workflow to regenerate recipes), then:
node tools/audio/harvest.mjs
```

Music beds and human/movie voice clips are intentionally **original / abstract
synth stand-ins**, not reproductions of the source audio, so their spectral
distance is looser by design.
