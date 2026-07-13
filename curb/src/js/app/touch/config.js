/**
 * CURB — touch control layout.
 *
 * A single vertical pad: UP steps toward the far curb, DOWN steps back. The
 * SCORE button speaks the current score (Space). Pause (Escape → menu) and the
 * announcement HUD are automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', up: 'ArrowUp', down: 'ArrowDown'},
    {type: 'button', zone: 'center', code: 'Space', label: 'SCORE', variant: 'secondary', hint: 'Hear your score'},
  ],
}
