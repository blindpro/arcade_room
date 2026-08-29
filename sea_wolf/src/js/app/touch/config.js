/**
 * SEA WOLF — touch control layout.
 *
 * Left thumb slews the periscope across the forward arc; right thumb holds the
 * four things you actually do with it — fire, ping, dive, surface. Escape
 * (auto pause button) opens the pause screen; the announcement HUD is
 * automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'Space', label: 'Fire', variant: 'primary'},
    {type: 'button', zone: 'right', code: 'KeyP', label: 'Ping'},
    {type: 'button', zone: 'right', code: 'ArrowDown', label: 'Deep'},
    {type: 'button', zone: 'right', code: 'ArrowUp', label: 'Up'},
  ],
}
