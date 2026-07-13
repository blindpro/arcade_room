/**
 * TUBE (Tempest-style) — touch control layout.
 *
 * Move around the rim with a horizontal d-pad (ArrowLeft / ArrowRight — the
 * rotate axis the game reads; up/down don't move the player). FIRE (Space)
 * shoots down the current lane. Pause button (top-left, Escape) + the
 * announcement HUD are added automatically.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'Space', label: 'FIRE', variant: 'primary'},
  ],
}
