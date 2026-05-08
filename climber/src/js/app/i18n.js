/**
 * ESCALADOR — i18n.
 *
 * Per-game STORAGE_KEY ('escalador.lang') so locale doesn't leak across the
 * shared origin. Dictionaries are independent per locale (not translations) —
 * Spanish leans into feria/zarzuela cadence; English stays plain New York.
 *
 * Resolution order on boot: localStorage(STORAGE_KEY) → navigator.language
 * 2-letter prefix → 'en'.
 */
app.i18n = (() => {
  const FALLBACK = 'en'
  const STORAGE_KEY = 'escalador.lang'

  const localeNames = {
    en: 'English',
    es: 'Español',
  }

  const dictionaries = {
    en: {
      'doc.title': 'CLIMBER',

      'menu.aria': 'Main menu',
      'menu.subtitle': 'Two-handed climber. Use your ears.',
      'menu.start': 'Climb',
      'menu.learn': 'Learn the Sounds',
      'menu.help': 'How to Play',
      'menu.highscores': 'High Scores',

      'language.aria': 'Choose language',
      'language.title': 'Language',
      'language.subtitle': 'Choose the language used for menus and announcements.',
      'language.back': 'Back',
      'language.button': 'Language',

      'game.aria': 'Climbing',
      'game.hudHint': 'Left hand: <kbd>A</kbd> up, <kbd>Z</kbd> down. Right hand: <kbd>K</kbd> up, <kbd>M</kbd> down. Press <kbd>F1</kbd>–<kbd>F4</kbd> for status.',
      'game.floor': 'Floor {n}',
      'game.score': 'Score {score}',
      'game.lives': 'Lives {n}',
      'game.statusFloor': 'Floor {n} of {goal}.',
      'game.statusScore': 'Score: {score}.',
      'game.statusLives': '{n} lives remaining.',
      'game.statusHands': 'Left at floor {l}. Right at floor {r}.',
      'game.ready': 'Ground floor. Climb!',
      'game.climb': 'Floor {n}.',
      'game.dodgePot': 'Pot dodged.',
      'game.potHit': 'Pot to the {side} hand!',
      'game.windowClosing': 'Window closing on the {side}.',
      'game.windowClosed': 'Window slammed shut.',
      'game.gorillaNear': 'Gorilla above.',
      'game.gorillaSwipe': 'Swipe! Drop down!',
      'game.gorillaHit': 'The gorilla swept you off.',
      'game.fall': 'Falling.',
      'game.extraLife': 'Extra life!',
      'game.buildingClear': 'Building cleared! Bonus {bonus}.',
      'game.nextBuilding': 'Building {n}.',
      'game.deathBoth': 'Both hands lost their grip.',
      'game.deathClosed': 'You reached for a closed window.',
      'game.deathPot': 'A pot smashed your {side} hand.',
      'game.deathGorilla': 'The gorilla swiped you off.',
      'game.deathFell': 'You fell.',
      'game.paused': 'Paused. Esc to resume.',
      'game.resumed': 'Resumed.',
      'game.left': 'left',
      'game.right': 'right',

      'help.aria': 'How to play',
      'help.title': 'How to Play',
      'help.controlsTitle': 'Controls',
      'help.controlA': '<kbd>A</kbd> — left hand reaches up.',
      'help.controlZ': '<kbd>Z</kbd> — left hand drops down (also dodges left-side pots).',
      'help.controlK': '<kbd>K</kbd> — right hand reaches up.',
      'help.controlM': '<kbd>M</kbd> — right hand drops down (also dodges right-side pots).',
      'help.controlPause': '<kbd>Esc</kbd> — pause / quit.',
      'help.controlStatus': '<kbd>F1</kbd> floor, <kbd>F2</kbd> score, <kbd>F3</kbd> lives, <kbd>F4</kbd> hand status.',
      'help.howTitle': 'Climbing',
      'help.howRule1': 'Both hands grip windows. Alternate hands to climb: A, then K, then A again, and so on.',
      'help.howRule2': 'Hands cannot be more than one floor apart. The lower hand must catch up before the higher one can move further.',
      'help.howRule3': 'Each ear plays the corresponding hand\'s grip tone. Pitch rises with altitude.',
      'help.hazTitle': 'Hazards',
      'help.hazPot': 'Falling pots whistle from above on the left or the right. Press the matching DOWN key (Z or M) to dodge.',
      'help.hazWindow': 'Windows can close on you. A creak warns you a second before. Move that hand quickly or you fall.',
      'help.hazGorilla': 'High floors hold a gorilla. Its roar throbs in the centre. When it swipes (whoosh), drop both hands at once.',
      'help.back': 'Back',

      'learn.aria': 'Learn the sounds',
      'learn.title': 'Learn the Sounds',
      'learn.subtitle': 'Audition each cue. Use arrow keys to focus, Enter to play.',
      'learn.gripLeft': 'Left-hand grip tone',
      'learn.gripRight': 'Right-hand grip tone',
      'learn.climb': 'Climb chime',
      'learn.windFloor10': 'Wind at floor 10',
      'learn.windFloor60': 'Wind at floor 60',
      'learn.potLeft': 'Pot from above — LEFT',
      'learn.potRight': 'Pot from above — RIGHT',
      'learn.potHit': 'Pot impact (a hit)',
      'learn.windowCreak': 'Window starting to close',
      'learn.windowSlam': 'Window slamming shut',
      'learn.gorillaRoar': 'Gorilla roar',
      'learn.gorillaSwipe': 'Gorilla swipe',
      'learn.fall': 'Fall scream',
      'learn.extraLife': 'Extra life',
      'learn.buildingClear': 'Building cleared',
      'learn.gameOver': 'Game over',
      'learn.back': 'Back',

      'gameover.aria': 'Game over',
      'gameover.title': 'You Fell',
      'gameover.summary': 'Floor {floor}. Score {score}. Building {building}.',
      'gameover.newHighScore': 'New high score! Enter your name:',
      'gameover.restart': 'Climb Again',
      'gameover.menu': 'Back to Menu',

      'highscores.aria': 'High scores',
      'highscores.title': 'High Scores',
      'highscores.empty': 'No high scores yet. Climb!',
      'highscores.row': '{rank}. {name} — {score} (Floor {floor}, Building {building})',
      'highscores.back': 'Back',

      'test.aria': 'Stereo test',
      'test.title': 'Stereo Test',
      'test.subtitle': 'Plays four ticks: left ear, centre, right ear, centre. Verify your output.',
      'test.play': 'Play',
      'test.back': 'Back',
    },

    es: {
      'doc.title': 'ESCALADOR',

      'menu.aria': 'Menú principal',
      'menu.subtitle': '¡Trepa con las dos manos! Escucha bien.',
      'menu.start': 'Escalar',
      'menu.learn': 'Aprender los sonidos',
      'menu.help': 'Cómo jugar',
      'menu.highscores': 'Récords',

      'language.aria': 'Elegir idioma',
      'language.title': 'Idioma',
      'language.subtitle': 'Elige el idioma para los menús y los anuncios.',
      'language.back': 'Atrás',
      'language.button': 'Idioma',

      'game.aria': 'Escalando',
      'game.hudHint': 'Mano izquierda: <kbd>A</kbd> arriba, <kbd>Z</kbd> abajo. Mano derecha: <kbd>K</kbd> arriba, <kbd>M</kbd> abajo. <kbd>F1</kbd>–<kbd>F4</kbd> para estado.',
      'game.floor': 'Piso {n}',
      'game.score': 'Puntos {score}',
      'game.lives': 'Vidas {n}',
      'game.statusFloor': 'Piso {n} de {goal}.',
      'game.statusScore': 'Puntuación: {score}.',
      'game.statusLives': 'Te quedan {n} vidas.',
      'game.statusHands': 'Izquierda en piso {l}. Derecha en piso {r}.',
      'game.ready': '¡A la calle! ¡Arriba!',
      'game.climb': 'Piso {n}.',
      'game.dodgePot': '¡Esquivada!',
      'game.potHit': '¡Macetazo en la mano {side}!',
      'game.windowClosing': '¡Se cierra la ventana de la {side}!',
      'game.windowClosed': '¡Persiana cerrada!',
      'game.gorillaNear': '¡El gorila acecha!',
      'game.gorillaSwipe': '¡Manotazo! ¡Agáchate!',
      'game.gorillaHit': '¡Te tumbó el gorila!',
      'game.fall': '¡Te caes!',
      'game.extraLife': '¡Vida extra!',
      'game.buildingClear': '¡Edificio coronado! Bonus {bonus}.',
      'game.nextBuilding': 'Edificio {n}.',
      'game.deathBoth': 'Soltaste las dos manos.',
      'game.deathClosed': 'Agarraste una ventana cerrada.',
      'game.deathPot': 'Una maceta te aplastó la mano {side}.',
      'game.deathGorilla': 'El gorila te barrió de la fachada.',
      'game.deathFell': 'Caíste al suelo.',
      'game.paused': 'En pausa. Esc para seguir.',
      'game.resumed': 'Seguimos.',
      'game.left': 'izquierda',
      'game.right': 'derecha',

      'help.aria': 'Cómo jugar',
      'help.title': 'Cómo jugar',
      'help.controlsTitle': 'Controles',
      'help.controlA': '<kbd>A</kbd> — la mano izquierda sube.',
      'help.controlZ': '<kbd>Z</kbd> — la mano izquierda baja (también esquiva macetas a la izquierda).',
      'help.controlK': '<kbd>K</kbd> — la mano derecha sube.',
      'help.controlM': '<kbd>M</kbd> — la mano derecha baja (también esquiva macetas a la derecha).',
      'help.controlPause': '<kbd>Esc</kbd> — pausa / salir.',
      'help.controlStatus': '<kbd>F1</kbd> piso, <kbd>F2</kbd> puntos, <kbd>F3</kbd> vidas, <kbd>F4</kbd> estado de las manos.',
      'help.howTitle': 'Cómo trepar',
      'help.howRule1': 'Las dos manos agarran ventanas. Ve alternando: A, luego K, otra vez A, y así.',
      'help.howRule2': 'Las manos no pueden separarse más de un piso. La mano de abajo debe alcanzar antes de que la de arriba siga subiendo.',
      'help.howRule3': 'Cada oído reproduce el tono de su mano. El tono sube con la altura.',
      'help.hazTitle': 'Peligros',
      'help.hazPot': 'Las macetas silban desde arriba por la izquierda o la derecha. Pulsa la tecla de bajar correspondiente (Z o M) para esquivarlas.',
      'help.hazWindow': 'Las ventanas pueden cerrarse. Un crujido te avisa un segundo antes. ¡Saca la mano o caes!',
      'help.hazGorilla': 'En los pisos altos hay un gorila. Su rugido vibra en el centro. Cuando manotea (zumbido), suelta las dos manos.',
      'help.back': 'Atrás',

      'learn.aria': 'Aprender los sonidos',
      'learn.title': 'Aprender los sonidos',
      'learn.subtitle': 'Escucha cada señal. Flechas para enfocar, Intro para reproducir.',
      'learn.gripLeft': 'Tono de mano izquierda',
      'learn.gripRight': 'Tono de mano derecha',
      'learn.climb': 'Campanita al subir',
      'learn.windFloor10': 'Viento en piso 10',
      'learn.windFloor60': 'Viento en piso 60',
      'learn.potLeft': 'Maceta desde arriba — IZQUIERDA',
      'learn.potRight': 'Maceta desde arriba — DERECHA',
      'learn.potHit': 'Impacto de maceta (te dio)',
      'learn.windowCreak': 'Ventana empezando a cerrarse',
      'learn.windowSlam': 'Ventana cerrándose de golpe',
      'learn.gorillaRoar': 'Rugido del gorila',
      'learn.gorillaSwipe': 'Manotazo del gorila',
      'learn.fall': 'Grito al caer',
      'learn.extraLife': 'Vida extra',
      'learn.buildingClear': 'Edificio coronado',
      'learn.gameOver': 'Fin del juego',
      'learn.back': 'Atrás',

      'gameover.aria': 'Fin del juego',
      'gameover.title': '¡Te caíste!',
      'gameover.summary': 'Piso {floor}. Puntuación {score}. Edificio {building}.',
      'gameover.newHighScore': '¡Nuevo récord! Tu nombre:',
      'gameover.restart': 'Otra vez',
      'gameover.menu': 'Menú',

      'highscores.aria': 'Récords',
      'highscores.title': 'Récords',
      'highscores.empty': 'Aún no hay récords. ¡A trepar!',
      'highscores.row': '{rank}. {name} — {score} (Piso {floor}, Edificio {building})',
      'highscores.back': 'Atrás',

      'test.aria': 'Prueba estéreo',
      'test.title': 'Prueba estéreo',
      'test.subtitle': 'Suena cuatro veces: oído izquierdo, centro, oído derecho, centro. Comprueba tu salida.',
      'test.play': 'Reproducir',
      'test.back': 'Atrás',
    },
  }

  let current = FALLBACK
  const listeners = []

  function detect() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && dictionaries[stored]) return stored
    } catch (e) {}
    const browser = (navigator.language || navigator.userLanguage || '').toLowerCase()
    if (browser) {
      const short = browser.slice(0, 2)
      if (dictionaries[short]) return short
    }
    return FALLBACK
  }

  function lookup(key, locale) {
    const dict = dictionaries[locale]
    if (dict && dict[key] != null) return dict[key]
    const fb = dictionaries[FALLBACK]
    if (fb && fb[key] != null) return fb[key]
    return key
  }

  function format(template, params) {
    if (!params) return template
    return String(template).replace(/\{(\w+)\}/g, (m, k) =>
      Object.prototype.hasOwnProperty.call(params, k) && params[k] != null ? params[k] : m
    )
  }

  function t(key, params) {
    return format(lookup(key, current), params)
  }

  function applyDom(root) {
    const scope = root || document

    if (scope === document) {
      document.title = t('doc.title')
      document.documentElement.lang = current
    }

    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n')
      if (key) el.textContent = t(key)
    })

    scope.querySelectorAll('[data-i18n-html]').forEach((el) => {
      const key = el.getAttribute('data-i18n-html')
      if (key) el.innerHTML = t(key)
    })

    scope.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      const spec = el.getAttribute('data-i18n-attr')
      if (!spec) return
      for (const pair of spec.split(';')) {
        const [attr, key] = pair.split(':').map((s) => s && s.trim())
        if (attr && key) el.setAttribute(attr, t(key))
      }
    })
  }

  function setLocale(loc) {
    if (!dictionaries[loc]) loc = FALLBACK
    if (loc === current) return
    current = loc
    try { localStorage.setItem(STORAGE_KEY, loc) } catch (e) {}
    applyDom()
    for (const fn of listeners.slice()) {
      try { fn(loc) } catch (e) {}
    }
  }

  function onChange(fn) {
    listeners.push(fn)
    return () => {
      const i = listeners.indexOf(fn)
      if (i >= 0) listeners.splice(i, 1)
    }
  }

  current = detect()

  return {
    t,
    applyDom,
    setLocale,
    locale: () => current,
    available: () => Object.keys(dictionaries).map((id) => ({id, name: localeNames[id] || id})),
    localeName: (id) => localeNames[id] || id,
    onChange,
    detect,
  }
})()
