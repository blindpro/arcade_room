/**
 * TENNIS — touch control layout.
 *
 * Move around your half of the court with the 4-way dpad (left thumb, arrows).
 * Swing / serve with the right thumb: D forehand, A backhand, S smash — the
 * same edge-detected action keys the game screen reads, which also initiate the
 * serve when you are the server. Escape (auto pause button) leaves the match;
 * the announcement HUD is automatic. Single-player vs CPU maps here; the remote
 * peer in multiplayer supplies its own input (out of scope).
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'KeyD', label: 'FORE', variant: 'primary', hint: 'Forehand / serve'},
    {type: 'button', zone: 'right', code: 'KeyA', label: 'BACK', variant: 'secondary', hint: 'Backhand'},
    {type: 'button', zone: 'right', code: 'KeyS', label: 'SMASH', variant: 'danger', hint: 'Smash'},
  ],
}
