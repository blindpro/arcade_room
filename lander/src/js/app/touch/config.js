/**
 * Lunar Lander — touch control layout.
 *
 * One-button game: hold THRUST to fire the descent engine (Space held).
 * Releasing cuts thrust. Pause (top-left) and the announcement HUD are
 * automatic — Escape pauses / returns to menu.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'button', zone: 'center', code: 'Space', label: 'THRUST', variant: 'primary', hint: 'Hold to fire thrusters'},
  ],
}
