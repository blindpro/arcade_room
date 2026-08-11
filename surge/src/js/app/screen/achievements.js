// SURGE achievements screen. Lists every achievement with progress, and lets the
// player claim rewards for the ones that are done.
app.screen.achievements = app.screenManager.invent({
  id: 'achievements',
  parentSelector: '.a-app--achievements',
  rootSelector: '.a-achievements',
  transitions: {
    back: function () { this.change('menu') },
  },
  state: {
    entryFrames: 0, listEl: null, statusEl: null,
  },
  onReady: function () {
    const root = this.rootElement
    this.state.listEl = root.querySelector('.a-achievements--list')
    this.state.statusEl = root.querySelector('.a-achievements--status')
    root.addEventListener('click', (e) => {
      const claim = e.target.closest('button[data-claim]')
      if (claim) { this.claim(claim.dataset.claim); return }
      if (e.target.closest('button[data-action="back"]')) {
        content.audio.menuBack()
        app.screenManager.dispatch('back')
      }
    })
  },
  rewardText: function (reward, t) {
    const parts = []
    for (const k of Object.keys(reward || {})) {
      const currency = {coins: 'cur.coins', gems: 'cur.gems', cores: 'cur.cores', tokens: 'cur.tokens'}[k] || 'cur.coins'
      parts.push(t('shop.price', {amount: reward[k], currency: t(currency)}))
    }
    return parts.join(' · ')
  },
  renderList: function () {
    const el = this.state.listEl
    if (!el) return
    el.innerHTML = ''
    const t = (k, p) => app.i18n.t(k, p)
    content.meta.achievements().forEach((a) => {
      const li = document.createElement('li')
      li.className = 'a-achievements--entry' + (a.unlocked ? ' is-done' : ' is-locked')
      const name = document.createElement('span')
      name.className = 'a-achievements--name'
      name.textContent = t(a.nameKey)
      li.appendChild(name)
      const progress = document.createElement('span')
      progress.className = 'a-achievements--progress'
      progress.textContent = a.unlocked
        ? (a.claimed ? t('ach.claimed') : t('ach.unlocked'))
        : t('ach.progress', {cur: a.cur, target: a.target})
      li.appendChild(progress)
      const reward = document.createElement('span')
      reward.className = 'a-achievements--reward'
      reward.textContent = this.rewardText(a.reward, t)
      li.appendChild(reward)
      if (a.unlocked && !a.claimed) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.dataset.claim = a.id
        btn.className = 'c-menu--button'
        btn.textContent = t('ach.claim')
        li.appendChild(btn)
      }
      el.appendChild(li)
    })
  },
  claim: function (id) {
    const reward = content.meta.claimAchievement(id)
    const t = (k, p) => app.i18n.t(k, p)
    if (reward) {
      content.audio.buySuccess()
      const first = Object.keys(reward)[0]
      const currency = {coins: 'cur.coins', gems: 'cur.gems', cores: 'cur.cores', tokens: 'cur.tokens'}[first] || 'cur.coins'
      app.announce.assertive(t('ann.achClaimed', {amount: reward[first], currency: t(currency)}))
      this.renderList()
    } else {
      content.audio.buyFail()
    }
  },
  onEnter: function () {
    this.state.entryFrames = 6
    this.renderList()
    if (this.state.statusEl) this.state.statusEl.hidden = true
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
