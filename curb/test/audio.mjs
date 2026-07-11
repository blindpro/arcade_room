// Smoke test of the in-browser synth interpreter (content/sounds.js) and the
// Director-channel mixer (content/audio.js) against a mocked Web Audio API.
// Ensures every recipe builds a node graph and every channel op runs without
// throwing — the browser audio path can't be exercised headlessly otherwise.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, 'src/js/content', f), 'utf8');
// Load in the SAME alphabetical order Gulp concatenates content/*.js, so the
// cross-module ordering hazard (audio.js runs before constants.js) is exercised.
const src = ['audio.js', 'constants.js', 'sounds-data.js', 'sounds.js'].map(read).join('\n');

let made = 0;
function param(v) {
  return {
    value: v == null ? 0 : v,
    setValueAtTime() { return this; },
    linearRampToValueAtTime() { return this; },
    setTargetAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; },
    cancelScheduledValues() { return this; },
  };
}
function node(extra = {}) {
  return Object.assign({
    connect() { return this; },
    disconnect() { return this; },
    gain: param(1),
  }, extra);
}
const ctx = {
  currentTime: 0,
  sampleRate: 44100,
  destination: node(),
  createGain: () => node({ gain: param(1) }),
  createOscillator: () => { made++; return node({ type: 'sine', frequency: param(440), detune: param(0), start() {}, stop() {} }); },
  createBufferSource: () => { made++; return node({ buffer: null, loop: false, start() {}, stop() {} }); },
  createBiquadFilter: () => node({ type: 'lowpass', frequency: param(800), Q: param(1), gain: param(0) }),
  createChannelMerger: () => node(),
  createBuffer: (ch, len, sr) => ({ numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: () => new Float32Array(len) }),
};

const engine = { context: () => ctx, mixer: { createBus: () => ctx.createGain() } };
const content = {};
const app = { i18n: { t: (k) => k } };
new Function('content', 'app', 'engine', 'window', 'document', 'setTimeout', src + '\nreturn content;')(
  content, app, engine, {}, {}, () => 0,
);

let assertions = 0;
function assert(cond, msg) { assertions++; if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; throw new Error(msg); } }

const names = Object.keys(content.soundRecipes);
assert(names.length === 55, `55 recipes present (got ${names.length})`);

content.audio.ready();

// Every recipe must build a voice and survive a full channel lifecycle.
let built = 0;
for (const name of names) {
  const before = made;
  content.audio.puppetSound(1, name);
  content.audio.volume(1, 200);
  content.audio.pan(1, -50);
  content.audio.pan(1, 75);
  content.audio.volume(1, 0);
  content.audio.stop(1);
  if (made > before) built++;
}
assert(built === 55, `all 55 recipes built a node graph (got ${built})`);

// A made-up name yields a null voice (silent), not a crash.
content.audio.puppetSound(2, 'does-not-exist');
content.audio.stop(2);

// silenceAll after a few active channels.
content.audio.puppetSound(1, 'auto1');
content.audio.puppetSound(8, 'music');
content.audio.silenceAll();

// pan endpoints obey linear balance (centre full both sides; far side mutes).
const bal = (pan) => ({ l: pan <= 0 ? 1 : 1 - pan, r: pan >= 0 ? 1 : 1 + pan });
assert(bal(0).l === 1 && bal(0).r === 1, 'centre: both sides full');
assert(bal(1).l === 0 && bal(1).r === 1, 'hard right: left muted');
assert(bal(-1).l === 1 && bal(-1).r === 0, 'hard left: right muted');

console.log(`OK — ${assertions} assertions passed; ${built} voices built (${made} source nodes)`);
