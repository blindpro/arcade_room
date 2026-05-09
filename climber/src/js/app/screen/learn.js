/**
 * CRAZY CLIMBER — learn screen.
 *
 * Lets the player audition each cue at their own pace. Each entry is a
 * button; clicking plays the cue (and stops any continuous voice on
 * subsequent presses or on screen exit via silenceLearn()).
 */
app.screen.learn = app.screenManager.invent({
  id: 'learn',
  parentSelector: '.a-app--learn',
  rootSelector: '.a-learn',
  transitions: {
    back: function () { this.change('menu') },
  },
  state: {
    entryFrames: 0,
    activeStop: null,
  },
  onReady: function () {
    const root = this.rootElement
    this.renderList()
    root.addEventListener('click', (e) => {
      const back = e.target.closest('button[data-action="back"]')
      if (back) {
        this.stopActive()
        app.screenManager.dispatch('back')
        return
      }
      const cue = e.target.closest('button[data-cue]')
      if (cue) {
        this.stopActive()
        this.playCue(cue.dataset.cue)
      }
    })
    if (app.i18n && app.i18n.onChange) {
      app.i18n.onChange(() => this.renderList())
    }
  },
  renderList: function () {
    const list = this.rootElement.querySelector('.a-learn--list')
    if (!list) return
    list.innerHTML = ''
    const t = app.i18n.t.bind(app.i18n)
    const cues = [
      ['gripLeft', 'learn.gripLeft'],
      ['gripRight', 'learn.gripRight'],
      ['climb', 'learn.climb'],
      ['windFloor10', 'learn.windFloor10'],
      ['windFloor60', 'learn.windFloor60'],
      ['potLeft', 'learn.potLeft'],
      ['potRight', 'learn.potRight'],
      ['potHit', 'learn.potHit'],
      ['windowCreak', 'learn.windowCreak'],
      ['windowSlam', 'learn.windowSlam'],
      ['gorillaRoar', 'learn.gorillaRoar'],
      ['gorillaSwipe', 'learn.gorillaSwipe'],
      ['fall', 'learn.fall'],
      ['extraLife', 'learn.extraLife'],
      ['buildingClear', 'learn.buildingClear'],
      ['gameOver', 'learn.gameOver'],
    ]
    for (const [cue, key] of cues) {
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.className = 'c-menu--button'
      btn.dataset.cue = cue
      btn.textContent = t(key)
      li.appendChild(btn)
      list.appendChild(li)
    }
  },
  stopActive: function () {
    if (this.state.activeStop) {
      try { this.state.activeStop() } catch (e) {}
      this.state.activeStop = null
    }
    content.audio.silenceLearn()
  },
  playCue: function (cue) {
    content.audio.start()
    switch (cue) {
      case 'gripLeft':       this.state.activeStop = content.audio.previewGrip('left');  break
      case 'gripRight':      this.state.activeStop = content.audio.previewGrip('right'); break
      case 'climb':          content.audio.dispatch({type: 'climb', side: 'left', floor: 6}); break
      case 'windFloor10':    this.state.activeStop = content.audio.previewWind(10); break
      case 'windFloor60':    this.state.activeStop = content.audio.previewWind(60); break
      case 'potLeft':        content.audio.dispatch({type: 'potIncoming', side: 'left'}); break
      case 'potRight':       content.audio.dispatch({type: 'potIncoming', side: 'right'}); break
      case 'potHit':         content.audio.dispatch({type: 'potHit', side: 'left'}); break
      case 'windowCreak':    content.audio.dispatch({type: 'windowCreak', side: 'left'}); break
      case 'windowSlam':     content.audio.dispatch({type: 'windowSlam', side: 'left'}); break
      case 'gorillaRoar':    this.state.activeStop = content.audio.previewGorillaRoar(); break
      case 'gorillaSwipe':   content.audio.dispatch({type: 'gorillaWhoosh', fromLeft: true});
                             setTimeout(() => content.audio.dispatch({type: 'gorillaSwipe'}), 1000); break
      case 'fall':           content.audio.dispatch({type: 'fall'});
                             setTimeout(() => content.audio.dispatch({type: 'thud'}), 1400); break
      case 'extraLife':      content.audio.dispatch({type: 'extraLife'}); break
      case 'buildingClear':  content.audio.dispatch({type: 'buildingClear'}); break
      case 'gameOver':       content.audio.dispatch({type: 'gameOver'}); break
    }
  },
  onEnter: function () {
    this.state.entryFrames = 6
    this.renderList()
    app.utility.focus.setWithin(this.rootElement)
  },
  onExit: function () {
    this.stopActive()
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
    if (ui.back) {
      this.stopActive()
      app.screenManager.dispatch('back')
    }
    if (ui.enter || ui.space || ui.confirm) {
      const f = app.utility.focus.get(this.rootElement)
      if (f && f.dataset.cue) {
        this.stopActive()
        this.playCue(f.dataset.cue)
      } else if (f && f.dataset.action) {
        this.stopActive()
        app.screenManager.dispatch(f.dataset.action)
      }
    }
  },
})
