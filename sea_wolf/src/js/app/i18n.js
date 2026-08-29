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
      'hud.heading': 'Heading',
      'hud.speed': 'Speed',
      'hud.time': 'Time',

      // Bearings. The arc is 90 degrees to port through dead ahead to
      // 90 degrees to starboard.
      'dir.ahead': 'dead ahead',
      'dir.astern': 'dead astern',
      'dir.port': '{deg} degrees to port',
      'dir.starboard': '{deg} degrees to starboard',
      'dir.leftOf': 'to port',
      'dir.rightOf': 'to starboard',

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
      'help.subtitle': 'Drive the boat. Turn until the beeps go high and fast. Fire ahead of the target.',
      'help.intro': 'You are driving a submarine around an open ocean with fourteen torpedoes and six minutes, and convoys are crossing it on their own courses. Your score is tonnage sunk. Everything you hear is placed BINAURALLY around the boat, so a ship is not merely to your left or right - it is ahead of you, or behind you, or off the quarter, and it moves through that field as you turn. The way you find one is the contact beep. Every ship you can hear beeps every so often, and two things about that beep matter. The GAP between beeps is the range: lazy and slow when a ship is at the edge of hearing, a fast flutter when it is right alongside. The PITCH is whether it is ahead of you or behind you: a bright high tone forward of the beam, dropping to a low tone the moment it slips astern. So you steer toward the beeps, and you know you are steering the right way because they speed up; if one drops to the low tone you have run past it and need to come about. Escorts beep on a harsher square wave, so a threat never sounds like a prize. Your own motor hums underneath all of it and its pitch tracks your speed, so you always know how fast you are going without looking. Speed is also noise: the faster you run the sooner the escorts find you, so closing on a convoy at flank speed is a decision rather than a free move. A ping gives you the range of everything precisely, because each ship answers later the further away it is, and it reaches far beyond the passive beeps - but it is a shout in a quiet room. When the escorts come you will hear one turn and open up, then the splash and the long falling whistle of depth charges: go deep, and come back up when it is quiet, because the tubes will not fire from down there and the battery only charges at periscope depth. To sink a ship, get the boat into position and fire ahead of the target: a torpedo runs at 145 metres a second, so a ship half a kilometre out is three and a half seconds away and will have moved. Aim at where it is going.',
      'help.h.helm': '<kbd>Left</kbd> / <kbd>Right</kbd> - rudder. <kbd>Up</kbd> / <kbd>Down</kbd> - throttle. The boat is heavy: it takes a moment to answer the helm, and it will barely turn at all when stopped.',
      'help.h.beeps': 'Every contact beeps. The GAP between beeps is the range - slow at the edge of hearing, a flutter alongside. The PITCH is ahead or astern: bright and high forward of the beam, dropping to a low tone the moment it slips behind you. Steer so the beeps get faster and stay high.',
      'help.h.scope': '<kbd>Q</kbd> / <kbd>E</kbd> - train the periscope up to 45 degrees either side of the bow; <kbd>R</kbd> centres it. Hold <kbd>Shift</kbd> for a fine bearing. The boat does the coarse aiming, the periscope does the fine.',
      'help.h.fire': '<kbd>Space</kbd> - fire a torpedo on the periscope bearing. Three and a half seconds to reload, fourteen for the whole patrol, and the tubes will not fire while you are deep.',
      'help.h.ping': '<kbd>P</kbd> - active sonar. Each contact answers late in proportion to its range, and it reaches far beyond the passive beeps. The escorts hear it too.',
      'help.h.depth': '<kbd>X</kbd> - dive deep or come back up. Depth charges mostly miss a deep boat, but you cannot shoot, you are slower, and the battery drains.',
      'help.h.status': '<kbd>F1</kbd> the boat - heading, speed, hull, battery. <kbd>F2</kbd> the firing solution for whatever the periscope is on. <kbd>F3</kbd> every contact you can hear.',
      'help.h.pause': '<kbd>Escape</kbd> — pause.',
      'help.audio': 'Headphones are strongly recommended, and this game needs them more than most: the whole thing is built on binaural placement, and front-versus-behind does not survive laptop speakers.',
      'help.back': 'Back',

      // Learn the sounds
      'learn.aria': 'Learn the sounds',
      'learn.title': 'Learn the sounds',
      'learn.subtitle': 'Play each cue on its own.',
      'learn.beepAhead': 'Contact beep - dead ahead',
      'learn.beepPort': 'Contact beep - off the port bow',
      'learn.beepStarboard': 'Contact beep - off the starboard bow',
      'learn.beepAstern': 'Contact beep - astern (the low tone)',
      'learn.beepFar': 'Contact beep - a long way off',
      'learn.beepNear': 'Contact beep - close aboard',
      'learn.beepClosing': 'Contact beep - closing (hear the rate ramp)',
      'learn.beepEscort': 'Contact beep - an escort',
      'learn.motorSlow': 'Your motor - ahead slow',
      'learn.motorFlank': 'Your motor - flank speed',
      'learn.closeAboard': 'A ship passing close aboard',
      'learn.ping': 'Active ping, then two returns',
      'learn.fire': 'Firing a torpedo',
      'learn.run': 'A torpedo running away from you',
      'learn.hit': 'A hit, and the ship going down',
      'learn.spent': 'A torpedo running out of fuel',
      'learn.acquired': 'They have you',
      'learn.escortTurn': 'An escort turning toward you',
      'learn.splash': 'Depth charges in the water - dive!',
      'learn.detonateNear': 'A charge going off close - at periscope depth',
      'learn.detonateDeep': 'The same charge - from deep',
      'learn.diveDeep': 'Going deep',
      'learn.risePeriscope': 'Coming up to periscope depth',
      'learn.battery': 'Battery low',
      'learn.damage': 'Taking damage',
      'learn.klaxon': 'The klaxon - patrol begins',
      'learn.over': 'The patrol is over',
      'learn.back': 'Back',

      // Stereo test
      'test.aria': 'Stereo audio test',
      'test.title': 'Binaural audio test',
      'test.subtitle': 'Confirm the field. Ahead, abeam, and astern should all sound like different places, not just different sides.',
      'test.ahead': 'Play dead ahead',
      'test.astern': 'Play dead astern',
      'test.left': 'Play abeam to port',
      'test.right': 'Play abeam to starboard',
      'test.sweep': 'Sweep ahead to astern',
      'test.ring': 'All the way round',
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
      'ann.patrol': 'Patrol begins. Fourteen torpedoes.',
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
      'ann.solution': '{type}, {bearing}, range {range} metres. Torpedo run {flight} seconds. Lead bearing {lead}: train {off} degrees {side}.',
      'ann.solutionTurn': '{type}, {bearing}, range {range} metres. Torpedo run {flight} seconds. Lead bearing {lead} is outside the periscope arc - turn the boat.',
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
      'ann.status': '{tonnage} tons, {sunk} sunk. {torpedoes} torpedoes. Heading {heading}, speed {speed} knots, {depth} depth. Hull {hull} percent, battery {battery} percent. {time} seconds left.',
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
      'hud.heading': 'Rumbo',
      'hud.speed': 'Velocidad',
      'hud.time': 'Tiempo',

      'dir.ahead': 'al frente',

      'dir.astern': 'por la popa',
      'dir.port': '{deg} grados a babor',
      'dir.starboard': '{deg} grados a estribor',
      'dir.leftOf': 'a babor',
      'dir.rightOf': 'a estribor',

      'depth.periscope': 'periscopio',
      'depth.deep': 'profunda',
      'depth.changing': 'cambiando',

      'type.freighter': 'carguero',
      'type.tanker': 'petrolero',
      'type.liner': 'transatlántico',
      'type.escort': 'escolta',

      'help.aria': 'Cómo jugar',
      'help.title': 'Cómo jugar',
      'help.subtitle': 'Gobierna el submarino. Vira hasta que los pitidos suban y se aceleren. Dispara por delante del blanco.',
      'help.intro': 'Gobiernas un submarino por mar abierto con catorce torpedos y seis minutos, y los convoyes lo cruzan con sus propios rumbos. Tu puntuacion es el tonelaje hundido. Todo lo que oyes esta situado de forma BINAURAL alrededor del submarino, asi que un barco no esta solo a tu izquierda o derecha: esta delante, detras o por la aleta, y se mueve por ese campo segun viras. La forma de encontrarlo es el pitido de contacto. Cada barco que puedes oir pita de vez en cuando, y dos cosas importan. El INTERVALO entre pitidos es la distancia: lento y perezoso cuando esta al limite del alcance, un aleteo rapido cuando esta al costado. La ALTURA dice si esta delante o detras: un tono agudo y brillante por delante del traves, que cae a un tono grave en cuanto pasa por la popa. Asi que gobiernas hacia los pitidos, y sabes que vas bien porque se aceleran; si uno cae al tono grave lo has dejado atras y hay que virar. Las escoltas pitan con una onda cuadrada mas aspera, para que una amenaza nunca suene como un premio. Tu propio motor zumba por debajo de todo esto y su altura sigue tu velocidad, asi que siempre sabes a que marcha vas. La velocidad tambien es ruido: cuanto mas rapido corres, antes te encuentran las escoltas, asi que acercarte a un convoy a toda maquina es una decision, no un movimiento gratis. Un ping te da la distancia exacta de todo, porque cada barco responde mas tarde cuanto mas lejos esta, y llega mucho mas lejos que los pitidos, pero es un grito en una sala en silencio. Cuando lleguen las escoltas oiras una virar y acelerar, luego el chapoteo y el largo silbido descendente de las cargas: baja a profundidad y vuelve a subir cuando haya calma, porque los tubos no disparan ahi abajo y la bateria solo carga a cota periscopica. Para hundir un barco, coloca el submarino y dispara por delante del blanco: un torpedo va a 145 metros por segundo, asi que un barco a medio kilometro esta a tres segundos y medio y se habra movido. Apunta a donde va.',
      'help.h.helm': '<kbd>Izquierda</kbd> / <kbd>Derecha</kbd> - timon. <kbd>Arriba</kbd> / <kbd>Abajo</kbd> - maquinas. El submarino es pesado: tarda en obedecer y casi no vira estando parado.',
      'help.h.beeps': 'Cada contacto pita. El INTERVALO entre pitidos es la distancia: lento al limite del alcance, un aleteo al costado. La ALTURA dice proa o popa: agudo y brillante por delante del traves, y cae a un tono grave en cuanto queda por la popa. Gobierna de modo que los pitidos se aceleren y se mantengan agudos.',
      'help.h.scope': '<kbd>Q</kbd> / <kbd>E</kbd> - orienta el periscopio hasta 45 grados a cada banda; <kbd>R</kbd> lo centra. Manten <kbd>Mayus</kbd> para una demora fina. El submarino apunta en grueso, el periscopio en fino.',
      'help.h.fire': '<kbd>Espacio</kbd> - lanza un torpedo en la demora del periscopio. Tres segundos y medio de recarga, catorce en toda la patrulla, y los tubos no disparan en profundidad.',
      'help.h.ping': '<kbd>P</kbd> - sonar activo. Cada contacto responde con un retardo proporcional a su distancia y llega mucho mas lejos que los pitidos pasivos. Las escoltas tambien lo oyen.',
      'help.h.depth': '<kbd>X</kbd> - sumergirse o volver a subir. Las cargas casi siempre fallan en profundidad, pero no puedes disparar, vas mas lento y la bateria se agota.',
      'help.h.status': '<kbd>F1</kbd> el submarino: rumbo, velocidad, casco, bateria. <kbd>F2</kbd> la solucion de tiro del contacto apuntado. <kbd>F3</kbd> todos los contactos que oyes.',
      'help.h.pause': '<kbd>Escape</kbd> — pausa.',
      'help.audio': 'Se recomiendan mucho los auriculares, y este juego los necesita mas que la mayoria: todo se basa en la colocacion binaural, y la diferencia entre delante y detras no sobrevive a los altavoces de un portatil.',
      'help.back': 'Atrás',

      'learn.aria': 'Aprende los sonidos',
      'learn.title': 'Aprende los sonidos',
      'learn.subtitle': 'Escucha cada señal por separado.',
      'learn.beepAhead': 'Pitido de contacto - por la proa',
      'learn.beepPort': 'Pitido de contacto - por la amura de babor',
      'learn.beepStarboard': 'Pitido de contacto - por la amura de estribor',
      'learn.beepAstern': 'Pitido de contacto - por la popa (el tono grave)',
      'learn.beepFar': 'Pitido de contacto - muy lejos',
      'learn.beepNear': 'Pitido de contacto - al costado',
      'learn.beepClosing': 'Pitido de contacto - acercandose (escucha la rampa)',
      'learn.beepEscort': 'Pitido de contacto - una escolta',
      'learn.motorSlow': 'Tu motor - avante poca',
      'learn.motorFlank': 'Tu motor - a toda maquina',
      'learn.closeAboard': 'Un barco pasando al costado',
      'learn.ping': 'Ping activo y dos ecos',
      'learn.fire': 'Lanzar un torpedo',
      'learn.run': 'Un torpedo alejandose',
      'learn.hit': 'Un impacto, y el barco hundiendose',
      'learn.spent': 'Un torpedo quedandose sin combustible',
      'learn.acquired': 'Te han detectado',
      'learn.escortTurn': 'Una escolta virando hacia ti',
      'learn.splash': 'Cargas de profundidad en el agua',
      'learn.detonateNear': 'Una carga cerca - a cota periscopica',
      'learn.detonateDeep': 'La misma carga - desde profundidad',
      'learn.diveDeep': 'Bajando a profundidad',
      'learn.risePeriscope': 'Subiendo a cota periscopica',
      'learn.battery': 'Bateria baja',
      'learn.damage': 'Recibiendo dano',
      'learn.klaxon': 'La alarma - empieza la patrulla',
      'learn.over': 'La patrulla ha terminado',
      'learn.back': 'Atrás',

      'test.aria': 'Prueba de audio estéreo',
      'test.title': 'Prueba de audio binaural',
      'test.subtitle': 'Confirma el campo. Proa, traves y popa deben sonar como sitios distintos, no solo como lados distintos.',
      'test.ahead': 'Sonar por la proa',
      'test.astern': 'Sonar por la popa',
      'test.left': 'Sonar por el traves de babor',
      'test.right': 'Sonar por el traves de estribor',
      'test.sweep': 'Barrido de proa a popa',
      'test.ring': 'Vuelta completa',
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
      'ann.patrol': 'Comienza la patrulla. Catorce torpedos.',
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
      'ann.solution': '{type}, {bearing}, distancia {range} metros. Recorrido del torpedo {flight} segundos. Demora de adelanto {lead}: gira {off} grados {side}.',
      'ann.solutionTurn': '{type}, {bearing}, distancia {range} metros. Recorrido del torpedo {flight} segundos. La demora de adelanto {lead} queda fuera del arco del periscopio: vira el submarino.',
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
      'ann.status': '{tonnage} toneladas, {sunk} hundidos. {torpedoes} torpedos. Rumbo {heading}, velocidad {speed} nudos, profundidad {depth}. Casco {hull} por ciento, bateria {battery} por ciento. Quedan {time} segundos.',
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
