# Games we could add

Scratch notes for you — read and delete. Written after reading the packaging
setup and walking the source of `pong`, `surge`, `deekout`, `roadsplat`,
`marble`, `hammer`, `curb`, `fire` and `neverStop`.

---

## 1. What this arcade actually is (the constraint that shapes every idea below)

Worth stating plainly, because it rules out about half the obvious answers:

**There is no visual gameplay. None of the 43 games render anything.** I grepped
every `src/` tree for a 2D canvas context — the only hits are
`app/overlaySupport.js`, which exists for Steam overlay compatibility, not for
drawing. Every game is a **blind-accessible audio game** built on
[syngen](https://github.com/nicross/syngen), nicross's procedural Web Audio
engine. The screen is HTML: menus, a manual, a `.js-announcer` live region for
the screen reader. The *game* is entirely spatialized synthesized sound.

So when you say "shooters or other 2D-like games", the port question is never
"can we draw this" — it's **"can a player hold this game's state in their head
from sound alone?"** That's the filter I applied to everything below.

### The shape of a game in this repo

Each game is a self-contained copy of the syngen template:

```
<game>/
  src/js/
    engine.js            const engine = syngen
    app/                 shared framework — screens, controls, storage, i18n
      screen/            splash, lobby, game, help, language, learnSounds
      controls/          keyboard.js, gamepad.js, mouse.js, mappings.js
      settings.js        register/compute/persist a preference
    content/             THE GAME. this is the only part you write
      game.js            start/stop/update(dt) + input actions
      audio.js           every sound, spatialized
      math.js, physics.js, scoring.js, announcer.js, ...
  public/                index.html, manual.html + gulp output
  Gulpfile.js            concat -> iife -> uglify -> public/scripts.min.js
```

`content.game` exposes `start()`, `stop()`, `update(e)` where `e.delta` is dt,
and action methods the game screen calls from key handlers. `app/` is
boilerplate you copy forward untouched. **A new game is realistically
`src/js/content/*` plus a game screen and a manual.** That's why this repo has
43 of them.

### Things worth reusing rather than rewriting

| Want | Steal from |
|---|---|
| Online multiplayer | Two separate stacks. `<game>/src/js/app/net.js` is the mature one — PeerJS over a self-hosted coturn TURN server (`turn.oriolgomez.com`), spoken room codes, host-authoritative snapshots, lobby, heartbeats — in **bumper, dogfight, tennis, dynamic_beatstar**. `pong/src/js/network.js` is a separate implementation whose distinctive trick is an audio/announcer **relay**, so each peer replays events from its own listener perspective. `racing` has a third (`public/js/net.js`); it isn't a syngen-template game at all. |
| Power-ups with timed effects + audio beds | `pong/src/js/content/powerup.js` (`POWERUP_ACTIVE_SPEC` is a nice pattern: per-effect osc type, freq, LFO) |
| Team rosters / tag-in-tag-out | `pong/src/js/content/teamManager.js` |
| Spatialized enemies, bullets, coins, scoring | `deekout/src/js/content/` — the most complete "arena shooter" content dir already present |
| Lane-based endless runner | `surge/` (5 lanes, pan = lane) |
| Grid/board games | `decant`, `echoes`, `tone48`, `drawing_board` all share a `board.js` + `events.js` shape |
| Vehicle/track feel | `neverStop` (`car.js`, `track.js`, `cones.js`), `roadsplat` (`vehicles.js`) |

### Gotchas to know before adding anything

- `public/scripts.min.js` and `public/styles.min.css` are **gulp output and
  gitignored**. A game without them is a menu entry that opens a blank screen.
  Run `build_all.bat` before packaging. (`npm run package` now refuses to
  package unbuilt games instead of silently shipping them dead.)
- High scores go through `window.ElectronApi.readHighScores()` /
  `writeHighScores()`; `electron/main.js` derives the per-game file from the
  renderer URL, so each game gets its own automatically.
- `app.i18n` is wired in every game — new strings should go through it.
- Games are discovered by directory scan, in both `electron/build.js` and
  `electron/main.js`. Adding a game is: make the folder, build it. No registry.
- Prefix a directory with `!` to hide it from the launcher (already supported).

---

## 2. What's already covered

So you don't propose a duplicate to yourself later. Retro ground already taken:

Pong · Breakout · Asteroids · Space Invaders · Missile Command · Pac-Man ·
Berzerk · Tempest (`tube`) · Frogger (`roadsplat`, plus `curb`, a Director port) ·
Lunar Lander · Crazy Climber (`climber`) · Marble Madness (`marble`) ·
Pinball · Air hockey · Tennis · Snake · Flappy Bird · Simon-ish tone work
(`tone48`) · Whac/strength-timing (`hammer`) · Sokoban (`warehouse_shift`) ·
Peg solitaire (`circulocos`/Vault) · Dogfight · Racing · Rhythm (×2) ·
Endless runner (`surge`) · Tunnel run (`pipe`) · Skydive · Twin-stick arena
(`deekout`) · Firefighting (`fire`) · Math drills (`mathstar`)

**The notable retro gaps: no Tetris. No Centipede. No Battlezone. No
sonar/submarine game. No Minesweeper. No Defender. No Gauntlet. No Track &
Field. No head-to-head party games besides pong.**

---

## 3. Shooters

You asked for these specifically. The trick with an audio shooter is that
"aim" has to be **one-dimensional and quantized** — a continuous 2D crosshair is
unplayable by ear. Every good one below turns aiming into *lanes, angles, or
rings*, so the player is choosing between a small number of discrete, clearly
pitched positions.

### 3.1 Centipede — "Descent"
**Reference:** Centipede / Millipede (1980).
**Loop:** A segmented centipede walks down a lane grid toward you. You slide
along the bottom row and fire straight up. Shooting a middle segment splits it
into two independent chains that now come at you from both sides. Mushrooms
block shots and force the chain to turn.
**Audio:** Each segment is a voice; the whole centipede is a **chord that
descends in pitch as it gets closer**. Splitting it audibly forks the chord into
two clusters panned apart — you *hear* the split happen, which is the entire
joy of Centipede. Mushrooms are short damped clicks when a shot dies on one.
**Controls:** left/right + fire. That's it.
**Why it ports:** the escalating panic is carried by pitch and density, not
sprites. And the split mechanic is more legible in audio than on screen.
**Effort:** medium. Reuse `deekout`'s bullet/enemy modules.

### 3.2 Defender — "Skyhook"
**Reference:** Defender (1981).
**Loop:** Side-scrolling. Landers descend to abduct humans from the ground; you
patrol left and right, shoot landers, and **catch a falling human before it
hits the ground**. Lose all humans and the planet goes.
**Audio:** This is a *radar* game, and audio radar is better than visual radar.
A slow sweep tone tells you what's off-screen to your left and right (pitch =
distance, pan = side). An abduction in progress is a rising siren — the most
important sound in the game — that you chase down. The catch is a satisfying
downward whoosh resolving to a thunk.
**Why it ports:** Defender's real skill is *attention management across a wide
field you can't fully see*. That's what stereo does natively.
**Effort:** medium-high. The most "arcade-feeling" thing on this list.

