# CLAUDE.md

Lunar Lander — audio-first reimagining inspired by GMA Lander. **One-button, 1D vertical descent.** Land on a tour of ten celestial bodies; each varies by gravity, atmosphere (terminal velocity), thrust, and crash speed. Stereo (no binaural). Keyboard + gamepad. EN + ES localized.

This file replaces the template's "Starting a new game" section. Shared scaffolding patterns (screens FSM, i18n module, `app.controls`, etc.) are in the games' shared template — only the game-specific shape lives here.

## The audio-first thesis

Audio IS the input device. The player has no terrain, no horizontal motion, no tilt — just altitude, descent rate, and fuel. Each piece of state is carried by exactly one voice with a single unambiguous job, and each voice is in a fixed stereo position so the ear can disentangle them at a glance:

| Voice | Carries | Position | Toggle |
|---|---|---|---|
| Velocity clicks | descent rate | center | `Shift+V` |
| Ascent tone | "you're rising" | center (replaces clicks) | `Shift+V` |
| Altitude tone | altitude AGL | left ear | `Shift+A` |
| Fuel tone | fuel remaining | right ear | `Shift+F` |
| Emergency siren | "you'll crash at this rate" | just-right of center | `Shift+E` |

The two-stage zoom on altitude and fuel is the core listening idea: pitch falls coarsely from start to a "zoom boundary" (30 m for altitude, 10% for fuel), then **resets to high** and falls more steeply over the final stretch. The reset reads as "we're zooming in for the last bit," and gives the player fine resolution exactly when they need it.

## Project layout

| File | Role |
|---|---|
| `src/js/content/constants.js` | Single tuning surface — `BODIES[]` table, audio thresholds, rank tiers |
| `src/js/content/lander.js`    | Lander state + per-frame input integration; `monitor` toggle states |
| `src/js/content/physics.js`   | 1D step (gravity + thrust + drag) + `willCrash()` predictor |
| `src/js/content/audio.js`     | Five monitor voices + click scheduler + one-shot cues |
| `src/js/content/announcer.js` | aria-live wrapper, stores i18n keys for locale-stable verdicts |
| `src/js/content/scoring.js`   | Score accumulator + rank-tier promotions |
| `src/js/content/missions.js`  | Body queue (advance on soft landing) |
| `src/js/content/game.js`      | Top-level FSM (intro → flying → landed/crashed → gameOver) |
| `src/js/content/hud.js`       | DOM HUD update + letter-key status hotkeys + Shift-toggles |
| `src/js/app/highscores.js`    | Top-10 list, Electron JSON file + localStorage fallback |
| `src/js/app/announce.js`      | Two-region aria-live (polite + assertive) |
| `src/js/app/screen/*.js`      | menu, game, gameover, highScoreEntry, highscores, help, test, learn, language |

Cross-module references use lazy getters per the template gotcha — module concat is alphabetical and modules at top-level can't assume siblings exist yet.

## Coordinate frame

There is no x. The world is a single altitude axis, `y ≥ 0`. Positive y is metres above the surface. The lander spawns at `body.startAlt`. Touchdown is `y ≤ 0`, classified by `|vy|` against `body.crashSpeed`.

## Physics

```
a = -gravity + throttle * body.thrust + drag
drag = -k * vy * |vy|       where k = gravity / terminalV²  (vacuum: k = 0)
```

At terminal velocity, drag exactly cancels gravity. For vacuum bodies (Moon, Europa, Mercury, Ganymede, Io) the lander accelerates indefinitely in free-fall. For atmospheric bodies (Mars, Titan, Venus, Saturn, Jupiter) the descent caps at `terminalV`.

`physics.willCrash()` is the engine of the emergency siren. It uses the kinematic identity `vy_f² = vy² - 2·a·y` with `a` set to the net upward acceleration at full throttle (thrust − gravity + drag). If the predicted impact speed exceeds `body.crashSpeed`, the siren plays. This is exact in vacuum and slightly pessimistic in atmosphere (drag falls as the lander slows).

