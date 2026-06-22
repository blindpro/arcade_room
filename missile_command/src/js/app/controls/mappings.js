// Missile Command bindings (overhaul): A / S / D / Space fire batteries
// directly. No crosshair movement — the game is zone-based.
//
// A = fire left battery
// S = fire center battery
// D = fire right battery
// Space = fire center battery (alternative)
// Esc/P = pause
app.controls.mappings = {
  // Movement axes — unused in overhaul but keep minimal defs for controls.
  moveAxis: [],
  moveBackward: [],
  moveForward: [],
  strafeAxis: [],
  strafeLeft: [],
  strafeRight: [],
  turnAxis: [],
  turnLeft: [],
  turnRight: [],

  // Menu navigation
  uiAxisVertical:   [{type: 'gamepad', key: 1}],
  uiAxisHorizontal: [{type: 'gamepad', key: 0}],
  uiDown: [
    {type: 'keyboard', key: 'ArrowDown'},
    {type: 'keyboard', key: 'KeyS'},
    {type: 'gamepad', key: 13},
  ],
  uiLeft: [
    {type: 'keyboard', key: 'ArrowLeft'},
    {type: 'keyboard', key: 'KeyA'},
    {type: 'gamepad', key: 14},
  ],
  uiRight: [
    {type: 'keyboard', key: 'ArrowRight'},
    {type: 'keyboard', key: 'KeyD'},
    {type: 'gamepad', key: 15},
  ],
  uiUp: [
    {type: 'keyboard', key: 'ArrowUp'},
    {type: 'keyboard', key: 'KeyW'},
    {type: 'gamepad', key: 12},
  ],
  back: [
    {type: 'keyboard', key: 'Escape'},
    {type: 'keyboard', key: 'Backspace'},
    {type: 'gamepad', key: 1},
    {type: 'mouse', key: 3},
  ],
  confirm: [
    {type: 'gamepad', key: 0},
  ],
  pause: [
    {type: 'keyboard', key: 'Escape'},
    {type: 'gamepad', key: 9},
  ],
  start: [
    {type: 'gamepad', key: 9},
  ],
}
