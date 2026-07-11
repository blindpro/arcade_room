/**
 * AIR HOCKEY — touch control layout.
 *
 * Your mallet moves in 2D within your half; slide it with the 4-way dpad (left
 * thumb, arrows). There is NO strike button by design — you add pace by driving
 * the mallet through the puck, so movement is the whole game. Escape (auto pause
 * button) exits to the menu; the announcement HUD mirrors score / goals / danger.
 * Single-player vs CPU only (local 2-player is not shipped).
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'},
  ],
}
