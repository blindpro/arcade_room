// Game settings. Settings.load() runs each `update` once after merging
// defaults with persisted values, so wiring volumes and feature flags
// here flows through to the rest of the app on boot.
app.settings.register('masterVolume', {
  compute: (v) => Math.max(0, Math.min(1, Number(v))),
  default: 0.85,
  update: function (v) {
    if (engine.mixer && engine.mixer.param && engine.mixer.param.preGain) {
      engine.mixer.param.preGain.value = 1.5 * v
    }
  },
})

app.settings.register('voiceVolume', {
  compute: (v) => Math.max(0, Math.min(1, Number(v))),
  default: 0.9,
  update: function (v) {
    if (content.voice && content.voice.setBusGain) content.voice.setBusGain(v)
  },
})

app.settings.register('sfxVolume', {
  compute: (v) => Math.max(0, Math.min(1, Number(v))),
  default: 0.9,
  update: function (v) {
    if (content.sfx && content.sfx.setBusGain) content.sfx.setBusGain(v)
  },
})

app.settings.register('ambientWallBuzzVolume', {
  compute: (v) => Math.max(0, Math.min(1, Number(v))),
  default: 0.7,
  update: function (v) {
    if (content.wallVoice && content.wallVoice.setBusGain) content.wallVoice.setBusGain(v)
  },
})

app.settings.register('useTtsAnnouncer', {
  compute: (v) => !!v,
  default: false,
  update: function (v) {
    if (app.announce && app.announce.setUseTts) app.announce.setUseTts(v)
  },
})

app.settings.register('gamepadEnabled', {
  compute: (v) => !!v,
  default: true,
  update: function (_v) { /* read directly from settings.computed each frame */ },
})

app.settings.register('controlScheme', {
  compute: (v) => (v === 'numpadFire' ? 'numpadFire' : 'wasdFire'),
  default: 'wasdFire',
  update: function (_v) { /* read by player.js each frame */ },
})

app.settings.register('difficulty', {
  compute: (v) => {
    if (v === 'easy' || v === 'hard') return v
    return 'normal'
  },
  default: 'normal',
  update: function (_v) { /* read by robots.js / otto.js each frame */ },
})
