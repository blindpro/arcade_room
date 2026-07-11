/**
 * Lightweight i18n for accessible audio games (canonical implementation).
 * Resolution on boot: localStorage(STORAGE_KEY) -> navigator.language prefix
 * -> 'en'. Annotate DOM with data-i18n / data-i18n-html / data-i18n-attr;
 * runtime strings via app.i18n.t('key', {param}). See template CLAUDE.md.
 */
app.i18n = (() => {
  const FALLBACK = 'en'
  const STORAGE_KEY = 'curb.lang'

  const localeNames = {
    en: 'English',
    es: 'Español',
  }

  const dictionaries = {
    en: {
      'doc.title': 'The Curb Game',

      'menu.aria': 'Main menu',
      'menu.title': 'The Curb Game',
      'menu.subtitle': 'Cross the road by ear.',
      'menu.start': 'Start',
      'menu.help': 'How to play',

      'game.aria': 'Crossing the road',
      'game.hint': 'Listen for traffic. Up and Down arrows to cross. Space to hear your score. Escape to quit.',
      'hud.score': 'Score',
      'hud.level': 'Level',
      'hud.best': 'Best',

      'gameover.aria': 'Game over',
      'gameover.title': 'Game over',
      'gameover.scored': 'You scored',
      'gameover.points': 'points',
      'gameover.again': 'Play again',
      'gameover.menu': 'Main menu',
      'gameover.newBest': 'New best score!',
      'gameover.best': 'Best: {best}',

      'help.aria': 'How to play',
      'help.title': 'How to play',
      'help.intro': 'You are a hedgehog crossing a busy road by ear.',
      'help.cross': 'Press <kbd>Up</kbd> to step toward the far curb and <kbd>Down</kbd> to step back. Reaching a curb scores <strong>100</strong>.',
      'help.listen': 'Each vehicle pans across the stereo field and grows louder as it nears the centre of the road. Cross while your lane is clear.',
      'help.score': 'Press <kbd>Space</kbd> any time to hear your score.',
      'help.idle': 'Dawdling in the road costs points, so keep moving.',
      'help.quit': 'Press <kbd>Escape</kbd> to return to the menu.',
      'help.back': 'Back',

      'language.aria': 'Choose language',
      'language.title': 'Language',
      'language.subtitle': 'Choose the language used for menus and announcements.',
      'language.back': 'Back',
      'language.button': 'Language',

      // Runtime announcements
      'ann.go': 'Go!',
      'ann.burp': 'Burp mode! Go!',
      'ann.level': 'Level {level}',
      'ann.score': 'Score: {score} points',
      'ann.noScore': 'No score',
      'ann.gameOver': 'Game over. You scored {score} points.',
      'ann.newBest': 'New best score!',
    },

    es: {
      'doc.title': 'El Juego del Bordillo',

      'menu.aria': 'Menú principal',
      'menu.title': 'El Juego del Bordillo',
      'menu.subtitle': 'Cruza la calle de oído.',
      'menu.start': 'Empezar',
      'menu.help': 'Cómo jugar',

      'game.aria': 'Cruzando la calle',
      'game.hint': 'Escucha el tráfico. Flechas arriba y abajo para cruzar. Espacio para oír tu puntuación. Escape para salir.',
      'hud.score': 'Puntos',
      'hud.level': 'Nivel',
      'hud.best': 'Mejor',

      'gameover.aria': 'Fin del juego',
      'gameover.title': 'Fin del juego',
      'gameover.scored': 'Conseguiste',
      'gameover.points': 'puntos',
      'gameover.again': 'Jugar otra vez',
      'gameover.menu': 'Menú principal',
      'gameover.newBest': '¡Nueva mejor puntuación!',
      'gameover.best': 'Mejor: {best}',

      'help.aria': 'Cómo jugar',
      'help.title': 'Cómo jugar',
      'help.intro': 'Eres un erizo que cruza una calle con mucho tráfico, guiándote por el oído.',
      'help.cross': 'Pulsa <kbd>Arriba</kbd> para avanzar hacia el bordillo opuesto y <kbd>Abajo</kbd> para retroceder. Llegar a un bordillo suma <strong>100</strong>.',
      'help.listen': 'Cada vehículo se desplaza por el campo estéreo y suena más fuerte al acercarse al centro de la calle. Cruza cuando tu carril esté libre.',
      'help.score': 'Pulsa <kbd>Espacio</kbd> en cualquier momento para oír tu puntuación.',
      'help.idle': 'Entretenerse en la calzada resta puntos, así que sigue moviéndote.',
      'help.quit': 'Pulsa <kbd>Escape</kbd> para volver al menú.',
      'help.back': 'Atrás',

      'language.aria': 'Elegir idioma',
      'language.title': 'Idioma',
      'language.subtitle': 'Elige el idioma para los menús y los anuncios.',
      'language.back': 'Atrás',
      'language.button': 'Idioma',

      'ann.go': '¡Ya!',
      'ann.burp': '¡Modo eructo! ¡Ya!',
      'ann.level': 'Nivel {level}',
      'ann.score': 'Puntos: {score}',
      'ann.noScore': 'Sin puntos',
      'ann.gameOver': 'Fin del juego. Conseguiste {score} puntos.',
      'ann.newBest': '¡Nueva mejor puntuación!',
    },
  }

  let current = FALLBACK
  const listeners = []

  function detect() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && dictionaries[stored]) return stored
    } catch (e) { /* localStorage may be blocked */ }
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
        const [attr, key] = pair.split(':').map((str) => str && str.trim())
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
