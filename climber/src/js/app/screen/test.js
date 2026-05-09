/**
 * CRAZY CLIMBER — diagnostic stereo test (#test route).
 *
 * Plays four ticks: hard left, centre, hard right, centre. Lets the
 * player verify that left ear ↔ left hand and right ear ↔ right hand
 * before they trust the gameplay cues.
 */
app.screen.test = app.screenManager.invent({
  id: 'test',
  parentSelector: '.a-app--test',
  rootSelector: '.a-test',
  transitions: {
    back: function () { this.change('menu') },
  },
  state: { entryFrames: 0 },
  onReady: function () {
    const root = this.rootElement
    root.addEventListener('click', (e) => {
      const back = e.target.closest('button[data-action="back"]')
      if (back) { app.screenManager.dispatch('back'); return }
      const play = e.target.closest('button[data-action="play"]')
      if (play) this.playSequence()
    })
  },
  playSequence: function () {
    content.audio.start()
    const seq = [-1, 0, 1, 0]
    seq.forEach((pan, i) => {
      setTimeout(() => content.audio.emitTickAt(pan, 1500), i * 500)
    })
  },
  onEnter: function () {
    this.state.entryFrames = 6
    app.utility.focus.setWithin(this.rootElement)
  },
  onFrame: function () {
    if (this.state.entryFrames > 0) {
      this.state.entryFrames--
      app.controls.ui()
      return
    }
    const ui = app.controls.ui()
    if (ui.up) app.utility.focus.setPreviousFocusable(this.rootElement)
    if (ui.down) app.utility.focus.setNextFocusable(this.rootElement)
    if (ui.back) app.screenManager.dispatch('back')
    if (ui.enter || ui.space || ui.confirm) {
      const f = app.utility.focus.get(this.rootElement)
      if (f && f.dataset.action === 'play') this.playSequence()
      else if (f && f.dataset.action === 'back') app.screenManager.dispatch('back')
    }
  },
})
