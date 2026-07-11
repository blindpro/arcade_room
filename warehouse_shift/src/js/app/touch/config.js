/**
 * WAREHOUSE SHIFT (Sokoban) — touch control layout.
 *
 * Left d-pad = walk/push the worker (arrow keys, read via app.controls.ui).
 * SCAN (Space) reads the four directions by ear; UNDO (KeyU) takes back the
 * last move; CYCLE (Tab) steps the audio focus target; RESTART (KeyR) resets
 * the level. Pause button (top-left, Escape) + announcement HUD are automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'Space', label: 'SCAN', variant: 'primary'},
    {type: 'button', zone: 'right', code: 'KeyU', label: 'UNDO', variant: 'secondary'},
    {type: 'button', zone: 'center', code: 'Tab', label: 'CYCLE', variant: 'secondary'},
    {type: 'button', zone: 'center', code: 'KeyR', label: 'RESTART', variant: 'danger'},
  ],
}
