// Per-game touch-control config (read by app/touch.js on touch devices).
//
// tone48 is a 2048-style slide/meld puzzle. The game screen (screen/game.js,
// id 'game') reads engine.input.keyboard each frame:
//   - Arrow / WASD / numpad direction  -> move the inspection CURSOR one cell
//   - Shift + direction                -> SWIPE the whole board (slide + meld)
//   - C                                -> spatial board scan
//   - Esc                              -> pause (the auto pause button covers it)
//
// So a real move needs Shift held while a direction is tapped. On touch that is
// a two-thumb gesture: hold the primary SLIDE button (ShiftLeft) with one thumb
// and tap the dpad with the other to slide+meld; tapping the dpad alone moves
// the read-out cursor. SCAN (C) reads the whole board by ear.
app.touch.config = {
  gameScreens: ['game'],
  hud: true,
  pause: true, // Escape -> pause screen
  controls: [
    {
      type: 'dpad',
      zone: 'left',
      up: 'ArrowUp',
      down: 'ArrowDown',
      left: 'ArrowLeft',
      right: 'ArrowRight',
    },
    {
      type: 'button',
      zone: 'right',
      code: 'ShiftLeft',
      label: 'SLIDE',
      variant: 'primary',
      hint: 'Hold, then tap a direction to slide + meld',
    },
    {
      type: 'button',
      zone: 'center',
      code: 'KeyC',
      label: 'SCAN',
      variant: 'secondary',
      hint: 'Scan the whole board',
    },
  ],
}
