/**
 * DEEK OUT — touch control layout.
 *
 * A 4-way pad rolls the robot (hold two directions for a diagonal). The four
 * inventory items map to their own pads: NEUT (E, neutralizer), COLL (C,
 * collector), WALL (W, wall fusion), OIL (S, oil slick). END (Space) ends a
 * level early when two or fewer coins remain. The auto pause button sends
 * Escape, which in this game returns to the main menu (KeyP is the in-place
 * pause). The announcement HUD is automatic.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'},
    {type: 'button', zone: 'right', code: 'KeyE', label: 'NEUT', variant: 'secondary', hint: 'Neutralizer'},
    {type: 'button', zone: 'right', code: 'KeyC', label: 'COLL', variant: 'secondary', hint: 'Collector'},
    {type: 'button', zone: 'center', code: 'KeyW', label: 'WALL', variant: 'secondary', hint: 'Wall fusion'},
    {type: 'button', zone: 'center', code: 'KeyS', label: 'OIL', variant: 'secondary', hint: 'Oil slick'},
    {type: 'button', zone: 'topRight', code: 'Space', label: 'END', variant: 'danger', hint: 'End level early'},
  ],
}
