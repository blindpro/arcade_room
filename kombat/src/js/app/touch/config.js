/**
 * KOMBAT — touch control layout.
 *
 * The right thumb gets the same 2x2 the keyboard has, in the same orientation:
 * the two HIGH attacks sit above the two LOW ones, so "up on the screen is up on
 * the body" survives the move to touch. Left thumb walks; the block is a wide
 * hold-pad under the walk keys, because it is the only control here you keep
 * pressed.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', left: 'KeyA', right: 'KeyD', up: 'KeyW'},
    {type: 'button', zone: 'left', code: 'KeyS', label: 'Block', variant: 'secondary', hint: 'Hold to block high attacks'},
    {type: 'button', zone: 'right', code: 'KeyU', label: 'P▲', variant: 'secondary', hint: 'High punch'},
    {type: 'button', zone: 'right', code: 'KeyI', label: 'K▲', variant: 'primary', hint: 'High kick'},
    {type: 'button', zone: 'right', code: 'KeyJ', label: 'P▼', variant: 'secondary', hint: 'Low punch'},
    {type: 'button', zone: 'right', code: 'KeyK', label: 'K▼', variant: 'primary', hint: 'Low kick (sweep)'},
  ],
}
