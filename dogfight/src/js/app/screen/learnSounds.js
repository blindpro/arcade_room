app.screen.learnSounds = app.screenManager.invent({
  id: 'learnSounds',
  parentSelector: '.a-app--learnSounds',
  rootSelector: '.a-learnSounds',
  transitions: {
    back: function () { this.change('menu') },
  },
  state: {
    items: null,
  },
  onReady: function () {
    const root = this.rootElement
    const items = [
      {key: 'learn.uiFocus', play: () => content.sounds.uiFocus()},
      {key: 'learn.uiBack', play: () => content.sounds.uiBack()},
      {key: 'learn.roundStart', play: () => content.sounds.roundStart()},
      {key: 'learn.roundEndWin', play: () => content.sounds.roundEnd(true)},
      {key: 'learn.roundEndLose', play: () => content.sounds.roundEnd(false)},
      {key: 'learn.collisionLight', play: () => content.sounds.collision({x: 0, y: 0}, 0.25)},
      {key: 'learn.collisionHeavy', play: () => content.sounds.collision({x: 0, y: 0}, 1)},
      {key: 'learn.scoringSmall', play: () => content.sounds.scoring(0.15)},
      {key: 'learn.scoringBig', play: () => content.sounds.scoring(1.0)},
      {key: 'learn.buzzerLight', play: () => content.sounds.buzzer({x: 0, y: 0}, 0.3)},
      {key: 'learn.buzzerHard', play: () => content.sounds.buzzer({x: 0, y: 0}, 1.0)},
      {key: 'learn.wallScrape', play: () => content.sounds.wallScrape({x: 0, y: 0}, 3)},
      {key: 'learn.elimination', play: () => content.sounds.eliminate({x: 0, y: 0})},
      {key: 'learn.heartbeat', play: () => content.sounds.heartbeat()},
      {key: 'game.gunsCooldown', play: () => content.sounds.machineGun({x: 0, y: 0})},
      {key: 'ann.missileFired', params: {count: 3}, play: () => content.sounds.missileLaunch({x: 0, y: 0})},
      {key: 'ann.missileIncoming', play: () => content.sounds.missileWarning()},
      {key: 'ann.missileLock', params: {label: 'Bandit'}, play: () => content.sounds.startLockTone()},
      {key: 'learn.proximityFront', play: () => playProximity(true)},
      {key: 'learn.proximityBehind', play: () => playProximity(false)},
      {key: 'learn.wallProximity', play: () => playWallProximity()},
    ]

    for (let i = 0; i < content.carEngine.profileCount; i++) {
      const idx = i
      items.push({
        key: 'learn.engine',
        colorId: content.carEngine.profileName(idx),
        play: () => previewEngine(idx),
      })
    }

    this.state.items = items
    this.renderList()
    app.i18n.onChange(() => this.renderList())

    root.addEventListener('click', (e) => {
      const back = e.target.closest('button[data-action="back"]')
      if (back) {
        content.sounds.uiBack()
        app.screenManager.dispatch('back')
      }
    })
    root.addEventListener('focusin', (e) => {
      if (e.target.matches('button')) content.sounds.uiFocus()
    })

    function playProximity(front) {
      const c = engine.context()
      const t0 = engine.time()
      const out = c.createGain()
      out.gain.value = 1
      out.connect(engine.mixer.output())
      const intervals = [0.5, 0.3, 0.15, 0.08]
      let t = t0
      for (const dt of intervals) {
        const o = c.createOscillator()
        o.type = 'sine'
        o.frequency.value = front ? 1400 : 520
        const g = c.createGain()
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(0.4, t + 0.005)
        g.gain.linearRampToValueAtTime(0, t + 0.08)
        o.connect(g).connect(out)
        o.start(t)
        o.stop(t + 0.1)
        t += dt
      }
      setTimeout(() => { try { out.disconnect() } catch (e) {} }, 1500)
    }

    function playWallProximity() {
      const c = engine.context()
      const t0 = engine.time()
      const dur = 3
      const out = c.createGain()
      out.gain.value = 0
      out.connect(engine.mixer.output())
      const noise = c.createBufferSource()
      noise.buffer = engine.buffer.pinkNoise({channels: 1, duration: dur + 0.2})
      const hp = c.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 180
      const lp = c.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 950
      noise.connect(hp).connect(lp).connect(out)
      for (let i = 0; i <= 24; i++) {
        const phase = i / 24
        const tri = 1 - Math.abs(phase * 2 - 1)
        out.gain.linearRampToValueAtTime(Math.max(0.0005, Math.pow(tri, 4) * 0.16), t0 + phase * dur)
      }
      noise.start(t0)
      noise.stop(t0 + dur + 0.1)
      noise.onended = () => { try { out.disconnect() } catch (e) {} }
    }

    function previewEngine(idx) {
      const sound = content.carEngine.create(idx)
      let phase = 0
      const interval = setInterval(() => {
        phase += 0.1
        sound.update({
          position: {x: 0, y: 0},
          listener: {x: 0, y: 0},
          listenerYaw: 0,
          speed: 6 + Math.sin(phase * 2) * 4,
          throttle: 0.8,
          scrapeSpeed: 0,
          eliminated: false,
        })
      }, 100)
      setTimeout(() => {
        clearInterval(interval)
        sound.destroy()
      }, 2200)
    }
  },
  renderList: function () {
    const list = this.rootElement.querySelector('.a-learnSounds--list')
    list.innerHTML = ''
    for (const it of this.state.items) {
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.className = 'c-menu--button'
      const params = it.colorId ? {color: app.i18n.t('color.' + it.colorId)} : it.params
      btn.textContent = app.i18n.t(it.key, params)
      btn.addEventListener('click', () => it.play())
      li.appendChild(btn)
      list.appendChild(li)
    }
  },
  onFrame: function () {
    const ui = app.controls.ui()
    if (ui.back) {
      content.sounds.uiBack()
      app.screenManager.dispatch('back')
      return
    }
    app.utility.menuNav.handle(this.rootElement)
  },
})
