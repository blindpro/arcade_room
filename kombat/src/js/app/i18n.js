/**
 * Lightweight i18n for KOMBAT. Shared implementation across the collection;
 * only STORAGE_KEY and the dictionaries differ.
 */
app.i18n = (() => {
  const FALLBACK = 'en'
  const STORAGE_KEY = 'kombat.lang'

  const localeNames = {
    en: 'English',
    es: 'Español',
  }

  const dictionaries = {
    en: {
      'doc.title': 'Kombat',

      // Menu
      'menu.aria': 'Main menu',
      'menu.title': 'Kombat',
      'menu.subtitle': 'An audio-first one-on-one fighter. Two fighters on a line and four attack buttons, arranged high/low against punch/kick. Every attack announces itself before it lands: the whoosh SWEEPS UP for a high attack, which you block, and SWEEPS DOWN for a low one, which you jump. Blocking a sweep does nothing and jumping a high attack is worse than standing still, so the whole fight is that one read, made over and over, faster each time.',
      'menu.start': 'Fight',
      'menu.help': 'How to play',
      'menu.learn': 'Learn the sounds',
      'menu.highscores': 'High scores',
      'menu.quit': 'Return to Games List',

      // Language picker
      'language.aria': 'Choose language',
      'language.title': 'Language',
      'language.subtitle': 'Choose the language used for menus and announcements.',
      'language.back': 'Back',
      'language.button': 'Language',

      // Character select
      'select.aria': 'Choose your fighter',
      'select.title': 'Choose your fighter',
      'select.subtitle': 'Everyone has the same four buttons. What changes is reach, speed, weight, and the one special you get.',
      'select.back': 'Back',
      'select.describe': '{name}. {blurb} Health {health}. Speed {speed} percent, reach {reach} percent, power {power} percent. Special: {special}, on {motion}, then {button}.',

      // The roster
      'fighter.rook': 'Rook',
      'fighter.vex': 'Vex',
      'fighter.sable': 'Sable',
      'fighter.kroll': 'Kroll',
      'blurb.rook': 'The wall. Slowest hands in the game, longest reach, hits like a truck.',
      'blurb.vex': 'The blade. Fast, short, light. Takes four turns while everyone else takes one.',
      'blurb.sable': 'The zoner. Even in every stat, and the only fighter with an answer from across the floor.',
      'blurb.kroll': 'The trickster. Quick and fragile, and the only one who can change which side of you they are on.',

      'special.quake': 'Quake',
      'special.rush': 'Rush Cut',
      'special.bolt': 'Frost Bolt',
      'special.shadow': 'Shadow Kick',
      'motion.forward': 'forward',
      'motion.back': 'back',

      // Game / HUD
      'game.aria': 'The arena',
      'hud.round': 'Round',
      'hud.health': 'Health',
      'hud.foeHealth': 'Their health',
      'hud.stage': 'Stage',
      'hud.score': 'Score',

      // Which side of you they are, and how far.
      'dir.left': 'to your left',
      'dir.right': 'to your right',
      'dir.onYou': 'right on top of you',
      'range.punch': 'inside punch range',
      'range.kick': 'inside kick range',
      'range.out': 'out of range',
      'range.far': 'right across the floor',

      // What they are doing.
      'stance.stand': 'on their feet',
      'stance.block': 'blocking',
      'stance.air': 'in the air',
      'stance.down': 'on the floor',

      // Announcements
      'ann.roundStart': 'Stage {stage}. Round {round} against {foe}.',
      'ann.fight': 'Fight!',
      'ann.knockedDown': 'Knocked down. {health} health left.',
      'ann.foeSpecial': '{name} charging!',
      'ann.roundWon': 'Round won. {you} to {them}.',
      'ann.perfect': 'Perfect round. {you} to {them}.',
      'ann.roundLost': 'Round lost. {you} to {them}.',
      'ann.timeWon': 'Time. You win it on health, {you} to {them}.',
      'ann.timeLost': 'Time. You lose it on health, {you} to {them}.',
      'ann.draw': 'Time. Draw - the round is replayed.',
      'ann.stageClear': '{foe} is down. Score {score}.',
      'ann.ladderWon': 'You have beaten the whole ladder. Final score {score}.',
      'ann.defeated': 'Defeated at stage {stage}. Final score {score}.',
      'ann.paused': 'Paused.',
      'ann.resumed': 'Resumed.',
      'ann.status': 'You {health}, them {foeHealth}. Round {round}, {you} to {them}. {clock} seconds. Stage {stage}, score {score}.',
      'ann.opponent': '{foe}, {side}, {range}, {stance}.',
      'ann.moves': '{fighter}. Special: {special} - {motion}, then {button}. {ready}',
      'ann.specialReady': 'Ready.',
      'ann.specialCooling': 'Ready in {secs} seconds.',
      'ann.scoreSaved': 'Score saved.',
      'ann.onlineRank': 'Ranked {rank} of {total} online.',
      'ann.onlineError': 'Could not reach the online board.',

      // Pause
      'pause.aria': 'Paused',
      'pause.title': 'Paused',
      'pause.resume': 'Resume',
      'pause.restart': 'Start again',
      'pause.menu': 'Main menu',

      // Game over
      'gameover.aria': 'Finish',
      'gameover.title': 'Finish',
      'gameover.subtitle': 'Enter your name to save your score.',
      'gameover.score': 'Score: {score}',
      'gameover.name': 'Your name',
      'gameover.nameRequired': 'Enter a name first.',
      'gameover.save': 'Save score',
      'gameover.continue': 'Continue',

      // How to play
      'help.aria': 'How to play',
      'help.title': 'How to play',
      'help.subtitle': 'Block the high ones. Jump the low ones.',
      'help.intro': 'You and one opponent stand on a line. There are four attack buttons and they form a square on your right hand: the TOP row is high, the BOTTOM row is low, the LEFT column is punches and the RIGHT column is kicks. Every attack tells you which one it is before it lands, and answering that correctly is the whole game.',
      'help.h.move': '<b>A</b> and <b>D</b> walk left and right. <b>W</b> jumps. <b>S</b> holds a block up. That is all the movement there is - spacing is a real weapon here, and walking out of range beats every attack in the game.',
      'help.h.attacks': '<b>U</b> high punch. <b>I</b> high kick. <b>J</b> low punch. <b>K</b> low kick. Punches are short, fast and cheap; kicks reach much further, hit much harder, and leave you standing there for a long time if they miss.',
      'help.h.triangle': '<b>A high attack is stopped by blocking</b> (hold S). <b>A low attack goes straight under a block</b> - the only answer is to jump it. Standing there doing neither loses to both, and each answer is wrong against the other attack, so nothing works twice in a row.',
      'help.h.tells': 'Every attack broadcasts a whoosh while it is winding up. It <b>sweeps UP for a high attack</b> and <b>DOWN for a low one</b>, from where the attacker is standing. When the sweep stops, the hit is live. A kick winds up slowly enough to react to; a punch does not, which is why punches are worth throwing at all.',
      'help.h.stereo': 'Your opponent hums continuously, panned to the side they are actually on, and their footsteps repeat faster the closer they get. Volume never means distance here - volume means how hard something just landed.',
      'help.h.air': 'When they jump, their hum <b>jumps an octave and turns bright</b>. That is your cue: a low attack is now wasted, and a high one catches them out of the air for 35 percent more damage and knocks them down.',
      'help.h.spacing': 'You will hear a swing at empty air (no weight behind it) differently from a sweep that passed under someone who jumped. Those are different mistakes: the first means get closer, the second means they read you.',
      'help.h.specials': 'Each fighter has one special on a direction sequence, then an attack button - for example back, back, then <b>K</b>. Press <b>F3</b> in a match to hear yours and whether it is off cooldown.',
      'help.h.rounds': 'First to two rounds takes the stage; beat all four fighters to clear the ladder. Sixty seconds a round, and on time-out the higher health wins.',
      'help.h.status': '<b>F1</b> reads the scoreboard. <b>F2</b> reads where your opponent is and what they are doing. <b>F3</b> reads your own special.',
      'help.h.pause': '<b>Escape</b> pauses.',
      'help.audio': 'Headphones are strongly recommended - which side your opponent is on is carried entirely in stereo, and Kroll can move from one side of you to the other in a single move.',
      'help.back': 'Back',

      // High scores
      'highscores.aria': 'High scores',
      'highscores.title': 'High scores',
      'highscores.subtitle': 'Your best runs on this device.',
      'highscores.empty': 'No scores yet.',
      'highscores.entry': '{rank}. {name} - {score} (stage {wave})',
      'highscores.back': 'Back',

      // Online board
      'online.posting': 'Submitting...',
      'online.rank': 'Ranked {rank} of {total} online.',
      'online.error': 'Could not reach the online board.',
      'online.viewBoard': 'View the online board',

      // Learn the sounds
      'learn.aria': 'Learn the sounds',
      'learn.title': 'Learn the sounds',
      'learn.subtitle': 'Play each cue on its own. The four tells at the top are the ones that decide matches.',
      'learn.tellHighPunch': 'TELL: high punch - short, sweeps UP. Block it.',
      'learn.tellHighKick': 'TELL: high kick - long, sweeps UP. Block it.',
      'learn.tellLowPunch': 'TELL: low punch - short, sweeps DOWN. Jump it.',
      'learn.tellLowKick': 'TELL: low kick - long, sweeps DOWN. Jump it.',
      'learn.presenceNear': 'Your opponent, right in front of you',
      'learn.presenceLeft': 'Your opponent, away to your left',
      'learn.presenceRight': 'Your opponent, away to your right',
      'learn.presenceAir': 'Your opponent IN THE AIR - bright, an octave up',
      'learn.hitHigh': 'A high attack landing',
      'learn.hitLow': 'A low attack landing',
      'learn.hitAir': 'Catching someone out of the air',
      'learn.blocked': 'A block - bright and metallic',
      'learn.whiff': 'A swing at empty air - you were out of range',
      'learn.jumpedOver': 'A sweep passing UNDER someone - they read you',
      'learn.jump': 'Jumping',
      'learn.land': 'Landing',
      'learn.knockdown': 'A knockdown',
      'learn.charge': 'A special charging',
      'learn.quake': 'Rook’s Quake - low, no range limit, JUMP it',
      'learn.bolt': 'Sable’s Frost Bolt closing on you',
      'learn.teleport': 'Kroll vanishing - they are about to change sides',
      'learn.corner': 'Backed into the wall',
      'learn.heartbeat': 'Your own heartbeat - nearly out of health',
      'learn.bell': 'The round bell',
      'learn.fight': 'Fight',
      'learn.koWin': 'Winning a round',
      'learn.koLose': 'Losing a round',
      'learn.back': 'Back',

      // Audio test
      'test.aria': 'Audio test',
      'test.title': 'Audio test',
      'test.subtitle': 'Stereo for position, sweep direction for level.',
      'test.left': 'Play far to the left',
      'test.centre': 'Play dead centre',
      'test.right': 'Play far to the right',
      'test.high': 'Play a HIGH tell',
      'test.low': 'Play a LOW tell',
      'test.sweep': 'Sweep left to right',
      'test.ladder': 'All four tells in order',
      'test.back': 'Back',
    },

    es: {
      'doc.title': 'Kombat',

      'menu.aria': 'Menú principal',
      'menu.title': 'Kombat',
      'menu.subtitle': 'Un juego de lucha uno contra uno hecho para el oído. Dos luchadores en una línea y cuatro botones de ataque, repartidos entre alto/bajo y puñetazo/patada. Todo ataque se anuncia antes de llegar: el silbido SUBE si el ataque es alto, y entonces se bloquea, y BAJA si es bajo, y entonces se salta. Bloquear una barrida no sirve de nada y saltar un ataque alto es peor que quedarse quieto, así que todo el combate es esa misma lectura, una y otra vez, cada vez más rápido.',
      'menu.start': 'Luchar',
      'menu.help': 'Cómo se juega',
      'menu.learn': 'Aprende los sonidos',
      'menu.highscores': 'Puntuaciones',
      'menu.quit': 'Volver a la lista de juegos',

      'language.aria': 'Elegir idioma',
      'language.title': 'Idioma',
      'language.subtitle': 'Elige el idioma de los menús y los anuncios.',
      'language.back': 'Atrás',
      'language.button': 'Idioma',

      'select.aria': 'Elige luchador',
      'select.title': 'Elige luchador',
      'select.subtitle': 'Todos tienen los mismos cuatro botones. Lo que cambia es el alcance, la velocidad, el peso y el especial que te toca.',
      'select.back': 'Atrás',
      'select.describe': '{name}. {blurb} Vida {health}. Velocidad {speed} por ciento, alcance {reach} por ciento, potencia {power} por ciento. Especial: {special}, con {motion}, y luego {button}.',

      'fighter.rook': 'Rook',
      'fighter.vex': 'Vex',
      'fighter.sable': 'Sable',
      'fighter.kroll': 'Kroll',
      'blurb.rook': 'El muro. Las manos más lentas del juego, el mayor alcance, y pega como un camión.',
      'blurb.vex': 'La cuchilla. Rápido, corto, ligero. Toma cuatro turnos mientras los demás toman uno.',
      'blurb.sable': 'El de la distancia. Media en todo, y el único con respuesta desde el otro extremo.',
      'blurb.kroll': 'El tramposo. Rápido y frágil, y el único que puede cambiar de lado.',

      'special.quake': 'Terremoto',
      'special.rush': 'Corte Veloz',
      'special.bolt': 'Rayo de Escarcha',
      'special.shadow': 'Patada Sombría',
      'motion.forward': 'adelante',
      'motion.back': 'atrás',

      'game.aria': 'El combate',
      'hud.round': 'Asalto',
      'hud.health': 'Vida',
      'hud.foeHealth': 'Su vida',
      'hud.stage': 'Fase',
      'hud.score': 'Puntos',

      'dir.left': 'a tu izquierda',
      'dir.right': 'a tu derecha',
      'dir.onYou': 'justo encima de ti',
      'range.punch': 'a distancia de puñetazo',
      'range.kick': 'a distancia de patada',
      'range.out': 'fuera de alcance',
      'range.far': 'al otro extremo',

      'stance.stand': 'de pie',
      'stance.block': 'bloqueando',
      'stance.air': 'en el aire',
      'stance.down': 'en el suelo',

      'ann.roundStart': 'Fase {stage}. Asalto {round} contra {foe}.',
      'ann.fight': '¡Luchad!',
      'ann.knockedDown': 'Derribado. Te quedan {health} de vida.',
      'ann.foeSpecial': '¡{name} cargando!',
      'ann.roundWon': 'Asalto ganado. {you} a {them}.',
      'ann.perfect': 'Asalto perfecto. {you} a {them}.',
      'ann.roundLost': 'Asalto perdido. {you} a {them}.',
      'ann.timeWon': 'Tiempo. Ganas por vida, {you} a {them}.',
      'ann.timeLost': 'Tiempo. Pierdes por vida, {you} a {them}.',
      'ann.draw': 'Tiempo. Empate: se repite el asalto.',
      'ann.stageClear': '{foe} ha caído. Puntos {score}.',
      'ann.ladderWon': 'Has vencido a todos. Puntuación final {score}.',
      'ann.defeated': 'Derrotado en la fase {stage}. Puntuación final {score}.',
      'ann.paused': 'En pausa.',
      'ann.resumed': 'Reanudado.',
      'ann.status': 'Tú {health}, él {foeHealth}. Asalto {round}, {you} a {them}. {clock} segundos. Fase {stage}, puntos {score}.',
      'ann.opponent': '{foe}, {side}, {range}, {stance}.',
      'ann.moves': '{fighter}. Especial: {special} - {motion}, y luego {button}. {ready}',
      'ann.specialReady': 'Listo.',
      'ann.specialCooling': 'Listo en {secs} segundos.',
      'ann.scoreSaved': 'Puntuación guardada.',
      'ann.onlineRank': 'Puesto {rank} de {total} en línea.',
      'ann.onlineError': 'No se pudo conectar con la tabla en línea.',

      'pause.aria': 'En pausa',
      'pause.title': 'En pausa',
      'pause.resume': 'Continuar',
      'pause.restart': 'Empezar de nuevo',
      'pause.menu': 'Menú principal',

      'gameover.aria': 'Fin',
      'gameover.title': 'Fin',
      'gameover.subtitle': 'Escribe tu nombre para guardar la puntuación.',
      'gameover.score': 'Puntos: {score}',
      'gameover.name': 'Tu nombre',
      'gameover.nameRequired': 'Escribe un nombre primero.',
      'gameover.save': 'Guardar',
      'gameover.continue': 'Continuar',

      'help.aria': 'Cómo se juega',
      'help.title': 'Cómo se juega',
      'help.subtitle': 'Bloquea los altos. Salta los bajos.',
      'help.intro': 'Tú y un rival estáis sobre una línea. Hay cuatro botones de ataque y forman un cuadrado bajo tu mano derecha: la fila de ARRIBA es alta, la de ABAJO es baja, la columna IZQUIERDA son puñetazos y la DERECHA patadas. Todo ataque avisa de cuál es antes de llegar, y responder bien a ese aviso es el juego entero.',
      'help.h.move': '<b>A</b> y <b>D</b> caminan a izquierda y derecha. <b>W</b> salta. <b>S</b> mantiene la guardia. No hay más movimiento: la distancia es un arma de verdad, y salirse de alcance derrota a cualquier ataque del juego.',
      'help.h.attacks': '<b>U</b> puñetazo alto. <b>I</b> patada alta. <b>J</b> puñetazo bajo. <b>K</b> patada baja. Los puñetazos son cortos, rápidos y baratos; las patadas llegan mucho más lejos, pegan mucho más fuerte, y te dejan plantado un buen rato si fallan.',
      'help.h.triangle': '<b>Un ataque alto se para bloqueando</b> (mantén S). <b>Un ataque bajo pasa por debajo de la guardia</b>: la única respuesta es saltarlo. Quedarse quieto pierde contra los dos, y cada respuesta es la equivocada contra el otro ataque, así que nada funciona dos veces seguidas.',
      'help.h.tells': 'Cada ataque emite un silbido mientras se prepara. <b>SUBE si es alto</b> y <b>BAJA si es bajo</b>, desde donde está el rival. Cuando el silbido termina, el golpe ya es real. Una patada se prepara despacio y da tiempo a reaccionar; un puñetazo no, y por eso vale la pena lanzarlos.',
      'help.h.stereo': 'Tu rival zumba continuamente, situado en el lado en el que de verdad está, y sus pasos se repiten más rápido cuanto más cerca llega. Aquí el volumen nunca significa distancia: significa la fuerza de lo que acaba de impactar.',
      'help.h.air': 'Cuando saltan, su zumbido <b>sube una octava y se vuelve brillante</b>. Esa es tu señal: un ataque bajo ya no sirve, y uno alto los caza en el aire con un 35 por ciento más de daño y los derriba.',
      'help.h.spacing': 'Un golpe al aire (sin peso detrás) suena distinto de una barrida que pasa bajo alguien que ha saltado. Son errores distintos: el primero significa acércate, el segundo significa que te han leído.',
      'help.h.specials': 'Cada luchador tiene un especial con una secuencia de direcciones y luego un botón de ataque; por ejemplo atrás, atrás y <b>K</b>. Pulsa <b>F3</b> en combate para oír el tuyo y si ya está disponible.',
      'help.h.rounds': 'El primero en ganar dos asaltos se lleva la fase; vence a los cuatro luchadores para completarlo todo. Sesenta segundos por asalto, y al agotarse gana quien tenga más vida.',
      'help.h.status': '<b>F1</b> lee el marcador. <b>F2</b> lee dónde está tu rival y qué hace. <b>F3</b> lee tu especial.',
      'help.h.pause': '<b>Escape</b> pausa.',
      'help.audio': 'Se recomiendan auriculares: el lado en el que está tu rival va enteramente en el estéreo, y Kroll puede pasar de un lado al otro en un solo movimiento.',
      'help.back': 'Atrás',

      'highscores.aria': 'Puntuaciones',
      'highscores.title': 'Puntuaciones',
      'highscores.subtitle': 'Tus mejores partidas en este dispositivo.',
      'highscores.empty': 'Aún no hay puntuaciones.',
      'highscores.entry': '{rank}. {name} - {score} (fase {wave})',
      'highscores.back': 'Atrás',

      'online.posting': 'Enviando...',
      'online.rank': 'Puesto {rank} de {total} en línea.',
      'online.error': 'No se pudo conectar con la tabla en línea.',
      'online.viewBoard': 'Ver la tabla en línea',

      'learn.aria': 'Aprende los sonidos',
      'learn.title': 'Aprende los sonidos',
      'learn.subtitle': 'Escucha cada sonido por separado. Los cuatro avisos de arriba son los que deciden los combates.',
      'learn.tellHighPunch': 'AVISO: puñetazo alto: corto, SUBE. Bloquéalo.',
      'learn.tellHighKick': 'AVISO: patada alta: larga, SUBE. Bloquéala.',
      'learn.tellLowPunch': 'AVISO: puñetazo bajo: corto, BAJA. Sáltalo.',
      'learn.tellLowKick': 'AVISO: patada baja: larga, BAJA. Sáltala.',
      'learn.presenceNear': 'Tu rival, justo delante de ti',
      'learn.presenceLeft': 'Tu rival, lejos a tu izquierda',
      'learn.presenceRight': 'Tu rival, lejos a tu derecha',
      'learn.presenceAir': 'Tu rival EN EL AIRE: brillante, una octava más alto',
      'learn.hitHigh': 'Un ataque alto impactando',
      'learn.hitLow': 'Un ataque bajo impactando',
      'learn.hitAir': 'Cazar a alguien en el aire',
      'learn.blocked': 'Un bloqueo: brillante y metálico',
      'learn.whiff': 'Un golpe al aire: estabas fuera de alcance',
      'learn.jumpedOver': 'Una barrida pasando POR DEBAJO: te han leído',
      'learn.jump': 'Saltar',
      'learn.land': 'Caer',
      'learn.knockdown': 'Un derribo',
      'learn.charge': 'Un especial cargando',
      'learn.quake': 'El Terremoto de Rook: bajo, sin límite de alcance, SÁLTALO',
      'learn.bolt': 'El Rayo de Escarcha de Sable acercándose',
      'learn.teleport': 'Kroll desapareciendo: va a cambiar de lado',
      'learn.corner': 'Acorralado contra la pared',
      'learn.heartbeat': 'Tu propio latido: casi sin vida',
      'learn.bell': 'La campana del asalto',
      'learn.fight': 'Luchad',
      'learn.koWin': 'Ganar un asalto',
      'learn.koLose': 'Perder un asalto',
      'learn.back': 'Atrás',

      'test.aria': 'Prueba de audio',
      'test.title': 'Prueba de audio',
      'test.subtitle': 'El estéreo da la posición; la dirección del barrido da la altura.',
      'test.left': 'Sonar lejos a la izquierda',
      'test.centre': 'Sonar en el centro',
      'test.right': 'Sonar lejos a la derecha',
      'test.high': 'Sonar un aviso ALTO',
      'test.low': 'Sonar un aviso BAJO',
      'test.sweep': 'Barrer de izquierda a derecha',
      'test.ladder': 'Los cuatro avisos en orden',
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