### 3.3 Sea Wolf / Silent Service — "Sonar"  ✅ BUILT — see `sea_wolf/`
**Reference:** Sea Wolf (1976), Silent Hunter.
**Loop:** You're a submarine. Contacts move across your bearing. Ping to reveal
range and bearing, then fire a torpedo on a **lead** — you must fire ahead of
where the target is going, because the torpedo takes time. Pinging reveals you
too, so destroyers start hunting *you*.
**Audio:** The genuinely native idea on this list. Ping → return echo, delay =
range, pan = bearing, doppler = closing speed. Depth charges are a slow
descending whistle and you dive to evade.
**Why it ports:** it is *literally an audio game already*. If you build one
thing from this doc, this is the one with no compromise anywhere.
**Effort:** medium. Mostly `audio.js` craft, light physics.

**Built, then rebuilt.** It lives in `sea_wolf/`.

The first build had you sitting still on a forward 180-degree arc, with every
sound placed by a bare `StereoPanner`. Both halves of that were wrong, and they
were wrong together:

- **A panned drone carries almost no information.** You can tell left from
  right and essentially nothing else. No front/back, no useful distance.
- **A stationary player never gets into contact.** Convoys drifted past at
  800-1500 m and the game was a waiting room.

The rebuild takes dogfight's model, which solves both at once:

1. **Everything positional goes through `engine.ear.binaural`**, fed
   listener-local coordinates (forward, starboard). Front/back and distance
   become real perceptual cues. This is the single biggest difference.
