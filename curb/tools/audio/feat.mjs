// Shared spectral feature extraction + comparison (SR 22050, mono Float32).
import { execFileSync } from 'node:child_process';

export const SR = 22050;

export function decodeMp3(path, channels = 1) {
  const buf = execFileSync('ffmpeg', [
    '-v', 'quiet', '-i', path, '-ac', String(channels), '-ar', String(SR),
    '-f', 'f32le', '-acodec', 'pcm_f32le', 'pipe:1',
  ], { maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

const N = 4096;
const hann = new Float32Array(N);
for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));

function avgSpectrum(x) {
  const hop = N / 2, mag = new Float64Array(N / 2);
  let frames = 0;
  for (let off = 0; off + N <= x.length; off += hop) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[off + i] * hann[i];
    fft(re, im);
    for (let i = 0; i < N / 2; i++) mag[i] += Math.hypot(re[i], im[i]);
    frames++;
  }
  if (frames === 0) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < Math.min(N, x.length); i++) re[i] = x[i] * hann[i];
    fft(re, im);
    for (let i = 0; i < N / 2; i++) mag[i] += Math.hypot(re[i], im[i]);
    frames = 1;
  }
  for (let i = 0; i < N / 2; i++) mag[i] /= frames;
  return mag;
}

export function features(x) {
  let peak = 0, sum2 = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; sum2 += x[i] * x[i]; }
  const rms = Math.sqrt(sum2 / Math.max(1, x.length));
  const dur = x.length / SR;

  const eh = Math.floor(SR * 0.023), env = [];
  for (let off = 0; off + eh <= x.length; off += eh) {
    let s = 0; for (let i = 0; i < eh; i++) s += x[off + i] * x[off + i];
    env.push(Math.sqrt(s / eh));
  }
  const envPeak = Math.max(...env, 1e-9);
  const normEnv = env.map((e) => e / envPeak);
  const sustained = normEnv.filter((e) => e > 0.5).length / Math.max(1, normEnv.length);
  let attackFrames = normEnv.findIndex((e) => e >= 0.9);
  const attackMs = (attackFrames < 0 ? 0 : attackFrames) * 23;

  const mag = avgSpectrum(x);
  const binHz = SR / N;
  let total = 0, centroidNum = 0, logSum = 0, arithSum = 0, count = 0;
  for (let i = 1; i < mag.length; i++) {
    const f = i * binHz;
    if (f < 40 || f > 9000) continue;
    total += mag[i]; centroidNum += f * mag[i];
    logSum += Math.log(mag[i] + 1e-12); arithSum += mag[i]; count++;
  }
  const centroid = total > 0 ? centroidNum / total : 0;
  const flatness = arithSum > 0 ? Math.exp(logSum / count) / (arithSum / count) : 1;

  const peaks = [];
  for (let i = 2; i < mag.length - 2; i++) {
    const f = i * binHz;
    if (f < 50 || f > 6000) continue;
    if (mag[i] > mag[i - 1] && mag[i] > mag[i + 1] && mag[i] >= mag[i - 2] && mag[i] >= mag[i + 2]) peaks.push({ f: Math.round(f), m: mag[i] });
  }
  peaks.sort((a, b) => b.m - a.m);
  const maxM = peaks.length ? peaks[0].m : 1;
  const topPeaksHz = peaks.slice(0, 8).map((p) => ({ hz: p.f, rel: +(p.m / maxM).toFixed(3) }));

  const bands = { sub_40_120: 0, low_120_350: 0, lowmid_350_800: 0, mid_800_2k: 0, hi_2k_5k: 0, air_5k_9k: 0 };
  for (let i = 1; i < mag.length; i++) {
    const f = i * binHz, m = mag[i];
    if (f < 40) continue;
    else if (f < 120) bands.sub_40_120 += m;
    else if (f < 350) bands.low_120_350 += m;
    else if (f < 800) bands.lowmid_350_800 += m;
    else if (f < 2000) bands.mid_800_2k += m;
    else if (f < 5000) bands.hi_2k_5k += m;
    else if (f < 9000) bands.air_5k_9k += m;
  }
  const bt = Object.values(bands).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(bands)) bands[k] = +(bands[k] / bt).toFixed(3);

  return {
    durationS: +dur.toFixed(2), rms: +rms.toFixed(4), peak: +peak.toFixed(3),
    sustainedFraction: +sustained.toFixed(2), attackMs,
    spectralCentroidHz: Math.round(centroid), spectralFlatness: +flatness.toFixed(3),
    topPeaksHz, bandEnergy: bands,
  };
}

const BANDS = ['sub_40_120', 'low_120_350', 'lowmid_350_800', 'mid_800_2k', 'hi_2k_5k', 'air_5k_9k'];

// Distance between a candidate's features and a target's features. Lower = closer.
// Weights adapt to tonal (peaks matter) vs noisy (band shape matters).
// opts.loop=true: the in-game volume ramp owns the attack/sustain envelope, so
// the steady looping voice should not be judged on attack or coarse sustain.
export function distance(cand, target, opts = {}) {
  const tonal = target.spectralFlatness < 0.3;
  // band-energy L1
  let bandL1 = 0;
  for (const b of BANDS) bandL1 += Math.abs((cand.bandEnergy[b] || 0) - (target.bandEnergy[b] || 0));
  // log-centroid ratio
  const cc = Math.max(40, cand.spectralCentroidHz), tc = Math.max(40, target.spectralCentroidHz);
  const centroidD = Math.abs(Math.log2(cc / tc));
  // flatness
  const flatD = Math.abs(cand.spectralFlatness - target.spectralFlatness);
  // sustain + attack
  const sustD = Math.abs(cand.sustainedFraction - target.sustainedFraction);
  const attackD = Math.min(1, Math.abs(cand.attackMs - target.attackMs) / 800);
  // peak alignment: for each top target peak, nearest candidate peak (semitone error)
  let peakD = 0;
  if (tonal && target.topPeaksHz.length) {
    let n = 0;
    for (const tp of target.topPeaksHz.slice(0, 4)) {
      let best = 1.5;
      for (const cp of cand.topPeaksHz) best = Math.min(best, Math.abs(Math.log2(cp.hz / tp.hz)) * 12 / 6); // 6 semitones -> 1.0
      peakD += best * tp.rel; n += tp.rel;
    }
    peakD = n > 0 ? peakD / n : 1;
  }
  let w = tonal
    ? { band: 1.0, centroid: 1.2, flat: 1.5, sust: 0.6, attack: 0.4, peak: 2.5 }
    : { band: 2.5, centroid: 1.5, flat: 2.0, sust: 0.8, attack: 0.5, peak: 0 };
  if (opts.loop) w = { ...w, attack: 0, sust: 0.15 };
  const score = w.band * bandL1 + w.centroid * centroidD + w.flat * flatD +
                w.sust * sustD + w.attack * attackD + w.peak * peakD;
  return {
    score: +score.toFixed(4),
    parts: { bandL1: +bandL1.toFixed(3), centroidD: +centroidD.toFixed(3), flatD: +flatD.toFixed(3), sustD: +sustD.toFixed(3), attackD: +attackD.toFixed(3), peakD: +peakD.toFixed(3) },
  };
}
