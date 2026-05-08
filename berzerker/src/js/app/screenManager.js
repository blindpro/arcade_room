app.screenManager = (() => {
  const screens = new Map()

  const machine = engine.tool.fsm.create({
    state: 'none',
    transition: {
      none: {
        activate: function () {
          // Honor diagnostic hash routes (#test, #learn) for spatial-audio
          // verification and the sound dictionary. CLAUDE.md "Hash routing
          // in screenManager" — this is the only place to read the hash;
          // by the time the FSM has reached `menu` the hash is too late.
          const hash = (window.location.hash || '').replace(/^#/, '').toLowerCase()
          if (hash === 'test' || hash === 'learn') {
            this.change(hash)
            return
          }
          this.change('menu')
        },
      },
    },
  })

  let current

  machine.on('enter', (e, ...args) => {
    current = screens.get(e.currentState)

    if (current) {
      current.enter(e, ...args)
    }
  })

  machine.on('exit', (e, ...args) => {
    if (current) {
      current.exit(e, ...args)
    }

    current = undefined
  })

  return {
    current: () => current,
    dispatch: function (...args) {
      machine.dispatch(...args)

      return this
    },
    invent: function (definition = {}, prototype = app.screen.base) {
      const screen = Object.setPrototypeOf({...definition}, prototype)

      screens.set(screen.id, screen)
      machine.transition[screen.id] = screen.transitions

      return screen
    },
    import: function (e) {
      for (const screen of screens.values()) {
        screen.onImport(e)
      }

      return this
    },
    is: (...args) => machine.is(...args),
    on: function (...args) {
      machine.on(...args)

      return this
    },
    one: function (...args) {
      machine.one(...args)

      return this
    },
    off: function (...args) {
      machine.off(...args)

      return this
    },
    ready: function () {
      for (const screen of screens.values()) {
        screen.ready()
      }

      return this
    },
    reset: function () {
      for (const screen of screens.values()) {
        screen.reset()
      }

      return this
    },
    update: function (e) {
      if (current) {
        current.onFrame(e)
      }

      return this
    },
  }
})()

engine.loop.on('frame', (e) => app.screenManager.update(e))
engine.state.on('import', (e) => app.screenManager.import(e))
engine.state.on('reset', () => app.screenManager.reset())
