// SURGE menu screen. Mode cards start a run; utility buttons reach the rest of
// the game. Shows the persistent currency balances from the profile.
app.screen.menu = app.screenManager.invent({
  id: 'menu',
  parentSelector: '.a-app--menu',
  rootSelector: '.a-menu',
  transitions: {
    start: function () { this.change('game') },
    help: function () { this.change('help') },
    highscores: function () { this.change('highscores') },
    learn: function () { this.change('learn') },
    shop: function () { this.change('shop') },
    achievements: function () { this.change('achievements') },
    dailies: function () { this.change('dailies') },
    codex: function () { this.change('codex') },
    language: function () { this.change('language') },
    quit: function () { app.quit() },
  },
  state: {
    entryFrames: 0,
    profileEl: null,
  },
  onReady: function () {
    const root = this.rootElement
    this.state.profileEl = root.querySelector('.a-menu--profile')
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mode]')
      if (btn) {
        content.audio.menuSelect()
        content.game.start(btn.dataset.mode)
        app.screenManager.dispatch('start')
        return
      }
      const act = e.target.closest('button[data-action]')
      if (act) {
        content.audio.menuSelect()
        app.screenManager.dispatch(act.dataset.action)
      }
    })
  },
  refreshProfile: function () {
    const el = this.state.profileEl
    if (!el) return
    const b = content.meta.currencies()
    el.textContent = app.i18n.t('menu.profile', {coins: b.coins, gems: b.gems, cores: b.cores, tokens: b.tokens})
  },
  onEnter: function () {
    this.state.entryFrames = 6
    this.refreshProfile()
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
      if (ui.up) { content.audio.menuMove(); app.utility.focus.setPreviousFocusable(this.rootElement) }
      if (ui.down) { content.audio.menuMove(); app.utility.focus.setNextFocusable(this.rootElement) }
      if (ui.enter || ui.space || ui.confirm) {
        const f = app.utility.focus.get(this.rootElement)
        if (f && f.dataset.mode) {
          content.audio.menuSelect()
          content.game.start(f.dataset.mode)
          app.screenManager.dispatch('start')
          return
        }
        if (f && f.dataset.action) { content.audio.menuSelect(); app.screenManager.dispatch(f.dataset.action) }
      }
    } catch (e) { console.error(e) }
  },
})
