/**
 * neverStop — touch control layout.
 *
 * The car never accelerates or brakes by hand — you only STEER. A horizontal
 * L/R pad (ArrowLeft/ArrowRight = the turn axis) holds the wheel over. BOOST
 * (KeyG) spends a collected boost item. Pause (top-left) and the announcement
 * HUD are automatic — Escape returns to menu.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'KeyG', label: 'BOOST', variant: 'secondary', hint: 'Use a boost item'},
  ],
}
