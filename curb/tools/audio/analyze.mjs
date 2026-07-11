// Spectral characterization of the original Curb Game sounds.
// Decodes each mp3 via ffmpeg to mono + stereo f32le, runs a Hann-windowed
// averaged FFT, and reports the features that drive synth recreation.
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SR = 22050;
const DIR = '/home/curbgame/public/sounds';
const files = readdirSync(DIR).filter((f) => f.endsWith('.mp3')).sort();

function decode(path, channels) {
  const buf = execFileSync('ffmpeg', [
    '-v', 'quiet', '-i', path, '-ac', String(channels), '-ar', String(SR),
    '-f', 'f32le', '-acodec', 'pcm_f32le', 'pipe:1',
  ], { maxBuffer: 1 << 28 });
  const f = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  return f;
}

// iterative radix-2 FFT (in-place), re/im arrays length N (power of 2)
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
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
  const hop = N / 2;
  const mag = new Float64Array(N / 2);
  let frames = 0;
  for (let off = 0; off + N <= x.length; off += hop) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[off + i] * hann[i];
    fft(re, im);
    for (let i = 0; i < N / 2; i++) mag[i] += Math.hypot(re[i], im[i]);
    frames++;
  }
  if (frames === 0) {
    // short clip: single zero-padded frame
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < Math.min(N, x.length); i++) re[i] = x[i] * hann[i];
    fft(re, im);
    for (let i = 0; i < N / 2; i++) mag[i] += Math.hypot(re[i], im[i]);
    frames = 1;
  }
  for (let i = 0; i < N / 2; i++) mag[i] /= frames;
  return mag;
}

function features(x) {
  // time-domain
  let peak = 0, sum2 = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; sum2 += x[i] * x[i]; }
  const rms = Math.sqrt(sum2 / Math.max(1, x.length));
  const dur = x.length / SR;

  // temporal envelope, 23ms hops
  const eh = Math.floor(SR * 0.023);
  const env = [];
  for (let off = 0; off + eh <= x.length; off += eh) {
    let s = 0; for (let i = 0; i < eh; i++) s += x[off + i] * x[off + i];
    env.push(Math.sqrt(s / eh));
  }
  const envPeak = Math.max(...env, 1e-9);
  const normEnv = env.map((e) => e / envPeak);
  // steadiness: fraction of envelope frames within 0.5..1.0 of peak (sustained vs transient)
  const sustained = normEnv.filter((e) => e > 0.5).length / Math.max(1, normEnv.length);
  // attack time to 90% of peak
  let attackFrames = normEnv.findIndex((e) => e >= 0.9);
  const attackMs = (attackFrames < 0 ? 0 : attackFrames) * 23;

  // spectrum
  const mag = avgSpectrum(x);
  const binHz = SR / N;
  let total = 0, centroidNum = 0;
  let logSum = 0, arithSum = 0, count = 0;
  for (let i = 1; i < mag.length; i++) {
    const f = i * binHz;
    if (f < 40 || f > 9000) continue;
    total += mag[i];
    centroidNum += f * mag[i];
    logSum += Math.log(mag[i] + 1e-12);
    arithSum += mag[i];
    count++;
  }
  const centroid = total > 0 ? centroidNum / total : 0;
  const flatness = arithSum > 0 ? Math.exp(logSum / count) / (arithSum / count) : 1; // ~0 tonal, ~1 noise

  // peak picking: local maxima, sorted by magnitude, in 40..6000 Hz
  const peaks = [];
  for (let i = 2; i < mag.length - 2; i++) {
    const f = i * binHz;
    if (f < 50 || f > 6000) continue;
    if (mag[i] > mag[i - 1] && mag[i] > mag[i + 1] && mag[i] >= mag[i - 2] && mag[i] >= mag[i + 2]) {
      peaks.push({ f: Math.round(f), m: mag[i] });
    }
  }
  peaks.sort((a, b) => b.m - a.m);
  const maxM = peaks.length ? peaks[0].m : 1;
  const topPeaks = peaks.slice(0, 8).map((p) => ({ hz: p.f, rel: +(p.m / maxM).toFixed(3) }));

  // spectral band energy distribution (relative)
  const bands = { sub_40_120: 0, low_120_350: 0, lowmid_350_800: 0, mid_800_2k: 0, hi_2k_5k: 0, air_5k_9k: 0 };
  for (let i = 1; i < mag.length; i++) {
    const f = i * binHz; const m = mag[i];
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
    durationS: +dur.toFixed(2),
    rms: +rms.toFixed(4),
    peak: +peak.toFixed(3),
    sustainedFraction: +sustained.toFixed(2),
    attackMs,
    spectralCentroidHz: Math.round(centroid),
    spectralFlatness: +flatness.toFixed(3),
    topPeaksHz: topPeaks,
    bandEnergy: bands,
  };
}

const out = {};
for (const file of files) {
  const name = file.replace(/\.mp3$/, '');
  const path = join(DIR, file);
  try {
    const mono = decode(path, 1);
    const f = features(mono);
    // stereo balance
    const st = decode(path, 2);
    let l2 = 0, r2 = 0;
    for (let i = 0; i + 1 < st.length; i += 2) { l2 += st[i] * st[i]; r2 += st[i + 1] * st[i + 1]; }
    const lr = Math.sqrt(l2), rr = Math.sqrt(r2);
    f.stereoBalance = lr + rr > 0 ? +((rr - lr) / (rr + lr)).toFixed(2) : 0; // -1 left .. +1 right
    out[name] = f;
    process.stderr.write(`. ${name}\n`);
  } catch (e) {
    out[name] = { error: String(e).slice(0, 120) };
    process.stderr.write(`! ${name}: ${e}\n`);
  }
}
writeFileSync('/tmp/claude-0/-home-gst-curb/083f383a-f4a6-4ed0-bd58-b46d276332af/scratchpad/analysis.json', JSON.stringify(out, null, 2));
process.stderr.write(`\nWrote analysis.json (${Object.keys(out).length} sounds)\n`);
