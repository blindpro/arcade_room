/**
 * SKYDIVE — touch control layout.
 *
 * You dive from thousands of meters and the only steering is left/right —
 * glide sideways with the horizontal dpad (left thumb, arrows) to centre the
 * next crystal in the stereo field; fly over an aligned crystal and you
 * collect it automatically. Escape (auto pause button) opens the pause screen;
 * the announcement HUD is automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', left: 'ArrowLeft', right: 'ArrowRight'},
  ],
}
