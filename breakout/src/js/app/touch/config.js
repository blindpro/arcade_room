/**
 * BREAKOUT — touch control layout.
 *
 * Slide the paddle with the horizontal dpad (left thumb, arrows → paddle L/R).
 * LAUNCH (right thumb, Space) serves the ball at the start of a life and
 * releases balls held by the catch powerup. PING (Tab) plays the ball-locator
 * cue. Lasers auto-fire when the laser powerup is active — no fire button
 * needed. Escape (auto pause button) exits to the menu; the announcement HUD is
 * automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'Space', label: 'LAUNCH', variant: 'primary', hint: 'Launch / release ball'},
    {type: 'button', zone: 'center', code: 'Tab', label: 'PING', variant: 'secondary', hint: 'Locate ball'},
  ],
}
