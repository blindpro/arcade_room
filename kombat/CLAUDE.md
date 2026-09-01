# CLAUDE.md — KOMBAT

Project-specific notes. This is a syngen-template game like the rest of the
collection; the shared conventions (screens, storage, settings, controls, the
i18n layer, the syngen coordinate-frame gotchas) are documented in any sibling
game's copy of the template guidance — `../joust/` is the closest relative and
this game was scaffolded from it. Read that first. What follows is only what is
KOMBAT-specific.

## What it is

Audio-first one-on-one fighter. Side view, two fighters on a single horizontal
line plus a jump arc. Four attack buttons in a 2x2 (high/low against
punch/kick), a held block, best-of-three rounds, and a four-fighter arcade
ladder. Everything that decides a match is audible; the on-screen plot is
`aria-hidden` decoration.

## Foundational answers (do not re-ask)

1. **Perspective / movement**: 2D side-on, but only ONE positional axis.
   `x ∈ [-5, +5]` along the floor and `y` for the jump arc. There is no
   forward/back and no depth. Facing is automatic (always toward the opponent)
   and exists only so special motions can be expressed as forward/back.
2. **Input**: `A`/`D` walk, `W` jumps, `S` holds a block, `U`/`I`/`J`/`K` are the
   four attacks. That is the whole control set and it was specified by the user;
   do not add movement keys. Directions are HELD, attacks and the jump are
   EDGES, and only one attack is passed to content per frame.
3. **Audio listener**: THE PLAYER'S FIGHTER. It walks around with you; it is
   not the arena centre and not the screen. Events carry the source's ABSOLUTE
   arena `x` and `audio.setListener(st.playerX)` runs once at the top of
   `audio.frame()`; `constants.panOf(sourceX, listenerX)` is the only place
   arena space becomes ear space. Its ORIENTATION is screen-locked — arena left
   is your left for the whole match, because facing flips every time you cross
   the opponent and a mirroring image is unreadable.
4. **Audio's role**: audio-first / blind-accessible. Four channels that never
   swap — stereo+pulse-rate for position, brightness for airborne-or-not, the
   range gate for "what reaches from here", and sweep DIRECTION for attack
   level. See the header comment in `content/audio.js`; it is the spec, not a
   summary of one.
5. **Persistence**: `kombat.lang` and `kombat-highscores-v1` in `localStorage`.
   Nothing in `engine.state`.
6. **Progression**: arcade ladder over `characters.ROSTER` — the three other
   fighters in order, then the mirror match. AI difficulty is indexed by ladder
   stage in `ai.TIERS`.
7. **Reverb is OFF** (`main.js`). The game is read off a filter sweep whose END
   is the moment the hit goes live; a reverb tail smears that boundary and costs
   the player the reaction window the timing table is balanced around. Every cue
   authors its own dry tail.

## The one rule everything hangs off

```
             blocked by S      jumped with W
  high (U/I)      yes                no      (jumping into it is WORSE)
  low  (J/K)       no               yes      (goes straight under a block)
```

Both answers are wrong against the other attack, so nothing works twice. This is
asserted directly in `tools/sim.js` rather than being left to emerge — "a sweep
goes under a block" has to be exactly true, not true on average.

## Module map (`src/js/content/`)

- `constants.js` — arena, jump, round and audio numbers, plus `closeness` and
  `panOf`. The comment block explains the channel split.
- `combat.js` — the four attacks and `resolve()`. Pure; mutates nothing.
- `characters.js` — the roster: stats plus one special each, with a motion input.
- `game.js` — match state machine. Both fighters run the same code; the only
  difference is that the player's intent arrives from `setInput()` and the
  opponent's from `content.ai.decide()`. Emits events, never makes a sound.
- `ai.js` — the opponent. Reaction time is the difficulty curve; it also tracks
  how the player defends and skews its mixup against it.
- `audio.js` — every sound.
- `music.js` — a two-note tension bed driven by one number.
- `events.js` — the collection's shared tiny event bus.

