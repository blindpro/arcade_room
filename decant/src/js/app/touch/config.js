/**
 * Decant — touch control layout.
 *
 * Water-sort puzzle on a 1-D row of vials. The horizontal pad moves the cursor
 * left/right along the row. POUR (Enter) picks up the top run of the current
 * vial as the source, then a second tap pours it onto the target. UNDO (U)
 * reverts and refunds a move; SCAN (C) plays the current vial's stack
 * bottom-to-top. Pause (Escape) and the announcement HUD (F1–F3 status) are
 * automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'Enter', label: 'POUR', variant: 'primary', hint: 'Pick up source, then tap again to pour'},
    {type: 'button', zone: 'center', code: 'KeyC', label: 'SCAN', variant: 'secondary', hint: 'Play the current vial bottom to top'},
    {type: 'button', zone: 'center', code: 'KeyU', label: 'UNDO', variant: 'secondary'},
  ],
}
