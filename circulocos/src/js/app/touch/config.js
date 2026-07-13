/**
 * Vault (circulocos) — touch control layout.
 *
 * Peg solitaire. Move the cursor with the 4-way pad, tap SELECT (Enter) to pick
 * up the peg under the cursor, then tap a direction to vault it. SCAN (Space)
 * auditions the four neighbours for planning; UNDO (U) walks a move back. Pause
 * (Escape) and the announcement HUD (F1–F4 status) are automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'Enter', label: 'SELECT', variant: 'primary', hint: 'Pick up peg, then tap a direction to jump'},
    {type: 'button', zone: 'center', code: 'Space', label: 'SCAN', variant: 'secondary', hint: 'Audition the four neighbours'},
    {type: 'button', zone: 'center', code: 'KeyU', label: 'UNDO', variant: 'secondary'},
  ],
}
