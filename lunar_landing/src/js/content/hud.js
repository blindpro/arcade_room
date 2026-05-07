// Game-screen HUD + spoken-status hotkeys.
//
// Letter keys (per GMA Lander):
//   A       altitude     speak current altitude
//   F       fuel         speak fuel %
//   V       velocity     speak descent rate
//   S       stats        speak body stats (gravity, crash speed, thrust, terminal velocity)
//   F1      help         summary of all keys
//   Shift-V velocity clicks toggle
//   Shift-A altitude tone toggle
//   Shift-F fuel tone toggle
//   Shift-E emergency tone toggle
//
// All routed through the assertive announcer so screen readers re-read
// on consecutive presses. F1 is preventDefault'd because the browser
// otherwise opens its Help.
content.hud = (() => {
  const C = () => content.constants

  const els = {
    altitude: null,
    vy: null,
    fuel: null,
    mission: null,
    score: null,
  }
  let _bound = false

  function init() {
    const root = document.querySelector('.a-game')
    if (!root) return
    els.altitude = root.querySelector('.a-game--altitude')
    els.vy       = root.querySelector('.a-game--vy')
    els.fuel     = root.querySelector('.a-game--fuel')
    els.mission  = root.querySelector('.a-game--mission')
    els.score    = root.querySelector('.a-game--score')
    if (!_bound) {
      window.addEventListener('keydown', onKeyDown, true)
      _bound = true
    }
  }

  function _set(el, text) {
    if (el) el.textContent = text
  }

  function frame() {
    const s = content.lander.state
    const alt = Math.max(0, s.y)
    _set(els.altitude, app.i18n.t('hud.altitude', {v: alt.toFixed(1)}))
    _set(els.vy, app.i18n.t('hud.vy', {v: (-s.vy).toFixed(1)}))
    const fuelPct = Math.round(100 * (s.fuel / Math.max(1, s.fuelMax)))
    _set(els.fuel, app.i18n.t('hud.fuel', {v: fuelPct}))
    const cfg = C().bodyConfig(content.missions.current())
    _set(els.mission, app.i18n.t('hud.mission', {n: content.missions.current(), body: app.i18n.t(cfg.nameKey)}))
    _set(els.score, app.i18n.t('hud.score', {v: content.scoring.state.score}))
  }

  function _announceMonitorToggle(key, on) {
    const labelKey = 'monitor.' + key
    app.announce.assertive(app.i18n.t(on ? 'monitor.on' : 'monitor.off', {
      label: app.i18n.t(labelKey),
    }))
  }

  function onKeyDown(e) {
    if (!app.screenManager.is('game')) return
    const k = e.key
    const code = e.code
    const shift = e.shiftKey

    // Suppress browser defaults: F1 opens Help, Tab moves focus, Space
    // scrolls the page if the focused element doesn't consume it.
    if (k === 'F1' || k === 'Tab' || k === ' ') e.preventDefault()

    const s = content.lander.state

    if (k === 'F1') {
      app.announce.assertive(app.i18n.t('hk.help'))
      return
    }

    // Letter keys. Use code so the binding survives layouts.
    if (!shift) {
      if (code === 'KeyA') {
        const alt = Math.max(0, s.y)
        app.announce.assertive(app.i18n.t('hk.altitude', {v: alt.toFixed(1)}))
      } else if (code === 'KeyF') {
        const fuelPct = Math.round(100 * (s.fuel / Math.max(1, s.fuelMax)))
        app.announce.assertive(app.i18n.t('hk.fuel', {v: fuelPct}))
      } else if (code === 'KeyV') {
        const desc = (-s.vy).toFixed(1)
        app.announce.assertive(app.i18n.t('hk.vy', {v: desc}))
      } else if (code === 'KeyS') {
        const cfg = C().bodyConfig(content.missions.current())
        const tv = cfg.terminalV > 0
          ? app.i18n.t('hk.terminalV', {v: cfg.terminalV.toFixed(1)})
          : app.i18n.t('hk.vacuum')
        app.announce.assertive(app.i18n.t('hk.stats', {
          body: app.i18n.t(cfg.nameKey),
          gravity: cfg.gravity.toFixed(2),
          thrust: cfg.thrust.toFixed(1),
          crash: cfg.crashSpeed.toFixed(1),
          terminal: tv,
        }))
      }
      return
    }

    // Shift+letter — toggle a monitor voice.
    if (shift) {
      if (code === 'KeyV') {
        const on = content.lander.toggleMonitor('vel')
        _announceMonitorToggle('vel', on)
      } else if (code === 'KeyA') {
        const on = content.lander.toggleMonitor('alt')
        _announceMonitorToggle('alt', on)
      } else if (code === 'KeyF') {
        const on = content.lander.toggleMonitor('fuel')
        _announceMonitorToggle('fuel', on)
      } else if (code === 'KeyE') {
        const on = content.lander.toggleMonitor('emergency')
        _announceMonitorToggle('emergency', on)
      }
    }
  }

  return {
    init,
    frame,
  }
})()
