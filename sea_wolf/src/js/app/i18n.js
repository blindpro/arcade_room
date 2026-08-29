/**
 * Lightweight i18n for SEA WOLF. Shared implementation across the collection;
 * only STORAGE_KEY and the dictionaries differ.
 */
app.i18n = (() => {
  const FALLBACK = 'en'
  const STORAGE_KEY = 'sea_wolf.lang'

  const localeNames = {
    en: 'English',
    es: 'Español',
  }

  const dictionaries = {
    en: {
      'doc.title': 'Sea Wolf',

      // Menu
      'menu.aria': 'Main menu',
      'menu.title': 'Sea Wolf',
      'menu.subtitle': 'An audio-first submarine hunt. You sit submerged in a shipping lane and convoys cross your bow. Passive sonar gives you every ship’s bearing; an active ping gives you its range, because the echo comes back later the further away it is. Fire ahead of the target, not at it — and remember the escorts can hear your ping too.',
      'menu.start': 'Start patrol',
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
      'game.aria': 'The patrol',
      'hud.score': 'Tonnage',
      'hud.torpedoes': 'Torpedoes',
      'hud.hull': 'Hull',
      'hud.battery': 'Battery',
      'hud.depth': 'Depth',
      'hud.time': 'Time',

      // Bearings. The arc is 90 degrees to port through dead ahead to
      // 90 degrees to starboard.
      'dir.ahead': 'dead ahead',
      'dir.port': '{deg} degrees to port',
      'dir.starboard': '{deg} degrees to starboard',
      'dir.leftOf': 'to port of your aim',
      'dir.rightOf': 'to starboard of your aim',

      // Depth states
      'depth.periscope': 'periscope',
      'depth.deep': 'deep',
      'depth.changing': 'changing',

      // Ship types
      'type.freighter': 'freighter',
      'type.tanker': 'tanker',
      'type.liner': 'liner',
      'type.escort': 'escort',

      // Help
      'help.aria': 'How to play',
      'help.title': 'How to play',
      'help.subtitle': 'Hear the bearing. Ping for the range. Fire ahead of it.',
      'help.intro': 'You are submerged in a shipping lane with twelve torpedoes and five minutes. Everything you hear sits on a forward half circle — ninety degrees to port on your left, dead ahead in the centre, ninety degrees to starboard on your right — so where a sound sits in the stereo field IS its bearing. Passive sonar runs constantly: every ship beats out its screw, low and slow for a loaded tanker, high and fast for an escort, quiet and dull when it is far away and loud and bright when it is close. That tells you the bearing of everything out there, and because the beat drifts across the field you can hear which way a ship is going. What it does not tell you is how far away it is. For that you PING: the transmit goes out, and each ship answers with a bright return — the further away it is, the later that return comes back. The delay is the range. But a ping is a shout in a quiet room, and the escorts hear it: ping too often and they turn toward you, close in, and start dropping depth charges. When you hear the splash and the long falling whistle, go DEEP, and come back up when it is quiet, because the tubes will not fire from down there and the battery only charges at periscope depth. To sink a ship, slew the periscope to where the ship will be when the torpedo arrives — a torpedo runs at 150 metres a second, so a ship a kilometre out is six seconds away and will have moved a long way in six seconds. Aim ahead of it. Your score is tonnage sunk.',
      'help.h.aim': '<kbd>Left</kbd> / <kbd>Right</kbd> (or <kbd>A</kbd> / <kbd>D</kbd>) — slew the periscope. Hold <kbd>Shift</kbd> for a fine bearing. The thin tone you always hear is your own aim: its pitch rises from left to right across the arc, and it clicks each time you sweep across a contact.',
      'help.h.fire': '<kbd>Space</kbd> — fire a torpedo on the current bearing. Four seconds to reload, twelve for the whole patrol, and the tubes will not fire while you are deep.',
      'help.h.ping': '<kbd>P</kbd> — active sonar. Each contact answers late in proportion to its range. The escorts hear it too.',
      'help.h.depth': '<kbd>Down</kbd> go deep — depth charges mostly miss you down there, but you cannot shoot and the battery drains. <kbd>Up</kbd> back to periscope depth.',
      'help.h.status': '<kbd>F1</kbd> the boat · <kbd>F2</kbd> the firing solution for whatever the periscope is on · <kbd>F3</kbd> every contact the passive set can hear.',
      'help.h.pause': '<kbd>Escape</kbd> — pause.',
      'help.audio': 'Headphones are strongly recommended. The whole game is bearing, and bearing is stereo.',
      'help.back': 'Back',

      // Learn the sounds
      'learn.aria': 'Learn the sounds',
      'learn.title': 'Learn the sounds',
      'learn.subtitle': 'Play each cue on its own.',
      'learn.humLeft': 'Screw beat — ship to port',
      'learn.humAhead': 'Screw beat — ship dead ahead',
      'learn.humRight': 'Screw beat — ship to starboard',
      'learn.humNear': 'Screw beat — ship close aboard',
      'learn.humTanker': 'Screw beat — a loaded tanker (low and slow)',
      'learn.humEscort': 'Screw beat — an escort (high and fast)',
      'learn.ping': 'Active ping, then two returns: one near, one far',
      'learn.cross': 'The periscope sweeping across a contact',
      'learn.fire': 'Firing a torpedo',
      'learn.run': 'A torpedo running away from you',
      'learn.hit': 'A hit, and the ship going down',
      'learn.spent': 'A torpedo running out of fuel',
      'learn.acquired': 'They have you',
      'learn.escortTurn': 'An escort turning toward you',
      'learn.splash': 'Depth charges in the water — dive!',
      'learn.detonateNear': 'A charge going off close — at periscope depth',
      'learn.detonateDeep': 'The same charge — from deep',
      'learn.diveDeep': 'Going deep',
      'learn.risePeriscope': 'Coming up to periscope depth',
      'learn.battery': 'Battery low',
      'learn.damage': 'Taking damage',
      'learn.klaxon': 'The klaxon — patrol begins',
      'learn.over': 'The patrol is over',
      'learn.back': 'Back',

      // Stereo test
      'test.aria': 'Stereo audio test',
      'test.title': 'Stereo audio test',
      'test.subtitle': 'Confirm the arc. Hard left is ninety degrees to port; centre is dead ahead.',
      'test.left': 'Play hard to port',
      'test.centre': 'Play dead ahead',
      'test.right': 'Play hard to starboard',
      'test.sweep': 'Sweep port to starboard',
      'test.ring': 'Sweep out and back',
      'test.back': 'Back',

      // Pause
      'pause.aria': 'Paused',
      'pause.title': 'Paused',
      'pause.resume': 'Resume',
      'pause.restart': 'Restart patrol',
      'pause.menu': 'Main menu',

      // Game over
      'gameover.aria': 'Patrol report',
      'gameover.title': 'The patrol is over',
      'gameover.subtitle': 'Enter your name to save your score.',
      'gameover.score': 'Tonnage sunk: {score}',
      'gameover.name': 'Your name',
      'gameover.save': 'Save score',
      'gameover.continue': 'Continue',

      // High scores
      'highscores.aria': 'High scores',
      'highscores.title': 'High scores',
      'highscores.subtitle': 'Your best patrols on this device.',
      'highscores.empty': 'No patrols recorded yet.',
      'highscores.entry': '{rank}. {name} — {score} tons ({sunk} sunk)',
      'highscores.back': 'Back',

      // Announcements
      'ann.ready': 'Rig for patrol. Diving in three.',
      'ann.two': 'Two.',
      'ann.one': 'One.',
      'ann.patrol': 'Patrol begins. Twelve torpedoes.',
      'ann.paused': 'Paused.',
      'ann.resumed': 'Resumed.',
      'ann.fired': 'Torpedo away, {bearing}. {remaining} left.',
      'ann.hit': 'Hit! {type} down, {tonnage} tons. {total} tons this patrol.',
      'ann.blocked.depth': 'Cannot fire from this depth.',
      'ann.blocked.reload': 'Tube still loading.',
      'ann.blocked.empty': 'No torpedoes left.',
      'ann.pingReport': '{count} contacts. Nearest: {type}, {bearing}, range {range} metres.',
      'ann.noContacts': 'No contacts.',
      'ann.contacts': '{count} contacts.',
      'ann.contactItem': '{type}, {bearing}, range {range}',
      'ann.solution': '{type}, {bearing}, range {range} metres. {off} degrees {side}. Torpedo run {flight} seconds; lead bearing {lead}.',
      'ann.noSolution': 'Periscope {bearing}. Nothing on this bearing.',
      'ann.acquired': 'They have us. Escorts turning.',
      'ann.lostContact': 'Contact lost. They are searching.',
      'ann.charges': 'Depth charges in the water!',
      'ann.damage': 'Hull damage. {hull} percent.',
      'ann.diving': 'Taking her deep.',
      'ann.surfacing': 'Coming up to periscope depth.',
      'ann.batteryLow': 'Battery low.',
      'ann.batteryDead': 'Battery dead. Forced to periscope depth.',
      'ann.timeLeft': '{time} seconds remaining.',
      'ann.status': '{tonnage} tons, {sunk} sunk. {torpedoes} torpedoes. Hull {hull} percent, battery {battery} percent, {depth} depth. {time} seconds left.',
      'ann.gameOver': 'Patrol over. {tonnage} tons, {sunk} ships sunk.',
      'ann.gameOverHigh': 'Patrol over. {score} tons — a high score!',
      'ann.scoreSaved': 'Score saved.',
      'ann.onlineRank': 'Online rank number {rank}.',
      'ann.onlineError': 'Leaderboard unavailable. Saved on this device.',
    },

    es: {
      'doc.title': 'Sea Wolf',

      'menu.aria': 'Menú principal',
      'menu.title': 'Sea Wolf',
      'menu.subtitle': 'Una caza submarina sonora. Estás sumergido en una ruta marítima y los convoyes cruzan tu proa. El sonar pasivo te da la demora de cada barco; un ping activo te da la distancia, porque el eco vuelve más tarde cuanto más lejos está. Dispara por delante del blanco, no hacia él, y recuerda que las escoltas también oyen tu ping.',
      'menu.start': 'Comenzar patrulla',
      'menu.help': 'Cómo jugar',
      'menu.highscores': 'Puntuaciones',
      'menu.learn': 'Aprende los sonidos',

      'language.aria': 'Elegir idioma',
      'language.title': 'Idioma',
      'language.subtitle': 'Elige el idioma de los menús y los anuncios.',
      'language.back': 'Atrás',
      'language.button': 'Idioma',
      'menu.quit': 'Volver a la lista de juegos',

      'game.aria': 'La patrulla',
      'hud.score': 'Tonelaje',
      'hud.torpedoes': 'Torpedos',
      'hud.hull': 'Casco',
      'hud.battery': 'Batería',
      'hud.depth': 'Profundidad',
      'hud.time': 'Tiempo',

      'dir.ahead': 'al frente',
      'dir.port': '{deg} grados a babor',
      'dir.starboard': '{deg} grados a estribor',
      'dir.leftOf': 'a babor de tu puntería',
      'dir.rightOf': 'a estribor de tu puntería',

      'depth.periscope': 'periscopio',
      'depth.deep': 'profunda',
      'depth.changing': 'cambiando',

      'type.freighter': 'carguero',
      'type.tanker': 'petrolero',
      'type.liner': 'transatlántico',
      'type.escort': 'escolta',

      'help.aria': 'Cómo jugar',
      'help.title': 'Cómo jugar',
      'help.subtitle': 'Oye la demora. Pinga para la distancia. Dispara por delante.',
      'help.intro': 'Estás sumergido en una ruta marítima con doce torpedos y cinco minutos. Todo lo que oyes está en un semicírculo frontal — noventa grados a babor a tu izquierda, al frente en el centro, noventa grados a estribor a tu derecha — así que dónde suena algo en el campo estéreo ES su demora. El sonar pasivo funciona siempre: cada barco marca su hélice, grave y lenta en un petrolero cargado, aguda y rápida en una escolta, apagada cuando está lejos y brillante cuando está cerca. Eso te da la demora de todo, y como el latido se desplaza por el campo puedes oír hacia dónde va cada barco. Lo que no te dice es a qué distancia está. Para eso PINGAS: sale la transmisión y cada barco responde con un eco brillante, y cuanto más lejos está, más tarde vuelve. El retardo es la distancia. Pero un ping es un grito en una sala en silencio y las escoltas lo oyen: pinga demasiado y virarán hacia ti, se acercarán y empezarán a soltar cargas de profundidad. Cuando oigas el chapoteo y el largo silbido descendente, baja a PROFUNDIDAD, y vuelve a subir cuando haya calma, porque los tubos no disparan ahí abajo y la batería solo carga a cota periscópica. Para hundir un barco, gira el periscopio hacia donde estará el barco cuando llegue el torpedo: un torpedo va a 150 metros por segundo, así que un barco a un kilómetro está a seis segundos y en seis segundos se habrá movido mucho. Apunta por delante. Tu puntuación es el tonelaje hundido.',
      'help.h.aim': '<kbd>Izquierda</kbd> / <kbd>Derecha</kbd> (o <kbd>A</kbd> / <kbd>D</kbd>) — gira el periscopio. Mantén <kbd>Mayús</kbd> para una demora fina. El tono fino que siempre oyes es tu propia puntería: su altura sube de izquierda a derecha, y hace clic cada vez que barres sobre un contacto.',
      'help.h.fire': '<kbd>Espacio</kbd> — lanza un torpedo en la demora actual. Cuatro segundos de recarga, doce en toda la patrulla, y los tubos no disparan en profundidad.',
      'help.h.ping': '<kbd>P</kbd> — sonar activo. Cada contacto responde con un retardo proporcional a su distancia. Las escoltas también lo oyen.',
      'help.h.depth': '<kbd>Abajo</kbd> ir a profundidad: las cargas casi siempre fallan ahí, pero no puedes disparar y la batería se agota. <kbd>Arriba</kbd> volver a cota periscópica.',
      'help.h.status': '<kbd>F1</kbd> el submarino · <kbd>F2</kbd> la solución de tiro del contacto apuntado · <kbd>F3</kbd> todos los contactos del sonar pasivo.',
      'help.h.pause': '<kbd>Escape</kbd> — pausa.',
      'help.audio': 'Se recomiendan auriculares. Todo el juego es demora, y la demora es estéreo.',
      'help.back': 'Atrás',

      'learn.aria': 'Aprende los sonidos',
      'learn.title': 'Aprende los sonidos',
      'learn.subtitle': 'Escucha cada señal por separado.',
      'learn.humLeft': 'Hélice — barco a babor',
      'learn.humAhead': 'Hélice — barco al frente',
      'learn.humRight': 'Hélice — barco a estribor',
      'learn.humNear': 'Hélice — barco muy cerca',
      'learn.humTanker': 'Hélice — petrolero cargado (grave y lento)',
      'learn.humEscort': 'Hélice — escolta (aguda y rápida)',
      'learn.ping': 'Ping activo y dos ecos: uno cerca, otro lejos',
      'learn.cross': 'El periscopio barriendo sobre un contacto',
      'learn.fire': 'Lanzar un torpedo',
      'learn.run': 'Un torpedo alejándose',
      'learn.hit': 'Un impacto, y el barco hundiéndose',
      'learn.spent': 'Un torpedo quedándose sin combustible',
      'learn.acquired': 'Te han detectado',
      'learn.escortTurn': 'Una escolta virando hacia ti',
      'learn.splash': 'Cargas de profundidad en el agua — ¡sumérgete!',
      'learn.detonateNear': 'Una carga cerca — a cota periscópica',
      'learn.detonateDeep': 'La misma carga — desde profundidad',
      'learn.diveDeep': 'Bajando a profundidad',
      'learn.risePeriscope': 'Subiendo a cota periscópica',
      'learn.battery': 'Batería baja',
      'learn.damage': 'Recibiendo daño',
      'learn.klaxon': 'La alarma — empieza la patrulla',
      'learn.over': 'La patrulla ha terminado',
      'learn.back': 'Atrás',

      'test.aria': 'Prueba de audio estéreo',
      'test.title': 'Prueba de audio estéreo',
      'test.subtitle': 'Confirma el arco. Todo a la izquierda son noventa grados a babor; el centro es al frente.',
      'test.left': 'Sonar todo a babor',
      'test.centre': 'Sonar al frente',
      'test.right': 'Sonar todo a estribor',
      'test.sweep': 'Barrido de babor a estribor',
      'test.ring': 'Barrido de ida y vuelta',
      'test.back': 'Atrás',

      'pause.aria': 'Pausa',
      'pause.title': 'Pausa',
      'pause.resume': 'Continuar',
      'pause.restart': 'Reiniciar patrulla',
      'pause.menu': 'Menú principal',

      'gameover.aria': 'Informe de patrulla',
      'gameover.title': 'La patrulla ha terminado',
      'gameover.subtitle': 'Escribe tu nombre para guardar la puntuación.',
      'gameover.score': 'Tonelaje hundido: {score}',
      'gameover.name': 'Tu nombre',
      'gameover.save': 'Guardar puntuación',
      'gameover.continue': 'Continuar',

      'highscores.aria': 'Puntuaciones',
      'highscores.title': 'Puntuaciones',
      'highscores.subtitle': 'Tus mejores patrullas en este dispositivo.',
      'highscores.empty': 'Aún no hay patrullas registradas.',
      'highscores.entry': '{rank}. {name} — {score} toneladas ({sunk} hundidos)',
      'highscores.back': 'Atrás',

      'ann.ready': 'Listos para patrullar. Inmersión en tres.',
      'ann.two': 'Dos.',
      'ann.one': 'Uno.',
      'ann.patrol': 'Comienza la patrulla. Doce torpedos.',
      'ann.paused': 'Pausa.',
      'ann.resumed': 'Reanudado.',
      'ann.fired': 'Torpedo lanzado, {bearing}. Quedan {remaining}.',
      'ann.hit': '¡Impacto! {type} hundido, {tonnage} toneladas. {total} toneladas en esta patrulla.',
      'ann.blocked.depth': 'No se puede disparar a esta profundidad.',
      'ann.blocked.reload': 'El tubo aún está cargando.',
      'ann.blocked.empty': 'No quedan torpedos.',
      'ann.pingReport': '{count} contactos. El más cercano: {type}, {bearing}, distancia {range} metros.',
      'ann.noContacts': 'Sin contactos.',
      'ann.contacts': '{count} contactos.',
      'ann.contactItem': '{type}, {bearing}, distancia {range}',
      'ann.solution': '{type}, {bearing}, distancia {range} metros. {off} grados {side}. Recorrido del torpedo {flight} segundos; demora de adelanto {lead}.',
      'ann.noSolution': 'Periscopio {bearing}. Nada en esta demora.',
      'ann.acquired': 'Nos han detectado. Escoltas virando.',
      'ann.lostContact': 'Contacto perdido. Están buscando.',
      'ann.charges': '¡Cargas de profundidad en el agua!',
      'ann.damage': 'Daño en el casco. {hull} por ciento.',
      'ann.diving': 'Bajando a profundidad.',
      'ann.surfacing': 'Subiendo a cota periscópica.',
      'ann.batteryLow': 'Batería baja.',
      'ann.batteryDead': 'Batería agotada. Forzados a cota periscópica.',
      'ann.timeLeft': 'Quedan {time} segundos.',
      'ann.status': '{tonnage} toneladas, {sunk} hundidos. {torpedoes} torpedos. Casco {hull} por ciento, batería {battery} por ciento, profundidad {depth}. Quedan {time} segundos.',
      'ann.gameOver': 'Patrulla terminada. {tonnage} toneladas, {sunk} barcos hundidos.',
      'ann.gameOverHigh': 'Patrulla terminada. {score} toneladas: ¡récord!',
      'ann.scoreSaved': 'Puntuación guardada.',
      'ann.onlineRank': 'Puesto en línea número {rank}.',
      'ann.onlineError': 'Clasificación no disponible. Guardado en este dispositivo.',
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
