app.screen.highscores = app.screenManager.invent({
  id: 'highscores',
  parentSelector: '.a-app--highScores',
  rootSelector: '.a-highScores',
  transitions: {
    back: function () { this.change('menu') },
  },
  state: {
    listEl: null,
    entryFrames: 0,
  },
  onReady: function () {
    this.state.listEl = this.rootElement.querySelector('.a-highScores--list')
    this.rootElement.addEventListener('click', (e) => {
      if (e.target.closest('button[data-action="back"]')) {
        app.screenManager.dispatch('back')
      }
    })
  },
  onEnter: function () {
    this.refresh()
    this.state.entryFrames = 8
    const entries = app.highscores.list()
    if (!entries.length) {
      app.announce.polite(app.i18n.t('ann.highscoresEmpty'))
      return
    }
    const top = entries.slice(0, 5).map((e, i) =>
      app.i18n.t('ann.highscoresEntry', {n: i + 1, name: e.name, score: e.score, mission: e.mission || 1})
    )
    app.announce.polite(app.i18n.t('ann.highscoresList', {top: top.join('. ')}))
  },
  refresh: function () {
    const list = this.state.listEl
    if (!list) return
    list.innerHTML = ''
    const entries = app.highscores.list()
    if (!entries.length) {
      const li = document.createElement('li')
      li.textContent = app.i18n.t('highscores.empty')
      list.appendChild(li)
      return
    }
    for (const e of entries) {
      const li = document.createElement('li')
      li.textContent = app.i18n.t('highscores.entry', {name: e.name, score: e.score, mission: e.mission || 1})
      list.appendChild(li)
    }
  },
  onFrame: function () {
    if (this.state.entryFrames > 0) { this.state.entryFrames--; return }
    const ui = app.controls.ui()
    if (ui.back || ui.enter || ui.space || ui.confirm) {
      app.screenManager.dispatch('back')
    }
  },
})
