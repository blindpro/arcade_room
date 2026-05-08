// Sound dictionary. Lists every distinct cue and lets the player
// audition them individually. Listener is pinned to (0,0) facing
// screen-north; samples are placed 3 tiles ahead so they're audible from
// a known direction. Each click plays the sample once — no looping that
// could overlap or trip the player up.
app.screen.learn = app.screenManager.invent({
  id: 'learn',
  parentSelector: '.a-app--learn',
  rootSelector: '.a-learn',
  transitions: {
    back: function () { this.change('menu') },
  },
  state: { nav: null, entryFrames: 0, previewProp: null },
  onReady: function () {
    const root = this.rootElement
    this.state.nav = root.querySelector('.a-learn--nav')

    const soundKeys = [
      'wall',
      'wallPerimeter', 'wallPillar',
      'playerStep',
      'footstepGrunt', 'footstepFlank', 'footstepSniper',
      'laserGrunt', 'laserFlank', 'laserSniper',
      'laserBeam',
      'myLaser', 'robotDeath', 'wallZap',
      'playerHitByLaser', 'playerHitByWall', 'playerHitByOtto',
      'ottoBounce', 'ottoBuzz',
      'barkAlert', 'barkChicken', 'barkGotHim',
      'extraLife', 'gameOver', 'roomCleared', 'getReady',
    ]

    for (const key of soundKeys) {
      const li = document.createElement('li')
      const b = document.createElement('button')
      b.className = 'c-menu--button'
      b.dataset.sound = key
      b.dataset.i18n = 'learn.' + key
      b.textContent = app.i18n.t('learn.' + key)
      li.appendChild(b)
      this.state.nav.appendChild(li)
    }

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button')
      if (!btn) return
      if (btn.dataset.action === 'back') { app.screenManager.dispatch('back'); return }
      if (btn.dataset.sound) this.playSample(btn.dataset.sound, btn.textContent)
    })
  },
  onEnter: function () {
    this.state.entryFrames = 6
    content.audio.start()
    content.audio.silenceAll()
    content.audio.setStaticListener(content.audio.LISTENER_YAW)
    app.announce.polite(app.i18n.t('ann.learnHello'))
  },
  onExit: function () {
    if (this.state.previewProp) {
      try { this.state.previewProp.destroy() } catch (_) {}
      this.state.previewProp = null
    }
  },
  onFrame: function () {
    try {
      if (this.state.entryFrames > 0) {
        this.state.entryFrames--
        app.controls.ui()
        return
      }
      const ui = app.controls.ui()
      if (ui.back) { content.sfx.menuBack(); app.screenManager.dispatch('back'); return }
      if (ui.up) { content.sfx.menuMove(); app.utility.focus.setPreviousFocusable(this.rootElement) }
      if (ui.down) { content.sfx.menuMove(); app.utility.focus.setNextFocusable(this.rootElement) }
      if (ui.enter || ui.space || ui.confirm) {
        const f = app.utility.focus.get(this.rootElement)
        if (f) {
          if (f.dataset.action === 'back') { app.screenManager.dispatch('back'); return }
          if (f.dataset.sound) this.playSample(f.dataset.sound, f.textContent)
        }
      }
    } catch (e) { console.error(e) }
  },
  playSample: function (key, label) {
    app.announce.polite(app.i18n.t('ann.playing', {label}))
    // Place sample 3 tiles north of the static listener (audio-front).
    const sx = 0, sy = -3

    // Helper: spin up a continuous prop voice, hold for `holdMs`, then
    // destroy. Used for auditioning the rolling and laser-beam voices
    // (their in-game flavour is continuous, not a one-shot).
    const auditionProp = (build, gain, holdMs) => {
      try {
        if (this.state.previewProp) {
          try { this.state.previewProp.destroy() } catch (_) {}
          this.state.previewProp = null
        }
        const prop = content.audio.makeProp({
          build, x: sx, y: sy, gain: gain != null ? gain : 0.4,
        })
        this.state.previewProp = prop
        setTimeout(() => {
          try { prop.destroy() } catch (_) {}
          if (this.state.previewProp === prop) this.state.previewProp = null
        }, holdMs || 2200)
      } catch (e) { console.error(e) }
    }

    switch (key) {
      case 'wall': content.sfx.wallZap(sx, sy); break
      case 'wallPerimeter':
        auditionProp(content.wallVoice._buildPerimeterVoice, 0.45, 2400); break
      case 'wallPillar':
        auditionProp(content.wallVoice._buildPillarVoice, 0.45, 2400); break
      case 'playerStep': content.sfx.playerFootstep(sx, sy); break
      case 'footstepGrunt': content.sfx.robotFootstep(sx, sy, 220); break
      case 'footstepFlank': content.sfx.robotFootstep(sx, sy, 330); break
      case 'footstepSniper': content.sfx.robotFootstep(sx, sy, 165); break
      case 'laserGrunt': content.sfx.robotLaser(sx, sy, 220); break
      case 'laserFlank': content.sfx.robotLaser(sx, sy, 330); break
      case 'laserSniper': content.sfx.robotLaser(sx, sy, 165); break
      case 'myLaser': content.sfx.playerLaser(sx, sy); break
      case 'robotDeath': content.sfx.robotDeath(sx, sy); break
      case 'wallZap': content.sfx.wallZap(sx, sy); break
      case 'playerHitByLaser': content.sfx.playerHitByLaser(sx, sy); break
      case 'playerHitByWall': content.sfx.playerHitByWall(sx, sy); break
      case 'playerHitByOtto': content.sfx.playerHitByOtto(sx, sy); break
      case 'laserBeam':
        auditionProp(content.robots._buildProjectileVoice(), 0.55, 1500); break
      case 'ottoBounce':
        content.sfx.ottoBounceTick(sx, sy, 0)
        setTimeout(() => content.sfx.ottoBounceTick(sx, sy, 1), 300)
        setTimeout(() => content.sfx.ottoBounceTick(sx, sy, 0), 600)
        break
      case 'ottoBuzz': content.sfx.wallZap(sx, sy); break
      case 'barkAlert': content.voice.say('robotbarks.alert', sx, sy); break
      case 'barkChicken': {
        const k = app.i18n.locale() === 'es' ? 'robotbarks.gallina' : 'robotbarks.chicken'
        content.voice.say(k, sx, sy); break
      }
      case 'barkGotHim': {
        const k = app.i18n.locale() === 'es' ? 'robotbarks.objetivoEliminado' : 'robotbarks.gotHim'
        content.voice.say(k, sx, sy); break
      }
      case 'extraLife': content.sfx.extraLifeJingle(); break
      case 'gameOver': content.sfx.gameOverJingle(); break
      case 'roomCleared': content.sfx.roomClearedFanfare(); break
      case 'getReady': content.sfx.getReadyTone(); break
    }
  },
})
