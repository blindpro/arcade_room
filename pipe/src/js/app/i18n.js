/**
 * Lightweight i18n for PIPE. Shared implementation across the collection;
 * only STORAGE_KEY and the dictionaries differ.
 */
app.i18n = (() => {
  const FALLBACK = 'en'
  const STORAGE_KEY = 'pipe.lang'

  const localeNames = {
    en: 'English',
    es: 'Español',
  }

  const dictionaries = {
    en: {
      'doc.title': 'Pipe',

      // Menu
      'menu.aria': 'Main menu',
      'menu.title': 'Pipe',
      'menu.subtitle': 'An audio-first tunnel run. You fly down a metal pipe that grows wider every level, and rings block your way — each ring has an opening you must be inside when you reach it, or you slam into its wall, lose a life and get thrown back. The opening hums at its centre, so steer left and right by ear to thread it. Every 10th level is a bonus cavern full of valuable items. Speed rises with every level and the game never ends: your score is how far you got plus the bonus points.',
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
      'game.aria': 'The tunnel run',
      'hud.score': 'Score',
      'hud.speed': 'Speed',
      'hud.level': 'Level',
      'hud.lives': 'Lives',
      'hud.bonus': 'Bonus',

      // Directions
      'dir.left': 'left',
      'dir.centre': 'centred',
      'dir.right': 'right',

      // Proximity
      'prox.far': 'far ahead',
      'prox.near': 'closing',
      'prox.close': 'right ahead of you',

      // Help
      'help.aria': 'How to play',
      'help.title': 'How to play',
      'help.subtitle': 'Centre the hum. Thread the opening. Stay alive.',
      'help.intro': 'You fly down a metal pipe and your speed rises with every level. The pipe is divided into 1-meter lanes, and from time to time a ring blocks it: the ring has an opening that spans some of the lanes, and you must be inside that opening when you reach the ring. If you miss, you slam into the wall, lose a life and get thrown back to try again — you start with three lives. The next opening hums at its centre, so steer left or right until the hum is dead ahead; when the ring becomes your target, you first hear its left and right edges sweep so you know how wide the opening is, then the hum guides you in. Pass five openings and the level advances: the pipe widens and you fly faster. Every 10th level is a bonus cavern — no rings, just valuable items that whisper at the pitch of their points, then an opening that spans the whole pipe so you can\'t miss. The game never ends; your score is how far you got plus the bonus points you collected.',
      'help.h.steer': '<kbd>Left</kbd> / <kbd>Right</kbd> (or <kbd>A</kbd> / <kbd>D</kbd>) — glide sideways. Hold to keep moving. Your flight is a drone whose pitch and trembling grow with your speed, and it leans the way you steer.',
      'help.h.hum': 'The opening\'s centre hums. When it is dead ahead you hear it centred and bright; when you need to move it sits in that ear. It tightens into a fast flutter as you reach the ring.',
      'help.h.width': 'When a new ring becomes your target, you hear its left and right edges sweep first — two clicks far apart mean a wide opening, two clicks close together mean a narrow one. The ring\'s opening is always centred on a lane boundary.',
      'help.h.slam': 'Miss the opening and you slam into the wall, lose a life and get thrown back to re-approach the same ring. Three lives per run.',
      'help.h.bonus': 'Every 10th level is a bonus cavern. Items whisper at the pitch of their points — the higher the pitch, the more they\'re worth. Steer over them to collect.',
      'help.h.status': '<kbd>F1</kbd> score, distance, bonus, lives, level · <kbd>F2</kbd> distance and the next opening · <kbd>F3</kbd> speed, level, openings left.',
      'help.h.pause': '<kbd>Escape</kbd> — pause.',
      'help.audio': 'Your flight drone grows higher and trembles faster as your speed rises. The next opening\'s hum is dead ahead when you are lined up, off to one side when you need to steer that way; its edges sweep when it first becomes the target. A slam is a metal clang, a clean pass is a bright whoosh.',
      'help.back': 'Back',

      // High scores
      'highscores.aria': 'High scores',
      'highscores.title': 'High scores',
      'highscores.subtitle': 'Your best runs on this device.',
      'highscores.empty': 'No runs yet. Fly!',
      'highscores.entry': '#{rank}. {name} — {score} points, {bonus} bonus',
      'highscores.back': 'Back',

      // Pause
      'pause.aria': 'Paused',
      'pause.title': 'Paused',
      'pause.resume': 'Resume',
      'pause.restart': 'Restart run',
      'pause.menu': 'Main menu',

      // Game over
      'gameover.aria': 'The run is over',
      'gameover.title': 'The run is over',
      'gameover.subtitle': 'Enter your name to save your score.',
      'gameover.score': 'Score: {score} points',
      'gameover.name': 'Your name',
      'gameover.save': 'Save score',
      'gameover.continue': 'Continue',
      'gameover.nameRequired': 'Please enter a name first.',

      // Learn the sounds
      'learn.aria': 'Learn the sounds',
      'learn.title': 'Learn the sounds',
      'learn.subtitle': 'Play each cue on its own.',
      'learn.ringLeft': 'Ring opening — to your left',
      'learn.ringCentre': 'Ring opening — centred (dead ahead)',
      'learn.ringRight': 'Ring opening — to your right',
      'learn.ringWide': 'Ring opening — a wide gap',
      'learn.hum': 'The hum — centred, close',
      'learn.humOff': 'The hum — off to the side',
      'learn.pass': 'Passing through an opening',
      'learn.slam': 'Slamming into the wall',
      'learn.levelUp': 'Level up',
      'learn.bonus': 'Bonus cavern starts',
      'learn.itemPing': 'A bonus item, whispering',
      'learn.itemCollect': 'Collecting a bonus item',
      'learn.dive': 'Go! (run start)',
      'learn.over': 'The run is over',
      'learn.back': 'Back',

      // Stereo test
      'test.aria': 'Stereo audio test',
      'test.title': 'Stereo audio test',
      'test.subtitle': 'Confirm the panning: left is left, right is right, centre is dead ahead.',
      'test.left': 'Play left',
      'test.centre': 'Play centre',
      'test.right': 'Play right',
      'test.sweep': 'Sweep left · centre · right',
      'test.ring': 'Ring left · centre · right · centre',
      'test.flight': 'The flight drone (preview)',
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
      'ann.dive': 'Go!',
      'ann.pass': 'Opening cleared.',
      'ann.slam': 'Slam! {lives} lives left.',
      'ann.levelUp': 'Level {level}.',
      'ann.bonusLevel': 'Level {level}! Bonus cavern!',
      'ann.bonusStart': 'Bonus cavern! {count} items ahead.',
      'ann.bonusEnd': 'Cavern cleared.',
      'ann.collect': 'Bonus! {points} points. {count} total.',
      'ann.gameOver': 'Run over. Score {score} points, {distance} meters, level {level}.',
      'ann.gameOverHigh': 'Run over. New high score, {score} points!',
      'ann.status': 'Score {score} points, {distance} meters, {bonusPoints} bonus, {speed} meters per second, level {level}, {lives} lives.',
      'ann.distance': 'You are {distance} meters in.',
      'ann.target': 'Opening {dir}, {width} meters wide, {dist} meters ahead, {prox}.',
      'ann.targetBonus': 'Bonus cavern: {dist} meters to the end, {remaining} items left, {prox}.',
      'ann.field': 'Flying at {speed} meters per second, level {level}, {rings} openings left this level.',
      'ann.scoreSaved': 'Score saved.',
      'ann.onlineRank': 'Online rank number {rank}.',
      'ann.onlineError': 'Leaderboard unavailable. Saved on this device.',
      'ann.paused': 'Paused.',
      'ann.resumed': 'Resumed.',
    },

    es: {
      'doc.title': 'Túnel',

      'menu.aria': 'Menú principal',
      'menu.title': 'Túnel',
      'menu.subtitle': 'Una carrera por un túnel guiada por audio. Vuelas dentro de una tubería metálica que se ensancha en cada nivel, y anillos bloquean tu camino: cada anillo tiene una abertura en la que debes estar cuando lo alcanzas, o chocas contra su muro, pierdes una vida y retrocedes. La abertura zumba en su centro, así que muévete a izquierda y derecha de oído para atravesarla. Cada nivel 10 es una caverna de bonificación llena de objetos valiosos. La velocidad sube cada nivel y el juego no termina nunca: tu puntuación es lo lejos que llegaste más los puntos de bonificación.',
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

      'game.aria': 'La carrera por el túnel',
      'hud.score': 'Puntos',
      'hud.speed': 'Velocidad',
      'hud.level': 'Nivel',
      'hud.lives': 'Vidas',
      'hud.bonus': 'Bonus',

      'dir.left': 'izquierda',
      'dir.centre': 'centrado',
      'dir.right': 'derecha',

      'prox.far': 'lejos al frente',
      'prox.near': 'acercándose',
      'prox.close': 'justo delante de ti',

      'help.aria': 'Cómo jugar',
      'help.title': 'Cómo jugar',
      'help.subtitle': 'Centra el zumbido. Atraviesa la abertura. Sigue vivo.',
      'help.intro': 'Vuelas dentro de una tubería metálica y tu velocidad sube en cada nivel. La tubería está dividida en carriles de 1 metro, y de vez en cuando un anillo la bloquea: el anillo tiene una abertura que abarca varios carriles, y debes estar dentro de esa abertura cuando lo alcanzas. Si fallas, chocas contra el muro, pierdes una vida y retrocedes para volver a intentarlo; empiezas con tres vidas. La siguiente abertura zumba en su centro, así que muévete a izquierda o derecha hasta tener el zumbido justo al frente; cuando un anillo se convierte en tu objetivo, primero oyes barrer sus bordes izquierdo y derecho para saber lo ancha que es la abertura, y luego el zumbido te guía hasta ella. Atraviesa cinco aberturas y subes de nivel: la tubería se ensancha y vuelas más rápido. Cada nivel 10 es una caverna de bonificación — sin anillos, solo objetos valiosos que susurran al tono de sus puntos, y al final una abertura que abarca toda la tubería para que no puedas fallar. El juego no termina nunca; tu puntuación es lo lejos que llegaste más los puntos de bonificación que recogiste.',
      'help.h.steer': '<kbd>Izquierda</kbd> / <kbd>Derecha</kbd> (o <kbd>A</kbd> / <kbd>D</kbd>) — deslízate de lado. Mantén para moverte. Tu vuelo es un zumbido grave cuyo tono y temblor crecen con tu velocidad, y se inclina hacia donde te mueves.',
      'help.h.hum': 'El centro de la abertura zumba. Cuando está justo al frente lo oyes centrado y brillante; cuando debes moverte, suena hacia ese lado. Se acelera hasta convertirse en un aleteo rápido cuando llegas al anillo.',
      'help.h.width': 'Cuando un anillo nuevo se convierte en tu objetivo, primero oyes barrer sus bordes izquierdo y derecho: dos clics separados significan una abertura ancha, dos clics juntos una estrecha. La abertura siempre se centra sobre un límite de carril.',
      'help.h.slam': 'Si fallas la abertura, chocas contra el muro, pierdes una vida y retrocedes para volver a enfrentar el mismo anillo. Tres vidas por partida.',
      'help.h.bonus': 'Cada nivel 10 es una caverna de bonificación. Los objetos susurran al tono de sus puntos: cuanto más agudo, más valen. Muévete sobre ellos para recogerlos.',
      'help.h.status': '<kbd>F1</kbd> puntos, distancia, bonus, vidas, nivel · <kbd>F2</kbd> distancia y la próxima abertura · <kbd>F3</kbd> velocidad, nivel, aberturas restantes.',
      'help.h.pause': '<kbd>Escape</kbd> — pausa.',
      'help.audio': 'Tu zumbido de vuelo se hace más agudo y tiembla más rápido cuando sube tu velocidad. El zumbido de la próxima abertura suena justo al frente cuando estás alineado y hacia un lado cuando debes moverte; sus bordes barren al convertirse en el objetivo. Un choque es un golpe metálico, un paso limpio es un silbido brillante.',
      'help.back': 'Atrás',

      'highscores.aria': 'Puntuaciones',
      'highscores.title': 'Puntuaciones',
      'highscores.subtitle': 'Tus mejores carreras en este dispositivo.',
      'highscores.empty': 'Aún no hay carreras. ¡Vuela!',
      'highscores.entry': '#{rank}. {name} — {score} puntos, {bonus} de bonus',
      'highscores.back': 'Atrás',

      'pause.aria': 'Pausa',
      'pause.title': 'Pausa',
      'pause.resume': 'Continuar',
      'pause.restart': 'Reiniciar carrera',
      'pause.menu': 'Menú principal',

      'gameover.aria': 'La carrera ha terminado',
      'gameover.title': 'La carrera ha terminado',
      'gameover.subtitle': 'Escribe tu nombre para guardar tu puntuación.',
      'gameover.score': 'Puntos: {score}',
      'gameover.name': 'Tu nombre',
      'gameover.save': 'Guardar',
      'gameover.continue': 'Continuar',
      'gameover.nameRequired': 'Escribe un nombre primero.',

      'learn.aria': 'Aprende los sonidos',
      'learn.title': 'Aprende los sonidos',
      'learn.subtitle': 'Reproduce cada señal por separado.',
      'learn.ringLeft': 'Abertura del anillo — a tu izquierda',
      'learn.ringCentre': 'Abertura del anillo — centrada (al frente)',
      'learn.ringRight': 'Abertura del anillo — a tu derecha',
      'learn.ringWide': 'Abertura del anillo — hueco ancho',
      'learn.hum': 'El zumbido — centrado, cerca',
      'learn.humOff': 'El zumbido — hacia un lado',
      'learn.pass': 'Atravesar una abertura',
      'learn.slam': 'Chocar contra el muro',
      'learn.levelUp': 'Subir de nivel',
      'learn.bonus': 'Comienza la caverna de bonificación',
      'learn.itemPing': 'Un objeto de bonificación, susurrando',
      'learn.itemCollect': 'Recoger un objeto de bonificación',
      'learn.dive': '¡Vamos! (inicio)',
      'learn.over': 'La carrera ha terminado',
      'learn.back': 'Atrás',

      'test.aria': 'Prueba de sonido estéreo',
      'test.title': 'Prueba de sonido estéreo',
      'test.subtitle': 'Confirma el paneo: izquierda es izquierda, derecha es derecha, centro es justo al frente.',
      'test.left': 'Sonar a la izquierda',
      'test.centre': 'Sonar al centro',
      'test.right': 'Sonar a la derecha',
      'test.sweep': 'Recorrer izquierda · centro · derecha',
      'test.ring': 'Anillo izquierda · centro · derecha · centro',
      'test.flight': 'El zumbido de vuelo (avance)',
      'test.back': 'Atrás',

      'online.posting': 'Enviando tu puntuación…',
      'online.rank': 'Puesto en línea: #{rank}',
      'online.error': 'No se pudo conectar con la clasificación. Guardado localmente.',
      'online.viewBoard': 'Ver la clasificación',

      'ann.ready': 'Listos. Tres.',
      'ann.two': 'Dos.',
      'ann.one': 'Uno.',
      'ann.dive': '¡Vamos!',
      'ann.pass': 'Abertura superada.',
      'ann.slam': '¡Choque! Quedan {lives} vidas.',
      'ann.levelUp': 'Nivel {level}.',
      'ann.bonusLevel': '¡Nivel {level}! ¡Caverna de bonificación!',
      'ann.bonusStart': '¡Caverna de bonificación! {count} objetos al frente.',
      'ann.bonusEnd': 'Caverna superada.',
      'ann.collect': '¡Bonus! {points} puntos. {count} en total.',
      'ann.gameOver': 'Fin de la carrera. {score} puntos, {distance} metros, nivel {level}.',
      'ann.gameOverHigh': 'Fin de la carrera. ¡Nuevo récord, {score} puntos!',
      'ann.status': 'Puntos {score}, {distance} metros, {bonusPoints} de bonus, {speed} metros por segundo, nivel {level}, {lives} vidas.',
      'ann.distance': 'Has recorrido {distance} metros.',
      'ann.target': 'Abertura {dir}, {width} metros de ancho, {dist} metros al frente, {prox}.',
      'ann.targetBonus': 'Caverna de bonificación: {dist} metros hasta el final, quedan {remaining} objetos, {prox}.',
      'ann.field': 'Vuelas a {speed} metros por segundo, nivel {level}, {rings} aberturas restantes este nivel.',
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
