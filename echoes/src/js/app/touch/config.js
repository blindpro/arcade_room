/**
 * Echoes — touch control layout.
 *
 * Sound-memory grid. Move the cursor with the 4-way pad, FLIP (Enter) the cell
 * under the cursor to hear its tone, and match pairs by ear. CELL (C) replays /
 * describes the current cell. Pause (Escape) and the announcement HUD (F1–F3
 * status) are automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'Enter', label: 'FLIP', variant: 'primary'},
    {type: 'button', zone: 'center', code: 'KeyC', label: 'CELL', variant: 'secondary', hint: 'Replay / describe current cell'},
  ],
}
