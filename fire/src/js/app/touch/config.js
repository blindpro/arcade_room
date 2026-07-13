/**
 * FIRE! — touch control layout.
 *
 * Aim the hose left/right with the left thumb (mirrors the Left/Right arrow
 * keys), and hold SPRAY (Space) with the right thumb to blast water. The game
 * has no in-game pause (the game screen only ever transitions to gameover), so
 * the auto pause button is disabled. The announcement HUD is automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  pause: false,
  controls: [
    {type: 'dpad', zone: 'left', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'Space', label: 'SPRAY', variant: 'primary', hint: 'Hold to spray water'},
  ],
}
