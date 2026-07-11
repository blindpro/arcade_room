/**
 * Audio Flappy — touch control layout.
 *
 * One-button game: tap FLAP to beat the wings (Space). Each tap is one
 * edge-triggered flap, exactly like the keyboard. Pause (top-left) and the
 * announcement HUD are automatic — Escape returns to menu.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'button', zone: 'center', code: 'Space', label: 'FLAP', variant: 'primary', hint: 'Tap to flap'},
  ],
}
