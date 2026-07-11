/**
 * Audio Pinball — touch control layout.
 *
 * Two big flipper buttons (left thumb = left flipper, right thumb = right
 * flipper; the left flipper also drives the upper-left mini-flipper, same as
 * the keyboard). A centre PLUNGE button: hold to charge, release to launch.
 * Pause (Escape) and the announcement HUD are automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'button', zone: 'left', code: 'KeyZ', label: 'LEFT', variant: 'primary', hint: 'Left flipper'},
    {type: 'button', zone: 'right', code: 'KeyM', label: 'RIGHT', variant: 'primary', hint: 'Right flipper'},
    {type: 'button', zone: 'center', code: 'Space', label: 'PLUNGE', variant: 'secondary', hint: 'Hold and release to launch'},
  ],
}
