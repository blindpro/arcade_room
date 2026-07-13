/**
 * AIRLIFT (rescue_mission) — touch control layout.
 *
 * Fly the rescue chopper Left/Right with the left thumb (hover still over a
 * survivor to winch, fly to BASE to deliver — both automatic), and drop a BOMB
 * (Space) with the right thumb to destroy tanks in your column. Pause (Esc)
 * and the announcement HUD are automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'Space', label: 'BOMB', variant: 'primary', hint: 'Drop a bomb'},
  ],
}
