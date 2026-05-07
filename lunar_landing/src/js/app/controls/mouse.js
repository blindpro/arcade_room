// Mouse adapter disabled for Lunar Lander. The game is keyboard + gamepad
// only — no pointer lock, no aim-with-mouse. Returning empty input from
// game()/ui() keeps app.controls.update() happy without ever requesting
// pointer lock.
app.controls.mouse = {
  game: () => ({}),
  ui: () => ({}),
  getInput: () => ({moveX: 0, moveY: 0, button: {}}),
}
