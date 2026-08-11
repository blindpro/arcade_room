/**
 * Lightweight i18n for SKYDIVE. Shared implementation across the collection;
 * only STORAGE_KEY and the dictionaries differ.
 */
app.i18n = (() => {
  const FALLBACK = 'en'
  const STORAGE_KEY = 'skydive.lang'

  const localeNames = {
    en: 'English',
    es: 'Español',
  }

  const dictionaries = {
    en: {
      'doc.title': 'Skydive',

      // Menu
      'menu.aria': 'Main menu',
      'menu.title': 'Skydive',
      'menu.subtitle': 'An audio-first skydive. You drop from thousands of meters and the longer you fall, the faster you fall. Steer left and right by ear to catch the magic crystals that lift you back up, and see how high in the sky you are when the two minutes run out.',
      'menu.start': 'Start',
      'menu.help': 'How to play',
      'menu.highscores': 'High scores',
      'menu.learn': 'Learn the sounds',

      // Language picker
      'language.aria': 'Choose language',
      'language.title': 'Language',
      'language.subtitle': 'Choose the language used for menus and announcements.',
      'language.back': 'Back',
      'language.button': 'Language',
      'menu.quit': 'Return to Games List',

      // Game / HUD
      'game.aria': 'The dive',
      'hud.score': 'Score',
      'hud.speed': 'Fall speed',
      'hud.time': 'Time',
      'hud.crystals': 'Crystals',

      // Directions
      'dir.left': 'left',
      'dir.centre': 'centred',
      'dir.right': 'right',

      // Proximity
      'prox.far': 'far below',
      'prox.near': 'closing',
      'prox.close': 'right below you',

      // Help
      'help.aria': 'How to play',
      'help.title': 'How to play',
      'help.subtitle': 'Centre the beacon. Catch the crystal. Stay high.',
      'help.intro': 'You jump from five thousand meters and gravity accelerates your fall — the longer you go without a crystal, the faster you fall, and eventually the ground wins. Magic crystals float below you and each one pings at its own pitch: the higher the pitch, the higher it lifts you. The nearest crystal below you is your beacon — you hear it to your left or right depending on where it sits, so steer until it is centred (directly under you). As you drop toward it the beacon ticks faster and louder, and if you fly over it while aligned you catch it automatically: your fall speed resets and the crystal carries you back up. Miss the beacon and the crystal falls past you — the next one below takes over as your new beacon. After two minutes the run ends and your score is how high in the sky you are in meters. Fall to the ground and the run ends early.',
      'help.h.steer': '<kbd>Left</kbd> / <kbd>Right</kbd> (or <kbd>A</kbd> / <kbd>D</kbd>) — glide sideways. Hold to keep moving; the corridor is 60 meters wide.',
      'help.h.beacon': 'The beacon is the nearest crystal below you. Steer until it is centred, then you catch it as you fly over it. It ticks faster and louder as you drop toward it.',
      'help.h.pitch': 'A high-pitch beacon is a strong crystal that lifts you far; a low-pitch one gives a small lift. Other nearby crystals whisper behind the beacon — you can steer for a better one.',
      'help.h.status': '<kbd>F1</kbd> score, height, time, crystals · <kbd>F2</kbd> height and the beacon · <kbd>F3</kbd> crystals, speed, time.',
      'help.h.pause': '<kbd>Escape</kbd> — pause.',
      'help.audio': 'A wash of wind rises as your fall speeds up. The beacon is dead ahead when you are lined up under it, and off to one side when you need to steer that way; it ticks faster and louder as you close in on it.',
      'help.back': 'Back',

      // High scores
      'highscores.aria': 'High scores',
      'highscores.title': 'High scores',
      'highscores.subtitle': 'Your best dives on this device.',
      'highscores.empty': 'No dives yet. Jump!',
      'highscores.entry': '#{rank}. {name} — {score} meters, {crystals} crystals',
      'highscores.back': 'Back',

      // Pause
      'pause.aria': 'Paused',
      'pause.title': 'Paused',
      'pause.resume': 'Resume',
      'pause.restart': 'Restart dive',
      'pause.menu': 'Main menu',

      // Game over
      'gameover.aria': 'The dive is over',
      'gameover.title': 'The dive is over',
      'gameover.subtitle': 'Enter your name to save your score.',
      'gameover.score': 'Score: {score} meters',
      'gameover.name': 'Your name',
      'gameover.save': 'Save score',
      'gameover.continue': 'Continue',
      'gameover.nameRequired': 'Please enter a name first.',

      // Learn the sounds
      'learn.aria': 'Learn the sounds',
      'learn.title': 'Learn the sounds',
      'learn.subtitle': 'Play each cue on its own.',
      'learn.crystalLeft': 'Crystal beacon — to your left',
      'learn.crystalCentre': 'Crystal beacon — centred (lined up)',
      'learn.crystalRight': 'Crystal beacon — to your right',
      'learn.crystalNear': 'Crystal beacon — right below you',
      'learn.crystalHigh': 'Crystal beacon — high pitch (big lift)',
      'learn.ping': 'Another crystal, whispering',
      'learn.retarget': 'Beacon switches to a new crystal',
      'learn.collect': 'Catching a crystal',
      'learn.warning': 'Time warning',
      'learn.dive': 'Dive! (run start)',
      'learn.crash': 'Hitting the ground',
      'learn.timeup': "Time's up",
      'learn.over': 'The dive is over',
      'learn.back': 'Back',

      // Stereo test
      'test.aria': 'Stereo audio test',
      'test.title': 'Stereo audio test',
      'test.subtitle': 'Confirm the panning: left is left, right is right, centre is straight under you.',
      'test.left': 'Play left',
      'test.centre': 'Play centre',
      'test.right': 'Play right',
      'test.sweep': 'Sweep left · centre · right',
      'test.ring': 'Ring left · centre · right · centre',
      'test.back': 'Back',

      // Online
      'online.posting': 'Posting your score…',
      'online.rank': 'Online rank: #{rank}',
      'online.error': "Couldn't reach the leaderboard. Saved locally.",
      'online.viewBoard': 'View the leaderboard',

      // Announcements
      'ann.ready': 'Ready. Three.',
      'ann.two': 'Two.',
      'ann.one': 'One.',
      'ann.dive': 'Dive!',
      'ann.collect': 'Crystal! Up {lift} meters. {count} caught.',
      'ann.timeLeft': '{time} seconds left.',
      'ann.gameOver': 'Down you go. Height {height} meters, {crystals} crystals.',
      'ann.gameOverHigh': 'Down you go. New high score, {score} meters!',
      'ann.status': 'Score {score} meters, height {height} meters, {time} seconds left, {crystals} crystals.',
      'ann.height': 'You are {height} meters up.',
      'ann.beacon': 'Beacon {dir}, pitch {pitch} hertz, {prox}.',
      'ann.field': '{crystals} crystals caught, falling {speed} meters per second, {time} seconds left.',
      'ann.scoreSaved': 'Score saved.',
      'ann.onlineRank': 'Online rank number {rank}.',
      'ann.onlineError': 'Leaderboard unavailable. Saved on this device.',
      'ann.paused': 'Paused.',
      'ann.resumed': 'Resumed.',
    },

    es: {
      'doc.title': 'Skydive',

      'menu.aria': 'Menú principal',
      'menu.title': 'Skydive',
      'menu.subtitle': 'Un salto en paracaídas guiado por audio. Te lanzas desde miles de metros y cuanto más caes, más rápido caes. Muévete a izquierda y derecha de oído para atrapar los cristales mágicos que te elevan y mira lo alto que estás cuando se acaben los dos minutos.',
      'menu.start': 'Empezar',
      'menu.help': 'Cómo jugar',
      'menu.highscores': 'Puntuaciones',
      'menu.learn': 'Aprende los sonidos',

      'language.aria': 'Elegir idioma',
      'language.title': 'Idioma',
      'language.subtitle': 'Elige el idioma para los menús y los anuncios.',
      'language.back': 'Atrás',
      'language.button': 'Idioma',
      'menu.quit': 'Volver a la lista de juegos',

      'game.aria': 'La caída',
      'hud.score': 'Puntos',
      'hud.speed': 'Velocidad',
      'hud.time': 'Tiempo',
      'hud.crystals': 'Cristales',

      'dir.left': 'izquierda',
      'dir.centre': 'centrado',
      'dir.right': 'derecha',

      'prox.far': 'lejos abajo',
      'prox.near': 'acercándose',
      'prox.close': 'justo debajo de ti',

      'help.aria': 'Cómo jugar',
      'help.title': 'Cómo jugar',
      'help.subtitle': 'Centra la baliza. Atrapa el cristal. Sigue arriba.',
      'help.intro': 'Saltas desde cinco mil metros y la gravedad acelera tu caída: cuanto más tiempo pasas sin un cristal, más rápido caes y al final gana el suelo. Los cristales mágicos flotan debajo de ti y cada uno repica a su propio tono: cuanto más agudo, más alto te eleva. El cristal más cercano debajo de ti es tu baliza: la oyes a tu izquierda o derecha según dónde esté, así que muévete hasta centrarla (justo debajo de ti). Mientras caes hacia ella, la baliza repica más rápido y más fuerte; si pasas sobre ella alineado, la atrapas automáticamente: tu velocidad de caída se reinicia y el cristal te lleva hacia arriba. Si fallas la baliza, el cristal pasa de largo y el siguiente de abajo se convierte en tu nueva baliza. Cuando se acaban los dos minutos, tu puntuación es lo alto que estás en el cielo, en metros. Si tocas el suelo, la partida termina antes.',
      'help.h.steer': '<kbd>Izquierda</kbd> / <kbd>Derecha</kbd> (o <kbd>A</kbd> / <kbd>D</kbd>) — deslízate de lado. Mantén para moverte; el pasillo mide 60 metros de ancho.',
      'help.h.beacon': 'La baliza es el cristal más cercano debajo de ti. Muévete hasta centrarla y la atraparás al pasar por encima. Repica más rápido y más fuerte a medida que te acercas.',
      'help.h.pitch': 'Una baliza aguda es un cristal fuerte que te eleva mucho; una grave da poca elevación. Otros cristales cercanos susurran detrás de la baliza: puedes ir a por uno mejor.',
      'help.h.status': '<kbd>F1</kbd> puntos, altura, tiempo, cristales · <kbd>F2</kbd> altura y la baliza · <kbd>F3</kbd> cristales, velocidad, tiempo.',
      'help.h.pause': '<kbd>Escape</kbd> — pausa.',
      'help.audio': 'Un soplo de viento sube según acelera tu caída. La baliza suena justo al frente cuando estás alineado bajo ella, y hacia un lado cuando tienes que moverte allí; repica más rápido y más fuerte al acercarte.',
      'help.back': 'Atrás',

      'highscores.aria': 'Puntuaciones',
      'highscores.title': 'Puntuaciones',
      'highscores.subtitle': 'Tus mejores caídas en este dispositivo.',
      'highscores.empty': 'Aún no hay caídas. ¡Salta!',
      'highscores.entry': '#{rank}. {name} — {score} metros, {crystals} cristales',
      'highscores.back': 'Atrás',

      'pause.aria': 'Pausa',
      'pause.title': 'Pausa',
      'pause.resume': 'Continuar',
      'pause.restart': 'Reiniciar caída',
      'pause.menu': 'Menú principal',

      'gameover.aria': 'La caída ha terminado',
      'gameover.title': 'La caída ha terminado',
      'gameover.subtitle': 'Escribe tu nombre para guardar tu puntuación.',
      'gameover.score': 'Puntos: {score} metros',
      'gameover.name': 'Tu nombre',
      'gameover.save': 'Guardar',
      'gameover.continue': 'Continuar',
      'gameover.nameRequired': 'Escribe un nombre primero.',

      'learn.aria': 'Aprende los sonidos',
      'learn.title': 'Aprende los sonidos',
      'learn.subtitle': 'Reproduce cada señal por separado.',
      'learn.crystalLeft': 'Baliza de cristal — a tu izquierda',
      'learn.crystalCentre': 'Baliza de cristal — centrada (alineado)',
      'learn.crystalRight': 'Baliza de cristal — a tu derecha',
      'learn.crystalNear': 'Baliza de cristal — justo debajo de ti',
      'learn.crystalHigh': 'Baliza de cristal — aguda (gran elevación)',
      'learn.ping': 'Otro cristal, susurrando',
      'learn.retarget': 'La baliza pasa a un nuevo cristal',
      'learn.collect': 'Atrapar un cristal',
      'learn.warning': 'Aviso de tiempo',
      'learn.dive': '¡A volar! (inicio)',
      'learn.crash': 'Golpear el suelo',
      'learn.timeup': 'Se acabó el tiempo',
      'learn.over': 'La caída ha terminado',
      'learn.back': 'Atrás',

      'test.aria': 'Prueba de sonido estéreo',
      'test.title': 'Prueba de sonido estéreo',
      'test.subtitle': 'Confirma el paneo: izquierda es izquierda, derecha es derecha, centro es justo debajo de ti.',
      'test.left': 'Sonar a la izquierda',
      'test.centre': 'Sonar al centro',
      'test.right': 'Sonar a la derecha',
      'test.sweep': 'Recorrer izquierda · centro · derecha',
      'test.ring': 'Anillo izquierda · centro · derecha · centro',
      'test.back': 'Atrás',

      'online.posting': 'Enviando tu puntuación…',
      'online.rank': 'Puesto en línea: #{rank}',
      'online.error': 'No se pudo conectar con la clasificación. Guardado localmente.',
      'online.viewBoard': 'Ver la clasificación',

      'ann.ready': 'Listos. Tres.',
      'ann.two': 'Dos.',
      'ann.one': 'Uno.',
      'ann.dive': '¡A volar!',
      'ann.collect': '¡Cristal! Sube {lift} metros. Llevas {count}.',
      'ann.timeLeft': 'Quedan {time} segundos.',
      'ann.gameOver': 'Cae la caída. Altura {height} metros, {crystals} cristales.',
      'ann.gameOverHigh': 'Cae la caída. ¡Nuevo récord, {score} metros!',
      'ann.status': 'Puntos {score} metros, altura {height} metros, {time} segundos, {crystals} cristales.',
      'ann.height': 'Estás a {height} metros.',
      'ann.beacon': 'Baliza {dir}, tono {pitch} hercios, {prox}.',
      'ann.field': '{crystals} cristales atrapados, caes a {speed} metros por segundo, quedan {time} segundos.',
      'ann.scoreSaved': 'Puntuación guardada.',
      'ann.onlineRank': 'Puesto en línea número {rank}.',
      'ann.onlineError': 'Clasificación no disponible. Guardado en este dispositivo.',
      'ann.paused': 'Pausa.',
      'ann.resumed': 'Reanudado.',
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
