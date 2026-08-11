// SURGE game screen. Real-time: each frame it feeds held movement/fire into the
// sim, reads controls, turns content events into stereo audio + screen-reader
// announcements, and lights an aria-hidden lane viz. Audio is the source of truth.
app.screen.game = app.screenManager.invent({
  id: 'game',
  parentSelector: '.a-app--game',
  rootSelector: '.a-game',
  transitions: {
    pause: function () { this.change('pause') },
    gameOver: function () { this.change('gameover') },
  },
  state: {
    els: {},
    actionDown: {},
    entryFrames: 0,
    wired: false,
  },

  KEYS: {
    left:  ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    jump:  ['ArrowUp', 'KeyW'],
  },
  PADS: {
    left:  [14],
    right: [15],
    jump:  [1],
  },

  onReady: function () {
    const root = this.rootElement
    const pick = (sel) => root.querySelector(sel)
    const els = this.state.els
    els.score = pick('.a-game--score-value')
    els.dist = pick('.a-game--dist-value')
    els.hp = pick('.a-game--hp-value')
    els.hpBar = pick('.a-game--hp-bar')
    els.env = pick('.a-game--env-value')
    els.weapon = pick('.a-game--weapon-value')
    els.item = pick('.a-game--item-value')
    els.itemDesc = pick('.a-game--item-desc')
    els.mode = pick('.a-game--mode-value')
    els.time = pick('.a-game--time-value')
    els.coins = pick('.a-game--coins-value')
    els.mag = pick('.a-game--mag-value')
    els.speed = pick('.a-game--speed-value')
    els.level = pick('.a-game--level-value')
    els.shield = pick('.a-game--shield')
    els.boost = pick('.a-game--boost')
    els.overdrive = pick('.a-game--overdrive')
    els.brake = pick('.a-game--brake')
    els.lane = pick('.a-game--lane')
    els.near = pick('.a-game--near')

    window.addEventListener('keydown', (e) => {
      if (!app.screenManager.is('game')) return
      if (['F1', 'F2', 'F3', 'F5'].includes(e.key)) e.preventDefault()
      if ([' ', 'Spacebar', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault()
      if (!e.repeat && content.game.press) content.game.press(e.code)
    })

    this.wireEvents()
  },

  wireEvents: function () {
    if (this.state.wired) return
    this.state.wired = true
    const self = this
    const A = () => content.audio
    const t = (k, p) => app.i18n.t(k, p)
    const announce = (fn, key, params) => { try { app.announce[fn](t(key, params)) } catch (e) {} }

    content.game.on('count', (e) => {
      A().handle('count', e)
      if (e.n === 2) announce('assertive', 'ann.two')
      else if (e.n === 1) announce('assertive', 'ann.one')
    })
    content.game.on('go', (e) => {
      A().handle('go', e)
      announce('assertive', 'ann.go')
      self.refreshHud()
    })
    content.game.on('run-start', (e) => {
      self.state.entryFrames = 10
      self.refreshHud()
      self.refreshWeapon()
      self.refreshItem()
      self.refreshEnv()
    })
    content.game.on('mode-title', (e) => {
      A().handle('mode-title', e)
      announce('assertive', 'ann.mode', {mode: t(e.mode === 'practice' ? 'mode.practice' : 'mode.' + e.mode)})
    })
    content.game.on('env-enter', (e) => {
      A().handle('env-enter', e)
      if (content.music && content.music.setEnv) content.music.setEnv(e.env)
      const envName = t(e.env === 'sewer' ? 'env.sewer' : ('env.' + e.env))
      announce('assertive', 'ann.env', {env: envName})
      self.refreshEnv()
      self.refreshWeapon()
      self.refreshHud()
    })
    content.game.on('threat', (e) => A().handle('threat', e))
    content.game.on('threat-switch', (e) => A().handle('threat-switch', e))
    content.game.on('pickup', (e) => A().handle('pickup', e))
    content.game.on('collect', (e) => {
      A().handle('collect', e)
      self.rumble(0.35, 0.25, 70)
      const what = e.kind === 'coin' ? t('ann.coin') : e.kind === 'gem' ? t('ann.gem') : e.kind === 'core' ? t('ann.core') : e.kind
      announce('polite', 'ann.collect', {count: e.amount, what})
      self.refreshHud()
      if (e.kind === 'medkit' || e.kind === 'shield' || e.kind === 'boost') self.refreshItem()
    })
    content.game.on('pickup-item', (e) => { A().handle('pickup-item', e); self.refreshItem() })
    content.game.on('jump', () => A().handle('jump'))
    content.game.on('land', () => A().handle('land'))
    content.game.on('blocked', () => { A().handle('blocked'); announce('assertive', 'ann.blocked') })
    content.game.on('shoot', (e) => { A().handle('shoot', e); self.refreshHud() })
    content.game.on('charge', (e) => A().handle('charge', e))
    content.game.on('empty', () => { A().handle('empty'); announce('polite', 'ann.empty') })
    content.game.on('reload-start', (e) => { A().handle('reload-start', e); self.refreshHud() })
    content.game.on('reload-shell', (e) => { A().handle('reload-shell', e); self.refreshHud() })
    content.game.on('reload-end', (e) => { A().handle('reload-end', e); self.refreshHud() })
    content.game.on('weapon-switch', (e) => {
      A().handle('weapon-switch', e)
      announce('polite', 'ann.weapon', {weapon: t('weapon.' + e.weapon)})
      self.refreshWeapon()
      self.refreshHud()
    })
    content.game.on('locked', () => {
      A().handle('locked')
      announce('assertive', 'ann.locked')
    })
    content.game.on('kill', (e) => {
      A().handle('kill', e)
      self.rumble(0.5, 0.3, 90)
      announce('polite', 'ann.kill', {kind: t('enemy.' + e.kind), points: e.points})
      self.refreshHud()
    })
    content.game.on('hit', (e) => {
      A().handle('hit', e)
      self.rumble(1.0, 0.5, 180)
      announce('assertive', 'ann.hit', {hp: Math.max(0, Math.round(e.hp))})
      self.refreshHud()
    })
    content.game.on('hit-blocked', () => { A().handle('hit-blocked'); self.rumble(0.6, 0.3, 120) })
    content.game.on('lifeline', () => { A().handle('lifeline'); announce('assertive', 'ann.lifeline'); self.refreshHud() })
    content.game.on('gravity', (e) => {
      A().handle('gravity', e)
      announce('assertive', e.mult < 1 ? 'ann.gravityLow' : 'ann.gravityHigh')
    })
    content.game.on('item-used', (e) => {
      A().handle('item-used', e)
      announce('polite', 'ann.itemUsed', {item: t('item.' + e.item)})
      self.refreshItem()
      self.refreshHud()
    })
    content.game.on('item-empty', (e) => {
      A().handle('item-empty')
      announce('polite', 'ann.itemEmpty', {item: t('item.' + e.item)})
    })
    content.game.on('item-select', () => { A().handle('item-select'); self.refreshItem() })
    content.game.on('item-desc', (e) => {
      A().handle('item-desc')
      const item = e.item
      const desc = t('item.' + item + '.desc')
      announce('polite', 'ann.itemDesc', {desc})
      self.showItemDesc(desc)
    })
    content.game.on('shield-on', (e) => {
      A().handle('shield-on', e)
      announce('assertive', 'ann.shieldOn')
      self.setPower('shield', true)
    })
    content.game.on('shield-off', () => {
      A().handle('shield-off')
      announce('polite', 'ann.shieldOff')
      self.setPower('shield', false)
    })
    content.game.on('boost-on', (e) => {
      A().handle('boost-on', e)
      announce('assertive', 'ann.boostOn')
      self.setPower('boost', true)
    })
    content.game.on('boost-off', () => {
      A().handle('boost-off')
      announce('polite', 'ann.boostOff')
      self.setPower('boost', false)
    })
    content.game.on('overdrive-on', (e) => {
      A().handle('overdrive-on', e)
      announce('assertive', 'ann.overdriveOn')
      self.setPower('overdrive', true)
    })
    content.game.on('overdrive-off', () => {
      A().handle('overdrive-off')
      announce('polite', 'ann.overdriveOff')
      self.setPower('overdrive', false)
    })
    content.game.on('brake-on', (e) => {
      A().handle('brake-on', e)
      announce('assertive', 'ann.brakeOn')
      self.setPower('brake', true)
    })
    content.game.on('brake-off', () => {
      A().handle('brake-off')
      announce('polite', 'ann.brakeOff')
      self.setPower('brake', false)
    })
    content.game.on('emp-use', (e) => {
      A().handle('emp-use', e)
      announce('polite', 'ann.emp')
      self.refreshHud()
    })
    content.game.on('fence-emp', (e) => {
      A().handle('fence-emp', e)
      announce('polite', 'ann.fenceEmp')
      self.refreshHud()
    })
    content.game.on('teleport', () => { A().handle('teleport'); announce('assertive', 'ann.teleport'); self.refreshHud() })
    content.game.on('sewer-in', (e) => {
      A().handle('sewer-in', e)
      announce('assertive', 'ann.sewerIn')
      self.refreshEnv()
      self.refreshWeapon()
    })
    content.game.on('sewer-exit', (e) => {
      A().handle('sewer-exit', e)
      announce('assertive', 'ann.sewerOut')
      self.refreshEnv()
      self.refreshWeapon()
    })
    content.game.on('heli-near', () => { A().handle('heli-near'); announce('assertive', 'ann.heliNear') })
    content.game.on('heli-clear', () => { A().handle('heli-clear'); announce('polite', 'ann.heliClear') })
    content.game.on('level-complete', (e) => {
      A().handle('level-complete', e)
      announce('assertive', 'ann.levelComplete', {level: e.level})
      self.refreshHud()
    })
    content.game.on('run-complete', (e) => {
      A().handle('run-complete', e)
      if (e.victory) announce('assertive', 'ann.victory')
    })
    content.game.on('doom', (e) => { A().handle('doom', e); self.rumble(1.0, 0.8, 460) })
    content.game.on('game-over', (e) => {
      A().handle('game-over')
      content.music.stop()
      const results = e.results || {}
      const high = app.highscores.qualifies(results.score || 0)
      announce('assertive', high
        ? 'ann.gameOverHigh'
        : 'ann.gameOver', high ? {score: results.score || 0} : {score: results.score || 0, distance: results.distance || 0})
      app.screenManager.dispatch('gameOver')
    })
  },

  onEnter: function () {
    content.audio.startRun()
    if (!content.music.isOn()) content.music.start()
    this.state.actionDown = {}
    this.state.entryFrames = 10
    app.utility.focus.setWithin(this.rootElement)
    this.refreshHud()
    this.refreshWeapon()
    this.refreshItem()
    this.refreshEnv()
    if (!content.game.isRunning()) {
      app.announce.assertive(app.i18n.t('ann.ready'))
      try { app.onlineScores.openSession().catch(() => {}) } catch (e) {}
    }
  },

  onExit: function () {
    if (content.audio && content.audio.silenceAll) content.audio.silenceAll()
    if (content.music && content.music.stop) content.music.stop()
    this.state.els.itemDesc = this.state.els.itemDesc || null
    const d = this.state.els.itemDesc
    if (d) d.textContent = ''
  },

  onFrame: function (e) {
    try {
      const delta = Math.min(0.05, (e && e.delta) || 1 / 60)
      const k = engine.input.keyboard
      const gp = engine.input.gamepad

      if (this.edge('pause', k.is('Escape') || k.is('Backspace') || gp.isDigital(9))) {
        app.announce.assertive(app.i18n.t('ann.paused'))
        content.game.pause()
        app.screenManager.dispatch('pause')
        return
      }

      // feed held inputs into the sim (real keys + touch-dispatched synthetic ones)
      const left = this.held('left', k, gp)
      const right = this.held('right', k, gp)
      const jump = this.held('jump', k, gp)
      content.game.input('ArrowLeft', left)
      content.game.input('ArrowRight', right)
      content.game.input('ArrowUp', jump)
      content.game.input('Space', k.is('Space'))

      content.game.update(delta)
      content.music.setIntensity(content.game.state() ? content.game.state().speed / content.constants.MAX_SPEED : 0)
      content.music.update()
      content.audio.update(delta, content.game.state())

      if (this.state.entryFrames > 0) {
        this.state.entryFrames--
        this.renderViz()
        return
      }

      if (this.edge('f1', k.is('F1'))) this.announceStatus()
      if (this.edge('f2', k.is('F2'))) this.announceEnv()

      this.refreshHud()
      this.renderViz()
    } catch (err) {
      console.error(err)
    }
  },

  held: function (action, k, gp) {
    for (const code of this.KEYS[action]) if (k.is(code)) return true
    for (const b of this.PADS[action]) if (gp.isDigital(b)) return true
    return false
  },
  edge: function (name, isDown) {
    const was = this.state.actionDown[name]
    this.state.actionDown[name] = isDown
    return isDown && !was
  },
  rumble: function (strong, weak, ms) {
    if (app.haptics && app.haptics.enqueue) app.haptics.enqueue({duration: ms || 200, strongMagnitude: strong, weakMagnitude: weak})
  },

  refreshHud: function () {
    const els = this.state.els
    const s = content.game.state()
    if (!s || !els.score) return
    els.score.textContent = String(Math.floor(s.score))
    if (els.dist) els.dist.textContent = String(Math.floor(s.dist)) + 'm'
    if (els.hp) els.hp.textContent = String(Math.max(0, Math.round(s.hp))) + '/' + s.maxHp
    if (els.hpBar) els.hpBar.style.width = String(Math.max(0, Math.min(100, (s.hp / s.maxHp) * 100))) + '%'
    if (els.coins) els.coins.textContent = String(s.coins)
    if (els.speed) els.speed.textContent = String(Math.round(s.speed))
    if (els.level) els.level.textContent = String(s.mode === 'adventure' ? s.levelsCompleted + 1 : s.seg)
    if (els.mag) els.mag.textContent = s.weapon === 'laser' ? String(Math.round(s.mag)) : (s.mag + '/' + s.reserve)
    if (els.time) els.time.textContent = s.mode === 'sprint' ? String(Math.ceil(s.timeLeft)) + 's' : ''
    if (els.shield) els.shield.hidden = s.shieldT <= 0
    if (els.boost) els.boost.hidden = s.boostT <= 0
    if (els.overdrive) els.overdrive.hidden = s.overdriveT <= 0
    if (els.brake) els.brake.hidden = s.brakeT <= 0
  },

  refreshWeapon: function () {
    const els = this.state.els
    const s = content.game.state()
    if (!s || !els.weapon) return
    els.weapon.textContent = app.i18n.t('weapon.' + s.weapon)
    if (els.mag) els.mag.textContent = s.weapon === 'laser' ? String(Math.round(s.mag)) : (s.mag + '/' + s.reserve)
  },

  refreshItem: function () {
    const els = this.state.els
    const s = content.game.state()
    if (!s || !els.item) return
    const count = s.inventory[s.selectedItem] || 0
    els.item.textContent = app.i18n.t('item.' + s.selectedItem) + ' ×' + count
  },

  refreshEnv: function () {
    const els = this.state.els
    const s = content.game.state()
    if (!s || !els.env) return
    els.env.textContent = app.i18n.t('env.' + s.env)
    if (els.mode) els.mode.textContent = app.i18n.t('mode.' + s.mode)
    const def = content.constants.ENV[s.env]
    if (def && def.color && els.env) els.env.style.color = def.color
  },

  setPower: function (which, on) {
    const el = this.state.els[which]
    if (el) el.hidden = !on
  },

  showItemDesc: function (text) {
    const d = this.state.els.itemDesc
    if (!d) return
    d.textContent = text
    d.classList.add('is-visible')
    window.clearTimeout(this.state.descT)
    this.state.descT = window.setTimeout(() => { d.classList.remove('is-visible'); d.textContent = '' }, 4000)
  },

  announceStatus: function () {
    const s = content.game.state()
    if (!s) return
    app.announce.polite(app.i18n.t('ann.status', {
      score: Math.floor(s.score), distance: Math.floor(s.dist), speed: Math.round(s.speed),
      hp: Math.max(0, Math.round(s.hp)), coins: s.coins, gems: s.gems, cores: s.cores, kills: s.kills,
    }))
  },

  announceEnv: function () {
    const info = content.game.envInfo()
    app.announce.polite(app.i18n.t('ann.envInfo', {
      env: app.i18n.t('env.' + info.env),
      weapon: app.i18n.t('weapon.' + info.weapon),
      envDesc: app.i18n.t(info.envDesc || 'env.city.desc'),
    }))
  },

  // Lane viz (aria-hidden): a perspective strip of the road ahead. Obstacles and
  // enemies are bars spanning their lanes; pickups are dots; player is the dot
  // at the bottom. Position: left% from lane, bottom% from distance.
  renderViz: function () {
    const lane = this.state.els.lane
    if (!lane) return
    const game = content.game
    const s = game.state()
    const items = game.nearby()
    const pool = this.state.viz || (this.state.viz = {})
    const total = 1 + items.length
    if (this.state.vizCount !== total) {
      while (lane.children.length > total) lane.removeChild(lane.lastChild)
      while (lane.children.length < total) {
        const span = document.createElement('span')
        lane.appendChild(span)
      }
      this.state.vizCount = total
    }
    const bottomOf = (dist) => 8 + Math.max(0, Math.min(78, 78 - (dist / 60) * 78))
    const xOf = (dx) => 50 + (dx / (content.constants.EDGE * 1.3)) * 42
    const children = lane.children
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const el = children[i]
      const isEnemy = it.kind.indexOf('enemy:') === 0
      const isPickup = ['coin', 'gem', 'core', 'ammo', 'medkit', 'emp', 'shield', 'boost', 'overdrive', 'brake'].indexOf(it.kind) !== -1
      const color = isEnemy ? '#ff5d5d'
        : isPickup ? (content.constants.PICKUP_REWARDS[it.kind] || {}).color
        : (content.constants.OBSTACLES[it.kind] || {}).color
      el.className = 'a-game--viz-item'
      if (isEnemy) el.classList.add('a-game--viz-enemy')
      else if (isPickup) el.classList.add('a-game--viz-pickup')
      else el.classList.add('a-game--viz-obs')
      if (color) el.style.background = color
      el.style.left = String(Math.max(3, Math.min(97, xOf(it.x)))) + '%'
      el.style.bottom = String(bottomOf(it.dist)) + '%'
      el.style.width = String(Math.max(3, it.w * 9)) + '%'
      el.style.opacity = String(0.45 + Math.max(0, 1 - it.dist / 60) * 0.55)
    }
    const player = children[items.length]
    player.className = 'a-game--viz-item a-game--viz-player'
    player.style.left = '50%'
    player.style.bottom = '4%'
    player.style.width = '5%'
    player.style.opacity = '1'
    player.style.background = '#ffffff'
  },
})
