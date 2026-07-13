/**
 * PONG — touch control layout.
 *
 * Paddle slides along your end of the table (left thumb, horizontal dpad).
 * Swing with the right thumb: A angles the ball left, S swings straight, D
 * angles it right (same keys the game reads in the swing handler). Escape
 * (auto pause button) leaves the match; the announcement HUD is automatic.
 * The same P1 controls apply in local host play; remote-peer touch is out of
 * scope.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'KeyA', label: '◀', variant: 'secondary', hint: 'Swing left'},
    {type: 'button', zone: 'right', code: 'KeyS', label: 'HIT', variant: 'primary', hint: 'Swing straight'},
    {type: 'button', zone: 'right', code: 'KeyD', label: '▶', variant: 'secondary', hint: 'Swing right'},
  ],
}
