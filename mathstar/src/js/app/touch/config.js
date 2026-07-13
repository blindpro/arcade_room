// Per-game touch-control config (read by app/touch.js on touch devices).
//
// mathstar is a digit-entry arcade: each round shows an arithmetic operation
// and the player types the answer digit-by-digit before the musical window
// closes. The game screen (screen/game.js, id 'game') captures window keydown
// and routes '0'..'9' (digit row + numpad, matched by e.key or a Digit/Numpad
// code) to content.game.handleDigit(d). Escape/Backspace quits to the menu via
// app.controls back — the auto pause button (Escape) covers that.
//
// Mobile needs a full 0-9 keypad. All ten digits live in the bottom-centre
// zone, which wraps (wrap-reverse) into a tidy grid within thumb reach and
// clear of the top-centre announcement HUD banner. Escape (auto pause) quits.
app.touch.config = {
  gameScreens: ['game'],
  hud: true,
  pause: true, // Escape -> quit to menu
  controls: [
    {type: 'button', zone: 'center', code: 'Digit1', label: '1', variant: 'secondary'},
    {type: 'button', zone: 'center', code: 'Digit2', label: '2', variant: 'secondary'},
    {type: 'button', zone: 'center', code: 'Digit3', label: '3', variant: 'secondary'},
    {type: 'button', zone: 'center', code: 'Digit4', label: '4', variant: 'secondary'},
    {type: 'button', zone: 'center', code: 'Digit5', label: '5', variant: 'secondary'},
    {type: 'button', zone: 'center', code: 'Digit6', label: '6', variant: 'secondary'},
    {type: 'button', zone: 'center', code: 'Digit7', label: '7', variant: 'secondary'},
    {type: 'button', zone: 'center', code: 'Digit8', label: '8', variant: 'secondary'},
    {type: 'button', zone: 'center', code: 'Digit9', label: '9', variant: 'secondary'},
    {type: 'button', zone: 'center', code: 'Digit0', label: '0', variant: 'secondary'},
  ],
}
