/**
 * Marble — touch control layout.
 *
 * Tilt-maze: hold a direction to tilt the board that way and roll the marble.
 * A single 4-way pad drives the tilt axes (the same Arrow/WASD keys the game
 * already reads through app.controls.game()). Pause (Escape) and the
 * announcement HUD are automatic — F1–F4 status readouts are mirrored there.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'},
  ],
}
