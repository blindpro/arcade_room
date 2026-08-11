// SURGE gameover screen. Shows the final stats, offers a name save to the local
// leaderboard (and online), lists any achievements/dailies that unlocked, and
// sends the player back to the menu.
app.screen.gameover = app.screenManager.invent({
  id: 'gameover',
  parentSelector: '.a-app--gameover',
  rootSelector: '.a-gameover',
  transitions: {
    continue: function () { this.change('menu') },
  },
  state: {
    els: {}, form: null,
    saved: false, posting: false,
  },
  onReady: function () {
    const root = this.rootElement
    const q = (sel) => root.querySelector(sel)
    const els = this.state.els
    els.score = q('.a-gameover--score')
    els.dist = q('.a-gameover--dist')
    els.stats = q('.a-gameover--stats')
    els.earned = q('.a-gameover--earned')
    els.best = q('.a-gameover--best')
    els.unlocks = q('.a-gameover--unlocks')
    els.nameInput = q('.a-gameover--name')
    els.submitBtn = q('.a-gameover--submit')
    els.rankMsg = q('.a-gameover--rank-msg')
    els.statusEl = q('.a-gameover--online-status')
    els.linkEl = q('.a-gameover--online-link')
    this.state.form = q('.a-gameover--form')

    this.state.form.addEventListener('submit', (e) => {
      e.preventDefault()
      this.handleSave()
    })

    root.addEventListener('click', (e) => {
      if (e.target.closest('button[data-action="continue"]')) {
        content.audio.menuBack()
        app.screenManager.dispatch('continue')
      }
    })
  },
  onEnter: function () {
    const els = this.state.els
    const res = content.game.results() || {}
    const score = res.score || 0
    const t = (k, p) => app.i18n.t(k, p)
    if (els.score) els.score.textContent = t('gameover.score', {score})
    if (els.dist) els.dist.textContent = t('gameover.dist', {distance: res.distance || 0})
    if (els.stats) els.stats.textContent = t('gameover.stats', {
      coins: res.coins || 0, gems: res.gems || 0, cores: res.cores || 0, kills: res.kills || 0,
    })
    if (els.earned) els.earned.textContent = t('gameover.earned', {
      coins: res.coins || 0, gems: res.gems || 0, cores: res.cores || 0,
    })
    if (els.best) {
      els.best.hidden = !res.newBest
      if (res.newBest) els.best.textContent = t('gameover.newBest')
    }
    if (els.rankMsg) els.rankMsg.hidden = !app.highscores.qualifies(score)
    this.renderUnlocks(res)
    this.state.form.hidden = false
    this.state.saved = false
    this.state.posting = false
    if (els.statusEl) { els.statusEl.hidden = true; els.statusEl.textContent = '' }
    if (els.linkEl) { els.linkEl.hidden = true }
    if (els.nameInput) els.nameInput.value = ''
    this.state._res = res
    setTimeout(() => { if (els.nameInput) els.nameInput.focus() }, 250)
  },
  onFrame: function () {
    try {
      const ui = app.controls.ui()
      const f = app.utility.focus.get(this.rootElement)
      if (f === this.state.els.nameInput) return
      if (ui.back) { content.audio.menuBack(); app.screenManager.dispatch('continue'); return }
      if (ui.enter || ui.space || ui.confirm) {
        const target = f && f.dataset && f.dataset.action ? f : null
        if (target) target.click()
      }
    } catch (e) { console.error(e) }
  },
  renderUnlocks: function (res) {
    const els = this.state.els
    if (!els.unlocks) return
    els.unlocks.innerHTML = ''
    const items = []
    ;(res.achievements || []).forEach((id) => {
      items.push(app.i18n.t('gameover.achUnlocked', {name: app.i18n.t('ach.' + id)}))
    })
    ;(res.dailies || []).forEach((id) => {
      const d = content.meta.dailies().find((x) => x.id === id)
      items.push(app.i18n.t('gameover.dailyDone', {name: d ? app.i18n.t(d.nameKey) : id}))
    })
    if (!items.length) {
      els.unlocks.hidden = true
      return
    }
    els.unlocks.hidden = false
    const ul = document.createElement('ul')
    items.forEach((text) => {
      const li = document.createElement('li')
      li.textContent = text
      ul.appendChild(li)
    })
    els.unlocks.appendChild(ul)
    const hint = document.createElement('p')
    hint.className = 'a-gameover--hint'
    hint.textContent = app.i18n.t('gameover.claimHint')
    els.unlocks.appendChild(hint)
  },
  handleSave: function () {
    if (this.state.saved || this.state.posting) return
    const res = this.state._res || {}
    const score = res.score || 0
    const raw = (this.state.els.nameInput && this.state.els.nameInput.value || '').trim()
    if (!raw) {
      app.announce.assertive(app.i18n.t('gameover.nameRequired'))
      if (this.state.els.nameInput) { try { this.state.els.nameInput.focus() } catch (e) {} }
      return
    }
    const name = raw.slice(0, 24)
    if (app.highscores.qualifies(score)) app.highscores.add(name, score, res.distance || 0)
    this.state.saved = true
    content.audio.menuSelect()
    app.announce.polite(app.i18n.t('ann.scoreSaved'))
    this.state.posting = true
    Promise.resolve(app.onlineSubmit.run({
      name: name, score: score, meta: {distance: res.distance || 0},
      statusEl: this.state.els.statusEl, linkEl: this.state.els.linkEl,
    })).then(() => { this.state.posting = false })
      .catch(() => { this.state.posting = false })
  },
})
