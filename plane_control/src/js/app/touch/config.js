/**
 * Approach (plane_control) — touch control layout.
 *
 * An air-traffic-control "cycle + command" game, not a move+shoot game. NEXT
 * (Tab) cycles the selected plane; the left dpad vectors it (Left/Right turn,
 * Up = direct to the field); LAND (L) clears it to land and HOLD (H) parks it
 * in an orbit; INFO (Space) reads the selected plane's bearing/distance/fuel.
 *
 * Pause is this game's P key — Escape here QUITS to the menu, so the auto pause
 * button is remapped to KeyP. The announcement HUD is automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  pauseCode: 'KeyP',
  controls: [
    {type: 'dpad', zone: 'left', up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight', labels: {up: '▲', left: '◀', right: '▶'}},
    {type: 'button', zone: 'center', code: 'Tab', label: 'NEXT', variant: 'secondary', hint: 'Select next plane'},
    {type: 'button', zone: 'center', code: 'Space', label: 'INFO', variant: 'secondary', hint: 'Read selected plane'},
    {type: 'button', zone: 'right', code: 'KeyL', label: 'LAND', variant: 'primary', hint: 'Clear to land'},
    {type: 'button', zone: 'right', code: 'KeyH', label: 'HOLD', variant: 'secondary', hint: 'Hold / orbit'},
  ],
}
