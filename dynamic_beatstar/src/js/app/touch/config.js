// Per-game touch-control config (read by app/touch.js on touch devices).
//
// beatstar is a 4-direction rhythm echo: the player hears a hint pattern of
// up/right/down/left tones and taps them back on the beat. The game screen
// (screen/game.js, id 'game') reads raw window keydown and routes
// ArrowUp/Down/Left/Right (WASD aliased) to content.game.handleArrow(dir).
// Escape/Backspace leaves to the menu — the auto pause button (Escape) covers
// that.
//
// A centred 4-way dpad mirrors the four arrow tones spatially (up top, down
// bottom, left/right sides), so a mobile player taps the same cross the tones
// map to by ear.
app.touch.config = {
  gameScreens: ['game'],
  hud: true,
  pause: true, // Escape -> menu
  controls: [
    {
      type: 'dpad',
      zone: 'center',
      up: 'ArrowUp',
      down: 'ArrowDown',
      left: 'ArrowLeft',
      right: 'ArrowRight',
    },
  ],
}
