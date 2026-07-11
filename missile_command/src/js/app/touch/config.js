/**
 * MISSILE COMMAND — touch control layout.
 *
 * Free-aim crosshair: drag the AIM pad (left thumb) to sweep the crosshair in
 * X and Y — it holds the arrow keys the game integrates into cursor position.
 * FIRE launches from the nearest battery with ammo (Space). The three L/C/R
 * pads fire a specific silo (Z / X / C) for players who want to choose which
 * battery intercepts. Pause (Esc) and the announcement HUD are automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'aim', zone: 'left', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', label: 'AIM'},
    {type: 'button', zone: 'right', code: 'Space', label: 'FIRE', variant: 'primary'},
    {type: 'button', zone: 'center', code: 'KeyZ', label: 'L', variant: 'secondary', hint: 'Left battery'},
    {type: 'button', zone: 'center', code: 'KeyX', label: 'C', variant: 'secondary', hint: 'Centre battery'},
    {type: 'button', zone: 'center', code: 'KeyC', label: 'R', variant: 'secondary', hint: 'Right battery'},
  ],
}
