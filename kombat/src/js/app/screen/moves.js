// Move list, reachable from the pause menu.
//
// Everything on this screen is BUILT from content.combat and content.characters
// rather than written out, so it cannot drift from the game the way a hand-kept
// movelist always eventually does. Change a reach or a motion input and this
// screen changes with it.
//
// It is laid out as buttons rather than as prose for two reasons. The obvious
// one is that the collection's screens are navigated with the arrow keys, and
// only focusable things are reachable that way. The real one is that a movelist
// is a reference you consult mid-match with one specific question — "which way
// round is Kroll's motion again?" — and a list you can arrow to the right entry
// of answers that in one keypress, where a wall of text makes you hunt.
//
// Each fighter's entry also auditions their presence tone, because their tone
// is how you will be tracking them, and the mirror match at the end of the
// ladder is decided by being able to tell two of them apart.
app.screen.moves = app.screenManager.invent({
  id: 'moves',
  parentSelector: '.a-app--moves',
  rootSelector: '.a-moves',
  transitions: {
    back: function () { this.change('pause') },
  },
  state: {
    entryFrames: 0,
    listEl: null,
    detailEl: null,
    lastFocused: null,
  },

  onReady: function () {
    const root = this.rootElement
    this.state.listEl = root.querySelector('.a-moves--list')
    this.state.detailEl = root.querySelector('.a-moves--detail')
    root.addEventListener('click', (e) => {
      const entry = e.target.closest('button[data-entry]')
      if (entry) { this.show(entry); return }
      if (e.target.closest('button[data-action="back"]')) {
        content.audio.menuBack()
        app.screenManager.dispatch('back')
      }
    })
  },

  // ---- building the list ---------------------------------------------------

  build: function () {
    const list = this.state.listEl
    if (!list) return
    list.innerHTML = ''

    // The four buttons come first, because they are the same for everybody and
    // they are the thing a new player is actually confused about.
    this.addEntry(list, 'basics', app.i18n.t('moves.basics'), this.basicsText(), null)

    const playing = content.game.status().playerId
    for (const c of content.characters.ROSTER) {
      const label = app.i18n.t('fighter.' + c.id) +
        (c.id === playing ? ' — ' + app.i18n.t('moves.you') : '')
      this.addEntry(list, c.id, label, this.fighterText(c, c.id === playing), c.id)
    }
  },

  addEntry: function (list, id, label, detail, fighterId) {
    const li = document.createElement('li')
    const btn = document.createElement('button')
    btn.className = 'c-menu--button a-moves--entry'
    btn.dataset.entry = id
    if (fighterId) btn.dataset.fighter = fighterId
    btn.textContent = label
    // The whole entry is the accessible name, so a screen reader reads the
    // moves as it arrows past without needing to activate anything.
    btn.setAttribute('aria-label', label + '. ' + detail)
    const body = document.createElement('span')
    body.className = 'a-moves--body'
    body.setAttribute('aria-hidden', 'true')
    body.textContent = detail
    btn.appendChild(body)
    li.appendChild(btn)
    list.appendChild(li)
  },

  // The shared 2x2, described by the two things that matter about each attack:
  // what answers it, and what it costs you to throw.
  basicsText: function () {
    const C = content.combat
    const parts = []
    for (const id of C.ORDER) {
      const a = C.get(id)
      parts.push(app.i18n.t('moves.attack', {
        key: a.key,
        name: app.i18n.t('attack.' + id),
        answer: app.i18n.t(a.level === 'high' ? 'moves.answerHigh' : 'moves.answerLow'),
        weight: app.i18n.t(a.limb === 'punch' ? 'moves.punchWeight' : 'moves.kickWeight'),
      }))
    }
    parts.push(app.i18n.t('moves.airRule'))
    return parts.join(' ')
  },

  fighterText: function (c, isYou) {
    const sp = c.special
    return app.i18n.t('moves.fighter', {
      blurb: app.i18n.t('blurb.' + c.id),
      health: c.health,
      speed: Math.round(c.speedMult * 100),
      reach: Math.round(c.reachMult * 100),
      power: Math.round(c.damageMult * 100),
      special: app.i18n.t('special.' + sp.id),
      motion: sp.motion.map((d) => app.i18n.t('motion.' + d)).join(', '),
      button: content.combat.get(sp.button).key,
      note: app.i18n.t('note.' + sp.id),
    })
  },

  // ---- behaviour -----------------------------------------------------------

  show: function (btn) {
    content.audio.menuSelect()
    app.announce.polite(btn.getAttribute('aria-label'))
  },

  // Arrowing onto a fighter auditions their tone; arrowing onto anything else
  // stops it, so the screen never leaves a drone running behind the menu.
  audition: function (el) {
    if (el === this.state.lastFocused) return
    this.state.lastFocused = el
    const id = el && el.dataset && el.dataset.fighter
    content.audio.stopPresence()
    if (!id) return
    content.audio.startPresence(content.characters.get(id).toneHz)
    content.audio.frame(1 / 60, {
      foeX: 0, dx: 0, dist: 1.2, foeY: 0,
      healthFrac: 1, phase: 'moves', foeStance: 'stand',
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
      if (this.state.entryFrames > 0) { this.state.entryFrames--; app.controls.ui(); return }
      const ui = app.controls.ui()
      if (ui.up) { content.audio.menuMove(); app.utility.focus.setPreviousFocusable(this.rootElement) }
      if (ui.down) { content.audio.menuMove(); app.utility.focus.setNextFocusable(this.rootElement) }
      if (ui.back || ui.pause) {
        content.audio.menuBack()
        app.screenManager.dispatch('back')
        return
      }

      const f = app.utility.focus.get(this.rootElement)
      this.audition(f)

      if (ui.enter || ui.space || ui.confirm) {
        if (f && f.dataset.entry) { this.show(f); return }
        if (f && f.dataset.action) {
          content.audio.menuBack()
          app.screenManager.dispatch(f.dataset.action)
        }
      }
    } catch (e) { console.error(e) }
  },
})
