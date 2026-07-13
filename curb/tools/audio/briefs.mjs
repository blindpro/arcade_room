// Build per-sound briefs: role + loop flag + which vehicles use it + features.
import { readFileSync, writeFileSync } from 'node:fs';
const A = JSON.parse(readFileSync(new URL('./analysis.json', import.meta.url), 'utf8'));

// role: what the sound IS, to guide the synth. 'voice' = human/movie sample we
// must NOT reproduce -> design an abstract stylized synth stand-in.
const ROLE = {
  // channel-1 engines (loop)
  auto1: ['engine', 'Generic 4-cylinder car engine idle/drive. Used by police, pickup, sander, rust, pink, square cars, ghostbusters car. The workhorse engine.'],
  scheurkar: ['engine', 'Aggressive racing/screeching car engine, revving hard. Used by boom-car, Spanish car, Batmobile. Louder, brighter, more buzz than auto1.'],
  pruttelauto: ['engine', 'Sputtering, putt-putt little old car engine (uneven firing). Orange wagon.'],
  belmobiel: ['engine', 'Small mobile/scooter-ish engine for the "phone car". Mid buzzy.'],
  motorloop: ['engine', 'Motorbike engine, low rumbling with closely-spaced firing partials around 97 Hz.'],
  bootloop: ['engine', 'Boat / outboard motor chugging on water, low and watery.'],
  tjoekbel: ['engine', 'Steam-train chug + bell ("tjoek-tjoek" + bell ding). Locomotive bed loop.'],
  harmonie: ['music', 'Marching brass band / fanfare loop (oompah). Melodic, brassy. Used by the fanfare float. Compose an ORIGINAL short brassy oompah loop in a similar register; do NOT copy any tune.'],
  ghosty: ['engine', 'Ghost wail / spooky hollow moan loop, slow vibrato. Tonal ~140 Hz with vowel formants.'],
  ufo2: ['engine', 'UFO hum / sci-fi oscillating drone loop. Warbling.'],
  shark: ['engine', 'Menacing low approaching swell (Jaws-like) loop. Very low, ominous.'],
  olistamp: ['engine', 'Heavy elephant footstep stomps loop (also the warthog body). Low thuddy rhythmic.'],
  driveback01: ['engine', 'A driving-car engine bed for the "drive02" car. Mid car engine.'],
  // channel-2 beds (loop)
  sirene: ['siren', 'Police two-tone siren wail, ~2.4 kHz cluster. Classic up/down wail.'],
  boemcar: ['bed', 'Boom-car subwoofer bass thump loop (doof-doof). Very low, rhythmic bass.'],
  quepasa: ['voice', 'A shouted Spanish phrase loop ("que pasa") from the Spanish car. Make an abstract rhythmic vowel-formant vocal stand-in, NOT speech.'],
  schetenloop: ['fart', 'Long looping flatulence (warthog 999 / burp mode). Wet buzzy low splutter with random wobble.'],
  // channel-2 one-shots: horns / voices
  toeter1: ['horn', 'Short car horn honk, a two-note dyad (~328 + 447 Hz) with buzzy harmonics.'],
  toeter2: ['horn', 'Alternate car horn honk, slightly different pitch/timbre from toeter1.'],
  treinhorn: ['horn', 'Deep train air-horn blast, low and powerful, long sustain.'],
  boottoeter: ['horn', 'Boat fog-horn, low broad honk.'],
  leader: ['voice', 'UFO "take me to your leader" alien voice clip. Abstract robotic/ring-mod formant gesture, NOT speech.'],
  phone: ['horn', 'Mobile phone ringtone (the bel-car). A cheerful melodic ring — synthesize a short original ringtone arpeggio.'],
  batmanclip: ['voice', 'A Batman movie/voice clip. Abstract heroic brass-y sting stand-in, NOT the actual clip.'],
  gbustclip2: ['voice', 'A Ghostbusters movie/voice clip. Abstract spooky vocal sting stand-in, NOT the actual clip.'],
  olifant: ['horn', 'Elephant trumpet blast (rising brassy bray). One-shot.'],
  driveleo1: ['voice', 'A shouted catchphrase voice clip variant 1 (drive car). Abstract vowel-shout stand-in, NOT speech.'],
  driveleo2: ['voice', 'Shouted catchphrase voice clip variant 2. Abstract vowel-shout stand-in.'],
  driveleo3: ['voice', 'Shouted catchphrase voice clip variant 3. Abstract vowel-shout stand-in.'],
  // footsteps
  i1: ['footstep', 'Hedgehog footstep 1: short soft low thump/scuff (~0.25 s).'],
  i2: ['footstep', 'Hedgehog footstep 2 (slightly different pitch).'],
  i3: ['footstep', 'Hedgehog footstep 3.'],
  i4: ['footstep', 'Hedgehog footstep 4.'],
  i5: ['footstep', 'Hedgehog footstep 5.'],
  // outcomes
  win: ['jingle', 'Happy success chime when you reach a curb (+100). A short rising 4-note arpeggio (~619->931->1244->1863 Hz), bright bell/marimba timbre.'],
  lose: ['splat', 'Death "splat"/squish when hit by a vehicle. Bright noisy burst with a quick downward pitch — comic squash.'],
  // burps (oneshot family, replace win in burp mode)
  ...Object.fromEntries(Array.from({ length: 17 }, (_, i) => [
    `burp${i + 1}`,
    ['burp', `Comic belch variant ${i + 1}. Voiced low buzzy burst (~80-200 Hz fundamental) with throaty noise and a short wet wobble. Each variant differs slightly in pitch/length/roughness.`],
  ])),
  // music beds (loop) — ORIGINAL compositions, not copies
  music: ['music', 'Upbeat, slightly goofy arcade title+gameplay music loop (plays under the round). Bouncy bass + simple lead, retro game feel. Compose an ORIGINAL ~2 s loop; do NOT reproduce the original melody.'],
  theburbgamemix: ['music', 'Burp-mode music bed: a sillier/funkier variant of the main loop. Compose an ORIGINAL ~2 s loop.'],
};

