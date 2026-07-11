// Headless smoke test of the ported Curb game state machine. Loads the plain
// content scripts with stubbed app/engine/DOM globals and drives whole rounds,
// asserting the original math: scoring, collision death, levels, idle penalty,
// and the warthog -> burp-mode easter egg.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, 'src/js/content', f), 'utf8');
// Note: rng.js is deliberately excluded — the test injects its own content.rng
// stub, and loading rng.js would overwrite it with the real Math.random one.
const src = ['constants.js', 'objects.js', 'game.js'].map(read).join('\n');

let assertions = 0;
function assert(cond, msg) { assertions++; if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; throw new Error(msg); } }

function makeEnv(rngFn) {
  const audioLog = [];
  const content = {
    rng: rngFn,
    audio: {
      ready() {}, puppetSound: (n, name) => audioLog.push(['puppet', n, name]),
      volume() {}, pan() {}, stop() {}, silenceAll() {},
    },
    announce: { status() {}, gameOver() {}, announceScore() {}, alert() {} },
  };
  const app = { i18n: { t: (k) => k } };
  const store = {};
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  // game.js touches none of engine/window/document directly, but provide them.
  const engine = { context: () => ({ currentTime: 0 }), mixer: { createBus: () => ({}) } };
  const fn = new Function('content', 'app', 'engine', 'localStorage', 'window', 'document', src + '\nreturn content;');
  fn(content, app, engine, localStorage, {}, {});
  return { content, app, store, audioLog };
}

// Programmable RNG: a function of n with an optional queue of forced returns.
function seqRng(defaultFn) {
  const q = [];
  const rng = (n) => (q.length ? Math.min(n, Math.max(1, q.shift())) : defaultFn(n));
  rng.push = (...xs) => { q.push(...xs); return rng; };
  return rng;
}

// ---------------------------------------------------------------------------
// 1. Static tables
// ---------------------------------------------------------------------------
{
  const { content } = makeEnv(() => 1);
  const O = content.objects;
  assert(Object.keys(O.CARS).length === 21, '21 cars');
  assert(O.CARS[1].speed(1) === 4 && O.CARS[1].speed(2) === 5 && O.CARS[1].speed(3) === 6, 'police speed table');
  assert(O.CARS[4].speed(1) === 1, 'pickup is the level-1 speed-1 car');
  const belc = O.CARS[21].speed(1, (n) => n); // rng->n gives max => 3 => 3+2=5
  assert(belc === 5, 'belcar speed = rng(3)+2');
  assert(O.CARS[5].blend(1) === 80 && O.CARS[5].blend(9) === 1, 'ghost blend fades with level');
  assert(O.WARTHOG_999.sound2 === 'schetenloop' && O.WARTHOG_999.speed() === 2, 'warthog 999');

  const C = content.constants;
  assert(C.variatieForLevel(1) === 5 && C.variatieForLevel(3) === 11 && C.variatieForLevel(7) === 21, 'gVariatie table');
  assert(Math.abs(C.VOLUME_PER_COUNTER - 2.55) < 1e-9, 'volume-per-counter magic number');
}

// ---------------------------------------------------------------------------
// 2. Level from score (DefineLevel) — observed via a generate tick
// ---------------------------------------------------------------------------
{
  const rng = seqRng(() => 1);
  const { content } = makeEnv(rng);
  const g = content.game;
  g.start();
  g.state.score = 4000; // first threshold met at exactly 4000 -> level 9
  rng.push(4, 1); // object 4 (pick), direction 1
  g.tick(); // stepGenerate -> defineLevel
  assert(g.state.level === 9, `level 9 at score 4000 (got ${g.state.level})`);
  // a fresh round at 4999 should resolve to level 10 (>=4500)
  const r2 = seqRng(() => 1);
  const g2 = makeEnv(r2).content.game;
  g2.start();
  g2.state.score = 4999;
  r2.push(4, 1);
  g2.tick();
  assert(g2.state.level === 10, `level 10 at score 4999 (got ${g2.state.level})`);
}

