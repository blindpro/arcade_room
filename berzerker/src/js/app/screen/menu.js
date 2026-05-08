app.screen.menu = app.screenManager.invent({
  id: 'menu',
  parentSelector: '.a-app--menu',
  rootSelector: '.a-menu',
  transitions: {
    start: function () { this.change('ready') },
    help: function () { this.change('help') },
    highscores: function () { this.change('highscores') },
    settings: function () { this.change('settings') },
    language: function () { this.change('language') },
    test: function () { this.change('test') },
    learn: function () { this.change('learn') },
  },
  state: {
    entryFrames: 0,
    tDown: false,
    dDown: false,
  },
  onReady: function () {
    const root = this.rootElement
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]')
      if (btn) {
        content.sfx && content.sfx.menuConfirm && content.sfx.menuConfirm()
        app.screenManager.dispatch(btn.dataset.action)
      }
    })
  },
  onEnter: function () {
    this.state.entryFrames = 6
    if (content.audio && content.audio.silenceAll) content.audio.silenceAll()
    if (content.wallVoice && content.wallVoice.destroyAll) content.wallVoice.destroyAll()
    if (content.otto && content.otto.reset) content.otto.reset()
    if (content.game) content.game.state.started = false
    app.utility.focus.setWithin(this.rootElement)
  },
  onFrame: function () {
    try {
      if (this.state.entryFrames > 0) {
        this.state.entryFrames--
        app.controls.ui()
        return
      }
      const ui = app.controls.ui()
      if (ui.up) { content.sfx.menuMove(); app.utility.focus.setPreviousFocusable(this.rootElement) }
      if (ui.down) { content.sfx.menuMove(); app.utility.focus.setNextFocusable(this.rootElement) }
      if (ui.enter || ui.space || ui.confirm) {
        const f = app.utility.focus.get(this.rootElement)
        if (f && f.dataset.action) {
          content.sfx.menuConfirm()
          app.screenManager.dispatch(f.dataset.action)
        }
      }

      // Hidden hotkeys: T → learn, D → debug empty room (no robots, no Otto).
      const k = engine.input.keyboard
      const tDown = k.is('KeyT')
      if (tDown && !this.state.tDown) {
        app.screenManager.dispatch('learn')
      }
      this.state.tDown = tDown

      const dDown = k.is('KeyD')
      if (dDown && !this.state.dDown) {
        // Pre-start the game in debug-empty mode so ready.onEnter sees
        // isStarted() === true and skips the normal start() reset that
        // would re-spawn robots and Otto.
        if (content.game && content.game.startDebugEmpty) {
          content.sfx.menuConfirm()
          content.game.startDebugEmpty()
          app.announce.polite(app.i18n.t('ann.debugEmpty'))
          app.screenManager.dispatch('start')
        }
      }
      this.state.dDown = dDown
    } catch (e) { console.error(e) }
  },
})
