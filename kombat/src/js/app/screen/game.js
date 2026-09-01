// KOMBAT game screen. Reads the keyboard once a frame, hands content.game a
// single intent object, and turns the events that come back into binaural audio
// and screen-reader announcements.
//
// Two rules about input, and they are what make the game feel like a fighter:
//
//   * DIRECTIONS ARE HELD. A and D walk; S holds a block up for as long as you
//     keep it down. Nothing about them is edge-triggered except the record kept
//     for special motions.
//   * ATTACKS AND THE JUMP ARE EDGES. Holding U does not throw punches. This is
//     also why only ONE attack is passed per frame: mashing two keys together
//     resolves to the first in U, I, J, K order rather than queueing both, so a
//     panicked double-press is a single committed move instead of a stutter.
//
// The announcements are deliberately thin during a round. Everything that is
// time-critical — the tell, the stance, the distance — is carried by audio,
// because a screen reader cannot say "high kick" faster than you have to react
// to it. Speech is reserved for the things you have time to hear: the round
// result, a knockdown, and the three F-key readouts you ask for.
app.screen.game = app.screenManager.invent({
  id: 'game',
  parentSelector: '.a-app--game',
  rootSelector: '.a-game',
  transitions: {
    pause: function () { this.change('pause') },
    gameOver: function () { this.change('gameover') },
  },
  state: {
    healthEl: null, foeHealthEl: null, healthBar: null, foeHealthBar: null,
    clockEl: null, roundEl: null, stageEl: null, scoreEl: null,
    nameEl: null, foeNameEl: null, pipsEl: null, foePipsEl: null,
    plotEl: null, selfEl: null, foeEl: null, boltEl: null,
    down: {},
    entryFrames: 0,
    wired: false,
    lastCornered: false,
  },

  KEYS: {
    left: ['KeyA', 'ArrowLeft', 'Numpad4'],
    right: ['KeyD', 'ArrowRight', 'Numpad6'],
    jump: ['KeyW', 'ArrowUp', 'Numpad8'],
    block: ['KeyS', 'ArrowDown', 'Numpad5', 'ShiftLeft', 'ShiftRight'],
    highPunch: ['KeyU'],
    highKick: ['KeyI'],
    lowPunch: ['KeyJ'],
    lowKick: ['KeyK'],
  },
  PADS: {
    left: [14],
    right: [15],
    jump: [12],
    block: [6, 7],
    highPunch: [3],
    highKick: [1],
    lowPunch: [2],
    lowKick: [0],
  },
  ATTACK_ORDER: ['highPunch', 'highKick', 'lowPunch', 'lowKick'],

  onReady: function () {
    const root = this.rootElement
    const q = (s) => root.querySelector(s)
    this.state.healthEl = q('.a-game--health-value')
    this.state.foeHealthEl = q('.a-game--foe-health-value')
    this.state.healthBar = q('.a-game--health-fill')
    this.state.foeHealthBar = q('.a-game--foe-health-fill')
    this.state.clockEl = q('.a-game--clock-value')
    this.state.roundEl = q('.a-game--round-value')
    this.state.stageEl = q('.a-game--stage-value')
    this.state.scoreEl = q('.a-game--score-value')
    this.state.nameEl = q('.a-game--name')
    this.state.foeNameEl = q('.a-game--foe-name')
    this.state.pipsEl = q('.a-game--pips')
    this.state.foePipsEl = q('.a-game--foe-pips')
    this.state.plotEl = q('.a-game--plot')
    this.state.selfEl = q('.a-game--self')
    this.state.foeEl = q('.a-game--foe')
    this.state.boltEl = q('.a-game--bolt')

    window.addEventListener('keydown', (e) => {
      if (!app.screenManager.is('game')) return
      if (['F1', 'F2', 'F3', 'F5'].includes(e.key)) e.preventDefault()
      if ([' ', 'Spacebar', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
      }
    })

    this.wireEvents()
  },

  wireEvents: function () {
    if (this.state.wired) return
    this.state.wired = true
    const self = this
    const A = () => content.audio
    const t = (k, p) => app.i18n.t(k, p)
    const name = (id) => t('fighter.' + id)

    // --- the round ----------------------------------------------------------
    content.events.on('round-start', (e) => {
      A().stopPresence()
      A().startPresence(content.characters.get(e.foe).toneHz)
      A().bell(e.round)
      self.refreshHud()
      app.announce.assertive(t('ann.roundStart', {
        round: e.round, foe: name(e.foe), stage: e.stage,
      }))
    })

    content.events.on('fight', () => {
      A().fightCall()
      app.announce.assertive(t('ann.fight'))
    })

    // --- attacks ------------------------------------------------------------
    // The tell is the game's most important sound and it is NEVER spoken: by
    // the time a screen reader had said "low kick" the sweep would already be
    // over. It is audio only, on purpose.
    content.events.on('tell', (e) => A().tell(e.dx, e.level, e.limb, e.startup))
    content.events.on('whiff', (e) => A().whiff(e.dx, e.limb))
    content.events.on('jumped-over', (e) => A().jumpedOver(e.dx))

    content.events.on('hit', (e) => {
      A().hit(e.dx, e.level, e.limb, e.damage, e.airHit)
      if (e.knockdown) A().knockdown(e.dx)
      if (e.victim === 'player') {
        self.rumble(0.9, 0.6, e.knockdown ? 340 : 180)
        // Only a knockdown interrupts with speech — it is the one hit that
        // costs you a whole second of the round, so you need to know why.
        if (e.knockdown) {
          app.announce.assertive(t('ann.knockedDown', {health: Math.ceil(e.health)}))
        }
      } else {
        self.rumble(0.35, 0.5, 120)
        A().crowdRoar(Math.min(1, e.damage / 20))
      }
      self.refreshHud()
    })

    content.events.on('blocked', (e) => {
      A().blocked(e.dx)
      if (e.victim === 'player') self.rumble(0.25, 0.3, 90)
      self.refreshHud()
    })

    // --- bodies -------------------------------------------------------------
    content.events.on('jump', (e) => A().jump(e.dx))
    content.events.on('land', (e) => A().land(e.dx))
    content.events.on('getup', (e) => A().getup(e.dx))

    // --- specials -----------------------------------------------------------
    content.events.on('special-charge', (e) => {
      A().specialCharge(e.dx, e.fighter, e.level, e.charge)
      // The opponent's special IS announced, because its charge is long enough
      // that you have time to hear a word and still act on it — and because
      // knowing which special is charging tells you whether to block or jump.
      if (e.side === 'foe') {
        app.announce.assertive(t('ann.foeSpecial', {name: t('special.' + e.id)}))
      }
    })
    content.events.on('special-fire', (e) => A().specialFire(e.dx, e.id))
    content.events.on('teleport', (e) => A().teleport(e.dx))
    content.events.on('dash', (e) => A().jump(e.dx))
    content.events.on('projectile', (e) => A().projectile(e.dx, Math.abs(e.dx)))
    content.events.on('projectile-gone', () => A().projectileGone())

    // --- results ------------------------------------------------------------
    content.events.on('ko', (e) => {
      A().ko(e.winner === 'player')
      content.music.setIntensity(0)
      self.refreshHud()
      app.announce.assertive(e.winner === 'player'
        ? t(e.perfect ? 'ann.perfect' : 'ann.roundWon', {
          you: e.playerRounds, them: e.foeRounds,
        })
        : t('ann.roundLost', {you: e.playerRounds, them: e.foeRounds}))
    })

    content.events.on('timeout', (e) => {
      A().ko(e.winner === 'player')
      self.refreshHud()
      app.announce.assertive(e.winner
        ? t(e.winner === 'player' ? 'ann.timeWon' : 'ann.timeLost', {
          you: e.playerHealth, them: e.foeHealth,
        })
        : t('ann.draw'))
    })

    content.events.on('stage-clear', (e) => {
      A().stageClear()
      app.announce.assertive(t('ann.stageClear', {
        foe: name(e.beat), score: e.score,
      }))
    })

    content.events.on('game-over', (e) => {
      A().gameOver()
      content.music.stop()
      app.announce.assertive(e.won
        ? t('ann.ladderWon', {score: e.score})
        : t('ann.defeated', {score: e.score, stage: e.stage}))
      app.screenManager.dispatch('gameOver')
    })
  },

  onEnter: function () {
    content.audio.startAmbient()
    content.music.start()
    this.state.down = {}
    this.state.entryFrames = 8
    this.state.lastCornered = false
    app.utility.focus.setWithin(this.rootElement)
    this.refreshHud()
    try { app.onlineScores.openSession().catch(() => {}) } catch (e) {}
  },

  onExit: function () {
    if (content.audio && content.audio.silenceAll) content.audio.silenceAll()
    if (content.music && content.music.stop) content.music.stop()
  },

  onFrame: function (e) {
    try {
      const delta = Math.min(0.05, (e && e.delta) || 1 / 60)
      const k = engine.input.keyboard
      const gp = engine.input.gamepad

      if (this.edge('pause', k.is('Escape') || k.is('Backspace') || gp.isDigital(9))) {
        app.announce.assertive(app.i18n.t('ann.paused'))
        app.screenManager.dispatch('pause')
        return
      }

      if (this.state.entryFrames > 0) {
        this.state.entryFrames--
        content.game.update(delta)
        return
      }

      const intent = {
        left: this.held('left', k, gp),
        right: this.held('right', k, gp),
        jump: this.held('jump', k, gp),
        block: this.held('block', k, gp),
        attack: null,
      }

      // One attack per frame, first in U I J K order. Every attack key is read
      // as an edge here rather than in content, so the game logic never has to
      // know what a keyboard is.
      for (const id of this.ATTACK_ORDER) {
        if (this.edge(id, this.held(id, k, gp))) {
          intent.attack = id
          break
        }
      }

      // Tell the opponent's mixup model how you are defending, so blocking
      // everything or jumping everything both stop working.
      if (this.edge('blockEdge', intent.block)) content.ai.noteDefence('block')
      if (this.edge('jumpEdge', intent.jump)) content.ai.noteDefence('jump')

      content.game.setInput(intent)
      content.game.update(delta)

      const st = content.game.status()
      content.audio.frame(delta, st)
      // The bed reads how badly it is going: your health falling and theirs not.
      content.music.setIntensity(
        Math.max(0, Math.min(1, (1 - st.healthFrac) * 0.8 + st.foeHealthFrac * 0.2)))
      content.music.update(delta)
      if (app.haptics && app.haptics.update) app.haptics.update(delta)

      if (st.cornered && !this.state.lastCornered) content.audio.corner(0)
      this.state.lastCornered = !!st.cornered

      if (this.edge('f1', k.is('F1'))) this.announceStatus()
      if (this.edge('f2', k.is('F2'))) this.announceOpponent()
      if (this.edge('f3', k.is('F3'))) this.announceMoves()

      this.refreshHud()
      this.renderPlot(st)
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
    const was = this.state.down[name]
    this.state.down[name] = isDown
    return isDown && !was
  },
  rumble: function (strong, weak, ms) {
    if (app.haptics && app.haptics.enqueue) {
      app.haptics.enqueue({duration: ms || 200, strongMagnitude: strong, weakMagnitude: weak})
    }
  },

  // --- the three readouts ---------------------------------------------------

  // F1 — the scoreboard. Everything the HUD shows, for anyone not reading it.
  announceStatus: function () {
    const s = content.game.status()
    app.announce.polite(app.i18n.t('ann.status', {
      health: s.health,
      foeHealth: s.foeHealth,
      round: s.round,
      you: s.playerRounds,
      them: s.foeRounds,
      clock: s.clock,
      score: s.score,
      stage: s.stage,
    }))
  },

  // F2 — where they are and what they are doing, in words. The audio says this
  // continuously; this is for confirming a reading you are not yet sure of.
  announceOpponent: function () {
    const s = content.game.status()
    app.announce.polite(app.i18n.t('ann.opponent', {
      foe: app.i18n.t('fighter.' + s.foeId),
      side: this.sideWord(s.dx),
      range: this.rangeWord(s),
      stance: app.i18n.t('stance.' + s.foeStance),
    }))
  },

  // F3 — your own fighter's special, and whether it is ready. A motion input
  // you cannot remember is a move you do not have.
  announceMoves: function () {
    const s = content.game.status()
    const c = content.characters.get(s.playerId)
    const sp = c.special
    app.announce.polite(app.i18n.t('ann.moves', {
      fighter: app.i18n.t('fighter.' + c.id),
      special: app.i18n.t('special.' + sp.id),
      motion: sp.motion.map((d) => app.i18n.t('motion.' + d)).join(', '),
      button: content.combat.get(sp.button).key,
      ready: s.specialReady
        ? app.i18n.t('ann.specialReady')
        : app.i18n.t('ann.specialCooling', {secs: Math.ceil(s.cooldown)}),
    }))
  },

  sideWord: function (dx) {
    if (Math.abs(dx) < 0.8) return app.i18n.t('dir.onYou')
    return app.i18n.t(dx < 0 ? 'dir.left' : 'dir.right')
  },

  rangeWord: function (s) {
    if (s.inPunchRange) return app.i18n.t('range.punch')
    if (s.inKickRange) return app.i18n.t('range.kick')
    if (s.dist < content.constants.ARENA_HALF) return app.i18n.t('range.out')
    return app.i18n.t('range.far')
  },

  // --- HUD ------------------------------------------------------------------

  refreshHud: function () {
    if (!this.state.healthEl) return
    const s = content.game.status()
    if (s.health == null) return
    const st = this.state

    st.healthEl.textContent = String(s.health)
    st.foeHealthEl.textContent = String(s.foeHealth)
    if (st.healthBar) st.healthBar.style.width = (s.healthFrac * 100) + '%'
    if (st.foeHealthBar) st.foeHealthBar.style.width = (s.foeHealthFrac * 100) + '%'
    if (st.clockEl) st.clockEl.textContent = String(s.clock)
    if (st.roundEl) st.roundEl.textContent = String(s.round)
    if (st.stageEl) st.stageEl.textContent = String(s.stage)
    if (st.scoreEl) st.scoreEl.textContent = String(s.score)
    if (st.nameEl) st.nameEl.textContent = app.i18n.t('fighter.' + s.playerId)
    if (st.foeNameEl) st.foeNameEl.textContent = app.i18n.t('fighter.' + s.foeId)
    if (st.pipsEl) st.pipsEl.textContent = this.pips(s.playerRounds)
    if (st.foePipsEl) st.foePipsEl.textContent = this.pips(s.foeRounds)
  },

  pips: function (n) {
    const need = content.constants.ROUNDS_TO_WIN
    let out = ''
    for (let i = 0; i < need; i++) out += i < n ? '●' : '○'
    return out
  },

  // A side-on view of the floor (aria-hidden; the audio is the real interface).
  // Same two axes the sound uses and nothing else: horizontal position, and
  // height off the ground.
  renderPlot: function (s) {
    const el = this.state.plotEl
    if (!el || !s || s.playerX == null) return
    const half = s.arenaHalf
    const place = (node, x, y, stance) => {
      if (!node) return
      node.style.left = (50 + (x / half) * 46) + '%'
      node.style.bottom = (6 + (y / content.constants.JUMP_HEIGHT) * 62) + '%'
      node.setAttribute('data-stance', stance)
    }
    place(this.state.selfEl, s.playerX, s.playerY, s.stance)
    place(this.state.foeEl, s.foeX, s.foeY, s.foeStance)

    if (this.state.boltEl) {
      if (s.projectile) {
        this.state.boltEl.hidden = false
        this.state.boltEl.style.left =
          (50 + ((s.playerX + s.projectile.dx) / half) * 46) + '%'
      } else {
        this.state.boltEl.hidden = true
      }
    }
  },
})
