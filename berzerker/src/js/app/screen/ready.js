// "GET READY" beat between rooms. Plays a short tone, announces the room
// number, then auto-dispatches `begin` after ~1.6s. The previous room's
// looping voices are silenced on enter; the new room's exit chords + wall
// buzz come up alongside the next game-screen frame.
app.screen.ready = app.screenManager.invent({
  id: 'ready',
  parentSelector: '.a-app--ready',
  rootSelector: '.a-ready',
  transitions: {
    begin: function () { this.change('game') },
  },
  state: {
    timer: 0,
    subtitleEl: null,
  },
  onReady: function () {
    this.state.subtitleEl = this.rootElement.querySelector('.a-ready--subtitle')
  },
  onEnter: function () {
    content.audio && content.audio.start && content.audio.start()
    // Start a fresh game session if we're entering room 1 cold.
    if (!content.game.isStarted()) {
      content.game.start()
    }
    if (content.audio && content.audio.silenceAll) content.audio.silenceAll()
    if (content.sfx && content.sfx.getReadyTone) content.sfx.getReadyTone()
    const room = content.game.getRoom()
    if (this.state.subtitleEl) this.state.subtitleEl.textContent = app.i18n.t('ready.room', {n: room})
    app.announce.assertive(app.i18n.t('ann.getReady', {n: room}))
    this.state.timer = 1.6
  },
  onFrame: function (e) {
    try {
      const dt = (e && e.delta) || 1 / 60
      this.state.timer -= dt
      if (this.state.timer <= 0) {
        app.screenManager.dispatch('begin')
        return
      }
      const ui = app.controls.ui()
      if (ui.back) {
        // Allow Esc to bail to menu before the game begins.
        app.screenManager.dispatch('back')
      }
    } catch (err) { console.error(err) }
  },
})

// Allow Esc to bail to menu before the room begins. The screenManager
// reads each screen's `transitions` map by reference, so editing it after
// invent() is fine.
app.screen.ready.transitions.back = function () {
  if (content.game) content.game.state.started = false
  if (content.audio && content.audio.silenceAll) content.audio.silenceAll()
  this.change('menu')
}
