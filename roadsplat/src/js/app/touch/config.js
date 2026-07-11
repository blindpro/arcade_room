/**
 * roadsplat — touch control layout.
 *
 * A Frogger-style crossing: the only input is advance/retreat across the road,
 * driven by app.controls.game().x (Up = forward, Down = back). So a single
 * vertical dpad on the arrow keys lives under the left thumb. Pause is this
 * game's P key (not Escape), so the auto pause button sends KeyP. The
 * announcement HUD is automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  pauseCode: 'KeyP',
  controls: [
    {type: 'dpad', zone: 'left', up: 'ArrowUp', down: 'ArrowDown', labels: {up: '▲', down: '▼'}},
  ],
}
