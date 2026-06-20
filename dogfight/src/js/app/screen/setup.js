app.screen.setup = app.screenManager.invent({
  id: 'setup',
  parentSelector: '.a-app--setup',
  rootSelector: '.a-setup',
  transitions: {
    play: function (data) { this.change('game', data) },
    back: function () { this.change('menu') },
  },
  onReady: function () {
    const root = this.rootElement

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button')
      if (!btn) return
      if (btn.dataset.action === 'back') {
        app.screenManager.dispatch('back')
        return
      }
      const ai = parseInt(btn.dataset.ai, 10)
      if (Number.isFinite(ai)) {
        app.screenManager.dispatch('play', {aiOpponents: ai})
      }
    })

    root.addEventListener('focusin', (e) => {
      if (e.target.matches('button')) content.sounds.uiFocus()
    })
  },
  onEnter: function () {
    this.rootElement.querySelector('.a-setup--title').textContent = app.i18n.t('setup.title')
    this.rootElement.querySelector('.a-setup--subtitle').textContent = app.i18n.t('setup.subtitle')
  },
  onFrame: function () {
    const ui = app.controls.ui()
    if (ui.back) {
      content.sounds.uiBack()
      app.screenManager.dispatch('back')
      return
    }
    app.utility.menuNav.handle(this.rootElement)
  },
})