2. **Rate-coded proximity beeps replace the continuous screw hum.** The gap
   between beeps is the range (1.5 s at the edge of hearing down to 0.16 s
   alongside - a 6.8x ramp) and the pitch flips an octave down the moment a
   contact slips abaft the beam. Dogfight uses exactly this for its cars, and
   it is a far better distance display than loudness. The continuous layer now
   only exists inside 420 m, where it means something; `CLOSE_VOICE_RANGE = 0`
   switches it off entirely.
3. **You drive the boat** - rudder, throttle, depth - around a full 360-degree
   ocean. The rudder needs way on, so a stopped boat will not turn. Torpedoes
   leave on a periscope bearing you train +/-45 degrees off the bow: the boat
   does the coarse aim, the periscope the fine.
4. **Speed is noise.** The intercept costs you stealth, which is the tension
   the stationary version could not have. Below ~3/4 throttle you shed noise
   faster than you make it; above it you are on a clock.

Things worth knowing if you tune it:
- The lead angle is `asin(shipSpeed / TORPEDO_SPEED)` - the speed ratio, **not**
  range - so `TORPEDO_SPEED` alone decides whether the core skill is audible.
- A stern chase needs almost no lead (the target runs down your sight line); a
  crossing shot needs a lot. About 70% of engagements are crossing shots at a
  median 3.7 degrees. That split is the tactical choice: the easy shot is the
  one you worked hardest to get into position for.
- Contacts in the arc are an **audio budget**, not a difficulty knob.
  `MAX_CONTACTS` caps it at 10.

`node tools/sim.js` checks the mechanics, `node tools/balance.js` prints the
tuning tables, and `npx gulp build --debug && node tools/boot.js` boots the real
bundle in jsdom and plays a patrol through the actual key handlers.

### 3.4 Duck Hunt / Carnival — "Row Shoot"
**Reference:** Duck Hunt, carnival shooting galleries.
**Loop:** Targets cross a small number of discrete lanes at different speeds and
heights. You swing your aim between lanes and shoot. Limited shells per round;
bonus for a clean sweep.
**Audio:** Each lane is a fixed pan + pitch band. Targets are distinct timbres —
ducks, clay pigeons, bonus gold. A miss is a shell hitting the floor.
**Why it ports:** it's the easiest correct audio shooter. Small scope, very high
"pick up and play" value for an arcade room, good high-score chase.
**Effort:** low. Genuinely a weekend.

### 3.5 Robotron / Gauntlet — "Crawl"
**Reference:** Robotron 2084, Gauntlet (1985).
**Loop:** Dungeon crawler. Rooms, doors, keys, treasure, monster generators you
must destroy or be overrun. Move on a grid, fire in the direction you face.
**Audio:** Room tone changes per room (reverb size = room size — syngen's
impulse reverb is already set up in `main.js`). Monster generators are a
constant pulsing throb you can hear through walls and navigate toward. Health
ticking down is the classic "Warrior needs food, badly" pressure.
**Why it ports:** grid movement + facing-direction fire is exactly the discrete
aiming audio needs, and `berzerker` proves the movement layer already works
here.
**Effort:** high — it's a content game, needs levels. But it's the one with real
*session length*, which an arcade of 2-minute games is missing.

---

## 4. Twitch arcade

### 4.1 Tetris — "Stack"
**The biggest omission in the repo.** And it's a real design problem, which is
probably why it isn't here yet.
**The port:** narrow the well to **6 columns** and use only pieces whose
rotations are distinguishable by ear. Board state is read out on demand
(a "scan" key sweeps left-to-right, each column a click whose *pitch = stack
height*) — a fast arpeggio that experienced players parse instantly. The
falling piece is a repeating motif identifying its shape; pitch descends as it
falls; column = pan.
**Why bother:** it's the deepest single-player loop ever designed and it's
missing. Even a compromised version earns its slot.
**Effort:** high, and mostly *design* effort, not code. Prototype the scan
before building anything else — if the scan doesn't feel readable in 30
minutes of play, kill it.

### 4.2 Kaboom! / Avalanche — "Catch"
**Reference:** Kaboom! (1981).
**Loop:** A bomber tracks back and forth above you dropping bombs; you slide
buckets under them. Miss one and you lose a bucket. Speed ramps relentlessly.
**Audio:** Bomber position is a pan-sweeping whistle. Each falling bomb is a
descending tone — **the pitch tells you time-to-impact**, the pan tells you
where. Multiple bombs = a chord you have to resolve in order.
**Why it ports:** pure timing and position, zero state. Perfect audio fit.
**Effort:** low. Another weekend one.

