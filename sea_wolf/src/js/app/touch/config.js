/**
 * SEA WOLF — touch control layout.
 *
 * Left thumb works the rudder; right thumb holds the things you actually do —
 * fire, the two sonars, and a rung down or up the depth ladder. Escape (auto
 * pause button) opens the pause screen; the announcement HUD is automatic.
 *
 * Sweep earns a button of its own rather than sharing with Ping: on touch it
 * is the more useful of the two, because it answers at once and costs nothing,
 * and a thumb has no F-key to fall back on.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'Space', label: 'Fire', variant: 'primary'},
    {type: 'button', zone: 'right', code: 'KeyF', label: 'Sweep'},
    {type: 'button', zone: 'right', code: 'KeyS', label: 'Ping'},
    {type: 'button', zone: 'right', code: 'PageDown', label: 'Deeper'},
    {type: 'button', zone: 'right', code: 'PageUp', label: 'Shallower'},
  ],
}
