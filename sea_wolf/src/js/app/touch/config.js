/**
 * SEA WOLF — touch control layout.
 *
 * Left thumb works the rudder; right thumb holds the four things you actually
 * do — fire, ping, and a rung down or up the depth ladder. Escape (auto pause
 * button) opens the pause screen; the announcement HUD is automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'Space', label: 'Fire', variant: 'primary'},
    {type: 'button', zone: 'right', code: 'KeyP', label: 'Ping'},
    {type: 'button', zone: 'right', code: 'PageDown', label: 'Deeper'},
    {type: 'button', zone: 'right', code: 'PageUp', label: 'Shallower'},
  ],
}
