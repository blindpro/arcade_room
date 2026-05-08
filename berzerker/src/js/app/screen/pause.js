app.screen.pause = app.screenManager.invent({
  id: 'pause',
  parentSelector: '.a-app--pause',
  rootSelector: '.a-pause',
  transitions: {
    resume: function () {
      content.game.resume()
      this.change('game')
    },
    menu: function () {
      // Tear down session: silence everything, drop Otto, mark not started.
      if (content.audio && content.audio.silenceAll) content.audio.silenceAll()
      if (content.wallVoice && content.wallVoice.destroyAll) content.wallVoice.destroyAll()
      if (content.otto && content.otto.reset) content.otto.reset()
      content.game.state.started = false
      this.change('menu')
    },
  },
  state: {
    entryFrames: 0,
  },
  onReady: function () {
    const root = this.rootElement
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]')
      if (btn) app.screenManager.dispatch(btn.dataset.action)
    })
  },
  onEnter: function () {
    this.state.entryFrames = 6
    if (content.audio && content.audio.silenceAll) content.audio.silenceAll()
    app.announce.polite(app.i18n.t('pause.title'))
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
      if (ui.back || ui.pause) {
        app.screenManager.dispatch('resume')
      }
    } catch (e) { console.error(e) }
  },
})
