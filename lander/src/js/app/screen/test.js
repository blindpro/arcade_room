// Stereo-pan diagnostic. Auditions the four positional voices in the
// places they will appear during play: altitude tone left, click center,
// fuel tone right, emergency siren just-off-center.
app.screen.test = app.screenManager.invent({
  id: 'test',
  parentSelector: '.a-app--test',
  rootSelector: '.a-test',
  transitions: {
    back: function () { this.change('menu') },
  },
  state: {
    timeouts: [],
    entryFrames: 0,
  },
  onReady: function () {
    this.rootElement.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]')
      if (!btn) return
      if (btn.dataset.action === 'replay') this.runTest()
      else if (btn.dataset.action === 'back') {
        this.cancel()
        app.screenManager.dispatch('back')
      }
    })
  },
  onEnter: function () {
    this.state.entryFrames = 8
    content.audio.start()
    content.audio.silenceAll()
    app.announce.polite(app.i18n.t('test.intro'))
    setTimeout(() => this.runTest(), 1100)
    app.utility.focus.setWithin(this.rootElement)
  },
  onExit: function () {
    this.cancel()
  },
  onFrame: function () {
    if (this.state.entryFrames > 0) { this.state.entryFrames--; app.controls.ui(); return }
    const ui = app.controls.ui()
    if (ui.back) {
      this.cancel()
      app.screenManager.dispatch('back')
    }
  },
  cancel: function () {
    for (const id of this.state.timeouts) clearTimeout(id)
    this.state.timeouts = []
  },
  runTest: function () {
    this.cancel()
    content.audio.unmute()
    const steps = [
      {labelKey: 'test.dirLeft',      kind: 'altTone'},
      {labelKey: 'test.dirCenter',    kind: 'click'},
      {labelKey: 'test.dirRight',     kind: 'fuelTone'},
      {labelKey: 'test.dirOffCenter', kind: 'emergency'},
    ]
    steps.forEach((s, i) => {
      const id = setTimeout(() => {
        app.announce.polite(app.i18n.t(s.labelKey))
        content.audio.emitOneShot({kind: s.kind, pan: 0})
      }, i * 1500)
      this.state.timeouts.push(id)
    })
  },
})
