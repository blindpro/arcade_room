app.screen.highscores = app.screenManager.invent({
  id: 'highscores',
  parentSelector: '.a-app--highscores',
  rootSelector: '.a-highscores',
  transitions: {
    back: function () {
      const where = app.screen.highscores._returnTo || 'menu'
      app.screen.highscores._returnTo = null
      this.change(where)
    },
  },
  state: {
    entryFrames: 0,
    listEl: null,
    emptyEl: null,
  },
  _returnTo: null,
  onReady: function () {
    this.state.listEl = this.rootElement.querySelector('.a-highscores--list')
    this.state.emptyEl = this.rootElement.querySelector('.a-highscores--empty')
    const onlineLink = this.rootElement.querySelector('.a-highscores--online-link')
    if (onlineLink && app.onlineScores) onlineLink.href = app.onlineScores.listUrl()
    this.rootElement.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]')
      if (btn) app.screenManager.dispatch(btn.dataset.action)
    })
  },
  onEnter: function () {
    this.state.entryFrames = 6
    this.render()
  },
  render: function () {
    const list = app.highscores.list()
    if (!this.state.listEl) return
    this.state.listEl.innerHTML = ''
    if (!list.length) {
      if (this.state.emptyEl) this.state.emptyEl.removeAttribute('hidden')
      return
    }
    if (this.state.emptyEl) this.state.emptyEl.setAttribute('hidden', '')
    list.forEach((entry, i) => {
      const li = document.createElement('li')
      li.textContent = app.i18n.t('highscores.entry', {
        rank: i + 1,
        name: entry.name,
        score: entry.score,
        room: entry.room,
      })
      this.state.listEl.appendChild(li)
    })
  },
  onFrame: function () {
    try {
      if (this.state.entryFrames > 0) {
        this.state.entryFrames--
        app.controls.ui()
        return
      }
      const ui = app.controls.ui()
      if (ui.back) app.screenManager.dispatch('back')
      if (ui.enter || ui.space || ui.confirm) {
        const f = app.utility.focus.get(this.rootElement)
        if (f && f.dataset.action) { content.sfx.menuConfirm(); app.screenManager.dispatch(f.dataset.action) }
      }
    } catch (e) { console.error(e) }
  },
})