### 4.3 Track & Field — "Meet"
**Reference:** Track & Field (1983), Decathlon.
**Loop:** Event mini-games: 100m (alternate two keys as fast as you can), long
jump (mash, then hit the takeoff angle), javelin, hurdles.
**Audio:** Cadence is everything — your mash rate drives an engine-like tone
that rises with speed; the crowd swells; hurdles arrive as spatialized ticks
you time your jump to. Angle selection is a sweeping pitch you stop.
**Why it ports:** rhythm and timing games are this engine's home turf (you
already have two rhythm games), and this is the multiplayer-friendliest thing
on the list — hot-seat "beat my time" is instantly social.
**Effort:** low-medium per event, and it scales: ship with three events, add
more later.

### 4.4 Joust — "Flap"
**Reference:** Joust (1982).
**Loop:** Flap to stay airborne; collide with an enemy — whoever is *higher*
wins. Loser drops an egg; collect it before it hatches into a tougher enemy.
**Audio:** Altitude = pitch, which is the most intuitive audio mapping there is,
and Joust is *entirely* about relative altitude. Enemy pitch vs. your pitch tells
you instantly whether to engage or climb.
**Why it ports:** exceptionally clean mapping. `flappy_bird` proves the flap
feel works here already.
**Effort:** medium. Two-player versus is the real prize.

---

## 5. Puzzle / grid

These are the most reliably good audio games and the repo already leans this way
(`decant`, `echoes`, `tone48`, `circulocos` share a `board.js` shape you can copy).

### 5.1 Minesweeper — "Sweep"
**Loop:** Unchanged. Grid, adjacency counts, flags.
**Audio:** A revealed cell *speaks its number as that many quick pips* — no
speech needed. Cursor movement clicks; edges thud. Flagging is a distinct
metallic tick.
**Why it ports:** the numbers are already an abstract signal; making them pips
loses nothing. Turn-based, so zero reflex pressure. Extremely high value per
hour of work.
**Effort:** low. Probably the best effort-to-quality ratio in this document.

