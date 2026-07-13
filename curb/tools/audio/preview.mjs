// Render A/B audition montages: each synthesised recipe next to the original
// sample, in the same order, so they can be compared by ear.
//   node tools/audio/preview.mjs [outDir]
// Writes <outDir>/synth.wav and <outDir>/original.wav (mono 22050).
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderRecipe } from './render.mjs';
import { SR, decodeMp3 } from './feat.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] || join(here, 'preview');
mkdirSync(outDir, { recursive: true });
const recipesDir = join(here, 'recipes');
const origDir = '/home/curbgame/public/sounds';

const names = readdirSync(recipesDir).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).sort();

function wav(int16) {
  const dataLen = int16.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataLen, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < int16.length; i++) buf.writeInt16LE(int16[i], 44 + i * 2);
  return buf;
}
function toInt16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) { let v = f32[i]; v = v < -1 ? -1 : v > 1 ? 1 : v; out[i] = (v * 32767) | 0; }
  return out;
}
const gap = new Float32Array(Math.floor(SR * 0.4));
function montage(chunks) {
  let len = 0; for (const c of chunks) len += c.length + gap.length;
  const out = new Float32Array(len); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; o += gap.length; }
  return out;
}
function norm(f, peak = 0.9) {
  let p = 0; for (let i = 0; i < f.length; i++) p = Math.max(p, Math.abs(f[i]));
  if (p > 0) { const k = peak / p; for (let i = 0; i < f.length; i++) f[i] *= k; }
  return f;
}

const synthChunks = [], origChunks = [];
for (const name of names) {
  const recipe = JSON.parse(readFileSync(join(recipesDir, name + '.json'), 'utf8'));
  synthChunks.push(norm(renderRecipe(recipe)));
  try { origChunks.push(norm(decodeMp3(join(origDir, name + '.mp3'), 1))); }
  catch { origChunks.push(new Float32Array(Math.floor(SR * 0.5))); }
  process.stderr.write(`. ${name}\n`);
}
writeFileSync(join(outDir, 'synth.wav'), wav(toInt16(montage(synthChunks))));
writeFileSync(join(outDir, 'original.wav'), wav(toInt16(montage(origChunks))));
writeFileSync(join(outDir, 'order.txt'), names.join('\n') + '\n');
console.log(`wrote ${join(outDir, 'synth.wav')} and original.wav (${names.length} sounds, see order.txt)`);
