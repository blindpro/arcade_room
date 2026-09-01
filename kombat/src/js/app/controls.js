app.controls = (() => {
  const gameDefaults = {
    rotate: 0,
    x: 0,
    y: 0,
    z: 0,
  }

  let gameCache = {...gameDefaults},
    uiCache = {},
    uiDelta = {}

  function updateGame() {
    const mappings = app.controls.mappings

    gameCache = {
      ...gameDefaults,
      ...app.controls.gamepad.game(mappings),
      ...app.controls.keyboard.game(mappings),
      ...app.controls.mouse.game(mappings),
    }
  }

  function updateUi() {
    const mappings = app.controls.mappings

    const values = {
      ...app.controls.gamepad.ui(mappings),
      ...app.controls.keyboard.ui(mappings),
      ...app.controls.mouse.ui(mappings),
    }

    uiDelta = {}

    for (const key in values) {
      if (!(key in uiCache)) {
        uiDelta[key] = values[key]
      }
    }

    uiCache = values
  }

  // Every game in the collection shares these readers, but not every game has
  // every action. KOMBAT has no forward/back/strafe/turn model at all — it is a
  // fighter on a single line, and its game screen reads raw key codes — so
  // mappings.js does not define those actions. Dereferencing a missing one used
  // to throw inside the loop's frame handler, which killed the requestAnimation
  // Frame chain outright: the game booted, played its round bell, and then sat
  // there receiving no frames at all. An undefined action is a legitimate
  // "this game does not have that control", so it reads as no bindings.
  const NO_BINDINGS = []

  return {
    bindings: (mappings, name) => (mappings && mappings[name]) || NO_BINDINGS,
    game: () => ({...gameCache}),
    ui: () => ({...uiDelta}),
    reset: function () {
      gameCache = {}
      uiCache = {}
      uiDelta = {}

      return this
    },
    update: function () {
      updateGame()
      updateUi()

      return this
    },
  }
})()

engine.loop.on('frame', () => app.controls.update())
