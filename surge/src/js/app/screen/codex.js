// SURGE codex screen. A browsable reference for every world, obstacle, enemy,
// weapon and item. Fully readable from the start — no unlocks, no gates.
app.screen.codex = app.screenManager.invent({
  id: 'codex',
  parentSelector: '.a-app--codex',
  rootSelector: '.a-codex',
  transitions: {
    back: function () { this.change('menu') },
  },
  state: {
    entryFrames: 0, listEl: null, tabEls: {}, activeTab: 'worlds',
  },

  TABS: ['worlds', 'obstacles', 'enemies', 'weapons', 'items'],

  onReady: function () {
    const root = this.rootElement
    this.state.listEl = root.querySelector('.a-codex--list')
    this.state.tabEls = {}
    for (const tab of this.TABS) {
      this.state.tabEls[tab] = root.querySelector('.a-codex--tab[data-cx="' + tab + '"]')
    }
    root.addEventListener('click', (e) => {
      const tab = e.target.closest('button[data-cx]')
      if (tab) { this.select(tab.dataset.cx); return }
      if (e.target.closest('button[data-action="back"]')) {
        content.audio.menuBack()
        app.screenManager.dispatch('back')
      }
    })
  },

  select: function (tab) {
    if (this.TABS.indexOf(tab) === -1) return
    this.state.activeTab = tab
    content.audio.menuSelect()
    this.renderList()
  },

  entry: function (name, detail, color) {
    const li = document.createElement('li')
    li.className = 'a-codex--entry'
    if (color) li.style.borderColor = color
    const nameEl = document.createElement('span')
    nameEl.className = 'a-codex--name'
    nameEl.textContent = name
    li.appendChild(nameEl)
    if (detail) {
      const detEl = document.createElement('span')
      detEl.className = 'a-codex--detail'
      detEl.textContent = detail
      li.appendChild(detEl)
    }
    return li
  },

  renderList: function () {
    const el = this.state.listEl
    if (!el) return
    el.innerHTML = ''
    const t = (k, p) => app.i18n.t(k, p)
    const C = content.constants

    for (const tab of this.TABS) {
      const btn = this.state.tabEls[tab]
      if (btn) btn.classList.toggle('is-active', tab === this.state.activeTab)
    }

    if (this.state.activeTab === 'worlds') {
      const order = C.ADVENTURE_ORDER.concat(['sewer'])
      for (const id of order) {
        const env = C.ENV[id]
        if (!env) continue
        const hazards = (env.pools || []).map((p) => t((C.obstacleById(p[0]) || {}).nameKey || 'obs.' + p[0])).join(', ')
        const enemies = (env.enemies || []).map((e) => t((C.enemyById(e) || {}).nameKey || 'enemy.' + e)).join(', ')
        const weapon = C.weaponById(env.weapon)
        const detail = [
          t(env.descKey || 'env.city.desc'),
          t('codex.hazards') + ': ' + hazards,
          t('codex.enemies') + ': ' + enemies,
          t('codex.weapon') + ': ' + t(weapon.nameKey) + ' (' + t((C.AMMO[weapon.ammo] || {}).nameKey || 'ammo.pistol') + ')',
        ].join(' · ')
        el.appendChild(this.entry(t(env.nameKey), detail, env.color))
      }
    } else if (this.state.activeTab === 'obstacles') {
      for (const id of Object.keys(C.OBSTACLES)) {
        const o = C.OBSTACLES[id]
        const detail = o.dmg > 0 ? t('codex.damage', {dmg: o.dmg}) : t('codex.harmless')
        el.appendChild(this.entry(t(o.nameKey), detail, o.color))
      }
    } else if (this.state.activeTab === 'enemies') {
      for (const id of Object.keys(C.ENEMIES)) {
        const e = C.ENEMIES[id]
        const detail = t('codex.hp', {hp: e.hp}) + ' · ' + t('codex.damage', {dmg: e.dmg})
        el.appendChild(this.entry(t(e.nameKey), detail, e.color))
      }
    } else if (this.state.activeTab === 'weapons') {
      for (const id of C.WEAPON_IDS) {
        const w = C.WEAPONS[id]
        const detail = t('codex.damage', {dmg: w.dmg}) + ' · ' + t((C.AMMO[w.ammo] || {}).nameKey || 'ammo.pistol')
        el.appendChild(this.entry(t(w.nameKey), detail, w.color))
      }
    } else if (this.state.activeTab === 'items') {
      for (const id of C.ITEM_IDS) {
        const it = C.ITEMS[id]
        el.appendChild(this.entry(t(it.nameKey), t(it.descKey || 'item.medkit.desc'), it.color))
      }
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
      const tabs = this.TABS
      const idx = tabs.indexOf(this.state.activeTab)
      if (ui.left) { this.select(tabs[(idx - 1 + tabs.length) % tabs.length]); return }
      if (ui.right) { this.select(tabs[(idx + 1) % tabs.length]); return }
      if (ui.up) { content.audio.menuMove(); app.utility.focus.setPreviousFocusable(this.rootElement) }
      if (ui.down) { content.audio.menuMove(); app.utility.focus.setNextFocusable(this.rootElement) }
      if (ui.back) { content.audio.menuBack(); app.screenManager.dispatch('back'); return }
      if (ui.enter || ui.space || ui.confirm) {
        const f = app.utility.focus.get(this.rootElement)
        if (f && f.dataset.cx) { this.select(f.dataset.cx); return }
        if (f && f.dataset.action) app.screenManager.dispatch(f.dataset.action)
      }
    } catch (e) { console.error(e) }
  },
})
