/**
 * BERZERK! — touch control layout (twin-stick).
 *
 * Left d-pad = MOVE (arrow keys, 8-way when two are held). Right d-pad = FIRE
 * DIRECTION (WASD — the game's default fire cluster); pressing a fire direction
 * stops movement and shoots that way, exactly like the keyboard. Both play
 * screens ('game' and the brief 'ready' beat between rooms) show the overlay so
 * it doesn't flicker between rooms. Pause (top-left, Escape) + HUD are automatic.
 */
app.touch.config = {
  gameScreens: ['game', 'ready'],
  controls: [
    {type: 'dpad', zone: 'left', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'dpad', zone: 'right', up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD'},
  ],
}
