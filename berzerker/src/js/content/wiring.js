// Cross-module event wiring. Sits alphabetically last among content
// modules so all module objects exist by the time we subscribe. Listeners
// translate game-side events into HUD/audio/announcer effects, keeping
// publishers (player, robots, otto) free of presentation concerns.
content.wiring = (() => {
  function wire() {
    const E = content.events

    // Player fire → robot hit-test in robots.js
    E.on('player-fire', (ev) => {
      try { content.robots.onPlayerFire(ev) } catch (_) {}
    })

    // Robot deaths → game scoring
    E.on('robot-killed', (ev) => {
      try { content.game.onRobotKilled(ev) } catch (_) {}
    })

    // Player death pipeline → announcer + game state machine
    E.on('player-dying', (ev) => {
      try { content.game.onPlayerDying(ev) } catch (_) {}
    })
    E.on('player-died', (ev) => {
      try { content.game.onPlayerDied(ev) } catch (_) {}
    })

    // Exit crossings → game (advance to next room)
    E.on('exit-crossed', (ev) => {
      try { content.game.onExitCrossed(ev) } catch (_) {}
    })

    // Otto spawn → no-op here (otto.js already announces); reserved for
    // future haptic / visual punctuation.
    E.on('otto-spawn', (_ev) => {})
  }

  return {wire}
})()

// Run wiring once content is fully loaded. Wrapped in setTimeout(0) so the
// engine and app namespaces have finished evaluation when subscribers
// touch them. The game.js FSM is consumer-facing; events are emitted from
// player.js / robots.js / otto.js / room.js as gameplay progresses.
setTimeout(() => {
  try { content.wiring.wire() } catch (e) { console.error(e) }
}, 0)
