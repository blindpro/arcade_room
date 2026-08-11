/**
 * SURGE — touch control layout.
 *
 * Left thumb drives the dpad: left/right steer lanes, up jumps (hold to jump
 * the drain/short-arc or clear hazards). Right thumb holds FIRE (Space) to
 * shoot — auto weapons hold-fire, laser charges while held, bow draws power.
 * Use item (\ ) is momentary; pause button sits top-left.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp'},
    {type: 'button', zone: 'right', code: 'Space', label: 'FIRE', variant: 'fire'},
    {type: 'button', zone: 'right', code: 'Backslash', label: 'ITEM', variant: 'item'},
  ],
}
