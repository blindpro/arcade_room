// Spatial-audio diagnostic. Plays four ticks around a static listener
// facing screen-north (audio-front). Verify by ear:
//   front → in front, right → right ear, behind → muffled behind,
//   left → left ear.
// If left/right are reversed, the screen→audio y-flip in content/audio.js
// is wrong — fix `tileToM` / `relativeVector` / `behindness` before
// pursuing any other audio bug.
app.screen.test = app.screenManager.invent({
  id: 'test',
  parentSelector: '.a-app--test',
  rootSelector: '.a-test',
  transitions: {
    back: function () { this.change('menu') },
  },
  state: { timeouts: [], entryFrames: 0 },
  onReady: function () {
    this.rootElement.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]')
      if (!btn) return
      if (btn.dataset.action === 'replay') this.runTest()
      if (btn.dataset.action === 'back') {
        this.cancelTest()
        app.screenManager.dispatch('back')
      }
    })
  },
  onEnter: function () {
    this.state.entryFrames = 6
    content.audio.start()
    content.audio.silenceAll()
    app.announce.polite(app.i18n.t('test.intro'))
    setTimeout(() => this.runTest(), 1000)
  },
  onExit: function () {
    this.cancelTest()
  },
  onFrame: function () {
    try {
      if (this.state.entryFrames > 0) {
        this.state.entryFrames--
        app.controls.ui()
        return
      }
      const ui = app.controls.ui()
      if (ui.back) {
        this.cancelTest()
        app.screenManager.dispatch('back')
      }
    } catch (e) { console.error(e) }
  },
  cancelTest: function () {
    for (const id of this.state.timeouts) clearTimeout(id)
    this.state.timeouts = []
  },
  runTest: function () {
    this.cancelTest()
    content.audio.setStaticListener(content.audio.LISTENER_YAW)
    const steps = [
      {labelKey: 'test.dirFront',  x:  0, y: -2},
      {labelKey: 'test.dirRight',  x:  2, y:  0},
      {labelKey: 'test.dirBehind', x:  0, y:  2},
      {labelKey: 'test.dirLeft',   x: -2, y:  0},
    ]
    steps.forEach((s, i) => {
      const id = setTimeout(() => {
        app.announce.polite(app.i18n.t(s.labelKey))
        content.audio.emitTick(s.x, s.y, {freq: 900, dur: 0.25, gain: 0.7})
      }, i * 1500)
      this.state.timeouts.push(id)
    })
  },
})
