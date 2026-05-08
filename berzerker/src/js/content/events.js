// Tiny event bus for content modules. Modules emit named events; subscribers
// in `wiring.js` (and any other module) translate events into audio, HUD, and
// announcer calls. All cross-module wiring goes through this so individual
// modules don't grow direct dependencies on every sibling.
content.events = (() => {
  const listeners = {}

  return {
    on: function (name, fn) {
      if (!listeners[name]) listeners[name] = []
      listeners[name].push(fn)
      return this
    },
    off: function (name, fn) {
      if (!listeners[name]) return this
      listeners[name] = listeners[name].filter((f) => f !== fn)
      return this
    },
    emit: function (name, payload) {
      if (!listeners[name]) return this
      for (const fn of listeners[name].slice()) {
        try { fn(payload) } catch (e) { console.error(e) }
      }
      return this
    },
    clear: function () {
      for (const k in listeners) delete listeners[k]
      return this
    },
  }
})()