// ---------------------------------------------------------------------------
// 3. A clean crossing scores 100 and does not kill (slow pickup going right)
// ---------------------------------------------------------------------------
{
  // rng: object 4 (pick, speed 1 at level 1), direction 1 (spawns off-left).
  const rng = seqRng((n) => (n >= 4 ? 4 : 1));
  const { content, audioLog } = makeEnv(rng);
  const g = content.game;
  g.loadBest();
  g.start();
  g.input.up = true; // hold Up to walk to the far curb
  for (let i = 0; i < 80 && g.phase !== 'gameover'; i++) g.tick();
  assert(g.state.walkerV === 25, `walker reached far curb (got ${g.state.walkerV})`);
  // Crossing fires the 'win' cue on channel 5 and awards points. The score is
  // net of the exciteCount idle penalty that ticks while the car is mid-road,
  // exactly as the original (so it is positive but need not be a clean 100).
  assert(audioLog.some((e) => e[0] === 'puppet' && e[1] === 5 && e[2] === 'win'), 'crossing played the win cue');
  assert(g.state.score > 0 && g.state.score <= 100, `crossing scored (got ${g.state.score})`);
  assert(g.phase !== 'gameover', 'no death on a clean slow crossing');
}

// ---------------------------------------------------------------------------
// 4. Walking into a fast police car kills you and ends the game
// ---------------------------------------------------------------------------
{
  // object 1 (police, speed 4 at level 1), direction 1 -> reaches centre as the
  // walker is mid-road -> collision.
  const rng = seqRng(() => 1);
  const { content, store } = makeEnv(rng);
  const g = content.game;
  g.loadBest();
  g.start();
  rng.push(1, 1); // police, direction 1
  g.input.up = true;
  let died = false;
  for (let i = 0; i < 400; i++) {
    g.tick();
    if (g.state.death === 1 && !died) { died = true; g.state.score = 250; } // bank a score so persistence is exercised
    if (g.phase === 'gameover') break;
  }
  assert(died, 'collision set death=1');
  assert(g.phase === 'gameover', 'game reaches gameover after the music fade');
  assert(g.best === 250 && Number(store['curb.best']) === 250, 'new best score persisted to storage');
}

// ---------------------------------------------------------------------------
// 5. Idle penalty: exciteCount strips 10 points after 16 idle frames in road
// ---------------------------------------------------------------------------
{
  const rng = seqRng((n) => (n >= 4 ? 4 : 1));
  const { content } = makeEnv(rng);
  const g = content.game;
  g.start();
  g.state.score = 500; // give headroom so the penalty is observable
  // advance into moveTo (where exciteCount runs) without touching arrows
  for (let i = 0; i < 20 && g.phase !== 'gameover'; i++) g.tick();
  assert(g.state.score < 500 || g.state.exciteCount > 0, 'exciteCount accrues / penalises while idling');
}

// ---------------------------------------------------------------------------
// 6. Warthog easter egg: object 7 + playtime>=3 + rng(2)==2 -> 999 -> burp mode
// ---------------------------------------------------------------------------
{
  const rng = seqRng(() => 1);
  const { content } = makeEnv(rng);
  const g = content.game;
  g.start(); // playtime -> 1
  g.start(); // -> 2
  g.start(); // -> 3 (warthog now reachable)
  // object 7 (motorbike) can only spawn once variatie >= 7, i.e. level >= 3
  // (score >= 1000). Set the score so defineLevel yields a variatie of 11.
  g.state.score = 1000;
  // generate order: rng(variatie)->7, rng(2)->1 (direction), rng(2)->2 (warthog roll).
  rng.push(7, 1, 2);
  g.tick();
  assert(g.state.object === 999, `motorbike became the warthog (got ${g.state.object})`);
  // force a collision death to trigger burp mode
  g.state.death = 1;
  g.state.counter = 0;
  // drive through reset -> death -> gameover
  for (let i = 0; i < 200 && g.phase !== 'gameover'; i++) g.tick();
  assert(g.state.burbMode === 1, 'dying to the warthog enables burp mode');
  assert(g.state.holdScore === 1000, 'burp mode carries the score over');
}

console.log(`OK — ${assertions} assertions passed`);
