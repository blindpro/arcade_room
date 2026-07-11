/**
 * COIL (Snake) — touch control layout.
 *
 * Absolute 4-way steering: tap/hold a direction to set the serpent's heading
 * (Up = north; no 180° reversal). One d-pad is the whole game. Pause button
 * (top-left, Escape) and the announcement HUD are added automatically.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'},
  ],
}