`app/screen/moves.js` is the pause-menu move list. It is BUILT from
`content.combat` and `content.characters` rather than written out, so it cannot
drift from the game; `tools/boot.js` asserts that no i18n placeholder leaks into
it and that every fighter's motion input is actually spelled out.

## Panning

Two separate things had to be true and only one of them was.

**Where the sound is.** Every event that has a place carries `x`, the absolute
arena position of whatever made it — the attacker for a tell, the victim for an
impact, the walker for a footstep — and `content.audio` subtracts the listener.
`game.js` no longer computes offsets for the audio layer, because a precomputed
offset silently assumes a listener and there is then no single place to change
it. The player's own cues come out centred for free: your x minus your x is 0.

**How it is heard.** `audio.sourceAt(x)` builds the panner itself and does NOT
use `engine.ear.binaural`. That ear ran both of its channels through
`gainModel.normalize` — the same gain on both sides — so the entire image was a
few hundred microseconds of delay and a soft shadow filter, ramped into place
over a frame that a 12ms footstep transient is already finished by. It is a
headphones-only cue at best and the fight sat in the middle of your head. The
replacement sets three things, instantly, at the sample the cue starts: an
equal-power LEVEL split (this is the one that survives speakers), up to
`EAR_ITD` of extra delay on the far channel, and a lowpass on the far channel
only. `EAR_FAR_TRIM` keeps the far channel just short of silence so nothing
disappears when the two are summed.

`panOf()` normalises against `EAR_FULL_PAN` (1.5 units), not against
`ARENA_HALF`. Almost every moment of a match happens between half a unit and two
units apart; normalising against arena width put the opponent inside 15 degrees
of dead centre for the whole fight, which is stereo in name only. Beyond
`EAR_FULL_PAN` the pan stops widening on purpose and the footstep pulse RATE
carries the remaining distance. If you widen the arena, do not touch these.

Both halves are asserted. `tools/sim.js` checks `panOf()` as arithmetic —
centring, sides, that only the offset matters, monotonicity out to full pan.
`tools/boot.js` reads the node graph a real cue builds and checks that the two
channels actually differ, in the right direction, and that the same arena
position pans differently once the player has walked past it.

Footsteps play at BOTH fighters' positions. The opponent's are the pulse train
whose rate is the distance channel; your own run on a fixed cadence while you
walk, at your own position (so, centred), darker and quieter and without the
high transient — that transient is the localisation cue and it belongs to the
fighter whose position you actually have to read.

## Spacing, and being able to fight at all

The player could attack and could walk, and still could not land anything. Two
separate causes, neither of them in the rules:

**The opponent stood where you could not reach it at all.** `ai.js` set its
preferred distance to its own longest attack PLUS a quarter unit. Both fighters have
roughly the same reach, so "just outside mine" is "just outside yours": it
parked at 2.05 units against a longest attack of 1.80 and every swing thrown
from where it chose to stand was a whiff by construction. It also backed away on
a per-frame coin flip whenever you got within 1.55, which is a permanent
half-speed retreat, not a decision. It now rests at reach MINUS a quarter unit —
somewhere both fighters can be hit — and a retreat is a move with a length
(0.28s) and a cooldown (1.6s). Its safety is supposed to come from reacting to
the tell. Being untouchable is not a difficulty setting.

**There is more than one range, and the opponent only ever visited one of
them.** Kicks reach from 1.70–1.80, punches only from 1.05–1.15, and a single
resting distance means half the buttons never connect all match. It now has two
stances — a kick stance at kick reach minus a quarter unit, and a punch stance
at the SHORTER punch minus 0.15 so both punches are live when it arrives — and
it moves between them on a timer, weighted about 38% toward coming in close.
That is also what gives a round a shape: the fight breathes in and out instead
of orbiting one radius.

