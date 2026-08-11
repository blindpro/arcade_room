// SURGE shop screen. Lists every shop item (unlocks + stash packs) with its
// price, buys with the profile currencies, and refreshes the balance display.
app.screen.shop = app.screenManager.invent({
  id: 'shop',
  parentSelector: '.a-app--shop',
  rootSelector: '.a-shop',
  transitions: {
    back: function () { this.change('menu') },
  },
  state: {
    entryFrames: 0, listEl: null, balanceEl: null, statusEl: null,
  },
  onReady: function () {
    const root = this.rootElement
    this.state.listEl = root.querySelector('.a-shop--list')
    this.state.balanceEl = root.querySelector('.a-shop--balance')
    this.state.statusEl = root.querySelector('.a-shop--status')
    root.addEventListener('click', (e) => {
      const buy = e.target.closest('button[data-buy]')
      if (buy) { this.buy(buy.dataset.buy); return }
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
    content.meta.shopItems().forEach((item) => {
      const li = document.createElement('li')
      li.className = 'a-shop--item'
      const head = document.createElement('div')
      head.className = 'a-shop--item-head'
      const name = document.createElement('span')
      name.className = 'a-shop--item-name'
      name.textContent = t(item.nameKey)
      head.appendChild(name)
      if (item.owned) {
        const tag = document.createElement('span')
        tag.className = 'a-shop--tag'
        tag.textContent = t('shop.owned')
        head.appendChild(tag)
      }
      li.appendChild(head)
      const desc = document.createElement('p')
      desc.className = 'a-shop--item-desc'
      desc.textContent = t(item.descKey)
      li.appendChild(desc)
      const row = document.createElement('div')
      row.className = 'a-shop--item-row'
      const price = document.createElement('span')
      price.className = 'a-shop--price'
      price.textContent = this.priceText(item.price, t)
      row.appendChild(price)
      if (!item.owned) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.dataset.buy = item.id
        btn.className = 'c-menu--button'
        btn.textContent = t('shop.buy')
        row.appendChild(btn)
      }
      li.appendChild(row)
      el.appendChild(li)
    })
  },
  priceText: function (price, t) {
    const parts = []
    for (const k of Object.keys(price || {})) {
      const currency = {coins: 'cur.coins', gems: 'cur.gems', cores: 'cur.cores', tokens: 'cur.tokens'}[k] || 'cur.coins'
      parts.push(t('shop.price', {amount: price[k], currency: t(currency)}))
    }
    return parts.join(' · ')
  },
  refreshBalance: function () {
    const el = this.state.balanceEl
    if (!el) return
    const b = content.meta.currencies()
    el.textContent = app.i18n.t('menu.profile', {coins: b.coins, gems: b.gems, cores: b.cores, tokens: b.tokens})
  },
  buy: function (id) {
    const result = content.meta.buyShop(id)
    const t = (k, p) => app.i18n.t(k, p)
    if (result === 'ok') {
      content.audio.buySuccess()
      const msg = t('shop.buyOk')
      app.announce.polite(msg)
      this.setStatus(msg, false)
    } else {
      content.audio.buyFail()
      const msg = result === 'owned' ? t('shop.ownedMsg') : result === 'funds' ? t('shop.funds') : result === 'full' ? t('shop.full') : t('shop.buyOk')
      app.announce.assertive(msg)
      this.setStatus(msg, true)
    }
    this.renderList()
    this.refreshBalance()
  },
  setStatus: function (text, err) {
    const el = this.state.statusEl
    if (!el) return
    el.textContent = text
    el.classList.toggle('is-error', !!err)
    el.hidden = false
    window.clearTimeout(this.state.statusT)
    this.state.statusT = window.setTimeout(() => { el.hidden = true }, 3500)
  },
  onEnter: function () {
    this.state.entryFrames = 6
    this.renderList()
    this.refreshBalance()
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
        if (f && f.dataset.buy) { this.buy(f.dataset.buy); return }
        if (f && f.dataset.action) app.screenManager.dispatch(f.dataset.action)
      }
    } catch (e) { console.error(e) }
  },
})
