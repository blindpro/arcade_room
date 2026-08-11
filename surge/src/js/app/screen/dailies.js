// SURGE daily missions screen. Shows the three missions of the day with
// progress and claim buttons; rewards are tokens.
app.screen.dailies = app.screenManager.invent({
  id: 'dailies',
  parentSelector: '.a-app--dailies',
  rootSelector: '.a-dailies',
  transitions: {
    back: function () { this.change('menu') },
  },
  state: {
    entryFrames: 0, listEl: null,
  },
  onReady: function () {
    const root = this.rootElement
    this.state.listEl = root.querySelector('.a-dailies--list')
    root.addEventListener('click', (e) => {
      const claim = e.target.closest('button[data-claim]')
      if (claim) { this.claim(claim.dataset.claim); return }
      if (e.target.closest('button[data-action="back"]')) {
        content.audio.menuBack()
        app.screenManager.dispatch('back')
      }
    })
  },
  renderList: function () {
    const el = this.state.listEl
    if (!el) return
    el.innerHTML = ''
    const t = (k, p) => app.i18n.t(k, p)
    content.meta.dailies().forEach((d) => {
      const li = document.createElement('li')
      li.className = 'a-dailies--entry' + (d.done ? ' is-done' : '')
      const name = document.createElement('span')
      name.className = 'a-dailies--name'
      name.textContent = t(d.nameKey)
      li.appendChild(name)
      const progress = document.createElement('span')
      progress.className = 'a-dailies--progress'
      progress.textContent = d.done
        ? (d.claimed ? t('daily.claimed') : t('daily.claim'))
        : t('ach.progress', {cur: d.cur, target: d.target})
      li.appendChild(progress)
      const reward = document.createElement('span')
      reward.className = 'a-dailies--reward'
      reward.textContent = t('shop.price', {amount: d.reward.tokens, currency: t('cur.tokens')})
      li.appendChild(reward)
      if (d.done && !d.claimed) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.dataset.claim = d.id
        btn.className = 'c-menu--button'
        btn.textContent = t('daily.claim')
        li.appendChild(btn)
      }
      el.appendChild(li)
    })
  },
  claim: function (id) {
    const reward = content.meta.claimDaily(id)
    const t = (k, p) => app.i18n.t(k, p)
    if (reward) {
      content.audio.buySuccess()
      app.announce.assertive(t('ann.dailyClaimed', {amount: reward.tokens}))
      this.renderList()
    } else {
      content.audio.buyFail()
    }
  },
  onEnter: function () {
    this.state.entryFrames = 6
    this.renderList()
    app.utility.focus.setWithin(this.rootElement)
  },
  onFrame: function () {
    try {
      if (this.state.entryFrames > 0) { this.state.entryFrames--; app.controls.ui(); return }
      const ui = app.controls.ui()
      if (ui.up) { content.audio.menuMove(); app.utility.focus.setPreviousFocusable(this.rootElement) }
      if (ui.down) { content.audio.menuMove(); app.utility.focus.setNextFocusable(this.rootElement) }
      if (ui.back) { content.audio.menuBack(); app.screenManager.dispatch('back'); return }
      if (ui.enter || ui.space || ui.confirm) {
        const f = app.utility.focus.get(this.rootElement)
        if (f && f.dataset.claim) { this.claim(f.dataset.claim); return }
        if (f && f.dataset.action) app.screenManager.dispatch(f.dataset.action)
      }
    } catch (e) { console.error(e) }
  },
})
