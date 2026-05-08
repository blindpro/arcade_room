// Top-10 leaderboard. Read-only — entries get added via the gameover
// screen.
app.screen.highscores = app.screenManager.invent({
  id: 'highscores',
  parentSelector: '.a-app--highscores',
  rootSelector: '.a-highscores',
  transitions: {
    back: function () { this.change('menu') },
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
    this.render()
  },
  onFrame: function () {
    if (this.state.entryFrames > 0) {
      this.state.entryFrames--
      app.controls.ui()
      return
    }
    const ui = app.controls.ui()
    if (ui.back) app.screenManager.dispatch('back')
  },
  render: function () {
    const list = this.rootElement.querySelector('.a-highscores--list')
    if (!list) return
    list.innerHTML = ''
    const scores = app.highscores.list()
    if (!scores.length) {
      const li = document.createElement('li')
      li.className = 'a-highscores--empty'
      li.textContent = app.i18n.t('highscores.empty')
      list.appendChild(li)
      return
    }
    for (let i = 0; i < scores.length; i++) {
      const s = scores[i]
      const li = document.createElement('li')
      li.className = 'a-highscores--item'
      li.textContent = app.i18n.t('highscores.row', {
        rank:  i + 1,
        name:  s.name,
        score: s.score,
        level: s.level,
      })
      list.appendChild(li)
    }
  },
})
