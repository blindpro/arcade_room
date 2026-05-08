// Settings UI. Renders the registered settings as labeled rows with
// appropriate input controls (slider for 0..1 ranges, button for booleans
// and enums). Persists via app.settings.save() on each change.
app.screen.settings = app.screenManager.invent({
  id: 'settings',
  parentSelector: '.a-app--settings',
  rootSelector: '.a-settings',
  transitions: {
    back: function () { this.change('menu') },
  },
  state: { entryFrames: 0, listEl: null },
  _spec: [
    {key: 'masterVolume', kind: 'range', step: 0.05},
    {key: 'voiceVolume', kind: 'range', step: 0.05},
    {key: 'sfxVolume', kind: 'range', step: 0.05},
    {key: 'ambientWallBuzzVolume', kind: 'range', step: 0.05},
    {key: 'useTtsAnnouncer', kind: 'toggle'},
    {key: 'gamepadEnabled', kind: 'toggle'},
    {key: 'controlScheme', kind: 'enum', options: ['wasdFire', 'numpadFire']},
    {key: 'difficulty', kind: 'enum', options: ['easy', 'normal', 'hard']},
  ],
  onReady: function () {
    this.state.listEl = this.rootElement.querySelector('.a-settings--list')
    this.rootElement.addEventListener('click', (e) => {
      const action = e.target.closest('button[data-action]')
      if (action) { app.screenManager.dispatch(action.dataset.action); return }
      const cycle = e.target.closest('button[data-cycle]')
      if (cycle) {
        this.cycle(cycle.dataset.cycle)
        return
      }
    })
    this.rootElement.addEventListener('input', (e) => {
      const input = e.target.closest('input[data-range]')
      if (input) {
        const key = input.dataset.range
        const v = Number(input.value)
        const setter = 'set' + key.charAt(0).toUpperCase() + key.slice(1)
        if (typeof app.settings[setter] === 'function') app.settings[setter](v)
        app.settings.save()
        this.refresh()
      }
    })
  },
  onEnter: function () {
    this.state.entryFrames = 6
    this.render()
  },
  render: function () {
    if (!this.state.listEl) return
    this.state.listEl.innerHTML = ''
    for (const spec of this._spec) {
      const li = document.createElement('li')
      li.className = 'a-settings--row'
      const labelId = 'a-settings--label-' + spec.key
      const label = document.createElement('span')
      label.className = 'a-settings--label'
      label.id = labelId
      label.textContent = app.i18n.t('settings.' + spec.key)
      li.appendChild(label)
      if (spec.kind === 'range') {
        const input = document.createElement('input')
        input.type = 'range'
        input.min = '0'; input.max = '1'; input.step = String(spec.step || 0.05)
        input.dataset.range = spec.key
        input.value = String(app.settings.computed[spec.key])
        // Screen-reader label is the visible row label — no duplication.
        input.setAttribute('aria-labelledby', labelId)
        li.appendChild(input)
      } else if (spec.kind === 'toggle') {
        const btn = document.createElement('button')
        const btnId = 'a-settings--btn-' + spec.key
        btn.id = btnId
        btn.className = 'c-menu--button'
        btn.dataset.cycle = spec.key
        btn.textContent = app.settings.computed[spec.key] ? app.i18n.t('settings.on') : app.i18n.t('settings.off')
        btn.setAttribute('aria-pressed', app.settings.computed[spec.key] ? 'true' : 'false')
        // Concat label + button content so SR reads "Gamepad, On".
        btn.setAttribute('aria-labelledby', labelId + ' ' + btnId)
        li.appendChild(btn)
      } else if (spec.kind === 'enum') {
        const btn = document.createElement('button')
        const btnId = 'a-settings--btn-' + spec.key
        btn.id = btnId
        btn.className = 'c-menu--button'
        btn.dataset.cycle = spec.key
        const v = app.settings.computed[spec.key]
        btn.textContent = app.i18n.t('settings.' + spec.key + '.' + v)
        // SR reads "Difficulty, Normal" (label + current value).
        btn.setAttribute('aria-labelledby', labelId + ' ' + btnId)
        li.appendChild(btn)
      }
      this.state.listEl.appendChild(li)
    }
  },
  cycle: function (key) {
    const spec = this._spec.find((s) => s.key === key)
    if (!spec) return
    const setter = 'set' + key.charAt(0).toUpperCase() + key.slice(1)
    if (spec.kind === 'toggle') {
      app.settings[setter](!app.settings.computed[key])
    } else if (spec.kind === 'enum') {
      const cur = app.settings.computed[key]
      const idx = spec.options.indexOf(cur)
      const next = spec.options[(idx + 1) % spec.options.length]
      app.settings[setter](next)
    }
    app.settings.save()
    content.sfx.menuConfirm()
    this.render()
  },
  refresh: function () {
    // Cheap path: re-render. Keeps focus rough but acceptable for a small list.
    // (No bookkeeping needed for the v0.1.0 surface.)
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
      if (ui.up) app.utility.focus.setPreviousFocusable(this.rootElement)
      if (ui.down) app.utility.focus.setNextFocusable(this.rootElement)
    } catch (e) { console.error(e) }
  },
})
