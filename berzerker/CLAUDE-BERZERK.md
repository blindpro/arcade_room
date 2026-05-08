# BERZERK! game-specific notes

> Game-specific addendum to the syngen-template `CLAUDE.md` already in
> the repo root. Read both. The template's `CLAUDE.md` covers shared
> architecture, audio coordinate frame, and gotchas; this file covers
> what's unique to BERZERK.

## Locked design (do not relitigate without user approval)

- **Top-down 2D, continuous movement, screen-fixed camera.**
- **Audio listener: screen-locked**, `LISTENER_YAW = Math.PI / 2`. North = audio-front. The screen→audio y-flip lives in `content/audio.js::tileToM`, `relativeVector`, `behindness`. Verify with `#test` before chasing other audio bugs.
- **Aim: independent fire keys.** Arrow keys move 8-way; WASD (or Numpad if `controlScheme=numpadFire`) fires 8-way. **The player cannot move while firing.** That stand-still risk is the iconic Berzerk skill ceiling — don't "fix" it.
- **Robot voices: in-engine formant synth + robotization.** `content/voice.js` tokenises the i18n string into vowel/consonant frames and runs them through ring-mod (75 Hz square LFO) → bit-crush (5-bit waveshaper) → comb-delay (7 ms / 0.4 fb). No browser SpeechSynthesis in-game (it's only the optional `useTtsAnnouncer` for menus).
- **Persistence: high scores only.** No autosave. `app.highscores` (`berzerk-highscores-v1`) writes Electron file + localStorage.
- **Locales: en + es.** `STORAGE_KEY = 'berzerk.lang'`. **`robotbarks.*` is authored independently per locale — do not translate.** `voice.barkRandom('spotted')` picks from `robotbarks.pools.spotted` in the active locale.

## Module load order (alphabetical concat)

`src/js/content/`: `audio.js → events.js → exits.js → game.js → otto.js → player.js → robots.js → room.js → sfx.js → voice.js → wallVoice.js → wiring.js`. `audio.js` evaluates first; cross-module references everywhere else use lazy getters (`const R = () => content.room`) per CLAUDE.md "Cross-module references must be lazy".

`wiring.js` is alphabetically last on purpose — it subscribes events into audio/HUD/announcer once every other module is defined.

## Procedural rooms

`content/room.js` uses random pillars + flood-fill validation:

1. 40 × 28 grid; outer wall.
2. Punch four 2-tile-wide cardinal exit gaps with ±1 jitter.
3. Reserve a 5×5 spawn area + 4-tile corridors leading inward from each exit so generated pillars can never cut off an entrance.
4. Place `4 + floor((depth - 1) / 2)` random axis-aligned pillars (1–6 long, 1 thick).
5. BFS from spawn over open cells; if any exit gap unreached, regenerate (cap 24 retries; fallback = no pillars).
6. Pre-compute `wallSegments[]` for fast LOS / proximity / collision.

Per-depth seed is `mulberry32(seed ^ depth)`. `seed` is randomised at game start.

## Walls are lethal — to everyone

`room.wallsTouchedBy(x, y, r)` is the only collision the player and robots care about. It returns the first wall cell whose AABB overlaps the circle. `player.die('wall')` fires on player contact; robots that step into a wall trigger `wallZap` SFX and `killRobot(r, true)` (wall-killed robots score 0).

This is *the* core hazard. Don't add "non-electric walls" or "robots that pathfind around walls" — both undermine the Berzerk skill ceiling: the game wants you to herd dumb robots into walls.

## Robot AI

Three classes with distinct pitch families:

| kind   | baseHz | speed (t/s) | losFireRate | accuracy° |
|--------|--------|-------------|-------------|-----------|
| grunt  | 220    | 1.8         | 0.7         | ±20       |
| flank  | 330    | 2.6         | 0.9         | ±12       |
| sniper | 165    | 1.2         | 0.45        | ±5        |

Per-instance `±drift × random()` jitter so 6 instances of the same class are individually trackable. Per-AI `aggression ∈ [0.7, 1.3]` and `cooldown ∈ [0.85, 1.15]` (CLAUDE.md "Per-AI personality randomization") on top.

**No pathfinding.** Greedy step on the dominant axis; if blocked, try the perpendicular; if still blocked, sit still. LOS via `room.lineHitsWall`. Robots routinely walk into walls and die. That is the design.

Wave count: `min(10, 4 + floor(depth × 0.7))`. Class distribution shifts toward flank/sniper as depth grows.

## Evil Otto

`content/otto.js`. State machine in three phases:

- Pre-spawn: `OTTO_DELAY_BASE = 25s` (scaled down with depth, floor 9s; difficulty further multiplies).
- Spawn: announce assertively (`ann.ottoArrives`); place at one of four corners; build proximity-buzz prop.
- Pursuit: ignores walls; horizontal speed `OTTO_SPEED = 5.4` (escapable through doors at player walk speed 6.0). Vertical bounce phase. Each half-period wrap fires `sfx.ottoBounceTick(phaseIdx & 1)` — alternating C5 / F#5, the iconic tritone. `bouncePeriod = clamp(0.3 + dist*0.02, 0.3, 0.6)` so the cue accelerates as he closes.

**Persistence across rooms only when player fled.** `game.js` sets `state.fledLastRoom = !cleared`; `otto.enterRoom(keepAlive)` carries Otto only if `keepAlive && state.alive`. Cleared rooms always reset Otto.

## Voice

`voice.say(phraseKeyOrLiteral, sx, sy, opts)` schedules tokens through `buildVoice`-style formant frames into a robotization bus, then routes through `audio.playSpatial`. Per-robot `voicePitch` is jittered at spawn so simultaneous chatter is distinguishable.

`voice.bark(category, robot)` enforces a 4-second per-robot cooldown so a chase doesn't flood the announcer.

## Screens + FSM

```
menu ──start──▶ ready ──begin──▶ game ──pause──▶ pause
                  │                │              │  └─resume──▶ game
                  ▼                ▼              └─menu──▶ menu
                game ◀─readyNext── (next room via game.tick)
                                   │
                                   ├─gameOver──▶ gameover ──playAgain──▶ ready
                                   │                       └─highscores ▶ highscores
                                   │                       └─menu ──────▶ menu
```

`game.js` screen calls `content.game.tick(dt)` each frame, which advances player → robots → otto → wallVoice. `endGame()` dispatches `gameOver` with `{score, room}`.

`#test` and `#learn` route via the `none → activate` hash check in `screenManager.js` (CLAUDE.md "Hash routing in screenManager"). `#test` plays four direction ticks at fixed listener; `#learn` lets the player audition every distinct cue.

F1/F2/F3/F4 are bound to score / lives / room / robots+Otto in the game screen. F1, F3, F5 are `preventDefault`'d in capture phase to keep browser Help/Find/Reload from stealing them.

## Settings

| setting                  | default     | wired to                              |
|--------------------------|-------------|---------------------------------------|
| `masterVolume`           | 0.85        | `engine.mixer.param.preGain.value`    |
| `voiceVolume`            | 0.9         | `content.voice.setBusGain`            |
| `sfxVolume`              | 0.9         | `content.sfx.setBusGain`              |
| `ambientWallBuzzVolume`  | 0.7         | `content.wallVoice.setBusGain`        |
| `useTtsAnnouncer`        | false       | `app.announce.setUseTts`              |
| `gamepadEnabled`         | true        | read from `app.settings.computed`     |
| `controlScheme`          | `wasdFire`  | read by `player.readFireDir`          |
| `difficulty`             | `normal`    | read by `robots.update` / `otto.enterRoom` |

## Smoke test

Beyond `npx gulp build`, a Node-VM smoke harness lives at `/tmp/bz_smoke4.js` (created during initial implementation). It mocks Web Audio + DOM, runs the bundle, and exercises i18n, room generation, robot wave spawn, and a frame tick. If you're touching boot ordering or module dependencies, re-run it before opening a browser.

## Verification path

1. `npx gulp build`
2. `npx gulp serve` then open `http://localhost:3000/#test` — verify front/right/behind/left ticks **by ear**.
3. `http://localhost:3000/#learn` — audition every cue in the dictionary.
4. From the menu start a fresh game:
   - Walk into a wall → electrocution death.
   - Stand still ~25s → Otto announces, two-pitch tritone bounce alternates, follows through an exit.
   - Kill all robots → fanfare + bonus.
   - Hit 5000 → extra-life jingle; hit 15000 → second extra life on escalated threshold.
   - Die out of lives → gameover; if qualifies, initials prompt; entered name persists across reload.
5. F1/F2/F3/F4 announce correctly. F1/F3/F5 do **not** trigger browser Help/Find/Reload.
6. Switch language to Spanish and restart — barks come from the independent Spanish pool, never literal English translations.