**Nothing told you what reached from where you were standing.** The distance
channel is the opponent's footstep pulse RATE, and `closeness()` normalised it
against `HEAR_RANGE` — ten units — while the entire fight happens between 0.6
and 2.7. Across the band that decides everything the rate moved from 3.0 to 3.9
pulses a second. `constants.spacing()` now normalises against `SPACING_FAR`
(3.0) and is linear, so the same walk-in goes from 2.1 to 4.0 pulses a second.
`closeness()` is still there and still curves the way it did; it is now only
used for LOUDNESS, which is a different job with different requirements.

On top of the rate there is an explicit gate, because reading a rate takes time
you do not have mid-exchange. It has THREE states — nothing reaches, kicks
reach, everything reaches — and it says so twice over: each band has its own
two-tone dyad, rising as you get into it and falling as you drop out of it, and
while you are in a band every footstep of theirs carries one tick per band. The
marker catches the crossing; the ticks mean the band can be read off any single
step by someone who missed it. Counting to two is faster and far more robust
than judging a pitch.

Dropping out of a band is announced with the tones of the band you LEFT, not the
one you landed in: what you need at that moment is which buttons stopped
working. Two fighters spend a round hovering within a hand's width of one of
those edges, so each boundary has 0.30 units of hysteresis and the gate has a
0.55s refractory — and the STATE only flips when it is allowed to make a sound,
deferring the flip rather than dropping the cue, so what you last heard is
always what the gate currently says.

`inPunchRange` and the gate's punch band both measure against the shorter of the
two punches, so the F2 readout and the audio can never disagree about which band
you are in.

All of it is checked. `tools/sim.js` plays a round per attack as somebody who
walks in and throws that attack whenever it would reach, and requires all four
to be genuinely usable — the triangle checks above it all passed the whole time
the game was unplayable, because every rule in them was still true. It also
states the two resting distances directly against the reaches they have to be
inside. `tools/boot.js` drives the gate across both boundaries in both
directions and checks that it speaks, that it stays quiet, and that it names the
band you lost rather than the one you kept.

## Tools

- `npm run sim` — headless. Asserts the triangle against `combat.resolve()` with
  fighters posed by hand, checks the stereo image and whether the opponent is
  reachable at all, then plays every fighter × several scripted styles through a
  full ladder to check liveness.
- `npm run boot` — builds the debug bundle and drives the REAL bundle in jsdom
  against a fake Web Audio API: every learn cue, every attack key, the edge
  behaviour of attacks, a special entered as key edges, the F-key readouts, a
  match played to game over, and a check that every i18n key resolves in both
  languages.
- `npm test` — both, then a clean production build.

Boot-harness notes:

- Its input assertions run inside a LIVE match, so the opponent is hitting back.
  Hitstun, knockdowns and recovery frames swallow input by design. Any new input
  check must go through `whenFree()` / `probe()` or it will fail intermittently
  for the wrong reason.
- It drives `screen.onFrame()` BY HAND and stops `engine.loop` to do so, which
  makes the game logic deterministic but completely blind to whether the app is
  receiving frames at all. There is one check ("the real loop") that starts the
  real rAF loop and requires the match to progress on its own. Do not delete it:
  `app.controls.update()` and several syngen subsystems ride the same
  `engine.loop` frame bus, and a throw in any of them kills the rAF chain for
  the whole app.

## The control layer does not have every action

`app/controls/{keyboard,gamepad,mouse}.js` are shared across the collection and
were written against the template's movement model — `moveForward`,
`strafeLeft`, `turnLeft` and friends. KOMBAT has none of those: it is a fighter
on one line whose game screen reads raw key codes, so `mappings.js` does not
define them. They now go through `app.controls.bindings(mappings, name)`, which
treats a missing action as "this game does not have that control".

Reading a missing mapping directly threw inside the loop's frame handler, and
because that handler is what schedules the next frame, the entire app stopped
receiving them — it booted, rang the round bell, and froze. If you add an action
to a reader, go through `bindings()`.
