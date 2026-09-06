app.screen.menu = app.screenManager.invent({
  id: 'menu',
  parentSelector: '.a-app--menu',
  rootSelector: '.a-menu',
  transitions: {
    play:     function () { this.change('setup') },
    multi:    function () { this.change('multiplayer') },
    learn:    function () { this.change('learnSounds') },
    help:     function () { this.change('help') },
    language: function () { this.change('language') },
    quit:     function () { app.quit() },
  },
  onReady: function () {
    const root = this.rootElement
    root.querySelector('.a-menu--version').textContent = `v${app.version()}`

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]')
      if (!btn) return
      app.screenManager.dispatch(btn.dataset.action)
    })

    root.addEventListener('focusin', (e) => {
      if (e.target.matches('button')) content.sounds.uiFocus()
    })
  },
  focusWithin: function () {
    const first = this.rootElement.querySelector('.c-menu--button')
    app.utility.focus.set(first || this.rootElement)
    return this
  },
  onFrame: function () {
    app.utility.menuNav.handle(this.rootElement)
  },
})
