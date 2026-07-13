/**
 * CRAZY CLIMBER — touch control layout.
 *
 * Two-handed independent grip. The LEFT vertical pad is the left hand
 * (A = reach up, Z = drop down) and the RIGHT vertical pad is the right hand
 * (K = reach up, M = drop down). Dropping a hand also ducks that side to dodge
 * falling pots / the gorilla's swipe. Pause (Esc) and the HUD are automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', up: 'KeyA', down: 'KeyZ', labels: {up: 'L ▲', down: 'L ▼'}},
    {type: 'dpad', zone: 'right', up: 'KeyK', down: 'KeyM', labels: {up: 'R ▲', down: 'R ▼'}},
  ],
}
