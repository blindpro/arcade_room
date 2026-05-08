// Learn-sounds palette. Each button auditions one entry from the
// Lunar Lander audio palette via content.audio.emitOneShot.
app.screen.learn = app.screenManager.invent({
  id: 'learn',
  parentSelector: '.a-app--learn',
  rootSelector: '.a-learn',
  transitions: {
    back: function () { this.change('menu') },
  },
  state: {
    nav: null,
    entryFrames: 0,
  },
  onReady: function () {
    const root = this.rootElement
    this.state.nav = root.querySelector('.a-learn--nav')

    const items = [
      'click', 'altTone', 'fuelTone', 'ascent', 'emergency',
      'thrust', 'softLand', 'hardLand', 'fanfare', 'bonusTally', 'gameOver',
    ]

    if (this.state.nav) {
      for (const key of items) {
        const li = document.createElement('li')
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'c-menu--button'
        b.dataset.sound = key
        b.dataset.i18n = 'learn.' + key
        b.textContent = app.i18n.t('learn.' + key)
        li.appendChild(b)
        this.state.nav.appendChild(li)
      }
    }

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button')
      if (!btn) return
      if (btn.dataset.action === 'back') app.screenManager.dispatch('back')
      else if (btn.dataset.sound) this.playSample(btn.dataset.sound, btn.textContent)
    })
  },
  onEnter: function () {
    content.audio.start()
    content.audio.silenceAll()
    content.audio.unmute()
    this.state.entryFrames = 8
    app.announce.polite(app.i18n.t('ann.learnHello'))
    app.utility.focus.setWithin(this.rootElement)
  },
  onFrame: function () {
    if (this.state.entryFrames > 0) { this.state.entryFrames--; app.controls.ui(); return }
    const ui = app.controls.ui()
    if (ui.back) { app.screenManager.dispatch('back'); return }
    if (ui.up) app.utility.focus.setPreviousFocusable(this.rootElement)
    if (ui.down) app.utility.focus.setNextFocusable(this.rootElement)
    if (ui.enter || ui.space || ui.confirm) {
      const f = app.utility.focus.get(this.rootElement)
      if (f) {
        if (f.dataset.action === 'back') app.screenManager.dispatch('back')
        else if (f.dataset.sound) this.playSample(f.dataset.sound, f.textContent)
      }
    }
  },
  playSample: function (key, label) {
    app.announce.polite(app.i18n.t('ann.playing', {label}))
    content.audio.emitOneShot({kind: key, pan: 0})
  },
})
