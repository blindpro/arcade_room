/**
 * BRAWL! — touch control layout (PLAYER 1 / vs-CPU).
 *
 * LEFT dpad walks the arena (WASD). Attacks sit under the right thumb:
 * P▲ / P▼ = high / low punch (T / G), K▲ / K▼ = high / low kick (U / J).
 * BLOCK (top-right, Period) guards. Pause (Esc) and the announcement HUD are
 * automatic. 2-player local touch is out of scope — a second on-screen pad
 * would overlap Player 1's, so only P1's controls are mapped.
 */
app.touch.config = {
  gameScreens: ['game'],
  controls: [
    {type: 'dpad', zone: 'left', up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD'},
    {type: 'button', zone: 'center', code: 'KeyT', label: 'P▲', variant: 'secondary', hint: 'High punch'},
    {type: 'button', zone: 'center', code: 'KeyG', label: 'P▼', variant: 'secondary', hint: 'Low punch'},
    {type: 'button', zone: 'right', code: 'KeyU', label: 'K▲', variant: 'primary', hint: 'High kick'},
    {type: 'button', zone: 'right', code: 'KeyJ', label: 'K▼', variant: 'secondary', hint: 'Low kick'},
    {type: 'button', zone: 'topRight', code: 'Period', label: 'BLOCK', variant: 'secondary', hint: 'Block'},
  ],
}
