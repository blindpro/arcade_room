# CLAUDE.md — CRAZY CLIMBER

CRAZY CLIMBER (`/home/games/_cl`) — audio-first Crazy Climber port. Two-handed
independent grip input. Stereo-only audio (left ear ↔ left hand, right
ear ↔ right hand). Spanish name and feria flavor in the `es` locale.

## Quick reference

- **Build**: `npx gulp build` (or `--debug` for unminified). `npx gulp dev`
  serves `public/` and rebuilds on `src/**` changes.
- **Run**: open `public/index.html` after a build (or `gulp serve`).
- **Diagnostic routes**: `#test` (stereo L/C/R/C tick), `#learn` (audition every
  cue). The screen-manager `none → activate` honours `window.location.hash`.

## Controls

Window-level keydown captures (in `src/js/app/screen/game.js`), not
`app.controls.mappings` — the mapping shape is built around named axes
(`uiUp`, `moveForward`, …) which doesn't fit the four-key climber model.

| Key | Action |
| --- | --- |
| `A` | Left hand reaches up |
| `Z` | Left hand drops down (also dodges left-side pots) |
| `K` | Right hand reaches up |
| `M` | Right hand drops down (also dodges right-side pots) |
| `Esc` / `Backspace` | Pause/resume |
| `F1` | Read floor / goal |
| `F2` | Read score |
| `F3` | Read lives |
| `F4` | Read hand floors (L/R) |
| `F5` | Captured (no reload) |

`F1`/`F3`/`F5` are `preventDefault()`-ed in capture phase so the browser
doesn't open Help / Find / reload mid-climb. `F11` (fullscreen) is left
alone deliberately.

## Hand state machine

Each hand has `floor`, `prevFloor`, `reachT`, `duckT`. Invariants:

- **`|left.floor − right.floor| ≤ 1`** at all times. The lower hand must
  catch up before the higher one can climb further. Pressing UP on the
  higher hand when the gap would become 2 is **rejected** (no-op).
- **You can only release a hand when the other is gripping** (`reachT === 0`).
  Otherwise the press is a no-op (would amount to releasing both at once).
- **Reaches take `REACH_DUR = 0.20 s`**; during the reach the other hand
  is the only support.
- **Reach success requires `canGripFresh()`** — the destination grip must
  be fully `open`. A `closed` grip rejects the reach (`reachFail` audio,
  hand stays at original floor). A `closing` grip rejects fresh grips so
  you can't slap onto a window that's about to slam.
- **Z/M always sets `duckT = DUCK_DUR (0.55s)`** even if the descent move
  itself is blocked. That way a "dodge" press is always registered for the
  pot-collision check.

`bodyFloor() = min(L.floor, R.floor)` (you hang from the lower hand).
`bodyAltitude() = (L.floor + R.floor) / 2` (continuous, used by audio).

## Hazards

### Falling pots (`content/hazards.js`)

- Spawn rate scales with body floor and current building. Disabled below
  floor 8 so the opening few moves are calm.
- Each pot picks a random side; lifecycle is `spawn → 1.5 s descending
  whistle (potIncoming, panned ±0.95) → land`.
- At `landAt`, hazards.tick checks `content.player.isProtectedFromPot(side)`,
  which is true iff the matching hand has `duckT > 0`. Dodge → score
  bonus + `potDodge` whoosh. Hit → `potHit` (loud), then
  `content.player.die('game.deathPot', side)`.

### Closing windows (`content/wall.js`)

- `spawnRatePerSec(bodyFloor)` schedules window closures above body+1.
  WARN_DUR = 1 s of `windowCreak` audio (panned to the side); then `state`
  flips to `closed` and `windowSlam` fires. CLOSED_DUR = 4 s, then back
  to `open`.
