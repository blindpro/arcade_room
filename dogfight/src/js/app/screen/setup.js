app.screen.setup = app.screenManager.invent({
  id: 'setup',
  parentSelector: '.a-app--setup',
  rootSelector: '.a-setup',
  transitions: {
    play: function (data) { this.change('game', data) },
    back: function () { this.change('menu') },
  },
  state: {
    showingMode: true,
    selectedMode: 'ffa',
  },
  onReady: function () {
    const root = this.rootElement
    const self = this

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button')
      if (!btn) return
      if (btn.dataset.action === 'back') {
        if (self.state.showingMode) {
          app.screenManager.dispatch('back')
        } else {
          self.showModeSelection()
        }
        return
      }
      if (btn.dataset.action === 'teamDm') {
        app.screenManager.dispatch('play', {aiOpponents: 3, mode: 'teamDm'})
        return
      }
      if (btn.dataset.action === 'ffa' || btn.dataset.action === 'survival') {
        self.state.selectedMode = btn.dataset.action === 'survival' ? 'survival' : 'ffa'
        self.showFfaSelection()
        return
      }
      const ai = parseInt(btn.dataset.ai, 10)
      if (Number.isFinite(ai)) {
        app.screenManager.dispatch('play', {aiOpponents: ai, mode: self.state.selectedMode})
      }
    })

    root.addEventListener('focusin', (e) => {
      if (e.target.matches('button')) content.sounds.uiFocus()
    })
  },
  showModeSelection: function () {
    this.state.showingMode = true
    const root = this.rootElement
    root.querySelector('.a-setup--title').textContent = app.i18n.t('setup.title')
    root.querySelector('.a-setup--subtitle').textContent = app.i18n.t('setup.subtitle')
    root.querySelector('.a-setup--ffa').hidden = true
    root.querySelector('.a-setup--modeSel').hidden = false
    root.querySelector('.a-setup--ffaTitle').hidden = true
    root.querySelector('.a-setup--ffaSubtitle').hidden = true
  },
  showFfaSelection: function () {
    this.state.showingMode = false
    const isSurvival = this.state.selectedMode === 'survival'
    const root = this.rootElement
    root.querySelector('.a-setup--title').textContent = app.i18n.t(isSurvival ? 'setup.titleSurvival' : 'setup.title')
    root.querySelector('.a-setup--subtitle').textContent = ''
    root.querySelector('.a-setup--ffaTitle').hidden = false
    root.querySelector('.a-setup--ffaTitle').textContent = app.i18n.t(isSurvival ? 'setup.titleSurvival' : 'setup.title')
    root.querySelector('.a-setup--ffaSubtitle').hidden = false
    root.querySelector('.a-setup--ffaSubtitle').textContent = app.i18n.t(isSurvival ? 'setup.survivalSubtitle' : 'setup.ffaSubtitle')
    root.querySelector('.a-setup--modeSel').hidden = true
    root.querySelector('.a-setup--ffa').hidden = false
  },
  onEnter: function () {
    this.showModeSelection()
  },
  onFrame: function () {
    const ui = app.controls.ui()
    if (ui.back) {
      content.sounds.uiBack()
      if (this.state.showingMode) {
        app.screenManager.dispatch('back')
      } else {
        this.showModeSelection()
      }
      return
    }
    app.utility.menuNav.handle(this.rootElement)
  },
})
