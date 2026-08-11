/**
 * PIPE — touch control layout.
 *
 * You fly down a widening metal pipe and the only steering is left/right —
 * glide sideways with the horizontal dpad (left thumb, arrows) to centre the
 * next ring's opening hum in the stereo field and thread the opening; miss it
 * and you slam into the wall. Escape (auto pause button) opens the pause
 * screen; the announcement HUD is automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', left: 'ArrowLeft', right: 'ArrowRight'},
  ],
}
