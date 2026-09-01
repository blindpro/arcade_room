// KOMBAT control map.
//
// The match itself does NOT read these — app.screen.game reads raw key codes,
// because a fighter needs its own edge tracking per button and the generic
// action layer has no concept of "one attack per frame, first in U I J K
// order". What lives here is the menu layer plus the gamepad axes, which the
// shared app code does use.
//
// The gamepad face buttons are laid out to match the keyboard's 2x2: the top
// two face buttons are the high attacks, the bottom two are the low ones, which
// keeps "up on the pad is up on the body" true on both devices.
app.controls.mappings = {
  moveAxis: [
    {type: 'gamepad', key: 1},
  ],
  strafeAxis: [
    {type: 'gamepad', key: 0},
  ],
  moveLeft: [
    {type: 'keyboard', key: 'KeyA'},
    {type: 'keyboard', key: 'ArrowLeft'},
    {type: 'keyboard', key: 'Numpad4'},
    {type: 'gamepad', key: 14},
  ],
  moveRight: [
    {type: 'keyboard', key: 'KeyD'},
    {type: 'keyboard', key: 'ArrowRight'},
    {type: 'keyboard', key: 'Numpad6'},
    {type: 'gamepad', key: 15},
  ],
  jump: [
    {type: 'keyboard', key: 'KeyW'},
    {type: 'keyboard', key: 'ArrowUp'},
    {type: 'keyboard', key: 'Numpad8'},
    {type: 'gamepad', key: 12},
  ],
  block: [
    {type: 'keyboard', key: 'KeyS'},
    {type: 'keyboard', key: 'ArrowDown'},
    {type: 'keyboard', key: 'Numpad5'},
    {type: 'gamepad', key: 6},
    {type: 'gamepad', key: 7},
  ],
  highPunch: [
    {type: 'keyboard', key: 'KeyU'},
    {type: 'gamepad', key: 3},
  ],
  highKick: [
    {type: 'keyboard', key: 'KeyI'},
    {type: 'gamepad', key: 1},
  ],
  lowPunch: [
    {type: 'keyboard', key: 'KeyJ'},
    {type: 'gamepad', key: 2},
  ],
  lowKick: [
    {type: 'keyboard', key: 'KeyK'},
    {type: 'gamepad', key: 0},
  ],
  uiAxisVertical: [
    {type: 'gamepad', key: 1},
  ],
  uiAxisHorizontal: [
    {type: 'gamepad', key: 0},
  ],
  uiDown: [
    {type: 'keyboard', key: 'ArrowDown'},
    {type: 'keyboard', key: 'KeyS'},
    {type: 'keyboard', key: 'Numpad5'},
    {type: 'gamepad', key: 13},
  ],
  uiLeft: [
    {type: 'keyboard', key: 'ArrowLeft'},
    {type: 'keyboard', key: 'KeyA'},
    {type: 'keyboard', key: 'Numpad4'},
    {type: 'gamepad', key: 14},
  ],
  uiRight: [
    {type: 'keyboard', key: 'ArrowRight'},
    {type: 'keyboard', key: 'KeyD'},
    {type: 'keyboard', key: 'Numpad6'},
    {type: 'gamepad', key: 15},
  ],
  uiUp: [
    {type: 'keyboard', key: 'ArrowUp'},
    {type: 'keyboard', key: 'KeyW'},
    {type: 'keyboard', key: 'Numpad8'},
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
    {type: 'keyboard', key: 'Backspace'},
    {type: 'gamepad', key: 9},
    {type: 'mouse', key: 3},
  ],
  start: [
    {type: 'gamepad', key: 9},
  ],
}
