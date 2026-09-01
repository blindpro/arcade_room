// Character select. Four fighters, and the choice actually matters — it sets
// your health, your walk speed, how long you are committed to every attack, how
// far those attacks reach, and which special you have. So each button reads its
// own stat line out loud when you land on it rather than making you find that
// out in round one.
//
// It also plays the fighter's presence tone as you move through the list. That
// tone is the sound you will spend the whole match tracking your OPPONENT by,
// so hearing all four here is not flavour: in the mirror match at the end of
// the ladder it is the only thing telling the two of you apart.
app.screen.select = app.screenManager.invent({
  id: 'select',
  parentSelector: '.a-app--select',
  rootSelector: '.a-select',
  transitions: {
    // syngen's fsm calls a transition with a single data object, so the pick
    // travels as {id} rather than as a positional argument.
    fight: function (data) {
      content.game.reset(data && data.id)
      this.change('game')
    },
    back: function () { this.change('menu') },
  },
  state: {
    entryFrames: 0,
    listEl: null,
    lastFocused: null,
  },

  onReady: function () {
    const root = this.rootElement
    this.state.listEl = root.querySelector('.a-select--list')
    this.build()
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-fighter]')
      if (btn) { this.pick(btn.dataset.fighter); return }
      if (e.target.closest('button[data-action="back"]')) {
        content.audio.menuBack()
        app.screenManager.dispatch('back')
      }
    })
  },

  build: function () {
    const list = this.state.listEl
    if (!list) return
    list.innerHTML = ''
    for (const c of content.characters.ROSTER) {
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.className = 'c-menu--button a-select--fighter'
      btn.dataset.fighter = c.id
      btn.textContent = app.i18n.t('fighter.' + c.id)
      // The stat line goes in the accessible name, so a screen reader gets the
      // whole comparison without a second keypress.
      btn.setAttribute('aria-label', this.describe(c))
      const blurb = document.createElement('span')
      blurb.className = 'a-select--blurb'
      blurb.setAttribute('aria-hidden', 'true')
      blurb.textContent = app.i18n.t('blurb.' + c.id)
      btn.appendChild(blurb)
      li.appendChild(btn)
      list.appendChild(li)
    }
  },

  describe: function (c) {
    return app.i18n.t('select.describe', {
      name: app.i18n.t('fighter.' + c.id),
      blurb: app.i18n.t('blurb.' + c.id),
      health: c.health,
      speed: Math.round(c.speedMult * 100),
      reach: Math.round(c.reachMult * 100),
      power: Math.round(c.damageMult * 100),
      special: app.i18n.t('special.' + c.special.id),
      motion: c.special.motion.map((d) => app.i18n.t('motion.' + d)).join(', '),
      button: content.combat.get(c.special.button).key,
    })
  },

  pick: function (id) {
    content.audio.menuSelect()
    content.audio.stopPresence()
    app.screenManager.dispatch('fight', {id})
  },

  // Moving the focus auditions that fighter's tone. Short, and cut off by the
  // next move, so running down the list is a comparison rather than a pile-up.
  audition: function (el) {
    if (!el || el === this.state.lastFocused) return
    this.state.lastFocused = el
    const id = el.dataset && el.dataset.fighter
    if (!id) { content.audio.stopPresence(); return }
    const c = content.characters.get(id)
    content.audio.stopPresence()
    content.audio.startPresence(c.toneHz)
    content.audio.frame(1 / 60, {
      foeX: 0, dx: 0, dist: 1.2, foeY: 0,
      healthFrac: 1, phase: 'select', foeStance: 'stand',
    })
  },

  onEnter: function () {
    this.build()
    this.state.entryFrames = 6
    this.state.lastFocused = null
    app.utility.focus.setWithin(this.rootElement)
  },

  onExit: function () {
    content.audio.stopPresence()
  },

  onFrame: function () {
    try {
      if (this.state.entryFrames > 0) {
        this.state.entryFrames--
        app.controls.ui()
        this.audition(app.utility.focus.get(this.rootElement))
        return
      }
      const ui = app.controls.ui()
      if (ui.up) { content.audio.menuMove(); app.utility.focus.setPreviousFocusable(this.rootElement) }
      if (ui.down) { content.audio.menuMove(); app.utility.focus.setNextFocusable(this.rootElement) }
      if (ui.back) { content.audio.menuBack(); app.screenManager.dispatch('back'); return }

      const f = app.utility.focus.get(this.rootElement)
      this.audition(f)

      if (ui.enter || ui.space || ui.confirm) {
        if (f && f.dataset.fighter) { this.pick(f.dataset.fighter); return }
        if (f && f.dataset.action) {
          content.audio.menuBack()
          app.screenManager.dispatch(f.dataset.action)
        }
      }
    } catch (e) { console.error(e) }
  },
})
