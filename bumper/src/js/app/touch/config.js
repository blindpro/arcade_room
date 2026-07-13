/**
 * BUMPER CARS — touch control layout.
 *
 * A 4-way pad drives (Up accelerate, Down reverse, Left/Right steer). HORN
 * (Space) hold-to-honk works in every mode. The right-hand pads are the arcade
 * / deathmatch item toolkit: FIRE shoots a bullet straight ahead (S = centre
 * nudge), MINE drops a mine, BOOST is the 3s speed burst, TELE teleports to a
 * random open spot. Pause (Escape) and the announcement HUD are automatic.
 * P2 touch is out of scope (local/network second players use keyboard/gamepad).
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'KeyS', label: 'FIRE', variant: 'primary', hint: 'Fire a bullet'},
    {type: 'button', zone: 'right', code: 'KeyF', label: 'MINE', variant: 'secondary', hint: 'Drop a mine'},
    {type: 'button', zone: 'right', code: 'KeyH', label: 'TELE', variant: 'secondary', hint: 'Teleport'},
    {type: 'button', zone: 'center', code: 'KeyG', label: 'BOOST', variant: 'secondary', hint: 'Speed burst'},
    {type: 'button', zone: 'center', code: 'Space', label: 'HORN', variant: 'secondary', hint: 'Hold to honk'},
  ],
}
