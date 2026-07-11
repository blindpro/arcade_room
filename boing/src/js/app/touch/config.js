/**
 * BOING BOING (ALOFT) — touch control layout.
 *
 * You bounce upward forever; the only steering is left/right — slide sideways
 * with the horizontal dpad (left thumb, arrows) to line up with the next
 * platform beacon. SHOOT (right thumb, Space) fires at the floating sentinels
 * (edge-triggered, so a tap = one shot). Escape (auto pause button) is this
 * game's pause key and opens the pause screen; the announcement HUD is automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'Space', label: 'SHOOT', variant: 'primary', hint: 'Shoot sentinel'},
  ],
}