### 5.2 Battleship — "Salvo"
**Loop:** Place a fleet, call shots on a grid, hunt the hits.
**Audio:** Splash vs. hull-crunch vs. the groan of a ship going down. Grid
coordinates announced by the announcer.
**Why it ports:** it's a game people already play *verbally*.
**Bonus:** this is the natural second customer for `pong/src/js/network.js` —
turn-based means latency doesn't matter, so online play is nearly free.
**Effort:** low-medium (higher if you do the networking, but it's a port).

### 5.3 Boulder Dash — "Delve"
**Reference:** Boulder Dash (1984).
**Loop:** Dig through dirt, collect gems, escape before the timer. Boulders fall
when unsupported and crush you; you can drop them on enemies deliberately.
**Audio:** Digging is a texture; a boulder losing support is an unmistakable
scrape-then-fall, and **the delay before it lands tells you how far away it
is**. Gems chime by proximity.
**Why it ports:** the physics is deterministic and local — you only need to know
what's in the 8 cells around you, which is exactly what stereo + pitch can
carry.
**Effort:** medium-high, needs level design.

### 5.4 Mastermind / Concentration — "Tones"
**Loop:** Either code-breaking with feedback pegs, or a memory pair-match on a
grid of sounds.
**Why it ports:** trivially — the pieces *are* sounds.
**Effort:** very low. Good filler to round out the arcade's puzzle corner, and
a good first game if you want to onboard someone to the template.

---

## 6. Vehicle / simulation

### 6.1 Battlezone — "Hull Down"
**Reference:** Battlezone (1980).
**Loop:** First-person tank. Independent tread controls (left/right stick, or
Q/E) to rotate; enemy tanks, missiles and obstacles on an open plain. Fire on a
bearing.
**Audio:** Enemy engine noise = bearing and range; you turn until it centers,
then fire. Incoming missiles are a rising whine you must dodge *laterally*.
Obstacles are occluders — an enemy behind a block is muffled, which is real
tactical information.
**Why it ports:** the original was wireframe vectors precisely because it's
about *bearing*, not detail. Bearing is what stereo does. Strong candidate.
**Effort:** medium-high.

### 6.2 Spy Hunter — "Pursuit"
**Reference:** Spy Hunter (1983).
**Loop:** Driving on a multi-lane road, but with weapons — ram civilians and you
lose points, gun down enemy cars, pick up gadgets from the weapons van.
**Audio:** `neverStop` and `surge` already solve lane-position-by-pan. The
addition is *classifying* traffic by engine timbre — friendly, hostile, van.
**Why it ports:** it's `surge` plus targets, so a lot is already written.
**Effort:** low-medium given what exists. And it comes with the best licensing-
free theme-music opportunity in the repo.

### 6.3 Moon Patrol / Moon Buggy — "Rille"
**Loop:** Auto-scrolling buggy; jump craters, shoot rocks ahead and saucers
above. Two simultaneous threat planes.
**Audio:** Ground threats are low and centered; air threats are high and
panned. The separation is by *register*, so both channels stay readable at once.
**Why it ports:** the two-plane split is legible by ear specifically because
pitch separates them.
**Effort:** low-medium.

---

## 7. Multiplayer — I had this wrong

My first pass said only pong had networking. That was wrong, and the truth is
better: there is a mature, reusable multiplayer stack already running in **five**
games.

- `src/js/app/net.js` — PeerJS with a **self-hosted coturn TURN server**
  (`turn.oriolgomez.com`), short spoken room codes from an unambiguous charset,
  star topology with an authoritative host, snapshot broadcast, lobby, kick,
  heartbeat and peer timeouts. ~600 lines, already debugged. Live in
  **bumper**, **dogfight**, **tennis** and **dynamic_beatstar** (which also has
  a `content/mp.js`).
- `pong/src/js/network.js` — a separate, earlier implementation. Its one unique
  idea is the **audio/announcer relay**: the host queues canonical sound and
  announcement events into each broadcast, and every peer replays them through
  its own announcer, from its own seat, in its own language. For an audio game
  that is the hard part of multiplayer, and it exists in exactly one game.
- `racing/public/js/net.js` — a third one. `racing` is not a syngen-template
  game (no `src/`, no Gulpfile; it ships plain `public/js/*`), so it is the odd
  one out generally.

**So the gap is not "there is no multiplayer" — it is that the good stack and
the good audio idea live in different games.** The high-value move is to lift
`app/net.js` into a shared module, port pong's perspective-correct relay onto
it, and then adding versus mode to a new game is a config exercise rather than
a rewrite.

### A bug worth fixing while you are in there

`dogfight/src/js/app/net.js:41` still reads `const PEER_ID_PREFIX = 'bumper-'`,
copied from bumper and never renamed. Host peer ids are
`PEER_ID_PREFIX + code`, so **dogfight and bumper share one room-code
namespace**: two hosts on the same code, one in each game, collide on the
broker, and a player typing a code into the wrong game connects to a session
running a game they are not playing. One-word fix.

### Cheapest wins from here

1. **Air hockey** — the same host-authoritative shape as tennis, which already
   has `net.js`. Near copy-paste.
2. **Battleship** (5.2) — turn-based, so latency is irrelevant and the
   networking is nearly free.
3. **Track & Field** (4.3) — hot-seat needs no networking at all.
4. **Joust** (4.4) — versus was the entire point of the original.

## 8. If I had to pick

**Build first (low effort, no design risk, all fit the engine perfectly):**
1. **Sonar** (3.3) — the one idea here that's *better* as an audio game than it ever was as a video game.
2. **Sweep** / Minesweeper (5.1) — best quality per hour in the document.
3. **Row Shoot** (3.4) — you asked for a shooter; this is the one that's a weekend.

**Then (medium effort, high payoff):**
4. **Descent** / Centipede (3.1) — the split-into-a-chord mechanic is genuinely great.
5. **Meet** / Track & Field (4.3) — instantly social, scales event by event.
6. **Extract `network.js`** and give air hockey + tennis a versus mode (§7).

**Ambitious, do deliberately:**
7. **Stack** / Tetris (4.1) — prototype the column-scan read *before* writing a line of game logic.
8. **Crawl** / Gauntlet (3.5) — the only thing here with a 30-minute session.

**Things I'd skip:** anything whose core is a continuous 2D aim (twin-stick
proper, Missile Command's trackball — though you already have a version),
anything requiring reading dense simultaneous state (Qix, Bubble Bobble's
screen-full of bubbles), and anything whose appeal was purely visual spectacle
(Dragon's Lair, Zaxxon's isometric trick).
