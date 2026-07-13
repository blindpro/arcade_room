/**
 * Pac-Man — touch control layout.
 *
 * Classic 4-way maze movement: tap/hold a direction to queue the next turn
 * (arrows drive content.pacman.setQueuedDirection). A single d-pad is the whole
 * game. Pause button (top-left, Escape) and the announcement HUD are automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'},
  ],
}
