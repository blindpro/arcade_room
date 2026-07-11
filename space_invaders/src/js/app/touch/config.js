/**
 * SPACE INVADERS! — touch control layout.
 *
 * Aim the crosshair L/R (left thumb), FIRE the current weapon (right thumb),
 * and the three weapon pads double as "switch + fire" one-tap shots exactly
 * like the 1/2/3 keys. Pause button and announcement HUD are automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'Space', label: 'FIRE', variant: 'primary'},
    {type: 'button', zone: 'center', code: 'Digit1', label: 'Pulse', variant: 'secondary'},
    {type: 'button', zone: 'center', code: 'Digit2', label: 'Beam', variant: 'secondary'},
    {type: 'button', zone: 'center', code: 'Digit3', label: 'Missile', variant: 'secondary'},
  ],
}
