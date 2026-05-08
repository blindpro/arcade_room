// Lunar Lander control mappings (1D model).
//
// One axis: thrust on/off. Spacebar (or gamepad A / right trigger) holds
// the thruster; Tab toggles. There is no rotation or strafing in this
// game — those mappings stay empty so the keyboard adapter never
// produces signal for them.
app.controls.mappings = {
  // -- Game inputs --
  moveAxis: [],
  moveBackward: [],
  moveForward: [
    {type: 'keyboard', key: 'Space'},
    {type: 'keyboard', key: 'ArrowUp'},
    {type: 'keyboard', key: 'KeyW'},
    {type: 'gamepad', key: 0},
    {type: 'gamepad', key: 7},
  ],
  strafeAxis: [],
  strafeLeft: [],
  strafeRight: [],
  turnAxis: [],
  turnLeft: [],
  turnRight: [],

  // -- UI navigation --
  uiAxisVertical: [
    {type: 'gamepad', key: 1},
  ],
  uiAxisHorizontal: [
    {type: 'gamepad', key: 0},
  ],
  uiDown: [
    {type: 'keyboard', key: 'ArrowDown'},
    {type: 'gamepad', key: 13},
  ],
  uiLeft: [
    {type: 'keyboard', key: 'ArrowLeft'},
    {type: 'gamepad', key: 14},
  ],
  uiRight: [
    {type: 'keyboard', key: 'ArrowRight'},
    {type: 'gamepad', key: 15},
  ],
  uiUp: [
    {type: 'keyboard', key: 'ArrowUp'},
    {type: 'gamepad', key: 12},
  ],
  back: [
    {type: 'keyboard', key: 'Escape'},
    {type: 'keyboard', key: 'Backspace'},
    {type: 'gamepad', key: 1},
  ],
  confirm: [
    {type: 'gamepad', key: 0},
  ],
  pause: [
    {type: 'keyboard', key: 'Escape'},
    {type: 'keyboard', key: 'Backspace'},
    {type: 'gamepad', key: 9},
  ],
  start: [
    {type: 'gamepad', key: 9},
  ],
}
