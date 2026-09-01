/**
 * JOUST — touch control layout.
 *
 * The game only has two-and-a-half controls, which is the whole point, so the
 * touch layout is the whole game: left thumb leans you left and right, right
 * thumb is the wing. The flap is a press rather than a hold, so it wants to be
 * a big target you can tap several times a second. Escape (auto pause button)
 * opens the pause screen; the announcement HUD is automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'Space', label: 'Flap', variant: 'primary'},
  ],
}
