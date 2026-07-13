/**
 * Etch (drawing_board) — touch control layout.
 *
 * A 4-way pad moves the cursor. FILL fills the current cell (a wrong fill is a
 * mistake), MARK notes a cell as empty. ROW / COL read the current row's and
 * column's clue + scan — the deduction aids. Pause (Escape) and the
 * announcement HUD are automatic. (Read-row is KeyR and read-col is KeyC per
 * screen/game.js, not Space/C.)
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'Enter', label: 'FILL', variant: 'primary', hint: 'Fill this cell'},
    {type: 'button', zone: 'right', code: 'KeyX', label: 'MARK', variant: 'secondary', hint: 'Mark this cell empty'},
    {type: 'button', zone: 'center', code: 'KeyR', label: 'ROW', variant: 'secondary', hint: 'Read the row clue'},
    {type: 'button', zone: 'center', code: 'KeyC', label: 'COL', variant: 'secondary', hint: 'Read the column clue'},
  ],
}
