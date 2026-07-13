/**
 * asteroids — touch control layout.
 *
 * Left thumb: a 4-way dpad on the arrow keys — Up thrusts, Down soft-brakes,
 * Left/Right rotate the ship. Right thumb: three directional fire buttons that
 * mirror the A / S / D fire keys (left-muzzle, centre, right-muzzle). BOMB
 * detonates a proton bomb (Space) and WARP is hyperspace (Shift). Pause (Esc)
 * and the announcement HUD are automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'KeyA', label: 'L', variant: 'secondary', hint: 'Fire left'},
    {type: 'button', zone: 'right', code: 'KeyS', label: 'FIRE', variant: 'primary', hint: 'Fire centre'},
    {type: 'button', zone: 'right', code: 'KeyD', label: 'R', variant: 'secondary', hint: 'Fire right'},
    {type: 'button', zone: 'center', code: 'Space', label: 'BOMB', variant: 'danger', hint: 'Proton bomb'},
    {type: 'button', zone: 'center', code: 'ShiftLeft', label: 'WARP', variant: 'secondary', hint: 'Hyperspace'},
  ],
}
