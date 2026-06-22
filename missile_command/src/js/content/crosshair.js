// Crosshair removed in overhaul. Batteries now fire zone-direct.
// This module is a no-op stub so references in other files don't throw.
content.crosshair = (() => {
  function noop() {}
  return {
    attach: noop,
    detach: noop,
    reset: noop,
    tick: noop,
    silenceAll: noop,
    getPosition: () => ({x: 0, y: 0.5}),
    state: {x: 0, y: 0.5},
  }
})()
