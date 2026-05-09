/**
 * Lightweight i18n for accessible audio games.
 *
 * Resolution order on boot: localStorage(STORAGE_KEY) → navigator.language
 * 2-letter prefix → fallback ('en').
 *
 * Per-locale phrase pools — the Spanish strings are not literal translations
 * of the English ones. Each language is authored independently to read
 * naturally.
 */
app.i18n = (() => {
  const FALLBACK = 'en'
  const STORAGE_KEY = 'lander.lang'

  const localeNames = {
    en: 'English',
    es: 'Español',
  }

  const dictionaries = {
    en: {
      'doc.title': 'Lunar Lander',

      // Menu
      'menu.aria': 'Main menu',
      'menu.title': 'Lunar Lander',
      'menu.subtitle': 'An audio-first port of the GMA Lander tradition. Land on ten worlds with one button.',
      'menu.start': 'Begin tour',
      'menu.help': 'How to play',
      'menu.learn': 'Learn the sounds',
      'menu.test': 'Stereo test',
      'menu.highscores': 'High scores',

      // Language picker
      'language.aria': 'Choose language',
      'language.title': 'Language',
      'language.subtitle': 'Choose the language used for menus and announcements.',
      'language.back': 'Back',
      'language.button': 'Language',

      // Game HUD
      'game.aria': 'Descent in progress',
      'hud.altitude': 'Altitude {v} m',
      'hud.vy': 'Descent {v} m/s',
      'hud.fuel': 'Fuel {v}%',
      'hud.mission': 'World {n}: {body}',
      'hud.score': 'Score {v}',

      // Spoken hotkeys
      'hk.altitude': 'Altitude {v} metres.',
      'hk.vy': 'Descent rate {v} metres per second.',
      'hk.fuel': 'Fuel at {v} percent.',
      'hk.stats': '{body}. Gravity {gravity} metres per second squared. Thrust {thrust}. Crash speed {crash}. {terminal}.',
      'hk.terminalV': 'Terminal velocity {v} metres per second',
      'hk.vacuum': 'No atmosphere',
      'hk.help': 'Hold space to thrust. Tab toggles thrust. A altitude, F fuel, V velocity, S stats. Shift A, V, F, E toggle the monitor sounds.',

      // Monitor toggles
      'monitor.vel':       'velocity clicks',
      'monitor.alt':       'altitude tone',
      'monitor.fuel':      'fuel tone',
      'monitor.emergency': 'emergency alert',
      'monitor.on':  '{label} on.',
      'monitor.off': '{label} off.',

      // Announcer
      'ann.missionStart': 'World {n}, {body}. Gravity {gravity}, crash speed {crash}, fuel {fuel}.',
      'ann.altitude': 'Altitude {v}.',
      'ann.lowFuel': 'Low fuel.',
      'ann.criticalFuel': 'Critical fuel.',
      'ann.outOfFuel': 'Out of fuel.',
      'ann.rankUp': 'Promoted to {rank}.',
      'ann.gameOver': 'Mission failed. Final score {score}. {perfect} perfect, {clean} clean, {sloppy} sloppy.',
      'ann.gameOverHigh': 'Mission failed. New high score, {score}. {perfect} perfect, {clean} clean, {sloppy} sloppy.',
      'tier.perfect': 'Perfect landing.',
      'tier.clean':   'Clean landing.',
      'tier.sloppy':  'Sloppy landing.',
      'ann.help': 'Controls and audio cues. Press Escape to return.',
      'ann.learnHello': 'Press a button to hear each sound. Press Escape to return.',
      'ann.playing': 'Playing {label}.',
      'ann.scoreSaved': 'Score saved.',
      'ann.enterName': 'High score {score}. Enter your callsign.',
      'ann.highscoresEmpty': 'No scores yet.',
      'ann.highscoresList': 'Top pilots. {top}.',
      'ann.highscoresEntry': '{n}: {name}, {score}, world {mission}',
      'ann.onlineRank': 'Online rank: number {rank}.',
      'ann.onlineError': 'Could not reach the online leaderboard. Score saved locally.',

      // Online leaderboard
      'online.posting':   'Posting your score…',
      'online.rank':      'Online rank: #{rank}',
      'online.error':     'Couldn’t reach the leaderboard. Saved locally.',
      'online.viewBoard': 'View the world leaderboard',

      // Verdicts (i18n keys stored on lander state)
      'verdict.soft':    'Touchdown. Vertical {vy} metres per second.',
      'verdict.crashVy': 'Hit the surface too hard — {vy} metres per second.',

      // Body names
      'body.moon':     'the Moon',
      'body.europa':   'Europa',
      'body.mars':     'Mars',
      'body.mercury':  'Mercury',
      'body.titan':    'Titan',
      'body.ganymede': 'Ganymede',
      'body.io':       'Io',
      'body.venus':    'Venus',
      'body.saturn':   'the Saturn cloud deck',
      'body.jupiter':  'the Jupiter cloud deck',

      // Ranks
      'rank.cadet':     'Cadet',
      'rank.pilot':     'Pilot',
      'rank.commander': 'Commander',
      'rank.captain':   'Captain',
      'rank.admiral':   'Admiral',

      // Help
      'help.title': 'How to play',
      'help.controls': 'Controls',
      'help.controlThrust': '<kbd>Space</kbd> (hold) — fire thrusters.',
      'help.controlToggle': '<kbd>Tab</kbd> — toggle thrusters on or off.',
      'help.controlPause': '<kbd>Escape</kbd> — return to menu.',
      'help.cues': 'Audio cues',
      'help.cueClicks': 'Centred clicks accelerate as you fall faster. They stop when you are slow enough to land. A high tone replaces them when you climb back up — a sign you are wasting fuel.',
      'help.cueAlt': 'A tone in the left ear drops in pitch as you descend. Below thirty metres, the pitch resets and falls again, more steeply, so you can hear the last few metres clearly.',
      'help.cueFuel': 'A tone in the right ear drops in pitch as fuel burns. Below ten percent it resets and falls more steeply.',
      'help.cueEmergency': 'A siren just off centre warns that, at the current rate, the lander will crash. Apply thrust until it stops.',
      'help.hotkeys': 'Status keys',
      'help.hotkeyList': '<kbd>A</kbd> altitude, <kbd>F</kbd> fuel, <kbd>V</kbd> velocity, <kbd>S</kbd> world stats. <kbd>F1</kbd> repeats this summary.',
      'help.toggles': 'Toggle monitors',
      'help.toggleList': '<kbd>Shift+V</kbd> velocity clicks, <kbd>Shift+A</kbd> altitude tone, <kbd>Shift+F</kbd> fuel tone, <kbd>Shift+E</kbd> emergency siren.',

      // Test
      'test.title': 'Stereo test',
      'test.intro': 'Listen for left, centre, right.',
      'test.dirLeft': 'Left ear — altitude tone.',
      'test.dirCenter': 'Centre — velocity click.',
      'test.dirRight': 'Right ear — fuel tone.',
      'test.dirOffCenter': 'Just off centre — emergency siren.',
      'test.replay': 'Replay test',
      'test.back': 'Back',

      // Learn
      'learn.title': 'Learn the sounds',
      'learn.subtitle': 'Press a button to play each cue.',
      'learn.click':       'Velocity click',
      'learn.altTone':     'Altitude tone (left ear)',
      'learn.fuelTone':    'Fuel tone (right ear)',
      'learn.ascent':      'Ascending tone (you are rising)',
      'learn.emergency':   'Emergency siren',
      'learn.thrust':      'Thruster hiss',
      'learn.softLand':    'Soft landing',
      'learn.hardLand':    'Hard impact',
      'learn.fanfare':     'World fanfare',
      'learn.bonusTally':  'Bonus tally',
      'learn.gameOver':    'Game over',
      'learn.back':        'Back',

      // Game over
      'gameover.title': 'Mission failed',
      'gameover.score': 'Score: {v}',
      'gameover.mission': 'World: {n}, {body}',
      'gameover.rank': 'Rank: {rank}',
      'gameover.tiers': 'Landings: {perfect} perfect, {clean} clean, {sloppy} sloppy',
      'gameover.restart': 'New tour',
      'gameover.enterScore': 'Submit score',
      'gameover.save': 'Save score',
      'gameover.nameLabel': 'Your callsign',
      'gameover.nameRequired': 'Type a name to save your score.',
      'gameover.menu': 'Main menu',
      'gameover.highscores': 'High scores',

      // High score entry
      'highScoreEntry.title': 'New high score!',
      'highScoreEntry.subtitle': 'Enter your callsign.',
      'highScoreEntry.placeholder': 'Pilot',
      'highScoreEntry.submit': 'Submit',
      'highScoreEntry.cancel': 'Skip',

      // High scores list
      'highscores.title': 'Top pilots',
      'highscores.empty': 'No scores yet — be the first.',
      'highscores.entry': '{name} — {score} (world {mission})',
      'highscores.back': 'Back',
    },

    es: {
      'doc.title': 'Aterrizaje',

      'menu.aria': 'Menú principal',
      'menu.title': 'Aterrizaje',
      'menu.subtitle': 'Una versión sonora del clásico GMA Lander. Aterriza en diez mundos con una sola tecla.',
      'menu.start': 'Empezar la gira',
      'menu.help': 'Cómo jugar',
      'menu.learn': 'Aprender los sonidos',
      'menu.test': 'Prueba estéreo',
      'menu.highscores': 'Mejores puntuaciones',

      'language.aria': 'Elegir idioma',
      'language.title': 'Idioma',
      'language.subtitle': 'Elige el idioma para los menús y los anuncios.',
      'language.back': 'Atrás',
      'language.button': 'Idioma',

      'game.aria': 'Descenso en curso',
      'hud.altitude': 'Altitud {v} m',
      'hud.vy': 'Descenso {v} m/s',
      'hud.fuel': 'Combustible {v}%',
      'hud.mission': 'Mundo {n}: {body}',
      'hud.score': 'Puntuación {v}',

      'hk.altitude': 'Altitud {v} metros.',
      'hk.vy': 'Velocidad de descenso {v} metros por segundo.',
      'hk.fuel': 'Combustible al {v} por ciento.',
      'hk.stats': '{body}. Gravedad {gravity} metros por segundo al cuadrado. Empuje {thrust}. Velocidad de impacto {crash}. {terminal}.',
      'hk.terminalV': 'Velocidad terminal {v} metros por segundo',
      'hk.vacuum': 'Sin atmósfera',
      'hk.help': 'Mantén espacio para empuje. Tab alterna el motor. A altitud, F combustible, V velocidad, S datos del mundo. Mayúsculas A, V, F, E alternan los sonidos de monitor.',

      'monitor.vel':       'pulsos de velocidad',
      'monitor.alt':       'tono de altitud',
      'monitor.fuel':      'tono de combustible',
      'monitor.emergency': 'alarma de emergencia',
      'monitor.on':  '{label} activado.',
      'monitor.off': '{label} apagado.',

      'ann.missionStart': 'Mundo {n}, {body}. Gravedad {gravity}, velocidad de impacto {crash}, combustible {fuel}.',
      'ann.altitude': 'Altitud {v}.',
      'ann.lowFuel': 'Poco combustible.',
      'ann.criticalFuel': 'Combustible crítico.',
      'ann.outOfFuel': 'Sin combustible.',
      'ann.rankUp': 'Asciende a {rank}.',
      'ann.gameOver': 'Misión fallida. Puntuación final {score}. {perfect} perfectos, {clean} limpios, {sloppy} chapuceros.',
      'ann.gameOverHigh': 'Misión fallida. ¡Récord nuevo, {score}! {perfect} perfectos, {clean} limpios, {sloppy} chapuceros.',
      'tier.perfect': 'Aterrizaje perfecto.',
      'tier.clean':   'Aterrizaje limpio.',
      'tier.sloppy':  'Aterrizaje chapucero.',
      'ann.help': 'Controles y pistas sonoras. Pulsa Escape para volver.',
      'ann.learnHello': 'Pulsa un botón para escuchar cada sonido. Escape para volver.',
      'ann.playing': 'Sonando {label}.',
      'ann.scoreSaved': 'Puntuación guardada.',
      'ann.enterName': '¡Récord, {score}! Pon tu indicativo.',
      'ann.highscoresEmpty': 'Aún no hay puntuaciones.',
      'ann.highscoresList': 'Pilotos destacados. {top}.',
      'ann.highscoresEntry': '{n}: {name}, {score}, mundo {mission}',
      'ann.onlineRank': 'Puesto en línea: número {rank}.',
      'ann.onlineError': 'No se pudo conectar con el ránking en línea. Puntuación guardada localmente.',

      // Ránking online
      'online.posting':   'Enviando tu puntuación…',
      'online.rank':      'Puesto en línea: número {rank}',
      'online.error':     'No se pudo conectar con el ránking. Guardada localmente.',
      'online.viewBoard': 'Ver el ránking mundial',

      'verdict.soft':    'Aterrizaje. Velocidad vertical {vy} metros por segundo.',
      'verdict.crashVy': 'Impacto demasiado fuerte — {vy} metros por segundo.',

      'body.moon':     'la Luna',
      'body.europa':   'Europa',
      'body.mars':     'Marte',
      'body.mercury':  'Mercurio',
      'body.titan':    'Titán',
      'body.ganymede': 'Ganímedes',
      'body.io':       'Ío',
      'body.venus':    'Venus',
      'body.saturn':   'las nubes de Saturno',
      'body.jupiter':  'las nubes de Júpiter',

      'rank.cadet':     'Cadete',
      'rank.pilot':     'Piloto',
      'rank.commander': 'Comandante',
      'rank.captain':   'Capitán',
      'rank.admiral':   'Almirante',

      'help.title': 'Cómo jugar',
      'help.controls': 'Controles',
      'help.controlThrust': '<kbd>Espacio</kbd> (mantener) — encender motor.',
      'help.controlToggle': '<kbd>Tab</kbd> — alternar motor encendido o apagado.',
      'help.controlPause': '<kbd>Escape</kbd> — volver al menú.',
      'help.cues': 'Pistas sonoras',
      'help.cueClicks': 'En el centro suenan pulsos que aceleran al caer más rápido. Cuando vas suficientemente lento para aterrizar, se callan. Si subes en lugar de bajar, suenan un tono agudo en su lugar — señal de que malgastas combustible.',
      'help.cueAlt': 'En el oído izquierdo, un tono baja al descender. Por debajo de treinta metros, el tono salta otra vez al agudo y baja más rápido, para que oigas los últimos metros con claridad.',
      'help.cueFuel': 'En el oído derecho, un tono baja al consumirse el combustible. Por debajo del diez por ciento, salta al agudo y baja más rápido.',
      'help.cueEmergency': 'Una sirena, levemente desplazada del centro, avisa de que, a este ritmo, te estrellarás. Empuja hasta que se calle.',
      'help.hotkeys': 'Teclas de estado',
      'help.hotkeyList': '<kbd>A</kbd> altitud, <kbd>F</kbd> combustible, <kbd>V</kbd> velocidad, <kbd>S</kbd> datos del mundo. <kbd>F1</kbd> repite este resumen.',
      'help.toggles': 'Alternar monitores',
      'help.toggleList': '<kbd>May+V</kbd> pulsos, <kbd>May+A</kbd> altitud, <kbd>May+F</kbd> combustible, <kbd>May+E</kbd> alarma.',

      'test.title': 'Prueba estéreo',
      'test.intro': 'Escucha izquierda, centro, derecha.',
      'test.dirLeft': 'Oído izquierdo — tono de altitud.',
      'test.dirCenter': 'Centro — pulso de velocidad.',
      'test.dirRight': 'Oído derecho — tono de combustible.',
      'test.dirOffCenter': 'Levemente fuera del centro — sirena de emergencia.',
      'test.replay': 'Repetir',
      'test.back': 'Atrás',

      'learn.title': 'Aprender los sonidos',
      'learn.subtitle': 'Pulsa un botón para escuchar cada pista.',
      'learn.click':       'Pulso de velocidad',
      'learn.altTone':     'Tono de altitud (izquierda)',
      'learn.fuelTone':    'Tono de combustible (derecha)',
      'learn.ascent':      'Tono ascendente (estás subiendo)',
      'learn.emergency':   'Sirena de emergencia',
      'learn.thrust':      'Soplo del motor',
      'learn.softLand':    'Aterrizaje suave',
      'learn.hardLand':    'Impacto duro',
      'learn.fanfare':     'Fanfarria del mundo',
      'learn.bonusTally':  'Bonificación',
      'learn.gameOver':    'Fin de la misión',
      'learn.back':        'Atrás',

      'gameover.title': 'Misión fallida',
      'gameover.score': 'Puntuación: {v}',
      'gameover.mission': 'Mundo: {n}, {body}',
      'gameover.rank': 'Rango: {rank}',
      'gameover.tiers': 'Aterrizajes: {perfect} perfectos, {clean} limpios, {sloppy} chapuceros',
      'gameover.restart': 'Nueva gira',
      'gameover.enterScore': 'Guardar puntuación',
      'gameover.save': 'Guardar puntuación',
      'gameover.nameLabel': 'Tu indicativo',
      'gameover.nameRequired': 'Escribe un nombre para guardar tu puntuación.',
      'gameover.menu': 'Menú principal',
      'gameover.highscores': 'Mejores',

      'highScoreEntry.title': '¡Nuevo récord!',
      'highScoreEntry.subtitle': 'Escribe tu indicativo.',
      'highScoreEntry.placeholder': 'Piloto',
      'highScoreEntry.submit': 'Guardar',
      'highScoreEntry.cancel': 'Saltar',

      'highscores.title': 'Pilotos destacados',
      'highscores.empty': 'Aún no hay puntuaciones — sé el primero.',
      'highscores.entry': '{name} — {score} (mundo {mission})',
      'highscores.back': 'Atrás',
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
