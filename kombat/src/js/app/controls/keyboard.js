app.controls.keyboard = {
  game: (mappings) => {
    const keys = engine.input.keyboard.get(),
      state = {}

    const checkMapping = (value, mapping) => {
      return value || (mapping.type == 'keyboard' && keys[mapping.key])
    }

    const moveBackward = app.controls.bindings(mappings, 'moveBackward').reduce(checkMapping, false),
      moveForward = app.controls.bindings(mappings, 'moveForward').reduce(checkMapping, false),
      strafeLeft = app.controls.bindings(mappings, 'strafeLeft').reduce(checkMapping, false),
      strafeRight = app.controls.bindings(mappings, 'strafeRight').reduce(checkMapping, false),
      turnLeft = app.controls.bindings(mappings, 'turnLeft').reduce(checkMapping, false),
      turnRight = app.controls.bindings(mappings, 'turnRight').reduce(checkMapping, false)

    if (moveBackward && !moveForward) {
      state.x = -1
    } else if (moveForward && !moveBackward) {
      state.x = 1
    }

    if (strafeLeft && !strafeRight) {
      state.y = 1
    } else if (strafeRight && !strafeLeft) {
      state.y = -1
    }

    if (turnLeft && !turnRight) {
      state.rotate = 1
    } else if (turnRight && !turnLeft) {
      state.rotate = -1
    }

    return state
  },
  ui: (mappings) => {
    const keys = engine.input.keyboard.get(),
      state = {}

    const checkMapping = (value, mapping) => {
      return value || (mapping.type == 'keyboard' && keys[mapping.key])
    }

    // Mapped keys
    for (const [mapping, name] of Object.entries({
      back: 'back',
      pause: 'pause',
      uiDown: 'down',
      uiLeft: 'left',
      uiRight: 'right',
      uiUp: 'up',
    })) {
      if (app.controls.bindings(mappings, mapping).reduce(checkMapping, false)) {
        state[name] = true
      }
    }

    // Special keys
    for (const [key, name] of Object.entries({
      Enter: 'enter',
      Space: 'space',
      Tab: 'tab',
    })) {
      if (keys[key]) {
        state[name] = true
      }
    }

    // Focus keys
    ;[
      'Digit1',
      'Digit2',
      'Digit3',
      'Digit4',
      'Digit5',
      'Digit6',
      'Digit7',
      'Digit8',
      'Digit9',
      'Digit0',
    ].forEach((key, index) => {
      if (keys[key]) {
        state.focus = index
      }
    })

    return state
  },
}
