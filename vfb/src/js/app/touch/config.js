/**
 * VFB — touch control layout.
 *
 * Vertical-scrolling shooter. The 4-way pad strafes left/right and shifts speed
 * up/down (the same Arrow keys the game reads). BEAM (Z) is the primary held
 * autofire; BOMB (X) drops ground ordnance; BURST (C) triggers a smart-bomb
 * screen clear from inventory.
 *
 * NOTE: pause in this game is P — Escape QUITS to the menu — so the auto pause
 * button is remapped to KeyP via pauseCode. The announcement HUD (F1–F4 status)
 * is automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  pauseCode: 'KeyP',
  controls: [
    {type: 'dpad', zone: 'left', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'KeyZ', label: 'BEAM', variant: 'primary'},
    {type: 'button', zone: 'right', code: 'KeyX', label: 'BOMB', variant: 'secondary'},
    {type: 'button', zone: 'center', code: 'KeyC', label: 'BURST', variant: 'danger', hint: 'Smart-bomb screen clear (limited)'},
  ],
}
