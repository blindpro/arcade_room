// Per-game touch-control config (read by app/touch.js on touch devices).
//
// CADENCE is a rhythm-action side-scroller: every beat owes one input. The game
// screen (screen/game.js, id 'game') captures raw window keydown, timestamps it
// on the audio clock, and maps physical keys to timed actions:
//   Space      -> step   (the every-beat metronome action)
//   ArrowUp/W  -> jump    (clear a hurdle)
//   ArrowDown/S-> duck    (under a beam)
//   ArrowLeft/A-> shoot Left  (foe on the left)
//   ArrowRight/D-> shoot Right (foe on the right)
// Esc/Backspace pauses — the auto pause button (Escape) covers that.
//
// The four threat responses map spatially onto a 4-way dpad (jump=up, duck=down,
// shoot the side the foe is on = left/right), reachable with one thumb; STEP is
// the primary button under the other thumb since it fires on nearly every beat.
app.touch.config = {
  gameScreens: ['game'],
  hud: true,
  pause: true, // Escape -> pause screen
  controls: [
    {
      type: 'dpad',
      zone: 'left',
      up: 'ArrowUp',      // jump
      down: 'ArrowDown',  // duck
      left: 'ArrowLeft',  // shoot left
      right: 'ArrowRight',// shoot right
    },
    {
      type: 'button',
      zone: 'right',
      code: 'Space',
      label: 'STEP',
      variant: 'primary',
      hint: 'Step on the beat',
    },
  ],
}