## Body table (`constants.BODIES[]`)

Tour order, easy → hard:

1. **Moon** — vacuum, low g, generous TWR. Tutorial.
2. **Europa** — even lower g, marginal thrust margin.
3. **Mars** — thin atmosphere caps at ~20 m/s.
4. **Mercury** — vacuum, comparable to Mars without the atmosphere.
5. **Titan** — thick nitrogen, terminal 8 m/s < crash speed: you cannot crash from gravity alone, but small thrust margin makes overshoot the killer.
6. **Ganymede** — vacuum, marginal thrust.
7. **Io** — vacuum, slightly heavier than Luna.
8. **Venus** — brutal gravity, dense CO₂ keeps terminal just under crash, fuel disappears fighting the column.
9. **Saturn cloud-deck** — high g, terminal > crash so the atmosphere doesn't save you.
10. **Jupiter cloud-deck** — hardest. High g, tight fuel, terminal > crash.

After body 10, the table plateaus.

## Controls

One axis: thrust on/off.

| Input | Action |
|---|---|
| `Space` (held) | Fire thrusters |
| `Tab` (press) | Toggle thrusters on/off |
| Gamepad A / RT | Hold thrust |

The Tab toggle is edge-triggered (a fresh press flips a latch); holding Space at the same time forces thrust on.

## Spoken hotkeys (`content/hud.js`)

Bound at `window` keydown with capture-phase preventDefault on F1, Tab, and Space. All route through the assertive announcer so screen readers re-read on consecutive presses.

| Key | Reads |
|---|---|
| `A` | Altitude (m) |
| `F` | Fuel % |
| `V` | Descent rate (m/s) |
| `S` | World stats — gravity, thrust, crash speed, terminal velocity |
| `F1` | Summary of all keys |
| `Shift+V` | Toggle velocity clicks |
| `Shift+A` | Toggle altitude tone |
| `Shift+F` | Toggle fuel tone |
| `Shift+E` | Toggle emergency siren |

The game also speaks current altitude on a `SPEECH_INTERVAL` cadence (3 s) via the polite announcer.

## Scoring

```
LandingScore = 1000·worldN
             +  900·vyMargin              // 1 = stopped dead, 0 = at body.crashSpeed
             + 1500·(fuel / fuelMax)
             +   25·max(0, 60 − missionElapsedSec)
```

Crash → 0 for that world (the run ends; cumulative score from earlier worlds is kept).

Rank tiers (assertive announcement on cross-threshold): Cadet 0 / Pilot 5 000 / Commander 20 000 / Captain 50 000 / Admiral 100 000.

## High scores (`app.highscores`)

Top-10 list. Electron writes to a JSON file via `window.ElectronApi.writeHighScores`; HTML5 falls back to `localStorage[lander-highscores-v1]`. Entry shape: `{name, score, mission, date}`.

## FSM and screens

Top-level (game-state) FSM lives in `content.game`:

```
intro (~1s mission fanfare) → flying → landed → flying (next world)
                                     → crashed → gameOver (after 1.5s audio delay)
```

Screen FSM (driven by `app.screenManager`) is unchanged from the template scaffolding — `menu → game → gameover → (highScoreEntry or highscores) → menu`.

## Diagnostic routes

- `#test` — stereo-pan diagnostic (altitude tone left, click center, fuel tone right, emergency just-right). Run after touching `audio.js`.
- `#learn` — labeled button per palette entry.

Both are also reachable via menu buttons.

## Multiplayer

None. Single-player only — Lunar Lander is a high-score chase.

## Common commands

```sh
npm install                # required first; Gulpfile expects node_modules/syngen
npx gulp build             # builds public/scripts.min.js + public/styles.min.css
npx gulp dev               # serve + watch in parallel (visit localhost:8000)
npx gulp electron-rebuild  # build then launch Electron
npx gulp dist              # build + electron-packager + zip the HTML5 build
```
