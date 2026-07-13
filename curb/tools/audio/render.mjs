// Offline renderer for the Curb synth DSL. Mirrors the browser interpreter
// (content/sounds.js) closely enough to predict spectral features.
// A "recipe" describes one sound; renderRecipe -> mono Float32Array at SR.
import { SR, features, distance } from './feat.mjs';
import { readFileSync } from 'node:fs';

// deterministic PRNG so fitness is stable run-to-run
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shape(wave, ph) { // ph in radians
  switch (wave) {
    case 'sine': return Math.sin(ph);
    case 'triangle': return (2 / Math.PI) * Math.asin(Math.sin(ph));
    case 'square': return Math.sin(ph) >= 0 ? 1 : -1;
    case 'sawtooth': default: {
      const t = (ph / (2 * Math.PI)) % 1;
      return 2 * (t < 0 ? t + 1 : t) - 1;
    }
  }
}

// RBJ biquad coefficients
function biquad(type, f0, Q, gainDb, sr) {
  const w0 = 2 * Math.PI * Math.min(f0, sr * 0.49) / sr;
  const cw = Math.cos(w0), sw = Math.sin(w0);
  const alpha = sw / (2 * Math.max(0.0001, Q));
  const A = Math.pow(10, (gainDb || 0) / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lowpass': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'highpass': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'bandpass': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'peaking': b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
    default: b0 = 1; b1 = 0; b2 = 0; a0 = 1; a1 = 0; a2 = 0;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function envValue(env, t, total) {
  if (!env) return 1;
  const { a = 0.005, d = 0.05, s = 0.7, r = 0.1, peak = 1 } = env;
  const relStart = total - r;
  if (t < a) return peak * (t / Math.max(1e-5, a));
  if (t < a + d) return peak + (s * peak - peak) * ((t - a) / Math.max(1e-5, d));
  if (t < relStart) return s * peak;
  return Math.max(0, s * peak * (1 - (t - relStart) / Math.max(1e-5, r)));
}

function renderLayer(layer, dur, rng) {
  const n = Math.floor(dur * SR);
  const out = new Float32Array(n);
  const g = layer.gain == null ? 1 : layer.gain;

  if (layer.type === 'noise') {
    const color = layer.color || 'white';
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; // pink state
    let last = 0; // brown
    for (let i = 0; i < n; i++) {
      const white = rng() * 2 - 1;
      let v;
      if (color === 'pink') {
        b0 = 0.99886 * b0 + white * 0.0555179; b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520; b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522; b5 = -0.7616 * b5 - white * 0.0168980;
        v = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11; b6 = white * 0.115926;
      } else if (color === 'brown') {
        last = (last + 0.02 * white) / 1.02; v = last * 3.5;
      } else v = white;
      out[i] = v * g;
    }
  } else {
    // oscillator(s) with optional unison
    const detunes = [0, ...(layer.unison || [])];
    const phases = detunes.map(() => 0);
    const wave = layer.wave || 'sine';
    const base = layer.freq || 220;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let f = base;
      if (layer.glideTo != null) {
        const gt = layer.glideTime || dur;
        const k = Math.min(1, t / Math.max(1e-4, gt));
        f = base + (layer.glideTo - base) * k;
      }
      if (layer.pitchLfoCents) f *= Math.pow(2, (layer.pitchLfoCents / 1200) * Math.sin(2 * Math.PI * (layer.pitchLfoRate || 5) * t));
      let s = 0;
      for (let u = 0; u < detunes.length; u++) {
        const fu = f * Math.pow(2, detunes[u] / 1200);
        phases[u] += (2 * Math.PI * fu) / SR;
        s += shape(wave, phases[u]);
      }
      s /= detunes.length;
      out[i] = s * g;
    }
  }

  // amplitude LFO (tremolo / chug / wobble)
  if (layer.ampLfoDepth) {
    const rate = layer.ampLfoRate || 6, depth = Math.min(1, layer.ampLfoDepth), w = layer.ampLfoWave || 'sine';
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const m = (shape(w === 'saw' ? 'sawtooth' : w, 2 * Math.PI * rate * t) + 1) / 2; // 0..1
      out[i] *= (1 - depth) + depth * m;
    }
  }

  // filter (optionally swept)
  if (layer.filter) {
    const { type, freq, q = 1, gain = 0 } = layer.filter;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    let c = biquad(type, freq, q, gain, SR);
    const swept = layer.filterLfoOct ? true : false;
    for (let i = 0; i < n; i++) {
      if (swept && (i & 63) === 0) {
        const t = i / SR;
        const f = freq * Math.pow(2, layer.filterLfoOct * Math.sin(2 * Math.PI * (layer.filterLfoRate || 2) * t));
        c = biquad(type, f, q, gain, SR);
      }
      const x = out[i];
      const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      out[i] = y;
    }
  }

  // amplitude envelope
  if (layer.env) for (let i = 0; i < n; i++) out[i] *= envValue(layer.env, i / SR, dur);

  return out;
}

export function renderRecipe(recipe) {
  const dur = recipe.dur || (recipe.kind === 'loop' ? 2 : 1);
  const n = Math.floor(dur * SR);
  const mix = new Float32Array(n);
  const rng = mulberry32(0x1234abcd);
  for (const layer of recipe.layers || []) {
    const buf = renderLayer(layer, dur, rng);
    for (let i = 0; i < n; i++) mix[i] += buf[i];
  }
  // sequence notes
  for (const note of recipe.seq || []) {
    const start = Math.floor((note.t || 0) * SR);
    const ndur = note.dur || 0.2;
    const layer = { type: 'osc', wave: note.wave || 'sine', freq: note.freq, gain: note.gain == null ? 0.6 : note.gain, env: note.env || { a: 0.005, d: ndur * 0.3, s: 0.6, r: ndur * 0.5, peak: 1 }, filter: note.filter };
    const buf = renderLayer(layer, ndur, rng);
    for (let i = 0; i < buf.length && start + i < n; i++) mix[start + i] += buf[i];
  }
  const g = recipe.gain == null ? 1 : recipe.gain;
  // normalize to peak ~0.9 then apply recipe gain trim (so band/centroid features are level-independent anyway)
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(mix[i]));
  const norm = pk > 0 ? 0.9 / pk : 1;
  for (let i = 0; i < n; i++) mix[i] *= norm * g;
  return mix;
}

export function evaluate(recipe, target) {
  const pcm = renderRecipe(recipe);
  const feat = features(pcm);
  const dist = distance(feat, target, { loop: recipe.kind === 'loop' });
  return { feat, dist };
}

// CLI: node render.mjs <recipe.json> [targetName]  (reads analysis.json for target)
if (import.meta.url === `file://${process.argv[1]}`) {
  const recipe = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const targetName = process.argv[3];
  const analysis = JSON.parse(readFileSync(new URL('./analysis.json', import.meta.url), 'utf8'));
  const target = analysis[targetName];
  const { feat, dist } = evaluate(recipe, target);
  console.log('TARGET  ', JSON.stringify(pick(target)));
  console.log('CANDIDATE', JSON.stringify(pick(feat)));
  console.log('DISTANCE', dist.score, JSON.stringify(dist.parts));
}
function pick(f) {
  return { centroid: f.spectralCentroidHz, flat: f.spectralFlatness, sust: f.sustainedFraction, attackMs: f.attackMs, bands: f.bandEnergy, peaks: (f.topPeaksHz || []).slice(0, 5) };
}
