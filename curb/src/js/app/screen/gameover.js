app.screen.gameover = app.screenManager.invent({
  id: 'gameover',
  parentSelector: '.a-app--gameover',
  rootSelector: '.a-gameover',
  transitions: {
    again: function () { this.change('game') },
    menu: function () { this.change('menu') },
  },
  state: {
    entryFrames: 0,
  },
  onReady: function () {
    const root = this.rootElement
    this.scoreEl = root.querySelector('.a-gameover--score')
    this.bestEl = root.querySelector('.a-gameover--best')
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]')
      if (btn) app.screenManager.dispatch(btn.dataset.action)
    })
  },
  onEnter: function () {
    // A short countdown so the Enter that may also fire as a ui() delta this
    // frame doesn't immediately re-trigger the focused button.
    this.state.entryFrames = 6
    const v = content.game.view
    if (this.scoreEl) this.scoreEl.textContent = String(v.score)
    if (this.bestEl) {
      this.bestEl.textContent = v.wasNewBest
        ? app.i18n.t('gameover.newBest')
        : app.i18n.t('gameover.best', {best: v.best})
    }
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
      if (ui.up) app.utility.focus.setPreviousFocusable(this.rootElement)
      if (ui.down) app.utility.focus.setNextFocusable(this.rootElement)
      if (ui.back) app.screenManager.dispatch('menu')
      if (ui.enter || ui.space || ui.confirm) {
        const f = app.utility.focus.get(this.rootElement)
        if (f && f.dataset.action) app.screenManager.dispatch(f.dataset.action)
      }
    } catch (e) { console.error(e) }
  },
})