// which cars use each sound (from objects.ts), for flavor
const USED_BY = {
  auto1: 'police, pickup, sander, rust, pink, square, ghostbusters',
  scheurkar: 'boom-car, Spanish car, Batmobile', pruttelauto: 'orange wagon',
  belmobiel: 'phone-car', motorloop: 'motorbike', tjoekbel: 'locomotive',
  harmonie: 'fanfare float', ghosty: 'ghost', ufo2: 'UFO', shark: 'shark',
  olistamp: 'elephant + warthog', driveback01: 'drive car', bootloop: 'boat',
  sirene: 'police', boemcar: 'boom-car', quepasa: 'Spanish car', schetenloop: 'warthog',
  toeter1: 'pickup/sander/pink', toeter2: 'orange/rust/square', treinhorn: 'locomotive',
  boottoeter: 'boat', leader: 'UFO', phone: 'phone-car', batmanclip: 'Batmobile',
  gbustclip2: 'ghostbusters', olifant: 'elephant', olistamp: 'elephant/warthog',
};

const LOOP = new Set([
  'auto1', 'scheurkar', 'pruttelauto', 'belmobiel', 'motorloop', 'bootloop',
  'tjoekbel', 'harmonie', 'ghosty', 'ufo2', 'shark', 'olistamp', 'driveback01',
  'sirene', 'quepasa', 'boemcar', 'schetenloop', 'music', 'theburbgamemix',
]);

const SKIP = new Set(['shark_2815', '_hiscoretype', '_the_curb1', 'theburpgame2']); // dupes / unused-in-port

const briefs = {};
for (const name of Object.keys(ROLE)) {
  if (SKIP.has(name)) continue;
  const a = A[name];
  briefs[name] = {
    name,
    role: ROLE[name][0],
    description: ROLE[name][1],
    usedBy: USED_BY[name] || '',
    kind: LOOP.has(name) ? 'loop' : 'oneshot',
    durationS: a ? a.durationS : null,
    target: a ? {
      centroidHz: a.spectralCentroidHz, flatness: a.spectralFlatness,
      sustainedFraction: a.sustainedFraction, attackMs: a.attackMs,
      topPeaksHz: a.topPeaksHz, bandEnergy: a.bandEnergy,
    } : null,
  };
}
writeFileSync(new URL('./briefs.json', import.meta.url), JSON.stringify(briefs, null, 2));
console.log('wrote briefs.json for', Object.keys(briefs).length, 'sounds');
// group assignment for the workflow
const groups = {
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
};
writeFileSync(new URL('./groups.json', import.meta.url), JSON.stringify(groups, null, 2));
const all = Object.values(groups).flat();
console.log('groups total', all.length, 'sounds across', Object.keys(groups).length, 'agents');
