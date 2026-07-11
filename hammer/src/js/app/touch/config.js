/**
 * HAMMER OF GLORY! — touch control layout.
 *
 * One-button game: tap SMASH at the moment the sliding pitch matches the
 * target (Space). The announcement HUD is automatic.
 *
 * pause:false — the game screen has NO Escape/pause handling (its only exit
 * is game-over), so an auto pause button sending Escape would be a dead
 * button. Leaving pause off keeps the overlay honest.
 */
app.touch.config = {
  gameScreens: ['game'],
  pause: false,
  controls: [
    {type: 'button', zone: 'center', code: 'Space', label: 'SMASH', variant: 'primary', hint: 'Tap to strike the hammer'},
  ],
}
