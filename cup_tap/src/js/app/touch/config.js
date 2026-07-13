/**
 * TAPPER! (cup_tap) — touch control layout.
 *
 * Lane-walking bartender. The 4-way pad moves you: up/down swap lanes
 * (ArrowUp/ArrowDown), left/right walk along the current bar
 * (ArrowLeft/ArrowRight). POUR (Space) holds to fill a mug at the kegs and
 * releases to sling it — the same held-action key the keyboard uses; it also
 * catches returning empties. Pause (top-left) and the announcement HUD are
 * automatic — Escape pauses.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'Space', label: 'POUR', variant: 'primary', hint: 'Hold to pour, release to sling'},
  ],
}