- If your hand is on the slammed grip, `windowSlamOn(side, floor)` is
  called: if the other hand is mid-reach (or off the wall), you fall
  (`game.deathClosed`); otherwise the hand drops one floor and the duck
  timer kicks in (a quick recovery, but you've lost ground).
- `dangerForHand(side, floor)` is consulted by audio every frame: when
  `'closing'`, the grip drone opens its lowpass (2.4k → 5.5k Hz) and
  thickens its tremolo wobble (4 Hz → 11 Hz, depth 0.10 → 0.45). That's
  the "your hand is in trouble" cue.

### The gorilla (`content/hazards.js`)

- Activates when body floor ≥ `GORILLA_FLOOR (50)`. Continuous
  `gorillaRoar` (sub-bass saw + sine, 0.7 Hz throb, ±4 Hz pitch wobble at
  3.4 Hz, centred). Intensity scales with altitude.
- Periodically spawns a `swipe`: 1 s `gorillaWhoosh` (pan sweeping
  L→R or R→L), then `gorillaSwipe` impact. If at impact-time **neither
  hand is ducked**, you fall (`game.deathGorilla`). Either Z or M gets
  you under it.

## Audio

Stereo only — `StereoPannerNode` per source. We never touch
`engine.position`, never set a binaural ear, never set a listener yaw.
**Do not** add binaural to this game; the input/output mapping is the
left/right ear split, and changing that breaks the input ↔ audio
contract that makes the controls legible.

`engine.mixer.reverb.setActive(false)` is called in `main.js`. CRAZY CLIMBER
runs fully dry — every cue authors its own tail (release time, lowpass
shape). Re-enabling the global reverb send will smear the gameOver dirge
and pot impacts. **Don't.**

### Continuous voices (lifecycle managed by `content.game`)

- `leftGrip` / `rightGrip` — sine carrier + sub-octave triangle, lowpass
  + 4 Hz amplitude tremolo. Pan ∓0.85. Pitch from `floorToHz(floor,
  isRight)` — base 140 Hz (left) / 165 Hz (right), every 4 floors = 1
  semitone up. The +2 ST anchor offset keeps both ears disambiguable when
  hands are at the same floor.
- `wind` — broadband noise, hp+lp, gain ∝ altitude/100. Centred.
- `gorillaRoar` — see above; only on above floor 50.

### One-shot SFX (event-queued, drained at end of frame)

`enqueue({type, payload})` → `drain()` → `dispatch(ev)`. Types:

- `reachStart` (sine chirp, panned)
- `climb` (triangle bell, panned, pitch encodes floor)
- `reachFail` (lowpass square thud)
- `windowCreak` (1 s sawtooth sweep up + lowpass open)
- `windowSlam` (bandpass noise at 350 Hz)
- `potIncoming` (1.5 s sine descending 2.4k → 420 Hz, hard-panned)
- `potDodge` (bandpass noise sweep)
- `potHit` (loud noise + bell ring)
- `gorillaWhoosh` (panning bandpass-noise sweep)
- `gorillaSwipe` (heavy lowpassed noise impact)
- `fall` (descending tri 660 → 110 Hz + wind whoosh)
- `thud` (sub-bass sine 80 → 40 Hz)
- `extraLife` (A C E triplet)
- `buildingClear` (C-major arpeggio + sustained chord)
- `gameOver` (sequential 3-note dirge — **deliberately non-overlapping**;
  see "Gotchas" below)
- `floorChime`, `pause`

### Wiring rule

`content.audio.silenceAll()` is called from `content.game.stop()` (which
runs from `game.onExit`). All continuous voices stop on screen exit. If
you add a new continuous voice, register a stop in `silenceAll()` too —
otherwise the gorilla will keep roaring under the gameover menu.

## Game FSM (`content/game.js`)

```
ready  — wait for first input; grip drones + wind already breathing
play   — main loop: player.tick, wall.tick, hazards.tick, audio.update*
dying  — pendingDeathAt = t + 1.5 s; audio fall + thud play out, then
         lives-- and either restart-from-ground (lives left) or game over
clear  — building completed; pendingClearAt = t + 2.5 s; building++ and
         restart from ground
```

`maybeBuildingClear()` is called every play frame. When body reaches
`wall.height() - 1`, building cleared (bonus = 5000 + 1000 × building).

## Scoring

| Event | Score |
| --- | --- |
| Each new floor (high-water mark only) | 100 |
| Pot dodged | 250 |
| Gorilla swipe avoided | 1000 |
| Building cleared | 5000 + 1000 × building |
| Extra life | first at 30 000, then every +50 000 |

Score is high-water-marked (`floorMax`) so descending and re-climbing
doesn't double-pay.

## Persistence

- **High scores**: `app.highscores` (dual backend — Electron file via
  preload bridge, web via `localStorage['crazyclimber-highscores-v1']`).
  Top 10 by score; entry stores `{name, score, floor, building, date}`.
- **Locale**: `localStorage['crazyclimber.lang']` (read in `app.i18n`
  before `app.storage.ready()` finishes).
- `app.autosave.disable()` is called in `main.js` — no `engine.state`
  serialization. Run state is rebuilt every climb.

## Localization

EN + ES dictionaries in `src/js/app/i18n.js`. Per CLAUDE.md feedback
memory, the `es` pool is **independently authored**, not translated. The
side strings are i18n'd (`game.left` / `game.right`) so death messages
like `game.deathPot` (`"A pot smashed your {side} hand."` /
`"Una maceta te aplastó la mano {side}."`) interpolate the localised side.

## Gotchas worth remembering

### The reverb leak

`engine.mixer.reverb.setActive(false)` in `main.js` is **load-bearing**.
By default syngen wires `reverb.input → delay → highpass → lowpass →
convolver → output (a mixer bus)`, and even when nothing explicitly
connects to `reverb.input`, having it active feeds the convolver tail
into the master mix on top of any other sting. The dirge in particular
read as wash. Keep reverb off; if you need a tail on a specific cue,
shape it on the cue itself (release time + lowpass).

### Gameover dirge has no overlap by design

Notes are sequential (`t = 0.00, 0.55, 1.10`, durations `0.55, 0.55,
1.10`). Don't reintroduce overlap — the previous version had releases
crossing into the next attack and that smear was indistinguishable from
reverb tail.

### A/Z/K/M are **not** in `app.controls.mappings`

The mappings system is axis-based; the climber model needs four
discrete edge-triggered actions tied to specific physical keys. The game
screen's `onEnter` registers a window-level capture-phase keydown
listener instead. `onExit` removes it. If you add new game-screen keys,
add them there.

### `content.game.start()` starts continuous voices on the audio context

That assumes the WebAudio context has been resumed by an earlier user
gesture. Since the menu is the only entry path to the game and a click
satisfies the autoplay policy, this is safe in practice. The diagnostic
routes (`#test`, `#learn`) reach for audio only after a button click for
the same reason. Don't schedule audible cues in `main.js` boot — they'd
be silent on first load and audible on every reload.

### Body altitude vs body floor

`bodyFloor()` is the integer `min(L, R)` (used for hazard targeting and
the goal check). `bodyAltitude()` is the float `(L + R) / 2` (used for
audio scaling — wind gain, e.g.). When the hands split during a reach,
they differ by 0.5; if you target `bodyFloor` for hazards while audio is
following `bodyAltitude`, you can get cues that don't quite match the
visible state. Use the right one per call site.

### Loop delta clamp

`screen/game.js#onFrame` clamps `e.delta` to `≤ 0.05 s` before passing
to `content.game.tick`. After a tab visibility change, syngen's loop can
produce a one-frame delta of multiple seconds. Without the clamp, that
frame would spawn a flood of pots / closing windows in one tick.

### Pot dodge consumes the same key as descent

Z and M both descend the hand AND set `duckT`. So a "wasted" Z (no pot
incoming, hand at floor 0) still registers as a dodge for the next
0.55 s. That's intentional — the player can pre-empt a known-coming pot
with a defensive duck. It also means descending repeatedly to "duck-spam"
is a viable defensive style at the cost of climbing speed; that's a
deliberate skill-ceiling lever.

### `app._lastGameOverInfo` is the bridge to the gameover screen

`screen/game.js#handleGameOver` stashes the death info on
`app._lastGameOverInfo` because by the time `screen/gameover.js#onEnter`
runs, `content.game.stop()` has already fired and `content.game._state`
may not reflect the death. The gameover screen reads `app._lastGameOverInfo
|| content.game.snapshot()` (fallback for safety).

### Per-locale phrase pools

Per global feedback memory (`feedback_i18n_phrase_pools.md`): commentary
is authored independently per locale, never translated. The `es` strings
in `i18n.js` lean into feria/zarzuela cadence — short, exclamatory,
punchy ("¡Macetazo en la mano izquierda!"). Don't replace with literal
EN translations.

## Files at a glance

```
src/js/main.js                   — bootstrap + reverb-off + autosave-off
src/js/app/i18n.js               — full EN/ES dictionaries
src/js/app/announce.js           — polite + assertive aria-live regions
src/js/app/highscores.js         — Electron-file + localStorage backed
src/js/app/screen/menu.js        — entry; satisfies WebAudio autoplay
src/js/app/screen/game.js        — gameplay; A/Z/K/M + F1–F4 wiring
src/js/app/screen/help.js        — controls + climb rules
src/js/app/screen/learn.js       — audition every cue
src/js/app/screen/gameover.js    — summary + name entry on qualify
src/js/app/screen/highscores.js  — top 10
src/js/app/screen/test.js        — stereo L/C/R/C tick (#test)
src/js/app/screen/language.js    — language picker (template-shared)
src/js/content/audio.js          — stereo synth engine
src/js/content/wall.js           — building/floors/window state machine
src/js/content/player.js         — two-handed climber
src/js/content/hazards.js        — pots + gorilla
src/js/content/game.js           — top-level FSM + scoring
public/index.html                — every screen's static markup
src/css/component/game.css       — HUD + aria-live offscreen + gameover
```
